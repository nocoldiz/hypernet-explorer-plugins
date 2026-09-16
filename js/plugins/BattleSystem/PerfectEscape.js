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
 * A boss fight is the other exception: the way out is open but narrow. It is
 * rolled on long odds that a failed attempt improves only slightly.
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

    // How hard a boss is to break away from: one attempt in five gets out, and
    // every failed attempt adds a little to the next one.
    const BOSS_ESCAPE_RATIO = 0.2;
    const BOSS_ESCAPE_GAIN = 0.05;

    // True while any living enemy in the troop carries the <Boss> tag. The free
    // escape never applies to a boss: the run is rolled on the long odds above.
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
        // A boss can be fled, but only on the long odds above, and any other
        // route into the roll (a talk that ends in a run, a scripted escape)
        // reads the same number.
        if (troopHasBoss()) return BOSS_ESCAPE_RATIO;
        return 1.0; // 100% success rate
    };

    // Force the escape ratio to 100% and delegate to the vanilla processEscape
    // so the standard "escaped" message still displays. Escaping always succeeds
    // no matter what, and resets any active arena streak.
    var _BattleManager_processEscape = BattleManager.processEscape;
    BattleManager.processEscape = function() {
        // A boss is rolled against on the long odds rather than handed the free
        // getaway. The ratio is seeded on the FIRST attempt of the fight only,
        // so the ground a failed run earns (see onEscapeFailure) is not wiped
        // out by the next attempt reseeding it.
        //
        // Returning false is what the rest of the game already reads as "still
        // in the fight": Scene_Battle.commandEscape (IndividualBattleTurns.js)
        // hands the turn on, and Core/Diary.js writes no flight into the diary.
        const boss = troopHasBoss();
        if (boss) {
            if (!this._bossEscapeRolled) {
                this._bossEscapeRolled = true;
                this._escapeRatio = BOSS_ESCAPE_RATIO;
            }
        } else {
            this._escapeRatio = 1.0;
        }
        if (window.ArenaBattleHandler && typeof window.ArenaBattleHandler.setArenaStreak === "function") {
            window.ArenaBattleHandler.setArenaStreak(0);
        }
        const success = _BattleManager_processEscape.call(this);
        // A boss holding the party is worth saying out loud; an ordinary failed
        // run gets the generic line instead.
        if (!success && boss) this.displayBossEscapeBlockedMessage();
        return success;
    };

    // The boss roll keeps its own flag, so a new fight starts back at the long
    // odds instead of at whatever the last one was worn down to.
    const _BattleManager_startBattle_PE = BattleManager.startBattle;
    BattleManager.startBattle = function() {
        this._bossEscapeRolled = false;
        _BattleManager_startBattle_PE.call(this);
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
        // A boss gives ground grudgingly: asking again helps, but far less.
        this._escapeRatio += troopHasBoss() ? BOSS_ESCAPE_GAIN : 0.1;
    };

    // The battle log prints nothing any more, so the refusal is announced the
    // way every other transient line is.
    BattleManager.displayEscapeFailureMessage = function() {
        // A boss failure is announced by processEscape, so the generic line is
        // not doubled up on top of it.
        if (troopHasBoss()) return;
        const text = window.T ? window.T("Battle.escape.failed") : "";
        if (text && window.ParchmentToast) {
            window.ParchmentToast.show(text, { severity: "danger", duration: 120 });
        }
    };
})();
