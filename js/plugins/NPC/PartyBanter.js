//=============================================================================
// PartyBanter.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v1.1.0 The party's own talk: multi-beat discussions between companions, keyed to personality, biome, what just happened and how everyone is holding up - on foot and on the road.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help PartyBanter.js
 *
 * ==========================================================================
 * WHAT THIS IS
 * ==========================================================================
 * The bank of things PARTY MEMBERS say to each other, and the machine that
 * decides which of them is said now. It is deliberately not the same bank the
 * town uses (NPC/NPCConversation.js): people who have shared a road for weeks
 * do not greet each other the way they greet a stranger behind a counter, and
 * every line in here is written for somebody who already knows who they are
 * talking to.
 *
 * The lines themselves are not in this file. They live in
 *
 *     js/i18n/en/plugins/PartyBanter.json
 *
 * so the bank can be added to (and translated) without touching the code.
 *
 * ==========================================================================
 * IT ONLY RUNS FOR A PARTY OF TWO OR MORE
 * ==========================================================================
 * Everything here answers null while the party is one person. A lone traveller
 * falls back to the plain chatter in AutoIdle.json, which is what they had
 * before this file existed: there is nobody to hold a discussion with, and a
 * personality-flavoured aside to nobody is just noise.
 *
 * ==========================================================================
 * HOW A DISCUSSION IS PUT TOGETHER
 * ==========================================================================
 * A discussion is a short scripted exchange: two to four BEATS, each beat one
 * line said by one participant, handed back in order. The topic is chosen from
 * what is actually going on, weighted, so the same two people standing in the
 * same field do not have the same conversation twice in an evening:
 *
 *   pending    something that just happened to the party and has not been
 *              talked about yet, chiefly a purchase (see "SHOPPING" below).
 *              Always taken first, and only once.
 *   battered   everybody is under 40% health. The party is in trouble and
 *              says so.
 *   needAll    everybody has a meter on the floor: hungry, filthy, sleepless.
 *   need       one of the two has a meter under 35%, and it is their subject.
 *   recent     a line out of the party DIARY (Core/Diary.js) from the last few
 *              hours: the fight they won, the artifact they found, the person
 *              who joined, the floor they went down. The diary's own parameters
 *              are filled into the script, so the exchange names the creature
 *              or the item.
 *   biome      where they are standing, by FAMILY rather than by biome id, so
 *              one bank covers Forest, Jungle and Bamboo and a biome nobody
 *              has written for still lands somewhere sensible.
 *   companion  what only people who share a camp say to each other: whose
 *              rations those were, who took the watch, who was snoring, who
 *              took the better weapon out of the loot. This used to sit in the
 *              town's bank (NPC/NPCConversation.js), where a shopkeeper the
 *              party had met a minute ago could open with it; it is the party's
 *              now, and nothing outside the party can reach it. Split three
 *              ways by how the two of them are actually getting on: `warm`,
 *              `sore`, and `road` for the practical middle.
 *   general    the road, the money, the leader, the plan. Always available.
 *   personality one member's own PERSONALITY opens (their archetype from
 *              js/db/Health/PersonalityData.json), the other's personality
 *              answers.
 *
 * Whatever the topic, the last word is often a CLOSER out of a third member's
 * personality bank (or the opener's, in a party of two), which is what makes
 * the same script read differently depending on who is standing in it: a
 * Cynical closer and a Nurturing closer end the same exchange very differently.
 *
 * A script whose tokens cannot all be filled from the context is rejected and
 * another is drawn, so a diary line missing a parameter never shows up as
 * "{enemies}" in a bubble.
 *
 * ==========================================================================
 * SHOPPING: THE SAME PURCHASE, THREE OPINIONS
 * ==========================================================================
 * Buying something over a counter queues a pending topic. Back on the map the
 * next discussion is about the purchase, and each member judges it out of their
 * own personality bank: the Disciplined one resents the expense, the Hedonistic
 * one wants to know why only one was bought, the Cautious one asks what the
 * party is now short of. Party of one: nothing is queued at all.
 *
 * ==========================================================================
 * WHATEVER THE PARTY JUST DID
 * ==========================================================================
 * A purchase is only the commonest of a whole class of things: the party forges
 * a blade, dismantles a bench, reaps a field, robs a shelf, loses an hour to an
 * arcade cabinet. All of it is already written down the moment it happens, by
 * Core/Diary.js, so rather than hook two dozen crafting, farming and minigame
 * plugins one at a time, the diary is READ on the way back to the map: its
 * newest line becomes the pending topic and the party talks about it walking
 * away. Any plugin that keeps a diary is covered by that, including plugins
 * written after this file.
 *
 * Four of those have banks of their own, judged by personality the way the
 * purchase is:
 *
 *   craft      something was forged, cooked, brewed or distilled
 *   dismantle  something on the map was taken apart for its pieces
 *   build      something was put up or set down
 *   minigame   the party sat down and played something
 *
 * Everything else lands in the generic `deed` bank, which talks about the thing
 * by name and nothing else. Plugin commands whose names read as gameplay
 * (anything about crafting, mining, fishing, repairing, playing) queue the same
 * generic topic, rationed to roughly one in several minutes, which is the only
 * way to catch a plugin that neither keeps a diary nor publishes an API.
 *
 * ==========================================================================
 * ON THE ROAD
 * ==========================================================================
 * Walking about, the talk is driven by Core/AutoIdleExplorer.js: it owns the
 * loose walkers, and two of them drifting together is what starts a discussion.
 * The moment everybody gets into a vehicle there are no loose walkers left, and
 * the party used to fall silent - which is the wrong way round, since a long
 * drive is exactly when people talk. So this file drives the talk itself in the
 * three places a travelling party is not on its feet:
 *
 *   driving   riding a vehicle on the map. Nobody has a body to speak from (the
 *             engine hides the whole party inside the hull), so the bubbles go
 *             OVER THE VEHICLE, each one prefixed with who is saying it.
 *   transit   somebody else is driving: the train (map 718), the coach (719) and
 *             the taxi (720) the fast travel system puts the party inside.
 *   cabin     parked up inside a vehicle's own interior (the camper, the car,
 *             the Starship), as MergedVehicleSystem reckons it.
 *
 * In transit and in the cabin the party is standing about as ordinary
 * characters, so each member speaks from their own body, the way they do on foot.
 *
 * Four things that happen on a journey are worth an immediate word, and each one
 * is answered in the speaker's own archetype, the same shape as the purchase:
 *
 *   crash     the vehicle took damage (a ram, a splash-down, a wall)
 *   handover  the wheel changed hands (Vehicle/VehicleCrew.js swaps a tired
 *             driver out)
 *   fuel      the tank fell past a fifth
 *   country   a border was crossed (Variable 86, set by WeatherSystem)
 *
 * Every one of them is on a cooldown, and the border is on a long one with a
 * coin toss on top: the point is that it happens rarely enough to be noticed.
 *
 * ==========================================================================
 * API
 * ==========================================================================
 *   PartyBanter.active()                    is there a party to talk?
 *   PartyBanter.personalityKey(actor)       'cynical', 'nurturing', ...
 *   PartyBanter.discussion([actorA, actorB, actorC?])
 *                                           -> [{ who, text }, ...] | null
 *                                           `who` indexes the array passed in
 *   PartyBanter.solo(actor, key)            one line, personality first, for
 *                                           the single bubbles a member pops
 *                                           on their own (a thought, a look, a
 *                                           sit-down, a cry after the leader)
 *   PartyBanter.strangerGreet(actor)        how THIS member opens with somebody
 *                                           who is not one of their own
 *   PartyBanter.noteEvent(topic, ctx)       queue a pending topic by hand
 *   PartyBanter.noteShopBuy(item, price, place)
 *   PartyBanter.noteDeed(topic, label, ctx) queue "we just did this", for a
 *                                           plugin that keeps no diary line
 *   PartyBanter.sweepDiary()                read the newest diary line and queue
 *                                           whatever the party just did
 *
 *   PartyBanter.travelSetting()             'driving' | 'transit' | 'cabin' | null
 *   PartyBanter.react(kind, ctx)            raise one of the four reactions NOW
 *                                           (noteEvent queues; this speaks)
 *   PartyBanter.travelTalk()                start a travelling exchange now, if
 *                                           one fits
 *   PartyBanter.speaking()                  is a travelling exchange being played
 *                                           out
 *
 * Consumed by Core/AutoIdleExplorer.js, which owns the walking, the bubbles and
 * the opinion ledger; this file owns what is said, and says it itself only in a
 * vehicle, where there is nobody walking about for AutoIdle to work with.
 */

(() => {
    'use strict';

    const BANK = 'PartyBanter';

    // A pending topic is worth talking about for a while and then stops being
    // news. Roughly two minutes of real time, which is a long walk out of a
    // shop and back onto the road.
    const PENDING_LIFE = 60 * 120;
    const PENDING_MAX = 3;

    // How far back the diary is read for something to talk about, in world
    // minutes, and how many lines deep. Both matter: a quiet hour should not
    // dredge up a fight from yesterday, and a busy one should not have the
    // party still discussing the first thing on the page.
    const RECENT_MINUTES = 300;
    const RECENT_DEPTH = 10;

    // How fresh a thing the party just DID has to be to be worth remarking on
    // coming out of the menu it was done in, in world minutes. Short: a forge is
    // interesting on the way out of the smithy and nowhere else. The diary's own
    // `recent` bank picks the same event up later as something that happened
    // today, which is a different conversation and reads like one.
    const DEED_MINUTES = 45;

    // A gameplay plugin command is a thing the party did too, but there is no
    // telling what, so a generic word about it is rationed hard.
    const DEED_COMMAND_GAP = 60 * 210;

    // An exchange between two members IS the party's social life: whoever took
    // part in one has spent that stretch of road in company, and their social
    // meter says so. Paid silently - the bubbles are the conversation, and a
    // popup on top of them would be the same thing said twice.
    const BANTER_SOCIAL = 6;

    const NEED_LINE = 35;      // a meter under this is on that member's mind
    const NEED_FLOOR = 30;     // ...and under this for everybody is the party's
    const HP_FLOOR = 0.4;      // everybody under this is a party in trouble

    // ------------------------------------------------------------------ bank
    // T.pool warns about a missing key, and this file asks for keys that are
    // deliberately optional (a personality with no closers written yet), so
    // every read is guarded.
    function pool(path) {
        const key = BANK + '.' + path;
        if (typeof T === 'undefined' || !T.has || !T.has(key)) return [];
        const list = T.pool(key);
        return Array.isArray(list) ? list : [];
    }

    function has(path) {
        return pool(path).length > 0;
    }

    function pick(list) {
        return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    }

    function pickFrom(path) {
        return pick(pool(path));
    }

    // {name} and friends. A token with nothing behind it is left standing so
    // the caller can see the line is unusable and draw another one.
    const TOKEN = /\{(\w+)\}/g;
    function fill(text, ctx) {
        return String(text).replace(TOKEN, (whole, key) => {
            const value = ctx[key];
            return (value === undefined || value === null || value === '') ? whole : String(value);
        });
    }

    function unresolved(text) {
        return /\{\w+\}/.test(text);
    }

    // ----------------------------------------------------------- personality
    // The archetype list PersonalityData.json ships, whichever of the two
    // shapes it is in and whichever loader got there first.
    function personalityList() {
        const loader = window._NPCSocietyDataLoader;
        if (loader && Array.isArray(loader.personalities)) return loader.personalities;
        const data = window.Health && window.Health.PersonalityData;
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.list)) return data.list;
        return null;
    }

    function profileOf(actor) {
        if (!actor || !window.NPCSocietyRegistry) return null;
        try {
            return window.NPCSocietyRegistry.getProfile(actor.name()) || null;
        } catch (e) {
            return null;
        }
    }

    // A member on one of the creature classes (63+, NPCCreature owns the
    // boundary) holds no conversation, so it is not cast in one. Recruiting an
    // animal does not hand it a vocabulary: it walks with the party and it
    // stays quiet, here and in every other bank that puts words in a
    // companion's mouth.
    function nonSentient(actor) {
        const NC = window.NPCCreature;
        return !!(actor && NC && NC.isNonSentientActor && NC.isNonSentientActor(actor));
    }

    // 'cynical', 'nurturing', ... A member whose society profile carries no
    // archetype (the player, in a save made before creation wrote one) is still
    // given one, derived from their actor id so it never changes under them.
    function personalityKey(actor) {
        if (!actor) return null;
        const list = personalityList();
        if (!list || !list.length) return null;
        const profile = profileOf(actor);
        let index = profile && profile.personalityIndex;
        if (index === undefined || index === null || !list[index]) {
            const id = (actor.actorId && actor.actorId()) || 1;
            index = (id * 7 + String(actor.name() || '').length * 3) % list.length;
        }
        const name = list[index] && list[index].name;
        return name ? String(name).toLowerCase() : null;
    }

    // The bank for this member's archetype, or the shared one when nobody has
    // written that archetype's lines yet.
    function personalPool(actor, section) {
        const key = personalityKey(actor);
        if (key && has(section + '.' + key)) return pool(section + '.' + key);
        return pool(section + '.any');
    }

    // ------------------------------------------------------------- the world
    function biomeId() {
        try {
            if ($gameMap && typeof $gameMap.getBiome === 'function') {
                const tagged = $gameMap.getBiome();
                if (tagged) return String(tagged);
            }
            if ($gameSystem && $gameSystem.getBiomeFromCache && $gamePlayer) {
                const cached = $gameSystem.getBiomeFromCache($gamePlayer.x, $gamePlayer.y);
                if (cached && cached !== 'Unknown') return String(cached); // i18n-ignore: sentinel
            }
            const proc = $gameSystem && $gameSystem._procGenData;
            if (proc && proc.currentBiome) return String(proc.currentBiome);
        } catch (e) { /* a conversation never breaks on a missing reading */ }
        return null;
    }

    // Biomes are grouped by FAMILY rather than written one by one: there are
    // 129 of them and they fall into a dozen kinds of place to be standing in.
    // Matched most specific first, since "CaveIce" is a cave before it is ice
    // and "VillageDesert" is a settlement before it is sand.
    const FAMILY_RULES = [
        [/cave|mine|shaft|underdark|catacomb|crypt|barrow|oubliette|tunnel|cistern|grotto|lavatube|warren|dungeon|sewer|metro|underforge|sunkenlibrary|cellar|vault|lair|den|burrow/i, 'underground'],
        [/heaven|hell|limbo|eldritch|dream|fairy|abstract|digital|spirit|profane|omega|alien|space|mushroom|fungal|crystal/i, 'otherworldly'],
        [/factory|laborator|buriedlab|bunker|spacecenter|saltworks|landfill|train|office/i, 'industrial'],
        [/ruin|abandon|graveyard|crypt|castle|temple|church|shrine|villa/i, 'ruins'],
        [/city|burg|village|houses|park|dock|station|market|arena/i, 'urban'],
        [/road|highway|bridge/i, 'road'],
        [/ice|snow|frozen|permafrost|tundra|taiga|glacier/i, 'ice'],
        [/desert|badland|saltflat|canyon|steppe|savannah|volcano/i, 'desert'],
        [/swamp|marsh|mangrove|bog|fen/i, 'wetland'],
        [/ocean|sea|beach|lake|river|shore|water|flooded/i, 'water'],
        [/mountain|highland|cliff|peak/i, 'mountain'],
        [/forest|jungle|wood|bamboo|grove/i, 'forest'],
        [/field|meadow|farm|plain|grass|orchard/i, 'plains'],
        [/inside|interior|room|hall/i, 'interior'],
    ];

    function biomeFamily(id) {
        if (!id) return null;
        for (const [rule, family] of FAMILY_RULES) {
            if (rule.test(id)) return family;
        }
        return null;
    }

    function biomeLabel(id) {
        if (!id) return '';
        try {
            if (window.BiomeNames && window.BiomeNames.display) return window.BiomeNames.display(id);
        } catch (e) { /* the id reads well enough on its own */ }
        return String(id).replace(/([a-z])([A-Z])/g, '$1 $2');
    }

    function placeLabel() {
        try {
            if (window.WorldMapReturn && window.WorldMapReturn.placeName && $gameMap) {
                const named = window.WorldMapReturn.placeName($gameMap.mapId());
                if (named) return named;
            }
            if ($gameMap && $dataMapInfos && $dataMapInfos[$gameMap.mapId()]) {
                return $dataMapInfos[$gameMap.mapId()].name || '';
            }
        } catch (e) { /* nowhere in particular, then */ }
        return '';
    }

    // ------------------------------------------------------------ the people
    function members() {
        const party = ($gameParty && $gameParty.members && $gameParty.members()) || [];
        if (typeof $gameSwitches !== "undefined" && $gameSwitches && $gameSwitches.value(100)) {
            const hasBubba = party.some(a => a && a.name && a.name().trim() === "Bubba");
            if (!hasBubba) {
                const bubbaActor = window.PartyRoster?.getBubbaActor?.() || ($gameActors ? $gameActors.actor(2) : null);
                if (bubbaActor) return party.concat(bubbaActor);
            }
        }
        return party;
    }

    function active() {
        return members().length >= 2;
    }

    function needsOf(actor) {
        if (!actor || !window.PartyNeeds || !window.PartyNeeds.getMemberNeeds) return null;
        try {
            return window.PartyNeeds.getMemberNeeds(actor);
        } catch (e) {
            return null;
        }
    }

    const NEED_KEYS = ['hunger', 'sleep', 'hygiene', 'social', 'leisure'];

    function pressingNeed(actor) {
        const needs = needsOf(actor);
        if (!needs) return null;
        let worst = null;
        let low = NEED_LINE;
        for (const key of NEED_KEYS) {
            const value = Number(needs[key]);
            if (!isFinite(value) || value > low) continue;
            worst = key;
            low = value;
        }
        return worst;
    }

    // Everybody has SOMETHING on the floor. Not the same meter necessarily:
    // a party where one is starving, one has not slept and one has not washed
    // in a week is a party in a bad way, and it talks like one.
    function everyoneRunDown() {
        const list = members();
        if (list.length < 2) return false;
        return list.every((actor) => {
            const needs = needsOf(actor);
            if (!needs) return false;
            return NEED_KEYS.some((key) => Number(needs[key]) <= NEED_FLOOR);
        });
    }

    function everyoneBattered() {
        const list = members();
        if (list.length < 2) return false;
        return list.every((actor) => actor && actor.mhp > 0 && actor.hp / actor.mhp < HP_FLOOR);
    }

    // ------------------------------------------------------------ what is new
    // The last thing worth mentioning out of the party diary. Only kinds the
    // bank has a script for, only recent ones, and never the same line twice
    // in a row.
    function worldMinutes() {
        return ($gameVariables && $gameVariables.value(114)) || 0;
    }

    let _lastRecent = '';

    // A diary kind is "battle.boss", and the i18n resolver splits a key on its
    // dots, so a bank key may not contain one: the banks are filed under
    // "battle_boss".
    function recentSection(kind) {
        return String(kind).replace(/\./g, '_');
    }

    function recentTopic() {
        if (!window.Diary || !window.Diary.entries) return null;
        let entries;
        try {
            entries = window.Diary.entries();
        } catch (e) {
            return null;
        }
        if (!entries || !entries.length) return null;
        const now = worldMinutes();
        const options = [];
        for (let i = entries.length - 1, seen = 0; i >= 0 && seen < RECENT_DEPTH; i--, seen++) {
            const entry = entries[i];
            if (!entry || !entry.k) continue;
            if (now - Number(entry.t || 0) > RECENT_MINUTES) break;
            const section = recentSection(entry.k);
            if (!has('script.recent.' + section)) continue;
            const signature = entry.k + '|' + entry.t;
            if (signature === _lastRecent) continue;
            options.push({ kind: section, params: entry.p || {}, signature });
        }
        return pick(options);
    }

    // ------------------------------------------------------------ pending news
    // Something that happened off the map (a counter, a courier) and has not
    // been talked about yet. Kept on $gameTemp: it is worth a conversation for
    // the next few minutes and nothing beyond that, so it has no business in
    // the savegame.
    function pendingList() {
        if (typeof $gameTemp === 'undefined' || !$gameTemp) return null;
        if (!Array.isArray($gameTemp._partyBanterPending)) $gameTemp._partyBanterPending = [];
        return $gameTemp._partyBanterPending;
    }

    // A topic is worth queueing if the bank can answer it either way: as a
    // written script (script.<topic>) or as a reaction everybody gives their own
    // version of (<topic>.opener plus <topic>.opinion.<archetype>, which is how
    // the shop, the crash and the border are all put together).
    function knownTopic(topic) {
        return has('script.' + topic) || has(topic + '.opener');
    }

    function noteEvent(topic, ctx) {
        if (!active()) return;              // one person has nobody to tell
        if (!topic) return;
        if (!knownTopic(topic)) return;
        const list = pendingList();
        if (!list) return;
        list.push({ topic, ctx: ctx || {}, until: Graphics.frameCount + PENDING_LIFE });
        if (list.length > PENDING_MAX) list.splice(0, list.length - PENDING_MAX);
    }

    function takePending() {
        const list = pendingList();
        if (!list || !list.length) return null;
        const now = Graphics.frameCount;
        while (list.length) {
            const next = list.shift();
            if (next && next.until > now) return next;
        }
        return null;
    }

    // ----------------------------------------------------- things just done
    // Everything the party DOES that is worth a word afterwards - a blade
    // forged, a bench dismantled, a field reaped, an hour lost to an arcade
    // cabinet - is already written down the moment it happens, by Core/Diary.js.
    // Rather than reach into two dozen crafting, farming and minigame plugins
    // for a hook apiece, the diary is read on the way back to the map: its
    // newest line becomes the pending topic, and the party talks about it while
    // walking away. One hook, and every plugin that keeps a diary is covered by
    // it, including the ones written after this file.
    //
    // The map is deliberately where it gets said. A forge, a cabinet and a
    // workbench are each their own scene, and a bubble over a menu is nobody's
    // idea of a conversation.
    const DEED_TOPIC = {
        'craft.forge': 'craft',
        'craft.cook': 'craft',
        'craft.alchemy': 'craft',
        'craft.brew': 'craft',
        'build.placed': 'build',
        'build.dismantled': 'dismantle',
        'minigame.played': 'minigame',
        'farm.sown': 'deed',
        'farm.harvested': 'deed',
        'apiary.harvest': 'deed',
        'animal.produce': 'deed',
        'animal.bought': 'deed',
        'mining.stripped': 'deed',
        'tech.researched': 'deed',
        'bestiary.found': 'deed',
        'alien.identified': 'deed',
        'steal.success': 'deed',
        'work.shift': 'deed',
    };

    // What the thing was called, for {deed}: whichever of the diary line's own
    // parameters names the object of it. A line that named nothing queues
    // nothing, since a generic bank with an empty subject is worse than silence.
    const DEED_NAMES = ['item', 'items', 'game', 'plant', 'tech', 'creature',
        'species', 'animal', 'body', 'job', 'programme'];

    function deedLabel(params) {
        if (!params) return '';
        for (const key of DEED_NAMES) {
            const value = params[key];
            if (value !== undefined && value !== null && String(value) !== '') return String(value);
        }
        return '';
    }

    // The newest diary line, if it is recent enough to still be news and has not
    // already been read by this sweep. Signature rather than index: the diary is
    // trimmed as it grows, so a position in it means nothing across a session.
    let _lastDeed = '';

    function sweepDiary() {
        if (!active()) return;
        if (!window.Diary || !window.Diary.entries) return;
        let entries;
        try {
            entries = window.Diary.entries();
        } catch (e) {
            return;                         // a diary that will not open owes us nothing
        }
        if (!entries || !entries.length) return;
        const entry = entries[entries.length - 1];
        if (!entry || !entry.k) return;
        const topic = DEED_TOPIC[entry.k];
        if (!topic) return;
        const signature = entry.k + '|' + entry.t;
        if (signature === _lastDeed) return;
        _lastDeed = signature;
        if (worldMinutes() - Number(entry.t || 0) > DEED_MINUTES) return;
        const params = entry.p || {};
        const ctx = Object.assign({}, params);
        if (topic === 'deed') {
            const label = deedLabel(params);
            if (!label) return;
            ctx.deed = label;
        }
        noteEvent(topic, ctx);
    }

    // --------------------------------------------------------------- context
    function baseContext(cast) {
        const id = biomeId();
        const leader = ($gameParty && $gameParty.leader && $gameParty.leader()) || null;
        return {
            name: cast[0] ? cast[0].name() : '',
            other: cast[1] ? cast[1].name() : '',
            third: cast[2] ? cast[2].name() : '',
            leader: leader ? leader.name() : '',
            biome: biomeLabel(id),
            place: placeLabel(),
            gold: $gameParty ? String($gameParty.gold()) : '',
        };
    }

    // A diary line carries parameters of its own, and some of them are called
    // the same thing as the people standing there: `battle.boss` writes the
    // creature's name into {name}. Rather than let one shadow the other, the
    // cast always owns the bare tokens and everything an event brought with it
    // is offered under an ev_ prefix, so a script asks for {ev_name} when it
    // means the boss and {name} when it means whoever is speaking.
    const RESERVED = ['name', 'other', 'third', 'leader', 'biome', 'place', 'gold'];

    function mergeContext(ctx, extra) {
        if (!extra) return ctx;
        const merged = Object.assign({}, ctx);
        for (const key of Object.keys(extra)) {
            if (key === '_sig') continue;
            merged['ev_' + key] = extra[key];
            if (!RESERVED.includes(key)) merged[key] = extra[key];
        }
        return merged;
    }

    // ------------------------------------------------------------ companions
    // What these two think of each other, as one figure: both directions of the
    // ledger averaged, since a conversation has two sides to it. It is the same
    // number the Empathize panel keeps and the same one NPCConversation weighs
    // the town's tones with. No profile, or no helper to read one with, means no
    // history to read: zero, rather than a guess.
    function mutualOpinion(a, b) {
        const helpers = window.NPCEmpathize && window.NPCEmpathize._helpers;
        const reg = window.NPCSocietyRegistry;
        if (!a || !b || !helpers || !helpers._npcBaseOpinion || !reg || !reg.getProfile) return 0;
        let sum = 0;
        let seen = 0;
        const read = (from, about) => {
            try {
                const profile = reg.getProfile(from.name());
                if (!profile) return;
                sum += Number(helpers._npcBaseOpinion(profile, about.actorId())) || 0;
                seen++;
            } catch (e) { /* a chat never breaks on a missing ledger */ }
        };
        read(a, b);
        read(b, a);
        return seen ? sum / seen : 0;
    }

    // Which half of the companion bank they are in. Whose rations those were and
    // who was snoring is not small talk: it is only said by people who share a
    // camp, and how it is said depends on how the two of them are getting on.
    // `road` is the middle of it, the practical talk of two people with the same
    // map, and it is where a pair with no history between them mostly lands.
    function companionTone(cast) {
        const rel = mutualOpinion(cast[0], cast[1]);
        const w = rel >= 20 ? { warm: 60, road: 32, sore: 8 }
            : rel <= -10 ? { warm: 15, road: 30, sore: 55 }
                : { warm: 40, road: 40, sore: 20 };
        let roll = Math.random() * (w.warm + w.road + w.sore);
        if ((roll -= w.warm) <= 0) return 'warm';
        if ((roll -= w.road) <= 0) return 'road';
        return 'sore';
    }

    // ---------------------------------------------------------------- topics
    // Where the conversation is happening, when that is not simply "outdoors, on
    // foot". A setting brings its own bank in at a strong weight, because a party
    // in a moving vehicle talks about the vehicle; and the two indoor ones drop
    // the biome, since the swamp going past the window is not the room they are
    // sitting in.
    const SETTINGS = {
        driving: { path: 'script.driving', weight: 44, outdoors: true },
        transit: { path: 'script.transit', weight: 46, outdoors: false },
        cabin: { path: 'script.cabin', weight: 46, outdoors: false },
    };

    function chooseTopic(cast, setting) {
        const options = [];
        const where = SETTINGS[setting] || null;
        // `voices` caps how many of the cast a script is shared out between: a
        // companion exchange is an argument or a kindness between TWO of them,
        // and handing its third line to a third member turns it into nonsense.
        const add = (weight, path, extra, voices) => {
            if (weight > 0 && has(path)) options.push({ weight, path, extra: extra || null, voices: voices || 0 });
        };

        // News first, and only once: it stops being news the moment it is out.
        const pending = takePending();
        if (pending) {
            return has(pending.topic + '.opener')
                ? { reaction: pending.topic, extra: pending.ctx }
                : { path: 'script.' + pending.topic, extra: pending.ctx };
        }

        if (where) add(where.weight, where.path);

        if (everyoneBattered()) add(30, 'script.battered');
        if (everyoneRunDown()) add(28, 'script.needAll');

        // Whichever of the two has something on their mind; the speaker's own
        // want first, since they are the one who opened their mouth.
        const need = pressingNeed(cast[0]) || pressingNeed(cast[1]);
        if (need) add(20, 'script.need.' + need);

        const recent = recentTopic();
        if (recent) add(32, 'script.recent.' + recent.kind, Object.assign({ _sig: recent.signature }, recent.params));

        const family = (!where || where.outdoors) ? biomeFamily(biomeId()) : null;
        if (family) add(24, 'script.biome.' + family);

        // The party's own subjects: the watch, the rations, the purse, the pack,
        // who snores. Nobody outside the party can reach this bank.
        add(24, 'script.companion.' + companionTone(cast), null, 2);

        add(26, 'script.general');

        // The personality route is not a script at all: one archetype opens and
        // the other answers, which is where most of the variance comes from.
        options.push({ weight: 34, path: null, extra: null });

        const total = options.reduce((sum, option) => sum + option.weight, 0);
        if (total <= 0) return null;
        let roll = Math.random() * total;
        for (const option of options) {
            roll -= option.weight;
            if (roll <= 0) return option;
        }
        return options[options.length - 1];
    }

    // ----------------------------------------------------------------- beats
    // A closer out of somebody's personality: the third member if there is one,
    // otherwise whoever is not holding the floor. This is what stops two
    // scripted lines from reading the same way every time they come up.
    // `onlySilent` is for a topic where everybody has already had their say (the
    // purchase, where each member gives their own opinion): there, the last word
    // only goes to somebody who has not spoken yet, and otherwise nobody takes
    // it rather than one member answering themselves.
    function appendCloser(beats, cast, onlySilent) {
        const last = beats.length ? beats[beats.length - 1].who : -1;
        const spoken = new Set(beats.map((beat) => beat.who));
        const candidates = [];
        for (let i = 0; i < cast.length; i++) {
            if (i === last) continue;
            if (onlySilent && spoken.has(i)) continue;
            candidates.push(i);
        }
        if (!candidates.length) return;
        // A third member standing there gets the last word more often than not:
        // somebody listening in is exactly who would.
        const who = (cast.length > 2 && candidates.includes(2) && Math.random() < 0.6)
            ? 2 : candidates[Math.floor(Math.random() * candidates.length)];
        const line = pick(personalPool(cast[who], 'closer'));
        if (line) beats.push({ who, text: line });
    }

    function scriptBeats(entry, cast, ctx, voices) {
        const lines = Array.isArray(entry) ? entry : [entry];
        const mouths = Math.max(1, Math.min(voices || cast.length, cast.length));
        const beats = [];
        for (let i = 0; i < lines.length; i++) {
            const text = fill(String(lines[i]), ctx);
            if (unresolved(text)) return null;   // a token nothing answered
            beats.push({ who: i % mouths, text });
        }
        return beats;
    }

    // A thing that just happened, and what each of them makes of it. One member
    // states it out of `<section>.opener` and everybody else answers out of their
    // own archetype, which is the whole point of the shape: the Disciplined one
    // and the Hedonistic one are looking at the same receipt, or the same dented
    // wing, and seeing two different mistakes.
    //
    // The purchase was the first of these; the road brought the rest (a crash, a
    // handover at the wheel, a tank going dry, a border sign).
    function reactionPool(actor, section) {
        const key = personalityKey(actor);
        if (key && has(section + '.opinion.' + key)) return pool(section + '.opinion.' + key);
        if (has(section + '.opinion.any')) return pool(section + '.opinion.any');
        // Nobody has written this archetype's line for this event: they answer
        // the way they answer anything, which is still their own voice.
        return personalPool(actor, 'reply');
    }

    function reactionBeats(section, cast, ctx) {
        const opening = pick(pool(section + '.opener'));
        if (!opening) return null;
        const first = fill(opening, ctx);
        if (unresolved(first)) return null;
        const beats = [{ who: 0, text: first }];
        const judges = [1];
        if (cast.length > 2) judges.push(2);
        else if (Math.random() < 0.45) judges.push(0);
        for (const who of judges) {
            const line = pick(reactionPool(cast[who], section));
            if (!line) continue;
            const text = fill(line, ctx);
            if (!unresolved(text)) beats.push({ who, text });
        }
        return beats.length >= 2 ? beats : null;
    }

    function personalityBeats(cast, ctx) {
        const opener = pick(personalPool(cast[0], 'opener'));
        if (!opener) return null;
        const reply = pick(personalPool(cast[1], 'reply'));
        if (!reply) return null;
        const first = fill(opener, ctx);
        const second = fill(reply, ctx);
        if (unresolved(first) || unresolved(second)) return null;
        return [{ who: 0, text: first }, { who: 1, text: second }];
    }

    // =====================================================================
    // ON THE ROAD
    // =====================================================================
    // Everything above answers a caller. Everything below is a caller: the one
    // that runs while the party is inside a vehicle, where AutoIdleExplorer has
    // no loose walkers to hang a conversation on.

    // The maps the fast travel system carries a seated party through (see
    // travelMaps in FastTravelSystem.js). A vehicle's OWN cabin is not listed
    // here: MergedVehicleSystem.isOnVehicleInteriorMap() already knows which map
    // belongs to which vehicle, and asking it means this file cannot fall out of
    // step with the interiors the vehicle configs declare.
    const TRANSIT_MAPS = [718, 719, 720];          // train, coach, taxi

    // Ambient pacing, in frames. A journey is hours long; a word every minute or
    // two is company, and anything faster is a radio play.
    const TALK_MIN = 60 * 62;
    const TALK_MAX = 60 * 150;

    // A beat is up for as long as it takes to read, which is the same reckoning
    // AutoIdleExplorer uses for a loose conversation.
    function beatFrames(text) {
        return 95 + Math.min(80, Math.round(String(text).length * 1.4));
    }

    // How long each reaction keeps quiet for afterwards. The border is
    // deliberately the rarest: crossing one is only interesting if it is not
    // remarked on every time the party drifts back and forth over a line in the
    // sand.
    const COOLDOWN = {
        crash: 60 * 25,
        handover: 60 * 36,
        fuel: 60 * 180,
        country: 60 * 360,
    };
    // ...and the border also has to win a coin toss to be mentioned at all.
    const COUNTRY_CHANCE = 0.55;

    // Nothing reacts on top of something else being said.
    const REACTION_GAP = 60 * 8;

    // The tank has to fall this low to be worth mentioning, and climb back over
    // the second figure before it is worth mentioning again.
    const FUEL_LOW = 0.20;
    const FUEL_REARM = 0.35;

    // -------------------------------------------------------- where they are
    function onMap() {
        return SceneManager._scene instanceof Scene_Map
            && typeof $gameParty !== 'undefined' && !!$gameParty
            && typeof $gameMap !== 'undefined' && !!$gameMap;
    }

    function ridingVehicle() {
        if (typeof $gamePlayer === 'undefined' || !$gamePlayer) return null;
        return $gamePlayer.isInVehicle() ? $gamePlayer.vehicle() : null;
    }

    function travelSetting() {
        if (!onMap()) return null;
        if (ridingVehicle()) return 'driving';
        if (TRANSIT_MAPS.includes($gameMap.mapId())) return 'transit';
        const vs = window.MergedVehicleSystem;
        if (vs && vs.isOnVehicleInteriorMap && vs.isOnVehicleInteriorMap()) return 'cabin';
        return null;
    }

    function busy() {
        if (!onMap()) return true;
        if ($gameParty.inBattle && $gameParty.inBattle()) return true;
        if (typeof $gameMessage !== 'undefined' && $gameMessage && $gameMessage.isBusy()) return true;
        if ($gameMap.isEventRunning && $gameMap.isEventRunning()) return true;
        return false;
    }

    // ------------------------------------------- who says it, and from where
    // The party member's own body on this map: the player for the leader, the
    // matching follower for everybody else. A follower nobody can see (hidden
    // formation, a vehicle) is no use as a mouth, so the player stands in.
    function characterFor(actor) {
        if (typeof $gamePlayer === 'undefined' || !$gamePlayer) return null;
        const list = members();
        const index = list.indexOf(actor);
        if (index <= 0) return $gamePlayer;
        const followers = $gamePlayer.followers().data();
        const follower = followers[index - 1];
        if (!follower || !follower.isVisible() || follower.isTransparent()) return $gamePlayer;
        return follower;
    }

    // Up to three of them, the one at the wheel first: they are the one with
    // something to say about the road.
    function travelCast() {
        const list = members().filter((a) => !!a && (!a.isDead || !a.isDead()) && !nonSentient(a));
        if (list.length < 2) return null;
        const driver = (window.VehicleCrew && window.VehicleCrew.driver && window.VehicleCrew.driver())
            || ($gameParty && $gameParty.leader());
        const rest = list.filter((a) => a !== driver);
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        const ordered = (driver && list.indexOf(driver) >= 0) ? [driver].concat(rest) : rest;
        return ordered.slice(0, 3);
    }

    // The bubble itself belongs to AutoIdleExplorer: same element, same
    // stylesheet, same Loose Chatter option, whether it is hanging over a
    // follower or over a camper.
    function bubble(char, text) {
        const api = window.AutoIdleExplorer && window.AutoIdleExplorer.bubble;
        if (!api || !char || !text) return;
        api.show(char, text);
    }

    // --------------------------------------------------------- the runner
    // Transient by design: an exchange interrupted by a save, a battle or a map
    // change is simply dropped. Half a remembered conversation is worse than none.
    const travel = {
        queue: [],        // remaining beats: { char, text }
        settingAt: null,  // where the party was when the exchange started
        next: 0,          // frame the next beat is shown on
        nextTalk: 0,      // frame ambient talk may next start
        lastLine: 0,      // frame something was last said
        cool: {},         // kind -> frame that reaction may fire again
        country: null,    // last country id seen (null = not read yet)
        fuelLow: false,   // is the low-tank remark already spent
        mapId: 0,
    };

    function scheduleAmbient() {
        travel.nextTalk = Graphics.frameCount + TALK_MIN
            + Math.floor(Math.random() * (TALK_MAX - TALK_MIN));
    }

    function stopTravel() {
        travel.queue.length = 0;
    }

    // Turn a set of beats into a queue of bubbles. Riding a vehicle, every line
    // comes out of the same hull, so each one is prefixed with the name of
    // whoever said it; standing in a cabin, people have their own bodies and need
    // no label.
    // What an exchange is worth to the people who had it. Everyone standing
    // there took part in it, so everyone is paid.
    function paySocial(people) {
        for (const actor of people || []) {
            if (actor && actor.addSocial) actor.addSocial(BANTER_SOCIAL);
        }
    }

    function enqueue(beats, people, overVehicle) {
        const vehicle = overVehicle ? ridingVehicle() : null;
        const queue = [];
        for (const beat of beats) {
            const actor = people[beat.who];
            if (!actor) continue;
            const char = vehicle || characterFor(actor);
            if (!char) continue;
            const text = vehicle
                ? T(BANK + '.said', { name: actor.name(), line: beat.text })
                : beat.text;
            queue.push({ char, text });
        }
        if (!queue.length) return false;
        paySocial(people);
        travel.queue = queue;
        travel.next = Graphics.frameCount;
        // Remembered so the exchange can be dropped if the party gets out halfway
        // through it: a bubble anchored to a vehicle nobody is in any more would
        // go on hanging over the parked hull.
        travel.settingAt = travelSetting();
        return true;
    }

    function startTravelTalk(opts) {
        const where = travelSetting();
        if (!where && !(opts && opts.topic)) return false;
        const people = travelCast();
        if (!people || people.length < 2) return false;
        let beats = null;
        try {
            beats = PartyBanter.discussion(people, {
                setting: where,
                topic: opts && opts.topic,
                ctx: opts && opts.ctx,
            });
        } catch (e) {
            return false;                   // a conversation never breaks a journey
        }
        if (!beats || !beats.length) return false;
        return enqueue(beats, people, where === 'driving');
    }

    function updateTravel() {
        // Leaving the map still takes effect on the frame it happens, so a
        // bubble never outlives the scene it was raised in.
        if (!onMap()) { stopTravel(); return; }

        // Everything below is polling, and none of it is frame-sensitive: the
        // beats are seconds apart, and the watchers are waiting for a country
        // or a fuel gauge to change. Asking sixty times a second bought
        // nothing over asking ten times a second, which is a tenth of a second
        // of slack on a line of dialogue and cannot be felt from the inside.
        if (window.FrameBudget && !window.FrameBudget.every('partyBanterTravel', 10)) return;

        // A map change ends whatever was being said and re-arms the pacing, so the
        // party does not walk out of a train still finishing a sentence.
        const mapId = $gameMap.mapId();
        if (mapId !== travel.mapId) {
            travel.mapId = mapId;
            stopTravel();
            scheduleAmbient();
        }

        watchCountry();
        watchFuel();

        if (busy()) return;
        const now = Graphics.frameCount;

        // Play out what has already been drawn, one beat at a time.
        if (travel.queue.length) {
            if (travelSetting() !== travel.settingAt) { stopTravel(); return; }
            if (now < travel.next) return;
            const beat = travel.queue.shift();
            bubble(beat.char, beat.text);
            travel.lastLine = now;
            travel.next = now + beatFrames(beat.text);
            if (!travel.queue.length) scheduleAmbient();
            return;
        }

        const where = travelSetting();
        if (!where) return;
        // On the road the clock only runs while the wheels are turning: a vehicle
        // stopped in a field is a party that has got out in all but name.
        if (where === 'driving' && !$gamePlayer.isMoving()) return;
        if (!travel.nextTalk) { scheduleAmbient(); return; }
        if (now < travel.nextTalk) return;
        if (!startTravelTalk({})) scheduleAmbient();
    }

    // ------------------------------------------------------------ reactions
    function react(kind, ctx) {
        if (!kind || !onMap()) return false;
        const now = Graphics.frameCount;
        if (now - travel.lastLine < REACTION_GAP) return false;
        if (travel.cool[kind] && now < travel.cool[kind]) return false;
        if (kind === 'country' && Math.random() > COUNTRY_CHANCE) {
            // A border missed is a border that stays quiet for the full cooldown:
            // otherwise every crossing rolls the dice again a second later.
            travel.cool[kind] = now + (COOLDOWN[kind] || 0);
            return false;
        }
        stopTravel();
        if (!startTravelTalk({ topic: kind, ctx: ctx || {} })) return false;
        travel.cool[kind] = now + (COOLDOWN[kind] || 0);
        return true;
    }

    // What the party is aboard, as the HUD reads it: the vehicle's shown name,
    // its upgrade key, its tank. Null on foot outside a cabin.
    function aboard() {
        const vs = window.MergedVehicleSystem;
        if (!vs || !vs.getHudVehicleStatus) return null;
        try {
            return vs.getHudVehicleStatus();
        } catch (e) {
            return null;
        }
    }

    function vehicleLabel(status) {
        return (status && status.name) || T('VehicleSystem.genericVehicle');
    }

    // A border. Variable 86 is the country the party is standing in
    // (WeatherSystem writes it); the first reading of a session is only
    // remembered, never spoken about, or loading a save would announce the
    // country the party was already in.
    function watchCountry() {
        if (typeof $gameVariables === 'undefined' || !$gameVariables) return;
        const id = Number($gameVariables.value(86)) || 0;
        if (!id) return;
        if (travel.country === null) { travel.country = id; return; }
        if (id === travel.country) return;
        travel.country = id;
        const name = countryName(id);
        if (!name) return;
        react('country', { country: name });
    }

    function countryName(id) {
        try {
            const current = (typeof $gameWeather !== 'undefined' && $gameWeather)
                ? $gameWeather.currentCountry : null;
            if (current && current.id === id && current.country) return String(current.country);
            const list = window.WorldGen && window.WorldGen.Countries;
            if (Array.isArray(list)) {
                const found = list.find((c) => c && c.id === id);
                if (found && found.country) return String(found.country);
            }
        } catch (e) { /* an unnamed country is not worth a line */ }
        return '';
    }

    // The tank, read off the same status the fuel bar draws, so the remark and
    // the HUD can never disagree. Only while somebody is actually driving it: a
    // tank does not empty while the party is asleep in the back of the cabin.
    function watchFuel() {
        const status = aboard();
        if (!status || !status.driving || !status.usesFuel || !(status.maxFuel > 0)) {
            travel.fuelLow = false;
            return;
        }
        const rate = status.fuel / status.maxFuel;
        if (rate > FUEL_REARM) { travel.fuelLow = false; return; }
        if (travel.fuelLow || rate > FUEL_LOW) return;
        travel.fuelLow = true;
        react('fuel', {
            vehicle: vehicleLabel(status),
            fuel: String(Math.max(1, Math.round(rate * 100))),
        });
    }

    // Damage to the vehicle the party is sitting in. Everything that dents a
    // vehicle goes through VehicleUpgrades.applyDamage (a ram on the road, a
    // splash-down, a wall in the driving scene), so that is the one place to
    // listen; hooked on the first map rather than at load, since the repair
    // plugin may not have published its API yet.
    let _damageHooked = false;
    function hookDamage() {
        if (_damageHooked) return;
        const api = window.VehicleUpgrades;
        if (!api || typeof api.applyDamage !== 'function') return;
        _damageHooked = true;
        const original = api.applyDamage;
        api.applyDamage = function (vehicleType, damagePercent, options) {
            const result = original.call(this, vehicleType, damagePercent, options);
            try {
                // Only the party's own crash: damage to a vehicle parked three
                // countries away is not something anybody in here felt.
                const status = aboard();
                if (status && status.driving && status.key === vehicleType && Number(damagePercent) > 0) {
                    react('crash', { vehicle: vehicleLabel(status) });
                }
            } catch (e) { /* the dent still happened */ }
            return result;
        };
    }

    // ------------------------------------------------------------------- API
    const PartyBanter = {
        active,
        personalityKey,
        noteEvent,

        // The whole exchange, in order. `cast` is the party members standing in
        // it, speaker first; `who` on each beat indexes back into it, so the
        // caller decides which character on the map says what.
        //
        // `opts.setting` says where they are when it is not on foot in the open
        // ('driving', 'transit', 'cabin'), which brings that bank into the mix.
        // `opts.topic` names something that has just happened and is to be talked
        // about NOW rather than queued ('crash', 'handover', 'fuel', 'country'),
        // with `opts.ctx` carrying its details.
        discussion(cast, opts) {
            if (!active()) return null;
            const people = (cast || []).filter((actor) => !!actor);
            if (people.length < 2) return null;
            const options = opts || {};

            const ctx = baseContext(people);

            // A reaction is not drawn against the other topics: it is the thing
            // in front of them, and it is why the caller asked.
            if (options.topic) {
                const merged = mergeContext(ctx, options.ctx);
                let beats = reactionBeats(options.topic, people, merged);
                if (!beats) {
                    const entry = pick(pool('script.' + options.topic));
                    beats = entry ? scriptBeats(entry, people, merged) : null;
                }
                if (!beats || beats.length < 2) return null;
                if (beats.length < 4 && Math.random() < 0.45) appendCloser(beats, people, true);
                return beats;
            }

            for (let attempt = 0; attempt < 4; attempt++) {
                const topic = chooseTopic(people, options.setting);
                if (!topic) return null;

                let beats;
                const merged = mergeContext(ctx, topic.extra);
                if (topic.reaction) {
                    beats = reactionBeats(topic.reaction, people, merged);
                } else if (!topic.path) {
                    beats = personalityBeats(people, ctx);
                } else {
                    const entry = pick(pool(topic.path));
                    if (!entry) continue;
                    beats = scriptBeats(entry, people, merged, topic.voices);
                    if (beats && topic.extra && topic.extra._sig) _lastRecent = topic.extra._sig;
                }
                if (!beats || beats.length < 2) continue;

                // Most exchanges get a personality-flavoured last word; a party
                // that always ran to four beats would read as a stage play.
                if (beats.length < 4 && Math.random() < 0.55) {
                    appendCloser(beats, people, !!topic.reaction);
                }
                return beats;
            }
            return null;
        },

        // One bubble, on their own. `key` is either a bare kind ("thought") or
        // the full AutoIdle key the caller already had ("AutoIdle.loose.thought",
        // "AutoIdle.loose.need.hunger"), so the caller does not have to
        // translate. Answers null when the party is one person, which leaves
        // the caller on its own generic bank.
        solo(actor, key) {
            if (!active() || !actor || !key) return null;
            if (nonSentient(actor)) return null;
            const kind = String(key).replace(/^AutoIdle\.loose\./, '');
            if (kind === 'reply') return null;            // that is the town's line
            if (kind === 'greet') return this.strangerGreet(actor);
            if (!/^[\w.]+$/.test(kind)) return null;
            const section = 'solo.' + kind;
            const archetype = personalityKey(actor);
            const own = archetype ? pool(section + '.' + archetype) : [];
            const line = pick(own.length ? own : pool(section + '.any'));
            if (!line) return null;
            const text = fill(line, baseContext([actor]));
            return unresolved(text) ? null : text;
        },

        // How this member opens with somebody who is not one of their own. The
        // stranger's answer stays where it was: it is the town's line, not the
        // party's.
        strangerGreet(actor) {
            if (!active() || !actor) return null;
            if (nonSentient(actor)) return null;
            const line = pick(personalPool(actor, 'stranger'));
            if (!line) return null;
            const text = fill(line, baseContext([actor]));
            return unresolved(text) ? null : text;
        },

        // Something the party DID, for a plugin that keeps no diary line and
        // wants the party to remark on it anyway. `topic` may be one the bank
        // has a reaction for ('craft', 'dismantle', 'build', 'minigame') or
        // left out entirely, in which case it is the generic one and `label`
        // names whatever was done.
        noteDeed(topic, label, ctx) {
            const kind = topic && knownTopic(topic) ? topic : 'deed';
            const extra = Object.assign({}, ctx || {});
            if (label) extra.deed = String(label);
            if (kind === 'deed' && !extra.deed) return;
            noteEvent(kind, extra);
        },

        // Read the diary for the newest thing the party did and queue it. Called
        // on every arrival back on the map; public so a plugin that logs late can
        // ask for the sweep again.
        sweepDiary,

        // Something was bought. Queued rather than said: the counter is a
        // separate scene, and the party has its opinions on the way out.
        noteShopBuy(item, price, place) {
            noteEvent('shop', {
                item: item || '',
                price: price || '',
                shop: place || placeLabel(),
            });
        },

        // ------------------------------------------------------- on the road
        // Where the party is, when it is not on foot in the open.
        travelSetting,

        // A thing that has just happened on the journey, said NOW rather than
        // queued: 'crash', 'handover', 'fuel', 'country'. Answers false when it
        // was turned down (a cooldown, a lost coin toss, a party of one).
        react,

        // Start a travelling exchange this instant, if one fits.
        travelTalk() { return startTravelTalk({}); },

        // Is a travelling exchange still being played out.
        speaking() { return travel.queue.length > 0; },

        stopTravel,

        // Testing seams.
        _travel: travel,
        _travelCast: travelCast,
        // Whether this member has any conversation in them at all. A cast is
        // built by the caller and the beats come back indexed into the array it
        // handed over, so a beast has to be left out at source rather than
        // filtered here (see AutoIdleExplorer's loose-chatter cast).
        canSpeak(actor) { return !!actor && !nonSentient(actor); },
    };

    window.PartyBanter = PartyBanter;

    // ------------------------------------------------------- counter hooks
    // A visit to a counter is one purchase as far as the party is concerned:
    // the thing they will argue about is the most expensive item on the bill,
    // not the six potions underneath it.
    const _Scene_Shop_create = Scene_Shop.prototype.create;
    Scene_Shop.prototype.create = function () {
        _Scene_Shop_create.call(this);
        this._banterBest = null;
    };

    const _Scene_Shop_doBuy = Scene_Shop.prototype.doBuy;
    Scene_Shop.prototype.doBuy = function (number) {
        _Scene_Shop_doBuy.call(this, number);
        const count = Number(number) || 0;
        if (!this._item || count <= 0) return;
        const spent = count * (this.buyingPrice ? this.buyingPrice() : 0);
        if (!this._banterBest || spent > this._banterBest.spent) {
            this._banterBest = { name: this._item.name, spent, count };
        }
    };

    const _Scene_Shop_terminate = Scene_Shop.prototype.terminate;
    Scene_Shop.prototype.terminate = function () {
        const best = this._banterBest;
        this._banterBest = null;
        _Scene_Shop_terminate.call(this);
        if (best) PartyBanter.noteShopBuy(best.name, String(best.spent), placeLabel());
    };

    // Stockbusters and anything else that sells without a counter announces
    // itself through the diary; the party hears about the parcel the same way.
    const _hookOrder = () => {
        if (!window.Diary || !window.Diary.onOrderPlaced || window.Diary._banterHooked) return;
        window.Diary._banterHooked = true;
        const original = window.Diary.onOrderPlaced;
        window.Diary.onOrderPlaced = function (item, price, delivered) {
            original.call(this, item, price, delivered);
            PartyBanter.noteShopBuy(item, String(price || ''), '');
        };
    };
    // Anything the party did in a menu or a minigame scene: the diary already
    // wrote it down, and coming back to the map is when there is somebody to say
    // it to. Read once per arrival, before the pacing is re-armed, so the first
    // exchange out of a smithy is about the smithy.
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);
        _hookOrder();
        hookDamage();
        try { sweepDiary(); } catch (e) { /* the deed still happened */ }
        scheduleAmbient();
    };

    // Everything else a plugin does on purpose. A gameplay plugin command is the
    // one gameplay event with no diary line and no API of its own to hook, so it
    // is caught where all of them pass: a word about "that", rationed to roughly
    // one in several minutes, and only for commands that are plainly the party
    // doing something rather than the engine keeping house.
    const COMMAND_IGNORE = /^(i18n|debug|dev|test|audio|sound|bgm|se|camera|light|weather|hud|ui|menu|window|text|message|picture|screen|save|load|option|config|cheat|log|toast|notify|tooltip|cursor|fade|transition|shader|filter)/i;
    const COMMAND_WORTH = /(craft|forge|smith|dismantle|salvage|scrap|build|place|harvest|gather|mine|dig|fish|cook|brew|distil|alchem|plant|sow|repair|upgrade|install|tame|catch|breed|hunt|loot|open|unlock|pick|play|game|race|duel|bet|trade|research|scan|study|analyse|analyze|forg|enchant|refine|craf)/i;

    let _lastCommandDeed = 0;

    function humanise(name) {
        return String(name || '')
            .replace(/[_-]+/g, ' ')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .trim()
            .toLowerCase();
    }

    if (typeof PluginManager !== 'undefined' && PluginManager.callCommand) {
        const _callCommand = PluginManager.callCommand;
        PluginManager.callCommand = function (self, pluginName, commandName, args) {
            const result = _callCommand.call(this, self, pluginName, commandName, args);
            try {
                const now = Graphics.frameCount;
                if (now - _lastCommandDeed >= DEED_COMMAND_GAP
                    && !COMMAND_IGNORE.test(String(pluginName))
                    && COMMAND_WORTH.test(String(commandName))) {
                    _lastCommandDeed = now;
                    noteEvent('deed', { deed: humanise(commandName) });
                }
            } catch (e) { /* the command still ran */ }
            return result;
        };
    }

    // The travelling talk runs off the map's own update: there is nobody walking
    // about for AutoIdleExplorer to drive it from.
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        try { updateTravel(); } catch (e) { console.error('PartyBanter: ' + e.message); }
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        stopTravel();
        _Scene_Map_terminate.call(this);
    };
})();
