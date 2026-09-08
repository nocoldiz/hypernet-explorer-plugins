//=============================================================================
// Weapon3DOverlay.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v2.0.0 The shared three.js overlay every weapon is drawn in
 * @author Assistant
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help Weapon3DOverlay.js
 *
 * The first-person weapon layer. Every weapon in the game is a 3D model:
 * either a GLB named by a <3DModel:> note tag, or (for all 532 of them) a
 * procedural model built by WeaponSystemProcedural.js and its Weapon3D_*
 * families. There is no 2D weapon path any more, and no picture folder
 * behind one.
 *
 * Contents:
 * - WeaponThreeScene  the one three.js renderer/scene/camera the overlay
 *   shares, drawn once a frame by Spriteset_Battle (WeaponSystem.js)
 * - disposeWeaponObject3D  frees a model's GPU buffers on swap or teardown
 * - Sprite_3DWeapon  one held weapon: builds or loads its model, poses it
 *   from js/db/Sprites/MovementKeyFrame3d.json, and animates it
 *
 * A weapon is never cut into or out of frame: it slides in from off the left
 * edge when it is first raised, and fades out when the battle ends
 * (Sprite_3DWeapon#beginExit, driven by Spriteset_Battle.fadeOutWeaponModels).
 *
 * Must be loaded BEFORE WeaponSystem.js.
 *
 * ============================================================================
 * Terms of Use
 * ============================================================================
 *
 * Free for commercial and non-commercial use.
 */

(() => {
  "use strict";

  // Where the overlay puts a weapon on screen, in game pixels. One world unit
  // in the overlay is one game pixel, so these are the same numbers the 2D
  // layer used to place its sprites at.
  const getResolutionScale = () => {
    if ($gameSystem && $gameSystem.getCurrentResolution) {
      const resolution = $gameSystem.getCurrentResolution();
      return resolution === "16:9" ? { x: 1.568, y: 1.154 } : { x: 1, y: 1 };
    }
    return { x: 1, y: 1 };
  };

  const getScaledWeaponX = (isLeftHand = false) => {
    const scale = getResolutionScale();
    if (isLeftHand) {
      return Math.round(200 * scale.x);
    }
    // Right-hand weapon sits on the right side of the screen, behind the
    // battle command menu (command overlay is z-index 350, weapon canvas is 10).
    const weaponSpriteX = 660;
    return Math.round(weaponSpriteX * scale.x);
  };

  const getScaledWeaponY = () => {
    const scale = getResolutionScale();
    const weaponSpriteY = 450;
    return Math.round(weaponSpriteY * scale.y);
  };

  // How a held weapon comes into frame and how it leaves it. A weapon is
  // raised into view from off the left edge rather than appearing on the spot,
  // and when the battle ends it fades out instead of being cut mid-frame.
  const ENTRY_DURATION_MS = 340;
  const EXIT_DURATION_MS = 320;
  // How far past the left edge of the screen the entry starts, in game pixels,
  // so even a long weapon is fully out of frame before it slides in.
  const ENTRY_MARGIN_PX = 320;
  // Fraction of the entry slide the weapon drifts back over while fading out.
  const EXIT_DRIFT = 0.18;
  //=============================================================================
  // WeaponThreeScene - Shared Three.js overlay for 3D weapon rendering
  //=============================================================================
  const WeaponThreeScene = {
    renderer: null,
    scene: null,
    camera: null,
    canvas: null,
    _refCount: 0,
    _bufW: 0,
    _bufH: 0,
    // The size the camera works in (game pixels). The drawing buffer above is
    // that times the retro downsample, so the two move independently.
    _viewW: 0,
    _viewH: 0,
    _rectKey: '',
    _alignCountdown: 0,
    // Alive but not presenting: no weapon is held, the context is kept anyway.
    _idle: false,

    // The overlay draws at the game's internal resolution and is then
    // CSS-stretched over the game canvas. That keeps the cost fixed no matter
    // how large the window is (a maximized 4K window used to cost ~13x a
    // 816x624 one) and makes one world unit exactly one game pixel, which is
    // the space _worldX/_worldY and every weapon offset are expressed in.
    _gameSize() {
      const w = (typeof Graphics !== 'undefined' && Graphics.width) ? Graphics.width : 816;
      const h = (typeof Graphics !== 'undefined' && Graphics.height) ? Graphics.height : 624;
      return { w, h };
    },

    // The retro downsample, folded into the size of the drawing buffer rather
    // than run as a pass of its own. PSXShader.render reaches the same picture
    // by drawing the scene into a low-res render target and blitting it back up
    // over a full-size canvas, which costs a whole extra full-screen pass and a
    // render target per context. The vertex snap and the colour banding live in
    // the patched materials (applyToObject), not in that pass, so rendering
    // straight into a smaller canvas and letting the browser scale it back up
    // with nearest sampling is the same picture, one pass cheaper. This is what
    // the battle scene already does (3DBattlerSystem.js, battleRenderScale).
    _renderScale() {
      // 'weapon': the gun or blade covers a few dozen pixels of the screen, so
      // the pixel-art look renders it finer than the scene behind it or it is
      // mush rather than a sprite. SnapVertex answers the same number for both.
      const retro = window.RetroShader ? window.RetroShader.active() : window.PSXShader;
      if (retro && retro.enabled) {
        const down = retro.downscaleFor ? retro.downscaleFor('weapon') : retro.downscale;
        if (down > 0 && down < 0.999) return Math.max(0.1, Math.min(1, down));
      }
      return 1;
    },

    init() {
      if (this.renderer) return;
      this._idle = false;
      const { w, h } = this._gameSize();

      this.canvas = document.createElement('canvas');
      this.canvas.id = 'weapon3DOverlay';
      this.canvas.width  = w;
      this.canvas.height = h;
      this.canvas.style.position      = 'absolute';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.zIndex        = '10';
      this.canvas.style.left          = '0px';
      this.canvas.style.top           = '0px';
      // The buffer is rendered at the retro downsample and the element is
      // stretched back over the game canvas, so the upscale has to be nearest
      // or the browser sands the pixels the PSX pass just quantised.
      this.canvas.style.imageRendering = 'pixelated';
      document.body.appendChild(this.canvas);

      // No MSAA: the buffer is rendered at the retro downsample and scaled
      // back up with nearest sampling anyway, so antialiasing only paid for
      // samples that get quantised away.
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: false,
        stencil: false,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 0);
      // Left at zero on purpose: _alignCanvas() below sizes the buffer for the
      // current downsample and the camera for the game resolution, so the two
      // are only stated in one place.
      this._bufW = 0;
      this._bufH = 0;
      this._viewW = 0;
      this._viewH = 0;

      this.camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 1, 4000);
      this.camera.position.set(0, 0, 2000);

      this.scene = new THREE.Scene();
      this._buildLights();

      this._alignCanvas();
      this._resizeObserver = new ResizeObserver(() => this._alignCanvas());
      this._resizeObserver.observe(document.body);
    },

    // The weapon in your hands is standing in the same weather as everything
    // else on screen, so it borrows the battle scene's day/night rig rather
    // than keeping its own fixed white lights: a blade at dusk catches the
    // orange low sun, and at night reflects a cold sky instead of a studio.
    // Shadows are off here (nothing for a first person weapon to cast onto)
    // but the sky reflection is very much on, since a reflection is most of
    // what makes a metal weapon read as metal.
    //
    // The overlay works in game pixels, so the light is parked far enough out
    // to behave as directional at that scale. Falls back to the old fixed
    // lights if the day/night rig is switched off or has not loaded.
    _buildLights() {
      if (this.lighting && typeof this.lighting.dispose === 'function') {
        this.lighting.dispose();
        this.lighting = null;
      }

      class WeaponOverlayLighting {
        constructor(scene, renderer) {
          this.scene = scene;
          this.renderer = renderer;
          this._lightKey = -1;
          this._envKey = -1;
          this._envRT = null;
          this._envFailed = false;

          // 1. Ambient & Hemisphere: rich base illumination so materials with high roughness/metalness don't crush to black
          this.amb = new THREE.AmbientLight(0xffffff, 0.85);
          scene.add(this.amb);

          this.hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 0.95);
          scene.add(this.hemi);

          // 2. Primary Key Light: Main viewmodel directional light shining from top-front-right towards the held weapon
          this.key = new THREE.DirectionalLight(0xffffff, 1.6);
          this.key.position.set(400, 700, 1000);
          this.key.target.position.set(250, -150, 0);
          scene.add(this.key);
          scene.add(this.key.target);

          // 3. Fill Light: Soft fill from front-left to light shadowed sides and cavities
          this.fill = new THREE.DirectionalLight(0xffffff, 0.8);
          this.fill.position.set(-500, 100, 800);
          this.fill.target.position.set(250, -150, 0);
          scene.add(this.fill);
          scene.add(this.fill.target);

          // 4. Front Eye Light: Gentle forward-facing light ensuring front faces/textures of the model receive direct illumination
          this.front = new THREE.DirectionalLight(0xffffff, 0.65);
          this.front.position.set(100, 0, 1200);
          this.front.target.position.set(250, -150, 0);
          scene.add(this.front);
          scene.add(this.front.target);

          // 5. Rim / Top-Edge Light: Glint light catching edges and metallic specular highlights
          this.rim = new THREE.DirectionalLight(0xffffff, 0.7);
          this.rim.position.set(600, 600, -300);
          this.rim.target.position.set(250, -150, 0);
          scene.add(this.rim);
          scene.add(this.rim.target);

          this.update(true);
        }

        update(force) {
          const tds = window.TimeDateSystem;
          let light = null;
          if (tds && tds.getDayNightLight) {
            try { light = tds.getDayNightLight(); } catch (e) { light = null; }
          }

          if (light) {
            if (force || light.key !== this._lightKey) {
              this._lightKey = light.key;
              this._applyDayNight(light);
            }
          } else {
            this._applyDefault();
          }
        }

        _applyDayNight(light) {
          const d = light.dir || { x: 0, y: 1, z: 0.5 };
          const skyCol = new THREE.Color(light.skyColor);
          const keyCol = new THREE.Color(light.keyColor);
          const gndCol = new THREE.Color(light.groundColor);

          // Key light
          this.key.color.copy(keyCol);
          this.key.intensity = Math.max(0.9, light.keyIntensity * 1.7);
          const kx = 300 + d.x * 250;
          const ky = 500 + Math.max(0.2, d.y) * 350;
          const kz = 800 + Math.max(0.3, d.z) * 400;
          this.key.position.set(kx, ky, kz);
          this.key.target.position.set(250, -150, 0);
          this.key.target.updateMatrixWorld();

          // Hemisphere & Ambient
          this.hemi.color.copy(skyCol);
          this.hemi.groundColor.copy(gndCol);
          this.hemi.intensity = Math.max(0.7, light.ambientIntensity * 1.3);

          this.amb.color.copy(skyCol);
          this.amb.intensity = Math.max(0.6, light.ambientIntensity * 0.9);

          // Fill light
          this.fill.color.copy(skyCol);
          this.fill.intensity = Math.max(0.5, (0.4 + 0.3 * light.night) * 1.3);
          this.fill.target.updateMatrixWorld();

          // Front light
          this.front.color.copy(keyCol);
          this.front.intensity = Math.max(0.4, (light.keyIntensity * 0.4 + light.ambientIntensity * 0.4));
          this.front.target.updateMatrixWorld();

          // Rim light
          this.rim.color.copy(skyCol);
          this.rim.intensity = Math.max(0.4, 0.5 + 0.3 * (1 - light.night));
          this.rim.target.updateMatrixWorld();

          // Sky reflection probe
          const B = window.Battler3D;
          if (B && B.dayNightEnabled && B.dayNightEnabled() && this.renderer) {
            this._refreshEnv(light);
          }
        }

        _refreshEnv(light) {
          if (this._envFailed) return;
          const envKey = Math.round(light.hour * 4) * 8 + Math.round(light.night * 3);
          if (envKey === this._envKey) return;
          this._envKey = envKey;
          try {
            let store = this.renderer._b3dEnvCache;
            if (!store) store = this.renderer._b3dEnvCache = new Map();
            let rt = store.get(envKey);
            if (!rt) {
              let pmrem = this.renderer._b3dPmrem;
              if (!pmrem) {
                pmrem = this.renderer._b3dPmrem = new THREE.PMREMGenerator(this.renderer);
                pmrem.compileEquirectangularShader();
              }
              const B = window.Battler3D;
              if (B && B.buildSkyEquirect) {
                const src = B.buildSkyEquirect(light);
                rt = pmrem.fromEquirectangular(src);
                src.dispose();
                store.set(envKey, rt);
              }
            }
            if (rt) {
              this._envRT = rt;
              this.scene.environment = rt.texture;
            }
          } catch (e) {
            this._envFailed = true;
            this.scene.environment = null;
          }
        }

        _applyDefault() {
          this.amb.color.setHex(0xffffff);
          this.amb.intensity = 0.85;
          this.hemi.color.setHex(0xfff8ee);
          this.hemi.groundColor.setHex(0x555566);
          this.hemi.intensity = 0.95;
          this.key.color.setHex(0xfff6ea);
          this.key.intensity = 1.6;
          this.key.position.set(400, 700, 1000);
          this.fill.color.setHex(0xccddff);
          this.fill.intensity = 0.8;
          this.front.color.setHex(0xffffff);
          this.front.intensity = 0.65;
          this.rim.color.setHex(0xffffff);
          this.rim.intensity = 0.7;
        }

        dispose() {
          const s = this.scene;
          if (!s) return;
          if (this.amb) s.remove(this.amb);
          if (this.hemi) s.remove(this.hemi);
          if (this.key) { s.remove(this.key); s.remove(this.key.target); }
          if (this.fill) { s.remove(this.fill); s.remove(this.fill.target); }
          if (this.front) { s.remove(this.front); s.remove(this.front.target); }
          if (this.rim) { s.remove(this.rim); s.remove(this.rim.target); }
        }
      }

      this.lighting = new WeaponOverlayLighting(this.scene, this.renderer);
    },

    // Keeps the camera at game resolution, the drawing buffer at that times the
    // retro downsample, and the element parked on top of the game canvas. All
    // three halves are no-ops when nothing changed, so this is safe to call
    // from the resize observer and periodically from render().
    _alignCanvas() {
      if (!this.canvas) return;
      const { w, h } = this._gameSize();

      // The camera keeps working in game pixels whatever the buffer is doing:
      // one world unit is one game pixel, and every weapon offset, _worldX and
      // _worldY are written in that space.
      if (w !== this._viewW || h !== this._viewH) {
        this._viewW = w;
        this._viewH = h;
        if (this.camera) {
          this.camera.left   = -w / 2;
          this.camera.right  = w / 2;
          this.camera.top    = h / 2;
          this.camera.bottom = -h / 2;
          this.camera.updateProjectionMatrix();
        }
      }

      // The drawing buffer follows the retro downsample, which is a live
      // Options slider, so this is re-asked rather than fixed at init.
      const scale = this._renderScale();
      const bw = Math.max(1, Math.round(w * scale));
      const bh = Math.max(1, Math.round(h * scale));
      if (bw !== this._bufW || bh !== this._bufH) {
        this._bufW = bw;
        this._bufH = bh;
        if (this.renderer) this.renderer.setSize(bw, bh, false);
        else { this.canvas.width = bw; this.canvas.height = bh; }
      }

      const game = document.getElementById('gameCanvas');
      const r = game ? game.getBoundingClientRect() : null;
      const left   = r ? r.left   : 0;
      const top    = r ? r.top    : 0;
      const width  = r ? r.width  : window.innerWidth;
      const height = r ? r.height : window.innerHeight;
      const key = left + '|' + top + '|' + width + '|' + height;
      if (key === this._rectKey) return;
      this._rectKey = key;

      const s = this.canvas.style;
      s.left   = left + 'px';
      s.top    = top + 'px';
      s.width  = width + 'px';
      s.height = height + 'px';
    },

    ref() {
      if (!this.renderer) this.init();
      else if (this._idle) this._wake();
      this._refCount++;
    },

    // Letting go of the last weapon puts the overlay to sleep, it does NOT
    // hand the context back. Swapping the weapon in your hands terminates one
    // sprite and builds the next, and while the count sits at zero in between
    // a teardown here meant a whole WebGL context destroyed and rebuilt mid
    // battle: a fresh context, a fresh compile of every shader and a fresh
    // environment map for the day/night rig, plus one frame with the layer
    // gone from the compositor. That is the flicker every weapon switch used
    // to show. One context for the session, the same as the battler renderer.
    deref() {
      this._refCount--;
      if (this._refCount <= 0) {
        this._refCount = 0;
        this.idle();
      }
    },

    // Nothing is held: stop presenting the layer. The canvas keeps whatever
    // was last drawn into it, so the frame is cleared before it is hidden or
    // the last weapon would stay painted over the screen.
    idle() {
      if (!this.renderer || this._idle) return;
      this._idle = true;
      try {
        // The PSX pass can leave a render target bound; clear the canvas.
        this.renderer.setRenderTarget(null);
        this.renderer.clear();
      } catch (e) { /* context already gone */ }
      if (this.canvas) this.canvas.style.display = 'none';
    },

    _wake() {
      this._idle = false;
      if (this.canvas) this.canvas.style.display = 'block';
      // The element was out of the compositor while idle: re-place it.
      this._rectKey = '';
      this._alignCanvas();
    },

    render() {
      if (!this.renderer || !this.scene || !this.camera) return;
      // Asleep: nothing is held, and idle() already cleared the frame.
      if (this._idle) return;
      // Re-check the placement a few times a second rather than every frame:
      // getBoundingClientRect() forces a synchronous layout.
      if (--this._alignCountdown <= 0) {
        this._alignCountdown = 20;
        this._alignCanvas();
      }
      if (this.lighting) this.lighting.update();
      // Straight to the canvas: the downsample is already in the buffer size
      // (see _renderScale), so PSXShader.render's render target would only
      // repeat the same reduction and blit it back at the cost of a second
      // full-screen pass.
      this.renderer.render(this.scene, this.camera);
    },

    // A true teardown, kept for a caller that really wants the context gone
    // (nothing does today: deref() sleeps instead, see above).
    cleanup() {
      if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
      // Before the renderer goes: the rig owns a render target on this context.
      if (this.lighting) { this.lighting.dispose(); this.lighting = null; }
      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
      if (this.renderer) {
        // Frees the PSX downsample render target hung on this renderer.
        if (window.PSXShader && window.PSXShader.disposeContext) {
          window.PSXShader.disposeContext(this.renderer);
        }
        if (window.PixelArtShader && window.PixelArtShader.disposeContext) {
          window.PixelArtShader.disposeContext(this.renderer);
        }
        // dispose() leaves the WebGL context itself alive. The browser caps how
        // many contexts may live at once and force-loses the OLDEST past the
        // cap, which is the game's own canvas: PIXI then silently stops
        // rendering and the picture freezes until the game is restarted.
        this.renderer.dispose();
        try {
          if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
        } catch (e) { /* context already gone */ }
      }
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.canvas = null;
      this._refCount = 0;
      this._bufW = 0;
      this._bufH = 0;
      this._viewW = 0;
      this._viewH = 0;
      this._rectKey = '';
      this._idle = false;
    }
  };

  //=============================================================================
  // disposeWeaponObject3D - free GPU resources of a removed 3D weapon model
  //=============================================================================
  // Traverses a THREE object and disposes its geometries and materials so a
  // weapon regeneration/swap/terminate does not leak GPU buffers. Textures
  // flagged with _weaponSharedCache belong to the procedural texture cache and
  // are reused by other models, so they are left untouched; only textures the
  // model itself owns (e.g. GLB-loaded maps) are disposed.
  function disposeWeaponObject3D(root) {
    if (!root || typeof root.traverse !== 'function') return;

    const disposeMaterial = (mat) => {
      if (!mat) return;
      for (const key in mat) {
        const val = mat[key];
        if (val && val.isTexture && !val._weaponSharedCache && typeof val.dispose === 'function') {
          val.dispose();
        }
      }
      if (typeof mat.dispose === 'function') mat.dispose();
    };

    root.traverse((obj) => {
      if (obj.geometry && typeof obj.geometry.dispose === 'function') {
        obj.geometry.dispose();
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(disposeMaterial);
        } else {
          disposeMaterial(obj.material);
        }
      }
    });
  }

  //=============================================================================
  // WeaponTrail - the slash the weapon itself leaves as it swings
  //=============================================================================
  // Soul Calibur's trick, and it is not an effect played AT anything: the blade
  // is sampled where it actually is, every frame, and the ribbon is skinned
  // between those samples. The stroke is therefore the weapon's own path
  // through the scene, with all of the movement's arc, twist and follow
  // through in it, rather than a crescent drawn near the target and hoped to
  // match.
  //
  // Each sample is the pair of points the blade spans at that instant, its TIP
  // and its BASE, taken off the model's world matrix. Two consecutive samples
  // make a quad; the whole run of them is one strip. A sample fades out over
  // TRAIL_LIFE and is dropped, so the trail is always the last fifth of a
  // second of blade, following the weapon and dying behind it.
  //
  // The gradient across the strip is what sells it: white and opaque along the
  // cutting edge, coloured and thin toward the hilt.

  // The look is Bushido Blade's, not a fantasy game's: a katana there leaves a
  // thin, hard-edged, almost white sheet that is gone in a tenth of a second,
  // narrowing as it goes. No bloom, no colour wash, no glitter. What sells the
  // cut is that the streak is exactly where the steel was and then is not
  // there any more.
  const TRAIL_MAX_SAMPLES = 40;
  const TRAIL_LIFE = 80;
  // Below this much movement between frames the blade is not swinging and no
  // sample is taken, so an idle weapon leaves nothing behind. Kept small on
  // purpose: a swing starts slow, and a threshold that waits for the fast part
  // of it only starts drawing once the blow has already landed.
  const TRAIL_MIN_STEP = 0.4;
  // A fast blade can cross a third of the screen between two frames, which as
  // one straight chord reads as a folded ribbon. Anything longer than this is
  // filled in with intermediate samples.
  const TRAIL_MAX_STEP = 26;
  // How much of the weapon's length the strip spans, measured back from the
  // point. The trail is the tip's path through the air, not a sheet dragged
  // off the whole blade.
  const TRAIL_SPAN = 0.12;
  // How solid the streak is at its brightest. A sword trail that is opaque
  // white reads as a painted shape stuck to the screen. This is deliberately
  // low: the trail is meant to be noticed out of the corner of the eye and
  // then be gone, the way it is in Bushido Blade, not to be looked at.
  const TRAIL_ALPHA = 0.22;
  // How much of its width the strip keeps as it dies: a fading streak narrows
  // toward the edge it was cut with rather than dissolving in place.
  const TRAIL_NARROW = 0.85;

  /** A point a fraction of the way from `a` to `b`. */
  function lerpVec(a, b, t) {
    return new THREE.Vector3(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t);
  }

  class WeaponTrail {
    /**
     * @param {number} color - the hilt-side colour of the strip.
     * @param {number} core - the colour of its cutting edge.
     * @param {THREE.Vector3} [offset] - where this strip sits across the
     *        weapon, in the model's own space. A sword leaves one strip on its
     *        edge; a claw leaves one per talon, side by side.
     */
    constructor(color, core, offset) {
      this.color = new THREE.Color(color);
      this.core = new THREE.Color(core !== undefined ? core : 0xffffff);
      this.offset = offset || null;
      this.samples = [];
      this._live = false;
      this._buildMesh();
    }

    _buildMesh() {
      const verts = TRAIL_MAX_SAMPLES * 2;
      const quads = TRAIL_MAX_SAMPLES - 1;
      this.positions = new Float32Array(verts * 3);
      this.colors = new Float32Array(verts * 3);
      const idx = new Uint16Array(quads * 6);
      for (let i = 0; i < quads; i++) {
        const k = i * 2;
        const j = i * 6;
        idx[j] = k; idx[j + 1] = k + 1; idx[j + 2] = k + 2;
        idx[j + 3] = k + 1; idx[j + 4] = k + 3; idx[j + 5] = k + 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage !== undefined ? THREE.DynamicDrawUsage : undefined));
      geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.setDrawRange(0, 0);
      this.geometry = geo;
      // Additive, not normal: the strip carries its fade in the vertex
      // colours themselves, and under normal blending a faded vertex is an
      // opaque near-black one, which painted the swing as a black smear.
      // Added instead, a dim vertex adds almost nothing and a bright one
      // reads as the pale white flash of steel, or as the weapon's element.
      this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      }));
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 850;
      if (WeaponThreeScene.scene) WeaponThreeScene.scene.add(this.mesh);
    }

    /** Start leaving a trail. Old samples are dropped: this is a new stroke. */
    begin() {
      this.samples.length = 0;
      this._live = true;
    }

    /** Stop adding to it. What is already drawn still fades out behind. */
    end() {
      this._live = false;
    }

    /**
     * Take the blade where it is now. `tip` and `base` are in the model's own
     * space; the model's world matrix is what turns them into the two points
     * the ribbon spans this frame.
     */
    sample(model, tip, base, now) {
      if (!this._live || !model) return;
      model.updateMatrixWorld(true);
      const a = tip.clone();
      const b = base.clone();
      if (this.offset) { a.add(this.offset); b.add(this.offset); }
      a.applyMatrix4(model.matrixWorld);
      b.applyMatrix4(model.matrixWorld);
      const last = this.samples[this.samples.length - 1];
      // A weapon that is not moving is not cutting anything.
      if (last && last.tip.distanceTo(a) < TRAIL_MIN_STEP) return;
      // A jump too big to draw as one chord is walked in steps, so a fast
      // swing curves instead of folding.
      if (last) {
        const step = last.tip.distanceTo(a);
        const fill = Math.min(6, Math.floor(step / TRAIL_MAX_STEP));
        for (let i = 1; i <= fill; i++) {
          const t = i / (fill + 1);
          this._push(
            lerpVec(last.tip, a, t), lerpVec(last.base, b, t),
            last.born + (now - last.born) * t);
        }
      }
      this._push(a, b, now);
    }

    _push(tip, base, born) {
      this.samples.push({ tip, base, born });
      if (this.samples.length > TRAIL_MAX_SAMPLES) this.samples.shift();
    }

    /**
     * Rewrite the strip from the samples that are still alive.
     * @returns {boolean} whether anything is left to draw.
     */
    update(now) {
      while (this.samples.length && now - this.samples[0].born > TRAIL_LIFE) {
        this.samples.shift();
      }
      const n = this.samples.length;
      if (n < 2) {
        this.geometry.setDrawRange(0, 0);
        return this._live || n > 0;
      }
      for (let i = 0; i < n; i++) {
        const s = this.samples[i];
        const o = i * 6;
        const age = Math.max(0, Math.min(1, (now - s.born) / TRAIL_LIFE));
        // The streak narrows toward the edge as it dies: the trailing vertex
        // is pulled in toward the tip rather than the whole sheet fading flat.
        const pull = age * TRAIL_NARROW;
        this.positions[o]     = s.tip.x;
        this.positions[o + 1] = s.tip.y;
        this.positions[o + 2] = s.tip.z;
        this.positions[o + 3] = s.base.x + (s.tip.x - s.base.x) * pull;
        this.positions[o + 4] = s.base.y + (s.tip.y - s.base.y) * pull;
        this.positions[o + 5] = s.base.z + (s.tip.z - s.base.z) * pull;
        // Held near full and then dropped, rather than dimmed all the way
        // down: a hard-edged streak that vanishes, not a glow that decays.
        // Fades from the first frame rather than holding: a faint streak that
        // holds its brightness reads as a smear following the weapon.
        const alpha = (1 - age) * (1 - age * 0.4) * TRAIL_ALPHA;
        this.colors[o]     = this.core.r * alpha;
        this.colors[o + 1] = this.core.g * alpha;
        this.colors[o + 2] = this.core.b * alpha;
        this.colors[o + 3] = this.color.r * alpha * 0.6;
        this.colors[o + 4] = this.color.g * alpha * 0.6;
        this.colors[o + 5] = this.color.b * alpha * 0.6;
      }
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.setDrawRange(0, (n - 1) * 6);
      return true;
    }

    /** Whether anything of this trail is on screen. */
    active() {
      return this._live || this.samples.length > 0;
    }

    dispose() {
      if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
      this.geometry.dispose();
      this.mesh.material.dispose();
      this.samples.length = 0;
      this._live = false;
    }
  }

  /**
   * How far apart the strips of a multi-edged weapon sit, as a vector across
   * the blade in the model's own space. Perpendicular to the weapon's length,
   * and a quarter of that length between neighbours, which is about what the
   * gap between talons looks like at battle scale.
   */
  function talonSpacing(span, count) {
    if (count < 2) return null;
    const length = span.tip.clone().sub(span.base);
    const across = new THREE.Vector3(0, 0, 1).cross(length);
    if (across.lengthSq() < 0.0001) across.set(1, 0, 0);
    return across.normalize().multiplyScalar(length.length() * 0.25);
  }

  /**
   * Where the cutting end of a model is, in the model's own space.
   *
   * Every procedural weapon in the game is built to one convention
   * (WeaponSystemProcedural): it runs along +Y with the grip BELOW the origin,
   * width on X and thickness on Z. So the tip is the top of the model and
   * nothing has to be guessed. A GLB brings its own axes, so for those the
   * longest side of the box is taken as the length and the end furthest from
   * the origin as the point, the origin being where a weapon is held.
   *
   * The span runs from the point back down the edge by TRAIL_SPAN of the
   * weapon's length: the streak is the tip's path, not the whole blade's.
   *
   * @param {THREE.Object3D} model
   * @param {boolean} procedural - built here rather than loaded from a GLB.
   * @returns {{tip:THREE.Vector3, base:THREE.Vector3}|null}
   */
  function bladeSpanOf(model, procedural) {
    if (!model) return null;
    // Measured with the model's own transform lifted off, so the box is in the
    // space the samples are taken in. It is added straight to the scene, so
    // there is no parent transform to undo as well.
    const pos = model.position.clone();
    const rot = model.rotation.clone();
    const scl = model.scale.clone();
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.copy(pos);
    model.rotation.copy(rot);
    model.scale.copy(scl);
    model.updateMatrixWorld(true);
    if (box.isEmpty()) return null;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    let axis = "y";
    let sign = 1;
    if (!procedural) {
      axis = size.x > size.y && size.x > size.z ? "x" : (size.y > size.z ? "y" : "z");
      sign = Math.abs(box.max[axis]) >= Math.abs(box.min[axis]) ? 1 : -1;
    }
    const tip = center.clone();
    const base = center.clone();
    tip[axis] = sign > 0 ? box.max[axis] : box.min[axis];
    base[axis] = tip[axis] - size[axis] * TRAIL_SPAN * sign;
    return { tip, base };
  }

  //=============================================================================
  // Sprite_3DWeapon - 3D GLB model weapon renderer
  //=============================================================================
  class Sprite_3DWeapon {
    constructor(weapon, screenX, screenY) {
      this._weapon = weapon;
      this._model = null;
      this._mixer = null;
      this._animData = null;
      this._animElapsed = 0;
      this._baseRotation = weapon.model3dRotation || { x: 0, y: 0, z: 0 };
      this._screenX = screenX !== undefined ? screenX : getScaledWeaponX();
      this._screenY = screenY !== undefined ? screenY : getScaledWeaponY();
      this._lastTime = performance.now();
      this._visible = false;
      this._pendingAnimation = null;
      this._trails = null;
      this._bladeSpan = null;
      this._trailTimer = null;
      // Entry slide / exit fade state. The weapon starts fully off the left
      // edge, so the very first pose it is built at is already out of frame.
      this._entryElapsed = 0;
      this._entryDone = false;
      this._exiting = false;
      this._exitElapsed = 0;
      this._transitionDX = this._entrySlideX();
      this._fadeActive = false;
      WeaponThreeScene.ref();
      this._loadModel();
      this._ensureKeyframes();
    }

    // Every pose the weapon takes (idle sway, attack keyframes, the loaded
    // rest pose) is placed through _worldX, so folding the transition offset in
    // here moves the weapon without any of them having to know about it.
    _worldX(sx) {
      return sx - (Graphics.width || 816) / 2 + (this._transitionDX || 0);
    }

    _worldY(sy) {
      return -( sy - (Graphics.height || 624) / 2 );
    }

    _loadModel() {
      if (!window.THREE || !THREE.GLTFLoader) return;
      const loader = new THREE.GLTFLoader();
      loader.load(
        `models/${this._weapon.model3d}`,
        (gltf) => {
          this._model = gltf.scene;
          const s = this._weapon.model3dScale || 1.0;
          this._model.scale.set(s, s, s);
          const r = this._baseRotation;
          this._model.rotation.set(
            THREE.MathUtils.degToRad(r.x),
            THREE.MathUtils.degToRad(r.y),
            THREE.MathUtils.degToRad(r.z)
          );
          this._model.position.set(this._worldX(this._screenX), this._worldY(this._screenY), 0);
          this._model.visible = false;
          WeaponThreeScene.scene.add(this._model);

          if (gltf.animations && gltf.animations.length > 0) {
            this._mixer = new THREE.AnimationMixer(this._model);
            this._clips = {};
            gltf.animations.forEach(clip => {
              this._clips[clip.name] = this._mixer.clipAction(clip);
            });
          }

          if (this._pendingAnimation != null) {
            const pending = this._pendingAnimation;
            this._pendingAnimation = null;
            this.playAnimation(pending);
          }
        },
        undefined,
        (err) => console.error('[Sprite_3DWeapon] Failed to load model:', this._weapon.model3d, err)
      );
    }

    _ensureKeyframes() {
      if (!window._weaponKeyframes3d) {
        fetch('js/db/Sprites/MovementKeyFrame3d.json')
          .then(r => r.json())
          .then(data => {
            window._weaponKeyframes3d = data;
            if (this._pendingAnimation != null && this._model) {
              this.playAnimation(this._pendingAnimation);
              this._pendingAnimation = null;
            }
          })
          .catch(e => console.error('[Sprite_3DWeapon] Failed to load MovementKeyFrame3d.json', e));
      }
    }

    setPosition(sx, sy) {
      this._screenX = sx;
      this._screenY = sy;
      if (this._model) {
        this._model.position.set(this._worldX(sx), this._worldY(sy), 0);
      }
    }

    playClip(clipName) {
      if (!this._mixer || !this._clips) return;
      this._mixer.stopAllAction();
      const action = this._clips[clipName];
      if (action) {
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        this._model.visible = true;
        this._visible = true;
      }
    }

    playReload() {
      // An authored GLB clip wins, as everywhere else. Everything the game
      // actually holds is procedural and has no clips at all, so the reload
      // goes through the ordinary animation path (WeaponSystemProcedural
      // builds MOTIONS.reload and works the magazine on the same clock);
      // calling playClip on a model with no mixer used to do nothing at all,
      // which is why no procedural gun ever reloaded on screen. Sent even
      // while the model is still loading: playAnimation keeps it pending.
      if (this._clips && this._clips['Reload']) {
        this.playClip('Reload');
        return;
      }
      this.playAnimation('Reload');
    }

    playAnimation(name) {
      this._animElapsed = 0;
      this._animData = null;

      if (!this._model) {
        // '' rather than null: no name means "this weapon's own motion",
        // which is a real request and must survive the wait for the model.
        this._pendingAnimation = name || '';
        return;
      }

      this._model.visible = true;
      this._visible = true;
      this.beginTrail();

      if ([7, 9].includes(this._weapon.wtypeId) && this._clips && this._clips['Shoot']) {
        this.playClip('Shoot');
        return;
      }

      const kf = window._weaponKeyframes3d;
      if (kf && kf[name]) {
        this._animData = kf[name];
        return;
      }

      if (kf) {
        this._animData = kf[name] || kf['Swing'] || null;
      } else {
        // '' rather than null: no name means "this weapon's own motion",
        // which is a real request and must survive the wait for the model.
        this._pendingAnimation = name || '';
      }
    }

    /**
     * Where in the clip the blade is actually striking and which way it is
     * travelling when it does: the fastest segment of the movement it is
     * playing. WeaponHitFX uses it to land the effect on the beat of the swing
     * and to lay the trail along the line the weapon swept.
     * @returns {{delay:number, angle:number}|null}
     */
    strikeInfo() {
      const data = this._animData;
      const frames = data && data.frames;
      if (!frames || frames.length < 2) return null;
      let best = null;
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1];
        const b = frames[i];
        const dt = Math.max(0.001, (b.t || 0) - (a.t || 0));
        const dx = (b.x || 0) - (a.x || 0);
        const dy = (b.y || 0) - (a.y || 0);
        const speed = Math.sqrt(dx * dx + dy * dy) / dt;
        if (!best || speed > best.speed) best = { speed, dx, dy, t: b.t || 0 };
      }
      if (!best || best.speed <= 0) return null;
      const duration = (data.duration || 500);
      const elapsed = this._animElapsed || 0;
      return {
        // The blow lands as the fast segment ends, less whatever of the clip
        // has already played by the time this is asked.
        delay: Math.max(0, duration * best.t - elapsed),
        angle: Math.atan2(best.dy, best.dx)
      };
    }

    /**
     * Leave a trail for as long as this swing lasts. Only weapons that are
     * swung leave one: a gun going off has no blade to sweep, and its shot is
     * drawn at the target instead. Unarmed attacks and fists never leave a trail.
     */
    beginTrail() {
      const FX = window.WeaponHitFX;
      if (!FX || !FX.isEnabled() || !window.THREE) return;
      if (!this._weapon) return;
      if (this._weapon.wtypeId === 11 || this._weapon.unarmedArchetype) return;
      if (typeof FX.hasTrail === 'function' && !FX.hasTrail(this._weapon)) return;
      if (!FX.swings(this._weapon)) return;
      const profile = FX.profileFor(this._weapon);
      if (profile.trails === 0 || profile.trail === false || profile.shape === 'starburst') return;
      if (!this._trails) {
        const look = FX.lookFor(this._weapon);
        const color = (look && look.color) || profile.color;
        // A plain weapon flashes white along its edge. An elemental one keeps
        // that flash but pulls it toward its own element, so a fire sword
        // sweeps warm and an ice one cold rather than both sweeping white.
        let core = (look && look.core) || profile.core || 0xffffff;
        if (look && look.color !== undefined) {
          core = new THREE.Color(core).lerp(new THREE.Color(look.color), 0.4).getHex();
        }
        // How many strips this weapon leaves. One per cutting edge: a sword
        // has one, a pair of claws rakes three lines at once, and the spacing
        // between them is a fraction of the blade's own length.
        const count = Math.max(1, profile.trails || 1);
        const span = this._bladeSpan ||
          (this._bladeSpan = bladeSpanOf(this._model, !this._weapon.model3d));
        const across = span ? talonSpacing(span, count) : null;
        this._trails = [];
        for (let i = 0; i < count; i++) {
          const offset = across
            ? across.clone().multiplyScalar(i - (count - 1) / 2)
            : null;
          this._trails.push(new WeaponTrail(color, core, offset));
        }
      }
      this._trails.forEach(t => t.begin());
      // The stroke runs for as long as the movement does, and no longer.
      const duration = (this._animData && this._animData.duration) || 500;
      if (this._trailTimer) clearTimeout(this._trailTimer);
      this._trailTimer = setTimeout(() => {
        this._trailTimer = null;
        if (this._trails) this._trails.forEach(t => t.end());
      }, duration);
    }

    /** Feed every strip this frame's blade position and let them fade. */
    _updateTrail(now) {
      if (!this._trails) return;
      if (!this._bladeSpan) {
        this._bladeSpan = bladeSpanOf(this._model, !this._weapon.model3d);
      }
      let alive = false;
      this._trails.forEach(t => {
        if (this._bladeSpan) {
          t.sample(this._model, this._bladeSpan.tip, this._bladeSpan.base, now);
        }
        t.update(now);
        if (t.active()) alive = true;
      });
      if (!alive) {
        this._trails.forEach(t => t.dispose());
        this._trails = null;
      }
    }

    /** Whether this weapon still has a stroke on screen. */
    trailActive() {
      return !!(this._trails && this._trails.some(t => t.active()));
    }

    /** How far past the right edge of the screen the entry starts for a
     *  right-side weapon, or past the left edge for a left-hand one. */
    _entrySlideX() {
      const screenW = Graphics.width || 816;
      const isRight = this._screenX > screenW / 2;
      // Positive DX = further right in world space; the weapon slides left into
      // its anchor. Negative DX = further left; the left hand slides right.
      return isRight ? ENTRY_MARGIN_PX : -(this._screenX + ENTRY_MARGIN_PX);
    }

    /** Fade the weapon out of frame rather than cutting it (battle over). */
    beginExit() {
      if (this._exiting) return;
      this._exiting = true;
      this._exitElapsed = 0;
      this._entryDone = true;
    }

    /**
     * Advances the entry slide or the exit fade. Only writes _transitionDX and
     * the material opacity, so it must run BEFORE the frame's pose is applied.
     */
    _updateTransition(deltaMs) {
      if (!this._model) return;

      if (this._exiting) {
        this._exitElapsed += deltaMs;
        const t = Math.min(this._exitElapsed / EXIT_DURATION_MS, 1);
        // Drifts back the way it came as it goes, accelerating out of frame.
        this._transitionDX = this._entrySlideX() * EXIT_DRIFT * t * t;
        this._applyFade(1 - t);
        if (t >= 1) {
          this._model.visible = false;
          this._visible = false;
        }
        return;
      }

      if (this._entryDone) {
        this._transitionDX = 0;
        this._applyFade(1);
        return;
      }

      this._entryElapsed += deltaMs;
      const t = Math.min(this._entryElapsed / ENTRY_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this._transitionDX = this._entrySlideX() * (1 - eased);
      // Opacity leads the slide so the weapon is solid well before it settles.
      this._applyFade(Math.min(t * 2, 1));
      if (t >= 1) this._entryDone = true;
    }

    /**
     * Uniform opacity over the whole model. Each material's rest state is saved
     * the first time it is touched and put back the moment the fade is over, so
     * an opaque weapon never stays in the transparent pass.
     */
    _applyFade(alpha) {
      if (alpha >= 1) {
        if (!this._fadeActive) return;
        this._fadeRest.forEach((rest, mat) => {
          mat.opacity = rest.opacity;
          mat.transparent = rest.transparent;
        });
        this._fadeActive = false;
        return;
      }
      if (!this._fadeActive) {
        this._fadeRest = new Map();
        this._model.traverse((o) => {
          if (!o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (!this._fadeRest.has(m)) {
              this._fadeRest.set(m, { opacity: m.opacity, transparent: m.transparent });
            }
          }
        });
        this._fadeActive = true;
      }
      this._fadeRest.forEach((rest, mat) => {
        mat.transparent = true;
        mat.opacity = rest.opacity * alpha;
      });
    }

    update() {
      const now = performance.now();
      const deltaMs = now - this._lastTime;
      this._lastTime = now;

      if (!this._model) return;

      this._updateTransition(deltaMs);
      if (this._mixer) this._mixer.update(deltaMs / 1000);
      if (this._animData) this._applyKeyframe(deltaMs);
      this._updateShimmer();
      // The blade is sampled AFTER the frame's pose is applied and before the
      // scene is drawn, so the trail is exactly where the weapon is this frame
      // rather than one frame behind it.
      this._updateTrail(now);

      // Scene render is batched once per frame by the Spriteset_Battle
      // iterator (WeaponSystem.js) rather than once per weapon instance.
    }

    /**
     * The elemental tint an actor's <weaponShimmer> state puts on the weapon
     * they are holding. Materials are per-instance (WeaponSystemProcedural
     * clones them), so writing emissive here cannot leak into the cached
     * prototype or into another actor's copy of the same weapon.
     */
    _updateShimmer() {
      let color = null;
      if (this._visible) {
        const scene = SceneManager._scene;
        const set = scene && scene._spriteset;
        if (set && set.getCurrentBattleActor) {
          const actor = set.getCurrentBattleActor(false);
          if (actor && actor.getLatestWeaponShimmerColor) {
            color = actor.getLatestWeaponShimmerColor();
          }
        }
      }
      if (color == null) {
        if (this._shimmerActive) {
          this._forEachMaterial((m, saved) => {
            if (m.emissive && saved) {
              m.emissive.setHex(saved.hex);
              m.emissiveIntensity = saved.intensity;
            }
          });
          this._shimmerActive = false;
        }
        return;
      }
      if (!this._shimmerActive) {
        // Remember what each material looked like before the state landed.
        this._shimmerRest = new Map();
        this._model.traverse((o) => {
          if (o.material && o.material.emissive) {
            this._shimmerRest.set(o.material, {
              hex: o.material.emissive.getHex(),
              intensity: o.material.emissiveIntensity
            });
          }
        });
        this._shimmerActive = true;
      }
      // Gentle pulse so the tint reads as a shimmer rather than a flat wash.
      const pulse = (Math.sin(Date.now() / 180) + 1) / 2;
      const intensity = 0.35 + pulse * 0.45;
      this._forEachMaterial((m) => {
        if (!m.emissive) return;
        m.emissive.setHex(color);
        m.emissiveIntensity = intensity;
      });
    }

    _forEachMaterial(fn) {
      if (!this._shimmerRest) return;
      this._shimmerRest.forEach((saved, mat) => fn(mat, saved));
    }

    _applyKeyframe(deltaMs) {
      this._animElapsed += deltaMs;
      const dur = this._animData.duration || 500;
      const t = Math.min(this._animElapsed / dur, 1.0);
      const frames = this._animData.frames;
      if (!frames || frames.length === 0) return;

      let prev = frames[0];
      let next = frames[frames.length - 1];
      for (let i = 0; i < frames.length - 1; i++) {
        if (t >= frames[i].t && t <= frames[i + 1].t) {
          prev = frames[i];
          next = frames[i + 1];
          break;
        }
      }

      const span = next.t - prev.t;
      const lt = span > 0 ? (t - prev.t) / span : 0;
      const lerp = (a, b, f) => a + (b - a) * f;

      const px = lerp(prev.x || 0, next.x || 0, lt);
      const py = lerp(prev.y || 0, next.y || 0, lt);
      const pz = lerp(prev.z || 0, next.z || 0, lt);
      const rx = lerp(prev.rx || 0, next.rx || 0, lt);
      const ry = lerp(prev.ry || 0, next.ry || 0, lt);
      const rz = lerp(prev.rz || 0, next.rz || 0, lt);
      const sc = lerp(
        prev.scale !== undefined ? prev.scale : 1,
        next.scale !== undefined ? next.scale : 1,
        lt
      );

      this._model.position.set(
        this._worldX(this._screenX) + px,
        this._worldY(this._screenY) + py,
        pz
      );
      const r = this._baseRotation;
      this._model.rotation.set(
        THREE.MathUtils.degToRad(r.x + rx),
        THREE.MathUtils.degToRad(r.y + ry),
        THREE.MathUtils.degToRad(r.z + rz)
      );
      const s = (this._weapon.model3dScale || 1.0) * sc;
      this._model.scale.set(s, s, s);

      if (t >= 1.0) {
        this._animData = null;
        this._model.visible = false;
        this._visible = false;
      }
    }

    terminate() {
      if (this._model) {
        // A model built from a cached prototype can still be sharing a material
        // array with it, so a half-finished fade must be handed back opaque or
        // the next weapon off that prototype is born transparent.
        this._applyFade(1);
        if (WeaponThreeScene.scene) {
          WeaponThreeScene.scene.remove(this._model);
        }
        // Free geometries/materials (and model-owned textures) to avoid a GPU
        // leak on every weapon regeneration/swap.
        disposeWeaponObject3D(this._model);
      }
      if (this._trailTimer) { clearTimeout(this._trailTimer); this._trailTimer = null; }
      if (this._trails) { this._trails.forEach(t => t.dispose()); this._trails = null; }
      if (this._mixer && typeof this._mixer.stopAllAction === 'function') {
        this._mixer.stopAllAction();
      }
      this._model = null;
      this._mixer = null;
      this._clips = null;
      WeaponThreeScene.deref();
    }
  }


  //=============================================================================
  // WeaponHitFX - procedural impact effects, drawn instead of a DB animation
  //=============================================================================
  // What a blow looks like where it lands. Every weapon type has a profile
  // below: the shape of the mark it leaves (a crescent for a sword, a shock
  // ring for a mace, three rakes for a claw, a tracer and a tumbling case for
  // a gun), what it sounds like on impact, and whether it whistles on the way
  // in at all. Nothing is loaded from disk: the geometry is built here and the
  // textures are painted into a canvas once per session.
  //
  // The effects live in the same ortho scene the held weapon is drawn in, so
  // one world unit is one game pixel and a hit point in screen coordinates can
  // be used as a position directly.

  // Impact sound banks (audio/se). A profile names one of these; the swing on
  // the way in is WeaponSystem's business and is only suppressed here for the
  // weapons that have nothing to whistle (see `swing: false`).
  const HIT_SE = {
    // Reassigned by measurement, not by name. The weapon-on-weapon recordings
    // are thin metallic pings taken at a distance: 0.015 to 0.035 RMS against
    // 0.11 to 0.30 for the body impacts, a crest factor over 30 dB, which is
    // to say almost the whole clip is silence. Played at the same volume as
    // everything else they were inaudible, which is what "dull, and sometimes
    // it does not seem to play" was. Each bank now leads with the body impact
    // that carries the blow and keeps only the loudest ring of its own kind
    // for the character on top; the quietest takes of every metal bank are no
    // longer drawn at all. A blade is the bright pair, a mace the heavy pair.
    slash:  ["Weapons/HitFlesh1", "Weapons/HitFlesh5", "Weapons/HitSlash5",     // i18n-ignore  audio/se filenames
             "Weapons/HitPierce5"],
    cleave: ["Weapons/HitFlesh4", "Weapons/HitFlesh6", "Weapons/HitCleave6",    // i18n-ignore
             "Weapons/HitBlunt2"],
    blunt:  ["Weapons/HitFlesh2", "Weapons/HitFlesh4", "Weapons/HitFlesh6",     // i18n-ignore
             "Weapons/HitBlunt2"],
    flesh:  ["Weapons/HitFlesh1", "Weapons/HitFlesh2", "Weapons/HitFlesh3",     // i18n-ignore
             "Weapons/HitFlesh4", "Weapons/HitFlesh5", "Weapons/HitFlesh6"],
    pierce: ["Weapons/HitFlesh3", "Weapons/HitFlesh5", "Weapons/HitPierce4",    // i18n-ignore
             "Weapons/HitPierce5"],
    magic:  ["Weapons/HitMagic1", "Weapons/HitMagic2", "Weapons/HitMagic3"],    // i18n-ignore
    lash:   ["Weapons/HitLash1", "Weapons/HitLash3", "Weapons/HitFlesh1"],      // i18n-ignore
    bullet: ["impact/bfh1_hit_07", "impact/bfh1_hit_02", "impact/bfh1_hit_06",  // i18n-ignore
             "impact/bfh1_hit_08", "impact/bfh1_hit_10"],
    casing: ["impact/bfh1_metal_falling_01", "impact/bfh1_metal_falling_02",    // i18n-ignore
             "impact/bfh1_metal_falling_04"]
  };

  // One entry per weapon type id (data/System.json weaponTypes). `shape` picks
  // the builder in SHAPES; everything else tunes it. A weapon may name a
  // profile of its own with <HitFX: name>, which is why these are keyed by
  // name as well as by type id.
  const HIT_PROFILES = {
    light:      { hits: 2, hitGap: 70, hitstop: 55, shape: "ribbon", color: 0xbfe4ff, size: 54,  sweep: 130, width: 5,  bow: 0.10, head: 0.22, tail: 0.24, blades: 1, life: 270, sparks: 8,  sparkles: 8,  se: "slash",  swing: true },
    sword:      { hitstop: 95, shape: "ribbon", color: 0x9ed8ff, size: 88,  sweep: 165, width: 10,  bow: 0.14, head: 0.28, tail: 0.30, blades: 2, cross: 1.25, stagger: 0.16, life: 380, sparks: 14, sparkles: 14, se: "slash",  swing: true },
    heavy:      { hitstop: 150, shape: "shock",  color: 0xffd9a0, size: 110,  thickness: 0.30, lines: 10, life: 420, sparks: 16, dust: 10, se: "blunt",  swing: true, shake: 6 },
    axe:        { hitstop: 140, shape: "ribbon", color: 0xffcf8a, size: 104,  sweep: 120, width: 17, bow: 0.20, head: 0.30, tail: 0.34, blades: 1, life: 400, sparks: 14, sparkles: 10, se: "cleave", swing: true, shake: 3 },
    whip:       { hitstop: 60, shape: "lash",   color: 0xffe9c0, size: 140, sweep: 210, width: 5,  bow: 0.05, wave: 0.28, head: 0.30, tail: 0.26, life: 310, sparks: 6,  sparkles: 6,  se: "lash",   swing: true },
    staff:      { hitstop: 70, shape: "rune",   color: 0xb9a6ff, size: 92,  thickness: 0.12, lines: 7, life: 500, sparks: 18, sparkles: 16, se: "magic",  swing: true },
    bow:        { hitstop: 55, shape: "thrust", color: 0xdff0ff, size: 136, thickness: 6,   lines: 5, life: 290, sparks: 9,  sparkles: 5,  se: "pierce", swing: false },
    projectile: { hitstop: 45, shape: "thrust", color: 0xe6f2ff, size: 112,  thickness: 4,   lines: 5, life: 250, sparks: 10, sparkles: 4,  se: "pierce", swing: false },
    gun:        { hitstop: 60, shape: "tracer", color: 0xfff0b0, size: 240, thickness: 3,   lines: 6, life: 270, sparks: 12, smoke: 5, se: "bullet", swing: false, casing: true, shake: 4 },
    claw:       { trails: 3, hits: 3, hitGap: 65, hitstop: 45, shape: "ribbon", color: 0xffd0e0, size: 72,  sweep: 110, width: 4.5, bow: 0.08, head: 0.20, tail: 0.22, blades: 3, parallel: true, stagger: 0.06, life: 290, sparks: 8, sparkles: 8, se: "slash", swing: true },
    glove:      { trails: 0, hitstop: 85, shape: "starburst", color: 0xfff2cc, size: 78, thickness: 0.26, lines: 11, life: 310, sparks: 12, sparkles: 6, se: "flesh", swing: true, shake: 4 },
    spear:      { hitstop: 75, shape: "thrust", color: 0xd9f3ff, size: 150, thickness: 7,   lines: 6, life: 280, sparks: 10, sparkles: 6,  se: "pierce", swing: true }
  };

  const HIT_PROFILE_BY_WTYPE = {
    1: "light", 2: "sword", 3: "heavy", 4: "axe", 5: "whip", 6: "staff",
    7: "bow", 8: "projectile", 9: "gun", 10: "claw", 11: "glove", 12: "spear"
  };

  // Monster Hunter is the reference for how a blow reads: the weapon's own
  // heft decides how big it lands, how long the picture holds on the contact
  // and how hard the screen moves. A 300g knife is a flick; a 6kg greatsword
  // stops the world for a fifth of a second.
  //
  // HITSTOP is the whole trick: on contact the effect FREEZES on its first
  // frames for a moment before the rest of it plays out, which is what makes a
  // hit feel like it met something solid rather than passed through air.
  const HEFT_REF = 900;     // grams a "normal" swing weighs
  const HITSTOP_MS = 90;    // hitstop of a normal swing, scaled by heft below

  /** 0.55 (a dagger) to ~1.8 (a greatsword), on a log scale of grams. */
  function heftOf(weapon) {
    const grams = (weapon && weapon.weight) || HEFT_REF;
    const h = Math.log(Math.max(50, grams) / HEFT_REF) / Math.LN2;
    return Math.max(0.55, Math.min(1.8, 1 + h * 0.35));
  }

  // A crit is the same blow drawn louder: bigger, brighter, longer lived.
  // How much of its written size a cut mark is drawn at. The rest of the blow
  // is the weapon's own trail through the air, which is the thing the eye
  // follows; a mark that is as big as the sweep reads as two swings.
  const CUT_MARK = 0.5;

  const CRIT_SCALE = 1.45;
  const CRIT_LIFE = 1.25;

  // Bespoke profiles: js/db/Weapons/HitFX.json, registered by DataService as
  // window.Weapons.HitFX and read the first time a weapon asks for its look.
  // Colours are written as "0xrrggbb" strings there, since JSON has no hex.
  const _profileCache = {};

  function hitFXData() {
    return (window.Weapons && window.Weapons.HitFX) || null;
  }

  function normalizeFX(entry) {
    if (!entry) return null;
    const out = {};
    for (const key in entry) {
      if (key.charAt(0) === "_") continue;
      const v = entry[key];
      out[key] = (typeof v === "string" && /^0x[0-9a-f]+$/i.test(v)) ? Number(v) : v;
    }
    return out;
  }

  // How far a hit sound is nudged off 100% pitch, either way.
  const SE_PITCH_JITTER = 9;

  const fxRand = (a, b) => a + Math.random() * (b - a);
  const fxPick = (list) => list[Math.floor(Math.random() * list.length)];

  // Painted once per session and shared by every effect: a soft round blob for
  // sparks and smoke, and a streak that fades at both ends for slashes.
  const fxTextures = {};
  function fxTexture(kind) {
    if (fxTextures[kind]) return fxTextures[kind];
    if (typeof document === "undefined" || !window.THREE) return null;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    if (kind === "streak") {
      const grad = g.createLinearGradient(0, 0, 64, 0);
      grad.addColorStop(0.0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(255,255,255,1)");
      grad.addColorStop(1.0, "rgba(255,255,255,0)");
      g.fillStyle = grad;
    } else {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0.0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.65)");
      grad.addColorStop(1.0, "rgba(255,255,255,0)");
      g.fillStyle = grad;
    }
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    fxTextures[kind] = tex;
    return tex;
  }

  function fxMaterial(color, texKind, vertexColors) {
    return new THREE.MeshBasicMaterial({
      color: color,
      vertexColors: !!vertexColors,
      map: texKind ? fxTexture(texKind) : null,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }

  // Every blow is drawn at this much of its profile size. The profiles are
  // written as relative shapes; this is the one knob that says how much of the
  // screen a hit takes up.
  const FX_SCALE = 2.1;

  // What the weapon's own <Attack Element> trait does to the blow it lands.
  // The element repaints the trail and adds a flourish of its own on top of
  // the weapon type's shape: fire throws embers, ice throws shards, a petro
  // weapon throws crude oil. `blend: "normal"` is for looks that are DARKER
  // than what they land on, which additive light can never draw.
  const ELEMENT_LOOKS = {
    2: { name: "fire",    color: 0xff7a2a, core: 0xffe9a0, sparkle: 0xffc266, sparkles: 6, extra: "embers" },
    3: { name: "ice",     color: 0x9fe8ff, core: 0xffffff, sparkle: 0xdff6ff, sparkles: 8, extra: "shards" },
    4: { name: "thunder", color: 0xfff17a, core: 0xffffff, sparkle: 0xfff9c4, sparkles: 4, extra: "bolts", flicker: true },
    5: { name: "water",   color: 0x4fc3ff, core: 0xdff4ff, sparkle: 0x9fe0ff, sparkles: 6, extra: "droplets" },
    6: { name: "petro",   color: 0x3a2f1c, core: 0x7a6a3a, sparkle: 0x9a8a4a, sparkles: 0, extra: "oil", blend: "normal", opacity: 0.95 },
    7: { name: "wind",    color: 0xbfffd9, core: 0xffffff, sparkle: 0xdfffe9, sparkles: 8, extra: "gusts" },
    8: { name: "sacred",  color: 0xffe9a0, core: 0xffffff, sparkle: 0xfff4c4, sparkles: 14, extra: "rays" },
    9: { name: "cursed",  color: 0x9a4fff, core: 0xe0c4ff, sparkle: 0xc08cff, sparkles: 10, extra: "tendrils" }
  };

  /**
   * The element a weapon strikes with: its <Attack Element> trait (code 31),
   * which is what the database editor writes for "Attack Element". Physical
   * (1) and no element at all are the same thing here: the weapon type's own
   * colours, no flourish.
   */
  function attackElementOf(weapon) {
    if (!weapon) return 0;
    if (weapon.attackElementId !== undefined) return weapon.attackElementId;
    const traits = weapon.traits || [];
    for (const t of traits) {
      if (t && t.code === 31 && t.dataId > 1) return t.dataId;
    }
    return 0;
  }

  // The flourishes themselves. Each is handed the burst, the profile it is
  // decorating, the element look and the size the blow is drawn at.
  const ELEMENT_FX = {
    // Fire: embers rising off the cut, slower and warmer than sparks.
    embers(burst, p, look, scale) {
      for (let i = 0; i < 14; i++) {
        const a = fxRand(0, Math.PI * 2);
        const d = p.size * scale * fxRand(0.15, 0.9);
        const size = fxRand(3, 9) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
          fxMaterial(i % 3 ? look.color : look.core, "spark"));
        m.position.set(Math.cos(a) * d, Math.sin(a) * d, 5);
        burst.add(m, { vx: fxRand(-0.01, 0.01), vy: fxRand(0.02, 0.06), grow: 0.6, twinkle: fxRand(0, 6) });
      }
    },

    // Ice: flat crystal shards thrown off the impact, turning as they go.
    shards(burst, p, look, scale) {
      for (let i = 0; i < 9; i++) {
        const a = fxRand(0, Math.PI * 2);
        const len = fxRand(10, 26) * scale;
        const geo = new THREE.PlaneGeometry(len, len * 0.32);
        const m = new THREE.Mesh(geo, fxMaterial(i % 2 ? look.color : look.core, null));
        m.material.opacity = 0.85;
        m.rotation.z = a;
        m.position.set(Math.cos(a) * p.size * scale * 0.5, Math.sin(a) * p.size * scale * 0.5, 3);
        burst.add(m, {
          vx: Math.cos(a) * fxRand(0.03, 0.12),
          vy: Math.sin(a) * fxRand(0.03, 0.12),
          vr: fxRand(-0.006, 0.006),
          gravity: 0.0008
        });
      }
    },

    // Thunder: jagged forks, each a chain of short beams walking outward.
    bolts(burst, p, look, scale) {
      for (let f = 0; f < 4; f++) {
        let a = fxRand(0, Math.PI * 2);
        let x = 0;
        let y = 0;
        for (let i = 0; i < 5; i++) {
          const len = fxRand(0.2, 0.42) * p.size * scale;
          a += fxRand(-0.9, 0.9);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.6 * scale),
            fxMaterial(i % 2 ? look.core : look.color, "streak"));
          m.rotation.z = a;
          m.position.set(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, 5);
          x += Math.cos(a) * len;
          y += Math.sin(a) * len;
          burst.add(m, { hold: true, twinkle: fxRand(0, 6) });
        }
      }
    },

    // Water: a fan of droplets falling out of the cut.
    droplets(burst, p, look, scale) {
      for (let i = 0; i < 16; i++) {
        const a = fxRand(0, Math.PI);
        const size = fxRand(3, 8) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.5),
          fxMaterial(i % 4 ? look.color : look.core, "spark"));
        m.position.set(0, 0, 4);
        burst.add(m, {
          vx: Math.cos(a) * fxRand(0.03, 0.14),
          vy: Math.sin(a) * fxRand(0.04, 0.16),
          gravity: 0.0022
        });
      }
    },

    // Petro: crude oil. Thick black gouts thrown off the blow, a slick left
    // clinging where it landed and fat drops running down out of it. Drawn
    // dark on purpose: this is the one look that takes light away.
    oil(burst, p, look, scale) {
      const r = p.size * scale;
      // The slick: overlapping dark blobs spreading over the hit.
      for (let i = 0; i < 7; i++) {
        const a = fxRand(0, Math.PI * 2);
        const d = r * fxRand(0, 0.45);
        const size = r * fxRand(0.35, 0.85);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * fxRand(0.7, 1.1)),
          fxMaterial(i % 4 === 0 ? look.core : look.color, "spark"));
        m.material.blending = THREE.NormalBlending;
        m.material.opacity = fxRand(0.7, 0.95);
        m.rotation.z = fxRand(0, Math.PI);
        m.position.set(Math.cos(a) * d, Math.sin(a) * d, 3 + i * 0.1);
        burst.add(m, { grow: fxRand(0.5, 1.1), vy: -0.004 });
      }
      // The gouts: heavy globs flung out and falling, each with a tail.
      for (let i = 0; i < 12; i++) {
        const a = fxRand(0, Math.PI * 2);
        const size = fxRand(5, 14) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * fxRand(1, 1.8)),
          fxMaterial(look.color, "spark"));
        m.material.blending = THREE.NormalBlending;
        m.material.opacity = 0.9;
        m.rotation.z = a - Math.PI / 2;
        m.position.set(0, 0, 6);
        burst.add(m, {
          vx: Math.cos(a) * fxRand(0.05, 0.2),
          vy: Math.abs(Math.sin(a)) * fxRand(0.06, 0.2),
          gravity: 0.0026,
          vr: fxRand(-0.004, 0.004)
        });
      }
      // The sheen: the one bright thing about oil, a thin highlight on top.
      const sheen = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.9, r * 0.22),
        fxMaterial(look.core, "streak"));
      sheen.material.opacity = 0.5;
      sheen.rotation.z = fxRand(-0.5, 0.5);
      burst.add(sheen, { grow: 0.6 });
    },

    // Wind: thin crescents peeling away from the cut.
    gusts(burst, p, look, scale) {
      for (let i = 0; i < 5; i++) {
        const r = p.size * scale * fxRand(0.7, 1.5);
        const m = new THREE.Mesh(
          new THREE.RingGeometry(r * 0.94, r, 24, 1, fxRand(0, 6), fxRand(0.8, 1.9)),
          fxMaterial(i % 2 ? look.core : look.color, null));
        m.material.opacity = 0.7;
        m.scale.set(0.5, 0.5, 1);
        burst.add(m, { grow: 1.5, vr: fxRand(-0.004, 0.004) });
      }
    },

    // Sacred: a corona of light beams standing still while everything fades.
    rays(burst, p, look, scale) {
      const r = p.size * scale;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const len = r * (i % 2 ? 2.2 : 1.4);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 5 * scale),
          fxMaterial(i % 2 ? look.core : look.color, "streak"));
        m.rotation.z = a;
        m.position.set(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5, 2);
        m.scale.set(0.25, 1, 1);
        burst.add(m, { stretch: 1, grow: 0 });
      }
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4),
        fxMaterial(look.color, "spark"));
      halo.material.opacity = 0.55;
      burst.add(halo, { grow: 0.8 });
    },

    // Cursed: smoke tendrils curling up out of the wound.
    tendrils(burst, p, look, scale) {
      for (let i = 0; i < 10; i++) {
        const a = fxRand(0, Math.PI * 2);
        const size = fxRand(10, 26) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.6),
          fxMaterial(i % 3 ? look.color : look.core, "spark"));
        m.material.opacity = 0.6;
        m.position.set(Math.cos(a) * p.size * scale * 0.4, Math.sin(a) * p.size * scale * 0.4, 1);
        burst.add(m, {
          vx: Math.cos(a) * 0.012,
          vy: fxRand(0.01, 0.045),
          vr: fxRand(-0.005, 0.005),
          grow: 1.2
        });
      }
    }
  };

  /**
   * One effect playing at one point. Owns a THREE.Group of parts, each with an
   * `_fx` describing how it moves and fades over the effect's life.
   */
  class WeaponHitBurst {
    constructor(profile, x, y, opts) {
      this.profile = profile;
      this.opts = opts || {};
      this.elapsed = 0;
      const heft = this.opts.heft || 1;
      this.life = profile.life * (this.opts.crit ? CRIT_LIFE : 1) * (0.85 + heft * 0.25);
      // The freeze on contact, before the stroke plays on. A blocked blow that
      // went nowhere holds longest of all: that is the clang.
      this.hitstop = (profile.hitstop !== undefined ? profile.hitstop : HITSTOP_MS) *
        heft * (this.opts.crit ? 1.5 : 1) * (this.opts.blocked ? 1.6 : 1);
      this._stopped = 0;
      this.group = new THREE.Group();
      this.group.position.set(x, y, 40);
      this.group.renderOrder = 900;
      const look = this.opts.look || null;
      this.look = look;
      const scale = FX_SCALE * (this.opts.crit ? CRIT_SCALE : 1) * (0.8 + heft * 0.28);
      const color = this.opts.color || (look && look.color) || profile.color;
      // A blow that landed on something that would not give: no cut, a shower
      // of sparks off the guard and a longer freeze. Monster Hunter's clang.
      const builder = this.opts.blocked
        ? SHAPES.clang
        : (SHAPES[profile.shape] || SHAPES.ribbon);
      // The element repaints the weapon type's own shape rather than replacing
      // it: a fire sword still cuts like a sword.
      const shaped = look
        ? Object.assign({}, profile, {
            core: look.core,
            sparkleColor: look.sparkle,
            sparkles: Math.max(0, (profile.sparkles || 0) + (look.sparkles || 0))
          })
        : profile;
      builder(this, shaped, color, scale);
      if (look && ELEMENT_FX[look.extra]) ELEMENT_FX[look.extra](this, shaped, look, scale);
      this._addSparks(shaped, look ? look.sparkle : color, scale);
      if (profile.dust) this._addPuffs(profile.dust, 0xbdae95, profile.size * scale * 0.9, 0.35);
      if (profile.smoke) this._addPuffs(profile.smoke, 0x9aa0a6, profile.size * scale * 0.25, 0.5);
      if (profile.casing) this._addCasing(scale);
      this._addImpactPop(look ? look.core : (profile.core || 0xffffff), profile, scale);
      // Last, and over everything the blow is made of: oil and anything else
      // darker than what it lands on cannot be drawn with additive light, so
      // the whole thing is repainted flat.
      if (look && look.blend === "normal") this._flatten(look.opacity || 1);
    }

    /** Repaint every part flat, for a look that is darker than the scene. */
    _flatten(opacity) {
      this.group.children.forEach(m => {
        m.material.blending = THREE.NormalBlending;
        m.material.opacity = Math.min(1, m.material.opacity * opacity);
        m._fx.baseOpacity = m.material.opacity;
      });
    }

    /** Register a part with its own motion: {vx,vy,vr,grow,gravity,hold}. */
    add(mesh, fx) {
      mesh._fx = Object.assign({ vx: 0, vy: 0, vr: 0, grow: 0, gravity: 0 }, fx || {});
      mesh._fx.baseScale = mesh.scale.x;
      mesh._fx.baseOpacity = mesh.material.opacity;
      this.group.add(mesh);
      return mesh;
    }

    _addSparks(profile, color, scale) {
      const n = Math.round((profile.sparks || 0) * (this.opts.crit ? 1.6 : 1));
      for (let i = 0; i < n; i++) {
        const a = fxRand(0, Math.PI * 2);
        const speed = fxRand(0.10, 0.42) * profile.size * scale;
        const size = fxRand(3, 8) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fxMaterial(color, "spark"));
        m.position.set(0, 0, 2);
        this.add(m, {
          vx: Math.cos(a) * speed / 100,
          vy: Math.sin(a) * speed / 100,
          gravity: 0.0012,
          grow: -0.6
        });
      }
    }

    _addPuffs(count, color, radius, drift) {
      for (let i = 0; i < count; i++) {
        const a = fxRand(0, Math.PI * 2);
        const size = fxRand(radius * 0.6, radius * 1.4);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fxMaterial(color, "spark"));
        m.material.blending = THREE.NormalBlending;
        m.material.opacity = 0.5;
        m.position.set(Math.cos(a) * radius * 0.3, Math.sin(a) * radius * 0.3, -2);
        this.add(m, {
          vx: Math.cos(a) * drift * 0.06,
          vy: Math.abs(Math.sin(a)) * drift * 0.06,
          grow: 1.4
        });
      }
    }

    // The brass a firearm throws: a little box tumbling out to the side and
    // down, landing about when the sound of it does.
    _addCasing(scale) {
      const geo = new THREE.BoxGeometry(3 * scale, 8 * scale, 3 * scale);
      const mat = new THREE.MeshBasicMaterial({ color: 0xd8b25a, transparent: true, depthTest: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(fxRand(-8, 8), 0, 6);
      this.add(m, { vx: fxRand(0.06, 0.16), vy: 0.16, vr: fxRand(0.02, 0.05), gravity: 0.0016 });
    }

    /**
     * The path a blade sweeps, as a three.js curve in 3D: an arc that bellies
     * out, waves along its length for a whip, and travels through depth toward
     * the camera at its middle. Everything a trail is made of is swept along
     * this one curve, so the core, the glow and the spark riding the tip all
     * agree about where the blade is.
     *
     * @returns {THREE.CatmullRomCurve3}
     */
    static ribbonCurve(radius, sweep, bow, wave, depth) {
      const points = [];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = -sweep / 2 + sweep * t;
        const r = radius * (1 + bow * Math.sin(Math.PI * t) + (wave || 0) * Math.sin(Math.PI * 2 * t));
        points.push(new THREE.Vector3(
          Math.cos(a) * r,
          Math.sin(a) * r,
          // Toward the camera at the middle of the stroke and away at its ends:
          // this is what makes the arc read as swept through the scene rather
          // than stamped on the glass.
          depth * Math.sin(Math.PI * t) - depth * 0.35
        ));
      }
      return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
    }

    /**
     * The trail itself: a strip swept along `curve` using three.js' own Frenet
     * frames, rolling from edge-on at the tail to broad in the middle the way
     * a blade turns through a cut, tapering to nothing at both ends. The roll
     * is baked into vertex colours as well as into the geometry, so the strip
     * dims as it turns away even though it is drawn with an unlit material.
     */
    static ribbonGeometry(curve, width, twist) {
      const segs = 48;
      const frames = curve.computeFrenetFrames(segs, false);
      const pos = new Float32Array((segs + 1) * 6);
      const col = new Float32Array((segs + 1) * 6);
      const uvs = new Float32Array((segs + 1) * 4);
      const idx = new Uint16Array(segs * 6);
      const point = new THREE.Vector3();
      const side = new THREE.Vector3();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        curve.getPointAt(t, point);
        const tangent = frames.tangents[Math.min(i, segs - 1)];
        const binormal = frames.binormals[Math.min(i, segs - 1)];
        // The blade rolls along the cut: the cross-section turns about the
        // path's own tangent, which is what three's frames are for.
        const roll = (twist || 0) * (t - 0.5) * Math.PI;
        side.copy(binormal).applyAxisAngle(tangent, roll);
        // Sharp at the tip, sharp at the tail, widest around the middle: this
        // taper is most of what makes a strip read as a blade path.
        const w = width * Math.pow(Math.sin(Math.PI * t), 0.55);
        const o = i * 6;
        pos[o]     = point.x + side.x * w;
        pos[o + 1] = point.y + side.y * w;
        pos[o + 2] = point.z + side.z * w;
        pos[o + 3] = point.x - side.x * w;
        pos[o + 4] = point.y - side.y * w;
        pos[o + 5] = point.z - side.z * w;
        // Broad to the camera is bright, edge-on is dim.
        const shade = 0.4 + 0.6 * Math.sqrt(Math.max(0, 1 - side.z * side.z));
        col[o] = col[o + 1] = col[o + 2] = shade;
        col[o + 3] = col[o + 4] = col[o + 5] = shade;
        const u = i * 4;
        uvs[u] = t; uvs[u + 1] = 1; uvs[u + 2] = t; uvs[u + 3] = 0;
        if (i < segs) {
          const k = i * 2;
          const j = i * 6;
          idx[j] = k; idx[j + 1] = k + 1; idx[j + 2] = k + 2;
          idx[j + 3] = k + 1; idx[j + 4] = k + 3; idx[j + 5] = k + 2;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      return geo;
    }

    /**
     * How a trail is hung in the scene: the rotation it is swung into, and the
     * shift that puts the MIDDLE of the stroke on the hit point so the cut
     * runs through the target rather than curving around it.
     * @returns {{matrix:THREE.Matrix4, offset:THREE.Vector3}}
     */
    static ribbonPlacement(curve, angle, tilt) {
      const matrix = new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(tilt, 0, angle, "ZXY"));
      const mid = curve.getPointAt(0.5).applyMatrix4(matrix);
      return { matrix, offset: mid.negate() };
    }

    /** One trail: a round core tube inside two swept strips of its own colour. */
    addRibbon(color, p, scale, angle, offset, delayFrac, index) {
      const sweep = THREE.MathUtils.degToRad(p.sweep || 150);
      const radius = (p.size * scale + offset) * (p.radius || 1);
      const width = (p.width || 7) * scale;
      const depth = (p.depth !== undefined ? p.depth : 0.55) * radius;
      const twist = p.twist !== undefined ? p.twist : 0.8;
      const tilt = (p.tilt !== undefined ? p.tilt : 0.55) * (index % 2 ? -1 : 1);
      const curve = WeaponHitBurst.ribbonCurve(radius, sweep, p.bow || 0.12, p.wave || 0, depth);
      const timing = { head: p.head || 0.34, tail: p.tail || 0.30, delay: delayFrac || 0 };

      // The core is a real tube swept down the path, not a flat highlight: it
      // is what gives the stroke a body when the arc turns through the camera.
      const parts = [
        {
          geo: new THREE.TubeGeometry(curve, 48, width * 0.22, 6, false),
          color: p.core || 0xffffff, opacity: 1, z: 0
        },
        {
          geo: WeaponHitBurst.ribbonGeometry(curve, width, twist),
          color: color, opacity: 0.8, z: 0, vertexColors: true
        },
        {
          geo: WeaponHitBurst.ribbonGeometry(curve, width * 2.1, twist * 0.6),
          color: color, opacity: 0.3, z: -2, vertexColors: true
        }
      ];
      // The stroke is hung on the hit point by its MIDDLE, not by the centre
      // of its arc: the blade passes through the body it struck and the trail
      // runs out the far side of it, instead of standing beside the enemy.
      const place = WeaponHitBurst.ribbonPlacement(curve, angle, tilt, index);
      parts.forEach(part => {
        const m = new THREE.Mesh(part.geo, fxMaterial(part.color, "streak", part.vertexColors));
        m.material.opacity = part.opacity;
        // The whole stroke is turned into the direction the weapon swung and
        // then tipped out of the screen plane, so no two blades of a flurry
        // lie in the same plane.
        m.rotation.order = "ZXY";
        m.rotation.z = angle;
        m.rotation.x = tilt;
        m.position.copy(place.offset);
        m.position.z += part.z + index * 0.4;
        this.add(m, {
          ribbon: Object.assign({ count: part.geo.index.count }, timing)
        });
      });
      return curve;
    }

    /**
     * The bright point of light riding the tip of a trail as it is drawn. It
     * samples the very same curve the trail was swept along, through the same
     * rotation, so it stays welded to the head of the stroke in 3D.
     */
    addHeadSpark(color, p, scale, curve, angle, tilt, delayFrac) {
      const size = (p.width || 7) * scale * 3.2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fxMaterial(color, "spark"));
      const place = WeaponHitBurst.ribbonPlacement(curve, angle, tilt);
      this.add(m, {
        follow: {
          curve: curve,
          matrix: place.matrix,
          shift: place.offset,
          head: p.head || 0.34,
          delay: delayFrac || 0
        },
        grow: -0.5
      });
    }

    /**
     * Destrega's beams: thin straight lines of different lengths thrown out of
     * the point of impact at once. `axis` aims them along the line of the blow
     * (a thrust) instead of all round it.
     */
    addStarLines(count, color, length, width, axis) {
      for (let i = 0; i < count; i++) {
        const a = axis !== null && axis !== undefined
          ? axis + fxRand(-0.5, 0.5) + (i % 2 ? Math.PI : 0)
          : (i / count) * Math.PI * 2 + fxRand(-0.2, 0.2);
        const len = length * fxRand(0.45, 1);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width), fxMaterial(color, "streak"));
        m.rotation.z = a;
        m.position.set(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5, 1);
        m.scale.set(0.2, 1, 1);
        // Shot out along their own length and gone: they are the flash of the
        // blow, not the mark it leaves.
        this.add(m, { stretch: 1, hold: true });
      }
    }

    /**
     * The flash on the contact itself: a hot white pop that is gone in a
     * couple of frames. It is what the eye reads as the moment of impact,
     * under whatever the weapon type drew around it.
     */
    _addImpactPop(color, p, scale) {
      const size = p.size * scale * 0.55;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fxMaterial(color, "spark"));
      m.position.z = 10;
      m.scale.set(0.35, 0.35, 1);
      this.add(m, { grow: 2.6, hold: true });
    }

    /** Motes hanging in the air where the blade passed, twinkling as they drift. */
    addSparkles(count, color, radius, scale) {
      for (let i = 0; i < count; i++) {
        const a = fxRand(0, Math.PI * 2);
        const d = radius * fxRand(0.2, 1.05);
        const size = fxRand(2.5, 6) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fxMaterial(color, "spark"));
        m.position.set(Math.cos(a) * d, Math.sin(a) * d, 6);
        this.add(m, {
          vx: Math.cos(a) * fxRand(0.004, 0.02),
          vy: fxRand(0.002, 0.02),
          twinkle: fxRand(0, Math.PI * 2),
          grow: -0.35
        });
      }
    }

    update(deltaMs) {
      // Hitstop: the picture holds on the first frames of the contact, then
      // the rest of the effect runs as normal.
      if (this._stopped < this.hitstop) {
        this._stopped += deltaMs;
        deltaMs = Math.max(0, this._stopped - this.hitstop);
        if (deltaMs <= 0 && this.elapsed > 0) return true;
      }
      this.elapsed += deltaMs;
      const t = Math.min(this.elapsed / this.life, 1);
      const fade = 1 - t * t;
      this.group.children.forEach(m => {
        const f = m._fx;
        if (!f) return;
        m.position.x += f.vx * deltaMs;
        m.position.y += f.vy * deltaMs;
        f.vy -= f.gravity * deltaMs;
        m.rotation.z += f.vr * deltaMs;
        if (f.grow) {
          const s = Math.max(0.01, f.baseScale * (1 + f.grow * t));
          m.scale.set(s, s, s);
        }
        // A trail: drawn in from its tip over `head`, then eaten from the tail
        // from `tail` on, so the stroke travels instead of just fading.
        if (f.ribbon) {
          const r = f.ribbon;
          const rt = Math.max(0, (t - r.delay) / Math.max(0.001, 1 - r.delay));
          const head = Math.min(1, rt / r.head);
          const tail = rt <= r.tail ? 0 : (rt - r.tail) / (1 - r.tail);
          const quad = 6;
          const start = Math.floor((r.count * tail) / quad) * quad;
          const end = Math.floor((r.count * head) / quad) * quad;
          m.geometry.setDrawRange(start, Math.max(0, end - start));
          m.material.opacity = f.baseOpacity * (rt <= 0 ? 0 : 1);
          return;
        }
        // The head of a trail: rides the same curve the ribbon is revealing.
        if (f.follow) {
          const fo = f.follow;
          const rt = Math.max(0, (t - fo.delay) / Math.max(0.001, 1 - fo.delay));
          const head = Math.min(1, Math.max(0.0001, rt / fo.head));
          fo.curve.getPointAt(head, m.position);
          m.position.applyMatrix4(fo.matrix).add(fo.shift);
          m.material.opacity = f.baseOpacity * (rt <= 0 ? 0 : Math.max(0, 1 - head));
          return;
        }
        // A part that is not there yet: a tooth of a saw blade biting after
        // the ones before it.
        if (f.ribbonDelay && t < f.ribbonDelay) {
          m.material.opacity = 0;
          return;
        }
        // A beam shot out along its own length and gone.
        if (f.stretch) {
          const g = Math.min(1, t / 0.25);
          m.scale.set(0.2 + 0.8 * g, 1, 1);
        }
        // `hold` parts are the bright core of the blow: they are gone in the
        // first third rather than trailing the whole effect out.
        // Motes twinkle rather than fading flat.
        const twinkle = f.twinkle !== undefined
          ? 0.55 + 0.45 * Math.sin(f.twinkle + t * 26)
          : 1;
        m.material.opacity = f.baseOpacity * twinkle *
          (f.hold ? Math.max(0, 1 - t * 3) : fade);
      });
      return t < 1;
    }

    dispose() {
      if (this.group.parent) this.group.parent.remove(this.group);
      disposeWeaponObject3D(this.group);
    }
  }

  // How each weapon type marks the spot. Every builder works in game pixels
  // around the origin of the burst's group, which sits on the hit point.
  //
  // Two looks are mixed here. A cut is a RIBBON: a long curving trail that is
  // drawn in along its length and then eaten from the tail, so the blade path
  // reads as a stroke rather than as a stamped crescent, with a bright white
  // core inside a coloured glow and sparkle motes left hanging in the air
  // behind it. A blunt or piercing blow is a set of STAR LINES: thin straight
  // beams of different lengths thrown out from the point of impact all at
  // once, gone almost immediately.
  const SHAPES = {
    // One or more blade trails. `blades` crossing strokes for a sword, three
    // parallel ones for a claw, a single heavy one for an axe.
    ribbon(burst, p, color, scale) {
      // The stroke through the air is the weapon's own trail now
      // (WeaponTrail, sampled off the model as it swings), so what is drawn
      // here is only the CUT: a short bright mark left in the target, at a
      // fraction of the sweep this used to draw on its own.
      p = Object.assign({}, p, {
        size: p.size * (p.cut !== undefined ? p.cut : CUT_MARK),
        width: (p.width || 7) * 0.8,
        // A steel weapon leaves a wound and a few sparks, not a shower of
        // motes: the glitter belongs to whatever ELEMENT the weapon carries,
        // and a plain blade carries none.
        sparkles: Math.round((p.sparkles || 0) * (burst.look ? 1 : 0.25))
      });
      const n = p.blades || 1;
      // The stroke lies along the line the weapon actually swept when it has
      // one (Sprite_3DWeapon#strikeInfo), and only falls back to the line to
      // the target when the blow has no movement of its own.
      const baseAngle = burst.opts.motionAngle !== undefined
        ? burst.opts.motionAngle + Math.PI / 2
        : (burst.opts.angle !== undefined ? burst.opts.angle + Math.PI / 2 : fxRand(-1.0, 1.0));
      for (let i = 0; i < n; i++) {
        // Crossing strokes fan apart; parallel ones (a claw) are offset instead.
        const spread = p.parallel ? 0 : (i - (n - 1) / 2) * (p.cross || 1.1);
        const a = baseAngle + spread + (n > 1 && !p.parallel ? fxRand(-0.12, 0.12) : 0);
        const off = p.parallel ? (i - (n - 1) / 2) * p.size * scale * 0.26 : 0;
        const delay = i * (p.stagger || 0);
        const curve = burst.addRibbon(color, p, scale, a, off, delay, i);
        const tilt = (p.tilt !== undefined ? p.tilt : 0.55) * (i % 2 ? -1 : 1);
        burst.addHeadSpark(p.core || 0xffffff, p, scale, curve, a, tilt, delay);
      }
      burst.addSparkles(p.sparkles || 10, p.sparkleColor || color, p.size * scale, scale);
    },

    // A blunt blow: a shock ring pushing out, beams thrown off it, a white core.
    shock(burst, p, color, scale) {
      const r = p.size * scale;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * (1 - p.thickness), r, 48), fxMaterial(color, null));
      ring.scale.set(0.25, 0.25, 1);
      burst.add(ring, { grow: 1.6 });
      burst.addStarLines(p.lines || 9, color, r * 1.5, 3.2 * scale, null);
      const core = new THREE.Mesh(new THREE.PlaneGeometry(r, r), fxMaterial(0xffffff, "spark"));
      burst.add(core, { grow: -0.4, hold: true });
    },

    // A fist: Destrega's star, thin beams crossing over a tight ring.
    starburst(burst, p, color, scale) {
      const r = p.size * scale;
      burst.addStarLines(p.lines || 10, color, r * 2.1, 2.6 * scale, null);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * (1 - p.thickness), r, 32), fxMaterial(color, null));
      ring.scale.set(0.3, 0.3, 1);
      burst.add(ring, { grow: 1.3 });
      const core = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.8, r * 0.8), fxMaterial(0xffffff, "spark"));
      burst.add(core, { grow: 0.5, hold: true });
      burst.addSparkles(p.sparkles || 6, color, r, scale);
    },

    // A thrust: a lance of light along the line of the blow, with beams thrown
    // back down it from the point.
    thrust(burst, p, color, scale) {
      const len = p.size * scale;
      const a = burst.opts.angle !== undefined ? burst.opts.angle : fxRand(-0.35, 0.35);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(len, p.thickness * scale * 2), fxMaterial(color, "streak"));
      m.rotation.z = a;
      burst.add(m, { grow: 0.4 });
      burst.addStarLines(p.lines || 5, color, len * 0.7, 2 * scale, a);
      const core = new THREE.Mesh(
        new THREE.PlaneGeometry(len * 0.35, len * 0.35), fxMaterial(color, "spark"));
      burst.add(core, { grow: 0.6, hold: true });
      burst.addSparkles(p.sparkles || 5, color, len * 0.4, scale);
    },

    // A shot: the tracer coming in, a flat flash and a spatter of beams where
    // it lands.
    tracer(burst, p, color, scale) {
      const len = p.size * scale;
      const a = burst.opts.angle !== undefined ? burst.opts.angle : fxRand(-0.25, 0.25);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(len, p.thickness), fxMaterial(color, "streak"));
      line.rotation.z = a;
      line.position.set(-Math.cos(a) * len * 0.5, -Math.sin(a) * len * 0.5, 0);
      burst.add(line, { hold: true });
      burst.addStarLines(p.lines || 6, color, len * 0.22, 2.4 * scale, null);
      const flash = new THREE.Mesh(
        new THREE.PlaneGeometry(len * 0.22, len * 0.22), fxMaterial(0xffffff, "spark"));
      burst.add(flash, { grow: 0.9, hold: true });
    },

    // A whip: one long ribbon whipped into an S rather than an arc.
    lash(burst, p, color, scale) {
      const a = burst.opts.angle !== undefined ? burst.opts.angle : fxRand(-0.6, 0.6);
      burst.addRibbon(color, p, scale, a, 0, 0, 0);
      burst.addSparkles(p.sparkles || 5, color, p.size * scale * 0.5, scale);
    },

    // A thin point worked fast: a stack of short strokes down one line, each
    // a little offset, the way a rapier scores three holes before the eye can
    // follow the first.
    needle(burst, p, color, scale) {
      const len = p.size * scale;
      const a = burst.opts.motionAngle !== undefined
        ? burst.opts.motionAngle : (burst.opts.angle || 0);
      const n = p.stabs || 5;
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        const off = (t - 0.5) * len * 0.5;
        const l = len * fxRand(0.55, 1);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(l, (p.width || 3) * scale),
          fxMaterial(i % 2 ? color : (p.core || 0xffffff), "streak"));
        m.rotation.z = a + fxRand(-0.12, 0.12);
        m.position.set(-Math.sin(a) * off, Math.cos(a) * off, 2 + i * 0.2);
        burst.add(m, { ribbonDelay: t * 0.4, stretch: 1, hold: true });
      }
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.28, len * 0.28),
        fxMaterial(p.core || 0xffffff, "spark"));
      burst.add(flash, { grow: 0.7, hold: true });
      burst.addSparkles(p.sparkles || 5, color, len * 0.35, scale);
    },

    // Glass on bone: a short cut and then the thing that made it coming apart,
    // shards spinning off with the light caught in them.
    shatter(burst, p, color, scale) {
      const r = p.size * scale;
      burst.addStarLines(5, color, r * 1.2, 2 * scale, burst.opts.angle);
      for (let i = 0; i < 14; i++) {
        const a = fxRand(0, Math.PI * 2);
        const len = fxRand(6, 20) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, len * fxRand(0.25, 0.6)),
          fxMaterial(i % 3 ? color : (p.core || 0xffffff), null));
        m.material.opacity = 0.9;
        m.rotation.z = a;
        burst.add(m, {
          vx: Math.cos(a) * fxRand(0.05, 0.18),
          vy: Math.sin(a) * fxRand(0.05, 0.18),
          vr: fxRand(-0.01, 0.01),
          gravity: 0.0022
        });
      }
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.7, r * 0.7),
        fxMaterial(p.core || 0xffffff, "spark"));
      burst.add(flash, { grow: 1.1, hold: true });
    },

    // Two blades closing on the same point: the cut is the pair of them
    // meeting, not one stroke.
    snip(burst, p, color, scale) {
      const len = p.size * scale;
      const base = burst.opts.motionAngle !== undefined
        ? burst.opts.motionAngle : (burst.opts.angle || 0);
      for (let i = 0; i < 2; i++) {
        const a = base + (i ? 0.55 : -0.55);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, (p.width || 4) * scale),
          fxMaterial(color, "streak"));
        m.rotation.z = a;
        m.position.set(Math.cos(a) * len * 0.35, Math.sin(a) * len * 0.35, 2);
        // Both blades swing back toward the centre: the snip closes.
        burst.add(m, {
          vx: -Math.cos(a) * 0.05,
          vy: -Math.sin(a) * 0.05,
          grow: 0.3
        });
      }
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.4, len * 0.4),
        fxMaterial(p.core || 0xffffff, "spark"));
      burst.add(flash, { grow: 0.9, hold: true });
    },

    // Wood on a body: no cut at all. A dull compression, a puff of dust and a
    // few splinters, and the joke lands with it.
    thwack(burst, p, color, scale) {
      const r = p.size * scale;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r * 0.86, 20),
        fxMaterial(color, null));
      ring.material.opacity = 0.7;
      ring.scale.set(0.3, 0.3, 1);
      burst.add(ring, { grow: 1.2 });
      burst.addStarLines(p.lines || 4, color, r * 0.9, 3 * scale, null);
      for (let i = 0; i < 8; i++) {
        const a = fxRand(0, Math.PI * 2);
        const len = fxRand(5, 12) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, len * 0.22),
          fxMaterial(p.splinter || 0xc49a5a, null));
        m.material.opacity = 0.9;
        m.rotation.z = a;
        burst.add(m, {
          vx: Math.cos(a) * fxRand(0.03, 0.1),
          vy: Math.sin(a) * fxRand(0.03, 0.1),
          vr: fxRand(-0.008, 0.008),
          gravity: 0.002
        });
      }
      burst._addPuffs(6, p.dustColor || 0xa89878, r * 0.7, 0.4);
    },

    // A blade with teeth: the cut is a row of bites down one line, each one
    // opening a moment after the one before it.
    sawtooth(burst, p, color, scale) {
      const len = p.size * scale;
      const a = burst.opts.motionAngle !== undefined
        ? burst.opts.motionAngle : (burst.opts.angle || 0);
      const teeth = p.teeth || 7;
      for (let i = 0; i < teeth; i++) {
        const t = i / (teeth - 1);
        const along = (t - 0.5) * len;
        const size = (p.width || 6) * scale * fxRand(0.8, 1.6);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 2.2),
          fxMaterial(i % 2 ? color : (p.core || 0xffffff), "streak"));
        m.rotation.z = a + Math.PI / 2 + fxRand(-0.3, 0.3);
        m.position.set(
          Math.cos(a) * along - Math.sin(a) * fxRand(-6, 6) * scale,
          Math.sin(a) * along + Math.cos(a) * fxRand(-6, 6) * scale,
          2);
        // Each tooth bites a little after the last: the blade is walking.
        burst.add(m, { ribbonDelay: t * 0.35, grow: 0.6, hold: true });
      }
      const line = new THREE.Mesh(new THREE.PlaneGeometry(len, (p.width || 6) * scale * 0.5),
        fxMaterial(color, "streak"));
      line.rotation.z = a;
      burst.add(line, { grow: 0.3 });
    },

    // A handful of small things arriving at once: shot, seed, gravel, dart.
    spray(burst, p, color, scale) {
      const len = p.size * scale;
      const a = burst.opts.angle !== undefined ? burst.opts.angle : 0;
      const n = p.pellets || 9;
      for (let i = 0; i < n; i++) {
        const spread = (p.spread !== undefined ? p.spread : 0.5);
        const pa = a + fxRand(-spread, spread);
        const l = len * fxRand(0.5, 1);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(l, (p.width || 3) * scale),
          fxMaterial(i % 3 ? color : (p.core || 0xffffff), "streak"));
        m.rotation.z = pa;
        m.position.set(-Math.cos(pa) * l * 0.5, -Math.sin(pa) * l * 0.5, 1);
        burst.add(m, { hold: true });
        const hit = new THREE.Mesh(
          new THREE.PlaneGeometry(6 * scale, 6 * scale), fxMaterial(color, "spark"));
        hit.position.set(fxRand(-10, 10) * scale, fxRand(-10, 10) * scale, 3);
        burst.add(hit, { grow: 0.8, gravity: 0.0006, vy: 0.02 });
      }
    },

    // A tongue of fire washing over what it hit, thinning as it goes.
    flame(burst, p, color, scale) {
      const len = p.size * scale;
      const a = burst.opts.angle !== undefined ? burst.opts.angle : 0;
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const spread = fxRand(-0.45, 0.45) * (0.3 + t);
        const pa = a + spread;
        const d = len * t * 0.6;
        const size = (12 + t * 34) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
          fxMaterial(t < 0.4 ? (p.core || 0xffe9a0) : color, "spark"));
        m.material.opacity = 0.85 - t * 0.3;
        m.position.set(-Math.cos(pa) * d, -Math.sin(pa) * d, 2 - i * 0.05);
        burst.add(m, {
          vx: Math.cos(pa) * 0.03,
          vy: Math.sin(pa) * 0.03 + 0.012,
          grow: 1.5,
          twinkle: fxRand(0, 6)
        });
      }
      burst._addPuffs(5, 0x3a3430, len * 0.35, 0.6);
    },

    // Something heavy arriving: a flat crush, a low ring of dust and lumps
    // bouncing away from it.
    lob(burst, p, color, scale) {
      const r = p.size * scale;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.55, r * 0.8, 28),
        fxMaterial(color, null));
      ring.scale.set(0.3, 0.35, 1);
      burst.add(ring, { grow: 1.7 });
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.8, r * 0.8),
        fxMaterial(p.core || 0xffffff, "spark"));
      burst.add(flash, { grow: 1, hold: true });
      for (let i = 0; i < (p.chunks || 10); i++) {
        const a = fxRand(0, Math.PI);
        const size = fxRand(6, 16) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * fxRand(0.6, 1)),
          fxMaterial(p.chunkColor || color, null));
        m.material.opacity = 0.95;
        m.rotation.z = fxRand(0, Math.PI);
        burst.add(m, {
          vx: Math.cos(a) * fxRand(0.05, 0.2),
          vy: Math.sin(a) * fxRand(0.06, 0.22),
          vr: fxRand(-0.01, 0.01),
          gravity: 0.0028
        });
      }
      burst._addPuffs(8, p.dustColor || 0x9c9184, r * 0.8, 0.5);
    },

    // Steel on something that will not cut: a tight white flash and a fan of
    // sparks raining off it, no trail at all.
    clang(burst, p, color, scale) {
      const r = p.size * scale * 0.55;
      burst.addStarLines(12, 0xfff0c0, r * 1.6, 2.2 * scale, null);
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(r, r), fxMaterial(0xffffff, "spark"));
      burst.add(flash, { grow: 1.2, hold: true });
      for (let i = 0; i < 18; i++) {
        const a = fxRand(-Math.PI * 0.85, Math.PI * 0.15);
        const size = fxRand(2, 5) * scale;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fxMaterial(0xffd48a, "spark"));
        burst.add(m, {
          vx: Math.cos(a) * fxRand(0.06, 0.24),
          vy: Math.sin(a) * fxRand(0.06, 0.24),
          gravity: 0.0028,
          grow: -0.7
        });
      }
    },

    // A staff: a slow sigil, two counter-turning rings, a glow and motes.
    rune(burst, p, color, scale) {
      const r = p.size * scale;
      for (let i = 0; i < 2; i++) {
        const rr = r * (i ? 0.62 : 1);
        const m = new THREE.Mesh(
          new THREE.RingGeometry(rr * (1 - p.thickness), rr, 6), fxMaterial(color, null));
        m.rotation.z = i ? 0.5 : 0;
        m.scale.set(0.4, 0.4, 1);
        burst.add(m, { grow: 0.9, vr: i ? -0.0018 : 0.0018 });
      }
      burst.addStarLines(p.lines || 6, color, r * 1.6, 2 * scale, null);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.6, r * 1.6), fxMaterial(color, "spark"));
      burst.add(glow, { grow: 0.3 });
      burst.addSparkles(p.sparkles || 14, color, r * 1.2, scale);
    }
  };

  /**
   * The effect service. Spriteset_Battle asks it to play a hit where a blow
   * landed (WeaponSystem.js) and drives its update and render from the battle
   * frame; nothing else needs to know it is here.
   */
  const WeaponHitFX = {
    PROFILES: HIT_PROFILES,
    SCALE: FX_SCALE,
    ELEMENTS: ELEMENT_LOOKS,
    ELEMENT_FX: ELEMENT_FX,
    BY_WTYPE: HIT_PROFILE_BY_WTYPE,
    SE: HIT_SE,
    SHAPES: SHAPES,
    // The Video option "Procedural Weapon Hits". Off means the weapon's own
    // Effekseer animation is played instead, the way it was before.
    enabled: true,
    _bursts: [],
    _pending: [],
    _lastTime: 0,

    /** Whether hits are drawn here at all, the Options toggle included. */
    isEnabled() {
      if (!this.enabled) return false;
      if (window.ConfigManager && ConfigManager.proceduralHitFX !== undefined) {
        return ConfigManager.proceduralHitFX !== false;
      }
      return true;
    },

    /**
     * The profile a weapon hits with, resolved in three layers, each one
     * overriding the last:
     *
     *   weapon type  <-  family  <-  the weapon itself
     *
     * The last two live in js/db/Weapons/HitFX.json, so a bespoke effect is
     * data rather than code: a family is a look a group of weapons share (a
     * cleaver, a pipe gun, a wooden practice sword), and a weapon entry is
     * that family with its own colours and weight. A weapon nobody has
     * authored yet still gets its type's profile, the object itself rather
     * than a copy of it.
     */
    profileFor(weapon) {
      if (!weapon) return HIT_PROFILES.sword;
      const base = HIT_PROFILES[HIT_PROFILE_BY_WTYPE[weapon.wtypeId]] || HIT_PROFILES.sword;
      const id = weapon.id;
      if (id !== undefined && _profileCache[id]) return _profileCache[id];

      const data = hitFXData();
      const entry = (data && data.weapons && data.weapons[String(id)]) || null;
      const familyName = (entry && entry.family) || weapon.hitFX || null;
      const family = (data && data.families && data.families[familyName]) || null;
      if (!entry && !family) {
        // No bespoke look: the weapon's <HitFX:> may still name a type profile.
        return (weapon.hitFX && HIT_PROFILES[weapon.hitFX]) || base;
      }
      const merged = Object.assign({}, base, normalizeFX(family), normalizeFX(entry));
      delete merged.family;
      if (id !== undefined) _profileCache[id] = merged;
      return merged;
    },

    /** Forget the resolved profiles, e.g. after the database is reloaded. */
    clearProfileCache() {
      for (const k in _profileCache) delete _profileCache[k];
    },

    /** Whether this weapon whistles on the way in (a gun does not). */
    swings(weapon) {
      return this.profileFor(weapon).swing !== false;
    },

    /** Whether this weapon leaves a trail in flight (blades and claws do; guns, unarmed and fists do not). */
    hasTrail(weapon) {
      if (!weapon) return false;
      if (weapon.wtypeId === 11 || weapon.unarmedArchetype) return false;
      const profile = this.profileFor(weapon);
      if (profile.trails === 0 || profile.trail === false) return false;
      if (profile.shape === "starburst") return false;
      return this.swings(weapon);
    },

    /**
     * What this weapon sounds like landing: one sound drawn from its own
     * <HitSounds:> tag, which tools/weapons/gen-hit-sounds.js stamped onto it
     * out of its attack animation. A weapon whose animation had nothing worth
     * landing with falls back to its profile's bank.
     *
     * Drawn rather than sequenced on purpose: a weapon that lists three
     * impacts rings a little differently every time it connects, and a flurry
     * is three related sounds rather than one sample three times.
     */
    hitSoundFor(weapon) {
      const own = weapon && weapon.hitSounds;
      if (own && own.length) return fxPick(own);
      const bank = HIT_SE[this.profileFor(weapon).se];
      return bank && bank.length ? fxPick(bank) : null;
    },

    /**
     * Play the impact of `weapon` at a point in game pixels.
     * @param {object} weapon - the database weapon (or a procedural stand-in).
     * @param {{x:number,y:number}} point - where the blow landed, screen space.
     * @param {object} [opts] - {crit, angle, color, silent}.
     */
    /**
     * Play the impact once the swing has had time to reach it. A blow whose
     * weapon is mid-movement waits for the fast part of that movement (see
     * Sprite_3DWeapon#strikeInfo) rather than flashing before the blade
     * arrives; nothing else about it changes.
     */
    play(weapon, point, opts) {
      const delay = opts && opts.delay;
      if (delay > 0) {
        const queued = Object.assign({}, opts);
        delete queued.delay;
        this._pending.push({ at: performance.now() + delay, weapon, point, opts: queued });
        return null;
      }
      return this.playNow(weapon, point, opts);
    },

    /** How heavy this weapon lands, from its <Weight:> tag. */
    heftOf(weapon) {
      return heftOf(weapon);
    },

    playNow(weapon, point, opts) {
      if (!this.isEnabled() || !point || !window.THREE) return null;
      // ref() also wakes the overlay when no weapon is held, so a hit is drawn
      // even on a turn where nothing is in frame.
      WeaponThreeScene.ref();
      const profile = this.profileFor(weapon);
      const o = Object.assign({}, opts || {});
      if (!o.look) o.look = this.lookFor(weapon);
      if (o.heft === undefined) o.heft = heftOf(weapon);
      // A light weapon does not land once, it lands three times: the follow-up
      // strokes of a flurry are queued behind this one, each turned a little
      // further round and a little smaller.
      const hits = o.blocked ? 1 : (profile.hits || 1);
      if (hits > 1 && !o.followUp) {
        for (let i = 1; i < hits; i++) {
          this._pending.push({
            at: performance.now() + i * (profile.hitGap || 80),
            weapon, point,
            opts: Object.assign({}, o, {
              followUp: true,
              silent: true,
              heft: o.heft * 0.8,
              angle: (o.angle || 0) + fxRand(-0.5, 0.5),
              motionAngle: o.motionAngle !== undefined
                ? o.motionAngle + fxRand(-0.6, 0.6)
                : undefined
            })
          });
        }
      }
      const burst = new WeaponHitBurst(
        profile,
        point.x - (Graphics.width || 816) / 2,
        -(point.y - (Graphics.height || 624) / 2),
        o
      );
      WeaponThreeScene.scene.add(burst.group);
      this._bursts.push(burst);
      this.playSounds(weapon, profile, o);
      // Everything that lands moves the camera a little; how much is the
      // weapon's own weight.
      this.shake((profile.shake || 2) * o.heft, o.crit);
      return burst;
    },

    /** The element look this weapon strikes with, or null for a plain one. */
    lookFor(weapon) {
      return ELEMENT_LOOKS[attackElementOf(weapon)] || null;
    },

    /** What element this weapon's blows carry (0 = none/physical). */
    elementOf(weapon) {
      return attackElementOf(weapon);
    },

    // The impact sound is the weapon's own attack animation SE, queued by
    // WeaponSystem when it suppresses the animation. `silent` says that
    // happened, and this bank is only the fallback for a weapon whose
    // animation carries no sound at all. Brass is thrown either way.
    playSounds(weapon, profile, opts) {
      const name = (opts && opts.silent) ? null : this.hitSoundFor(weapon);
      if (name) {
        // Never at its authored pitch: the same weapon landing twice must not
        // be the same recording twice.
        AudioManager.playSe({
          name: name,
          volume: 90,
          pitch: Math.round(fxRand(100 - SE_PITCH_JITTER, 100 + SE_PITCH_JITTER) *
            (opts && opts.crit ? 0.9 : 1)),
          pan: 0
        });
      }
      // Brass hitting the floor a moment after the shot, not with it.
      if (profile.casing) {
        setTimeout(() => {
          AudioManager.playSe({ name: fxPick(HIT_SE.casing), volume: 55, pitch: 120, pan: 10 });
        }, 260);
      }
    },

    shake(power, crit) {
      const p = Math.max(1, Math.round(crit ? power + 3 : power));
      if (window.$gameScreen) $gameScreen.startShake(p, 9, Math.min(20, 8 + p));
    },

    active() {
      return this._bursts.length > 0 || this._pending.length > 0;
    },

    update() {
      if (this._pending.length) {
        const now = performance.now();
        const due = this._pending.filter(q => q.at <= now);
        if (due.length) {
          this._pending = this._pending.filter(q => q.at > now);
          due.forEach(q => this.playNow(q.weapon, q.point, q.opts));
        }
      }
      if (!this._bursts.length) { this._lastTime = 0; return; }
      const now = performance.now();
      const delta = this._lastTime ? Math.min(now - this._lastTime, 100) : 16;
      this._lastTime = now;
      for (let i = this._bursts.length - 1; i >= 0; i--) {
        if (!this._bursts[i].update(delta)) {
          this._bursts[i].dispose();
          this._bursts.splice(i, 1);
          WeaponThreeScene.deref();
        }
      }
    },

    /** Drop everything still playing (battle over, scene torn down). */
    clear() {
      this._pending.length = 0;
      this._bursts.forEach(b => { b.dispose(); WeaponThreeScene.deref(); });
      this._bursts.length = 0;
      this._lastTime = 0;
    }
  };

  window.Sprite_3DWeapon = Sprite_3DWeapon;
  window.WeaponHitFX = WeaponHitFX;
  window.WeaponTrail = WeaponTrail;
  window.WeaponThreeScene = WeaponThreeScene;
})();
