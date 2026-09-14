//=============================================================================
// RPG Maker MZ - Individual Turn Battle System - Version 1.1
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Implements a battle system where your action takes place straight after your input.
 * @author Fomar0153
 *
 * @param Battle Turn Order Formula
 * @type string
 * @desc This is a calculation that determines the initial battle order.
 * @default this.agi + Math.randomInt(this.agi / 2)
 *
 * @param Use Party Command Window
 * @type boolean
 * @desc If you hit cancel on the Actor Command Window, show the Party Command Window instead of skipping the turn.
 * @default true
 *
 * @param Add Pass to Party Command Window
 * @type boolean
 * @desc If you are using thr party command window, would you like the pass option added to it?
 * @default true
 *
 * @param Pass Command Name
 * @type string
 * @desc This is the text displayed for the pass command.
 * @default Pass
 *
 * @help Fomar0153_IndividualTurnBattleSystem.js
 * Some examples of the Battle Turn Order Formula:
 * this.agi
 * The battle order will strictly be in order of agility.
 * this.agi + Math.randomInt(this.agi / 2)
 * This will bias the turn order to the fastest combatants but allow for some deviation.
 *
 * Version 1.0 -> 1.1
 * Bug fixes! Specifically to do with restrictions on status effects.
 */

var Fomar = Fomar || {};
Fomar.ITBS = {};

Fomar.ITBS.parameters = PluginManager.parameters('Fomar0153_IndividualTurnBattleSystem');

Fomar.ITBS.battleAgi = Fomar.ITBS.parameters["Battle Turn Order Formula"] || "this.agi";
Fomar.ITBS.partyCommand = (Fomar.ITBS.parameters["Use Party Command Window"] == "true");
Fomar.ITBS.passCommand = (Fomar.ITBS.parameters["Add Pass to Party Command Window"] == "true");
Fomar.ITBS.passText = Fomar.ITBS.parameters["Pass Command Name"] || "Pass";

(() => {

  // ---------------------------------------------------------------------
  // Party turn order
  // ---------------------------------------------------------------------
  // Speed never decides who among the party acts first: the party acts in its
  // own marching order, member 1 then 2 then 3, and the menu (Dynamics -> Turn
  // Order) rearranges that order into a list of actor ids on $gameSystem.
  // Anyone missing from the list (a member who joined after it was arranged)
  // falls in behind, in party order. The DEX formula above still ranks the
  // whole field, so it is what decides where the party's slots fall against
  // the monsters, i.e. when the enemies get to swing.
  window.BattleTurnOrder = {
    // Read back sanitised against the party as it stands, so an id that has
    // since left never holds a slot and a list of ghosts reads as "no order".
    pinned() {
      const stored = (typeof $gameSystem !== "undefined" && $gameSystem)
        ? $gameSystem._partyTurnOrder : null;
      if (!Array.isArray(stored) || stored.length === 0) return null;
      const party = (typeof $gameParty !== "undefined" && $gameParty)
        ? $gameParty.members().map(mem => mem.actorId()) : [];
      const kept = stored.filter(id => party.includes(id));
      return kept.length ? kept : null;
    },

    isPinned() {
      return !!window.BattleTurnOrder.pinned();
    },

    // The value a battler is ranked by out of battle: _battleAgi only exists
    // once a fight has started, and the menu has to read the party before one
    // ever does.
    speedOf(battler) {
      if (!battler) return 0;
      return battler._battleAgi !== undefined ? battler._battleAgi : battler.agi;
    },

    // The party in the order it will act: the marching order, rearranged by
    // whatever the menu pinned. Speed is not consulted.
    members() {
      const list = (typeof $gameParty !== "undefined" && $gameParty)
        ? $gameParty.members().slice() : [];
      const order = window.BattleTurnOrder.pinned();
      if (order) {
        // Stable sort, so anyone left off the list keeps their party slot.
        const rank = actor => {
          const at = order.indexOf(actor.actorId());
          return at < 0 ? Number.MAX_SAFE_INTEGER : at;
        };
        list.sort((a, b) => rank(a) - rank(b));
      }
      return list;
    },

    set(actorIds) {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return;
      $gameSystem._partyTurnOrder = Array.isArray(actorIds) ? actorIds.slice() : null;
    },

    // Back to the marching order.
    clear() {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return;
      $gameSystem._partyTurnOrder = null;
    },

    // Nudge a member one place up or down the acting order. The first nudge
    // pins the whole current order, so what is captured is the order the player
    // was just looking at rather than a half-empty list.
    move(actorId, delta) {
      const ids = window.BattleTurnOrder.members().map(mem => mem.actorId());
      const from = ids.indexOf(actorId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= ids.length) return false;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      window.BattleTurnOrder.set(ids);
      return true;
    }
  };

  BattleManager.isTpb = function() {
    return true;
  };

  Fomar.ITBS.BattleManager_initMembers = BattleManager.initMembers;
  BattleManager.initMembers = function() {
    Fomar.ITBS.BattleManager_initMembers.call(this);
    this._battlers = [];
  };

  // Build a fresh round: every living battler, party and troop alike, acts
  // exactly once. The speed formula ranks the whole field, which is what
  // decides where the party's slots fall against the monsters, so a fast
  // monster still opens the round and a slow one closes it whatever the head
  // count on either side. Among themselves the party ignores speed entirely:
  // the slots the party won are held and the members are dealt into them in
  // their marching order, or in the order pinned from Dynamics -> Turn Order.
  // Rebuilding this each round keeps the ordering stable even if the queue was
  // disturbed during the previous one. However lopsided the head count, nobody
  // gets a second slot: an outnumbered enemy is never handed an extra action to
  // compensate.
  BattleManager.makeITBSRound = function() {
    const aliveParty = $gameParty.aliveMembers();
    const aliveTroop = $gameTroop.aliveMembers();
    // Mid-fight reinforcements never ran onBattleStart, so ensure every battler
    // entering the round has _battleAgi computed before sorting; otherwise the
    // `_battleAgi || 0` fallback would always place them last.
    aliveParty.concat(aliveTroop).forEach(b => { if (b._battleAgi === undefined) b.updateBattleAgi(); });

    // The party's own order overrules speed: the slots the party won in the
    // speed ranking stay exactly where they are and the members are dealt into
    // them in the order the menu reads, so the troop keeps every position its
    // own speed earned.
    const order = window.BattleTurnOrder
      ? window.BattleTurnOrder.members().filter(mem => aliveParty.includes(mem))
      : null;

    const all = aliveParty.concat(aliveTroop);
    all.sort((a, b) => (b._battleAgi || 0) - (a._battleAgi || 0));
    if (order && order.length) {
      let next = 0;
      for (let i = 0; i < all.length; i++) {
        if (all[i].isActor() && next < order.length) all[i] = order[next++];
      }
    }
    return all;
  };

  Fomar.ITBS.BattleManager_startBattle = BattleManager.startBattle;
  BattleManager.startBattle = function() {
    Fomar.ITBS.BattleManager_startBattle.call(this);
    // The first round is built by the same speed rules as every other one...
    this._battlers = this.makeITBSRound();

    // ...except that the opening turn is always the player's, however fast the
    // monsters are. The battle-start danger warning ("this thing is far above
    // your level", BattleSystemEnhancedMechanics) is only worth printing if the
    // party can still act on it, so Player 1 opens the fight and can run before
    // anything swings at them. Every round after this one is pure speed again.
    // Split screen: the opener is whoever walked into the monster.
    let opener = $gameParty.members()[0];
    if (window.$gameSplitScreen && window.$gameSplitScreen.active) {
      const activator = $gameMessage._eventActivator || "p1";
      if (activator === "p2" && $gameParty.members().length >= 2) {
        opener = $gameParty.members()[1]; // Player 2
      }
    }
    if (opener) {
      const index = this._battlers.indexOf(opener);
      if (index > 0) {
        this._battlers.splice(index, 1); // Remove from current position
        this._battlers.unshift(opener);  // Move to front
      }
    }
  };

  BattleManager.updateTurn = function(timeActive) {
    $gameParty.requestMotionRefresh();
    // Honour vanilla forced actions (BattleManager.forceAction). The custom
    // ITBS round loop never consulted _actionForcedBattler, so any forceAction
    // (e.g. MimicSkillSystem's MimicMirror) was a silent no-op. Process it
    // ahead of the normal queue and let the "action" phase take over.
    if (this.isActionForced()) {
      this.processForcedAction();
      return;
    }
    if (!this._subject && !this._currentActor) {
      this.updateTpb();
    }
    if (this._subject) {
      this.processTurn();
    }
  };

  BattleManager.updateTpb = function() {
    // Drop anyone who has died since being queued so a corpse never holds a
    // slot. Reinforcements that joined mid-round are picked up by the next
    // rebuild, which re-reads both sides from scratch.
    this._battlers = this._battlers.filter(member => member && member.isAlive());
    // When the round is finished, start a new one. Rebuilding from scratch
    // keeps the per-round ordering (see makeITBSRound) stable, even if the
    // queue was disturbed during the previous round.
    if (this._battlers.length === 0) {
      this._battlers = this.makeITBSRound();
    }
    if (this._battlers[0]) {
      this._battlers[0].onTurnEnd();
      if (this._battlers[0].isActor()) {
        if (this._battlers[0].canMove()) {
          if (this._battlers[0].canInput()) {
            this._inputting = true;
            this._currentActor = this._battlers[0];
            this._currentActor.makeActions();
            this.startActorInput();
          } else {
            this._subject = this._battlers[0];
            this._subject.makeActions();
          }
        }
      } else {
        this._subject = this._battlers[0];
        this._subject.makeActions();
        $gameTroop.increaseTurn();
      }
      // Dequeue by position rather than by value: a battler holds exactly one
      // slot per round, and shifting keeps the rest of the queue intact.
      this._battlers.shift();
    }
  };

  BattleManager.updateTpbInput = function() {
    // done elsewhere now
  };

  BattleManager.finishActorInput = function() {
    if (this._currentActor) {
      this._subject = this._currentActor;
      this._inputting = false;
    }
  };

  BattleManager.changeCurrentActor = function(forward) {
      this._currentActor = null;
  };

  // Compute a battler's turn-order value. Shared by onBattleStart and the
  // per-round lazy init in makeITBSRound so reinforcements are ordered too.
  Game_Battler.prototype.updateBattleAgi = function(advantageous) {
    // Compile the turn-order formula once with new Function instead of eval-ing
    // the string for every battler every round. eval() deopts the whole method;
    // the formula only references `this` and the global Math. Fall back to eval
    // if a custom formula fails to compile.
    if (Fomar.ITBS._battleAgiFn === undefined) {
      try {
        Fomar.ITBS._battleAgiFn = new Function('return (' + Fomar.ITBS.battleAgi + ');'); // i18n-ignore: compiled formula source
      } catch (e) {
        Fomar.ITBS._battleAgiFn = null;
      }
    }
    this._battleAgi = Fomar.ITBS._battleAgiFn
      ? Fomar.ITBS._battleAgiFn.call(this)
      : eval(Fomar.ITBS.battleAgi);
    if (advantageous) {
      this._battleAgi *= 2;
    }
  };

  Fomar.ITBS.Game_Battler_onBattleStart = Game_Battler.prototype.onBattleStart;
  Game_Battler.prototype.onBattleStart = function(advantageous) {
    // The engine's own onBattleStart spends `advantageous` on the opening TPB
    // charge, so a preemptive strike loses its advantage if it is dropped here.
    Fomar.ITBS.Game_Battler_onBattleStart.call(this, advantageous);
    this.updateBattleAgi(advantageous);
  };

  Game_Battler.prototype.canInput = function() {
    return Game_BattlerBase.prototype.canInput.call(this);
  };

  Game_Battler.prototype.applyTpbPenalty = function() {
    // surely failing to escape is penalty enough?
  };

  Window_StatusBase.prototype.placeTimeGauge = function(actor, x, y) {
    // no time bar, thanks
  };

  Window_PartyCommand.prototype.makeCommandList = function() {
    this.addCommand(TextManager.fight, "fight");
    if (Fomar.ITBS.passCommand) {
      this.addCommand(Fomar.ITBS.passText, "pass");
    }
    this.addCommand(TextManager.escape, "escape", BattleManager.canEscape());
  };

  Fomar.ITBS.Scene_Battle_createPartyCommandWindow = Scene_Battle.prototype.createPartyCommandWindow;
  Scene_Battle.prototype.createPartyCommandWindow = function() {
    Fomar.ITBS.Scene_Battle_createPartyCommandWindow.call(this);
    this._partyCommandWindow.setHandler("pass", this.commandPass.bind(this));
  };

  Scene_Battle.prototype.startPartyCommandSelection = function() {
    this._statusWindow.show();
    this._statusWindow.open();
    this._actorCommandWindow.close();
    this._partyCommandWindow.setup();
  };

  Scene_Battle.prototype.commandCancel = function() {
    if (Fomar.ITBS.partyCommand) {
      this.startPartyCommandSelection();
    } else {
      this.selectPreviousCommand();
    }
  };

  Scene_Battle.prototype.commandFight = function() {
    this._partyCommandWindow.close();
    this._actorCommandWindow.open();
    this._actorCommandWindow.activate();
  };

  Scene_Battle.prototype.commandPass = function() {
    this.selectNextCommand();
  };

  Scene_Battle.prototype.commandEscape = function() {
    const escaped = BattleManager.processEscape();
    // A run that got away has ALREADY ended the fight (processEscape ->
    // processAbort -> endBattle), leaving BattleManager in its "battleEnd"
    // phase with nothing to do but pop the scene. Handing the turn on from
    // here walks straight back into the input machinery instead:
    // finishActorInput re-arms _subject with the actor who just fled and
    // selectNextActor goes hunting for another one to ask, so the escape is
    // buried under a fresh turn and the party is left standing in a battle it
    // already left. Tear the input state down explicitly and let the phase run
    // its course - the same fix MapBattleMode._commandEscape carries for the
    // tactical layer.
    if (escaped || BattleManager.isBattleEnd()) {
      BattleManager._currentActor = null;
      BattleManager._subject = null;
      BattleManager._inputting = false;
      this.endCommandSelection();
      return;
    }
    // A failed run costs the runner their turn and nothing more.
    this.selectNextCommand();
  };

})();
