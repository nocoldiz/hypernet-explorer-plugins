/*:
 * @target MZ
 * @plugindesc v2.2.0 The parchment legend pinned to the corner of the map: the controls list, per-map notices, per-area notices and the variable tooltip. Exposes window.MapLegend.
 * @author Hypernet
 *
 * @help MapLegend.js
 *
 * The one sheet of paper the map screen pins in its bottom right corner. It used
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
 * it a frame. It is written for one device at a time: with no pad plugged in
 * every row writes its keys and its mouse out, and with a pad plugged in the
 * sheet is the pad's alone, every row wearing its button and its pad name,
 * and a row no button reaches dropped off the list. The rows run two across.
 *
 * It is not the story mode's and it is not a setting: it hangs on every map,
 * world map and generated ground alike wherever switch 49 is on, and H is the
 * only thing that folds it away or brings it back. With switch 49 off there is
 * no sheet and no fold key: H is the help menu again.
 *
 * The notices beside it are not a setting: a map's tips open in full the first
 * time the party visits it and collapse to their title on every visit after.
 * No option, settings page or Bubba entry turns them off. The very first time
 * a notice is on the paper its text is written out letter by letter, in
 * Bubba's letter voice when Dialogue Voices is on, inside a box already at its
 * final size; leaving the zone stops it, and back there it is drawn whole.
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
 * The notices are displayed only in story mode, written in Bubba's voice. They
 * open the first time the party visits a map; on every visit after they are
 * collapsed to their title and H (L2 on a pad) opens them. That press opens
 * the NOTICE alone: the command list keeps its own fold, so the button that
 * reads a zone never pins the whole sheet up as well. Outside story mode, map
 * tooltips are not displayed.
 *
 * ---------------------------------------------------------------------------
 * What the sheet shows
 * ---------------------------------------------------------------------------
 * One title and one paragraph. Every notice must have a title in the voice it
 * is being read in, because the title is what is left of it once the sheet is
 * folded. A notice that sends the party to a menu names it in square brackets
 * - "use the [Thinker] option in pause menu" - and the sheet draws that name
 * bold, without the brackets. Every translation of a notice must keep the
 * brackets around the same name. A bracket holding an RPG Maker input command
 * in capitals, [MENU], [OK], [PAGEUP] and the rest of COMMANDS, is a button:
 * it is written out as the key on a keyboard ([ESC / RIGHT CLICK]) and as the
 * button on a pad ([Y]), read off Input's live mappers. Translations keep the
 * token in English.
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
 * along: the fold is the list's, not the notices'. On a pad it is L2, on
 * every map alike. The fold line names L2 alone while a pad is plugged in
 * and H alone otherwise, the way every row does. Whether it
 * is folded is remembered on $gameSystem and it starts folded.
 *
 * Folded means two different things depending on where the party stands. In
 * the story mode, on the map the game starts on and on the tutorial map (1414)
 * and every map filed under it in the editor tree (the Icebush pool among
 * them), the sheet is pinned: folded it is a strip carrying the
 * notice title, or the Controls heading, and the fold chip, so the player can
 * always see it is there. Anywhere else a folded sheet is off the screen
 * entirely and the same key brings it up. While the sheet answers to H the
 * help menu does not: it is reached through the pause menu instead.
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

  // One exception to the bold name: a bracket holding an RPG Maker input
  // command in capitals, [MENU] or [OK], is a button, and it is written out as
  // whatever reaches that command on the device in hand: [ESC / RIGHT CLICK] on
  // a keyboard, [Y] on a pad. Every symbol MZ's Input answers to is here.
  function noticeHtml(s, hasPad) {
    const pad = hasPad === undefined ? padConnected() : !!hasPad;
    return escapeHtml(s).replace(NOTICE_EMPHASIS, (whole, inner) => {
      const label = COMMANDS[inner] ? commandLabel(inner, pad) : "";
      return label
        ? `<span class="mlg-strong">[${escapeHtml(label.toUpperCase())}]</span>`
        : `<span class="mlg-strong">${inner}</span>`;
    });
  }

  //===========================================================================
  // [COMMANDS]
  //===========================================================================
  // The token, the Input symbol it stands for, and the mouse button that
  // reaches the same thing. The keys and pad buttons are not written here:
  // they are read off Input.keyMapper and Input.gamepadMapper when the notice
  // is drawn, so a key rebound in the Options reads as its new key. "escape"
  // is what MZ also counts as cancel and menu, so those two read its keys too.
  const COMMANDS = {
    OK:       { symbol: "ok",       mouseKey: "MapLegend.controls.leftClick" },
    CANCEL:   { symbol: "cancel",   mouseKey: "MapLegend.controls.rightClick", escape: true },
    MENU:     { symbol: "menu",     mouseKey: "MapLegend.controls.rightClick", escape: true },
    ESCAPE:   { symbol: "escape",   mouseKey: "MapLegend.controls.rightClick", padFrom: ["menu", "cancel"] },
    SHIFT:    { symbol: "shift" },
    CONTROL:  { symbol: "control" },
    TAB:      { symbol: "tab" },
    PAGEUP:   { symbol: "pageup" },
    PAGEDOWN: { symbol: "pagedown" },
    UP:       { symbol: "up" },
    DOWN:     { symbol: "down" },
    LEFT:     { symbol: "left" },
    RIGHT:    { symbol: "right" },
    DEBUG:    { symbol: "debug" },
  };

  // Physical key and button names: they read the same in every language.
  // i18n-ignore-start  physical key and gamepad button labels
  const KEY_NAMES = {
    8: "Backspace", 9: "Tab", 13: "Enter", 16: "Shift", 17: "Ctrl", 18: "Alt",
    27: "Esc", 32: "Space", 33: "Page Up", 34: "Page Down", 35: "End", 36: "Home",
    37: "←", 38: "↑", 39: "→", 40: "↓", 45: "Insert", 46: "Delete",
    96: "Num 0", 97: "Num 1", 98: "Num 2", 99: "Num 3", 100: "Num 4", 101: "Num 5",
    102: "Num 6", 103: "Num 7", 104: "Num 8", 105: "Num 9",
    112: "F1", 113: "F2", 114: "F3", 115: "F4", 116: "F5", 117: "F6",
    118: "F7", 119: "F8", 120: "F9", 121: "F10", 122: "F11", 123: "F12",
  };
  const PAD_BUTTONS = {
    0: "A", 1: "B", 2: "X", 3: "Y", 4: "L1", 5: "R1", 6: "L2", 7: "R2",
    8: "Select", 9: "Start", 10: "L3", 11: "R3",
    12: "D-Pad ↑", 13: "D-Pad ↓", 14: "D-Pad ←", 15: "D-Pad →",
  };
  // i18n-ignore-end

  // Which key is named first when several reach one command: the dedicated
  // key before the letter or the numpad key that doubles for it.
  const KEY_PREFERENCE = [27, 13, 16, 17, 9, 33, 34, 38, 40, 37, 39, 120, 32];

  function keyName(code) {
    code = Number(code);
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90)) return String.fromCharCode(code);
    return "";
  }

  function codesFor(mapper, symbols) {
    const out = [];
    for (const [code, sym] of Object.entries(mapper || {})) {
      if (symbols.includes(sym)) out.push(Number(code));
    }
    return out;
  }

  function inputMappers() {
    const input = typeof Input !== "undefined" ? Input : null;
    return {
      keys: (input && input.keyMapper) || {},
      pad: (input && input.gamepadMapper) || {},
    };
  }

  // A keyboard reads one key, the first by preference, plus the letter that
  // also reaches it for the four directions (the game walks on WASD), plus
  // the mouse button that does the same.
  function keyboardLabel(token) {
    const cmd = COMMANDS[token];
    if (!cmd) return "";
    const symbols = cmd.escape ? [cmd.symbol, "escape"] : [cmd.symbol];
    const codes = codesFor(inputMappers().keys, symbols).filter(keyName);
    codes.sort((a, b) => {
      const ra = KEY_PREFERENCE.indexOf(a), rb = KEY_PREFERENCE.indexOf(b);
      return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb) || a - b;
    });
    const parts = [];
    if (codes.length) parts.push(keyName(codes[0]));
    if (["up", "down", "left", "right"].includes(cmd.symbol)) {
      const letter = codes.find(c => c >= 65 && c <= 90);
      if (letter && letter !== codes[0]) parts.push(keyName(letter));
    }
    if (cmd.mouseKey) parts.push(T(cmd.mouseKey));
    return parts.join(" / ");
  }

  // A pad reads its button. A command no button reaches (tab, control, debug)
  // falls back to its keyboard face rather than to nothing.
  function padLabel(token) {
    const cmd = COMMANDS[token];
    if (!cmd) return "";
    const symbols = cmd.padFrom || [cmd.symbol];
    const buttons = codesFor(inputMappers().pad, symbols).sort((a, b) => a - b);
    const names = buttons.map(b => PAD_BUTTONS[b]).filter(Boolean);
    return names.length ? names.join(" / ") : keyboardLabel(token);
  }

  function commandLabel(token, hasPad) {
    const pad = hasPad === undefined ? padConnected() : !!hasPad;
    return pad ? padLabel(token) : keyboardLabel(token);
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
    move: "D-Pad",
    ok: "A",
    run: "X",
    menu: "Y",
    hotbarStep: "L1 / R1",
    visitPlace: "Select",
    zoom: "L2 + RS \u2191\u2193",
    pan: "RS",
    quickMenu: "Hold Y",
    wait: "Start",
    vehicles: "L3",
    build: "R3",
    fold: "L2",
    partyCycle: "R2",
  };
  // i18n-ignore-end

  // The rows every map has, whatever map it is. A row with a padLabelKey is
  // not the same control on the two devices, so it shows one face or the other
  // rather than both: see rowFace() below.
  const WALK_CONTROLS = [
    // The four directions are one control, not four rows: the arrows and WASD
    // both walk, and on a pad it is the whole D-Pad (and the stick, which
    // AnalogStickInput feeds into the same symbols).
    { id: "move", labelKey: "MapLegend.controls.move", key: "↑ ↓ ← → / W A S D", pad: PAD.move },
    { id: "ok", labelKey: "MapLegend.controls.action", key: "Z / Enter", mouseKey: "MapLegend.controls.leftClick", pad: PAD.ok },
    { id: "shift", labelKey: "MapLegend.controls.run", keyKey: "MapLegend.controls.holdShift", pad: PAD.run },
    { id: "menu", labelKey: "MapLegend.controls.menu", key: "Esc", pad: PAD.menu },
    {
      id: "hotbar",
      labelKey: "MapLegend.controls.hotbarUse", key: "1 - 9",
      padLabelKey: "MapLegend.controls.hotbarCycle", pad: PAD.hotbarStep,
    },
    // Never named on the sheet on either device, which for the pad meant a
    // control nobody could have found. Tab walks the party forwards and Shift
    // walks it back; the pad has no modifier to spare, so R2 goes forwards and
    // wraps round at the end.
    {
      id: "leadSwap", labelKey: "MapLegend.controls.leadSwap",
      key: "Tab", pad: PAD.partyCycle,
    },
    // The two stick clicks, which the map had nothing on at all. Both are
    // polled raw by UI/CustomMainMenuLayout.js, out of the same HOTKEYS table
    // that owns the keys beside them.
    // The right stick is the camera's pan on every map, which the sheet has
    // never said. Held under L2 on the world map it is the zoom instead
    // (worldZoom below); that is the only place the stick means anything else.
    // Held rather than pressed: the tap each of these already had is untouched
    // (Tab steps the item hotbar, Y opens the menu), and holding either brings
    // up the menu's pockets on one list (UI/QuickMainMenuLayout.js).
    { id: "quickMenu", labelKey: "MapLegend.controls.quickMenu",
      keyKey: "MapLegend.controls.holdTab", pad: PAD.quickMenu },
    { id: "pan", labelKey: "MapLegend.controls.pan",
      mouseKey: "MapLegend.controls.dragMap", pad: PAD.pan },
    { id: "vehicles", labelKey: "MapLegend.controls.vehicles", key: "V", pad: PAD.vehicles },
    { id: "build", labelKey: "MapLegend.controls.build", key: "B", pad: PAD.build },
  ];

  // The world map (315) answers to three controls no other ground does: T /
  // Select stops the journey and walks the party into whatever stands on the
  // square (WorldMapReturn's wmrToggle), R opens the wait sheet, and the
  // wheel, the +/- keys and the triggers pull the camera in and out.
  const WORLD_MAP_LEGEND_MAP_ID = 315;

  const WORLD_MAP_CONTROLS = [
    { id: "visitPlace", labelKey: "MapLegend.controls.stopTravel", key: "T", pad: PAD.visitPlace },
    // Start / R. The Start button on controller opens the sleep wait, mirroring R.
    { id: "wait", labelKey: "MapLegend.controls.wait", key: "R", pad: PAD.wait },
    // L2 HELD, and the right stick pushed forward or back. The trigger is a
    // modifier rather than a zoom of its own: the stick is the camera's pan
    // everywhere, and holding L2 turns it into the camera's zoom for as long as
    // it is down. Let go without touching the stick and the same trigger folds
    // this sheet instead (foldPadButton above), which is the only other thing
    // a tap of it can mean.
    {
      id: "worldZoom", labelKey: "MapLegend.controls.zoom",
      key: "+ / -", mouseKey: "MapLegend.controls.scrollWheel",
      padLabelKey: "MapLegend.controls.zoomHold", pad: PAD.zoom,
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
  // copy that would drift. The NAME each row wears is read the same way, off
  // window.MainMenuVoices, which is the very table the pockets page and the
  // quick menu are built from: a pocket added, renamed or re-iconed over there
  // is a row here on the same save, so a command new to the quick menu can
  // never be missing from this sheet. The table below is only the fallback for
  // a runtime where that list has not been published yet.
  //
  // None of them has a button of its own, but none of them is keyboard-only
  // either: on a pad every one is reached by holding Y and picking it off the
  // quick menu (UI/QuickMainMenuLayout.js), so each row names both faces.
  const MENU_HOTKEY_LABELS = {
    item: "MainMenu.cmd.backpack",
    quest_log: "MainMenu.cmd.questLog",
    cooking: "MainMenu.cmd.cooking",
    skill: "MainMenu.cmd.skills",
    status1: "MainMenu.cmd.status",
    equip: "MainMenu.cmd.equip",
    sleep_menu: "MainMenu.cmd.wait",
    world_map: "MainMenu.cmd.worldMap",
    vehicles: "MainMenu.cmd.vehicles",
    build: "MainMenu.cmd.build",
    help: "MainMenu.cmd.archive",
    training: "MainMenu.cmd.training",
    thinker: "MainMenu.cmd.thinker",
  };

  // symbol -> the i18n key of the name that voice wears on the pockets page.
  function voiceLabelKeys() {
    const voices = window.MainMenuVoices;
    const out = {};
    if (!voices || !voices.list) return out;
    for (const voice of voices.list()) {
      if (voice && voice.symbol && voice.labelKey) out[voice.symbol] = voice.labelKey;
    }
    return out;
  }

  function menuHotkeyControls() {
    const table = window.MenuHotkeys && window.MenuHotkeys.list
      ? window.MenuHotkeys.list() : [];
    const labelKeys = voiceLabelKeys();
    const rows = [];
    for (const hotkey of table) {
      // Menu-only keys (the digits, which are the item hotbar on the field)
      // never fire out here, so the sheet must not advertise them.
      if (hotkey.menuOnly) continue;
      const labelKey = labelKeys[hotkey.symbol] || MENU_HOTKEY_LABELS[hotkey.symbol];
      if (!labelKey) continue;
      const pad = hotkey.symbol === "sleep_menu" ? PAD.wait : PAD.quickMenu;
      rows.push({
        id: "menu_" + hotkey.symbol, labelKey, key: hotkey.key,
        input: hotkey.input, pad,
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
  // Switch 49 is the master gate of the whole sheet: with it off there is no
  // list, no notice and no fold key at all. With it on the list is always
  // there, folded or unfolded, and H is the only thing that moves it.

  function controlsShown() {
    return legendEnabled();
  }

  // The notices are the other half of the sheet. They are not a setting: in
  // the story mode a map's tips open in full the first time the party arrives
  // and fold to their title on every visit after (see updateArrival).

  function noticesShown() {
    return storyMode();
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
    stopTyping();
  }

  // The tip the sheet is allowed to draw under the current setting. A tip
  // already read is still drawn: "first" and "always" differ in whether it
  // opens on arrival (see updateArrival), not in whether it is there to reopen.
  function allowedNotice(notice) {
    if (!storyMode() || !notice) {
      noticeWatch.showing = null;
      return null;
    }
    noticeWatch.showing = notice.key;
    if (markNoticeSeen(notice.key)) {
      if ($gameSystem) $gameSystem._mapLegendNoticeFolded = false;
      startTyping(notice.key);
    }
    return notice;
  }

  //===========================================================================
  // The first reading, letter by letter
  //===========================================================================
  // The first time a notice is ever on the paper its text is written out a
  // letter at a time, chattered in Bubba's voice when the Dialogue Voices
  // option is on. The box is laid out off the finished text from the first
  // letter (the unwritten rest is there but not painted), so it stands at its
  // final size and never grows. Walking out of the zone stops the writing for
  // good: the notice is already marked read, so back on the zone it is drawn
  // whole, with no reading at all.
  const TYPE_LETTERS_PER_FRAME = 1;
  const VOICE_SPEAKER_NAME = "Bubba";   // i18n-ignore: actor name matched by DialogueSystem's cast pitch
  const typing = { key: null, shown: 0, voice: null };

  function startTyping(key) {
    typing.key = key;
    typing.shown = 0;
    typing.voice = null;
  }

  function stopTyping() {
    typing.key = null;
    typing.shown = 0;
    typing.voice = null;
  }

  // The rendered notice, cut into tags and the letters a reader sees, an
  // entity counting as the one letter it draws.
  const HTML_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

  function htmlTokens(html) {
    const tokens = [];
    const re = /<[^>]*>|&[#\w]+;|[\s\S]/g;
    let m;
    while ((m = re.exec(html))) {
      const s = m[0];
      if (s.charAt(0) === "<" && s.length > 1) tokens.push({ tag: true, s });
      else tokens.push({ tag: false, s, ch: s.length > 1 ? (HTML_ENTITIES[s] || " ") : s });
    }
    return tokens;
  }

  function htmlLetters(html) {
    let text = "";
    for (const t of htmlTokens(html)) if (!t.tag) text += t.ch;
    return text;
  }

  // The same markup with only its first `count` letters painted. Every run of
  // the rest is wrapped where it stands, so no tag is ever split open.
  function revealHtml(html, count) {
    if (!(count < Infinity)) return html;
    let out = "";
    let run = "";
    let n = 0;
    const flush = () => {
      if (run) out += '<span class="mlg-unrevealed">' + run + "</span>";
      run = "";
    };
    for (const t of htmlTokens(html)) {
      if (t.tag) { flush(); out += t.s; continue; }
      if (n < count) { out += t.s; n++; } else run += t.s;
    }
    flush();
    return out;
  }

  // One frame of the reading. Returns how many letters of the notice's text
  // are painted, Infinity once it is all there. Folded, the paragraph is not on
  // the paper, so the reading waits for it to be opened.
  function updateTyping(notice, folded, hasPad) {
    if (!notice || notice.key !== typing.key) {
      stopTyping();
      return Infinity;
    }
    if (!notice.text) {
      stopTyping();
      return Infinity;
    }
    const letters = htmlLetters(noticeHtml(notice.text, hasPad));
    if (!folded) {
      const from = typing.shown;
      typing.shown = Math.min(letters.length, typing.shown + TYPE_LETTERS_PER_FRAME);
      speakTyped(letters, from, typing.shown);
    }
    if (typing.shown >= letters.length) {
      stopTyping();
      return Infinity;
    }
    return typing.shown;
  }

  function speakTyped(letters, from, to) {
    const dv = window.DialogueVoice;
    if (!dv || typeof dv.speaker !== "function" || to <= from) return;
    if (!typing.voice) typing.voice = dv.speaker(VOICE_SPEAKER_NAME);
    typing.voice.speakRange(letters, from, to);
  }

  function proceduralMapId() {
    const wmt = window.WorldMapTransfer;
    return (wmt && wmt.procMapId) || PROCEDURAL_MAP_ID;
  }

  // The list for the ground the party is standing on: the walking rows
  // everywhere, the world map's and the generated ground's on top of them, and
  // the menu keys last because they are the same wherever anybody stands.
  // Kept between frames. The sheet is redrawn from this list on every frame the
  // party is walking, and building it meant three fresh arrays plus one fresh
  // object per menu hotkey, every time, to arrive at the same rows. What the
  // list actually depends on is the map underfoot and the hotkey table, and
  // the table is only ever rewritten by patchFoldHotkey below, on Scene_Map
  // start, which is where the cache is dropped.
  let _rowsCache = null;
  let _rowsCacheMapId = null;

  function forgetVisibleRows() {
    _rowsCache = null;
    _rowsCacheMapId = null;
  }

  function visibleRows() {
    if (!controlsShown() || !$gameMap) return [];
    const mapId = $gameMap.mapId();
    if (_rowsCache && _rowsCacheMapId === mapId) return _rowsCache;
    const rows = WALK_CONTROLS.slice();
    if (mapId === WORLD_MAP_LEGEND_MAP_ID) rows.push(...WORLD_MAP_CONTROLS);
    if (mapId === proceduralMapId()) rows.push(...PROCEDURAL_CONTROLS);
    _rowsCache = rows.concat(menuHotkeyControls());
    _rowsCacheMapId = mapId;
    return _rowsCache;
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

  // The label and the key column for one row, written for the device in the
  // player's hands and for that one alone. With a pad plugged in the sheet is
  // the pad's sheet: the keys and the mouse are dropped, and a row that is a
  // different control over there wears that name instead of both.
  function rowFace(entry, hasPad) {
    const pad = hasPad === undefined ? padConnected() : !!hasPad;
    if (pad) {
      return {
        label: entry.padLabelKey ? T(entry.padLabelKey) : T(entry.labelKey),
        keys: "",
        pads: padTokens(entry),
      };
    }
    return { label: T(entry.labelKey), keys: rowKeys(entry), pads: [] };
  }

  // The rows the device in the player's hands actually answers to. On a pad a
  // row no button reaches is not on the list at all.
  function deviceRows(rows, hasPad) {
    const pad = hasPad === undefined ? padConnected() : !!hasPad;
    return pad ? rows.filter((entry) => padTokens(entry).length > 0) : rows;
  }

  //===========================================================================
  // The pad buttons the sheet reads for itself
  //===========================================================================

  // A pad button with no Input.gamepadMapper action on it, read raw the way
  // CustomMainMenuLayout.js reads Start for the sleep wait menu.

  //===========================================================================
  // Notice resolution
  //===========================================================================

  // A registered notice resolved into the two strings the sheet draws. The
  // title is what the sheet keeps when it is folded, so a notice without one
  // is treated as nothing registered at all rather than folding into a blank
  // strip; the paragraph under it is optional.
  // The voice a notice is read in. Bubba's own words while he is walking with
  // the party in the story mode, the place's own sign anywhere else, and the
  // two are separate banks: neither is fallen back on when the other is
  // missing, so a zone only one of them was written for stays silent in the
  // other. See bubbaVoice() below.
  const VOICE_BUBBA = "bubba";       // i18n-ignore: voice name
  const VOICE_GENERIC = "generic";   // i18n-ignore: voice name, and the i18n sub-key

  function currentVoice() {
    return VOICE_BUBBA;
  }

  // A notice is resolved every frame the party stands on its zone, and each
  // resolution was two key builds, two lookups and two translations to arrive
  // at the same two strings. A found notice is therefore kept per key, for as
  // long as the language stays the one it was read in. Only found ones are
  // kept: a key the translations do not hold yet may simply not be loaded yet,
  // and that answer must be allowed to change on a later frame.
  const noticeCache = new Map();
  let noticeCacheLang = null;

  function readNotice(baseKey, voice) {
    if (!baseKey) return null;
    if (voice === VOICE_GENERIC) return null;
    const lang = typeof ConfigManager !== "undefined" && ConfigManager ? ConfigManager.language : null;
    if (lang !== noticeCacheLang) {
      noticeCacheLang = lang;
      noticeCache.clear();
    }
    const held = noticeCache.get(baseKey);
    if (held) return held;
    const stem = baseKey;
    const titleKey = stem + ".title";
    const textKey = stem + ".text";
    if (!has(titleKey)) return null;
    const notice = {
      key: baseKey,
      voice: VOICE_BUBBA,
      title: T(titleKey),
      text: has(textKey) ? T(textKey) : "",
    };
    noticeCache.set(baseKey, notice);
    return notice;
  }

  // The plugin "refresh" command rebuilds the sheet from nothing, and a notice
  // edited in the translations since is meant to come back with it.
  function forgetNotices() {
    noticeCache.clear();
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
  // handler and the world map return all read. Switch 49 is BubbaInParty. The
  // two together decide the voice the notices are read in, not whether there
  // are any: the sheet hangs on every game and only the setting takes it off.

  const STORY_MODE_SWITCH_ID = 100;
  const LEGEND_SWITCH_ID = 49;
  const FOLD_INPUT = "letter_h";     // CustomMainMenuLayout maps H (72) onto it
  const FOLD_KEY_LABEL = "H";        // i18n-ignore  physical key label

  function storyMode() {
    return !!($gameSwitches && $gameSwitches.value(STORY_MODE_SWITCH_ID));
  }

  // Whether the notices are Bubba's.
  function bubbaVoice() {
    return storyMode();
  }

  // The one answer to "is the map legend running at all": switch 49. Nothing
  // else is read for it, story mode and the tutorial maps included, and with
  // it off H goes back to being the help menu everywhere.
  function legendEnabled() {
    return !!($gameSwitches && $gameSwitches.value(LEGEND_SWITCH_ID));
  }

  // The tutorial map and everything filed under it in the editor tree keep
  // the sheet pinned up the way the story mode does, whichever switches are
  // on: the sheet is what teaches those maps.
  const TUTORIAL_ROOT_MAP_ID = 1414;

  // Where the game opened: the sheet stays pinned there too, folded, so a
  // first game can see there is a controls list to unfold at all. It is not
  // the database's start map: a game can open anywhere, a generated square
  // included, so the first map the party ever stood on is remembered on
  // $gameSystem, with its world square when it was a generated one.
  function currentPlace() {
    const mapId = $gameMap ? $gameMap.mapId() : 0;
    if (!mapId) return null;
    let world = null;
    const wt = window.WorldMapTransfer;
    if (wt && typeof wt.currentWorldCoords === "function") {
      try {
        const c = wt.currentWorldCoords();
        if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) world = { x: c.x, y: c.y };
      } catch (err) { world = null; }
    }
    return { mapId, world };
  }

  function rememberStartPlace() {
    if (!$gameSystem || $gameSystem._mapLegendStartPlace) return;
    const place = currentPlace();
    if (place) $gameSystem._mapLegendStartPlace = place;
  }

  // currentPlace asks the world map for its coordinates and builds a fresh
  // object, and one legend frame used to ask it up to three times (the arrival
  // check, then the pinned check). Inside updateLegend the answer is read once
  // and shared; asked from anywhere else it is read live, so nothing outside
  // the frame can see a place the party has already left.
  let framePlaceActive = false;
  let framePlaceRead = false;
  let framePlaceValue = null;

  function framePlace() {
    if (!framePlaceActive) return currentPlace();
    if (!framePlaceRead) {
      framePlaceRead = true;
      framePlaceValue = currentPlace();
    }
    return framePlaceValue;
  }

  function onStartPlace() {
    if (!$gameSystem) return false;
    const start = $gameSystem._mapLegendStartPlace;
    const here = framePlace();
    if (!start || !here || start.mapId !== here.mapId) return false;
    // A generated map is one map id for the whole world, so the square the
    // game opened on is what tells it apart from every other one.
    if (!start.world) return true;
    return !!here.world && here.world.x === start.world.x && here.world.y === start.world.y;
  }

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
    if (storyMode()) return true;
    if (!$gameMap) return false;
    return tutorialMap($gameMap.mapId()) || onStartPlace();
  }

  // Folded is remembered on $gameSystem, so a save reopens the way it was
  // left, and a fresh one opens folded: the strip says the list is there and
  // H unfolds it.
  function isFolded() {
    if (!$gameSystem) return true;
    return $gameSystem._mapLegendFolded !== false;
  }

  // The notice has its own fold, kept apart from the list's. Standing on a
  // zone, the info button opens what the place says and NOTHING else: opening
  // the controls list off the same press would make the button that reads a
  // notice in the story mode the button that pins up the whole command sheet
  // everywhere else. Collapsed, a notice is its title alone; updateArrival
  // below decides which way it stands when the party reaches a map.
  function isNoticeFolded() {
    if (!$gameSystem) return true;
    return $gameSystem._mapLegendNoticeFolded !== false;
  }

  // In the story mode a map's notices open the first time the party arrives
  // on it and are collapsed to their title on every visit after, where H or
  // L2 opens them again. The places
  // are keyed the way the start place is, a generated map by its world
  // square, and the last one arrived on is kept on $gameSystem too, so a
  // menu, a battle or a load coming back to the same map is not an arrival.
  function placeKey(place) {
    if (!place) return "";
    return place.world ? place.mapId + "@" + place.world.x + "," + place.world.y : String(place.mapId);
  }

  function visitedPlaces() {
    if (!$gameSystem) return {};
    if (!$gameSystem._mapLegendVisited) $gameSystem._mapLegendVisited = {};
    return $gameSystem._mapLegendVisited;
  }

  function updateArrival() {
    if (!$gameSystem || !storyMode()) return;
    const key = placeKey(framePlace());
    if (!key || key === $gameSystem._mapLegendLastPlace) return;
    $gameSystem._mapLegendLastPlace = key;
    const visited = visitedPlaces();
    const first = !visited[key];
    visited[key] = true;
    $gameSystem._mapLegendNoticeFolded = !first;
  }

  // Which of the two the fold button is holding right now: the notice while
  // there is one on the paper, the list otherwise. Written by updateLegend.
  let noticeOnScreen = false;

  function toggleFold() {
    if (!$gameSystem) return;
    if (noticeOnScreen) {
      $gameSystem._mapLegendNoticeFolded = !isNoticeFolded();
    } else {
      $gameSystem._mapLegendFolded = !isFolded();
    }
    SoundManager.playCursor();
  }

  // The fold key has a list to bring up only while the sheet is switched on.
  function foldable() {
    return legendEnabled();
  }

  // The pad's fold button: a TAP of L2, on every map including the world map.
  // It was R3, which nothing else wanted but which nobody found either.
  //
  // A trigger is not a button. Held, L2 is the camera pulling back (MousePan),
  // and the only thing that keeps one pull from doing both is the tap window,
  // which is owned in ONE place - the lead switcher in Core/AutoIdleExplorer.js,
  // which already reads both triggers that way for the party cycle on R2. So
  // the tap is not read here at all: that owner calls toggleFold() when it sees
  // one, and this side only says whether there is a fold to be had.
  function foldPadButton() {
    return PAD.fold;
  }

  // Whether a tap of L2 should fold the sheet right now: only with a pad in
  // hand and a legend on screen to fold. Asked by the trigger's owner before it
  // claims the pull, so on a map with no legend the triggers stay whole for the
  // camera.
  function padFoldAvailable() {
    return foldable() && padConnected() && legendEnabled();
  }

  function foldChipLabel() {
    return FOLD_KEY_LABEL;
  }

  // The fold line hangs its pad button off the end of the key the same way
  // every row does, so a player holding a pad reads R3 rather than a key they
  // are not touching. Nothing is drawn while no pad is plugged in.
  function foldPadChip(hasPad) {
    const pad = hasPad === undefined ? padConnected() : !!hasPad;
    return pad ? foldPadButton() : "";
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

  // H, and only H. The pad half of the fold is a TAP of L2 and is read by the
  // one place that owns the trigger tap window (see foldPadButton above), which
  // calls toggleFold() directly. With CustomMainMenuLayout absent there is no
  // help menu to protect, and the key is read here rather than spliced.
  function readFoldKey() {
    if (!foldable()) return;
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

  // Two panels, not one sheet: what the place says stands in the bottom right
  // corner where the party reads it, and the controls list is its own
  // window down the left edge, which is where a list that long can stand
  // without covering the map the notice is about.
  const SHEET_ID = "map-legend";
  const CONTROLS_ID = "map-legend-controls";
  const SHEET_WIDTH = 384;   // game pixels, the widest the notice is drawn
  const SHEET_MIN_WIDTH = 240; // game pixels, the narrowest it is squeezed to
  const SHEET_MARGIN = 16;   // game pixels, from the corner it is pinned to
  const BAR_GAP = 8;         // game pixels kept between the notice and the quick bar
  // The map quick bar (ItemSystemHotbar: nine 52px slots, 6px apart), centred on
  // the bottom edge. Reserved even while it is hidden, so the notice never has
  // to jump sideways the moment the bar comes up.
  const QUICKBAR_WIDTH = 9 * 52 + 8 * 6;

  // How wide the notice may stand in the bottom right corner without reaching
  // the quick bar: the room between the canvas's right margin and the right
  // edge of the widest bar on screen, in game pixels.
  function noticeWidth(m) {
    let barRight = m.cx + (QUICKBAR_WIDTH / 2) * m.sx;
    // A hidden bar measures zero wide, so only the bars on screen count.
    document.querySelectorAll(".hotbar-row").forEach((bar) => {
      const r = bar.getBoundingClientRect();
      if (r.width && r.right > barRight) barRight = r.right;
    });
    const room = (m.right - barRight) / m.sx - SHEET_MARGIN - BAR_GAP;
    return Math.max(SHEET_MIN_WIDTH, Math.min(SHEET_WIDTH, Math.floor(room)));
  }

  function canvasMetrics() {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas || typeof Graphics === "undefined" || !Graphics.width) return null;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { ox: r.left, oy: r.top, right: r.right, cx: (r.left + r.right) / 2,
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

      // The notice, bottom right. Folded it is its title alone, and with nothing
      // to say the panel is off the screen rather than standing empty.
      // A plain string rather than JSON.stringify: this runs every frame the
      // party is walking, and the notice is four fields.
      const noticeFolded = state.noticeFolded === undefined ? folded : !!state.noticeFolded;
      const noticeSig = (notice ? notice.key + "" + notice.title + "" + notice.text : "-") +
        "" + state.reveal + "" + (noticeFolded ? 1 : 0) + (state.foldable ? 1 : 0) + (state.hasPad ? 1 : 0) + "" + (state.foldChip || "");
      if (notice) {
        const el = this.element();
        if (noticeSig !== this._signature) {
          this._signature = noticeSig;
          this._needsPosition = true;
          el.innerHTML = this._noticeHtml(notice, state);
          el.classList.toggle("mlg-folded", noticeFolded);
        }
        this._show(el, "_el");
      } else {
        this._away(this._el);
      }

      // The list, down the left. Folded it is put away whole: the fold
      // line that brings it back rides on whichever panel is still up.
      // The rows only change when the map does, so their ids alone say it.
      // The rows are one kept list per map (visibleRows), so their ids are
      // joined once per list rather than walked again on every frame.
      if (rows !== this._rowsRef) {
        this._rowsRef = rows;
        let ids = "";
        for (const entry of rows) ids += entry.id + "";
        this._rowsIds = ids;
      }
      let ctlSig = this._rowsIds;
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
      // One chip, the one the device in the player's hands wears: with a pad
      // plugged in the trigger is the whole answer and the H chip is not drawn.
      const chip = state.foldPad || state.foldChip || FOLD_KEY_LABEL;
      return '<div class="mlg-fold">' +
        `<span class="ui-chip mlg-chip">${escapeHtml(chip)}</span>` +
        `<span>${escapeHtml(hint)}</span></div>`;
    }

    // Folded, the notice is its title and nothing else, and only the [H] chip
    // says the rest is still there.
    _noticeHtml(notice, state) {
      const nFolded = state.noticeFolded === undefined ? !!state.folded : !!state.noticeFolded;
      const parts = [`<div class="mlg-title">${noticeHtml(notice.title, state.hasPad)}</div>`];
      if (!nFolded && notice.text) {
        // Bubba's reading of the place is signed with his name; the place's
        // own sign is not signed at all, it just says what it says.
        const speaker = notice.voice === VOICE_GENERIC ? "" :
          `<span class="mlg-speaker">${escapeHtml(T("MapLegend.speaker"))}:</span> `;
        // The speaker's name is there from the first frame; the words are
        // written out after it on their first reading (see updateTyping).
        const words = revealHtml(noticeHtml(notice.text, state.hasPad), state.reveal);
        parts.push(`<div class="mlg-text">${speaker}${words}</div>`);
      }
      if (state.foldable) {
        parts.push(this._foldHtml(
          T(nFolded ? "MapLegend.unfoldHint" : "MapLegend.foldHint"), state));
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
      const shown = deviceRows(rows, state.hasPad);
      if (!state.folded && shown.length) {
        parts.push(`<div class="mlg-heading">${escapeHtml(T("MapLegend.controlsHeading"))}</div>`);
        // Two columns: one column of this list runs off the bottom of the
        // screen on the world map. The grid itself belongs to the stylesheet.
        parts.push('<div class="mlg-rows">');
        for (const entry of shown) {
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
        parts.push('</div>');
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

    // The notice is pinned by its bottom right corner, as wide as the room
    // beside the quick bar allows; the list stays pinned by its left edge.
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
      // The notice stands in the bottom right corner, the list off the left
      // edge, both grown up from the floor: the party HUD owns the top left
      // corner and the toasts the top right one.
      const width = noticeWidth(m);
      if (this._el) this._el.style.setProperty("--mlg-width", width + "px");
      for (const el of [this._el, this._ctl]) {
        if (!el) continue;
        el.style.setProperty("--mlg-right", (window.innerWidth - m.right + SHEET_MARGIN * m.sx) + "px");
        el.style.setProperty("--mlg-center", m.cx + "px");
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
    // Switch 49 off is the whole sheet off, notices and list alike.
    if (!legendEnabled()) return false;
    if (!(SceneManager._scene instanceof Scene_Map)) return false;
    if (SceneManager.isSceneChanging && SceneManager.isSceneChanging()) return false;
    if (!$gameMap || !$gamePlayer || !$gameSystem) return false;
    if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive && window.VoxelWorldSystem.isActive()) return false;
    return true;
  }

  function updateLegend() {
    framePlaceActive = true;
    framePlaceRead = false;
    try {
      updateLegendFrame();
    } finally {
      framePlaceActive = false;
      framePlaceValue = null;
    }
  }

  function updateLegendFrame() {
    if (!sheetAllowed()) {
      sheet.hide();
      return;
    }
    updateTooltipWatch();
    updateArrival();
    readFoldKey();
    const notice = noticesShown() ? allowedNotice(resolveNotice()) : null;
    noticeOnScreen = !!notice;
    const folded = isFolded();
    const rows = folded ? [] : visibleRows();
    // Folded, the sheet stays up as a strip only where it is pinned: the
    // story mode and the tutorial maps. Anywhere else folded is off the
    // screen, and the same key brings it back.
    if (folded && !notice && !pinnedContext()) {
      sheet.hide();
      return;
    }
    if (!notice && !rows.length && !(folded && controlsShown())) {
      sheet.hide();
      return;
    }
    // The pad is asked once and the answer handed to both fields that need it.
    const hasPad = padConnected();
    const noticeFolded = isNoticeFolded();
    sheet.draw(notice, rows, {
      folded, noticeFolded, reveal: updateTyping(notice, noticeFolded, hasPad),
      foldable: foldable(), hasPad, foldChip: foldChipLabel(),
      foldPad: foldPadChip(hasPad),
    });
    sheet.setBehindBusts(bustOnScreen());
  }

  // The fold is spliced into the hotkey table as the map starts, which is
  // after every plugin has loaded and before the first frame is updated.
  const _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    rememberStartPlace();
    patchFoldHotkey();
    // patchFoldHotkey has just rewritten the hotkey table, and a new map may
    // want different rows, so the kept list is dropped here and rebuilt on the
    // first frame that asks for it.
    forgetVisibleRows();
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
    forgetNotices();
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

    // The list is always out; nothing switches it but the fold key.
    controlsShown,

    // The notices, on the same terms, except that they have three states.
    noticesShown,
    isNoticeFolded,
    placeKey,
    visitedPlaces,
    updateArrival,
    noticeWatch,
    noticeSeen,
    markNoticeSeen,
    resetNoticesSeen,
    allowedNotice,
    typing,
    startTyping,
    stopTyping,
    updateTyping,
    revealHtml,
    htmlLetters,
    TYPE_LETTERS_PER_FRAME,
    visibleRows,
    rowKeys,
    rowFace,
    deviceRows,

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
    COMMANDS,
    commandLabel,
    keyboardLabel,
    padLabel,
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
    VOICE_BUBBA,
    VOICE_GENERIC,
    TUTORIAL_ROOT_MAP_ID,
    storyMode,
    bubbaVoice,
    currentVoice,
    legendEnabled,
    tutorialMap,
    pinnedContext,
    isFolded,
    toggleFold,
    foldable,
    foldPadButton,
    foldPadChip,
    padFoldAvailable,

    refresh() { forgetNotices(); sheet.destroy(); updateLegend(); },
    hide() { sheet.hide(); },
  };
})();
