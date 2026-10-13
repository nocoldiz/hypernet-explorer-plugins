//=============================================================================
// BiomeBackground.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Biome background: a live procedural parallax panorama of the map's biome behind its tiles, with the Omega Tower on the horizon.
 * @author Hypernet Explorer
 *
 * @param mapIds
 * @text Megastructure map ids
 * @desc Comma separated map ids that draw the 3D Omega Tower megastructure behind their tiles.
 * @default 1399
 *
 * @param renderScale
 * @text Render scale
 * @desc Share of the screen resolution the background is rasterised at (0.25 to 1).
 * @default 0.5
 *
 * @help
 * A map tagged <BiomeBG> draws a procedural panorama of the biome it stands
 * in (the generated map's live biome, or the map's own <Biome:> tag) where the
 * parallax would be. A value forces another biome's panorama:
 *   <BiomeBG>               the map's own biome
 *   <BiomeBG: MountainIce>  icy mountains, whatever the map is
 *
 * Only exterior biomes are painted for now: mountains, plains, forests,
 * deserts, snowfields, coasts, cities, ruins and the like. A biome with no
 * panorama of its own falls back to open fields.
 *
 * The panorama is live: the sky follows the hour (dawn, day, dusk, night,
 * with the season's own sunrise and sunset), the sun and the moon cross it,
 * the moon wears its real phase (and Friday's two extra moons), the Kessler
 * ring arches over the south, pale by day and lit up at night, the cloud
 * cover changes day to day and closes in with rain, storm and snow, storms
 * throw distant lightning, frost whitens the land, distance hazes it.
 *
 * The Omega Tower (world square 79 124) stands on the horizon, drawn in 2D
 * at the size, bearing and depth its distance from the party's square calls
 * for: a needle behind the mountains from the far south, a gold gridded spear
 * filling the sky from its foot. The panorama looks north.
 *
 * The Omega Tower's own biome, the mapIds parameter and the legacy tags
 *   <Background: omegatowerstructure>   <omegatowerstructure>
 * draw the 3D megastructure instead (endless shafts, gold-trimmed bridges,
 * birds crossing the void). Falls back to a flat backdrop when WebGL,
 * THREE.js or a 2D canvas is unavailable.
 *
 * The sprite sits where the parallax would, so the tilemap draws over it:
 * leave the map tiles transparent (or holes) where the background should show.
 *
 * window.BiomeBackground
 *   modeFor(mapId, note, biome)  { mode: "structure"|"panorama", family } or null
 *   familyOf(biome)              the panorama family a biome paints with
 *   towerPlacement(x, y, family) where the Omega Tower stands in the frame
 *   isActiveMap(mapId, note)     whether a map draws the 3D megastructure
 *   mapIds()                     the configured megastructure id list
 */
(() => {
  "use strict";

  const PLUGIN_NAME = "BiomeBackground";
  const params = PluginManager.parameters(PLUGIN_NAME) || {};
  const MAP_IDS = String(params.mapIds || "1399")
    .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
  const RENDER_SCALE = Math.min(1, Math.max(0.25, parseFloat(params.renderScale) || 0.5));

  const NOTE_RE = /<(?:Background:\s*)?omegatowerstructure\s*>/i;
  const BIOME_BG_RE = /<\s*BiomeBG\s*(?::\s*([^>]*))?>/i;
  // The world square the tower stands on.
  const TOWER = { x: 79, y: 124 };
  const LAYOUT_SEED = 0x0E6A4A7E;

  const COLORS = {
    black: 0x050505,
    steel: 0x111113,
    steelLight: 0x1b1b1f,
    rock: 0x0c0c0e,
    gold: 0xd4a93a,
    goldDim: 0x8a6a1c,
    bird: 0xe8e4d8,
  };

  // Deterministic layout: the structure is one place, it looks the same
  // every time the player stands in front of it.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isActiveMap(mapId, note) {
    if (MAP_IDS.indexOf(Number(mapId)) >= 0) return true;
    return NOTE_RE.test(String(note || ""));
  }

  function hasThree() {
    return typeof THREE !== "undefined" && !!THREE.WebGLRenderer;
  }

  //===========================================================================
  // THE PANORAMA: biome families
  //===========================================================================
  // A family is a stack of silhouette layers, far to near. `dist` is how many
  // world squares away the layer stands: it decides the haze it wears, how
  // fast it slides with the map scroll and which side of it the Omega Tower
  // is drawn on. `top` and `amp` are fractions of the screen height: the
  // ridge rises no higher than `top` and dips `amp` below it.
  const L = {
    farPeaks: (color, snow) => ({ kind: "peaks", dist: 70, top: 0.16, amp: 0.30, oct: 5, base: 7, rough: 0.55, color, snow: snow || 0 }),
    midPeaks: (color, snow) => ({ kind: "peaks", dist: 32, top: 0.30, amp: 0.24, oct: 4, base: 6, rough: 0.5, color, snow: snow || 0 }),
    lowPeaks: (color, snow) => ({ kind: "peaks", dist: 60, top: 0.40, amp: 0.12, oct: 4, base: 6, rough: 0.5, color, snow: snow || 0 }),
    farHills: (color) => ({ kind: "hills", dist: 55, top: 0.46, amp: 0.10, oct: 3, base: 4, rough: 0.5, color }),
    hills: (color, dist, top) => ({ kind: "hills", dist: dist || 18, top: top || 0.54, amp: 0.09, oct: 3, base: 5, rough: 0.5, color }),
    flat: (color, dist, top) => ({ kind: "hills", dist, top, amp: 0.015, oct: 2, base: 6, rough: 0.5, color }),
    dunes: (color, dist, top, amp) => ({ kind: "dunes", dist, top, amp, oct: 3, base: 5, rough: 0.45, color }),
    mesa: (color, dist, top, amp) => ({ kind: "mesa", dist, top, amp, oct: 3, base: 5, rough: 0.5, color }),
    trees: (color, tree, density, dist, top, size) => ({ kind: "trees", dist: dist || 6, top: top || 0.64, amp: 0.05, oct: 2, base: 6, rough: 0.5, color, tree, density, size: size || 0.06 }),
    nearTrees: (color, tree, density) => ({ kind: "trees", dist: 3, top: 0.78, amp: 0.04, oct: 2, base: 5, rough: 0.5, color, tree, density, size: 0.13 }),
    city: (color, dist, top, amp, density) => ({ kind: "city", dist, top, amp, oct: 2, base: 4, rough: 0.5, color, density }),
    houses: (color, dist, top) => ({ kind: "houses", dist, top, amp: 0.03, oct: 2, base: 4, rough: 0.5, color, density: 0.55 }),
    ruins: (color, dist, top) => ({ kind: "ruins", dist, top, amp: 0.04, oct: 2, base: 4, rough: 0.5, color, density: 0.5 }),
    graves: (color) => ({ kind: "graves", dist: 4, top: 0.76, amp: 0.03, oct: 2, base: 4, rough: 0.5, color, density: 0.7 }),
    volcano: (color) => ({ kind: "volcano", dist: 40, top: 0.12, amp: 0.42, oct: 3, base: 5, rough: 0.5, color }),
    sea: () => ({ kind: "sea", dist: 25 }),
  };

  const FAMILIES = {
    mountains: { biomes: ["Mountain", "Highlands", "VillageMountain"], layers: [
      L.farPeaks([118, 126, 150], 0.45), L.midPeaks([84, 94, 92], 0.15), L.hills([62, 86, 54]),
      L.trees([34, 56, 34], "pine", 0.7)] },
    alpine: { biomes: ["MountainIce"], snowy: true, layers: [
      L.farPeaks([176, 186, 206], 0.85), L.midPeaks([150, 160, 180], 0.6), L.hills([214, 220, 230]),
      L.trees([52, 72, 70], "pine", 0.6)] },
    canyon: { biomes: ["MountainDesert", "Canyon", "Badlands"], layers: [
      L.farPeaks([170, 128, 110]), L.mesa([178, 110, 78], 34, 0.30, 0.2), L.mesa([156, 88, 60], 14, 0.48, 0.14),
      L.dunes([196, 146, 98], 4, 0.76, 0.05)] },
    volcano: { biomes: ["Volcano"], plume: true, layers: [
      L.farPeaks([80, 76, 84]), L.volcano([60, 48, 46]), L.hills([56, 50, 48]),
      L.trees([30, 30, 28], "dead", 0.3)] },
    plains: { biomes: ["Fields", "Meadows", "Park", "Road", "Highway", "Bridge", "River", "RiverBank"], layers: [
      L.farHills([110, 128, 148]), L.hills([92, 132, 70]), L.trees([52, 96, 44], "round", 0.25),
      L.flat([104, 148, 72], 3, 0.80)] },
    farmland: { biomes: ["Farm"], layers: [
      L.farHills([110, 128, 148]), L.hills([120, 140, 70]), L.houses([150, 120, 90], 8, 0.62),
      L.flat([150, 150, 70], 3, 0.80)] },
    village: { biomes: ["Village", "Houses", "Villa", "VillageRiver"], layers: [
      L.farHills([110, 128, 148]), L.hills([92, 132, 70]), L.houses([140, 110, 90], 7, 0.60),
      L.nearTrees([40, 76, 36], "round", 0.3)] },
    forest: { biomes: ["Forest"], layers: [
      L.farHills([100, 120, 130]), L.trees([46, 82, 52], "round", 0.95, 16, 0.52, 0.05),
      L.trees([34, 64, 38], "round", 1, 6, 0.64, 0.08), L.nearTrees([22, 44, 26], "round", 0.8)] },
    spirit: { biomes: ["SpiritWoods", "Fairy"], mist: 0.3, layers: [
      L.farHills([110, 110, 150]), L.trees([60, 80, 110], "round", 0.95, 16, 0.52, 0.05),
      L.trees([44, 64, 90], "pine", 1, 6, 0.64, 0.08), L.nearTrees([30, 40, 64], "round", 0.8)] },
    taiga: { biomes: ["Taiga"], layers: [
      L.lowPeaks([110, 120, 140], 0.4), L.trees([46, 70, 60], "pine", 1, 16, 0.52, 0.05),
      L.trees([30, 52, 44], "pine", 1, 6, 0.64, 0.08), L.nearTrees([20, 38, 30], "pine", 0.7)] },
    forestIce: { biomes: ["ForestIce"], snowy: true, layers: [
      L.lowPeaks([190, 200, 220], 0.9), L.trees([120, 140, 150], "pine", 1, 16, 0.52, 0.05),
      L.trees([80, 104, 110], "pine", 1, 6, 0.64, 0.08), L.flat([232, 238, 246], 3, 0.84)] },
    tropical: { biomes: ["ForestTropical", "Jungle"], mist: 0.2, layers: [
      L.farHills([96, 124, 120]), L.trees([40, 96, 52], "round", 1, 16, 0.52, 0.05),
      L.trees([30, 80, 40], "palm", 0.9, 6, 0.64, 0.09), L.nearTrees([18, 54, 26], "palm", 0.6)] },
    bamboo: { biomes: ["Bamboo"], layers: [
      L.farHills([110, 130, 120]), L.trees([80, 130, 70], "bamboo", 1, 12, 0.50, 0.12),
      L.nearTrees([50, 100, 46], "bamboo", 0.9)] },
    swamp: { biomes: ["Swamp", "Mangrove"], mist: 0.55, layers: [
      L.farHills([100, 112, 104]), L.flat([70, 86, 70], 20, 0.58), L.trees([46, 58, 40], "dead", 0.5, 8, 0.62, 0.07),
      L.flat([56, 66, 48], 3, 0.82)] },
    mushroom: { biomes: ["Mushroom"], mist: 0.25, layers: [
      L.farHills([120, 100, 140]), L.trees([150, 80, 120], "mushroom", 0.7, 12, 0.56, 0.07),
      L.nearTrees([110, 60, 96], "mushroom", 0.6)] },
    desert: { biomes: ["Desert"], layers: [
      L.mesa([200, 160, 120], 60, 0.44, 0.08), L.dunes([214, 176, 120], 22, 0.52, 0.08),
      L.dunes([226, 188, 128], 6, 0.66, 0.08)] },
    desertTown: { biomes: ["VillageDesert", "BurgDesert"], layers: [
      L.mesa([200, 160, 120], 60, 0.44, 0.08), L.dunes([214, 176, 120], 22, 0.52, 0.08),
      L.houses([206, 170, 124], 7, 0.62), L.dunes([226, 188, 128], 3, 0.80, 0.04)] },
    cityDesert: { biomes: ["CityDesert"], layers: [
      L.mesa([200, 160, 120], 60, 0.44, 0.08), L.city([150, 130, 110], 26, 0.32, 0.22, 0.85),
      L.dunes([226, 188, 128], 4, 0.76, 0.05)] },
    saltflats: { biomes: ["SaltFlats"], layers: [
      L.lowPeaks([150, 140, 150], 0.2), L.flat([236, 232, 226], 10, 0.62)] },
    snowfield: { biomes: ["Ice", "Snow", "Permafrost", "Tundra"], snowy: true, layers: [
      L.farPeaks([180, 190, 210], 0.9), L.hills([226, 232, 240]), L.flat([238, 242, 248], 4, 0.72)] },
    snowTown: { biomes: ["VillageIce", "BurgIce"], snowy: true, layers: [
      L.farPeaks([180, 190, 210], 0.9), L.hills([226, 232, 240]), L.houses([120, 100, 90], 7, 0.62),
      L.flat([238, 242, 248], 3, 0.82)] },
    citySnow: { biomes: ["CityIce"], snowy: true, layers: [
      L.farPeaks([180, 190, 210], 0.9), L.city([96, 100, 116], 26, 0.32, 0.22, 0.85),
      L.flat([238, 242, 248], 4, 0.78)] },
    savannah: { biomes: ["Savannah", "Steppe"], layers: [
      L.farHills([150, 140, 120]), L.flat([190, 170, 100], 18, 0.58), L.trees([70, 80, 40], "acacia", 0.15, 6, 0.66, 0.08),
      L.flat([200, 176, 96], 3, 0.84)] },
    coast: { biomes: ["Beach", "VillageSea", "Docks"], horizon: 0.56, layers: [
      L.hills([110, 126, 150], 60, 0.50), L.sea(), L.dunes([226, 206, 160], 3, 0.82, 0.03),
      L.nearTrees([40, 90, 50], "palm", 0.12)] },
    ocean: { biomes: ["Ocean"], horizon: 0.55, layers: [L.sea()] },
    lake: { biomes: ["Lake"], horizon: 0.58, layers: [
      L.lowPeaks([110, 120, 140], 0.3), L.hills([80, 110, 80], 40, 0.53), L.sea(),
      L.flat([90, 130, 70], 3, 0.84)] },
    city: { biomes: ["City", "Burg", "Factory", "Spacecenter", "Arena", "Train"], layers: [
      L.farHills([110, 120, 140]), L.city([70, 74, 86], 30, 0.28, 0.26, 0.9), L.city([52, 54, 64], 10, 0.40, 0.22, 0.8)] },
    landfill: { biomes: ["Landfill"], layers: [
      L.farHills([120, 120, 120]), L.dunes([110, 100, 84], 12, 0.56, 0.1), L.dunes([90, 82, 70], 4, 0.72, 0.08)] },
    ruins: { biomes: ["Ruins", "Abandoned", "Castle", "Temple", "TempleShinto"], layers: [
      L.farHills([110, 120, 136]), L.hills([88, 112, 70]), L.ruins([104, 98, 92], 8, 0.60),
      L.nearTrees([40, 60, 36], "round", 0.25)] },
    graveyard: { biomes: ["Graveyard"], mist: 0.3, layers: [
      L.farHills([96, 100, 116]), L.hills([60, 72, 56]), L.trees([34, 36, 34], "dead", 0.4, 8, 0.62, 0.08),
      L.graves([80, 80, 84])] },
    // The tower's own biome keeps the 3D megastructure.
    omegatower: { biomes: ["OmegaTower"], structure: true, layers: [] },
  };

  const DEFAULT_FAMILY = "plains";
  const FAMILY_OF = {};
  Object.keys(FAMILIES).forEach((key) => {
    FAMILIES[key].biomes.forEach((b) => { FAMILY_OF[normName(b)] = key; });
  });

  function normName(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function knownBiome(n) {
    const list = window.WorldGen && window.WorldGen.Biomes;
    if (!Array.isArray(list)) return false;
    return list.some((b) => b && normName(b.name) === n);
  }

  // The family a biome id paints with, or null. Typos in a hand-written tag
  // (<BiomeBG: MountaiIce>) still land on the nearest covered biome; a real
  // biome the panorama does not cover is never bent onto a lookalike.
  function familyOf(biome) {
    const n = normName(biome);
    if (!n) return null;
    if (FAMILY_OF[n]) return FAMILY_OF[n];
    if (n.indexOf("road") === 0 || n.indexOf("river") === 0) return "plains";
    if (knownBiome(n)) return null;
    const limit = Math.max(1, Math.floor(n.length / 5));
    let best = null, bestD = limit + 1;
    Object.keys(FAMILY_OF).forEach((k) => {
      if (Math.abs(k.length - n.length) > limit) return;
      const d = levenshtein(n, k);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best ? FAMILY_OF[best] : null;
  }

  // The biome the map is standing in: the generated map's live biome, then
  // the map's own <Biome:> tag.
  function currentBiome() {
    try {
      if ($gameSystem && $gameSystem._procGenData && $gameMap &&
          window.WorldMapTransfer && $gameMap.mapId() === window.WorldMapTransfer.procMapId &&
          $gameSystem._procGenData.currentBiome) {
        return String($gameSystem._procGenData.currentBiome);
      }
    } catch (e) { /* no proc data */ }
    const note = ($dataMap && $dataMap.note) || "";
    const m = /<\s*Biome\s*:\s*([^>]+?)\s*>/i.exec(note);
    return m ? m[1] : null;
  }

  // What a map draws behind its tiles: "structure" (the 3D megastructure),
  // "panorama" (a biome panorama, with the family it paints) or null.
  function modeFor(mapId, note, liveBiome) {
    const text = String(note || "");
    if (isActiveMap(mapId, text)) return { mode: "structure", family: "omegatower" };
    const m = BIOME_BG_RE.exec(text);
    if (!m) return null;
    const forced = m[1] && m[1].trim();
    const biome = forced || liveBiome || null;
    const family = familyOf(biome) || DEFAULT_FAMILY;
    if (FAMILIES[family].structure) return { mode: "structure", family, biome };
    return { mode: "panorama", family, biome };
  }

  function currentMode() {
    if (!$gameMap || !$dataMap) return null;
    return modeFor($gameMap.mapId(), $dataMap.note, currentBiome());
  }

  //===========================================================================
  // The Omega Tower seen from afar
  //===========================================================================
  // Bearing 0 is north: the panorama looks north, so the tower stands dead
  // ahead from the south of it and leaves the frame to either side as the
  // party walk round it. Its rise above the horizon falls off with distance
  // but never below the far ridges' height until it is truly remote, so from
  // (64 209) it is a thin needle standing up behind the mountains.
  const VIEW_FOV = Math.PI * 0.9;
  const TOWER_REACH = 0.54;      // rise, as a share of the screen, at REF_DIST
  const TOWER_REF_DIST = 90;
  const TOWER_FALLOFF = 0.6;

  function towerPlacement(px, py, family) {
    const dx = Number(px) - TOWER.x, dy = Number(py) - TOWER.y;
    const tx = -dx, ty = -dy;            // from the party to the tower
    const d = Math.sqrt(tx * tx + ty * ty);
    const bearing = Math.atan2(tx, -ty); // 0 north, + east
    const rise = TOWER_REACH * Math.pow(TOWER_REF_DIST / (d + 4), TOWER_FALLOFF);
    const width = Math.min(0.9, 3.5 / (d + 4));
    const fam = FAMILIES[family] || FAMILIES[DEFAULT_FAMILY];
    // How many layers stand in front of it, counted from the far end.
    let behind = 0;
    fam.layers.forEach((l) => { if (l.dist < d) behind++; });
    const slot = fam.layers.length - behind; // index it is drawn before
    const screenX = 0.5 + bearing / VIEW_FOV;
    const half = width / 2;
    const visible = d > 0.5 && screenX + half > -0.1 && screenX - half < 1.1;
    const haze = Math.min(0.75, 1 - Math.exp(-d / 120));
    return { distance: d, bearing, rise, width, slot, behind, screenX, visible, haze };
  }

  // On any of the tower's own levels (a dungeon floor, a lift hall, the
  // generated lower floors) the party stand inside it: no tower on the horizon.
  function insideTower() {
    const DF = window.DungeonFloors;
    try {
      return !!(DF && typeof DF.onTowerLevels === "function" && DF.onTowerLevels());
    } catch (e) { return false; }
  }

  window.BiomeBackground = {
    isActiveMap,
    insideTower,
    mapIds: () => MAP_IDS.slice(),
    modeFor,
    familyOf,
    families: () => Object.keys(FAMILIES),
    familyLayers: (key) => (FAMILIES[key] ? FAMILIES[key].layers.slice() : []),
    towerPlacement,
    TOWER,
    drawOmegaSpear: (...args) => drawOmegaSpear(...args),
    spearHeadroom: (h, w) => spearHeadroom(h, w),
  };

  //---------------------------------------------------------------------------
  // The 3D view. One per session: the spriteset is thrown away on every
  // menu round trip, the renderer, the scene and the clock are not.
  //---------------------------------------------------------------------------
  const view = {
    renderer: null,
    scene: null,
    camera: null,
    time: 0,
    birds: [],
    lamps: [],
    lastW: 0,
    lastH: 0,
    failed: false,
  };

  function goldMaterial() {
    return new THREE.MeshBasicMaterial({ color: COLORS.gold });
  }

  function steelMaterial(hex) {
    return new THREE.MeshLambertMaterial({ color: hex });
  }

  // A black slab with a gold rim on every edge.
  function trimmedBox(w, h, d, mat, lineMat, group, x, y, z, rim) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    if (rim !== false) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat);
      edges.position.copy(mesh.position);
      mesh.userData.edges = edges;
      group.add(edges);
    }
    return mesh;
  }

  // Gold strip lights along a beam.
  function stripLight(len, axis, group, x, y, z, mat) {
    const t = 0.35;
    const geo = axis === "x"
      ? new THREE.BoxGeometry(len, t, t)
      : axis === "y" ? new THREE.BoxGeometry(t, len, t) : new THREE.BoxGeometry(t, t, len);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function buildRockWall(rand, side, group, lineMat) {
    // The cliff faces that hem the shaft in: stacked irregular slabs.
    const rockMat = steelMaterial(COLORS.rock);
    const wall = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const y = -220 + i * 7 + rand() * 6;
      const depth = 40 + rand() * 60;
      const w = 18 + rand() * 30;
      const z = -40 - rand() * 220;
      const x = side * (120 + rand() * 40 + depth * 0.2);
      const m = trimmedBox(w, 6 + rand() * 9, depth, rockMat, lineMat, wall, x, y, z, rand() < 0.6);
      m.rotation.z = (rand() - 0.5) * 0.35;
      m.rotation.y = (rand() - 0.5) * 0.4;
      if (m.userData.edges) m.userData.edges.rotation.copy(m.rotation);
    }
    group.add(wall);
  }

  function buildStructure(rand) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.black);
    scene.fog = new THREE.Fog(COLORS.black, 90, 420);

    const lineMat = new THREE.LineBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0.85 });
    const lineDim = new THREE.LineBasicMaterial({ color: COLORS.goldDim, transparent: true, opacity: 0.6 });
    const steel = steelMaterial(COLORS.steel);
    const steelLight = steelMaterial(COLORS.steelLight);
    const lampMat = goldMaterial();

    const root = new THREE.Group();
    scene.add(root);

    // Towers: the vertical spines running out of sight top and bottom.
    for (let i = 0; i < 14; i++) {
      const x = -110 + rand() * 220;
      const z = -60 - rand() * 260;
      const w = 6 + rand() * 14;
      const d = 6 + rand() * 14;
      trimmedBox(w, 700, d, i % 3 ? steel : steelLight, lineDim, root, x, 0, z);
      // Ribbing: gold rings every so often.
      const rings = 6 + Math.floor(rand() * 8);
      for (let r = 0; r < rings; r++) {
        const y = -300 + rand() * 600;
        const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.5, d + 1.2), lampMat);
        ring.position.set(x, y, z);
        root.add(ring);
      }
      // Side pipes.
      if (rand() < 0.6) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 700, 6), steelLight);
        pipe.position.set(x + w * 0.5 + 1.5, 0, z + (rand() - 0.5) * d);
        root.add(pipe);
      }
    }

    // Bridges: the horizontal spans crossing the shaft at every depth.
    for (let i = 0; i < 26; i++) {
      const y = -230 + rand() * 460;
      const z = -40 - rand() * 280;
      const len = 180 + rand() * 260;
      const h = 4 + rand() * 10;
      const d = 8 + rand() * 18;
      const x = (rand() - 0.5) * 80;
      const yaw = (rand() - 0.5) * 0.5;
      const span = trimmedBox(len, h, d, rand() < 0.5 ? steel : steelLight, lineMat, root, x, y, z);
      span.rotation.y = yaw;
      if (span.userData.edges) span.userData.edges.rotation.y = yaw;
      // Railings and underside light rails in gold.
      const rail = stripLight(len, "x", root, x, y + h * 0.5 + 0.6, z + d * 0.5, lampMat);
      rail.rotation.y = yaw;
      if (rand() < 0.7) {
        const under = stripLight(len, "x", root, x, y - h * 0.5 - 0.3, z - d * 0.5, lampMat);
        under.rotation.y = yaw;
      }
      // Cabins hanging off the span.
      const cabins = Math.floor(rand() * 4);
      for (let c = 0; c < cabins; c++) {
        const cx = x + (rand() - 0.5) * len * 0.8;
        trimmedBox(6 + rand() * 10, 5 + rand() * 8, d + 4, steelLight, lineMat, root, cx, y - h * 0.5 - 4, z);
      }
      // Windows: small gold squares that blink.
      const windows = Math.floor(rand() * 14);
      for (let wnd = 0; wnd < windows; wnd++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), lampMat);
        win.position.set(x + (rand() - 0.5) * len * 0.9, y + (rand() - 0.5) * h * 0.6, z + d * 0.5 + 0.05);
        root.add(win);
        view.lamps.push({ mesh: win, phase: rand() * Math.PI * 2, rate: 0.2 + rand() * 1.5 });
      }
    }

    // Cables between spans.
    for (let i = 0; i < 18; i++) {
      const x = -100 + rand() * 200;
      const z = -60 - rand() * 240;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 500, 4), steelLight);
      cable.position.set(x, 0, z);
      cable.rotation.z = (rand() - 0.5) * 0.08;
      root.add(cable);
    }

    // Rock faces on both sides.
    buildRockWall(rand, -1, root, lineDim);
    buildRockWall(rand, 1, root, lineDim);

    // The birds: a flock of pale wedges drifting across.
    const birdMat = new THREE.MeshBasicMaterial({ color: COLORS.bird, side: THREE.DoubleSide });
    for (let i = 0; i < 12; i++) {
      const bird = new THREE.Group();
      const wingGeo = new THREE.PlaneGeometry(1.6, 0.5);
      const left = new THREE.Mesh(wingGeo, birdMat);
      const right = new THREE.Mesh(wingGeo, birdMat);
      left.position.x = -0.8; right.position.x = 0.8;
      bird.add(left); bird.add(right);
      bird.position.set(-70 + rand() * 60, -20 + rand() * 30, -50 - rand() * 40);
      scene.add(bird);
      view.birds.push({ group: bird, left, right, phase: rand() * Math.PI * 2, speed: 2 + rand() * 2, drift: (rand() - 0.5) * 0.6 });
    }

    // Light: a cold key from above, a faint gold bounce from below.
    const key = new THREE.DirectionalLight(0xbfc4d0, 0.9);
    key.position.set(30, 200, 60);
    scene.add(key);
    const bounce = new THREE.DirectionalLight(COLORS.goldDim, 0.35);
    bounce.position.set(-40, -200, 40);
    scene.add(bounce);
    scene.add(new THREE.AmbientLight(0x202024, 0.8));

    if (window.PSXShader && typeof window.PSXShader.applyToObject === "function") {
      try { window.PSXShader.applyToObject(scene); } catch (e) { /* plain look */ }
    }
    return scene;
  }

  // The size everything behind the tiles is rasterised at. The sprite is
  // scaled up to the screen, so the GPU only ever receives this many pixels.
  function renderSize() {
    return {
      rw: Math.max(64, Math.floor(Graphics.width * RENDER_SCALE)),
      rh: Math.max(48, Math.floor(Graphics.height * RENDER_SCALE)),
    };
  }

  function ensureView(w, h) {
    if (view.failed) return false;
    if (!hasThree()) { view.failed = true; return false; }
    try {
      if (!view.renderer) {
        view.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
        view.renderer.setPixelRatio(1);
        view.renderer.setClearColor(COLORS.black, 1);
      }
      if (!view.scene) {
        view.scene = buildStructure(mulberry32(LAYOUT_SEED));
        view.camera = new THREE.PerspectiveCamera(58, w / h, 1, 600);
      }
      const { rw, rh } = renderSize();
      if (view.lastW !== rw || view.lastH !== rh) {
        view.renderer.setSize(rw, rh, false);
        view.camera.aspect = w / h;
        view.camera.updateProjectionMatrix();
        view.lastW = rw; view.lastH = rh;
      }
      return true;
    } catch (e) {
      console.warn("[BiomeBackground] 3D view unavailable", e);
      view.failed = true;
      return false;
    }
  }

  function disposeView() {
    if (!view.renderer) return;
    try {
      if (window.PSXShader && window.PSXShader.disposeContext) window.PSXShader.disposeContext(view.renderer);
      view.renderer.dispose();
    } catch (e) { /* already gone */ }
    view.renderer = null; view.scene = null; view.camera = null;
    view.birds = []; view.lamps = []; view.lastW = 0; view.lastH = 0;
  }

  function stepView(dt) {
    view.time += dt;
    const t = view.time;
    const cam = view.camera;
    // Drift with the map scroll, sway on top of it.
    const dx = $gameMap ? $gameMap.displayX() : 0;
    const dy = $gameMap ? $gameMap.displayY() : 0;
    cam.position.set(
      (dx - 20) * 0.9 + Math.sin(t * 0.11) * 3,
      -(dy - 20) * 0.9 + Math.cos(t * 0.07) * 2,
      40 + Math.sin(t * 0.05) * 4
    );
    cam.lookAt(cam.position.x * 0.6, cam.position.y * 0.6 - 10, -160);
    cam.rotation.z += Math.sin(t * 0.04) * 0.02;

    for (const b of view.birds) {
      b.group.position.x += b.speed * dt * 4;
      b.group.position.y += Math.sin(t * 0.8 + b.phase) * dt * 2 + b.drift * dt;
      if (b.group.position.x > 90) { b.group.position.x = -90; b.group.position.y = -20 + Math.random() * 30; }
      const flap = Math.sin(t * 9 + b.phase) * 0.7;
      b.left.rotation.y = flap; b.right.rotation.y = -flap;
    }
    for (const l of view.lamps) {
      l.mesh.visible = Math.sin(t * l.rate + l.phase) > -0.85;
    }
  }

  function renderView() {
    const r = view.renderer;
    if (window.PSXShader && typeof window.PSXShader.render === "function") {
      try { window.PSXShader.render(r, view.scene, view.camera); return; } catch (e) { /* plain */ }
    }
    r.render(view.scene, view.camera);
  }


  //===========================================================================
  // The panorama renderer
  //===========================================================================
  // Everything is painted on 2D canvases at RENDER_SCALE: the silhouette of
  // each layer once per map (twice the screen wide, seamless, so it can slide
  // with the scroll), its lit copy only when the light has visibly changed,
  // and the sky, the sun, the moon, the clouds and the sea every other frame.
  const TOWER_SEED = 0x7A11E5;
  const FRAME_SKIP = 2;
  const SLOW_EVERY = 0.5; // seconds between reads of the slow sky inputs

  function hasCanvas() {
    return typeof document !== "undefined" && !!document && typeof document.createElement === "function";
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const rgb = (c, a) => {
    const r = Math.max(0, Math.min(255, Math.round(c[0])));
    const g = Math.max(0, Math.min(255, Math.round(c[1])));
    const b = Math.max(0, Math.min(255, Math.round(c[2])));
    return a == null ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  };
  const q = (v, steps) => Math.round(v * steps);

  function hashStr(s) {
    let h = 2166136261 >>> 0;
    const str = String(s);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // 1D value noise that wraps at t = 1, so a layer tiles without a seam.
  function periodicNoise(rand, n) {
    const v = [];
    for (let i = 0; i < n; i++) v.push(rand());
    return (t) => {
      const x = (((t % 1) + 1) % 1) * n;
      const i = Math.floor(x), f = x - i;
      const a = v[i % n], b = v[(i + 1) % n];
      return a + (b - a) * ((1 - Math.cos(f * Math.PI)) / 2);
    };
  }

  function fbm(rand, base, oct, rough) {
    const ns = [];
    for (let k = 0; k < oct; k++) ns.push(periodicNoise(rand, base << k));
    return (t) => {
      let s = 0, a = 1, tot = 0;
      for (let k = 0; k < ns.length; k++) { s += ns[k](t) * a; tot += a; a *= rough; }
      return s / tot;
    };
  }

  // The ridge of a layer: 1 is its highest point, 0 its lowest.
  function ridgeFn(layer, rand) {
    const n = fbm(rand, layer.base, layer.oct, layer.rough);
    switch (layer.kind) {
      case "peaks":
        return (t) => {
          const v = n(t);
          const ridged = 1 - Math.abs(2 * v - 1);
          return clamp01(0.6 * Math.pow(ridged, 1.5) + 0.4 * v);
        };
      case "dunes": {
        const k = 3 + Math.floor(rand() * 3);
        return (t) => {
          const s = (((t * k + n(t) * 0.6) % 1) + 1) % 1;
          const crest = s < 0.72 ? s / 0.72 : (1 - s) / 0.28;
          return clamp01(crest * 0.7 + n(t) * 0.3);
        };
      }
      case "mesa":
        return (t) => {
          const v = n(t);
          const step = Math.floor(v * 3 + 0.5) / 3;
          return clamp01(lerp(v, step, 0.85));
        };
      case "volcano": {
        const t0 = 0.25 + rand() * 0.5;
        return (t) => {
          let d = Math.abs(t - t0); if (d > 0.5) d = 1 - d;
          const cone = Math.max(0, 1 - d / 0.16);
          const crater = d < 0.012 ? 0.06 : 0;
          return clamp01(Math.max(n(t) * 0.25, Math.pow(cone, 1.2) - crater));
        };
      }
      default:
        return n;
    }
  }

  // Draw `fn(x)` at x and at its wrapped twin when it pokes over an edge.
  function wrapDraw(W, x, half, fn) {
    fn(x);
    if (x - half < 0) fn(x + W);
    if (x + half > W) fn(x - W);
  }

  function drawTree(g, style, x, y, s, color, rand) {
    const dark = rgb(scale3(color, 0.75));
    g.fillStyle = rgb(color);
    switch (style) {
      case "pine": {
        g.fillStyle = dark;
        g.fillRect(x - s * 0.04, y - s * 0.2, s * 0.08, s * 0.2);
        g.fillStyle = rgb(color);
        for (let i = 0; i < 3; i++) {
          const w = s * (0.42 - i * 0.1), base = y - s * (0.12 + i * 0.26);
          g.beginPath(); g.moveTo(x - w, base); g.lineTo(x + w, base); g.lineTo(x, base - s * 0.42); g.closePath(); g.fill();
        }
        break;
      }
      case "palm": {
        const lean = (rand() - 0.5) * s * 0.4;
        g.strokeStyle = dark; g.lineWidth = Math.max(1, s * 0.06);
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.2, y - s * 0.5, x + lean, y - s); g.stroke();
        g.strokeStyle = rgb(color); g.lineWidth = Math.max(1, s * 0.07);
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.55;
          g.beginPath(); g.moveTo(x + lean, y - s);
          g.quadraticCurveTo(x + lean + Math.cos(a) * s * 0.3, y - s + Math.sin(a) * s * 0.3 - s * 0.05,
            x + lean + Math.cos(a) * s * 0.5, y - s + Math.sin(a) * s * 0.2 + s * 0.15);
          g.stroke();
        }
        break;
      }
      case "bamboo": {
        const stalks = 3 + Math.floor(rand() * 3);
        for (let i = 0; i < stalks; i++) {
          const sx = x + (rand() - 0.5) * s * 0.5, h = s * (0.9 + rand() * 0.6);
          g.fillStyle = rgb(color); g.fillRect(sx, y - h, Math.max(1, s * 0.05), h);
          g.fillStyle = dark;
          for (let k = 1; k < 5; k++) g.fillRect(sx - 1, y - h * k / 5, Math.max(2, s * 0.07), 1);
        }
        break;
      }
      case "dead": {
        g.strokeStyle = rgb(color); g.lineWidth = Math.max(1, s * 0.06);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.8); g.stroke();
        g.lineWidth = Math.max(1, s * 0.03);
        for (let i = 0; i < 4; i++) {
          const by = y - s * (0.35 + i * 0.13), dir = i % 2 ? 1 : -1;
          g.beginPath(); g.moveTo(x, by); g.lineTo(x + dir * s * (0.2 + rand() * 0.15), by - s * 0.18); g.stroke();
        }
        break;
      }
      case "acacia": {
        g.strokeStyle = dark; g.lineWidth = Math.max(1, s * 0.05);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.6); g.lineTo(x - s * 0.15, y - s * 0.75);
        g.moveTo(x, y - s * 0.6); g.lineTo(x + s * 0.18, y - s * 0.78); g.stroke();
        g.beginPath(); g.ellipse(x, y - s * 0.8, s * 0.5, s * 0.1, 0, 0, Math.PI * 2); g.fill();
        break;
      }
      case "mushroom": {
        g.fillStyle = rgb(mix3(color, [230, 220, 210], 0.5));
        g.fillRect(x - s * 0.06, y - s * 0.6, s * 0.12, s * 0.6);
        g.fillStyle = rgb(color);
        g.beginPath(); g.ellipse(x, y - s * 0.6, s * 0.4, s * 0.25, 0, Math.PI, 0); g.fill();
        break;
      }
      default: { // round
        g.fillStyle = dark; g.fillRect(x - s * 0.04, y - s * 0.4, s * 0.08, s * 0.4);
        g.fillStyle = rgb(color);
        g.beginPath(); g.arc(x, y - s * 0.6, s * 0.3, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(x - s * 0.18, y - s * 0.45, s * 0.2, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(x + s * 0.2, y - s * 0.48, s * 0.22, 0, Math.PI * 2); g.fill();
      }
    }
  }

  const WINDOW_LIGHT = [255, 210, 130];

  // One layer's silhouette (and its night lights, where it has any).
  function buildLayer(layer, rw, rh, seed) {
    const W = rw * 2, H = rh;
    const rand = mulberry32(seed);
    const shape = ridgeFn(layer, rand);
    const c = makeCanvas(W, H);
    const g = c.getContext("2d");
    const top = layer.top * H, amp = layer.amp * H;
    const ys = new Float32Array(W + 1);
    for (let x = 0; x <= W; x++) ys[x] = top + amp * (1 - shape(x / W));
    const yAt = (x) => ys[Math.max(0, Math.min(W, Math.round(((x % W) + W) % W)))];
    let ridgeTop = H;
    for (let x = 0; x <= W; x++) if (ys[x] < ridgeTop) ridgeTop = ys[x];

    g.fillStyle = rgb(layer.color);
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) g.lineTo(x, ys[x]);
    g.lineTo(W, ys[W]); g.lineTo(W, H); g.closePath(); g.fill();

    let lights = null, lg = null;
    const needLights = layer.kind === "city" || layer.kind === "houses" || layer.kind === "volcano";
    if (needLights) { lights = makeCanvas(W, H); lg = lights.getContext("2d"); }
    const entry = { canvas: c, lights, layer, W, H, y0: 0, tinted: null, tintKey: "", crater: null, ridge: ys };

    if (layer.snow > 0) {
      g.fillStyle = rgb([238, 242, 250]);
      const line = top + amp * layer.snow;
      for (let x = 0; x < W; x++) {
        if (ys[x] < line) g.fillRect(x, ys[x], 1, (line - ys[x]) * (0.55 + rand() * 0.2));
      }
    }

    switch (layer.kind) {
      case "trees": {
        const step = layer.size * H * 0.55;
        for (let x = 0; x < W; x += step * (0.6 + rand() * 0.8)) {
          if (rand() >= layer.density) continue;
          const s = layer.size * H * (0.7 + rand() * 0.6);
          const col = mix3(layer.color, scale3(layer.color, 1.25), rand() * 0.5);
          wrapDraw(W, x, s, (xx) => drawTree(g, layer.tree, xx, yAt(x) + s * 0.08, s, col, rand));
        }
        break;
      }
      case "city": {
        let x = 0;
        while (x < W) {
          const bw = H * (0.02 + rand() * 0.05);
          if (rand() < layer.density) {
            const bh = amp * (0.25 + rand() * 0.75) + H * 0.03;
            const by = yAt(x) - bh + amp * 0.6;
            const col = scale3(layer.color, 0.85 + rand() * 0.3);
            const bx = x;
            wrapDraw(W, bx, bw, (xx) => { g.fillStyle = rgb(col); g.fillRect(xx, by, bw, H - by); });
            if (rand() < 0.25) {
              wrapDraw(W, bx, bw, (xx) => { g.fillStyle = rgb(col); g.fillRect(xx + bw * 0.45, by - bh * 0.18, Math.max(1, bw * 0.08), bh * 0.18); });
            }
            const ws = Math.max(1, Math.round(H * 0.006));
            for (let wy = by + ws * 2; wy < H; wy += ws * 3) {
              for (let wx = bx + ws; wx < bx + bw - ws; wx += ws * 2.5) {
                if (rand() < 0.35) {
                  const a = (0.5 + rand() * 0.5).toFixed(2);
                  wrapDraw(W, wx, ws, (xx) => { lg.fillStyle = rgb(WINDOW_LIGHT, a); lg.fillRect(xx, wy, ws, ws); });
                }
              }
            }
          }
          x += bw * (0.8 + rand() * 0.6);
        }
        break;
      }
      case "houses": {
        for (let x = 0; x < W; x += H * (0.04 + rand() * 0.06)) {
          if (rand() >= layer.density) continue;
          const w = H * (0.03 + rand() * 0.03), h = w * (0.6 + rand() * 0.3);
          const y = yAt(x) + H * 0.01;
          const col = scale3(layer.color, 0.85 + rand() * 0.3);
          const roof = mix3(scale3(layer.color, 0.6), [120, 50, 40], 0.3);
          const lit = rand() < 0.6, wx = 0.3 + rand() * 0.3;
          wrapDraw(W, x, w, (xx) => {
            g.fillStyle = rgb(col); g.fillRect(xx, y - h, w, h + H * 0.02);
            g.fillStyle = rgb(roof);
            g.beginPath(); g.moveTo(xx - w * 0.12, y - h); g.lineTo(xx + w * 1.12, y - h); g.lineTo(xx + w / 2, y - h - w * 0.45); g.closePath(); g.fill();
            if (lit) { lg.fillStyle = rgb(WINDOW_LIGHT, 0.9); lg.fillRect(xx + w * wx, y - h * 0.6, Math.max(1, w * 0.18), Math.max(1, w * 0.18)); }
          });
        }
        break;
      }
      case "ruins": {
        for (let x = 0; x < W; x += H * (0.03 + rand() * 0.05)) {
          if (rand() >= layer.density) continue;
          const w = H * (0.012 + rand() * 0.02), h = H * (0.03 + rand() * 0.07);
          const y = yAt(x) + H * 0.01;
          const col = scale3(layer.color, 0.85 + rand() * 0.3);
          const jag = [rand(), rand(), rand()];
          const arch = rand() < 0.3;
          wrapDraw(W, x, w * 3, (xx) => {
            g.fillStyle = rgb(col);
            g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y - h); g.lineTo(xx + w * 0.4, y - h * (0.85 + jag[0] * 0.15));
            g.lineTo(xx + w * 0.7, y - h * (0.9 + jag[1] * 0.1)); g.lineTo(xx + w, y - h * (0.8 + jag[2] * 0.2)); g.lineTo(xx + w, y); g.closePath(); g.fill();
            if (arch) {
              g.fillRect(xx + w * 2.2, y - h * 0.9, w, h * 0.9);
              g.lineWidth = Math.max(1, w * 0.5); g.strokeStyle = rgb(col);
              g.beginPath(); g.arc(xx + w * 1.6, y - h * 0.9, w * 1.1, Math.PI, 0); g.stroke();
            }
          });
        }
        break;
      }
      case "graves": {
        for (let x = 0; x < W; x += H * (0.025 + rand() * 0.04)) {
          if (rand() >= layer.density) continue;
          const s = H * (0.02 + rand() * 0.015);
          const y = yAt(x) + H * 0.01;
          const cross = rand() < 0.5;
          wrapDraw(W, x, s, (xx) => {
            g.fillStyle = rgb(layer.color);
            if (cross) { g.fillRect(xx - s * 0.08, y - s, s * 0.16, s); g.fillRect(xx - s * 0.3, y - s * 0.75, s * 0.6, s * 0.14); }
            else {
              g.beginPath(); g.moveTo(xx - s * 0.3, y); g.lineTo(xx - s * 0.3, y - s * 0.6);
              g.arc(xx, y - s * 0.6, s * 0.3, Math.PI, 0); g.lineTo(xx + s * 0.3, y); g.closePath(); g.fill();
            }
          });
        }
        break;
      }
      case "volcano": {
        let best = 0;
        for (let x = 1; x < W; x++) if (ys[x] < ys[best]) best = x;
        entry.crater = { x: best, y: ys[best] };
        const glow = lg.createRadialGradient(best, ys[best], 0, best, ys[best], H * 0.08);
        glow.addColorStop(0, "rgba(255,150,60,0.95)");
        glow.addColorStop(1, "rgba(255,80,20,0)");
        lg.fillStyle = glow; lg.fillRect(best - H * 0.1, ys[best] - H * 0.1, H * 0.2, H * 0.2);
        lg.strokeStyle = "rgba(255,110,40,0.8)"; lg.lineWidth = Math.max(1, H * 0.004);
        for (let i = 0; i < 3; i++) {
          lg.beginPath();
          let lx = best + (rand() - 0.5) * H * 0.02, ly = ys[best];
          lg.moveTo(lx, ly);
          for (let k = 0; k < 8; k++) { lx += (rand() - 0.5) * H * 0.02 + (i - 1) * H * 0.008; ly += H * 0.02; lg.lineTo(lx, ly); }
          lg.stroke();
        }
        break;
      }
      default: break;
    }
    entry.y0 = Math.min(opaqueTop(c, ridgeTop), lights ? opaqueTop(lights, ridgeTop) : H);
    return entry;
  }

  // The first row of a canvas that holds anything: the sky above a layer is
  // empty, and is never composited or drawn. Scanned once, when the layer is
  // built; without pixel access it falls back to the whole canvas.
  function opaqueTop(c, hint) {
    try {
      const g = c.getContext("2d");
      const data = g.getImageData(0, 0, c.width, Math.min(c.height, Math.ceil(hint) + 1)).data;
      const row = c.width * 4;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i]) return Math.max(0, Math.floor((i - 3) / row) - 1);
      }
      return Math.max(0, Math.floor(hint) - 1);
    } catch (e) {
      return 0;
    }
  }

  // The lit copy of a silhouette: frost on it, the light multiplied in, the
  // distance hazed over. Rebuilt only when one of those has visibly moved.
  function tintedCanvas(entry, light, hazeCol, haze, frost) {
    const key = [q(light[0], 40), q(light[1], 40), q(light[2], 40), q(hazeCol[0] / 255, 24),
      q(hazeCol[1] / 255, 24), q(hazeCol[2] / 255, 24), q(haze, 30), q(frost, 10)].join(",");
    if (entry.tintKey === key && entry.tinted) return entry.tinted;
    const c = entry.tinted || makeCanvas(entry.W, entry.H);
    const g = c.getContext("2d");
    // Only the rows below the layer's empty sky are worked on.
    const W = entry.W, y0 = entry.y0 || 0, h = entry.H - y0;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.clearRect(0, y0, W, h);
    g.drawImage(entry.canvas, 0, y0, W, h, 0, y0, W, h);
    if (frost > 0.01) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = rgb([236, 240, 248], frost);
      g.fillRect(0, y0, W, h);
    }
    g.globalCompositeOperation = "multiply";
    g.fillStyle = rgb(scale3(light, 255));
    g.fillRect(0, y0, W, h);
    g.globalCompositeOperation = "destination-in";
    g.drawImage(entry.canvas, 0, y0, W, h, 0, y0, W, h);
    if (haze > 0.01) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = rgb(hazeCol, haze);
      g.fillRect(0, y0, W, h);
    }
    g.globalCompositeOperation = "source-over";
    entry.tinted = c; entry.tintKey = key;
    return c;
  }

  //---------------------------------------------------------------------------
  // Furniture on the land: the same biome sprites the voxel world scatters
  //---------------------------------------------------------------------------
  // window.VoxelWorld.BiomeFurniture reads js/db/WorldGen/biomeFurniture.json:
  // per biome, the img/furniture folders that suit its outdoors, how thick each
  // lies and how big a piece is. The nearer land layers stand those sprites on
  // their ridge, sized by distance, and wear the layer's light and haze.
  const PROP_MAX_DIST = 20;
  const PROP_KINDS = ["trees", "hills", "dunes", "flat", "mesa", "houses", "ruins", "graves"];
  // Ground cover and fittings that lie flat or need a wall: nothing to see
  // standing on a horizon.
  const PROP_SKIP = ["Terrain", "Water", "Pavement", "Carpets", "Liquids", "Graffiti",
    "Bridges", "Roofs", "Windows", "Doors", "Stairs", "Pipes", "Misc"];
  const PROP_SPRITES_PER_FOLDER = 3;
  const PROP_MAX_PER_LAYER = 70;
  const PROP_LOAD_WAIT_MS = 4000;

  function furnitureFor(biomes) {
    const BF = window.VoxelWorld && window.VoxelWorld.BiomeFurniture;
    if (!BF || typeof BF.exterior !== "function") return [];
    for (const name of biomes) {
      if (!name) continue;
      let list = [];
      try { list = BF.exterior(String(name)) || []; } catch (e) { list = []; }
      list = list.filter((e) => e && e.sprites && e.sprites.length &&
        PROP_SKIP.indexOf(String(e.folder).split("/")[0]) < 0);
      if (list.length) return list;
    }
    return [];
  }

  function propSpritePath(folder, name) {
    const id = String(name).replace(/\.png$/i, "");
    const index = (window.Items && window.Items.FurnitureImageFolders) || null;
    const real = (index && index[id]) || folder;
    return "img/furniture/" + real + "/" + id + ".png"; // i18n-ignore: asset path
  }

  // Where every piece stands on one layer: which sprite, the x along the
  // doubled strip and how tall it is in pixels. Seeded, so a square always
  // shows the same scene whatever order the art arrives in.
  function planProps(list, layer, W, H, seed) {
    if (!list.length || PROP_KINDS.indexOf(layer.kind) < 0 || !(layer.dist <= PROP_MAX_DIST)) return [];
    const rand = mulberry32(seed);
    const pools = list.map((e) => {
      const picks = [];
      const n = Math.min(PROP_SPRITES_PER_FOLDER, e.sprites.length);
      const start = Math.floor(rand() * e.sprites.length);
      for (let i = 0; i < n; i++) picks.push(e.sprites[(start + i * 7) % e.sprites.length]);
      return { folder: e.folder, weight: Math.max(0, Number(e.density) || 0), size: e.size || 11, picks };
    }).filter((p) => p.weight > 0);
    const total = pools.reduce((a, p) => a + p.weight, 0);
    if (!total) return [];
    // Nearer layers carry fewer, bigger pieces; the far ones a fringe.
    const near = 6 / (layer.dist + 3);
    const count = Math.min(PROP_MAX_PER_LAYER, Math.round((W / H) * total * 5 * Math.min(1.4, 0.5 + near)));
    const out = [];
    for (let i = 0; i < count; i++) {
      let r = rand() * total, pool = pools[0];
      for (const p of pools) { r -= p.weight; if (r <= 0) { pool = p; break; } }
      const name = pool.picks[Math.floor(rand() * pool.picks.length)];
      const h = H * (pool.size / 30) * 0.18 * near * (0.75 + rand() * 0.5);
      if (h < 3) continue;
      out.push({ folder: pool.folder, name, path: propSpritePath(pool.folder, name), x: rand() * W, h });
    }
    // Small things in front of the tall: a wood never hides its own flowers.
    out.sort((a, b) => b.h - a.h);
    return out;
  }

  // Loads the art and stands it on the layer once every piece has answered.
  // A sprite that fails to load is simply left out.
  function populateLayer(entry, plan) {
    if (!plan.length || typeof ImageManager === "undefined" || !ImageManager.loadBitmapFromUrl) return;
    const bitmaps = new Map();
    plan.forEach((p) => { if (!bitmaps.has(p.path)) bitmaps.set(p.path, null); });
    let pending = bitmaps.size, stamped = false;
    const stamp = () => {
      if (stamped) return;
      stamped = true;
      const g = entry.canvas.getContext("2d");
      const W = entry.W, ys = entry.ridge;
      g.imageSmoothingEnabled = false;
      plan.forEach((p) => {
        const bmp = bitmaps.get(p.path);
        const src = bmp && bmp.isReady && bmp.isReady() && !bmp.isError() ? (bmp._image || bmp.canvas) : null;
        if (!src || !bmp.width || !bmp.height) return;
        const h = p.h, w = h * bmp.width / bmp.height;
        const y = ys[Math.max(0, Math.min(W, Math.round(p.x)))] + h * 0.06;
        wrapDraw(W, p.x, w, (xx) => g.drawImage(src, Math.round(xx - w / 2), Math.round(y - h), Math.round(w), Math.round(h)));
      });
      entry.y0 = Math.min(entry.y0, opaqueTop(entry.canvas, entry.H));
      entry.tintKey = "";
    };
    const done = () => { if (--pending <= 0) stamp(); };
    // The engine never calls a load listener for art that failed to load: the
    // pieces that did arrive are stood up after a short wait regardless.
    if (typeof setTimeout === "function") setTimeout(stamp, PROP_LOAD_WAIT_MS);
    bitmaps.forEach((v, path) => {
      let bmp = null;
      try { bmp = ImageManager.loadBitmapFromUrl(path); } catch (e) { bmp = null; }
      bitmaps.set(path, bmp);
      if (bmp && bmp.addLoadListener) bmp.addLoadListener(done);
      else done();
    });
  }

  function buildStars(rw, horizon, seed) {
    const c = makeCanvas(rw, horizon);
    const g = c.getContext("2d");
    const rand = mulberry32(seed);
    const n = Math.round(rw * horizon / 500);
    for (let i = 0; i < n; i++) {
      const b = 0.3 + rand() * 0.7;
      g.fillStyle = `rgba(255,255,${Math.round(220 + rand() * 35)},${b.toFixed(2)})`;
      g.fillRect(Math.floor(rand() * rw), Math.floor(rand() * horizon * (rand() < 0.7 ? 0.7 : 1)), 1, 1);
    }
    return c;
  }

  // The Kessler ring. Seen from a European latitude Earth's debris belt is an
  // arch over the southern sky, the way a ringed planet's rings stand over
  // its own fields: the dense low shell lower, the thin graveyard belt
  // higher. Each arch is half an ellipse sitting on the horizon.
  const RING_BANDS = [
    { rise: 0.52, half: 0.66, width: 0.016, specks: 3.2, bright: 1 },
    { rise: 0.6, half: 0.71, width: 0.006, specks: 1.1, bright: 0.55 },
    { rise: 0.74, half: 0.8, width: 0.003, specks: 0.5, bright: 0.35 },
  ];

  function ringPoint(band, rw, horizon, t) {
    const a = Math.PI * t;
    return [rw * (0.5 - band.half * Math.cos(a)), horizon - band.rise * horizon * Math.sin(a)];
  }

  function buildRing(rw, horizon, seed) {
    const c = makeCanvas(rw, horizon);
    const g = c.getContext("2d");
    const rand = mulberry32(seed);
    const glints = [];
    RING_BANDS.forEach((band) => {
      // The haze of dust the band is made of, then the pieces large enough to see.
      g.strokeStyle = `rgba(255,246,226,${(0.35 * band.bright).toFixed(2)})`;
      g.lineWidth = Math.max(1, band.width * horizon);
      g.beginPath();
      g.ellipse(rw * 0.5, horizon, band.half * rw, band.rise * horizon, 0, Math.PI, Math.PI * 2);
      g.stroke();
      const n = Math.round(rw * band.specks);
      const spread = Math.max(1, band.width * horizon * 1.6);
      for (let i = 0; i < n; i++) {
        const [x, y] = ringPoint(band, rw, horizon, rand());
        const off = (rand() + rand() - 1) * spread;
        const b = (0.3 + rand() * 0.7) * band.bright;
        g.fillStyle = `rgba(255,${Math.round(230 + rand() * 25)},${Math.round(200 + rand() * 55)},${b.toFixed(2)})`;
        g.fillRect(Math.floor(x), Math.floor(y + off), 1, 1);
        if (rand() < 0.03) glints.push([x, y + off, rand() * Math.PI * 2, 1 + rand() * 3]);
      }
    });
    return { canvas: c, glints };
  }

  // Faint pale arch by day, lit up by the sun it still sees after dark.
  function ringAlpha(st) {
    if (st.alien) return 0;
    return (0.16 + 0.74 * st.night) * (1 - st.cover * 0.92);
  }

  function drawRing(ctx, pan, st) {
    const a = ringAlpha(st);
    if (a <= 0.02 || !pan.ring) return;
    ctx.globalCompositeOperation = st.night > 0.4 ? "lighter" : "source-over";
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(pan.ring.canvas, 0, 0);
    if (st.night > 0.2) {
      // Tumbling pieces catch the sun and wink.
      const ga = st.night * (1 - st.cover);
      ctx.fillStyle = "#fff8e8";
      for (const [x, y, ph, sp] of pan.ring.glints) {
        const w = Math.sin(pan.time * sp + ph);
        if (w <= 0.6) continue;
        ctx.globalAlpha = ga * (w - 0.6) * 2.5;
        ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  // A bank of puffs, seamless across twice the screen: thicker and lower as
  // the cover closes, and a solid ceiling once it is overcast.
  function buildClouds(rw, rh, cover, seed, low) {
    const W = rw * 2, H = Math.round(rh * (low ? 0.62 : 0.45));
    const c = makeCanvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(seed);
    const count = Math.round((low ? 2 : 4) + cover * (low ? 40 : 28));
    for (let i = 0; i < count; i++) {
      const cx = rand() * W;
      const cy = (low ? 0.3 + rand() * 0.55 : 0.08 + rand() * 0.5) * H;
      const r = rh * (low ? 0.05 : 0.03) * (0.6 + rand() * 0.8) * (1 + cover * 0.8);
      const puffs = 4 + Math.floor(rand() * 5);
      const parts = [];
      for (let p = 0; p < puffs; p++) parts.push([(rand() - 0.5) * r * 3, (rand() - 0.5) * r * 0.6, r * (0.5 + rand() * 0.7)]);
      wrapDraw(W, cx, r * 3, (xx) => {
        for (const [ox, oy, pr] of parts) {
          const gr = g.createRadialGradient(xx + ox, cy + oy, 0, xx + ox, cy + oy, pr);
          gr.addColorStop(0, "rgba(255,255,255,0.9)");
          gr.addColorStop(0.6, "rgba(255,255,255,0.55)");
          gr.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = gr;
          g.fillRect(xx + ox - pr, cy + oy - pr, pr * 2, pr * 2);
        }
      });
    }
    if (cover > 0.72) {
      const k = clamp01((cover - 0.72) / 0.28);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, `rgba(255,255,255,${(0.95 * k).toFixed(2)})`);
      gr.addColorStop(low ? 0.8 : 0.6, `rgba(255,255,255,${(0.6 * k).toFixed(2)})`);
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    return { canvas: c, W, H, tinted: null, tintKey: "" };
  }

  // The Omega Tower as the intro movie draws it: one tapering spear of dark
  // stone run through with a gold grid, lit windows warm and blue, a sheath
  // of light round it, five rings standing off it in gold and blue, and the
  // celestial throne floating over its tip with a beacon burning in it. Drawn
  // with its foot at (cx, base), hPx tall to the tip of the shaft and wPx
  // across the foot; the throne needs spearHeadroom(hPx, wPx) more above that.
  // day and night are 0..1. The world map draws its landmark with this too.
  // One movie unit in pixels: read off the foot, so the throne keeps its
  // size against the shaft, never so small it is lost.
  function spearUnit(hPx, wPx) {
    return Math.max(0.6, Math.min(wPx * 0.5 / 26, hPx / 300));
  }

  function spearHeadroom(hPx, wPx) {
    return Math.ceil(125 * spearUnit(hPx, wPx)) + 2;
  }

  function drawOmegaSpear(g, cx, base, hPx, wPx, day, night) {
    // The movie's proportions: foot 26, tip 5, the throne 40 over a 900 shaft.
    const footHalf = wPx * 0.5, tipHalf = wPx * 0.5 * 5 / 26;
    const s = spearUnit(hPx, wPx);
    const rand = mulberry32(TOWER_SEED);
    const top = base - hPx;
    const halfAt = (y) => lerp(footHalf, tipHalf, (base - y) / hPx);
    const burn = Math.max(day * 0.55, 0.35 + night * 0.65);
    const hull = mix3([20, 17, 13], [58, 52, 44], day * 0.6);
    const gold = scale3([255, 200, 90], burn);
    // The sheath of light round it.
    const sheath = g.createLinearGradient(cx - footHalf * 1.6, 0, cx + footHalf * 1.6, 0);
    const sa = (0.08 + 0.14 * night).toFixed(3);
    sheath.addColorStop(0, "rgba(255,176,64,0)");
    sheath.addColorStop(0.5, `rgba(255,176,64,${sa})`);
    sheath.addColorStop(1, "rgba(255,176,64,0)");
    g.fillStyle = sheath;
    g.beginPath(); g.moveTo(cx - footHalf * 1.55, base); g.lineTo(cx - tipHalf * 1.8, top);
    g.lineTo(cx + tipHalf * 1.8, top); g.lineTo(cx + footHalf * 1.55, base); g.closePath(); g.fill();
    // The shaft.
    g.fillStyle = rgb(hull);
    g.beginPath(); g.moveTo(cx - footHalf, base); g.lineTo(cx - tipHalf, top);
    g.lineTo(cx + tipHalf, top); g.lineTo(cx + footHalf, base); g.closePath(); g.fill();
    // The gold grid: the octagon's edges running up it, and bands across.
    g.fillStyle = rgb(gold, 0.85);
    for (const f of [-1, -0.7, 0, 0.7, 1]) {
      g.beginPath(); g.moveTo(cx + f * footHalf, base); g.lineTo(cx + f * tipHalf, top);
      g.lineTo(cx + f * tipHalf + 1, top); g.lineTo(cx + f * footHalf + 1, base); g.closePath(); g.fill();
    }
    const bands = Math.max(6, Math.min(60, Math.round(hPx / 6)));
    for (let i = 1; i < bands; i++) {
      const y = base - hPx * (i / bands);
      const hw = halfAt(y);
      g.fillRect(Math.round(cx - hw), Math.round(y), Math.max(1, Math.round(hw * 2)), 1);
    }
    // Windows, warm and the cold blue of the rings.
    const wins = Math.min(600, Math.round(hPx * wPx / 90));
    const wa = (0.3 + night * 0.7).toFixed(2);
    for (let i = 0; i < wins; i++) {
      const y = base - rand() * hPx;
      const hw = halfAt(y) * 0.9;
      g.fillStyle = rand() > 0.5 ? `rgba(255,226,150,${wa})` : `rgba(160,220,255,${wa})`;
      g.fillRect(Math.round(cx + (rand() * 2 - 1) * hw), Math.round(y), 1, 1);
    }
    // The rings that hold the dimensions together.
    const ringTilt = 0.18;
    [0.18, 0.36, 0.55, 0.74, 0.9].forEach((k, i) => {
      const y = base - hPx * k;
      const rx = halfAt(y) + 7 * (footHalf / 26) + 1;
      g.strokeStyle = i % 2 ? `rgba(154,216,255,${(0.55 + 0.4 * night).toFixed(2)})` : `rgba(255,208,112,${(0.6 + 0.35 * night).toFixed(2)})`;
      g.lineWidth = Math.max(1, (0.9 + (1 - k) * 1.2) * footHalf / 26);
      g.beginPath(); g.ellipse(cx, y, rx, Math.max(1, rx * ringTilt), 0, 0, Math.PI * 2); g.stroke();
    });
    // The celestial throne over the tip, and its beacon.
    const ty = top - 40 * s;
    const beam = g.createRadialGradient(cx, ty - 20 * s, 0, cx, ty - 20 * s, Math.max(4, 60 * s));
    beam.addColorStop(0, `rgba(255,250,225,${(0.55 + 0.45 * night).toFixed(2)})`);
    beam.addColorStop(0.25, `rgba(255,210,90,${(0.25 + 0.3 * night).toFixed(2)})`);
    beam.addColorStop(1, "rgba(255,210,90,0)");
    g.fillStyle = beam;
    g.fillRect(cx - 60 * s, ty - 80 * s, 120 * s, 120 * s);
    g.fillStyle = rgb(scale3([255, 211, 106], 0.6 + 0.4 * burn));
    g.fillRect(cx - 9 * s, ty - 2 * s, 18 * s, Math.max(1, 4 * s));          // the seat
    g.fillRect(cx - 9 * s, ty - 26 * s, 18 * s, Math.max(1, 26 * s));        // the back
    for (const x of [-1, 0, 1]) {                                           // the spikes
      const sx = cx + x * 12 * s, sy = ty - (30 + (x ? 0 : 10)) * s;
      g.beginPath(); g.moveTo(sx - 2.4 * s, sy + 13 * s); g.lineTo(sx, sy - 13 * s);
      g.lineTo(sx + 2.4 * s, sy + 13 * s); g.closePath(); g.fill();
    }
    g.strokeStyle = `rgba(255,242,192,${(0.6 + 0.35 * night).toFixed(2)})`;
    g.lineWidth = Math.max(1, 1.2 * s);
    g.beginPath(); g.arc(cx, ty - 30 * s, Math.max(2, 16 * s), 0, Math.PI * 2); g.stroke();
  }

  // The tower on the horizon, painted once per size and light. Its head is
  // lost in the cloud when the sky closes.
  function paintTower(pan, hPx, wPx, light, night, cover, hazeCol, haze) {
    const key = [q(hPx, 0.5), q(wPx, 1), q(light[0], 20), q(light[1], 20), q(light[2], 20), q(night, 10),
      q(cover, 10), q(haze, 20), q(hazeCol[0] / 255, 12), q(hazeCol[1] / 255, 12), q(hazeCol[2] / 255, 12)].join(",");
    if (pan.towerKey === key && pan.towerCanvas) return pan.towerCanvas;
    const cw = Math.ceil(wPx * 1.9) + 6, ch = Math.ceil(hPx + spearHeadroom(hPx, wPx)) + 2;
    const c = makeCanvas(cw, ch);
    const g = c.getContext("2d");
    drawOmegaSpear(g, cw / 2, ch, hPx, wPx, clamp01((light[0] + light[1]) / 2), night);
    // Distance and cloud.
    g.globalCompositeOperation = "source-atop";
    if (haze > 0.01) { g.fillStyle = rgb(hazeCol, haze); g.fillRect(0, 0, cw, ch); }
    if (cover > 0.35) {
      const veil = g.createLinearGradient(0, 0, 0, ch * 0.6);
      const a = clamp01((cover - 0.35) / 0.65) * 0.95;
      veil.addColorStop(0, rgb(hazeCol, a));
      veil.addColorStop(1, rgb(hazeCol, 0));
      g.fillStyle = veil; g.fillRect(0, 0, cw, ch * 0.6);
    }
    g.globalCompositeOperation = "source-over";
    pan.towerCanvas = c; pan.towerKey = key;
    return c;
  }

  //---------------------------------------------------------------------------
  // What the sky is doing now
  //---------------------------------------------------------------------------
  const SKY = {
    nightZ: [6, 10, 30], nightH: [20, 30, 62],
    twiZ: [44, 56, 118], twiH: [236, 128, 84],
    dayZ: [48, 116, 214], dayH: [168, 208, 236],
  };

  function gameMinutes() {
    try { return ($gameVariables && $gameVariables.value(114)) || 0; } catch (e) { return 0; }
  }

  function skyHour() {
    const SR = window.SkyRenderer;
    try {
      if (SR && SR.skyHourFloat) { const h = SR.skyHourFloat(); if (isFinite(h)) return ((h % 24) + 24) % 24; }
    } catch (e) { /* the clock below */ }
    const w = window.$gameWeather;
    if (w && isFinite(w.currentHour)) return w.currentHour;
    return ((gameMinutes() + 600) / 60) % 24;
  }

  // The season's own sunrise and sunset where WeatherSystem keeps them.
  function sunTimes() {
    const w = window.$gameWeather;
    try {
      if (w && w.getActiveSeasons && w.getSeason) {
        const s = w.getActiveSeasons()[String(w.getSeason()).toLowerCase()];
        if (s && s.sunrise && s.sunset) {
          const rise = w._parseTime(s.sunrise), set = w._parseTime(s.sunset);
          if (isFinite(rise) && isFinite(set) && set > rise + 1) return { rise, set };
        }
      }
    } catch (e) { /* defaults */ }
    return { rise: 6, set: 19.5 };
  }

  function moonData() {
    const SR = window.SkyRenderer;
    try {
      if (SR && SR.calculateMoonPhase) {
        const m = SR.calculateMoonPhase(SR.getGameDate ? SR.getGameDate() : new Date());
        if (m && isFinite(m.phase)) return m;
      }
    } catch (e) { /* fallback */ }
    const phase = ((gameMinutes() / 1440) % 29.53) / 29.53;
    return { phase, illumination: 0.5 - 0.5 * Math.cos(2 * Math.PI * phase), isWaxing: phase < 0.5 };
  }

  // The cloud cover a fair day has: every game day and every family keeps
  // its own sky, from clear blue to broken.
  function fairCover(family) {
    const day = Math.floor((gameMinutes() + 600) / 1440);
    const r = mulberry32(hashStr(family + ":" + day))();
    return 0.04 + Math.pow(r, 1.6) * 0.55;
  }

  function weatherNow() {
    const w = window.$gameWeather;
    const type = w ? String(w.currentWeatherType || "none") : "none";
    const custom = w && w.customWeatherType ? String(w.customWeatherType).toLowerCase() : "";
    const temp = w && isFinite(w.currentTemperature) ? w.currentTemperature : 15;
    return { type, custom, temp };
  }

  function coverFor(family, type) {
    const fair = fairCover(family);
    if (type === "storm") return 0.97;
    if (type === "snow") return Math.max(fair, 0.86);
    if (type === "rain") return Math.max(fair, 0.8);
    return fair;
  }

  function skyState(pan, dt) {
    const fam = FAMILIES[pan.family];
    const hour = skyHour();
    // The season's sun times, the moon and where the tower stands barely move
    // from one frame to the next: they are read twice a second, not every frame.
    if (!pan.slow || pan.time - pan.slow.at >= SLOW_EVERY) {
      const sq = partyWorldSquare();
      pan.slow = {
        at: pan.time,
        sun: sunTimes(),
        moon: moonData(),
        placement: sq && !insideTower() ? towerPlacement(sq.x, sq.y, pan.family) : null,
      };
    }
    const { rise, set } = pan.slow.sun;
    let e, dayP = null, nightP = null;
    if (hour >= rise && hour <= set) {
      dayP = (hour - rise) / (set - rise);
      e = Math.sin(Math.PI * dayP);
    } else {
      nightP = ((((hour - set) % 24) + 24) % 24) / (24 - (set - rise));
      e = -Math.sin(Math.PI * nightP) * 0.6;
    }

    const wx = weatherNow();
    const target = coverFor(pan.family, wx.type);
    pan.cover = pan.cover == null ? target : lerp(pan.cover, target, clamp01(dt * 0.4));
    const cover = pan.cover;

    const moon = pan.slow.moon;
    const dayK = smooth(-0.12, 0.2, e);
    const warmK = smooth(-0.15, 0.02, e) * (1 - smooth(0.05, 0.35, e));
    const night = 1 - smooth(-0.2, 0.05, e);
    const nightLight = scale3([0.2, 0.23, 0.36], 0.75 + 0.25 * moon.illumination);
    let light = mix3(nightLight, [1, 1, 1], dayK);
    light = mix3(light, [1, 0.74, 0.52], warmK * 0.65);
    light = scale3(light, 1 - 0.38 * cover);
    if (pan.flash > 0) light = mix3(light, [1, 1, 1], pan.flash * 0.5);

    let zen, hor;
    if (e < 0) { const t = smooth(-0.3, 0, e); zen = mix3(SKY.nightZ, SKY.twiZ, t); hor = mix3(SKY.nightH, SKY.twiH, t); }
    else { const t = smooth(0, 0.3, e); zen = mix3(SKY.twiZ, SKY.dayZ, t); hor = mix3(SKY.twiH, SKY.dayH, t); }
    let grey = mix3([26, 28, 34], [160, 164, 172], dayK);
    if (wx.type === "storm") grey = scale3(grey, 0.62);
    zen = mix3(zen, grey, cover * 0.85);
    hor = mix3(hor, scale3(grey, 1.05), cover * 0.85);
    if (/dust|sand/.test(wx.custom)) hor = mix3(hor, [196, 164, 112], 0.35);
    if (/ash/.test(wx.custom)) hor = mix3(hor, [110, 100, 100], 0.4);

    // Off Earth the sky takes the world's own air and star.
    const SR = window.SkyRenderer;
    let alien = false;
    try { alien = !!(SR && SR.skyWorld && SR.skyWorld()); } catch (er) { alien = false; }
    if (alien && SR.alienSkyColor) {
      const toHex = (c) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
      const toArr = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
      try { zen = toArr(SR.alienSkyColor(toHex(zen))); hor = toArr(SR.alienSkyColor(toHex(hor))); } catch (er) { /* earth sky */ }
    }
    if (pan.flash > 0) { zen = mix3(zen, [220, 225, 255], pan.flash * 0.45); hor = mix3(hor, [220, 225, 255], pan.flash * 0.35); }

    let frost = 0;
    if (!fam.snowy) {
      if (wx.type === "snow") frost = 0.45;
      else if (wx.temp <= 0) frost = clamp01((2 - wx.temp) / 10) * 0.45;
    }
    let mist = fam.mist || 0;
    if (wx.type === "rain") mist += 0.15;
    else if (wx.type === "storm") mist += 0.25;
    else if (wx.type === "snow") mist += 0.2;
    if (/dust|sand|ash/.test(wx.custom)) mist += 0.25;
    const visibility = 110 / (1 + cover * 1.4 + mist * 2);

    return { hour, e, dayP, nightP, dayK, night, light, zen, hor, cover, moon, frost, mist, visibility,
      storm: wx.type === "storm", alien, aurora: /aurora/.test(wx.custom) };
  }

  //---------------------------------------------------------------------------
  // One panorama per map
  //---------------------------------------------------------------------------
  // The last panorama built. A menu round trip throws the spriteset away and
  // makes a new one on the same map: it gets this one back instead of
  // painting every layer, tree and window again.
  let lastPanorama = null;

  function preparePanorama(family, seed, biome) {
    if (!hasCanvas()) return null;
    try {
      const { rw, rh } = renderSize();
      const key = FAMILIES[family] ? family : DEFAULT_FAMILY;
      const lp = lastPanorama;
      if (lp && lp.family === key && lp.seed === seed && lp.rw === rw && lp.rh === rh && lp.biome === biome) {
        lp.frame = 0; lp.slow = null;
        return lp;
      }
      const fam = FAMILIES[key];
      const horizon = Math.round(rh * (fam.horizon || 0.6));
      const canvas = makeCanvas(rw, rh);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const layers = fam.layers.map((l, i) => (l.kind === "sea"
        ? { layer: l, sea: true }
        : buildLayer(l, rw, rh, (seed + i * 7919) >>> 0)));
      const furniture = furnitureFor([biome].concat(fam.biomes));
      layers.forEach((entry, i) => {
        if (entry.sea || !furniture.length) return;
        populateLayer(entry, planProps(furniture, entry.layer, entry.W, entry.H, (seed ^ (i * 0x9E37)) >>> 0));
      });
      lastPanorama = {
        family: key, seed, biome, rw, rh, canvas, ctx, layers, horizon,
        stars: buildStars(rw, horizon, seed ^ 0x5151),
        ring: buildRing(rw, horizon, 0x4E55),
        clouds: null, cloudKey: -1, time: 0, frame: 0, flash: 0, bolt: null, cover: null,
        towerCanvas: null, towerKey: "", slow: null, skyGrad: null, skyKey: "",
      };
      return lastPanorama;
    } catch (e) {
      console.warn("[BiomeBackground] panorama unavailable", e);
      return null;
    }
  }

  function ensureClouds(pan, cover) {
    const bucket = q(cover, 10);
    if (pan.cloudKey === bucket && pan.clouds) return;
    pan.clouds = [
      buildClouds(pan.rw, pan.rh, bucket / 10, pan.seed ^ 0xC10D, false),
      buildClouds(pan.rw, pan.rh, bucket / 10, pan.seed ^ 0xC10E, true),
    ];
    pan.cloudKey = bucket;
  }

  function cloudLight(st) {
    let c = mix3([0.26, 0.28, 0.36], [1, 1, 1], st.dayK);
    c = mix3(c, [1, 0.72, 0.64], (1 - smooth(0.05, 0.35, st.e)) * smooth(-0.15, 0.02, st.e) * 0.7);
    return st.storm ? scale3(c, 0.55) : scale3(c, 1 - st.cover * 0.3);
  }

  // A strip twice the screen wide, slid by `offset` and repeated: only the
  // slice that lands on screen is copied, from row `y0` of the strip down.
  function drawWrapped(ctx, img, W, rw, offset, y, y0) {
    const top = y0 || 0, h = img.height - top;
    if (h <= 0) return;
    const dy = Math.round(y) + top;
    for (let x = ((offset % W) + W) % W - W; x < rw; x += W) {
      const dx = Math.round(x);
      const s0 = Math.max(0, -dx), s1 = Math.min(W, rw - dx);
      if (s1 > s0) ctx.drawImage(img, s0, top, s1 - s0, h, dx + s0, dy, s1 - s0, h);
    }
  }

  // How far a thing `dist` squares away slides as the map scrolls by a pixel.
  const parallaxOf = (dist) => 1.2 / (1 + dist / 2);

  function drawSun(ctx, pan, st) {
    if (st.dayP == null || st.e < -0.1) return;
    const a = 1 - st.cover * 0.92;
    if (a <= 0.02) return;
    const r = pan.rh * 0.03;
    const x = pan.rw * (0.88 - 0.76 * st.dayP);
    const y = pan.horizon - st.e * pan.horizon * 0.85 + pan.rh * 0.02;
    const col = mix3([255, 250, 228], [255, 140, 70], 1 - smooth(0, 0.35, st.e));
    const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 5);
    glow.addColorStop(0, rgb(col, 0.5 * a));
    glow.addColorStop(1, rgb(col, 0));
    ctx.fillStyle = glow; ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    ctx.fillStyle = rgb(col, a);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function drawOneMoon(ctx, x, y, r, md, style, alpha) {
    const SR = window.SkyRenderer;
    ctx.globalAlpha = alpha;
    try {
      if (SR && SR.drawMoon) { SR.drawMoon(ctx, x, y, r, md, style || {}); ctx.globalAlpha = 1; return; }
    } catch (e) { /* plain disc below */ }
    ctx.fillStyle = (style && style.color) || "#e8e6dc";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The moon rides the night arc in its real phase; by day a bright one
  // lingers, faint, as it does. Friday brings Earth's other two.
  function drawMoons(ctx, pan, st) {
    if (st.nightP == null && st.moon.illumination < 0.3) return;
    const prog = st.nightP != null ? st.nightP : 1 - st.dayP;
    const em = Math.sin(Math.PI * prog);
    if (em <= 0.02) return;
    const vis = (st.nightP != null ? Math.max(0.35, st.night) : 0.25) * (1 - st.cover * 0.9);
    if (vis <= 0.02) return;
    const x = pan.rw * (0.88 - 0.76 * prog);
    const y = pan.horizon - em * pan.horizon * 0.8 + pan.rh * 0.03;
    const r = Math.max(3, pan.rh * 0.03);
    drawOneMoon(ctx, x, y, r, st.moon, null, vis);
    const SR = window.SkyRenderer;
    let friday = false;
    try { friday = !st.alien && !!(SR && SR.isFriday && SR.isFriday()); } catch (e) { friday = false; }
    if (friday) {
      drawOneMoon(ctx, x - r * 4.5, y + r * 2.2, r * 0.55, st.moon, { color: "#d8c8ff", seed: 2 }, vis);
      drawOneMoon(ctx, x + r * 3.8, y - r * 1.6, r * 0.4, st.moon, { color: "#ffd2c0", seed: 3 }, vis);
    }
  }

  function updateLightning(pan, st, dt) {
    pan.flash = Math.max(0, pan.flash - dt * 3);
    if (!st.storm) { pan.bolt = null; return; }
    if (pan.flash <= 0 && Math.random() < dt * 0.15) {
      pan.flash = 1;
      const pts = [];
      let x = pan.rw * (0.1 + Math.random() * 0.8), y = pan.rh * 0.05;
      const end = pan.horizon - pan.rh * 0.04;
      pts.push([x, y]);
      while (y < end) {
        x += (Math.random() - 0.5) * pan.rh * 0.06;
        y += pan.rh * (0.02 + Math.random() * 0.04);
        pts.push([x, Math.min(y, end)]);
      }
      pan.bolt = pts;
    }
    if (pan.flash <= 0.2) pan.bolt = null;
  }

  function drawBolt(ctx, pan) {
    if (!pan.bolt) return;
    ctx.strokeStyle = rgb([235, 240, 255], Math.min(1, pan.flash * 1.4));
    ctx.lineWidth = Math.max(1, pan.rh * 0.003);
    ctx.beginPath();
    pan.bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }

  function drawAurora(ctx, pan, st) {
    if (!st.aurora || st.night < 0.3) return;
    const a = st.night * (1 - st.cover) * 0.35;
    const depth = pan.rh * 0.08, step = 6;
    for (let band = 0; band < 3; band++) {
      const yOf = (x) => pan.rh * (0.12 + band * 0.06) + Math.sin(x * 0.02 + pan.time * 0.4 + band) * pan.rh * 0.03;
      // One ribbon per band: its wavy top edge out, the same edge lowered back.
      ctx.fillStyle = rgb(band === 1 ? [140, 120, 255] : [80, 255, 170], a);
      ctx.beginPath();
      ctx.moveTo(0, yOf(0));
      for (let x = step; x < pan.rw + step; x += step) ctx.lineTo(x, yOf(x));
      for (let x = Math.ceil(pan.rw / step) * step; x >= 0; x -= step) ctx.lineTo(x, yOf(x) + depth);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawSea(ctx, pan, st, scroll) {
    const top = pan.horizon, h = pan.rh - top;
    const deep = mix3(scale3(st.zen, 0.45), [10, 34, 54], 0.5);
    const gr = ctx.createLinearGradient(0, top, 0, pan.rh);
    gr.addColorStop(0, rgb(mix3(st.hor, scale3(st.zen, 0.8), 0.4)));
    gr.addColorStop(1, rgb(scale3(deep, Math.max(0.35, st.light[1]))));
    ctx.fillStyle = gr; ctx.fillRect(0, top, pan.rw, h);
    // Swell lines, and the glitter road under the sun or the moon.
    let gx = null, ga = 0;
    if (st.dayP != null && st.e > -0.05) { gx = pan.rw * (0.88 - 0.76 * st.dayP); ga = 0.55 * (1 - st.cover); }
    else if (st.nightP != null) { gx = pan.rw * (0.88 - 0.76 * st.nightP); ga = 0.35 * st.moon.illumination * (1 - st.cover); }
    const rand = mulberry32(pan.seed ^ 0x5EA);
    for (let i = 0; i < 70; i++) {
      const y = top + Math.pow(rand(), 1.6) * h;
      const len = pan.rw * (0.01 + rand() * 0.04) * (1 + (y - top) / h * 2);
      const x = ((rand() * pan.rw * 2 + pan.time * (6 + rand() * 6) - scroll) % (pan.rw * 2)) - pan.rw * 0.5;
      const flick = 0.5 + 0.5 * Math.sin(pan.time * (1 + rand() * 2) + i);
      ctx.fillStyle = rgb([255, 255, 255], ((0.06 + 0.06 * flick) * st.light[1]).toFixed(3));
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(len), 1);
      const sx = rand();
      if (gx != null && ga > 0.02) {
        const spread = pan.rw * 0.03 * (1 + (y - top) / h * 3);
        ctx.fillStyle = rgb(st.dayP != null ? [255, 236, 190] : [220, 228, 255], (ga * flick).toFixed(3));
        ctx.fillRect(Math.round(gx + (sx - 0.5) * spread * 2), Math.round(y), Math.round(len * 0.6), 1);
      }
    }
  }

  function drawPlume(ctx, pan, entry, ox, oy) {
    if (!entry.crater) return;
    const W = entry.W;
    const base = (((entry.crater.x + ox) % W) + W) % W;
    for (const cx of [base, base - W]) {
      if (cx < -pan.rw * 0.3 || cx > pan.rw * 1.3) continue;
      for (let i = 0; i < 14; i++) {
        const t = (pan.time * 0.05 + i / 14) % 1;
        const r = pan.rh * (0.02 + t * 0.07);
        const x = cx + t * pan.rh * 0.15 + Math.sin(i * 1.7 + pan.time * 0.2) * pan.rh * 0.01;
        const y = entry.crater.y + oy - t * pan.rh * 0.3;
        ctx.fillStyle = `rgba(70,64,64,${(0.5 * (1 - t)).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawTower(ctx, pan, st, p, scrollX) {
    if (!p || !p.visible) return;
    const hPx = Math.min(p.rise * pan.rh, pan.horizon * 1.4 + pan.rh * 0.1);
    const wPx = Math.max(2, p.width * pan.rh);
    const img = paintTower(pan, hPx, wPx, st.light, st.night, st.cover, st.hor, p.haze);
    const baseY = pan.horizon + pan.rh * 0.03 * (8 / (p.distance + 8));
    const x = p.screenX * pan.rw - img.width / 2 - scrollX * parallaxOf(p.distance);
    ctx.drawImage(img, Math.round(x), Math.round(baseY - img.height));
  }

  function partyWorldSquare() {
    const T = window.WorldMapTransfer;
    try {
      if (T && T.currentWorldCoords) {
        const c = T.currentWorldCoords();
        if (c && isFinite(c.x) && isFinite(c.y)) return c;
      }
    } catch (e) { /* no square */ }
    return null;
  }

  function renderPanorama(pan, dt) {
    pan.time += dt;
    const st = skyState(pan, dt);
    updateLightning(pan, st, dt);
    const ctx = pan.ctx;
    const { rw, rh, horizon } = pan;
    const sx = $gameMap ? $gameMap.displayX() * $gameMap.tileWidth() * RENDER_SCALE : 0;
    const syRaw = $gameMap
      ? ($gameMap.displayY() - Math.max(0, $gameMap.height() - $gameMap.screenTileY()) / 2) * $gameMap.tileHeight() * RENDER_SCALE
      : 0;
    const sy = Math.max(-rh * 0.5, Math.min(rh * 0.5, syRaw));

    // Sky: the gradient is only remade when its colours move.
    const zen = rgb(st.zen), hor = rgb(st.hor);
    const skyKey = zen + hor;
    if (pan.skyKey !== skyKey || !pan.skyGrad) {
      const grad = ctx.createLinearGradient(0, 0, 0, horizon);
      grad.addColorStop(0, zen);
      grad.addColorStop(1, hor);
      pan.skyGrad = grad; pan.skyKey = skyKey;
    }
    ctx.fillStyle = pan.skyGrad; ctx.fillRect(0, 0, rw, horizon);
    ctx.fillStyle = hor; ctx.fillRect(0, horizon, rw, rh - horizon);

    const starA = st.night * (1 - st.cover);
    if (starA > 0.02) { ctx.globalAlpha = starA; ctx.drawImage(pan.stars, 0, 0); ctx.globalAlpha = 1; }
    drawAurora(ctx, pan, st);
    drawSun(ctx, pan, st);
    drawMoons(ctx, pan, st);
    drawRing(ctx, pan, st);

    ensureClouds(pan, st.cover);
    const cl = cloudLight(st);
    const wind = 3 + st.cover * 9;
    const high = pan.clouds[0], low = pan.clouds[1];
    if (st.cover > 0.02) {
      ctx.globalAlpha = 0.85;
      drawWrapped(ctx, tintedCanvas(high, cl, st.hor, 0, 0), high.W, rw, pan.time * wind * 0.6 - sx * 0.02, 0);
      ctx.globalAlpha = 1;
    }
    drawBolt(ctx, pan);

    // Land, far to near, with the tower standing in at its own depth.
    const placement = pan.slow.placement;
    let mistDone = false;
    for (let i = 0; i <= pan.layers.length; i++) {
      if (placement && placement.slot === i) drawTower(ctx, pan, st, placement, sx);
      const entry = pan.layers[i];
      if (!entry) continue;
      const l = entry.layer;
      if (!mistDone && l.dist <= 6 && st.mist > 0.01) {
        const mg = ctx.createLinearGradient(0, horizon - rh * 0.12, 0, rh);
        mg.addColorStop(0, rgb(st.hor, 0));
        mg.addColorStop(0.35, rgb(st.hor, Math.min(0.7, st.mist * 0.8).toFixed(3)));
        mg.addColorStop(1, rgb(st.hor, Math.min(0.4, st.mist * 0.4).toFixed(3)));
        ctx.fillStyle = mg; ctx.fillRect(0, horizon - rh * 0.12, rw, rh);
        mistDone = true;
      }
      const f = parallaxOf(l.dist);
      if (entry.sea) { drawSea(ctx, pan, st, sx * f); continue; }
      const oy = -sy * f * 0.15;
      const haze = Math.min(0.85, (1 - Math.exp(-l.dist / st.visibility)) * 0.9);
      const img = tintedCanvas(entry, st.light, st.hor, haze, st.frost);
      drawWrapped(ctx, img, entry.W, rw, -sx * f, oy, entry.y0);
      if (entry.lights) {
        const a = l.kind === "volcano" ? 0.6 + 0.4 * st.night : st.night * (1 - haze * 0.5);
        if (a > 0.02) { ctx.globalAlpha = a; drawWrapped(ctx, entry.lights, entry.W, rw, -sx * f, oy, entry.y0); ctx.globalAlpha = 1; }
      }
      if (l.kind === "volcano") drawPlume(ctx, pan, entry, -sx * f, oy);
      // The low deck hangs over the far range, under everything nearer.
      if (i === 0 && st.cover > 0.3) {
        ctx.globalAlpha = clamp01((st.cover - 0.3) / 0.7) * 0.8;
        drawWrapped(ctx, tintedCanvas(low, cl, st.hor, 0, 0), low.W, rw, pan.time * wind - sx * 0.04, rh * 0.02);
        ctx.globalAlpha = 1;
      }
    }
  }

  window.BiomeBackground.coverFor = coverFor;
  window.BiomeBackground.planProps = planProps;
  window.BiomeBackground.furnitureFor = furnitureFor;
  window.BiomeBackground.ringAlpha = ringAlpha;

  //---------------------------------------------------------------------------
  // Spriteset hook: the background sits where the parallax would, under the map.
  //---------------------------------------------------------------------------
  function worldSeed(family) {
    const sq = partyWorldSquare();
    return hashStr(family + ":" + (sq ? sq.x + "," + sq.y : "0,0"));
  }

  const _createParallax = Spriteset_Map.prototype.createParallax;
  Spriteset_Map.prototype.createParallax = function () {
    _createParallax.call(this);
    const m = currentMode();
    this._biomeBgMode = m;
    this._biomeBgPanorama = null;
    if (!m || m.mode !== "structure") disposeView();
    if (!m) return;
    // The bitmap is the render size and the sprite is stretched over the
    // screen: the texture sent to the GPU every frame is a quarter of the
    // screen's pixels at the default render scale.
    const { rw, rh } = renderSize();
    const sprite = new Sprite();
    sprite.bitmap = new Bitmap(rw, rh);
    sprite.bitmap.smooth = false;
    sprite.bitmap.fillRect(0, 0, rw, rh, m.mode === "structure" ? "#050505" : "#6f8fb0");
    if (sprite.scale) sprite.scale.set(Graphics.width / rw, Graphics.height / rh);
    this._biomeBgSprite = sprite;
    this._biomeBgFrame = 0;
    this._baseSprite.addChild(sprite);
    if (m.mode === "panorama") this._biomeBgPanorama = preparePanorama(m.family, worldSeed(m.family), m.biome || null);
  };

  const _update = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function () {
    _update.call(this);
    this.updateBiomeBackground();
  };

  // The engine's teardown destroys the sprite but never the Bitmap it drew
  // into, so every menu round trip and every transfer on a background map left
  // one render-size canvas and its GPU texture behind. The panorama itself is
  // kept (lastPanorama): only this spriteset's own bitmap goes.
  const _destroy = Spriteset_Map.prototype.destroy;
  Spriteset_Map.prototype.destroy = function (options) {
    const sprite = this._biomeBgSprite;
    if (sprite) {
      const bmp = sprite.bitmap;
      try { if (bmp && typeof bmp.destroy === "function") bmp.destroy(); } catch (e) { /* already gone */ }
      this._biomeBgSprite = null;
      this._biomeBgPanorama = null;
      this._biomeBgMode = null;
    }
    if (_destroy) _destroy.call(this, options);
  };

  function blit(sprite, source) {
    const bmp = sprite.bitmap;
    const ctx = bmp && bmp.context;
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, bmp.width, bmp.height);
    if (bmp._baseTexture && bmp._baseTexture.update) bmp._baseTexture.update();
  }

  Spriteset_Map.prototype.updateBiomeBackground = function () {
    const sprite = this._biomeBgSprite;
    const m = this._biomeBgMode;
    if (!sprite || !sprite.bitmap || !m) return;
    if (m.mode === "structure") {
      // Rendered and read back from WebGL every other frame, like the panorama.
      this._biomeBgFrame = (this._biomeBgFrame || 0) + 1;
      if (this._biomeBgFrame > 1 && this._biomeBgFrame % FRAME_SKIP !== 1) return;
      if (!ensureView(Graphics.width, Graphics.height)) return;
      stepView(FRAME_SKIP / 60);
      renderView();
      blit(sprite, view.renderer.domElement);
      return;
    }
    const pan = this._biomeBgPanorama;
    if (!pan) return;
    pan.frame++;
    if (pan.frame > 1 && pan.frame % FRAME_SKIP !== 1) return;
    try {
      renderPanorama(pan, FRAME_SKIP / 60);
      blit(sprite, pan.canvas);
    } catch (e) {
      console.warn("[BiomeBackground] panorama failed", e);
      this._biomeBgPanorama = null;
    }
  };
})();
