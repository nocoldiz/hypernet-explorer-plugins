//=============================================================================
// Diary.js
//=============================================================================
/*:
 * @plugindesc v1.0.0 The party diary: everything the party did, written down as it happens and kept in the world folder. (Logic)
 * @author Omni-Lex
 * @target MZ
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @param maxEntries
 * @text Maximum entries
 * @desc How many lines one diary holds before the oldest are dropped.
 * @type number
 * @min 500
 * @default 6000
 *
 * @param notableItemPrice
 * @text Notable find price
 * @desc An item picked up is only written down when it is worth at least this much (gold). Key items and artifacts always are.
 * @type number
 * @min 0
 * @default 800
 *
 * @command OpenDiary
 * @text Open Diary
 * @desc Opens the party diary.
 *
 * @command WriteDiaryLine
 * @text Write a line
 * @desc Writes a free line into the diary, in the party's own voice.
 *
 * @arg text
 * @text Text
 * @type string
 * @default
 *
 * @help
 * ==========================================================================
 * The Party Diary
 * ==========================================================================
 *
 * A diary is not a log. It is the record ONE party kept of its own life, and
 * it outlives that party: a permadeath run whose savegame is deleted leaves
 * its diary standing in the world folder, so a later playthrough of the same
 * world can read what the people before them did.
 *
 *   save/worlds/<world>/diary/<diaryId>.json
 *
 * One file per playthrough. The file carries who the party was, when it
 * started, where it was last seen and every line it wrote. Nothing in it is
 * stored as finished prose: a line is an i18n key plus its parameters, so a
 * diary written in English reads as Italian when the game is played in
 * Italian, exactly as the world history does.
 *
 * This file is the recorder. The book itself is DiaryUI.js.
 *
 * --------------------------------------------------------------------------
 * WHAT IS WATCHED
 * --------------------------------------------------------------------------
 * Journey
 *   fast travel departure (with the hour) and arrival (with the hour and how
 *   long the road took), landing on a planet from the star map, an SB-Bridge
 *   and an SB-Bohr bridge warp, touching down at a hand-authored landing site,
 *   walking into a named place for the first time, going down into a
 *   structure, changing dungeon floor.
 * Rest
 *   sleeping, waiting, cryogenic sleep (with the year it woke in).
 * Combat
 *   a fight won and what was in it, a boss felled, a petrodemon put down,
 *   fleeing, losing, an arena streak.
 * Party
 *   somebody joining or leaving, a death, a retirement and a recall, a level
 *   gained, a pet or a follower joining, a creature talked round, a birth, a
 *   mitosis split, a pregnancy beginning, an abandonment.
 * People
 *   a party member becoming a friend or an enemy of an NPC, a courtship, an
 *   evening with Eris and how it went, an NPC the party knew dying.
 * Health
 *   catching a disease and recovering from it, being caught in an outbreak,
 *   losing a body part (and the augment on it) in Blood and Oil, an augment
 *   fitted, field surgery, using the WC.
 * Belongings
 *   a notable find, an artifact gained or lost, buying and selling at a
 *   counter (as one line naming everything bought and where), a Stockbusters
 *   order, stealing something, what is left in a container, a property bought
 *   or sold, a room rented, a loan, a share trade.
 * Law
 *   a crime committed, a charge settled, going to trial, the verdict, prison.
 * Work and industry
 *   a shift worked, a crop sown and harvested, an animal bought and its
 *   produce collected, a hive harvested, a thing forged, cooked, brewed or
 *   distilled, something built or dismantled.
 * Knowledge
 *   a skill learned, a specialization tier reached, a technology researched,
 *   a quest accepted and completed, a creature entered in the bestiary, an
 *   alien species identified.
 * Diversions
 *   a minigame played and how it went, a television programme watched, a
 *   dream had.
 *
 * Deliberately NOT watched: ordinary conversation with an NPC, reading the
 * procedural description of a statue, a fossil or any other scenery, states
 * applied and lost, taking something back out of a container, and throwing
 * away or discarding an item.
 *
 * --------------------------------------------------------------------------
 * API
 * --------------------------------------------------------------------------
 *   window.Diary.record(kind, params, opts)   write a line
 *   window.Diary.entries()                    this party's lines
 *   window.Diary.describe(entry)              render one line, in the
 *                                             language the game is in now
 *   window.Diary.iconOf(entry)                its IconSet index
 *   window.Diary.flush()                      write the file now
 *   window.Diary.listForWorld(name)           every diary a world holds
 *   window.Diary.readDiary(world, id)         one of them, in full
 *
 * `kind` is the i18n key under Diary.entry (e.g. "shop.buy") and its own row
 * in the KINDS table below, which is what decides the icon and the category
 * it files under. Adding a kind means adding a row there and a sentence in
 * js/i18n/<lang>/plugins/Diary.json, nothing else.
 */

(() => {
    'use strict';

    const pluginName = "Diary";
    const params = PluginManager.parameters(pluginName);
    const MAX_ENTRIES = Number(params.maxEntries || 6000);
    const NOTABLE_PRICE = Number(params.notableItemPrice || 800);

    const T = window.T || ((k) => k);

    const fs = (typeof require !== 'undefined') ? require('fs') : null;
    const path = (typeof require !== 'undefined') ? require('path') : null;
    const isNwjs = !!(fs && path && Utils.isNwjs());

    const TIME_VAR = 114;

    //=========================================================================
    // The kinds of thing a diary records
    // -------------------------------------------------------------------------
    // One row per kind: the IconSet index it wears in the book and the category
    // it files under. The categories are the tabs the reader pages between, so
    // a kind with no row would be invisible: `kindMeta` falls back to the
    // "other" category and a plain quill rather than dropping the line.
    //=========================================================================

    const CAT = {
        JOURNEY:   'journey',
        REST:      'rest',
        COMBAT:    'combat',
        PARTY:     'party',
        PEOPLE:    'people',
        HEALTH:    'health',
        WEALTH:    'wealth',
        LAW:       'law',
        WORK:      'work',
        KNOWLEDGE: 'knowledge',
        LEISURE:   'leisure',
        WRITTEN:   'written',
        OTHER:     'other'
    };

    // Every category in the order the book pages through them.
    const CATEGORIES = [
        CAT.JOURNEY, CAT.REST, CAT.COMBAT, CAT.PARTY, CAT.PEOPLE, CAT.HEALTH,
        CAT.WEALTH, CAT.LAW, CAT.WORK, CAT.KNOWLEDGE, CAT.LEISURE, CAT.WRITTEN,
        CAT.OTHER
    ];

    const KINDS = {
        // Journey
        'travel.depart':      { icon: 110, cat: CAT.JOURNEY },
        'travel.arrive':      { icon: 190, cat: CAT.JOURNEY },
        'travel.refuel':      { icon: 227, cat: CAT.JOURNEY },
        'landing.planet':     { icon: 78,  cat: CAT.JOURNEY },
        'landing.site':       { icon: 151, cat: CAT.JOURNEY },
        'warp.system':        { icon: 158, cat: CAT.JOURNEY },
        'warp.galaxy':        { icon: 307, cat: CAT.JOURNEY },
        'warp.orbit':         { icon: 244, cat: CAT.JOURNEY },
        'place.entered':      { icon: 205, cat: CAT.JOURNEY },
        'structure.entered':  { icon: 212, cat: CAT.JOURNEY },
        'floor.changed':      { icon: 83,  cat: CAT.JOURNEY },

        // Rest
        'rest.sleep':         { icon: 11,  cat: CAT.REST },
        'rest.wait':          { icon: 220, cat: CAT.REST },
        'rest.cryo':          { icon: 65,  cat: CAT.REST },

        // Combat
        'battle.won':         { icon: 322, cat: CAT.COMBAT },
        'battle.boss':        { icon: 405, cat: CAT.COMBAT },
        'battle.petrodemon':  { icon: 71,  cat: CAT.COMBAT },
        'battle.fled':        { icon: 73,  cat: CAT.COMBAT },
        'battle.lost':        { icon: 1,   cat: CAT.COMBAT },
        'battle.lostAnon':    { icon: 1,   cat: CAT.COMBAT },
        'battle.arena':       { icon: 352, cat: CAT.COMBAT },

        // Party
        'party.join':         { icon: 87,  cat: CAT.PARTY },
        'party.leave':        { icon: 88,  cat: CAT.PARTY },
        'party.death':        { icon: 298, cat: CAT.PARTY },
        'party.retire':       { icon: 110, cat: CAT.PARTY },
        'party.recall':       { icon: 249, cat: CAT.PARTY },
        'party.level':        { icon: 145, cat: CAT.PARTY },
        'party.leader':       { icon: 411, cat: CAT.PARTY },
        'pet.join':           { icon: 292, cat: CAT.PARTY },
        'pet.follower':       { icon: 246, cat: CAT.PARTY },
        'pet.abandon':        { icon: 85,  cat: CAT.PARTY },
        'birth.pregnant':     { icon: 268, cat: CAT.PARTY },
        'birth.born':         { icon: 267, cat: CAT.PARTY },
        'birth.mitosis':      { icon: 307, cat: CAT.PARTY },

        // People
        'npc.friend':         { icon: 84,  cat: CAT.PEOPLE },
        'npc.enemy':          { icon: 85,  cat: CAT.PEOPLE },
        'npc.romance':        { icon: 148, cat: CAT.PEOPLE },
        'eris.date':          { icon: 149, cat: CAT.PEOPLE },
        'eris.dateEnd':       { icon: 86,  cat: CAT.PEOPLE },
        'faction.standing':   { icon: 129, cat: CAT.PEOPLE },

        // Health
        'health.disease':     { icon: 177, cat: CAT.HEALTH },
        'health.cured':       { icon: 181, cat: CAT.HEALTH },
        'health.epidemic':    { icon: 2,   cat: CAT.HEALTH },
        'health.partLost':    { icon: 6,   cat: CAT.HEALTH },
        'health.augmentLost': { icon: 16,  cat: CAT.HEALTH },
        'health.augmentFit':  { icon: 398, cat: CAT.HEALTH },
        'health.surgery':     { icon: 339, cat: CAT.HEALTH },
        'health.relief':      { icon: 67,  cat: CAT.HEALTH },

        // Belongings
        'item.found':         { icon: 210, cat: CAT.WEALTH },
        'item.artifactGot':   { icon: 165, cat: CAT.WEALTH },
        'item.artifactLost':  { icon: 71,  cat: CAT.WEALTH },
        'container.stored':   { icon: 211, cat: CAT.WEALTH },
        'shop.buy':           { icon: 209, cat: CAT.WEALTH },
        'shop.sell':          { icon: 191, cat: CAT.WEALTH },
        'shop.order':         { icon: 192, cat: CAT.WEALTH },
        'property.bought':    { icon: 195, cat: CAT.WEALTH },
        'property.sold':      { icon: 187, cat: CAT.WEALTH },
        'property.rented':    { icon: 212, cat: CAT.WEALTH },
        'bank.loan':          { icon: 188, cat: CAT.WEALTH },
        'bank.repaid':        { icon: 247, cat: CAT.WEALTH },
        'stock.trade':        { icon: 206, cat: CAT.WEALTH },
        'mail.sent':          { icon: 192, cat: CAT.WEALTH },
        'mail.dimension':     { icon: 193, cat: CAT.WEALTH },
        'mining.stripped':    { icon: 289, cat: CAT.WORK },

        // Law
        'crime.committed':    { icon: 282, cat: CAT.LAW },
        'crime.settled':      { icon: 247, cat: CAT.LAW },
        'steal.success':      { icon: 249, cat: CAT.LAW },
        'steal.caught':       { icon: 104, cat: CAT.LAW },
        'law.trial':          { icon: 206, cat: CAT.LAW },
        'law.verdict':        { icon: 221, cat: CAT.LAW },
        'law.prison':         { icon: 111, cat: CAT.LAW },

        // Work and industry
        'work.shift':         { icon: 216, cat: CAT.WORK },
        'farm.sown':          { icon: 185, cat: CAT.WORK },
        'farm.harvested':     { icon: 276, cat: CAT.WORK },
        'animal.bought':      { icon: 291, cat: CAT.WORK },
        'animal.produce':     { icon: 269, cat: CAT.WORK },
        'apiary.harvest':     { icon: 208, cat: CAT.WORK },
        'craft.forge':        { icon: 108, cat: CAT.WORK },
        'craft.cook':         { icon: 219, cat: CAT.WORK },
        'craft.alchemy':      { icon: 179, cat: CAT.WORK },
        'craft.brew':         { icon: 228, cat: CAT.WORK },
        'build.placed':       { icon: 217, cat: CAT.WORK },
        'build.dismantled':   { icon: 223, cat: CAT.WORK },

        // Knowledge
        'skill.learned':      { icon: 186, cat: CAT.KNOWLEDGE },
        'spec.tier':          { icon: 89,  cat: CAT.KNOWLEDGE },
        'tech.researched':    { icon: 359, cat: CAT.KNOWLEDGE },
        'quest.accepted':     { icon: 193, cat: CAT.KNOWLEDGE },
        'quest.completed':    { icon: 247, cat: CAT.KNOWLEDGE },
        'adventure.done':     { icon: 231, cat: CAT.KNOWLEDGE },
        'bestiary.found':     { icon: 189, cat: CAT.KNOWLEDGE },
        'alien.identified':   { icon: 281, cat: CAT.KNOWLEDGE },

        // Diversions
        'minigame.played':    { icon: 196, cat: CAT.LEISURE },
        'tv.watched':         { icon: 222, cat: CAT.LEISURE },
        'dream.had':          { icon: 307, cat: CAT.LEISURE },

        // The player's own hand
        'note':               { icon: 225, cat: CAT.WRITTEN }
    };

    // The kinds that read better as one sentence when several of them land in
    // the same minute: the names are gathered into a list and written out under
    // the plural phrasing named here.
    const GROUPED = {
        'item.found':      { name: 'item', count: 'count', into: 'items', many: 'Diary.entry.item.foundMany' },
        'item.artifactGot':{ name: 'item', count: null,    into: 'items', many: 'Diary.entry.item.artifactGotMany' },
        // A day of study is one sentence: whoever learned three spells learned
        // them together, wherever on the page the lines happened to fall.
        'skill.learned':   { name: 'skill', count: null, into: 'skills', many: 'Diary.entry.skill.learnedMany',
                             day: true, by: ['name'], join: 'and' }
    };

    // The day of the world calendar a moment falls on. The clock starts at
    // 10:00 on 1 Jan 2001, so the boundary is offset by those ten hours.
    function dayOf(minutes) {
        return Math.floor(((Number(minutes) || 0) + 600) / 1440);
    }

    function kindMeta(kind) {
        return KINDS[kind] || { icon: 225, cat: CAT.OTHER };
    }

    //=========================================================================
    // Time and place
    //=========================================================================

    function worldMinutes() {
        if (typeof $gameVariables === 'undefined' || !$gameVariables) return 0;
        return Number($gameVariables.value(TIME_VAR)) || 0;
    }

    function stamp(minutes) {
        const TDS = window.TimeDateSystem;
        if (TDS && TDS.getDateTimeFromMinutes) {
            try { return TDS.getDateTimeFromMinutes(minutes); } catch (e) { /* fall through */ }
        }
        return null;
    }

    // "HH:MM" for a moment on the world clock.
    function clockAt(minutes) {
        const dt = stamp(minutes);
        return dt ? dt.time24 : "";
    }

    // Where the party is standing, named the way every other record names it.
    function placeNow() {
        try {
            const WMT = window.WorldMapTransfer;
            if (WMT && WMT.locate && WMT.locationName && typeof $gamePlayer !== 'undefined' && $gamePlayer) {
                const name = WMT.locationName(WMT.locate($gamePlayer.x, $gamePlayer.y));
                if (name) return name;
            }
        } catch (e) { /* fall through to the map's own name */ }
        try {
            if (typeof $gameMap !== 'undefined' && $gameMap && $gameMap.displayName()) {
                return $gameMap.displayName();
            }
        } catch (e) { /* nowhere in particular */ }
        return "";
    }

    // The map the party is on, by its own display name. A shop is named by the
    // room it stands in, which is what "bought from" means to a reader.
    function mapNameNow() {
        try {
            if (typeof $gameMap !== 'undefined' && $gameMap) {
                const shown = $gameMap.displayName();
                if (shown) return shown;
            }
        } catch (e) { /* fall through */ }
        return placeNow();
    }

    //=========================================================================
    // Storage
    // -------------------------------------------------------------------------
    // A diary belongs to a playthrough, not to a savegame slot: the slot can be
    // reused and, under permadeath, the savegame is deleted outright while the
    // diary is meant to survive it. So each party mints an id of its own the
    // first time it writes anything, and that id is the file name.
    //=========================================================================

    const LS_PREFIX = "hyperdiary.";

    function worldName() {
        const WM = window.WorldManager;
        return (WM && WM.activeWorldName) || null;
    }

    function diaryDirFor(world) {
        if (!isNwjs || !world) return null;
        const base = path.dirname(process.mainModule.filename);
        return path.join(base, "save", "worlds", world, "diary");
    }

    function ensureDir(dir) {
        if (!dir) return false;
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            return true;
        } catch (e) {
            console.error("[Diary] could not make the diary folder", e);
            return false;
        }
    }

    function readDiaryFile(world, id) {
        if (isNwjs) {
            const dir = diaryDirFor(world);
            if (!dir) return null;
            const file = path.join(dir, id + ".json");
            if (!fs.existsSync(file)) return null;
            try {
                let text = fs.readFileSync(file, "utf8");
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                return JSON.parse(text);
            } catch (e) {
                console.error("[Diary] corrupted diary " + id, e);
                return null;
            }
        }
        try {
            const raw = localStorage.getItem(LS_PREFIX + world + "." + id);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeDiaryFile(world, id, data) {
        if (isNwjs) {
            const dir = diaryDirFor(world);
            if (!ensureDir(dir)) return false;
            try {
                fs.writeFileSync(path.join(dir, id + ".json"), JSON.stringify(data, null, 1), "utf8");
                return true;
            } catch (e) {
                console.error("[Diary] could not write the diary", e);
                return false;
            }
        }
        try {
            localStorage.setItem(LS_PREFIX + world + "." + id, JSON.stringify(data));
            const key = LS_PREFIX + "index." + world;
            const list = JSON.parse(localStorage.getItem(key) || "[]");
            if (!list.includes(id)) {
                list.push(id);
                localStorage.setItem(key, JSON.stringify(list));
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function listDiaryIds(world) {
        if (!world) return [];
        if (isNwjs) {
            const dir = diaryDirFor(world);
            if (!dir || !fs.existsSync(dir)) return [];
            try {
                return fs.readdirSync(dir)
                    .filter(f => f.toLowerCase().endsWith(".json"))
                    .map(f => f.replace(/\.json$/i, ""));
            } catch (e) {
                return [];
            }
        }
        try {
            return JSON.parse(localStorage.getItem(LS_PREFIX + "index." + world) || "[]");
        } catch (e) {
            return [];
        }
    }

    //=========================================================================
    // The Diary itself
    //=========================================================================

    const Diary = {
        _entries: null,     // this party's lines, in the order they were written
        _dirty: false,
        _flushTimer: null,
        _lastLine: "",      // dedupe guard: kind + a signature of the params
        _lastLineAt: -1,
        _suspend: 0,

        // ---- identity ------------------------------------------------------

        // The id this party's diary is filed under. Minted once and kept in the
        // savegame, so the diary follows the party rather than the slot.
        diaryId() {
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
            if (!$gameSystem._diaryId) {
                const when = Date.now().toString(36);
                const salt = Math.floor(Math.random() * 0xffffff).toString(36);
                $gameSystem._diaryId = "diary_" + when + "_" + salt;
            }
            return $gameSystem._diaryId;
        },

        // A diary is only kept for a real party. The title screen, the world
        // creation flow and the moments before a party exists have nobody to
        // keep one for.
        isActive() {
            return typeof $gameSystem !== 'undefined' && !!$gameSystem &&
                   typeof $gameParty !== 'undefined' && !!$gameParty &&
                   $gameParty.members().length > 0;
        },

        // ---- reading -------------------------------------------------------

        entries() {
            if (!this._entries) {
                this._entries = (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._diaryEntries) || [];
                if (typeof $gameSystem !== 'undefined' && $gameSystem) $gameSystem._diaryEntries = this._entries;
            }
            return this._entries;
        },

        categories() { return CATEGORIES.slice(); },

        // One line, rendered in whatever language the game is being read in.
        describe(entry) {
            if (!entry) return "";
            if (entry.k === 'note') return String((entry.p && entry.p.text) || "");
            const key = entry.g ? entry.g : ('Diary.entry.' + entry.k);
            const text = T(key, entry.p || {});
            if (entry.rep > 1) return T('Diary.fmt.repeat', { text, count: entry.rep });
            return text;
        },

        // Several lines written in the same minute, in the same place, about
        // the same kind of thing read as one line: a chestful of loot is one
        // sentence naming everything in it, not twenty sentences naming one
        // thing each. Purely a reading pass: what is stored is never touched.
        compact(entries) {
            const list = Array.isArray(entries) ? entries : [];
            const out = [];
            let run = null;

            const flush = () => {
                if (!run) return;
                if (run.members.length === 1) {
                    out.push(run.members[0]);
                } else if (run.rule) {
                    const pairs = new Map();
                    for (const e of run.members) {
                        const name = String((e.p && e.p[run.rule.name]) || "").trim();
                        if (!name) continue;
                        const qty = Math.max(1, Number((e.p && e.p[run.rule.count])) || 1);
                        pairs.set(name, (pairs.get(name) || 0) + qty);
                    }
                    const p = Object.assign({}, run.members[0].p || {});
                    p[run.rule.into] = itemList([...pairs.entries()]);
                    out.push({ k: run.key, t: run.members[0].t, w: run.members[0].w, p, g: run.rule.many });
                } else {
                    const first = run.members[0];
                    out.push(Object.assign({}, first, { rep: run.members.length }));
                }
                run = null;
            };

            // The kinds gathered over a whole day are pulled out first: their
            // lines need not sit next to one another to be read as one.
            const daily = new Map();
            for (const entry of list) {
                if (!entry) continue;
                const rule = GROUPED[entry.k];
                if (!rule || !rule.day) continue;
                const sig = [entry.k, dayOf(entry.t)]
                    .concat((rule.by || []).map(f => String((entry.p && entry.p[f]) || "")))
                    .join("|");
                if (!daily.has(sig)) daily.set(sig, []);
                daily.get(sig).push(entry);
            }
            const written = new Set();

            for (const entry of list) {
                if (!entry) continue;
                const rule = GROUPED[entry.k] || null;
                if (rule && rule.day) {
                    const sig = [entry.k, dayOf(entry.t)]
                        .concat((rule.by || []).map(f => String((entry.p && entry.p[f]) || "")))
                        .join("|");
                    if (written.has(sig)) continue;
                    written.add(sig);
                    flush();
                    const members = daily.get(sig) || [entry];
                    if (members.length === 1) { out.push(members[0]); continue; }
                    const names = [];
                    for (const e of members) {
                        const name = String((e.p && e.p[rule.name]) || "").trim();
                        if (name && !names.includes(name)) names.push(name);
                    }
                    const p = Object.assign({}, members[0].p || {});
                    p[rule.into] = rule.join === 'and' ? joinNames(names) : itemList(names.map(n => [n, 1]));
                    out.push({ k: entry.k, t: members[0].t, w: members[0].w, p, g: rule.many });
                    continue;
                }
                const sig = rule
                    ? entry.k + "|" + entry.t + "|" + (entry.w || "")
                    : entry.k + "|" + entry.t + "|" + (entry.w || "") + "|" + this.describe(entry);
                if (run && run.sig === sig) {
                    run.members.push(entry);
                    continue;
                }
                flush();
                run = { sig, key: entry.k, rule, members: [entry] };
            }
            flush();
            return out;
        },

        iconOf(entry) { return entry ? kindMeta(entry.k).icon : 225; },
        categoryOf(entry) { return entry ? kindMeta(entry.k).cat : CAT.OTHER; },

        // ---- writing -------------------------------------------------------

        // Nothing is written while this is up. Bulk grants (a starting kit, a
        // world being initialised) would otherwise fill a page before the party
        // has taken a step.
        suspend() { this._suspend++; },
        resume() { this._suspend = Math.max(0, this._suspend - 1); },

        record(kind, entryParams, opts) {
            try {
                if (this._suspend > 0 || !this.isActive()) return null;
                opts = opts || {};
                const at = (opts.at != null) ? Number(opts.at) : worldMinutes();
                const p = Object.assign({}, entryParams || {});

                // A line that repeats itself within the same in-game minute is
                // the same event reaching this twice, not two events.
                const signature = kind + "|" + (opts.dedupe != null ? opts.dedupe : JSON.stringify(p));
                if (signature === this._lastLine && at === this._lastLineAt) return null;
                this._lastLine = signature;
                this._lastLineAt = at;

                const entry = { t: at, k: kind, p };
                const where = (opts.place !== undefined) ? opts.place : placeNow();
                if (where) entry.w = where;
                if (opts.who) entry.a = String(opts.who);

                const list = this.entries();
                list.push(entry);
                if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);

                this.markDirty();
                return entry;
            } catch (e) {
                console.error("[Diary] failed to write a line (" + kind + ")", e);
                return null;
            }
        },

        // The player's own hand: a line they wrote themselves, filed under the
        // written category and flushed straight away so it survives whatever
        // happens next. Returns the entry, or null if there was nothing to write.
        write(text, opts) {
            const line = String(text == null ? "" : text).trim();
            if (!line) return null;
            const entry = this.record('note', { text: line },
                Object.assign({ dedupe: line + "|" + Date.now() }, opts || {}));
            if (entry) this.flush();
            return entry;
        },

        markDirty() {
            this._dirty = true;
            if (this._flushTimer) return;
            // A diary is meant to survive the party dying, so it is written out
            // shortly after the ink is dry rather than at the next save.
            this._flushTimer = setTimeout(() => {
                this._flushTimer = null;
                this.flush();
            }, 4000);
        },

        // ---- persistence ---------------------------------------------------

        header() {
            const members = ($gameParty ? $gameParty.members() : []).map(a => ({
                name: a.name(),
                level: a.level,
                cls: (a.currentClass && a.currentClass()) ? a.currentClass().name : ""
            }));
            let slot = 0;
            try {
                slot = ($gameSystem && $gameSystem.savefileId) ? Number($gameSystem.savefileId()) || 0 : 0;
            } catch (e) { slot = 0; }
            let where = "";
            try { where = placeNow(); } catch (e) { where = ""; }
            return {
                id: this.diaryId(),
                world: worldName() || "",
                slot,
                party: members,
                startedAt: ($gameSystem && $gameSystem._diaryStarted) || null,
                lastMinute: worldMinutes(),
                lastPlace: where,
                writtenAt: Date.now(),
                version: 1
            };
        },

        flush() {
            try {
                if (!this._dirty) return;
                const world = worldName();
                const id = this.diaryId();
                if (!world || !id) return;   // sandbox play: kept in the session only
                const data = this.header();
                data.entries = this.entries();
                if (writeDiaryFile(world, id, data)) this._dirty = false;
            } catch (e) {
                console.error("[Diary] flush failed", e);
            }
        },

        // ---- other people's diaries ---------------------------------------

        // Every diary a world holds, newest first, headers only. The world
        // manager reads this without loading a savegame.
        listForWorld(name) {
            const out = [];
            for (const id of listDiaryIds(name)) {
                const data = readDiaryFile(name, id);
                if (!data) continue;
                out.push({
                    id,
                    world: name,
                    slot: data.slot || 0,
                    party: data.party || [],
                    startedAt: data.startedAt || null,
                    lastMinute: data.lastMinute || 0,
                    lastPlace: data.lastPlace || "",
                    writtenAt: data.writtenAt || 0,
                    count: (data.entries || []).length
                });
            }
            out.sort((a, b) => (b.writtenAt || 0) - (a.writtenAt || 0));
            return out;
        },

        readDiary(name, id) { return readDiaryFile(name, id); },

        // The diary the party being played is writing, as a readable record,
        // so the book draws an open playthrough and a closed one the same way.
        currentDiary() {
            const data = this.header();
            data.entries = this.entries();
            return data;
        },

        clockAt,
        stampAt: stamp,
        worldMinutes,
        placeNow,
        KINDS,
        CATEGORIES
    };

    window.Diary = Diary;

    // A helper the hooks below all reach for, so a hook can never be the thing
    // that breaks the system it is watching.
    function log(kind, p, opts) { return Diary.record(kind, p, opts); }

    function nameOf(actor) {
        try { return actor && actor.name ? actor.name() : String(actor || ""); }
        catch (e) { return ""; }
    }

    // Money is shown as euros everywhere in this game (gold / 100).
    function money(gold) {
        const n = Number(gold) || 0;
        if (window.MoneyFormatter && window.MoneyFormatter.format) {
            try { return window.MoneyFormatter.format(n); } catch (e) { /* fall through */ }
        }
        return (n / 100).toFixed(2) + "€";
    }

    // "Pickaxe x3, Health Potion x2, Potion, Saber, Cat Food x99": a single
    // copy is named on its own, more than one carries the count.
    function itemList(pairs) {
        return pairs.map(([name, qty]) => (qty > 1 ? T('Diary.fmt.itemCount', { name, count: qty }) : name)).join(", ");
    }

    // "A, B and C": a written list, so a line naming several things reads as a
    // sentence rather than as a comma separated dump.
    function joinNames(names) {
        const kept = (names || []).map(n => String(n || "").trim()).filter(Boolean);
        if (kept.length === 0) return "";
        if (kept.length === 1) return kept[0];
        const last = kept.pop();
        return T('Diary.fmt.and', { a: kept.join(", "), b: last });
    }

    // Everything the party was fighting, counted, whether it died or not. What
    // felled us is never on the list of what we felled, so a lost battle has to
    // read the troop itself to be able to name anybody at all.
    function troopNames() {
        try {
            if (typeof $gameTroop === 'undefined' || !$gameTroop) return "";
            const counts = new Map();
            for (const enemy of $gameTroop.members()) {
                if (!enemy) continue;
                let name = "";
                try { name = enemy.originalName ? enemy.originalName() : (enemy.enemy() || {}).name; }
                catch (e) { name = ""; }
                if (!name) continue;
                counts.set(name, (counts.get(name) || 0) + 1);
            }
            return joinNames([...counts.entries()].map(([name, qty]) =>
                qty > 1 ? T('Diary.fmt.itemCount', { name, count: qty }) : name));
        } catch (e) { return ""; }
    }

    // A tally kept while a counter is open, drained into one line on the way out.
    function tallyAdd(tally, name, qty) {
        if (!name) return;
        tally.set(name, (tally.get(name) || 0) + (Number(qty) || 0));
    }

    function tallyText(tally) {
        return itemList([...tally.entries()]);
    }

    //=========================================================================
    // Safe hook helpers
    //=========================================================================

    // Wraps a method that may or may not exist, without ever letting the diary
    // change what it returns or whether it throws.
    function after(obj, name, fn) {
        if (!obj || typeof obj[name] !== 'function') return false;
        const original = obj[name];
        obj[name] = function (...args) {
            const result = original.apply(this, args);
            try { fn.call(this, result, args); } catch (e) { console.error("[Diary] hook " + name, e); }
            return result;
        };
        return true;
    }

    function before(obj, name, fn) {
        if (!obj || typeof obj[name] !== 'function') return false;
        const original = obj[name];
        obj[name] = function (...args) {
            try { fn.call(this, args); } catch (e) { console.error("[Diary] hook " + name, e); }
            return original.apply(this, args);
        };
        return true;
    }

    // A hook onto a plugin that loads after this one, or not at all. Retried on
    // a short schedule and then given up on, so a missing plugin costs nothing.
    const _pending = [];
    function whenReady(test, install) {
        if (test()) { try { install(); } catch (e) { console.error("[Diary] install", e); } return; }
        _pending.push({ test, install, tries: 0 });
    }
    function drainPending() {
        for (let i = _pending.length - 1; i >= 0; i--) {
            const job = _pending[i];
            job.tries++;
            let ready = false;
            try { ready = !!job.test(); } catch (e) { ready = false; }
            if (ready) {
                _pending.splice(i, 1);
                try { job.install(); } catch (e) { console.error("[Diary] install", e); }
            } else if (job.tries > 40) {
                _pending.splice(i, 1);   // the plugin is not in this build
            }
        }
    }

    //=========================================================================
    // 1. Rest: sleeping, waiting, the cryogenic pod
    //=========================================================================

    whenReady(() => typeof Scene_Map !== 'undefined' && Scene_Map.prototype._beginSleepAdvance,
        () => {
            before(Scene_Map.prototype, '_beginSleepAdvance', function (args) {
                const hours = Number(args[0]) || 0;
                const isWait = !!args[1];
                const from = worldMinutes();
                const to = from + hours * 60;
                log(isWait ? 'rest.wait' : 'rest.sleep', {
                    hours,
                    from: clockAt(from),
                    to: clockAt(to),
                    place: placeNow()
                });
            });
        });

    whenReady(() => typeof Scene_Map !== 'undefined' && Scene_Map.prototype.startCryoSequence,
        () => {
            before(Scene_Map.prototype, 'startCryoSequence', function (args) {
                const minutes = Number(args[0]) || 0;
                const from = worldMinutes();
                const wake = stamp(from + minutes);
                log('rest.cryo', {
                    from: clockAt(from),
                    date: wake ? wake.fullDate : "",
                    year: wake ? wake.year : "",
                    place: placeNow()
                });
            });
        });

    //=========================================================================
    // 2. Journey: fast travel, the star map, structures, floors
    //=========================================================================

    whenReady(() => typeof Game_System !== 'undefined' && Game_System.prototype.startTravelTimer,
        () => {
            before(Game_System.prototype, 'startTravelTimer', function (args) {
                const destination = String(args[2] || "");
                if (!destination) return;
                const at = worldMinutes();
                this._diaryTripFrom = placeNow();
                this._diaryTripAt = at;
                this._diaryTripTo = destination;
                log('travel.depart', {
                    from: this._diaryTripFrom,
                    to: destination,
                    transport: String(args[1] || ""),
                    km: Math.round(Number(args[3]) || 0),
                    time: clockAt(at)
                });
            });

            after(Game_System.prototype, 'completeTravelTimer', function () {
                const to = this._diaryTripTo;
                if (!to) return;
                const at = worldMinutes();
                const spent = Math.max(0, at - (this._diaryTripAt || at));
                log('travel.arrive', {
                    to,
                    from: this._diaryTripFrom || "",
                    time: clockAt(at),
                    hours: Math.round(spent / 60),
                    minutes: spent % 60
                }, { place: to });
                this._diaryTripTo = null;
            });
        });

    whenReady(() => window.GalaxySim && window.GalaxySim.enterPlanetSurface,
        () => {
            const GS = window.GalaxySim;
            const _enter = GS.enterPlanetSurface;
            GS.enterPlanetSurface = function (planet, opts) {
                const ok = _enter.apply(this, arguments);
                try {
                    if (ok && planet) {
                        const ship = ($gameSystem && $gameSystem.starMapData && $gameSystem.starMapData.playerShip) || null;
                        log('landing.planet', {
                            planet: planet.name || "",
                            system: (ship && ship.currentSystem) || "",
                            time: clockAt(worldMinutes())
                        }, { place: planet.name || "" });
                    }
                } catch (e) { /* the landing still happened */ }
                return ok;
            };

            const _site = GS.teleportToLandingSite;
            if (typeof _site === 'function') {
                GS.teleportToLandingSite = function (loc) {
                    const ok = _site.apply(this, arguments);
                    try {
                        if (ok && loc) {
                            log('landing.site', {
                                place: loc.name || "",
                                time: clockAt(worldMinutes())
                            }, { place: loc.name || "" });
                        }
                    } catch (e) { /* the landing still happened */ }
                    return ok;
                };
            }
        });

    // The SB-Bridge and the SB-Bohr bridge: a jump that crosses a galaxy in one
    // move is not the same event as flying there, and the diary says which.
    whenReady(() => window.GalaxySim && window.GalaxySim.DataManager && window.GalaxySim.DataManager.prototype,
        () => {
            const proto = window.GalaxySim.DataManager.prototype;

            // Which galaxy a system belongs to. A jump inside the Milky Way is
            // one thing; a jump that leaves it is another, and the diary says
            // which galaxy the party came out in.
            function galaxyOf(dm, systemName) {
                try {
                    const sys = dm && dm.getSystem ? dm.getSystem(systemName) : null;
                    return (sys && sys.galaxy) ? String(sys.galaxy) : "";
                } catch (e) { return ""; }
            }

            before(proto, 'teleportToSystem', function (args) {
                this._diaryGalaxyBefore = galaxyOf(this, this.playerShip && this.playerShip.currentSystem);
            });
            after(proto, 'teleportToSystem', function (ok, args) {
                if (!ok) return;
                const system = String(args[0] || "");
                const to = galaxyOf(this, system);
                const from = this._diaryGalaxyBefore || "";
                const time = clockAt(worldMinutes());
                if (to && to !== from) log('warp.galaxy', { system, galaxy: to, from: from || "", time });
                else log('warp.system', { system, time });
            });
            after(proto, 'teleportToPlanetOrbit', function (ok, args) {
                if (ok) log('warp.orbit', { system: String(args[0] || ""), planet: String(args[1] || ""), time: clockAt(worldMinutes()) });
            });
        });

    // Filling a tank. Every path that puts fuel in goes through VehicleFuel.set
    // and every path that burns it goes the same way, so a RISE of a litre or
    // more is a refuel however it was paid for.
    whenReady(() => window.VehicleFuel && window.VehicleFuel.set,
        () => {
            const VF = window.VehicleFuel;
            before(VF, 'set', function (args) {
                this._diaryFuelBefore = VF.usesFuel(args[0]) ? VF.get(args[0]) : null;
            });
            after(VF, 'set', function (result, args) {
                const key = args[0];
                const was = this._diaryFuelBefore;
                if (was === null || was === undefined) return;
                const now = VF.get(key);
                if (now - was < 1) return;
                log('travel.refuel', {
                    vehicle: T('Diary.vehicle.' + key),
                    litres: (now - was).toFixed(1),
                    place: mapNameNow()
                });
            });
        });

    // Taking an asteroid apart. Mining runs a second at a time, so only the
    // moment the body is stripped out is written down, not every pass.
    whenReady(() => window.GalaxySim && window.GalaxySim.Mining && window.GalaxySim.Mining.tick,
        () => {
            after(window.GalaxySim.Mining, 'tick', function (out, args) {
                if (!out || !out.depleted || !out.ok) return;
                const body = args[1];
                log('mining.stripped', {
                    body: (body && (body.name || body.type)) || "",
                    system: String(args[0] || "")
                });
            });
        });

    // Walking into somewhere with a name. A world square is entered over and
    // over, so only the first arrival of each is written down.
    function noteArrival() {
        try {
            if (!Diary.isActive()) return;
            const WMT = window.WorldMapTransfer;
            if (!WMT || !WMT.locate) return;
            const loc = WMT.locate($gamePlayer.x, $gamePlayer.y);
            const name = WMT.locationName ? WMT.locationName(loc) : "";
            if (!name) return;

            const seen = ($gameSystem._diarySeenPlaces ||= {});
            const structure = loc && loc.interior ? String(loc.interior) : "";
            const key = structure ? (name + "|" + structure) : name;
            if (seen[key]) return;
            seen[key] = 1;

            if (structure && window.ProcGenDungeon && window.ProcGenDungeon.isStructure &&
                window.ProcGenDungeon.isStructure(structure)) {
                log('structure.entered', { place: name, time: clockAt(worldMinutes()) }, { dedupe: key });
            } else {
                log('place.entered', { place: name, time: clockAt(worldMinutes()) }, { dedupe: key });
            }
        } catch (e) { /* arriving somewhere is not worth an error */ }
    }

    whenReady(() => typeof Scene_Map !== 'undefined' && Scene_Map.prototype.onMapLoaded,
        () => { after(Scene_Map.prototype, 'onMapLoaded', function () { noteArrival(); }); });

    // Dungeon floors: variable 1 is the floor the party is standing on.
    let _lastFloor = null;
    function watchFloor() {
        try {
            if (typeof $gameVariables === 'undefined' || !$gameVariables) return;
            const floor = Number($gameVariables.value(1)) || 0;
            if (floor === _lastFloor) return;
            const previous = _lastFloor;
            _lastFloor = floor;
            if (previous === null || floor === 0) return;
            log('floor.changed', { floor, place: placeNow() });
        } catch (e) { /* nothing */ }
    }

    //=========================================================================
    // 3. Combat
    //=========================================================================

    whenReady(() => typeof BattleManager !== 'undefined',
        () => {
            before(BattleManager, 'startBattle', function () {
                this._diaryFelled = [];
            });

            after(BattleManager, 'processVictory', function () {
                const felled = this._diaryFelled || [];
                const names = felled.length ? joinNames(felled) : troopNames();
                const rewards = this._rewards || {};
                log('battle.won', {
                    enemies: names,
                    exp: Math.round(rewards.exp || 0),
                    gold: money(rewards.gold || 0)
                });
            });

            after(BattleManager, 'processDefeat', function () {
                const names = troopNames();
                if (names) log('battle.lost', { enemies: names });
                else log('battle.lostAnon', { place: placeNow() });
            });

            after(BattleManager, 'processEscape', function (ok) {
                if (ok !== false) log('battle.fled', { place: placeNow() });
            });
        });

    whenReady(() => typeof Game_Enemy !== 'undefined' && Game_Enemy.prototype.die,
        () => {
            after(Game_Enemy.prototype, 'die', function () {
                try {
                    const data = this.enemy();
                    if (!data) return;
                    const name = this.originalName ? this.originalName() : data.name;
                    if (typeof BattleManager !== 'undefined' && BattleManager._diaryFelled) {
                        if (!BattleManager._diaryFelled.includes(name)) BattleManager._diaryFelled.push(name);
                    }
                    const note = data.note || "";
                    if (data._bsePetrodemon) {
                        log('battle.petrodemon', { name, level: this.level || 0 });
                    } else if (/<Boss>/i.test(note)) {
                        log('battle.boss', { name, level: this.level || 0 });
                    }
                } catch (e) { /* the creature still died */ }
            });
        });

    //=========================================================================
    // 4. The party: who is in it, and what happens to them
    //=========================================================================

    whenReady(() => typeof Game_Party !== 'undefined' && Game_Party.prototype.addActor,
        () => {
            before(Game_Party.prototype, 'addActor', function (args) {
                const id = Number(args[0]);
                if (!this._actors || this._actors.includes(id)) return;
                const actor = $gameActors && $gameActors.actor(id);
                if (!actor) return;
                // The first party a savegame ever builds is character creation,
                // not a recruitment, and it opens the diary rather than filling
                // it. The suspension around creation covers that.
                log('party.join', {
                    name: nameOf(actor),
                    cls: (actor.currentClass && actor.currentClass()) ? actor.currentClass().name : "",
                    level: actor.level || 1
                }, { who: nameOf(actor) });
            });

            before(Game_Party.prototype, 'removeActor', function (args) {
                const id = Number(args[0]);
                if (!this._actors || !this._actors.includes(id)) return;
                const actor = $gameActors && $gameActors.actor(id);
                if (!actor) return;
                // A death and a retirement announce themselves through their own
                // hooks a moment earlier, and set this so the parting is not
                // written down twice.
                if ($gameTemp && $gameTemp._diaryPartingHandled === id) {
                    $gameTemp._diaryPartingHandled = null;
                    return;
                }
                log('party.leave', { name: nameOf(actor) }, { who: nameOf(actor) });
            });
        });

    whenReady(() => typeof Game_Actor !== 'undefined' && Game_Actor.prototype.levelUp,
        () => {
            after(Game_Actor.prototype, 'levelUp', function () {
                if (!$gameParty || !$gameParty.members().includes(this)) return;
                log('party.level', { name: nameOf(this), level: this.level }, { who: nameOf(this) });
            });
        });

    whenReady(() => window.PartyRoster && window.PartyRoster.recordDeath,
        () => {
            before(window.PartyRoster, 'recordDeath', function (args) {
                const actor = args[0];
                if (!actor) return;
                if ($gameTemp) $gameTemp._diaryPartingHandled = actor.actorId ? actor.actorId() : null;
                log('party.death', {
                    name: nameOf(actor),
                    level: actor.level || 0,
                    place: placeNow()
                }, { who: nameOf(actor) });
            });
        });

    whenReady(() => window.CharacterPresets && window.CharacterPresets.retirePartyMember,
        () => {
            const CP = window.CharacterPresets;
            before(CP, 'retirePartyMember', function (args) {
                const actor = $gameActors && $gameActors.actor(Number(args[0]));
                if (!actor) return;
                if ($gameTemp) $gameTemp._diaryPartingHandled = actor.actorId();
                log('party.retire', { name: nameOf(actor), place: placeNow() }, { who: nameOf(actor) });
            });
            after(CP, 'unretirePartyMember', function (ok, args) {
                if (ok === false) return;
                log('party.recall', { id: String(args[0] || "") });
            });
        });

    whenReady(() => window.PartyRoster && window.PartyRoster.setLeader,
        () => {
            after(window.PartyRoster, 'setLeader', function (ok, args) {
                const actor = $gameActors && $gameActors.actor(Number(args[0]));
                if (actor) log('party.leader', { name: nameOf(actor) }, { who: nameOf(actor) });
            });
        });

    //=========================================================================
    // 5. Pets, followers and offspring
    //=========================================================================

    whenReady(() => window.PetSystem && window.PetSystem.recruitPet,
        () => {
            const PS = window.PetSystem;
            after(PS, 'recruitPet', function (rec, args) {
                const record = rec || args[0] || {};
                const name = record.name || "";
                if (!name) return;
                // A creature that came along of its own accord is a follower;
                // one taken in is a pet. `<Talk>` is what tells them apart.
                const follower = !!record.isFollower || !!record.canTalk;
                log(follower ? 'pet.follower' : 'pet.join', { name, kind: record.species || record.kind || "" });
            });

            after(PS, 'birthChild', function (child, args) {
                const parent = args[0];
                log('birth.born', {
                    parent: nameOf(parent),
                    child: (child && child.name) || ""
                }, { who: nameOf(parent) });
            });

            after(PS, 'mitosisSplit', function (copy, args) {
                const parent = args[0];
                log('birth.mitosis', {
                    name: nameOf(parent),
                    copy: (copy && (copy.name || (copy.name && copy.name()))) || ""
                }, { who: nameOf(parent) });
            });

            before(PS, 'abandonPet', function (args) {
                const id = args[0];
                const found = PS.getPet ? PS.getPet(id) : null;
                log('pet.abandon', { name: (found && found.name) || "", place: placeNow() });
            });
        });

    // A pregnancy has no moment of its own to hook: it is a flag that turns
    // over inside the biologic simulation. The diary watches for the turn.
    function watchPregnancies() {
        try {
            if (!Diary.isActive()) return;
            const seen = ($gameSystem._diaryPregnant ||= {});
            for (const actor of $gameParty.members()) {
                const data = actor._uterusData;
                const id = actor.actorId();
                const pregnant = !!(data && data.isPregnant);
                if (pregnant && !seen[id]) {
                    seen[id] = 1;
                    log('birth.pregnant', { name: nameOf(actor) }, { who: nameOf(actor) });
                } else if (!pregnant && seen[id]) {
                    delete seen[id];
                }
            }
        } catch (e) { /* nothing */ }
    }

    //=========================================================================
    // 6. People: standing, romance, Eris, the dead
    //=========================================================================

    // Called by NPCEmpathize whenever a party member's standing with somebody
    // moves. Only the crossings are written down: the diary records that they
    // became friends, not every point in between.
    const FRIEND_AT = 55;
    const ENEMY_AT = -40;
    Diary.onOpinionChanged = function (profile, actorId, previous, current) {
        try {
            if (!Diary.isActive() || !profile) return;
            const npc = profile._npcName || profile.name || "";
            if (!npc) return;
            const actor = $gameActors && $gameActors.actor(Number(actorId));
            if (!actor || !$gameParty.members().includes(actor)) return;
            const who = nameOf(actor);
            if (previous < FRIEND_AT && current >= FRIEND_AT) {
                log('npc.friend', { name: who, npc }, { who });
            } else if (previous > ENEMY_AT && current <= ENEMY_AT) {
                log('npc.enemy', { name: who, npc }, { who });
            }
        } catch (e) { /* standing still moved */ }
    };

    // A suit pressed. Only the ones that land are written down: a diary is a
    // record of what happened, and being turned down at a bar is not the party's
    // history. Called from NPCEmpathizeUI.
    Diary.onRomance = function (actorName, npcName, action, landed) {
        if (!landed) return;
        log('npc.romance', {
            name: actorName || "",
            npc: npcName || "",
            stage: T('Diary.romance.' + String(action), {})
        }, { who: actorName });
    };

    whenReady(() => window.ErisDateSystem && window.ErisDateSystem.start,
        () => {
            const ED = window.ErisDateSystem;
            after(ED, 'start', function (ok, args) {
                if (ok === false) return;
                let biome = "";
                try { biome = ED.biomeLabel ? ED.biomeLabel(ED.currentBiome()) : ""; } catch (e) { biome = ""; }
                log('eris.date', { place: biome || placeNow(), time: clockAt(worldMinutes()) });
            });
        });

    // How the evening went. The date has no ending to hook, it simply stops
    // being active, so the diary waits for that and reads the opinion it left
    // behind, which is the same number the trial later reads.
    let _erisWasActive = false;
    function watchErisDate() {
        try {
            const ED = window.ErisDateSystem;
            if (!ED || !ED.isActive) return;
            const active = !!ED.isActive();
            if (active === _erisWasActive) return;
            _erisWasActive = active;
            if (active) return;
            const opinion = Number($gameVariables.value(78)) || 0;
            const outcome = opinion >= 60 ? T('Diary.eris.wonderful')
                : opinion >= 25 ? T('Diary.eris.warm')
                    : opinion >= 0 ? T('Diary.eris.awkward')
                        : T('Diary.eris.disaster');
            log('eris.dateEnd', { outcome, opinion });
        } catch (e) { /* the evening still ended */ }
    }

    whenReady(() => typeof Game_Factions !== 'undefined' && Game_Factions.prototype.setReputation,
        () => {
            const BANDS = [-60, -20, 20, 60];
            function band(value) {
                let n = 0;
                for (const edge of BANDS) if (value >= edge) n++;
                return n;
            }
            before(Game_Factions.prototype, 'setReputation', function (args) {
                const id = args[0];
                this._diaryRepBefore = this.getReputation ? this.getReputation(id) : 0;
            });
            after(Game_Factions.prototype, 'setReputation', function (result, args) {
                const id = args[0];
                const now = this.getReputation ? this.getReputation(id) : 0;
                const was = this._diaryRepBefore || 0;
                if (band(was) === band(now)) return;
                let label = String(id);
                try {
                    const faction = this.getFaction ? this.getFaction(id) : null;
                    if (faction && faction.name) label = faction.name;
                } catch (e) { /* the id will do */ }
                log('faction.standing', { faction: label, value: Math.round(now) });
            });
        });

    //=========================================================================
    // 7. Health
    //=========================================================================

    whenReady(() => window.DiseaseSystem && window.DiseaseSystem.infectActor,
        () => {
            const DS = window.DiseaseSystem;
            after(DS, 'infectActor', function (ok, args) {
                if (ok === false) return;
                const actor = args[0];
                if (!actor || !$gameParty || !$gameParty.members().includes(actor)) return;
                const disease = DS.getDisease ? DS.getDisease(args[1]) : null;
                const source = String(args[2] || "");
                log(args[3] ? 'health.epidemic' : 'health.disease', {
                    name: nameOf(actor),
                    disease: (disease && (disease.name || disease.id)) || String(args[1] || ""),
                    source
                }, { who: nameOf(actor) });
            });
            after(DS, 'cureActor', function (ok, args) {
                if (ok === false) return;
                const actor = args[0];
                if (!actor || !$gameParty || !$gameParty.members().includes(actor)) return;
                log('health.cured', { name: nameOf(actor), disease: String(args[1] || "") }, { who: nameOf(actor) });
            });
        });

    whenReady(() => window.HealthCore && window.HealthCore.removeImplantWithPart,
        () => {
            const HC = window.HealthCore;
            after(HC, 'removeImplantWithPart', function (lost, args) {
                const actor = args[0];
                const partKey = String(args[1] || "");
                // BodyParts.json names its parts by key; the words are in
                // js/i18n/<lang>/plugins/BodyParts.json. The raw key is the
                // last resort for a part the banks do not list.
                const partNameKey = 'BodyParts.' + partKey.toLowerCase() + '.name';
                const part = T.has(partNameKey) ? T(partNameKey) : partKey;
                log('health.partLost', {
                    name: nameOf(actor),
                    part: part
                }, { who: nameOf(actor) });
                if (lost && (lost.name || lost.id)) {
                    log('health.augmentLost', { name: nameOf(actor), augment: lost.name || lost.id }, { who: nameOf(actor) });
                }
            });
        });

    whenReady(() => window.ProstheticShop && window.ProstheticShop.installImplant,
        () => {
            after(window.ProstheticShop, 'installImplant', function (ok, args) {
                if (ok === false) return;
                const actor = args[0];
                const implant = args[1];
                log('health.augmentFit', {
                    name: nameOf(actor),
                    augment: (implant && (implant.name || implant.id)) || "",
                    part: String(args[2] || "")
                }, { who: nameOf(actor) });
            });
        });

    whenReady(() => window.FieldSurgery && window.FieldSurgery.perform,
        () => {
            after(window.FieldSurgery, 'perform', function (result, args) {
                log('health.surgery', {
                    surgeon: nameOf(args[0]),
                    patient: nameOf(args[1]),
                    outcome: (result && result.success) ? T('Diary.surgery.success') : T('Diary.surgery.failure')
                });
            });
        });

    // The WC. It is a common event (20, "UseWC") rather than a plugin, so the
    // interpreter's own call is what is watched, on both routes into it: an
    // event page that calls it and a plugin that reserves it.
    const WC_COMMON_EVENT = 20;
    function noteRelief() {
        const leader = $gameParty && $gameParty.leader();
        log('health.relief', { name: nameOf(leader), place: mapNameNow() }, { who: nameOf(leader) });
    }

    whenReady(() => typeof Game_Interpreter !== 'undefined' && Game_Interpreter.prototype.command117,
        () => {
            before(Game_Interpreter.prototype, 'command117', function (args) {
                const params = args[0] || this._params;
                if (params && Number(params[0]) === WC_COMMON_EVENT) noteRelief();
            });
            before(Game_Temp.prototype, 'reserveCommonEvent', function (args) {
                if (Number(args[0]) === WC_COMMON_EVENT) noteRelief();
            });
        });

    //=========================================================================
    // 8. Belongings
    //=========================================================================

    // The artifacts the history simulator forges live in one band of ids and
    // are the one thing whose LOSS is worth writing down. Everything else the
    // party drops, throws or sells off is its own business.
    const ARTIFACT_MIN = 1501;
    const ARTIFACT_MAX = 1513;
    function isArtifact(item) {
        return !!item && item.id >= ARTIFACT_MIN && item.id <= ARTIFACT_MAX;
    }

    function isNotableFind(item) {
        if (!item) return false;
        if (isArtifact(item)) return true;
        if (DataManager.isItem(item) && item.itypeId === 2) return true;   // key item
        return (Number(item.price) || 0) >= NOTABLE_PRICE;
    }

    whenReady(() => typeof Game_Party !== 'undefined' && Game_Party.prototype.gainItem,
        () => {
            after(Game_Party.prototype, 'gainItem', function (result, args) {
                const item = args[0];
                const amount = Number(args[1]) || 0;
                if (!item || !item.name || amount === 0) return;
                // A counter, a forge, a harvest and a battle all speak for
                // themselves in a line of their own; the plain "found" line is
                // for everything that has no better account of itself.
                if ($gameTemp && $gameTemp._diaryItemSilence) return;
                // Taking something out of a container is not a find worth a
                // line; only what is put IN one is (see the container hooks).
                if ($gameTemp && $gameTemp._diaryContainerTally) return;
                if (amount > 0) {
                    if (isArtifact(item)) {
                        log('item.artifactGot', { item: item.name, place: placeNow() });
                    } else if (isNotableFind(item)) {
                        log('item.found', { item: item.name, count: amount, place: placeNow() });
                    }
                } else if (isArtifact(item)) {
                    log('item.artifactLost', { item: item.name, place: placeNow() });
                }
            });
        });

    // A counter is one visit, not one purchase: everything bought over it goes
    // into a single line naming the shop it was bought from.
    whenReady(() => typeof Scene_Shop !== 'undefined' && Scene_Shop.prototype.doBuy,
        () => {
            before(Scene_Shop.prototype, 'create', function () {
                this._diaryBought = new Map();
                this._diarySold = new Map();
                this._diarySpent = 0;
                this._diaryEarned = 0;
                this._diaryShopName = mapNameNow();
            });

            after(Scene_Shop.prototype, 'doBuy', function (result, args) {
                const number = Number(args[0]) || 0;
                if (!this._item || number <= 0) return;
                tallyAdd(this._diaryBought, this._item.name, number);
                this._diarySpent += number * (this.buyingPrice ? this.buyingPrice() : 0);
            });

            after(Scene_Shop.prototype, 'doSell', function (result, args) {
                const number = Number(args[0]) || 0;
                if (!this._item || number <= 0) return;
                tallyAdd(this._diarySold, this._item.name, number);
                this._diaryEarned += number * (this.sellingPrice ? this.sellingPrice() : 0);
            });

            before(Scene_Shop.prototype, 'terminate', function () {
                if (this._diaryBought && this._diaryBought.size) {
                    log('shop.buy', {
                        items: tallyText(this._diaryBought),
                        place: this._diaryShopName || "",
                        total: money(this._diarySpent)
                    });
                }
                if (this._diarySold && this._diarySold.size) {
                    log('shop.sell', {
                        items: tallyText(this._diarySold),
                        place: this._diaryShopName || "",
                        total: money(this._diaryEarned)
                    });
                }
                this._diaryBought = this._diarySold = null;
            });
        });

    // A container is a place things are LEFT. What the party carries back out
    // of one is its own property moving from one pocket to another and is not
    // written down; what it puts in is, because that is where it will be.
    whenReady(() => window.Scene_Container && window.Scene_Container.prototype,
        () => {
            const proto = window.Scene_Container.prototype;
            after(proto, 'create', function () {
                this._diaryStored = new Map();
                this._diaryContainerPlace = mapNameNow();
                if ($gameTemp) $gameTemp._diaryContainerTally = this._diaryStored;
            });
            before(proto, 'terminate', function () {
                if ($gameTemp) $gameTemp._diaryContainerTally = null;
                if (this._diaryStored && this._diaryStored.size) {
                    log('container.stored', {
                        items: tallyText(this._diaryStored),
                        place: this._diaryContainerPlace || ""
                    });
                }
                this._diaryStored = null;
            });
        });

    whenReady(() => typeof Game_Party !== 'undefined' && Game_Party.prototype.loseItem,
        () => {
            before(Game_Party.prototype, 'loseItem', function (args) {
                const tally = $gameTemp && $gameTemp._diaryContainerTally;
                if (!tally) return;
                const item = args[0];
                const amount = Number(args[1]) || 0;
                if (item && item.name && amount > 0) tallyAdd(tally, item.name, amount);
            });
        });

    // Stockbusters: an order placed on the Hypernet, not a counter. A courier
    // order and a bazaar's over-the-counter sale read differently, since one of
    // them is a parcel the party is still waiting for.
    Diary.onOrderPlaced = function (item, price, delivered) {
        log(delivered ? 'shop.order' : 'shop.buy', {
            items: item || "",
            total: money(price || 0),
            place: T('Diary.place.stockbusters')
        });
    };

    whenReady(() => window.Scene_Steal && window.Scene_Steal.prototype._doSteal,
        () => {
            before(window.Scene_Steal.prototype, '_doSteal', function () {
                const entry = this._items && this._items[this._idx];
                this._diaryStealItem = (entry && entry.data && entry.data.name) || "";
                this._diaryStealHeld = $gameParty ? $gameParty.numItems(entry && entry.data) : 0;
            });
            after(window.Scene_Steal.prototype, '_doSteal', function () {
                const name = this._diaryStealItem;
                if (!name) return;
                // Nothing else tells the two apart from out here: the item is in
                // the pack on a success and is not on a failure.
                const entry = this._items && this._items[this._idx];
                const held = entry && entry.data && $gameParty ? $gameParty.numItems(entry.data) : 0;
                if (held > (this._diaryStealHeld || 0)) {
                    log('steal.success', { item: name, place: mapNameNow() });
                } else {
                    log('steal.caught', { item: name, place: mapNameNow() });
                }
            });
        });

    whenReady(() => window.$realEstateManager && window.$realEstateManager.buyProperty,
        () => {
            const REM = window.$realEstateManager;
            // The board holds its own list; a property is named off it rather
            // than by the bare id the caller passed.
            function label(id) {
                try {
                    const property = (REM.properties || []).find(p => p.id === id);
                    if (property) return property.name || property.type || String(id);
                } catch (e) { /* the id will do */ }
                return String(id);
            }
            after(REM, 'buyProperty', function (ok, args) {
                if (!ok) return;
                log('property.bought', { property: label(args[0]), place: placeNow() });
            });
            after(REM, 'sellProperty', function (ok, args) {
                if (!ok) return;
                log('property.sold', { property: label(args[0]) });
            });
        });

    whenReady(() => window.RentSystem && window.RentSystem.rentForParty,
        () => {
            const RS = window.RentSystem;
            after(RS, 'rentForParty', function (ok, args) {
                if (ok === false) return;
                let price = 0;
                try { price = RS.priceOf ? RS.priceOf(args[0], args[1]) : 0; } catch (e) { price = 0; }
                log('property.rented', { place: mapNameNow(), price: money(price) });
            });
        });

    // Shares. Both markets go through the same pair of methods per commodity,
    // and both answer true only when the trade actually cleared.
    whenReady(() => window.$gameSystem && $gameSystem.stockMarket &&
                    Object.getPrototypeOf($gameSystem.stockMarket).buyOil,
        () => {
            const proto = Object.getPrototypeOf($gameSystem.stockMarket);
            const TRADES = {
                buyOil:    ['bought', 'oil'],
                sellOil:   ['sold', 'oil'],
                buySouls:  ['bought', 'souls'],
                sellSouls: ['sold', 'souls']
            };
            for (const [method, [action, stock]] of Object.entries(TRADES)) {
                after(proto, method, function (ok, args) {
                    if (ok !== true) return;
                    const shares = Number(args[0]) || 0;
                    const price = stock === 'oil' ? this._oilPrice : this._soulsPrice;
                    log('stock.trade', {
                        action: T('Diary.trade.' + action),
                        count: shares,
                        stock: T('Diary.stock.' + stock),
                        price: money(Math.round(shares * (price || 0)))
                    });
                });
            }
        });

    // An arena streak, written down whenever it reaches a new best.
    whenReady(() => window.ArenaBattleHandler && window.ArenaBattleHandler.setArenaStreak,
        () => {
            after(window.ArenaBattleHandler, 'setArenaStreak', function (result, args) {
                const streak = Number(args[0]) || 0;
                if (streak < 3) return;   // a run worth writing about, not every win
                log('battle.arena', { streak, place: mapNameNow() });
            });
        });

    whenReady(() => typeof Game_System !== 'undefined' && Game_System.prototype.takeLoan,
        () => {
            after(Game_System.prototype, 'takeLoan', function (ok, args) {
                if (ok === false) return;
                log('bank.loan', { amount: money(Number(args[0]) || 0), bank: mapNameNow() });
            });
            after(Game_System.prototype, 'repayLoan', function (ok, args) {
                if (ok === false) return;
                log('bank.repaid', { amount: money(Number(args[0]) || 0) });
            });
        });

    // A letter posted. One addressed into another world is a letter across the
    // dimensions and is written down as such, since the postage alone says so.
    whenReady(() => window.MailSystem && window.MailSystem.send,
        () => {
            const MS = window.MailSystem;
            after(MS, 'send', function (result, args) {
                if (!result || result.ok !== true) return;
                const letter = args[0] || {};
                const here = (window.WorldManager && window.WorldManager.activeWorldName) || "";
                const to = String(letter.world || "");
                let recipient = String(letter.partyId || "");
                try {
                    const card = MS.findCard ? MS.findCard(to, letter.partyId) : null;
                    if (card) recipient = (MS.partyLabel ? MS.partyLabel(card) : card.label) || recipient;
                } catch (e) { /* the id will do */ }
                const subject = String(letter.subject || "");
                if (to && to !== here) {
                    log('mail.dimension', { to: recipient, world: to, subject });
                } else {
                    log('mail.sent', { to: recipient, subject });
                }
            });
        });

    //=========================================================================
    // 9. Law
    //=========================================================================

    whenReady(() => window.CrimeSystem && window.CrimeSystem.addCrime,
        () => {
            after(window.CrimeSystem, 'addCrime', function (result, args) {
                log('crime.committed', {
                    crime: String(args[0] || ""),
                    bounty: money(Number(args[1]) || 0),
                    place: placeNow()
                });
            });
            after(window.CrimeSystem, 'removeCrime', function (result, args) {
                log('crime.settled', { crime: String((args[0] && args[0].name) || args[0] || "") });
            });
        });

    Diary.onTrial = function (stage, info) {
        info = info || {};
        if (stage === 'start') {
            log('law.trial', { place: info.place || placeNow() });
        } else if (stage === 'verdict') {
            const verdict = info.verdict === 'innocent'
                ? T('Diary.verdict.acquitted')
                : (info.verdict === 'guilty' ? T('Diary.verdict.guilty') : String(info.verdict || ""));
            log('law.verdict', { verdict, sentence: info.sentence || "" });
        } else if (stage === 'prison') {
            // An open-ended sentence is served by grinding the bounty down and
            // has no term to name; a fixed one is named in days and hours.
            const minutes = Number(info.minutes) || 0;
            const term = info.term || (minutes > 0
                ? T('Diary.term.fixed', { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60) })
                : T('Diary.term.open'));
            log('law.prison', { term });
        }
    };

    //=========================================================================
    // 10. Work and industry
    //=========================================================================

    Diary.onWorkShift = function (job, pay, hours, actor) {
        log('work.shift', {
            job: job || "",
            pay: money(pay || 0),
            hours: hours || 0,
            place: placeNow()
        }, { who: nameOf(actor) });
    };

    // Sowing and reaping happen inside the growth plugin's own scene, which has
    // no public moment to hook, so it says so itself (PlantGrowthSystem.js).
    Diary.onSown = function (plant) { log('farm.sown', { plant: plant || "", place: placeNow() }); };
    Diary.onHarvested = function (plant) { log('farm.harvested', { plant: plant || "", place: placeNow() }); };

    whenReady(() => window.AnimalGrowthSystem && window.AnimalGrowthSystem.collectProduce,
        () => {
            const AG = window.AnimalGrowthSystem;
            after(AG, 'collectProduce', function (items, args) {
                if (!items || !items.length) return;
                const tally = new Map();
                for (const entry of items) {
                    const name = (entry && (entry.name || (entry.item && entry.item.name))) || "";
                    tallyAdd(tally, name, (entry && entry.count) || 1);
                }
                log('animal.produce', {
                    animal: String((args[1] && args[1].name) || ""),
                    items: tallyText(tally),
                    place: placeNow()
                });
            });
            after(AG, 'placeAnimal', function (ok, args) {
                if (ok === false) return;
                let animal = String(args[0] || "");
                try {
                    const def = AG.ANIMAL_DB && AG.ANIMAL_DB[args[0]];
                    if (def && def.name) animal = def.name;
                } catch (e) { /* the id will do */ }
                log('animal.bought', { animal, place: placeNow() });
            });
        });

    Diary.onHiveHarvest = function (item, count) {
        const qty = Number(count) || 0;
        log('apiary.harvest', {
            items: qty > 1 ? T('Diary.fmt.itemCount', { name: item || "", count: qty }) : (item || ""),
            place: placeNow()
        });
    };

    Diary.onCrafted = function (kind, itemName, count) {
        const key = ({ forge: 'craft.forge', cook: 'craft.cook', alchemy: 'craft.alchemy', brew: 'craft.brew' })[kind];
        if (!key) return;
        log(key, { item: itemName || "", count: count || 1, place: placeNow() });
    };

    Diary.onBuilt = function (item) { log('build.placed', { item: item || "", place: placeNow() }); };
    Diary.onDismantled = function (item) { log('build.dismantled', { item: item || "", place: placeNow() }); };

    //=========================================================================
    // 11. Knowledge
    //=========================================================================

    whenReady(() => typeof Game_Actor !== 'undefined' && Game_Actor.prototype.learnSkill,
        () => {
            // Every route into a new skill goes through here: the SkillMaster's
            // encyclopedia and its fusions, the class ladder a level up hands
            // out, a trait, an event. All of them are worth the line.
            before(Game_Actor.prototype, 'learnSkill', function (args) {
                const id = Number(args[0]);
                if (this.isLearnedSkill(id)) return;
                if (!$gameParty || !$gameParty.members().includes(this)) return;
                const skill = $dataSkills && $dataSkills[id];
                if (!skill || !skill.name) return;
                log('skill.learned', { name: nameOf(this), skill: skill.name }, { who: nameOf(this) });
            });
        });

    // A tier gained. `gainSpecializationExp` answers the new level when one was
    // reached and 0 otherwise, which is exactly the moment worth a line.
    whenReady(() => typeof Game_Actor !== 'undefined' && Game_Actor.prototype.gainSpecializationExp,
        () => {
            after(Game_Actor.prototype, 'gainSpecializationExp', function (level, args) {
                if (!level) return;
                if (!$gameParty || !$gameParty.members().includes(this)) return;
                const Specs = window.Specializations;
                let spec = String(args[0] || "");
                let tier = String(level);
                try {
                    const def = Specs && Specs.byId ? Specs.byId.get(args[0]) : null;
                    if (def && Specs.displayName) spec = Specs.displayName(def) || spec;
                    if (Specs && Specs.levelName) tier = Specs.levelName(level) || tier;
                } catch (e) { /* the numbers will do */ }
                log('spec.tier', { name: nameOf(this), spec, tier }, { who: nameOf(this) });
            });
        });

    whenReady(() => window.ProceduralTechTree && window.ProceduralTechTree.research,
        () => {
            after(window.ProceduralTechTree, 'research', function (ok, args) {
                if (ok === false) return;
                const PT = window.ProceduralTechTree;
                let label = String(args[1] || args[0] || "");
                try {
                    if (PT.nodeName) label = PT.nodeName(args[0], args[1]) || label;
                } catch (e) { /* the id will do */ }
                log('tech.researched', { tech: label });
            });
        });

    whenReady(() => window.KanbanQuest && window.KanbanQuest.addQuest,
        () => {
            const QM = window.KanbanQuest;
            after(QM, 'addQuest', function (quest, args) {
                const title = (quest && quest.title) || String(args[1] || "");
                if (!title) return;
                log('quest.accepted', { quest: title, place: placeNow() });
            });
            after(QM, 'completeQuest', function (ok, args) {
                const id = args[0];
                let title = String(id || "");
                try {
                    const quest = QM.getQuest ? QM.getQuest(id) : null;
                    if (quest && quest.title) title = quest.title;
                } catch (e) { /* the id will do */ }
                log('quest.completed', { quest: title });
            });
        });

    // An adventure answered: the "???" squares of the world map and the
    // anomalous worlds of the star map alike (ProceduralAdventureSystem.js
    // calls this as it closes the encounter). The title is the story the party
    // walked into; what it paid is written out as they told it afterwards.
    Diary.onAdventure = function (title, reward, place) {
        const name = String(title || "").trim();
        if (!name) return;
        log('adventure.done', {
            adventure: name,
            reward: String(reward || "").trim(),
            place: place || placeNow()
        });
    };

    // A creature met for the first time. The bestiary is the world's book and
    // the diary is the party's, so the party writes down the day it met one.
    whenReady(() => typeof Game_System !== 'undefined' && Game_System.prototype.markMonsterAsEncountered,
        () => {
            before(Game_System.prototype, 'markMonsterAsEncountered', function (args) {
                const id = Number(args[0]);
                if (this._isSandboxMode) return;
                if (this.encounteredMonsters().includes(id)) return;
                const data = $dataEnemies && $dataEnemies[id];
                if (!data || !data.name) return;
                log('bestiary.found', { creature: data.name });
            });
        });

    // A species named out in the galaxy. The identification is written straight
    // into the world's own catalogue, so the count of it is what is watched.
    let _alienCount = null;
    function watchAlienSpecies() {
        try {
            if (!Diary.isActive()) return;
            const known = ($gameSystem && $gameSystem._discoveredAlienSpecies) || {};
            const keys = Object.keys(known);
            if (_alienCount === null) { _alienCount = keys.length; return; }
            if (keys.length <= _alienCount) { _alienCount = keys.length; return; }
            for (const key of keys.slice(_alienCount)) {
                const found = known[key] || {};
                log('alien.identified', {
                    species: found.name || key,
                    planet: found.planet || (window.GalaxySim && window.GalaxySim.getSurfacePlanet
                        ? ((window.GalaxySim.getSurfacePlanet() || {}).name || "") : "")
                });
            }
            _alienCount = keys.length;
        } catch (e) { /* nothing */ }
    }

    //=========================================================================
    // 12. Diversions
    //=========================================================================

    // Every minigame is its own scene, and there are two dozen of them. Rather
    // than a hook apiece, the scene stack is watched: leaving one of these is
    // having played it. The label is the scene's own i18n name where it has
    // one, so nothing here has to be kept in step with the game's copy.
    const MINIGAME_SCENES = {
        Scene_Arcade: 'arcade', Scene_Frogger: 'frogger', Scene_Snake: 'snake',
        Scene_BubblePop: 'bubblePop', Scene_SlotMachine: 'slots', Scene_Bowling: 'bowling',
        Scene_PoolGame: 'pool', Scene_UnlockingBlocks: 'lockpick', Scene_HexphoneTetris: 'tetris',
        Scene_ScratchCard: 'scratchCard', Scene_HorseRace: 'horseRace', Scene_Tarot: 'tarot',
        Scene_FishingMinigame: 'fishing', Scene_SurfingGame: 'surfing', Scene_VisualPiano: 'piano',
        Scene_PeriodicTable: 'periodicTable', Scene_RamanScan: 'raman', Scene_Chess: 'chess',
        Scene_MonsterTournament: 'tournament', Scene_HyperTamer: 'hyperTamer',
        Scene_BoosterPack: 'boosters', Scene_CardDuel: 'cardDuel', Scene_DreamFreeplay: 'dream',
        Scene_TargetRange: 'targetRange'
    };

    whenReady(() => typeof SceneManager !== 'undefined' && SceneManager.push,
        () => {
            after(SceneManager, 'push', function (result, args) {
                try {
                    const klass = args[0];
                    const key = MINIGAME_SCENES[klass && klass.name];
                    if (!key) return;
                    // The line is written on the way IN, since a minigame scene
                    // may exit through any number of paths and the diary only
                    // cares that the party sat down to play.
                    log('minigame.played', {
                        game: T('Diary.game.' + key),
                        outcome: "",
                        score: ""
                    }, { dedupe: key });
                } catch (e) { /* the game still played */ }
            });
        });

    // A broadcast is a thing watched, wherever the set is: the tune-in event,
    // the TV Guide and the legacy command all open the studio the same way.
    whenReady(() => window.TVStudio && window.TVStudio.begin,
        () => {
            before(window.TVStudio, 'begin', function (args) {
                log('tv.watched', {
                    channel: String(args[0] || ""),
                    programme: String((args[2] && args[2].title) || ""),
                    place: mapNameNow()
                });
            });
        });

    whenReady(() => window.DreamSystem && window.DreamSystem.start,
        () => {
            before(window.DreamSystem, 'start', function (args) {
                const opts = args[0] || {};
                if (opts.sandbox) return;   // the title screen's free play is nobody's night
                log('dream.had', { dream: "" });
            });
        });

    //=========================================================================
    // Polling: the handful of things that have no moment to hook
    //=========================================================================

    let _tick = 0;
    whenReady(() => typeof Scene_Map !== 'undefined' && Scene_Map.prototype.update,
        () => {
            after(Scene_Map.prototype, 'update', function () {
                drainPending();
                if ((++_tick % 90) !== 0) return;
                watchFloor();
                watchPregnancies();
                watchAlienSpecies();
                watchErisDate();
            });
        });

    //=========================================================================
    // Persistence wiring
    //=========================================================================

    // Character creation deals out a whole starting kit, a class, a level and a
    // party; none of that is a thing the party DID. The diary opens once it is
    // over, on its own first line.
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        Diary.suspend();
        _DataManager_setupNewGame.call(this);
        Diary._entries = null;
        Diary._lastLine = "";
        setTimeout(() => Diary.resume(), 0);
    };

    // The savegame carries the id and the lines; the world folder carries the
    // file. Both are written on the way out.
    const _DataManager_saveGame = DataManager.saveGame;
    DataManager.saveGame = function (savefileId) {
        try {
            if (Diary.isActive()) {
                if ($gameSystem && !$gameSystem._diaryStarted) $gameSystem._diaryStarted = worldMinutes();
                Diary._dirty = true;
                Diary.flush();
            }
        } catch (e) { console.error("[Diary] save", e); }
        return _DataManager_saveGame.call(this, savefileId);
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        Diary._entries = null;
        Diary._lastLine = "";
        _lastFloor = null;
    };

    // The diary remembers when it was started, but does not write a line about it.
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);
        try {
            if (!Diary.isActive()) return;
            if ($gameSystem._diaryStarted != null) return;
            $gameSystem._diaryStarted = worldMinutes();
        } catch (e) { /* the diary is open either way */ }
    };

    //=========================================================================
    // Plugin commands
    //=========================================================================

    PluginManager.registerCommand(pluginName, "OpenDiary", () => {
        if (window.Scene_Diary) SceneManager.push(window.Scene_Diary);
    });

    PluginManager.registerCommand(pluginName, "WriteDiaryLine", args => {
        const text = String((args && args.text) || "").trim();
        if (text) log('note', { text });
    });
})();
