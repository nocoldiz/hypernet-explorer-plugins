//=============================================================================
// RocketLaunchBodies.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Rocket Launch, the bodies: the Earth, the Moon, Jupiter, the galaxies and everything else the far scene draws. A part of RocketLaunchPlugin.js.
 * @author nocoldiz
 * @base GalaxySim/RocketLaunchPlugin
 * @orderAfter GalaxySim/RocketLaunchPlugin
 *
 * @help
 * THE PLANETS, AND EVERYTHING ELSE IN THE FAR SCENE.
 *
 * The Earth as GalaxySim records it with a painted stand-in under it, the Moon
 * on a render layer of its own so the phase it wears is tonight's, the regolith
 * at the lunar base, Jupiter and the assist flown round it, Titania's own moon,
 * the Dyson shell, the two galaxies and the star cloud. None of it is the
 * flight model: it is what the flight is looked at against.
 *
 * NOT A PLUGIN OF ITS OWN. RocketLaunchPlugin.js is one cinematic and this
 * file is a part of it, split out so the thing can be read: it attaches to
 * the launch stage that plugin has already built and does nothing by itself.
 * It must load AFTER RocketLaunchPlugin.js, and it has no parameters and no
 * plugin commands of its own.
 */

(() => {
  "use strict";

  const RL = window.RocketLaunch;
  const P = RL && RL.parts;
  if (!P) {
    console.error("RocketLaunchBodies.js: RocketLaunchPlugin.js has to load first.");
    return;
  }
  const K = P.K;
  const { DYSON_VIS_R, EARTH_VIS_R, HOME_SKY, MOON_BEARING, MOON_DIST_M, MOON_LAYER, MOON_R_M, MOON_VIS_R, SITES, clamp, clamp01, crossing, earthGone, hashOf, lerp, makeRng, onLayer, ramp, smooth, start, t, worldRecord, worldSystem } = K;

  // THE WORLD AT THE FAR END, AND THE TWO BEATS IT IS COME UP ON.
  //
  // Earth has its own body and so does the Moon; the two worlds out beyond
  // them had NEITHER, so a crossing to Zeta Reticuli or to Titania spent its
  // whole arrival looking at an empty sky and then simply had ground under it
  // on the next beat. The planet is come up on properly instead: a point on
  // the beat the round arrives in the system, a globe filling the window on
  // the beat that closes with it, and then the ground takes over.
  //
  // `from` and `to` are far-scene distances, and a beat that holds - Zeta's
  // refuelling stop, which happens at the star and not at the planet - simply
  // holds at one.
  // i18n-ignore-start  world ids and phase keys
  const WORLD_BALL = {
    zeta: [
      { key: "refuel", from: 15000, to: 15000 },
      { key: "transfer", from: 15000, to: 118 },
    ],
    titania: [
      { key: "emerge", from: 15000, to: 900 },
      { key: "approach", from: 900, to: 118 },
    ],
  };
  // i18n-ignore-end

  Object.assign(P.Stage.prototype, {

    // WHICH WORLD IS UNDERNEATH THE PAD.
    //
    // Every flight drew the EARTH down there, whichever rock it had actually
    // left: a launch off the embassy on Titania climbed away from a blue
    // planet with continents and city lights on it, in another galaxy. The pad
    // knows what it is standing on - every offworld site carries a body id -
    // and that is the one answer to the question.
    _homeWorld() {
      const site = this.geoSite || this.site;
      return (site && site.body) || "earth";   // i18n-ignore  world id
    },

    _buildFar() {
      // The Earth is GalaxySim's own body wherever that plugin is loaded: the
      // same NASA-mapped sphere the star map shows, so the planet the party
      // leaves is the planet the party can later fly back to.
      //
      // That map DECODES ASYNCHRONOUSLY, and an unloaded texture samples black
      // in WebGL - GalaxySim says so itself in _realPlanetTexture. A launch is
      // twenty seconds from the pad to orbit, so "the planet is a black ball
      // for the first few seconds" is most of the shot. A painted stand-in is
      // therefore ALWAYS built and shown until the real map has landed, and
      // the swap uses GalaxySim's own _solTexPending counter.
      const holder = new THREE.Group();
      this.earthPivot = holder;
      this.far.add(holder);

      const R3D = window.GalaxySim && window.GalaxySim.Renderer3D;
      this._r3d = R3D || null;
      const homeId = this._homeWorld();
      this._homeId = homeId;
      const homeSite = this.geoSite || this.site;
      // GalaxySim's real body is the single most expensive object in the
      // scene, and the painted stand-in below covers for it until it lands -
      // which is exactly what it is there for while the map decodes. So it is
      // queued rather than built, and the swap happens when it is ready.
      this._defer("earthBody", () => {
        if (!R3D || typeof R3D.buildPlanetGroup !== "function") return;
        let body = null;
        try {
          body = R3D.buildPlanetGroup(
            homeId === "earth" ? this._earthData() : (worldRecord(homeId) || this._earthData()), 1);
        } catch (e) { body = null; }
        if (!body) return;
        this.earthBody = body;
        body.scale.setScalar(EARTH_VIS_R);
        body.visible = false;
        this._brighten(body);
        holder.add(body);
      });

      const geo = this._geo(new THREE.SphereGeometry(EARTH_VIS_R, 64, 48));
      const mat = this._phong({
        map: homeId === "earth" ? this._paintEarth() : this._paintHome(homeSite),
        shininess: homeId === "earth" ? 14 : 6,
        specular: homeId === "earth" ? 0x223344 : 0x1a1d12,
      });
      this.earthFallback = new THREE.Mesh(geo, mat);
      this._brighten(this.earthFallback);
      holder.add(this.earthFallback);

      // THE CITY LIGHTS.
      //
      // A shell a hair above the surface, painted with the grid of everything
      // anybody ever wired up, drawn additively so it only ever adds glow. It
      // is not masked per pixel and does not need to be: a sphere only shows
      // the hemisphere facing the camera, and the camera is always over the
      // launch site, so when that site is in darkness the hemisphere on screen
      // IS the night side. The opacity is driven by the site's own local hour
      // and the lights simply fade up as the pad goes dark.
      // A megapixel of painted grid, and nothing above the pad can see it
      // until the vehicle is high enough for the planet to be a ball. Queued.
      // And nowhere but Earth: an embassy and a base are not a wired planet.
      if (homeId === "earth") this._defer("cityLights", () => {
        const lightGeo = this._geo(new THREE.SphereGeometry(EARTH_VIS_R * 1.002, 48, 32));
        this.cityLights = new THREE.Mesh(lightGeo, this._mat(new THREE.MeshBasicMaterial({
          map: this._paintCityLights(),
          transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })));
        holder.add(this.cityLights);
      });

      // The limb: a thin shell of atmosphere seen edge-on from outside, which
      // is the single thing that sells an orbital shot.
      const limbGeo = this._geo(new THREE.SphereGeometry(EARTH_VIS_R * 1.022, 48, 32));
      // The colour of the air over the world the pad is on, which on Titania is
      // the colour of what the ocean is giving off.
      this.limb = new THREE.Mesh(limbGeo, this._basic({
        color: homeId === "earth" ? 0x5aa8ff : (homeSite.sea || 0x5aa8ff),
        transparent: true, opacity: 0.0,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      holder.add(this.limb);

      // The site is a lit speck on the surface, so the player can watch the
      // pad they just left go over the horizon. Brighter in the dark, because
      // at night a launch site is the brightest thing for fifty kilometres.
      const markGeo = this._geo(new THREE.SphereGeometry(EARTH_VIS_R * 0.008, 6, 5));
      this.siteMark = new THREE.Mesh(markGeo, this._basic({ color: (this.geoSite || this.site).coil }));
      this.siteMark.position.set(0, EARTH_VIS_R * 1.004, 0);
      holder.add(this.siteMark);

      // Nothing above the pad is a star until the air has thinned out, which
      // is twenty seconds up.
      this._defer("stars", () => { this.far.add(this._buildStarfield()); });

      // THE MOON, AND IT IS IN EVERY FLIGHT.
      //
      // Not a lunar prop: the Moon is up there during the hop, during the
      // climb to the starship, during the way home and during a launch off a
      // chunk of rock with no planet left under it, because it is up there.
      // Built to scale off the Earth - sixty Earth radii out and a hair over a
      // quarter of one across - so the disc is the size the sky says it is.
      this._defer("moon", () => this._buildMoon());

      // THE BELT, SEEN FROM OUTSIDE IT.
      //
      // The near scene's belt is the shell the vehicle is inside, and it only
      // exists for the minute the vehicle is in it. This is the same junk seen
      // the way everybody else sees it: a flat band standing off the planet in
      // the far scene, there from the first frame of the flight, so the thing
      // that is going to strip the hull is visible long before it is met - and
      // still there behind the vehicle once it is through. With Earth gone
      // there is nothing in orbit to see, and nothing put it there.
      if (!earthGone()) {
        this._defer("farBelt", () => {
          const R3D2 = window.GalaxySim && window.GalaxySim.Renderer3D;
          if (!R3D2 || typeof R3D2.makeDebrisMesh !== "function") return;
          let built = null;
          try {
            built = R3D2.makeDebrisMesh({
              count: 1600,
              rMin: EARTH_VIS_R * 1.09, rMax: EARTH_VIS_R * 1.20,
              flat: 0.16, sizeMin: 0.12, sizeMax: 0.4, seed: 0x4e55,
            });
          } catch (e) { built = null; }
          const ring = built && built.mesh;
          if (!ring || !ring.isObject3D) return;
          if (ring.material) { ring.material.transparent = true; ring.material.opacity = 0.75; }
          this._disposables.push(built.geo, built.mat);
          this.farBelt = ring;
          holder.add(ring);
        });
      }

      // And after 21 December 2012, if the strike happened, there is no planet
      // down there to climb away from: the sphere, its lights and its limb all
      // come off and what is under the vehicle is the same stars that are over
      // it. The pad the flight left is a chunk of rock or a tower, and that is
      // built in the near scene like any other pad.
      if (earthGone()) {
        holder.visible = false;
        this.earthLost = true;
      }
    },

    // The Moon, and the pivot that carries it.
    //
    // WHERE IT IS HUNG IS A CHEAT, and it is a deliberate one. The far camera
    // swings wherever the player drags it, and a Moon nailed to one bearing in
    // a fixed sky spends most of every flight off the back of the frame - and
    // a Moon nobody can see is no use to a plugin whose third flight plan is
    // aimed at it. So the pivot is turned each frame to hold the Moon at a
    // constant BEARING off the camera rather than at a constant place in the
    // sky: a little over twenty degrees to one side, which keeps it in shot at
    // every yaw. Its height, its phase and its size are all honest; only the
    // compass bearing is not, and nothing in the flight model reads it.
    //
    // During a liminal crossing that bearing eases to ZERO, and the Moon comes
    // round to dead ahead as the round turns onto it. See _updateMoon.
    _buildMoon() {
      const pivot = new THREE.Group();
      this.moonPivot = pivot;
      this.far.add(pivot);

      const g = new THREE.Group();
      this.moonGroup = g;
      pivot.add(g);

      // GALAXYSIM'S OWN MOON, and the painted one only until it lands.
      //
      // The star map draws the Moon off the Sol record in Systems.json, with
      // the real surface map on it. That record is the one the party flies to
      // and the one the base stands on, so it is the one the launch shows:
      // the same body, the same map, the same size relative to the Earth
      // beside it. It decodes asynchronously like every other real texture,
      // so the painted sphere below is built first and stays until it does.
      this._defer("moonBody", () => {
        const R3D = this._r3d || (window.GalaxySim && window.GalaxySim.Renderer3D);
        if (!R3D || typeof R3D.buildPlanetGroup !== "function") return;
        let real = null;
        try { real = R3D.buildPlanetGroup(this._moonData(), 2); } catch (e) { real = null; }
        if (!real) return;
        real.scale.setScalar(MOON_VIS_R);
        real.visible = false;
        this._earthshine(real);
        this._toMoonLayer(real);
        g.add(real);
        this.moonReal = real;
      });

      const body = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(MOON_VIS_R, 40, 28)),
        this._phong({ map: this._paintMoon(), shininess: 2, specular: 0x111111 })
      );
      // A body this far from the one light in the scene is modelled by it and
      // nothing else, which is what gives the disc its phase. But a new Moon
      // is a hole in the sky, and the plugin needs it VISIBLE, so a little of
      // the surface map is hung on as emissive: the terminator still runs
      // across it and the dark limb is earthshine rather than nothing.
      if (body.material.emissive) {
        body.material.emissiveMap = body.material.map;
        body.material.emissive.setHex(0x3c4048);
        if ("emissiveIntensity" in body.material) body.material.emissiveIntensity = 0.5;
        body.material.needsUpdate = true;
      }
      g.add(body);
      this.moonBody = body;
      this.moonFallback = body;

      // The halo a full Moon wears in anything resembling an atmosphere. Off
      // by the time the sky is, which is where it stops being true.
      this.moonHalo = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(MOON_VIS_R * 1.45, 16, 12)),
        this._basic({
          color: 0xdfe8ff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
        })
      );
      g.add(this.moonHalo);
      // Everything the Moon is made of goes on the Moon's own render layer, so
      // the key that models it is the one aimed from the phase and not the one
      // that has been dragged round to keep the Earth readable.
      this._toMoonLayer(pivot);
    },

    // Put a whole subtree on the Moon's render layer.
    _toMoonLayer(root) {
      if (!root || typeof root.traverse !== "function") return;
      root.traverse((o) => onLayer(o, MOON_LAYER));
    },

    // A body lit by a key of its own does not need the full emissive rescue
    // the Earth gets: it needs earthshine, which is the little of the dark
    // limb that is genuinely there.
    _earthshine(root) {
      if (!root || typeof root.traverse !== "function") return;
      root.traverse((o) => {
        if (!o || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m || !m.map || m.emissiveMap || !m.emissive) return;
          m.emissiveMap = m.map;
          try { m.emissive.setHex(0x2a3038); } catch (e) { /* a stub colour */ }
          if ("emissiveIntensity" in m) m.emissiveIntensity = 0.22;
          m.needsUpdate = true;
        });
      });
    },

    // The Moon as GalaxySim records it: Earth's own moon out of the Sol
    // system, which is where its real surface map and its radius come from.
    _moonData() {
      const earth = this._earthData();
      const moon = earth && (earth.moons || []).find((m) => m.name === "Moon");   // i18n-ignore  body id
      if (moon) return moon;
      return { name: "Moon", type: "sub_mercurian", radius: 0.273, mass: 0.0123 };   // i18n-ignore  body id / type
    },

    // Titania's own moon: the mass a charge is dropped against on the way out
    // of Andromeda. The middle one of the three, which is the big one.
    _titaniaMoonData() {
      try {
        const dm = window.GalaxySim && window.GalaxySim.getDataManager && window.GalaxySim.getDataManager();
        const sys = dm && dm.getSystem("titania");   // i18n-ignore  system id
        const planet = sys && (sys.planets || [])[0];
        const moons = (planet && planet.moons) || [];
        return moons[1] || moons[0] || null;
      } catch (e) { return null; }
    },

    // How far round its cycle the Moon is, 0 new to 0.5 full, off the date the
    // game is actually on. SkyRenderer owns that answer for the whole project
    // (the battle sky and the voxel world both read it), so it is read from
    // there rather than worked out again here.
    _moonPhase() {
      try {
        const SR = window.SkyRenderer;
        if (SR && SR.calculateMoonPhase) {
          const d = SR.getGameDate ? SR.getGameDate() : new Date();
          const mp = SR.calculateMoonPhase(d);
          if (mp && isFinite(mp.phase)) return ((mp.phase % 1) + 1) % 1;
        }
      } catch (e) { /* no sky plugin: a gibbous moon, which reads as a moon */ }
      return 0.35;
    },

    _paintMoon() {
      return this._tex(512, 256, (ctx, w, h) => {
        ctx.fillStyle = "#9a958c";
        ctx.fillRect(0, 0, w, h);
        const r = makeRng(0x3f0a11);
        // The maria: a handful of big dark floods, which is the whole of what
        // anybody actually recognises about the Moon.
        for (let i = 0; i < 9; i++) {
          const cx = r() * w, cy = h * 0.22 + r() * h * 0.5;
          const rad = 16 + r() * 46;
          ctx.fillStyle = "rgba(78,76,80,0.85)";
          ctx.beginPath();
          ctx.ellipse(cx, cy, rad, rad * (0.55 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        // And the craters, which are everything else.
        for (let i = 0; i < 620; i++) {
          const cx = r() * w, cy = r() * h;
          const rad = 1 + r() * 9;
          ctx.fillStyle = "rgba(60,58,58," + (0.18 + r() * 0.3).toFixed(2) + ")";
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(226,222,214," + (0.12 + r() * 0.25).toFixed(2) + ")";
          ctx.beginPath();
          ctx.arc(cx - rad * 0.28, cy - rad * 0.28, rad * 0.72, 0, Math.PI * 2);
          ctx.fill();
        }
        // The rays off the young ones, which is what makes a full Moon read as
        // the Moon and not as a grey ball with pits in it.
        for (let i = 0; i < 5; i++) {
          const cx = r() * w, cy = r() * h;
          for (let k = 0; k < 16; k++) {
            const a = r() * Math.PI * 2;
            const len = 20 + r() * 70;
            ctx.strokeStyle = "rgba(232,228,220,0.16)";
            ctx.lineWidth = 1 + r() * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
            ctx.stroke();
          }
        }
      });
    },

    // Whatever GalaxySim hands back is lit for the star map, where the camera
    // carries its own light with it. Here the planet is the backdrop of a
    // launch and it has to READ at every hour of the day, so every surface map
    // is also hung on its material as an emissive map: the sun still models
    // the sphere and the terminator still runs across it, but the night side
    // is a dim photograph of the Earth instead of a black disc.
    _brighten(root) {
      if (!root || typeof root.traverse !== "function") return;
      root.traverse((o) => {
        if (!o || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m || !m.map || m.emissiveMap || !m.emissive) return;
          m.emissiveMap = m.map;
          try { m.emissive.setHex(0x9aa6b6); } catch (e) { /* a stub colour */ }
          if ("emissiveIntensity" in m) m.emissiveIntensity = 0.62;
          m.needsUpdate = true;
        });
      });
    },

    // Is GalaxySim's photograph of the Earth decoded yet? Until it is, the
    // painted stand-in stands in.
    _earthMapReady() {
      if (!this.earthBody) return false;
      const r = this._r3d;
      if (!r) return true;
      return !(r._solTexPending > 0);
    },

    // Have GalaxySim's real surface maps finished decoding? The Earth's own
    // readiness asks after the Earth's body as well, and there is not always
    // one - a launch off the Moon with the planet gone has no Earth to wait
    // for and its Moon must not wait for it either.
    _realMapsReady() {
      const r = this._r3d;
      if (!r) return true;
      return !(r._solTexPending > 0);
    },

    // The planet record GalaxySim's renderer wants. Named Earth so the real
    // surface map is the one that gets picked up.
    _earthData() {
      const sol = this._solSystem();
      const earth = sol && (sol.planets || []).find((p) => p.name === "Earth");   // i18n-ignore  body id
      if (earth) return earth;
      return { name: "Earth", type: "terrestrial", color: "#3b6fa8", radius: 1, atmosphere: true };   // i18n-ignore  body id / type
    },

    // The world this crossing is aimed at, as GalaxySim's own record, or null
    // where the flight is not aimed at one.
    _targetBody() {
      const id = this.profile && this.profile.world;
      return id ? worldRecord(id) : null;
    },

    _solSystem() {
      try {
        const dm = window.GalaxySim && window.GalaxySim.getDataManager && window.GalaxySim.getDataManager();
        return dm && dm.getSystem("Sol");   // i18n-ignore  system id
      } catch (e) { return null; }
    },

    // A WORLD THAT IS NOT EARTH, painted out of the pad's own palette - the
    // same four colours the ground, the sea and the towns of that site are
    // drawn with down below, so the ball in the sky and the rock under the
    // rail are visibly the same place.
    _paintHome(site) {
      const hex = (c) => "#" + ("000000" + ((c | 0) >>> 0).toString(16)).slice(-6);
      const sea = hex(site.sea != null ? site.sea : 0x2a4a6a);
      const seaLo = hex(site.seaLo != null ? site.seaLo : 0x16283a);
      const ground = hex(site.ground != null ? site.ground : 0x6a6a5a);
      const groundLo = hex(site.groundLo != null ? site.groundLo : 0x3a3a30);
      return this._tex(512, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, groundLo);
        g.addColorStop(0.2, sea);
        g.addColorStop(0.5, seaLo);
        g.addColorStop(0.8, sea);
        g.addColorStop(1, groundLo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        const r = makeRng(0x71a3);
        // Land, or whatever stands above the surface on this one.
        for (let i = 0; i < 40; i++) {
          const cx = r() * w, cy = h * 0.14 + r() * h * 0.72;
          const rad = 10 + r() * 46;
          ctx.fillStyle = r() > 0.5 ? ground : groundLo;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rad, rad * (0.35 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        // And the weather over it, thinner than Earth's and the colour of the
        // sea rather than of water vapour.
        for (let i = 0; i < 70; i++) {
          ctx.fillStyle = "rgba(255,255,255," + (0.04 + r() * 0.12).toFixed(2) + ")";
          ctx.beginPath();
          ctx.ellipse(r() * w, r() * h, 8 + r() * 34, 3 + r() * 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },

    _paintEarth() {
      return this._tex(512, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#dfe9f2");
        g.addColorStop(0.18, "#1d4d7a");
        g.addColorStop(0.5, "#14608e");
        g.addColorStop(0.84, "#1d4d7a");
        g.addColorStop(1, "#e4edf4");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // Continents as blobs. Nobody reads a coastline from orbit at this
        // resolution, but the eye wants land where the light is.
        const r = makeRng(0x3a71);
        for (let i = 0; i < 46; i++) {
          const cx = r() * w, cy = h * 0.2 + r() * h * 0.6;
          const rad = 8 + r() * 42;
          ctx.fillStyle = r() > 0.6 ? "#4c6b3a" : "#3c5a30";
          ctx.beginPath();
          ctx.ellipse(cx, cy, rad, rad * (0.4 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 120; i++) {
          ctx.fillStyle = "rgba(255,255,255," + (0.08 + r() * 0.2).toFixed(2) + ")";
          ctx.beginPath();
          ctx.ellipse(r() * w, r() * h, 6 + r() * 30, 3 + r() * 9, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },

    // Every settlement anybody ever wired up, from six hundred kilometres.
    // Not a map of Earth - the pivot spins and the geography under the camera
    // is not the geography under the pad - but the DISTRIBUTION is right, and
    // from orbit that is all the eye reads: dense temperate bands, strings
    // along the coasts and the rivers, nothing in the deep ocean or the ice.
    _paintCityLights() {
      return this._tex(1024, 512, (ctx, w, h) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        const r = makeRng(0x0c17a1);

        // Latitude weighting. v runs 0 at the north pole to 1 at the south, so
        // the two temperate bands are where almost everyone actually lives and
        // the poles and the deep tropics are nearly empty.
        const habit = (v) => {
          const lat = (0.5 - v) * 180;
          const north = Math.exp(-Math.pow((lat - 45) / 17, 2));
          const tropic = Math.exp(-Math.pow((lat - 10) / 20, 2)) * 0.55;
          const south = Math.exp(-Math.pow((lat + 30) / 16, 2)) * 0.4;
          return Math.min(1, north + tropic + south);
        };

        // Land. Big soft blobs of it, and lights only go on inside them: an
        // even scatter over the whole sphere reads as static, not as a planet.
        const land = [];
        for (let i = 0; i < 34; i++) {
          const v = r();
          if (r() > 0.25 + habit(v) * 0.75) continue;
          land.push({ x: r() * w, y: v * h, rx: 30 + r() * 150, ry: 20 + r() * 70 });
        }

        const inLand = (x, y) => {
          for (let i = 0; i < land.length; i++) {
            const L = land[i];
            // Wrap in longitude, because the texture meets itself.
            let dx = Math.abs(x - L.x);
            if (dx > w / 2) dx = w - dx;
            const k = Math.pow(dx / L.rx, 2) + Math.pow((y - L.y) / L.ry, 2);
            if (k < 1) return 1 - k;
          }
          return 0;
        };

        const dot = (x, y, rad, alpha, warm) => {
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          const c = warm ? "255,214,150" : "200,222,255";
          g.addColorStop(0, "rgba(" + c + "," + alpha.toFixed(3) + ")");
          g.addColorStop(0.45, "rgba(" + c + "," + (alpha * 0.35).toFixed(3) + ")");
          g.addColorStop(1, "rgba(" + c + ",0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        };

        // Conurbations: a few dozen genuinely large ones, each a bright core
        // with a halo of suburb.
        for (let i = 0; i < 260; i++) {
          const x = r() * w, y = r() * h;
          const depth = inLand(x, y);
          if (depth <= 0) continue;
          if (r() > habit(y / h) * depth + 0.06) continue;
          const big = r() > 0.88;
          dot(x, y, big ? 16 + r() * 18 : 4 + r() * 8, big ? 0.85 : 0.5, r() > 0.35);
        }

        // Ribbon development: the roads, the rivers and the coasts, which from
        // orbit are strings of light between the cities and are most of what
        // makes a night side look inhabited rather than speckled.
        for (let i = 0; i < 90; i++) {
          let x = r() * w, y = r() * h;
          if (inLand(x, y) <= 0) continue;
          const steps = 8 + Math.floor(r() * 26);
          let a = r() * Math.PI * 2;
          for (let k = 0; k < steps; k++) {
            a += (r() - 0.5) * 0.7;
            x += Math.cos(a) * (5 + r() * 9);
            y += Math.sin(a) * (3 + r() * 5);
            if (x < 0) x += w; else if (x > w) x -= w;
            if (y < 4 || y > h - 4) break;
            if (inLand(x, y) <= 0) break;
            dot(x, y, 2 + r() * 4, 0.22 + r() * 0.3, r() > 0.4);
          }
        }

        // And the single pixels: everywhere with a streetlamp and a name.
        for (let i = 0; i < 5200; i++) {
          const x = Math.floor(r() * w), y = Math.floor(r() * h);
          if (inLand(x, y) <= 0) continue;
          if (r() > habit(y / h)) continue;
          ctx.fillStyle = r() > 0.4 ? "rgba(255,226,170,0.85)" : "rgba(205,226,255,0.7)";
          ctx.fillRect(x, y, 1, 1);
        }

        // Gas flares: a handful of points brighter than any city, burning in
        // the middle of nothing. They are the give-away that this is a real
        // night side and not a star field pasted on a ball.
        for (let i = 0; i < 9; i++) {
          const x = r() * w, y = h * 0.3 + r() * h * 0.4;
          dot(x, y, 7 + r() * 6, 0.95, true);
        }
      });
    },

    _buildStarfield() {
      const n = 1400;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const r = this.rng;
      for (let i = 0; i < n; i++) {
        const u = r() * 2 - 1;
        const th = r() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        const R = 9000;
        pos[i * 3] = Math.cos(th) * s * R;
        pos[i * 3 + 1] = u * R;
        pos[i * 3 + 2] = Math.sin(th) * s * R;
        // A real colour spread: most stars are orange, the bright ones blue.
        const warm = r();
        const c = new THREE.Color().setHSL(warm > 0.82 ? 0.58 : 0.09 + warm * 0.05, 0.35, 0.55 + r() * 0.45);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const geo = this._geo(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      this.starMat = this._mat(new THREE.PointsMaterial({
        size: 26, sizeAttenuation: true, vertexColors: true,
        transparent: true, opacity: 0, depthWrite: false,
      }));
      this.stars = new THREE.Points(geo, this.starMat);
      return this.stars;
    },

    // THE SURFACE, and there is no gun on it.
    //
    // Every other arrival in this plugin is a second coilgun that catches the
    // round out of the air. The Moon has no air to catch anything out of and
    // nothing to build a receiving barrel with: what is down there is a
    // regolith plain, a scatter of boulders, a pad lit by a ring of lamps and
    // two pressure domes beside it. The round comes down onto it on its own
    // drive, which is the only landing in the plugin the vehicle makes itself.
    _buildMoonGround() {
      const g = new THREE.Group();
      this.moonGround = g;
      g.visible = false;
      this.near.add(g);

      const dust = this._phong({ map: this._paintRegolith(), shininess: 1, color: 0xbdb8ae });
      const plain = new THREE.Mesh(this._geo(new THREE.CircleGeometry(26000, 48)), dust);
      plain.rotation.x = -Math.PI / 2;
      g.add(plain);

      // Craters, as rims rather than holes: a ring of low cone is all the eye
      // reads from above, and it costs nothing.
      const rimGeo = this._geo(new THREE.TorusGeometry(1, 0.22, 4, 14));
      const rimMat = this._phong({ color: 0x8e8a82, shininess: 1, flatShading: true });
      for (let i = 0; i < 46; i++) {
        const a = this.rng() * Math.PI * 2;
        const d = 400 + this.rng() * 18000;
        const rad = 120 + this.rng() * 900;
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.set(Math.cos(a) * d, 2, Math.sin(a) * d);
        rim.rotation.x = Math.PI / 2;
        rim.scale.setScalar(rad);
        g.add(rim);
      }

      // Boulders, close in, so the skim has something to be low over.
      const rockGeo = this._geo(new THREE.IcosahedronGeometry(1, 0));
      const rockMat = this._phong({ color: 0x77736c, shininess: 2, flatShading: true });
      for (let i = 0; i < 90; i++) {
        const a = this.rng() * Math.PI * 2;
        const d = 260 + this.rng() * 5200;
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
        rock.scale.set(6 + this.rng() * 26, 4 + this.rng() * 18, 6 + this.rng() * 26);
        rock.rotation.set(this.rng(), this.rng(), this.rng());
        g.add(rock);
      }

      // THE BASE. Two domes, a mast and a lit landing ring, and the ring is
      // what the round is coming down inside.
      const base = new THREE.Group();
      base.position.set(0, 0, 0);
      g.add(base);

      const shell = this._phong({ color: 0xc6c9cf, shininess: 26, specular: 0x9aa2ad });
      [[-64, -40, 34], [58, -66, 24]].forEach(([x, z, rad]) => {
        const dome = new THREE.Mesh(
          this._geo(new THREE.SphereGeometry(rad, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
          shell
        );
        dome.position.set(x, 0, z);
        base.add(dome);
      });
      const tube = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(9, 9, 120, 10)), shell);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(-3, 12, -53);
      base.add(tube);
      const mast = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(1.6, 2.6, 160, 6)), shell);
      mast.position.set(96, 80, 30);
      base.add(mast);

      // The apron, and the ring of lamps round it.
      const apron = new THREE.Mesh(
        this._geo(new THREE.CircleGeometry(78, 28)),
        this._phong({ color: 0x4a4e57, shininess: 14, specular: 0x8d949e })
      );
      apron.rotation.x = -Math.PI / 2;
      apron.position.y = 0.6;
      base.add(apron);

      this.padLamps = [];
      const lampGeo = this._geo(new THREE.SphereGeometry(2.6, 6, 5));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const L = new THREE.Mesh(lampGeo, this._mat(new THREE.MeshBasicMaterial({ color: 0x0d2a18 })));
        L.position.set(Math.cos(a) * 84, 3, Math.sin(a) * 84);
        L.userData.order = i;
        base.add(L);
        this.padLamps.push(L);
      }
      this.padGlow = new THREE.PointLight(0x8affc4, 0, 700, 2);
      this.padGlow.position.set(0, 30, 0);
      base.add(this.padGlow);
    },

    _paintRegolith() {
      return this._tex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = "#a09b92";
        ctx.fillRect(0, 0, w, h);
        const r = makeRng(0x71ee);
        for (let i = 0; i < 2600; i++) {
          const g2 = r();
          ctx.fillStyle = g2 > 0.5
            ? "rgba(214,209,200," + (0.1 + r() * 0.3).toFixed(2) + ")"
            : "rgba(72,69,66," + (0.1 + r() * 0.35).toFixed(2) + ")";
          ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1);
        }
      }, 60, 60);
    },

    // The ground comes up under the round exactly the way a pad drops away
    // from one: the vehicle never moves, so this is the whole landing.
    _updateMoonGround(dt, ph) {
      if (!this.profile.lunar) return;
      const near = ph.key === "transit" || ph.key === "flyby" || ph.key === "skim" ||
        ph.key === "touchdown" || ph.key === "arrived";
      if (near && this.alt < 140000) this._ensure("moonGround");
      const g = this.moonGround;
      if (!g) return;
      const show = near && this.alt < 90000;
      g.visible = show;
      if (!show) return;
      // Eleven metres of vehicle, so the tail sits on the apron rather than
      // in it when the altimeter reads zero.
      g.position.y = -(this.alt + 11);
      // THE CIRCUIT, seen from inside it. The round never moves, so the ground
      // runs: it streams past on the heading this pass was rolled onto, turns
      // under the vehicle as the orbit carries it round, and only over the
      // last beat does the base slide up out of it and everything come to
      // rest. A retrograde pass streams the other way, which is the whole
      // point of rolling a direction.
      const o = this.orbit;
      const heading = o.entry + o.dir * this._orbitPhase(ph) * Math.PI * 2 * o.revs;
      g.rotation.y = heading;
      if (ph.key === "flyby") {
        // Running flat out, a full circuit's worth of ground per revolution.
        const span = 26000;
        const run = (this._orbitPhase(ph) * o.revs) % 1;
        g.position.x = Math.sin(heading) * span * (1 - run);
        g.position.z = -Math.cos(heading) * span * (1 - run);
      } else if (ph.key === "skim") {
        // The last of the run, closing on the base until it is underneath.
        const k = smooth(ph.progress);
        g.position.x = Math.sin(heading) * lerp(9000, 0, k);
        g.position.z = -Math.cos(heading) * lerp(9000, 0, k);
      } else {
        g.position.x = 0;
        g.position.z = 0;
      }

      if (this.padLamps) {
        const k = clamp01(1 - this.alt / 12000);
        this.padLamps.forEach((L) => {
          const on = ph.key === "arrived"
            ? true
            : ((Math.floor(this._time * (2 + k * 10)) + L.userData.order) % 8) < 3;
          L.material.color.setHex(on ? 0x8affc4 : 0x0d2a18);
        });
        if (this.padGlow) this.padGlow.intensity = 0.4 + k * 3.2;
      }
    },

    // JUPITER, and it is only ever seen on the way to Andromeda.
    //
    // The round is thrown at it, falls around the back of it and comes out the
    // far side with the planet's own orbital speed added to its own. That is
    // the only reason it is in the flight at all: the SB jump drive cannot be
    // lit from a standing start inside a gravity well, and the assist is what
    // buys the speed to be out of one.
    _buildJupiter() {
      const g = new THREE.Group();
      this.jupiter = g;
      g.visible = false;
      this.far.add(g);

      const R = EARTH_VIS_R * 11.2;   // it really is eleven Earths across
      const body = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(R, 48, 32)),
        this._phong({ map: this._paintJupiter(), shininess: 6, specular: 0x241c14 })
      );
      if (body.material.emissive) {
        body.material.emissiveMap = body.material.map;
        body.material.emissive.setHex(0x3a3028);
        if ("emissiveIntensity" in body.material) body.material.emissiveIntensity = 0.45;
        body.material.needsUpdate = true;
      }
      g.add(body);
      this.jupiterBody = body;

      // The ring. Faint, dark and edge-on to almost everything, which is why
      // nobody knew it was there until 1979.
      const ring = new THREE.Mesh(
        this._geo(new THREE.RingGeometry(R * 1.45, R * 1.82, 64, 1)),
        this._basic({
          color: 0x6a5c4a, transparent: true, opacity: 0.16,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      ring.rotation.x = Math.PI / 2 - 0.06;
      g.add(ring);
    },

    _paintJupiter() {
      return this._tex(512, 256, (ctx, w, h) => {
        // The belts and zones, which is the whole of what Jupiter looks like.
        const bands = [
          [0.00, 0.06, "#d9cdb6"], [0.06, 0.14, "#b8916a"],
          [0.14, 0.24, "#e6dcc6"], [0.24, 0.32, "#a8784f"],
          [0.32, 0.42, "#efe6d2"], [0.42, 0.50, "#8f5c3a"],
          [0.50, 0.58, "#e8dcc2"], [0.58, 0.66, "#b5794a"],
          [0.66, 0.76, "#e2d6bc"], [0.76, 0.86, "#a9805a"],
          [0.86, 1.00, "#cfc3ab"],
        ];
        bands.forEach(([a, b, c]) => {
          ctx.fillStyle = c;
          ctx.fillRect(0, a * h, w, (b - a) * h + 1);
        });
        // Turbulence along every boundary: a band edge on Jupiter is never a
        // line, it is a row of curls.
        const r = makeRng(0x5107e5);
        for (let i = 0; i < 900; i++) {
          const y = r() * h;
          ctx.fillStyle = r() > 0.5 ? "rgba(255,248,232,0.16)" : "rgba(90,58,36,0.18)";
          ctx.beginPath();
          ctx.ellipse(r() * w, y, 6 + r() * 34, 1 + r() * 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // The Spot. Two Earths across and three hundred years old.
        ctx.fillStyle = "#b4523a";
        ctx.beginPath();
        ctx.ellipse(w * 0.66, h * 0.62, 44, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(226,140,110,0.5)";
        ctx.beginPath();
        ctx.ellipse(w * 0.66, h * 0.62, 30, 13, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    },

    // THE SHELL. Both Zeta Reticuli suns carry one - Systems.json says
    // "dyson": "active" against each of them - and it is built by the same
    // routine the star map builds it with, off the same record, so the thing
    // in the window on the way in is the thing the star map shows.
    _buildDyson() {
      const sys = worldSystem(this.profile.world);
      if (!sys || !sys.dyson) return;
      const Cosmos = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
      if (!Cosmos || typeof Cosmos.buildDysonSphere !== "function") return;
      let built = null;
      try {
        built = Cosmos.buildDysonSphere({
          radius: DYSON_VIS_R,
          mode: sys.dyson === "abandoned" ? "abandoned" : "active",   // i18n-ignore  data value
          seed: hashOf(sys.name) & 0x7fffffff,
        });
      } catch (e) { built = null; }
      const group = built && (built.group || built);
      if (!group || !group.isObject3D) return;
      this.dyson = built;
      this.dysonGroup = group;
      group.visible = false;
      this.far.add(group);
    },

    // THE RED MOON. Titania's own, and the mass a charge is dropped against on
    // the way OUT of Andromeda - there being no Jupiter within two and a half
    // million light years of the place.
    _buildRedMoon() {
      const g = new THREE.Group();
      this.redMoon = g;
      g.visible = false;
      this.far.add(g);
      // Titania has three moons on the record and this is one of them, not an
      // anonymous red ball: built off GalaxySim's own entry where there is one
      // to build off, so the thing the charge is dropped against is the thing
      // the star map shows in orbit around the world the round has just left.
      const rec = this._titaniaMoonData();
      if (rec) {
        const R3D = this._r3d || (window.GalaxySim && window.GalaxySim.Renderer3D);
        let real = null;
        if (R3D && typeof R3D.buildPlanetGroup === "function") {
          try { real = R3D.buildPlanetGroup(rec, 4); } catch (e) { real = null; }
        }
        if (real) {
          real.scale.setScalar(MOON_VIS_R * 1.4);
          this._brighten(real);
          g.add(real);
          this.redMoonBody = real;
          return;
        }
      }
      const body = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(MOON_VIS_R * 1.4, 32, 24)),
        this._phong({ map: this._paintRedMoon(), shininess: 3, specular: 0x140406 })
      );
      if (body.material.emissive) {
        body.material.emissiveMap = body.material.map;
        body.material.emissive.setHex(0x3a0a0e);
        if ("emissiveIntensity" in body.material) body.material.emissiveIntensity = 0.55;
        body.material.needsUpdate = true;
      }
      g.add(body);
      this.redMoonBody = body;
    },

    _paintRedMoon() {
      return this._tex(256, 128, (ctx, w, h) => {
        const r = makeRng(0xc0113d);
        ctx.fillStyle = "#6e1016";
        ctx.fillRect(0, 0, w, h);
        // Deep, and not uniformly so: the colour of the inside of something.
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = r() > 0.5 ? "rgba(150,26,34,0.35)" : "rgba(52,4,10,0.45)";
          ctx.beginPath();
          ctx.ellipse(r() * w, r() * h, 10 + r() * 60, 6 + r() * 30, r() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 420; i++) {
          const rad = 1 + r() * 7;
          const x = r() * w, y = r() * h;
          ctx.fillStyle = "rgba(38,2,8,0.5)";
          ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(196,60,66,0.35)";
          ctx.beginPath(); ctx.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.6, 0, Math.PI * 2); ctx.fill();
        }
      });
    },

    // THE WORMHOLE, AND IT IS A SPHERE.
    //
    // Every film but one draws this as a funnel, or a whirlpool, or a ring of
    // fire with a flat disc in it - and a hole in three-dimensional space seen
    // from three-dimensional space is a BALL, with the far sky wrapped round
    // the front of it. That is the one thing Interstellar got right, and it is
    // what this is: a sphere carrying the destination sky, rimmed with the
    // light of everything behind the round being dragged round the edge of it.
    // The galaxy being left, and the one being arrived at.
    _buildGalaxies() {
      const g = new THREE.Group();
      this.galaxies = g;
      g.visible = false;
      this.far.add(g);

      const mk = (tex, size) => {
        const m = new THREE.Mesh(
          this._geo(new THREE.PlaneGeometry(size, size)),
          this._basic({
            map: tex, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        g.add(m);
        return m;
      };
      // Home, seen from outside it. Tilted well over, because the one thing
      // everybody knows about our galaxy is what it looks like flat on and
      // nobody has ever seen it that way.
      this.milkyWay = mk(this._paintGalaxy(0x9fb6ff, 0x3a5a9a), 2600);
      this.milkyWay.rotation.z = 0.5;
      // And the other one, which from home is the brighter of the two.
      this.andromeda = mk(this._paintGalaxy(0xffe6c0, 0x8a6a48), 2600);
      this.andromeda.rotation.z = -0.9;
      // Each plate keeps its own tilt, because which of the two is ahead and
      // which is astern depends on which way the crossing is being flown.
      this.milkyWay.userData.tilt = 0.5;
      this.andromeda.userData.tilt = -0.9;
    },

    _paintGalaxy(core, arm) {
      const hexOf = (c) => "#" + ("000000" + c.toString(16)).slice(-6);
      return this._tex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2;
        const r = makeRng(0x9a1c ^ core);
        // The arms: four of them, logarithmic, each a trail of stars getting
        // looser the further out it winds.
        for (let a = 0; a < 4; a++) {
          const off = (a / 4) * Math.PI * 2;
          for (let i = 0; i < 900; i++) {
            const t = i / 900;
            const th = off + t * 5.2;
            const rad = 8 + t * (w * 0.46);
            const jitter = (r() - 0.5) * rad * 0.22;
            const x = cx + Math.cos(th) * rad + jitter;
            const y = cy + Math.sin(th) * rad * 0.9 + (r() - 0.5) * rad * 0.16;
            const al = (1 - t) * 0.5 + 0.06;
            ctx.fillStyle = "rgba(" + ((arm >> 16) & 255) + "," + ((arm >> 8) & 255) +
              "," + (arm & 255) + "," + al.toFixed(3) + ")";
            ctx.fillRect(x, y, 1, 1);
          }
        }
        // The bulge, which is most of the light.
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.30);
        gr.addColorStop(0, hexOf(core));
        gr.addColorStop(0.18, "rgba(" + ((core >> 16) & 255) + "," + ((core >> 8) & 255) +
          "," + (core & 255) + ",0.55)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.30, 0, Math.PI * 2);
        ctx.fill();
        // The dust lane across the disc, which is what makes it read as a
        // galaxy rather than as a smudge.
        ctx.globalCompositeOperation = "destination-out";
        for (let i = 0; i < 260; i++) {
          const th = r() * Math.PI * 2;
          const rad = w * 0.12 + r() * w * 0.32;
          ctx.fillStyle = "rgba(0,0,0," + (0.1 + r() * 0.3).toFixed(2) + ")";
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(th) * rad, cy + Math.sin(th) * rad * 0.9,
            6 + r() * 20, 1 + r() * 3, th, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      });
    },

    // They trade places across the jump: home going away astern, the
    // destination growing ahead, crossing over inside the throat.
    _updateGalaxies(dt, ph) {
      const on = ph.key === "breach" || ph.key === "gods" ||
        ph.key === "crossing" || ph.key === "emerge";
      if (on) this._ensure("galaxies");
      if (!this.galaxies) return;
      this.galaxies.visible = on;
      if (!on) return;

      // How far through the crossing between them this beat is, 0 to 1.
      const k = ph.key === "breach" ? smooth(ph.progress) * 0.12
        : ph.key === "gods" ? 0.12                       // nothing moves in the gold
          : ph.key === "crossing" ? 0.12 + smooth(ph.progress) * 0.78
            : 0.9 + smooth(ph.progress) * 0.1;

      // WHICH OF THE TWO IS BEING LEFT. Nine of the seventeen jump plans are
      // flown OUT of Andromeda - home from Titania, or across from Titania to
      // Zeta - and on those it is Andromeda that falls away astern and the
      // Milky Way that comes up ahead. Drawn the one fixed way round, the trip
      // home showed the round leaving its own galaxy and arriving at the one
      // it had just left.
      const outbound = this.profile.fromWorld !== "titania";   // i18n-ignore  world id
      const astern = outbound ? this.milkyWay : this.andromeda;
      const ahead = outbound ? this.andromeda : this.milkyWay;

      // THE ONE BEING LEFT. It starts as the sky the round has been inside all
      // its life and ends as a smudge behind it.
      const mwD = lerp(1500, 9000, k);
      this._placeFar(astern, Math.PI + 0.22, 0.1, mwD);
      astern.quaternion.copy((this._farAim || this.farCamera).quaternion);
      astern.rotateZ(astern.userData.tilt || 0);
      astern.material.opacity = lerp(0.85, 0.12, k);
      astern.scale.setScalar(lerp(1.35, 0.45, k));

      // AND THE ONE BEING ARRIVED AT, AHEAD, WHICH IS THE WHOLE POINT OF THIS
      // CROSSING.
      //
      // The corridor to Zeta is a tunnel with walls rushing past. This is not
      // a tunnel and must not read as one: there is no corridor, there is a
      // galaxy coming at the round. So the plate does not merely brighten, it
      // CLOSES - from a smudge nine thousand out to something the camera is
      // nearly inside of by the time the throat lets go - and it goes on
      // closing through emerge, which is the beat it fills the frame on.
      // AND IT CLOSES FROM THE FIRST BEAT, not from the third. Hung off the
      // crossing progress alone it spent the breach and the whole of the gold -
      // fifteen seconds of the flight - as a smudge eight thousand units out at
      // a tenth opacity, which is a galaxy nobody can see coming. It has a
      // closing curve of its own: it is already a thing in the frame when the
      // round breaks through, it looms over the gold without moving in it, and
      // the crossing and the emergence are it arriving.
      const anD = ph.key === "breach" ? lerp(9000, 4200, smooth(ph.progress))
        : ph.key === "gods" ? 4200
          : ph.key === "crossing" ? lerp(4200, 700, smooth(ph.progress))
            : lerp(700, 260, smooth(ph.progress));
      this._placeFar(ahead, -0.10, 0.06, anD);
      ahead.quaternion.copy((this._farAim || this.farCamera).quaternion);
      ahead.rotateZ(ahead.userData.tilt || 0);
      ahead.material.opacity = ph.key === "breach" ? lerp(0.28, 0.55, smooth(ph.progress))
        : ph.key === "gods" ? 0.55
          : ph.key === "crossing" ? lerp(0.55, 0.95, smooth(ph.progress))
            : 0.95;
      // Its apparent size is the range closing, so the scale only has to keep
      // the plate from outrunning its own texture as it arrives.
      ahead.scale.setScalar(lerp(0.55, 1.1, k));
    },

    // How far away the Moon is, in metres, right now.
    //
    // Everywhere but a liminal crossing it is the real distance, because it is
    // the real Moon. During the crossing the altitude column IS the range to
    // the Moon - that is what the column means from the transit on - and the
    // spool beat is where the two swap over: the drive takes the three hundred
    // and eighty-four thousand kilometres out in three seconds, which is the
    // one thing in this plugin that is not a speed.
    _moonRange(ph) {
      if (!this.profile.lunar) return MOON_DIST_M;
      if (ph.key === "liminal") {
        // Geometric, not linear: the range falls by a constant factor per
        // second, so the disc grows at a constant rate rather than arriving
        // all at once at the end of the beat.
        const to = Math.max(1, this.alt);
        return MOON_DIST_M * Math.pow(to / MOON_DIST_M, smooth(ph.progress));
      }
      if (ph.key === "transit" || ph.key === "skim" ||
        ph.key === "touchdown" || ph.key === "arrived") return this.alt;
      // THE BRAKING PASS, which is a pass CLOSE BY THE MOON and was drawn at
      // the Moon's ordinary distance: a beat whose whole point is the round
      // going round the back of the Moon, flown with the Moon a speck off to
      // one side. The column on that beat is the height above the EARTH, so
      // the range to the Moon has to be its own curve: in from the full
      // distance, round at a couple of radii, and away again.
      if (ph.key === "moonbrake") {
        const close = MOON_R_M * 2.2;
        const away = MOON_DIST_M * 0.55;
        const u = ph.progress;
        // Geometric both ways, so the disc grows and shrinks at a steady rate
        // instead of arriving all at once.
        return u < 0.5
          ? MOON_DIST_M * Math.pow(close / MOON_DIST_M, smooth(u / 0.5))
          : close * Math.pow(away / close, smooth((u - 0.5) / 0.5));
      }
      return MOON_DIST_M;
    },

    _updateMoon(dt, ph) {
      const range = this._moonRange(ph);
      this.moonRangeM = range;
      // Queued like everything else, and asked for on the first frame: it is
      // one sphere and it is meant to be in the sky of every flight.
      this._ensure("moon");
      if (!this.moonPivot) return;

      // AND IT IS NOT IN EVERY SKY AFTER ALL.
      //
      // The Moon is in the sky of every flight that is anywhere near the
      // Earth, which is what that was written for - and a launch off the
      // embassy on Titania is not near the Earth. It had Luna hanging over an
      // acid ocean in Andromeda. So it is drawn while the round is at an Earth
      // pad, while the flight is aimed at the Moon, and on the beats of a way
      // home where the Earth is what is being closed on. Nowhere else.
      const homeId = this._homeId || this._homeWorld();
      const nearEarth = homeId === "earth" ||
        this.profile.world === "moon" ||                              // i18n-ignore  world id
        HOME_SKY.indexOf(ph.key) >= 0;
      this.moonPivot.visible = nearEarth;
      if (!nearEarth) return;

      const prof = this.profile;
      const lunar = !!prof.lunar;
      // Where the Moon sits relative to the way the camera is looking.
      //
      //   the default     a little over twenty degrees to one side and up,
      //                   which keeps it in shot at every yaw and every tilt
      //   aiming          eased to dead ahead as the round turns onto it
      //   the circuit     swung out and DOWN, because that is where a world
      //                   is when you are going round it
      let az = MOON_BEARING, el = 0.16;
      if (lunar) {
        const aiming = ph.key === "shroud" ? smooth(ph.progress)
          : (["liminal", "transit", "flyby", "skim", "touchdown", "arrived"].indexOf(ph.key) >= 0 ? 1 : 0);
        az = MOON_BEARING * (1 - aiming);
        el = 0.16 * (1 - aiming);
        if (ph.key === "moonbrake") {
          // Ahead on the way in, hard over at periapsis, behind on the way
          // out. That arc IS the braking pass, the same way the swing round
          // Jupiter is the assist.
          const u = smooth(ph.progress);
          az = lerp(-0.10, -1.45, u);
          el = lerp(0.05, -0.15, u);
        }
        if (ph.key === "flyby" || ph.key === "skim") {
          // IN ORBIT. The Moon is no longer a thing ahead: it is the thing
          // underneath, off to whichever side this pass was rolled onto, and
          // it slides as the round goes round. k is the fraction of the whole
          // circuit completed, so a three-revolution pass slides three times
          // as fast as a one.
          const into = ph.key === "flyby" ? smooth(clamp01(ph.progress / 0.3)) : 1;
          const o = this.orbit;
          az = lerp(0, o.side * 0.46, into);
          el = lerp(0, -o.drop, into);
          // A little weave off the circuit, so the round is visibly going
          // ROUND something rather than hanging beside it.
          const k = this._orbitPhase(ph);
          az += o.side * 0.10 * Math.sin(k * Math.PI * 2) * into;
          el += 0.07 * Math.cos(k * Math.PI * 2) * into;
        }
      }

      // The direction, in camera space, turned into a world one - off the
      // SHAKE-FREE aim, or the Moon swims about whenever the hull is hit.
      const aim = this._farAim || this.farCamera;
      const dir = this._moonDir || (this._moonDir = new THREE.Vector3());
      const ce = Math.cos(el);
      dir.set(Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce).applyQuaternion(aim.quaternion);

      // Sixty Earth radii out, and every metre of that closed by the drive.
      // Capped inside the starfield: a Moon further out than the stars is a
      // Moon with stars painted over it, because the star cloud writes no
      // depth of its own.
      const d = Math.min(MOON_VIS_R * (1 + range / MOON_R_M), 6000);
      this.moonGroup.position.copy(aim.position).addScaledVector(dir, d);
      this.moonPivot.rotation.set(0, 0, 0);

      // Under the belt the sky is still a sky and the Moon wears a halo in it;
      // above it there is nothing for a halo to be made of.
      if (this.moonHalo) {
        this.moonHalo.material.opacity = 0.28 * (1 - smooth(ramp(this.alt, 20000, 90000)));
      }
      // Close enough to be a place rather than a light, the disc is handed
      // over to the ground in the near scene and taken off the far one.
      this.moonGroup.visible = !(lunar && this.alt < 12000 &&
        (ph.key === "skim" || ph.key === "touchdown" || ph.key === "arrived"));

      // THE KEY, and it is the whole reason the Moon has a layer of its own.
      //
      // The phase IS the angle between the sun and the line the Moon is being
      // looked at along, so the key is swung round that line by it: a full
      // moon has the light coming from behind the camera, a new one has it
      // coming from behind the Moon, and a quarter has it square on from the
      // side. The terminator that falls out of that is tonight's.
      if (this.moonSun) {
        const a = this._moonPhase() * Math.PI * 2;
        const right = this._moonRight || (this._moonRight = new THREE.Vector3());
        right.set(1, 0, 0).applyQuaternion(aim.quaternion);
        const lit = this._moonLit || (this._moonLit = new THREE.Vector3());
        lit.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a));
        this.moonSun.target = this.moonGroup;
        this.moonSun.position.copy(this.moonGroup.position).addScaledVector(lit, 900);
        if (this.moonSun.updateMatrixWorld) this.moonSun.updateMatrixWorld(true);
      }

      // The real body is built on the queue and its map decodes after that,
      // so the painted stand-in is what is on screen until both have landed.
      this._ensure("moonBody");
      if (this.moonReal && this._realMapsReady()) {
        this.moonReal.visible = true;
        if (this.moonFallback) this.moonFallback.visible = false;
        this.moonBody = this.moonReal;
      }

      // The surface streams past as the circuit is flown, about the axis this
      // pass was rolled with: a polar orbit and an equatorial one over the same
      // world do not look remotely alike, and the axis is what makes that so.
      const o = this.orbit;
      this.moonBody.rotation.z = o.incl;
      this.moonBody.rotation.y = (lunar && (ph.key === "flyby" || ph.key === "skim"))
        ? o.entry + o.dir * this._orbitPhase(ph) * Math.PI * 2 * o.revs
        : this._time * 0.01;
    },

    // How far round the circuit the round is, 0 to 1. The skim is the last of
    // it: the descent is flown on the same track, not on a new one.
    _orbitPhase(ph) {
      if (ph.key === "flyby") return ph.progress * 0.86;
      if (ph.key === "skim") return 0.86 + ph.progress * 0.14;
      return 0;
    },

    // THE DESTINATION WORLD.
    //
    // GalaxySim's own body where that plugin can build one, so the planet in
    // the window on the way in is the planet the star map shows, and a painted
    // stand-in out of the arrival pad's palette otherwise - the same four
    // colours the ground and the sea down there are drawn with, so the ball
    // and the rock under the receiving rail are visibly the same place.
    _buildTargetWorld() {
      const id = this.profile && this.profile.world;
      const plan = id && WORLD_BALL[id];
      if (!plan) return;
      const g = new THREE.Group();
      this.targetWorld = g;
      g.visible = false;
      this.far.add(g);

      // As big as the world is, within reason: a super-Earth reads as one and
      // nothing is allowed to be so large the approach cannot fit it.
      const rec = this._targetBody();
      const R = EARTH_VIS_R * clamp(rec && rec.radius ? Number(rec.radius) : 1, 0.6, 2.2);
      this.targetWorldR = R;

      const R3D = window.GalaxySim && window.GalaxySim.Renderer3D;
      let body = null;
      if (rec && R3D && typeof R3D.buildPlanetGroup === "function") {
        try { body = R3D.buildPlanetGroup(rec, 1); } catch (e) { body = null; }
      }
      if (body) {
        body.scale.setScalar(R);
      } else {
        const site = this._siteOfWorld(id);
        body = new THREE.Mesh(
          this._geo(new THREE.SphereGeometry(R, 48, 32)),
          this._phong({ map: this._paintHome(site), shininess: 6, specular: 0x1a1d12 })
        );
      }
      this._brighten(body);
      g.add(body);
      this.targetWorldBody = body;

      // The limb, which is the one thing that says a ball in the dark has air
      // over it. The colour of whatever that air is made of down there.
      const site = this._siteOfWorld(id);
      const limb = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(R * 1.024, 40, 28)),
        this._basic({
          color: (site && site.sea) || 0x5aa8ff,
          transparent: true, opacity: 0.22,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      g.add(limb);
    },

    // The pad that stands on a given world, which is where its palette is.
    _siteOfWorld(id) {
      const ids = Object.keys(SITES);
      for (let i = 0; i < ids.length; i++) {
        if (SITES[ids[i]].body === id) return SITES[ids[i]];
      }
      return this.site;
    },

    _updateTargetWorld(dt, ph) {
      const id = this.profile && this.profile.world;
      const plan = id && WORLD_BALL[id];
      if (!plan) return;
      let leg = null;
      for (let i = 0; i < plan.length; i++) if (plan[i].key === ph.key) leg = plan[i];
      if (leg) this._ensure("targetWorld");
      const g = this.targetWorld;
      if (!g) return;
      g.visible = !!leg;
      if (!leg) return;
      const k = smooth(ph.progress);
      // Ahead and a little off centre, drifting across the frame as it grows
      // so the approach is a move and not a zoom. Never far enough off that
      // the thing the whole flight was for leaves the window.
      const d = lerp(leg.from, leg.to, k);
      this._placeFar(g, lerp(-0.26, -0.10, k), 0.06, d);
      if (this.targetWorldBody) this.targetWorldBody.rotation.y = this._time * 0.012;
    },

    // Put something in the far scene at a bearing off the way the camera is
    // looking, the same way the Moon is placed and for the same reason: the
    // far camera swings wherever the player drags it, and a thing the flight
    // is ABOUT may not be off the back of the frame.
    _placeFar(obj, az, el, dist) {
      const aim = this._farAim || this.farCamera;
      const dir = this._farDir || (this._farDir = new THREE.Vector3());
      const ce = Math.cos(el);
      dir.set(Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce)
        .applyQuaternion(aim.quaternion);
      obj.position.copy(aim.position).addScaledVector(dir, dist);
    },

  });
})();
