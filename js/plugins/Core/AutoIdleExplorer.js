/*:
 * @target MZ
 * @plugindesc v1.5.0 Auto Idle Explorer + Loose Party, the CPU explores for an idle player, and the party lives its own life.
 * @author esoteric-heavy-industries & Assistant
 *
 * @help AutoIdleExplorer.js
 *
 * Two independent features. The autopilot is an option on the Gameplay tab of
 * the Options menu; the loose party below is simply how the party walks.
 *
 * ============================================================================
 * 1. THE LOOSE PARTY (always on)
 * ============================================================================
 *
 * The marching column every RPG Maker game ships with, each member walking in
 * the leader's exact footsteps one tile back and never stopping, is gone: the
 * party has no other formation than this one and there is nothing to choose.
 *
 * Loose cuts that rope. The other members keep the leader company rather than
 * following them:
 *
 *   • They live their own lives around the leader and head back only once they
 *     have been carried OFF THE SCREEN, picking their own way with the engine's
 *     A* pathfinding and respecting the terrain. The screen is the leash: a
 *     member the player can
 *     see has not been left behind, however many tiles of a wide map lie between
 *     them, so walking about near the party never drags anybody back into line.
 *     One left a good way past the edge (`looseSnap` tiles) is simply put back
 *     at the leader's shoulder rather than made to walk the whole way.
 *   • Between walks they take up an activity the way an NPC does: standing and
 *     thinking, going over to look at something, or walking up to a person on
 *     the map and holding a short conversation with them. A conversation is a
 *     real one: it moves what that person thinks of THAT member (their own
 *     standing, not the party's) up or down, and the state of the member doing
 *     the talking is part of it, so somebody who has not washed in three days
 *     is worse company. They stroll within `looseLeash` tiles of the leader.
 *   • They talk to EACH OTHER as readily as to the town, the leader included:
 *     roughly half the time a member looking for company turns to their own
 *     first. That conversation has two sides, so both ledgers move, each of
 *     them comes away thinking a little more (or a little less) of the other,
 *     on the same per-member standing the Empathize panel shows. How much they
 *     have in common and how either of them smells decide which way it goes.
 *     What is actually SAID between two of their own comes from
 *     NPC/PartyBanter.js, which is a bank written for people who already know
 *     each other rather than the greeting the town gets: a discussion of two to
 *     four beats about where they are standing, what the party diary says just
 *     happened to them, what they just spent the money on, or simply what these
 *     two personalities do to each other. A third member standing close enough
 *     when it starts is in the conversation and gets lines of their own. Every
 *     other bubble a member pops on their own, a thought, a look, a sit-down, a
 *     cry after the leader, is drawn from THEIR personality first and falls back
 *     to the plain pool here. None of that applies to a party of one, who has
 *     the plain pools and nothing else.
 *   • They look after themselves, off the very same capability registry the
 *     town's NPCs use (NPC/NPCSimulationCore.js), so a party member and a
 *     townsperson recognise a washroom by one rule and the table that teaches
 *     one teaches the other. A meter under 35% sends that member looking:
 *       hunger  eats the smallest thing in the pack that covers it
 *       hygiene walks to a WC / bathroom / shower / sink / fountain
 *       fun     walks to an arcade cabinet, a piano, a pool table
 *       company walks up to a person and talks to them
 *       sleep   rents a free room with the party's money (the door then opens
 *               for everybody), or sits down on a region 102 rest tile
 *     Everything they do to a meter, every room rented, every meal eaten and
 *     every opinion moved is announced as a toast, because it happens while
 *     the player is looking somewhere else.
 *   • A SPRINT calls them in, and only a sustained one: two seconds of running
 *     before the column forms, so a dash through a doorway is not a recall.
 *     What forms is the engine's own caterpillar: whoever is already within a
 *     tile of the person in FRONT of them is handed straight back to the
 *     vanilla chase, so they trail one behind the other in the leader's exact
 *     footsteps; anybody further back runs to that same shoulder, never to the
 *     leader, so the party strings out into a line instead of piling onto the
 *     one they are all following. They hold it for as long as the sprint lasts
 *     and come apart the moment it ends. Walking never calls them in at all,
 *     which is what makes Loose the party living its own life rather than a
 *     column with a longer rope. One member calls after the leader when it
 *     happens, rarely.
 *   • Sometimes they simply walk WITH the leader for a while of their own
 *     accord, keeping a couple of tiles off their shoulder at the leader's own
 *     pace, and then go back to their own business. They amble a notch under
 *     the leader's speed otherwise, hurry when they are out of sight, and now
 *     and then take a turn of speed for no reason at all.
 *   • On the WORLD MAP the leash is a hard two tiles. One tile there is a
 *     whole region of the continent, so a member who strolls the seven tiles
 *     they would stroll in a village has walked into another country while
 *     still sitting comfortably on the screen. They keep their activities, they
 *     simply keep them at the leader's elbow.
 *   • They swim. A member cut off by water, or following a leader who has swum
 *     off, gets in and swims across it (region 99, or a water tile on the
 *     procedural map) and climbs out on the far bank. They never DIVE: going
 *     under is the player's business.
 *   • They are gathered up automatically when the player returns from a
 *     battle, takes a transfer event, or changes map: each member is placed on
 *     a free tile around the leader rather than left behind on the old map.
 *   • Stand facing one and press OK to talk to them: that opens their
 *     Empathize panel directly, the same sheet the Dynamics roster opens.
 *
 * PETS AND FOLLOWERS WALK THE SAME WAY. The extra trailing slot owned by
 * NPC/PetFollowerSystem.js (a pet, a child, or a creature that came along of its
 * own accord) keeps to itself on every map: it wanders, visits and looks like
 * everyone else, but it says none of the party's chatter, and it comes when the
 * leader runs like everyone else.
 *
 * The loose behaviour stands down wherever the party has to act as one body:
 * in a vehicle, while an event or a message is running, and whenever anything
 * calls Gather Party (the members close ranks the vanilla way, then scatter
 * again once it is over).
 *
 * IN SPLIT-SCREEN it keeps going (Multiplayer/SplitScreenMultiplayer.js). The
 * session no longer empties the party down to the two players: Player 1 walks
 * the leader, Player 2 walks whichever member they have taken over, and every
 * other member is left to the CPU here, living their own life around the two of
 * them. The one body the CPU never touches is Player 2's, which is drawn as the
 * P2 avatar and whose follower slot rides along hidden underneath it.
 *
 * It also stands down for a MAP BATTLE (BattleSystem/MapBattleMode.js), where
 * every member becomes a tactical battler that MapBattleMode walks itself, tile
 * by tile. A fight opening on a scattered party calls standDown() below, so
 * nobody comes back from the battlefield to an errand they had forgotten.
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
 * @param looseLeash
 * @text Loose Wander Radius (tiles)
 * @desc How far from the leader a party member strolls while idling. Coming back is decided by the screen.
 * @type number
 * @min 2
 * @max 40
 * @default 7
 *
 * @param looseSnap
 * @text Loose Snap Margin (tiles)
 * @desc Tiles past the edge of the screen before a member left behind is simply put back beside the leader.
 * @type number
 * @min 4
 * @max 60
 * @default 10
 *
 * @param looseChatter
 * @text Loose Chatter
 * @desc Show the speech bubbles a loose party member trades with the people they walk up to.
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
    const LOOSE_CHATTER = params.looseChatter !== "false";
    // The party keeps to itself unless the leader is really covering ground.
    // A SPRINT calls them in, but not the instant it starts: two seconds of it
    // (RECALL_RUN), so a hop over a puddle or a dash through a doorway is not a
    // recall. They then hold the column for as long as the sprint lasts and let
    // go the moment it ends, give or take the frame or two of RECALL_DROP that
    // separate one dashed step from the next.
    const RECALL_RUN  = 120;
    const RECALL_DROP = 20;
    // How the column is shaped once they have been called in. A member within
    // this many tiles of the person in FRONT of them is already in the file and
    // is left entirely to the engine's own caterpillar chase, which walks them
    // into the tile that person is leaving. Anybody further back closes on that
    // same shoulder, not on the leader, so the party trails behind in a line
    // rather than piling onto the one they are all following.
    const COLUMN_GAP = 1;
    // How long somebody the leader walked into stands still after stepping out
    // of the way, so they do not drift back under the player's feet.
    const NUDGE_HOLD = 45;
    // "Wait for me!" is for the moment they are left behind, not for every
    // sprint: one member says it, rarely, and not again for a good while.
    const RECALL_CRY_ODDS = 0.3;
    const RECALL_CRY_COOL = 1800;
    // Tagging along of their own accord: how often a member chooses it over an
    // errand, how long they stay at the leader's shoulder, and how close they
    // keep. Plus the odd turn of speed, whatever they are doing.
    const FOLLOW_ODDS      = 0.3;
    const FOLLOW_MIN       = 240;   // 4 seconds
    const FOLLOW_MAX       = 1200;  // 20 seconds
    const FOLLOW_NEAR      = 2;
    const FOLLOW_DASH_ODDS = 0.25;
    // What tells a member they have been left behind is the SCREEN, not a tile
    // count: somebody the player can see is not lost, however far across a wide
    // map they have wandered, and a leader walking about near them should never
    // drag them back into line. This is the margin, measured from the edge of
    // the screen outward in tiles, past which they are simply put back.
    const LOOSE_SNAP_MARGIN = Math.max(4, Number(params.looseSnap) || 10);
    // Once heading back, keep walking until this far INSIDE the edge again, so a
    // member does not stop dead on the rim and drift straight back out of it.
    const LOOSE_BACK_INSET = 2;
    // Nobody is ever allowed to actually leave the screen: this is the band
    // just INSIDE the edge that already counts as gone, so a member turns for
    // the leader while they can still be seen rather than after they cannot.
    const LOOSE_EDGE_INSET = 1;
    // How far ahead the camera is read when asking the same question: the
    // leader walking away carries the screen with them, and a member standing
    // near the trailing edge is about to be off it even standing still.
    const LOOSE_CAMERA_LOOKAHEAD = 2;
    // A stroll stays a stroll: this is how far a member sets out to go, which is
    // not the same question as when they come back.
    const LOOSE_ROAM = Math.min(Math.max(2, Number(params.looseLeash) || 7), 12);
    // The world map is the one place where the screen is the wrong leash: a
    // tile there is a whole region, so a member wandering to the far side of
    // the screen has wandered across a country. There, and only there, the
    // leash is a hard tile count, and nobody may be further than this from the
    // leader whatever errand they are on.
    const WORLD_LEASH = 2;
    // In procedural interiors (dungeons, crypts, sewers, caves), party members
    // stay close to the leader so they remain within the shared lantern light pool.
    const DUNGEON_LEASH = 3;

    // ------------------------------------------------------------------ needs
    // A loose member attends to themselves the way the town's NPCs do, off the
    // very same capability registry (NPC/NPCSimulationCore.js): a washroom for
    // hygiene, an arcade cabinet for fun, a bed for the night, a person to talk
    // to for company. What each thing on the map is good for is answered in one
    // place, NPCSim.InteractionScanner, so teaching the town teaches the party.
    const NEED_LOW    = 35;   // a meter at or under this sends a member looking
    const NEED_SCAN   = 14;   // tiles they will walk to attend to one
    const NEED_TRIES  = 140;  // steps before an errand is written off
    const NEED_RETRY  = 300;  // frames before a fruitless search is tried again
    const REST_REGION = 102;  // the region NPCs sit and rest on
    // What one visit to the right place is worth. Deliberately partial: a bath
    // is not a spa day, and the meter has to be worth topping up again later.
    const NEED_FILL   = { hygiene: 45, leisure: 35, social: 18, sleep: 55, comfort: 25 };
    // A meal is taken from the pack the moment it is wanted, so hunger is the
    // one need with no errand attached to it.
    const HUNGER_EAT  = 45;
    const LOOSE_SCAN = 9;     // tiles a member looks around for company
    // How often a member looking for company looks to their OWN first, the
    // leader or whoever else is walking with them, rather than to the town. A
    // party that only ever talks to strangers reads as a column of strangers.
    // Kept under a half: a party discussion is two to four beats and the town's
    // greeting is one, so equal odds make the party the louder half of the map.
    const PARTY_TALK_ODDS = 0.36;
    // A third member standing this close when two of their own start talking is
    // in the conversation, not next to it: they get a line and they get faced.
    const PARTY_THIRD_RANGE = 3;
    const VISIT_COOLDOWN = 1200; // frames before a member calls on the same face again
    const BUBBLE_MS = 3400;   // how long one line of chatter stays up
    // A party that comments on everything talks over itself and over the town,
    // so a line is rationed: a member keeps quiet for a while after saying one,
    // no two members speak on top of each other, and a proper discussion is
    // something that happens every so often rather than at every stop. The
    // beats of a discussion already in progress are exempt, they are one
    // exchange and are paced by their own waits.
    const CHATTER_COOL = 1500;  // frames before the same member says another line (~25s)
    const CHATTER_GAP  = 420;   // frames between any two party lines (~7s)
    const TALK_COOL    = 1200;  // frames before the party holds another discussion (~20s)
    const IDLE_TALK_ODDS = 0.16; // odds a member standing about voices the thought at all

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

    // ========================================================================
    // The loose party: the members live their own lives around the leader
    // ------------------------------------------------------------------------
    // What the engine ships is a marching column: Game_Followers.updateMove
    // walks every member through the tile the one in front just left, so the
    // party is a rope the leader drags. This cuts that rope, and there is no
    // option to tie it back on. The members are no longer moved by the leader's
    // steps at all: each one is given the map, a leash around the leader and an
    // activity, and walks itself with the engine's own A* (the same
    // findDirectionTo the autopilot above uses).
    //
    // The rope is spliced back on for exactly as long as the party has to act as
    // one body: a dashing leader (they drop everything and come), an event's
    // Gather Party, a vehicle, split-screen, a battle. Everything else, a
    // transfer, a change of map, walking out of a fight, is handled by putting
    // the members back at the leader's shoulder outright rather than making them
    // walk home across a map they were never on.
    // ========================================================================

    // Names that are furniture rather than people. A follower will happily walk
    // over to look at a chest, but a door or a teleport marker is a thing the
    // party uses, not someone it talks to.
    const NON_PERSON = /door|teleport|transfer|house|room|plant|animal|chest|sign|delivery|vehicle|player2|enemy/i;

    function isPersonEvent(ev) {
        if (!ev || ev === $gamePlayer || ev._erased) return false;
        if (ev.isTransparent && ev.isTransparent()) return false;
        if (!ev.characterName || !ev.characterName()) return false; // a tile, not a body
        const name = (ev.event() && ev.event().name) || "";
        if (NON_PERSON.test(name)) return false;
        return !isEnemyEvent(ev);
    }

    // Something worth stopping to look at: an event that is not a person and not
    // a way out of the map (walking up to a teleport tile would look like the
    // member was about to leave).
    function isSceneryEvent(ev) {
        if (!ev || ev === $gamePlayer || ev._erased) return false;
        if (ev.isTransparent && ev.isTransparent()) return false;
        const name = (ev.event() && ev.event().name) || "";
        if (/teleport|transfer|door|fast\s*travel|player2/i.test(name)) return false;
        return !isPersonEvent(ev) && !isEnemyEvent(ev);
    }

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
            const canvas = document.getElementById("gameCanvas");
            const r = canvas ? canvas.getBoundingClientRect() : null;
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

    const Loose = {
        _recall: false,
        _still: 0,      // frames the leader has stood still during a recall
        // Per-member AI state, kept module-side and keyed by party slot rather
        // than written onto the Game_Follower: followers are serialised into the
        // savegame, and a live Game_Event reference in there would be cloned
        // into the save as a second copy of that event.
        _states: [],
        mapId: 0,
        // Chatter rationing. Frame stamps only, so nothing here has to be saved:
        // who spoke last and when, when the party last held a discussion, and a
        // hold that outlasts both (a map change, closing ranks).
        _saidAt: new WeakMap(),
        _lastLineAt: -CHATTER_GAP,
        _lastTalkAt: -TALK_COOL,
        _quietUntil: 0,

        // A pet, a child or a creature that came along of its own accord
        // (NPC/PetFollowerSystem.js) walks the map like everybody else, but it
        // is not one of the party: none of the party's chatter is its to say,
        // and it has no actor behind it to keep a standing with.
        isPet(f) {
            return !!(window.Game_PetFollower && f instanceof window.Game_PetFollower);
        },

        stateOf(f) {
            const i = f._memberIndex || 0;
            let s = this._states[i];
            if (!s) {
                s = this._states[i] = {
                    act: "idle", wait: 0, gx: null, gy: null, partner: null, beat: 0, tries: 0,
                    need: null, rent: false, until: 0, dash: false,
                    // The discussion in progress (PartyBanter beats) and the
                    // characters saying it, speaker-index aligned.
                    talk: null, talkChars: null,
                    // Who this member has already been over to see, and when. A
                    // party standing in a village would otherwise queue up in
                    // front of the one villager nearest the leader all evening.
                    seen: new Map(),
                };
            }
            return s;
        },

        // Has this member just dealt with that character?
        stale(s, c) {
            const last = s.seen.get(c);
            return last !== undefined && Graphics.frameCount - last < VISIT_COOLDOWN;
        },

        remember(s, c) {
            s.seen.set(c, Graphics.frameCount);
            if (s.seen.size > 24) s.seen.delete(s.seen.keys().next().value);
        },

        resetStates() {
            this._states = [];
            // Arriving somewhere is not a cue to start talking: give the party a
            // beat to look around before anybody says anything.
            this._quietUntil = Graphics.frameCount + CHATTER_COOL;
        },

        clearGoal(s) {
            s.act = "idle";
            s.gx = s.gy = null;
            s.partner = null;
            s.talk = null;
            s.talkChars = null;
            s.beat = 0;
            s.tries = 0;
            s.need = null;
            s.rent = false;
            s.until = 0;
            s.isRomance = undefined;
            s.romanceData = null;
        },

        // A map battle (BattleSystem/MapBattleMode.js) turns every member into a
        // tactical battler that MapBattleMode walks itself. The whole loose
        // layer stands down for the duration of the fight.
        inMapBattle() {
            return !!(window.MapBattleMode && window.MapBattleMode.isActive());
        },

        // Called by MapBattleMode when a fight opens on top of a loose party:
        // drop every errand and every bubble, so nobody walks back to a stale
        // goal once the fight is over, and nobody stands in the middle of a
        // battlefield thinking about the flowers.
        standDown() {
            this._recall = false;
            this._still = 0;
            this._run = 0;
            this.resetStates();
            Bubbles.clear();
        },

        // True while the loose layer owns the followers. Everything that needs
        // the party to move as one body switches it back off, and the vanilla
        // chase takes over again for the duration.
        active() {
            return this.conditionsMet();
        },

        // The same question asked of one member. They all answer together now,
        // the pet slot included, but the per-member form is what the rest of
        // the codebase calls.
        activeFor(f) {
            return !!f && !this.heldByP2(f) && this.conditionsMet();
        },

        // Riding, the party is normally stowed inside the hull with the leader and
        // has no business walking anywhere. The Bike is the exception: there is no
        // hull, every member is on a bicycle of their own out in the open
        // (Vehicle/VehicleSystem.js swaps their sheets for it), and they can keep
        // to the same ground the leader is pedalling over. The Broom cannot -
        // nobody walks after somebody flying across a lake - so
        // isPartyRidingAlong() is false for that one.
        stowedInVehicle() {
            if (!$gamePlayer || !$gamePlayer.isInVehicle()) return false;
            const vs = window.MergedVehicleSystem;
            return !(vs && vs.isPartyRidingAlong && vs.isPartyRidingAlong());
        },

        // The states of the game in which no follower may be walking itself.
        conditionsMet() {
            if (this.inMapBattle()) return false;
            // A <Platform> map is a side view platformer (Map/PlatformerMode.js):
            // the followers replay the leader's jump arc, and nothing here may
            // walk one off a ledge on its own.
            if (window.PlatformerMode && window.PlatformerMode.isActive()) return false;
            if (!$gamePlayer || !$gameMap || !$gameParty || !$gameMessage) return false;
            if (!(SceneManager._scene instanceof Scene_Map)) return false;
            if ($gameParty.inBattle()) return false;
            if (!$gamePlayer.followers().isVisible()) return false;
            if (this.stowedInVehicle()) return false;
            if ($gamePlayer._vehicleGettingOn || $gamePlayer._vehicleGettingOff) return false;
            return true;
        },

        // The body the second player is holding in a split-screen session
        // (Multiplayer/SplitScreenMultiplayer.js). That member is walked by the
        // pad, not by the CPU, so the loose layer leaves the slot alone.
        heldByP2(f) {
            const ss = window.SplitScreenManager;
            if (!ss || !ss.active || typeof ss.isP2Follower !== "function") return false;
            return ss.isP2Follower(f);
        },

        // The party is being called in: by a leader who broke into a run, or by
        // anything that asked for a Gather Party.
        recalling() {
            if ($gamePlayer && $gamePlayer.areFollowersGathering()) return true;
            return this._recall;
        },

        // The activity AI only runs on a quiet map. An event, a message or a
        // transfer freezes every member where they stand.
        // During waiting fast-forward, members can act freely.
        canAct(f) {
            const isWaiting = !!(typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._isWaitingFastForward);
            if (isWaiting) {
                return (f ? this.activeFor(f) : this.active()) && !this.recalling() && !$gamePlayer.isTransferring();
            }
            return (
                (f ? this.activeFor(f) : this.active()) &&
                !this.recalling() &&
                !$gameMap.isEventRunning() &&
                !$gameMessage.isBusy() &&
                !$gamePlayer.isTransferring()
            );
        },

        dist(a, b) {
            return $gameMap.distance(a.x, a.y, b.x, b.y);
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

        // Standing inside a dark map or procedural interior (dungeon, crypt, sewer, cave, underground layer, negative dungeon floor, <Dark>).
        inProceduralInterior() {
            if ($dataMap && $dataMap.note && /<Dark>/i.test($dataMap.note)) {
                return true;
            }
            if (typeof window.isProceduralInteriorMap === "function" && window.isProceduralInteriorMap()) {
                return true;
            }
            if (window.DungeonFloors && typeof window.DungeonFloors.currentFloor === "function" && window.DungeonFloors.currentFloor() < 0) {
                return true;
            }
            if ($gameVariables && typeof $gameVariables.value(1) === "number" && $gameVariables.value(1) < 0) {
                return true;
            }
            if ($gameMap && $gameMap.mapId() === 636) {
                const data = $gameSystem && $gameSystem._procGenData;
                if (data) {
                    if (data._dungeonSession && data._dungeonSession.type === "tower") return true;
                    if (data.biomeLayerStack && data.biomeLayerStack.length > 0) return true;
                    if (typeof window.isInteriorBiome === "function" && window.isInteriorBiome(data.currentBiome)) return true;
                    const b = (data.currentBiome || "").toLowerCase();
                    if (b.includes("cave") || b.includes("dungeon") || b.includes("crypt") || b.includes("sewer") || b.includes("cellar") || b.includes("vault") || b.includes("templeinside") || b.includes("caveden")) {
                        return true;
                    }
                }
            }
            return false;
        },

        // The hard limit on how far a member may be from the leader. Off the
        // world map there is none: what tells them they have been left behind
        // is the screen, which already carries the scale of the place.
        // In procedural interiors, they stay close to the leader (DUNGEON_LEASH)
        // to wander and explore without straying into pitch dark hallways.
        // During waiting fast-forward, members get a generous leash to satisfy needs.
        leash() {
            if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._isWaitingFastForward) return 25;
            if (this.onWorldMap()) return WORLD_LEASH;
            if (this.inProceduralInterior()) return DUNGEON_LEASH;
            return Infinity;
        },

        // Is this tile, or this character, inside the leash? Everywhere the
        // leash is off, everything is.
        inLeash(x, y) {
            const max = this.leash();
            if (!isFinite(max) || !$gamePlayer || !$gameMap) return true;
            return $gameMap.distance(x, y, $gamePlayer.x, $gamePlayer.y) <= max;
        },

        inLeashOf(c) {
            return !!c && this.inLeash(c.x, c.y);
        },

        // Past the leash, and so on their way back. `returning` asks the
        // question of somebody already walking home, who keeps walking until
        // they are a tile INSIDE the limit rather than exactly on it: the same
        // idea as LOOSE_BACK_INSET at the screen edge, so nobody bounces off
        // the leash with every step the leader takes.
        strayed(f, returning) {
            const max = this.leash();
            if (!isFinite(max) || !$gamePlayer) return false;
            return this.dist(f, $gamePlayer) > (returning ? Math.max(1, max - 1) : max);
        },

        // Is this member outside what the player can actually see? Screen
        // coordinates are the honest answer to that: they already carry the
        // camera, the edges of a map too small to centre on, and the zoom the
        // spriteset renders at. `margin` is measured in tiles from the edge of
        // the screen, positive outward (past the edge) and negative inward.
        offScreen(f, margin) {
            if (!f || !$gameMap || typeof f.screenX !== "function") return false;
            return this.offScreenPoint(f.screenX(), f.screenY(), margin);
        },

        // The same question asked of a bare tile rather than of somebody
        // standing on one, which is what lets an errand be turned down before
        // it is ever set out on.
        offScreenAt(x, y, margin) {
            if (!$gameMap) return false;
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            return this.offScreenPoint(
                $gameMap.adjustX(x) * tw + tw / 2,
                $gameMap.adjustY(y) * th + th,
                margin
            );
        },

        offScreenPoint(sx, sy, margin) {
            if (!$gameMap) return false;
            const z = ($gameScreen && $gameScreen.zoomScale()) || 1;
            const zx = $gameScreen ? $gameScreen.zoomX() : 0;
            const zy = $gameScreen ? $gameScreen.zoomY() : 0;
            // The stage is scaled about the zoom centre, so that is where a
            // character's screen position really ends up on the canvas.
            const x = (sx - zx) * z + zx;
            const y = (sy - zy) * z + zy;
            const m = Number(margin) || 0;
            const mx = m * $gameMap.tileWidth() * z;
            const my = m * $gameMap.tileHeight() * z;
            return x < -mx || x > Graphics.width + mx || y < -my || y > Graphics.height + my;
        },

        // Is this tile somewhere a member may stand and still be seen? An
        // errand is only ever set on a tile that answers yes.
        inView(x, y) {
            return !this.offScreenAt(x, y, -LOOSE_EDGE_INSET);
        },

        inViewOf(c) {
            return !!c && this.inView(c.x, c.y);
        },

        // About to be off the screen, which is the moment they turn back rather
        // than the moment after it. Three ways of being about to: standing in
        // the band just inside the edge, walking into it, or standing still
        // while the leader drags the camera off them.
        leavingView(f) {
            if (!f || !$gameMap) return false;
            if (this.offScreenAt(f.x, f.y, -LOOSE_EDGE_INSET)) return true;
            const d = f.direction();
            if (d > 0 && f.isMoving()) {
                const nx = $gameMap.roundXWithDirection(f.x, d);
                const ny = $gameMap.roundYWithDirection(f.y, d);
                if (this.offScreenAt(nx, ny, -LOOSE_EDGE_INSET)) return true;
            }
            if ($gamePlayer && $gamePlayer.isMoving()) {
                // The camera follows the leader, so a step of theirs carries
                // this member the same step the other way across the screen.
                const pd = $gamePlayer.direction();
                const k = LOOSE_CAMERA_LOOKAHEAD;
                const dx = ($gameMap.roundXWithDirection($gamePlayer.x, pd) - $gamePlayer.x) * k;
                const dy = ($gameMap.roundYWithDirection($gamePlayer.y, pd) - $gamePlayer.y) * k;
                if ((dx || dy) && this.offScreenAt(f.x - dx, f.y - dy, -LOOSE_EDGE_INSET)) return true;
            }
            return false;
        },

        // Has this member been quiet long enough to say something, and has the
        // party as a whole? Discussion beats do not ask, they only stamp.
        _mayTalk(char) {
            const isWaiting = !!(typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._isWaitingFastForward);
            if (isWaiting) {
                const now = Graphics.frameCount;
                if (now - (this._saidAt.get(char) || -30) < 30) return false;
                return now - this._lastLineAt >= 20;
            }
            const now = Graphics.frameCount;
            if (now - this._quietUntil < 0) return false;
            if (now - (this._saidAt.get(char) || -CHATTER_COOL) < CHATTER_COOL) return false;
            return now - this._lastLineAt >= CHATTER_GAP;
        },

        _stampTalk(char) {
            this._saidAt.set(char, Graphics.frameCount);
            this._lastLineAt = Graphics.frameCount;
        },

        // `answer` marks the second half of an exchange somebody already
        // started: it is said whatever the rationing says, because a greeting
        // that goes unanswered reads worse than one line too many. Returns
        // whether anything was actually said, so the caller can drop the rest
        // of an exchange that never got started.
        say(char, key, answer) {
            // The chatter is written for the people in the party. A pet or a
            // child walking with them wanders and stops to look at things like
            // everyone else, but it says none of it.
            if (this.isPet(char)) return false;
            if (!answer && !this._mayTalk(char)) return false;
            // A party of two or more says it in their OWN voice: PartyBanter
            // answers out of this member's personality bank (NPC/PartyBanter.js).
            // A lone traveller has no banter to be part of and falls back to the
            // plain pool below, which is what they always had.
            const actor = this.partyActorOf(char);
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

        // A line already chosen elsewhere (a scripted party discussion), said
        // by this character. Same bubble, no bank lookup.
        sayText(char, text) {
            if (!text || this.isPet(char)) return;
            this._stampTalk(char);
            Bubbles.show(char, text);
        },

        // The leader is running, not walking. Read as "covering ground at dash
        // speed", which is the engine's own notion of a run: it therefore also
        // covers click-to-move (the engine dashes for that too) and behaves
        // sensibly under Always Dash, where the party closes ranks whenever
        // the leader is on the move and scatters the moment they stand still.
        isLeaderRunning() {
            const p = $gamePlayer;
            return !!p && p.isMoving() && p.isDashing();
        },

        // In the water (Map/MovementInteractionSystem.js). The leader swimming
        // is NOT a recall: a loose member gets into the water themselves and
        // swims after them. What they never do is dive.
        isLeaderSwimming() {
            const p = $gamePlayer;
            return !!p && (!!p._isSwimming || !!p._isDiving);
        },

        // ------------------------------------------------------------ per frame
        update() {
            if ($gamePlayer) {
                // A sprint is the one thing that puts the rope back on, and it
                // has to be a real one: the run is timed, and only once it has
                // lasted RECALL_RUN frames does the party form up. Anything
                // slower than a sprint, walking included, leaves them to their
                // own lives, which is the whole point of Loose.
                const running = this.conditionsMet() && this.isLeaderRunning();
                this._run = running ? (this._run || 0) + 1 : 0;
                if (running && this._run >= RECALL_RUN) {
                    if (!this._recall) {
                        Bubbles.clear();
                        this.cryForTheLeader();
                    }
                    this._recall = true;
                    this._still = 0;
                }
                // And they let go as soon as the sprint does.
                if (this._recall && !running) {
                    this._still = (this._still || 0) + 1;
                    if (this._still >= RECALL_DROP) {
                        this._recall = false;
                        this._still = 0;
                    }
                } else if (running) {
                    this._still = 0;
                }
            }
            Bubbles.update();
        },

        // One member calls after the leader, and only now and then: a party
        // that shouted every time somebody broke into a run would never shut up.
        cryForTheLeader() {
            const now = Graphics.frameCount;
            if (this._cried && now - this._cried < RECALL_CRY_COOL) return;
            if (Math.random() > RECALL_CRY_ODDS) return;
            const f = $gamePlayer.followers().data().find((m) => m.isVisible() && this.activeFor(m));
            if (!f) return;
            this._cried = now;
            this.say(f, "AutoIdle.loose.recall");
        },

        // Called from Game_Follower.update, once per member per frame.
        updateFollower(f) {
            if (!f || !f.isVisible()) return;
            // Hands off entirely during a map battle: the through(true) below is
            // exactly what would let a tactical battler walk through a wall.
            if (this.inMapBattle()) return;
            if (!this.activeFor(f)) {
                // Back in the engine's chain: a state that suspends the loose
                // behaviour (a vehicle, split-screen, a battle). A chained
                // follower walks through everything, and a pet left solid would
                // be stranded the moment the party sails.
                if (!f.isThrough()) f.setThrough(true);
                return;
            }

            if (this.recalling()) {
                if (!f.isThrough()) f.setThrough(true);
                const gathering = $gamePlayer.areFollowersGathering();
                // Already in the file: the engine's own chase (the vanilla
                // updateMove spliced back in below) steps them into the tile
                // the person in front is leaving, which IS the marching column
                // every RPG Maker game ships with. The loose layer takes its
                // hands off them entirely rather than walking them somewhere
                // else at the same time, and they keep the leader's pace so the
                // spacing holds instead of concertinaing.
                if (!gathering && this.inColumn(f) && !this.strayed(f, false)) {
                    f.setMoveSpeed($gamePlayer.realMoveSpeed());
                    return;
                }
                this.stepHome(f, gathering);
                return;
            }
            if (!this.canAct(f)) return;

            // Loose members walk the map for themselves, so they obey it.
            if (f.isThrough()) f.setThrough(false);
            // Game_Follower.update has just copied the leader's speed onto them,
            // which would have the whole party sprinting between flowers, so
            // each one is put back on the pace their own errand deserves.
            f.setMoveSpeed(this.gaitFor(f));
            this.updateSwim(f);
            this.think(f);
        },

        // How fast this member is moving right now. Mostly an amble a notch
        // under the leader's; keeping up with them or running outright when
        // there is a reason to (coming back into view, tagging along, or one of
        // those moments when somebody simply feels like running).
        //
        // A run comes out of their AP, the same meter their skills do (see
        // Map/MovementInteractionSystem.js), and a member with none left drops
        // back to a walk. It is a cosmetic thing only: they still catch up, and
        // a fight that starts a moment later finds them in it either way.
        gaitFor(f) {
            const isWaiting = !!(typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._isWaitingFastForward);
            if (isWaiting) return 5.5;
            const s = this.stateOf(f);
            const base = $gamePlayer.realMoveSpeed();
            // "return" is somebody left behind hurrying back into view, "dash"
            // is somebody who simply felt like running; either way it is a run,
            // and a run has to be paid for.
            const running = (s.act === "return" || (s.dash && s.act !== "follow")) &&
                this.takeBreath(f);
            if (running) return s.act === "return" ? base + 1 : base;
            if (s.act === "return" || s.act === "follow") return base;
            return Math.max(3, base - 1);
        },

        // Has this member the breath left for a run? Asked before setting one
        // off at one, and it changes nothing on its own.
        hasBreath(f) {
            const stamina = window.SprintStamina;
            if (!stamina) return true;
            const actor = this.actorOf(f);
            return !actor || stamina.canSprint(actor);
        },

        // The same question asked by somebody already running: the answer is
        // charged to their AP, so a member who keeps running keeps paying.
        takeBreath(f) {
            if (!this.hasBreath(f)) return false;
            const actor = this.actorOf(f);
            if (actor) window.SprintStamina?.noteRunning?.(actor);
            return true;
        },

        // ------------------------------------------------------------- water
        // A loose member gets into the water on their own (region 99, or a
        // water tile on the procedural map) and swims across it, which is what
        // lets them follow a leader who has swum off. They never DIVE: going
        // under is the player's business.
        isWater(x, y) {
            if (!$gameMap) return false;
            if ($gameMap.regionId(x, y) === 99) return true;
            const mis = window.MovementSystem;
            if (mis && typeof mis.isWaterTile === "function") {
                try { return !!mis.isWaterTile(x, y); } catch (e) { /* fall through */ }
            }
            return $gameMap.terrainTag(x, y) === 3;
        },

        setSwimming(f, on) {
            if (!f || !!f._isSwimming === !!on) return;
            const mis = window.MovementSystem;
            try {
                if (on && mis && mis.enterSwimMode) mis.enterSwimMode(f);
                else if (!on && mis && mis.exitSwimMode) mis.exitSwimMode(f);
                else f._isSwimming = !!on;
            } catch (e) {
                f._isSwimming = !!on;
            }
        },

        // Out of the water the moment they are standing on dry land again.
        updateSwim(f) {
            if (f._isSwimming && !f.isMoving() && !this.isWater(f.x, f.y)) {
                this.setSwimming(f, false);
            }
        },

        // Who this member walks behind: the visible member ahead of them in the
        // party's own order, and the leader for the first of them. That is what
        // makes a recall a file rather than a huddle, since everybody closes on
        // the back of the person in front instead of on the leader's tile.
        precedingOf(f) {
            if (!$gamePlayer || !f) return $gamePlayer;
            const data = $gamePlayer.followers().data();
            const i = data.indexOf(f);
            for (let j = i - 1; j >= 0; j--) {
                if (data[j] && data[j].isVisible()) return data[j];
            }
            return $gamePlayer;
        },

        // In the column already: within a tile of the back of the person in
        // front, which is exactly the spacing the engine's caterpillar keeps.
        // Measured on each axis rather than as a distance, so a member sitting
        // diagonally off their shoulder (which is where a diagonal step leaves
        // them) still reads as being in the file.
        inColumn(f) {
            const head = this.precedingOf(f);
            if (!head || !f) return false;
            return Math.abs(f.deltaXFrom(head.x)) <= COLUMN_GAP &&
                Math.abs(f.deltaYFrom(head.y)) <= COLUMN_GAP;
        },

        // Walk back into the column. `onto` is the Gather Party case, where the
        // engine only counts the party gathered once every member shares the
        // leader's tile; a sprint recall ends with them strung out behind the
        // leader instead, each one on the shoulder of the one in front.
        stepHome(f, onto) {
            if (f.isMoving()) return;
            if (this.offScreen(f, LOOSE_SNAP_MARGIN)) {
                this.placeBeside(f);
                return;
            }
            if (onto) {
                if (this.dist(f, $gamePlayer) === 0) return;
                this.stepTo(f, $gamePlayer.x, $gamePlayer.y);
                return;
            }
            const strayed = this.strayed(f, false);
            if (this.inColumn(f) && !strayed) return;
            // Catching up is a run: the engine only steps the file when the
            // leader steps, so at the leader's own pace a gap would never close.
            // A column is as long as the party is, which on the world map is
            // already further than the leash allows, so out there the tail
            // closes on the LEADER and the party bunches up instead.
            const head = strayed ? $gamePlayer : this.precedingOf(f);
            f.setMoveSpeed($gamePlayer.realMoveSpeed() + 1);
            this.stepTo(f, head.x, head.y);
        },

        stepTo(f, x, y) {
            const dir = f.findDirectionTo(x, y);
            if (dir > 0) {
                f.moveStraight(dir);
                if (f.isMovementSucceeded()) return true;
            }
            // Somebody is standing on the goal. Walking up to a person means
            // walking up to the tile BESIDE them, never onto them: the engine's
            // search refuses a tile another character occupies, so aiming at
            // the person themselves returns nothing and the member would stand
            // where they are for the whole visit.
            if (this.stepBeside(f, x, y)) return true;
            // No dry way there. If what is in the way is water, they get in and
            // swim it: the engine already lets a swimming character onto those
            // tiles, and a member cut off by a river would otherwise stand on
            // the bank for ever.
            if (this.swimToward(f, x, y)) return true;
            // Boxed in: the party closed around them, or they were put down in
            // a corner. Rather than grind against the same wall until the goal
            // times out, they look for any way out at all and take it.
            return this.stepFree(f, x, y);
        },

        // The four tiles around the goal, nearest first, as stand-in goals.
        stepBeside(f, x, y) {
            if (!$gameMap) return false;
            if (f.x === x && f.y === y) return false;
            const around = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
                .filter(([nx, ny]) => $gameMap.isValid(nx, ny))
                .filter(([nx, ny]) => nx !== f.x || ny !== f.y)
                .sort((a, b) =>
                    (Math.abs(a[0] - f.x) + Math.abs(a[1] - f.y)) -
                    (Math.abs(b[0] - f.x) + Math.abs(b[1] - f.y)));
            for (const [nx, ny] of around) {
                const d = f.findDirectionTo(nx, ny);
                if (d <= 0) continue;
                f.moveStraight(d);
                if (f.isMovementSucceeded()) return true;
            }
            return false;
        },

        // A way out of wherever they are wedged: any passable neighbour, the
        // one that leaves them closest to where they were heading first. It is
        // a step, not a path, but taken every frame it walks them out of the
        // pocket and back into open ground where the search works again.
        stepFree(f, x, y) {
            if (!$gameMap) return false;
            const dirs = [2, 4, 6, 8]
                .map((d) => ({
                    d,
                    nx: $gameMap.roundXWithDirection(f.x, d),
                    ny: $gameMap.roundYWithDirection(f.y, d),
                }))
                .filter((o) => $gameMap.isValid(o.nx, o.ny) && f.canPass(f.x, f.y, o.d))
                .sort((a, b) =>
                    (Math.abs(a.nx - x) + Math.abs(a.ny - y)) -
                    (Math.abs(b.nx - x) + Math.abs(b.ny - y)));
            for (const o of dirs) {
                f.moveStraight(o.d);
                if (f.isMovementSucceeded()) return true;
            }
            return false;
        },

        swimToward(f, x, y) {
            if (!$gameMap) return false;
            const dirs = f.x !== x || f.y !== y
                ? [dirBetween(f.x, f.y, x, y), Math.abs(y - f.y) > Math.abs(x - f.x)
                    ? (x > f.x ? 6 : 4) : (y > f.y ? 2 : 8)]
                : [];
            for (const d of dirs) {
                if (!d) continue;
                const nx = $gameMap.roundXWithDirection(f.x, d);
                const ny = $gameMap.roundYWithDirection(f.y, d);
                if (!$gameMap.isValid(nx, ny) || !this.isWater(nx, ny)) continue;
                this.setSwimming(f, true);
                f.moveStraight(d);
                if (f.isMovementSucceeded()) return true;
            }
            return false;
        },

        // -------------------------------------------------------- the activities
        think(f) {
            const s = this.stateOf(f);
            if (f.isMoving()) return;

            // Left so far behind that walking home is pointless: put back.
            if (this.offScreen(f, LOOSE_SNAP_MARGIN)) {
                this.placeBeside(f);
                return;
            }
            // About to be out of sight and nothing else matters, whatever they
            // were doing and however long they meant to stand there doing it: a
            // member on the point of leaving the screen heads for the leader at
            // once, which is why this is asked before the pause they are
            // sitting out. Once heading back they keep going until a little
            // inside the edge, so nobody stops dead on the rim and drifts
            // straight out of it again.
            const gone = this.leavingView(f);
            const strayed = this.strayed(f, s.act === "return");
            if (gone || strayed || (s.act === "return" && this.offScreen(f, -LOOSE_BACK_INSET))) {
                s.wait = 0;
                if (s.act !== "return") {
                    this.clearGoal(s);
                    s.act = "return";
                }
                if (!this.stepTo(f, $gamePlayer.x, $gamePlayer.y)) s.wait = 20;
                return;
            }
            if (s.wait > 0) {
                s.wait--;
                return;
            }
            if (s.act === "return") this.clearGoal(s);

            switch (s.act) {
                case "walk":
                    return this.stepWalk(f, s);
                case "visit":
                    return this.stepVisit(f, s);
                case "look":
                    return this.stepLook(f, s);
                case "need":
                    return this.stepNeed(f, s);
                case "follow":
                    return this.stepFollow(f, s);
                default:
                    return this.pickActivity(f, s);
            }
        },

        // What a member does next. A meter that has run down comes first: they
        // are people with an evening of their own, not scenery, so a filthy one
        // goes looking for a washroom and a bored one for something to play
        // before anybody strolls anywhere. Then, sometimes, simply walking with
        // the leader for a while, because a companion who never once falls in
        // beside you reads as a stranger. Then company, then something to look
        // at, then a walk, then standing there with a thought.
        pickActivity(f, s) {
            if (this.beginNeed(f, s)) return;
            // Every errand is taken at its own pace, and now and then somebody
            // takes it at a run, if they have the breath for one.
            s.dash = Math.random() < FOLLOW_DASH_ODDS && this.hasBreath(f);
            if (Math.random() < FOLLOW_ODDS && this.beginFollow(f, s)) return;
            const roll = Math.random();
            if (roll < 0.36 && this.beginVisit(f, s)) return;
            if (roll < 0.58 && this.beginLook(f, s)) return;
            if (roll < 0.86 && this.beginWalk(f, s)) return;
            this.clearGoal(s);
            s.wait = 60 + Math.floor(Math.random() * 150);
            if (Math.random() < IDLE_TALK_ODDS) this.say(f, "AutoIdle.loose.thought");
        },

        // Walking with the leader, of their own accord: they keep a couple of
        // tiles off their shoulder, at the leader's own speed, for a while, and
        // then go back to their own business. Nothing is chained and nothing is
        // through a wall, so it reads as a person keeping you company rather
        // than as the marching column.
        beginFollow(f, s) {
            this.clearGoal(s);
            s.act = "follow";
            s.until = Graphics.frameCount + FOLLOW_MIN +
                Math.floor(Math.random() * (FOLLOW_MAX - FOLLOW_MIN));
            return true;
        },

        stepFollow(f, s) {
            if (Graphics.frameCount >= (s.until || 0)) {
                this.clearGoal(s);
                s.wait = 30;
                return;
            }
            const d = this.dist(f, $gamePlayer);
            if (d <= FOLLOW_NEAR) {
                // Close enough: face the way the leader is looking and wait for
                // them to move off again.
                if (!$gamePlayer.isMoving()) f.setDirection($gamePlayer.direction());
                return;
            }
            if (!this.stepTo(f, $gamePlayer.x, $gamePlayer.y)) s.wait = 10;
        },

        beginWalk(f, s) {
            const roam = Math.min(LOOSE_ROAM, this.leash());
            for (let i = 0; i < 20; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = 2 + Math.random() * (roam - 1);
                const x = Math.round($gamePlayer.x + Math.cos(a) * r);
                const y = Math.round($gamePlayer.y + Math.sin(a) * r);
                if ((x !== f.x || y !== f.y) && tilePassable(x, y) && this.inLeash(x, y) &&
                    this.inView(x, y)) {
                    this.clearGoal(s);
                    s.act = "walk";
                    s.gx = x;
                    s.gy = y;
                    return true;
                }
            }
            return false;
        },

        stepWalk(f, s) {
            if ((f.x === s.gx && f.y === s.gy) || ++s.tries > 40) {
                this.clearGoal(s);
                s.wait = 30;
                return;
            }
            if (!this.stepTo(f, s.gx, s.gy)) s.tries += 4;
        },

        beginVisit(f, s) {
            const mate = this.findCompany(f);
            if (!mate) return false;
            this.clearGoal(s);
            s.act = "visit";
            s.partner = mate;
            this.remember(s, mate);
            return true;
        },

        // Walk over, stop at arm's length, turn to face them and trade a line
        // each. Nothing is triggered: this is two people talking, not the player
        // starting an event.
        stepVisit(f, s) {
            const p = s.partner;
            if (!p || p._erased || (p.isTransparent && p.isTransparent()) || ++s.tries > 90) {
                this.clearGoal(s);
                return;
            }
            if (this.dist(f, p) > 1) {
                if (!this.stepTo(f, p.x, p.y)) s.tries += 6;
                return;
            }
            const facing = dirBetween(f.x, f.y, p.x, p.y);
            if (facing > 0) f.setDirection(facing);
            if (!p.isMoving() && !p.isDirectionFixed()) {
                const back = dirBetween(p.x, p.y, f.x, f.y);
                if (back > 0) p.setDirection(back);
            }
            // Two travellers who have been on the same road all week do not
            // talk to each other the way they talk to a stranger in a village,
            // so the party has a bank of its own (NPC/PartyBanter.js): a real
            // discussion of two to four beats, about where they are standing,
            // what the diary says just happened to them, what they just spent
            // the money on, or simply what these two personalities do to each
            // other. A stranger still gets the old greeting and answer.
            const own = !!this.partyActorOf(p);
            if (own) {
                const actorA = this.actorOf(f);
                const actorB = this.partyActorOf(p);
                if (s.isRomance) return this.stepPartyRomance(f, p, s, actorA, actorB);
                if (s.isRomance === undefined) {
                    const RS = window.NPCRomanceSystem;
                    if (RS && actorA && actorB && actorB !== $gameParty.leader() &&
                        !RS.isOnCooldown(actorA.name(), actorB.name()) &&
                        RS.isSomewhatCompatible(actorA, actorB) &&
                        Math.random() < 0.35) {
                        s.isRomance = true;
                        s.romanceData = RS.executeRomance(actorA, actorB);
                        s.beat = 0;
                        return this.stepPartyRomance(f, p, s, actorA, actorB);
                    }
                    s.isRomance = false;
                }
                return this.stepPartyTalk(f, p, s);
            }

            const actorA = this.actorOf(f);
            const helpers = window.NPCEmpathize && window.NPCEmpathize._helpers;
            const npcName = (p && typeof p.eventId === 'function' && helpers?._getNPCName) ? helpers._getNPCName(p.eventId()) : null;
            const npcProfile = (npcName && helpers?._getProfile) ? helpers._getProfile(npcName) : null;
            if (s.isRomance) return this.stepNpcRomance(f, p, s, actorA, npcName, npcProfile);
            if (s.isRomance === undefined && npcName && npcProfile) {
                const RS = window.NPCRomanceSystem;
                if (RS && actorA && !RS.isOnCooldown(actorA.name(), npcName) &&
                    RS.isSomewhatCompatible(actorA, { name: npcName, profile: npcProfile }) &&
                    Math.random() < 0.30) {
                    s.isRomance = true;
                    s.romanceData = RS.executeRomance(actorA, { name: npcName, profile: npcProfile });
                    s.beat = 0;
                    return this.stepNpcRomance(f, p, s, actorA, npcName, npcProfile);
                }
                s.isRomance = false;
            }

            if (s.beat === 0) {
                // Nothing to say right now: they came over anyway, and the visit
                // still counts as company, it simply happens without the words.
                if (!this.say(f, "AutoIdle.loose.greet")) {
                    s.beat = 2;
                    s.wait = 40;
                    return;
                }
                s.beat = 1;
                s.wait = 100;
                return;
            }
            if (s.beat === 1) {
                this.say(p, "AutoIdle.loose.reply", true);
                s.beat = 2;
                s.wait = 110;
                return;
            }
            // The conversation happened, so it counted: it moves what that
            // person thinks of THIS member (their own standing, not the
            // party's) and it is company for the member who had it.
            this.settleTalk(f, p);
            this.clearGoal(s);
            s.wait = 60;
        },

        stepPartyRomance(f, p, s, actorA, actorB) {
            const rd = s.romanceData;
            if (!rd) {
                this.clearGoal(s);
                return;
            }
            if (s.beat === 0) {
                this.sayText(f, rd.suitorLine);
                s.beat = 1;
                s.wait = 90 + Math.min(80, Math.round(String(rd.suitorLine).length * 1.4));
                return;
            }
            if (s.beat === 1) {
                this.sayText(p, rd.replyLine);
                s.beat = 2;
                s.wait = 90 + Math.min(80, Math.round(String(rd.replyLine).length * 1.4));
                return;
            }
            this.clearGoal(s);
            s.wait = 60;
        },

        stepNpcRomance(f, p, s, actorA, npcName, npcProfile) {
            const rd = s.romanceData;
            if (!rd) {
                this.clearGoal(s);
                return;
            }
            if (s.beat === 0) {
                this.sayText(f, rd.suitorLine);
                s.beat = 1;
                s.wait = 90 + Math.min(80, Math.round(String(rd.suitorLine).length * 1.4));
                return;
            }
            if (s.beat === 1) {
                this.sayText(p, rd.replyLine);
                s.beat = 2;
                s.wait = 90 + Math.min(80, Math.round(String(rd.replyLine).length * 1.4));
                return;
            }
            this.clearGoal(s);
            s.wait = 60;
        },

        // Two (or three) of their own, holding an actual discussion. The whole
        // exchange is drawn at once from PartyBanter so it hangs together, and
        // then played out one beat at a time with everybody turning to whoever
        // has the floor. A member standing close by when it starts is IN it:
        // that is what makes a party of three sound like a party rather than
        // like two people and a spectator.
        stepPartyTalk(f, p, s) {
            if (!s.talk) {
                // They walked over to each other, but a discussion is not what
                // two people do every time they meet: too soon after the last
                // one and the visit is just company, without the words.
                if (Graphics.frameCount - this._lastTalkAt < TALK_COOL) {
                    this.settleTalk(f, p);
                    this.clearGoal(s);
                    s.wait = 60;
                    return;
                }
                const cast = [];
                const chars = [];
                const add = (char) => {
                    const actor = this.partyActorOf(char);
                    if (!actor || cast.includes(actor)) return;
                    cast.push(actor);
                    chars.push(char);
                };
                add(f);
                add(p);
                if (cast.length < 2) {
                    this.clearGoal(s);
                    return;
                }
                const third = this.nearbyPartyChar(f, [f, p]);
                if (third) add(third);

                const beats = window.PartyBanter ? window.PartyBanter.discussion(cast) : null;
                // No bank to draw on (the plugin is off, or its i18n file is
                // missing): they still walked over and it still counts as
                // company, they simply have nothing scripted to say.
                if (!beats || !beats.length) {
                    this.settleTalk(f, p);
                    this.clearGoal(s);
                    s.wait = 60;
                    return;
                }
                s.talk = beats;
                s.talkChars = chars;
                s.beat = 0;
                this._lastTalkAt = Graphics.frameCount;
            }

            if (s.beat < s.talk.length) {
                const beat = s.talk[s.beat++];
                const speaker = s.talkChars[beat.who] || f;
                for (const listener of s.talkChars) {
                    if (listener === speaker || listener.isMoving() || listener.isDirectionFixed()) continue;
                    const facing = dirBetween(listener.x, listener.y, speaker.x, speaker.y);
                    if (facing > 0) listener.setDirection(facing);
                }
                this.sayText(speaker, beat.text);
                // A long line is read for longer, so nobody talks over anybody.
                s.wait = 95 + Math.min(80, Math.round(String(beat.text).length * 1.4));
                return;
            }

            // The discussion happened, so it counted, and it counted for
            // everybody who stood in it.
            const chars = s.talkChars || [];
            this.settleTalk(f, p);
            if (chars[2]) this.settleTalk(f, chars[2]);
            this.clearGoal(s);
            s.wait = 70;
        },

        // Another of their own close enough to be part of a conversation that
        // is starting here.
        nearbyPartyChar(f, exclude) {
            if (!$gamePlayer || this.stowedInVehicle()) return null;
            let best = null;
            let bestD = PARTY_THIRD_RANGE + 1;
            const consider = (c) => {
                if (!c || exclude.includes(c)) return;
                if (c.isTransparent && c.isTransparent()) return;
                if (!this.partyActorOf(c)) return;
                const d = this.dist(f, c);
                if (d <= PARTY_THIRD_RANGE && d < bestD) {
                    best = c;
                    bestD = d;
                }
            };
            consider($gamePlayer);
            for (const other of $gamePlayer.followers().data()) {
                if (other.isVisible()) consider(other);
            }
            return best;
        },

        // What one exchange did to their opinion. A person is not a vending
        // machine: an unwashed traveller wearing yesterday's road is worse
        // company than a clean one, which is the whole of why the hygiene
        // errand below is worth walking. Handed to NPCEmpathize so a chat in
        // the street and a chat in the panel move the same number the same way
        // (and pay the party the same social).
        settleTalk(f, npcEvent) {
            const actor = this.actorOf(f);
            const helpers = window.NPCEmpathize && window.NPCEmpathize._helpers;
            if (!actor || !helpers) return;
            // One of their own is a conversation with two sides to it, and it
            // is settled on both of them rather than on a stranger's ledger.
            const other = this.partyActorOf(npcEvent);
            if (other) {
                this.settlePartyTalk(actor, other);
                return;
            }
            if (!npcEvent || typeof npcEvent.eventId !== "function") return;
            const name = helpers._getNPCName ? helpers._getNPCName(npcEvent.eventId()) : null;
            const profile = name && helpers._getProfile ? helpers._getProfile(name) : null;
            if (!profile) return;
            let delta = Math.round(-2 + Math.random() * 7); // -2 .. +4
            try {
                if (helpers._hygienePenalty) {
                    delta += helpers._hygienePenalty(profile, actor, 0.12) || 0;
                }
            } catch (e) { /* a chat never breaks on a missing reading */ }
            delta = Math.max(-6, Math.min(6, delta));
            if (!delta) return;
            try {
                helpers._addNpcOpinion(profile, actor.actorId(), delta);
            } catch (e) {
                return;
            }
            this.toastOpinion(actor, name, delta);
        },

        // Two members of the same party talking. Unlike a chat with a stranger
        // this moves BOTH ledgers: each of them comes away thinking a little
        // more, or a little less, of the other. The numbers are the ones the
        // Empathize panel keeps (profile.opinions[actorId], the per-member
        // standing, never the party-wide one) so a road spent walking together
        // shows up on the same sheet a conversation in the panel writes to.
        // What the exchange is worth is read off how much the two of them have
        // in common and how either of them smells right now, which is the whole
        // of why the hygiene errand is worth walking.
        settlePartyTalk(speaker, listener) {
            if (!speaker || !listener || speaker === listener) return;
            const a = this.partyProfile(speaker);
            const b = this.partyProfile(listener);
            if (!a && !b) return;
            // One roll for the exchange, so a conversation that went well went
            // well for both of them, and each side then reads it their own way.
            const mood = -2 + Math.random() * 7; // -2 .. +5, the swing a chat has
            const toListener = this.partyTalkDelta(b, speaker, mood);
            const toSpeaker = this.partyTalkDelta(a, listener, mood);
            const landedB = !!(b && toListener) && this.movePartyOpinion(b, speaker, toListener);
            // Quiet only once the other direction has already paid the party its
            // company: one conversation is one helping of it, however many
            // people were standing in it.
            const landedA = !!(a && toSpeaker) && this.movePartyOpinion(a, listener, toSpeaker, landedB);
            if (!landedB && !landedA) return;
            const dB = landedB ? toListener : 0;
            const dA = landedA ? toSpeaker : 0;
            this.toast(T('AutoIdle.loose.toastPartyTalk', {
                name: speaker.name(),
                other: listener.name(),
                delta: (dB > 0 ? "+" : "") + dB,
                back: (dA > 0 ? "+" : "") + dA,
            }), dB + dA >= 0 ? "good" : "warning");
        },

        // A party member's own society profile, the record the Empathize panel
        // reads. Character creation writes one for every member, so this is
        // normally a lookup; a member who arrived some other way is given one
        // rather than left without a ledger to be remembered on.
        partyProfile(actor) {
            const reg = window.NPCSocietyRegistry;
            if (!actor || !reg) return null;
            try {
                return reg.getProfile(actor.name())
                    || (reg.ensureProfile
                        ? reg.ensureProfile(actor.name(), actor.currentClass() ? actor.currentClass().id : null)
                        : null);
            } catch (e) {
                return null;
            }
        },

        // What this exchange did to `profile`'s opinion of `other`: the mood of
        // the conversation, what the two of them have in common, and how the
        // other one smells.
        partyTalkDelta(profile, other, mood) {
            if (!profile || !other) return 0;
            const helpers = window.NPCEmpathize && window.NPCEmpathize._helpers;
            let delta = mood;
            try {
                if (helpers && helpers._traitCompatBonus) {
                    delta += (helpers._traitCompatBonus(profile, other) || 0) * 0.06;
                }
                if (helpers && helpers._hygienePenalty) {
                    delta += helpers._hygienePenalty(profile, other, 0.12) || 0;
                }
            } catch (e) { /* a chat never breaks on a missing reading */ }
            return Math.max(-6, Math.min(6, Math.round(delta)));
        },

        // Write it down. A direction that is not `quiet` goes through
        // NPCEmpathize's own adder, so the exchange also pays the party its
        // company the way every other conversation does; a quiet one only moves
        // the ledger.
        movePartyOpinion(profile, subject, delta, quiet) {
            const helpers = window.NPCEmpathize && window.NPCEmpathize._helpers;
            if (!helpers || !profile || !subject || !delta) return false;
            try {
                if (quiet && helpers._setNpcBaseOpinion && helpers._npcBaseOpinion) {
                    helpers._setNpcBaseOpinion(
                        profile, subject.actorId(),
                        helpers._npcBaseOpinion(profile, subject.actorId()) + delta
                    );
                } else {
                    helpers._addNpcOpinion(profile, subject.actorId(), delta);
                }
                return true;
            } catch (e) {
                return false;
            }
        },

        movePartyAttraction(profile, subject, delta) {
            const helpers = window.NPCEmpathize && window.NPCEmpathize._helpers;
            if (!profile || !subject || !delta) return false;
            try {
                if (helpers && helpers._addNpcAttraction) {
                    helpers._addNpcAttraction(profile, subject.actorId(), delta);
                } else {
                    profile.attractions = profile.attractions || {};
                    profile.attractions[subject.actorId()] = (profile.attractions[subject.actorId()] || 0) + delta;
                }
                return true;
            } catch (e) {
                return false;
            }
        },

        // ------------------------------------------------------------- needs
        // The member's own five meters. A pet or a child walking with the party
        // has no actor and no meters, so it simply keeps wandering.
        actorOf(f) {
            return (f && typeof f.actor === "function" && f.actor()) || null;
        },

        needsOf(f) {
            const a = this.actorOf(f);
            if (!a || !window.PartyNeeds) return null;
            try {
                return window.PartyNeeds.getMemberNeeds(a);
            } catch (e) {
                return null;
            }
        },

        // The lowest meter under the line, or nothing at all. Read in a fixed
        // order on a tie so a member does not dither between two equal wants.
        pressingNeed(f) {
            const needs = this.needsOf(f);
            if (!needs) return null;
            let worst = null;
            let low = NEED_LOW;
            for (const key of ["hunger", "sleep", "hygiene", "social", "leisure"]) {
                const v = Number(needs[key]);
                if (!isFinite(v) || v > low) continue;
                if (worst === null || v < low) {
                    worst = key;
                    low = v;
                }
            }
            return worst;
        },

        // What the capability registry's weights want to know about whoever is
        // asking. A party member has no society profile of their own for the
        // fields that matter here, so the party's purse stands in for theirs.
        needProfile(f) {
            const a = this.actorOf(f);
            const gold = $gameParty ? $gameParty.gold() : 0;
            const base = (a && window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile)
                ? window.NPCSocietyRegistry.getProfile(a.name())
                : null;
            return Object.assign({ moralityScore: 0, itemIds: [] }, base || {}, {
                money: gold,
                wealthTierBase: gold >= 5000 ? 3 : gold >= 2000 ? 2 : gold >= 600 ? 1 : 0,
            });
        },

        // Start an errand for whatever has run down. Hunger is settled where
        // they stand (the food is in the pack); everything else is somewhere on
        // the map they have to walk to.
        beginNeed(f, s) {
            if (!this.actorOf(f)) return false;
            // A map with nothing to answer a want on it would otherwise be
            // re-scanned on every idle decision for as long as the meter stays
            // low, so a fruitless search stands the member down for a while.
            if (s.needTried && Graphics.frameCount - s.needTried < NEED_RETRY) return false;
            const need = this.pressingNeed(f);
            if (!need) {
                s.needTried = Graphics.frameCount;
                return false;
            }
            // Each want is tried at the thing that really answers it first, and
            // then at whatever the map can offer instead.
            const gaveUp = () => {
                s.needTried = Graphics.frameCount;
                return false;
            };
            if (need === "hunger") return this.eat(f, s) || gaveUp();
            // A bed is paid for, so it never comes through the ordinary target
            // path (which would hand out free sleep); it is its own errand.
            if (need === "sleep" && this.beginRent(f, s)) return true;
            if (need === "social" && this.beginVisit(f, s)) return true;

            const target = this.findForNeed(f, need);
            if (target) {
                this.clearGoal(s);
                s.act = "need";
                s.need = need;
                s.partner = target;
                this.remember(s, target);
                return true;
            }
            // Nothing built for it: sit down, which is worth something for a
            // tired member and for a bored one.
            if ((need === "sleep" || need === "leisure") && this.beginRest(f, s, need)) return true;
            return gaveUp();
        },

        // The nearest thing on the map that answers this need, asked of the
        // town's own capability registry so a party member and a townsperson
        // recognise a washroom by exactly the same rule.
        findForNeed(f, need) {
            const scanner = window.NPCSim && window.NPCSim.InteractionScanner;
            if (!scanner || typeof scanner.findByNeed !== "function") return null;
            let matches = [];
            try {
                matches = scanner.findByNeed(need, this.needProfile(f)) || [];
            } catch (e) {
                return null;
            }
            let best = null;
            let bestD = NEED_SCAN + 1;
            const s = this.stateOf(f);
            for (const m of matches) {
                if (!m || !m.event || (m.score ?? 0) <= 0) continue;
                // A room is rented, never simply used: beginRent owns it.
                if (m.capability && m.capability.id === "rentable_room") continue;
                if (m.event._erased || this.stale(s, m.event)) continue;
                // Nothing worth walking off the leash for: on the world map the
                // washroom two regions over is not somewhere a party member goes.
                if (!this.inLeashOf(m.event)) continue;
                const d = this.dist(f, m.event);
                if (d <= NEED_SCAN && d < bestD) {
                    best = m.event;
                    bestD = d;
                }
            }
            return best;
        },

        // A free room, taken with the party's own money. Tired members are the
        // ones who go looking, which is why this is only ever reached from the
        // sleep branch.
        beginRent(f, s) {
            const rent = window.RentSystem;
            if (!rent || typeof rent.freeRooms !== "function") return false;
            let rooms = [];
            try {
                rooms = rent.freeRooms($gameMap.mapId()) || [];
            } catch (e) {
                return false;
            }
            const gold = $gameParty ? $gameParty.gold() : 0;
            let best = null;
            let bestD = NEED_SCAN + 1;
            for (const room of rooms) {
                if (room.price > gold) continue;
                const ev = $gameMap.event(room.eventId);
                if (!ev || ev._erased) continue;
                if (!this.inLeashOf(ev)) continue;
                const d = this.dist(f, ev);
                if (d <= NEED_SCAN && d < bestD) {
                    best = ev;
                    bestD = d;
                }
            }
            if (!best) return false;
            this.clearGoal(s);
            s.act = "need";
            s.need = "sleep";
            s.rent = true;
            s.partner = best;
            return true;
        },

        // Somewhere to sit down: the same region 102 rest tiles the town's NPCs
        // take their weight off on.
        beginRest(f, s, need) {
            if (!$gameMap) return false;
            let best = null;
            let bestD = NEED_SCAN + 1;
            for (let dy = -NEED_SCAN; dy <= NEED_SCAN; dy++) {
                for (let dx = -NEED_SCAN; dx <= NEED_SCAN; dx++) {
                    const x = $gameMap.roundX(f.x + dx);
                    const y = $gameMap.roundY(f.y + dy);
                    if ($gameMap.regionId(x, y) !== REST_REGION) continue;
                    if (!tilePassable(x, y)) continue;
                    if (!this.inLeash(x, y)) continue;
                    const d = Math.abs(dx) + Math.abs(dy);
                    if (d < bestD) {
                        best = { x, y };
                        bestD = d;
                    }
                }
            }
            if (!best) return false;
            this.clearGoal(s);
            s.act = "need";
            s.need = need;
            s.gx = best.x;
            s.gy = best.y;
            return true;
        },

        // Walk to it, and settle it on arrival. A tile errand (a seat) is done
        // by standing on it; an event errand by standing beside it.
        stepNeed(f, s) {
            if (++s.tries > NEED_TRIES) {
                this.clearGoal(s);
                s.wait = 60;
                return;
            }
            const p = s.partner;
            if (p) {
                if (p._erased) {
                    this.clearGoal(s);
                    return;
                }
                if (this.dist(f, p) > 1) {
                    if (!this.stepTo(f, p.x, p.y)) s.tries += 6;
                    return;
                }
                const facing = dirBetween(f.x, f.y, p.x, p.y);
                if (facing > 0) f.setDirection(facing);
            } else {
                if (s.gx === null) {
                    this.clearGoal(s);
                    return;
                }
                if (f.x !== s.gx || f.y !== s.gy) {
                    if (!this.stepTo(f, s.gx, s.gy)) s.tries += 6;
                    return;
                }
            }
            this.finishNeed(f, s);
        },

        finishNeed(f, s) {
            const need = s.need;
            const seat = !s.partner;
            if (s.rent && !this.payRent(f, s)) {
                this.clearGoal(s);
                s.wait = 90;
                return;
            }
            if (!s.rent) this.fillNeed(f, need, NEED_FILL[need] || 20);
            this.say(f, seat ? "AutoIdle.loose.rest" : "AutoIdle.loose.need." + need);
            this.clearGoal(s);
            // Whatever they came for takes a while: a bath, a game, a nap.
            s.wait = seat ? 300 : 180;
        },

        // Pay for the room and let the party in. A member who rents it rents it
        // for everybody: the door opens the way it does when the player pays at
        // the counter themselves.
        payRent(f, s) {
            const ev = s.partner;
            const rent = window.RentSystem;
            if (!ev || !rent || typeof rent.rentForParty !== "function") return false;
            let deal = null;
            try {
                deal = rent.rentForParty($gameMap.mapId(), ev.eventId());
            } catch (e) {
                return false;
            }
            if (!deal) return false;
            SoundManager.playShop();
            this.fillNeed(f, "sleep", NEED_FILL.sleep);
            const actor = this.actorOf(f);
            this.toast(T('AutoIdle.loose.toastRent', {
                name: actor ? actor.name() : "",
                price: window.ParchmentToast ? window.ParchmentToast.money(deal.price) : String(deal.price),
            }), "good");
            return true;
        },

        // Put the points on the member's own meter and say so. Hunger and sleep
        // are shared by the whole party, the other three are personal; the
        // actor's own need methods already know which is which.
        fillNeed(f, need, amount) {
            const actor = this.actorOf(f);
            if (!actor || !amount) return;
            const adder = { hunger: "addHunger", sleep: "addSleep", hygiene: "addHygiene", social: "addSocial", leisure: "addLeisure" }[need];
            if (!adder || typeof actor[adder] !== "function") return;
            actor[adder](amount);
            this.toastNeed(actor, need, amount);
        },

        // A meal out of the pack. The smallest thing that will do the job is
        // eaten, so a banquet is not spent on a snack's worth of hunger.
        eat(f, s) {
            const actor = this.actorOf(f);
            const utils = window.ItemSystemUtils;
            if (!actor || !$gameParty) return false;
            let best = null;
            let bestValue = Infinity;
            for (const item of $gameParty.items()) {
                if (!item || !item.note) continue;
                const isFood = utils && utils.isFoodItem
                    ? utils.isFoodItem(item)
                    : /<category:\s*Food>/i.test(item.note);
                if (!isFood) continue;
                const value = this.foodValue(item);
                if (value <= 0) continue;
                // Anything that covers the gap, else the largest thing there is.
                const covers = value >= HUNGER_EAT;
                const score = covers ? value : 1000000 - value;
                if (score < bestValue) {
                    best = item;
                    bestValue = score;
                }
            }
            if (!best) return false;
            const gain = this.foodValue(best);
            $gameParty.loseItem(best, 1);
            actor.addHunger(gain);
            if (utils && utils.applyNeedRestores) {
                try { utils.applyNeedRestores(actor, best); } catch (e) { /* the meal still counted */ }
            }
            this.toast(T('AutoIdle.loose.toastEat', { name: actor.name(), item: best.name }), "good");
            this.toastNeed(actor, "hunger", Math.round(gain));
            this.say(f, "AutoIdle.loose.need.hunger");
            if (s) {
                this.clearGoal(s);
                s.wait = 150;
            }
            return true;
        },

        // TimeDateSystem's own recovery formula: calories, protein and fat.
        foodValue(item) {
            const read = (key) => {
                const m = (item.note || "").match(new RegExp("<" + key + ":\\s*(\\d+)>", "i"));
                return m ? Number(m[1]) : 0;
            };
            const value = read("calories") * 0.10 + read("protein") * 2.00 + read("fat") * 1.50;
            return Math.round(value);
        },

        // ------------------------------------------------------------- toasts
        // Everything a loose member does to a meter or to somebody's opinion is
        // reported, because it happens while the player is looking somewhere
        // else. All of it goes through the one notification service.
        toast(text, severity) {
            if (!text) return;
            try {
                window.ParchmentToast && window.ParchmentToast.show(text, {
                    severity: severity || "info", duration: 150,
                });
            } catch (e) { /* a popup never breaks an errand */ }
        },

        toastNeed(actor, need, delta) {
            if (!delta) return;
            const needs = window.PartyNeeds ? window.PartyNeeds.getMemberNeeds(actor) : null;
            try {
                window.ParchmentToast && window.ParchmentToast.need(need, delta, {
                    value: needs ? needs[need] : null,
                    note: actor ? actor.name() : "",
                });
            } catch (e) { /* as above */ }
        },

        toastOpinion(actor, npcName, delta) {
            if (!delta) return;
            this.toast(T('AutoIdle.loose.toastOpinion', {
                name: actor.name(),
                npc: npcName,
                delta: (delta > 0 ? "+" : "") + delta,
            }), delta > 0 ? "good" : "warning");
        },

        beginLook(f, s) {
            const thing = this.findScenery(f);
            if (!thing) return false;
            this.clearGoal(s);
            s.act = "look";
            s.partner = thing;
            this.remember(s, thing);
            return true;
        },

        stepLook(f, s) {
            const p = s.partner;
            if (!p || p._erased || ++s.tries > 70) {
                this.clearGoal(s);
                return;
            }
            if (this.dist(f, p) > 1) {
                if (!this.stepTo(f, p.x, p.y)) s.tries += 6;
                return;
            }
            const facing = dirBetween(f.x, f.y, p.x, p.y);
            if (facing > 0) f.setDirection(facing);
            this.say(f, "AutoIdle.loose.look");
            this.clearGoal(s);
            s.wait = 120;
        },

        // Someone to talk to. Roughly half the time a member turns to their own
        // company first, the leader or whoever else is walking with them; the
        // rest of the time it is the town, but only the living NPCs the NPC
        // system is actually running (they are the ones with a life to talk
        // about, tracked as opinions and relationships) - never a bystander
        // event that merely looks like a person, a shopkeeper or quest giver
        // included, since those hold no relationship ledger to move. Whichever
        // was asked first, the other is the fallback, so nobody stands there
        // with nothing to say while somebody is standing right next to them.
        findCompany(f) {
            const own = Math.random() < PARTY_TALK_ODDS;
            if (own) {
                const mate = this.findPartyCompany(f);
                if (mate) return mate;
            }
            let best = null;
            let bestD = LOOSE_SCAN + 1;
            const s = this.stateOf(f);
            const consider = (c) => {
                if (!c || c === f || this.stale(s, c)) return;
                if (!this.inLeashOf(c) || !this.inViewOf(c)) return;
                const d = this.dist(f, c);
                if (d <= LOOSE_SCAN && d < bestD) {
                    best = c;
                    bestD = d;
                }
            };
            const ctrls =
                $gameSystem && typeof $gameSystem.getActiveNPCControllers === "function"
                    ? $gameSystem.getActiveNPCControllers()
                    : null;
            if (ctrls && ctrls.length) {
                for (const c of ctrls) {
                    if (c && c.event && !c.event._erased && !c.event.isTransparent()) consider(c.event);
                }
            }
            if (!best && !own) best = this.findPartyCompany(f);
            return best;
        },

        // The nearest of their own: the leader, or another member walking with
        // them. A pet or a child is company to walk up to like anybody else,
        // but it holds no conversation, so nothing is settled over it.
        findPartyCompany(f) {
            if (!$gamePlayer || this.stowedInVehicle()) return null;
            const s = this.stateOf(f);
            let best = null;
            let bestD = LOOSE_SCAN + 1;
            const consider = (c) => {
                if (!c || c === f || this.stale(s, c)) return;
                if (c.isTransparent && c.isTransparent()) return;
                if (!this.inLeashOf(c) || !this.inViewOf(c)) return;
                const d = this.dist(f, c);
                if (d <= LOOSE_SCAN && d < bestD) {
                    best = c;
                    bestD = d;
                }
            };
            consider($gamePlayer);
            for (const other of $gamePlayer.followers().data()) {
                if (other.isVisible()) consider(other);
            }
            return best;
        },

        // The actor behind a character, when that character is one of the
        // party: the leader for the player, the member for a follower. Anybody
        // else on the map (an NPC event, a pet) answers null.
        partyActorOf(c) {
            if (!c) return null;
            if (c === $gamePlayer) return ($gameParty && $gameParty.leader()) || null;
            if (this.isPet(c)) return null;
            return this.actorOf(c);
        },

        findScenery(f) {
            const s = this.stateOf(f);
            let best = null;
            let bestD = LOOSE_SCAN + 1;
            for (const ev of $gameMap.events()) {
                if (!isSceneryEvent(ev) || this.stale(s, ev)) continue;
                if (!this.inLeashOf(ev) || !this.inViewOf(ev)) continue;
                const d = this.dist(f, ev);
                if (d <= LOOSE_SCAN && d < bestD) {
                    best = ev;
                    bestD = d;
                }
            }
            return best;
        },

        // ------------------------------------------------------------- regroup
        // Put one member back on a free tile at the leader's shoulder.
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
                this.clearGoal(this.stateOf(f));
                return true;
            }
            // Nowhere free: standing on the leader is still better than being
            // left on the other side of the map.
            f.locate(px, py);
            f.setDirection($gamePlayer.direction());
            this.clearGoal(this.stateOf(f));
            return false;
        },

        // The whole party back at the leader's side at once: coming out of a
        // battle, taking a transfer event, or arriving on a new map.
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
            this._recall = false;
            this._still = 0;
            this._run = 0;
            Bubbles.clear();
        },

        // ------------------------------------------------------- solid bodies
        // A member walking the map for themselves is a body on it: the leader
        // cannot walk through them, and they cannot walk through each other.
        // The engine's own chain has them all pass through everything, which is
        // right for a column glued to the leader and wrong for people standing
        // about on their own.

        // The loose member standing on this tile, if any. Somebody the engine
        // is carrying (a vehicle, a recall, a map battle) is not a body: their
        // through(true) is what walks them home through the walls.
        followerAt(x, y, except) {
            if (!$gamePlayer || !$gamePlayer.followers()) return null;
            for (const f of $gamePlayer.followers().data()) {
                if (f === except) continue;
                // The companion at heel is walked through by everybody. It
                // still obeys the map itself (it is not through), it simply is
                // not a wall: a pet standing in a doorway must never be the
                // reason the party cannot get out of a room.
                if (this.isPet(f)) continue;
                if (!f.isVisible() || f.isTransparent()) continue;
                if (f.isThrough()) continue;
                if (!this.activeFor(f)) continue;
                if (f.pos(x, y)) return f;
            }
            return null;
        },

        // Is the leader blocked by one of them? The party may never wall the
        // player in: with no free tile left around them, everyone is walked
        // through again rather than leaving the game stuck.
        blocksLeader(x, y) {
            if (!this.active()) return false;
            if ($gamePlayer.isInVehicle()) return false;
            if (!this.followerAt(x, y)) return false;
            for (const d of [2, 4, 6, 8]) {
                const nx = $gameMap.roundXWithDirection($gamePlayer.x, d);
                const ny = $gameMap.roundYWithDirection($gamePlayer.y, d);
                if (this.followerAt(nx, ny)) continue;
                if (!$gamePlayer.isMapPassable($gamePlayer.x, $gamePlayer.y, d)) continue;
                if ($gameMap.eventsXyNt(nx, ny).some((e) => e.isNormalPriority())) continue;
                return true; // there is a way out, so this one may be blocked
            }
            return false;
        },

        // Walking into somebody. A member (or the pet) standing where the
        // leader wants to go steps out of the way instead of being a wall:
        // sideways first, so they clear the lane the leader is walking down,
        // then on ahead, then back the way the leader came. Whatever they were
        // doing is dropped, and they hold still for a beat afterwards so they
        // do not wander straight back onto the tile.
        nudgeAside(d) {
            if (!this.active() || !d) return false;
            if ($gamePlayer.isInVehicle()) return false;
            const x = $gameMap.roundXWithDirection($gamePlayer.x, d);
            const y = $gameMap.roundYWithDirection($gamePlayer.y, d);
            const f = this.followerAt(x, y);
            if (!f || f.isMoving()) return false;
            const side = (d === 2 || d === 8) ? [4, 6] : [2, 8];
            if (Math.random() < 0.5) side.reverse();
            for (const nd of side.concat([d, 10 - d])) {
                const nx = $gameMap.roundXWithDirection(f.x, nd);
                const ny = $gameMap.roundYWithDirection(f.y, nd);
                if (!$gameMap.isValid(nx, ny)) continue;
                if (!f.canPass(f.x, f.y, nd)) continue;
                f.moveStraight(nd);
                if (!f.isMovementSucceeded()) continue;
                const s = this.stateOf(f);
                if (s) {
                    this.clearGoal(s);
                    s.wait = Math.max(s.wait || 0, NUDGE_HOLD);
                }
                return true;
            }
            return false;
        },

        // The same question for a member: the leader is a body to them too.
        blocksFollower(f, x, y) {
            if (!this.activeFor(f)) return false;
            // The other half of the same rule: nothing that walks through the
            // pet may be walked into by it, or it would be left standing on the
            // wrong side of the leader for ever.
            if (this.isPet(f)) return false;
            if (this.followerAt(x, y, f)) return true;
            return !$gamePlayer.isThrough() && $gamePlayer.pos(x, y);
        },

        // --------------------------------------------------------- talking to one
        // The member standing on the tile the leader is facing.
        facedFollower() {
            if (!this.active()) return null;
            const d = $gamePlayer.direction();
            const fx = $gameMap.roundXWithDirection($gamePlayer.x, d);
            const fy = $gameMap.roundYWithDirection($gamePlayer.y, d);
            for (const f of $gamePlayer.followers().data()) {
                if (!f.isVisible() || f.isTransparent()) continue;
                if (f.pos(fx, fy)) return f;
            }
            return null;
        },

        // The companion at heel, when the leader is facing it. Asked whether or
        // not the loose layer is running: chained into the marching column it
        // still walks where the leader just was, and it is still the one thing
        // in that column worth turning round to.
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
                this.clearGoal(this.stateOf(f));
                Bubbles.clear();
                if (SD.askMenu?.(actor.actorId())) return true;
                if (SD.ask()) return true;
            }
            if (!window.NPCEmpathize || typeof window.NPCEmpathize.openForActor !== "function") return false;
            f.setDirection(f.reverseDir($gamePlayer.direction()));
            this.clearGoal(this.stateOf(f));
            Bubbles.clear();
            window.NPCEmpathize.openForActor(actor.actorId());
            return true;
        },

        // ------------------------------------------------------- the companion
        // The pet has no actor behind it, so its Empathize sheet is not opened
        // the way a member's is and none of the party's conversation is its to
        // hold. What it is offered instead is a short menu: something that
        // talks is talked to, something feral is petted (window.NPCCreature owns
        // that boundary, and the record's own answer is what it was recruited
        // with), and either way its own page is one choice down.
        petMenu(f) {
            const PS = window.PetSystem;
            const pet = PS && PS.getActivePet ? PS.getActivePet() : null;
            if (!pet) return false;
            if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return false;

            f.setDirection(f.reverseDir($gamePlayer.direction()));
            this.clearGoal(this.stateOf(f));
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
        // said by it, so a growl is never mistaken for conversation.
        petStroked(f, pet) {
            const lines = T.pool("AutoIdle.pet.petted");
            if (!lines.length) return;
            const line = lines[Math.floor(Math.random() * lines.length)]
                .replace(/\{name\}/g, pet.name || "");
            window.skipLocalization = true;
            $gameMessage.add(line);
            window.skipLocalization = false;
        },

        // Its own page, opened by name: with no event and no actor behind it,
        // the society profile under its name is the whole of what there is.
        petEmpathize(pet) {
            const EM = window.NPCEmpathize;
            if (!EM || typeof EM.openByName !== "function" || !pet.name) return;
            EM.openByName(pet.name);
        },
    };

    AutoIdle.loose = Loose;

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

        // Every member walking themselves back to the leader.
        startParty() {
            if (!this._available()) return;
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

        // Everybody at the leader's elbow. Arrived is one tile away or closer,
        // which is where the marching column would have left them.
        _stepParty(job) {
            let waiting = false;
            for (const f of $gamePlayer.followers().data()) {
                if (!f.isVisible() || Loose.heldByP2(f)) continue;
                if (Loose.dist(f, $gamePlayer) <= 1) {
                    if (!f.isMoving()) f.setDirection(f.reverseDir($gamePlayer.direction()));
                    continue;
                }
                waiting = true;
                if (f.isMoving()) continue;
                if (Loose.offScreen(f, LOOSE_SNAP_MARGIN)) {
                    Loose.placeBeside(f);
                    continue;
                }
                f.setMoveSpeed($gamePlayer.realMoveSpeed());
                Loose.stepTo(f, $gamePlayer.x, $gamePlayer.y);
            }
            return !waiting;
        },

        // The two of them. Walking is over when they stand next to each other;
        // the command is over once they are actually looking at each other,
        // which is a frame or two later.
        _stepPair(job) {
            const f = job.follower;
            if (!f || !f.isVisible()) return true;
            if (Loose.dist(f, $gamePlayer) > 1) {
                if (!f.isMoving()) {
                    f.setMoveSpeed($gamePlayer.realMoveSpeed());
                    Loose.stepTo(f, $gamePlayer.x, $gamePlayer.y);
                }
                return false;
            }
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
            if (SceneManager.isSceneChanging()) return false;
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
                // The errand belonged to whoever used to walk that slot.
                Loose.clearGoal(Loose.stateOf(f));
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
            // the frame (AnalogStickInput), and the game-wide scroll poll in
            // MouseControls stands down when somebody else has. Claiming it on
            // a map where the party cannot cycle anyway - mid-message, in a
            // vehicle, while an event runs - would cost every overlay open over
            // that map its L2/R2 scrolling for nothing.
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
    window.AutoIdleExplorer = AutoIdle;

    // ========================================================================
    // Loose party hooks
    // ========================================================================
    // 0) Map 315 (the world map) draws the party as a single dot: a scattered
    //    party would otherwise show human-scale sprites on a screen where one
    //    tile is a whole region.
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

    // 1) The chase itself. The rope is cut, except while the party is being
    //    called in (a running leader, or an event's Gather Party) and while the
    //    loose layer stands down (a vehicle, split-screen, a battle).
    const _Game_Followers_updateMove_loose = Game_Followers.prototype.updateMove;
    Game_Followers.prototype.updateMove = function () {
        // A map battle (BattleSystem/MapBattleMode.js) walks every member itself,
        // one tile at a time, and each one holds the tile it is fighting from.
        // Neither branch below may run: the loose layer is off for the fight
        // anyway (conditionsMet), which means control would fall through to the
        // vanilla chase and chaseCharacter would drag the whole train along
        // behind every tactical step the leader takes, undoing the positioning
        // the fight is being fought over. Checked before recalling() too, since
        // a Gather Party queued before the fight would do the same.
        if (Loose.inMapBattle()) return;
        if (Loose.recalling()) {
            _Game_Followers_updateMove_loose.call(this);
            return;
        }
        if (Loose.active()) return;
        // The loose layer has stood down (a vehicle, split-screen, an event
        // gathering the party): the engine's own chain takes the rope back for
        // as long as it lasts.
        _Game_Followers_updateMove_loose.call(this);
    };

    // 2) Each member's own turn to act, once per frame.
    const _Game_Follower_update_loose = Game_Follower.prototype.update;
    Game_Follower.prototype.update = function () {
        _Game_Follower_update_loose.call(this);
        try {
            Loose.updateFollower(this);
        } catch (e) {
            console.error("[AutoIdleExplorer] loose follower error:", e);
        }
    };

    // 2b) The camera walking from one member to the other owns the display for
    //     those few frames: the engine would otherwise drag it back the moment
    //     the new leader took a step.
    const _Game_Player_updateScroll_lead = Game_Player.prototype.updateScroll;
    Game_Player.prototype.updateScroll = function (lastScrolledX, lastScrolledY) {
        if (Lead.panning()) return;
        _Game_Player_updateScroll_lead.call(this, lastScrolledX, lastScrolledY);
    };

    // 2c) Collisions. Loose members are solid: to the leader, to each other and
    //     to nobody else (an NPC still walks through them, as it always has).
    const _Game_Player_isCollidedWithCharacters_loose = Game_Player.prototype.isCollidedWithCharacters;
    Game_Player.prototype.isCollidedWithCharacters = function (x, y) {
        if (_Game_Player_isCollidedWithCharacters_loose &&
            _Game_Player_isCollidedWithCharacters_loose.call(this, x, y)) return true;
        try {
            return Loose.blocksLeader(x, y);
        } catch (e) {
            return false;
        }
    };

    const _Game_Follower_isCollidedWithCharacters_loose = Game_Follower.prototype.isCollidedWithCharacters;
    Game_Follower.prototype.isCollidedWithCharacters = function (x, y) {
        if (_Game_Follower_isCollidedWithCharacters_loose &&
            _Game_Follower_isCollidedWithCharacters_loose.call(this, x, y)) return true;
        try {
            return Loose.blocksFollower(this, x, y);
        } catch (e) {
            return false;
        }
    };

    // 2d) ...but a body that can move is not a wall. Before the leader's own
    //     step is resolved, whoever is standing on the tile they are walking
    //     into is asked to step aside, so the party parts around the player
    //     rather than penning them in.
    const _Game_Player_executeMove_loose = Game_Player.prototype.executeMove;
    Game_Player.prototype.executeMove = function (direction) {
        try {
            Loose.nudgeAside(direction);
        } catch (e) { /* never block the leader's own step */ }
        _Game_Player_executeMove_loose.call(this, direction);
    };

    // 3) OK on a member standing in front of the leader opens their Empathize
    //    sheet, the same page the Dynamics roster opens. Checked before the
    //    engine's own action button so the member is not walked through.
    const _Game_Player_triggerButtonAction_loose = Game_Player.prototype.triggerButtonAction;
    Game_Player.prototype.triggerButtonAction = function () {
        if (Input.isTriggered("ok") && !this.isInVehicle()) {
            const f = Loose.facedFollower() || Loose.facedPet();
            if (f && Loose.talkTo(f)) return true;
        }
        return _Game_Player_triggerButtonAction_loose.call(this);
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
            Loose.update();
        } catch (e) {
            console.error("[AutoIdleExplorer] loose party update error:", e);
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

    const _Loose_updateFollower_downed = Loose.updateFollower;
    Loose.updateFollower = function (f) {
        const actor = f && f.actor && f.actor();
        if (actor && actor.isDead()) {
            // Find a living party member to carry this downed member
            const followers = $gamePlayer.followers().data();
            let carrier = null;
            if (!$gamePlayer.isTransparent() && $gameParty.leader() && !$gameParty.leader().isDead()) {
                carrier = $gamePlayer;
            } else {
                for (const other of followers) {
                    const otherActor = other.actor && other.actor();
                    if (otherActor && !otherActor.isDead()) {
                        carrier = other;
                        break;
                    }
                }
            }
            if (carrier) {
                f.locate(carrier.x, carrier.y);
                f.setDirection(carrier.direction());
                f.setThrough(true);
            }
            return;
        }
        _Loose_updateFollower_downed.call(this, f);
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
