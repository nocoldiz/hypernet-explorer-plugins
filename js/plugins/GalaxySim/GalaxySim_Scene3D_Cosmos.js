/*:
 * @target MZ
 * @plugindesc GalaxySim 3D Cosmos - Large-scale builders (starfield, galaxies, web, shells, nebulae, anomalies)
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim 3D Cosmos Module
 * ============================================================================
 * Builds the deep-space content of the 3D star map at every scale above a
 * single star system: the background starfield, galaxy point clouds, local
 * group / supercluster nodes, cosmic-web filaments, observable/universe shells,
 * nebulae, black holes and the higher-dimensional anomalies.
 *
 * Each builder returns a disposable THREE.Object3D (or null). Scene3D parents
 * the result and calls disposeObject3D() on scale change / teardown.
 *
 * Milestone status: M0 ships the background starfield; the per-scale builders
 * are filled in M4/M6/M7. The namespace + dispose helper are stable now.
 *
 * LOAD ORDER: after GalaxySim_World3D.js / GalaxySim_Renderer_Cosmology.js,
 * before GalaxySim_Scene3D.js. Requires THREE.js.
 */

(() => {
  "use strict";

  if (!window.GalaxySim) window.GalaxySim = {};
  const M = window.GalaxySim.Math || {};

  // Simple deterministic LCG so the decorative starfield is stable per seed.
  function lcg(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ==========================================================================
  // Shared sprite textures.
  //
  // These used to be built fresh on every call so that disposeObject3D could
  // free each one with the object that owned it. That is safe and very
  // expensive: the palettes behind them hold a handful of distinct looks, but
  // buildSupercluster alone asked for 333 of them, so opening that scale meant
  // 333 canvases painted, 333 textures uploaded to the GPU and 333 of both
  // thrown away again on the way out. They are immutable once painted, so one
  // copy per distinct look is enough for the whole session.
  //
  // Everything handed out here is registered in SHARED_TEX, which disposeObject3D
  // checks before freeing a material's map: a shared texture outlives every
  // object that borrows it. NEVER dispose one of these by hand.
  // ==========================================================================
  const SHARED_TEX = new Set();
  const _texCache = new Map();

  /** Memoise an immutable texture under `key`, painting it at most once. */
  function sharedTexture(key, paint) {
    let tex = _texCache.get(key);
    if (!tex) {
      tex = paint();
      SHARED_TEX.add(tex);
      _texCache.set(key, tex);
    }
    return tex;
  }

  /** True for a texture that is shared and must never be disposed. */
  function isSharedTexture(tex) { return !!tex && SHARED_TEX.has(tex); }

  // Soft round point sprite.
  function starTexture(coreStop) {
    const stop = coreStop || 0.35;
    return sharedTexture("star:" + stop, () => {
      const s = 64;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0.0, "rgba(255,255,255,1)");
      g.addColorStop(stop, "rgba(255,255,255,0.7)");
      g.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(cv);
    });
  }

  // A hard-edged dot (only the outermost pixels feather, for antialiasing).
  // Used wherever a star must read as a *point* rather than a glowing ball:
  // paired with sizeAttenuation:false it keeps a constant pixel footprint, so
  // flying into a dense region no longer smears the screen with white blobs.
  function dotTexture() {
    return sharedTexture("dot", () => {
      const s = 32;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0.0, "rgba(255,255,255,1)");
      g.addColorStop(0.62, "rgba(255,255,255,1)");
      g.addColorStop(0.86, "rgba(255,255,255,0.35)");
      g.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(cv);
    });
  }

  /**
   * A static far-background dome of faint stars, painted on the inside of a
   * large sphere so it reads as the distant sky at every scale. Returns a
   * THREE.Points sized to sit just inside the camera far plane.
   */
  function buildBackgroundStarfield(opts) {
    opts = opts || {};
    const count = opts.count || 2200;
    const radius = opts.radius || 8000;
    const rnd = lcg(opts.seed || 1337);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Uniform-on-sphere direction.
      const u = rnd() * 2 - 1;
      const theta = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const rr = radius * (0.85 + rnd() * 0.15);
      positions[i * 3] = Math.cos(theta) * r * rr;
      positions[i * 3 + 1] = u * rr;
      positions[i * 3 + 2] = Math.sin(theta) * r * rr;

      // Mostly white with a faint blue/orange scatter.
      const t = rnd();
      const c = t < 0.7 ? [1, 1, 1]
        : t < 0.85 ? [0.7, 0.8, 1.0]
          : [1.0, 0.85, 0.7];
      const b = 0.5 + rnd() * 0.5;
      colors[i * 3] = c[0] * b;
      colors[i * 3 + 1] = c[1] * b;
      colors[i * 3 + 2] = c[2] * b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: radius * 0.004,
      map: starTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = -1;
    points.name = "gx-background-starfield";
    return points;
  }

  // ==========================================================================
  // Milky Way (SpaceEngine-style). Galactic coordinates in WORLD UNITS, core
  // at the origin; the Sun sits ~26,000 ly out in a spiral arm (NOT centred).
  //   GAL.U  = light-years per world unit at galaxy scale
  //   GAL.SUN_R = Sun's distance from the galactic centre (ly)
  // ==========================================================================
  const GAL = {
    U: 20,           // 1 unit = 20 ly  -> Milky Way radius ~2600 u
    SUN_R: 26000,    // ly from core
    RADIUS: 52000,   // visual disk radius (ly)
    BULGE: 7000,     // bulge radius (ly)
  };

  // Local (Sun-relative, ly) -> galactic world Vector3 (core at origin).
  // Axis convention matches World3D: galactic plane = XZ, height = Y.
  function galacticWorld(posLocalLy, out) {
    const v = out || new THREE.Vector3();
    const gx = (GAL.SUN_R + (posLocalLy.x || 0)) / GAL.U; // Sun offset along +X
    const gy = (posLocalLy.z || 0) / GAL.U;               // height
    const gz = (posLocalLy.y || 0) / GAL.U;
    v.set(gx, gy, gz);
    return v;
  }

  // `attenuate === false` makes `size` a constant pixel footprint instead of a
  // world-space diameter - the only way a PointsMaterial can stay a crisp dot
  // when the camera is a handful of units away from the cloud.
  function makePointsMaterial(size, tex, opacity, attenuate) {
    return new THREE.PointsMaterial({
      size: size, map: tex, vertexColors: true, transparent: true,
      opacity: opacity == null ? 1 : opacity, depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: attenuate !== false,
    });
  }

  // A flat radial-gradient disk texture (bright warm core -> blue mid ->
  // transparent rim) used to lay a luminous "milk" glow across the galactic
  // plane so the disk reads as a continuous sheet of light, not just points.
  function galaxyDiskTexture() {
    return sharedTexture("galaxyDisk", () => {
      const s = 256;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0.00, "rgba(255,244,214,0.95)");
      g.addColorStop(0.10, "rgba(255,228,176,0.70)");
      g.addColorStop(0.28, "rgba(200,200,255,0.34)");
      g.addColorStop(0.55, "rgba(140,170,255,0.16)");
      g.addColorStop(0.80, "rgba(110,150,235,0.05)");
      g.addColorStop(1.00, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(cv);
    });
  }

  // The decorative galaxy body: a luminous plane-of-the-galaxy glow sheet, a
  // bright warm bulge, four logarithmic spiral arms (young blue stars + pink
  // HII knots), a faint inter-arm disk, glowing HII nebula knots embedded in
  // the arms, a thin spherical star halo, and a soft nucleus bloom. All in
  // world units, core at origin.
  // The Milky Way group is seed-static and expensive to build (~66k points +
  // several CanvasTextures), so cache the built group keyed by seed. Galaxy
  // scale re-entries reuse the same group instead of regenerating it; the cache
  // is rebuilt only if a different seed is requested (world change).
  let _milkyWayCache = null;

  function getMilkyWay(seed) {
    if (_milkyWayCache && _milkyWayCache.seed === seed) return _milkyWayCache.group;
    if (_milkyWayCache) disposeObject3D(_milkyWayCache.group);
    const group = buildMilkyWay({ seed });
    _milkyWayCache = { seed, group };
    return group;
  }

  function buildMilkyWay(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed || 19002001);
    const group = new THREE.Group();
    group.name = "gx-milkyway";
    const U = GAL.U;
    const Rdisk = GAL.RADIUS / U;     // ~2600
    const Rbulge = GAL.BULGE / U;     // ~350

    const push = (arr, i, x, y, z) => { arr[i] = x; arr[i + 1] = y; arr[i + 2] = z; };

    // Additive "bloom" elements - the plane glow sheet, the nucleus flare and
    // the HII knots. They describe the galaxy as seen from OUTSIDE; from inside
    // the disk they are a white-out that hides every star. Collected here so
    // setZoomDistance() can fade them in only once the whole galaxy is in view.
    const bloom = [];
    const addBloom = (mat, base) => { bloom.push({ mat, base }); mat.opacity = 0; };

    // --- Luminous galactic-plane glow sheet (additive disk in the XZ plane) -
    {
      const diskTex = galaxyDiskTexture();
      const diskMat = new THREE.MeshBasicMaterial({
        map: diskTex, transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, opacity: 0.9,
      });
      addBloom(diskMat, 0.9);
      const disk = new THREE.Mesh(new THREE.PlaneGeometry(Rdisk * 2.5, Rdisk * 2.5), diskMat);
      disk.rotation.x = -Math.PI / 2; // lay flat on the galactic plane
      disk.renderOrder = 0;
      group.add(disk);
    }

    // --- Central bulge: dense warm ellipsoid -------------------------------
    {
      const n = 9000;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
        const rr = Math.pow(rnd(), 1.9) * Rbulge;
        const s = Math.sqrt(1 - u * u);
        push(pos, i * 3, Math.cos(th) * s * rr, u * rr * 0.55, Math.sin(th) * s * rr);
        // Warm gold core fading to creamy white outward.
        const core = 1 - rr / Rbulge;
        const w = 0.65 + rnd() * 0.35;
        col[i * 3] = (0.95 + core * 0.05) * w;
        col[i * 3 + 1] = (0.82 + core * 0.10) * w;
        col[i * 3 + 2] = (0.58 + core * 0.18) * w;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, makePointsMaterial(2.6, dotTexture(), 0.95, false));
      pts.frustumCulled = false;
      group.add(pts);
    }

    // --- Spiral arms: 4 logarithmic arms + HII knot positions ---------------
    const hiiKnots = [];
    {
      const arms = 4;
      const n = 42000;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const B = 0.32; // arm winding
      for (let i = 0; i < n; i++) {
        const arm = i % arms;
        const tt = Math.pow(rnd(), 0.5);          // bias outward
        const r = Rbulge * 0.6 + tt * (Rdisk - Rbulge * 0.6);
        // Logarithmic spiral angle + per-arm offset + scatter that tightens
        // toward the arm centre (so arms read as ridges, not smears).
        const base = Math.log(r / (Rbulge * 0.3)) / B;
        const scatter = (rnd() - 0.5) * (0.42 + (1 - tt) * 0.55);
        const ang = base + (arm / arms) * Math.PI * 2 + scatter;
        const rJit = r * (1 + (rnd() - 0.5) * 0.06);
        const h = (rnd() - 0.5) * (Rdisk * 0.018) * (1.4 - tt); // thin, tapering
        const x = Math.cos(ang) * rJit, z = Math.sin(ang) * rJit;
        push(pos, i * 3, x, h, z);
        // Colour: bluish young stars, occasional pink HII knot, warmer inner.
        const roll = rnd();
        let cr, cg, cb;
        if (roll < 0.09) {
          cr = 1.0; cg = 0.42; cb = 0.6;                            // HII pink
          // Seed a sparse set of nebula glow knots along the brighter arms.
          // Capped low: each knot is a full nebula (a stack of canvas
          // textures), so a handful of good ones beats a disk full of them.
          if (Math.abs(scatter) < 0.22 && hiiKnots.length < 8 && rnd() < 0.06) {
            hiiKnots.push([x, h, z, tt]);
          }
        } else if (tt < 0.3) { cr = 1.0; cg = 0.9; cb = 0.72; }     // inner warm
        else { cr = 0.66; cg = 0.8; cb = 1.0; }                     // arm blue
        const w = 0.5 + rnd() * 0.5;
        col[i * 3] = cr * w; col[i * 3 + 1] = cg * w; col[i * 3 + 2] = cb * w;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, makePointsMaterial(2.1, dotTexture(), 0.9, false));
      pts.frustumCulled = false;
      group.add(pts);
    }

    // --- Faint disk fill (body between the arms) ---------------------------
    {
      const n = 11000;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const th = rnd() * Math.PI * 2;
        const r = Rbulge * 0.4 + Math.sqrt(rnd()) * (Rdisk - Rbulge * 0.4);
        const h = (rnd() - 0.5) * Rdisk * 0.025;
        push(pos, i * 3, Math.cos(th) * r, h, Math.sin(th) * r);
        const w = 0.16 + rnd() * 0.2;
        col[i * 3] = 0.78 * w; col[i * 3 + 1] = 0.82 * w; col[i * 3 + 2] = 0.98 * w;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, makePointsMaterial(1.7, dotTexture(), 0.6, false));
      pts.frustumCulled = false;
      group.add(pts);
    }

    // --- Thin spherical star halo (faint old stars + globular speckle) ------
    {
      const n = 4000;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const rr = Math.pow(rnd(), 0.6) * Rdisk * 1.05;
        push(pos, i * 3, Math.cos(th) * s * rr, u * rr * 0.8, Math.sin(th) * s * rr);
        const w = 0.1 + rnd() * 0.18;
        col[i * 3] = 0.95 * w; col[i * 3 + 1] = 0.9 * w; col[i * 3 + 2] = 0.78 * w;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, makePointsMaterial(1.5, dotTexture(), 0.5, false));
      pts.frustumCulled = false;
      group.add(pts);
    }

    // --- HII star-forming regions in the arms: real nebulae (stacked, blobby
    //     additive clouds), not ring sprites - a hollow highlight sprite here
    //     read as a row of circular bubbles floating in the disk.
    hiiKnots.forEach((k, i) => {
      const pink = i % 2 === 0;
      const neb = buildNebula({
        seed: 5100 + i * 37,
        size: Rbulge * (0.7 + (1 - k[3]) * 0.9),
        palette: pink
          ? [[255, 120, 170], [255, 90, 140], [255, 175, 205]]
          : [[150, 190, 255], [120, 160, 255], [200, 220, 255]],
        layers: 8,
      });
      neb.group.position.set(k[0], k[1], k[2]);
      group.add(neb.group);
    });

    // --- Soft core glow for nucleus bloom (the bright galactic nucleus; the
    //     central black hole is small and reads in front of it) --------------
    {
      const glow = makeGlowSprite("rgba(255,238,196,0.9)");
      glow.sprite.scale.set(Rbulge * 1.7, Rbulge * 1.7, 1);
      addBloom(glow.mat, 1);
      group.add(glow.sprite);
      const inner = makeGlowSprite("rgba(255,250,235,0.95)");
      inner.sprite.scale.set(Rbulge * 0.7, Rbulge * 0.7, 1);
      addBloom(inner.mat, 1);
      group.add(inner.sprite);
    }

    // Fade the bloom in between "deep inside the disk" and "whole galaxy in
    // frame" (the disk radius is ~2600 u, so it fills the view around 4000 u).
    const BLOOM_NEAR = 2200, BLOOM_FAR = 4600;
    group.userData.setZoomDistance = function (d) {
      const t = Math.max(0, Math.min(1, (d - BLOOM_NEAR) / (BLOOM_FAR - BLOOM_NEAR)));
      for (let i = 0; i < bloom.length; i++) {
        bloom[i].mat.opacity = bloom[i].base * t;
        bloom[i].mat.visible = t > 0.01;
      }
    };
    group.userData.setZoomDistance(0);

    return group;
  }

  /**
   * GALAXY scale: the Milky Way (Sun offset from the core) plus every
   * travelable star system as a brighter, pickable Points cloud positioned in
   * galactic coordinates. Returns the cloud + an index->system map for picking,
   * worldOf() for placing the ship, and focusWorld for camera framing.
   */
  function buildGalaxyScale(systems, focusSystem, opts) {
    opts = opts || {};
    const root = new THREE.Group();
    root.name = "gx-galaxy";

    // Impressive decorative galaxy (cached + seed-static; see getMilkyWay).
    const milkyway = getMilkyWay(19002001);
    root.add(milkyway);

    // Travelable systems: brighter/larger so they stand out near the Sun.
    const n = systems.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const systemsByIndex = new Array(n);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = systems[i];
      galacticWorld(s.position, tmp);
      positions[i * 3] = tmp.x; positions[i * 3 + 1] = tmp.y; positions[i * 3 + 2] = tmp.z;
      const c = new THREE.Color(s.color || "#ffffff");
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      systemsByIndex[i] = s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // Two layers over the SAME geometry:
    //   - `points`: a constant-pixel dot, so a star is always a distinguishable
    //     single point no matter how close the camera gets (also the pick target).
    //   - `glowPoints`: the size-attenuated halo, faded in only once the camera
    //     pulls back far enough that the cloud reads as a luminous swarm rather
    //     than a wall of overlapping blobs.
    const mat = makePointsMaterial(opts.starSize || 3.0, dotTexture(), 1, false);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 2;
    points.name = "gx-galaxy-stars";
    root.add(points);

    const glowMat = makePointsMaterial(12, starTexture(), 0, true);
    const glowPoints = new THREE.Points(geo, glowMat);
    glowPoints.frustumCulled = false;
    glowPoints.renderOrder = 1;
    glowPoints.visible = false;
    glowPoints.name = "gx-galaxy-star-glow";
    root.add(glowPoints);

    // Camera distance (world units) over which the halo ramps in. Galaxy scale
    // opens at ~70 u and reaches ~7000 u fully zoomed out.
    const GLOW_NEAR = 220, GLOW_FAR = 900;
    function setZoomDistance(d) {
      const t = Math.max(0, Math.min(1, (d - GLOW_NEAR) / (GLOW_FAR - GLOW_NEAR)));
      glowMat.opacity = t * 0.85;
      glowPoints.visible = t > 0.01;
      // The galaxy's own bloom (plane sheet + nucleus flare) fades on its own,
      // much wider curve: it only makes sense with the whole disk in frame.
      if (milkyway.userData.setZoomDistance) milkyway.userData.setZoomDistance(d);
    }
    setZoomDistance(0);

    // Sagittarius A* - the supermassive black hole at the galactic centre.
    // Kept compact (a small, sharp feature) so it reads as a point of light at
    // the nucleus, and jetless: the real Sgr A* is a quiet, starved hole with no
    // beam, and a giant one here would dominate the whole galaxy. At GALAXY
    // scale it coincides with the "Sagittarius A*" system record (Systems.json
    // pins it to the galactic centre), so the ordinary star-cloud pick already
    // makes it clickable here; entering it renders the real, full-size hole
    // (see buildSystem's isBlackHoleSystem branch).
    const sgrA = buildBlackHole({
      radius: 8, seed: 20240119, jets: false,
      diskColor: "rgba(255,150,50,0.9)",
    });
    root.add(sgrA.group);

    // A scatter of emission/reflection nebulae embedded in the disk plane.
    const nrnd = lcg(424242);
    const nebulaPalettes = [
      [[255, 110, 150], [255, 170, 120], [180, 120, 255]], // emission (H-alpha)
      [[120, 160, 255], [150, 200, 255], [200, 220, 255]], // reflection (blue)
      [[120, 255, 200], [160, 255, 230], [120, 200, 255]], // teal
    ];
    const nebulae = [];
    for (let i = 0; i < 7; i++) {
      const ang = nrnd() * Math.PI * 2;
      const rad = 320 + nrnd() * 2000; // within the disk
      const neb = buildNebula({
        seed: 1000 + i * 37,
        size: 90 + nrnd() * 130,
        palette: nebulaPalettes[(nrnd() * nebulaPalettes.length) | 0],
        layers: 12,
      });
      neb.group.position.set(Math.cos(ang) * rad, (nrnd() - 0.5) * 40, Math.sin(ang) * rad);
      root.add(neb.group);
      nebulae.push(neb);
    }

    // Famous real-world nebulae (Horsehead, Orion, Eagle, the Ring/Helix
    // donuts, dark clouds, ...): hand-shaped and placed at their real galactic
    // position, so they cluster near the Sun the way the real ones do. See
    // FAMOUS_NEBULAE / buildFamousNebulae above.
    const famousNebulae = buildFamousNebulae(systems);
    root.add(famousNebulae.group);

    // Steady (non-pulsing) highlight on the focus (home) system, out in the arm.
    const focusWorld = galacticWorld(
      (focusSystem && focusSystem.position) || { x: 0, y: 0, z: 0 }, new THREE.Vector3());
    const hi = makeHighlightSprite("#7fd0ff");
    hi.sprite.position.copy(focusWorld);
    hi.sprite.scale.set(5, 5, 1);
    root.add(hi.sprite);

    function animate(t) {
      sgrA.animate(t);
      // Pulse the protostars buried in the disk's emission nebulae.
      for (let i = 0; i < nebulae.length; i++) nebulae[i].animate(t);
      famousNebulae.animate(t);
    }
    function dispose() {
      // Detach the cached, seed-static galaxy so disposeObject3D leaves its
      // geometry/textures intact for the next galaxy-scale entry.
      root.remove(milkyway);
      disposeObject3D(root);
    }
    function worldOf(system, out) { return galacticWorld(system.position, out); }

    return {
      group: root, points, glowPoints, systemsByIndex, animate, dispose,
      setZoomDistance, worldOf, focusWorld, GAL,
      nebulaPickables: famousNebulae.pickables,
      nebulaWorldOf: famousNebulae.worldOf,
    };
  }

  /**
   * Lazy galaxy star field: a points cloud of deterministic procedural systems
   * that populates the disk around the camera focus as the player zooms in,
   * streaming chunks in/out via DataManager.generateLazyChunk. Returns a manager
   * with update(focusWorld, distance), the live `points` cloud (for picking),
   * systemAt(index) and dispose().
   */
  // The lazy star field's point sprite is identical for every chunk region, so
  // build the CanvasTexture once and share it across rebuilds / scene instances.
  let _lazyStarTex = null;
  function lazyStarTexture() {
    // A crisp dot: the lazy field only exists while the camera is deep inside
    // the disk, exactly where a size-attenuated halo turns into white mush.
    if (!_lazyStarTex) _lazyStarTex = dotTexture();
    return _lazyStarTex;
  }

  function createLazyStarField(dataManager, opts) {
    opts = opts || {};
    const group = new THREE.Group();
    group.name = "gx-lazyfield";
    const U = GAL.U, SUN_R = GAL.SUN_R;
    const DM = window.GalaxySim.DataManager;
    // A procedural galaxy streams its OWN stars through this same machinery
    // (see buildProceduralGalaxy). It differs only in the frame it works in:
    // the Milky Way's chunks are light-years around the Sun and have to be
    // mapped into the galactic frame, a procedural galaxy's are world units
    // around its own centre and go in as they are. `galaxySeed` selects that.
    const galaxySeed = opts.galaxySeed != null ? opts.galaxySeed : null;
    const local = galaxySeed != null;
    const CHUNK = local
      ? ((DM && DM.GALAXY_LAZY_CHUNK) || 60)
      : ((DM && DM.LAZY_CHUNK_LY) || 64);
    const ENABLE_DIST = opts.enableDist || 250;  // world units: only populate when zoomed in
    const LOAD_RADIUS_LY = opts.loadRadius || 320; // disk-plane radius of the loaded region
    const STAR_SIZE = opts.starSize || 2.4;
    const MAX_CHUNKS = 130;
    const MAX_SYSTEMS = 4000;

    // Persistent max-size buffers + a single Points object. Panning across
    // chunk regions only rewrites these arrays and the draw range instead of
    // disposing and rebuilding the whole geometry/material/texture every time.
    let points = null;
    let count = 0;
    let byIndex = [];
    let activeKey = "__none__";
    const tmpC = new THREE.Color();
    const posArr = new Float32Array(MAX_SYSTEMS * 3);
    const colArr = new Float32Array(MAX_SYSTEMS * 3);

    function ensurePoints() {
      if (points) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
      geo.setDrawRange(0, 0);
      points = new THREE.Points(geo, makePointsMaterial(STAR_SIZE, lazyStarTexture(), 1, false));
      points.frustumCulled = false;
      points.renderOrder = 2;
      points.name = "gx-lazy-stars";
      group.add(points);
    }

    // Hide the field without tearing down the persistent geometry/material.
    function clearPoints() {
      count = 0;
      byIndex = [];
      if (points) points.geometry.setDrawRange(0, 0);
    }

    function rebuild(chunks) {
      const systems = [];
      for (const c of chunks) {
        const arr = local
          ? dataManager.generateGalaxyLazyChunk(galaxySeed, c[0], c[1])
          : dataManager.generateLazyChunk(c[0], c[1]);
        for (let i = 0; i < arr.length; i++) {
          const s = arr[i];
          // The Milky Way draws its static catalogue as a separate cloud, so a
          // name already in `systems` is on screen twice if it is drawn again.
          // A galaxy's own field shares no name with its 220 static systems,
          // and skipping on this test there would delete each streamed star the
          // moment visiting it materialized the name.
          if (!local && dataManager.systems.has(s.name)) continue;
          systems.push(s);
        }
        if (systems.length >= MAX_SYSTEMS) break;
      }
      const n = Math.min(systems.length, MAX_SYSTEMS);
      if (!n) { clearPoints(); return; }
      ensurePoints();
      byIndex = new Array(n);
      for (let i = 0; i < n; i++) {
        const s = systems[i];
        const p = s.position;
        if (local) {
          // Already this galaxy's own world units, laid out x/z across the disk.
          posArr[i * 3] = p.x || 0;
          posArr[i * 3 + 1] = p.y || 0;
          posArr[i * 3 + 2] = p.z || 0;
        } else {
          posArr[i * 3] = (SUN_R + (p.x || 0)) / U;
          posArr[i * 3 + 1] = (p.z || 0) / U;
          posArr[i * 3 + 2] = (p.y || 0) / U;
        }
        tmpC.set(s.color || "#ffffff");
        colArr[i * 3] = tmpC.r; colArr[i * 3 + 1] = tmpC.g; colArr[i * 3 + 2] = tmpC.b;
        byIndex[i] = s;
      }
      count = n;
      const geo = points.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, n);
      // Bounds recompute (over the whole buffer) keeps the raycaster's sphere
      // pre-test conservative; frustumCulled is off so points never vanish.
      geo.computeBoundingSphere();
    }

    function update(focusWorld, distance) {
      if (!focusWorld || distance > ENABLE_DIST) {
        if (activeKey !== "__none__") { activeKey = "__none__"; clearPoints(); }
        return;
      }
      // World focus -> disk-plane coordinates -> chunk indices. The galactic
      // frame needs the Sun offset undone first; a galaxy's own frame does not.
      const planeX = local ? focusWorld.x : focusWorld.x * U - SUN_R;
      const planeZ = local ? focusWorld.z : focusWorld.z * U;
      const fcx = Math.floor(planeX / CHUNK);
      const fcz = Math.floor(planeZ / CHUNK);
      const r = Math.ceil(LOAD_RADIUS_LY / CHUNK);
      const key = fcx + ":" + fcz + ":" + r;
      if (key === activeKey) return; // still inside the same loaded region
      activeKey = key;

      const chunks = [];
      const r2 = (r + 0.5) * (r + 0.5);
      for (let dx = -r; dx <= r && chunks.length < MAX_CHUNKS; dx++) {
        for (let dz = -r; dz <= r && chunks.length < MAX_CHUNKS; dz++) {
          if (dx * dx + dz * dz > r2) continue; // circular load region
          chunks.push([fcx + dx, fcz + dz]);
        }
      }
      rebuild(chunks);
    }

    return {
      group,
      update,
      systemAt(i) { return byIndex[i]; },
      // Only expose the cloud for picking when it currently has drawn points,
      // preserving the previous null-when-empty behaviour.
      get points() { return count > 0 ? points : null; },
      dispose() {
        if (points) {
          group.remove(points);
          points.geometry.dispose();
          // The shared star texture (module cache) is intentionally left alive.
          points.material.dispose();
          points = null;
        }
        count = 0;
        byIndex = [];
        if (group.parent) group.parent.remove(group);
      },
    };
  }

  // A filled glow (bright core -> tint -> transparent). makeHighlightSprite is
  // deliberately hollow in the middle, which reads as a *ring* - right for a
  // selection marker, wrong for anything meant to look like light.
  // The texture is shared per colour (a nebula's protostars all ask for the
  // same warm glow), but every caller gets its OWN material: the pulse that
  // makes a protostar breathe writes mat.opacity, and one material shared
  // across a whole galaxy's worth of them would pulse as a single light.
  function makeGlowSprite(hex) {
    const tex = sharedTexture("glow:" + hex, () => {
      const s = 128;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0.0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.22, hex);
      g.addColorStop(0.6, hex.replace(/[\d.]+\)$/, "0.18)"));
      g.addColorStop(1.0, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(cv);
    });
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 4, 1);
    return { sprite, tex, mat };
  }

  function makeHighlightSprite(hex) {
    const tex = sharedTexture("highlight:" + hex, () => {
      const s = 64;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.55, hex);
      g.addColorStop(0.72, hex);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(cv);
    });
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 4, 1);
    return { sprite, tex, mat };
  }

  // ==========================================================================
  // Far scales (LOCAL_GROUP .. UNIVERSE_SPHERE). Decorative, non-interactive,
  // centred at the origin. Each returns { group, animate(t), dispose() } and a
  // suggested framing radius in world units (config lives in Scene3D).
  // ==========================================================================

  // A fuzzy galaxy billboard (soft elliptical glow with a bright core).
  // The galaxy blob every far-scale billboard wears. GAL_PALETTE holds four
  // distinct colour pairs, so four textures cover every galaxy in the game.
  function galaxyTexture(coreHex, haloHex) {
    const core = coreHex || "rgba(255,245,220,0.95)";
    const halo = haloHex || "rgba(150,180,255,0.35)";
    return sharedTexture("galaxy:" + core + "|" + halo, () => {
      const s = 96;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.18, core);
      g.addColorStop(0.55, halo);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(cv);
    });
  }

  function galaxyBillboard(coreHex, haloHex, sx, sy) {
    const tex = galaxyTexture(coreHex, haloHex);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(sx, sy, 1);
    return sprite;
  }

  // A dedicated look for the Milky Way's own Local Group billboard: the same
  // bright-core-plus-halo glow every galaxy sprite gets, but with a warm
  // bar and a few faint logarithmic-spiral arm streaks drawn over it, so our
  // own galaxy reads as a barred spiral at a glance instead of the same
  // featureless blob every other billboard in the view is.
  function milkyWayBillboardTexture() {
    return sharedTexture("milkyWayBillboard", () => {
    const s = 160;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const cx = s / 2, cy = s / 2;
    radialFill(ctx, cx, cy, s * 0.5, [
      [0, "rgba(255,255,255,1)"], [0.14, "rgba(255,244,214,0.9)"],
      [0.4, "rgba(150,180,255,0.32)"], [1, "rgba(0,0,0,0)"],
    ]);
    ctx.filter = "blur(2.5px)";
    const arms = 3;
    for (let a = 0; a < arms; a++) {
      ctx.strokeStyle = a % 2 === 0 ? "rgba(190,210,255,0.42)" : "rgba(255,235,205,0.32)";
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      const base = (a / arms) * Math.PI * 2;
      for (let t = 0, first = true; t <= 1; t += 0.08) {
        const ang = base + t * 2.6;
        const r = s * 0.06 + t * s * 0.4;
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.55;
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.filter = "none";
    // Warm bar across the core.
    radialFill(ctx, cx, cy, s * 0.16, [
      [0, "rgba(255,248,224,0.95)"], [0.6, "rgba(255,222,170,0.5)"], [1, "rgba(0,0,0,0)"],
    ]);
    return new THREE.CanvasTexture(cv);
    });
  }

  function milkyWayLocalGroupBillboard(sx, sy) {
    const mat = new THREE.SpriteMaterial({
      map: milkyWayBillboardTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(sx, sy, 1);
    return sprite;
  }

  function pointCloud(positions, colors, size, opacity, crisp) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = crisp
      ? makePointsMaterial(size, dotTexture(), opacity, false)
      : makePointsMaterial(size, starTexture(), opacity);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  // Scatter `n` galaxy billboards within a clustered volume of `radius`.
  function scatterGalaxies(group, n, radius, rnd, palette, sizeRange) {
    for (let i = 0; i < n; i++) {
      // Clustered radial falloff so the volume reads structured, not uniform.
      const rr = Math.pow(rnd(), 1.6) * radius;
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const pal = palette[(rnd() * palette.length) | 0];
      const sz = sizeRange[0] + rnd() * (sizeRange[1] - sizeRange[0]);
      const gb = galaxyBillboard(pal[0], pal[1], sz, sz * (0.5 + rnd() * 0.5));
      gb.position.set(Math.cos(th) * s * rr, u * rr * 0.7, Math.sin(th) * s * rr);
      gb.material.rotation = rnd() * Math.PI;
      group.add(gb);
    }
  }

  const GAL_PALETTE = [
    ["rgba(255,245,220,0.95)", "rgba(150,180,255,0.35)"], // spiral
    ["rgba(255,236,200,0.95)", "rgba(255,210,160,0.30)"], // elliptical warm
    ["rgba(220,235,255,0.95)", "rgba(120,160,255,0.35)"], // blue
    ["rgba(255,220,235,0.95)", "rgba(255,150,200,0.30)"], // pink dwarf
  ];

  // Named hero objects at the far scales are selectable: Scene3D screen-picks
  // this list exactly like it picks planets, so the player can inspect (and
  // target) a galaxy or cluster instead of staring at anonymous billboards.
  // `radius` is the world-space size used for the screen-space hit test.
  function addPickable(list, object, radius, data) {
    list.push({ object, radius, kind: data.kind || "galaxy", data });
    return object;
  }

  // ==========================================================================
  // Every hardcoded far-scale object, declared ONCE. The builders below hand
  // these exact records to addPickable, and catalogEntries() hands the same
  // records (plus the scale they live at) to the in-game catalog - so the
  // catalog can target an object whose view has not been built yet, and the two
  // can never drift apart.
  // ==========================================================================
  // i18n-ignore-start  astronomical reference data: proper nouns, catalogue
  // designations and measurements. The `type` field is display copy and is
  // resolved as a shared vocabulary (Galaxy.bodyType) where the Overlay
  // draws it, so the record itself keeps the English id.
  const CAT = {
    localGroup: [
      { name: "Milky Way", type: "barred spiral galaxy", home: true,
        diameter: "105,700 ly", stars: "~200 billion", distance: "0 ly (home)" },
      { name: "Andromeda (M31)", type: "barred spiral galaxy",
        diameter: "152,000 ly", stars: "~1 trillion", distance: "2.54 Mly" },
      { name: "Triangulum (M33)", type: "spiral galaxy",
        diameter: "60,000 ly", stars: "~40 billion", distance: "2.73 Mly" },
      { name: "Large Magellanic Cloud", type: "dwarf irregular galaxy",
        diameter: "32,200 ly", stars: "~20 billion", distance: "163 kly" },
      { name: "Small Magellanic Cloud", type: "dwarf irregular galaxy",
        diameter: "18,900 ly", stars: "~3 billion", distance: "199 kly" },
    ],
    // The rest of the Local Group: real named dwarf satellites, in place of
    // what used to be unlabeled procedural filler (see buildLocalGroup).
    // `assoc` is a placement hint, not display copy: "mw" scatters around
    // the Milky Way's own billboard by real Sun-distance, "m31" clusters
    // tightly around Andromeda's billboard instead (real Sun-distances for
    // Andromeda's satellites differ from Andromeda's own by only a fraction
    // of what this view's scale would resolve, so what actually reads right
    // is "near M31", not the noise in exactly how near), and "iso" scatters
    // by Sun-distance like the Milky Way's own satellites. A number of the
    // faintest recently catalogued dwarfs are left out rather than guessed
    // at; distances are approximate, from the Sun, in thousand light-years.
    localGroupDwarfs: [
      { name: "Sagittarius Dwarf Spheroidal", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 70,
        diameter: "~3,000 ly", stars: "~tens of millions", distance: "70 kly" },
      { name: "Ursa Minor Dwarf", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 200,
        diameter: "~1,300 ly", stars: "~a few million", distance: "200 kly" },
      { name: "Draco Dwarf", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 250,
        diameter: "~1,100 ly", stars: "~a few million", distance: "250 kly" },
      { name: "Sculptor Dwarf", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 290,
        diameter: "~1,700 ly", stars: "~a few million", distance: "290 kly" },
      { name: "Sextans Dwarf", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 290,
        diameter: "~3,500 ly", stars: "~a few million", distance: "290 kly" },
      { name: "Carina Dwarf", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 330,
        diameter: "~1,600 ly", stars: "~a few million", distance: "330 kly" },
      { name: "Fornax Dwarf", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 460,
        diameter: "~3,000 ly", stars: "~tens of millions", distance: "460 kly" },
      { name: "Leo II", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 700,
        diameter: "~1,700 ly", stars: "~a few million", distance: "700 kly" },
      { name: "Leo I", type: "dwarf spheroidal galaxy", assoc: "mw", distKly: 820,
        diameter: "~2,000 ly", stars: "~tens of millions", distance: "820 kly" },
      { name: "Phoenix Dwarf", type: "dwarf irregular galaxy", assoc: "mw", distKly: 860,
        diameter: "~2,000 ly", stars: "~a few million", distance: "860 kly" },
      { name: "Antlia Dwarf", type: "dwarf spheroidal galaxy", assoc: "iso", distKly: 1290,
        diameter: "~1,300 ly", stars: "~a few million", distance: "1,290 kly" },
      { name: "NGC 6822 (Barnard's Galaxy)", type: "dwarf irregular galaxy", assoc: "iso", distKly: 1630,
        diameter: "~7,000 ly", stars: "~billions", distance: "1,630 kly" },
      { name: "Cetus Dwarf", type: "dwarf spheroidal galaxy", assoc: "iso", distKly: 2460,
        diameter: "~1,400 ly", stars: "~a few million", distance: "2.46 Mly" },
      { name: "Leo A", type: "dwarf irregular galaxy", assoc: "iso", distKly: 2600,
        diameter: "~2,500 ly", stars: "~tens of millions", distance: "2.6 Mly" },
      { name: "Tucana Dwarf", type: "dwarf spheroidal galaxy", assoc: "iso", distKly: 2870,
        diameter: "~1,600 ly", stars: "~a few million", distance: "2.87 Mly" },
      { name: "WLM (Wolf-Lundmark-Melotte)", type: "dwarf irregular galaxy", assoc: "iso", distKly: 3000,
        diameter: "~8,000 ly", stars: "~hundreds of millions", distance: "3 Mly" },
      { name: "Pegasus Dwarf Irregular", type: "dwarf irregular galaxy", assoc: "iso", distKly: 3000,
        diameter: "~3,000 ly", stars: "~tens of millions", distance: "3 Mly" },
      { name: "Aquarius Dwarf", type: "dwarf irregular galaxy", assoc: "iso", distKly: 3250,
        diameter: "~3,500 ly", stars: "~a few million", distance: "3.25 Mly" },
      { name: "Sagittarius Dwarf Irregular", type: "dwarf irregular galaxy", assoc: "iso", distKly: 3530,
        diameter: "~2,000 ly", stars: "~a few million", distance: "3.53 Mly" },
      { name: "NGC 3109", type: "dwarf irregular galaxy", assoc: "iso", distKly: 4340,
        diameter: "~19,000 ly", stars: "~hundreds of millions", distance: "4.34 Mly" },
      { name: "Sextans A", type: "dwarf irregular galaxy", assoc: "iso", distKly: 4300,
        diameter: "~5,000 ly", stars: "~tens of millions", distance: "4.3 Mly" },
      { name: "Sextans B", type: "dwarf irregular galaxy", assoc: "iso", distKly: 4520,
        diameter: "~5,700 ly", stars: "~tens of millions", distance: "4.52 Mly" },
      { name: "M32 (NGC 221)", type: "compact elliptical galaxy", assoc: "m31", distKly: 2490,
        diameter: "~6,500 ly", stars: "~a few billion", distance: "2.49 Mly" },
      { name: "M110 (NGC 205)", type: "dwarf elliptical galaxy", assoc: "m31", distKly: 2490,
        diameter: "~17,000 ly", stars: "~tens of billions", distance: "2.49 Mly" },
      { name: "NGC 147", type: "dwarf spheroidal galaxy", assoc: "m31", distKly: 2530,
        diameter: "~10,000 ly", stars: "~hundreds of millions", distance: "2.53 Mly" },
      { name: "NGC 185", type: "dwarf spheroidal galaxy", assoc: "m31", distKly: 2080,
        diameter: "~8,000 ly", stars: "~hundreds of millions", distance: "2.08 Mly" },
      { name: "IC 10", type: "dwarf irregular (starburst) galaxy", assoc: "m31", distKly: 2200,
        diameter: "~5,000 ly", stars: "~hundreds of millions", distance: "2.2 Mly" },
      { name: "IC 1613", type: "dwarf irregular galaxy", assoc: "m31", distKly: 2380,
        diameter: "~10,000 ly", stars: "~hundreds of millions", distance: "2.38 Mly" },
      { name: "Andromeda I", type: "dwarf spheroidal galaxy", assoc: "m31", distKly: 2400,
        diameter: "~2,000 ly", stars: "~a few million", distance: "2.4 Mly" },
      { name: "Andromeda II", type: "dwarf spheroidal galaxy", assoc: "m31", distKly: 1750,
        diameter: "~2,300 ly", stars: "~tens of millions", distance: "1.75 Mly" },
      { name: "Andromeda III", type: "dwarf spheroidal galaxy", assoc: "m31", distKly: 2440,
        diameter: "~1,600 ly", stars: "~a few million", distance: "2.44 Mly" },
      { name: "Andromeda VI (Pegasus Dwarf Spheroidal)", type: "dwarf spheroidal galaxy", assoc: "m31", distKly: 2280,
        diameter: "~1,600 ly", stars: "~a few million", distance: "2.28 Mly" },
      { name: "Andromeda VII (Cassiopeia Dwarf)", type: "dwarf spheroidal galaxy", assoc: "m31", distKly: 2320,
        diameter: "~3,000 ly", stars: "~tens of millions", distance: "2.32 Mly" },
    ],
    supercluster: [
      { name: "Local Group", type: "galaxy group", kind: "cluster", home: true,
        rich: 80,
        diameter: "10 Mly", members: "~80 galaxies", distance: "0 (home)" },
      { name: "Virgo Cluster", type: "galaxy cluster", kind: "cluster",
        rich: 1300,
        diameter: "15 Mly", members: "~1,300 galaxies", distance: "53.8 Mly" },
      { name: "Great Attractor", type: "gravitational anomaly", kind: "cluster",
        rich: 600,
        diameter: "~300 Mly of infall", members: "Norma Cluster, ~600 galaxies",
        distance: "250 Mly" },
    ],
    // Laniakea's own parts, clusters and groups are DATA, not code: they live
    // in js/db/GalaxySim/Laniakea.json and reach here as window.GalaxySim
    // .Laniakea (see laniakeaData). They were briefly duplicated in this
    // object, which is one copy too many for a set of measured numbers.
    observable: [
      { name: "Observable Universe", type: "cosmological horizon", kind: "cluster",
        diameter: "93 Gly", members: "~2 trillion galaxies",
        distance: "13.8 Gly to the horizon" },
    ],
    universe: [
      { name: "The Hypercube", type: "higher-dimensional anomaly", kind: "anomaly",
        diameter: "unmeasurable", members: "1", distance: "beyond the horizon" },
      { name: "Anomaly A-700", type: "higher-dimensional anomaly", kind: "anomaly",
        diameter: "unmeasurable", members: "unclassified", distance: "beyond the horizon" },
      { name: "Anomaly B-753", type: "higher-dimensional anomaly", kind: "anomaly",
        diameter: "unmeasurable", members: "unclassified", distance: "beyond the horizon" },
      { name: "Anomaly C-806", type: "higher-dimensional anomaly", kind: "anomaly",
        diameter: "unmeasurable", members: "unclassified", distance: "beyond the horizon" },
    ],
  };

  /**
   * Flat catalog of every hardcoded far-scale object, each tagged with the
   * SCALE_* level that owns it. Scene3D turns these into camera targets.
   */
  // i18n-ignore-end

  function catalogEntries() {
    const out = [];
    const push = (scale, list) => {
      if (scale == null) return;
      list.forEach((data) => out.push({ scale, kind: data.kind || "galaxy", data }));
    };
    push(M.SCALE_LOCAL_GROUP, CAT.localGroup);
    push(M.SCALE_LOCAL_GROUP, CAT.localGroupDwarfs);
    push(M.SCALE_SUPERCLUSTER, CAT.supercluster);
    push(M.SCALE_OBSERVABLE, CAT.observable);
    push(M.SCALE_UNIVERSE_SPHERE, CAT.universe);
    // Famous nebulae live at galaxy scale, right alongside the star systems
    // they're named after.
    FAMOUS_NEBULAE.forEach((spec) => out.push({ scale: M.SCALE_GALAXY, kind: "nebula", data: spec }));
    return out;
  }

  function buildLocalGroup(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed || 31337);
    const group = new THREE.Group();
    group.name = "gx-localgroup";
    const pickables = [];

    // Milky Way (home) at the origin + Andromeda + Triangulum + Magellanic.
    // Our own galaxy gets a dedicated look (see milkyWayLocalGroupBillboard)
    // rather than the plain radial-gradient blob every other galaxy sprite
    // uses, so it reads as itself - a barred spiral with real arm structure
    // - at a glance instead of blending into the crowd.
    // This scale is 5 kly to the unit (World3D LY_PER_UNIT), so every distance
    // here is a real one divided by five: the Local Group used to be laid out
    // by eye, with Andromeda at 743 units where its own 2,537 kly put it at
    // 507, and the dwarfs on a different scale again (KLY_SCALE 0.18) from the
    // giants they orbit.
    const KLY_PER_UNIT = 5;
    const at = (distKly, lDeg, bDeg) => {
      const r = distKly / KLY_PER_UNIT;
      const l = (lDeg * Math.PI) / 180, b = (bDeg * Math.PI) / 180;
      return [Math.cos(b) * Math.cos(l) * r, Math.sin(b) * r, Math.cos(b) * Math.sin(l) * r];
    };

    const mw = milkyWayLocalGroupBillboard(220, 130);
    group.add(mw);
    addPickable(pickables, mw, 110, CAT.localGroup[0]);
    // M31: 2,537 kly away toward galactic (l 121, b -22).
    const andromeda = galaxyBillboard("rgba(255,240,210,0.95)", "rgba(160,190,255,0.4)", 300, 170);
    andromeda.position.set(...at(2537, 121.2, -21.6));
    andromeda.material.rotation = 0.6;
    group.add(andromeda);
    addPickable(pickables, andromeda, 150, CAT.localGroup[1]);
    // M33: 2,730 kly, (l 134, b -31).
    const triangulum = galaxyBillboard("rgba(220,235,255,0.95)", "rgba(130,170,255,0.35)", 150, 95);
    triangulum.position.set(...at(2730, 133.6, -31.3));
    group.add(triangulum);
    addPickable(pickables, triangulum, 75, CAT.localGroup[2]);
    // The Magellanic Clouds: 163 and 206 kly, both well south of the plane.
    [[163, 280.5, -32.9], [206, 302.8, -44.3]].forEach((mc, i) => {
      const lmc = galaxyBillboard("rgba(230,240,255,0.9)", "rgba(150,180,255,0.3)", 50 - i * 14, 38 - i * 10);
      lmc.position.set(...at(mc[0], mc[1], mc[2]));
      group.add(lmc);
      addPickable(pickables, lmc, 25 - i * 7, CAT.localGroup[3 + i]);
    });

    // The rest of the Local Group: real named dwarf satellites (see
    // CAT.localGroupDwarfs) in place of what used to be 55 unlabeled
    // procedural filler galaxies. Andromeda's own satellites cluster tightly
    // around its billboard; the Milky Way's satellites and the isolated
    // members scatter around the origin by their real Sun-distance instead
    // (see the comment on CAT.localGroupDwarfs for why the two are placed
    // differently).
    CAT.localGroupDwarfs.forEach((d) => {
      const sz = 10 + rnd() * 16;
      const pal = GAL_PALETTE[(rnd() * GAL_PALETTE.length) | 0];
      const gb = galaxyBillboard(pal[0], pal[1], sz, sz * (0.6 + rnd() * 0.4));
      gb.material.rotation = rnd() * Math.PI;
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      if (d.assoc === "m31") {
        const r = 45 + rnd() * 170;
        gb.position.set(
          andromeda.position.x + Math.cos(th) * s * r,
          andromeda.position.y + u * r * 0.6,
          andromeda.position.z + Math.sin(th) * s * r);
      } else {
        const r = Math.max(12, d.distKly / KLY_PER_UNIT);
        gb.position.set(Math.cos(th) * s * r, u * r * 0.7, Math.sin(th) * s * r);
      }
      group.add(gb);
      addPickable(pickables, gb, Math.max(sz * 0.6, 9), d);
    });

    // An intergalactic point haze - ambient dust, not a galaxy of its own.
    {
      const n = 2200;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const rr = Math.pow(rnd(), 0.7) * 950, u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        pos[i * 3] = Math.cos(th) * s * rr; pos[i * 3 + 1] = u * rr * 0.8; pos[i * 3 + 2] = Math.sin(th) * s * rr;
        const w = 0.2 + rnd() * 0.3; col[i * 3] = 0.8 * w; col[i * 3 + 1] = 0.85 * w; col[i * 3 + 2] = 1.0 * w;
      }
      group.add(pointCloud(pos, col, 4, 0.5));
    }

    const hi = makeHighlightSprite("#7fd0ff");
    hi.sprite.scale.set(120, 120, 1); // steady marker on the home galaxy
    group.add(hi.sprite);
    function animate() {}
    return { group, animate, pickables, dispose: () => disposeObject3D(group), radius: 1000 };
  }

  // ==========================================================================
  // Laniakea, the supercluster the Milky Way belongs to.
  //
  // This was a ball: a sphere of 2,600 points with three sprites in it, framed
  // at 1.6 Gly for a structure 500 Mly across. A supercluster is not a ball and
  // is not defined by a boundary at all - it is a BASIN, the volume whose
  // galaxies are all falling the same way, and what makes it one object is that
  // flow. So it is drawn as its flow: a flattened sheet of galaxies threaded on
  // streamlines that all bend toward the Great Attractor at the bottom of it.
  //
  // The scale is 0.25 Mly to the unit (World3D LY_PER_UNIT), so everything here
  // is a real distance divided by 250,000 ly.
  // ==========================================================================
  // ==========================================================================
  // What a supercluster IS, and how one is drawn.
  //
  // Laniakea is the measured case and every other supercluster in the game is
  // built to its shape, so the numbers live in one place: js/db/GalaxySim/
  // Laniakea.json, read through window.GalaxySim.Laniakea.
  //
  //   ~520 Mly across, ~1e17 suns, ~100,000 galaxies,
  //   300 to 500 known clusters and groups,
  //   and it is not one lump but several constituent superclusters.
  //
  // A hundred thousand galaxies is a number no scene can spend a sprite, a
  // material or a draw call on, so they are ONE THREE.Points: one geometry,
  // one material, built once and never touched again. At 3 floats of position
  // and 3 of colour that is 2.4 MB in, 2.4 MB of colour, one draw call.
  // ==========================================================================
  const SUPERCLUSTER_GALAXIES = 100000;
  // The real count of known clusters and groups in one. Only a few dozen of
  // them have names; the rest are the small groups most galaxies actually live
  // in, and they are generated along the filaments (see buildSuperclusterField).
  const SUPERCLUSTER_GROUPS = 400;

  /** The measured Laniakea record, or null when the database is not loaded. */
  function laniakeaData() {
    const d = window.GalaxySim && window.GalaxySim.Laniakea;
    return (d && Array.isArray(d.groups)) ? d : null;
  }

  /**
   * Fill a supercluster's volume with galaxies.
   *
   * Where they go matters more than how many there are. Only about 4% of a
   * supercluster's galaxies are in its named rich clusters - the rest are in
   * hundreds of small unnamed groups strung along the filaments, plus a thin
   * field between them. Scattering 100,000 points evenly through a ball would
   * be both wrong and dull; this puts them where galaxies are.
   *
   * @param {Array} knots   [{pos, rich, spread}] the named clusters and groups
   * @param {Array} strands [[Vector3, Vector3]] the filaments to hang the rest on
   * @returns {{points: THREE.Points, groups: number}}
   */
  function buildSuperclusterField(knots, strands, rnd, R, opts) {
    opts = opts || {};
    const n = opts.count || SUPERCLUSTER_GALAXIES;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let i = 0;

    const put = (x, y, z, r, g, b) => {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      i++;
    };
    // A knot of galaxies around a centre, concentrated toward the middle.
    //
    // A hundred thousand of these are placed per supercluster, so the way a
    // point inside a ball is picked is worth caring about: the textbook
    // spherical form costs a sin, a cos and two square roots EACH, which at
    // this count is most of the build. Rejection sampling out of the enclosing
    // cube costs three random numbers and a comparison, takes about half its
    // throws, and needs no trigonometry at all.
    const clump = (c, count, spread, warm) => {
      const cx = c.x, cy = c.y, cz = c.z;
      const r1 = warm ? 1.0 : 0.88, b1 = warm ? 0.84 : 1.0;
      for (let k = 0; k < count && i < n; k++) {
        let x = 0, y = 0, z = 0, q = 2;
        // At most a few throws in practice; the guard is for the pathological.
        for (let tries = 0; tries < 8; tries++) {
          x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1;
          q = x * x + y * y + z * z;
          if (q <= 1) break;
        }
        if (q > 1) { const inv = 1 / Math.sqrt(q); x *= inv; y *= inv; z *= inv; q = 1; }
        // q is the squared radius already, so squaring it again concentrates
        // the knot toward its middle without a Math.pow.
        const rr = q * q * spread;
        const w = 0.4 + rnd() * 0.6;
        put(cx + x * rr, cy + y * rr * 0.8, cz + z * rr, r1 * w, 0.93 * w, b1 * w);
      }
    };

    // 1. The named clusters and groups, each with the count it really has.
    let named = 0;
    for (const k of knots) named += k.rich;
    for (const k of knots) clump(k.pos, k.rich, k.spread, true);

    // 2. The unnamed groups: hundreds of them, sitting ON the filaments, which
    //    is where most of a supercluster's galaxies live.
    const unnamed = Math.max(0, (opts.groups || SUPERCLUSTER_GROUPS) - knots.length);
    const inGroups = Math.floor((n - named) * 0.66);
    const perGroup = unnamed > 0 ? Math.max(3, Math.round(inGroups / unnamed)) : 0;
    const scratch = new THREE.Vector3();
    for (let g = 0; g < unnamed && i < n; g++) {
      const strand = strands[(rnd() * strands.length) | 0];
      if (!strand) break;
      const a = strand[0], b = strand[1];
      const t = rnd();
      const off = R * 0.02;
      scratch.set(
        a.x + (b.x - a.x) * t + (rnd() + rnd() - 1) * off,
        a.y + (b.y - a.y) * t + (rnd() + rnd() - 1) * off * 0.6,
        a.z + (b.z - a.z) * t + (rnd() + rnd() - 1) * off);
      // Small groups outnumber big ones, steeply.
      const size = Math.max(3, Math.round(perGroup * Math.pow(rnd(), 1.8) * 2.4));
      clump(scratch, size, R * (0.004 + rnd() * 0.012), false);
    }

    // 3. Whatever is left is the field: galaxies on the filaments themselves,
    //    belonging to no group at all. Zooming in on a strand has to show
    //    galaxies strung along it even between the knots.
    const field = Math.floor((n - i) * 0.75);
    const endField = i + field;
    for (; i < endField && i < n; ) {
      const strand = strands[(rnd() * strands.length) | 0];
      if (!strand) break;
      const a = strand[0], b = strand[1];
      const t = rnd();
      const off = R * 0.012;
      const w = 0.3 + rnd() * 0.45;
      put(a.x + (b.x - a.x) * t + (rnd() + rnd() - 1) * off,
        a.y + (b.y - a.y) * t + (rnd() + rnd() - 1) * off * 0.5,
        a.z + (b.z - a.z) * t + (rnd() + rnd() - 1) * off,
        0.86 * w, 0.9 * w, 1.0 * w);
    }
    // 4. And a thin haze right through the sheet, so the voids read as empty
    //    rather than as the edge of the drawing.
    // The sheet: a flat disc of field galaxies. Sampled the same way, in the
    // plane, so the whole fill stays free of trigonometry.
    for (; i < n; ) {
      let x = 0, z = 0, q = 2;
      for (let tries = 0; tries < 8; tries++) {
        x = rnd() * 2 - 1; z = rnd() * 2 - 1;
        q = x * x + z * z;
        if (q <= 1 && q > 1e-6) break;
      }
      if (q > 1 || q <= 1e-6) { x = 0.7; z = 0.7; q = 0.98; }
      // A gentle outward bias, standing in for the old radial power curve.
      const k = (0.35 + 0.65 * q) * R * 1.05 / Math.sqrt(q);
      const w = 0.12 + rnd() * 0.2;
      put(x * k, (rnd() + rnd() + rnd() - 1.5) / 1.5 * R * 0.13, z * k,
        0.8 * w, 0.85 * w, 1.0 * w);
    }

    // --- Every one of them is a place ---------------------------------------
    // A hundred thousand points, and each is a galaxy the player can select,
    // fly to and go inside. Keeping a record for each would be a hundred
    // thousand objects nobody ever looks at, so a particle's identity is
    // DERIVED from its index the moment something asks: the name is stable, the
    // seed behind it is stable, and so the galaxy it opens into is always the
    // same one (see buildProceduralGalaxy / galaxySeedFromName).
    const base = opts.name || T('Galaxy.scale.unnamedGalaxy');
    const fieldSeed = (opts.seed || 1) >>> 0;
    const tier = opts.tier || 0;
    const MORPH = [
      // Roughly the real mix: most galaxies are spirals or dwarfs, the big
      // ellipticals are the minority that live in cluster cores.
      "spiral galaxy", "spiral galaxy", "barred spiral galaxy",           // i18n-ignore  body-type ids
      "dwarf irregular galaxy", "dwarf irregular galaxy", "elliptical galaxy",  // i18n-ignore  body-type ids
    ];
    function galaxyAt(index) {
      const k = index | 0;
      if (k < 0 || k >= i) return null;
      const r = lcg((fieldSeed ^ (k * 2654435761)) >>> 0);
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const morph = MORPH[(r() * MORPH.length) | 0];
      const dwarf = morph.indexOf("dwarf") === 0;
      return {
        name: base + " G-" + k,
        type: morph,
        kind: "galaxy",
        tier,
        diameter: T('Galaxy.unit.thousandLy', {
          n: dwarf ? Math.round(3 + r() * 20) : Math.round(30 + r() * 170) }),
        stars: T('Galaxy.unit.billionStars', {
          n: dwarf ? Math.max(1, Math.round(r() * 4)) : Math.round(10 + r() * 800) }),
        // Units here are the supercluster frame; 0.25 Mly to the unit.
        distance: T('Galaxy.unit.mly', {
          n: Math.round(Math.sqrt(x * x + y * y + z * z) * 0.25) }),
      };
    }

    const points = pointCloud(pos, col, 2.0, 0.9);
    points.name = "gx-supercluster-galaxies";
    // Picking reads the live cloud, so it must never be culled out from under
    // the raycast when the camera is inside the structure.
    points.frustumCulled = false;
    return { points, groups: knots.length + unnamed, galaxyAt, count: i };
  }

  // ==========================================================================
  // Laniakea itself.
  //
  // This was a ball: 2,600 points and three sprites, framed at 1.6 Gly for a
  // structure 500 Mly across. A supercluster is not a ball and is not defined
  // by a boundary at all - it is a BASIN, the volume whose galaxies all fall
  // the same way, and the flow is what makes it one object. So it is drawn as
  // its flow, and it holds its real members: the Local Group is one of dozens.
  //
  // 0.25 Mly to the world unit (World3D LY_PER_UNIT), so every position here is
  // a real distance in Mly times four. Nothing in this frame exceeds ~1,100
  // units, which keeps every coordinate far inside float32's exact range.
  // ==========================================================================
  function buildSupercluster(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed || 60606);
    const group = new THREE.Group();
    group.name = "gx-supercluster";
    const pickables = [];

    const MLY = 4;            // world units per Mly at this scale
    const R = 250 * MLY;      // Laniakea's ~250 Mly radius -> 1000 units
    const DB = laniakeaData();

    // A real direction on the sky at a real distance, in world units. The
    // database stores both the angles and the cartesian Mly; prefer the latter.
    const place = (rec, out) => {
      const v = out || new THREE.Vector3();
      if (rec && Array.isArray(rec.position)) {
        return v.set(rec.position[0] * MLY, rec.position[2] * MLY, rec.position[1] * MLY);
      }
      const mly = (rec && rec.mly) || 0;
      const l = (((rec && rec.l) || 0) * Math.PI) / 180;
      const b = (((rec && rec.b) || 0) * Math.PI) / 180;
      return v.set(Math.cos(b) * Math.cos(l) * mly * MLY, Math.sin(b) * mly * MLY,
        Math.cos(b) * Math.sin(l) * mly * MLY);
    };

    const GA = place(DB && DB.greatAttractor) ||
      new THREE.Vector3(-0.6, -0.13, 0.79).multiplyScalar(250 * MLY);

    // --- The home group, at the origin ---------------------------------------
    const home = galaxyBillboard("rgba(255,245,220,0.95)", "rgba(150,180,255,0.4)", 26, 17);
    group.add(home);
    addPickable(pickables, home, 16, CAT.supercluster[0]);

    // --- The constituent superclusters --------------------------------------
    // Laniakea is Virgo + Hydra-Centaurus + Pavo-Indus + the Southern strand +
    // the Centaurus Wall + Ophiuchus. Each is a place in its own right, and the
    // clusters below hang off the one they belong to.
    const partPos = new Map();
    ((DB && DB.parts) || []).forEach((part) => {
      const p = place(part);
      partPos.set(part.name, p);
      const sz = 20 + Math.min(52, Math.sqrt(part.rich || 1000) * 0.36);
      const gb = galaxyBillboard("rgba(226,236,255,0.7)", "rgba(120,160,255,0.22)", sz * 2.2, sz * 1.3);
      gb.position.copy(p);
      gb.material.rotation = rnd() * Math.PI;
      group.add(gb);
      addPickable(pickables, gb, sz, part);
    });

    // --- The named clusters and groups --------------------------------------
    const knots = [{ pos: new THREE.Vector3(0, 0, 0), rich: 80, spread: 5 * MLY }];
    ((DB && DB.groups) || []).forEach((rec) => {
      const p = place(rec);
      const rich = rec.rich || 40;
      const sz = 7 + Math.min(30, Math.sqrt(rich) * 1.4);
      const pal = GAL_PALETTE[(rnd() * GAL_PALETTE.length) | 0];
      const gb = galaxyBillboard(pal[0], pal[1], sz, sz * (0.55 + rnd() * 0.45));
      gb.position.copy(p);
      gb.material.rotation = rnd() * Math.PI;
      group.add(gb);
      addPickable(pickables, gb, Math.max(sz * 0.55, 9), rec);
      knots.push({ pos: p, rich, spread: Math.max(2, Math.sqrt(rich) * 0.2) * MLY });
    });

    // --- The Great Attractor, and the streamlines running into it ------------
    const ga = galaxyBillboard("rgba(255,210,180,0.9)", "rgba(255,140,120,0.4)", 70, 70);
    ga.position.copy(GA);
    group.add(ga);
    addPickable(pickables, ga, 40, CAT.supercluster[2]);

    // The basin drawn as its own flow: streamlines started out at the rim and
    // walked inward, curving toward the Attractor the whole way.
    const STREAMS = 64, STEPS = 26;
    const segs = [];
    const strands = [];
    for (let i = 0; i < STREAMS; i++) {
      const th = rnd() * Math.PI * 2;
      const u = (rnd() * 2 - 1) * 0.34;
      const sxz = Math.sqrt(Math.max(0, 1 - u * u));
      const r0 = R * (0.55 + rnd() * 0.5);
      let prev = new THREE.Vector3(
        Math.cos(th) * sxz * r0, u * r0 * 0.42, Math.sin(th) * sxz * r0);
      const swirl = (rnd() - 0.5) * 0.5;
      for (let k = 1; k <= STEPS; k++) {
        const t = k / STEPS;
        const pull = Math.pow(t, 1.35);
        const cur = new THREE.Vector3(
          prev.x + (GA.x - prev.x) * (0.055 + pull * 0.05) - Math.sin(t * 6 + swirl * 9) * R * 0.012 * (1 - t),
          prev.y + (GA.y - prev.y) * (0.075 + pull * 0.06),
          prev.z + (GA.z - prev.z) * (0.055 + pull * 0.05) + Math.cos(t * 6 + swirl * 9) * R * 0.012 * (1 - t));
        segs.push(prev, cur);
        strands.push([prev, cur]);
        prev = cur;
      }
    }
    {
      const lgeo = new THREE.BufferGeometry().setFromPoints(segs);
      const lmat = new THREE.LineBasicMaterial({
        color: 0x5f7fbe, transparent: true, opacity: 0.18, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      group.add(new THREE.LineSegments(lgeo, lmat));
    }

    // --- A hundred thousand galaxies ----------------------------------------
    const field = buildSuperclusterField(knots, strands, rnd, R);
    group.add(field.points);

    function animate() {}
    return {
      group, animate, pickables, strands, knots,
      galaxies: SUPERCLUSTER_GALAXIES, groupCount: field.groups,
      dispose: () => disposeObject3D(group), radius: R * 1.1,
    };
  }

  // ==========================================================================
  // The cosmic web. Not a ball of dots any more: a real large-scale structure
  // out to the edge of the observable universe.
  //
  //  - The view is 4600 world units across, which at this scale's 10 Mly per
  //    unit is the 46 Gly radius of the observable universe. It was 2000.
  //  - Nodes are not sprinkled uniformly. A few hundred ATTRACTORS are drawn
  //    first and gathered onto sheets; every node is then strung between a
  //    pair of them, which lays the clusters out along walls and filaments and
  //    leaves the space between them as voids, the way the real web looks.
  //  - Every node carries a TIER (GalaxySim.Math.Strangeness): 0 at home, 15
  //    at the rim. It rides down into the galaxies, systems and worlds the
  //    player finds inside it, and it is what makes the far web weird.
  // ==========================================================================
  // The observable universe holds roughly ten million superclusters. It is a
  // real number and the catalogue quotes it; what follows is how a scene draws
  // something of that size without trying to hold it.
  const OBSERVABLE_SUPERCLUSTERS = 10000000;

  /**
   * Detail streamed onto the cosmic web's filaments.
   *
   * Zooming at a strand used to arrive at a drawn line with nothing on it: the
   * web's matter sat in balls around its 4,200 nodes and the space between them
   * was empty. But superclusters lie ALONG filaments, most of them nowhere near
   * a node worth naming, and that is what the player should find on the way in.
   *
   * Ten million of them cannot be resident - 10M points is 120 MB of position
   * alone - so they are generated for the strands near the camera and thrown
   * away again, deterministically, from the strand's own index. Same bargain as
   * the Milky Way's lazy star field: one persistent buffer, one draw call, and
   * a draw range that moves.
   */
  function createWebDetail(strands, R) {
    const group = new THREE.Group();
    group.name = "gx-web-detail";
    const ENABLE_DIST = R * 0.34;      // only populate once the camera is in
    const LOAD_RADIUS = R * 0.10;      // how far around the focus to fill
    const MAX_POINTS = 60000;
    const PER_STRAND = 260;            // superclusters generated per filament
    const CACHE = 512;

    const posArr = new Float32Array(MAX_POINTS * 3);
    const colArr = new Float32Array(MAX_POINTS * 3);
    let points = null;
    let count = 0;
    let activeKey = "__none__";
    const cache = new Map();

    // One filament's worth of superclusters, deterministic from its index.
    function strandDetail(index) {
      const hit = cache.get(index);
      if (hit) return hit;
      const st = strands[index];
      const out = [];
      if (st) {
        const a = st[0], b = st[1];
        const rnd = lcg(0x5EED ^ (index * 2654435761 >>> 0));
        const off = R * 0.004;
        for (let i = 0; i < PER_STRAND; i++) {
          // Piled toward the ends, where filaments meet and clusters gather.
          let t = rnd();
          t = t < 0.5 ? Math.pow(t * 2, 1.5) * 0.5 : 1 - Math.pow((1 - t) * 2, 1.5) * 0.5;
          const spread = off * (0.35 + Math.abs(t - 0.5) * 2.4);
          out.push(
            a.x + (b.x - a.x) * t + (rnd() + rnd() - 1) * spread,
            a.y + (b.y - a.y) * t + (rnd() + rnd() - 1) * spread * 0.7,
            a.z + (b.z - a.z) * t + (rnd() + rnd() - 1) * spread,
            0.55 + rnd() * 0.45);
        }
      }
      cache.set(index, out);
      if (cache.size > CACHE) cache.delete(cache.keys().next().value);
      return out;
    }

    function ensurePoints() {
      if (points) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
      geo.setDrawRange(0, 0);
      points = new THREE.Points(geo, makePointsMaterial(1.8, dotTexture(), 0.85, false));
      points.frustumCulled = false;
      points.name = "gx-web-detail-points";
      group.add(points);
    }

    function clear() {
      count = 0;
      if (points) points.geometry.setDrawRange(0, 0);
    }

    // Distance from the focus to a strand, so "near" means near the FILAMENT
    // rather than near one of its endpoints.
    function distToStrand(f, st) {
      const a = st[0], b = st[1];
      const ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z;
      const L = ax * ax + ay * ay + az * az;
      let t = L ? ((f.x - a.x) * ax + (f.y - a.y) * ay + (f.z - a.z) * az) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = f.x - (a.x + ax * t), dy = f.y - (a.y + ay * t), dz = f.z - (a.z + az * t);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    function update(focusWorld, distance) {
      if (!focusWorld || distance > ENABLE_DIST) {
        if (activeKey !== "__none__") { activeKey = "__none__"; clear(); }
        return;
      }
      // Re-fill only when the focus has actually moved somewhere new, on a grid
      // a fraction of the load radius: panning within a cell costs nothing.
      const cell = LOAD_RADIUS * 0.35;
      const key = Math.floor(focusWorld.x / cell) + ":" +
        Math.floor(focusWorld.y / cell) + ":" + Math.floor(focusWorld.z / cell);
      if (key === activeKey) return;
      activeKey = key;

      ensurePoints();
      let i = 0;
      for (let sIdx = 0; sIdx < strands.length && i < MAX_POINTS; sIdx++) {
        if (distToStrand(focusWorld, strands[sIdx]) > LOAD_RADIUS) continue;
        const d = strandDetail(sIdx);
        for (let k = 0; k + 3 < d.length && i < MAX_POINTS; k += 4, i++) {
          posArr[i * 3] = d[k];
          posArr[i * 3 + 1] = d[k + 1];
          posArr[i * 3 + 2] = d[k + 2];
          const w = d[k + 3];
          colArr[i * 3] = 0.9 * w; colArr[i * 3 + 1] = 0.92 * w; colArr[i * 3 + 2] = 1.0 * w;
        }
      }
      count = i;
      const geo = points.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, count);
      geo.computeBoundingSphere();
    }

    return {
      group, update,
      get count() { return count; },
      dispose() {
        if (points) {
          group.remove(points);
          points.geometry.dispose();
          points.material.dispose();   // the dot texture is shared; left alive
          points = null;
        }
        cache.clear();
      },
    };
  }

  function buildCosmicWeb(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed || 14142);
    const group = new THREE.Group();
    group.name = "gx-cosmicweb";
    const STRANGE = (window.GalaxySim.Math && window.GalaxySim.Math.Strangeness) || null;

    // 46 Gly at 10 Mly per world unit: the whole observable universe, and the
    // node count that keeps it reading as a web rather than a haze.
    const N = opts.nodeCount || 4200;
    const R = opts.radius || 4600;

    // --- The scaffolding: attractors gathered onto sheets -------------------
    const ATTRACTORS = 260;
    const attr = [];
    for (let i = 0; i < ATTRACTORS; i++) {
      // The polar angle is quantised into bands and then jittered, so
      // attractors gather on surfaces rather than filling the ball evenly.
      const band = Math.floor(rnd() * 7);
      const u = Math.max(-1, Math.min(1, (band / 6) * 2 - 1 + (rnd() - 0.5) * 0.22));
      const th = rnd() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const rr = Math.pow(0.06 + rnd() * 0.94, 0.72) * R;
      attr.push(new THREE.Vector3(Math.cos(th) * s * rr, u * rr * 0.82, Math.sin(th) * s * rr));
    }

    // --- The nodes themselves: strung between neighbouring attractors -------
    const nodes = [];
    const tiers = new Array(N);
    for (let i = 0; i < N; i++) {
      const a = attr[(rnd() * attr.length) | 0];
      // Its partner is the nearest OTHER attractor out of a handful of tries,
      // so the pair spans a real filament rather than an arbitrary chord.
      let b = a, bd = Infinity;
      for (let k = 0; k < 14; k++) {
        const c = attr[(rnd() * attr.length) | 0];
        if (c === a) continue;
        const d = a.distanceToSquared(c);
        if (d < bd) { bd = d; b = c; }
      }
      // Along the strand, with a bias to the ends: clusters pile up where two
      // filaments meet, which is where the real ones are.
      let t = rnd();
      t = t < 0.5 ? Math.pow(t * 2, 1.7) * 0.5 : 1 - Math.pow((1 - t) * 2, 1.7) * 0.5;
      const spread = R * 0.012 + rnd() * R * 0.03;
      const p = new THREE.Vector3(
        a.x + (b.x - a.x) * t + (rnd() - 0.5) * spread,
        a.y + (b.y - a.y) * t + (rnd() - 0.5) * spread,
        a.z + (b.z - a.z) * t + (rnd() - 0.5) * spread);
      nodes.push(p);
      tiers[i] = STRANGE ? STRANGE.tierOfRadius(p.length(), R) : 0;
    }
    // The Local Group is a node like any other, and it is the one at the
    // origin: node 0 is always home, so tier 0 is always reachable.
    nodes[0].set(0, 0, 0);
    tiers[0] = 0;

    const npos = new Float32Array(N * 3), ncol = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      npos[i * 3] = nodes[i].x; npos[i * 3 + 1] = nodes[i].y; npos[i * 3 + 2] = nodes[i].z;
      // A node's colour says how strange it is: the near web is the cool white
      // of ordinary galaxies, the far web burns towards amber.
      const f = tiers[i] / 15;
      const w = 0.5 + rnd() * 0.5;
      ncol[i * 3] = (0.85 + 0.15 * f) * w;
      ncol[i * 3 + 1] = (0.9 - 0.24 * f) * w;
      ncol[i * 3 + 2] = (1.0 - 0.62 * f) * w;
    }
    // Crisp constant-size dots: each node is a click target, so they must stay
    // individually distinguishable at any zoom rather than merging into glare.
    const nodePoints = pointCloud(npos, ncol, 4.5, 0.95, true);
    nodePoints.name = "gx-web-nodes";
    group.add(nodePoints);

    // Filaments: connect each node to its 2 nearest neighbours. A uniform
    // spatial grid with an expanding-ring search replaces the O(N^2) all-pairs
    // scan. The ring stops only once the second-best distance is provably
    // smaller than anything left unsearched, so the resulting neighbour pairs
    // are identical to the brute-force scan (no RNG is consumed here).
    const segs = [];
    {
      // Cell size is a real cost here, not a detail: at 4200 nodes the search
      // walks every cell of every ring it opens, so a grid that is too fine
      // spends more on empty cells than it saves on distance tests. R/16 was
      // measured as the floor of that curve (66ms, against 96 at R/26).
      // A uniform grid with an expanding-ring search. The ring stops only once
      // the second-best distance is provably smaller than anything left
      // unsearched, so the neighbours are the same pairs a brute-force scan
      // finds, at a fraction of the work.
      //
      // This loop is the single most expensive thing in the whole star map, so
      // it is written like it: it used to build a fresh array for every ring of
      // every node and SORT it (4,200 nodes x several rings, ~20,000 array
      // allocations and sorts), look cells up by building a "x,y,z" string each
      // time, and walk the full cube of each ring only to throw the interior
      // away. Now the cell key is one packed integer, the candidates are
      // scanned straight out of their buckets with nothing allocated, and only
      // the SURFACE of each ring is visited.
      const CELL = R / 16;
      const invCell = 1 / CELL;
      // Coordinates run to about +/-17 cells; 512 of headroom either way packs
      // into 30 bits, which stays a small integer key rather than a string.
      const K = (cx, cy, cz) => (((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512));
      const grid = new Map();
      const cellX = new Int32Array(N), cellY = new Int32Array(N), cellZ = new Int32Array(N);
      const px = new Float64Array(N), py = new Float64Array(N), pz = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const nd = nodes[i];
        px[i] = nd.x; py[i] = nd.y; pz[i] = nd.z;
        const cx = Math.floor(nd.x * invCell);
        const cy = Math.floor(nd.y * invCell);
        const cz = Math.floor(nd.z * invCell);
        cellX[i] = cx; cellY[i] = cy; cellZ[i] = cz;
        const key = K(cx, cy, cz);
        let bucket = grid.get(key);
        if (!bucket) grid.set(key, (bucket = []));
        bucket.push(i);
      }
      for (let i = 0; i < N; i++) {
        const ix = px[i], iy = py[i], iz = pz[i];
        const cx = cellX[i], cy = cellY[i], cz = cellZ[i];
        let b1 = -1, b2 = -1, d1 = Infinity, d2 = Infinity;
        // Test every node in one cell against node i.
        const scan = (key) => {
          const bucket = grid.get(key);
          if (!bucket) return;
          for (let bi = 0; bi < bucket.length; bi++) {
            const j = bucket[bi];
            if (j === i) continue;
            const dx = ix - px[j], dy = iy - py[j], dz = iz - pz[j];
            const d = dx * dx + dy * dy + dz * dz;
            if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = j; }
            else if (d < d2) { d2 = d; b2 = j; }
          }
        };
        for (let ring = 0; ring <= 64; ring++) {
          if (ring === 0) {
            scan(K(cx, cy, cz));
          } else {
            // The surface of the ring only: the two dz caps in full, then the
            // dy edges of the slices between them, then their dx sides.
            for (let dx = -ring; dx <= ring; dx++) {
              for (let dy = -ring; dy <= ring; dy++) {
                scan(K(cx + dx, cy + dy, cz - ring));
                scan(K(cx + dx, cy + dy, cz + ring));
              }
            }
            for (let dz = -ring + 1; dz <= ring - 1; dz++) {
              for (let dx = -ring; dx <= ring; dx++) {
                scan(K(cx + dx, cy - ring, cz + dz));
                scan(K(cx + dx, cy + ring, cz + dz));
              }
              for (let dy = -ring + 1; dy <= ring - 1; dy++) {
                scan(K(cx - ring, cy + dy, cz + dz));
                scan(K(cx + ring, cy + dy, cz + dz));
              }
            }
          }
          // Any unsearched node lies >= ring*CELL away; stop once b2 beats that.
          const safe = ring * CELL;
          if (b2 >= 0 && safe * safe > d2) break;
        }
        [b1, b2].forEach((b) => {
          if (b >= 0 && b > i) { segs.push(nodes[i], nodes[b]); }
        });
      }
    }
    const lgeo = new THREE.BufferGeometry().setFromPoints(segs);
    const lmat = new THREE.LineBasicMaterial({
      color: 0x4466aa, transparent: true, opacity: 0.28, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.LineSegments(lgeo, lmat));

    // Matter between the nodes, ON the filaments.
    //
    // This used to be 9,000 points balled up AROUND nodes, which left every
    // strand between them a bare drawn line: flying at a filament, there was
    // nothing on it to arrive at. Superclusters are strung along filaments and
    // so is everything between them, so that is where these go - a point on a
    // strand plus a small offset across it.
    const strandList = [];
    for (let i = 0; i + 1 < segs.length; i += 2) strandList.push([segs[i], segs[i + 1]]);
    {
      const n = 14000;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const st = strandList[(rnd() * strandList.length) | 0];
        const a = st[0], b = st[1];
        const t = rnd();
        const off = R * 0.006;
        pos[i * 3] = a.x + (b.x - a.x) * t + (rnd() + rnd() - 1) * off;
        pos[i * 3 + 1] = a.y + (b.y - a.y) * t + (rnd() + rnd() - 1) * off;
        pos[i * 3 + 2] = a.z + (b.z - a.z) * t + (rnd() + rnd() - 1) * off;
        const w = 0.12 + rnd() * 0.24;
        col[i * 3] = 0.82 * w; col[i * 3 + 1] = 0.86 * w; col[i * 3 + 2] = 1.0 * w;
      }
      const haze = new THREE.Points(
        new THREE.BufferGeometry()
          .setAttribute("position", new THREE.BufferAttribute(pos, 3))
          .setAttribute("color", new THREE.BufferAttribute(col, 3)),
        makePointsMaterial(1.6, dotTexture(), 0.5, false));
      haze.frustumCulled = false;
      group.add(haze);
    }

    // And the detail that only exists when you go and look: superclusters and
    // their galaxies, streamed onto whichever filaments the camera is near.
    // The observable universe holds about TEN MILLION superclusters, which is
    // not a number anything can hold in memory at once - so the web keeps its
    // 4,200 enterable nodes as the structure and generates the rest on demand,
    // the same bargain the Milky Way's star field makes (createLazyStarField).
    const detail = createWebDetail(strandList, R);
    group.add(detail.group);

    // Every node is a real destination: selecting one and zooming in builds a
    // procedural cluster of galaxies from its seed (see buildProceduralCluster).
    // The descriptive record is derived deterministically from the node index so
    // it stays identical between visits without storing 4200 objects up front.
    function nodeAt(i) {
      const p = nodes[i];
      if (!p) return null;
      const tier = tiers[i] || 0;
      const seed = clusterSeed(i);
      const r = lcg(seed);
      // A node of the cosmic web is a SUPERCLUSTER, not a cluster: the web is
      // 46 Gly across and one dot in it stands for the whole Laniakea-sized
      // basin the player has just spent a scale flying around. It used to be
      // labelled a cluster (or even a galaxy group) holding tens of galaxies,
      // which made the two scales below it the same size as this one.
      //
      // So a node holds CLUSTERS, and the far web is not only further away but
      // emptier: the rim holds thin, ragged superclusters rather than the rich
      // ones near home.
      // Laniakea holds ~100,000 galaxies in 300 to 500 clusters and groups, and
      // it is an ordinary supercluster; these are drawn from the same range.
      // The far web is not only further away but emptier, so the rim holds thin,
      // ragged superclusters rather than the rich ones near home.
      const members = Math.max(60, Math.round((300 + ((seed >>> 3) % 220)) * (1 - tier * 0.045)));
      const galaxies = Math.max(8000, Math.round(
        SUPERCLUSTER_GALAXIES * (members / 400) * (1 - tier * 0.03)));
      // 10 Mly per world unit at this scale, printed in Gly once it stops
      // fitting into four digits of Mly.
      const mly = p.length() * 10;
      return {
        index: i,
        seed,
        tier,
        position: p,
        data: {
          name: clusterName(seed),
          type: members > 90 ? "rich supercluster"  // i18n-ignore  body-type ids, resolved by bodyTypeLabel
            : members > 30 ? "supercluster" : "galaxy filament",  // i18n-ignore  body-type ids
          kind: "cluster",
          tier,
          // Laniakea is ~500 Mly across and is an ordinary one.
          // Laniakea runs ~520 Mly across; an ordinary supercluster is in range.
          diameter: T('Galaxy.unit.mly', { n: 300 + Math.round(r() * 400) }),
          members: T('Galaxy.unit.galaxies', { n: galaxies }),
          clusters: T('Galaxy.unit.clusters', { n: members }),
          distance: mly >= 1000
            ? T('Galaxy.unit.gly', { n: Math.round(mly / 100) / 10 })
            : T('Galaxy.unit.mly', { n: Math.round(mly) }),
        },
      };
    }

    /** The tier of a node, for anything that holds only its index. */
    function nodeTier(i) { return tiers[i] || 0; }

    /** Just where a node IS. nodeAt() builds a whole descriptive record with
     *  four formatted strings in it, which is far too much to pay 4200 times
     *  over every time the player presses the cycle key; this is what that
     *  sweep actually needs. */
    function nodePos(i) { return nodes[i] || null; }

    function animate() {}
    return {
      group, animate, pickables: [], nodePoints, nodeAt, nodeTier, nodePos, nodeCount: N,
      strands: strandList,
      // What the web STANDS FOR, as against what it draws: the observable
      // universe holds roughly ten million superclusters.
      superclusters: OBSERVABLE_SUPERCLUSTERS,
      update: detail.update,
      dispose() { detail.dispose(); disposeObject3D(group); },
      radius: R * 1.05,
    };
  }

  // ==========================================================================
  // Procedural galaxy: what a named galaxy billboard resolves into when the
  // player zooms into it. Same anatomy as the Milky Way (glow sheet, bulge,
  // logarithmic arms, inter-arm disk, halo, nucleus bloom) but seeded per
  // galaxy and much lighter, since it is built on demand rather than cached.
  // Deliberately separate from buildMilkyWay so the hero galaxy is untouched.
  // ==========================================================================

  /** Stable 32-bit hash so a galaxy's look is tied to its name, not to order.
   *  The optional `tier` is stamped into the seed's low four bits: from there
   *  it rides into every "GX.<seed>.<i>" system the galaxy holds and survives
   *  a save with no plumbing at all (GalaxySim.Math.Strangeness). */
  function galaxySeedFromName(name, tier) {
    let h = 2166136261 >>> 0;
    const s = String(name || "galaxy");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h = h >>> 0;
    const S = window.GalaxySim.Math && window.GalaxySim.Math.Strangeness;
    return S ? S.stampTier(h, tier || 0) : h;
  }

  const GALAXY_TINTS = [
    { arm: [0.66, 0.80, 1.00], core: [1.00, 0.90, 0.70] }, // classic blue arms
    { arm: [0.80, 0.86, 1.00], core: [1.00, 0.86, 0.62] }, // pale
    { arm: [1.00, 0.82, 0.66], core: [1.00, 0.78, 0.52] }, // warm / old
    { arm: [0.70, 1.00, 0.90], core: [0.95, 1.00, 0.82] }, // teal starburst
  ];

  function buildProceduralGalaxy(opts) {
    opts = opts || {};
    const name = opts.name || T('Galaxy.unnamedGalaxy');
    const seed = opts.seed != null ? opts.seed : galaxySeedFromName(name);
    const rnd = lcg(seed);
    const group = new THREE.Group();
    group.name = "gx-procgalaxy";

    const Rdisk = 1500 + (seed % 700);      // world units
    const Rbulge = Rdisk * (0.10 + (rnd() * 0.06));
    const arms = 2 + ((seed >>> 6) % 4);    // 2..5
    const B = 0.24 + rnd() * 0.18;          // arm winding
    const tint = GALAXY_TINTS[(seed >>> 11) % GALAXY_TINTS.length];
    const barred = rnd() < 0.5;

    const push = (arr, i, x, y, z) => { arr[i] = x; arr[i + 1] = y; arr[i + 2] = z; };

    // --- Luminous plane glow sheet ------------------------------------------
    {
      const diskMat = new THREE.MeshBasicMaterial({
        map: galaxyDiskTexture(), transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, opacity: 0.85,
      });
      const disk = new THREE.Mesh(new THREE.PlaneGeometry(Rdisk * 2.5, Rdisk * 2.5), diskMat);
      disk.rotation.x = -Math.PI / 2;
      group.add(disk);
    }

    // --- Bulge --------------------------------------------------------------
    {
      const n = 3600;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
        const rr = Math.pow(rnd(), 1.9) * Rbulge;
        const s = Math.sqrt(1 - u * u);
        // A bar stretches the bulge along X; ellipticals keep it round.
        const bx = barred ? 1.9 : 1;
        push(pos, i * 3, Math.cos(th) * s * rr * bx, u * rr * 0.55, Math.sin(th) * s * rr);
        const w = 0.65 + rnd() * 0.35;
        col[i * 3] = tint.core[0] * w;
        col[i * 3 + 1] = tint.core[1] * w;
        col[i * 3 + 2] = tint.core[2] * w;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, makePointsMaterial(2.6, dotTexture(), 0.95, false));
      pts.frustumCulled = false;
      group.add(pts);
    }

    // --- Spiral arms --------------------------------------------------------
    {
      const n = 20000;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const arm = i % arms;
        const tt = Math.pow(rnd(), 0.5);
        const r = Rbulge * 0.6 + tt * (Rdisk - Rbulge * 0.6);
        const base = Math.log(r / (Rbulge * 0.3)) / B;
        const scatter = (rnd() - 0.5) * (0.42 + (1 - tt) * 0.55);
        const ang = base + (arm / arms) * Math.PI * 2 + scatter;
        const rJit = r * (1 + (rnd() - 0.5) * 0.06);
        const h = (rnd() - 0.5) * (Rdisk * 0.018) * (1.4 - tt);
        push(pos, i * 3, Math.cos(ang) * rJit, h, Math.sin(ang) * rJit);
        const roll = rnd();
        let c;
        if (roll < 0.08) c = [1.0, 0.42, 0.6];            // HII pink
        else if (tt < 0.3) c = tint.core;
        else c = tint.arm;
        const w = 0.5 + rnd() * 0.5;
        col[i * 3] = c[0] * w; col[i * 3 + 1] = c[1] * w; col[i * 3 + 2] = c[2] * w;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, makePointsMaterial(2.1, dotTexture(), 0.9, false));
      pts.frustumCulled = false;
      group.add(pts);
    }

    // --- Inter-arm disk fill + spherical halo -------------------------------
    {
      const n = 5000;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const th = rnd() * Math.PI * 2;
        const r = Rbulge * 0.4 + Math.sqrt(rnd()) * (Rdisk - Rbulge * 0.4);
        push(pos, i * 3, Math.cos(th) * r, (rnd() - 0.5) * Rdisk * 0.025, Math.sin(th) * r);
        const w = 0.16 + rnd() * 0.2;
        col[i * 3] = 0.78 * w; col[i * 3 + 1] = 0.82 * w; col[i * 3 + 2] = 0.98 * w;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, makePointsMaterial(1.7, dotTexture(), 0.6, false));
      pts.frustumCulled = false;
      group.add(pts);
    }
    {
      const n = 2000;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const rr = Math.pow(rnd(), 0.6) * Rdisk * 1.05;
        push(pos, i * 3, Math.cos(th) * s * rr, u * rr * 0.8, Math.sin(th) * s * rr);
        const w = 0.1 + rnd() * 0.18;
        col[i * 3] = 0.95 * w; col[i * 3 + 1] = 0.9 * w; col[i * 3 + 2] = 0.78 * w;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, makePointsMaterial(1.5, dotTexture(), 0.5, false));
      pts.frustumCulled = false;
      group.add(pts);
    }

    // --- Nebulae in the disk, nucleus bloom, central black hole -------------
    const nebulae = [];
    const nCount = 3 + ((seed >>> 9) % 4);
    for (let i = 0; i < nCount; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = Rbulge * 1.5 + rnd() * (Rdisk * 0.8);
      const neb = buildNebula({
        seed: seed + 91 * (i + 1),
        size: Rdisk * (0.04 + rnd() * 0.05),
        layers: 10,
      });
      neb.group.position.set(Math.cos(ang) * rad, (rnd() - 0.5) * Rdisk * 0.02, Math.sin(ang) * rad);
      group.add(neb.group);
      nebulae.push(neb);
    }
    // Nucleus glow: reads as a soft bloom when the whole galaxy is in frame,
    // but a sprite this size sits far closer than its edge once the camera
    // enters the bulge, which used to whiteout the screen. Fade it out toward
    // the centre exactly like buildMilkyWay's own bloom (same NEAR/FAR ratio
    // to disk radius), so it dims rather than blinds on the way in.
    let glowFade = null;
    {
      const glow = makeHighlightSprite("rgba(255,238,196,0.9)");
      glow.sprite.scale.set(Rbulge * 1.7, Rbulge * 1.7, 1);
      group.add(glow.sprite);
      const GLOW_NEAR = Rdisk * 0.85, GLOW_FAR = Rdisk * 1.8;
      glowFade = (d) => {
        const t = Math.max(0, Math.min(1, (d - GLOW_NEAR) / (GLOW_FAR - GLOW_NEAR)));
        glow.mat.opacity = t;
        glow.sprite.visible = t > 0.01;
      };
      glowFade(0);
    }
    // The central hole. Only the radio-loud minority of galaxies get a beam,
    // decided by this galaxy's own seed, and it stays short so it punctuates the
    // nucleus instead of outshining the disk. Kept small here (galaxy view is
    // decorative); entering it renders the real, full-size hole (see
    // buildSystem's isBlackHoleSystem branch).
    const bhRadius = Rbulge * 0.03;
    const bh = buildBlackHole({
      radius: bhRadius, seed: seed + 5171, jetChance: 0.3,
      jetScale: 3.6, jetIntensity: 0.7, jetQuality: "low",
      diskColor: "rgba(255,150,50,0.9)",
    });
    group.add(bh.group);

    // --- Travelable star systems -------------------------------------------
    // A named galaxy used to be a pure backdrop (no pickables), which meant
    // nothing inside it could ever be selected or travelled to. Generate a
    // real, deterministic set of systems from this galaxy's seed via the
    // shared DataManager (same star-type roster/planet generation as the
    // Milky Way) and expose them as ordinary "star" pickables, so the normal
    // target/travel/SB-Bridge machinery works out here unmodified.
    // These were 220 separate Sprites, each with a SpriteMaterial of its own:
    // 220 draw calls and 220 materials for what is one cloud of points. They
    // are the same THREE.Points the Milky Way's own catalogue is drawn as
    // (buildGalaxyScale), which makes them one draw call AND lets the scene
    // pick them with the existing index raycast rather than a screen-space
    // test over 220 objects.
    const pickables = [];
    let systemPoints = null;
    let systemsByIndex = null;
    if (opts.dataManager && opts.dataManager.generateGalaxySystems) {
      const sysList = opts.dataManager.generateGalaxySystems(seed, Rdisk);
      const n = sysList.length;
      const spos = new Float32Array(n * 3), scol = new Float32Array(n * 3);
      const sc = new THREE.Color();
      systemsByIndex = new Array(n);
      for (let i = 0; i < n; i++) {
        const sys = sysList[i];
        spos[i * 3] = sys.position.x;
        spos[i * 3 + 1] = sys.position.y;
        spos[i * 3 + 2] = sys.position.z;
        sc.set(sys.color || "#ffffff");
        scol[i * 3] = sc.r; scol[i * 3 + 1] = sc.g; scol[i * 3 + 2] = sc.b;
        systemsByIndex[i] = sys;
      }
      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
      sgeo.setAttribute("color", new THREE.BufferAttribute(scol, 3));
      systemPoints = new THREE.Points(sgeo, makePointsMaterial(3.2, dotTexture(), 1, false));
      systemPoints.frustumCulled = false;
      systemPoints.renderOrder = 2;
      systemPoints.name = "gx-procgalaxy-stars";
      group.add(systemPoints);
    }

    // The galaxy's own central black hole - a real system too (see
    // DataManager.getGalaxyBlackHole), sitting at this local frame's origin
    // where the decorative bh.group mesh above is built, so picking it selects
    // the same body you see. Given a generous pick radius (bigger than its
    // shrunk visual mesh) so it stays easy to click at galaxy-view distances.
    if (opts.dataManager && opts.dataManager.getGalaxyBlackHole) {
      const bhSys = opts.dataManager.getGalaxyBlackHole(seed);
      if (bhSys) {
        pickables.push({
          object: bh.group,
          radius: Math.max(bhRadius * 2.5, 40),
          kind: "star", data: bhSys, system: bhSys,
        });
      }
    }

    return {
      group, name,
      animate: (t) => bh.animate(t),
      pickables,
      // The named catalogue, as the galaxy-scale scene expects to find it, so
      // picking a star out here goes through exactly the same path as at home.
      points: systemPoints,
      systemsByIndex,
      galaxySeed: seed,
      diskRadius: Rdisk,
      dispose: () => disposeObject3D(group),
      radius: Rdisk * 1.35,
      arms, barred,
      setZoomDistance: (d) => { if (glowFade) glowFade(d); },
    };
  }

  // ==========================================================================
  // Procedural galaxy cluster: what a single cosmic-web node resolves into when
  // the player zooms into it. A handful of sub-clumps of galaxy billboards,
  // wired together by filaments (each galaxy linked to its two nearest
  // neighbours, plus a bridge between clumps), so the web's structure carries
  // down a scale instead of the node just becoming a bigger dot.
  // ==========================================================================
  // ==========================================================================
  // Procedural names for everything out past the Local Group.
  //
  // A cluster used to be one of seven prefixes and a number, which gave the
  // player "Coma-1269" for a structure nowhere near Coma and produced the same
  // seven shapes over and over. Real deep-sky objects are named in a handful of
  // recognisable ways and this generates all of them:
  //
  //   catalogue + number      Abell 3627, ZwCl 1215, MCG+01-02-015
  //   catalogue + J2000 tag   MACS J0717.5+3745, RXC J1504.1-0248
  //   constellation + rank    Hydra III, Corona Borealis Supercluster
  //   galaxy catalogues       NGC 4874, IC 1101, UGC 2885, PGC 54559
  //
  // The constellations are the real 87 in js/db/GalaxySim/WesternConstellations
  // .json, so the sky the player reads out here is named for the sky they can
  // see from the ground.
  // ==========================================================================
  // i18n-ignore-start  catalogue designations and constellation names are ids,
  // not prose: an object's designation is the same in every language.
  const CLUSTER_CATALOGUES = ["Abell", "ACO", "ZwCl", "MKW", "AWM", "RXC", "MACS",
    "SPT-CL", "PLCK", "XMMU", "CIZA", "WHL"];
  const GALAXY_CATALOGUES = ["NGC", "IC", "UGC", "PGC", "ESO", "MCG", "Arp", "Markarian"];
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV"];
  const GREEK = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"];
  // The words a large-scale structure is described BY, rather than named for.
  const STRUCTURE_WORDS = ["Supercluster", "Wall", "Complex", "Filament", "Chain", "Sheet"];

  /** The 87 real constellation names, title-cased, read once from the db. */
  let _constellationNames = null;
  function constellationNames() {
    if (_constellationNames) return _constellationNames;
    const out = [];
    const src = window.GalaxySim && window.GalaxySim.WesternConstellations;
    if (src) {
      for (const key of Object.keys(src)) {
        const rec = src[key];
        const n = (rec && rec.name) || key;
        if (typeof n === "string" && n) out.push(n);
      }
    }
    // A small fallback so a missing database never leaves things unnamed.
    _constellationNames = out.length ? out
      : ["Hydra", "Centaurus", "Virgo", "Fornax", "Perseus", "Pegasus", "Sculptor",
         "Corona Borealis", "Bootes", "Columba", "Horologium", "Capricornus"];
    return _constellationNames;
  }

  /** A J2000-style designation, "J1226.9+3332". */
  function jTag(r) {
    const hh = (r() * 24) | 0, mm = (r() * 60) | 0, dec = (r() * 10) | 0;
    const sign = r() < 0.5 ? "-" : "+";
    const dd = (r() * 80) | 0, dm = (r() * 60) | 0;
    const p2 = (v) => (v < 10 ? "0" + v : String(v));
    return "J" + p2(hh) + p2(mm) + "." + dec + sign + p2(dd) + p2(dm);
  }

  /**
   * The name of a galaxy cluster or supercluster.
   * @param {number} seed
   * @param {boolean} [isSuper] name it as a supercluster-scale structure
   */
  function clusterName(seed, isSuper) {
    const r = lcg((seed >>> 0) || 1);
    const cons = constellationNames();
    const roll = r();
    if (isSuper) {
      // Superclusters are named for the constellation they lie behind, which is
      // how every real one got its name.
      const c = cons[(r() * cons.length) | 0];
      if (roll < 0.62) return c + " " + STRUCTURE_WORDS[(r() * STRUCTURE_WORDS.length) | 0];
      if (roll < 0.82) {
        const c2 = cons[(r() * cons.length) | 0];
        return c + "-" + c2 + " Complex";
      }
      return c + " " + ROMAN[(r() * ROMAN.length) | 0] + " Supercluster";
    }
    if (roll < 0.45) {
      // Abell 3627, ZwCl 1215 ...
      const cat = CLUSTER_CATALOGUES[(r() * CLUSTER_CATALOGUES.length) | 0];
      return cat + " " + (100 + ((r() * 4900) | 0));
    }
    if (roll < 0.70) {
      // MACS J0717.5+3745 ...
      const cat = CLUSTER_CATALOGUES[(r() * CLUSTER_CATALOGUES.length) | 0];
      return cat + " " + jTag(r);
    }
    // Hydra III, Fornax Cluster ...
    const c = cons[(r() * cons.length) | 0];
    return r() < 0.5
      ? c + " " + ROMAN[(r() * ROMAN.length) | 0]
      : c + " Cluster";
  }

  /** The name of one galaxy, from an ordinary deep-sky catalogue. */
  function galaxyName(seed) {
    const r = lcg((seed >>> 0) || 1);
    const cat = GALAXY_CATALOGUES[(r() * GALAXY_CATALOGUES.length) | 0];
    if (cat === "MCG") {
      const p = (v) => (v < 10 ? "0" + v : String(v));
      return "MCG" + (r() < 0.5 ? "-" : "+") + p((r() * 15) | 0) + "-" +
        p((r() * 60) | 0) + "-" + p((r() * 99) | 0);
    }
    if (cat === "ESO") return "ESO " + (100 + ((r() * 500) | 0)) + "-" + ((r() * 60) | 0);
    if (cat === "PGC") return "PGC " + (1000 + ((r() * 900000) | 0));
    if (cat === "UGC") return "UGC " + (1 + ((r() * 12900) | 0));
    if (cat === "Arp") return "Arp " + (1 + ((r() * 338) | 0));
    if (cat === "Markarian") return "Markarian " + (1 + ((r() * 1500) | 0));
    if (cat === "IC") return "IC " + (1 + ((r() * 5386) | 0));
    return "NGC " + (1 + ((r() * 7840) | 0));
  }
  // i18n-ignore-end

  function clusterSeed(index) { return (14142 + index * 7919) >>> 0; }

  function clusterName(seed) {
    const p = CLUSTER_PREFIX[seed % CLUSTER_PREFIX.length];
    return p + " " + (1000 + (seed >>> 4) % 8000);
  }

  // ==========================================================================
  // What a cosmic-web node opens into: a supercluster, built to Laniakea's
  // shape (see buildSupercluster and js/db/GalaxySim/Laniakea.json).
  //
  // It used to be three or four spherical clumps of ~120 galaxies with lines
  // drawn between whichever of them happened to land near each other. That is
  // backwards twice over: a supercluster holds a HUNDRED THOUSAND galaxies in
  // 300 to 500 clusters and groups, and in the real web the filaments come
  // first with the galaxies strung ON them. Both are fixed here, so the
  // structure the player saw as one dot resolves into the same kind of thing
  // they just flew around at home.
  // ==========================================================================
  function buildProceduralCluster(opts) {
    opts = opts || {};
    const seed = opts.seed || 14142;
    const rnd = lcg(seed);
    const group = new THREE.Group();
    group.name = "gx-cluster";
    const pickables = [];
    const name = opts.name || clusterName(seed);
    // How strange this whole supercluster is allowed to be: handed down from
    // the web node it hangs off, and handed on again to every galaxy in it.
    const tier = Math.max(0, Math.min(15, Math.round(opts.tier || 0)));

    const R = 900;                       // framing radius (world units)

    // --- The skeleton --------------------------------------------------------
    // Knots first, joined into one connected web, and everything else hangs off
    // the strands between them.
    const KNOTS = 5 + ((seed >>> 5) % 5);
    const knotPos = [];
    for (let k = 0; k < KNOTS; k++) {
      const u = (rnd() * 2 - 1) * 0.55;          // flattened: a wall, not a ball
      const th = rnd() * Math.PI * 2;
      const sxz = Math.sqrt(Math.max(0, 1 - u * u));
      const rr = (k === 0 ? 0 : (0.34 + rnd() * 0.62) * R);
      knotPos.push(new THREE.Vector3(
        Math.cos(th) * sxz * rr, u * rr * 0.5, Math.sin(th) * sxz * rr));
    }

    // Nearest-neighbour links, then whatever is left pulled in until the whole
    // thing is ONE structure, then a couple of chords to close loops. The
    // spanning step matters: neighbours usually pair off mutually, so without
    // it a supercluster could come out as two or three strands with most of its
    // knots unjoined and every galaxy piled onto those.
    const strands = [];
    const linked = new Set();
    const join = (i, j) => {
      if (i === j) return false;
      const key = Math.min(i, j) + ":" + Math.max(i, j);
      if (linked.has(key)) return false;
      linked.add(key);
      strands.push([knotPos[i], knotPos[j]]);
      return true;
    };
    for (let i = 0; i < knotPos.length; i++) {
      let best = -1, bestD = Infinity;
      for (let j = 0; j < knotPos.length; j++) {
        if (j === i) continue;
        const d = knotPos[i].distanceToSquared(knotPos[j]);
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best >= 0) join(i, best);
    }
    {
      const inside = new Set([0]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const key of linked) {
          const [a, b] = key.split(":").map(Number);
          if (inside.has(a) && !inside.has(b)) { inside.add(b); grew = true; }
          else if (inside.has(b) && !inside.has(a)) { inside.add(a); grew = true; }
        }
      }
      while (inside.size < knotPos.length) {
        let bi = -1, bj = -1, bd = Infinity;
        for (const i of inside) {
          for (let j = 0; j < knotPos.length; j++) {
            if (inside.has(j)) continue;
            const d = knotPos[i].distanceToSquared(knotPos[j]);
            if (d < bd) { bd = d; bi = i; bj = j; }
          }
        }
        if (bj < 0) break;
        join(bi, bj);
        inside.add(bj);
      }
    }
    for (let extra = 0; extra < KNOTS; extra++) {
      join((rnd() * knotPos.length) | 0, (rnd() * knotPos.length) | 0);
    }

    // --- The named clusters, strung along the strands ------------------------
    // Laniakea's own named members run from 10 to 1,300 galaxies apiece; these
    // are drawn from the same range, and like Laniakea's they account for only
    // a few per cent of the whole - the rest is in the unnamed groups and the
    // field that buildSuperclusterField lays down along the filaments.
    const knots = [];
    const NAMED = 22 + ((seed >>> 7) % 16);
    const ax = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    for (let i = 0; i < NAMED; i++) {
      const strand = strands[(rnd() * strands.length) | 0];
      if (!strand) break;
      const a = strand[0], b = strand[1];
      // Piled up toward the knots at each end, where filaments meet.
      let t = rnd();
      t = t < 0.5 ? Math.pow(t * 2, 1.6) * 0.5 : 1 - Math.pow((1 - t) * 2, 1.6) * 0.5;
      ax.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = ax.length() || 1;
      ax.multiplyScalar(1 / len);
      const up = Math.abs(ax.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      t1.set(ax.y * up.z - ax.z * up.y, ax.z * up.x - ax.x * up.z, ax.x * up.y - ax.y * up.x).normalize();
      t2.set(ax.y * t1.z - ax.z * t1.y, ax.z * t1.x - ax.x * t1.z, ax.x * t1.y - ax.y * t1.x).normalize();
      const thick = R * 0.03 * (0.45 + Math.abs(t - 0.5) * 2.2);
      const o1 = (rnd() + rnd() - 1) * thick, o2 = (rnd() + rnd() - 1) * thick;
      const pos = new THREE.Vector3(
        a.x + (b.x - a.x) * t + t1.x * o1 + t2.x * o2,
        a.y + (b.y - a.y) * t + t1.y * o1 + t2.y * o2,
        a.z + (b.z - a.z) * t + t1.z * o1 + t2.z * o2);

      // A steep size law: a few rich clusters, many small groups.
      const rich = Math.max(10, Math.round(1300 * Math.pow(rnd(), 3.1)));
      const sz = 7 + Math.min(30, Math.sqrt(rich) * 1.4);
      const pal = GAL_PALETTE[(rnd() * GAL_PALETTE.length) | 0];
      const gb = galaxyBillboard(pal[0], pal[1], sz, sz * (0.45 + rnd() * 0.55));
      gb.position.copy(pos);
      gb.material.rotation = rnd() * Math.PI;
      group.add(gb);
      knots.push({ pos, rich, spread: Math.max(2, Math.sqrt(rich) * 0.2) * (R / 250) });
      addPickable(pickables, gb, Math.max(sz * 0.5, 9), {
        name: name + " " + GREEK[pickables.length % GREEK.length] + "-" + (pickables.length + 1),
        type: rich > 600 ? "rich galaxy cluster" : rich > 120 ? "galaxy cluster" : "galaxy group",  // i18n-ignore  body-type ids
        kind: "cluster",
        tier,
        diameter: T('Galaxy.unit.mly', { n: Math.round(3 + Math.sqrt(rich) * 0.4) }),
        members: T('Galaxy.unit.galaxies', { n: rich }),
        distance: T('Galaxy.unit.mly', { n: Math.round(pos.length() * 0.5) }),
      });
    }

    // --- The filaments themselves, drawn as the threads they are -------------
    {
      const segs = [];
      const STEPS = 12;
      for (const [a, b] of strands) {
        let prev = a;
        const bend = (rnd() - 0.5) * R * 0.09;
        for (let k = 1; k <= STEPS; k++) {
          const t = k / STEPS;
          const w = Math.sin(t * Math.PI) * bend;
          const cur = new THREE.Vector3(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t + w,
            a.z + (b.z - a.z) * t + w * 0.5);
          segs.push(prev, cur);
          prev = cur;
        }
      }
      const lgeo = new THREE.BufferGeometry().setFromPoints(segs);
      const lmat = new THREE.LineBasicMaterial({
        color: 0x5a7fc0, transparent: true, opacity: 0.24, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      group.add(new THREE.LineSegments(lgeo, lmat));
    }

    // --- A hundred thousand galaxies, same as Laniakea -----------------------
    const field = buildSuperclusterField(knots, strands, rnd, R);
    group.add(field.points);

    return {
      group, name, animate: () => {}, pickables,
      // Exposed so a test can measure that the galaxies really do lie along the
      // strands rather than merely near them.
      strands, knots,
      galaxies: SUPERCLUSTER_GALAXIES, groupCount: field.groups,
      dispose: () => disposeObject3D(group), radius: R * 1.25,
    };
  }

  // ==========================================================================
  // The observable universe, seen whole.
  //
  // This was a ball of 5,000 evenly scattered points inside a faint shell,
  // framed at THREE TRILLION light years for something 46.5 Gly in radius, so
  // there was nothing in it at any zoom. It is the same structure the player
  // just flew through one scale down - so it is drawn as that: the cosmic web
  // receding, its filaments thinning with distance, bounded by the surface of
  // last scattering rather than by an arbitrary sphere.
  //
  // 20 Mly to the unit (World3D LY_PER_UNIT), so 46.5 Gly is 2,325 units.
  // ==========================================================================
  function buildObservable(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed || 27182);
    const group = new THREE.Group();
    group.name = "gx-observable";
    const R = 2200;                 // 44 Gly: the web inside the horizon
    const HORIZON = 2325;           // 46.5 Gly: the surface of last scattering

    // --- The web, at the largest scale it can still be resolved at -----------
    // Attractors and strands again, the same construction the cosmic web uses,
    // so stepping out to here reads as the SAME universe getting smaller rather
    // than as a different drawing of it.
    const ATTRACTORS = 150;
    const attr = [];
    for (let i = 0; i < ATTRACTORS; i++) {
      const band = Math.floor(rnd() * 7);
      const u = Math.max(-1, Math.min(1, (band / 6) * 2 - 1 + (rnd() - 0.5) * 0.22));
      const th = rnd() * Math.PI * 2;
      const sxz = Math.sqrt(Math.max(0, 1 - u * u));
      const rr = Math.pow(0.08 + rnd() * 0.92, 0.72) * R;
      attr.push(new THREE.Vector3(Math.cos(th) * sxz * rr, u * rr * 0.85, Math.sin(th) * sxz * rr));
    }

    const N = 2600;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = attr[(rnd() * attr.length) | 0];
      let b = a, bd = Infinity;
      for (let k = 0; k < 10; k++) {
        const c = attr[(rnd() * attr.length) | 0];
        if (c === a) continue;
        const d = a.distanceToSquared(c);
        if (d < bd) { bd = d; b = c; }
      }
      let t = rnd();
      t = t < 0.5 ? Math.pow(t * 2, 1.7) * 0.5 : 1 - Math.pow((1 - t) * 2, 1.7) * 0.5;
      const spread = R * 0.02 + rnd() * R * 0.035;
      const x = a.x + (b.x - a.x) * t + (rnd() - 0.5) * spread;
      const y = a.y + (b.y - a.y) * t + (rnd() - 0.5) * spread;
      const z = a.z + (b.z - a.z) * t + (rnd() - 0.5) * spread;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      // Redshift: the further out, the older the light and the redder it is,
      // until at the horizon everything is the colour of the microwave sky.
      const f = Math.min(1, Math.sqrt(x * x + y * y + z * z) / R);
      const w = 0.3 + rnd() * 0.5;
      col[i * 3] = (0.78 + 0.22 * f) * w;
      col[i * 3 + 1] = (0.86 - 0.26 * f) * w;
      col[i * 3 + 2] = (1.0 - 0.55 * f) * w;
    }
    group.add(pointCloud(pos, col, 4, 0.85));

    // Filaments between the attractors, faint at this remove.
    {
      const segs = [];
      for (let i = 0; i < attr.length; i++) {
        let b1 = -1, d1 = Infinity;
        for (let j = 0; j < attr.length; j++) {
          if (j === i) continue;
          const d = attr[i].distanceToSquared(attr[j]);
          if (d < d1) { d1 = d; b1 = j; }
        }
        if (b1 > i) segs.push(attr[i], attr[b1]);
      }
      const lgeo = new THREE.BufferGeometry().setFromPoints(segs);
      const lmat = new THREE.LineBasicMaterial({
        color: 0x44557f, transparent: true, opacity: 0.16, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      group.add(new THREE.LineSegments(lgeo, lmat));
    }

    // --- The horizon: the cosmic microwave background ------------------------
    // Not a boundary of the universe, the boundary of what can be SEEN, which
    // is what makes this scale a different thing from the one above it.
    {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(HORIZON, 40, 28),
        new THREE.MeshBasicMaterial({
          color: 0x8a4a33, transparent: true, opacity: 0.07, side: THREE.BackSide,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }));
      group.add(shell);
      // The anisotropy, as a speckle on the inside of that shell: the oldest
      // thing there is to look at, and the only structure at this radius.
      const n = 4000;
      const p2 = new Float32Array(n * 3), c2 = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
        const sxz = Math.sqrt(Math.max(0, 1 - u * u));
        const rr = HORIZON * (0.985 + rnd() * 0.02);
        p2[i * 3] = Math.cos(th) * sxz * rr;
        p2[i * 3 + 1] = u * rr;
        p2[i * 3 + 2] = Math.sin(th) * sxz * rr;
        // Warm and cold spots, a few parts in a hundred thousand made visible.
        const hot = rnd();
        const w = 0.25 + rnd() * 0.35;
        c2[i * 3] = (0.75 + hot * 0.3) * w;
        c2[i * 3 + 1] = (0.45 + hot * 0.2) * w;
        c2[i * 3 + 2] = (0.55 - hot * 0.25) * w;
      }
      group.add(pointCloud(p2, c2, 6, 0.5));
    }

    const pickables = [];
    addPickable(pickables, group, R * 0.05, CAT.observable[0]);

    function animate(t) { group.rotation.y = t * 0.005; }
    return { group, animate, pickables, dispose: () => disposeObject3D(group), radius: HORIZON };
  }

  // ==========================================================================
  // Past the horizon: the observable universe as a single object.
  //
  // The scale above the horizon is the one place the universe can be looked at
  // from outside, so this is the ONLY view where it is a body rather than a
  // space. 100 Mly to the unit (World3D LY_PER_UNIT), so the 46.5 Gly
  // observable sphere is 465 units across and there is room around it - which
  // is the point, because what lives out here is what is not inside it.
  // ==========================================================================
  function buildUniverseSphere(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed || 16180);
    const group = new THREE.Group();
    group.name = "gx-universe";
    const R = 465;   // the observable universe, to scale, as one body

    // The observable universe rendered as a single luminous sphere.
    const geo = new THREE.SphereGeometry(R, 48, 36);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3a5a9a, transparent: true, opacity: 0.16, side: THREE.FrontSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Mesh(geo, mat));

    // Surface speckle so it reads as a structured sphere, plus a core glow.
    const n = 6000;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const rr = R * (0.96 + rnd() * 0.06);
      pos[i * 3] = Math.cos(th) * s * rr; pos[i * 3 + 1] = u * rr; pos[i * 3 + 2] = Math.sin(th) * s * rr;
      const w = 0.4 + rnd() * 0.6; col[i * 3] = 0.7 * w; col[i * 3 + 1] = 0.82 * w; col[i * 3 + 2] = 1.0 * w;
    }
    group.add(pointCloud(pos, col, 10, 0.7));
    const glow = makeGlowSprite("rgba(120,160,255,0.7)");
    glow.sprite.scale.set(R * 2.6, R * 2.6, 1);
    group.add(glow.sprite);

    // Higher-dimensional anomalies live HERE, at the outermost scale, rather
    // than among the cosmic-web filaments: they are not structures inside the
    // universe, so they are only visible once the universe itself is an object.
    // The Hypercube is the hero; the others are rendered at the same rank.
    const pickables = [];
    const anomalies = [];
    // Render specs, index-aligned with CAT.universe (the descriptive records).
    // Sized and placed against R rather than in absolute units, and placed
    // OUTSIDE the sphere: the comment above says these are not structures
    // inside the universe, and now that the universe is drawn at its own size
    // they can actually stand where that claim puts them.
    const SPECS = [
      { seed: 99, type: "hypercube", scale: R * 0.30, color: 0xff8cf0, pos: [R * 1.5, R * 0.6, -R * 1.1] },
      { seed: 700, type: "hypersphere", scale: R * 0.24, color: 0xc89cff, pos: [-R * 1.7, -R * 0.5, R * 0.8] },
      { seed: 753, type: "klein", scale: R * 0.22, color: 0x9cd8ff, pos: [R * 0.5, -R * 1.6, R * 1.3] },
      { seed: 806, type: "mobius", scale: R * 0.23, color: 0xffc98c, pos: [-R * 0.8, R * 1.7, R * 0.9] },
    ];
    SPECS.forEach((spec, i) => {
      const an = buildAnomaly({ seed: spec.seed, type: spec.type, scale: spec.scale, color: spec.color });
      an.group.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      group.add(an.group);
      anomalies.push(an);
      addPickable(pickables, an.group, spec.scale * 0.7, CAT.universe[i]);
    });

    function animate(t) {
      group.rotation.y = t * 0.01;
      anomalies.forEach((a) => a.animate(t));
    }
    // Framed wide enough that the sphere is an object with space around it,
    // rather than filling the screen the way it did when it WAS the space.
    return { group, animate, pickables, dispose: () => disposeObject3D(group), radius: R * 2.6 };
  }

  // ==========================================================================
  // M7: nebulae, black holes, higher-dimensional anomalies.
  // ==========================================================================

  // Radial-remapped hot accretion gradient (inner blue-white -> orange -> dark).
  function makeAccretionTexture(coreHex, rnd) {
    rnd = rnd || Math.random;
    const w = 256, h = 16;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0.0, "rgba(190,215,255,0.95)");
    g.addColorStop(0.22, "rgba(255,242,205,0.95)");
    g.addColorStop(0.55, coreHex || "rgba(255,160,60,0.85)");
    g.addColorStop(1.0, "rgba(70,15,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = "rgba(255,255,255," + (rnd() * 0.12) + ")";
      ctx.fillRect((rnd() * w) | 0, 0, 1, h);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  // Tileable plasma texture for a polar jet. V runs along the beam and repeats,
  // so scrolling the offset streams the plasma outward; U runs around it. Long
  // filaments give the column internal structure and the soft bands read as the
  // internal shock knots of a real relativistic jet.
  function makeJetFlowTexture(rnd) {
    rnd = rnd || Math.random;
    const w = 64, h = 256;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = "rgba(255,255,255," + (0.04 + rnd() * 0.2).toFixed(3) + ")";
      ctx.fillRect(rnd() * w, 0, 1 + rnd() * 5, h);
    }
    for (let i = 0; i < 8; i++) {
      const y = rnd() * h, bh = 8 + rnd() * 30, a = (0.2 + rnd() * 0.45).toFixed(3);
      // Each knot is drawn twice, once wrapped past the seam, so the tile stays
      // continuous while it scrolls.
      [y, y - h].forEach((yy) => {
        const g = ctx.createLinearGradient(0, yy, 0, yy + bh);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255," + a + ")");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, yy, w, bh);
      });
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Radius of a jet at a fraction f of its length: pencil-thin at the launch
  // point, flaring with distance like a real collimated outflow.
  function jetProfile(rBase, rTip, f) {
    return rBase + (rTip - rBase) * Math.pow(f, 0.62);
  }

  // Bake the along-beam brightness into vertex colours (r128 has no per-map UV
  // transform, so the length falloff cannot live in a second texture): brightest
  // at the launch point, fading to the tip, with an optional bump at the working
  // surface where the beam ploughs into the surrounding medium.
  function fadeAlongBeam(geo, length, headBump) {
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const f = Math.min(1, Math.max(0, pos.getY(i) / length));
      const head = headBump ? headBump * Math.exp(-Math.pow((f - 0.86) / 0.11, 2)) : 0;
      const a = Math.min(1, Math.pow(1 - f, 1.4) * 0.9 + head + 0.06);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  }

  // One polar jet, built along +Y so the caller can mirror it for the counter
  // beam: a flaring plasma column (sheath + hot core), two crossed glow sheets
  // that give it volume from any viewing angle, a corkscrewing magnetic
  // filament, shock knots travelling out along it and a flare where it launches.
  function buildJet(cfg) {
    const R = cfg.R, length = cfg.length, intensity = cfg.intensity;
    const rnd = cfg.rnd, full = cfg.full;
    const group = new THREE.Group();
    const rBase = R * 0.16, rTip = R * 0.85;
    const mats = [];   // { m, base } so the flicker can scale every layer at once

    function mkMat(base, hex) {
      const m = new THREE.MeshBasicMaterial({
        color: hex, map: cfg.flowTex, vertexColors: true, transparent: true,
        opacity: base * intensity, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      mats.push({ m: m, base: base * intensity });
      return m;
    }

    function lathe(rb, rt, seg) {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const f = i / 24;
        pts.push(new THREE.Vector2(jetProfile(rb, rt, f), f * length));
      }
      return fadeAlongBeam(new THREE.LatheGeometry(pts, seg), length, 0.3);
    }

    group.add(new THREE.Mesh(lathe(rBase, rTip, 28), mkMat(0.26, cfg.color)));
    group.add(new THREE.Mesh(lathe(rBase * 0.45, rTip * 0.32, 20), mkMat(0.7, 0xdcecff)));

    let helix = null;
    const knots = [];
    if (full) {
      // Crossed sheets: whatever the camera angle, one of them is close to
      // edge-on to the viewer, so the beam always reads as a glowing volume
      // instead of a hollow shell.
      for (let q = 0; q < 2; q++) {
        const geo = new THREE.PlaneGeometry(2, length, 6, 24);
        geo.translate(0, length / 2, 0);
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const f = Math.min(1, Math.max(0, pos.getY(i) / length));
          const xn = pos.getX(i);                       // -1 .. 1 across the sheet
          pos.setX(i, xn * jetProfile(rBase, rTip, f) * 1.45);
          const w = Math.pow(1 - f, 1.3) * Math.pow(1 - Math.min(1, Math.abs(xn)), 1.8);
          col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = w;
        }
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const sheet = new THREE.Mesh(geo, mkMat(0.34, cfg.color));
        sheet.rotation.y = q * Math.PI / 2;
        group.add(sheet);
      }

      const hp = [];
      for (let i = 0; i <= 72; i++) {
        const f = i / 72, rr = jetProfile(rBase, rTip, f) * 0.95;
        const a = f * Math.PI * 2 * 2.6;
        hp.push(new THREE.Vector3(Math.cos(a) * rr, f * length, Math.sin(a) * rr));
      }
      const hGeo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(hp), 96, Math.max(0.4, R * 0.03), 5, false);
      helix = new THREE.Mesh(fadeAlongBeam(hGeo, length, 0), new THREE.MeshBasicMaterial({
        color: 0xbfe0ff, vertexColors: true, transparent: true,
        opacity: 0.45 * intensity, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      mats.push({ m: helix.material, base: 0.45 * intensity });
      group.add(helix);

      for (let i = 0; i < 3; i++) {
        const gl = makeGlowSprite("rgba(210,232,255,0.95)");
        gl.mat.opacity = 0;
        group.add(gl.sprite);
        knots.push({ sprite: gl.sprite, mat: gl.mat, phase: rnd(), speed: 0.09 + rnd() * 0.07 });
      }
    }

    // The launch flare sits just clear of the horizon, otherwise the black
    // sphere swallows it from every angle.
    const flare = makeGlowSprite("rgba(200,226,255,0.9)");
    flare.sprite.scale.set(R * 2, R * 2, 1);
    flare.sprite.position.y = R * 1.12;
    flare.mat.opacity = 0.5 * intensity;
    mats.push({ m: flare.mat, base: 0.5 * intensity });
    group.add(flare.sprite);

    const ph = cfg.phase || 0;
    function tick(t) {
      const flick = 0.85 + 0.15 * Math.sin(t * 2.3 + ph) * Math.sin(t * 5.9 + ph * 1.7);
      for (let i = 0; i < mats.length; i++) mats[i].m.opacity = mats[i].base * flick;
      if (helix) helix.rotation.y = -t * 0.45;
      for (let i = 0; i < knots.length; i++) {
        const k = knots[i];
        const f = (t * k.speed + k.phase) % 1;
        k.sprite.position.y = f * length;
        const w = R * (0.6 + f * 1.9);
        k.sprite.scale.set(w, w, 1);
        k.mat.opacity = intensity * 0.85 * Math.sin(Math.PI * Math.min(1, f * 1.15)) * (1 - f * 0.3);
      }
    }

    return { group, tick };
  }

  // Disk gradient for the giant holes: white-hot at the inner edge, running out
  // through amber to a thin dusty rim, and near-uniform along its length.
  // Interstellar dropped Doppler beaming on purpose - with it, the receding
  // half of the disk goes almost black and the sheet of light falls apart - and
  // the same choice is what lets this one read as one continuous sheet.
  // U is the radial axis (the caller remaps the annulus UVs to match), V the
  // angular one, carrying only a slight density wave so the spin is visible.
  function makeGrandDiskTexture(rnd, coreHex) {
    rnd = rnd || Math.random;
    const w = 512, h = 64;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0.00, "rgba(255,255,255,0)");
    g.addColorStop(0.03, "rgba(255,253,247,0.98)");
    g.addColorStop(0.13, "rgba(255,246,220,1)");
    g.addColorStop(0.33, coreHex || "rgba(255,223,166,0.95)");
    g.addColorStop(0.58, "rgba(255,191,118,0.76)");
    g.addColorStop(0.80, "rgba(240,151,74,0.40)");
    g.addColorStop(0.94, "rgba(170,86,32,0.13)");
    g.addColorStop(1.00, "rgba(90,38,10,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Fine ring structure: hundreds of narrow orbits at slightly different
    // densities, which is what gives the film's disk its combed look. Packed
    // toward the inside, where the orbits crowd together.
    for (let i = 0; i < 170; i++) {
      const x = Math.pow(rnd(), 0.7) * w;
      ctx.fillStyle = rnd() < 0.45
        ? "rgba(0,0,0," + (0.04 + rnd() * 0.12).toFixed(3) + ")"
        : "rgba(255,247,228," + (0.03 + rnd() * 0.13).toFixed(3) + ")";
      ctx.fillRect(x, 0, 1 + rnd() * 3, h);
    }
    // Broad, shallow density waves around the disk. Too faint to break the
    // uniform sheet, strong enough that the shear between bands is legible.
    const p1 = rnd() * 6.28, p2 = rnd() * 6.28;
    for (let j = 0; j < h; j++) {
      const a = j / h * Math.PI * 2;
      const d = 0.09 * Math.sin(a * 2 + p1) + 0.05 * Math.sin(a * 5 + p2);
      ctx.fillStyle = (d < 0 ? "rgba(0,0,0," : "rgba(255,240,215,") + Math.abs(d).toFixed(3) + ")";
      ctx.fillRect(0, j, w, 1);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // An annulus in the XY plane with explicit UVs, optional per-vertex colours
  // and no normals (every layer built from it is additive MeshBasicMaterial).
  // `radialU` maps the radial fraction onto u over [u0,u1] and the angle onto
  // v, which is what lets a disk be cut into concentric bands sharing one
  // radial gradient; without it u is the angle and v the radial fraction,
  // which is what the lensed arcs need. The angle comes from the generating
  // index, not from atan2, so the seam gets u=1 instead of wrapping to 0.
  function annulusGeo(ri, ro, seg, rings, opt) {
    opt = opt || {};
    const u0 = opt.u0 != null ? opt.u0 : 0, u1 = opt.u1 != null ? opt.u1 : 1;
    const pos = [], uv = [], col = [], idx = [];
    for (let j = 0; j <= rings; j++) {
      const vr = j / rings, r = ri + (ro - ri) * vr;
      for (let i = 0; i <= seg; i++) {
        const va = i / seg, a = va * Math.PI * 2;
        pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
        if (opt.radialU) uv.push(u0 + (u1 - u0) * vr, va);
        else uv.push(va, vr);
        if (opt.colorFn) {
          const c = opt.colorFn(va, vr);
          col.push(c[0], c[1], c[2]);
        }
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i, b = a + seg + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    if (col.length) geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }

  // The "Gargantua" accretion structure, used for the supermassive and
  // hypermassive holes. Three things separate it from the ordinary disk.
  // It is thin, very wide and almost uniformly bright along its length (see
  // makeGrandDiskTexture). It rotates differentially, in Keplerian bands, so
  // the inner edge visibly laps the rim instead of the whole sheet turning
  // like a plate. And the far side of the disk is repeated as two arcs
  // standing over and under the shadow: that secondary image is what gravity
  // does to the light passing behind the hole, and it is the shape the film is
  // known for. Both the arcs and the photon ring are lensed IMAGES, so they
  // are circles in the image plane rather than rings lying in the disk: they
  // are billboarded to the camera, and the arcs fade out as the disk turns
  // face-on, which is exactly when real lensing folds them into the ring.
  function buildGargantuaDisk(cfg) {
    const R = cfg.R, rnd = cfg.rnd, axis = cfg.axis, group = cfg.group;
    const tex = makeGrandDiskTexture(rnd, cfg.diskColor);
    const ri = R * 2.05, ro = R * 9.4;
    const bands = [];
    const BANDS = 3;
    for (let b = 0; b < BANDS; b++) {
      const f0 = b / BANDS, f1 = (b + 1) / BANDS;
      const r0 = ri + (ro - ri) * f0, r1 = ri + (ro - ri) * f1;
      // A pair of sheets a hair either side of the plane: seen exactly edge-on
      // a single plane vanishes, and the pair gives the disk the slight
      // thickness the film's has without turning it into a torus.
      for (let s = -1; s <= 1; s += 2) {
        const mesh = new THREE.Mesh(
          annulusGeo(r0, r1, 168, 3, { radialU: true, u0: f0, u1: f1 }),
          new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
            depthWrite: false, blending: THREE.AdditiveBlending,
          }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = s * R * (0.03 + 0.05 * b);
        axis.add(mesh);
        // Kepler: the inner band comes round three and a half times for every
        // turn of the rim. Slow overall - the thing is meant to read as vast.
        bands.push({ mesh, speed: 0.4 * Math.pow(0.35 + (f0 + f1) * 0.5, -1.5) });
      }
    }

    // The hot inner rim just outside the innermost stable orbit: harder and
    // whiter than anything further out, and the one part that visibly boils.
    const rim = new THREE.Mesh(
      annulusGeo(R * 1.96, R * 2.62, 168, 3, {
        colorFn: (u, v) => { const w = (1 - v) * (1 - v); return [w, w * 0.95, w * 0.84]; },
      }),
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
    rim.rotation.x = -Math.PI / 2;
    axis.add(rim);

    // --- Lensed images, drawn in the image plane ---------------------------
    const lens = new THREE.Group();
    group.add(lens);

    // Photon ring: light that circled the hole one or more times before
    // escaping. A circle around the shadow from every angle, so it never tilts
    // with the disk, and it sits outside the horizon's silhouette so the black
    // sphere cannot eat it.
    const photon = new THREE.Mesh(
      annulusGeo(R * 1.10, R * 1.46, 128, 5, {
        colorFn: (u, v) => {
          const d = (v - 0.34) / 0.16;
          const w = Math.exp(-d * d) + 0.13 * Math.exp(-Math.pow((v - 0.5) / 0.5, 2));
          return [w, w * 0.93, w * 0.78];
        },
      }),
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
    photon.frustumCulled = false;
    lens.add(photon);

    // Secondary image: the far side of the disk, its light bent up over the
    // top of the shadow and down under the bottom. u=0 is rolled onto the
    // projected spin axis each frame, so the two arcs always stand at its ends.
    const arcs = new THREE.Mesh(
      annulusGeo(R * 1.28, R * 3.2, 168, 8, {
        colorFn: (u, v) => {
          const a = u * Math.PI * 2;
          const m = ((a % Math.PI) + Math.PI) % Math.PI;
          const d = Math.min(m, Math.PI - m) / 0.85;      // to the nearer axis end
          const rad = Math.exp(-Math.pow((v - 0.11) / 0.30, 2)) * (1 - 0.3 * v);
          const w = Math.exp(-d * d) * rad;
          return [w, w * (0.92 - 0.14 * v), w * (0.74 - 0.34 * v)];
        },
      }),
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
    arcs.frustumCulled = false;
    lens.add(arcs);

    // Glare: the bloom the disk throws around the shadow. A ring rather than a
    // sprite, so the shadow itself stays pitch black at its centre.
    const glare = new THREE.Mesh(
      annulusGeo(R * 1.3, R * 7.0, 64, 4, {
        colorFn: (u, v) => {
          const w = 0.22 * Math.exp(-Math.pow(v / 0.42, 2));
          return [w, w * 0.82, w * 0.6];
        },
      }),
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
    glare.frustumCulled = false;
    lens.add(glare);

    const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
    let arcBase = 0.85;
    // Orient the lensed images to the viewer. Transforms set here would
    // otherwise only take effect next frame (the renderer has already built
    // this object's matrices), so the model-view matrices are refreshed by
    // hand - without that the ring visibly lags the camera while it pans.
    function faceCamera(camera) {
      axis.getWorldQuaternion(tmpQ);
      tmpV.set(0, 1, 0).applyQuaternion(tmpQ);
      tmpV.transformDirection(camera.matrixWorldInverse);   // spin axis, camera space
      lens.parent.getWorldQuaternion(tmpQ).invert();
      lens.quaternion.copy(tmpQ).multiply(camera.quaternion);
      arcs.rotation.z = Math.atan2(tmpV.y, tmpV.x);
      // Edge-on, the far side is lifted clear of the shadow and the arcs are at
      // full strength; face-on there is nothing to lift and they fold back into
      // the photon ring.
      const edge = 1 - Math.min(1, Math.abs(tmpV.z));
      arcs.material.opacity = arcBase * Math.pow(edge, 0.7);
      lens.updateMatrixWorld(true);
      lens.children.forEach((c) => {
        c.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, c.matrixWorld);
      });
    }
    lens.children.forEach((c) => { c.onBeforeRender = (r, s, cam) => faceCamera(cam); });

    function tick(t) {
      for (let i = 0; i < bands.length; i++) bands[i].mesh.rotation.z = t * bands[i].speed;
      rim.rotation.z = t * 1.1;
      rim.material.opacity = 0.78 + 0.11 * Math.sin(t * 1.7);
      photon.material.opacity = 0.82 + 0.1 * Math.sin(t * 2.6);
      arcBase = 0.8 + 0.1 * Math.sin(t * 1.1);
    }
    return { tick };
  }

  // Screen-space gravitational lensing pass, shared with the title screen's
  // Hyperverse background (Titlescreen.js), which pioneered it: the sky behind
  // a black hole that sits dead centre in frame is rendered on its own, this
  // shader bends it, and the hole is drawn crisp on top afterwards. Only the
  // background is warped, so the modelled disk/photon-ring/jets keep their
  // shape while the starfield genuinely curves around them. See
  // Scene3D._renderLensed for the render-target choreography that drives it.
  const LENS_VERT = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
  const LENS_FRAG = `
        uniform sampler2D tDiffuse;
        uniform float uAspect;    // canvas width / height
        uniform float uHorizon;   // event-horizon radius, screen units (height = 1)
        uniform float uEinstein;  // Einstein radius in the same units: carries the mass
        uniform float uSpin;      // dimensionless a*
        varying vec2 vUv;

        void main() {
            // Aspect-corrected offset from the hole, which is always centred.
            vec2 d = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
            float r = length(d);
            float rc = max(r, uHorizon * 0.5);

            // Point-mass thin lens: a ray seen at radius r left its source at
            // r * (1 - thetaE^2 / r^2), so the sky is pushed outward from the
            // hole by an offset that falls off as 1/r across the field.
            float k = (uEinstein * uEinstein) / (rc * rc);

            // Kerr frame dragging: a fast-spinning hole also winds the image
            // around its axis, hardest right against the horizon.
            float tw = uSpin * 0.6 * k;
            float cs = cos(tw), sn = sin(tw);
            vec2 src = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs) * (1.0 - k);

            vec4 col = texture2D(tDiffuse, vec2(src.x / uAspect, src.y) + 0.5);

            // Magnification mu = 1 / (1 - (thetaE/theta)^4), which piles light
            // up on the Einstein ring the way a real lens does.
            float x = uEinstein / rc;
            float mu = 1.0 / max(abs(1.0 - x * x * x * x), 0.14);
            col.rgb *= clamp(mu, 0.55, 3.2);

            // Photon capture: nothing gets out from just above the horizon, so
            // the bent field is cut to a dark halo the hole is then drawn into.
            col *= smoothstep(uHorizon, uHorizon * 1.5, r);

            gl_FragColor = col;
        }
    `;
  // Same log-mapped mass -> lens-strength curve as the title screen: real
  // Einstein radii grow as sqrt(M), which across the many decades a black
  // hole's mass (in solar masses) can span is far too wide to put on screen
  // directly, so it is compressed logarithmically instead.
  function lensMassK(massSuns) {
    return Math.max(0.25, Math.min(7,
      0.55 + 0.5 * Math.log10(Math.max(1, massSuns || 10))));
  }

  // A black hole: dark horizon + bright photon ring + tilted accretion disk
  // (+ optional polar jets). `radius` is the event-horizon radius in units.
  // Options: seed, tilt, diskColor, jets (true/false, else a seeded coin flip
  // on jetChance), jetChance, jetScale, jetIntensity, jetColor, jetQuality,
  // style ("interstellar" for the supermassive/hypermassive treatment).
  function buildBlackHole(opts) {
    opts = opts || {};
    const R = opts.radius || 60;
    const rnd = lcg(opts.seed != null ? (opts.seed | 0) : ((Math.random() * 0xffffff) | 0));
    const group = new THREE.Group();
    group.name = "gx-blackhole";

    const horizon = new THREE.Mesh(
      new THREE.SphereGeometry(R, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000 }));
    group.add(horizon);

    // Everything tied to the spin axis lives in one tilted frame: the photon
    // ring and the disk lie in its XZ plane, the jets run along its Y axis. That
    // is what keeps the beams square with the disk, no matter how it is tilted.
    const axis = new THREE.Group();
    axis.rotation.x = opts.tilt != null ? opts.tilt : -(0.22 + rnd() * 0.34);
    axis.rotation.z = (rnd() - 0.5) * 0.5;
    group.add(axis);

    // The giant holes get the Interstellar treatment (see buildGargantuaDisk);
    // everything smaller keeps the plain ring-and-torus disk.
    const grand = opts.style === "interstellar";
    let photon = null, disk = null, tex = null, gargantua = null;
    if (grand) {
      gargantua = buildGargantuaDisk({ R, rnd, axis, group, diskColor: opts.diskColor });
    } else {
      photon = new THREE.Mesh(
        new THREE.TorusGeometry(R * 1.16, R * 0.045, 16, 72),
        new THREE.MeshBasicMaterial({
          color: 0xffe6b0, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      photon.rotation.x = Math.PI / 2;
      axis.add(photon);

      tex = makeAccretionTexture(opts.diskColor);
      const ri = R * 1.3, ro = R * 3.8;
      const dGeo = new THREE.RingGeometry(ri, ro, 128, 1);
      const dp = dGeo.attributes.position, du = dGeo.attributes.uv, dv = new THREE.Vector3();
      for (let i = 0; i < dp.count; i++) {
        dv.fromBufferAttribute(dp, i);
        du.setXY(i, (dv.length() - ri) / (ro - ri), 0.5);
      }
      disk = new THREE.Mesh(dGeo, new THREE.MeshBasicMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      disk.rotation.x = Math.PI / 2;
      axis.add(disk);
    }

    // Jets are the exception, not the rule: only a hole feeding hard enough
    // launches a beam. `jets` forces the answer, otherwise it is a seeded coin
    // flip, so a given hole always looks the same but the population varies.
    const hasJets = typeof opts.jets === "boolean"
      ? opts.jets
      : rnd() < (opts.jetChance != null ? opts.jetChance : 0.35);
    const jets = [];
    let flowTex = null;
    if (hasJets) {
      const len = R * (opts.jetScale != null ? opts.jetScale : 5 + rnd() * 3.5);
      const intensity = opts.jetIntensity != null ? opts.jetIntensity : 1;
      const full = opts.jetQuality !== "low";
      flowTex = makeJetFlowTexture(rnd);
      flowTex.repeat.set(1, 2.5);
      // Relativistic beaming: on a fair share of holes the receding beam is
      // dimmed to a stub, the way real quasars look one-sided.
      const counter = rnd() < 0.4 ? 0.22 + rnd() * 0.2 : 0.8 + rnd() * 0.2;
      [1, -1].forEach((d) => {
        const jet = buildJet({
          R, length: len, flowTex, rnd, full,
          color: opts.jetColor != null ? opts.jetColor : 0x9cc4ff,
          intensity: intensity * (d > 0 ? 1 : counter),
          phase: rnd() * 10,
        });
        if (d < 0) jet.group.rotation.x = Math.PI;
        axis.add(jet.group);
        jets.push(jet);
      });
    }

    function animate(t) {
      if (gargantua) gargantua.tick(t);
      if (disk) disk.rotation.z = t * 0.4;
      if (photon) photon.rotation.z = t * 0.7;
      if (tex) tex.offset.x = (t * 0.05) % 1;
      if (flowTex) flowTex.offset.y = -(t * 0.22) % 1;
      for (let i = 0; i < jets.length; i++) jets[i].tick(t);
    }
    return { group, animate, hasJets, dispose: () => disposeObject3D(group) };
  }

  // Blobby additive cloud texture for nebula layers.
  // One puff of nebula gas. The shape is random, so this cannot be keyed on
  // colour alone - but a nebula stacks a dozen of these and the eye cannot
  // tell one puff's blob pattern from another's, so each colour gets a small
  // POOL of variants painted once and drawn from thereafter. buildNebula used
  // to paint 14 canvases per cloud, and buildGalaxyScale builds seven clouds.
  const NEBULA_TEX_VARIANTS = 8;
  function nebulaTexture(colorRGBA, rnd) {
    const variant = (rnd() * NEBULA_TEX_VARIANTS) | 0;
    return sharedTexture("nebula:" + colorRGBA + "|" + variant, () => {
      // Painted from a variant-derived stream, not the caller's: the pool is
      // shared, so what it looks like must not depend on who asked first.
      const prnd = lcg(0x9e37 + variant * 7919 + hashSeed(colorRGBA));
      const s = 128;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      for (let i = 0; i < 6; i++) {
        const x = s * 0.3 + prnd() * s * 0.4, y = s * 0.3 + prnd() * s * 0.4;
        const r = s * (0.14 + prnd() * 0.26);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, colorRGBA);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      }
      return new THREE.CanvasTexture(cv);
    });
  }

  // Volumetric-ish nebula: stacked camera-facing additive sprites + young stars.
  function buildNebula(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed || 777);
    const group = new THREE.Group();
    group.name = "gx-nebula";
    const baseSize = opts.size || 120;
    const palette = opts.palette || [[255, 120, 160], [130, 165, 255], [200, 130, 255]];
    const layers = opts.layers || 14;
    for (let i = 0; i < layers; i++) {
      const c = palette[(rnd() * palette.length) | 0];
      const tex = nebulaTexture(`rgba(${c[0]},${c[1]},${c[2]},0.5)`, rnd);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.22 + rnd() * 0.24,
      }));
      const sz = baseSize * (0.5 + rnd() * 0.9);
      sp.scale.set(sz, sz * (0.6 + rnd() * 0.6), 1);
      sp.position.set((rnd() - 0.5) * baseSize, (rnd() - 0.5) * baseSize * 0.5, (rnd() - 0.5) * baseSize);
      sp.material.rotation = rnd() * Math.PI;
      group.add(sp);
    }
    const n = 110, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * baseSize;
      pos[i * 3 + 1] = (rnd() - 0.5) * baseSize * 0.5;
      pos[i * 3 + 2] = (rnd() - 0.5) * baseSize;
      const w = 0.6 + rnd() * 0.4; col[i * 3] = w; col[i * 3 + 1] = w; col[i * 3 + 2] = w;
    }
    group.add(pointCloud(pos, col, 3, 0.9));
    // Embedded protostars: nebulae are stellar nurseries, so most get a few
    // warm, pulsing infant stars buried in the gas (opts.protostars overrides
    // the seeded roll; 0 disables).
    const protoCount = opts.protostars != null
      ? opts.protostars
      : (rnd() < 0.6 ? 1 + ((rnd() * 3) | 0) : 0);
    const protos = [];
    for (let i = 0; i < protoCount; i++) {
      const gl = makeGlowSprite("rgba(255,190,120,0.95)");
      const s = baseSize * (0.05 + rnd() * 0.05);
      gl.sprite.position.set(
        (rnd() - 0.5) * baseSize * 0.55,
        (rnd() - 0.5) * baseSize * 0.3,
        (rnd() - 0.5) * baseSize * 0.55);
      gl.sprite.scale.set(s, s, 1);
      group.add(gl.sprite);
      protos.push({ mat: gl.mat, sprite: gl.sprite, base: s, phase: rnd() * 10, rate: 1.2 + rnd() * 2.2 });
    }
    function animate(t) {
      for (const p of protos) {
        const w = 1 + 0.22 * Math.sin(t * p.rate + p.phase);
        p.sprite.scale.set(p.base * w, p.base * w, 1);
        p.mat.opacity = 0.65 + 0.3 * Math.sin(t * p.rate * 1.7 + p.phase);
      }
    }
    return { group, animate, dispose: () => disposeObject3D(group) };
  }

  // ==========================================================================
  // Famous real-world nebulae. Every other nebula in the sim is a random
  // blobby buildNebula() cloud; these ~20 are hand-shaped to read as their
  // real telescope silhouette (the Horsehead's profile, the Pillars of
  // Creation, the Ring/Helix donuts, ...) and placed at their real galactic
  // longitude/latitude/distance, so they cluster near the Sun the way the
  // real ones do. A few reuse an existing hardcoded Systems.json star as
  // their anchor (Orion Nebula <-> Hatsya, Horsehead <-> Alnitak, Barnard's
  // Loop <-> Meissa, Witch Head <-> Rigel, Carina <-> Eta Carinae, Crab <->
  // Crab Pulsar) so the nebula sits exactly where that real star already is;
  // the rest get their own small set of named stars generated by
  // GalaxySim_DataManager.generateFamousNebulaSystems() (see FAMOUS_NEBULAE
  // below, shared with that file).
  // ==========================================================================

  function hexA(hex, a) {
    const n = parseInt(String(hex).slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function radialFill(ctx, x, y, r, stops) {
    if (r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function softCloud(ctx, s, rnd, n, cx, cy, spread, rMin, rMax, colorFn) {
    for (let i = 0; i < n; i++) {
      const x = cx + (rnd() - 0.5) * spread;
      const y = cy + (rnd() - 0.5) * spread * 0.7;
      const r = rMin + rnd() * (rMax - rMin);
      radialFill(ctx, x, y, r, colorFn());
    }
  }

  // Galactic (longitude, latitude, distance-ly) -> Sun-relative local ly
  // {x,y,z}, matching galacticWorld()'s convention (x: away from the core,
  // y: rotation-plane depth, z: height). l=0 faces the core, hence -x.
  function galLB(lDeg, bDeg, dLy) {
    const l = (lDeg * Math.PI) / 180, b = (bDeg * Math.PI) / 180;
    const cb = Math.cos(b);
    return { x: -dLy * cb * Math.cos(l), y: dLy * cb * Math.sin(l), z: dLy * Math.sin(b) };
  }

  // Each shape draws into a fresh 0..s canvas. `colors` is the entry's hex
  // array; dark ones paint their own near-black fills instead.
  const NEBULA_SHAPES = {
    orion(ctx, s, rnd, colors) {
      const cx = s * 0.5, cy = s * 0.55;
      radialFill(ctx, cx, cy, s * 0.46,
        [[0, hexA(colors[2], 0.35)], [0.5, hexA(colors[0], 0.22)], [1, "rgba(0,0,0,0)"]]);
      softCloud(ctx, s, rnd, 10, cx - s * 0.08, cy - s * 0.04, s * 0.34, s * 0.08, s * 0.20,
        () => [[0, hexA(colors[0], 0.55)], [0.6, hexA(colors[1], 0.3)], [1, "rgba(0,0,0,0)"]]);
      softCloud(ctx, s, rnd, 6, cx + s * 0.14, cy + s * 0.10, s * 0.22, s * 0.05, s * 0.13,
        () => [[0, hexA(colors[1], 0.5)], [1, "rgba(0,0,0,0)"]]);
      radialFill(ctx, cx, cy, s * 0.09,
        [[0, "rgba(255,255,255,0.95)"], [0.4, hexA(colors[0], 0.8)], [1, "rgba(0,0,0,0)"]]);
      ctx.save();
      ctx.filter = "blur(3px)";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.02, cy - s * 0.20);
      ctx.lineTo(cx - s * 0.16, cy - s * 0.06);
      ctx.lineTo(cx - s * 0.03, cy - s * 0.02);
      ctx.closePath();
      ctx.fillStyle = "rgba(10,6,10,0.55)";
      ctx.fill();
      ctx.restore();
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2, r = rnd() * s * 0.03;
        radialFill(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, s * 0.012,
          [[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]);
      }
    },
    horsehead(ctx, s, rnd, colors) {
      const g = ctx.createLinearGradient(0, s * 0.28, 0, s * 0.86);
      g.addColorStop(0, hexA(colors[1], 0.05));
      g.addColorStop(0.45, hexA(colors[0], 0.55));
      g.addColorStop(1, hexA(colors[0], 0.15));
      ctx.fillStyle = g;
      ctx.fillRect(s * 0.06, s * 0.26, s * 0.88, s * 0.6);
      ctx.filter = "blur(4px)";
      ctx.fillStyle = "rgba(8,5,8,0.7)";
      ctx.fillRect(s * 0.04, s * 0.74, s * 0.92, s * 0.14);
      ctx.filter = "none";
      // A real horse-head-in-profile silhouette, facing left: arched neck
      // and mane rising into the poll, a pointed ear, a browed forehead
      // dropping down the nose bridge to a projecting muzzle with a
      // notched nostril, then back along the mouth, jaw and throat.
      const pts = [
        [0.64, 0.90], [0.61, 0.76], [0.56, 0.60], [0.50, 0.49],
        [0.44, 0.41], [0.40, 0.35], [0.365, 0.305], [0.35, 0.345],
        [0.365, 0.395], [0.335, 0.455], [0.295, 0.515], [0.235, 0.575],
        [0.20, 0.63], [0.235, 0.665], [0.28, 0.665], [0.305, 0.70],
        [0.345, 0.715], [0.40, 0.725], [0.465, 0.765], [0.545, 0.825],
      ];
      ctx.filter = "blur(1.5px)";
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s);
      ctx.closePath();
      ctx.fillStyle = "rgba(6,4,7,0.92)";
      ctx.fill();
      ctx.filter = "none";
    },
    // Barnard's Loop: the blast shell around Orion. It was one blurred arc()
    // stroke - a drawing-program circle segment, even line width and all - and
    // read as a cartoon hoop. A shock front is ragged, so it is built from
    // overlapping puffs walked around the arc, each its own size and
    // brightness, thickest where the shell is edge-on and fraying at the ends.
    loop(ctx, s, rnd, colors) {
      const cx = s * 0.42, cy = s * 0.5, r = s * 0.42;
      const A0 = Math.PI * 0.15, A1 = Math.PI * 1.65;
      const N = 52;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const a = A0 + (A1 - A0) * t;
        const fade = 0.35 + Math.sin(t * Math.PI) * 0.9;
        // The radius wanders, so the rim is not a perfect circle.
        const rr = r * (1 + (rnd() - 0.5) * 0.12);
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        const blob = s * (0.030 + rnd() * 0.050);
        radialFill(ctx, px, py, blob, [
          [0, hexA(colors[0], 0.16 * fade)],
          [0.5, hexA(colors[0], 0.09 * fade)],
          [1, "rgba(0,0,0,0)"],
        ]);
      }
      // A thin interior haze so the shell encloses something.
      softCloud(ctx, s, rnd, 7, cx, cy, s * 0.30, s * 0.06, s * 0.15,
        () => [[0, hexA(colors[0], 0.05)], [1, "rgba(0,0,0,0)"]]);
    },
    witchhead(ctx, s, rnd, colors) {
      softCloud(ctx, s, rnd, 14, s * 0.5, s * 0.5, s * 0.5, s * 0.05, s * 0.16,
        () => [[0, hexA(colors[0], 0.28)], [1, "rgba(0,0,0,0)"]]);
      ctx.filter = "blur(2px)";
      ctx.strokeStyle = hexA(colors[1], 0.5);
      ctx.lineWidth = s * 0.025;
      ctx.beginPath();
      ctx.moveTo(s * 0.30, s * 0.25);
      ctx.quadraticCurveTo(s * 0.60, s * 0.30, s * 0.55, s * 0.55);
      ctx.quadraticCurveTo(s * 0.50, s * 0.70, s * 0.65, s * 0.78);
      ctx.stroke();
      ctx.filter = "none";
    },
    // The Rosette: a hollow H II region blown open by the cluster inside it.
    // It was a clean radial annulus with a few dots on it, which is a washer
    // rather than a nebula. Now the rim is a ring of overlapping puffs at a
    // wandering radius, brighter on one side the way the real one is, with
    // ragged streamers reaching into the cavity.
    ring(ctx, s, rnd, colors) {
      const cx = s * 0.5, cy = s * 0.5;
      // A faint inner glow, so the hole is evacuated rather than cut out.
      radialFill(ctx, cx, cy, s * 0.40, [
        [0, "rgba(0,0,0,0)"], [0.55, hexA(colors[1], 0.05)],
        [0.85, hexA(colors[0], 0.10)], [1, "rgba(0,0,0,0)"],
      ]);
      const N = 60;
      const bright = rnd() * Math.PI * 2;   // the limb that faces us
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.08;
        const lean = 0.55 + 0.75 * (0.5 + 0.5 * Math.cos(a - bright));
        const rr = s * (0.36 + (rnd() - 0.5) * 0.07);
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        const blob = s * (0.045 + rnd() * 0.055);
        radialFill(ctx, px, py, blob, [
          [0, hexA(colors[0], 0.16 * lean)],
          [0.45, hexA(colors[1], 0.10 * lean)],
          [1, "rgba(0,0,0,0)"],
        ]);
      }
      // Streamers and elephant trunks pulled in toward the cavity.
      for (let i = 0; i < 12; i++) {
        const a = rnd() * Math.PI * 2;
        const r0 = s * 0.34, r1 = s * (0.16 + rnd() * 0.12);
        for (let k = 0; k < 5; k++) {
          const t = k / 4;
          const rr = r0 + (r1 - r0) * t;
          const aa = a + (rnd() - 0.5) * 0.10;
          radialFill(ctx, cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr,
            s * (0.030 - t * 0.015),
            [[0, hexA(colors[0], 0.11 * (1 - t))], [1, "rgba(0,0,0,0)"]]);
        }
      }
      // The young cluster that hollowed it out.
      for (let i = 0; i < 10; i++) {
        const a = rnd() * Math.PI * 2, r = rnd() * s * 0.16;
        radialFill(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, s * 0.012,
          [[0, "rgba(255,255,255,0.9)"], [1, "rgba(255,255,255,0)"]]);
      }
    },
    cone(ctx, s, rnd, colors) {
      radialFill(ctx, s * 0.5, s * 0.62, s * 0.4,
        [[0, hexA(colors[1], 0.35)], [0.6, hexA(colors[0], 0.2)], [1, "rgba(0,0,0,0)"]]);
      ctx.filter = "blur(3px)";
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.18);
      ctx.lineTo(s * 0.58, s * 0.75);
      ctx.lineTo(s * 0.42, s * 0.75);
      ctx.closePath();
      ctx.fillStyle = "rgba(8,6,10,0.75)";
      ctx.fill();
      ctx.filter = "none";
      for (let i = 0; i < 10; i++) {
        const x = s * (0.3 + rnd() * 0.4), y = s * (0.15 + rnd() * 0.3);
        radialFill(ctx, x, y, s * 0.012, [[0, "rgba(255,255,255,0.9)"], [1, "rgba(255,255,255,0)"]]);
      }
    },
    pillars(ctx, s, rnd, colors) {
      radialFill(ctx, s * 0.5, s * 0.55, s * 0.48,
        [[0, hexA(colors[0], 0.4)], [0.55, hexA(colors[1], 0.22)], [1, "rgba(0,0,0,0)"]]);
      ctx.filter = "blur(2.5px)";
      [0.36, 0.5, 0.63].forEach((bx, i) => {
        const topW = s * 0.02, botW = s * (0.07 + (i % 2) * 0.01);
        const topY = s * (0.18 + i * 0.02), botY = s * 0.82;
        ctx.beginPath();
        ctx.moveTo(bx * s - botW / 2, botY);
        ctx.lineTo(bx * s - topW / 2, topY);
        ctx.lineTo(bx * s + topW / 2, topY);
        ctx.lineTo(bx * s + botW / 2, botY);
        ctx.closePath();
        ctx.fillStyle = "rgba(30,14,10,0.8)";
        ctx.fill();
      });
      ctx.filter = "none";
      for (let i = 0; i < 8; i++) {
        const x = s * (0.25 + rnd() * 0.5), y = s * (0.12 + rnd() * 0.14);
        radialFill(ctx, x, y, s * 0.012, [[0, "rgba(255,255,255,0.9)"], [1, "rgba(255,255,255,0)"]]);
      }
    },
    trifid(ctx, s, rnd, colors) {
      const cx = s * 0.45, cy = s * 0.5;
      radialFill(ctx, cx, cy, s * 0.34,
        [[0, hexA(colors[0], 0.55)], [0.7, hexA(colors[0], 0.25)], [1, "rgba(0,0,0,0)"]]);
      radialFill(ctx, s * 0.74, s * 0.38, s * 0.16, [[0, hexA(colors[1], 0.45)], [1, "rgba(0,0,0,0)"]]);
      ctx.filter = "blur(2px)";
      ctx.strokeStyle = "rgba(10,6,10,0.7)";
      ctx.lineWidth = s * 0.025;
      [0.1, 2.3, 4.4].forEach((ang) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * s * 0.3, cy + Math.sin(ang) * s * 0.3);
        ctx.stroke();
      });
      ctx.filter = "none";
    },
    lagoon(ctx, s, rnd, colors) {
      ctx.save();
      ctx.translate(s * 0.5, s * 0.5);
      ctx.scale(1.3, 0.75);
      ctx.translate(-s * 0.5, -s * 0.5);
      radialFill(ctx, s * 0.5, s * 0.5, s * 0.4,
        [[0, hexA(colors[0], 0.5)], [0.6, hexA(colors[1], 0.25)], [1, "rgba(0,0,0,0)"]]);
      ctx.restore();
      ctx.filter = "blur(2px)";
      ctx.fillStyle = "rgba(10,6,8,0.6)";
      ctx.beginPath();
      ctx.moveTo(s * 0.42, s * 0.42); ctx.lineTo(s * 0.58, s * 0.42); ctx.lineTo(s * 0.50, s * 0.5);
      ctx.lineTo(s * 0.58, s * 0.58); ctx.lineTo(s * 0.42, s * 0.58); ctx.lineTo(s * 0.50, s * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.filter = "none";
      for (let i = 0; i < 8; i++) {
        const x = s * (0.35 + rnd() * 0.3), y = s * (0.4 + rnd() * 0.2);
        radialFill(ctx, x, y, s * 0.012, [[0, "rgba(255,255,255,0.9)"], [1, "rgba(255,255,255,0)"]]);
      }
    },
    pipe(ctx, s, rnd, colors) {
      ctx.filter = "blur(3px)";
      ctx.fillStyle = colors[0] ? hexA(colors[0], 0.85) : "rgba(10,8,12,0.85)";
      ctx.beginPath();
      ctx.moveTo(s * 0.12, s * 0.62); ctx.lineTo(s * 0.62, s * 0.46);
      ctx.lineTo(s * 0.64, s * 0.54); ctx.lineTo(s * 0.14, s * 0.70);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s * 0.72, s * 0.42, s * 0.14, s * 0.18, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.filter = "none";
    },
    snake(ctx, s, rnd, colors) {
      ctx.filter = "blur(2.5px)";
      ctx.strokeStyle = colors[0] ? hexA(colors[0], 0.85) : "rgba(10,8,12,0.85)";
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.2);
      ctx.bezierCurveTo(s * 0.6, s * 0.25, s * 0.1, s * 0.5, s * 0.55, s * 0.6);
      ctx.bezierCurveTo(s * 0.9, s * 0.68, s * 0.5, s * 0.8, s * 0.75, s * 0.9);
      ctx.stroke();
      ctx.filter = "none";
    },
    globule(ctx, s, rnd, colors) {
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(4,3,5,0.9)";
      ctx.fill();
      ctx.filter = "blur(2px)";
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(4,3,5,0.4)";
      ctx.lineWidth = s * 0.04;
      ctx.stroke();
      ctx.filter = "none";
    },
    northamerica(ctx, s, rnd, colors) {
      const pts = [
        [0.20, 0.30], [0.30, 0.20], [0.55, 0.18], [0.62, 0.28], [0.78, 0.30],
        [0.82, 0.42], [0.70, 0.50], [0.75, 0.60], [0.65, 0.72], [0.55, 0.68],
        [0.50, 0.78], [0.40, 0.72], [0.38, 0.58], [0.25, 0.55], [0.20, 0.42],
      ];
      ctx.filter = "blur(2px)";
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s);
      ctx.closePath();
      const g = ctx.createRadialGradient(s * 0.5, s * 0.45, 0, s * 0.5, s * 0.45, s * 0.4);
      g.addColorStop(0, hexA(colors[0], 0.6));
      g.addColorStop(1, hexA(colors[1], 0.25));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.filter = "blur(3px)";
      ctx.beginPath();
      ctx.ellipse(s * 0.58, s * 0.62, s * 0.09, s * 0.07, 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(8,5,8,0.7)";
      ctx.fill();
      ctx.filter = "none";
    },
    pelican(ctx, s, rnd, colors) {
      const pts = [
        [0.15, 0.55], [0.10, 0.45], [0.20, 0.40], [0.30, 0.30],
        [0.36, 0.36], [0.34, 0.46], [0.42, 0.42], [0.55, 0.40],
        [0.72, 0.44], [0.85, 0.52], [0.80, 0.60], [0.65, 0.58],
        [0.55, 0.66], [0.40, 0.70], [0.28, 0.66], [0.20, 0.60],
      ];
      ctx.filter = "blur(2px)";
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s);
      ctx.closePath();
      const g = ctx.createRadialGradient(s * 0.5, s * 0.5, 0, s * 0.5, s * 0.5, s * 0.4);
      g.addColorStop(0, hexA(colors[0], 0.55));
      g.addColorStop(1, hexA(colors[1], 0.25));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.filter = "none";
    },
    veil(ctx, s, rnd, colors) {
      ctx.filter = "blur(1.5px)";
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = hexA(colors[i % 2], 0.35 + rnd() * 0.25);
        ctx.lineWidth = s * (0.008 + rnd() * 0.012);
        ctx.beginPath();
        const x0 = s * (0.1 + rnd() * 0.2), y0 = s * (0.15 + rnd() * 0.7);
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(
          x0 + s * (0.2 + rnd() * 0.2), y0 + s * (rnd() * 0.3 - 0.15),
          x0 + s * (0.4 + rnd() * 0.2), y0 + s * (rnd() * 0.3 - 0.15),
          x0 + s * (0.6 + rnd() * 0.2), y0 + s * (rnd() * 0.3 - 0.15));
        ctx.stroke();
      }
      ctx.filter = "none";
    },
    ring2(ctx, s, rnd, colors) {
      const cx = s * 0.5, cy = s * 0.5;
      radialFill(ctx, cx, cy, s * 0.42, [
        [0, "rgba(0,0,0,0)"], [0.30, "rgba(0,0,0,0)"], [0.38, hexA(colors[0], 0.7)],
        [0.55, hexA(colors[1], 0.4)], [0.75, hexA(colors[0], 0.15)], [1, "rgba(0,0,0,0)"],
      ]);
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2, rr = s * (0.32 + rnd() * 0.12);
        radialFill(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, s * 0.025,
          [[0, hexA(colors[0], 0.4)], [1, "rgba(0,0,0,0)"]]);
      }
    },
    cateye(ctx, s, rnd, colors) {
      const cx = s * 0.5, cy = s * 0.5;
      [0.42, 0.30, 0.18].forEach((r, i) => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * r, s * r * 0.82, 0.3, 0, Math.PI * 2);
        ctx.strokeStyle = hexA(colors[i % 2], 0.35 - i * 0.06);
        ctx.lineWidth = s * 0.02;
        ctx.stroke();
      });
      radialFill(ctx, cx, cy, s * 0.10,
        [[0, "rgba(255,255,255,0.9)"], [0.4, hexA(colors[0], 0.8)], [1, "rgba(0,0,0,0)"]]);
    },
    crab(ctx, s, rnd, colors) {
      const cx = s * 0.5, cy = s * 0.5;
      radialFill(ctx, cx, cy, s * 0.36,
        [[0, hexA(colors[1], 0.35)], [0.6, hexA(colors[0], 0.25)], [1, "rgba(0,0,0,0)"]]);
      ctx.filter = "blur(1px)";
      for (let i = 0; i < 22; i++) {
        const a = rnd() * Math.PI * 2, r0 = s * 0.06, r1 = s * (0.18 + rnd() * 0.18);
        ctx.strokeStyle = hexA(colors[i % 2], 0.4 + rnd() * 0.3);
        ctx.lineWidth = s * 0.006;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        const jitter = (rnd() - 0.5) * 0.6;
        ctx.quadraticCurveTo(
          cx + Math.cos(a + jitter) * r1 * 0.7, cy + Math.sin(a + jitter) * r1 * 0.7,
          cx + Math.cos(a + jitter * 1.4) * r1, cy + Math.sin(a + jitter * 1.4) * r1);
        ctx.stroke();
      }
      ctx.filter = "none";
    },
    carina(ctx, s, rnd, colors) {
      softCloud(ctx, s, rnd, 16, s * 0.5, s * 0.5, s * 0.5, s * 0.08, s * 0.22,
        () => [[0, hexA(colors[0], 0.45)], [0.6, hexA(colors[1], 0.25)], [1, "rgba(0,0,0,0)"]]);
      ctx.filter = "blur(3px)";
      ctx.beginPath();
      ctx.ellipse(s * 0.46, s * 0.5, s * 0.06, s * 0.1, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(10,6,8,0.6)";
      ctx.fill();
      ctx.filter = "none";
      for (let i = 0; i < 6; i++) {
        const x = s * (0.35 + rnd() * 0.3), y = s * (0.35 + rnd() * 0.3);
        radialFill(ctx, x, y, s * 0.012, [[0, "rgba(255,255,255,0.9)"], [1, "rgba(255,255,255,0)"]]);
      }
    },
    coalsack(ctx, s, rnd, colors) {
      ctx.filter = "blur(4px)";
      ctx.fillStyle = "rgba(6,4,8,0.82)";
      ctx.beginPath();
      const cx = s * 0.5, cy = s * 0.5, n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = s * 0.3 * (0.75 + rnd() * 0.35);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.85;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.filter = "none";
    },
  };

  // Flat catalog of hardcoded real nebulae (Milky Way, all within ~10,000 ly
  // of the Sun). `anchorStar` reuses an existing Systems.json star's position
  // instead of computing one from l/b/d, so the nebula sits exactly where
  // that real star already lives; `stars` are new named stars generated by
  // GalaxySim_DataManager.generateFamousNebulaSystems() for entries with no
  // anchor. Shared with that file via window.GalaxySim.Scene3DCosmos below.
  // i18n-ignore-start  the same, for the hand-placed nebulae: every name,
  // designation and anchor star is real and stays as written
  const FAMOUS_NEBULAE = [
    { name: "Orion Nebula", cat: "M42 / NGC 1976", type: "Emission/reflection nebula (H II region)",
      shape: "orion", l: 209.0, b: -19.4, d: 1344, anchorStar: "Hatsya", size: 30, protostars: 4,
      diameter: "~24 ly", distance: "1,344 ly", stars: "4 (Trapezium Cluster)",
      colors: ["#ff77aa", "#ffb37a", "#8fd7ff"],
      stars_: [
        { name: "Becklin-Neugebauer Object", type: "PROTOSTAR", mass: 8, radius: 5, temperature: 3600 },
        { name: "Orion Source I", type: "PROTOSTAR", mass: 6.7, radius: 4.5, temperature: 3400 },
      ] },
    { name: "Horsehead Nebula", cat: "Barnard 33 (IC 434)", type: "Dark nebula silhouette",
      shape: "horsehead", l: 206.8, b: -16.7, d: 1375, anchorStar: "Alnitak", size: 24, dark: true,
      diameter: "~3.5 ly", distance: "1,375 ly", stars: "1 (Alnitak)",
      colors: ["#d1425f", "#ff8b6b"] },
    { name: "Barnard's Loop", cat: "Sh2-276", type: "Emission nebula (SNR-like arc)",
      shape: "loop", l: 205.5, b: -17.0, d: 1600, anchorStar: "Meissa", size: 95,
      diameter: "~300 ly", distance: "1,600 ly", stars: "1 (Meissa)",
      colors: ["#b5304a"] },
    { name: "Witch Head Nebula", cat: "IC 2118", type: "Reflection nebula",
      shape: "witchhead", l: 206.9, b: -27.0, d: 900, anchorStar: "Rigel", size: 26,
      diameter: "~50 ly", distance: "900 ly", stars: "1 (Rigel)",
      colors: ["#bcd6ff", "#e7eeff"] },
    { name: "Rosette Nebula", cat: "NGC 2237 (Caldwell 49)", type: "Emission nebula",
      shape: "ring", l: 206.0, b: -2.1, d: 5200, size: 46, protostars: 2,
      diameter: "~130 ly", distance: "5,200 ly", stars: "2 (NGC 2244 cluster)",
      colors: ["#ff5b7a", "#ff9d6b"],
      stars_: [
        { name: "HD 46150", type: "O", mass: 34, radius: 12, temperature: 38000 },
        { name: "HD 46223", type: "O", mass: 30, radius: 10, temperature: 37000 },
        { name: "AFGL 961", type: "PROTOSTAR", mass: 9, radius: 5.5, temperature: 3300 },
      ] },
    { name: "Cone Nebula", cat: "NGC 2264", type: "Dark + emission nebula",
      shape: "cone", l: 202.9, b: 2.2, d: 2700, size: 20, protostars: 1,
      diameter: "~7 ly", distance: "2,700 ly", stars: "1 (S Monocerotis)",
      colors: ["#5fa8ff", "#ff9bd2"],
      stars_: [
        { name: "S Monocerotis", type: "O", mass: 29, radius: 9.9, temperature: 38500 },
        { name: "NGC 2264 IRS 1", type: "PROTOSTAR", mass: 5, radius: 4, temperature: 3200 },
      ] },
    { name: "Eagle Nebula", cat: "M16 / NGC 6611", type: "Emission nebula (Pillars of Creation)",
      shape: "pillars", l: 17.0, b: 0.8, d: 7000, size: 34, protostars: 3,
      diameter: "~70 ly", distance: "7,000 ly", stars: "2 (NGC 6611 cluster)",
      colors: ["#ffb15e", "#ff7096"],
      stars_: [
        { name: "HD 168076", type: "O", mass: 39, radius: 15, temperature: 40000 },
        { name: "HD 168075", type: "O", mass: 20, radius: 8, temperature: 34000 },
        { name: "M16 ES-1", type: "PROTOSTAR", mass: 4, radius: 3.5, temperature: 3100 },
        { name: "M16 ES-2", type: "PROTOSTAR", mass: 2.2, radius: 3, temperature: 2900 },
      ] },
    { name: "Trifid Nebula", cat: "M20 / NGC 6514", type: "Emission + reflection nebula",
      shape: "trifid", l: 7.0, b: -1.0, d: 5200, size: 24, protostars: 2,
      diameter: "~40 ly", distance: "5,200 ly", stars: "1 (HN 40)",
      colors: ["#ff6f91", "#6fa8ff"],
      stars_: [
        { name: "HN 40", type: "O", mass: 25, radius: 9, temperature: 36000 },
        { name: "Trifid TC2", type: "PROTOSTAR", mass: 1.8, radius: 2.8, temperature: 3000 },
      ] },
    { name: "Lagoon Nebula", cat: "M8 / NGC 6523", type: "Emission nebula",
      shape: "lagoon", l: 6.0, b: -1.2, d: 4100, size: 30, protostars: 2,
      diameter: "~110 ly", distance: "4,100 ly", stars: "1 (Herschel 36)",
      colors: ["#ff6d7d", "#ffb98f"],
      stars_: [
        { name: "Herschel 36", type: "O", mass: 22, radius: 9, temperature: 35000 },
        { name: "M8E-IR", type: "PROTOSTAR", mass: 6, radius: 4.2, temperature: 3300 },
      ] },
    { name: "Pipe Nebula", cat: "Barnard 59/65-67/78", type: "Dark nebula",
      shape: "pipe", l: 0.6, b: 3.8, d: 650, size: 42, dark: true,
      diameter: "~50 ly", distance: "650 ly", colors: ["#120e14"] },
    { name: "Snake Nebula", cat: "Barnard 72", type: "Dark nebula",
      shape: "snake", l: 6.6, b: 4.5, d: 650, size: 16, dark: true,
      diameter: "~7 ly", distance: "650 ly", colors: ["#100c12"] },
    { name: "Barnard 68", cat: "Dark globule", type: "Dark nebula (Bok globule)",
      shape: "globule", l: 6.0, b: -3.5, d: 500, size: 6, dark: true,
      diameter: "~0.5 ly", distance: "500 ly", colors: ["#0a080a"] },
    { name: "North America Nebula", cat: "NGC 7000 (Caldwell 20)", type: "Emission nebula",
      shape: "northamerica", l: 85.2, b: -1.0, d: 2590, size: 40, protostars: 2,
      diameter: "~100 ly", distance: "2,590 ly", colors: ["#ff6a55", "#ffb15e"] },
    { name: "Pelican Nebula", cat: "IC 5070", type: "Emission nebula",
      shape: "pelican", l: 85.5, b: -1.6, d: 2000, size: 28, protostars: 2,
      diameter: "~30 ly", distance: "2,000 ly", colors: ["#ff7a5c", "#ffcf8a"] },
    { name: "Veil Nebula", cat: "NGC 6960/6992 (Cygnus Loop)", type: "Supernova remnant",
      shape: "veil", l: 74.0, b: -8.5, d: 2400, size: 46,
      diameter: "~130 ly", distance: "2,400 ly", colors: ["#5fd7c4", "#ff7d6b"] },
    { name: "Ring Nebula", cat: "M57 / NGC 6720", type: "Planetary nebula",
      shape: "ring2", l: 63.2, b: 13.1, d: 2300, size: 12,
      diameter: "~1.3 ly", distance: "2,300 ly", stars: "1 (central white dwarf)",
      colors: ["#63e3c9", "#c98bff"],
      stars_: [{ name: "Ring Nebula Central Star", type: "WHITE_DWARF", mass: 0.6, radius: 0.03, temperature: 125000 }] },
    { name: "Helix Nebula", cat: "NGC 7293 (Caldwell 63)", type: "Planetary nebula",
      shape: "ring2", l: 36.0, b: -60.0, d: 650, size: 16,
      diameter: "~2.5 ly", distance: "650 ly", stars: "1 (central white dwarf)",
      colors: ["#7de3a8", "#ff8f6b"],
      stars_: [{ name: "WD 2226-210", type: "WHITE_DWARF", mass: 0.7, radius: 0.03, temperature: 120000 }] },
    { name: "Cat's Eye Nebula", cat: "NGC 6543 (Caldwell 6)", type: "Planetary nebula",
      shape: "cateye", l: 96.4, b: 29.9, d: 3300, size: 10,
      diameter: "~0.2 ly (core)", distance: "3,300 ly", stars: "1 (central white dwarf)",
      colors: ["#7fffd4", "#5fa8ff"],
      stars_: [{ name: "BD+66 1066", type: "WHITE_DWARF", mass: 0.65, radius: 0.03, temperature: 82000 }] },
    { name: "Crab Nebula", cat: "M1 / NGC 1952", type: "Supernova remnant",
      shape: "crab", l: 184.6, b: -5.8, d: 6500, anchorStar: "Crab Pulsar", size: 18,
      diameter: "~11 ly", distance: "6,500 ly", stars: "1 (Crab Pulsar)",
      colors: ["#8fd0ff", "#ffb15e"] },
    { name: "Carina Nebula", cat: "NGC 3372", type: "Emission nebula",
      shape: "carina", l: 287.4, b: -0.6, d: 8500, anchorStar: "Eta Carinae", size: 56, protostars: 4,
      diameter: "~300 ly", distance: "8,500 ly", stars: "1 (Eta Carinae)",
      colors: ["#ff6b4a", "#ffcf6b"],
      stars_: [
        { name: "HH 666 IRS", type: "PROTOSTAR", mass: 3.5, radius: 3.4, temperature: 3100 },
        { name: "Carina OMC-1", type: "PROTOSTAR", mass: 7.5, radius: 5, temperature: 3500 },
      ] },
    { name: "Coalsack Nebula", cat: "Dark nebula", type: "Dark nebula",
      shape: "coalsack", l: 303.0, b: -2.0, d: 600, size: 34, dark: true,
      diameter: "~35 ly", distance: "600 ly", colors: ["#0d0a10"] },
  ];
  // i18n-ignore-end
  // `stars` above is the short display label shown in the info panel; the
  // real generation specs live under `stars_` so the display string stays
  // hand-written (it can describe an anchor star or a whole cluster) without
  // fighting an auto-derived count. Normalize both onto `.starsSpec` here.
  FAMOUS_NEBULAE.forEach((spec) => { spec.starsSpec = spec.stars_ || []; });

  // One hand-shaped nebula sprite. Dark nebulae use normal blending (their
  // texture paints near-black over the alpha channel, which actually darkens
  // whatever starfield sits behind it); every other type is additive, like
  // the rest of the sim's glow sprites.
  // One hand-drawn silhouette, painted once per shape and kept for the session.
  // It used to be repainted on every entry to the galaxy view - 21 nebulae at
  // 384 x 384 apiece, every time.
  function famousNebulaTexture(spec) {
    const key = "famous:" + spec.shape + ":" + (spec.colors || []).join(",");
    return sharedTexture(key, () => {
      const rnd = lcg(hashSeed(spec.name));
      // These are the one-off hand-shaped silhouettes (the Horsehead's profile,
      // the Pillars, ...), so the resolution buys real crispness on the
      // curved/blurred paths and is paid for exactly once.
      const s = 384;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const ctx = cv.getContext("2d");
      const draw = NEBULA_SHAPES[spec.shape] || NEBULA_SHAPES.orion;
      draw(ctx, s, rnd, spec.colors || ["#ffffff", "#ffffff"]);
      return new THREE.CanvasTexture(cv);
    });
  }

  /**
   * A famous nebula as a VOLUME rather than a picture of one.
   *
   * Each of these was a single flat card: one sprite, always square-on to the
   * camera, that slid across the stars as a cut-out and turned with the view
   * like a decal. Real nebulae are the one thing out here with no surface at
   * all, so the cut-out was the worst possible way to draw them.
   *
   * The silhouette is still the drawing - the Horsehead has to stay a
   * horsehead - but it is now stacked: a handful of copies at different depths
   * along the view axis, each a little larger, fainter and turned a little
   * further than the one in front. Sprites face the camera, so the depth
   * offsets read as PARALLAX the moment it moves: the near layers slide over
   * the far ones and the cloud has an inside. The stack breathes, slowly and
   * out of phase, so the gas drifts instead of sitting still.
   */
  function buildFamousNebulaSprite(spec) {
    const rnd = lcg(hashSeed(spec.name + ":vol"));
    const tex = famousNebulaTexture(spec);
    const group = new THREE.Group();
    group.name = "gx-nebula-" + spec.shape;

    // A dark nebula is a silhouette painted OVER the stars, so its layers
    // stack multiplicatively and a deep pile turns it into a black hole in the
    // sky; it gets a shallower stack at lower opacity. The glowing ones add.
    const dark = !!spec.dark;
    const LAYERS = dark ? 4 : 7;
    const depth = spec.size * 0.42;   // how far the stack reaches front to back

    const layers = [];
    for (let i = 0; i < LAYERS; i++) {
      const t = LAYERS === 1 ? 0 : i / (LAYERS - 1);   // 0 = front, 1 = back
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
      });
      // The front of the cloud is the brightest and tightest; the back is
      // wider and fainter, which is what gives the stack a sense of depth
      // rather than looking like one sprite drawn several times.
      const base = dark ? 0.5 / LAYERS + 0.16 : 0.34 - t * 0.2;
      mat.opacity = base;
      const sp = new THREE.Sprite(mat);
      const spread = 1 + t * 0.55 + (rnd() - 0.5) * 0.12;
      sp.scale.set(spec.size * spread, spec.size * spread, 1);
      // Along the view axis at build time; the parallax comes from the camera
      // moving relative to these, not from the offsets themselves.
      sp.position.set(
        (rnd() - 0.5) * spec.size * 0.16,
        (rnd() - 0.5) * spec.size * 0.12,
        (t - 0.5) * depth);
      // Turned a little further each time, so no two layers line up and the
      // silhouette reads as turbulent gas rather than as a repeated stamp.
      mat.rotation = (rnd() - 0.5) * 0.5 * (dark ? 0.3 : 1);
      group.add(sp);
      layers.push({
        sprite: sp, mat, base, baseScale: spec.size * spread,
        phase: rnd() * Math.PI * 2, rate: 0.11 + rnd() * 0.16,
        drift: (rnd() - 0.5) * 0.05,
      });
    }

    // The front layer is the one the cursor tests against: picking a stack of
    // seven overlapping sprites should still be picking ONE nebula.
    const sprite = layers[0].sprite;
    sprite.userData.nebula = spec.name;

    function animate(t) {
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i];
        const w = Math.sin(t * L.rate + L.phase);
        L.mat.opacity = L.base * (1 + 0.18 * w);
        const k = L.baseScale * (1 + 0.03 * w);
        L.sprite.scale.set(k, k, 1);
        L.mat.rotation += L.drift * 0.002;
      }
    }

    return { group, sprite, animate, dispose: () => disposeObject3D(group) };
  }

  // Builds every famous nebula, positioned from its anchor star's real
  // position (if any) among `systems`, or from its galactic l/b/d otherwise.
  // Returns the group plus a pickables list (same {object,radius,kind,data}
  // shape addPickable produces) and a name->world-position map so Scene3D can
  // resolve a catalogued nebula target even before the player has hovered it.
  function buildFamousNebulae(systems) {
    const byName = new Map();
    (systems || []).forEach((s) => { if (s && s.name) byName.set(s.name, s); });
    const group = new THREE.Group();
    group.name = "gx-famous-nebulae";
    const pickables = [];
    const positions = new Map();
    const protos = [];
    const clouds = [];
    FAMOUS_NEBULAE.forEach((spec) => {
      const anchor = spec.anchorStar && byName.get(spec.anchorStar);
      const localLy = anchor ? anchor.position : galLB(spec.l, spec.b, spec.d);
      const pos = galacticWorld(localLy, new THREE.Vector3());
      const neb = buildFamousNebulaSprite(spec);
      neb.group.position.copy(pos);
      group.add(neb.group);
      clouds.push(neb);
      pickables.push({ object: neb.sprite, radius: spec.size * 0.5, kind: "nebula", data: spec });
      positions.set(spec.name, pos);
      // Star-forming regions carry visible embedded protostars: warm pulsing
      // cocoons scattered through the cloud (count from the spec).
      const rnd = lcg(hashSeed(spec.name + ":proto"));
      for (let i = 0; i < (spec.protostars || 0); i++) {
        const gl = makeGlowSprite("rgba(255,190,120,0.95)");
        const s = spec.size * (0.06 + rnd() * 0.05);
        gl.sprite.position.set(
          (rnd() - 0.5) * spec.size * 0.5,
          (rnd() - 0.5) * spec.size * 0.35,
          (rnd() - 0.5) * spec.size * 0.5);
        gl.sprite.scale.set(s, s, 1);
        neb.group.add(gl.sprite);
        protos.push({ mat: gl.mat, sprite: gl.sprite, base: s, phase: rnd() * 10, rate: 1.1 + rnd() * 2 });
      }
    });
    return {
      group, pickables, positions,
      worldOf(name, out) {
        const p = positions.get(name);
        if (!p) return null;
        return (out || new THREE.Vector3()).copy(p);
      },
      animate(t) {
        // The gas itself drifts (see buildFamousNebulaSprite)...
        for (let i = 0; i < clouds.length; i++) clouds[i].animate(t);
        // ...and the infant stars buried in it pulse, much faster.
        for (const p of protos) {
          const w = 1 + 0.2 * Math.sin(t * p.rate + p.phase);
          p.sprite.scale.set(p.base * w, p.base * w, 1);
          p.mat.opacity = 0.6 + 0.3 * Math.sin(t * p.rate * 1.6 + p.phase);
        }
      },
      dispose: () => disposeObject3D(group),
    };
  }

  // Wireframe mesh from a parametric surface fn(u,v)->{x,y,z}, u,v in [0,1].
  function buildParametricWire(fn, uSeg, vSeg, color, scale) {
    const verts = [];
    const idx = [];
    for (let i = 0; i <= uSeg; i++) {
      for (let j = 0; j <= vSeg; j++) {
        const p = fn(i / uSeg, j / vSeg);
        verts.push(p.x * scale, p.y * scale, p.z * scale);
      }
    }
    const row = vSeg + 1;
    for (let i = 0; i < uSeg; i++) {
      for (let j = 0; j < vSeg; j++) {
        const a = i * row + j, b = (i + 1) * row + j, c = i * row + j + 1;
        idx.push(a, b, c, c, b, (i + 1) * row + j + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: color, wireframe: true, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  // A higher-dimensional anomaly: hypercube (animated 4D projection),
  // hypersphere (nested rotating rings), Mobius or Klein parametric surface.
  function buildAnomaly(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed || 4444);
    const scale = opts.scale || 60;
    const color = opts.color || 0xb98cff;
    const types = ["hypercube", "hypersphere", "mobius", "klein"];
    const type = opts.type || types[(rnd() * types.length) | 0];
    const group = new THREE.Group();
    group.name = "gx-anomaly-" + type;
    let tick = () => {};

    if (type === "hypercube") {
      // 16 tesseract vertices; edges join vertices differing in one bit.
      const v4 = [];
      for (let i = 0; i < 16; i++) {
        v4.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
      }
      const edges = [];
      for (let i = 0; i < 16; i++) {
        for (let b = 0; b < 4; b++) {
          const j = i ^ (1 << b);
          if (j > i) edges.push([i, j]);
        }
      }
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(edges.length * 2 * 3);
      geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const lines = new THREE.LineSegments(geo, mat);
      group.add(lines);
      tick = (t) => {
        const a = t * 0.5, b = t * 0.33;
        const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
        const proj = (p) => {
          // rotate in XW and YZ, then perspective-project from 4D.
          let x = p[0] * ca - p[3] * sa, w = p[0] * sa + p[3] * ca;
          let y = p[1] * cb - p[2] * sb, z = p[1] * sb + p[2] * cb;
          const k = 2.2 / (2.6 - w);
          return [x * k * scale, y * k * scale, z * k * scale];
        };
        let o = 0;
        for (const e of edges) {
          const p = proj(v4[e[0]]), q = proj(v4[e[1]]);
          arr[o++] = p[0]; arr[o++] = p[1]; arr[o++] = p[2];
          arr[o++] = q[0]; arr[o++] = q[1]; arr[o++] = q[2];
        }
        geo.attributes.position.needsUpdate = true;
      };
    } else if (type === "hypersphere") {
      const rings = [];
      for (let i = 0; i < 6; i++) {
        const pts = [];
        for (let a = 0; a <= 64; a++) {
          const th = (a / 64) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(th) * scale, Math.sin(th) * scale, 0));
        }
        const line = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({
            color: color, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }));
        line.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
        line.scale.setScalar(0.5 + i * 0.12);
        rings.push(line);
        group.add(line);
      }
      tick = (t) => rings.forEach((r, i) => {
        r.rotation.x += 0.004 * (i + 1);
        r.rotation.y += 0.003 * (i + 1);
      });
    } else if (type === "mobius") {
      const mesh = buildParametricWire((u, v) => {
        const uu = u * Math.PI * 2, vv = v * 2 - 1;
        const c = 1 + (vv / 2) * Math.cos(uu / 2);
        return { x: c * Math.cos(uu), y: c * Math.sin(uu), z: (vv / 2) * Math.sin(uu / 2) };
      }, 80, 8, color, scale * 0.6);
      group.add(mesh);
      tick = () => { group.rotation.y += 0.006; group.rotation.x += 0.002; };
    } else { // klein (figure-8 immersion)
      const mesh = buildParametricWire((u, v) => {
        const uu = u * Math.PI * 2, vv = v * Math.PI * 2, R = 2;
        const co = Math.cos(uu / 2) * Math.sin(vv) - Math.sin(uu / 2) * Math.sin(2 * vv);
        const so = Math.sin(uu / 2) * Math.sin(vv) + Math.cos(uu / 2) * Math.sin(2 * vv);
        return { x: (R + co) * Math.cos(uu), y: (R + co) * Math.sin(uu), z: so };
      }, 60, 30, color, scale * 0.28);
      group.add(mesh);
      tick = () => { group.rotation.y += 0.005; group.rotation.z += 0.002; };
    }

    return { group, animate: tick, dispose: () => disposeObject3D(group) };
  }

  // ==========================================================================
  // Exotic stellar objects: every rare / theoretical star type gets its own
  // hand-built 3D look, shared by the in-game system view (Scene3D_Bodies),
  // the galaxy map framing and the title screen's Hyperverse acts. Each
  // builder works at a caller-chosen world radius and returns
  // { group, animate(t), dispose(), lightColor, lightIntensity } - the light
  // hints let the system view tint its central PointLight to match the star
  // (or kill it entirely for the dead/dark ones).
  // ==========================================================================

  // Blotchy self-lit surface for exotic bodies: base colour, brighter cells
  // and darker patches, with optional horizontal banding (brown dwarfs).
  function exoticSurfaceTexture(baseHex, opt) {
    opt = opt || {};
    const rnd = opt.rnd || Math.random;
    const w = 128, h = 64;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, w, h);
    if (opt.bands) {
      for (let y = 0; y < h; y++) {
        const a = 0.10 + 0.16 * Math.sin(y * 0.5 + rnd() * 0.4) + rnd() * 0.05;
        ctx.fillStyle = "rgba(0,0,0," + Math.max(0, a).toFixed(3) + ")";
        ctx.fillRect(0, y, w, 1);
      }
    }
    const cells = opt.cells != null ? opt.cells : 26;
    for (let i = 0; i < cells; i++) {
      const x = rnd() * w, y = rnd() * h, r = 3 + rnd() * (opt.cellSize || 10);
      const bright = rnd() < (opt.brightRatio != null ? opt.brightRatio : 0.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, bright
        ? "rgba(255,255,255," + (0.10 + rnd() * (opt.brightA || 0.25)).toFixed(3) + ")"
        : "rgba(0,0,0," + (0.12 + rnd() * (opt.darkA || 0.3)).toFixed(3) + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // wrap the seam
      if (x < r) { ctx.save(); ctx.translate(w, 0); ctx.fillRect(-w, 0, w, h); ctx.restore(); }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }


  // Crude oil, seen as a slick: an all but black ground with the thin-film
  // interference bands that make a puddle iridescent. Bands are laid down as
  // overlapping rainbow arcs at low alpha, so no two runs of the texture sit
  // the same way and the seam wraps.
  function oilSlickTexture(rnd) {
    rnd = rnd || Math.random;
    const w = 256, h = 128;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#07060a";
    ctx.fillRect(0, 0, w, h);
    const SHEEN = ["#7d3bd4", "#2f6fd0", "#25b39a", "#c9c33a", "#d0632a", "#a32f7a"];
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w, y = rnd() * h, r = 12 + rnd() * 56;
      const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      const from = (rnd() * SHEEN.length) | 0;
      for (let k = 0; k < 4; k++) {
        g.addColorStop(k / 3, SHEEN[(from + k) % SHEEN.length]);
      }
      ctx.globalAlpha = 0.10 + rnd() * 0.16;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (x < r) { ctx.save(); ctx.translate(w, 0); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      if (x > w - r) { ctx.save(); ctx.translate(-w, 0); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
    // Back down into the dark: oil is black first and a rainbow second.
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#050407";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  // Core body sphere + optional back-side corona + optional glow sprite.
  function exoticBody(ctx, opt) {
    opt = opt || {};
    const R = ctx.R * (opt.scale || 1);
    const mat = new THREE.MeshBasicMaterial({
      color: opt.tint != null ? opt.tint : 0xffffff,
      map: opt.texture || null,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), mat);
    ctx.group.add(body);
    if (opt.corona !== false) {
      const corona = new THREE.Mesh(
        new THREE.SphereGeometry(R * (opt.coronaScale || 1.18), 24, 18),
        new THREE.MeshBasicMaterial({
          color: opt.coronaColor != null ? opt.coronaColor : 0xffd27f,
          transparent: true, opacity: opt.coronaOpacity != null ? opt.coronaOpacity : 0.35,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ctx.group.add(corona);
    }
    if (opt.glow) {
      const gl = makeGlowSprite(opt.glow);
      gl.sprite.scale.set(R * (opt.glowScale || 4), R * (opt.glowScale || 4), 1);
      ctx.group.add(gl.sprite);
      ctx.anims.push((t) => {
        const p = 1 + Math.sin(t * (opt.glowPulseRate || 1.7)) * (opt.glowPulse || 0.06);
        gl.sprite.scale.set(R * (opt.glowScale || 4) * p, R * (opt.glowScale || 4) * p, 1);
      });
    }
    ctx.anims.push((t) => { body.rotation.y = t * (opt.spin != null ? opt.spin : 0.05); });
    return body;
  }

  // Two opposed lighthouse beams along +/-Y of a returned axis group.
  function exoticBeams(ctx, opt) {
    opt = opt || {};
    const R = ctx.R;
    const axis = new THREE.Group();
    axis.rotation.z = opt.tilt != null ? opt.tilt : 0.6;
    ctx.group.add(axis);
    const len = R * (opt.length || 14);
    [1, -1].forEach((d) => {
      const geo = new THREE.ConeGeometry(R * (opt.spread || 1.6), len, 12, 1, true);
      geo.translate(0, len / 2, 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: opt.color != null ? opt.color : 0xbfe6ff,
        transparent: true, opacity: opt.opacity != null ? opt.opacity : 0.28,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      if (d < 0) mesh.rotation.x = Math.PI;
      axis.add(mesh);
    });
    if (opt.sweep) {
      const rate = opt.sweepRate || 3.2;
      ctx.anims.push((t) => { axis.rotation.y = t * rate; });
    }
    return axis;
  }

  // Expanding, fading shells (Wolf-Rayet winds / hypergiant outbursts).
  function exoticShells(ctx, opt) {
    opt = opt || {};
    const R = ctx.R;
    const n = opt.count || 3;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: opt.color != null ? opt.color : 0x9db4ff,
        transparent: true, opacity: 0, side: THREE.BackSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14), mat);
      ctx.group.add(shell);
      const phase = i / n;
      const speed = opt.speed || 0.18;
      const from = opt.from || 1.15, to = opt.to || 2.6;
      ctx.anims.push((t) => {
        const f = (t * speed + phase) % 1;
        const s = from + (to - from) * f;
        shell.scale.setScalar(s);
        mat.opacity = (opt.maxOpacity || 0.22) * Math.sin(Math.PI * f);
      });
    }
  }

  // Magnetic field arcs pole-to-pole (magnetars / neutron stars).
  function exoticFieldArcs(ctx, opt) {
    opt = opt || {};
    const R = ctx.R;
    const holder = new THREE.Group();
    ctx.group.add(holder);
    const n = opt.count || 5;
    for (let i = 0; i < n; i++) {
      const bulge = R * (1.8 + ctx.rnd() * 1.6);
      const pts = [];
      for (let k = 0; k <= 20; k++) {
        const f = k / 20;
        const ang = Math.PI * (f - 0.5); // -90 .. 90 degrees
        pts.push(new THREE.Vector3(Math.cos(ang) * bulge, Math.sin(ang) * R * 2.4, 0));
      }
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, R * 0.06, 5, false),
        new THREE.MeshBasicMaterial({
          color: opt.color != null ? opt.color : 0xc9a0ff,
          transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      tube.rotation.y = (i / n) * Math.PI * 2;
      holder.add(tube);
    }
    ctx.anims.push((t) => {
      holder.rotation.y = t * (opt.spin || 0.4);
      holder.children.forEach((c, i) => {
        c.material.opacity = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.7));
      });
    });
    return holder;
  }

  // Dusty protoplanetary torus + bipolar outflow glows (protostars).
  function exoticProtoDisk(ctx, opt) {
    opt = opt || {};
    const R = ctx.R;
    const tex = makeAccretionTexture(opt.diskColor || "rgba(200,120,60,0.8)", ctx.rnd);
    const ri = R * 1.6, ro = R * (opt.outer || 5);
    const geo = new THREE.RingGeometry(ri, ro, 96, 1);
    const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - ri) / (ro - ri), 0.5);
    }
    const disk = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    disk.rotation.x = Math.PI / 2 - (opt.tilt || 0.16);
    ctx.group.add(disk);
    [1, -1].forEach((d) => {
      const gl = makeGlowSprite(opt.jetColor || "rgba(255,200,150,0.8)");
      gl.sprite.scale.set(R * 1.6, R * 3.4, 1);
      gl.sprite.position.y = d * R * 2.4;
      ctx.group.add(gl.sprite);
    });
    ctx.anims.push((t) => {
      disk.rotation.z = t * 0.18;
      tex.offset.x = (t * 0.03) % 1;
    });
    return disk;
  }

  // Per-type builders. Each receives ctx = { R, rnd, group, anims, system }
  // and returns optional { lightColor, lightIntensity } hints.
  const EXOTIC_BUILDERS = {
    NEUTRON_STAR(ctx) {
      exoticBody(ctx, {
        tint: 0xeaf4ff, corona: true, coronaColor: 0xaacfff, coronaOpacity: 0.3,
        glow: "rgba(174,224,255,0.9)", glowScale: 6, glowPulse: 0.1, glowPulseRate: 3.5,
        spin: 2.0,
      });
      exoticFieldArcs(ctx, { color: 0x8fd0ff, count: 4, spin: 0.8 });
      return { lightColor: 0xbfe0ff, lightIntensity: 1.6 };
    },
    PULSAR(ctx) {
      exoticBody(ctx, {
        tint: 0xf2f8ff, glow: "rgba(174,240,255,0.95)", glowScale: 6,
        glowPulse: 0.16, glowPulseRate: 8, spin: 3.0,
      });
      exoticBeams(ctx, { tilt: 0.7, length: 18, spread: 1.4, sweep: true, sweepRate: 3.4 });
      return { lightColor: 0xbfe6ff, lightIntensity: 1.7 };
    },
    MAGNETAR(ctx) {
      exoticBody(ctx, {
        tint: 0xe8dcff, coronaColor: 0xc9a0ff, coronaOpacity: 0.4,
        glow: "rgba(201,160,255,0.95)", glowScale: 7, glowPulse: 0.2, glowPulseRate: 11,
        spin: 2.4,
      });
      exoticFieldArcs(ctx, { color: 0xd8b8ff, count: 7, spin: 0.9 });
      exoticBeams(ctx, { tilt: 0.5, length: 8, spread: 0.9, opacity: 0.16, color: 0xd8b8ff, sweep: true, sweepRate: 5 });
      return { lightColor: 0xd0b0ff, lightIntensity: 1.8 };
    },
    WOLF_RAYET(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#bcd0ff", { rnd: ctx.rnd, cells: 30, brightRatio: 0.75, brightA: 0.4 }),
        coronaColor: 0x9db4ff, coronaOpacity: 0.5, coronaScale: 1.3,
        glow: "rgba(157,180,255,0.9)", glowScale: 5, spin: 0.12,
      });
      exoticShells(ctx, { color: 0x9db4ff, count: 4, speed: 0.22, to: 3.2, maxOpacity: 0.2 });
      // WR 104-style pinwheel: dust condensing along an Archimedean spiral.
      const n = 160, pts = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const f = i / n, a = f * Math.PI * 6, r = ctx.R * (1.6 + f * 5.5);
        pts[i * 3] = Math.cos(a) * r;
        pts[i * 3 + 1] = (ctx.rnd() - 0.5) * ctx.R * 0.5;
        pts[i * 3 + 2] = Math.sin(a) * r;
        const w = 0.85 - f * 0.6;
        col[i * 3] = w; col[i * 3 + 1] = w * 0.8; col[i * 3 + 2] = w * 0.65;
      }
      const spiral = pointCloud(pts, col, 2.5, 0.8);
      ctx.group.add(spiral);
      ctx.anims.push((t) => { spiral.rotation.y = t * 0.35; });
      return { lightColor: 0xbcd0ff, lightIntensity: 2.2 };
    },
    CARBON_STAR(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#c02a10", { rnd: ctx.rnd, cells: 34, brightRatio: 0.25, darkA: 0.5 }),
        coronaColor: 0xff3b1f, coronaOpacity: 0.3,
        glow: "rgba(255,80,40,0.75)", glowScale: 3.6, spin: 0.03,
      });
      exoticShells(ctx, { color: 0x662211, count: 2, speed: 0.05, to: 2.0, maxOpacity: 0.12 });
      return { lightColor: 0xff6040, lightIntensity: 1.2 };
    },
    PROTOSTAR(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#ff9a4a", { rnd: ctx.rnd, cells: 24, brightRatio: 0.6 }),
        coronaColor: 0xffb36b, coronaOpacity: 0.45,
        glow: "rgba(255,179,107,0.9)", glowScale: 4.5, glowPulse: 0.14, glowPulseRate: 2.6,
        spin: 0.25,
      });
      exoticProtoDisk(ctx, {});
      return { lightColor: 0xffc080, lightIntensity: 1.4 };
    },
    RED_GIANT(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#e8683a", { rnd: ctx.rnd, cells: 40, cellSize: 16, brightRatio: 0.45 }),
        coronaColor: 0xff9966, coronaOpacity: 0.4, coronaScale: 1.24,
        glow: "rgba(255,153,102,0.8)", glowScale: 3.6, glowPulse: 0.04, glowPulseRate: 0.7,
        spin: 0.02,
      });
      return { lightColor: 0xffb080, lightIntensity: 1.7 };
    },
    RED_SUPERGIANT(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#d84f28", { rnd: ctx.rnd, cells: 48, cellSize: 20, brightRatio: 0.4, darkA: 0.45 }),
        coronaColor: 0xff6a3c, coronaOpacity: 0.42, coronaScale: 1.3,
        glow: "rgba(255,106,60,0.8)", glowScale: 4, glowPulse: 0.05, glowPulseRate: 0.5,
        spin: 0.015,
      });
      exoticShells(ctx, { color: 0x883322, count: 2, speed: 0.04, to: 1.9, maxOpacity: 0.12 });
      return { lightColor: 0xff8a5c, lightIntensity: 1.8 };
    },
    HYPERGIANT(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#ffd9a0", { rnd: ctx.rnd, cells: 44, cellSize: 18, brightRatio: 0.55 }),
        coronaColor: 0xffe0b0, coronaOpacity: 0.45, coronaScale: 1.32,
        glow: "rgba(255,224,176,0.85)", glowScale: 4.4, glowPulse: 0.07, glowPulseRate: 0.9,
        spin: 0.02,
      });
      exoticShells(ctx, { color: 0xcc9955, count: 3, speed: 0.1, to: 2.8, maxOpacity: 0.16 });
      return { lightColor: 0xffe6c0, lightIntensity: 2.2 };
    },
    THORNE_ZYTKOW(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#d84f28", { rnd: ctx.rnd, cells: 48, cellSize: 20, brightRatio: 0.4 }),
        coronaColor: 0xff7a52, coronaOpacity: 0.4, coronaScale: 1.28,
        glow: "rgba(255,122,82,0.8)", glowScale: 3.8, spin: 0.02,
      });
      // The swallowed neutron star: a piercing blue core that flickers through.
      const core = makeGlowSprite("rgba(180,220,255,0.95)");
      core.sprite.scale.set(ctx.R * 1.2, ctx.R * 1.2, 1);
      ctx.group.add(core.sprite);
      ctx.anims.push((t) => {
        core.mat.opacity = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.9)) * (0.6 + 0.4 * Math.sin(t * 7.3));
      });
      return { lightColor: 0xff9a72, lightIntensity: 1.8 };
    },
    L(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#a04a2e", { rnd: ctx.rnd, bands: true, cells: 16, brightRatio: 0.3 }),
        coronaColor: 0xc96b4a, coronaOpacity: 0.16,
        glow: "rgba(201,107,74,0.4)", glowScale: 2.6, spin: 0.3,
      });
      return { lightColor: 0xc96b4a, lightIntensity: 0.6 };
    },
    T(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#6e3a66", { rnd: ctx.rnd, bands: true, cells: 14, brightRatio: 0.3 }),
        coronaColor: 0x9a5aa8, coronaOpacity: 0.12,
        glow: "rgba(154,90,168,0.3)", glowScale: 2.2, spin: 0.35,
      });
      return { lightColor: 0x9a5aa8, lightIntensity: 0.4 };
    },
    Y(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#3a2a44", { rnd: ctx.rnd, bands: true, cells: 10, brightRatio: 0.2, darkA: 0.4 }),
        coronaColor: 0x6b4a7a, coronaOpacity: 0.08,
        glow: "rgba(107,74,122,0.22)", glowScale: 1.9, spin: 0.4,
      });
      return { lightColor: 0x6b4a7a, lightIntensity: 0.2 };
    },
    QUARK_STAR(ctx) {
      exoticBody(ctx, {
        tint: 0xc8fff0, glow: "rgba(143,255,224,0.95)", glowScale: 6,
        glowPulse: 0.12, glowPulseRate: 6, spin: 2.6,
      });
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(ctx.R * 1.5, 1),
        new THREE.MeshBasicMaterial({
          color: 0x8fffe0, wireframe: true, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ctx.group.add(shell);
      ctx.anims.push((t) => { shell.rotation.y = t * 0.9; shell.rotation.x = t * 0.4; });
      return { lightColor: 0xa0ffe8, lightIntensity: 1.6 };
    },
    BOSON_STAR(ctx) {
      // Transparent: a self-gravitating standing wave with no surface at all.
      for (let i = 0; i < 3; i++) {
        const s = 0.55 + i * 0.35;
        const mat = new THREE.MeshBasicMaterial({
          color: 0x7ad7ff, transparent: true, opacity: 0.16 - i * 0.04,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const sh = new THREE.Mesh(new THREE.SphereGeometry(ctx.R * s, 24, 18), mat);
        ctx.group.add(sh);
        ctx.anims.push((t) => {
          sh.scale.setScalar(1 + Math.sin(t * (0.8 + i * 0.5)) * 0.08);
        });
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ctx.R * 1.35, ctx.R * 0.03, 10, 64),
        new THREE.MeshBasicMaterial({
          color: 0xbfe9ff, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ctx.group.add(ring);
      ctx.anims.push((t) => { ring.rotation.x = t * 0.3; ring.rotation.y = t * 0.22; });
      const gl = makeGlowSprite("rgba(122,215,255,0.5)");
      gl.sprite.scale.set(ctx.R * 3, ctx.R * 3, 1);
      ctx.group.add(gl.sprite);
      return { lightColor: 0x9adfff, lightIntensity: 0.8 };
    },
    BLACK_DWARF(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#16161d", { rnd: ctx.rnd, cells: 12, brightRatio: 0.3, brightA: 0.08, darkA: 0.3 }),
        corona: false, glow: "rgba(120,60,50,0.1)", glowScale: 1.6, spin: 0.02,
      });
      return { lightColor: 0x442222, lightIntensity: 0.05 };
    },
    IRON_STAR(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#7a808c", { rnd: ctx.rnd, cells: 30, brightRatio: 0.55, brightA: 0.16, darkA: 0.25 }),
        corona: false, glow: "rgba(150,160,175,0.12)", glowScale: 1.7, spin: 0.03,
      });
      const facets = new THREE.Mesh(
        new THREE.IcosahedronGeometry(ctx.R * 1.02, 2),
        new THREE.MeshBasicMaterial({
          color: 0x9aa2b0, wireframe: true, transparent: true, opacity: 0.14, depthWrite: false,
        }));
      ctx.group.add(facets);
      return { lightColor: 0x8a8f9a, lightIntensity: 0.05 };
    },
    QUASI_STAR(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#ffbe6e", { rnd: ctx.rnd, cells: 52, cellSize: 22, brightRatio: 0.5 }),
        coronaColor: 0xffc978, coronaOpacity: 0.5, coronaScale: 1.4,
        glow: "rgba(255,201,120,0.9)", glowScale: 5.5, glowPulse: 0.08, glowPulseRate: 0.4,
        spin: 0.01,
      });
      exoticShells(ctx, { color: 0xcc8844, count: 3, speed: 0.06, to: 2.4, maxOpacity: 0.14 });
      return { lightColor: 0xffd090, lightIntensity: 2.4 };
    },
    DARK_STAR(ctx) {
      // Dark-matter powered: a vast cool cloud lit faintly from within.
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x241436, transparent: true, opacity: 0.35 - i * 0.09,
          depthWrite: false,
        });
        const sh = new THREE.Mesh(new THREE.SphereGeometry(ctx.R * (0.8 + i * 0.16), 24, 18), mat);
        ctx.group.add(sh);
        ctx.anims.push((t) => { sh.rotation.y = t * (0.03 + i * 0.02); });
      }
      const gl = makeGlowSprite("rgba(130,80,200,0.55)");
      gl.sprite.scale.set(ctx.R * 3.4, ctx.R * 3.4, 1);
      ctx.group.add(gl.sprite);
      ctx.anims.push((t) => {
        gl.mat.opacity = 0.4 + 0.25 * Math.sin(t * 0.9);
      });
      return { lightColor: 0x8a5adf, lightIntensity: 0.5 };
    },
    ELECTROWEAK_STAR(ctx) {
      exoticBody(ctx, {
        tint: 0xf4ffe0, glow: "rgba(212,255,122,0.95)", glowScale: 7,
        glowPulse: 0.2, glowPulseRate: 13, spin: 3.5,
      });
      const halo = makeGlowSprite("rgba(255,255,255,0.8)");
      halo.sprite.scale.set(ctx.R * 3, ctx.R * 3, 1);
      ctx.group.add(halo.sprite);
      ctx.anims.push((t) => { halo.mat.opacity = 0.5 + 0.4 * Math.abs(Math.sin(t * 9)); });
      return { lightColor: 0xe0ffb0, lightIntensity: 2.0 };
    },
    // ------------------------------------------------------------------------
    // The esoteric objects. Nothing in the sky is one of these: they have a
    // frequency of zero in StarTypes.json and are only ever authored, one per
    // patron's world (js/plugins/Crafting/PatreonRewards.js).
    // ------------------------------------------------------------------------

    // A star with a hole where its heart is: a bloated luminous envelope with a
    // genuinely black core inside it, ringed by the light bent round the back.
    BLACK_HOLE_STAR(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#e0763c", { rnd: ctx.rnd, cells: 46, cellSize: 20, brightRatio: 0.45, darkA: 0.5 }),
        coronaColor: 0xff9a5a, coronaOpacity: 0.35, coronaScale: 1.26,
        glow: "rgba(255,150,90,0.75)", glowScale: 4.2, glowPulse: 0.05, glowPulseRate: 0.6,
        spin: 0.03,
      });
      // The core, seen through the envelope: an absolute void with a photon
      // ring around it. Drawn after the body with the depth write off, so it
      // reads as a hole cut in the star rather than a ball in front of it.
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(ctx.R * 0.32, 24, 18),
        new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false }));
      core.renderOrder = 2;
      ctx.group.add(core);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ctx.R * 0.42, ctx.R * 0.02, 8, 72),
        new THREE.MeshBasicMaterial({
          color: 0xffd9a0, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ring.renderOrder = 3;
      ctx.group.add(ring);
      // Envelope material falling inward: a thin, fast, tilted inflow disk.
      const feed = new THREE.Mesh(
        new THREE.RingGeometry(ctx.R * 0.5, ctx.R * 0.95, 64, 1),
        new THREE.MeshBasicMaterial({
          map: makeAccretionTexture("rgba(255,190,120,0.9)", ctx.rnd),
          transparent: true, opacity: 0.5, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      feed.rotation.x = Math.PI / 2 - 0.3;
      feed.renderOrder = 3;
      ctx.group.add(feed);
      ctx.anims.push((t) => {
        ring.rotation.z = t * 0.6;
        ring.rotation.x = 0.5 + Math.sin(t * 0.2) * 0.3;
        feed.rotation.z = t * 1.6;
      });
      return { lightColor: 0xffab6e, lightIntensity: 1.6 };
    },

    // A star somebody did something to. Cracked black crust over an ember
    // interior, wrapped in slowly turning sigil rings that never quite line up.
    CURSED_STAR(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#2a0710", { rnd: ctx.rnd, cells: 40, brightRatio: 0.35, brightA: 0.55, darkA: 0.6 }),
        coronaColor: 0x7a1030, coronaOpacity: 0.4, coronaScale: 1.2,
        glow: "rgba(190,30,70,0.7)", glowScale: 3.6, glowPulse: 0.12, glowPulseRate: 0.9,
        spin: -0.04,
      });
      // Three sigil rings on stubbornly different axes, each a broken circle.
      const rings = [];
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(ctx.R * (1.5 + i * 0.45), ctx.R * 0.025, 6, 48, Math.PI * (1.2 + ctx.rnd() * 0.6)),
          new THREE.MeshBasicMaterial({
            color: 0xd11a44, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }));
        ring.rotation.set(ctx.rnd() * Math.PI, ctx.rnd() * Math.PI, ctx.rnd() * Math.PI);
        rings.push(ring);
        ctx.group.add(ring);
      }
      // Thorns: the star is impaled on its own light.
      const thorns = new THREE.Group();
      ctx.group.add(thorns);
      for (let i = 0; i < 9; i++) {
        const len = ctx.R * (1.4 + ctx.rnd() * 1.6);
        const geo = new THREE.ConeGeometry(ctx.R * 0.09, len, 5, 1);
        geo.translate(0, len / 2 + ctx.R * 0.9, 0);
        const thorn = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0x8b0f2c, transparent: true, opacity: 0.6,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        thorn.rotation.set(ctx.rnd() * Math.PI * 2, ctx.rnd() * Math.PI * 2, ctx.rnd() * Math.PI * 2);
        thorns.add(thorn);
      }
      ctx.anims.push((t) => {
        rings.forEach((r, i) => {
          r.rotation.z += 0.004 * (i % 2 ? -1 : 1);
          r.rotation.x += 0.002 * (i + 1);
          r.material.opacity = 0.35 + 0.3 * Math.sin(t * (0.7 + i * 0.4) + i);
        });
        thorns.rotation.y = t * 0.08;
      });
      return { lightColor: 0xb01838, lightIntensity: 0.7 };
    },

    // A star that died and did not stay dead: the burnt-out remnant of a
    // failed supernova, still twitching, still shedding the ejecta it never
    // finished throwing off.
    ZOMBIE_STAR(ctx) {
      const body = exoticBody(ctx, {
        texture: exoticSurfaceTexture("#8fd06a", { rnd: ctx.rnd, cells: 26, brightRatio: 0.5, brightA: 0.5, darkA: 0.55 }),
        scale: 0.6, coronaColor: 0x9fe07a, coronaOpacity: 0.3,
        glow: "rgba(159,224,122,0.8)", glowScale: 4.5, spin: 0.9,
      });
      exoticShells(ctx, { color: 0x6fae4e, count: 3, speed: 0.09, from: 1.4, to: 4.2, maxOpacity: 0.16 });
      // The ragged shroud of the supernova that failed to finish it.
      const shroud = new THREE.Mesh(
        new THREE.IcosahedronGeometry(ctx.R * 2.1, 2),
        new THREE.MeshBasicMaterial({
          color: 0x7fbf5c, wireframe: true, transparent: true, opacity: 0.18,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ctx.group.add(shroud);
      // It comes back irregularly rather than pulsing: dead, dead, dead, ALIVE.
      ctx.anims.push((t) => {
        const beat = Math.pow(Math.max(0, Math.sin(t * 1.1)), 8) +
                     Math.pow(Math.max(0, Math.sin(t * 2.7 + 1.3)), 12);
        body.scale.setScalar(1 + beat * 0.46);
        shroud.rotation.y = t * 0.1;
        shroud.rotation.x = t * 0.04;
        shroud.material.opacity = 0.1 + beat * 0.3;
      });
      return { lightColor: 0xaef08a, lightIntensity: 1.1 };
    },

    // An eyeball star: one tidally locked, unblinking eye. The iris always
    // faces the same way, the pupil widens and narrows, and every so often the
    // lids come down over the whole thing.
    EYEBALL_STAR(ctx) {
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#f6ead8", { rnd: ctx.rnd, cells: 18, brightRatio: 0.2, brightA: 0.12, darkA: 0.12 }),
        corona: false, glow: "rgba(255,233,208,0.55)", glowScale: 2.8, spin: 0,
      });
      // Veins, drawn as thin meridians creeping in from the back of the globe.
      for (let i = 0; i < 7; i++) {
        const vein = new THREE.Mesh(
          new THREE.TorusGeometry(ctx.R * 1.005, ctx.R * 0.012, 4, 40, 1.1 + ctx.rnd() * 0.8),
          new THREE.MeshBasicMaterial({ color: 0xc2564a, transparent: true, opacity: 0.35 }));
        vein.rotation.set(ctx.rnd() * Math.PI, ctx.rnd() * Math.PI, ctx.rnd() * Math.PI);
        ctx.group.add(vein);
      }
      // The eye itself, on the +Z face: iris, pupil and a wet highlight.
      const face = new THREE.Group();
      face.position.z = ctx.R * 0.86;
      ctx.group.add(face);
      const iris = new THREE.Mesh(
        new THREE.CircleGeometry(ctx.R * 0.52, 48),
        new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.95 }));
      face.add(iris);
      const pupil = new THREE.Mesh(
        new THREE.CircleGeometry(ctx.R * 0.22, 40),
        new THREE.MeshBasicMaterial({ color: 0x08060a }));
      pupil.position.z = ctx.R * 0.01;
      face.add(pupil);
      const glint = new THREE.Mesh(
        new THREE.CircleGeometry(ctx.R * 0.09, 20),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0.8,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      glint.position.set(-ctx.R * 0.18, ctx.R * 0.18, ctx.R * 0.02);
      face.add(glint);
      // Two lids: hemispherical caps that sweep together and part again.
      const lids = [1, -1].map((d) => {
        const lid = new THREE.Mesh(
          new THREE.SphereGeometry(ctx.R * 1.04, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: 0xd9c3a6, side: THREE.DoubleSide,
            map: exoticSurfaceTexture("#d9c3a6", { rnd: ctx.rnd, cells: 12, brightRatio: 0.3, darkA: 0.2 }),
          }));
        if (d < 0) lid.rotation.z = Math.PI;
        ctx.group.add(lid);
        return lid;
      });
      ctx.anims.push((t) => {
        // The gaze wanders; the whole globe turns with it, lids and all.
        ctx.group.rotation.y = Math.sin(t * 0.23) * 0.55;
        ctx.group.rotation.x = Math.sin(t * 0.17 + 1.1) * 0.28;
        pupil.scale.setScalar(1 + Math.sin(t * 0.8) * 0.28);
        // A blink: shut for a moment, then open for a good while.
        const cycle = (t * 0.35) % 1;
        const shut = cycle > 0.94 ? Math.sin((cycle - 0.94) / 0.06 * Math.PI) : 0;
        lids.forEach((lid, i) => {
          lid.rotation.x = (i === 0 ? 1 : -1) * (Math.PI / 2) * (1 - shut * 1.02);
        });
      });
      return { lightColor: 0xffd9a8, lightIntensity: 1.0 };
    },

    // A star that is, literally, star-shaped: a five-pointed solid turning
    // slowly in space, exactly as a child would draw one.
    PENTAGRAM_STAR(ctx) {
      const R = ctx.R;
      const points = 5;
      const outer = R * 1.5, inner = R * 0.62, depth = R * 0.45;
      const verts = [];
      const rim = [];
      for (let i = 0; i < points * 2; i++) {
        const ang = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
        const rad = i % 2 === 0 ? outer : inner;
        rim.push([Math.cos(ang) * rad, Math.sin(ang) * rad, 0]);
      }
      // Two apexes, front and back: the rim skinned to each gives the classic
      // faceted star that catches the light differently on every point.
      [depth, -depth].forEach((z, side) => {
        const apex = [0, 0, z];
        for (let i = 0; i < rim.length; i++) {
          const a = rim[i], b = rim[(i + 1) % rim.length];
          const tri = side === 0 ? [apex, a, b] : [apex, b, a];
          for (const v of tri) verts.push(v[0], v[1], v[2]);
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
      geo.computeVertexNormals();
      const star = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffd24a, side: THREE.DoubleSide,
      }));
      ctx.group.add(star);
      const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xfff6c0, wireframe: true, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      edge.scale.setScalar(1.01);
      ctx.group.add(edge);
      const gl = makeGlowSprite("rgba(255,210,74,0.85)");
      gl.sprite.scale.set(R * 6, R * 6, 1);
      ctx.group.add(gl.sprite);
      ctx.anims.push((t) => {
        ctx.group.rotation.z = t * 0.25;
        ctx.group.rotation.y = Math.sin(t * 0.2) * 0.5;
        const p = 1 + Math.sin(t * 1.4) * 0.06;
        gl.sprite.scale.set(R * 6 * p, R * 6 * p, 1);
      });
      return { lightColor: 0xffe08a, lightIntensity: 1.9 };
    },

    // An angelic star: no surface, only rings. Concentric wheels of eyes,
    // turning inside one another around a light too bright to look at.
    ANGELIC_STAR(ctx) {
      const R = ctx.R;
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(R * 0.5, 24, 18),
        new THREE.MeshBasicMaterial({ color: 0xfffdf0 }));
      ctx.group.add(core);
      const halo = makeGlowSprite("rgba(255,243,196,0.9)");
      halo.sprite.scale.set(R * 7, R * 7, 1);
      ctx.group.add(halo.sprite);

      const wheels = [];
      const EYES = [8, 12, 16, 20];
      for (let w = 0; w < EYES.length; w++) {
        const wheel = new THREE.Group();
        const radius = R * (1.15 + w * 0.62);
        wheel.rotation.set(ctx.rnd() * Math.PI, ctx.rnd() * Math.PI, ctx.rnd() * Math.PI);
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(radius, R * 0.03, 8, 96),
          new THREE.MeshBasicMaterial({
            color: 0xffe9a8, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }));
        wheel.add(band);
        const pupils = [];
        for (let i = 0; i < EYES[w]; i++) {
          const ang = (i / EYES[w]) * Math.PI * 2;
          const eye = new THREE.Group();
          eye.position.set(Math.cos(ang) * radius, Math.sin(ang) * radius, 0);
          const white = new THREE.Mesh(
            new THREE.CircleGeometry(R * 0.17, 20),
            new THREE.MeshBasicMaterial({
              color: 0xfff6d8, side: THREE.DoubleSide,
              transparent: true, opacity: 0.9, depthWrite: false,
            }));
          eye.add(white);
          const pupil = new THREE.Mesh(
            new THREE.CircleGeometry(R * 0.07, 14),
            new THREE.MeshBasicMaterial({
              color: 0x1a1206, side: THREE.DoubleSide, depthWrite: false,
            }));
          pupil.position.z = R * 0.004;
          eye.add(pupil);
          pupils.push(pupil);
          wheel.add(eye);
        }
        ctx.group.add(wheel);
        wheels.push({ wheel, pupils, dir: w % 2 ? -1 : 1 });
      }
      ctx.anims.push((t) => {
        wheels.forEach((w, i) => {
          w.wheel.rotation.z += 0.004 * w.dir;
          w.wheel.rotation.y += 0.0015 * (i + 1) * w.dir;
          // Every eye in a wheel narrows and opens together.
          const s = 0.6 + 0.6 * Math.abs(Math.sin(t * (0.6 + i * 0.23)));
          w.pupils.forEach((p) => p.scale.setScalar(s));
        });
        halo.mat.opacity = 0.6 + 0.25 * Math.sin(t * 1.3);
        core.scale.setScalar(1 + Math.sin(t * 2.1) * 0.05);
      });
      return { lightColor: 0xfff3c4, lightIntensity: 2.6 };
    },

    // A star of crude oil: a cold black sphere of the stuff, holding together
    // because nothing out here tells it not to. It gives almost no light of its
    // own - what you see is the rainbow sheen sliding over the slick - and it
    // sheds slow droplets that pull apart and fall back in.
    OIL_STAR(ctx) {
      const body = exoticBody(ctx, {
        texture: oilSlickTexture(ctx.rnd),
        corona: false, glow: "rgba(60,40,90,0.35)", glowScale: 2.4, spin: 0.06,
      });
      // The sheen: a second skin just off the surface, additive, turning the
      // other way, so the colours crawl across the black the way they do on a
      // puddle.
      const sheen = new THREE.Mesh(
        new THREE.SphereGeometry(ctx.R * 1.02, 32, 24),
        new THREE.MeshBasicMaterial({
          map: oilSlickTexture(ctx.rnd), transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ctx.group.add(sheen);
      // Droplets: fat globules climbing out of the surface and falling back.
      const drops = [];
      for (let i = 0; i < 10; i++) {
        const drop = new THREE.Mesh(
          new THREE.SphereGeometry(ctx.R * (0.05 + ctx.rnd() * 0.09), 10, 8),
          new THREE.MeshBasicMaterial({ color: 0x120c16 }));
        const dir = new THREE.Vector3(
          ctx.rnd() - 0.5, ctx.rnd() - 0.5, ctx.rnd() - 0.5).normalize();
        ctx.group.add(drop);
        drops.push({ mesh: drop, dir, phase: ctx.rnd(), rate: 0.2 + ctx.rnd() * 0.3 });
      }
      ctx.anims.push((t) => {
        sheen.rotation.y = -t * 0.11;
        sheen.rotation.x = Math.sin(t * 0.07) * 0.2;
        for (const d of drops) {
          const f = (t * d.rate + d.phase) % 1;
          // Out and back, slowing at the top: a drop that never quite escapes.
          const reach = ctx.R * (1 + Math.sin(f * Math.PI) * 0.55);
          d.mesh.position.copy(d.dir).multiplyScalar(reach);
          const s = 0.6 + Math.sin(f * Math.PI) * 0.6;
          d.mesh.scale.set(s, s * (1 + Math.sin(f * Math.PI) * 0.5), s);
        }
      });
      void body;
      return { lightColor: 0x4a3a66, lightIntensity: 0.25 };
    },

    // A clockwork star: brass rings on gimbals inside an escapement that keeps
    // the whole thing ticking. It does not burn, it runs, and it is running
    // down: the beat is a hair slower every swing.
    CLOCKWORK_STAR(ctx) {
      const R = ctx.R;
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#8a6a2a", { rnd: ctx.rnd, cells: 30, brightRatio: 0.6, brightA: 0.3 }),
        scale: 0.55, corona: false, glow: "rgba(255,196,96,0.6)", glowScale: 3, spin: 0.4,
      });
      // Toothed gears: a torus with radial teeth stood on it.
      const gears = [];
      for (let g = 0; g < 3; g++) {
        const gear = new THREE.Group();
        const radius = R * (1.0 + g * 0.5);
        const teeth = 16 + g * 8;
        gear.add(new THREE.Mesh(
          new THREE.TorusGeometry(radius, R * 0.05, 8, 64),
          new THREE.MeshBasicMaterial({ color: 0xd4a24a })));
        for (let i = 0; i < teeth; i++) {
          const ang = (i / teeth) * Math.PI * 2;
          const tooth = new THREE.Mesh(
            new THREE.BoxGeometry(R * 0.1, R * 0.14, R * 0.06),
            new THREE.MeshBasicMaterial({ color: 0xb8862f }));
          tooth.position.set(Math.cos(ang) * radius * 1.06, Math.sin(ang) * radius * 1.06, 0);
          tooth.rotation.z = ang;
          gear.add(tooth);
        }
        gear.rotation.set(ctx.rnd() * Math.PI, ctx.rnd() * Math.PI, ctx.rnd() * Math.PI);
        ctx.group.add(gear);
        gears.push({ gear, dir: g % 2 ? -1 : 1, teeth });
      }
      const gl = makeGlowSprite("rgba(255,196,96,0.7)");
      gl.sprite.scale.set(R * 4, R * 4, 1);
      ctx.group.add(gl.sprite);
      ctx.anims.push((t) => {
        // Meshed: a gear with more teeth turns proportionally slower, and the
        // whole train drags as the mainspring gives out.
        const wind = 1 / (1 + t * 0.006);
        gears.forEach((g) => { g.gear.rotation.z += (0.02 / (g.teeth / 16)) * g.dir * wind; });
        // The escapement beat, visible in the light.
        gl.mat.opacity = 0.45 + 0.35 * Math.abs(Math.sin(t * 3.1 * wind));
      });
      return { lightColor: 0xffc46a, lightIntensity: 1.2 };
    },

    // A mirror star: a shell of flat panes that reflects a sky that is not
    // there. Nothing comes out of it; everything comes off it.
    MIRROR_STAR(ctx) {
      const R = ctx.R;
      // Flat-shaded facets: a low geodesic with its normals left hard, so each
      // pane catches a different slice of the glow behind it.
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(R, 1),
        new THREE.MeshBasicMaterial({
          color: 0xdfe9f5, transparent: true, opacity: 0.85,
        }));
      ctx.group.add(shell);
      const seams = new THREE.Mesh(
        new THREE.IcosahedronGeometry(R * 1.005, 1),
        new THREE.MeshBasicMaterial({
          color: 0x9fc4ff, wireframe: true, transparent: true, opacity: 0.7,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ctx.group.add(seams);
      // Shards that came off it, still orbiting the break.
      const shards = new THREE.Group();
      ctx.group.add(shards);
      for (let i = 0; i < 22; i++) {
        const shard = new THREE.Mesh(
          new THREE.TetrahedronGeometry(R * (0.06 + ctx.rnd() * 0.12)),
          new THREE.MeshBasicMaterial({
            color: 0xeaf2ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
          }));
        const a = ctx.rnd() * Math.PI * 2, e = (ctx.rnd() - 0.5) * 1.2;
        const d = R * (1.5 + ctx.rnd() * 1.8);
        shard.position.set(Math.cos(a) * d, Math.sin(e) * d * 0.4, Math.sin(a) * d);
        shard.rotation.set(ctx.rnd() * 6, ctx.rnd() * 6, ctx.rnd() * 6);
        shards.add(shard);
      }
      const gl = makeGlowSprite("rgba(200,225,255,0.7)");
      gl.sprite.scale.set(R * 4.5, R * 4.5, 1);
      ctx.group.add(gl.sprite);
      ctx.anims.push((t) => {
        shell.rotation.y = t * 0.12;
        shell.rotation.x = Math.sin(t * 0.09) * 0.35;
        seams.rotation.copy(shell.rotation);
        shards.rotation.y = -t * 0.06;
        shards.children.forEach((s, i) => {
          s.rotation.y += 0.01 + i * 0.0004;
          // The glint as a pane turns edge-on to you and back.
          s.material.opacity = 0.35 + 0.55 * Math.abs(Math.sin(t * 1.4 + i));
        });
      });
      return { lightColor: 0xdfeaff, lightIntensity: 1.5 };
    },

    // A bone star: a cage of ribs closed around a dim marrow light. Whatever
    // it was the star of, the star outlived it.
    BONE_STAR(ctx) {
      const R = ctx.R;
      const marrow = new THREE.Mesh(
        new THREE.SphereGeometry(R * 0.45, 20, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0.9 }));
      ctx.group.add(marrow);
      const gl = makeGlowSprite("rgba(255,217,176,0.55)");
      gl.sprite.scale.set(R * 3.2, R * 3.2, 1);
      ctx.group.add(gl.sprite);
      // Ribs: half-circles of bone standing round a spine axis.
      const cage = new THREE.Group();
      ctx.group.add(cage);
      const boneMat = new THREE.MeshBasicMaterial({ color: 0xe8dfc8 });
      for (let i = 0; i < 11; i++) {
        const f = i / 10;
        const span = R * (0.5 + Math.sin(f * Math.PI) * 0.85);
        const pts = [];
        for (let k = 0; k <= 16; k++) {
          const a = Math.PI * (k / 16) - Math.PI / 2;
          pts.push(new THREE.Vector3(Math.cos(a) * span, 0, Math.sin(a) * span));
        }
        const rib = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, R * 0.045, 6, false),
          boneMat);
        rib.position.y = (f - 0.5) * R * 2.2;
        rib.rotation.y = f * 0.6;
        cage.add(rib);
      }
      const spine = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 0.07, R * 0.07, R * 2.4, 8),
        boneMat);
      cage.add(spine);
      ctx.anims.push((t) => {
        cage.rotation.y = t * 0.14;
        cage.rotation.z = Math.sin(t * 0.21) * 0.12;
        // The marrow breathes, slowly, in something that has no lungs.
        const b = 1 + Math.sin(t * 0.55) * 0.12;
        marrow.scale.setScalar(b);
        gl.mat.opacity = 0.35 + 0.2 * Math.sin(t * 0.55);
      });
      return { lightColor: 0xffe0bc, lightIntensity: 0.8 };
    },

    // A hollow star: the shell of one, cracked wide open, with nothing at all
    // inside. The light comes out of the crack, and the crack is the only
    // place it comes from.
    HOLLOW_STAR(ctx) {
      const R = ctx.R;
      const tex = exoticSurfaceTexture("#3b3f4a", { rnd: ctx.rnd, cells: 34, brightRatio: 0.35, brightA: 0.14, darkA: 0.5 });
      // Two halves parted along a jagged seam, each an open hemisphere seen
      // from inside as well as out.
      const halves = [1, -1].map((d) => {
        const half = new THREE.Mesh(
          new THREE.SphereGeometry(R, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2 - 0.12),
          new THREE.MeshBasicMaterial({ color: 0x8e97a8, map: tex, side: THREE.DoubleSide }));
        if (d < 0) half.rotation.z = Math.PI;
        ctx.group.add(half);
        return half;
      });
      // The light in the gap: a bright disc edge-on, seen through the crack.
      const seam = new THREE.Mesh(
        new THREE.CircleGeometry(R * 0.98, 48),
        new THREE.MeshBasicMaterial({
          color: 0xfff2c8, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      seam.rotation.x = Math.PI / 2;
      ctx.group.add(seam);
      const gl = makeGlowSprite("rgba(255,242,200,0.8)");
      gl.sprite.scale.set(R * 4, R * 1.2, 1);
      ctx.group.add(gl.sprite);
      ctx.anims.push((t) => {
        // The shell works itself open and closed, and never quite shuts.
        const gap = R * (0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.4)));
        halves[0].position.y = gap;
        halves[1].position.y = -gap;
        ctx.group.rotation.y = t * 0.08;
        seam.material.opacity = 0.65 + 0.3 * Math.sin(t * 1.7);
        gl.sprite.scale.set(R * 4, R * (0.9 + gap / R * 3), 1);
      });
      return { lightColor: 0xfff0c0, lightIntensity: 1.3 };
    },

    // A candle star: a flame standing on a column of wax that has been running
    // down it for a very long time. It is shorter than it was.
    CANDLE_STAR(ctx) {
      const R = ctx.R;
      const waxMat = new THREE.MeshBasicMaterial({
        color: 0xf3e6cf, transparent: true, opacity: 0.95,
      });
      // The column, wider at the foot where everything it has burnt collected.
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 0.55, R * 0.95, R * 2.2, 24, 1),
        waxMat);
      column.position.y = -R * 0.5;
      ctx.group.add(column);
      // Runs of wax down the side, frozen where they cooled.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + ctx.rnd() * 0.4;
        const len = R * (0.5 + ctx.rnd() * 1.1);
        const run = new THREE.Mesh(
          THREE.CapsuleGeometry
            ? new THREE.CapsuleGeometry(R * 0.09, len, 4, 8)
            : new THREE.CylinderGeometry(R * 0.09, R * 0.09, len, 8),
          waxMat);
        run.position.set(Math.cos(a) * R * 0.62, R * 0.2 - len * 0.5, Math.sin(a) * R * 0.62);
        ctx.group.add(run);
      }
      // The flame: two nested teardrops, a hot heart inside a soft body.
      const flame = new THREE.Group();
      flame.position.y = R * 0.9;
      ctx.group.add(flame);
      const outer = new THREE.Mesh(
        new THREE.SphereGeometry(R * 0.42, 20, 16),
        new THREE.MeshBasicMaterial({
          color: 0xffb03a, transparent: true, opacity: 0.75,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      outer.scale.set(0.7, 1.7, 0.7);
      flame.add(outer);
      const heart = new THREE.Mesh(
        new THREE.SphereGeometry(R * 0.2, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
      heart.scale.set(0.7, 1.4, 0.7);
      flame.add(heart);
      const gl = makeGlowSprite("rgba(255,176,58,0.9)");
      gl.sprite.scale.set(R * 5, R * 5, 1);
      gl.sprite.position.y = R * 0.9;
      ctx.group.add(gl.sprite);
      ctx.anims.push((t) => {
        // A guttering flame: it leans, stretches and flares on no fixed beat.
        const flick = Math.sin(t * 9.1) * 0.5 + Math.sin(t * 3.7 + 1.2) * 0.5;
        flame.rotation.z = flick * 0.16;
        flame.scale.set(1 + flick * 0.06, 1 + flick * 0.14, 1 + flick * 0.06);
        const s = R * (4.6 + flick * 0.6);
        gl.sprite.scale.set(s, s, 1);
        gl.mat.opacity = 0.65 + flick * 0.2;
      });
      return { lightColor: 0xffc070, lightIntensity: 1.6 };
    },

    ROGUE_PLANET(ctx) {
      // A starless world: pitch dark, readable only as a silhouette with the
      // faintest starlit limb. No light comes from it.
      exoticBody(ctx, {
        texture: exoticSurfaceTexture("#0b0d12", { rnd: ctx.rnd, bands: true, cells: 10, brightRatio: 0.15, brightA: 0.05, darkA: 0.35 }),
        corona: false, spin: 0.08,
      });
      const rim = new THREE.Mesh(
        new THREE.SphereGeometry(ctx.R * 1.03, 24, 18),
        new THREE.MeshBasicMaterial({
          color: 0x3a4a66, transparent: true, opacity: 0.07,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      ctx.group.add(rim);
      return { lightColor: 0x000000, lightIntensity: 0 };
    },
  };

  const EXOTIC_STAR_TYPES = new Set(Object.keys(EXOTIC_BUILDERS));

  function isExoticStarType(type) { return EXOTIC_STAR_TYPES.has(type); }

  function buildExoticStar(system, opts) {
    opts = opts || {};
    const type = (system && system.type) || "";
    const builder = EXOTIC_BUILDERS[type];
    if (!builder) return null;
    const group = new THREE.Group();
    group.name = "gx-exotic-" + type;
    const ctx = {
      R: opts.radius || 1,
      rnd: lcg(opts.seed != null ? (opts.seed | 0) : hashSeed((system && system.name) || type)),
      group,
      anims: [],
      system,
    };
    const meta = builder(ctx) || {};
    return {
      group,
      animate(t) { for (let i = 0; i < ctx.anims.length; i++) ctx.anims[i](t); },
      dispose: () => disposeObject3D(group),
      lightColor: meta.lightColor != null ? meta.lightColor : 0xfff3e0,
      lightIntensity: meta.lightIntensity != null ? meta.lightIntensity : 1.8,
    };
  }

  // ==========================================================================
  // Dyson sphere: a swarm of individual collector panels around a star. Every
  // face of a geodesic is cut out as its own triangle and seated clear of its
  // neighbours, so the shell is a lattice of separate plates with the star
  // burning through the gaps between them rather than a solid dark ball. Each
  // panel is rimmed with a power seam, gradient-shaded from a dark centre to
  // light-bled corners, and a collection wave sweeps across the whole sphere.
  // "active" shells are near-complete and lit (the Zeta Reticuli pair);
  // "abandoned" ones are gap-toothed, buckled and dead - found, very rarely,
  // around procedural main-sequence stars.
  // ==========================================================================
  function buildDysonSphere(opts) {
    opts = opts || {};
    const R = opts.radius || 3;
    const abandoned = opts.mode === "abandoned" || opts.abandoned === true;
    const rnd = lcg(opts.seed != null ? (opts.seed | 0) : 24601);
    const group = new THREE.Group();
    group.name = "gx-dyson-" + (abandoned ? "abandoned" : "active");

    const HOT = abandoned ? new THREE.Color(0x66727f) : new THREE.Color(0xffb050);
    const HULL = abandoned ? new THREE.Color(0x0e1116) : new THREE.Color(0x191e27);

    // A geodesic at detail 2 is 180 faces - large enough that each one still
    // reads as its own plate once the sphere fills the frame. Polyhedra come
    // non-indexed, so every three positions already are one face.
    const src = new THREE.IcosahedronGeometry(1, 2);
    const sp = src.attributes.position;
    const faceCount = sp.count / 3;

    const hullPos = [], hullCol = [], rimPos = [], rimCol = [];
    const panels = [];
    const gap = abandoned ? 0.3 : 0.05;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const c = new THREE.Vector3(), n = new THREE.Vector3(), axis = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    // The direction the collection wave travels in, rolled per shell.
    const waveAxis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const tint = new THREE.Color();

    for (let f = 0; f < faceCount; f++) {
      if (rnd() < gap) continue;
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(sp, f * 3 + k);
      // Panels are not seated on one perfect surface: a hair of radial scatter
      // gives the shell thickness, and a derelict's plates sag out of true.
      let r = R * (1 + (rnd() - 0.5) * 0.03);
      if (abandoned && rnd() < 0.3) r *= 0.9 + rnd() * 0.06;
      for (let k = 0; k < 3; k++) v[k].multiplyScalar(r);
      c.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1 / 3);
      n.copy(c).normalize();
      // The inset IS the spacing: each triangle shrinks toward its own centre,
      // so the star shows in the channels left between the plates.
      const inset = abandoned ? 0.56 + rnd() * 0.2 : 0.76 + rnd() * 0.12;
      for (let k = 0; k < 3; k++) v[k].sub(c).multiplyScalar(inset).add(c);
      if (abandoned) {                      // torn off its mounts and hanging
        axis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
        quat.setFromAxisAngle(axis, (rnd() - 0.5) * 0.55);
        for (let k = 0; k < 3; k++) v[k].sub(c).applyQuaternion(quat).add(c);
      }

      // Each plate is fanned from its centroid into three sub-triangles, which
      // is what lets it shade from a dark middle to corners bled through by the
      // starlight squeezing past its edges.
      const shade = 0.7 + rnd() * 0.6;
      const start = hullPos.length / 3;
      const ord = [0, 1, 1, 2, 2, 0];
      for (let e = 0; e < 3; e++) {
        const a = v[ord[e * 2]], b = v[ord[e * 2 + 1]];
        hullPos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
        tint.copy(HULL).multiplyScalar(shade * 0.55);
        hullCol.push(tint.r, tint.g, tint.b);
        tint.copy(HULL).multiplyScalar(shade * 1.6);
        for (let k = 0; k < 2; k++) hullCol.push(tint.r, tint.g, tint.b);
        rimPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }

      // A working panel carries current; a dead one only sparks now and then.
      const live = abandoned ? rnd() < 0.12 : true;
      const gain = live ? (abandoned ? 0.5 + rnd() * 0.5 : 0.55 + rnd() * 0.75) : 0;
      tint.copy(HOT).multiplyScalar(abandoned ? 0.35 + shade * 0.2 : 0.5 + gain * 0.5);
      for (let k = 0; k < 6; k++) rimCol.push(tint.r, tint.g, tint.b);
      panels.push({ start, gain, live, phase: n.dot(waveAxis), spark: rnd() * 6.283 });
    }
    src.dispose();

    const hullGeo = new THREE.BufferGeometry();
    hullGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(hullPos), 3));
    hullGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(hullCol), 3));
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide,
    }));
    group.add(hull);

    // The lit layer: same plates a hair further out, additive, its vertex
    // colours rewritten every frame so the collection wave rolls over the
    // shell instead of the whole thing blinking as one.
    const glowGeo = hullGeo.clone();
    const glowCol = new Float32Array(hullPos.length);
    glowGeo.setAttribute("color", new THREE.BufferAttribute(glowCol, 3));
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(1.004);
    group.add(glow);

    // Power seams around every panel edge.
    const rimGeo = new THREE.BufferGeometry();
    rimGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rimPos), 3));
    rimGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(rimCol), 3));
    const rims = new THREE.LineSegments(rimGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: abandoned ? 0.4 : 0.95,
      blending: abandoned ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    }));
    group.add(rims);

    // The structural frame the panels are hung on.
    const ribs = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(R * 1.008, 1)),
      new THREE.LineBasicMaterial({
        color: abandoned ? 0x2a3038 : 0xff8c2a,
        transparent: true, opacity: abandoned ? 0.3 : 0.55,
        blending: abandoned ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
      }));
    group.add(ribs);

    // Loose plates: panels still being ferried into place around a live shell,
    // or the wreck of the ones that came off a derelict. Each rides its own
    // inclined orbit so the swarm reads as a swarm.
    const strayGeo = new THREE.BufferGeometry();
    const s = R * 0.12;
    strayGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      0, s, 0, -s * 0.87, -s * 0.5, 0, s * 0.87, -s * 0.5, 0,
    ]), 3));
    const strayMat = new THREE.MeshBasicMaterial({
      color: abandoned ? 0x0e1116 : 0x1c212b, side: THREE.DoubleSide,
    });
    const strayEdgeGeo = new THREE.EdgesGeometry(strayGeo);
    const strayEdgeMat = new THREE.LineBasicMaterial({
      color: abandoned ? 0x3d4550 : 0xffb050, transparent: true,
      opacity: abandoned ? 0.4 : 0.8,
      blending: abandoned ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    });
    const strays = [];
    const strayCount = abandoned ? 18 : 12;
    for (let i = 0; i < strayCount; i++) {
      const frame = new THREE.Group();
      frame.rotation.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);
      const spinner = new THREE.Group();
      frame.add(spinner);
      const plate = new THREE.Mesh(strayGeo, strayMat);
      plate.add(new THREE.LineSegments(strayEdgeGeo, strayEdgeMat));
      // Kept close in: the swarm has to stay clear of the innermost planet
      // orbit, which starts only a little outside the shell.
      plate.position.set(R * (1.1 + rnd() * (abandoned ? 0.2 : 0.14)), 0, 0);
      plate.scale.setScalar(0.6 + rnd() * 0.8);
      spinner.add(plate);
      group.add(frame);
      strays.push({
        spinner, plate,
        speed: (abandoned ? 0.03 : 0.09) * (0.5 + rnd()) * (rnd() < 0.5 ? -1 : 1),
        tumble: (abandoned ? 0.5 : 0.15) * (0.4 + rnd()),
        phase: rnd() * 6.283,
      });
    }

    const glowAttr = glowGeo.attributes.color;
    const wave = new THREE.Color();

    function animate(t) {
      const spin = abandoned ? 0.008 : 0.03;
      group.rotation.y = t * spin;
      group.rotation.x = Math.sin(t * 0.05) * (abandoned ? 0.12 : 0.03);

      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        let b = 0;
        if (p.gain > 0) {
          if (abandoned) {
            // A dead panel only arcs: brief, irregular, mostly dark.
            const k = Math.sin(t * 2.3 + p.spark) * Math.sin(t * 0.7 + p.phase * 9);
            b = k > 0.86 ? p.gain * (k - 0.86) * 6 : 0;
          } else {
            const w = Math.sin(t * 0.6 - p.phase * 3.6);
            b = p.gain * (0.14 + 0.9 * Math.pow(Math.max(0, w), 3));
          }
        }
        wave.copy(HOT).multiplyScalar(b);
        const base = p.start * 3;
        for (let e = 0; e < 3; e++) {
          const o = base + e * 9;
          // Centre stays dark: the light collects at the bled edges.
          glowCol[o] = wave.r * 0.2; glowCol[o + 1] = wave.g * 0.2; glowCol[o + 2] = wave.b * 0.2;
          for (let k = 1; k < 3; k++) {
            glowCol[o + k * 3] = wave.r;
            glowCol[o + k * 3 + 1] = wave.g;
            glowCol[o + k * 3 + 2] = wave.b;
          }
        }
      }
      glowAttr.needsUpdate = true;

      if (!abandoned) {
        rims.material.opacity = 0.75 + 0.2 * Math.sin(t * 1.3);
        ribs.material.opacity = 0.45 + 0.15 * Math.sin(t * 0.9 + 1.2);
      }
      for (let i = 0; i < strays.length; i++) {
        const st = strays[i];
        st.spinner.rotation.y = st.phase + t * st.speed;
        st.plate.rotation.z = t * st.tumble;
        st.plate.rotation.x = t * st.tumble * 0.6;
      }
    }
    return { group, animate, abandoned, dispose: () => disposeObject3D(group) };
  }

  // Tileable flow texture for a mass-transfer stream. Its U axis runs ALONG the
  // tube (which is how TubeGeometry lays its UVs out), so the filaments are
  // drawn horizontally and the shock knots as vertical bands; scrolling
  // offset.x then streams the matter toward the accretor.
  function makeStreamFlowTexture(rnd) {
    rnd = rnd || Math.random;
    const w = 256, h = 64;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = "rgba(255,255,255," + (0.05 + rnd() * 0.22).toFixed(3) + ")";
      ctx.fillRect(0, rnd() * h, w, 1 + rnd() * 3);
    }
    // Clumps, each drawn twice so the tile stays continuous across the seam.
    for (let i = 0; i < 7; i++) {
      const x = rnd() * w, bw = 8 + rnd() * 28, a = (0.15 + rnd() * 0.4).toFixed(3);
      [x, x - w].forEach((xx) => {
        const g = ctx.createLinearGradient(xx, 0, xx + bw, 0);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255," + a + ")");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(xx, 0, bw, h);
      });
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // ==========================================================================
  // Accretion stream: the mass-transfer bridge from a donor star to the
  // compact object stripping it (X-ray binaries / microquasars). Matter does
  // not fall straight in. It leaves the donor's inner Lagrange point, the
  // orbital motion sweeps it sideways, it misses the accretor entirely and
  // wraps around it, spiralling in until it settles onto the rim of the disk -
  // which is where the disk comes from in the first place. The geometry
  // follows that ballistic path: a bowed bridge, a coil of a turn and a half,
  // helical filaments twisting along the whole length, a hot spot burning
  // where the stream ploughs into the rim, and clumps riding the lot of it.
  // Built along +Z from the donor (origin) toward the accretor, which sits at
  // z = the separation passed to setLength(); the caller positions the group
  // at the donor and aims it. The path is re-cut only when the separation
  // actually changes, so an orbiting donor costs nothing per frame.
  // ==========================================================================
  function buildAccretionStream(opts) {
    opts = opts || {};
    const rnd = lcg(opts.seed != null ? (opts.seed | 0) : 8181);
    const group = new THREE.Group();
    group.name = "gx-accretion-stream";
    const fromR = opts.fromRadius || 0.5;
    const toR = opts.toRadius || 0.12;
    const side = rnd() < 0.5 ? -1 : 1;          // which way the orbit sweeps it
    const turns = 0.85 + rnd() * 0.3;           // how far it wraps before settling

    const flowTex = makeStreamFlowTexture(rnd);
    flowTex.repeat.set(7, 1);

    const mats = [];
    function mkMat(base, extra) {
      const m = new THREE.MeshBasicMaterial(Object.assign({
        color: opts.color != null ? opts.color : 0xbfd8ff,
        vertexColors: true, transparent: true, opacity: base,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }, extra || {}));
      mats.push({ m, base });
      return m;
    }
    const coreMat = mkMat(0.5, { map: flowTex });
    const sheathMat = mkMat(0.08);
    const filMat = mkMat(0.2, { color: 0xe8f2ff });

    // Where the matter ends up: the rim of the accretor's disk (`toRadius`).
    // Held between a tenth and under a third of the separation - any wider and
    // the coil stops reading as a coil and just sweeps the whole frame.
    function coilRadius(len) {
      return Math.max(len * 0.1, Math.min(len * 0.3, toR));
    }

    // Thickness at path fraction f: broad where it peels off the donor,
    // necking hard as it accelerates, a thread by the time it is wound on. It
    // is torn-off gas crossing a stellar gap, so it stays fine against the
    // bodies at either end rather than reading as a pipe between them.
    function thickness(f, len) {
      const thin = Math.max(len * 0.006, toR * 0.02);
      return fromR * 0.3 * Math.pow(1 - f, 1.9) + thin * (1.3 - 0.7 * f);
    }

    // The ballistic path, in the frame described above.
    function buildPath(len) {
      const pts = [];
      const rC = coilRadius(len);
      const bridgeEnd = len - rC * 1.5;
      const bow = len * 0.2;                    // Coriolis deflection
      const nB = 20;
      for (let i = 0; i <= nB; i++) {
        const f = i / nB;
        // A quarter sine: the deflection builds up over the crossing and is
        // flat by the far end, so the bridge meets the coil going straight in.
        pts.push(new THREE.Vector3(
          bow * Math.sin(Math.PI * 0.5 * f),
          len * 0.015 * Math.sin(Math.PI * f),
          fromR * 0.55 + (bridgeEnd - fromR * 0.55) * f));
      }
      const e = pts[pts.length - 1];
      const a0 = Math.atan2(e.x, e.z - len), r0 = Math.hypot(e.x, e.z - len);
      const nC = 42;
      for (let i = 1; i <= nC; i++) {
        const f = i / nC;
        const a = a0 - turns * Math.PI * 2 * f;
        const r = r0 + (rC - r0) * Math.pow(f, 0.75);
        pts.push(new THREE.Vector3(
          Math.sin(a) * r, e.y * (1 - f), len + Math.cos(a) * r));
      }
      if (side < 0) for (const p of pts) p.x = -p.x;
      return { curve: new THREE.CatmullRomCurve3(pts), impact: pts[nB].clone() };
    }

    // TubeGeometry takes one radius for the whole run, so the taper is applied
    // afterwards: its vertices are (tubular+1) rings of (radial+1) points, and
    // pushing each ring in or out from its own centre is what shapes the flow.
    function taperedTube(curve, tubular, radial, scale, len) {
      const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
      const pos = geo.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const c = new THREE.Vector3(), v = new THREE.Vector3();
      for (let i = 0; i <= tubular; i++) {
        const f = i / tubular;
        curve.getPointAt(f, c);
        const rr = thickness(f, len) * scale;
        // Brightest where it is torn off the donor and where it slams into the
        // disk; the crossing between is thin, cold and dim. It also heats as it
        // falls, so the blue-white of the donor's gas turns over to the white
        // and amber of the disk it is joining.
        const b = Math.min(1.3, 0.26 + 0.62 * Math.pow(f, 2.2)
          + 0.45 * Math.exp(-Math.pow(f / 0.07, 2)));
        const warm = Math.pow(f, 2);
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j;
          v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rr).add(c);
          pos.setXYZ(k, v.x, v.y, v.z);
          col[k * 3] = b;
          col[k * 3 + 1] = b * (1 - 0.06 * warm);
          col[k * 3 + 2] = b * (1 - 0.5 * warm);
        }
      }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return geo;
    }

    // One thread of matter corkscrewing around the stream: the stream is not a
    // pipe, it is sheared gas, and the twist is what says so.
    function filamentGeo(curve, len, phase) {
      const N = 72, radial = 4;
      const fr = curve.computeFrenetFrames(N, false);
      const pts = [], p = new THREE.Vector3();
      for (let i = 0; i <= N; i++) {
        const f = i / N;
        const a = phase + f * Math.PI * 2 * 2.4;
        const rr = thickness(f, len) * 1.2;
        curve.getPointAt(f, p);
        pts.push(p.clone()
          .addScaledVector(fr.normals[i], Math.cos(a) * rr)
          .addScaledVector(fr.binormals[i], Math.sin(a) * rr));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N,
        Math.max(len * 0.002, toR * 0.012), radial, false);
      const col = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i <= N; i++) {
        const b = 0.25 + 0.75 * Math.pow(i / N, 1.5);
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j;
          col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = b;
        }
      }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return geo;
    }

    // The hot spot where the stream hits the rim, and the glow at the L1 point
    // it is being drawn through.
    const hotSpot = makeGlowSprite("rgba(255,226,180,0.95)");
    const nozzle = makeGlowSprite("rgba(210,230,255,0.9)");
    hotSpot.mat.opacity = 0; nozzle.mat.opacity = 0;
    group.add(hotSpot.sprite); group.add(nozzle.sprite);

    const clumps = [];
    for (let i = 0; i < 5; i++) {
      const gl = makeGlowSprite("rgba(210,230,255,0.9)");
      gl.mat.opacity = 0;
      group.add(gl.sprite);
      clumps.push({ s: gl.sprite, m: gl.mat, phase: rnd(), speed: 0.05 + rnd() * 0.045 });
    }

    let parts = [];
    let curve = null, length = 0;

    function build(len) {
      for (const p of parts) { group.remove(p); p.geometry.dispose(); }
      parts = [];
      length = len;
      const path = buildPath(len);
      curve = path.curve;
      parts.push(new THREE.Mesh(taperedTube(curve, 88, 8, 1, len), coreMat));
      parts.push(new THREE.Mesh(taperedTube(curve, 60, 6, 1.9, len), sheathMat));
      for (let i = 0; i < 2; i++) {
        parts.push(new THREE.Mesh(filamentGeo(curve, len, i * Math.PI), filMat));
      }
      for (const p of parts) group.add(p);
      hotSpot.sprite.position.copy(path.impact);
      const hs = Math.max(len * 0.09, thickness(0.75, len) * 5);
      hotSpot.sprite.scale.set(hs, hs, 1);
      curve.getPointAt(0, nozzle.sprite.position);
      const ns = thickness(0, len) * 3.2;
      nozzle.sprite.scale.set(ns, ns, 1);
    }

    // Rebuilding the path is the only way to keep the coil round (scaling the
    // group along Z would flatten it), so it is done on a real change only.
    function setLength(len) {
      len = Math.max(0.001, len);
      if (!curve || Math.abs(len - length) > length * 0.02) build(len);
    }
    setLength(opts.length || 4);

    // Everything here runs at a fraction of the old rate: the gap between two
    // stars is enormous, and matter crossing it in a couple of seconds reads as
    // a garden hose rather than as a star being pulled apart.
    function animate(t) {
      flowTex.offset.x = -(t * 0.16) % 1;
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.1);
      for (const mm of mats) mm.m.opacity = mm.base * pulse;
      hotSpot.mat.opacity = 0.5 + 0.3 * Math.abs(Math.sin(t * 0.8));
      nozzle.mat.opacity = 0.3 + 0.12 * Math.sin(t * 0.6);
      if (!curve) return;
      for (const c of clumps) {
        const f = (t * c.speed + c.phase) % 1;
        curve.getPointAt(f, c.s.position);
        const w = thickness(f, length) * 4.5;
        c.s.scale.set(w, w, 1);
        c.m.opacity = 0.75 * Math.sin(Math.PI * Math.min(1, f * 1.05));
      }
    }
    return { group, animate, setLength, dispose: () => disposeObject3D(group) };
  }

  /** Recursively dispose geometries, materials and their textures. */
  function disposeObject3D(root) {
    if (!root) return;
    root.traverse((obj) => {
      if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (!m) return;
        ["map", "bumpMap", "specularMap", "emissiveMap", "alphaMap"].forEach((k) => {
          // A shared texture (see sharedTexture) is borrowed, not owned: it
          // outlives every object drawn with it, and freeing it here would
          // leave every OTHER view holding a disposed map.
          if (m[k] && m[k].dispose && !isSharedTexture(m[k])) m[k].dispose();
        });
        if (m.dispose) m.dispose();
      });
    });
    if (root.parent) root.parent.remove(root);
  }

  window.GalaxySim.Scene3DCosmos = {
    buildBackgroundStarfield,
    buildMilkyWay,
    buildGalaxyScale,
    createLazyStarField,
    galacticWorld,
    GAL,
    buildLocalGroup,
    buildSupercluster,
    buildCosmicWeb,
    buildProceduralGalaxy,
    galaxySeedFromName,
    buildProceduralCluster,
    clusterSeed,
    clusterName,
    buildObservable,
    buildUniverseSphere,
    CAT,
    catalogEntries,
    buildBlackHole,
    LENS_VERT,
    LENS_FRAG,
    lensMassK,
    buildNebula,
    FAMOUS_NEBULAE,
    galLB,
    buildFamousNebulae,
    buildAnomaly,
    starTexture,
    dotTexture,
    galaxyBillboard,
    makeHighlightSprite,
    makeGlowSprite,
    disposeObject3D,
    // Exotic stellar objects + megastructures (see the builders above).
    buildExoticStar,
    isExoticStarType,
    EXOTIC_STAR_TYPES,
    buildDysonSphere,
    buildAccretionStream,
  };
})();
