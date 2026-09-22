//=============================================================================
// RocketLaunchSpaceports.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Rocket Launch, the spaceports: the coilgun towers, their ground, their towns and the apron a round is caught on. A part of RocketLaunchPlugin.js.
 * @author nocoldiz
 * @base GalaxySim/RocketLaunchPlugin
 * @orderAfter GalaxySim/RocketLaunchPlugin
 *
 * @help
 * THE GUNS, AND THE GROUND THEY STAND ON.
 *
 * Every installation the cinematic builds: the tower with its rings, banks and
 * gantry, the disc of ground under it, the sea beside it, the town behind it,
 * the floodlights, the vault hatch, the meridian and the scorched apron a round
 * is caught on - plus the two passes that ride the whole installation down
 * under a climbing vehicle and bring the receiving one up under a falling one.
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
    console.error("RocketLaunchSpaceports.js: RocketLaunchPlugin.js has to load first.");
    return;
  }
  const K = P.K;
  const { DOWNRANGE_VIS_M, HOP_ELEVATION, RAIL_LEN_M, RAIL_LOAD_Y, clamp01, loadYOf, makeRng, ramp, smooth } = K;

  Object.assign(P.Stage.prototype, {

    _buildPad(forSite, opts) {
      const s = forSite || this.site;
      const o = opts || {};
      const e = this.env;
      const g = new THREE.Group();
      if (!o.arrival) {
        this.pad = g;
        // A gun that fires DOWNWARD is the same gun turned over. Flipping the
        // whole installation once here is what lets the ring wave, the banks
        // and the gantry be driven by the launching code untouched.
        if (this.descent) g.rotation.x = Math.PI;
      }
      this.near.add(g);

      const lightK = e.night ? 0.22 : e.storm ? 0.55 : e.wet ? 0.7 : 1;
      const tint = (hex) => new THREE.Color(hex).multiplyScalar(lightK).getHex();

      // A VAULT's gun is not a tower: it is a shaft. The bore runs the nine
      // floors down under the hatch, so nothing about the gun changes - the
      // GROUND is raised instead, to the height of the muzzle, and everything
      // that belongs to the surface goes up with it. The round therefore starts
      // the count nine floors underground, in the dark, looking up at the lid.
      const railTop = 86 + RAIL_LEN_M * (s.railScale || 1) - 40;
      const groundY = s.shaft ? railTop : 0;

      // Ground: a big disc rather than a plane, so the edge of the world is a
      // horizon and not a visible seam when the camera swings.
      // A pad in orbit has no ground at all. A vault hanging in the dark after
      // the impact has a CHUNK: a few hundred metres of rock with the shaft
      // through the middle of it and a torn edge, and the void underneath.
      if (!s.noGround) {
        const radius = s.chunk ? 900 : 24000;
        const ground = new THREE.Mesh(
          this._geo(new THREE.CircleGeometry(radius, s.chunk ? 13 : 48)),
          this._phong({ map: this._paintGround(s), color: tint(0xffffff), shininess: 2 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = groundY - 0.5;
        g.add(ground);
        if (s.chunk) {
          // The underside: what a piece of a planet looks like from below when
          // the rest of the planet is not there any more.
          const keel = new THREE.Mesh(
            this._geo(new THREE.ConeGeometry(radius, radius * 1.5, 13)),
            this._phong({ color: tint(s.groundLo), shininess: 2, flatShading: true })
          );
          keel.rotation.x = Math.PI;
          keel.position.y = groundY - radius * 0.75 - 1;
          g.add(keel);
        }
      }

      // The sea, on one side only: both pads are coastal and the water is
      // half of what tells them apart from the air.
      const sea = s.noSea ? null : new THREE.Mesh(
        this._geo(new THREE.PlaneGeometry(48000, 24000, 1, 1)),
        this._phong({
          color: tint(s.sea), shininess: 90, specular: 0x6f9ec0,
          transparent: true, opacity: 0.93,
        })
      );
      if (sea) {
        sea.rotation.x = -Math.PI / 2;
        sea.position.set(0, groundY - 0.2, -13000);
        this.sea = sea;
        g.add(sea);
      }

      // BOTH ends of a hop are the same installation. The far pad is not a
      // landing strip with a cradle on it: it is the other coilgun, and the
      // round is caught by running it in reverse. So the same barrel is built
      // either way and only the approach lighting differs.
      const rail = this._buildRail(g, s, o.arrival);
      if (o.arrival) this.railB = rail; else this.railA = rail;
      // AND A BASE IS THE SAME BASE WHICHEVER WAY IT IS BEING USED. An
      // offworld gun is the one installation the party both lands on and later
      // launches from, so the scorched apron it was caught on has to be under
      // it when it leaves as well: without it the spaceport on Titania was one
      // place on arrival and a different one on departure. Only the approach
      // LAMPS belong to the receiving end, and they stay there.
      if (!o.arrival && (s.offworld || s.lunar)) this._buildApron(g, groundY);
      if (!s.noTown) this._buildTown(g, s, groundY);
      this._buildFloodlights(g, groundY);
      if (s.meridian) this._buildMeridian(g);
      if (s.lid) this._buildHatch(g, groundY, o.arrival);
      return g;
    },

    // The concrete the gun stands on and the scorch the rounds have left on
    // it. Part of the installation and not of the arrival, so both ends of an
    // offworld base get it and the place is recognisable either way.
    _buildApron(into, groundY) {
      const y = groundY || 0;
      const concrete = this._phong({ color: 0x7e7c74, shininess: 4 });
      const scorch = new THREE.Mesh(
        this._geo(new THREE.CircleGeometry(150, 24)),
        this._basic({ color: 0x14100e })
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.y = y + 0.4;
      into.add(scorch);
      const apron = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(168, 180, 8, 20)), concrete);
      apron.position.y = y - 4;
      into.add(apron);
    },

    // The approach lighting on a receiving gun: an apron of scorched concrete
    // and a ring of lamps round the MUZZLE, a kilometre up, which is the only
    // part of it the arriving round needs to be able to find.
    _buildApproach(g, top) {
      this._buildApron(g, 0);

      this.approachLights = [];
      const lampGeo = this._geo(new THREE.SphereGeometry(5.2, 7, 6));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const lamp = new THREE.Mesh(lampGeo, this._mat(new THREE.MeshBasicMaterial({ color: 0x0d2a18 })));
        lamp.position.set(Math.cos(a) * 52, top + 26, Math.sin(a) * 52);
        lamp.userData.order = i;
        g.add(lamp);
        this.approachLights.push(lamp);
      }
      this.approachGlow = new THREE.PointLight(0x4fe0a0, 0, 900, 2);
      this.approachGlow.position.set(0, top + 20, 0);
      g.add(this.approachGlow);
    },

    _buildArrivalPad() {
      this.padB = this._buildPad(this.destSite, { arrival: true });
      this.padB.visible = false;
    },

    _paintGround(forSite) {
      const s = forSite || this.site;
      const base = "#" + s.ground.toString(16).padStart(6, "0");
      const lo = "#" + s.groundLo.toString(16).padStart(6, "0");
      return this._tex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        const r = makeRng(0x4413);
        for (let i = 0; i < 900; i++) {
          ctx.fillStyle = r() > 0.5 ? lo : "rgba(255,255,255,0.05)";
          ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 3), 1);
        }
        // Service roads out to the rail, in the pale of poured concrete.
        ctx.strokeStyle = "rgba(210,205,190,0.5)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(w / 2, h / 2);
          const a = r() * Math.PI * 2;
          ctx.lineTo(w / 2 + Math.cos(a) * w, h / 2 + Math.sin(a) * h);
          ctx.stroke();
        }
      }, 40, 40);
    },

    // The rail: the whole point of the pad, and the reason the vehicle is a
    // bullet rather than a rocket.
    //
    // SCALE IS THE POINT. The bore is eleven times the width of the thing it
    // throws and the tower is fifty times its length; the vehicle sits in the
    // breech of it like a round in a barrel, which is exactly what it is. All
    // the mass the flight needs is in the ground installation - the capacitor
    // halls, the buttresses, the cable trunks - and none of it leaves. That is
    // why the thing that does leave can be solid armour.
    //
    // The rings charge bottom to top during the count and then fire in a wave
    // that TRACKS THE BULLET: each one lights as the round reaches it and
    // dies behind it, so the launch is legible as a single pulse running the
    // length of the tower.
    // The angle this particular barrel is laid at. A hop is a ballistic throw
    // and has to leave at an elevation; everything else in the plugin is fired
    // straight up or straight down. The RECEIVING gun at the far end of a hop
    // is laid over the other way, so its muzzle is looking back up the track
    // at the round coming in rather than at the sky above it.
    _railTilt(arrival) {
      if (!this.profile.downrange) return 0;
      return arrival ? -HOP_ELEVATION : HOP_ELEVATION;
    },

    _buildRail(into, forSite, arrival) {
      const s = forSite || this.site;
      const g = new THREE.Group();
      (into || this.pad).add(g);
      // Trunnioned at the foot. The bore axis is the group's own +Y, so one
      // rotation here lays the entire installation over and every ring, bank,
      // yoke and gantry below goes on being written straight up the barrel.
      // The ground, the sea and the town are NOT in this group and stay level,
      // which is what makes the gun read as a gun on a mounting rather than as
      // a tipped-over world.
      g.rotation.x = this._railTilt(arrival);
      this._railGroups = this._railGroups || {};
      this._railGroups[arrival ? "b" : "a"] = g;

      // How much gun there is. The Omega Tower is the gun - all of it, bored
      // and wound end to end - and the starship's rail is a stub by comparison.
      const H = RAIL_LEN_M * (s.railScale || 1);
      // A gun bolted to a hull is built to the hull's scale, not to the
      // ground's: everything structural comes down by the same factor, and
      // the things that only make sense poured into a continent - the
      // foundation, the capacitor halls, the service gantry, the obstruction
      // strobes - are not built at all.
      const F = s.mountScale || 1;
      const mounted = !!s.mounted;
      const BORE = 34 * F;      // ring inner radius: the bullet is 3
      const LEG = 46 * F;       // corner legs, well outboard of the bore
      const mastMat = this._phong({ color: s.rail, shininess: 20, specular: 0x555a63 });
      const concrete = this._phong({ color: 0x8d8b82, shininess: 4 });
      const darkMat = this._phong({ color: 0x33373d, shininess: 14, specular: 0x555a63 });

      // --- the foundation: a poured block a hundred and thirty metres across
      if (!mounted) {
      const base = new THREE.Mesh(
        this._geo(new THREE.CylinderGeometry(112, 148, 92, 16)),
        concrete
      );
      base.position.y = 46;
      g.add(base);
      // Buttresses, because something has to take the recoil of the shot.
      const butGeo = this._geo(new THREE.BoxGeometry(30, 108, 96));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = new THREE.Mesh(butGeo, concrete);
        b.position.set(Math.cos(a) * 118, 54, Math.sin(a) * 118);
        b.rotation.y = -a;
        g.add(b);
      }
      }

      // --- the capacitor halls. Twelve of them, ringing the foot, and they
      // are where the energy for the shot has been accumulating all night.
      const capacitors = [];
      const capGeo = this._geo(new THREE.CylinderGeometry(19, 22, 76, 12));
      const trunkGeo = this._geo(new THREE.CylinderGeometry(3.4, 3.4, 240, 6));
      for (let i = 0; i < (mounted ? 0 : 12); i++) {
        const a = (i / 12) * Math.PI * 2 + 0.26;
        const d = 210;
        const c = new THREE.Mesh(capGeo, darkMat);
        c.position.set(Math.cos(a) * d, 38, Math.sin(a) * d);
        g.add(c);
        // The band round the top lights as the bank comes up to charge.
        const band = new THREE.Mesh(
          this._geo(new THREE.TorusGeometry(20, 2.6, 6, 14)),
          this._mat(new THREE.MeshPhongMaterial({
            color: 0x1b2028, emissive: new THREE.Color(s.coil), emissiveIntensity: 0, shininess: 50,
          }))
        );
        band.rotation.x = Math.PI / 2;
        band.position.set(c.position.x, 70, c.position.z);
        g.add(band);
        capacitors.push(band);
        // The trunk carrying it up to the mast, slung at an angle.
        const trunk = new THREE.Mesh(trunkGeo, darkMat);
        trunk.position.set(Math.cos(a) * d * 0.62, 150, Math.sin(a) * d * 0.62);
        trunk.rotation.z = Math.cos(a) * 0.5;
        trunk.rotation.x = -Math.sin(a) * 0.5;
        g.add(trunk);
      }

      // --- the tower. Four legs of real section, X-braced the whole way up.
      const foot = 80 * F;
      const legGeo = this._geo(new THREE.CylinderGeometry(6.5 * F, 9.5 * F, H, 8));
      [[-LEG, -LEG], [LEG, -LEG], [-LEG, LEG], [LEG, LEG]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, mastMat);
        leg.position.set(x, H / 2 + foot, z);
        g.add(leg);
      });
      const bayH = 52 * F;
      const braceGeo = this._geo(new THREE.BoxGeometry(LEG * 2, 3.2 * F, 3.2 * F));
      const diagGeo = this._geo(new THREE.BoxGeometry(Math.hypot(LEG * 2, bayH), 2.4 * F, 2.4 * F));
      for (let y = foot; y < H + foot; y += bayH) {
        for (let face = 0; face < 4; face++) {
          const a = (face / 4) * Math.PI * 2;
          const ring = new THREE.Mesh(braceGeo, mastMat);
          ring.position.set(Math.cos(a) * LEG, y, Math.sin(a) * LEG);
          ring.rotation.y = -a + Math.PI / 2;
          g.add(ring);
          const dia = new THREE.Mesh(diagGeo, mastMat);
          dia.position.set(Math.cos(a) * LEG, y + bayH / 2, Math.sin(a) * LEG);
          dia.rotation.y = -a + Math.PI / 2;
          dia.rotation.z = (Math.round(y / bayH) % 2 ? 1 : -1) * Math.atan2(bayH, LEG * 2);
          g.add(dia);
        }
      }

      // --- the rings. Fifty of them up the bore, each a slab of laminated
      // iron the size of a house with the coil wound inside it.
      const coilRings = [];
      const RINGS = 50;
      const ringGeo = this._geo(new THREE.TorusGeometry(BORE, 7.2 * F, 8, 22));
      const yokeGeo = this._geo(new THREE.BoxGeometry(BORE * 2.5, 5 * F, 5 * F));
      for (let i = 0; i < RINGS; i++) {
        const y = 86 * F + (i / (RINGS - 1)) * (H - 40 * F);
        const mat = this._mat(new THREE.MeshPhongMaterial({
          color: 0x2a3240, emissive: new THREE.Color(s.coil), emissiveIntensity: 0,
          shininess: 60, specular: 0x8899aa,
        }));
        const ring = new THREE.Mesh(ringGeo, mat);
        ring.position.y = y;
        ring.rotation.x = Math.PI / 2;
        // Height in metres, which is how the firing wave finds it.
        ring.userData.y = y;
        ring.userData.k = i / (RINGS - 1);
        g.add(ring);
        coilRings.push(ring);
        // Every fourth ring is tied back to the legs.
        if (i % 4 === 0) {
          for (let f = 0; f < 2; f++) {
            const yoke = new THREE.Mesh(yokeGeo, mastMat);
            yoke.position.y = y;
            yoke.rotation.y = f * Math.PI / 2;
            g.add(yoke);
          }
        }
      }
      // --- the breech. A block of steel the bullet is loaded into, sunk into
      // the foundation, with the barrel throat opening out of the top of it.
      const breech = new THREE.Mesh(
        this._geo(new THREE.CylinderGeometry(52 * F, 68 * F, 96 * F, 14)),
        darkMat
      );
      breech.position.y = 44 * F;
      g.add(breech);
      const throat = new THREE.Mesh(
        this._geo(new THREE.CylinderGeometry(BORE * 0.55, BORE * 0.9, 60 * F, 16, 1, true)),
        this._mat(new THREE.MeshPhongMaterial({ color: 0x14171c, side: THREE.DoubleSide, shininess: 30 }))
      );
      throat.position.y = 62 * F;
      g.add(throat);

      // Obstruction strobes, up the whole tower. On at night and in the murk,
      // and they are what gives the thing its height at a glance.
      const strobes = [];
      const strobeGeo = this._geo(new THREE.SphereGeometry(3.4, 6, 5));
      for (let i = 0; i < (mounted ? 0 : 9); i++) {
        const y = 140 + i * ((H - 140) / 8);
        for (let f = 0; f < 2; f++) {
          const m = new THREE.Mesh(strobeGeo, this._mat(new THREE.MeshBasicMaterial({ color: 0x3a0806 })));
          m.position.set(f ? LEG : -LEG, y, f ? LEG : -LEG);
          m.userData.phase = i * 0.24 + f * 0.5;
          g.add(m);
          strobes.push(m);
        }
      }

      // The service gantry that swings clear at T-0, scaled to the tower it
      // hangs off rather than to the round it services.
      const gantryMat = this._phong({ color: 0x8a5a2e, shininess: 8 });
      const gantry = new THREE.Group();
      if (!mounted) {
        const tower = new THREE.Mesh(this._geo(new THREE.BoxGeometry(26, 460, 26)), gantryMat);
        tower.position.set(128, 310, 0);
        gantry.add(tower);
        const armGeo = this._geo(new THREE.BoxGeometry(96, 9, 22));
        [140, 260, 400, 520].forEach((y) => {
          const arm = new THREE.Mesh(armGeo, gantryMat);
          arm.position.set(80, y, 0);
          gantry.add(arm);
        });
      }
      // A gun that is expecting a round rather than sending one has its gantry
      // already parked clear, and wears the approach lighting instead.
      if (arrival) { gantry.rotation.y = 1.4; gantry.position.x = 90; }
      g.add(gantry);

      const top = 86 * F + (H - 40 * F);
      if (arrival) this._buildApproach(g, top);

      return { group: g, rings: coilRings, capacitors, gantry, strobes, top };
    },

    // The skyline: a low sprawl of lit boxes, plus whatever each pad is known
    // for standing next to.
    _buildTown(into, forSite, groundY) {
      const s = forSite || this.site;
      const e = this.env;
      const g = new THREE.Group();
      this.town = g;
      // A town stands on the surface, which on a shaft pad is up at the muzzle.
      g.position.y = groundY || 0;
      (into || this.pad).add(g);

      const wallMat = this._phong({ color: s.town, shininess: 4 });
      const litMat = this._basic({ color: s.townLit });
      const r = this.rng;
      const boxGeo = this._geo(new THREE.BoxGeometry(1, 1, 1));
      for (let i = 0; i < 150; i++) {
        const a = r() * Math.PI * 2;
        const d = 1400 + r() * 6200;
        const w = 30 + r() * 90;
        const h = 18 + r() * (r() > 0.9 ? 180 : 60);
        const b = new THREE.Mesh(boxGeo, wallMat);
        b.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
        b.scale.set(w, h, w * (0.6 + r() * 0.8));
        b.rotation.y = r() * Math.PI;
        g.add(b);
        // Windows: one emissive slab per building, at night or in the murk.
        if ((e.night || e.storm) && r() > 0.35) {
          const win = new THREE.Mesh(boxGeo, litMat);
          win.position.copy(b.position);
          win.position.y = h * 0.62;
          win.scale.set(w * 1.02, h * 0.1, w * 0.62);
          win.rotation.y = b.rotation.y;
          g.add(win);
        }
      }

      // Taranto's stacks: tall, capped, and burning a flare all night.
      for (let i = 0; i < s.stacks; i++) {
        const a = -0.9 + i * 0.32;
        const d = 2600 + i * 240;
        const h = s.stackHeight * (0.8 + this.rng() * 0.4);
        const st = new THREE.Mesh(
          this._geo(new THREE.CylinderGeometry(9, 14, h, 8)),
          this._phong({ color: 0xb8493a, shininess: 6 })
        );
        st.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
        g.add(st);
        const flare = new THREE.Mesh(
          this._geo(new THREE.ConeGeometry(7, 26, 6)),
          this._basic({ color: 0xffa23a, transparent: true, opacity: 0.85 })
        );
        flare.position.set(st.position.x, h + 12, st.position.z);
        g.add(flare);
        (this.flares = this.flares || []).push(flare);
      }

      // Greenwich's domes: the observatory, white and shuttered.
      for (let i = 0; i < s.domes; i++) {
        const a = 2.2 + i * 0.4;
        const d = 1700 + i * 400;
        const dome = new THREE.Mesh(
          this._geo(new THREE.SphereGeometry(34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
          this._phong({ color: 0xd8d2c4, shininess: 30, specular: 0x666666 })
        );
        dome.position.set(Math.cos(a) * d, 26, Math.sin(a) * d);
        g.add(dome);
        const drum = new THREE.Mesh(
          this._geo(new THREE.CylinderGeometry(34, 34, 52, 12)),
          this._phong({ color: 0x8a4a3c, shininess: 4 })
        );
        drum.position.set(dome.position.x, 26, dome.position.z);
        g.add(drum);
      }
    },

    // The floods. On in the dark and in bad weather, and they are what makes
    // the vehicle readable on the pad before anything has happened.
    _buildFloodlights(into, groundY) {
      const host = into || this.pad;
      const on = this.env.night || this.env.storm || this.env.wet;
      this.floods = this.floods || [];
      if (!on) return;
      const baseY = groundY || 0;
      const mastMat = this._phong({ color: 0x4a4f57, shininess: 8 });
      const lampMat = this._basic({ color: 0xfff2cf });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const d = 330;
        const h = 120;
        const mast = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(2.6, 4.4, h, 6)), mastMat);
        mast.position.set(Math.cos(a) * d, baseY + h / 2, Math.sin(a) * d);
        host.add(mast);
        const lamp = new THREE.Mesh(this._geo(new THREE.BoxGeometry(16, 7, 5)), lampMat);
        lamp.position.set(mast.position.x, baseY + h, mast.position.z);
        lamp.lookAt(0, baseY + 120, 0);
        host.add(lamp);
        const L = new THREE.PointLight(0xffe9bf, 1.7, 1400, 2);
        L.position.set(mast.position.x, baseY + h, mast.position.z);
        host.add(L);
        this.floods.push(L);
      }
    },

    // The hatch. Two leaves of iron flush with the ground over the muzzle of a
    // vault's gun, with the spoil ring round them and the lamps set into it.
    // They are shut for the whole count and swing open on the release, which
    // is the only warning anybody standing on that square ever gets.
    _buildHatch(into, groundY, arrival) {
      const host = into || this.pad;
      const g = new THREE.Group();
      g.position.y = groundY || 0;
      host.add(g);

      const iron = this._phong({ color: 0x4a4f58, shininess: 26, specular: 0x777c85 });
      const rim = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(96, 116, 10, 20)), this._phong({
        color: 0x6b6357, shininess: 4,
      }));
      rim.position.y = -4;
      g.add(rim);

      const leaves = [];
      const leafGeo = this._geo(new THREE.BoxGeometry(84, 7, 168));
      for (let i = 0; i < 2; i++) {
        // Hinged at the rim, so a leaf swings up and outward rather than
        // sliding: the pivot is the group, the slab hangs off it.
        const pivot = new THREE.Group();
        pivot.position.set(i ? 84 : -84, 0, 0);
        const leaf = new THREE.Mesh(leafGeo, iron);
        leaf.position.set(i ? -42 : 42, 0, 0);
        pivot.add(leaf);
        g.add(pivot);
        pivot.userData.side = i ? 1 : -1;
        leaves.push(pivot);
      }
      const lamps = [];
      const lampGeo = this._geo(new THREE.SphereGeometry(4.2, 6, 5));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const L = new THREE.Mesh(lampGeo, this._mat(new THREE.MeshBasicMaterial({ color: 0x33140a })));
        L.position.set(Math.cos(a) * 108, 2, Math.sin(a) * 108);
        L.userData.order = i;
        g.add(L);
        lamps.push(L);
      }
      const hatch = { group: g, leaves: leaves, lamps: lamps, open: 0 };
      if (arrival) this.hatchB = hatch; else this.hatchA = hatch;
      return hatch;
    },

    // The lid: shut through the count, thrown open on the release, and left
    // open afterwards. `open` is 0..1 and the leaves take it straight to angle.
    _updateHatch(hatch, open, live) {
      if (!hatch) return;
      hatch.open = open;
      hatch.leaves.forEach((pivot) => {
        pivot.rotation.z = pivot.userData.side * open * 1.5;
      });
      hatch.lamps.forEach((L) => {
        const on = open > 0.02 ? true : (Math.floor(this._time * 2) + L.userData.order) % 8 < 2;
        L.material.color.setHex(live && on ? 0xff8a34 : 0x33140a);
      });
    },

    // The meridian. A laser due north from the observatory, which at this pad
    // is also the range-safety line the vehicle is supposed to fly up.
    _buildMeridian(into) {
      const geo = this._geo(new THREE.CylinderGeometry(1.2, 1.2, 9000, 5, 1, true));
      const mat = this._mat(new THREE.MeshBasicMaterial({
        color: 0x63ff9b, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      const beam = new THREE.Mesh(geo, mat);
      // Laid along the ground toward the north, tilted a few degrees up, the
      // way the real one is thrown across London.
      beam.rotation.z = Math.PI / 2 - 0.16;
      beam.position.set(0, 220, -4400);
      beam.rotation.y = Math.PI / 2;
      this.meridian = beam;
      (into || this.pad).add(beam);
    },

    _updatePad(dt, ph) {
      // The whole installation rides down as one: the ground drops away under
      // a stationary vehicle. RAIL_LOAD_Y puts the round in the throat at T-0
      // and keeps the barrel aligned on it all the way up. Culled once it is a
      // speck, which is well before the far Earth fades in to replace it.
      //
      // COMING DOWN it is the same installation seen the other way up: the
      // ship's rail hangs ABOVE the vehicle with its muzzle pointed at the
      // planet, and what it recedes by is not the altitude but how far the
      // round has already fallen away from it. The barrel is flipped once at
      // build time, which puts its local axis back along the way the round is
      // travelling and lets every ring, bank and gantry below read unchanged.
      const away = Math.max(0, this.descent
        ? this.startAlt - this.alt
        : this.alt - this.startAlt);
      const gone = away > 60000;
      this.pad.visible = !gone;
      // The far gun is asked for while it is still under the horizon.
      if (this.destSite && (this.descent ? this.alt < 90000 : this.downrange > 0.4)) this._ensure("padB");
      if (this.padB) this._updateArrivalPad(dt, ph);
      if (gone) return;
      const loadA = loadYOf(this.site);
      // HOW FAR UP THE BORE THE ROUND IS. The vehicle never moves, so the pad
      // recedes by this much - and on a gun that is laid over, it recedes
      // along the BARREL and not along the vertical: the round is inside a
      // tube, and the tube is at an angle. Resolved into the two axes the pad
      // is moved in, which keeps the bullet exactly on the bore all the way up
      // a diagonal launch the same way it sits on it up a vertical one.
      // And what it recedes BY is the distance flown since the breech, never
      // the raw altitude: a gun bolted to a hull starts its count hundreds of
      // kilometres up, and reading the altitude here threw the installation,
      // ship and all, that far under the camera in the very first frame. On
      // the ground the two numbers are equal, which is why it held so long.
      const bore = away + loadA;
      const tilt = this._railTilt(false);
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      this.pad.position.y = this.descent ? bore : -bore * ct;
      this.pad.position.z = (this.downrangeZ || 0) + (this.descent ? 0 : bore * st);

      // The rings.
      //
      // COUNT: they charge bottom to top, one bank at a time, and hold.
      // SHOT:  they fire in a wave that tracks the round itself. Each ring is
      //        white as the bullet passes it, amber for a moment behind, and
      //        dead after - so the discharge reads as one pulse a kilometre
      //        long chasing something already gone.
      const charging = ph.key === "countdown" ? ph.progress : (ph.index > 1 ? 1 : 0);
      const firing = ph.key === "coil";
      const bulletY = away + loadA;

      // The lid over a vault's muzzle. Shut for the whole count, thrown open
      // in the last second of it, and left open behind the shot.
      if (this.hatchA) {
        const open = ph.key === "countdown" ? smooth(ramp(ph.progress, 0.88, 1))
          : (ph.index > 1 ? 1 : 0);
        this._updateHatch(this.hatchA, open, true);
      }
      this.railA.rings.forEach((ring, i) => {
        const k = ring.userData.k;
        let e = 0;
        if (charging > 0) e = k <= charging ? 0.3 + 0.18 * Math.sin(this._time * 8 + i * 0.7) : 0;
        if (firing) {
          // Metres between this ring and the round. Ahead of it the coil is
          // already pulling; behind it, it is collapsing.
          const d = ring.userData.y - bulletY;
          const ahead = d > 0 ? clamp01(1 - d / 120) : 0;
          const behind = d <= 0 ? clamp01(1 + d / 220) : 0;
          e = Math.max(e * 0.25, ahead * 6.5 + behind * 2.6);
        } else if (ph.index > 2) {
          e = 0;
        }
        ring.material.emissiveIntensity = e;
      });

      // The banks come up during the count in the same order, and dump on the
      // shot.
      if (this.railA.capacitors) {
        this.railA.capacitors.forEach((band, i) => {
          const k = (i + 0.5) / this.railA.capacitors.length;
          let e = charging > 0 && k <= charging ? 0.5 + 0.35 * Math.sin(this._time * 6 + i) : 0;
          if (firing) e = 3.2 * (1 - ph.progress);
          band.material.emissiveIntensity = e;
        });
      }

      // Obstruction strobes, out of phase up the tower.
      if (this.railA.strobes) {
        const lit = this.env.night || this.env.storm || this.env.wet;
        this.railA.strobes.forEach((m) => {
          const on = lit && ((this._time * 0.9 + m.userData.phase) % 1) < 0.14;
          m.material.color.setHex(on ? 0xff6a4a : 0x3a0806);
        });
      }

      // The gantry swings clear in the last two seconds of the count.
      if (ph.key === "countdown") {
        const swing = smooth(ramp(ph.progress, 0.78, 0.97));
        this.railA.gantry.rotation.y = swing * 1.4;
        this.railA.gantry.position.x = swing * 90;
      } else if (ph.index > 1) {
        this.railA.gantry.rotation.y = 1.4;
        this.railA.gantry.position.x = 90;
      }

      if (this.flares) {
        this.flares.forEach((f, i) => {
          f.scale.y = 0.7 + Math.sin(this._time * 5 + i * 2) * 0.3;
        });
      }
      if (this.meridian) this.meridian.material.opacity = this.env.night ? 0.62 : 0.2;
    },

    // The receiving gun.
    //
    // It comes up out of the haze ahead, and in the last beat the round is
    // INSIDE it: the pad is offset by the same RAIL_LOAD_Y the launching one
    // used, so the barrel axis runs exactly through the stationary vehicle and
    // the muzzle swallows it at the top of the capture. The rings then fire in
    // reverse and take the speed back out magnetically - a mass driver run
    // backwards is a brake, and the energy goes back into the capacitor halls
    // it came out of at the other end.
    _updateArrivalPad(dt, ph) {
      const b = this.padB;
      const rail = this.railB;
      const capturing = ph.key === "capture" || ph.key === "arrived";
      // A hop closes on the far gun along the ground track. A descent closes
      // on it straight down, so "how far there is to go" is the altimeter and
      // the gun is directly under the vehicle from the moment it can be seen.
      const closing = this.descent ? clamp01(1 - this.alt / 60000) : this.downrange;
      const show = this.alt < 60000 && closing > 0.55;
      b.visible = show;
      if (!show) return;

      const ahead = this.descent ? 0 : (1 - this.downrange) * DOWNRANGE_VIS_M;
      // The same decomposition the launching pad uses, mirrored: the far gun
      // is laid over toward the incoming round, so the round runs down ITS
      // bore at the same angle it left the other one at.
      const boreB = this.alt + loadYOf(this.destSite);
      const tiltB = this._railTilt(true);
      b.position.y = -boreB * Math.cos(tiltB);
      b.position.z = -ahead + boreB * Math.sin(tiltB);

      // A vault expecting a round has the lid open long before it gets there.
      if (this.hatchB) {
        this._updateHatch(this.hatchB, smooth(clamp01((closing - 0.6) / 0.2)), true);
      }

      // Approach lights: a ladder walking inward round the muzzle, faster the
      // closer it gets, solid once the round is committed to the bore.
      if (this.approachLights) {
        const k = clamp01((closing - 0.94) / 0.06);
        this.approachLights.forEach((L) => {
          const on = capturing
            ? true
            : ((Math.floor(this._time * (2 + k * 10)) + L.userData.order) % 10) < 3;
          L.material.color.setHex(on ? 0x8affc4 : 0x0d2a18);
        });
        if (this.approachGlow) this.approachGlow.intensity = 0.3 + k * 3.4;
      }

      if (!rail) return;
      const bulletY = this.alt + loadYOf(this.destSite);   // the receiving bore, and the round is falling down it

      // The braking wave. The coil the round is passing is the one doing the
      // work, and the ones it has already cleared hold it on the axis, so the
      // bright band sits AT the round and the afterglow trails upward behind
      // it - the launching gun's wave, running the other way.
      rail.rings.forEach((ring, i) => {
        let e = 0;
        if (capturing) {
          const d = ring.userData.y - bulletY;
          const at = clamp01(1 - Math.abs(d) / 110);
          const behind = d > 0 ? clamp01(1 - d / 260) : 0;
          e = at * 6.0 + behind * 1.6;
        } else if (closing > 0.7) {
          // Standing by: a slow breathing charge all the way up the bore, so
          // the gun visibly knows something is coming.
          e = 0.22 + 0.16 * Math.sin(this._time * 3 - i * 0.28);
        }
        ring.material.emissiveIntensity = e;
      });

      // The banks FILL as the round is braked: the shot is being paid back.
      if (rail.capacitors) {
        const soak = capturing ? smooth(ph.key === "arrived" ? 1 : ph.progress) : 0;
        rail.capacitors.forEach((band, i) => {
          const k = (i + 0.5) / rail.capacitors.length;
          band.material.emissiveIntensity = k <= soak ? 1.4 + 0.5 * Math.sin(this._time * 7 + i) : 0;
        });
      }

      if (rail.strobes) {
        const lit = this.env.night || this.env.storm || this.env.wet;
        rail.strobes.forEach((m) => {
          const on = lit && ((this._time * 0.9 + m.userData.phase) % 1) < 0.14;
          m.material.color.setHex(on ? 0xff6a4a : 0x3a0806);
        });
      }
    },

  });
})();
