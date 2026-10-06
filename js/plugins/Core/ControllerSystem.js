/*:
 * @target MZ
 * @plugindesc The one controller layer: ports and players, button reading, mode bindings, on-screen tips and the right-stick camera. v1.0.0
 * @author Hypernet
 *
 * @param cameraSpeed
 * @text Camera speed
 * @desc How fast the right stick swings a camera in the 3D scenes (0.2 - 3).
 * @type number
 * @decimals 2
 * @default 1.00
 *
 * @param invertY
 * @text Invert camera Y
 * @desc Push the right stick up to look down.
 * @type boolean
 * @default false
 *
 * @help
 * ============================================================================
 * ControllerSystem - window.Controller
 * ============================================================================
 * A controller used to be answered in six places at once: the analog helper
 * read the sticks, the mouse plugin stamped the button faces onto the menus,
 * the voxel world polled the triggers through a raw table of its own, the
 * split screen worked out which pad belonged to which player, and every 3D
 * minigame that wanted a camera either wired its own right stick or did
 * without one. Each of those answers was right on its own and none of them
 * agreed with the others: the same pad could be player one here and player two
 * there, and the same button wore a different letter on two screens.
 *
 * This plugin is the single answer. Everything about the thing in the player's
 * hands is asked here:
 *
 *   PORTS AND PLAYERS
 *     Controller.ports()            connected pads, phantoms filtered out
 *     Controller.pad(player)        the Gamepad a player is holding (0 = P1)
 *     Controller.connected() / count()
 *     Controller.device()           'pad' or 'keyboard', whichever last spoke
 *     Controller.usingPad()
 *
 *   READING ONE
 *     Controller.FACE               A B X Y L1 R1 L2 R2 SELECT START L3 R3
 *                                   and the four d-pad buttons, by index
 *     Controller.value(face, p)     analog 0..1 (a digital button is 0 or 1)
 *     Controller.pressed(face, p)
 *     Controller.triggered(face, p) the frame it went down, per player
 *     Controller.stick(side, p)     {x, y}, deadzoned; side 'left' | 'right',
 *                                   and reading the right one CLAIMS it for
 *                                   the frame (see AnalogStickInput)
 *     Controller.trigger('L2', p)   the analog pull, and it CLAIMS the trigger
 *                                   for this frame (see AnalogStickInput)
 *
 *   MODE BINDINGS
 *     A mode is what the player is doing: walking a menu, driving the voxel
 *     world, walking it, dreaming, or inside a minigame. Each mode names its
 *     actions, and an action says which face and which Input key work it, so a
 *     screen asks for the ACTION and never for the button:
 *
 *       Controller.setMode('drive');
 *       if (Controller.action('brake')) ...
 *       if (Controller.actionTriggered('view')) ...
 *
 *   ON-SCREEN TIPS
 *     Controller.UI is the badge layer (window.PadUI is kept as its alias): it
 *     stamps the physical face inside every control that declares a role, at
 *     the two ends of every tab strip, and on the pane the right stick moves. A
 *     screen opts a control in by naming the ROLE it plays,
 *
 *       <div class="inspect-btn" data-pad="discard">Discard</div>
 *
 *     but it does not have to: a Back button, a class whose last word is a verb
 *     (`.msb-confirm`, `.kb-detail-close`, `.shop-buy-btn`) and a button whose
 *     visible word is one the verb table knows are all stamped on their own.
 *
 *     A 3D scene, which has no DOM controls to stamp, asks for a tip strip
 *     instead and is answered with the faces of the pad in hand:
 *
 *       Controller.tips([{ face: 'R2', label: 'Zoom' }, { role: 'cancel', label: 'Leave' }]);
 *       Controller.clearTips();
 *
 *   TYPING WITH NO KEYBOARD
 *     A pad cannot type, so a screen that wants words asks for the letter
 *     sheet instead of drawing a field nobody can reach:
 *
 *       Controller.textEntry({ title, value, max, onCommit });
 *       Controller.textEntryOpen()   true while it has the frame
 *
 *     While it is up it answers every press itself, so the screen that opened
 *     it stands down until onCommit (or nothing) comes back.
 *
 *   THE CAMERA
 *     Every 3D minigame swings its camera with the RIGHT STICK, and they all
 *     do it through one object so the feel, the speed and the inverted Y are
 *     the same in all of them:
 *
 *       this._orbit = Controller.orbit({ minPitch: -0.4, maxPitch: 0.9 });
 *       this._orbit.update(dt);                 // once a frame
 *       this._orbit.applyTo(camera, lookPoint); // after the game placed it
 *
 *     applyTo() swings the camera the game just placed around the point it is
 *     looking at, so a scripted or lerped camera keeps its shot and the player
 *     still gets to look around it.
 * ============================================================================
 */

(() => {
    'use strict';

    const params = PluginManager.parameters('Core/ControllerSystem');
    const DEFAULT_CAM_SPEED = Number(params['cameraSpeed'] || 1.0);
    const DEFAULT_INVERT_Y = String(params['invertY'] || 'false') === 'true';

    const TX = (key, args) => (typeof window.T === 'function' ? window.T(key, args) : key);

    //=========================================================================
    // Ports: which pads are real, and who is holding which
    //=========================================================================
    // navigator.getGamepads() is a sparse array of everything the browser has
    // ever seen, ghosts included: a disconnected pad keeps its slot, and on
    // Windows one physical controller is routinely listed twice, once through
    // XInput and once as a DirectInput HID that never reports a button. Both
    // inflate the list, and a list that says two pads are plugged in when one
    // is decides that the player holding it is player two.
    //
    // So a pad counts only if it is connected AND has buttons, and the order is
    // its own index, sorted: the same list, in the same order, for the split
    // screen, the badges and every scene that reads one.
    function rawPads() {
        return navigator.getGamepads ? (navigator.getGamepads() || []) : [];
    }

    //=========================================================================
    // One read of the pads per frame: PadSnapshot
    //=========================================================================
    // navigator.getGamepads() is not a property read. Chromium builds a fresh
    // snapshot of every pad on each call, and on Windows that costs a sizeable
    // fraction of a millisecond. A map frame used to ask for it six to ten
    // times: core's own poll, the analog helper, the device tracker in
    // MouseControls, this file's ports and edges, the split screen, each on
    // its own. The answers were identical, because nothing in a frame waits
    // for the pad to change, so the frame now pays for ONE of them.
    //
    // The array is kept until either of two things happens:
    //   * a new Input.update begins (see the wrapper at the bottom of this
    //     file), so every engine frame, including the catch-up frames
    //     SceneManager runs back to back inside a single tick, reads its own;
    //   * the task that filled it ends. The expiry is a microtask, and the
    //     browser drains microtasks after every callback, so a minigame's own
    //     requestAnimationFrame loop, a setInterval poll (the piano) or a DOM
    //     handler always starts from a live read even when Graphics.frameCount
    //     is standing still because no engine frame has run.
    // Sharing inside one task is exactly what calling again would give: the
    // Gamepad objects are snapshots in Chromium, never live views.
    //
    // Anything that truly needs a read of its own uses Controller.livePads(),
    // or calls navigator.getGamepads.__original with navigator as `this`.
    const PadSnapshot = (() => {
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (!nav || typeof nav.getGamepads !== 'function') {
            return { installed: false, expire() {}, live: () => [] };
        }
        const existing = nav.getGamepads.__padSnapshot;
        if (existing) return existing;
        const original = nav.getGamepads;
        const defer = typeof queueMicrotask === 'function'
            ? queueMicrotask
            : (fn) => Promise.resolve().then(fn);
        let cached = null;
        const expire = () => { cached = null; };
        const live = () => original.call(nav) || [];
        const memo = function () {
            if (cached !== null) return cached;
            cached = live();
            defer(expire);
            return cached;
        };
        const api = { installed: true, expire, live, original };
        memo.__original = original;
        memo.__padSnapshot = api;
        try {
            Object.defineProperty(nav, 'getGamepads', {
                value: memo, writable: true, configurable: true, enumerable: true
            });
        } catch (e) {
            return { installed: false, expire() {}, live };
        }
        return api;
    })();

    function isRealPad(pad) {
        return !!(pad && pad.connected !== false && pad.buttons && pad.buttons.length);
    }

    const Controller = {
        // i18n-ignore-start  physical controller button ids
        FACE: {
            A: 0, B: 1, X: 2, Y: 3,
            L1: 4, R1: 5, L2: 6, R2: 7,
            SELECT: 8, START: 9, L3: 10, R3: 11,
            UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15
        },
        // i18n-ignore-end

        ports() {
            const out = [];
            const pads = rawPads();
            for (let i = 0; i < pads.length; i++) {
                if (isRealPad(pads[i])) out.push(pads[i].index);
            }
            out.sort((a, b) => a - b);
            return out;
        },

        count() { return this.ports().length; },
        connected() { return this.ports().length > 0; },

        // Which port a player is on. With two pads plugged in they are handed
        // out in order; with one, it belongs to player one on its own and to
        // player two in a split screen session, where player one is at the
        // keyboard. That rule lived in SplitScreenMultiplayer and is the same
        // rule here so the two can never disagree about who is holding what.
        portOf(player) {
            const ports = this.ports();
            const p = player || 0;
            if (p === 0) {
                if (ports.length >= 2) return ports[0];
                return this.isSplitScreen() ? -1 : (ports.length ? ports[0] : -1);
            }
            if (ports.length >= 2) return ports[1];
            if (ports.length === 1) return this.isSplitScreen() ? ports[0] : -1;
            return -1;
        },

        isSplitScreen() {
            return !!(typeof $gameSplitScreen !== 'undefined' && $gameSplitScreen &&
                (typeof $gameSplitScreen.isActive !== 'function' || $gameSplitScreen.isActive()));
        },

        pad(player) {
            const port = this.portOf(player);
            if (port < 0) return null;
            const pads = rawPads();
            for (let i = 0; i < pads.length; i++) {
                if (isRealPad(pads[i]) && pads[i].index === port) return pads[i];
            }
            return null;
        },

        //---------------------------------------------------------------------
        // Reading one
        //---------------------------------------------------------------------
        // Player 0 with no pad of its own still reads whatever is plugged in:
        // the single player game is one player and one controller, whichever
        // port it landed on.
        _padFor(player) {
            const own = this.pad(player);
            if (own) return own;
            if ((player || 0) !== 0 || this.isSplitScreen()) return null;
            const ports = this.ports();
            return ports.length ? this.pad(0) || this._byPort(ports[0]) : null;
        },

        _byPort(port) {
            const pads = rawPads();
            for (let i = 0; i < pads.length; i++) {
                if (isRealPad(pads[i]) && pads[i].index === port) return pads[i];
            }
            return null;
        },

        // A face by name ('R2') or by index (7).
        _index(face) {
            if (typeof face === 'number') return face;
            const named = this.FACE[String(face).toUpperCase()];
            return typeof named === 'number' ? named : -1;
        },

        value(face, player) {
            const pad = this._padFor(player);
            const i = this._index(face);
            if (!pad || i < 0) return 0;
            const button = (pad.buttons || [])[i];
            if (!button) return 0;
            return typeof button.value === 'number' ? button.value : (button.pressed ? 1 : 0);
        },

        pressed(face, player) { return this.value(face, player) > 0.25; },

        // Edge detection is kept here rather than in the caller, so two screens
        // asking about the same button on the same frame both see the press.
        // The record is per player and per face, and is refreshed once a frame.
        _edge: {},
        _edgeFrame: -1,

        // The whole pad is sampled at once, on the first ask of a frame, rather
        // than button by button as each is asked about. A button nobody asked
        // about this frame is still a button that was released: sampling lazily
        // means a press, a release and a press again across three frames with a
        // reader on only two of them reads as one long hold.
        _edgeState() {
            const frame = (typeof Graphics !== 'undefined' && Graphics.frameCount) || 0;
            if (frame !== this._edgeFrame) {
                this._edgeFrame = frame;
                this._edgePrev = this._edgeNow || {};
                const now = {};
                for (let player = 0; player < 2; player++) {
                    const pad = this._padFor(player);
                    if (!pad) continue;
                    const buttons = pad.buttons || [];
                    for (let i = 0; i < buttons.length; i++) {
                        const b = buttons[i];
                        const v = b ? (typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0)) : 0;
                        now[player + ':' + i] = v > 0.25;
                    }
                }
                this._edgeNow = now;
            }
            return this._edgeNow;
        },

        triggered(face, player) {
            const now = this._edgeState();
            const key = (player || 0) + ':' + this._index(face);
            const was = !!(this._edgePrev && this._edgePrev[key]);
            return !!now[key] && !was;
        },

        // The sticks, through the shared deadzone. Player one reads the helper
        // that RMMZ core is already folding into the d-pad, so a menu and a
        // camera never disagree about where the stick is; another player reads
        // their own pad directly.
        stick(side, player) {
            const right = String(side || 'left').toLowerCase() === 'right';
            const A = window.AnalogStickInput;
            if ((player || 0) === 0 && !this.isSplitScreen() && A) {
                return right ? { x: A.rightX(), y: A.rightY() } : { x: A.leftX(), y: A.leftY() };
            }
            const pad = this._padFor(player);
            if (!pad || !pad.axes) return { x: 0, y: 0 };
            const ax = right ? 2 : 0;
            const dead = (A && A.deadzone) || 0.3;
            const x = pad.axes[ax] || 0;
            const y = pad.axes[ax + 1] || 0;
            const mag = Math.sqrt(x * x + y * y);
            if (mag < dead) return { x: 0, y: 0 };
            const k = ((mag - dead) / (1 - dead)) / mag;
            return { x: x * k, y: y * k };
        },

        // Pulling a trigger claims it for the frame, the way the analog helper
        // has always defined it: a scene zooming with R2 and a screen counting
        // a quantity must not both act on one pull. The right stick is claimed
        // the same way, by stick() above: a camera swinging with it and the
        // game-wide scroll rail must not both act on one push.
        trigger(face, player) {
            const A = window.AnalogStickInput;
            if ((player || 0) === 0 && !this.isSplitScreen() && A) {
                const isLeft = this._index(face) === this.FACE.L2;
                return isLeft ? A.leftTrigger() : A.rightTrigger();
            }
            return this.value(face, player);
        },

        //---------------------------------------------------------------------
        // Which device is in the player's hands
        //---------------------------------------------------------------------
        device() {
            if (typeof Input !== 'undefined' && Input.lastInputDevice) return Input.lastInputDevice();
            return this.connected() ? 'pad' : 'keyboard';
        },

        usingPad() { return this.device() === 'pad'; },

        //=====================================================================
        // Mode bindings
        //=====================================================================
        // What a button DOES depends on what the player is doing, and that is
        // the only thing that changes between these tables: an action names the
        // face that works it and the Input key that works it on a keyboard, so
        // a scene asks for the action and is answered for both devices at once.
        // i18n-ignore-start  physical faces and Input key names
        BINDINGS: {
            menu: {
                confirm: { face: 'A', key: 'ok' },
                cancel: { face: 'B', key: 'cancel' },
                alt: { face: 'X', key: 'shift' },
                extra: { face: 'Y', key: 'menu' },
                tabPrev: { face: 'L1', key: 'pageup' },
                tabNext: { face: 'R1', key: 'pagedown' },
                // In a menu the triggers step the party member the page is
                // showing. A page with no party on it and something to lean
                // into (the phone's screen) reads them as the zoom instead, the
                // same pair that zooms the voxel world; no page reads both.
                partyPrev: { face: 'L2', key: 'partyPrev' },
                partyNext: { face: 'R2', key: 'partyNext' },
                zoomOut: { face: 'L2' },
                zoomIn: { face: 'R2' },
                // Scrolling is not a button: the right stick moves whatever
                // pane the page is reading, pushed the way the page should go
                // (UIScroll in Core/MouseControls.js). Read it with axis().
                scroll: { stick: 'right' }
            },
            // The voxel world, played like a third-person adventure: A
            // activates whatever is in front of you (and gets you out from
            // behind the wheel), Y jumps, X readies, the triggers are the hands
            // on foot and the pedals at the wheel, R3 swaps first and third
            // person, L3 crouches on foot and takes off in a vehicle, the d-pad
            // runs the quick bar and opens the map. There is no second layer:
            // every control has a face of its own. VoxelWorldScene reads the
            // faces (_updatePadButtons) and the legend prints this table.
            //
            // A face with a `key` is also worked by that Input key on a
            // keyboard. A, X and Y carry none: the world lifts them out of
            // RMMZ's mapper while it has the controls, so 'ok' is Space and
            // Enter only, and the pad's A never jumps.
            drive: {
                accelerate: { face: 'R2' },
                brake: { face: 'L2' },
                door: { face: 'A' },
                boost: { face: 'X' },
                handbrake: { face: 'Y' },
                back: { face: 'B', key: 'cancel' },
                dive: { face: 'L1' },
                vehicle: { face: 'R1' },
                flight: { face: 'L3' },
                view: { face: 'R3' },
                zoomIn: { face: 'UP' },
                zoomOut: { face: 'DOWN' },
                map: { face: 'LEFT' },
                respawn: { face: 'RIGHT' },
                help: { face: 'START' },
                exit: { face: 'SELECT', key: 'wmrToggle' }
            },
            // At the helm of something that flies: a starship over a world, or
            // a broom. The left stick still yaws, the RIGHT STICK IS THE NOSE,
            // the pedals are the thrust and the brake, and the shoulders trim
            // the altitude - so every flight control a keyboard has is
            // reachable from the pad as well.
            fly: {
                thrust: { face: 'R2' },
                brake: { face: 'L2' },
                door: { face: 'A' },
                boost: { face: 'X' },
                climb: { face: 'Y' },
                back: { face: 'B', key: 'cancel' },
                descend: { face: 'L1', key: 'pageup' },
                climbTrim: { face: 'R1' },
                land: { face: 'L3' },
                view: { face: 'R3' },
                zoomIn: { face: 'UP' },
                zoomOut: { face: 'DOWN' },
                map: { face: 'LEFT' },
                help: { face: 'START' },
                exit: { face: 'SELECT', key: 'wmrToggle' }
            },
            walk: {
                interact: { face: 'A' },
                jump: { face: 'Y' },
                ready: { face: 'X' },
                back: { face: 'B', key: 'cancel' },
                bar: { face: 'L1', key: 'pageup' },
                dig: { face: 'R1', key: 'pagedown' },
                attack: { face: 'R2' },
                place: { face: 'L2' },
                crouch: { face: 'L3' },
                view: { face: 'R3' },
                map: { face: 'LEFT' },
                help: { face: 'START' },
                exit: { face: 'SELECT', key: 'wmrToggle' }
            },
            dream: {
                interact: { face: 'A', key: 'ok' },
                wake: { face: 'B', key: 'cancel' },
                run: { face: 'X', key: 'shift' },
                look: { face: 'Y' },
                swing: { face: 'R1', key: 'pagedown' },
                zoomOut: { face: 'L2' },
                zoomIn: { face: 'R2' }
            },
            minigame: {
                act: { face: 'A', key: 'ok' },
                leave: { face: 'B', key: 'cancel' },
                alt: { face: 'X', key: 'shift' },
                view: { face: 'Y', key: 'menu' },
                prev: { face: 'L1', key: 'pageup' },
                next: { face: 'R1', key: 'pagedown' },
                zoomOut: { face: 'L2' },
                zoomIn: { face: 'R2' },
                recentre: { face: 'R3' }
            }
        },
        // i18n-ignore-end

        _mode: 'menu',

        setMode(name) {
            this._mode = this.BINDINGS[name] ? name : 'menu';
            return this._mode;
        },

        mode() { return this._mode; },

        binding(action, mode) {
            const table = this.BINDINGS[mode || this._mode] || this.BINDINGS.menu;
            return table[action] || null;
        },

        //---------------------------------------------------------------------
        // The second layer
        //---------------------------------------------------------------------
        // A pad has four faces, two shoulders and a d-pad. The voxel world has
        // more than that to do: on foot alone there is dig, place, jump, run,
        // crouch, interact, the quick bar, the map and the way out, and every
        // one of them was on a key. The ones that would not fit moved to a
        // layer instead of nowhere: hold L2 and the faces mean something else,
        // the way a keyboard holds Shift.
        //
        // L2 alone still zooms, which is what it does everywhere else in the
        // game and costs nothing here: a zoom is analog and springs back. What
        // must not happen is L2+A reading as a jump as well as an interact, so
        // a plain binding is deaf while the layer is held and a layered one is
        // deaf while it is not.
        CHORD_FACE: 'L2',

        chordHeld(player) { return this.pressed(this.CHORD_FACE, player); },

        // Whether this binding's FACE is live right now. The key half is never
        // gated: a keyboard has its own key for each of these and no layer.
        // A mode with nothing on the layer has no layer: there L2 is simply
        // L2 (the voxel world's brake, a menu's previous member), never a
        // button that silences the rest of the pad.
        _faceLive(bind, player) {
            if (!bind.face) return false;
            if (!this.chordActions().length) return !bind.chord;
            return this.chordHeld(player) === !!bind.chord;
        },

        action(name, player) {
            const bind = this.binding(name);
            if (!bind) return false;
            if (this._faceLive(bind, player) && this.pressed(bind.face, player)) return true;
            return !!(bind.key && (player || 0) === 0 &&
                typeof Input !== 'undefined' && Input.isPressed(bind.key));
        },

        actionTriggered(name, player) {
            const bind = this.binding(name);
            if (!bind) return false;
            if (this._faceLive(bind, player) && this.triggered(bind.face, player)) return true;
            return !!(bind.key && (player || 0) === 0 &&
                typeof Input !== 'undefined' && Input.isTriggered(bind.key));
        },

        // An action worked by a stick rather than by a button: {x, y} of the
        // stick it names, and reading it claims that stick for the frame.
        axis(name, player) {
            const bind = this.binding(name);
            if (!bind || !bind.stick) return { x: 0, y: 0 };
            return this.stick(bind.stick, player);
        },

        // The face an action wears, for a tip strip or a badge. An action on the
        // second layer wears the pair that works it, written as the player has
        // to press it.
        faceOf(action, mode) {
            const bind = this.binding(action, mode);
            // i18n-ignore-next-line  physical button faces
            if (bind && bind.face) return bind.chord ? this.CHORD_FACE + '+' + bind.face : bind.face;
            if (bind && bind.stick) return bind.stick === 'right' ? 'RS' : 'LS';
            return '';
        },

        // Every action of a mode that sits on the second layer, for a legend
        // that shows what the layer does while it is held.
        chordActions(mode) {
            const table = this.BINDINGS[mode || this._mode] || this.BINDINGS.menu;
            return Object.keys(table).filter((name) => table[name].chord);
        },

        //=====================================================================
        // The camera every 3D scene swings with the right stick
        //=====================================================================
        cameraSpeed() {
            const cfg = (typeof ConfigManager !== 'undefined' && ConfigManager.padCameraSpeed);
            const value = typeof cfg === 'number' ? cfg / 100 : DEFAULT_CAM_SPEED;
            return Math.max(0.2, Math.min(3, value));
        },

        invertCameraY() {
            if (typeof ConfigManager !== 'undefined' && ConfigManager.padCameraInvertY !== undefined) {
                return !!ConfigManager.padCameraInvertY;
            }
            return DEFAULT_INVERT_Y;
        },

        orbit(options) { return new Orbit(options || {}); }
    };

    //=========================================================================
    // Orbit - the right stick, in front of any camera
    //=========================================================================
    // A minigame camera is rarely free: it is lerped toward a shot the game
    // picked, or parked on a rail. So the stick does not DRIVE the camera, it
    // swings whatever the game already placed around the point it is looking
    // at, and lets go again when the player lets go (recentre). That way a
    // scripted shot survives being looked around.
    class Orbit {
        constructor(opts) {
            this.yaw = 0;
            this.pitch = 0;
            this.zoom = 1;
            this.player = opts.player || 0;
            this.speed = opts.speed !== undefined ? opts.speed : 1;
            this.minPitch = opts.minPitch !== undefined ? opts.minPitch : -0.55;
            this.maxPitch = opts.maxPitch !== undefined ? opts.maxPitch : 1.05;
            this.minYaw = opts.minYaw !== undefined ? opts.minYaw : -Math.PI;
            this.maxYaw = opts.maxYaw !== undefined ? opts.maxYaw : Math.PI;
            this.minZoom = opts.minZoom !== undefined ? opts.minZoom : 0.55;
            this.maxZoom = opts.maxZoom !== undefined ? opts.maxZoom : 2.2;
            // A camera that is meant to keep its own shot glides back to it
            // once the stick is let go; one that is meant to stay where the
            // player left it sets recentre to 0.
            this.recentre = opts.recentre !== undefined ? opts.recentre : 0.9;
            this.triggersZoom = opts.triggersZoom !== false;
            // A 3D scene has no buttons to stamp a badge inside, so it says what
            // the pad does in a strip of its own instead.
            this.showTips = opts.tips !== false;
            this._touched = false;
        }

        _showTips() {
            const tips = [{ face: 'R3', label: TX('Controller.tips.recentre') }];
            if (this.triggersZoom) tips.unshift({ face: 'R2', label: TX('Controller.tips.zoom') });
            Controller.tips(tips);
        }

        // Whether the player has moved this camera off the shot at all.
        active() { return this._touched; }

        reset() {
            this.yaw = this.pitch = 0;
            this.zoom = 1;
            this._touched = false;
        }

        update(dt) {
            // A scene with a camera on the right stick is a minigame as far as
            // the buttons are concerned, and it says so every frame: the mode
            // is cleared on every scene change, so nothing has to remember to
            // put it back.
            Controller.setMode('minigame');
            if (this.showTips) this._showTips();
            const step = Math.max(0, Math.min(0.1, dt || 1 / 60));
            const stick = Controller.stick('right', this.player);
            const gain = 2.2 * this.speed * Controller.cameraSpeed();
            const invert = Controller.invertCameraY() ? -1 : 1;
            let moved = false;

            if (stick.x) {
                this.yaw = clamp(this.yaw + stick.x * gain * step, this.minYaw, this.maxYaw);
                moved = true;
            }
            if (stick.y) {
                this.pitch = clamp(this.pitch - stick.y * invert * gain * step,
                    this.minPitch, this.maxPitch);
                moved = true;
            }
            if (this.triggersZoom) {
                const inward = Controller.trigger('R2', this.player);
                const outward = Controller.trigger('L2', this.player);
                const pull = inward - outward;
                if (Math.abs(pull) > 0.08) {
                    this.zoom = clamp(this.zoom - pull * step * 1.4, this.minZoom, this.maxZoom);
                    moved = true;
                }
            }
            if (Controller.actionTriggered('recentre', this.player)) {
                this.reset();
                return;
            }
            if (moved) this._touched = true;
            else if (this.recentre > 0 && this._touched) {
                const k = 1 - Math.pow(1 - Math.min(0.9, this.recentre * 0.06), step * 60);
                this.yaw += (0 - this.yaw) * k;
                this.pitch += (0 - this.pitch) * k;
                this.zoom += (1 - this.zoom) * k;
                if (Math.abs(this.yaw) < 0.002 && Math.abs(this.pitch) < 0.002 &&
                    Math.abs(this.zoom - 1) < 0.004) {
                    this.reset();
                }
            }
        }

        // Swing a camera the game has already placed around the point it looks
        // at. `look` is that point: a THREE.Vector3, or any {x, y, z}.
        applyTo(camera, look) {
            if (!camera || !this._touched) return;
            const at = look || { x: 0, y: 0, z: 0 };
            let dx = camera.position.x - at.x;
            let dy = camera.position.y - at.y;
            let dz = camera.position.z - at.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;

            // Spherical, around the look point: the yaw turns the shot, the
            // pitch lifts it, the zoom pulls the whole arm in or out.
            const flat = Math.sqrt(dx * dx + dz * dz);
            let azimuth = Math.atan2(dx, dz);
            let elevation = Math.atan2(dy, flat || 0.0001);
            azimuth += this.yaw;
            elevation = clamp(elevation + this.pitch, -1.45, 1.45);
            const radius = dist * this.zoom;
            const cosE = Math.cos(elevation);
            camera.position.set(
                at.x + Math.sin(azimuth) * cosE * radius,
                at.y + Math.sin(elevation) * radius,
                at.z + Math.cos(azimuth) * cosE * radius
            );
            if (camera.lookAt) camera.lookAt(at.x, at.y, at.z);
        }
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    //=========================================================================
    // The badge layer: the physical face, inside the control it works
    //=========================================================================
    // A menu used to read the same on a keyboard and on a pad: a Back button
    // that says Back, a Discard button that says Discard, and no way to know
    // which button on the thing in your hands does either. The letters live
    // here, in one table, and are stamped onto the controls themselves while a
    // pad is the device in use, and taken straight off again the moment a key
    // is pressed. No screen writes a button face of its own.
    const PadUI = {
        // i18n-ignore-start  physical button faces, not prose
        BUTTON: {
            confirm: 'A',
            cancel: 'B',
            alt: 'X',
            extra: 'Y',
            tabPrev: 'L1',
            tabNext: 'R1',
            partyPrev: 'L2',
            partyNext: 'R2',
            scroll: 'RS',
            scrollUp: 'RS\u2191',
            scrollDown: 'RS\u2193',
            stick: 'L3',
            // The four directions as one thing, for a tip strip that says what
            // the pad's cross does rather than what one edge of it does.
            dpad: 'D-Pad',
            select: 'Select',
            start: 'Start'
        },
        // What a control called `data-pad="<role>"` is pressed with. Roles are
        // named after what the control DOES, so the same verb wears the same
        // button on every screen in the game.
        ROLES: {
            confirm: 'confirm',
            use: 'confirm',
            select: 'confirm',
            buy: 'confirm',
            sell: 'confirm',
            equip: 'confirm',
            craft: 'confirm',
            continue: 'confirm',
            cancel: 'cancel',
            back: 'cancel',
            close: 'cancel',
            exit: 'cancel',
            discard: 'extra',
            drop: 'extra',
            delete: 'extra',
            remove: 'extra',
            sort: 'alt',
            filter: 'alt',
            favorite: 'alt',
            tabPrev: 'tabPrev',
            tabNext: 'tabNext',
            prev: 'tabPrev',
            next: 'tabNext',
            partyPrev: 'partyPrev',
            partyNext: 'partyNext'
        },
        // i18n-ignore-end

        BADGE_CLASS: 'pad-badge',

        active() { return Controller.usingPad(); },

        glyph(role) {
            if (!role) return '';
            const mapped = this.ROLES[role] || role;
            return this.BUTTON[mapped] || (Controller.FACE[String(role).toUpperCase()] !== undefined
                ? String(role).toUpperCase() : '');
        },

        badge(role) {
            if (!this.active()) return '';
            const face = this.glyph(role);
            return face ? `<span class="${this.BADGE_CLASS}">${face}</span>` : '';
        },

        //---------------------------------------------------------------------
        // What a control is, without it having to say
        //---------------------------------------------------------------------
        // In this order: what it declares, the one class every Back button in
        // the game wears, the last word of its own class name, and failing all
        // three the word written on it. A screen names its buttons after what
        // they do (`.msb-confirm`, `.shop-buy-btn`, `.kb-detail-close`), so a
        // class whose last meaningful word is a verb this table knows is that
        // verb. Matching one word only is what keeps `.travel-confirm-panel` (a
        // panel) and `.ui-closed` (a state) out of it. `data-pad="none"` opts a
        // control out.
        CLASS_ROLES: {
            confirm: 'confirm', accept: 'confirm', apply: 'confirm', ok: 'confirm',
            done: 'confirm', use: 'confirm', buy: 'confirm', sell: 'confirm',
            equip: 'confirm', craft: 'confirm', continue: 'confirm',
            cancel: 'cancel', close: 'cancel', back: 'cancel', exit: 'cancel',
            quit: 'cancel', leave: 'cancel',
            discard: 'discard', drop: 'discard', delete: 'discard', remove: 'discard',
            sort: 'sort', filter: 'sort'
        },

        // A class name ends in what the thing IS: `.travel-confirm-panel` is a
        // panel and `.msb-confirm` is the button. So the verb is looked for in
        // the last word only, and behind a trailing `btn` / `button`, which is
        // how half the game names its controls (`.shop-buy-btn`).
        NOUN_SUFFIX: { btn: 1, button: 1, buttons: 1, ctl: 1, control: 1 },

        _classRole(token) {
            const words = String(token).toLowerCase().split('-').filter(Boolean);
            while (words.length && this.NOUN_SUFFIX[words[words.length - 1]]) words.pop();
            if (!words.length) return null;
            return this.CLASS_ROLES[words[words.length - 1]] || null;
        },

        // Words a button may be WEARING, in whatever language is loaded. The
        // English bank is the fallback and the localised one is laid over it,
        // so an Italian Annulla is a Cancel button too.
        _verbTable() {
            const frame = (typeof Graphics !== 'undefined' && Graphics.frameCount) || 0;
            // The bank is rebuilt rarely: a language change is the only thing
            // that moves it, and once every few seconds is soon enough.
            if (this._verbs && frame - (this._verbsAt || 0) < 300) return this._verbs;
            const table = {};
            for (const role of Object.keys(this.ROLES)) {
                const words = (typeof window.T === 'function' && window.T.list)
                    ? window.T.list('Controller.verbs.' + role) : null;
                if (!Array.isArray(words)) continue;
                for (const word of words) {
                    const key = String(word || '').trim().toLowerCase();
                    if (key) table[key] = role;
                }
            }
            this._verbs = table;
            this._verbsAt = frame;
            return table;
        },

        // The word a control is wearing, with any badge already inside it left
        // out, and only if it is a word rather than a sentence: a paragraph
        // that happens to end in "close" is not a Close button.
        _labelRole(el) {
            if (!el || !el.textContent) return null;
            const badge = el.querySelector && el.querySelector('.' + this.BADGE_CLASS);
            let text = el.textContent;
            if (badge && badge.textContent) text = text.replace(badge.textContent, '');
            text = text.replace(/\s+/g, ' ').trim().toLowerCase();
            if (!text || text.length > 24 || text.split(' ').length > 3) return null;
            return this._verbTable()[text] || null;
        },

        roleOf(el) {
            const named = el.getAttribute && el.getAttribute('data-pad');
            if (named) return named === 'none' ? null : named;
            if (!el.classList) return null;
            if (el.classList.contains('back-button')) return 'cancel';
            for (const token of el.classList) {
                const role = this._classRole(token);
                if (role) return role;
            }
            return this._labelRole(el);
        },

        markOne(el, on) {
            const role = this.roleOf(el);
            if (!role) return;
            if (!on || !this.glyph(role)) {
                this.unstamp(el);
                return;
            }
            // The face always reads after the word, Back included: the button
            // is the sentence and the face is what presses it, "Back (B)".
            this.stamp(el, this.glyph(role), false);
        },

        // The tab strips: L1 and R1 step them everywhere, so a strip says so at
        // its two ends rather than every screen printing a legend of its own.
        // Any strip whose class ends in the word is one, which is what carries
        // the twenty-odd strips that never declared anything.
        TAB_STRIPS: '.backpack-tabs, [class$="tabs"], [class*="tabs "], ' +
            '[class$="tab-bar"], [class*="tab-bar "], [class$="tabstrip"], [class*="tabstrip "]',

        decorateTabs(scope, on) {
            let strips;
            try { strips = scope.querySelectorAll(this.TAB_STRIPS); } catch (e) { return; }
            for (const strip of strips) {
                // `children` is elements only, whatever the host: the text
                // between two tabs is not a tab.
                const tabs = Array.prototype.slice.call(strip.children || []);
                // Whatever the strip was wearing comes off first: a strip is
                // redrawn as the player walks it, and a device can change
                // between two redraws. The two ends keep theirs when they are
                // about to wear it again, since stamp() corrects a badge in
                // place: pulling it off and putting it back is a mutation, the
                // observer above answers every mutation with another decorate,
                // and a strip on screen kept the whole document query running
                // every frame.
                const ends = on && tabs.length >= 2;
                for (let i = 0; i < tabs.length; i++) {
                    if (ends && (i === 0 || i === tabs.length - 1)) continue;
                    this.unstamp(tabs[i]);
                }
                if (!ends) continue;
                this.stamp(tabs[0], this.BUTTON.tabPrev, true);
                this.stamp(tabs[tabs.length - 1], this.BUTTON.tabNext, false);
            }
        },

        // The party switcher: L2 and R2 step the member a page is showing, on
        // every screen that shows one, so its two ends say so the way a tab
        // strip's do.
        SWITCHERS: '.companion-switcher, .companion-tabs-row',

        decorateSwitchers(scope, on) {
            let rows;
            try { rows = scope.querySelectorAll(this.SWITCHERS); } catch (e) { return; }
            for (const row of rows) {
                // A switcher nested in another is walked once, from the outer one.
                if (row.parentElement && row.parentElement.closest &&
                    row.parentElement.closest(this.SWITCHERS)) continue;
                if (!row.querySelectorAll) continue;
                const tabs = Array.prototype.slice.call(row.querySelectorAll('.companion-tab'));
                // The ends are restamped in place, for the reason given in
                // decorateTabs above.
                const ends = on && tabs.length >= 2;
                for (let i = 0; i < tabs.length; i++) {
                    if (ends && (i === 0 || i === tabs.length - 1)) continue;
                    this.unstamp(tabs[i]);
                }
                if (!ends) continue;
                this.stamp(tabs[0], this.BUTTON.partyPrev, true);
                this.stamp(tabs[tabs.length - 1], this.BUTTON.partyNext, false);
            }
        },

        unstamp(el) {
            const badge = el && el.querySelector && el.querySelector('.' + this.BADGE_CLASS);
            if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
        },

        stamp(el, face, first) {
            if (!el || !face) return;
            const existing = el.querySelector && el.querySelector('.' + this.BADGE_CLASS);
            if (existing) {
                if (existing.textContent !== face) existing.textContent = face;
                // A badge stamped by an older build, or by a strip that wants
                // it at the other end, is moved rather than left where it was.
                const wanted = first ? el.firstChild : el.lastChild;
                if (wanted !== existing) {
                    if (first) el.insertBefore(existing, el.firstChild);
                    else el.appendChild(existing);
                }
                return;
            }
            const badge = document.createElement('span');
            badge.className = this.BADGE_CLASS;
            badge.textContent = face;
            if (first) el.insertBefore(badge, el.firstChild);
            else el.appendChild(badge);
        },

        // Everything that could be a control: what declares itself, the Back
        // button, anything named like a button and anything shaped like one.
        MARK_SELECTOR: '[data-pad], .back-button, button, [role="button"], ' +
            '[class*="btn"], [class*="button"], [class$="confirm"], [class*="confirm "], ' +
            '[class$="cancel"], [class*="cancel "], [class$="close"], [class*="close "], ' +
            '[class$="accept"], [class*="accept "], [class$="apply"], [class*="apply "], ' +
            '[class$="discard"], [class*="discard "], [class$="drop"], [class*="drop "]',

        decorate(root) {
            const scope = root || document;
            if (!scope.querySelectorAll) return;
            const on = this.active();
            let marks;
            try { marks = scope.querySelectorAll(this.MARK_SELECTOR); } catch (e) { return; }
            for (const el of marks) this.markOne(el, on);
            this.decorateTabs(scope, on);
            this.decorateSwitchers(scope, on);
        },

        //---------------------------------------------------------------------
        // The right stick, on the pane it scrolls
        //---------------------------------------------------------------------
        // The right stick moves whatever pane the page is reading (UIScroll),
        // and that is the one thing about it a player cannot guess. So while a
        // pad is in hand the pane says so itself: the stick pushed up at the
        // top edge, pushed down at the bottom, each one lit only while there is
        // somewhere to go that way.
        RAIL_ID: 'pad-rails',

        // Raised on the first rail and then left standing. It used to be taken
        // out of the document whenever no pane scrolled, because an empty div
        // the size of the window, over everything, was read as a page covering
        // the game view by window.FrameBudget (Core/ParchmentToast.js) - and
        // the party cards (UI/PartyHud.js) took themselves down on every map
        // because of it. FrameBudget answers that itself now: its
        // paintsNothing() exempts a layer that takes no clicks and lays no
        // ground, which is exactly this one. Taking it in and out of the
        // document on a six-frame tick was half of the flicker, so it stays.
        railLayer(create) {
            let layer = document.getElementById(this.RAIL_ID);
            if (!layer && create) {
                layer = document.createElement('div');
                layer.id = this.RAIL_ID;
                if (document.body) document.body.appendChild(layer);
            }
            return layer || null;
        },

        // ONE definition of "a pane", shared with the file that actually moves
        // them (UIScroll in Core/MouseControls.js). A rail over a pane the
        // stick would never have picked promises something the stick does not
        // do, which is worse than no rail at all.
        scrollPanes() {
            const UIScroll = window.UIScroll;
            if (!UIScroll || !UIScroll.topOverlay) return [];
            const overlay = UIScroll.topOverlay();
            if (!overlay) return [];
            return UIScroll.scrollablePanes(overlay);
        },

        // Chips belong to their PANE, not to a slot in the layer. Menus in this
        // game rebuild their innerHTML on every cursor move - that is why the
        // badges are put back by a MutationObserver rather than by each screen
        // remembering - so a list indexed by position reassigned every chip
        // whenever a pane appeared, went or merely changed order, and the pair
        // visibly jumped. A pane that survives a rebuild keeps its own two
        // nodes.
        railChips(pane) {
            if (!this._railChips) this._railChips = new WeakMap();
            const layer = this.railLayer(true);
            if (!layer) return null;
            let pair = this._railChips.get(pane);
            if (pair && pair[0].parentNode === layer && pair[1].parentNode === layer) {
                return pair;
            }
            const make = () => {
                const chip = document.createElement('div');
                chip.className = 'pad-rail-chip';
                layer.appendChild(chip);
                return chip;
            };
            pair = [make(), make()];
            this._railChips.set(pane, pair);
            return pair;
        },

        // The `spent` half of a rail is the only part that has to keep up with
        // the player: it says whether there is anywhere left to go that way, and
        // it changes on the frame the pane moves. Geometry is re-measured on the
        // slow tick; this runs the moment something scrolls (see UIScroll).
        markRailEnds(pane) {
            const pair = this._railChips && this._railChips.get(pane);
            if (!pair) return;
            pair[0].classList.toggle('spent', pane.scrollTop <= 1);
            pair[1].classList.toggle('spent',
                pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1);
        },

        // Off with the stick scrolling it advertised (UIScroll in
        // Core/MouseControls.js): a chip promising the stick scrolls this pane
        // is a lie once the stick does nothing, so no rail is ever drawn.
        RAILS_ENABLED: false,

        updateRails() {
            const layer = document.getElementById(this.RAIL_ID);
            const panes = (this.RAILS_ENABLED && this.active()) ? this.scrollPanes() : [];
            if (!panes.length) {
                if (layer) {
                    layer.classList.add('empty');
                    while (layer.firstChild) layer.removeChild(layer.firstChild);
                }
                return;
            }
            const live = new Set();
            for (const pane of panes) {
                const pair = this.railChips(pane);
                if (!pair) continue;
                live.add(pair[0]);
                live.add(pair[1]);
                const box = pane.getBoundingClientRect();
                // Measured, not assumed: the handheld stylesheet had to pin the
                // chip to 18px only because that number was written in here.
                const tall = pair[1].offsetHeight || 18;
                // Clear of the native scrollbar rather than on top of it.
                const x = box.right - this.RAIL_GUTTER;
                const place = (chip, face, y, spent) => {
                    if (chip.textContent !== face) chip.textContent = face;
                    chip.classList.toggle('spent', spent);
                    chip.style.setProperty('--ui-at-x', Math.round(x) + 'px');
                    chip.style.setProperty('--ui-at-y', Math.round(y) + 'px');
                };
                // i18n-ignore-start  physical button faces
                place(pair[0], this.BUTTON.scrollUp, box.top + 2,
                    pane.scrollTop <= 1);
                place(pair[1], this.BUTTON.scrollDown, box.bottom - tall - 2,
                    pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1);
                // i18n-ignore-end
            }
            const host = this.railLayer(true);
            if (!host) return;
            host.classList.remove('empty');
            // Chips whose pane is gone. Removed by identity, so the survivors
            // are never touched.
            for (const chip of Array.from(host.children)) {
                if (!live.has(chip)) host.removeChild(chip);
            }
        },

        // How far in from the pane's right edge a chip hangs: enough to clear
        // the native scrollbar the pane draws there.
        RAIL_GUTTER: 18,

        //---------------------------------------------------------------------
        // The tip strip, for the screens that have no controls to stamp
        //---------------------------------------------------------------------
        // A 3D scene is not a page of buttons: there is nothing to put a badge
        // inside. So it declares what its buttons do and the strip is written
        // for it, in the faces of the pad in hand, and taken away the moment
        // the player picks the keyboard back up.
        TIPS_ID: 'pad-tips',

        tips(list) {
            this._tips = Array.isArray(list) && list.length ? list.slice() : null;
            this.renderTips();
        },

        clearTips() { this.tips(null); },

        renderTips() {
            let bar = document.getElementById(this.TIPS_ID);
            const list = this._tips;
            if (!list || !this.active()) {
                if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
                return;
            }
            if (!bar) {
                bar = document.createElement('div');
                bar.id = this.TIPS_ID;
                if (document.body) document.body.appendChild(bar);
            }
            const html = list.map((tip) => {
                const face = tip.face ? this.glyph(tip.face) : this.glyph(tip.role);
                if (!face) return '';
                return `<span class="pad-tip"><span class="${this.BADGE_CLASS}">${face}</span>` +
                    `<span class="pad-tip-label">${tip.label || ''}</span></span>`;
            }).join('');
            if (bar.innerHTML !== html) bar.innerHTML = html;
        },

        //---------------------------------------------------------------------
        // Live
        //---------------------------------------------------------------------
        // Menus are redrawn wholesale (a page rebuilds its innerHTML on every
        // cursor move), so the badges are put back by watching the document
        // rather than by asking every screen to remember to call decorate().
        install() {
            if (this._installed || typeof document === 'undefined') return;
            this._installed = true;
            this._lastDevice = null;
            if (window.MutationObserver && document.body) {
                this._observer = new MutationObserver(() => { this._dirty = true; });
                this._observer.observe(document.body, { childList: true, subtree: true });
            }
            const _updateScene = SceneManager.updateScene;
            SceneManager.updateScene = function () {
                // The letter sheet is read AHEAD of the scene and then spends
                // the whole frame: the screen that opened it, the hotkeys and
                // any other reader of Input must not answer the same press.
                // Read after the scene, a B that cancelled the sheet also
                // backed the screen under it out.
                if (PadText.isOpen()) {
                    PadText.update();
                    UINav.handled();
                }
                _updateScene.apply(this, arguments);
                PadUI.frame();
            };
        },

        frame() {
            // A scene change is the end of whatever the last screen was doing:
            // its mode and its tip strip go with it, so nothing is inherited by
            // the screen that follows. A screen that wants either back asks for
            // it again on its own next frame, which is how the voxel world and
            // the dream keep theirs.
            const scene = (typeof SceneManager !== 'undefined' && SceneManager._scene) || null;
            if (scene !== this._lastScene) {
                this._lastScene = scene;
                Controller.setMode('menu');
                this._tips = null;
            }
            // The letter sheet is read before the scene, in install() above.
            const device = this.active();
            if (device !== this._lastDevice) {
                this._lastDevice = device;
                this._dirty = true;
                // One class on the body is how the stylesheet knows: the
                // keyboard-only controls (a search field nobody can type into
                // on a pad) are taken off screen by a rule rather than by every
                // menu remembering to hide them.
                if (document.body) document.body.classList.toggle('pad-input', device);
                this.renderTips();
            }
            if (this._dirty) {
                this._dirty = false;
                this.decorate(document);
            }
            this._railTick = (this._railTick || 0) + 1;
            if (this._railTick % 6 === 0) this.updateRails();
        }
    };

    Controller.UI = PadUI;
    Controller.tips = (list) => PadUI.tips(list);
    Controller.clearTips = () => PadUI.clearTips();
    Controller.badge = (role) => PadUI.badge(role);
    Controller.glyph = (role) => PadUI.glyph(role);


    //=========================================================================
    // Typing with no keyboard: PadText
    //=========================================================================
    // A pad cannot type. Every screen that asks for words - the name a weapon
    // comes off the fire wearing, the title of a grimorie, the description
    // written over a spell - used to be a dead end the moment the keyboard was
    // put down: the field could not be focused, and the sheet it sat in had no
    // way out. So the letters are drawn instead, once, here, and every one of
    // those screens opens THIS rather than growing a keyboard of its own.
    //
    //   Controller.textEntry({ title, value, max, multiline, onCommit })
    //
    // It reads RMMZ's own Input, so the arrow keys drive it exactly as the
    // d-pad and the left stick do, and a player who still has a keyboard in
    // front of them types into the field the screen already drew instead.
    const PadText = {
        ID: 'pad-text',
        // i18n-ignore-start  the letters themselves are not prose
        ROWS: [
            '1234567890',
            'qwertyuiop',
            'asdfghjkl-',
            'zxcvbnm,.!'
        ],
        SHIFTED: { '-': '_', ',': ';', '.': ':', '!': '?' },
        // i18n-ignore-end

        ACTIONS: ['shift', 'space', 'back', 'clear', 'done', 'cancel'],

        open(opts) {
            const o = opts || {};
            this.close(true);
            this._value = String(o.value || '');
            this._max = Math.max(1, Number(o.max || o.maxLength || 40));
            this._multiline = !!o.multiline;
            this._title = String(o.title || '');
            this._commit = typeof o.onCommit === 'function' ? o.onCommit : null;
            this._abort = typeof o.onCancel === 'function' ? o.onCancel : null;
            this._row = 1;
            this._col = 0;
            this._shift = false;
            this._open = true;
            // The press that asked for the sheet (A on a field, Y on a bench)
            // is spent: it must not also type the key under the cursor.
            UINav.swallowHeld();
            // The strip says what the sheet's own buttons do, and the screen
            // underneath gets its own back the moment the sheet is spent.
            this._heldTips = PadUI._tips || null;
            PadUI.tips(this.tips());
            this.render();
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            return true;
        },

        isOpen() { return !!this._open; },

        close(silent) {
            const el = typeof document !== 'undefined' ? document.getElementById(this.ID) : null;
            if (el && el.parentNode) el.parentNode.removeChild(el);
            if (!this._open) return;
            this._open = false;
            PadUI.tips(this._heldTips);
            this._heldTips = null;
            this._commit = null;
            this._abort = null;
            if (typeof Input !== 'undefined') Input.clear();
            if (typeof TouchInput !== 'undefined') TouchInput.clear();
            if (!silent && typeof SoundManager !== 'undefined') SoundManager.playCancel();
        },

        // The sheet as it stands: the letter rows, then the row of actions, so
        // one pair of coordinates walks the whole of it.
        grid() {
            const rows = this.ROWS.map((row) => row.split('').map((ch) => this.faceOf(ch)));
            rows.push(this.ACTIONS.slice());
            return rows;
        },

        faceOf(ch) {
            if (!this._shift) return ch;
            return this.SHIFTED[ch] || ch.toUpperCase();
        },

        cell() {
            const grid = this.grid();
            const row = grid[Math.min(this._row, grid.length - 1)] || [];
            return row[Math.min(this._col, row.length - 1)];
        },

        isActionRow() { return this._row === this.ROWS.length; },

        type(ch) {
            if (this._value.length >= this._max) {
                if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
                return;
            }
            this._value += ch;
            if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
            this.render();
        },

        backspace() {
            if (!this._value.length) return;
            this._value = this._value.slice(0, -1);
            if (typeof SoundManager !== 'undefined') SoundManager.playCancel();
            this.render();
        },

        commit() {
            const fn = this._commit;
            const value = this._value;
            this._commit = null;
            this._abort = null;
            this.close(true);
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            if (fn) fn(value);
        },

        abort() {
            const fn = this._abort;
            this._commit = null;
            this._abort = null;
            this.close(true);
            if (typeof SoundManager !== 'undefined') SoundManager.playCancel();
            if (fn) fn();
        },

        press() {
            if (!this.isActionRow()) { this.type(this.cell()); return; }
            switch (this.cell()) {
                case 'shift': this._shift = !this._shift; this.render(); break;
                case 'space': this.type(' '); break;
                case 'back': this.backspace(); break;
                case 'clear': this._value = ''; this.render(); break;
                case 'done': this.commit(); break;
                default: this.abort(); break;
            }
        },

        move(dr, dc) {
            const grid = this.grid();
            if (dr) {
                this._row = (this._row + dr + grid.length) % grid.length;
                this._col = Math.min(this._col, grid[this._row].length - 1);
            }
            if (dc) {
                const width = grid[this._row].length;
                this._col = (this._col + dc + width) % width;
            }
            if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
            this.render();
        },

        // Read once a frame, ahead of whatever screen opened the sheet: while
        // it is up nothing else gets the press, and every press is answered,
        // so no key falls through to the page underneath.
        update() {
            if (!this._open || typeof Input === 'undefined') return false;
            const held = (dir) => Input.isTriggered(dir) || Input.isRepeated(dir);
            if (Input.isTriggered('cancel')) { this.abort(); return true; }
            if (Input.isTriggered('menu')) { this.commit(); return true; }
            if (Input.isTriggered('shift')) { this.backspace(); return true; }
            if (Input.isTriggered('ok')) { this.press(); return true; }
            if (held('up')) { this.move(-1, 0); return true; }
            if (held('down')) { this.move(1, 0); return true; }
            if (held('left')) { this.move(0, -1); return true; }
            if (held('right')) { this.move(0, 1); return true; }
            return true;
        },

        label(action) { return TX('Controller.text.' + action); },

        tips() {
            return [
                { role: 'confirm', label: TX('Controller.text.tipKey') },
                { face: 'X', label: TX('Controller.text.back') },
                { face: 'Y', label: TX('Controller.text.done') },
                { role: 'cancel', label: TX('Controller.text.cancel') }
            ];
        },

        render() {
            if (typeof document === 'undefined' || !document.body) return;
            let el = document.getElementById(this.ID);
            if (!el) {
                el = document.createElement('div');
                el.id = this.ID;
                // The focus rings of the DOM menus stand down for a modal
                // rather than clicking whatever is still lit behind it.
                el.setAttribute('data-nav-modal', '');
                document.body.appendChild(el);
            }
            const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
                ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const grid = this.grid();
            let keys = '';
            grid.forEach((row, r) => {
                const action = r === this.ROWS.length;
                const cells = row.map((cell, c) => {
                    const on = (r === this._row && c === this._col) ? ' on' : '';
                    const face = action ? esc(this.label(cell)) : esc(cell);
                    return `<span class="pad-text-key${on}${action ? ' pad-text-key--act' : ''}" ` +
                        `data-pad-key="${esc(cell)}">${face}</span>`;
                }).join('');
                keys += `<div class="pad-text-row">${cells}</div>`;
            });
            el.innerHTML = `
                <div class="pad-text-sheet">
                    <div class="pad-text-title">${esc(this._title)}</div>
                    <div class="pad-text-value">${esc(this._value)}<span class="pad-text-caret">|</span></div>
                    <div class="pad-text-count">${this._value.length} / ${this._max}</div>
                    <div class="pad-text-keys">${keys}</div>
                </div>`;
        }
    };

    Controller.textEntry = (opts) => PadText.open(opts);
    Controller.textEntryOpen = () => PadText.isOpen();
    Controller.closeTextEntry = () => PadText.close();
    Controller.Text = PadText;
    window.PadText = PadText;

    //=========================================================================
    // UINav: the one way a menu reads the pad and the keyboard
    //=========================================================================
    // Every menu in the game answers the same questions the same way:
    //   L1 / R1   (PageUp / PageDown, Shift+Tab / Tab)   the previous / next tab
    //             (Q and W are not tab keys here: W is north in WASD and Q
    //             is the world map's zoom, Map/WorldMap.js)
    //   L2 / R2   (, / .)                    the previous / next party member
    //   the cross / left stick / arrows      move, repeating while held
    // and one press is one action: once a screen has acted on a press it
    // consumes it, and nothing else reading Input that frame sees it again.
    // A modal swallows the press that opened it for the same reason.
    // i18n-ignore-start  Input action names
    if (typeof Input !== 'undefined') {
        if (Input.gamepadMapper) {
            Input.gamepadMapper[6] = 'partyPrev';
            Input.gamepadMapper[7] = 'partyNext';
        }
        if (Input.keyMapper) {
            Input.keyMapper[188] = 'partyPrev'; // ,
            Input.keyMapper[190] = 'partyNext'; // .
        }
    }

    const UINav = {
        _latch: new Set(),
        _all: false,

        // The previous / next tab: -1, 0 or +1.
        tabDir() {
            if (typeof Input === 'undefined') return 0;
            if (Input.isTriggered('pageup')) return -1;
            if (Input.isTriggered('pagedown')) return 1;
            if (Input.isTriggered('tab')) return Input.isPressed('shift') ? -1 : 1;
            return 0;
        },

        // The previous / next party member the page is showing: -1, 0 or +1.
        // Reading it claims the triggers, so no other reader acts on them too.
        partyDir() {
            if (typeof Input === 'undefined') return 0;
            const stick = window.AnalogStickInput;
            if (stick && typeof stick._claimTriggers === 'function') stick._claimTriggers();
            if (Input.isTriggered('partyPrev')) return -1;
            if (Input.isTriggered('partyNext')) return 1;
            return 0;
        },

        // Steps the tab strip drawn in `root` by clicking the neighbour of its
        // active tab, so a screen whose tabs are plain clickable strips gets
        // L1 / R1 without a line of its own. Returns true when a tab turned.
        stepTabs(root, dir) {
            if (!dir || !root || !root.querySelectorAll) return false;
            const pad = window.PadUI;
            const selector = pad && pad.TAB_STRIPS ? pad.TAB_STRIPS : '.backpack-tabs';
            let strips;
            try { strips = root.querySelectorAll(selector); } catch (e) { return false; }
            const shown = (el) => {
                for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
                    if (n.hidden || (n.classList && n.classList.contains('ui-closed'))) return false;
                    const cs = window.getComputedStyle ? window.getComputedStyle(n) : null;
                    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
                }
                return true;
            };
            for (const strip of strips) {
                if (!shown(strip)) continue;
                let tabs = Array.prototype.slice.call(strip.children || []);
                // A strip that wraps its tabs in one row element.
                if (tabs.length === 1 && tabs[0].children && tabs[0].children.length > 1) {
                    tabs = Array.prototype.slice.call(tabs[0].children);
                }
                tabs = tabs.filter((t) => !t.classList.contains('pad-badge') &&
                    !t.classList.contains('is-disabled') && !t.hasAttribute('disabled'));
                if (tabs.length < 2) continue;
                const at = tabs.findIndex((t) => t.classList.contains('active') ||
                    t.classList.contains('selected') || t.getAttribute('aria-selected') === 'true');
                if (at < 0) continue;
                const next = Math.max(0, Math.min(tabs.length - 1, at + dir));
                if (next === at) return true;
                tabs[next].click();
                return true;
            }
            return false;
        },

        // One of the four directions, repeating while it is held, or null.
        navDir() {
            if (typeof Input === 'undefined') return null;
            for (const dir of ['up', 'down', 'left', 'right']) {
                if (Input.isRepeated(dir)) return dir;
            }
            return null;
        },

        // Where a grid cursor goes. Left and right stay on the row and stop at
        // its ends; up and down move a whole row and stop at the edges. A step
        // never wraps into another column. `cols` may be the grid element, in
        // which case the drawn column count is read off it.
        gridStep(index, dir, count, cols) {
            let c = cols;
            if (c && typeof c === 'object') {
                const list = window.MenuVirtualList;
                c = list && typeof list.columnsOf === 'function' ? list.columnsOf(c) : 1;
            }
            c = Math.max(1, Math.floor(Number(c) || 1));
            const n = Math.max(0, Math.floor(Number(count) || 0));
            if (!n) return 0;
            const i = Math.max(0, Math.min(n - 1, Math.floor(Number(index) || 0)));
            const col = i % c;
            const row = Math.floor(i / c);
            const lastRow = Math.floor((n - 1) / c);
            switch (dir) {
                case 'left': return col > 0 ? i - 1 : i;
                case 'right': return col < c - 1 && i + 1 < n ? i + 1 : i;
                case 'up': return row > 0 ? i - c : i;
                case 'down':
                    if (row >= lastRow) return i;
                    return Math.min(i + c, n - 1);
                default: return i;
            }
        },

        // This press has been acted on: nothing else reads it this frame. With
        // no name, every press of the frame is spent.
        consume(action) {
            if (action) this._latch.add(action);
            else this._all = true;
        },
        handled() { this._all = true; },
        consumed(action) {
            if (this._all || this._latch.has(action)) return true;
            // A press swallowed while it was held stays spent until let go.
            if (this._held.has(action)) {
                if (typeof Input !== 'undefined' && Input._currentState && Input._currentState[action]) return true;
                this._held.delete(action);
            }
            return false;
        },

        // The press that opened (or closed) something must not also act in it,
        // this frame or while it is still held down.
        _held: new Set(),
        swallowHeld() {
            if (typeof Input !== 'undefined' && Input._currentState) {
                for (const name of Object.keys(Input._currentState)) {
                    if (Input._currentState[name]) this._held.add(name);
                }
            }
            this._all = true;
        },

        _frame() {
            this._latch.clear();
            this._all = false;
        }
    };
    // i18n-ignore-end

    if (typeof Input !== 'undefined') {
        const _Input_update = Input.update;
        Input.update = function () {
            // A new engine frame reads the pads afresh (see PadSnapshot).
            PadSnapshot.expire();
            UINav._frame();
            return _Input_update.apply(this, arguments);
        };
        const _isTriggered = Input.isTriggered;
        Input.isTriggered = function (name) {
            if (UINav.consumed(name)) return false;
            return _isTriggered.apply(this, arguments);
        };
        const _isRepeated = Input.isRepeated;
        Input.isRepeated = function (name) {
            if (UINav.consumed(name)) return false;
            return _isRepeated.apply(this, arguments);
        };
    }

    Controller.Nav = UINav;
    window.UINav = UINav;

    // The bypass: a read nobody else shares, for code that has to see the pad
    // change inside one task (see PadSnapshot).
    Controller.livePads = () => PadSnapshot.live();
    Controller.PadSnapshot = PadSnapshot;

    window.Controller = Controller;
    // Every screen that already asks for window.PadUI is asking this.
    window.PadUI = PadUI;
    PadUI.install();

    //=========================================================================
    // The two things about a camera the player gets to decide
    //=========================================================================
    if (typeof ConfigManager !== 'undefined') {
        Object.defineProperty(ConfigManager, 'padCameraSpeed', {
            get: function () {
                return this._padCameraSpeed !== undefined
                    ? this._padCameraSpeed : Math.round(DEFAULT_CAM_SPEED * 100);
            },
            set: function (value) { this._padCameraSpeed = value; },
            configurable: true
        });
        Object.defineProperty(ConfigManager, 'padCameraInvertY', {
            get: function () {
                return this._padCameraInvertY !== undefined ? this._padCameraInvertY : DEFAULT_INVERT_Y;
            },
            set: function (value) { this._padCameraInvertY = value; },
            configurable: true
        });

        const _makeData = ConfigManager.makeData;
        ConfigManager.makeData = function () {
            const config = _makeData.call(this);
            config.padCameraSpeed = this.padCameraSpeed;
            config.padCameraInvertY = this.padCameraInvertY;
            return config;
        };
        const _applyData = ConfigManager.applyData;
        ConfigManager.applyData = function (config) {
            _applyData.call(this, config);
            this.padCameraSpeed = config.padCameraSpeed !== undefined
                ? config.padCameraSpeed : Math.round(DEFAULT_CAM_SPEED * 100);
            this.padCameraInvertY = config.padCameraInvertY !== undefined
                ? !!config.padCameraInvertY : DEFAULT_INVERT_Y;
        };
    }

    if (window.GameOptions) {
        const step = (delta) => {
            const next = Math.max(20, Math.min(300, ConfigManager.padCameraSpeed + delta));
            ConfigManager.padCameraSpeed = next;
            ConfigManager.save();
        };
        window.GameOptions.registerOption('padCameraSpeed',
            TX('Controller.options.cameraSpeed'),
            () => ConfigManager.padCameraSpeed,
            (value) => { ConfigManager.padCameraSpeed = value; },
            'video', 'custom',
            (value) => value + '%',  // i18n-ignore  a percentage
            () => step(10), () => step(-10)
        );
        window.GameOptions.registerOption('padCameraInvertY',
            TX('Controller.options.invertY'),
            () => ConfigManager.padCameraInvertY,
            (value) => { ConfigManager.padCameraInvertY = value; },
            'video', 'boolean'
        );
    }
})();
