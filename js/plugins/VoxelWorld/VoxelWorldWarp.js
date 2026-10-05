//=============================================================================
// VoxelWorldWarp.js
// VoxelWorld: the warp bubble and the liminal overdrive
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - the warp bubble and the liminal overdrive
 * @author Omni-Lex
 *
 * @help
 * the warp bubble and the liminal overdrive.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldWarp.js'); return; }

    const {
        WORLD_SCALE, loadTex, loadVoxelTex
    } = VW;

    // =========================================================================
    // SpeedWarpFx, the warp bubble.
    //
    // An Alcubierre drive does not move the ship: it moves the SPACE around it.
    // Ahead of the hull space contracts, behind it space expands, and between
    // the two walls the vehicle rides in a flat pocket where nothing bends.
    // That is what this pass draws. The finished frame is rendered into an
    // offscreen target and blitted back through a fragment shader that pushes
    // the light along the bubble wall: squeezed toward the bubble on the side
    // the vehicle is heading (the world ahead crowds in, tinted warm),
    // stretched away from it behind (the world drawn out, tinted cold), and the
    // wall itself shaped by Alcubierre's own top hat, f(r) = (tanh(s(r+R)) -
    // tanh(s(r-R))) / 2tanh(sR), so the bend lives in a ring and the pocket and
    // the far world stay flat.
    //
    // THE VEHICLE IS NEVER BENT. Its silhouette is drawn into a mask first;
    // a pixel of the vehicle is passed through untouched, and a bent sample
    // that would land on the vehicle walks on outward until it is past it, so
    // the hull is never smeared into the space it is tearing.
    //
    // THE BUBBLE IS THE VEHICLE'S SIZE. Its radius is the vehicle's own
    // bounding radius, projected to the screen, so a car wears a small bubble
    // and a starship a big one, and the bubble shrinks with distance like the
    // hull inside it.
    // =========================================================================
    const BUBBLE_PAD = 1.35;   // bubble radius over the vehicle's bounding radius

    class SpeedWarpFx {
        constructor() {
            this._target = null;
            this._maskTarget = null;
            this._mat = null;
            this._scene = null;
            this._cam = null;
            this._maskScene = null;
            this._maskMat = null;
            this._ndc = new THREE.Vector3();
            this._ndc2 = new THREE.Vector3();
            this._tmp = new THREE.Vector3();
            this._right = new THREE.Vector3();
            this._up = new THREE.Vector3();
            this._look = new THREE.Vector3();
            this._clear = new THREE.Color();
            this._hidden = [];
        }

        _build() {
            if (this._mat) return;
            this._mat = new THREE.ShaderMaterial({
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                uniforms: {
                    tDiffuse: { value: null },
                    tMask:    { value: null },
                    uUseMask: { value: 0 },
                    uCenter:  { value: new THREE.Vector2(0.5, 0.5) },
                    uAspect:  { value: 1 },
                    uAmount:  { value: 0 },
                    uTime:    { value: 0 },
                    uRadius:  { value: 0.2 },
                    uSigma:   { value: 12 },
                    uFwd:     { value: new THREE.Vector2(0, 1) },
                    uFz:      { value: 0 }
                },
                vertexShader: [
                    'varying vec2 vUv;',
                    'void main() {',
                    '  vUv = uv;',
                    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'uniform sampler2D tDiffuse;',
                    'uniform sampler2D tMask;',
                    'uniform float uUseMask;',
                    'uniform vec2  uCenter;',
                    'uniform float uAspect;',
                    'uniform float uAmount;',
                    'uniform float uTime;',
                    'uniform float uRadius;',
                    'uniform float uSigma;',
                    'uniform vec2  uFwd;',
                    'uniform float uFz;',
                    'varying vec2 vUv;',
                    // sech^2, the slope of tanh, written out: GLSL ES 1.0 has no tanh.
                    'float sech2(float x) {',
                    '  float e = exp(-2.0 * abs(clamp(x, -12.0, 12.0)));',
                    '  float c = 2.0 * sqrt(e) / (1.0 + e);',
                    '  return c * c;',
                    '}',
                    'float masked(vec2 uv) {',
                    '  if (uUseMask < 0.5) return 0.0;',
                    '  return step(0.5, texture2D(tMask, clamp(uv, 0.0, 1.0)).r);',
                    '}',
                    'void main() {',
                    // The vehicle itself: passed through untouched.
                    '  if (masked(vUv) > 0.5) { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); return; }',
                    '  vec2 asp = vec2(uAspect, 1.0);',
                    '  vec2 rel = (vUv - uCenter) * asp;',
                    '  float r = max(length(rel), 1e-5);',
                    '  vec2 n = rel / r;',
                    // The wall: minus the slope of the top hat, a ring peaked at R.
                    '  float g = sech2(uSigma * (r - uRadius)) - sech2(uSigma * (r + uRadius));',
                    '  g *= 1.0 + 0.18 * sin(r * 70.0 - uTime * 9.0);',
                    // Which side of the bubble this point of the wall is on: +
                    // ahead (contraction), - behind (expansion). uFz carries the
                    // part of the heading that points into the screen.
                    '  float side = clamp(dot(n, uFwd) + uFz * 0.45, -1.0, 1.0);',
                    '  float d = uAmount * g * side * uRadius * 0.85;',
                    // A gentle shear along the wall, so space visibly flows past.
                    '  vec2 t = vec2(-n.y, n.x);',
                    '  float shear = uAmount * g * dot(t, uFwd) * uRadius * 0.25;',
                    '  vec2 dirOut = n / asp;',
                    '  vec2 tan2 = t / asp;',
                    '  vec2 uvG = vUv + dirOut * d + tan2 * shear;',
                    '  vec2 uvR = vUv + dirOut * d * 1.08 + tan2 * shear;',
                    '  vec2 uvB = vUv + dirOut * d * 0.92 + tan2 * shear;',
                    // A bent sample that lands on the hull keeps going outward.
                    '  float stepLen = uRadius * 0.12;',
                    '  for (int i = 0; i < 6; i++) {',
                    '    if (masked(uvG) < 0.5) break;',
                    '    uvG += dirOut * stepLen; uvR += dirOut * stepLen; uvB += dirOut * stepLen;',
                    '  }',
                    '  uvG = clamp(uvG, 0.0, 1.0); uvR = clamp(uvR, 0.0, 1.0); uvB = clamp(uvB, 0.0, 1.0);',
                    '  vec3 col = vec3(texture2D(tDiffuse, uvR).r, texture2D(tDiffuse, uvG).g, texture2D(tDiffuse, uvB).b);',
                    // Warm where space contracts, cold where it expands, and a
                    // faint glow along the wall itself.
                    '  float k = uAmount * g;',
                    '  vec3 warm = vec3(1.0, 0.28, 0.12);',
                    '  vec3 cold = vec3(0.15, 0.55, 1.0);',
                    '  col += (side > 0.0 ? warm : cold) * abs(side) * k * 0.32;',
                    '  col += vec3(0.55, 0.7, 1.0) * k * 0.06;',
                    '  gl_FragColor = vec4(col, 1.0);',
                    '}'
                ].join('\n')
            });
            this._scene = new THREE.Scene();
            this._scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat));
            this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
            this._cam.position.z = 1;
            // The silhouette pass: the vehicle alone, flat white on black.
            this._maskScene = new THREE.Scene();
            this._maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false });
            this._maskScene.overrideMaterial = this._maskMat;
        }

        _makeTarget(w, h) {
            return new THREE.WebGLRenderTarget(w, h, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: true,
                stencilBuffer: false
            });
        }

        // Draw the vehicle's silhouette into the mask, at half resolution. The
        // group is lent to the mask scene for the one draw and handed straight
        // back to its parent. Glass is left out of it: through a windscreen the
        // bent world shows.
        _drawMask(renderer, group, camera, w, h) {
            const mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
            let mt = this._maskTarget;
            if (!mt || mt.width !== mw || mt.height !== mh) {
                if (mt) mt.dispose();
                mt = this._maskTarget = this._makeTarget(mw, mh);
            }
            const parent = group.parent;
            const hidden = this._hidden;
            hidden.length = 0;
            group.traverse(o => {
                const m = o.material;
                if (!o.visible || !m) return;
                const glass = Array.isArray(m) ? m.some(x => x && x.transparent) : m.transparent;
                if (glass || o.isSprite || o.isPoints) { o.visible = false; hidden.push(o); }
            });
            renderer.getClearColor(this._clear);
            const prevAlpha = renderer.getClearAlpha();
            this._maskScene.add(group);
            renderer.setRenderTarget(mt);
            renderer.setClearColor(0x000000, 1);
            renderer.clear(true, true, false);
            renderer.render(this._maskScene, camera);
            renderer.setRenderTarget(null);
            renderer.setClearColor(this._clear, prevAlpha);
            if (parent) parent.add(group); else this._maskScene.remove(group);
            for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
            hidden.length = 0;
            return mt;
        }

        // Draw one frame through the bubble. drawInto(target) must render the
        // scene into the target it is handed (that is where the PSX downscale
        // pass, if any, is chained in). center is the vehicle's world position,
        // radius its bounding radius in world units, heading its forward unit
        // vector and group its own scene node (for the mask); camera is the live
        // scene camera. centered: the camera rides inside the vehicle.
        // Returns false when the effect declined to run, so the caller falls back
        // to drawing straight to the canvas.
        render(renderer, drawInto, { amount, time, center, camera, centered, radius, heading, group }) {
            if (!renderer || !(amount > 0)) return false;
            const w = Math.max(1, renderer.domElement.width);
            const h = Math.max(1, renderer.domElement.height);
            const rw = Math.max(4, radius || 40) * BUBBLE_PAD;

            // The camera's own frame, in the world.
            camera.updateMatrixWorld();
            const e = camera.matrixWorld.elements;
            this._right.set(e[0], e[1], e[2]).normalize();
            this._up.set(e[4], e[5], e[6]).normalize();
            this._look.set(-e[8], -e[9], -e[10]).normalize();
            const hd = heading || this._tmp.set(0, 0, 1);

            let cu = 0.5, cv = 0.5, screenR;
            if (centered) {
                // Inside the hull the wall is all round the eye: the ring sits
                // out toward the edges of the view, wider for a bigger vehicle.
                screenR = 0.26 + 0.22 * Math.min(1, rw / 300);
            } else {
                // Behind the camera (or far off screen): nothing to bend around.
                this._ndc.copy(center).project(camera);
                if (this._ndc.z > 1) return false;
                cu = this._ndc.x * 0.5 + 0.5;
                cv = this._ndc.y * 0.5 + 0.5;
                if (cu < -0.5 || cu > 1.5 || cv < -0.5 || cv > 1.5) return false;
                // The bubble's radius as drawn: one bubble radius up the view,
                // measured at the vehicle's own depth.
                this._ndc2.copy(center).addScaledVector(this._up, rw).project(camera);
                screenR = Math.abs(this._ndc2.y - this._ndc.y) * 0.5;
                screenR = Math.max(0.02, Math.min(0.9, screenR));
            }
            // It swells a little as the drive spools up.
            screenR *= 1 + 0.25 * Math.min(1, amount);

            this._build();
            let rt = this._target;
            if (!rt || rt.width !== w || rt.height !== h) {
                if (rt) rt.dispose();
                rt = this._makeTarget(w, h);
                // The offscreen frame must hold exactly what the canvas would have
                // held. three picks the colour conversion from the TARGET's texture,
                // so an ordinary (linear) target would store un-converted colour and
                // the raw bubble shader - which has no encoding pass of its own -
                // would then paint a washed-out picture. Declaring the target sRGB
                // moves the conversion one pass earlier and the shader simply passes
                // bytes through, so the image is identical to a direct render.
                if (THREE.SRGBColorSpace !== undefined && 'colorSpace' in rt.texture) {
                    rt.texture.colorSpace = THREE.SRGBColorSpace;
                } else if (THREE.sRGBEncoding !== undefined) {
                    rt.texture.encoding = THREE.sRGBEncoding;
                }
                this._target = rt;
            }

            drawInto(rt);
            const mask = group ? this._drawMask(renderer, group, camera, w, h) : null;

            const u = this._mat.uniforms;
            u.tDiffuse.value = rt.texture;
            u.tMask.value = mask ? mask.texture : null;
            u.uUseMask.value = mask ? 1 : 0;
            u.uCenter.value.set(cu, cv);
            u.uAspect.value = w / h;
            u.uAmount.value = Math.min(1, amount);
            u.uTime.value = time;
            u.uRadius.value = screenR;
            // A wall about a third of the radius thick, as in the drawings.
            u.uSigma.value = 1 / Math.max(0.004, screenR * 0.32);
            // The heading as the screen sees it, and how much of it points away.
            u.uFwd.value.set(hd.dot(this._right), hd.dot(this._up));
            u.uFz.value = hd.dot(this._look);

            renderer.setRenderTarget(null);
            renderer.render(this._scene, this._cam);
            return true;
        }

        dispose() {
            if (this._target) { this._target.dispose(); this._target = null; }
            if (this._maskTarget) { this._maskTarget.dispose(); this._maskTarget = null; }
            if (this._scene) {
                this._scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
                this._scene = null;
            }
            if (this._mat) { this._mat.dispose(); this._mat = null; }
            if (this._maskMat) { this._maskMat.dispose(); this._maskMat = null; }
            this._maskScene = null;
        }
    }

    // =========================================================================
    // LiminalFx, the cosmic-horror overdrive. Inert at cruising speed; as the
    // camper accelerates past ~130 km/h reality starts to peel: the road heaves,
    // the palette bleeds violet then blood-red, the camera
    // warps and rolls, and eldritch shapes crowd in. At 999 km/h it is hellish
    // and breaking apart. Everything snaps back to normal below the threshold.
    // =========================================================================
    const LIMINAL_START_KMH = 130;

    class LiminalFx {
        constructor(scene, overlay) {
            this._scene = scene;
            this._lastFovWarp = 0;
            this._tmpCol = new THREE.Color();

            // DOM tint + vignette over the canvas (beneath the HUD).
            const d = document.createElement('div');
            d.id = 'camper-liminal-overlay';
            d.style.cssText = [
                'position:absolute', 'top:0', 'right:0', 'bottom:0', 'left:0',
                'pointer-events:none', 'z-index:2',
                'opacity:0', 'mix-blend-mode:hard-light'
            ].join(';');
            overlay.appendChild(d);
            this._dom = d;

            // Eldritch entities that fade in and orbit the camper near the limit.
            this._entGroup = new THREE.Group();
            scene.add(this._entGroup);
            this._entGeo = new THREE.IcosahedronGeometry(22, 0);
            this._entMat = new THREE.MeshStandardMaterial({
                color: 0x120008, emissive: 0x6a0010, emissiveIntensity: 0.9,
                map: loadVoxelTex('warp.png', 1),
                flatShading: true, roughness: 1, metalness: 0
            });
            this._ents = [];
            for (let i = 0; i < 14; i++) {
                const m = new THREE.Mesh(this._entGeo, this._entMat);
                m.visible = false;
                this._entGroup.add(m);
                this._ents.push({
                    mesh: m,
                    ang:   Math.random() * Math.PI * 2,
                    rad:   180 + Math.random() * 340,
                    hgt:   30 + Math.random() * 190,
                    spin:  0.5 + Math.random() * 1.6,
                    orbit: (0.2 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1)
                });
            }
        }

        update(o) {
            const { camera, van, renderer, intensity: i, time, delta, baseExposure, scene, viewMode } = o;

            // The overdrive is off (the scene pins the intensity at 0), and off
            // it still cost a full pass every frame: a DOM write, an exposure
            // write, an UNCONDITIONAL camera.updateProjectionMatrix - a matrix
            // rebuild and a uniform upload for nothing - a scale written onto
            // the camper that dirtied its whole subtree's world matrices, a walk
            // over fourteen eldritch meshes to set visible = false on each of
            // them again, and an emissive write. Once everything it had touched
            // is back where it found it there is nothing left to do until
            // somebody turns it on, so it stops here.
            if (i <= 0 && this._quiet) return;
            this._quiet = (i <= 0);

            // --- DOM tint / vignette: violet at mid, blood red at the limit ---
            this._dom.style.opacity = i <= 0 ? '0' : String(Math.min(0.92, 0.22 + i * i * 0.88));
            if (i > 0) {
                const red  = Math.floor(20 + i * 95);
                const purp = Math.max(0, 0.4 - i * 0.4);
                // i18n-ignore-start  css gradients
                this._dom.style.background =
                    `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${Math.max(6, 35 - i * 26)}%, rgba(${red},0,${Math.floor(10 + i * 6)},${0.5 + i * 0.45}) 100%),` +
                    `radial-gradient(circle at 50% 50%, rgba(150,0,190,0) 0%, rgba(150,0,190,${purp}) 100%)`;
                // i18n-ignore-end
            }

            // --- exposure flicker ---
            if (renderer && baseExposure != null) {
                const flick = i > 0 ? (Math.sin(time * 40) * 0.12 + (i > 0.85 ? (Math.random() - 0.5) * 0.5 : 0)) * i : 0;
                renderer.toneMappingExposure = baseExposure * (1 + flick);
            }

            // --- palette bleed ---
            if (i > 0 && scene) {
                const target = this._tmpCol.setRGB(0.06 + i * 0.6, 0.0, 0.10 * (1 - i));
                const k = Math.min(1, i * 0.9) * Math.min(1, delta * 6);
                scene.background.lerp(target, k);
                scene.fog.color.lerp(target, k);
                scene.fog.density = Math.max(scene.fog.density, (0.0016 + i * 0.004) / WORLD_SCALE);
            }

            // --- camera FOV warp (undo-then-reapply so it never accumulates) ---
            if (camera) {
                camera.fov -= this._lastFovWarp;
                const warp = i > 0 ? (Math.sin(time * 3) * 10 * i + i * 16) : 0;
                camera.fov = Math.max(20, Math.min(140, camera.fov + warp));
                this._lastFovWarp = warp;
                camera.updateProjectionMatrix();

                // Roll. Applied RELATIVE to the orientation the active mode set
                // fresh this frame (via lookAt / the FP rig), and only while the
                // effect is live. Writing camera.rotation.z absolutely used to
                // clobber lookAt's quaternion: at certain headings the euler sync
                // lands near gimbal lock (z near pi), so forcing z=0 rolled the
                // view 180 degrees - the "upside down at the start" bug.
                if (i > 0) {
                    const roll = Math.sin(time * 2.3) * 0.06 * i +
                        (i > 0.85 ? (Math.random() - 0.5) * 0.18 * i : 0);
                    camera.rotateZ(roll);
                }

                // Positional shake only where the camera position is recomputed
                // each frame (car / free); the rig-attached FP views (fp, fpdrive,
                // foot) keep a fixed local camera position, so shaking it there
                // would accumulate permanent drift.
                if (i > 0 && (viewMode === 'car' || viewMode === 'free')) {
                    const shake = i * (i > 0.85 ? 24 : 7);
                    camera.position.x += (Math.random() - 0.5) * shake;
                    camera.position.y += (Math.random() - 0.5) * shake;
                }
            }

            // The vehicle itself is never bent: the warp bubble bends the space
            // around it (SpeedWarpFx), not the hull.

            // --- eldritch entities crowd in past the midpoint ---
            const count = i < 0.45 ? 0 : Math.round((i - 0.45) / 0.55 * this._ents.length);
            const cx = van ? van.group.position.x : 0;
            const cy = van ? van.group.position.y : 0;
            const cz = van ? van.group.position.z : 0;
            for (let e = 0; e < this._ents.length; e++) {
                const ent = this._ents[e];
                const on = e < count;
                ent.mesh.visible = on;
                if (!on) continue;
                ent.ang += ent.orbit * delta;
                ent.mesh.position.set(
                    cx + Math.cos(ent.ang) * ent.rad,
                    cy + ent.hgt + Math.sin(time * ent.spin + e) * 22,
                    cz + Math.sin(ent.ang) * ent.rad
                );
                ent.mesh.rotation.x += ent.spin * delta;
                ent.mesh.rotation.y += ent.spin * 0.7 * delta;
                ent.mesh.scale.setScalar(1 + i * 1.6);
            }
            this._entMat.emissiveIntensity = 0.5 + i * 1.6;
        }

        dispose() {
            if (this._dom && this._dom.parentNode) this._dom.parentNode.removeChild(this._dom);
            if (this._entGroup) this._scene.remove(this._entGroup);
            if (this._entGeo) this._entGeo.dispose();
            if (this._entMat) this._entMat.dispose();
        }
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        LIMINAL_START_KMH, LiminalFx, SpeedWarpFx
    });
})();
