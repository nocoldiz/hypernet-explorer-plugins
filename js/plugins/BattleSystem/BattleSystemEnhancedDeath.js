// ============================================================================
// Battle System Enhanced - Death, Gravestone & Respawn
// For RPG Maker MZ
// ============================================================================

/*:
 * @target MZ
 * @plugindesc v2.0 Death module: gravestone, respawn, permadeath, restore.
 * @author Combined by Claude, modified by OmniLex
 * @pluginName BattleSystemEnhancedDeath
 *
 * @help
 * ============================================================================
 * BattleSystemEnhancedDeath, Sub-module
 * ============================================================================
 *
 * Requires BattleSystemEnhanced.js (Core) and sub-modules to be loaded first.
 *
 * Manages actor death logic, gravestone placement, respawn mechanics,
 * inventory stripping on permadeath, and the "restore" plugin command.
 *
 * Loading order:
 *   1. BattleSystemEnhanced.js (Core)
 *   2. BattleSystemEnhancedEncounters.js
 *   3. BattleSystemEnhancedState.js
 *   4. BattleSystemEnhancedDeath.js (THIS PLUGIN)
 *   5. BattleSystemEnhancedMechanics.js
 *   6. BattleSystemEnhancedLevelDisplay.js
 */

(() => {
    'use strict';

    if (!window.BattleSystemEnhanced) {
        console.error('BattleSystemEnhancedDeath: Core plugin not loaded!');
        return;
    }
    const BSE = window.BattleSystemEnhanced;

    // ========================================================================
    // 1. SAVE DEATH DATA
    // ========================================================================

    function saveDeathData() {
        if (!$gameSwitches.value(9)) return;

        const savedData = {
            mapId: $gameMap.mapId(),
            x: $gamePlayer.x,
            y: $gamePlayer.y,
            gold: $gameParty.gold(),
            items: {}
        };

        // Save and remove standard items
        $gameParty.items().forEach(item => {
            const count = $gameParty.numItems(item);
            savedData.items['i' + item.id] = count;
            $gameParty.loseItem(item, count, false);
        });

        // Save and remove unequipped weapons
        $gameParty.weapons().forEach(weapon => {
            const isEquipped = $gameParty.members().some(actor => actor.isEquipped(weapon));
            if (!isEquipped) {
                const count = $gameParty.numItems(weapon);
                savedData.items['w' + weapon.id] = count;
                $gameParty.loseItem(weapon, count, false);
            }
        });

        // Save and remove unequipped armors
        $gameParty.armors().forEach(armor => {
            const isEquipped = $gameParty.members().some(actor => actor.isEquipped(armor));
            if (!isEquipped) {
                const count = $gameParty.numItems(armor);
                savedData.items['a' + armor.id] = count;
                $gameParty.loseItem(armor, count, false);
            }
        });

        $gameParty.loseGold($gameParty.gold());
        $gameSystem.setDeathData(savedData);
    }

    // Expose for other modules (used in BattleManager.processDefeat)
    BSE.Functions.saveDeathData = saveDeathData;

    // ========================================================================
    // 2. RESTORE COMMAND
    // ========================================================================

    BSE.Functions.executeRestoreCommand = function() {
        const deathData = $gameSystem.getDeathData();
        if (deathData) {
            $gameParty.gainGold(deathData.gold);
            for (const key in deathData.items) {
                const amount = deathData.items[key];
                let item = null;
                const id = parseInt(key.substring(1));
                if (key.startsWith('i')) item = $dataItems[id];
                else if (key.startsWith('w')) item = $dataWeapons[id];
                else if (key.startsWith('a')) item = $dataArmors[id];
                if (item) $gameParty.gainItem(item, amount, false);
            }
            $gameSystem.clearDeathData();
        }
    };

    // ========================================================================
    // 3. ACTOR DEATH ON MAP (processMapDeath)
    // ========================================================================

    // Story mode maps never trigger a terminal game over.
    const _hardcoreStoryModeMaps = [1414, 1415, 1416, 1417];
    function isTerminalDeath() {
        if (!$gameSwitches.value(9)) return false;
        if ($gameSwitches.value(75) && _hardcoreStoryModeMaps.includes($gameMap.mapId())) return false;
        return !!(window.SaveSystem && window.SaveSystem.triggerGameOver);
    }

    // The one map the whole procedural world is played on. A respawn candidate
    // that names it is only a place when it also carries the square it meant
    // (WorldMapReturn.snapshotProcRespawn).
    const PROC_MAP_ID = (window.WorldMapReturn && window.WorldMapReturn.procMapId) || 636;
    // Where a death lands when nothing else can be resolved.
    const SAFE_FALLBACK = { mapId: 708, x: 25, y: 12, proc: null };

    // A respawn candidate, or null when it does not name a place this party can
    // be put down on. On map 636 that means the square went with it: without one
    // the transfer would land on whichever square was loaded when the party died
    // - the very square that killed them - so the candidate is dropped and the
    // next one down the list is tried instead.
    function respawnCandidate(mapId, x, y, proc) {
        if (!(mapId > 0)) return null;
        if (mapId === PROC_MAP_ID) {
            return proc && proc.currentBiome ? { mapId, x, y, proc } : null;
        }
        return { mapId, x, y, proc: null };
    }

    // Resolves where a non-terminal (roguelite / peaceful) death respawns the
    // player, from three candidates:
    //   - the explicit respawn point: a camp slept in (TimeDateSystem) or the
    //     setRespawnPoint command (vars 25/26/27). The new-game defaults are
    //     ignored, they only count once a respawn has actually been set.
    //   - the latest location recorded by the save system (last save point)
    //   - the character-creation starting location: the tile the party's origin
    //     first put them down on, which for an overland origin is a square of
    //     the procedural map.
    //
    // On an authored map the last save point wins: it is the checkpoint the
    // player themselves made, and it is somewhere they were standing safely.
    // Out on the procedural map the order is the other way round - the point
    // they last set, then where they began - because a save out in the wild is
    // just wherever the autosave caught them walking, and waking up there means
    // waking up on the square that killed them, next to whatever killed them.
    //
    // With nothing resolvable: the default safe location in normal / roguelite
    // play, otherwise the hardcoded fallback passed in by the caller.
    function resolveRespawnLocation(fallbackMapId, fallbackX, fallbackY) {
        const saveLoc  = window.SaveSystem?.getLastSaveLocation?.();
        const startLoc = window.SaveSystem?.getCreationStartLocation?.();
        const savePoint  = saveLoc
            ? respawnCandidate(saveLoc.mapId, saveLoc.x, saveLoc.y, saveLoc.proc) : null;
        const setPoint   = $gameSystem._respawnPointSet
            ? respawnCandidate(
                $gameVariables.value(BSE.Params.respawnMapVar),
                $gameVariables.value(BSE.Params.respawnXVar),
                $gameVariables.value(BSE.Params.respawnYVar),
                $gameSystem._respawnProcSurface)
            : null;
        const startPoint = startLoc
            ? respawnCandidate(startLoc.mapId, startLoc.x, startLoc.y, startLoc.proc) : null;

        const onProcMap = !!$gameMap && $gameMap.mapId() === PROC_MAP_ID;
        const order = onProcMap ? [setPoint, startPoint, savePoint]
                                : [savePoint, setPoint, startPoint];
        const chosen = order.find(c => c);
        if (chosen) return chosen;

        if (!$gameSwitches.value(9)) return Object.assign({}, SAFE_FALLBACK);
        return { mapId: fallbackMapId, x: fallbackX, y: fallbackY, proc: null };
    }

    // Everything the world needs before a respawn transfer is reserved, and the
    // destination that survives it.
    //   - onto the procedural map: the stored square is rebuilt first, so the
    //     party lands on the one the respawn point meant rather than on a blank
    //     636. A square that cannot be rebuilt sends them to the safe fallback.
    //   - off it: the procedural state goes with them. Left standing, flags 110
    //     and 111 would have the game treat the town they woke up in as a
    //     generated square, still holding the tiles of the one they died on.
    function prepareRespawnDestination(dest) {
        const WMR = window.WorldMapReturn;
        if (dest.mapId === PROC_MAP_ID) {
            if (WMR?.restoreProcRespawn?.(dest.proc)) return dest;
            console.warn('BattleSystemEnhancedDeath: the respawn square could not be rebuilt; respawning at the default safe location.');
            return Object.assign({}, SAFE_FALLBACK);
        }
        if ($gameVariables.value(110) === 1 && $gameSystem.clearProcGenData) {
            $gameSystem.clearProcGenData();
        }
        return dest;
    }

    Game_Actor.prototype.processMapDeath = function() {
        if (this !== $gameParty.members()[0]) return;

        // Hardcore / Blood and Oil: death is terminal -> Game Over, no respawn.
        if (isTerminalDeath()) {
            $gameSystem.setActor1Died(true);
            BSE.State.needsRespawn = false;
            window.SaveSystem.triggerGameOver();
            return;
        }

        if ($gameSwitches.value(9)) {
            saveDeathData();
        }

        $gameVariables.setValue(1, 0);
        $gameSystem.setActor1Died(true);
        BSE.State.needsRespawn = true;
        this.recoverAll();

        // A death out on the map, away from a battle, never reaches the
        // post-battle branch in the state module, so the party's needs are
        // refilled here instead: in Roguelite and Peaceful you get back up
        // whole, rather than starving on top of having just died.
        if (BSE.Helpers.isForgivingDeathMode()) {
            BSE.Helpers.refillPartyNeeds();
        }

        let dest = resolveRespawnLocation(1, 21, 23);
        if ($gameSwitches.value(34)) dest = { mapId: 557, x: 13, y: 5, proc: null };
        if ($gameSwitches.value(100)) dest = { mapId: 1415, x: 60, y: 6, proc: null };

        $gamePlayer._priorityType = 0;
        $gamePlayer._through = true;
        $gameScreen.startFadeOut(30);

        if ($dataAnimations[1078]) {
            $gameTemp.requestAnimation([$gamePlayer], 1078);
        }

        setTimeout(() => {
            // Left until the transfer is actually reserved: rebuilding the
            // respawn square rewrites the party's world coordinates, and the map
            // they died on is still the one on screen until then.
            dest = prepareRespawnDestination(dest);
            const respawnMapId = dest.mapId;
            $gamePlayer.reserveTransfer(respawnMapId, dest.x, dest.y, 2, 0);
            let mapLoadAttempts = 0;
            const mapLoadInterval = setInterval(() => {
                // Give up after ~10s so the transfer never landing does not leak
                // a forever-running interval.
                if (++mapLoadAttempts > 100) { clearInterval(mapLoadInterval); return; }
                if ($gameMap.mapId() === respawnMapId) {
                    $gamePlayer._priorityType = 1;
                    $gamePlayer._through = false;
                    $gameSystem.setActor1Died(false);
                    BSE.State.needsRespawn = false;
                    if ($gameWeather) {
                        $gameWeather.updateTimeAndWeather();
                        $gameWeather.updateTimeOfDayTint();
                    }
                    clearInterval(mapLoadInterval);
                }
            }, 100);
        }, 500);
    };

    // ========================================================================
    // 4. Scene_Map - handleActor1Respawn
    // ========================================================================

    Scene_Map.prototype.handleActor1Respawn = function() {
        // Hardcore / Blood and Oil: a full party wipe ends the run with a
        // Game Over screen instead of respawning.
        if (isTerminalDeath()) {
            BSE.State.needsRespawn = false;
            window.SaveSystem.triggerGameOver();
            return;
        }

        $gameVariables.setValue(1, 0);
        $gamePlayer.setThrough(true);

        let dest = resolveRespawnLocation(25, 0, 0);
        let respawnCountryID = $gameVariables.value(BSE.Params.respawnCountryIDVar) || 112;

        // Permadeath respawn. Also require Switch 9 (permadeath active): Switch 34
        // is set on a permadeath death but never reset, so this guards against a
        // stale Switch 34 removing roguelite party members if Switch 9 is later off (#80).
        if ($gameSwitches.value(34) && $gameSwitches.value(9)) {
            $gameSwitches.setValue(13, false);
            dest = { mapId: 557, x: 13, y: 5, proc: null };
            $gameVariables.setValue(86, 102);
            $gameVariables.setValue(BSE.Params.respawnCountryIDVar, 102);

            if ($gameSystem._currentPresetId && window.removePresetById) {
                window.removePresetById($gameSystem._currentPresetId);
            }

            const party = $gameParty.members();
            if (party[1]) $gameParty.removeActor(party[1].actorId());
            if (party[2]) $gameParty.removeActor(party[2].actorId());
        } else {
            $gameVariables.setValue(86, respawnCountryID);
            $gameVariables.setValue(BSE.Params.respawnCountryIDVar, respawnCountryID);
        }

        // Story mode area respawn
        const _storyModeMaps = [1414, 1415, 1416, 1417];
        if ($gameSwitches.value(75) && _storyModeMaps.includes($gameMap.mapId())) {
            dest = { mapId: 1414, x: 61, y: 7, proc: null };
        }

        $gameScreen.startFadeOut(30);
        setTimeout(() => {
            // Same as processMapDeath: the square is put back only once the
            // party is actually leaving for it.
            dest = prepareRespawnDestination(dest);
            const respawnMapId = dest.mapId;
            $gamePlayer.reserveTransfer(respawnMapId, dest.x, dest.y, 2, 0);
            BSE.State.needsRespawn = false;

            let weatherAttempts = 0;
            const weatherUpdateInterval = setInterval(() => {
                // Give up after ~10s to avoid leaking a forever-running interval
                // if the transfer never lands on the respawn map.
                if (++weatherAttempts > 100) { clearInterval(weatherUpdateInterval); return; }
                if ($gameMap.mapId() === respawnMapId && $gameWeather) {
                    $gameWeather.updateTimeAndWeather();
                    $gameWeather.updateTimeOfDayTint();
                    clearInterval(weatherUpdateInterval);
                }
            }, 100);
        }, 500);
    };

    // ========================================================================
    // 5. Scene_Map - handlePartyMemberDeath
    // ========================================================================

    Scene_Map.prototype.handlePartyMemberDeath = function(actor, actorName) {
        // Only Hardcore (Permadeath) and Blood and Oil permanently remove a
        // fallen member. In Roguelite (Switch 9 off) the dead body stays in
        // the party so it can still be resurrected after the battle.
        if (!$gameSwitches.value(9)) return;
        if (!actor || !actor.isDead()) return;
        // What it does to the ones still standing, read while the body is
        // still counted as party: grief scaled by how close they were, nothing
        // at all for whoever is past caring, and a weight off the shoulders of
        // anybody who could not stand them (BattleMood, TimeDateSystem.js).
        if (window.BattleMood) {
            try { window.BattleMood.onMemberLost(actor); } catch (e) { /* the removal still happens */ }
        }
        $gameParty.removeActor(actor.actorId());
        window.skipLocalization = true;
        $gameMessage.add(T('Battle.actorDied', { actor: actorName }));
        window.skipLocalization = false;
    };

    // ========================================================================
    // 6. Game_Player - performTransfer
    // ========================================================================

    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        _Game_Player_performTransfer.call(this);
        if (this.isTransferring() && !BSE.State.needsRespawn) {
            this.setThrough(false);
        }
    };

})();