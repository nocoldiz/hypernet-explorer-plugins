/*:
 * @target MZ
 * @plugindesc GalaxySim Math Module - Mathematical utilities and data structures
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim Math Module
 * ============================================================================
 * This module provides mathematical utilities for the GalaxySim system:
 * - Vector2 class for 2D vector operations
 * - Camera class for viewport transformations
 * - RandomGenerator for seeded random number generation
 * - Constants for colors, scales, and unit conversions
 *
 * LOAD ORDER: This module must be loaded BEFORE other GalaxySim modules.
 *
 * DEPENDENCIES: DataManager.js (must be loaded before this)
 */

(() => {
  "use strict";

  // Initialize namespace
  if (!window.GalaxySim) {
    window.GalaxySim = {};
  }

  // ============================================================================
  // Load Data from GalaxyData
  // ============================================================================

  const STAR_TYPES = window.GalaxySim?.StarTypes || {};
  const PLANET_TYPES = window.GalaxySim?.PlanetTypes || {};

  // ============================================================================
  // Helper Functions
  // ============================================================================

  // Helper to convert hex color to CSS format
  function hexToCSS(hexColor) {
    if (typeof hexColor === "string") {
      if (hexColor.startsWith("#")) return hexColor;
      return "#" + hexColor;
    }
    return "#" + hexColor.toString(16).padStart(6, "0");
  }

  // Build star color map from STAR_TYPES
  const STAR_COLORS = {};
  Object.keys(STAR_TYPES).forEach((type) => {
    STAR_COLORS[type] = hexToCSS(STAR_TYPES[type].color);
  });

  // Build planet color map from PLANET_TYPES
  const PLANET_COLORS = {};
  Object.keys(PLANET_TYPES).forEach((type) => {
    PLANET_COLORS[type] = hexToCSS(PLANET_TYPES[type].color);
  });

  // ============================================================================
  // Constants
  // ============================================================================

  const COLORS = {
    background: "#000510",
    grid: "rgba(30, 60, 120, 0.15)",
    gridHighlight: "rgba(50, 100, 180, 0.25)",
    selection: "#00d4ff",
    selectionGlow: "rgba(0, 212, 255, 0.3)",
    current: "#ffaa00",
    connection: "rgba(80, 120, 200, 0.2)",
    scanLine: "rgba(0, 200, 255, 0.4)",
    uiBackground: "rgba(10, 20, 40, 0.92)",
    uiHighlight: "rgba(0, 150, 255, 0.3)",
    uiBorder: "rgba(0, 200, 255, 0.5)",
    text: "#e0e8ff",
    textDim: "#8090b0",
    textHighlight: "#00d4ff",
    orbit: "rgba(80, 120, 200, 0.5)",
    orbitLabel: "rgba(200, 220, 255, 0.9)",
  };

  // Hardcoded defaults preserved so the viewer still looks right if no theme
  // variables are present (web build, missing vars.css, etc.).
  const COLORS_DEFAULTS = Object.assign({}, COLORS);

  // ============================================================================
  // Theme integration: drive the viewer's UI chrome palette from the active
  // theme's CSS custom properties (css/vars.css / css/themes/*). Star, planet
  // and deep-space colours stay physically based; only the HUD chrome (grid,
  // panels, borders, selection, scan lines, labels) follows the theme.
  // ============================================================================

  function parseCssColor(str) {
    if (!str) return null;
    str = String(str).trim();
    if (!str) return null;
    if (str[0] === "#") {
      let h = str.slice(1);
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      if (h.length >= 6) {
        return {
          r: parseInt(h.slice(0, 2), 16),
          g: parseInt(h.slice(2, 4), 16),
          b: parseInt(h.slice(4, 6), 16),
          a: 1,
        };
      }
      return null;
    }
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const p = m[1].split(",").map((s) => parseFloat(s.trim()));
      if (p.length < 3 || p.some((n) => isNaN(n))) return null;
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  }

  function readThemeVar(name) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return v ? v.trim() : "";
    } catch (e) {
      return "";
    }
  }

  // First theme variable that resolves to a valid colour, else null.
  function readThemeColor(names) {
    for (let i = 0; i < names.length; i++) {
      const c = parseCssColor(readThemeVar(names[i]));
      if (c) return c;
    }
    return null;
  }

  function relLuminance(c) {
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  }

  // Brighten a colour toward white until it reads on the near-black starfield.
  // Themes built for light/parchment surfaces use dark accents that would be
  // invisible over space, so we lift them to a guaranteed minimum luminance.
  function ensureMinLuminance(c, min) {
    const lum = relLuminance(c);
    if (lum >= min) return { r: c.r, g: c.g, b: c.b, a: c.a };
    const t = (min - lum) / (1 - lum); // mix toward white
    return {
      r: c.r + (255 - c.r) * t,
      g: c.g + (255 - c.g) * t,
      b: c.b + (255 - c.b) * t,
      a: c.a,
    };
  }

  function mix(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: 1,
    };
  }

  function rgbStr(c) {
    return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  }
  function rgbaStr(c, a) {
    return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
  }

  /**
   * Re-derive the COLORS chrome palette from the currently selected theme.
   * Mutates the shared COLORS object in place so every module that imported it
   * (Scene, Effects, ...) picks up the new values on the next frame.
   */
  function refreshThemeColors() {
    const WHITE = { r: 255, g: 255, b: 255, a: 1 };

    // Primary accent: theme's main interactive/highlight colour.
    const accent = ensureMinLuminance(
      readThemeColor([
        "--text-primary-hover",
        "--accent-gold-2",
        "--text-secondary-active",
      ]) || { r: 0, g: 212, b: 255, a: 1 },
      0.5
    );

    // "Current location" marker accent (kept distinct from selection).
    const current = ensureMinLuminance(
      readThemeColor([
        "--accent-gold-2",
        "--accent-gold-3",
        "--text-secondary-active",
      ]) || { r: 255, g: 170, b: 0, a: 1 },
      0.5
    );

    // Dim/secondary label colour.
    const dim = ensureMinLuminance(
      readThemeColor(["--text-muted-hover", "--accent-gray"]) || {
        r: 128,
        g: 144,
        b: 176,
        a: 1,
      },
      0.42
    );

    // Panel background (used translucent over the starfield).
    const panel =
      readThemeColor(["--bg-panel", "--bg-surface", "--bg-well"]) || {
        r: 10,
        g: 20,
        b: 40,
        a: 1,
      };

    // Readable body text: a bright tint of the accent toward white.
    const text = mix(accent, WHITE, 0.55);

    // Semantic action-button palettes (slower / faster / stop / land). These
    // keep their traffic-light meaning but adopt the theme's own hues.
    const buildSemantic = (base, fallback) => {
      const c = ensureMinLuminance(readThemeColor(base) || fallback, 0.45);
      return {
        bgIdle: rgbaStr(c, 0.3),
        bgHover: rgbaStr(c, 0.45),
        border: rgbaStr(c, 0.9),
        text: rgbStr(mix(c, WHITE, 0.15)),
        textHover: rgbStr(mix(c, WHITE, 0.5)),
      };
    };

    COLORS.info = buildSemantic(["--accent-blue-6", "--accent-blue-3", "--accent-blue"], { r: 70, g: 130, b: 255, a: 1 });
    COLORS.warning = buildSemantic(["--accent-gold-4", "--accent-orange", "--accent-gold-2"], { r: 255, g: 140, b: 0, a: 1 });
    COLORS.danger = buildSemantic(["--accent-red-3", "--accent-red-2"], { r: 220, g: 60, b: 60, a: 1 });
    COLORS.success = buildSemantic(["--accent-green-3", "--accent-green"], { r: 60, g: 200, b: 110, a: 1 });

    // Neutral disabled state for the speed buttons.
    COLORS.disabled = {
      bgIdle: rgbaStr(dim, 0.18),
      bgHover: rgbaStr(dim, 0.18),
      border: rgbaStr(dim, 0.5),
      text: rgbStr(mix(dim, { r: 0, g: 0, b: 0, a: 1 }, 0.3)),
      textHover: rgbStr(dim),
    };

    COLORS.grid = rgbaStr(accent, 0.12);
    COLORS.gridHighlight = rgbaStr(accent, 0.22);
    COLORS.selection = rgbStr(accent);
    COLORS.selectionGlow = rgbaStr(accent, 0.3);
    COLORS.current = rgbStr(current);
    COLORS.connection = rgbaStr(accent, 0.2);
    COLORS.scanLine = rgbaStr(accent, 0.4);
    COLORS.uiBackground = rgbaStr(panel, 0.92);
    COLORS.uiHighlight = rgbaStr(accent, 0.3);
    COLORS.uiBorder = rgbaStr(accent, 0.5);
    COLORS.text = rgbStr(text);
    COLORS.textDim = rgbStr(dim);
    COLORS.textHighlight = rgbStr(accent);
    COLORS.orbit = rgbaStr(accent, 0.5);
    COLORS.orbitLabel = rgbaStr(text, 0.9);
    // Keep deep space dark for contrast; nudge it toward the panel hue a touch.
    COLORS.background = rgbStr(mix(COLORS_DEFAULTS_RGB.background, panel, 0.25));

    return COLORS;
  }

  // Pre-parsed default background for the subtle space tint above.
  const COLORS_DEFAULTS_RGB = {
    background: parseCssColor(COLORS_DEFAULTS.background) || {
      r: 0,
      g: 5,
      b: 16,
      a: 1,
    },
  };

  // Populate the palette from the active theme once at load so every COLORS key
  // (including the semantic button palettes) exists before the first frame.
  try {
    refreshThemeColors();
  } catch (e) {
    /* DOM/theme not ready: keep hardcoded defaults */
  }

  // Zoom thresholds for orbit visibility in galaxy view
  const ORBIT_ZOOM_THRESHOLD = 4;
  const ORBIT_FULL_ALPHA_ZOOM = 10;

  // Planet detail rendering thresholds
  const PLANET_DETAIL_THRESHOLD = 400;
  const PLANET_FULL_DETAIL_ZOOM = 800;
  const PLANET_MIN_SIZE = 0.1;
  const PLANET_MAX_SIZE = 600;

  // Planet types with eccentric orbits
  const ECCENTRIC_ORBIT_TYPES = new Set([
    "rogue",
    "comet",
    "short_period_comet",
    "long_period_comet",
  ]);

  // ============================================================================
  // Multi-Scale Universe Constants
  // ============================================================================

  // Scale levels for universe visualization
  const SCALE_SYSTEM = 0;
  const SCALE_GALAXY = 1;
  const SCALE_LOCAL_GROUP = 2;
  const SCALE_SUPERCLUSTER = 3;
  const SCALE_FILAMENTS = 4;
  const SCALE_OBSERVABLE = 5;
  const SCALE_UNIVERSE_SPHERE = 6;

  // Zoom thresholds for scale transitions
  const SCALE_THRESHOLDS = {
    [SCALE_SYSTEM]: 2.0,
    [SCALE_GALAXY]: 0.02159,
    [SCALE_LOCAL_GROUP]: 0.000001,
    [SCALE_SUPERCLUSTER]: 0.0000091,
    [SCALE_FILAMENTS]: 0.000000001,
    [SCALE_OBSERVABLE]: 0.000000009,
  };

  // Unit conversions (all distances in light-years internally)
  const LY_TO_KLY = 0.001;
  const LY_TO_MLY = 0.000001;
  const LY_TO_GLY = 0.000000001;
  const KLY_TO_LY = 1000;
  const MLY_TO_LY = 1000000;
  const GLY_TO_LY = 1000000000;

  // Galaxy morphology types
  const GALAXY_TYPE_SPIRAL = 'spiral';
  const GALAXY_TYPE_BARRED_SPIRAL = 'barred_spiral';
  const GALAXY_TYPE_ELLIPTICAL = 'elliptical';
  const GALAXY_TYPE_IRREGULAR = 'irregular';
  const GALAXY_TYPE_DWARF = 'dwarf';
  const GALAXY_TYPE_DWARF_SPHEROIDAL = 'dwarf_spheroidal';

  // Map generation constants
  const MAP_RADIUS = 130;
  const SYSTEM_DENSITY = 0.00001;

  // ============================================================================
  // Vector2 Class
  // ============================================================================

  class Vector2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }

    add(v) {
      return new Vector2(this.x + v.x, this.y + v.y);
    }

    sub(v) {
      return new Vector2(this.x - v.x, this.y - v.y);
    }

    mul(s) {
      return new Vector2(this.x * s, this.y * s);
    }

    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
      const len = this.length();
      return len > 0 ? this.mul(1 / len) : new Vector2();
    }

    lerp(v, t) {
      return new Vector2(
        this.x + (v.x - this.x) * t,
        this.y + (v.y - this.y) * t
      );
    }

    distance(v) {
      return this.sub(v).length();
    }
  }

  // ============================================================================
  // Camera Class
  // ============================================================================

  class Camera {
    constructor() {
      this.position = new Vector2(0, 0);
      this.targetPosition = new Vector2(0, 0);
      this.zoom = 1;
      this.targetZoom = 1;
      this.minZoom = 1e-13;
      this.maxZoom = 10000;
      this.smoothing = 0.12;
      this.zoomSmoothing = 0.09; // slow glide; zoom input is fine-grained
    }

    update() {
      this.position = this.position.lerp(this.targetPosition, this.smoothing);
      this.zoom += (this.targetZoom - this.zoom) * this.zoomSmoothing;
    }

    setTarget(x, y) {
      this.targetPosition = new Vector2(x, y);
    }

    setZoom(zoom) {
      this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    }

    screenToWorld(x, y, width, height) {
      return new Vector2(
        (x - width / 2) / this.zoom + this.position.x,
        (y - height / 2) / this.zoom + this.position.y
      );
    }

    worldToScreen(x, y, width, height) {
      return new Vector2(
        (x - this.position.x) * this.zoom + width / 2,
        (y - this.position.y) * this.zoom + height / 2
      );
    }
  }

  // ============================================================================
  // RandomGenerator Class
  // ============================================================================

  class RandomGenerator {
    constructor(seed) {
      this.seed = this.hashCode(seed);
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    }

    random() {
      this.seed = (this.seed * 9301 + 49297) % 233280;
      return this.seed / 233280;
    }

    range(min, max) {
      return min + this.random() * (max - min);
    }

    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    }
  }

  // ============================================================================
  // Strangeness: how far out of the Local Group a place is, and how far from
  // ordinary physics its worlds are allowed to be.
  // ----------------------------------------------------------------------------
  // ONE number answers both, a TIER from 0 to 15. Tier 0 is home: the Milky Way
  // and its neighbours, where a system looks like the solar system. Every step
  // out along the cosmic web raises it, and by the far tiers a "system" may be
  // a dozen stars sharing one orbit, a ring of nothing but garden worlds, or a
  // swarm of planets running backwards through each other's paths.
  //
  // The tier has to survive a save, a reload and a jump back years later, and
  // the only thing a restored system knows about itself is its NAME
  // ("GX.<seed>.<i>"). So the tier is carried in the low four bits of the
  // galaxy seed itself: stampTier() puts it there when a galaxy is first named,
  // tierOfSeed() reads it back, and nothing else has to be plumbed anywhere.
  // Fifteen bits of the hash are spent on it, which costs a seed space of 2^32
  // nothing it will ever notice.
  // ============================================================================
  const STRANGE_MAX_TIER = 15;

  const Strangeness = {
    MAX_TIER: STRANGE_MAX_TIER,

    /** Fold a tier into a hash so the seed carries it for good. */
    stampTier(hash, tier) {
      const t = Math.max(0, Math.min(STRANGE_MAX_TIER, Math.round(tier || 0)));
      return (((hash >>> 0) & ~0xF) | t) >>> 0;
    },

    /** The tier a "GX.<seed>..." seed was stamped with. */
    tierOfSeed(seed) {
      const n = Math.abs(Math.round(seed || 0));
      return n & 0xF;
    },

    /** The tier of a system, from its name alone. Anything that is not a
     *  procedural far-galaxy system (the Milky Way's own, the lazy field, the
     *  hand-authored catalogue) is home, and home is tier 0. */
    tierOfSystemName(name) {
      if (typeof name !== "string" || !name.startsWith("GX.")) return 0;
      const seed = parseInt(name.split(".")[1], 10);
      return Number.isFinite(seed) ? this.tierOfSeed(seed) : 0;
    },

    /** The tier of a place in the cosmic web, from how far out it sits.
     *  `r` and `radius` are in the same units (world units, or ly, or Mly:
     *  only the ratio is read). The curve is deliberately gentle near home -
     *  the Local Group and its wall are ordinary space - and steepens out
     *  towards the edge of the observable universe. */
    tierOfRadius(r, radius) {
      const R = radius > 0 ? radius : 1;
      const f = Math.max(0, Math.min(1, (r || 0) / R));
      return Math.round(Math.pow(f, 0.72) * STRANGE_MAX_TIER);
    },

    /** 0..1, the tier as a fraction: what most generators actually want. */
    strangeness(tier) {
      return Math.max(0, Math.min(1, (tier || 0) / STRANGE_MAX_TIER));
    },
  };

  // ============================================================================
  // Export to namespace
  // ============================================================================

  window.GalaxySim.Math = {
    // How strange a place is allowed to be, by how far out it sits
    Strangeness,
    STRANGE_MAX_TIER,

    // Classes
    Vector2,
    Camera,
    RandomGenerator,

    // Helper functions
    hexToCSS,
    refreshThemeColors,
    parseCssColor,

    // Constants
    COLORS,
    STAR_COLORS,
    PLANET_COLORS,

    // Thresholds
    ORBIT_ZOOM_THRESHOLD,
    ORBIT_FULL_ALPHA_ZOOM,
    PLANET_DETAIL_THRESHOLD,
    PLANET_FULL_DETAIL_ZOOM,
    PLANET_MIN_SIZE,
    PLANET_MAX_SIZE,
    ECCENTRIC_ORBIT_TYPES,

    // Scales
    SCALE_SYSTEM,
    SCALE_GALAXY,
    SCALE_LOCAL_GROUP,
    SCALE_SUPERCLUSTER,
    SCALE_FILAMENTS,
    SCALE_OBSERVABLE,
    SCALE_UNIVERSE_SPHERE,
    SCALE_THRESHOLDS,

    // Unit conversions
    LY_TO_KLY,
    LY_TO_MLY,
    LY_TO_GLY,
    KLY_TO_LY,
    MLY_TO_LY,
    GLY_TO_LY,

    // Galaxy types
    GALAXY_TYPE_SPIRAL,
    GALAXY_TYPE_BARRED_SPIRAL,
    GALAXY_TYPE_ELLIPTICAL,
    GALAXY_TYPE_IRREGULAR,
    GALAXY_TYPE_DWARF,
    GALAXY_TYPE_DWARF_SPHEROIDAL,

    // Map constants
    MAP_RADIUS,
    SYSTEM_DENSITY,
  };

})();
