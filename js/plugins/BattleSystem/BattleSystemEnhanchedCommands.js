//=============================================================================
// BattleSystemEnhanchedCommands.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v3.0.0 HTML-rendered battle command window (crispy, like battlelog)
 * @author Assistant
 *
 * @help BattleSystemEnhanchedCommands.js
 *
 * Reworked actor command window for battle:
 * - HTML/CSS rendering identical in style to MPP_SmoothBattleLog2
 * - Per-command colored gradient bars with solid dark base
 * - Left accent stripe with command-type color
 * - Icon + label layout using the UI serif
 * - Selection highlight updates immediately
 * - Reload command support (requires WeaponSystem.js)
 *
 * Load order: Must load AFTER WeaponSystem.js
 */

(() => {
  "use strict";

  //=============================================================================
  // Row geometry
  //=============================================================================
  // One source of truth for the size of a command row. itemHeight() is the row
  // the invisible canvas window hit-tests against, so the HTML rows have to be
  // drawn at exactly the same height or a click lands on the wrong command:
  // both come from ROW_HEIGHT, and theme.css owns the colours only.
  const ROW_HEIGHT = 40;
  const ICON_PX    = 22;   // IconSet cells are 32px, scaled down to this
  const LABEL_PX   = 16;
  // The menu is as wide as the longest row it is showing, between these two.
  // The plain command list is short ("Attack", "Run") and sits at the minimum;
  // the lists other plugins hand this window (wrestling holds, talk openers)
  // write whole sentences into a row, and used to run off the edge of a fixed
  // box. Measuring is done once per rebuild, off the same font the rows paint
  // in, so the box is exactly as wide as its text needs and never wider.
  const MENU_WIDTH     = 176;
  const MENU_WIDTH_MAX = 420;
  // What a row spends on anything that is not the label: the icon and the
  // margins around it (see .actorcmd-icon / .actorcmd-label in theme.css), plus
  // a little air on the right so a label never touches the frame.
  const ROW_ICON_SPACE = 11 + ICON_PX + 8;
  const ROW_TAIL_SPACE = 16;
  // The gap between a label and the cost tail behind it.
  const ROW_COST_SPACE = 18;

  const ICON_SHEET_COLS = 16;   // IconSet.png is 16 cells across

  //=============================================================================
  // Command color palette
  //=============================================================================

  const COMMAND_COLORS = {
    move:         { accent: "#44dd44", rgb: [25,  140, 25 ] },
    attack:       { accent: "#e63232", rgb: [180, 25,  25 ] },
    reload:       { accent: "#e68832", rgb: [180, 100, 25 ] },
    vectorSwitch: { accent: "#c9a227", rgb: [150, 120, 30 ] },
    defense:      { accent: "#3388ff", rgb: [25,  80,  180] },
    // The Hyper takes the row Defense or Reload was standing in, and is the
    // one command in the rail that is not offered twice in a day.
    hyper:        { accent: "#ffb347", rgb: [190, 110, 20 ] },
    skill:        { accent: "#9944ee", rgb: [90,  35,  170] },
    basic:        { accent: "#66bbdd", rgb: [40,  120, 150] },
    item:         { accent: "#44cc88", rgb: [25,  140, 80 ] },
    throw:        { accent: "#dd8844", rgb: [150, 80,  35 ] },
    guard:        { accent: "#ffdd44", rgb: [140, 120, 25 ] },
    switchspirit: { accent: "#cc66ff", rgb: [120, 50,  170] },
    escape:       { accent: "#aaaaaa", rgb: [90,  90,  90 ] },
    aim:          { accent: "#ff8855", rgb: [175, 70,  40 ] },
    wrestle:      { accent: "#c8863c", rgb: [130, 80,  30 ] },
    talk:         { accent: "#dfc06a", rgb: [140, 110, 40 ] },
    // Wrestling (Health_Monsters.js) and the talk menu (EnemyTalkSystem.js)
    // borrow the whole menu for their own rows.
    wrestleRow:   { accent: "#c8863c", rgb: [130, 80,  30 ] },
    talkRow:      { accent: "#dfc06a", rgb: [140, 110, 40 ] },
    // Aim (Health_Monsters.js) does the same with the body it is naming a
    // part of: one row per limb, each carrying its own odds.
    aimRow:       { accent: "#ff8855", rgb: [175, 70,  40 ] },
    // The battle skill list (CategorizedBattleSkills.js) does the same, and
    // paints each of its rows itself: a skill row carries the colour of what
    // the skill is FOR, a party row the colour of the ally being pointed at.
    skillRow:     { accent: "#9944ee", rgb: [90,  35,  170] },
    allyRow:      { accent: "#44cc88", rgb: [25,  140, 80 ] },
    enemyRow:     { accent: "#e63232", rgb: [180, 25,  25 ] },
  };

  const getCommandColors = (symbol) =>
    COMMAND_COLORS[symbol] || { accent: "#888888", rgb: [60, 60, 60] };

  // A row painted by whoever pushed it, when the symbol alone does not say
  // enough: every skill in a list shares the symbol "skillRow", but each one
  // is coloured by the role it answers to.
  const getRowColors = (cmd) => cmd.colors || getCommandColors(cmd.symbol);

  // Fallback icons for commands injected by other plugins through the base
  // addCommand (which carries no iconIndex), keyed by symbol.
  const FALLBACK_ICONS = {
    move:         82,
    attack:       97,
    reload:       115,
    vectorSwitch: 118,
    defense:      81,
    hyper:        87,
    skill:        76,
    basic:        248,
    item:         209,
    throw:        176,
    talk:         246,
    aim:          151,
    wrestle:      106,
    guard:        125,
    switchspirit: 73,
    escape:       140,
    wrestleRow:   106,
    talkRow:      246,
    aimRow:       96,
    skillRow:     76,
    allyRow:      73,
    enemyRow:     97,
  };

  // Mirrors CategorizedBattleSkills' category resolution: skills without an explicit
  // <category:...> note fall into the "Basic" catch-all category.
  const getSkillCategory = (skill) =>
    (skill && skill.meta && typeof skill.meta.category === 'string' && skill.meta.category.trim()) || "Basic";

  // Talk (EnemyTalkSystem.js) is offered to every body that can hold a
  // conversation. From this class on (Feral, Mimic, Monster, Ghost, Zombie,
  // Drone and the rest of the unspeaking bodies) the row is greyed: the mouth
  // is there, what comes out of it is not language.
  const TALK_MUTE_CLASS_ID = 63;

  const canActorTalk = (actor) =>
    !!actor && typeof actor.currentClass === "function" &&
    !!actor.currentClass() && actor.currentClass().id < TALK_MUTE_CLASS_ID;

  const isUsableSkill = (skill) =>
    skill && skill.name && skill.name.trim() && !skill.name.startsWith('<--');

  //=============================================================================
  // Pointer vs. key/pad arbitration
  //
  // Rebuilding the row list under a stationary cursor makes the browser fire a
  // fresh mouseenter on whatever row happens to sit under it, and TouchInput
  // keeps reporting the last cursor position forever. Both would drag the
  // selection straight back onto the hovered row after every keyboard or
  // controller move, so hover only counts while the pointer is the input that
  // moved last.
  //=============================================================================

  let lastPointerMoveAt = 0;
  let lastKeyNavAt = 0;
  let lastPointerX = null;
  let lastPointerY = null;

  document.addEventListener('mousemove', (e) => {
    if (e.clientX === lastPointerX && e.clientY === lastPointerY) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    lastPointerMoveAt = performance.now();
  }, true);

  const noteKeyNav = () => { lastKeyNavAt = performance.now(); };
  const pointerLeadsInput = () => lastPointerMoveAt > lastKeyNavAt;

  //=============================================================================
  // Scale helper (same pattern as MPP_SmoothBattleLog2)
  //=============================================================================

  // getBoundingClientRect() forces a synchronous layout; cache the canvas rect
  // and only recompute on resize instead of every frame from the command
  // window's per-frame update.
  let _cachedCmdScale = null;
  window.addEventListener('resize', () => { _cachedCmdScale = null; });

  function _cmdGetScale() {
    if (_cachedCmdScale) return _cachedCmdScale;
    const el = document.getElementById('gameCanvas');
    if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
    const r = el.getBoundingClientRect();
    _cachedCmdScale = {
      sx: r.width  / Graphics.width,
      sy: r.height / Graphics.height,
      ox: r.left,
      oy: r.top
    };
    return _cachedCmdScale;
  }

  //=============================================================================
  // Window_ActorCommand - Command List
  //=============================================================================

  Window_ActorCommand.prototype.makeCommandList = function () {
    // Wrestling (Health_Monsters.js) takes this menu over whole while a grapple
    // is being planned: its limbs and holds REPLACE the actor's commands rather
    // than crowd in beside them, because while a hold is being chosen there is
    // nothing else the actor can do. The rows are its list; the look is ours.
    if (window.Wrestling && window.Wrestling.isMenuOpen(this)) {
      window.Wrestling.makeCommandList(this);
      return;
    }

    // Aim (Health_Monsters.js) takes it over the same way while a limb is being
    // named: the monster's body IS the list, one part per row with the odds of
    // reaching it, and nothing else the actor could do belongs beside that.
    if (window.Aiming && window.Aiming.isMenuOpen(this)) {
      window.Aiming.makeCommandList(this);
      return;
    }

    // The talk menu (EnemyTalkSystem.js) takes the list over the same way while
    // a conversation is being steered: its choices are the rows, and there is
    // nothing else to do until one of them is said.
    if (window.TalkMenu && window.TalkMenu.isMenuOpen(this)) {
      window.TalkMenu.makeCommandList(this);
      return;
    }

    // The battle skill list (CategorizedBattleSkills.js) does it too: the
    // carried skills, the basic kit and the party being pointed at are all
    // rows here rather than a panel of their own.
    if (window.BattleSkillMenu && window.BattleSkillMenu.isMenuOpen(this)) {
      window.BattleSkillMenu.makeCommandList(this);
      return;
    }

    // Target selection mode (Enemy / Ally) takes over the whole menu
    if (this._targetSession) {
      if (this._targetSession.mode === 'enemy') {
        const enemies = this._targetSession.enemies || ($gameTroop ? $gameTroop.aliveMembers() : []);
        enemies.forEach((enemy, i) => {
          const rawName = enemy.name();
          const name = (typeof translateText === 'function') ? translateText(rawName) : rawName;
          const hpText = `${Math.floor(enemy.hp)}/${Math.floor(enemy.mhp)} ${TextManager.hpA}`;
          this.addCommandWithIcon(name, "enemyRow", enemy.isAlive(), { kind: 'enemy', index: i, enemy }, 97, false, COMMAND_COLORS.enemyRow, hpText);
        });
        return;
      }
      if (this._targetSession.mode === 'ally') {
        const members = this._targetSession.members || ($gameParty ? $gameParty.battleMembers() : []);
        members.forEach((member, i) => {
          const rawName = member.name();
          const name = (typeof translateText === 'function') ? translateText(rawName) : rawName;
          const hpText = `${Math.floor(member.hp)}/${Math.floor(member.mhp)} ${TextManager.hpA}`;
          this.addCommandWithIcon(name, "allyRow", true, { kind: 'ally', index: i, member }, 73, !member.isAlive(), COMMAND_COLORS.allyRow, hpText);
        });
        return;
      }
    }

    if (!this._actor) return;

    // Map Battle Mode (MapBattleMode.js): lets the acting battler reposition
    // on the map (range driven by DEX/agi) before choosing an action. Only
    // usable once per turn; MapBattleMode itself owns the enabled/used state.
    const mbmActive = !!(window.MapBattleMode && window.MapBattleMode.isActive());
    if (mbmActive) {
      const canMove = window.MapBattleMode.canUseMoveCommand(this._actor);
      this.addCommandWithIcon("", "move", canMove, null, 82);
    }

    // Ranged weapons (those with a bullet config) swap the attack icon for the
    // equipped weapon's own icon, and replace the Defense command with Reload.
    const bulletConfig = this._actor.getWeaponBulletConfig
      ? this._actor.getWeaponBulletConfig()
      : null;
    const hasRanged = !!bulletConfig;

    let attackIcon = 97;
    let attackExt = null;
    if (hasRanged) {
      const weapon = this._actor.weapons()[0];
      if (weapon && weapon.iconIndex > 0) attackIcon = weapon.iconIndex;
      // The live projectile count rides on the Attack command itself.
      attackExt = { current: this._actor.getCurrentBullets(), max: bulletConfig.max };
    }
    // A limit break takes the guard row. Somebody who was cut down to nothing
    // during this fight (BattleSystemActiveSkills.js, window.LimitBreak) is
    // offered their class's Hyper where Defense or Reload would stand: guarding
    // is not what this round is for, and it is the one row that is gone again
    // the moment it has been used.
    const hyperReady = !!(window.LimitBreak && window.LimitBreak.isReady(this._actor));

    if (hasRanged && attackExt && attackExt.current === 0) {
      // Out of ammo: Attack becomes Bash. Reload is placed first as the primary
      // action, followed by Bash (the fallback melee strike). A Hyper takes
      // that row instead: an empty magazine is exactly the moment for it.
      if (hyperReady) this.addCommandWithIcon("", "hyper", true, null, 87);
      else this.addCommandWithIcon("", "reload", true, null, 115);
      this.addCommandWithIcon("", "attack", true, attackExt, attackIcon);
    } else {
      // Attack is ALWAYS enabled. It is the one action a battler can never be
      // left without, and every gate that used to grey it out read as a bug at
      // the counter: the attack skill's own cost (it is paid out of TP, so an
      // actor opening a fight below it could not swing), an empty magazine, or
      // Map Battle Mode's range check. None of those are legible from the button,
      // so the swing is offered and whatever refuses it does so where the reason
      // can be shown (the ammo counter on the command, the miss in the log).
      this.addCommandWithIcon("", "attack", true, attackExt, attackIcon);

      if (hasRanged) {
        // Reload doubles as Defense for ranged actors: commandReload both recharges
        // projectiles and guards. The bullet count now shows on Attack instead.
        // The vector gun running the Blade of Thelema takes that row for its own
        // SWITCH instead: folding the gun into the machete (and back) is what
        // loads it (Weapon/VectorGunSystem.js).
        if (hyperReady) {
          this.addCommandWithIcon("", "hyper", true, null, 87);
        } else if (window.VectorGun && window.VectorGun.bladeReady(this._actor)) {
          this.addCommandWithIcon("", "vectorSwitch", true, null, 118);
        } else {
          this.addCommandWithIcon("", "reload", true, null, 115);
        }
      } else if (hyperReady) {
        this.addCommandWithIcon("", "hyper", true, null, 87);
      } else {
        const defenseSkill = $dataSkills[2];
        const canDefend = defenseSkill && this._actor.canUse(defenseSkill);
        // Use the equipped off-hand item's icon (etypeId 2) when present.
        const offHand = this._actor.equips().find(e => e && e.etypeId === 2);
        const defenseIcon = (offHand && offHand.iconIndex > 0) ? offHand.iconIndex : 81;
        this.addCommandWithIcon("", "defense", canDefend, null, defenseIcon);
      }
    }

    // A single Skills command holding every skill type at once (Magic, Skills,
    // ...): the carried loadout is small enough that splitting it per type only
    // added a menu level. ext 0 is what BattleLoadout.battleSkills reads as "no
    // type filter", so the list opens on the whole loadout. A loadout holding
    // nothing the actor can pay for greys out but still OPENS: the list is where
    // the reason is legible, one greyed cost per skill, and each unaffordable
    // skill buzzes there instead. Only an empty loadout refuses to open, since
    // there would be nothing to read.
    const carried = window.BattleLoadout
      ? window.BattleLoadout.battleSkills(this._actor, 0)
      : this._actor.skills().filter(skill => skill && skill.stypeId > 0);
    const listed = carried.filter(isUsableSkill);
    this.addCommandWithIcon("", "skill", listed.length > 0, 0, 76,
      !this.hasCastableSkill(listed));

    // The Basic kit is its own top-level command: those are the engine's
    // fallback moves and are always carried, so they never crowd a loadout.
    const basicKit = this._actor.skills()
      .filter(skill => isUsableSkill(skill) && getSkillCategory(skill) === "Basic"); // i18n-ignore: <category:Basic> note tag
    this.addCommandWithIcon("", "basic", basicKit.length > 0, null, 248,
      !this.hasCastableSkill(basicKit));

    // Aim, Wrestle and Talk are commands, not skills: naming a limb, grappling
    // and talking are things a body does, so they are offered here rather than
    // hidden in a skill list. All three sit directly above the backpack, Aim
    // first, then Wrestle. Each is only shown when the plugin that owns it is
    // loaded, and greyed out when that plugin says this body cannot do it (no
    // monster standing with an anatomy to name a part of; no limb free to take
    // hold with; a class from 63 on, which has no language).
    //
    // Aim sits beside Attack rather than replacing it: Attack alone throws the
    // swing wherever it falls, and Aim names the place it has to reach. Naming
    // costs no turn, so the row is stepped through and the swing thrown in the
    // same round.
    if (window.Aiming && window.Aiming.canCommand) {
      this.addCommandWithIcon("", "aim", window.Aiming.canCommand(this._actor), null, 151);
    }
    if (window.Wrestling && window.Wrestling.canCommand) {
      this.addCommandWithIcon("", "wrestle", window.Wrestling.canCommand(this._actor), null, 106);
    }
    if (typeof Scene_Battle.prototype.openTalkMenu === "function") {
      this.addCommandWithIcon("", "talk", canActorTalk(this._actor), null, 246);
    }

    // Backpack/Item: disabled (greyed + buzzer) when the party holds no
    // battle-usable item. Mirrors Window_BattleItem.includes ($gameParty.canUse).
    const hasUsableItem = $gameParty.allItems().some(item => $gameParty.canUse(item));
    this.addCommandWithIcon("", "item",  hasUsableItem,          null, 209);

    // Throw sits under the backpack: the same bag, but the object is hurled
    // rather than used, and it hurts for its weight (window.ThrowItem). Key
    // items and materials are not offered, so the row greys out when the party
    // is carrying nothing worth throwing.
    const hasThrowable = !!window.ThrowItem && window.ThrowItem.throwableItems().length > 0;
    this.addCommandWithIcon("", "throw", hasThrowable,           null, 176);
    // Note: the standalone Guard command is intentionally omitted, it duplicates
    // the Defense command (both cast skill 2). The sole escape option is "Run" below.

    // Escape/Run row: always shown and always usable. Fleeing succeeds 100% via
    // PerfectEscape.js, so Run no longer hinges on BattleManager.canEscape() (the
    // game's main battle path sets canEscape=false). Handler set in
    // createActorCommandWindow (#110).
    this.addCommandWithIcon("", "escape", true, null, 140);

    // Map Battle Mode reads Attack first, Skills second, Move third: walking is
    // what you do around a swing, not before one, so the row that opens the
    // cursor sits under the two actions that end the turn.
    if (mbmActive) {
      const head = [];
      ["attack", "skill", "move"].forEach(symbol => {
        const i = this._list.findIndex(cmd => cmd.symbol === symbol);
        if (i >= 0) head.push(this._list.splice(i, 1)[0]);
      });
      this._list = head.concat(this._list);
    }
  };

  // Whether a skill/magic/basic list holds anything the actor can act with this
  // instant, the same question Game_Action asks when the turn resolves (MP/TP
  // payable, skill type not sealed, skill not sealed, weapon type allowed,
  // usable in battle). Nothing castable dims the row without locking it.
  Window_ActorCommand.prototype.hasCastableSkill = function (skills) {
    if (!this._actor || !skills || skills.length === 0) return false;
    return skills.some(skill => isUsableSkill(skill) && this._actor.canUse(skill));
  };

  // The command under the cursor, or true when there is nothing to read: used by
  // the handlers as a second line of defence against input routed past
  // isCurrentItemEnabled by another plugin.
  Window_ActorCommand.prototype.isCurrentCommandEnabled = function () {
    if (!this._list) return true;
    const cmd = this._list[this.index()];
    return !cmd || cmd.enabled !== false;
  };

  // `enabled` is the gate the input layer reads (a disabled row buzzes and opens
  // nothing); `dim` is the look alone, for a row that still opens but has
  // nothing usable behind it.
  // `colors` overrides the symbol's palette for this row alone; `cost` is the
  // short right-aligned tail a row can carry (a skill's MP/AP, an ally's HP).
  Window_ActorCommand.prototype.addCommandWithIcon = function (name, symbol, enabled, ext, iconIndex, dim, colors, cost) {
    this._list.push({ name, symbol, enabled, ext, iconIndex, dim: !!dim, colors: colors || null, cost: cost || "" });
  };

  Window_ActorCommand.prototype.getCommandName = function (symbol, ext) {
    switch (symbol) {
      case "move":    return T('Battle.cmd.move');
      case "attack":
        // A ranged weapon run dry doesn't grey out: it becomes Bash, a plain
        // melee strike with whatever is in hand, ammo count dropped since
        // there is none left to show.
        if (ext && typeof ext === "object" && ext.current === 0) {
          return T('Battle.cmd.bash');
        }
        return (ext && typeof ext === "object" && ext.current != null)
          ? `${TextManager.attack} (${ext.current})`
          : TextManager.attack;
      case "defense": return T('Battle.cmd.defense');
      // The Hyper wears the class's own word for it: HYPER for a Freelancer,
      // GRACE for a Gunmancer, MIRACLE for a Nun (window.LimitBreak).
      case "hyper":
        return (window.LimitBreak && window.LimitBreak.commandName(this._actor)) || "";
      case "skill":   return ext ? ($dataSystem.skillTypes[ext] || T('Battle.cmd.skill')) : T('Battle.cmd.skills');
      case "basic":   return T('Battle.cmd.basic');
      case "guard":   return TextManager.guard;
      case "item":    return TextManager.item;
      case "throw":   return T('Battle.cmd.throw');
      case "talk":    return T('Battle.cmd.talk');
      // An aim already taken is worn on the row, so what this actor has named
      // is legible without opening anything.
      case "aim": {
        const part = window.Aiming ? window.Aiming.partName(this._actor) : null;
        return part ? T('Battle.cmd.aimAt', { part: part }) : T('Battle.cmd.aim');
      }
      case "wrestle": return T('Battle.cmd.wrestle');
      case "reload":  return T('Battle.cmd.reload');
      case "vectorSwitch":
        // With the grimoire open (window.LimitBreak, Em's Hyper) the row is not
        // folding the weapon into anything any more: it is turning a page.
        if (window.LimitBreak && window.LimitBreak.isGrimoireOpen(this._actor)) {
          return T('Battle.hyper.turnPage');
        }
        // One word either way: the row says SWITCH whichever shape the gun is
        // standing in, since the weapon on screen already says which one.
        return T('VectorGun.cmd.switch');
      case "escape":  return T('Battle.cmd.run');
      default:        return "";
    }
  };

  // The text a row actually paints: the window's own name for the symbol when it
  // knows one, otherwise the name the command was pushed with (plugin rows carry
  // theirs). Both the HTML builder and the width measurement read it here, so
  // the box is measured against the very string it ends up showing.
  Window_ActorCommand.prototype.commandLabelText = function (cmd) {
    const name = this.getCommandName(cmd.symbol, cmd.ext) || cmd.name || "";
    return (typeof translateText === 'function') ? translateText(name) : name;
  };

  // Measured off a canvas of its own rather than the window's contents: the rows
  // are HTML, drawn in the UI serif at LABEL_PX, and the window's own bitmap font is
  // neither. One context is kept for the whole session.
  let _cmdMeasureCtx = null;
  function _cmdTextWidth(text) {
    if (!_cmdMeasureCtx) {
      _cmdMeasureCtx = document.createElement('canvas').getContext('2d');
      _cmdMeasureCtx.font = `bold ${LABEL_PX}px 'Bitter', serif`;
    }
    return _cmdMeasureCtx.measureText(String(text || "")).width;
  }

  Window_ActorCommand.prototype._fittingCommandWidth = function () {
    if (!this._list || this._list.length === 0) return MENU_WIDTH;
    let widest = 0;
    for (const cmd of this._list) {
      const tail = cmd.cost ? _cmdTextWidth(cmd.cost) + ROW_COST_SPACE : 0;
      widest = Math.max(widest, _cmdTextWidth(this.commandLabelText(cmd)) + tail);
    }
    const inner = ROW_ICON_SPACE + Math.ceil(widest) + ROW_TAIL_SPACE;
    // However long a row's sentence is, the menu stops short of taking over the
    // screen: past that the label is trimmed with an ellipsis (theme.css).
    const cap = Math.min(MENU_WIDTH_MAX, Graphics.boxWidth - 60);
    return Math.max(MENU_WIDTH, Math.min(cap, inner + this.padding * 2));
  };

  //=============================================================================
  // Window_ActorCommand - Layout (canvas window is invisible, just for input)
  //=============================================================================

  Window_ActorCommand.prototype.itemHeight    = function () { return ROW_HEIGHT; };
  // Visible rows / hit-test bound must track the EXACT command count. Padding to a
  // fixed minimum (e.g. max(6, n)) inflates the window height; because the window is
  // bottom-pinned and the HTML items render from its top, that padding pushes the
  // commands up and leaves a gap below them so they no longer sit at the bottom edge.
  Window_ActorCommand.prototype._visibleCommandCount = function () {
    const n = this._list ? this._list.length : 0;
    return Math.max(1, n);
  };
  Window_ActorCommand.prototype.numVisibleRows  = function () { return this._visibleCommandCount(); };
  Window_ActorCommand.prototype.maxVisibleItems = function () { return this._visibleCommandCount(); };
  Window_ActorCommand.prototype.maxCols       = function () { return 1; };
  Window_ActorCommand.prototype.itemWidth     = function () {
    return Math.floor((this.innerWidth + this.colSpacing()) / this.maxCols() - this.colSpacing());
  };

  // After the command list is (re)built, grow the window so every command sits inside
  // the hit-testable inner rect.
  const _Window_ActorCommand_refresh = Window_ActorCommand.prototype.refresh;
  Window_ActorCommand.prototype.refresh = function () {
    _Window_ActorCommand_refresh.call(this);
    const h = this.fittingHeight(this._visibleCommandCount());
    const w = this._fittingCommandWidth();
    const resized = this.height !== h || this.width !== w;
    if (this.width !== w) {
      this.width = w;
      // The rows are laid out over the inner rect, so a box that changed width
      // has to hand them their new one; and the menu keeps the screen edge it
      // was placed against instead of growing off it.
      const scene = SceneManager._scene;
      if (scene && scene._bseCommandX) this.x = scene._bseCommandX(w);
    }
    if (this.height !== h) this.height = h;
    if (resized) {
      this.createContents();
      this._rebuildCmdHtml();
    }
    // Bottom-align the menu: keep the list's bottom edge pinned so adding or
    // removing commands grows the window upward instead of pushing the lower
    // options off the bottom of the screen (or leaving a gap below).
    const scene = SceneManager._scene;
    if (scene && scene._bseCommandBottomY != null) {
      // A long list (a full skill loadout) grows upward until it would leave
      // the screen; past that it stands on the top edge rather than running
      // off it, since the rows above it could not be reached.
      const newY = Math.max(0, scene._bseCommandBottomY - this.height);
      if (this.y !== newY) this.y = newY;
    }
  };

  //=============================================================================
  // Window_ActorCommand - No canvas drawing (HTML replaces it)
  //=============================================================================

  Window_ActorCommand.prototype.drawItem    = function () {};
  Window_ActorCommand.prototype.drawAllItems = function () {
    this._rebuildCmdHtml();
  };
  Window_ActorCommand.prototype.refreshCursor = function () {
    this.setCursorRect(0, 0, 0, 0);
  };

  //=============================================================================
  // Window_ActorCommand - HTML Overlay Init
  //=============================================================================

  const _Window_ActorCommand_initialize = Window_ActorCommand.prototype.initialize;
  Window_ActorCommand.prototype.initialize = function (rect) {
    _Window_ActorCommand_initialize.call(this, rect);
    this.opacity      = 0;
    this.backOpacity  = 0;
    this.frameVisible = false;
    this.hideBackgroundDimmer();
    this._initCmdHtml();
  };

  Window_ActorCommand.prototype._initCmdHtml = function () {
    const old = document.getElementById('html-actorcmd-overlay');
    if (old) old.remove();

    const root = document.createElement('div');
    root.id = 'html-actorcmd-overlay';
    root.style.cssText =
      'position:fixed;display:none;z-index:350;pointer-events:none;' +
      'transform-origin:top left;';

    // Right click anywhere on overlay cancels / backs out
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      TouchInput.clear();
      if (this._targetSession && this._targetSession.activeWindow && this._targetSession.activeWindow.active) {
        if (typeof this._targetSession.activeWindow.processCancel === 'function') {
          this._targetSession.activeWindow.processCancel();
        }
      } else if (this.active && this.isCancelEnabled()) {
        this.processCancel();
      }
    });

    document.body.appendChild(root);
    this._cmdHtmlRoot = root;
  };

  //=============================================================================
  // Window_ActorCommand - Rebuild HTML items
  //=============================================================================

  Window_ActorCommand.prototype._rebuildCmdHtml = function () {
    if (!this._cmdHtmlRoot || !this._list) return;

    const root = this._cmdHtmlRoot;
    root.innerHTML = '';

    // The rows are laid over the window's INNER rect (see _updateCmdHtmlPos),
    // which is the rect the canvas window hit-tests commands in.
    const rowW = this.innerWidth || (this.width - this.padding * 2);

    for (let i = 0; i < this._list.length; i++) {
      const cmd       = this._list[i];
      const isSel     = (i === this.index());
      // Locked and merely-nothing-usable both read as greyed; only the first
      // refuses to open.
      const isLit     = cmd.enabled !== false && !cmd.dim;
      const { accent } = getRowColors(cmd);

      // Outer item container
      // A row handed a palette by the list that opened the menu (a skill, an
      // ally, an enemy) wears that colour as its left line whatever the theme
      // is; a plain command row has no kind of its own, so its edge is the
      // theme's own and only shows under the cursor.
      const typed     = !!cmd.colors;
      const item = document.createElement('div');
      item.className = 'actorcmd-item' + (isSel ? '' : ' unsel') +
        (typed ? ' typed' : '');
      item.style.width  = rowW + 'px';
      item.style.height = ROW_HEIGHT + 'px';
      item.style.pointerEvents = 'auto';
      item.style.cursor = 'pointer';

      // Mouse hover: update selection on the active targeting window or command window
      item.addEventListener('mouseenter', () => {
        if (!pointerLeadsInput()) return;
        if (this._targetSession && this._targetSession.activeWindow && this._targetSession.activeWindow.active) {
          if (this._targetSession.activeWindow.index() !== i) {
            this._targetSession.activeWindow.select(i);
          }
        } else if (this.active && this.index() !== i) {
          this.select(i);
        }
      });

      item.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });

      // Mouse click: select and confirm (processOk) on active targeting window or command window, or right click to cancel
      item.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.button === 2) {
          TouchInput.clear();
          if (this._targetSession && this._targetSession.activeWindow && this._targetSession.activeWindow.active) {
            if (typeof this._targetSession.activeWindow.processCancel === 'function') {
              this._targetSession.activeWindow.processCancel();
            }
          } else if (this.active && this.isCancelEnabled()) {
            this.processCancel();
          }
          return;
        }
        if (e.button !== undefined && e.button !== 0) return;
        TouchInput.clear();
        if (this._targetSession && this._targetSession.activeWindow && this._targetSession.activeWindow.active) {
          this._targetSession.activeWindow.select(i);
          this._targetSession.activeWindow.processOk();
        } else if (this.active) {
          if (this.index() !== i) this.select(i);
          this.processOk();
        }
      });

      item.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      // Dark base layer
      const darkBase = document.createElement('div');
      darkBase.className = 'actorcmd-darkbase';
      item.appendChild(darkBase);

      // Left accent stripe. The row's kind is the only colour on it: the
      // gradient wash the rows used to carry is gone, so the plate stays the
      // flat surface the theme paints (theme.css .actorcmd-darkbase).
      const stripe = document.createElement('div');
      stripe.className = 'actorcmd-stripe' + (isSel ? ' sel' : '');
      if (typed) {
        stripe.style.background = accent;
        stripe.style.color = accent; // for box-shadow currentColor
      }
      item.appendChild(stripe);

      // Bottom separator
      const sep = document.createElement('div');
      sep.className = 'actorcmd-sep';
      item.appendChild(sep);

      // Icon (fall back to a per-symbol default for commands added by other
      // plugins without an explicit iconIndex)
      const iconIdx = cmd.iconIndex || FALLBACK_ICONS[cmd.symbol] || 0;
      if (iconIdx > 0) {
        const col   = iconIdx % ICON_SHEET_COLS;
        const row   = Math.floor(iconIdx / ICON_SHEET_COLS);
        const icon  = document.createElement('div');
        icon.className = 'actorcmd-icon' + (isLit ? '' : ' dim');
        icon.style.width  = ICON_PX + 'px';
        icon.style.height = ICON_PX + 'px';
        // The whole sheet is scaled down with the cell, so the cell offsets
        // shrink by the same factor.
        icon.style.backgroundSize = `${ICON_SHEET_COLS * ICON_PX}px auto`;
        icon.style.backgroundPosition =
          `${-col * ICON_PX}px ${-row * ICON_PX}px`;
        item.appendChild(icon);
      }

      // Label (fall back to the command's own name for symbols this window
      // doesn't know about, e.g. plugin-injected commands)
      const label = document.createElement('div');
      label.className = 'actorcmd-label' + (isLit ? '' : ' dim');
      label.style.fontSize = LABEL_PX + 'px';
      label.textContent = this.commandLabelText(cmd);
      item.appendChild(label);

      // The tail: what the row costs, or what the ally it names is holding.
      // The label is the flexible half, so this always sits at the right edge.
      if (cmd.cost) {
        const cost = document.createElement('div');
        cost.className = 'actorcmd-cost' + (isLit ? '' : ' dim');
        cost.style.fontSize = Math.round(LABEL_PX * 0.9) + 'px';
        cost.textContent = cmd.cost;
        item.appendChild(cost);
      }

      root.appendChild(item);
    }
  };

  //=============================================================================
  // Window_ActorCommand - Update: position overlay each frame
  //=============================================================================

  const _Window_ActorCommand_update = Window_ActorCommand.prototype.update;
  Window_ActorCommand.prototype.update = function () {
    _Window_ActorCommand_update.apply(this, arguments);

    // Keep canvas layer invisible
    this.opacity      = 0;
    this.backOpacity  = 0;
    this.frameVisible = false;
    if (this._contentsBackSprite) this._contentsBackSprite.visible = false;

    this._updateCmdHtmlPos();
  };

  Window_ActorCommand.prototype._updateCmdHtmlPos = function () {
    if (!this._cmdHtmlRoot) return;

    const opacity = this.visible ? (this.openness / 255) : 0;
    const s       = this._cmdHtmlRoot.style;

    // Read scale AFTER the closed-window guard, so a hidden command menu does
    // no work (and, before caching, forced no reflow).
    if (opacity <= 0) {
      if (this._cmdLastDisplay !== 'none') {
        s.display = 'none';
        this._cmdLastDisplay = 'none';
      }
      return;
    }

    const sc = _cmdGetScale();

    // Once the command has been chosen the window stops taking input, so the
    // row it left behind should stop wearing the cursor border too: the plate
    // stays readable, the highlight goes.
    const live = this.active ||
      !!(this._targetSession && this._targetSession.activeWindow &&
         this._targetSession.activeWindow.active);
    if (this._cmdLastLive !== live) {
      this._cmdHtmlRoot.classList.toggle('inert', !live);
      this._cmdLastLive = live;
    }

    // Resolve global canvas position via PIXI transform chain
    let pt;
    if (typeof this.getGlobalPosition === 'function') {
      pt = this.getGlobalPosition();
    } else {
      pt = { x: this.x, y: this.y };
      let node = this.parent;
      while (node) { pt.x += node.x || 0; pt.y += node.y || 0; node = node.parent; }
    }

    // The rows are laid over the window's inner rect, not its frame: that is
    // where the canvas window puts item 0, so the HTML the player clicks and
    // the row the click resolves to are the same rectangle.
    const pad = this.padding || 0;

    // Dirty-check each property: only touch the DOM when a value actually
    // changed, instead of rewriting all five style props every frame.
    const left       = (sc.ox + (pt.x + pad) * sc.sx) + 'px';
    const top        = (sc.oy + (pt.y + pad) * sc.sy) + 'px';
    const transform  = `scale(${sc.sx}, ${sc.sy})`;
    const opacityStr = String(opacity);

    if (this._cmdLastDisplay !== 'block') { s.display = 'block'; this._cmdLastDisplay = 'block'; }
    if (this._cmdLastLeft !== left)           { s.left = left; this._cmdLastLeft = left; }
    if (this._cmdLastTop !== top)             { s.top = top; this._cmdLastTop = top; }
    if (this._cmdLastTransform !== transform) { s.transform = transform; this._cmdLastTransform = transform; }
    if (this._cmdLastOpacity !== opacityStr)  { s.opacity = opacityStr; this._cmdLastOpacity = opacityStr; }
  };

  //=============================================================================
  // Window_ActorCommand - Cleanup
  //=============================================================================

  const _Window_ActorCommand_destroy = Window_ActorCommand.prototype.destroy;
  Window_ActorCommand.prototype.destroy = function (options) {
    if (this._cmdHtmlRoot && this._cmdHtmlRoot.parentNode) {
      this._cmdHtmlRoot.parentNode.removeChild(this._cmdHtmlRoot);
    }
    this._cmdHtmlRoot = null;
    if (typeof _Window_ActorCommand_destroy === 'function') {
      _Window_ActorCommand_destroy.call(this, options);
    }
  };

  //=============================================================================
  // Window_ActorCommand - Selection triggers rebuild
  //=============================================================================

  const _Window_ActorCommand_select = Window_ActorCommand.prototype.select;
  Window_ActorCommand.prototype.select = function (index) {
    _Window_ActorCommand_select.call(this, index);
    if (this._list && this._list.length > 0) this.refresh();
  };

  //=============================================================================
  // Scene_Battle - Window rect & positioning
  //=============================================================================

  // Default right-edge placement. Nudge the menu so it sits clear of the weapon
  // sprite while keeping the (sometimes wide) labels fully on-screen.
  Scene_Battle.prototype._bseCommandRightX = function (cmdWidth) {
    const rightEdge = Graphics.boxWidth + Math.floor((Graphics.width - Graphics.boxWidth) / 2);
    const xOffset   = -30;
    return rightEdge - cmdWidth + xOffset;
  };

  // In split-screen, place the command menu on the active player's side:
  // Player 1 on the left, Player 2 on the right (the regular position).
  Scene_Battle.prototype._bseCommandX = function (cmdWidth) {
    const rightX = this._bseCommandRightX(cmdWidth);
    const split  = window.$gameSplitScreen && window.$gameSplitScreen.active;
    const actor  = BattleManager.actor();
    const onLeft = split && actor && actor.multiplayerPlayerId && actor.multiplayerPlayerId() === 1;
    if (!onLeft) return rightX;
    // Pin Player 1's menu near the left edge, mirroring the right margin.
    const xOffset = -30;
    return -xOffset;
  };

  // The bottom line the command list stands on. It is the bottom edge of the
  // skill hotbar's row of slots (BattleSystemEnhancedHUD.js), so the commands
  // and the quick bar sit on one line; the hotbar measures in canvas pixels
  // while a window's y is relative to the window layer, hence the box offset.
  Scene_Battle.prototype._bseCommandBaseY = function () {
    const margin = 12;
    const hotbar = window.BattleHotbar;
    if (hotbar && typeof hotbar.slotBottomY === 'function') {
      const boxOffsetY = Math.floor((Graphics.height - Graphics.boxHeight) / 2);
      return hotbar.slotBottomY() - boxOffsetY;
    }
    return Graphics.boxHeight - margin;
  };

  Scene_Battle.prototype.actorCommandWindowRect = function () {
    const cmdWidth = MENU_WIDTH;
    // Pin the command menu to the bottom edge of the screen. refresh() bottom-aligns
    // the window to _bseCommandBottomY, so the last command always sits just above the
    // bottom margin and the list grows upward as more commands are exposed.
    this._bseCommandBottomY = this._bseCommandBaseY();
    const height = this.windowAreaHeight();
    const y = this._bseCommandBottomY - height;
    return new Rectangle(this._bseCommandX(cmdWidth), y, cmdWidth, height);
  };

  // Re-place the command window each time an actor starts inputting so it
  // follows whichever player is active during a split-screen battle. Also
  // checks for a continuing grapple: if the actor's previous turn was a
  // wrestle and the enemy is still held (state 51 / 52), the wrestling menu
  // reopens automatically so the player can pick the next hold without
  // re-selecting the Wrestle command and the target.
  const _BSEC_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
  Scene_Battle.prototype.startActorCommandSelection = function () {
    const cmdWin = this._actorCommandWindow;
    if (cmdWin) cmdWin._targetSession = null;
    this._battleSkillReturn = null;
    _BSEC_startActorCommandSelection.call(this);

    // Auto-continue wrestling: if the actor has an ongoing grapple target
    // that is still alive and held, reopen the wrestle menu in place of the
    // normal command list. Only the same party member who initiated the grapple
    // gets the auto-open; other actors see their normal commands.
    const actor = BattleManager.actor();
    if (this._wrestleContinueTargetIndex != null && window.Wrestling &&
        BattleManager.isInputting() && actor &&
        actor.actorId() === this._wrestleContinueActorId) {
      const target = $gameTroop.members()[this._wrestleContinueTargetIndex];
      if (target && target.isAlive() &&
          (target.isStateAffected(51) || target.isStateAffected(52)) &&
          window.Wrestling.canCommand(actor)) {
        const action = BattleManager.inputtingAction();
        if (action) {
          // Use the Wrestle carrier skill (id 21, retired from every learnset)
          // and target the held enemy directly, then open the plan menu.
          action.setSkill(21);
          action.setTarget(target.index());
          if (this.openWrestleMenu(target)) {
            if (this._actorCommandWindow) {
              this._actorCommandWindow.x = this._bseCommandX(this._actorCommandWindow.width);
            }
            return;
          }
        }
      } else {
        // The target is no longer held or alive - clear the stale reference
        // so the next turn doesn't retry.
        this._wrestleContinueTargetIndex = null;
      }
    }

    if (this._actorCommandWindow) {
      this._actorCommandWindow.x = this._bseCommandX(this._actorCommandWindow.width);
    }
  };

  //=============================================================================
  // Scene_Battle - Handlers
  //=============================================================================

  Scene_Battle.prototype.createCancelButton = function () {};

  const _Scene_Battle_createActorCommandWindow = Scene_Battle.prototype.createActorCommandWindow;
  Scene_Battle.prototype.createActorCommandWindow = function () {
    _Scene_Battle_createActorCommandWindow.call(this);
    this._actorCommandWindow.setHandler("reload",  this.commandReload.bind(this));
    this._actorCommandWindow.setHandler("vectorSwitch", this.commandVectorSwitch.bind(this));
    this._actorCommandWindow.setHandler("defense", this.commandDefense.bind(this));
    this._actorCommandWindow.setHandler("hyper",   this.commandHyper.bind(this));
    this._actorCommandWindow.setHandler("basic",   this.commandBasic.bind(this));
    this._actorCommandWindow.setHandler("escape",  this.commandEscape.bind(this));
    this._actorCommandWindow.setHandler("talk",    this.commandTalk.bind(this));
    this._actorCommandWindow.setHandler("aim",     this.commandAim.bind(this));
    this._actorCommandWindow.setHandler("wrestle", this.commandWrestle.bind(this));
    this._actorCommandWindow.setHandler("throw",   this.commandThrow.bind(this));
  };

  // Guard: refuse to open a skill/magic/basic menu when its command is disabled
  // (i.e. the actor has no skills for it). Even though disabled commands normally
  // buzz at the input layer, this makes "don't open an empty menu" explicit and
  // robust against other plugins that might route past isCurrentItemEnabled.
  Scene_Battle.prototype._bseCurrentCommandEnabled = function () {
    const win = this._actorCommandWindow;
    if (!win) return true;
    return win.isCurrentCommandEnabled();
  };

  // Skills and the Basic kit are lists of rows in this very menu, not a panel
  // beside it (CategorizedBattleSkills.js owns what goes in them): a skill is
  // chosen exactly where Attack and Run are, with its cost on the row and the
  // row greyed out when the actor cannot pay it.
  Scene_Battle.prototype._bseOpenSkillMenu = function (mode, stypeId) {
    const win = this._actorCommandWindow;
    if (!this._bseCurrentCommandEnabled() || !window.BattleSkillMenu ||
        !window.BattleSkillMenu.open(win, this, mode, stypeId, win.currentSymbol())) {
      SoundManager.playBuzzer();
      win.activate();
    }
  };

  // -------------------------------------------------------------------------
  // Attack: targets a random enemy instead of opening the target picker.
  // The base BattleManager.selectNextCommand also randomises for isAttack(),
  // so the result is the same - a random alive enemy - without the player
  // having to pick one manually.
  // -------------------------------------------------------------------------
  Scene_Battle.prototype.commandAttack = function () {
    const action = BattleManager.inputtingAction();
    if (!action) { SoundManager.playBuzzer(); return; }
    action.setAttack();
    // An aimed swing is not thrown at a random monster: it goes to the body the
    // limb was named on (Health_Monsters.js, the Aim section, which also puts
    // the target back after BattleManager has randomised it).
    const plan = window.Aiming ? window.Aiming.planFor(BattleManager.actor()) : null;
    if (plan) action.setTarget(plan.enemyIndex);
    this.selectNextCommand();
  };

  // Aim: hand over to Health_Monsters, which picks the monster with the ordinary
  // target window and then draws its body in this same menu. Naming a limb ends
  // no turn, so this comes straight back to the command list.
  Scene_Battle.prototype.commandAim = function () {
    if (!this._bseCurrentCommandEnabled() || !window.Aiming ||
        !window.Aiming.startFromCommand(this)) {
      SoundManager.playBuzzer();
      this._actorCommandWindow.activate();
    }
  };

  Scene_Battle.prototype.commandBasic = function () {
    this._bseOpenSkillMenu("basic", 0);
  };

  Scene_Battle.prototype.commandSkill = function () {
    this._bseOpenSkillMenu("skill", this._actorCommandWindow.currentExt() || 0);
  };

  // Talk: hand over to EnemyTalkSystem's menu, which picks the monster being
  // addressed with the ordinary target window when more than one is standing.
  Scene_Battle.prototype.commandTalk = function () {
    if (!this._bseCurrentCommandEnabled() || typeof this.openTalkMenu !== "function") {
      SoundManager.playBuzzer();
      this._actorCommandWindow.activate();
      return;
    }
    this.openTalkMenu();
  };

  // Wrestle: hand over to Health_Monsters, which picks the monster with the
  // ordinary target window and then draws its grapple plan in this same menu.
  Scene_Battle.prototype.commandWrestle = function () {
    if (!this._bseCurrentCommandEnabled() || !window.Wrestling ||
        !window.Wrestling.startFromCommand(this)) {
      SoundManager.playBuzzer();
      this._actorCommandWindow.activate();
    }
  };

  Scene_Battle.prototype.commandDefense = function () {
    BattleManager.inputtingAction().setSkill(2);
    this.selectNextCommand();
  };

  // The Hyper is booked here and performed at the head of the actor's turn
  // (window.LimitBreak.unleash, called from BattleManager.startAction): the
  // guard the row also sets is the placeholder that keeps the turn legal, so
  // the round still resolves normally around one enormous act.
  Scene_Battle.prototype.commandHyper = function () {
    const actor = BattleManager.actor();
    if (!actor || !window.LimitBreak || !window.LimitBreak.choose(actor)) {
      SoundManager.playBuzzer();
      this._actorCommandWindow.activate();
      return;
    }
    const action = BattleManager.inputtingAction();
    if (action) {
      const defenseSkill = $dataSkills[2];
      if (defenseSkill && actor.canUse(defenseSkill)) action.setSkill(2);
      else action.setGuard();
    }
    this.selectNextCommand();
  };

  Scene_Battle.prototype.commandReload = function () {
    const actor = BattleManager.actor();
    if (actor) {
      actor.reloadBullets();
      // Reloading also raises the actor's guard via the Defense skill (id 2).
      const defenseSkill = $dataSkills[2];
      if (defenseSkill && actor.canUse(defenseSkill)) {
        BattleManager.inputtingAction().setSkill(2);
      } else {
        BattleManager.inputtingAction().setGuard();
      }
      this.selectNextCommand();
    }
  };

  // The vector gun folds into whatever shape is fitted and back, and it does
  // it as a machine: the weapon in the hand comes apart, the model is rebuilt
  // at the pivot, and the new shape slams together (VectorGun.playSwitchFx,
  // WeaponSystemProcedural.startVectorSwitch). The turn is passed only once the
  // whole reconstruction has been seen - handing it over any earlier swaps the
  // model to whoever is next in the same frame, and nothing is watched at all.
  const MS_PER_FRAME = 1000 / 60;
  const framesFor = (ms) => Math.max(1, Math.ceil(ms / MS_PER_FRAME));

  Scene_Battle.prototype.commandVectorSwitch = function () {
    const actor = BattleManager.actor();
    // While the book is open the frame has nowhere to fold to: the row reads on
    // instead (turnGrimoirePage), and nothing below this runs.
    if (this.turnGrimoirePage(actor)) return;
    if (!actor || !window.VectorGun) return;
    if (this._actorCommandWindow) this._actorCommandWindow.deactivate();
    this._vectorSwitchActorId = actor.actorId();
    // Half one: the weapon it is holding now flies apart. The gun is still the
    // old shape, which is the whole point of playing this before the swap.
    const fold = window.VectorGun.playSwitchFx('fold');
    this._vectorSwitchStage = 'fold';
    this._vectorSwitchWait = framesFor(fold || 200);
  };

  /** Half two: the frame is rebuilt as the fitted shape and slams together. */
  Scene_Battle.prototype.riseVectorSwitch = function () {
    const actor = BattleManager.actor();
    window.VectorGun.switchForm(actor);
    // The model in the hand is rebuilt at the pivot of the animation, so the
    // cloud of hardware that comes back together is the NEW weapon.
    const spriteset = this._spriteset;
    if (spriteset && spriteset.updateWeaponSprite) spriteset.updateWeaponSprite();
    const rise = window.VectorGun.playSwitchFx('rise');
    this._vectorSwitchStage = 'rise';
    this._vectorSwitchWait = framesFor(rise || 300);
  };

  /** Passes the turn once the reconstruction has finished. */
  Scene_Battle.prototype.finishVectorSwitch = function () {
    this._vectorSwitchWait = 0;
    this._vectorSwitchStage = null;
    const actorId = this._vectorSwitchActorId;
    this._vectorSwitchActorId = null;
    const actor = BattleManager.actor();
    // The turn may have been taken away from under the animation (a forced
    // action, the actor going down); only the battler that asked for the switch
    // gets its command spent on it.
    if (!actor || actor.actorId() !== actorId) return;
    const action = BattleManager.inputtingAction();
    if (!action) return;
    const defenseSkill = $dataSkills[2];
    if (defenseSkill && actor.canUse(defenseSkill)) {
      action.setSkill(2);
    } else {
      action.setGuard();
    }
    this.selectNextCommand();
  };

  /**
   * The grimoire's own use of the SWITCH row (window.LimitBreak, Em's Hyper).
   * There is no weapon to fold while the book is open, so the row turns a page
   * instead: she pays for it out of her own health and is dealt another row of
   * spells out of the same book. Unlike the fold, nothing is animated, so the
   * turn is passed in the same frame.
   * @param {?Game_Actor} actor - Whoever is inputting
   * @returns {boolean} true when the row was spent on a page
   */
  Scene_Battle.prototype.turnGrimoirePage = function (actor) {
    if (!actor || !window.LimitBreak || !window.LimitBreak.isGrimoireOpen(actor)) return false;
    if (!window.LimitBreak.rerollGrimoire(actor)) {
      // Nothing left to pay with: the row buzzes and the menu stays open.
      SoundManager.playBuzzer();
      this._actorCommandWindow.activate();
      return true;
    }
    const action = BattleManager.inputtingAction();
    if (action) {
      const defenseSkill = $dataSkills[2];
      if (defenseSkill && actor.canUse(defenseSkill)) action.setSkill(2);
      else action.setGuard();
    }
    this.selectNextCommand();
    return true;
  };

  const _BSEC_Scene_Battle_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function () {
    _BSEC_Scene_Battle_update.call(this);
    if (this._vectorSwitchWait > 0) {
      this._vectorSwitchWait--;
      if (this._vectorSwitchWait <= 0) {
        if (this._vectorSwitchStage === 'fold') this.riseVectorSwitch();
        else this.finishVectorSwitch();
      }
    }
  };

  // Nothing else may be pressed while the weapon is in pieces.
  const _BSEC_Scene_Battle_isAnyInputWindowActive =
    Scene_Battle.prototype.isAnyInputWindowActive;
  Scene_Battle.prototype.isAnyInputWindowActive = function () {
    if (this._vectorSwitchWait > 0) return true;
    return _BSEC_Scene_Battle_isAnyInputWindowActive.call(this);
  };

  // -------------------------------------------------------------------------
  // Wrestling auto-continue
  // -------------------------------------------------------------------------
  // Track which enemy the wrestle menu was opened on, so the next time this
  // actor's turn comes around the grapple menu can be reopened automatically
  // if the enemy is still held (state 51 / 52). The reference is cleared
  // naturally when the target dies, the hold state expires (checked in
  // startActorCommandSelection), or when a fresh openWrestleMenu call
  // overwrites it for a different target.
  const _SB_openWrestleMenu = Scene_Battle.prototype.openWrestleMenu;
  Scene_Battle.prototype.openWrestleMenu = function (enemy) {
    const result = _SB_openWrestleMenu.call(this, enemy);
    if (result && enemy) {
      const actor = BattleManager.actor();
      this._wrestleContinueTargetIndex = enemy.isEnemy ? enemy.index() : null;
      this._wrestleContinueActorId = actor ? actor.actorId() : null;
    }
    return result;
  };

  Scene_Battle.prototype.selectPreviousCommand = function () {
    if (BattleManager.selectPreviousCommand()) {
      this.startActorCommandSelection();
    } else {
      SoundManager.playBuzzer();
    }
  };

  Scene_Battle.prototype.changeInputWindow = function () {
    this.hideSubInputWindows();
    if (BattleManager.isInputting()) {
      if (BattleManager.actor()) {
        this.startActorCommandSelection();
      }
    } else {
      this.endCommandSelection();
    }
  };

  // Keep the command list (and, via BattleHotbar's own actor check, the
  // hotbar) standing while the actor's just-picked action plays out, instead
  // of popping out the instant input ends and back in for whoever's turn
  // comes next. Runs the earlier chain (wrestle/talk menu cleanup from
  // Health_Monsters.js / EnemyTalkSystem.js) first, then only deactivates
  // the command windows instead of closing them: left open and visible, the
  // same visible-but-frozen footprint Attack's enemy-target picker already
  // relies on (section 15b/7 in BattleSystemEnhancedHUD.js).
  const _SB_endCommandSelection_BSEC = Scene_Battle.prototype.endCommandSelection;
  Scene_Battle.prototype.endCommandSelection = function () {
    _SB_endCommandSelection_BSEC.call(this);
    this._partyCommandWindow.open();
    this._actorCommandWindow.open();
  };

  const _Window_ActorCommand_processOk = Window_ActorCommand.prototype.processOk;
  Window_ActorCommand.prototype.processOk = function () {
    _Window_ActorCommand_processOk.call(this);
    TouchInput.clear();
  };

  const _Window_ActorCommand_processCancel = Window_ActorCommand.prototype.processCancel;
  Window_ActorCommand.prototype.processCancel = function () {
    _Window_ActorCommand_processCancel.call(this);
    TouchInput.clear();
  };

  Window_ActorCommand.prototype.isCancelTriggered = function () {
    return (
      Input.isRepeated("cancel") ||
      Input.isTriggered("cancel") ||
      Input.isTriggered("escape") ||
      TouchInput.isCancelled()
    );
  };

  Window_ActorCommand.prototype.processTouch = function () {
    if (this.isOpenAndActive()) {
      if (TouchInput.isCancelled()) {
        if (this.isCancelEnabled()) {
          this.processCancel();
        }
      }
    }
  };

  Scene_Battle.prototype.commandCancel = function () {
    this.selectPreviousCommand();
  };

  //=============================================================================
  // WASD, Arrow & Controller Navigation for Target & Command Windows
  //=============================================================================

  // Ensure WASD keys are mapped to directional inputs
  if (typeof Input !== "undefined" && Input.keyMapper) {
    Input.keyMapper[87] = "up";     // W
    Input.keyMapper[83] = "down";   // S
    Input.keyMapper[65] = "left";   // A
    Input.keyMapper[68] = "right";  // D
  }

  // Window_ActorCommand: smooth directional navigation with WASD, arrows, controller
  const _Window_ActorCommand_processCursorMove = Window_ActorCommand.prototype.processCursorMove;
  Window_ActorCommand.prototype.processCursorMove = function () {
    if (this.isCursorMovable()) {
      const max = this.maxItems();
      if (max > 0) {
        const lastIndex = this.index();
        if (Input.isRepeated("up") || Input.isRepeated("left")) {
          this.cursorUp(Input.isTriggered("up") || Input.isTriggered("left"));
        } else if (Input.isRepeated("down") || Input.isRepeated("right")) {
          this.cursorDown(Input.isTriggered("down") || Input.isTriggered("right"));
        }
        if (this.index() !== lastIndex) {
          noteKeyNav();
          this.playCursorSound();
        }
        return;
      }
    }
    _Window_ActorCommand_processCursorMove.call(this);
  };

  // Window_BattleEnemy: keyboard (WASD / arrows), mouse hover & controller navigation
  Window_BattleEnemy.prototype.processCursorMove = function () {
    if (this.isCursorMovable()) {
      const max = this.maxItems();
      if (max > 0) {
        const lastIndex = this.index();
        if (Input.isRepeated("up") || Input.isRepeated("left")) {
          this.select((this.index() - 1 + max) % max);
        } else if (Input.isRepeated("down") || Input.isRepeated("right")) {
          this.select((this.index() + 1) % max);
        }
        if (this.index() !== lastIndex) {
          noteKeyNav();
          this.playCursorSound();
        }
      }
    }
  };

  Window_BattleEnemy.prototype.hitTestEnemyAt = function (mx, my) {
    if (mx == null || my == null) return -1;
    const enemies = this._enemies || ($gameTroop ? $gameTroop.aliveMembers() : []);
    if (!enemies || enemies.length === 0) return -1;

    const scene = SceneManager._scene;
    const spriteset = scene && scene._spriteset;
    const scene3d = spriteset ? spriteset._battle3DScene : null;

    // 1. Raycast against 3D Models if 3D scene is present
    if (
      scene3d &&
      scene3d.camera &&
      typeof THREE !== "undefined" &&
      typeof spriteset.get3DModel === "function" &&
      (typeof scene3d.hasModels !== "function" || scene3d.hasModels())
    ) {
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(
        (mx / Graphics.width) * 2 - 1,
        -(my / Graphics.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, scene3d.camera);

      let closestDist = Infinity;
      let closestIndex = -1;

      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy || (enemy.isAlive && !enemy.isAlive())) continue;
        const model = spriteset.get3DModel(enemy);
        const root = model && model.model;
        if (root && root.visible) {
          const hits = raycaster.intersectObject(root, true);
          if (hits.length > 0 && hits[0].distance < closestDist) {
            closestDist = hits[0].distance;
            closestIndex = i;
          }
        }
      }

      if (closestIndex >= 0) return closestIndex;
    }

    // 2. Projected 3D & 2D Screen Bounding Boxes
    let bestDist = Infinity;
    let bestIndex = -1;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy || (enemy.isAlive && !enemy.isAlive())) continue;

      let rect = null;

      // 3D model box projection
      if (
        scene3d &&
        scene3d.camera &&
        typeof THREE !== "undefined" &&
        typeof spriteset.get3DModel === "function" &&
        (typeof scene3d.hasModels !== "function" || scene3d.hasModels())
      ) {
        const model = spriteset.get3DModel(enemy);
        const root = model && model.model;
        if (root && root.visible) {
          const box = new THREE.Box3().setFromObject(root);
          if (!box.isEmpty()) {
            const cam = scene3d.camera;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            const corners = [
              new THREE.Vector3(box.min.x, box.min.y, box.min.z),
              new THREE.Vector3(box.min.x, box.min.y, box.max.z),
              new THREE.Vector3(box.min.x, box.max.y, box.min.z),
              new THREE.Vector3(box.min.x, box.max.y, box.max.z),
              new THREE.Vector3(box.max.x, box.min.y, box.min.z),
              new THREE.Vector3(box.max.x, box.min.y, box.max.z),
              new THREE.Vector3(box.max.x, box.max.y, box.min.z),
              new THREE.Vector3(box.max.x, box.max.y, box.max.z),
            ];
            for (const c of corners) {
              c.project(cam);
              const px = (c.x * 0.5 + 0.5) * Graphics.width;
              const py = (-c.y * 0.5 + 0.5) * Graphics.height;
              if (px < minX) minX = px;
              if (px > maxX) maxX = px;
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            }
            rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
          }
        }
      }

      // 2D sprite box fallback
      if (!rect && spriteset) {
        const sprites = spriteset._enemySprites || [];
        const sprite = sprites.find(s => s && s._battler === enemy);
        if (sprite && sprite.visible !== false) {
          const field = spriteset._battleField;
          const fx = field ? field.x : 0;
          const fy = field ? field.y : 0;
          const w = sprite.width || (sprite.bitmap ? sprite.bitmap.width : 120);
          const h = sprite.height || (sprite.bitmap ? sprite.bitmap.height : 120);
          const x = sprite.x + fx - (sprite.anchor ? sprite.anchor.x * w : w / 2);
          const y = sprite.y + fy - (sprite.anchor ? sprite.anchor.y * h : h);
          rect = { x, y, width: w, height: h };
        }
      }

      if (rect) {
        const pad = 20;
        if (
          mx >= rect.x - pad &&
          mx <= rect.x + rect.width + pad &&
          my >= rect.y - pad &&
          my <= rect.y + rect.height + pad
        ) {
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;
          const dist = Math.hypot(mx - centerX, my - centerY);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
          }
        }
      }

      // 3. Enemy HUD MiniBar in the top-right
      if (scene && scene._minimalEnemyBars) {
        const bar = scene._minimalEnemyBars.find(b => b && b._battler === enemy);
        if (bar && bar.visible) {
          const bw = bar.bitmap ? bar.bitmap.width : 220;
          const bh = bar.bitmap ? bar.bitmap.height : 78;
          if (mx >= bar.x && mx <= bar.x + bw && my >= bar.y && my <= bar.y + bh) {
            return i;
          }
        }
      }
    }

    return bestIndex;
  };

  Window_BattleEnemy.prototype.processTouch = function () {
    if (this.isOpenAndActive()) {
      if (TouchInput.isCancelled()) {
        if (this.isCancelEnabled()) {
          this.processCancel();
        }
        return;
      }
      const hitIndex = this.hitTestEnemyAt(TouchInput.x, TouchInput.y);
      if (hitIndex >= 0) {
        if (this.index() !== hitIndex && (pointerLeadsInput() || TouchInput.isTriggered())) {
          this.select(hitIndex);
        }
        if (TouchInput.isTriggered()) {
          TouchInput.clear();
          this.processOk();
          return;
        }
      }
    }
  };

  const _Window_BattleEnemy_select = Window_BattleEnemy.prototype.select;
  Window_BattleEnemy.prototype.select = function (index) {
    _Window_BattleEnemy_select.call(this, index);
    const scene = SceneManager._scene;
    const cmdWin = scene && scene._actorCommandWindow;
    if (cmdWin && cmdWin._targetSession && cmdWin._targetSession.mode === 'enemy') {
      if (cmdWin.index() !== index && index >= 0) {
        cmdWin.select(index);
      }
    }
  };

  // Window_BattleActor: keyboard (WASD / arrows), mouse hover & controller navigation
  Window_BattleActor.prototype.processCursorMove = function () {
    if (this.isCursorMovable()) {
      const max = this.maxItems();
      if (max > 0) {
        const lastIndex = this.index();
        if (Input.isRepeated("up") || Input.isRepeated("left")) {
          this.select((this.index() - 1 + max) % max);
        } else if (Input.isRepeated("down") || Input.isRepeated("right")) {
          this.select((this.index() + 1) % max);
        }
        if (this.index() !== lastIndex) {
          noteKeyNav();
          this.playCursorSound();
        }
      }
    }
  };

  Window_BattleActor.prototype.hitTestActorAt = function (mx, my) {
    if (mx == null || my == null) return -1;
    const members = $gameParty ? $gameParty.battleMembers() : [];
    if (!members || members.length === 0) return -1;

    const scene = SceneManager._scene;
    const spriteset = scene && scene._spriteset;
    const scene3d = spriteset ? spriteset._battle3DScene : null;

    if (
      scene3d &&
      scene3d.camera &&
      typeof THREE !== "undefined" &&
      typeof spriteset.get3DModel === "function" &&
      (typeof scene3d.hasModels !== "function" || scene3d.hasModels())
    ) {
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(
        (mx / Graphics.width) * 2 - 1,
        -(my / Graphics.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, scene3d.camera);

      let closestDist = Infinity;
      let closestIndex = -1;

      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        if (!member) continue;
        const model = spriteset.get3DModel(member);
        const root = model && model.model;
        if (root && root.visible) {
          const hits = raycaster.intersectObject(root, true);
          if (hits.length > 0 && hits[0].distance < closestDist) {
            closestDist = hits[0].distance;
            closestIndex = i;
          }
        }
      }

      if (closestIndex >= 0) return closestIndex;
    }

    return -1;
  };

  Window_BattleActor.prototype.processTouch = function () {
    if (this.isOpenAndActive()) {
      if (TouchInput.isCancelled()) {
        if (this.isCancelEnabled()) {
          this.processCancel();
        }
        return;
      }
      const hitIndex = this.hitTestActorAt(TouchInput.x, TouchInput.y);
      if (hitIndex >= 0) {
        if (this.index() !== hitIndex && (pointerLeadsInput() || TouchInput.isTriggered())) {
          this.select(hitIndex);
        }
        if (TouchInput.isTriggered()) {
          TouchInput.clear();
          this.processOk();
          return;
        }
      }
    }
  };

  const _Window_BattleActor_select = Window_BattleActor.prototype.select;
  Window_BattleActor.prototype.select = function (index) {
    _Window_BattleActor_select.call(this, index);
    const scene = SceneManager._scene;
    const cmdWin = scene && scene._actorCommandWindow;
    if (cmdWin && cmdWin._targetSession && cmdWin._targetSession.mode === 'ally') {
      if (cmdWin.index() !== index && index >= 0) {
        cmdWin.select(index);
      }
    }
  };

  //=============================================================================
  // Scene_Battle - Target Selection in Command Menu (Enemy & Ally Selector)
  //=============================================================================

  const _Scene_Battle_startEnemySelection_BSEC = Scene_Battle.prototype.startEnemySelection;
  Scene_Battle.prototype.startEnemySelection = function () {
    const cmdWin = this._actorCommandWindow;
    if (this._enemyWindow) {
      this._enemyWindow.refresh();
      const enemies = this._enemyWindow._enemies || ($gameTroop ? $gameTroop.aliveMembers() : []);
      if (cmdWin) {
        cmdWin._targetSession = { mode: 'enemy', enemies: enemies, activeWindow: this._enemyWindow };
        cmdWin.show();
        cmdWin.refresh();
        cmdWin.select(0);
        cmdWin.deactivate();
      }
    }
    _Scene_Battle_startEnemySelection_BSEC.call(this);
  };

  const _Scene_Battle_startActorSelection_BSEC = Scene_Battle.prototype.startActorSelection;
  Scene_Battle.prototype.startActorSelection = function () {
    const cmdWin = this._actorCommandWindow;
    if (this._actorWindow) {
      this._actorWindow.refresh();
      const members = $gameParty ? $gameParty.battleMembers() : [];
      if (cmdWin) {
        cmdWin._targetSession = { mode: 'ally', members: members, activeWindow: this._actorWindow };
        cmdWin.show();
        cmdWin.refresh();
        cmdWin.select(0);
        cmdWin.deactivate();
      }
    }
    _Scene_Battle_startActorSelection_BSEC.call(this);
  };

  const _Scene_Battle_onEnemyOk_BSEC = Scene_Battle.prototype.onEnemyOk;
  Scene_Battle.prototype.onEnemyOk = function () {
    const cmdWin = this._actorCommandWindow;
    if (cmdWin) cmdWin._targetSession = null;
    this._battleSkillReturn = null;
    _Scene_Battle_onEnemyOk_BSEC.call(this);
  };

  const _Scene_Battle_onActorOk_BSEC = Scene_Battle.prototype.onActorOk;
  Scene_Battle.prototype.onActorOk = function () {
    const cmdWin = this._actorCommandWindow;
    if (cmdWin) cmdWin._targetSession = null;
    this._battleSkillReturn = null;
    _Scene_Battle_onActorOk_BSEC.call(this);
  };

  const _Scene_Battle_onEnemyCancel_BSEC = Scene_Battle.prototype.onEnemyCancel;
  Scene_Battle.prototype.onEnemyCancel = function () {
    const cmdWin = this._actorCommandWindow;
    if (cmdWin) cmdWin._targetSession = null;
    if (this._enemyWindow) this._enemyWindow.hide();
    if (this._battleSkillReturn) {
      if (typeof this.reopenBattleSkillMenu === 'function' && this.reopenBattleSkillMenu()) {
        return;
      }
    }
    _Scene_Battle_onEnemyCancel_BSEC.call(this);
    if (cmdWin) {
      cmdWin.show();
      cmdWin.refresh();
      cmdWin.activate();
    }
  };

  const _Scene_Battle_onActorCancel_BSEC = Scene_Battle.prototype.onActorCancel;
  Scene_Battle.prototype.onActorCancel = function () {
    const cmdWin = this._actorCommandWindow;
    if (cmdWin) cmdWin._targetSession = null;
    if (this._actorWindow) this._actorWindow.hide();
    if (this._battleSkillReturn) {
      if (typeof this.reopenBattleSkillMenu === 'function' && this.reopenBattleSkillMenu()) {
        return;
      }
    }
    _Scene_Battle_onActorCancel_BSEC.call(this);
    if (cmdWin) {
      cmdWin.show();
      cmdWin.refresh();
      cmdWin.activate();
    }
  };

  // Suppress legacy HUD enemy overlay so only the crispy unified command menu is shown
  Scene_Battle.prototype.updateEnemyTargetButtons = function () {
    const root = document.getElementById('html-enemytarget-overlay');
    if (root) root.style.display = 'none';
  };

  //=============================================================================
  // Compatibility stubs
  //=============================================================================

  Window_ActorCommand.prototype.addSkillCommand  = function (stypeId) { this.addCommand("", "skill", true, stypeId, 76); };
  Window_ActorCommand.prototype.addItemCommand   = function ()         { this.addCommand("", "item",  true, 176); };
  Window_ActorCommand.prototype.addGuardCommand  = function ()         { this.addCommand("", "guard", this._actor.canGuard(), 52); };

  //=============================================================================
  // Window_PartyCommand - never shown with the default RPG Maker skin
  //
  // Fight/Escape are already covered by the HTML actor command list ("Base"
  // and "Fuggi"), so whenever this window still gets created and opened by
  // the base engine it must stay invisible instead of flashing the old
  // attack/escape selector over the HTML overlay.
  //=============================================================================

  const _Window_PartyCommand_initialize = Window_PartyCommand.prototype.initialize;
  Window_PartyCommand.prototype.initialize = function (rect) {
    _Window_PartyCommand_initialize.call(this, rect);
    this.opacity      = 0;
    this.backOpacity  = 0;
    this.frameVisible = false;
    this.hideBackgroundDimmer();
  };

  Window_PartyCommand.prototype.drawItem     = function () {};
  Window_PartyCommand.prototype.drawAllItems = function () {};
  Window_PartyCommand.prototype.refreshCursor = function () {
    this.setCursorRect(0, 0, 0, 0);
  };


  //=============================================================================
  // Throw: an object out of the backpack, at an enemy
  //
  // The row under Item. What is thrown is not used, it is hurled: the damage
  // is its weight (window.ThrowItem, BattleSystem/ThrowItemPlugin.js), the
  // object leaves the bag for good, and its 3D model is the thing seen flying
  // across the screen. Key items and materials are never offered.
  //=============================================================================

  function Window_BattleThrow() {
    this.initialize(...arguments);
  }

  Window_BattleThrow.prototype = Object.create(Window_BattleItem.prototype);
  Window_BattleThrow.prototype.constructor = Window_BattleThrow;

  // Unlike the item list, usability in battle is beside the point: a rock is
  // not "usable" and is exactly the sort of thing worth throwing.
  Window_BattleThrow.prototype.includes = function (item) {
    return !!window.ThrowItem && window.ThrowItem.isThrowable(item);
  };

  Window_BattleThrow.prototype.isEnabled = function (item) {
    return !!item && $gameParty.numItems(item) > 0;
  };

  Window_BattleThrow.prototype.needsNumber = function () {
    return true;
  };

  Scene_Battle.prototype.createThrowWindow = function () {
    if (this._throwWindow) return this._throwWindow;
    this._throwWindow = new Window_BattleThrow(this.itemWindowRect());
    this._throwWindow.setHelpWindow(this._helpWindow);
    this._throwWindow.setHandler("ok", this.onThrowOk.bind(this));
    this._throwWindow.setHandler("cancel", this.onThrowCancel.bind(this));
    this.addWindow(this._throwWindow);
    return this._throwWindow;
  };

  Scene_Battle.prototype.commandThrow = function () {
    const win = this.createThrowWindow();
    win.refresh();
    win.show();
    win.activate();
    if (this._actorCommandWindow) this._actorCommandWindow.hide();
  };

  Scene_Battle.prototype.onThrowOk = function () {
    const item = this._throwWindow.item();
    if (!item) { this._throwWindow.activate(); return; }
    this._pendingThrowItem = item;
    this._throwWindow.hide();
    this._throwWindow.deactivate();
    // The enemy list is the same one every targeted action uses, so the row
    // painting, the cursor and the cancel path are all the familiar ones.
    this.startEnemySelection();
  };

  Scene_Battle.prototype.onThrowCancel = function () {
    this._pendingThrowItem = null;
    this._throwWindow.hide();
    this._throwWindow.deactivate();
    if (this._actorCommandWindow) {
      this._actorCommandWindow.show();
      this._actorCommandWindow.refresh();
      this._actorCommandWindow.activate();
    }
  };

  // Where the object starts and where it lands, in screen pixels. A sideview
  // battler knows its own place; anything else throws from the foot of the
  // screen, which is where the party stands in a front view.
  Scene_Battle.prototype._throwScreenPoints = function (enemy) {
    const actor = BattleManager.actor();
    const from = (actor && actor.isSpriteVisible && actor.isSpriteVisible())
      ? { x: actor.screenX(), y: actor.screenY() - 40 }
      : { x: Graphics.width * 0.25, y: Graphics.height - 140 };
    const to = enemy
      ? { x: enemy.screenX(), y: enemy.screenY() - 40 }
      : { x: Graphics.width * 0.75, y: Graphics.height * 0.4 };
    return { from, to };
  };

  // The throw itself: the object leaves the bag, flies, lands for its weight.
  // It is resolved here rather than through an action because nothing in the
  // database describes it; the actor's turn is spent all the same.
  Scene_Battle.prototype.resolveThrow = function (item, enemy) {
    const actor = BattleManager.actor();
    $gameParty.loseItem(item, 1);
    const { from, to } = this._throwScreenPoints(enemy);
    const land = () => {
      if (!window.ThrowItem) return;
      window.ThrowItem.hitBattler(enemy, item, actor);
    };
    if (window.ThrowItem && window.ThrowItem.flyModel) {
      window.ThrowItem.flyModel(item, from, to, land);
    } else {
      land();
    }
  };

  const _Scene_Battle_onEnemyOk_Throw = Scene_Battle.prototype.onEnemyOk;
  Scene_Battle.prototype.onEnemyOk = function () {
    if (!this._pendingThrowItem) {
      _Scene_Battle_onEnemyOk_Throw.call(this);
      return;
    }
    const item = this._pendingThrowItem;
    this._pendingThrowItem = null;
    const enemy = this._enemyWindow ? this._enemyWindow.enemy() : null;
    if (this._actorCommandWindow) this._actorCommandWindow._targetSession = null;
    if (this._enemyWindow) {
      this._enemyWindow.hide();
      this._enemyWindow.deactivate();
    }
    this.resolveThrow(item, enemy);
    // The turn is spent: the empty action left in the slot does nothing when
    // the round runs it.
    this.selectNextCommand();
  };

  const _Scene_Battle_onEnemyCancel_Throw = Scene_Battle.prototype.onEnemyCancel;
  Scene_Battle.prototype.onEnemyCancel = function () {
    if (!this._pendingThrowItem) {
      _Scene_Battle_onEnemyCancel_Throw.call(this);
      return;
    }
    this._pendingThrowItem = null;
    if (this._actorCommandWindow) this._actorCommandWindow._targetSession = null;
    if (this._enemyWindow) {
      this._enemyWindow.hide();
      this._enemyWindow.deactivate();
    }
    this.commandThrow();
  };

})();
