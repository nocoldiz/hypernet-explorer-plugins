/*:
 * @target MZ
 * @plugindesc v2.2.0 The parchment legend pinned to the corner of the map: the controls list, per-map notices, per-area notices and the variable tooltip. Exposes window.MapLegend.
 * @author Hypernet
 *
 * @help MapLegend.js
 *
 * The one sheet of paper the map screen pins in its top right corner. It used
 * to live inside CharacterCreation.js as a black Window_Base panel listing the
 * story mode's controls; it is its own plugin now and it is drawn as
 * parchment. It carries two things: the notices, and the controls list.
 *
 * ---------------------------------------------------------------------------
 * The controls list
 * ---------------------------------------------------------------------------
 * Every control the party has on the map, walking rows first and then every
 * key UI/CustomMainMenuLayout.js binds, read out of that plugin's own HOTKEYS
 * table (window.MenuHotkeys) rather than copied here, so a rebinding there
 * moves the list too. It is a list and nothing more: no row is watched for
 * being used and nothing on the sheet lights up, and no input is polled for
 * it a frame. Every row writes its keys out and hangs its pad buttons off the
 * end of them while a pad is plugged in, rather than the sheet guessing which
 * device is in the player's hands.
 *
 * It is not the story mode's: it hangs on every map, world map and generated
 * ground alike, for as long as it is switched on. Two things switch it:
 * the "Show/hide controls" entry in Bubba's Ask / Tell grid, and the Controls
 * list row on the Gameplay page of the options. Both write the one setting,
 * ConfigManager.showControls.
 *
 * The notices beside it answer to their own setting, ConfigManager.showMapNotices,
 * which has three states: "first" reads a tip once and never again, "always"
 * reads it every time the party stands there, "off" reads none. The grid's
 * "Show/hide tips" entry and the Map Tips row step through the same three.
 *
 * The sheet wears the interface's own theme. Every colour, size and space on
 * it is a token out of css/vars.css and every rule that draws it lives in
 * css/theme.css, so it repaints with the rest of the menus when the preset is
 * switched instead of staying parchment on a terminal screen. The plugin sets
 * classes and hands over the four measured numbers of its position as
 * --mlg-* custom properties; it builds no stylesheet and writes no style.
 *
 * ---------------------------------------------------------------------------
 * When the sheet exists at all
 * ---------------------------------------------------------------------------
 * The whole system is the story mode's, and only while Bubba is walking with
 * the party to read the place out: nothing is drawn, and no key is taken,
 * unless the story mode switch (100) AND switch 49, BubbaInParty, are both on.
 * The controls list and the H fold do not wait for either: see below.
 *
 * ---------------------------------------------------------------------------
 * What the sheet shows
 * ---------------------------------------------------------------------------
 * A notice, in Bubba's voice: one title and one paragraph, and the paragraph
 * opens with his name, because the notices are his reading of the place rather
 * than the place's own sign. The name is the i18n key MapLegend.speaker, so it
 * is written once and never inside a notice. Every notice must have a title,
 * because the title is what is left of it once the sheet is folded. A notice
 * that sends the party to a menu names it in square brackets - "use the
 * [Thinker] option in pause menu" - and the sheet draws that name bold,
 * without the brackets. Every translation of a notice must keep the brackets
 * around the same name.
 *
 * ---------------------------------------------------------------------------
 * The pamphlet
 * ---------------------------------------------------------------------------
 * A hundred steps into any game the party is handed the Omega Tower errand
 * without having to be walked into it: common event 145 is reserved. Once per
 * save, whether or not the story mode was ever played, and never twice. This
 * one stands apart from the legend switch: it is the errand, not the sheet.
 *
 * ---------------------------------------------------------------------------
 * Folding it away
 * ---------------------------------------------------------------------------
 * H folds the sheet and unfolds it, on every map, whether or not Bubba is
 * along: the fold is the list's, not the notices'. On a pad it is L3,
 * or R3 on the world map where L3 is already Wait. Whether it is folded is
 * remembered on $gameSystem and it starts folded.
 *
 * Folded means two different things depending on where the party stands. In
 * the story mode, and on the tutorial map (1414) and every map filed under it
 * in the editor tree, the sheet is pinned: folded it is a strip carrying the
 * notice title, or the Controls heading, and the fold chip, so the player can
 * always see it is there. Anywhere else a folded sheet is off the screen
 * entirely and the same key brings it up. While the sheet answers to H the
 * help menu does not: it is reached through the pause menu instead. With the
 * list switched off in the options and no notice to show, H is the help
 * menu again.
 *
 * ---------------------------------------------------------------------------
 * Where a notice comes from
 * ---------------------------------------------------------------------------
 * Three sources, resolved in this order:
 *
 *   1. The tooltip variable, if it was JUST changed. Variable 7 (see
 *      NOTICE_VARIABLE_ID) names a tooltip out of TOOLTIPS. An event that
 *      writes it is saying something now, so for the next few seconds it
 *      speaks over anything the ground has to say.
 *   2. The area the party is standing in, out of AREAS: a rectangle of map
 *      squares with a notice of its own. Areas beat the standing value of the
 *      tooltip variable, so a village square keeps naming itself long after
 *      the variable that pointed the party there was set.
 *   3. The tooltip variable, at rest. Non-zero, outside every area.
 *
 * A map has no notice of its own: outside every zone, with the variable at 0,
 * the sheet is not drawn at all.
 *
 * ---------------------------------------------------------------------------
 * Registering more
 * ---------------------------------------------------------------------------
 * Every notice is an i18n base key; the sheet reads "<key>.title" for the
 * heading and "<key>.text" for the paragraph, out of js/i18n/<lang>/plugins/
 * MapLegend.json. Add to the tables below, or from another plugin:
 *
 * The tables themselves are authored data, not code: they live in
 * js/db/MapNotices/Notices.json and are drawn on the map picture by the Map
 * Tooltips tool (tools/modules/map-tooltips.js). A plugin can still add to
 * them at runtime:
 *
 *   MapLegend.registerArea(1414, { x1: 4, y1: 4, x2: 12, y2: 20,
 *                                  key: 'MapLegend.areas.someField' });
 *   MapLegend.registerTooltip(9, 'MapLegend.tips.someHint');
 *
 * Area rectangles are inclusive on both corners and are tested in the order
 * they were registered, so the first match wins.
 *
 * @command refresh
 * @text Refresh legend
 * @desc Re-reads the notice for the square the party is standing on and redraws the sheet.
 *
 * @command setTooltip
 * @text Set tooltip
 * @desc Writes the tooltip variable, the same as setting variable 7 by hand. 0 hands the sheet back to the area notices.
 *
 * @arg value
 * @text Tooltip number
 * @type number
 * @min 0
 * @default 0
 * @desc Which registered tooltip to show. 0 clears it.
 */
(() => {
  "use strict";

  const PLUGIN_NAME = "MapLegend";

  //===========================================================================
  // What is registered
  //===========================================================================

  // The variable an event writes to speak over the ground. 0 means "say
  // nothing of your own, let the map and the areas talk".
  const NOTICE_VARIABLE_ID = 7;

  // How long a freshly written tooltip variable outranks the area underfoot.
  // Long enough to be read where it was set, short enough that walking on
  // hands the ground its voice back.
  const TOOLTIP_PRIORITY_FRAMES = 420;   // 7 seconds at 60fps

  // Which map says what, and where, is authored data rather than code: it lives
  // in js/db/MapNotices/Notices.json and is edited by the Map Tooltips tool
  // (tools/modules/map-tooltips.js). DataService registers that folder onto
  // window.MapNotices, read on first use, so nothing is parsed until the party
  // is actually standing somewhere.
  const DB_NAMESPACE = "MapNotices";
  const DB_FILE = "Notices";

  // mapId -> rectangles of map squares, each with a notice of its own.
  // Corners are inclusive; the first rectangle that contains the party wins.
  const AREAS = {};
  // Value of NOTICE_VARIABLE_ID -> i18n base key.
  const TOOLTIPS = {};

  let registryLoaded = false;

  // Reads the data file into the two tables above. Anything another plugin
  // registered by hand before the file was read survives, since the file is
  // only ever written into gaps it does not already fill... the other way
  // round would let a stale data file undo a runtime registration.
  function ensureRegistry() {
    if (registryLoaded) return;
    const db = window[DB_NAMESPACE] && window[DB_NAMESPACE][DB_FILE];
    if (!db) return;   // DataService has not registered it; try again next call
    registryLoaded = true;
    const maps = db.maps || {};
    for (const mapId of Object.keys(maps)) {
      const entry = maps[mapId] || {};
      if (Array.isArray(entry.areas) && entry.areas.length && AREAS[mapId] === undefined) {
        AREAS[mapId] = entry.areas.map((a) => ({
          key: a.key, x1: Number(a.x1), y1: Number(a.y1), x2: Number(a.x2), y2: Number(a.y2),
        }));
      }
    }
    const tips = db.tooltips || {};
    for (const value of Object.keys(tips)) {
      if (TOOLTIPS[value] === undefined) TOOLTIPS[value] = tips[value];
    }
  }

  //===========================================================================
  // Small shared helpers
  //===========================================================================

  function T(key, params) {
    return window.T ? window.T(key, params) : String(key);
  }

  function has(key) {
    return !!(window.T && window.T.has && window.T.has(key));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // A notice names the menus it is sending the party to in square brackets:
  // "use the [Thinker] option in pause menu". The brackets are markup rather
  // than punctuation, so what stands between them is drawn bold and they are
  // dropped. Nothing else in a notice is marked up, and an unclosed bracket is
  // left exactly as it was written.
  const NOTICE_EMPHASIS = /\[([^\[\]]+)\]/g;

  function noticeHtml(s) {
    return escapeHtml(s).replace(NOTICE_EMPHASIS,
      (_, inner) => `<span class="mlg-strong">${inner}</span>`);
  }

  //===========================================================================
  // The controls list
  //===========================================================================
  // Every control the map answers to, each row lighting the first time it is
  // actually used. Any device counts: RPG Maker MZ's Input already merges the
  // keyboard and the pad onto one symbol.

  // Pad buttons are physical labels rather than words: they read the same in
  // every language, so they are written here instead of in the i18n bank.
  // i18n-ignore-start  physical gamepad button labels
  const PAD = {
    up: "D-Pad ↑",
    down: "D-Pad ↓",
    left: "D-Pad ←",
    right: "D-Pad →",
    ok: "A",
    run: "X",
    menu: "Y",
    hotbarStep: "L1 / R1",
    visitPlace: "Select",
    wait: "L3",
    zoom: "L2 / R2",
    fold: "L3",
    foldWorldMap: "R3",
  };
  // i18n-ignore-end

  // The rows every map has, whatever map it is. A row with a padLabelKey is
  // not the same control on the two devices, so it shows one face or the other
  // rather than both: see rowFace() below.
  const WALK_CONTROLS = [
    { id: "up", labelKey: "MapLegend.controls.up", key: "↑", pad: PAD.up },
    { id: "down", labelKey: "MapLegend.controls.down", key: "↓", pad: PAD.down },
    { id: "left", labelKey: "MapLegend.controls.left", key: "←", pad: PAD.left },
    { id: "right", labelKey: "MapLegend.controls.right", key: "→", pad: PAD.right },
    { id: "ok", labelKey: "MapLegend.controls.action", key: "Z / Enter", mouseKey: "MapLegend.controls.leftClick", pad: PAD.ok },
    { id: "shift", labelKey: "MapLegend.controls.run", keyKey: "MapLegend.controls.holdShift", pad: PAD.run },
    { id: "menu", labelKey: "MapLegend.controls.menu", key: "Esc", pad: PAD.menu },
    {
      id: "hotbar",
      labelKey: "MapLegend.controls.hotbarUse", key: "1 / 2 / 3",
      padLabelKey: "MapLegend.controls.hotbarCycle", pad: PAD.hotbarStep,
    },
  ];

  // The world map (315) answers to three controls no other ground does: T /
  // Select stops the journey and walks the party into whatever stands on the
  // square (WorldMapReturn's wmrToggle), R opens the wait sheet, and the
  // wheel, the +/- keys and the triggers pull the camera in and out.
  const WORLD_MAP_LEGEND_MAP_ID = 315;

  const WORLD_MAP_CONTROLS = [
    { id: "visitPlace", labelKey: "MapLegend.controls.stopTravel", key: "T", pad: PAD.visitPlace },
    { id: "wait", labelKey: "MapLegend.controls.wait", key: "R", pad: PAD.wait },
    {
      id: "worldZoom", labelKey: "MapLegend.controls.zoom",
      key: "+ / -", mouseKey: "MapLegend.controls.scrollWheel", pad: PAD.zoom,
    },
  ];

  // The generated ground answers to two things no other ground does: what the
  // action button does to whatever the party is facing (Procedural/
  // ProceduralTerrainInteractions.js) and the way back out to the world map.
  const PROCEDURAL_MAP_ID = 636;

  const PROCEDURAL_CONTROLS = [
    {
      id: "procInteract", labelKey: "MapLegend.controls.interact",
      key: "Z / Enter", mouseKey: "MapLegend.controls.leftClick", pad: PAD.ok,
    },
    { id: "procReturn", labelKey: "MapLegend.controls.returnToWorld", key: "T", pad: PAD.visitPlace },
  ];

  // The menu keys are not written out here: UI/CustomMainMenuLayout.js owns the
  // one table that binds them and prints their badges, and it hands it out as
  // window.MenuHotkeys, so the sheet reads that instead of keeping a second
  // copy that would drift. Each symbol borrows the name its own pockets tile
  // wears, so a key and the screen it opens are never called two things.
  // None of them has a button of its own: on a pad every one is reached
  // through the pause menu, so they are drawn to the keys alone.
  const MENU_HOTKEY_LABELS = {
    item: "MainMenu.cmd.backpack",
    quest_log: "MainMenu.cmd.questLog",
    skill: "MainMenu.cmd.skills",
    status1: "MainMenu.cmd.status",
    equip: "MainMenu.cmd.equip",
    sleep_menu: "MainMenu.cmd.wait",
    world_map: "MainMenu.cmd.worldMap",
    vehicles: "MainMenu.cmd.vehicles",
    build: "MainMenu.cmd.build",
    help: "MainMenu.cmd.archive",
    training: "MainMenu.cmd.training",
    sandbox: "MainMenu.cmd.sandbox",
    thinker: "MainMenu.cmd.thinker",
  };

  function menuHotkeyControls() {
    const table = window.MenuHotkeys && window.MenuHotkeys.list
      ? window.MenuHotkeys.list() : [];
    const rows = [];
    for (const hotkey of table) {
      const labelKey = MENU_HOTKEY_LABELS[hotkey.symbol];
      if (!labelKey) continue;
      rows.push({
        id: "menu_" + hotkey.symbol, labelKey, key: hotkey.key,
        input: hotkey.input, keyboardOnly: true,
      });
    }
    return rows;
  }

  //===========================================================================
  // Whether a pad is plugged in
  //===========================================================================
  // One question, asked once per rebuild rather than once per frame: is a pad
  // plugged in at all, which is what decides whether the pad chips are drawn
  // beside the keys. Which device was touched last is not asked: the sheet is
  // a list of the controls, both faces of every row written out together.

  function analogStick() {
    return (typeof window !== "undefined" && window.AnalogStickInput) || null;
  }

  function rawPads() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
    const pads = navigator.getGamepads() || [];
    const out = [];
    for (const pad of pads) if (pad && pad.connected) out.push(pad);
    return out;
  }

  // AnalogStickInput polls the pad once a frame for the whole game, so its
  // answer is preferred; the raw list is the fallback for a runtime loaded
  // without it, and for the harness, which has no navigator at all.
  function padConnected() {
    const stick = analogStick();
    if (stick && stick.hasPad) return !!stick.hasPad();
    return rawPads().length > 0;
  }

  //===========================================================================
  // Whether the list is up, and what is on it
  //===========================================================================
  // One setting answers it, ConfigManager.showControls, so Bubba's topic and
  // the options row cannot disagree about whether the list is out. It hangs on
  // every map until something turns it off; nothing retires it by itself.

  function controlsShown() {
    return typeof ConfigManager !== "undefined" && ConfigManager
      ? ConfigManager.showControls !== false : true;
  }

  function setControlsShown(value) {
    if (typeof ConfigManager === "undefined" || !ConfigManager) return;
    ConfigManager.showControls = !!value;
    if (ConfigManager.save) ConfigManager.save();
  }

  function toggleControls() {
    setControlsShown(!controlsShown());
    return controlsShown();
  }

  // The notices are the other half of the sheet, and they answer to their own
  // setting, ConfigManager.showMapNotices, so the tips can be sent away while
  // the list stays pinned up and the other way round. It is not a switch
  // but three states: a tip read once and never again, a tip read every time
  // the party stands there, or no tips at all.

  const NOTICE_MODES = ["first", "always", "off"]; // i18n-ignore: setting values
  const NOTICE_MODE_DEFAULT = "first";             // i18n-ignore: setting value

  function noticesMode() {
    if (typeof ConfigManager === "undefined" || !ConfigManager) return NOTICE_MODE_DEFAULT;
    const raw = ConfigManager.showMapNotices;
    // A save written before the third state existed said true or false.
    if (raw === true || raw == null) return NOTICE_MODE_DEFAULT;
    if (raw === false) return "off";
    return NOTICE_MODES.includes(raw) ? raw : NOTICE_MODE_DEFAULT;
  }

  function setNoticesMode(mode) {
    if (typeof ConfigManager === "undefined" || !ConfigManager) return;
    ConfigManager.showMapNotices = NOTICE_MODES.includes(mode) ? mode : NOTICE_MODE_DEFAULT;
    if (ConfigManager.save) ConfigManager.save();
  }

  // The grid and the options row both step through the three in one direction.
  function cycleNoticesMode() {
    const next = NOTICE_MODES[(NOTICE_MODES.indexOf(noticesMode()) + 1) % NOTICE_MODES.length];
    setNoticesMode(next);
    return next;
  }

  function noticesShown() {
    return noticesMode() !== "off";
  }

  function setNoticesShown(value) {
    setNoticesMode(value ? NOTICE_MODE_DEFAULT : "off");
  }

  function toggleNotices() {
    setNoticesShown(!noticesShown());
    return noticesShown();
  }

  // Which tips have already been read, one record on $gameSystem so a save
  // reopens with the same ones spent. The tip on the paper right now is not
  // spent by being looked at: it stays until the party walks out of it.
  const noticeWatch = { showing: null };

  function noticeSeen() {
    return ($gameSystem && $gameSystem._mapLegendNoticesSeen) || {};
  }

  function markNoticeSeen(key) {
    if (!$gameSystem || !key) return false;
    const seen = noticeSeen();
    if (seen[key]) return false;
    seen[key] = true;
    $gameSystem._mapLegendNoticesSeen = seen;
    return true;
  }

  function resetNoticesSeen() {
    if ($gameSystem) $gameSystem._mapLegendNoticesSeen = {};
    noticeWatch.showing = null;
  }

  // The tip the sheet is allowed to draw under the current setting.
  function allowedNotice(notice) {
    const mode = noticesMode();
    if (mode === "off" || !notice) {
      if (!notice) noticeWatch.showing = null;
      return null;
    }
    if (mode === "always") { noticeWatch.showing = notice.key; return notice; }
    if (noticeSeen()[notice.key] && noticeWatch.showing !== notice.key) {
      noticeWatch.showing = null;
      return null;
    }
    noticeWatch.showing = notice.key;
    markNoticeSeen(notice.key);
    return notice;
  }

  function proceduralMapId() {
    const wmt = window.WorldMapTransfer;
    return (wmt && wmt.procMapId) || PROCEDURAL_MAP_ID;
  }

  // The list for the ground the party is standing on: the walking rows
  // everywhere, the world map's and the generated ground's on top of them, and
  // the menu keys last because they are the same wherever anybody stands.
  function visibleRows() {
    if (!controlsShown() || !$gameMap) return [];
    const rows = WALK_CONTROLS.slice();
    if ($gameMap.mapId() === WORLD_MAP_LEGEND_MAP_ID) rows.push(...WORLD_MAP_CONTROLS);
    if ($gameMap.mapId() === proceduralMapId()) rows.push(...PROCEDURAL_CONTROLS);
    return rows.concat(menuHotkeyControls());
  }

  // What the row says on a keyboard: the key, plus the mouse where one reaches
  // the same control.
  function rowKeys(entry) {
    const key = entry.key || (entry.keyKey ? T(entry.keyKey) : "");
    const mouse = entry.mouseKey ? T(entry.mouseKey) : "";
    return [key, mouse].filter(Boolean).join(" / ");
  }

  function padTokens(entry) {
    if (!entry.pad) return [];
    return String(entry.pad).split("/").map((s) => s.trim()).filter(Boolean);
  }

  // The label and the two key columns for one row. Nothing watches what the
  // player is holding: the row writes its keys out and hangs the pad chips off
  // the end of them while a pad is plugged in, and a row that is a different
  // control on the two devices names both.
  function rowFace(entry, hasPad) {
    const pad = hasPad === undefined ? padConnected() : !!hasPad;
    const label = entry.padLabelKey && pad
      ? T(entry.labelKey) + " / " + T(entry.padLabelKey)
      : T(entry.labelKey);
    return { label, keys: rowKeys(entry), pads: pad ? padTokens(entry) : [] };
  }

  //===========================================================================
  // The pad buttons the sheet reads for itself
  //===========================================================================

  // A pad button with no Input.gamepadMapper action on it, read raw the way
  // WorldMap.js reads Start.
  function padButtonTriggered(name) {
    const stick = analogStick();
    if (!stick || !stick.isButtonTriggered || !stick.BUTTON) return false;
    const index = stick.BUTTON[name];
    return index === undefined ? false : !!stick.isButtonTriggered(index);
  }

  //===========================================================================
  // Notice resolution
  //===========================================================================

  // A registered notice resolved into the two strings the sheet draws. The
  // title is what the sheet keeps when it is folded, so a notice without one
  // is treated as nothing registered at all rather than folding into a blank
  // strip; the paragraph under it is optional.
  function readNotice(baseKey) {
    if (!baseKey) return null;
    const titleKey = baseKey + ".title";
    const textKey = baseKey + ".text";
    if (!has(titleKey)) return null;
    return {
      key: baseKey,
      title: T(titleKey),
      text: has(textKey) ? T(textKey) : "",
    };
  }

  function areaNoticeKey(mapId, x, y) {
    ensureRegistry();
    const list = AREAS[mapId];
    if (!list) return null;
    for (const area of list) {
      const x1 = Math.min(area.x1, area.x2);
      const x2 = Math.max(area.x1, area.x2);
      const y1 = Math.min(area.y1, area.y2);
      const y2 = Math.max(area.y1, area.y2);
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return area.key;
    }
    return null;
  }

  function tooltipNoticeKey(value) {
    ensureRegistry();
    return TOOLTIPS[value] || null;
  }

  // The tooltip variable is watched rather than hooked: whoever writes it -
  // an event command, a plugin, the debug console - is saying something now,
  // and for TOOLTIP_PRIORITY_FRAMES that outranks the ground the party is
  // standing on. Loading a save re-reads the value without arming the window,
  // so an old tooltip does not shout the moment the map comes back.
  const tooltipWatch = { last: null, priorityLeft: 0 };

  function currentTooltipValue() {
    return $gameVariables ? Number($gameVariables.value(NOTICE_VARIABLE_ID)) || 0 : 0;
  }

  function resetTooltipWatch() {
    tooltipWatch.last = currentTooltipValue();
    tooltipWatch.priorityLeft = 0;
  }

  function updateTooltipWatch() {
    const value = currentTooltipValue();
    if (tooltipWatch.last === null) {
      tooltipWatch.last = value;
      return;
    }
    if (value !== tooltipWatch.last) {
      tooltipWatch.last = value;
      tooltipWatch.priorityLeft = value !== 0 ? TOOLTIP_PRIORITY_FRAMES : 0;
    } else if (tooltipWatch.priorityLeft > 0) {
      tooltipWatch.priorityLeft--;
    }
  }

  // The three sources, in the order the help block describes. A map with no
  // zone underfoot and no tooltip set says nothing, and the sheet is not drawn.
  function resolveNotice() {
    if (!$gameMap || !$gamePlayer) return null;
    const mapId = $gameMap.mapId();
    const value = currentTooltipValue();
    const tooltip = value !== 0 ? readNotice(tooltipNoticeKey(value)) : null;

    if (tooltip && tooltipWatch.priorityLeft > 0) return tooltip;

    const area = readNotice(areaNoticeKey(mapId, $gamePlayer.x, $gamePlayer.y));
    if (area) return area;
    return tooltip;
  }

  //===========================================================================
  // Folding the sheet away
  //===========================================================================
  // Switch 100 is the story mode, the same switch character creation, the death
  // handler and the world map return all read. Switch 49 is BubbaInParty, and
  // the notices are Bubba's own reading of the place: the sheet, and the fold
  // that takes H off the help menu for it, exist only while both are on.

  const STORY_MODE_SWITCH_ID = 100;
  const LEGEND_SWITCH_ID = 49;
  const FOLD_INPUT = "letter_h";     // CustomMainMenuLayout maps H (72) onto it
  const FOLD_KEY_LABEL = "H";        // i18n-ignore  physical key label

  function storyMode() {
    return !!($gameSwitches && $gameSwitches.value(STORY_MODE_SWITCH_ID));
  }

  // The one answer to "is any of this running at all".
  function legendEnabled() {
    return storyMode() && !!($gameSwitches && $gameSwitches.value(LEGEND_SWITCH_ID));
  }

  // The tutorial map and everything filed under it in the editor tree keep
  // the sheet pinned up the way the story mode does, whichever switches are
  // on: the sheet is what teaches those maps.
  const TUTORIAL_ROOT_MAP_ID = 1414;

  function mapInfo(mapId) {
    const infos = typeof $dataMapInfos !== "undefined" ? $dataMapInfos : null;
    return infos && infos[mapId] ? infos[mapId] : null;
  }

  function tutorialMap(mapId) {
    let id = Number(mapId) || 0;
    for (let depth = 0; id > 0 && depth < 64; depth++) {
      if (id === TUTORIAL_ROOT_MAP_ID) return true;
      const info = mapInfo(id);
      if (!info) return false;
      id = Number(info.parentId) || 0;
    }
    return false;
  }

  // Where the sheet stays on the screen even folded.
  function pinnedContext() {
    return storyMode() || !!($gameMap && tutorialMap($gameMap.mapId()));
  }

  // Folded is remembered on $gameSystem, so a save reopens the way it was
  // left, and a fresh one opens unfolded: the first notice of a place has to
  // be readable without the party knowing about the fold key first.
  function isFolded() {
    if (!$gameSystem) return false;
    return $gameSystem._mapLegendFolded === true;
  }

  function toggleFold() {
    if (!$gameSystem) return;
    $gameSystem._mapLegendFolded = !isFolded();
    SoundManager.playCursor();
  }

  // Whether there is anything at all for the fold key to bring up: with the
  // list switched off and no notice running, the key is left alone.
  function foldable() {
    return legendEnabled() || controlsShown();
  }

  // The pad's fold button. L3 everywhere, except the world map where L3 is
  // already the wait sheet.
  function foldPadButton() {
    return $gameMap && $gameMap.mapId() === WORLD_MAP_LEGEND_MAP_ID
      ? PAD.foldWorldMap : PAD.fold;
  }

  function foldChipLabel() {
    return FOLD_KEY_LABEL;
  }

  // H is the help menu everywhere else, so the fold is spliced in ahead of the
  // hotkey table CustomMainMenuLayout owns rather than bound over it: while the
  // sheet is up the press is taken here and the table never sees it, and the
  // moment the system is switched off the table gets its key back. That plugin
  // loads after this one, so the splice waits until the map is starting.
  let foldHotkeyTried = false;
  let foldHotkeySpliced = false;

  function patchFoldHotkey() {
    if (foldHotkeyTried) return;
    foldHotkeyTried = true;
    if (typeof Scene_Map.prototype.updateMenuHotkeys !== "function") return;
    const base = Scene_Map.prototype.updateMenuHotkeys;
    Scene_Map.prototype.updateMenuHotkeys = function () {
      if (foldable() && Input.isTriggered(FOLD_INPUT)) {
        toggleFold();
        return;
      }
      base.call(this);
    };
    foldHotkeySpliced = true;
  }

  // The pad button has no table to fight over, so it is read straight off the
  // map. With CustomMainMenuLayout absent there is no help menu to protect
  // either, and the key is read here too.
  function readFoldKey() {
    if (!foldable()) return;
    if (padButtonTriggered(foldPadButton())) { toggleFold(); return; }
    if (foldHotkeySpliced) return;
    if (Input.isTriggered(FOLD_INPUT)) toggleFold();
  }

  //===========================================================================
  // The parchment sheet
  //===========================================================================
  // The sheet wears the live theme. Every colour on it is a token out of
  // css/vars.css, so switching preset repaints the note with the rest of the
  // interface instead of leaving one sheet of parchment on a terminal screen.
  // The rules themselves live in css/theme.css under "The map legend"; nothing
  // here builds a stylesheet at runtime.

  // Two panels, not one sheet: what the place says stands in the top right
  // corner where the party reads it, and the controls list is its own
  // window down the left edge, which is where a list that long can stand
  // without covering the map the notice is about.
  const SHEET_ID = "map-legend";
  const CONTROLS_ID = "map-legend-controls";
  const SHEET_WIDTH = 336;   // game pixels
  const SHEET_MARGIN = 16;   // game pixels, from the corner it is pinned to

  function canvasMetrics() {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas || typeof Graphics === "undefined" || !Graphics.width) return null;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { ox: r.left, oy: r.top, right: r.right,
             sx: r.width / Graphics.width, sy: r.height / Graphics.height };
  }

  class LegendSheet {
    constructor() {
      this._el = null;
      this._ctl = null;
      this._signature = "";
      this._ctlSignature = "";
    }

    // One builder for both panels: they wear the same parchment (.mlg-sheet)
    // and differ only in the corner they are pinned to.
    _panel(id, prop, cls) {
      if (this[prop] && document.body.contains(this[prop])) return this[prop];
      // The page survives Title <-> Map transitions, so a panel left behind by
      // a previous run is purged rather than layered under a new one.
      document.querySelectorAll("#" + id).forEach((e) => e.remove());
      const el = document.createElement("div");
      el.id = id;
      el.className = cls;
      document.body.appendChild(el);
      this[prop] = el;
      this._needsPosition = true;
      if (prop === "_el") this._signature = ""; else this._ctlSignature = "";
      return el;
    }

    element() {
      return this._panel(SHEET_ID, "_el", "mlg-sheet");
    }

    controlsElement() {
      return this._panel(CONTROLS_ID, "_ctl", "mlg-sheet mlg-controls");
    }

    _away(el) {
      if (!el) return;
      el.classList.remove("mlg-shown");
      el.classList.add("mlg-away");
    }

    hide() {
      this._away(this._el);
      this._away(this._ctl);
      // Coming back the page may have moved under it, so the next draw
      // measures again.
      this._needsPosition = true;
    }

    destroy() {
      for (const el of [this._el, this._ctl]) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
      this._el = null;
      this._ctl = null;
      this._signature = "";
      this._ctlSignature = "";
      this._needsPosition = true;
    }

    // Fading in on the frame after a panel is attached, so the first notice of
    // a map arrives rather than snapping into place.
    _show(el, prop) {
      el.classList.remove("mlg-away");
      if (!el.classList.contains("mlg-shown")) {
        requestAnimationFrame(() => {
          if (this[prop] === el) el.classList.add("mlg-shown");
        });
      }
    }

    // Each panel is rebuilt only when what it says changes, so a walking party
    // costs two string compares a frame.
    draw(notice, rows, state) {
      const folded = !!state.folded;

      // The notice, top right. Folded it is its title alone, and with nothing
      // to say the panel is off the screen rather than standing empty.
      // A plain string rather than JSON.stringify: this runs every frame the
      // party is walking, and the notice is four fields.
      const noticeSig = (notice ? notice.key + "" + notice.title + "" + notice.text : "-") +
        "" + (folded ? 1 : 0) + (state.foldable ? 1 : 0) + "" + (state.foldChip || "");
      if (notice) {
        const el = this.element();
        if (noticeSig !== this._signature) {
          this._signature = noticeSig;
          this._needsPosition = true;
          el.innerHTML = this._noticeHtml(notice, state);
          el.classList.toggle("mlg-folded", folded);
        }
        this._show(el, "_el");
      } else {
        this._away(this._el);
      }

      // The list, down the left. Folded it is put away whole: the fold
      // line that brings it back rides on whichever panel is still up.
      // The rows only change when the map does, so their ids alone say it.
      let ctlSig = "";
      for (const entry of rows) ctlSig += entry.id + "";
      ctlSig += "" + (folded ? 1 : 0) + (state.foldable ? 1 : 0) +
        (state.hasPad ? 1 : 0) + (notice ? 1 : 0) + "" + (state.foldChip || "");
      const wantControls = rows.length || (state.foldable && !notice);
      if (wantControls) {
        const ctl = this.controlsElement();
        if (ctlSig !== this._ctlSignature) {
          this._ctlSignature = ctlSig;
          this._needsPosition = true;
          ctl.innerHTML = this._controlsHtml(rows, state, !!notice);
          ctl.classList.toggle("mlg-folded", folded);
        }
        this._show(ctl, "_ctl");
      } else {
        this._away(this._ctl);
      }

      this.position();
    }

    // The fold line: the key that puts the panels away, and what pressing it
    // does next.
    _foldHtml(hint, state) {
      return '<div class="mlg-fold">' +
        `<span class="ui-chip mlg-chip">${escapeHtml(state.foldChip || FOLD_KEY_LABEL)}</span>` +
        `<span>${escapeHtml(hint)}</span></div>`;
    }

    // Folded, the notice is its title and nothing else, and only the [H] chip
    // says the rest is still there.
    _noticeHtml(notice, state) {
      const parts = [`<div class="mlg-title">${noticeHtml(notice.title)}</div>`];
      if (!state.folded && notice.text) {
        // The notices are Bubba reading the place to the party, so the
        // paragraph is signed with his name rather than written as a sign.
        parts.push(`<div class="mlg-text">` +
          `<span class="mlg-speaker">${escapeHtml(T("MapLegend.speaker"))}:</span> ` +
          `${noticeHtml(notice.text)}</div>`);
      }
      if (state.foldable) {
        parts.push(this._foldHtml(
          T(state.folded ? "MapLegend.unfoldHint" : "MapLegend.foldHint"), state));
      }
      return parts.join("");
    }

    // The list window. It carries the fold line itself only when there is
    // no notice beside it to carry one, so the key is never written twice.
    _controlsHtml(rows, state, hasNotice) {
      const parts = [];
      // A panel folded over nothing but the list says everything it has
      // to say on the fold line itself, so it grows no heading of its own.
      const bareFold = !!state.folded;
      if (!state.folded && rows.length) {
        parts.push(`<div class="mlg-heading">${escapeHtml(T("MapLegend.controlsHeading"))}</div>`);
        for (const entry of rows) {
          const face = rowFace(entry, state.hasPad);
          const binds = [];
          if (face.keys) binds.push(`<span class="mlg-keys">${escapeHtml(face.keys)}</span>`);
          for (const token of face.pads) {
            binds.push(`<span class="ui-chip mlg-chip">${escapeHtml(token)}</span>`);
          }
          parts.push(
            `<div class="mlg-row">` +
            `<span class="mlg-label">${escapeHtml(face.label)}</span>` +
            `<span class="mlg-binds">${binds.join("")}</span>` +
            `</div>`
          );
        }
      }
      if (state.foldable && !hasNotice) {
        const hint = bareFold
          ? T("MapLegend.controlsHeading")
          : T("MapLegend.foldHint");
        parts.push(this._foldHtml(hint, state));
      }
      return parts.join("");
    }

    // Stepping back under a portrait: see bustOnScreen above.
    setBehindBusts(behind) {
      for (const el of [this._el, this._ctl]) {
        if (el) el.classList.toggle("mlg-behind", !!behind);
      }
    }

    // Pinned by its right edge rather than its left, so a folded sheet no
    // wider than its own title still sits in the corner instead of floating
    // in from it.
    // Where the canvas actually sits on the page is measured, not styled, so
    // the four numbers are handed to the stylesheet as custom properties and
    // the rule in theme.css does the drawing.
    // Measuring the canvas forces a layout, so it is done only when something
    // has actually moved: a rebuilt panel, or a resized window.
    position(force) {
      if (!force && !this._needsPosition) return;
      const m = canvasMetrics();
      if (!m) return;
      this._needsPosition = false;
      // The notice hangs off the canvas's right edge, the list off its
      // left one and off the floor: the party HUD owns the top left corner,
      // and a list this long has to grow upwards to stay clear of it.
      for (const el of [this._el, this._ctl]) {
        if (!el) continue;
        el.style.setProperty("--mlg-right", (window.innerWidth - m.right + SHEET_MARGIN * m.sx) + "px");
        el.style.setProperty("--mlg-top", (m.oy + SHEET_MARGIN * m.sy) + "px");
        el.style.setProperty("--mlg-left", (m.ox + SHEET_MARGIN * m.sx) + "px");
        el.style.setProperty("--mlg-bottom",
          (window.innerHeight - m.oy - m.sy * Graphics.height + SHEET_MARGIN * m.sy) + "px");
        el.style.setProperty("--mlg-sx", m.sx);
        el.style.setProperty("--mlg-sy", m.sy);
      }
    }
  }

  // A portrait standing on the canvas owns the screen while it speaks. The
  // panels are DOM and the busts are drawn into the game canvas, so they can
  // never truly be layered under one: they step back instead, faint enough for
  // the portrait to read through them, and come back when it leaves.
  function bustOnScreen() {
    const scene = typeof SceneManager !== "undefined" && SceneManager._scene;
    const mgr = scene && scene._bustManager;
    return !!(mgr && mgr.bustIsVisible);
  }

  const sheet = new LegendSheet();

  // The panels are pinned to the canvas, and the canvas moves when the window
  // does. That is the only thing that moves them, so it is the only thing that
  // makes them measure again.
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("resize", () => { sheet._needsPosition = true; });
  }

  //===========================================================================
  // The pamphlet, a hundred steps in
  //===========================================================================
  // Every game hands the party the Omega Tower errand itself rather than
  // waiting to be walked into: a hundred steps in, common event 145 (the
  // pamphlet) is reserved. Once per save, whether or not the story mode was ever
  // played, so a party that skipped it is still sent to the tower.

  const ERRAND_COMMON_EVENT_ID = 145;
  const ERRAND_STEPS = 100;

  function updateStoryModeErrand() {
    // The flag is the whole of "only once": it is written before the event is
    // reserved and it lives on $gameSystem, so it is remembered by the save.
    if (!$gameSystem || $gameSystem._mapLegendErrandGiven) return;
    if (!$gameParty || !$gameMap) return;
    if ($gameParty.steps() < ERRAND_STEPS) return;
    // Never on top of something already playing: the pamphlet waits for the
    // step after whatever is running has finished.
    if ($gameMap.isEventRunning && $gameMap.isEventRunning()) return;
    if (typeof $gameMessage !== "undefined" && $gameMessage && $gameMessage.isBusy()) return;
    if ($gamePlayer && $gamePlayer.isTransferring && $gamePlayer.isTransferring()) return;
    // The 3D world runs over a live map scene and owns the screen while it is
    // up; the pamphlet waits until the party is back on the map itself.
    if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive &&
      window.VoxelWorldSystem.isActive()) return;
    $gameSystem._mapLegendErrandGiven = true;
    if ($gameTemp && $gameTemp.reserveCommonEvent) {
      $gameTemp.reserveCommonEvent(ERRAND_COMMON_EVENT_ID);
    }
  }

  //===========================================================================
  // Driving it from the map scene
  //===========================================================================

  // The sheet belongs to the walking map and nothing else: a menu, a battle or
  // the 3D world takes it off the screen rather than leaving it floating over
  // something it was never drawn against.
  function sheetAllowed() {
    // The notices are the story mode's; the list is nobody's, so either
    // one on its own is reason enough to pin the paper up.
    if (!legendEnabled() && !controlsShown()) return false;
    if (!(SceneManager._scene instanceof Scene_Map)) return false;
    if (SceneManager.isSceneChanging && SceneManager.isSceneChanging()) return false;
    if (!$gameMap || !$gamePlayer || !$gameSystem) return false;
    if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive && window.VoxelWorldSystem.isActive()) return false;
    return true;
  }

  function updateLegend() {
    if (!sheetAllowed()) {
      sheet.hide();
      return;
    }
    updateTooltipWatch();
    readFoldKey();
    const notice = legendEnabled() ? allowedNotice(resolveNotice()) : null;
    const folded = isFolded();
    const rows = folded ? [] : visibleRows();
    // Folded, the sheet stays up as a strip only where it is pinned: the
    // story mode and the tutorial maps. Anywhere else folded is off the
    // screen, and the same key brings it back.
    if (folded && !pinnedContext()) {
      sheet.hide();
      return;
    }
    if (!notice && !rows.length && !(folded && controlsShown())) {
      sheet.hide();
      return;
    }
    sheet.draw(notice, rows, {
      folded, foldable: foldable(), hasPad: padConnected(), foldChip: foldChipLabel(),
    });
    sheet.setBehindBusts(bustOnScreen());
  }

  // The fold is spliced into the hotkey table as the map starts, which is
  // after every plugin has loaded and before the first frame is updated.
  const _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    patchFoldHotkey();
    _Scene_Map_start.call(this);
  };

  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update.call(this);
    updateStoryModeErrand();
    updateLegend();
  };

  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    sheet.hide();
    _Scene_Map_terminate.call(this);
  };

  // A load, a new game or a map change re-reads the tooltip variable without
  // arming its priority window, so the sheet opens on whatever the ground says.
  const _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    _Game_Map_setup.call(this, mapId);
    resetTooltipWatch();
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    resetTooltipWatch();
  };

  //===========================================================================
  // Plugin commands and the public face
  //===========================================================================

  PluginManager.registerCommand(PLUGIN_NAME, "refresh", () => {
    sheet.destroy();
    updateLegend();
  });

  PluginManager.registerCommand(PLUGIN_NAME, "setTooltip", (args) => {
    const value = Number(args.value) || 0;
    if ($gameVariables) $gameVariables.setValue(NOTICE_VARIABLE_ID, value);
  });

  window.MapLegend = {
    NOTICE_VARIABLE_ID,
    PAD,
    WALK_CONTROLS,
    WORLD_MAP_CONTROLS,
    WORLD_MAP_LEGEND_MAP_ID,
    PROCEDURAL_CONTROLS,
    PROCEDURAL_MAP_ID,
    MENU_HOTKEY_LABELS,
    menuHotkeyControls,

    // The list: whether it is out, what is on it, and what has been
    // ticked off. Bubba's "controls" topic and the Gameplay options row both
    // go through toggleControls / setControlsShown and nothing else.
    controlsShown,
    setControlsShown,
    toggleControls,

    // The notices, on the same terms, except that they have three states.
    NOTICE_MODES,
    NOTICE_MODE_DEFAULT,
    noticesMode,
    setNoticesMode,
    cycleNoticesMode,
    noticesShown,
    setNoticesShown,
    toggleNotices,
    noticeWatch,
    noticeSeen,
    markNoticeSeen,
    resetNoticesSeen,
    allowedNotice,
    visibleRows,
    rowKeys,
    rowFace,

    // Whether a pad is plugged in, exposed so a test can ask without one in
    // its hands. Which device was last touched is nobody's question any more.
    padConnected,
    TOOLTIP_PRIORITY_FRAMES,
    ERRAND_COMMON_EVENT_ID,
    ERRAND_STEPS,
    updateStoryModeErrand,
    AREAS,
    TOOLTIPS,

    // The resolution the sheet draws, exposed so a test or another plugin can
    // ask what would be shown without a screen to draw it on.
    readNotice,
    noticeHtml,
    ensureRegistry,
    areaNoticeKey,
    tooltipNoticeKey,
    resolveNotice,
    tooltipWatch,
    resetTooltipWatch,
    updateTooltipWatch,

    registerArea(mapId, rect) {
      if (!AREAS[mapId]) AREAS[mapId] = [];
      AREAS[mapId].push(rect);
    },
    registerTooltip(value, key) { TOOLTIPS[value] = key; },

    STORY_MODE_SWITCH_ID,
    LEGEND_SWITCH_ID,
    TUTORIAL_ROOT_MAP_ID,
    storyMode,
    legendEnabled,
    tutorialMap,
    pinnedContext,
    isFolded,
    toggleFold,
    foldable,
    foldPadButton,

    refresh() { sheet.destroy(); updateLegend(); },
    hide() { sheet.hide(); },
  };
})();
