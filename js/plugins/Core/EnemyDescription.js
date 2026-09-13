//=============================================================================
// EnemyDescription.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Enemy description service. Resolves combinatorial {a | b | c} inline text in enemy descriptions to a single variant, seeded from the world seed.
 * @author esoteric-heavy-industries
 *
 * @help EnemyDescription.js
 *
 * Enemy descriptions in data/Enemies.json (the <En:> note tag) use combinatorial
 * inline text, e.g.
 *
 *   <En: The {ghost | spirit | shade} of a {magic | arcane} apprentice>
 *
 * Every plugin that shows an enemy description (Bestiary, Titlescreen data-cards,
 * Health_Monsters, Hendrix_Localization, ...) routes through this shared service
 * so the wording is chosen consistently.
 *
 * The choice is NOT random: for a given world seed (default "esoteric", hashed via
 * HistoryManager.getSeed) each enemy always resolves to the same wording, and
 * different enemies resolve differently. Change the world seed and every enemy's
 * flavour text re-rolls together.
 *
 * Public API (window.EnemyDescription):
 *   resolve(text, seedKey)  -> string   Resolve {a|b|c} groups in arbitrary text.
 *                                        seedKey stabilises the pick; defaults to
 *                                        the text itself.
 *   describe(enemyId)       -> string   Read $dataEnemies[id]'s <En:> tag, resolve
 *                                        it (per-enemy, cached), and return it.
 *   rawDescription(enemyId) -> string   The unresolved <En:> template.
 *   hasVariants(text)       -> boolean  True if the text contains a {..|..} group.
 *
 * No plugin parameters. No plugin commands.
 */

(() => {
    'use strict';

    //-------------------------------------------------------------------------
    // Seed helpers. Prefer NPCShared (canonical world-RNG root) when present so
    // picks stay consistent with the rest of the simulation, but stay fully
    // self-contained with identical fallbacks so the service works even if this
    // plugin loads before NPCShared (e.g. on the title screen).
    //-------------------------------------------------------------------------
    function nameHash(str) {
        if (window.NPCShared && typeof NPCShared.nameHash === 'function') {
            return NPCShared.nameHash(str) >>> 0;
        }
        let h = 5381;
        const s = String(str);
        for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        return h || 1;
    }

    function worldSeed() {
        if (window.NPCShared && typeof NPCShared.worldSeed === 'function') {
            return NPCShared.worldSeed() >>> 0;
        }
        if (window.HistoryManager && typeof HistoryManager.getSeed === 'function') {
            return HistoryManager.getSeed() >>> 0;
        }
        return 19002001; // canon default
    }

    // xorshift32, bit-identical to NPCShared.Rng.
    function makeRng(seed) {
        if (window.NPCShared && typeof NPCShared.Rng === 'function') {
            return new NPCShared.Rng(seed);
        }
        let s = (seed || 1) >>> 0;
        return {
            next() {
                let x = s;
                x ^= x << 13; x >>>= 0;
                x ^= x >> 17;
                x ^= x << 5;  x >>>= 0;
                s = x;
                return x / 4294967296;
            }
        };
    }

    //-------------------------------------------------------------------------
    // Combinatorial resolution.
    //-------------------------------------------------------------------------
    // Combinatorial parsing + resolution.
    //
    // Templates support NESTING and whole-phrase options, e.g.
    //   {A {shambling | rotting} corpse | The {restless | unquiet} dead}
    // A recursive-descent parser turns the template into an AST of text/choice
    // nodes; evaluation walks it top-down, so an unpicked branch never consumes
    // the RNG. Each multi-option choice reached advances the RNG once, keeping the
    // wording deterministic per (world seed, enemy).
    //-------------------------------------------------------------------------
    function hasVariants(text) {
        return typeof text === 'string' && text.indexOf('{') !== -1 && text.indexOf('|') !== -1;
    }

    // Parse a template string into an array of nodes:
    //   { t: 'text', v: string }
    //   { t: 'choice', opts: [ nodes[], nodes[], ... ] }
    // Trim the whitespace padding an option (the spaces around " | " and braces)
    // without disturbing the meaningful spacing between an option's inner tokens.
    function trimSeq(nodes) {
        if (nodes.length && nodes[0].t === 'text') {
            nodes[0].v = nodes[0].v.replace(/^\s+/, '');
            if (!nodes[0].v) nodes.shift();
        }
        if (nodes.length && nodes[nodes.length - 1].t === 'text') {
            const last = nodes[nodes.length - 1];
            last.v = last.v.replace(/\s+$/, '');
            if (!last.v) nodes.pop();
        }
        return nodes;
    }

    function parseTemplate(text) {
        let i = 0;
        function parseSeq(top) {
            const nodes = [];
            let buf = '';
            const flush = () => { if (buf) { nodes.push({ t: 'text', v: buf }); buf = ''; } };
            while (i < text.length) {
                const c = text[i];
                if (c === '{') { flush(); i++; nodes.push(parseChoice()); }
                else if (!top && (c === '|' || c === '}')) break;
                else { buf += c; i++; }
            }
            flush();
            return nodes;
        }
        function parseChoice() {
            const opts = [trimSeq(parseSeq(false))];
            while (text[i] === '|') { i++; opts.push(trimSeq(parseSeq(false))); }
            if (text[i] === '}') i++; // consume closing brace
            return { t: 'choice', opts };
        }
        return parseSeq(true);
    }

    // Correct an indefinite article that a chosen option has just flipped, e.g.
    // "a {novice | apprentice}" -> "an apprentice". Only touches an article that
    // directly precedes a resolved choice, so pre-existing prose (e.g. the correct
    // "a once-mighty king") is never disturbed. The letter heuristic is safe for
    // the curated vocabulary (every vowel-letter option also takes a vowel sound).
    const ARTICLE_TAIL = /\b([Aa])n?(\s+)$/;

    function evalNodes(nodes, rng) {
        let out = '';
        for (const n of nodes) {
            if (n.t === 'text') { out += n.v; continue; }
            const opts = n.opts;
            const idx = opts.length <= 1 ? 0 : Math.floor(rng.next() * opts.length) % opts.length;
            const s = evalNodes(opts[idx] || [], rng);
            const m = out.match(ARTICLE_TAIL);
            if (m && /[A-Za-z]/.test(s.charAt(0))) {
                const wantAn = /^[aeiou]/i.test(s);
                let art = wantAn ? 'an' : 'a';
                if (m[1] === 'A') art = art.charAt(0).toUpperCase() + art.slice(1);
                out = out.slice(0, out.length - m[0].length) + art + m[2];
            }
            out += s;
        }
        return out;
    }

    // Tidy the spacing that empty options / option trimming can leave behind, and
    // collapse an immediately repeated word. Adjacent duplicate words are virtually
    // always artifacts here: either two neighbouring synonym groups resolving to the
    // same word ("draining living force force") or a pre-existing source typo
    // ("wades in in ranks"); collapsing "X X" -> "X" fixes both.
    function tidy(s) {
        return s
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/[ \t]+([.,;:!?)])/g, '$1')
            .replace(/([([])[ \t]+/g, '$1')
            .replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1')
            .trim();
    }

    function resolve(text, seedKey) {
        if (typeof text !== 'string' || text.indexOf('{') === -1) return text;
        const key = (seedKey === undefined || seedKey === null) ? text : seedKey;
        const rng = makeRng((worldSeed() ^ nameHash(key)) >>> 0);
        return tidy(evalNodes(parseTemplate(text), rng));
    }

    //-------------------------------------------------------------------------
    // Enemy-note description reading + caching.
    //-------------------------------------------------------------------------
    const _cache = Object.create(null);

    // The tag holds a translation key (LoreEnemies.<id>); the template itself
    // lives in js/i18n/<lang>/lore/LoreEnemies.json. A note that still holds a
    // literal template is used as written, so an unlifted or hand-edited entry
    // keeps working.
    function noteEn(note) {
        const m = String(note || '').match(/<En:\s*([^>]+)>/i);
        if (!m) return '';
        const v = m[1].trim();
        return (typeof T === 'function' && T.has(v)) ? T(v) : v;
    }

    function rawDescription(enemyId) {
        const id = Number(enemyId);
        if (!id || typeof $dataEnemies === 'undefined' || !$dataEnemies[id]) return '';
        return noteEn($dataEnemies[id].note);
    }

    function describe(enemyId) {
        const id = Number(enemyId);
        if (!id || typeof $dataEnemies === 'undefined' || !$dataEnemies[id]) return '';
        const seed = worldSeed() >>> 0;
        const ck = id + ':' + seed;
        if (ck in _cache) return _cache[ck];
        const enemy = $dataEnemies[id];
        const template = noteEn(enemy.note);
        // Per-enemy stable key so each monster gets its own consistent wording.
        const out = resolve(template, 'enemy:' + id + ':' + (enemy.name || ''));
        _cache[ck] = out;
        return out;
    }

    //-------------------------------------------------------------------------
    // Procedural creatures: a description with no database row behind it.
    //-------------------------------------------------------------------------
    // A rarity, an alien species and a petrodemon are all generated on the spot,
    // so none of them has an <En:> tag to read. What each one has instead is a
    // bank of phrases in js/i18n/<lang>/plugins/Battle.json and a sentence made
    // of slots:
    //
    //   Battle.rarity.desc    "{build} {habit} {rumour}"
    //   Battle.rarity.build   [ ... ]   one line picked per slot
    //   Battle.rarity.habit   [ ... ]
    //
    // compose() reads the sentence, fills every {slot} in it from the list of
    // the same name, and runs the result through resolve() so a bank line may
    // itself carry {a | b} variants. Which line is picked is decided by the
    // creature's own key, not by Math.random: a rarity is one creature and its
    // page has to read the same every time the codex is opened, in this session
    // and in the next.
    //
    // A kind with no bank (a language that has not translated it, a mod that
    // asks for one that does not exist) composes to "" rather than to a
    // half-filled sentence; every caller treats that as "no description".
    const SLOT_RE = /\{(\w+)\}/g;

    function bank(kind, slot) {
        const key = 'Battle.' + kind + '.' + slot;
        if (typeof T !== 'function' || !T.has(key) || typeof T.pool !== 'function') return null;
        const list = T.pool(key).filter(v => typeof v === 'string' && v.trim());
        return list.length ? list : null;
    }

    function compose(kind, seedKey) {
        const tplKey = 'Battle.' + String(kind) + '.desc';
        if (typeof T !== 'function' || !T.has(tplKey)) return '';
        const template = T(tplKey);
        if (typeof template !== 'string' || !template) return '';
        const rng = makeRng((worldSeed() ^ nameHash(String(seedKey || kind))) >>> 0);
        let filled = '';
        let last = 0;
        let missing = false;
        SLOT_RE.lastIndex = 0;
        let m;
        while ((m = SLOT_RE.exec(template)) !== null) {
            const list = bank(kind, m[1]);
            if (!list) { missing = true; break; }
            filled += template.slice(last, m.index) + list[Math.floor(rng.next() * list.length) % list.length];
            last = m.index + m[0].length;
        }
        if (missing) return '';
        filled += template.slice(last);
        // The banks may carry {a | b} groups of their own, so the composed
        // sentence goes through the ordinary resolver on the way out - seeded on
        // the same key, so the whole description is one creature's.
        return tidy(resolve(filled, 'proc:' + kind + ':' + seedKey));
    }

    window.EnemyDescription = {
        resolve,
        describe,
        rawDescription,
        hasVariants,
        compose,
        _clearCache() { for (const k in _cache) delete _cache[k]; },
    };
})();
