/*:
 * @target MZ
 * @plugindesc v1.0.0 Parchment DOM popup for the TimeDateSystem sleep menu.
 * @author Hypernet
 * @help
 * === TimeDateSystem UI v1.0.0 ===
 *
 * UI layer for the TimeDateSystem.js sleep menu. Replaces the old
 * Window_SleepMenu (native Window_Command) with a parchment army-dialog
 * popup following the unified D&D pockets design language.
 *
 * Defines on Scene_Map:
 *   openSleepMenu(mode, opts) - "main" (default), "sleep", "wait", "post_sleep"
 *   openWaitMenu()           - the wait list, with a rough sleep offered
 *   openCryogenicSleepMenu() - opens directly to cryo year selection
 *   closeSleepMenu(keepBlocking)
 *   execSleepMenuCommand(key)
 *   cancelSleepMenu()
 *
 * How well the party rests is an entry-point decision. Beds, campfires, tents
 * and world-map camps open the menu as a rest ("main"), where Sleep refills
 * the sleep meter in full whatever wake-up hour is picked. The menu tile and
 * the R hotkey open openWaitMenu(), which passes the clock and may also lie
 * down where it stands: a rough sleep, worth only part of a night
 * (ROUGH_REST_FACTOR in TimeDateSystem.js). Bedding in the packs (any item
 * tagged <FullSleep>) lifts that penalty, since it is a bed wherever it is
 * unrolled. Neither list runs past MAX_REST_HOURS.
 *
 * Must be placed AFTER Core/TimeDateSystem in the plugin manager.
 * Requires css/theme.css (.army-dialog-overlay / .army-dialog /
 * .army-dialog-options / .army-dialog-btn--row).
 */

(function () {
  "use strict";

  if (!window.TimeDateSystem || !window.TimeDateSystem.sleepMenuI18n) {
    throw new Error("TimeDateSystemUI.js requires TimeDateSystem.js!");
  }


  // While Em travels with the party the rest menu picks up her vocabulary
  // (CharacterCreationPresets.emLabel): nobody rests, they nap, and nobody
  // waits, they waste time. Every other playthrough gets the table unchanged,
  // since each label is passed in as its own fallback.
  function sleepLabels() {
    const base = window.TimeDateSystem.sleepMenuI18n;
    const CP = window.CharacterPresets;
    if (!CP || !CP.emLabel || !CP.isEmPlaythrough || !CP.isEmPlaythrough()) return base;
    return Object.assign({}, base, {
      titleMain:  CP.emLabel("restTitle",    base.titleMain),
      titleSleep: CP.emLabel("sleepHowLong", base.titleSleep),
      titleWait:  CP.emLabel("waitHowLong",  base.titleWait),
      sleep:      CP.emLabel("sleep",        base.sleep),
      wait:       CP.emLabel("wait",         base.wait),
      wakeup:     CP.emLabel("wakeup",       base.wakeup),
      dream:      CP.emLabel("dream",        base.dream),
    });
  }

  // Where the party rests is decided by the entry point, not by proximity: a
  // bed, a campfire, a tent or a world-map camp opens the menu as a proper
  // rest (mode "main"), while the menu tile and the R hotkey open the wait
  // list, which may also lie down where it stands - a rough sleep, worth only
  // part of a night (see ROUGH_REST_FACTOR in TimeDateSystem.js).
  function sleepAllowedFor(scene) {
    return !!(scene && scene._sleepMenuAllowSleep);
  }

  // Bedding in the packs (any item tagged <FullSleep>) is a bed wherever it is
  // unrolled, so the wait menu's sleep stops being a rough one.
  function beddingItem() {
    const TDS = window.TimeDateSystem;
    return TDS && TDS.getPartyBedding ? TDS.getPartyBedding() : null;
  }

  // The raw field says the entry point offered a rough sleep; this says the
  // party will actually get one, which the packs have the last word on.
  function roughRestFor(scene) {
    if (!scene || !scene._sleepMenuRoughRest) return false;
    const TDS = window.TimeDateSystem;
    return TDS && TDS.isRoughRest ? TDS.isRoughRest(true) : !beddingItem();
  }

  function roughFactorPercent() {
    const f = window.TimeDateSystem && window.TimeDateSystem.ROUGH_REST_FACTOR;
    return Math.round((f > 0 ? f : 0.5) * 100);
  }

  // Duration label for a possibly fractional hour count (0.5 -> "30 Minutes").
  function durationLabel(t, h) {
    if (h === 0.5) return t.halfHour;
    if (h === 1) return t.hourWait;
    return t.hours.format(h);
  }

  // Clock time the player will wake up at after sleeping/waiting `h` hours,
  // shown to the right of the duration so the choice reads "2 Hours -> 14:00".
  function wakeTimeLabel(h) {
    const TDS = window.TimeDateSystem;
    if (!TDS || !TDS.getGameTimeMinutes || !TDS.getDateTimeFromMinutes) return "";
    const mins = TDS.getGameTimeMinutes() + Math.round(h * 60);
    const dt = TDS.getDateTimeFromMinutes(mins);
    return dt && dt.time24 ? dt.time24 : "";
  }

  // Both Sleep and Wait share the same duration range: a half-hour nap up to
  // the half-day cap TimeDateSystem sets (MAX_REST_HOURS), at every hour mark.
  function maxRestHours() {
    const h = window.TimeDateSystem && window.TimeDateSystem.MAX_REST_HOURS;
    return h > 0 ? h : 12;
  }

  function restHours() {
    return [0.5].concat(Array.from({ length: maxRestHours() }, (_, i) => i + 1));
  }

  function commandsForMode(mode, allowSleep) {
    const t = sleepLabels();
    if (mode === "sleep") {
      const cmds = restHours().map((h) => ({
        key: "hours_" + h,
        label: durationLabel(t, h),
        rightLabel: wakeTimeLabel(h),
      }));
      cmds.push({ key: "cancel_sleep", label: t.cancel });
      return cmds;
    }
    // Bethesda-style waiting: available anywhere (R on the map), passes the
    // clock without resting the party, so it never refills the sleep meter.
    if (mode === "wait") {
      const cmds = restHours().map((h) => ({
        key: "wait_" + h,
        label: durationLabel(t, h),
        rightLabel: wakeTimeLabel(h),
      }));
      cmds.push({ key: "cancel_wait", label: t.cancel });
      return cmds;
    }
    // Only shown after a long sleep that rolled a dream (see TimeDateSystem's
    // _finishSleepAdvance): take the dream, or cancel it and just wake up.
    if (mode === "post_sleep") {
      return [
        { key: "dream", label: t.dream },
        { key: "wakeup", label: t.cancel },
      ];
    }
    // The pod picks a date rather than a year, so its buttons are only the two
    // that close the dialog; the calendar itself is a spinner row above them
    // (see _cryoPickerHTML).
    if (mode === "cryo") {
      const cmds = [];
      if (cryoRange()) cmds.push({ key: "cryo_confirm", label: t.cryoConfirm });
      cmds.push({ key: "cancel_sleep", label: t.cancel });
      return cmds;
    }
    // Main menu: the wait/sleep choice that fronts both duration lists
    // (cryogenic sleep has its own command). Sleeping needs a place to rest,
    // waiting is always allowed.
    const mainCommands = [];
    if (allowSleep) mainCommands.push({ key: "sleep", label: t.sleep });
    mainCommands.push({ key: "wait", label: t.wait });
    mainCommands.push({ key: "save", label: t.save });
    // Hardcore (Permadeath) and Blood and Oil use terminal death, so there is
    // no respawn point to set; hide the option in those modes (Switch 9).
    if (!(window.$gameSwitches && $gameSwitches.value(9))) {
      mainCommands.push({ key: "respawn", label: t.respawn });
    }
    mainCommands.push({ key: "cancel", label: t.cancel });
    return mainCommands;
  }

  //=============================================================================
  // The cryogenic pod: date picker helpers
  //=============================================================================

  const CRYO_FIELDS = ["day", "month", "year"];

  function TDS() {
    return window.TimeDateSystem || {};
  }

  function cryoRange() {
    const api = TDS();
    return api.getCryoDateRange ? api.getCryoDateRange() : null;
  }

  function cryoMonthNames() {
    const names = window.T ? window.T.list("TimeDate.months") : [];
    return names && names.length === 12 ? names : [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
  }

  function cryoDayStamp(parts) {
    const api = TDS();
    return api.getCryoDayStamp
      ? api.getCryoDayStamp(parts.year, parts.month, parts.day)
      : Math.round(Date.UTC(parts.year, parts.month, parts.day) / 86400000);
  }

  function cryoDaysInMonth(year, month) {
    const api = TDS();
    return api.getCryoDaysInMonth
      ? api.getCryoDaysInMonth(year, month)
      : new Date(year, month + 1, 0).getDate();
  }

  // Pulls a picked date back inside the window the pod will accept. The day is
  // clamped to the real length of its month first (so stepping off 31 January
  // into February, or off 29 February in a year that has no 29th, lands on a
  // date that exists), then the whole date to the range's ends.
  function clampCryoDate(parts, range) {
    const out = {
      year: parts.year,
      month: Math.max(0, Math.min(11, parts.month)),
      day: parts.day,
    };
    out.day = Math.max(1, Math.min(cryoDaysInMonth(out.year, out.month), out.day));
    const stamp = cryoDayStamp(out);
    if (stamp < cryoDayStamp(range.min)) return Object.assign({}, range.min);
    if (stamp > cryoDayStamp(range.max)) return Object.assign({}, range.max);
    return out;
  }

  // "4 days", "1 year, 2 months, 3 days": the span written out in the units it
  // is actually long in, so a short freeze never reads as "0 years".
  function cryoSpanLabel(fromParts, toParts) {
    const t = sleepLabels();
    let years = toParts.year - fromParts.year;
    let months = toParts.month - fromParts.month;
    let days = toParts.day - fromParts.day;
    if (days < 0) {
      months--;
      const prevMonth = (toParts.month + 11) % 12;
      const prevYear = toParts.month === 0 ? toParts.year - 1 : toParts.year;
      days += cryoDaysInMonth(prevYear, prevMonth);
    }
    if (months < 0) { years--; months += 12; }
    const parts = [];
    if (years > 0) parts.push((years === 1 ? t.cryoSpanYear : t.cryoSpanYears).format(years));
    if (months > 0) parts.push((months === 1 ? t.cryoSpanMonth : t.cryoSpanMonths).format(months));
    if (days > 0) parts.push((days === 1 ? t.cryoSpanDay : t.cryoSpanDays).format(days));
    return parts.length ? parts.join(", ") : t.cryoSpanDays.format(0);
  }

  // Money is euros everywhere in this game, and euros are gold / 100.
  function cryoEuros(gold) {
    return "€" + (Math.max(0, Math.round(gold)) / 100).toFixed(2);
  }

  // RMMZ swallows every wheel event at the document level (rmmz_core.js,
  // TouchInput._onWheel calls preventDefault), so the duration list never
  // scrolls on its own and the scrollbar can only be dragged. The overlay
  // handles the wheel itself instead; it is bound once per overlay and looks
  // the pane up live, since the dialog's innerHTML is rebuilt on every refresh.
  function bindSleepMenuWheel(el) {
    if (!el || el._sleepMenuWheelBound) return;
    el._sleepMenuWheelBound = true;
    el.addEventListener(
      "wheel",
      (e) => {
        const pane = el.querySelector(".army-dialog-options--scroll");
        if (!pane) return;
        e.preventDefault();
        // Wheel deltas arrive in pixels, lines or pages depending on the device.
        const step = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
        pane.scrollTop += e.deltaY * step;
      },
      { passive: false }
    );
  }

  function titleForMode(mode, scene) {
    const t = sleepLabels();
    // A pitched camp says so at the top of the menu: the rows underneath are
    // the same ones a bed offers, and only the header tells the party where
    // they are about to spend the night (window.CampRest).
    const camping = !!(window.CampRest && window.CampRest.isPitched());
    if (camping && (mode === "main" || mode === "sleep")) {
      return mode === "main" ? t.titleCamp : t.titleCampSleep;
    }
    // Lying down where the party stands is its own header, so a rough sleep is
    // never mistaken for the full night a bed offers.
    if (mode === "sleep") return roughRestFor(scene) ? t.titleRoughSleep : t.titleSleep;
    if (mode === "wait") return t.titleWait;
    if (mode === "post_sleep") return t.titlePostSleep;
    if (mode === "cryo") return t.titleCryo;
    return t.titleMain;
  }

  //=============================================================================
  // SleepMenuInputManager
  //=============================================================================

  // Hover may only steer the selection while the mouse is the thing actually
  // being moved. This menu is a DOM dialog in the middle of the screen, so on a
  // pad the pointer sits wherever it was left -- very often right on the option
  // list. Every up/down scrolls the list under that stationary pointer (see the
  // scrollIntoView in _updateSleepMenuHighlight) and every mode change rebuilds
  // it; both move a DIFFERENT button under the pointer, which fires mouseenter,
  // and the hover handler used to snap the selection to it. That is why the
  // cursor sprang back to the first option on every press and OK then ran the
  // wrong command. PointerSteering (Core/AnalogStickInput.js) is the shared
  // answer; the same guard is on every other hover-selects menu.
  const steering = () => !window.PointerSteering || window.PointerSteering.isSteering();

  const SleepMenuInputManager = {
    _scene: null,
    _active: false,
    _openedFrame: 0,
    _wasdInput: { up: false, down: false },
    _wasdHeld: { up: false, down: false },
    _wasdHoldFrames: { up: 0, down: 0 },
    // A/D are a one-shot Sleep<->Wait toggle, not a held-repeat scrub, so
    // they only need a simple "was pressed this frame" flag.
    _adInput: { left: false, right: false },
    _keydownListener: null,
    _keyupListener: null,

    activate(scene) {
      this._scene = scene;
      this._active = true;
      this._openedFrame = Graphics.frameCount;
      this._wasdInput.up = this._wasdInput.down = false;
      this._wasdHeld.up = this._wasdHeld.down = false;
      this._wasdHoldFrames.up = this._wasdHoldFrames.down = 0;
      this._adInput.left = this._adInput.right = false;
      if (!this._keydownListener) {
        this._keydownListener = (event) => {
          if (event.repeat) return;
          const key = event.key.toLowerCase();
          if (key === "w") { this._wasdInput.up = true; this._wasdHeld.up = true; event.preventDefault(); }
          if (key === "s") { this._wasdInput.down = true; this._wasdHeld.down = true; event.preventDefault(); }
          if (key === "a") { this._adInput.left = true; event.preventDefault(); }
          if (key === "d") { this._adInput.right = true; event.preventDefault(); }
        };
        this._keyupListener = (event) => {
          const key = event.key.toLowerCase();
          if (key === "w") { this._wasdHeld.up = false; this._wasdHoldFrames.up = 0; }
          if (key === "s") { this._wasdHeld.down = false; this._wasdHoldFrames.down = 0; }
        };
        window.addEventListener("keydown", this._keydownListener);
        window.addEventListener("keyup", this._keyupListener);
      }
      // Opened by a key or a button, so the pointer is not steering yet.
      if (window.PointerSteering) window.PointerSteering.release();
    },

    deactivate() {
      this._active = false;
      this._scene = null;
      if (this._keydownListener) {
        window.removeEventListener("keydown", this._keydownListener);
        window.removeEventListener("keyup", this._keyupListener);
        this._keydownListener = null;
        this._keyupListener = null;
      }
    },

    update() {
      if (!this._active || !this._scene) return;
      const scene = this._scene;
      if (!scene._sleepMenuEl) return;
      // Swallow the key press that opened the menu
      if (Graphics.frameCount - this._openedFrame < 4) return;

      // WASD hold-repeat simulation (matches MZ key-repeat timing)
      for (const dir of ["up", "down"]) {
        if (this._wasdHeld[dir]) {
          this._wasdHoldFrames[dir]++;
          const held = this._wasdHoldFrames[dir];
          if (held > Input.keyRepeatWait && (held - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
            this._wasdInput[dir] = true;
          }
        } else {
          this._wasdHoldFrames[dir] = 0;
        }
      }

      const isUp = Input.isRepeated("up") || this._wasdInput.up;
      const isDown = Input.isRepeated("down") || this._wasdInput.down;
      this._wasdInput.up = this._wasdInput.down = false;

      // Left/Right (arrow keys, A/D, or a gamepad d-pad/stick, all of which
      // RPG Maker's Input class already maps to "left"/"right") flips the
      // Sleep <-> Wait selector while a duration list is open.
      const isLeft = Input.isTriggered("left") || this._adInput.left;
      const isRight = Input.isTriggered("right") || this._adInput.right;
      this._adInput.left = this._adInput.right = false;
      if (
        (isLeft || isRight) &&
        (scene._sleepMenuMode === "sleep" || scene._sleepMenuMode === "wait")
      ) {
        scene._toggleSleepMenuType();
        return;
      }

      // The pod's calendar is a spinner row, not a list: left/right walk the
      // day/month/year fields and up/down step the one under the cursor, while
      // OK and Cancel keep doing what they do everywhere else in this menu.
      if (scene._sleepMenuMode === "cryo" && cryoRange()) {
        if (isLeft) { scene._moveCryoField(-1); return; }
        if (isRight) { scene._moveCryoField(1); return; }
        if (isUp) { scene._adjustCryoField(1); return; }
        if (isDown) { scene._adjustCryoField(-1); return; }
        if (Input.isTriggered("ok")) { scene.execSleepMenuCommand("cryo_confirm"); return; }
        if (Input.isTriggered("escape") || Input.isTriggered("cancel") || TouchInput.isCancelled()) {
          scene.cancelSleepMenu();
        }
        return;
      }

      const cmds = commandsForMode(scene._sleepMenuMode, sleepAllowedFor(scene));
      const total = cmds.length;
      if (isUp) {
        scene._sleepMenuIndex = (scene._sleepMenuIndex - 1 + total) % total;
        SoundManager.playCursor();
        scene._updateSleepMenuHighlight(true);
        return;
      }
      if (isDown) {
        scene._sleepMenuIndex = (scene._sleepMenuIndex + 1) % total;
        SoundManager.playCursor();
        scene._updateSleepMenuHighlight(true);
        return;
      }
      if (Input.isTriggered("ok")) {
        const cmd = cmds[scene._sleepMenuIndex];
        if (cmd) scene.execSleepMenuCommand(cmd.key);
        return;
      }
      if (Input.isTriggered("escape") || Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        scene.cancelSleepMenu();
      }
    },
  };

  //=============================================================================
  // Scene_Map, sleep menu popup
  //=============================================================================

  // Re-opening a popup that is already up would throw the cursor back to the
  // first row and swallow the press that arrived with it (see the _openedFrame
  // guard in SleepMenuInputManager). Nothing legitimately opens this menu twice
  // -- post_sleep is raised after the popup has closed -- so a second call is
  // always a stray re-trigger from the map underneath, and is ignored.
  function alreadyOpen(scene) {
    return !!scene._sleepMenuEl;
  }

  Scene_Map.prototype.openSleepMenu = function (mode, opts) {
    if (alreadyOpen(this)) return;
    this._sleepMenuMode = mode || "main";
    this._sleepMenuIndex = 0;
    // Remember whether the wait list is the entry point (R with no bed nearby)
    // or a page under the rest menu, so Cancel goes back to the right place.
    this._sleepMenuDirectWait = this._sleepMenuMode === "wait";
    // A direct wait list may still lie down, but only as a rough sleep; every
    // other entry point was opened from a bed, a campfire, a tent or a camp
    // and rests the party in full.
    this._sleepMenuRoughRest = !!(opts && opts.roughRest);
    this._sleepMenuAllowSleep = !this._sleepMenuDirectWait || this._sleepMenuRoughRest;
    $gameTemp._sleepMenuOpen = true;
    if (!this._sleepMenuEl) {
      const el = document.createElement("div");
      el.id = "sleep-menu-overlay";
      el.className = "army-dialog-overlay";
      el.style.opacity = "0";
      el.style.transition = "opacity 0.22s ease-out";
      document.body.appendChild(el);
      this._sleepMenuEl = el;
      setTimeout(() => {
        if (this._sleepMenuEl) this._sleepMenuEl.style.opacity = "1";
      }, 16);
    }
    this._refreshSleepMenuDOM();
    SleepMenuInputManager.activate(this);
  };

  // The R hotkey / menu tile / hotbar: waiting where the party stands, with
  // the Sleep page reachable by flipping the selector. Waiting runs the clock
  // and wears the needs down; sleeping here is sleeping rough, so it refills
  // only part of the sleep meter and mends nobody's bones. On the world map
  // (315) waiting opens the camp rest instead (window.CampRest).
  Scene_Map.prototype.openWaitMenu = function () {
    if ($gameMap && $gameMap.mapId() === 315 && window.CampRest) {
      window.CampRest.pitch(this);
      return;
    }
    this.openSleepMenu("wait", { roughRest: true });
  };

  // Opens directly to cryogenic sleep year selection (bypassing the main menu)
  Scene_Map.prototype.openCryogenicSleepMenu = function () {
    if (alreadyOpen(this)) return;
    this._sleepMenuMode = "cryo";
    this._sleepMenuIndex = 0;
    this._sleepMenuDirectWait = false;
    this._sleepMenuRoughRest = false;
    this._sleepMenuAllowSleep = true;
    $gameTemp._sleepMenuOpen = true;
    if (!this._sleepMenuEl) {
      const el = document.createElement("div");
      el.id = "sleep-menu-overlay";
      el.className = "army-dialog-overlay";
      el.style.opacity = "0";
      el.style.transition = "opacity 0.22s ease-out";
      document.body.appendChild(el);
      this._sleepMenuEl = el;
      setTimeout(() => {
        if (this._sleepMenuEl) this._sleepMenuEl.style.opacity = "1";
      }, 16);
    }
    this._refreshSleepMenuDOM();
    SleepMenuInputManager.activate(this);
  };

  Scene_Map.prototype._refreshSleepMenuDOM = function () {
    if (!this._sleepMenuEl) return;
    bindSleepMenuWheel(this._sleepMenuEl);
    const mode = this._sleepMenuMode;
    const cmds = commandsForMode(mode, sleepAllowedFor(this));
    const optionsHTML = cmds
      .map((cmd, i) => {
        const inner = cmd.rightLabel
          ? `<span class="army-dialog-btn__label">${cmd.label}</span><span class="army-dialog-btn__wake">${cmd.rightLabel}</span>`
          : cmd.label;
        return `<div class="army-dialog-btn army-dialog-btn--row${
          cmd.rightLabel ? " army-dialog-btn--split" : ""
        }${i === this._sleepMenuIndex ? " selected" : ""}" data-cmd="${
          cmd.key
        }">${inner}</div>`;
      })
      .join("");
    const isDuration = mode === "sleep" || mode === "wait";
    const typeSelectorHTML = isDuration ? this._sleepMenuTypeSelectorHTML() : "";
    const cryoHTML = mode === "cryo" ? this._cryoPickerHTML() : "";
    this._sleepMenuEl.innerHTML = `
      <div class="army-dialog${mode === "cryo" ? " army-dialog--cryo" : ""}">
        <h3>${titleForMode(mode, this)}</h3>
        ${typeSelectorHTML}
        ${cryoHTML}
        <div class="army-dialog-options${isDuration ? " army-dialog-options--scroll" : ""}">${optionsHTML}</div>
      </div>`;
    if (mode === "cryo") this._bindCryoPickerDOM();
    this._sleepMenuEl.querySelectorAll(".army-dialog-btn").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        this._sleepMenuIndex = i;
        this.execSleepMenuCommand(btn.dataset.cmd);
      });
      btn.addEventListener("mouseenter", () => {
        // Only while the mouse is the thing being moved: see steering() above.
        if (!steering()) return;
        if (this._sleepMenuIndex !== i) {
          this._sleepMenuIndex = i;
          this._updateSleepMenuHighlight();
        }
      });
    });
    if (isDuration) {
      const arrows = this._sleepMenuEl.querySelectorAll(".army-dialog-type-arrow");
      arrows.forEach((arrow) => {
        arrow.addEventListener("click", () => this._toggleSleepMenuType());
      });
      // The list is rebuilt scrolled to the top, so a selection kept across a
      // Sleep <-> Wait flip has to be brought back under the cursor.
      this._updateSleepMenuHighlight(true);
    }
  };

  //=============================================================================
  // The cryogenic pod: the date picker
  //=============================================================================

  // The picked date, defaulted to the earliest the pod will take (tomorrow) and
  // kept inside the window on every read, since the window's far end moves with
  // the purse and the purse can change between two openings of the menu.
  Scene_Map.prototype._ensureCryoDate = function () {
    const range = cryoRange();
    if (!range) return null;
    if (!this._cryoDate) this._cryoDate = Object.assign({}, range.min);
    this._cryoDate = clampCryoDate(this._cryoDate, range);
    if (this._cryoField == null) this._cryoField = 0;
    return range;
  };

  Scene_Map.prototype._cryoPickerHTML = function () {
    const t = sleepLabels();
    const range = this._ensureCryoDate();
    if (!range) {
      const reason = TDS().getCryoUnavailableReason ? TDS().getCryoUnavailableReason() : "era";
      const text = reason === "funds"
        ? t.cryoNoFunds.format(cryoEuros(3000))
        : t.cryoEraOver;
      return `<p class="cryo-unavailable">${text}</p>`;
    }

    const api = TDS();
    const date = this._cryoDate;
    const months = cryoMonthNames();
    const now = api.getCurrentDateObj ? api.getCurrentDateObj() : new Date(2001, 0, 1);
    const from = { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
    const days = api.getCryoDays ? api.getCryoDays(date.year, date.month, date.day) : 0;
    const cost = api.getCryoCost ? api.getCryoCost(date.year, date.month, date.day) : 0;
    const gold = window.$gameParty ? $gameParty.gold() : 0;

    const values = [String(date.day), months[date.month], String(date.year)];
    const labels = [t.cryoFieldDay, t.cryoFieldMonth, t.cryoFieldYear];
    const fieldsHTML = CRYO_FIELDS.map((name, i) => `
      <div class="cryo-field${i === this._cryoField ? " selected" : ""}" data-field="${i}">
        <span class="cryo-field-arrow" data-step="1">&#9650;</span>
        <span class="cryo-field-value">${values[i]}</span>
        <span class="cryo-field-arrow" data-step="-1">&#9660;</span>
        <span class="cryo-field-label">${labels[i]}</span>
      </div>`).join("");

    return `
      <div class="cryo-date-row">${fieldsHTML}</div>
      <div class="cryo-summary">
        <div class="cryo-summary-row"><span>${t.cryoSpanLabel}</span><span>${cryoSpanLabel(from, date)}</span></div>
        <div class="cryo-summary-row"><span>${t.cryoRate}</span><span>${t.cryoPerDay.format(cryoEuros(range.goldPerDay))}</span></div>
        <div class="cryo-summary-row cryo-summary-row--total"><span>${t.cryoCost}</span><span>${cryoEuros(cost)}</span></div>
        <div class="cryo-summary-row cryo-summary-row--purse"><span>${t.cryoPurse}</span><span>${cryoEuros(gold)}</span></div>
        <div class="cryo-summary-note">${t.cryoNights.format(days)}</div>
      </div>`;
  };

  Scene_Map.prototype._bindCryoPickerDOM = function () {
    if (!this._sleepMenuEl) return;
    this._sleepMenuEl.querySelectorAll(".cryo-field").forEach((field) => {
      const index = Number(field.dataset.field);
      field.addEventListener("click", () => {
        if (this._cryoField !== index) {
          this._cryoField = index;
          SoundManager.playCursor();
          this._refreshSleepMenuDOM();
        }
      });
      field.querySelectorAll(".cryo-field-arrow").forEach((arrow) => {
        arrow.addEventListener("click", (event) => {
          event.stopPropagation();
          this._cryoField = index;
          this._adjustCryoField(Number(arrow.dataset.step));
        });
      });
    });
  };

  Scene_Map.prototype._moveCryoField = function (direction) {
    const total = CRYO_FIELDS.length;
    this._cryoField = ((this._cryoField || 0) + direction + total) % total;
    SoundManager.playCursor();
    this._refreshSleepMenuDOM();
  };

  // One step of the focused field. Days roll through their month and months
  // through their year, because the step is taken by the calendar itself, and
  // the result is pulled back inside the window the pod will accept.
  Scene_Map.prototype._adjustCryoField = function (step) {
    const range = this._ensureCryoDate();
    if (!range) return;
    const date = this._cryoDate;
    let next;
    if (this._cryoField === 0) {
      next = new Date(date.year, date.month, date.day + step);
    } else if (this._cryoField === 1) {
      const month = date.month + step;
      const year = date.year + Math.floor(month / 12);
      const wrapped = ((month % 12) + 12) % 12;
      next = new Date(year, wrapped, Math.min(date.day, cryoDaysInMonth(year, wrapped)));
    } else {
      const year = date.year + step;
      next = new Date(year, date.month, Math.min(date.day, cryoDaysInMonth(year, date.month)));
    }
    const picked = clampCryoDate(
      { year: next.getFullYear(), month: next.getMonth(), day: next.getDate() },
      range
    );
    const changed = cryoDayStamp(picked) !== cryoDayStamp(date);
    this._cryoDate = picked;
    if (changed) SoundManager.playCursor();
    else SoundManager.playBuzzer();
    this._refreshSleepMenuDOM();
  };

  // Sleep <-> Wait toggle row shown above the duration list. Only offered
  // when both choices are actually available (Sleep needs a place to rest);
  // otherwise there is nothing to switch to and the row is omitted.
  Scene_Map.prototype._sleepMenuTypeSelectorHTML = function () {
    const t = sleepLabels();
    if (!sleepAllowedFor(this)) return "";
    const label = this._sleepMenuMode === "sleep" ? t.sleep : t.wait;
    // The sleep page of a wait list says what it is worth right under the
    // selector: what the bedding in the packs buys, or, with nothing to lie on,
    // how little of a night sleeping rough is worth.
    let hint = "";
    if (this._sleepMenuMode === "sleep" && this._sleepMenuRoughRest) {
      const bedding = beddingItem();
      if (bedding && t.beddingHint) {
        hint = `<div class="army-dialog-type-hint">${t.beddingHint.format(bedding.name)}</div>`;
      } else if (!bedding && t.roughHint) {
        hint = `<div class="army-dialog-type-hint">${t.roughHint.format(roughFactorPercent())}</div>`;
      }
    }
    return `<div class="army-dialog-type-selector">
      <span class="army-dialog-type-arrow" data-dir="left">&#9668;</span>
      <span class="army-dialog-type-label">${label}</span>
      <span class="army-dialog-type-arrow" data-dir="right">&#9658;</span>
    </div>${hint}`;
  };

  // Flips between the Sleep and Wait duration lists in place, keeping the
  // same duration highlighted since both lists share the same hour range.
  Scene_Map.prototype._toggleSleepMenuType = function () {
    const target = this._sleepMenuMode === "sleep" ? "wait" : "sleep";
    if (target === "sleep" && !sleepAllowedFor(this)) return;
    SoundManager.playCursor();
    this._sleepMenuMode = target;
    this._refreshSleepMenuDOM();
  };

  // scroll: drag the list along with the cursor. Keyboard and pad navigation
  // pass it, since the duration list runs well past the bottom of its pane and
  // a cursor moved off screen would otherwise be invisible; the mouse never
  // does, because the row it highlights is by definition already under the
  // pointer and nudging the list would move it out from under it.
  Scene_Map.prototype._updateSleepMenuHighlight = function (scroll) {
    if (!this._sleepMenuEl) return;
    let selected = null;
    this._sleepMenuEl.querySelectorAll(".army-dialog-btn").forEach((btn, i) => {
      const on = i === this._sleepMenuIndex;
      btn.classList.toggle("selected", on);
      if (on) selected = btn;
    });
    if (scroll && selected && selected.scrollIntoView) {
      selected.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  Scene_Map.prototype._setSleepMenuMode = function (mode) {
    this._sleepMenuMode = mode;
    this._sleepMenuIndex = 0;
    this._refreshSleepMenuDOM();
  };

  // keepBlocking: leaves $gameTemp._sleepMenuOpen on so the player stays frozen
  // through the fade/sleep sequence until the post-sleep menu resolves.
  Scene_Map.prototype.closeSleepMenu = function (keepBlocking) {
    SleepMenuInputManager.deactivate();
    if (!keepBlocking) $gameTemp._sleepMenuOpen = false;
    // keepBlocking is the menu handing over to a rest sequence, which is the
    // only way a camp is ever slept in: any other close is the party walking
    // away from it, so the camp is struck rather than left standing for
    // whatever bed they lie down in next.
    if (!keepBlocking && window.CampRest) window.CampRest.strike();
    if (this._sleepMenuEl) {
      const el = this._sleepMenuEl;
      this._sleepMenuEl = null;
      el.style.transition = "opacity 0.2s ease-out";
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    }
  };

  Scene_Map.prototype.cancelSleepMenu = function () {
    SoundManager.playCancel();
    if (this._sleepMenuMode === "sleep") {
      // Backing out of a rough sleep closes the menu: the wait list it was
      // flipped from is itself the entry point, there is no rest menu behind.
      if (this._sleepMenuDirectWait) this.closeSleepMenu();
      else this._setSleepMenuMode("main");
    } else if (this._sleepMenuMode === "wait") {
      // Backing out returns to the rest menu when that is where waiting was
      // picked from, and closes outright when T opened the wait list directly.
      if (this._sleepMenuDirectWait) {
        this.closeSleepMenu();
      } else {
        this._setSleepMenuMode("main");
      }
    } else if (this._sleepMenuMode === "cryo") {
      // Cryogenic sleep is a direct entry point, so cancel closes the menu
      this.closeSleepMenu();
    } else if (this._sleepMenuMode === "post_sleep") {
      // Backing out of the post-sleep menu must still fade the screen back in
      this.closeSleepMenu();
      $gameScreen.startFadeIn(60);
    } else {
      this.closeSleepMenu();
    }
  };

  Scene_Map.prototype.execSleepMenuCommand = function (key) {
    // The popup is closed with the player still blocked, so the sequence it
    // hands over to is the only thing that can unblock them. If starting it
    // throws, release the player here rather than leaving them frozen.
    const startSequence = (run) => {
      try {
        run();
      } catch (e) {
        console.error("TimeDateSystem: could not start the rest sequence", e);
        $gameTemp._sleepMenuOpen = false;
        $gameScreen.startFadeIn(30);
      }
    };

    if (key.startsWith("hours_")) {
      const hours = Number(key.slice(6));
      const rough = roughRestFor(this);
      SoundManager.playOk();
      this.closeSleepMenu(true);
      startSequence(() => this.startSleepSequence(hours, false, { rough: rough }));
      return;
    }
    if (key.startsWith("wait_")) {
      const hours = Number(key.slice(5));
      SoundManager.playOk();
      this.closeSleepMenu(true);
      startSequence(() => this.startWaitSequence(hours));
      return;
    }
    if (key === "cryo_confirm") {
      const api = TDS();
      const range = this._ensureCryoDate();
      const date = this._cryoDate;
      // The pod may have closed between the panel being drawn and this press
      // (a purse spent elsewhere, a clock that reached 2012).
      if (!range || !date) { SoundManager.playBuzzer(); return; }
      const minutes = range && api.getCryoAdvanceMinutesForDate
        ? api.getCryoAdvanceMinutesForDate(date.year, date.month, date.day)
        : 0;
      const cost = range && api.getCryoCost ? api.getCryoCost(date.year, date.month, date.day) : 0;
      const gold = window.$gameParty ? $gameParty.gold() : 0;
      if (minutes <= 0 || cost > gold) {
        SoundManager.playBuzzer();
        return;
      }
      SoundManager.playOk();
      this.closeSleepMenu(true);
      startSequence(() => this.startCryoSequence(minutes, {
        cost: cost,
        days: api.getCryoDays ? api.getCryoDays(date.year, date.month, date.day) : 0,
        wakeDate: Object.assign({}, date),
      }));
      return;
    }
    switch (key) {
      case "sleep":
        SoundManager.playOk();
        this._setSleepMenuMode("sleep");
        break;
      case "wait":
        SoundManager.playOk();
        this._setSleepMenuMode("wait");
        break;
      case "save":
        SoundManager.playOk();
        this.closeSleepMenu();
        SceneManager.push(Scene_Save);
        break;
      case "respawn":
        this.setSleepRespawnPoint();
        SoundManager.playOk();
        break;
      case "cancel":
      case "cancel_sleep":
      case "cancel_wait":
        this.cancelSleepMenu();
        break;
      case "wakeup":
        SoundManager.playOk();
        this.closeSleepMenu();
        $gameScreen.startFadeIn(60);
        break;
      case "dream":
        SoundManager.playOk();
        this.closeSleepMenu();
        // The screen is still black here: fade back in whatever the dream does.
        try {
          PluginManager.callCommand(this, "DreamSystem", "StartDream", {});
        } catch (e) {
          console.error("TimeDateSystem: the dream could not be entered", e);
        }
        $gameScreen.startFadeIn(60);
        break;
    }
  };

  //=============================================================================
  // The cryogenic pod: the travel screen
  //
  // What the party sees while the pod runs: the calendar going past, and a
  // vitals board that does not move, because nothing about them does. Only the
  // date, the elapsed span and the bar are touched per frame; the party cards
  // are drawn once at the top of the sleep and left exactly as they are, which
  // is both the cheap way to do it and the honest picture of what is happening.
  //=============================================================================

  function cryoStamp(minute) {
    const api = TDS();
    return api.getDateTimeFromMinutes ? api.getDateTimeFromMinutes(minute) : null;
  }

  // A clock stamp as the {year, month, day} the calendar helpers speak in
  // (monthNum is 1-12, every month index in this file is 0-11).
  function cryoPartsOf(stamp) {
    if (!stamp) return null;
    return {
      year: Number(stamp.year),
      month: Number(stamp.monthNum) - 1,
      day: Number(stamp.day),
    };
  }

  // "12 March 2005, 10:30", with the month named in the player's language.
  function cryoDateText(stamp) {
    if (!stamp) return "";
    const parts = cryoPartsOf(stamp);
    const months = cryoMonthNames();
    return `${parts.day} ${months[parts.month]} ${parts.year}, ${stamp.time24}`;
  }

  function cryoGaugeHTML(label, value, max, cls) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return `<div class="cryo-vital">
        <span class="cryo-vital-label">${label}</span>
        <span class="cryo-vital-bar"><span class="cryo-vital-fill ${cls}" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="cryo-vital-value">${Math.round(value)}</span>
      </div>`;
  }

  function cryoPartyCardsHTML() {
    const t = sleepLabels();
    const api = TDS();
    const maxHunger = api.maxHunger || 100;
    const maxSleep = api.maxSleep || 100;
    if (!window.$gameParty) return "";
    return $gameParty.members().map((actor) => `
      <div class="cryo-pod-card" data-actor="${actor.actorId()}">
        <div class="cryo-pod-head">
          <span class="cryo-pod-name">${actor.name()}</span>
          <span class="cryo-pod-level">${t.cryoLevel.format(actor.level)}</span>
        </div>
        ${cryoGaugeHTML(t.cryoHp, actor.hp, actor.mhp, "cryo-fill-hp")}
        ${cryoGaugeHTML(t.cryoMp, actor.mp, actor.mmp, "cryo-fill-mp")}
        ${cryoGaugeHTML(t.cryoTp, actor.tp, 100, "cryo-fill-tp")}
        ${cryoGaugeHTML(t.cryoHunger, actor.hunger ? actor.hunger() : 0, maxHunger, "cryo-fill-food")}
        ${cryoGaugeHTML(t.cryoSleep, actor.sleep ? actor.sleep() : 0, maxSleep, "cryo-fill-rest")}
        <div class="cryo-pod-status" data-status="${actor.actorId()}">${t.cryoHeld}</div>
      </div>`).join("");
  }

  Scene_Map.prototype.openCryoTravelScreen = function (info) {
    const t = sleepLabels();
    this.closeCryoTravelScreen();
    const el = document.createElement("div");
    el.id = "cryo-travel-overlay";
    el.className = "army-dialog-overlay cryo-overlay";
    el.style.opacity = "0";
    el.style.transition = "opacity 0.4s ease-out";
    const start = cryoStamp(info.startTime);
    el.innerHTML = `
      <div class="cryo-panel">
        <div class="cryo-panel-head">
          <h3>${t.cryoTravelTitle}</h3>
          <p class="cryo-panel-sub" id="cryo-sub">${t.cryoTravelSub}</p>
        </div>
        <div class="cryo-clock">
          <div class="cryo-clock-year" id="cryo-year">${start ? start.year : ""}</div>
          <div class="cryo-clock-date" id="cryo-date">${cryoDateText(start)}</div>
          <div class="cryo-clock-elapsed" id="cryo-elapsed">${t.cryoElapsed.format("")}</div>
          <div class="cryo-progress"><span class="cryo-progress-fill" id="cryo-bar" style="width:0%"></span></div>
          <div class="cryo-clock-fare">${t.cryoFarePaid.format(cryoEuros(info.cost))}</div>
        </div>
        <div class="cryo-pods">${cryoPartyCardsHTML()}</div>
      </div>`;
    document.body.appendChild(el);
    this._cryoScreen = {
      el: el,
      year: el.querySelector("#cryo-year"),
      date: el.querySelector("#cryo-date"),
      elapsed: el.querySelector("#cryo-elapsed"),
      bar: el.querySelector("#cryo-bar"),
      sub: el.querySelector("#cryo-sub"),
      startTime: info.startTime,
    };
    setTimeout(() => {
      if (this._cryoScreen) this._cryoScreen.el.style.opacity = "1";
    }, 16);
  };

  Scene_Map.prototype.updateCryoTravelScreen = function (info) {
    const s = this._cryoScreen;
    if (!s) return;
    const t = sleepLabels();
    const stamp = cryoStamp(info.minute);
    if (stamp) {
      if (s.year.textContent !== String(stamp.year)) s.year.textContent = stamp.year;
      s.date.textContent = cryoDateText(stamp);
      const fromParts = cryoPartsOf(cryoStamp(s.startTime));
      const toParts = cryoPartsOf(stamp);
      if (fromParts && toParts) {
        s.elapsed.textContent = t.cryoElapsed.format(cryoSpanLabel(fromParts, toParts));
      }
    }
    const pct = info.total > 0 ? Math.max(0, Math.min(100, (info.elapsed / info.total) * 100)) : 100;
    s.bar.style.width = pct.toFixed(2) + "%";
  };

  // The lid opens: the board finally moves, once, to say what each of them woke
  // up with.
  Scene_Map.prototype.showCryoWakeScreen = function (info) {
    const s = this._cryoScreen;
    if (!s) return;
    const t = sleepLabels();
    s.el.classList.add("cryo-overlay--wake");
    s.sub.textContent = t.cryoWakeSub;
    s.bar.style.width = "100%";
    const stamp = cryoStamp(info.minute);
    if (stamp) {
      s.year.textContent = stamp.year;
      s.date.textContent = cryoDateText(stamp);
    }
    if (!window.$gameParty) return;
    for (const actor of $gameParty.members()) {
      const node = s.el.querySelector(`[data-status="${actor.actorId()}"]`);
      if (!node) continue;
      const names = actor.states().map((state) => state.name).filter(Boolean);
      node.textContent = names.length ? names.join(" · ") : t.cryoWakeClean;
      node.classList.add("cryo-pod-status--wake");
    }
  };

  Scene_Map.prototype.closeCryoTravelScreen = function () {
    const s = this._cryoScreen;
    if (!s) return;
    this._cryoScreen = null;
    const el = s.el;
    el.style.transition = "opacity 0.5s ease-out";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 520);
  };

  // A scene teardown mid-sleep would otherwise leave the board on screen.
  const _Scene_Map_terminate_cryo = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    if (this._cryoScreen) {
      const el = this._cryoScreen.el;
      this._cryoScreen = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    _Scene_Map_terminate_cryo.call(this);
  };

  // $gameTemp._sleepMenuOpen freezes the player, and it is deliberately left
  // on across the fade so nobody walks off mid-sleep. If the popup and every
  // sequence that would clear it are gone and it is still set, the player is
  // stuck standing still with nothing on screen: release them.
  function sleepBlockIsStale(scene) {
    if (!$gameTemp || !$gameTemp._sleepMenuOpen) return false;
    if (scene._sleepMenuEl) return false;
    return !scene._sleepSequenceState && !scene._sleepAdvance &&
           !scene._waitAdvance && !scene._cryoSequenceState;
  }

  //===========================================================================
  // The rest watchdog
  //
  // Every rest freeze is released by the sequence that took it: the wait
  // timelapse ends, the block ends. That holds as long as the sequence keeps
  // being stepped, and Scene_Map.update is the only thing that steps it - so
  // any overlay that short-circuits Scene_Map.update (a picker, a star chart,
  // a 3D world drawn over the map) parks the sequence forever, with the player
  // frozen, no menu, and the fast-forward flag still on while the map, the
  // followers and the DOM HUDs carry on around them. That is the soft-lock
  // reported aboard the Starship.
  //
  // The watchdog is the answer that does not depend on which overlay it was:
  // it runs off SceneManager.updateMain, which nothing on the map can skip,
  // and watches the frame counter the sequence bumps on every step. A counter
  // that has not moved for STALL_MS of real time is a sequence nobody is
  // driving any more: settle it, hand the clock its hours, and give the player
  // back. The verdict itself is pure so test/test_wait_watchdog.js can drive
  // it without a scene.
  //===========================================================================

  const WATCHDOG_STALL_MS = 3000;
  // A frame of the watchdog not running at all (the party was in a menu, a
  // battle, a shop) is not a stall: the mark is thrown away rather than aged.
  const WATCHDOG_GAP_MS = 500;

  function watchdogVerdict(state, mark, now) {
    if (mark && now - mark.seen > WATCHDOG_GAP_MS) mark = null;
    const stalled = (m) => m && now - m.at > WATCHDOG_STALL_MS;
    const keep = (m, frames) => (m && m.frames === frames)
      ? { frames: frames, at: m.at, seen: now }
      : { frames: frames, at: now, seen: now };

    if (state.waitFrames != null) {
      const next = keep(mark, state.waitFrames);
      return stalled(next) ? { verdict: "finishWait", mark: null } : { verdict: "none", mark: next };
    }
    if (state.sleepFrames != null) {
      const next = keep(mark, state.sleepFrames);
      return stalled(next) ? { verdict: "finishSleep", mark: null } : { verdict: "none", mark: next };
    }
    // Nothing is advancing any more: the fast-forward flag is nobody's, and it
    // is what leaves the followers and the NPCs sprinting around the map.
    if (state.fastForward) return { verdict: "clearFastForward", mark: null };
    if (state.menuOpen && !state.menuEl && !state.cryoActive && !state.sleepSeq) {
      const next = keep(mark, -1);
      return stalled(next) ? { verdict: "release", mark: null } : { verdict: "none", mark: next };
    }
    return { verdict: "none", mark: null };
  }
  window.TimeDateSystem.watchdogVerdict = watchdogVerdict;

  function runSleepWatchdog() {
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_Map) || !window.$gameTemp) return;
    const state = {
      menuOpen: !!$gameTemp._sleepMenuOpen,
      menuEl: !!scene._sleepMenuEl,
      cryoActive: !!scene._cryoSequenceState,
      // The fade before a sleep: no advance object yet, and not a stall.
      sleepSeq: !!scene._sleepSequenceState,
      fastForward: !!$gameTemp._isWaitingFastForward,
      waitFrames: scene._waitAdvance ? (scene._waitAdvance.framesRun || 0) : null,
      sleepFrames: scene._sleepAdvance ? (scene._sleepAdvance.framesRun || 0) : null,
    };
    const out = watchdogVerdict(state, scene._sleepWatchdogMark || null, Date.now());
    scene._sleepWatchdogMark = out.mark;
    if (out.verdict === "none") return;
    console.warn("TimeDateSystem: the rest sequence stopped being driven (" +
      out.verdict + "), releasing the party");
    try {
      if (out.verdict === "finishWait" && scene._finishWaitAdvance) scene._finishWaitAdvance();
      if (out.verdict === "finishSleep" && scene._finishSleepAdvance) scene._finishSleepAdvance();
    } catch (e) {
      console.error("TimeDateSystem: the watchdog could not finish the sequence", e);
    }
    $gameTemp._isWaitingFastForward = false;
    // A finished sleep can legitimately raise the post-sleep menu (the dream
    // offer): that popup owns the block from here, so it is left standing.
    if (scene._sleepMenuEl) return;
    $gameTemp._sleepMenuOpen = false;
    if ($gameScreen && $gameScreen.brightness && $gameScreen.brightness() < 255) {
      $gameScreen.startFadeIn(30);
    }
  }

  // SceneManager.updateMain, not Scene_Map.update: the whole point is to run
  // where no map overlay can take the frame away.
  const _SceneManager_updateMain_sleepUI = SceneManager.updateMain;
  SceneManager.updateMain = function () {
    _SceneManager_updateMain_sleepUI.call(this);
    try {
      runSleepWatchdog();
    } catch (e) {
      console.error("TimeDateSystem: rest watchdog failed", e);
    }
  };

  const _Scene_Map_update_sleepUI = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update_sleepUI.call(this);
    SleepMenuInputManager.update();
    if (sleepBlockIsStale(this)) {
      this._sleepBlockStaleFrames = (this._sleepBlockStaleFrames || 0) + 1;
      // A couple of frames of grace: closeSleepMenu fades the popup out before
      // the sequence it started has begun, and that gap is not a stuck block.
      if (this._sleepBlockStaleFrames > 30) {
        $gameTemp._sleepMenuOpen = false;
        this._sleepBlockStaleFrames = 0;
        if ($gameScreen && $gameScreen.brightness && $gameScreen.brightness() < 255) {
          $gameScreen.startFadeIn(30);
        }
      }
    } else {
      this._sleepBlockStaleFrames = 0;
    }
  };

  // Esc doubles as the "menu" key in MZ, block the main menu while the popup
  // is open or the player would cancel the dialog and open the menu at once.
  const _Scene_Map_isMenuEnabled_sleepUI = Scene_Map.prototype.isMenuEnabled;
  Scene_Map.prototype.isMenuEnabled = function () {
    if ($gameTemp._sleepMenuOpen) return false;
    return _Scene_Map_isMenuEnabled_sleepUI.call(this);
  };

  const _Scene_Map_terminate_sleepUI = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    SleepMenuInputManager.deactivate();
    if (this._sleepMenuEl) {
      const el = this._sleepMenuEl;
      this._sleepMenuEl = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    _Scene_Map_terminate_sleepUI.call(this);
  };

  //=============================================================================
  // MealBars - the serving card
  //=============================================================================
  // What a meal did, drawn rather than described. One row per eater, each bar
  // starting where that meter stood before the food and running up to where it
  // stands after, so the party can be watched being fed. A summon is not on the
  // card because it is not at the table (window.PartyMeal.eaters).
  //
  // It is a plain DOM overlay on document.body, which is what lets it be shown
  // from inside a menu: eating no longer has to drop the player back onto the
  // map for a common event to run, so the card appears over whatever screen the
  // food was eaten on and fades on its own.
  //
  // Past 100% the bar is full and the colour carries the surplus: amber over
  // full, red at the overeating line (window.NeedGauge.hungerBand).
  //=============================================================================
  const MEAL_OVERLAY_ID = "meal-bars-overlay";   // i18n-ignore  element id
  const MEAL_FILL_FRAMES = 42;                   // how long a bar takes to run up
  const MEAL_HOLD_MS = 2600;                     // how long the card stays after

  function mealMax() {
    const TDS = window.TimeDateSystem || {};
    return Number(TDS.overeatMaxHunger) || 350;
  }

  function mealEscape(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // The width of one reading on a track that runs to the overeating ceiling,
  // not to 100%: that is what makes a surplus visible as length instead of only
  // as colour, and it keeps the full mark in the same place on every row.
  function mealWidth(pct) {
    const ceiling = (mealMax() / (window.TimeDateSystem.maxHunger || 100)) * 100;
    return Math.max(0, Math.min(100, (pct / ceiling) * 100));
  }

  function mealBand(pct) {
    const gauge = window.NeedGauge;
    return gauge && gauge.hungerBand ? gauge.hungerBand(pct) : "gauge-band--ok";
  }

  window.MealBars = {
    // report is window.PartyMeal.serve()'s answer; opts.title names the dish.
    show(report, opts = {}) {
      if (typeof document === "undefined" || !document || !document.body) return null;
      const rows = (report && report.members) || [];
      if (!rows.length) return null;

      this.hide();

      const el = document.createElement("div");
      el.id = MEAL_OVERLAY_ID;
      el.className = "meal-card";

      // The dish names the card when there is a dish; otherwise the one word
      // that says what just happened. Guarded like every other lookup in this
      // file: a card that cannot read its own heading still draws its bars.
      const heading = opts.title ||
        (typeof window.T === "function" ? window.T("Eating.served") : "");
      const title = heading
        ? `<div class="meal-card-title">${mealEscape(heading)}</div>` : "";

      // The full mark sits where 100% falls on a track that runs to the
      // ceiling, so a bar past it is read as past full at a glance.
      const fullAt = mealWidth(100);
      let body = "";
      rows.forEach((row) => {
        const band = mealBand(row.toPct);
        const from = mealWidth(row.fromPct);
        const to = mealWidth(row.toPct);
        const delta = Math.round(row.toPct - row.fromPct);
        const sign = delta > 0 ? "+" : "";
        body +=
          `<div class="meal-row">` +
            `<div class="meal-row-head">` +
              `<span class="meal-row-name">${mealEscape(row.name)}</span>` +
              `<span class="meal-row-val gauge-ink ${band}">${Math.round(row.toPct)}%` +
                `<span class="meal-row-delta">${sign}${delta}</span>` +
              `</span>` +
            `</div>` +
            `<div class="meal-row-track">` +
              `<div class="meal-row-mark" style="left:${fullAt}%"></div>` +
              `<div class="meal-row-fill gauge-fill ${band}" ` +
                `style="width:${from}%" data-to="${to}"></div>` +
            `</div>` +
          `</div>`;
      });

      el.innerHTML = title + `<div class="meal-rows">${body}</div>`;
      document.body.appendChild(el);

      // The run-up is done on the next frame so the browser has laid the bars
      // out at their starting width first: set both in one paint and there is
      // no transition to see.
      const runUp = () => {
        el.querySelectorAll(".meal-row-fill").forEach((fill) => {
          fill.style.transitionDuration = `${Math.round(MEAL_FILL_FRAMES / 60 * 1000)}ms`;
          fill.style.width = `${fill.getAttribute("data-to")}%`;
        });
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(runUp);
      else runUp();

      this._el = el;
      this._timer = setTimeout(() => {
        el.classList.add("meal-card--out");
        this._timer = setTimeout(() => this.hide(), 400);
      }, MEAL_HOLD_MS);
      return el;
    },

    hide() {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      const el = this._el || (typeof document !== "undefined" && document
        ? document.getElementById(MEAL_OVERLAY_ID) : null);
      this._el = null;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    },

    _el: null,
    _timer: null,
  };

})();
