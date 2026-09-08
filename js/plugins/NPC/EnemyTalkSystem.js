//=============================================================================
// EnemyTalkSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Adds a talk system to interact with enemies during battle via plugin commands.
 * @author Omni-Lex
 * @url https://yourwebsite.com
 *
 * @help EnemyTalkSystem.js
 *
 * This plugin adds plugin commands to interact with enemies during battle
 * through various dialog options.
 *
 * Features:
 * - Disposition system (1-100) for each enemy
 * - Chat option to build rapport
 * - Surrender option to make enemies flee
 * - Insult option to debuff enemies
 * - Join Party option 
 * - Throw Stone option (works on all enemies)
 * - Pet option (works on all enemies)
 * - Archetype-based messages and disposition modifiers
 * - Italian language support
 * - Success percentage display for each option
 *
 * Enemy Notes Setup:
 * - <Talk> - Required! Enemy must have this tag to understand you
 * - <Archetype: Goblin> - Optional archetype for custom messages
 *
 * Supported Archetypes:
 * Goblin, Humanoid, TwoHeadedHumanoid, Fairy, Robot, Demon, Elven,
 * Gnome, Ghost, ArmoredKnight, Dragon
 *
 * Plugin Commands:
 * - Open Talk Menu: Opens the dialog choices window
 *
 * @command openTalkMenu
 * @text Open Talk Menu
 * @desc Opens the enemy talk dialog choices in battle.
 */

(() => {
    const pluginName = "EnemyTalkSystem";

    // Get message data from global scope
    const { archetypeMessagesEN, archetypeMessagesIT, defaultMessagesEN, defaultMessagesIT } = window.Messages;

    // Messages and menu choices live in
    // js/i18n/<lang>/plugins/EnemyTalk.json; the archetype banks below stay as
    // ids and proper nouns.

    // Disposition modifiers by archetype
    const archetypeDispositionModifiers = {
        Goblin: -10,
        Humanoid: 0,
        TwoHeadedHumanoid: 5,
        Fairy: 15,
        Robot: -5,
        Demon: -20,
        Elven: 10,
        Gnome: 10,
        Dwarf: 5,
        Ghost: -15,
        ArmoredKnight: 5,
        Dragon: -25
    };

    // Random names by archetype. Proper nouns: the name a talkable enemy is
    // given is written onto the battler and follows it around, so it never
    // translates, exactly like the NPCPools rosters.
    // i18n-ignore-start
    const archetypeNames = {
        Goblin: ["Gribble", "Snark", "Razzle", "Grot", "Nibbles", "Snaggletooth", "Runt", "Skitter", "Boggle", "Grub"],
        Humanoid: ["Marcus", "Elena", "Roderick", "Aria", "Gareth", "Lyssa", "Brom", "Selene", "Darius", "Mira"],
        TwoHeadedHumanoid: ["Grug & Brug", "Hank & Tank", "Zip & Zap", "Yin & Yang", "Biff & Buff", "Lark & Dark"],
        Fairy: ["Sparkle", "Dewdrop", "Moonbeam", "Shimmer", "Petal", "Glimmer", "Whisper", "Twinkle", "Blossom", "Flutter"],
        Robot: ["Unit-X7", "Servo-9", "Mech-Alpha", "Core-Beta", "Bot-Prime", "Auto-Sigma", "Droid-Zeta", "Synth-Omega"],
        Demon: ["Baalgor", "Infernus", "Malphas", "Azgoroth", "Vexia", "Zargath", "Morrigan", "Beleth", "Asmodeus", "Lilith"],
        Elven: ["Aelindor", "Silvariel", "Faelyn", "Thandor", "Liraelle", "Caladorn", "Elarion", "Sylvaris", "Galadhwen"],
        Gnome: ["Fizzlebang", "Tinkertop", "Gearshift", "Sparkplug", "Cogsworth", "Boltworth", "Springlock", "Whizbang"],
        Dwarf: ["Thrain", "Balgrim", "Durna", "Hrothgar", "Katla", "Borin", "Vesla", "Grimni", "Dagna", "Ormar"],
        Ghost: ["Whisper", "Phantom", "Shade", "Specter", "Wraith", "Echo", "Hollow", "Mist", "Veil", "Haunt"],
        ArmoredKnight: ["Sir Roland", "Dame Cassandra", "Sir Aldric", "Lady Evaine", "Sir Godfrey", "Dame Brigitte", "Sir Percival"],
        Dragon: ["Ignathor", "Frostfang", "Emberwing", "Stormclaw", "Cinderheart", "Nightscale", "Sunfire", "Shadowmaw"]
    };

    // i18n-ignore-end

    // Archetype to class mappings (class IDs)
    const archetypeClasses = {
        Goblin: [2, 1, 10, 13, 14, 16, 30, 35],
        Humanoid: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60],
        TwoHeadedHumanoid: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60],
        Fairy: [2, 3, 19, 20, 25, 27, 28, 34, 35],
        Robot: [66],
        Demon: [5, 19, 23, 31, 32, 34, 37, 38],
        Elven: [24, 34, 27, 20],
        Gnome: [1, 21],
        Dwarf: [4, 13, 16, 22, 30, 33, 40, 47, 54],
        Ghost: [63],
        ArmoredKnight: [4, 22, 33, 34, 37],
        Dragon: [63]
    };

    //-----------------------------------------------------------------------------
    // Helper Functions
    //-----------------------------------------------------------------------------

    function isItalian() {
        return ConfigManager.language === 'it';
    }

    // Read lazily so a language switch reaches the next line spoken.
    const systemMessages = new Proxy({}, {
        get: (_, key) => T('EnemyTalk.msg.' + String(key)),
        has: (_, key) => T.has('EnemyTalk.msg.' + String(key)),
    });

    function getSystemMessages() {
        return systemMessages;
    }

    function getArchetypeMessages() {
        return isItalian() ? archetypeMessagesIT : archetypeMessagesEN;
    }

    function getDefaultMessages() {
        return isItalian() ? defaultMessagesIT : defaultMessagesEN;
    }

    function getChoices() {
        return T.list('EnemyTalk.choices');
    }

    //-----------------------------------------------------------------------------
    // Plugin Commands
    //-----------------------------------------------------------------------------

    PluginManager.registerCommand(pluginName, "openTalkMenu", function (args) {
        if ($gameParty.inBattle()) {
            // Save a reference to the interpreter that is running this command
            SceneManager._scene._talkInterpreter = this;
            SceneManager._scene.openTalkMenu();
            this.setWaitMode('talk');
        }
    });

    //-----------------------------------------------------------------------------
    // Game_Enemy
    //-----------------------------------------------------------------------------

    Game_Enemy.prototype.getArchetype = function () {
        const note = this.enemy().note;
        const match = note.match(/<Archetype:\s*(\w+)>/i);
        return match ? match[1] : null;
    };

    // Some things are not company. A <NoRecruit> creature (the petrodemons, and
    // anything else that is a force rather than a person) can never be talked
    // round, petted, taken as a pet or a follower, or asked to join the party:
    // every one of those answers with the same refusal.
    // The rule lives on the DATA, so systems holding a $dataEnemies entry rather
    // than a live battler (SummonSystem's mark / last-slain) can ask it too.
    window.EnemyTalk = window.EnemyTalk || {};
    window.EnemyTalk.isUnrecruitableData = function (data) {
        if (!data) return false;
        if (data._bsePetrodemon) return true;
        return /<NoRecruit>/i.test(data.note || '');
    };

    Game_Enemy.prototype.isUnrecruitable = function () {
        return window.EnemyTalk.isUnrecruitableData(this.enemy());
    };

    Game_Enemy.prototype.canTalk = function () {
        if (this.isUnrecruitable()) return false;
        const note = this.enemy().note;
        if (!note.includes('<Talk>')) return false;

        // Check if enemy has any states that prevent talking
        const preventTalkStates = [6, 7, 8, 10, 11];
        for (const stateId of preventTalkStates) {
            if (this.isStateAffected(stateId)) {
                return false;
            }
        }

        return true;
    };

    // NEW: Get specific message for state preventing talk
    Game_Enemy.prototype.getCantTalkMessage = function () {
        const systemMessages = getSystemMessages();

        // Check states in priority order and return appropriate message
        if (this.isStateAffected(6)) return systemMessages.silenced;
        if (this.isStateAffected(7)) return systemMessages.enraged;
        if (this.isStateAffected(8)) return systemMessages.confused;
        if (this.isStateAffected(10)) return systemMessages.sleeping;
        if (this.isStateAffected(11)) return systemMessages.frozen;

        // Default message if no specific state found
        return systemMessages.cantTalkNow;
    };

    // How this individual monster feels about the party before a word is said.
    // 40% chance for low disposition (10-40)
    // 40% chance for medium disposition (41-70)
    // 20% chance for high disposition (71-100)
    Game_Enemy.prototype.rollDisposition = function () {
        const roll = Math.random();
        if (roll < 0.4) {
            this._disposition = Math.floor(Math.random() * 31) + 10; // 10-40
        } else if (roll < 0.8) {
            this._disposition = Math.floor(Math.random() * 30) + 41; // 41-70
        } else {
            this._disposition = Math.floor(Math.random() * 30) + 71; // 71-100
        }

        const archetype = this.getArchetype();
        if (archetype && archetypeDispositionModifiers[archetype] !== undefined) {
            this._disposition += archetypeDispositionModifiers[archetype];
        }
        this._disposition = this._disposition.clamp(1, 100);
    };

    const _Game_Enemy_setup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function (enemyId, x, y) {
        _Game_Enemy_setup.call(this, enemyId, x, y);
        this.rollDisposition();
    };

    // Opinion belongs to the individual monster and to this encounter alone: a
    // raccoon the party spent three turns petting must never hand its goodwill
    // to the next raccoon they meet. The roll above already runs per battler,
    // but battlers reach a fight through several paths (persistent map enemies,
    // monsters that wander into a map-battle brawl, arena and tournament
    // set-ups), so every member is rolled again when the fight is set up. That
    // makes a goodwill value left over from an earlier encounter unreachable,
    // whichever path built the battler.
    const _BattleManager_setup_ETS = BattleManager.setup;
    BattleManager.setup = function (troopId, canEscape, canLose) {
        _BattleManager_setup_ETS.call(this, troopId, canEscape, canLose);
        for (const enemy of $gameTroop.members()) {
            if (enemy && enemy.rollDisposition) enemy.rollDisposition();
        }
    };

    Game_Enemy.prototype.disposition = function () {
        return this._disposition || 50;
    };

    // The monster the talk panel is addressing. A front-view troop holds a
    // single enemy, but a map-battle brawl merges every monster that wandered
    // in into ONE troop, and reading members()[0] there showed - and
    // befriended, insulted, stoned - the monster that started the fight no
    // matter which one the party was facing, so one raccoon's opinion looked
    // like it belonged to every other raccoon in the fight.
    function resolveTalkEnemy() {
        const alive = $gameTroop.aliveMembers();
        if (alive.length <= 1) return alive[0] || null;
        const MBM = window.MapBattleMode;
        if (MBM && MBM.isActive && MBM.isActive() && MBM.mapCharacterFor) {
            const actor = BattleManager.actor() || $gameParty.battleMembers()[0];
            const from = actor && MBM.mapCharacterFor(actor);
            if (from) {
                let best = null;
                let bestDist = Infinity;
                for (const enemy of alive) {
                    const ch = MBM.mapCharacterFor(enemy);
                    if (!ch) continue;
                    const dist = Math.abs(ch.x - from.x) + Math.abs(ch.y - from.y);
                    if (dist < bestDist) { bestDist = dist; best = enemy; }
                }
                if (best) return best;
            }
        }
        return alive[0];
    }

    // Pinned while the panel is open (re-pinned every time it opens, in
    // _buildTalkOptions) so what the header shows and what an option does are
    // always the same monster. A pin from an earlier fight fails the troop
    // membership test and is discarded.
    Scene_Battle.prototype._talkEnemy = function () {
        const pinned = this._talkEnemyRef;
        if (pinned && pinned.isAlive() && $gameTroop.members().includes(pinned)) {
            return pinned;
        }
        this._talkEnemyRef = resolveTalkEnemy();
        return this._talkEnemyRef;
    };

    Game_Enemy.prototype.changeDisposition = function (amount) {
        this._disposition = (this._disposition || 50) + amount;
        this._disposition = this._disposition.clamp(1, 100);
    };

    // Decrease disposition when taking damage
    const _Game_Enemy_performDamage = Game_Enemy.prototype.performDamage;
    Game_Enemy.prototype.performDamage = function () {
        _Game_Enemy_performDamage.call(this);
        // Reduce disposition by 5-15 points when hit, scaled by damage severity
        const hpPercent = this.hp / this.mhp;
        const dispositionLoss = Math.floor(5 + (1 - hpPercent) * 10);
        this.changeDisposition(-dispositionLoss);
    };

    //-----------------------------------------------------------------------------
    // Scene_Battle
    //-----------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // The talk menu, drawn as the actor's command list
    // -------------------------------------------------------------------------
    // A conversation is planned where every other action is planned: the choices
    // REPLACE the actor's command rows instead of opening a modal of their own,
    // the same way the grapple menu does (Health_Monsters.js). The drawing
    // belongs to BattleSystemEnhanchedCommands (that window is its) and only the
    // list is ours; it calls in through window.TalkMenu. Because the session
    // lives on the window, the tactical map menu (MapBattleMode.js) opens the
    // very same rows on its own command window.
    // -------------------------------------------------------------------------

    const TALK_ROW_ICONS = {
        chat:       246,
        joinParty:   84,
        joinPet:    298,
        surrender:  125,
        insult:      85,
        throwStone: 161,
        pet:        249,
        cancel:     140,
    };

    const TalkMenu = {
        isMenuOpen(win) {
            return !!(win && win._talkSession);
        },

        // Stands in for Window_ActorCommand.makeCommandList while a conversation
        // is open. Rows carry their label in `name` (which that window falls back
        // to for symbols it does not know) and their place in the option list in
        // `ext`, which is what onTalkRow reads back.
        makeCommandList(win) {
            const scene   = win._talkSession.scene;
            const options = scene._talkOptions || [];
            const enemy   = scene._talkEnemy ? scene._talkEnemy() : null;
            // Who is being addressed and what they make of the party: the header
            // the panel used to carry, as a row nothing can pick.
            if (enemy) {
                win.addCommandWithIcon(
                    T('EnemyTalk.menu.header', {
                        name: enemy.name(),
                        opinion: T('EnemyTalk.opinion'),
                        value: enemy.disposition(),
                    }),
                    "talkRow", false, null, TALK_ROW_ICONS.chat, true);
            }
            options.forEach((opt, i) => {
                const label = (opt.pct === null || opt.pct === undefined)
                    ? opt.label
                    : T('EnemyTalk.menu.row', { name: opt.label, chance: opt.pct });
                win.addCommandWithIcon(label, "talkRow", true, { idx: i },
                    TALK_ROW_ICONS[opt.key] || TALK_ROW_ICONS.chat);
            });
        },

        // Take the command window over. Its own handlers are put aside whole and
        // given back on the way out, so nothing else has to know this mode exists.
        open(win, scene) {
            if (!win || !scene || typeof scene._buildTalkOptions !== "function") return false;
            scene._talkIdx     = 0;
            scene._talkOptions = scene._buildTalkOptions();
            scene._talkHandlers = {
                chat:       scene.onTalkChat.bind(scene),
                joinParty:  scene.onTalkJoinParty.bind(scene),
                joinPet:    scene.onTalkJoinPet.bind(scene),
                surrender:  scene.onTalkSurrender.bind(scene),
                insult:     scene.onTalkInsult.bind(scene),
                throwStone: scene.onThrowStone.bind(scene),
                pet:        scene.onPet.bind(scene),
                cancel:     scene.onTalkCancel.bind(scene),
            };

            win._talkSession       = { scene };
            win._talkSavedHandlers = win._handlers;
            win._handlers = {};
            // A row was confirmed: it carries its place in the option list, and
            // the dispatch in _talkOk does the rest, exactly as it did when the
            // rows were DOM elements.
            win.setHandler("talkRow", () => {
                const ext = win.currentExt();
                if (!ext || ext.idx == null) { SoundManager.playBuzzer(); return; }
                scene._talkIdx = ext.idx;
                scene._talkOk();
            });
            win.setHandler("cancel",  scene.onTalkCancel.bind(scene));
            win.show();
            win.refresh();
            // The header is a row too, and a dead one: the cursor starts on the
            // first thing that can actually be said.
            const first = (win._list || []).findIndex(cmd => cmd.enabled !== false);
            win.select(first < 0 ? 0 : first);
            win.activate();
            TouchInput.clear();
            return true;
        },

        close(win) {
            const scene = (win && win._talkSession) ? win._talkSession.scene : null;
            if (scene) {
                scene._talkOptions  = null;
                scene._talkHandlers = null;
            }
            if (!win || !win._talkSession) return;
            win._talkSession = null;
            if (win._talkSavedHandlers) win._handlers = win._talkSavedHandlers;
            win._talkSavedHandlers = null;
        },
    };
    window.TalkMenu = TalkMenu;

    // With more than one monster standing, which one is being addressed is a
    // choice, not a guess: hand it to the ordinary battle target window (the
    // same one a single-target skill uses), exactly the way Health_Monsters'
    // Check/Aim and the card system's target step already borrow it, so the
    // target chevron over the monster and the named target rows come with it
    // for free. A lone enemy, or no enemy window to borrow (should not happen
    // in Scene_Battle), opens the menu straight away.
    Scene_Battle.prototype.openTalkMenu = function () {
        const alive = $gameTroop.aliveMembers();
        if (alive.length > 1 && this._enemyWindow) {
            this._talkSelecting = true;
            this.startEnemySelection();
            return;
        }
        this._openTalkPanel();
    };

    const _SB_onEnemyOk_TALK = Scene_Battle.prototype.onEnemyOk;
    Scene_Battle.prototype.onEnemyOk = function () {
        if (this._talkSelecting) {
            this._talkSelecting = false;
            const enemy = this._enemyWindow ? this._enemyWindow.enemy() : null;
            if (this._enemyWindow) { this._enemyWindow.hide(); this._enemyWindow.deactivate(); }
            this._talkEnemyRef = enemy || null;
            this._talkTargetManuallyPicked = !!enemy;
            this._openTalkPanel();
            return;
        }
        _SB_onEnemyOk_TALK.call(this);
    };

    const _SB_onEnemyCancel_TALK = Scene_Battle.prototype.onEnemyCancel;
    Scene_Battle.prototype.onEnemyCancel = function () {
        if (this._talkSelecting) {
            this._talkSelecting = false;
            if (this._talkInterpreter && this._talkInterpreter._waitMode === 'talk') {
                this._talkInterpreter.setWaitMode('');
                this._talkInterpreter = null;
            }
            return;
        }
        _SB_onEnemyCancel_TALK.call(this);
    };

    Scene_Battle.prototype._openTalkPanel = function () {
        this._partyCommandWindow.deactivate();
        this._partyCommandWindow.hide();
        TalkMenu.open(this._actorCommandWindow, this);
    };

    // The party is three strong, and a summon is not one of the three: it borrows
    // a slot for the length of a fight (SummonSystem.js) and is gone by the end
    // of it, so a monster talked round while a familiar is out still has a place
    // to join. Everyone else in the party counts.
    const PARTY_CAP = 3;
    const RECRUIT_ACTOR_IDS = [2, 3];

    function isArenaModeActive() {
        if (typeof BattleManager !== 'undefined') {
            if (typeof BattleManager.isArenaMode === 'function' && BattleManager.isArenaMode()) return true;
            if (typeof BattleManager.isGauntletMode === 'function' && BattleManager.isGauntletMode()) return true;
            if (typeof BattleManager.isBiomeTrialMode === 'function' && BattleManager.isBiomeTrialMode()) return true;
            if (typeof BattleManager.isBossRushMode === 'function' && BattleManager.isBossRushMode()) return true;
        }
        if (typeof ArenaBattleHandler !== 'undefined') {
            if (typeof ArenaBattleHandler.isTitleFlow === 'function' && ArenaBattleHandler.isTitleFlow()) return true;
            if (typeof ArenaBattleHandler.isArenaFromTitle === 'function' && ArenaBattleHandler.isArenaFromTitle()) return true;
        }
        return false;
    }

    function partyCompanions() {
        const summon = window.SummonSystem;
        return $gameParty.members().filter(m =>
            m && !(summon && summon.isProxyActor(m.actorId())));
    }

    function isPartyFull() {
        return partyCompanions().length >= PARTY_CAP;
    }

    // The recruit slot to move into: the first companion actor not already in
    // the party. Read rather than guessed from the party size, which a summon
    // standing in the 4th slot would otherwise throw off by one.
    function freeRecruitSlot() {
        const taken = $gameParty.members().map(m => m.actorId());
        return RECRUIT_ACTOR_IDS.find(id => !taken.includes(id)) || 0;
    }

    // Recruiting is a persuasion or an insight check, whichever the actor is
    // better at: PSI (LUK based) for charm, WIS (MDF based) for reading the
    // creature. Always the higher of the two, regardless of whether the
    // target can talk back.
    function bestJoinStat(actor) {
        if (!actor) return { statName: 'PSI', statMod: 0 };
        const psiMod = actor.psiMod ?? Math.floor(((actor.luk || 10) - 10) / 2);
        const wisMod = actor.wisMod ?? Math.floor(((actor.mdf || 10) - 10) / 2);
        return wisMod > psiMod
            ? { statName: 'WIS', statMod: wisMod }
            : { statName: 'PSI', statMod: psiMod };
    }
    window.EnemyTalk.bestJoinStat = bestJoinStat;

    // Label for the "recruit as pet/follower" option. Cosmetic only: enemies
    // with the <Talk> tag become "followers", the rest become "pets".
    function getRecruitLabel(enemy) {
        const hasTalk = enemy && enemy.enemy().note.includes('<Talk>');
        return hasTalk ? T('EnemyTalk.recruit.askToFollow') : T('EnemyTalk.recruit.adoptAsPet');
    }

    Scene_Battle.prototype._buildTalkOptions = function () {
        const choices = getChoices();
        // Opening the panel re-pins the monster being addressed, so a second
        // Talk in the same fight can pick a different one - UNLESS the panel
        // is opening on a target the player just chose by hand (the
        // front-view multi-enemy picker in openTalkMenu above), which must
        // not be stomped the instant the panel it asked for opens.
        if (this._talkTargetManuallyPicked) {
            this._talkTargetManuallyPicked = false;
        } else {
            this._talkEnemyRef = resolveTalkEnemy();
        }
        const enemy   = this._talkEnemy();
        if (!enemy) {
            return [
                { label: choices[0], key: 'chat',       pct: 0    },
                { label: choices[2], key: 'surrender',  pct: 0    },
                { label: choices[3], key: 'insult',     pct: 0    },
                { label: choices[4], key: 'throwStone', pct: 100  },
                { label: choices[5], key: 'pet',        pct: 0    },
                { label: choices[6], key: 'cancel',     pct: null },
            ];
        }
        const canTalk    = enemy.canTalk();
        const talk       = canTalk ? this.calculateTalkSuccessChance() : 0;
        // Party is capped at 3 members: only offer the full "Join Party" option
        // while there is an open slot. The pet/follower option is always shown.
        const partyFull  = isPartyFull();

        // Nothing that cannot be recruited is offered a way in: no join, no
        // follower, no petting it. What is left is what you can do to it.
        if (enemy.isUnrecruitable()) {
            return [
                { label: choices[0], key: 'chat',       pct: 0    },
                { label: choices[2], key: 'surrender',  pct: 0    },
                { label: choices[3], key: 'insult',     pct: 0    },
                { label: choices[4], key: 'throwStone', pct: 100  },
                { label: choices[6], key: 'cancel',     pct: null },
            ];
        }

        const opts = [{ label: choices[0], key: 'chat', pct: talk }];
        if (!partyFull) {
            opts.push({ label: choices[1], key: 'joinParty', pct: this.calculateJoinSuccessChance() });
        }
        opts.push({ label: getRecruitLabel(enemy), key: 'joinPet', pct: this.calculatePetFollowerChance() });
        opts.push({ label: choices[2], key: 'surrender',  pct: talk });
        opts.push({ label: choices[3], key: 'insult',     pct: canTalk ? 100 : 0 });
        opts.push({ label: choices[4], key: 'throwStone', pct: 100 });
        opts.push({ label: choices[5], key: 'pet',        pct: this.calculatePetSuccessChance() });
        opts.push({ label: choices[6], key: 'cancel',     pct: null });
        return opts;
    };

    // The one refusal every approach to an unrecruitable creature ends on.
    // Returns true when it fired, so a handler can simply bail on it.
    Scene_Battle.prototype._refuseUnrecruitable = function (enemy) {
        if (!enemy || !enemy.isUnrecruitable()) return false;
        window.skipLocalization = true;
        $gameMessage.add(T('EnemyTalk.msg.unrecruitable', { name: enemy.name() }));
        window.skipLocalization = false;
        this.closeTalkMenu();
        return true;
    };

    Scene_Battle.prototype.calculatePetFollowerChance = function () {
        const enemy = this._talkEnemy();
        if (!enemy || enemy.isUnrecruitable() || isArenaModeActive()) return 0;
        // Pets/followers are easier to win over than a full party recruit:
        // disposition-based, with a flat bonus and a friendly floor.
        const base = this.calculateTalkSuccessChance();
        return Math.max(25, Math.min(95, base + 15));
    };

    Scene_Battle.prototype._talkOk = function () {
        const opt = this._talkOptions && this._talkOptions[this._talkIdx];
        if (!opt || !this._talkHandlers) return;
        SoundManager.playOk();
        const fn = this._talkHandlers[opt.key];
        if (fn) fn();
    };

    Scene_Battle.prototype.calculateTalkSuccessChance = function () {
        const actor = $gameParty.battleMembers()[0];
        const enemy = this._talkEnemy();

        if (!actor || !enemy) return 0;
        if (enemy.isUnrecruitable()) return 0;

        const actorLuck = actor.luk;
        const enemyLuck = enemy.luk;
        const disposition = enemy.disposition();

        // Scale luck difference (2.5% per point of PSI difference in D&D scale)
        const luckModifier = (actorLuck - enemyLuck) * 2.5;
        const baseChance = disposition + luckModifier;
        const successChance = Math.max(10, Math.min(95, baseChance));

        return Math.floor(successChance);
    };

    Scene_Battle.prototype.calculateTalkSuccess = function () {
        const successChance = this.calculateTalkSuccessChance();
        return Math.random() * 100 < successChance;
    };

    Scene_Battle.prototype.calculateJoinSuccessChance = function () {
        const enemy = this._talkEnemy();
        if (!enemy || enemy.isUnrecruitable() || isArenaModeActive()) return 0;

        // Small percentage to recruit even under the disposition threshold
        const disposition = enemy.disposition();
        if (disposition < 80) {
            // 5% base chance if disposition is below 80
            return Math.max(5, Math.floor(disposition / 16));
        }
        return this.calculateTalkSuccessChance();
    };

    Scene_Battle.prototype.calculatePetSuccessChance = function () {
        const enemy = this._talkEnemy();
        if (!enemy || enemy.isUnrecruitable()) return 0;

        const hasTalkTag = enemy.enemy().note.includes('<Talk>');

        if (hasTalkTag) {
            // For talking enemies, need high disposition
            const disposition = enemy.disposition();
            if (disposition < 70) return 0;
            return this.calculateTalkSuccessChance();
        } else {
            // For non-talking enemies (animals), standard success calculation
            return this.calculateTalkSuccessChance();
        }
    };

    Scene_Battle.prototype.onTalkChat = function () {
        const enemy = this._talkEnemy();
        const systemMessages = getSystemMessages();

        if (!enemy) {
            this.closeTalkMenu();
            return;
        }

        if (this._refuseUnrecruitable(enemy)) return;

        if (!enemy.canTalk()) {
            window.skipLocalization = true;
            // Check if enemy has <Talk> tag but is affected by state
            const note = enemy.enemy().note;
            if (note.includes('<Talk>')) {
                $gameMessage.add(enemy.getCantTalkMessage());
            } else {
                $gameMessage.add(systemMessages.noUnderstand);
            }
            window.skipLocalization = false;
            this.closeTalkMenu();
            return;
        }

        const success = this.calculateTalkSuccess();
        const archetype = enemy.getArchetype();
        const archetypeMessages = getArchetypeMessages();
        const defaultMessages = getDefaultMessages();
        let messages;

        if (success) {
            if (archetype && archetypeMessages[archetype]) {
                messages = archetypeMessages[archetype].success;
            } else {
                messages = defaultMessages.success;
            }

            const message = messages[Math.floor(Math.random() * messages.length)];
            window.skipLocalization = true;
            $gameMessage.add(message);
            window.skipLocalization = false;
            enemy.changeDisposition(20);
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.friendlier);
            window.skipLocalization = false;

            // Apply state 9 or 24 with small chance if disposition is high
            if (enemy.disposition() >= 70 && Math.random() < 0.15) {
                const stateId = Math.random() < 0.5 ? 9 : 24;
                enemy.addState(stateId);
            }
        } else {
            if (archetype && archetypeMessages[archetype]) {
                messages = archetypeMessages[archetype].fail;
            } else {
                messages = defaultMessages.fail;
            }

            const message = messages[Math.floor(Math.random() * messages.length)];
            window.skipLocalization = true;
            $gameMessage.add(message);
            window.skipLocalization = false;
        }

        this.closeTalkMenu();
    };

    Scene_Battle.prototype.onTalkSurrender = function () {
        const enemy = this._talkEnemy();
        const systemMessages = getSystemMessages();

        if (!enemy) {
            this.closeTalkMenu();
            return;
        }

        if (this._refuseUnrecruitable(enemy)) return;

        if (!enemy.canTalk()) {
            window.skipLocalization = true;
            // Check if enemy has <Talk> tag but is affected by state
            const note = enemy.enemy().note;
            if (note.includes('<Talk>')) {
                $gameMessage.add(enemy.getCantTalkMessage());
            } else {
                $gameMessage.add(systemMessages.noUnderstand);
            }
            window.skipLocalization = false;
            this.closeTalkMenu();
            return;
        }

        const success = this.calculateTalkSuccess();

        if (success) {
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.surrender);
            window.skipLocalization = false;
            this.closeTalkMenu();
            BattleManager.processEscape();
        } else {
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.refuseSurrender);
            window.skipLocalization = false;
            this.closeTalkMenu();
        }
    };

    Scene_Battle.prototype.onTalkInsult = function () {
        const enemy = this._talkEnemy();
        const systemMessages = getSystemMessages();

        if (!enemy) {
            this.closeTalkMenu();
            return;
        }

        if (this._refuseUnrecruitable(enemy)) return;

        if (!enemy.canTalk()) {
            window.skipLocalization = true;
            // Check if enemy has <Talk> tag but is affected by state
            const note = enemy.enemy().note;
            if (note.includes('<Talk>')) {
                $gameMessage.add(enemy.getCantTalkMessage());
            } else {
                $gameMessage.add(systemMessages.noUnderstand);
            }
            window.skipLocalization = false;
            this.closeTalkMenu();
            return;
        }

        const archetype = enemy.getArchetype();
        const archetypeMessages = getArchetypeMessages();
        const defaultMessages = getDefaultMessages();
        let messages;

        if (archetype && archetypeMessages[archetype]) {
            messages = archetypeMessages[archetype].insult;
        } else {
            messages = defaultMessages.insult;
        }

        const message = messages[Math.floor(Math.random() * messages.length)];
        window.skipLocalization = true;
        $gameMessage.add(message);
        window.skipLocalization = false;

        enemy.changeDisposition(-30);

        if (enemy.disposition() < 10) {
            const stateId = Math.random() < 0.5 ? 7 : 20;
            enemy.addState(stateId);
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.enragedAfterInsult);
            window.skipLocalization = false;
        }

        this.closeTalkMenu();
    };

    Scene_Battle.prototype.onThrowStone = function () {
        const enemy = this._talkEnemy();
        const systemMessages = getSystemMessages();

        if (!enemy) {
            this.closeTalkMenu();
            return;
        }

        window.skipLocalization = true;
        $gameMessage.add(systemMessages.stoneThrown);
        window.skipLocalization = false;

        enemy.changeDisposition(-30);

        if (enemy.disposition() < 10) {
            const stateId = Math.random() < 0.5 ? 7 : 20;
            enemy.addState(stateId);
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.enragedAfterInsult);
            window.skipLocalization = false;
        }

        this.closeTalkMenu();
    };

    Scene_Battle.prototype.onPet = function () {
        const enemy = this._talkEnemy();
        const systemMessages = getSystemMessages();

        if (!enemy) {
            this.closeTalkMenu();
            return;
        }

        if (this._refuseUnrecruitable(enemy)) return;

        const hasTalkTag = enemy.enemy().note.includes('<Talk>');

        if (hasTalkTag && enemy.disposition() < 70) {
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.petRefuse);
            window.skipLocalization = false;
            this.closeTalkMenu();
            return;
        }

        const success = this.calculateTalkSuccess();

        if (success) {
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.petSuccess);
            window.skipLocalization = false;
            enemy.changeDisposition(15);
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.friendlier);
            window.skipLocalization = false;
        } else {
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.petFail);
            window.skipLocalization = false;
        }

        this.closeTalkMenu();
    };

    // Resolve an overworld sprite {characterName, characterIndex} for an
    // archetype. Shared by actor recruitment and pet/follower recruitment.
    Scene_Battle.prototype.getArchetypeSprite = function (archetype) {
        let characterName, characterIndex;

        // Every sheet below holds a single character (img/characters/NPCs), so
        // the index is always 0; the joined sheets these were cut out of are
        // gone.
        // i18n-ignore-start: Archetypes.json ids and sprite sheet names
        switch (archetype) {
            case 'ArmoredKnight':
                characterName = 'NPCs/!$WanderingKnight1';
                characterIndex = 0;
                break;

            case 'Ghost':
                characterName = 'Creatures/!$Ghost';
                characterIndex = 0;
                break;

            case 'Dragon':
                characterName = 'Vehicle';
                characterIndex = 2;
                break;

            // i18n-ignore-end
            case 'Humanoid': // i18n-ignore: Archetypes.json id
                // Random sprite out of the people the old NPCs/Actor/Heroes
                // sheets held.
                const humanSheets = [
                    'NPCs/!$Fisherman2', 'NPCs/!$BioCadet1', 'NPCs/!$Translator1',
                    'NPCs/!$Backpacker1', 'NPCs/!$GnomeExplorer1', 'NPCs/!$Librarian3',
                    'NPCs/!$Employee1', 'NPCs/!$FastfoodWorker1', 'NPCs/!$King2',
                    'NPCs/!$Queen2', 'NPCs/!$Page3', 'NPCs/!$NobleHeir2',
                    'NPCs/!$NobleGuard3', 'NPCs/!$Scarf4', 'NPCs/!$Maid2',
                    'Skab/!$LeatherDaddy', 'NPCs/!$Catboy2', 'NPCs/!$GnomeExplorer2',
                    'NPCs/!$Archivist2', 'NPCs/!$Pirate1', 'NPCs/!$Operator1',
                    'NPCs/!$Librarian4', 'NPCs/!$Tracker1', 'NPCs/!$Mafia1',
                    'NPCs/!$WarSniper1', 'NPCs/!$UniversityStudent1', 'NPCs/!$DJ1',
                    'NPCs/!$ArchivistArmorer1', 'NPCs/!$Jogger1', 'NPCs/!$Witch11',
                    'NPCs/!$ElvenArcher1', 'NPCs/!$ArmorDiver1', 'NPCs/!$ElvenBarbarian1',
                    'NPCs/!$SunCultist1', 'NPCs/!$Stylist1', 'NPCs/!$ElvenEnchantress1',
                    'NPCs/!$PirateHacker1', 'NPCs/!$TechnoBarbarian1', 'NPCs/!$Page1',
                    'NPCs/!$ValiantKnight1', 'NPCs/!$Botanist1', 'NPCs/!$CharmingPrince1',
                    'NPCs/!$GeniusGeneral1', 'NPCs/!$Astrologist2', 'NPCs/!$Ninja1',
                    'NPCs/!$CyberWitch1', 'NPCs/!$Infiltrator1', 'NPCs/!$Gunman1',
                    'NPCs/!$Mage1', 'NPCs/!$Ranger1', 'NPCs/!$Partygoer1',
                    'NPCs/!$Revolutionary1', 'NPCs/!$Jeweler1', 'NPCs/!$Journalist1',
                    'NPCs/!$WastelandKnight1', 'NPCs/!$WarPilot1', 'NPCs/!$ElvenGuard1',
                    'NPCs/!$ElvenVeteran1', 'NPCs/!$Princess1', 'NPCs/!$PizzaRider1',
                    'NPCs/!$SchoolTeacher1', 'NPCs/!$ScienceTeacher1', 'NPCs/!$ArmsTerader1',
                    'NPCs/!$Astrologist1', 'NPCs/!$DJ2', 'NPCs/!$WarWitch1',
                    'NPCs/!$WarSniper2', 'NPCs/!$WastelandThinkerer1', 'NPCs/!$ElvenScout1',
                    'NPCs/!$ElvenSinger1', 'NPCs/!$ElvenSwordsman1', 'NPCs/!$Catboy1',
                    'NPCs/!$Scarf3', 'NPCs/!$Jeweler2', 'NPCs/!$Guerrilla2',
                    'NPCs/!$Revolutionary2', 'NPCs/!$SpacerMonk1', 'NPCs/!$Announcer1',
                    'NPCs/!$Archeologist2', 'NPCs/!$Astrologist5', 'NPCs/!$Priest2',
                    'NPCs/!$Nun2', 'NPCs/!$ExoticBard1', 'NPCs/!$ElvenGuard3',
                    'NPCs/!$Coroner3', 'NPCs/!$Medic1'
                ];
                characterName = humanSheets[Math.floor(Math.random() * humanSheets.length)];
                characterIndex = 0;
                break;

            default:
                characterName = 'Creatures/!$Slime11';
                characterIndex = 0;
                break;
        }

        return { characterName, characterIndex };
    };

    Scene_Battle.prototype.setActorSpriteByArchetype = function (actor, archetype) {
        const sprite = this.getArchetypeSprite(archetype);
        actor.setCharacterImage(sprite.characterName, sprite.characterIndex);
    };

    // Resolve the recruited enemy's overworld sprite. Priority:
    //   1. the enemy's own <Char:...> note tag (e.g. <Char:$CarrionCrawler>),
    //      so the pet looks exactly like the enemy's defined walking sprite;
    //   2. the map event that started this battle (the encountered sprite);
    //   3. the archetype sprite as a last resort.
    Scene_Battle.prototype.resolveRecruitSprite = function (archetype, note) {
        // 1. <Char:...> note tag. These enemy walking sprites live in
        // img/characters/Monsters/, so the name is prefixed with "Monsters/"
        // (matching MimicSkillSystem/SummonSystem/ReactiveEnemyBattler). A
        // "$"-prefixed sheet is a single-character sprite, so its index is 0.
        if (note) {
            const charMatch = note.match(/<Char:\s*(.+?)>/i);
            if (charMatch) {
                return { characterName: "Monsters/" + charMatch[1].trim(), characterIndex: 0 };
            }
        }
        try {
            const _bse = window.BSE;
            const _eId = _bse && _bse.State && _bse.State.currentEventId;
            if (_eId && $gameMap && $gameMap.event(_eId)) {
                const _ev = $gameMap.event(_eId);
                if (_ev._characterName) {
                    return { characterName: _ev._characterName, characterIndex: _ev._characterIndex || 0 };
                }
            }
        } catch (e) { /* fall through to archetype sprite */ }
        return this.getArchetypeSprite(archetype);
    };

    // Give the recruited monster its own portrait. The actor slot may still
    // carry the bust, 3D model config and creature flag of whoever held it
    // before, so all of it is rewritten here: the enemy's battler art becomes
    // the actor's portrait image, and the status screen builds the procedural
    // 3D model of the recorded enemy when one resolves, falling back to the
    // flat battler image otherwise (what an unset portrait mode means).
    Scene_Battle.prototype.applyRecruitPortrait = function (actor, enemyData, enemy) {
        if (!actor || !enemyData) return;
        const slot = actor.actorId();
        // The body it was standing in front of the party in. Every fight rolls
        // its own look for the monsters in it, so the creature that walks off
        // with the party has to carry that roll with it or it would be redrawn
        // as some other member of its species on the status sheet and in the
        // Empathize panel. Its place in the troop comes along too: that is what
        // told two of the same monster apart in the fight.
        actor._recruitedLook = (window.Battler3D && window.Battler3D.currentLook)
            ? window.Battler3D.currentLook(enemy && enemy.index ? enemy.index() : 0)
            : null;
        if (actor.setVnBust) actor.setVnBust("");
        // "sprite" = portrayed by an existing monster species (its procedural 3D
        // model, with the flat battler image as the fallback), as opposed to the
        // bust or custom model a person in this slot may have been given.
        if (actor.setPortraitMode) actor.setPortraitMode("sprite");
        if (actor.setVnBattler) actor.setVnBattler(enemyData.battlerName || "");
        actor._recruitedEnemyId = enemyData.id;
        // Switches 77/78/79 say whether Actor 1/2/3 is portrayed by a battler
        // image instead of a bust.
        if ($gameSwitches && slot >= 1 && slot <= 3) {
            $gameSwitches.setValue(76 + slot, !!enemyData.battlerName);
        }
        // Drop the previous occupant's custom 3D model and look seed: the
        // recruit is portrayed by its own species, with its own roll (above),
        // not by theirs.
        if (window.CC3DModel) {
            if (window.CC3DModel.setConfig) window.CC3DModel.setConfig(slot, null);
            if (window.CC3DModel.setCreatureSeed) window.CC3DModel.setCreatureSeed(slot, null);
        }
    };

    // Give the recruit the body it is standing in front of the party with.
    //
    // The actor slot may still be carrying the last occupant's anatomy, and the
    // monster may be short a limb: the fight it was talked out of is the same
    // fight somebody cut its arm off in. A limb a blade took off does not grow
    // back because its owner changed sides, so the recruit is built from its own
    // archetype and then the severed parts are taken off it for good - out of
    // the health menu, out of the equip slots, and out of the 3D portrait
    // (window.HealthCore.partStates). Parts that were merely wrecked, and every
    // part on a body nothing was severed from, come across whole: joining the
    // party is a fresh start for everything but what is physically gone.
    Scene_Battle.prototype.applyRecruitAnatomy = function (actor, enemy) {
        const HC = window.HealthCore;
        if (!actor || !enemy || !HC || !window.initializeBodyParts) return;

        // The anatomy archetype Health_Monsters built the enemy out of, which
        // is not always the archetype its talk lines come from.
        const archetypeName = enemy._archetypeName || enemy.getArchetype();
        const Archetypes = window.Health && window.Health.Archetypes;
        // Whatever it turns out to be, it is not the last occupant's: an
        // unrecognised archetype falls back to the default body rather than
        // leaving the recruit wearing somebody else's anatomy.
        actor._currentArchetype = (archetypeName && Archetypes && Archetypes[archetypeName])
            ? archetypeName : null;

        actor._bodyParts = null;
        actor._statModifiers = {};
        actor._removedPartDebuffs = {};
        actor._severedParts = {};
        window.initializeBodyParts(actor);

        // Only what came off comes off. A part that was destroyed but could
        // never be severed (a torso, a mouth) is still on the creature.
        const enemyParts = enemy._bodyParts || {};
        for (const partKey in enemyParts) {
            const part = enemyParts[partKey];
            if (!part || !part.destroyed) continue;
            if (!part.canCutoff) continue;
            if (HC.loseBodyPart) HC.loseBodyPart(actor, partKey);
        }

        if (HC.ensureBodyPartSkills) HC.ensureBodyPartSkills(actor);
        actor.refresh();
    };

    Scene_Battle.prototype.onTalkJoinParty = async function () {
        const enemy = this._talkEnemy();
        const systemMessages = getSystemMessages();

        if (!enemy) {
            this.closeTalkMenu();
            return;
        }

        if (this._refuseUnrecruitable(enemy)) return;

        if (isPartyFull()) {
            window.skipLocalization = true;
            $gameMessage.add(systemMessages.partyFull);
            window.skipLocalization = false;
            this.closeTalkMenu();
            return;
        }

        const hasTalk = enemy.enemy() && enemy.enemy().note && enemy.enemy().note.includes('<Talk>');
        const actor = $gameParty.battleMembers()[0] || $gameParty.leader();
        const { statName, statMod } = bestJoinStat(actor);
        const chance = this.calculateJoinSuccessChance();
        let canJoin = false;

        if (chance <= 0) {
            canJoin = false;
        } else if (window.Dice3D) {
            const rollRes = await window.Dice3D.rollPercentage(chance, {
                actionName: `${hasTalk ? 'Recruit' : 'Tame'}: ${enemy.name()}`,
                statName: statName,
                modifier: statMod,
                force3D: true
            });
            canJoin = rollRes.success;
        } else {
            const success = this.calculateTalkSuccess();
            const disposition = enemy.disposition();
            canJoin = (disposition >= 80 && success) || (disposition < 80 && Math.random() * 100 < 5);
        }

        const archetype = enemy.getArchetype();
        const archetypeMessages = getArchetypeMessages();
        const defaultMessages = getDefaultMessages();
        let messages;

        if (canJoin) {
            if (archetype && archetypeMessages[archetype]) {
                messages = archetypeMessages[archetype].joinSuccess;
            } else {
                messages = defaultMessages.joinSuccess;
            }

            const message = messages[Math.floor(Math.random() * messages.length)];
            window.skipLocalization = true;
            $gameMessage.add(message);
            window.skipLocalization = false;

            const actorIdToAdd = freeRecruitSlot();
            const newActor = actorIdToAdd ? $gameActors.actor(actorIdToAdd) : null;

            // Guard: the actor slot may be missing from the database (bad id or
            // trimmed $dataActors). Abort recruitment safely instead of crashing
            // on a null actor.
            if (!newActor) {
                console.warn(`[EnemyTalkSystem] Cannot recruit: actor ${actorIdToAdd} does not exist.`);
                this.closeTalkMenu();
                return;
            }

            // Set name
            if (archetype && archetypeNames[archetype]) {
                const names = archetypeNames[archetype];
                const randomName = names[Math.floor(Math.random() * names.length)];
                newActor.setName(randomName);
            }

            // Set class from archetype (case-insensitive); fall back to a broad
            // humanoid class pool so every recruited enemy gets a class instead
            // of silently keeping the default Freelancer (#142).
            if (archetype) {
                const acKey = Object.keys(archetypeClasses)
                    .find(k => k.toLowerCase() === String(archetype).toLowerCase());
                const classes = acKey
                    ? archetypeClasses[acKey]
                    : archetypeClasses.Humanoid;
                if (classes && classes.length) {
                    const randomClassId = classes[Math.floor(Math.random() * classes.length)];
                    newActor.changeClass(randomClassId, false);
                }
            }

            // Same sprite resolution as the pet/follower path: the enemy's own
            // <Char:...> walking sprite first, then the map event that started
            // this battle, then the archetype sprite (#142).
            const recruitSprite = this.resolveRecruitSprite(archetype, enemy.enemy().note);
            newActor.setCharacterImage(recruitSprite.characterName, recruitSprite.characterIndex);

            // Portrait: the monster's own battler art / 3D model, replacing
            // whatever the slot inherited from its previous occupant.
            this.applyRecruitPortrait(newActor, enemy.enemy(), enemy);

            // Set level to median of current party
            const levels = partyCompanions().map(m => m.level);
            levels.sort((a, b) => a - b);
            const medianLevel = levels.length % 2 === 0
                ? Math.floor((levels[levels.length / 2 - 1] + levels[levels.length / 2]) / 2)
                : levels[Math.floor(levels.length / 2)];
            newActor.changeLevel(medianLevel, false);

            // Copy skills from enemy
            this.copyEnemySkillsToActor(enemy, newActor);

            // The body it walks in with: its own species' anatomy, minus
            // whatever the fight took off it.
            this.applyRecruitAnatomy(newActor, enemy);

            // The slot may still hold the last recruit's ruin (dead, poisoned,
            // half a hit point). A monster that just agreed to travel with the
            // party walks in whole - bar the limbs it no longer has.
            newActor.recoverAll();

            // Add to party. Joining happens on the spot, in the middle of the
            // fight it was decided in: the recruit is given the battle state
            // every other combatant got when the fight opened (without it they
            // would stand in the party with no turn, no actions and no bars),
            // and the field is refreshed so their sprite and gauges appear.
            $gameParty.addActor(actorIdToAdd);
            if ($gameParty.inBattle()) {
                newActor.onBattleStart();
                newActor.clearActions();
                if (typeof BattleManager.refreshStatus === 'function') BattleManager.refreshStatus();
                $gameTemp.requestBattleRefresh();
            }

            // Play Victory2 ME
            AudioManager.playMe({ name: "Victory2", volume: 90, pitch: 100, pan: 0 });

            window.skipLocalization = true;
            $gameMessage.add(newActor.name() + " " + systemMessages.joined);
            window.skipLocalization = false;

            // Recruited, not killed: hide the enemy so no collapse/corpse plays
            // (#142 corpse left behind). Talking one monster round is not the
            // end of the fight when its friends are still swinging, so the
            // battle only stops here if nothing else is left standing, and then
            // as a flee (result 1) so the BSE win path spawns no corpse (#138
            // battle not ending). Either way the creature is off the field for
            // good, which is how BSE knows to erase its map event: otherwise the
            // monster stays on the map next to its own recruited copy.
            enemy.hide();
            this.closeTalkMenu();
            if ($gameTroop.aliveMembers().length === 0) BattleManager.abort();
            return;

        } else {
            if (archetype && archetypeMessages[archetype]) {
                messages = archetypeMessages[archetype].joinFail;
            } else {
                messages = defaultMessages.joinFail;
            }

            const message = messages[Math.floor(Math.random() * messages.length)];
            window.skipLocalization = true;
            $gameMessage.add(message);
            window.skipLocalization = false;
        }

        this.closeTalkMenu();
    };

    // Recruit the enemy as a pet/follower: a trailing map companion that is NOT
    // a party member (so it never battles, never dies, and can't be targeted).
    // <Talk> enemies become "followers", the rest "pets", cosmetic only.
    Scene_Battle.prototype.onTalkJoinPet = async function () {
        const enemy = this._talkEnemy();

        if (!enemy) {
            this.closeTalkMenu();
            return;
        }

        if (this._refuseUnrecruitable(enemy)) return;

        if (!window.PetSystem) {
            console.warn("EnemyTalkSystem: PetFollowerSystem.js not loaded, cannot recruit pet.");
            this.closeTalkMenu();
            return;
        }

        const hasTalk = enemy.enemy() && enemy.enemy().note && enemy.enemy().note.includes('<Talk>');
        const actor = $gameParty.battleMembers()[0] || $gameParty.leader();
        const { statName, statMod } = bestJoinStat(actor);
        const chance = this.calculatePetFollowerChance();
        let success = false;

        if (chance <= 0) {
            success = false;
        } else if (window.Dice3D) {
            const rollRes = await window.Dice3D.rollPercentage(chance, {
                actionName: `${hasTalk ? 'Follower' : 'Tame'}: ${enemy.name()}`,
                statName: statName,
                modifier: statMod,
                force3D: true
            });
            success = rollRes.success;
        } else {
            success = Math.random() * 100 < chance;
        }

        const archetype = enemy.getArchetype();

        if (!success) {
            const msg = hasTalk
                ? T('EnemyTalk.pet.refusesToFollow')
                : T('EnemyTalk.pet.wontApproach');
            window.skipLocalization = true;
            $gameMessage.add(msg);
            window.skipLocalization = false;
            this.closeTalkMenu();
            return;
        }

        // Name: the monster's own name, so a tamed creature is recognisable as
        // what it is instead of arriving under an archetype nickname the player
        // never chose. The Pets page renames it to anything they prefer.
        const petName = enemy.name();

        const sprite = this.resolveRecruitSprite(archetype, enemy.enemy().note);

        // Level: median of the current party (matches the party-join formula).
        const levels = $gameParty.members().map(m => m.level).sort((a, b) => a - b);
        const medianLevel = levels.length
            ? (levels.length % 2 === 0
                ? Math.floor((levels[levels.length / 2 - 1] + levels[levels.length / 2]) / 2)
                : levels[Math.floor(levels.length / 2)])
            : 1;

        const skillIds = [];
        for (const action of enemy.enemy().actions) {
            if (action.skillId > 0 && !skillIds.includes(action.skillId)) skillIds.push(action.skillId);
        }

        window.PetSystem.recruitPet({
            name: petName,
            characterName: sprite.characterName,
            characterIndex: sprite.characterIndex,
            isFollower: hasTalk,
            enemyId: enemy.enemyId(),
            enemyName: enemy.name(),
            level: medianLevel,
            archetype: archetype || null,
            note: enemy.enemy().note,
            skillIds,
        });

        AudioManager.playMe({ name: "Victory2", volume: 90, pitch: 100, pan: 0 });

        const typeWord = hasTalk ? T('EnemyTalk.pet.follower') : T('EnemyTalk.pet.pet');
        const joinedMsg = T('EnemyTalk.pet.joined', { name: petName, kind: typeWord });
        window.skipLocalization = true;
        $gameMessage.add(joinedMsg);
        window.skipLocalization = false;

        // Not killed: hide the enemy so no collapse/corpse plays, and stop the
        // fight (as a flee) only once the rest of the pack is down, exactly as
        // the party-join recruit path does. Leaving the field for good is what
        // makes BSE erase the source event, so the tamed creature does not stay
        // standing on the map beside the pet now following the party.
        enemy.hide();
        this.closeTalkMenu();
        if ($gameTroop.aliveMembers().length === 0) BattleManager.abort();
    };

    Scene_Battle.prototype.onTalkCancel = function () {
        this.closeTalkMenu();
    };

    Scene_Battle.prototype.closeTalkMenu = function () {
        TalkMenu.close(this._actorCommandWindow);

        if (this._talkInterpreter && this._talkInterpreter._waitMode === 'talk') {
            this._talkInterpreter.setWaitMode('');
            this._talkInterpreter = null;
        }

        this._actorCommandWindow.refresh();
        this._actorCommandWindow.show();
        if (this._actorCommandWindow.findSymbol && this._actorCommandWindow.findSymbol("talk") >= 0) {
            this._actorCommandWindow.selectSymbol("talk");
        }
        this._actorCommandWindow.activate();
        TouchInput.clear();
    };

    Scene_Battle.prototype.copyEnemySkillsToActor = function (enemy, actor) {
        const enemyActions = enemy.enemy().actions;

        const currentSkills = actor.skills().slice();
        for (const skill of currentSkills) {
            if (skill.id !== actor.attackSkillId() && skill.id !== actor.guardSkillId()) {
                actor.forgetSkill(skill.id);
            }
        }

        const addedSkills = new Set();
        for (const action of enemyActions) {
            if (action.skillId > 0 && !addedSkills.has(action.skillId)) {
                actor.learnSkill(action.skillId);
                addedSkills.add(action.skillId);
            }
        }
    };

    // A talk list left standing when input moves on (the next actor, the end of
    // the round, a battle finishing under the player) would leave the command
    // window holding rows that are no longer about anything. Same guard the
    // grapple menu keeps (Health_Monsters.js).
    const _SB_startActorCommandSelection_TALK = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function () {
        TalkMenu.close(this._actorCommandWindow);
        _SB_startActorCommandSelection_TALK.call(this);
    };

    const _SB_endCommandSelection_TALK = Scene_Battle.prototype.endCommandSelection;
    Scene_Battle.prototype.endCommandSelection = function () {
        TalkMenu.close(this._actorCommandWindow);
        _SB_endCommandSelection_TALK.call(this);
    };

})();