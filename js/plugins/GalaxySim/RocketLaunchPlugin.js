/*:
 * @target MZ
 * @plugindesc Rocket Launch - the coilgun cinematic: countdown, magnetic release, the burn, the Kessler belt and the docking with the starship, or the suborbital hop between the two pads.
 * @author Nocoldiz + Omni-Lex
 * @url
 * @help
 * ============================================================================
 * Rocket Launch
 * ============================================================================
 * A single, uninterrupted three.js cinematic fired from a coilgun the size of
 * a mountain. There are two flight plans and the player picks one.
 *
 * ---------------------------------------------------------------------------
 * ORBITAL - three stages, and it costs the vehicle nearly everything
 * ---------------------------------------------------------------------------
 *   SITE        the player picks a pad
 *   HOLD        the gun, in the weather and the light of the actual hour
 *   COUNTDOWN   ten seconds, the capacitor halls and the rings charging
 *   COIL        no engine at all: a magnetic rail throws the round
 *   COAST       an unpowered ballistic arc through the lower atmosphere
 *   IGNITION    only now, high up and thin, does anything burn
 *   BURN        the climb to the debris belt
 *   KESSLER     the belt. Armour is torn off plate by plate
 *   CLEAR       what is left of it coasts out the top
 *   RENDEZVOUS  the starship, closing
 *   DOCK        the clamp, and the interior map
 *
 * ---------------------------------------------------------------------------
 * SUBORBITAL - two stages, and it comes home with every layer it left with
 * ---------------------------------------------------------------------------
 * The same gun used as transport: Greenwich to Taranto or the other way. It
 * does NOT land on a pad - it DOCKS WITH THE OTHER COILGUN, flying into its
 * muzzle and letting that barrel run in reverse to brake it magnetically. A
 * mass driver run backwards is a brake, and the energy goes back into the
 * capacitor halls at the receiving end.
 *
 *   COIL        the rail throws it on a parabola, apogee 180 km
 *   ASCENT      unpowered, all the way to the top
 *   APOGEE      THE FLIP - end over end at max height, nothing burning
 *   PROGRADE    the motor now points the way it is going, so thrust brakes
 *   REENTRY     the plume is the heat shield
 *   TERMINAL    the far gun's muzzle comes up under it
 *   CAPTURE     down the receiving barrel, the coil running in reverse
 *   ARRIVED     docked in the breech, and the party walks out
 *
 * Nothing on the hop takes armour off: it never reaches the belt and nothing
 * at 180 km is moving fast enough relative to the vehicle to matter. The
 * integrity readout drops by a scuff and comes back.
 *
 * ---------------------------------------------------------------------------
 * The gun
 * ---------------------------------------------------------------------------
 * A kilometre of barrel on a foundation a hundred and thirty metres across,
 * with twelve capacitor halls round the foot and fifty coil rings up the bore.
 * The bore is eleven times the width of the round it throws. During the count
 * the rings charge bottom to top; during the shot they fire in a wave that
 * TRACKS THE ROUND, lighting as it reaches them and collapsing behind it.
 *
 * ---------------------------------------------------------------------------
 * The vehicle
 * ---------------------------------------------------------------------------
 * An armoured bullet, not a rocket: an ogive of layered armour belts over a
 * solid core. It has no stages to drop because it never had to lift its own
 * fuel off the ground. What it sheds instead is armour.
 *
 * HULL INTEGRITY falls asymptotically toward a floor it never reaches: the
 * bullet arrives at around two percent and is never destroyed outright. See
 * integrityAt() - the curve is an exponential on the belt traversal, so the
 * last plates come off slower and slower and something always docks.
 *
 * ---------------------------------------------------------------------------
 * The world
 * ---------------------------------------------------------------------------
 * The hour of the day, the weather and the season are read from the live game
 * (TimeDateSystem / WeatherSystem) and drive the pad lighting, the sky, the
 * cloud deck, the particles on the way up and the hazard severity in the belt.
 * A storm launch at night is the worst flight there is.
 *
 * ---------------------------------------------------------------------------
 * Launch sites
 * ---------------------------------------------------------------------------
 *   TARANTO     the Ionian yard: two seas, steel stacks, a warm coast
 *   GREENWICH   the meridian mast: the Thames, brick, and the green line
 *
 * ---------------------------------------------------------------------------
 * Where a flight puts the party
 * ---------------------------------------------------------------------------
 * ORBITAL_ARRIVAL and SUBORBITAL_ARRIVAL, near the top of this file, are the
 * one place to edit. A suborbital entry with mapId 0 falls back to the world
 * square its pad stands on; give it a real mapId and x/y to land the party on
 * a hand-made map instead.
 *
 * ---------------------------------------------------------------------------
 * Music
 * ---------------------------------------------------------------------------
 * The cinematic takes the BGM over for its whole run. The orbital flight gets
 * three pieces of music, because it is three different films: the machine, the
 * belt, and the cold of arriving. The hop gets one. Each is drawn from a POOL
 * of tracks and never repeats the one it played last, so launching often does
 * not wear the music out. A flight that lands somewhere stops the music so the
 * destination map starts its own; one that is abandoned gives the map back
 * what it was playing. See the BGM table.
 *
 * ---------------------------------------------------------------------------
 * Controls
 * ---------------------------------------------------------------------------
 *   drag / arrows / right stick   swing the camera round the vehicle
 *   wheel / shift+arrows          pull back and push in
 *   shift or ctrl + drag          pan the look-at point
 *   OK                            hand the framing back to the director
 *   hold CANCEL                   skip to the arrival
 *
 * The camera is free in every phase, including the countdown, and the offset
 * survives the cut to the next shot.
 *
 * ---------------------------------------------------------------------------
 * API - window.RocketLaunch
 * ---------------------------------------------------------------------------
 *   start(opts)        push the cinematic. opts: { site, mode, destination }
 *   SITES / PROFILES   the site and flight-plan tables
 *   ORBITAL_ARRIVAL / SUBORBITAL_ARRIVAL   where each flight lands
 *   lastFlight()       what the last flight cost, off $gameSystem
 *   MODEL              the pure flight model, used by the tests
 *   MODEL.altitudeAt(t, prof)        metres at t seconds
 *   MODEL.downrangeAt(t, prof)       0..1 along the ground track
 *   MODEL.phaseAt(t, prof)           { key, local, progress }
 *   MODEL.integrityAt(alt,sev,prof)  hull percentage remaining
 *   MODEL.hazardSeverity(env)        weather/light multiplier on the belt
 *   MODEL.tapeFraction(alt, prof)    0..1 position on the altimeter tape
 *   MODEL.greatCircleM(a, b)         metres between two sites
 *
 * LOAD ORDER: after GalaxySim_Core.js. Uses GalaxySim_Renderer3D for the
 * Earth and the debris mesh and GalaxySim_ShipModel for the starship, and
 * degrades to its own simpler bodies when either is absent. Requires THREE.
 *
 * @command launch
 * @text Launch
 * @desc Plays the launch cinematic. Ends at the starship, or at the far pad on a suborbital hop.
 *
 * @arg mode
 * @text Flight plan
 * @type select
 * @option Let the player choose
 * @value ask
 * @option Orbital - rendezvous with the starship
 * @value orbital
 * @option Suborbital - hop to the other pad
 * @value suborbital
 * @default ask
 * @desc Which of the two flight plans to fly.
 *
 * @arg site
 * @text Launch site
 * @type select
 * @option Let the player choose
 * @value ask
 * @option Taranto
 * @value taranto
 * @option Greenwich
 * @value greenwich
 * @default ask
 * @desc Which pad the flight leaves from.
 *
 * @command launchTo
 * @text Launch to map
 * @desc As Launch, but lands the party on a map of your choosing instead of the profile's own arrival.
 *
 * @arg mode
 * @text Flight plan
 * @type select
 * @option Let the player choose
 * @value ask
 * @option Orbital
 * @value orbital
 * @option Suborbital
 * @value suborbital
 * @default ask
 *
 * @arg site
 * @text Launch site
 * @type select
 * @option Let the player choose
 * @value ask
 * @option Taranto
 * @value taranto
 * @option Greenwich
 * @value greenwich
 * @default ask
 *
 * @arg mapId
 * @text Map ID
 * @type number
 * @min 1
 * @default 721
 *
 * @arg x
 * @text X
 * @type number
 * @min 0
 * @default 28
 *
 * @arg y
 * @text Y
 * @type number
 * @min 0
 * @default 10
 *
 * @arg dir
 * @text Facing
 * @type select
 * @option Down
 * @value 2
 * @option Left
 * @value 4
 * @option Right
 * @value 6
 * @option Up
 * @value 8
 * @default 8
 */

(() => {
  "use strict";

  // Two names, deliberately. Game_Interpreter.command357 looks a plugin
  // command up under the FILE's base name, so registerCommand must say
  // "RocketLaunchPlugin" or no event page can ever reach it. The i18n bank is
  // its own namespace and keeps the shorter one, the way Bowling.json belongs
  // to BowlingMinigame.js.
  const PLUGIN_FILE = "RocketLaunchPlugin";
  const I18N = "RocketLaunch";
  const t = (key, params) =>
    (typeof window.T === "function" ? window.T(I18N + "." + key, params) : key);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ramp = (v, lo, hi) => (hi <= lo ? (v >= hi ? 1 : 0) : clamp01((v - lo) / (hi - lo)));
  const smooth = (k) => { const c = clamp01(k); return c * c * (3 - 2 * c); };

  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ==========================================================================
  // The flight model
  //
  // Pure arithmetic, no three.js and no RMMZ: everything the cinematic shows
  // is a function of one number, the seconds since the run began. The scene
  // reads it, the HUD reads it, and the test suite reads it without a canvas.
  // ==========================================================================

  // Every distance in metres. The rail is the only part of this that is not
  // roughly to scale: 1200 m of coil is short for 2.4 km/s, but a longer one
  // is off the bottom of the frame before the player has seen it move.
  const RAIL_LEN_M = 1200;
  const RAIL_EXIT_MS = 2400;
  // Where the air starts to bite and where it lets go again. The armour is
  // scoured across this band and nowhere else in the atmosphere.
  const MAXQ_START_M = 9000;
  const MAXQ_END_M = 32000;
  // Nothing burns below this. The rail did the work; the motor only has to
  // circularise, and it lights where there is no longer an airframe load.
  const IGNITION_M = 45000;
  const KARMAN_M = 100000;
  // The belt. Real debris peaks near 800 km and thins out past 1000; the
  // traversal is the long middle of the cinematic and the only thing in it
  // that can hurt the vehicle.
  const KESSLER_IN_M = 700000;
  const KESSLER_OUT_M = 1150000;
  const DOCK_M = 1320000;

  const COUNTDOWN_S = 10;

  // Height up the barrel at which the round is loaded. The vehicle itself
  // never moves in the scene - the pad is lowered past it - so this is the
  // offset that puts it in the breech throat at T-0.
  const RAIL_LOAD_Y = 62;

  // Hull percentages. The floor is an asymptote, not a minimum that gets
  // clamped: see integrityAt. AERO_LOSS is what the air alone takes.
  const INTEGRITY_START = 100;
  const INTEGRITY_FLOOR = 2;
  const AERO_LOSS = 8;
  // What the air alone costs on a flight that never meets the belt. Deliberately
  // under the lowest armour plate threshold: see _buildArmour.
  const SUB_AERO_LOSS = 4;
  // e^-5.5 of the margin survives a nominal traversal, so a clean flight docks
  // at about 2.6% and the worst one at about 2.1%. Neither is ever 0.
  const KESSLER_DECAY = 5.5;
  // The integrity at which the FIRST armour plate tears off. Every plate's own
  // threshold is spread down from here (see _buildArmour), so a flight whose
  // integrity never falls this far keeps its whole skin.
  const FIRST_PLATE_AT = INTEGRITY_FLOOR + 0.55 + (88 - INTEGRITY_FLOOR);

  // Altimeter tape. A linear tape spends nine tenths of its length on the last
  // three minutes of the flight and shows nothing at all during the part the
  // player is actually flying, so the scale is logarithmic with the knee set
  // where the pad tower stops mattering.
  const TAPE_KNEE_M = 2000;
  const TAPE_TOP_M = 1400000;

  const EASE = {
    linear: (k) => k,
    accel: (k) => k * k,
    decel: (k) => 1 - (1 - k) * (1 - k),
    smooth: smooth,
    // The coast: thrown hard, slowed by the air, still climbing at the top.
    ballistic: (k) => 1 - Math.pow(1 - k, 2.6),
  };

  // ==========================================================================
  // Two ways to fly
  //
  // ORBITAL is the flight the rail was built for: straight up, out through the
  // belt, and a rendezvous with the starship. It is three stages - the rail,
  // the circularisation burn and the docking burn - and it costs the vehicle
  // nearly all of its armour.
  //
  // SUBORBITAL is the same rail used as transport. The bullet is thrown on a
  // parabola from one pad to the other, flips end over end at the top and
  // burns its remaining fuel retrograde to arrive standing still. Two stages,
  // no belt, and the armour comes back down with it: nothing up there is
  // moving fast enough relative to the vehicle to take a plate off.
  //
  // Both are tables of the same shape. dur in seconds, alt in metres, down in
  // fractions of the ground track. The table IS the cinematic: retiming a beat
  // is a number here and the camera, the HUD and the audio follow it.
  // ==========================================================================

  const ORBITAL_PHASES = [
    { key: "hold", dur: 3.0, from: 0, to: 0, ease: "linear" },
    { key: "countdown", dur: COUNTDOWN_S, from: 0, to: 0, ease: "linear" },
    { key: "coil", dur: 2.4, from: 0, to: RAIL_LEN_M, ease: "accel" },
    { key: "coast", dur: 8.0, from: RAIL_LEN_M, to: IGNITION_M, ease: "ballistic" },
    { key: "ignition", dur: 2.0, from: IGNITION_M, to: 62000, ease: "smooth" },
    { key: "burn", dur: 10.0, from: 62000, to: KESSLER_IN_M, ease: "accel" },
    { key: "kessler", dur: 16.0, from: KESSLER_IN_M, to: KESSLER_OUT_M, ease: "linear" },
    { key: "clear", dur: 5.0, from: KESSLER_OUT_M, to: DOCK_M, ease: "decel" },
    { key: "rendezvous", dur: 8.0, from: DOCK_M, to: DOCK_M, ease: "linear" },
    { key: "dock", dur: 6.0, from: DOCK_M, to: DOCK_M, ease: "linear" },
    { key: "aboard", dur: 2.5, from: DOCK_M, to: DOCK_M, ease: "linear" },
  ];

  // The parabola tops out well below the belt, which is the whole point of
  // taking it: 180 km is above the air and below anything that could hit you.
  const SUB_APOGEE_M = 180000;

  const SUBORBITAL_PHASES = [
    { key: "hold", dur: 3.0, from: 0, to: 0, ease: "linear", dFrom: 0, dTo: 0 },
    { key: "countdown", dur: COUNTDOWN_S, from: 0, to: 0, ease: "linear", dFrom: 0, dTo: 0 },
    { key: "coil", dur: 2.4, from: 0, to: RAIL_LEN_M, ease: "accel", dFrom: 0, dTo: 0.004, dEase: "accel" },
    { key: "ascent", dur: 9.0, from: RAIL_LEN_M, to: SUB_APOGEE_M, ease: "ballistic", dFrom: 0.004, dTo: 0.34, dEase: "linear" },
    // THE FLIP, and it happens at the top. Altitude is all but flat across
    // this beat because that is what apogee is: the vehicle turns end over
    // end, cold, with nothing burning, and comes out of it with the motor
    // pointed PROGRADE - along the way it is already going.
    { key: "apogee", dur: 5.0, from: SUB_APOGEE_M, to: SUB_APOGEE_M * 0.99, ease: "linear", dFrom: 0.34, dTo: 0.47, dEase: "linear" },
    // And now thrust SLOWS it, because the bell is facing the direction of
    // travel. Everything left in the tanks goes into arriving slowly.
    { key: "prograde", dur: 9.0, from: SUB_APOGEE_M * 0.99, to: 62000, ease: "accel", dFrom: 0.47, dTo: 0.76, dEase: "decel" },
    { key: "reentry", dur: 7.0, from: 62000, to: 13000, ease: "linear", dFrom: 0.76, dTo: 0.94, dEase: "decel" },
    // Lining up on the muzzle of the far gun, which is the only thing at this
    // end big enough to catch it.
    { key: "terminal", dur: 5.5, from: 13000, to: RAIL_LEN_M, ease: "decel", dFrom: 0.94, dTo: 1, dEase: "decel" },
    // Down the barrel with the motor shut down: the receiving coil fires in
    // reverse and takes the last of the speed out magnetically, the same way
    // the launching one put it in. This is the dock.
    { key: "capture", dur: 5.0, from: RAIL_LEN_M, to: 0, ease: "decel", dFrom: 1, dTo: 1 },
    { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear", dFrom: 1, dTo: 1 },
  ];

  function startTable(phases) {
    const out = {};
    let acc = 0;
    phases.forEach((p) => { out[p.key] = acc; acc += p.dur; });
    out._total = acc;
    return out;
  }

  const PROFILES = {
    orbital: {
      id: "orbital",                      // i18n-ignore  profile id
      phases: ORBITAL_PHASES,
      start: startTable(ORBITAL_PHASES),
      stages: 3,
      // The belt is the only thing in the game that takes armour off, so these
      // two flags travel together and the suborbital hop turns both off.
      belt: true,
      shedsArmour: true,
      tapeTop: 1400000,
      apogee: DOCK_M,
      downrange: false,
    },
    suborbital: {
      id: "suborbital",                   // i18n-ignore  profile id
      phases: SUBORBITAL_PHASES,
      start: startTable(SUBORBITAL_PHASES),
      stages: 2,
      belt: false,
      shedsArmour: false,
      tapeTop: 220000,
      apogee: SUB_APOGEE_M,
      downrange: true,
    },
  };

  const PROFILE_ORDER = ["orbital", "suborbital"];   // i18n-ignore  profile ids

  function profileOf(id) { return PROFILES[id] || PROFILES.orbital; }

  function phaseAt(time, profile) {
    const prof = profile || PROFILES.orbital;
    const phases = prof.phases;
    const time_ = Math.max(0, time);
    let acc = 0;
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      if (time_ < acc + p.dur || i === phases.length - 1) {
        const local = clamp(time_ - acc, 0, p.dur);
        return { key: p.key, index: i, local, dur: p.dur, progress: p.dur > 0 ? local / p.dur : 1 };
      }
      acc += p.dur;
    }
    const last = phases[phases.length - 1];
    return { key: last.key, index: phases.length - 1, local: 0, dur: 1, progress: 1 };
  }

  function altitudeAt(time, profile) {
    const prof = profile || PROFILES.orbital;
    const ph = phaseAt(time, prof);
    const p = prof.phases[ph.index];
    return lerp(p.from, p.to, EASE[p.ease](ph.progress));
  }

  // How far along the ground track, 0 at the pad and 1 at the far pad. Zero
  // for the orbital profile, which does not go anywhere horizontally.
  function downrangeAt(time, profile) {
    const prof = profile || PROFILES.orbital;
    if (!prof.downrange) return 0;
    const ph = phaseAt(time, prof);
    const p = prof.phases[ph.index];
    if (p.dFrom == null) return 0;
    return lerp(p.dFrom, p.dTo, EASE[p.dEase || p.ease](ph.progress));
  }

  // Central difference on the altitude curve. The readout is a speed, not an
  // orbital element, so a derivative of what the player can see is the honest
  // number to print.
  function verticalSpeedAt(time, profile, h) {
    const dt = h || 0.05;
    return (altitudeAt(time + dt, profile) - altitudeAt(Math.max(0, time - dt), profile)) / (dt * 2);
  }

  // Great-circle metres between two sites, so the downrange readout on the
  // suborbital hop is the real distance from Taranto to Greenwich and not a
  // number somebody typed in.
  function greatCircleM(a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const p1 = a.lat * rad, p2 = b.lat * rad;
    const dp = (b.lat - a.lat) * rad, dl = (b.lon - a.lon) * rad;
    const h = Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Hull integrity as a function of altitude, in percent.
  //
  // Two separate insults. The air scours a fixed amount across max-Q and then
  // stops. The belt is an exponential decay on whatever margin came out of the
  // atmosphere, so the surviving fraction is e^-k and never zero: the bullet
  // can be stripped to almost nothing and still be a thing that docks.
  //
  // `progress` is only read for a profile with no belt: such a flight passes
  // through max-Q twice, once up and once down, and a hull reading that dipped
  // and then healed itself would be a lie. Keyed to the ground track instead,
  // the scuff only ever accumulates.
  function integrityAt(alt, severity, profile, progress) {
    const prof = profile || PROFILES.orbital;
    const sev = clamp(severity == null ? 1 : severity, 0.5, 2);
    // A profile that never leaves the air only ever pays the aerodynamic
    // price, and it is a scuff: SUB_AERO_LOSS is small enough that it cannot
    // reach the first armour plate's threshold, which is why the suborbital
    // hop comes home with every layer it left with.
    if (!prof.belt) {
      return INTEGRITY_START - SUB_AERO_LOSS * smooth(clamp01(progress || 0));
    }
    const afterAir = INTEGRITY_START - AERO_LOSS * smooth(ramp(alt, MAXQ_START_M, MAXQ_END_M));
    const u = ramp(alt, KESSLER_IN_M, KESSLER_OUT_M);
    const margin = (afterAir - INTEGRITY_FLOOR) * Math.exp(-KESSLER_DECAY * sev * u);
    return INTEGRITY_FLOOR + margin;
  }

  // Weather and darkness make the traversal worse, never better than nominal
  // by much: the belt does not care, but the tracking does.
  function hazardSeverity(env) {
    const e = env || {};
    let s = 1;
    if (e.weather === "storm") s += 0.10;
    else if (e.weather === "snow") s += 0.06;
    else if (e.weather === "rain") s += 0.04;
    if (e.night) s += 0.05;
    return clamp(s, 0.9, 1.25);
  }

  function tapeFraction(alt, profile) {
    const top = (profile || PROFILES.orbital).tapeTop || TAPE_TOP_M;
    const a = clamp(alt, 0, top);
    return Math.log1p(a / TAPE_KNEE_M) / Math.log1p(top / TAPE_KNEE_M);
  }

  // Air density as a fraction of sea level, exponential with an 8.5 km scale
  // height. Drives the plume shape, the wind noise and the haze.
  function airDensity(alt) {
    return Math.exp(-Math.max(0, alt) / 8500);
  }

  const MODEL = {
    PROFILES, PROFILE_ORDER, profileOf, downrangeAt, greatCircleM,
    ORBITAL_PHASES, SUBORBITAL_PHASES, SUB_APOGEE_M, SUB_AERO_LOSS,
    COUNTDOWN_S,
    RAIL_LEN_M, RAIL_EXIT_MS, MAXQ_START_M, MAXQ_END_M, IGNITION_M, KARMAN_M,
    KESSLER_IN_M, KESSLER_OUT_M, DOCK_M,
    INTEGRITY_START, INTEGRITY_FLOOR, AERO_LOSS, KESSLER_DECAY, FIRST_PLATE_AT,
    TAPE_KNEE_M, TAPE_TOP_M,
    phaseAt, altitudeAt, verticalSpeedAt, integrityAt, hazardSeverity,
    tapeFraction, airDensity,
  };

  // ==========================================================================
  // The two launch sites
  //
  // Geography is real: the latitude tilts the Earth model under the vehicle
  // and sets where the sun sits, and the world-map tile is what the "nearest
  // pad" default is measured against. Everything else is palette - the two
  // pads are meant to be recognisable at a glance from the colour of the
  // ground and the shape of what stands next to the rail.
  // ==========================================================================

  const SITES = {
    // i18n-ignore-start  site ids and hex palettes, never displayed
    taranto: {
      id: "taranto",
      lat: 40.47, lon: 17.24,
      world: { x: 151, y: 200 },
      ground: 0x6b6242, groundLo: 0x443f2c,
      sea: 0x16455e, seaLo: 0x0a2333,
      town: 0xd8cfb6, townLit: 0xffd98a,
      rail: 0x8d8574, coil: 0x4fd6ff,
      // The steelworks: four stacks, and they are lit all night.
      stacks: 4, stackHeight: 190, domes: 0,
      hazeWarm: 0.85,
      meridian: false,
    },
    greenwich: {
      id: "greenwich",
      lat: 51.48, lon: 0.0,
      world: { x: 66, y: 112 },
      ground: 0x3f4a35, groundLo: 0x26301f,
      sea: 0x2b3a3f, seaLo: 0x141e22,
      town: 0x7a4238, townLit: 0xcfe0ff,
      rail: 0x7b8290, coil: 0x7dff9e,
      // The observatory: two domes, no stacks, and the meridian laser due
      // north, which is the one thing about this pad nobody ever forgets.
      stacks: 0, stackHeight: 0, domes: 2,
      hazeWarm: 0.35,
      meridian: true,
    },
    // i18n-ignore-end
  };

  const SITE_ORDER = ["taranto", "greenwich"];   // i18n-ignore  site ids

  // ==========================================================================
  // WHERE A FLIGHT PUTS THE PARTY.  Edit these and nothing else.
  // ==========================================================================
  //
  // ORBITAL_ARRIVAL is the starship interior, the helm tile, facing up - the
  // same place GalaxySim's own "fly here" lands on.
  //
  // SUBORBITAL_ARRIVAL is keyed by the pad the hop ARRIVES at. Give a mapId
  // and the tile on it, and the party walks out of the bullet there. Leave
  // mapId at 0 and the arrival falls back to the procedural world square the
  // pad stands on, which is what a pad with no hand-made map wants.
  //
  //   mapId  0 = use the world square at SITES[<id>].world
  //   x, y   the tile to arrive on
  //   dir    2 down, 4 left, 6 right, 8 up
  //
  const ORBITAL_ARRIVAL = { mapId: 721, x: 28, y: 10, dir: 8 };

  const SUBORBITAL_ARRIVAL = {
    // i18n-ignore-start  site ids
    taranto: { mapId: 0, x: 0, y: 0, dir: 2 },
    greenwich: { mapId: 0, x: 0, y: 0, dir: 2 },
    // i18n-ignore-end
  };

  // The far end of a hop is simply the pad that is not this one.
  function otherSite(id) {
    const i = SITE_ORDER.indexOf(id);
    return SITES[SITE_ORDER[(i + 1) % SITE_ORDER.length]];
  }

  function siteName(id) { return t("site." + id + ".name"); }
  function siteBlurb(id) { return t("site." + id + ".blurb"); }

  // Which pad the party is standing closest to on the world map. Only a
  // default for the selection screen - the player always gets the choice.
  function nearestSite() {
    let wx = 0, wy = 0;
    try {
      wx = $gameVariables.value(43) || 0;
      wy = $gameVariables.value(44) || 0;
    } catch (e) { /* no save loaded: fall through to the first pad */ }
    if (!wx && !wy) return SITE_ORDER[0];
    let best = SITE_ORDER[0], bestD = Infinity;
    SITE_ORDER.forEach((id) => {
      const s = SITES[id];
      const d = Math.pow(s.world.x - wx, 2) + Math.pow(s.world.y - wy, 2);
      if (d < bestD) { bestD = d; best = id; }
    });
    return best;
  }

  // ==========================================================================
  // The world, as it actually is right now
  //
  // Read once when the scene opens and held: the flight is a minute long and
  // the weather changing halfway up would repaint the sky mid-shot.
  // ==========================================================================

  function sampleEnvironment() {
    let hour = 10, minute = 0, season = "summer";   // i18n-ignore  season id
    try {
      const TD = window.TimeDateSystem;
      if (TD && typeof TD.getGameTimeMinutes === "function") {
        const dt = TD.getDateTimeFromMinutes(TD.getGameTimeMinutes());
        hour = Number(dt.hours);
        minute = Number(dt.mins);
      }
    } catch (e) { /* the clock is optional; noon is a fine pad */ }
    let weather = "none";   // i18n-ignore  weather id, matches WeatherSystem
    try {
      if (window.$gameWeather) {
        weather = String($gameWeather.currentWeatherType || "none");
        if (typeof $gameWeather.getSeason === "function") {
          season = String($gameWeather.getSeason()).toLowerCase();
        }
      }
    } catch (e) { /* likewise */ }

    const clock = hour + minute / 60;
    // Sun elevation as a plain cosine about local noon, deepened by latitude
    // later. Good enough to put the terminator in the right place and to
    // decide whether the pad floods are burning.
    const dayK = Math.cos(((clock - 12.5) / 12) * Math.PI);
    const night = dayK < -0.08;
    const golden = Math.abs(dayK) < 0.28;

    return {
      hour, minute, clock, season, weather, night, golden,
      dayK,
      wet: weather === "rain" || weather === "storm",
      storm: weather === "storm",
      snow: weather === "snow",
      light: clamp01(dayK * 0.5 + 0.5),
    };
  }

  // ==========================================================================
  // Audio. Every cue is a file the game already ships; nothing new is added
  // to audio/se for this.
  // ==========================================================================

  // i18n-ignore-start  filenames under audio/se
  const SE = {
    cursor: "Cursor2", select: "Decision1", back: "Cancel1",
    tick: "Cursor1", tickLow: "Bell3", zero: "Buzzer1",
    charge: "Neon", coilRing: "Laser1", release: "Launch",
    boom: "Thunder5", wind: "Wind7", gale: "Wind11",
    ignite: "Fire3", burn: "Explosion1", rumble: "Earth4",
    radio: "Transceiver", computer: "Computer",
    hitLight: ["metal_01", "metal_02", "metal_03"],
    hitHeavy: ["Break", "Crash", "Collapse2"],
    tear: "Collapse4", klaxon: "Siren", alarm: "Buzzer3",
    lightning: "Thunder1", rain: "Water2",
    clamp: "Gate1", airlock: "Autodoor", aboard: "Chime1",
    power: "Powerup", flash: "Flash",
  };
  // i18n-ignore-end

  // The music.
  //
  // A launch is the one time the map's own theme is wrong, so the cinematic
  // takes the BGM over for its whole run and hands it back. Each beat is a
  // POOL rather than a track: the orbital flight is three different films - a
  // machine doing something enormous, then being shredded by junk, then the
  // cold of arriving - and a player who launches twenty times should not hear
  // the same three every time. The hop is one piece of infrastructure doing
  // its job and gets one pool, with nothing in it the orbital flight can play.
  // i18n-ignore-start  filenames under audio/bgm
  const BGM = {
    // Big orchestral openings. The gun is a kilometre of coil about to do
    // something irreversible and the music is allowed to say so.
    launch: [
      "KevinMacLeod/Dramatic/Ascending the Vale",
      "KevinMacLeod/Dramatic/Sovereign",
      "KevinMacLeod/Dramatic/Mountain Emperor",
      "KevinMacLeod/Dramatic/Past the Edge",
      "KevinMacLeod/Dramatic/Impact Prelude",
      "KevinMacLeod/Dramatic/Despair and Triumph",
      "KevinMacLeod/Dramatic/The Pyre",
      "KevinMacLeod/Dramatic/Magistar",
    ],
    // Mechanical dread. Nothing in here has a tune you could hum.
    belt: [
      "KevinMacLeod/Horror/Nightmare Machine",
      "KevinMacLeod/Horror/Unseen Horrors",
      "KevinMacLeod/Horror/The Descent",
      "KevinMacLeod/Horror/Land of Phantoms",
      "KevinMacLeod/Atmospheric/Gloom Horizon",
      "KevinMacLeod/Atmospheric/Distant Tension",
    ],
    // Cold, vast, and not quite relief.
    arrival: [
      "KevinMacLeod/Atmospheric/Frozen Star",
      "KevinMacLeod/Atmospheric/Floating Cities",
      "KevinMacLeod/Atmospheric/Interloper",
      "KevinMacLeod/Atmospheric/Bathed in the Light",
      "KevinMacLeod/Dramatic/Reawakening",
    ],
    // The hop: a timetable, not an epic.
    hop: [
      "KevinMacLeod/Dramatic/Industrial Cinematic",
      "KevinMacLeod/Dramatic/Impact Lento",
      "KevinMacLeod/Techno/Space Fighter Loop",
      "KevinMacLeod/Techno/Static Motion",
      "KevinMacLeod/Techno/Volatile Reaction",
    ],
  };
  // i18n-ignore-end

  // What each pool played last, so two launches in a row never open on the
  // same track. With one entry left to choose from this is a no-op, which is
  // why every pool has more than two.
  const _lastTrack = {};

  function pickTrack(pool) {
    const list = BGM[pool];
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    const avoid = _lastTrack[pool];
    const choices = list.filter((n) => n !== avoid);
    const picked = choices[Math.floor(Math.random() * choices.length)] || list[0];
    _lastTrack[pool] = picked;
    return picked;
  }

  function bgm(pool, volume, pitch) {
    const name = pickTrack(pool);
    if (!name) return null;
    try {
      AudioManager.playBgm({
        name,
        volume: clamp(Math.round(volume == null ? 90 : volume), 0, 100),
        pitch: clamp(Math.round(pitch == null ? 100 : pitch), 50, 150),
        pan: 0,
      });
    } catch (e) { /* a missing track must never take the cinematic down */ }
    return name;
  }

  function se(name, volume, pitch, pan) {
    if (!name) return;
    const pick = Array.isArray(name) ? name[Math.floor(Math.random() * name.length)] : name;
    try {
      AudioManager.playSe({
        name: pick,
        volume: clamp(Math.round(volume == null ? 80 : volume), 0, 100),
        pitch: clamp(Math.round(pitch == null ? 100 : pitch), 50, 150),
        pan: clamp(Math.round(pan || 0), -100, 100),
      });
    } catch (e) { /* a missing cue must never take the cinematic down */ }
  }

  // ==========================================================================
  // The stage
  //
  // TWO scenes, one canvas. The near scene is in metres and holds the pad, the
  // vehicle, the debris and the starship; the far scene holds the Earth, the
  // sun and the stars and is rendered first, without depth, at a compressed
  // distance. That is the only way a 1200 m rail and a 6371 km planet can
  // share a frame without the depth buffer collapsing.
  //
  // The vehicle never moves. The world falls past it - the ground drops, the
  // Earth swells, the belt sweeps by - which keeps every float in the near
  // scene small no matter how high the altimeter reads.
  // ==========================================================================

  const EARTH_R_M = 6371000;
  const EARTH_VIS_R = 60;          // far-scene units for one Earth radius
  // Scene metres the whole ground track is squeezed into. Both pads are only
  // ever visible in the first and last few percent of it, so all this number
  // has to do is carry them out of shot at a believable rate.
  const DOWNRANGE_VIS_M = 900000;
  // How far the far camera is tilted down, at full orbital altitude, to put the
  // planet in the frame. See _updateCamera for where the number comes from.
  const FAR_TILT = 0.55;

  // NO retro look here, and it is not a style choice.
  //
  // PSXShader.render draws into a low-res target and then blits it back as an
  // OPAQUE full-screen quad. Called twice - once for the far scene and once for
  // the near one - the second blit paints clean over the first, which erased
  // the Earth every frame. GalaxySim is exempt from the retro look anyway (see
  // RetroShader.NONE), and this scene borrows GalaxySim's own Earth and
  // starship, so both passes are rendered plainly and the two agree.

  class LaunchStage {
    constructor(width, height, site, env, profile, destSite) {
      this._w = Math.max(160, Math.floor(width));
      this._h = Math.max(120, Math.floor(height));
      this.site = site;
      this.env = env;
      this.profile = profile || PROFILES.orbital;
      // Only the suborbital hop has somewhere to land; the orbital flight's
      // destination is a ship, and it is built by _buildShip.
      this.destSite = this.profile.downrange ? (destSite || otherSite(site.id)) : null;
      this.trackM = this.destSite ? greatCircleM(site, this.destSite) : 0;
      this.downrange = 0;
      this.downrangeZ = 0;
      this.rng = makeRng(hashOf(site.id) ^ 0x5eed);
      this._disposables = [];
      this._time = 0;
      this.alt = 0;
      this.integrity = INTEGRITY_START;
      this.shake = 0;
      this.roll = 0;
      this.impactFlash = 0;

      this._initThree();
      {
        this._buildFar();
        this._buildSky();
        this._buildPad();
        if (this.destSite) this._buildArrivalPad();
        this._buildVehicle();
        if (this.profile.belt) this._buildBelt();
        if (!this.profile.downrange) this._buildShip();
        this._buildParticles();
      }
      this.update(0, 0);
    }

    get domElement() { return this.renderer.domElement; }

    // --- plumbing ---------------------------------------------------------

    _initThree() {
      this.near = new THREE.Scene();
      this.far = new THREE.Scene();

      this.camera = new THREE.PerspectiveCamera(55, this._w / this._h, 0.4, 260000);
      this.farCamera = new THREE.PerspectiveCamera(55, this._w / this._h, 1, 20000);

      this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this._w, this._h);
      this.renderer.autoClear = false;
      this.renderer.setClearColor(0x000308, 1);

      // The sun. One directional light shared by both scenes, aimed from the
      // hour of the day; the ambient is the sky bouncing back off the ground
      // and dies with the atmosphere.
      this.sun = new THREE.DirectionalLight(0xfff0dc, 1.0);
      this.ambient = new THREE.AmbientLight(0x6f86a8, 0.5);
      this.near.add(this.sun, this.ambient);
      this.farSun = new THREE.DirectionalLight(0xfff4e2, 1.35);
      this.farAmbient = new THREE.AmbientLight(0x2a3550, 0.22);
      this.far.add(this.farSun, this.farAmbient);

      // The vehicle's own lights: the plume when it burns, and the strobe that
      // comes on the moment the belt starts hitting it.
      this.plumeLight = new THREE.PointLight(0xffb45a, 0, 900, 2);
      this.plumeLight.position.set(0, -14, 0);
      this.near.add(this.plumeLight);
      this.warnLight = new THREE.PointLight(0xff2a1e, 0, 220, 2);
      this.warnLight.position.set(0, 4, 0);
      this.near.add(this.warnLight);
    }

    _track(o) { this._disposables.push(o); return o; }
    _geo(g) { this._disposables.push(g); return g; }
    _mat(m) { this._disposables.push(m); return m; }

    _phong(opts) { return this._mat(new THREE.MeshPhongMaterial(opts)); }
    _basic(opts) { return this._mat(new THREE.MeshBasicMaterial(opts)); }

    _tex(w, h, draw, repeatX, repeatY) {
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      draw(cv.getContext("2d"), w, h);
      const tx = new THREE.CanvasTexture(cv);
      tx.magFilter = THREE.NearestFilter;
      tx.minFilter = THREE.NearestFilter;
      tx.generateMipmaps = false;
      if (repeatX || repeatY) {
        tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
        tx.repeat.set(repeatX || 1, repeatY || 1);
      }
      this._disposables.push(tx);
      return tx;
    }

    dispose() {
      this._disposables.forEach((d) => { try { d.dispose && d.dispose(); } catch (e) { /* already gone */ } });
      this._disposables.length = 0;
      if (this.earthBody && this._r3d) {
        try { this._r3d.disposeBodyGroup(this.earthBody); } catch (e) { /* not ours to keep */ }
      }
      if (this.shipModel) { try { this.shipModel.dispose(); } catch (e) { /* idem */ } }
      try {
        if (window.PSXShader && window.PSXShader.disposeContext) {
          window.PSXShader.disposeContext(this.renderer);
        }
        this.renderer.dispose();
        this.renderer.forceContextLoss();
      } catch (e) { /* the context is going away regardless */ }
    }

    // --- the far scene: Earth, sun, stars ---------------------------------

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
      let body = null;
      if (R3D && typeof R3D.buildPlanetGroup === "function") {
        try {
          body = R3D.buildPlanetGroup(this._earthData(), 1);
        } catch (e) { body = null; }
      }
      if (body) {
        this.earthBody = body;
        body.scale.setScalar(EARTH_VIS_R);
        body.visible = false;
        holder.add(body);
      }

      const geo = this._geo(new THREE.SphereGeometry(EARTH_VIS_R, 64, 48));
      const mat = this._phong({ map: this._paintEarth(), shininess: 14, specular: 0x223344 });
      this.earthFallback = new THREE.Mesh(geo, mat);
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
      const lightGeo = this._geo(new THREE.SphereGeometry(EARTH_VIS_R * 1.002, 48, 32));
      this.cityLights = new THREE.Mesh(lightGeo, this._mat(new THREE.MeshBasicMaterial({
        map: this._paintCityLights(),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })));
      holder.add(this.cityLights);

      // The limb: a thin shell of atmosphere seen edge-on from outside, which
      // is the single thing that sells an orbital shot.
      const limbGeo = this._geo(new THREE.SphereGeometry(EARTH_VIS_R * 1.022, 48, 32));
      this.limb = new THREE.Mesh(limbGeo, this._basic({
        color: 0x5aa8ff, transparent: true, opacity: 0.0,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      holder.add(this.limb);

      // The site is a lit speck on the surface, so the player can watch the
      // pad they just left go over the horizon. Brighter in the dark, because
      // at night a launch site is the brightest thing for fifty kilometres.
      const markGeo = this._geo(new THREE.SphereGeometry(EARTH_VIS_R * 0.008, 6, 5));
      this.siteMark = new THREE.Mesh(markGeo, this._basic({ color: this.site.coil }));
      this.siteMark.position.set(0, EARTH_VIS_R * 1.004, 0);
      holder.add(this.siteMark);

      this.far.add(this._buildStarfield());
    }

    // Is GalaxySim's photograph of the Earth decoded yet? Until it is, the
    // painted stand-in stands in.
    _earthMapReady() {
      if (!this.earthBody) return false;
      const r = this._r3d;
      if (!r) return true;
      return !(r._solTexPending > 0);
    }

    // The planet record GalaxySim's renderer wants. Named Earth so the real
    // surface map is the one that gets picked up.
    _earthData() {
      const sol = this._solSystem();
      const earth = sol && (sol.planets || []).find((p) => p.name === "Earth");   // i18n-ignore  body id
      if (earth) return earth;
      return { name: "Earth", type: "terrestrial", color: "#3b6fa8", radius: 1, atmosphere: true };   // i18n-ignore  body id / type
    }

    _solSystem() {
      try {
        const dm = window.GalaxySim && window.GalaxySim.getDataManager && window.GalaxySim.getDataManager();
        return dm && dm.getSystem("Sol");   // i18n-ignore  system id
      } catch (e) { return null; }
    }

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
    }

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
    }

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
    }

    // --- the sky ----------------------------------------------------------

    _buildSky() {
      // An inverted dome painted from the hour and the weather, faded out as
      // the air runs out. Above ~90 km it is gone and the far scene's stars
      // are all that is left.
      const geo = this._geo(new THREE.SphereGeometry(40000, 32, 24));
      this.skyMat = this._basic({
        map: this._paintSky(), side: THREE.BackSide, depthWrite: false, fog: false,
      });
      this.sky = new THREE.Mesh(geo, this.skyMat);
      this.near.add(this.sky);

      // The cloud deck: a stack of translucent discs the vehicle punches
      // through on the way up. Thicker and lower in bad weather.
      const decks = this.env.storm ? 5 : this.env.wet ? 4 : this.env.snow ? 4 : 3;
      this.cloudDeck = new THREE.Group();
      this.clouds = [];
      const cloudTex = this._paintClouds();
      for (let i = 0; i < decks; i++) {
        const alt = 900 + i * (this.env.storm ? 900 : 1500);
        const mat = this._mat(new THREE.MeshBasicMaterial({
          map: cloudTex, transparent: true, opacity: 0.0,
          depthWrite: false, side: THREE.DoubleSide, fog: false,
        }));
        const m = new THREE.Mesh(this._geo(new THREE.PlaneGeometry(26000, 26000, 1, 1)), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = alt;
        m.userData.deckAlt = alt;
        this.cloudDeck.add(m);
        this.clouds.push(m);
      }
      this.near.add(this.cloudDeck);
    }

    _paintSky() {
      const e = this.env;
      const site = this.site;
      return this._tex(64, 128, (ctx, w, h) => {
        // Zenith at the top of the canvas, horizon at the bottom, because the
        // dome is mapped v=1 at the pole.
        const g = ctx.createLinearGradient(0, 0, 0, h);
        if (e.night) {
          g.addColorStop(0, "#030512");
          g.addColorStop(0.55, "#071024");
          g.addColorStop(0.88, e.storm ? "#141a26" : "#12203a");
          g.addColorStop(1, e.storm ? "#1c2230" : "#2a3550");
        } else if (e.golden) {
          g.addColorStop(0, "#1b3a6b");
          g.addColorStop(0.45, "#5d6fa0");
          g.addColorStop(0.78, site.hazeWarm > 0.6 ? "#d98a4e" : "#b2795f");
          g.addColorStop(1, site.hazeWarm > 0.6 ? "#f6c073" : "#d9a487");
        } else if (e.storm) {
          g.addColorStop(0, "#26303c");
          g.addColorStop(0.6, "#3c4652");
          g.addColorStop(1, "#5b6470");
        } else if (e.wet || e.snow) {
          g.addColorStop(0, "#4a5a6e");
          g.addColorStop(0.6, "#74838f");
          g.addColorStop(1, "#9aa6ad");
        } else {
          g.addColorStop(0, "#1d4f96");
          g.addColorStop(0.5, "#5c93cc");
          g.addColorStop(0.85, "#a8c8e2");
          g.addColorStop(1, site.hazeWarm > 0.6 ? "#e2ddc4" : "#cdd8de");
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        if (e.night) {
          const r = makeRng(0x7a11);
          for (let i = 0; i < 180; i++) {
            const y = r() * h * 0.9;
            ctx.fillStyle = "rgba(255,255,255," + (0.25 + r() * 0.6).toFixed(2) + ")";
            ctx.fillRect(Math.floor(r() * w), Math.floor(y), 1, 1);
          }
        }
      });
    }

    _paintClouds() {
      return this._tex(256, 256, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const r = makeRng(0x1c0d);
        const dark = this.env.storm ? 120 : this.env.wet ? 170 : 235;
        for (let i = 0; i < 260; i++) {
          const cx = r() * w, cy = r() * h;
          const rad = 8 + r() * 46;
          const a = 0.05 + r() * 0.2;
          const v = Math.floor(dark * (0.8 + r() * 0.2));
          ctx.fillStyle = "rgba(" + v + "," + v + "," + Math.floor(v * 1.02) + "," + a.toFixed(2) + ")";
          ctx.beginPath();
          ctx.ellipse(cx, cy, rad, rad * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }, 6, 6);
    }

    // --- the pad ----------------------------------------------------------

    _buildPad(forSite, opts) {
      const s = forSite || this.site;
      const o = opts || {};
      const e = this.env;
      const g = new THREE.Group();
      if (!o.arrival) this.pad = g;
      this.near.add(g);

      const lightK = e.night ? 0.22 : e.storm ? 0.55 : e.wet ? 0.7 : 1;
      const tint = (hex) => new THREE.Color(hex).multiplyScalar(lightK).getHex();

      // Ground: a big disc rather than a plane, so the edge of the world is a
      // horizon and not a visible seam when the camera swings.
      const ground = new THREE.Mesh(
        this._geo(new THREE.CircleGeometry(24000, 48)),
        this._phong({ map: this._paintGround(s), color: tint(0xffffff), shininess: 2 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.5;
      g.add(ground);

      // The sea, on one side only: both pads are coastal and the water is
      // half of what tells them apart from the air.
      const sea = new THREE.Mesh(
        this._geo(new THREE.PlaneGeometry(48000, 24000, 1, 1)),
        this._phong({
          color: tint(s.sea), shininess: 90, specular: 0x6f9ec0,
          transparent: true, opacity: 0.93,
        })
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, -0.2, -13000);
      this.sea = sea;
      g.add(sea);

      // BOTH ends of a hop are the same installation. The far pad is not a
      // landing strip with a cradle on it: it is the other coilgun, and the
      // round is caught by running it in reverse. So the same barrel is built
      // either way and only the approach lighting differs.
      const rail = this._buildRail(g, s, o.arrival);
      if (o.arrival) this.railB = rail; else this.railA = rail;
      this._buildTown(g, s);
      this._buildFloodlights(g);
      if (s.meridian) this._buildMeridian(g);
      return g;
    }

    // The approach lighting on a receiving gun: an apron of scorched concrete
    // and a ring of lamps round the MUZZLE, a kilometre up, which is the only
    // part of it the arriving round needs to be able to find.
    _buildApproach(g, top) {
      const concrete = this._phong({ color: 0x7e7c74, shininess: 4 });
      const scorch = new THREE.Mesh(
        this._geo(new THREE.CircleGeometry(150, 24)),
        this._basic({ color: 0x14100e })
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.y = 0.4;
      g.add(scorch);
      const apron = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(168, 180, 8, 20)), concrete);
      apron.position.y = -4;
      g.add(apron);

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
    }

    _buildArrivalPad() {
      this.padB = this._buildPad(this.destSite, { arrival: true });
      this.padB.visible = false;
    }

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
    }

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
    _buildRail(into, forSite, arrival) {
      const s = forSite || this.site;
      const g = new THREE.Group();
      (into || this.pad).add(g);

      const H = RAIL_LEN_M;
      const BORE = 34;          // ring inner radius: the bullet is 3
      const LEG = 46;           // corner legs, well outboard of the bore
      const mastMat = this._phong({ color: s.rail, shininess: 20, specular: 0x555a63 });
      const concrete = this._phong({ color: 0x8d8b82, shininess: 4 });
      const darkMat = this._phong({ color: 0x33373d, shininess: 14, specular: 0x555a63 });

      // --- the foundation: a poured block a hundred and thirty metres across
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

      // --- the capacitor halls. Twelve of them, ringing the foot, and they
      // are where the energy for the shot has been accumulating all night.
      const capacitors = [];
      const capGeo = this._geo(new THREE.CylinderGeometry(19, 22, 76, 12));
      const trunkGeo = this._geo(new THREE.CylinderGeometry(3.4, 3.4, 240, 6));
      for (let i = 0; i < 12; i++) {
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
      const legGeo = this._geo(new THREE.CylinderGeometry(6.5, 9.5, H, 8));
      [[-LEG, -LEG], [LEG, -LEG], [-LEG, LEG], [LEG, LEG]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, mastMat);
        leg.position.set(x, H / 2 + 80, z);
        g.add(leg);
      });
      const bayH = 52;
      const braceGeo = this._geo(new THREE.BoxGeometry(LEG * 2, 3.2, 3.2));
      const diagGeo = this._geo(new THREE.BoxGeometry(Math.hypot(LEG * 2, bayH), 2.4, 2.4));
      for (let y = 80; y < H + 80; y += bayH) {
        for (let face = 0; face < 4; face++) {
          const a = (face / 4) * Math.PI * 2;
          const ring = new THREE.Mesh(braceGeo, mastMat);
          ring.position.set(Math.cos(a) * LEG, y, Math.sin(a) * LEG);
          ring.rotation.y = -a + Math.PI / 2;
          g.add(ring);
          const dia = new THREE.Mesh(diagGeo, mastMat);
          dia.position.set(Math.cos(a) * LEG, y + bayH / 2, Math.sin(a) * LEG);
          dia.rotation.y = -a + Math.PI / 2;
          dia.rotation.z = ((y / bayH) % 2 ? 1 : -1) * Math.atan2(bayH, LEG * 2);
          g.add(dia);
        }
      }

      // --- the rings. Fifty of them up the bore, each a slab of laminated
      // iron the size of a house with the coil wound inside it.
      const coilRings = [];
      const RINGS = 50;
      const ringGeo = this._geo(new THREE.TorusGeometry(BORE, 7.2, 8, 22));
      const yokeGeo = this._geo(new THREE.BoxGeometry(BORE * 2.5, 5, 5));
      for (let i = 0; i < RINGS; i++) {
        const y = 86 + (i / (RINGS - 1)) * (H - 40);
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
        this._geo(new THREE.CylinderGeometry(52, 68, 96, 14)),
        darkMat
      );
      breech.position.y = 44;
      g.add(breech);
      const throat = new THREE.Mesh(
        this._geo(new THREE.CylinderGeometry(BORE * 0.55, BORE * 0.9, 60, 16, 1, true)),
        this._mat(new THREE.MeshPhongMaterial({ color: 0x14171c, side: THREE.DoubleSide, shininess: 30 }))
      );
      throat.position.y = 62;
      g.add(throat);

      // Obstruction strobes, up the whole tower. On at night and in the murk,
      // and they are what gives the thing its height at a glance.
      const strobes = [];
      const strobeGeo = this._geo(new THREE.SphereGeometry(3.4, 6, 5));
      for (let i = 0; i < 9; i++) {
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
      const tower = new THREE.Mesh(this._geo(new THREE.BoxGeometry(26, 460, 26)), gantryMat);
      tower.position.set(128, 310, 0);
      gantry.add(tower);
      const armGeo = this._geo(new THREE.BoxGeometry(96, 9, 22));
      [140, 260, 400, 520].forEach((y) => {
        const arm = new THREE.Mesh(armGeo, gantryMat);
        arm.position.set(80, y, 0);
        gantry.add(arm);
      });
      // A gun that is expecting a round rather than sending one has its gantry
      // already parked clear, and wears the approach lighting instead.
      if (arrival) { gantry.rotation.y = 1.4; gantry.position.x = 90; }
      g.add(gantry);

      const top = 86 + (H - 40);
      if (arrival) this._buildApproach(g, top);

      return { group: g, rings: coilRings, capacitors, gantry, strobes, top };
    }

    // The skyline: a low sprawl of lit boxes, plus whatever each pad is known
    // for standing next to.
    _buildTown(into, forSite) {
      const s = forSite || this.site;
      const e = this.env;
      const g = new THREE.Group();
      this.town = g;
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
    }

    // The floods. On in the dark and in bad weather, and they are what makes
    // the vehicle readable on the pad before anything has happened.
    _buildFloodlights(into) {
      const host = into || this.pad;
      const on = this.env.night || this.env.storm || this.env.wet;
      this.floods = this.floods || [];
      if (!on) return;
      const mastMat = this._phong({ color: 0x4a4f57, shininess: 8 });
      const lampMat = this._basic({ color: 0xfff2cf });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const d = 330;
        const h = 120;
        const mast = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(2.6, 4.4, h, 6)), mastMat);
        mast.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
        host.add(mast);
        const lamp = new THREE.Mesh(this._geo(new THREE.BoxGeometry(16, 7, 5)), lampMat);
        lamp.position.set(mast.position.x, h, mast.position.z);
        lamp.lookAt(0, 120, 0);
        host.add(lamp);
        const L = new THREE.PointLight(0xffe9bf, 1.7, 1400, 2);
        L.position.set(mast.position.x, h, mast.position.z);
        host.add(L);
        this.floods.push(L);
      }
    }

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
    }

    // --- the vehicle ------------------------------------------------------

    // A heavy armoured bullet: an ogive nose, a straight body, a driving band
    // at the base where the rail grips it, and ARMOUR BELTS - rings of
    // separate plates wrapped round the body. The plates are the health bar
    // made physical. Each carries the integrity percentage below which it
    // tears off, so the vehicle that arrives at the starship is exactly as
    // bare as the HUD says it is.
    _buildVehicle() {
      const g = new THREE.Group();
      this.vehicle = g;
      this.near.add(g);

      const BODY_R = 3.0;
      const BODY_L = 16;
      this.bodyR = BODY_R;

      const steel = this._phong({
        map: this._paintHull(), bumpMap: this._paintHullBump(), bumpScale: 0.05,
        shininess: 42, specular: 0x8d949e,
      });
      const core = this._phong({ color: 0x2a2d33, shininess: 18, specular: 0x555a63 });

      // The ogive. A lathe, because a bullet nose is a radius and not a cone.
      const pts = [];
      const OG = 9.5;
      for (let i = 0; i <= 14; i++) {
        const k = i / 14;
        const y = k * OG;
        const rad = BODY_R * Math.sqrt(Math.max(0, 1 - Math.pow(k, 2.1)));
        pts.push(new THREE.Vector2(Math.max(0.12, rad), y));
      }
      // Its own copy of the hull material, because the nose is the only part
      // the air heats and a shared material would light the whole vehicle up.
      const noseMat = this._mat(steel.clone());
      noseMat.emissive = new THREE.Color(0x000000);
      const nose = new THREE.Mesh(
        this._geo(new THREE.LatheGeometry(pts.reverse(), 18)),
        noseMat
      );
      nose.position.y = BODY_L / 2;
      g.add(nose);
      this.nose = nose;

      // The nose cap glows when the air is doing its work.
      this.noseGlow = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(BODY_R * 0.55, 12, 8)),
        this._basic({ color: 0xff7a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      this.noseGlow.position.y = BODY_L / 2 + OG * 0.75;
      g.add(this.noseGlow);

      const body = new THREE.Mesh(
        this._geo(new THREE.CylinderGeometry(BODY_R, BODY_R, BODY_L, 18, 1, true)),
        steel
      );
      g.add(body);
      const inner = new THREE.Mesh(
        this._geo(new THREE.CylinderGeometry(BODY_R * 0.82, BODY_R * 0.82, BODY_L * 1.02, 14)),
        core
      );
      g.add(inner);
      this.hullCore = inner;

      // The driving band: soft metal, and the only part the rail touches.
      const band = new THREE.Mesh(
        this._geo(new THREE.CylinderGeometry(BODY_R * 1.12, BODY_R * 1.12, 2.0, 18)),
        this._phong({ color: 0xb08a3c, shininess: 80, specular: 0xffe9a8 })
      );
      band.position.y = -BODY_L / 2 + 2.4;
      g.add(band);

      // The base: the motor that does not light until the air is gone.
      const base = new THREE.Mesh(
        this._geo(new THREE.CylinderGeometry(BODY_R * 0.96, BODY_R * 0.62, 3.4, 18)),
        this._phong({ color: 0x1b1d22, shininess: 24, specular: 0x444a55 })
      );
      base.position.y = -BODY_L / 2 - 1.7;
      g.add(base);
      const throat = new THREE.Mesh(
        this._geo(new THREE.ConeGeometry(BODY_R * 0.66, 3.0, 16, 1, true)),
        this._mat(new THREE.MeshBasicMaterial({ color: 0x120c0a, side: THREE.DoubleSide }))
      );
      throat.position.y = -BODY_L / 2 - 3.6;
      g.add(throat);

      this._buildArmour(BODY_R, BODY_L);
      this._buildFins(BODY_R, BODY_L);
      this._buildPlume(BODY_R, BODY_L);
    }

    _buildArmour(R, L) {
      this.plates = [];
      const BELTS = 7;
      const PER_BELT = 10;
      // Thresholds are spread across the whole damage range, densest near the
      // end: the last plates come off one at a time and slowly, which is what
      // makes the traversal feel like attrition rather than an explosion.
      const total = BELTS * PER_BELT;
      const plateGeo = this._geo(new THREE.BoxGeometry(1, 1, 1));
      const plateMats = [
        this._phong({ color: 0x565d68, shininess: 34, specular: 0x9aa2ad }),
        this._phong({ color: 0x4a515b, shininess: 30, specular: 0x8d949e }),
        this._phong({ color: 0x61686f, shininess: 40, specular: 0xa6aeb8 }),
      ];
      let n = 0;
      for (let b = 0; b < BELTS; b++) {
        const y = -L / 2 + 2.0 + (b + 0.5) * ((L - 3.0) / BELTS);
        for (let i = 0; i < PER_BELT; i++) {
          const a = (i / PER_BELT) * Math.PI * 2 + b * 0.16;
          const p = new THREE.Mesh(plateGeo, plateMats[(b + i) % plateMats.length]);
          const th = 0.55;
          p.position.set(Math.cos(a) * (R + th / 2), y, Math.sin(a) * (R + th / 2));
          p.scale.set(th, (L - 3.0) / BELTS - 0.35, (2 * Math.PI * R) / PER_BELT - 0.3);
          p.rotation.y = -a;
          // A geometric spread from 88% down to just above the floor: the
          // curve of integrityAt is exponential, so the thresholds are too.
          const k = n / (total - 1);
          p.userData.threshold = INTEGRITY_FLOOR + 0.55 + (88 - INTEGRITY_FLOOR) * Math.pow(1 - k, 2.3);
          // k = 0 is FIRST_PLATE_AT exactly; the test pins the two together.
          p.userData.spin = new THREE.Vector3(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).multiplyScalar(6);
          p.userData.vel = null;
          this.vehicle.add(p);
          this.plates.push(p);
          n++;
        }
      }
      // Torn off, a plate keeps flying with the vehicle for a moment before it
      // is left behind, so this list is walked every frame.
      this.shed = [];
    }

    _buildFins(R, L) {
      const finMat = this._phong({ color: 0x4f545c, shininess: 26, specular: 0x8d949e });
      this.fins = [];
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(4.6, -1.1);
      shape.lineTo(4.2, 2.6);
      shape.lineTo(0, 4.0);
      shape.lineTo(0, 0);
      const geo = this._geo(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const f = new THREE.Mesh(geo, finMat);
        f.position.set(Math.cos(a) * R * 0.95, -L / 2 + 0.5, Math.sin(a) * R * 0.95);
        f.rotation.y = -a + Math.PI / 2;
        f.userData.threshold = 34 - i * 6;
        // Fins shed on the same rule as the plates, so they need the same
        // stored tumble: without it the shed loop reads a spin that is not
        // there the first time a fin comes off.
        f.userData.spin = new THREE.Vector3(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5)
          .multiplyScalar(9);
        this.vehicle.add(f);
        this.fins.push(f);
        this.plates.push(f);   // fins shed on the same rule as the plates
      }
    }

    _buildPlume(R, L) {
      this.plume = new THREE.Group();
      this.plume.position.y = -L / 2 - 3.2;
      this.vehicle.add(this.plume);

      // Three nested cones: the white core, the orange body, the mach diamonds.
      const mk = (rad, len, color, opacity) => {
        const m = new THREE.Mesh(
          this._geo(new THREE.ConeGeometry(rad, len, 14, 1, true)),
          this._mat(new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }))
        );
        m.rotation.x = Math.PI;
        m.position.y = -len / 2;
        this.plume.add(m);
        return m;
      };
      this.plumeCore = mk(R * 0.55, 16, 0xfff3d0, 0.0);
      this.plumeBody = mk(R * 0.95, 34, 0xff9b3a, 0.0);
      this.plumeHalo = mk(R * 1.7, 58, 0xff4a1a, 0.0);

      // Shock diamonds, only while there is still air to make them.
      this.diamonds = [];
      for (let i = 0; i < 5; i++) {
        const d = new THREE.Mesh(
          this._geo(new THREE.OctahedronGeometry(R * 0.34, 0)),
          this._mat(new THREE.MeshBasicMaterial({
            color: 0xcfe4ff, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }))
        );
        d.position.y = -5 - i * 5.5;
        d.scale.y = 1.7;
        this.plume.add(d);
        this.diamonds.push(d);
      }
    }

    _paintHull() {
      return this._tex(64, 128, (ctx, w, h) => {
        ctx.fillStyle = "#5b626c";
        ctx.fillRect(0, 0, w, h);
        const r = makeRng(0x9f21);
        for (let y = 0; y < h; y += 8) {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(0, y, w, 1);
        }
        for (let x = 0; x < w; x += 10) {
          ctx.fillStyle = "rgba(0,0,0,0.16)";
          ctx.fillRect(x, 0, 1, h);
        }
        for (let i = 0; i < 400; i++) {
          ctx.fillStyle = r() > 0.55 ? "rgba(255,255,255,0.07)" : "rgba(20,24,30,0.22)";
          ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1);
        }
        // Rivets down every seam.
        ctx.fillStyle = "rgba(200,206,214,0.5)";
        for (let y = 4; y < h; y += 8) {
          for (let x = 2; x < w; x += 10) ctx.fillRect(x, y, 1, 1);
        }
      }, 1, 2);
    }

    _paintHullBump() {
      return this._tex(64, 128, (ctx, w, h) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
        const r = makeRng(0x3e77);
        for (let y = 0; y < h; y += 8) {
          ctx.fillStyle = "#2a2a2a";
          ctx.fillRect(0, y, w, 1);
        }
        for (let i = 0; i < 260; i++) {
          ctx.fillStyle = r() > 0.5 ? "#c8c8c8" : "#3c3c3c";
          ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1);
        }
      }, 1, 2);
    }

    // --- the belt ---------------------------------------------------------

    // The Kessler layer is the frightening part of the flight and it is built
    // to be frightening: not a pretty ring seen from outside, but a shell the
    // vehicle is INSIDE, full of things too big to survive and moving too fast
    // to see coming. Three layers of it:
    //
    //   1. a fog of fragments, dense enough to grey out the Earth
    //   2. WRECKS - dead satellites, spent stages, torn solar wings - that
    //      tumble past close enough to fill the frame
    //   3. the hits themselves, which are not dodged and cannot be
    //
    // Everything streams DOWNWARD past a stationary vehicle, recycled through
    // a ring buffer, so the field is infinite and costs nothing.
    _buildBelt() {
      const g = new THREE.Group();
      this.belt = g;
      g.visible = false;
      this.near.add(g);

      // 1. The fog. GalaxySim already builds exactly this mesh for its own
      // Kessler cloud, so the debris in the cinematic is the same debris the
      // star map draws around Earth.
      // makeDebrisMesh hands back { mesh, geo, mat } - the bookkeeping the
      // caller has to dispose - and NOT the mesh itself. Taking the wrapper for
      // an Object3D adds nothing to the scene and then reads `.rotation` off a
      // plain object on the first frame in the belt.
      const R3D = window.GalaxySim && window.GalaxySim.Renderer3D;
      let built = null;
      if (R3D && typeof R3D.makeDebrisMesh === "function") {
        try {
          built = R3D.makeDebrisMesh({
            count: 900, rMin: 60, rMax: 520, flat: 1,
            sizeMin: 0.9, sizeMax: 5.5, seed: 0x4e55,
          });
        } catch (e) { built = null; }
      }
      const fog = built && built.mesh;
      if (fog && fog.isObject3D) {
        if (fog.material) { fog.material.transparent = true; fog.material.opacity = 0.9; }
        this._disposables.push(built.geo, built.mat);
        this.debrisFog = fog;
        g.add(fog);
      }

      // 2. The wrecks. Twenty of them in the buffer, each a different kind of
      // dead thing, each tumbling on its own axis.
      this.wrecks = [];
      for (let i = 0; i < 20; i++) {
        const w = this._buildWreck(i);
        this._resetWreck(w, true);
        g.add(w);
        this.wrecks.push(w);
      }

      // 3. The strike effects: a pool of sparks and a pool of gouge flashes,
      // reused so a heavy minute of impacts allocates nothing.
      this.sparks = [];
      const sparkGeo = this._geo(new THREE.BufferGeometry());
      const SP = 160;
      const spos = new Float32Array(SP * 3);
      sparkGeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
      this.sparkMat = this._mat(new THREE.PointsMaterial({
        color: 0xffd08a, size: 0.9, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.sparkPoints = new THREE.Points(sparkGeo, this.sparkMat);
      this.near.add(this.sparkPoints);
      for (let i = 0; i < SP; i++) {
        this.sparks.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
      }

      this.strikeFlash = new THREE.PointLight(0xffd6a0, 0, 90, 2);
      this.near.add(this.strikeFlash);
    }

    _buildWreck(i) {
      const r = this.rng;
      const kind = i % 4;
      const g = new THREE.Group();
      const metal = this._phong({ color: 0x6a7079, shininess: 30, specular: 0x9aa2ad });
      const foil = this._phong({ color: 0xc8a63a, shininess: 70, specular: 0xffe9a8 });
      const panel = this._phong({ color: 0x1b2a4a, shininess: 90, specular: 0x6f9ec0 });
      const scale = 1.6 + r() * 5.5;

      if (kind === 0) {
        // A satellite bus with its wings still on, mostly.
        const bus = new THREE.Mesh(this._geo(new THREE.BoxGeometry(2.2, 3.0, 2.2)), foil);
        g.add(bus);
        const wingGeo = this._geo(new THREE.BoxGeometry(9, 0.12, 2.6));
        for (let s = -1; s <= 1; s += 2) {
          if (r() < 0.25) continue;             // one wing already gone
          const w = new THREE.Mesh(wingGeo, panel);
          w.position.set(s * 5.6, 0, 0);
          w.rotation.z = (r() - 0.5) * 0.7;      // and the other one bent
          g.add(w);
        }
        const dish = new THREE.Mesh(this._geo(new THREE.SphereGeometry(1.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), metal);
        dish.rotation.x = Math.PI;
        dish.position.y = 2.0;
        g.add(dish);
      } else if (kind === 1) {
        // A spent upper stage: a tank with a bell still bolted to it.
        const tank = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(1.7, 1.7, 7.5, 10)), metal);
        g.add(tank);
        const bell = new THREE.Mesh(this._geo(new THREE.ConeGeometry(1.5, 2.6, 10, 1, true)),
          this._mat(new THREE.MeshPhongMaterial({ color: 0x33373d, side: THREE.DoubleSide, shininess: 20 })));
        bell.position.y = -5;
        g.add(bell);
        const ring = new THREE.Mesh(this._geo(new THREE.TorusGeometry(1.8, 0.2, 5, 12)), foil);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 3.6;
        g.add(ring);
      } else if (kind === 2) {
        // A torn solar wing on its own, end over end. The worst of them to
        // meet: broad, flat and edge-on until the last instant.
        const w = new THREE.Mesh(this._geo(new THREE.BoxGeometry(14, 0.1, 3.4)), panel);
        g.add(w);
        const spar = new THREE.Mesh(this._geo(new THREE.BoxGeometry(14.4, 0.3, 0.3)), metal);
        g.add(spar);
      } else {
        // A shapeless piece of something. Most of the belt is this.
        const geo = this._geo(new THREE.IcosahedronGeometry(1.6, 0));
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          const k = 0.55 + r() * 0.9;
          pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k * (0.6 + r()), pos.getZ(v) * k);
        }
        geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, metal));
      }
      g.scale.setScalar(scale);
      g.userData.spin = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(2.2);
      g.userData.scale = scale;
      return g;
    }

    // Wrecks come down the screen. `initial` scatters the first fill over the
    // whole column instead of dropping all twenty in at once.
    _resetWreck(w, initial) {
      const r = this.rng;
      // Most pass wide. A few - and the vehicle has no say in which - do not.
      const near = r() < 0.22;
      const rad = near ? 6 + r() * 16 : 30 + r() * 150;
      const a = r() * Math.PI * 2;
      w.position.set(Math.cos(a) * rad, initial ? (r() * 1400 - 400) : 700 + r() * 500, Math.sin(a) * rad);
      w.userData.fall = 190 + r() * 340;
      w.userData.drift = (r() - 0.5) * 24;
      w.userData.near = near;
      w.userData.announced = false;
    }

    // --- the starship -----------------------------------------------------

    _buildShip() {
      this.shipGroup = new THREE.Group();
      this.shipGroup.visible = false;
      this.near.add(this.shipGroup);

      const SM = window.GalaxySim && window.GalaxySim.ShipModel;
      if (SM && typeof SM.buildLive === "function") {
        try {
          // The party's own ship, the one the world seed picked and the one
          // the appearance editor has been changing all game.
          this.shipModel = SM.buildLive(120);
          this.shipGroup.add(this.shipModel.group);
        } catch (e) { this.shipModel = null; }
      }
      if (!this.shipModel) {
        // A hull good enough to dock with when GalaxySim is not loaded.
        const mat = this._phong({ color: 0x8d949e, shininess: 50, specular: 0xc8d0da });
        const body = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(9, 12, 110, 14)), mat);
        body.rotation.x = Math.PI / 2;
        this.shipGroup.add(body);
        const ring = new THREE.Mesh(this._geo(new THREE.TorusGeometry(22, 3.4, 8, 20)), mat);
        this.shipGroup.add(ring);
      }

      // The docking collar the bullet is aimed at, and the strip lights that
      // walk toward it during the approach.
      this.dockCollar = new THREE.Group();
      const collar = new THREE.Mesh(
        this._geo(new THREE.TorusGeometry(7.5, 1.6, 8, 18)),
        this._phong({ color: 0x3a4049, shininess: 40, specular: 0x9aa2ad })
      );
      collar.rotation.x = Math.PI / 2;
      this.dockCollar.add(collar);
      this.dockLights = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const L = new THREE.Mesh(
          this._geo(new THREE.BoxGeometry(1.1, 0.5, 1.1)),
          this._mat(new THREE.MeshBasicMaterial({ color: 0x2fe08a }))
        );
        L.position.set(Math.cos(a) * 7.5, 0, Math.sin(a) * 7.5);
        this.dockCollar.add(L);
        this.dockLights.push(L);
      }
      this.dockGlow = new THREE.PointLight(0x4fe0a0, 0, 160, 2);
      this.dockCollar.add(this.dockGlow);
      this.shipGroup.add(this.dockCollar);
    }

    // --- weather particles ------------------------------------------------

    // Rain, snow and the ash the pad throws up, all one point cloud recycled
    // through a box around the camera. Above the cloud deck it simply stops.
    _buildParticles() {
      const N = 900;
      const pos = new Float32Array(N * 3);
      this.motes = [];
      for (let i = 0; i < N; i++) {
        const p = {
          x: (this.rng() - 0.5) * 240,
          y: this.rng() * 200,
          z: (this.rng() - 0.5) * 240,
          v: 40 + this.rng() * 90,
        };
        this.motes.push(p);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      }
      const geo = this._geo(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const e = this.env;
      this.moteMat = this._mat(new THREE.PointsMaterial({
        color: e.snow ? 0xeaf2ff : 0x9fc4e8,
        size: e.snow ? 1.5 : 0.7,
        transparent: true, opacity: 0, depthWrite: false,
      }));
      this.moteField = new THREE.Points(geo, this.moteMat);
      this.near.add(this.moteField);

      // Lightning, for a storm launch. It fires from above the cloud deck and
      // it lights the whole pad white for two frames.
      this.bolt = new THREE.PointLight(0xdfe9ff, 0, 9000, 2);
      this.bolt.position.set(600, 2600, -900);
      this.near.add(this.bolt);
      this._boltTimer = 2 + this.rng() * 4;
    }

    // ======================================================================
    // The camera
    //
    // Every phase supplies a RIG: a point to look at, an orbit around it and a
    // field of view. The player's own input is an OFFSET on top of that rig
    // and it is never taken away again - yaw, pitch, distance and a pan on the
    // look-at point all persist through the cut to the next phase, so it is
    // possible to watch the whole flight from wherever the player wants,
    // including from underneath. The scripted rig keeps moving beneath the
    // offset, which is what stops a hand-held camera from losing the action.
    // ======================================================================

    // Yaw/pitch/dolly in the player's hands. dist is a multiplier on whatever
    // the current rig asked for, so pulling back at the pad is still pulled
    // back in the belt.
    _camUser() {
      if (!this._user) {
        this._user = { yaw: 0, pitch: 0, dist: 1, panX: 0, panY: 0, free: false };
      }
      return this._user;
    }

    applyLook(dYaw, dPitch) {
      const u = this._camUser();
      u.yaw += dYaw;
      u.pitch = clamp(u.pitch + dPitch, -1.35, 1.35);
      u.free = true;
    }

    applyZoom(k) {
      const u = this._camUser();
      u.dist = clamp(u.dist * k, 0.25, 6);
      u.free = true;
    }

    applyPan(dx, dy) {
      const u = this._camUser();
      const span = this._rigDist || 60;
      u.panX = clamp(u.panX + dx * span * 0.4, -span * 2, span * 2);
      u.panY = clamp(u.panY + dy * span * 0.4, -span * 2, span * 2);
      u.free = true;
    }

    recenter() {
      this._user = { yaw: 0, pitch: 0, dist: 1, panX: 0, panY: 0, free: false };
    }

    get isFreeLook() { return !!(this._user && this._user.free); }

    // The scripted rig for a moment in the flight. The vehicle is always at
    // the origin, so a target above it is a target up the barrel.
    _rig(time) {
      const ph = phaseAt(time, this.profile);
      const k = ph.progress;
      const T = this._tmpTarget || (this._tmpTarget = new THREE.Vector3());
      T.set(0, 0, 0);

      switch (ph.key) {
        case "hold":
          // A crane the length of the gun, from the head of the tower down to
          // the breech. It exists to establish the scale of the thing and
          // nothing else: a kilometre of barrel, and a round the size of a bus
          // sitting at the bottom of it.
          T.set(0, lerp(RAIL_LEN_M * 0.62, 40, smooth(k)), 0);
          return { target: T, yaw: -0.95 + k * 0.55, pitch: lerp(0.24, 0.05, smooth(k)), dist: lerp(2400, 340, smooth(k)), fov: 58 };
        case "countdown": {
          // Round the breech, tightening, while the banks come up behind it
          // and the rings light one bay at a time all the way to the sky.
          const spin = k * 2.0;
          return { target: T.set(0, lerp(120, 26, smooth(k)), 0), yaw: -0.4 + spin, pitch: lerp(0.26, 0.1, smooth(k)), dist: lerp(620, 96, smooth(k)), fov: lerp(60, 48, k) };
        }
        case "coil":
          // Trackside, fixed, low. Nothing follows it: the point of a rail
          // launch is that it is gone before a camera can turn.
          return { target: T.set(0, 0, 0), yaw: 1.1, pitch: 0.02 + k * 0.52, dist: lerp(240, 980, smooth(k)), fov: lerp(50, 74, k) };

        // --- the orbital flight ------------------------------------------
        case "coast":
          return { target: T.set(0, 0, 0), yaw: 0.8 + k * 0.9, pitch: -0.12 + k * 0.22, dist: lerp(42, 62, k), fov: 62 };
        case "ignition":
          return { target: T.set(0, -6, 0), yaw: 2.4, pitch: -0.62, dist: lerp(56, 34, smooth(k)), fov: 66 };
        case "burn":
          return { target: T.set(0, 0, 0), yaw: 2.4 + k * 1.3, pitch: lerp(-0.4, 0.1, smooth(k)), dist: lerp(34, 78, smooth(k)), fov: 58 };
        case "kessler":
          // Wide and loose. The camera is meant to be able to see the things
          // that are about to hit, and to be unable to do anything about them.
          return { target: T.set(0, 0, 0), yaw: 0.6 + Math.sin(time * 0.24) * 0.8, pitch: 0.05 + Math.sin(time * 0.17) * 0.22, dist: lerp(86, 58, smooth(k)), fov: 64 };
        case "clear":
          return { target: T.set(0, 0, 0), yaw: 1.5 + k * 0.6, pitch: 0.24, dist: lerp(58, 46, smooth(k)), fov: 56 };
        case "rendezvous":
          return { target: T.set(0, 3, lerp(-40, -14, smooth(k))), yaw: 0.25, pitch: 0.12, dist: lerp(70, 42, smooth(k)), fov: 52 };
        case "dock":
          return { target: T.set(0, 1.5, lerp(-14, -6, smooth(k))), yaw: lerp(0.25, 1.35, smooth(k)), pitch: 0.1, dist: lerp(42, 26, smooth(k)), fov: 48 };

        // --- the hop -------------------------------------------------------
        case "ascent":
          // Chase, drifting round to put the shrinking coast in frame.
          return { target: T.set(0, 0, 0), yaw: 0.8 + k * 1.2, pitch: -0.1 + k * 0.3, dist: lerp(44, 74, k), fov: 62 };
        case "apogee":
          // Held off the flank for the flip, high enough that the Earth's
          // curve is behind the whole manoeuvre.
          return { target: T.set(0, 0, 0), yaw: 1.4 + k * 0.5, pitch: 0.3 - k * 0.12, dist: lerp(74, 50, smooth(k)), fov: 54 };
        case "prograde":
          // From ahead, looking back down the flame at the vehicle it is
          // slowing: the shot that says the motor is pointed the way it is
          // travelling and this is braking, not a crash.
          return { target: T.set(0, 6, 0), yaw: 2.9, pitch: 0.42, dist: lerp(42, 70, smooth(k)), fov: 60 };
        case "reentry":
          return { target: T.set(0, 0, 0), yaw: 2.2 - k * 0.8, pitch: 0.34, dist: lerp(64, 52, k), fov: 62 };
        case "terminal":
          // Pulling right out, because what is coming up underneath is another
          // kilometre of gun and the shot is worthless if it does not fit.
          return { target: T.set(0, lerp(0, -40, smooth(k)), 0), yaw: 1.2 + k * 0.6, pitch: lerp(0.3, 0.02, smooth(k)), dist: lerp(58, 900, smooth(k)), fov: lerp(58, 68, k) };
        case "capture":
          // Trackside at the receiving barrel, the mirror of the shot that
          // launched it: the round plunging down through the rings as they
          // fire in reverse and take the speed back out.
          return { target: T.set(0, 0, 0), yaw: -1.0, pitch: 0.06 + (1 - k) * 0.45, dist: lerp(900, 210, smooth(k)), fov: lerp(72, 52, k) };
        case "arrived":
          return { target: T.set(0, -10, 0), yaw: -0.6, pitch: 0.16, dist: 260, fov: 52 };
        default:
          return { target: T.set(0, 0, -6), yaw: 1.35, pitch: 0.1, dist: 26, fov: 48 };
      }
    }

    _updateCamera(time, dt) {
      const rig = this._rig(time);
      const u = this._camUser();
      this._rigDist = rig.dist;

      const yaw = rig.yaw + u.yaw;
      const pitch = clamp(rig.pitch + u.pitch, -1.4, 1.4);
      const dist = rig.dist * u.dist;

      const cx = Math.cos(pitch) * Math.sin(yaw) * dist;
      const cy = Math.sin(pitch) * dist;
      const cz = Math.cos(pitch) * Math.cos(yaw) * dist;

      // The pan slides the look-at point in the camera's own plane, so it
      // works the same whichever way the rig has swung round.
      const right = this._tmpRight || (this._tmpRight = new THREE.Vector3());
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const look = this._tmpLook || (this._tmpLook = new THREE.Vector3());
      look.copy(rig.target).addScaledVector(right, u.panX);
      look.y += u.panY;

      // Shake is applied to the camera and not to the vehicle: the vehicle has
      // to stay exactly on the axis for the plates and the plume to line up.
      const sh = this.shake;
      const jx = sh ? (Math.random() - 0.5) * sh : 0;
      const jy = sh ? (Math.random() - 0.5) * sh : 0;

      this.camera.fov = rig.fov;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(look.x + cx + jx, look.y + cy + jy, look.z + cz);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(look.x, look.y, look.z);
      if (this.roll) this.camera.rotateZ(this.roll);

      // The far camera sits at the vehicle's TRUE distance from the centre of
      // the Earth and looks the way the near camera looks, so the planet is at
      // the size the altitude on the tape says it should be.
      //
      // With no other help it is also just off the bottom of the screen. At
      // 1300 km the Earth's angular radius is 56 degrees and its limb sits 34
      // degrees below a level camera, while half of a 64 degree field is only
      // 32: the planet misses the frame by two degrees and the shot reads as
      // empty space. So the far camera is tilted DOWN, eased in on the same
      // ramp that fades the planet in, which lifts the limb into the lower
      // third where it belongs. The near camera is untouched - the vehicle
      // stays framed where the director put it.
      const d = EARTH_VIS_R * (1 + this.alt / EARTH_R_M);
      this.farCamera.fov = rig.fov;
      this.farCamera.updateProjectionMatrix();
      this.farCamera.quaternion.copy(this.camera.quaternion);
      this.farCamera.rotateX(-FAR_TILT * (this.orbitalK || 0));
      this.farCamera.position.set(0, d, 0);
      // The pad is at a latitude, so the planet hangs under the vehicle at an
      // angle rather than squarely below it.
      const latTilt = (90 - this.site.lat) * Math.PI / 180;
      this.earthPivot.rotation.z = -latTilt * 0.25;
      this.earthPivot.rotation.y = this._time * 0.004 + this.site.lon * Math.PI / 180;
    }

    // ======================================================================
    // The frame
    // ======================================================================

    // Telemetry the HUD prints and the scene speaks. Pushed here because this
    // is where the flight actually happens.
    _say(key, params) {
      (this.log = this.log || []).push({ text: t("telemetry." + key, params), at: this._time });
      if (this.log.length > 40) this.log.shift();
    }

    update(dt, time) {
      this._time = time;
      const prof = this.profile;
      const ph = phaseAt(time, prof);
      this.phase = ph;
      this.alt = altitudeAt(time, prof);
      this.vspeed = verticalSpeedAt(time, prof);
      this.downrange = downrangeAt(time, prof);
      this.integrity = integrityAt(this.alt, this.severity || 1, prof, this.downrange);
      this.density = airDensity(this.alt);
      this.downrangeM = this.downrange * this.trackM;
      // The ground track compressed into something the near scene can hold:
      // the pad only has to slide out of frame, not travel eighteen hundred
      // real kilometres past the camera.
      this.downrangeZ = this.downrange * DOWNRANGE_VIS_M;

      this.shake = Math.max(0, this.shake - dt * 3.2);
      this.roll *= Math.pow(0.2, dt);
      this.impactFlash = Math.max(0, this.impactFlash - dt * 5);

      this._updateSun();
      this._updateSky(dt);
      this._updatePad(dt, ph);
      this._updateVehicle(dt, ph);
      this._updateBelt(dt, ph);
      this._updateShip(dt, ph);
      this._updateMotes(dt);
      this._updateCamera(time, dt);

      if (this.shipModel) { try { this.shipModel.update(time); } catch (e) { /* the ship is cosmetic */ } }
      if (this.earthBody) {
        if (this.earthBody._body) this.earthBody._body.rotation.y = time * 0.02;
        if (this.earthBody._clouds) this.earthBody._clouds.rotation.y = time * 0.031;
      }
    }

    _updateSun() {
      const e = this.env;
      // Azimuth from the hour, ELEVATION as a real angle. The old version put
      // the sun on a unit circle in the horizontal plane and only varied its
      // height, which pinned the horizontal component at full length and
      // capped the elevation near thirty degrees - so noon lit the launch site
      // at barely half strength and the Earth read as dark from orbit at every
      // hour of the day. A proper spherical direction fixes both.
      const az = ((e.clock - 6) / 12) * Math.PI;
      const elev = e.dayK * (Math.PI / 2) * (1 - Math.abs(this.site.lat) / 140);
      const ch = Math.cos(elev);
      const hi = ramp(this.alt, 40000, 140000);
      const dir = this.sun;
      dir.position.set(Math.cos(az) * ch * 1000, Math.sin(elev) * 1000, Math.sin(az) * ch * 1000);
      const warm = e.golden ? 0xffb066 : e.night ? 0x2a3a66 : 0xfff0dc;
      dir.color.setHex(warm).lerp(new THREE.Color(0xffffff), hi);
      dir.intensity = lerp(e.night ? 0.12 : (e.storm ? 0.45 : e.wet ? 0.6 : 1.0), 1.5, hi);
      this.ambient.intensity = lerp(e.night ? 0.16 : 0.5, 0.06, hi);
      this.ambient.color.setHex(e.night ? 0x243354 : 0x6f86a8);

      // In vacuum there is no weather and no dusk: the far scene is lit hard
      // and from the same direction, and the night side is left genuinely dark
      // so the city lights have something to be brighter than.
      this.farSun.position.copy(dir.position);
      this.farSun.intensity = 1.6;
    }

    _updateSky(dt) {
      // The dome fades with the air. By the Karman line it is gone and the
      // stars have taken over; the two cross over between 40 and 95 km, which
      // is where the sky goes from blue to black and is the best shot in the
      // ascent.
      const skyK = 1 - smooth(ramp(this.alt, 34000, 95000));
      this.skyMat.opacity = skyK;
      this.skyMat.transparent = true;
      this.sky.visible = skyK > 0.01;
      this.starMat.opacity = smooth(ramp(this.alt, 28000, 120000));

      // The Earth from outside: the limb lights up as the vehicle gets far
      // enough for the atmosphere to be a visible shell rather than the room
      // it is standing in.
      // Low enough that the hop sees a curved Earth under its own flip at 180
      // km, not just the orbital flight on its way to the belt.
      const orbital = smooth(ramp(this.alt, 40000, 160000));
      this.orbitalK = orbital;
      this.limb.material.opacity = orbital * 0.42;
      if (this.earthPivot) this.earthPivot.visible = orbital > 0.005;
      this.siteMark.visible = orbital > 0.2 && orbital < 0.95;

      // The photograph, once it has decoded; the painting until then. Checked
      // every frame because the swap can land mid-flight.
      const ready = this._earthMapReady();
      if (this.earthBody) this.earthBody.visible = ready;
      this.earthFallback.visible = !ready;

      // CITY LIGHTS. How dark it is at the pad, which is the hemisphere the
      // camera is over: full from civil twilight down, gone by mid-morning.
      const nightK = 1 - smooth(ramp(this.env.dayK, -0.22, 0.16));
      this.nightK = nightK;
      this.cityLights.material.opacity = nightK * orbital * 0.95;
      this.cityLights.visible = this.cityLights.material.opacity > 0.01;
      // A launch site at night is the brightest thing for fifty kilometres.
      this.siteMark.scale.setScalar(1 + nightK * 1.6);

      // Cloud decks: they sit at their altitude in world terms, so as the
      // ground falls away they rush down past the camera and then are below.
      const near = this.alt;
      this.clouds.forEach((c, i) => {
        const rel = c.userData.deckAlt - near;
        c.position.y = clamp(rel, -40000, 40000);
        const dist = Math.abs(rel);
        const base = this.env.storm ? 0.85 : this.env.wet ? 0.7 : this.env.snow ? 0.72 : 0.42;
        c.material.opacity = base * clamp01(1 - dist / 9000) * skyK;
        c.visible = c.material.opacity > 0.01;
      });

      // Lightning, in a storm, until the vehicle is above the weather.
      if (this.env.storm && this.alt < 14000) {
        this._boltTimer -= dt;
        if (this._boltTimer <= 0) {
          this._boltTimer = 2.5 + this.rng() * 5;
          this.bolt.intensity = 6;
          this._pendingSe = this._pendingSe || [];
          this._pendingSe.push({ name: SE.lightning, volume: 55, pitch: 90 + this.rng() * 25 });
        }
      }
      this.bolt.intensity = Math.max(0, this.bolt.intensity - dt * 22);
    }

    _updatePad(dt, ph) {
      // The whole installation rides down as one: the ground drops away under
      // a stationary vehicle. RAIL_LOAD_Y puts the round in the throat at T-0
      // and keeps the barrel aligned on it all the way up. Culled once it is a
      // speck, which is well before the far Earth fades in to replace it.
      const gone = this.alt > 60000;
      this.pad.visible = !gone;
      if (this.padB) this._updateArrivalPad(dt, ph);
      if (gone) return;
      this.pad.position.y = -(this.alt + RAIL_LOAD_Y);
      this.pad.position.z = this.downrangeZ || 0;

      // The rings.
      //
      // COUNT: they charge bottom to top, one bank at a time, and hold.
      // SHOT:  they fire in a wave that tracks the round itself. Each ring is
      //        white as the bullet passes it, amber for a moment behind, and
      //        dead after - so the discharge reads as one pulse a kilometre
      //        long chasing something already gone.
      const charging = ph.key === "countdown" ? ph.progress : (ph.index > 1 ? 1 : 0);
      const firing = ph.key === "coil";
      const bulletY = this.alt + RAIL_LOAD_Y;
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
    }

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
      const show = this.alt < 60000 && this.downrange > 0.55;
      b.visible = show;
      if (!show) return;

      const ahead = (1 - this.downrange) * DOWNRANGE_VIS_M;
      b.position.y = -(this.alt + RAIL_LOAD_Y);
      b.position.z = -ahead;

      // Approach lights: a ladder walking inward round the muzzle, faster the
      // closer it gets, solid once the round is committed to the bore.
      if (this.approachLights) {
        const k = clamp01((this.downrange - 0.94) / 0.06);
        this.approachLights.forEach((L) => {
          const on = capturing
            ? true
            : ((Math.floor(this._time * (2 + k * 10)) + L.userData.order) % 10) < 3;
          L.material.color.setHex(on ? 0x8affc4 : 0x0d2a18);
        });
        if (this.approachGlow) this.approachGlow.intensity = 0.3 + k * 3.4;
      }

      if (!rail) return;
      const bulletY = this.alt + RAIL_LOAD_Y;

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
        } else if (this.downrange > 0.7) {
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
    }

    _updateVehicle(dt, ph) {
      const alt = this.alt;

      // The nose heats where the air and the speed overlap and nowhere else,
      // so it lights on the way up through max-Q and goes out above it.
      // Going up, the nose is what meets the air. Coming down on a hop it is
      // the motor end, and the retro plume is what stands between the vehicle
      // and the airflow - so the nose only heats on the way up.
      const climbing = this.vspeed >= 0;
      const heat = climbing
        ? smooth(ramp(alt, 5000, 16000)) * (1 - smooth(ramp(alt, 24000, 46000)))
        : 0;
      this.noseGlow.material.opacity = heat * 0.85;
      this.noseGlow.scale.setScalar(1 + heat * 1.6);
      this.nose.material.emissive.setRGB(heat * 0.55, heat * 0.18, 0);

      // The motor.
      //
      // On the orbital flight it lights once, high and thin, and stays lit to
      // the top of the belt. On the hop it does not light on the way UP at
      // all: the rail did that. It lights after the flip, pointing forward,
      // and everything it burns is spent killing the speed the gun gave it.
      // The capture is deliberately absent from the hop's list: by then the
      // tanks are dry and the receiving coil is doing the braking, which is
      // the whole reason the hop is two stages and not three.
      const LIT = this.profile.downrange
        ? { prograde: 1, terminal: 1 }
        : { ignition: 1, burn: 1, kessler: 1, clear: 1 };
      const starting = this.profile.downrange ? "prograde" : "ignition";   // i18n-ignore  phase keys
      let ramping = LIT[ph.key] ? 1 : 0;
      if (ph.key === starting) ramping = smooth(clamp01(ph.progress / 0.25));
      if (ph.key === "terminal") ramping *= 0.5 + 0.5 * (1 - ph.progress);
      const flick = 0.85 + Math.sin(this._time * 34) * 0.1 + Math.sin(this._time * 71) * 0.05;
      const p = ramping * flick;
      this.plumeCore.material.opacity = p * 0.95;
      this.plumeBody.material.opacity = p * 0.6;
      this.plumeHalo.material.opacity = p * 0.3;
      const stretch = lerp(0.5, 1.5, 1 - clamp01(this.density * 4));
      this.plume.scale.set(1 + p * 0.2, ramping * stretch, 1 + p * 0.2);
      this.diamonds.forEach((d, i) => {
        d.material.opacity = p * clamp01(this.density * 5) * (0.8 - i * 0.12);
      });
      this.plumeLight.intensity = p * 3.4;
      this.plumeLight.color.setHex(0xffb45a);

      // THE FLIP. Five seconds at the top of the arc, end over end, with
      // nothing burning: after it the motor is pointed at the destination and
      // the armour that led the way up is the armour that takes the reentry.
      if (this.profile.downrange) {
        if (ph.key === "apogee") this.flip = Math.PI * smooth(ph.progress);
        else if (ph.index > 4) this.flip = Math.PI;
        else this.flip = 0;
      } else {
        this.flip = 0;
      }

      // Shed whatever the integrity has fallen past. A plate does not vanish:
      // it is reparented to the world, given the tumble it had stored and left
      // behind, so the debris trailing the vehicle is its own armour. A hop
      // never gets here, because nothing on a hop takes armour off.
      if (this.profile.shedsArmour) {
        for (let i = this.plates.length - 1; i >= 0; i--) {
          const pl = this.plates[i];
          if (this.integrity > pl.userData.threshold) continue;
          this.plates.splice(i, 1);
          this.vehicle.remove(pl);
          this.near.add(pl);
          pl.userData.vel = new THREE.Vector3(
            pl.position.x * (3 + this.rng() * 6),
            -6 - this.rng() * 22,
            pl.position.z * (3 + this.rng() * 6)
          );
          pl.userData.life = 2.4;
          this.shed.push(pl);
          this._onPlateLost(pl);
        }
      }
      for (let i = this.shed.length - 1; i >= 0; i--) {
        const pl = this.shed[i];
        pl.position.addScaledVector(pl.userData.vel, dt);
        pl.rotation.x += pl.userData.spin.x * dt;
        pl.rotation.y += pl.userData.spin.y * dt;
        pl.rotation.z += pl.userData.spin.z * dt;
        pl.userData.life -= dt;
        if (pl.userData.life <= 0) {
          this.near.remove(pl);
          this.shed.splice(i, 1);
        }
      }

      // What is left of it spins a little more freely the less of it there is.
      const bare = 1 - clamp01((this.integrity - INTEGRITY_FLOOR) / (INTEGRITY_START - INTEGRITY_FLOOR));
      const settling = ph.key === "capture" || ph.key === "arrived";
      this.vehicle.rotation.y += settling ? 0 : dt * (0.25 + bare * 2.2);
      const loose = (ph.key === "coast" || ph.key === "ascent" || ph.key === "kessler" || ph.key === "reentry");
      const wobZ = loose ? Math.sin(this._time * 1.7) * 0.03 * (1 + bare * 4) : 0;
      const wobX = loose ? Math.cos(this._time * 1.3) * 0.025 * (1 + bare * 4) : 0;
      this.vehicle.rotation.z = settling ? 0 : wobZ;
      this.vehicle.rotation.x = (this.flip || 0) + (settling ? 0 : wobX);
    }

    _onPlateLost(plate) {
      this.shake = Math.max(this.shake, 0.9);
      this._pendingSe = this._pendingSe || [];
      this._pendingSe.push({ name: SE.tear, volume: 70, pitch: 80 + Math.random() * 30 });
    }

    // ----------------------------------------------------------------------
    // The belt.
    //
    // Nothing here is a hazard the player can avoid, and that is the design:
    // the vehicle is a bullet with no control surfaces flying through a shell
    // of other people's abandoned hardware at eight kilometres a second. What
    // the player does is watch and count what is left.
    // ----------------------------------------------------------------------
    _updateBelt(dt, ph) {
      if (!this.profile.belt || !this.belt) return;
      const inBelt = ph.key === "kessler";
      const nearBelt = ph.key === "burn" && ph.progress > 0.72;
      const leaving = ph.key === "clear" && ph.progress < 0.65;
      this.belt.visible = inBelt || nearBelt || leaving;
      if (!this.belt.visible) {
        this.sparkMat.opacity = Math.max(0, this.sparkMat.opacity - dt * 2);
        this.strikeFlash.intensity = Math.max(0, this.strikeFlash.intensity - dt * 30);
        this.warnLight.intensity = Math.max(0, this.warnLight.intensity - dt * 4);
        return;
      }

      // Density ramps in before the vehicle is inside, so the fog is already
      // thickening while the HUD still says the belt is ahead.
      const dens = inBelt ? 1 : nearBelt ? ramp(ph.progress, 0.72, 1) : (1 - ramp(ph.progress, 0, 0.65));

      if (this.debrisFog && this.debrisFog.rotation) {
        this.debrisFog.rotation.y += dt * 0.12;
        this.debrisFog.rotation.x += dt * 0.05;
        if (this.debrisFog.material) this.debrisFog.material.opacity = 0.35 + dens * 0.55;
      }

      // The wrecks fall past. The near ones are announced a beat before they
      // arrive, which is the only warning there is.
      this.wrecks.forEach((w) => {
        const sp = w.userData.fall * (0.4 + dens);
        w.position.y -= sp * dt;
        w.position.x += w.userData.drift * dt * 0.3;
        w.rotation.x += w.userData.spin.x * dt;
        w.rotation.y += w.userData.spin.y * dt;
        w.rotation.z += w.userData.spin.z * dt;
        if (w.userData.near && !w.userData.announced && w.position.y < 120 && w.position.y > 40) {
          w.userData.announced = true;
          this._say("proximity");
          this._pendingSe = this._pendingSe || [];
          this._pendingSe.push({ name: SE.alarm, volume: 45, pitch: 135 });
        }
        if (w.position.y < -260) this._resetWreck(w, false);
      });

      // Strikes. The rate rises through the traversal and every one of them
      // takes armour off: the integrity curve is authoritative, so a hit is
      // the sound and the spark of a loss the model has already decided on.
      this._strikeTimer = (this._strikeTimer == null) ? 0.3 : this._strikeTimer - dt;
      if (inBelt && this._strikeTimer <= 0) {
        const heat = 0.35 + ph.progress * 0.9;
        this._strikeTimer = (0.42 / heat) * (0.4 + this.rng());
        this._strike(this.rng() < 0.22 + ph.progress * 0.3);
      }

      // The strobe. It comes on with the first hit and it does not go off, and
      // it beats faster as the hull runs out.
      const urgency = 1 - clamp01((this.integrity - INTEGRITY_FLOOR) / 90);
      const beat = Math.sin(this._time * (4 + urgency * 9));
      this.warnLight.intensity = inBelt ? (beat > 0.3 ? 2.6 : 0.15) : 0;

      this._updateSparks(dt);
      this.strikeFlash.intensity = Math.max(0, this.strikeFlash.intensity - dt * 26);
    }

    _strike(heavy) {
      const a = this.rng() * Math.PI * 2;
      const y = (this.rng() - 0.5) * 14;
      const R = this.bodyR + 0.4;
      const px = Math.cos(a) * R, pz = Math.sin(a) * R;

      this.strikeFlash.position.set(px * 2, y, pz * 2);
      this.strikeFlash.intensity = heavy ? 9 : 3.4;
      this.shake = Math.max(this.shake, heavy ? 2.6 : 0.8);
      this.roll += (this.rng() - 0.5) * (heavy ? 0.09 : 0.02);
      this.impactFlash = Math.max(this.impactFlash, heavy ? 1 : 0.35);

      const n = heavy ? 26 : 10;
      let placed = 0;
      for (let i = 0; i < this.sparks.length && placed < n; i++) {
        const s = this.sparks[i];
        if (s.life > 0) continue;
        s.x = px; s.y = y; s.z = pz;
        const sp = (heavy ? 26 : 12) * (0.4 + this.rng());
        s.vx = px * sp * 0.4 + (this.rng() - 0.5) * sp;
        s.vy = (this.rng() - 0.5) * sp - 6;
        s.vz = pz * sp * 0.4 + (this.rng() - 0.5) * sp;
        s.life = 0.35 + this.rng() * 0.6;
        placed++;
      }
      this.sparkMat.opacity = 1;

      this._pendingSe = this._pendingSe || [];
      this._pendingSe.push(heavy
        ? { name: SE.hitHeavy, volume: 92, pitch: 70 + Math.random() * 25 }
        : { name: SE.hitLight, volume: 66, pitch: 95 + Math.random() * 45 });
      if (heavy) this._say("impact", { pct: Math.max(1, Math.round(this.integrity)) });
    }

    _updateSparks(dt) {
      const attr = this.sparkPoints.geometry.attributes.position;
      let any = false;
      for (let i = 0; i < this.sparks.length; i++) {
        const s = this.sparks[i];
        if (s.life <= 0) { attr.array[i * 3 + 1] = 99999; continue; }
        s.life -= dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        s.vy -= 2 * dt;
        attr.array[i * 3] = s.x;
        attr.array[i * 3 + 1] = s.y;
        attr.array[i * 3 + 2] = s.z;
        any = true;
      }
      attr.needsUpdate = true;
      if (!any) this.sparkMat.opacity = Math.max(0, this.sparkMat.opacity - dt * 2);
    }

    _updateShip(dt, ph) {
      if (!this.shipGroup) return;
      const approaching = ph.key === "rendezvous" || ph.key === "dock" || ph.key === "aboard";
      this.shipGroup.visible = approaching || (ph.key === "clear" && ph.progress > 0.45);
      if (!this.shipGroup.visible) return;

      // The ship comes in from ahead and slightly above, and the last seconds
      // are the collar coming to meet the nose.
      let k;
      if (ph.key === "clear") k = ramp(ph.progress, 0.45, 1) * 0.25;
      else if (ph.key === "rendezvous") k = 0.25 + smooth(ph.progress) * 0.62;
      else if (ph.key === "dock") k = 0.87 + smooth(ph.progress) * 0.13;
      else k = 1;

      const far = 2600, close = 30;
      const z = -lerp(far, close, k);
      this.shipGroup.position.set(lerp(420, 0, smooth(k)), lerp(280, 0, smooth(k)), z);
      this.shipGroup.rotation.y = lerp(-1.1, Math.PI, smooth(k));
      this.shipGroup.rotation.z = Math.sin(this._time * 0.2) * 0.02;

      // The collar sits at the near end of the hull, facing the bullet.
      this.dockCollar.position.set(0, 0, 58);
      this.dockGlow.intensity = 0.4 + k * 2.2;
      this.dockLights.forEach((L, i) => {
        // A chase of green round the collar, faster the closer it gets.
        const on = ((Math.floor(this._time * (2 + k * 8)) + i) % 8) < 3;
        L.material.color.setHex(on ? 0x8affc4 : 0x14432c);
      });

      if (ph.key === "aboard") {
        // Inside the collar: the frame washes out and the interior takes over.
        this.shipGroup.position.z = lerp(-close, 4, smooth(ph.progress));
      }
    }

    _updateMotes(dt) {
      // Weather only exists in the lower atmosphere, and only in weather.
      const e = this.env;
      const active = (e.wet || e.snow) && this.alt < 12000;
      const target = active ? clamp01(1 - this.alt / 12000) * (e.storm ? 0.9 : 0.7) : 0;
      this.moteMat.opacity += (target - this.moteMat.opacity) * Math.min(1, dt * 4);
      this.moteField.visible = this.moteMat.opacity > 0.01;
      if (!this.moteField.visible) return;

      // They streak straight down past a vehicle that is itself climbing, so
      // the apparent fall speed is the weather plus the flight.
      const climb = Math.abs(this.vspeed) * 0.02;
      const attr = this.moteField.geometry.attributes.position;
      const cam = this.camera.position;
      for (let i = 0; i < this.motes.length; i++) {
        const p = this.motes[i];
        p.y -= (p.v + climb) * dt;
        if (p.y < -120) {
          p.y = 160 + this.rng() * 60;
          p.x = cam.x + (this.rng() - 0.5) * 260;
          p.z = cam.z + (this.rng() - 0.5) * 260;
        }
        attr.array[i * 3] = p.x;
        attr.array[i * 3 + 1] = p.y;
        attr.array[i * 3 + 2] = p.z;
      }
      attr.needsUpdate = true;
    }

    // Sound cues the frame produced, handed to the scene to actually play. The
    // stage does not talk to AudioManager itself so the physics can be stepped
    // in a test without one.
    drainSe() {
      const out = this._pendingSe || [];
      this._pendingSe = [];
      return out;
    }

    drainLog() {
      const out = this.log || [];
      this.log = [];
      return out;
    }

    render() {
      const r = this.renderer;
      // Far first, then the depth buffer alone is cleared, so the Earth and
      // the stars are a backdrop the near scene cannot z-fight with and
      // cannot be painted over. autoClear is off for exactly this reason: the
      // colour buffer is cleared ONCE, here, and not again between passes.
      r.clear();
      r.render(this.far, this.farCamera);
      r.clearDepth();
      r.render(this.near, this.camera);
    }
  }

  // ==========================================================================
  // The HUD
  //
  // Kerbal's navball panel is the model: one tall tape that shows the WHOLE
  // flight at once with the vehicle's own mark sliding up it, so the player
  // can see both where they are and how far there is to go, and a block of
  // hard numbers that never moves. Painted into a 240-line buffer through
  // PSXHud so the type stays on the pixel grid at any window size.
  // ==========================================================================

  const HUD = window.PSXHud;

  // The bands drawn on the tape, bottom to top. `to` null means a line rather
  // than a band. Colours are read off the PSX palette so the HUD matches every
  // other 3D screen in the game.
  function tapeBands(profile) {
    const P = HUD ? HUD.PAL : { cyan: "#3ad7ef", amber: "#ffc02e", red: "#e8442e", green: "#4fe07a", dim: "#93a3b8" };
    const prof = profile || PROFILES.orbital;
    if (prof.downrange) {
      // The hop's tape tops out just above the arc, so the parabola fills it.
      return [
        { from: 0, to: MAXQ_START_M, key: "troposphere", color: P.dim },
        { from: MAXQ_START_M, to: MAXQ_END_M, key: "maxq", color: P.amber },
        { from: MAXQ_END_M, to: 62000, key: "stratosphere", color: P.dim },
        { from: 62000, to: null, key: "prograde", color: P.green },
        { from: KARMAN_M, to: null, key: "karman", color: P.cyan },
        { from: SUB_APOGEE_M, to: null, key: "apogee", color: P.green },
      ];
    }
    return [
      { from: 0, to: MAXQ_START_M, key: "troposphere", color: P.dim },
      { from: MAXQ_START_M, to: MAXQ_END_M, key: "maxq", color: P.amber },
      { from: MAXQ_END_M, to: IGNITION_M, key: "stratosphere", color: P.dim },
      { from: IGNITION_M, to: null, key: "ignition", color: P.green },
      { from: KARMAN_M, to: null, key: "karman", color: P.cyan },
      { from: KARMAN_M, to: KESSLER_IN_M, key: "thermosphere", color: P.dim },
      { from: KESSLER_IN_M, to: KESSLER_OUT_M, key: "kessler", color: P.red },
      { from: DOCK_M, to: null, key: "rendezvous", color: P.green },
    ];
  }

  class LaunchHud {
    constructor(profile) {
      this.profile = profile || PROFILES.orbital;
      const layer = HUD ? HUD.layer() : null;
      this.layer = layer;
      this.sprite = layer ? layer.sprite : new Sprite(new Bitmap(8, 8));
      this.bmp = layer ? layer.bitmap : this.sprite.bitmap;
      this.w = layer ? layer.w : 320;
      this.h = layer ? layer.h : 180;
      this.bands = tapeBands(this.profile);
      this.lines = [];
      this.caution = 0;
      this.glitch = 0;
    }

    push(text) {
      this.lines.push(text);
      while (this.lines.length > 5) this.lines.shift();
    }

    // st: { time, phase, alt, vspeed, integrity, plates, site, env, free }
    draw(st) {
      if (!HUD) return;
      const b = this.bmp;
      const P = HUD.PAL;
      b.clear();

      this._drawTape(st, P);
      this._drawBlock(st, P);
      this._drawClock(st, P);
      this._drawLog(st, P);
      this._drawCaution(st, P);
      this._drawHints(st, P);
      if (b._baseTexture && b._baseTexture.update) b._baseTexture.update();
    }

    // --- the altimeter tape ------------------------------------------------

    _drawTape(st, P) {
      const b = this.bmp;
      const x = this.w - 46;
      const y0 = 18;
      const H = this.h - 44;
      const yOf = (alt) => y0 + Math.round((1 - tapeFraction(alt, this.profile)) * H);

      HUD.panel(b, x, y0 - 8, 40, H + 16, { fill: "#0a1220", dither: true });

      this.bands.forEach((band) => {
        const yb = yOf(band.from);
        if (band.to == null) {
          b.fillRect(x + 2, yb, 22, 1, band.color);
          HUD.text(b, t("band." + band.key), x + 2, yb - 9, 36, "left", band.color, 8, { shadow: true });
          return;
        }
        const yt = yOf(band.to);
        const h = Math.max(1, yb - yt);
        b.fillRect(x + 2, yt, 4, h, band.color);
        HUD.text(b, t("band." + band.key), x + 8, yt + Math.max(0, h / 2 - 5), 32, "left", band.color, 8);
      });

      // The mark. A wedge, the altitude beside it, and a trail showing where
      // it has already been.
      const my = clamp(yOf(st.alt), y0, y0 + H);
      b.fillRect(x + 2, my, 4, y0 + H - my, "#1d4d7a");
      b.fillRect(x - 6, my - 1, 10, 3, P.ink);
      b.fillRect(x - 8, my, 2, 1, P.ink);
      HUD.text(b, altText(st.alt), x - 64, my - 5, 56, "right", P.ink, 8);

      HUD.text(b, t("hud.altitude"), x, y0 - 18, 40, "left", P.dim, 8);
      // A ground-track bar under the tape, for the hop only: the parabola is
      // as much a distance as it is a height.
      if (this.profile.downrange) {
        const gy = this.h - 30;
        HUD.bar(b, 6, gy, this.w - 60, 5, clamp01(st.downrange), {
          seg: 2, gap: 1, color: P.amber,
        });
        HUD.text(b, siteName(st.fromSite), 6, gy - 9, 60, "left", P.dim, 8);
        HUD.text(b, siteName(st.toSite), this.w - 120, gy - 9, 60, "right", P.dim, 8);
      }
    }

    // --- the numbers -------------------------------------------------------

    _drawBlock(st, P) {
      const b = this.bmp;
      const x = 6, y = 18, w = 92;
      HUD.panel(b, x, y, w, 62, { fill: "#0a1220", dither: true });

      HUD.text(b, t("hud.velocity"), x + 4, y + 3, w - 8, "left", P.dim, 8);
      HUD.text(b, speedText(st.vspeed), x + 4, y + 12, w - 8, "right", P.cyan, 16);

      // On a hop the second line is the distance still to run; on the orbital
      // flight there is nowhere to run to, so it is the air outside instead.
      if (this.profile.downrange) {
        HUD.text(b, t("hud.downrange"), x + 4, y + 30, w - 8, "left", P.dim, 8);
        HUD.text(b, altText(Math.max(0, st.trackM - st.downrangeM)), x + 4, y + 30, w - 8, "right", P.amber, 8);
      } else {
        HUD.text(b, t("hud.density"), x + 4, y + 30, w - 8, "left", P.dim, 8);
        HUD.text(b, pctText(st.density * 100), x + 4, y + 30, w - 8, "right", P.dim, 8);
      }

      HUD.text(b, t("hud.plates", { n: st.plates }), x + 4, y + 42, w - 8, "left", P.dim, 8);
      HUD.text(b, t("hud.stages", { n: this.profile.stages }), x + 4, y + 42, w - 8, "right", P.dim, 8);

      // Hull integrity. The bar runs green to red and the number is never
      // allowed to read zero, because it never is zero.
      const iy = y + 66;
      HUD.panel(b, x, iy, w, 26, { fill: "#0a1220", dither: true });
      const frac = clamp01(st.integrity / 100);
      const crit = st.integrity < 25;
      const blink = crit && (Math.floor(st.time * 6) % 2 === 0);
      HUD.text(b, t("hud.integrity"), x + 4, iy + 2, w - 8, "left", crit ? P.red : P.dim, 8);
      HUD.text(b, pctText(st.integrity), x + 4, iy + 2, w - 8, "right",
        blink ? P.ink : (crit ? P.red : P.green), 8);
      HUD.bar(b, x + 4, iy + 13, w - 8, 9, frac, {
        seg: 2, gap: 1,
        colorAt: (k) => (k < 0.25 ? P.red : k < 0.55 ? P.amber : P.green),
      });
    }

    // --- the clock ---------------------------------------------------------

    _drawClock(st, P) {
      const b = this.bmp;
      const cx = Math.round(this.w / 2) - 44;
      const inCount = st.phase.key === "countdown" || st.phase.key === "hold";
      const zero = this.profile.start.coil;
      const tMinus = inCount ? (zero - st.time) : (st.time - zero);

      HUD.panel(b, cx, 3, 88, 22, { fill: "#0a1220", dither: true });
      const big = (inCount ? "T-" : "T+") + clockText(Math.abs(tMinus));   // i18n-ignore  T-minus notation
      const urgent = inCount && tMinus <= 5;
      HUD.text(b, big, cx + 3, 5, 82, "center",
        urgent && Math.floor(st.time * 4) % 2 === 0 ? P.red : P.ink, 16);

      HUD.text(b, t("phase." + st.phase.key), cx + 3, 26, 82, "center",
        st.phase.key === "kessler" ? P.red : P.cyan, 8);
    }

    _drawLog(st, P) {
      const b = this.bmp;
      const y = this.h - 22 - this.lines.length * 9;
      this.lines.forEach((line, i) => {
        HUD.text(b, line, 6, y + i * 9, this.w - 60, "left", i === this.lines.length - 1 ? P.ink : P.dim, 8);
      });
    }

    // Master caution. During the belt the whole frame gets a red border and a
    // strip of warning text that beats with the strobe on the hull.
    _drawCaution(st, P) {
      if (st.phase.key !== "kessler") return;   // the hop never has one
      const b = this.bmp;
      const beat = Math.floor(st.time * 5) % 2 === 0;
      const col = beat ? P.red : "#5a0f0a";
      b.fillRect(0, 0, this.w, 2, col);
      b.fillRect(0, this.h - 2, this.w, 2, col);
      b.fillRect(0, 0, 2, this.h, col);
      b.fillRect(this.w - 2, 0, 2, this.h, col);
      const cx = Math.round(this.w / 2) - 52;
      HUD.panel(b, cx, this.h - 20, 104, 13, { fill: beat ? "#3a0d08" : "#180608" });
      HUD.text(b, t("hud.caution"), cx + 2, this.h - 19, 100, "center", beat ? P.ink : P.red, 8);
    }

    _drawHints(st, P) {
      const b = this.bmp;
      HUD.text(b, t("hud.camHint"), 6, this.h - 11, this.w - 70, "left", P.dim, 8);
      if (st.free) HUD.text(b, t("hud.freeCam"), 6, 6, 80, "left", P.amber, 8);
    }
  }

  // Readouts. Metres below a kilometre, kilometres above, and a speed that
  // switches to km/s where m/s stops being a number anyone can read.
  function altText(m) {
    if (m < 1000) return Math.round(m) + " " + t("unit.m");
    if (m < 100000) return (m / 1000).toFixed(1) + " " + t("unit.km");
    return Math.round(m / 1000) + " " + t("unit.km");
  }
  function speedText(v) {
    const a = Math.abs(v);
    if (a < 1000) return Math.round(v) + " " + t("unit.ms");
    return (v / 1000).toFixed(2) + " " + t("unit.kms");
  }
  function pctText(p) { return (p < 10 ? p.toFixed(1) : Math.round(p)) + "%"; }   // i18n-ignore  percent sign
  function clockText(s) {
    const whole = Math.max(0, s);
    const mm = Math.floor(whole / 60);
    const ss = Math.floor(whole % 60);
    const cs = Math.floor((whole * 10) % 10);
    return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0") + "." + cs;   // i18n-ignore  clock punctuation
  }

  // ==========================================================================
  // The site selection card
  //
  // Two pads, side by side, with the weather that is actually over each of
  // them right now. The player picks; the flight is different from either.
  // ==========================================================================

  class SiteCard {
    constructor(env, forcedProfile) {
      const layer = HUD ? HUD.layer() : null;
      this.layer = layer;
      this.sprite = layer ? layer.sprite : new Sprite(new Bitmap(8, 8));
      this.bmp = layer ? layer.bitmap : this.sprite.bitmap;
      this.w = layer ? layer.w : 320;
      this.h = layer ? layer.h : 180;
      this.env = env;
      this.index = Math.max(0, SITE_ORDER.indexOf(nearestSite()));
      this.profileIndex = Math.max(0, PROFILE_ORDER.indexOf(forcedProfile || "orbital"));   // i18n-ignore  profile id
      // A forced profile skips straight to the pad; otherwise the mode is the
      // first thing asked, because it changes what the pad even means.
      this.page = forcedProfile ? "site" : "mode";   // i18n-ignore  page ids
      // A plugin command that names the flight plan is not offering a choice,
      // so backing out of the pad page leaves the scene instead of revealing
      // the page that was deliberately skipped.
      this.hasModePage = !forcedProfile;
      this._t = 0;
    }

    get siteId() { return SITE_ORDER[this.index]; }
    get profileId() { return PROFILE_ORDER[this.profileIndex]; }
    get profile() { return PROFILES[this.profileId]; }
    get count() { return this.page === "mode" ? PROFILE_ORDER.length : SITE_ORDER.length; }
    get cursor() { return this.page === "mode" ? this.profileIndex : this.index; }
    set cursor(v) { if (this.page === "mode") this.profileIndex = v; else this.index = v; }

    move(d) {
      this.cursor = (this.cursor + d + this.count) % this.count;
      se(SE.cursor, 70);
    }

    // Returns true when the card is finished and the flight can start.
    confirm() {
      se(SE.select, 85);
      if (this.page === "mode") { this.page = "site"; return false; }   // i18n-ignore  page id
      return true;
    }

    // Returns true when there is nothing left to back out of.
    back() {
      se(SE.back, 80);
      if (this.page === "site" && this.hasModePage) { this.page = "mode"; return false; }   // i18n-ignore  page ids
      return true;
    }

    // The screen rectangle of a card, so a click can be resolved against it.
    rectOf(i) {
      const n = this.count;
      const cw = Math.floor((this.w - 10 * (n + 1)) / n);
      return { x: 10 + i * (cw + 10), y: 34, w: cw, h: this.h - 72 };
    }

    hitTest(px, py) {
      const sx = px / (Graphics.width / this.w);
      const sy = py / (Graphics.height / this.h);
      for (let i = 0; i < this.count; i++) {
        const r = this.rectOf(i);
        if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return i;
      }
      return -1;
    }

    update(dt) { this._t += dt; this.draw(); }

    draw() {
      if (!HUD) return;
      const b = this.bmp;
      const P = HUD.PAL;
      b.clear();
      b.fillRect(0, 0, this.w, this.h, "#04070e");
      const mode = this.page === "mode";
      HUD.text(b, mode ? t("select.modeTitle") : t("select.title"), 0, 10, this.w, "center", P.cyan, 16);
      HUD.text(b, mode ? t("select.modeSubtitle") : t("select.subtitle"), 0, 26, this.w, "center", P.dim, 8);

      const ids = mode ? PROFILE_ORDER : SITE_ORDER;
      ids.forEach((id, i) => {
        const r = this.rectOf(i);
        const on = i === this.cursor;
        const blink = on && Math.floor(this._t * 3) % 2 === 0;
        HUD.panel(b, r.x, r.y, r.w, r.h, {
          fill: on ? "#132238" : "#0a1220",
          hi: on ? P.cyan : P.edgeHi,
          dither: !on,
        });
        const title = mode ? t("mode." + id + ".name") : siteName(id);
        const blurb = mode ? t("mode." + id + ".blurb") : siteBlurb(id);
        HUD.text(b, title, r.x + 4, r.y + 4, r.w - 8, "center", on ? P.ink : P.dim, 16);
        HUD.text(b, blurb, r.x + 4, r.y + 24, r.w - 8, "left", P.dim, 8, { lineHeight: 9 });

        const rows = mode ? this._modeRows(id) : this._siteRows(id);
        rows.forEach(([k, v], n) => {
          const ry = r.y + r.h - 10 - (rows.length - n) * 10;
          HUD.text(b, k, r.x + 5, ry, r.w - 10, "left", P.dim, 8);
          HUD.text(b, v, r.x + 5, ry, r.w - 10, "right", on ? P.amber : P.dim, 8);
        });
        if (blink) b.fillRect(r.x, r.y + r.h - 2, r.w, 2, P.cyan);
      });

      HUD.text(b, t("select.confirm"), 0, this.h - 14, this.w, "center", P.ink, 8);
    }

    _modeRows(id) {
      const prof = PROFILES[id];
      const a = SITES[SITE_ORDER[this.index]];
      const bSite = otherSite(a.id);
      return [
        [t("select.stages"), String(prof.stages)],
        [t("select.apogee"), altText(prof.apogee)],
        [t("select.armour"), prof.shedsArmour ? t("select.armourLost") : t("select.armourKept")],
        [t("select.arrives"), prof.downrange ? siteName(bSite.id) : t("select.starship")],
        [t("select.track"), prof.downrange ? altText(greatCircleM(a, bSite)) : t("select.vertical")],
      ];
    }

    _siteRows(id) {
      const st = SITES[id];
      const prof = this.profile;
      const rows = [
        [t("select.latitude"), st.lat.toFixed(2) + "\u00b0"],                    // i18n-ignore  degree sign
        [t("select.weather"), weatherLabel(this.env.weather)],
        [t("select.light"), this.env.night ? t("select.night") : this.env.golden ? t("select.golden") : t("select.day")],
      ];
      if (prof.downrange) rows.push([t("select.arrives"), siteName(otherSite(id).id)]);
      else rows.push([t("select.hazard"), pctText(100 - integrityAt(KESSLER_OUT_M, hazardSeverity(this.env), prof))]);
      return rows;
    }
  }

  function weatherLabel(id) {
    if (window.WeatherNames && typeof window.WeatherNames.label === "function") {
      const lbl = window.WeatherNames.label(id);
      if (lbl) return lbl;
    }
    return t("weather." + (id || "none"));
  }

  // ==========================================================================
  // The scene
  // ==========================================================================

  // Beats spoken over the radio as the flight passes them. Keyed on phase, or
  // on a phase plus a fraction through it, and fired once each.
  const ORBITAL_CUES = [
    { at: ["hold", 0.0], key: null, music: "launch" },
    { at: ["hold", 0.1], key: "padClear", se: SE.radio, vol: 60 },
    { at: ["countdown", 0.02], key: "countStart", se: SE.computer, vol: 55 },
    { at: ["countdown", 0.35], key: "coilCharge", se: SE.charge, vol: 70 },
    { at: ["countdown", 0.8], key: "gantryClear", se: SE.power, vol: 60 },
    { at: ["coil", 0.0], key: "release", se: SE.release, vol: 100 },
    { at: ["coil", 0.45], key: "railExit", se: SE.boom, vol: 95 },
    { at: ["coast", 0.02], key: "ballistic", se: SE.gale, vol: 70 },
    { at: ["coast", 0.35], key: "maxQ", se: SE.wind, vol: 80 },
    { at: ["coast", 0.9], key: "thinAir", se: null },
    { at: ["ignition", 0.05], key: "ignition", se: SE.ignite, vol: 95 },
    { at: ["ignition", 0.5], key: "burning", se: SE.burn, vol: 85 },
    { at: ["burn", 0.1], key: "karman", se: SE.computer, vol: 55 },
    { at: ["burn", 0.75], key: "beltAhead", se: SE.klaxon, vol: 70 },
    { at: ["kessler", 0.0], key: "beltEntry", se: SE.alarm, vol: 85, music: "belt" },
    { at: ["kessler", 0.45], key: "beltDeep", se: null },
    { at: ["kessler", 0.85], key: "beltBare", se: null },
    { at: ["clear", 0.05], key: "beltClear", se: SE.aboard, vol: 65 },
    { at: ["rendezvous", 0.0], key: null, music: "arrival" },
    { at: ["rendezvous", 0.05], key: "shipSighted", se: SE.radio, vol: 70 },
    { at: ["rendezvous", 0.7], key: "closing", se: SE.computer, vol: 55 },
    { at: ["dock", 0.55], key: "softDock", se: SE.clamp, vol: 90 },
    { at: ["dock", 0.9], key: "hardDock", se: SE.airlock, vol: 85 },
    { at: ["aboard", 0.2], key: "aboard", se: SE.aboard, vol: 80 },
  ];

  // The hop. Same gun, same round, a completely different flight plan: no
  // insertion burn, no belt, and a landing at the other end of the track.
  const SUBORBITAL_CUES = [
    { at: ["hold", 0.0], key: null, music: "hop" },
    { at: ["hold", 0.1], key: "hopPadClear", se: SE.radio, vol: 60 },
    { at: ["countdown", 0.02], key: "hopCount", se: SE.computer, vol: 55 },
    { at: ["countdown", 0.35], key: "coilCharge", se: SE.charge, vol: 70 },
    { at: ["countdown", 0.8], key: "gantryClear", se: SE.power, vol: 60 },
    { at: ["coil", 0.0], key: "release", se: SE.release, vol: 100 },
    { at: ["coil", 0.45], key: "railExit", se: SE.boom, vol: 95 },
    { at: ["ascent", 0.02], key: "hopBallistic", se: SE.gale, vol: 70 },
    { at: ["ascent", 0.3], key: "maxQ", se: SE.wind, vol: 80 },
    { at: ["ascent", 0.88], key: "hopApogeeNear", se: SE.computer, vol: 55 },
    { at: ["apogee", 0.1], key: "hopFlip", se: SE.rumble, vol: 70 },
    { at: ["apogee", 0.75], key: "hopFlipDone", se: SE.power, vol: 60 },
    { at: ["prograde", 0.05], key: "hopPrograde", se: SE.ignite, vol: 95 },
    { at: ["prograde", 0.6], key: "hopBraking", se: SE.burn, vol: 80 },
    { at: ["reentry", 0.1], key: "hopReentry", se: SE.gale, vol: 80 },
    { at: ["terminal", 0.1], key: "hopTerminal", se: SE.radio, vol: 70 },
    { at: ["terminal", 0.75], key: "hopMuzzle", se: SE.charge, vol: 75 },
    { at: ["capture", 0.05], key: "hopCapture", se: SE.coilRing, vol: 85 },
    { at: ["capture", 0.6], key: "hopBraked", se: SE.rumble, vol: 80 },
    { at: ["capture", 0.95], key: "hopDocked", se: SE.clamp, vol: 90 },
    { at: ["arrived", 0.2], key: "hopArrived", se: SE.airlock, vol: 80 },
  ];

  function cuesFor(profile) {
    return profile && profile.downrange ? SUBORBITAL_CUES : ORBITAL_CUES;
  }

  class Scene_RocketLaunch extends Scene_Base {
    prepare(opts) {
      const o = opts || {};
      this._forcedSite = o.site && o.site !== "ask" ? o.site : null;       // i18n-ignore  arg value
      this._forcedMode = o.mode && o.mode !== "ask" ? o.mode : null;       // i18n-ignore  arg value
      // An explicit destination from a plugin command wins over both arrival
      // tables; otherwise the profile decides where the party ends up.
      this._destination = o.destination || null;
      this._threeReady = typeof THREE !== "undefined";
    }

    create() {
      super.create();
      this.createBackground();
      this._env = sampleEnvironment();
      this._time = 0;
      this._done = new Set();
      this._skipHold = 0;
      this._finished = false;
      this._dragging = false;
      this._lastTouch = null;

      if (!this._threeReady) {
        this._fail();
        return;
      }
      if (this._forcedSite && SITES[this._forcedSite] && this._forcedMode) {
        this._beginFlight(this._forcedSite, this._forcedMode);
      } else {
        this._card = new SiteCard(this._env, this._forcedMode);
        if (this._forcedSite && SITES[this._forcedSite]) {
          this._card.index = SITE_ORDER.indexOf(this._forcedSite);
        }
        this.addChild(this._card.sprite);
      }
    }

    createBackground() {
      const s = new Sprite(new Bitmap(8, 8));
      s.bitmap.fillAll("#04070e");
      s.scale.set(Graphics.width / 8, Graphics.height / 8);
      this.addChild(s);
      this._bg = s;
    }

    _fail() {
      const layer = HUD ? HUD.layer() : null;
      if (layer) {
        HUD.text(layer.bitmap, t("hud.noThree"), 0, Math.round(layer.h / 2), layer.w, "center",
          HUD.PAL.red, 16);
        this.addChild(layer.sprite);
      }
      this._failed = true;
    }

    _beginFlight(siteId, profileId) {
      if (this._card) { this.removeChild(this._card.sprite); this._card = null; }
      const site = SITES[siteId] || SITES[SITE_ORDER[0]];
      this._site = site;
      this._profile = profileOf(profileId || "orbital");   // i18n-ignore  profile id
      this._destSite = this._profile.downrange ? otherSite(site.id) : null;
      this._cues = cuesFor(this._profile);

      // Rendered a little under native and scaled up with nearest filtering:
      // the same treatment every other 3D scene in the game gets.
      const scale = 0.88;
      const w = Math.round(Graphics.width * scale);
      const h = Math.round(Graphics.height * scale);
      this._stage = new LaunchStage(w, h, site, this._env, this._profile, this._destSite);
      this._stage.severity = hazardSeverity(this._env);

      const texture = PIXI.Texture.from(this._stage.domElement);
      if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      this._view = new PIXI.Sprite(texture);
      this._view.scale.set(Graphics.width / w, Graphics.height / h);
      this.addChild(this._view);

      this._hud = new LaunchHud(this._profile);
      this.addChild(this._hud.sprite);

      // The flash plate: white for the docking, red for a heavy strike.
      this._flash = new Sprite(new Bitmap(8, 8));
      this._flash.bitmap.fillAll("#ffffff");
      this._flash.scale.set(Graphics.width / 8, Graphics.height / 8);
      this._flash.opacity = 0;
      this.addChild(this._flash);

      if (HUD) HUD.onFontReady(() => { if (this._hud) this._hud.draw(this._state()); });

      // The map's music and ambience are put away for the duration. What
      // happens to them afterwards depends on whether the flight arrived: see
      // _leave.
      try { BattleManager.saveBgmAndBgs(); } catch (e) { /* no battle manager, no restore */ }
      this._audioTaken = true;

      this._time = 0;
      this._hud.push(t("telemetry.ready", {
        site: siteName(site.id),
        mode: t("mode." + this._profile.id + ".name"),
      }));
      se(SE.radio, 70);
    }

    // --- the loop ---------------------------------------------------------

    update() {
      super.update();
      // RMMZ drives Scene#update at a fixed step, so the flight is timed off
      // frames rather than a wall clock: the cinematic plays identically on a
      // machine that cannot hold 60.
      const dt = 1 / 60;

      if (this._failed) {
        if (Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered()) this._leave();
        return;
      }
      if (this._card) { this._updateSelect(dt); return; }
      if (!this._stage || this._finished) return;

      this._updateCameraInput(dt);
      this._time += dt;
      this._stage.update(dt, this._time);
      this._fireCues();
      this._drainStage();
      this._updateFlash(dt);
      this._hud.draw(this._state());
      if (this._view && this._view.texture) this._view.texture.update();
      this._stage.render();

      this._updateSkip(dt);
      if (this._time >= this._profile.start._total) this._finish();
    }

    _state() {
      const st = this._stage;
      return {
        time: this._time,
        phase: st ? st.phase : phaseAt(0, this._profile),
        alt: st ? st.alt : 0,
        vspeed: st ? st.vspeed : 0,
        integrity: st ? st.integrity : INTEGRITY_START,
        density: st ? st.density : 1,
        plates: st ? st.plates.length : 0,
        free: st ? st.isFreeLook : false,
        downrange: st ? st.downrange : 0,
        downrangeM: st ? st.downrangeM : 0,
        trackM: st ? st.trackM : 0,
        fromSite: this._site ? this._site.id : SITE_ORDER[0],
        toSite: this._destSite ? this._destSite.id : SITE_ORDER[0],
        env: this._env,
      };
    }

    // --- site selection ---------------------------------------------------

    _updateSelect(dt) {
      const c = this._card;
      c.update(dt);
      if (Input.isRepeated("right") || Input.isRepeated("down")) c.move(1);
      else if (Input.isRepeated("left") || Input.isRepeated("up")) c.move(-1);

      if (TouchInput.isMoved() || TouchInput.isTriggered()) {
        const i = c.hitTest(TouchInput.x, TouchInput.y);
        if (i >= 0 && i !== c.index) { c.index = i; se(SE.cursor, 70); }
      }
      if (Input.isTriggered("ok") || (TouchInput.isTriggered() && c.hitTest(TouchInput.x, TouchInput.y) >= 0)) {
        if (c.confirm()) this._beginFlight(c.siteId, c.profileId);
        return;
      }
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        if (c.back()) this._leave();
      }
    }

    // --- the camera, in the player's hands --------------------------------

    // Drag to swing round the vehicle, wheel to pull back, arrows or the right
    // stick to do the same from a pad, and OK to hand the framing back to the
    // director. Available in every phase including the countdown, so the
    // launch can be watched from the top of the mast or from out at sea.
    _updateCameraInput(dt) {
      const st = this._stage;

      if (TouchInput.isPressed()) {
        if (this._lastTouch) {
          const dx = TouchInput.x - this._lastTouch.x;
          const dy = TouchInput.y - this._lastTouch.y;
          if (Input.isPressed("shift") || Input.isPressed("control")) {
            st.applyPan(-dx / Graphics.width, dy / Graphics.height);
          } else {
            st.applyLook(-dx * 0.006, -dy * 0.005);
          }
        }
        this._lastTouch = { x: TouchInput.x, y: TouchInput.y };
      } else {
        this._lastTouch = null;
      }

      const wheel = TouchInput.wheelY || 0;
      if (wheel) st.applyZoom(wheel > 0 ? 1.12 : 0.89);

      const kx = (Input.isPressed("right") ? 1 : 0) - (Input.isPressed("left") ? 1 : 0);
      const ky = (Input.isPressed("down") ? 1 : 0) - (Input.isPressed("up") ? 1 : 0);
      if (kx || ky) {
        if (Input.isPressed("shift")) st.applyZoom(1 + ky * dt * 1.2);
        else st.applyLook(-kx * dt * 1.5, -ky * dt * 1.1);
      }
      if (Input.isPressed("pageup")) st.applyZoom(1 - dt * 1.4);
      if (Input.isPressed("pagedown")) st.applyZoom(1 + dt * 1.4);

      // The right stick, through the shared analog helper, so this behaves
      // like every other camera in the game on a pad.
      const A = window.AnalogStickInput;
      if (A && typeof A.right === "function") {
        const v = A.right();
        if (v && (v.x || v.y)) st.applyLook(-v.x * dt * 2.2, -v.y * dt * 1.6);
      }

      if (Input.isTriggered("ok")) { st.recenter(); se(SE.cursor, 60); }
    }

    // --- cues, sound and the log -------------------------------------------

    _fireCues() {
      const prof = this._profile;
      this._cues.forEach((cue, i) => {
        if (this._done.has(i)) return;
        const [key, frac] = cue.at;
        const at = prof.start[key];
        const phase = prof.phases.find((p) => p.key === key);
        if (at == null || !phase || this._time < at + frac * phase.dur) return;
        this._done.add(i);
        // A cue with no key is a music change and nothing else: it exists to
        // put a track on a beat without also printing a line about it.
        if (cue.key) {
          this._hud.push(t("telemetry." + cue.key, {
            site: siteName(this._site.id),
            dest: this._destSite ? siteName(this._destSite.id) : "",
            alt: altText(this._stage.alt),
            pct: pctText(this._stage.integrity),
          }));
        }
        if (cue.music) bgm(cue.music);
        if (cue.se) se(cue.se, cue.vol == null ? 75 : cue.vol);
      });
    }

    _drainStage() {
      this._stage.drainSe().forEach((c) => se(c.name, c.volume, c.pitch, c.pan));
      this._stage.drainLog().forEach((l) => this._hud.push(l.text));
    }

    _updateFlash(dt) {
      const st = this._stage;
      let target = 0;
      let color = "#ffffff";
      if (st.impactFlash > 0) { target = st.impactFlash * 90; color = "#ff5a3c"; }
      if (st.phase.key === "aboard" || st.phase.key === "arrived") {
        target = Math.max(target, 255 * smooth(st.phase.progress));
        color = "#ffffff";
      }
      if (st.bolt && st.bolt.intensity > 1) target = Math.max(target, 60);
      if (this._flashColor !== color) {
        this._flash.bitmap.fillAll(color);
        this._flashColor = color;
      }
      this._flash.opacity = this._flash.opacity + (target - this._flash.opacity) * Math.min(1, dt * 12);
    }

    // --- skipping and leaving ----------------------------------------------

    _updateSkip(dt) {
      if (Input.isPressed("cancel")) {
        this._skipHold += dt;
        if (this._skipHold > 0.6) { se(SE.back, 80); this._finish(); }
      } else {
        this._skipHold = 0;
      }
    }

    _finish() {
      if (this._finished) return;
      this._finished = true;
      // Whatever is left of the vehicle is what arrives, and the number is
      // kept: the ship's log, the diary and anything else that wants to know
      // how bad the crossing was can read it off the game system.
      try {
        $gameSystem._rocketLaunch = {
          site: this._site ? this._site.id : null,
          mode: this._profile ? this._profile.id : null,
          destination: this._destSite ? this._destSite.id : null,
          integrity: this._stage ? Math.round(this._stage.integrity * 10) / 10 : INTEGRITY_FLOOR,
          weather: this._env.weather,
          night: this._env.night,
        };
      } catch (e) { /* no save: the flight still happened */ }
      this._board();
    }

    // Where the party walks out. A plugin command may name a map outright;
    // otherwise the arrival tables at the top of this file decide, and a
    // suborbital arrival with no map of its own falls back to the world square
    // the destination pad stands on.
    _board() {
      const explicit = this._destination;
      const hop = this._profile && this._profile.downrange;
      const target = explicit || (hop
        ? SUBORBITAL_ARRIVAL[this._destSite ? this._destSite.id : ""]
        : ORBITAL_ARRIVAL);

      try {
        if (!explicit && hop && (!target || !target.mapId)) {
          const dest = this._destSite || otherSite(this._site.id);
          const wm = window.WorldMapReturn;
          if (wm && typeof wm.enterProceduralSquareAt === "function" &&
            wm.enterProceduralSquareAt(dest.world.x, dest.world.y,
              target && target.x ? target.x : undefined,
              target && target.y ? target.y : undefined,
              (target && target.dir) || 2)) {
            this._transferred = true;
            this._leave();
            return;
          }
        }
        const d = target || ORBITAL_ARRIVAL;
        const vehicles = window.MergedVehicleSystem;
        if (vehicles && typeof vehicles.enterAirshipInterior === "function" && d.mapId === ORBITAL_ARRIVAL.mapId) {
          vehicles.enterAirshipInterior({ silent: true });
        }
        if (d.mapId) {
          $gamePlayer.reserveTransfer(d.mapId, d.x, d.y, d.dir || 8, 0);
          this._transferred = true;
        }
      } catch (e) { /* the map will sort itself out */ }
      this._leave();
    }

    _leave() {
      if (this._left) return;
      this._left = true;
      this._releaseAudio();
      SceneManager.goto(Scene_Map);
    }

    // A flight that ARRIVED somewhere must not drag the launch site's town
    // theme through the airlock with it: the music is stopped and the
    // destination map starts its own. A flight that never left the selection
    // card, or that failed to transfer, gives the map back what it had.
    _releaseAudio() {
      if (!this._audioTaken) return;
      this._audioTaken = false;
      try {
        if (this._transferred) AudioManager.stopBgm();
        else BattleManager.replayBgmAndBgs();
      } catch (e) { /* the next map scene will sort the audio out */ }
    }

    terminate() {
      super.terminate();
      if (this._stage) { this._stage.dispose(); this._stage = null; }
      if (this._view) { this.removeChild(this._view); this._view = null; }
    }
  }

  // ==========================================================================
  // Entry points
  // ==========================================================================

  function hashOf(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function start(opts) {
    const o = opts || {};
    SceneManager.push(Scene_RocketLaunch);
    SceneManager.prepareNextScene(o);
  }

  PluginManager.registerCommand("RocketLaunchPlugin", "launch", (args) => {
    start({ site: args.site || "ask", mode: args.mode || "ask" });   // i18n-ignore  arg values
  });

  PluginManager.registerCommand("RocketLaunchPlugin", "launchTo", (args) => {
    start({
      site: args.site || "ask",   // i18n-ignore  arg value
      mode: args.mode || "ask",   // i18n-ignore  arg value
      destination: {
        mapId: Number(args.mapId) || ORBITAL_ARRIVAL.mapId,
        x: Number(args.x) || 0,
        y: Number(args.y) || 0,
        dir: Number(args.dir) || 8,
      },
    });
  });

  window.RocketLaunch = {
    name: PLUGIN_FILE,
    start,
    SITES,
    SITE_ORDER,
    PROFILES,
    PROFILE_ORDER,
    ORBITAL_ARRIVAL,
    SUBORBITAL_ARRIVAL,
    BGM,
    pickTrack,
    CUES: { orbital: ORBITAL_CUES, suborbital: SUBORBITAL_CUES },
    MODEL,
    Scene: Scene_RocketLaunch,
    // The 3D stage, the HUD and the selection card, published so the test
    // suite can build them against a headless THREE and step a whole flight
    // without a GPU.
    Stage: LaunchStage,
    Hud: LaunchHud,
    Card: SiteCard,
    sampleEnvironment,
    nearestSite,
    // The scene keeps what the last flight cost; the ship's own systems read
    // it from here rather than digging into $gameSystem.
    lastFlight() {
      try { return $gameSystem._rocketLaunch || null; } catch (e) { return null; }
    },
  };
})();
