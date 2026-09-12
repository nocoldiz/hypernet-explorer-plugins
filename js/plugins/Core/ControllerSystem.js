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
                // A screen a player can lean into: the same two triggers that
                // zoom the voxel world and every 3D minigame, so the gesture
                // is one gesture everywhere. Only the screens that have
                // something to enlarge ask for these.
                zoomOut: { face: 'L2' },
                zoomIn: { face: 'R2' },
                // Scrolling is not a button: the right stick moves whatever
                // pane the page is reading, pushed the way the page should go
                // (UIScroll in Core/MouseControls.js). Read it with axis().
                scroll: { stick: 'right' }
            },
            drive: {
                accelerate: { face: 'A', key: 'ok' },
                brake: { face: 'B', key: 'cancel' },
                handbrake: { face: 'X', key: 'shift' },
                view: { face: 'Y' },
                gearDown: { face: 'L1', key: 'pageup' },
                gearUp: { face: 'R1', key: 'pagedown' },
                zoomOut: { face: 'L2' },
                zoomIn: { face: 'R2' },
                horn: { face: 'L3' },
                exit: { face: 'START', key: 'wmrToggle' }
            },
            walk: {
                jump: { face: 'A', key: 'ok' },
                back: { face: 'B', key: 'cancel' },
                run: { face: 'X', key: 'shift' },
                view: { face: 'Y' },
                bar: { face: 'L1', key: 'pageup' },
                dig: { face: 'R1', key: 'pagedown' },
                zoomOut: { face: 'L2' },
                zoomIn: { face: 'R2' },
                exit: { face: 'START', key: 'wmrToggle' }
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

        action(name, player) {
            const bind = this.binding(name);
            if (!bind) return false;
            if (bind.face && this.pressed(bind.face, player)) return true;
            return !!(bind.key && (player || 0) === 0 &&
                typeof Input !== 'undefined' && Input.isPressed(bind.key));
        },

        actionTriggered(name, player) {
            const bind = this.binding(name);
            if (!bind) return false;
            if (bind.face && this.triggered(bind.face, player)) return true;
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

        // The face an action wears, for a tip strip or a badge.
        faceOf(action, mode) {
            const bind = this.binding(action, mode);
            if (bind && bind.face) return bind.face;
            if (bind && bind.stick) return bind.stick === 'right' ? 'RS' : 'LS';
            return '';
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
            scroll: 'RS',
            scrollUp: 'RS\u2191',
            scrollDown: 'RS\u2193',
            stick: 'L3',
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
            next: 'tabNext'
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
            // The face reads ahead of the word on a Back button (it IS the
            // control) and after it on a verb, which reads as the sentence the
            // button is: "Discard (Y)".
            const first = !!(el.classList && el.classList.contains('back-button'));
            this.stamp(el, this.glyph(role), first);
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
                // between two redraws.
                for (const tab of tabs) this.unstamp(tab);
                if (!on || tabs.length < 2) continue;
                this.stamp(tabs[0], this.BUTTON.tabPrev, true);
                this.stamp(tabs[tabs.length - 1], this.BUTTON.tabNext, false);
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

        railLayer() {
            let layer = document.getElementById(this.RAIL_ID);
            if (!layer) {
                layer = document.createElement('div');
                layer.id = this.RAIL_ID;
                if (document.body) document.body.appendChild(layer);
            }
            return layer;
        },

        scrollPanes() {
            const UIScroll = window.UIScroll;
            if (!UIScroll || !UIScroll.topOverlay) return [];
            const overlay = UIScroll.topOverlay();
            if (!overlay || !overlay.querySelectorAll) return [];
            const out = [];
            const seen = new Set();
            const consider = (el) => {
                if (!el || seen.has(el)) return;
                seen.add(el);
                if (!UIScroll.isScrollable(el)) return;
                if (el.scrollHeight - el.clientHeight < 8) return;
                if (el.clientHeight < 60) return;
                out.push(el);
            };
            consider(overlay);
            for (const el of overlay.querySelectorAll('*')) consider(el);
            return out;
        },

        updateRails() {
            const layer = this.railLayer();
            if (!layer) return;
            const panes = this.active() ? this.scrollPanes() : [];
            const wanted = panes.length * 2;
            while (layer.children.length < wanted) {
                const chip = document.createElement('div');
                chip.className = 'pad-rail-chip';
                layer.appendChild(chip);
            }
            while (layer.children.length > wanted) {
                const last = layer.lastChild;
                if (!last) break;
                layer.removeChild(last);
                if (layer.lastChild === last) break;
            }
            panes.forEach((pane, i) => {
                const box = pane.getBoundingClientRect();
                const atTop = pane.scrollTop <= 1;
                const atEnd = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1;
                const place = (chip, face, x, y, spent) => {
                    if (chip.textContent !== face) chip.textContent = face;
                    chip.classList.toggle('spent', spent);
                    chip.style.setProperty('--ui-at-x', Math.round(x) + 'px');
                    chip.style.setProperty('--ui-at-y', Math.round(y) + 'px');
                };
                // i18n-ignore-start  physical button faces
                place(layer.children[i * 2], this.BUTTON.scrollUp,
                    box.right - 6, box.top + 2, atTop);
                place(layer.children[i * 2 + 1], this.BUTTON.scrollDown,
                    box.right - 6, box.bottom - 18, atEnd);
                // i18n-ignore-end
            });
        },

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
            'gameplay', 'custom',
            (value) => value + '%',  // i18n-ignore  a percentage
            () => step(10), () => step(-10)
        );
        window.GameOptions.registerOption('padCameraInvertY',
            TX('Controller.options.invertY'),
            () => ConfigManager.padCameraInvertY,
            (value) => { ConfigManager.padCameraInvertY = value; },
            'gameplay', 'boolean'
        );
    }
})();
