/*:
 * @target MZ
 * @plugindesc GalaxySim 3D Camera - Orbit + free-fly camera rig for the 3D star map
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim 3D Camera Module
 * ============================================================================
 * Owns a single THREE.PerspectiveCamera and two controllers that share its
 * state (single source of truth = the camera transform):
 *  - CameraRig: focus point + orbit distance/yaw/pitch, eased toward targets.
 *  - OrbitController (default): drag to rotate, wheel to zoom, arrows/stick to
 *    nudge the focus. Click selection is handled by Scene3D via a raycaster.
 *  - FlyController (cockpit, wired in a later milestone): pointer-lock mouse
 *    look + WASD thrust.
 *
 * LOAD ORDER: after GalaxySim_World3D.js, before GalaxySim_Scene3D.js.
 * Requires THREE.js.
 */

(() => {
  "use strict";

  if (!window.GalaxySim) window.GalaxySim = {};

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const damp = (cur, target, lambda, dt) =>
    cur + (target - cur) * (1 - Math.exp(-lambda * dt));

  // ==========================================================================
  // CameraRig - spherical orbit state around a focus, eased each frame.
  // ==========================================================================
  class CameraRig {
    constructor(camera) {
      this.camera = camera;
      this.focus = new THREE.Vector3(0, 0, 0);
      this.targetFocus = this.focus.clone();

      this.distance = 60;
      this.targetDistance = 60;
      this.minDistance = 0.2;
      this.maxDistance = 1e6;
      // How far a PANNED focus may drift from the centre of the current view
      // (0 = no limit). Only panning is bounded; see clampPan.
      this.panLimit = 0;

      this.yaw = 0;          // azimuth around world Y
      this.pitch = 0.45;     // elevation above the galactic (XZ) plane
      this.minPitch = -1.45;
      this.maxPitch = 1.45;

      this.ease = 9;         // damping lambda for the focus; higher = snappier
      // Slower lambda for distance -> a long, gliding zoom. Raised slightly
      // from 5 so continuous wheel/L2-R2 input tracks the camera more tightly
      // (less perceived lag) while still gliding on a single Space/Zoom-To jump.
      this.zoomEase = 6.5;
    }

    /** Where the current target distance sits in the [min,max] range, 0..1. */
    zoomFraction() {
      const lo = Math.log(Math.max(1e-9, this.minDistance));
      const hi = Math.log(Math.max(this.minDistance * 1.0001, this.maxDistance));
      const cur = Math.log(clamp(this.targetDistance, this.minDistance, this.maxDistance));
      return clamp((hi - cur) / (hi - lo), 0, 1); // 1 = fully zoomed in
    }

    /** Place the focus + distance immediately (no easing), e.g. on scale entry. */
    snapTo(focusVec3, distance) {
      this.focus.copy(focusVec3);
      this.targetFocus.copy(focusVec3);
      if (distance != null) {
        this.distance = distance;
        this.targetDistance = distance;
      }
      this.applyOrbit();
    }

    setTargetFocus(vec3) { this.targetFocus.copy(vec3); }

    /**
     * Keep a panned focus inside the view it belongs to. Panning is the one
     * gesture that moves the pivot with no destination in mind, and its step
     * scales with the orbit distance, so a couple of seconds of it at a wide
     * zoom used to leave the whole scale behind - nothing on screen, nothing
     * pickable, and no way back. Flights, ship-follow and framing set the
     * focus deliberately and are left alone.
     */
    clampPan() {
      const lim = this.panLimit;
      if (!lim) return;
      const d = this.targetFocus.length();
      if (d > lim) this.targetFocus.multiplyScalar(lim / d);
    }

    setTargetDistance(d) {
      this.targetDistance = clamp(d, this.minDistance, this.maxDistance);
    }
    zoomBy(factor) { this.setTargetDistance(this.targetDistance * factor); }

    rotate(dYaw, dPitch) {
      this.yaw += dYaw;
      this.pitch = clamp(this.pitch + dPitch, this.minPitch, this.maxPitch);
    }

    /** Position the camera from the current orbit parameters. */
    applyOrbit() {
      const cp = Math.cos(this.pitch);
      const sp = Math.sin(this.pitch);
      const cy = Math.cos(this.yaw);
      const sy = Math.sin(this.yaw);
      this.camera.position.set(
        this.focus.x + this.distance * cp * sy,
        this.focus.y + this.distance * sp,
        this.focus.z + this.distance * cp * cy
      );
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.focus);
    }

    update(dt) {
      this.distance = damp(this.distance, this.targetDistance, this.zoomEase, dt);
      this.focus.x = damp(this.focus.x, this.targetFocus.x, this.ease, dt);
      this.focus.y = damp(this.focus.y, this.targetFocus.y, this.ease, dt);
      this.focus.z = damp(this.focus.z, this.targetFocus.z, this.ease, dt);
      this.applyOrbit();
    }

    /** Derive yaw/pitch/distance from the current camera transform (mode swap). */
    syncFromCamera() {
      const off = this.camera.position.clone().sub(this.focus);
      this.distance = Math.max(this.minDistance, off.length());
      this.targetDistance = this.distance;
      this.pitch = Math.asin(clamp(off.y / (this.distance || 1), -1, 1));
      this.yaw = Math.atan2(off.x, off.z);
    }
  }

  // ==========================================================================
  // OrbitController - mouse drag / wheel / keyboard, driving the rig.
  // ==========================================================================
  class OrbitController {
    constructor(rig, domElement) {
      this.rig = rig;
      this.dom = domElement;
      this.enabled = false;
      this.dragging = false;
      this.last = { x: 0, y: 0 };
      this.rotateSpeed = 0.005;
      // Zoom is exponential in the wheel delta rather than one fixed step per
      // event: the rate is the log-distance change for one standard notch
      // (~100px of deltaY).
      //
      // It is no longer a CONSTANT, because the scales it has to cross are not
      // the same size. A system view spans a couple of hundred to one; the
      // cosmic web, since it grew to the whole observable universe, spans
      // thousands. At one fixed rate a system crossed in a dozen notches and
      // the web took over a hundred, which is the same wheel meaning two
      // different things depending on where the player is standing. Instead
      // the rate is derived from the rig's own min..max range so that ONE FULL
      // BAND IS ALWAYS ABOUT `zoomNotches` NOTCHES, at every scale, and only
      // the clamps below decide how fast that is allowed to get.
      this.zoomNotches = 26;
      this.minZoomRate = 0.035;
      this.maxZoomRate = 0.16;
      this.maxNotchesPerEvent = 2.5; // clamp trackpad/inertia bursts
      this.stickZoomSpan = 4.5;      // seconds to cross a full band on a trigger
      this.panKeySpeed = 0.6; // fraction of distance per second
      this.stickRotateSpeed = 2.2; // radians per second at full right stick

      // Scratch vectors reused by update() each frame (avoids per-frame allocs).
      this._scratchRight = new THREE.Vector3();
      this._scratchUp = new THREE.Vector3();

      this._onDown = this._onDown.bind(this);
      this._onMove = this._onMove.bind(this);
      this._onUp = this._onUp.bind(this);
      this._onWheel = this._onWheel.bind(this);
    }

    enable() {
      if (this.enabled) return;
      this.enabled = true;
      this.dom.addEventListener("mousedown", this._onDown);
      window.addEventListener("mousemove", this._onMove);
      window.addEventListener("mouseup", this._onUp);
      this.dom.addEventListener("wheel", this._onWheel, { passive: false });
    }

    disable() {
      if (!this.enabled) return;
      this.enabled = false;
      this.dragging = false;
      this.dom.removeEventListener("mousedown", this._onDown);
      window.removeEventListener("mousemove", this._onMove);
      window.removeEventListener("mouseup", this._onUp);
      this.dom.removeEventListener("wheel", this._onWheel);
    }

    // True iff the pointer moved enough between down and up to count as a drag
    // (so Scene3D can treat a clean press as a selection click).
    consumeWasDrag() {
      const v = this._wasDrag;
      this._wasDrag = false;
      return v;
    }

    _onDown(e) {
      if (e.button !== 0) return;
      this.dragging = true;
      this._moved = 0;
      this._wasDrag = false;
      this.last.x = e.clientX;
      this.last.y = e.clientY;
    }

    _onMove(e) {
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last.x = e.clientX;
      this.last.y = e.clientY;
      this._moved += Math.abs(dx) + Math.abs(dy);
      if (this._moved > 4) this._wasDrag = true;
      this.rig.rotate(-dx * this.rotateSpeed, -dy * this.rotateSpeed);
    }

    _onUp() { this.dragging = false; }

    /** Log-distance per wheel notch at the rig's CURRENT band. See the
     *  constructor: a band is always about `zoomNotches` notches wide. */
    get zoomRate() {
      const lo = Math.max(1e-6, this.rig.minDistance);
      const hi = Math.max(lo * 1.0001, this.rig.maxDistance);
      const span = Math.log(hi / lo) / Math.max(1, this.zoomNotches);
      return clamp(span, this.minZoomRate, this.maxZoomRate);
    }

    /** Log-distance per second at full trigger, on the same band. */
    get stickZoomRate() {
      const lo = Math.max(1e-6, this.rig.minDistance);
      const hi = Math.max(lo * 1.0001, this.rig.maxDistance);
      return clamp(Math.log(hi / lo) / this.stickZoomSpan, 0.35, 3.2);
    }

    _onWheel(e) {
      e.preventDefault();
      // Normalise the delta to "notches" across the three deltaMode units so a
      // trackpad, a wheel and a page-scrolling device all zoom at one rate.
      let px = e.deltaY;
      if (e.deltaMode === 1) px *= 16;       // lines -> px
      else if (e.deltaMode === 2) px *= 400; // pages -> px
      const notches = clamp(px / 100, -this.maxNotchesPerEvent, this.maxNotchesPerEvent);
      if (!notches) return;
      this.rig.zoomBy(Math.exp(notches * this.zoomRate));
    }

    // Keyboard / analog driving of the rig, called each frame by Scene3D.
    // Scene3D sets suspendKeys while a UI panel owns the arrow keys; that only
    // silences the directional PAN, since the right stick and the triggers are
    // the controller's rotate and zoom and no panel ever wants those (zooming
    // into the object whose panel is open is the whole point of the ladder).
    update(dt) {
      if (!this.enabled) return;
      if (window.AnalogStickInput) {
        // Right stick orbits, the pad's stand-in for dragging with the mouse.
        const rx = AnalogStickInput.rightX ? AnalogStickInput.rightX() : 0;
        const ry = AnalogStickInput.rightY ? AnalogStickInput.rightY() : 0;
        if (rx || ry) {
          this.rig.rotate(-rx * this.stickRotateSpeed * dt,
            -ry * this.stickRotateSpeed * dt);
        }
        // L2/R2 triggers: a purely-analog way to reach the whole zoom slider
        // (and so cross scale-ladder bands) without touching Zoom To - R2
        // zooms in, L2 zooms out, same continuous rate as the wheel.
        const lt = AnalogStickInput.leftTrigger ? AnalogStickInput.leftTrigger() : 0;
        const rt = AnalogStickInput.rightTrigger ? AnalogStickInput.rightTrigger() : 0;
        const trig = rt - lt;
        if (Math.abs(trig) > 0.02) {
          this.rig.zoomBy(Math.exp(-trig * this.stickZoomRate * dt));
        }
      }
      if (this.suspendKeys) return;
      let mx = 0, my = 0;
      if (typeof Input !== "undefined") {
        if (Input.isPressed("left")) mx -= 1;
        if (Input.isPressed("right")) mx += 1;
        if (Input.isPressed("up")) my -= 1;
        if (Input.isPressed("down")) my += 1;
      }
      if (window.AnalogStickInput) {
        mx += AnalogStickInput.leftX ? AnalogStickInput.leftX() : 0;
        my += AnalogStickInput.leftY ? AnalogStickInput.leftY() : 0;
      }
      if (mx === 0 && my === 0) return;
      // Move the focus in the camera's screen plane, scaled by distance.
      const step = this.rig.distance * this.panKeySpeed * dt;
      const cam = this.rig.camera;
      const right = this._scratchRight.setFromMatrixColumn(cam.matrixWorld, 0);
      const upVec = this._scratchUp.setFromMatrixColumn(cam.matrixWorld, 1);
      right.y = 0;
      const delta = right.multiplyScalar(mx * step)
        .add(upVec.multiplyScalar(-my * step));
      this.rig.targetFocus.add(delta);
      this.rig.clampPan();
    }
  }

  // ==========================================================================
  // FlyController - pointer-lock cockpit piloting: mouse look + WASD thrust.
  // Drives the camera transform directly (the rig is NOT applied while flying);
  // it keeps rig.focus a short distance ahead so handing back to orbit is smooth.
  // ==========================================================================
  class FlyController {
    constructor(rig, domElement) {
      this.rig = rig;
      this.camera = rig.camera;
      this.dom = domElement;
      this.enabled = false;

      this.yaw = 0;
      this.pitch = 0;
      this.lookDX = 0;
      this.lookDY = 0;
      this.lookSpeed = 0.0022;
      this.moveFactor = 0.85; // fraction of framing distance per second
      this.boost = 4;

      this._euler = new THREE.Euler(0, 0, 0, "YXZ");
      this._fwd = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._up = new THREE.Vector3(0, 1, 0);
      this.keys = new Set();

      this._onKeyDown = (e) => { this.keys.add(e.code); };
      this._onKeyUp = (e) => { this.keys.delete(e.code); };
      this._onMouseMove = (e) => {
        if (document.pointerLockElement !== this.dom) return;
        this.lookDX += e.movementX || 0;
        this.lookDY += e.movementY || 0;
      };
      this._onClick = () => {
        if (this.enabled && document.pointerLockElement !== this.dom) this._lock();
      };
    }

    _lock() { if (this.dom.requestPointerLock) this.dom.requestPointerLock(); }

    enable() {
      if (this.enabled) return;
      this.enabled = true;
      this._euler.setFromQuaternion(this.camera.quaternion, "YXZ");
      this.yaw = this._euler.y;
      this.pitch = this._euler.x;
      this.keys.clear();
      this.lookDX = this.lookDY = 0;
      document.addEventListener("keydown", this._onKeyDown);
      document.addEventListener("keyup", this._onKeyUp);
      document.addEventListener("mousemove", this._onMouseMove);
      this.dom.addEventListener("click", this._onClick);
      this._lock();
    }

    disable() {
      if (!this.enabled) return;
      this.enabled = false;
      document.removeEventListener("keydown", this._onKeyDown);
      document.removeEventListener("keyup", this._onKeyUp);
      document.removeEventListener("mousemove", this._onMouseMove);
      this.dom.removeEventListener("click", this._onClick);
      if (document.pointerLockElement === this.dom && document.exitPointerLock) {
        document.exitPointerLock();
      }
      this.keys.clear();
    }

    update(dt) {
      if (!this.enabled) return;

      // Mouse look (pointer-lock deltas) + optional right-stick.
      if (window.AnalogStickInput) {
        const rx = AnalogStickInput.rightX ? AnalogStickInput.rightX() : 0;
        const ry = AnalogStickInput.rightY ? AnalogStickInput.rightY() : 0;
        this.yaw -= rx * 1.8 * dt * 60;
        this.pitch -= ry * 1.8 * dt * 60;
      }
      this.yaw -= this.lookDX * this.lookSpeed;
      this.pitch -= this.lookDY * this.lookSpeed;
      this.lookDX = this.lookDY = 0;
      const lim = Math.PI / 2 - 0.02;
      this.pitch = clamp(this.pitch, -lim, lim);
      this._euler.set(this.pitch, this.yaw, 0, "YXZ");
      this.camera.quaternion.setFromEuler(this._euler);

      // Thrust along the camera basis. On a pad the boost is X ('shift').
      const base = Math.max(2, this.rig.distance) * this.moveFactor;
      const shift = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ||
        (typeof Input !== "undefined" && Input.isPressed("shift"));
      const step = base * (shift ? this.boost : 1) * dt;
      this._fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const k = this.keys;
      if (k.has("KeyW")) this.camera.position.addScaledVector(this._fwd, step);
      if (k.has("KeyS")) this.camera.position.addScaledVector(this._fwd, -step);
      if (k.has("KeyD")) this.camera.position.addScaledVector(this._right, step);
      if (k.has("KeyA")) this.camera.position.addScaledVector(this._right, -step);
      if (k.has("Space")) this.camera.position.addScaledVector(this._up, step);
      if (k.has("KeyC") || k.has("ControlLeft")) this.camera.position.addScaledVector(this._up, -step);
      if (window.AnalogStickInput) {
        const lx = AnalogStickInput.leftX ? AnalogStickInput.leftX() : 0;
        const ly = AnalogStickInput.leftY ? AnalogStickInput.leftY() : 0;
        if (lx) this.camera.position.addScaledVector(this._right, lx * step);
        if (ly) this.camera.position.addScaledVector(this._fwd, -ly * step);
        // R2 climbs, L2 dives: the pad's Space/C, and analog with it.
        const rt = AnalogStickInput.rightTrigger ? AnalogStickInput.rightTrigger() : 0;
        const lt = AnalogStickInput.leftTrigger ? AnalogStickInput.leftTrigger() : 0;
        const lift = rt - lt;
        if (Math.abs(lift) > 0.02) {
          this.camera.position.addScaledVector(this._up, lift * step);
        }
      }

      // Keep the orbit pivot a sensible distance ahead for a smooth hand-back.
      this.rig.focus.copy(this.camera.position).addScaledVector(this._fwd, this.rig.distance);
      this.rig.targetFocus.copy(this.rig.focus);
    }

    dispose() { this.disable(); }
  }

  window.GalaxySim.Camera3D = { CameraRig, OrbitController, FlyController };
})();
