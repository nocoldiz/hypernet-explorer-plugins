/*:
 * @target MZ
 * @plugindesc NPC Simulation: rounds played at the arcade, the tables and the bookmaker's
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Jobs
 * @help
 * ============================================================================
 * NPCSim_Minigames, part of the NPCSimulationCore family
 * ============================================================================
 * Owns MinigamePlay (SECTION 9d).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Jobs.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    economyRng, ensureTraits, EventBus, fmtMoney, MONEY_CAP, RoutineManager,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let Addictions, Children, Specs, StoryLogger;
  NPCSim._internal._late.push(() => ({
    Addictions, Children, Specs, StoryLogger,
  } = NPCSim._internal));

  // ============================================================================
  // SECTION 9d, MINIGAME PLAY
  // ============================================================================
  // Somebody who walks up to a minigame (an arcade cabinet, a slot machine,
  // the bookmaker's, a card table...) plays a round of it, headless, with the
  // game's own maths where the game exports it: AnimatedSlotMachine.simulateSpin,
  // AnimatedHorseRace.simulateBet, MonsterTournament.simulateBet,
  // CardGame.resolveClash over CardGame.npcDeck, ScratchCardModel. The games of
  // skill (arcade, bowling, pool, basketball, the range, the piano, tarot) are
  // a seeded round off the player's AGI (which is DEX), level and the game's
  // own specialization.
  //
  //  - A stake comes out of their pocket (profile.money), scaled by their
  //    wealth tier and by a gambling or a frugal nature, and winnings go back
  //    in, capped at MONEY_CAP. An arcade round costs a token.
  //  - A child never gambles: arcade, piano, bowling, pool and basketball
  //    only, and never a stake. A beast plays nothing (NPCCreature).
  //  - Played, won, lost or drawn fills (or empties) their leisure meter the
  //    way MinigameFun moves the party's, through MinigameOpponent.payFun.
  //  - The game's specialization is practised (NPCSim.Specs.practice), the
  //    round is logged (NPCSim.log.minigame*), the hour goes into the
  //    routineLog, and npc:capability_end carries it to a thought bubble.
  //
  // A game is recognised by its event name (MINIGAME_EVENT_RE) and, failing
  // that, by the plugin command its pages run; the answer is cached per map.

  // i18n-ignore-start: event names and plugin command ids matched at runtime
  const MINIGAME_EVENT_RE = [
    ["scratch",    /\b(scratch\w*|lottery|lotto)\b/],
    ["slots",      /\b(slots?|slot machines?|fruit machines?|one.armed bandit)\b/],
    ["horserace",  /\b(horse\w*|race ?track|racecourse|bookmaker|bookie|derby)\b/],
    ["tournament", /\b(tournament|monster ?fights?|fighting pit|arena bets?)\b/],
    ["tarot",      /\btarot\b/],
    ["cards",      /\b(cards?|card table|card duel|duel\w*)\b/],
    ["bowling",    /\bbowling\b/],
    ["pool",       /\b(pool table|billiard\w*|snooker)\b/],
    ["basketball", /\b(basketball|hoops?)\b/],
    ["target",     /\b(shooting range|shooting gallery|target range|targets?)\b/],
    ["piano",      /\bpiano\b/],
    ["arcade",     /\b(arcade|pinball)\b/],
  ];
  const MINIGAME_COMMANDS = {
    playGame: "arcade", openSlotMachine: "slots", openHorseRace: "horserace",
    startTournament: "tournament", StartRandomCardDuel: "cards",
    startBowlingGame: "bowling", startBasketballGame: "basketball",
    startTargetRange: "target", openPiano: "piano", openPoolGame: "pool",
    openTarot: "tarot", pickOneCard: "tarot", freeSpread: "tarot",
    openScratchCard: "scratch", openEsotericCard: "scratch", openCorporateCard: "scratch",
    openVacationCard: "scratch", openHypercapitalistCard: "scratch",
  };
  const MINIGAME_SCRIPT_RE = /\b(openScratchCard\w*|openSlotMachine|openHorseRace|openPiano|openPoolGame|openTarot)\b/;
  const POOL_COMMON_EVENT = 89;

  // spec: the Specialization.json name the round trains (the name each game
  // passes MinigameFun). stake: a wager. child: a child may play it.
  const MINIGAMES = {
    arcade:     { round: "skill",      spec: "Video Gaming",    token: true, child: true },
    bowling:    { round: "skill",      spec: "Tenpin Bowling",  child: true, draws: true },
    pool:       { round: "skill",      spec: "Billiards",       child: true, draws: true },
    basketball: { round: "skill",      spec: "Basketball",      child: true, draws: true },
    piano:      { round: "skill",      spec: "Playing Piano",   child: true },
    target:     { round: "skill",      spec: "Clay Shooting" },
    tarot:      { round: "skill",      spec: "Tarot Reading" },
    cards:      { round: "cards",      spec: "Card Counting" },
    slots:      { round: "slots",      spec: "Card Counting",   stake: true },
    horserace:  { round: "horserace",  spec: "Card Counting",   stake: true },
    tournament: { round: "tournament", spec: "Animal Training", stake: true },
    scratch:    { round: "scratch",    spec: "Card Counting",   stake: true },
  };
  const GAMBLER_TRAITS = ["gambl", "reckless", "impulsive", "risk", "thrill", "daredevil", "greedy"];
  const PRUDENT_TRAITS = ["frugal", "cautious", "prudent", "stingy", "thrifty", "miser"];
  // i18n-ignore-end
  const MINIGAME_TOKEN_ITEM_ID = 124;
  const SCRATCH_COST_GOLD = 1000;

  const _minigameCache = { mapId: null, data: null, byId: new Map() };

  const MinigamePlay = {
    GAMES: MINIGAMES,
    EVENT_RE: MINIGAME_EVENT_RE,
    COMMANDS: MINIGAME_COMMANDS,
    COOLDOWN_MIN: 20,          // game minutes between two rounds for one person
    MIN_STAKE: 100,            // 1 euro
    MAX_STAKE: 20000,          // 200 euros
    STAKE_SHARE: [0.01, 0.015, 0.02, 0.025, 0.03], // of the pocket, by wealth tier
    SPEC_SHARE: 0.25,          // of MinigameFun.SPEC_POINTS a round is worth to an NPC
    // Reasons an NPC stands at a game for; work, crime and the body's needs
    // are something else.
    PLAY_REASONS: ["leisure", "social", "comfort", "money", "shopping"],

    // What an event name says the game is, or null.
    classifyName(name) {
      const n = String(name || "").toLowerCase();
      if (!n) return null;
      for (const [game, re] of MINIGAME_EVENT_RE) if (re.test(n)) return game;
      return null;
    },

    // What the commands on an event's pages open, or null.
    classifyPages(pages) {
      for (const page of (pages || [])) {
        for (const cmd of (page?.list || [])) {
          if (!cmd) continue;
          if (cmd.code === 357) {
            const game = MINIGAME_COMMANDS[cmd.parameters?.[1]];
            if (game) return game;
          } else if (cmd.code === 117) {
            if (Number(cmd.parameters?.[0]) === POOL_COMMON_EVENT) return "pool";
          } else if (cmd.code === 355 || cmd.code === 655) {
            const m = MINIGAME_SCRIPT_RE.exec(String(cmd.parameters?.[0] || ""));
            if (m) return /^openScratchCard/.test(m[1]) ? "scratch" : (MINIGAME_COMMANDS[m[1]] || null);
          }
        }
      }
      return null;
    },

    // The game at a map event, cached per map (a map's data is replaced on
    // every load, so the cache follows $dataMap too).
    kindOf(ev) {
      if (!ev || !ev.event) return null;
      const mapId = $gameMap?.mapId?.() ?? null;
      const data = (typeof $dataMap !== "undefined") ? $dataMap : null;
      if (_minigameCache.mapId !== mapId || _minigameCache.data !== data) {
        _minigameCache.mapId = mapId;
        _minigameCache.data = data;
        _minigameCache.byId.clear();
      }
      const id = ev.eventId?.();
      if (id != null && _minigameCache.byId.has(id)) return _minigameCache.byId.get(id);
      const d = ev.event();
      const game = this.classifyName(d?.name) || this.classifyPages(d?.pages);
      if (id != null) _minigameCache.byId.set(id, game);
      return game;
    },

    _traitNames(profile) {
      ensureTraits();
      return (profile?.traitIds || []).map(id => NPCSim._internal.traitNameLower(id));
    },

    // 2.5 for somebody with a gambler's nature, 0.5 for a careful one, else 1.
    gamblerBias(profile) {
      const names = this._traitNames(profile);
      if (names.some(n => GAMBLER_TRAITS.some(k => n.includes(k)))) return 2.5;
      if (names.some(n => PRUDENT_TRAITS.some(k => n.includes(k)))) return 0.5;
      return 1;
    },

    canPlay(profile, name, game) {
      const def = MINIGAMES[game];
      if (!def || !profile) return false;
      if (window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
      if (Children.isMinor(profile, name) && !def.child) return false;
      return true;
    },

    // What they put down on a game of chance, in gold: a share of the pocket
    // by wealth tier, bent by their nature, between MIN_STAKE and MAX_STAKE
    // and never more than a quarter of what they have. 0 for a child, for a
    // game that takes no stake, or for a pocket too light to bet at all.
    stakeFor(profile, name, game) {
      const def = MINIGAMES[game];
      if (!def?.stake || !profile) return 0;
      if (Children.isMinor(profile, name)) return 0;
      const money = Math.max(0, Math.floor(profile.money || 0));
      if (game === "scratch") return money >= SCRATCH_COST_GOLD * 4 ? SCRATCH_COST_GOLD : 0;
      const tier = Math.max(0, Math.min(this.STAKE_SHARE.length - 1, profile.wealthTierBase ?? 0));
      // A gambler who is wanting bets bigger, bigger still at a casino (SECTION 11b5b).
      const raw = Math.round(money * this.STAKE_SHARE[tier] * this.gamblerBias(profile) *
        Addictions.stakeBoost(profile, name));
      const stake = Math.min(this.MAX_STAKE, Math.floor(money / 4), Math.max(this.MIN_STAKE, raw));
      return stake >= this.MIN_STAKE ? stake : 0;
    },

    tokenPrice() {
      const item = (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems[MINIGAME_TOKEN_ITEM_ID] : null;
      return Math.max(1, Number(item?.price) || 100);
    },

    _specLevel(profile, specName) {
      const S = Specs.table();
      const spec = S?.byName?.get?.(specName);
      return spec ? (profile.specLevels?.[spec.id] || 1) : 1;
    },

    // A game of skill: the chance to win rises with the game's own
    // specialization, with AGI (which is DEX) above the level's par, and a
    // little with experience. Returns "won" | "lost" | "draw".
    _skillRound(profile, def, rng) {
      const level = Math.max(1, profile.level || 1);
      const agi = profile.agi || level * 5;
      const specLv = this._specLevel(profile, def.spec);
      const p = Math.max(0.05, Math.min(0.9,
        0.25 + 0.08 * (specLv - 1) + 0.15 * (agi / (level * 5) - 1) + Math.min(0.1, level / 400)));
      const roll = rng.next();
      if (def.draws && Math.abs(roll - p) < 0.05) return "draw";
      return roll < p ? "won" : "lost";
    },

    // A duel at the card table: both decks as CardGame deals them (the NPC's
    // own npcDeck, and a seeded rival's), their monsters laid alternately on
    // the 3x3 board and one clash resolved.
    _cardRound(name, profile, rng) {
      const CG = window.CardGame;
      if (!CG?.npcDeck || !CG.resolveClash) return null;
      const rival = `${name}#rival${rng.int(1, 9999)}`; // i18n-ignore: seed key
      const rivalProfile = { level: profile.level || 10, wealthTierBase: rng.int(0, 3) };
      const mons = (deck) => (deck || []).filter(k => (CG.isMonster ? CG.isMonster(k) : String(k).charAt(0) === "e"));
      const decks = [mons(CG.npcDeck(name, profile)), mons(CG.npcDeck(rival, rivalProfile))];
      if (!decks[0].length || !decks[1].length) return null;
      const size = CG.BOARD_CELLS || 9;
      const cells = [];
      for (let i = 0; i < size; i++) cells.push(i);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      const board = new Array(size).fill(null);
      cells.forEach((cell, i) => {
        const owner = i % 2;
        const deck = decks[owner];
        board[cell] = { key: deck[Math.floor(rng.next() * deck.length)], owner };
      });
      const res = CG.resolveClash(board, Math.floor(rng.next() * 0x7fffffff));
      if (res.winner === 0) return "won";
      if (res.winner === 1) return "lost";
      return "draw";
    },

    // A scratch card's prize in euros. The card model rolls on Math.random,
    // so the round's own stream stands in for it while the card is printed.
    _scratch(fn) {
      const saved = Math.random;
      Math.random = fn;
      try {
        return new window.ScratchCardModel("esoteric").wonAmount || 0; // i18n-ignore: card style id
      } finally {
        Math.random = saved;
      }
    },

    // One round, decided but not yet applied. `rng` is a MiniRng (tests pass
    // their own). Returns { game, result, stake, payout } with result one of
    // "won" | "lost" | "draw" | "played"; null when it cannot be played.
    playRound(name, profile, game, rng) {
      const def = MINIGAMES[game];
      if (!def || !this.canPlay(profile, name, game)) return null;
      const r = rng || economyRng(name, "minigame_" + game);
      const fn = () => r.next();
      const out = { game, result: "played", stake: 0, payout: 0 };

      if (def.token && !Children.isMinor(profile, name)) {
        const price = this.tokenPrice();
        if ((profile.money || 0) < price) return null;
        out.stake = price;
      }
      if (def.round === "skill") {
        out.result = this._skillRound(profile, def, r);
        return out;
      }
      if (def.round === "cards") {
        out.result = this._cardRound(name, profile, r) || this._skillRound(profile, def, r);
        return out;
      }

      // Games of chance: nothing to put down means they only watch a round.
      const stake = this.stakeFor(profile, name, game);
      if (!stake) return out;
      out.stake = stake;
      if (def.round === "slots" && window.AnimatedSlotMachine?.simulateSpin) {
        out.payout = window.AnimatedSlotMachine.simulateSpin(stake, fn).win;
      } else if (def.round === "horserace" && window.AnimatedHorseRace?.simulateBet) {
        // Everybody at the bookmaker's in the same hour bets on the same race.
        const raceKey = Math.floor(($gameVariables?.value(114) ?? 0) / 60) + "@" + ($gameMap?.mapId?.() ?? 0);
        out.payout = window.AnimatedHorseRace.simulateBet(stake, fn, { raceKey }).payout;
      } else if (def.round === "tournament" && window.MonsterTournament?.simulateBet) {
        const bet = window.MonsterTournament.simulateBet(stake, fn);
        if (!bet) { out.stake = 0; return out; }
        out.payout = bet.winnings;
      } else if (def.round === "scratch" && window.ScratchCardModel) {
        out.payout = Math.max(0, Math.round(this._scratch(fn) * 100));
      } else {
        // The game itself is not loaded: they watch instead of play.
        out.stake = 0;
        return out;
      }
      out.result = out.payout > out.stake ? "won" : out.payout === out.stake ? "draw" : "lost";
      return out;
    },

    // What a round does to the leisure meter: the party's MinigameFun.DELTA,
    // scaled so that "played" is what one evening is worth to an NPC
    // (MinigameOpponent.NPC_FUN). Played, then won/lost/drawn on top.
    funDelta(result) {
      const D = window.MinigameFun?.DELTA || { played: 30, won: 120, lost: -60, draw: 30 };
      const npc = window.MinigameOpponent?.NPC_FUN ?? 14;
      const scale = D.played ? npc / D.played : 0.5;
      const base = Math.round(D.played * scale);
      return base + (result === "played" ? 0 : Math.round((D[result] || 0) * scale));
    },

    // Applies a decided round to the person: money, fun, the specialization,
    // the log, the routine, and the thought bubble.
    apply(name, profile, round) {
      if (!round || !profile) return null;
      const before = Math.max(0, Math.floor(profile.money || 0));
      const stake = Math.min(before, round.stake || 0);
      profile.money = Math.min(MONEY_CAP, before - stake + Math.max(0, round.payout || 0));
      round.net = profile.money - before;

      const fun = this.funDelta(round.result);
      const MO = window.MinigameOpponent;
      if (MO?.payFun) {
        MO.payFun({ kind: "npc", name }, fun, { quiet: true, signed: true }); // i18n-ignore: stand-in kind
      } else {
        profile.leisure = Math.max(0, Math.min(100, Math.round((profile.leisure ?? 100) + fun)));
      }

      const def = MINIGAMES[round.game];
      const table = window.MinigameFun?.SPEC_POINTS || { played: 1, won: 3, lost: 1, draw: 2 };
      const points = (table[round.result] ?? 1) * this.SPEC_SHARE;
      if (def?.spec) Specs.practice(profile, name, def.spec, points);

      const game = `NPCSim.minigame.${round.game}`;
      const amount = fmtMoney(Math.abs(round.net));
      const key = round.result === "won" ? (round.net > 0 ? "NPCSim.log.minigameWon" : "NPCSim.log.minigameBeat")
                : round.result === "lost" ? (round.net < 0 ? "NPCSim.log.minigameLost" : "NPCSim.log.minigameBeaten")
                : round.result === "draw" ? "NPCSim.log.minigameDraw" : "NPCSim.log.minigamePlayed";
      StoryLogger.record(name, "minigame", key, { game, amount });
      RoutineManager.record(profile, RoutineManager.hourNow(), "minigame", "minigame", $gameMap?.mapId?.() || 0); // i18n-ignore: override kind id
      profile._lastMinigameMin = $gameVariables?.value(114) ?? 0;
      // A bet feeds a gambler's craving, and they say how it went.
      Addictions.onRound(profile, name, round);
      EventBus.emit("npc:capability_end", {
        name, capabilityId: round.game,
        outcome: { minigame: round.game, result: round.result, stake, payout: round.payout || 0 },
      });
      return round;
    },

    // The npc:interact hook: a round when the event is a game, they came for
    // their own reasons, and their last round was long enough ago.
    onInteract(name, targetEvent, reason) {
      const game = this.kindOf(targetEvent);
      if (!game) return null;
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile) return null;
      const why = reason ?? profile.currentNeed;
      if (why && !this.PLAY_REASONS.includes(why)) return null;
      const now = $gameVariables?.value(114) ?? 0;
      // A gambler still wanting goes round after round (SECTION 11b5b).
      const cooldown = Addictions.isBetGame(game) && Addictions.wantsToGamble(profile, name)
        ? Addictions.GAMBLER_COOLDOWN_MIN : this.COOLDOWN_MIN;
      if (now - (profile._lastMinigameMin ?? -Infinity) < cooldown) return null;
      const round = this.playRound(name, profile, game);
      return round ? this.apply(name, profile, round) : null;
    },
  };

  EventBus.on("npc:interact", ({ name, targetEvent, reason }) => {
    if (!targetEvent) return;
    try { MinigamePlay.onInteract(name, targetEvent, reason); }
    catch (e) { console.error("[NPCSim] minigame round failed:", e); }
  });

  // A worker seen at a particular post: that hour of their routine says where.
  EventBus.on("npc:work_tick", ({ name, mapId }) => {
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) return;
    RoutineManager.record(profile, RoutineManager.hourNow(), "work", "workspot", mapId || profile.workMapId || 0); // i18n-ignore: override kind id
  });

  Object.assign(NPCSim._internal, {
    MinigamePlay, MINIGAMES,
  });
})();
