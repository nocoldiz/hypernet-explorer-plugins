/*:
 * @target MZ
 * @plugindesc v2.1.0 The parchment legend pinned to the corner of the map: the controls checklist, per-map notices, per-area notices and the variable tooltip. Exposes window.MapLegend.
 * @author Hypernet
 *
 * @help MapLegend.js
 *
 * The one sheet of paper the map screen pins in its top right corner. It used
 * to live inside CharacterCreation.js as a black Window_Base panel listing the
 * story mode's controls; it is its own plugin now and it is drawn as
 * parchment. It carries two things: the notices, and the controls checklist.
 *
 * ---------------------------------------------------------------------------
 * The controls checklist
 * ---------------------------------------------------------------------------
 * Every control the party has on the map, walking rows first and then every
 * key UI/CustomMainMenuLayout.js binds, read out of that plugin's own HOTKEYS
 * table (window.MenuHotkeys) rather than copied here, so a rebinding there
 * moves the list too. A row lights the first time the player actually uses
 * that control, which is what makes it a checklist rather than a card.
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
 * The controls checklist and the H fold do not wait for either: see below.
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
 * along: the fold is the checklist's, not the notices'. On a pad it is L3,
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
 * checklist switched off in the options and no notice to show, H is the help
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
  // The controls checklist
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
  // Which device is in the player's hands
  //===========================================================================
  // Two separate questions, and the sheet asks both. Is a pad plugged in at
  // all, which is what decides whether the pad chips are drawn beside the
  // keys; and what was touched last, which is what decides the face of a row
  // that is a different control on the two devices.

  const deviceWatch = { last: "keyboard" };

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

  // Anything at all being done with the pad: a button, a stick, a trigger. The
  // triggers are read as buttons rather than through AnalogStickInput's analog
  // readings of them, because reading those CLAIMS the triggers for the frame
  // and would take the game-wide scroll poll off them on the map.
  function padTouched() {
    const stick = analogStick();
    if (stick && stick.hasPad) {
      if (!stick.hasPad()) return false;
      if (stick.isActive && stick.isActive()) return true;
      if (stick.isButtonPressed) {
        for (let i = 0; i < 16; i++) if (stick.isButtonPressed(i)) return true;
      }
      return false;
    }
    for (const pad of rawPads()) {
      for (const button of pad.buttons || []) if (button && button.pressed) return true;
      for (const axis of pad.axes || []) if (Math.abs(axis) > 0.5) return true;
    }
    return false;
  }

  // Input says which action was taken, never which device took it. So the pad
  // is asked first: a fresh press with the pad sitting still is a press on the
  // keys. A click on the map counts as the keys too, since the sheet's other
  // face is the one with the mouse written on it.
  function keysTouched() {
    if (typeof TouchInput !== "undefined" && TouchInput.isTriggered && TouchInput.isTriggered()) {
      return true;
    }
    return !!(Input._latestButton && Input._pressedTime === 0);
  }

  function updateDeviceWatch() {
    if (padTouched()) deviceWatch.last = "pad";
    else if (keysTouched()) deviceWatch.last = "keyboard";
  }

  // The pad only speaks for the sheet while it is still plugged in: unplugging
  // one hands the rows back to the keys rather than leaving them on buttons
  // that are no longer there.
  function padMode() {
    return deviceWatch.last === "pad" && padConnected();
  }

  //===========================================================================
  // Whether the checklist is up, and what is on it
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
  // the checklist stays pinned up and the other way round. It is not a switch
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

  // A row that only the keys can reach is not shown to a player on a pad.
  function rowsFor(entries) {
    return padMode() ? entries.filter((entry) => !entry.keyboardOnly) : entries;
  }

  // The list for the ground the party is standing on: the walking rows
  // everywhere, the world map's and the generated ground's on top of them, and
  // the menu keys last because they are the same wherever anybody stands.
  function visibleRows() {
    if (!controlsShown() || !$gameMap) return [];
    const rows = rowsFor(WALK_CONTROLS);
    if ($gameMap.mapId() === WORLD_MAP_LEGEND_MAP_ID) rows.push(...rowsFor(WORLD_MAP_CONTROLS));
    if ($gameMap.mapId() === proceduralMapId()) rows.push(...rowsFor(PROCEDURAL_CONTROLS));
    return rows.concat(rowsFor(menuHotkeyControls()));
  }

  // Which rows have been used at least once. One record on $gameSystem, so a
  // save reopens with the same ticks on the paper.
  function litRecord() {
    return ($gameSystem && $gameSystem._mapLegendControlsLit) || {};
  }

  function markLit(id) {
    if (!$gameSystem) return false;
    const lit = litRecord();
    if (lit[id]) return false;
    lit[id] = true;
    $gameSystem._mapLegendControlsLit = lit;
    return true;
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

  // The label and the two key columns for one row. A row that is a different
  // control on the two devices (the item bar: fired by number key, stepped by
  // shoulder) shows one face or the other; every other row writes its keys out
  // and hangs the pad chips off the end of them, while a pad is plugged in.
  // On a pad the sheet is the pad's alone: every row is its buttons and
  // nothing of the keys or the mouse is written beside them.
  function rowFace(entry) {
    const pad = padMode();
    if (entry.padLabelKey) {
      return pad
        ? { label: T(entry.padLabelKey), keys: "", pads: padTokens(entry) }
        : { label: T(entry.labelKey), keys: rowKeys(entry), pads: [] };
    }
    if (pad) return { label: T(entry.labelKey), keys: "", pads: padTokens(entry) };
    return {
      label: T(entry.labelKey),
      keys: rowKeys(entry),
      pads: padConnected() ? padTokens(entry) : [],
    };
  }

  //===========================================================================
  // Reading the controls as they are used
  //===========================================================================

  // The camera zoom is not a button press: the wheel, the +/- keys and the
  // triggers all end up moving Game_Screen's scale, so the sheet watches the
  // scale itself.
  let lastLegendZoom = null;

  function zoomControlUsed() {
    const zoom = $gameScreen ? $gameScreen.zoomScale() : 1;
    const moved = lastLegendZoom !== null && Math.abs(zoom - lastLegendZoom) > 0.0005;
    lastLegendZoom = zoom;
    if (moved) return true;
    return !!(Input.isRepeated("mapZoomIn") || Input.isRepeated("mapZoomOut") ||
      Input.isRepeated("zoomIn") || Input.isRepeated("zoomOut"));
  }

  // The number row fires an item bar slot outright (ItemSystemHotbar.js maps
  // 1-9 onto the symbols "1".."9"), so any of them counts as the bar being
  // used.
  function hotbarSlotKeyTriggered() {
    for (let i = 1; i <= 9; i++) if (Input.isTriggered(String(i))) return true;
    return false;
  }

  // A pad button with no Input.gamepadMapper action on it, read raw the way
  // WorldMap.js reads Start.
  function padButtonTriggered(name) {
    const stick = analogStick();
    if (!stick || !stick.isButtonTriggered || !stick.BUTTON) return false;
    const index = stick.BUTTON[name];
    return index === undefined ? false : !!stick.isButtonTriggered(index);
  }

  function readControlUse() {
    if (!controlsShown() || !$gameMap) return;
    if (Input.isTriggered("up")) markLit("up");
    if (Input.isTriggered("down")) markLit("down");
    if (Input.isTriggered("left")) markLit("left");
    if (Input.isTriggered("right")) markLit("right");
    if (Input.isTriggered("ok") || TouchInput.isTriggered()) markLit("ok");
    // Esc reaches the pause menu through Scene_Map.callMenu, which pushes the
    // menu scene on the very frame it is pressed: by the time the sheet is
    // updated the scene is already changing and the press is gone. So the row
    // is lit from the call itself (see below) rather than from the key, and
    // these two only cover a pad or a rebind that opened nothing.
    if (Input.isTriggered("escape") || Input.isTriggered("menu") ||
      TouchInput.isCancelled()) markLit("menu");
    if (Input.isPressed("shift")) markLit("shift");
    // The item bar row is satisfied by either face of it: a number key firing
    // a slot, or a shoulder stepping the bar.
    if (Input.isTriggered("pageup") || Input.isTriggered("pagedown") ||
      Input.isTriggered("tab") || hotbarSlotKeyTriggered()) markLit("hotbar");

    if ($gameMap.mapId() === proceduralMapId()) {
      // The action button is what works whatever the party is facing, and it
      // is the same press whether that ends in a choice window or in nothing.
      if (Input.isTriggered("ok") || TouchInput.isTriggered()) markLit("procInteract");
      if (Input.isTriggered("wmrToggle")) markLit("procReturn");
    }

    if ($gameMap.mapId() === WORLD_MAP_LEGEND_MAP_ID) {
      if (Input.isTriggered("wmrToggle")) markLit("visitPlace");
      // R is CustomMainMenuLayout's sleep_menu hotkey; the wait sheet it opens
      // is a popup rather than a scene, so the press is still readable here.
      if (Input.isTriggered("letter_r") || padButtonTriggered("L3") ||
        (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._sleepMenuOpen)) {
        markLit("wait");
      }
      if (zoomControlUsed()) markLit("worldZoom");
    } else {
      lastLegendZoom = null;
    }
  }

  // A menu key opens its screen on the very frame it is read, so by the time
  // the sheet is next updated the map is already changing and the press is
  // gone: the same reason the Menu row is lit from callMenu rather than from
  // Esc. So they are read one step before whatever they open, inside the
  // hotkey table itself, and on the symbols that table gives them, so a
  // rebinding still lights the row.
  function readMenuHotkeyUse() {
    if (!controlsShown()) return;
    for (const row of menuHotkeyControls()) {
      if (row.input && Input.isTriggered(row.input)) markLit(row.id);
    }
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
  // left, and a fresh one opens folded: the sheet is asked for, not imposed.
  function isFolded() {
    if (!$gameSystem) return true;
    return $gameSystem._mapLegendFolded !== false;
  }

  function toggleFold() {
    if (!$gameSystem) return;
    $gameSystem._mapLegendFolded = !isFolded();
    SoundManager.playCursor();
  }

  // Whether there is anything at all for the fold key to bring up: with the
  // checklist switched off and no notice running, the key is left alone.
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
    return padMode() ? foldPadButton() : FOLD_KEY_LABEL;
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
      // One step before whatever the key opens, which is the last frame the
      // press is still readable.
      readMenuHotkeyUse();
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

  const SHEET_ID = "map-legend";
  const SHEET_WIDTH = 336;   // game pixels
  const SHEET_MARGIN = 16;   // game pixels, from the top right corner

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
      this._signature = "";
    }

    element() {
      if (this._el && document.body.contains(this._el)) return this._el;
      // The page survives Title <-> Map transitions, so a sheet left behind by
      // a previous run is purged rather than layered under a new one.
      document.querySelectorAll("#" + SHEET_ID).forEach((e) => e.remove());
      const el = document.createElement("div");
      el.id = SHEET_ID;
      document.body.appendChild(el);
      this._el = el;
      this._signature = "";
      return el;
    }

    hide() {
      if (!this._el) return;
      this._el.classList.remove("mlg-shown");
      this._el.classList.add("mlg-away");
    }

    destroy() {
      if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
      this._el = null;
      this._signature = "";
    }

    // The sheet is rebuilt only when what it says changes, so a walking party
    // costs one string compare a frame.
    draw(notice, rows, state) {
      const el = this.element();
      const lit = litRecord();
      const folded = !!state.folded;
      // The device is part of the signature: plugging a pad in, or reaching
      // for the keys again, changes what the rows say and has to redraw them.
      const signature = JSON.stringify([
        notice ? [notice.key, notice.title, notice.text] : null,
        rows.map((entry) => [entry.id, !!lit[entry.id]]),
        folded, !!state.foldable, !!state.padMode, state.foldChip,
      ]);
      if (signature !== this._signature) {
        this._signature = signature;
        el.innerHTML = this._html(notice, rows, lit, state);
        el.classList.toggle("mlg-folded", folded);
      }
      el.classList.remove("mlg-away");
      this.position();
      // Fading in on the frame after the sheet is attached, so the first
      // notice of a map arrives rather than snapping into place.
      if (!el.classList.contains("mlg-shown")) {
        requestAnimationFrame(() => {
          if (this._el === el) el.classList.add("mlg-shown");
        });
      }
    }

    // Folded, the sheet is its title and nothing else: the paragraph and the
    // controls checklist are both put away, and only the [H] chip says they
    // are still there.
    _html(notice, rows, lit, state) {
      const parts = [];
      // A sheet folded over nothing but the checklist says everything it has
      // to say on the fold line itself, so it grows no title of its own.
      const bareFold = !notice && !!state.folded;
      if (notice) parts.push(`<div class="mlg-title">${noticeHtml(notice.title)}</div>`);
      if (!state.folded) {
        if (notice && notice.text) {
          // The notices are Bubba reading the place to the party, so the
          // paragraph is signed with his name rather than written as a sign.
          parts.push(`<div class="mlg-text">` +
            `<span class="mlg-speaker">${escapeHtml(T("MapLegend.speaker"))}:</span> ` +
            `${noticeHtml(notice.text)}</div>`);
        }
        if (rows.length) {
          if (parts.length) parts.push('<div class="mlg-rule"></div>');
          parts.push(`<div class="mlg-heading">${escapeHtml(T("MapLegend.controlsHeading"))}</div>`);
          for (const entry of rows) {
            const cls = lit[entry.id] ? "mlg-row mlg-lit" : "mlg-row";
            const face = rowFace(entry);
            const binds = [];
            if (face.keys) binds.push(`<span class="mlg-keys">${escapeHtml(face.keys)}</span>`);
            for (const token of face.pads) {
              binds.push(`<span class="ui-chip mlg-chip">${escapeHtml(token)}</span>`);
            }
            parts.push(
              `<div class="${cls}">` +
              `<span class="mlg-label">${escapeHtml(face.label)}</span>` +
              `<span class="mlg-binds">${binds.join("")}</span>` +
              `</div>`
            );
          }
        }
      }
      if (state.foldable) {
        const hint = bareFold
          ? T("MapLegend.controlsHeading")
          : T(state.folded ? "MapLegend.unfoldHint" : "MapLegend.foldHint");
        parts.push('<div class="mlg-fold">' +
          `<span class="ui-chip mlg-chip">${escapeHtml(state.foldChip || FOLD_KEY_LABEL)}</span>` +
          `<span>${escapeHtml(hint)}</span></div>`);
      }
      return parts.join("");
    }

    // Pinned by its right edge rather than its left, so a folded sheet no
    // wider than its own title still sits in the corner instead of floating
    // in from it.
    // Where the canvas actually sits on the page is measured, not styled, so
    // the four numbers are handed to the stylesheet as custom properties and
    // the rule in theme.css does the drawing.
    position() {
      const el = this._el;
      const m = canvasMetrics();
      if (!el || !m) return;
      el.style.setProperty("--mlg-right", (window.innerWidth - m.right + SHEET_MARGIN * m.sx) + "px");
      el.style.setProperty("--mlg-top", (m.oy + SHEET_MARGIN * m.sy) + "px");
      el.style.setProperty("--mlg-sx", m.sx);
      el.style.setProperty("--mlg-sy", m.sy);
    }
  }

  const sheet = new LegendSheet();

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
    // The notices are the story mode's; the checklist is nobody's, so either
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
    updateDeviceWatch();
    readControlUse();
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
      folded, foldable: foldable(), padMode: padMode(), foldChip: foldChipLabel(),
    });
  }

  // The fold is spliced into the hotkey table as the map starts, which is
  // after every plugin has loaded and before the first frame is updated.
  const _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    patchFoldHotkey();
    _Scene_Map_start.call(this);
  };

  // The Menu row is lit by the menu actually opening rather than by the key
  // that opened it: Esc, the pad's Y, a right click and CustomMainMenuLayout's
  // own hotkey table all end up here, and none of them are still readable on
  // the frame the sheet is next updated.
  const _Scene_Map_callMenu = Scene_Map.prototype.callMenu;
  Scene_Map.prototype.callMenu = function () {
    if (controlsShown()) markLit("menu");
    _Scene_Map_callMenu.call(this);
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

    // The checklist: whether it is out, what is on it, and what has been
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
    litRecord,
    markLit,
    rowKeys,
    rowFace,
    rowsFor,
    readControlUse,
    readMenuHotkeyUse,

    // Which device the rows are speaking to, exposed so a test can ask
    // without a pad in its hands.
    deviceWatch,
    padConnected,
    padMode,
    updateDeviceWatch,
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
