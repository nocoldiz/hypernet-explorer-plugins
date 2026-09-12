// ============================================================================
// Battle System Enhanced - Persistent Battles & Rewards
// For RPG Maker MZ
// ============================================================================

/*:
 * @target MZ
 * @plugindesc v2.0 State module: persistent HP, rewards, corpses, battle flow.
 * @author Combined by Claude, modified by OmniLex
 * @pluginName BattleSystemEnhancedState
 *
 * @help
 * ============================================================================
 * BattleSystemEnhancedState, Sub-module
 * ============================================================================
 *
 * Requires BattleSystemEnhanced.js (Core) and 
 * BattleSystemEnhancedEncounters.js to be loaded first.
 *
 * Manages persistent enemy HP tracking, battle reward popups,
 * enemy part damage synchronization, corpse sprite rendering,
 * and post-battle state cleanup (event deletion/locking, cooldowns).
 *
 * Loading order:
 *   1. BattleSystemEnhanced.js (Core)
 *   2. BattleSystemEnhancedEncounters.js
 *   3. BattleSystemEnhancedState.js (THIS PLUGIN)
 *   4. BattleSystemEnhancedDeath.js
 *   5. BattleSystemEnhancedMechanics.js
 *   6. BattleSystemEnhancedLevelDisplay.js
 */

(() => {
    'use strict';

    if (!window.BattleSystemEnhanced) {
        console.error('BattleSystemEnhancedState: Core plugin not loaded!');
        return;
    }
    const BSE = window.BattleSystemEnhanced;

    // ========================================================================
    // 1. SHARED MODULE STATE
    // ========================================================================

    let _lastSpawnedMapId = null;
    // The procedural map (636) reuses the same map ID across edge transitions,
    // so _lastSpawnedMapId alone can't detect moving between proc regions. Track
    // the proc-gen region identity (origin + layer depth + which biome) separately
    // so stale corpses/part-damage are cleared when the region actually changes.
    let _lastProcRegionKey = null;
    const BATTLE_COOLDOWN_FRAMES = 120;
    let _battleCooldownTimer = 0;
    let _battleTurnCount = 0;

    const PROC_MAP_ID = 636;
    const _procRegionKey = function() {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg) return null;
        const depth = (pg.biomeLayerStack && pg.biomeLayerStack.length) || 0;
        // A structure biome entered through a terrain feature (LootCellar, Sewer,
        // Crypt, CaveDen, TempleInside, PatronVault, a sandbox Dungeon) is built by
        // startForcedBiome as a fresh depth-0 map on the SAME world square, so
        // origin + depth alone reads identical to the surface it was entered from
        // and back again. The biome name and the entrance salt tell them apart.
        const session = pg._dungeonSession;
        const salt = session ? `${session.type || ''}:${session.salt || 0}` : '';
        return `${pg.originX},${pg.originY},${depth},${pg.currentBiome || ''},${salt}`;
    };

    // Corpses and the transient part-damage snapshot decorate the map the fight
    // happened on. Clear them in place so BSE.Data keeps holding the same
    // references the accessors were seeded with.
    const _clearMapCorpses = function() {
        BSE.State.mapCorpses.length = 0;
        const pd = BSE.State.enemyPartDamage;
        for (const key in pd) delete pd[key];
    };

    // _lastSpawnedMapId is module-scoped, so it survives across a new game or a
    // load. Reset it on both so the first Scene_Map.start after starting/loading
    // always spawns enemies (otherwise loading a save on the last-spawned map
    // would skip spawning until you leave and return).
    const _DM_setupNewGame_lastSpawn = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _lastSpawnedMapId = null;
        _lastProcRegionKey = null;
        _DM_setupNewGame_lastSpawn.call(this);
    };
    const _DM_extractSaveContents_lastSpawn = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _lastSpawnedMapId = null;
        _lastProcRegionKey = null;
        _DM_extractSaveContents_lastSpawn.call(this, contents);
    };

    // ========================================================================
    // 2. Game_System - Battle State Storage
    // ========================================================================

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._battleEnded = false;
        this._actor1Died = false;
        this._actor2Died = false;
        this._actor3Died = false;
        this._actor2Name = "";
        this._actor3Name = "";
        // Queues, not single slots: a battle can settle several map events at
        // once now that nearby monsters join a fight.
        this._eventsToDelete = [];
        this._eventsToLock = [];
        this._deathData = null;
        this._battleCooldownTimer = 0;
    };

    Game_System.prototype.setBattleCooldown = function(frames) { this._battleCooldownTimer = frames; };
    Game_System.prototype.getBattleCooldown = function() { return this._battleCooldownTimer || 0; };
    Game_System.prototype.updateBattleCooldown = function() {
        if (this._battleCooldownTimer > 0) this._battleCooldownTimer--;
    };
    Game_System.prototype.setBattleEnded = function(value) { this._battleEnded = value; };
    Game_System.prototype.isBattleEnded = function() { return this._battleEnded; };
    Game_System.prototype.setFullPartyWipe = function(value) { this._fullPartyWipe = value; };
    Game_System.prototype.isFullPartyWipe = function() { return this._fullPartyWipe; };
    Game_System.prototype.setActor1Died = function(value) { this._actor1Died = value; };
    Game_System.prototype.isActor1Died = function() { return this._actor1Died; };
    Game_System.prototype.setActor2Died = function(value, name) { this._actor2Died = value; this._actor2Name = name || ""; };
    Game_System.prototype.isActor2Died = function() { return this._actor2Died; };
    Game_System.prototype.getActor2Name = function() { return this._actor2Name; };
    Game_System.prototype.setActor3Died = function(value, name) { this._actor3Died = value; this._actor3Name = name || ""; };
    Game_System.prototype.isActor3Died = function() { return this._actor3Died; };
    Game_System.prototype.getActor3Name = function() { return this._actor3Name; };
    // A battle can end owing the map more than one event: the monster that
    // started it plus every roamer that joined in. Both lists are queues, and
    // the map drains the entries that belong to it once the fight is over.
    const queueEvent = (list, mapId, eventId) => {
        if (!list.some(e => e.mapId === mapId && e.eventId === eventId)) {
            list.push({ mapId, eventId });
        }
    };
    // A save written before the queues existed carries a single pending entry
    // in the old slot; fold it in the first time the queue is read.
    Game_System.prototype.getEventsToDelete = function() {
        if (!this._eventsToDelete) {
            this._eventsToDelete = this._eventToDelete ? [this._eventToDelete] : [];
            this._eventToDelete = null;
        }
        return this._eventsToDelete;
    };
    Game_System.prototype.getEventsToLock = function() {
        if (!this._eventsToLock) {
            this._eventsToLock = this._eventToLock ? [this._eventToLock] : [];
            this._eventToLock = null;
        }
        return this._eventsToLock;
    };
    Game_System.prototype.setEventToDelete = function(mapId, eventId) {
        queueEvent(this.getEventsToDelete(), mapId, eventId);
    };
    Game_System.prototype.clearEventsToDelete = function() { this._eventsToDelete = []; };
    Game_System.prototype.setEventToLock = function(mapId, eventId) {
        queueEvent(this.getEventsToLock(), mapId, eventId);
    };
    Game_System.prototype.clearEventsToLock = function() { this._eventsToLock = []; };
    Game_System.prototype.setDeathData = function(data) { this._deathData = data; };
    Game_System.prototype.getDeathData = function() { return this._deathData; };
    Game_System.prototype.clearDeathData = function() { this._deathData = null; };

    // ========================================================================
    // 3. BattleManager - Setup & Start
    // ========================================================================

    const _BattleManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        _BattleManager_setup.call(this, troopId, canEscape, canLose);

        // Apply wet status if battle starts on water tile. A title-launched arena
        // (or a save loaded straight into battle) can have $gameMap._mapId set while
        // $dataMap was never streamed in, so guard against the null map data too or
        // terrainTag()/regionId() dereference null and throw.
        if ($gameMap && $gameMap._mapId && $dataMap && typeof $dataMap.width === 'number') {
            const playerX = $gamePlayer.x;
            const playerY = $gamePlayer.y;
            const terrainTag = $gameMap.terrainTag(playerX, playerY);
            const regionId = $gameMap.regionId(playerX, playerY);
            const isWaterTile = (terrainTag === 3 || regionId === 99);
            if (isWaterTile) {
                for (let i = 0; i < $gameParty.members().length; i++) {
                    $gameParty.members()[i].addState(28);
                }
                for (let i = 0; i < $gameTroop.members().length; i++) {
                    $gameTroop.members()[i].addState(28);
                }
            }
        }
    };

    const _BattleManager_update = BattleManager.update;
    BattleManager.update = function() {
        _BattleManager_update.apply(this, arguments);
        if (this._phase === 'action' || this._phase === 'turn') {
            // checkActorDeaths() only flips one-way death latches (idempotent),
            // and the exact turn boundary is already caught by the endTurn hook.
            // Poll a few times per second instead of every frame to avoid a
            // per-frame $gameParty.members() allocation; the latency is invisible.
            this._bseDeathPollTick = (this._bseDeathPollTick || 0) + 1;
            if (this._bseDeathPollTick >= 10) {
                this._bseDeathPollTick = 0;
                this.checkActorDeaths();
            }
        }
    };

    // ========================================================================
    // 4. BattleManager - Display & Message Overrides
    // ========================================================================

    BattleManager.displayStartMessages = function() {
        _battleTurnCount = 0;
    };

    BattleManager.displayEscapeFailureMessage = function() {};
    BattleManager.displayEscapeSuccessMessage = function() {};
    BattleManager.displayVictoryMessage = function() {};

    // Where the dungeon denies the free way out (any tower floor, above ground
    // or below, and the accursed market). DungeonFloorSystem owns the answer.
    function escapeIsContested() {
        const DF = window.DungeonFloors;
        return !!(DF && typeof DF.escapeIsContested === "function" && DF.escapeIsContested());
    }

    const _BattleManager_makeEscapeRatio = BattleManager.makeEscapeRatio;
    BattleManager.makeEscapeRatio = function() {
        _BattleManager_makeEscapeRatio.call(this);
        // The free first-turn getaway belongs to the open world. Inside the
        // tower the odds stay as they were rolled, and a failed run costs a
        // turn like any other action.
        if (_battleTurnCount <= 1 && !escapeIsContested()) this._escapeRatio = 1.0;
    };

    const _BattleManager_makeRewards = BattleManager.makeRewards;
    BattleManager.makeRewards = function() {
        _BattleManager_makeRewards.call(this);
        const r = BSE.State.battleRewards;
        r.exp = this._rewards.exp || 0;
        r.gold = this._rewards.gold || 0;
        r.items = this._rewards.items ? this._rewards.items.slice() : [];
        // The headline, the extra lines and the levels gained belong to the
        // fight that just ended, never to the one before it.
        r.title = null;
        r.lines = [];
        r.entries = [];
        r.levelUps = [];
    };

    // Knowledge from a win is priced by how far above the party the troop was,
    // on the shared curve in SkillMaster (window.KnowledgePoints), so a fight and
    // the contract that asked for it pay on the same scale. The old formula read
    // only the single strongest enemy and used a flat level *difference*, which
    // ignored troop size and never scaled with the party's own level: at level 5
    // a +20 enemy paid 20 KP, at level 60 the same relative threat paid 60.
    const _BattleManager_processVictory = BattleManager.processVictory;
    BattleManager.processVictory = function() {
        const party = $gameParty.members();
        if (party.length && $gameTroop && $gameTroop.members().length && window.KnowledgePoints) {
            const partyMedian = BSE.Helpers.getMedianLevel(party);
            const enemyLevels = $gameTroop.members().map(e => {
                const data = $dataEnemies[e.enemyId()];
                return data ? BSE.Helpers.getEnemyLevel(data.note) : 0;
            });
            const knowledge = window.KnowledgePoints.forEncounter(enemyLevels, partyMedian);
            if (knowledge > 0) {
                $gameSystem.addKnowledge(knowledge);
                BSE.State.battleRewards.knowledge = knowledge;
            }
        }
        // Anything the fight itself owes is paid AFTER the engine has made its
        // rewards: makeRewards() rebuilds the item list from the drop table, so
        // a crate of oil flasks added before it would be thrown away.
        _BattleManager_processVictory.call(this);
        payPetrodemonSpoils();
        recordBossVictory();
        // Coming home alive is worth something to everyone who did, on the
        // scale BattleMood keeps (TimeDateSystem.js): a member who fights for
        // the pleasure of it feels more of it, a pacifist none of it.
        if (window.BattleMood) {
            try { window.BattleMood.onVictory(); } catch (e) { /* the fight is still won */ }
        }
    };

    // ========================================================================
    // 4b. Felling something worth remembering
    // ------------------------------------------------------------------------
    // A petrodemon pays in crude: oil flasks and Crude Oil into the pack, OIL
    // options into the party's holdings, all of it named in the spoils popup.
    // ========================================================================
    function payPetrodemonSpoils() {
        if (!BSE.Functions.payPetrodemonSpoils) return;
        const paid = BSE.Functions.payPetrodemonSpoils();
        if (!paid) return;
        const r = BSE.State.battleRewards;
        r.title = T('Battle.petrodemon.slain', { name: paid.record.name });
        r.lines = (r.lines || []).slice();
        if (paid.shares > 0) r.lines.push(T('Battle.petrodemon.options', { n: paid.shares }));
        // The crate is one entry carrying its own count, not one entry a flask.
        r.entries = (r.entries || []).concat(paid.entries);
    }

    // The month a battle was fought in, on the same clock the assembly and the
    // epidemics file their records by.
    function battleHistoryDate() {
        if (window.TimeDateSystem && typeof window.TimeDateSystem.getDateTimeFromMinutes === 'function') {
            const dt = window.TimeDateSystem.getDateTimeFromMinutes($gameVariables.value(114));
            if (dt && dt.year && dt.monthNum) return `${dt.year}-${dt.monthNum}`;
        }
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    // Killing a boss is a thing the world remembers: it goes into the Archive
    // alongside the century's wars, keyed rather than written out so the
    // sentence is rebuilt in whatever language the world is later read in.
    // Petrodemons are named as such; every other <Boss> creature is entered by
    // its own name.
    function recordBossVictory() {
        const hm = window.HistoryManager;
        if (!hm || typeof hm.recordEvent !== 'function') return;
        const leader = $gameParty.leader();
        if (!leader || !$gameTroop) return;
        const date = battleHistoryDate();
        const seen = [];
        $gameTroop.members().forEach(battler => {
            if (!battler || !battler.isDead || !battler.isDead()) return;
            const data = battler.enemy ? battler.enemy() : null;
            if (!data) return;
            const petro = !!data._bsePetrodemon;
            if (!petro && !/<Boss>/i.test(data.note || '')) return;
            const name = battler.originalName ? battler.originalName() : data.name;
            if (seen.indexOf(name) >= 0) return;   // one line per creature, not per body
            seen.push(name);
            hm.recordEvent({
                date: date,
                category: 'military',
                type: petro ? 'petrodemon_slain' : 'boss_slain',
                descKey: petro ? 'History.battle.petrodemonSlain' : 'History.battle.bossSlain',
                descParams: { leader: leader.name(), enemy: name },
                iconIndex: 115
            });
        });
    }

    const _BattleManager_startTurn = BattleManager.startTurn;
    BattleManager.startTurn = function() {
        _BattleManager_startTurn.call(this);
        _battleTurnCount++;
    };

    const _BattleManager_endTurn = BattleManager.endTurn;
    BattleManager.endTurn = function() {
        this.checkActorDeaths();
        _BattleManager_endTurn.call(this);
    };

    BattleManager.displayRewards = function() {
        this.gainRewards();
    };

    // ========================================================================
    // 5. BattleManager - Actor Death Detection
    // ========================================================================

    BattleManager.checkActorDeaths = function() {
        let deathOccurred = false;
        const members = $gameParty.members();
        if (members[0] && members[0].isDead() && !$gameSystem.isActor1Died()) {
            $gameSystem.setActor1Died(true);
            deathOccurred = true;
        }
        if (members[1] && members[1].isDead() && !$gameSystem.isActor2Died()) {
            $gameSystem.setActor2Died(true, members[1].name());
            deathOccurred = true;
        }
        if (members[2] && members[2].isDead() && !$gameSystem.isActor3Died()) {
            $gameSystem.setActor3Died(true, members[2].name());
            deathOccurred = true;
        }
        return deathOccurred;
    };

    // The leader going down used to end the fight on the spot: whoever was still
    // standing never got their turn, and the party woke up at the respawn point
    // having lost a battle it was winning. A leader is a battler like the other
    // two now. The fight is lost when the WHOLE party is down and not a moment
    // before, which is what BattleManager.checkBattleEnd already asks
    // ($gameParty.isAllDead -> processDefeat below), and a leader knocked out on
    // the way to a win simply comes round an hour later like anybody else
    // (BattleSystemEnhancedDeath.js).

    BattleManager.processDefeat = function() {
        const _storyModeMaps = [1414, 1415, 1416, 1417];
        const inStoryMode = $gameSwitches.value(75) && _storyModeMaps.includes($gameMap.mapId());
        AudioManager.stopBgm();
        if ($gameSwitches.value(9) && !inStoryMode) {
            // Permadeath ON: save death data
            $gameSwitches.setValue(34, true);
            // Whole party down for good: every fallen member gets a date of
            // death in the roster history (Dynamics -> History).
            $gameParty.members().forEach(actor => {
                if (actor.isDead()) window.PartyRoster?.recordDeath?.(actor);
            });
        }
        $gameSystem.setActor1Died(true);
        $gameSystem.setFullPartyWipe(true);
        BSE.State.needsRespawn = true;
        const actor1 = $gameParty.members()[0];
        if (actor1) actor1.recoverAll();
        this._escaped = true;
        this.updateBattleEnd();
    };

    // ========================================================================
    // 6. BattleManager - Battle End & Persistent HP
    // ========================================================================

    const _BattleManager_updateBattleEnd = BattleManager.updateBattleEnd;
    BattleManager.updateBattleEnd = function() {
        const partyStates = $gameParty.members().map(actor => ({
            actor, isDead: actor.isDead(), actorId: actor.actorId(), name: actor.name()
        }));
        _BattleManager_updateBattleEnd.call(this);
        if (this._escaped || $gameParty.isAllDead() || $gameTroop.isAllDead()) {
            $gameSystem.setBattleEnded(true);
            partyStates.forEach((state, index) => {
                if (state.isDead) {
                    if (index === 0) $gameSystem.setActor1Died(true);
                    else if (index === 1) $gameSystem.setActor2Died(true, state.name);
                    else if (index === 2) $gameSystem.setActor3Died(true, state.name);
                }
            });
        }
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        const members = $gameParty.members();
        members.forEach((actor, index) => {
            if (actor.isDead()) {
                if (index === 0 && !$gameSystem.isActor1Died()) $gameSystem.setActor1Died(true);
                else if (index === 1 && !$gameSystem.isActor2Died()) $gameSystem.setActor2Died(true, actor.name());
                else if (index === 2 && !$gameSystem.isActor3Died()) $gameSystem.setActor3Died(true, actor.name());
            }
        });

        const pData = BSE.State.persistentEnemyData;
        const bId = BSE.State.currentBattleEventId;
        const eId = BSE.State.currentEventId;
        const mId = BSE.State.currentMapId;

        // Monsters that piled in from nearby (see startPersistentBattle). Their
        // map events are settled exactly the way the triggering one is: wiped on
        // a win or a recruit, locked with their HP kept on a flee.
        const reinforcement = BSE.Helpers.getReinforcement();
        const joined = reinforcement.joined;
        const baseSize = reinforcement.baseSize;

        // Mark a joined monster's event the way a defeated trigger event is
        // marked: deleted from the map, and remembered as defeated on the
        // procedural map so it does not come back with the next spawn pass.
        const clearJoinedEvent = j => {
            delete pData[j.persistentId];
            $gameSystem.setEventToDelete(j.mapId, j.eventId);
            if ($gameMap.mapId() === 636) {
                if (!$gameSystem._procGenDefeatedEnemies) $gameSystem._procGenDefeatedEnemies = [];
                if (!$gameSystem._procGenDefeatedEnemies.includes(j.eventId)) {
                    $gameSystem._procGenDefeatedEnemies.push(j.eventId);
                }
            }
        };

        // An event whose monsters are all off the field is settled the way a
        // defeated one is, whatever ended the battle: they are dead, or they
        // walked away with the party (recruited as allies or pets, hidden by
        // EnemyTalkSystem). Anything of it still standing and the event is
        // locked instead, with its wounds written back. Read per event rather
        // than per battle, since one monster of a pack can be talked round
        // while the rest keep fighting.
        const eventCleared = indexes => indexes.every(i => {
            const enemy = $gameTroop.members()[i];
            return !enemy || !enemy.isAlive();
        });

        // Shared corpse helper - used for both flee (dead enemies mid-battle)
        // and win (all enemies cleared). An enemy whose HP is still > 0 survived
        // and gets no corpse; only those killed before the battle ended do.
        const dropCorpse = (evMapId, evId, troopIndex) => {
            if (!evId || !evMapId) return;
            const deadEvent = $gameMap.event(evId);
            if (!deadEvent || !deadEvent._characterName) return;
            const deadTroop = deadEvent._fixedTroopId ? $dataTroops[deadEvent._fixedTroopId] : null;
            const deadEnemy = (deadTroop && deadTroop.members.length > 0)
                ? $dataEnemies[deadTroop.members[0].enemyId] : null;
            // Still standing is not the same as still having HP: a monster kept
            // up by Immortal sits at 0 and would otherwise leave a body behind
            // on every flee while its map event lives on.
            const troopMember = $gameTroop && $gameTroop.members()[troopIndex];
            const enemyAlive = troopMember && troopMember.isAlive();
            if (enemyAlive) return;
            BSE.Functions.dropMapCorpse({
                mapId: evMapId,
                x: deadEvent.x,
                y: deadEvent.y,
                spriteName: deadEvent._characterName,
                spriteIndex: deadEvent._characterIndex,
                hue: deadEvent._characterHue || 0,
                bloodColor: getCorpseBloodColor(deadEnemy),
                enemyId: (deadTroop && deadTroop.members[0]) ? deadTroop.members[0].enemyId : 0
            });
        };

        if (result === 1 && bId) { // Fled, or a recruit that emptied the field
            const baseIndexes = [];
            for (let i = 0; i < baseSize; i++) baseIndexes.push(i);
            if (eventCleared(baseIndexes)) {
                delete pData[bId];
                $gameSystem.setEventToDelete(mId, eId);
                if ($gameMap.mapId() === 636) {
                    if (!$gameSystem._procGenDefeatedEnemies) $gameSystem._procGenDefeatedEnemies = [];
                    if (!$gameSystem._procGenDefeatedEnemies.includes(eId)) {
                        $gameSystem._procGenDefeatedEnemies.push(eId);
                    }
                }
            } else {
                // Drop a corpse for any base enemy that died during the battle
                // before we fled, so their map event becomes a body on return.
                for (let i = 0; i < baseSize; i++) dropCorpse(mId, eId, i);

                const persistentData = pData[bId] || { enemyHp: {} };
                // Only the troop that started the fight belongs to this event's
                // record; the members past it came from the joining events and are
                // written back to their own records below.
                $gameTroop.members().forEach((enemy, index) => {
                    if (index < baseSize) persistentData.enemyHp[index] = enemy.hp;
                });
                pData[bId] = persistentData;
                $gameSystem.setEventToLock(mId, eId);
            }
            joined.forEach(j => {
                if (eventCleared(j.memberIndexes)) {
                    clearJoinedEvent(j);
                    return;
                }
                // Drop corpses for any joined enemies that died before we fled.
                j.memberIndexes.forEach(ti => dropCorpse(j.mapId, j.eventId, ti));

                const jData = pData[j.persistentId] || { enemyHp: {} };
                j.memberIndexes.forEach((troopIndex, i) => {
                    const enemy = $gameTroop.members()[troopIndex];
                    if (enemy) jData.enemyHp[i] = enemy.hp;
                });
                pData[j.persistentId] = jData;
                $gameSystem.setEventToLock(j.mapId, j.eventId);
            });
            // Clear rewards: the party did not win this fight.
            const r = BSE.State.battleRewards;
            r.exp = 0; r.gold = 0; r.items = []; r.knowledge = 0;
        } else if (result === 0 && bId) { // Win
            dropCorpse(mId, eId, 0);
            joined.forEach(j => dropCorpse(j.mapId, j.eventId, j.memberIndexes[0]));

            if (pData[bId]) delete pData[bId];
            $gameSystem.setEventToDelete(mId, eId);
            if ($gameMap.mapId() === 636) {
                if (!$gameSystem._procGenDefeatedEnemies) $gameSystem._procGenDefeatedEnemies = [];
                if (!$gameSystem._procGenDefeatedEnemies.includes(eId)) {
                    $gameSystem._procGenDefeatedEnemies.push(eId);
                }
            }
            joined.forEach(clearJoinedEvent);
        }

        saveEnemyPartDamage();
        $gameSystem.setBattleEnded(true);
        BSE.State.currentBattleEventId = null;
        BSE.State.reinforcement = null;

        _BattleManager_endBattle.call(this, result);
    };

    // Enemy max HP multiplier applied when a lone actor enters battle.
    // A solo party brings roughly 1/3 the firepower, so trim enemy bulk to match.
    const SOLO_ENEMY_HP_MULT = 0.66;

    const _Game_Troop_setup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function(troopId) {
        _Game_Troop_setup.call(this, troopId);

        const bId = BSE.State.currentBattleEventId;
        const pData = BSE.State.persistentEnemyData;
        const record = bId ? pData[bId] : null;

        // A wound record belongs to the creature it was written for, but it is
        // keyed on the event SLOT ("mapId_eventId") alone. That slot is re-stocked
        // behind its back: the procedural map re-deals its fauna into the same
        // event ids on every tile, and a <?> or multi-id troop note re-rolls on
        // every map load. Left unchecked, a fresh monster inherits whatever the
        // thing that stood there before was left with. Trust the record only
        // while the event still carries the troop it was written against.
        if (record && BSE.State.currentEventId && BSE.State.currentMapId === $gameMap.mapId()) {
            const ev = $gameMap.event(BSE.State.currentEventId);
            if (ev && ev._fixedTroopId > 0 && record.troopId > 0 &&
                ev._fixedTroopId !== record.troopId) {
                record.troopId = ev._fixedTroopId;
                record.enemyHp = {};
                delete record.bodyParts;
            }
        }

        const storedHp = record ? record.enemyHp : null;

        // Debuff enemy max HP for a lone party member. Applied before restoring
        // persistent HP so stored values (already in debuffed scale) clamp correctly.
        if ($gameParty.battleMembers().length <= 1 && SOLO_ENEMY_HP_MULT < 1) {
            this.members().forEach((enemy, index) => {
                const penalty = Math.round(enemy.mhp * (1 - SOLO_ENEMY_HP_MULT));
                if (penalty <= 0) return;
                enemy.addParam(0, -penalty);
                // Fresh enemies (no persisted HP) start at the new full HP.
                if (!storedHp || storedHp[index] === undefined) {
                    enemy.setHp(enemy.mhp);
                }
            });
        }

        if (storedHp) {
            this.members().forEach((enemy, index) => {
                if (storedHp[index] !== undefined) enemy.setHp(storedHp[index]);
            });
        }

        // Monsters that joined from nearby (see startPersistentBattle) carry the
        // wounds their own map event was left with, read from that event's own
        // persistent record rather than the one the battle is keyed on.
        const reinforcement = BSE.Helpers.getReinforcement();
        if (reinforcement.troopId === troopId) {
            reinforcement.joined.forEach(j => {
                const jHp = pData[j.persistentId] && pData[j.persistentId].enemyHp;
                if (!jHp) return;
                j.memberIndexes.forEach((troopIndex, i) => {
                    const enemy = this.members()[troopIndex];
                    if (enemy && jHp[i] !== undefined) enemy.setHp(jHp[i]);
                });
            });
        }
    };

    // ------------------------------------------------------------------
    // A monster that cannot take the Death state never dies: refresh() erases
    // the state it has just tried to add, so the body stands at 0 HP for good
    // and every flee from it leaves another corpse behind. A resist handed out
    // by a state (Immortal) lasts only as long as that state does and is left
    // alone; one written into the monster's own data is a mistake and is
    // ignored, so no database row can make something unkillable.
    // ------------------------------------------------------------------
    const _Game_Enemy_stateResistSet = Game_Enemy.prototype.stateResistSet;
    Game_Enemy.prototype.stateResistSet = function() {
        const set = _Game_Enemy_stateResistSet.call(this);
        const deathId = this.deathStateId();
        if (!set.includes(deathId)) return set;
        const fromState = this.states().some(state => state && state.traits &&
            state.traits.some(t => t.code === Game_BattlerBase.TRAIT_STATE_RESIST &&
                t.dataId === deathId));
        return fromState ? set : set.filter(id => id !== deathId);
    };

    const _Game_Enemy_die = Game_Enemy.prototype.die;
    Game_Enemy.prototype.die = function() {
        _Game_Enemy_die.call(this);
        const bId = BSE.State.currentBattleEventId;
        const pData = BSE.State.persistentEnemyData;
        if (bId && pData[bId]) {
            const index = $gameTroop.members().indexOf(this);
            // Indexes past the base troop belong to the monsters that joined the
            // fight, not to this event's own record.
            const baseSize = BSE.Helpers.getReinforcement().baseSize;
            if (index >= 0 && index < baseSize) pData[bId].enemyHp[index] = 0;
        }
    };

    const _Spriteset_Battle_isBusy = Spriteset_Battle.prototype.isBusy;
    Spriteset_Battle.prototype.isBusy = function() {
        if (_Spriteset_Battle_isBusy.call(this)) return true;
        if (this._enemySprites) {
            return this._enemySprites.some(sprite => sprite.isEffecting && sprite.isEffecting());
        }
        return false;
    };

    // ========================================================================
    // 7. Enemy Part Damage Syncing
    // ========================================================================
    // partData (BSE.State.enemyPartDamage, keyed by enemyId) is a transient
    // snapshot consumed by corpse harvesting (ContainerSystemUI) right after a
    // kill - fine to share across enemies of the same species since only the
    // just-defeated one is read before the next death overwrites it.
    // Living, still-roaming map enemies must NOT restore from that shared-by-id
    // table (two different map events of the same enemyId would bleed damage
    // into each other). Instead their body-part state rides along with the
    // same per-instance persistentEnemyData record (keyed by "mapId_eventId")
    // that already tracks their HP across flee/re-encounter.

    function saveEnemyPartDamage() {
        if (!$gameTroop) return;
        const partData = BSE.State.enemyPartDamage;
        const bId = BSE.State.currentBattleEventId;
        const pData = BSE.State.persistentEnemyData;
        const instanceParts = (bId && pData[bId]) ? {} : null;
        $gameTroop.members().forEach(function(enemy, index) {
            if (!enemy._bodyParts) return;
            const parts = {};
            for (const key in enemy._bodyParts) {
                const p = enemy._bodyParts[key];
                parts[key] = {
                    currentHp: p.currentHp, maxHp: p.maxHp,
                    destroyed: p.destroyed, appliedStatEffect: p.appliedStatEffect
                };
            }
            const record = {
                parts,
                statModifiers: Object.assign({}, enemy._statModifiers || {}),
                disabledActions: (enemy._disabledActions || []).slice(),
                archetypeName: enemy._archetypeName || null,
                def: enemy.def || 0
            };
            partData[enemy.enemyId()] = record;
            if (instanceParts) instanceParts[index] = record;
        });
        if (instanceParts) pData[bId].bodyParts = instanceParts;
    }

    function restoreEnemyPartDamage() {
        if (!$gameTroop) return;
        const bId = BSE.State.currentBattleEventId;
        const pData = BSE.State.persistentEnemyData;
        const saved = bId && pData[bId] && pData[bId].bodyParts;
        if (!saved) return;
        $gameTroop.members().forEach(function(enemy, index) {
            const s = saved[index];
            if (!s || !enemy._bodyParts) return;
            for (const key in s.parts) {
                if (enemy._bodyParts[key]) {
                    const sp = s.parts[key];
                    enemy._bodyParts[key].currentHp = sp.currentHp;
                    enemy._bodyParts[key].maxHp = sp.maxHp;
                    enemy._bodyParts[key].destroyed = sp.destroyed;
                    enemy._bodyParts[key].appliedStatEffect = sp.appliedStatEffect;
                }
            }
            if (!enemy._statModifiers) enemy._statModifiers = {};
            Object.assign(enemy._statModifiers, s.statModifiers);
            if (enemy._disabledActions) {
                s.disabledActions.forEach(a => {
                    if (!enemy._disabledActions.includes(a)) enemy._disabledActions.push(a);
                });
            }
            enemy.refresh();
        });
    }

    const _BattleManager_startBattle_PartRestore = BattleManager.startBattle;
    BattleManager.startBattle = function() {
        _BattleManager_startBattle_PartRestore.call(this);
        restoreEnemyPartDamage();
    };

    // ========================================================================
    // 8. Corpse Sprite System
    // ========================================================================

    function getCorpseBloodColor(enemyData) {
        const hexToRgb = hex => {
            const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [220, 20, 20];
        };
        const bsfxParams = PluginManager.parameters('BloodSplatterFX');
        const defaultHex = bsfxParams.defaultBloodColor || '#ff0000';
        const archetype = BSE.Helpers.getEnemyArchetype(enemyData);
        if (!archetype) return hexToRgb(defaultHex);
        try {
            const colorList = JSON.parse(bsfxParams.archetypeColors || '[]').map(s => JSON.parse(s));
            const match = colorList.find(ac => ac.archetype.toLowerCase() === archetype.toLowerCase());
            return hexToRgb(match ? match.color : defaultHex);
        } catch (_) {
            return hexToRgb(defaultHex);
        }
    }

    // Exposed so other modules (e.g. map enemy-vs-enemy deaths) can match blood colour
    BSE.Helpers.getCorpseBloodColor = getCorpseBloodColor;

    function Sprite_EnemyCorpse(data) {
        this.initialize(data);
    }

    Sprite_EnemyCorpse.prototype = Object.create(Sprite.prototype);
    Sprite_EnemyCorpse.prototype.constructor = Sprite_EnemyCorpse;

    Sprite_EnemyCorpse.prototype.initialize = function(data) {
        Sprite.prototype.initialize.call(this);
        this._data = data;
        this._isBigCharacter = ImageManager.isBigCharacter(data.spriteName);
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        this.rotation = Math.PI / 2;
        this.z = 1;
        this.bitmap = ImageManager.loadCharacter(data.spriteName);
        this.bitmap.addLoadListener(this._onBitmapReady.bind(this));
    };

    Sprite_EnemyCorpse.prototype._onBitmapReady = function() {
        const bm = this.bitmap;
        const big = this._isBigCharacter;
        const pw = bm.width / (big ? 3 : 12);
        const ph = bm.height / (big ? 4 : 8);
        const idx = this._data.spriteIndex;
        const bx = big ? 0 : (idx % 4) * 3 * pw;
        const by = big ? 0 : Math.floor(idx / 4) * 4 * ph;
        this.setFrame(bx + pw, by, pw, ph);
        const [r, g, b] = this._data.bloodColor;
        this.setBlendColor([r, g, b, 160]);
    };

    Sprite_EnemyCorpse.prototype.update = function() {
        Sprite.prototype.update.call(this);
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        this.x = Math.round($gameMap.adjustX(this._data.x) * tw + tw / 2);
        this.y = Math.round($gameMap.adjustY(this._data.y) * th + th / 2);
    };

    const _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function() {
        _Spriteset_Map_createCharacters.call(this);
        this._corpseSprites = BSE.State.mapCorpses
            .filter(data => data.mapId === $gameMap.mapId())
            .map(data => {
                const sprite = new Sprite_EnemyCorpse(data);
                this._tilemap.addChild(sprite);
                return sprite;
            });
    };

    // A corpse belongs to the map it was killed on, and the list above is keyed by
    // map ID alone. On the procedural map (636) every region shares that ID, so a
    // body left in a sewer, dungeon, loot cellar or crypt was re-drawn at the same
    // tile of whatever was generated next. Wipe the list on EVERY transfer (door,
    // world map, proc edge crossing, goDown/goUp, a structure biome entered through
    // a terrain feature), which runs from Scene_Map.onMapLoaded before
    // createDisplayObjects builds the spriteset that reads it.
    // A creature's wounds last as long as the party's visit, not forever. Every
    // way a map creature can be hurt - the party fleeing a fight, the ecology's
    // own brawls, a car running it down - happens while the party is standing on
    // that map, so walking off it settles the ledger and whatever is still alive
    // is met whole next time. Without this the record simply accumulated: it is
    // saved with the game and keyed on the event slot, so a monster hurt hours
    // ago (or, on the procedural map, a completely different one re-dealt into
    // the same slot) turned up already bleeding for no reason the player saw.
    //
    // Body-part damage is deliberately left alone - a severed limb does not grow
    // back over a doorway - so an enemy comes back at the full HP its remaining
    // parts allow, not at the HP it had when it was last hit.
    BSE.Functions.healPersistentEnemies = function() {
        const pData = BSE.State.persistentEnemyData;
        for (const key in pData) {
            if (pData[key]) pData[key].enemyHp = {};
        }
        // Ecology brawls are keyed by event id pair and live on $gameSystem, so
        // they outlive the map they were started on: a stale pair whose ids
        // happen to be two adjacent monsters on the NEW map would resume chewing
        // on them the moment the party arrives.
        if ($gameSystem) $gameSystem._enemyFights = {};
    };

    const _Game_Player_performTransfer_BSEState = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        const wasTransferring = this.isTransferring();
        _Game_Player_performTransfer_BSEState.call(this);
        if (!wasTransferring) return;
        _clearMapCorpses();
        BSE.Functions.healPersistentEnemies();
        // Re-baseline the region key against where the player actually landed, so
        // Scene_Map.start below does not immediately re-clear (harmless) and, more
        // importantly, does not mistake the arrival region for an unchanged one.
        _lastProcRegionKey = $gameMap.mapId() === PROC_MAP_ID ? _procRegionKey() : null;
    };

    // Add a single corpse sprite at runtime (used when one map enemy kills another)
    Spriteset_Map.prototype.addCorpseSprite = function(data) {
        if (!this._corpseSprites) this._corpseSprites = [];
        const sprite = new Sprite_EnemyCorpse(data);
        if (this._tilemap) this._tilemap.addChild(sprite);
        this._corpseSprites.push(sprite);
        return sprite;
    };

    // A corpse recorded while the map scene is already up (map battle mode never
    // leaves Scene_Map, so createCharacters is not run again) has to raise its own
    // sprite, or the body only shows up after the next spriteset rebuild.
    BSE.Functions.dropMapCorpse = function(data) {
        if (!data) return null;
        if (BSE.State.mapCorpses) BSE.State.mapCorpses.push(data);
        const scene = SceneManager._scene;
        const spriteset = scene && scene._spriteset;
        if (data.mapId === $gameMap.mapId() && spriteset && spriteset.addCorpseSprite) {
            spriteset.addCorpseSprite(data);
        }
        return data;
    };

    // Burying a body: it leaves the ledger and its sprite leaves the map at
    // once, so the ground is clear without waiting for a spriteset rebuild.
    BSE.Functions.removeMapCorpse = function(corpse) {
        if (!corpse) return false;
        const list = BSE.State.mapCorpses;
        const at = list ? list.indexOf(corpse) : -1;
        if (at >= 0) list.splice(at, 1);
        const scene = SceneManager._scene;
        const spriteset = scene && scene._spriteset;
        const sprites = spriteset && spriteset._corpseSprites;
        if (sprites) {
            for (let i = sprites.length - 1; i >= 0; i--) {
                const sprite = sprites[i];
                if (!sprite || sprite._data !== corpse) continue;
                if (sprite.parent) sprite.parent.removeChild(sprite);
                if (sprite.destroy) sprite.destroy();
                sprites.splice(i, 1);
            }
        }
        return at >= 0;
    };

    // ========================================================================
    // 9. Rewards popup, shared standardized toast (ParchmentToast.js)
    // ========================================================================

    // ========================================================================
    // 10. Scene_Map - Start (spawning, gravestone, post-battle)
    // ========================================================================

    // Restore HP/MP, body parts, hunger and sleep for the whole party on a
    // permadeath/story mode respawn so the player does not wake up already dying
    // (issue #155). Mirrors the roguelite (non-permadeath) respawn branch.
    Scene_Map.prototype._refillPartyOnRespawn = function() {
        const leader = $gameParty.members()[0];
        if (leader) leader.recoverAll();
        for (const member of $gameParty.members()) {
            if (member.recoverAll) member.recoverAll();
            if (window.HealthCore && window.HealthCore.restoreAllBodyParts) {
                window.HealthCore.restoreAllBodyParts(member);
            }
            const maxHunger = (window.TimeDateSystem && window.TimeDateSystem.maxHunger) || 100;
            const maxSleep = (window.TimeDateSystem && window.TimeDateSystem.maxSleep) || 100;
            if (member._hunger !== undefined) member._hunger = maxHunger;
            if (member._sleep !== undefined) member._sleep = maxSleep;
        }
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        const currMap = $gameMap.mapId();

        if (!$gameSystem.isBattleEnded() && currMap !== _lastSpawnedMapId) {
            _clearMapCorpses();
            // Write through the real getter/setter ($gameSystem._battleCooldownTimer);
            // the module-scoped _battleCooldownTimer is never read.
            $gameSystem.setBattleCooldown(BATTLE_COOLDOWN_FRAMES);
            this.spawnEnemiesFromEncounters();
            _lastSpawnedMapId = currMap;
            _lastProcRegionKey = currMap === PROC_MAP_ID ? _procRegionKey() : null;
        } else if (!$gameSystem.isBattleEnded() && currMap === PROC_MAP_ID) {
            // Edge transitions between procedural regions keep map ID 636, so the
            // check above never fires and corpses from the previous region would
            // linger. The performTransfer hook already cleared them; this is the
            // backstop for a region swapped without a transfer, and it re-baselines
            // the key. Enemy respawning here is handled separately by
            // WorldMapReturn's refreshEnemiesForBiome().
            const regionKey = _procRegionKey();
            if (regionKey !== _lastProcRegionKey) {
                _clearMapCorpses();
                _lastProcRegionKey = regionKey;
            }
        }

        _Scene_Map_start.call(this);

        // Gravestone logic
        const deathData = $gameSystem.getDeathData();
        const gravestoneEvent = $gameMap.events().find(event => event.event().name === "Gravestone");
        if (gravestoneEvent) {
            if (deathData && deathData.mapId === $gameMap.mapId() && $gameSwitches.value(9)) {
                gravestoneEvent.locate(deathData.x, deathData.y);
                gravestoneEvent.setOpacity(255);
            } else {
                gravestoneEvent.locate(0, 0);
                gravestoneEvent.setOpacity(0);
                gravestoneEvent.setThrough(true);
            }
        }

        // Post-battle logic
        if ($gameSystem.isBattleEnded()) {
            let hasRespawned = false;
            $gameSystem.setBattleCooldown(120);

            const _storyModeRespawnMaps = [1414, 1415, 1416, 1417];
            const _inStoryModeRespawn = $gameSwitches.value(75) && _storyModeRespawnMaps.includes($gameMap.mapId());

            if (_inStoryModeRespawn && $gameSystem.isFullPartyWipe()) {
                this._refillPartyOnRespawn();
                this.handleActor1Respawn();
                hasRespawned = true;
            } else if ($gameSwitches.value(9)) {
                if ($gameSystem.isFullPartyWipe()) {
                    // Permadeath respawn: refill HP/MP, body parts, hunger and
                    // sleep so the player does not respawn already dying (#155).
                    this._refillPartyOnRespawn();
                    this.handleActor1Respawn();
                    hasRespawned = true;
                } else {
                    // Hardcore / Blood and Oil: any ally still dead at the end
                    // of the battle (not resurrected) is permanently removed.
                    // Capture the fallen members by reference BEFORE removing
                    // any of them, otherwise the shifting party indices would
                    // let a second dead ally slip through and survive. Filter
                    // every party member generically (not just indices 0-2) so
                    // a dead 4th member is removed too.
                    const fallen = $gameParty.members().filter(m => m && m.isDead());
                    for (const member of fallen) {
                        this.handlePartyMemberDeath(member, member.name());
                    }
                }
            } else if ($gameSystem.isFullPartyWipe()) {
                // Roguelite / Peaceful, and only on a WIPE: the leader going
                // down while the other two fought on and won is not a defeat,
                // so nobody is respawned for it and the party keeps the ground
                // it took. Restore the WHOLE party to full (HP/MP via
                // recoverAll, which also clears death), not just the leader
                // (#59), and every need meter with it.
                for (const member of $gameParty.members()) {
                    member.recoverAll();
                    if (window.HealthCore && window.HealthCore.restoreAllBodyParts) {
                        window.HealthCore.restoreAllBodyParts(member);
                    }
                }
                BSE.Helpers.refillPartyNeeds();
                this.handleActor1Respawn();
                hasRespawned = true;
            }

            // Handle event deletion/locking. Both queues can hold the monster
            // that started the fight and every one that joined it, so drain
            // every entry that belongs to the map the party came back to and
            // leave the rest for the map they were left on.
            const mapNow = $gameMap.mapId();
            const keptDeletes = $gameSystem.getEventsToDelete().filter(entry => {
                if (entry.mapId !== mapNow) return true;
                if ($gameMap.event(entry.eventId)) $gameMap.eraseEvent(entry.eventId);
                return false;
            });
            $gameSystem.clearEventsToDelete();
            keptDeletes.forEach(e => $gameSystem.setEventToDelete(e.mapId, e.eventId));

            $gameSystem.getEventsToLock().forEach(entry => {
                const event = $gameMap.event(entry.eventId);
                if (event) event.lockMovement(160);
            });
            $gameSystem.clearEventsToLock();

            // A tactical map battle (MapBattleMode.js) was fought where everyone
            // stands: putting the party back on its pre-battle tiles would slide
            // it away from the monsters it just fled, and read as the monsters
            // teleporting. Everyone keeps the ground they hold.
            const mapFight = !!(window.MapBattleMode && window.MapBattleMode.isReentering &&
                window.MapBattleMode.isReentering());
            if (!hasRespawned) {
                if (!mapFight && $gameSystem._p1PreBattlePos && $gameSystem._p1PreBattlePos.mapId === $gameMap.mapId()) {
                    $gamePlayer.locate($gameSystem._p1PreBattlePos.x, $gameSystem._p1PreBattlePos.y);
                    $gamePlayer.setDirection($gameSystem._p1PreBattlePos.d);
                }
                if (!mapFight && $gameSystem._p2PreBattlePos && $gameSystem._p2PreBattlePos.mapId === $gameMap.mapId()) {
                    const p2Name = (window.$gameSplitScreen && window.$gameSplitScreen.p2EventName) || "Player 2";
                    const p2 = $gameMap.events().find(ev => ev && ev.event().name === p2Name);
                    if (p2) {
                        p2.locate($gameSystem._p2PreBattlePos.x, $gameSystem._p2PreBattlePos.y);
                        p2.setDirection($gameSystem._p2PreBattlePos.d);
                    }
                }
                this.createRewardsPopup();
            }

            $gameSystem.setBattleEnded(false);
            $gameSystem.setFullPartyWipe(false);
            $gameSystem.setActor1Died(false);
            $gameSystem.setActor2Died(false, "");
            $gameSystem.setActor3Died(false, "");
        } else {
            $gamePlayer.setThrough(false);
        }
    };

    // ========================================================================
    // 11. Scene_Map - Rewards Popup & Updates
    // ========================================================================

    // Battle spoils go through the shared reward popup (ParchmentToast.reward),
    // the same one terrain harvesting, dismantling and loot chests use, so a
    // win reads exactly like every other "you got something" in the game.
    // Item drops were gained silently during the fight: they are listed here
    // under the headline with their inventory icons, duplicates stacked.
    Scene_Map.prototype.createRewardsPopup = function() {
        const r = BSE.State.battleRewards;
        const kp = r ? (r.knowledge || 0) : 0;
        const extra = (r && r.entries) ? r.entries : [];
        const lines = (r && r.lines) ? r.lines : [];
        const levelUps = (r && r.levelUps) ? r.levelUps : [];
        const hasSpoils = !!r && (r.exp > 0 || r.gold > 0 || r.items.length > 0 || kp > 0 ||
            extra.length > 0 || lines.length > 0);
        if (!r || (!hasSpoils && !levelUps.length)) return;

        if (window.ParchmentToast) {
            // Spoils first, the levels they bought after, staggered so they
            // animate in one at a time instead of landing as a block.
            const popups = [];
            if (hasSpoils) {
                popups.push(() => window.ParchmentToast.reward({
                    title: r.title || null,
                    exp: r.exp || 0,
                    gold: r.gold || 0,
                    knowledge: kp,
                    lines: lines,
                    entries: (r.items || []).filter(Boolean).map(item => ({ obj: item, qty: 1 })).concat(extra)
                }));
            }
            levelUps.forEach(up => {
                popups.push(() => window.ParchmentToast.levelUp(up.name, up.level, up.skills));
            });
            window.ParchmentToast.group(popups);
        }

        r.exp = 0; r.gold = 0; r.items = []; r.knowledge = 0;
        r.title = null; r.lines = []; r.entries = []; r.levelUps = [];
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        $gameSystem.updateBattleCooldown();
    };

    // ========================================================================
    // 12. Game_Actor - onBattleEnd
    // ========================================================================

    // A level gained in a fight is not read out in a message box over the
    // battle background - with a full party that is a paragraph of "level rose
    // to" the player has to click through before the map comes back. The lines
    // are held here and shown on the map as toasts, right after the spoils.
    // Levels gained anywhere else (quests, tech tree, training) keep the
    // engine's message box, since nothing is queued to flush them.
    const _Game_Actor_displayLevelUp = Game_Actor.prototype.displayLevelUp;
    Game_Actor.prototype.displayLevelUp = function(newSkills) {
        if (!$gameParty.inBattle()) {
            _Game_Actor_displayLevelUp.call(this, newSkills);
            return;
        }
        const r = BSE.State.battleRewards;
        if (!r.levelUps) r.levelUps = [];
        r.levelUps.push({
            name: this.name(),
            level: this.level,
            skills: (newSkills || []).filter(Boolean)
        });
    };

    const _Game_Actor_onBattleEnd = Game_Actor.prototype.onBattleEnd;
    Game_Actor.prototype.onBattleEnd = function() {
        _Game_Actor_onBattleEnd.call(this);
        if (this === $gameParty.members()[0] && $gameSystem.isActor1Died() && $gameSystem.isFullPartyWipe()) {
            this.recoverAll();
        }
    };

})();