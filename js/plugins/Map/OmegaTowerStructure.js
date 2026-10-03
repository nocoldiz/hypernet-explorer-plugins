//=============================================================================
// OmegaTowerStructure.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Omega Tower structure: a live 3D parallax of BLAME! style megastructure, black steel with gold fittings, behind chosen maps.
 * @author Hypernet Explorer
 *
 * @param mapIds
 * @text Map ids
 * @desc Comma separated map ids that draw the structure behind their tiles.
 * @default 1399
 *
 * @param renderScale
 * @text Render scale
 * @desc Share of the screen resolution the structure is rasterised at (0.25 to 1).
 * @default 0.5
 *
 * @help
 * Draws a procedurally built megastructure (endless shafts, crossing bridges,
 * jagged rock walls, pipes and towers, every edge trimmed in gold) in three.js
 * behind the tiles of the maps it is asked for. The camera drifts with the map
 * scroll and sways slowly, a flock of pale birds crosses the void.
 *
 * A map is picked by id (the mapIds parameter) or by note tag:
 *   <Background: omegatowerstructure>
 *   <omegatowerstructure>
 *
 * The sprite sits where the parallax would, so the tilemap draws over it:
 * leave the map tiles transparent (or holes) where the structure should show.
 * Falls back to a flat black backdrop when WebGL / THREE.js is unavailable.
 *
 * window.OmegaTowerStructure
 *   isActiveMap(mapId, note)  whether a map draws the structure
 *   mapIds()                  the configured id list
 */
(() => {
  "use strict";

  const PLUGIN_NAME = "OmegaTowerStructure";
  const params = PluginManager.parameters(PLUGIN_NAME) || {};
  const MAP_IDS = String(params.mapIds || "1399")
    .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
  const RENDER_SCALE = Math.min(1, Math.max(0.25, parseFloat(params.renderScale) || 0.5));

  const NOTE_RE = /<(?:Background:\s*)?omegatowerstructure\s*>/i;
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

  function currentMapActive() {
    if (!$gameMap || !$dataMap) return false;
    return isActiveMap($gameMap.mapId(), $dataMap.note);
  }

  function hasThree() {
    return typeof THREE !== "undefined" && !!THREE.WebGLRenderer;
  }

  window.OmegaTowerStructure = {
    isActiveMap,
    mapIds: () => MAP_IDS.slice(),
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
      const rw = Math.max(64, Math.floor(w * RENDER_SCALE));
      const rh = Math.max(48, Math.floor(h * RENDER_SCALE));
      if (view.lastW !== rw || view.lastH !== rh) {
        view.renderer.setSize(rw, rh, false);
        view.camera.aspect = w / h;
        view.camera.updateProjectionMatrix();
        view.lastW = rw; view.lastH = rh;
      }
      return true;
    } catch (e) {
      console.warn("[OmegaTowerStructure] 3D view unavailable", e);
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

  //---------------------------------------------------------------------------
  // Spriteset hook: the structure sits where the parallax would, under the map.
  //---------------------------------------------------------------------------
  const _createParallax = Spriteset_Map.prototype.createParallax;
  Spriteset_Map.prototype.createParallax = function () {
    _createParallax.call(this);
    if (currentMapActive()) {
      this._omegaTowerSprite = new Sprite();
      this._omegaTowerSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
      this._omegaTowerSprite.bitmap.fillRect(0, 0, Graphics.width, Graphics.height, "#050505");
      this._baseSprite.addChild(this._omegaTowerSprite);
    } else {
      disposeView();
    }
  };

  const _update = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function () {
    _update.call(this);
    this.updateOmegaTowerStructure();
  };

  Spriteset_Map.prototype.updateOmegaTowerStructure = function () {
    const sprite = this._omegaTowerSprite;
    if (!sprite || !sprite.bitmap) return;
    const w = Graphics.width, h = Graphics.height;
    if (!ensureView(w, h)) return;
    stepView(1 / 60);
    renderView();
    const bmp = sprite.bitmap;
    const ctx = bmp.context;
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(view.renderer.domElement, 0, 0, w, h);
    if (bmp._baseTexture && bmp._baseTexture.update) bmp._baseTexture.update();
  };
})();
