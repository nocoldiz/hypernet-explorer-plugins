/*:
 * @target MZ
 * @plugindesc Shared left/right analog-stick input helper for DOM plugin UIs. v1.0
 * @author Hypernet
 *
 * @param deadzone
 * @text Deadzone
 * @desc Radial deadzone for the left stick (0-1). Below this, the stick reads as 0.
 * @type number
 * @decimals 2
 * @default 0.30
 *
 * @help
 * ============================================================================
 * AnalogStickInput
 * ============================================================================
 * RMMZ core already folds the LEFT analog stick into up/down/left/right (see
 * Input._updateGamepadState in rmmz_core.js), so any menu that navigates with
 * Input.isRepeated('up') already supports the stick for discrete navigation.
 *
 * This helper adds the three things core does NOT provide:
 *   1. A tunable, deadzoned RAW axis API for analog pointer / camera panning /
 *      zoom in spatial UIs (star map, OS desktop, world/travel map, editors).
 *   2. A discrete key-repeat direction API for the rare DOM scenes that cannot
 *      route through RMMZ Input.
 *   3. Hysteresis on core's own stick-to-d-pad fold, so a stick resting near
 *      the threshold latches once instead of flapping across it and walking a
 *      grid menu diagonally. See snapAxes() in the body.
 *
 * Use exactly one discrete source per scene to avoid double-firing: an
 * Input-based menu keeps using Input.isRepeated (stick already included); only
 * a scene that bypasses Input should use AnalogStickInput.isRepeated().
 *
 * API (window.AnalogStickInput):
 *   leftX()/leftY()    deadzone-scaled [-1,1]  (Y positive = down)
 *   rightX()/rightY()  right stick
 *   leftTrigger()/rightTrigger()  L2/R2 analog triggers, [0,1] (standard
 *                      gamepad mapping buttons[6]/[7].value; 0 when absent)
 *   isActive()         left stick outside deadzone this frame
 *   isRepeated(dir)    key-repeat pulses for 'up'|'down'|'left'|'right'
 *   isTriggered(dir)   first-frame only
 *   hasPad()           a gamepad is connected right now (drives whether a UI
 *                      shows keyboard or controller button hints)
 *   isButtonPressed(i) / isButtonTriggered(i)  raw standard-mapping button by
 *                      index, edge-detected. Use for buttons whose Input action
 *                      is bound to a colliding keyboard key (e.g. Y = 'menu' =
 *                      Escape), where Input.isTriggered would fire on both.
 *                      Indices are on AnalogStickInput.BUTTON (A/B/X/Y/LB/RB/
 *                      LT/RT/BACK/START/L3/R3).
 *   deadzone           tunable number (default 0.30)
 *
 * Polled once per frame by aliasing Input.update; no core files are modified.
 * ============================================================================
 */

(() => {
    'use strict';

    const params = PluginManager.parameters('Core/AnalogStickInput');
    const DEFAULT_DEADZONE = Number(params['deadzone'] || 0.30);

    // Magnitude past which a single axis counts as a "press" for discrete nav,
    // and the lower magnitude it has to fall back to before it counts as
    // released. The gap is a Schmitt trigger: see snapAxes() below for why a
    // single threshold is not enough on a real stick.
    const STEP_THRESHOLD = 0.5;
    const STEP_RELEASE = 0.35;

    // Latched per-axis direction for the left stick, shared by the RMMZ core
    // hook and this helper's own discrete API so both read the same press.
    const _latch = { x: 0, y: 0 };

    // A gamepad stick held toward a corner does not sit still: it wobbles a few
    // hundredths either side of wherever the thumb is resting. RMMZ core folds
    // the stick into the d-pad with a bare `axis > 0.5` test, so an axis parked
    // near the threshold crosses it over and over, and every crossing is a fresh
    // key press. Input.update tracks a single _latestButton, so those crossings
    // alternate it between (say) 'down' and 'right', which is what walks a
    // two-column grid diagonally instead of down it: one step down, one step
    // right, one step down. It is worst on a Steam Deck, whose sticks rest
    // slightly off-centre and whose menus are the two-column archetype pickers.
    //
    // Hysteresis fixes it without costing anything else: an axis has to reach
    // 0.5 to latch and fall under 0.35 to let go, so a held direction latches
    // once and stays latched. Diagonal MOVEMENT is untouched, because both axes
    // may be latched at the same time; it is only the flapping that stops.
    function snapAxes(axes) {
        const out = Array.prototype.slice.call(axes || []);
        const raw = ['x', 'y'];
        for (let i = 0; i < 2; i++) {
            const v = out[i] || 0;
            const key = raw[i];
            if (Math.abs(v) >= STEP_THRESHOLD) {
                _latch[key] = v < 0 ? -1 : 1;
            } else if (Math.abs(v) < STEP_RELEASE) {
                _latch[key] = 0;
            }
            // Report the latched direction at full deflection so whatever
            // threshold the consumer uses agrees with the latch.
            out[i] = _latch[key];
        }
        return out;
    }

    // RMMZ core reads the raw axes straight off the gamepad; hand it the latched
    // ones instead. _gamepadStates is keyed by index, so a plain shim carrying
    // the same index and buttons is all core needs.
    const _Input_updateGamepadState = Input._updateGamepadState;
    Input._updateGamepadState = function (gamepad) {
        _Input_updateGamepadState.call(this, {
            index: gamepad.index,
            buttons: gamepad.buttons,
            axes: snapAxes(gamepad.axes)
        });
    };

    const AnalogStickInput = {
        deadzone: DEFAULT_DEADZONE,

        _lx: 0, _ly: 0, _rx: 0, _ry: 0,
        _lt: 0, _rt: 0,
        // Which frame the triggers were last read on, and how often (see
        // leftTrigger below).
        _triggerFrame: -1, _triggerReads: 0,
        _padOn: false,
        // Raw button state this frame and last, for edge detection.
        _btn: [], _btnPrev: [],
        // Per-direction hold-frame counters for key-repeat emulation.
        _hold: { up: 0, down: 0, left: 0, right: 0 },
        // Pulse flags computed this frame.
        _pulse: { up: false, down: false, left: false, right: false },

        leftX() { return this._lx; },
        leftY() { return this._ly; },
        rightX() { return this._rx; },
        rightY() { return this._ry; },
        // Reading a trigger CLAIMS it for this frame. MZ has no name for the
        // analog triggers, so every screen that wants them reads them raw from
        // here - and the game-wide scroll poll (UIScroll in MouseControls.js)
        // has to know whether some scene is already using them for a zoom, a
        // quantity or a game of its own, or the same pull would do two things
        // at once. Nobody has to declare anything: asking is the claim.
        leftTrigger() { this._claimTriggers(); return this._lt; },
        rightTrigger() { this._claimTriggers(); return this._rt; },

        _claimTriggers() {
            const frame = (typeof Graphics !== "undefined" && Graphics.frameCount) || 0;
            if (frame !== this._triggerFrame) {
                this._triggerFrame = frame;
                this._triggerReads = 0;
            }
            this._triggerReads++;
        },

        // How many times the triggers have been read this frame, not counting
        // the caller's own read.
        triggerReadsThisFrame() {
            const frame = (typeof Graphics !== "undefined" && Graphics.frameCount) || 0;
            return frame === this._triggerFrame ? this._triggerReads : 0;
        },

        // Standard gamepad mapping (Xbox layout labels). The four d-pad
        // buttons are here as themselves: core folds the LEFT STICK into the
        // same Input directions, so a scene that wants the d-pad alone (the 3D
        // world's quick bar, stepped with up/down while the stick still walks)
        // can only get it by reading the raw buttons.
        // i18n-ignore-start: physical controller button ids
        BUTTON: {
            A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
            BACK: 8, START: 9, L3: 10, R3: 11,
            DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15
        },
        // i18n-ignore-end

        hasPad() { return this._padOn; },
        isButtonPressed(i) { return !!this._btn[i]; },
        isButtonTriggered(i) { return !!this._btn[i] && !this._btnPrev[i]; },

        isActive() { return this._lx !== 0 || this._ly !== 0; },

        isRepeated(dir) { return !!this._pulse[dir]; },
        isTriggered(dir) { return !!this._pulse[dir] && this._hold[dir] === 1; },

        // Radial deadzone with edge rescaling: deadzone edge -> 0, full -> 1.
        _applyDeadzone(x, y) {
            const mag = Math.sqrt(x * x + y * y);
            if (mag < this.deadzone) return [0, 0];
            const scaled = (mag - this.deadzone) / (1 - this.deadzone);
            const k = scaled / mag;
            return [x * k, y * k];
        },

        _readPads() {
            if (!navigator.getGamepads) return null;
            const pads = navigator.getGamepads();
            if (!pads) return null;
            for (const pad of pads) {
                if (pad && pad.connected && pad.axes && pad.axes.length >= 2) return pad;
            }
            return null;
        },

        update() {
            const pad = this._readPads();
            this._padOn = !!pad;
            this._btnPrev = this._btn;
            this._btn = pad
                ? Array.prototype.map.call(pad.buttons || [], (b) => !!(b && b.pressed))
                : [];
            if (pad) {
                const [lx, ly] = this._applyDeadzone(pad.axes[0] || 0, pad.axes[1] || 0);
                this._lx = lx;
                this._ly = ly;
                if (pad.axes.length >= 4) {
                    const [rx, ry] = this._applyDeadzone(pad.axes[2] || 0, pad.axes[3] || 0);
                    this._rx = rx;
                    this._ry = ry;
                } else {
                    this._rx = this._ry = 0;
                }
                // Standard gamepad mapping: buttons[6] = L2, buttons[7] = R2,
                // both analog triggers exposing 0-1 via .value.
                const btns = pad.buttons || [];
                this._lt = (btns[6] && btns[6].value) || 0;
                this._rt = (btns[7] && btns[7].value) || 0;
            } else {
                this._lx = this._ly = this._rx = this._ry = 0;
                this._lt = this._rt = 0;
            }

            // Discrete key-repeat emulation. Read off the same latch the RMMZ
            // core hook uses (see snapAxes) rather than the analog values, so a
            // DOM scene stepping through a list and a Window_Selectable doing
            // the same both see one steady press instead of a stick flapping
            // across the threshold.
            const dirState = {
                up: _latch.y < 0,
                down: _latch.y > 0,
                left: _latch.x < 0,
                right: _latch.x > 0
            };
            const wait = Input.keyRepeatWait;
            const interval = Input.keyRepeatInterval;
            for (const dir of ['up', 'down', 'left', 'right']) {
                if (dirState[dir]) {
                    this._hold[dir]++;
                    const t = this._hold[dir];
                    this._pulse[dir] = (t === 1) ||
                        (t >= wait && (t - wait) % interval === 0);
                } else {
                    this._hold[dir] = 0;
                    this._pulse[dir] = false;
                }
            }
        }
    };

    window.AnalogStickInput = AnalogStickInput;

    // ------------------------------------------------------------------------
    // Input.clear() must not resurrect a button that is still held
    // ------------------------------------------------------------------------
    // Core's Input.clear() blanks _currentState, _previousState AND
    // _gamepadStates together. On the very next Input.update(),
    // _updateGamepadState compares the live pad against an empty last-state, so
    // every button the player is STILL physically holding reads as a fresh edge
    // and lands in _currentState with nothing behind it in _previousState --
    // i.e. Input.isTriggered() fires again for a press that was never released.
    //
    // Keyboard does not have this problem: _currentState is only re-armed by a
    // real DOM keydown, so a held key stays cleared. That asymmetry is why the
    // symptom is controller-only, and it breaks the very common pattern of
    // "open a choice window, then Input.clear() so the button that opened it is
    // not also read as its answer": on a pad the held A button re-triggers one
    // frame later and instantly confirms the first choice. The world map's
    // travel menu (Visit / Make a camp / Cancel) is the visible case -- it
    // appeared to be skipped entirely.
    //
    // Re-seed both halves from the live pad instead. A held button is recorded
    // as already-pressed in current AND previous state, so isPressed() stays
    // true (held movement keeps working) while isTriggered() stays false until
    // the player actually releases and presses again.
    const _Input_clear = Input.clear;
    Input.clear = function () {
        _Input_clear.call(this);
        if (!navigator.getGamepads) return;
        const pads = navigator.getGamepads();
        if (!pads) return;
        for (const pad of pads) {
            if (!pad || !pad.connected) continue;
            const state = [];
            const buttons = pad.buttons || [];
            for (let i = 0; i < buttons.length; i++) {
                state[i] = !!(buttons[i] && buttons[i].pressed);
            }
            // Mirror core's stick-to-d-pad fold, reading the same latch our
            // _updateGamepadState hook feeds it (see snapAxes), so a held
            // direction is seeded exactly as core would have recorded it.
            state[12] = _latch.y < 0;
            state[13] = _latch.y > 0;
            state[14] = _latch.x < 0;
            state[15] = _latch.x > 0;
            for (let j = 0; j < state.length; j++) {
                const name = Input.gamepadMapper[j];
                if (name && state[j]) {
                    this._currentState[name] = true;
                    this._previousState[name] = true;
                }
            }
            this._gamepadStates[pad.index] = state;
        }
    };

    // ------------------------------------------------------------------------
    // PointerSteering: is the mouse the thing currently being moved?
    // ------------------------------------------------------------------------
    // Every DOM menu in the project mirrors mouse hover into its keyboard /
    // controller focus, so pointing at a row selects it. That is right while the
    // player is using the mouse and wrong the moment they are not, because a
    // menu that scrolls its selection into view (or rebuilds its list) moves a
    // DIFFERENT row under a pointer that never moved. The browser fires
    // mouseenter/mouseover for that -- content moving under a still pointer
    // counts as entering it -- and the hover handler then drags the selection
    // back to wherever the mouse happens to be resting. On a pad, where the
    // pointer just sits in the middle of the screen over the dialog, the cursor
    // springs back on every press and OK runs the wrong row.
    //
    // The distinguishing signal is mousemove: browsers fire it only when the
    // POINTER moves, never when content moves beneath it. So steering belongs to
    // the mouse from a mousemove until the next key or pad input, and menus
    // guard their hover handler with `if (!PointerSteering.isSteering()) return;`
    // -- see TimeDateSystemUI (sleep menu), SaveSystem, FloorListWindowUI,
    // ShopManagementUI, ModManagerUI, TitleScreenGameUpdater and
    // SplitScreenMultiplayer.
    const PointerSteering = {
        _steering: false,
        isSteering() { return this._steering; },
        // For a menu that wants to hand steering over explicitly (a scene
        // opening on a keypress, say). Rarely needed: update() below does it.
        grab()    { this._steering = true; },
        release() { this._steering = false; },
    };
    window.PointerSteering = PointerSteering;

    window.addEventListener('mousemove', () => { PointerSteering.grab(); }, { passive: true });
    // A touch is a pointer too, and it lands directly on the row it means.
    window.addEventListener('touchstart', () => { PointerSteering.grab(); }, { passive: true });

    // Any fresh key / pad press hands steering back. _pressedTime === 0 is the
    // frame a button was first seen down, which is exactly Input's own
    // definition of "triggered" for whatever the latest button was, so this
    // catches every mapped key and pad button without naming any of them.
    function releaseOnDeviceInput() {
        if (Input._latestButton && Input._pressedTime === 0) {
            PointerSteering.release();
            return;
        }
        // The sticks and the analog triggers, neither of which sets
        // _latestButton on its own for every menu that reads them raw.
        if (AnalogStickInput.isActive() ||
            AnalogStickInput.leftTrigger() > 0.5 || AnalogStickInput.rightTrigger() > 0.5) {
            PointerSteering.release();
        }
    }

    // Poll once per frame, in lockstep with the rest of input.
    const _Input_update = Input.update;
    Input.update = function () {
        _Input_update.call(this);
        AnalogStickInput.update();
        releaseOnDeviceInput();
    };
})();
