/*:
 * @target MZ
 * @plugindesc The card duel: a 3x3 board, one card a turn, and a single simultaneous clash when the last tile is taken.
 * @author Esoteric Heavy Industries
 *
 * @command StartRandomCardDuel
 * @text Start Random Card Duel
 * @desc Opens a card duel with a random deck against a random opponent deck. Nothing is staked.
 *
 * @arg deckSize
 * @text Deck size
 * @desc How many cards each side is dealt (9-20).
 * @type number
 * @min 9
 * @max 20
 * @default 16
 *
 * @help CardGameDuel.js
 *
 * Two players, nine tiles. On your turn you either DRAW a handful of three
 * cards or PLACE one: a monster goes on a free tile, a weapon or a piece of
 * armour is bolted onto a monster of yours already standing (one of each per
 * monster, its values added and clamped back to 13).
 *
 * The table is dressed in the monsters' own walking sprites.
 *
 * The moment the last tile is taken every monster looks at its four orthogonal
 * neighbours, picks the weakest enemy among them and fights it. Every pairing
 * is scored against ONE frozen snapshot of the board and every death lands
 * together, so the match is over in a single clash rather than a long cascade.
 * Most stats won takes the fight; an equal count destroys both.
 *
 * Whoever has more monsters left standing wins, ties broken on the summed stats
 * of the survivors.
 *
 * HYPER CARD ARENA (window.CardArena, app id app-card-arena) is this duel
 * played against the machine from the Hypernet desktop: pick your own deck or
 * a rolled one, pick how good the opponent is, and play one match or a
 * straight knock-out bracket of eight. A bracket charges at the door, pays for
 * every round won and pays the purse and a prize for the title; losing a round
 * ends it. The run lives on $gameSystem, so it survives a save.
 *
 * Requires Cards/CardGameCore.js.
 */

(() => {
  "use strict";

  const PLUGIN = "Cards/CardGameDuel";
  const SPEC = "Card Counting"; // i18n-ignore: Specialization.json name
  const GAMBLING_TRAIT = 103;

  const CG = () => window.CardGame;

  //===========================================================================
  // Small helpers
  //===========================================================================

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  // Money is euros everywhere in the game: the raw figure carries two implied
  // decimals, the same split MoneyFormatter draws.
  function euros(gold) {
    const value = Math.round(Number(gold) || 0);
    const unit = ($dataSystem && $dataSystem.currencyUnit) || "";
    const str = String(Math.abs(value));
    let main = str.length <= 2 ? "0." + str.padStart(2, "0") : str.slice(0, -2) + "." + str.slice(-2);
    if (main.endsWith(".00")) main = main.slice(0, -3);
    return `${main}${unit ? " " + unit : ""}`;
  }

  function playSe(name, volume, pitch) {
    try {
      AudioManager.playSe({ name, volume: volume == null ? 80 : volume, pitch: pitch == null ? 100 : pitch, pan: 0 });
    } catch (e) { /* a missing sound never stops a match */ }
  }

  const CARD_SLIDE = () => "Casino/card_slide_" + (1 + Math.floor(Math.random() * 8));
  const CARD_PLACE = () => "Casino/card_place_" + (1 + Math.floor(Math.random() * 4));

  //===========================================================================
  // Style
  //===========================================================================
  // Injected once. Everything is a CSS transform so the juice costs nothing:
  // no new renderer, no per-frame JavaScript layout.

  //===========================================================================
  // Scene_CardDuel
  //===========================================================================

  class Scene_CardDuel extends Scene_MenuBase {
    prepare(config) {
      this._config = config || {};
    }

    create() {
      super.create();
      if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }

      const CGx = CG();
      const cfg = this._config || {};
      const size = CGx.BOARD_CELLS;

      this._board = new Array(size).fill(null);
      // What effect cards have left lying on bare ground: a curse, a blessing
      // or a trap waiting for whoever steps on it.
      this._tileMods = new Array(size).fill(null);
      // A Warded tile, barred to one player for their next turn only.
      this._blocked = new Array(size).fill(null);
      this._pendingSwap = null;
      // A duel reached any other way than the Empathize panel is not gated on
      // owning a deck, so a party with nothing to play is lent one rather than
      // dealt an empty hand.
      let playerDeck = cfg.playerDeck && cfg.playerDeck.length ? cfg.playerDeck : CGx.playableDeck();
      if (playerDeck.length < CGx.DECK_MIN) playerDeck = CGx.randomDeck(16, 0.4);
      this._decks = [
        this.shuffled(playerDeck),
        this.shuffled(cfg.opponentDeck && cfg.opponentDeck.length ? cfg.opponentDeck : CGx.randomDeck(16, 0.5))
      ];
      this._hands = [[], []];
      this._names = [
        cfg.playerName || ($gameParty.leader() ? $gameParty.leader().name() : T("CardGame.duel.you")),
        cfg.opponentName || T("CardGame.duel.opponent")
      ];
      this._stake = cfg.stake || { type: "none" };
      this._npcName = cfg.npcName || null;
      this._profile = cfg.profile || null;
      this._actorId = cfg.actorId || null;
      this._practice = !!cfg.practice;

      this._matchSeed = CGx.rollSeed();
      this._turn = 0;
      this._phase = "play";     // play | clash | over
      this._area = "hand";      // hand | board
      this._handIndex = 0;
      this._cursor = 0;
      this._settled = false;
      this._aiTimer = 0;
      this._spriteFrame = 1;
      this._spriteTimer = 0;

      for (let i = 0; i < CGx.HAND_START; i++) { this.drawCard(0, true); this.drawCard(1, true); }
      // An opening hand always holds one of the five tricks, so the first turn
      // is never four monsters and no way to answer anything.
      this.guaranteeEffect(0);
      this.guaranteeEffect(1);

      this.buildDOM();
      this.renderAll();

      // Every minigame announces the skill it trains as its session opens.
      try { window.MinigameFun && window.MinigameFun.played({ spec: SPEC }); } catch (e) { /* cosmetic */ }
      playSe("Casino/card_shuffle", 70, 100);
    }

    update() {
      super.update();
      this.updateSpriteFrames();
      if (this._phase === "play") {
        if (this._turn === 1) this.updateAI();
        else this.updateInput();
      } else if (this._phase === "over") {
        if (Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered()) this.leave();
      }
    }

    terminate() {
      const container = document.getElementById("cardduel-container");
      if (container) container.remove();
      try { window.SpecBadge && window.SpecBadge.hide && window.SpecBadge.hide(); } catch (e) { /* cosmetic */ }
      super.terminate();
    }

    leave() {
      if (this._leaving) return;
      this._leaving = true;
      SoundManager.playCancel();
      this.popScene();
    }

    //-------------------------------------------------------------------------
    // Deck / hand
    //-------------------------------------------------------------------------

    shuffled(keys) {
      const CGx = CG();
      const rng = CGx.makeRng(CGx.rollSeed());
      const out = (keys || []).filter((key) => CGx.dataOf(key))
        .map((key) => ({ key, seed: CGx.rollSeed() }));
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }

    drawCard(player, silent) {
      const CGx = CG();
      if (this._hands[player].length >= CGx.HAND_MAX) return false;
      const card = this._decks[player].shift();
      if (!card) return false;
      card.fresh = true;
      this._hands[player].push(card);
      if (!silent) playSe(CARD_SLIDE(), 55, 120 + Math.floor(Math.random() * 30));
      return true;
    }

    // The turn's own deal. Nobody asks for it: a turn opens with DRAW_COUNT
    // cards, stopping early on an empty deck or a full hand. Answers how many
    // actually came over.
    drawHandful(player) {
      let taken = 0;
      for (let i = 0; i < CG().DRAW_COUNT; i++) {
        if (!this.drawCard(player, i > 0)) break;
        taken++;
      }
      return taken;
    }

    // Trade the least interesting card in an opening hand for the first effect
    // card still in the deck, so both sides start with a trick to play.
    guaranteeEffect(player) {
      const CGx = CG();
      const hand = this._hands[player];
      if (hand.some((card) => CGx.isEffect(card.key))) return;
      const at = this._decks[player].findIndex((card) => CGx.isEffect(card.key));
      if (at < 0) return;
      const [effect] = this._decks[player].splice(at, 1);
      // Gear is the least use on an empty board, so it is what goes back.
      let swapAt = hand.findIndex((card) => CGx.isEquip(card.key));
      if (swapAt < 0) swapAt = hand.length - 1;
      if (swapAt < 0) { hand.push(effect); return; }
      this._decks[player].push(hand[swapAt]);
      effect.fresh = true;
      hand[swapAt] = effect;
    }

    //-------------------------------------------------------------------------
    // Legality
    //-------------------------------------------------------------------------

    freeTiles() {
      return this._board.reduce((n, cell) => n + (cell ? 0 : 1), 0);
    }

    // A tile Warded against this player is off limits to them entirely until
    // the ward lapses at the end of their turn.
    isBarred(player, index) {
      const block = this._blocked[index];
      return !!block && block.barred === player;
    }

    canPlace(player, card, index) {
      if (!card) return false;
      const CGx = CG();
      const cell = this._board[index];
      if (this.isBarred(player, index)) return false;

      // An effect card goes anywhere: what it does is decided by what is (or
      // is not) standing there. Displace is the exception, it wants two tiles
      // and the first of them has to be a creature.
      if (CGx.isEffect(card.key)) {
        if (CGx.effectId(card.key) === "swap") {
          if (this._pendingSwap == null) return !!cell;
          return index !== this._pendingSwap;
        }
        return true;
      }

      if (CGx.isMonster(card.key)) return !cell;
      if (!cell || cell.owner !== player) return false;
      if (CGx.isWeapon(card.key)) return !cell.weapon;
      return !cell.armor;
    }

    legalTilesFor(player, card) {
      const out = [];
      for (let i = 0; i < this._board.length; i++) if (this.canPlace(player, card, i)) out.push(i);
      return out;
    }

    // A side can act only if it has something to put down: the deck is dealt at
    // the top of the turn, so holding cards back is no longer a move.
    canAct(player) {
      return this._hands[player].some((card) => this.legalTilesFor(player, card).length > 0);
    }

    //-------------------------------------------------------------------------
    // Turns
    //-------------------------------------------------------------------------

    place(player, handIndex, index) {
      const CGx = CG();
      const card = this._hands[player][handIndex];
      if (!this.canPlace(player, card, index)) return false;

      // Displace takes two tiles, so the first press only marks the creature
      // being moved; the card is not spent until the second one lands.
      if (CGx.isEffect(card.key) && CGx.effectId(card.key) === "swap" && this._pendingSwap == null) {
        this._pendingSwap = index;
        playSe("Casino/card_shove_1", 60, 120);
        return "pending";
      }

      this._hands[player].splice(handIndex, 1);

      if (CGx.isEffect(card.key)) {
        this.applyEffect(player, card.key, index);
        return true;
      }

      if (CGx.isMonster(card.key)) {
        const cell = {
          key: card.key, owner: player, seed: card.seed, weapon: null, armor: null, fresh: true
        };
        // Ground an effect card has already touched marks whoever steps on it.
        const mod = this._tileMods[index];
        if (mod === "halve") cell.mult = 0.5;
        else if (mod === "double") cell.mult = 2;
        this._tileMods[index] = null;
        this._board[index] = cell;
        playSe(CARD_PLACE(), 75, 100);
        if (mod === "trap") this.springTrap(index);
        return true;
      }

      const cell = this._board[index];
      if (CGx.isWeapon(card.key)) cell.weapon = card.key; else cell.armor = card.key;
      cell.geared = true;
      playSe("Equip1", 70, 110);
      return true;
    }

    //-------------------------------------------------------------------------
    // Effect cards
    //-------------------------------------------------------------------------

    // The five tricks. Each reads the tile it lands on: a creature is changed
    // where it stands, whoever it belongs to, and bare ground is left marked
    // for whoever puts something there next.
    applyEffect(player, key, index) {
      const CGx = CG();
      const effect = CGx.effectId(key);
      const cell = this._board[index];
      const tile = this.tileEl(index);

      switch (effect) {
        case "halve":
          if (cell) { cell.mult = (cell.mult == null ? 1 : cell.mult) * 0.5; this.flashTile(tile, "cd-fx-bad"); }
          else this._tileMods[index] = "halve";
          playSe("Down2", 80, 100);
          break;
        case "double":
          if (cell) { cell.mult = (cell.mult == null ? 1 : cell.mult) * 2; this.flashTile(tile, "cd-fx-good"); }
          else this._tileMods[index] = "double";
          playSe("Up2", 80, 100);
          break;
        case "cull":
          if (cell) {
            this.shatter(tile);
            this._board[index] = null;
            playSe("Collapse1", 85, 110);
            const container = document.getElementById("cardduel-container");
            if (container) { container.classList.add("cd-shake"); setTimeout(() => container.classList.remove("cd-shake"), 340); }
          } else {
            this._tileMods[index] = "trap";
            playSe("Absorb1", 70, 90);
          }
          break;
        case "swap":
          this.doSwap(this._pendingSwap, index);
          this._pendingSwap = null;
          playSe("Casino/card_fan_1", 75, 110);
          break;
        case "ward":
          if (cell) { cell.warded = true; this.flashTile(tile, "cd-fx-ward"); }
          // A tile nobody is standing on is simply shut to the other side for
          // their next turn, and the ward lapses when that turn ends.
          else this._blocked[index] = { barred: 1 - player };
          playSe("Barrier", 80, 100);
          break;
      }
      // The tiles both effects touched are redrawn from scratch.
      this.invalidateTile(index);
      if (this._pendingSwap != null) this.invalidateTile(this._pendingSwap);
      return true;
    }

    // Displace: two creatures trade places, or one walks onto empty ground.
    // Everything the tile carries travels with it, gear and curses included.
    doSwap(a, b) {
      if (a == null || b == null || a === b) return;
      const first = this._board[a], second = this._board[b];
      this._board[a] = second;
      this._board[b] = first;
      const modA = this._tileMods[a];
      this._tileMods[a] = this._tileMods[b];
      this._tileMods[b] = modA;
      this.invalidateTile(a);
      this.invalidateTile(b);
      const ta = this.tileEl(a), tb = this.tileEl(b);
      if (ta) { ta.classList.remove("cd-land"); void ta.offsetWidth; ta.classList.add("cd-land"); }
      if (tb) { tb.classList.remove("cd-land"); void tb.offsetWidth; tb.classList.add("cd-land"); }
    }

    // A creature walking onto ground a Cull was left on dies where it stands.
    springTrap(index) {
      setTimeout(() => {
        if (!this._board[index]) return;
        this.shatter(this.tileEl(index));
        this._board[index] = null;
        this.invalidateTile(index);
        playSe("Collapse2", 85, 105);
        this.renderBoard();
      }, 320);
    }

    tileEl(index) {
      const container = document.getElementById("cardduel-container");
      return container ? container.querySelector(`.cd-tile[data-i="${index}"]`) : null;
    }

    // Forces the next renderBoard to rebuild this tile's contents.
    invalidateTile(index) {
      const tile = this.tileEl(index);
      if (tile) tile.dataset.stamp = "!";
    }

    flashTile(tile, cls) {
      if (!tile) return;
      tile.classList.remove(cls); void tile.offsetWidth; tile.classList.add(cls);
      setTimeout(() => tile.classList.remove(cls), 700);
    }

    endTurn() {
      if (this._phase !== "play") return;
      // A half-picked Displace never survives the turn it was started on.
      this._pendingSwap = null;
      // A ward shuts a tile for exactly one of the barred player's turns, so it
      // lapses as that turn ends.
      for (let i = 0; i < this._blocked.length; i++) {
        if (this._blocked[i] && this._blocked[i].barred === this._turn) {
          this._blocked[i] = null;
          this.invalidateTile(i);
        }
      }
      if (this.freeTiles() === 0) { this.startClash(); return; }
      const next = 1 - this._turn;
      // Every turn opens with its own deal, so the hand a side is judged on is
      // the one it has just been given.
      this.drawHandful(next);
      // A side with nothing legal left to do passes rather than blocking; if
      // neither can move the board is finished as it stands.
      if (!this.canAct(next)) {
        this.drawHandful(this._turn);
        if (!this.canAct(this._turn)) { this.startClash(); return; }
      } else {
        this._turn = next;
      }
      this._handIndex = 0;
      this._area = this._turn === 0 ? "hand" : this._area;
      this._aiTimer = this._turn === 1 ? 34 : 0;
      this.renderAll();
    }

    //-------------------------------------------------------------------------
    // Input
    //-------------------------------------------------------------------------

    updateInput() {
      if (Input.isTriggered("cancel")) {
        // Cancel takes back a half-picked Displace before it takes the player
        // away from the table.
        if (this._pendingSwap != null) {
          this._pendingSwap = null;
          SoundManager.playCancel();
          this.renderAll();
          return;
        }
        this.confirmQuit();
        return;
      }

      if (this._area === "hand") {
        const hand = this._hands[0];
        if (!hand.length) return;
        if (Input.isRepeated("right")) { this._handIndex = (this._handIndex + 1) % hand.length; SoundManager.playCursor(); this.renderAll(); }
        else if (Input.isRepeated("left")) { this._handIndex = (this._handIndex - 1 + hand.length) % hand.length; SoundManager.playCursor(); this.renderAll(); }
        else if (Input.isRepeated("up")) {
          const legal = this.legalTilesFor(0, hand[this._handIndex]);
          if (legal.length) { this._area = "board"; this._cursor = legal[0]; SoundManager.playOk(); this.renderAll(); }
          else SoundManager.playBuzzer();
        } else if (Input.isTriggered("ok")) {
          const legal = this.legalTilesFor(0, hand[this._handIndex]);
          if (legal.length) { this._area = "board"; this._cursor = legal[0]; SoundManager.playOk(); this.renderAll(); }
          else SoundManager.playBuzzer();
        }
        return;
      }

      if (this._area === "board") {
        const side = CG().BOARD_SIZE;
        const step = (dx, dy) => {
          const x = this._cursor % side, y = (this._cursor / side) | 0;
          const nx = (x + dx + side) % side, ny = (y + dy + side) % side;
          this._cursor = ny * side + nx;
          SoundManager.playCursor();
          this.renderAll();
        };
        if (Input.isRepeated("right")) step(1, 0);
        else if (Input.isRepeated("left")) step(-1, 0);
        else if (Input.isRepeated("up")) step(0, -1);
        else if (Input.isRepeated("down")) {
          if (((this._cursor / side) | 0) === side - 1) { this._area = "hand"; SoundManager.playCursor(); this.renderAll(); }
          else step(0, 1);
        } else if (Input.isTriggered("ok")) {
          this.playerPlace();
        }
      }
    }

    playerPlace() {
      const card = this._hands[0][this._handIndex];
      if (!this.canPlace(0, card, this._cursor)) { SoundManager.playBuzzer(); return; }
      const result = this.place(0, this._handIndex, this._cursor);
      // Displace has only marked its first tile: stay on the board and wait for
      // the second, rather than passing the turn on half an action.
      if (result === "pending") { this.renderAll(); return; }
      this._handIndex = Math.max(0, Math.min(this._handIndex, this._hands[0].length - 1));
      this._area = "hand";
      this.renderAll();
      this.endTurn();
    }

    confirmQuit() {
      // Walking out of a staked duel forfeits it, which is the honest reading of
      // leaving the table; a practice game just ends.
      if (this._stake.type === "none") { this.leave(); return; }
      this._phase = "over";
      this.settle(1);
      this.showBanner(1);
    }

    //-------------------------------------------------------------------------
    // The opponent
    //-------------------------------------------------------------------------

    updateAI() {
      if (this._aiTimer > 0) { this._aiTimer--; return; }
      this.aiTakeTurn();
    }

    // How a pairing would go, from A's point of view: +2 for a kill, -2 for a
    // death, -1 for mutual destruction (a trade is not a win when the match is
    // decided on survivors).
    matchupScore(statsA, statsB) {
      const score = CG().scorePair(statsA, statsB);
      return score.outcome === "a" ? 2 : score.outcome === "b" ? -2 : -1;
    }

    tileScore(player, cardKey, index, equip) {
      const CGx = CG();
      const stats = CGx.combinedStats(cardKey, equip || []);
      let score = 0;
      for (const n of CGx.neighboursOf(index)) {
        const other = this._board[n];
        if (!other || other.owner === player) continue;
        score += this.matchupScore(stats, CGx.cellStats(other));
      }
      // A corner is worth something on its own: fewer sides, fewer fights.
      const side = CGx.BOARD_SIZE;
      const x = index % side, y = (index / side) | 0;
      const exposure = (x === 0 || x === side - 1 ? 1 : 2) + (y === 0 || y === side - 1 ? 1 : 2);
      score += (4 - exposure) * 0.35;
      score += CGx.statTotal(stats) * 0.03;
      return score;
    }

    aiTakeTurn() {
      const CGx = CG();
      const hand = this._hands[1];

      let best = null;
      for (let h = 0; h < hand.length; h++) {
        const card = hand[h];
        if (CGx.isEffect(card.key)) {
          const play = this.aiEffectPlay(card.key);
          if (play && (!best || play.score > best.score)) best = { h, index: play.index, score: play.score, swapWith: play.swapWith };
          continue;
        }
        for (const index of this.legalTilesFor(1, card)) {
          let score;
          if (CGx.isMonster(card.key)) {
            score = this.tileScore(1, card.key, index, []);
          } else {
            // Gear is only worth a turn when it flips a fight the monster
            // underneath is currently losing.
            const cell = this._board[index];
            const before = this.tileScore(1, cell.key, index, [cell.weapon, cell.armor]);
            const after = this.tileScore(1, cell.key, index, [
              CGx.isWeapon(card.key) ? card.key : cell.weapon,
              CGx.isArmor(card.key) ? card.key : cell.armor
            ]);
            score = (after - before) - 0.6;
          }
          if (!best || score > best.score) best = { h, index, score };
        }
      }

      if (!best) {
        // Nothing worth playing: the turn is passed and the next deal decides.
        this.renderAll();
        this.endTurn();
        return;
      }
      // Displace takes two presses; the opponent makes both of them at once.
      if (best.swapWith != null) this._pendingSwap = best.swapWith;
      this.place(1, best.h, best.index);
      this.renderAll();
      this.endTurn();
    }

    // Where the opponent would rather spend a trick. Each one is scored in the
    // same currency as a placement, so it competes with putting a creature
    // down instead of always being dumped the moment it is drawn.
    aiEffectPlay(key) {
      const CGx = CG();
      const effect = CGx.effectId(key);
      const own = [], foe = [], free = [];
      for (let i = 0; i < this._board.length; i++) {
        if (this.isBarred(1, i)) continue;
        const cell = this._board[i];
        if (!cell) free.push(i);
        else if (cell.owner === 1) own.push(i); else foe.push(i);
      }
      const strongest = (list) => list.reduce(
        (bestIdx, i) => (bestIdx < 0 || CGx.statTotal(CGx.cellStats(this._board[i])) > CGx.statTotal(CGx.cellStats(this._board[bestIdx])) ? i : bestIdx), -1);
      const weakest = (list) => list.reduce(
        (bestIdx, i) => (bestIdx < 0 || CGx.statTotal(CGx.cellStats(this._board[i])) < CGx.statTotal(CGx.cellStats(this._board[bestIdx])) ? i : bestIdx), -1);
      const power = (i) => CGx.statTotal(CGx.cellStats(this._board[i]));

      switch (effect) {
        case "cull": {
          // Worth spending on somebody dangerous, worth nothing on a beginner.
          const target = strongest(foe);
          if (target >= 0) return { index: target, score: 1.2 + power(target) * 0.12 };
          return free.length ? { index: free[0], score: 0.4 } : null;
        }
        case "halve": {
          const target = strongest(foe);
          if (target >= 0) return { index: target, score: 0.8 + power(target) * 0.07 };
          return free.length ? { index: free[0], score: 0.35 } : null;
        }
        case "double": {
          const target = strongest(own);
          if (target >= 0) return { index: target, score: 0.7 + power(target) * 0.06 };
          return free.length ? { index: free[0], score: 0.5 } : null;
        }
        case "ward": {
          const target = strongest(own);
          if (target >= 0 && !this._board[target].warded) return { index: target, score: 0.6 + power(target) * 0.04 };
          // Otherwise shut the free tile the player would most want.
          if (free.length) {
            let bestTile = free[0], bestScore = -Infinity;
            for (const i of free) {
              const s = CGx.neighboursOf(i).filter((n) => this._board[n] && this._board[n].owner === 1).length;
              if (s > bestScore) { bestScore = s; bestTile = i; }
            }
            return { index: bestTile, score: 0.45 + bestScore * 0.2 };
          }
          return null;
        }
        case "swap": {
          // Pull its weakest creature out of a crowd and onto quiet ground.
          const mover = weakest(own);
          if (mover < 0 || !free.length) return null;
          let bestTile = -1, bestGain = 0;
          const cell = this._board[mover];
          const here = this.tileScore(1, cell.key, mover, [cell.weapon, cell.armor]);
          for (const i of free) {
            const there = this.tileScore(1, cell.key, i, [cell.weapon, cell.armor]);
            if (there - here > bestGain) { bestGain = there - here; bestTile = i; }
          }
          if (bestTile < 0) return null;
          return { index: bestTile, swapWith: mover, score: bestGain * 0.8 };
        }
      }
      return null;
    }

    //-------------------------------------------------------------------------
    // The clash
    //-------------------------------------------------------------------------

    startClash() {
      this._phase = "clash";
      this.renderAll();
      const CGx = CG();
      const result = CGx.resolveClash(this._board, this._matchSeed);
      this._result = result;

      const container = document.getElementById("cardduel-container");
      const tileEl = (i) => container && container.querySelector(`.cd-tile[data-i="${i}"]`);

      // 1. Everything lunges at once. That is the whole point of the rule: one
      //    round, not a queue of duels the player watches out one by one.
      for (const pair of result.pairs) {
        this.animateLunge(tileEl(pair.a), pair.a, pair.b);
        this.animateLunge(tileEl(pair.b), pair.b, pair.a);
      }
      playSe("Blow3", 80, 90);

      // 2. The five stats light up in sequence across every pairing at once,
      //    each step a semitone higher than the last.
      const STEP = 130;
      CGx.STATS.forEach((statId, row) => {
        setTimeout(() => {
          if (this._phase !== "clash") return;
          for (const pair of result.pairs) {
            const line = pair.rows[row];
            this.popChip(tileEl(pair.a), line.a, line.winner === "a" ? "cd-win" : line.winner === "b" ? "cd-loss" : "cd-tie");
            this.popChip(tileEl(pair.b), line.b, line.winner === "b" ? "cd-win" : line.winner === "a" ? "cd-loss" : "cd-tie");
          }
          playSe("Cursor2", 60, 100 + row * 14);
        }, 340 + row * STEP);
      });

      // 3. The verdict lands on every tile together.
      setTimeout(() => {
        if (this._phase !== "clash") return;
        for (const index of result.deaths) {
          const el = tileEl(index);
          this.shatter(el);
        }
        for (let i = 0; i < this._board.length; i++) {
          if (!this._board[i] || result.deaths.includes(i)) continue;
          const el = tileEl(i);
          if (el) { el.classList.remove("cd-bounce"); void el.offsetWidth; el.classList.add("cd-bounce"); }
        }
        if (result.deaths.length) {
          playSe("Collapse1", 85, 100);
          if (container) { container.classList.add("cd-shake"); setTimeout(() => container.classList.remove("cd-shake"), 340); }
        }
        this.tickTallies(result.survivors);
      }, 340 + 5 * STEP + 120);

      // 4. Verdict.
      setTimeout(() => {
        if (this._phase !== "clash") return;
        for (const index of result.deaths) this._board[index] = null;
        this._phase = "over";
        this.settle(result.winner);
        this.showBanner(result.winner);
      }, 340 + 5 * STEP + 800);
    }

    animateLunge(el, from, to) {
      if (!el) return;
      const side = CG().BOARD_SIZE;
      const dx = (to % side) - (from % side), dy = ((to / side) | 0) - ((from / side) | 0);
      el.style.setProperty("--lx", (dx * 30) + "px");
      el.style.setProperty("--ly", (dy * 30) + "px");
      el.classList.remove("cd-lunge"); void el.offsetWidth; el.classList.add("cd-lunge");
    }

    popChip(el, value, cls) {
      if (!el) return;
      const chip = document.createElement("div");
      chip.className = "cd-chip " + cls;
      chip.textContent = value;
      el.appendChild(chip);
      setTimeout(() => chip.remove(), 700);
    }

    shatter(el) {
      if (!el) return;
      el.classList.add("cd-dying");
      for (let i = 0; i < 7; i++) {
        const shard = document.createElement("div");
        shard.className = "cd-shard";
        const angle = (Math.PI * 2 * i) / 7 + Math.random();
        const dist = 40 + Math.random() * 46;
        shard.style.setProperty("--sx", Math.cos(angle) * dist + "px");
        shard.style.setProperty("--sy", Math.sin(angle) * dist + "px");
        el.appendChild(shard);
        setTimeout(() => shard.remove(), 620);
      }
    }

    tickTallies(survivors) {
      const container = document.getElementById("cardduel-container");
      if (!container) return;
      [0, 1].forEach((player) => {
        const el = container.querySelector(`.cd-side.cd-p${player} .cd-tally`);
        if (!el) return;
        let shown = 0;
        const target = survivors[player];
        const tick = () => {
          if (shown >= target) return;
          shown++;
          el.textContent = shown;
          el.classList.add("cd-pop");
          setTimeout(() => el.classList.remove("cd-pop"), 120);
          playSe("Casino/chip_lay_" + (1 + (shown % 3)), 55, 110 + shown * 6);
          if (shown < target) setTimeout(tick, 110);
        };
        el.textContent = "0";
        tick();
      });
    }

    //-------------------------------------------------------------------------
    // Settling up
    //-------------------------------------------------------------------------

    settle(winner) {
      if (this._settled) return;
      this._settled = true;
      // What the arena reads when the table is cleared (window.CardArena).
      this._finishWinner = winner;
      const CGx = CG();
      const won = winner === 0, lost = winner === 1;
      const kind = won ? "won" : lost ? "lost" : "draw";

      this._payout = { kind, lines: [] };
      this.settleStake(kind);
      this.payFun(kind);
      this.payNpc(kind);

      if (this._npcName) CGx.markDuelled(this._npcName);
      if (!this._practice) {
        CGx.bumpStreak(won);
        if (won) this.awardPack();
      }
    }

    settleStake(kind) {
      const stake = this._stake;
      if (!stake || stake.type === "none" || kind === "draw") return;
      const won = kind === "won";
      const profile = this._profile;

      if (stake.type === "money") {
        const amount = Math.max(0, Math.round(stake.amount || 0));
        if (!amount) return;
        if (won) {
          $gameParty.gainGold(amount);
          if (profile) profile.money = Math.max(0, (profile.money || 0) - amount);
        } else {
          $gameParty.loseGold(amount);
          if (profile) profile.money = (profile.money || 0) + amount;
        }
        this._payout.lines.push(
          T(won ? "CardGame.duel.wonMoney" : "CardGame.duel.lostMoney", { amount: euros(amount) })
        );
        try { window.ParchmentToast && window.ParchmentToast.gold(won ? amount : -amount); } catch (e) { /* cosmetic */ }
        return;
      }

      if (stake.type === "item") {
        const mine = this.stakeObject(stake.playerItem);
        const theirs = this.stakeObject(stake.npcItem);
        if (won) {
          if (theirs) {
            $gameParty.gainItem(theirs, 1);
            if (profile && Array.isArray(profile.itemIds) && stake.npcItem.kind === 0) {
              const at = profile.itemIds.indexOf(stake.npcItem.id);
              if (at >= 0) profile.itemIds.splice(at, 1);
            }
            this._payout.lines.push(T("CardGame.duel.wonItem", { item: theirs.name }));
          }
        } else if (mine) {
          $gameParty.loseItem(mine, 1);
          if (profile && stake.playerItem.kind === 0) (profile.itemIds ??= []).push(stake.playerItem.id);
          this._payout.lines.push(T("CardGame.duel.lostItem", { item: mine.name }));
        }
      }
    }

    stakeObject(ref) {
      if (!ref) return null;
      if (ref.kind === 1) return $dataWeapons[ref.id] || null;
      if (ref.kind === 2) return $dataArmors[ref.id] || null;
      return $dataItems[ref.id] || null;
    }

    // Fun for the party, and for a gambler the craving as well. Everything the
    // duel moved is reported in ONE grouped popup so nothing overwrites
    // anything else.
    payFun(kind) {
      const toasts = [];
      const MF = window.MinigameFun;
      // A duel played out of the main menu is still worth what it is worth; it
      // just does not announce itself over a menu the player opened to read.
      const quiet = !!(MF && MF.fromMainMenu && MF.fromMainMenu());
      const delta = (MF && MF.DELTA[kind]) || 0;
      const points = (MF && MF.SPEC_POINTS[kind]) || 1;

      if (delta && window.PartyNeeds && window.PartyNeeds.addLeisureToAll) {
        window.PartyNeeds.addLeisureToAll(delta);
        toasts.push(() => window.ParchmentToast.need("leisure", delta));
      }

      // A gambler gets more out of the table than anyone else at it, and the
      // craving they carry is the thing the game actually feeds. A real stake
      // feeds it harder than a friendly game.
      const AS = window.AddictionSystem;
      if (AS && AS.has) {
        const staked = this._stake && this._stake.type !== "none";
        const bonus = Math.round(delta * (staked ? 0.7 : 0.4));
        const relief = staked ? 65 : 35;
        for (const actor of $gameParty.members()) {
          if (!AS.has(actor, "gambling")) continue;
          const before = AS.craving(actor, "gambling") || 0;
          if (bonus > 0 && actor.addLeisure) actor.addLeisure(bonus);
          AS.relieve(actor, "gambling", relief);
          const after = AS.craving(actor, "gambling") || 0;
          const dropped = Math.round(before - after);
          const name = actor.name();
          if (bonus > 0) {
            toasts.push(() => window.ParchmentToast.need("leisure", bonus, {
              label: T("CardGame.duel.gamblerFun", { name })
            }));
          }
          if (dropped > 0) {
            const substance = AS.label ? AS.label("gambling") : "gambling"; // i18n-ignore: label() is localised
            toasts.push(() => window.ParchmentToast.show(
              T("CardGame.duel.cravingEased", { name, substance, amount: dropped }),
              { severity: "good", duration: 150 }
            ));
          }
        }
      }

      if (window.SpecializationXP) {
        try {
          const gained = window.SpecializationXP.award(SPEC, points, {
            actor: $gameParty.leader(), silent: true
          }) || [];
          gained.forEach((g) => toasts.push(() => window.SpecializationXP.announce(g)));
        } catch (e) { /* the payout never breaks on a specialization */ }
      }

      if (quiet) return;
      try { window.ParchmentToast && window.ParchmentToast.group(toasts); } catch (e) { /* cosmetic */ }
    }

    // The person across the table had an evening too.
    payNpc(kind) {
      const profile = this._profile;
      if (!profile) return;
      const gain = kind === "lost" ? 16 : kind === "won" ? 9 : 12;
      profile.leisure = CG().clamp((profile.leisure ?? 100) + gain, 0, 100);
      // Playing somebody at cards is time spent with them however it went, and
      // beating them is worth a little more of their goodwill than losing.
      // The panel's own per-actor ledger, written the same way it writes it.
      if (this._actorId != null) {
        const map = (profile.opinions ??= {});
        const at = map[this._actorId] ?? profile.playerOpinion ?? 0;
        map[this._actorId] = CG().clamp(at + (kind === "lost" ? 4 : 2), -100, 100);
      }
    }

    // Winning pays a pack, and a streak reaches further up the rarity ladder,
    // which is the reason to sit down for one more.
    awardPack() {
      const CGx = CG();
      const keys = CGx.rollBooster(CGx.PACK_SIZE, { luck: CGx.streakLuck() });
      this._pendingPack = keys;
    }

    showBanner(winner) {
      const container = document.getElementById("cardduel-container");
      if (!container) return;
      const CGx = CG();
      const title = winner === 0 ? T("CardGame.duel.victory")
        : winner === 1 ? T("CardGame.duel.defeat") : T("CardGame.duel.draw");
      const lines = (this._payout && this._payout.lines) || [];
      if (winner === 0 && !this._practice) {
        const streak = CGx.streak();
        if (streak > 1) lines.push(T("CardGame.duel.streak", { count: streak }));
        if (this._pendingPack && this._pendingPack.length) lines.push(T("CardGame.duel.packWon"));
      }
      const banner = document.createElement("div");
      banner.className = "cd-banner";
      banner.innerHTML = `<h1>${escapeHtml(title)}</h1>`
        + lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
      container.appendChild(banner);
      requestAnimationFrame(() => banner.classList.add("cd-in"));
      playSe(winner === 0 ? "Applause1" : winner === 1 ? "Buzzer2" : "Bell2", 80, 100);
    }

    // Opening the won pack once the banner is dismissed, so the reward is the
    // last thing that happens rather than something buried under a banner.
    popScene() {
      // Whoever set the match up is told how it went once the table is
      // actually gone: a bracket starts its next round off this. Walking out
      // of an unsettled match is reported as a loss, because that is what it
      // is to everyone waiting on the result.
      const finish = this._config && this._config.onFinish;
      const winner = this._finishWinner == null ? 1 : this._finishWinner;
      const report = (delay) => {
        if (!finish || this._reported) return;
        this._reported = true;
        setTimeout(() => { try { finish(winner); } catch (e) { console.error(e); } }, delay);
      };
      if (this._pendingPack && this._pendingPack.length && window.CardBooster) {
        const keys = this._pendingPack;
        this._pendingPack = null;
        super.popScene();
        setTimeout(() => { try { window.CardBooster.open(keys); } catch (e) { /* optional */ } }, 260);
        report(560);
        return;
      }
      super.popScene();
      report(260);
    }

    //-------------------------------------------------------------------------
    // Rendering
    //-------------------------------------------------------------------------

    buildDOM() {
      let container = document.getElementById("cardduel-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "cardduel-container";
        document.body.appendChild(container);
      }
      const metrics = this.layoutMetrics();
      const { cell, gap } = metrics;
      const side = CG().BOARD_SIZE;
      container.style.setProperty("--cd-cell", cell + "px");
      container.style.setProperty("--cd-cardw", metrics.cardW + "px");
      container.style.setProperty("--cd-cardh", metrics.cardH + "px");
      container.innerHTML = `
        <div class="cd-head">
          <div class="cd-side cd-p0">
            <span class="cd-tally">0</span>
            <span class="cd-who" id="cd-name0"></span>
          </div>
          <div class="cd-stakebar">
            <div class="cd-turnline" id="cd-turn"></div>
            <div id="cd-stake"></div>
            <div class="cd-oppdeck" id="cd-oppinfo"></div>
          </div>
          <div class="cd-side cd-p1 cd-right">
            <span class="cd-who" id="cd-name1"></span>
            <span class="cd-tally">0</span>
          </div>
        </div>
        <div class="cd-boardwrap">
          <div class="cd-grid" id="cd-grid"></div>
        </div>
        <div class="cd-hand" id="cd-hand"></div>
        <div class="cd-foot">
          <span></span>
          <span>
            <button class="cd-btn" id="cd-quit">${escapeHtml(T("CardGame.duel.quitBtn"))}</button>
          </span>
        </div>
        <div class="cd-detail" id="cd-detail"></div>
      `;

      const grid = container.querySelector("#cd-grid");
      grid.style.gridTemplateColumns = `repeat(${side},1fr)`;
      for (let i = 0; i < CG().BOARD_CELLS; i++) {
        const tile = document.createElement("div");
        tile.className = "cd-tile";
        tile.dataset.i = String(i);
        tile.style.width = cell + "px";
        tile.style.height = cell + "px";
        tile.addEventListener("click", () => this.onTileClick(i));
        grid.appendChild(tile);
      }
      grid.style.gap = gap + "px";

      // The board sits between the header and the hand rather than at a fixed
      // fraction of the screen, so a taller board never grows into the cards.
      const wrap = container.querySelector(".cd-boardwrap");
      wrap.style.top = Math.round(metrics.boardTop + metrics.boardSize / 2) + "px";
      container.querySelector("#cd-detail").style.top = Math.round(metrics.boardTop) + "px";

      container.querySelector("#cd-quit").addEventListener("click", () => {
        if (this._phase === "play") this.confirmQuit(); else this.leave();
      });
    }

    // How big the table is drawn. Everything is measured off the window rather
    // than written down: the overlay covers the whole window, which the
    // resolution switcher and a resized frame both move.
    layoutMetrics() {
      const side = CG().BOARD_SIZE;
      const vw = Math.max(640, window.innerWidth || 1280);
      const vh = Math.max(480, window.innerHeight || 720);
      const gap = 12;
      const headH = Math.round(vh * 0.09) + 24;
      const cardH = Math.round(CG().clamp(vh * 0.27, 170, 320));
      const cardW = Math.round(cardH * 0.68);
      const handH = cardH + 30;
      // What is left between the header and the hand, and never wider than
      // half the screen so the card dossier on the right keeps its room.
      const roomH = vh - headH - handH - 20;
      const roomW = vw * 0.52;
      const byHeight = (roomH - gap * (side - 1)) / side;
      const byWidth = (roomW - gap * (side - 1)) / side;
      const cell = Math.round(CG().clamp(Math.min(byHeight, byWidth), 80, 210));
      const boardSize = cell * side + gap * (side - 1);
      const boardTop = headH + Math.max(0, (roomH - boardSize) / 2);
      return { cell, gap, cardW, cardH, boardSize, boardTop };
    }

    onTileClick(index) {
      if (this._phase !== "play" || this._turn !== 0) return;
      const card = this._hands[0][this._handIndex];
      if (this.canPlace(0, card, index)) {
        this._cursor = index;
        this._area = "board";
        this.playerPlace();
      } else {
        this._cursor = index;
        this._area = "board";
        SoundManager.playBuzzer();
        this.renderAll();
      }
    }

    onCardClick(handIndex) {
      if (this._phase !== "play" || this._turn !== 0) return;
      if (this._handIndex === handIndex && this._area === "board") return;
      this._handIndex = handIndex;
      this._area = "hand";
      SoundManager.playCursor();
      this.renderAll();
    }

    renderAll() {
      this.renderHeader();
      this.renderBoard();
      this.renderHand();
      this.renderDetail();
    }

    renderHeader() {
      const container = document.getElementById("cardduel-container");
      if (!container) return;
      container.querySelector("#cd-name0").textContent = this._names[0];
      container.querySelector("#cd-name1").textContent = this._names[1];
      const turnEl = container.querySelector("#cd-turn");
      turnEl.textContent = this._phase === "play"
        ? (this._turn === 0 ? T("CardGame.duel.yourTurn") : T("CardGame.duel.theirTurn", { name: this._names[1] }))
        : T("CardGame.duel.clash");
      container.querySelector("#cd-stake").textContent = this.stakeLabel();
      container.querySelector("#cd-oppinfo").textContent = T("CardGame.duel.deckCounts", {
        you: this._decks[0].length, them: this._decks[1].length
      });
    }

    stakeLabel() {
      const stake = this._stake;
      if (!stake || stake.type === "none") return T("CardGame.duel.stakeNone");
      if (stake.type === "money") return T("CardGame.duel.stakeMoney", { amount: euros(stake.amount) });
      const mine = this.stakeObject(stake.playerItem);
      const theirs = this.stakeObject(stake.npcItem);
      return T("CardGame.duel.stakeItem", {
        mine: mine ? mine.name : "?", theirs: theirs ? theirs.name : "?"
      });
    }

    renderBoard() {
      const container = document.getElementById("cardduel-container");
      if (!container) return;
      const CGx = CG();
      const card = this._phase === "play" && this._turn === 0 ? this._hands[0][this._handIndex] : null;
      const legal = card ? new Set(this.legalTilesFor(0, card)) : new Set();

      const MARKS = { halve: "▼", double: "▲", trap: "☠", block: "✖" };

      for (let i = 0; i < this._board.length; i++) {
        const tile = container.querySelector(`.cd-tile[data-i="${i}"]`);
        if (!tile) continue;
        const cell = this._board[i];
        tile.classList.toggle("cd-legal", legal.has(i));
        tile.classList.toggle("cd-cursor", this._area === "board" && this._cursor === i && this._phase === "play" && this._turn === 0);
        tile.classList.toggle("cd-own", !!cell && cell.owner === 0);
        tile.classList.toggle("cd-foe", !!cell && cell.owner === 1);
        tile.classList.toggle("cd-swappick", this._pendingSwap === i);
        tile.classList.toggle("cd-warded", !!(cell && cell.warded));

        const mark = this._blocked[i] ? "block" : this._tileMods[i];
        const stamp = cell
          ? `${cell.key}|${cell.weapon || ""}|${cell.armor || ""}|${cell.mult || 1}|${cell.warded ? "w" : ""}`
          : `-|${mark || ""}`;
        if (tile.dataset.stamp === stamp) continue;
        tile.dataset.stamp = stamp;
        tile.innerHTML = "";

        if (!cell) {
          // Bare ground an effect card has already touched wears its mark.
          if (mark) {
            const glyph = document.createElement("div");
            glyph.className = "cd-tilemark cd-mk-" + mark;
            glyph.textContent = MARKS[mark] || "";
            tile.appendChild(glyph);
          }
          continue;
        }
        if (cell.warded) {
          const ring = document.createElement("div");
          ring.className = "cd-wardring";
          tile.appendChild(ring);
        }

        const canvas = document.createElement("canvas");
        canvas.className = "cd-sprite";
        canvas.width = 48; canvas.height = 48;
        const px = Math.round(tile.clientWidth * 0.62) || 56;
        canvas.style.width = px + "px"; canvas.style.height = px + "px";
        tile.appendChild(canvas);
        CGx.Art.drawTileSprite(canvas, cell.key, this._spriteFrame);

        const stats = CGx.cellStats(cell);
        const power = document.createElement("div");
        power.className = "cd-tilepower";
        power.textContent = CGx.statTotal(stats);
        tile.appendChild(power);

        const label = document.createElement("div");
        label.className = "cd-tilename";
        label.textContent = CGx.nameOf(cell.key);
        tile.appendChild(label);

        if (cell.weapon || cell.armor) {
          const gear = document.createElement("div");
          gear.className = "cd-tilegear";
          [cell.weapon, cell.armor].filter(Boolean).forEach((key) => {
            const chip = document.createElement("span");
            chip.setAttribute("style", CGx.Art.iconStyle(key, 16));
            gear.appendChild(chip);
          });
          tile.appendChild(gear);
        }

        if (cell.fresh) {
          cell.fresh = false;
          tile.classList.remove("cd-land"); void tile.offsetWidth; tile.classList.add("cd-land");
        }
      }
    }

    renderHand() {
      const container = document.getElementById("cardduel-container");
      if (!container) return;
      const wrap = container.querySelector("#cd-hand");
      const CGx = CG();
      const hand = this._hands[0];
      wrap.innerHTML = "";

      hand.forEach((card, index) => {
        const el = document.createElement("div");
        const rarity = CGx.rarityOf(card.key);
        const effect = CGx.isEffect(card.key);
        el.className = "cd-card cd-r" + rarity + (effect ? " cd-effect" : "")
          + (index === this._handIndex && this._phase === "play" ? " cd-sel" : "");
        // A fan: each card leans a little further out from the middle.
        const spread = (index - (hand.length - 1) / 2);
        el.style.transform = `rotate(${spread * 4}deg) translateY(${Math.abs(spread) * 5}px)`;
        el.style.zIndex = String(10 + index);

        const stats = CGx.statsFor(card.key);
        const type = effect ? T("CardGame.type.effect")
          : CGx.isMonster(card.key) ? ""
            : CGx.isWeapon(card.key) ? T("CardGame.type.weapon") : T("CardGame.type.armor");
        // An effect card prints its rule where a creature prints its numbers.
        const footer = effect
          ? `<div class="cd-fxrule">${escapeHtml(CGx.cardText(card.key))}</div>`
          : `<div class="cd-cstats">${CGx.STATS.map((id) =>
            `<div>${escapeHtml(CGx.statLabel(id))}<b>${stats[id]}</b></div>`).join("")}</div>`;
        el.innerHTML = `
          <div class="cd-shine"></div>
          <div class="cd-ctype">${escapeHtml(type)}</div>
          <div class="cd-cname">${escapeHtml(CGx.nameOf(card.key))}</div>
          <div class="cd-cart"></div>
          ${footer}`;
        this.fillArt(el.querySelector(".cd-cart"), card);
        el.addEventListener("click", () => this.onCardClick(index));
        if (card.fresh) { card.fresh = false; el.classList.add("cd-dealt"); }
        wrap.appendChild(el);
      });
    }

    // A monster's art is its walking sprite; gear and tricks show their glyph.
    fillArt(host, card) {
      if (!host) return;
      const CGx = CG();
      if (CGx.isEquip(card.key) || CGx.isEffect(card.key)) {
        const glyph = document.createElement("span");
        glyph.setAttribute("style", CGx.Art.iconStyle(card.key, 48));
        host.appendChild(glyph);
        return;
      }
      const sprite = CGx.Art.spriteArt(card.key, 96);
      if (sprite) host.appendChild(sprite);
    }

    renderDetail() {
      const container = document.getElementById("cardduel-container");
      if (!container) return;
      const panel = container.querySelector("#cd-detail");
      const CGx = CG();
      const card = this._hands[0][this._handIndex];
      if (!card || this._phase !== "play") { panel.style.display = "none"; return; }
      panel.style.display = "block";
      const stats = CGx.statsFor(card.key);
      const effect = CGx.isEffect(card.key);
      if (card.lore === undefined) card.lore = CGx.cardText(card.key, card.seed);
      // An effect card has a rule to read, not a stat block, and while one is
      // half played the panel says what it is waiting for.
      // The panel is the game's right column: the shared stat block, the shared
      // gold heading and the shared prose measure, nothing inked in the markup.
      const body = effect
        ? (this._pendingSwap != null
          ? `<div class="cd-prompt">${escapeHtml(T("CardGame.duel.pickSecondTile"))}</div>` : "")
        : `<div class="inspect-section-title">${escapeHtml(T("CardGame.col.statsHeading"))}</div>
           <div class="inspect-spec-grid">${CGx.STATS.map((id) =>
             `<div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(CGx.statLabel(id))}</span><span class="inspect-spec-value">${stats[id]}</span></div>`).join("")}</div>`;
      panel.innerHTML = `
        <h3>${escapeHtml(CGx.nameOf(card.key))}</h3>
        <div class="ui-detail-sub">${escapeHtml(
          effect ? T("CardGame.type.effect") : CGx.rarityName(CGx.rarityOf(card.key)))}</div>
        ${body}
        <div class="cd-lore">${escapeHtml(card.lore || "")}</div>`;
    }

    updateSpriteFrames() {
      this._spriteTimer++;
      if (this._spriteTimer < 16) return;
      this._spriteTimer = 0;
      this._spriteFrame = (this._spriteFrame + 1) % 3;
      const container = document.getElementById("cardduel-container");
      if (!container) return;
      for (let i = 0; i < this._board.length; i++) {
        const cell = this._board[i];
        if (!cell) continue;
        const canvas = container.querySelector(`.cd-tile[data-i="${i}"] canvas.cd-sprite`);
        if (canvas) CG().Art.drawTileSprite(canvas, cell.key, this._spriteFrame);
      }
    }
  }

  window.Scene_CardDuel = Scene_CardDuel;

  //===========================================================================
  // Entry points
  //===========================================================================

  // The one way a duel is started, from the menu, from an NPC and from the
  // plugin command alike.
  window.CardDuel = {
    start(config) {
      if (!window.CardGame) return false;
      SceneManager.push(Scene_CardDuel);
      SceneManager.prepareNextScene(config || {});
      return true;
    },

    // A duel against a person: their deck is derived from their name, so the
    // same neighbour always brings the same cards.
    startVsNpc(npcName, profile, stake, actorId) {
      return this.start({
        opponentDeck: window.CardGame.npcDeck(npcName, profile),
        opponentName: npcName,
        npcName, profile, stake, actorId
      });
    },

    // No stakes and nothing on the line: the Cards menu's practice game.
    startPractice() {
      return this.start({
        opponentName: T("CardGame.duel.houseDeck"),
        opponentDeck: window.CardGame.randomDeck(16, 0.5),
        practice: true
      });
    }
  };

  //===========================================================================
  // Hyper Card Arena: the machine across the table, and the brackets
  //===========================================================================
  // A Hypernet program (the OS draws the window, Cards/CardGameDuel.js owns
  // the duel underneath it) for playing somebody who is not there. Three
  // decisions and nothing else: the deck you sit down with, how good the
  // machine is, and whether tonight is one match or a bracket.
  //
  // A BRACKET is straight knock-out over eight entrants, so three rounds:
  // quarter, semi, final. An entry fee is paid once at the door, every round
  // won pays out on its own, and the title pays the purse and a prize on top
  // of it. Losing ends the night: there is no repechage and the fee stays
  // paid. The run lives on $gameSystem so it survives a save mid-bracket.

  const ARENA_APP_ID = "app-card-arena";
  const ARENA_WINDOW_ID = "win-card-arena";
  const ARENA_ICON = 220;

  // The machine, by how well it plays. `power` is the ceiling its rolled deck
  // is allowed to reach up the rarity ladder (CardGame.randomDeck), `fee` what
  // a bracket at that level costs to enter, in gold.
  const ARENA_LEVELS = [
    { power: 0.20, fee: 1000 },
    { power: 0.35, fee: 2500 },
    { power: 0.50, fee: 6000 },
    { power: 0.70, fee: 14000 },
    { power: 0.90, fee: 30000 }
  ];
  const ARENA_ROUNDS = 3;          // eight entrants: quarter, semi, final
  const ARENA_ENTRANTS = 1 << ARENA_ROUNDS;
  // What a round won pays, as a multiple of the entry fee. The final is worth
  // most of the pot, which is what makes the last match the one that matters.
  const ARENA_ROUND_PAY = [0.6, 1.2, 3.2];

  const arenaLevel = (index) => ARENA_LEVELS[CG().clamp(Math.floor(index || 0), 0, ARENA_LEVELS.length - 1)];

  function arenaLevelName(index) {
    const names = (typeof T !== "undefined" && T.list) ? T.list("CardGame.arena.levels") : [];
    return names[index] || T("CardGame.arena.levelFallback", { n: index + 1 });
  }

  // The handles the machine plays under. Seeded on the run, so a bracket has
  // the same field from the door to the final rather than fresh strangers.
  function arenaRivals(seed, count) {
    const CGx = CG();
    const pool = (typeof T !== "undefined" && T.list) ? T.list("CardGame.arena.rivals") : [];
    const rng = CGx.makeRng((seed >>> 0) || 1);
    const out = [];
    const taken = new Set();
    for (let i = 0; i < count; i++) {
      let name = null;
      for (let attempt = 0; attempt < 16 && pool.length; attempt++) {
        const pick = pool[Math.floor(rng() * pool.length) % pool.length];
        if (!taken.has(pick)) { name = pick; break; }
      }
      if (!name) name = T("CardGame.arena.rivalFallback", { n: i + 1 });
      taken.add(name);
      out.push(name);
    }
    return out;
  }

  function arenaRoundName(round) {
    const names = (typeof T !== "undefined" && T.list) ? T.list("CardGame.arena.rounds") : [];
    return names[round] || T("CardGame.arena.roundFallback", { n: round + 1 });
  }

  // What a round won pays at this level.
  function arenaRoundPrize(levelIndex, round) {
    const level = arenaLevel(levelIndex);
    const rate = ARENA_ROUND_PAY[CG().clamp(round, 0, ARENA_ROUND_PAY.length - 1)];
    return Math.round(level.fee * rate);
  }

  // The trophy: an ordinary item, picked out of the shelf of everything that
  // has a price, as far up it as the level reaches. Built the way the arena
  // gauntlet builds its own streak pool, so the prize is real merchandise
  // rather than a thing invented for the occasion.
  function arenaPrizeItem(levelIndex, rng) {
    if (typeof $dataItems === "undefined") return null;
    const pool = [];
    for (let i = 1; i < $dataItems.length; i++) {
      const item = $dataItems[i];
      if (!item || !item.name || !item.name.trim()) continue;
      if (item.itypeId !== 1 || !(item.price > 0)) continue;
      pool.push(item);
    }
    if (!pool.length) return null;
    pool.sort((a, b) => a.price - b.price);
    const tier = (CG().clamp(levelIndex, 0, ARENA_LEVELS.length - 1) + 1) / ARENA_LEVELS.length;
    const centre = Math.floor(tier * (pool.length - 1));
    const span = Math.max(1, Math.floor(pool.length * 0.06));
    const lo = Math.max(0, centre - span);
    const hi = Math.min(pool.length - 1, centre + span);
    const roll = rng ? rng() : Math.random();
    return pool[lo + Math.floor(roll * (hi - lo + 1))] || pool[lo];
  }

  // The deck the player sits down with: their own, or one rolled for them.
  function arenaPlayerDeck(deckChoice) {
    const CGx = CG();
    if (deckChoice === "random") return CGx.randomDeck(16, 0.5);
    const own = CGx.playableDeck();
    return own.length >= CGx.DECK_MIN ? own : CGx.randomDeck(16, 0.4);
  }

  function arenaRun() {
    const s = typeof $gameSystem !== "undefined" ? $gameSystem : null;
    return (s && s._cardTournament) || null;
  }

  function setArenaRun(run) {
    if (typeof $gameSystem !== "undefined" && $gameSystem) $gameSystem._cardTournament = run || null;
  }

  function arenaToast(text, severity) {
    try {
      window.ParchmentToast && window.ParchmentToast.show(text, { severity: severity || "info", duration: 200 });
    } catch (e) { /* cosmetic */ }
  }

  window.CardArena = {
    LEVELS: ARENA_LEVELS,
    ROUNDS: ARENA_ROUNDS,
    ENTRANTS: ARENA_ENTRANTS,
    levelName: arenaLevelName,
    roundName: arenaRoundName,
    roundPrize: arenaRoundPrize,
    rivals: arenaRivals,
    prizeItem: arenaPrizeItem,
    playerDeck: arenaPlayerDeck,
    entryFee: (levelIndex) => arenaLevel(levelIndex).fee,
    // The whole purse of a run won from the door: every round plus the final.
    purse: (levelIndex) => ARENA_ROUND_PAY.reduce((sum, rate, round) => sum + arenaRoundPrize(levelIndex, round), 0),
    run: arenaRun,

    // One match against the machine, nothing staked and nothing owed.
    startMatch(levelIndex, deckChoice) {
      const CGx = window.CardGame;
      if (!CGx) return false;
      const level = arenaLevel(levelIndex);
      const rivals = arenaRivals(CGx.rollSeed(), 1);
      return window.CardDuel.start({
        playerDeck: arenaPlayerDeck(deckChoice),
        opponentDeck: CGx.randomDeck(16, level.power),
        opponentName: rivals[0],
        practice: false
      });
    },

    // Paying at the door. The fee is taken once; everything after it is the
    // bracket paying out.
    enter(levelIndex, deckChoice) {
      const CGx = window.CardGame;
      if (!CGx) return { ok: false, reason: "unavailable" };
      const level = arenaLevel(levelIndex);
      if (typeof $gameParty === "undefined" || $gameParty.gold() < level.fee) {
        return { ok: false, reason: "fee", fee: level.fee };
      }
      $gameParty.loseGold(level.fee);
      const seed = CGx.rollSeed();
      setArenaRun({
        level: CGx.clamp(Math.floor(levelIndex || 0), 0, ARENA_LEVELS.length - 1),
        deck: deckChoice === "random" ? "random" : "own",
        round: 0,
        seed,
        rivals: arenaRivals(seed, ARENA_ROUNDS),
        won: 0
      });
      this.playRound();
      return { ok: true, fee: level.fee };
    },

    // The next match of a bracket already paid for.
    playRound() {
      const CGx = window.CardGame;
      const run = arenaRun();
      if (!CGx || !run) return false;
      const level = arenaLevel(run.level);
      const rival = (run.rivals || [])[run.round] || T("CardGame.arena.rivalFallback", { n: run.round + 1 });
      arenaToast(T("CardGame.arena.roundOpens", { round: arenaRoundName(run.round), rival }), "info");
      return window.CardDuel.start({
        playerDeck: arenaPlayerDeck(run.deck),
        // Every round is harder than the last: the field thins towards
        // somebody who deserved to reach the final.
        opponentDeck: CGx.randomDeck(16, CGx.clamp(level.power + run.round * 0.06, 0, 1)),
        opponentName: rival,
        practice: true,
        onFinish: (winner) => window.CardArena.settleRound(winner)
      });
    },

    // How a round of the bracket ended. Anything but a win is elimination:
    // walking out of the match counts as losing it.
    settleRound(winner) {
      const run = arenaRun();
      if (!run) return null;
      if (winner !== 0) {
        setArenaRun(null);
        arenaToast(T("CardGame.arena.knockedOut", { round: arenaRoundName(run.round) }), "bad");
        return { ok: false, eliminated: true, round: run.round };
      }

      const prize = arenaRoundPrize(run.level, run.round);
      if (typeof $gameParty !== "undefined") $gameParty.gainGold(prize);
      try { window.ParchmentToast && window.ParchmentToast.gold(prize); } catch (e) { /* cosmetic */ }
      run.won = (run.won || 0) + 1;
      run.round += 1;

      if (run.round < ARENA_ROUNDS) {
        setArenaRun(run);
        arenaToast(T("CardGame.arena.roundWon", { round: arenaRoundName(run.round - 1), amount: euros(prize) }), "good");
        // The next match starts once the banner of the last one is gone.
        setTimeout(() => { try { window.CardArena.playRound(); } catch (e) { /* the run keeps */ } }, 700);
        return { ok: true, round: run.round, prize, done: false };
      }

      // The title.
      setArenaRun(null);
      const item = arenaPrizeItem(run.level, null);
      if (item && typeof $gameParty !== "undefined") $gameParty.gainItem(item, 1);
      arenaToast(T("CardGame.arena.championed", {
        level: arenaLevelName(run.level),
        amount: euros(prize),
        item: item ? item.name : T("CardGame.arena.noPrize")
      }), "good");
      return { ok: true, round: run.round, prize, item, done: true };
    }
  };

  //===========================================================================
  // The arena program
  //===========================================================================

  function arenaLaunch() {
    const OS = window.HypernetOS;
    const CGx = window.CardGame;
    if (!OS || !OS.Syscalls || !CGx) return;

    let level = 0;
    let deck = "own";
    let mode = "match";

    const contentHTML = `
      <div style="display:flex; flex-direction:column; height:100%; font-family:Tahoma,sans-serif; background:var(--xp-bg); overflow:hidden">
        <div style="background:linear-gradient(135deg, var(--xp-navy-8) 0%, var(--xp-navy-7) 55%, var(--xp-sky) 100%); padding:10px 16px; border-bottom:2px solid var(--xp-navy-6); flex-shrink:0">
          <div style="color:var(--xp-gold); font-weight:bold; font-size:17px; letter-spacing:2px">${escapeHtml(T("CardGame.arena.banner"))}</div>
          <div style="color:#cfe6ff; font-size:13px; margin-top:2px">${escapeHtml(T("CardGame.arena.tagline"))}</div>
        </div>
        <div style="flex:1; overflow-y:auto; padding:10px 14px; display:flex; flex-direction:column; gap:10px">
          <div>
            <div style="font-size:13px; color:var(--xp-ink-soft); letter-spacing:1px; margin-bottom:4px">${escapeHtml(T("CardGame.arena.deckHeading"))}</div>
            <div style="display:flex; gap:6px">
              <button id="ca-deck-own" class="focusable" data-focus-key="ca-deck-own" tabindex="0"
                      style="flex:1; padding:6px 0; font-size:14px; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">${escapeHtml(T("CardGame.arena.deckOwn"))}</button>
              <button id="ca-deck-random" class="focusable" data-focus-key="ca-deck-random" tabindex="0"
                      style="flex:1; padding:6px 0; font-size:14px; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">${escapeHtml(T("CardGame.arena.deckRandom"))}</button>
            </div>
            <div id="ca-deck-note" style="font-size:12px; color:var(--xp-ink-faint); margin-top:4px">&nbsp;</div>
          </div>
          <div>
            <div style="font-size:13px; color:var(--xp-ink-soft); letter-spacing:1px; margin-bottom:4px">${escapeHtml(T("CardGame.arena.levelHeading"))}</div>
            <div id="ca-levels" style="display:flex; flex-direction:column; gap:4px"></div>
          </div>
          <div>
            <div style="font-size:13px; color:var(--xp-ink-soft); letter-spacing:1px; margin-bottom:4px">${escapeHtml(T("CardGame.arena.modeHeading"))}</div>
            <div style="display:flex; gap:6px">
              <button id="ca-mode-match" class="focusable" data-focus-key="ca-mode-match" tabindex="0"
                      style="flex:1; padding:6px 0; font-size:14px; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">${escapeHtml(T("CardGame.arena.modeMatch"))}</button>
              <button id="ca-mode-bracket" class="focusable" data-focus-key="ca-mode-bracket" tabindex="0"
                      style="flex:1; padding:6px 0; font-size:14px; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">${escapeHtml(T("CardGame.arena.modeBracket"))}</button>
            </div>
          </div>
          <div id="ca-summary" style="background:var(--xp-white); border:1px solid var(--xp-silver-3); padding:9px 12px; font-size:13px; color:var(--xp-ink-3); line-height:1.6"></div>
          <button id="ca-start" class="focusable" data-focus-key="ca-start" tabindex="0"
                  style="width:100%; padding:10px; background:linear-gradient(135deg, var(--xp-navy-7), var(--xp-sky)); color:var(--xp-gold); border:1px solid var(--xp-sky-3); font-size:16px; font-weight:bold; font-family:Tahoma,sans-serif; letter-spacing:1.5px; cursor:pointer">${escapeHtml(T("CardGame.arena.start"))}</button>
        </div>
        <div id="ca-status" style="border-top:1px solid var(--xp-ink-pale-2); padding:3px 10px; background:var(--xp-bg); font-size:13px; color:var(--xp-text-muted); flex-shrink:0">&nbsp;</div>
      </div>`;

    const win = OS.Syscalls.createWindow({
      id: ARENA_WINDOW_ID,
      title: T("CardGame.arena.title"),
      contentHTML,
      width: 560,
      height: 520,
      icon: ARENA_ICON
    });

    const el = (id) => win.querySelector("#" + id);
    const paint = (btn, on) => {
      btn.style.background = on ? "linear-gradient(180deg,var(--xp-sky-2),var(--xp-navy-7))" : "#ece9d8";
      btn.style.color = on ? "#ffffff" : "#333333";
    };

    function renderLevels() {
      el("ca-levels").innerHTML = ARENA_LEVELS.map((entry, i) => `
        <button class="focusable" data-focus-key="ca-level-${i}" data-level="${i}" tabindex="0"
                style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; font-size:14px; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">
          <span>${escapeHtml(arenaLevelName(i))}</span>
          <span style="font-size:12px">${escapeHtml(T("CardGame.arena.feeTag", { amount: euros(entry.fee) }))}</span>
        </button>`).join("");
      win.querySelectorAll("[data-level]").forEach((btn) => {
        paint(btn, Number(btn.dataset.level) === level);
        btn.addEventListener("click", () => {
          level = Number(btn.dataset.level);
          playSe("Cursor1", 70, 100);
          render();
        });
      });
    }

    function render() {
      paint(el("ca-deck-own"), deck === "own");
      paint(el("ca-deck-random"), deck === "random");
      paint(el("ca-mode-match"), mode === "match");
      paint(el("ca-mode-bracket"), mode === "bracket");
      renderLevels();

      const own = CGx.playableDeck();
      el("ca-deck-note").textContent = deck === "own"
        ? (own.length >= CGx.DECK_MIN
          ? T("CardGame.arena.deckOwnNote", { n: own.length })
          : T("CardGame.arena.deckOwnShort", { min: CGx.DECK_MIN }))
        : T("CardGame.arena.deckRandomNote");

      const fee = window.CardArena.entryFee(level);
      el("ca-summary").innerHTML = mode === "bracket"
        ? escapeHtml(T("CardGame.arena.summaryBracket", {
          entrants: ARENA_ENTRANTS,
          rounds: ARENA_ROUNDS,
          fee: euros(fee),
          purse: euros(window.CardArena.purse(level))
        }))
        : escapeHtml(T("CardGame.arena.summaryMatch", { level: arenaLevelName(level) }));
    }

    function start() {
      if (mode === "bracket" && $gameParty.gold() < window.CardArena.entryFee(level)) {
        playSe("Buzzer1", 70, 100);
        const line = el("ca-status");
        line.textContent = T("CardGame.arena.cannotAfford", { amount: euros(window.CardArena.entryFee(level)) });
        line.style.color = "#8B1A00";
        return;
      }
      playSe("Casino/card_place_1", 80, 105);
      const chosen = { level, deck, mode };
      OS.WindowManager.closeWindow(win);
      SceneManager.pop();
      // The desktop leaves the stage before the table is set, the same way the
      // Colosseum program hands over to a fight.
      setTimeout(() => {
        try {
          if (chosen.mode === "bracket") window.CardArena.enter(chosen.level, chosen.deck);
          else window.CardArena.startMatch(chosen.level, chosen.deck);
        } catch (e) {
          console.error("CardArena: could not start the match.", e);
        }
      }, 320);
    }

    el("ca-deck-own").addEventListener("click", () => { deck = "own"; playSe("Cursor1", 70, 100); render(); });
    el("ca-deck-random").addEventListener("click", () => { deck = "random"; playSe("Cursor1", 70, 100); render(); });
    el("ca-mode-match").addEventListener("click", () => { mode = "match"; playSe("Cursor1", 70, 100); render(); });
    el("ca-mode-bracket").addEventListener("click", () => { mode = "bracket"; playSe("Cursor1", 70, 100); render(); });
    el("ca-start").addEventListener("click", start);
    render();
  }

  if (window.HypernetOS) {
    window.HypernetOS.registerApp({
      id: ARENA_APP_ID,
      name: T("CardGame.arena.title"),
      icon: ARENA_ICON,
      category: "games",
      desktopShortcut: true,
      launchFn: arenaLaunch
    });
  }

  const startRandom = (args) => {
    const CGx = window.CardGame;
    if (!CGx) return;
    const size = CGx.clamp(Number(args && args.deckSize) || 16, CGx.DECK_MIN, CGx.DECK_MAX);
    window.CardDuel.start({
      playerDeck: CGx.randomDeck(size, 0.5),
      opponentDeck: CGx.randomDeck(size, 0.5),
      opponentName: T("CardGame.duel.houseDeck"),
      practice: true
    });
  };

  PluginManager.registerCommand(PLUGIN, "StartRandomCardDuel", startRandom);
  PluginManager.registerCommand("CardGameDuel", "StartRandomCardDuel", startRandom);
})();
