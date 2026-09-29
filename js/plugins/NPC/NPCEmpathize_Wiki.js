/*:
 * @target MZ
 * @plugindesc NPC Empathize: the wiki data layer
 * @author Omni-Lex
 * @base NPCEmpathize
 * @orderAfter NPCEmpathize
 * @orderAfter NPCEmpathize_Scene
 * @help
 * ============================================================================
 * NPCEmpathize_Wiki, part of the NPCEmpathize family
 * ============================================================================
 * Owns SECTION 8b, the WIKI DATA LAYER (Wiki): everything the world knows
 * about a nation, a hyperpower, a leader, an artifact or a faction.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathize_Scene.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";


  // ============================================================================
  // SECTION 8b, WIKI DATA LAYER
  // ============================================================================
  // Aggregates everything the world knows about an entity from the active
  // world folder (history.json via HistoryManager, artifacts.json via
  // WorldManager, npcs.json politics via NPCPolitics) plus the static
  // WorldGen databases, into a single view object the UI can render.

  const Wiki = {
    _index: null,     // exact name        → { type, id }
    _escIndex: null,  // HTML-escaped name → { type, id }
    _linkRegex: null,
    _indexLang: null, // language the index was keyed in

    // Every shelf of the index, as it was last rolled. The rolls are not
    // cheap: listAllLeaders walks the whole book of leaders and sorts it by
    // its localized label, listPeople walks every society profile the world
    // holds, and the Wiki tab asks for ALL of them on every render just to
    // print the count on each card. None of it can change while a panel is
    // open, so each roll is made once per panel and handed back afterwards.
    _lists: null,

    invalidate() {
      this._index = null;
      this._escIndex = null;
      this._linkRegex = null;
      this._indexLang = null;
      this._lists = null;
    },

    // Roll `key` if it has not been rolled since the last invalidate.
    _roll(key, build) {
      const cache = (this._lists ||= {});
      if (cache[key] === undefined) cache[key] = build.call(this);
      return cache[key];
    },

    _hm() { return window.HistoryManager; },

    _generatedArtifacts() {
      if (window.WorldManager) {
        const g = window.WorldManager.getField('artifacts', 'generated');
        if (g) return g;
      }
      return (typeof $gameSystem !== 'undefined' && $gameSystem?._generatedArtifacts) || null;
    },

    // ── entity views ──────────────────────────────────────────────────────────

    listNationNames() {
      const fromHist = Object.keys(this._hm()?.getNationsState?.() || {});
      if (fromHist.length) return fromHist;
      return (window.WorldGen?.Countries || []).map(c => c.country);
    },

    getNation(name) {
      const hm = this._hm();
      const stateInfo  = hm?.getNationState?.(name) || null;
      const staticInfo = (window.WorldGen?.Countries || []).find(c => c.country === name) || null;
      if (!stateInfo && !staticInfo) return null;
      const history    = hm?.getNationHistory?.(name) || [];
      const current    = history.length ? history[history.length - 1] : null;
      const controller = stateInfo?.controller ?? staticInfo?.controller ?? 'Neutral';
      const faction    = stateInfo?.faction ?? staticInfo?.faction ?? 'Neutral';
      const power      = controller !== 'Neutral' ? (window.NPCPolitics?.getPower?.(controller) ?? null) : null;
      // The nation's OWN government, when the world has one for it
      // (NPCPolitics.ensureNation): its head, its chamber and its elections
      // are this article's, the bloc above it has its own article.
      const ownGov     = window.NPCPolitics?.getNation?.(name) ?? null;
      const settlements = Object.values(window.NPCPolitics?.listSettlements?.() || {})
        .filter(s => s.country === name);
      return {
        type: 'nation', name, controller, faction,
        government: current?.government ?? null,
        history, power, ownGov, settlements,
        seasons: staticInfo?.seasons ?? null,
        regionId: staticInfo?.id ?? null,
        events: hm?.getEventsAbout?.(name, 14) ?? [],
      };
    },

    getPower(name) {
      const live = window.NPCPolitics?.getPower?.(name) ?? null;
      const hm   = this._hm();
      const hist = (hm?.getHyperpowers?.() || {})[name] || null;
      if (!live && !hist) return null;
      const nationsState = hm?.getNationsState?.() || {};
      let nations = Object.keys(nationsState).filter(n => nationsState[n]?.controller === name);
      if (!nations.length && live) nations = live.memberCountries || [];
      // Expose holy_leaders for dual-track powers (e.g. Holy Vatican Empire)
      const holyLeaders = hist?.holy_leaders || undefined;
      const currentHoly = hm?._currentHolyLeaders || hm?._histField?.('holyLeaders', {});
      return {
        type: 'power', name, live, hist, nations,
        factions: this.listFactionsOfPower(name),
        holy_leaders: holyLeaders,
        currentHoly: currentHoly?.[name] || null,
        events: hm?.getEventsAbout?.(name, 14) ?? [],
      };
    },

    // The factions that answer to a hyperpower: every Factions.json entry whose
    // `parentHyperpower` is that power's name. No entry stands for the power
    // itself any more, so nothing has to be filtered back out of its own list.
    listFactionsOfPower(name) {
      const hpData = (this._hm()?.getHyperpowers?.() || {})[name] || null;
      if (!hpData) return [];
      const dl = window._NPCSocietyDataLoader;
      const self = window.NPCPolitics?.getPower?.(name) || null;
      // "USSR" and "Soviet Union" are one power under two names, so the entry is
      // recognized through the political registry (which folds the aliases) and
      // not by string equality alone.
      const isSelf = (display) => display === name ||
        (self && window.NPCPolitics?.getPower?.(display) === self);
      const out = [];
      for (const f of (dl?.factions || [])) {
        if (!f || f.parentHyperpower !== name) continue;
        const display = dl.getFactionName?.(f) || ((f.name || '').split('.')[1] || f.name);
        if (display && !isSelf(display)) out.push(display);
      }
      return out.sort((a, b) => a.localeCompare(b));
    },

    // In an empty world nobody outlived 1 January 2000, so anyone the record
    // still has standing is reported dead on that date instead. The two
    // branches below store their dates in different formats (NPCPolitics
    // writes "01 JAN 2000", HistorySimulator writes ISO), and the wiki prints
    // whichever it is given verbatim, so each is answered in its own.
    _emptyWorldDeath(format) {
      const WM = window.WorldManager;
      if (!WM || typeof WM.isEmptyWorld !== "function" || !WM.isEmptyWorld()) return null;
      return { date: format === 'iso' ? '2000-01-01' : '01 JAN 2000', cause: null };
    },

    // The sheet behind a leader: who they are as a character rather than as an
    // office. window.LeaderPersona (HistorySimulator.js) builds it, reading the
    // pre-made dossier where the leader is also one and the world's own record
    // of that character where somebody has already played them. Every leader
    // article carries one, which is what makes the Empathize button on it lead
    // to a person rather than to an empty profile.
    _leaderDossier(name) {
      try { return window.LeaderPersona?.dossierFor?.(name) ?? null; }
      catch (e) { return null; }
    },

    getLeader(name) {
      const hm = this._hm();
      const dossier = this._leaderDossier(name);
      const found = window.NPCPolitics?.findPolitician?.(name);
      if (found) {
        return {
          type: 'leader', kind: 'politician', name: found.pol.name,
          pol: found.pol, power: found.power, dossier,
          record: hm?.getLeaderRecord?.(found.pol.name) ?? null,
          death: found.pol.alive ? this._emptyWorldDeath() : {
            date: found.pol.deathDate ?? null,
            cause: window.NPCPolitics?.textOf?.(found.pol.deathCause) || null,
          },
          events: hm?.getEventsAbout?.(found.pol.name, 12) ?? [],
        };
      }
      const deaths   = hm?.getLeaderDeaths?.() || {};
      const deadList = hm?.getDeadLeaders?.() || [];
      const isDead   = deadList.includes(name) || !!deaths[name];
      const sources = [
        ['power',   hm?.getHyperpowers?.() || {}],
        ['faction', hm?.getHistoricalFactions?.() || {}],
      ];
      for (const [ofType, group] of sources) {
        for (const [groupName, data] of Object.entries(group)) {
          const leader = (data?.leaders || []).find(l => l && l.name === name);
          if (leader) {
            return {
              type: 'leader', kind: 'historical', name,
              leader, of: groupName, ofType, dossier,
              record: hm?.getLeaderRecord?.(name) ?? null,
              death: isDead ? (deaths[name] || { date: null, cause: null })
                            : this._emptyWorldDeath('iso'),
              events: hm?.getEventsAbout?.(name, 12) ?? [],
            };
          }
        }
      }
      // Not seated anywhere, and never was: most of the book is like this at
      // any one moment, and until now those names opened nothing at all. The
      // record itself is the article, with the nation they belong to standing
      // in for the body they served.
      const record = hm?.getLeaderRecord?.(name) ?? null;
      if (record) {
        return {
          type: 'leader', kind: 'historical', name,
          leader: record, of: record.country || null, ofType: 'nation',
          dossier, record,
          death: isDead ? (deaths[name] || { date: null, cause: null })
                        : this._emptyWorldDeath('iso'),
          events: hm?.getEventsAbout?.(name, 12) ?? [],
        };
      }
      return null;
    },

    // `key` is "kind:id" (e.g. "weapon:1503") or an artifact name.
    getArtifact(key) {
      const hm = this._hm();
      const records = hm?.getArtifactRecords?.() || {};
      const generated = this._generatedArtifacts();
      let kind = null, id = null, rec = null;
      const m = String(key).match(/^(item|weapon|armor):(\d+)$/);
      if (m) {
        kind = m[1]; id = Number(m[2]);
        rec = records[key] || null;
      } else {
        for (const r of Object.values(records)) {
          if (r?.name === key) {
            rec = r; kind = r.kind; id = r.id;
            break;
          }
        }
        if (kind === null && generated) {
          for (const [kk, list] of [['item', generated.items], ['weapon', generated.weapons], ['armor', generated.armors]]) {
            const hit = (list || []).find(a => a?.name === key);
            if (hit) { kind = kk; id = hit.id; break; }
          }
        }
      }
      if (kind === null) return null;
      let data = null;
      if (generated) {
        const list = kind === 'item' ? generated.items : kind === 'weapon' ? generated.weapons : generated.armors;
        data = (list || []).find(a => a?.id === id) || null;
      }
      if (!data) {
        const db = kind === 'item' ? (typeof $dataItems !== 'undefined' && $dataItems)
                 : kind === 'weapon' ? (typeof $dataWeapons !== 'undefined' && $dataWeapons)
                 : (typeof $dataArmors !== 'undefined' && $dataArmors);
        data = (db && db[id]) || null;
      }
      if (!data && !rec) return null;
      const artifactName = data?.name ?? rec?.name ?? key;
      return {
        type: 'artifact', key: `${kind}:${id}`, kind, id,
        name: artifactName, data, rec,
        events: hm?.getEventsAbout?.(artifactName, 10) ?? [],
      };
    },

    getFaction(name) {
      // The party's own banner is not in Factions.json (see the player faction
      // section of NPC/FactionDataManager.js): it is asked for by name and
      // answers with a page built out of the roll it is carrying.
      const own = window.$gameFactions?.playerFaction?.();
      if (own && own.name === name) {
        const roster = window.$gameFactions.playerFactionRoster();
        const stats = window.$gameFactions.playerFactionStats();
        return {
          type: 'faction', name, hist: null,
          dlFaction: Object.assign({}, own, stats), dlIndex: -1,
          members: roster.party.concat(roster.army),
          // These are companions and hired soldiers, not catalogued NPCs, so
          // the members tab prints them without a wiki link that leads nowhere.
          plainMembers: true,
          parentPower: own.parentHyperpower || null,
          events: [],
        };
      }
      const hm = this._hm();
      const hist = (hm?.getHistoricalFactions?.() || {})[name] || null;
      const dl = window._NPCSocietyDataLoader;
      let dlIndex = -1, dlFaction = null;
      (dl?.factions || []).forEach((f, i) => {
        if (dlFaction) return;
        const display = dl.getFactionName?.(f)
          || ((f?.name || '').split('.')[1] || f?.name || '');
        if (display === name || f?.name === name) { dlIndex = i; dlFaction = f; }
      });
      if (!hist && !dlFaction) return null;
      const members = [];
      if (dlIndex >= 0 && typeof $gameSystem !== 'undefined') {
        for (const [npcName, prof] of Object.entries($gameSystem?._npcSociety || {})) {
          if (prof?.factionIndex === dlIndex) {
            members.push(npcName);
            if (members.length >= 24) break;
          }
        }
      }
      // The power this faction answers to is named outright in Factions.json.
      const parentPower = dlFaction?.parentHyperpower || null;
      return {
        type: 'faction', name, hist, dlFaction, dlIndex, members, parentPower,
        events: hm?.getEventsAbout?.(name, 14) ?? [],
      };
    },

    // A NPCPolitics party, wherever it is seated (a party id already carries
    // its own power, e.g. "party_HolyVaticanEmpire_0", but the wiki only ever
    // has the bare id, so this is a real search rather than a parse).
    getParty(id) {
      const found = window.NPCPolitics?.findParty?.(id);
      if (!found) return null;
      const { power, party } = found;
      const leader = power.politicians?.[party.leaderId] || null;
      return {
        type: 'party', id: party.id, name: party.name,
        party, power, leader,
        ideology: window.NPCShared?.ideologyById?.(party.ideologyId) || null,
      };
    },

    // A creed from js/db/WorldGen/Ideology.json, with every live party (across
    // every hyperpower) currently standing on it, since more than one always
    // can. `id` is the ideology's own id, not a slot index.
    getIdeology(id) {
      const list = window.NPCShared?.ideologyList?.() || [];
      const ideo = list.find(e => e && e.id === id) || null;
      if (!ideo) return null;
      const parties = (window.NPCPolitics?.listAllParties?.() || [])
        .filter(({ party }) => party.ideologyId === id)
        .map(({ party, powerName }) => ({ party, powerName }));
      const label = window.T ? window.T(ideo.name) : ideo.id;
      return { type: 'ideology', id: ideo.id, name: label, ideo, parties };
    },

    // One of the worlds the Omega Tower's floors open onto
    // (DungeonFloorSystem.js, window.TowerWorlds). Listed on the Omega Tower
    // half of the wiki's front page (listWorlds, listIn), never among Earth's
    // shelves.
    getWorld(id) {
      const TW = window.TowerWorlds;
      if (!TW?.byId) return null;
      let world = null;
      try { world = TW.byId(id) || TW.worldOfName?.(id) || null; } catch (e) { return null; }
      if (!world) return null;
      // Its government, where it seats one. An Earthling colony keeps Earth's,
      // so it is looked up by the nation its people vote in instead.
      const power = world.earthborn ? null
        : (window.NPCPolitics?.getPower?.(world.powerName) || null);
      const parties = power
        ? (world.parties || []).map(p => window.NPCPolitics?.getPartyOf?.(world.powerName, p.id) || p)
        : (world.parties || []).slice();
      return {
        type: 'world', id: world.id, name: world.name,
        world, power, parties,
        // The one place it can be reached from.
        floor: world.floor,
      };
    },

    get(type, id) {
      // Old faction names may now be hyperpowers - redirect if not found as faction
      if (type === 'faction') {
        const f = this.getFaction(id);
        if (f) return f;
        const p = this.getPower(id);
        if (p) return { ...p, type: 'faction' };
        return null;
      }
      switch (type) {
        case 'nation':   return this.getNation(id);
        case 'power':    return this.getPower(id);
        case 'leader':   return this.getLeader(id);
        case 'artifact': return this.getArtifact(id);
        case 'party':    return this.getParty(id);
        case 'ideology': return this.getIdeology(id);
        // Unlisted on purpose: reachable only by a link.
        case 'world':    return this.getWorld(id);
      }
      return null;
    },

    // ── favourites ───────────────────────────────────────────────────────────
    // A reading list the player keeps: any article can be starred, and the
    // stars sit on the savegame rather than on the world, because what one
    // party wanted to remember is not what the next one does. An entry is the
    // same (type, id) pair every other wiki route uses, with the name it was
    // starred under kept beside it so the shelf can be drawn without resolving
    // every article first - which matters for the worlds the Omega Tower's
    // floors open onto, since those are rolled per world and are listed
    // nowhere else.
    _favList() {
      if (typeof $gameSystem === 'undefined' || !$gameSystem) return [];
      if (!Array.isArray($gameSystem._npcWikiFavourites)) $gameSystem._npcWikiFavourites = [];
      return $gameSystem._npcWikiFavourites;
    },

    isFavourite(type, id) {
      const sid = String(id);
      return this._favList().some(f => f && f.type === type && String(f.id) === sid);
    },

    // Returns the new state: true when it has just been starred.
    toggleFavourite(type, id, name) {
      const list = this._favList();
      const sid  = String(id);
      const at   = list.findIndex(f => f && f.type === type && String(f.id) === sid);
      if (at >= 0) { list.splice(at, 1); return false; }
      list.push({ type, id: sid, name: String(name || id) });
      return true;
    },

    // The shelf itself, newest star first, with each name refreshed off the
    // article where the article still exists.
    listFavourites() {
      return this._favList().slice().reverse().map(f => {
        let name = f.name;
        try {
          const view = f.type === 'npc' ? null : this.get(f.type, f.id);
          if (view?.name) name = view.name;
        } catch (_) {}
        return { type: f.type, id: f.id, name: name || f.id };
      });
    },

    // ── index listings (Wiki tab grids) ──────────────────────────────────────

    // Every known NPC: society profiles (anyone ever met/simulated) plus the
    // template pools of every map group, so the whole population is browsable
    // and remotely inspectable even before being encountered.
    listPeople() { return this._roll('people', this._listPeople); },
    _listPeople() {
      const people = new Map(); // name → { name, group }
      const society = (typeof $gameSystem !== 'undefined' && $gameSystem?._npcSociety) || {};
      for (const [name, prof] of Object.entries(society)) {
        people.set(name, { name, group: prof?._homeGroupName ?? null });
      }
      const sys = window.NPCSystem;
      if (sys?.getGroupNames && sys?.getNPCNamesByGroup) {
        for (const groupName of sys.getGroupNames()) {
          for (const name of sys.getNPCNamesByGroup(groupName)) {
            if (!people.has(name)) people.set(name, { name, group: groupName });
          }
        }
      }
      return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    // Everybody who ever held an office in this world, book or not. The two
    // wiki shelves above are cut out of this one roll.
    listAllLeaders() { return this._roll('allLeaders', this._listAllLeaders); },
    _listAllLeaders() {
      const hm = this._hm();
      const deaths = hm?.getLeaderDeaths?.() || {};
      const deadList = new Set(hm?.getDeadLeaders?.() || []);
      // `ofType` says which vocabulary names the body they served, so the
      // listing can label a faction and a hyperpower each in its own terms.
      const out = new Map(); // name → { name, of, ofType, dead }
      const addFrom = (group, ofType) => {
        for (const [groupName, data] of Object.entries(group || {})) {
          for (const l of (data?.leaders || [])) {
            if (l?.name && !out.has(l.name)) {
              out.set(l.name, { name: l.name, of: groupName, ofType,
                                dead: deadList.has(l.name) || !!deaths[l.name] });
            }
          }
        }
      };
      addFrom(hm?.getHyperpowers?.(), 'power');
      addFrom(hm?.getHistoricalFactions?.(), 'faction');
      // Everyone else in the book. A leader is in Leaders.json whether or not
      // any power has seated them yet, and a name that never took an office
      // still has a life, a face and an article: leaving them out of the index
      // was the only reason most of the cast could not be looked up at all.
      for (const rec of (hm?.listLeaderRecords?.() || [])) {
        if (!rec?.name || out.has(rec.name)) continue;
        out.set(rec.name, { name: rec.name, of: rec.country || null, ofType: 'nation',
                            dead: deadList.has(rec.name) || !!deaths[rec.name] });
      }
      // Nobody NPCPolitics invented is listed here. A politician the world
      // made up has an article of their own and a category of their own
      // (listPoliticians): Leaders is the book, and the book is written down.
      // Sorted by the label the listing prints, not by the id behind it, so the
      // A-Z of the page is the A-Z the reader sees.
      const label = n => (window.WorldNames ? window.WorldNames.leader(n) : n);
      return [...out.values()].sort((a, b) => label(a.name).localeCompare(label(b.name)));
    },

    // The cast splits in two, and the wiki gives each half its own shelf.
    //
    // MAIN PLAYERS are the people the book wrote down: Leaders.json, the real
    // historical figures and the canon characters, each with a hand-written
    // record behind them. LEADERS is everybody else the world happened to
    // seat - a power whose roster ran out, a faction's own officers - whose
    // whole biography is simulated (LeaderPersona). Both open the same kind of
    // article; the difference is who wrote the person.
    _isBookLeader(name) {
      try { return !!window.LeaderPersona?.isBookLeader?.(name); }
      catch (e) { return false; }
    },

    listMainPlayers() { return this._roll('mainPlayers', this._listMainPlayers); },
    _listMainPlayers() {
      return this.listAllLeaders().filter(l => this._isBookLeader(l.name));
    },

    // The wiki's Leaders shelf: the procedural half of the cast, whose lives
    // the world simulated rather than a writer writing them.
    listLeaders() { return this._roll('leaders', this._listLeaders); },
    _listLeaders() {
      return this.listAllLeaders().filter(l => !this._isBookLeader(l.name));
    },

    // The other half of the political class: everybody NPCPolitics elected,
    // deposed and buried without a historian ever writing them down. A
    // politician who IS in the book (a real leader the world seated, see
    // NPCPolitics.makePolitician) is listed under Leaders instead, so nobody
    // appears twice.
    listPoliticians() { return this._roll('politicians', this._listPoliticians); },
    _listPoliticians() {
      const state = (typeof $gameSystem !== 'undefined' && $gameSystem?._npcPolitics) || {};
      const book = this._hm();
      const out = new Map();
      const collect = (polities, ofType) => {
        for (const polity of Object.values(polities || {})) {
          for (const pol of Object.values(polity?.politicians || {})) {
            if (!pol?.name || out.has(pol.name)) continue;
            if (pol.real || (book?.getLeaderRecord && book.getLeaderRecord(pol.name))) continue;
            out.set(pol.name, {
              name: pol.name, of: polity.name, ofType,
              office: pol.office || null, dead: !pol.alive,
            });
          }
        }
      };
      collect(state.powers, 'power');
      collect(state.nations, 'nation');
      const label = n => (window.WorldNames ? window.WorldNames.leader(n) : n);
      return [...out.values()].sort((a, b) => label(a.name).localeCompare(label(b.name)));
    },

    listPowerNames() { return this._roll('powers', this._listPowerNames); },
    _listPowerNames() {
      const set = new Set(Object.keys(this._hm()?.getHyperpowers?.() || {}));
      for (const n of (window.NPCPolitics?.listPowers?.() || [])) set.add(n);
      // Sorted by the label, not the id: see listLeaders.
      const label = n => (window.WorldNames ? window.WorldNames.power(n) : n);
      return [...set].sort((a, b) => label(a).localeCompare(label(b)));
    },

    listNations() { return this._roll('nations', this._listNations); },
    _listNations() {
      const states = this._hm()?.getNationsState?.() || {};
      const label = n => (window.WorldNames ? window.WorldNames.nation(n) : n);
      return this.listNationNames()
        .map(name => ({ name, controller: states[name]?.controller ?? null }))
        .sort((a, b) => label(a.name).localeCompare(label(b.name)));
    },

    listFactionNames() { return this._roll('factions', this._listFactionNames); },
    _listFactionNames() {
      const set = new Set(Object.keys(this._hm()?.getHistoricalFactions?.() || {}));
      const dl = window._NPCSocietyDataLoader;
      for (const f of (dl?.factions || [])) {
        const display = dl.getFactionName?.(f) || ((f?.name || '').split('.')[1] || f?.name);
        if (display) set.add(display);
      }
      // A hyperpower is never listed among the factions: Factions.json carries
      // an entry for each power (its own household, e.g. "Britannia" under the
      // power Britannia), and that entry belongs to the Hyperpowers index. Each
      // power's page lists the orders that answer to it instead.
      // ...and the party's own banner, which is world state rather than a
      // shipped entry (NPC/FactionDataManager.js, the player faction section).
      const own = window.$gameFactions?.playerFaction?.();
      if (own && own.name) set.add(own.name);
      const powers = new Set(this.listPowerNames());
      const label = n => (window.WorldNames ? window.WorldNames.faction(n) : n);
      return [...set].filter(n => !powers.has(n))
        .sort((a, b) => label(a).localeCompare(label(b)));
    },

    // Every party currently seated anywhere (power attached), for the wiki's
    // Political Parties index; multiple entries can and do share an ideology.
    listPartyNames() { return this._roll('parties', this._listPartyNames); },
    _listPartyNames() {
      return (window.NPCPolitics?.listAllParties?.() || [])
        .map(({ party, powerName }) => ({ id: party.id, name: party.name, powerName, ideologyId: party.ideologyId }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    // Every non-alien creed in Ideology.json, so the Ideologies index is the
    // whole shelf and not only the handful presently in office; each carries
    // how many live parties currently hold it.
    listIdeologyNames() { return this._roll('ideologies', this._listIdeologyNames); },
    _listIdeologyNames() {
      const list = window.NPCShared?.ideologyList?.() || [];
      const parties = window.NPCPolitics?.listAllParties?.() || [];
      const label = e => (window.T ? window.T(e.name) : e.id);
      return list
        .filter(e => e && !e.alien)
        .map(e => ({
          id: e.id, name: e.name,
          partyCount: parties.reduce((n, { party }) => n + (party.ideologyId === e.id ? 1 : 0), 0),
        }))
        .sort((a, b) => (b.partyCount - a.partyCount) || label(a).localeCompare(label(b)));
    },

    listArtifacts() { return this._roll('artifacts', this._listArtifacts); },
    _listArtifacts() {
      const out = [];
      const seen = new Set();
      const generated = this._generatedArtifacts();
      if (generated) {
        for (const [kind, list] of [['item', generated.items], ['weapon', generated.weapons], ['armor', generated.armors]]) {
          for (const a of (list || [])) {
            if (a) { out.push({ key: `${kind}:${a.id}`, name: a.name, kind, iconIndex: a.iconIndex }); seen.add(`${kind}:${a.id}`); }
          }
        }
      }
      for (const [key, r] of Object.entries(this._hm()?.getArtifactRecords?.() || {})) {
        if (!seen.has(key)) out.push({ key, name: r.name, kind: r.kind, iconIndex: 245 });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    // ── Earth and the Omega Tower ────────────────────────────────────────────
    // The front page is split in two: what belongs to Earth, and what the
    // tower's floors rolled for this world. Every shelf above holds both
    // halves mixed; listIn(cat, realm) cuts one of them out. A thing is the
    // tower's when it answers to a tower world's government or lives in one
    // of its settlement groups (window.TowerWorlds).

    _towerPowerSet() {
      return this._roll('towerPowers', () => {
        try { return new Set(window.TowerWorlds?.powerNames?.() || []); }
        catch (e) { return new Set(); }
      });
    },

    isTowerPower(name) { return !!name && this._towerPowerSet().has(name); },

    _isTowerGroup(group) {
      try { return !!(group && window.TowerWorlds?.isTowerGroup?.(group)); }
      catch (e) { return false; }
    },

    // Every world the tower opens onto, top floor first, the cellars last.
    listWorlds() { return this._roll('worlds', this._listWorlds); },
    _listWorlds() {
      let all = [];
      try { all = window.TowerWorlds?.all?.() || []; } catch (e) { all = []; }
      return all.filter(Boolean).slice().sort((a, b) => b.floor - a.floor);
    },

    // The creeds one half of the setting stands on. Earth's shelf is the whole
    // non-alien book as before; the tower's is only what its benches hold,
    // alien creeds included, since those are what a floor world votes for.
    _listIdeologiesIn(tower) {
      const list = window.NPCShared?.ideologyList?.() || [];
      const counts = new Map();
      for (const { party, powerName } of (window.NPCPolitics?.listAllParties?.() || [])) {
        if (!party || this.isTowerPower(powerName) !== tower) continue;
        counts.set(party.ideologyId, (counts.get(party.ideologyId) || 0) + 1);
      }
      const label = e => (window.T ? window.T(e.name) : e.id);
      return list
        .filter(e => e && (tower ? counts.has(e.id) : !e.alien))
        .map(e => ({ id: e.id, name: e.name, partyCount: counts.get(e.id) || 0 }))
        .sort((a, b) => (b.partyCount - a.partyCount) || label(a).localeCompare(label(b)));
    },

    // One shelf of the front page, for 'earth' or 'tower'. Null for a shelf
    // the wiki draws off something else (favourites, the party).
    listIn(cat, realm) {
      const tower = realm === 'tower';
      const byPower = (list, key) => list.filter(e => this.isTowerPower(key(e)) === tower);
      switch (cat) {
        case 'worlds':      return tower ? this.listWorlds() : [];
        case 'people':      return this.listPeople().filter(p => this._isTowerGroup(p.group) === tower);
        case 'mainPlayers': return byPower(this.listMainPlayers(), l => l.of);
        case 'leaders':     return byPower(this.listLeaders(), l => l.of);
        case 'politicians': return byPower(this.listPoliticians(), p => p.of);
        case 'powers':      return byPower(this.listPowerNames(), n => n);
        case 'politicalParties': return byPower(this.listPartyNames(), p => p.powerName);
        case 'ideologies':  return this._roll('ideologies:' + (tower ? 'tower' : 'earth'),
                              () => this._listIdeologiesIn(tower));
        case 'nations':     return tower ? [] : this.listNations();
        case 'artifacts':   return tower ? [] : this.listArtifacts();
        case 'factions':    return tower ? [] : this.listFactionNames();
      }
      return null;
    },

    // ── name index & hyperlink pattern ───────────────────────────────────────

    _escapeForIndex(str) {
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    buildIndex() {
      // The index is keyed by the text a sentence contains, and that text is
      // written in the language being played, so it is rebuilt on a switch.
      const lang = (window.T && typeof T.language === 'function') ? T.language() : 'en';
      if (this._index && this._indexLang === lang) return this._index;
      this._indexLang = lang;
      this._linkRegex = null;
      const idx = new Map();
      const esc = new Map();
      const register = (name, entry) => {
        if (!name || String(name).length < 3 || idx.has(name)) return;
        idx.set(name, entry);
        esc.set(this._escapeForIndex(name), entry);
      };
      const add = (name, type, id) => {
        if (!name || String(name).length < 3) return;
        name = String(name);
        const entry = { type, id };
        register(name, entry);
        // A nation, hyperpower, faction or leader is indexed under its English
        // id because that is what the record stores, but the prose being
        // linkified reads its localized label. Both spellings open the same
        // article: a world simulated in English still holds English sentences.
        if (window.WorldNames) register(window.WorldNames.any(name), entry);
      };
      const hm = this._hm();
      for (const n of Object.keys(hm?.getHyperpowers?.() || {})) add(n, 'power', n);
      for (const n of (window.NPCPolitics?.listPowers?.() || [])) add(n, 'power', n);
      for (const n of Object.keys(hm?.getHistoricalFactions?.() || {})) add(n, 'faction', n);
      add(window.$gameFactions?.playerFaction?.()?.name, 'faction', window.$gameFactions?.playerFaction?.()?.name);
      for (const n of this.listNationNames()) add(n, 'nation', n);
      for (const data of Object.values(hm?.getHyperpowers?.() || {}))
        for (const l of (data?.leaders || [])) add(l?.name, 'leader', l?.name);
      for (const data of Object.values(hm?.getHistoricalFactions?.() || {}))
        for (const l of (data?.leaders || [])) add(l?.name, 'leader', l?.name);
      const powers = (typeof $gameSystem !== 'undefined' && $gameSystem?._npcPolitics?.powers) || {};
      for (const p of Object.values(powers))
        for (const pol of Object.values(p?.politicians || {})) add(pol?.name, 'leader', pol?.name);
      for (const p of Object.values(powers))
        for (const party of (p?.parties || [])) add(party?.name, 'party', party?.id);
      for (const [key, r] of Object.entries(hm?.getArtifactRecords?.() || {})) add(r?.name, 'artifact', key);
      const generated = this._generatedArtifacts();
      if (generated) {
        for (const [kind, list] of [['item', generated.items], ['weapon', generated.weapons], ['armor', generated.armors]])
          for (const a of (list || [])) add(a?.name, 'artifact', `${kind}:${a.id}`);
      }
      this._index = idx;
      this._escIndex = esc;
      return idx;
    },

    resolve(name) { return this.buildIndex().get(String(name)) || null; },
    resolveEscaped(escapedName) {
      this.buildIndex();
      return this._escIndex.get(String(escapedName)) || null;
    },

    // Regex matching every known entity name inside *escaped* HTML text,
    // longest names first so "Holy Vatican Empire" beats "Vatican".
    linkPattern() {
      if (this._linkRegex !== null) return this._linkRegex || null;
      this.buildIndex();
      const names = [...this._escIndex.keys()]
        .sort((a, b) => b.length - a.length)
        .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      this._linkRegex = names.length
        ? new RegExp(`(?<![\\w&])(${names.join('|')})(?![\\w;])`, 'g')
        : false;
      return this._linkRegex || null;
    },
  };

  Object.assign(window.NPCEmpathize._internal, {
    Wiki,
  });
})();
