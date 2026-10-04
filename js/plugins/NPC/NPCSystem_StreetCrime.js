/*:
 * @target MZ
 * @plugindesc NPC System: street crime, bounties, the police and visiting parties
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Residents
 * @help
 * ============================================================================
 * NPCSystem_StreetCrime, part of the NPCSystem family
 * ============================================================================
 * Owns StreetCrime, NPCBounty, PoliceForce, VisitingParties (window.PartyPresence)
 * and the visiting-party map hooks (the visitor sprite, the save record).
 * The VisitorInteract plugin command stays in NPCSystem.js.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Residents.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    buildNPCCharacterPool, Config, GoneRegistry, GroupRegistry, MapManager, NPCPoolStore,
    pickNPCCharacter, pluginName, ResidentRegistry, SpawnManager, Utils,
  } = window.NPCSystem._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let isZombieWalker;
  window.NPCSystem._internal._late.push(() => ({ isZombieWalker } = window.NPCSystem._internal));

  // ==========================================================================
  // STREET CRIME
  // ==========================================================================
  // The people on a map do not only wander past each other. Somebody of low
  // morality (profile.moralityScore) standing near a mark may pick their
  // pocket; a pocket picked badly is noticed and turns into a fight; two
  // people who cannot stand each other (a relationship opinion well below
  // zero) may come to blows on their own. A fight ends with one of them lying
  // on the ground, drawn on their side like a knocked-out party member, for a
  // while.
  //
  // Every crime is filed on the offender's life record (NPCLifeSim
  // .addLiveCrime), which is what puts a bounty on their head, and the party
  // hears about it through a ParchmentToast whatever it is doing on the map.
  // Rolled with Math.random: this is the live street, not the seeded world.
  const StreetCrime = {
    TICK_FRAMES: 240,          // one look at the street every four seconds
    CRIMINAL_BELOW: -30,       // moralityScore at or under this may steal
    STEAL_CHANCE: 0.1,         // per criminal per tick, with a mark in reach
    NOTICE_CHANCE: 0.4,        // the mark feels the hand in their pocket
    GRUDGE_BELOW: -30,         // relationship opinion that can turn into blows
    GRUDGE_CHANCE: 0.04,
    REACH: 3,                  // tiles between thief and mark
    STEAL_SHARE: [0.05, 0.2],  // of the mark's money
    STEAL_CAP: 5000,           // gold, 50 euros
    FIGHT_MS: 3500,
    KNOCKOUT_MS: 25000,
    VALUABLE_CHANCE: 0.25,     // a hand that finds money may find a piece too
    _frame: 0,

    // Who on this map can act at all: a live controller, awake, on their feet,
    // not busy with the party or a conversation.
    BUSY: ["sleeping", "sitting", "talkingToPlayer", "conversing", "brawling", "knockedOut", "yielding", "goingToBed"],
    _able(c) {
      if (!c?.event || c.event._erased || c.isStory) return false;
      if (StreetCrime.BUSY.includes(c.state)) return false;
      if (isZombieWalker(c.event)) return false;
      const p = $gameSystem._npcSociety?.[c.eventName];
      if (!p || p._officer) return false;
      return !window.NPCCreature?.isNonSentientProfile?.(p);
    },

    // On the Goblin Horde's ground (window.HordeGround) the street is far
    // rougher: more of the town is willing to steal, the willing try more
    // often, a smaller grudge comes to blows, and strangers brawl for nothing
    // at all. `chaos` is 0..1; every rate stays bounded (at most three times
    // the ordinary one, a brawl chance of BRAWL_CHANCE at the very worst).
    BRAWL_CHANCE: 0.012,
    rates(chaos) {
      const c = Math.max(0, Math.min(1, Number(chaos) || 0));
      return {
        criminalBelow: StreetCrime.CRIMINAL_BELOW + 40 * c,
        steal: StreetCrime.STEAL_CHANCE * (1 + 2 * c),
        grudgeBelow: StreetCrime.GRUDGE_BELOW + 25 * c,
        grudge: StreetCrime.GRUDGE_CHANCE * (1 + 2 * c),
        brawl: StreetCrime.BRAWL_CHANCE * c,
      };
    },

    update() {
      if (++StreetCrime._frame < StreetCrime.TICK_FRAMES) return;
      StreetCrime._frame = 0;
      if (!$gameMap || !$gameSystem || $gameMap.isEventRunning()) return;
      if (Config.isEmptyWorld() || window.WorldManager?.isMonsterWorld?.()) return;
      const ctrls = ($gameSystem.npcControllers || []).filter(c => StreetCrime._able(c));
      if (ctrls.length < 2) return;
      const society = $gameSystem._npcSociety || {};
      let chaos = 0;
      try { chaos = window.HordeGround?.chaos?.() || 0; } catch (_) { chaos = 0; }
      const r = StreetCrime.rates(chaos);
      for (const c of ctrls) {
        if (!StreetCrime._able(c)) continue; // taken up earlier this tick
        const p = society[c.eventName];
        const near = ctrls.filter(o => o !== c && StreetCrime._able(o) &&
          Utils.manhattan(o.event.x, o.event.y, c.event.x, c.event.y) <= StreetCrime.REACH);
        if (!near.length) continue;
        if ((p.moralityScore ?? 0) <= r.criminalBelow && Math.random() < r.steal) {
          // Nobody picks the pocket of somebody who looks like they would
          // break the hand that tried (their Intimidation look, 0-100).
          const marks = near.filter(o => (society[o.eventName]?.money || 0) > 0 &&
            Math.random() * 100 >= (society[o.eventName]?.intimidation || 0) * 0.8);
          if (marks.length) { StreetCrime.pickpocket(c, marks[Math.floor(Math.random() * marks.length)]); continue; }
        }
        const foe = near.find(o => (p.relationships?.[o.eventName]?.opinion ?? 0) <= r.grudgeBelow);
        if (foe && Math.random() < r.grudge) {
          StreetCrime.fight(c, foe, { aggressor: c });
        } else if (r.brawl > 0 && Math.random() < r.brawl) {
          StreetCrime.fight(c, near[Math.floor(Math.random() * near.length)], { aggressor: c });
        }
      }
    },

    // A hand in somebody's pocket. Filed as pickpocketing whether or not it is
    // noticed; noticed, it turns into a fight over the money.
    pickpocket(thief, mark) {
      const society = $gameSystem._npcSociety || {};
      const tp = society[thief.eventName], mp = society[mark.eventName];
      if (!tp || !mp) return false;
      // A beast picks no pocket: it holds no euros (NPCCreature.mayHoldMoney).
      if (window.NPCCreature?.mayHoldMoney?.(tp, thief.eventName) === false) return false;
      const [lo, hi] = StreetCrime.STEAL_SHARE;
      const share = lo + Math.random() * (hi - lo);
      const amount = Math.max(1, Math.min(StreetCrime.STEAL_CAP, Math.floor((mp.money || 0) * share)));
      mp.money = Math.max(0, (mp.money || 0) - amount);
      tp.money = (tp.money || 0) + amount;
      tp.moralityScore = Math.max(-100, (tp.moralityScore ?? 0) - 2);
      // A thief dressed not to be seen is noticed less (their Stealth look).
      const noticed = Math.random() < StreetCrime.NOTICE_CHANCE * (1 - Math.min(0.7, (tp.stealth || 0) / 140));
      StreetCrime._fileCrime(thief.eventName, "pickpocketing", noticed); // i18n-ignore: PresetCrimes key
      StreetCrime._sour(mark.eventName, thief.eventName, noticed ? -30 : 0);
      const money = StreetCrime._money(amount);
      const piece = StreetCrime.liftValuable(thief.eventName, mark.eventName);
      if (!noticed) {
        StreetCrime.notify(piece
          ? T('NPCSystem.streetCrime.pickpocketValuable', { thief: thief.eventName, victim: mark.eventName, item: piece.label })
          : T('NPCSystem.streetCrime.pickpocket', { thief: thief.eventName, victim: mark.eventName, amount: money }),
        "warning", thief.event);
        return true;
      }
      StreetCrime.notify(T('NPCSystem.streetCrime.pickpocketCaught', { thief: thief.eventName, victim: mark.eventName }), "danger", thief.event);
      StreetCrime._lastNotify = 0; // the fight that follows is part of the same scene
      StreetCrime.fight(mark, thief, { aggressor: thief, loot: amount, piece });
      return true;
    },

    // A one-of-a-kind piece (window.NPCUniqueGear, Quest/ThinkerMenu.js) or an
    // artifact of the chronicle the mark carries, lifted with the money. The
    // custody moves to the thief either way: the piece's own chain, or the
    // artifact's (HistoryManager.recordArtifactCustody). Answers what was
    // taken ({uid} or {artifact}, the victim and the thief, a label for the
    // street), or null. A save holds names only, never the controllers.
    liftValuable(thiefName, markName, rng = Math.random) {
      if (!thiefName || !markName || rng() >= StreetCrime.VALUABLE_CHANCE) return null;
      const society = $gameSystem?._npcSociety || {};
      const tp = society[thiefName], mp = society[markName];
      if (!tp || !mp) return null;
      const U = window.NPCUniqueGear;
      let rec = null;
      try { rec = U?.stealBetween?.(markName, thiefName, rng) || null; } catch (e) { rec = null; }
      if (rec) return { uid: rec.uid, from: markName, to: thiefName, label: U.nameOf?.(rec) || "" };
      const arts = Array.isArray(mp.artifacts) ? mp.artifacts : [];
      if (!arts.length) return null;
      const art = arts.splice(Math.floor(rng() * arts.length) % arts.length, 1)[0];
      if (!art) return null;
      (tp.artifacts = Array.isArray(tp.artifacts) ? tp.artifacts : []).push(art);
      try { window.HistoryManager?.recordArtifactCustody?.(art.kind, art.id, thiefName, StreetCrime.CUSTODY_STOLE); } catch (e) { /* the chain catches up */ }
      return { artifact: { kind: art.kind, id: Number(art.id) }, from: markName, to: thiefName, label: StreetCrime._artifactName(art) };
    },

    // The victim won the fight: the piece goes back to them, with its chain.
    returnValuable(piece) {
      if (!piece || !piece.from || !piece.to) return false;
      if (piece.uid) {
        try { return !!window.NPCUniqueGear?.handBack?.(piece.uid, piece.from, piece.to); } catch (e) { return false; }
      }
      const society = $gameSystem?._npcSociety || {};
      const tp = society[piece.to], mp = society[piece.from];
      const a = piece.artifact;
      const arts = Array.isArray(tp?.artifacts) ? tp.artifacts : [];
      const at = a ? arts.findIndex(x => x && x.kind === a.kind && Number(x.id) === a.id) : -1;
      if (!mp || at < 0) return false;
      (mp.artifacts = Array.isArray(mp.artifacts) ? mp.artifacts : []).push(arts.splice(at, 1)[0]);
      try { window.HistoryManager?.recordArtifactCustody?.(a.kind, a.id, piece.from, StreetCrime.CUSTODY_SEIZED); } catch (e) { /* the chain catches up */ }
      return true;
    },

    // i18n-ignore-start: History.artifact.action ids
    CUSTODY_STOLE: "stole",
    CUSTODY_SEIZED: "seized",
    // i18n-ignore-end

    _artifactName(art) {
      const kind = String(art?.kind || "").replace(/s$/, "");
      const table = kind === "weapon" ? $dataWeapons : kind === "armor" ? $dataArmors : $dataItems; // i18n-ignore: item kinds
      return table?.[Number(art?.id)]?.name || "";
    },

    // Two people at it. Both stop where they are and square up; when the fight
    // is over the loser is down for a while. `opts.aggressor` is the one filed
    // for assault; `opts.loot` is money the loser's side stole, handed back if
    // the victim wins.
    // `_brawl` holds names only: the controllers live on $gameSystem and are
    // written into the savegame, where a reference from one to the other would
    // be a cycle the serializer cannot write.
    fight(a, b, opts = {}) {
      const now = performance.now();
      const aggressor = opts.aggressor ? opts.aggressor.eventName : null;
      for (const [self, other] of [[a, b], [b, a]]) {
        self.path = [];
        self.target = null;
        self.state = "brawling";
        self.stateEndTime = now + StreetCrime.FIGHT_MS;
        self._brawl = { other: other.eventName, aggressor, loot: opts.loot || 0, piece: opts.piece || null, leader: self === a };
        self.turnToward?.(other.event);
        self.event.requestBalloon?.(5); // anger
      }
      StreetCrime.notify(T('NPCSystem.streetCrime.fight', { a: a.eventName, b: b.eventName }), "danger", a.event);
    },

    // The live controller of somebody on this map, by name.
    ctrl(name) {
      return ($gameSystem?.npcControllers || []).find(c => c && c.eventName === name && c.event && !c.event._erased) || null;
    },

    // Decided by whoever gets there first once the time is up (the first party,
    // or the other a moment later if the first was pulled away).
    resolve(a) {
      const brawl = a._brawl;
      a._brawl = null;
      const b = brawl ? StreetCrime.ctrl(brawl.other) : null;
      if (!b || b.state !== "brawling" || b._brawl?.other !== a.eventName) return a.decideNextGoal();
      b._brawl = null;
      const society = $gameSystem._npcSociety || {};
      const power = (c) => {
        const p = society[c.eventName] || {};
        return (p.level || 1) * 2 + (p.atk || p.stats?.atk || 10) / 5 + Math.random() * 12;
      };
      const [winner, loser] = power(a) >= power(b) ? [a, b] : [b, a];
      if (brawl.aggressor) StreetCrime._fileCrime(brawl.aggressor, "assault", true); // i18n-ignore: PresetCrimes key
      StreetCrime._sour(winner.eventName, loser.eventName, -15);
      StreetCrime._sour(loser.eventName, winner.eventName, -25);
      let recovered = false;
      if (brawl.loot && brawl.aggressor === loser.eventName) {
        const lp = society[loser.eventName], wp = society[winner.eventName];
        const back = Math.min(brawl.loot, lp?.money || 0);
        if (lp && wp && back > 0 && window.NPCCreature?.mayHoldMoney?.(wp, winner.eventName) !== false) {
          lp.money -= back;
          wp.money = (wp.money || 0) + back;
          recovered = true;
        }
      }
      // A piece lifted with the money comes back with it.
      let pieceBack = null;
      if (brawl.piece && brawl.aggressor === loser.eventName && brawl.piece.from === winner.eventName &&
          StreetCrime.returnValuable(brawl.piece)) pieceBack = brawl.piece;
      // One line for how it ended, not three.
      StreetCrime.notify(pieceBack
        ? T('NPCSystem.streetCrime.valuableRecovered', { victim: winner.eventName, thief: loser.eventName, item: pieceBack.label })
        : recovered
        ? T('NPCSystem.streetCrime.recovered', { victim: winner.eventName, thief: loser.eventName })
        : T('NPCSystem.streetCrime.knockedOut', { winner: winner.eventName, loser: loser.eventName }),
      "warning", winner.event);
      StreetCrime.knockOut(loser);
      winner.decideNextGoal();
    },

    knockOut(c) {
      c.path = [];
      c.target = null;
      c.state = "knockedOut";
      c.stateEndTime = performance.now() + StreetCrime.KNOCKOUT_MS;
      if (c.event) c.event._npcLyingDown = true;
    },

    _fileCrime(name, key, caught) {
      try {
        window.NPCLifeSim?.addLiveCrime?.(name, key, $gameVariables?.value(114) ?? 0, { caught, addBounty: true });
      } catch (e) { /* the street still saw it */ }
    },

    _sour(from, toward, delta) {
      if (!delta) return;
      const p = $gameSystem._npcSociety?.[from];
      if (!p) return;
      const rels = p.relationships || (p.relationships = {});
      const rel = rels[toward] || (rels[toward] = { meetCount: 0, opinion: 0 });
      rel.opinion = Math.max(-100, (rel.opinion || 0) + delta);
    },

    _money(gold) {
      return window.MoneyFormatter?.format ? window.MoneyFormatter.format(gold) : String(gold);
    },

    // Only what happens within sight of the party, and never more than one
    // line every few seconds: a town full of thieves is not a toast flood.
    NOTIFY_RANGE: 12,
    NOTIFY_GAP_MS: 5000,
    _lastNotify: 0,
    notify(text, severity, where) {
      if (!text) return;
      if (where && $gamePlayer && Utils.manhattan(where.x, where.y, $gamePlayer.x, $gamePlayer.y) > StreetCrime.NOTIFY_RANGE) return;
      const now = performance.now();
      if (now - StreetCrime._lastNotify < StreetCrime.NOTIFY_GAP_MS) return;
      StreetCrime._lastNotify = now;
      try { window.ParchmentToast?.show?.(text, { severity: severity || "info", duration: 200 }); } catch (e) { }
    },
  };

  // ── Bounties on NPCs ────────────────────────────────────────────────────
  // What an NPC is wanted for is the bounty on their life record (NPCLifeSim,
  // raised by every crime they are caught at or get away with). Somebody
  // wanted may be fought without it being a crime, and whoever brings them
  // down collects it (NPCEmpathize's attack and kill hooks). The quest board's
  // outlaw hunts are written against these same people (wantedNPCs).
  const NPCBounty = {
    of(name) {
      if (!name) return 0;
      try { return Math.max(0, Number(window.NPCLifeSim?.getBounty?.(name)) || 0); } catch (e) { return 0; }
    },

    clear(name) {
      const rec = window.NPCLifeSim?.getRecord?.(name);
      if (rec) rec.wantedBounty = 0;
    },

    // Pays the party for somebody wanted they brought down, once. Answers the
    // gold paid.
    collect(name) {
      // The quest board's warrant on them is answered by the kill itself, even
      // if the bounty has since lapsed or been paid down.
      try { window.ProceduralQuests?.onWantedNPCKilled?.(name); } catch (e) { }
      const bounty = NPCBounty.of(name);
      if (!bounty || !$gameParty) return 0;
      NPCBounty.clear(name);
      $gameParty.gainGold(bounty);
      const text = T('NPCSystem.bountyCollected', { name, amount: StreetCrime._money(bounty) });
      try {
        if (window.ParchmentToast?.gold) window.ParchmentToast.gold(bounty, { title: text, severity: "good" });
        else window.ParchmentToast?.show?.(text, { severity: "good" });
      } catch (e) { }
      return bounty;
    },

    // Fair game: a bounty on them now, or a warrant out on them on the board.
    isWanted(name) {
      if (NPCBounty.of(name) > 0) return true;
      try { return !!window.ProceduralQuests?.hasWarrantOn?.(name); } catch (e) { return false; }
    },

    // A <Story> person, by their authored event anywhere in the towns.
    _isStory(name) {
      for (const g of Object.keys(GroupRegistry.build() || {})) {
        if (Config.isProceduralGroup(g)) continue;
        for (const tpl of SpawnManager.getAuthoredPool(g)) {
          if (tpl?.eventData?.name === name) return Utils.hasStoryTag(tpl.eventData.note);
        }
      }
      return false;
    },

    // Everybody in the hand-made towns with a price on their head who can
    // still be found: { name, bounty, level, group, mapId }, highest first.
    wanted() {
      const out = [];
      const society = $gameSystem?._npcSociety || {};
      const records = $gameSystem?._npcLifeRecords || {};
      const inParty = new Set(($gameParty?.members?.() || []).map(a => a?.name?.()));
      for (const [name, rec] of Object.entries(records)) {
        const bounty = rec?.wantedBounty || 0;
        if (bounty <= 0 || inParty.has(name) || GoneRegistry.isNameGone(name)) continue;
        if (rec.inPrisonUntilMinute && rec.inPrisonUntilMinute > ($gameVariables?.value(114) ?? 0)) continue;
        const p = society[name];
        if (!p || p._officer || p._story) continue;
        // A written character is never fought, and an idle companion waiting
        // at the tower is nobody's quarry.
        if (window.PartyLodging?.isResidentName?.(name)) continue;
        if (NPCBounty._isStory(name)) continue;
        const group = p._homeGroupName;
        if (!group || Config.isProceduralGroup(group)) continue;
        const mapId = ResidentRegistry.homeMapOf(name) ?? p.homeBuilding?.mapId ?? null;
        if (!mapId) continue;
        out.push({ name, bounty, level: p.level || 1, group, mapId });
      }
      return out.sort((a, b) => b.bounty - a.bounty || (a.name < b.name ? -1 : 1));
    },
  };

  // ── Minting an event that the map file does not carry ─────────────────────
  // A map holds as many people as its town has, not as many slots as its
  // author drew, so a person with no slot left is given a fresh event. Same
  // life as a transplanted one: snapshotted (restoreSpawnedEventData puts the
  // whole entry back after a menu reloads the map file), given a sprite by
  // hand (the spriteset is already built), and put straight behind their
  // blank page if the world has lost them.
  function mintEvent(eventData, tile) {
    if (!$gameMap || !$dataMap || !eventData || !tile) return null;
    if (!$dataMap.events) $dataMap.events = [null];
    if (!$gameMap._events) $gameMap._events = [];
    const mapId = $gameMap.mapId();
    const eventId = Math.max($dataMap.events.length, $gameMap._events.length);
    const data = JSON.parse(JSON.stringify(eventData));
    data.id = eventId;
    data.x = tile.x;
    data.y = tile.y;
    $dataMap.events[eventId] = data;
    for (const ch of ["A", "B", "C", "D"]) $gameSelfSwitches.setValue([mapId, eventId, ch], false);
    if (GoneRegistry.isNameGone(data.name)) $gameSelfSwitches.setValue([mapId, eventId, "A"], true);
    const ev = new Game_Event(mapId, eventId);
    ev._npcMinted = true;
    ev._npcLyingDown = false;
    $gameMap._events[eventId] = ev;
    ev.refresh();
    SpawnManager.snapshotSpawn(ev, { minted: true });
    const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
    if (spriteset?._characterSprites && !spriteset._characterSprites.some(s => s._character === ev) &&
        typeof spriteset.addVisitorCharacterSprite === "function") {
      spriteset.addVisitorCharacterSprite(ev);
    }
    return ev;
  }

  // ── The police ──────────────────────────────────────────────────────────
  // A police post is a map note, not a set of authored events: <Officers: N>
  // says how many officers stand this map for good (written by
  // tools/npc/cleanup_npc_events.mjs where the authored officers used to be).
  // They are cloned off the Officer event of Map574, both pages kept exactly as
  // authored: the everyday page runs PoliceEncounter, the second one reads the
  // wanted heat (variable 131) and comes for the party once it passes the chase
  // threshold. Officers carry no AI tag, so their own move routes drive them.
  //
  // The hotter the party, the more of them: one extra patrol for every
  // Config.POLICE_HEAT_STEP of heat, on every police post and on the open
  // streets of any town, called in while the party is on the map and stood
  // down again as the heat fades (CrimeSystem.setHeat -> onHeatChanged).
  const PoliceForce = {
    heat() {
      try { return Number(window.CrimeSystem?.getHeat?.()) || 0; } catch (e) { return 0; }
    },

    extraFor(heat) {
      return Math.max(0, Math.min(Config.POLICE_HEAT_MAX_EXTRA, Math.floor((heat || 0) / Config.POLICE_HEAT_STEP)));
    },

    // How many officers this map fields at this heat.
    countFor(mapId, heat) {
      if (Config.isNPCFreeMap(mapId) || Config.isPartyOnlyMap(mapId) || mapId === 636) return 0;
      const meta = NPCPoolStore.mapMeta(mapId);
      if (!meta) return 0;
      const base = meta.officers || 0;
      const patrols = (base > 0 || (meta.g && meta.env === "Exterior")) ? PoliceForce.extraFor(heat) : 0;
      // The Goblin Horde keeps no police worth the name: its towns field as
      // few as two fifths of the officers (window.HordeGround.police).
      let keep = 1;
      try { keep = Number(window.HordeGround?.police?.(mapId)) || 1; } catch (_) { keep = 1; }
      return Math.round((base + patrols) * Math.max(0, Math.min(1, keep)));
    },

    // The officer at index i of this map: the same person every time.
    officerName(mapId, i) {
      const ws = (window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0;
      const society = $gameSystem?._npcSociety || {};
      const onDuty = new Set(PoliceForce.live().filter(e => e._npcOfficerIndex !== i).map(e => e.event()?.name));
      for (let t = 0; t < 8; t++) {
        const s = (Utils.nameHash(`officer:${mapId}:${i}:${t}`) ^ ws) >>> 0; // i18n-ignore: seed key
        let made = "";
        try {
          made = window.generateSeededMarkovName
            ? window.generateSeededMarkovName(s & 0xffff, (s >>> 16) & 0xffff, (s % 997) + 1, "names", 2, 4, 12) // i18n-ignore: Markov bank id
            : "";
        } catch (e) { made = ""; }
        if (!made || made === "Unknown" || made === "NPC") continue; // i18n-ignore: Markov generator sentinels
        const p = society[made];
        if (p && !p._officer) continue;
        if (!p && ResidentRegistry.isReservedName(made)) continue;
        if (onDuty.has(made)) continue;
        return made;
      }
      return null;
    },

    _officerTemplate(name) {
      const tpl = NPCPoolStore.template("officer");
      if (!tpl) return null;
      tpl.name = name;
      tpl.note = `NPC-${Config.OFFICER_CLASS_ID}`; // i18n-ignore: event notetag
      return tpl;
    },

    _ensureProfile(name, groupName, tpl) {
      const society = $gameSystem._npcSociety || ($gameSystem._npcSociety = {});
      if (society[name]) return society[name];
      const img = (tpl.pages || []).map(p => p?.image).find(im => im?.characterName);
      const profile = window.NPCSocietyRegistry?.ensureProfile?.(
        name, Config.OFFICER_CLASS_ID, groupName || undefined, $gameMap.mapId(),
        img ? { spriteKey: img.characterName, bustIndex: img.characterIndex || 0 } : undefined);
      if (profile) {
        profile._officer = true;
        if (img) { profile.spriteKey = img.characterName; profile.bustIndex = img.characterIndex || 0; }
      }
      return profile || null;
    },

    live() {
      return ($gameMap?.events?.() || []).filter(e => e && !e._erased && e._npcOfficerIndex != null);
    },

    // Brings the map's force up (or down) to what it should be right now.
    staffHere() {
      if (!$gameMap || !$dataMap || Config.isEmptyWorld()) return 0;
      const mapId = $gameMap.mapId();
      if (MapManager.isHouseMap(mapId)) return 0;
      const want = PoliceForce.countFor(mapId, PoliceForce.heat());
      const live = PoliceForce.live();
      for (const ev of live) if (ev._npcOfficerIndex >= want) ev.erase();
      const standing = new Set(live.filter(e => e._npcOfficerIndex < want).map(e => e._npcOfficerIndex));
      if (standing.size >= want) return 0;
      const groupName = MapManager.findMapGroupByMap(mapId);
      const base = NPCPoolStore.mapMeta(mapId)?.officers || 0;
      const tiles = MapManager.getSpreadSpawnTiles();
      // Patrols called in mid-visit come from as far off as the map allows.
      if (want > base && $gamePlayer) {
        const px = $gamePlayer.x, py = $gamePlayer.y;
        tiles.sort((a, b) => (Math.abs(b.x - px) + Math.abs(b.y - py)) - (Math.abs(a.x - px) + Math.abs(a.y - py)));
      }
      let made = 0;
      for (let i = 0; i < want; i++) {
        if (standing.has(i)) continue;
        const name = PoliceForce.officerName(mapId, i);
        if (!name || GoneRegistry.isNameGone(name)) continue;
        const tpl = PoliceForce._officerTemplate(name);
        let tile = tiles.shift();
        while (tile && $gameMap.eventsXy(tile.x, tile.y).length) tile = tiles.shift();
        if (!tpl || !tile) break;
        PoliceForce._ensureProfile(name, groupName, tpl);
        const ev = mintEvent(tpl, tile);
        if (!ev) continue;
        ev._npcOfficerIndex = i;
        made++;
      }
      return made;
    },

    _lastBracket: null,
    onHeatChanged(heat) {
      const bracket = PoliceForce.extraFor(heat);
      if (bracket === PoliceForce._lastBracket) return;
      PoliceForce._lastBracket = bracket;
      if (!$gameMap?._npcControllersInitialized || !$gameMap._npcPoliceStaffed) return;
      if ($gameMap.isEventRunning()) return;
      try { PoliceForce.staffHere(); } catch (e) { console.error("[NPC System] police staffing failed", e); }
    },
  };


  // ── The other playthroughs of this world ──────────────────────────────────
  // A world holds several savegames, and until now they never saw each other:
  // each party walked an empty world that happened to share its history. A
  // manual save (never the shared autosave, and never a quicksave) writes down
  // where that party is standing and who is in it, into the world folder
  // (party.json). Every other savegame that walks into the same place finds
  // them there: the members and whatever pet was at heel, spawned as ordinary
  // NPCs with the ordinary NPC brain, wandering the map and going about the
  // day's activities like anybody else.
  //
  // They are people to talk to, not people to take from. Nothing done to a
  // visitor may change the playthrough they belong to, so the panel they open
  // is stripped down to conversation (see NPCEmpathizeUI): no recruiting, no
  // fighting, no trading, no gifts. What IS remembered is how everybody feels
  // about everybody, and that is written to the world folder too, keyed by a
  // stable member key rather than by an actor id, which names a different
  // person in every savegame.
  const VisitingParties = {
    // The event name a visitor's spawned event carries, so the rest of the NPC
    // system can tell one at a glance without looking anything up.
    EVENT_TAG: "_visitorKey",

    // The playthrough this savegame is: the slot it is bound to (SaveSystem
    // assigns it after character creation). 0 means unbound, e.g. the sandbox,
    // which is never written down.
    currentSlot() {
      const id = ($gameSystem && typeof $gameSystem.savefileId === "function")
        ? Number($gameSystem.savefileId()) : 0;
      return Number.isFinite(id) && id > 0 ? id : 0;
    },

    // A member of a party, named in a way that means the same person in every
    // savegame of the world. An actor id alone does not: actor 2 is somebody
    // different in each playthrough.
    memberKey(slot, actorId) {
      return `p${Number(slot) || 0}a${Number(actorId) || 0}`;
    },

    keyForActor(actor) {
      if (!actor) return null;
      const id = typeof actor.actorId === "function" ? actor.actorId() : actor;
      return this.memberKey(this.currentSlot(), id);
    },

    // The playthrough itself, told apart from the slot it happens to be
    // written to. A slot is not an identity: a run saved into a second slot
    // (a playtest build may write any of them) rebinds and leaves the old
    // entry standing, and that entry is this same party, which is then met as
    // a stranger. The uid is minted once and travels in the savegame.
    selfId() {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return "";
      if (!$gameSystem._playthroughUid) {
        $gameSystem._playthroughUid =
          `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      }
      return $gameSystem._playthroughUid;
    },

    // The names walking with this savegame right now, the bench included, plus
    // whatever pet is at heel. Nobody on this list is ever spawned as somebody
    // else's visitor.
    ownNames() {
      const names = new Set();
      try {
        const all = typeof $gameParty.allMembers === "function"
          ? $gameParty.allMembers() : $gameParty.members();
        for (const actor of all || []) {
          if (actor && actor.name()) names.add(actor.name());
        }
      } catch (e) { /* an empty set only means nothing is filtered out */ }
      try {
        const pet = window.PetSystem && window.PetSystem.getActivePet
          ? window.PetSystem.getActivePet() : null;
        if (pet && pet.name) names.add(pet.name);
      } catch (e) { /* same */ }
      return names;
    },

    // Whether a record on file is this very playthrough rather than another
    // one, asked in order of how much each answer can be trusted: the slot it
    // is filed under, the playthrough uid it carries, and - for a record
    // written before the uid existed - the party it names being the party
    // standing here.
    isMine(slot, party) {
      if (Number(slot) === this.currentSlot()) return true;
      if (!party) return false;
      if (party.uid) return party.uid === this.selfId();
      const mine = this.ownNames();
      if (!mine.size) return false;
      const theirs = (party.members || []).map(m => m && m.name).filter(Boolean);
      return theirs.length > 0 && theirs.every(name => mine.has(name));
    },

    store(create) {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
      const held = $gameSystem._partyPresence;
      if (held) return held;
      if (!create) return null;
      return ($gameSystem._partyPresence = {});
    },

    parties() {
      return this.store(false) || {};
    },

    // Everybody else's party. The savegame doing the looking is never its own
    // visitor, and neither is a playthrough that has since been deleted.
    otherParties() {
      const out = [];
      for (const [slot, party] of Object.entries(this.parties())) {
        const id = Number(slot);
        if (!party || !party.location) continue;
        // Never oneself, whichever slot the record is filed under (isMine).
        if (this.isMine(id, party)) continue;
        // Only a playthrough's own slot stands for a party in the world. The
        // autosaves and the quicksave rotation are not playthroughs, and a
        // slot that has since been deleted is nobody: party.json is merged
        // and never pruned, so entries written by an older build (or left
        // behind by a deleted savegame) are filtered out here rather than
        // trusted because they are on file.
        if (!this.isPlaythroughSlot(id)) continue;
        if (!this.slotExists(id)) continue;
        out.push(party);
      }
      return out;
    },

    // Whether a slot id names a playthrough at all. The shared world autosave
    // (slot 0), story mode's own autosave and the three quicksaves are places
    // a run is written to, not parties that live in the world.
    isPlaythroughSlot(slot) {
      const id = Number(slot);
      if (!Number.isFinite(id) || id <= 0) return false;          // the world autosave
      const SS = window.SaveSystem;
      if (SS) {
        if (typeof SS.isQuickSlot === "function" && SS.isQuickSlot(id)) return false;
        if (typeof SS.storySlots === "function") {
          // storySlots() answers [own slot, autosave]; only the autosave is out.
          const story = SS.storySlots();
          if (Array.isArray(story) && story.length > 1 && id === Number(story[1])) return false;
        }
      }
      return true;
    },

    // Whether that playthrough is still on disk. A deleted savegame leaves its
    // party.json entry behind, and its party should stop being met.
    slotExists(slot) {
      if (typeof DataManager === "undefined" ||
          typeof DataManager.savefileInfo !== "function") return true;
      try { return !!DataManager.savefileInfo(Number(slot)); } catch (e) { return true; }
    },

    // ── Writing it down ────────────────────────────────────────────────────
    // Called from the save path. Slot 0 is the world's shared autosave and the
    // quicksave band is scratch, so neither is a statement about where a
    // playthrough lives; only a real manual save into the playthrough's own
    // slot is.
    isRecordableSlot(savefileId) {
      const id = Number(savefileId);
      if (!this.isPlaythroughSlot(id)) return false;   // autosave or quicksave
      return id === this.currentSlot();
    },

    // Maps that are private to the playthrough standing on them (the story mode,
    // a station interior used as a travel instance) rather than a real place
    // in the shared world: a save written there is never recorded as the
    // party's position, so no visitor ever spawns on them.
    UNRECORDABLE_MAPS: new Set([1414, 708]),

    record(savefileId) {
      if (!this.isRecordableSlot(savefileId)) return false;
      if (!$gameParty || !$gameMap || !$gamePlayer) return false;
      if (this.UNRECORDABLE_MAPS.has($gameMap.mapId())) return false;
      const slot = this.currentSlot();
      const store = this.store(true);
      if (!store) return false;

      // Where the party is standing, as the full address of a tile: the map,
      // the world square it answers to, the depth in the procedural stack and
      // the interior it is inside. Two savegames are in the same place only
      // when all of that agrees (WorldMapTransfer.sameRealm), which is the
      // only way to tell a dungeon from the field above it on map 636.
      let location = null;
      const WMT = window.WorldMapTransfer;
      if (WMT && typeof WMT.locate === "function") {
        try { location = WMT.locate($gamePlayer.x, $gamePlayer.y); } catch (e) { location = null; }
      }
      if (!location) {
        location = { mapId: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y };
      }

      const members = $gameParty.members().map(actor => ({
        key: this.memberKey(slot, actor.actorId()),
        actorId: actor.actorId(),
        name: actor.name(),
        characterName: actor.characterName(),
        characterIndex: actor.characterIndex(),
        classId: actor._classId,
        level: actor.level
      }));

      // Whatever was at heel. A benched pet is not walking the world with
      // them, so only the active one is put on the map.
      const pets = [];
      const pet = window.PetSystem && window.PetSystem.getActivePet
        ? window.PetSystem.getActivePet() : null;
      if (pet) {
        pets.push({
          key: `${this.memberKey(slot, 0)}pet${pet.id}`,
          name: pet.name,
          characterName: pet.characterName || "",
          characterIndex: pet.characterIndex || 0,
          isPet: true
        });
      }

      store[slot] = {
        slot,
        uid: this.selfId(),
        leaderName: ($gameParty.leader() && $gameParty.leader().name()) || null,
        savedAtMin: ($gameVariables && $gameVariables.value(114)) || 0,
        location, members, pets
      };
      // Whatever slot this playthrough used to be filed under is not another
      // party standing in the world: it is this one, and leaving it on file is
      // how a party walks into a copy of itself. party.json is merged and
      // never pruned, so the pruning happens here, at the one moment the
      // playthrough is known to be somewhere else.
      for (const key of Object.keys(store)) {
        if (Number(key) === slot) continue;
        if (this.isMine(key, store[key])) delete store[key];
      }
      $gameSystem._partyPresence = store;
      return true;
    },

    // Where a playthrough was last written down, as a place rather than a set
    // of coordinates: the named world square, else the map's own display name,
    // else the biome (WorldMapTransfer.locationName). Answers null when that
    // playthrough has never saved, which is not the same as being nowhere.
    lastSeenName(slot) {
      if (!this.isPlaythroughSlot(slot)) return null;
      const party = this.parties()[Number(slot)];
      if (!party || !party.location) return null;
      const WMT = window.WorldMapTransfer;
      if (WMT && typeof WMT.locationName === "function") {
        try {
          const name = WMT.locationName(party.location);
          if (name) return name;
        } catch (e) { /* fall through to the map's own name */ }
      }
      const info = $dataMapInfos && $dataMapInfos[party.location.mapId];
      return (info && info.name) || null;
    },

    // The same, for whichever playthrough a named member belongs to. This
    // savegame's own party answers with where it last saved, which is where it
    // would be found by anybody else looking.
    lastSeenForMember(name) {
      if (!name) return null;
      for (const [slot, party] of Object.entries(this.parties())) {
        if (!party || !this.isPlaythroughSlot(slot)) continue;
        const found = (party.members || []).concat(party.pets || [])
          .some(person => person && person.name === name);
        if (found) return this.lastSeenName(slot);
      }
      return null;
    },

    // ── Standing ───────────────────────────────────────────────────────────
    // How a member stands with somebody: an NPC by name, or another
    // playthrough's member by key. Kept in the world folder rather than in the
    // savegame, so a party is remembered by the people it met even from a
    // playthrough that is not the one being played.
    dispositions(create) {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
      const held = $gameSystem._partyDispositions;
      if (held) return held;
      if (!create) return null;
      return ($gameSystem._partyDispositions = {});
    },

    disposition(memberKey, towardKey) {
      const all = this.dispositions(false);
      const mine = all && all[memberKey];
      const v = mine && mine[towardKey];
      return typeof v === "number" ? v : 0;
    },

    setDisposition(memberKey, towardKey, value) {
      if (!memberKey || !towardKey) return 0;
      const all = this.dispositions(true);
      if (!all) return 0;
      const v = Math.max(-100, Math.min(100, Math.round(value)));
      (all[memberKey] || (all[memberKey] = {}))[towardKey] = v;
      $gameSystem._partyDispositions = all;
      return v;
    },

    changeDisposition(memberKey, towardKey, delta) {
      return this.setDisposition(memberKey, towardKey,
        this.disposition(memberKey, towardKey) + (Number(delta) || 0));
    },

    // ── Standing on the map ────────────────────────────────────────────────
    // Whether a visitor record belongs where the party is standing now.
    isHere(party) {
      if (!party || !party.location || !$gameMap) return false;
      const WMT = window.WorldMapTransfer;
      if (WMT && typeof WMT.sameRealm === "function" && typeof WMT.locate === "function") {
        try {
          const here = WMT.locate($gamePlayer.x, $gamePlayer.y);
          if (Number(party.location.mapId) !== Number(here.mapId)) return false;
          // sameRealm only tells the layer/interior/planet apart, never WHICH
          // world square they belong to (map 636 is every procedural biome in
          // the game), so without this a party saved in one town's cellar
          // would be found in every cellar on the map. VehicleSystem.js checks
          // the same pair for a parked vehicle for the same reason.
          if (Number(party.location.worldX) !== Number(here.worldX) ||
              Number(party.location.worldY) !== Number(here.worldY)) return false;
          return WMT.sameRealm(party.location, here);
        } catch (e) { /* fall through to the map id */ }
      }
      return Number(party.location.mapId) === $gameMap.mapId();
    },

    visitorsHere() {
      return this.otherParties().filter(party => this.isHere(party));
    },

    // Everybody spawnOne has put on the ground this session, by key. Most of
    // them are somebody else's party members and are in party.json; some are
    // not - the world's idle companions living in a patron's vault
    // (PatreonRewards.populateVaultFloor) are spawned the same way and belong
    // to no party at all - and those would otherwise have no record behind
    // their event, which is to say nothing to say when they are talked to.
    _spawned: {},

    // The record behind a spawned event, or null when the event is not one.
    memberForEvent(event) {
      const key = event && event[this.EVENT_TAG];
      if (!key) return null;
      for (const party of Object.values(this.parties())) {
        for (const person of (party.members || []).concat(party.pets || [])) {
          if (person && person.key === key) return { person, party };
        }
      }
      const loose = this._spawned[key];
      if (loose) return loose;
      return null;
    },

    memberByKey(key) {
      const found = this.memberForEvent({ [this.EVENT_TAG]: key });
      return found ? found.person : null;
    },

    // Is this name somebody else's party member rather than a citizen of the
    // world? Read by the Empathize panel, which strips itself down for them.
    // This world's own idle companions answer the same way: they are met in
    // the halls, the vault, the ship or a house the party owns, and what is on
    // offer there is a conversation. Robbing, courting and infecting somebody
    // the party could simply ask back onto the road is not.
    isVisitorName(name) {
      if (!name) return false;
      if (window.PartyLodging?.isResidentName?.(name)) return true;
      for (const [slot, party] of Object.entries(this.parties())) {
        if (!party || this.isMine(slot, party)) continue;
        if ((party.members || []).some(m => m && m.name === name)) return true;
        if ((party.pets || []).some(p => p && p.name === name)) return true;
      }
      return false;
    },

    // ── Putting them on the map ────────────────────────────────────────────
    // A visitor is injected as a real event with an <AI> note, which is all
    // the NPC brain asks for: injectBrain gives it a controller, the
    // controller gives it somewhere to be, and NPCSim gives it something to
    // do. They are people the world is holding, so they get a society profile
    // of their own (world-shared, like everyone else's), which is also what
    // makes the Empathize panel and the wiki work on them.
    spawnHere() {
      if (!$dataMap || !$gameMap || !$gameSystem) return 0;
      // A procedural interior (dungeon, crypt, sewer, cellar, cave and every
      // layer below the surface) carries no population at all, the same rule
      // setupProceduralMapNPCs applies to the citizens of the square. Another
      // playthrough that saved down there is still recorded where it stood, but
      // its party is not put on the ground here: a group of adventurers turning
      // up in a dungeon is exactly what the interiors are cleared of.
      if (window.ProceduralInteriors?.isCurrent?.()) return 0;
      const visitors = this.visitorsHere();
      if (!visitors.length) return 0;
      if (!$dataMap.events) $dataMap.events = [null];
      // Last guard before anybody is put on the ground: a name that is already
      // walking with this savegame is never spawned as a visitor, whatever the
      // record says.
      const ours = this.ownNames();
      let spawned = 0;
      for (const party of visitors) {
        for (const person of (party.members || []).concat(party.pets || [])) {
          if (!person || !person.name) continue;
          if (ours.has(person.name)) continue;
          if (this.findEvent(person.key)) continue;
          if (this.spawnOne(person, party)) spawned++;
        }
      }
      return spawned;
    },

    findEvent(key) {
      if (!$gameMap) return null;
      for (const ev of $gameMap.events()) {
        if (ev && ev[this.EVENT_TAG] === key && !ev._erased) return ev;
      }
      return null;
    },

    // Regions nobody is ever put down on. 4 and 7 are the two the maps keep
    // for ground the player passes over rather than stands about on, so a
    // party found loitering on one reads as a bug rather than as a meeting.
    FORBIDDEN_REGIONS: [4, 7],

    // Whether somebody may be put down on this tile at all.
    isStandable(x, y) {
      if (!$gameMap || !$gameMap.isValid(x, y)) return false;
      if (!$gameMap.isPassable(x, y, 2)) return false;
      if (this.FORBIDDEN_REGIONS.includes($gameMap.regionId(x, y))) return false;
      if ($gameMap.eventsXy(x, y).length) return false;
      if ($gamePlayer && $gamePlayer.x === x && $gamePlayer.y === y) return false;
      return true;
    },

    // Every tile of this map somebody could be standing on.
    standableTiles() {
      const out = [];
      if (!$gameMap) return out;
      for (let y = 0; y < $gameMap.height(); y++) {
        for (let x = 0; x < $gameMap.width(); x++) {
          if (this.isStandable(x, y)) out.push({ x, y });
        }
      }
      return out;
    },

    // Somewhere to stand: ANY tile of the map that can be stood on, rather
    // than the six squares around where their party happened to save. A party
    // met in a town was in that town, not on that doorstep, and walking into
    // them somewhere unexpected is the whole of meeting them. The tile their
    // record names is only the fallback for a map that offers nothing else.
    findSpot(party) {
      const free = this.standableTiles();
      if (free.length) return free[Math.floor(Math.random() * free.length)];
      const baseX = Number(party && party.location && party.location.x) || 1;
      const baseY = Number(party && party.location && party.location.y) || 1;
      return { x: baseX, y: baseY };
    },

    spawnOne(person, party) {
      // A sprite-less member (a creature, or an actor whose face is a 3D model
      // rather than a character sheet) used to be injected with characterName
      // "", which is a solid, invisible event standing in the road. Borrow a
      // sheet from the same wardrobe every procedural citizen is dressed from,
      // seeded off the member key so the visitor always wears the same face,
      // and leave them unspawned rather than blank if the wardrobe is empty.
      let charName = person.characterName || "";
      let charIndex = person.characterIndex || 0;
      if (!charName) {
        let seed = 0;
        for (const ch of String(person.key || person.name || "")) {
          seed = ((seed * 31) + ch.charCodeAt(0)) >>> 0;
        }
        seed = seed || 1;
        charName = pickNPCCharacter(Utils.seededRandom(seed), buildNPCCharacterPool()) || "";
        if (!charName) return null;
        charIndex = charName.includes("!$") // i18n-ignore: sprite-sheet prefix
          ? 0 : Math.floor(Utils.seededRandom(seed * 2) * 8);
      }
      const spot = this.findSpot(party);
      const eventId = $dataMap.events.length;
      // <AI> is what injectBrain reads to hand the event a controller; the
      // name is what every profile, conversation and wiki lookup goes by.
      $dataMap.events[eventId] = {
        id: eventId, name: person.name, note: "<AI>",  // i18n-ignore: note tag
        x: spot.x, y: spot.y,
        pages: [{
          conditions: {
            actorId: 1, actorValid: false, itemId: 1, itemValid: false,
            selfSwitchCh: "A", selfSwitchValid: false,
            switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
            variableId: 1, variableValid: false
          },
          directionFix: false,
          image: {
            tileId: 0,
            characterName: charName,
            characterIndex: charIndex,
            direction: 2, pattern: 1
          },
          list: [
            { code: 357, indent: 0, parameters: [pluginName, "VisitorInteract", "Visitor", { key: person.key }] },  // i18n-ignore: plugin command id
            { code: 0, indent: 0, parameters: [] }
          ],
          moveFrequency: 3,
          moveRoute: { list: [{ code: 0 }], repeat: true, skippable: false, wait: false },
          moveSpeed: 3, moveType: 0, priorityType: 1, stepAnime: true,
          through: false, trigger: 0, walkAnime: true
        }]
      };
      if (!$gameMap._events) $gameMap._events = [];
      const ev = new Game_Event($gameMap.mapId(), eventId);
      ev[this.EVENT_TAG] = person.key;
      ev._visitorSlot = party.slot;
      $gameMap._events[eventId] = ev;
      // So that whoever this is can be talked to, whether or not any party on
      // file claims them.
      this._spawned[person.key] = { person, party };

      // A face the world knows: the same society profile everybody else has,
      // which is what the panel, the wiki and the activity sim all read.
      try {
        window.NPCSocietyRegistry?.ensureProfile?.(person.name, person.classId,
          $gameSystem._currentNpcGroup || null);
        const profile = window.NPCSocietyRegistry?.getProfile?.(person.name);
        if (profile) {
          profile._visitorKey = person.key;
          profile._visitorSlot = party.slot;
          if (person.level) profile.level = person.level;
        }
      } catch (e) { /* the sim can live without a profile; the event still stands */ }

      SpawnManager.injectBrain(ev, $dataMap.events[eventId]);
      // The spriteset is already built when a visitor is spawned mid-session,
      // so the sprite has to be asked for by hand.
      const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
      if (spriteset && typeof spriteset.addVisitorCharacterSprite === "function") {
        spriteset.addVisitorCharacterSprite(ev);
      }
      return ev;
    }
  };
  window.PartyPresence = VisitingParties;


  //===========================================================================
  // Visiting parties: the map hooks, the sprite and the interaction
  //===========================================================================

  // A visitor spawned into a session whose spriteset is already built has to
  // be given its sprite by hand, exactly as a mid-session animal or crop is.
  Spriteset_Map.prototype.addVisitorCharacterSprite = function (event) {
    if (!this._characterSprites || !this._tilemap) return;
    const sprite = new Sprite_Character(event);
    this._characterSprites.push(sprite);
    this._tilemap.addChild(sprite);
  };

  // ── Letting go of minted people who have left ─────────────────────────────
  // A minted event is erased when its person walks out (a commuter through
  // the door, a visitor leaving, the hour's leftovers), and an erased event
  // stays in $gameMap._events: updated every frame, walked by every loop over
  // the map's events, drawn by a sprite nobody sees, and written into the
  // save with its whole page copy. The longer the party stayed on one map the
  // slower it got. Once one has been gone a while and nothing holds it any
  // more, its slot is emptied and its sprite taken down. Its id is never
  // handed out again (mintEvent counts past the slot), so nothing keyed by
  // it, a self switch or the gone registry, can wake up as somebody else.
  const MINTED_PRUNE_FRAMES = 600;
  const MINTED_GRACE_FRAMES = 300;
  function pruneMintedEvents() {
    if (!$gameMap || !$gameMap._events) return 0;
    const frame = Graphics.frameCount;
    if (frame % MINTED_PRUNE_FRAMES !== 0) return 0;
    const held = new Set();
    for (const c of $gameSystem?.npcControllers || []) if (c?.event) held.add(c.event);
    const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
    let pruned = 0;
    const events = $gameMap._events;
    for (let id = 1; id < events.length; id++) {
      const ev = events[id];
      if (!ev || !ev._npcMinted || !ev._erased || ev._npcDowned || held.has(ev)) continue;
      if (ev._npcErasedAt === undefined) { ev._npcErasedAt = frame; continue; }
      if (frame - ev._npcErasedAt < MINTED_GRACE_FRAMES) continue;
      const sprites = spriteset?._characterSprites;
      if (sprites) {
        const at = sprites.findIndex(s => s._character === ev);
        if (at >= 0) {
          const sprite = sprites[at];
          sprites.splice(at, 1);
          if (sprite.parent) sprite.parent.removeChild(sprite);
          sprite.destroy();
        }
      }
      events[id] = null;
      pruned++;
    }
    return pruned;
  }

  // Where a playthrough is standing is written down when it saves. Only a real
  // manual save into the playthrough's own slot counts (see isRecordableSlot):
  // the autosave is the world's, shared by everybody, and a quicksave is
  // scratch. The record goes in before the world files are flushed, which
  // DataManager.saveGame does on the way out.
  const _DataManager_saveGame_presence = DataManager.saveGame;
  DataManager.saveGame = function (savefileId) {
    try {
      VisitingParties.record(savefileId);
    } catch (e) {
      console.error("[NPC System] failed to record where the party was left", e);
    }
    return _DataManager_saveGame_presence.call(this, savefileId);
  };

  Object.assign(window.NPCSystem._internal, {
    mintEvent, NPCBounty, PoliceForce, pruneMintedEvents, StreetCrime, VisitingParties,
  });
})();
