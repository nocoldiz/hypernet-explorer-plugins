/*:
 * @target MZ
 * @plugindesc Retro shaders (SnapVertex, Pixel Art) for every 3D scene
 * @author AntiGravity
 * @help
 * TWO looks, one switch. The player picks which in Options > Shader, and every
 * three.js viewport in the game wears it: the 3D enemy battlers
 * (3DBattlerSystem.js and the Battler3D_* families), the first person weapon
 * overlay (Weapon3DOverlay.js / WeaponSystemProcedural.js), the voxel world
 * (VoxelWorld*), the 3D minigames (the tarot table, the bowling alley, chess,
 * pool, the horse race, the monster tournament and the rest), GalaxySim, the
 * title-screen mesh and the model previews in the status, bestiary, equipment
 * and creature-creation screens.
 *
 *   SnapVertex (window.SnapVertexShader)  the 32-bit console look
 *     - Vertex snapping (the signature "wobble" from low-precision vertex math)
 *     - Color-depth reduction with ordered (Bayer) dithering
 *     - Low-resolution rendering upscaled with nearest-neighbor sampling
 *     - Nearest texture filtering (no smoothing / mipmaps)
 *     Tunables: enabled, vertexSnap (NDC grid cells across the screen; lower =
 *     chunkier), colorLevels (shades per channel), dither (0..1), downscale
 *     (internal render scale 0..1), nearestTex.
 *
 *   Pixel Art (window.PixelArtShader)  the hand-drawn sprite look
 *     - Flat cel bands of light instead of a smooth ramp, with the darkest band
 *       pushed toward ink so shapes read as outlined
 *     - Every colour snapped to a palette (Aurora 256 default, Splendor 128,
 *       LCD monochrome handheld, or custom), through a lookup texture
 *     - Chunky pixels, and no vertex wobble (a sprite does not swim)
 *     Tunables: levels, lightSteps, saturation, inkStrength, palette, dither,
 *     downscale, weaponBoost, pixelSnap.
 *
 * window.RetroShader is the answer to which one is on:
 *   mode          'off' | 'snapvertex' | 'pixelart'
 *   setMode(m)    switch, and flip both shaders' enabled flags to match
 *   active()      the shader object in force right now (never null)
 *
 * Public API (the same on both, and on the window.PSXShader facade):
 *   applyToMaterial(material)  Patch a single THREE material in place.
 *   applyToObject(root)        Walk an Object3D tree and patch every material.
 *   render(renderer, scene, camera)  Drop-in for renderer.render() that adds the
 *                              low-res downsample pass.
 *   downscaleFor(kind)         The render scale a viewport should rasterise at.
 *                              'weapon' is finer than 'scene' under pixel art.
 *   withScale(factors, fn)     Run fn with the tunables scaled by
 *                              { vertexSnap, colorLevels, dither, downscale },
 *                              then restored. For scenes that want a softer or
 *                              harsher look than the player's global settings.
 *   disposeContext(renderer)   Release the downsample render target. Call before
 *                              renderer.dispose() on teardown.
 *
 * window.PSXShader is a FACADE, kept because thirty scenes already call it: it
 * forwards every one of those to RetroShader.active(). Name a shader directly
 * only when you specifically want that one look.
 *
 * NOTE: the GLSL literals (vertexSnap, colorLevels, dither, lightSteps, the
 * palette...) are BAKED in the first time each material is patched, so changing
 * them at runtime only affects materials patched afterward; already-patched
 * materials keep their original values (there is no live re-patch path), which
 * is why switching the look takes full effect on the next scene. downscale,
 * enabled and nearestTex are read live per render / per patch.
 *
 * ---------------------------------------------------------------------------
 * window.PSXHud - the 2D half of the same look
 * ---------------------------------------------------------------------------
 * A 32-bit console game's HUD was drawn in the framebuffer, at the framebuffer's
 * own resolution: 320x240-ish, an 8px bitmap font, hard 1px drop shadows and
 * boxes with a single-pixel keyline. PSXHud draws that. Everything is authored
 * in VIRTUAL PIXELS on a low-res bitmap which is then upscaled with nearest
 * filtering, so text and panels come out chunky and aliased no matter what
 * resolution the game is running at.
 *
 * Panels are OPAQUE by default. The 2x2 checker that used to stand in for
 * translucency let a lit 3D scene show through every other pixel of a panel,
 * which at 240 lines is the difference between reading a line of 8px type and
 * guessing at it. Pass { dither: true } for the old translucent look.
 *
 *   PSXHud.layer(baseWidth)            low-res overlay { sprite, bitmap, w, h, ss }
 *                                      (w/h are virtual pixels; the bitmap is
 *                                      supersampled and transformed to match)
 *   PSXHud.text(bmp, s, x, y, w, ...)  pixel text with a hard 1px shadow
 *   PSXHud.panel(bmp, x, y, w, h, o)   keylined box
 *   PSXHud.dither(bmp, x, y, w, h, c)  2x2 checker fill (PSX "transparency")
 *   PSXHud.bar / PSXHud.vbar           segmented gauges
 *   PSXHud.reticle(bmp, x, y, r, c)    chunky targeting sight
 *   PSXHud.domPanel(spriteOrLayer)     crisp HTML type over a widget
 *   PSXHud.PAL                         the fixed 16-colour HUD palette
 *
 * There is no CRT pass. Scanlines and a vignette are a filter over the picture,
 * not part of how a 32-bit console drew: they cost contrast, they beat on 8px type
 * and they read as a photo of a television rather than a game. The look here is
 * the geometry (vertex snap, banding, nearest sampling, block gauges, one pixel
 * keylines) with nothing smeared on top, and the type is real HTML so it is as
 * sharp as the display allows.
 *
 * ---------------------------------------------------------------------------
 * The art deco theme
 * ---------------------------------------------------------------------------
 * The 3D minigames (the tarot table, the bowling alley, the basketball court)
 * share one HUD language: gold on black, the way a 1920s lobby directory or a
 * theatre programme was set. Solid black fields, a gold keyline, a broken inner
 * hairline, stepped corners, lozenge rules and gold header bands with the type
 * knocked out in black. It costs the same fillRects the bevelled boxes did and
 * it reads far better over a candlelit table.
 *
 *   PSXHud.DECO                        the gold/black palette
 *   PSXHud.decoPanel(bmp,x,y,w,h,o)    black field, gold keyline, stepped corners
 *                                      ({ title, titleRight } adds a header band)
 *   PSXHud.decoHeader(bmp,x,y,w,s,o)   gold band with knocked-out lettering
 *   PSXHud.decoRule(bmp,x,y,w,c,o)     hairline broken by a centre lozenge
 *   PSXHud.decoSelect(bmp,x,y,w,h,c)   selected-row plate with a gold spine
 *   PSXHud.decoBar(bmp,x,y,w,h,v,o)    segmented gauge in deco colours
 *   PSXHud.decoVBar(bmp,x,y,w,h,v,o)   the vertical one
 *   PSXHud.decoSunburst(bmp,x,y,r,c,o) corner fan, the one piece of ornament
 *   PSXHud.decoChevrons(bmp,x,y,n,c,o) marching triangles, for empty margins
 *
 * This plugin defines no plugin commands and must load before the weapon and
 * battler plugins that consume it.
 */

(function() {
    'use strict';

    // Idempotent: never clobber an already-installed helper.
    if (window.PSXShader) return;

    const PSXShader = {
        enabled: true,
        vertexSnap: 420.0,
        colorLevels: 48,
        dither: 0.18,
        downscale: 0.88,
        nearestTex: true,

        // Identity of this look. The other shader (PixelArtShader, below)
        // inherits from this object and only has to change these three so its
        // patched materials, its shader programs and its render target never
        // collide with SnapVertex's.
        markerKey: '_psx',
        cachePrefix: 'psx_',
        ctxKey: '__psxCtx',

        // ---------------------------------------------------------------
        // Material patching
        // ---------------------------------------------------------------

        // Build the GLSL injected into a material, baking the current config in
        // as literals so no per-frame uniform plumbing is needed.
        _buildChunks() {
            const snap = this.vertexSnap.toFixed(1);
            const levels = Math.max(2, this.colorLevels).toFixed(1);
            const dither = Math.min(1, Math.max(0, this.dither)).toFixed(4);

            const vertex =
                '\n#include <project_vertex>\n' +
                '// SnapVertex vertex snapping\n' +
                '{\n' +
                '  vec4 psx_clip = gl_Position;\n' +
                '  if (abs(psx_clip.w) > 0.00001) {\n' +
                '    vec3 psx_ndc = psx_clip.xyz / psx_clip.w;\n' +
                '    psx_ndc.xy = floor(psx_ndc.xy * ' + snap + ') / ' + snap + ';\n' +
                '    gl_Position = vec4(psx_ndc * psx_clip.w, psx_clip.w);\n' +
                '  }\n' +
                '}\n';

            const fragHelpers =
                'float psx_bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }\n' +
                'float psx_bayer4(vec2 a){ return psx_bayer2(0.5 * a) * 0.25 + psx_bayer2(a); }\n' +
                'void main() {';

            const fragQuant =
                '// SnapVertex color quantization + ordered dithering\n' +
                '{\n' +
                '  float psx_levels = ' + levels + ';\n' +
                '  float psx_off = mix(0.5, psx_bayer4(gl_FragCoord.xy), ' + dither + ');\n' +
                '  gl_FragColor.rgb = floor(gl_FragColor.rgb * psx_levels + psx_off) / psx_levels;\n' +
                '}\n' +
                '#include <dithering_fragment>';

            return { vertex, fragHelpers, fragQuant };
        },

        applyToMaterial(material) {
            if (!material || !this.enabled) return;
            if (material.userData && material.userData[this.markerKey]) return; // already patched

            material.userData = material.userData || {};
            material.userData[this.markerKey] = true;

            const chunks = this._buildChunks();
            const cacheKey = this.cachePrefix + this.vertexSnap + '_' + this.colorLevels + '_' + this.dither;

            const prev = material.onBeforeCompile;
            material.onBeforeCompile = function(shader, renderer) {
                if (typeof prev === 'function') prev.call(this, shader, renderer);

                if (shader.vertexShader.indexOf('#include <project_vertex>') !== -1) {
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <project_vertex>', chunks.vertex
                    );
                }
                if (shader.fragmentShader.indexOf('void main() {') !== -1) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'void main() {', chunks.fragHelpers
                    );
                }
                if (shader.fragmentShader.indexOf('#include <dithering_fragment>') !== -1) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <dithering_fragment>', chunks.fragQuant
                    );
                }
            };
            // Allow programs with identical settings to be shared.
            material.customProgramCacheKey = function() { return cacheKey; };

            if (this.nearestTex && material.map) {
                const tex = material.map;
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                tex.generateMipmaps = false;
                tex.needsUpdate = true;
            }

            material.needsUpdate = true;
        },

        applyToObject(root) {
            if (!root || !this.enabled || typeof THREE === 'undefined') return;
            root.traverse((obj) => {
                if (!obj.material) return;
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m) => this.applyToMaterial(m));
                } else {
                    this.applyToMaterial(obj.material);
                }
            });
        },

        // Run fn with the tunables temporarily multiplied by the given factors
        // ({ vertexSnap, colorLevels, dither, downscale }, 1 or missing means
        // unchanged). Lets a single scene dial the retro look up or down without
        // overriding what the player picked in the options: wrap both the model
        // building (the baked tunables) and the render call (downscale) in it.
        withScale(factors, fn) {
            if (!this.enabled || !factors) return fn();
            const saved = {
                vertexSnap: this.vertexSnap,
                colorLevels: this.colorLevels,
                dither: this.dither,
                downscale: this.downscale
            };
            this.vertexSnap = saved.vertexSnap * (factors.vertexSnap || 1);
            this.colorLevels = Math.min(64, saved.colorLevels * (factors.colorLevels || 1));
            this.dither = Math.min(1, saved.dither * (factors.dither || 1));
            this.downscale = Math.min(1, saved.downscale * (factors.downscale || 1));
            try {
                return fn();
            } finally {
                Object.assign(this, saved);
            }
        },

        // ---------------------------------------------------------------
        // Low-resolution downsample render pass
        // ---------------------------------------------------------------

        _ctx(renderer) {
            const CK = this.ctxKey;
            if (renderer[CK]) return renderer[CK];
            const quadMat = new THREE.MeshBasicMaterial({
                map: null,
                depthTest: false,
                depthWrite: false,
                transparent: false
            });
            quadMat.blending = THREE.NoBlending;
            const quadScene = new THREE.Scene();
            const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
            quadScene.add(quadMesh);
            const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
            quadCam.position.z = 1;
            const ctx = { target: null, quadMat, quadScene, quadCam };
            renderer[CK] = ctx;

            // On GPU context loss the cached WebGLRenderTarget (and its texture)
            // become invalid but are only rebuilt on size change, so a restore
            // would blit from a dead target. Drop the whole cache on restore so
            // _ctx rebuilds it, and release the target on loss.
            const canvas = renderer.domElement;
            if (canvas && !canvas[CK + 'LossHook']) {
                canvas[CK + 'LossHook'] = true;
                canvas.addEventListener('webglcontextlost', () => {
                    if (renderer[CK]) renderer[CK].target = null;
                });
                canvas.addEventListener('webglcontextrestored', () => {
                    renderer[CK] = null;
                });
            }
            return ctx;
        },

        // Release the cached downsample resources (render target, quad geometry
        // and material) hung on the renderer. Call before renderer.dispose() on
        // teardown so each battle does not leak a WebGLRenderTarget.
        disposeContext(renderer) {
            const CK = this.ctxKey;
            if (!renderer || !renderer[CK]) return;
            const ctx = renderer[CK];
            if (ctx.target && ctx.target.dispose) ctx.target.dispose(); // also frees its texture
            if (ctx.quadMat && ctx.quadMat.dispose) ctx.quadMat.dispose();
            if (ctx.quadScene && ctx.quadScene.traverse) {
                ctx.quadScene.traverse((obj) => {
                    if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
                });
            }
            renderer[CK] = null;
        },

        render(renderer, scene, camera) {
            if (!renderer || typeof THREE === 'undefined') return;
            const gl = renderer.getContext ? renderer.getContext() : null;
            if (!gl || (gl.isContextLost && gl.isContextLost())) return;

            if (!this.enabled || this.downscale >= 0.999) {
                try {
                    renderer.render(scene, camera);
                } catch (e) {
                    console.warn("PSXShader: render failed", e);
                }
                return;
            }

            try {
                const fullW = (renderer.domElement && renderer.domElement.width) || 1;
                const fullH = (renderer.domElement && renderer.domElement.height) || 1;
                const lowW = Math.max(1, Math.floor(fullW * this.downscale));
                const lowH = Math.max(1, Math.floor(fullH * this.downscale));

                const ctx = this._ctx(renderer);
                let rt = ctx.target;
                if (!rt || rt.width !== lowW || rt.height !== lowH) {
                    if (rt) rt.dispose();
                    rt = new THREE.WebGLRenderTarget(lowW, lowH, {
                        minFilter: THREE.NearestFilter,
                        magFilter: THREE.NearestFilter,
                        format: THREE.RGBAFormat,
                        depthBuffer: true,
                        stencilBuffer: false
                    });
                    ctx.target = rt;
                    ctx.quadMat.map = rt.texture;
                    ctx.quadMat.needsUpdate = true;
                }

                const prevTarget = renderer.getRenderTarget();

                // Pass 1: render the scene into the low-res target.
                renderer.setRenderTarget(rt);
                renderer.clear();
                renderer.render(scene, camera);

                // Pass 2: blit the low-res target onto the canvas, upscaled with
                // nearest filtering. NoBlending copies RGBA verbatim so the canvas
                // ends up identical to a direct render, just pixelated (no alpha
                // fringing for the transparent weapon overlay).
                renderer.setRenderTarget(prevTarget);
                renderer.render(ctx.quadScene, ctx.quadCam);
            } catch (e) {
                console.warn("PSXShader: render failed", e);
            }
        }
    };

    // The snap-vertex look, under its own name. window.PSXShader stays as the
    // facade every scene talks to (see RetroShader, below); this is the object
    // itself, for anything that specifically wants THIS look.
    const SnapVertexShader = PSXShader;
    window.SnapVertexShader = SnapVertexShader;

    //=====================================================================
    // PixelArtShader - the same helper, a different era
    //=====================================================================
    // Where SnapVertex emulates a console that could not do the maths (wobbling
    // vertices, shallow banding, a gentle downsample), this one emulates a
    // hand-drawn sprite: a fixed palette, flat cel-shaded bands of light, a
    // crunchy inked shading edge and chunky pixels. It inherits every mechanic
    // from SnapVertexShader and only replaces the GLSL and the tunables, so
    // nothing about a monster, a weapon or a voxel chunk has to change: a scene
    // asks RetroShader which of the two to call applyToObject() / render() on.
    //
    //   levels       shades per channel when the palette is off
    //   lightSteps   cel bands the lit colour is snapped to
    //   saturation   colour boost, 1 = untouched
    //   inkStrength  how dark the darkest band is pushed, 0..1
    //   pixelSnap    vertex snap grid, or 0 for none (sprites do not wobble)
    //   downscale    the pixel size itself; this is the whole look
    //   weaponBoost  the first person weapon fills a few dozen pixels of the
    //                screen, so at the scene's own pixel size it turns to mush:
    //                its overlay renders this much finer
    //   palette      snap every colour to AAP-Splendor128 (see PALETTE below)
    const PixelArtShader = Object.create(SnapVertexShader);
    Object.assign(PixelArtShader, {
        enabled: false,
        markerKey: '_pxa',
        cachePrefix: 'pxa_',
        ctxKey: '__pxaCtx',

        levels: 0,
        lightSteps: 5,
        saturation: 1.15,
        inkStrength: 0.25,
        pixelSnap: 0,
        dither: 0.25,
        downscale: 0.5,
        weaponBoost: 2.0,
        palette: true,
        nearestTex: true,

        // Retro pixel-art palettes
        PALETTES: {
            // Aurora 256 by DawnBringer - 256 colors covering full spectrum ramps
            aurora256: [
            0x000000, 0x111111, 0x222222, 0x333333, 0x444444, 0x555555, 0x666666, 0x777777,
            0x888888, 0x999999, 0xaaaaaa, 0xbbbbbb, 0xcccccc, 0xdddddd, 0xeeeeee, 0xffffff,
            0x007f7f, 0x3fbfbf, 0x00ffff, 0xbfffff, 0x8181ff, 0x0000ff, 0x3f3fbf, 0x00007f,
            0x0f0f50, 0x7f007f, 0xbf3fbf, 0xf500f5, 0xfd81ff, 0xffc0cb, 0xff8181, 0xff0000,
            0xbf3f3f, 0x7f0000, 0x551414, 0x7f3f00, 0xbf7f3f, 0xff7f00, 0xffbf81, 0xffffbf,
            0xffff00, 0xbfbf3f, 0x7f7f00, 0x007f00, 0x3fbf3f, 0x00ff00, 0xafffaf, 0x00bfff,
            0x007fff, 0x4b7dc8, 0xbcafc0, 0xcbaa89, 0xa6a090, 0x7e9494, 0x6e8287, 0x7e6e60,
            0xa0695f, 0xc07872, 0xd08a74, 0xe19b7d, 0xebaa8c, 0xf5b99b, 0xf6c8af, 0xf5e1d2,
            0x7f00ff, 0x573b3b, 0x73413c, 0x8e5555, 0xab7373, 0xc78f8f, 0xe3abab, 0xf8d2da,
            0xe3c7ab, 0xc49e73, 0x8f7357, 0x73573b, 0x3b2d1f, 0x414123, 0x73733b, 0x8f8f57,
            0xa2a255, 0xb5b572, 0xc7c78f, 0xdadaab, 0xededc7, 0xc7e3ab, 0xabc78f, 0x8ebe55,
            0x738f57, 0x587d3e, 0x465032, 0x191e0f, 0x235037, 0x3b573b, 0x506450, 0x3b7349,
            0x578f57, 0x73ab73, 0x64c082, 0x8fc78f, 0xa2d8a2, 0xe1f8fa, 0xb4eeca, 0xabe3c5,
            0x87b48e, 0x507d5f, 0x0f6946, 0x1e2d23, 0x234146, 0x3b7373, 0x64abab, 0x8fc7c7,
            0xabe3e3, 0xc7f1f1, 0xbed2f0, 0xabc7e3, 0xa8b9dc, 0x8fabc7, 0x578fc7, 0x57738f,
            0x3b5773, 0x0f192d, 0x1f1f3b, 0x3b3b57, 0x494973, 0x57578f, 0x736eaa, 0x7676ca,
            0x8f8fc7, 0xababe3, 0xd0daf8, 0xe3e3ff, 0xab8fc7, 0x8f57c7, 0x73578f, 0x573b73,
            0x3c233c, 0x463246, 0x724072, 0x8f578f, 0xab57ab, 0xab73ab, 0xebace1, 0xffdcf5,
            0xe3c7e3, 0xe1b9d2, 0xd7a0be, 0xc78fb9, 0xc87da0, 0xc35a91, 0x4b2837, 0x321623,
            0x280a1e, 0x401811, 0x621800, 0xa5140a, 0xda2010, 0xd5524a, 0xff3c0a, 0xf55a32,
            0xff6262, 0xf6bd31, 0xffa53c, 0xd79b0f, 0xda6e0a, 0xb45a00, 0xa04b05, 0x5f3214,
            0x53500a, 0x626200, 0x8c805a, 0xac9400, 0xb1b10a, 0xe6d55a, 0xffd510, 0xffea4a,
            0xc8ff41, 0x9bf046, 0x96dc19, 0x73c805, 0x6aa805, 0x3c6e14, 0x283405, 0x204608,
            0x0c5c0c, 0x149605, 0x0ad70a, 0x14e60a, 0x7dff73, 0x4bf05a, 0x00c514, 0x05b450,
            0x1c8c4e, 0x123832, 0x129880, 0x06c491, 0x00de6a, 0x2deba8, 0x3cfea5, 0x6affcd,
            0x91ebff, 0x55e6ff, 0x7dd7f0, 0x08ded5, 0x109cde, 0x055a5c, 0x162c52, 0x0f377d,
            0x004a9c, 0x326496, 0x0052f6, 0x186abd, 0x2378dc, 0x699dc3, 0x4aa4ff, 0x90b0ff,
            0x5ac5ff, 0xbeb9fa, 0x786ef0, 0x4a5aff, 0x6241f6, 0x3c3cf5, 0x101cda, 0x0010bd,
            0x231094, 0x0c2148, 0x5010b0, 0x6010d0, 0x8732d2, 0x9c41ff, 0xbd62ff, 0xb991ff,
            0xd7a5ff, 0xd7c3fa, 0xf8c6fc, 0xe673ff, 0xff52ff, 0xda20e0, 0xbd29ff, 0xbd10c5,
            0x8c14be, 0x5a187b, 0x641464, 0x410062, 0x320a46, 0x551937, 0xa01982, 0xc80078,
            0xff50bf, 0xff6ac5, 0xfaa0b9, 0xfc3a8c, 0xe61e78, 0xbd1039, 0x98344d, 0x911437
            ],
            // AAP-Splendor128 by Adam C. Younis (128 colors)
            splendor128: [
            0x050403, 0x0e0c0c, 0x2d1b1e, 0x612721, 0xb9451d, 0xf1641f, 0xfca570, 0xffe0b7,
            0xffffff, 0xfff089, 0xf8c53a, 0xe88a36, 0xb05b2c, 0x673931, 0x271f1b, 0x4c3d2e,
            0x855f39, 0xd39741, 0xf8f644, 0xd5dc1d, 0xadb834, 0x7f8e44, 0x586335, 0x333c24,
            0x181c19, 0x293f21, 0x477238, 0x61a53f, 0x8fd032, 0xc4f129, 0xd0ffea, 0x97edca,
            0x59cf93, 0x42a459, 0x3d6f43, 0x27412d, 0x14121d, 0x1b2447, 0x2b4e95, 0x2789cd,
            0x42bfe8, 0x73efe8, 0xf1f2ff, 0xc9d4fd, 0x8aa1f6, 0x4572e3, 0x494182, 0x7864c6,
            0x9c8bdb, 0xceaaed, 0xfad6ff, 0xeeb59c, 0xd480bb, 0x9052bc, 0x171516, 0x373334,
            0x695b59, 0xb28b78, 0xe2b27e, 0xf6d896, 0xfcf7be, 0xecebe7, 0xc6d8d3, 0x9cb4b8,
            0x6e868e, 0x43565d, 0x222c2f, 0x121719, 0x361d32, 0x632d47, 0xa63d62, 0xe55c8b,
            0xfe82c1, 0xffb7e3, 0xffe9f9, 0xd9c7f0, 0xb09cda, 0x7966ae, 0x46376d, 0x2b213b,
            0x38261e, 0x674130, 0xa06842, 0xdb955e, 0xf7c680, 0xffebb3, 0xfff8e5, 0xd7e8d2,
            0xabccb4, 0x7aa88f, 0x4c7c65, 0x2a4d3f, 0x16251f, 0x262120, 0x493a36, 0x7a635a,
            0xb39687, 0xe7c7b2, 0xfcebd6, 0xfdf9f1, 0xd4e2e9, 0xa4bdcb, 0x718b9f, 0x435a6d,
            0x23313e, 0x11181d, 0x40222a, 0x743542, 0xb74d5f, 0xed7386, 0xffa5b8, 0xffd4e1,
            0xf7f4ff, 0xdad3f4, 0xb1a5de, 0x7f6eb9, 0x523d7c, 0x2e2344, 0x43251e, 0x7c4130,
            0xbd684a, 0xf0986d, 0xffc79a, 0xffeacc
            ],
            // LCD monochrome handheld palette (4 shades)
            lcd: [
            0x0f380f, 0x306230, 0x8bac0f, 0x9bbc0f
            ]
        },
        currentPalette: 'aurora256',
        _palette: false,

        setPalette(nameOrArray) {
            if (typeof nameOrArray === 'string') {
                this.palette = nameOrArray;
            } else if (Array.isArray(nameOrArray)) {
                this.PALETTE = nameOrArray;
            } else if (typeof nameOrArray === 'boolean') {
                this.palette = nameOrArray;
            }
            return this.currentPalette;
        },

        // How many cells a side the colour cube is cut into before it is looked
        // up. 32 is 32768 cells: fine enough that two palette inks rarely share
        // one, small enough to build in a few milliseconds.
        LUT_SIZE: 32,

        // The palette as a lookup texture: cell (r,g,b) holds the nearest
        // palette ink to that colour, so the shader answers "which ink is this"
        // in ONE texture fetch instead of a hundred distance tests per pixel.
        // Laid out as N slices of NxN side by side (an N*N wide, N tall image),
        // the standard 3D-LUT-in-a-2D-texture trick.
        _lut: null,
        paletteTexture() {
            if (this._lut) return this._lut;
            if (typeof THREE === 'undefined') return null;
            const N = this.LUT_SIZE;
            const cols = this.PALETTE.map((hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
            // Rows of the image are green; each row holds N slices (blue) of N
            // reds, so one row is (all blues) x (all reds) at that green.
            const img = new Uint8Array(N * N * N * 4);
            for (let b = 0; b < N; b++) {
                const cb = b * 255 / (N - 1);
                for (let g = 0; g < N; g++) {
                    const cg = g * 255 / (N - 1);
                    for (let r = 0; r < N; r++) {
                        const cr = r * 255 / (N - 1);
                        let best = 0, bestD = Infinity;
                        for (let k = 0; k < cols.length; k++) {
                            const c = cols[k];
                            // Weighted by how much each channel carries of the
                            // apparent brightness: a plain RGB distance picks
                            // inks that are numerically close but visibly wrong.
                            const dr = (c[0] - cr) * 0.5;
                            const dg = (c[1] - cg) * 0.7;
                            const db = (c[2] - cb) * 0.3;
                            const d = dr * dr + dg * dg + db * db;
                            if (d < bestD) { bestD = d; best = k; }
                        }
                        const c = cols[best];
                        const o = (g * (N * N) + b * N + r) * 4;
                        img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 255;
                    }
                }
            }
            const tex = new THREE.DataTexture(img, N * N, N, THREE.RGBAFormat);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            tex.needsUpdate = true;
            this._lut = tex;
            return tex;
        },

        // Drop the built LUT so the next patch rebuilds it. Called when the
        // palette toggle changes.
        invalidatePalette() {
            if (this._lut && this._lut.dispose) this._lut.dispose();
            this._lut = null;
        },

        // The first person weapon overlay asks for 'weapon'; everything else
        // takes the scene's own pixel size.
        downscaleFor(kind) {
            const d = this.downscale;
            if (kind === 'weapon') return Math.min(1, d * (this.weaponBoost || 1));
            return d;
        },

        _buildChunks() {
            const base = SnapVertexShader._buildChunks.call(this);
            const levels = Math.max(2, this.levels).toFixed(1);
            const steps = Math.max(1, this.lightSteps).toFixed(1);
            const sat = Math.max(0, this.saturation).toFixed(4);
            const ink = Math.min(1, Math.max(0, this.inkStrength)).toFixed(4);
            const dither = Math.min(1, Math.max(0, this.dither)).toFixed(4);
            const usePal = !!this.palette && typeof THREE !== 'undefined';
            const N = this.LUT_SIZE.toFixed(1);

            const fragHelpers =
                'float psx_bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }\n' +
                'float psx_bayer4(vec2 a){ return psx_bayer2(0.5 * a) * 0.25 + psx_bayer2(a); }\n' +
                (usePal ? 'uniform sampler2D pxaPalette;\n' : '') +
                'void main() {';

            // Either snap to the palette through the LUT, or quantize each
            // channel (if levels > 0), or pass the lit cel-shaded colour through
            // with no colour limit (unlimited colours).
            const quant = usePal
                ? ('  vec3 pxa_q = clamp(pxa_c + (pxa_d - 0.5) * (' + dither + ' * 2.0 / ' + N + '), 0.0, 1.0);\n' +
                   '  float pxa_n = ' + N + ';\n' +
                   '  float pxa_rs = floor(pxa_q.r * (pxa_n - 1.0) + 0.5);\n' +
                   '  float pxa_gs = floor(pxa_q.g * (pxa_n - 1.0) + 0.5);\n' +
                   '  float pxa_bs = floor(pxa_q.b * (pxa_n - 1.0) + 0.5);\n' +
                   '  vec2 pxa_uv = vec2((pxa_bs * pxa_n + pxa_rs + 0.5) / (pxa_n * pxa_n),\n' +
                   '                     (pxa_gs + 0.5) / pxa_n);\n' +
                   '  gl_FragColor.rgb = texture2D(pxaPalette, pxa_uv).rgb;\n')
                : (this.levels > 0 && this.levels < 256
                    ? ('  float pxa_levels = ' + levels + ';\n' +
                       '  gl_FragColor.rgb = floor(pxa_c * pxa_levels + mix(0.5, pxa_d, ' + dither + ')) / pxa_levels;\n')
                    : '  gl_FragColor.rgb = pxa_c;\n');

            // The pass, run on the finished lit colour:
            //  1. snap brightness to a few flat bands (cel shading), keeping the
            //     hue: the ratio is clamped so a bright band cannot push a
            //     channel past white and bleach the whole model
            //  2. push the darkest band toward ink so shapes read as outlined
            //  3. boost saturation, the way a limited palette is picked
            //  4. quantize, palette or levels
            const fragQuant =
                '// Pixel-art cel bands + palette\n' +
                '{\n' +
                '  vec3 pxa_c = clamp(gl_FragColor.rgb, 0.0, 1.0);\n' +
                '  float pxa_l = dot(pxa_c, vec3(0.2126, 0.7152, 0.0722));\n' +
                '  float pxa_m = max(pxa_c.r, max(pxa_c.g, pxa_c.b));\n' +
                '  if (pxa_l > 0.0001 && pxa_m > 0.0001) {\n' +
                '    float pxa_b = (floor(pxa_l * ' + steps + ') + 0.5) / ' + steps + ';\n' +
                '    pxa_b = mix(pxa_b, pxa_b * (1.0 - ' + ink + '), step(pxa_l, 1.0 / ' + steps + '));\n' +
                '    pxa_c *= min(pxa_b / pxa_l, 1.0 / pxa_m);\n' +
                '  }\n' +
                '  float pxa_g = dot(pxa_c, vec3(0.2126, 0.7152, 0.0722));\n' +
                '  pxa_c = clamp(mix(vec3(pxa_g), pxa_c, ' + sat + '), 0.0, 1.0);\n' +
                '  float pxa_d = psx_bayer4(gl_FragCoord.xy);\n' +
                quant +
                '}\n' +
                '#include <dithering_fragment>';

            return { vertex: base.vertex, fragHelpers, fragQuant, usePalette: usePal };
        },

        // The base version scales vertexSnap, which on this look is the
        // "no wobble" sentinel: multiplying it would quietly turn geometry
        // snapping on. A scene asking for a softer or harsher pixel-art look
        // means the pixels and the colours, so only those move.
        withScale(factors, fn) {
            if (!this.enabled || !factors) return fn();
            const saved = {
                levels: this.levels,
                lightSteps: this.lightSteps,
                dither: this.dither,
                downscale: this.downscale
            };
            this.levels = Math.max(2, saved.levels * (factors.colorLevels || 1));
            this.lightSteps = Math.max(1, saved.lightSteps * (factors.colorLevels || 1));
            this.dither = Math.min(1, saved.dither * (factors.dither || 1));
            this.downscale = Math.min(1, saved.downscale * (factors.downscale || 1));
            try {
                return fn();
            } finally {
                Object.assign(this, saved);
            }
        },

        applyToMaterial(material) {
            if (!material || !this.enabled) return;
            // A material wears one look or the other, never both: patching it
            // twice chains two quantize blocks onto the same fragment shader.
            if (material.userData && material.userData._psx) return;
            const usePal = !!this.palette;
            SnapVertexShader.applyToMaterial.call(this, material);
            if (material.userData) material.userData._psx = true;
            if (!usePal) return;

            // Hand the LUT to the program the base patch just hooked. That hook
            // runs on compile, so wrap it rather than replace it.
            const tex = this.paletteTexture();
            if (!tex) return;
            const prev = material.onBeforeCompile;
            material.onBeforeCompile = function(shader, renderer) {
                if (typeof prev === 'function') prev.call(this, shader, renderer);
                shader.uniforms.pxaPalette = { value: tex };
            };
        }
    });

    // Aliases onto the names the shared mechanics (and withScale, and the
    // options screen) already know. Defined here rather than in the literal
    // above because Object.assign copies a getter's VALUE, not the accessor.
    //   vertexSnap  SnapVertex bakes it into the vertex chunk; pixel art wants
    //               the geometry stable, so pixelSnap drives it and is off by
    //               default (a sprite does not swim)
    //   colorLevels the same number as levels
    Object.defineProperties(PixelArtShader, {
        vertexSnap: {
            get() { return this.pixelSnap || 100000; },
            set(v) { this.pixelSnap = v; },
            enumerable: true, configurable: true
        },
        colorLevels: {
            get() { return this.levels; },
            set(v) { this.levels = v; },
            enumerable: true, configurable: true
        },
        palette: {
            get() {
                return this._palette;
            },
            set(val) {
                if (typeof val === 'string') {
                    if (val === 'none' || val === 'off') {
                        if (this._palette !== false) {
                            this._palette = false;
                            this.invalidatePalette();
                        }
                    } else if (this.PALETTES && this.PALETTES[val]) {
                        const changed = (this.currentPalette !== val || this._palette !== true);
                        this.currentPalette = val;
                        this._palette = true;
                        if (changed) this.invalidatePalette();
                    }
                } else {
                    const boolVal = !!val;
                    if (this._palette !== boolVal) {
                        this._palette = boolVal;
                        this.invalidatePalette();
                    }
                }
            },
            enumerable: true, configurable: true
        },
        PALETTE: {
            get() {
                const map = this.PALETTES;
                if (!map) return [];
                return map[this.currentPalette] || map.aurora256;
            },
            set(val) {
                if (Array.isArray(val)) {
                    if (!this.PALETTES) this.PALETTES = {};
                    this.PALETTES.custom = val;
                    this.currentPalette = 'custom';
                    this._palette = true;
                    this.invalidatePalette();
                }
            },
            enumerable: true, configurable: true
        }
    });

    window.PixelArtShader = PixelArtShader;

    // SnapVertex answers downscaleFor() too, so no consumer has to know which
    // look it is talking to.
    SnapVertexShader.downscaleFor = function() { return this.downscale; };

    //=====================================================================
    // Which look every 3D scene is wearing
    //=====================================================================
    // ONE global answer, picked by the player in Options > Video. Every three.js
    // viewport in the game (battle, the voxel world, the minigames, GalaxySim,
    // the menu previews, the title screen) goes through it, so the look is the
    // same everywhere and switching it is one setting, not thirty.
    //
    //   'snapvertex'  the PS1 look (vertex wobble, banding, low res)
    //   'pixelart'    the sprite look (cel bands, 256 colors default, chunky)
    //   'off'         plain three.js
    const RetroShader = {
        MODES: ['off', 'snapvertex', 'pixelart'],
        mode: 'snapvertex',

        setMode(mode) {
            this.mode = this.MODES.indexOf(mode) === -1 ? 'snapvertex' : mode;
            SnapVertexShader.enabled = (this.mode === 'snapvertex');
            PixelArtShader.enabled = (this.mode === 'pixelart');
            return this.mode;
        },

        isPixelArt() { return this.mode === 'pixelart' && PixelArtShader.enabled; },

        // A scene that is EXEMPT from the whole business. GalaxySim is the one:
        // a star map is not a period 3D game, and banding a nebula or snapping
        // a planet's limb to a low-res grid reads as a rendering fault rather
        // than a style. It asks for this instead of window.PSXShader, so the
        // exemption is a named thing in the code and not an absence.
        NONE: {
            enabled: false,
            downscale: 1,
            applyToMaterial() {},
            applyToObject() {},
            withScale(factors, fn) { return fn(); },
            downscaleFor() { return 1; },
            disposeContext() {},
            render(renderer, scene, camera) {
                if (renderer && scene && camera) renderer.render(scene, camera);
            }
        },

        // For a scene graph that is built a piece at a time and never all at
        // once (the voxel world streams its chunks in and out for as long as it
        // runs): wrap the root's add() so anything put into it is patched on the
        // way in. Idempotent per root, and cheap, because applyToMaterial marks
        // what it has done and every one of those materials is shared.
        patchSceneAdds(root) {
            if (!root || root.__retroAddsPatched) return root;
            root.__retroAddsPatched = true;
            const self = this;
            const add = root.add;
            root.add = function(...objs) {
                const out = add.apply(this, objs);
                for (const obj of objs) {
                    if (obj && obj.traverse) self.active().applyToObject(obj);
                }
                return out;
            };
            return root;
        },

        // The shader object a consumer should patch and render through. Always
        // an object (never null) so callers can just use it; when the look is
        // off both report enabled === false and every entry point is a no-op
        // that renders straight through.
        active() {
            return this.isPixelArt() ? PixelArtShader : SnapVertexShader;
        }
    };
    window.RetroShader = RetroShader;

    //=====================================================================
    // window.PSXShader - the facade
    //=====================================================================
    // Every 3D scene in the game already calls window.PSXShader.applyToObject /
    // render / withScale / disposeContext. Rather than edit thirty files, the
    // name now points at a facade that forwards each of those to whichever look
    // is in force, which is what makes the setting global. Code that
    // specifically wants one of them names it (window.SnapVertexShader /
    // window.PixelArtShader).
    const Facade = {
        applyToMaterial(m) { return RetroShader.active().applyToMaterial(m); },
        applyToObject(o) { return RetroShader.active().applyToObject(o); },
        render(r, s, c) { return RetroShader.active().render(r, s, c); },
        withScale(f, fn) { return RetroShader.active().withScale(f, fn); },
        _buildChunks() { return RetroShader.active()._buildChunks(); },
        downscaleFor(kind) { return RetroShader.active().downscaleFor(kind); },
        // A renderer may have been used under either look, so tear both down.
        disposeContext(r) {
            SnapVertexShader.disposeContext(r);
            PixelArtShader.disposeContext(r);
        }
    };
    // The tunables read straight off the active look, and writing one (the
    // options screen, a scene dialling the look down) lands on it too.
    ['enabled', 'vertexSnap', 'colorLevels', 'dither', 'downscale', 'nearestTex'].forEach((key) => {
        Object.defineProperty(Facade, key, {
            get() { return RetroShader.active()[key]; },
            set(v) { RetroShader.active()[key] = v; },
            enumerable: true, configurable: true
        });
    });
    window.PSXShader = Facade;

    //=====================================================================
    // PSXHud - low-resolution 2D overlay toolkit
    //=====================================================================
    const PSXHud = {
        // Virtual framebuffer height. 240 is the PS1's own scanline count and it
        // is the fixed side: the console kept 240 lines and widened the frame for
        // 16:9, so deriving the width from the aspect keeps a HUD the same
        // apparent size on a 4:3 window and an ultrawide one. Every HUD
        // coordinate in the minigames is expressed in these units.
        BASE_H: 240,

        baseWidth() {
            const h = Graphics.height || 240;
            return Math.max(64, Math.round(this.BASE_H * (Graphics.width || 320) / h));
        },

        // Virtual pixel -> screen pixel factor.
        scale() {
            return (Graphics.height || 240) / this.BASE_H;
        },

        // Registered through FontManager on first use. PixelOperator8 is an
        // 8px bitmap face, so at 8 / 16 virtual pixels it lands exactly on the
        // pixel grid before the layer is upscaled.
        FONT: 'psxhud',
        FONT_FILE: 'PixelOperator8-Bold.ttf',
        _fontLoaded: false,

        // A deliberately small, fixed palette. PSX HUDs did not have gradients
        // or soft shadows; they had six or seven colours and a dither pattern.
        PAL: {
            ink:      '#e8f0f8',
            dim:      '#93a3b8',
            shadow:   '#080a12',
            panel:    '#101a2c',
            panelLo:  '#060a14',
            edgeHi:   '#5f82b4',
            edgeLo:   '#0a1220',
            cyan:     '#3ad7ef',
            amber:    '#ffc02e',
            red:      '#e8442e',
            green:    '#4fe07a',
            magenta:  '#e061c8',
            blue:     '#3a6df0',
            bone:     '#e8dfc0'
        },

        font() {
            if (!this._fontLoaded) {
                this._fontLoaded = true;
                try {
                    if (window.FontManager && FontManager.load) FontManager.load(this.FONT, this.FONT_FILE);
                } catch (e) {
                    this.FONT = 'monospace';
                }
            }
            return this.FONT;
        },

        // The pixel font arrives asynchronously, so anything that paints once
        // (a scoreboard, a result card) has to repaint when it lands or it is
        // stuck with the fallback face for the rest of the scene.
        onFontReady(cb) {
            this.font();
            const poll = () => {
                let ready = true;
                try {
                    ready = !window.FontManager || !FontManager.isReady || FontManager.isReady();
                } catch (e) {
                    ready = true;   // a failed font is not worth blocking a HUD over
                }
                if (ready) cb();
                else setTimeout(poll, 120);
            };
            poll();
        },

        // Device pixels painted per virtual pixel. A 240 line buffer stretched
        // four times across a modern window magnifies every rasterising artefact
        // by four as well: the grey fringe canvas puts on an 8px glyph becomes a
        // 4px grey band, and the type reads as a smear. Painting into a whole
        // multiple of the virtual size and letting the sprite make up the
        // fraction keeps the glyphs on an exact pixel grid (an 8px bitmap face
        // at 16 or 24px is the same shape, cut finer) and shrinks the fringe to
        // one buffer pixel. Capped at 3: the HUD is repainted every frame and
        // past that the texture upload costs more than the sharpness is worth.
        superSample() {
            const s = Math.floor((Graphics.height || 240) / this.BASE_H);
            return Math.max(1, Math.min(3, s));
        },

        // A crisp low-resolution overlay covering the screen. The caller adds
        // `sprite` to its scene and draws into `bitmap` using virtual pixels.
        // `w`/`h` stay in those virtual units whatever the supersample factor,
        // so a caller's coordinates never have to know about it.
        layer(baseWidth) {
            const bw = Math.max(64, Math.round(baseWidth || this.baseWidth()));
            const bh = Math.max(1, Math.round(bw * Graphics.height / Graphics.width));
            const ss = this.superSample();
            const bmp = new Bitmap(bw * ss, bh * ss);
            bmp.smooth = false;               // nearest on the way up: no blur
            bmp.fontFace = this.font();
            bmp.fontSize = 8;
            bmp.outlineWidth = 0;             // shadows are drawn by hand, 1px hard
            if (ss > 1) {
                // The context does the multiplication, so every draw call stays
                // in virtual pixels. Bitmap#clear works from the canvas size and
                // so clears a superset of the field under this transform, which
                // is harmless; blts are kept nearest to match the type.
                const ctx = bmp.context;
                ctx.setTransform(ss, 0, 0, ss, 0, 0);
                ctx.imageSmoothingEnabled = false;
            }
            const sprite = new Sprite(bmp);
            sprite.scale.set(Graphics.width / (bw * ss), Graphics.height / (bh * ss));
            return { sprite: sprite, bitmap: bmp, w: bw, h: bh, ss: ss };
        },

        //-----------------------------------------------------------------
        // Primitives
        //-----------------------------------------------------------------
        _flush(bmp) {
            if (bmp._baseTexture && bmp._baseTexture.update) bmp._baseTexture.update();
        },

        // 2x2 checkerboard fill. Cached as a canvas pattern per colour, because
        // a per-pixel loop over a HUD panel every frame is not affordable.
        _pattern(color) {
            this._patterns = this._patterns || {};
            if (this._patterns[color]) return this._patterns[color];
            const cv = document.createElement('canvas');
            cv.width = cv.height = 2;
            const c = cv.getContext('2d');
            c.fillStyle = color;
            c.fillRect(0, 0, 1, 1);
            c.fillRect(1, 1, 1, 1);
            this._patterns[color] = cv;
            return cv;
        },

        dither(bmp, x, y, w, h, color) {
            const ctx = bmp.context;
            const pat = ctx.createPattern(this._pattern(color || this.PAL.panelLo), 'repeat');
            if (!pat) return;
            ctx.save();
            ctx.fillStyle = pat;
            ctx.fillRect(x, y, w, h);
            ctx.restore();
            this._flush(bmp);
        },

        // Bevelled box: one bright pixel top/left, one dark pixel bottom/right.
        // Opaque unless the caller asks for the checker back: see the note in
        // the header about 8px type over a lit 3D scene.
        panel(bmp, x, y, w, h, opts) {
            const o = opts || {};
            bmp.fillRect(x, y, w, h, o.fill || this.PAL.panel);
            if (o.dither === true) this.dither(bmp, x, y, w, h, o.ditherColor || this.PAL.panelLo);
            const hi = o.hi || this.PAL.edgeHi;
            const lo = o.lo || this.PAL.edgeLo;
            bmp.fillRect(x, y, w, 1, hi);
            bmp.fillRect(x, y, 1, h, hi);
            bmp.fillRect(x, y + h - 1, w, 1, lo);
            bmp.fillRect(x + w - 1, y, 1, h, lo);
            if (o.accent) bmp.fillRect(x, y + h - 1, w, 1, o.accent);
        },

        // Pixel text. `size` is a virtual-pixel height; 8 and 16 stay on grid.
        text(bmp, str, x, y, w, align, color, size, opts) {
            const o = opts || {};
            const fs = size || 8;
            bmp.fontFace = this.FONT;
            bmp.fontSize = fs;
            bmp.outlineWidth = 0;
            const lh = o.lineHeight || Math.round(fs * 1.5);
            const s = o.raw ? String(str) : String(str).toUpperCase();
            // drawText hands centring and right alignment to the canvas, which
            // places glyphs at subpixel precision and antialiases the lot. A
            // bitmap face has no business being sampled off the grid, so the
            // alignment is resolved here on whole pixels and the string is
            // always drawn left aligned. The width left of the box is passed on
            // as the clamp, so anything genuinely too long still condenses the
            // way it used to instead of running out of its panel.
            const a = align || 'left';
            const span = w || 0;
            let tx = x;
            if (a !== 'left' && span > 0) {
                const tw = bmp.measureTextWidth(s);
                tx = x + Math.round(a === 'center' ? (span - tw) / 2 : span - tw);
                if (tx < x) tx = x;
            }
            const avail = span > 0 ? Math.max(1, span - (tx - x)) : 0xffffffff;
            if (o.shadow !== false) {
                bmp.textColor = o.shadowColor || this.PAL.shadow;
                bmp.drawText(s, tx + 1, y + 1, avail, lh, 'left');
            }
            bmp.textColor = color || this.PAL.ink;
            bmp.drawText(s, tx, y, avail, lh, 'left');
        },

        // Segmented horizontal gauge. PSX bars were blocks, not smooth fills.
        bar(bmp, x, y, w, h, value, opts) {
            const o = opts || {};
            const seg = o.seg || 3, gap = o.gap || 1;
            const n = Math.max(1, Math.floor((w - 2) / (seg + gap)));
            const v = Math.max(0, Math.min(1, value));
            const filled = Math.round(v * n);
            bmp.fillRect(x, y, w, h, o.back || '#050a12');
            for (let i = 0; i < n; i++) {
                const t = n > 1 ? i / (n - 1) : 0;
                const on = i < filled;
                const col = on
                    ? (o.colorAt ? o.colorAt(t) : (o.color || this.PAL.cyan))
                    : (o.empty || '#16223a');
                bmp.fillRect(x + 1 + i * (seg + gap), y + 1, seg, h - 2, col);
            }
            if (o.zone) {
                // Marks the working band on top of the segments.
                const zx = x + 1 + Math.round((w - 2) * o.zone[0]);
                const zw = Math.max(1, Math.round((w - 2) * (o.zone[1] - o.zone[0])));
                bmp.fillRect(zx, y, zw, 1, o.zoneColor || this.PAL.green);
                bmp.fillRect(zx, y + h - 1, zw, 1, o.zoneColor || this.PAL.green);
            }
            bmp.fillRect(x, y, w, 1, this.PAL.edgeLo);
            bmp.fillRect(x, y + h - 1, w, 1, this.PAL.edgeLo);
            if (o.needle != null) {
                const nx = x + 1 + Math.round((w - 3) * Math.max(0, Math.min(1, o.needle)));
                bmp.fillRect(nx, y - 1, 1, h + 2, o.needleColor || this.PAL.ink);
            }
        },

        // Segmented vertical gauge, filled from the bottom. `center` fills out
        // from the middle instead, for signed values like spin or hook.
        vbar(bmp, x, y, w, h, value, opts) {
            const o = opts || {};
            const seg = o.seg || 3, gap = o.gap || 1;
            const n = Math.max(1, Math.floor((h - 2) / (seg + gap)));
            bmp.fillRect(x, y, w, h, o.back || '#050a12');
            const mid = Math.floor(n / 2);
            for (let i = 0; i < n; i++) {
                const idxFromBottom = n - 1 - i;
                const t = n > 1 ? idxFromBottom / (n - 1) : 0;
                let on;
                if (o.center) {
                    const v = Math.max(-1, Math.min(1, value));
                    const reach = Math.round(Math.abs(v) * mid);
                    on = v >= 0
                        ? (idxFromBottom > mid && idxFromBottom <= mid + reach)
                        : (idxFromBottom < mid && idxFromBottom >= mid - reach);
                    if (idxFromBottom === mid) on = true;
                } else {
                    on = idxFromBottom < Math.round(Math.max(0, Math.min(1, value)) * n);
                }
                const col = on
                    ? (o.colorAt ? o.colorAt(t) : (o.color || this.PAL.amber))
                    : (o.empty || '#16223a');
                bmp.fillRect(x + 1, y + 1 + i * (seg + gap), w - 2, seg, col);
            }
            if (o.mark != null) {
                const my = y + 1 + Math.round((h - 2) * (1 - Math.max(0, Math.min(1, o.mark))));
                bmp.fillRect(x - 1, my, w + 2, 1, o.markColor || this.PAL.green);
            }
            bmp.fillRect(x, y, 1, h, this.PAL.edgeLo);
            bmp.fillRect(x + w - 1, y, 1, h, this.PAL.edgeLo);
        },

        // Chunky targeting sight: four ticks around a hole, no curves.
        reticle(bmp, x, y, r, color, opts) {
            const o = opts || {};
            const c = color || this.PAL.ink;
            const t = o.thick || 1;
            const len = o.len || Math.max(2, Math.round(r * 0.7));
            bmp.fillRect(x - t, y - r - len, t * 2, len, c);
            bmp.fillRect(x - t, y + r, t * 2, len, c);
            bmp.fillRect(x - r - len, y - t, len, t * 2, c);
            bmp.fillRect(x + r, y - t, len, t * 2, c);
            if (o.dot) bmp.fillRect(x - t, y - t, t * 2, t * 2, o.dotColor || c);
        },

        //-----------------------------------------------------------------
        // Art deco theme: gold on black. See the header note.
        //-----------------------------------------------------------------
        DECO: {
            black:  '#08070b',   // the field a panel is lacquered with
            grain:  '#12101a',   // stippled over the field, barely there
            ink:    '#f6e8c4',   // body type
            dim:    '#c0a468',   // secondary type
            faint:  '#7d6836',   // disabled type
            gold:   '#e6c273',   // keylines, headers, accents
            goldHi: '#fff2c6',
            goldLo: '#8d6f2c',
            sel:    '#2a2010',   // selected-row plate
            selHi:  '#43331a',
            shadow: '#000000',
            red:    '#d9533d',
            green:  '#93d86e',
            jade:   '#5fc9a8',
            violet: '#c6a3ea'
        },

        // Solid black field, gold keyline, a broken inner hairline and stepped
        // corners. `title` turns the top strip into a gold header band.
        decoPanel(bmp, x, y, w, h, opts) {
            const o = opts || {};
            const D = this.DECO;
            const gold = o.accent || D.gold;
            const lo = o.accentLo || D.goldLo;
            bmp.fillRect(x, y, w, h, o.fill || D.black);
            if (o.grain !== false) this.dither(bmp, x, y, w, h, o.grainColor || D.grain);

            bmp.fillRect(x, y, w, 1, gold);
            bmp.fillRect(x, y + h - 1, w, 1, gold);
            bmp.fillRect(x, y, 1, h, gold);
            bmp.fillRect(x + w - 1, y, 1, h, gold);

            // Inner hairline, cut short of the corners so the steps read.
            const g = o.inset == null ? 3 : o.inset;
            if (o.hairline !== false && w > g * 2 + 14 && h > g * 2 + 14) {
                const bx = x + g, by = y + g, bw = w - g * 2, bh = h - g * 2;
                const cut = 5;
                bmp.fillRect(bx + cut, by, bw - cut * 2, 1, lo);
                bmp.fillRect(bx + cut, by + bh - 1, bw - cut * 2, 1, lo);
                bmp.fillRect(bx, by + cut, 1, bh - cut * 2, lo);
                bmp.fillRect(bx + bw - 1, by + cut, 1, bh - cut * 2, lo);
            }
            if (o.corners !== false) this.decoCorners(bmp, x, y, w, h, gold, o.step);
            if (o.title) this.decoHeader(bmp, x, y, w, o.title, o);
        },

        // Nested Ls stepping in from each corner: the deco ziggurat, at the one
        // scale a 240 line framebuffer can carry it.
        decoCorners(bmp, x, y, w, h, color, tiers) {
            const c = color || this.DECO.gold;
            const n = Math.max(1, tiers || 2);
            const corner = (cx, cy, sx, sy) => {
                for (let i = 0; i < n; i++) {
                    const d = 2 + i * 2;
                    const len = (n - i) * 3;
                    const hx = sx > 0 ? cx + d : cx - d - len + 1;
                    const hy = sy > 0 ? cy + d : cy - d;
                    const vx = sx > 0 ? cx + d : cx - d;
                    const vy = sy > 0 ? cy + d : cy - d - len + 1;
                    bmp.fillRect(hx, hy, len, 1, c);
                    bmp.fillRect(vx, vy, 1, len, c);
                }
            };
            corner(x, y, 1, 1);
            corner(x + w - 1, y, -1, 1);
            corner(x, y + h - 1, 1, -1);
            corner(x + w - 1, y + h - 1, -1, -1);
        },

        // A gold band with the lettering knocked out in black. This is the
        // single strongest readability move in the whole theme: a title never
        // competes with whatever is behind the panel.
        decoHeader(bmp, x, y, w, title, opts) {
            const o = opts || {};
            const D = this.DECO;
            const bh = o.headerH || 11;
            const gold = o.accent || D.gold;
            bmp.fillRect(x + 1, y + 1, w - 2, bh, gold);
            bmp.fillRect(x + 1, y + 1, w - 2, 1, o.headerHi || D.goldHi);
            bmp.fillRect(x + 1, y + bh, w - 2, 1, D.goldLo);
            const tc = o.titleColor || D.black;
            // drawText centres inside a 12px line box, so the top of the box
            // sits at y for the glyphs to land in the middle of an 11px band.
            // `dom` routes the knocked-out lettering to the HTML layer, the same
            // way a caller routes its own labels: a header is type too.
            const band = (str, align) => {
                if (o.dom) o.dom.text(str, x + 6, y, w - 12, align, tc, 8, { shadow: false });
                else this.text(bmp, str, x + 6, y, w - 12, align, tc, 8, { shadow: false });
            };
            band(title, o.titleAlign || 'left');
            if (o.titleRight) band(o.titleRight, 'right');
        },

        // Hairline broken by a centre lozenge.
        decoRule(bmp, x, y, w, color, opts) {
            const o = opts || {};
            const D = this.DECO;
            const c = color || D.goldLo;
            const mid = x + Math.floor(w / 2);
            const gap = o.gap == null ? 4 : o.gap;
            bmp.fillRect(x, y, Math.max(0, mid - x - gap), 1, c);
            bmp.fillRect(mid + gap, y, Math.max(0, x + w - mid - gap), 1, c);
            const d = o.diamond || D.gold;
            bmp.fillRect(mid - 1, y, 3, 1, d);
            bmp.fillRect(mid, y - 1, 1, 3, d);
        },

        // Selected row: a lit plate with a gold spine down its left edge.
        decoSelect(bmp, x, y, w, h, color) {
            const D = this.DECO;
            const c = color || D.gold;
            bmp.fillRect(x, y, w, h, D.sel);
            bmp.fillRect(x, y, w, 1, D.selHi);
            bmp.fillRect(x, y + h - 1, w, 1, D.selHi);
            bmp.fillRect(x, y, 2, h, c);
        },

        // The gauges, in deco colours: gold blocks in a black race.
        decoBar(bmp, x, y, w, h, value, opts) {
            const D = this.DECO;
            const o = Object.assign({
                color: D.gold, empty: '#1b160c', back: D.black, seg: 3, gap: 1
            }, opts || {});
            this.bar(bmp, x, y, w, h, value, o);
            bmp.fillRect(x, y, w, 1, D.goldLo);
            bmp.fillRect(x, y + h - 1, w, 1, D.goldLo);
        },

        decoVBar(bmp, x, y, w, h, value, opts) {
            const D = this.DECO;
            const o = Object.assign({
                color: D.gold, empty: '#1b160c', back: D.black, seg: 3, gap: 1
            }, opts || {});
            this.vbar(bmp, x, y, w, h, value, o);
        },

        // Corner fan. Straight rays out of a quarter circle, the motif every
        // deco lobby put over a doorway.
        decoSunburst(bmp, cx, cy, r, color, opts) {
            const o = opts || {};
            const c = color || this.DECO.goldLo;
            const rays = o.rays || 7;
            const from = o.from == null ? Math.PI : o.from;
            const span = o.span == null ? Math.PI / 2 : o.span;
            const inner = o.inner == null ? Math.round(r * 0.35) : o.inner;
            for (let i = 0; i < rays; i++) {
                const a = from + span * (i / (rays - 1 || 1));
                const dx = Math.cos(a), dy = Math.sin(a);
                for (let d = inner; d <= r; d++) {
                    if ((d + i) % 2 === 0 && o.dashed !== false) continue;
                    bmp.fillRect(Math.round(cx + dx * d), Math.round(cy + dy * d), 1, 1, c);
                }
            }
        },

        // Marching triangles for a dead margin: cheap deco filler.
        decoChevrons(bmp, x, y, count, color, opts) {
            const o = opts || {};
            const c = color || this.DECO.goldLo;
            const pitch = o.pitch || 6;
            const size = o.size || 3;
            for (let i = 0; i < count; i++) {
                const cx = x + i * pitch;
                for (let r = 0; r < size; r++) {
                    bmp.fillRect(cx + r, y + r, (size - r) * 2 - 1, 1, c);
                }
            }
        },

        //-----------------------------------------------------------------
        // Crisp HTML type
        //
        // Panels, keylines and gauges are the half of the look a 240 line
        // framebuffer does well: a one pixel keyline is exactly right there.
        // Type is the half it cannot do. An 8px face blown up three or four
        // times is a staircase, and at a fractional factor it is a smear, so
        // every label is a real DOM node over the canvas instead. It is laid
        // out in the SAME virtual pixels as the widget that owns it and
        // rasterised by the browser at the display's own resolution.
        //
        //   const board = PSXHud.domPanel(spriteOrLayer);
        //   board.begin();                                    // per repaint
        //   board.text('SCORE', x, y, w, 'left', col, 8);     // virtual units
        //   board.end();                                      // park the rest
        //   board.destroy();                                  // on terminate
        //
        // Positions come from the widget's worldTransform, so a handle follows
        // its sprite: move it, scale it or hide it and the type goes with it.
        //-----------------------------------------------------------------
        DOM_ID: 'psxhud-dom',

        _domRoot() {
            let root = document.getElementById(this.DOM_ID);
            if (!root) {
                root = document.createElement('div');
                root.id = this.DOM_ID;
                document.body.appendChild(root);
            }
            this._syncDomRoot(root);
            return root;
        },

        // Park the overlay exactly on top of the game canvas and let a CSS
        // transform carry the letterboxing, so children can be positioned in
        // plain game pixels (what worldTransform already speaks).
        _syncDomRoot(root) {
            const canvas = Graphics._canvas || document.getElementById('gameCanvas');
            if (!canvas || !canvas.getBoundingClientRect) return;
            const r = canvas.getBoundingClientRect();
            const s = r.width / (Graphics.width || 1);
            const geom = `${r.left}|${r.top}|${s}`;
            if (root.dataset.geom === geom) return;
            root.dataset.geom = geom;
            root.style.left = r.left + 'px';
            root.style.top = r.top + 'px';
            root.style.width = (Graphics.width || 1) + 'px';
            root.style.height = (Graphics.height || 1) + 'px';
            root.style.transform = 'scale(' + s + ')';
        },

        // `target` is either a Sprite or a layer() result; a layer's draw calls
        // are in virtual units under a supersample transform, so its factor is
        // folded in here and callers never have to know about it.
        domPanel(target, opts) {
            const o = opts || {};
            const hud = this;
            const root = this._domRoot();
            const box = document.createElement('div');
            box.className = 'psxhud-box';
            root.appendChild(box);
            return {
                sprite: (target && target.sprite) ? target.sprite : target,
                unit: (target && target.ss) || o.unit || 1,
                box: box,
                _nodes: [],
                _i: 0,
                _ox: 0, _oy: 0, _sx: 1, _sy: 1,

                begin() {
                    hud._syncDomRoot(root);
                    const sp = this.sprite;
                    const wt = sp && sp.worldTransform;
                    const shown = !!(sp && sp.worldVisible !== false && wt);
                    this.box.style.display = shown ? 'block' : 'none';
                    if (shown) {
                        this._ox = wt.tx;
                        this._oy = wt.ty;
                        this._sx = wt.a * this.unit;
                        this._sy = wt.d * this.unit;
                    }
                    this._i = 0;
                    return shown;
                },

                // A widget usually repaints on a change, not every frame, so it
                // can be painted before it is parented (worldTransform still
                // identity) or move afterwards. sync() re-reads the transform
                // and, only when it actually moved, lays the existing labels out
                // again from the virtual coordinates they were given.
                sync() {
                    const sp = this.sprite;
                    const wt = sp && sp.worldTransform;
                    if (!wt) return;
                    const shown = sp.worldVisible !== false;
                    this.box.style.display = shown ? 'block' : 'none';
                    if (!shown) return;
                    const sx = wt.a * this.unit, sy = wt.d * this.unit;
                    if (wt.tx === this._ox && wt.ty === this._oy &&
                        sx === this._sx && sy === this._sy) return;
                    hud._syncDomRoot(root);
                    this._ox = wt.tx;
                    this._oy = wt.ty;
                    this._sx = sx;
                    this._sy = sy;
                    for (const node of this._nodes) {
                        const g = node._psxGeom;
                        if (!g || node.style.display === 'none') continue;
                        node.style.left = (this._ox + g.x * sx) + 'px';
                        node.style.top = (this._oy + g.y * sy) + 'px';
                        node.style.width = (g.w > 0 ? g.w * sx : 0) + 'px';
                        node.style.fontSize = (g.fs * sy).toFixed(2) + 'px';
                        node.style.lineHeight = (g.lh * sy).toFixed(2) + 'px';
                        node.style.textShadow = g.shadow === false ? 'none'
                            : (() => {
                                const d = Math.max(1, Math.round(sx));
                                return d + 'px ' + d + 'px 0 ' + (g.shadowColor || hud.PAL.shadow);
                            })();
                    }
                },

                // Same argument order as PSXHud.text so a widget can be moved
                // over one call at a time.
                text(str, x, y, w, align, color, size, opts) {
                    const p = opts || {};
                    const fs = size || 8;
                    const lh = p.lineHeight || Math.round(fs * 1.5);
                    let node = this._nodes[this._i];
                    if (!node) {
                        node = document.createElement('div');
                        node.className = 'psxhud-text';
                        this.box.appendChild(node);
                        this._nodes[this._i] = node;
                    }
                    this._i++;
                    const s = String(str);
                    const shown = p.raw ? s : s.toUpperCase();
                    if (node._psxText !== shown) {
                        node._psxText = shown;
                        node.textContent = shown;
                    }
                    node._psxGeom = {
                        x: x, y: y, w: w, fs: fs, lh: lh,
                        shadow: p.shadow, shadowColor: p.shadowColor
                    };
                    const st = node.style;
                    st.display = 'block';
                    st.left = (this._ox + x * this._sx) + 'px';
                    st.top = (this._oy + y * this._sy) + 'px';
                    st.width = (w > 0 ? w * this._sx : 0) + 'px';
                    st.whiteSpace = 'nowrap';
                    st.overflow = 'hidden';
                    st.fontFamily = "'" + hud.font() + "', monospace";
                    st.fontSize = (fs * this._sy).toFixed(2) + 'px';
                    st.lineHeight = (lh * this._sy).toFixed(2) + 'px';
                    st.textAlign = align || 'left';
                    st.color = color || hud.PAL.ink;
                    st.letterSpacing = p.letterSpacing || '';
                    // The hard one pixel drop shadow of a framebuffer HUD, in
                    // whatever a virtual pixel currently measures.
                    const d = Math.max(1, Math.round(this._sx));
                    st.textShadow = p.shadow === false ? 'none'
                        : d + 'px ' + d + 'px 0 ' + (p.shadowColor || hud.PAL.shadow);
                    return node;
                },

                // Everything the repaint did not claim goes away.
                end() {
                    for (let i = this._i; i < this._nodes.length; i++) {
                        this._nodes[i].style.display = 'none';
                    }
                },

                clear() {
                    this._i = 0;
                    this.end();
                },

                destroy() {
                    if (this.box && this.box.parentNode) this.box.parentNode.removeChild(this.box);
                    this._nodes = [];
                    this.box = null;
                }
            };
        }
    };

    window.PSXHud = PSXHud;
})();
