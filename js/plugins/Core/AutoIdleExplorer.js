/*:
 * @target MZ
 * @plugindesc v1.6.0 Auto Idle Explorer, the CPU explores for an idle player, and the party walks behind its leader.
 * @author esoteric-heavy-industries & Assistant
 *
 * @help AutoIdleExplorer.js
 *
 * Two independent features. The autopilot is an option on the Gameplay tab of
 * the Options menu; how the party walks is simply how it walks.
 *
 * ============================================================================
 * 1. THE PARTY ON THE MAP
 * ============================================================================
 *
 * The party walks the marching column RPG Maker ships with, and nothing else:
 * every member steps into the tile the one in front of them has just left, one
 * behind the other, in the leader's exact footsteps. There is no formation to
 * choose and nothing to configure.
 *
 * The loose party that used to live here, where every member walked the map on
 * their own, took up errands, washed, ate, and held conversations with the town
 * while the player was looking somewhere else, is gone. So is everything that
 * hung off it: the leash, the snap margin, the recall on a sprint, the bodies
 * that had to be pushed out of a doorway.
 *
 * What is kept is what does not depend on anybody leaving the column:
 *
 *   • PETS AND FOLLOWERS walk in the same column. The extra trailing slot owned
 *     by NPC/PetFollowerSystem.js (a pet, a child, or a creature that came
 *     along of its own accord) trails the party like everybody else.
 *   • A DOWNED MEMBER is carried rather than walked, as long as there are three
 *     bodies in the party to manage it: they are held on the carrier's tile,
 *     facing the way the carrier faces, until they come round.
 *   • TURN ROUND AND PRESS OK on the member behind you to open their Empathize
 *     panel, the same sheet the Dynamics roster opens. On the pet it is a short
 *     menu instead: a word with it if there is anybody home, a fuss made of it
 *     if there is not, and its own page either way.
 *   • THE BUBBLES over their heads stay. They are put there by the travelling
 *     banter (NPC/PartyBanter.js), and the Party Chatter option still turns
 *     them off.
 *   • Arriving anywhere, coming out of a battle or taking a transfer event, the
 *     party is put down around the leader and the column re-forms from there.
 *
 * The column stands down for a MAP BATTLE (BattleSystem/MapBattleMode.js),
 * where every member becomes a tactical battler that MapBattleMode walks
 * itself, tile by tile, and each one holds the ground it is fighting from.
 *
 * IN SPLIT-SCREEN (Multiplayer/SplitScreenMultiplayer.js) Player 2's own slot
 * is walked by their pad and drawn as the P2 avatar, with the follower slot
 * riding along hidden underneath it.
 *
 * ============================================================================
 * 1b. TAKING THE LEAD
 * ============================================================================
 *
 * Any member can be sent to walk in front of the party:
 *
 *   Tab           the next member down the marching order takes the lead
 *   Shift+Tab     the one before takes it
 *   L2 / R2 tap   the same from a pad. A trigger HELD is still the camera
 *                 zoom (Core/MousePan.js); only a tap changes the lead.
 *
 * The two of them SWAP BODIES rather than teleporting: they exchange tiles and
 * headings, so the party stands exactly where it stood and the player simply
 * finds themselves walking the other one. The camera then walks across from the
 * old leader to the new one instead of cutting.
 *
 * The order goes through PartyRoster.setLeader, the same call the Dynamics
 * roster makes, so the menu, the acting order and the diary all follow. It
 * works the other way too: promoting somebody from Dynamics -> Roster swaps the
 * bodies on the map exactly as Tab does.
 *
 * A fallen member is skipped, and the lead never changes hands in a vehicle, in
 * a map battle, in split-screen, or while an event or a message is running.
 *
 * ON THE WORLD MAP (map 315) it does not change hands at all. The party is one
 * dot there on a grid where a tile is a whole region: there is no second body
 * to swap with, so Tab, Shift+Tab and the triggers all do nothing.
 *
 * ============================================================================
 * 2. AUTO IDLE EXPLORER, default OFF
 * ============================================================================
 *
 * Adds an "Auto Idle Explorer" toggle to the Gameplay tab of the Options menu
 * (default OFF, persisted in the global config).
 *
 * When the option is ON and the player stands still on a normal map for more
 * than the configured number of seconds (default 5), the CPU takes over:
 *
 *   • It navigates the map with the engine's built-in A* pathfinding
 *     (the same routine the NPC system relies on for goal seeking).
 *   • It walks up to nearby events (NPCs, objects, doors) and interacts with
 *     them, preferring roaming enemy events so battles get started.
 *   • It advances dialogue boxes automatically (fast-forwarding the typewriter
 *     and tapping through each page), answers "Show Choices" with a random
 *     option, confirms number entry, and picks an item for "Select Item".
 *   • Battles are resolved automatically using each actor's auto-battle AI.
 *   • Between actions it keeps the party alive by casting healing skills or
 *     using healing items, and eats food when the party is hungry
 *     (when TimeDateSystem is present).
 *   • Best-effort: it leaves standard shop scenes after a moment.
 *
 * Needs & menu profiles: the CPU keeps a table of "menu profiles" describing
 * what each menu is FOR. Every think-cycle it reads the party's stats (HP,
 * hunger, sleep, gold, bounty) and walks the profiles by priority; the first
 * profile whose need is met is fulfilled. Built-in profiles cover healing
 * (spell, then a healing item applied directly), eating, and stat-gated
 * templates for the Cooking and Work menus. A menu is only opened when it is
 * genuinely needed AND the CPU can operate it, it never opens a menu just to
 * leave it unused.
 *
 * Menu compatibility: if the CPU triggers ANY menu it does not need, or cannot
 * drive, a custom plugin scene, or a DOM-overlay menu (quest log, Hypernet OS,
 * work board, bestiary, vending machine, etc.), it dismisses it generically so
 * exploration resumes. It does this by:
 *
 *   1. Asking a matching profile to close itself programmatically (most
 *      reliable), then
 *   2. Falling back to a synthetic Cancel/Escape keypress dispatched to the
 *      document. That press reaches both the engine's Input system and any
 *      plugin listening on `document` directly, matching the project standard
 *      that every menu closes on escape/cancel. If a menu still refuses to
 *      close after several tries, the autopilot relinquishes control.
 *
 * Teach the CPU about a menu by registering a profile once at load time. Give it
 * a stat-based need and how to open/operate it so the CPU uses it only when it
 * helps; add close for a clean exit:
 *
 *   AutoIdleExplorer.registerMenu({
 *       id: "myShop",
 *       purpose: "Buy potions when low on healing items.",
 *       need:   (s) => s.injured,              // stat-based: when to use it
 *       open:   () => MyPlugin.openShop(),     // how to open it
 *       drive:  (scene) => MyPlugin.autoBuy(), // operate it; false when done
 *       isOpen: () => MyPlugin.isOpen(),       // true while it owns the screen
 *       close:  () => MyPlugin.close(),        // optional clean dismissal
 *   });
 *
 * The stats object passed to need()/drive() exposes: injured, minHpRate, hunger,
 * hungerRate, hungry, sleep, gold, broke, bounty.
 *
 * The instant the player presses a movement key, confirm/cancel, or taps the
 * screen, control is handed straight back and the autopilot disengages until
 * the next idle period.
 *
 * Two-player split-screen: when SplitScreenMultiplayer.js has an active local
 * session and Player 2 sits idle for the same number of seconds, the CPU takes
 * over Player 2 as well, walking the P2 event around with A* pathfinding and
 * triggering nearby events (enemies first). It works by feeding synthetic input
 * into the split-screen manager, so every existing P2 rule (touch triggers,
 * action interaction, swimming, world-map distance limits) still applies. The
 * moment a real P2 key or gamepad input is used, Player 2 control is returned.
 *
 * Requires GameOptions.js for the menu entry (falls back to a plain option
 * row if GameOptions is not present). All other integrations are optional and
 * feature-detected, so the plugin is safe to load anywhere after GameOptions.
 *
 * Diagnostics: window.AutoIdleExplorer.why() reports, in one string, why the
 * autopilot is not currently driving (option off, a message up, an event
 * running, still counting idle frames, ...). window.AutoIdleExplorer.loose
 * exposes the loose party controller.
 *
 * ============================================================================
 * 3. REGROUPING ON COMMAND
 * ============================================================================
 *
 * Two plugin commands for an event that needs the party closed up before it
 * plays. Both of them HOLD the event: the command written under one does not
 * run until the walk is over.
 *
 *   Party Regroup      every member walks back to the leader and turns to face
 *                      them. A member with no way through is put beside the
 *                      leader once the walk has had its ten seconds.
 * Both are on window.AutoIdleExplorer.regroup too (party, pair, forStory,
 * busy), for a plugin with no event to write the command under: a written
 * scene calls forStory before its first bust.
 *
 *   Em / Bubba Regroup story mode only (switch 75). Whichever of the two the
 *                      player is not holding walks up to the one they are, and
 *                      the pair turn to face each other. The command waits for
 *                      the facing, not merely for the arrival, and does nothing
 *                      at all outside story mode or with either of them absent.
 *
 * @command PartyRegroup
 * @text Party Regroup
 * @desc Walks every party member back to the leader and waits here until they have all arrived.
 *
 * @command EmBubbaRegroup
 * @text Em / Bubba Regroup
 * @desc Story mode only. The other of the two walks up to the one being played, and the two turn to face each other. Waits until they do.
 *
 * @param looseChatter
 * @text Party Chatter
 * @desc Show the speech bubbles the party trades over their own heads while travelling.
 * @type boolean
 * @default true
 *
 * @param idleSeconds
 * @text Idle Seconds
 * @desc Seconds the player must be idle before the CPU takes over.
 * @type number
 * @min 1
 * @max 60
 * @default 5
 *
 * @param healThreshold
 * @text Heal Threshold (%)
 * @desc Heal a party member when its HP drops below this percentage.
 * @type number
 * @min 1
 * @max 100
 * @default 50
 *
 * @param hungerThreshold
 * @text Hunger Threshold (%)
 * @desc Eat food when hunger (Variable 54) drops below this percentage. Needs TimeDateSystem.
 * @type number
 * @min 0
 * @max 100
 * @default 35
 *
 * @param moneyFloor
 * @text Money Floor (gold)
 * @desc The CPU considers itself "broke" below this much gold (drives money-earning menus like Work). 0 disables.
 * @type number
 * @min 0
 * @default 200
 *
 * @param scanRadius
 * @text Interaction Scan Radius
 * @desc How many tiles around the player to scan for events to interact with.
 * @type number
 * @min 3
 * @max 30
 * @default 12
 *
 * @param showBadge
 * @text Show "AUTO" Badge
 * @desc Display a small on-screen badge while the CPU is in control.
 * @type boolean
 * @default true
 */

(() => {
    "use strict";

    const PLUGIN = "AutoIdleExplorer";
    const params = PluginManager.parameters(PLUGIN);
    const IDLE_FRAMES = Math.max(1, Math.round((Number(params.idleSeconds) || 5) * 60));
    const HEAL_RATE = (Number(params.healThreshold) || 50) / 100;
    const HUNGER_RATE = (Number(params.hungerThreshold) || 35) / 100;
    const SCAN_RADIUS = Number(params.scanRadius) || 12;
    const SHOW_BADGE = params.showBadge !== "false";
    const MONEY_FLOOR = Number(params.moneyFloor) || 0; // 0 = never "broke"

    const BOUNTY_VAR = 66; // Crime bounty (euros)

    // -------------------------------------------------------------- the party
    // The members walk the engine's own caterpillar behind the leader. All that
    // is left of the party's own voice is the bubble over a head, which the
    // travelling banter (NPC/PartyBanter.js) still puts there.
    const LOOSE_CHATTER = params.looseChatter !== "false";
    const BUBBLE_MS = 3400;   // how long one line of chatter stays up
    // A party that comments on everything talks over itself and over the town,
    // so a line is rationed: a member keeps quiet for a while after saying one,
    // and no two of them speak on top of each other.
    const CHATTER_COOL = 1500;   // frames before the same member says another (~25s)
    const CHATTER_GAP  = 420;    // frames between any two party lines (~7s)
    const IDLE_TALK_EVERY = 120; // frames between two rolls for a line at all
    const IDLE_TALK_ODDS = 0.16; // odds a roll turns into one

    // Watchdog / dismissal tuning for arbitrary external plugin menus.
    const BLOCK_LIMIT = 240;  // frames the map may stay un-drivable (no message,
                              // no detected overlay) before we poke Cancel.
    const MAX_DISMISS = 6;    // give up dismissing after this many tries → relinquish.
    const DISMISS_COOL = 45;  // frames between dismiss attempts (~0.75s).
    const KEYUP_DELAY = 5;    // frames a synthetic key is held before release.
    const OVERLAY_IGNORE = 1800; // frames an undismissable DOM element is ignored.
    const OVERLAY_MIN_AREA = 0.22; // of the viewport, before a node counts as a menu.
    const DEST_STALL = 60;    // frames a stale touch destination may block engaging.

    // ========================================================================
    // Menu profiles, the autopilot's understanding of what each menu is FOR.
    // ------------------------------------------------------------------------
    // Every entry teaches the CPU about one menu so it can decide, from the
    // party's current stats, whether it actually needs to use that menu. Fields
    // (all optional except a purpose to act on):
    //
    //   id        unique string id.
    //   label     short human name.
    //   purpose   one-line description of what the menu is for.
    //   priority  higher = considered first when several needs compete.
    //   need(s)   given a stats snapshot (see gatherStats), return true when the
    //             CPU genuinely needs this menu right now. No need → never used.
    //   act(s)    fulfil the need directly WITHOUT a menu (preferred when
    //             possible, e.g. casting a heal). Return true if it acted.
    //   open(s)   open the menu (push its scene / call its command).
    //   drive(sc) operate the OPEN menu toward the goal; return true while still
    //             working, false when finished (then it is closed). A menu is
    //             only opened proactively when it can be driven (has act, drive,
    //             or driven:true).
    //   driven    true if an existing scene hook already operates it (e.g. the
    //             built-in Scene_Menu/Scene_Item handlers).
    //   isOpen()  true while this menu owns the screen (for dismissal/driving).
    //   close()   dismiss it programmatically (else a synthetic Escape is used).
    //   cooldown  frames to wait before using this menu again (default 1800/30s).
    //   enabled   set false (or feature-detect) to skip the profile entirely.
    //
    // Plugins/menus can add their own at load time:
    //   AutoIdleExplorer.registerMenu({
    //       id: "myMenu", purpose: "…", need: s => s.broke,
    //       isOpen: () => MyUI.visible, open: () => MyUI.show(),
    //       drive: () => MyUI.step(), close: () => MyUI.hide(),
    //   });
    // Unknown DOM overlays / custom scenes are still dismissed generically with
    // a synthetic Cancel/Escape keypress even without a profile.
    // ========================================================================
    const MENU_PROFILES = [];

    // ========================================================================
    // Menu navigation state, tracks the CPU's journey through Scene_Menu/Item.
    // ========================================================================
    const MenuNav = {
        intent: null,        // 'item' | null
        targetItem: null,    // $dataItems entry to use
        targetMember: null,  // Game_Actor to target
        phase: 'idle',       // 'idle'|'command'|'category'|'item'|'actor'|'done'
        delay: 0,
        timeout: 0,

        clear() {
            this.intent = null;
            this.targetItem = null;
            this.targetMember = null;
            this.phase = 'idle';
            this.delay = 0;
            this.timeout = 0;
        },
    };

    // ========================================================================
    // ConfigManager persistence. The autopilot is off by default. The party
    // has no formation setting: it walks loose, and always did by default.
    // ========================================================================
    ConfigManager.autoIdle = false;

    const _makeData = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _makeData.call(this);
        config.autoIdle = this.autoIdle;
        return config;
    };

    const _applyData = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _applyData.call(this, config);
        this.autoIdle = config.autoIdle !== undefined ? config.autoIdle : false;
    };

    // ========================================================================
    // Options menu entry (Gameplay tab).
    // ========================================================================
    // The label is passed as a function so the row re-reads itself when the
    // player changes language without leaving the menu.
    if (window.GameOptions && typeof GameOptions.registerOption === "function") {
        GameOptions.registerOption(
            "autoIdle",
            () => T('AutoIdle.optionName'),
            () => ConfigManager.autoIdle,
            (value) => { ConfigManager.autoIdle = value; if (!value) AutoIdle.disengage(); },
            "gameplay",
            "boolean"
        );
        const tab = GameOptions.tabs.find((t) => t.id === "gameplay");
        if (tab && !tab.symbols.includes("autoIdle")) tab.symbols.push("autoIdle");
    } else {
        // Fallback: append to the vanilla options list.
        const _addGeneral = Window_Options.prototype.addGeneralOptions;
        Window_Options.prototype.addGeneralOptions = function () {
            _addGeneral.call(this);
            this.addCommand(T('AutoIdle.optionName'), "autoIdle");
        };
    }

    // ========================================================================
    // Helpers
    // ========================================================================
    function onDrivableMap() {
        return (
            SceneManager._scene instanceof Scene_Map &&
            !!$gameMap &&
            !!$gamePlayer &&
            !$gameMap.isEventRunning() &&
            !$gameMessage.isBusy() &&
            !$gamePlayer.isTransferring() &&
            $gamePlayer.canMove()
        );
    }

    function manualInputDetected() {
        if (Input.dir4 !== 0) return true;
        if (Input.isPressed("ok") || Input.isTriggered("ok")) return true;
        if (Input.isTriggered("cancel") || Input.isTriggered("escape") || Input.isTriggered("menu")) return true;
        if (Input.isPressed("shift")) return true;
        if (TouchInput.isPressed() || TouchInput.isTriggered()) return true;
        return false;
    }

    // Does this DOM element really own the screen? The centre hit-test alone is
    // far too eager: anything the project draws over the map that happens to
    // accept the pointer reads as "a menu is open", and the autopilot then
    // spends its life trying to close the game itself and finally hands control
    // back. A menu is a node that is visible, sits over the map, and covers a
    // real share of the viewport, so the search walks up from the hit element
    // (which is usually a label inside the panel) looking for that footprint.
    function looksLikeOverlay(el) {
        if (typeof window === "undefined" || !el) return false;
        if (el === document.body || el === document.documentElement) return false;
        if (el.tagName === "CANVAS" || el.tagName === "VIDEO") return false;
        if (el.id === "gameCanvas" || el.id === "gameVideo" || el.id === "errorPrinter") return false;
        const vw = window.innerWidth || Graphics.width || 816;
        const vh = window.innerHeight || Graphics.height || 624;
        for (let node = el; node && node !== document.body; node = node.parentElement) {
            if (node.tagName === "CANVAS") return false;
            let style = null;
            try {
                style = window.getComputedStyle(node);
            } catch (e) {
                style = null;
            }
            if (style) {
                if (style.display === "none" || style.visibility === "hidden") return false;
                if (Number(style.opacity) === 0) return false;
            }
            const r = node.getBoundingClientRect();
            if (r.width * r.height >= vw * vh * OVERLAY_MIN_AREA) return true;
        }
        return false;
    }

    function tilePassable(x, y) {
        if (!$gameMap.isValid(x, y)) return false;
        if ($gameMap.regionId(x, y) === 10) return false;
        return [2, 4, 6, 8].some((d) => $gameMap.isPassable(x, y, d));
    }

    // Cardinal direction (2/4/6/8) from one tile toward another, 0 if same tile.
    function dirBetween(fromX, fromY, toX, toY) {
        const dx = toX - fromX;
        const dy = toY - fromY;
        if (dx === 0 && dy === 0) return 0;
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : dy > 0 ? 2 : 8;
    }

    // An event we are willing to walk up to and trigger.
    function isInteractable(ev) {
        if (!ev || ev === $gamePlayer || ev._erased) return false;
        if (ev.isTransparent && ev.isTransparent()) return false;
        const page = ev.page && ev.page();
        if (!page) return false;
        // Action button / player touch / event touch only, never autorun/parallel.
        if (![0, 1, 2].includes(ev._trigger)) return false;
        const list = ev.list && ev.list();
        if (!list || list.length <= 1) return false;
        // Skip fast-travel / menu-opening nodes we cannot drive.
        const name = (ev.event() && ev.event().name) || "";
        if (/teleport|fast\s*travel/i.test(name)) return false;
        // Another player's body in a network session is theirs to walk, not
        // ours to talk to (Multiplayer/MultiplayerSystem.js).
        if (window.MultiplayerRemote && window.MultiplayerRemote.isRemoteEvent(ev)) return false;
        return true;
    }

    // Prefer enemy events so battles get started.
    function isEnemyEvent(ev) {
        const name = (ev.event() && ev.event().name) || "";
        const note = (ev.event() && ev.event().note) || "";
        if (/enemy|monster|slime|beast|foe|bandit|wolf|spider|skab|ghoul|zombie/i.test(name + " " + note)) {
            return true;
        }
        const page = ev.page && ev.page();
        const list = page && page.list;
        if (list) {
            for (const cmd of list) {
                if (cmd.code === 301) return true; // Battle Processing
            }
        }
        return false;
    }

    // ------------------------------------------------------------------ heal
    function menuUsable(item) {
        return item && (item.occasion === 0 || item.occasion === 2);
    }

    function recoversHp(item) {
        if (!item || !item.effects) return false;
        return item.effects.some(
            (e) => e.code === Game_Action.EFFECT_RECOVER_HP && (e.value1 > 0 || e.value2 > 0)
        );
    }

    function applyMenuAction(user, item, targetActor, isItem) {
        try {
            const action = new Game_Action(user);
            action.setItemObject(item);
            if (targetActor && action.isForOne && action.isForOne() && !action.isForUser()) {
                action.setTarget(targetActor.index());
            }
            const targets = action.makeTargets();
            user.useItem(item); // pays skill MP/TP cost
            for (const t of targets) action.apply(t);
            action.applyGlobal();
            if (isItem) $gameParty.consumeItem(item);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ food
    function foodItem() {
        for (const item of $gameParty.items()) {
            const meta = item && item.meta;
            if (!meta) continue;
            if (meta.calories || (meta.Category && /food/i.test(String(meta.Category)))) {
                return item;
            }
        }
        return null;
    }

    function tryEat() {
        const leader = $gameParty.leader();
        if (!leader || typeof leader.addHunger !== "function") return false;
        // TimeDateSystem stores hunger on the actor, not in Variable 54.
        const hunger = typeof leader.hunger === "function" ? leader.hunger() : 0;
        const max = (window.TimeDateSystem && window.TimeDateSystem.maxHunger) || 100;
        if (hunger >= max * HUNGER_RATE) return false;
        const item = foodItem();
        if (!item) return false;
        const cal = Number(item.meta.calories) || 0;
        const pro = Number(item.meta.protein) || 0;
        const fat = Number(item.meta.fat) || 0;
        const recovery = cal * 0.1 + pro * 2.0 + fat * 1.5 || 20;
        leader.addHunger(recovery);
        $gameParty.consumeItem(item);
        return true;
    }

    function hasCookableIngredients() {
        // Cooking is enabled by carrying items 127-128, and combines two foods.
        if (!$gameParty.hasItem($dataItems[127]) && !$gameParty.hasItem($dataItems[128])) {
            return false;
        }
        let foods = 0;
        for (const item of $gameParty.items()) {
            const meta = item && item.meta;
            if (meta && (meta.calories || (meta.Category && /food/i.test(String(meta.Category))))) {
                foods += $gameParty.numItems(item);
                if (foods >= 2) return true;
            }
        }
        return false;
    }

    // The living party member most in need of healing (or null).
    function neediestMember() {
        let worst = null;
        for (const m of $gameParty.battleMembers()) {
            if (m.isAlive() && (!worst || m.hpRate() < worst.hpRate())) worst = m;
        }
        return worst;
    }

    // Heal the neediest member with any usable party skill. No menu, no battle.
    function healWithSkill() {
        const member = neediestMember();
        if (!member) return false;
        for (const caster of $gameParty.battleMembers()) {
            for (const skill of caster.skills()) {
                if (recoversHp(skill) && menuUsable(skill) && caster.canUse(skill)) {
                    return applyMenuAction(caster, skill, member, false);
                }
            }
        }
        return false;
    }

    // The first carried healing item, or null.
    function findHealItem() {
        for (const item of $gameParty.items()) {
            if (recoversHp(item) && menuUsable(item) && $gameParty.numItems(item) > 0) return item;
        }
        return null;
    }

    // ------------------------------------------------------------- stats snapshot
    // One read of everything the needs system reasons about. Profiles receive
    // this so each menu's "do I need it?" check is a simple, declarative test.
    function gatherStats() {
        const party = $gameParty;
        const leader = party && party.leader();
        let injured = false;
        let minHpRate = 1;
        if (party) {
            for (const m of party.battleMembers()) {
                if (!m.isAlive()) continue;
                minHpRate = Math.min(minHpRate, m.hpRate());
                if (m.hpRate() < HEAL_RATE) injured = true;
            }
        }
        const maxHunger = (window.TimeDateSystem && window.TimeDateSystem.maxHunger) || 100;
        // TimeDateSystem stores hunger/sleep on the actor, not in Variables 54/55.
        const hunger = (leader && typeof leader.hunger === "function") ? Number(leader.hunger()) || 0 : maxHunger;
        const canEat = !!leader && typeof leader.addHunger === "function";
        const gold = party ? party.gold() : 0;
        return {
            injured,
            minHpRate,
            hunger,
            hungerRate: hunger / maxHunger,
            hungry: canEat && hunger < maxHunger * HUNGER_RATE,
            sleep: (leader && typeof leader.sleep === "function") ? Number(leader.sleep()) || 0 : 100,
            gold,
            broke: MONEY_FLOOR > 0 && gold < MONEY_FLOOR,
            bounty: $gameVariables ? Number($gameVariables.value(BOUNTY_VAR)) || 0 : 0,
        };
    }

    // ========================================================================
    // Built-in menu profiles. Edit/extend these (or call registerMenu) to teach
    // the CPU about more menus. Survival needs are fulfilled directly where the
    // engine allows; menus are only opened when a need cannot be met otherwise.
    // ========================================================================
    // i18n-ignore-start  label/purpose document the registerMenu contract;
    // nothing renders them, they are not display copy
    MENU_PROFILES.push(
        {
            id: "heal-skill",
            label: "Healing spell",
            purpose: "Restore a wounded ally's HP with a free skill, no menu needed.",
            priority: 100,
            need: (s) => s.injured,
            act: () => healWithSkill(),
        },
        {
            id: "heal-item",
            label: "Healing item",
            purpose: "Use a carried healing item directly when no spell can mend a wounded ally.",
            priority: 90,
            // Applied silently, never opens the main menu. This project's
            // ItemSystem replaces Scene_Item with a custom Scene_EnhancedItem
            // (ItemSystemInventory.js), so driving the vanilla item menu is not
            // possible, direct application is both reliable and unobtrusive.
            need: (s) => s.injured && !!findHealItem(),
            act: () => {
                const item = findHealItem();
                const member = neediestMember();
                if (!item || !member) return false;
                return applyMenuAction(member, item, member, true);
            },
        },
        {
            id: "eat",
            label: "Eat food",
            purpose: "Eat a carried food item to refill hunger.",
            priority: 80,
            need: (s) => s.hungry,
            act: () => tryEat(),
        },
        {
            id: "cook",
            label: "Cooking menu",
            purpose: "Combine ingredients into a meal when hungry but carrying no ready food.",
            priority: 70,
            // Feature-detected; opened only when hungry AND there is nothing to
            // eat AND two ingredients are on hand. Provide a `drive` (here or via
            // registerMenu) to let the CPU actually operate Scene_Cooking.
            get enabled() {
                return typeof Scene_Cooking !== "undefined";
            },
            need: (s) => s.hungry && !foodItem() && hasCookableIngredients(),
            open: () => SceneManager.push(Scene_Cooking),
            isOpen: () => SceneManager._scene instanceof Scene_Cooking,
        },
        {
            id: "work",
            label: "Work / Jobs",
            purpose: "Take a job to earn money when funds run low.",  // i18n-ignore-end
            priority: 60,
            get enabled() {
                return typeof Scene_Work !== "undefined";
            },
            need: (s) => s.broke,
            open: () => SceneManager.push(Scene_Work),
            isOpen: () => SceneManager._scene instanceof Scene_Work,
        }
    );

    // ========================================================================
    // AutoIdle controller
    // ========================================================================
    const AutoIdle = {
        engaged: false,
        idle: 0,
        frame: 0,
        think: 0,
        sameCount: 0,
        postDelay: 0,
        msgDelay: 0,
        intent: null, // 'target' | 'wander'
        target: null,
        destX: null,
        destY: null,
        recent: {},
        mapId: 0,
        blocked: 0,       // frames stuck on a non-drivable map with no message/overlay
        dismissTries: 0,  // attempts made to close the current external menu
        dismissCool: 0,   // cooldown between dismiss attempts
        keyUpTimer: 0,    // frames until a synthetic key is released
        needCooldown: {}, // per-profile id → frame before it may be used again
        driving: null,    // id of the menu profile currently being operated
        destStall: 0,     // frames a pending touch destination has sat unmoved
        _overlayIgnoreUntil: 0, // frame the DOM overlay heuristic wakes up again

        reset() {
            this.idle = 0;
        },

        engage() {
            if (this.engaged) return;
            this.engaged = true;
            this.intent = null;
            this.target = null;
            this.destX = this.destY = null;
            this.think = 0;
            this.sameCount = 0;
            this.postDelay = 0;
            this.msgDelay = 0;
            this.blocked = 0;
            this.dismissTries = 0;
            this.dismissCool = 0;
            this.driving = null;
            this.showBadge();
        },

        disengage() {
            if (!this.engaged) {
                this.idle = 0;
                return;
            }
            this.engaged = false;
            this.intent = null;
            this.target = null;
            this.destX = this.destY = null;
            this.idle = 0;
            this.destStall = 0;
            this.blocked = 0;
            this.dismissTries = 0;
            this.dismissCool = 0;
            this.driving = null;
            if ($gameTemp) $gameTemp.clearDestination();
            this.hideBadge();
        },

        // Called every frame from Scene_Map.update.
        updateOnMap() {
            this.frame++;

            if (this.mapId !== ($gameMap ? $gameMap.mapId() : 0)) {
                this.mapId = $gameMap ? $gameMap.mapId() : 0;
                this.recent = {};
                this.intent = null;
                this.target = null;
            }

            if (!ConfigManager.autoIdle) {
                this.disengage();
                return;
            }

            // A map battle (BattleSystem/MapBattleMode.js) is a fight the player
            // is playing on the map itself, with its own command menu, its own
            // tile cursor and its own message boxes. The autopilot cannot play
            // it and must not interfere with it: left engaged it would read the
            // talk panel as a stray menu and dismiss it, and auto-advance the
            // battle's own messages out from under the player.
            if (Loose.inMapBattle()) {
                this.disengage();
                this.idle = 0;
                return;
            }

            if (this.engaged) {
                this.updateEngaged();
                return;
            }

            // Not engaged yet: count idle frames (only on a clean, drivable map).
            if (!onDrivableMap()) {
                this.idle = 0;
                return;
            }
            if (manualInputDetected() || $gamePlayer.isMoving()) {
                this.idle = 0;
                this.destStall = 0;
                return;
            }
            // A pending touch destination means the player is still walking
            // somewhere. One the player can no longer reach never clears itself,
            // though, and would hold the idle counter at zero for the rest of the
            // session, so a destination nobody is moving toward is dropped.
            if ($gameTemp.isDestinationValid()) {
                if (++this.destStall < DEST_STALL) {
                    this.idle = 0;
                    return;
                }
                $gameTemp.clearDestination();
            }
            this.destStall = 0;
            if (++this.idle >= IDLE_FRAMES) this.engage();
        },

        // Why the autopilot is not driving right now, in one line. A console
        // diagnostic (AutoIdleExplorer.why()), never rendered anywhere.
        // i18n-ignore-start
        why() {
            if (!ConfigManager.autoIdle) return "the option is off";
            if (Loose.inMapBattle()) return "a map battle is running";
            if (this.engaged) return "engaged";
            if (!(SceneManager._scene instanceof Scene_Map)) return "not on the map";
            if (!$gameMap || !$gamePlayer) return "the map is not ready";
            if ($gameMessage.isBusy()) return "a message is up";
            if ($gameMap.isEventRunning()) return "an event is running";
            if ($gamePlayer.isTransferring()) return "the player is transferring";
            if (!$gamePlayer.canMove()) return "the player cannot move";
            if (manualInputDetected()) return "input is being held";
            if ($gamePlayer.isMoving()) return "the player is moving";
            if ($gameTemp.isDestinationValid()) return "a touch destination is pending";
            return "counting idle frames (" + this.idle + "/" + IDLE_FRAMES + ")";
        },
        // i18n-ignore-end

        // True when the player is deliberately taking over. While we are holding
        // a synthetic key to dismiss a menu (keyUpTimer > 0) that key would read
        // back as input, so it must not count as a takeover.
        userOverride() {
            return this.keyUpTimer === 0 && manualInputDetected();
        },

        // Engaged update: arbitrate between driving messages, dismissing any
        // external plugin menu we triggered, and exploring the map.
        updateEngaged() {
            // 1) A "Show Text" / "Show Choices" / number / item prompt keeps the
            //    map busy, drive those windows ourselves. A clear takeover
            //    gesture (movement, cancel/menu) still hands control back; the
            //    confirm key is left alone here since it merely advances text.
            if ($gameMessage.isBusy()) {
                if (
                    this.keyUpTimer === 0 &&
                    (Input.dir4 !== 0 ||
                        Input.isTriggered("cancel") ||
                        Input.isTriggered("escape") ||
                        Input.isTriggered("menu") ||
                        Input.isPressed("shift"))
                ) {
                    this.disengage();
                    return;
                }
                this.driveMessages();
                return;
            }

            // 2) A custom plugin menu (DOM overlay, custom scene, or known
            //    profile) is on top of the map. If the CPU actually needs this
            //    menu and knows how to operate it, drive it; otherwise dismiss it
            //    so exploration resumes. This both makes the autopilot compatible
            //    with *any* menu plugin and lets it USE the ones it needs.
            const menu = this.detectExternalMenu();
            if (menu) {
                if (this.userOverride()) {
                    this.disengage();
                    return;
                }
                if (this.driveMenu(menu)) return;
                this.dismissMenu(menu);
                return;
            }

            // 3) Open map: any deliberate input hands control straight back.
            if (this.userOverride()) {
                this.disengage();
                return;
            }

            // 4) Transiently un-drivable (transfer, a brief event running, etc.).
            //    Wait it out; if it persists, just relinquish, sendCancelKey on
            //    Scene_Map opens the main menu instead of closing anything.
            //    A map transfer (including slow procedural map loads, which can
            //    take well over BLOCK_LIMIT frames) must NOT disengage: auto mode
            //    persists across maps and resumes once the new map is drivable.
            if (!onDrivableMap()) {
                this.idle = 0;
                if ($gamePlayer && $gamePlayer.isTransferring()) {
                    this.blocked = 0;
                    return;
                }
                if (++this.blocked > BLOCK_LIMIT) {
                    this.blocked = 0;
                    this.disengage();
                }
                return;
            }

            this.blocked = 0;
            this.dismissTries = 0;
            this.driving = null;
            this.drive();
        },

        // Detect a menu/overlay the autopilot cannot drive. Returns a registry
        // entry, a generic overlay descriptor, or null.
        detectExternalMenu() {
            // Known profiles first, programmatic detection is most reliable.
            for (const m of MENU_PROFILES) {
                if (!m || !m.isOpen) continue;
                try {
                    if (m.isOpen()) return m;
                } catch (e) {
                    /* a misbehaving detector must not break the autopilot */
                }
            }
            // Heuristic: a DOM element that owns the screen centre means a plugin
            // overlay/menu is sitting on top of the map. Passive HUDs use
            // pointer-events:none (so elementFromPoint skips them), render layers
            // (lighting, fog, parallax) are <canvas> (excluded), and looksLikeOverlay
            // then insists on a panel-sized footprint, which keeps this from
            // firing on ordinary map decoration.
            // The elementFromPoint hit-test forces a layout, so it's throttled to
            // every 15 frames; the result is cached in between. An element that
            // repeatedly refused to close is ignored for a while (see dismissMenu),
            // since at that point it is almost certainly not a menu at all.
            if (typeof document !== "undefined" && document.elementFromPoint) {
                if (this.frame < (this._overlayIgnoreUntil || 0)) return null;
                const fc = (typeof Graphics !== "undefined" && Graphics.frameCount) || 0;
                if (fc - (this._extMenuDomFrame || -999) >= 15) {
                    this._extMenuDomFrame = fc;
                    const w = window.innerWidth || (typeof Graphics !== "undefined" && Graphics.width) || 816;
                    const h = window.innerHeight || (typeof Graphics !== "undefined" && Graphics.height) || 624;
                    let el = null;
                    try {
                        el = document.elementFromPoint(w >> 1, h >> 1);
                    } catch (e) {
                        el = null;
                    }
                    this._extMenuDomCache =
                        el && el !== this._badge && looksLikeOverlay(el)
                            ? { name: "overlay", el, close: null }
                            : null;
                }
                if (this._extMenuDomCache) return this._extMenuDomCache;
            }
            return null;
        },

        // Operate an open menu the CPU needs and knows how to drive. Returns
        // true while it is still being driven (caller should wait), false when
        // it is finished or undrivable (caller should dismiss it).
        driveMenu(menu) {
            if (!menu || typeof menu.drive !== "function") return false;
            // Only START driving a menu the CPU genuinely needs; once started we
            // see it through until its drive() reports completion.
            if (this.driving !== menu.id) {
                let needed = true;
                try {
                    needed = menu.need ? !!menu.need(gatherStats()) : true;
                } catch (e) {
                    needed = true;
                }
                if (!needed) return false;
            }
            let busy = false;
            try {
                busy = !!menu.drive(SceneManager._scene);
            } catch (e) {
                busy = false;
            }
            if (busy) {
                this.driving = menu.id;
                this.dismissTries = 0; // making progress, reset the give-up counter
                return true;
            }
            this.driving = null;
            return false;
        },

        // Try to close the given menu. Paced so we never hammer it every frame;
        // after MAX_DISMISS failed attempts we hand control back to the player.
        dismissMenu(menu) {
            if (this.dismissCool > 0) {
                this.dismissCool--;
                return;
            }
            if (this.dismissTries >= MAX_DISMISS) {
                // Out of ideas. A real scene we cannot leave means handing control
                // back. An unrecognised DOM element on the map that will not close
                // is far more likely to be something the project simply draws
                // there, so it is written off for a while and exploration carries
                // on rather than the autopilot quietly switching itself off.
                if (menu && menu.name === "overlay" && SceneManager._scene instanceof Scene_Map) {
                    this._overlayIgnoreUntil = this.frame + OVERLAY_IGNORE;
                    this._extMenuDomCache = null;
                    this.dismissTries = 0;
                    return;
                }
                this.disengage();
                return;
            }
            this.dismissTries++;
            this.dismissCool = DISMISS_COOL;

            // Prefer a registered programmatic close.
            if (menu && typeof menu.close === "function") {
                try {
                    menu.close();
                    return;
                } catch (e) {
                    /* fall through to the universal keypress */
                }
            }

            // Universal fallback: a synthetic Cancel/Escape keypress. It reaches
            // the engine's Input system (so any menu polling Input.isTriggered
            // ('cancel'/'escape') closes) AND any plugin listening on `document`
            // directly, matching the project standard that every menu dismiss
            // on escape/cancel. It is safe on Scene_Map too: this project opens
            // the pause menu from "menu" (gamepad Y), Tab and right-click, never
            // from Escape, which the engine maps to "escape" alone.
            this.sendCancelKey();
        },

        // Dispatch a low-level keyboard event to the document so both the engine
        // and DOM-listening plugins observe it.
        dispatchKey(type, keyCode, key) {
            if (typeof KeyboardEvent === "undefined" || typeof document === "undefined") return;
            let e;
            try {
                e = new KeyboardEvent(type, { bubbles: true, cancelable: true, key, code: key });
            } catch (err) {
                return;
            }
            // KeyboardEvent ignores keyCode/which in its constructor, but the
            // engine's Input handler reads them, patch them back in.
            Object.defineProperty(e, "keyCode", { get: () => keyCode });
            Object.defineProperty(e, "which", { get: () => keyCode });
            document.dispatchEvent(e);
        },

        // Press Escape (which the engine also treats as Cancel), holding it for a
        // few frames so Input.update() registers the press before it is released.
        sendCancelKey() {
            this.dispatchKey("keydown", 27, "Escape");
            this.keyUpTimer = KEYUP_DELAY;
        },

        drive() {
            if (this.postDelay > 0) {
                this.postDelay--;
                return;
            }
            if ($gamePlayer.isMoving()) {
                this.sameCount = 0;
                return;
            }

            // Opportunistic: if the player is in contact with a "Door" event and
            // already facing it, walk through it (start it) so the autopilot can
            // move between maps the way a player would.
            if (this.tryDoorInFront()) return;

            if (this.intent) {
                if (this.intent === "target" && this.target) {
                    if (!isInteractable(this.target)) {
                        this.abandonIntent();
                    } else if (this.adjacent(this.target)) {
                        this.interact(this.target);
                        return;
                    } else if (++this.sameCount < 24) {
                        // Walk the player directly via A* rather than relying on
                        // $gameTemp.setDestination (touch-move), which this project
                        // can suppress, leaving P1 engaged but standing still.
                        if (this.destX !== null && this.stepToward(this.destX, this.destY)) {
                            this.sameCount = 0;
                        }
                        return;
                    } else {
                        this.abandonIntent();
                    }
                } else {
                    // wandering: arrived or blocked
                    if (this.destX !== null && $gamePlayer.x === this.destX && $gamePlayer.y === this.destY) {
                        this.abandonIntent();
                    } else if (++this.sameCount < 24) {
                        if (this.destX !== null && this.stepToward(this.destX, this.destY)) {
                            this.sameCount = 0;
                        }
                        return;
                    } else {
                        this.abandonIntent();
                    }
                }
            }

            if (this.think > 0) {
                this.think--;
                return;
            }
            this.think = 8;

            if (this.tryNeeds()) return;
            this.pickGoal();
        },

        // Stat-driven needs. Reads the party's stats once, then walks the menu
        // profiles from highest priority down: the first profile whose need is
        // met is fulfilled, directly via act() when possible, otherwise by
        // opening a menu the CPU knows how to operate. Returns true if it acted.
        tryNeeds() {
            const stats = gatherStats();
            const profiles = MENU_PROFILES.slice().sort(
                (a, b) => (b.priority || 0) - (a.priority || 0)
            );
            for (const p of profiles) {
                if (this.profileEnabled(p) === false) continue;
                if ((this.needCooldown[p.id] || 0) > this.frame) continue;
                let needed = false;
                try {
                    needed = p.need ? !!p.need(stats) : false;
                } catch (e) {
                    needed = false;
                }
                if (!needed) continue;

                // 1) Direct fulfilment (no menu) is always preferred.
                if (typeof p.act === "function") {
                    try {
                        if (p.act(stats)) {
                            this.setNeedCooldown(p);
                            return true;
                        }
                    } catch (e) {
                        /* ignore and try the next profile */
                    }
                    continue;
                }

                // 2) Otherwise open the menu, but only if the CPU can actually
                //    operate it (an existing handler, or a drive()), so it never
                //    opens a menu just to have it auto-closed unused.
                if (typeof p.open === "function" && (p.driven || typeof p.drive === "function")) {
                    try {
                        p.open(stats);
                        this.driving = p.id;
                        this.setNeedCooldown(p);
                        return true;
                    } catch (e) {
                        /* opening failed, move on */
                    }
                }
                // Needed but not operable: the CPU understands the menu's
                // purpose but has no safe way to use it, so it does nothing.
            }
            return false;
        },

        profileEnabled(p) {
            try {
                return p.enabled !== false;
            } catch (e) {
                return true;
            }
        },

        setNeedCooldown(p) {
            this.needCooldown[p.id] = this.frame + (p.cooldown || 1800);
        },

        // Advance the active message / answer the active prompt. Returns true
        // while something is still being handled. Paced by msgDelay so dialogue
        // stays on screen for a beat instead of flashing past instantly.
        driveMessages() {
            const scene = SceneManager._scene;
            if (!(scene instanceof Scene_Map)) return false;

            if (this.msgDelay > 0) {
                this.msgDelay--;
                return true;
            }

            // 1) Show Choices, pick a random valid option (cancel if empty).
            const choice = scene._choiceListWindow;
            if (choice && choice.active) {
                const max = choice.maxItems ? choice.maxItems() : 0;
                if (max > 0) {
                    choice.select(Math.floor(Math.random() * max));
                    if (choice.processOk) choice.processOk();
                } else if (choice.processCancel) {
                    choice.processCancel();
                }
                this.msgDelay = 40;
                return true;
            }

            // 2) Number input, accept the current value.
            const num = scene._numberInputWindow;
            if (num && num.active) {
                if (num.processOk) num.processOk();
                this.msgDelay = 40;
                return true;
            }

            // 3) Select Item, take the first match, or cancel if none.
            const item = scene._eventItemWindow;
            if (item && item.active) {
                if (item.maxItems && item.maxItems() > 0) {
                    item.select(0);
                    if (item.processOk) item.processOk();
                } else if (item.processCancel) {
                    item.processCancel();
                }
                this.msgDelay = 40;
                return true;
            }

            // 4) Plain text, fast-forward the typewriter, then tap through each
            // page exactly the way Window_Message.updateInput would on "ok".
            const mw = scene._messageWindow;
            if (mw && $gameMessage.isBusy()) {
                if (mw.pause) {
                    mw.pause = false;
                    if (!mw._textState && mw.terminateMessage) {
                        mw.terminateMessage();
                    }
                    this.msgDelay = 24;
                } else {
                    mw._showFast = true;
                }
                return true;
            }

            return $gameMessage.isBusy();
        },

        adjacent(ev) {
            return Math.abs(ev.x - $gamePlayer.x) + Math.abs(ev.y - $gamePlayer.y) <= 1;
        },

        // Trigger a "Door" event the player is in contact with and facing. The
        // door tile is the one directly in front of the player; if an event named
        // "Door" sits there we face it and start it. Returns true if one fired.
        tryDoorInFront() {
            const dir = $gamePlayer.direction();
            const fx = $gamePlayer.x + (dir === 6 ? 1 : dir === 4 ? -1 : 0);
            const fy = $gamePlayer.y + (dir === 2 ? 1 : dir === 8 ? -1 : 0);
            for (const ev of $gameMap.eventsXy(fx, fy)) {
                if (!isInteractable(ev)) continue;
                const name = (ev.event() && ev.event().name) || "";
                if (!/\bdoor\b/i.test(name)) continue;
                $gamePlayer.setDirection(dir);
                this.recent[this.recentKey(ev)] = this.frame;
                try {
                    ev.start();
                } catch (e) {
                    /* door refused to start, ignore */
                }
                this.postDelay = 20;
                this.abandonIntent();
                return true;
            }
            return false;
        },

        // Step the player one tile toward (x, y) using the engine's A* path,
        // moving $gamePlayer directly instead of through $gameTemp destination
        // (touch-move). Returns true if a move was actually started.
        stepToward(x, y) {
            if (!$gamePlayer || $gamePlayer.isMoving() || !$gamePlayer.canMove()) return false;
            const dir = $gamePlayer.findDirectionTo(x, y);
            if (dir > 0) {
                $gamePlayer.executeMove(dir);
                return $gamePlayer.isMovementSucceeded();
            }
            return false;
        },

        recentKey(ev) {
            return this.mapId + ":" + ev.eventId();
        },

        interact(ev) {
            const dx = ev.x - $gamePlayer.x;
            const dy = ev.y - $gamePlayer.y;
            if (dx !== 0 || dy !== 0) {
                const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : dy > 0 ? 2 : 8;
                $gamePlayer.setDirection(dir);
            }
            this.recent[this.recentKey(ev)] = this.frame;
            try {
                ev.start();
            } catch (e) {
                /* event refused to start, ignore */
            }
            this.postDelay = 20;
            this.intent = null;
            this.target = null;
            this.destX = this.destY = null;
            this.sameCount = 0;
            if ($gameTemp) $gameTemp.clearDestination();
        },

        abandonIntent() {
            if (this.intent === "target" && this.target) {
                this.recent[this.recentKey(this.target)] = this.frame;
            }
            this.intent = null;
            this.target = null;
            this.destX = this.destY = null;
            this.sameCount = 0;
            if ($gameTemp) $gameTemp.clearDestination();
        },

        pickGoal() {
            const candidates = this.scanEvents();
            if (candidates.length && Math.random() < 0.85) {
                // Weighted random among the nearest few, enemies first.
                const pick = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
                this.intent = "target";
                this.target = pick.ev;
                this.destX = pick.ev.x;
                this.destY = pick.ev.y;
                this.sameCount = 0;
                $gameTemp.setDestination(pick.ev.x, pick.ev.y);
                return;
            }
            this.wander();
        },

        scanEvents() {
            const px = $gamePlayer.x;
            const py = $gamePlayer.y;
            const out = [];
            for (const ev of $gameMap.events()) {
                if (!isInteractable(ev)) continue;
                const last = this.recent[this.recentKey(ev)];
                if (last && this.frame - last < 1800) continue; // 30s cooldown
                const dist = Math.abs(ev.x - px) + Math.abs(ev.y - py);
                if (dist > SCAN_RADIUS) continue;
                out.push({ ev, dist, enemy: isEnemyEvent(ev) });
            }
            // Enemies first, then by distance.
            out.sort((a, b) => (b.enemy - a.enemy) * 100 + (a.dist - b.dist));
            return out;
        },

        wander() {
            for (let i = 0; i < 16; i++) {
                const dist = 5 + Math.floor(Math.random() * 6);
                const ang = Math.random() * Math.PI * 2;
                const tx = Math.round($gamePlayer.x + Math.cos(ang) * dist);
                const ty = Math.round($gamePlayer.y + Math.sin(ang) * dist);
                if ((tx !== $gamePlayer.x || ty !== $gamePlayer.y) && tilePassable(tx, ty)) {
                    this.intent = "wander";
                    this.destX = tx;
                    this.destY = ty;
                    this.sameCount = 0;
                    $gameTemp.setDestination(tx, ty);
                    return;
                }
            }
            this.intent = null;
        },

        // -------------------------------------------------------------- badge
        showBadge() {
            if (!SHOW_BADGE || this._badge) return;
            const el = document.createElement("div");
            el.textContent = "AUTO";
            el.style.cssText =
                "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99;" +
                "padding:3px 12px;font:bold 13px monospace;letter-spacing:1px;" +
                "color:#ffe9b0;background:rgba(40,20,10,0.78);border:1px solid #b89d7c;" +
                "pointer-events:none;text-shadow:0 1px 2px #000;";
            document.body.appendChild(el);
            this._badge = el;
        },

        hideBadge() {
            if (this._badge) {
                if (this._badge.parentNode) this._badge.parentNode.removeChild(this._badge);
                this._badge = null;
            }
        },

        // Open Scene_Menu and navigate to the given item for the given actor.
        // Food is still handled silently (TimeDateSystem uses custom hunger calc).
        openMenuForItem(item, member) {
            if (MenuNav.intent) return; // already navigating
            MenuNav.intent = 'item';
            MenuNav.targetItem = item;
            MenuNav.targetMember = member;
            MenuNav.phase = 'command';
            MenuNav.delay = 0;
            MenuNav.timeout = 0;
            SceneManager.push(Scene_Menu);
        },

        shouldAutoBattle() {
            return ConfigManager.autoIdle && this.engaged;
        },

        driveBattle(scene) {
            try {
                if (!BattleManager.isInputting || !BattleManager.isInputting()) return;
                if (scene._partyCommandWindow && scene._partyCommandWindow.active && scene.commandFight) {
                    scene.commandFight();
                    return;
                }
                const actor = BattleManager.actor ? BattleManager.actor() : null;
                if (actor && typeof actor.makeAutoBattleActions === "function") {
                    actor.makeAutoBattleActions();
                    if (BattleManager.selectNextCommand) BattleManager.selectNextCommand();
                }
            } catch (e) {
                /* keep the battle running even if a custom system fights us */
            }
        },
    };

    // Public API: let any plugin teach the autopilot about its custom menu.
    // Accepts a full profile (see MENU_PROFILES docs). At minimum it should give
    // the CPU something to act on, a need + (act|open) for proactive use, and/or
    // isOpen + (drive|close) for when the CPU lands in the menu.
    AutoIdle.registerMenu = function (entry) {
        if (!entry || MENU_PROFILES.includes(entry)) return;
        if (
            typeof entry.isOpen !== "function" &&
            typeof entry.need !== "function" &&
            typeof entry.act !== "function"
        ) {
            return; // nothing actionable
        }
        if (!entry.id) entry.id = "menu_" + MENU_PROFILES.length;
        // Replace an existing profile sharing this id (lets projects override built-ins).
        const i = MENU_PROFILES.findIndex((p) => p.id === entry.id);
        if (i >= 0) MENU_PROFILES.splice(i, 1, entry);
        else MENU_PROFILES.push(entry);
    };

    // Expose the live profile table for inspection / configuration.
    AutoIdle.menuProfiles = MENU_PROFILES;

    // ========================================================================
    // Player 2 autopilot (SplitScreenMultiplayer integration)
    // ------------------------------------------------------------------------
    // When a local split-screen session is active and Auto Idle Explorer is on,
    // an idle Player 2 is taken over the same way Player 1 is: the CPU walks the
    // P2 event around the map with the engine's A* pathfinding, seeks out nearby
    // events (enemies first) and triggers them. Rather than move the P2 event
    // directly, it feeds synthetic input into SplitScreenManager.p2Input right
    // after the manager polls real input, so ALL of SplitScreen's existing P2
    // logic (touch triggers, action interaction, swimming, world-map limits)
    // is reused unchanged. The instant a real P2 key/stick is used, control is
    // handed straight back.
    // ========================================================================
    const P2Auto = {
        engaged: false,
        idle: 0,
        frame: 0,
        think: 0,
        sameCount: 0,
        postDelay: 0,
        intent: null, // 'target' | 'wander'
        target: null,
        destX: null,
        destY: null,
        recent: {},
        mapId: 0,
        _badge: null,

        ssm() {
            return window.SplitScreenManager;
        },

        p2() {
            const s = this.ssm();
            return s && s.p2Event;
        },

        // A real P2 input (keyboard/gamepad) is present this frame.
        manual(input) {
            return !!(
                input &&
                (input.up || input.down || input.left || input.right || input.action || input.dash || input.menu)
            );
        },

        clearIntent() {
            this.intent = null;
            this.target = null;
            this.destX = this.destY = null;
            this.sameCount = 0;
        },

        reset() {
            this.clearIntent();
            this.think = 0;
            this.postDelay = 0;
        },

        disengage() {
            this.engaged = false;
            this.idle = 0;
            this.reset();
            this.hideBadge();
        },

        // Wipe any synthetic input we previously injected so a frame we sit out
        // does not leave a key "held".
        clearInput(input) {
            if (!input) return;
            input.up = input.down = input.left = input.right = false;
            input.action = false;
            input.dash = false;
        },

        // Called right after SplitScreenManager.pollInput() each frame.
        afterPoll() {
            const s = this.ssm();
            if (!ConfigManager.autoIdle || !s || !s.active) {
                this.disengage();
                return;
            }
            if (!(SceneManager._scene instanceof Scene_Map)) return;

            const ev = this.p2();
            if (!ev) {
                this.disengage();
                return;
            }
            // P2 is driving or riding a vehicle: leave that to the player /
            // SplitScreen's own passenger logic.
            if (s.vehicleDriver || ev.opacity === 0) {
                this.disengage();
                return;
            }

            this.frame++;
            const mid = $gameMap ? $gameMap.mapId() : 0;
            if (this.mapId !== mid) {
                this.mapId = mid;
                this.recent = {};
                this.disengage();
            }

            const input = s.p2Input;
            if (this.manual(input)) {
                // Player took P2 back.
                this.engaged = false;
                this.idle = 0;
                this.reset();
                this.hideBadge();
                return;
            }

            // Cannot act while a message/event owns the map or during transfer.
            if (
                $gameMessage.isBusy() ||
                $gameMap.isEventRunning() ||
                !$gamePlayer ||
                $gamePlayer.isTransferring()
            ) {
                this.clearInput(input);
                return;
            }

            if (!this.engaged) {
                if (++this.idle >= IDLE_FRAMES) {
                    this.engaged = true;
                    this.showBadge();
                } else {
                    return;
                }
            }

            this.drive(ev, input);
        },

        drive(ev, input) {
            this.clearInput(input);

            if (this.postDelay > 0) {
                this.postDelay--;
                return;
            }
            if (ev.isMoving()) {
                this.sameCount = 0;
                return;
            }

            if (this.intent === "target" && this.target) {
                if (!isInteractable(this.target)) {
                    this.abandon();
                } else if (this.adjacent(ev, this.target)) {
                    this.interact(ev, this.target, input);
                    return;
                } else if (++this.sameCount < 30) {
                    const dir = ev.findDirectionTo(this.destX, this.destY);
                    if (dir > 0) {
                        this.setDir(input, dir);
                        return;
                    }
                    this.abandon();
                } else {
                    this.abandon();
                }
            } else if (this.intent === "wander") {
                if (ev.x === this.destX && ev.y === this.destY) {
                    this.clearIntent();
                } else if (++this.sameCount < 30) {
                    const dir = ev.findDirectionTo(this.destX, this.destY);
                    if (dir > 0) {
                        this.setDir(input, dir);
                        return;
                    }
                    this.clearIntent();
                } else {
                    this.clearIntent();
                }
            }

            if (this.think > 0) {
                this.think--;
                return;
            }
            this.think = 8;
            this.pickGoal(ev);
        },

        // Stop adjacent to a target, face it, and pulse the P2 action button so
        // SplitScreen's updateP2Movement starts the event in front of P2.
        interact(ev, target, input) {
            const dir = dirBetween(ev.x, ev.y, target.x, target.y);
            if (dir > 0) ev.setDirection(dir);
            this.recent[this.recentKey(target)] = this.frame;
            input.action = true; // single-frame pulse → isTriggered("action")
            this.postDelay = 20;
            this.clearIntent();
        },

        setDir(input, dir) {
            if (dir === 8) input.up = true;
            else if (dir === 2) input.down = true;
            else if (dir === 4) input.left = true;
            else if (dir === 6) input.right = true;
        },

        abandon() {
            if (this.intent === "target" && this.target) {
                this.recent[this.recentKey(this.target)] = this.frame;
            }
            this.clearIntent();
        },

        pickGoal(ev) {
            const candidates = this.scanEvents(ev);
            if (candidates.length && Math.random() < 0.85) {
                const pick = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
                this.intent = "target";
                this.target = pick.ev;
                this.destX = pick.ev.x;
                this.destY = pick.ev.y;
                this.sameCount = 0;
                return;
            }
            this.wander(ev);
        },

        scanEvents(ev) {
            const out = [];
            for (const e of $gameMap.events()) {
                if (e === ev) continue;
                if (!isInteractable(e)) continue;
                const last = this.recent[this.recentKey(e)];
                if (last && this.frame - last < 1800) continue; // 30s cooldown
                const dist = Math.abs(e.x - ev.x) + Math.abs(e.y - ev.y);
                if (dist > SCAN_RADIUS) continue;
                out.push({ ev: e, dist, enemy: isEnemyEvent(e) });
            }
            out.sort((a, b) => (b.enemy - a.enemy) * 100 + (a.dist - b.dist));
            return out;
        },

        wander(ev) {
            for (let i = 0; i < 16; i++) {
                const dist = 4 + Math.floor(Math.random() * 5);
                const ang = Math.random() * Math.PI * 2;
                const tx = Math.round(ev.x + Math.cos(ang) * dist);
                const ty = Math.round(ev.y + Math.sin(ang) * dist);
                if ((tx !== ev.x || ty !== ev.y) && tilePassable(tx, ty)) {
                    this.intent = "wander";
                    this.destX = tx;
                    this.destY = ty;
                    this.sameCount = 0;
                    return;
                }
            }
            this.intent = null;
        },

        recentKey(e) {
            return this.mapId + ":" + e.eventId();
        },

        adjacent(ev, t) {
            return Math.abs(ev.x - t.x) + Math.abs(ev.y - t.y) <= 1;
        },

        showBadge() {
            if (!SHOW_BADGE || this._badge) return;
            const el = document.createElement("div");
            el.textContent = T('AutoIdle.badge');
            el.style.cssText =
                "position:fixed;top:8px;right:8px;z-index:99;" +
                "padding:3px 12px;font:bold 13px monospace;letter-spacing:1px;" +
                "color:#b0e0ff;background:rgba(10,20,40,0.78);border:1px solid #7c9db8;" +
                "pointer-events:none;text-shadow:0 1px 2px #000;";
            document.body.appendChild(el);
            this._badge = el;
        },

        hideBadge() {
            if (this._badge) {
                if (this._badge.parentNode) this._badge.parentNode.removeChild(this._badge);
                this._badge = null;
            }
        },
    };

    // Install the P2 input post-poll hook once SplitScreenManager exists. Done
    // lazily (from the map update) so load order relative to SplitScreen does
    // not matter; wrapping the method directly guarantees we inject right after
    // the real poll and before updateP2Movement reads p2Input the same frame.
    AutoIdle.ensureP2Hook = function () {
        if (this._p2HookInstalled) return;
        const SSM = window.SplitScreenManager;
        if (!SSM || typeof SSM.pollInput !== "function") return;
        const original = SSM.pollInput;
        SSM.pollInput = function () {
            original.apply(this, arguments);
            try {
                P2Auto.afterPoll();
            } catch (e) {
                /* never break P2 input because the autopilot errored */
            }
        };
        this._p2HookInstalled = true;
    };

    AutoIdle.p2 = P2Auto;

    // ------------------------------------------------------------------------
    // Speech bubbles for the party. NPCConversation's own bubble manager
    // resolves its target by event name, and a follower is not an event, so this
    // is the same idea anchored on any Game_Character. It borrows
    // NPCConversation's stylesheet class outright, so a member's chatter reads
    // exactly like the town's.
    // ------------------------------------------------------------------------
    const Bubbles = {
        _pool: [],
        _live: [],

        _element() {
            const el = this._pool.pop();
            if (el) return el;
            const made = document.createElement("div");
            made.className = "npc-thought-bubble";
            document.body.appendChild(made);
            return made;
        },

        show(char, text) {
            if (!LOOSE_CHATTER || !char || !text) return;
            if (typeof document === "undefined") return;
            this.clearFor(char);
            const el = this._element();
            el.textContent = text;
            el.style.display = "block";
            el.style.visibility = ""; // a recycled element may have gone off-canvas
            el.classList.remove("fading");
            void el.offsetWidth; // restart the transition on a recycled element
            el.classList.add("visible");
            this._live.push({
                el, char, until: Date.now() + BUBBLE_MS,
                h: el.offsetHeight || 32,
                w: el.offsetWidth || 0,
            });
            this.update();
        },

        clearFor(char) {
            for (let i = this._live.length - 1; i >= 0; i--) {
                if (this._live[i].char === char) this._release(i);
            }
        },

        clear() {
            while (this._live.length) this._release(this._live.length - 1);
        },

        _release(i) {
            const b = this._live[i];
            this._live.splice(i, 1);
            b.el.classList.remove("visible", "fading");
            b.el.style.display = "none";
            this._pool.push(b.el);
        },

        // How tall the speaker is actually drawn. A flat one-tile guess is right
        // for a person on foot but far too short for a vehicle: those sheets are
        // several tiles high, so the bubble a driving party pops came out on top
        // of the hull it was meant to float above. The sprite is looked up once
        // per bubble and re-resolved whenever the spriteset is rebuilt.
        _spriteHeight(b) {
            const scene = SceneManager._scene;
            const spriteset = scene ? scene._spriteset : null;
            const list = spriteset ? spriteset._characterSprites : null;
            if (!list) return $gameMap.tileHeight();
            if (!b.sprite || b.sprite._character !== b.char || b.spriteset !== spriteset) {
                b.sprite = list.find((s) => s._character === b.char) || null;
                b.spriteset = spriteset;
            }
            const sprite = b.sprite;
            if (!sprite || !sprite.bitmap || !sprite.bitmap.isReady()) return $gameMap.tileHeight();
            const scale = sprite.scale ? Math.abs(sprite.scale.y) || 1 : 1;
            const h = sprite.patternHeight() * scale;
            return h > 0 ? h : $gameMap.tileHeight();
        },

        // Anchored off the character's own screen projection (so it tracks zoom,
        // jumps and camera shifts) and scaled onto the canvas' real on-page size.
        // The final top edge comes from NPCConversation's shared layout arbiter,
        // which is also what the town's thought bubbles claim against, so a
        // member talking next to an NPC stacks above them instead of over them.
        update() {
            if (!this._live.length) return;
            if (!(SceneManager._scene instanceof Scene_Map) || !$gameMap) {
                this.clear();
                return;
            }
            // Reading the canvas box forces a synchronous layout, and a dozen
            // overlays want it on the same frame, so it comes from the shared
            // frame budget (window.FrameBudget, Core/ParchmentToast.js) which
            // takes that hit once for all of them. Reading it here is the
            // fallback for when the budget has not loaded.
            let r = window.FrameBudget && window.FrameBudget.canvasRect();
            if (!r) {
                const canvas = document.getElementById("gameCanvas");
                r = canvas ? canvas.getBoundingClientRect() : null;
            }
            const sx = r ? r.width / Graphics.width : 1;
            const sy = r ? r.height / Graphics.height : 1;
            const ox = r ? r.left : 0;
            const oy = r ? r.top : 0;
            const now = Date.now();
            const layout = window.NPCBubbleLayout || null;
            // Oldest first, so a member's bubble keeps the spot it was given and
            // the newer ones stack clear of it. _live is already in that order,
            // but the release sweep has to run backwards, so do that separately.
            for (let i = this._live.length - 1; i >= 0; i--) {
                if (now >= this._live[i].until) this._release(i);
            }
            const zoom = ($gameScreen && $gameScreen.zoomScale()) || 1;
            const zx = $gameScreen ? $gameScreen.zoomX() : 0;
            const zy = $gameScreen ? $gameScreen.zoomY() : 0;
            for (const b of this._live) {
                const h = b.h || 32;
                // The spriteset is scaled about the zoom centre after the fact,
                // so screenX/Y have to go through the same transform to land on
                // the head they belong to (Core/MousePan.js).
                const x = (b.char.screenX() - zx) * zoom + zx;
                const y = (b.char.screenY() - this._spriteHeight(b) - zy) * zoom + zy;
                // A speaker who is off the canvas keeps their bubble but stops
                // drawing it, rather than having it clamped onto the edge.
                const out = x < 0 || x > Graphics.width || y < 0 || y > Graphics.height;
                if (b.hidden !== out) {
                    b.hidden = out;
                    b.el.style.visibility = out ? "hidden" : "";
                }
                if (out) continue;
                let left = Math.round(ox + x * sx);
                let top = Math.round(oy + y * sy - h - 16 * sy);
                if (layout) {
                    const slot = layout.place(b, left, top, b.w || 0, h, {
                        left: ox, right: ox + Graphics.width * sx,
                        top: oy, bottom: oy + Graphics.height * sy,
                    });
                    left = Math.round(slot.x);
                    top = Math.round(slot.y);
                }
                b.el.style.left = left + "px";
                b.el.style.top = top + "px";
            }
        },
    };

    // ========================================================================
    // Autonomous Romance Engine (Party Members & NPCs)
    // ========================================================================
    const NPCRomanceSystem = {
        _pairCooldowns: {},

        getCooldownKey(a, b) {
            return a < b ? `${a}|${b}` : `${b}|${a}`;
        },

        isOnCooldown(nameA, nameB, cooldownMs = 45000) {
            const key = this.getCooldownKey(nameA, nameB);
            const last = this._pairCooldowns[key];
            if (!last) return false;
            return (Date.now() - last) < cooldownMs;
        },

        setCooldown(nameA, nameB) {
            const key = this.getCooldownKey(nameA, nameB);
            this._pairCooldowns[key] = Date.now();
        },

        getEntityInfo(entity) {
            if (!entity) return null;
            if (typeof entity.actorId === "function") {
                const actor = entity;
                const name = actor.name();
                const gender = actor.gender ? actor.gender() : 0;
                const cls = actor.currentClass ? (actor.currentClass()?.name || '') : '';
                const traits = actor._selectedTraits || [];
                const isSynthetic = /cyborg|android|robot|machine|automaton/i.test(cls) ||
                    traits.some(t => /cyber|robot|synthetic|machine/i.test(t?.name || ''));
                const isBotanic = ($gameVariables && $gameVariables.value(87) === 3) ||
                    /plant|flora|dryad|treant|fungus/i.test(cls);
                const isNonSentient = (actor.currentClass && actor.currentClass()?.id >= 63) ||
                    (window.NPCEmpathize?._helpers?._isNonSentientActor?.(actor) ?? false);
                const charm = Math.max(-10, Math.min(14, Math.round(((actor.luk ?? 20) - 20) / 5) + Math.floor((actor.level ?? 1) / 8)));
                const needs = window.PartyNeeds ? window.PartyNeeds.getMemberNeeds(actor) : null;
                const hygiene = needs ? Number(needs.hygiene) || 100 : 100;
                const profile = window.NPCSocietyRegistry?.getProfile?.(name) || null;
                return {
                    isActor: true,
                    actor,
                    actorId: actor.actorId(),
                    name,
                    gender,
                    isSynthetic,
                    isBotanic,
                    isNonSentient,
                    charm,
                    hygiene,
                    profile,
                };
            }
            const name = entity.eventName || entity.name || (typeof entity === "string" ? entity : null);
            if (!name) return null;
            const profile = entity.profile || window.NPCSocietyRegistry?.getProfile?.(name) || $gameSystem?._npcSociety?.[name] || null;
            const gender = profile?.gender ?? 0;
            const traitIds = profile?.traitIds || [];
            const isSynthetic = traitIds.some(id => /cyber|robot|synthetic/i.test(String(id)));
            const isBotanic = traitIds.some(id => /plant|flora|botanic/i.test(String(id)));
            const isNonSentient = (profile?.classId >= 63) || (window.NPCEmpathize?._helpers?._isNonSentientNpc?.(profile) ?? false);
            const charm = Math.max(-8, Math.min(10, Math.round(((profile?.psi ?? 20) - 20) / 6)));
            const hygiene = profile?.hygiene ?? 100;
            return {
                isActor: false,
                actor: null,
                actorId: null,
                name,
                gender,
                isSynthetic,
                isBotanic,
                isNonSentient,
                charm,
                hygiene,
                profile,
            };
        },

        getOrientation(name, profile) {
            const Shared = window.NPCShared;
            const defaultOrient = { sexual: { key: 'bisexual' }, romantic: { key: 'biromantic' } };
            if (!name) return defaultOrient;
            const ov = profile?._orientOverride;
            if (ov?.sexualKey || ov?.romanticKey) {
                return {
                    sexual: { key: ov.sexualKey || 'bisexual' },
                    romantic: { key: ov.romanticKey || 'biromantic' }
                };
            }
            if (!Shared) return defaultOrient;
            const hashRom = (Shared.nameHash(name + '_romorient') ^ Shared.worldSeed()) % 100;
            const hashSex = (Shared.nameHash(name + '_sexorient') ^ Shared.worldSeed()) % 100;
            let romKey = 'heteroromantic';
            if (hashRom < 60) romKey = 'heteroromantic';
            else if (hashRom < 72) romKey = 'biromantic';
            else if (hashRom < 82) romKey = 'homoromantic';
            else if (hashRom < 90) romKey = 'panromantic';
            else if (hashRom < 94) romKey = 'demiromantic';
            else if (hashRom < 97) romKey = 'aromantic';
            else romKey = 'sapioromantic';

            let sexKey = 'heterosexual';
            if (hashSex < 60) sexKey = 'heterosexual';
            else if (hashSex < 72) sexKey = 'bisexual';
            else if (hashSex < 82) sexKey = 'homosexual';
            else if (hashSex < 90) sexKey = 'pansexual';
            else if (hashSex < 94) sexKey = 'demisexual';
            else if (hashSex < 97) sexKey = 'asexual';
            else sexKey = 'heterosexual';

            return { sexual: { key: sexKey }, romantic: { key: romKey } };
        },

        getRelationshipStanding(name, profile) {
            let partnered = false;
            let styleKey = 'single';
            if (window.NPCLifeSim) {
                try {
                    window.NPCLifeSim.ensureLifeRecord?.(name, profile?._homeGroupName);
                    const rec = window.NPCLifeSim.getRecord?.(name);
                    partnered = !!(rec && rec.partner);
                    if (rec && rec.maritalStatus) styleKey = rec.maritalStatus;
                } catch (_) {}
            }
            if (profile?._relStyleOverride) styleKey = profile._relStyleOverride;
            const exclusiveStyles = new Set(['monogamous', 'civil-union', 'arranged-marriage', 'long-distance', 'companionate', 'married']);
            const isTaken = partnered && exclusiveStyles.has(styleKey);
            const isAromantic = styleKey === 'aromantic-solo';
            return { partnered, styleKey, isTaken, isAromantic };
        },

        isSomewhatCompatible(suitor, target) {
            const s = this.getEntityInfo(suitor);
            const t = this.getEntityInfo(target);
            if (!s || !t) return false;
            if (s.name === t.name) return false;
            if (s.isNonSentient || t.isNonSentient) return false;

            // Party members toward other party members (except toward current party leader)
            if (s.isActor && t.isActor) {
                if ($gameParty && $gameParty.leader() && t.actor === $gameParty.leader()) {
                    return false;
                }
            }

            const sStanding = this.getRelationshipStanding(s.name, s.profile);
            const tStanding = this.getRelationshipStanding(t.name, t.profile);
            if (sStanding.isTaken || tStanding.isTaken) return false;
            if (sStanding.isAromantic || tStanding.isAromantic) return false;

            const sOrient = this.getOrientation(s.name, s.profile);
            const tOrient = this.getOrientation(t.name, t.profile);
            if (sOrient.romantic.key === 'aromantic' || tOrient.romantic.key === 'aromantic') return false;

            const sGender = s.gender;
            const tGender = t.gender;
            const isFluid = (g) => g === 2 || g === 3;

            if (!isFluid(sGender) && !isFluid(tGender)) {
                const sameGenderOrient = new Set(['homosexual', 'homoromantic']);
                const diffGenderOrient = new Set(['heterosexual', 'heteroromantic']);
                if (sameGenderOrient.has(tOrient.romantic.key) && sGender !== tGender) return false;
                if (diffGenderOrient.has(tOrient.romantic.key) && sGender === tGender) return false;
                if (sameGenderOrient.has(sOrient.romantic.key) && sGender !== tGender) return false;
                if (diffGenderOrient.has(sOrient.romantic.key) && sGender === tGender) return false;
            }

            if (tOrient.romantic.key === 'bubbaromantic' && !/bubba/i.test(s.name)) return false;
            if (tOrient.romantic.key === 'botromantic' && !s.isSynthetic) return false;
            if (tOrient.romantic.key === 'dendroromantic' && !s.isBotanic) return false;

            let opinion = 0;
            if (t.profile && s.actorId != null && t.profile.opinions) {
                opinion = Number(t.profile.opinions[s.actorId]) || 0;
            } else if (t.profile?.relationships?.[s.name]) {
                opinion = Number(t.profile.relationships[s.name].opinion) || 0;
            }
            if (opinion <= -60) return false;

            return true;
        },

        getActions() {
            return [
                {
                    id: 'flirt', label: 'Flirt', tier: 1, successDelta: 12, failDelta: -6,
                    lines: [
                        `"I was hoping I'd run into you, {name}."`,
                        `"Careful, {name}. I could get used to this."`,
                        `"You've been on my mind all day, {name}."`,
                    ],
                    repliesGood: [`*smiles softly* "Is that so?"`, `*laughs* "You're trouble."`, `*blushes* "Keep talking like that."`],
                    repliesBad: [`*looks away* "Let's keep this friendly."`, `*chuckles dryly* "Nice try."`, `*shakes head* "No."`]
                },
                {
                    id: 'admire', label: 'Admire', tier: 1, successDelta: 14, failDelta: -7,
                    lines: [
                        `"You're hard to look away from, {name}."`,
                        `"There's something striking about you, {name}."`,
                        `"You always brighten up the room, {name}."`,
                    ],
                    repliesGood: [`*beams* "Thank you, that's really sweet."`, `*grins* "You have good taste."`, `*winks* "Right back at you."`],
                    repliesBad: [`*shrugs* "Please, don't."`, `*frowns* "I'm busy."`, `*steps back* "That's enough."`]
                },
                {
                    id: 'serenade', label: 'Serenade', tier: 2, successDelta: 20, failDelta: -10,
                    lines: [
                        `takes a breath and hums a romantic tune for {name}.`,
                        `sings a poetic verse dedicated to {name}.`,
                    ],
                    repliesGood: [`*listens happily* "Nobody's ever done that for me."`, `*claps* "That was wonderful."`, `*blushes deeply* "You're too much."`],
                    repliesBad: [`*groans playfully* "Please stop, everyone is looking!"`, `*wiggles out* "Not the time."`, `*sighs* "A bit dramatic."`]
                },
                {
                    id: 'kiss', label: 'Playful Kiss', tier: 3, successDelta: 24, failDelta: -14,
                    lines: [
                        `leans in close and leaves a gentle kiss on {name}'s cheek.`,
                        `steps in close with a soft embrace for {name}.`,
                    ],
                    repliesGood: [`*eyes widen with a radiant smile* "Oh..."`, `*kisses back gently*`, `*holds close warmly*`],
                    repliesBad: [`*dodges and steps back* "Hey, hands off."`, `*scowls* "Too fast!"`, `*pushes away* "Not interested."`]
                },
                {
                    id: 'wink', label: 'Playful Wink', tier: 1, successDelta: 10, failDelta: -4,
                    lines: [
                        `gives {name} a playful wink across the way.`,
                        `flashes a teasing smile and a wink at {name}.`,
                    ],
                    repliesGood: [`*winks right back with a smirk*`, `*giggles and waves*`, `*smiles warmly*`],
                    repliesBad: [`*rolls eyes*`, `*looks the other way*`, `*blinks blankly*`]
                }
            ];
        },

        calculateChance(s, t, act) {
            let chance = 45;
            let attraction = 0;
            if (t.profile && s.actorId != null && t.profile.attractions) {
                attraction = Number(t.profile.attractions[s.actorId]) || 0;
            } else if (t.profile?.relationships?.[s.name]?.attraction != null) {
                attraction = Number(t.profile.relationships[s.name].attraction) || 0;
            }
            chance += Math.round(attraction * 0.45);

            let opinion = 0;
            if (t.profile && s.actorId != null && t.profile.opinions) {
                opinion = Number(t.profile.opinions[s.actorId]) || 0;
            } else if (t.profile?.relationships?.[s.name]?.opinion != null) {
                opinion = Number(t.profile.relationships[s.name].opinion) || 0;
            }
            chance += Math.round(opinion * 0.18);

            chance += (s.charm || 0);

            if (s.hygiene < 35) chance -= 10;
            if (t.hygiene < 35) chance -= 8;

            chance -= ((act.tier || 1) - 1) * 12;

            return Math.max(5, Math.min(95, Math.round(chance)));
        },

        executeRomance(suitorEntity, targetEntity, explicitAction = null) {
            const s = this.getEntityInfo(suitorEntity);
            const t = this.getEntityInfo(targetEntity);
            if (!s || !t) return null;
            if (!this.isSomewhatCompatible(s, t)) return null;

            this.setCooldown(s.name, t.name);

            const actions = this.getActions();
            const act = explicitAction || actions[Math.floor(Math.random() * actions.length)];
            const chance = this.calculateChance(s, t, act);
            const roll = 1 + Math.floor(Math.random() * 100);
            const success = roll <= chance;

            const delta = success ? act.successDelta : act.failDelta;
            const opDelta = success ? Math.max(1, Math.round(delta * 0.4)) : Math.min(-1, Math.round(delta * 0.4));

            if (t.profile) {
                if (s.actorId != null) {
                    if (window.NPCEmpathize?._helpers?._addNpcAttraction) {
                        window.NPCEmpathize._helpers._addNpcAttraction(t.profile, s.actorId, delta);
                        window.NPCEmpathize._helpers._addNpcOpinion(t.profile, s.actorId, opDelta);
                    } else {
                        t.profile.attractions = t.profile.attractions || {};
                        t.profile.opinions = t.profile.opinions || {};
                        t.profile.attractions[s.actorId] = (t.profile.attractions[s.actorId] || 0) + delta;
                        t.profile.opinions[s.actorId] = (t.profile.opinions[s.actorId] || 0) + opDelta;
                    }
                    (t.profile.eventLog ??= []).push({
                        tag: 'romance_' + act.id, desc: `${act.id} (${delta >= 0 ? '+' : ''}${delta})`,
                        timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
                    });
                } else {
                    t.profile.relationships = t.profile.relationships || {};
                    const rel = t.profile.relationships[s.name] || { meetCount: 1, opinion: 0, attraction: 0 };
                    rel.attraction = (rel.attraction || 0) + delta;
                    rel.opinion = Math.max(-100, Math.min(100, (rel.opinion || 0) + opDelta));
                    t.profile.relationships[s.name] = rel;
                }
            }

            if (s.isActor && t.isActor && s.profile) {
                const sDelta = success ? Math.round(delta * 0.6) : 0;
                if (window.NPCEmpathize?._helpers?._addNpcAttraction) {
                    window.NPCEmpathize._helpers._addNpcAttraction(s.profile, t.actorId, sDelta);
                } else {
                    s.profile.attractions = s.profile.attractions || {};
                    s.profile.attractions[t.actorId] = (s.profile.attractions[t.actorId] || 0) + sDelta;
                }
            }

            if (!s.isActor && t.isActor && s.profile) {
                s.profile.attractions = s.profile.attractions || {};
                s.profile.attractions[t.actorId] = (s.profile.attractions[t.actorId] || 0) + (success ? 6 : -2);
            }

            if (s.actor && typeof s.actor.actorId === "function" && window.PartyNeeds?.fillNeed) {
                window.PartyNeeds.fillNeed(s.actor, "social", 20);
            }
            if (t.actor && typeof t.actor.actorId === "function" && window.PartyNeeds?.fillNeed) {
                window.PartyNeeds.fillNeed(t.actor, "social", 20);
            }
            if (s.profile && s.profile.social != null) {
                s.profile.social = Math.min(100, (s.profile.social || 0) + 20);
            }
            if (t.profile && t.profile.social != null) {
                t.profile.social = Math.min(100, (t.profile.social || 0) + 20);
            }

            const heartText = delta >= 0 ? `+${delta}♥` : `${delta}♥`;
            const outcomeText = success ? `Success (${heartText})` : `Rejected (${heartText})`;
            const toastMsg = `[Romance] ${s.name} → ${t.name} (${act.label}): Rolled ${roll} vs ${chance}% ➔ ${outcomeText}`;

            if (window.ParchmentToast && typeof window.ParchmentToast.show === "function") {
                try {
                    window.ParchmentToast.show(toastMsg, {
                        severity: success ? "good" : "warning",
                        duration: 180,
                    });
                } catch (_) {}
            }

            const rawLine = act.lines[Math.floor(Math.random() * act.lines.length)];
            const suitorLine = rawLine.replace(/\{name\}/g, t.name);
            const replyPool = success ? act.repliesGood : act.repliesBad;
            const replyLine = replyPool[Math.floor(Math.random() * replyPool.length)].replace(/\{name\}/g, s.name);

            if (window.Diary && typeof window.Diary.onRomance === "function") {
                try { window.Diary.onRomance(s.name, t.name, act.id, success); } catch (_) {}
            }

            return {
                suitor: s,
                target: t,
                action: act,
                chance,
                roll,
                success,
                delta,
                suitorLine,
                replyLine,
                toastMsg,
            };
        }
    };
    window.NPCRomanceSystem = NPCRomanceSystem;

    // ========================================================================
    // The party on the map
    // ========================================================================
    // The party walks the engine's own caterpillar and nothing else: every
    // member steps into the tile the one in front of them has just left, one
    // behind the other, in the leader's exact footsteps, and nobody leaves the
    // column. The loose layer that used to walk them about on their own, with
    // its errands, its strolls and the conversations it held with the town
    // while the player was looking somewhere else, is gone, and with it every
    // reason a member had to stand anywhere but at the leader's back.
    //
    // What is left here is the handful of questions about the party ON THE MAP
    // that the rest of this file still asks: whether a map battle owns the
    // bodies, whether they are stowed in a hull, where to put them down after a
    // transfer, and who the leader is standing face to face with.
    const Loose = {
        // The map the party was last seen on, so arriving somewhere new can be
        // told from coming back to the map it never left.
        mapId: 0,

        // A pet, a child or a creature that came along of its own accord
        // (NPC/PetFollowerSystem.js) walks at heel like everybody else, but it
        // is not one of the party: there is no actor behind it.
        isPet(f) {
            return !!(window.Game_PetFollower && f instanceof window.Game_PetFollower);
        },

        // A map battle (BattleSystem/MapBattleMode.js) turns every member into a
        // tactical battler that MapBattleMode walks itself, tile by tile.
        inMapBattle() {
            return !!(window.MapBattleMode && window.MapBattleMode.isActive());
        },

        // Kept for the callers that used to ask the loose layer to drop what it
        // was doing (MapBattleMode, SplitScreenMultiplayer): there is nothing
        // left to drop but whatever is written over somebody's head.
        standDown() { Bubbles.clear(); },
        resetStates() { Bubbles.clear(); },

        // The body the second player is holding in a split-screen session
        // (Multiplayer/SplitScreenMultiplayer.js). That member is walked by the
        // pad rather than by the column.
        heldByP2(f) {
            const ss = window.SplitScreenManager;
            if (!ss || !ss.active || typeof ss.isP2Follower !== "function") return false;
            return ss.isP2Follower(f);
        },

        // Riding, the party is stowed inside the hull with the leader. The Bike
        // is the exception: there is no hull, every member is on a bicycle of
        // their own out in the open (Vehicle/VehicleSystem.js swaps their sheets
        // for it).
        stowedInVehicle() {
            if (!$gamePlayer || !$gamePlayer.isInVehicle()) return false;
            const vs = window.MergedVehicleSystem;
            return !(vs && vs.isPartyRidingAlong && vs.isPartyRidingAlong());
        },

        // Standing on the world map (Map/WorldMapReturn.js), where one tile is
        // a region of the continent rather than a few paces of ground.
        onWorldMap() {
            if (!$gameMap) return false;
            const wmr = window.WorldMapReturn;
            const utils = window.ProcGenUtils;
            const id = (wmr && wmr.worldMapId) || (utils && utils.WORLD_MAP_ID) || 315;
            return $gameMap.mapId() === id;
        },

        dist(a, b) {
            return $gameMap.distance(a.x, a.y, b.x, b.y);
        },

        // One member put down beside the leader, on the first free tile of the
        // ring around them. `taken` collects the tiles already handed out, so no
        // two of them are dropped on the same one.
        placeBeside(f, taken) {
            const px = $gamePlayer.x;
            const py = $gamePlayer.y;
            const ring = [
                [0, 1], [0, -1], [1, 0], [-1, 0],
                [1, 1], [-1, 1], [1, -1], [-1, -1],
                [0, 2], [0, -2], [2, 0], [-2, 0],
            ];
            for (const [dx, dy] of ring) {
                const x = $gameMap.roundX(px + dx);
                const y = $gameMap.roundY(py + dy);
                const key = x + "," + y;
                if (taken && taken.has(key)) continue;
                if (!tilePassable(x, y)) continue;
                // Never drop somebody on top of a solid event: standing inside
                // a chest or a shopkeeper reads as a bug even though a follower
                // blocks nothing.
                if ($gameMap.eventsXyNt(x, y).some((e) => e.isNormalPriority())) continue;
                if (taken) taken.add(key);
                f.locate(x, y);
                f.setDirection($gamePlayer.direction());
                return true;
            }
            // Nowhere free: standing on the leader is still better than being
            // left on the other side of the map.
            f.locate(px, py);
            f.setDirection($gamePlayer.direction());
            return false;
        },

        // The whole party put back at the leader's side at once: coming out of
        // a battle, taking a transfer event, or arriving on a new map. The
        // column re-forms from there on the leader's first step.
        gatherNear() {
            if (!$gamePlayer || !$gameMap) return;
            // Riding, the party is inside the vehicle with the leader; putting
            // them on the tiles around it would drop them in the water. On a bike
            // they are already on the tiles around it, each on their own, so they
            // are gathered like anybody else.
            if (this.stowedInVehicle()) return;
            const taken = new Set([$gamePlayer.x + "," + $gamePlayer.y]);
            for (const f of $gamePlayer.followers().data()) {
                if (!f.isVisible()) continue;
                this.placeBeside(f, taken);
            }
            Bubbles.clear();
        },

        // ------------------------------------------------------------ chatter
        // The party still says things while it walks. Nobody leaves the column
        // to say them any more: every so often one member standing still puts a
        // line in a bubble over their own head and that is the whole of it.
        _saidAt: new WeakMap(),
        _lastLineAt: -CHATTER_GAP,

        partyActorOf(char) {
            if (!char || this.isPet(char)) return null;
            return (char.actor && char.actor()) || null;
        },

        // A line is rationed twice over: the same member keeps quiet for a good
        // while after saying one, and no two of them speak on top of each other.
        _mayTalk(char) {
            if (!LOOSE_CHATTER) return false;
            const now = Graphics.frameCount;
            if (now - this._lastLineAt < CHATTER_GAP) return false;
            const last = this._saidAt.get(char);
            return last === undefined || now - last >= CHATTER_COOL;
        },

        _stampTalk(char) {
            const now = Graphics.frameCount;
            this._saidAt.set(char, now);
            this._lastLineAt = now;
        },

        say(char, key, answer) {
            // The chatter is written for the people in the party. A pet or a
            // child walking with them says none of it.
            if (this.isPet(char)) return false;
            if (!answer && !this._mayTalk(char)) return false;
            const actor = this.partyActorOf(char);
            // A creature walking with the party has no words of its own:
            // window.NPCCreature owns that boundary and PartyBanter answers for
            // it, so nothing here ever puts prose over a feral head.
            if (window.PartyBanter?.canSpeak && !window.PartyBanter.canSpeak(actor)) return false;
            // Em and Bubba walking together have their own bank for exactly
            // this: a word about the rain, the trees, the town or the hour,
            // written for the two of them and nobody else (the `situations`
            // pools of js/db/NPC/SocialLines.json, read through
            // NPCEmpathize.pairAmbientLine). It is not every bubble - the bank
            // answers with nothing most of the time - so their ordinary
            // personality chatter is still what they mostly say.
            const pairLine = (actor && window.NPCEmpathize?.pairAmbientLine)
                ? window.NPCEmpathize.pairAmbientLine(actor) : null;
            if (pairLine) {
                this._stampTalk(char);
                Bubbles.show(char, pairLine);
                return true;
            }
            const own = (actor && window.PartyBanter) ? window.PartyBanter.solo(actor, key) : null;
            if (own) {
                this._stampTalk(char);
                Bubbles.show(char, own);
                return true;
            }
            const lines = T.pool(key);
            if (!lines.length) return false;
            this._stampTalk(char);
            Bubbles.show(char, lines[Math.floor(Math.random() * lines.length)]);
            return true;
        },

        // A line already chosen elsewhere (the travelling banter), said by this
        // character. Same bubble, no bank lookup.
        sayText(char, text) {
            if (!text || this.isPet(char)) return;
            const actor = this.partyActorOf(char);
            if (window.PartyBanter?.canSpeak && !window.PartyBanter.canSpeak(actor)) return;
            this._stampTalk(char);
            Bubbles.show(char, text);
        },

        // Once every so often, on a quiet map, one of them says something.
        updateChatter() {
            if (!LOOSE_CHATTER) return;
            if (!$gamePlayer || !$gameMap || !$gameMessage) return;
            if (!(SceneManager._scene instanceof Scene_Map)) return;
            if ($gameParty.inBattle() || this.inMapBattle()) return;
            if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return;
            if ($gamePlayer.isTransferring() || $gamePlayer.isInVehicle()) return;
            if (!$gamePlayer.followers().isVisible()) return;
            if (Graphics.frameCount % IDLE_TALK_EVERY !== 0) return;
            if (Math.random() >= IDLE_TALK_ODDS) return;
            const talkers = $gamePlayer.followers().data()
                .filter((f) => f && f.isVisible() && !f.isTransparent() && !this.isPet(f)
                    && !this.heldByP2(f) && this.partyActorOf(f));
            if (!talkers.length) return;
            this.say(talkers[Math.floor(Math.random() * talkers.length)], "AutoIdle.loose.thought");
        },

        toast(text, severity) {
            if (!text) return;
            try {
                window.ParchmentToast && window.ParchmentToast.show(text, {
                    severity: severity || "info", duration: 150,
                });
            } catch (e) { /* a popup never breaks anything */ }
        },

        // ------------------------------------------------- face to face
        // Walking in a column the party is at the leader's back rather than in
        // front of them, so this answers only once the player has turned round
        // on purpose. That is the whole point of it: turning to the person
        // behind you is how you talk to them.
        facedFollower() {
            if (!$gamePlayer || !$gamePlayer.followers()) return null;
            if ($gamePlayer.isInVehicle()) return null;
            if (!$gamePlayer.followers().isVisible()) return null;
            const d = $gamePlayer.direction();
            const fx = $gameMap.roundXWithDirection($gamePlayer.x, d);
            const fy = $gameMap.roundYWithDirection($gamePlayer.y, d);
            for (const f of $gamePlayer.followers().data()) {
                if (this.isPet(f)) continue;
                if (!f.isVisible() || f.isTransparent()) continue;
                if (f.pos(fx, fy)) return f;
            }
            return null;
        },

        // The companion at heel, when the leader is facing it. It walks where
        // the leader just was, and it is still the one thing in that column
        // worth turning round to.
        facedPet() {
            if (!$gamePlayer || !$gamePlayer.followers()) return null;
            if ($gamePlayer.isInVehicle()) return null;
            const d = $gamePlayer.direction();
            const fx = $gameMap.roundXWithDirection($gamePlayer.x, d);
            const fy = $gameMap.roundYWithDirection($gamePlayer.y, d);
            for (const f of $gamePlayer.followers().data()) {
                if (!this.isPet(f)) continue;
                if (!f.isVisible() || f.isTransparent()) continue;
                if (f.pos(fx, fy)) return f;
            }
            return null;
        },

        talkTo(f) {
            if (this.isPet(f)) return this.petMenu(f);
            const actor = f && f.actor();
            if (!actor) return false;
            // On a map that carries <Bubba: scene,scene>, Em is offered the
            // map's questions and his sheet side by side rather than one or the
            // other (DialogueSystem owns the menu and the gate).
            const SD = window.StoryDialogue;
            if (SD?.canAsk?.(actor.name())) {
                f.setDirection(f.reverseDir($gamePlayer.direction()));
                Bubbles.clear();
                if (SD.askMenu?.(actor.actorId())) return true;
                if (SD.ask()) return true;
            }
            if (!window.NPCEmpathize || typeof window.NPCEmpathize.openForActor !== "function") return false;
            f.setDirection(f.reverseDir($gamePlayer.direction()));
            Bubbles.clear();
            window.NPCEmpathize.openForActor(actor.actorId());
            return true;
        },

        // ------------------------------------------------------- the companion
        // The pet has no actor behind it, so its Empathize sheet is not opened
        // the way a member's is. What it is offered instead is a short menu:
        // something that talks is talked to, something feral is petted
        // (window.NPCCreature owns that boundary, and the record's own answer is
        // what it was recruited with), and either way its own page is one choice
        // down.
        petMenu(f) {
            const PS = window.PetSystem;
            const pet = PS && PS.getActivePet ? PS.getActivePet() : null;
            if (!pet) return false;
            if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return false;

            f.setDirection(f.reverseDir($gamePlayer.direction()));
            Bubbles.clear();

            const sentient = this.petIsSentient(pet);
            const ids = [sentient ? "talk" : "pet", "empathize", "cancel"];
            const labels = [
                T(sentient ? "AutoIdle.pet.actionTalk" : "AutoIdle.pet.actionPet"),
                T("AutoIdle.pet.actionEmpathize"),
                T("AutoIdle.pet.actionCancel"),
            ];
            $gameMessage.setChoices(labels, 0, ids.length - 1);
            $gameMessage.setChoiceBackground(0);
            $gameMessage.setChoicePositionType(2);
            $gameMessage.setChoiceCallback((n) => {
                switch (ids[n]) {
                    case "talk": this.petSpeaks(f, pet); break;
                    case "pet": this.petStroked(f, pet); break;
                    case "empathize": this.petEmpathize(pet); break;
                    default: break;
                }
            });
            return true;
        },

        // Is there anybody home? The flag was baked onto the record when it was
        // recruited (an explicit choice, or the <Talk> tag on the monster it
        // came from), and a companion carrying a creature class is feral by the
        // one rule that answers that question for everybody.
        petIsSentient(pet) {
            if (!pet) return false;
            const NC = window.NPCCreature;
            const classId = pet.training && pet.training.classId;
            if (classId && NC && NC.isNonSentientClassId) {
                return !NC.isNonSentientClassId(classId);
            }
            return !!pet.sentient;
        },

        // A word from the one that has words. Said in a bubble over its own
        // head, like every other line spoken on the map.
        petSpeaks(f, pet) {
            const lines = T.pool("AutoIdle.pet.said");
            if (!lines.length) return;
            const line = lines[Math.floor(Math.random() * lines.length)]
                .replace(/\{name\}/g, pet.name || "");
            Bubbles.show(f, line);
        },

        // Making a fuss of the one that has none. Written about it rather than
        // said by it, so a growl is never mistaken for conversation - but the
        // hands doing it are the leader's, so the beat is staged as a pair of
        // portraits like any other exchange on the map: what the leader does on
        // the left, what the companion makes of it on the right.
        petStroked(f, pet) {
            const lines = T.pool("AutoIdle.pet.petted");
            if (!lines.length) return;
            const named = (text) => String(text).replace(/\{name\}/g, pet.name || "");
            const line  = named(lines[Math.floor(Math.random() * lines.length)]);

            const minePool = T.pool("AutoIdle.pet.petting");
            const mine     = minePool.length
                ? named(minePool[Math.floor(Math.random() * minePool.length)]) : "";
            const NT = window.NPCTalk;
            if (mine && NT && typeof NT.exchange === "function") {
                const leader = $gameParty && $gameParty.leader ? $gameParty.leader() : null;
                const steps = [
                    NT.playerStep(leader, mine),
                    NT.spriteStep(f.characterName ? f.characterName() : "",
                        f.characterIndex ? f.characterIndex() : 0, pet.name || "", line),
                ];
                try { if (NT.exchange(steps)) return; }
                catch (e) { console.error("[AutoIdle] petting exchange failed", e); }
            }
            // Nowhere to stage it: the bare line, and a frame later, since the
            // box that asked the question clears the message on its way out.
            setTimeout(() => {
                window.skipLocalization = true;
                $gameMessage.add(line);
                window.skipLocalization = false;
            }, 0);
        },

        // Its own page, opened by name: with no event and no actor behind it,
        // the society profile under its name is the whole of what there is.
        petEmpathize(pet) {
            const EM = window.NPCEmpathize;
            if (!EM || typeof EM.openByName !== "function" || !pet.name) return;
            EM.openByName(pet.name);
        },
    };

    // ========================================================================
    // Scripted regrouping
    // ========================================================================
    // Two plugin commands an event may call to close the party up before a
    // scene plays. Both of them HOLD the interpreter: the command written under
    // one does not run until the walk is over, so a cutscene never opens on a
    // party still strung out across the map.
    //
    // The loose layer keeps its hands off while one runs (an event is running,
    // so canAct is false for every member anyway) and the walking here is the
    // only thing moving them.
    const REGROUP_WAIT = "aieRegroup";
    const REGROUP_STORY_SWITCH = 75;   // story mode
    const REGROUP_EM = "Em";           // i18n-ignore: actor name, matched at runtime
    const REGROUP_BUBBA = "Bubba";     // i18n-ignore: actor name, matched at runtime

    const Regroup = {
        // Frames a regroup is given before whoever is still walking is simply
        // put where they were walking to. A member on the far side of a maze
        // may have no way round at all, and an event may not wait for ever.
        LIMIT: 600,

        _job: null,

        busy() {
            return !!this._job;
        },

        // Every member closing on the leader, the engine's own Gather Party.
        startParty() {
            if (!this._available()) return;
            $gamePlayer.gatherFollowers();
            this._job = { mode: "party", frames: 0 };
        },

        // Story mode only, and only with both of them in the party: whichever
        // of the two the player is NOT holding walks up to the one they are,
        // and the pair turn to face each other.
        startPair() {
            if (!this._available()) return;
            if (!$gameSwitches || !$gameSwitches.value(REGROUP_STORY_SWITCH)) return;
            const leader = $gameParty.leader();
            if (!leader) return;
            const name = leader.name();
            const other = name === REGROUP_EM ? REGROUP_BUBBA
                : (name === REGROUP_BUBBA ? REGROUP_EM : null);
            if (!other) return;
            const f = $gamePlayer.followers().data().find((m) => {
                const a = m && m.isVisible() && m.actor && m.actor();
                return !!a && a.name() === other;
            });
            if (!f) return;
            $gamePlayer.gatherFollowers();
            this._job = { mode: "pair", frames: 0, follower: f };
        },

        _available() {
            if (this._job) return false;
            if (!$gamePlayer || !$gameMap || !$gameParty) return false;
            if (!(SceneManager._scene instanceof Scene_Map)) return false;
            if (Loose.inMapBattle()) return false;
            return true;
        },

        update() {
            const job = this._job;
            if (!job) return;
            if (!$gamePlayer || !$gameMap || !(SceneManager._scene instanceof Scene_Map) ||
                $gamePlayer.isTransferring() || Loose.inMapBattle()) {
                this._job = null;
                return;
            }
            job.frames++;
            const done = job.mode === "pair" ? this._stepPair(job) : this._stepParty(job);
            if (done) {
                this._job = null;
                return;
            }
            if (job.frames >= this.LIMIT) {
                this._force(job);
                this._job = null;
            }
        },

        // Everybody at the leader's elbow. Walking in a column they are already
        // there on any ordinary frame, so this is over as soon as the engine's
        // own gather is: what it is really waiting out is the one case that is
        // not ordinary, a member who has just joined and is still closing.
        _stepParty(job) {
            if ($gamePlayer.areFollowersGathering()) return false;
            for (const f of $gamePlayer.followers().data()) {
                if (!f.isVisible() || Loose.heldByP2(f)) continue;
                if (!f.isMoving()) f.setDirection(f.reverseDir($gamePlayer.direction()));
            }
            return true;
        },

        // The two of them. Walking is over once the gather is; the command is
        // over once they are actually looking at each other, which is a frame
        // or two later.
        _stepPair(job) {
            const f = job.follower;
            if (!f || !f.isVisible()) return true;
            if ($gamePlayer.areFollowersGathering()) return false;
            if (f.isMoving() || $gamePlayer.isMoving()) return false;
            return this._faceOff(f);
        },

        // Turn the pair on each other. True once both are looking the right way.
        _faceOff(f) {
            const toLeader = dirBetween(f.x, f.y, $gamePlayer.x, $gamePlayer.y);
            const toOther = dirBetween($gamePlayer.x, $gamePlayer.y, f.x, f.y);
            if (toLeader) f.setDirection(toLeader);
            if (toOther) $gamePlayer.setDirection(toOther);
            // Standing on the same tile there is no direction to take: they are
            // as face to face as they will get.
            if (!toLeader || !toOther) return true;
            return f.direction() === toLeader && $gamePlayer.direction() === toOther;
        },

        // Time is up: put whoever is still walking where they were walking to.
        _force(job) {
            if (job.mode === "pair") {
                const f = job.follower;
                if (f && f.isVisible()) {
                    if (Loose.dist(f, $gamePlayer) > 1) Loose.placeBeside(f);
                    this._faceOff(f);
                }
                return;
            }
            Loose.gatherNear();
            for (const f of $gamePlayer.followers().data()) {
                if (f.isVisible() && !Loose.heldByP2(f)) {
                    f.setDirection(f.reverseDir($gamePlayer.direction()));
                }
            }
        },
    };

    AutoIdle.regroup = Regroup;

    // ========================================================================
    // Taking the lead
    // ========================================================================
    // The party walks as one body and any of them can walk in front of it. Tab
    // hands the lead to the next member, Shift+Tab to the one before, and a TAP
    // of L2 or R2 does the same from a pad (a trigger HELD is the map camera's
    // zoom, which belongs to Core/MousePan.js, so only a tap counts here).
    //
    // Handing over the lead is a swap of bodies, not a teleport: the two of them
    // exchange tiles and headings, so nobody moves an inch on the ground and the
    // party stands exactly where it stood. The camera then WALKS from the old
    // leader's tile to the new one rather than cutting, so it stays plain who
    // has just been handed the party.
    //
    // The order itself always goes through PartyRoster.setLeader, the one call
    // the Dynamics roster's "Make Leader" makes, so the menu, the acting order,
    // the diary and every other reader of $gameParty.leader() follow along
    // whichever end the switch came from. Dynamics calls back the other way too
    // (UI/CustomMainMenuLayout.js), so promoting somebody from the roster swaps
    // the bodies on the map exactly as Tab does.
    const Lead = {
        PAN_FRAMES: 24,
        // Frames a trigger may be pulled and still read as a tap rather than as
        // the beginning of a zoom.
        PAD_TAP: 18,
        PAD_DEADZONE: 0.35,

        _pan: 0,
        _fromX: 0,
        _fromY: 0,
        _dx: 0,
        _dy: 0,
        _padDir: 0,
        _padHold: 0,

        // The party indices the lead may be handed to, in marching order. A
        // fallen member is skipped: nobody follows a corpse. The leader is
        // always in the list, dead or not, so cycling starts from where the
        // party actually is.
        order() {
            const members = ($gameParty && $gameParty.members()) || [];
            const out = [];
            for (let i = 0; i < members.length; i++) {
                const actor = members[i];
                if (!actor) continue;
                if (i > 0 && actor.isDead && actor.isDead()) continue;
                // In a split-screen session the second player is already holding
                // one of them (Multiplayer/SplitScreenMultiplayer.js): that body
                // is not Player 1's to take.
                if (i > 0 && this.heldByP2(actor)) continue;
                out.push(i);
            }
            return out;
        },

        // Is this member the one the second pad is walking?
        heldByP2(actor) {
            const ss = window.SplitScreenManager;
            if (!ss || !ss.active || typeof ss.isP2Actor !== "function") return false;
            return ss.isP2Actor(actor);
        },

        // True while a split-screen session is running, where the camera is the
        // manager's business rather than ours: it plants the display on each
        // player's own viewport every frame, so the walk across would be undone
        // the moment it started.
        inSplitScreen() {
            const ss = window.SplitScreenManager;
            return !!(ss && ss.active);
        },

        // The states of the game in which the lead may change hands at all.
        available() {
            if (!$gameParty || !$gamePlayer || !$gameMap || !$gameMessage) return false;
            // Whether the lead may change hands at all is one answer for every
            // end that asks (PartyRoster.canSwitchLeader), story mode included.
            if (window.PartyRoster?.canSwitchLeader?.() === false) return false;
            if (!(SceneManager._scene instanceof Scene_Map)) return false;
            // The 3D world is a DOM overlay drawn over a Scene_Map that never
            // went away (VoxelWorld/VoxelWorldSystem.js), so this read used to
            // go on happening underneath a drive: Tab, and a tap of L2 or R2,
            // handed the party to somebody else while the camper was at speed
            // or the leader was walking with the quick bar up. Out there those
            // buttons belong to the world - the bar and the camera - and the
            // lead does not change hands at all.
            if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive &&
                window.VoxelWorldSystem.isActive()) return false;
            if (SceneManager.isSceneChanging()) return false;
            // On the world map (Map/WorldMapReturn.js) the party is drawn as a
            // single dot on a grid where one tile is a whole region: the other
            // members are not on it to be swapped with, and handing the lead
            // over out there would change who the party is without anything to
            // show for it. Tab, Shift+Tab and a tap of L2 or R2 all do nothing.
            if (Loose.onWorldMap()) return false;
            if ($gameParty.inBattle() || Loose.inMapBattle()) return false;
            if ($gameMessage.isBusy() || $gameMap.isEventRunning()) return false;
            if ($gamePlayer.isMoving() || $gamePlayer.isJumping()) return false;
            if ($gamePlayer.isInVehicle()) return false;
            if ($gamePlayer._vehicleGettingOn || $gamePlayer._vehicleGettingOff) return false;
            if (!$gamePlayer.followers().isVisible()) return false;
            if ($gamePlayer.areFollowersGathering()) return false;
            // The map modes that keep a cursor of their own and read Tab
            // themselves: laying out furniture (Crafting/FurnitureSystem.js) and
            // aiming a throw (BattleSystem/ThrowItemPlugin.js).
            if (SceneManager._scene._fbActive) return false;
            if ($gamePlayer._throwTargetingMode) return false;
            if (this.panning()) return false;
            return this.order().length > 1;
        },

        // One step down the marching order (+1) or up it (-1).
        cycle(delta) {
            const idx = this.order();
            if (idx.length < 2) return false;
            const at = Math.max(0, idx.indexOf(0));
            const size = idx.length;
            const target = idx[(((at + delta) % size) + size) % size];
            if (!target) return false;
            const actor = $gameParty.members()[target];
            return actor ? this.switchTo(actor.actorId(), { pan: true }) : false;
        },

        // Hand the party to one named member. `pan` false cuts the camera
        // instead of walking it, which is what the menu wants: nobody is looking
        // at the map while the roster is open.
        switchTo(actorId, opts) {
            const options = opts || {};
            if (!$gameParty || !$gamePlayer) return false;
            const members = $gameParty.members();
            const to = members.findIndex((mem) => mem && mem.actorId() === actorId);
            if (to <= 0) return false;

            // Riding, the party is stowed in the hull and there are no two
            // bodies to exchange: the order changes and nothing moves.
            const onMap = !!$gameMap && !$gamePlayer.isInVehicle() && !Loose.stowedInVehicle();
            const f = $gamePlayer.followers().follower(to - 1);
            const swap = onMap && !!f && f.isVisible() && !f.isTransparent();
            const px = $gamePlayer.x;
            const py = $gamePlayer.y;
            const pd = $gamePlayer.direction();
            const fx = swap ? f.x : px;
            const fy = swap ? f.y : py;
            const fd = swap ? f.direction() : pd;

            if (window.PartyRoster && window.PartyRoster.setLeader) {
                const result = window.PartyRoster.setLeader(actorId);
                if (!result || !result.ok) return false;
            } else {
                $gameParty.swapOrder(0, to);
            }

            if (swap) {
                $gamePlayer.setPosition(fx, fy);
                $gamePlayer.setDirection(fd);
                $gamePlayer.straighten();
                f.setPosition(px, py);
                f.setDirection(pd);
                f.straighten();
                // Being in the water, up a wall or sat on a chair belongs to the
                // TILE rather than to the person (Map/MovementInteractionSystem.js),
                // so those travel with the bodies: whoever ends up in the river is
                // the one who swims out of it.
                for (const flag of ["_isSwimming", "_isClimbing", "_isSitting"]) {
                    const mine = $gamePlayer[flag];
                    $gamePlayer[flag] = f[flag];
                    f[flag] = mine;
                }
                Bubbles.clearFor(f);
                Bubbles.clearFor($gamePlayer);
            }
            $gamePlayer.refresh();
            $gamePlayer.followers().refresh();

            if (swap && options.pan !== false && !this.inSplitScreen() &&
                SceneManager._scene instanceof Scene_Map) {
                this.startPan();
            } else if (swap) {
                $gamePlayer.center($gamePlayer.x, $gamePlayer.y);
            }
            const leader = $gameParty.leader();
            if (leader) Loose.toast(T('AutoIdle.lead.toast', { name: leader.name() }), "info");
            return true;
        },

        // ------------------------------------------------------------- camera
        panning() {
            return this._pan > 0;
        },

        clampX(x) {
            if ($gameMap.isLoopHorizontal()) return x.mod($gameMap.width());
            const end = $gameMap.width() - $gameMap.screenTileX();
            return end < 0 ? end / 2 : x.clamp(0, end);
        },

        clampY(y) {
            if ($gameMap.isLoopVertical()) return y.mod($gameMap.height());
            const end = $gameMap.height() - $gameMap.screenTileY();
            return end < 0 ? end / 2 : y.clamp(0, end);
        },

        // Where the map would sit with the new leader centred, clamped exactly
        // as setDisplayPos clamps it, so the walk lands on the very position the
        // engine would have snapped to.
        centerTarget() {
            return {
                x: this.clampX($gamePlayer.x - $gamePlayer.centerX()),
                y: this.clampY($gamePlayer.y - $gamePlayer.centerY()),
            };
        },

        startPan() {
            const fromX = $gameMap.displayX();
            const fromY = $gameMap.displayY();
            const target = this.centerTarget();
            let dx = target.x - fromX;
            let dy = target.y - fromY;
            // On a looping map the short way round is the one the eye expects.
            if ($gameMap.isLoopHorizontal()) {
                const w = $gameMap.width();
                if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
            }
            if ($gameMap.isLoopVertical()) {
                const h = $gameMap.height();
                if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
            }
            if (!dx && !dy) {
                this._pan = 0;
                return;
            }
            this._fromX = fromX;
            this._fromY = fromY;
            this._dx = dx;
            this._dy = dy;
            this._pan = this.PAN_FRAMES;
        },

        // Eased in and out, so the camera leans off one member and settles onto
        // the other instead of sliding at a flat speed.
        ease(t) {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        },

        updatePan() {
            if (this._pan <= 0) return;
            if (!(SceneManager._scene instanceof Scene_Map) || !$gameMap || !$gamePlayer) {
                this._pan = 0;
                return;
            }
            this._pan--;
            const t = 1 - this._pan / this.PAN_FRAMES;
            const e = this.ease(t);
            $gameMap.setDisplayPos(this._fromX + this._dx * e, this._fromY + this._dy * e);
            if (this._pan <= 0) $gamePlayer.center($gamePlayer.x, $gamePlayer.y);
        },

        // ------------------------------------------------------------- input
        // Tab is a key HTML fields want for themselves, and the map carries a
        // few of those (a phone, a terminal, a name field).
        typing() {
            const el = typeof document !== "undefined" ? document.activeElement : null;
            if (!el) return false;
            const tag = (el.tagName || "").toLowerCase();
            return tag === "input" || tag === "textarea" || tag === "select" || !!el.isContentEditable;
        },

        // The pad's triggers, read as a tap: a pull is only answered once it has
        // been RELEASED, and only if it was let go inside the tap window.
        // Anything longer is a zoom and is left to MousePan.
        padStep() {
            // Asked before anything is read: reading a trigger claims it for
            // the frame (AnalogStickInput), and a screen that wants the same
            // pull for itself stands down when somebody else has. Claiming it
            // on a map where the party cannot cycle anyway - mid-message, in a
            // vehicle, while an event runs - would cost every overlay open over
            // that map its own use of the triggers for nothing.
            if (!this.available() || this.typing()) {
                this._padDir = 0;
                this._padHold = 0;
                return 0;
            }
            const pads = window.AnalogStickInput;
            if (!pads || !pads.leftTrigger || !pads.rightTrigger) {
                this._padDir = 0;
                this._padHold = 0;
                return 0;
            }
            const lt = pads.leftTrigger();
            const rt = pads.rightTrigger();
            const dir = rt > this.PAD_DEADZONE ? 1 : (lt > this.PAD_DEADZONE ? -1 : 0);
            if (dir) {
                if (dir !== this._padDir) {
                    this._padDir = dir;
                    this._padHold = 1;
                } else {
                    this._padHold++;
                }
                return 0;
            }
            const was = this._padDir;
            const held = this._padHold;
            this._padDir = 0;
            this._padHold = 0;
            return was && held <= this.PAD_TAP ? was : 0;
        },

        // True while a trigger pull is still short enough to turn out to be a
        // party cycle. MousePan asks before zooming, so one tap never does both.
        padClaimsTriggers() {
            return this._padDir !== 0 && this._padHold <= this.PAD_TAP && this.available();
        },

        update() {
            this.updatePan();
            let dir = 0;
            if (!this.typing() && Input.isTriggered("tab")) {
                dir = Input.isPressed("shift") ? -1 : 1;
            } else {
                dir = this.padStep();
            }
            if (!dir || !this.available()) return;
            if (this.cycle(dir)) SoundManager.playOk();
        },
    };

    AutoIdle.lead = Lead;
    // The chatter bubble on its own, for the talk that happens where the loose
    // walkers are not: over a vehicle the whole party is sitting in (the
    // travelling half of NPC/PartyBanter.js). Same element, same stylesheet, same
    // anchoring off a character's screen projection - the character simply happens to be a
    // camper rather than a follower. Honours the Loose Chatter option, since it
    // is the same chatter.
    AutoIdle.bubble = {
        show(char, text) { Bubbles.show(char, text); },
        clearFor(char) { Bubbles.clearFor(char); },
        clear() { Bubbles.clear(); },
    };
    // The two regroup commands, reachable from another plugin as well as from
    // an event: a written scene wants the party standing together before the
    // first bust slides in, and the dialogue plugin has no event to write the
    // command under.
    // Named methods on the module itself rather than a second object standing
    // in front of it: the frame update the scene calls lives there too, and a
    // facade that replaced it left the commands running with nothing driving
    // them.
    Regroup.party = function () { this.startParty(); return this.busy(); };
    Regroup.pair  = function () { this.startPair();  return this.busy(); };
    // What a story scene asks for: in story mode the two leads close on
    // each other, and anywhere else the party closes on the leader.
    Regroup.forStory = function () {
        this.startPair();
        if (!this.busy()) this.startParty();
        return this.busy();
    };
    // The questions the rest of the game still asks about the party on the map
    // (who the leader is facing, whether a pet walks at heel) are answered
    // through here, as the header above says they are.
    AutoIdle.loose = Loose;
    window.AutoIdleExplorer = AutoIdle;

    // ========================================================================
    // Party hooks
    // ========================================================================
    // 0) Map 315 (the world map) draws the party as a single dot: the column
    //    would otherwise show human-scale sprites on a screen where one tile is
    //    a whole region.
    //    Followers are hidden by opacity rather than by blanking their image
    //    (Game_Follower.refresh only reruns on specific triggers, so an
    //    isVisible()-driven approach would not react to a plain map transfer),
    //    the same trick SplitScreenMultiplayer.js uses to hide Player 2's.
    const _Game_Followers_update_worldMap = Game_Followers.prototype.update;
    Game_Followers.prototype.update = function () {
        const onWorldMap = $gameMap && $gameMap.mapId() === 315;
        const targetOpacity = onWorldMap ? 0 : 255;
        const ss = window.SplitScreenManager;
        const session = !!(ss && ss.active && typeof ss.isP2Follower === "function");
        for (const follower of this._data) {
            // Player 2's own slot stays hidden whatever the map: it is drawn as
            // the split-screen avatar instead.
            const target = (session && ss.isP2Follower(follower)) ? 0 : targetOpacity;
            if (follower.opacity() !== target) follower.setOpacity(target);
        }
        _Game_Followers_update_worldMap.call(this);
    };

    // 1) The chase itself, which is the engine's own: every member steps into
    //    the tile the one in front of them has just left. The single exception
    //    is a map battle (BattleSystem/MapBattleMode.js), which walks every
    //    member itself, tile by tile, and where each one holds the ground it is
    //    fighting from: letting the chase run there would drag the whole train
    //    along behind every tactical step the leader takes, undoing the
    //    positioning the fight is being fought over.
    const _Game_Followers_updateMove_party = Game_Followers.prototype.updateMove;
    Game_Followers.prototype.updateMove = function () {
        if (Loose.inMapBattle()) return;
        _Game_Followers_updateMove_party.call(this);
    };

    // 2) The camera walking from one member to the other owns the display for
    //     those few frames: the engine would otherwise drag it back the moment
    //     the new leader took a step.
    const _Game_Player_updateScroll_lead = Game_Player.prototype.updateScroll;
    Game_Player.prototype.updateScroll = function (lastScrolledX, lastScrolledY) {
        if (Lead.panning()) return;
        _Game_Player_updateScroll_lead.call(this, lastScrolledX, lastScrolledY);
    };

    // 3) OK on a member the leader has turned round to face opens their
    //    Empathize sheet, the same page the Dynamics roster opens. Checked
    //    before the engine's own action button, which would otherwise walk
    //    straight through them.
    const _Game_Player_triggerButtonAction_party = Game_Player.prototype.triggerButtonAction;
    Game_Player.prototype.triggerButtonAction = function () {
        if (Input.isTriggered("ok") && !this.isInVehicle()) {
            const f = Loose.facedFollower() || Loose.facedPet();
            if (f && Loose.talkTo(f)) return true;
        }
        return _Game_Player_triggerButtonAction_party.call(this);
    };

    // ========================================================================
    // Scene hooks
    // ========================================================================
    const _SceneMap_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _SceneMap_update.call(this);
        try {
            Lead.update();
        } catch (e) {
            console.error("[AutoIdleExplorer] lead update error:", e);
        }
        try {
            Loose.updateChatter();
            Bubbles.update();
        } catch (e) {
            console.error("[AutoIdleExplorer] party bubble update error:", e);
        }
        try {
            Regroup.update();
        } catch (e) {
            console.error("[AutoIdleExplorer] regroup update error:", e);
        }
        try {
            AutoIdle.ensureP2Hook();
            AutoIdle.updateOnMap();
        } catch (e) {
            console.error("[AutoIdleExplorer] map update error:", e);
        }
    };

    const _SceneMap_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        // Hide the badges while off-map; engaged state is restored on return.
        AutoIdle.hideBadge();
        AutoIdle.p2.hideBadge();
        Bubbles.clear();
        _SceneMap_terminate.call(this);
    };

    const _SceneMap_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _SceneMap_start.call(this);
        // A transfer event, a change of map, or walking out of a battle: the
        // party is put back at the leader's shoulder instead of being left
        // scattered over the map it was last standing on. Close needs none of
        // this, the engine already stacks the column on the leader's tile.
        const mapId = $gameMap ? $gameMap.mapId() : 0;
        // A map battle (BattleSystem/MapBattleMode.js) never leaves Scene_Map:
        // it ends by re-running start() to reach the corpse/reward hooks. The
        // party has not arrived anywhere, it has been standing here fighting,
        // and putting it back at the leader's shoulder now would undo every
        // position the fight was fought over.
        const reentry = !!(window.MapBattleMode && window.MapBattleMode.isReentering &&
            window.MapBattleMode.isReentering());
        const arrived = !reentry &&
            (this._transfer || SceneManager.isPreviousScene(Scene_Battle) || Loose.mapId !== mapId);
        if (arrived) {
            // Every errand is dropped on arrival, and the whole party is put
            // back at the leader's shoulder rather than left on the old map.
            Loose.resetStates();
            Loose.gatherNear();
        }
        Loose.mapId = mapId;
        // Arriving anywhere cancels a camera walk left over from the map just
        // left, which would otherwise drag the display off the new one.
        Lead._pan = 0;
        if (AutoIdle.engaged && ConfigManager.autoIdle) AutoIdle.showBadge();
        if (AutoIdle.p2.engaged && ConfigManager.autoIdle) AutoIdle.p2.showBadge();
    };

    const _SceneBattle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        if (AutoIdle.shouldAutoBattle()) AutoIdle.driveBattle(this);
        _SceneBattle_update.call(this);
    };

    // Best-effort: pop out of a standard shop scene after a short delay so the
    // autopilot never gets stuck inside a menu it cannot meaningfully drive.
    const _SceneShop_update = Scene_Shop.prototype.update;
    Scene_Shop.prototype.update = function () {
        _SceneShop_update.call(this);
        if (AutoIdle.shouldAutoBattle()) {
            this._autoShopTimer = (this._autoShopTimer || 0) + 1;
            if (this._autoShopTimer > 90 && !this.isBusy()) {
                this.popScene();
            }
        }
    };

    // ========================================================================
    // Scene_Menu, navigate the command list to "Items", then close when done.
    // ========================================================================
    const _SceneMenu_update = Scene_Menu.prototype.update;
    Scene_Menu.prototype.update = function () {
        _SceneMenu_update.call(this);
        if (!AutoIdle.shouldAutoBattle()) return;
        if (MenuNav.delay > 0) { MenuNav.delay--; return; }

        // Item use complete, Scene_Item already popped back here; close the menu.
        if (MenuNav.phase === 'done') {
            MenuNav.clear();
            if (!this.isBusy() && this.popScene) this.popScene();
            return;
        }

        // Safety: never stay stuck in the menu indefinitely.
        if (++MenuNav.timeout > 300) {
            MenuNav.clear();
            if (this.popScene) this.popScene();
            return;
        }

        const cw = this._commandWindow;
        if (!cw || !cw.active) return;

        if (MenuNav.intent === 'item') {
            const list = cw._list || [];
            for (let i = 0; i < list.length; i++) {
                if (list[i] && list[i].symbol === 'item') {
                    cw.select(i);
                    if (cw.callOkHandler) cw.callOkHandler();
                    MenuNav.delay = 15;
                    return;
                }
            }
            // No item command in this menu layout, bail out.
            MenuNav.clear();
            if (this.popScene) this.popScene();
        } else {
            // No remaining intent, close menu.
            MenuNav.clear();
            if (cw.processCancel) cw.processCancel();
        }
    };

    // ========================================================================
    // Scene_Item, select category → item → actor target, then exit cleanly.
    // ========================================================================
    const _SceneItem_update = Scene_Item.prototype.update;
    Scene_Item.prototype.update = function () {
        _SceneItem_update.call(this);
        if (!AutoIdle.shouldAutoBattle()) return;
        if (!MenuNav.intent && MenuNav.phase !== 'done') return;
        if (MenuNav.delay > 0) { MenuNav.delay--; return; }

        const catW = this._categoryWindow;
        const iw   = this._itemWindow;
        const aw   = this._actorWindow;

        // Phase done, unwind out of Scene_Item one cancel at a time.
        if (MenuNav.phase === 'done') {
            if (iw && iw.active) {
                if (iw.processCancel) iw.processCancel();
                MenuNav.delay = 10;
            } else if (catW && catW.active) {
                if (catW.processCancel) catW.processCancel();
                MenuNav.delay = 10;
            }
            return;
        }

        // Category window, pick the consumable ('item') category.
        if (catW && catW.active) {
            const list = catW._list || [];
            let idx = 0;
            for (let i = 0; i < list.length; i++) {
                if (list[i] && list[i].symbol === 'item') { idx = i; break; }
            }
            catW.select(idx);
            if (catW.callOkHandler) catW.callOkHandler();
            MenuNav.delay = 10;
            MenuNav.phase = 'item';
            return;
        }

        // No category window present, skip straight to item selection.
        if (MenuNav.phase === 'category') MenuNav.phase = 'item';

        // Item window, find and select our target item.
        if (iw && iw.active && MenuNav.phase === 'item') {
            const target = MenuNav.targetItem;
            const count  = iw.maxItems ? iw.maxItems() : 0;
            for (let i = 0; i < count; i++) {
                const entry = iw.itemAt ? iw.itemAt(i) : (iw._data && iw._data[i]);
                if (entry && entry.id === target.id) {
                    iw.select(i);
                    if (iw.callOkHandler) iw.callOkHandler();
                    MenuNav.delay = 15;
                    MenuNav.phase = 'actor';
                    return;
                }
            }
            // Item not visible in this category, bail.
            MenuNav.intent = null;
            MenuNav.phase  = 'done';
            MenuNav.delay  = 5;
            return;
        }

        // Actor window, select the target party member.
        if (aw && aw.active && MenuNav.phase === 'actor') {
            const idx = MenuNav.targetMember ? MenuNav.targetMember.index() : 0;
            aw.select(Math.max(0, Math.min(idx, (aw.maxItems ? aw.maxItems() : 1) - 1)));
            if (aw.callOkHandler) aw.callOkHandler();
            MenuNav.intent = null;
            MenuNav.phase  = 'done';
            MenuNav.delay  = 15;
            return;
        }

        // Actor phase but actor window never appeared (AoE/no-target item used directly).
        if (iw && iw.active && MenuNav.phase === 'actor') {
            MenuNav.intent = null;
            MenuNav.phase  = 'done';
            MenuNav.delay  = 10;
        }
    };

    // ========================================================================
    // Generic escape, any other scene the CPU triggered but cannot drive gets
    // popped after a short timeout so exploration can resume.
    // ========================================================================
    const _SceneBase_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function () {
        _SceneBase_update.call(this);
        // Release any synthetic key we are holding (see sendCancelKey). Done here
        // so it fires in every scene, not just on the map.
        if (AutoIdle.keyUpTimer > 0 && --AutoIdle.keyUpTimer === 0) {
            AutoIdle.dispatchKey("keyup", 27, "Escape");
        }
        if (!AutoIdle.shouldAutoBattle()) return;
        if (
            this instanceof Scene_Map    ||
            this instanceof Scene_Battle ||
            this instanceof Scene_Menu   ||
            this instanceof Scene_Item   ||
            this instanceof Scene_Shop
        ) return;
        this._autoEscapeTimer = (this._autoEscapeTimer || 0) + 1;
        // First, give the scene a chance to close itself cleanly via its own
        // cancel/escape handler (most custom plugin scenes pop on Cancel).
        if (this._autoEscapeTimer === 60) {
            try { AutoIdle.sendCancelKey(); } catch (e) {}
        }
        // Fallback: force the scene off the stack if it is still stuck.
        if (this._autoEscapeTimer > 180 && !this.isBusy()) {
            this._autoEscapeTimer = 0;
            try { if (this.popScene) this.popScene(); } catch (e) {}
        }
    };

    // ========================================================================
    // Party Member Downed, Defeated Corpse, Burial & Grave System
    // ========================================================================

    const PROC_MAP_ID = (window.WorldMapReturn && window.WorldMapReturn.procMapId) || 636;
    const WORLD_MAP_ID = (window.WorldMapReturn && window.WorldMapReturn.worldMapId) || 315;

    function _isHardcoreOrBloodAndOil() {
        return !!($gameSwitches && $gameSwitches.value(9));
    }

    function _procRegionKeyStr() {
        const p = $gameSystem && $gameSystem._procGenData;
        if (!p) return "0,0";
        return `${p.currentWorldX || 0},${p.currentWorldY || 0}_${p.currentFloor || 0}`;
    }

    // --- Helpers for actor metadata (Birthdate, Ideology/Religion, Disposition) ---

    function getActorBirthDate(actor) {
        if (!actor) return "Unknown";
        let preset = null;
        const actorData = actor.actor ? actor.actor() : (actor._actorId ? $dataActors[actor._actorId] : null);
        const m = actorData && actorData.note && actorData.note.match(/<Preset:\s*([^>]+)>/i);
        const presetName = actor._presetKey || (m ? m[1].trim() : null);
        // The dossier board publishes itself as CharacterPresets, and offers functions rather
        // than a map: this used to look up CharacterCreationPresets.presets, which is neither
        // the right global nor the right shape, so no birthdate was ever found.
        if (presetName && window.CharacterPresets && window.CharacterPresets.getCharacterPresets) {
            const presets = window.CharacterPresets.getCharacterPresets() || [];
            preset = presets.find(p => p && (p.name === presetName || String(p.id) === presetName)) || null;
        }
        if (preset && preset.birthDate) {
            const parts = String(preset.birthDate).split("-");
            if (parts.length === 3) {
                return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
            }
            return String(preset.birthDate);
        }
        if (actor._birthDate) return String(actor._birthDate);
        if (actor._birthYear) return `Year ${actor._birthYear}`;

        const actorId = actor.actorId ? actor.actorId() : actor._actorId;
        if (window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile) {
            const prof = window.NPCSocietyRegistry.getProfile(actorId);
            if (prof && prof.birthDate) return String(prof.birthDate);
            if (prof && prof.birthYear) return `Year ${prof.birthYear}`;
        }
        if (actor._backstory) {
            if (actor._backstory.birthDate) return String(actor._backstory.birthDate);
            if (actor._backstory.birthYear) return `Year ${actor._backstory.birthYear}`;
        }

        const tds = window.TimeDateSystem;
        const currentYear = (tds && tds.getDateTimeFromMinutes && tds.getGameTimeMinutes)
            ? tds.getDateTimeFromMinutes(tds.getGameTimeMinutes()).year : 2026;
        return `Year ${currentYear - 25}`;
    }

    function getLeaderFuneralPrayer(leader, deceasedName) {
        if (!leader) return `\"Rest in peace, ${deceasedName}. Your journey is remembered.\"`;
        const actor = leader;
        const prof = (window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile)
            ? window.NPCSocietyRegistry.getProfile(actor.actorId ? actor.actorId() : 1) : null;
        const ideology = actor._ideologyId || (prof && prof.ideologyId) || actor._religion || "";
        const idLower = String(ideology).toLowerCase();

        if (idLower.includes("sacred") || idLower.includes("orthodox") || idLower.includes("church") || idLower.includes("temple")) {
            return `\"May the Eternal Light receive your soul, ${deceasedName}, and grant you everlasting peace. Amen.\"`;
        } else if (idLower.includes("nature") || idLower.includes("pagan") || idLower.includes("animist") || idLower.includes("shaman")) {
            return `\"Return to the earth and the deep roots of the ancient forest, ${deceasedName}. Walk free among the spirits.\"`;
        } else if (idLower.includes("arcanist") || idLower.includes("void") || idLower.includes("cosmic") || idLower.includes("eldritch")) {
            return `\"To the astral tides and the starry deep, may the great expanse shelter your essence, ${deceasedName}.\"`;
        } else if (idLower.includes("martyr") || idLower.includes("zealot") || idLower.includes("warrior")) {
            return `\"Blood was paid and duty fulfilled, ${deceasedName}. Rise in honor beyond the veil.\"`;
        } else {
            return `\"Rest well, ${deceasedName}. Your battle is done, and your name will not be forgotten.\"`;
        }
    }

    function getMemberCommemorateLine(speaker, deceasedName) {
        const actor = speaker;
        const prof = (window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile)
            ? window.NPCSocietyRegistry.getProfile(actor.actorId ? actor.actorId() : 1) : null;
        const disp = (actor.disposition ? actor.disposition() : (prof && prof.disposition != null ? prof.disposition : 50));

        if (disp >= 70) {
            const pool = [
                `I'll never forget what you did for us, ${deceasedName}... Rest in peace.`,
                `You didn't deserve this, ${deceasedName}. We'll carry your memory with us.`,
                `May you find the peace you were looking for, my friend.`
            ];
            return pool[Math.floor(Math.random() * pool.length)];
        } else if (disp <= 35) {
            const pool = [
                `Told you recklessness would catch up to you, ${deceasedName}... damn it.`,
                `The road takes what it wants. Farewell, ${deceasedName}.`,
                `Quiet now, ${deceasedName}... sleep well.`
            ];
            return pool[Math.floor(Math.random() * pool.length)];
        } else {
            const pool = [
                `Another one claimed by the road. We have to keep moving, for ${deceasedName}'s sake.`,
                `They fought bravely until the end. We honor their memory.`,
                `Keep your guard up, everyone. ${deceasedName} wouldn't want us falling next.`
            ];
            return pool[Math.floor(Math.random() * pool.length)];
        }
    }

    // --- 1. Battle & Map Sprite Sideways Rendering (Downed State) ---

    const _Sprite_Actor_update_downed = Sprite_Actor.prototype.update;
    Sprite_Actor.prototype.update = function () {
        _Sprite_Actor_update_downed.call(this);
        if (this._actor && this._actor.isDead()) {
            this.rotation = Math.PI / 2;
            this.anchor.x = 0.5;
            this.anchor.y = 0.5;
        } else if (this.rotation === Math.PI / 2) {
            this.rotation = 0;
            this.anchor.x = 0.5;
            this.anchor.y = 1.0;
        }
    };

    const _Sprite_Character_update_downed = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function () {
        _Sprite_Character_update_downed.call(this);
        if (this._character instanceof Game_Follower) {
            const actor = this._character.actor && this._character.actor();
            if (actor && actor.isDead()) {
                this.rotation = Math.PI / 2;
                this.anchor.x = 0.5;
                this.anchor.y = 0.5;
            } else if (this.rotation === Math.PI / 2) {
                this.rotation = 0;
                this.anchor.x = 0.5;
                this.anchor.y = 1.0;
            }
        }
    };

    // --- 2. Follower Carrying for Downed Members ---

    // Hauling a body needs a spare pair of hands, not the last one. Two
    // travellers alone cannot manage it: the one still standing has the map,
    // the pack and the road to deal with, so a downed partner is left where
    // they fell until they come round. Three is enough, because one can carry
    // while the other walks. A summon out on the map is a body like any other
    // and counts toward the three, which is what makes calling one the answer
    // to a two-handed party.
    const CARRY_MIN_BODIES = 3;

    function carryingBodies() {
        let bodies = $gameParty ? $gameParty.size() : 0;
        if (window.SummonSystem && window.SummonSystem.isMapActive &&
            window.SummonSystem.isMapActive()) bodies++;
        return bodies;
    }

    function partyCanCarryDowned() {
        return carryingBodies() >= CARRY_MIN_BODIES;
    }

    // Walking in the column a downed member would trail along behind the party
    // on their own feet, which is not what being down means. Once there are
    // enough hands for it they are carried instead: the body is held on the
    // carrier's own tile, facing the way the carrier faces, for as long as they
    // are out.
    const _Game_Follower_update_carry = Game_Follower.prototype.update;
    Game_Follower.prototype.update = function () {
        _Game_Follower_update_carry.call(this);
        try {
            const actor = this.actor && this.actor();
            if (!actor || !actor.isDead()) return;
            // Too few of them to lift anybody: the body walks itself, the way
            // every other member does.
            if (!partyCanCarryDowned()) return;
            let carrier = null;
            if (!$gamePlayer.isTransparent() && $gameParty.leader() && !$gameParty.leader().isDead()) {
                carrier = $gamePlayer;
            } else {
                for (const other of $gamePlayer.followers().data()) {
                    const otherActor = other.actor && other.actor();
                    if (otherActor && !otherActor.isDead()) {
                        carrier = other;
                        break;
                    }
                }
            }
            if (carrier && carrier !== this) {
                this.locate(carrier.x, carrier.y);
                this.setDirection(carrier.direction());
                this.setThrough(true);
            }
        } catch (e) {
            console.error("[AutoIdleExplorer] downed member carry error:", e);
        }
    };

    // --- 3. Party Member Corpses (Blood & Oil / Hardcore) ---

    function getPartyCorpses() {
        if (!$gameSystem) return [];
        if (!$gameSystem._partyCorpses) $gameSystem._partyCorpses = [];
        return $gameSystem._partyCorpses;
    }

    function createPartyCorpseFromActor(actor) {
        if (!actor) return;
        const corpses = getPartyCorpses();
        const mapId = $gameMap.mapId();
        const px = $gamePlayer.x;
        const py = $gamePlayer.y;
        const regionKey = (mapId === PROC_MAP_ID) ? _procRegionKeyStr() : null;

        const equips = [];
        if (actor.equips) {
            for (const eq of actor.equips()) {
                if (eq) equips.push(eq);
            }
        }

        const corpse = {
            actorId: actor.actorId ? actor.actorId() : actor._actorId,
            name: actor.name(),
            characterName: actor.characterName(),
            characterIndex: actor.characterIndex(),
            mapId: mapId,
            x: px,
            y: py,
            procRegionKey: regionKey,
            equipped: equips,
            birthDate: getActorBirthDate(actor),
            buried: false,
            desecrated: false,
            createdAt: Date.now(),
        };
        corpses.push(corpse);
        return corpse;
    }

    // Hook death in Blood & Oil / Hardcore mode
    const _Scene_Map_handlePartyMemberDeath_downed = Scene_Map.prototype.handlePartyMemberDeath;
    Scene_Map.prototype.handlePartyMemberDeath = function (actor, actorName) {
        if (_isHardcoreOrBloodAndOil() && actor && actor.isDead()) {
            createPartyCorpseFromActor(actor);
        }
        _Scene_Map_handlePartyMemberDeath_downed.call(this, actor, actorName);
    };

    // Sprite representation for party member corpses
    function Sprite_PartyMemberCorpse(data) {
        this.initialize(data);
    }
    Sprite_PartyMemberCorpse.prototype = Object.create(Sprite.prototype);
    Sprite_PartyMemberCorpse.prototype.constructor = Sprite_PartyMemberCorpse;

    Sprite_PartyMemberCorpse.prototype.initialize = function (data) {
        Sprite.prototype.initialize.call(this);
        this._data = data;
        this._isBigCharacter = ImageManager.isBigCharacter(data.characterName);
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        this.rotation = Math.PI / 2;
        this.z = 1;
        this.bitmap = ImageManager.loadCharacter(data.characterName);
        this.bitmap.addLoadListener(this._onBitmapReady.bind(this));
    };

    Sprite_PartyMemberCorpse.prototype._onBitmapReady = function () {
        const bm = this.bitmap;
        const big = this._isBigCharacter;
        const pw = bm.width / (big ? 3 : 12);
        const ph = bm.height / (big ? 4 : 8);
        const idx = this._data.characterIndex || 0;
        const bx = big ? 0 : (idx % 4) * 3 * pw;
        const by = big ? 0 : Math.floor(idx / 4) * 4 * ph;
        this.setFrame(bx + pw, by, pw, ph);
        this.setBlendColor([180, 20, 20, 140]);
    };

    Sprite_PartyMemberCorpse.prototype.update = function () {
        Sprite.prototype.update.call(this);
        if (this._data.buried) {
            this.visible = false;
            return;
        }
        this.visible = true;
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        this.x = Math.round($gameMap.adjustX(this._data.x) * tw + tw / 2);
        this.y = Math.round($gameMap.adjustY(this._data.y) * th + th / 2);
    };

    // Hook Spriteset_Map to add party corpse sprites
    const _Spriteset_Map_createCharacters_partyCorpse = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function () {
        _Spriteset_Map_createCharacters_partyCorpse.call(this);
        this._partyCorpseSprites = [];
        const currentMap = $gameMap ? $gameMap.mapId() : 0;
        const currentRegion = (currentMap === PROC_MAP_ID) ? _procRegionKeyStr() : null;

        const corpses = getPartyCorpses().filter(c => {
            if (c.buried) return false;
            if (c.mapId !== currentMap) return false;
            if (currentRegion && c.procRegionKey && c.procRegionKey !== currentRegion) return false;
            return true;
        });

        for (const data of corpses) {
            const sprite = new Sprite_PartyMemberCorpse(data);
            this._tilemap.addChild(sprite);
            this._partyCorpseSprites.push(sprite);
        }
    };

    // --- 4. Interacting with Party Corpse & Grave ---

    function getPartyCorpseAt(x, y) {
        const currentMap = $gameMap ? $gameMap.mapId() : 0;
        const currentRegion = (currentMap === PROC_MAP_ID) ? _procRegionKeyStr() : null;
        return getPartyCorpses().find(c => {
            if (c.buried) return false;
            if (c.mapId !== currentMap) return false;
            if (currentRegion && c.procRegionKey && c.procRegionKey !== currentRegion) return false;
            return c.x === x && c.y === y;
        });
    }

    function getWorldGraves() {
        if (!window.WorldManager) return [];
        const list = window.WorldManager.getField("world_graves", "graves");
        return Array.isArray(list) ? list : [];
    }

    function getPartyGraveAt(mapId, x, y) {
        const regionKey = (mapId === PROC_MAP_ID) ? _procRegionKeyStr() : null;
        return getWorldGraves().find(g => {
            if (g.mapId !== mapId) return false;
            if (regionKey && g.procRegionKey && g.procRegionKey !== regionKey) return false;
            return g.x === x && g.y === y;
        });
    }

    function showCorpseMenu(corpse) {
        if (!corpse) return;
        const choices = [
            T('AutoIdle.corpse.choiceLoot'), T('AutoIdle.corpse.choiceCommemorate'),
            T('AutoIdle.corpse.choicePray'), T('AutoIdle.corpse.choiceDissect'),
            T('AutoIdle.corpse.choiceBury'), T('AutoIdle.corpse.choiceCancel'),
        ];
        $gameMessage.setChoices(choices, 0, 5);
        $gameMessage.onChoice(function (n) {
            if (n === 0) {
                // Loot
                handleCorpseLoot(corpse);
            } else if (n === 1) {
                // Commemorate
                handleCorpseCommemorate(corpse);
            } else if (n === 2) {
                // Pray
                handleCorpsePray(corpse);
            } else if (n === 3) {
                // Dissect
                handleCorpseDissect(corpse);
            } else if (n === 4) {
                // Bury
                handleCorpseBury(corpse);
            }
        });
        $gameMessage.add(T('AutoIdle.corpse.prompt', { name: corpse.name }));
    }

    function handleCorpseLoot(corpse) {
        if (!corpse) return;
        if (window.ContainerManager && typeof Scene_Container !== "undefined") {
            const containerId = `party_corpse_${corpse.actorId}_${corpse.x}_${corpse.y}`;
            const container = window.ContainerManager.getContainer(containerId);
            if (corpse.equipped && corpse.equipped.length) {
                for (const item of corpse.equipped) {
                    if (item && window.ItemUtils) {
                        const key = window.ItemUtils.encodeKey(item);
                        if (!container[key]) container[key] = 1;
                    }
                }
            }
            SceneManager.push(Scene_Container);
            SceneManager.prepareNextScene(containerId, false);
        } else {
            // Fallback loot directly into party inventory
            if (corpse.equipped && corpse.equipped.length) {
                for (const item of corpse.equipped) {
                    if (item) $gameParty.gainItem(item, 1, false);
                }
                $gameMessage.add(T('AutoIdle.corpse.looted', { name: corpse.name }));
                corpse.equipped = [];
            } else {
                $gameMessage.add(T('AutoIdle.corpse.nothingToLoot', { name: corpse.name }));
            }
        }
    }

    function handleCorpseCommemorate(corpse) {
        if (!corpse) return;
        Loose.gatherNear();
        const leader = $gameParty.leader();
        const livingFollowers = $gamePlayer.followers().data().filter(f => f.isVisible() && f.actor && !f.actor().isDead());

        if (leader) {
            const leaderLine = getMemberCommemorateLine(leader, corpse.name);
            $gameMessage.add(`\\C[1]${leader.name()}:\\C[0] \"${leaderLine}\"`);
        }

        for (const f of livingFollowers) {
            const act = f.actor();
            const line = getMemberCommemorateLine(act, corpse.name);
            $gameMessage.add(`\\C[2]${act.name()}:\\C[0] \"${line}\"`);
        }
    }

    function handleCorpsePray(corpse) {
        if (!corpse) return;
        const leader = $gameParty.leader();
        const prayer = getLeaderFuneralPrayer(leader, corpse.name);
        $gameMessage.add(`\\C[1]${leader ? leader.name() : "Leader"}:\\C[0] ${prayer}`);
    }

    function handleCorpseDissect(corpse) {
        if (!corpse) return;
        if (typeof Scene_BodyPartHarvest !== "undefined") {
            const harvestCorpse = {
                enemyId: null,
                actorId: corpse.actorId,
                name: corpse.name,
                x: corpse.x,
                y: corpse.y,
                mapId: corpse.mapId,
                _harvestedParts: {},
            };
            SceneManager.push(Scene_BodyPartHarvest);
            SceneManager.prepareNextScene(harvestCorpse);
        } else if (typeof Scene_HealthStatus !== "undefined") {
            SceneManager.push(Scene_HealthStatus);
        } else {
            $gameMessage.add(T('AutoIdle.corpse.examined'));
        }
    }

    function handleCorpseBury(corpse) {
        if (!corpse) return;
        // Play digging sound
        try {
            AudioManager.playSe({ name: "Earth1", volume: 90, pitch: 100, pan: 0 });
        } catch (e) {}

        $gameScreen.startFadeOut(24);
        setTimeout(() => {
            corpse.buried = true;

            const mapId = $gameMap.mapId();
            const isProc = (mapId === PROC_MAP_ID);
            const isWorld315 = (mapId === WORLD_MAP_ID || mapId === 315);

            if (!isWorld315) {
                const graveData = {
                    name: corpse.name,
                    actorId: corpse.actorId,
                    birthDate: corpse.birthDate,
                    mapId: mapId,
                    x: corpse.x,
                    y: corpse.y,
                    procRegionKey: corpse.procRegionKey,
                    loot: (corpse.equipped && corpse.equipped.length) ? [...corpse.equipped] : [],
                    feature: "Grave",
                    desecrated: false,
                    buriedAt: Date.now()
                };

                if (isProc) {
                    // Save to WorldManager world data
                    if (window.WorldManager) {
                        const graves = getWorldGraves();
                        graves.push(graveData);
                        window.WorldManager.setField("world_graves", "graves", graves);
                        if (window.WorldManager.activeWorldName) {
                            window.WorldManager.writeWorldFile(window.WorldManager.activeWorldName, "world_graves", { graves });
                        }
                    }
                    // Place terrain feature if ProcGen data exists
                    if ($gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.terrainFeatures) {
                        $gameSystem._procGenData.terrainFeatures.push({
                            name: "Grave",
                            x: corpse.x,
                            y: corpse.y,
                            specialPartyGrave: graveData
                        });
                    }
                } else {
                    // Non-procedural map: find event called 'gravestone'
                    const gravestoneEvent = $gameMap.events().find(e => e && e.event() && String(e.event().name).toLowerCase() === "gravestone");
                    if (gravestoneEvent) {
                        gravestoneEvent.locate(corpse.x, corpse.y);
                        gravestoneEvent.setOpacity(255);
                        gravestoneEvent.setThrough(false);
                        gravestoneEvent._partyGraveData = graveData;
                    }
                }
            }

            $gameScreen.startFadeIn(24);
            $gameMessage.add(T('AutoIdle.corpse.buried', { name: corpse.name }));
        }, 500);
    }

    function showSpecialGraveMenu(grave, onDismantle) {
        if (!grave) return;
        const choices = [T('AutoIdle.grave.choiceRead'), T('AutoIdle.grave.choiceDesecrate'), T('AutoIdle.grave.choiceDismantle'), T('AutoIdle.grave.choiceCancel')];
        $gameMessage.setChoices(choices, 0, 3);
        $gameMessage.onChoice(function (n) {
            if (n === 0) {
                // Read
                $gameMessage.add(T('AutoIdle.grave.epitaph', {
                    name: grave.name,
                    born: grave.birthDate || T('AutoIdle.grave.bornUnknown'),
                }));
            } else if (n === 1) {
                // Desecrate
                handleGraveDesecrate(grave);
            } else if (n === 2) {
                // Dismantle
                handleGraveDismantle(grave, onDismantle);
            }
        });
        $gameMessage.add(T('AutoIdle.grave.prompt', { name: grave.name }));
    }

    function handleGraveDesecrate(grave) {
        if (!grave) return;
        // Grant bones in any case
        const boneItem = $dataItems.find(i => i && i.name && i.name.toLowerCase().includes("bone")) || $dataItems[1];
        if (boneItem) {
            $gameParty.gainItem(boneItem, 2, false);
        }

        // Grant remaining equipped loot if buried with gear
        if (grave.loot && grave.loot.length) {
            for (const item of grave.loot) {
                if (item) $gameParty.gainItem(item, 1, false);
            }
            grave.loot = [];
        }

        // Record graverobbing crime if CrimeSystem exists
        if (window.CrimeSystem && typeof window.CrimeSystem.commitCrime === "function") {
            window.CrimeSystem.commitCrime("graverobbing");
        } else if (window.CrimeSystem && typeof window.CrimeSystem.recordCrime === "function") {
            window.CrimeSystem.recordCrime("graverobbing");
        }

        grave.desecrated = true;
        $gameMessage.add(T('AutoIdle.grave.desecrated', { name: grave.name }));
    }

    function handleGraveDismantle(grave, onDismantle) {
        if (!grave) return;
        // Yield materials
        const stoneItem = $dataItems.find(i => i && i.name && i.name.toLowerCase().includes("stone")) || $dataItems[1];
        if (stoneItem) $gameParty.gainItem(stoneItem, 1, false);

        // Remove from world graves
        if (window.WorldManager) {
            let graves = getWorldGraves();
            graves = graves.filter(g => !(g.mapId === grave.mapId && g.x === grave.x && g.y === grave.y));
            window.WorldManager.setField("world_graves", "graves", graves);
            if (window.WorldManager.activeWorldName) {
                window.WorldManager.writeWorldFile(window.WorldManager.activeWorldName, "world_graves", { graves });
            }
        }
        if (typeof onDismantle === "function") {
            onDismantle();
        }
        $gameMessage.add(T('AutoIdle.grave.dismantled', { name: grave.name }));
    }

    // Intercept button trigger for party corpses and gravestones
    const _Game_Player_triggerButtonAction_partyCorpse = Game_Player.prototype.triggerButtonAction;
    Game_Player.prototype.triggerButtonAction = function () {
        if (Input.isTriggered("ok") && !this.isInVehicle()) {
            const d = this.direction();
            const fx = $gameMap.roundXWithDirection(this.x, d);
            const fy = $gameMap.roundYWithDirection(this.y, d);

            // Check party corpse
            const corpseFacing = getPartyCorpseAt(fx, fy) || getPartyCorpseAt(this.x, this.y);
            if (corpseFacing) {
                showCorpseMenu(corpseFacing);
                return true;
            }

            // Check special party grave on map
            const grave = getPartyGraveAt($gameMap.mapId(), fx, fy) || getPartyGraveAt($gameMap.mapId(), this.x, this.y);
            if (grave) {
                showSpecialGraveMenu(grave);
                return true;
            }

            // Check Gravestone event on non-procedural map
            const gravestoneEvent = $gameMap.eventsXy(fx, fy).concat($gameMap.eventsXy(this.x, this.y))
                .find(e => e && e._partyGraveData);
            if (gravestoneEvent) {
                showSpecialGraveMenu(gravestoneEvent._partyGraveData, () => {
                    gravestoneEvent.locate(0, 0);
                    gravestoneEvent.setOpacity(0);
                    gravestoneEvent.setThrough(true);
                    gravestoneEvent._partyGraveData = null;
                });
                return true;
            }
        }
        return _Game_Player_triggerButtonAction_partyCorpse.call(this);
    };

    // --- 4b. Keeping the party on the map in step with the party on paper ---
    // Somebody is dragged in or out of the party on the Dynamics board
    // (UI/CustomMainMenuLayout.js), or signs on from Empathize, while the map is
    // still standing there behind the menu. RPG Maker rebuilds the follower
    // train from $gameParty on a refresh and no sooner, so without this the new
    // companion has no sprite and the one who left keeps walking along: the
    // members on the map are replaced here, once, wherever the change came from.
    function syncPartySprites() {
        if (typeof $gamePlayer === "undefined" || !$gamePlayer) return;
        if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.mapId()) return;
        $gamePlayer.refresh();
        $gamePlayer.followers().refresh();
        // The loose layer scatters the party over its own tiles, so a member who
        // was never on the map has nowhere to stand until it places them.
        Loose.gatherNear();
    }

    const _Game_Party_addActor_sprites = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function (actorId) {
        const had = this._actors.includes(actorId);
        _Game_Party_addActor_sprites.call(this, actorId);
        if (!had) syncPartySprites();
    };

    const _Game_Party_removeActor_sprites = Game_Party.prototype.removeActor;
    Game_Party.prototype.removeActor = function (actorId) {
        const had = this._actors.includes(actorId);
        _Game_Party_removeActor_sprites.call(this, actorId);
        if (had) syncPartySprites();
    };

    // --- 5. Leader Succession on Death in Permadeath / Blood & Oil ---

    const _Game_Actor_processMapDeath_succession = Game_Actor.prototype.processMapDeath;
    Game_Actor.prototype.processMapDeath = function () {
        if (this === $gameParty.members()[0]) {
            if (_isHardcoreOrBloodAndOil()) {
                const livingMembers = $gameParty.members().filter(m => m && !m.isDead() && m !== this);
                if (livingMembers.length > 0) {
                    const deceasedName = this.name();
                    createPartyCorpseFromActor(this);
                    if (window.BattleMood) {
                        try { window.BattleMood.onMemberLost(this); } catch (e) {}
                    }
                    $gameParty.removeActor(this.actorId());
                    $gamePlayer.refresh();
                    $gamePlayer.followers().refresh();
                    Loose.gatherNear();
                    $gameMessage.add(T ? T('Battle.actorDied', { actor: deceasedName }) : `${deceasedName} has fallen.`);
                    $gameMessage.add(T('AutoIdle.succession.takesCommand', { name: livingMembers[0].name() }));
                    return;
                }
            }
        }
        if (typeof _Game_Actor_processMapDeath_succession === "function") {
            _Game_Actor_processMapDeath_succession.call(this);
        }
    };

    // ========================================================================
    // The two regroup commands
    // ========================================================================
    // The interpreter stops on this wait mode until the walk is over, so the
    // command written under one of these runs with the party already closed up.
    const _Game_Interpreter_updateWaitMode_regroup = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function () {
        if (this._waitMode === REGROUP_WAIT) {
            if (Regroup.busy()) return true;
            this._waitMode = "";
            return false;
        }
        return _Game_Interpreter_updateWaitMode_regroup.call(this);
    };

    function registerRegroup(names, start) {
        for (const name of names) {
            PluginManager.registerCommand(PLUGIN, name, function () {
                start();
                if (Regroup.busy()) this.setWaitMode(REGROUP_WAIT);
            });
        }
    }

    // The names as the editor lists them, and the names as they read in a
    // command list, both of them accepted.
    registerRegroup(["PartyRegroup", "party regroup"], () => Regroup.startParty());
    registerRegroup(["EmBubbaRegroup", "Em Bubba regroup"], () => Regroup.startPair());

})();
