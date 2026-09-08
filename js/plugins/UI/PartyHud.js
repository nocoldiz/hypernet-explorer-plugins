//=============================================================================
// Party HUD
// Version: 3.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Party HUD v3.0.0
 * @author Omni-Lex
 * @version 3.0.0
 * @description The one party HUD, on the map and in battle: HP/MP/AP, states, needs and whose turn it is
 *
 * @param hudX
 * @text HUD X
 * @desc Distance from the left edge of the screen, in pixels.
 * @type number
 * @min 0
 * @max 400
 * @default 12
 *
 * @param hudY
 * @text HUD Y
 * @desc Distance from the top edge of the screen, in pixels.
 * @type number
 * @min 0
 * @max 400
 * @default 34
 *
 * @param panelWidth
 * @text Panel Width
 * @desc Width of a member card, in pixels.
 * @type number
 * @min 120
 * @max 480
 * @default 264
 *
 * @param maxMembers
 * @text Max Members
 * @desc How many party members the HUD shows at most.
 * @type number
 * @min 1
 * @max 8
 * @default 4
 *
 * @param maxStates
 * @text Max State Labels
 * @desc How many state/buff labels are shown per member.
 * @type number
 * @min 0
 * @max 12
 * @default 6
 *
 * @help PartyHud.js
 *
 * The party HUD, and there is only one of it: the same cards stand in the
 * top-left corner of the map and of a battle, so the party never has to be
 * read twice in two different languages. It is HTML (#party-hud, styled in
 * css/game.css) rather than a canvas window.
 *
 * A member is a row: the card and a column of chips standing to the right of
 * it, outside the box. The card carries no background or border of its own:
 * it is the bars themselves, laid over whatever is behind them.
 *
 * The card reads top to bottom as one stack:
 *
 *     > Name L.7
 *     ==================120/180==   <- HP bar, value written inside it
 *              (AP)                 <- the AP orb, between the two bars
 *     ========30/60===========      <- MP bar, value written inside it
 *
 * There is no portrait and no walking sprite on it. On the map the member is
 * already standing on the map, and in battle their turn is called out by the
 * caret and the lit card rather than by a sprite marching on the spot.
 *
 * The AP orb belongs to party members and to nobody else: monsters carry a
 * bare HP/MP pair (BattleSystem/BattleSystemEnhancedHUD.js) with no orb on it.
 * AP is spent sprinting on the map as well as in battle, so the orb is up in
 * both places. See Map/MovementInteractionSystem.js for the sprint meter.
 *
 * What the chip column carries depends on where the party is standing:
 *
 *   - urgent needs      map only     (hunger, sleep, hygiene, cravings, illness)
 *   - stat changes      battle only  ("STR 1.4x", the buffs and debuffs in force)
 *   - class chips       battle only  (pins, combo, chi, ... via the passives plugin)
 *   - states            both
 *
 * A need is a thing to go and see to, which is a map errand; a stat multiplier
 * is something to plan a turn around, which is a battle one. Statuses matter
 * wherever the party is, so they show in both. A buff has no chip of its own:
 * the stat chip already carries where the stat landed, which is what the arrows
 * were pointing at.
 *
 * The chips lie in rows running away from the card, not in a column stacked
 * under it, and the whole strip is lifted out of the layout: however many
 * chips a member has picked up, the bars stay exactly where they were and the
 * member below them never moves.
 *
 * A chip appears whenever something needs seeing to: low health, hunger,
 * sleep, hygiene, social or fun below the warning line (and a second, louder
 * colour below the critical one), plus a craving an addicted member is about
 * to go into withdrawal over. The needs come from window.PartyNeeds, the
 * cravings from window.AddictionSystem, so the HUD reads the same meters the
 * menu and the status screen do.
 *
 * While the party is aboard a vehicle on the map, that vehicle stands above
 * the crew as a row of its own, carrying its name, its condition as an HP bar
 * (every maintenance part added up) and its fuel where a member's magic would
 * be, in purple. See MergedVehicleSystem.getHudVehicleStatus().
 *
 * In battle the card also does the work the old portrait cards did: the acting
 * member's card is lit and carries a caret, and a card can be clicked to aim an
 * ally-targeted skill at whoever stands on it.
 *
 * The HUD is ON by default and is switched off from Options -> Video
 * ("Party HUD") or on the first step of character creation. The setting is
 * stored in ConfigManager.partyHud.
 */

(() => {
  // A severed-magic world has no magic in it, so there is nothing to spend a
  // magic meter on: the MP row is not drawn at all. See window.MagicNature.
  function hideMpBar() {
    const MN = window.MagicNature;
    return !!(MN && typeof MN.level === "function" && MN.level() === "severed");
  }

    'use strict';

    const pluginName = 'PartyHud';
    const parameters = PluginManager.parameters(pluginName);

    const HUD_X = Number(parameters['hudX'] || 12);
    // The FPS / frame-time counter sits in the same top-left corner, so the
    // first card starts below it rather than underneath it.
    const HUD_Y = Number(parameters['hudY'] || 34);
    const PANEL_W = Number(parameters['panelWidth'] || 264);
    const MAX_MEMBERS = Number(parameters['maxMembers'] || 4);
    const MAX_STATES = Number(parameters['maxStates'] || 6);

    const MAX_ALERTS = 3;           // urgent-need chips per member
    const NEED_REFRESH_FRAMES = 30; // needs move slowly; don't read them per frame
    // Every chip row allocates an array and a string to be compared against, and
    // the class chips call into another plugin to build theirs. None of them
    // change more than a few times a round, so they are read a few times a
    // second rather than sixty; a state that shows a tenth of a second late is
    // a state nobody saw arrive late.
    const CHIP_REFRESH_FRAMES = 6;
    const FLASH_MS = 420;           // damage / healing wash on the HP bar

    // Where a meter stops being comfortable and where it becomes an emergency.
    // Health, food and rest are what a walk can end on, so they speak up early;
    // hygiene, company and fun only once they are genuinely neglected, or the
    // cards would carry three chips at all times and say nothing.
    const WARN_PCT = 30;
    const CRIT_PCT = 15;
    const NEED_WARN = { hunger: 30, sleep: 30, hygiene: 20, social: 20, leisure: 20 };
    const NEED_CRIT = { hunger: 15, sleep: 15, hygiene: 8, social: 8, leisure: 8 };
    // A craving is worth a chip once it is close to the withdrawal state, which
    // AddictionSystem hands out at 100 and only clears again under 80.
    const CRAVING_WARN = 80;
    const CRAVING_CRIT = 95;


    //=========================================================================
    // Where the party is standing
    //=========================================================================
    const inBattle = () => SceneManager._scene instanceof Scene_Battle;

    //=========================================================================
    // ConfigManager
    //=========================================================================
    // On by default: the party's health is the one thing a map screen should
    // never make the player open a menu for.
    ConfigManager.partyHud = true;

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData.call(this);
        config.partyHud = this.partyHud;
        config.partyHudDefaulted = true;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData.call(this, config);
        // The HUD used to ship off, so every config written before this carries
        // partyHud:false, which is a default rather than a choice. It is turned
        // on once, and the marker below records that it has been.
        if (!config.partyHudDefaulted) {
            this.partyHud = true;
            return;
        }
        this.partyHud = this.readFlag(config, 'partyHud', true);
    };

    if (window.GameOptions && typeof window.GameOptions.registerOption === 'function') {
        // The label is registered as a function so it re-resolves whenever the
        // options list is rebuilt, which is how it follows a language change.
        window.GameOptions.registerOption('partyHud', () => T('PartyHud.optionName'),
            () => ConfigManager.partyHud,
            (value) => {
                ConfigManager.partyHud = value;
                ConfigManager.save();
            },
            'video', 'boolean');
    }

    //=========================================================================
    // Urgent needs
    //=========================================================================
    // Every meter the HUD is prepared to complain about. Each key names its own
    // wording under PartyHud.alert, in two registers: `<key>` for the warning
    // and `<key>Critical` for the emergency, so a member reads "Hungry 26%"
    // first and "Starving 9%" later.
    const NEED_KEYS = ['hunger', 'sleep', 'hygiene', 'social', 'leisure'];

    const alertText = (key, critical, pct) => {
        const label = T('PartyHud.alert.' + key + (critical ? 'Critical' : ''));
        return label + ' ' + Math.max(0, Math.round(pct)) + '%';
    };

    // The chips one member has earned, worst first, capped at MAX_ALERTS.
    // Returns [{ key, text, critical }].
    const urgentAlertsFor = (actor, needs) => {
        const out = [];
        if (!actor) return out;

        if (actor.isDead()) {
            out.push({ key: 'dead', text: T('PartyHud.alert.dead'), critical: true, sort: -1 });
        } else {
            const hpPct = actor.mhp > 0 ? (actor.hp / actor.mhp) * 100 : 100;
            if (hpPct <= WARN_PCT) {
                out.push({ key: 'hp', text: alertText('hp', hpPct <= CRIT_PCT, hpPct), critical: hpPct <= CRIT_PCT, sort: hpPct });
            }
        }

        for (const key of NEED_KEYS) {
            const pct = needs ? needs[key] : null;
            if (pct === null || pct === undefined) continue;
            if (pct > NEED_WARN[key]) continue;
            const critical = pct <= NEED_CRIT[key];
            out.push({ key, text: alertText(key, critical, pct), critical, sort: pct });
        }

        // Being ill is a standing condition, so it keeps a chip for as long as
        // it lasts. A lifelong one is left off: it belongs on the character
        // sheet, not on a chip that would never come down again. An illness
        // still inside its window period shows as an unnamed one, which is
        // exactly what the party knows about it.
        for (const illness of window.DiseaseSystem?.shortLines?.(actor) || []) {
            if (illness.permanent) continue;
            out.push({
                key: 'disease:' + illness.id, // i18n-ignore: chip identity
                text: illness.needsMedicine
                    ? T('PartyHud.alert.illUntreated', { disease: illness.name })
                    : T('PartyHud.alert.ill', { disease: illness.name }),
                critical: illness.critical,
                sort: illness.critical ? -0.5 : 12
            });
        }

        // A craving climbs instead of draining, so it is read the other way up.
        const worst = window.AddictionSystem?.worst?.(actor);
        if (worst && worst.value >= CRAVING_WARN) {
            const label = window.AddictionSystem.label(worst.key);
            out.push({
                key: 'craving',
                text: T('PartyHud.alert.craving', { substance: label }),
                critical: worst.value >= CRAVING_CRIT,
                sort: 100 - worst.value
            });
        }

        out.sort((a, b) => a.sort - b.sort);
        return out.slice(0, MAX_ALERTS);
    };

    //=========================================================================
    // The vehicle the party is aboard
    //=========================================================================
    // Reads whatever the party is riding in or standing inside, or null on
    // foot. The vehicle plugin owns the question of what counts (see
    // MergedVehicleSystem.getHudVehicleStatus); the HUD only draws the answer.
    // A vehicle is map furniture: in a battle the fight is what the cards are
    // for, and the row would only push the party down the screen.
    const vehicleStatus = () => {
        if (inBattle()) return null;
        const status = window.MergedVehicleSystem?.getHudVehicleStatus?.();
        return status || null;
    };

    // A card key of its own, so the vehicle's HP never shares the flash /
    // last-value bookkeeping with an actor id.
    const vehicleCardKey = (status) => 'vehicle:' + status.key;

    //=========================================================================
    // States
    //=========================================================================
    // States are named on the card in words, not drawn as icons. A state with
    // no icon is database plumbing the party is not meant to read, and the
    // death state already has its own "Down" chip, so both are left out.
    // Buffs get no chip of their own here: a stack of arrows only says which
    // way a stat went, while the stat chips below already say exactly where it
    // landed ("CON 0.8x"), so the arrows were the same news told worse.
    const dbName = (name) =>
        (typeof window.translateText === 'function' ? window.translateText(name) : name) || '';

    const stateLabelsFor = (actor) => {
        const out = [];
        if (!actor) return out;
        for (const state of actor.states()) {
            if (!state || state.id === actor.deathStateId()) continue;
            if (!state.iconIndex || !state.name) continue;
            // A state that takes the turn away leans red, the way the monster
            // cards mark one (BattleSystem/BattleSystemEnhancedHUD.js).
            out.push({
                key: 'state:' + state.id,
                text: dbName(state.name),
                debuff: !!(state.restriction && state.restriction > 0)
            });
        }
        return out.slice(0, MAX_STATES);
    };

    //=========================================================================
    // Stat changes (battle only)
    //=========================================================================
    // Nothing stands here any more. A card used to carry one chip per changed
    // stat, written as a multiplier ("INT 0.8x"), which said that something had
    // happened without ever saying how much: 0.8x of a number the player cannot
    // see is not a figure they can plan around. Every change is now reported in
    // the battle log, in points, at the moment it lands, for the party and for
    // the enemy alike (Core/MPP_SmoothBattleLog2.js). The card keeps its class
    // gimmick chips, which are counts rather than rates.

    // The live class-gimmick chips (Wrestler pins, Boxer combo, chi, decoys,
    // souls, ...). The class logic stays in BattleSystemPassiveSkills; the HUD
    // only stands the answers up in a row.
    // Battle test only: the card names whatever the actor is holding, every
    // weapon of a dual wielder included, so a test troop can be read at a
    // glance without opening the equip menu. Never shown in a real game.
    const isBattleTest = () =>
        typeof DataManager !== 'undefined' &&
        typeof DataManager.isBattleTest === 'function' &&
        DataManager.isBattleTest();

    const battleTestGear = (actor) => {
        if (!actor || !isBattleTest() || typeof actor.equips !== 'function') return '';
        const names = [];
        for (const item of actor.equips()) {
            if (!item || !item.name) continue;
            const isWeapon = DataManager.isWeapon && DataManager.isWeapon(item);
            const isShield = DataManager.isArmor && DataManager.isArmor(item) && item.etypeId === 2;
            if (isWeapon || isShield) names.push(dbName(item.name));
        }
        if (!names.length) return '';
        return T('PartyHud.gear.held', { list: names.join(T('PartyHud.gear.separator')) });
    };

    const classChipsFor = (actor) => {
        const get = window.BattleSystemPassiveSkills?.getBattleChips;
        if (typeof get !== 'function') return [];
        return (get(actor) || []).filter(c => c && c.label);
    };

    //=========================================================================
    // Whose turn it is
    //=========================================================================
    const actingActor = () => {
        if (!inBattle() || typeof BattleManager === 'undefined') return null;
        if (BattleManager._currentActor) return BattleManager._currentActor;
        const subject = BattleManager._subject;
        return subject && subject.isActor && subject.isActor() ? subject : null;
    };

    // The ally-target picker, while it is up. A card is clickable exactly while
    // this window is taking input, and never otherwise.
    const allyPicker = () => {
        const scene = SceneManager._scene;
        const win = scene && scene._actorWindow;
        return win && win.active ? win : null;
    };

    //=========================================================================
    // PartyHudOverlay
    //=========================================================================
    // The cards are built once per party and then written into in place, so a
    // walking party costs a handful of textContent/style writes per refresh and
    // the CSS transitions on the bars are never interrupted by a rebuild.
    function PartyHudOverlay() {
        this._el = null;
        this._cards = new Map();    // actorId -> { root, name, states, hp, mp, alerts, ... }
        this._vehicleCard = null;   // the row above them, while the party is aboard one
        this._vehicleCardKey = '';  // which vehicle that row is drawing
        this._layoutKey = '';
        this._needs = new Map();    // actorId -> needs object
        this._needTimer = NEED_REFRESH_FRAMES;
        this._chipTimer = 0;
        this._ascii = false;
        this._lastHp = new Map();   // actorId | 'vehicle:<key>' -> last HP seen
        this._projectedAp = new Map(); // actorId -> AP left after the armed skill
        this._visible = false;
        this._create();
    }

    PartyHudOverlay.prototype._create = function () {
        const el = document.createElement('div');
        el.id = 'party-hud';
        el.style.left = HUD_X + 'px';
        el.style.top = HUD_Y + 'px';
        // The card keeps the configured width; the chips sit beside it, outside
        // the box, so the overlay itself is as wide as it needs to be.
        el.style.setProperty('--phud-card-w', PANEL_W + 'px');
        document.body.appendChild(el);
        this._el = el;

        const style = document.createElement('style');
        style.textContent = `
            #party-hud .phud-name {
                color: #ffffff !important;
                text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 2px rgba(0,0,0,0.8);
            }
            #party-hud .phud-card.phud-acting .phud-name {
                color: #ffd766 !important;
                text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 8px rgba(255, 210, 90, 0.8) !important;
            }
            #party-hud .phud-bars-container {
                position: relative;
                display: flex;
                flex-direction: column;
                gap: 2px;
                margin-top: 3px;
                padding-left: 34px;
            }
            #party-hud .phud-bars-container .phud-bar {
                margin-top: 0;
                height: 13px;
                transform: skewX(-25deg);
            }
            #party-hud .phud-bars-container .phud-bar-lbl {
                transform: skewX(25deg);
                text-align: left;
                font-size: 12px;
                line-height: 13px;
                padding-left: 10px;
            }
            #party-hud .phud-mid {
                position: absolute;
                left: 4px;
                top: 50%;
                transform: translateY(-50%);
                z-index: 10;
                margin: 0 !important;
            }
            #party-hud .phud-hp .phud-fill {
                background: linear-gradient(to bottom, rgba(255,255,255,0.28) 50%, transparent 50%), linear-gradient(to right, #7a1420, #d94a4a) !important;
            }
            #party-hud .phud-mp .phud-fill {
                background: linear-gradient(to bottom, rgba(255,255,255,0.28) 50%, transparent 50%), linear-gradient(to right, #16386e, #4a86d9) !important;
            }
            #party-hud .phud-fuel .phud-fill {
                background: linear-gradient(to bottom, rgba(255,255,255,0.28) 50%, transparent 50%), linear-gradient(to right, #3d1466, #a05ce0) !important;
            }
            #party-hud .phud-bar-low .phud-fill {
                background: linear-gradient(to bottom, rgba(255,255,255,0.28) 50%, transparent 50%), linear-gradient(to right, #7a4a10, #e0a63a) !important;
            }
            #party-hud .phud-bar-critical .phud-fill {
                background: linear-gradient(to bottom, rgba(255,255,255,0.28) 50%, transparent 50%), linear-gradient(to right, #7a1420, #ff5a5a) !important;
            }
            #party-hud.phud-ascii .phud-bar {
                transform: none;
                height: 14px;
            }
            #party-hud.phud-ascii .phud-bar-lbl {
                transform: none;
                font-size: 12px;
                line-height: 14px;
                padding-left: 0;
                text-align: center;
            }
            #party-hud.phud-ascii .phud-fill {
                background: #c0c0c0 !important;
            }
        `;
        document.head.appendChild(style);
        this._styleEl = style;
    };

    PartyHudOverlay.prototype.destroy = function () {
        if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
        this._el = null;
        if (this._styleEl && this._styleEl.parentNode) this._styleEl.parentNode.removeChild(this._styleEl);
        this._styleEl = null;
        this._cards.clear();
        this._vehicleCard = null;
        this._vehicleCardKey = '';
    };

    PartyHudOverlay.prototype.members = function () {
        if (!$gameParty) return [];
        // In a fight the cards are the fighters: a reserve member has no turn to
        // take and nothing to aim a skill at.
        const roster = inBattle() ? $gameParty.battleMembers() : $gameParty.members();
        return roster.slice(0, MAX_MEMBERS);
    };

    //-------------------------------------------------------------------------
    // Card construction
    //-------------------------------------------------------------------------
    PartyHudOverlay.prototype._makeBar = function (kind) {
        const bar = document.createElement('div');
        bar.className = 'phud-bar phud-' + kind;
        const fill = document.createElement('div');
        fill.className = 'phud-fill';
        const flash = document.createElement('div');
        flash.className = 'phud-flash';
        const label = document.createElement('span');
        label.className = 'phud-bar-lbl';
        bar.appendChild(fill);
        bar.appendChild(flash);
        bar.appendChild(label);
        return { bar, fill, flash, label };
    };

    // The AP orb, sitting between the HP and MP bars. It is a party-member
    // thing only: AP is what their skills and their sprint come out of, and no
    // monster carries one. The ghost ring behind the fill is the AP an armed
    // skill is about to take (see setProjectedAp).
    PartyHudOverlay.prototype._makeOrb = function () {
        const orb = document.createElement('div');
        orb.className = 'phud-orb';
        const ghost = document.createElement('div');
        ghost.className = 'phud-orb-ghost';
        const fill = document.createElement('div');
        fill.className = 'phud-orb-fill';
        const value = document.createElement('span');
        value.className = 'phud-orb-val';
        orb.appendChild(ghost);
        orb.appendChild(fill);
        orb.appendChild(value);
        return { orb, ghost, fill, value };
    };

    PartyHudOverlay.prototype._makeChipRow = function (cls) {
        const row = document.createElement('div');
        row.className = cls + ' phud-alerts-empty';
        return row;
    };

    PartyHudOverlay.prototype._makeCard = function () {
        // A member is a row: the card and the chip column standing to the
        // right of it, outside the box.
        const row = document.createElement('div');
        row.className = 'phud-row';

        const root = document.createElement('div');
        root.className = 'phud-card';

        // Head: the turn caret and the name.
        const head = document.createElement('div');
        head.className = 'phud-head';
        const caret = document.createElement('span');
        caret.className = 'phud-caret';
        caret.textContent = '▶';
        const name = document.createElement('span');
        name.className = 'phud-name';
        head.appendChild(caret);
        head.appendChild(name);

        const hp = this._makeBar('hp');
        const mp = this._makeBar('mp');

        // Mid: the AP orb, sitting in the gap between the HP and MP bars.
        const orb = this._makeOrb();
        const mid = document.createElement('div');
        mid.className = 'phud-mid';
        mid.appendChild(orb.orb);

        const chips = document.createElement('div');
        chips.className = 'phud-chips';
        const alerts = this._makeChipRow('phud-alerts');
        const stats = this._makeChipRow('phud-stats');
        const states = this._makeChipRow('phud-states');
        chips.appendChild(alerts);
        chips.appendChild(stats);
        chips.appendChild(states);

        root.appendChild(head);

        const barsContainer = document.createElement('div');
        barsContainer.className = 'phud-bars-container';
        barsContainer.appendChild(hp.bar);
        barsContainer.appendChild(mid);
        barsContainer.appendChild(mp.bar);
        root.appendChild(barsContainer);

        row.appendChild(root);
        row.appendChild(chips);

        return {
            row, root, caret, name, mid, states, stats, hp, mp, alerts, orb,
            statesKey: null, alertsKey: null, statsKey: null, deadKey: null,
            orbKey: null, activeKey: null, targetKey: null
        };
    };

    // The vehicle's card is a member card with the crew's furniture taken off
    // it: no orb, no chips (a car has no AP, no needs and no buffs), and the
    // magic bar turned into a fuel gauge, which is what the purple `phud-fuel`
    // colours.
    PartyHudOverlay.prototype._makeVehicleCard = function () {
        const card = this._makeCard();
        card.root.classList.add('phud-vehicle');
        card.mp.bar.classList.add('phud-fuel');
        card.mid.style.display = 'none';
        // The caret keeps its place (hidden, never removed): dropping it out of
        // the layout would pull the vehicle's name left of the crew's, and the
        // row above the party has to line up with the party.
        card.caret.style.visibility = 'hidden';
        card.alerts.classList.add('phud-alerts-empty');
        card.stats.classList.add('phud-alerts-empty');
        card.states.classList.add('phud-alerts-empty');
        return card;
    };

    // Aiming an ally-targeted skill by pointing at the card. The engine's own
    // ally picker is an invisible window (BattleSystemEnhancedHUD hides it), so
    // the cards ARE the list: hovering one moves its cursor, clicking one
    // confirms. Bound once per card, at build time.
    PartyHudOverlay.prototype._bindTargeting = function (card, actor) {
        const pick = (confirm) => {
            const win = allyPicker();
            if (!win) return;
            const index = $gameParty.battleMembers().indexOf(actor);
            if (index < 0) return;
            if (win.index() !== index) win.select(index);
            if (confirm) win.processOk();
        };
        card.row.addEventListener('mouseenter', () => pick(false));
        card.row.addEventListener('click', () => pick(true));
    };

    // Rebuild the card list when the party itself changes (a member joins,
    // leaves, or the whole roster is swapped out), or when the party gets in or
    // out of a vehicle: that row is built and dropped with the same rebuild.
    PartyHudOverlay.prototype._syncCards = function (members, vehicle) {
        const key = (vehicle ? vehicleCardKey(vehicle) + '|' : '') +
            members.map(m => m.actorId()).join(',');
        if (key === this._layoutKey) return;
        this._layoutKey = key;
        this._el.innerHTML = '';

        // The vehicle carries the party, so it stands above them. Getting out
        // (or changing vehicle) forgets the card entirely, so climbing back in
        // starts its bars and its damage flash from a clean sheet.
        const vehicleKey = vehicle ? vehicleCardKey(vehicle) : '';
        if (this._vehicleCardKey && this._vehicleCardKey !== vehicleKey) {
            this._lastHp.delete(this._vehicleCardKey);
            this._vehicleCard = null;
        }
        this._vehicleCardKey = vehicleKey;
        if (vehicle) {
            if (!this._vehicleCard) this._vehicleCard = this._makeVehicleCard();
            this._el.appendChild(this._vehicleCard.row);
        }

        const kept = new Map();
        for (const actor of members) {
            const id = actor.actorId();
            let card = this._cards.get(id);
            if (!card) {
                card = this._makeCard();
                this._bindTargeting(card, actor);
            }
            kept.set(id, card);
            this._el.appendChild(card.row);
        }
        this._cards = kept;
    };

    //-------------------------------------------------------------------------
    // Writing a card
    //-------------------------------------------------------------------------
    PartyHudOverlay.prototype._writeBar = function (slot, current, max, kind) {
        // refresh() runs every frame, so nothing is written unless it changed.
        const key = current + '/' + max;
        if (key === slot.key) return;
        slot.key = key;
        const rate = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
        slot.fill.style.width = (rate * 100).toFixed(1) + '%';
        slot.label.textContent = Math.round(current) + '/' + Math.round(max);
        if (kind === 'hp') {
            const critical = rate > 0 && rate <= CRIT_PCT / 100;
            slot.bar.classList.toggle('phud-bar-critical', critical);
            const low = !critical && rate > 0 && rate <= WARN_PCT / 100;
            slot.bar.classList.toggle('phud-bar-low', low);
        }
    };

    // The AP orb: how much of it is left, and (while a skill is armed) how much
    // of that the skill is about to take, shown as the dimmer ring the fill
    // has retreated from.
    PartyHudOverlay.prototype._writeOrb = function (card, actor) {
        const max = Math.max(1, actor.maxTp ? actor.maxTp() : 100);
        const now = Math.floor(actor.tp);
        const projected = this._projectedAp.has(actor.actorId())
            ? Math.floor(this._projectedAp.get(actor.actorId()))
            : now;
        const key = now + '/' + max + '/' + projected;
        if (key === card.orbKey) return;
        card.orbKey = key;
        card.orb.fill.style.height = (Math.max(0, Math.min(1, projected / max)) * 100).toFixed(1) + '%';
        card.orb.ghost.style.height = (Math.max(0, Math.min(1, now / max)) * 100).toFixed(1) + '%';
        card.orb.value.textContent = String(now);
        card.orb.orb.classList.toggle('phud-orb-spent', projected < now);
        card.orb.orb.classList.toggle('phud-orb-empty', now <= 0);
    };

    // One chip row. `chips` is [{ key, text, critical?, down? }]; `extraClass`
    // is what marks the row's own register (a need, a stat, a state).
    PartyHudOverlay.prototype._writeChips = function (row, keyProp, card, chips, extraClass) {
        const key = chips.map(c => c.key + c.text + (c.critical ? '!' : '') + (c.down ? '-' : '')).join('|');
        if (key === card[keyProp]) return;
        card[keyProp] = key;
        row.innerHTML = '';
        for (const chip of chips) {
            const el = document.createElement('span');
            el.className = 'phud-alert ' + extraClass +
                (chip.critical ? ' phud-alert-critical' : '') +
                (chip.down ? ' phud-state-down' : '');
            if (chip.color) {
                el.style.color = chip.color;
                el.style.borderColor = chip.color;
            }
            el.textContent = chip.text;
            // The name half of a stat chip is lifted out into its own span so
            // it can stay white while the multiplier keeps the change's colour.
            if (chip.nameText && chip.text.startsWith(chip.nameText)) {
                el.textContent = '';
                const name = document.createElement('span');
                name.className = 'phud-chip-name';
                name.textContent = chip.nameText;
                el.appendChild(name);
                el.appendChild(document.createTextNode(chip.text.slice(chip.nameText.length)));
            }
            row.appendChild(el);
        }
        row.classList.toggle('phud-alerts-empty', chips.length === 0);
    };

    // A change in HP washes the bar: white for a hit, green for a heal. Applied
    // as a class with a timer rather than a redraw, so it rides the animation.
    // Keyed by actor id, or by vehicle key for the vehicle's own bar, so a
    // scraped wing flashes exactly the way a wounded member does.
    PartyHudOverlay.prototype._writeFlash = function (card, id, hp) {
        const prev = this._lastHp.get(id);
        this._lastHp.set(id, hp);
        if (prev === undefined || prev === hp) return;
        const healing = hp > prev;
        const flash = card.hp.flash;
        flash.classList.remove('phud-flash-hit', 'phud-flash-heal');
        void flash.offsetWidth; // restart the CSS animation
        flash.classList.add(healing ? 'phud-flash-heal' : 'phud-flash-hit');
        if (card.flashTimer) clearTimeout(card.flashTimer);
        card.flashTimer = setTimeout(() => {
            flash.classList.remove('phud-flash-hit', 'phud-flash-heal');
        }, FLASH_MS);
    };

    // The vehicle row: its name, its condition summed over every maintenance
    // part as the HP bar, and its tank in place of the magic bar. A vehicle
    // that keeps no health record (the Broom) draws no HP line, and one that
    // burns no fuel (the Bike, the Boat, the Broom) draws no fuel line.
    PartyHudOverlay.prototype._writeVehicle = function (card, status) {
        if (card.nameKey !== status.name) {
            card.nameKey = status.name;
            card.name.textContent = status.name;
        }

        const hasHealth = status.mhp > 0;
        card.hp.bar.style.display = hasHealth ? '' : 'none';
        if (hasHealth) {
            const hp = Math.round(status.hp);
            const mhp = Math.round(status.mhp);
            // Damage arrives from anywhere (a ram, a crash, a splash-down); the
            // bar simply follows the maintenance record, and washes red when it
            // drops the way a member's does.
            this._writeFlash(card, vehicleCardKey(status), hp);
            this._writeBar(card.hp, hp, mhp, 'hp');
            // A vehicle with every critical part gone is not driveable, which
            // reads the same way a downed member does.
            const broken = window.VehicleSystemRepair?.checkCriticalParts?.(status.key);
            if (card.deadKey !== broken) {
                card.deadKey = broken;
                card.root.classList.toggle('phud-down', !!broken);
            }
        }

        card.mp.bar.style.display = status.usesFuel ? '' : 'none';
        if (status.usesFuel) {
            this._writeBar(card.mp, Math.round(status.fuel), Math.round(status.maxFuel), 'fuel');
        }
    };

    PartyHudOverlay.prototype._needsFor = function (actor) {
        const id = actor.actorId();
        if (this._needTimer >= NEED_REFRESH_FRAMES || !this._needs.has(id)) {
            const read = window.PartyNeeds?.getMemberNeeds?.(actor) || {};
            this._needs.set(id, read);
            return read;
        }
        return this._needs.get(id);
    };

    PartyHudOverlay.prototype.refresh = function () {
        if (!this._el) return;
        const members = this.members();
        const vehicle = vehicleStatus();
        this._syncCards(members, vehicle);
        if (vehicle && this._vehicleCard) this._writeVehicle(this._vehicleCard, vehicle);

        const battle = inBattle();
        const acting = actingActor();
        const picker = allyPicker();
        this._chipTimer = (this._chipTimer + 1) % CHIP_REFRESH_FRAMES;
        const writeChips = this._chipTimer === 0;
        // The cards only take the mouse while there is something to aim at, so
        // they never swallow a click meant for the map underneath them.
        this._el.style.pointerEvents = picker ? 'auto' : 'none';

        for (const actor of members) {
            const card = this._cards.get(actor.actorId());
            if (!card) continue;
            const needs = battle ? null : this._needsFor(actor);
            const dead = actor.isDead();
            if (card.deadKey !== dead) {
                card.deadKey = dead;
                card.root.classList.toggle('phud-down', dead);
            }

            // Whose turn it is, said plainly: the card lights up and grows a
            // caret. A party of one has no turn order worth pointing at.
            const isActing = battle && actor === acting && members.length > 1;
            if (card.activeKey !== isActing) {
                card.activeKey = isActing;
                card.root.classList.toggle('phud-acting', isActing);
                card.caret.style.visibility = isActing ? 'visible' : 'hidden';
            }
            const isTargeted = !!(picker && actor.isSelected && actor.isSelected());
            if (card.targetKey !== isTargeted) {
                card.targetKey = isTargeted;
                card.root.classList.toggle('phud-targeted', isTargeted);
            }

            // The level rides next to the name everywhere, map and battle
            // alike. Whoever is holding the wheel is named as holding it too:
            // on a long drive the rota changes hands by itself
            // (VehicleCrew.js), so the card is the only place the party can
            // see who is driving and who is asleep in the back.
            let label = actor.name();
            if (actor.level) label += ' L.' + actor.level;
            const gear = battleTestGear(actor);
            if (gear) label += ' ' + gear;
            if (!battle && window.VehicleCrew?.isDriver?.(actor)) {
                label += ' ' + T('VehicleCrew.drivingTag');
            }
            if (card.nameKey !== label) {
                card.nameKey = label;
                card.name.textContent = label;
            }

            this._writeFlash(card, actor.actorId(), actor.hp);
            this._writeBar(card.hp, actor.hp, actor.mhp, 'hp');
            // A severed world has nothing to spend magic on, so the bar itself
            // is taken out of the card (`_makeBar` returns the element as
            // `.bar`) rather than drawn empty.
            const noMp = hideMpBar() || actor.mmp <= 0;
            card.mp.bar.style.display = noMp ? 'none' : '';
            if (!noMp) {
                this._writeBar(card.mp, actor.mp, actor.mmp, 'mp');
            }
            this._writeOrb(card, actor);

            // Needs are a map errand, stat multipliers and class gimmicks are a
            // battle plan, and a status is a fact wherever the party stands.
            if (!writeChips) continue;
            this._writeChips(card.alerts, 'alertsKey', card,
                battle ? [] : urgentAlertsFor(actor, needs), 'phud-need');
            this._writeChips(card.stats, 'statsKey', card,
                battle ? classChipsFor(actor).map(c => ({
                    key: 'class:' + c.label, text: c.label, color: c.color
                })) : [], 'phud-stat');
            this._writeChips(card.states, 'statesKey', card,
                MAX_STATES > 0 ? stateLabelsFor(actor).map(s => ({
                    key: s.key, text: s.text, down: s.debuff
                })) : [], 'phud-state');
        }
        if (this._needTimer >= NEED_REFRESH_FRAMES) this._needTimer = 0;
    };

    //-------------------------------------------------------------------------
    // Update
    //-------------------------------------------------------------------------
    // The option is the only thing allowed to take the HUD down: not a message
    // box, not ASCII mode (it gets the terminal skin instead, .phud-ascii), not
    // the card combat layer, and never in battle, where the party's health is
    // the one thing that cannot go unsaid.
    PartyHudOverlay.prototype.isWanted = function () {
        if (!ConfigManager.partyHud) return false;
        if (!$gameParty || $gameParty.members().length === 0) return false;
        if ($gameMap && $gameMap.mapId() === 557) return false;
        const scene = SceneManager._scene;
        return scene instanceof Scene_Battle || scene instanceof Scene_Map;
    };

    // The HUD is HTML laid over the canvas, so it follows the canvas rather
    // than the window: letterboxed, resized or switched to another resolution
    // (UI/ResolutionSwitcher.js), the cards keep their place inside the game
    // view and their size against everything drawn in it. The scale rides in a
    // custom property because the transform itself also carries the fade-in
    // slide, and the two would otherwise overwrite each other.
    PartyHudOverlay.prototype._followCanvas = function () {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return;
        const view = canvas.getBoundingClientRect();
        if (!(view.width > 0) || !(view.height > 0)) return;
        const sx = view.width / Graphics.width;
        const sy = view.height / Graphics.height;
        const key = [view.left, view.top, sx, sy].join('|');
        if (key === this._followKey) return;
        this._followKey = key;
        this._el.style.left = (view.left + HUD_X * sx) + 'px';
        this._el.style.top = (view.top + HUD_Y * sy) + 'px';
        this._el.style.setProperty('--phud-scale', sy.toFixed(4));
    };

    PartyHudOverlay.prototype.update = function () {
        if (!this._el) return;
        const wanted = this.isWanted();
        if (wanted !== this._visible) {
            this._visible = wanted;
            this._el.classList.toggle('phud-visible', wanted);
        }
        if (!wanted) return;
        const ascii = !!ConfigManager.asciiModeEnabled;
        if (ascii !== this._ascii) {
            this._ascii = ascii;
            this._el.classList.toggle('phud-ascii', ascii);
        }
        this._followCanvas();
        this._needTimer++;
        this.refresh();
    };

    // Where a member's card is standing, in the game's own coordinates rather
    // than the browser's. The battle scene plays an enemy's attack animation
    // over the member it lands on (BattleSystemEnhancedHUD.js), and the cards
    // are HTML laid over the canvas, so the reading has to come back through
    // the canvas' own scale. Returns null when the card is not up.
    PartyHudOverlay.prototype.canvasPointFor = function (actor) {
        if (!this._el || !this._visible || !actor) return null;
        const card = this._cards.get(actor.actorId());
        if (!card) return null;
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return null;
        const view = canvas.getBoundingClientRect();
        if (!(view.width > 0) || !(view.height > 0)) return null;
        // Measured, not computed: the box already carries the canvas scale the
        // overlay is standing at, so dividing it back out lands in game units.
        const box = card.root.getBoundingClientRect();
        const sx = view.width / Graphics.width;
        const sy = view.height / Graphics.height;
        return new Point(
            (box.left + box.width / 2 - view.left) / sx,
            (box.top + box.height / 2 - view.top) / sy
        );
    };

    // Where the cards' bars are standing, in the game's own coordinates: the
    // top of the first member's HP bar and the distance from one member's to
    // the next. The monster column in the opposite corner lines its own bars
    // up with these (BattleSystem/BattleSystemEnhancedHUD.js), so the two
    // columns read as one row of pairs rather than as two lists that happen to
    // share a screen. Returns null while the cards are not up.
    PartyHudOverlay.prototype.barRowMetrics = function () {
        if (!this._el || !this._visible) return null;
        const cards = Array.from(this._cards.values());
        if (cards.length === 0) return null;
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return null;
        const view = canvas.getBoundingClientRect();
        if (!(view.width > 0) || !(view.height > 0)) return null;
        const sy = view.height / Graphics.height;
        if (!(sy > 0)) return null;
        // Measured rather than computed: the cards carry the canvas' own scale,
        // so the reading is divided back out into game units.
        const first = cards[0].hp.bar.getBoundingClientRect();
        if (!(first.height > 0)) return null;
        const metrics = { top: (first.top - view.top) / sy, step: null };
        if (cards.length > 1) {
            const second = cards[1].hp.bar.getBoundingClientRect();
            if (second.height > 0) metrics.step = (second.top - first.top) / sy;
        }
        return metrics;
    };

    // The AP a skill the player is looking at would leave the caster with, so
    // the orb can show the cost before it is paid. Called with null to clear.
    PartyHudOverlay.prototype.setProjectedAp = function (actor, value) {
        if (!actor) return;
        const id = actor.actorId();
        if (value === null || value === undefined) this._projectedAp.delete(id);
        else this._projectedAp.set(id, value);
        const card = this._cards.get(id);
        if (card) card.orbKey = null; // force the orb to be written again
    };

    window.PartyHudOverlay = PartyHudOverlay;

    //=========================================================================
    // The live overlay, wherever the party happens to be standing
    //=========================================================================
    // One overlay per scene, built by whichever of the two scenes is up. The
    // façade is what every other plugin talks to, so nothing else has to know
    // which scene owns the HUD at any moment.
    let _overlay = null;

    window.PartyHud = {
        overlay: () => _overlay,
        canvasPointFor: (actor) => (_overlay ? _overlay.canvasPointFor(actor) : null),
        barRowMetrics: () => (_overlay ? _overlay.barRowMetrics() : null),
        setProjectedAp: (actor, value) => { if (_overlay) _overlay.setProjectedAp(actor, value); }
    };

    function attachHud(scene) {
        _overlay = new PartyHudOverlay();
        scene._partyHud = _overlay;
    }

    function detachHud(scene) {
        if (!scene._partyHud) return;
        scene._partyHud.destroy();
        if (_overlay === scene._partyHud) _overlay = null;
        scene._partyHud = null;
    }

    //=========================================================================
    // Scene_Map
    //=========================================================================
    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows.call(this);
        attachHud(this);
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        if (this._partyHud) this._partyHud.update();
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        detachHud(this);
        _Scene_Map_terminate.call(this);
    };

    //=========================================================================
    // Scene_Battle
    //=========================================================================
    // The same HUD, built the same way, so a fight opens with the party card
    // the player was already reading on the map.
    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function () {
        _Scene_Battle_createAllWindows.call(this);
        attachHud(this);
    };

    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update.call(this);
        if (this._partyHud) this._partyHud.update();
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function () {
        detachHud(this);
        _Scene_Battle_terminate.call(this);
    };
})();
