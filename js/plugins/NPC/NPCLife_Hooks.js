/*:
 * @target MZ
 * @plugindesc NPC Life: engine hooks that run the catch-up
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @orderAfter NPCLife_Bands
 * @help
 * ============================================================================
 * NPCLife_Hooks, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns the ENGINE HOOKS: Game_Map.update and Scene_Map.onMapLoaded run the
 * catch-up. Loads last: it binds the late names every module reads once the
 * family is in.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCLifeSim._internal and publishes its own there. Load it right after
 * NPCLife_Bands.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    catchUp, MINUTES_PER_DAY,
  } = window.NPCLifeSim._internal;

  // ==========================================================================
  // ENGINE HOOKS (guarded so the module stays loadable outside RMMZ for tests)
  // ==========================================================================

  if (typeof Game_Map !== "undefined") {
    // Natural play + every time-skip path funnels through the minute variable;
    // catchUp itself early-outs until at least one full day has accumulated.
    const _Game_Map_update = Game_Map.prototype.update;
    Game_Map.prototype.update = function (sceneActive) {
      _Game_Map_update.call(this, sceneActive);
      if (!sceneActive || !$gameVariables) return;
      const minute = $gameVariables.value(114) || 0;
      if (minute !== this._lastLifeSimMinute) {
        this._lastLifeSimMinute = minute;
        const last = $gameSystem?._npcLifeLastSimMinute;
        if (last === undefined || last === null || minute - last >= MINUTES_PER_DAY || minute < last) {
          catchUp(minute);
        }
      }
    };
  }

  if (typeof Scene_Map !== "undefined") {
    // Resolve pending time right when a map finishes loading (post-load,
    // post-fast-travel, post-sleep) so biographies are current before the
    // player can inspect anyone.
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
      _Scene_Map_onMapLoaded.call(this);
      if ($gameVariables) catchUp($gameVariables.value(114) || 0);
    };
  }


  // The whole family is in: hand every module the names it reads late.
  for (const bind of window.NPCLifeSim._internal._late) bind();
})();
