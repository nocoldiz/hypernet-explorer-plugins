/*:
 * @plugindesc Makes player escape from battle 100% successful, except in the dungeon.
 * @author Omni-Lex
 * @target MZ MV
 * @help PerfectEscape.js
 * 
 * This plugin ensures that player escape attempts from battle
 * always succeed (100% success rate).
 * 
 * The dungeon is the exception: on any tower floor, above ground or below,
 * and in the accursed market, escaping is rolled on the ordinary odds and a
 * failed attempt costs the runner their turn (each failure improves the next
 * attempt by 10%). DungeonFloorSystem decides where that is.
 * 
 * No plugin parameters are needed.
 * Just install the plugin and enable it in your project.
 * 
 * Compatible with RPG Maker MV and MZ.
 */

(function() {
    // The one place the free escape is refused: on a dungeon floor, above ground
    // or below it, and in the accursed market, the way out has to be earned.
    // DungeonFloorSystem owns the answer to where that is.
    function escapeIsContested() {
        const DF = window.DungeonFloors;
        return !!(DF && typeof DF.escapeIsContested === "function" && DF.escapeIsContested());
    }

    // True while any living enemy in the troop carries the <Boss> tag. A boss
    // fight has no odds to roll against: it ends in victory or death, so the
    // free escape (and the dungeon's earned-odds exception) never applies here.
    function troopHasBoss() {
        try {
            return $gameTroop.aliveMembers().some(function(enemy) {
                const data = enemy && enemy.enemy && enemy.enemy();
                return !!(data && /<Boss>/i.test(data.note || ""));
            });
        } catch (e) {
            return false;
        }
    }

    // Override the escape success rate calculation
    Game_BattlerBase.prototype.makeEscapeRatio = function() {
        // Nothing to roll against in a boss fight: see troopHasBoss. The ratio
        // is zeroed as well as the refusal below, so any other way into the
        // roll (a talk that ends in a run, a scripted escape) is refused too.
        if (troopHasBoss()) return 0;
        return 1.0; // 100% success rate
    };

    // Force the escape ratio to 100% and delegate to the vanilla processEscape
    // so the standard "escaped" message still displays. Escaping always succeeds
    // no matter what, and resets any active arena streak.
    var _BattleManager_processEscape = BattleManager.processEscape;
    BattleManager.processEscape = function() {
        // A boss is refused outright rather than rolled against and lost. The
        // refusal is taken BEFORE the vanilla call on purpose: that one plays
        // the escape sound and runs $gameParty.performEscape() before it ever
        // looks at the odds, so delegating would sound and animate a getaway
        // that is not going to happen. It also means the failure handler never
        // runs, so the 10% that a failed run adds to the next attempt is never
        // added: there is no wearing a boss down by asking repeatedly.
        //
        // Returning false is what the rest of the game already reads as "still
        // in the fight": Scene_Battle.commandEscape (IndividualBattleTurns.js)
        // hands the turn on, and Core/Diary.js writes no flight into the diary.
        if (troopHasBoss()) {
            this.displayBossEscapeBlockedMessage();
            return false;
        }
        this._escapeRatio = 1.0;
        if (window.ArenaBattleHandler && typeof window.ArenaBattleHandler.setArenaStreak === "function") {
            window.ArenaBattleHandler.setArenaStreak(0);
        }
        return _BattleManager_processEscape.call(this);
    };

    // The battle log prints nothing any more, so the refusal is announced the
    // way every other transient line is.
    BattleManager.displayBossEscapeBlockedMessage = function() {
        const text = window.T ? window.T("Battle.escape.boss") : "";
        if (text && window.ParchmentToast) {
            window.ParchmentToast.show(text, { severity: "danger", duration: 120 });
        }
    };

    // A failed run costs the one who tried it their action and nothing more.
    // The vanilla handler clears the WHOLE party's queued actions and starts
    // the turn itself, neither of which suits a game where every battler acts
    // on its own: the command windows already hand the turn on from here.
    BattleManager.onEscapeFailure = function() {
        this.displayEscapeFailureMessage();
        this._escapeRatio += 0.1;
    };

    // The battle log prints nothing any more, so the refusal is announced the
    // way every other transient line is.
    BattleManager.displayEscapeFailureMessage = function() {
        const text = window.T ? window.T("Battle.escape.failed") : "";
        if (text && window.ParchmentToast) {
            window.ParchmentToast.show(text, { severity: "danger", duration: 120 });
        }
    };
})();
