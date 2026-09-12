/*:
 * @target MZ
 * @plugindesc GalaxySim 3D World - Coordinate mapping & per-scale world units for the 3D star map
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim 3D World Module
 * ============================================================================
 * Pure-logic helpers shared by the real-time 3D star map (Scene3D):
 *  - Maps light-year positions (DataManager) to local three.js world units,
 *    one origin-centred frame per scale so float precision stays sane across
 *    the AU -> 93 Gly range.
 *  - Holds the per-scale "light-years per world unit" reference table and the
 *    axis convention (galactic plane = XZ, galactic height = Y).
 *  - Maps continuous camera distance to a discrete SCALE_* level.
 *
 * LOAD ORDER: after GalaxySim_Math.js, before GalaxySim_Scene3D.js.
 * Requires THREE.js (js/libs/three.min.js).
 */

(() => {
  "use strict";

  if (!window.GalaxySim) window.GalaxySim = {};

  const M = window.GalaxySim.Math || {};
  const {
    SCALE_SYSTEM, SCALE_GALAXY, SCALE_LOCAL_GROUP, SCALE_SUPERCLUSTER,
    SCALE_FILAMENTS, SCALE_OBSERVABLE, SCALE_UNIVERSE_SPHERE,
  } = M;

  // ==========================================================================
  // Per-scale world-unit reference: how many light-years map to ONE three.js
  // world unit at each scale. Chosen so the relevant content for that scale
  // lands in roughly [0.1, 10000] world units, keeping the camera distance and
  // depth buffer in a comfortable range. Tunable.
  //   SYSTEM is special: planet orbits are already in AU and used as units 1:1
  //   (handled in Scene3D_Bodies), so its ly mapping is unused.
  // ==========================================================================
  // Each entry is what one world unit MEANS at that scale, and the builder for
  // that scale draws to it: multiply a view's framing radius by its unit and
  // the answer is the real size of the thing being drawn. That was not true
  // before. The galaxy said 4 ly per unit while Scene3D_Cosmos drew its disk at
  // 20 (GAL.U); the supercluster framed 1.6 Gly for a structure 250 Mly across;
  // and the last two scales framed 3 and 5 TRILLION light years for a universe
  // whose observable radius is 46.5 Gly - a thousand times too far out, which
  // is why both were a featureless ball with nothing to see in them.
  const LY_PER_UNIT = {
    [SCALE_SYSTEM]: 1,              // unused (system uses AU directly)
    [SCALE_GALAXY]: 20,             // = GAL.U: 52 kly disk -> 2600 u
    [SCALE_LOCAL_GROUP]: 5e3,       // 1 u = 5 kly: 5 Mly radius -> 1000 u
    [SCALE_SUPERCLUSTER]: 2.5e5,    // 1 u = 0.25 Mly: Laniakea's 250 Mly -> 1000 u
    [SCALE_FILAMENTS]: 1e7,         // 1 u = 10 Mly: the 46.5 Gly observable -> 4650 u
    [SCALE_OBSERVABLE]: 2e7,        // 1 u = 20 Mly: the same sphere, seen whole -> 2325 u
    [SCALE_UNIVERSE_SPHERE]: 1e8,   // 1 u = 100 Mly: the observable sphere is 465 u across
  };

  // Suggested near/far clip planes per scale (world units). FAR/NEAR kept well
  // under 1e5 so depth precision holds.
  const CLIP = {
    [SCALE_SYSTEM]: { near: 0.01, far: 20000 },
    [SCALE_GALAXY]: { near: 0.5, far: 120000 },
    [SCALE_LOCAL_GROUP]: { near: 0.1, far: 80000 },
    [SCALE_SUPERCLUSTER]: { near: 0.1, far: 80000 },
    [SCALE_FILAMENTS]: { near: 0.1, far: 80000 },
    [SCALE_OBSERVABLE]: { near: 0.1, far: 200000 },
    [SCALE_UNIVERSE_SPHERE]: { near: 0.1, far: 200000 },
  };

  // Camera-distance bands (world units) used to decide when to step to the
  // adjacent scale while zooming. Index = SCALE_* level.
  // Zoom-level captions. Read through getters so a language change is picked
  // up without a reload.
  const SCALE_NAMES = {
    get [SCALE_SYSTEM]() { return T('Galaxy.scale.system'); },
    get [SCALE_GALAXY]() { return T('Galaxy.scale.galaxy'); },
    get [SCALE_LOCAL_GROUP]() { return T('Galaxy.scale.localGroup'); },
    get [SCALE_SUPERCLUSTER]() { return T('Galaxy.scale.supercluster'); },
    get [SCALE_FILAMENTS]() { return T('Galaxy.scale.filaments'); },
    get [SCALE_OBSERVABLE]() { return T('Galaxy.scale.observable'); },
    get [SCALE_UNIVERSE_SPHERE]() { return T('Galaxy.scale.universe'); },
  };

  // ==========================================================================
  // WorldScale - stateless coordinate helper (one shared instance is fine).
  // ==========================================================================
  class WorldScale {
    /** Light-years per world unit for a scale. */
    unitLy(scale) {
      return LY_PER_UNIT[scale] != null ? LY_PER_UNIT[scale] : 1;
    }

    clip(scale) {
      return CLIP[scale] || CLIP[SCALE_GALAXY];
    }

    name(scale) {
      return SCALE_NAMES[scale] || T('Galaxy.scale.unknown');
    }

    /**
     * Convert a light-year position {x,y,z} into a local three.js Vector3,
     * relative to a focus origin (also in ly). Axis convention: the galactic
     * plane is the world XZ plane and galactic "height" (ly z) becomes world Y,
     * which suits an orbit camera that pitches above the plane.
     * @param {{x:number,y:number,z:number}} posLy
     * @param {number} scale  SCALE_* level
     * @param {{x:number,y:number,z:number}} [focusLy]
     * @param {THREE.Vector3} [out]
     */
    toWorld(posLy, scale, focusLy, out) {
      const k = 1 / this.unitLy(scale);
      const fx = focusLy ? focusLy.x || 0 : 0;
      const fy = focusLy ? focusLy.y || 0 : 0;
      const fz = focusLy ? focusLy.z || 0 : 0;
      const v = out || new THREE.Vector3();
      v.set(
        ((posLy.x || 0) - fx) * k,
        ((posLy.z || 0) - fz) * k,
        ((posLy.y || 0) - fy) * k
      );
      return v;
    }

    /**
     * Inverse of toWorld: world Vector3 -> ly position {x,y,z}, given the same
     * scale + focus. Used when free-fly writes the camera back to the ship.
     */
    toLy(world, scale, focusLy) {
      const u = this.unitLy(scale);
      const fx = focusLy ? focusLy.x || 0 : 0;
      const fy = focusLy ? focusLy.y || 0 : 0;
      const fz = focusLy ? focusLy.z || 0 : 0;
      return {
        x: world.x * u + fx,
        y: world.z * u + fy,
        z: world.y * u + fz,
      };
    }
  }

  window.GalaxySim.World3D = {
    WorldScale,
    LY_PER_UNIT,
    CLIP,
    SCALE_NAMES,
  };
})();
