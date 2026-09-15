/*:
* @target MZ
* @plugindesc Arena Battle Handler (logic) - Gauntlet & Biome trial engine, streak rewards, random/rescaled parties. UI lives in ArenaBattleHandlerUI.js.
* @author OmniLex
*
* @param ArenaWinsVariable
* @text Arena Wins Variable
* @type variable
* @desc Variable ID to store the player's number of arena wins.
* @default 1
*
* @param GauntletWinsVariable
* @text Gauntlet Wins Variable
* @type variable
* @desc Variable ID to store the player's number of gauntlet wins.
* @default 2
*
* @param GauntletBracketVariable
* @text Gauntlet Bracket Variable
* @type variable
* @desc Variable ID to store the player's current gauntlet bracket.
* @default 3
*
* @command StartArenaBattle
* @text Start Arena Battle
* @desc Starts an arena battle with scaling difficulty.
*
* @command ShowEnemyTroopList
* @text Show Enemy Troop List
* @desc Opens the gauntlet bracket picker (single-battle chooser retired).
*
* @command StartGauntletMode
* @text Start Gauntlet Mode
* @desc Opens a window to select a level bracket and starts consecutive battles.
*
* @help
* ArenaBattleHandler.js  (LOGIC LAYER)
* ---------------------------------------------------------------------------
* This plugin owns the arena engine only: the gauntlet / biome-trial / boss
* rush state machine, streak rewards, random & rescaled parties, and all
* BattleManager hooks. Every on-screen menu lives in ArenaBattleHandlerUI.js,
* which MUST be listed immediately AFTER this plugin in the Plugin Manager.
*
* Title-launched flow (driven by the UI plugin):
*   Scene_ArenaPartySelect  -> pick party (random roster or a save slot)
*   Scene_ArenaModeSelect    -> pick Gauntlet, Biome Trial or Boss Rush
*   Scene_GauntletSelect / Scene_BiomeTrialSelect -> configure & launch
* Every party is rescaled to the chosen bracket / biome level before fighting.
*
* Boss Rush fights every solo troop whose enemy note carries <Boss>, in
* ascending level order, setting the party to each boss's own authored level
* (re-equipping on every bracket jump) instead of climbing one level per win.
*/

(() => {
    "use strict";

    const pluginName = "ArenaBattleHandler";

    const parameters = PluginManager.parameters(pluginName);
    const arenaWinsVarId = Number(parameters['ArenaWinsVariable'] || 1);
    const gauntletWinsVarId = Number(parameters['GauntletWinsVariable'] || 2);
    const gauntletBracketVarId = Number(parameters['GauntletBracketVariable'] || 3);

    // Single source of truth for the level brackets (was duplicated ~6 times).
    const BRACKETS = [
        { min: 1, max: 10 }, { min: 11, max: 20 }, { min: 21, max: 30 },
        { min: 31, max: 40 }, { min: 41, max: 50 }, { min: 51, max: 60 },
        { min: 61, max: 70 }, { min: 71, max: 80 }, { min: 81, max: 90 },
        { min: 91, max: 100 }, { min: 101, max: 200 }, { min: 201, max: 300 },
        { min: 301, max: 400 }, { min: 401, max: 500 }, { min: 501, max: 9999 }
    ];

    //=========================================================================
    // Plugin commands
    //=========================================================================
    PluginManager.registerCommand(pluginName, "StartArenaBattle", () => {
        ArenaBattleHandler.startArenaBattle();
    });

    // The single-battle chooser is retired: the arena is tournament-only. Legacy
    // callers now open the gauntlet bracket picker instead.
    PluginManager.registerCommand(pluginName, "ShowEnemyTroopList", () => {
        if (window.Scene_GauntletSelect) SceneManager.push(window.Scene_GauntletSelect);
    });

    PluginManager.registerCommand(pluginName, "StartGauntletMode", () => {
        if (window.Scene_GauntletSelect) SceneManager.push(window.Scene_GauntletSelect);
    });

    //=========================================================================
    // ArenaBattleHandler core
    //=========================================================================
    // Between bouts a fighter is put back on their feet whole: health, magic
    // and AP alike. AP is not part of the engine's own recoverAll, so a bout
    // used to open with whatever the last one had left, and a member who had
    // spent theirs walked in unable to act.
    function _restorePartyForBout() {
        $gameParty.members().forEach(actor => {
            actor.setHp(actor.mhp);
            actor.setMp(actor.mmp);
            if (actor.maxTp) actor.setTp(actor.maxTp());
            actor.clearStates();
        });
    }

    const ArenaBattleHandler = {
        // Exposed so the UI plugin can build bracket lists without duplicating data.
        BRACKETS,

        startArenaBattle(troopId) {
            let troop;
            if (troopId) {
                troop = $dataTroops[troopId];
            } else {
                const wins = $gameVariables.value(arenaWinsVarId);
                const streak = this.getArenaStreak();
                troop = streak >= this.GROUP_STREAK_THRESHOLD
                    ? this.selectGroupTroop(wins)
                    : this.selectTroop(wins);
            }
            if (troop) {
                // A bout opens with the party whole. Health and magic are put
                // back by the arena itself; AP is not part of the engine's
                // recoverAll, so it is restored here rather than left as the
                // one resource a fighter carries a fight's worth of loss into.
                $gameParty.members().forEach(actor => {
                    if (actor.maxTp) actor.setTp(actor.maxTp());
                });
                this._ensureBattleMapReady();
                BattleManager.setup(troop.id, true, false);
                BattleManager.setBattleTest(false);
                BattleManager.setGauntletMode(false);
                BattleManager.setArenaMode(true);
                SceneManager.push(Scene_Battle);
            } else {
                console.error("No suitable troop found for arena battle.");
            }
        },

        selectTroop(wins) {
            const troops = $dataTroops.filter(t => t && t.members.length > 0 && !t._arenaGroupScratch);
            const troopStats = troops.map(troop => {
                const totalStats = troop.members.reduce((sum, member) => {
                    const enemy = $dataEnemies[member.enemyId];
                    if (!enemy) return sum;
                    return sum + this.calculateEnemyStatScore(enemy);
                }, 0);
                return { troop, totalStats };
            });
            troopStats.sort((a, b) => a.totalStats - b.totalStats);

            const difficultyRange = 3;
            const targetIndex = Math.min(troopStats.length - 1, Math.floor(wins / 2));
            const start = Math.max(0, targetIndex - difficultyRange);
            const end = Math.min(troopStats.length - 1, targetIndex + difficultyRange);
            const availableChoices = troopStats.slice(start, end + 1);
            const choice = availableChoices[Math.floor(Math.random() * availableChoices.length)];
            if (!choice) return null;
            return choice.troop;
        },

        calculateEnemyStatScore(enemy) {
            const params = enemy.params;
            return params[2] + params[3] + params[4] + params[5] + params[6];
        },

        // Parse enemy level and description from the note field.
        parseEnemyNotes(enemy) {
            if (!enemy || !enemy.note) {
                return { level: "?", description: T('Arena.noDescription') };
            }
            const noteText = enemy.note;
            const lvMatch = noteText.match(/<Level:\s*(\d+)>/i) || noteText.match(/LV:\s*(\d+)/i);
            const level = lvMatch ? lvMatch[1] : "?";

            let description = "";
            if (lvMatch) {
                const startPos = noteText.indexOf('|', lvMatch.index);
                if (startPos !== -1) {
                    const charTagMatch = noteText.substring(startPos + 1).match(/<Char:/i);
                    const endPos = charTagMatch ? startPos + 1 + charTagMatch.index : noteText.length;
                    description = noteText.substring(startPos + 1, endPos).trim();
                }
            } else {
                const charTagMatch = noteText.match(/<Char:/i);
                description = charTagMatch ? noteText.substring(0, charTagMatch.index).trim() : noteText.trim();
            }
            description = window.translateText ? window.translateText(description) : description;
            return { level, description };
        },

        getEnemySkills(enemy) {
            if (!enemy || !enemy.actions) return [];
            const skillIds = [];
            enemy.actions.forEach(action => {
                if (action.skillId && !skillIds.includes(action.skillId)) {
                    skillIds.push(action.skillId);
                }
            });
            return skillIds.map(id => $dataSkills[id]).filter(skill => skill);
        },

        // Single-enemy troops whose enemy level sits inside [minLevel, maxLevel].
        getTroopsInLevelBracket(minLevel, maxLevel) {
            const result = [];
            for (let i = 1; i < $dataTroops.length; i++) {
                const troop = $dataTroops[i];
                if (troop && troop.members.length === 1) {
                    const enemy = $dataEnemies[troop.members[0].enemyId];
                    if (enemy) {
                        const enemyLevel = Number(this.parseEnemyNotes(enemy).level) || 0;
                        if (enemyLevel >= minLevel && enemyLevel <= maxLevel) result.push(troop);
                    }
                }
            }
            return result;
        },

        countTroopsInBracket(bracket) {
            return this.getTroopsInLevelBracket(bracket.min, bracket.max).length;
        },

        // Human-readable bracket label (e.g. "Bracket 1-10", "Bracket 500+").
        getBracketLabel(bracket) {
            const prefix = T('Arena.bracket');
            const range = bracket.max === 9999 ? '500+' : `${bracket.min}-${bracket.max}`;
            return prefix + range;
        },

        //---------------------------------------------------------------------
        // Crash fix: a title-launched arena (random roster OR a loaded save whose
        // map data was never streamed in) can reach BattleManager.setup while
        // $dataMap is null. terrainTag()/regionId() in the setup chain then throw
        // "Cannot read property 'width' of null". Install a tiny valid map stub so
        // every map read in the setup chain resolves safely (out-of-range tiles
        // simply return 0). Only runs when no real map is loaded, so ordinary
        // world battles are untouched.
        _ensureBattleMapReady() {
            if (!$dataMap || typeof $dataMap.width !== 'number') {
                $dataMap = {
                    width: 17, height: 13,
                    data: new Array(17 * 13 * 6).fill(0),
                    events: [null], tilesetId: 1, scrollType: 0,
                    autoplayBgm: false, autoplayBgs: false, disableDashing: false,
                    parallaxName: '', note: ''
                };
            }
        },

        //=====================================================================
        // Gauntlet engine
        //=====================================================================

        startGauntletBattle() {
            // Fully restore party before each bout.
            _restorePartyForBout();

            const currentBracket = $gameVariables.value(gauntletBracketVarId);
            const bracket = BRACKETS[currentBracket - 1] || BRACKETS[0];
            const troops = this.getTroopsInLevelBracket(bracket.min, bracket.max);

            if (troops.length > 0) {
                const randomTroop = troops[Math.floor(Math.random() * troops.length)];
                this._ensureBattleMapReady();
                BattleManager.setup(randomTroop.id, true, false);
                BattleManager.setBattleTest(false);
                BattleManager.setArenaMode(false);
                BattleManager.setGauntletMode(true);
                SceneManager.push(Scene_Battle);
            } else {
                window.skipLocalization = true;
                $gameMessage.add(T('Arena.msg.noEnemiesInBracket'));
                window.skipLocalization = false;
                this.endGauntlet();
            }
        },

        processGauntletVictory() {
            const levelName = T('Arena.level');

            const gauntletWins = $gameVariables.value(gauntletWinsVarId) || 0;
            const newWins = gauntletWins + 1;
            $gameVariables.setValue(gauntletWinsVarId, newWins);

            // Ascending streak loot on top of the battle's base reward.
            const streakReward = this.grantStreakRewards(newWins);
            const fun = this.payVictoryFun(newWins);
            this.showStreakToast(newWins, streakReward, fun);

            // Advance a bracket every 7 wins.
            if (newWins % 7 === 0) {
                const currentBracket = $gameVariables.value(gauntletBracketVarId);
                if (currentBracket < BRACKETS.length) {
                    $gameVariables.setValue(gauntletBracketVarId, currentBracket + 1);
                    const nextBracket = BRACKETS[currentBracket];
                    window.skipLocalization = true;
                    $gameMessage.add(T('Arena.congratulationsYouVeAdvancedTo'));
                    $gameMessage.add(`${levelName} ${nextBracket.min}-${nextBracket.max === 9999 ? "+" : nextBracket.max}`);
                    window.skipLocalization = false;
                }
            }

            // Advance to the next bout immediately without waiting
            if (this._nextBoutTimer) {
                clearTimeout(this._nextBoutTimer);
                this._nextBoutTimer = null;
            }
            if (!_arenaFromTitle) {
                this.startGauntletBattle();
            }
        }
    };

    // Expose globally so external callers (HypernetOS Colosseum, 2P split-screen,
    // the UI plugin) can reach the engine.
    window.ArenaBattleHandler = ArenaBattleHandler;

    //=========================================================================
    // Title-launched arena session state
    //=========================================================================
    let _arenaFromTitle = false;      // true while a title-launched arena runs
    let _titlePartySource = null;     // 'random' | 'save' | null (in-game)
    let _arenaStageStarter = null;    // fn Scene_ArenaStage runs to kick the first bout

    // Called by the UI when a party has been chosen from the title screen.
    ArenaBattleHandler.beginTitleFlow = function (source) {
        _arenaFromTitle = true;
        _titlePartySource = source; // 'random' | 'save'
    };
    ArenaBattleHandler.cancelTitleFlow = function () {
        _arenaFromTitle = false;
        _titlePartySource = null;
        _arenaStageStarter = null;
    };
    ArenaBattleHandler.isTitleFlow = function () { return _arenaFromTitle; };
    ArenaBattleHandler.titlePartySource = function () { return _titlePartySource; };
    ArenaBattleHandler.isArenaFromTitle = function () { return _arenaFromTitle; };

    // Scene_ArenaStage consumes this to kick the first bout of a title session.
    ArenaBattleHandler.consumeArenaStageStarter = function () {
        const starter = _arenaStageStarter;
        _arenaStageStarter = null;
        return starter;
    };

    // Called by Scene_ArenaStage's watchdog when the player has been left
    // stranded on the "next bout" screen: the mode flags survive between bouts
    // (cleared only on completion/defeat), so whichever run is still active is
    // resumed directly. Skipped if a handoff is already pending so it can never
    // race the ordinary setTimeout-driven continuation.
    ArenaBattleHandler.resumeStrandedSession = function () {
        if (!_arenaFromTitle) return;
        if (BattleManager.isGauntletMode()) {
            this.startGauntletBattle();
        } else if (BattleManager.isBiomeTrialMode()) {
            this.startBiomeTrialBattle();
        } else if (BattleManager.isBossRushMode()) {
            this.startBossRushBattle();
        }
    };

    // Legacy entry kept for compatibility (older callers). Chooses party source
    // then hands straight to the gauntlet picker.
    ArenaBattleHandler.beginTitleArena = function (forceRandom) {
        this.beginTitleFlow(forceRandom ? 'random' : 'save');
        if (window.Scene_GauntletSelect) SceneManager.goto(window.Scene_GauntletSelect);
    };

    //=====================================================================
    // Gauntlet / biome launch entry points (called by the UI plugin)
    //=====================================================================

    // Launch a gauntlet at the given 1-based bracket index. Every party (random,
    // loaded save, or the in-game party) is rescaled to the bracket level.
    ArenaBattleHandler.launchGauntlet = function (bracketIndex) {
        const bracket = BRACKETS[bracketIndex - 1] || BRACKETS[0];
        $gameVariables.setValue(gauntletBracketVarId, bracketIndex);
        $gameVariables.setValue(gauntletWinsVarId, 0);

        // Only a title-launched RANDOM source swaps in a fresh roster. A saved
        // title party, the live in-game party, and 2P split-screen parties are all
        // rescaled in place. Gating on _arenaFromTitle keeps a stale party source
        // (e.g. left over from a prior startRandomGauntlet) from leaking in.
        if (_arenaFromTitle && _titlePartySource === 'random') {
            this.buildRandomParty(bracket.min, bracket.max);
        } else {
            this.rescaleCurrentParty(bracket.min, bracket.max);
        }

        if (_arenaFromTitle) {
            this._ensureBattleMapReady();
            _arenaStageStarter = () => ArenaBattleHandler.startGauntletBattle();
            SceneManager.goto(window.Scene_ArenaStage);
        } else {
            this.startGauntletBattle();
        }
    };

    // Launch a biome trial. A random source spins a fresh level-1 roster; a saved
    // source climbs with the chosen party (rescaled per fight).
    ArenaBattleHandler.launchBiomeTrial = function (biome) {
        if (_arenaFromTitle && _titlePartySource === 'save') {
            return this.startBiomeTrialWithParty(biome, _arenaFromTitle);
        }
        return this.startBiomeTrial(biome, _arenaFromTitle);
    };

    ArenaBattleHandler.endGauntlet = function () {
        if (_randomPartyMode) this.restoreParty();
        $gameVariables.setValue(gauntletWinsVarId, 0);

        if (_arenaFromTitle) {
            this.cancelTitleFlow();
            SceneManager._stack = [];
            if (!SceneManager.isSceneChanging()) SceneManager.goto(Scene_Title);
            return;
        }

        window.skipLocalization = true;
        $gameMessage.add(T('Arena.gauntletHasEnded'));
        window.skipLocalization = false;

        if (SceneManager._scene && !(SceneManager._scene instanceof Scene_Map) && !SceneManager.isSceneChanging()) {
            SceneManager.goto(Scene_Map);
        }
    };

    //=========================================================================
    // BattleManager mode flags
    //=========================================================================
    let _gauntletMode = false;
    BattleManager.setGauntletMode = function (enabled) { _gauntletMode = enabled; };
    BattleManager.isGauntletMode = function () { return _gauntletMode; };

    let _arenaMode = false;
    BattleManager.setArenaMode = function (enabled) { _arenaMode = enabled; };
    BattleManager.isArenaMode = function () { return _arenaMode; };

    let _biomeTrialMode = false;
    BattleManager.setBiomeTrialMode = function (v) { _biomeTrialMode = v; };
    BattleManager.isBiomeTrialMode = function () { return _biomeTrialMode; };

    let _bossRushMode = false;
    BattleManager.setBossRushMode = function (v) { _bossRushMode = v; };
    BattleManager.isBossRushMode = function () { return _bossRushMode; };

    //=========================================================================
    // Ascending streak rewards (money + items)
    //=========================================================================
    ArenaBattleHandler.STREAK_GOLD_BASE = 35;

    ArenaBattleHandler.getArenaStreak = function () {
        return ($gameSystem && $gameSystem._arenaWinStreak) || 0;
    };
    ArenaBattleHandler.setArenaStreak = function (value) {
        if ($gameSystem) $gameSystem._arenaWinStreak = value;
    };

    //=========================================================================
    // Arena group battles: once the win streak reaches GROUP_STREAK_THRESHOLD,
    // a battle pits the party against several bracket-mates at once instead of
    // a single authored troop. Group size is read live off the current streak
    // (2 enemies for the next 10 battles, then capped at 3), so a lost run
    // (streak reset to 0) drops straight back to single-enemy fights.
    //=========================================================================
    ArenaBattleHandler.GROUP_STREAK_THRESHOLD = 10;
    ArenaBattleHandler.GROUP_SIZE_STEP = 10;
    ArenaBattleHandler.GROUP_MIN_SIZE = 2;
    ArenaBattleHandler.GROUP_MAX_SIZE = 3;

    ArenaBattleHandler.groupSizeForStreak = function (streak) {
        const tier = Math.floor((streak - this.GROUP_STREAK_THRESHOLD) / this.GROUP_SIZE_STEP);
        return Math.min(this.GROUP_MAX_SIZE, this.GROUP_MIN_SIZE + Math.max(0, tier));
    };

    function bracketForLevel(level) {
        for (const b of BRACKETS) {
            if (level >= b.min && level <= b.max) return b;
        }
        return level < BRACKETS[0].min ? BRACKETS[0] : BRACKETS[BRACKETS.length - 1];
    }

    // One scratch $dataTroops slot, reused for every arena group battle (the
    // same trick BattleSystemEnhanced uses for reinforced troops / petrodemons).
    let _arenaGroupTroopId = null;
    function ensureArenaGroupTroopSlot() {
        if (_arenaGroupTroopId && $dataTroops[_arenaGroupTroopId]) return _arenaGroupTroopId;
        _arenaGroupTroopId = $dataTroops.length;
        $dataTroops[_arenaGroupTroopId] = {
            id: _arenaGroupTroopId, name: "ArenaGroup", members: [], pages: [],
            _arenaGroupScratch: true
        };
        return _arenaGroupTroopId;
    }

    // Builds a scratch troop of several enemies pulled from the same level
    // bracket the ordinary single-enemy pick (selectTroop) would have used.
    ArenaBattleHandler.selectGroupTroop = function (wins) {
        const baseTroop = this.selectTroop(wins);
        if (!baseTroop) return null;
        const baseMember = baseTroop.members[0];
        const baseEnemy = baseMember ? $dataEnemies[baseMember.enemyId] : null;
        const baseLevel = baseEnemy ? (Number(this.parseEnemyNotes(baseEnemy).level) || 1) : 1;
        const bracket = bracketForLevel(baseLevel);

        const candidates = this.getTroopsInLevelBracket(bracket.min, bracket.max);
        if (candidates.length === 0) return baseTroop;

        const size = this.groupSizeForStreak(this.getArenaStreak());
        const members = [];
        for (let i = 0; i < size; i++) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            members.push({
                enemyId: pick.members[0].enemyId,
                x: 400 + (i % 4) * 150,
                y: 250 + Math.floor(i / 4) * 120,
                hidden: false
            });
        }

        const troopId = ensureArenaGroupTroopSlot();
        const troop = $dataTroops[troopId];
        troop.members = members;
        troop.pages = baseTroop.pages || [];
        return troop;
    };

    ArenaBattleHandler._buildStreakItemPool = function () {
        if (this._streakItemPool) return this._streakItemPool;
        const pool = [];
        for (let i = 1; i < $dataItems.length; i++) {
            const item = $dataItems[i];
            if (!item || !item.name || item.name.trim() === '') continue;
            if (item.itypeId !== 1) continue;
            if (!(item.price > 0)) continue;
            pool.push(item);
        }
        pool.sort((a, b) => a.price - b.price);
        this._streakItemPool = pool;
        return pool;
    };

    ArenaBattleHandler.grantStreakRewards = function (streak) {
        if (!streak || streak <= 0) return null;

        const gold = Math.floor(this.STREAK_GOLD_BASE * streak * (1 + streak * 0.12));
        $gameParty.gainGold(gold);

        let entries = [];
        const pool = this._buildStreakItemPool();
        if (pool.length > 0) {
            const tier = Math.min(1, streak / 21);
            const center = Math.floor(tier * (pool.length - 1));
            const span = Math.max(1, Math.floor(pool.length * 0.08));
            const lo = Math.max(0, center - span);
            const hi = Math.min(pool.length - 1, center + span);
            const item = pool[lo + Math.floor(Math.random() * (hi - lo + 1))];
            const qty = 1 + Math.floor(streak / 4);
            $gameParty.gainItem(item, qty);
            entries = [{ obj: item, qty }];
        }
        return { gold, entries };
    };

    //=========================================================================
    // Fun paid for a bout won
    //=========================================================================
    // A crowd, a win, and everyone still standing: the arena is entertainment
    // as much as it is a fight, so a victory feeds the whole party's Fun meter,
    // not just the actor who landed the last hit. A run that keeps going is
    // worth more than a single bout, up to a ceiling - by then the party has
    // had its evening out.
    ArenaBattleHandler.WIN_FUN_BASE = 40;
    ArenaBattleHandler.WIN_FUN_PER_STREAK = 8;
    ArenaBattleHandler.WIN_FUN_MAX = 120;

    // Returns the Fun actually paid, which showStreakToast announces alongside
    // the spoils, or 0 when the needs system is not loaded.
    ArenaBattleHandler.payVictoryFun = function (streak) {
        const needs = window.PartyNeeds;
        if (!needs || typeof needs.addLeisureToAll !== 'function') return 0;
        const extra = Math.max(0, (streak || 1) - 1) * this.WIN_FUN_PER_STREAK;
        const delta = Math.min(this.WIN_FUN_MAX, this.WIN_FUN_BASE + extra);
        needs.addLeisureToAll(delta);
        return delta;
    };

    // Streak spoils are a reward like any other, so they use the shared reward
    // popup: the streak is the heading, the gold and the drop are its body. The
    // Fun the win paid is a second, grouped popup so neither overwrites the
    // other.
    ArenaBattleHandler.showStreakToast = function (streak, reward, fun) {
        if (!window.ParchmentToast) return;
        try {
            const toasts = [];
            if (reward) {
                const streakLabel = T('Arena.streak');
                toasts.push(() => window.ParchmentToast.reward({
                    title: `${streakLabel} x${streak}`,
                    gold: reward.gold,
                    entries: reward.entries,
                    duration: 150
                }));
            }
            if (fun) {
                toasts.push(() => window.ParchmentToast.need('leisure', fun)); // i18n-ignore: need id
            }
            window.ParchmentToast.group(toasts);
        } catch (e) { /* toast is best-effort */ }
    };

    //=========================================================================
    // BattleManager result overrides (gauntlet / biome / arena aware)
    //=========================================================================
    const _BattleManager_processVictory = BattleManager.processVictory;
    BattleManager.processVictory = function () {
        if (this.isBiomeTrialMode()) {
            this.playVictoryMe();
            this.replayBgmAndBgs();
            this.makeRewards();
            this.gainRewards();
            this.endBattle(0);
            ArenaBattleHandler.processBiomeTrialVictory();
            return;
        }
        if (this.isBossRushMode()) {
            this.playVictoryMe();
            this.replayBgmAndBgs();
            this.makeRewards();
            this.gainRewards();
            this.endBattle(0);
            ArenaBattleHandler.processBossRushVictory();
            return;
        }
        if (this.isGauntletMode()) {
            this.playVictoryMe();
            this.replayBgmAndBgs();
            this.makeRewards();
            this.gainRewards();
            this.endBattle(0);
            ArenaBattleHandler.processGauntletVictory();
        } else {
            const result = _BattleManager_processVictory.call(this);
            if (this.isArenaMode()) {
                // Only count actual arena victories, not ordinary encounters.
                const wins = $gameVariables.value(arenaWinsVarId);
                $gameVariables.setValue(arenaWinsVarId, wins + 1);
                const streak = ArenaBattleHandler.getArenaStreak() + 1;
                ArenaBattleHandler.setArenaStreak(streak);
                const reward = ArenaBattleHandler.grantStreakRewards(streak);
                const fun = ArenaBattleHandler.payVictoryFun(streak);
                ArenaBattleHandler.showStreakToast(streak, reward, fun);
                this.setArenaMode(false);
            }
            return result;
        }
    };

    const _BattleManager_processDefeat = BattleManager.processDefeat;
    BattleManager.processDefeat = function () {
        ArenaBattleHandler.setArenaStreak(0);
        if (this.isBiomeTrialMode()) {
            this.playDefeatMe();
            this.replayBgmAndBgs();
            this.endBattle(2);
            ArenaBattleHandler.endBiomeTrial();
            return;
        }
        if (this.isBossRushMode()) {
            this.playDefeatMe();
            this.replayBgmAndBgs();
            this.endBattle(2);
            ArenaBattleHandler.endBossRush();
            return;
        }
        if (this.isGauntletMode()) {
            this.playDefeatMe();
            this.replayBgmAndBgs();
            this.endBattle(2);
            _gauntletMode = false;
            ArenaBattleHandler.endGauntlet();
        } else {
            if (this.isArenaMode()) {
                this.setArenaMode(false);
            }
            return _BattleManager_processDefeat.call(this);
        }
    };

    const _BattleManager_processAbort = BattleManager.processAbort;
    BattleManager.processAbort = function () {
        ArenaBattleHandler.setArenaStreak(0);
        if (this.isBiomeTrialMode()) {
            this.replayBgmAndBgs();
            this.endBattle(1);
            ArenaBattleHandler.endBiomeTrial();
            return;
        }
        if (this.isBossRushMode()) {
            this.replayBgmAndBgs();
            this.endBattle(1);
            ArenaBattleHandler.endBossRush();
            return;
        }
        if (this.isGauntletMode()) {
            this.replayBgmAndBgs();
            this.endBattle(1);
            _gauntletMode = false;
            ArenaBattleHandler.endGauntlet();
        } else {
            if (this.isArenaMode()) {
                this.setArenaMode(false);
            }
            return _BattleManager_processAbort.call(this);
        }
    };

    // Preserve gauntlet mode across a winning endBattle; clear it on loss/abort.
    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function (result) {
        const wasGauntletMode = this.isGauntletMode();
        _BattleManager_endBattle.call(this, result);
        if (wasGauntletMode && result !== 0) _gauntletMode = false;
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function () {
        _Scene_Battle_terminate.call(this);
        if (!BattleManager.isGauntletMode() && _gauntletMode) _gauntletMode = false;
    };

    //=========================================================================
    // Party rescaling (random roster + in-place rescale)
    //=========================================================================
    let _randomPartyMode = false;
    let _savedPartyData = null;

    // Snapshot the current party's levels/equips so restoreParty() can undo any
    // rescale, then optionally swap in random actors.
    ArenaBattleHandler._snapshotParty = function (actorIds) {
        const actorSnapshots = {};
        actorIds.forEach(id => {
            const actor = $gameActors.actor(id);
            if (!actor) return;
            actorSnapshots[id] = {
                level: actor._level,
                exp: Object.assign({}, actor._exp),
                equips: actor._equips.map(e => ({ dc: e._dataClass, id: e._itemId }))
            };
        });
        return actorSnapshots;
    };

    // Swap the party to up to 3 fresh random actors, scaled to the bracket.
    ArenaBattleHandler.buildRandomParty = function (minLevel, maxLevel) {
        const targetLevel = Math.min(99, Math.max(1, Math.floor((minLevel + maxLevel) / 2)));

        const currentActorIds = [...$gameParty._actors];
        const usedIds = new Set(currentActorIds);
        const candidates = [];
        for (let i = 1; i < $dataActors.length; i++) {
            const a = $dataActors[i];
            if (a && a.name && a.name.trim() !== '' && !usedIds.has(i)) candidates.push(i);
        }
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        const chosen = candidates.slice(0, 3);
        if (chosen.length === 0) return;

        _savedPartyData = {
            actorIds: currentActorIds,
            actorSnapshots: this._snapshotParty(chosen),
            itemsGiven: []
        };
        _randomPartyMode = true;

        $gameParty._actors = [];
        chosen.forEach(actorId => {
            $gameParty._actors.push(actorId);
            const actor = $gameActors.actor(actorId);
            if (!actor) return;
            actor._equips.forEach(e => e.setObject(null));
            actor.changeLevel(targetLevel, false);
            actor.recoverAll();
            if (actor.maxTp) actor.setTp(actor.maxTp());
            this._equipActorForBracket(actor, minLevel, maxLevel);
        });
        $gamePlayer.refresh();

        this._giveStartingItems(minLevel, maxLevel, _savedPartyData.itemsGiven);
    };

    // Rescale the CURRENT party members (saved-slot party or the live in-game
    // party) to the bracket level in place, snapshotting first so the run can be
    // undone. Used for every non-random gauntlet.
    ArenaBattleHandler.rescaleCurrentParty = function (minLevel, maxLevel) {
        const targetLevel = Math.min(99, Math.max(1, Math.floor((minLevel + maxLevel) / 2)));
        const currentActorIds = [...$gameParty._actors];
        if (currentActorIds.length === 0) return;

        _savedPartyData = {
            actorIds: currentActorIds,
            actorSnapshots: this._snapshotParty(currentActorIds),
            itemsGiven: []
        };
        _randomPartyMode = true;

        $gameParty.members().forEach(actor => {
            actor.changeLevel(targetLevel, false);
            this._equipActorForBracket(actor, minLevel, maxLevel);
            actor.recoverAll();
            if (actor.maxTp) actor.setTp(actor.maxTp());
        });
        $gamePlayer.refresh();

        this._giveStartingItems(minLevel, maxLevel, _savedPartyData.itemsGiven);
    };

    ArenaBattleHandler._equipActorForBracket = function (actor, minLevel /*, maxLevel */) {
        const bracketMins = BRACKETS.map(b => b.min);
        const bracketIdx = Math.max(0, bracketMins.findIndex(m => m >= minLevel));
        const tier = bracketIdx / (bracketMins.length - 1);
        const scoreItem = item => (item && item.params) ? item.params.reduce((s, v) => s + v, 0) : 0;

        actor.equipSlots().forEach((etypeId, slotIdx) => {
            if (etypeId === 1) {
                // Everyone can equip everything now, so pick from the weapon
                // types this fighter is actually proficient with.
                const prof = window.WeaponProficiency;
                let compat = $dataWeapons.filter(w => w && w.id > 0 && (!prof || !prof.isUntrained(actor, w)));
                if (compat.length === 0) compat = $dataWeapons.filter(w => w && w.id > 0);
                if (compat.length > 0) {
                    compat.sort((a, b) => scoreItem(a) - scoreItem(b));
                    actor.forceChangeEquip(slotIdx, compat[Math.floor(tier * (compat.length - 1))]);
                }
            } else {
                const compat = $dataArmors.filter(a => a && a.id > 0 && a.etypeId === etypeId && actor.isEquipAtypeOk(a.atypeId));
                if (compat.length > 0) {
                    compat.sort((a, b) => scoreItem(a) - scoreItem(b));
                    actor.forceChangeEquip(slotIdx, compat[Math.floor(tier * (compat.length - 1))]);
                }
            }
        });
    };

    ArenaBattleHandler._giveStartingItems = function (minLevel, maxLevel, itemsGiven) {
        const bracketMins = BRACKETS.map(b => b.min);
        const bracketIdx = Math.max(0, bracketMins.findIndex(m => m >= minLevel));
        const tier = bracketIdx / (bracketMins.length - 1);

        const healEffect = Game_Action.EFFECT_RECOVER_HP;
        const usable = [];
        for (let i = 1; i < $dataItems.length; i++) {
            const item = $dataItems[i];
            if (!item) continue;
            if ((item.occasion === 0 || item.occasion === 1) && item.effects && item.effects.some(e => e.code === healEffect)) {
                const score = item.effects.filter(e => e.code === healEffect).reduce((s, e) => s + e.value1 * 100 + e.value2, 0);
                usable.push({ item, score });
            }
        }
        if (usable.length === 0) return;

        usable.sort((a, b) => a.score - b.score);
        const center = Math.floor(tier * (usable.length - 1));
        const range = Math.max(1, Math.floor(usable.length * 0.3));
        const pool = usable.slice(Math.max(0, center - Math.floor(range / 2)), center + Math.ceil(range / 2));
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const picks = Math.min(shuffled.length, 3 + Math.floor(Math.random() * 3));

        shuffled.slice(0, picks).forEach(({ item }) => {
            const qty = 2 + Math.floor(Math.random() * 3);
            $gameParty.gainItem(item, qty);
            itemsGiven.push({ item, count: qty });
        });
    };

    ArenaBattleHandler.restoreParty = function () {
        if (!_savedPartyData) return;

        _savedPartyData.itemsGiven.forEach(({ item, count }) => {
            if (item) $gameParty.loseItem(item, count, false);
        });

        Object.entries(_savedPartyData.actorSnapshots).forEach(([idStr, snap]) => {
            const actor = $gameActors.actor(Number(idStr));
            if (!actor) return;
            actor._level = snap.level;
            actor._exp = Object.assign({}, snap.exp);
            actor._equips.forEach((slot, i) => {
                const s = snap.equips[i];
                if (s && s.id > 0) slot.setEquip(s.dc === 'weapon', s.id);
                else slot.setObject(null);
            });
            actor.refresh();
        });

        $gameParty._actors = [..._savedPartyData.actorIds];
        $gamePlayer.refresh();

        _savedPartyData = null;
        _randomPartyMode = false;
    };

    // One-shot API for external callers (e.g. HypernetOS Colosseum app). Always
    // uses a random roster and starts immediately from the current (in-game) map.
    ArenaBattleHandler.startRandomGauntlet = function (bracketIdx) {
        const bracket = BRACKETS[bracketIdx - 1] || BRACKETS[0];
        $gameVariables.setValue(gauntletBracketVarId, bracketIdx);
        $gameVariables.setValue(gauntletWinsVarId, 0);
        this.buildRandomParty(bracket.min, bracket.max);
        this.startGauntletBattle();
    };

    //=========================================================================
    // Biome Trials
    //=========================================================================
    let _biomeTrial = null;

    function enemyBiomeList(enemy) {
        if (!enemy || !enemy.note) return [];
        const m = enemy.note.match(/<Biome:\s*([^>]+)>/i);
        if (!m) return [];
        return m[1].split(',').map(s => s.trim()).filter(Boolean);
    }

    ArenaBattleHandler.getEnemyLevelNum = function (enemy) {
        if (!enemy || !enemy.note) return 0;
        let m = enemy.note.match(/<Level:\s*(\d+)>/i);
        if (m) return Number(m[1]);
        m = enemy.note.match(/LV:\s*(\d+)/i);
        return m ? Number(m[1]) : 0;
    };

    ArenaBattleHandler.buildBiomeRoster = function (biome) {
        const target = String(biome).toLowerCase();
        const roster = [];
        for (let id = 1; id < $dataEnemies.length; id++) {
            const enemy = $dataEnemies[id];
            if (!enemy) continue;
            const troop = $dataTroops[id];
            if (!troop || troop.members.length !== 1 || troop.members[0].enemyId !== id) continue;
            const biomes = enemyBiomeList(enemy).map(b => b.toLowerCase());
            if (!biomes.includes(target)) continue;
            const level = this.getEnemyLevelNum(enemy);
            if (level <= 0) continue;
            roster.push({ troopId: troop.id, level, name: enemy.name });
        }
        roster.sort((a, b) => a.level - b.level);
        return roster;
    };

    ArenaBattleHandler.getPlayableBiomes = function () {
        const folders = (window.getBiomeBattlebackFolders && window.getBiomeBattlebackFolders()) || [];
        const folderByLower = new Map(folders.map(f => [f.toLowerCase(), f]));
        const stats = {};
        for (let id = 1; id < $dataEnemies.length; id++) {
            const enemy = $dataEnemies[id];
            if (!enemy) continue;
            const troop = $dataTroops[id];
            if (!troop || troop.members.length !== 1 || troop.members[0].enemyId !== id) continue;
            const level = this.getEnemyLevelNum(enemy);
            if (level <= 0) continue;
            for (const b of enemyBiomeList(enemy)) {
                const key = b.toLowerCase();
                if (!folderByLower.has(key)) continue;
                const s = stats[key] || (stats[key] = { count: 0, minLevel: Infinity, maxLevel: 0 });
                s.count++;
                s.minLevel = Math.min(s.minLevel, level);
                s.maxLevel = Math.max(s.maxLevel, level);
            }
        }
        const result = [];
        for (const key in stats) {
            result.push({ biome: folderByLower.get(key), count: stats[key].count, minLevel: stats[key].minLevel, maxLevel: stats[key].maxLevel });
        }
        // Sorted the way the list reads: the trial board shows each biome's
        // declared name, not the folder id it is keyed by.
        result.sort((a, b) => window.BiomeNames.display(a.biome)
            .localeCompare(window.BiomeNames.display(b.biome)));
        return result;
    };

    ArenaBattleHandler.applyBiomePartyLevel = function (level) {
        const lv = Math.max(1, Math.min(99, level));
        $gameParty.members().forEach(actor => {
            actor.changeLevel(lv, false);
            this._equipActorForBracket(actor, lv, lv);
            actor.recoverAll();
            if (actor.maxTp) actor.setTp(actor.maxTp());
        });
        $gamePlayer.refresh();
    };

    // Fresh level-1 random roster climb (random source or in-game trigger).
    ArenaBattleHandler.startBiomeTrial = function (biome, fromTitle) {
        const roster = this.buildBiomeRoster(biome);
        if (!roster.length) { SoundManager.playBuzzer(); return false; }
        this.buildRandomParty(1, 1);
        _biomeTrial = { active: true, biome, roster, partyLevel: 1, wins: 0, fromTitle: !!fromTitle };
        $gameSystem._forcedBattleBiome = biome;
        this._launchBiomeTrial(fromTitle);
        return true;
    };

    // Climb a biome with the party the player already chose (saved slot). Starts
    // from the party's own level and rescales up as the roster demands.
    ArenaBattleHandler.startBiomeTrialWithParty = function (biome, fromTitle) {
        const roster = this.buildBiomeRoster(biome);
        if (!roster.length) { SoundManager.playBuzzer(); return false; }
        const leader = $gameParty.leader();
        const startLevel = Math.max(1, leader ? leader.level : 1);
        _biomeTrial = { active: true, biome, roster, partyLevel: startLevel, wins: 0, fromTitle: !!fromTitle };
        $gameSystem._forcedBattleBiome = biome;
        this._launchBiomeTrial(fromTitle);
        return true;
    };

    ArenaBattleHandler._launchBiomeTrial = function (fromTitle) {
        if (fromTitle) {
            this._ensureBattleMapReady();
            _arenaFromTitle = true;
            _arenaStageStarter = () => ArenaBattleHandler.startBiomeTrialBattle();
            SceneManager.goto(window.Scene_ArenaStage);
        } else {
            this.startBiomeTrialBattle();
        }
    };

    ArenaBattleHandler.startBiomeTrialBattle = function () {
        const t = _biomeTrial;
        if (!t || !t.active) return;

        const atOrAbove = t.roster.filter(r => r.level >= t.partyLevel);
        if (atOrAbove.length === 0) { this.completeBiomeTrial(); return; }
        const minLv = atOrAbove[0].level;
        const group = atOrAbove.filter(r => r.level === minLv);
        const entry = group[Math.floor(Math.random() * group.length)];

        if (entry.level > t.partyLevel) t.partyLevel = entry.level;
        this.applyBiomePartyLevel(t.partyLevel);

        $gameSystem._forcedBattleBiome = t.biome;
        _restorePartyForBout();

        this._ensureBattleMapReady();
        BattleManager.setup(entry.troopId, true, false);
        BattleManager.setBattleTest(false);
        BattleManager.setGauntletMode(false);
        BattleManager.setArenaMode(false);
        BattleManager.setBiomeTrialMode(true);
        SceneManager.push(Scene_Battle);
    };

    ArenaBattleHandler.processBiomeTrialVictory = function () {
        const t = _biomeTrial;
        if (!t || !t.active) return;
        t.wins += 1;
        t.partyLevel += 1;

        const reward = this.grantStreakRewards(t.wins);
        const fun = this.payVictoryFun(t.wins);
        this.showStreakToast(t.wins, reward, fun);

        if (this._nextTrialTimer) {
            clearTimeout(this._nextTrialTimer);
            this._nextTrialTimer = null;
        }
        if (!_arenaFromTitle) {
            this.startBiomeTrialBattle();
        }
    };

    ArenaBattleHandler.completeBiomeTrial = function () {
        const t = _biomeTrial;
        this.showStreakToast(t ? t.wins : 0, null);
        this.endBiomeTrial();
    };

    ArenaBattleHandler.endBiomeTrial = function () {
        const fromTitle = _biomeTrial ? _biomeTrial.fromTitle : _arenaFromTitle;
        if (_randomPartyMode) this.restoreParty();
        if ($gameSystem) $gameSystem._forcedBattleBiome = null;
        _biomeTrial = null;
        BattleManager.setBiomeTrialMode(false);

        if (fromTitle) {
            this.cancelTitleFlow();
            SceneManager._stack = [];
            if (!SceneManager.isSceneChanging()) SceneManager.goto(Scene_Title);
            return;
        }
        if (SceneManager._scene && !(SceneManager._scene instanceof Scene_Map) && !SceneManager.isSceneChanging()) {
            SceneManager.goto(Scene_Map);
        }
    };

    //=========================================================================
    // Boss Rush: a gauntlet of every single <Boss>-tagged enemy in the game,
    // fought in ascending level order. The party is set to each boss's own
    // authored level (and re-equipped whenever that level changes a bracket)
    // before every bout, rather than climbing one level per win.
    //=========================================================================
    let _bossRush = null;

    // Every solo troop whose enemy carries <Boss>, sorted by authored level.
    ArenaBattleHandler.getBossTroops = function () {
        const roster = [];
        for (let id = 1; id < $dataEnemies.length; id++) {
            const enemy = $dataEnemies[id];
            if (!enemy || !/<Boss>/i.test(enemy.note || "")) continue;
            const troop = $dataTroops[id];
            if (!troop || troop.members.length !== 1 || troop.members[0].enemyId !== id) continue;
            const level = this.getEnemyLevelNum(enemy);
            if (level <= 0) continue;
            roster.push({ troopId: troop.id, level, name: enemy.name });
        }
        roster.sort((a, b) => a.level - b.level);
        return roster;
    };

    // Launch entry point for the mode picker: always title-flow (the mode
    // picker only follows Scene_ArenaPartySelect), same routing rule as
    // launchGauntlet - a random title party is freshly generated, a saved
    // title party or the live in-game party is rescaled in place.
    ArenaBattleHandler.launchBossRush = function () {
        const roster = this.getBossTroops();
        if (!roster.length) { SoundManager.playBuzzer(); return false; }

        if (_arenaFromTitle && _titlePartySource === 'random') {
            this.buildRandomParty(roster[0].level, roster[0].level);
        } else {
            this.rescaleCurrentParty(roster[0].level, roster[0].level);
        }

        _bossRush = { active: true, roster, index: 0, lastLevel: roster[0].level, fromTitle: _arenaFromTitle };

        if (_arenaFromTitle) {
            this._ensureBattleMapReady();
            _arenaStageStarter = () => ArenaBattleHandler.startBossRushBattle();
            SceneManager.goto(window.Scene_ArenaStage);
        } else {
            this.startBossRushBattle();
        }
        return true;
    };

    ArenaBattleHandler.startBossRushBattle = function () {
        const t = _bossRush;
        if (!t || !t.active) return;
        if (t.index >= t.roster.length) { this.completeBossRush(); return; }

        const entry = t.roster[t.index];

        // Only re-level/re-equip when the next boss actually sits at a
        // different level than the last bout, so a run of same-level bosses
        // doesn't churn equipment for no reason.
        if (entry.level !== t.lastLevel || t.index === 0) {
            $gameParty.members().forEach(actor => {
                actor.changeLevel(Math.max(1, Math.min(99, entry.level)), false);
                this._equipActorForBracket(actor, entry.level, entry.level);
            });
            $gamePlayer.refresh();
            t.lastLevel = entry.level;
        }

        _restorePartyForBout();

        this._ensureBattleMapReady();
        BattleManager.setup(entry.troopId, true, false);
        BattleManager.setBattleTest(false);
        BattleManager.setArenaMode(false);
        BattleManager.setGauntletMode(false);
        BattleManager.setBiomeTrialMode(false);
        BattleManager.setBossRushMode(true);
        SceneManager.push(Scene_Battle);
    };

    ArenaBattleHandler.processBossRushVictory = function () {
        const t = _bossRush;
        if (!t || !t.active) return;
        t.index += 1;

        const reward = this.grantStreakRewards(t.index);
        const fun = this.payVictoryFun(t.index);
        this.showStreakToast(t.index, reward, fun);

        if (this._nextBossTimer) {
            clearTimeout(this._nextBossTimer);
            this._nextBossTimer = null;
        }
        if (!_arenaFromTitle) {
            this.startBossRushBattle();
        }
    };

    ArenaBattleHandler.completeBossRush = function () {
        const t = _bossRush;
        this.showStreakToast(t ? t.index : 0, null);
        this.endBossRush();
    };

    ArenaBattleHandler.endBossRush = function () {
        const fromTitle = _bossRush ? _bossRush.fromTitle : _arenaFromTitle;
        if (_randomPartyMode) this.restoreParty();
        _bossRush = null;
        BattleManager.setBossRushMode(false);

        if (fromTitle) {
            this.cancelTitleFlow();
            SceneManager._stack = [];
            if (!SceneManager.isSceneChanging()) SceneManager.goto(Scene_Title);
            return;
        }

        window.skipLocalization = true;
        $gameMessage.add(T('Arena.bossRushHasEnded'));
        window.skipLocalization = false;

        if (SceneManager._scene && !(SceneManager._scene instanceof Scene_Map) && !SceneManager.isSceneChanging()) {
            SceneManager.goto(Scene_Map);
        }
    };
})();
