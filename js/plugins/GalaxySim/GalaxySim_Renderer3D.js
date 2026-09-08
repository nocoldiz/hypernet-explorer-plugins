/*:
 * @target MZ
 * @plugindesc GalaxySim 3D Renderer Module - True 3D planets & stars composited onto the 2D star map
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim 3D Renderer Module
 * ============================================================================
 * Renders celestial bodies (planets, stars) as real 3D lit spheres using a
 * single shared offscreen THREE.js WebGL renderer, then draws the result onto
 * the existing 2D star-map canvas. The 2D interface (panels, orbits, labels,
 * navigation) is left completely untouched -- only the bodies themselves are
 * upgraded from flat gradients to shaded 3D geometry.
 *
 * Features:
 * - Procedurally textured spheres (terrestrial, ocean, gas giant, ice giant,
 *   icy, volcanic, rocky) with bump, specular and emissive maps.
 * - Real directional lighting -> genuine day/night terminator that tracks the
 *   parent star's on-screen position.
 * - Independently rotating cloud layer, atmospheric rim glow, planetary rings.
 * - Animated turbulent star surfaces with corona bloom.
 * - Per-body mesh/texture caching with LRU eviction; graceful 2D fallback when
 *   WebGL / THREE.js is unavailable.
 *
 * LOAD ORDER: After GalaxySim_Math.js, before GalaxySim_Scene.js.
 * Requires THREE.js (js/libs/three.min.js) to be loaded globally.
 */

(() => {
  "use strict";

  if (!window.GalaxySim) window.GalaxySim = {};

  // Named Solar-System bodies that wear a real NASA equirectangular surface map
  // (files live in img/pictures/Planets/<basename>.jpg|png). Matched by the
  // body's exact name; anything else stays procedurally textured.
  // i18n-ignore-start  body names matched exactly, mapped to texture basenames
  const SOL_PLANET_TEXTURES = {
    Mercury: "Mercury", Venus: "Venus", Earth: "Earth", Mars: "Mars",
    Jupiter: "Jupiter", Saturn: "Saturn", Uranus: "Uranus", Neptune: "Neptune",
    Pluto: "Pluto", Moon: "Moon",
  };
  // i18n-ignore-end

  // ==========================================================================
  // Procedural noise helpers (seamless-in-longitude value noise / fbm)
  // ==========================================================================

  function hash(x, y, seed) {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 0.157) * 43758.5453;
    return n - Math.floor(n);
  }

  function vnoise(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, seed);
    const b = hash(xi + 1, yi, seed);
    const c = hash(xi, yi + 1, seed);
    const d = hash(xi + 1, yi + 1, seed);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  function fbm(x, y, seed, octaves) {
    let value = 0;
    let amp = 0.5;
    let freq = 1;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      value += vnoise(x * freq, y * freq, seed + i * 31) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return value / max;
  }

  // Tileable-in-x fbm: blends a wrapped sample so the left & right texture
  // edges match, hiding the longitude seam as the planet rotates.
  function fbmTileX(px, py, width, scale, seed, octaves) {
    const a = fbm(px * scale, py * scale, seed, octaves);
    const b = fbm((px - width) * scale, py * scale, seed, octaves);
    const t = px / width;
    return a * (1 - t) + b * t;
  }

  // ==========================================================================
  // Color helpers
  // ==========================================================================

  function toHexNumber(color) {
    if (typeof color === "number") return color;
    if (typeof color === "string") {
      let h = color.replace("#", "");
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      return parseInt(h, 16) || 0xffffff;
    }
    return 0xffffff;
  }

  function rgb(color) {
    const n = toHexNumber(color);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mix(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    };
  }

  // ==========================================================================
  // Texture painters -> { map, bumpCanvas, specCanvas, emissiveCanvas }
  // ==========================================================================

  const TEX_W = 256;
  const TEX_H = 128;

  // The noise each painter builds its own relief out of: the scale it samples
  // at, kept here so the ground a party walks is cut from the very field the
  // picture of that world was painted with (see planetElevation below). Change
  // one of these and the painter above must change with it.
  const SURFACE_FIELDS = {
    terrestrial: { scale: 0.045 },
    rocky:       { scale: 0.07 },
    icy:         { scale: 0.06 },
    volcanic:    { scale: 0.05 },
    gas:         { scale: 0.03 },
  };

  function newCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function paintTerrestrial(planet, seed) {
    const isOcean = planet.type === "ocean";
    const color = newCanvas(TEX_W, TEX_H);
    const bump = newCanvas(TEX_W, TEX_H);
    const spec = newCanvas(TEX_W, TEX_H);
    const cImg = color.getContext("2d").createImageData(TEX_W, TEX_H);
    const bImg = bump.getContext("2d").createImageData(TEX_W, TEX_H);
    const sImg = spec.getContext("2d").createImageData(TEX_W, TEX_H);

    const deepSea = isOcean ? rgb("#013a5c") : rgb("#0b3a6b");
    const shallow = isOcean ? rgb("#0b6f9c") : rgb("#1e6bb8");
    const beach = rgb("#c2b280");
    const grass = rgb("#2e8b57");
    const forest = rgb("#1f6b3a");
    const rock = rgb("#6b5b45");
    const snow = rgb("#f4faff");
    const seaLevel = isOcean ? 0.62 : 0.5;

    for (let y = 0; y < TEX_H; y++) {
      const lat = (y / TEX_H - 0.5) * 2; // -1 pole .. 1 pole
      const polar = Math.abs(lat);
      for (let x = 0; x < TEX_W; x++) {
        const e = fbmTileX(x, y, TEX_W, 0.045, seed, 5);
        const idx = (y * TEX_W + x) * 4;
        let col;
        let height = 0;
        let shiny = 0;
        if (e < seaLevel) {
          const d = e / seaLevel;
          col = mix(deepSea, shallow, d * d);
          shiny = 220;
          height = 0.15 * d;
        } else {
          const land = (e - seaLevel) / (1 - seaLevel);
          if (land < 0.08) col = mix(shallow, beach, land / 0.08);
          else if (land < 0.45) col = mix(beach, grass, (land - 0.08) / 0.37);
          else if (land < 0.72) col = mix(grass, forest, (land - 0.45) / 0.27);
          else col = mix(forest, rock, (land - 0.72) / 0.28);
          height = 0.4 + land * 0.6;
          shiny = 10;
        }
        // ice caps near the poles
        const iceLine = 0.78 - e * 0.12;
        if (polar > iceLine) {
          const t = Math.min(1, (polar - iceLine) / (1 - iceLine) * 1.6);
          col = mix(col, snow, t);
          height = Math.max(height, 0.3 + t * 0.4);
          if (t > 0.5) shiny = 120;
        }
        cImg.data[idx] = col.r;
        cImg.data[idx + 1] = col.g;
        cImg.data[idx + 2] = col.b;
        cImg.data[idx + 3] = 255;
        const bv = Math.floor(height * 255);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
        sImg.data[idx] = shiny;
        sImg.data[idx + 1] = shiny;
        sImg.data[idx + 2] = shiny;
        sImg.data[idx + 3] = 255;
      }
    }
    color.getContext("2d").putImageData(cImg, 0, 0);
    bump.getContext("2d").putImageData(bImg, 0, 0);
    spec.getContext("2d").putImageData(sImg, 0, 0);
    return { map: color, bumpCanvas: bump, specCanvas: spec, clouds: paintClouds(seed) };
  }

  function paintClouds(seed) {
    const c = newCanvas(TEX_W, TEX_H);
    const img = c.getContext("2d").createImageData(TEX_W, TEX_H);
    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        const n = fbmTileX(x, y, TEX_W, 0.05, seed + 777, 5);
        const idx = (y * TEX_W + x) * 4;
        const a = n > 0.55 ? Math.min(1, (n - 0.55) * 3.2) : 0;
        img.data[idx] = 255;
        img.data[idx + 1] = 255;
        img.data[idx + 2] = 255;
        img.data[idx + 3] = Math.floor(a * 235);
      }
    }
    c.getContext("2d").putImageData(img, 0, 0);
    return c;
  }

  function paintGasGiant(planet, seed) {
    const color = newCanvas(TEX_W, TEX_H);
    const ctx = color.getContext("2d");
    const img = ctx.createImageData(TEX_W, TEX_H);
    const palettes = {
      gas_giant: ["#ffb366", "#d98a45", "#ffd9a0", "#b06a30"],
      hot_jupiter: ["#ff8c00", "#c43a1a", "#ffae5a", "#7a1f10"],
      ice_giant: ["#4fd0e0", "#2a8fb8", "#9fe9ff", "#1c6fa0"],
      cold_jupiter: ["#cdd4e0", "#9aa6bd", "#e8eefc", "#74809a"],
    };
    const pal = (palettes[planet.type] || palettes.gas_giant).map(rgb);
    for (let y = 0; y < TEX_H; y++) {
      const lat = y / TEX_H;
      // band index driven by latitude with turbulent warping
      const warp = fbmTileX(0, y, TEX_W, 0.08, seed, 3) * 0.06;
      for (let x = 0; x < TEX_W; x++) {
        const flow = fbmTileX(x, y, TEX_W, 0.03, seed + 9, 4) * 0.05;
        const band = (Math.sin((lat + warp + flow) * Math.PI * 18) + 1) * 0.5;
        const detail = fbmTileX(x, y, TEX_W, 0.12, seed + 3, 3);
        let col = mix(pal[0], pal[1], band);
        col = mix(col, pal[2], Math.max(0, detail - 0.6) * 1.2);
        col = mix(col, pal[3], Math.max(0, band - 0.7) * (1 - detail) * 0.8);
        const idx = (y * TEX_W + x) * 4;
        img.data[idx] = col.r;
        img.data[idx + 1] = col.g;
        img.data[idx + 2] = col.b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Great red spot for classic gas giants
    if (planet.type === "gas_giant") {
      const sx = TEX_W * 0.62;
      const sy = TEX_H * 0.62;
      const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, TEX_W * 0.1);
      g.addColorStop(0, "rgba(210,90,60,0.85)");
      g.addColorStop(0.6, "rgba(180,70,50,0.5)");
      g.addColorStop(1, "rgba(180,70,50,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sx, sy, TEX_W * 0.1, TEX_H * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return { map: color, bumpCanvas: null, specCanvas: null };
  }

  function paintIcy(planet, seed) {
    const color = newCanvas(TEX_W, TEX_H);
    const bump = newCanvas(TEX_W, TEX_H);
    const cImg = color.getContext("2d").createImageData(TEX_W, TEX_H);
    const bImg = bump.getContext("2d").createImageData(TEX_W, TEX_H);
    const base = rgb(planet.color || "#cfe9ff");
    const bright = rgb("#ffffff");
    const dark = rgb("#7fa8c8");
    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        const n = fbmTileX(x, y, TEX_W, 0.06, seed, 5);
        let col = mix(dark, base, n);
        col = mix(col, bright, Math.max(0, n - 0.65) * 2);
        const idx = (y * TEX_W + x) * 4;
        cImg.data[idx] = col.r;
        cImg.data[idx + 1] = col.g;
        cImg.data[idx + 2] = col.b;
        cImg.data[idx + 3] = 255;
        const bv = Math.floor(n * 255);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
    const cctx = color.getContext("2d");
    cctx.putImageData(cImg, 0, 0);
    bump.getContext("2d").putImageData(bImg, 0, 0);
    // a few fracture lines
    cctx.strokeStyle = "rgba(120,170,210,0.35)";
    cctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y0 = hash(i, seed, 1) * TEX_H;
      cctx.beginPath();
      cctx.moveTo(0, y0);
      let yy = y0;
      for (let x = 0; x <= TEX_W; x += 16) {
        yy += (hash(x, seed + i, 2) - 0.5) * 14;
        cctx.lineTo(x, yy);
      }
      cctx.stroke();
    }
    return { map: color, bumpCanvas: bump, specCanvas: null };
  }

  function paintVolcanic(planet, seed) {
    const color = newCanvas(TEX_W, TEX_H);
    const bump = newCanvas(TEX_W, TEX_H);
    const emis = newCanvas(TEX_W, TEX_H);
    const cImg = color.getContext("2d").createImageData(TEX_W, TEX_H);
    const bImg = bump.getContext("2d").createImageData(TEX_W, TEX_H);
    const eImg = emis.getContext("2d").createImageData(TEX_W, TEX_H);
    const rockDark = rgb("#241008");
    const rockLight = rgb("#5a3320");
    const lava = rgb("#ff5a1e");
    const lavaHot = rgb("#ffd84a");
    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        const n = fbmTileX(x, y, TEX_W, 0.05, seed, 5);
        const cracks = fbmTileX(x, y, TEX_W, 0.09, seed + 5, 4);
        const idx = (y * TEX_W + x) * 4;
        let col = mix(rockDark, rockLight, n);
        let er = 0, eg = 0, eb = 0;
        // glowing fissures where two noise fields meet a threshold
        const lavaAmt = Math.max(0, 0.5 - Math.abs(cracks - 0.5)) * 2;
        if (lavaAmt > 0.78) {
          const heat = (lavaAmt - 0.78) / 0.22;
          const lc = mix(lava, lavaHot, heat);
          col = lc;
          er = lc.r; eg = lc.g; eb = lc.b;
        }
        cImg.data[idx] = col.r;
        cImg.data[idx + 1] = col.g;
        cImg.data[idx + 2] = col.b;
        cImg.data[idx + 3] = 255;
        const bv = Math.floor(n * 255);
        bImg.data[idx] = bv; bImg.data[idx + 1] = bv; bImg.data[idx + 2] = bv; bImg.data[idx + 3] = 255;
        eImg.data[idx] = er; eImg.data[idx + 1] = eg; eImg.data[idx + 2] = eb; eImg.data[idx + 3] = 255;
      }
    }
    color.getContext("2d").putImageData(cImg, 0, 0);
    bump.getContext("2d").putImageData(bImg, 0, 0);
    emis.getContext("2d").putImageData(eImg, 0, 0);
    return { map: color, bumpCanvas: bump, specCanvas: null, emissiveCanvas: emis };
  }

  function paintRocky(planet, seed) {
    const color = newCanvas(TEX_W, TEX_H);
    const bump = newCanvas(TEX_W, TEX_H);
    const cImg = color.getContext("2d").createImageData(TEX_W, TEX_H);
    const bImg = bump.getContext("2d").createImageData(TEX_W, TEX_H);
    const base = rgb(planet.color || "#9a8472");
    const dark = mix(base, { r: 0, g: 0, b: 0 }, 0.55);
    const light = mix(base, { r: 255, g: 255, b: 255 }, 0.25);
    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        const n = fbmTileX(x, y, TEX_W, 0.07, seed, 5);
        let col = mix(dark, light, n);
        const idx = (y * TEX_W + x) * 4;
        cImg.data[idx] = col.r; cImg.data[idx + 1] = col.g; cImg.data[idx + 2] = col.b; cImg.data[idx + 3] = 255;
        const bv = Math.floor(n * 255);
        bImg.data[idx] = bv; bImg.data[idx + 1] = bv; bImg.data[idx + 2] = bv; bImg.data[idx + 3] = 255;
      }
    }
    const cctx = color.getContext("2d");
    cctx.putImageData(cImg, 0, 0);
    const bctx = bump.getContext("2d");
    bctx.putImageData(bImg, 0, 0);
    // impact craters
    const craters = 14;
    for (let i = 0; i < craters; i++) {
      const cx = hash(i, seed, 3) * TEX_W;
      const cy = (0.15 + hash(i, seed, 4) * 0.7) * TEX_H;
      const cr = 3 + hash(i, seed, 5) * 9;
      let g = cctx.createRadialGradient(cx, cy, 1, cx, cy, cr);
      g.addColorStop(0, "rgba(0,0,0,0.35)");
      g.addColorStop(0.7, "rgba(0,0,0,0.12)");
      g.addColorStop(0.85, "rgba(255,255,255,0.15)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      cctx.fillStyle = g;
      cctx.beginPath();
      cctx.arc(cx, cy, cr, 0, Math.PI * 2);
      cctx.fill();
      g = bctx.createRadialGradient(cx, cy, 1, cx, cy, cr);
      g.addColorStop(0, "rgba(0,0,0,0.6)");
      g.addColorStop(0.8, "rgba(255,255,255,0.4)");
      g.addColorStop(1, "rgba(128,128,128,0)");
      bctx.fillStyle = g;
      bctx.beginPath();
      bctx.arc(cx, cy, cr, 0, Math.PI * 2);
      bctx.fill();
    }
    return { map: color, bumpCanvas: bump, specCanvas: null };
  }

  function paintStarSurface(system, seed) {
    const color = newCanvas(TEX_W, TEX_H);
    const img = color.getContext("2d").createImageData(TEX_W, TEX_H);
    const base = rgb(system.color || "#ffd27f");
    const hot = mix(base, { r: 255, g: 255, b: 245 }, 0.6);
    const cool = mix(base, { r: 90, g: 30, b: 0 }, 0.35);
    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        const n = fbmTileX(x, y, TEX_W, 0.11, seed, 5);
        const gran = fbmTileX(x, y, TEX_W, 0.3, seed + 13, 3);
        let col = mix(cool, base, n);
        col = mix(col, hot, Math.max(0, gran - 0.5) * 1.4);
        // sunspots
        if (n < 0.22) col = mix(col, cool, 0.6);
        const idx = (y * TEX_W + x) * 4;
        img.data[idx] = col.r; img.data[idx + 1] = col.g; img.data[idx + 2] = col.b; img.data[idx + 3] = 255;
      }
    }
    color.getContext("2d").putImageData(img, 0, 0);
    return { map: color };
  }

  // ==========================================================================
  // Hand-built bodies: the artificial objects of the Solar System
  // --------------------------------------------------------------------------
  // A body whose data carries `artificial: "<style>"` is not a sphere and gets
  // no painted texture: it is assembled here out of real geometry at unit scale
  // (radius ~1), exactly like a planet group, so every consumer (system view,
  // portraits, focus framing) keeps working unchanged. The returned group wears
  // the same contract as _buildPlanet: _body (the node that spins), _half,
  // _mats / _geos / _textures for disposal, plus an optional _animateExtras(t).
  // ==========================================================================

  // Deterministic [0,1) from a name + salt, so a body looks identical every
  // time it is rebuilt.
  function nHash(name, salt) {
    let h = 2166136261 ^ (salt || 0);
    const s = String(name || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  // A point on the unit sphere from spherical angles.
  function sphToUnit(theta, phi) {
    const st = Math.sin(phi);
    return new THREE.Vector3(st * Math.cos(theta), Math.cos(phi), st * Math.sin(theta));
  }

  // A handful of glowing coronal-loop "prominence" arcs: two nearby footpoints
  // on the photosphere joined by a curve that bows outward, the classic
  // magnetic-loop silhouette real solar coronography (and Elite Dangerous'
  // star rendering) is known for. Built in the star's own unit-sphere local
  // space (same as the body/corona meshes in _buildStar) so it scales, spins
  // and disposes along with everything else on the group. Deterministic from
  // the star's own numeric seed, so a given star always grows the same arcs.
  // Each arc keeps its footpoints and apex direction around afterwards (see
  // updateProminenceArc) so Scene3D_Bodies' animate() can sway and snap the
  // loop shape every frame instead of it sitting frozen once built.
  function buildProminenceArcs(seed, colorHex) {
    const arcs = [], mats = [];
    const base = new THREE.Color(colorHex);
    // The plasma inside a loop is far hotter than the photosphere it left, so
    // the core strand runs almost white and only the outer sheath keeps the
    // star's own colour.
    const coreCol = base.clone().lerp(new THREE.Color(0xffffff), 0.8);
    const midCol = base.clone().lerp(new THREE.Color(0xffffff), 0.35);
    const count = 9 + Math.floor(hash(1, 1, seed) * 5); // 9-13 loops
    for (let i = 0; i < count; i++) {
      const theta1 = hash(i, 11, seed) * Math.PI * 2;
      const phi1 = Math.acos(hash(i, 23, seed) * 1.6 - 0.8); // clear of the poles
      const sep = 0.35 + hash(i, 37, seed) * 1.0; // footpoint separation, radians
      const bearing = hash(i, 53, seed) * Math.PI * 2;
      const theta2 = theta1 + Math.cos(bearing) * sep;
      const phi2 = Math.min(Math.PI - 0.15, Math.max(0.15, phi1 + Math.sin(bearing) * sep));
      const p1 = sphToUnit(theta1, phi1);
      const p2 = sphToUnit(theta2, phi2);
      // A wider footpoint separation arcs higher, like a real coronal loop,
      // but the loops stay low and hug the photosphere rather than towering.
      const archHeight = 1.03 + sep * (0.15 + hash(i, 67, seed) * 0.14);
      const apexDir = p1.clone().add(p2).normalize();
      // Lateral axis the apex sways along while the loop "moves": perpendicular
      // to both the chord and the radial direction, so it reads as the loop
      // swinging sideways rather than simply breathing in and out.
      const chordDir = p2.clone().sub(p1).normalize();
      const swayAxis = new THREE.Vector3().crossVectors(chordDir, apexDir).normalize();
      if (!isFinite(swayAxis.x) || swayAxis.lengthSq() < 0.5) swayAxis.set(0, 1, 0);
      const tubeR = 0.005 + hash(i, 79, seed) * 0.007;
      const arc = {
        p1, p2, apexDir, archHeight, swayAxis, tubeR,
        // The loop is a braided flux rope, not one wire: its strands wind
        // around a common axis, widest at the apex where the field is loosest.
        ropeR: tubeR * (2.2 + hash(i, 157, seed) * 2.6),
        twist: 1 + Math.floor(hash(i, 163, seed) * 3), // whole turns along the loop
        handed: hash(i, 167, seed) < 0.5 ? -1 : 1,
        rate: 0.8 + hash(i, 97, seed) * 1.6, phase: hash(i, 101, seed) * Math.PI * 2,
        // Sway: a slow lateral drift of the apex, like the loop stirring in
        // the stellar wind.
        swayAmp: 0.05 + hash(i, 109, seed) * 0.12,
        swayRate: 0.15 + hash(i, 113, seed) * 0.35,
        swayPhase: hash(i, 127, seed) * Math.PI * 2,
        // Snap: every few (real) seconds the loop briefly collapses toward
        // the photosphere and springs back with a bright flash, like a real
        // reconnection event. Purely a function of elapsed time, so it needs
        // no per-frame state.
        snapPeriod: 5 + hash(i, 131, seed) * 9,
        snapPhase: hash(i, 139, seed) * 97,
        snapWidth: 0.03 + hash(i, 149, seed) * 0.03,
        strands: [],
      };
      arc.mesh = new THREE.Group();
      // Layers, innermost out: a white-hot core, two or three braided sheath
      // strands and a wide faint halo that gives the whole rope its bloom.
      const strandCount = 2 + Math.floor(hash(i, 173, seed) * 2);
      const layers = [
        { off: 0, r: tubeR * 0.55, col: coreCol, op: 0.95, phase: 0 },
        { off: 0, r: tubeR * 2.6, col: base, op: 0.14, phase: 0 }, // halo
      ];
      for (let s = 0; s < strandCount; s++) {
        layers.push({
          off: 1, r: tubeR * (0.7 + hash(i * 7 + s, 179, seed) * 0.5),
          col: midCol, op: 0.5 + hash(i * 7 + s, 181, seed) * 0.3,
          phase: (s / strandCount) * Math.PI * 2,
        });
      }
      for (const L of layers) {
        const mat = new THREE.MeshBasicMaterial({
          color: L.col.getHex(),
          transparent: true,
          opacity: L.op,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        mats.push(mat);
        const strand = { mat, baseOpacity: L.op, off: L.off, r: L.r, phase: L.phase };
        strand.mesh = new THREE.Mesh(buildStrandGeometry(arc, strand, arc.archHeight, 0), mat);
        arc.mesh.add(strand.mesh);
        arc.strands.push(strand);
      }
      arcs.push(arc);
    }
    return { arcs, mats };
  }

  // One strand of a flux rope as a tapered tube: the centreline bows from
  // footpoint to footpoint, the strand winds around it, and the radius swells
  // toward the apex and pinches to nothing where the loop enters the surface,
  // which is what makes a loop read as plasma rather than as a drawn line.
  function buildStrandGeometry(arc, strand, height, sway) {
    const SEG = 34, RAD = 6;
    const apex = arc.apexDir.clone().multiplyScalar(height).addScaledVector(arc.swayAxis, sway);
    const curve = new THREE.CatmullRomCurve3([arc.p1, apex, arc.p2]);
    const pts = curve.getPoints(SEG);
    const centres = [], radii = [];
    const tmpN = new THREE.Vector3(), tmpB = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const env = Math.sin(Math.PI * u); // 0 at the footpoints, 1 at the apex
      const p = pts[i].clone();
      if (strand.off) {
        // Wind around the centreline in the plane spanned by the sway axis and
        // the local radial direction.
        const ang = arc.handed * (arc.twist * u * Math.PI * 2 + strand.phase);
        tmpN.copy(p).normalize();
        tmpB.copy(arc.swayAxis);
        p.addScaledVector(tmpB, Math.cos(ang) * arc.ropeR * env);
        p.addScaledVector(tmpN, Math.sin(ang) * arc.ropeR * env * 0.6);
      }
      centres.push(p);
      radii.push(strand.r * (0.15 + 0.85 * Math.pow(env, 0.45)));
    }
    return tubeFromCentres(centres, radii, RAD);
  }

  // A tube of varying radius around an arbitrary polyline. The frame is carried
  // forward along the curve (a cheap parallel transport) so the tube never
  // flips where the path turns back on itself.
  function tubeFromCentres(centres, radii, radial) {
    const n = centres.length;
    const pos = new Float32Array(n * (radial + 1) * 3);
    const idx = [];
    const normal = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3(), binormal = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = centres[Math.max(0, i - 1)], b = centres[Math.min(n - 1, i + 1)];
      tangent.copy(b).sub(a);
      if (tangent.lengthSq() < 1e-12) tangent.set(0, 0, 1);
      tangent.normalize();
      // Re-orthogonalise the carried normal against the new tangent.
      tmp.copy(tangent).multiplyScalar(normal.dot(tangent));
      normal.sub(tmp);
      if (normal.lengthSq() < 1e-8) {
        normal.set(Math.abs(tangent.x) < 0.9 ? 1 : 0, Math.abs(tangent.x) < 0.9 ? 0 : 1, 0);
        tmp.copy(tangent).multiplyScalar(normal.dot(tangent));
        normal.sub(tmp);
      }
      normal.normalize();
      binormal.crossVectors(tangent, normal);
      for (let j = 0; j <= radial; j++) {
        const ang = (j / radial) * Math.PI * 2;
        const c = Math.cos(ang) * radii[i], s = Math.sin(ang) * radii[i];
        const o = (i * (radial + 1) + j) * 3;
        pos[o] = centres[i].x + normal.x * c + binormal.x * s;
        pos[o + 1] = centres[i].y + normal.y * c + binormal.y * s;
        pos[o + 2] = centres[i].z + normal.z * c + binormal.z * s;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // (Re)builds every strand of one prominence loop for the current apex height
  // and sway, disposing the geometry it replaces. Called by the initial build
  // above and by Scene3D_Bodies' animate() each frame.
  function updateProminenceArc(arc, height, sway) {
    if (!arc || !arc.strands) return null;
    for (const s of arc.strands) {
      const geo = buildStrandGeometry(arc, s, height, sway);
      if (s.mesh.geometry) s.mesh.geometry.dispose();
      s.mesh.geometry = geo;
    }
    return null;
  }

  // A cloud of tiny debris specks as ONE mesh: each fragment is a single
  // randomly-oriented triangle, so a few hundred of them cost one draw call and
  // no per-fragment object. Positions are laid on a shell (rMin..rMax) with an
  // optional flattening `flat` (1 = sphere, 0.06 = a disc) -- the same helper
  // draws the Kessler cloud around Earth and the Sol asteroid/Kuiper belts.
  function buildDebrisMesh(opts) {
    opts = opts || {};
    const count = Math.max(1, opts.count || 200);
    const rMin = opts.rMin != null ? opts.rMin : 1.1;
    const rMax = opts.rMax != null ? opts.rMax : 1.5;
    const flat = opts.flat != null ? opts.flat : 1;
    const sizeMin = opts.sizeMin != null ? opts.sizeMin : 0.006;
    const sizeMax = opts.sizeMax != null ? opts.sizeMax : 0.018;
    let seed = (opts.seed || 1) >>> 0;
    const rand = () => {
      // xorshift32: cheap, deterministic, no allocation.
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296;
    };
    // `thickness` switches the layout from a shell to a flat annulus of a fixed
    // half-height: a belt, where every fragment keeps its distance from the star
    // instead of filling the volume inside it. `gaps` are [rIn, rOut] bands the
    // resonances have swept clean (the Kirkwood gaps).
    const annulus = opts.thickness != null;
    const gaps = opts.gaps || null;
    const inGap = (r) => {
      if (!gaps) return false;
      for (let g = 0; g < gaps.length; g++) {
        if (r >= gaps[g][0] && r <= gaps[g][1]) return true;
      }
      return false;
    };
    const pos = new Float32Array(count * 9);
    for (let i = 0; i < count; i++) {
      let r = rMin + (rMax - rMin) * Math.pow(rand(), opts.bias || 1);
      for (let tries = 0; tries < 6 && inGap(r); tries++) {
        r = rMin + (rMax - rMin) * Math.pow(rand(), opts.bias || 1);
      }
      const theta = rand() * Math.PI * 2;
      let cx, cy, cz;
      if (annulus) {
        cx = Math.cos(theta) * r;
        cy = (rand() * 2 - 1) * opts.thickness;
        cz = Math.sin(theta) * r;
      } else {
        // Uniform on the shell, then squashed toward the orbital plane by `flat`.
        const u = rand() * 2 - 1;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        cx = Math.cos(theta) * s * r;
        cy = u * r * flat;
        cz = Math.sin(theta) * s * r;
      }
      const size = sizeMin + (sizeMax - sizeMin) * rand();
      for (let v = 0; v < 3; v++) {
        const a = rand() * Math.PI * 2;
        const b = rand() * Math.PI - Math.PI / 2;
        const o = i * 9 + v * 3;
        pos[o] = cx + Math.cos(a) * Math.cos(b) * size;
        pos[o + 1] = cy + Math.sin(b) * size;
        pos[o + 2] = cz + Math.sin(a) * Math.cos(b) * size;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(opts.color || "#c3ccdb"),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: opts.opacity != null ? opts.opacity : 0.9,
      depthWrite: false,
    });
    return { mesh: new THREE.Mesh(geo, mat), geo, mat };
  }

  // Orbital debris around a planet: the Kessler cloud. A dense low shell of
  // fragments in every inclination, a sparser graveyard ring further out, and a
  // faint additive haze so the belt still reads when the planet is only a few
  // pixels across. Returns a group + the bookkeeping the caller must dispose.
  function buildOrbitalDebris(planet, seed) {
    const group = new THREE.Group();
    const mats = [];
    const geos = [];
    const low = buildDebrisMesh({
      count: 340, rMin: 1.09, rMax: 1.4, flat: 0.85, seed: seed + 7,
      sizeMin: 0.004, sizeMax: 0.016, color: "#cfd8e6", opacity: 0.95,
    });
    const graveyard = buildDebrisMesh({
      count: 120, rMin: 1.5, rMax: 1.66, flat: 0.12, seed: seed + 29,
      sizeMin: 0.004, sizeMax: 0.013, color: "#b6c2d4", opacity: 0.8,
    });
    group.add(low.mesh);
    group.add(graveyard.mesh);
    mats.push(low.mat, graveyard.mat);
    geos.push(low.geo, graveyard.geo);

    const hazeGeo = new THREE.SphereGeometry(1.34, 24, 16);
    const hazeMat = new THREE.MeshBasicMaterial({
      color: 0x8fa6c8, transparent: true, opacity: 0.05,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    group.add(new THREE.Mesh(hazeGeo, hazeMat));
    mats.push(hazeMat);
    geos.push(hazeGeo);

    // The two shells precess at different rates, which is what stops the cloud
    // from reading as a solid painted halo.
    group._animate = (t) => {
      low.mesh.rotation.y = t * 0.09;
      low.mesh.rotation.x = 0.4 + t * 0.02;
      graveyard.mesh.rotation.y = -t * 0.04;
    };
    return { group, mats, geos };
  }

  // ==========================================================================
  // Irregular bodies: asteroids and comet nuclei
  // --------------------------------------------------------------------------
  // Anything too small to have pulled itself round is NOT a sphere. The shape is
  // a unit sphere pushed around by a handful of smooth lobes, dented by a few
  // impact craters and finally squashed onto a triaxial ellipsoid -- the potato
  // every real asteroid is. The displacement is a function of the surface
  // DIRECTION only, so the sphere's duplicated seam/pole vertices all move
  // together and no crack opens up; normals are re-derived from the deformed
  // surface itself (finite differences along two tangents) instead of averaged
  // per vertex, which would have lit that seam as a visible line.
  // ==========================================================================

  function makeShapeFn(seed, opts) {
    let s = (seed | 0) >>> 0 || 1;
    const rand = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    // Smooth low-frequency lobes: one cosine bump per random axis.
    const lobeCount = opts.lobes != null ? opts.lobes : 7;
    const lobes = [];
    for (let i = 0; i < lobeCount; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const sr = Math.sqrt(Math.max(0, 1 - u * u));
      lobes.push({
        x: Math.cos(th) * sr, y: u, z: Math.sin(th) * sr,
        freq: 1 + Math.floor(rand() * 3),
        amp: (opts.roughness || 0.22) * (0.35 + rand() * 0.65) / (1 + i * 0.35),
        phase: rand() * Math.PI * 2,
      });
    }
    // Impact craters: a smooth circular dent with a raised rim.
    const craterCount = opts.craters != null ? opts.craters : 5;
    const craters = [];
    for (let i = 0; i < craterCount; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const sr = Math.sqrt(Math.max(0, 1 - u * u));
      craters.push({
        x: Math.cos(th) * sr, y: u, z: Math.sin(th) * sr,
        width: 0.18 + rand() * 0.42,
        depth: (0.05 + rand() * 0.11) * (opts.craterScale != null ? opts.craterScale : 1),
      });
    }
    // Triaxial squash: how far from round the whole body is.
    const e = opts.elongation != null ? opts.elongation : 0.3;
    const ax = 1 + e * (0.4 + rand() * 0.9);
    const ay = 1 - e * (0.2 + rand() * 0.5);
    const az = 1 - e * (0.1 + rand() * 0.4);

    // Radius (before the ellipsoid squash) for a unit direction.
    const radiusAt = (dx, dy, dz) => {
      let r = 1;
      for (let i = 0; i < lobes.length; i++) {
        const l = lobes[i];
        r += Math.cos((dx * l.x + dy * l.y + dz * l.z) * l.freq * Math.PI + l.phase) * l.amp;
      }
      for (let i = 0; i < craters.length; i++) {
        const c = craters[i];
        // Angular distance to the crater centre, as a chord -> gaussian dent.
        const d = Math.acos(Math.max(-1, Math.min(1, dx * c.x + dy * c.y + dz * c.z)));
        const q = d / c.width;
        if (q < 2.4) {
          const g = Math.exp(-q * q);
          // Rim: the ejecta piled just outside the bowl.
          r -= c.depth * (g - 0.55 * Math.exp(-(q - 1.35) * (q - 1.35) * 3.2));
        }
      }
      return Math.max(0.35, r);
    };

    // The deformed surface point for a unit direction.
    return (dx, dy, dz, out) => {
      const r = radiusAt(dx, dy, dz);
      out.set(dx * r * ax, dy * r * ay, dz * r * az);
      return out;
    };
  }

  // A one-off (per body) irregular geometry. The caller owns it and must push it
  // into the group's _geos so disposal releases it.
  function buildIrregularGeometry(seed, opts) {
    opts = opts || {};
    const geo = new THREE.SphereGeometry(1, opts.segW || 48, opts.segH || 32);
    const shape = makeShapeFn(seed, opts);
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const d = new THREE.Vector3();
    const t1 = new THREE.Vector3();
    const t2 = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const q = new THREE.Vector3();
    const n = new THREE.Vector3();
    const up = new THREE.Vector3();
    const eps = 0.02;
    let radiusSum = 0;
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      shape(d.x, d.y, d.z, p0);
      // Tangent frame around this direction (t1 x t2 = d, so the cross product
      // below comes out pointing away from the body).
      up.set(0, 1, 0);
      if (Math.abs(d.y) > 0.9) up.set(1, 0, 0);
      t1.crossVectors(up, d).normalize();
      t2.crossVectors(d, t1);
      q.copy(d).addScaledVector(t1, eps).normalize();
      shape(q.x, q.y, q.z, p1);
      q.copy(d).addScaledVector(t2, eps).normalize();
      shape(q.x, q.y, q.z, p2);
      n.crossVectors(p1.sub(p0), p2.sub(p0)).normalize();
      pos.setXYZ(i, p0.x, p0.y, p0.z);
      nrm.setXYZ(i, n.x, n.y, n.z);
      radiusSum += p0.length();
    }
    // Renormalize to a mean radius of 1: the lobes and the triaxial squash both
    // add volume, and without this an asteroid would read as bigger than the
    // radius its own data claims (and than the pick target the scene keeps).
    const mean = radiusSum / Math.max(1, pos.count);
    if (mean > 0.001) {
      const k = 1 / mean;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
      }
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    geo.computeBoundingSphere();
    return geo;
  }

  // ==========================================================================
  // Comet coma + tails
  // --------------------------------------------------------------------------
  // Two tails, as a real comet has: a straight, narrow, blue ion tail blown
  // dead anti-sunward by the solar wind, and a broader, warmer dust tail that
  // lags behind the nucleus along its orbit. Each is a pair of crossed
  // additive quads, so the tail reads as a volume from any camera angle for
  // four triangles and no per-frame billboarding. The whole assembly points
  // down its own local +Z; the scene aims it with _orientTail().
  // ==========================================================================

  function paintTailTexture(inner, outer, taper, seed) {
    const w = 64, h = 128;
    const c = newCanvas(w, h);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const a = rgb(inner);
    const b = rgb(outer);
    for (let y = 0; y < h; y++) {
      // v = 0 at the head, 1 at the far end of the tail.
      const v = y / (h - 1);
      // Brightness falls off down the tail; the head is the brightest part.
      const along = Math.pow(1 - v, 1.5) * (1 - Math.exp(-v * 22));
      // The plume widens (taper > 1) or stays a ribbon (taper ~ 1) with distance.
      const halfWidth = (0.06 + v * 0.44 * taper) * w;
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x - w / 2) / Math.max(1, halfWidth);
        let across = Math.max(0, 1 - dx * dx);
        // Streamers: the tail is never a smooth cone.
        across *= 0.55 + 0.45 * fbm(x * 0.09, y * 0.05, seed, 3) * 1.6;
        const t = Math.min(1, Math.max(0, across * along));
        const col = mix(b, a, t);
        const idx = (y * w + x) * 4;
        img.data[idx] = col.r;
        img.data[idx + 1] = col.g;
        img.data[idx + 2] = col.b;
        img.data[idx + 3] = Math.round(Math.min(1, t * 1.35) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function paintComaTexture(color) {
    const size = 128;
    const c = newCanvas(size, size);
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    const col = rgb(color);
    const css = (alpha) => "rgba(" + col.r + "," + col.g + "," + col.b + "," + alpha + ")";
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.18, css(0.7));
    g.addColorStop(0.45, css(0.22));
    g.addColorStop(1, css(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  // opts: { length, width, texture, color, opacity, bend } (nucleus radii)
  function buildTailPlumes(opts, mats, geos, textures) {
    const group = new THREE.Group();
    const tex = new THREE.CanvasTexture(opts.texture);
    tex.needsUpdate = true;
    if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    else if (tex.encoding !== undefined && THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    textures.push(tex);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: opts.opacity != null ? opts.opacity : 0.85,
      color: new THREE.Color(opts.color || "#ffffff"),
    });
    mats.push(mat);
    // The quad spans +Z (the tail axis) once rotated; its texture runs head to
    // tail down v, which is why the plane is built in the XY plane first.
    const geo = new THREE.PlaneGeometry(opts.width, opts.length, 1, opts.bend ? 12 : 1);
    if (opts.bend) {
      // The dust tail curves: particles left behind lag the nucleus, so the
      // plume sweeps sideways the further down it goes.
      const p = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const f = (v.y + opts.length / 2) / opts.length; // 0 head .. 1 tail
        p.setX(i, v.x + f * f * opts.bend * opts.length);
      }
      p.needsUpdate = true;
    }
    geo.translate(0, opts.length / 2, 0);
    geo.rotateX(Math.PI / 2); // +Y (the plume axis) -> +Z
    geos.push(geo);
    const a = new THREE.Mesh(geo, mat);
    const b = new THREE.Mesh(geo, mat);
    b.rotation.z = Math.PI / 2; // crossed pair, so the plume has depth
    group.add(a);
    group.add(b);
    return group;
  }

  // Everything a comet wears beyond its nucleus. Sizes are in nucleus radii.
  function buildCometEnvelope(planet, seed) {
    const type = planet.type;
    const group = new THREE.Group();
    const mats = [];
    const geos = [];
    const textures = [];
    // A short-period comet has been baked by repeated perihelion passes and
    // flies a stubbier tail; a long-period one arrives fully loaded.
    let length = 16;
    let width = 5;
    if (type === "short_period_comet") { length = 22; width = 6.5; }
    else if (type === "long_period_comet") { length = 34; width = 8.5; }
    const jitter = 0.75 + nHash(planet.name, 41) * 0.6;
    length *= jitter;

    const ion = buildTailPlumes({
      length: length, width: width * 0.72,
      texture: paintTailTexture("#dff2ff", "#3f7fd8", 0.55, seed + 3),
      color: "#9fd4ff", opacity: 0.8,
    }, mats, geos, textures);
    group.add(ion);

    const dust = buildTailPlumes({
      length: length * 0.66, width: width * 1.35,
      texture: paintTailTexture("#fff3d6", "#c08a4a", 1.25, seed + 11),
      color: "#ffe0a8", opacity: 0.6,
      bend: 0.16 + nHash(planet.name, 53) * 0.14,
    }, mats, geos, textures);
    // The dust tail hangs a little off the anti-solar line.
    dust.rotation.x = 0.12;
    dust.rotation.y = (nHash(planet.name, 67) - 0.5) * 0.5;
    group.add(dust);

    // The coma: the head's glowing envelope of sublimated gas.
    const comaTex = new THREE.CanvasTexture(paintComaTexture("#bfe6ff"));
    comaTex.needsUpdate = true;
    textures.push(comaTex);
    const comaMat = new THREE.SpriteMaterial({
      map: comaTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
    });
    mats.push(comaMat);
    const coma = new THREE.Sprite(comaMat);
    const comaScale = 4.4;
    coma.scale.set(comaScale, comaScale, 1);
    group.add(coma);

    // Shrink both plumes (whole, not just along their axis: a tail cut short
    // but left full width would fan out into a disc) so a comet can be framed
    // by the portrait path without the tail running off the canvas.
    group._setSpan = (f) => {
      ion.scale.setScalar(f);
      dust.scale.setScalar(f);
    };

    group._animate = (t) => {
      // The outgassing is not steady: the coma breathes and the ion tail
      // flickers as the solar wind gusts through it.
      const pulse = 1 + Math.sin(t * 0.9 + (nHash(planet.name, 71) * 6.3)) * 0.08;
      coma.scale.set(comaScale * pulse, comaScale * pulse, 1);
      comaMat.opacity = 0.72 + Math.sin(t * 1.7) * 0.1;
      ion.children.forEach((m, i) => {
        m.material.opacity = 0.7 + Math.sin(t * 2.3 + i) * 0.12;
      });
      ion.rotation.z = Math.sin(t * 0.35) * 0.05;
    };
    return { group, mats, geos, textures, span: length };
  }

  // Scratch vector for aiming a comet tail (no per-frame allocation). Built on
  // first use: this file must still parse when THREE.js is missing.
  let _tailDir = null;

  // --- Voyager / Pioneer: dish, bus, RTG boom, magnetometer boom ------------
  function buildProbe(planet, mats, geos) {
    const group = new THREE.Group();
    const pioneer = planet.probeStyle === "pioneer";
    const white = new THREE.MeshPhongMaterial({
      color: 0xe8e9ec, specular: 0x555555, shininess: 30, side: THREE.DoubleSide,
    });
    const dark = new THREE.MeshPhongMaterial({ color: 0x3a3d44, shininess: 10 });
    const gold = new THREE.MeshPhongMaterial({
      color: 0xd8b45a, specular: 0xfff0c0, shininess: 90,
    });
    mats.push(white, dark, gold);

    // High-gain dish: a real paraboloid of revolution.
    const profile = [];
    for (let i = 0; i <= 10; i++) {
      const r = (i / 10) * 0.92;
      profile.push(new THREE.Vector2(r, r * r * 0.42));
    }
    const dishGeo = new THREE.LatheGeometry(profile, 28);
    geos.push(dishGeo);
    const dish = new THREE.Mesh(dishGeo, white);
    dish.position.y = 0.12;
    group.add(dish);

    // Feed horn on its tripod, at the dish focus.
    const hornGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.22, 10);
    geos.push(hornGeo);
    const horn = new THREE.Mesh(hornGeo, dark);
    horn.position.y = 0.5;
    group.add(horn);

    // Instrument bus under the dish: ten-sided for Voyager, hexagonal for Pioneer.
    const busGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.16, pioneer ? 6 : 10);
    geos.push(busGeo);
    const bus = new THREE.Mesh(busGeo, white);
    bus.position.y = 0.02;
    group.add(bus);

    // Radioisotope generators on their boom.
    const boomGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.7, 6);
    geos.push(boomGeo);
    const rtgGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.17, 8);
    geos.push(rtgGeo);
    const rtgBoom = new THREE.Mesh(boomGeo, dark);
    rtgBoom.rotation.z = Math.PI / 2;
    rtgBoom.position.set(-0.45, -0.02, 0);
    group.add(rtgBoom);
    for (let i = 0; i < 3; i++) {
      const rtg = new THREE.Mesh(rtgGeo, dark);
      rtg.rotation.z = Math.PI / 2;
      rtg.position.set(-0.5 - i * 0.19, -0.02, 0);
      group.add(rtg);
    }

    // Magnetometer boom: the long thin one nothing is mounted on.
    const magGeo = new THREE.CylinderGeometry(0.008, 0.008, 1.5, 5);
    geos.push(magGeo);
    const mag = new THREE.Mesh(magGeo, white);
    mag.rotation.z = -Math.PI / 2.35;
    mag.position.set(0.55, -0.42, 0.1);
    group.add(mag);

    // Science boom with the scan platform.
    const sciGeo = new THREE.BoxGeometry(0.16, 0.12, 0.13);
    geos.push(sciGeo);
    const sci = new THREE.Mesh(sciGeo, dark);
    sci.position.set(0.42, -0.16, -0.12);
    group.add(sci);

    // The message home: Voyager's Golden Record, Pioneer's plaque.
    if (pioneer) {
      const plaqueGeo = new THREE.BoxGeometry(0.24, 0.17, 0.012);
      geos.push(plaqueGeo);
      const plaque = new THREE.Mesh(plaqueGeo, gold);
      plaque.position.set(-0.2, -0.13, 0.16);
      plaque.rotation.set(0.2, 0.1, 0);
      group.add(plaque);
    } else {
      const recGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24);
      geos.push(recGeo);
      const rec = new THREE.Mesh(recGeo, gold);
      rec.rotation.x = Math.PI / 2;
      rec.position.set(0.02, -0.08, 0.31);
      group.add(rec);
    }
    return group;
  }

  // --- Russell's teapot: china, unfalsifiable ------------------------------
  function buildTeapot(planet, mats, geos) {
    const group = new THREE.Group();
    const china = new THREE.MeshPhongMaterial({
      color: 0xf6f3ec, specular: 0xffffff, shininess: 90, side: THREE.DoubleSide,
    });
    const cobalt = new THREE.MeshPhongMaterial({
      color: 0x2c4f9e, specular: 0xdde6ff, shininess: 80,
    });
    mats.push(china, cobalt);

    const body = [
      [0.0, -0.58], [0.22, -0.58], [0.4, -0.5], [0.54, -0.32],
      [0.6, -0.1], [0.58, 0.1], [0.48, 0.26], [0.36, 0.33], [0.34, 0.36],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const bodyGeo = new THREE.LatheGeometry(body, 28);
    geos.push(bodyGeo);
    group.add(new THREE.Mesh(bodyGeo, china));

    const lid = [
      [0.35, 0.36], [0.3, 0.42], [0.18, 0.48], [0.07, 0.5], [0.06, 0.54], [0.0, 0.54],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const lidGeo = new THREE.LatheGeometry(lid, 28);
    geos.push(lidGeo);
    group.add(new THREE.Mesh(lidGeo, china));

    const knobGeo = new THREE.SphereGeometry(0.075, 14, 10);
    geos.push(knobGeo);
    const knob = new THREE.Mesh(knobGeo, china);
    knob.position.y = 0.58;
    group.add(knob);

    // Spout: a swept tube, because a straight cone does not pour.
    const spoutCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.45, -0.24, 0),
      new THREE.Vector3(0.68, -0.16, 0),
      new THREE.Vector3(0.82, 0.06, 0),
      new THREE.Vector3(0.86, 0.26, 0),
    ]);
    const spoutGeo = new THREE.TubeGeometry(spoutCurve, 16, 0.085, 10, false);
    geos.push(spoutGeo);
    group.add(new THREE.Mesh(spoutGeo, china));

    const handleGeo = new THREE.TorusGeometry(0.26, 0.055, 8, 22, Math.PI * 1.25);
    geos.push(handleGeo);
    const handle = new THREE.Mesh(handleGeo, china);
    handle.position.set(-0.56, -0.05, 0);
    handle.rotation.z = -0.5;
    group.add(handle);

    // Cobalt band around the shoulder, the one detail a telescope would resolve.
    const bandGeo = new THREE.TorusGeometry(0.4, 0.022, 6, 30);
    geos.push(bandGeo);
    const band = new THREE.Mesh(bandGeo, cobalt);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.19;
    group.add(band);
    return group;
  }

  // --- The monolith: 1 : 4 : 9, to the limit of measurement ----------------
  function buildMonolith(planet, mats, geos) {
    const group = new THREE.Group();
    const slabMat = new THREE.MeshPhongMaterial({
      color: 0x050507, specular: 0x0a0a10, shininess: 4, emissive: 0x000000,
    });
    mats.push(slabMat);
    const slabGeo = new THREE.BoxGeometry(0.44, 1.0, 0.111);
    geos.push(slabGeo);
    group.add(new THREE.Mesh(slabGeo, slabMat));

    // A hair of rim light so the slab is not a hole in the star field.
    const rimGeo = new THREE.BoxGeometry(0.47, 1.04, 0.14);
    geos.push(rimGeo);
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0x2a3350, transparent: true, opacity: 0.22,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    mats.push(rimMat);
    group.add(new THREE.Mesh(rimGeo, rimMat));
    return group;
  }

  // --- Hubble: tube, arrays, antennas. Broken parts read as broken ---------
  function buildTelescope(planet, mats, geos) {
    const group = new THREE.Group();
    const H = window.GalaxySim && window.GalaxySim.Hubble;
    const health = (part) => (H && H.partHealth ? H.partHealth(part) : 100);

    const foil = new THREE.MeshPhongMaterial({
      color: 0xd6d3c8, specular: 0xffffff, shininess: 60,
    });
    const aft = new THREE.MeshPhongMaterial({
      color: 0x9a8a5f, specular: 0xffe9b0, shininess: 70,
    });
    const dark = new THREE.MeshPhongMaterial({ color: 0x2f333c, shininess: 12 });
    const arrayLive = new THREE.MeshPhongMaterial({
      color: 0x28407a, specular: 0x9fc6ff, shininess: 70,
      emissive: 0x060c1c, side: THREE.DoubleSide,
    });
    const arrayDead = new THREE.MeshPhongMaterial({
      color: 0x2a2620, specular: 0x141414, shininess: 5, side: THREE.DoubleSide,
    });
    mats.push(foil, aft, dark, arrayLive, arrayDead);

    // Main tube, lying along X.
    const tubeGeo = new THREE.CylinderGeometry(0.26, 0.26, 1.0, 22);
    geos.push(tubeGeo);
    const tube = new THREE.Mesh(tubeGeo, foil);
    tube.rotation.z = Math.PI / 2;
    group.add(tube);

    const aftGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.3, 22);
    geos.push(aftGeo);
    const aftBay = new THREE.Mesh(aftGeo, aft);
    aftBay.rotation.z = Math.PI / 2;
    aftBay.position.x = -0.6;
    group.add(aftBay);

    // Aperture door, hinged open at the forward end (shut if it is the broken part).
    const doorGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.02, 22);
    geos.push(doorGeo);
    const door = new THREE.Mesh(doorGeo, foil);
    const doorOk = health("Aperture Door") >= 35;  // i18n-ignore  ship part id
    door.position.set(0.5, doorOk ? 0.22 : 0, doorOk ? 0.06 : 0);
    door.rotation.z = Math.PI / 2;
    door.rotation.x = doorOk ? -1.05 : 0;
    group.add(door);

    // Solar arrays. A dead wing goes dark and hangs off its axis.
    const wingGeo = new THREE.BoxGeometry(0.86, 0.014, 0.32);
    geos.push(wingGeo);
    [["Solar Array (Port)", 1], ["Solar Array (Starboard)", -1]].forEach(([name, side]) => {  // i18n-ignore  ship part ids, matched by health()
      const ok = health(name) >= 35;
      const wing = new THREE.Mesh(wingGeo, ok ? arrayLive : arrayDead);
      wing.position.set(0, 0, side * 0.52);
      if (!ok) wing.rotation.x = side * 0.55;
      group.add(wing);
    });

    // High-gain antennas on their booms.
    const boomGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.34, 6);
    geos.push(boomGeo);
    const hgaGeo = new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, 0.9);
    geos.push(hgaGeo);
    [1, -1].forEach((side) => {
      const boom = new THREE.Mesh(boomGeo, dark);
      boom.position.set(side * 0.3, side * 0.3, 0);
      group.add(boom);
      const hga = new THREE.Mesh(hgaGeo, foil);
      hga.position.set(side * 0.3, side * 0.48, 0);
      hga.rotation.x = side > 0 ? 0 : Math.PI;
      group.add(hga);
    });
    return group;
  }

  // --- The Omega Tower: what stands where Earth stood ----------------------
  // A lance: a tapering octagonal shaft carried on a plinth and drawn out into
  // a spike, black to the point of reading as a cut-out with gold at every
  // edge the light can catch (bands, ribs, the tip, the glow of its floors).
  // Built along +Y at unit scale like every other artificial body.
  function buildOmegaTower(planet, mats, geos) {
    const group = new THREE.Group();
    const black = new THREE.MeshPhongMaterial({
      color: 0x07070a, specular: 0x2a2a34, shininess: 26, emissive: 0x010102,
    });
    const gold = new THREE.MeshPhongMaterial({
      color: 0xc9a03c, specular: 0xffe9a8, shininess: 110, emissive: 0x3a2a06,
    });
    const litGold = new THREE.MeshBasicMaterial({ color: 0xffd76a });
    mats.push(black, gold, litGold);

    // Shaft: eight faces, drawn in from a broad foot to a needle. Everything
    // that wraps it is sized off shaftR() rather than off its own guesswork, or
    // the gold sits proud at the foot and is swallowed by the shaft up top.
    const SH_BOT = -0.355, SH_TOP = 1.195, SH_R0 = 0.19, SH_R1 = 0.05;
    const shaftR = (y) => SH_R0 + (SH_R1 - SH_R0) *
      Math.max(0, Math.min(1, (y - SH_BOT) / (SH_TOP - SH_BOT)));
    const shaftGeo = new THREE.CylinderGeometry(SH_R1, SH_R0, SH_TOP - SH_BOT, 8);
    geos.push(shaftGeo);
    const shaft = new THREE.Mesh(shaftGeo, black);
    shaft.position.y = (SH_TOP + SH_BOT) / 2;
    group.add(shaft);

    // Plinth: the block the lance is planted in.
    const plinthGeo = new THREE.CylinderGeometry(0.24, 0.34, 0.2, 8);
    geos.push(plinthGeo);
    const plinth = new THREE.Mesh(plinthGeo, black);
    plinth.position.y = -0.45;
    group.add(plinth);

    const collarGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.035, 8);
    geos.push(collarGeo);
    const collar = new THREE.Mesh(collarGeo, gold);
    collar.position.y = -0.34;
    group.add(collar);

    // The point. Long enough that the whole building reads as a weapon.
    const tipGeo = new THREE.ConeGeometry(0.05, 0.62, 8);
    geos.push(tipGeo);
    const tip = new THREE.Mesh(tipGeo, gold);
    tip.position.y = 1.5;
    group.add(tip);

    // Gold banding, thinning with the shaft as it climbs.
    const bandGeo = new THREE.CylinderGeometry(1, 1, 0.022, 8);
    geos.push(bandGeo);
    for (let i = 0; i < 6; i++) {
      const y = -0.3 + (i / 5) * 1.42;
      const r = shaftR(y) * 1.07;
      const band = new THREE.Mesh(bandGeo, gold);
      band.scale.set(r, 1, r);
      band.position.y = y;
      group.add(band);
    }

    // Four ribs running the height of the lower shaft, and the flare where the
    // shaft meets its foot.
    const ribGeo = new THREE.BoxGeometry(0.02, 1.0, 0.05);
    geos.push(ribGeo);
    const flareGeo = new THREE.BoxGeometry(0.055, 0.02, 0.3);
    geos.push(flareGeo);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
      const rib = new THREE.Mesh(ribGeo, gold);
      rib.position.set(Math.cos(a) * 0.145, 0.12, Math.sin(a) * 0.145);
      rib.rotation.y = -a;
      group.add(rib);
      const flare = new THREE.Mesh(flareGeo, gold);
      flare.position.set(Math.cos(a) * 0.28, -0.28, Math.sin(a) * 0.28);
      flare.rotation.y = -a;
      group.add(flare);
    }

    // Lit floors: a stack of unshaded gold slivers, so the silhouette carries
    // its own light instead of going out whenever it turns away from the star.
    const floorGeo = new THREE.CylinderGeometry(1, 1, 0.008, 8);
    geos.push(floorGeo);
    for (let i = 0; i < 22; i++) {
      const y = -0.3 + (i / 21) * 1.4;
      const floor = new THREE.Mesh(floorGeo, litGold);
      const r = shaftR(y) * 1.03;
      floor.scale.set(r, 1, r);
      floor.position.y = y;
      group.add(floor);
    }

    // A breath of gold around the whole thing, or the tower is a hole in the
    // star field (the same trick the monolith uses).
    const haloGeo = new THREE.CylinderGeometry(0.09, 0.3, 2.3, 8, 1, true);
    geos.push(haloGeo);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x6a4f16, transparent: true, opacity: 0.2,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    mats.push(haloMat);
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 0.35;
    group.add(halo);

    // Built from the plinth up, so it now sits well off its own origin: drop it
    // onto its middle, or it frames badly in a portrait and turns about a point
    // near its foot rather than about itself.
    group.children.forEach((c) => { c.position.y -= 0.5; });
    return group;
  }

  const ARTIFICIAL_BUILDERS = {
    probe: buildProbe,
    teapot: buildTeapot,
    monolith: buildMonolith,
    telescope: buildTelescope,
    omegatower: buildOmegaTower,
  };
  // Portrait framing per style: the half-extent the body needs on screen.
  const ARTIFICIAL_HALF = { monolith: 0.72, omegatower: 1.45 };

  // ==========================================================================
  // Renderer singleton
  // ==========================================================================

  const Renderer3D = {
    SIZE: 360,
    _inited: false,
    _ok: false,
    _cache: new Map(),
    _maxCache: 48,

    isGasGiant(type) {
      return [
        "gas_giant", "hot_jupiter", "warm_jupiter", "cold_jupiter",
        "ice_giant", "ringed_gas_giant", "puffy",
      ].includes(type);
    },
    isIcy(type) {
      return ["ice", "tundra", "dwarf", "icy"].includes(type);
    },
    isVolcanic(type) {
      return ["lava_ocean", "magma_planet", "chthonian"].includes(type);
    },
    isTerrestrial(type) {
      return ["earth_like", "ocean", "habitable"].includes(type);
    },
    hasRings(type) {
      return type === "ringed_gas_giant";
    },
    // Bodies below the ~400km the gravity needs to pull a world round: they
    // keep whatever shape the last collision left them, so they are built from
    // a deformed sphere instead of the shared one (see buildIrregularGeometry).
    isIrregular(type) {
      return [
        "c_type_asteroid", "s_type_asteroid", "m_type_asteroid", "trojan_asteroid",
        "asteroid", "planetesimal", "centaur",
        "comet", "short_period_comet", "long_period_comet",
      ].includes(type);
    },
    isComet(type) {
      return ["comet", "short_period_comet", "long_period_comet"].includes(type);
    },
    hasAtmosphere(type) {
      return ![
        "dwarf", "c_type_asteroid", "s_type_asteroid", "m_type_asteroid",
        "trojan_asteroid", "comet", "short_period_comet", "long_period_comet",
        "mercurian", "planetesimal", "centaur", "carbon",
      ].includes(type);
    },

    // ========================================================================
    // Ground-truth sampling: the SAME noise field paintTerrestrial/paintRocky
    // paint the landing-grid picker's equirectangular texture from, exposed as
    // data instead of pixels. ProceduralMapBiomeGenerator.js's alien-surface
    // terrain generators sample these at fine (per-tile) resolution so what
    // grows/erodes under the party's feet is the same shape as what the picker
    // shows, continuous across every square of the landing grid.
    // ========================================================================

    // Elevation + terrain band at a point on an `isTerrestrial` planet.
    // u: longitude fraction [0,1), wraps seamlessly (mirrors fbmTileX's tiling).
    // v: latitude fraction [0,1), 0 = north edge, 1 = south edge.
    // Mirrors paintTerrestrial's banding (js/plugins/GalaxySim/GalaxySim_Renderer3D.js
    // paintTerrestrial) exactly, so a "grass" tile on the ground sits exactly
    // where the picture paints grass-green.
    terrestrialElevation(seed, u, v, isOcean) {
      const e = fbmTileX(u * TEX_W, v * TEX_H, TEX_W, 0.045, seed, 5);
      const seaLevel = isOcean ? 0.62 : 0.5;
      let band;
      if (e < seaLevel) {
        band = "water";
      } else {
        const land = (e - seaLevel) / (1 - seaLevel);
        if (land < 0.08) band = "beach";
        else if (land < 0.45) band = "grass";
        else if (land < 0.72) band = "forest";
        else band = "rock";
      }
      const lat = (v - 0.5) * 2;
      const iceLine = 0.78 - e * 0.12;
      if (Math.abs(lat) > iceLine) band = "snow";
      return { elevation: e, seaLevel, band };
    },

    // Crater scatter for the ground (alien-surface crater-field terrain):
    // {u, v, r}. u/v are the SAME longitude/latitude fractions [0,1) paintRocky
    // hashes its texture craters from, so a crater sits under the same spot the
    // landing-grid picker shows a pockmark. r is a radius in landing-grid CELL
    // widths (not texture pixels -- paintRocky's px radii are picture-scale
    // only and would almost never clear one square) so a walked crater can
    // credibly span several procedural maps; squared bias keeps most craters
    // modest with the occasional multi-square impact basin.
    rockyCraterList(seed, count) {
      const n = count || 14;
      const list = [];
      for (let i = 0; i < n; i++) {
        const u = hash(i, seed, 3);
        const v = 0.15 + hash(i, seed, 4) * 0.7;
        const r = 0.2 + Math.pow(hash(i, seed, 5), 2) * 3.5;
        list.push({ u, v, r });
      }
      return list;
    },

    // ========================================================================
    // Any world's ground, not just a terrestrial one
    // ========================================================================
    // Every painter above builds its bump map out of one noise field at one
    // scale, and that bump map IS the world's relief: what the picture shades
    // as a ridge is a ridge. terrestrialElevation answers for paintTerrestrial;
    // the rest of the sky had nothing to answer with, so a walked ice moon and
    // a walked lava world were both raised out of the terrestrial field and
    // came out as the same continent twice.
    //
    // surfaceFamilyOf says which painter a world belongs to, and
    // planetElevation samples THAT painter's own field, at its own scale, with
    // the extra readings each family's ground needs: the fissure field a
    // volcanic world's lava runs in, the fracture lines an icy world cracks
    // along, and a finer octave of the same field for the metre scale, which
    // the picture is painted far too coarsely to carry.
    surfaceFamilyOf(type) {
      if (this.isGasGiant(type)) return "gas";
      if (this.isVolcanic(type)) return "volcanic";
      if (this.isIcy(type)) return "icy";
      if (this.isTerrestrial(type)) return "terrestrial";
      return "rocky";
    },

    // opts: { family, isOcean }. u/v are the same longitude/latitude fractions
    // terrestrialElevation takes. Returns the elevation in 0..1, the sea level
    // to measure it from, the band the picture paints there, a detail reading
    // of the same field four times finer, and the two family fields
    // (crack: how deep in a fissure this is, fracture: how near a crack line).
    planetElevation(seed, u, v, opts) {
      const o = opts || {};
      const fam = o.family || "rocky";
      const f = SURFACE_FIELDS[fam] || SURFACE_FIELDS.rocky;
      // The detail octave: the SAME field carried on past the five octaves the
      // texture stops at, so the roughness underfoot belongs to this world
      // rather than to a generic noise laid over it.
      const detail = fbmTileX(u * TEX_W * 4, v * TEX_H * 4, TEX_W * 4, f.scale, seed + 61, 3);
      if (fam === "terrestrial") {
        const r = this.terrestrialElevation(seed, u, v, !!o.isOcean);
        r.detail = detail;
        r.crack = 0;
        r.fracture = 0;
        return r;
      }
      const e = fbmTileX(u * TEX_W, v * TEX_H, TEX_W, f.scale, seed, 5);
      const lat = Math.abs((v - 0.5) * 2);
      let band = "rock";
      let crack = 0;
      let fracture = 0;
      if (fam === "volcanic") {
        // paintVolcanic's own fissure test, to the letter: where two noise
        // fields meet, the crust is open and the melt is showing.
        const cracks = fbmTileX(u * TEX_W, v * TEX_H, TEX_W, 0.09, seed + 5, 4);
        crack = Math.max(0, 0.5 - Math.abs(cracks - 0.5)) * 2;
        band = crack > 0.78 ? "lava" : (e < 0.42 ? "ash" : "basalt");
      } else if (fam === "icy") {
        // The fracture lines paintIcy draws over the ice, as a field: how near
        // this point is to one of them.
        const fr = fbmTileX(u * TEX_W, v * TEX_H, TEX_W, 0.11, seed + 17, 3);
        fracture = Math.max(0, 1 - Math.abs(fr - 0.5) * 9);
        band = e > 0.65 ? "snow" : (e < 0.35 ? "ice" : "snow");
        if (e < 0.35) band = "ice";
      } else if (fam === "gas") {
        band = "cloud";
      } else {
        // The rocky bucket: dust in the lowlands, bare rock over it, and the
        // frost the poles of an airless world keep in permanent shadow.
        band = e < 0.4 ? "dust" : (e < 0.75 ? "rock" : "ridge");
        if (lat > 0.9) band = "snow";
      }
      return { elevation: e, seaLevel: -0.35, band, detail, crack, fracture };
    },

    init() {
      if (this._inited) return this._ok;
      this._inited = true;
      if (typeof THREE === "undefined") {
        this._ok = false;
        return false;
      }
      try {
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          premultipliedAlpha: true,
          preserveDrawingBuffer: true,
        });
        renderer.setSize(this.SIZE, this.SIZE);
        renderer.setClearColor(0x000000, 0);
        // Color management: support both the modern (r150+) and legacy
        // (r12x-r14x, this project's bundle) THREE.js color APIs.
        if (renderer.outputColorSpace !== undefined && THREE.SRGBColorSpace !== undefined) {
          renderer.outputColorSpace = THREE.SRGBColorSpace;
        } else if (THREE.sRGBEncoding !== undefined) {
          renderer.outputEncoding = THREE.sRGBEncoding;
        }
        this.renderer = renderer;

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.01, 100);
        this.camera.position.set(0, 0, 6);
        this.camera.lookAt(0, 0, 0);

        this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
        this.sun.position.set(-5, 3, 5);
        this.scene.add(this.sun);
        this.ambient = new THREE.AmbientLight(0x20283a, 0.55);
        this.scene.add(this.ambient);

        // Higher-detail spheres for smoother planet silhouettes (still a single
        // shared geometry, so the vertex cost is paid once for the whole scene).
        this._sphereGeo = new THREE.SphereGeometry(1, 96, 64);
        this._cloudGeo = new THREE.SphereGeometry(1.015, 64, 48);
        this._ok = true;
      } catch (e) {
        console.error("[GalaxySim Renderer3D] WebGL init failed:", e);
        this._ok = false;
      }
      return this._ok;
    },

    available() {
      return this.init();
    },

    _setFrustum(half) {
      const cam = this.camera;
      if (cam.right === half) return;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.updateProjectionMatrix();
    },

    _makeTexture(canvas, srgb) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      if (srgb && THREE.SRGBColorSpace !== undefined) {
        tex.colorSpace = THREE.SRGBColorSpace;
      } else if (srgb && tex.encoding !== undefined && THREE.sRGBEncoding !== undefined) {
        tex.encoding = THREE.sRGBEncoding;
      }
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      return tex;
    },

    // Real NASA equirectangular surface maps for the Solar System's named bodies,
    // dropped in img/pictures/Planets/. Loaded once and shared (cached), so they
    // are never tracked for per-group disposal. Returns a THREE.Texture or null.
    _realPlanetTexture(planet) {
      const name = planet && planet.name;
      // A world that has been set alight (Saturn, after Nibiru) is no longer
      // the world the photograph was taken of: it falls back to paint.
      if (planet && planet.ignited) return null;
      if (!name || !SOL_PLANET_TEXTURES[name]) return null;
      const base = SOL_PLANET_TEXTURES[name];
      if (!this._solTexCache) this._solTexCache = {};
      if (Object.prototype.hasOwnProperty.call(this._solTexCache, base)) {
        return this._solTexCache[base];
      }
      // Resolve the file (jpg preferred, png fallback). Under NW.js we can check
      // the filesystem; in a plain browser build assume .jpg and let onError
      // clear the cache entry so it falls back to procedural next rebuild.
      let url = null;
      const dirRel = "img/pictures/Planets/";
      try {
        const fs = require("fs");
        const path = require("path");
        const dir = path.join(path.dirname(process.mainModule.filename), "img", "pictures", "Planets");  // i18n-ignore  asset folder
        for (const ext of [".jpg", ".png"]) {
          if (fs.existsSync(path.join(dir, base + ext))) { url = dirRel + base + ext; break; }
        }
        if (!url) { this._solTexCache[base] = null; return null; }
      } catch (e) {
        url = dirRel + base + ".jpg"; // browser fallback
      }
      const loader = new THREE.TextureLoader();
      const self = this;
      // The file decodes asynchronously: until it lands the material renders
      // untextured (black), so callers that cache a single render of the body
      // must be able to tell the frame apart from a finished one.
      this._solTexPending = (this._solTexPending || 0) + 1;
      const settled = function () {
        self._solTexPending = Math.max(0, (self._solTexPending || 1) - 1);
      };
      const tex = loader.load(url, settled, undefined, function () {
        self._solTexCache[base] = null; // load failed -> use procedural henceforth
        settled();
      });
      if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
      else if (tex.encoding !== undefined && THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      this._solTexCache[base] = tex;
      return tex;
    },

    // True while a real (NASA) surface map is still loading. A render taken now
    // shows the body untextured, so anything that caches a single frame of it
    // (the ship background) must keep refreshing until this reads false.
    hasPendingTextures() {
      return (this._solTexPending || 0) > 0;
    },

    // Painted planet surfaces (map/bump/spec/emissive/clouds canvases) are
    // deterministic from name+type+seed, so a given body paints identically
    // every time - but nothing was caching that, and every buildPlanetGroup
    // call (every planet AND every moon, every single time the star map is
    // opened, even revisiting the same system) redid the full per-pixel
    // synthesis from scratch. That synchronous cost is the star map's real
    // open-lag: this cache makes every visit after the first one free.
    _paintCached(key, paintFn) {
      if (!this._planetTexCache) this._planetTexCache = new Map();
      let tex = this._planetTexCache.get(key);
      if (!tex) {
        tex = paintFn();
        this._planetTexCache.set(key, tex);
      }
      return tex;
    },

    _seedFor(planet, fallback) {
      if (typeof fallback === "number") return fallback;
      const name = (planet && planet.name) || "x";
      let s = 0;
      for (let i = 0; i < name.length; i++) s += name.charCodeAt(i) * (i + 1);
      return s;
    },

    // Plain 2D equirectangular <canvas> (TEX_W x TEX_H) for a planet, using the
    // same paint* dispatch as _buildPlanet but without building any THREE.js
    // geometry/material. Returns null for the Solar System's named bodies
    // (they wear a real NASA texture instead of a procedural one) -- callers
    // that need a grid/unwrap map should treat null as "no grid available".
    getPlanetTextureCanvas(planet, seed) {
      if (this._realPlanetTexture(planet)) return null;
      const type = planet.type;
      const texKey = (planet.name || "?") + "|" + type + "|" + seed;
      let tex;
      if (this.isGasGiant(type)) tex = this._paintCached(texKey, () => paintGasGiant(planet, seed));
      else if (this.isVolcanic(type)) tex = this._paintCached(texKey, () => paintVolcanic(planet, seed));
      else if (this.isIcy(type)) tex = this._paintCached(texKey, () => paintIcy(planet, seed));
      else if (this.isTerrestrial(type)) tex = this._paintCached(texKey, () => paintTerrestrial(planet, seed));
      else tex = this._paintCached(texKey, () => paintRocky(planet, seed));
      return tex.map;
    },

    // Draws a planet's unwrapped texture into an arbitrary 2D canvas context
    // (a DOM <canvas> context or an RPG Maker Bitmap.context), scaled to
    // destW x destH and overlaid with a gridW x gridH grid. Shared by the
    // GalaxySim landing picker and the on-foot WorldMap alien-surface view so
    // both render identically. `highlightCell`/`playerCell` are optional
    // {gx, gy} cell indices to outline.
    drawPlanetGrid(ctx, opts) {
      opts = opts || {};
      const textureCanvas = opts.textureCanvas;
      const destW = opts.destW || 0;
      const destH = opts.destH || 0;
      const gridW = Math.max(1, opts.gridW || 1);
      const gridH = Math.max(1, opts.gridH || 1);
      if (!ctx || !textureCanvas || destW <= 0 || destH <= 0) return;

      ctx.drawImage(textureCanvas, 0, 0, textureCanvas.width, textureCanvas.height, 0, 0, destW, destH);

      const cellW = destW / gridW;
      const cellH = destH / gridH;

      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= gridW; gx++) {
        const x = Math.round(gx * cellW) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, destH);
        ctx.stroke();
      }
      for (let gy = 0; gy <= gridH; gy++) {
        const y = Math.round(gy * cellH) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(destW, y);
        ctx.stroke();
      }

      const strokeCell = (cell, color, width) => {
        if (!cell) return;
        const gx = ((cell.gx % gridW) + gridW) % gridW;
        const gy = ((cell.gy % gridH) + gridH) % gridH;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.strokeRect(gx * cellW + width / 2, gy * cellH + width / 2, cellW - width, cellH - width);
      };
      strokeCell(opts.highlightCell, "rgba(255, 233, 168, 0.95)", 2);
      strokeCell(opts.playerCell, "#FF3B30", 2);
      ctx.restore();
    },

    // An artificial body (probe, teapot, monolith, telescope) is assembled from
    // geometry instead of a textured sphere, but wears the same group contract.
    _buildArtificial(planet, seed) {
      const build = ARTIFICIAL_BUILDERS[planet.artificial];
      const group = new THREE.Group();
      const mats = [];
      const geos = [];
      const body = build(planet, mats, geos);
      // Fixed attitude jitter so two probes on the same orbit aren't clones.
      body.rotation.set(
        (nHash(planet.name, 3) - 0.5) * 0.9,
        nHash(planet.name, 5) * Math.PI * 2,
        (nHash(planet.name, 7) - 0.5) * 0.7
      );
      group.add(body);
      group._body = body;
      group._clouds = null;
      group._phase = (String(planet.name || "a").charCodeAt(0) || 1) % 7;
      group._half = ARTIFICIAL_HALF[planet.artificial] || 1.15;
      group._type = planet.type;
      group._artificial = planet.artificial;
      group._mats = mats;
      group._geos = geos;
      group._textures = [];
      return group;
    },

    _buildPlanet(planet, seed) {
      if (planet.artificial && ARTIFICIAL_BUILDERS[planet.artificial]) {
        return this._buildArtificial(planet, seed);
      }
      const type = planet.type;
      const group = new THREE.Group();
      let ringExtras = null;
      const irregular = this.isIrregular(type);
      const comet = this.isComet(type);

      // Real Solar-System planets wear their actual NASA surface map (see
      // _realPlanetTexture); everything else is painted procedurally.
      const realMap = this._realPlanetTexture(planet);
      let tex = null;
      const matParams = { shininess: 8, specular: 0x111111 };

      if (realMap) {
        matParams.map = realMap;
        // A gentle specular so oceans / ices catch the star without hiding the map.
        matParams.specular = 0x223344;
        matParams.shininess = 18;
      } else {
        const texKey = (planet.name || "?") + "|" + type + "|" + seed;
        if (this.isGasGiant(type)) tex = this._paintCached(texKey, () => paintGasGiant(planet, seed));
        else if (this.isVolcanic(type)) tex = this._paintCached(texKey, () => paintVolcanic(planet, seed));
        else if (this.isIcy(type)) tex = this._paintCached(texKey, () => paintIcy(planet, seed));
        else if (this.isTerrestrial(type)) tex = this._paintCached(texKey, () => paintTerrestrial(planet, seed));
        else if (comet) {
          // A comet nucleus is one of the darkest surfaces there is: a crust of
          // sooty dust over the ice, not the bright snowball the coma suggests.
          tex = this._paintCached(texKey,
            () => paintRocky({ name: planet.name, color: planet.color || "#4a4a52" }, seed));
        } else tex = this._paintCached(texKey, () => paintRocky(planet, seed));

        matParams.map = this._makeTexture(tex.map, true);
        if (tex.bumpCanvas) {
          matParams.bumpMap = this._makeTexture(tex.bumpCanvas, false);
          // A body this small is all relief: rubble, boulders and crater walls.
          matParams.bumpScale = irregular ? 0.09 : 0.035;
        }
        if (tex.specCanvas) {
          matParams.specularMap = this._makeTexture(tex.specCanvas, false);
          matParams.specular = 0x6688aa;
          matParams.shininess = 45;
        }
        if (tex.emissiveCanvas) {
          matParams.emissiveMap = this._makeTexture(tex.emissiveCanvas, true);
          matParams.emissive = 0xffffff;
          matParams.emissiveIntensity = 1.4;
        }
      }
      const mat = new THREE.MeshPhongMaterial(matParams);
      // A world is a sphere; a rock is whatever the last impact left of it.
      let shapeGeo = null;
      if (irregular) {
        shapeGeo = buildIrregularGeometry(seed * 7919 + 13, {
          // A comet nucleus is the more extreme shape of the two: contact
          // binaries and duck-shaped lobes, cut into by outgassing pits.
          elongation: comet ? 0.42 : 0.3,
          roughness: comet ? 0.3 : 0.24,
          lobes: comet ? 8 : 7,
          craters: comet ? 7 : 6,
          craterScale: comet ? 1.4 : 1,
          segW: 48, segH: 32,
        });
      }
      const body = new THREE.Mesh(shapeGeo || this._sphereGeo, mat);
      body.rotation.z = 0.35; // slight axial tilt
      if (irregular) {
        // Nothing this small spins about a tidy vertical axis: the long axis is
        // laid over so the body visibly tumbles as it turns.
        body.rotation.x = (nHash(planet.name, 23) - 0.5) * 1.6;
        body.rotation.z = (nHash(planet.name, 37) - 0.5) * 1.6;
      }
      group.add(body);

      let clouds = null;
      if (tex && tex.clouds) {
        const cloudMat = new THREE.MeshPhongMaterial({
          map: this._makeTexture(tex.clouds, true),
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        });
        clouds = new THREE.Mesh(this._cloudGeo, cloudMat);
        clouds.rotation.z = 0.35;
        body.add(clouds);
      }

      // Planetary rings
      if (this.hasRings(type)) {
        const ringTex = this._makeRingTexture(planet, seed);
        const ringGeo = new THREE.RingGeometry(1.35, 2.15, 96, 1);
        // remap UVs so the texture runs radially
        const pos = ringGeo.attributes.position;
        const uv = ringGeo.attributes.uv;
        const v2 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v2.fromBufferAttribute(pos, i);
          const r = v2.length();
          const u = (r - 1.35) / (2.15 - 1.35);
          uv.setXY(i, u, 0.5);
        }
        const ringMat = new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          opacity: 0.95,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2 - 0.42;
        group.add(ring);
        ringExtras = { geo: ringGeo, mat: ringMat, tex: ringTex };
        group._half = 2.3;
      } else {
        group._half = this.hasAtmosphere(type) ? 1.18 : 1.08;
      }

      // Coma + tails. They ride OUTSIDE the spinning nucleus (a tail is blown
      // by the star, it does not turn with the rock) and are aimed by
      // _orientTail; until the scene aims them they lie along local +Z.
      let envelope = null;
      if (comet) {
        envelope = buildCometEnvelope(planet, seed);
        group.add(envelope.group);
        // In the live system view the tail flies at full length; the offscreen
        // portrait path has a fixed square frame, so there it is cut down to
        // fit (_fitTail) rather than sprayed off the edge of the canvas.
        group._half = 2.6;
        group._fitTail = (half) => envelope.group._setSpan((half * 0.95) / envelope.span);
        group._fullTail = () => envelope.group._setSpan(1);
        // Cut to fit by default, so a consumer that frames a body tightly and
        // knows nothing about tails (a portrait, a title-screen card) is safe;
        // the system view asks for the full length explicitly.
        group._fitTail(group._half);
        const tailWorld = new THREE.Vector3();
        // dir: a WORLD-space unit vector the tail should point down (away from
        // the star). getWorldPosition refreshes the parent chain first, so the
        // aim is exact even on the frame the comet has just been moved.
        group._orientTail = (dir) => {
          envelope.group.getWorldPosition(tailWorld).add(dir);
          envelope.group.lookAt(tailWorld);
        };
      }

      // Orbital debris (Earth's Kessler cloud): rides OUTSIDE the spinning body
      // node, since the belt keeps its own precession, not the planet's day.
      let debris = null;
      if (planet.debris) {
        debris = buildOrbitalDebris(planet, seed);
        group.add(debris.group);
        group._half = Math.max(group._half, 1.72);
      }
      if (debris || envelope) {
        group._animateExtras = (t) => {
          if (debris) debris.group._animate(t);
          if (envelope) envelope.group._animate(t);
        };
      }

      const phaseName = (planet.name || "p");
      group._phase = (phaseName.charCodeAt(0) || 1) % 7;
      group._body = body;
      group._clouds = clouds;
      group._type = type;
      group._mats = [mat];
      if (clouds) group._mats.push(clouds.material);
      // The real Sol texture is shared + cached, so it must NOT be disposed with
      // the group; only per-instance (procedural) textures are tracked here.
      group._textures = [matParams.bumpMap, matParams.specularMap, matParams.emissiveMap].filter(Boolean);
      if (!realMap && matParams.map) group._textures.unshift(matParams.map);
      group._geos = [];
      // The irregular hull is per-body, unlike the shared sphere: it dies with
      // the group.
      if (shapeGeo) group._geos.push(shapeGeo);
      if (ringExtras) {
        group._mats.push(ringExtras.mat);
        group._textures.push(ringExtras.tex);
        group._geos.push(ringExtras.geo);
      }
      if (debris) {
        debris.mats.forEach((m) => group._mats.push(m));
        debris.geos.forEach((g) => group._geos.push(g));
      }
      if (envelope) {
        envelope.mats.forEach((m) => group._mats.push(m));
        envelope.geos.forEach((g) => group._geos.push(g));
        envelope.textures.forEach((t) => group._textures.push(t));
      }
      return group;
    },

    _makeRingTexture(planet, seed) {
      const w = 256, h = 8;
      const c = newCanvas(w, h);
      const ctx = c.getContext("2d");
      const base = rgb(planet.color || "#caa472");
      const img = ctx.createImageData(w, h);
      for (let x = 0; x < w; x++) {
        const n = fbm(x * 0.12, 0, seed + 21, 4);
        const gap = Math.sin(x * 0.4) * 0.5 + 0.5;
        let a = 0.25 + n * 0.75;
        if (gap < 0.15) a *= 0.15;
        const tint = mix(mix(base, { r: 60, g: 40, b: 25 }, 0.4), { r: 255, g: 240, b: 210 }, n);
        for (let y = 0; y < h; y++) {
          const idx = (y * w + x) * 4;
          img.data[idx] = tint.r;
          img.data[idx + 1] = tint.g;
          img.data[idx + 2] = tint.b;
          img.data[idx + 3] = Math.floor(Math.min(1, a) * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    },

    _buildStar(system, seed) {
      const tex = paintStarSurface(system, seed);
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        map: this._makeTexture(tex.map, true),
      });
      const body = new THREE.Mesh(this._sphereGeo, mat);
      group.add(body);
      // additive corona shell
      const col = rgb(system.color || "#ffd27f");
      const colorHex = (col.r << 16) | (col.g << 8) | col.b;
      const coronaMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.4,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const coronaGeo = new THREE.SphereGeometry(1.18, 32, 24);
      const corona = new THREE.Mesh(coronaGeo, coronaMat);
      group.add(corona);

      // Bright, wispy magnetic prominence loops arcing off the photosphere -
      // the dramatic "coronal loop" look (Elite Dangerous et al.), not just a
      // flat glow shell. Riding the body means they spin with its own slow
      // rotation for free (see Scene3D_Bodies' animate()).
      const prom = buildProminenceArcs(seed, colorHex);
      prom.arcs.forEach((a) => body.add(a.mesh));
      group._arcs = prom.arcs;

      group._body = body;
      group._isStar = true;
      group._half = 1.22;
      group._mats = [mat, coronaMat, ...prom.mats];
      group._textures = [mat.map];
      // The arcs' own tube geometry is swapped out every frame (sway/snap),
      // so it is NOT tracked here - _dispose() releases each arc's current
      // geometry straight off group._arcs instead.
      group._geos = [coronaGeo];
      return group;
    },

    _get(key, builder) {
      let obj = this._cache.get(key);
      if (obj) {
        // refresh LRU position
        this._cache.delete(key);
        this._cache.set(key, obj);
        return obj;
      }
      obj = builder();
      // GalaxySim is EXEMPT from the retro looks (window.RetroShader.NONE):
      // a star map is not a period 3D game, and banding a nebula or snapping a
      // planet's limb to a low-res grid reads as a fault, not a style.
      if (window.RetroShader) window.RetroShader.NONE.applyToObject(obj);
      this._cache.set(key, obj);
      if (this._cache.size > this._maxCache) {
        const oldestKey = this._cache.keys().next().value;
        const old = this._cache.get(oldestKey);
        this._dispose(old);
        this._cache.delete(oldestKey);
      }
      return obj;
    },

    _dispose(group) {
      if (!group) return;
      // Exotic bodies (black holes, remnants, theoretical objects) are built
      // by Scene3D_Cosmos and own their whole subtree, so they release
      // themselves rather than through the _mats/_geos bookkeeping.
      if (group._disposeCustom) { group._disposeCustom(); return; }
      if (group._textures) group._textures.forEach((t) => t && t.dispose && t.dispose());
      if (group._mats) group._mats.forEach((m) => m && m.dispose && m.dispose());
      if (group._geos) group._geos.forEach((g) => g && g.dispose && g.dispose());
      // Prominence arcs rebuild their own geometry every frame (see
      // updateProminenceArc), so only whatever is currently attached needs
      // releasing here.
      if (group._arcs) group._arcs.forEach((a) => a.strands && a.strands.forEach((st) => st.mesh && st.mesh.geometry && st.mesh.geometry.dispose()));
    },

    // ------------------------------------------------------------------
    // Public (real-time 3D scene): build standalone planet / star groups the
    // caller owns and renders in its own THREE scene. Unlike renderPlanet /
    // renderStar these are NOT cached (the offscreen 2D-composite path is).
    // Neither wears a retro look: GalaxySim is exempt, see RetroShader.NONE. The returned group reuses the
    // shared sphere/cloud geometry, so the caller must release it ONLY via
    // disposeBodyGroup(group) -- never dispose its child geometry directly.
    //
    // Each group carries: _body, _clouds, _phase, _half, _type/_isStar plus
    // the _mats/_textures/_geos bookkeeping used for disposal.
    // ------------------------------------------------------------------
    buildPlanetGroup(planet, seed) {
      if (!this.init()) return null;
      return this._buildPlanet(planet, this._seedFor(planet, seed));
    },

    buildStarGroup(system, seed) {
      if (!this.init()) return null;
      return this._buildStar(system, this._seedFor(system, seed));
    },

    // A field of tiny debris fragments as one mesh (see buildDebrisMesh). Used
    // by the system view for the asteroid and Kuiper belts; the caller owns the
    // returned mesh and disposes its geometry/material.
    makeDebrisMesh(opts) {
      if (!this.init()) return null;
      return buildDebrisMesh(opts);
    },

    // Dispose a group made by buildPlanetGroup / buildStarGroup (releases its
    // per-instance materials + textures + extra geometry; never the shared
    // sphere/cloud geometry).
    disposeBodyGroup(group) {
      this._dispose(group);
    },

    // ------------------------------------------------------------------
    // Public: draw a 3D planet onto the 2D context. Returns true on success.
    // sunScreen = {x,y} on-screen position of the parent star (light source).
    // ------------------------------------------------------------------
    renderPlanet(ctx, x, y, radius, planet, seed, time, sunScreen) {
      if (!this.init()) return false;
      try {
        const s = this._seedFor(planet, seed);
        const key = "P:" + (planet.name || "?") + ":" + planet.type;
        const obj = this._get(key, () => this._buildPlanet(planet, s));

        const t = time || 0;
        obj._body.rotation.y = t * 0.12 + obj._phase;
        if (obj._clouds) obj._clouds.rotation.y = t * 0.17 + obj._phase;
        if (obj._animateExtras) obj._animateExtras(t);
        if (obj._type && obj._mats[0].emissiveIntensity !== undefined && this.isVolcanic(obj._type)) {
          obj._mats[0].emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.3;
        }

        // Light from the parent star's on-screen direction (canvas y is down).
        let lx = -0.55, ly = -0.4, lz = 0.7;
        if (sunScreen) {
          const dx = sunScreen.x - x;
          const dy = sunScreen.y - y;
          const len = Math.hypot(dx, dy) || 1;
          lx = dx / len;
          ly = -dy / len;
          lz = 0.6;
        }
        this.sun.position.set(lx * 6, ly * 6, lz * 6);
        // A tail is always anti-solar. The depth component is damped so the
        // plume lies across the frame instead of pointing at (or away from) the
        // viewer, where it would be a foreshortened smudge.
        if (obj._orientTail) {
          if (!_tailDir) _tailDir = new THREE.Vector3();
          _tailDir.set(-lx, -ly, -lz * 0.3).normalize();
          obj._orientTail(_tailDir);
          if (obj._fitTail) obj._fitTail(obj._half);
        }

        this._setFrustum(obj._half);
        this.scene.add(obj);
        // Exempt: see the note on applyToObject above. Straight through, no
        // low-res pass.
        this.renderer.render(this.scene, this.camera);
        this.scene.remove(obj);

        const drawSize = radius * 2 * obj._half;
        ctx.drawImage(
          this.renderer.domElement,
          x - drawSize / 2,
          y - drawSize / 2,
          drawSize,
          drawSize
        );
        return true;
      } catch (e) {
        console.error("[GalaxySim Renderer3D] renderPlanet failed:", e);
        return false;
      }
    },

    // ------------------------------------------------------------------
    // A system's central body as its OWN model, not as a generic sphere: the
    // black hole builder for a hole, the exotic roster (remnants, brown
    // dwarfs, protostars, theoretical objects...) for anything Scene3D_Cosmos
    // knows how to build, a dark world for a rogue planet, and the ordinary
    // star otherwise. Returns a cached group carrying _half (the orthographic
    // half-frustum that frames it) and an optional _animate(t).
    // ------------------------------------------------------------------
    _buildSystemBody(system) {
      const Cosmos = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
      const type = (system && system.type) || "";
      const isHole = !!(system && system.blackHoleType) ||
        type === "BLACK_HOLE" || type === "SUPERMASSIVE_BLACK_HOLE";
      const grand = (system && system.blackHoleType === "hypermassive") ||
        (system && system.blackHoleType === "supermassive") ||
        type === "SUPERMASSIVE_BLACK_HOLE";
      const seedOf = (salt) => {
        const name = (system && system.name) || "?";
        let h = salt;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return h;
      };
      if (isHole && Cosmos && Cosmos.buildBlackHole) {
        const hole = Cosmos.buildBlackHole({
          radius: 1, seed: seedOf(991),
          jets: system.feeding ? true : (system.blackHoleType === "regular" ? false : undefined),
          jetChance: grand ? 0.8 : 0.45,
          style: grand ? "interstellar" : undefined,
        });
        if (hole) {
          const g = hole.group;
          // Framed on the disk, not on the jets: a beam runs out to eight
          // radii and would shrink the hole itself to a speck.
          g._half = grand ? 9.5 : 4.6;
          g._animate = hole.animate;
          g._disposeCustom = hole.dispose;
          return g;
        }
      }
      if (!isHole && type === "ROGUE_PLANET") {
        const rogue = this._buildPlanet({
          name: (system && system.name) || "rogue",
          type: (system && system.planetType) || "rocky",
          color: "#3a3f4a", radius: 1,
        }, this._seedFor(system, null));
        if (rogue) return rogue;
      }
      if (!isHole && Cosmos && Cosmos.isExoticStarType && Cosmos.isExoticStarType(type) &&
        Cosmos.buildExoticStar) {
        const exotic = Cosmos.buildExoticStar(system, { radius: 1, seed: seedOf(557) });
        if (exotic) {
          const g = exotic.group;
          const box = new THREE.Box3().setFromObject(g);
          const size = box.getSize(new THREE.Vector3());
          const reach = Math.max(size.x, size.y, size.z) / 2;
          g._half = Math.max(1.25, Math.min(6, reach * 1.12));
          g._animate = exotic.animate;
          g._disposeCustom = exotic.dispose;
          return g;
        }
      }
      return this._buildStar(system, this._seedFor(system, null));
    },

    _systemBodyKey(system) {
      return "B:" + ((system && system.name) || "?") + ":" + ((system && system.type) || "") +
        ":" + ((system && system.blackHoleType) || "");
    },

    /**
     * The orthographic half-frustum this body needs, in units of the body's
     * own radius: 1.22 for an ordinary star, but nearly ten for a Gargantua
     * whose disk dwarfs its horizon. A caller that wants the WHOLE object on
     * screen sizes the body down by this (see the ship background). Null when
     * there is no WebGL to build it with.
     */
    systemBodyHalf(system) {
      if (!this.init()) return null;
      try {
        const obj = this._get(this._systemBodyKey(system), () => this._buildSystemBody(system));
        return obj ? obj._half : null;
      } catch (e) {
        return null;
      }
    },

    /**
     * Draw a system's central body onto a 2D context, whatever kind of object
     * it is (see _buildSystemBody). Same contract as renderStar, which stays
     * as the plain-star fast path.
     */
    renderSystemBody(ctx, x, y, radius, system, time) {
      if (!this.init()) return false;
      try {
        const obj = this._get(this._systemBodyKey(system), () => this._buildSystemBody(system));
        if (!obj) return false;
        const t = time || 0;
        if (obj._animate) obj._animate(t);
        else if (obj._isStar) {
          obj._body.rotation.y = t * 0.05;
          if (obj._mats[0].map) {
            obj._mats[0].map.offset.x = (t * 0.01) % 1;
            obj._mats[0].map.offset.y = Math.sin(t * 0.05) * 0.02;
          }
          obj._mats[1].opacity = 0.38 + Math.sin(t * 2.5) * 0.06;
        } else if (obj._body) {
          // A rogue world just turns.
          obj._body.rotation.y = t * 0.12 + (obj._phase || 0);
        }

        this._setFrustum(obj._half);
        this.scene.add(obj);
        // Exempt: see the note on applyToObject above. Straight through, no
        // low-res pass.
        this.renderer.render(this.scene, this.camera);
        this.scene.remove(obj);

        const drawSize = radius * 2 * obj._half;
        ctx.drawImage(this.renderer.domElement,
          x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
        return true;
      } catch (e) {
        console.error("[GalaxySim Renderer3D] renderSystemBody failed:", e);
        return false;
      }
    },

    // ------------------------------------------------------------------
    // Public: draw a 3D star surface onto the 2D context.
    // ------------------------------------------------------------------
    renderStar(ctx, x, y, radius, system, time) {
      if (!this.init()) return false;
      try {
        const s = this._seedFor(system, null);
        const key = "S:" + (system.name || "?");
        const obj = this._get(key, () => this._buildStar(system, s));

        const t = time || 0;
        obj._body.rotation.y = t * 0.05;
        // animated turbulence by scrolling the surface texture
        if (obj._mats[0].map) {
          obj._mats[0].map.offset.x = (t * 0.01) % 1;
          obj._mats[0].map.offset.y = Math.sin(t * 0.05) * 0.02;
        }
        const pulse = 0.38 + Math.sin(t * 2.5) * 0.06;
        obj._mats[1].opacity = pulse;

        // star lights its own surface fully (MeshBasicMaterial ignores lights)
        this._setFrustum(obj._half);
        this.scene.add(obj);
        // Exempt: see the note on applyToObject above. Straight through, no
        // low-res pass.
        this.renderer.render(this.scene, this.camera);
        this.scene.remove(obj);

        const drawSize = radius * 2 * obj._half;
        ctx.drawImage(
          this.renderer.domElement,
          x - drawSize / 2,
          y - drawSize / 2,
          drawSize,
          drawSize
        );
        return true;
      } catch (e) {
        console.error("[GalaxySim Renderer3D] renderStar failed:", e);
        return false;
      }
    },
  };

  window.GalaxySim.Renderer3D = Renderer3D;
  // Exposed separately so Scene3D_Bodies' animate() can rebuild one
  // prominence loop's geometry per frame (sway/snap) without reaching into
  // this module's private function scope.
  window.GalaxySim.Renderer3D.updateProminenceArc = updateProminenceArc;
})();
