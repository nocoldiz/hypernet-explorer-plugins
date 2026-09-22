/*:
 * @target MZ
 * @plugindesc Rocket Launch - the coilgun cinematic: countdown, magnetic release, the burn, the Kessler belt and the docking with the starship, or the suborbital hop between the pads.
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
 *   RENDEZVOUS  the starship, closing to a few tens of metres
 *   DOCK        the long walk into the collar, the clamp, the interior map
 *
 * The climb carries a BOOST STAGE: it lights at ignition, burns to the far
 * side of the belt and is thrown away the moment the tanks are dry - or the
 * moment something in the belt opens them, which is louder and costs the
 * flight nothing, because the burn it was carrying has already been made. A
 * round that starts in orbit carries no stage, and with Earth gone there is
 * no air to punch out of and no stage either.
 *
 * ---------------------------------------------------------------------------
 * DEORBIT - the way home, and the orbital flight read backwards
 * ---------------------------------------------------------------------------
 * Never picked on the card. It is what an orbital crossing BECOMES when the
 * pad it leaves is in orbit and the pad it is aimed at stands on a planet that
 * still exists - the starship to Apulia, Greenwich, the tower or a vault. The
 * ship's own rail fires the round DOWNWARD and everything the climb met comes
 * the other way round.
 *
 *   COIL        the same gun, pointed at the planet
 *   RETRO       the retrograde burn, and the only thing that burns
 *   KESSLER     the belt again, streaming up past a falling round
 *   REENTRY     plasma: the shock stands off the nose from 90 km
 *   TERMINAL    the canopy, and the receiving gun coming up underneath
 *   CAPTURE     down the bore, braked magnetically, exactly like a hop
 *
 * ---------------------------------------------------------------------------
 * LUNAR - four stages, and the middle one is not a rocket
 * ---------------------------------------------------------------------------
 * The Moon is on every orbital crossing's destination list, from every pad,
 * because what makes the crossing is not the gun: it is the LIMINAL ENGINE the
 * round carries between the bullet and the boost stage. It does not push. At
 * the top of the climb it takes the three hundred and eighty-four thousand
 * kilometres between the round and the Moon and makes them a distance the
 * round is already at the other end of, and it does it in nine seconds.
 *
 * From a pad on the ground the first eight beats ARE the orbital flight - the
 * rail, the coast, the burn, the belt - and then:
 *
 *   SHROUD      the armoured sleeve over the drive is blown, and the round
 *               turns until the Moon is dead ahead
 *   LIMINAL     the drive spools. Nothing moves yet; the light does
 *   TRANSIT     the range collapses, under the same lens the camper wears at
 *               speed in the voxel world
 *   SKIM        across the regolith, low enough to read boulders
 *   TOUCHDOWN   onto the lit apron at the Moon base
 *
 * THE SLEEVE is the point of the design. A drive that has to survive the belt
 * goes up inside an armour belt of its own, thicker than any plate on the
 * hull, and it is the one thing aboard the belt is not allowed to take: the
 * hull arrives at two per cent and the engine arrives untouched. A flight
 * leaving a pad that is ALREADY IN ORBIT - the starship, the Omega Tower, or
 * the patron's vault once 21 December 2012 has left it hanging in the dark -
 * crosses no belt and punches out of no air, so it is fitted with no sleeve
 * and carries no boost stage: the gun throws it, it drifts clear, the drive
 * lights, and that is the whole flight.
 *
 * WHERE IT PUTS THE PARTY. The Moon is a WORLD and not a map, so the arrival
 * is GalaxySim's (landAtSpaceport) and not this plugin's: EVA suits, the
 * square of the Moon's own landing grid the base stands on, and the Alien
 * biome everything generated around it generates as. It lands WITHOUT the
 * ship - nothing is parked on the apron, because a round is not a starship -
 * so the party walks out onto the regolith on foot and Return to Ship stays
 * lit in the menu for as long as they are up there.
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
 * THE GUN IS LAID OVER FOR A HOP, and only for a hop. A round thrown straight
 * up comes straight back down on the pad it left: a ballistic throw needs an
 * elevation, so the whole installation is trunnioned and tipped downrange by
 * HOP_ELEVATION, and the receiving gun at the far end is tipped the other way
 * so its muzzle is looking back up the track at what is coming. Everything
 * else in the plugin is fired straight up or straight down and the barrel
 * stands vertical, as it always did.
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
 * The radio
 * ---------------------------------------------------------------------------
 * Every line in the log is said by somebody and the log says who. MISSION
 * CONTROL is neutral and never varies - it is a room reading instruments, and
 * it sounds the same whoever is aboard. The beats that belong to the people
 * inside the vehicle are spoken by a party member in the voice of their own
 * personality, and who speaks ROTATES down the party, so the same launch reads
 * differently with a different party in it. The twenty-five archetypes in
 * PersonalityData.json are gathered into six registers by VOICE_OF and the
 * bank is written once per register; a member on one of the creature classes
 * is never cast, because class 63 and up hold no conversation anywhere.
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
 *
 * THE VAULT PAD: a savegame that has met a patron's vault gets a third pad,
 * the vault itself, which a flight may leave from or come down on. It is named
 * after the patron who holds the LAST vault the party visited
 * (PatreonRewards.ownHatch), it sits at that square's real latitude and
 * longitude, and its gun is a SHAFT running the nine floors of the vault with
 * the hatch as its muzzle. A flight arriving there comes out on Floor -3.
 *
 * THE PADS, AND WHAT 21 DECEMBER 2012 DOES TO THEM
 *
 *   APULIA      the Ionian yard. On Earth.
 *   GREENWICH   the meridian mast. On Earth.
 *   OMEGA TOWER the tower IS the gun, all of it.
 *   STARSHIP    the ship's own rail, in orbit. Departures as well as arrivals.
 *   VAULT       the shaft under a patron's vault, if this savegame knows one.
 *
 * Switch 199 ("EarthDestroyed") is raised the day Nibiru strikes. From that
 * day: Apulia and Greenwich are gone with the ground they stood on, the
 * suborbital hop cannot be flown at all (there is no ground left to throw a
 * round across), the Kessler belt is no longer up there to fly through, the
 * Earth itself is off the far scene - and with it the belt seen at distance in
 * the far scene and every descent, since there is nothing left to come down
 * to - and the only crossings left are between
 * the Omega Tower, the starship and the vault - which by then is a chunk of
 * rock with a lit hatch in it.
 *   lastFlight()       what the last flight cost, off $gameSystem
 *   MODEL              the pure flight model, used by the tests
 *   MODEL.altitudeAt(t, prof)        metres at t seconds
 *   MODEL.downrangeAt(t, prof)       0..1 along the ground track
 *   MODEL.phaseAt(t, prof)           { key, local, progress }
 *   MODEL.integrityAt(alt,sev,prof)  hull percentage remaining
 *   MODEL.hazardSeverity(env)        weather/light multiplier on the belt
 *   MODEL.tapeFraction(alt, prof)    0..1 position on the altimeter tape
 *   MODEL.speedAt(t, prof, trackM)   speed over the ground, m/s
 *   MODEL.greatCircleM(a, b)         metres between two sites
 *
 * LOAD ORDER: after GalaxySim_Core.js. Uses GalaxySim_Renderer3D for the
 * Earth and the debris mesh and GalaxySim_ShipModel for the starship, and
 * degrades to its own simpler bodies when either is absent. Requires THREE.
 *
 * @command launch
 * @text Launch
 * @desc Plays the launch cinematic. The flight plan and where it comes down are always the player's to choose.
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
 * @option The patron's vault - the last one visited
 * @value vault
 * @option Omega Tower
 * @value omega
 * @option Starship
 * @value ship
 * @option The Moon - the base at the lunar spaceport
 * @value moon
 * @option The Monument - Zeta Reticuli B, thirty-nine light years
 * @value zeta
 * @option Titania - the human embassy, in Andromeda
 * @value titania
 * @default ask
 * @desc Which pad the flight leaves from. The flight plan and where it comes down are never set here: the player is always asked.
 *
 * @command launchTo
 * @text Launch to map
 * @desc As Launch, but lands the party on a map of your choosing instead of the profile's own arrival.
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
 * @option The patron's vault - the last one visited
 * @value vault
 * @option Omega Tower
 * @value omega
 * @option Starship
 * @value ship
 * @option The Moon - the base at the lunar spaceport
 * @value moon
 * @option The Monument - Zeta Reticuli B, thirty-nine light years
 * @value zeta
 * @option Titania - the human embassy, in Andromeda
 * @value titania
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

  // A gun mounted on a ship is a fraction of the size of one poured into the
  // ground, so where the round sits in its throat is the pad's own number.
  function loadYOf(site) {
    return site && site.loadY != null ? site.loadY : RAIL_LOAD_Y;
  }

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
    // Up the barrel. See the note above: each ring adds to what the last one
    // gave it, so the round barely moves for the first third of the bore and
    // is gone in the last.
    gun: (k) => k * k * k,
    // And down one, which is the same thing with the coils run in reverse.
    brake: (k) => 1 - Math.pow(1 - k, 3),
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
    { key: "coil", dur: 2.4, from: 0, to: RAIL_LEN_M, ease: "gun" },
    { key: "coast", dur: 8.0, from: RAIL_LEN_M, to: IGNITION_M, ease: "ballistic" },
    { key: "ignition", dur: 2.0, from: IGNITION_M, to: 62000, ease: "smooth" },
    { key: "burn", dur: 10.0, from: 62000, to: KESSLER_IN_M, ease: "accel" },
    { key: "kessler", dur: 16.0, from: KESSLER_IN_M, to: KESSLER_OUT_M, ease: "linear" },
    { key: "clear", dur: 5.0, from: KESSLER_OUT_M, to: DOCK_M, ease: "decel" },
    // The last three beats are the arrival, and they are long on purpose:
    // the round closes on the ship, stops a few metres off the collar, and is
    // walked in from there. A dock is the slowest thing in the cinematic.
    { key: "rendezvous", dur: 12.0, from: DOCK_M, to: DOCK_M, ease: "linear" },
    { key: "dock", dur: 14.0, from: DOCK_M, to: DOCK_M, ease: "linear" },
    { key: "aboard", dur: 4.0, from: DOCK_M, to: DOCK_M, ease: "linear" },
  ];

  // The parabola tops out well below the belt, which is the whole point of
  // taking it: 180 km is above the air and below anything that could hit you.
  const SUB_APOGEE_M = 180000;

  const SUBORBITAL_PHASES = [
    { key: "hold", dur: 3.0, from: 0, to: 0, ease: "linear", dFrom: 0, dTo: 0 },
    { key: "countdown", dur: COUNTDOWN_S, from: 0, to: 0, ease: "linear", dFrom: 0, dTo: 0 },
    { key: "coil", dur: 2.4, from: 0, to: RAIL_LEN_M, ease: "gun", dFrom: 0, dTo: 0.004, dEase: "accel" },
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
    { key: "capture", dur: 5.0, from: RAIL_LEN_M, to: 0, ease: "brake", dFrom: 1, dTo: 1 },
    { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear", dFrom: 1, dTo: 1 },
  ];

  // DEORBIT is the orbital flight run backwards, and it is the only way home
  // from the ship while there is still a home to come down to. The ship's own
  // rail fires the round DOWN, the retro burn drops it out of orbit, and
  // everything the climb met it meets in the other order: the belt first, with
  // the planet growing underneath it the whole way, then the air, then the
  // receiving gun on the ground. The first three beats are the launching
  // sequence unchanged - a gun is a gun whichever way it is pointed - so the
  // count, the rings and the release all read exactly as they do from a pad.
  const DEORBIT_PHASES = [
    { key: "hold", dur: 3.0, from: DOCK_M, to: DOCK_M, ease: "linear" },
    { key: "countdown", dur: COUNTDOWN_S, from: DOCK_M, to: DOCK_M, ease: "linear" },
    { key: "coil", dur: 2.4, from: DOCK_M, to: DOCK_M - RAIL_LEN_M, ease: "gun" },
    // NOTHING BURNS ON THE WAY HOME. The ship's gun threw the round at the
    // planet and the planet does the rest: what this beat is, is the fall
    // getting away from it, ending at the top of the belt.
    { key: "fall", dur: 8.0, from: DOCK_M - RAIL_LEN_M, to: KESSLER_OUT_M, ease: "accel" },
    { key: "kessler", dur: 16.0, from: KESSLER_OUT_M, to: KESSLER_IN_M, ease: "linear" },
    { key: "clear", dur: 5.0, from: KESSLER_IN_M, to: 120000, ease: "decel" },
    { key: "reentry", dur: 9.0, from: 120000, to: 24000, ease: "accel" },
    { key: "terminal", dur: 6.0, from: 24000, to: RAIL_LEN_M, ease: "decel" },
    { key: "capture", dur: 5.0, from: RAIL_LEN_M, to: 0, ease: "brake" },
    { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear" },
  ];

  // ==========================================================================
  // LUNAR - the third flight plan, and the one the liminal engine exists for
  // ==========================================================================
  //
  // The Moon is three hundred and eighty-four thousand kilometres away and the
  // cinematic gives it nine seconds, because the middle stage does not cross
  // the distance: it takes the distance out. From the ground the climb is the
  // orbital flight word for word - the rail, the coast, the circularisation
  // burn, the belt - and then everything changes:
  //
  //   SHROUD      the armoured sleeve over the liminal engine is blown, and
  //               the round turns until the Moon is dead ahead
  //   LIMINAL     the drive spools. Nothing moves yet. The light does
  //   TRANSIT     the range collapses from the belt's far side to sixty
  //               kilometres in nine seconds
  //   SKIM        across the surface, low enough to read the craters
  //   TOUCHDOWN   onto the pad at the Moon base
  //
  // The altitude column is read as RANGE TO THE NEAREST SURFACE: above the
  // belt it is height over Earth, and from the transit on it is height over
  // the Moon. The two meet at the top of the climb, which is precisely what
  // the drive is for - a liminal crossing has no middle to be in.
  const MOON_DIST_M = 384400000;
  const MOON_R_M = 1737400;
  // Where the transit hands the flight back to the eye: sixty kilometres up,
  // which over a world with no air is close enough to read boulders off.
  const MOON_ARRIVE_M = 60000;
  // Where the circuit ends and the descent begins.
  const MOON_FLYBY_M = 24000;
  const MOON_SKIM_M = 2500;

  // The tail of every lunar flight, and it is the same tail whether the round
  // left a coast or a hangar: once the drive is lit, where it started stopped
  // mattering.
  function lunarTail(from) {
    return [
      { key: "liminal", dur: 3.0, from: from, to: from, ease: "linear" },
      { key: "transit", dur: 9.0, from: from, to: MOON_ARRIVE_M, ease: "linear", geo: true },
      // Round the Moon, and the shape of the circuit is rolled per launch.
      { key: "flyby", dur: 8.0, from: MOON_ARRIVE_M, to: MOON_FLYBY_M, ease: "linear" },
      { key: "skim", dur: 4.0, from: MOON_FLYBY_M, to: MOON_SKIM_M, ease: "decel" },
      { key: "touchdown", dur: 3.5, from: MOON_SKIM_M, to: 0, ease: "decel" },
      { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear" },
    ];
  }

  // How far a round thrown out of a gun that is already in space gets on the
  // throw alone, before there is room to light something that bends space.
  const LUNAR_DRIFT_M = DOCK_M + 40000;

  // THE HEAD: how the round gets off the thing it was standing on.
  //
  // FROM THE GROUND it is the orbital flight word for word - the rail, the
  // coast, the circularisation burn, the belt - because up to the far side of
  // the junk a crossing to anywhere IS an orbital crossing. The sleeve over
  // the drive comes off at the end of it and nowhere else: it was carried
  // through the belt for exactly that reason and it is dead weight the moment
  // the belt is behind the round.
  //
  // FROM A PAD ALREADY IN SPACE - the starship, the Omega Tower, the vault
  // after the impact, and the three offworld bases - there is no air to punch
  // out of and no belt to cross, so there is nothing to armour the drive
  // against: no sleeve is fitted and no boost stage is carried. The gun throws
  // it, it drifts clear, and that is the whole head.
  // Which of the three a pad is. Asked here and nowhere else, so a pad that
  // gains or loses its sky - the vault, on 21 December 2012 - changes in one
  // place.
  function padKind(site) {
    if (!site) return "earth";                                   // i18n-ignore  pad-kind ids
    if (site.orbital || site.noGround || earthGone()) return "vacuum";
    return site.noBelt ? "air" : "earth";
  }

  function crossingHead(kind) {
    const fromOrbit = kind === true || kind === "vacuum";        // i18n-ignore  pad-kind id
    if (kind === "air") {                                        // i18n-ignore  pad-kind id
      // The climb, with the belt cut out of the middle of it: the round goes
      // up through weather exactly as it does off Earth and then simply keeps
      // going, because there is nothing in this sky that anybody left there.
      return {
        phases: ORBITAL_PHASES.slice(0, 6).concat([
          { key: "cleanSky", dur: 6.0, from: KESSLER_IN_M, to: DOCK_M, ease: "decel" },
        ]),
        top: DOCK_M,
        belt: false,
      };
    }
    if (fromOrbit) {
      return {
        phases: [
          { key: "hold", dur: 3.0, from: DOCK_M, to: DOCK_M, ease: "linear" },
          { key: "countdown", dur: COUNTDOWN_S, from: DOCK_M, to: DOCK_M, ease: "linear" },
          { key: "coil", dur: 2.4, from: DOCK_M, to: DOCK_M + RAIL_LEN_M, ease: "gun" },
          { key: "drift", dur: 5.0, from: DOCK_M + RAIL_LEN_M, to: LUNAR_DRIFT_M, ease: "decel" },
        ],
        top: LUNAR_DRIFT_M,
        belt: false,
      };
    }
    return {
      phases: ORBITAL_PHASES.slice(0, 8).concat(
        [{ key: "shroud", dur: 3.0, from: DOCK_M, to: DOCK_M, ease: "linear" }]
      ),
      top: DOCK_M,
      belt: true,
    };
  }

  // A whole crossing: a head, and the tail that knows where it is going.
  function crossing(kind, tailOf) {
    const head = crossingHead(kind);
    return head.phases.concat(tailOf(head.top));
  }

  // ==========================================================================
  // ZETA RETICULI - the long one, on a stack of liminal engines
  // ==========================================================================
  //
  // Thirty-nine light years, and one liminal engine will not do it. The round
  // that goes to Zeta is a STACK of them, lit and thrown away one after the
  // other, and between the stages the corridor outside the hull goes through
  // everything a hyperspace corridor has ever been asked to be:
  //
  //   SOLOMON     the gate: a square shaft of hard-edged colour slabs rushing
  //               the eye down a slit-scan perspective, the way 2001 shoots it
  //   HEXSPACE    the colour drains toward one cold blue, the shaft tears out
  //               of true, and something is in here with the round
  //   THE WHITE   the ground floods to white, everything drawn goes black, and
  //               four-dimensional solids turn in their own planes as they
  //               pass the hull
  //
  // That is not a new effect: it is the corridor the ship window already draws
  // above 10x on the warp slider, and GalaxySim.HyperWarp publishes the maths
  // of it. This is that corridor built out of geometry instead of painted flat,
  // so the round can fly down the middle of it.
  //
  // The whole crossing is a minute and a half. It is supposed to be: the Moon
  // is nine seconds away and Zeta Reticuli is not the Moon.
  // Where the corridor puts the round: alongside the nearer sun and its shell.
  // On the altitude column this is a range like any other, and it is a long
  // one, because a star is a long way from anything it is not.
  const ZETA_STAR_M = 180000;
  const ZETA_ARRIVE_M = 90000;
  const ZETA_FLYBY_M = 30000;
  const ZETA_SKIM_M = 3000;
  // How many liminal stages the stack carries, and it is the reason the round
  // is twice the length of the one that goes to the Moon.
  const ZETA_STAGES = 3;

  function zetaTail(top) {
    return [
      { key: "liminal", dur: 4.0, from: top, to: top, ease: "linear" },
      // Stage one, and the corridor opens: the slabs, in colour.
      { key: "solomon", dur: 13.0, from: top, to: top * 0.72, ease: "linear" },
      // Stage two. The colour goes out of it.
      { key: "hexspace", dur: 13.0, from: top * 0.72, to: top * 0.44, ease: "linear" },
      // Stage three, the last one, and there is no colour left anywhere.
      { key: "thewhite", dur: 14.0, from: top * 0.44, to: top * 0.3, ease: "linear" },
      // Out the far end, with the binary and its two shells in the window.
      // Out beside the star, which is where the mass is and therefore where a
      // liminal crossing ends up.
      { key: "emerge", dur: 8.0, from: top * 0.3, to: ZETA_STAR_M, ease: "linear", geo: true },
      // Tanks off the shell. Nothing is burning and nothing is moving.
      { key: "refuel", dur: 7.0, from: ZETA_STAR_M, to: ZETA_STAR_M, ease: "linear" },
      // And across the system on the last of the stack, under power.
      { key: "transfer", dur: 10.0, from: ZETA_STAR_M, to: ZETA_ARRIVE_M, ease: "linear", geo: true },
      { key: "flyby", dur: 9.0, from: ZETA_ARRIVE_M, to: ZETA_FLYBY_M, ease: "linear" },
      { key: "skim", dur: 4.5, from: ZETA_FLYBY_M, to: ZETA_SKIM_M, ease: "decel" },
      { key: "touchdown", dur: 3.5, from: ZETA_SKIM_M, to: 0, ease: "decel" },
      { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear" },
    ];
  }

  // ==========================================================================
  // TITANIA - a different galaxy, and no drive crosses that
  // ==========================================================================
  //
  // Titania is in Andromeda. Two and a half million light years is not a
  // distance a liminal engine shortens, however many of them are stacked: it
  // is a distance nothing crosses, so the round does not cross it. It opens a
  // hole and goes through.
  //
  // But the SB jump drive cannot be lit from a standing start inside a
  // gravity well, so the flight is two halves:
  //
  //   JUPITER     a gravity assist. The round is thrown at Jupiter, falls
  //               around the back of it and comes out the far side with the
  //               planet's own orbital speed added to its own
  //   ESCAPE      out past the last of the planets, gathering the speed the
  //               assist bought, until there is nothing left to be inside of
  //   SB SPOOL    the jump drive, which has been dead weight the whole way
  //   WORMHOLE    the hole opens: a SPHERE, not a funnel, with the far sky
  //               wrapped round the front of it - the one thing Interstellar
  //               got right that every other film gets wrong
  //   THROAT      inside it
  //   EMERGE      Andromeda, and a hole four hundred thousand times the Sun
  //               with one acid ocean going round it
  const TITANIA_ARRIVE_M = 90000;
  const TITANIA_FLYBY_M = 30000;
  const TITANIA_SKIM_M = 3000;
  // Jupiter's own radius, which is the unit the whole of that leg is written
  // in: an approach to a body is only legible when the ranges are measured
  // against the body.
  const JUPITER_R_M = 69911000;
  // Thirty radii out, where it is a bright dot, in to under two at periapsis,
  // and back out to nine on the way away.
  const JUPITER_FAR_M = JUPITER_R_M * 30;
  const JUPITER_CLOSE_M = JUPITER_R_M * 1.7;
  const JUPITER_AWAY_M = JUPITER_R_M * 9;
  // Out past the last of the planets, where there is nothing left to be
  // inside of and the jump drive can be lit.
  const DEEP_SPACE_M = JUPITER_R_M * 600;
  // How far off Jupiter is DRAWN, in far-scene units, at the far end of the
  // cruise and at the near end of it. Both are inside the far camera's plane
  // and both are well outside the sphere itself, which is 672 units across.
  const JUPITER_FAR_D = 17500;
  const JUPITER_NEAR_D = 11000;

  function titaniaTail(top) {
    return [
      // Away from Earth and out toward Jupiter. The column stops being height
      // over one world and becomes range to the next; the two meet here, which
      // is what this beat is for.
      { key: "cruise", dur: 9.0, from: top, to: JUPITER_FAR_M, ease: "linear", geo: true },
      // In. Thirty Jupiter radii to under two, closing by a constant factor a
      // second, which is a planet that grows steadily into the whole window.
      { key: "jupiter", dur: 13.0, from: JUPITER_FAR_M, to: JUPITER_CLOSE_M, ease: "linear", geo: true },
      // Round the back of it and out the far side faster. The range opening
      // again IS the assist.
      { key: "assist", dur: 9.0, from: JUPITER_CLOSE_M, to: JUPITER_AWAY_M, ease: "linear", geo: true },
      // Out past the last of the planets. Nothing burns; Jupiter did the work.
      { key: "escape", dur: 11.0, from: JUPITER_AWAY_M, to: DEEP_SPACE_M, ease: "linear", geo: true },
      // The drive that has been dead weight since the pad.
      { key: "sbspool", dur: 6.0, from: DEEP_SPACE_M, to: DEEP_SPACE_M, ease: "linear" },
      { key: "wormhole", dur: 10.0, from: DEEP_SPACE_M, to: DEEP_SPACE_M * 0.6, ease: "linear" },
      { key: "throat", dur: 11.0, from: DEEP_SPACE_M * 0.6, to: DEEP_SPACE_M * 0.2, ease: "linear" },
      { key: "emerge", dur: 8.0, from: DEEP_SPACE_M * 0.2, to: TITANIA_ARRIVE_M, ease: "linear", geo: true },
      { key: "flyby", dur: 9.0, from: TITANIA_ARRIVE_M, to: TITANIA_FLYBY_M, ease: "linear" },
      { key: "skim", dur: 4.5, from: TITANIA_FLYBY_M, to: TITANIA_SKIM_M, ease: "decel" },
      { key: "touchdown", dur: 3.5, from: TITANIA_SKIM_M, to: 0, ease: "decel" },
      { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear" },
    ];
  }

  // Every crossing in the plugin, by the world it is aimed at and whether the
  // pad it leaves is already in space. TAILS is the only place that says what
  // a destination costs; everything else asks it.
  const TAILS = { moon: lunarTail, zeta: zetaTail, titania: titaniaTail };   // i18n-ignore  world ids

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
    // The way down. Never offered on the card: it is what an orbital crossing
    // BECOMES when the pad it leaves is in orbit and the pad it is aimed at is
    // on a planet that still exists. See descentFrom().
    deorbit: {
      id: "deorbit",                      // i18n-ignore  profile id
      phases: DEORBIT_PHASES,
      start: startTable(DEORBIT_PHASES),
      // One stage, and it is the final one: no boost, no burn, nothing to
      // throw away. The gun does the only work anything does.
      stages: 1,
      belt: true,
      shedsArmour: true,
      tapeTop: 1400000,
      apogee: DOCK_M,
      downrange: false,
      descent: true,
    },
    // The six crossings - the Moon, Zeta Reticuli and Titania, each of them
    // from the ground and from space - are added by buildCrossings() below.
    // Not one of them is written out by hand: see CROSSINGS.
  };

  // The four worlds anything can be flown between.
  const BODIES = ["earth", "moon", "zeta", "titania"];   // i18n-ignore  world ids

  // WHICH ENGINE CROSSES THE GAP.
  //
  //   liminal    one drive, one collapse of the range. Earth and its Moon.
  //   corridor   a stack of three, down the Gate of Solomon, hexspace and the
  //              white desert. Anything involving Zeta Reticuli.
  //   sbcharge   a Schrodinger-Bohr charge. Anything involving Titania,
  //              because Andromeda is not a distance a drive shortens.
  function linkFor(from, to) {
    if (from === "titania" || to === "titania") return "sbcharge";   // i18n-ignore  link ids
    if (from === "zeta" || to === "zeta") return "corridor";
    return "liminal";
  }

  // ---- the links -----------------------------------------------------------

  // Earth to its own Moon, and back. One engine, one collapse.
  function linkLiminal(top) {
    return {
      phases: [
        { key: "liminal", dur: 3.0, from: top, to: top, ease: "linear" },
        { key: "transit", dur: 9.0, from: top, to: LINK_OUT_M, ease: "linear", geo: true },
      ],
      out: LINK_OUT_M, stages: 1, hyper: false, jump: false, assist: false,
    };
  }

  // The corridor. Three drives, thrown away one at a time, and the three
  // readings of the shaft between them.
  function linkCorridor(top) {
    return {
      phases: [
        { key: "liminal", dur: 4.0, from: top, to: top, ease: "linear" },
        { key: "solomon", dur: 13.0, from: top, to: top * 0.72, ease: "linear" },
        { key: "hexspace", dur: 13.0, from: top * 0.72, to: top * 0.44, ease: "linear" },
        { key: "thewhite", dur: 14.0, from: top * 0.44, to: LINK_OUT_M, ease: "linear" },
      ],
      out: LINK_OUT_M, stages: ZETA_STAGES, hyper: true, jump: false, assist: false,
    };
  }

  // THE SCHRODINGER-BOHR CHARGE.
  //
  // Not a drive at all. The round carries a PELLET, and at the bottom of a
  // gravity assist - where it is already travelling faster than it will ever
  // travel again under its own power - it drops it and gets out of the way.
  // What the pellet does is not an explosion in the ordinary sense: it is a
  // charge that has not decided whether it went off, and the round rides the
  // part of it that did.
  //
  // That throws it out past Pluto in seconds, and then past what anything is
  // supposed to be able to do, and the far side of THAT is somewhere with no
  // stars in it at all - gold, and briefly, and nobody aboard talks about it
  // afterwards. Then the Milky Way is behind and Andromeda is ahead.
  //
  // The assist it is dropped at is whatever mass is nearest: JUPITER on the way
  // out of the solar system, and Titania's own red moon on the way back.
  function linkCharge(top, from) {
    const fromTitania = from === "titania";   // i18n-ignore  world id
    const run = fromTitania
      ? [
        // No Jupiter out here. What there is, is a small red moon the colour
        // of the inside of a mouth, and it is enough.
        { key: "redmoon", dur: 11.0, from: top, to: REDMOON_CLOSE_M, ease: "linear", geo: true },
        { key: "charge", dur: 5.0, from: REDMOON_CLOSE_M, to: REDMOON_CLOSE_M, ease: "linear" },
        { key: "blast", dur: 6.0, from: REDMOON_CLOSE_M, to: JUPITER_AWAY_M, ease: "linear", geo: true },
      ]
      : [
        { key: "cruise", dur: 9.0, from: top, to: JUPITER_FAR_M, ease: "linear", geo: true },
        { key: "jupiter", dur: 13.0, from: JUPITER_FAR_M, to: JUPITER_CLOSE_M, ease: "linear", geo: true },
        // The pellet goes here, at the bottom of the well.
        { key: "charge", dur: 5.0, from: JUPITER_CLOSE_M, to: JUPITER_CLOSE_M, ease: "linear" },
        { key: "blast", dur: 6.0, from: JUPITER_CLOSE_M, to: JUPITER_AWAY_M, ease: "linear", geo: true },
        // Out past the last thing in the system with a name.
        { key: "pluto", dur: 9.0, from: JUPITER_AWAY_M, to: PLUTO_M, ease: "linear", geo: true },
      ];
    const tail = [
      // Faster than anything is meant to go, until the thing being travelled
      // through gives way.
      { key: "breach", dur: 7.0, from: fromTitania ? JUPITER_AWAY_M : PLUTO_M, to: DEEP_SPACE_M, ease: "linear", geo: true },
      // And the other side of it, which is gold.
      { key: "gods", dur: 8.0, from: DEEP_SPACE_M, to: DEEP_SPACE_M, ease: "linear" },
      // Then one galaxy behind and one ahead.
      { key: "crossing", dur: 11.0, from: DEEP_SPACE_M, to: LINK_OUT_M, ease: "linear", geo: true },
    ];
    return {
      phases: run.concat(tail),
      out: LINK_OUT_M, stages: 1, hyper: false, jump: true, assist: !fromTitania,
    };
  }

  const LINKS = { liminal: linkLiminal, corridor: linkCorridor, sbcharge: linkCharge };   // i18n-ignore  link ids

  // ---- the landings --------------------------------------------------------

  function landingMoon(top) {
    return [
      { key: "approach", dur: 6.0, from: top, to: MOON_ARRIVE_M, ease: "linear", geo: true },
      { key: "flyby", dur: 8.0, from: MOON_ARRIVE_M, to: MOON_FLYBY_M, ease: "linear" },
      { key: "skim", dur: 4.0, from: MOON_FLYBY_M, to: MOON_SKIM_M, ease: "decel" },
      { key: "touchdown", dur: 3.5, from: MOON_SKIM_M, to: 0, ease: "decel" },
      { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear" },
    ];
  }

  // Zeta: out beside the star, tanks off the shell, then across the system.
  function landingZeta(top) {
    return [
      { key: "emerge", dur: 8.0, from: top, to: ZETA_STAR_M, ease: "linear", geo: true },
      { key: "refuel", dur: 7.0, from: ZETA_STAR_M, to: ZETA_STAR_M, ease: "linear" },
      { key: "transfer", dur: 10.0, from: ZETA_STAR_M, to: ZETA_ARRIVE_M, ease: "linear", geo: true },
      { key: "flyby", dur: 9.0, from: ZETA_ARRIVE_M, to: ZETA_FLYBY_M, ease: "linear" },
      { key: "skim", dur: 4.5, from: ZETA_FLYBY_M, to: ZETA_SKIM_M, ease: "decel" },
      { key: "touchdown", dur: 3.5, from: ZETA_SKIM_M, to: 0, ease: "decel" },
      { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear" },
    ];
  }

  // Titania: out into Andromeda, and then the PLANET, which has to be come up
  // on properly rather than simply be underneath on the next beat.
  function landingTitania(top) {
    return [
      { key: "emerge", dur: 8.0, from: top, to: TITANIA_FAR_M, ease: "linear", geo: true },
      // The world itself, closing from a bright point to the whole window.
      { key: "approach", dur: 10.0, from: TITANIA_FAR_M, to: TITANIA_ARRIVE_M, ease: "linear", geo: true },
      { key: "flyby", dur: 9.0, from: TITANIA_ARRIVE_M, to: TITANIA_FLYBY_M, ease: "linear" },
      { key: "skim", dur: 4.5, from: TITANIA_FLYBY_M, to: TITANIA_SKIM_M, ease: "decel" },
      { key: "touchdown", dur: 3.5, from: TITANIA_SKIM_M, to: 0, ease: "decel" },
      { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear" },
    ];
  }

  // EARTH, and coming home is not the reverse of leaving.
  //
  // A round arriving from another star arrives with a speed nothing on Earth
  // can catch, so it does not try: it goes round the MOON first and leaves the
  // worst of that speed there. A lunar braking pass is free - the Moon does
  // not care - and it is the only reason anything survives the arrival.
  function landingEarth(top) {
    return [
      { key: "emerge", dur: 7.0, from: top, to: EARTH_FAR_M, ease: "linear", geo: true },
      // Round the back of the Moon, shedding the speed of a crossing.
      { key: "moonbrake", dur: 10.0, from: EARTH_FAR_M, to: DOCK_M, ease: "linear", geo: true },
      // And then it is an ordinary way down, which the plugin already knows.
      { key: "fall", dur: 7.0, from: DOCK_M, to: KESSLER_OUT_M, ease: "accel" },
      { key: "kessler", dur: 14.0, from: KESSLER_OUT_M, to: KESSLER_IN_M, ease: "linear" },
      { key: "clear", dur: 5.0, from: KESSLER_IN_M, to: 120000, ease: "decel" },
      { key: "reentry", dur: 9.0, from: 120000, to: 24000, ease: "accel" },
      { key: "terminal", dur: 6.0, from: 24000, to: RAIL_LEN_M, ease: "decel" },
      { key: "capture", dur: 5.0, from: RAIL_LEN_M, to: 0, ease: "brake" },
      { key: "arrived", dur: 3.0, from: 0, to: 0, ease: "linear" },
    ];
  }

  // Home, but to something already in orbit. The braking pass round the Moon
  // still happens - a crossing arrives far too fast to be caught by anything,
  // the ship included - and then it is the rendezvous the orbital flight ends
  // with, because that is what arriving at the ship IS.
  function landingEarthDock(top) {
    return [
      { key: "emerge", dur: 7.0, from: top, to: EARTH_FAR_M, ease: "linear", geo: true },
      { key: "moonbrake", dur: 10.0, from: EARTH_FAR_M, to: DOCK_M, ease: "linear", geo: true },
    ].concat(orbitalTail(DOCK_M));
  }

  const LANDINGS = {
    // i18n-ignore-start  world ids
    earth: landingEarth, moon: landingMoon, zeta: landingZeta, titania: landingTitania,
    // i18n-ignore-end
  };

  // The same table for a destination that is in orbit rather than on the
  // ground. Only Earth has both kinds of pad.
  const LANDINGS_DOCK = { earth: landingEarthDock };   // i18n-ignore  world id

  // Is this pad something a round docks with rather than lands on?
  //
  // A WORLD BASE IS NOT ONE, whatever else is true of it. The Moon carries the
  // orbital flag because there is no air and no belt over it - which is all
  // that flag has ever meant to the flight model - but a round aimed at it
  // SETS DOWN, on the lit apron at the base, and there is no earth2moonDock
  // table because there is nothing up there to dock with. Reading the flag as
  // "in orbit" asked for a crossing that does not exist, got nothing back and
  // quietly flew a plain climb to the starship instead: every flight to the
  // Moon, from every pad, lost its liminal drive, its circuit and its landing
  // while the card that offered it went on promising all three. A pad with a
  // world under it lands. Only a pad with no world under it docks.
  function padInOrbit(site) {
    return !!(site && (site.orbital || site.noGround) && !site.body);
  }

  // Where every link hands the flight over to its landing. One number, so a
  // link and a landing can never disagree about where they meet.
  const LINK_OUT_M = DOCK_M * 0.3;
  // Pluto's orbit, near enough, and the red moon of Titania at its closest.
  const PLUTO_M = JUPITER_R_M * 1400;
  const REDMOON_CLOSE_M = JUPITER_R_M * 1.2;
  const TITANIA_FAR_M = 2600000;
  const EARTH_FAR_M = 2200000;

  // How much of the vehicle each link throws away, and what it needs built.
  const CROSSINGS = {
    // i18n-ignore-start  world ids
    moon: { tapeTop: 1400000 },
    zeta: { tapeTop: 1400000 },
    titania: { tapeTop: DEEP_SPACE_M * 1.1 },
    earth: { tapeTop: 1400000 },
    // i18n-ignore-end
  };

  // i18n-ignore-start  pad-kind ids
  const PAD_KINDS = ["earth", "air", "vacuum"];
  const KIND_SUFFIX = { earth: "", air: "Air", vacuum: "Orbit" };
  // i18n-ignore-end

  function kindsFor(body) {
    // i18n-ignore-start  world and pad-kind ids
    if (body === "earth") return ["earth", "vacuum"];
    if (body === "moon") return ["vacuum"];
    return ["air", "vacuum"];
    // i18n-ignore-end
  }

  function buildCrossings() {
    BODIES.forEach((from) => {
      BODIES.forEach((to) => {
        if (from === to) return;
        const c = CROSSINGS[to];
        const link = LINKS[linkFor(from, to)];
        // A destination world with pads of both kinds needs a crossing for
        // each: see landingEarthDock.
        const arrivals = LANDINGS_DOCK[to] ? [false, true] : [false];
        arrivals.forEach((toOrbit) => {
        kindsFor(from).forEach((kind) => {
          // A pad in orbit over Earth and a pad on the ground at Apulia are
          // both on Earth; which sky the round is thrown through is the pad's
          // and which engine crosses the gap is the pair's.
          const head = crossingHead(kind);
          const mid = link(head.top, from);
          const landing = (toOrbit ? LANDINGS_DOCK[to] : LANDINGS[to])(mid.out);
          const phases = head.phases.concat(mid.phases, landing);
          const id = crossingId(from, to, kind, toOrbit);
          const vacuum = kind === "vacuum";   // i18n-ignore  pad-kind id
          PROFILES[id] = {
            id: id,
            world: to,
            fromWorld: from,
            link: linkFor(from, to),
            kind: kind,
            phases: phases,
            start: startTable(phases),
            // The rail's boost stage, the sleeve where there is a belt to
            // cross, and whatever the link itself throws away.
            stages: mid.stages + (vacuum ? 1 : (head.belt ? 3 : 2)),
            liminalStages: mid.stages,
            belt: head.belt,
            shedsArmour: head.belt,
            tapeTop: c.tapeTop,
            apogee: head.top,
            downrange: false,
            liminal: true,
            // Only a drive that has a belt to cross needs a sleeve to cross it.
            shroud: head.belt,
            lunar: true,
            fromOrbit: vacuum,
            hyper: !!mid.hyper,
            jump: !!mid.jump,
            assist: !!mid.assist,
            toOrbit: toOrbit,
          };
        });
        });
      });
    });
  }

  // "earth2moon", "zeta2earthOrbit", "titania2zetaAir", ...
  function crossingId(from, to, kind, toOrbit) {
    // i18n-ignore-next-line  profile id
    return from + "2" + to + (toOrbit ? "Dock" : "") + (KIND_SUFFIX[kind] || "");
  }

  buildCrossings();

  // The names the rest of the file and the tests know these by: the crossing
  // to a world off an Earth pad is what "moon", "zeta" and "titania" meant.
  ["moon", "zeta", "titania"].forEach((w) => {                    // i18n-ignore  world ids
    PAD_KINDS.forEach((kind) => {
      // "moonAir" and friends are the crossing to that world off a world with
      // weather and no belt - which is any of the offworld bases, so the alias
      // points at the one leaving the Monument. Earth has no "air" pad.
      const src = PROFILES[crossingId("earth", w, kind)] ||
        PROFILES[crossingId("zeta", w, kind)] ||
        PROFILES[crossingId("titania", w, kind)] ||
        PROFILES[crossingId("moon", w, kind)];
      if (src) PROFILES[w + (KIND_SUFFIX[kind] || "")] = src;
    });
  });
  PROFILES.lunar = PROFILES.moon;
  PROFILES.lunarOrbit = PROFILES.moonOrbit;

  // The last three beats of the ordinary crossing: the ship coming up off the
  // limb, the collar, and the walk into it. The only part of that plan that
  // does not depend on what the round was launched through.
  function orbitalTail(top) {
    return [
      { key: "rendezvous", dur: 12.0, from: top, to: top, ease: "linear" },
      { key: "dock", dur: 14.0, from: top, to: top, ease: "linear" },
      { key: "aboard", dur: 4.0, from: top, to: top, ease: "linear" },
    ];
  }

  // "orbital" off Earth, "orbitalAir" off a world with weather and no belt,
  // "orbitalOrbit" off a pad that is already in space.
  function orbitalId(kind) {
    return "orbital" + (KIND_SUFFIX[kind] || "");   // i18n-ignore  profile id
  }

  function buildOrbitals() {
    PAD_KINDS.forEach((kind) => {
      // Earth's own is the one already written out above, and the tests pin
      // its timings: it is left exactly as it is.
      if (kind === "earth") return;                  // i18n-ignore  pad-kind id
      const head = crossingHead(kind);
      // The head of a crossing ends with the sleeve coming off, and there is
      // no sleeve on a flight that is only going as far as the ship.
      const phases = head.phases.filter((p) => p.key !== "shroud")
        .concat(orbitalTail(head.top));
      const id = orbitalId(kind);
      PROFILES[id] = {
        id: id,
        kind: kind,
        phases: phases,
        start: startTable(phases),
        stages: kind === "vacuum" ? 1 : 2,           // i18n-ignore  pad-kind id
        belt: head.belt,
        shedsArmour: head.belt,
        tapeTop: 1400000,
        apogee: head.top,
        downrange: false,
      };
    });
  }

  buildOrbitals();

  const PROFILE_ORDER = ["orbital", "suborbital"];   // i18n-ignore  profile ids

  function profileOf(id) { return PROFILES[id] || PROFILES.orbital; }

  // The i18n key a plan is named under. A crossing is named for the world it
  // is aimed at, because that is the choice the player made; everything else
  // is named for itself.
  function modeKey(profile) {
    return (profile && (profile.world || profile.id)) || "orbital";   // i18n-ignore  profile id
  }

  function modeName(profile) { return t("mode." + modeKey(profile) + ".name"); }
  function modeBlurb(profile) { return t("mode." + modeKey(profile) + ".blurb"); }

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

  // The altitude of one beat at local progress k. Split out of altitudeAt
  // because two callers want it and because the geometric case is worth
  // naming: see the note above EASE.
  function beatAltitude(p, k) {
    const e = EASE[p.ease] || EASE.linear;
    const eased = e(clamp01(k));
    if (p.geo && p.from > 0 && p.to > 0) {
      return p.from * Math.pow(p.to / p.from, eased);
    }
    return p.from + (p.to - p.from) * eased;
  }

  function altitudeAt(time, profile) {
    const prof = profile || PROFILES.orbital;
    const ph = phaseAt(time, prof);
    const p = prof.phases[ph.index];
    if (p.geo) return beatAltitude(p, ph.progress);
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

  // Orbital speed at the top of the climb. The number the whole gun exists to
  // buy, and the one the air takes back on the way down.
  const ORBITAL_V = 7800;

  // Speed over the ground: the number a launch is actually about, and the one
  // the tape cannot show. The vertical component is the derivative of the
  // altitude curve. The horizontal one is the ground track for a hop, and for
  // anything that reaches orbit it is the orbital speed itself - bought by the
  // burn on the way up, given back to the air on the way down.
  function horizontalSpeedAt(time, profile, trackM) {
    const prof = profile || PROFILES.orbital;
    if (prof.downrange) {
      const dt = 0.05;
      const d = Math.abs(downrangeAt(time + dt, prof) - downrangeAt(Math.max(0, time - dt), prof));
      return (d / (dt * 2)) * (trackM || 0);
    }
    const alt = altitudeAt(time, prof);
    if (prof.descent) return ORBITAL_V * smooth(ramp(alt, 24000, 140000));
    // A LIMINAL CROSSING IS NOT A SPEED, but the readout has to print
    // something and the honest number is the one the range is closing at: the
    // drive does not move the round faster, it shortens what is in front of
    // it, and the rate that happens at is enormous and is what the crew see.
    // Read straight off the altitude curve, so the tape and the speed can
    // never disagree about the same second of the same flight.
    if (prof.liminal) {
      const ph = phaseAt(time, prof);
      if (ph.key === "transit" || ph.key === "skim" || ph.key === "touchdown") {
        return Math.abs(verticalSpeedAt(time, prof));
      }
      if (ph.key === "liminal") {
        // Spooling. Nothing has moved yet and the number is the orbit it is
        // still in, lifted as the drive comes up to power.
        return ORBITAL_V * (1 + 3 * smooth(ph.progress));
      }
    }
    return ORBITAL_V * smooth(ramp(alt, IGNITION_M, KESSLER_OUT_M));
  }

  function speedAt(time, profile, trackM) {
    const v = verticalSpeedAt(time, profile);
    const h = horizontalSpeedAt(time, profile, trackM);
    return Math.sqrt(v * v + h * h);
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
    // Coming down, the same two insults arrive in the other order and both of
    // them are keyed to how far the vehicle has already fallen, so the hull
    // only ever gets worse: the belt is paid going through it, the air is paid
    // under it, and nothing heals as the altimeter unwinds.
    if (prof.descent) {
      const down = 1 - ramp(alt, KESSLER_IN_M, KESSLER_OUT_M);
      const left = (INTEGRITY_START - INTEGRITY_FLOOR) * Math.exp(-KESSLER_DECAY * sev * down);
      const air = AERO_LOSS * smooth(1 - ramp(alt, MAXQ_START_M, MAXQ_END_M));
      // The air takes its cut out of what the belt left, so the asymptote
      // holds and the round is still a thing that lands.
      return INTEGRITY_FLOOR + left * Math.max(0, 1 - air / AERO_LOSS * 0.5);
    }
    const afterAir = INTEGRITY_START - AERO_LOSS * smooth(ramp(alt, MAXQ_START_M, MAXQ_END_M));
    const u = ramp(alt, KESSLER_IN_M, KESSLER_OUT_M);
    const margin = (afterAir - INTEGRITY_FLOOR) * Math.exp(-KESSLER_DECAY * sev * u);
    return INTEGRITY_FLOOR + margin;
  }

  // The beats after which a lunar round is no longer anywhere near the thing
  // that was damaging it. i18n-ignore-start  phase keys
  const LUNAR_TAIL_KEYS = [
    "shroud", "liminal", "transit", "flyby", "skim", "touchdown", "arrived",
    // The two long crossings, which are past everything that could damage them
    // from the moment the drive is in.
    "solomon", "hexspace", "thewhite", "emerge", "refuel", "transfer",
    "cruise", "jupiter", "approach", "cleanSky", "moonbrake",
    "charge", "blast", "pluto", "breach", "gods", "crossing", "redmoon",
  ];
  // i18n-ignore-end

  // Hull integrity at a moment of a flight rather than at a height in it. This
  // is what the scene and the HUD read; integrityAt stays the pure altitude
  // curve underneath it, because that is what the belt is actually a function
  // of and what the plate thresholds are spread against.
  // The beats of a landing on Earth, which is the one landing that is flown
  // through something that can hurt the round.
  const EARTH_LANDING_KEYS = ["fall", "kessler", "clear", "reentry", "terminal", "capture"];   // i18n-ignore  phase keys

  function integrityAtTime(time, severity, profile, progress) {
    const prof = profile || PROFILES.orbital;
    if (!prof.lunar) return integrityAt(altitudeAt(time, prof), severity, prof, progress);
    const ph = phaseAt(time, prof);
    // COMING DOWN ON EARTH the belt is ahead of the round, not behind it, so
    // the descent curve is read off the real altitude exactly as a deorbit
    // reads it - and what it takes is taken off what the crossing arrived with.
    if (prof.world === "earth" && EARTH_LANDING_KEYS.indexOf(ph.key) >= 0) {   // i18n-ignore  world id
      const arrived = integrityAt(prof.apogee, severity, prof, progress);
      const down = integrityAt(altitudeAt(time, prof), severity, DESCENT_CURVE, progress);
      // Whatever it had on arrival, scaled by what the way down leaves of it.
      return INTEGRITY_FLOOR + (arrived - INTEGRITY_FLOOR) *
        ((down - INTEGRITY_FLOOR) / (INTEGRITY_START - INTEGRITY_FLOOR));
    }
    // Past the belt the altimeter has changed what it is measuring, so the
    // curve is pinned at the top of the climb and the damage stops there.
    const alt = LUNAR_TAIL_KEYS.indexOf(ph.key) >= 0 ? prof.apogee : altitudeAt(time, prof);
    return integrityAt(alt, severity, prof, progress);
  }

  // Just the SHAPE of a descent, for anything that needs to ask what falling
  // through the belt and the air costs without being a descent itself.
  const DESCENT_CURVE = { belt: true, descent: true };

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
    ORBITAL_PHASES, SUBORBITAL_PHASES, DEORBIT_PHASES, SUB_APOGEE_M, SUB_AERO_LOSS,
    COUNTDOWN_S,
    RAIL_LEN_M, RAIL_EXIT_MS, MAXQ_START_M, MAXQ_END_M, IGNITION_M, KARMAN_M,
    KESSLER_IN_M, KESSLER_OUT_M, DOCK_M,
    MOON_DIST_M, MOON_R_M, MOON_ARRIVE_M, MOON_SKIM_M, LUNAR_DRIFT_M,
    INTEGRITY_START, INTEGRITY_FLOOR, AERO_LOSS, KESSLER_DECAY, FIRST_PLATE_AT,
    TAPE_KNEE_M, TAPE_TOP_M,
    phaseAt, altitudeAt, verticalSpeedAt, horizontalSpeedAt, speedAt, ORBITAL_V,
    integrityAt, integrityAtTime, hazardSeverity,
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
    // The patron's vault. Not a pad the game ships: it is wherever the last
    // vault this savegame met was dug, and the rail is the hatch shaft itself
    // with the lid thrown open. Its coordinates, and the patron whose name the
    // pad wears, are filled in by refreshVaultSite() whenever the card opens -
    // a party that meets a second vault leaves the first one behind.
    vault: {
      id: "vault",
      lat: 0, lon: 0,
      world: { x: 0, y: 0 },
      ground: 0x3a3630, groundLo: 0x1d1b17,
      sea: 0x1b2b33, seaLo: 0x0c151a,
      town: 0x6e5a3c, townLit: 0xffc46a,
      rail: 0x6a6472, coil: 0xc07dff,
      // Nothing stands by the shaft but the spoil heap and the lit dome over
      // the winch: a vault is a hole, and it is meant to look like one.
      stacks: 0, stackHeight: 0, domes: 1,
      hazeWarm: 0.55,
      meridian: false,
      patron: null,
      // Earth intact, the gun is UNDERGROUND: the bore runs the nine floors of
      // the vault and the only thing at the surface is the lid, which opens on
      // the count. Earth gone, the vault is all that is left of the square it
      // was dug into, and the lid opens on a chunk of rock with nothing under
      // it. Both are set by refreshVaultSite(), off switch 199.
      shaft: true, lid: true,
      noSea: false, noTown: false,
    },
    // The Omega Tower. Not a pad with a gun standing on it: the tower IS the
    // gun, every one of its kilometres bored and wound, and the round is
    // loaded at the foot and let go at the top. Nothing else is built there -
    // no yard, no town, no coast - because there is nothing else left.
    omega: {
      id: "omega",
      lat: 0, lon: 0,
      world: { x: 79, y: 125 },
      ground: 0x2b2c33, groundLo: 0x15161b,
      sea: 0x101820, seaLo: 0x070b10,
      town: 0x3a3c47, townLit: 0xbfe6ff,
      rail: 0xb9c2d0, coil: 0x6fe8ff,
      stacks: 0, stackHeight: 0, domes: 0,
      hazeWarm: 0.15,
      meridian: false,
      // The whole tower, end to end.
      railScale: 2.4,
      noSea: true, noTown: true,
    },
    // The starship. A pad in orbit: the ship's own rail, the void under it,
    // and no weather worth the name.
    ship: {
      id: "ship",
      lat: 0, lon: 0,
      world: { x: 0, y: 0 },
      ground: 0x23262c, groundLo: 0x101216,
      sea: 0x0a0d12, seaLo: 0x05070a,
      town: 0x2e323a, townLit: 0x9fd8ff,
      rail: 0xc8ccd4, coil: 0xffd07a,
      stacks: 0, stackHeight: 0, domes: 0,
      hazeWarm: 0.0,
      meridian: false,
      // The ship's gun is not an installation: it is a mast bolted to a hull,
      // and it has to READ as one. A tenth of the tower, a sixth of its
      // section, no foundation, no capacitor halls, no gantry - and the round
      // is loaded a few metres up the bore rather than sixty.
      // A SPINAL RAIL, and the numbers say so. The hull is about a hundred
      // and twenty units long and ten to twenty through, and the gun is a
      // thirty-six unit rail a dozen across that lies ALONG it: something the
      // ship carries, not something the ship is parked next to. The bore is
      // still four units clear of a bullet three across, which is all the
      // clearance a round in a cradle has ever had.
      railScale: 0.030,
      mounted: true, mountScale: 0.12, loadY: 12,
      orbital: true,
      noGround: true, noSea: true, noTown: true,
    },
    // THE MOON. Not a pad and not a gun: a DESTINATION, and the only one in
    // the table that is a different world. Nothing ever launches from here -
    // it is never in availableSites() - and nothing about it is a coilgun: a
    // round that arrives has its liminal drive under it and sets itself down
    // on the pad at the Moon base under its own light.
    moon: {
      id: "moon",
      lat: 0, lon: 0,
      world: { x: 0, y: 0 },
      ground: 0x8c8880, groundLo: 0x4a4744,
      sea: 0x000000, seaLo: 0x000000,
      town: 0x9aa4b0, townLit: 0xbfe6ff,
      rail: 0xb8bcc4, coil: 0xc9b8ff,
      stacks: 0, stackHeight: 0, domes: 2,
      hazeWarm: 0.0,
      meridian: false,
      // In orbit as far as this plugin is concerned - no air over it and no
      // belt above it - so the only plan it can fly is the crossing, and a
      // crossing from here to a pad on a planet that still exists is a descent
      // like any other from orbit.
      orbital: true,
      lunar: true,
      body: "moon",                                  // i18n-ignore  world id
      // But there IS ground, unlike the starship: a grey plain with two domes
      // on it and the base rail standing in the middle.
      noSea: true, noTown: true,
      railScale: 0.42,
    },
    // THE MONUMENT TO HUMANITY, on the big rocky world of the fainter of the
    // two Zeta Reticuli suns. Thirty-nine light years, a super-Earth with a
    // thick breathable atmosphere, and a sky nobody has ever littered - so
    // there is weather on the way up and nothing at all above it.
    zeta: {
      id: "zeta",
      lat: 0, lon: 0,
      body: "zeta",                                  // i18n-ignore  world id
      // Not on Earth's world map, so it is never the nearest pad.
      world: { x: 0, y: 0 },
      ground: 0x6a5c46, groundLo: 0x3a3227,
      sea: 0x27404f, seaLo: 0x12222c,
      town: 0xbfae8e, townLit: 0xffe2a8,
      rail: 0xa8a294, coil: 0x8affc4,
      stacks: 0, stackHeight: 0, domes: 3,
      hazeWarm: 0.7,
      meridian: false,
      offworld: true,
      noBelt: true,
      railScale: 0.8,
    },
    // THE HUMAN EMBASSY ON TITANIA. One ocean, all of it acid, wrapped round a
    // supermassive hole in ANDROMEDA. The air is not breathable and the suits
    // stay on - which is not this plugin's ruling to make, it is the biome's,
    // and GalaxySim applies it on arrival like it does everywhere else.
    titania: {
      id: "titania",
      lat: 0, lon: 0,
      body: "titania",                               // i18n-ignore  world id
      world: { x: 0, y: 0 },
      ground: 0x6f7a3a, groundLo: 0x3a3f1e,
      sea: 0x8fa32c, seaLo: 0x4d5a16,
      town: 0xd8d2a8, townLit: 0xc9ff7a,
      rail: 0x9aa48a, coil: 0xc9ff7a,
      stacks: 0, stackHeight: 0, domes: 2,
      hazeWarm: 0.9,
      meridian: false,
      offworld: true,
      noBelt: true,
      railScale: 0.8,
    },
    // i18n-ignore-end
  };

  const SITE_ORDER = ["taranto", "greenwich"];   // i18n-ignore  site ids
  const MOON_SITE_ID = "moon";                   // i18n-ignore  site id
  // Every pad that is an offworld base rather than a place on Earth. The order
  // is the order they are offered in.
  const WORLD_SITE_IDS = ["moon", "zeta", "titania"];   // i18n-ignore  site ids
  const VAULT_SITE_ID = "vault";                 // i18n-ignore  site id

  // ==========================================================================
  // The third pad: a patron's vault
  // ==========================================================================
  //
  // A hop may leave from a patron's vault or come down on one, which makes the
  // set of pads a thing that changes from savegame to savegame. PatreonRewards
  // owns the only answer to "which vault" - ownHatch() is the square this
  // savegame last recognised, which is the last vault the party visited - and
  // the pad is named after the patron who holds it.
  //
  // The world map is the coordinate system the vault is written in, so the two
  // shipped pads are used as the two points that turn a world square into a
  // real latitude and longitude. That is what makes the great-circle track and
  // the Earth tilt come out right for a pad nobody placed by hand.
  const GEO_ANCHOR = { x: 66, y: 112, lat: 51.48, lon: 0 };
  const GEO_DEG_PER_X = (17.24 - 0) / (151 - 66);
  const GEO_DEG_PER_Y = (40.47 - 51.48) / (200 - 112);

  // Switch 199 ("EarthDestroyed"), which GalaxySim_Core raises the day Nibiru
  // strikes - 21 December 2012 - and never lowers. Read here and nowhere else
  // in this file: it decides which pads exist, whether a hop is flyable at
  // all, whether the belt is still up there, and what a vault looks like.
  const SW_EARTH_LOST = 199;

  function earthGone() {
    try {
      return !!(typeof $gameSwitches !== "undefined" && $gameSwitches && $gameSwitches.value(SW_EARTH_LOST));
    } catch (e) { return false; }
  }

  function geoOfWorld(x, y) {
    const lat = Math.max(-85, Math.min(85, GEO_ANCHOR.lat + (y - GEO_ANCHOR.y) * GEO_DEG_PER_Y));
    let lon = GEO_ANCHOR.lon + (x - GEO_ANCHOR.x) * GEO_DEG_PER_X;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    return { lat: lat, lon: lon };
  }

  // The vault this savegame calls its own, or null where it has never met one.
  function vaultHatch() {
    try {
      const PR = window.PatreonRewards;
      if (!PR || typeof PR.ownHatch !== "function") return null;
      const h = PR.ownHatch();
      if (!h || !Number.isFinite(h.x) || !Number.isFinite(h.y)) return null;
      if (!h.x && !h.y) return null;
      return h;
    } catch (e) { return null; }
  }

  // Read once when the card opens, held for the flight: the pad must not move
  // under the vehicle because a hatch was stamped somewhere else mid-cinematic.
  let _vaultReady = false;

  function refreshVaultSite() {
    const hatch = vaultHatch();
    const site = SITES[VAULT_SITE_ID];
    if (!hatch) {
      _vaultReady = false;
      site.world = { x: 0, y: 0 };
      site.patron = null;
      return false;
    }
    site.world = { x: hatch.x, y: hatch.y };
    const geo = geoOfWorld(hatch.x, hatch.y);
    site.lat = geo.lat;
    site.lon = geo.lon;
    site.knownHatch = hatch;
    let patron = null;
    try {
      const PR = window.PatreonRewards;
      const rec = PR && typeof PR.patronById === "function" ? PR.patronById(hatch.id) : null;
      if (rec && rec.name) patron = String(rec.name);
    } catch (e) { /* an unnamed square still flies; it just has no name on it */ }
    site.patron = patron;
    // Earth intact: the vault is a hole in a field, the gun runs the nine
    // floors and the lid is the only thing at the surface. Earth gone: the
    // square is a chunk of rock hanging in the dark, and the lid opens onto
    // nothing. Same gun either way, and the same hatch.
    const gone = earthGone();
    site.chunk = gone;
    site.noSea = gone;
    site.noTown = gone;
    site.hazeWarm = gone ? 0.0 : 0.55;
    _vaultReady = true;
    return true;
  }

  function vaultReady() { return _vaultReady; }

  // The Omega Tower's square is a world-map tile like any other, so its
  // latitude and longitude come out of the same two-point fit the vault uses.
  Object.assign(SITES.omega, geoOfWorld(SITES.omega.world.x, SITES.omega.world.y));

  // The pads that exist right now.
  //
  // Apulia and Greenwich are ON Earth: the day Earth stops existing they stop
  // with it, and what is left in the sky is the Omega Tower, the starship, and
  // whatever chunk of ground the patron's vault was dug into.
  function availableSites() {
    const list = [];
    if (!earthGone()) { list.push("taranto", "greenwich"); }   // i18n-ignore  site ids
    list.push("omega", "ship");                                // i18n-ignore  site ids
    // The three offworld bases are spaceports, and a spaceport has a gun: a
    // party set down on one of them is not stranded on it.
    WORLD_SITE_IDS.forEach((id) => list.push(id));
    if (_vaultReady) list.push(VAULT_SITE_ID);
    return list;
  }

  // The flight plans that can be flown from here. A suborbital hop is a throw
  // through an atmosphere onto ground on the same planet: with Earth gone
  // there is no such throw left to make, and every crossing is orbital.
  // A hop is a throw through an atmosphere from ground to ground. A pad that
  // is ALREADY IN ORBIT cannot make one - there is nothing under it to throw a
  // round across - so a flight leaving the ship has exactly one plan, and it
  // is the only one it is ever offered. With Earth gone nobody has one.
  function availableProfiles(siteId) {
    const site = siteId && SITES[siteId];
    if (earthGone() || (site && site.orbital)) return ["orbital"];   // i18n-ignore  profile id
    // A hop needs somewhere on the SAME world to be thrown to, and each of the
    // offworld bases is the only thing anybody has built on its own.
    if (site && site.body) {
      const near = availableSites().filter((id) => id !== siteId && sameBody(site, SITES[id]));
      if (!near.length) return ["orbital"];                          // i18n-ignore  profile id
    }
    return PROFILE_ORDER.slice();
  }

  // Where a flight leaving `siteId` on `profile` may come down.
  //
  //   a hop            every pad but the one it left and the starship, which
  //                    is not somewhere a ballistic round can reach
  //   orbital          the starship, as it always was - unless the flight is
  //                    leaving the starship, or Earth is gone, in which case
  //                    the whole surviving set is on offer
  function destinationsFor(siteId, profile) {
    const rest = availableSites().filter((id) => id !== siteId);
    // A hop is a throw through an atmosphere onto ground on the same planet.
    // The Moon is neither on the same planet nor reachable ballistically, so
    // it is not on a hop's list any more than the starship is.
    if (profile && profile.downrange) {
      const from = SITES[siteId];
      return rest.filter((id) => !SITES[id].orbital && sameBody(from, SITES[id]));
    }
    const site = SITES[siteId];
    const onEarth = !site || bodyOf(site) === "earth";                             // i18n-ignore  body id
    const list = (earthGone() || !onEarth || (site && site.orbital))
      ? rest
      // Off an Earth pad with the planet still under it, the crossing is the
      // one it was built for: up to the ship. Everywhere else on this list is
      // reached from there, or from another world.
      : rest.filter((id) => id === "ship");                                        // i18n-ignore  site id
    // THE MOON IS ALWAYS ON THE LIST. Every orbital crossing may be aimed at
    // it, from every pad, because what makes the crossing is not the gun: it
    // is the liminal engine the round carries in the middle of it, and that
    // works the same whether it was thrown off a coast or out of a hangar.
    // Which is why it is added here rather than being left to the branch
    // above: from an Earth pad that branch keeps the starship and nothing else.
    WORLD_SITE_IDS.forEach((id) => {
      if (id !== siteId && list.indexOf(id) < 0) list.push(id);
    });
    return list;
  }

  // Which of the two lunar plans a flight leaving this pad flies.
  //
  // A pad on the ground under an atmosphere throws the round through the air
  // and the belt, so the drive goes up in its sleeve and the round carries a
  // boost stage. A pad ALREADY IN ORBIT has neither above it: the starship
  // always, and the Omega Tower and the patron's vault once switch 199 has
  // taken the ground out from under them and left the vault a chunk of rock
  // with a lit hatch in it. Those fly bare, and there is nothing up there to
  // make them fly otherwise.
  function crossingProfile(site, dest) {
    if (!site || !dest) return null;
    const from = bodyOf(site), to = bodyOf(dest);
    // Two pads on the same world are not a crossing, they are a hop or a
    // climb - and Earth's five pads are all on the same world.
    if (from === to) return null;
    return PROFILES[crossingId(from, to, padKind(site), padInOrbit(dest))] || null;
  }

  // Kept as the older name, which only ever asked about the Moon.
  function lunarProfileFrom(site) {
    return PROFILES[crossingId(bodyOf(site), "moon", padKind(site))] ||   // i18n-ignore  world id
      PROFILES[crossingId("earth", "moon", padKind(site))];               // i18n-ignore  world ids
  }

  // Is this crossing a way DOWN? A flight that leaves a pad in orbit and is
  // aimed at one standing on the planet is a descent, and it is flown on the
  // deorbit table: out of the ship, through the belt, through the air and into
  // the receiving gun. With Earth gone there is no planet under any of it -
  // switch 199 says so - and every crossing is the flat orbital one again.
  function descentFrom(site, dest) {
    if (!site || !dest || earthGone()) return false;
    return !!site.orbital && !dest.orbital;
  }

  // Kept as the older name for the same question.
  function activeSites() { return availableSites(); }

  // ==========================================================================
  // WHERE A FLIGHT PUTS THE PARTY.  Edit these and nothing else.
  // ==========================================================================
  //
  // ORBITAL_ARRIVAL is the starship interior: the tile at the foot of the
  // ship's own rail, facing down, which is where a round that has just docked
  // puts the people who were inside it.
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
  const ORBITAL_ARRIVAL = { mapId: 721, x: 22, y: 47, dir: 2 };

  // Every offworld base a flight can be sent to. Each names the body in
  // js/db/GalaxySim/Systems.json that it stands on, so the landing is made
  // against the same world the star map flies to rather than a copy of it -
  // which is what makes the EVA suits, the life-signs roll, the Alien biome
  // and the landing grid all come out right without this file knowing any of
  // those rules.
  //
  // THE TILE IS THIS PLUGIN'S, not the authored site's: a round coming down
  // under its own drive lands on the apron, not in the hangar the star map's
  // own picker puts a ship in.
  const WORLDS = {
    // i18n-ignore-start  world ids, body names and system names from Systems.json
    moon: {
      system: "Sol", planet: "Moon", parent: "Earth", isMoon: true,
      mapId: 173, x: 31, y: 43, dir: 2, cell: { gx: 2, gy: 1 },
    },
    // The Monument to humanity, on the big rocky world of the fainter of the
    // two Zeta Reticuli suns. Thirty-nine light years, and both suns wear a
    // Dyson shell.
    zeta: {
      system: "Zeta Reticuli B", planet: "Zeta B II", parent: null, isMoon: false,
      mapId: 353, x: 34, y: 34, dir: 2, cell: { gx: 7, gy: 2 },
    },
    // The human embassy on Titania: one ocean, all of it acid, going round a
    // hole four hundred thousand times the Sun - in ANDROMEDA. Nothing crosses
    // that distance, which is why the round that goes there does not try to.
    titania: {
      system: "Titania", planet: "Titania", parent: null, isMoon: false,
      mapId: 970, x: 18, y: 43, dir: 2, cell: { gx: 8, gy: 3 },
    },
    // i18n-ignore-end
  };

  // THE MOON BASE, and it is not an arrival like any other.
  //
  // A pad on Earth is a map. The Moon is a WORLD, and setting down on it is
  // the same act as setting the starship down on it: the party arrives in EVA
  // suits, the square they stand on is a square of the Moon's own landing grid
  // so everything generated around it generates as the Alien biome that world
  // wears, and Return to Ship stays lit in the menu the whole time they are
  // there. GalaxySim owns every one of those answers and landAtSpaceport is
  // the one route in - the same one the star map's own landing grid uses.
  //
  // WITH NO SHIP. The round is not a starship and does not become one: nothing
  // is parked on the pad, so the party walks out of the bullet onto the
  // regolith on foot and the way home is the one they can find there.
  const MOON_ARRIVAL = {
    mapId: 173, x: 31, y: 43, dir: 2,
    // Which square of the Moon's landing grid the base stands on. Authored in
    // js/db/GalaxySim/Systems.json and read from there when it is loaded; this
    // is only the answer for a game that has no data manager to ask.
    cell: { gx: 2, gy: 1 },
  };

  // The Moon's own record out of Systems.json, so the landing is made against
  // the same body the star map flies to rather than a copy of it.
  // The body one of those bases stands on, out of Systems.json, so the landing
  // is made against the same world the star map flies to.
  function worldRecord(id) {
    const w = WORLDS[id];
    if (!w) return null;
    try {
      const dm = window.GalaxySim && window.GalaxySim.getDataManager && window.GalaxySim.getDataManager();
      const sys = dm && dm.getSystem(w.system);
      const planets = (sys && sys.planets) || [];
      // A moon is found under its parent; everything else is a planet.
      if (w.isMoon) {
        const parent = planets.find((p) => p.name === w.parent);
        const moon = parent && (parent.moons || []).find((m) => m.name === w.planet);
        if (moon) return moon;
      } else {
        const planet = planets.find((p) => p.name === w.planet);
        if (planet) return planet;
      }
    } catch (e) { /* no data manager: the stand-in below still lands */ }
    return { name: w.planet, type: w.fallbackType || "sub_mercurian" };   // i18n-ignore  body type
  }

  // The system that body is in, for the things that are the STAR's rather than
  // the planet's - the Dyson shells around both Zeta suns, and the hole
  // Titania goes round.
  function worldSystem(id) {
    const w = WORLDS[id];
    if (!w) return null;
    try {
      const dm = window.GalaxySim && window.GalaxySim.getDataManager && window.GalaxySim.getDataManager();
      return (dm && dm.getSystem(w.system)) || null;
    } catch (e) { return null; }
  }

  function moonRecord() { return worldRecord("moon"); }   // i18n-ignore  world id

  // The authored pad on that world, with the arrival tile this plugin lands
  // on rather than the one the star map's own picker uses: a round coming in
  // under a liminal drive comes down on the apron, not in the hangar.
  function worldSite(id) {
    const w = WORLDS[id];
    if (!w) return null;
    const rec = worldRecord(id) || {};
    const authored = ((rec.landingLocations || [])[0]) || {};
    return {
      name: authored.name || "",
      mapId: w.mapId, x: w.x, y: w.y, dir: w.dir,
      // The grid square is the AUTHORED one wherever the data has it: it is
      // what makes the pad a square of that planet rather than a map of its
      // own, and it is not this plugin's to invent.
      cell: authored.cell || w.cell,
    };
  }

  function moonSite() { return worldSite("moon"); }   // i18n-ignore  world id

  const SUBORBITAL_ARRIVAL = {
    // i18n-ignore-start  site ids
    taranto: { mapId: 0, x: 0, y: 0, dir: 2 },
    greenwich: { mapId: 0, x: 0, y: 0, dir: 2 },
    // The vault has no world square of its own to name: the hop comes down on
    // the patron's hatch itself, which PatreonRewards builds and places the
    // party on, so this entry exists only to be overridden by hand.
    // The vault does not arrive on its square: the round comes down the shaft
    // and the party walks out on Floor -3, which is where the bore ends.
    vault: { mapId: 662, x: 49, y: 12, dir: 2 },
    // The Omega Tower catches the round a kilometre up its own bore, so the
    // party does not step out onto the square it stands on: they step out
    // inside the tower, at the foot of the breech.
    omega: { mapId: 635, x: 18, y: 46, dir: 2 },
    // The starship is the orbital arrival, wherever a flight comes from.
    ship: { mapId: ORBITAL_ARRIVAL.mapId, x: ORBITAL_ARRIVAL.x, y: ORBITAL_ARRIVAL.y, dir: ORBITAL_ARRIVAL.dir },
    // i18n-ignore-end
  };

  // The far end of a hop is simply the pad that is not this one.
  function otherSite(id) {
    const list = activeSites();
    const i = list.indexOf(id);
    return SITES[list[(i + 1) % list.length]] || SITES[SITE_ORDER[0]];
  }

  // The vault wears its patron's name. Where the square is known but the
  // patron is not - a reserved slot, a square proved by somebody else - it
  // falls back to the nameless form rather than printing a blank.
  // A pad the flight may actually use: the vault only counts once this
  // savegame has met one, so a command naming it in a game that never has is
  // answered with nothing rather than with a pad at 0,0.
  function usableSite(id) {
    if (!id || !SITES[id]) return null;
    if (id === VAULT_SITE_ID && !_vaultReady) return null;
    return SITES[id];
  }

  // Is this crossing the one to the Moon? The destination is the whole answer:
  // every pad may make it and the plan is chosen off the pad, not off the
  // question.
  function lunarTo(dest) { return !!(dest && dest.lunar); }

  function siteName(id) {
    if (id === VAULT_SITE_ID) {
      const p = SITES[VAULT_SITE_ID].patron;
      return p ? t("site.vault.name", { patron: p }) : t("site.vault.nameUnknown");
    }
    return t("site." + id + ".name");
  }

  function siteBlurb(id) {
    if (id === VAULT_SITE_ID) {
      const p = SITES[VAULT_SITE_ID].patron;
      return p ? t("site.vault.blurb", { patron: p }) : t("site.vault.blurbUnknown");
    }
    return t("site." + id + ".blurb");
  }

  // The body a pad stands on. Earth's own pads say nothing, which is the
  // answer for Earth: Apulia, Greenwich, the tower, the vault and the ship's
  // own rail are all in the same gravity well and a hop between them is a
  // throw across it.
  function bodyOf(site) {
    return (site && site.body) || "earth";   // i18n-ignore  body id
  }

  function sameBody(a, b) {
    return !!a && !!b && bodyOf(a) === bodyOf(b);
  }

  // Which pad the party is standing closest to on the world map. Only a
  // default for the selection screen - the player always gets the choice.
  function nearestSite() {
    let wx = 0, wy = 0;
    try {
      wx = $gameVariables.value(43) || 0;
      wy = $gameVariables.value(44) || 0;
    } catch (e) { /* no save loaded: fall through to the first pad */ }
    const list = activeSites();
    if (!wx && !wy) return list[0];
    let best = list[0], bestD = Infinity;
    list.forEach((id) => {
      const s = SITES[id];
      // The starship is not on the world map, so it is never the nearest pad.
      if (!s.world.x && !s.world.y) return;
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
  // THE RADIO
  // ==========================================================================
  //
  // Every line the flight prints is now SAID BY SOMEBODY, and the log says who.
  //
  // MISSION CONTROL is the neutral voice and it never varies: it is a room
  // full of people reading instruments, and a room full of people reading
  // instruments sounds the same whoever is strapped into the round. Its lines
  // are the telemetry bank exactly as it always was.
  //
  // THE CREW is not neutral. A beat that belongs to the people inside the
  // vehicle - the release, max-Q, the first thing the belt takes off, the
  // drive lighting, the Moon arriving - is spoken by a party member in the
  // voice of their own PERSONALITY, so the same launch reads differently with
  // a different party aboard. There are twenty-five archetypes in
  // PersonalityData.json and writing twenty-five lines for every beat would be
  // a bank nobody could keep true, so they are gathered into SIX REGISTERS -
  // see VOICE_OF - and the bank is written once per register.
  //
  // WHO SPEAKS ROTATES. Each crew beat is taken by the next member down the
  // party, so a flight with four people aboard is a conversation and not a
  // monologue. A member on one of the creature classes is never cast: class 63
  // and up hold no conversation anywhere in this game (NPCCreature owns that
  // boundary, and it is asked rather than re-derived), and a launch is not the
  // place to start. A party with nobody left to speak hands the beat back to
  // mission control, which is what an uncrewed round would do anyway.
  // ==========================================================================

  // The six registers, and which archetype falls in which. A personality with
  // no entry here - a mod adding its own - is read as steady, which is the
  // register that says the least about whoever is using it.
  // i18n-ignore-start  personality ids, matched against PersonalityData.json
  const VOICE_OF = {
    nervous: "rattled", paranoid: "rattled", timid: "rattled",
    cautious: "rattled", melancholic: "rattled", fatalistic: "rattled",
    calm: "steady", stoic: "steady", disciplined: "steady",
    authoritative: "steady", loyal: "steady", brave: "steady",
    aggressive: "hot", impulsive: "hot", adventurous: "hot",
    sanguine: "hot", hedonistic: "hot",
    empathetic: "warm", nurturing: "warm", artistic: "warm",
    cynical: "dry", mischievous: "dry", grumpy: "dry", apathetic: "dry",
    scholarly: "precise",
  };
  const VOICE_DEFAULT = "steady";
  // i18n-ignore-end

  // The ground station a crossing is handed over to, and the beat it happens
  // on. Before that beat the voice is the room on Earth; from it, it is
  // whoever lives at the far end.
  // i18n-ignore-start  world ids, station ids and phase keys
  const STATIONS = {
    zeta: { id: "tourists", from: "emerge" },
    titania: { id: "dargos", from: "emerge" },
  };
  // The beat a world with no station of its own takes its flights back on.
  const HANDOVER_BEAT = "emerge";
  // The beats no signal gets into or out of. Inside one of these the ground
  // has no contact with the round at all and everything said is said aboard.
  const NO_CONTACT = [
    "liminal", "transit", "solomon", "hexspace", "thewhite",
    "sbspool", "wormhole", "throat",
  ];
  // i18n-ignore-end

  // The beats a crew answers the ground on. Not all of them: a flight where
  // every call is acknowledged is a flight nobody can read, and half of these
  // beats are spoken from aboard already. These are the ones somebody strapped
  // into a round would actually say something back to.
  // i18n-ignore-start  phase keys
  const ANSWERED = [
    "ready", "release", "ballistic", "ignition", "beltEntry", "impact",
    "shipSighted", "softDock", "hardDock", "landed", "entryOut", "capture",
    "moonAhead", "lunarDown", "jupiterClose", "breachGive", "zetaArrived",
    "titaniaArrived", "lunarArrived", "arrived", "hopCapture", "refuelDone",
  ];
  // i18n-ignore-end
  // And how long the ground has to be left alone between answers. A reply on
  // top of a reply is two people talking over each other.
  const REPLY_GAP = 6.5;

  // The beats a round is in the EARTH'S sky on, whatever it left from: the
  // braking pass round the Moon and everything after it. See _updateMoon.
  // i18n-ignore-start  phase keys
  const HOME_SKY = [
    "moonbrake", "fall", "kessler", "clear", "reentry", "terminal", "capture",
    "muzzle", "rendezvous", "dock", "aboard", "arrived",
  ];
  // i18n-ignore-end

  // How long the camera takes to travel from one beat's setup to the next.
  // Long enough to read as a move and short enough that the new shot is the
  // new shot well before the beat it belongs to is over.
  const RIG_BLEND = 1.1;

  const Radio = {
    _turn: 0,
    _station: null,
    _blackout: false,
    // Who said the last line: the room on Earth, a station at the far end, or
    // somebody aboard. The log draws the three apart, so it has to be able to
    // ask, and every line the radio hands out sets it.
    lastWho: "control",   // i18n-ignore  speaker id

    reset() { this._turn = 0; this._station = null; this._handed = null; this._blackout = false; this.lastWho = "control"; },   // i18n-ignore  speaker id

    // Called as each beat starts. Once the round is in the far system the
    // local station has the flight, and it keeps it: there is no handing back.
    atPhase(profile, phaseKey) {
      // Signal, or the lack of it. Not sticky: it comes back the moment the
      // round is somewhere a signal can reach.
      this._blackout = NO_CONTACT.indexOf(phaseKey) >= 0;
      if (!profile) return;
      // WHO RUNS A LAUNCH IS WHOEVER IS STANDING AT THE PAD. A round leaving
      // the embassy on Titania is counted down by Dargos and a round leaving
      // the Monument by the tourists who keep it; a room on Earth thirty-nine
      // light years behind them is not reading out that countdown. So the
      // station at the world the flight LEAVES has the flight from the first
      // beat, and the one at the world it is going to takes it over at the
      // handover beat - which is the only handover there is.
      const home = STATIONS[profile.fromWorld];
      if (this._handed !== profile) {
        this._handed = profile;
        this._station = home ? home.id : null;
      }
      const s = STATIONS[profile.world];
      const toId = s ? s.id : null;
      if (this._station === toId) return;
      const beats = profile.phases.map((p) => p.key);
      // A world with nobody on it - Earth, the Moon - still takes its own
      // flights back at the same point in the crossing, and mission control
      // is who that is.
      const at = beats.indexOf(s ? s.from : HANDOVER_BEAT);
      const now = beats.indexOf(phaseKey);
      if (at >= 0 && now >= at) this._station = toId;
    },

    stationId() { return this._station; },

    /** True while nothing on the ground can reach the round. */
    blackout() { return this._blackout; },

    // Everybody aboard who can work a radio, in party order.
    _crew() {
      try {
        if (typeof $gameParty === "undefined" || !$gameParty) return [];
        const NC = window.NPCCreature;
        return $gameParty.members().filter((a) => {
          if (!a) return false;
          if (NC && typeof NC.isNonSentientActor === "function" && NC.isNonSentientActor(a)) return false;
          return true;
        });
      } catch (e) { return []; }
    },

    // 'rattled', 'steady', 'hot', ... for one member. PartyBanter owns the
    // answer to which archetype somebody is - it is the same key the party's
    // own conversations are keyed on - so it is asked rather than worked out
    // here a second time.
    voiceOf(actor) {
      try {
        const PB = window.PartyBanter;
        const key = PB && typeof PB.personalityKey === "function" ? PB.personalityKey(actor) : null;
        return (key && VOICE_OF[String(key).toLowerCase()]) || VOICE_DEFAULT;
      } catch (e) { return VOICE_DEFAULT; }
    },

    // The name over a line from the ground. Mission control has one callsign
    // and it is the same one for every flight; the two local stations have
    // their own, and they take over when the round reaches them.
    control() {
      return t("radio." + (this._station || "control"));   // i18n-ignore  station id
    },

    // One line from the ground. Whoever is on the ground: a station with its
    // own wording for this beat uses it, and a station with nothing written
    // for a beat falls back to the neutral telemetry, which is never wrong.
    //
    // UNLESS THERE IS NO GROUND TO SPEAK FROM. Inside a liminal crossing
    // nothing reaches the round, so the line is handed to whoever is aboard
    // instead - and an empty round, with nobody in it to say anything, is
    // allowed to keep the neutral wording rather than fall silent.
    fromControl(key, params) {
      if (this._blackout && this._crew().length) return this.fromCrew(key, params);
      this.lastWho = this._station ? "station" : "control";   // i18n-ignore  speaker ids
      let text = null;
      if (this._station) text = tOrNull("station." + this._station + "." + key, params);
      if (text == null) text = t("telemetry." + key, params);
      return t("radio.line", { who: this.control(), text: text });
    },

    // One line from whoever is next in the party, in their own register. The
    // register bank is allowed to be incomplete: a beat nobody has written a
    // rattled version of falls back to the shared crew line, and a beat with
    // no crew line at all falls back to what mission control would have said,
    // which is never wrong, only flatter.
    fromCrew(key, params) {
      const crew = this._crew();
      if (!crew.length) return this.fromControl(key, params);
      const who = crew[this._turn % crew.length];
      this._turn++;
      const voice = this.voiceOf(who);
      let text = tOrNull("crew." + voice + "." + key, params);
      if (text == null) text = tOrNull("crew.any." + key, params);
      if (text == null) text = t("telemetry." + key, params);
      this.lastWho = "crew";   // i18n-ignore  speaker id
      return t("radio.line", { who: this._nameOf(who), text: text });
    },

    // The name over a line from aboard. A member with no name of their own -
    // which is what a stub actor is - is still not the ground, and must not be
    // labelled as it: they are the crew, and the log says so.
    _nameOf(actor) {
      let name = "";
      try { name = actor && actor.name ? actor.name() : ""; } catch (e) { name = ""; }
      return name || t("radio.crew");
    },

    // THE ANSWER FROM ABOARD.
    //
    // Mission control reads instruments at a round full of people, and until
    // now the round never said anything back: the log was a monologue with the
    // crew's own beats dropped into it. So the beats worth answering get an
    // answer, from the next member down the party, in their own register - a
    // short one, because a reply is an acknowledgement and not a speech.
    //
    // The bank is allowed to be thin: a register with nothing written for this
    // beat falls back to its own acknowledgements, which every register has,
    // and a party with nobody in it to speak simply does not reply.
    replyTo(key, params) {
      if (this._blackout) return null;
      if (ANSWERED.indexOf(key) < 0) return null;
      const crew = this._crew();
      if (!crew.length) return null;
      const who = crew[this._turn % crew.length];
      this._turn++;
      const voice = this.voiceOf(who);
      let text = tOrNull("reply." + voice + "." + key, params);
      // The acknowledgements, which are the floor under the whole bank. Which
      // one is used rotates with the speaker, so a long flight does not hear
      // the same four words from the same person twice running.
      if (text == null) {
        for (let i = 0; i < REPLY_ACKS; i++) {
          const n = ((this._turn + i) % REPLY_ACKS) + 1;
          text = tOrNull("reply." + voice + ".ack" + n, params);
          if (text != null) break;
        }
      }
      if (text == null) text = tOrNull("reply.any." + key, params);
      if (text == null) return null;
      this.lastWho = "crew";   // i18n-ignore  speaker id
      return t("radio.line", { who: this._nameOf(who), text: text });
    },
  };

  // How many acknowledgements each register is written with.
  const REPLY_ACKS = 4;

  // T() answers with the key itself when a bank has nothing under it, which is
  // how a missing string is meant to show up on screen - but a FALLBACK CHAIN
  // has to be able to tell "nothing here" from "here is a line", so this is
  // the one place that reads that answer as a miss instead of as text.
  function tOrNull(key, params) {
    const full = I18N + "." + key;
    const out = t(key, params);
    return (out == null || out === key || out === full) ? null : out;
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
  // THE ELEVATION THE GUN IS LAID AT.
  //
  // A round thrown straight up comes straight back down on the pad it left,
  // which is no use to anybody trying to get to Greenwich. A hop is a
  // BALLISTIC THROW and it needs an angle: the whole installation - foundation,
  // halls, tower, rings and all - is trunnioned, and for a hop it is laid over
  // downrange so the round leaves the muzzle already going where it is meant
  // to end up. An orbital crossing is the case that wants the barrel vertical,
  // and gets it.
  //
  // Everything the gun does is written in the barrel's own axis, so laying it
  // over is one rotation on the rail group plus the matching decomposition of
  // the pad's recession into vertical and downrange - see _updatePad. Nothing
  // else in the pad code knows or has to.
  const HOP_ELEVATION = 0.38;   // radians off vertical, about 22 degrees
  // The seconds that have to pass before the same reactive line may be said
  // again. The two the belt generates are the reason this exists: see _maySay.
  // i18n-ignore-start  telemetry keys
  const SAY_GAP = { impact: 7, proximity: 9, stageLost: 0, stageSep: 0, shroudGone: 0, chute: 0 };
  // i18n-ignore-end
  const SAY_GAP_DEFAULT = 3;
  // The Moon to the same scale as the Earth beside it: 0.273 of an Earth
  // radius across, and sixty of them away. Both numbers are real, which is why
  // the disc comes out the size the sky says it is.
  const MOON_VIS_R = EARTH_VIS_R * 0.273;
  // The render layer the Moon and nothing else is on. See _initThree.
  const MOON_LAYER = 1;
  const onLayer = (o, n) => { if (o && o.layers && o.layers.set) o.layers.set(n); };
  const seeLayer = (o, n) => { if (o && o.layers && o.layers.enable) o.layers.enable(n); };
  // Never further out than this, in far-scene units: past it the planet is
  // behind the far camera's 20000-unit plane and simply stops being drawn,
  // which is what emptied the window on the long crossings. Beyond this range
  // the whole far scene is scaled down instead of moved away, so the angular
  // size on screen is still the honest one. See _updateCamera.
  const FAR_CAM_MAX_D = 12000;
  // How far off the camera's own bearing the Moon is held. See _buildMoon.
  const MOON_BEARING = 0.42;
  // The hyperspace corridor: how wide the square shaft is and how far down it
  // the slabs are laid before they are recycled to the far end.
  const CORRIDOR_HW = 30;
  const CORRIDOR_LEN = 900;
  // How big the shell round a Zeta sun is drawn. A real one is two AU across
  // and would be the entire sky from anywhere useful; this is the size that
  // puts it in the window WITH the planet it is being approached over.
  const DYSON_VIS_R = 420;
  // The string of Schrodinger-Bohr pellets: how many, and how long one ring
  // takes to open. They are staggered across the blast beat, so a longer
  // string is a longer staircase rather than a bigger bang.
  const CHARGE_COUNT = 5;
  const RING_LIFE = 1.9;

  // THE LIMINAL ENGINE.
  //
  // A drum a third of the length of the bullet, with a ring of three vanes
  // round a core that nothing lights. It does not push: at the top of the
  // climb it takes the three hundred and eighty-four thousand kilometres
  // between the round and the Moon and makes them a distance the round is
  // already at the other end of. Nine seconds, because the crossing has no
  // middle to spend any time in.
  //
  // What it needs is to ARRIVE, and the belt is between it and arriving - so
  // on a flight that crosses the belt it goes up inside a sleeve of armour
  // thicker than any plate on the hull, and comes out the far side untouched
  // while the hull comes out bare. The sleeve is blown on the shroud beat and
  // the drive lights for the first time in the open.
  const LIMINAL_LEN = 7.4;

  // i18n-ignore-start  phase keys
  // The beats a drive is at full power for.
  const LIMINAL_LIT = ["transit", "solomon", "hexspace", "thewhite", "emerge", "transfer", "approach", "moonbrake"];
  // THE BEATS THE BLUE FLAME IS ACTUALLY LIT ON, which is not the same list.
  //
  // The drive's glow - the vanes, the core, the halo - is the engine being up,
  // and it is up wherever the round is under it. The FLAME is the engine
  // PUSHING, and there are two things it pushes the round through:
  //
  //   A CROSSING BETWEEN TWO WORLDS. One drive, lit for as long as the range
  //   takes to collapse: Earth to its Moon, the burn across the Zeta system,
  //   the braking pass on the way home.
  //
  //   THE SHAFT TO ZETA RETICULI, which is the SAME ENGINE TAKEN TO THE MAX.
  //   The Gate of Solomon, hexspace and the white desert are not another
  //   drive and not another physics: they are a stack of three liminal
  //   engines, lit one after another and thrown away as each one is spent,
  //   holding a collapse no single drive could hold. So the flame is lit down
  //   the whole length of it, and out the far mouth with it.
  //
  // The spool that comes before either one is the flame coming in.
  //
  // It is lit on nothing else, and the SCHRODINGER-BOHR JUMP is the reason
  // this list exists. That one is not a drive shortening a distance at all:
  // it is a string of pellets that have not decided where they are yet, and
  // the round crosses between GALAXIES on the answer. Nothing burns. A jet
  // hanging under the round while it happens says the opposite of what the
  // beat is. And a landing is the round being SET DOWN on a pad: it comes in
  // on the drive's glow and the pad's lights, not on a torch.
  const LIMINAL_FLAME = [
    "liminal", "transit", "solomon", "hexspace", "thewhite",
    "emerge", "transfer", "approach", "moonbrake",
    // And the run out to the assist, which is a burn like any other.
    "cruise",
  ];
  // And the beats the lens is bending the frame on. The liminal lens is the
  // CORRIDOR's look and nothing else's: it is worn down the shaft to Zeta and
  // never on the jump to Titania, which is not a drive shortening a distance
  // but a distance being removed, and must not read as the same crossing. The
  // hole does its own bending, with the sky wrapped round the mouth.
  const LENS_BEATS = ["transit", "solomon", "hexspace", "thewhite", "breach", "crossing"];
  // Where each drive of a stack is dropped: the end of the beat it was lit for.
  const STACK_DROPS = ["solomon", "hexspace", "thewhite"];
  // The beats where the round is flying ALONG the track rather than up it, and
  // therefore has to be laid over onto it. See the note in _updateVehicle.
  const TRACK_BEATS = [
    "transit", "solomon", "hexspace", "thewhite", "emerge", "transfer", "approach",
    "cruise", "jupiter", "charge", "blast", "pluto", "breach", "gods", "crossing",
    "redmoon", "moonbrake",
    // A round is pointed at where it is GOING, and these are the rest of the
    // beats it is flown sideways on: round the back of a planet, out the far
    // side of an assist, along a circuit and in onto a hull. The beats that
    // really are flown nose-up - the climb off a pad, the last hundred metres
    // of a powered landing - are deliberately not in the list.
    "assist", "escape", "flyby", "refuel", "cleanSky", "rendezvous", "dock",
  ];
  // i18n-ignore-end

  // NO retro look here, and it is not a style choice.
  //
  // PSXShader.render draws into a low-res target and then blits it back as an
  // OPAQUE full-screen quad. Called twice - once for the far scene and once for
  // the near one - the second blit paints clean over the first, which erased
  // the Earth every frame. GalaxySim is exempt from the retro look anyway (see
  // RetroShader.NONE), and this scene borrows GalaxySim's own Earth and
  // starship, so both passes are rendered plainly and the two agree.

  // ==========================================================================
  // THE LIMINAL LENS
  //
  // The same effect the camper wears at speed in the voxel world, and it is
  // the same effect on purpose: VoxelWorldWarp's SpeedWarpFx, shader for
  // shader. Nothing in the scene is moved, scaled or displaced - the finished
  // frame is rendered into an offscreen target and blitted back through a
  // fragment shader that bends the LIGHT in a bubble round the vehicle, a
  // swirl plus a radial pull with the three channels pulled by slightly
  // different amounts so the rim fringes.
  //
  // Here the bubble is always centred, because the round is always framed:
  // the director never lets it off the middle of the screen during a liminal
  // crossing, which is the one beat of the flight where that matters.
  // ==========================================================================
  // GalaxySim's own lens, read off the plugin that owns it. The pair below is
  // the fallback for a build where GalaxySim is not loaded and is a copy of
  // the same two shaders; Scene3DCosmos is the source of truth.
  function lensShaders() {
    const C = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
    if (C && C.LENS_VERT && C.LENS_FRAG) return { vert: C.LENS_VERT, frag: C.LENS_FRAG };
    // i18n-ignore-start  GLSL
    return {
      vert: [
        "varying vec2 vUv;",
        "void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      ].join("\n"),
      frag: [
        "uniform sampler2D tDiffuse;",
        "uniform float uAspect;",
        "uniform float uHorizon;",
        "uniform float uEinstein;",
        "uniform float uSpin;",
        "varying vec2 vUv;",
        "void main() {",
        "  vec2 d = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);",
        "  float r = length(d);",
        "  float rc = max(r, uHorizon * 0.5);",
        "  float k = (uEinstein * uEinstein) / (rc * rc);",
        "  float tw = uSpin * 0.6 * k;",
        "  float cs = cos(tw), sn = sin(tw);",
        "  vec2 src = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs) * (1.0 - k);",
        "  vec4 col = texture2D(tDiffuse, vec2(src.x / uAspect, src.y) + 0.5);",
        "  float x = uEinstein / rc;",
        "  float mu = 1.0 / max(abs(1.0 - x * x * x * x), 0.14);",
        "  col.rgb *= clamp(mu, 0.55, 3.2);",
        "  col *= smoothstep(uHorizon, uHorizon * 1.5, r);",
        "  gl_FragColor = col;",
        "}",
      ].join("\n"),
    };
    // i18n-ignore-end
  }

  class LiminalLens {
    constructor() {
      this._target = null;
      this._mat = null;
      this._scene = null;
      this._cam = null;
    }

    _build() {
      if (this._mat) return;
      const sh = lensShaders();
      this._mat = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        transparent: false,
        blending: THREE.NoBlending,
        uniforms: {
          tDiffuse: { value: null },
          uAspect: { value: 1 },
          // The dark halo the shader cuts for a hole to be drawn into. Here
          // it is kept small: what is drawn into it is the round.
          uHorizon: { value: 0.03 },
          // How hard the well pulls. This is the drive, and it is deliberately
          // modest - a crossing should read as depth, not as a blur.
          uEinstein: { value: 0 },
          uSpin: { value: 0.22 },
        },
        vertexShader: sh.vert,
        fragmentShader: sh.frag,
      });
      this._scene = new THREE.Scene();
      this._scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat));
      this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
      this._cam.position.z = 1;
    }

    // drawInto(target) renders the bendable world - everything except the
    // round - into whatever it is handed. over() then draws the round itself
    // over the bent frame, unwarped, the way the hole is drawn over its own
    // bent sky. Returns false when the lens declined, so the caller falls back
    // to drawing straight at the canvas.
    render(renderer, drawInto, amount, time, over) {
      if (!renderer || !(amount > 0)) return false;
      try {
        this._build();
        const w = Math.max(1, renderer.domElement.width);
        const h = Math.max(1, renderer.domElement.height);
        let rt = this._target;
        if (!rt || rt.width !== w || rt.height !== h) {
          if (rt) rt.dispose();
          rt = new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            depthBuffer: true,
            stencilBuffer: false,
          });
          // The offscreen frame must hold exactly what the canvas would have
          // held: three picks the colour conversion off the TARGET's texture,
          // so a linear one would store unconverted colour and this shader,
          // which has no encoding pass of its own, would paint it washed out.
          if (THREE.SRGBColorSpace !== undefined && "colorSpace" in rt.texture) {
            rt.texture.colorSpace = THREE.SRGBColorSpace;
          } else if (THREE.sRGBEncoding !== undefined) {
            rt.texture.encoding = THREE.sRGBEncoding;
          }
          this._target = rt;
        }

        drawInto(rt);

        const u = this._mat.uniforms;
        u.tDiffuse.value = rt.texture;
        u.uAspect.value = w / h;
        // The Einstein radius IS the drive, and it is kept SMALL on purpose.
        // What suits a black hole does not suit this: there the middle of the
        // frame is the hole, and the eye reads the ring as the edge of a
        // thing; here the middle of the frame is a vehicle the player wants to
        // look at, and the same strength smears the sky round it. See the note
        // above the class.
        u.uEinstein.value = 0.045 * amount;
        u.uHorizon.value = 0.016 + 0.008 * amount;
        // A little frame dragging, breathing, so the well is never a still
        // photograph of a well - and little is the word: the swirl is what
        // turns a lens into a smear the moment it is overdone.
        u.uSpin.value = 0.22 + 0.12 * Math.sin(time * 1.7);

        renderer.setRenderTarget(null);
        renderer.render(this._scene, this._cam);
        // And the round, over the top of it. Without this the shader's own
        // photon-capture cut leaves a dark disc where the vehicle should be.
        if (over) over();
        return true;
      } catch (e) {
        return false;
      }
    }

    dispose() {
      if (this._target) { try { this._target.dispose(); } catch (e) { /* gone */ } this._target = null; }
      if (this._scene) {
        this._scene.traverse((o) => { if (o.geometry) { try { o.geometry.dispose(); } catch (e) { /* gone */ } } });
        this._scene = null;
      }
      if (this._mat) { try { this._mat.dispose(); } catch (e) { /* gone */ } this._mat = null; }
    }
  }

  // Reused every frame by the corridor rather than allocated in it.
  let BLACK_COL = null;

  class LaunchStage {
    constructor(width, height, site, env, profile, destSite) {
      this._w = Math.max(160, Math.floor(width));
      this._h = Math.max(120, Math.floor(height));
      this.site = site;
      this.env = env;
      this.profile = profile || PROFILES.orbital;
      // A hop has a pad at the far end of the track. An orbital flight has
      // something at the top of the climb instead: the starship, or - once
      // Earth is gone and a crossing is the only way between what is left of
      // it - the Omega Tower or the patron's vault, closed with on the same
      // approach the ship is.
      const dest = destSite || (this.profile.downrange ? otherSite(site.id) : SITES.ship);
      // A descent has a pad at the far end too, and it is straight down: the
      // receiving gun comes up out of the air underneath a falling round the
      // same way the launching one drops away under a climbing one.
      this.descent = !!this.profile.descent;
      this.destSite = (this.profile.downrange || this.descent) ? dest : null;
      // What the docking phase closes on, when the flight is not a hop and is
      // not coming down.
      this.orbitalTarget = (this.profile.downrange || this.descent) ? null : dest;
      // The geography under the flight is the geography of the pad it is
      // going to when it is coming down: a pad in orbit has none of its own.
      this.geoSite = this.descent ? dest : site;
      // Where the altimeter starts. Everything the near scene does with the
      // departure end of a descent is measured from it.
      this.startAlt = altitudeAt(0, this.profile);
      this.trackM = (this.destSite && !this.descent) ? greatCircleM(site, this.destSite) : 0;
      this.downrange = 0;
      this.downrangeZ = 0;
      this.rng = makeRng(hashOf(site.id) ^ 0x5eed);
      // The circuit round the Moon, rolled fresh for this flight. Its own
      // generator, so nothing else in the scene shifts when it changes.
      this.orbit = this._rollOrbit();
      this._disposables = [];
      this._time = 0;
      this.alt = 0;
      this.integrity = INTEGRITY_START;
      this.shake = 0;
      this.roll = 0;
      this.impactFlash = 0;

      // WHAT IS BUILT NOW, AND WHAT IS BUILT LATER.
      //
      // The pad, the vehicle and the sky are on screen in the first frame, so
      // they are built in the constructor and the player waits for them. The
      // planet's real textured body, its city grid, the belt and the starship
      // are not: they are minutes of flight away, they are the four most
      // expensive things in the scene, and building them here is most of the
      // wait before the countdown starts. They go on a queue instead, one item
      // a frame, and anything that needs one early simply asks for it.
      this._deferred = [];
      this._built = {};

      this._initThree();
      {
        this._buildFar();
        this._buildSky();
        this._buildPad();
        // The receiving gun is a second installation the size of the first,
        // and nothing sees it until the last fifteen seconds of the flight.
        if (this.destSite) this._defer("padB", () => this._buildArrivalPad());
        this._buildVehicle();
        // The belt is what is left in orbit of everything Earth ever launched.
        // With Earth gone it has been gone for years: nothing is being put up
        // there any more and what was up there came down with the impact.
        if (this.profile.belt && !earthGone()) this._defer("belt", () => this._buildBelt());
        // The hull is built for the flight that ENDS at it, and also for the
        // flight that begins on one: the ship's gun is a mast bolted to a
        // hull, and a launch off it with nothing under the mast read as a
        // barrel floating in the dark.
        if (!this.profile.downrange && (!this.profile.lunar || site.mounted)) {
          this._defer("ship", () => this._buildShip());
        }
        // The Moon base, and the regolith it stands on. Four beats away at the
        // earliest and the most expensive thing a lunar flight builds, so it
        // goes on the queue like everything else and is asked for on the way
        // in - see _updateMoonGround.
        if (this.profile.lunar) this._defer("moonGround", () => this._buildMoonGround());
        // And the world the crossing is AIMED at, for the two worlds that had
        // no body of their own - see WORLD_BALL. Minutes away, like the rest
        // of the queue.
        this._defer("targetWorld", () => this._buildTargetWorld());
        // Jupiter, the hole and the corridor: one of them per crossing at
        // most, and each of them a minute of flight away when it is wanted.
        if (this.profile.assist) this._defer("jupiter", () => this._buildJupiter());
        if (this.profile.jump) {
          this._defer("charges", () => this._buildCharges());
          this._defer("gods", () => this._buildGods());
          // Only a flight LEAVING Andromeda drops its charge against the red
          // moon; everything else drops it against Jupiter.
          if (this.profile.fromWorld === "titania") {                  // i18n-ignore  world id
            this._defer("redMoon", () => this._buildRedMoon());
          }
        }
        // The two galaxies trading places, which is the only thing that shows
        // an intergalactic jump IS one.
        if (this.profile.jump) this._defer("galaxies", () => this._buildGalaxies());
        if (this.profile.hyper) this._defer("corridor", () => this._buildCorridor());
        // Both Zeta suns wear a shell. It is the thing the crew are told about
        // before they go and the thing they talk about when they arrive, so it
        // is on screen for the whole approach.
        if (this.profile.world === "zeta") this._defer("dyson", () => this._buildDyson());
        this._buildParticles();
      }
      // The first frame is the one the player is waiting for, so it builds
      // nothing at all: the queue starts on the frame after it.
      this._suppressDrain = true;
      this.update(0, 0);
      this._suppressDrain = false;
    }

    get domElement() { return this.renderer.domElement; }

    // The pass. Rolled once per flight off the launch counter, so a player who
    // goes to the Moon twice is shown two different orbits.
    _rollOrbit() {
      const r = makeRng(hashOf(this.site.id + ":" + nextLaunchSerial()) ^ 0x10f3);
      return {
        // Prograde or retrograde. It decides which way the surface streams and
        // which way the camera swings with it.
        dir: r() < 0.5 ? 1 : -1,
        // One, two or three times round. Eight seconds either way, so three
        // revolutions is a low fast orbit and one is a long slow look.
        revs: 1 + Math.floor(r() * 3),
        // How far the plane of the pass is tilted out of the round's own: a
        // polar approach looks nothing like an equatorial one.
        incl: (r() - 0.5) * 1.15,
        // Which side of the frame the Moon hangs on, and how far down.
        side: r() < 0.5 ? 1 : -1,
        drop: 0.20 + r() * 0.20,
        // Where on the circuit the round arrives.
        entry: r() * Math.PI * 2,
      };
    }

    // --- plumbing ---------------------------------------------------------

    _initThree() {
      if (!BLACK_COL) BLACK_COL = new THREE.Color(0x000000);
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
      this.farAmbient = new THREE.AmbientLight(0x4a5a78, 0.55);
      this.far.add(this.farSun, this.farAmbient);

      // THE MOON IS LIT BY A LIGHT OF ITS OWN, AND IT HAS TO BE.
      //
      // The far key is deliberately dishonest: it is dragged round toward the
      // camera so the hemisphere of Earth under the vehicle is never a black
      // disc (see _updateSun). A Moon lit by that key is FULL at every hour of
      // every night, which is the one thing about the Moon everybody can check
      // out of a window. So the Moon is put on its own render layer and given
      // its own key, aimed from the true phase angle of the date the game is
      // on, and the far key is told to leave that layer alone.
      onLayer(this.farSun, 0);
      onLayer(this.farAmbient, 0);
      seeLayer(this.farCamera, MOON_LAYER);
      this.moonSun = new THREE.DirectionalLight(0xfff6ea, 2.4);
      onLayer(this.moonSun, MOON_LAYER);
      this.far.add(this.moonSun);
      // Earthshine, and nothing more: the dark limb of the Moon is not black,
      // it is the Earth reflected back onto it.
      this.moonAmbient = new THREE.AmbientLight(0x2c3a58, 0.34);
      onLayer(this.moonAmbient, MOON_LAYER);
      this.far.add(this.moonAmbient);

      // The vehicle's own lights: the plume when it burns, and the strobe that
      // comes on the moment the belt starts hitting it.
      this.plumeLight = new THREE.PointLight(0xffb45a, 0, 900, 2);
      this.plumeLight.position.set(0, -14, 0);
      this.near.add(this.plumeLight);
      this.warnLight = new THREE.PointLight(0xff2a1e, 0, 220, 2);
      this.warnLight.position.set(0, 4, 0);
      this.near.add(this.warnLight);
    }

    // --- the build queue --------------------------------------------------
    //
    // A piece of the scene that is not needed in the first frame. It is built
    // on the first frame that asks for it, or on the first idle frame after
    // that, whichever comes first - and never twice.
    _defer(key, fn) {
      this._built[key] = false;
      this._deferred.push({ key, fn });
    }

    _ensure(key) {
      if (this._built[key]) return;
      const i = this._deferred.findIndex((d) => d.key === key);
      if (i < 0) return;
      const job = this._deferred.splice(i, 1)[0];
      // Asked for while the scene is still being put together - a descent
      // opens with the planet already under it - it is not built now. It goes
      // to the HEAD of the queue instead and lands on the next frame or two,
      // which nobody can see and which keeps the first frame free.
      if (this._suppressDrain) { this._deferred.unshift(job); return; }
      this._built[key] = true;
      try { job.fn(); } catch (e) { /* a piece that will not build is a piece the flight does without */ }
    }

    // One item a frame, so the wait is spread over the hold instead of being
    // paid in one lump before the scene appears.
    _drainDeferred() {
      if (this._suppressDrain || !this._deferred.length) return;
      this._ensure(this._deferred[0].key);
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
      if (this._lens) { this._lens.dispose(); this._lens = null; }
      if (this.dyson && typeof this.dyson.dispose === "function") {
        try { this.dyson.dispose(); } catch (e) { /* not ours to keep */ }
      }
      try {
        if (window.PSXShader && window.PSXShader.disposeContext) {
          window.PSXShader.disposeContext(this.renderer);
        }
        this.renderer.dispose();
        this.renderer.forceContextLoss();
      } catch (e) { /* the context is going away regardless */ }
    }

    // --- the far scene: Earth, sun, stars ---------------------------------


















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
      this._buildNavLights(BODY_R, BODY_L);
      this._buildPlume(BODY_R, BODY_L);
      this._buildPlasma(BODY_R, BODY_L);
      // THE MIDDLE STAGE. Only a flight aimed at the Moon carries one, and it
      // is fitted between the bullet and the boost stage - which is what makes
      // a lunar round visibly longer than every other round the gun throws.
      this.hasLiminal = !!this.profile.liminal;
      // And the sleeve over it. A drive that has to survive the belt wears an
      // armour belt of its own, thicker than anything on the hull, and it is
      // the one thing aboard that the belt is not allowed to take: see
      // _buildShroud and the shed loop, which never sees these panels. A
      // flight leaving from orbit crosses no belt and is fitted with none.
      this.hasShroud = !!(this.hasLiminal && this.profile.shroud && this.profile.belt);
      this.shroudGone = false;
      if (this.hasLiminal) this._buildLiminal(BODY_R, BODY_L);
      // The boost stage, and only where there is a climb to boost: a round
      // leaving the ship is already in orbit and a round falling to Earth is
      // spending altitude rather than buying it, so neither carries one, and
      // with Earth gone there is no atmosphere to punch out of either.
      this.hasBooster = !!(this.profile.belt && !this.descent && !this.site.orbital && !earthGone());
      this.boosterGone = false;
      if (this.hasBooster) this._buildBooster(BODY_R, BODY_L);
      // With a stage in between, the boost stage sits further back and the
      // flame comes out of ITS bell rather than out of the bullet's throat.
      if (this.hasLiminal && this.booster) {
        this.booster.position.y = -BODY_L / 2 - LIMINAL_LEN - 10.4;
        this.plume.position.y = this.booster.position.y - 7.6;
      }
      // Only a round that comes down through air has anything to hang a
      // canopy in.
      if (this.descent) this._buildChute(BODY_R, BODY_L);
    }

    // THE CANOPY. The last of the speed is taken out of a descent the cheap
    // way: a drogue out of the shoulder of the nose at the top of the terminal
    // beat, the main behind it, and both cut away above the muzzle so the
    // receiving coil gets a round hanging on nothing.
    _buildChute(R, L) {
      const g = new THREE.Group();
      this.chute = g;
      g.visible = false;
      // The round comes down nose first and hangs by its TAIL, and the tail is
      // local -y. The whole rig is turned over with it so that, once the
      // vehicle's own flip is applied, the canopy is the thing above.
      g.position.y = -(L / 2 + 12);
      g.rotation.x = Math.PI;
      this.vehicle.add(g);

      const canopy = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(R * 5.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
        this._mat(new THREE.MeshPhongMaterial({
          color: 0xe8552f, shininess: 8, side: THREE.DoubleSide,
          transparent: true, opacity: 0.94,
        }))
      );
      canopy.position.y = R * 2.2;
      g.add(canopy);
      this.chuteCanopy = canopy;

      const band = new THREE.Mesh(
        this._geo(new THREE.TorusGeometry(R * 5.2, R * 0.18, 6, 20)),
        this._phong({ color: 0xf4f0e6, shininess: 10 })
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = R * 2.2;
      g.add(band);

      const line = this._geo(new THREE.CylinderGeometry(0.06, 0.06, R * 4.4, 4));
      const lineMat = this._phong({ color: 0xbfc4cc, shininess: 6 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const s = new THREE.Mesh(line, lineMat);
        s.position.set(Math.cos(a) * R * 2.4, -R * 0.2, Math.sin(a) * R * 2.4);
        s.rotation.z = -Math.cos(a) * 0.5;
        s.rotation.x = Math.sin(a) * 0.5;
        g.add(s);
      }
    }

    // THE BOOST STAGE.
    //
    // The rail throws the round; this is what circularises it, and it is the
    // only part of the vehicle that is meant to be thrown away. It burns from
    // ignition to the far side of the belt and separates the moment the tanks
    // are dry - or the moment something in the belt opens them, which is a
    // louder separation and no worse an arrival: by the time the belt has it,
    // the burn it was carrying has already been made.
    _buildBooster(R, L) {
      const g = new THREE.Group();
      g.position.y = -L / 2 - 5.2;
      this.booster = g;
      this.vehicle.add(g);

      const skin = this._phong({ color: 0x4e545d, shininess: 26, specular: 0x8d949e });
      const tank = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(R * 0.94, R * 0.86, 9.0, 16)), skin);
      g.add(tank);
      const collar = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 1.1, 16)), skin);
      collar.position.y = 4.6;
      g.add(collar);
      const bell = new THREE.Mesh(
        this._geo(new THREE.ConeGeometry(R * 0.88, 3.4, 16, 1, true)),
        this._mat(new THREE.MeshPhongMaterial({ color: 0x2b2f35, side: THREE.DoubleSide, shininess: 22 }))
      );
      bell.rotation.x = Math.PI;
      bell.position.y = -6.2;
      g.add(bell);
      // Four stringers down the outside, so the thing reads as a stage and not
      // as more bullet.
      const strut = this._geo(new THREE.BoxGeometry(0.4, 9.0, 0.4));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const s = new THREE.Mesh(strut, skin);
        s.position.set(Math.cos(a) * R * 0.99, 0, Math.sin(a) * R * 0.99);
        g.add(s);
      }
      g.userData.spin = new THREE.Vector3(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5);
    }

    _buildLiminal(R, L) {
      const g = new THREE.Group();
      g.position.y = -L / 2 - LIMINAL_LEN / 2 - 2.6;
      this.liminal = g;
      this.vehicle.add(g);

      const skin = this._phong({ color: 0x2f3138, shininess: 34, specular: 0x8d949e });
      // ONE DRUM PER STAGE. A crossing to the Moon carries a single engine; one
      // to Zeta carries a stack of three, which is most of why that round is
      // visibly twice the length of any other the gun throws. They are dropped
      // from the BOTTOM up as each is spent - see _shedStack.
      const n = Math.max(1, this.profile.liminalStages || 1);
      const drumGeo = this._geo(new THREE.CylinderGeometry(R * 0.9, R * 0.9, LIMINAL_LEN, 16));
      this.stackDrums = [];
      for (let i = 0; i < n; i++) {
        const drum = new THREE.Mesh(drumGeo, skin);
        // Stacked downward, so the one that goes first is the one furthest
        // from the bullet.
        drum.position.y = -i * (LIMINAL_LEN + 0.6);
        g.add(drum);
        this.stackDrums.push(drum);
      }
      // The stack is dropped last-first, so the list is reversed: index 0 is
      // the bottom drum and the first to go.
      this.stackDrums.reverse();

      // The three vanes. Cold and dark until the drive is lit, and then the
      // brightest thing in the scene.
      const vaneGeo = this._geo(new THREE.BoxGeometry(0.5, LIMINAL_LEN * 0.72, R * 1.5));
      this.liminalVanes = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const mat = this._mat(new THREE.MeshPhongMaterial({
          color: 0x201a2e, emissive: new THREE.Color(0x9fd8ff), emissiveIntensity: 0,
          shininess: 70, specular: 0xdff1ff,
        }));
        const v = new THREE.Mesh(vaneGeo, mat);
        v.position.set(Math.cos(a) * R * 1.0, 0, Math.sin(a) * R * 1.0);
        v.rotation.y = -a;
        g.add(v);
        this.liminalVanes.push(v);
      }

      // The core, which is the part nobody is meant to look straight at.
      this.liminalCore = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(R * 0.62, 14, 10)),
        this._basic({
          color: 0xf4fbff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      g.add(this.liminalCore);

      // The halo it throws once it is running, standing off the drum: the only
      // part of the effect that can be seen from behind.
      this.liminalHalo = new THREE.Mesh(
        this._geo(new THREE.TorusGeometry(R * 1.9, R * 0.34, 8, 24)),
        this._basic({
          color: 0x7fc6ff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      this.liminalHalo.rotation.x = Math.PI / 2;
      g.add(this.liminalHalo);

      this.liminalLight = new THREE.PointLight(0xbfe4ff, 0, 420, 2);
      this.near.add(this.liminalLight);

      // THE FLAME. Three nested cones out of the back of the drum, the same
      // build as the chemical plume and nothing like its colour: the core is
      // white with the barest blue in it, the body is arc blue and the halo is
      // the cold edge of it. A liminal drive is not burning anything, but it
      // is doing something violent to the space behind it, and that shows.
      this.liminalFlame = new THREE.Group();
      this.liminalFlame.position.y = -LIMINAL_LEN / 2;
      g.add(this.liminalFlame);
      const cone = (rad, len, color, opacity) => {
        const m = new THREE.Mesh(
          this._geo(new THREE.ConeGeometry(rad, len, 14, 1, true)),
          this._mat(new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }))
        );
        m.rotation.x = Math.PI;
        m.position.y = -len / 2;
        this.liminalFlame.add(m);
        return m;
      };
      this.liminalJetCore = cone(R * 0.5, 19, 0xffffff, 0);
      this.liminalJetBody = cone(R * 0.92, 38, 0xbfe4ff, 0);
      this.liminalJetHalo = cone(R * 1.7, 64, 0x5aa8ff, 0);

      if (this.hasShroud) this._buildShroud(R, L);
    }

    // The sleeve. Six staves of armour twice the thickness of a hull plate,
    // wrapped round the drive and carrying NO threshold: the shed loop walks
    // this.plates and these are not in it, so nothing the belt does can take
    // one off. That is the entire reason it is fitted.
    _buildShroud(R, L) {
      const g = new THREE.Group();
      this.shroud = g;
      this.liminal.add(g);
      const staveGeo = this._geo(new THREE.BoxGeometry(1, 1, 1));
      const mat = this._phong({ color: 0x6d6257, shininess: 20, specular: 0x9aa2ad });
      this.shroudStaves = [];
      const TH = 1.15;   // nearly twice a hull plate, and it reads as it
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = new THREE.Mesh(staveGeo, mat);
        p.position.set(Math.cos(a) * (R * 1.45 + TH / 2), 0, Math.sin(a) * (R * 1.45 + TH / 2));
        p.scale.set(TH, LIMINAL_LEN + 1.4, (2 * Math.PI * R * 1.45) / 6 - 0.25);
        p.rotation.y = -a;
        p.userData.spin = new THREE.Vector3(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).multiplyScalar(5);
        g.add(p);
        this.shroudStaves.push(p);
      }
      // The caps top and bottom, so the sleeve reads as a closed can rather
      // than as a fence round the drive.
      const capGeo = this._geo(new THREE.CylinderGeometry(R * 1.62, R * 1.62, 0.8, 16));
      [-1, 1].forEach((s) => {
        const c = new THREE.Mesh(capGeo, mat);
        c.position.y = s * (LIMINAL_LEN / 2 + 0.5);
        c.userData.spin = new THREE.Vector3(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).multiplyScalar(4);
        g.add(c);
        this.shroudStaves.push(c);
      });
    }

    // One drive of the stack, at the end of the beat it was lit for. Reparented
    // to the world and left to tumble away behind, exactly the way the boost
    // stage goes - it is the same kind of parting.
    _shedStack(ph) {
      const at = STACK_DROPS.indexOf(ph.key);
      if (at < 0 || ph.progress < 0.92) return;
      this._stackDropped = this._stackDropped || 0;
      if (this._stackDropped > at) return;
      this._stackDropped = at + 1;
      const drum = this.stackDrums && this.stackDrums[at];
      if (drum) {
        this.liminal.remove(drum);
        this.near.add(drum);
        drum.position.y += this.liminal.position.y;
        drum.userData.vel = new THREE.Vector3(
          (this.rng() - 0.5) * 5, -12 - this.rng() * 10, (this.rng() - 0.5) * 5
        );
        drum.userData.spin = new THREE.Vector3(
          (this.rng() - 0.5) * 3, (this.rng() - 0.5) * 3, (this.rng() - 0.5) * 3
        );
        drum.userData.life = 4.0;
        this.shed.push(drum);
      }
      this.shake = Math.max(this.shake, 1.1);
      this._pendingSe = this._pendingSe || [];
      this._pendingSe.push({ name: SE.clamp, volume: 80, pitch: 80 + at * 10 });
    }

    // Blown the moment the belt is behind the round, and never before: the
    // sleeve is what got the drive this far. Every stave goes at once, thrown
    // outward off the drum, and what is left standing in the middle of them is
    // the engine, lighting for the first time in the open.
    _dropShroud() {
      if (!this.shroud || this.shroudGone) return;
      this.shroudGone = true;
      // Reparented the way the boost stage is, by ARITHMETIC rather than by
      // asking three for a world matrix: the stave sits on the drum, the drum
      // sits at a known offset down the vehicle, and the vehicle is at the
      // origin - so the sum is the answer and the shed loop can fly it.
      const drumY = this.liminal ? this.liminal.position.y : 0;
      this.shroudStaves.forEach((p) => {
        this.shroud.remove(p);
        this.near.add(p);
        p.position.y += drumY;
        p.userData.vel = new THREE.Vector3(
          p.position.x * 5 + (this.rng() - 0.5) * 4,
          -4 - this.rng() * 10,
          p.position.z * 5 + (this.rng() - 0.5) * 4
        );
        p.userData.life = 3.0;
        this.shed.push(p);
      });
      this.shroudStaves.length = 0;
      this.shake = Math.max(this.shake, 1.4);
      this._pendingSe = this._pendingSe || [];
      this._pendingSe.push({ name: SE.tear, volume: 78, pitch: 70 });
      this._pendingSe.push({ name: SE.clamp, volume: 70, pitch: 80 });
    }

    // Reentry. A shock cap standing off the nose and a sheath down the flank,
    // both additive and both driven by one number, so the round comes down the
    // sky as a light rather than as a model with a warm nose on it.
    _buildPlasma(R, L) {
      const g = new THREE.Group();
      this.plasma = g;
      g.visible = false;
      this.vehicle.add(g);

      this.plasmaCap = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(R * 2.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
        this._basic({
          color: 0xfff0d0, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      this.plasmaCap.position.y = L / 2 + 7.5;
      g.add(this.plasmaCap);

      this.plasmaTrail = new THREE.Mesh(
        this._geo(new THREE.ConeGeometry(R * 2.6, L * 3.4, 16, 1, true)),
        this._basic({
          color: 0xff7a2a, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      this.plasmaTrail.position.y = -L * 1.2;
      g.add(this.plasmaTrail);

      this.plasmaLight = new THREE.PointLight(0xffb070, 0, 260, 2);
      this.plasmaLight.position.y = L / 2 + 6;
      g.add(this.plasmaLight);
    }

    // THE LIGHTS ON THE OUTSIDE OF IT.
    //
    // Every round the gun throws is lit, and it was not: the hull was a dark
    // shape against a dark sky on every beat that was not a burn, which is
    // most of a crossing. So it wears what anything crewed wears - red to
    // port, green to starboard, a white anticollision strobe on the collar
    // and a row of small white deck lamps down the flank - and they are lit
    // from the moment it leaves the rail to the moment it is set down.
    //
    // They are emissive plates rather than lights: a dozen point lights on a
    // vehicle that is already carrying a plume, a strobe and a drive is a
    // dozen more shadow passes for something the size of a coin on screen.
    _buildNavLights(BODY_R, BODY_L) {
      const g = new THREE.Group();
      this.navLights = g;
      this.vehicle.add(g);
      this._navLamps = [];

      const lamp = (color, x, y, z, size, kind) => {
        const m = new THREE.Mesh(
          this._geo(new THREE.SphereGeometry(size, 8, 6)),
          this._mat(new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.9,
            depthWrite: false, blending: THREE.AdditiveBlending,
          }))
        );
        m.position.set(x, y, z);
        m.userData.kind = kind;
        m.userData.base = size;
        g.add(m);
        this._navLamps.push(m);
        return m;
      };

      const R = BODY_R * 1.04;
      // Port and starboard, on the shoulders where they can be seen from
      // either side and from ahead.
      lamp(0xff2a22, -R, BODY_L * 0.22, 0, 0.30, "port");
      lamp(0x22ff5a, R, BODY_L * 0.22, 0, 0.30, "starboard");
      // The anticollision strobe, on the collar under the nose.
      lamp(0xffffff, 0, BODY_L * 0.46, R, 0.34, "strobe");
      lamp(0xffffff, 0, BODY_L * 0.46, -R, 0.34, "strobe");
      // And the deck lamps: a row down each flank, so the length of the thing
      // reads as a length even with nothing burning under it.
      for (let i = 0; i < 5; i++) {
        const y = BODY_L * (0.30 - i * 0.14);
        lamp(0xffe7bc, -R * 0.72, y, R * 0.72, 0.16, "deck");
        lamp(0xffe7bc, R * 0.72, y, -R * 0.72, 0.16, "deck");
      }
      // One light that is a light, because a hull with nothing shining ON it
      // reads as a painted shape. It is dim, and it is the only one.
      this.navGlow = new THREE.PointLight(0xcfe2ff, 0.45, 60, 2);
      this.navGlow.position.set(0, BODY_L * 0.3, 0);
      this.vehicle.add(this.navGlow);
    }

    // Lit from the rail to the pad, and the strobe beats twice a second the
    // way a real anticollision light does: two quick flashes and a rest.
    _updateNavLights(dt) {
      if (!this._navLamps) return;
      const on = this.phase && this.phase.key !== "arrived";
      this.navLights.visible = !!on;
      if (this.navGlow) this.navGlow.intensity = on ? 0.45 : 0;
      if (!on) return;
      const cyc = (this._time % 1.4) / 1.4;
      const flash = (cyc < 0.06 || (cyc > 0.14 && cyc < 0.20)) ? 1 : 0.02;
      const breathe = 0.78 + Math.sin(this._time * 2.1) * 0.06;
      for (let i = 0; i < this._navLamps.length; i++) {
        const m = this._navLamps[i];
        if (m.userData.kind === "strobe") {
          m.material.opacity = flash;
          m.scale.setScalar(0.7 + flash * 1.1);
        } else {
          m.material.opacity = breathe;
          m.scale.setScalar(1);
        }
      }
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
        // The blade points OUT, radially, the way a fin on anything that flies
        // points: rotating by -a puts the shape's own +x along the radius. The
        // extra quarter turn this used to carry laid every fin flat around the
        // body instead, edge on to the airflow and half buried in the hull.
        f.rotation.y = -a;
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

    // --- the Moon, underneath -----------------------------------------------




    // --- Jupiter, the hole, and the corridor --------------------------------




    // The pellets, and the rings they leave.
    _buildCharges() {
      const g = new THREE.Group();
      this.charges = g;
      g.visible = false;
      this.near.add(g);

      this.pellets = [];
      this.blastRings = [];
      const pelletGeo = this._geo(new THREE.SphereGeometry(0.85, 10, 8));
      const ringGeo = this._geo(new THREE.RingGeometry(0.82, 1, 48, 1));
      // AND THE BALL. A charge that has gone off is a volume of violet with a
      // white centre, not a hoop: the ring alone read as a smoke ring blown
      // past the window. The shell is what the round rides, the ring is the
      // edge of it seen side-on, and both are the same event.
      const ballGeo = this._geo(new THREE.SphereGeometry(1, 24, 16));
      for (let i = 0; i < CHARGE_COUNT; i++) {
        // The pellet. Violet, and lit from inside: there is nothing out here
        // to light it from outside.
        const p = new THREE.Mesh(pelletGeo, this._mat(new THREE.MeshBasicMaterial({
          color: 0xb46cff, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending,
        })));
        p.visible = false;
        g.add(p);
        this.pellets.push(p);

        // And the ring it becomes. Flat, because the thing that goes off is a
        // decision rather than a chemical, and a decision has no volume.
        const r = new THREE.Mesh(ringGeo, this._mat(new THREE.MeshBasicMaterial({
          color: 0xe6d0ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })));
        r.visible = false;
        // No two of them are the same size. That is the whole point of the
        // string: each one is a different amount of having happened.
        r.userData.radius = 90 + this.rng() * 260;
        r.userData.core = new THREE.Mesh(ringGeo, this._mat(new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })));
        r.userData.core.visible = false;
        // The violet shell, and the white it is lit from inside by.
        const ball = new THREE.Mesh(ballGeo, this._mat(new THREE.MeshBasicMaterial({
          color: 0x9a4cff, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending,
        })));
        ball.visible = false;
        const heart = new THREE.Mesh(ballGeo, this._mat(new THREE.MeshBasicMaterial({
          color: 0xf2e4ff, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending,
        })));
        heart.visible = false;
        r.userData.ball = ball;
        r.userData.heart = heart;
        g.add(r, r.userData.core, ball, heart);
        this.blastRings.push(r);
      }
      this.chargeLight = new THREE.PointLight(0xd8b4ff, 0, 2600, 2);
      this.chargeLight.visible = false;
      g.add(this.chargeLight);
    }

    // THE GOLD.
    //
    // The far side of going faster than the thing you are going through can
    // take. There are no stars in it. Nobody aboard talks about it afterwards
    // and the plugin does not explain it either: it is a shell, it is gold,
    // and it is over in eight seconds.
    _buildGods() {
      const g = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(CORRIDOR_LEN * 1.2, 24, 18)),
        this._basic({
          color: 0xffc85a, side: THREE.BackSide, depthWrite: false,
          transparent: true, opacity: 0,
        })
      );
      this.gods = g;
      g.visible = false;
      this.near.add(g);
      this.godsLight = new THREE.PointLight(0xffd76a, 0, 5000, 2);
      this.godsLight.visible = false;
      this.near.add(this.godsLight);
    }






    _buildWormhole() {
      const g = new THREE.Group();
      this.wormhole = g;
      g.visible = false;
      this.far.add(g);

      const R = 120;
      // The mouth. The sky on it is the sky of the other side, and it is a
      // different sky: this is Andromeda seen from inside the Milky Way.
      this.holeMouth = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(R, 48, 36)),
        this._basic({ map: this._paintFarSky(), side: THREE.FrontSide })
      );
      g.add(this.holeMouth);

      // The rim: everything behind the round, dragged round the edge. Drawn as
      // a shell just outside the mouth, additive, so it reads as light bent
      // rather than as a ring painted on.
      this.holeRim = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(R * 1.10, 40, 28)),
        this._basic({
          color: 0xdfe8ff, transparent: true, opacity: 0.0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
        })
      );
      g.add(this.holeRim);

      this.holeGlow = new THREE.PointLight(0xbfd8ff, 0, 4000, 2);
      g.add(this.holeGlow);
    }

    // The sky on the far side of the hole: another galaxy, so a band that is
    // not the Milky Way and stars that are not in any constellation anybody
    // has a name for.
    _paintFarSky() {
      return this._tex(512, 256, (ctx, w, h) => {
        ctx.fillStyle = "#04060e";
        ctx.fillRect(0, 0, w, h);
        const r = makeRng(0x31a0d0);
        // Andromeda itself, edge on and enormous, because from Titania it is
        // the sky rather than a smudge in it.
        const g2 = ctx.createLinearGradient(0, h * 0.34, 0, h * 0.66);
        g2.addColorStop(0, "rgba(120,140,200,0)");
        g2.addColorStop(0.5, "rgba(210,205,230,0.55)");
        g2.addColorStop(1, "rgba(120,140,200,0)");
        ctx.fillStyle = g2;
        ctx.fillRect(0, h * 0.34, w, h * 0.32);
        for (let i = 0; i < 2600; i++) {
          const y = h * 0.5 + (r() - 0.5) * h * (r() > 0.6 ? 1 : 0.34);
          const a = 0.25 + r() * 0.7;
          ctx.fillStyle = r() > 0.72 ? "rgba(200,216,255," + a.toFixed(2) + ")"
            : "rgba(255,238,210," + a.toFixed(2) + ")";
          ctx.fillRect(Math.floor(r() * w), Math.floor(y), 1, 1);
        }
      });
    }

    // THE CORRIDOR, IN THREE DIMENSIONS.
    //
    // The ship's own window already draws this above 10x on the warp slider -
    // the 2001 slit scan, then hexspace, then the white with the
    // four-dimensional solids turning in it - and GalaxySim.HyperWarp
    // publishes the maths of all three. This is that corridor built out of
    // geometry instead of painted flat, so the round can fly down the middle
    // of it rather than have it drawn behind it: a square shaft of slabs, a
    // wall to each side and a dimmer roof and floor, every band its own
    // saturated hue, all of it rushing the camera.
    _buildCorridor() {
      const g = new THREE.Group();
      this.corridor = g;
      g.visible = false;
      this.near.add(g);

      this.slabs = [];
      const geo = this._geo(new THREE.PlaneGeometry(1, 1));
      const N = 76;
      const HW = CORRIDOR_HW;
      for (let i = 0; i < N; i++) {
        // Four walls. The two flanking the eye are the lit ones, the roof and
        // floor dimmer, exactly the way 2001 shoots the corridor.
        for (let side = 0; side < 4; side++) {
          const mat = this._mat(new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthWrite: false,
          }));
          const m = new THREE.Mesh(geo, mat);
          const vertical = side < 2;
          m.scale.set(vertical ? 1 : HW * 2, vertical ? HW * 2 : 1, 1);
          if (vertical) {
            m.position.x = side === 0 ? -HW : HW;
            m.rotation.y = Math.PI / 2;
          } else {
            m.position.y = side === 2 ? -HW : HW;
            m.rotation.x = Math.PI / 2;
          }
          m.userData.slot = i;
          m.userData.side = side;
          // The dim pair: the roof and the floor.
          m.userData.key = side < 2 ? 1 : 0.38;
          g.add(m);
          this.slabs.push(m);
        }
      }

      // The solids that turn in the white. Regular 4-polytopes, projected from
      // four dimensions into three every frame - the same ones the window
      // draws, off the same vertex and edge lists, because GalaxySim publishes
      // them and there is no reason for this file to hold a second copy.
      this.solids = [];
      const HW2 = window.GalaxySim && window.GalaxySim.HyperWarp;
      const kinds = ["tesseract", "cross", "simplex", "cell24"];   // i18n-ignore  polytope ids
      const lineMat = this._mat(new THREE.LineBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0,
      }));
      this.solidMat = lineMat;
      kinds.forEach((kind, i) => {
        let poly = null;
        try { poly = HW2 && HW2.polytope4 ? HW2.polytope4(kind) : null; } catch (e) { poly = null; }
        if (!poly || !poly.verts || !poly.edges) return;
        const pos = new Float32Array(poly.edges.length * 2 * 3);
        const geo2 = this._geo(new THREE.BufferGeometry());
        geo2.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const line = new THREE.LineSegments(geo2, lineMat);
        line.userData.poly = poly;
        line.userData.phase = i * 1.7;
        line.visible = false;
        g.add(line);
        this.solids.push(line);
      });

      this._buildLodge();

      // The ground the white floods. A shell around the round, painted from
      // inside, which goes from the corridor's own colour to pure white.
      this.corridorGround = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(CORRIDOR_LEN * 1.1, 16, 12)),
        this._basic({ color: 0x000000, side: THREE.BackSide, depthWrite: false })
      );
      g.add(this.corridorGround);
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
      // Which way the field streams. Climbing, the belt falls past overhead;
      // falling through it, the whole of it rises past from underneath.
      const s = this.descent ? -1 : 1;
      w.position.set(Math.cos(a) * rad, s * (initial ? (r() * 1400 - 400) : 700 + r() * 500), Math.sin(a) * rad);
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

      // Once Earth is gone an orbital crossing does not always end at the
      // ship: the Omega Tower and the patron's vault are out there too, and
      // the round closes on whichever of them it was aimed at. The approach,
      // the collar and the dock are the same either way - only the thing at
      // the far end of them changes.
      const target = this.orbitalTarget;
      if (target && target.id !== "ship") {   // i18n-ignore  site id
        this._buildOrbitalBody(target);
        this._buildDockCollar();
        return;
      }

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

      this._buildDockCollar();
    }

    // What an orbital crossing closes on when it is not the ship: the Omega
    // Tower, seen end on and turning, or the chunk of Earth the patron's vault
    // was dug into, with the lid of the shaft lit on the near face of it.
    _buildOrbitalBody(target) {
      const g = new THREE.Group();
      this.shipGroup.add(g);
      if (target.id === "omega") {   // i18n-ignore  site id
        // The tower itself, a kilometre of it drawn at dock scale: a bored
        // spire with the ring stack up the outside and the muzzle facing down.
        const shell = this._phong({ color: 0x9aa4b4, shininess: 40, specular: 0xc8d0da });
        const body = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(7, 13, 210, 12)), shell);
        body.rotation.x = Math.PI / 2;
        g.add(body);
        const ringGeo = this._geo(new THREE.TorusGeometry(15, 2.2, 6, 16));
        const ringMat = this._mat(new THREE.MeshPhongMaterial({
          color: 0x2a3240, emissive: new THREE.Color(target.coil), emissiveIntensity: 0.6, shininess: 60,
        }));
        for (let i = 0; i < 9; i++) {
          const r = new THREE.Mesh(ringGeo, ringMat);
          r.position.z = -90 + i * 22;
          g.add(r);
        }
        this.orbitalGlow = ringMat;
      } else {
        // A piece of a planet, turning slowly, with a lit hatch on it.
        const rock = this._phong({ color: target.groundLo, shininess: 2, flatShading: true });
        const chunk = new THREE.Mesh(this._geo(new THREE.IcosahedronGeometry(62, 1)), rock);
        chunk.scale.set(1, 0.72, 1.18);
        g.add(chunk);
        const lid = new THREE.Mesh(
          this._geo(new THREE.CylinderGeometry(16, 19, 4, 14)),
          this._phong({ color: 0x4a4f58, shininess: 26, specular: 0x777c85 })
        );
        lid.rotation.x = Math.PI / 2;
        lid.position.z = 44;
        g.add(lid);
        const glowMat = this._mat(new THREE.MeshBasicMaterial({ color: 0xff8a34 }));
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const L = new THREE.Mesh(this._geo(new THREE.SphereGeometry(1.7, 6, 5)), glowMat);
          L.position.set(Math.cos(a) * 21, Math.sin(a) * 21, 45);
          g.add(L);
        }
      }
      this.orbitalBody = g;
    }

    _buildDockCollar() {
      // The docking collar the bullet is aimed at, and the strip lights that
      // walk toward it during the approach.
      //
      // EVERY SHIP HAS ONE, AND IT IS ALWAYS IN THE SAME PLACE ON IT. The hull
      // is procedural - seventeen trait axes of it - so a collar pinned to a
      // hard-coded offset hangs in the void on half the ships the world seed
      // can roll. It is measured off the hull instead: the near face of the
      // model's own bounding box, which is the one part of a shape nobody can
      // generate away. With no measurable hull, the old fixed offset stands.
      // Local Z on a hull that is turned to face the round, so the collar ends
      // up BETWEEN the ship and the bullet rather than out behind it.
      this.dockZ = -58;
      // And the same measurement answers the other question about a
      // procedural hull: how far out its skin is, which is where a gun
      // mounted along it has to sit. Half the beam plus the width of the
      // gun's own frame, or a sane guess on a hull that cannot be measured.
      this.shipHalfW = 13;
      const hull = this.shipModel && this.shipModel.group;
      if (hull && THREE.Box3) {
        try {
          const box = new THREE.Box3().setFromObject(hull);
          const zf = box.max && box.max.z;
          if (isFinite(zf) && Math.abs(zf) > 0.5) this.dockZ = -(Math.abs(zf) + 3);
          const w = Math.max(Math.abs(box.max.x || 0), Math.abs(box.min.x || 0));
          const h = Math.max(Math.abs(box.max.y || 0), Math.abs(box.min.y || 0));
          const beam = Math.max(w, h);
          if (isFinite(beam) && beam > 0.5) this.shipHalfW = beam;
        } catch (e) { /* an unmeasurable hull keeps the defaults */ }
      }
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
        // --- to Andromeda, the long way ---------------------------------------
        case "cruise":
          // Side on, drifting, with the round pointed at something that is not
          // in frame yet. The quiet before the only aiming this flight does.
          return { target: T.set(0, 0, 0), yaw: 1.1 + k * 0.7, pitch: 0.12, dist: lerp(46, 68, smooth(k)), fov: 58 };
        case "jupiter":
          // Pulling back and back as the planet grows, because it is eleven
          // Earths across and the shot is worthless if it does not fit.
          return { target: T.set(0, 0, 0), yaw: 1.5 - k * 0.6, pitch: 0.1 + k * 0.14, dist: lerp(70, 128, smooth(k)), fov: lerp(58, 74, smooth(k)) };
        case "assist":
          // Round the back of it. The camera swings with the round, which is
          // what makes the planet appear to whip past rather than recede.
          return { target: T.set(0, 0, 0), yaw: 0.9 - k * 2.2, pitch: 0.26 - k * 0.3, dist: lerp(128, 78, smooth(k)), fov: 70 };
        case "escape":
          // Behind it, looking the way it is going, with nothing there.
          return { target: T.set(0, 0, 0), yaw: Math.PI, pitch: 0.06, dist: lerp(60, 92, smooth(k)), fov: 56 };
        case "sbspool":
          // In tight on the jump drive as the thing wakes up.
          return { target: T.set(0, -8, 0), yaw: 2.1 - k * 0.6, pitch: -0.18 + k * 0.24, dist: lerp(26, 54, smooth(k)), fov: lerp(46, 62, k) };
        case "wormhole":
          // Dead astern, so the hole opens in the middle of the frame and the
          // round is the silhouette in front of it.
          return { target: T.set(0, 0, lerp(-4, -22, smooth(k))), yaw: Math.PI, pitch: 0.04, dist: lerp(40, 88, smooth(k)), fov: lerp(54, 80, smooth(k)) };
        case "throat":
          // Inside. Loose and wandering, because nothing in here holds still
          // and the camera has stopped pretending it can.
          return { target: T.set(0, 0, 0), yaw: Math.PI + Math.sin(time * 0.31) * 0.9, pitch: Math.sin(time * 0.23) * 0.4, dist: lerp(54, 40, smooth(k)), fov: 76 };

        // --- down the corridor to Zeta ---------------------------------------
        case "solomon":
        case "hexspace":
        case "thewhite":
          // Straight down the shaft from behind the round, so the slabs rush
          // past on every side of it. It creeps in over the three beats: by
          // the white the camera is almost on the hull.
          return {
            target: T.set(0, 0, 0), yaw: Math.PI,
            pitch: 0.03 + Math.sin(time * 0.4) * 0.03,
            dist: lerp(46, 30, smooth(k)),
            fov: lerp(72, 86, smooth(k)),
          };
        case "emerge":
          // Out, and slowing, with a sky nobody aboard has seen before.
          return { target: T.set(0, 0, 0), yaw: 0.4 + k * 0.8, pitch: 0.1, dist: lerp(96, 58, smooth(k)), fov: lerp(78, 58, smooth(k)) };
        case "refuel":
          // Held off the flank, still, with the shell filling the frame behind
          // it: the one beat of the whole crossing where nothing is happening
          // and the point is to look at what somebody else built.
          return { target: T.set(0, 0, 0), yaw: 1.2 + Math.sin(time * 0.12) * 0.25, pitch: 0.16, dist: lerp(54, 64, smooth(k)), fov: 62 };
        case "transfer":
          // Off the tail again, under power, with the star going away behind.
          return { target: T.set(0, 0, lerp(-6, -18, smooth(k))), yaw: Math.PI, pitch: 0.08, dist: lerp(44, 74, smooth(k)), fov: 60 };

        // --- the crossing to the Moon ----------------------------------------
        case "shroud":
          // Low and behind, on the sleeve: six staves of armour coming off a
          // drive nobody has seen yet, and the Moon swinging round behind it.
          return { target: T.set(0, -12, 0), yaw: 2.2 + k * 1.1, pitch: -0.34 + k * 0.5, dist: lerp(38, 62, smooth(k)), fov: 60 };
        case "drift":
          // Thrown out of a gun that was already in orbit, with nothing under
          // it and nothing burning: the whole round, side on, in the dark.
          return { target: T.set(0, 0, 0), yaw: 0.9 + k * 1.1, pitch: 0.16, dist: lerp(40, 72, smooth(k)), fov: 58 };
        case "liminal":
          // In on the drum as the vanes come up, and then pulling back off it
          // as the light gets to be too much to sit next to.
          return { target: T.set(0, -10, 0), yaw: 1.7 - k * 0.5, pitch: -0.1 + k * 0.2, dist: lerp(22, 52, smooth(k)), fov: lerp(44, 62, k) };
        case "transit":
          // THE SHOT. Straight up the round from behind with the Moon dead
          // ahead of it and growing the whole nine seconds, pulled back as it
          // fills the frame. Nothing else is on screen and nothing else needs
          // to be.
          return { target: T.set(0, 0, lerp(-6, -26, smooth(k))), yaw: Math.PI, pitch: 0.06 + k * 0.1, dist: lerp(34, 74, smooth(k)), fov: lerp(52, 76, smooth(k)) };
        case "flyby":
          // Round the outside of the round, slowly, with the Moon sliding
          // along the bottom of the frame: the shot that says this is not a
          // dive at a surface, it is a circuit above one. Which way the camera
          // drifts is the way the pass was rolled to go.
          return { target: T.set(0, -4, 0), yaw: 0.7 + this.orbit.dir * k * 2.6, pitch: 0.18 + Math.sin(k * Math.PI) * 0.16, dist: lerp(70, 92, smooth(k)), fov: 62 };
        case "skim":
          // Across the surface at sixty kilometres coming down to two, side
          // on, with the regolith streaming underneath.
          return { target: T.set(0, -6, 0), yaw: 1.35 + k * 0.5, pitch: 0.2 - k * 0.14, dist: lerp(96, 54, smooth(k)), fov: 64 };
        case "touchdown":
          // Pulled out and low, so the apron, the domes and the round are all
          // in the same frame as it settles onto the lamps.
          return { target: T.set(0, lerp(-6, -18, smooth(k)), 0), yaw: -0.9, pitch: lerp(0.24, 0.08, smooth(k)), dist: lerp(70, 130, smooth(k)), fov: 58 };

        case "rendezvous":
          return { target: T.set(0, 3, lerp(-40, -14, smooth(k))), yaw: 0.25, pitch: 0.12, dist: lerp(70, 42, smooth(k)), fov: 52 };
        case "dock":
          return { target: T.set(0, 1.5, lerp(-14, -6, smooth(k))), yaw: lerp(0.25, 1.35, smooth(k)), pitch: 0.1, dist: lerp(42, 26, smooth(k)), fov: 48 };

        // --- the way down ---------------------------------------------------
        case "fall":
          // Underneath it, looking up past the round at the ship it just left,
          // while the planet fills the bottom of the frame. Nothing is
          // burning and nothing is going to: this is a thrown object.
          return { target: T.set(0, -4, 0), yaw: 2.6 - k * 0.7, pitch: lerp(-0.5, 0.18, smooth(k)), dist: lerp(48, 76, smooth(k)), fov: 62 };

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

    // NO CUTS. Every beat writes its own rig and the two rarely agree, so the
    // frame used to JUMP at each boundary - a different yaw, a different
    // distance and a different lens, all changed between one frame and the
    // next. This is one continuous camera move from the pad to the pad: when
    // the beat changes, where the camera WAS is remembered and the new rig is
    // eased into over BLEND seconds, so the shot travels to the next setup
    // instead of cutting to it. Inside a beat the blend is over and the rig is
    // followed exactly, which is what keeps every scripted move intact.
    //
    // Yaw is blended the short way round: without that, a swing from just
    // under pi to just over it takes the camera the whole way round the
    // vehicle, which is a worse artefact than the cut it replaced.
    _rigSmooth(time, dt) {
      const rig = this._rig(time);
      const now = {
        tx: rig.target.x, ty: rig.target.y, tz: rig.target.z,
        yaw: rig.yaw, pitch: rig.pitch, dist: rig.dist, fov: rig.fov,
      };
      const key = (this.phase && this.phase.key) || "";
      if (this._rigKey !== key) {
        // The first beat of a flight has nothing to come from, so it starts
        // where it is meant to start rather than travelling in from nowhere.
        if (this._rigWas) { this._rigFrom = this._rigWas; this._rigBlend = 0; }
        this._rigKey = key;
      }
      if (this._rigFrom && this._rigBlend < 1) {
        this._rigBlend = clamp01(this._rigBlend + dt / RIG_BLEND);
        const u = smooth(this._rigBlend);
        const a = this._rigFrom;
        let dy = now.yaw - a.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        now.yaw = a.yaw + dy * u;
        now.pitch = lerp(a.pitch, now.pitch, u);
        now.fov = lerp(a.fov, now.fov, u);
        // Distance is eased geometrically: a camera going from thirty units to
        // two thousand has to cover that as a zoom out, not as a straight
        // line that spends most of the blend already far away.
        now.dist = a.dist * Math.pow(Math.max(1e-3, now.dist) / Math.max(1e-3, a.dist), u);
        now.tx = lerp(a.tx, now.tx, u);
        now.ty = lerp(a.ty, now.ty, u);
        now.tz = lerp(a.tz, now.tz, u);
        if (this._rigBlend >= 1) this._rigFrom = null;
      }
      this._rigWas = now;
      rig.target.set(now.tx, now.ty, now.tz);
      rig.yaw = now.yaw; rig.pitch = now.pitch; rig.dist = now.dist; rig.fov = now.fov;
      return rig;
    }

    _updateCamera(time, dt) {
      const rig = this._rigSmooth(time, dt || 0);
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
      // THE CLEAN BASIS. The same aim without the jitter, kept for anything in
      // the far scene that is hung at a bearing off the way the camera looks.
      // See _placeFar.
      const clean = this._cleanCam || (this._cleanCam = new THREE.Object3D());
      clean.position.set(look.x + cx, look.y + cy, look.z + cz);
      clean.up.set(0, 1, 0);
      clean.lookAt(look.x, look.y, look.z);
      if (clean.updateMatrixWorld) clean.updateMatrixWorld(true);
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
      // AND IT IS NOT ALLOWED TO GO PAST THE FAR PLANE. A crossing is flown at
      // two million kilometres and more, which puts the camera hundreds of
      // thousands of units off a planet the renderer stops drawing at twenty
      // thousand - so the Earth, the belt and the stars all blinked out
      // together somewhere out past the Moon and the window went black. Past
      // that range the SCENE is scaled down instead of the camera being pushed
      // further out: what the angular size on screen is made of is the RATIO
      // of the two, so a shrinking Earth at a fixed distance is the same
      // picture as a fixed Earth at a growing one - and this one is still
      // inside the plane.
      const shrink = d > FAR_CAM_MAX_D ? FAR_CAM_MAX_D / d : 1;
      const dCam = d * shrink;
      this.earthPivot.scale.setScalar(shrink);
      this.farCamera.fov = rig.fov;
      // Never further out than the height it is flying at: the planet cannot
      // be clipped by a plane that is always underneath the camera.
      const clear = Math.max(0, dCam - EARTH_VIS_R * shrink);
      this.farCamera.near = clamp(clear * 0.04, 0.01, 6);
      this.farCamera.updateProjectionMatrix();
      this.farCamera.quaternion.copy(this.camera.quaternion);
      this.farCamera.rotateX(-FAR_TILT * (this.orbitalK || 0));
      this.farCamera.position.set(0, dCam, 0);
      // And the shake-free copy of that same aim, which is what the far scene's
      // bodies are hung off.
      // The star cloud is a sphere nine thousand units across with the origin
      // at its centre, and the far camera climbs. Left where it was built, a
      // flight far enough out ended up OUTSIDE it, with the whole sky bunched
      // into a patch ahead. Stars are infinitely far away, so the cloud rides
      // with the camera and is a backdrop at every altitude.
      if (this.stars) this.stars.position.set(0, dCam, 0);
      this._farAim = this._farAim || new THREE.Object3D();
      this._farAim.quaternion.copy(clean.quaternion);
      this._farAim.rotateX(-FAR_TILT * (this.orbitalK || 0));
      this._farAim.position.copy(this.farCamera.position);
      this._updateMoon(dt, this.phase || phaseAt(time, this.profile));
      // The pad is at a latitude, so the planet hangs under the vehicle at an
      // angle rather than squarely below it.
      const geo = this.geoSite || this.site;
      const latTilt = (90 - geo.lat) * Math.PI / 180;
      this.earthPivot.rotation.z = -latTilt * 0.25;
      this.earthPivot.rotation.y = this._time * 0.004 + geo.lon * Math.PI / 180;
    }

    // ======================================================================
    // The frame
    // ======================================================================

    // Telemetry the HUD prints and the scene speaks. Pushed here because this
    // is where the flight actually happens.
    // opts.crew: this beat belongs to the people inside the vehicle rather
    // than to the room on the ground, so it is spoken by one of them, in
    // their own register, over their own name. See Radio.
    _say(key, params, opts) {
      if (!this._maySay(key)) return false;
      const crew = !!(opts && opts.crew);
      const text = crew ? Radio.fromCrew(key, params) : Radio.fromControl(key, params);
      // AND NEVER THE SAME WORDS TWICE RUNNING. Two calls far enough apart to
      // clear the gap above still read as a stuck tape when nothing was said
      // in between them, which is exactly what the belt does with its one
      // near-miss line. Said once, it waits for somebody to say anything else.
      if (this._lastText === text) return false;
      this._lastText = text;
      (this.log = this.log || []).push({
        text: text, at: this._time, key: key, who: Radio.lastWho,
      });
      if (this.log.length > 40) this.log.shift();
      return true;
    }

    // HOW OFTEN THE SAME THING MAY BE SAID.
    //
    // A traversal of the belt is a hit every few tenths of a second and a
    // quarter of them are heavy, and every heavy one used to put "Impact. Hull
    // 61." into the log - so the whole crossing read as one line repeated
    // twenty times while the near-miss call went in on top of it. Nothing the
    // ground says is worth saying twice inside a few seconds, and the two
    // lines the belt generates are worth saying least often of all: they are
    // reporting a thing the player is already watching happen.
    //
    // This is a floor under the REACTIVE lines only. The scripted cues are
    // written on a beat each and cannot repeat by construction.
    _maySay(key) {
      const gap = SAY_GAP[key] == null ? SAY_GAP_DEFAULT : SAY_GAP[key];
      const said = (this._saidAt = this._saidAt || {});
      const last = said[key];
      if (last != null && this._time - last < gap) return false;
      said[key] = this._time;
      return true;
    }

    update(dt, time) {
      this._time = time;
      const prof = this.profile;
      const ph = phaseAt(time, prof);
      this.phase = ph;
      this.alt = altitudeAt(time, prof);
      this.vspeed = verticalSpeedAt(time, prof);
      this.speed = speedAt(time, prof, this.trackM);
      this.downrange = downrangeAt(time, prof);
      this.integrity = integrityAtTime(time, this.severity || 1, prof, this.downrange);
      this.density = airDensity(this.alt);
      this.downrangeM = this.downrange * this.trackM;
      // The ground track compressed into something the near scene can hold:
      // the pad only has to slide out of frame, not travel eighteen hundred
      // real kilometres past the camera.
      this.downrangeZ = this.downrange * DOWNRANGE_VIS_M;

      this.shake = Math.max(0, this.shake - dt * 3.2);
      this.roll *= Math.pow(0.2, dt);
      this.impactFlash = Math.max(0, this.impactFlash - dt * 5);

      // One queued piece of scenery a frame, so the cost of the planet, the
      // belt and the ship is paid over the hold instead of before the scene
      // ever appears.
      this._drainDeferred();

      this._updateSun();
      this._updateSky(dt);
      this._updatePad(dt, ph);
      this._updateVehicle(dt, ph);
      this._updateBelt(dt, ph);
      this._updateLiminal(dt, ph);
      this._updateCrossing(dt, ph);
      this._updateMoonGround(dt, ph);
      this._updateTargetWorld(dt, ph);
      this._updateShip(dt, ph);
      this._updateMotes(dt);
      this._updateCamera(time, dt);

      if (this.shipModel) { try { this.shipModel.update(time); } catch (e) { /* the ship is cosmetic */ } }
      if (this.earthBody) {
        if (this.earthBody._body) this.earthBody._body.rotation.y = time * 0.02;
        if (this.earthBody._clouds) this.earthBody._clouds.rotation.y = time * 0.031;
      }
    }

    // THE MIDDLE STAGE, AND WHAT IT DOES TO THE PICTURE.
    //
    // Three numbers come out of here and everything else reads them:
    //   this.liminalK      how far the drive is up, 0 to 1
    //   this.lensAmount    how hard the lens bends the frame
    //   this.moonRangeM    how far the Moon is, in metres
    //
    // The sleeve is blown on the shroud beat, and nowhere else. It carried the
    // drive through the belt and it is the only thing aboard the belt never
    // got a plate off, which is the whole design: the hull arrives at two per
    // cent and the engine arrives untouched.
    _updateLiminal(dt, ph) {
      const prof = this.profile;
      if (!prof.liminal) { this.liminalK = 0; this.lensAmount = 0; return; }

      if (this.hasShroud && !this.shroudGone) {
        // Blown a beat into the shroud phase, with the belt behind the round -
        // and if the flight is somehow past that beat already (a skip), the
        // sleeve is not allowed to arrive at the Moon still on.
        if ((ph.key === "shroud" && ph.progress > 0.3) ||
          ph.key === "liminal" || ph.key === "transit" ||
          ph.key === "skim" || ph.key === "touchdown" || ph.key === "arrived") {
          this._dropShroud();
          this._say("shroudGone", null, { crew: true });
        }
      }

      // The drive comes up over the spool beat, holds through the crossing and
      // is throttled back over the last few hundred metres of the landing.
      let k = 0;
      if (ph.key === "liminal" || ph.key === "sbspool") k = smooth(ph.progress);
      // THE RUN OUT TO JUPITER IS FLOWN UNDER POWER, and it was the one leg of
      // a jump flight with nothing lit under it: the round left the belt behind
      // and then crossed seven hundred million kilometres on an engine that was
      // not burning. Jupiter does the work at the BOTTOM of the well, but
      // getting to the well is the drive - so it comes up over the first fifth
      // of the cruise and is throttled off over the last fifth of it, before the
      // round is handed to the planet.
      else if (ph.key === "cruise") {
        k = smooth(clamp01(ph.progress / 0.2)) *
          (1 - smooth(clamp01((ph.progress - 0.8) / 0.2)));
      }
      else if (LIMINAL_LIT.indexOf(ph.key) >= 0) k = 1;
      else if (ph.key === "skim") k = 1 - smooth(ph.progress) * 0.6;
      else if (ph.key === "touchdown") k = 0.4 * (1 - smooth(ph.progress));
      else if (ph.key === "flyby") k = 0.45;
      this.liminalK = k;
      // HOW MUCH OF THE DRIVE IS ACTUALLY BURNING, which is not the same as
      // how much of it is powered. See LIMINAL_FLAME.
      const fk = LIMINAL_FLAME.indexOf(ph.key) >= 0 ? k : 0;

      // THE STACK. A crossing to Zeta carries three drives and throws them
      // away one at a time, each at the end of the beat it was lit for - which
      // is why that round is twice the length of the one that goes to the Moon
      // and arrives as a bare bullet.
      if (prof.liminalStages > 1) this._shedStack(ph);

      // The lens is not the drive: it is what the drive does to the light, and
      // it only opens once the range is actually collapsing.
      this.lensAmount = LENS_BEATS.indexOf(ph.key) >= 0 ? smooth(clamp01(ph.progress / 0.25))
        : (ph.key === "liminal" || ph.key === "sbspool" ? smooth(ph.progress) * 0.55
          : (ph.key === "skim" ? (1 - smooth(ph.progress)) * 0.5 : 0));

      const flick = 0.82 + Math.sin(this._time * 41) * 0.12 + Math.sin(this._time * 17) * 0.06;
      if (this.liminalVanes) {
        this.liminalVanes.forEach((v, i) => {
          v.material.emissiveIntensity = k * (4.2 + Math.sin(this._time * 9 + i * 2.1) * 1.4);
        });
      }
      if (this.liminalCore) {
        this.liminalCore.material.opacity = k * flick * 0.95;
        this.liminalCore.scale.setScalar(1 + k * (0.7 + Math.sin(this._time * 6) * 0.18));
      }
      if (this.liminalHalo) {
        // THE RING IS PART OF THE FLAME AND NOT PART OF THE DRUM. Hung off the
        // drive's power instead, it stood round the vehicle on every beat the
        // drive was merely up - the descent included - so a round sitting on a
        // pad with nothing burning under it wore a blue hoop on the ground. It
        // is what the jet throws, so it is lit by the jet and by nothing else.
        this.liminalHalo.visible = fk > 0.01;
        this.liminalHalo.material.opacity = fk * 0.55 * flick;
        this.liminalHalo.scale.setScalar(1 + fk * 1.4);
        this.liminalHalo.rotation.z += dt * (0.6 + fk * 5.0);
      }
      if (this.liminalLight) this.liminalLight.intensity = fk * 4.6;
      if (this.liminalFlame) {
        // How much FLAME there is, which is the drive's own level everywhere
        // it is burning and nothing at all everywhere it is not. See
        // LIMINAL_FLAME: the jump and the landing are both lit by the glow
        // above and by neither of the jets below.
        this.liminalFlame.visible = fk > 0.01;
        const j = fk * flick;
        this.liminalJetCore.material.opacity = j * 0.98;
        this.liminalJetBody.material.opacity = j * 0.6;
        this.liminalJetHalo.material.opacity = j * 0.28;
        // It stretches as the drive comes up and stands almost still once it
        // is in: there is nothing for it to push against out here.
        this.liminalFlame.scale.set(1 + j * 0.25, 0.45 + fk * 1.25, 1 + j * 0.25);
      }
      // A drive that is bending the space round the round is felt through the
      // hull, and the shot says so.
      if (k > 0.05) this.shake = Math.max(this.shake, 0.25 + k * 0.9);
    }

    // Everything that belongs to one crossing and no other: Jupiter on the way
    // to Andromeda, the hole at the end of that, the corridor on the way to
    // Zeta, and the shell round the sun at the end of THAT.
    _updateCrossing(dt, ph) {
      const prof = this.profile;
      const k = ph.progress;

      // ---- JUPITER -------------------------------------------------------
      // Thrown at it, round the back of it, and out the far side faster. The
      // altitude column on those beats is the range to the planet, so the
      // size it is drawn at is simply that range - which is why it fills the
      // window at periapsis without anything having to be keyframed.
      if (prof.assist) {
        // EVERY BEAT THE PLANET IS THERE FOR, and it is not only the three the
        // gravity assist is written in. A jump flight drops its pellet AT
        // periapsis and rides the blast out past Pluto, and those beats had no
        // Jupiter in them at all: the planet grew into the window over the
        // approach and then blinked out at the exact second the charge went off
        // against it. It stays until the round is past Pluto and out of the
        // system.
        const near = ph.key === "cruise" || ph.key === "jupiter" || ph.key === "assist" ||
          ph.key === "charge" || ph.key === "blast" || ph.key === "pluto";
        if (near) this._ensure("jupiter");
        if (this.jupiter) {
          this.jupiter.visible = near;
          if (near) {
            // Eleven Earth radii across, at the range the column reads.
            //
            // EXCEPT ON THE CRUISE, where the column is still the height above
            // Earth and reads a few hundred kilometres - which, taken as a
            // range to Jupiter, put the camera nine units off a body six
            // hundred and seventy-two across. The planet was not missing on
            // that beat: the shot was INSIDE it, looking at the unlit back of
            // its own far wall. The cruise is flown at a distance of its own
            // and the range only takes over once the approach starts, and the
            // whole thing is clamped so the sphere can be neither entered nor
            // pushed past the far camera's 20000-unit plane.
            const dRaw = EARTH_VIS_R * 11.2 * (1 + this.alt / JUPITER_R_M);
            const d = ph.key === "cruise"
              ? lerp(JUPITER_FAR_D, JUPITER_NEAR_D, smooth(k))
              : clamp(dRaw, EARTH_VIS_R * 11.2 * 1.6, JUPITER_NEAR_D);
            // Off to the side it is being swung around, and swinging: on the
            // way in it is ahead, at periapsis it is hard over, on the way out
            // it is behind. That arc IS the assist.
            // AND THE ARC HAS TO STAY IN THE WINDOW. A bearing is measured
            // off the way the camera is LOOKING, and half a frame is about
            // 0.78 radians: the old arc swung the planet to 1.25 and then to
            // 2.7, which is behind the player's head, so Jupiter grew for a
            // few seconds on the cruise and was off the side of the frame for
            // every beat it was actually close on. It crosses the frame
            // instead, and only leaves it once the round is past and going
            // away - which is the one beat it is meant to be astern on.
            const swing = ph.key === "cruise" ? -0.30
              : ph.key === "jupiter" ? lerp(-0.30, -0.52, smooth(k))
                // The pellet is dropped with the planet hard over and holding:
                // the round is at the bottom of the well and going nowhere else
                // for five seconds.
                : ph.key === "charge" ? lerp(-0.52, -0.60, smooth(k))
                  : ph.key === "blast" ? lerp(-0.60, -1.5, smooth(k))
                    : ph.key === "pluto" ? lerp(-1.5, -2.6, smooth(k))
                      : lerp(-0.52, -2.2, smooth(k));
            const el = ph.key === "assist" || ph.key === "blast" ? -0.12 * smooth(k)
              : ph.key === "pluto" ? -0.12 : -0.05;
            this._placeFar(this.jupiter, swing, el, d);
            this.jupiterBody.rotation.y = this._time * 0.03;
          }
        }
      }

      // ---- THE CHARGES ---------------------------------------------------
      if (prof.jump) this._updateCharges(dt, ph);

      // ---- THE RED MOON --------------------------------------------------
      // The mass the charge is dropped against on the way out of Andromeda,
      // there being no Jupiter within two and a half million light years.
      // AND IT IS IN TITANIA'S SKY FROM THE PAD, not only at the assist.
      // Luna is no longer drawn over a world in another galaxy - see
      // _updateMoon - so a launch off the embassy climbed away under an empty
      // sky. The moon that world actually has is up there, and it is the same
      // one the charge is dropped against an hour later.
      if (prof.fromWorld === "titania" || this._homeId === "titania") {  // i18n-ignore  world id
        const nearRed = ph.key === "redmoon" || ph.key === "charge" || ph.key === "blast";
        const overhead = !nearRed && this._homeId === "titania" &&
          HOME_SKY.indexOf(ph.key) < 0;                                 // i18n-ignore  world id
        if (nearRed || overhead) this._ensure("redMoon");
        if (this.redMoon) {
          this.redMoon.visible = nearRed || overhead;
          if (overhead) {
            // Hung the way the Moon is hung over Earth: a fixed bearing off
            // the camera, so it is in shot at every yaw, and far enough out to
            // be a disc in a sky rather than a thing being flown at.
            this._placeFar(this.redMoon, MOON_BEARING * 0.8, 0.2, 3400);
            this.redMoonBody.rotation.y = this._time * 0.02;
          } else if (nearRed) {
            // Closed on, swung round the back of and left behind: the same arc
            // Jupiter is flown at the other end of the crossing.
            const rd = MOON_VIS_R * 1.4 * (1 + this.alt / (MOON_R_M * 0.6));
            // Kept inside the frame while it is close, for the reason the
            // swing at Jupiter is: a bearing past about 0.78 radians is off
            // the side of the window and a bearing past 1.6 is behind it.
            const swing = ph.key === "redmoon" ? lerp(-0.26, -0.55, smooth(k))
              : ph.key === "charge" ? -0.55 : lerp(-0.55, -2.2, smooth(k));
            this._placeFar(this.redMoon, swing, -0.08, clamp(rd, MOON_VIS_R * 4, 7000));
            this.redMoonBody.rotation.y = this._time * 0.04;
          }
        }
      }

      // ---- THE BREACH, AND THE GOLD --------------------------------------
      if (prof.jump) {
        const gold = ph.key === "gods"
          ? smooth(clamp01(k / 0.14)) * (1 - smooth(clamp01((k - 0.82) / 0.18)))
          : (ph.key === "breach" ? smooth(clamp01((k - 0.7) / 0.3)) * 0.45 : 0);
        if (gold > 0.001) this._ensure("gods");
        if (this.gods) {
          this.gods.visible = gold > 0.001;
          this.gods.material.opacity = gold;
          this.godsLight.visible = this.gods.visible;
          this.godsLight.intensity = gold * 4.5;
        }
        // Going through something faster than it can be gone through is felt
        // the whole way, and hardest just before it gives.
        if (ph.key === "breach") this.shake = Math.max(this.shake, 0.4 + smooth(k) * 2.2);
        // The gold is the quietest place in the plugin. Nothing shakes in it.
      }

      // ---- THE TWO GALAXIES ----------------------------------------------
      if (prof.jump) this._updateGalaxies(dt, ph);

      // ---- THE CORRIDOR --------------------------------------------------
      if (prof.hyper) this._updateCorridor(dt, ph);

      // ---- THE SHELL -----------------------------------------------------
      if (prof.world === "zeta") {
        // ALONGSIDE IT, not past it. The corridor puts the round out where the
        // mass is, so the shell is the whole window on arrival, it is still
        // most of it while the tanks fill, and it only falls away behind once
        // the round burns across the system to the planet.
        const near = ph.key === "emerge" || ph.key === "refuel" || ph.key === "transfer";
        const out = near || ph.key === "flyby" || ph.key === "skim";
        if (out) this._ensure("dyson");
        if (this.dysonGroup) {
          this.dysonGroup.visible = out;
          if (out) {
            // How far off it is: arriving it is right there, and the transfer
            // burn is what puts a system between the round and it.
            const d = ph.key === "emerge" ? lerp(9000, 900, smooth(ph.progress))
              : ph.key === "refuel" ? 900
                : ph.key === "transfer" ? lerp(900, 7000, smooth(ph.progress))
                  : 7600;
            // And it swings from dead ahead, where the corridor pointed, round
            // to one side as the round turns off it onto the planet.
            const az = ph.key === "emerge" ? lerp(0, -0.18, smooth(ph.progress))
              : ph.key === "refuel" ? -0.18
                : ph.key === "transfer" ? lerp(-0.18, -0.72, smooth(ph.progress))
                  : -0.72;
            this._placeFar(this.dysonGroup, az, 0.14, d);
            // The shell turns itself, and runs its own collection wave across
            // the panels: animate() is the method it publishes and the only
            // thing that should be touching its transform.
            if (this.dyson && typeof this.dyson.animate === "function") {
              try { this.dyson.animate(this._time); } catch (e) { /* cosmetic */ }
            }
            // The tanks fill off the shell, and the drive is shut down to do
            // it: a thing that bends space is not something to run alongside
            // somebody's star.
            if (ph.key === "refuel") this.shake = Math.max(this.shake, 0.12);
          }
        }
      }
    }

    // THE STRING OF CHARGES, dropped and then gone off one after another.
    //
    // The pellets go out on the charge beat, one every few tenths of a second,
    // and each one sits there being undecided. On the blast beat they resolve
    // in the same order they were dropped, each ring opening to its own radius
    // over RING_LIFE seconds - so what the round rides is a staircase of five
    // shoves rather than one, which is what the beat's altitude curve is doing
    // underneath.
    _updateCharges(dt, ph) {
      const dropping = ph.key === "charge";
      const going = ph.key === "blast";
      const on = dropping || going;
      if (on) this._ensure("charges");
      const g = this.charges;
      if (!g) return;
      g.visible = on;
      if (!on) {
        if (this.chargeLight) this.chargeLight.visible = false;
        this._chargeT = 0;
        return;
      }
      this._chargeT = (this._chargeT || 0) + dt;

      let lit = 0;
      this.pellets.forEach((p, i) => {
        // One every fifth of the drop, so they leave as a string.
        const out = clamp01((ph.progress - i / (CHARGE_COUNT * 1.25)) * 6);
        if (dropping) {
          p.visible = out > 0.01;
          p.material.opacity = out;
          // Dropped out of the tail and left behind, so the string trails.
          p.position.set(
            (this.rng() - 0.5) * 0.4,
            -14 - i * 2.0,
            -out * (40 + i * 26)
          );
          p.scale.setScalar(1 + Math.sin(this._time * 9 + i) * 0.14);
        } else {
          p.visible = false;
        }
      });

      this.blastRings.forEach((r, i) => {
        const core = r.userData.core;
        const ball = r.userData.ball, heart = r.userData.heart;
        if (!going) {
          r.visible = false; core.visible = false;
          if (ball) ball.visible = false;
          if (heart) heart.visible = false;
          return;
        }
        // Each one resolves a step behind the last. The stagger spans most of
        // the beat, so the final ring is still opening as it ends.
        const start = (i / CHARGE_COUNT) * 0.62;
        const u = clamp01((ph.progress - start) / (RING_LIFE / 6));
        const show = u > 0.001 && u < 1;
        r.visible = show; core.visible = show;
        if (ball) ball.visible = show;
        if (heart) heart.visible = show;
        if (!show) return;
        lit++;
        // Out from where the pellet was, to its own radius, thinning as it
        // goes: a ring of light with nothing inside it.
        const rad = r.userData.radius * u;
        const z = -(40 + i * 26);
        r.position.set(0, -14 - i * 2.0, z);
        core.position.copy(r.position);
        r.scale.setScalar(rad);
        core.scale.setScalar(rad * 0.94);
        // Edge-on to the round, so it is a ring rather than a disc.
        r.rotation.set(0, 0, this._time * 0.4 + i);
        core.rotation.copy(r.rotation);
        const fade = Math.sin(clamp01(u) * Math.PI);
        r.material.opacity = fade * 0.85;
        core.material.opacity = fade * 0.5;
        // The shell goes out with the ring and thins as it goes, because what
        // is expanding is the same amount of having happened over a larger and
        // larger surface. The heart of it stays small and stays white.
        if (ball) {
          ball.position.copy(r.position);
          ball.scale.setScalar(rad * 0.78);
          ball.material.opacity = fade * (1 - u * 0.55) * 0.5;
        }
        if (heart) {
          heart.position.copy(r.position);
          heart.scale.setScalar(rad * (0.10 + u * 0.18));
          heart.material.opacity = fade * 0.9;
        }
        // And the round is shoved by each one as it passes.
        this.shake = Math.max(this.shake, 2.2 * Math.pow(fade, 3));
        this.impactFlash = Math.max(this.impactFlash, 0.5 * Math.pow(fade, 6));
      });

      if (this.chargeLight) {
        this.chargeLight.visible = true;
        this.chargeLight.intensity = dropping ? 0.5 : 1.2 + lit * 1.6;
        this.chargeLight.position.set(0, -16, -60);
      }
      if (dropping) this.shake = Math.max(this.shake, 0.25);
    }


    // The room the shaft becomes in hexspace. Built with the corridor, because
    // it IS the corridor for a third of its length.
    _buildLodge() {
      const g = new THREE.Group();
      this.lodge = g;
      g.visible = false;
      this.corridor.add(g);

      const HW = CORRIDOR_HW;
      const velvet = this._tex(128, 256, (ctx, w, h) => {
        // Curtain. Vertical folds, dark in the pleats and lit on the swell,
        // which is the whole of what makes cloth read as cloth.
        const r = makeRng(0x5ed10c);
        for (let x = 0; x < w; x++) {
          const fold = Math.sin(x * 0.34) * 0.5 + 0.5;
          const deep = Math.pow(fold, 1.6);
          const v = 26 + deep * 112;
          ctx.fillStyle = "rgb(" + Math.round(v) + "," + Math.round(v * 0.10) + "," + Math.round(v * 0.13) + ")";
          ctx.fillRect(x, 0, 1, h);
        }
        // The weave, and the odd thread catching the light.
        for (let i = 0; i < 2400; i++) {
          const x = Math.floor(r() * w), y = Math.floor(r() * h);
          ctx.fillStyle = r() > 0.5 ? "rgba(190,40,50,0.10)" : "rgba(20,0,4,0.16)";
          ctx.fillRect(x, y, 1, 1);
        }
        // And the hem, pooling at the bottom the way a heavy curtain does.
        const grd = ctx.createLinearGradient(0, h * 0.82, 0, h);
        grd.addColorStop(0, "rgba(0,0,0,0)");
        grd.addColorStop(1, "rgba(0,0,0,0.65)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, h * 0.82, w, h * 0.18);
      }, 6, 1);

      // THE CHEVRON. Not painted flat: the floor of that room is laid, and the
      // zigzag has to run the length of the shaft rather than tile as squares.
      const chevron = this._tex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = "#f2efe6";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#0b0b0d";
        const band = h / 4;
        for (let b = 0; b < 4; b++) {
          const y = b * band;
          ctx.beginPath();
          for (let i = 0; i <= 4; i++) {
            const x = (i / 4) * w;
            ctx.lineTo(x, y + (i % 2 ? band * 0.55 : 0));
          }
          for (let i = 4; i >= 0; i--) {
            const x = (i / 4) * w;
            ctx.lineTo(x, y + (i % 2 ? band : band * 0.45));
          }
          ctx.closePath();
          ctx.fill();
        }
      }, 1, 14);

      const wallMat = this._mat(new THREE.MeshBasicMaterial({
        map: velvet, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      }));
      this.lodgeWallMat = wallMat;
      [-1, 1].forEach((s) => {
        const m = new THREE.Mesh(this._geo(new THREE.PlaneGeometry(CORRIDOR_LEN, HW * 2.3)), wallMat);
        m.position.set(s * HW * 1.05, 0, CORRIDOR_LEN / 2);
        m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(m);
      });
      // A ceiling of the same cloth, low, so it is a room and not an alley.
      const roof = new THREE.Mesh(this._geo(new THREE.PlaneGeometry(HW * 2.3, CORRIDOR_LEN)), wallMat);
      roof.position.set(0, HW * 1.15, CORRIDOR_LEN / 2);
      roof.rotation.x = Math.PI / 2;
      g.add(roof);

      this.lodgeFloorMat = this._mat(new THREE.MeshBasicMaterial({
        map: chevron, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      }));
      const floor = new THREE.Mesh(
        this._geo(new THREE.PlaneGeometry(HW * 2.3, CORRIDOR_LEN)), this.lodgeFloorMat);
      floor.position.set(0, -HW * 1.1, CORRIDOR_LEN / 2);
      floor.rotation.x = -Math.PI / 2;
      g.add(floor);
      this.lodgeFloor = floor;

      // WHAT IS STANDING IN IT. Four cards, reused: the point is that there is
      // rarely more than one at a time and never a crowd.
      this.guests = [];
      const faces = (() => {
        try {
          const DS = window.DreamSystem;
          return (DS && typeof DS.faces === "function") ? DS.faces() : [];
        } catch (e) { return []; }
      })();
      if (faces.length) {
        const geo = this._geo(new THREE.PlaneGeometry(1, 1));
        for (let i = 0; i < 4; i++) {
          const mat = this._mat(new THREE.MeshBasicMaterial({
            transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
          }));
          const m = new THREE.Mesh(geo, mat);
          m.visible = false;
          m.userData.faces = faces;
          m.userData.next = 2 + i * 6 + this.rng() * 9;
          g.add(m);
          this.guests.push(m);
        }
      }

      // AND THE THING THAT GOES PAST. A world, at the wrong scale and the wrong
      // speed, crossing the room as if the room were not there.
      this.rogue = new THREE.Mesh(
        this._geo(new THREE.SphereGeometry(1, 24, 18)),
        this._phong({ map: this._paintRogue(), shininess: 2 })
      );
      this.rogue.visible = false;
      g.add(this.rogue);
      this.rogueLight = new THREE.PointLight(0xffd0b0, 0, 4000, 2);
      this.rogueLight.visible = false;
      g.add(this.rogueLight);
      this._rogueAt = 4 + this.rng() * 7;
    }

    _paintRogue() {
      return this._tex(128, 64, (ctx, w, h) => {
        const r = makeRng(0xb10c4);
        ctx.fillStyle = "#6a4432";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
          const y = r() * h;
          ctx.fillStyle = r() > 0.5 ? "rgba(214,164,120,0.5)" : "rgba(42,24,16,0.5)";
          ctx.fillRect(0, y, w, 1 + r() * 4);
        }
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = "rgba(30,16,10,0.4)";
          ctx.beginPath();
          ctx.arc(r() * w, r() * h, 1 + r() * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // The room, every frame of the beat it exists in.
    _updateLodge(dt, ph, st) {
      const g = this.lodge;
      if (!g) return;
      // It is hexspace and nothing else: the slit scan before it and the white
      // after it are both somewhere else entirely.
      const inLodge = ph.key === "hexspace";
      g.visible = inLodge;
      if (!inLodge) {
        this.guests.forEach((m) => { m.visible = false; });
        if (this.rogue) this.rogue.visible = false;
        if (this.rogueLight) this.rogueLight.visible = false;
        this._lodgeT = 0;
        return;
      }
      this._lodgeT = (this._lodgeT || 0) + dt;
      const T = this._lodgeT;
      // In over the first seconds and out at the end, so the shaft becomes the
      // room and the room becomes the white without either of them cutting.
      const k = smooth(clamp01(ph.progress / 0.18)) * (1 - smooth(clamp01((ph.progress - 0.82) / 0.18)));

      // The curtain. It moves, and it is not the round moving it.
      this.lodgeWallMat.opacity = k * 0.95;
      if (this.lodgeWallMat.map) {
        this.lodgeWallMat.map.offset.x = Math.sin(T * 0.21) * 0.03 + T * 0.004;
        this.lodgeWallMat.map.needsUpdate = true;
      }

      // THE FLOOR COMES AND GOES. A slow beat with a fast flicker in it, so it
      // is there, then not, then there again before the eye is sure.
      const slow = Math.sin(T * 0.62) * 0.5 + 0.5;
      const flick = (Math.sin(T * 11.3) * 0.5 + 0.5) > 0.82 ? 0.35 : 1;
      const floorK = k * smooth(clamp01((slow - 0.35) / 0.3)) * flick;
      this.lodgeFloorMat.opacity = floorK * 0.9;
      this.lodgeFloor.visible = floorK > 0.02;
      if (this.lodgeFloorMat.map) {
        this.lodgeFloorMat.map.offset.y = -T * 0.55;
        this.lodgeFloorMat.map.needsUpdate = true;
      }

      // THE GUESTS, and they are rare. Each card waits out its own timer,
      // stands somewhere down the room for a second or two, and goes.
      this.guests.forEach((m) => {
        if (m.userData.until != null) {
          const left = m.userData.until - T;
          if (left <= 0) {
            m.visible = false;
            m.userData.until = null;
            // A long wait before that card is used again: one at a time, and
            // not often, is the entire point.
            m.userData.next = T + 7 + this.rng() * 14;
            return;
          }
          // It does not approach. It is simply nearer than it was.
          m.position.z -= dt * 120;
          m.material.opacity = k * 0.9 * smooth(clamp01(Math.min(left, 0.6) / 0.6));
          m.lookAt(this.camera.position);
          return;
        }
        if (T < m.userData.next) return;
        const faces = m.userData.faces;
        const file = faces[Math.floor(this.rng() * faces.length)];
        let tex = null;
        try {
          const DS = window.DreamSystem;
          tex = DS && DS.faceTexture ? DS.faceTexture(file) : null;
        } catch (e) { tex = null; }
        if (!tex) { m.userData.next = T + 9; return; }
        m.material.map = tex;
        m.material.needsUpdate = true;
        const h = 14 + this.rng() * 26;
        m.scale.set(h, h, 1);
        m.position.set(
          (this.rng() - 0.5) * CORRIDOR_HW * 1.5,
          -CORRIDOR_HW * 0.55 + this.rng() * CORRIDOR_HW * 0.9,
          CORRIDOR_LEN * (0.35 + this.rng() * 0.4)
        );
        m.visible = true;
        m.userData.until = T + 1.4 + this.rng() * 2.2;
      });

      // AND THE WORLD THAT GOES PAST. Once, if at all, and far too fast for
      // anything that size.
      if (this.rogue) {
        if (this._rogueAt != null && T >= this._rogueAt && this._rogueGoing == null) {
          this._rogueGoing = 0;
          this._rogueAt = null;
          const s = 260 + this.rng() * 420;
          this.rogue.scale.setScalar(s);
          this.rogue.userData.side = this.rng() < 0.5 ? 1 : -1;
          this.rogue.userData.y = (this.rng() - 0.5) * 240;
        }
        if (this._rogueGoing != null) {
          this._rogueGoing += dt / 2.6;
          const u = this._rogueGoing;
          if (u >= 1) {
            this.rogue.visible = false;
            this.rogueLight.visible = false;
            this._rogueGoing = null;
          } else {
            const side = this.rogue.userData.side;
            this.rogue.visible = true;
            this.rogueLight.visible = true;
            this.rogue.position.set(
              side * lerp(1400, -1400, u),
              this.rogue.userData.y,
              CORRIDOR_LEN * 0.55
            );
            this.rogue.rotation.y += dt * 0.35;
            this.rogueLight.position.copy(this.rogue.position);
            this.rogueLight.intensity = 2.4 * Math.sin(u * Math.PI);
            // Something that big passing that close is felt.
            this.shake = Math.max(this.shake, 1.6 * Math.sin(u * Math.PI));
          }
        }
      }
    }

    // THE CORRIDOR, three readings of one shaft, crossfaded exactly the way
    // the ship's window crossfades them - GalaxySim.HyperWarp.stages is the
    // same function both of them ask, so the two never disagree about what
    // 40x looks like.
    _updateCorridor(dt, ph) {
      const inIt = ph.key === "solomon" || ph.key === "hexspace" || ph.key === "thewhite";
      if (inIt) this._ensure("corridor");
      const g = this.corridor;
      if (!g) return;
      g.visible = inIt;
      this.corridorK = 0;
      if (!inIt || !this.slabs || !this.corridorGround) {
        if (this.solidMat) this.solidMat.opacity = 0;
        return;
      }

      // Where this beat sits on the ship window's own 0-to-100 slider, so the
      // three readings arrive in the same order and at the same strengths.
      const span = ph.key === "solomon" ? [12, 42]
        : ph.key === "hexspace" ? [42, 76] : [76, 100];
      const speed = lerp(span[0], span[1], ph.progress);
      const HW = window.GalaxySim && window.GalaxySim.HyperWarp;
      // st.witch is GalaxySim HyperWarp's own field name for the middle
      // reading; what this plugin calls that reading is hexspace.
      let st = { t: 0, witch: 0, mono: 0 };
      try { if (HW && HW.stages) st = HW.stages(speed); } catch (e) { /* the defaults are the gate */ }
      this.corridorK = st.t;

      // The slabs. Each one is a band of the shaft at its own depth, sliding
      // toward the camera and recycled to the far end - which is a slit scan
      // done with geometry rather than with a camera and a slot.
      const RUSH = 620;
      this._slabScroll = ((this._slabScroll || 0) + dt * RUSH) % (CORRIDOR_LEN / 76);
      const step = CORRIDOR_LEN / 76;
      const mono = st.mono;
      this.slabs.forEach((m) => {
        const i = m.userData.slot;
        // Ahead of the round and rushing back past it.
        const z = CORRIDOR_LEN - ((i * step + this._slabScroll) % CORRIDOR_LEN);
        m.position.z = z;
        // Every band its own saturated hue, the palette rotating as one - and
        // draining, as the corridor goes cold, toward the one blue of
        // hexspace and then to pure black on pure white.
        const hue = (i * 31 + this._time * 26) % 360;
        const sat = lerp(0.85, 0.25, st.witch) * (1 - mono);
        const lig = lerp(0.55, 0.42, st.witch);
        const c = m.material.color;
        c.setHSL(((hue / 360) % 1 + 1) % 1, sat, lig);
        // At the far end of it there is no colour anywhere: everything drawn
        // is black and the ground it is drawn on is white.
        if (mono > 0) c.lerp(BLACK_COL, mono);
        const near = 1 - clamp01(z / CORRIDOR_LEN);
        // THE SLABS GET OUT OF THE ROOM'S WAY. In hexspace the shaft is not a
        // shaft any more, it is a room with cloth on the walls, and a slit scan
        // running through the curtains would ruin both.
        const lodge = ph.key === "hexspace" ? smooth(clamp01(ph.progress / 0.18)) : 0;
        m.material.opacity = m.userData.key * (0.25 + 0.75 * near) * (1 - mono * 0.15) * (1 - lodge * 0.92);
      });

      // The ground floods from the corridor's own dark to pure white.
      this.corridorGround.material.color.setRGB(mono, mono, mono);

      // The solids. They turn in their own planes as they drift out of the
      // vanishing point and pass the hull, and they only exist in the white.
      const show = mono > 0.02;
      if (this.solidMat) this.solidMat.opacity = mono;
      const HWp = HW && HW.project4;
      this.solids.forEach((line, n) => {
        line.visible = show;
        if (!show || !HWp) return;
        const poly = line.userData.poly;
        const t2 = this._time * 0.55 + line.userData.phase;
        // Down the corridor and past the camera, each on its own cycle.
        const cyc = ((this._time * 0.22 + n * 0.27) % 1);
        line.position.set(
          Math.sin(t2 * 0.7) * 26,
          Math.cos(t2 * 0.5) * 18,
          CORRIDOR_LEN * 0.9 - cyc * CORRIDOR_LEN
        );
        const S = 9;
        const attr = line.geometry.attributes.position;
        const arr = attr.array;
        const out = this._p4 || (this._p4 = [0, 0, 0]);
        let w = 0;
        for (let e = 0; e < poly.edges.length; e++) {
          const ed = poly.edges[e];
          for (let side = 0; side < 2; side++) {
            HWp(poly.verts[ed[side]], t2, t2 * 0.73, t2 * 0.41, out);
            arr[w++] = out[0] * S;
            arr[w++] = out[1] * S;
            arr[w++] = out[2] * S;
          }
        }
        attr.needsUpdate = true;
      });

      // The room, on the beat it is a room.
      this._updateLodge(dt, ph, st);

      // Being in here is not comfortable and the hull says so.
      this.shake = Math.max(this.shake, 0.2 + st.witch * 0.9);
    }

    // 0 while the round is still climbing away from the planet it left, 1 once
    // it is somewhere the planet is not worth drawing from. Only a crossing
    // ever returns anything but 0: every other flight in the plugin ends in
    // the same gravity well it started in.
    _earthLeftBehind() {
      const prof = this.profile;
      if (!prof.lunar) return 0;
      const ph = this.phase;
      if (!ph) return 0;
      // The beats before the drive lights are still a climb.
      const HOME = ["hold", "countdown", "coil", "coast", "ignition", "burn",   // i18n-ignore  phase keys
        "kessler", "clear", "shroud", "drift"];
      if (HOME.indexOf(ph.key) >= 0) return 0;
      // The beat the drive comes up on is where it starts pulling away.
      if (ph.key === "liminal" || ph.key === "cruise") return smooth(ph.progress);
      // And after that it is simply not there.
      return 1;
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
      const elev = e.dayK * (Math.PI / 2) * (1 - Math.abs((this.geoSite || this.site).lat) / 140);
      const ch = Math.cos(elev);
      const hi = ramp(this.alt, 40000, 140000);
      const dir = this.sun;
      dir.position.set(Math.cos(az) * ch * 1000, Math.sin(elev) * 1000, Math.sin(az) * ch * 1000);
      const warm = e.golden ? 0xffb066 : e.night ? 0x2a3a66 : 0xfff0dc;
      dir.color.setHex(warm).lerp(new THREE.Color(0xffffff), hi);
      dir.intensity = lerp(e.night ? 0.12 : (e.storm ? 0.45 : e.wet ? 0.6 : 1.0), 1.5, hi);
      this.ambient.intensity = lerp(e.night ? 0.16 : 0.5, 0.06, hi);
      this.ambient.color.setHex(e.night ? 0x243354 : 0x6f86a8);

      // THE PLANET HAS TO BE VISIBLE. Keyed purely from the hour, the
      // hemisphere under the vehicle is in shadow for half of every day and
      // the shot is a black ball with a rim on it. So the far key is pulled
      // round toward the camera - which hangs directly over the pad, straight
      // up the +Y axis - and only leant toward the real sun, which keeps the
      // terminator and the modelling without ever losing the surface.
      const sx = dir.position.x, sy = dir.position.y, sz = dir.position.z;
      const len = Math.max(1, Math.sqrt(sx * sx + sy * sy + sz * sz));
      this.farSun.position.set(sx / len * 420, sy / len * 420 + 1000, sz / len * 420);
      this.farSun.intensity = 2.1;
      this.farAmbient.intensity = 0.55;
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
      const starK = smooth(ramp(this.alt, 28000, 120000));
      if (starK > 0.001) this._ensure("stars");
      if (this.starMat) this.starMat.opacity = starK;

      // The Earth from outside: the limb lights up as the vehicle gets far
      // enough for the atmosphere to be a visible shell rather than the room
      // it is standing in.
      // Low enough that the hop sees a curved Earth under its own flip at 180
      // km, not just the orbital flight on its way to the belt.
      const orbital = smooth(ramp(this.alt, 40000, 160000));
      this.orbitalK = orbital;
      this.limb.material.opacity = orbital * 0.42;
      if (orbital > 0.005 && !this.earthLost) { this._ensure("earthBody"); this._ensure("farBelt"); }
      if (this.farBelt) {
        // It turns on its own, faster than the planet, and it thickens as the
        // vehicle rises toward the plane of it.
        this.farBelt.rotation.y += 0.0016;
        if (this.farBelt.material) {
          this.farBelt.material.opacity = 0.25 + 0.55 * smooth(ramp(this.alt, 120000, KESSLER_IN_M));
        }
      }
      // HOW FAR THE PLANET HAS BEEN LEFT BEHIND. On a climb this is nothing:
      // the altimeter IS the height over it and the far camera is already
      // placed at that distance. On a crossing the altitude column stops being
      // a height over Earth at the moment the drive lights, so from that beat
      // the planet is shrunk out of the frame and then dropped.
      const gone = this._earthLeftBehind();
      if (this.earthPivot) {
        this.earthPivot.visible = !this.earthLost && orbital > 0.005 && gone < 0.999;
        this.earthPivot.scale.setScalar(Math.max(0.0001, 1 - gone));
      }
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
      const lightsWanted = nightK * orbital * 0.95;
      if (lightsWanted > 0.01) this._ensure("cityLights");
      if (this.cityLights) {
        this.cityLights.material.opacity = lightsWanted;
        this.cityLights.visible = lightsWanted > 0.01;
      }
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



    _updateVehicle(dt, ph) {
      const alt = this.alt;
      this._updateNavLights(dt);

      // The nose heats where the air and the speed overlap and nowhere else,
      // so it lights on the way up through max-Q and goes out above it.
      // Going up, the nose is what meets the air. Coming down on a hop it is
      // the motor end, and the retro plume is what stands between the vehicle
      // and the airflow - so the nose only heats on the way up.
      //
      // COMING DOWN FROM ORBIT is the other thing entirely, and it is the one
      // beat of the descent everybody remembers: the round arrives with the
      // whole speed of an orbit still on it, the shock stands off the nose
      // from ninety kilometres, and it comes down the sky as a light. The glow
      // starts high, holds through the worst of it and only dies when the air
      // has taken the speed out, somewhere under twenty kilometres.
      const climbing = this.vspeed >= 0;
      const air = climbing
        ? smooth(ramp(alt, 5000, 16000)) * (1 - smooth(ramp(alt, 24000, 46000)))
        : 0;
      const entry = this.descent
        ? smooth(ramp(-alt, -95000, -62000)) * (1 - smooth(ramp(-alt, -26000, -11000)))
        : 0;
      this.reentryHeat = entry;
      const heat = Math.max(air, entry);
      this.noseGlow.material.opacity = heat * 0.85;
      this.noseGlow.scale.setScalar(1 + heat * 1.6);
      this.nose.material.emissive.setRGB(heat * 0.55, heat * 0.18, 0);

      if (this.plasma) {
        this.plasma.visible = entry > 0.01;
        const flickr = 0.88 + Math.sin(this._time * 27) * 0.08 + Math.sin(this._time * 53) * 0.04;
        const e = entry * flickr;
        this.plasmaCap.material.opacity = e * 0.85;
        this.plasmaCap.scale.set(1 + e * 0.25, 0.7 + e * 0.5, 1 + e * 0.25);
        this.plasmaTrail.material.opacity = e * 0.42;
        this.plasmaTrail.scale.set(1, 0.5 + e, 1);
        this.plasmaLight.intensity = e * 4.2;
        // The buffeting that goes with it.
        if (entry > 0.25) this.shake = Math.max(this.shake, 0.35 + entry * 0.8);
      }

      // The motor.
      //
      // On the orbital flight it lights once, high and thin, and stays lit to
      // the top of the belt. On the hop it does not light on the way UP at
      // all: the rail did that. It lights after the flip, pointing forward,
      // and everything it burns is spent killing the speed the gun gave it.
      // The capture is deliberately absent from the hop's list: by then the
      // tanks are dry and the receiving coil is doing the braking, which is
      // the whole reason the hop is two stages and not three.
      // A DESCENT DOES NOT BOOST. The one burn it makes is the retrograde one
      // that drops it out of orbit in the first place; after that it is
      // falling, and everything that slows it down is air, fabric and the
      // receiving coil.
      // A DESCENT DOES NOT BURN AT ALL: it was thrown at the planet and it
      // falls the whole way. The only things that slow it are the air, the
      // canopy and the coil waiting at the bottom.
      const LIT = this.descent
        ? {}
        : this.profile.downrange
          ? { prograde: 1, terminal: 1 }
          : { ignition: 1, burn: 1, kessler: 1, clear: 1 };
      const starting = this.descent ? null                                    // nothing lights on the way down
        : this.profile.downrange ? "prograde" : "ignition";                   // i18n-ignore  phase keys
      let ramping = LIT[ph.key] ? 1 : 0;
      if (ph.key === starting) ramping = smooth(clamp01(ph.progress / 0.25));
      if (ph.key === "terminal") ramping *= 0.5 + 0.5 * (1 - ph.progress);
      // Nothing burns out of a stage that is not there any more.
      if (this.hasBooster && this.boosterGone) ramping = 0;
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

      // STAGING. The tanks are dry as the belt is cleared, and a dry stage is
      // dead weight: it goes at the top of the coast to the ship, unless the
      // belt has already opened it, in which case it went there.
      if (this.hasBooster && !this.boosterGone && (ph.key === "clear" || ph.index > 7)) {
        this._separateBooster(false);
      }

      // THE CANOPY, on the way down. Out on the shoulder of the terminal beat
      // and cut away the moment the muzzle has the round.
      if (this.chute) {
        const out = ph.key === "terminal" ? smooth(ramp(ph.progress, 0.18, 0.42)) : 0;
        const open = ph.key === "terminal" ? out * (1 - smooth(ramp(ph.progress, 0.9, 1))) : 0;
        this.chute.visible = open > 0.01;
        if (this.chute.visible) {
          // It snatches open, then breathes.
          const breath = 1 + Math.sin(this._time * 3.4) * 0.05 * open;
          this.chute.scale.setScalar(clamp(open * breath, 0.05, 1.2));
          this.chute.rotation.z = Math.sin(this._time * 1.1) * 0.06;
          this.chute.rotation.x = Math.cos(this._time * 0.9) * 0.05;
          if (!this._chuteOut) {
            this._chuteOut = true;
            this._say("chute", null, { crew: true });
            this._pendingSe = this._pendingSe || [];
            this._pendingSe.push({ name: SE.tear, volume: 60, pitch: 120 });
          }
        } else if (this._chuteOut && !this._chuteCut && ph.key !== "terminal") {
          this._chuteCut = true;
        }
      }

      // THE FLIP. Five seconds at the top of the arc, end over end, with
      // nothing burning: after it the motor is pointed at the destination and
      // the armour that led the way up is the armour that takes the reentry.
      if (this.profile.downrange) {
        if (ph.key === "apogee") this.flip = Math.PI * smooth(ph.progress);
        else if (ph.index > 4) this.flip = Math.PI;
        else this.flip = 0;
      } else if (TRACK_BEATS.indexOf(ph.key) >= 0) {
        // Nose along the track. The scene's forward axis is +Z - the camera
        // sits behind the round at yaw PI and looks up it - so turning the
        // vehicle a quarter turn about X puts its +Y nose on that axis and
        // its tail, its drive and its flame behind it where they belong.
        this.flip = Math.PI / 2;
      } else if (this.descent) {
        // Nose down the whole way. It is loaded into the ship's gun pointing
        // at the planet and it never turns over: the nose takes the air, the
        // bell faces the sky, and the retro burn pushes against the fall.
        this.flip = Math.PI;
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
      // A round under a liminal drive does not tumble: from the moment the
      // sleeve is off and the nose is on the Moon it is held dead steady,
      // because the drive can only take a distance out along one axis and
      // that axis has to be the one the Moon is on.
      const aimed = this.profile.liminal && (ph.key === "shroud" || ph.key === "liminal" ||
        ph.key === "skim" || ph.key === "touchdown" || TRACK_BEATS.indexOf(ph.key) >= 0);
      const settling = ph.key === "capture" || ph.key === "arrived" || aimed;
      this.vehicle.rotation.y += settling ? 0 : dt * (0.25 + bare * 2.2);
      const loose = (ph.key === "coast" || ph.key === "ascent" || ph.key === "kessler" || ph.key === "reentry");
      const wobZ = loose ? Math.sin(this._time * 1.7) * 0.03 * (1 + bare * 4) : 0;
      const wobX = loose ? Math.cos(this._time * 1.3) * 0.025 * (1 + bare * 4) : 0;
      this.vehicle.rotation.z = settling ? 0 : wobZ;
      this.vehicle.rotation.x = (this.flip || 0) + (settling ? 0 : wobX);
    }

    // Staging, either way it happens. The stage is reparented to the world,
    // pushed off the tail and left to tumble away behind - and if the belt was
    // what opened it, it goes in pieces and takes the burn with it. Neither
    // one changes where the round ends up: the flight table is the flight, and
    // by the time anything can reach the stage, the stage has already done its
    // job. The player watches it go and arrives regardless.
    _separateBooster(exploded) {
      const b = this.booster;
      if (!b || this.boosterGone) return;
      this.boosterGone = true;
      this.vehicle.remove(b);
      this.near.add(b);
      b.position.y = -14;
      b.userData.vel = new THREE.Vector3(
        (this.rng() - 0.5) * (exploded ? 26 : 3),
        -(exploded ? 30 : 16) - this.rng() * 8,
        (this.rng() - 0.5) * (exploded ? 26 : 3)
      );
      b.userData.spin = new THREE.Vector3(
        (this.rng() - 0.5) * (exploded ? 7 : 1.4),
        (this.rng() - 0.5) * (exploded ? 7 : 1.4),
        (this.rng() - 0.5) * (exploded ? 7 : 1.4)
      );
      b.userData.life = exploded ? 3.2 : 5.0;
      this.shed.push(b);

      this._pendingSe = this._pendingSe || [];
      if (exploded) {
        this.shake = Math.max(this.shake, 3.2);
        this.impactFlash = 1;
        this.roll += (this.rng() - 0.5) * 0.14;
        this._pendingSe.push({ name: SE.hitHeavy, volume: 72, pitch: 60 });
        this._pendingSe.push({ name: SE.burn, volume: 68, pitch: 70 });
        this._say("stageLost", null, { crew: true });
      } else {
        this.shake = Math.max(this.shake, 0.8);
        this._pendingSe.push({ name: SE.clamp, volume: 75, pitch: 85 });
        this._say("stageSep");
      }
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
      if (!this.profile.belt) return;   // no belt on this flight plan
      // The belt is queued, not built with the scene. It is asked for one beat
      // before the vehicle is in it, which is a whole phase of warning.
      const approach = this.descent ? "fall" : "burn";   // i18n-ignore  phase keys
      if (ph.key === "kessler" || ph.key === approach) this._ensure("belt");
      if (!this.belt) return;
      const inBelt = ph.key === "kessler";
      // The field is picked up EARLY and from a long way off: the fog fades in
      // over the whole second half of the approach beat, so the belt is a
      // thickening haze ahead for twenty seconds before the first thing in it
      // is close enough to hit.
      const nearBelt = ph.key === approach && ph.progress > 0.35;
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
      const dens = inBelt ? 1 : nearBelt ? ramp(ph.progress, 0.35, 1) : (1 - ramp(ph.progress, 0, 0.65));

      if (this.debrisFog && this.debrisFog.rotation) {
        this.debrisFog.rotation.y += dt * 0.12;
        this.debrisFog.rotation.x += dt * 0.05;
        if (this.debrisFog.material) this.debrisFog.material.opacity = 0.35 + dens * 0.55;
      }

      // The wrecks fall past. The near ones are announced a beat before they
      // arrive, which is the only warning there is.
      const s = this.descent ? -1 : 1;
      this.wrecks.forEach((w) => {
        const sp = w.userData.fall * (0.4 + dens);
        w.position.y -= s * sp * dt;
        w.position.x += w.userData.drift * dt * 0.3;
        w.rotation.x += w.userData.spin.x * dt;
        w.rotation.y += w.userData.spin.y * dt;
        w.rotation.z += w.userData.spin.z * dt;
        const ay = s * w.position.y;
        if (w.userData.near && !w.userData.announced && ay < 120 && ay > 40) {
          w.userData.announced = true;
          this._say("proximity");
          this._pendingSe = this._pendingSe || [];
          this._pendingSe.push({ name: SE.alarm, volume: 28, pitch: 135 });
        }
        if (ay < -260) this._resetWreck(w, false);
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
      // The belt is loud enough as a thing that is happening. The hits are
      // mixed WELL under the music and the alarms: a minute of metal at full
      // volume is not tension, it is noise.
      this._pendingSe.push(heavy
        ? { name: SE.hitHeavy, volume: 48, pitch: 70 + Math.random() * 25 }
        : { name: SE.hitLight, volume: 30, pitch: 95 + Math.random() * 45 });
      if (heavy) {
        // A hull report is worth making when the number has actually moved.
        // Every heavy hit takes a sliver; the crew calls it out when a tenth
        // of the round has gone since the last time anybody mentioned it.
        const pct = Math.max(1, Math.round(this.integrity));
        if (this._lastImpactPct == null || this._lastImpactPct - pct >= 8) {
          if (this._say("impact", { pct: pct })) this._lastImpactPct = pct;
        }
      }

      // A heavy one that finds the stage instead of the hull opens the tanks.
      // It is the loudest thing that happens on the flight and it costs the
      // flight nothing: the burn was already made.
      if (heavy && this.hasBooster && !this.boosterGone && this.rng() < 0.3) {
        this._separateBooster(true);
      }
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

    // WHERE A MOUNTED HULL SITS RELATIVE TO ITS OWN GUN.
    //
    // The rail occupies the bore from the breech to the muzzle - upward off a
    // launching gun, downward off one firing at a planet - and the ship lies
    // alongside it: nose along the bore, so the recoil runs up the keel, and
    // out to one side by half its beam plus the gun's frame, so the rail is on
    // the skin rather than through the middle of the hold. Centred on the
    // middle of the rail, because that is where anybody would bolt it.
    //
    // baseY is the breech in world Y, and down says which way the bore runs.
    _seatHull(baseY, down) {
      const H = RAIL_LEN_M * (this.site.railScale || 1);
      const off = (this.shipHalfW || 13) + 6;
      this.shipGroup.position.set(-off, baseY + (down ? -H * 0.5 : H * 0.5), 0);
      // Nose up the bore: the model is built looking down its own +Z, and a
      // quarter turn about X stands that axis on the one the round travels.
      this.shipGroup.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
      this.shipGroup.rotation.y = Math.sin(this._time * 0.2) * 0.02;
      // And it turns slowly about its own keel, which after that quarter turn
      // is local Z. Nothing on a ship this size is ever quite still.
      this.shipGroup.rotation.z = this._time * 0.05;
    }

    _updateShip(dt, ph) {
      // COMING DOWN, the ship is not the thing at the end of the flight: it is
      // the thing the flight leaves. It hangs over the rail for the count and
      // the release and then it is a shape going away upward, so it is asked
      // for in the first frame and dropped as soon as it is out of shot.
      if (this.descent) {
        const away = Math.max(0, this.startAlt - this.alt);
        if (away < 26000) this._ensure("ship");
        if (!this.shipGroup) return;
        this.shipGroup.visible = away < 26000;
        if (!this.shipGroup.visible) return;
        // THE GUN RUNS ALONG THE SHIP. It is a rail seated on the hull's
        // flank and a third of its length, not a tower the hull is moored to,
        // so the ship is drawn lying ALONG the bore with the rail beside it -
        // and the round leaves down the ship's own axis, which is the only
        // direction a hull can take that kind of push from. Coming down the
        // whole installation is upside down, so the hull straddles the rail
        // above the round and goes away upward with it, as one object.
        this._seatHull(away + loadYOf(this.site), true);
        if (this.dockCollar) {
          // The collar the round was sitting in, opening under the hull.
          this.dockCollar.position.set(this.shipHalfW || 13, 0, 0);
          this.dockGlow.intensity = away < 400 ? 2.2 : 0.4;
          this.dockLights.forEach((L, i) => {
            const on = ((Math.floor(this._time * 4) + i) % 8) < 3;
            L.material.color.setHex(on ? 0x8affc4 : 0x14432c);
          });
        }
        return;
      }
      // GOING UP OFF A HULL, which is the same picture the other way round:
      // the ship lies along the rail, the rail rides down under a climbing
      // round with the rest of the installation, and both are culled together.
      if (this.site.mounted && !this.destSite) {
        const gone = (this.alt - this.startAlt) > 60000;
        if (!gone) this._ensure("ship");
        if (!this.shipGroup) return;
        this.shipGroup.visible = !gone;
        if (gone) return;
        this._seatHull(this.pad.position.y, false);
        if (this.dockCollar) {
          this.dockCollar.position.set(this.shipHalfW || 13, 0, 0);
          this.dockGlow.intensity = (this.alt - this.startAlt) < 400 ? 2.2 : 0.4;
        }
        return;
      }

      if (!this.shipGroup) {
        // Queued with the scene: asked for as the belt is cleared, which is a
        // whole phase before it has to be on screen.
        if (ph.key === "clear" || ph.key === "rendezvous" || ph.key === "dock" || ph.key === "aboard") {
          this._ensure("ship");
        }
        if (!this.shipGroup) return;
      }
      const approaching = ph.key === "rendezvous" || ph.key === "dock" || ph.key === "aboard";
      this.shipGroup.visible = approaching || (ph.key === "clear" && ph.progress > 0.45);
      if (!this.shipGroup.visible) return;

      // The ship comes in from ahead and slightly above, and the last seconds
      // are the collar coming to meet the nose.
      let k;
      if (ph.key === "clear") k = ramp(ph.progress, 0.45, 1) * 0.2;
      else if (ph.key === "rendezvous") k = 0.2 + smooth(ph.progress) * 0.7;
      else if (ph.key === "dock") k = 0.9 + smooth(ph.progress) * 0.1;
      else k = 1;

      // The range closes EXPONENTIALLY, which is what a real approach looks
      // like and what puts the ship where the player wants it: two and a half
      // kilometres of nothing goes by in the first seconds, and the rendezvous
      // ends with the round sitting a few tens of metres off the hull. The
      // dock is then the last of it, walked in at a crawl.
      const far = 2600, close = 26;
      const z = -far * Math.pow(close / far, k);
      this.shipGroup.position.set(lerp(420, 0, smooth(k)), lerp(280, 0, smooth(k)), z);
      this.shipGroup.rotation.y = lerp(-1.1, Math.PI, smooth(k));
      this.shipGroup.rotation.z = Math.sin(this._time * 0.2) * 0.02;

      // The collar sits at the near end of the hull, facing the bullet.
      this.dockCollar.position.set(0, 0, this.dockZ);
      this.dockGlow.intensity = 0.4 + k * 2.2;
      this.dockLights.forEach((L, i) => {
        // A chase of green round the collar, faster the closer it gets.
        const on = ((Math.floor(this._time * (2 + k * 8)) + i) % 8) < 3;
        L.material.color.setHex(on ? 0x8affc4 : 0x14432c);
      });

      if (ph.key === "aboard") {
        // Inside the collar: the frame washes out and the interior takes over.
        this.shipGroup.position.z = lerp(-close, Math.abs(this.dockZ) * 0.9, smooth(ph.progress));
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
      const draw = (target) => {
        // Guarded because the test harness renders through a THREE that has no
        // render targets in it: with nothing to draw into, the frame simply
        // goes at the canvas the way it always did.
        if (r.setRenderTarget) r.setRenderTarget(target || null);
        r.clear();
        r.render(this.far, this.farCamera);
        r.clearDepth();
        r.render(this.near, this.camera);
      };

      // THE LIMINAL LENS, and it is the only thing in this scene that is a
      // post pass. It is the black holes' lens, so it is used the way they use
      // it: the world is bent, and the mass is drawn over the bend.
      //
      //   1. everything EXCEPT the round, far and near together, into a target
      //   2. that target blitted back through the lens
      //   3. the round alone, unwarped, over the top
      //
      // Bending the two scenes separately would bend the Moon away from the
      // round standing in front of it, and bending the round with them would
      // put it inside the shader's own photon-capture cut, which is a black
      // disc exactly where the vehicle is.
      const amount = this.lensAmount || 0;
      if (amount > 0.01 && r.setRenderTarget && this.vehicle) {
        if (!this._lens) this._lens = new LiminalLens();
        const veh = this.vehicle;
        const world = (target) => { veh.visible = false; draw(target); veh.visible = true; };
        const over = () => {
          // Only the round. Every other child of the near scene is already in
          // the bent frame underneath, so it is hidden rather than drawn twice
          // - the same reason GalaxySim hides the system for its own third
          // pass. Lights are left alone: they light, they do not draw.
          const kids = this.near.children;
          const was = [];
          for (let i = 0; i < kids.length; i++) {
            const o = kids[i];
            if (o === veh || o.isLight) { was.push(null); continue; }
            was.push(o.visible);
            o.visible = false;
          }
          r.clearDepth();
          r.render(this.near, this.camera);
          for (let i = 0; i < kids.length; i++) {
            if (was[i] !== null) kids[i].visible = was[i];
          }
        };
        if (this._lens.render(r, world, amount, this._time, over)) return;
      }
      draw(null);
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

  // THE HUD IS LOOKED UP LATE, AND IT HAS TO BE.
  //
  // window.PSXHud is published by Battler3D/PSXShader, which sits BELOW this
  // plugin in the load order: read at load time the answer is undefined, it
  // stays undefined for the whole session, and every draw call in this file
  // quietly returns - no tape, no altimeter, no speed, no clock, no telemetry
  // and no selection card, on a screen that is otherwise working perfectly.
  // So it is resolved on first use instead, by which time every plugin in the
  // list has run.
  let HUD = window.PSXHud || null;

  // How wide the HUD's own virtual canvas is. PSXHud measures everything in
  // virtual pixels and stretches the lot to the window, so asking for a WIDER
  // canvas draws the same type and panels SMALLER on screen. Half again as
  // wide as the default is the difference between a cockpit readout and a
  // caption plastered across the planet.
  const HUD_SHRINK = 1.5;

  function HUD_BASE_W() {
    return HUD ? Math.round(HUD.baseWidth() * HUD_SHRINK) : 0;
  }

  function hudReady() {
    if (!HUD) HUD = window.PSXHud || null;
    return HUD;
  }

  // The bands drawn on the tape, bottom to top. `to` null means a line rather
  // than a band. Colours are read off the PSX palette so the HUD matches every
  // other 3D screen in the game.
  // Which beats of each crossing are worth a mark on the tape, and in what
  // colour. Not every beat: a tape with eighteen labels on it is a wall.
  // i18n-ignore-start  phase keys
  const TAPE_MARKS = {
    moon: ["liminal", "transit", "approach", "flyby", "skim", "touchdown"],
    zeta: ["solomon", "hexspace", "thewhite", "emerge", "refuel", "transfer", "skim"],
    titania: ["cruise", "jupiter", "charge", "blast", "pluto", "breach", "gods", "crossing", "emerge", "approach", "skim"],
    earth: ["emerge", "moonbrake", "kessler", "reentry", "capture"],
  };
  // i18n-ignore-end

  let TAPE_COLOURS = null;
  function tapeColours() {
    if (TAPE_COLOURS) return TAPE_COLOURS;
    hudReady();
    const P = HUD ? HUD.PAL : { cyan: "#3ad7ef", amber: "#ffc02e", red: "#e8442e", green: "#4fe07a", dim: "#93a3b8" };
    // i18n-ignore-start  phase keys
    TAPE_COLOURS = {
      liminal: P.amber, transit: P.amber, solomon: P.amber, hexspace: P.cyan,
      thewhite: P.ink || "#e8f0f8", emerge: P.green, refuel: P.cyan, transfer: P.amber,
      cruise: P.dim, jupiter: P.amber, approach: P.cyan, moonbrake: P.green,
      charge: P.magenta, blast: P.red, pluto: P.dim, breach: P.red,
      gods: P.amber, crossing: P.cyan, redmoon: P.red, cleanSky: P.dim,
      flyby: P.green, skim: P.green, touchdown: P.green,
    };
    // i18n-ignore-end
    return TAPE_COLOURS;
  }

  function tapeBands(profile) {
    hudReady();
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
    if (prof.lunar) {
      // A CROSSING'S TAPE IS ITS OWN BEATS. The column on one of these is a
      // range to whatever is worth measuring against at that point in the
      // flight, and it changes what it is measuring twice - so the marks on it
      // are the beats themselves, taken off the plan, at the heights the plan
      // says they happen at. A flight to Andromeda no longer flies a tape that
      // says LUNAR APPROACH.
      const bands = [];
      if (prof.belt) {
        bands.push(
          { from: MAXQ_START_M, to: MAXQ_END_M, key: "maxq", color: P.amber },
          { from: KESSLER_IN_M, to: KESSLER_OUT_M, key: "kessler", color: P.red }
        );
      }
      // One mark per beat of the crossing, at the height it begins.
      const marks = TAPE_MARKS[prof.world] || [];
      marks.forEach((key) => {
        const beat = prof.phases.find((p) => p.key === key);
        if (!beat) return;
        bands.push({ from: beat.from, to: null, key: key, color: tapeColours()[key] || P.cyan });
      });
      return bands;
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


  // Readouts. Metres below a kilometre, kilometres above, and a speed that
  // switches to km/s where m/s stops being a number anyone can read.
  // THE HUD AND THE PICKER LIVE IN RocketLaunchHUD.js, and the two holders
  // below are what that file fills in. Nothing reads either of them until a
  // launch is actually started, which is long after every plugin has loaded.
  let LaunchHud = null;
  let SiteCard = null;

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
  // The pads side by side, with the weather that is actually over each of them
  // right now. The player picks; the flight is different from either. A
  // downrange flight with more than one pad left to aim at asks a second time,
  // on its own page, where it is coming down.
  // ==========================================================================

  // Which beats of any plan are POWERED - a motor lit, or a drive in. The
  // card's profile chart draws these in amber and everything else in cyan, so
  // the shape of a plan also shows where its energy is spent.
  // i18n-ignore-start  phase keys
  const LIT_BEATS = [
    "coil", "ignition", "burn", "kessler", "clear",
    "prograde", "terminal", "capture",
    "liminal", "transit", "flyby",
  ];
  // i18n-ignore-end


  // What a flight costs, as the card prints it. Money is stated in euros
  // everywhere in this game and the party carries hundredths of one, so the
  // formatting goes through the same service every other price does.
  function fareText(actual, fallback, destId) {
    const prof = actual || fallback;
    const euros = fareOf(prof, destId);
    if (euros <= 0) return t("select.free");
    try {
      if (window.MoneyFormatter && typeof window.MoneyFormatter.format === "function") {
        return window.MoneyFormatter.format(euros * 100);
      }
    } catch (e) { /* fall through to the plain number */ }
    return euros + " €";   // i18n-ignore  euro sign
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
    { at: ["coil", 0.45], key: "railExit", se: SE.boom, vol: 95, crew: true },
    { at: ["coast", 0.02], key: "ballistic", se: SE.gale, vol: 70 },
    { at: ["coast", 0.35], key: "maxQ", se: SE.wind, vol: 80, crew: true },
    { at: ["coast", 0.9], key: "thinAir", se: null, crew: true },
    { at: ["ignition", 0.05], key: "ignition", se: SE.ignite, vol: 95 },
    { at: ["ignition", 0.5], key: "burning", se: SE.burn, vol: 85 },
    { at: ["burn", 0.1], key: "karman", se: SE.computer, vol: 55 },
    { at: ["burn", 0.75], key: "beltAhead", se: SE.klaxon, vol: 70 },
    { at: ["kessler", 0.0], key: "beltEntry", se: SE.alarm, vol: 85, music: "belt" },
    { at: ["kessler", 0.45], key: "beltDeep", se: null, crew: true },
    { at: ["kessler", 0.85], key: "beltBare", se: null, crew: true },
    { at: ["clear", 0.05], key: "beltClear", se: SE.aboard, vol: 65, crew: true },
    { at: ["rendezvous", 0.0], key: null, music: "arrival" },
    { at: ["rendezvous", 0.05], key: "shipSighted", se: SE.radio, vol: 70, crew: true },
    { at: ["rendezvous", 0.7], key: "closing", se: SE.computer, vol: 55 },
    { at: ["dock", 0.55], key: "softDock", se: SE.clamp, vol: 90 },
    { at: ["dock", 0.9], key: "hardDock", se: SE.airlock, vol: 85 },
    { at: ["aboard", 0.2], key: "aboard", se: SE.aboard, vol: 80, crew: true },
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
    { at: ["coil", 0.45], key: "railExit", se: SE.boom, vol: 95, crew: true },
    { at: ["ascent", 0.02], key: "hopBallistic", se: SE.gale, vol: 70, crew: true },
    { at: ["ascent", 0.3], key: "maxQ", se: SE.wind, vol: 80 },
    { at: ["ascent", 0.88], key: "hopApogeeNear", se: SE.computer, vol: 55 },
    { at: ["apogee", 0.1], key: "hopFlip", se: SE.rumble, vol: 70, crew: true },
    { at: ["apogee", 0.75], key: "hopFlipDone", se: SE.power, vol: 60, crew: true },
    { at: ["prograde", 0.05], key: "hopPrograde", se: SE.ignite, vol: 95 },
    { at: ["prograde", 0.6], key: "hopBraking", se: SE.burn, vol: 80 },
    { at: ["reentry", 0.1], key: "hopReentry", se: SE.gale, vol: 80, crew: true },
    { at: ["terminal", 0.1], key: "hopTerminal", se: SE.radio, vol: 70 },
    { at: ["terminal", 0.75], key: "hopMuzzle", se: SE.charge, vol: 75 },
    { at: ["capture", 0.05], key: "hopCapture", se: SE.coilRing, vol: 85 },
    { at: ["capture", 0.6], key: "hopBraked", se: SE.rumble, vol: 80 },
    { at: ["capture", 0.95], key: "hopDocked", se: SE.clamp, vol: 90 },
    { at: ["arrived", 0.2], key: "hopArrived", se: SE.airlock, vol: 80, crew: true },
  ];

  // The way down. The gun end of it is the launch, word for word, because it
  // is the same gun; everything after the release is the climb read backwards.
  const DEORBIT_CUES = [
    { at: ["hold", 0.0], key: null, music: "launch" },
    { at: ["hold", 0.1], key: "deorbitClear", se: SE.radio, vol: 60 },
    { at: ["countdown", 0.02], key: "deorbitCount", se: SE.computer, vol: 55 },
    { at: ["countdown", 0.35], key: "coilCharge", se: SE.charge, vol: 70 },
    { at: ["countdown", 0.8], key: "gantryClear", se: SE.power, vol: 60 },
    { at: ["coil", 0.0], key: "release", se: SE.release, vol: 100 },
    { at: ["coil", 0.45], key: "deorbitAway", se: SE.boom, vol: 90 },
    { at: ["fall", 0.05], key: "deorbitFall", se: SE.gale, vol: 60 },
    { at: ["fall", 0.55], key: "deorbitFalling", se: SE.computer, vol: 55, crew: true },
    { at: ["fall", 0.8], key: "beltAhead", se: SE.klaxon, vol: 70, music: "belt" },
    { at: ["kessler", 0.0], key: "beltEntry", se: SE.alarm, vol: 85 },
    { at: ["kessler", 0.45], key: "beltDeep", se: null, crew: true },
    { at: ["kessler", 0.85], key: "beltBare", se: null, crew: true },
    { at: ["clear", 0.05], key: "beltClear", se: SE.aboard, vol: 65, music: "arrival" },
    { at: ["clear", 0.6], key: "entryInterface", se: SE.computer, vol: 55 },
    { at: ["reentry", 0.08], key: "entryPlasma", se: SE.gale, vol: 85 },
    { at: ["reentry", 0.55], key: "entryBlackout", se: SE.rumble, vol: 80, crew: true },
    { at: ["reentry", 0.9], key: "entryOut", se: SE.radio, vol: 70, crew: true },
    { at: ["terminal", 0.25], key: "chuteOut", se: SE.power, vol: 70 },
    { at: ["terminal", 0.8], key: "landingMuzzle", se: SE.charge, vol: 75 },
    { at: ["capture", 0.05], key: "hopCapture", se: SE.coilRing, vol: 85 },
    { at: ["capture", 0.6], key: "hopBraked", se: SE.rumble, vol: 80 },
    { at: ["capture", 0.95], key: "hopDocked", se: SE.clamp, vol: 90 },
    { at: ["arrived", 0.2], key: "landed", se: SE.airlock, vol: 80, crew: true },
  ];

  // THE MOON, from the ground. The first eight beats are the orbital flight
  // unchanged, because up to the far side of the belt that is exactly what it
  // is - so the cues are taken from it rather than written twice, and only the
  // beats after the belt are new.
  const LUNAR_CUES = ORBITAL_CUES
    .filter((c) => ["rendezvous", "dock", "aboard"].indexOf(c.at[0]) < 0)   // i18n-ignore  phase keys
    .concat([
      { at: ["shroud", 0.05], key: "shroudBlow", se: SE.klaxon, vol: 70, music: "arrival" },
      { at: ["shroud", 0.6], key: "moonAhead", se: SE.radio, vol: 70, crew: true },
      { at: ["liminal", 0.05], key: "liminalSpool", se: SE.charge, vol: 85 },
      { at: ["liminal", 0.55], key: "liminalHot", se: SE.power, vol: 75, crew: true },
      { at: ["transit", 0.02], key: "liminalGo", se: SE.flash, vol: 95 },
      { at: ["transit", 0.45], key: "transitDeep", se: SE.rumble, vol: 70, crew: true },
      { at: ["transit", 0.88], key: "moonFills", se: SE.computer, vol: 55, crew: true },
      { at: ["flyby", 0.05], key: "capture", se: SE.computer, vol: 55 },
      { at: ["flyby", 0.4], key: "lunarOrbiting", se: SE.radio, vol: 70, crew: true },
      { at: ["flyby", 0.82], key: "deorbitBurn", se: SE.charge, vol: 70 },
      { at: ["skim", 0.08], key: "lunarSkim", se: SE.radio, vol: 70 },
      { at: ["skim", 0.7], key: "baseSighted", se: SE.computer, vol: 55 },
      { at: ["touchdown", 0.2], key: "finalApproach", se: SE.charge, vol: 70 },
      { at: ["touchdown", 0.9], key: "contact", se: SE.clamp, vol: 90 },
      { at: ["arrived", 0.2], key: "lunarArrived", se: SE.airlock, vol: 80, crew: true },
    ]);

  // THE MOON, from orbit. No air to punch out of, no belt to cross, no sleeve
  // and no boost stage - so none of the beats about any of them, and the
  // release is followed by silence until the drive lights.
  const LUNAR_ORBIT_CUES = [
    { at: ["hold", 0.0], key: null, music: "launch" },
    { at: ["hold", 0.1], key: "lunarPadClear", se: SE.radio, vol: 60 },
    { at: ["countdown", 0.02], key: "lunarCount", se: SE.computer, vol: 55 },
    { at: ["countdown", 0.35], key: "coilCharge", se: SE.charge, vol: 70 },
    { at: ["countdown", 0.8], key: "gantryClear", se: SE.power, vol: 60 },
    { at: ["coil", 0.0], key: "release", se: SE.release, vol: 100 },
    { at: ["coil", 0.45], key: "railExit", se: SE.boom, vol: 95, crew: true },
    { at: ["drift", 0.05], key: "lunarDrift", se: SE.computer, vol: 55 },
    { at: ["drift", 0.6], key: "moonAhead", se: SE.radio, vol: 70, crew: true, music: "arrival" },
    { at: ["liminal", 0.05], key: "liminalSpool", se: SE.charge, vol: 85 },
    { at: ["liminal", 0.55], key: "liminalHot", se: SE.power, vol: 75, crew: true },
    { at: ["transit", 0.02], key: "liminalGo", se: SE.flash, vol: 95 },
    { at: ["transit", 0.45], key: "transitDeep", se: SE.rumble, vol: 70, crew: true },
    { at: ["transit", 0.88], key: "moonFills", se: SE.computer, vol: 55, crew: true },
    { at: ["flyby", 0.05], key: "capture", se: SE.computer, vol: 55 },
    { at: ["flyby", 0.4], key: "lunarOrbiting", se: SE.radio, vol: 70, crew: true },
    { at: ["flyby", 0.82], key: "deorbitBurn", se: SE.charge, vol: 70 },
    { at: ["skim", 0.08], key: "lunarSkim", se: SE.radio, vol: 70 },
    { at: ["skim", 0.7], key: "baseSighted", se: SE.computer, vol: 55 },
    { at: ["touchdown", 0.2], key: "finalApproach", se: SE.charge, vol: 70 },
    { at: ["touchdown", 0.9], key: "contact", se: SE.clamp, vol: 90 },
    { at: ["arrived", 0.2], key: "lunarArrived", se: SE.airlock, vol: 80, crew: true },
  ];

  // The head of a cue list, matching the head of the plan.
  function headCues(kind) {
    // The pad, the count and the release are the same words whichever gun
    // fires them, because it is the same gun.
    const gun = [
      { at: ["hold", 0.0], key: null, music: "launch" },
      { at: ["hold", 0.1], key: kind === "vacuum" ? "lunarPadClear" : "padClear", se: SE.radio, vol: 60 },
      { at: ["countdown", 0.02], key: kind === "vacuum" ? "lunarCount" : "countStart", se: SE.computer, vol: 55 },
      { at: ["countdown", 0.35], key: "coilCharge", se: SE.charge, vol: 70 },
      { at: ["countdown", 0.8], key: "gantryClear", se: SE.power, vol: 60 },
      { at: ["coil", 0.0], key: "release", se: SE.release, vol: 100 },
      { at: ["coil", 0.45], key: "railExit", se: SE.boom, vol: 95, crew: true },
    ];
    if (kind === "vacuum") {                                   // i18n-ignore  pad-kind id
      return gun.concat([
        { at: ["drift", 0.05], key: "lunarDrift", se: SE.computer, vol: 55 },
        { at: ["drift", 0.6], key: "driftClear", se: SE.radio, vol: 70, crew: true },
      ]);
    }
    // Through weather, either way.
    const air = gun.concat([
      { at: ["coast", 0.02], key: "ballistic", se: SE.gale, vol: 70 },
      { at: ["coast", 0.35], key: "maxQ", se: SE.wind, vol: 80, crew: true },
      { at: ["coast", 0.9], key: "thinAir", se: null, crew: true },
      { at: ["ignition", 0.05], key: "ignition", se: SE.ignite, vol: 95 },
      { at: ["ignition", 0.5], key: "burning", se: SE.burn, vol: 85 },
      { at: ["burn", 0.1], key: "karman", se: SE.computer, vol: 55 },
    ]);
    if (kind === "air") {                                      // i18n-ignore  pad-kind id
      // Nothing up there. Which is worth saying, off a world where it is true
      // and the crew have been told stories about the one where it is not.
      return air.concat([
        { at: ["burn", 0.75], key: "cleanSky", se: SE.computer, vol: 55 },
        { at: ["cleanSky", 0.1], key: "cleanSkyCrew", se: null, crew: true },
      ]);
    }
    return air.concat([
      { at: ["burn", 0.75], key: "beltAhead", se: SE.klaxon, vol: 70 },
      { at: ["kessler", 0.0], key: "beltEntry", se: SE.alarm, vol: 85, music: "belt" },
      { at: ["kessler", 0.45], key: "beltDeep", se: null, crew: true },
      { at: ["kessler", 0.85], key: "beltBare", se: null, crew: true },
      { at: ["clear", 0.05], key: "beltClear", se: SE.aboard, vol: 65, crew: true },
      { at: ["shroud", 0.05], key: "shroudBlow", se: SE.klaxon, vol: 70 },
      { at: ["shroud", 0.6], key: "shroudClear", se: SE.radio, vol: 70, crew: true },
    ]);
  }

  // Coming home: the braking pass round the Moon and the way down after it.
  const EARTH_ARRIVAL_CUES = [
    // i18n-ignore-start  phase keys
    { at: ["emerge", 0.05], key: "earthAhead", se: SE.aboard, vol: 70, crew: true },
    { at: ["moonbrake", 0.08], key: "brakeIn", se: SE.computer, vol: 55 },
    { at: ["moonbrake", 0.55], key: "brakeCrew", se: null, crew: true },
    { at: ["moonbrake", 0.9], key: "brakeDone", se: SE.power, vol: 70 },
    { at: ["fall", 0.1], key: "deorbitFall", se: SE.gale, vol: 60 },
    { at: ["kessler", 0.0], key: "beltEntry", se: SE.alarm, vol: 85, music: "belt" },
    { at: ["kessler", 0.5], key: "beltDeep", se: null, crew: true },
    { at: ["clear", 0.05], key: "beltClear", se: SE.aboard, vol: 65, crew: true, music: "arrival" },
    { at: ["reentry", 0.08], key: "entryPlasma", se: SE.gale, vol: 85 },
    { at: ["reentry", 0.55], key: "entryBlackout", se: SE.rumble, vol: 80, crew: true },
    { at: ["terminal", 0.8], key: "landingMuzzle", se: SE.charge, vol: 75 },
    { at: ["capture", 0.05], key: "hopCapture", se: SE.coilRing, vol: 85 },
    { at: ["capture", 0.95], key: "hopDocked", se: SE.clamp, vol: 90 },
    { at: ["arrived", 0.2], key: "landed", se: SE.airlock, vol: 80, crew: true },
    // And the version that ends alongside the ship rather than on the ground.
    { at: ["rendezvous", 0.05], key: "shipSighted", se: SE.radio, vol: 70, crew: true },
    { at: ["dock", 0.55], key: "softDock", se: SE.clamp, vol: 90 },
    { at: ["dock", 0.9], key: "hardDock", se: SE.airlock, vol: 85 },
    { at: ["aboard", 0.2], key: "aboard", se: SE.aboard, vol: 80, crew: true },
    // i18n-ignore-end
  ];

  // The last beats of every crossing: round the world and down onto the pad.
  function arrivalCues(world) {
    if (world === "earth") return EARTH_ARRIVAL_CUES;   // i18n-ignore  world id
    return [
      { at: ["approach", 0.15], key: world + "Ahead", se: SE.radio, vol: 70 },
      { at: ["flyby", 0.05], key: "capture", se: SE.computer, vol: 55 },
      { at: ["flyby", 0.4], key: world + "Orbiting", se: SE.radio, vol: 70, crew: true },
      { at: ["flyby", 0.82], key: "deorbitBurn", se: SE.charge, vol: 70 },
      { at: ["skim", 0.08], key: world + "Skim", se: SE.radio, vol: 70 },
      { at: ["skim", 0.7], key: "baseSighted", se: SE.computer, vol: 55 },
      { at: ["touchdown", 0.2], key: "finalApproach", se: SE.charge, vol: 70 },
      { at: ["touchdown", 0.9], key: "contact", se: SE.clamp, vol: 90 },
      { at: ["arrived", 0.2], key: world + "Arrived", se: SE.airlock, vol: 80, crew: true },
    ];
  }

  // The middle of each crossing: the only part that is genuinely its own.
  const TAIL_CUES = {
    // i18n-ignore-start  world ids and phase keys
    moon: [
      { at: ["liminal", 0.05], key: "liminalSpool", se: SE.charge, vol: 85, music: "arrival" },
      { at: ["liminal", 0.55], key: "liminalHot", se: SE.power, vol: 75, crew: true },
      { at: ["transit", 0.02], key: "liminalGo", se: SE.flash, vol: 95 },
      { at: ["transit", 0.45], key: "transitDeep", se: SE.rumble, vol: 70, crew: true },
      { at: ["transit", 0.88], key: "moonFills", se: SE.computer, vol: 55, crew: true },
    ],
    zeta: [
      { at: ["liminal", 0.05], key: "stackSpool", se: SE.charge, vol: 85, music: "arrival" },
      { at: ["liminal", 0.6], key: "stackHot", se: SE.power, vol: 75, crew: true },
      { at: ["solomon", 0.02], key: "gateOpen", se: SE.flash, vol: 95 },
      { at: ["solomon", 0.35], key: "gateSlabs", se: null, crew: true },
      { at: ["solomon", 0.9], key: "stageOne", se: SE.clamp, vol: 85 },
      { at: ["hexspace", 0.05], key: "hexIn", se: SE.alarm, vol: 80 },
      { at: ["hexspace", 0.45], key: "hexCompany", se: SE.rumble, vol: 70, crew: true },
      { at: ["hexspace", 0.9], key: "stageTwo", se: SE.clamp, vol: 85 },
      { at: ["thewhite", 0.05], key: "whiteIn", se: SE.flash, vol: 90 },
      { at: ["thewhite", 0.4], key: "whiteSolids", se: null, crew: true },
      { at: ["thewhite", 0.75], key: "whiteDeep", se: null, crew: true },
      { at: ["thewhite", 0.95], key: "stageThree", se: SE.clamp, vol: 85 },
      { at: ["emerge", 0.05], key: "zetaOut", se: SE.aboard, vol: 70 },
      { at: ["emerge", 0.45], key: "zetaStar", se: SE.radio, vol: 70, crew: true },
      { at: ["emerge", 0.85], key: "dysonSighted", se: SE.computer, vol: 55, crew: true },
      { at: ["refuel", 0.1], key: "refuelIn", se: SE.charge, vol: 70 },
      { at: ["refuel", 0.55], key: "refuelCrew", se: null, crew: true },
      { at: ["refuel", 0.92], key: "refuelDone", se: SE.power, vol: 65 },
      { at: ["transfer", 0.08], key: "transferBurn", se: SE.ignite, vol: 80 },
      { at: ["transfer", 0.6], key: "transferCrew", se: null, crew: true },
    ],
    titania: [
      { at: ["cruise", 0.05], key: "jupiterAim", se: SE.computer, vol: 55, music: "arrival" },
      { at: ["jupiter", 0.1], key: "jupiterAhead", se: SE.radio, vol: 70 },
      { at: ["jupiter", 0.6], key: "jupiterClose", se: SE.rumble, vol: 75, crew: true },
      // The red moon, on the way OUT of Andromeda - the other end of the same
      // crossing, where there is no Jupiter to drop anything against.
      { at: ["redmoon", 0.08], key: "redMoonAhead", se: SE.radio, vol: 70, music: "arrival" },
      { at: ["redmoon", 0.6], key: "redMoonClose", se: SE.rumble, vol: 75, crew: true },
      // The string of pellets.
      { at: ["charge", 0.05], key: "chargeArm", se: SE.charge, vol: 85 },
      { at: ["charge", 0.45], key: "chargeOut", se: SE.power, vol: 70 },
      { at: ["charge", 0.85], key: "chargeCrew", se: null, crew: true },
      { at: ["blast", 0.05], key: "blastFirst", se: SE.flash, vol: 100 },
      { at: ["blast", 0.45], key: "blastRiding", se: SE.burn, vol: 85, crew: true },
      { at: ["blast", 0.88], key: "blastLast", se: SE.rumble, vol: 85 },
      { at: ["pluto", 0.15], key: "plutoPast", se: SE.computer, vol: 55 },
      { at: ["pluto", 0.7], key: "plutoCrew", se: null, crew: true },
      { at: ["breach", 0.05], key: "breachIn", se: SE.alarm, vol: 80 },
      { at: ["breach", 0.6], key: "breachCrew", se: null, crew: true },
      { at: ["breach", 0.92], key: "breachGive", se: SE.rumble, vol: 90 },
      { at: ["gods", 0.05], key: "goldIn", se: SE.flash, vol: 70 },
      { at: ["gods", 0.4], key: "goldCrew", se: null, crew: true },
      { at: ["gods", 0.85], key: "goldOut", se: null, crew: true },
      { at: ["crossing", 0.05], key: "crossOut", se: SE.aboard, vol: 70 },
      { at: ["crossing", 0.5], key: "crossHome", se: null, crew: true },
      { at: ["emerge", 0.05], key: "andromeda", se: SE.aboard, vol: 75, crew: true },
      { at: ["emerge", 0.55], key: "theNeighbour", se: SE.radio, vol: 70 },
      { at: ["approach", 0.15], key: "titaniaAhead", se: SE.radio, vol: 70 },
      { at: ["approach", 0.7], key: "titaniaFills", se: SE.computer, vol: 55, crew: true },
    ],
    // i18n-ignore-end
  };

  const _crossingCues = {};

  function crossingCues(profile) {
    const id = profile.id;
    if (_crossingCues[id]) return _crossingCues[id];
    const world = profile.world;
    const list = headCues(profile.kind)
      .concat(TAIL_CUES[world] || [], arrivalCues(world));
    // A cue that names a beat this plan does not have can never fire, and a
    // cue that can never fire is a line nobody wrote for nothing. Dropped
    // here rather than skipped every frame, so the table IS the flight.
    const beats = new Set(profile.phases.map((p) => p.key));
    _crossingCues[id] = list.filter((c) => beats.has(c.at[0]));
    return _crossingCues[id];
  }

  function cuesFor(profile) {
    if (profile && profile.world && CROSSINGS[profile.world]) return crossingCues(profile);
    if (profile && profile.descent) return DEORBIT_CUES;
    return profile && profile.downrange ? SUBORBITAL_CUES : ORBITAL_CUES;
  }

  class Scene_RocketLaunch extends Scene_Base {
    prepare(opts) {
      const o = opts || {};
      this._forcedSite = o.site && o.site !== "ask" ? o.site : null;       // i18n-ignore  arg value
      this._forcedMode = o.mode && o.mode !== "ask" ? o.mode : null;       // i18n-ignore  arg value
      this._forcedDest = o.dest && o.dest !== "ask" ? o.dest : null;       // i18n-ignore  arg value
      // An explicit destination from a plugin command wins over both arrival
      // tables; otherwise the profile decides where the party ends up.
      this._destination = o.destination || null;
      // FREE PLAY: the cinematic opened from the minigame arcade, where there
      // is no map to come down on and no vehicle to spend. The flight is flown
      // exactly as it always is; only its consequences are dropped - no fare is
      // taken, nothing is written to the game system, and the arrival pops back
      // to the picker instead of transferring the party.
      this._freePlay = !!o.freePlay;
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
      // The vault pad has to be resolved before anything asks which pads exist.
      refreshVaultSite();
      // A command that names the pad AND the flight plan has decided
      // everything the card exists to ask - unless it left the destination
      // open and there is more than one pad this flight could come down on,
      // in which case the card opens straight on the destination page. "Ask"
      // means ask, whatever else the command pinned down.
      const site = this._forcedSite && SITES[this._forcedSite] ? this._forcedSite : null;
      // A pad with only one flight plan it can fly has already answered the
      // flight-plan question, whatever the command left open: the ship cannot
      // throw a round across an atmosphere it is not in.
      const plans = availableProfiles(site);
      if (site && !this._forcedMode && plans.length === 1) this._forcedMode = plans[0];
      if (this._forcedMode && plans.indexOf(this._forcedMode) < 0) this._forcedMode = plans[0];

      const pinned = site && this._forcedMode;
      const asksDest = pinned && !this._forcedDest &&
        destinationsFor(site, profileOf(this._forcedMode)).length > 1;
      if (pinned && !asksDest) {
        this._beginFlight(site, this._forcedMode, this._forcedDest);
      } else {
        this._card = new SiteCard(this._env, this._forcedMode, site, asksDest);
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
      const layer = hudReady() ? HUD.layer(HUD_BASE_W()) : null;
      if (layer) {
        HUD.text(layer.bitmap, t("hud.noThree"), 0, Math.round(layer.h / 2), layer.w, "center",
          HUD.PAL.red, 16);
        this.addChild(layer.sprite);
      }
      this._failed = true;
    }

    _beginFlight(siteId, profileId, destId) {
      if (this._card) { this.removeChild(this._card.sprite); this._card = null; }
      const site = usableSite(siteId) || SITES[availableSites()[0]];
      this._site = site;
      // A hop is not a flight that can be made with Earth gone: there is no
      // ground to throw a round across any more, so it becomes a crossing.
      let prof = profileOf(profileId || "orbital");   // i18n-ignore  profile id
      if (prof.downrange && availableProfiles(site.id).indexOf(prof.id) < 0) prof = PROFILES.orbital;
      this._profile = prof;
      // A named destination wins, as long as it is a pad this flight may
      // actually reach; otherwise the first one it may.
      const allowed = destinationsFor(site.id, prof);
      const named = destId && allowed.indexOf(destId) >= 0 ? usableSite(destId) : null;
      this._destSite = named || SITES[allowed[0]] || (prof.downrange ? otherSite(site.id) : SITES.ship);
      // A crossing that leaves orbit for a pad on a planet that still exists
      // is not a climb: it is the climb backwards, and it is flown as one.
      if (descentFrom(site, this._destSite)) { prof = PROFILES.deorbit; this._profile = prof; }
      // AND A CROSSING AIMED AT THE MOON IS NEITHER. It is the only flight in
      // the plugin that carries a liminal engine, and which of the two lunar
      // tables it flies is decided by the pad it leaves rather than by
      // anything the player picked: see lunarProfileFrom.
      // AND A CROSSING AIMED AT ANOTHER WORLD IS NEITHER. Which of the nine
      // crossings it flies is decided by the world it is aimed at and the kind
      // of pad it is leaving, and by nothing the player picked: see
      // crossingProfile.
      const cross = crossingProfile(site, this._destSite);
      if (cross) { prof = cross; this._profile = prof; }
      // AND A PLAIN CROSSING STILL HAS A SKY OVER IT. Off a world with no belt
      // there is no belt to fly through on the way to the ship either, so the
      // ordinary plan is taken in the version that matches the pad. A hop is
      // never redirected: it is the same throw whichever ground it is over.
      else if (!prof.downrange && !prof.descent) {
        const plain = PROFILES[orbitalId(padKind(site))];
        if (plain) { prof = plain; this._profile = prof; }
      }
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

      if (hudReady()) HUD.onFontReady(() => { if (this._hud) this._hud.draw(this._state()); });

      // The map's music and ambience are put away for the duration. What
      // happens to them afterwards depends on whether the flight arrived: see
      // _leave.
      try { BattleManager.saveBgmAndBgs(); } catch (e) { /* no battle manager, no restore */ }
      // And silence what the map was doing. The flight brings its own sound
      // and the pad it is standing on has nothing to say over it.
      try { AudioManager.stopBgs(); } catch (e) { /* nothing playing, nothing to stop */ }
      this._audioTaken = true;

      // THE FARE, and it is taken here: at the moment the cinematic actually
      // starts, not when the card opened. A player who backs out of the
      // selection has bought nothing.
      const destForFare = this._destSite ? this._destSite.id : null;
      this._fare = fareOf(this._profile, destForFare);
      if (!this._freePlay) chargeFare(this._profile, destForFare);

      this._time = 0;
      Radio.reset();
      this._replies = [];
      this._lastReply = -99;
      this._radio("ready", Radio.fromControl("ready", {
        site: siteName(site.id),
        mode: modeName(this._profile),
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

    // M, the same key that opens every other map in this game. Read here
    // rather than in the HUD because the HUD draws what it is handed and does
    // not own any state of its own.
    _updateChart() {
      // M is bound to the name "map" at load (see the note by the keyMapper
      // line), so it is asked for by that name like any other button. There is
      // no raw-keycode path: Input._currentState is never populated for
      // letters, so reading it would be a branch that can never be true.
      let pressed = false;
      try {
        pressed = !!(typeof Input !== "undefined" && Input.isTriggered &&
          Input.isTriggered(MAP_BUTTON));
      } catch (e) { /* no input, no chart */ }
      if (pressed) {
        this._chart = !this._chart;
        se(this._chart ? SE.computer : SE.back, 60);
      }
    }

    _state() {
      const st = this._stage;
      return {
        time: this._time,
        phase: st ? st.phase : phaseAt(0, this._profile),
        alt: st ? st.alt : 0,
        vspeed: st ? st.vspeed : 0,
        speed: speedAt(this._time, this._profile, st ? st.trackM : 0),
        integrity: st ? st.integrity : INTEGRITY_START,
        density: st ? st.density : 1,
        plates: st ? st.plates.length : 0,
        free: st ? st.isFreeLook : false,
        downrange: st ? st.downrange : 0,
        downrangeM: st ? st.downrangeM : 0,
        trackM: st ? st.trackM : 0,
        chart: !!this._chart,
        fromSite: this._site ? this._site.id : SITE_ORDER[0],
        toSite: this._destSite ? this._destSite.id : "ship",   // i18n-ignore  site id
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
        if (i >= 0 && i !== c.cursor) { c.cursor = i; se(SE.cursor, 70); }
      }
      if (Input.isTriggered("ok") || (TouchInput.isTriggered() && c.hitTest(TouchInput.x, TouchInput.y) >= 0)) {
        if (c.confirm()) this._beginFlight(c.siteId, c.profileId, c.destId);
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

    // EVERY LINE THE FLIGHT PRINTS GOES THROUGH HERE, and two things happen
    // to it: the log is told WHO said it, so it can draw the ground and the
    // people in the round in different colours instead of running them
    // together, and a line from the ground on a beat worth answering has an
    // answer from aboard queued a beat behind it.
    _radio(key, text) {
      this._hud.push(text, Radio.lastWho);
      if (Radio.lastWho === "crew") return;   // i18n-ignore  speaker id
      if (this._time - this._lastReply < REPLY_GAP) return;
      const reply = Radio.replyTo(key, {
        site: siteName(this._site.id),
        dest: siteName(this._arrivalId()),
        alt: this._stage ? altText(this._stage.alt) : "",
        pct: this._stage ? pctText(this._stage.integrity) : "",
      });
      if (!reply) return;
      this._lastReply = this._time;
      // A beat and a bit later: long enough to read as somebody pressing a
      // key and answering, short enough to still be about the same thing.
      (this._replies = this._replies || []).push({
        at: this._time + 1.1 + Math.random() * 0.7, text: reply,
      });
    }

    // The answers, let out when their moment comes.
    _drainReplies() {
      const q = this._replies;
      if (!q || !q.length) return;
      while (q.length && q[0].at <= this._time) {
        this._hud.push(q.shift().text, "crew");   // i18n-ignore  speaker id
        se(SE.radio, 45);
      }
    }

    _fireCues() {
      const prof = this._profile;
      if (this._stage && this._stage.phase) Radio.atPhase(prof, this._stage.phase.key);
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
          const params = {
            site: siteName(this._site.id),
            dest: siteName(this._arrivalId()),
            alt: altText(this._stage.alt),
            pct: pctText(this._stage.integrity),
          };
          this._radio(cue.key, cue.crew
            ? Radio.fromCrew(cue.key, params)
            : Radio.fromControl(cue.key, params));
        }
        if (cue.music) bgm(cue.music);
        if (cue.se) se(cue.se, cue.vol == null ? 75 : cue.vol);
      });
    }

    _drainStage() {
      this._updateChart();
      this._stage.drainSe().forEach((c) => se(c.name, c.volume, c.pitch, c.pan));
      this._stage.drainLog().forEach((l) => this._radio(l.key, l.text));
      this._drainReplies();
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

    // The pad this flight is going to, by id. The card and the log both print
    // it, and a crossing that never named one is on its way to the ship.
    _arrivalId() {
      if (this._destSite) return this._destSite.id;
      return this._profile && this._profile.downrange ? otherSite(this._site.id).id : "ship";   // i18n-ignore  site id
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
        if (this._freePlay) throw 0;
        $gameSystem._rocketLaunch = {
          site: this._site ? this._site.id : null,
          mode: this._profile ? this._profile.id : null,
          destination: this._destSite ? this._destSite.id : null,
          integrity: this._stage ? Math.round(this._stage.integrity * 10) / 10 : INTEGRITY_FLOOR,
          fare: this._fare || 0,
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
    // THE MOON, which is a world and not a map.
    //
    // Everything a landing means - the EVA suits, the life-signs roll, the
    // square of the Moon's own landing grid that the base stands on, the
    // descriptor every system downstream reads to know which world the party
    // is on - is GalaxySim's to set, and landAtSpaceport is the one route that
    // sets all of it. Called WITHOUT withShip, so nothing is parked on the
    // apron: the round put them there and the round is not a ship.
    _boardWorld(id) {
      const w = WORLDS[id];
      const loc = worldSite(id);
      if (!w || !loc) return false;
      try {
        const GS = window.GalaxySim;
        if (GS && typeof GS.landAtSpaceport === "function") {
          // EVERY RULE OF ARRIVING ON A WORLD IS GALAXYSIM'S, not this
          // plugin's: whether the air can be breathed and therefore whether
          // the suits go on, the life-signs roll, the square of that planet's
          // landing grid the base stands on, and the Alien biome everything
          // generated around it generates as. Titania's ocean is acid and the
          // Monument's air is breathable, and neither of those facts is
          // written here - they are the biome's, and they are applied by the
          // one routine that applies them everywhere else.
          const ok = GS.landAtSpaceport(loc, {
            planet: worldRecord(id),
            isMoon: !!w.isMoon,
            parentPlanet: w.parent || null,
            // WITHOUT THIS THE PAD IS AN ISLAND. The landing record decides
            // whether this map is a square of another world or a place on
            // Earth, and the only thing it had to go on was where the SHIP is
            // - which a rocket never moves. Filed under Sol it stopped being
            // offworld, which took the alien sky off it and, worse, took its
            // borders away: walking off the edge of the pad has to hand the
            // party the ground next door, and it can only do that if the pad
            // is known to be one square of that planet's landing grid.
            system: w.system,
          });
          if (ok) return true;
        }
      } catch (e) { /* fall through to the plain transfer below */ }
      // No GalaxySim in this build: the base is still a map and the party
      // still walks out onto it, without the suits or the world descriptor.
      try {
        $gamePlayer.reserveTransfer(loc.mapId, loc.x, loc.y, loc.dir || 2, 0);
        return true;
      } catch (e) { return false; }
    }

    _boardMoon() { return this._boardWorld("moon"); }   // i18n-ignore  world id

    _board() {
      // Nothing arrives anywhere in free play: the round is watched, not flown.
      if (this._freePlay) { this._leave(); return; }
      const explicit = this._destination;
      const dest = this._destSite;
      if (!explicit && dest && dest.body && WORLDS[dest.body]) {
        this._transferred = this._boardWorld(dest.body);
        this._leave();
        return;
      }
      const target = explicit || (dest ? SUBORBITAL_ARRIVAL[dest.id] : ORBITAL_ARRIVAL);

      try {
        // A pad with a map of its own - the starship, and the vault, whose
        // bore ends on Floor -3 and puts the party out INSIDE the vault rather
        // than on the lid of it.
        if (!explicit && target && target.mapId) {
          const vehicles = window.MergedVehicleSystem;
          if (vehicles && typeof vehicles.enterAirshipInterior === "function" &&
            target.mapId === ORBITAL_ARRIVAL.mapId) {
            vehicles.enterAirshipInterior({ silent: true });
          }
          $gamePlayer.reserveTransfer(target.mapId, target.x, target.y, target.dir || 8, 0);
          this._transferred = true;
          this._leave();
          return;
        }
        // A pad that is a world square: Apulia, Greenwich and the Omega Tower.
        // The square is built and the party walks out of the gun onto it.
        if (!explicit && dest && (dest.world.x || dest.world.y)) {
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
        const d = explicit || target || ORBITAL_ARRIVAL;
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
      if (this._freePlay) { SceneManager.pop(); return; }
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

  // How many launches this savegame has made. Kept on the game system so the
  // pass varies across a session and across a save, and falling back to a
  // module counter in a game that has no save loaded (the test harness).
  let _launchTally = 0;
  function nextLaunchSerial() {
    try {
      if (typeof $gameSystem !== "undefined" && $gameSystem) {
        $gameSystem._rocketLaunchSerial = ($gameSystem._rocketLaunchSerial || 0) + 1;
        return $gameSystem._rocketLaunchSerial;
      }
    } catch (e) { /* no save: the module counter below still varies the pass */ }
    return ++_launchTally;
  }

  // What each flight costs, in EUROS. The gun is not the expense: the stages
  // are, and a crossing throws all of them away. Edit here and nowhere else.
  const FARES = {
    // i18n-ignore-start  profile and world ids
    suborbital: 0,       // the bus, and the receiving gun pays most of it back
    deorbit: 200,        // falling is cheap: nothing is spent and nothing is shed
    orbital: 500,        // up to the ship, and only the boost stage is thrown away
    moon: 1200,          // one liminal engine, left in lunar orbit
    zeta: 2000,          // three of them, thrown away one after another
    titania: 3000,       // a liminal engine AND an SB jump drive - the dearest there is
    // i18n-ignore-end
  };

  // STORY MODE. The battle system reads switch 75 for this and there is no
  // other flag for it in the project, so this reads the same one - and it
  // reads it HERE and nowhere else in this file, so retargeting it is a line.
  const SW_STORY_MODE = 75;

  function storyMode() {
    try {
      return !!(typeof $gameSwitches !== "undefined" && $gameSwitches &&
        $gameSwitches.value(SW_STORY_MODE));
    } catch (e) { return false; }
  }

  // The fare for a flight, in euros. A crossing is priced by the WORLD it is
  // aimed at rather than by which of that world's three plans it flies: the
  // stages are the cost and every plan to a given world carries the same ones.
  function fareOf(profile, destId) {
    if (storyMode()) return 0;
    // THE VAULT IS ALWAYS FREE. A patron's square is not a destination the
    // party buys a seat to: whatever plan carries it there and whatever the
    // rest of the board costs, a flight aimed at the vault is flown for
    // nothing.
    if (destId === VAULT_SITE_ID) return 0;
    if (!profile) return 0;
    // A crossing is priced by the FURTHER of its two ends. Going out and
    // coming back are the same journey and throw away the same stages, so
    // Titania to Earth costs what Earth to Titania costs; "earth" itself is
    // not a fare, it is where the other end is measured from.
    if (profile.world) {
      const there = FARES[profile.world];
      const back = FARES[profile.fromWorld];
      const far = Math.max(there != null ? there : -1, back != null ? back : -1);
      if (far >= 0) return far;
    }
    // Everything else by its plan, with the pad-kind suffix taken off:
    // "orbitalAir" and "orbitalOrbit" are the same crossing as "orbital",
    // flown out from under a different sky.
    const base = String(profile.id || "").replace(/(Air|Orbit)$/, "");   // i18n-ignore  profile id suffixes
    if (FARES[base] != null) return FARES[base];
    return FARES[profile.id] != null ? FARES[profile.id] : 0;
  }

  // Euros are hundredths of the currency the party actually carries: the whole
  // game states prices in euros and holds gold (see MoneyFormatter).
  function fareGold(profile, destId) { return fareOf(profile, destId) * 100; }

  function partyGold() {
    try { return (typeof $gameParty !== "undefined" && $gameParty) ? $gameParty.gold() : 0; }
    catch (e) { return 0; }
  }

  function canAfford(profile, destId) { return partyGold() >= fareGold(profile, destId); }

  // Charged once, as the flight actually begins - not when the card opens, so
  // backing out of the selection costs nothing.
  function chargeFare(profile, destId) {
    const g = fareGold(profile, destId);
    if (g <= 0) return true;
    try {
      if ($gameParty.gold() < g) return false;
      $gameParty.loseGold(g);
      return true;
    } catch (e) { return true; }
  }

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

  // THE COMMAND NO LONGER TAKES AN ANSWER to either question. Which plan to
  // fly and where to come down are the player's, every time: an event page
  // that pinned them was an event page that could fly somebody to the Moon
  // without asking. Only the PAD is the event's to name, because the event is
  // standing on it.
  //
  // AND THE CARD ASKS THEM, not a message window on the map. The card has a
  // destination page with the pad, the flight plan, the hull cost and the
  // weather on it; a bare list of two names floating over the tileset before
  // the scene has even opened asks the same question with none of that in
  // front of the player, and asks it twice over if they back out. This used to
  // be invisible - an orbital flight off an Earth pad had exactly one place to
  // go, so the window never had two entries to show - and adding the Moon is
  // what brought it on screen. It is not brought on screen.
  // M IS NOT BOUND BY DEFAULT in RMMZ, so the launch scene binds it - once,
  // and only to a name of its own, so nothing else in the game that reads the
  // keyboard is disturbed by it. But something else HAS already claimed the
  // key: WorldMap.js binds 77 to a toggle of its own, so the name the launch
  // scene asked for was never the name the key was carrying and the chart
  // never opened. Whatever name is on the key IS the name the chart listens
  // for, and one is put there only if the key is still free.
  const MAP_BUTTON = (() => {
    if (typeof Input === "undefined" || !Input.keyMapper) return "map";   // i18n-ignore  input name
    if (!Input.keyMapper[77]) Input.keyMapper[77] = "map";                // i18n-ignore  input name
    return Input.keyMapper[77];
  })();

  PluginManager.registerCommand("RocketLaunchPlugin", "launch", (args) => {
    // i18n-ignore-start  arg values
    start({ site: args.site || "ask", mode: "ask", dest: "ask" });
    // i18n-ignore-end
  });

  PluginManager.registerCommand("RocketLaunchPlugin", "launchTo", (args) => {
    start({
      site: args.site || "ask",   // i18n-ignore  arg value
      mode: "ask",                // i18n-ignore  arg value: always the player's
      destination: {
        mapId: Number(args.mapId) || ORBITAL_ARRIVAL.mapId,
        x: Number(args.x) || 0,
        y: Number(args.y) || 0,
        dir: Number(args.dir) || 8,
      },
    });
  });

  window.Scene_RocketLaunch = Scene_RocketLaunch;

  // ==========================================================================
  // THE FLOOR THE SPLIT-OUT PARTS STAND ON
  // ==========================================================================
  //
  // The cinematic is four files: this one (the flight model, the vehicle, the
  // camera, the scene and the plugin commands), RocketLaunchSpaceports.js (the
  // guns and the ground), RocketLaunchBodies.js (the planets) and
  // RocketLaunchHUD.js (the instruments and the picker). They are parts of ONE
  // plugin and not plugins of their own: each either attaches to the stage
  // class or hands back a window class, and none of them does anything alone.
  //
  // Everything they need out of this file is handed over here, BY NAME, so
  // what crosses the seam is a list somebody can read rather than a scattering
  // of globals.
  const PARTS = {
    Stage: LaunchStage,
    registerUI(hud, card) {
      LaunchHud = hud;
      SiteCard = card;
      window.RocketLaunch.Hud = hud;
      window.RocketLaunch.Card = card;
    },
    K: {
      DOWNRANGE_VIS_M,
      DYSON_VIS_R,
      EARTH_VIS_R,
      HOP_ELEVATION,
      // Live, not captured: PSXHud may not be on window yet when this is built.
      get HUD() { return hudReady(); },
      HUD_BASE_W,
      KARMAN_M,
      KESSLER_IN_M,
      KESSLER_OUT_M,
      LIT_BEATS,
      MOON_BEARING,
      MOON_DIST_M,
      MOON_LAYER,
      MOON_R_M,
      MOON_SITE_ID,
      MOON_VIS_R,
      PROFILES,
      RAIL_LEN_M,
      RAIL_LOAD_Y,
      SE,
      SITES,
      altText,
      altitudeAt,
      availableProfiles,
      availableSites,
      clamp,
      clamp01,
      clockText,
      crossing,
      descentFrom,
      destinationsFor,
      earthGone,
      fareText,
      greatCircleM,
      hashOf,
      hazardSeverity,
      hudReady,
      integrityAt,
      lerp,
      loadYOf,
      lunarProfileFrom,
      makeRng,
      modeBlurb,
      modeName,
      nearestSite,
      onLayer,
      otherSite,
      pctText,
      phaseAt,
      ramp,
      refreshVaultSite,
      se,
      siteBlurb,
      siteName,
      smooth,
      speedText,
      start,
      t,
      tapeBands,
      tapeFraction,
      weatherLabel,
      HOME_SKY,
      worldRecord,
      worldSystem,
    },
  };

  window.RocketLaunch = {
    name: PLUGIN_FILE,
    start,
    SITES,
    SITE_ORDER,
    VAULT_SITE_ID,
    activeSites,
    siteName,
    availableSites,
    availableProfiles,
    destinationsFor,
    earthGone,
    descentFrom,
    refreshVaultSite,
    vaultReady,
    geoOfWorld,
    usableSite,
    PROFILES,
    PROFILE_ORDER,
    ORBITAL_ARRIVAL,
    SUBORBITAL_ARRIVAL,
    MOON_ARRIVAL,
    MOON_SITE_ID,
    HOP_ELEVATION,
    LIMINAL_LEN,
    MOON_VIS_R,
    MOON_BEARING,
    moonSite,
    moonRecord,
    lunarProfileFrom,
    crossingProfile,
    padKind,
    orbitalId,
    fareOf,
    fareGold,
    storyMode,
    canAfford,
    lunarTo,
    Radio,
    VOICE_OF,
    BGM,
    pickTrack,
    CUES: {
      orbital: ORBITAL_CUES, suborbital: SUBORBITAL_CUES, deorbit: DEORBIT_CUES,
      lunar: LUNAR_CUES, lunarOrbit: LUNAR_ORBIT_CUES,
    },
    cuesFor,
    MODEL,
    Scene: Scene_RocketLaunch,
    // The 3D stage, the HUD and the selection card, published so the test
    // suite can build them against a headless THREE and step a whole flight
    // without a GPU.
    Stage: LaunchStage,
    Hud: null,        // filled in by RocketLaunchHUD.js
    Card: null,       // filled in by RocketLaunchHUD.js
    parts: PARTS,
    sampleEnvironment,
    nearestSite,
    // The scene keeps what the last flight cost; the ship's own systems read
    // it from here rather than digging into $gameSystem.
    lastFlight() {
      try { return $gameSystem._rocketLaunch || null; } catch (e) { return null; }
    },
  };
})();
