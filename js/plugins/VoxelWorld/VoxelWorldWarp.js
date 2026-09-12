//=============================================================================
// VoxelWorldWarp.js
// VoxelWorld: the speed lens and the liminal overdrive
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - the speed lens and the liminal overdrive
 * @author Omni-Lex
 *
 * @help
 * the speed lens and the liminal overdrive.
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
    // SpeedWarpFx, the speed lens.
    //
    // At speed the world does NOT fold: nothing in the scene is moved, scaled or
    // displaced. The finished frame is rendered into an offscreen target and then
    // blitted back through a fragment shader that bends the LIGHT in a bubble
    // around the camper, the same read as the gravitational lens the black holes
    // wear in GalaxySim: a swirl plus a radial pull, strongest in a ring hugging
    // the vehicle and gone a short way out, with the RGB channels pulled by
    // slightly different amounts so the rim fringes.
    //
    // Because it is screen space it costs one full-screen pass whatever is on
    // screen, it cannot tear chunk seams open, and physics never sees it.
    // =========================================================================
    class SpeedWarpFx {
        constructor() {
            this._target = null;
            this._mat = null;
            this._scene = null;
            this._cam = null;
            this._ndc = new THREE.Vector3();
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
                    uCenter:  { value: new THREE.Vector2(0.5, 0.5) },
                    uAspect:  { value: 1 },
                    uAmount:  { value: 0 },
                    uTime:    { value: 0 },
                    uInner:   { value: 0.10 },
                    uOuter:   { value: 0.42 }
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
                    'uniform vec2  uCenter;',
                    'uniform float uAspect;',
                    'uniform float uAmount;',
                    'uniform float uTime;',
                    'uniform float uInner;',
                    'uniform float uOuter;',
                    'varying vec2 vUv;',
                    // Sample the frame with the lens applied at strength s. Called
                    // three times, once per channel, so the rim splits into colour.
                    'vec2 bend(vec2 uv, float s) {',
                    '  vec2 d = (uv - uCenter) * vec2(uAspect, 1.0);',
                    '  float r = length(d);',
                    // Ring falloff: nothing at the very centre (the camper itself
                    // stays crisp), peak just off its flanks, nothing past uOuter.
                    '  float k = smoothstep(uInner * 0.25, uInner, r) *',
                    '            (1.0 - smoothstep(uInner, uOuter, r));',
                    '  if (k <= 0.0) return uv;',
                    '  k *= s;',
                    // Swirl about the camper.
                    '  float a = 0.85 * k;',
                    '  float ca = cos(a), sa = sin(a);',
                    '  vec2 rd = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);',
                    // Radial pull, breathing outward so the bubble never sits still.
                    '  float pull = 1.0 - k * (0.30 + 0.16 * sin(r * 26.0 - uTime * 7.0));',
                    '  rd *= pull;',
                    '  return uCenter + rd / vec2(uAspect, 1.0);',
                    '}',
                    'void main() {',
                    '  float s = uAmount;',
                    '  vec2 ur = clamp(bend(vUv, s * 1.06), 0.0, 1.0);',
                    '  vec2 ug = clamp(bend(vUv, s),        0.0, 1.0);',
                    '  vec2 ub = clamp(bend(vUv, s * 0.94), 0.0, 1.0);',
                    '  gl_FragColor = vec4(',
                    '    texture2D(tDiffuse, ur).r,',
                    '    texture2D(tDiffuse, ug).g,',
                    '    texture2D(tDiffuse, ub).b,',
                    '    1.0);',
                    '}'
                ].join('\n')
            });
            this._scene = new THREE.Scene();
            this._scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat));
            this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
            this._cam.position.z = 1;
        }

        // Draw one frame through the lens. drawInto(target) must render the scene
        // into the target it is handed (that is where the PSX downscale pass, if
        // any, is chained in). center is the camper's world position; camera is
        // the live scene camera, used to project it to a screen point.
        // Returns false when the effect declined to run, so the caller falls back
        // to drawing straight to the canvas.
        render(renderer, drawInto, { amount, time, center, camera, centered }) {
            if (!renderer || !(amount > 0)) return false;
            let cu = 0.5, cv = 0.5;
            if (!centered) {
                // Behind the camera (or far off screen): nothing to bend around.
                this._ndc.copy(center).project(camera);
                if (this._ndc.z > 1) return false;
                cu = this._ndc.x * 0.5 + 0.5;
                cv = this._ndc.y * 0.5 + 0.5;
                if (cu < -0.5 || cu > 1.5 || cv < -0.5 || cv > 1.5) return false;
            }

            this._build();
            const w = Math.max(1, renderer.domElement.width);
            const h = Math.max(1, renderer.domElement.height);
            let rt = this._target;
            if (!rt || rt.width !== w || rt.height !== h) {
                if (rt) rt.dispose();
                rt = new THREE.WebGLRenderTarget(w, h, {
                    minFilter: THREE.LinearFilter,
                    magFilter: THREE.LinearFilter,
                    format: THREE.RGBAFormat,
                    depthBuffer: true,
                    stencilBuffer: false
                });
                // The offscreen frame must hold exactly what the canvas would have
                // held. three picks the colour conversion from the TARGET's texture,
                // so an ordinary (linear) target would store un-converted colour and
                // the raw lens shader - which has no encoding pass of its own - would
                // then paint a washed-out picture. Declaring the target sRGB moves
                // the conversion one pass earlier and the lens simply passes bytes
                // through, so the image is identical to a direct render.
                if (THREE.SRGBColorSpace !== undefined && 'colorSpace' in rt.texture) {
                    rt.texture.colorSpace = THREE.SRGBColorSpace;
                } else if (THREE.sRGBEncoding !== undefined) {
                    rt.texture.encoding = THREE.sRGBEncoding;
                }
                this._target = rt;
            }

            drawInto(rt);

            const u = this._mat.uniforms;
            u.tDiffuse.value = rt.texture;
            u.uCenter.value.set(cu, cv);
            u.uAspect.value = w / h;
            u.uAmount.value = amount;
            u.uTime.value = time;
            // The bubble grows with speed but stays a bubble: at full strength it
            // reaches roughly a third of the screen, never the whole view.
            u.uInner.value = 0.08 + 0.05 * amount;
            u.uOuter.value = 0.26 + 0.20 * amount;

            renderer.setRenderTarget(null);
            renderer.render(this._scene, this._cam);
            return true;
        }

        dispose() {
            if (this._target) { this._target.dispose(); this._target = null; }
            if (this._scene) {
                this._scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
                this._scene = null;
            }
            if (this._mat) { this._mat.dispose(); this._mat = null; }
        }
    }

    // =========================================================================
    // LiminalFx, the cosmic-horror overdrive. Inert at cruising speed; as the
    // camper accelerates past ~130 km/h reality starts to peel: the road heaves,
    // the camper writhes, the palette bleeds violet then blood-red, the camera
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

            // --- the camper itself writhes ---
            if (van && van.group) {
                const s  = 1 + (Math.sin(time * 18) * 0.05 + Math.sin(time * 7) * 0.04) * i;
                const sy = 1 + (Math.sin(time * 13) * 0.07) * i;
                van.group.scale.set(s, sy, s);
            }

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
