/*:
 * @target MZ
 * @plugindesc The deicide intro movie: Em's golden light construct kills God over the curvature of the Earth, before a new story's character creation.
 * @author OmniLex
 * @help StartinMovie.js
 *
 * A two minute three.js movie, cut to the New World symphony, that plays every
 * time a new story is begun, before the creation wizard. Any button, a click
 * or a tap skips it.
 *
 * The night of 31 December 2000: a giant made of light, wearing Em's face,
 * climbs out of the Omega Tower and takes its first steps on the curvature of
 * the Earth. The heavens split and God unfolds, a living hypertriangle, the
 * same five-cell that turns in the corner of every loading screen. He burns
 * her with holy light and she bleeds; she answers with a GenericFireball, then
 * pulls the Spear of Memories out of her own chest, a double helix of
 * everything she was, and throws it. It grazes the Moon on the way and goes
 * through his eye. He tries to become stone, fails, and rots into an
 * impossible triangle of flesh that is still orbiting the Earth. The giant
 * breaks into shards and Em falls.
 *
 * Both bodies are Em's own dossier model on its own HumanoidRig, the one on the
 * altar as she ships (creation has not dressed her yet), playing the
 * rig's idle, walk, sit and fall with the movie's beats laid over them. The
 * rest of the picture is a function of the movie clock, which is read off the
 * music itself, so a replay is the same moment drawn again and the picture
 * never drifts from the band.
 *
 * @command play
 * @text Play the intro movie
 * @desc Plays the intro movie over the current scene and returns to it.
 */

(() => {
    "use strict";
    // i18n-ignore-start  this file's literals are asset paths, sound effect
    // and bone names and GLSL; everything the player reads goes through T().

    const PLUGIN = "StartinMovie";

    //=========================================================================
    // The score
    //=========================================================================
    const TRACK = "Classical/Antonin Dvorak - symphony no. 9 in e minor 'from the new world', op. 95 - iv. al";
    const EM_MODEL = "models/Em.glb";
    const EARTH_MAP = "img/pictures/Planets/Earth.jpg";
    const MOON_MAP = "img/pictures/Planets/Moon.jpg";
    const JUPITER_MAP = "img/pictures/Planets/Jupiter.jpg";
    const SATURN_MAP = "img/pictures/Planets/Saturn.jpg";

    // The movie is the opening of the finale of the New World symphony, from
    // its first chord: the fortissimo opening and the main theme for the ritual
    // and the giant forming, the hush after it for God, the second build for
    // the fight, the near-silence before the hit at 1:16 for the throw, the dip
    // for the flight, the hit at 1:27.6 for the impact, the last chords for the
    // fall, and the drop into the clarinet theme for the dawn. The title comes
    // up at 1:49 and the music fades out under it. Measured off the file.
    const START_OFFSET = 0;
    const TRACK_SECONDS = 702.9;
    const BPM = 71.75;
    const BEAT0 = 0.54;
    const DURATION = 117;
    // The band plays the whole movie; past the title it fades.
    const MUSIC_END = DURATION;
    const LOAD_TIMEOUT = 15;
    const CUE_TIMEOUT = 6;

    function beat(n) { return BEAT0 + n * 60 / BPM; }
    function beatsBetween(a, b) {
        const out = [];
        for (let n = Math.ceil((a - BEAT0) * BPM / 60); beat(n) <= b; n++) out.push(beat(n));
        return out;
    }

    // Every moment the picture is cut to, in movie seconds. Each one is an
    // accent measured on the recording.
    const CUE = {
        cardDate: 0.3, cardTime: 4.5,
        // Stonehenge: the three blades, the blood, the seal, the pillar.
        impale: 2.63, spit: 9.79, dead: 10.6,
        seal: 10.9, pillar: 11.85, dissolve: 12.3, shootUp: 14.0, arc: 15.6,
        // The light comes down on the Omega Tower and she climbs out of it,
        // bones first, the rest of her forming as she walks.
        towerHit: 17.33, rise: 18.91, stand: 26.47, gold: 32.95, hush: 40.9, eyesOpen: 43.2,
        tear: 44.87, godIn: 46.13, eye: 51.37,
        holyRay: 54.64, rayHit: 55.0,
        judgment: 56.33, judgmentHit: 56.8,
        holyPillars: 58.0, pillarsHit: 58.6,
        annihilation: 59.65, annihilationHit: 60.1,
        fireball: 61.25, fireballRelease: 62.0, fireballHit: 62.94,
        gun: 63.8, dice: 64.6, diceLand: 66.2, form: 66.98, barrage: 68.57, jump: 69.79, formHit: 71.0,
        spear: 71.6, helixDone: 73.8, windUp: 75.0, release: 76.0,
        graze: 81.8, silence: 86.4, impact: 87.6,
        deep: 89.2, jupiter: 90.0, ringCross: 92.4, saturnHit: 92.5,
        statue: 93.6, rot: 95.0, shatter: 96.5, pitBreak: 97.4, fall: 98.0,
        flash: 104.0, title: 109.0, end: DURATION
    };

    // A moment inside the dice's answer, as a fraction of the time between the
    // form appearing and its last blow landing.
    function inForm(k) { return CUE.form + k * (CUE.formHit - CUE.form); }

    // Seventeen artifact weapons, each one a different piece the weapon system
    // forges on the spot, falling out of the night one after another on the
    // half-beats of the opening and driven into her where she lies. Each has
    // the part of her it strikes, a small offset there (metres, in the plane of
    // the stone), the bearing it comes in from and how steeply it falls.
    const STAB_ROLES = ["chest", "lUpperLeg", "rUpperArm", "hips", "lLowerArm", "upperChest", "rUpperLeg", "lUpperArm",
        "spine", "rLowerLeg", "lHand", "neck", "rLowerArm", "lLowerLeg", "rHand", "lFoot", "rFoot"];
    // Weapon types (database wtypeId) dealt round the seventeen: blades,
    // spears, axes, maces, claws, staves and thrown knives.
    const STAB_TYPES = [12, 2, 1, 4, 3, 10, 6, 8, 2, 12, 1, 4, 3, 10, 6, 8, 2];
    const STAB_LENGTH = { 1: 0.45, 2: 1.1, 3: 1.0, 4: 0.9, 6: 1.7, 8: 0.6, 10: 0.5, 12: 2.1 };
    const STABS = STAB_ROLES.map((role, i) => ({
        at: BEAT0 + (5 + i) * 30 / BPM,
        role,
        wtype: STAB_TYPES[i],
        aim: [((i * 37) % 9 - 4) * 0.012, ((i * 53) % 7 - 3) * 0.015],
        bearing: i * 2.39996,
        fall: 0.85 + ((i * 29) % 10) * 0.05
    }));

    // The body she is built in, layer on layer, as she climbs out and walks.
    const LAYERS = {
        bones: [CUE.rise, CUE.rise + 1.5, CUE.gold + 1.5, CUE.gold + 4],
        veins: [CUE.rise + 3, CUE.stand + 2.5, CUE.gold + 2, CUE.gold + 4.5],
        nerves: [CUE.stand - 1, CUE.stand + 4, CUE.gold + 2, CUE.gold + 4.5],
        muscles: [CUE.stand + 1, CUE.stand + 6.5, CUE.gold + 2.5, CUE.hush],
        skin: [CUE.gold - 0.4, CUE.hush - 0.5]
    };

    // Where God's light lands on the giant: every one draws blood.
    const HITS = [
        { at: CUE.rayHit, bone: "lUpperArm", depth: 0.05, lift: 0.02 },
        { at: CUE.judgmentHit, bone: "upperChest", depth: 0.11, lift: 0.04 },
        { at: CUE.pillarsHit, bone: "rUpperArm", depth: 0.05, lift: 0.0 },
        { at: CUE.annihilationHit, bone: "head", depth: 0.09, lift: -0.03 }
    ];

    // The Dice of Yaldabaoth decides how she answers him: its face is the
    // vector gun's form on that face (VectorGun.DICE_FACES), 1 the Fists of
    // Em, 20 the Grimoire of Solomon read as Graceful Death. Rolled afresh
    // every time the movie plays.
    function rollFace() { return 1 + Math.floor(Math.random() * 20); }
    function variantFor(face) {
        const VG = window.VectorGun;
        const faces = VG && VG.DICE_FACES;
        const n = Math.max(1, Math.min(20, Math.floor(face) || 1));
        const key = (faces && faces[n - 1]) || (n === 1 ? "fists" : n === 20 ? "solomon" : null);
        const row = key && VG && VG.FORM_MODES ? VG.FORM_MODES[key] : null;
        let kind = "melee";
        if (n === 1) kind = "fists";
        else if (n === 20) kind = "grimoire";
        else if (row && (row.shoots || (row.range || 0) >= 4)) kind = "ranged";
        return { face: n, key, kind };
    }

    // The name of every attack, shown at the top of the screen as it is cast:
    // God's own spells, then whatever the dice gave her.
    const LABELS = [
        { key: "holyRay", at: CUE.holyRay, by: "god" },
        { key: "judgment", at: CUE.judgment, by: "god" },
        { key: "holyPillars", at: CUE.holyPillars, by: "god" },
        { key: "divineAnnihilation", at: CUE.annihilation, by: "god" },
        { key: "genericFireball", at: CUE.fireball, by: "em" },
        { key: "spearOfMemories", at: CUE.spear, by: "em" }
    ];
    function labelsFor(variant) {
        const out = LABELS.slice();
        out.push({ text: "VectorGun.title", at: CUE.gun, by: "em" });
        out.push({ text: "VectorGun.shape.dice.name", at: CUE.dice, by: "em" });
        if (variant && variant.key) out.push({ text: "VectorGun.shape." + variant.key + ".name", at: CUE.form, by: "em" });
        if (variant && variant.kind === "grimoire") out.push({ text: "Battle.hyper.name.grimoire", at: CUE.barrage, by: "em" });
        if (variant && variant.kind === "fists") out.push({ key: "holyRay", at: CUE.barrage, by: "god" });
        return out.sort((x, y) => x.at - y.at);
    }
    const LABEL_HOLD = 2.0;

    // The title cards.
    const CARDS = [
        { key: "newYear", from: 110.5, to: 116.5, low: true }
    ];

    // The edit. `time` remaps the movie clock onto the world's clock for a
    // replay or a slow motion: [from, to] at the start and the end of the
    // shot, eased when `ease` says so.
    const SHOTS = [
        { from: 0, to: 2.6, scene: "henge", cam: "hengeWide" },
        { from: 2.6, to: 4.6, scene: "henge", cam: "hengeAltar" },
        { from: 4.6, to: 6.4, scene: "henge", cam: "stab", stab: 5 },
        { from: 6.4, to: 7.8, scene: "henge", cam: "stab", stab: 10 },
        { from: 7.8, to: 9.4, scene: "henge", cam: "stab", stab: 14 },
        { from: 9.4, to: 10.6, scene: "henge", cam: "spitBlood" },
        { from: 10.6, to: 11.85, scene: "henge", cam: "sealWide" },
        { from: 11.85, to: 14.0, scene: "henge", cam: "pillarDown" },
        { from: 14.0, to: 15.6, scene: "henge", cam: "pillarUp" },
        { from: 15.6, to: 18.91, scene: "main", cam: "lightArc" },
        { from: 18.91, to: 22.0, scene: "main", cam: "emerge" },
        { from: 22.0, to: 26.47, scene: "main", cam: "groundUp" },
        { from: 26.47, to: 30.45, scene: "main", cam: "layersClose" },
        { from: 30.45, to: 32.95, scene: "main", cam: "face" },
        { from: 32.95, to: 36.51, scene: "main", cam: "standWide" },
        { from: 36.51, to: 40.9, scene: "main", cam: "crowdUp" },
        { from: 40.9, to: 43.5, scene: "cockpit", cam: "pitWide" },
        { from: 43.5, to: 44.87, scene: "cockpit", cam: "pitFace" },
        { from: 44.87, to: 47.5, scene: "main", cam: "overShoulder" },
        { from: 47.5, to: 50.0, scene: "main", cam: "godReveal" },
        { from: 50.0, to: 51.37, scene: "main", cam: "standoff" },
        { from: 51.37, to: 54.64, scene: "main", cam: "godEye" },
        { from: 54.64, to: 55.8, scene: "main", cam: "rayWide" },
        { from: 55.8, to: 56.33, scene: "main", cam: "rayReplay", time: [54.9, 55.2] },
        { from: 56.33, to: 58.0, scene: "main", cam: "judgment" },
        { from: 58.0, to: 59.2, scene: "main", cam: "pillars" },
        { from: 59.2, to: 59.65, scene: "cockpit", cam: "pitAlarm" },
        { from: 59.65, to: 60.5, scene: "main", cam: "annihilationWide" },
        { from: 60.5, to: 61.25, scene: "main", cam: "bleedFace" },
        { from: 61.25, to: 62.0, scene: "main", cam: "palm" },
        { from: 62.0, to: 62.94, scene: "main", cam: "fireChase" },
        { from: 62.94, to: 63.8, scene: "main", cam: "fireBurst" },
        { from: 63.8, to: 64.6, scene: "main", cam: "gunForm" },
        { from: 64.6, to: 66.98, scene: "main", cam: "diceRoll" },
        { from: 66.98, to: 68.57, scene: "main", cam: "formReveal" },
        { from: 68.57, to: 69.79, scene: "main", cam: "formAttack" },
        { from: 69.79, to: 71.0, scene: "main", cam: "formClose" },
        { from: 71.0, to: 71.6, scene: "main", cam: "formImpact" },
        { from: 71.6, to: 72.6, scene: "cockpit", cam: "pitSpear" },
        { from: 72.6, to: 73.8, scene: "main", cam: "headSpear" },
        { from: 73.8, to: 75.0, scene: "cockpit", cam: "pitTears" },
        { from: 75.0, to: 76.0, scene: "main", cam: "memories" },
        { from: 76.0, to: 77.64, scene: "main", cam: "throwWide" },
        { from: 77.64, to: 79.69, scene: "main", cam: "throwLow", time: [75.4, 76.6] },
        { from: 79.69, to: 82.5, scene: "main", cam: "spearPov" },
        { from: 82.5, to: 86.4, scene: "main", cam: "approach", time: [82.5, 87.0], ease: "out" },
        { from: 86.4, to: 87.6, scene: "main", cam: "eyeHold", time: [87.0, 87.58], ease: "out" },
        { from: 87.6, to: 89.2, scene: "main", cam: "impactWide" },
        { from: 89.2, to: 91.0, scene: "deep", cam: "spearCruise" },
        { from: 91.0, to: 92.5, scene: "deep", cam: "saturnApproach" },
        { from: 92.5, to: 93.6, scene: "deep", cam: "saturnBlast" },
        { from: 93.6, to: 95.0, scene: "main", cam: "statue" },
        { from: 95.0, to: 96.5, scene: "main", cam: "corpseOrbit" },
        { from: 96.5, to: 97.4, scene: "main", cam: "shatter" },
        { from: 97.4, to: 98.0, scene: "cockpit", cam: "pitBreak" },
        { from: 98.0, to: 100.9, scene: "main", cam: "fallBelow", fall: true },
        { from: 100.9, to: 104.0, scene: "main", cam: "fallAbove", fall: true },
        { from: 104.0, to: DURATION, scene: "main", cam: "dawn" }
    ];

    // Every sound effect a little under the volume written for it.
    const SFX_GAIN = 0.8;

    // The sound effects, on movie time: [time, file in audio/se, volume, pitch].
    function sfxFor(variant) {
        const out = [
            [CUE.spit, "Water1", 70, 60], [CUE.dead, "Darkness3", 70, 70], [CUE.seal, "Magic7", 80, 80],
            [CUE.pillar, "Saint5", 90, 80], [CUE.dissolve, "Absorb2", 80, 90], [CUE.shootUp, "Teleport", 90, 70],
            [CUE.shootUp + 0.1, "Up4", 80, 80], [CUE.towerHit, "Thunder9", 95, 70], [CUE.towerHit + 0.05, "Explosion2", 80, 55],
            [CUE.rise, "Earth5", 80, 60], [CUE.gold, "Saint9", 90, 80],
            [CUE.eyesOpen, "Magic3", 50, 120], [CUE.tear, "Thunder12", 90, 60], [CUE.godIn, "Darkness8", 85, 60],
            [CUE.eye, "Bell3", 85, 60],
            [CUE.holyRay, "Saint2", 85, 90], [CUE.rayHit, "Laser2", 85, 80], [CUE.rayHit + 0.05, "Blow7", 80, 70],
            [CUE.judgment, "Thunder7", 85, 80], [CUE.judgmentHit, "Explosion1", 85, 80],
            [CUE.holyPillars, "Saint7", 85, 90], [CUE.pillarsHit, "Blow8", 85, 70], [CUE.holyPillars + 1.2, "Siren", 60, 100],
            [CUE.annihilation, "Saint9", 90, 70], [CUE.annihilationHit, "Explosion3", 90, 80],
            [CUE.fireball, "Fire3", 85, 90], [CUE.fireballRelease, "Fire8", 90, 80], [CUE.fireballHit, "Explosion2", 95, 75],
            [CUE.gun, "Powerup", 85, 90], [CUE.dice, "Evasion1", 80, 90], [CUE.dice + 0.8, "Item1", 60, 120],
            [CUE.dice + 1.6, "Item1", 60, 110], [CUE.diceLand, "Bell1", 90, 100], [CUE.form, "Magic_Transformation03", 90, 90],
            [CUE.formHit, "Explosion4", 100, 80],
            [CUE.spear, "Magic_Spells_CastLong_Water_General05", 90, 80], [CUE.spear + 0.1, "Darkness6", 70, 70],
            [CUE.helixDone, "Heal5", 70, 80], [CUE.windUp, "Starlight", 85, 80], [CUE.release, "Wind7", 95, 80],
            [CUE.release + 0.05, "Skill3", 90, 70], [CUE.release + 1.64, "Wind7", 80, 60],
            [CUE.graze, "Collapse3", 90, 70], [CUE.graze + 0.05, "Explosion1", 80, 60],
            [CUE.silence - 1.2, "Magic10", 75, 60], [CUE.impact - 0.4, "Break", 85, 70], [CUE.impact - 0.08, "Ice11", 95, 60],
            [CUE.impact, "Explosion3", 100, 70], [CUE.impact + 0.05, "Thunder13", 100, 60],
            [CUE.deep, "Wind9", 85, 70], [CUE.jupiter, "Thunder5", 80, 70], [CUE.ringCross, "Crash", 85, 70],
            [CUE.saturnHit, "Explosion4", 100, 60], [CUE.statue, "Ice6", 70, 60], [CUE.statue + 1.0, "Break", 80, 60],
            [CUE.rot, "Water5", 70, 50], [CUE.rot + 0.1, "Monster7", 70, 50],
            [CUE.shatter, "Collapse1", 90, 70], [CUE.shatter + 0.05, "Crash", 80, 60], [CUE.pitBreak, "Ice11", 80, 80],
            [CUE.fall, "Wind9", 80, 80], [CUE.title, "Bell2", 70, 70]
        ];
        for (let t = CUE.stand; t < CUE.hush; t += 2.5) out.push([t, "Earth3", 70, 60]);
        STABS.forEach((st, i) => {
            out.push([st.at - 0.12, "Wind" + (1 + (i * 3) % 11), 25, 120 + (i * 7) % 30]);
            out.push([st.at, "Slash" + (1 + (i * 3) % 10), 45, 70 + (i * 7) % 40]);
            out.push([st.at + 0.04, "Blow" + (1 + (i * 7) % 10), 35, 60 + (i * 5) % 30]);
        });
        beatsBetween(CUE.impact + 0.5, CUE.fall).forEach((t, i) => { if (i % 2) out.push([t, "Explosion2", 60, 60 + (i * 7) % 40]); });
        const k = variant && variant.kind;
        // Every blow as it leaves her, and the Moon taking it.
        const atk = attackFor(variant);
        if (atk) {
            strikesFor(variant).forEach((st) => {
                if (atk.throw === "crescent") out.push([st.t, "Slash" + (1 + (st.i * 3) % 10), 85, 70 + (st.i * 7) % 30]);
                else if (atk.throw === "streak" && atk.motion !== "read") out.push([st.t, atk.motion === "draw" ? "Bow1" : "Shot2", 85, 75]);
                if (atk.motion !== "read" || st.i % 3 === 0) out.push([st.arrive, "Blow" + (1 + (st.i * 7) % 10), 80, 55 + (st.i * 5) % 20]);
                if (atk.scar.grind) out.push([st.arrive + 0.1, "Earth3", 80, 120]);
            });
        }
        if (k === "fists") {
            DEFLECTS.forEach((t) => out.push([t, "Blow5", 95, 80]));
            out.push([CUE.jump, "Wind7", 90, 70], [CUE.formHit - 0.05, "Blow10", 100, 70]);
        }
        if (k === "grimoire") {
            out.push([CUE.barrage, "Magic12", 95, 80], [CUE.barrage + 0.05, "Saint8", 90, 70]);
            for (let t = CUE.barrage + 0.6; t < CUE.spear - 0.4; t += 0.55) out.push([t, "Magic4", 70, 70 + Math.round((t * 13) % 40)]);
        }
        return out.sort((a, b) => a[0] - b[0]);
    }

    function shotAt(t) {
        for (let i = 0; i < SHOTS.length; i++) {
            if (t < SHOTS[i].to) return SHOTS[i];
        }
        return SHOTS[SHOTS.length - 1];
    }

    // The world's clock for movie time t.
    function worldTime(t) {
        const s = shotAt(t);
        if (!s.time) return t;
        const u = clamp01((t - s.from) / (s.to - s.from));
        const k = s.ease === "out" ? 1 - Math.pow(1 - u, 3) : u;
        return s.time[0] + (s.time[1] - s.time[0]) * k;
    }

    //=========================================================================
    // Small maths
    //=========================================================================
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function smooth(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }
    function span(t, a, b) { return clamp01((t - a) / (b - a)); }
    // 0 outside [a, d], 1 inside [b, c], eased in between.
    function window4(t, a, b, c, d) { return smooth(span(t, a, b)) * (1 - smooth(span(t, c, d))); }
    function decay(t, at, rate) { return t < at ? 0 : Math.exp(-(t - at) * rate); }
    function easeOutBack(x) { const c = 1.7; const y = x - 1; return 1 + (c + 1) * y * y * y + c * y * y; }
    function rng(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    // One particle's own random stream. Clouds are redrawn from scratch every
    // frame; drawn from one shared stream, a particle that is dead this frame
    // would shift the values of every particle after it and the whole cloud
    // would reshuffle each time one is born or dies.
    function pr(seed, i) { return rng((seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0); }

    // How hard the last of God's hits is still shaking things.
    function hitShake(τ) {
        let s = 0;
        HITS.forEach((h) => { s = Math.max(s, decay(τ, h.at, 3.2)); });
        s = Math.max(s, decay(τ, CUE.impact, 1.4), decay(τ, CUE.fireballHit, 3) * 0.6);
        return s;
    }

    //=========================================================================
    // The giant's and the pilot's bodies
    //=========================================================================
    // Both bodies are Em's own dossier figure moved by its own HumanoidRig:
    // the rig plays its idle, walk, sit and fall loops, and the movie lays its
    // beats (a flinch, the cast, the pull, the throw) over the pose the rig
    // has just eased into, in the rig's own terms: { role: [x, y, z] } in
    // degrees, model axes.
    function addTo(p, role, x, y, z) {
        const r = p[role] || (p[role] = [0, 0, 0]);
        r[0] += x || 0; r[1] += y || 0; r[2] += z || 0;
    }
    function standPose(p, drop, elbow) {
        addTo(p, "lUpperArm", 0, 0, -drop);
        addTo(p, "rUpperArm", 0, 0, drop);
        addTo(p, "lLowerArm", 0, -elbow, 0);
        addTo(p, "rLowerArm", 0, elbow, 0);
    }
    function blendArm(p, side, x, y, z, ex, w) {
        if (w <= 0) return;
        const up = side + "UpperArm", lo = side + "LowerArm";
        const a = p[up] || [0, 0, 0], b = p[lo] || [0, 0, 0];
        p[up] = [lerp(a[0], x, w), lerp(a[1], y, w), lerp(a[2], z, w)];
        p[lo] = [lerp(b[0], 0, w), lerp(b[1], ex, w), lerp(b[2], 0, w)];
    }
    function flinch(p, τ) {
        HITS.forEach((h) => {
            const k = (τ - h.at) / 0.9;
            if (k < 0 || k > 1) return;
            const f = Math.sin(Math.min(1, k * 2.5) * Math.PI / 2) * (1 - k);
            addTo(p, "spine", -10 * f, 0, 4 * f);
            addTo(p, "chest", -7 * f, 6 * f, 0);
            addTo(p, "head", -14 * f, -8 * f, 6 * f);
            addTo(p, "lUpperArm", -24 * f, 0, 16 * f);
            addTo(p, "rUpperArm", -24 * f, 0, -16 * f);
        });
    }

    // Runs the rig's own loop for dt, then writes the movie's beats over the
    // pose it eased into. The rig's hair and skirt physics run with it.
    function driveRig(rig, loop, dt, layers) {
        rig.play(loop);
        // The rig's own update eases the loop and lays its one-shots (a shot,
        // a swing) over it: that pose is caught rather than drawn, the
        // movie's beats go over it, and only then is it applied and the hair
        // and skirt run, so they swing against the pose that is on screen.
        const apply = rig.apply, physics = rig.physics;
        let caught = null, off = [0, 0, 0];
        rig.apply = (p, o) => { caught = p; off = o; };
        rig.physics = null;
        try { rig.update(dt); } finally { rig.apply = apply; rig.physics = physics; }
        const pose = caught || {};
        if (!caught) Object.keys(rig.cur).forEach((role) => { pose[role] = rig.cur[role].slice(); });
        layers(pose);
        apply.call(rig, pose, off || rig.curOff);
        if (physics && dt > 0) physics.update(dt);
        return pose;
    }
    // A fresh rig starts in the T-pose the file was exported in: a second of
    // its loop first, so the first frame is already standing (or sitting).
    function settleRig(rig, loop) {
        rig.play(loop);
        for (let i = 0; i < 40; i++) rig.update(1 / 30);
    }

    // Which of the rig's loops each body is playing at τ.
    function giantLoop(τ) {
        return τ >= CUE.stand && τ < CUE.hush - 0.4 ? "walk" : "idle";
    }
    function pilotLoop(τ, where) {
        if (where === "fall") return "fall";
        if (where === "altar") return "death";
        return "sit";
    }

    // The beats of the katana's cuts, as fractions of the form's window (inForm).
    const SWINGS = [0.347, 0.611, 0.889];
    // God's beams she knocks aside with her fists, on a natural 1.
    const DEFLECTS = [0.306, 0.417, 0.528, 0.639].map(inForm);

    // How each of the dice's forms attacks, every one its own way. None of it
    // reaches him: the Moon stands between them, and whatever she sends at
    // him strikes the Moon and only cuts its face.
    //   motion  the arm work it is swung, shot or thrown with (strikeMotion)
    //   hits    when each blow leaves her, as fractions of the form's window
    //   throw   what crosses the sky: "crescent" (the edge, sent on), "streak"
    //           (what it shoots), "none" (she goes herself)
    //   size    the crescent's size, or the streak's
    //   roll    the crescent's tilt (radians); "alt" tilts it the other way on
    //           every other blow
    //   scar    the cut on the Moon: `n` lines `len` long and `w` wide (radians
    //           of the Moon), laid "single", "parallel", "star", "scatter" or
    //           "ring"; `grind` carves it slowly, over that many seconds
    const FORM_ATTACKS = {
        fists: { motion: "leap", hits: [1], throw: "none", scar: { n: 4, len: 0.5, w: 0.035, lay: "star" } },
        aiwass: { motion: "draw", hits: [0.3, 0.56, 0.82], throw: "streak", size: 14, trail: 0.3, scar: { n: 2, len: 0.14, w: 0.025, lay: "star" } },
        freud: { motion: "iai", hits: SWINGS, throw: "crescent", flat: true, size: 1, scar: { n: 1, len: 0.7, w: 0.025 } },
        gautama: { motion: "pray", hits: [0.35, 0.62, 0.9], throw: "streak", size: 12, trail: 0.06, scar: { n: 8, len: 0.05, w: 0.04, lay: "ring" } },
        abrasax: { motion: "stab", hits: [0.25, 0.38, 0.51, 0.64, 0.77, 0.9], throw: "streak", size: 11, trail: 0.15, scar: { n: 1, len: 0.16, w: 0.03 } },
        zos: { motion: "throw", hits: [0.3, 0.5, 0.7, 0.9], throw: "streak", size: 8, trail: 0.1, scar: { n: 3, len: 0.07, w: 0.025, lay: "scatter" } },
        nuit: { motion: "lash", hits: [0.33, 0.6, 0.88], throw: "crescent", size: 1.6, thin: true, roll: "alt", scar: { n: 1, len: 0.9, w: 0.018 } },
        bubba: { motion: "overhead", hits: [0.4, 0.85], throw: "crescent", size: 1.1, roll: Math.PI / 2, scar: { n: 1, len: 0.45, w: 0.05 } },
        choronzon: { motion: "slam", hits: [0.5, 0.95], throw: "crescent", size: 1.3, roll: Math.PI / 2, scar: { n: 3, len: 0.38, w: 0.05, lay: "star" } },
        babalon: { motion: "chop", hits: [0.3, 0.6, 0.9], throw: "crescent", size: 1.1, roll: "alt", scar: { n: 1, len: 0.5, w: 0.04 } },
        hadit: { motion: "twirl", hits: [0.55, 0.75, 0.95], throw: "streak", size: 24, trail: 0.2, scar: { n: 3, len: 0.2, w: 0.03, lay: "star" } },
        kia: { motion: "jab", hits: [0.25, 0.4, 0.55, 0.7, 0.85], throw: "streak", size: 34, trail: 0.05, scar: { n: 3, len: 0.12, w: 0.04, lay: "star" } },
        longinus: { motion: "lunge", hits: [0.42, 0.88], throw: "streak", size: 18, trail: 0.45, scar: { n: 1, len: 0.32, w: 0.05 } },
        baphomet: { motion: "claw", hits: [0.3, 0.6, 0.9], throw: "crescent", size: 0.9, claws: 3, roll: "alt", scar: { n: 3, len: 0.45, w: 0.02, lay: "parallel" } },
        maat: { motion: "spin", hits: [0.45, 0.9], throw: "crescent", size: 1.4, roll: 0, scar: { n: 1, len: 0.65, w: 0.04 } },
        thelema: { motion: "sweep", hits: [0.3, 0.55, 0.8], throw: "crescent", size: 1.1, roll: "alt", scar: { n: 1, len: 0.55, w: 0.03 } },
        eris: { motion: "flurry", hits: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], throw: "crescent", size: 0.55, roll: "alt", scar: { n: 1, len: 0.22, w: 0.02 } },
        yaldabaoth: { motion: "rev", hits: [0.4], throw: "crescent", size: 0.9, spin: true, scar: { n: 1, len: 0.85, w: 0.05, grind: 1.6 } },
        nyarlathotep: { motion: "reap", hits: [0.45, 0.95], throw: "crescent", size: 2.0, roll: 0.15, scar: { n: 1, len: 1.0, w: 0.03 } },
        solomon: { motion: "read", hits: [], throw: "streak", size: 20, trail: 0.1, scar: { n: 1, len: 0.05, w: 0.045 } }
    };
    function attackFor(variant) {
        if (!variant) return null;
        return FORM_ATTACKS[variant.key] || (variant.kind === "grimoire" ? FORM_ATTACKS.solomon
            : variant.kind === "fists" ? FORM_ATTACKS.fists : FORM_ATTACKS.thelema);
    }
    // How long each kind of blow takes to cross to the Moon.
    const FLIGHT = { crescent: 0.5, streak: 0.35, none: 0 };
    // Every blow of the form: when it leaves her and when the Moon takes it.
    // The Grimoire's are the pages of Graceful Death that strike home.
    function strikesFor(variant) {
        const atk = attackFor(variant);
        if (!atk) return [];
        let times = atk.hits.map(inForm);
        if (atk.motion === "read") {
            times = [];
            for (let i = 0; i < 16; i++) times.push(CUE.barrage + 0.6 + i * (CUE.formHit - CUE.barrage - 0.6) / 16);
        }
        return times.map((t, i) => ({ t, i, arrive: t + FLIGHT[atk.throw] }));
    }
    function strikesOf(variant) { return variant.strikes || (variant.strikes = strikesFor(variant)); }

    // Her right arm's poses for the forms, [x, y, z, elbow]; the left arm
    // takes the same ones mirrored.
    const ARM = {
        aim: [-12, 82, 6, 12], high: [0, 20, -150, 10], cocked: [-20, -10, -140, 90],
        low: [0, 75, 55, 5], back: [-20, -60, 30, 20], across: [-10, 120, 10, 10],
        chamber: [0, 20, 60, 110], pull: [-10, 50, -5, 140], loose: [-10, 40, 10, 20],
        wideBack: [-20, -80, -40, 20], wideAcross: [0, 130, 40, 10],
        diagHigh: [0, -20, -120, 30], diagLow: [0, 110, 45, 5], out: [0, 10, -10, 0],
        palms: [-20, 95, 20, 100], push: [-20, 90, 5, 30], brace: [-10, 100, 20, 60],
        ready: [-30, 40, -40, 60], couch: [-10, 30, 20, 100]
    };
    function armTo(p, side, from, to, k, w) {
        const m = side === "l" ? -1 : 1;
        blendArm(p, side, lerp(from[0], to[0], k), m * lerp(from[1], to[1], k), m * lerp(from[2], to[2], k), m * lerp(from[3], to[3], k), w);
    }

    // One blow of a form, round the moment `t` it leaves her: each form's
    // own way of bringing it round.
    function strikeMotion(p, τ, motion, t, i) {
        const alt = i % 2 === 1;
        const sign = alt ? -1 : 1;
        // In over `lead` seconds, through, and out over `after`.
        const W = (lead, after) => window4(τ, t - lead, t - lead * 0.6, t + after * 0.4, t + after);
        const C = (lead) => smooth(span(τ, t - lead * 0.5, t + 0.05));
        let w, k;
        switch (motion) {
        case "overhead":
            w = W(0.6, 0.6); k = C(0.6);
            armTo(p, "r", ARM.cocked, ARM.low, k, w);
            addTo(p, "chest", 18 * k * w, 0, 0);
            break;
        case "slam":
            // Two-handed, from high over the head down through her knees.
            w = W(0.8, 0.7); k = C(0.8);
            armTo(p, "r", ARM.cocked, ARM.low, k, w);
            armTo(p, "l", ARM.cocked, ARM.low, k, w);
            addTo(p, "chest", lerp(-12, 24, k) * w, 0, 0);
            addTo(p, "spine", 10 * k * w, 0, 0);
            break;
        case "chop":
            w = W(0.55, 0.5); k = C(0.55);
            if (alt) armTo(p, "r", ARM.back, ARM.across, k, w); else armTo(p, "r", ARM.diagHigh, ARM.diagLow, k, w);
            addTo(p, "chest", 0, lerp(-25, 30, k) * w, 0);
            break;
        case "sweep":
            // Forehand, then backhand.
            w = W(0.5, 0.5); k = C(0.5);
            if (alt) armTo(p, "r", ARM.across, ARM.back, k, w); else armTo(p, "r", ARM.back, ARM.across, k, w);
            addTo(p, "chest", 0, (alt ? lerp(35, -30, k) : lerp(-30, 35, k)) * w, 0);
            break;
        case "reap":
            // The whole body behind one wide, slow cut.
            w = W(0.9, 0.7); k = C(0.9);
            armTo(p, "r", ARM.wideBack, ARM.wideAcross, k, w);
            armTo(p, "l", ARM.brace, ARM.brace, 0, w * 0.8);
            addTo(p, "chest", 0, lerp(-45, 50, k) * w, 0);
            addTo(p, "hips", 0, lerp(-15, 20, k) * w, 0);
            break;
        case "spin":
            // A full turn on the spot with the flail out, let go on the way round.
            w = W(0.9, 0.6); k = C(0.9);
            armTo(p, "r", ARM.out, ARM.aim, smooth(span(τ, t - 0.1, t + 0.15)), w);
            if (w > 0 && k > 0 && k < 1) addTo(p, "hips", 0, 360 * k, 0);
            break;
        case "lash":
            w = W(0.45, 0.5); k = C(0.45);
            armTo(p, "r", ARM.high, ARM.low, k, w);
            addTo(p, "rLowerArm", 0, 70 * Math.sin(k * Math.PI) * w, 0);
            break;
        case "flurry":
            w = W(0.25, 0.3); k = C(0.25);
            armTo(p, alt ? "l" : "r", ARM.back, ARM.across, k, w);
            addTo(p, "chest", 0, sign * lerp(-12, 15, k) * w, 0);
            break;
        case "stab":
            w = W(0.28, 0.25); k = C(0.28);
            armTo(p, "r", ARM.chamber, ARM.aim, k, w);
            addTo(p, "chest", 6 * k * w, 8 * k * w, 0);
            break;
        case "lunge":
            // The lance couched, then her whole weight behind it.
            w = W(0.8, 0.6); k = C(0.8);
            armTo(p, "r", ARM.couch, ARM.aim, k, w);
            armTo(p, "l", ARM.chamber, ARM.brace, k, w * 0.7);
            addTo(p, "chest", 14 * k * w, 0, 0);
            addTo(p, "hips", 6 * k * w, 0, 0);
            addTo(p, "rUpperLeg", -25 * k * w, 0, 0);
            addTo(p, "lUpperLeg", 15 * k * w, 0, 0);
            break;
        case "jab":
            w = W(0.25, 0.3); k = C(0.25);
            armTo(p, alt ? "l" : "r", ARM.chamber, ARM.aim, k, w);
            addTo(p, "chest", 0, sign * 15 * k * w, 0);
            break;
        case "claw":
            w = W(0.45, 0.45); k = C(0.45);
            armTo(p, alt ? "l" : "r", ARM.high, ARM.diagLow, k, w);
            addTo(p, "chest", 10 * k * w, sign * 12 * k * w, 0);
            break;
        case "throw":
            w = W(0.45, 0.4); k = C(0.45);
            armTo(p, "r", ARM.cocked, ARM.aim, k, w);
            addTo(p, "chest", 0, lerp(-20, 22, k) * w, 0);
            break;
        case "draw": {
            // The string drawn to her cheek, and loosed.
            w = W(0.75, 0.45);
            const pull = smooth(span(τ, t - 0.65, t - 0.12));
            const drawn = [0, 1, 2, 3].map((j) => lerp(ARM.aim[j], ARM.pull[j], pull));
            armTo(p, "r", drawn, ARM.loose, smooth(span(τ, t, t + 0.12)), w);
            break;
        }
        case "twirl":
            // The staff spun twice in her hand, then pointed.
            w = W(0.9, 0.4); k = C(0.3);
            armTo(p, "r", ARM.high, ARM.aim, k, w);
            if (w > 0) addTo(p, "rUpperArm", 720 * span(τ, t - 0.9, t - 0.15), 0, 0);
            break;
        case "pray":
            // Palms together, and pushed out.
            w = W(0.5, 0.45); k = C(0.5);
            armTo(p, "r", ARM.palms, ARM.push, k, w);
            armTo(p, "l", ARM.palms, ARM.push, k, w);
            break;
        case "rev": {
            // Held out in both hands, shaking with it, the whole time it grinds.
            w = window4(τ, t - 0.5, t - 0.2, t + 1.8, t + 2.3);
            armTo(p, "r", ARM.aim, ARM.aim, 0, w);
            armTo(p, "l", ARM.brace, ARM.brace, 0, w);
            const shake = Math.sin(τ * 71) * 2.5 + Math.sin(τ * 53) * 1.5;
            addTo(p, "chest", (8 + shake) * w, shake * w, 0);
            addTo(p, "rLowerArm", 0, shake * w, 0);
            break;
        }
        }
    }

    // The giant's beats, laid over the rig's own pose `p`.
    function giantLayers(p, τ, variant) {
        // Climbing out with the head bowed, looking up as the shoulders clear.
        addTo(p, "head", lerp(22, -4, smooth(span(τ, CUE.rise + 2, CUE.stand))), 0, 0);
        // Facing God, chin up.
        addTo(p, "head", -10 * smooth(span(τ, CUE.godIn + 2, CUE.eye)) * (1 - smooth(span(τ, CUE.shatter, CUE.shatter + 1))), 0, 0);
        flinch(p, τ);
        // DivineAnnihilation: the arms crossed in front of the face.
        const brace = window4(τ, CUE.annihilation, CUE.annihilation + 0.45, CUE.fireball - 0.4, CUE.fireball);
        blendArm(p, "r", -30, 72, 20, 95, brace);
        blendArm(p, "l", -30, -72, -20, -95, brace);
        // GenericFireball: the left palm out at God, then the push.
        const cast = window4(τ, CUE.fireball, CUE.fireball + 0.5, CUE.fireballHit, CUE.fireballHit + 0.8);
        const push = window4(τ, CUE.fireballRelease - 0.1, CUE.fireballRelease + 0.15, CUE.fireballHit - 0.4, CUE.fireballHit + 0.4);
        blendArm(p, "l", -32 - 10 * push, -86, -8, lerp(-35, -5, push), cast);
        // The vector gun, levelled at God; the left hand flicks the dice.
        const aim = window4(τ, CUE.gun + 0.4, CUE.gun + 1.2, CUE.form - 0.2, CUE.form + 0.4);
        blendArm(p, "r", -12, 82, 6, 12, aim);
        const flick = window4(τ, CUE.dice - 0.5, CUE.dice - 0.2, CUE.dice + 0.1, CUE.dice + 0.6);
        blendArm(p, "l", -70, -40, 0, -30, flick);
        layerVariant(p, τ, variant);
        // The Spear of Memories: both hands to the head, and out of it.
        const reach = window4(τ, CUE.spear, CUE.spear + 0.6, CUE.helixDone - 0.4, CUE.helixDone + 0.3);
        blendArm(p, "r", 0, 24, -138, -62, reach);
        blendArm(p, "l", 0, -24, 138, 62, reach);
        addTo(p, "head", -18 * reach, 0, 0);
        addTo(p, "chest", -8 * reach, 0, 0);
        // Holding it low, then the wind-up over the right shoulder.
        const hold = window4(τ, CUE.helixDone - 0.2, CUE.helixDone + 0.3, CUE.windUp, CUE.windUp + 0.4);
        blendArm(p, "r", -5, 70, 30, 25, hold);
        const wind = smooth(span(τ, CUE.windUp, CUE.release - 0.2));
        const cut = smooth(span(τ, CUE.release - 0.15, CUE.release + 0.35));
        const back = smooth(span(τ, CUE.release + 2.2, CUE.release + 4.5));
        const throwW = wind * (1 - back);
        blendArm(p, "r", lerp(-158, 28, cut), lerp(0, 34, cut), lerp(-22, 0, cut), lerp(62, 8, cut), throwW);
        blendArm(p, "l", -22, -82, 0, -20, wind * (1 - cut * 0.6) * (1 - back));
        addTo(p, "chest", lerp(-6, 10, cut) * throwW, lerp(-28, 32, cut) * throwW, 0);
        addTo(p, "hips", 0, lerp(-8, 10, cut) * throwW, 0);
        // Breaking: the arms open and the head goes back.
        const open = smooth(span(τ, CUE.shatter, CUE.shatter + 1.5));
        if (open > 0) {
            standPose(p, -50 * open, -8 * open);
            addTo(p, "head", -26 * open, 0, 0);
            addTo(p, "chest", -12 * open, 0, 0);
        }
        return p;
    }

    // What the dice made of her answer.
    function layerVariant(p, τ, variant) {
        if (!variant) return;
        const on = window4(τ, CUE.form, CUE.form + 0.5, CUE.spear - 0.6, CUE.spear);
        if (on <= 0) return;
        const atk = attackFor(variant);
        if (atk.motion === "iai") {
            // The Katana of Freud: drawn back past her hip, then one flat cut
            // across the front of her, the chest turning into it, at each blow.
            blendArm(p, "r", -20, -35, 45, 20, on * 0.7);
            SWINGS.map(inForm).forEach((t) => {
                const w = window4(τ, t - 0.55, t - 0.35, t + 0.25, t + 0.7);
                if (w <= 0) return;
                const cut = smooth(span(τ, t - 0.3, t + 0.12));
                blendArm(p, "r", lerp(-15, -10, cut), lerp(-70, 115, cut), lerp(10, 0, cut), lerp(35, 5, cut), w);
                addTo(p, "chest", 0, lerp(-32, 38, cut) * w, 0);
                addTo(p, "hips", 0, lerp(-10, 14, cut) * w, 0);
                addTo(p, "head", 0, lerp(-10, 12, cut) * w, 0);
            });
        } else if (atk.motion === "read") {
            // Both hands out to the open book, reading.
            blendArm(p, "r", -40, 64, 10, 30, on);
            blendArm(p, "l", -40, -64, -10, -30, on);
            addTo(p, "head", 8 * on, 0, 0);
        } else if (atk.motion === "leap") {
            // Guard up; each beam swatted aside with the nearer fist.
            blendArm(p, "r", -30, 60, 10, 100, on * 0.8);
            blendArm(p, "l", -30, -60, -10, -100, on * 0.8);
            DEFLECTS.forEach((t, i) => {
                const k = window4(τ, t - 0.25, t - 0.05, t + 0.1, t + 0.4);
                blendArm(p, i % 2 ? "l" : "r", -60, i % 2 ? -30 : 30, i % 2 ? 40 : -40, i % 2 ? -20 : 20, k);
            });
            // The leap at him, stopped by the Moon: knees up, the right fist
            // cocked, then the blow.
            const leap = window4(τ, CUE.jump, CUE.jump + 0.4, CUE.formHit + 0.2, CUE.spear - 0.05);
            addTo(p, "lUpperLeg", -70 * leap, 0, 0);
            addTo(p, "rUpperLeg", -40 * leap, 0, 0);
            addTo(p, "lLowerLeg", 100 * leap, 0, 0);
            addTo(p, "rLowerLeg", 60 * leap, 0, 0);
            const blow = smooth(span(τ, CUE.formHit - 0.25, CUE.formHit));
            blendArm(p, "r", lerp(-100, -5, blow), lerp(0, 82, blow), lerp(-40, 0, blow), lerp(120, 0, blow), leap);
        } else {
            // Held ready between the blows: a bow up in the left hand, what
            // she shoots levelled, what she swings raised.
            if (atk.motion === "draw") {
                armTo(p, "l", ARM.aim, ARM.aim, 0, on);
                armTo(p, "r", ARM.aim, ARM.aim, 0, on * 0.7);
            } else if (atk.throw === "streak") {
                armTo(p, "r", ARM.aim, ARM.aim, 0, on * 0.6);
            } else {
                armTo(p, "r", ARM.ready, ARM.ready, 0, on * 0.5);
            }
            strikesOf(variant).forEach((st) => strikeMotion(p, τ, atk.motion, st.t, st.i));
        }
    }

    // The pilot's beats, laid over the rig's sit (or the altar, or the fall).
    function pilotLayers(p, τ, where) {
        if (where === "fall") return p;
        if (where === "altar") {
            // Alive on the stone, then each blade, then the blood, then still.
            STABS.forEach((s) => {
                const k = (τ - s.at) / 1.1;
                if (k < 0 || k > 1) return;
                // Seventeen blows less than half a second apart: each a jolt of
                // its own, never one that throws her off the stone.
                const f = 0.5 * Math.sin(Math.min(1, k * 3) * Math.PI / 2) * (1 - k);
                addTo(p, "spine", 14 * f, 0, 0);
                addTo(p, "chest", 12 * f, 0, 0);
                addTo(p, "head", 22 * f, 0, 6 * f);
                addTo(p, "lUpperArm", 0, 0, 24 * f);
                addTo(p, "rUpperArm", 0, 0, -24 * f);
            });
            const spit = window4(τ, CUE.spit, CUE.spit + 0.2, CUE.spit + 0.6, CUE.spit + 1.2);
            addTo(p, "head", 18 * spit, 0, 0);
            addTo(p, "head", 0, 30 * smooth(span(τ, CUE.dead - 0.5, CUE.dead + 0.5)), 0);
            return p;
        }
        // Hands forward onto the grips.
        addTo(p, "lUpperArm", -10, 0, 0);
        addTo(p, "rUpperArm", -10, 0, 0);
        // Head bowed until the eyes open, then up at what she is looking at.
        addTo(p, "head", lerp(18, -2, smooth(span(τ, CUE.eyesOpen - 0.4, CUE.eyesOpen + 1.2))), 0, 0);
        flinch(p, τ);
        // The spear coming out of her head: she convulses with it.
        const fit = window4(τ, CUE.spear, CUE.spear + 0.2, CUE.helixDone, CUE.helixDone + 0.5);
        if (fit > 0) {
            const j = (a, b) => Math.sin(τ * a + b) * Math.sin(τ * (a * 0.37) + b * 2);
            addTo(p, "head", (-30 + 10 * j(31, 1)) * fit, 12 * j(27, 2) * fit, 8 * j(23, 3) * fit);
            addTo(p, "spine", -14 * fit + 8 * j(19, 4) * fit, 0, 6 * j(21, 5) * fit);
            addTo(p, "chest", -10 * fit, 6 * j(25, 6) * fit, 0);
            addTo(p, "lUpperArm", 20 * j(29, 7) * fit, 0, 30 * fit);
            addTo(p, "rUpperArm", 20 * j(33, 8) * fit, 0, -30 * fit);
            addTo(p, "lUpperLeg", 10 * j(17, 9) * fit, 0, 0);
            addTo(p, "rUpperLeg", 10 * j(15, 10) * fit, 0, 0);
        }
        // The ache after, and the tears.
        const ache = window4(τ, CUE.helixDone, CUE.helixDone + 0.4, CUE.release, CUE.release + 1);
        addTo(p, "head", 10 * ache, 0, -6 * ache);
        addTo(p, "chest", 6 * ache, 0, 0);
        // Looking up as the capsule comes apart.
        addTo(p, "head", -26 * smooth(span(τ, CUE.pitBreak, CUE.pitBreak + 1)), 0, 0);
        return p;
    }

    //=========================================================================
    // Shaders
    //=========================================================================
    const GLSL_NOISE = [
        "float smvHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }",
        "float smvNoise(vec3 x) {",
        "  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);",
        "  return mix(mix(mix(smvHash(i), smvHash(i + vec3(1.0, 0.0, 0.0)), f.x),",
        "                 mix(smvHash(i + vec3(0.0, 1.0, 0.0)), smvHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),",
        "             mix(mix(smvHash(i + vec3(0.0, 0.0, 1.0)), smvHash(i + vec3(1.0, 0.0, 1.0)), f.x),",
        "                 mix(smvHash(i + vec3(0.0, 1.0, 1.0)), smvHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);",
        "}",
        "float smvFbm(vec3 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 4; i++) { s += a * smvNoise(p); p *= 2.03; a *= 0.5; } return s; }"
    ].join("\n");

    const FRESNEL_VERT = [
        "varying vec3 vN;",
        "varying vec3 vV;",
        "varying vec3 vP;",
        "varying vec2 vUv;",
        "uniform float uPush;",
        "uniform float uTime;",
        GLSL_NOISE,
        "void main() {",
        "  vUv = uv;",
        "  vec3 pos = position + normal * uPush * (smvNoise(position * 2.2 + vec3(0.0, uTime * 1.7, 0.0)) - 0.35);",
        "  vP = position;",
        "  vec4 mv = modelViewMatrix * vec4(pos, 1.0);",
        "  vN = normalize(normalMatrix * normal);",
        "  vV = normalize(-mv.xyz);",
        "  gl_Position = projectionMatrix * mv;",
        "}"
    ].join("\n");

    // The golden black hole a blast collapses into (the rocket launch's charge,
    // rimmed in gold instead of violet).
    const HOLE_FRAG = [
        "uniform float uOpacity;",
        "uniform float uTime;",
        "uniform vec3 uRim;",
        "varying vec3 vN;",
        "varying vec3 vV;",
        "void main() {",
        "  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));",
        "  float rim = pow(f, 2.5);",
        "  float swirl = 0.6 + 0.4 * sin(atan(vN.y, vN.x) * 5.0 + uTime * 6.0 - f * 12.0);",
        "  vec3 col = mix(uRim, vec3(1.0), pow(f, 10.0)) * rim * swirl * 1.6;",
        "  gl_FragColor = vec4(col, uOpacity);",
        "}"
    ].join("\n");

    const FIRE_FRAG = [
        "uniform float uTime;",
        "uniform float uOpacity;",
        "uniform float uHot;",
        "varying vec3 vN;",
        "varying vec3 vV;",
        "varying vec3 vP;",
        GLSL_NOISE,
        "void main() {",
        "  float f = abs(dot(normalize(vN), normalize(vV)));",
        "  float n = smvFbm(vP * 3.0 + vec3(0.0, -uTime * 2.4, uTime * 0.7));",
        "  float heat = clamp(n * 1.3 + f * 0.6 * uHot, 0.0, 1.0);",
        "  vec3 col = mix(vec3(0.55, 0.05, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.2, 0.55, heat));",
        "  col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.65, 0.95, heat));",
        "  gl_FragColor = vec4(col * (0.7 + uHot * 0.8), uOpacity * (0.35 + 0.65 * f));",
        "}"
    ].join("\n");

    // The holy light: a column whose inside runs with light.
    const BEAM_FRAG = [
        "uniform float uTime;",
        "uniform float uOpacity;",
        "uniform vec3 uColor;",
        "varying vec3 vN;",
        "varying vec3 vV;",
        "varying vec2 vUv;",
        GLSL_NOISE,
        "void main() {",
        "  float f = abs(dot(normalize(vN), normalize(vV)));",
        "  float n = smvNoise(vec3(vUv.x * 6.0, vUv.y * 30.0 - uTime * 14.0, uTime));",
        "  float core = pow(f, 2.0);",
        "  vec3 col = mix(uColor, vec3(1.0), core) * (0.7 + 0.6 * n);",
        "  gl_FragColor = vec4(col, uOpacity * (0.25 + 0.75 * core));",
        "}"
    ].join("\n");

    const ATMOS_FRAG = [
        "uniform vec3 uColor;",
        "uniform float uOpacity;",
        "varying vec3 vN;",
        "varying vec3 vV;",
        "void main() {",
        "  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));",
        "  gl_FragColor = vec4(uColor * pow(f, 3.0) * 1.8, uOpacity);",
        "}"
    ].join("\n");

    // The capsule she sits in: amber light through liquid, a grid running
    // down the walls, the red of an alarm, and the walls coming apart.
    const PIT_FRAG = [
        "uniform float uTime;",
        "uniform float uAlarm;",
        "uniform float uDissolve;",
        "varying vec2 vUv;",
        "varying vec3 vP;",
        GLSL_NOISE,
        "void main() {",
        "  float n = smvNoise(vP * 4.0);",
        "  if (n < uDissolve) discard;",
        "  float grid = step(0.94, fract(vUv.x * 48.0)) + step(0.96, fract(vUv.y * 22.0 + uTime * 0.25));",
        "  float scan = 0.5 + 0.5 * sin(vUv.y * 140.0 - uTime * 9.0);",
        "  vec3 amber = vec3(1.0, 0.55, 0.12) * (0.18 + 0.1 * scan) + vec3(1.0, 0.7, 0.25) * grid * 0.35;",
        "  vec3 red = vec3(1.0, 0.05, 0.03) * (0.35 + 0.3 * scan) + vec3(1.0, 0.2, 0.1) * grid * 0.5;",
        "  vec3 col = mix(amber, red, uAlarm);",
        "  float edge = (1.0 - smoothstep(uDissolve, uDissolve + 0.07, n)) * step(0.001, uDissolve);",
        "  col += vec3(1.0, 0.85, 0.4) * edge * 2.5;",
        "  gl_FragColor = vec4(col, 1.0);",
        "}"
    ].join("\n");

    const SPRAY_VERT = [
        "attribute float aSize;",
        "attribute float aAlpha;",
        "attribute vec3 aColor;",
        "uniform float uScale;",
        "varying float vA;",
        "varying vec3 vC;",
        "void main() {",
        "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
        "  gl_Position = projectionMatrix * mv;",
        "  gl_PointSize = clamp(aSize * uScale / max(0.001, -mv.z), 0.0, 256.0);",
        "  vA = aAlpha;",
        "  vC = aColor;",
        "}"
    ].join("\n");

    const SPRAY_FRAG = [
        "varying float vA;",
        "varying vec3 vC;",
        "void main() {",
        "  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;",
        "  float a = 1.0 - smoothstep(0.0, 1.0, d);",
        "  gl_FragColor = vec4(vC, vA * a * a);",
        "}"
    ].join("\n");

    //=========================================================================
    // Painted textures
    //=========================================================================
    function canvasOf(w, h, paint) {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        paint(ctx, w, h);
        return c;
    }

    function glowCanvas(inner, outer) {
        return canvasOf(128, 128, (ctx) => {
            const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            g.addColorStop(0, inner);
            g.addColorStop(0.25, outer);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 128, 128);
        });
    }

    function tearCanvas() {
        return canvasOf(512, 1024, (ctx, w, h) => {
            const r = rng(0x7ea2);
            const c = w / 2;
            const left = [], right = [];
            for (let y = 24; y <= h - 24; y += 14) {
                const u = (y - 24) / (h - 48);
                const half = Math.pow(Math.sin(u * Math.PI), 0.75) * w * 0.4;
                const bend = Math.sin(u * 5.3) * w * 0.05;
                left.push([c + bend - half * (0.75 + r() * 0.35), y]);
                right.push([c + bend + half * (0.75 + r() * 0.35), y]);
            }
            const outline = () => {
                ctx.beginPath();
                ctx.moveTo(c, 8);
                left.forEach((p) => ctx.lineTo(p[0], p[1]));
                ctx.lineTo(c, h - 8);
                for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
                ctx.closePath();
            };
            // The lips, burning, wide and soft then thin and white.
            ctx.lineJoin = "round";
            [[46, "rgba(255,150,40,0.18)"], [24, "rgba(255,190,80,0.45)"], [10, "rgba(255,235,170,0.9)"], [3, "rgba(255,255,255,1)"]].forEach(([lw, col]) => {
                ctx.strokeStyle = col;
                ctx.lineWidth = lw;
                outline();
                ctx.stroke();
            });
            // And nothing inside.
            ctx.fillStyle = "#000000";
            outline();
            ctx.fill();
            const inner = ctx.createLinearGradient(0, 0, w, 0);
            inner.addColorStop(0, "rgba(40,20,0,0.6)");
            inner.addColorStop(0.2, "rgba(0,0,0,0)");
            inner.addColorStop(0.8, "rgba(0,0,0,0)");
            inner.addColorStop(1, "rgba(40,20,0,0.6)");
            ctx.save();
            outline();
            ctx.clip();
            ctx.fillStyle = inner;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
            // Cracks running on out of each end into the sky.
            ctx.strokeStyle = "rgba(255,220,150,0.8)";
            ctx.lineCap = "round";
            [[c, 8, -1], [c, h - 8, 1]].forEach(([x0, y0, sgn]) => {
                for (let k = 0; k < 4; k++) {
                    let x = x0, y = y0, a = (sgn > 0 ? Math.PI / 2 : -Math.PI / 2) + (r() - 0.5) * 1.2;
                    ctx.lineWidth = 1 + r() * 2.5;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    for (let i = 0; i < 4; i++) {
                        a += (r() - 0.5) * 0.9;
                        x += Math.cos(a) * 9; y += Math.sin(a) * 9;
                        ctx.lineTo(Math.max(1, Math.min(w - 1, x)), Math.max(1, Math.min(h - 1, y)));
                    }
                    ctx.stroke();
                }
            });
        });
    }

    function irisCanvas() {
        return canvasOf(256, 256, (ctx) => {
            const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
            g.addColorStop(0, "#2a1c00");
            g.addColorStop(0.28, "#2a1c00");
            g.addColorStop(0.34, "#FFD700");
            g.addColorStop(0.9, "#ffe680");
            g.addColorStop(1, "rgba(255,215,0,0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 256, 256);
        });
    }

    // The night side of the Earth: every wired town, laid only on land, dense
    // in the temperate north where the people are. Read off the day map
    // itself, so Europe's lights are where Europe is.
    function cityLightsCanvas(img) {
        const W = 1024, H = 512;
        return canvasOf(W, H, (ctx) => {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, W, H);
            if (!img) return;
            const src = canvasOf(W, H, (c) => { try { c.drawImage(img, 0, 0, W, H); } catch (e) { /* no map */ } });
            let data;
            try { data = src.getContext("2d").getImageData(0, 0, W, H).data; } catch (e) { return; }
            const out = ctx.getImageData(0, 0, W, H);
            const o = out.data;
            const r = rng(0xc171e5);
            for (let y = 0; y < H; y++) {
                const lat = (0.5 - y / H) * 180;
                const habit = Math.min(1, Math.exp(-Math.pow((lat - 47) / 15, 2)) +
                    Math.exp(-Math.pow((lat - 22) / 14, 2)) * 0.6 + Math.exp(-Math.pow((lat + 28) / 14, 2)) * 0.35);
                for (let x = 0; x < W; x++) {
                    const i = (y * W + x) * 4;
                    const R = data[i], G = data[i + 1], B = data[i + 2];
                    const water = B > R * 1.12 && B > G * 0.85;
                    const ice = R > 200 && G > 200 && B > 200;
                    if (water || ice) continue;
                    const roll = r();
                    if (roll > habit * 0.42) continue;
                    const k = Math.min(1, 0.35 + r() * 0.9) * (roll < habit * 0.06 ? 1 : 0.45);
                    o[i] = 255 * k; o[i + 1] = 196 * k; o[i + 2] = 120 * k; o[i + 3] = 255;
                }
            }
            ctx.putImageData(out, 0, 0);
            ctx.globalCompositeOperation = "lighter";
            ctx.filter = "blur(1.5px)";
            try { ctx.drawImage(ctx.canvas, 0, 0); } catch (e) { /* no filter */ }
        });
    }

    //=========================================================================
    // Analytic particles
    //=========================================================================
    // A cloud of soft points whose every position is written each frame from
    // its own formula, so a cloud has no history to replay.
    function Spray(stage, count, additive) {
        const geo = stage._own(new THREE.BufferGeometry());
        this.count = count;
        this.pos = new Float32Array(count * 3);
        this.col = new Float32Array(count * 3);
        this.size = new Float32Array(count);
        this.alpha = new Float32Array(count);
        geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
        geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
        geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
        geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
        this.geo = geo;
        this.mat = stage._own(new THREE.ShaderMaterial({
            uniforms: { uScale: { value: 400 } },
            vertexShader: SPRAY_VERT,
            fragmentShader: SPRAY_FRAG,
            transparent: true,
            depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
        }));
        this.points = new THREE.Points(geo, this.mat);
        this.points.frustumCulled = false;
        this.used = 0;
        stage._sprays.push(this);
    }
    Spray.prototype.begin = function () { this.used = 0; };
    Spray.prototype.put = function (x, y, z, size, alpha, r, g, b) {
        if (this.used >= this.count || alpha <= 0.002) return;
        const i = this.used++;
        this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
        this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
        this.size[i] = size;
        this.alpha[i] = alpha;
    };
    Spray.prototype.end = function () {
        const a = this.geo.attributes;
        a.position.needsUpdate = true; a.aColor.needsUpdate = true;
        a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true;
        this.geo.setDrawRange(0, this.used);
        this.points.visible = this.used > 0;
    };

    //=========================================================================
    // The stage
    //=========================================================================
    const R = 1000;             // the Earth's radius, in world units
    const MOON_R = 230;
    const GIANT_H = MOON_R * 2; // the construct, head to heel: as tall as the Moon
    // How far round the Earth her first walk takes her (radians), and how slowly
    // her rig strides so her feet keep up with the ground going by.
    const WALK_ARC = 0.6;
    const WALK_PACE = 0.1;
    const GOD_SIZE = 560;       // the hypertriangle's reach
    const GOD_AT = [0, 2900, 5200];
    const FB_R = 70;
    const SPEAR_LEN = 380;
    const ORBIT_R = 2100;
    const GOLD = 0xffc94a;
    // Luxembourg, where the Omega Tower stands: turned to the top of the world.
    const TOWER_LAT = 49.6, TOWER_LON = 6.1;

    // The whole movie wears the game's SnapVertex look whatever the Options
    // say, with the vertices snapped to a much coarser grid than the game's
    // own (420 cells across) so the wobble is plainly there.
    const MOVIE_PSX = { vertexSnap: 200, downscale: 0.85 };
    function withMoviePSX(fn) {
        const S = window.SnapVertexShader;
        if (!S) return fn(null);
        const saved = { enabled: S.enabled, vertexSnap: S.vertexSnap, downscale: S.downscale };
        S.enabled = true;
        S.vertexSnap = MOVIE_PSX.vertexSnap;
        S.downscale = MOVIE_PSX.downscale;
        try { return fn(S); } finally { Object.assign(S, saved); }
    }

    function MovieStage(w, h, variant) {
        this.w = w;
        this.h = h;
        this.variant = variant || variantFor(rollFace());
        this._owned = [];
        this._sprays = [];
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(w, h, false);
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.autoClear = false;
        this.domElement = this.renderer.domElement;
        this.main = new THREE.Scene();
        this.pit = new THREE.Scene();
        this.henge = new THREE.Scene();
        this.deep = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, w / h, 2, 90000);
        this.pitCamera = new THREE.PerspectiveCamera(50, w / h, 0.03, 60);
        this.hengeCamera = new THREE.PerspectiveCamera(45, w / h, 0.05, 900);
        this.deepCamera = new THREE.PerspectiveCamera(50, w / h, 5, 400000);
        this._t = {};
        ["a", "b", "c", "d", "e", "f"].forEach((k) => { this._t[k] = new THREE.Vector3(); });
        this.C = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
        this.front = new THREE.Vector3(0, 0, 1);
        this.side = new THREE.Vector3(1, 0, 0);
        this.G = new THREE.Vector3();
        this.pilotU = { uDissolve: { value: 0 } };
        this.ready = false;
    }

    MovieStage.prototype._own = function (x) { this._owned.push(x); return x; };

    // Her memories are cards: the twenty-two Major Arcana the tarot table
    // reads from (img/arcana), dealt in a fresh order every time.
    const ARCANA = 22;
    const ARCANA_RATIO = 767 / 457;
    MovieStage.prototype._loadArcana = function () {
        const order = [];
        for (let i = 0; i < ARCANA; i++) order.push(i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = order[i]; order[i] = order[j]; order[j] = t;
        }
        const loader = new THREE.TextureLoader();
        return order.map((n) => {
            const tex = this._own(loader.load("img/arcana/" + n + ".png"));
            if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
            return tex;
        });
    };

    MovieStage.prototype.load = function () {
        const AM = window.ActorModel3D;
        const figure = () => (AM && typeof AM.figure === "function" ? AM.figure(EM_MODEL) : Promise.resolve(null));
        const texture = (path) => new Promise((resolve) => {
            try {
                new THREE.TextureLoader().load(path, resolve, undefined, () => resolve(null));
            } catch (e) { resolve(null); }
        });
        return Promise.all([figure(), figure(), texture(EARTH_MAP), texture(MOON_MAP), texture(JUPITER_MAP), texture(SATURN_MAP),
 ])
            .then(([giant, pilot, earth, moon, jupiter, saturn]) => {
                this._planetTex = { jupiter, saturn };
                if (this._disposed || !giant || !pilot) return false;
                this._build(giant, pilot, earth, moon);
                this.ready = true;
                return true;
            });
    };

    MovieStage.prototype._build = function (giant, pilot, earthTex, moonTex) {
        if (earthTex) this._own(earthTex);
        if (moonTex) this._own(moonTex);
        this._glowTex = this._own(new THREE.CanvasTexture(glowCanvas("rgba(255,250,225,1)", "rgba(255,210,90,0.55)")));
        this._redTex = this._own(new THREE.CanvasTexture(glowCanvas("rgba(255,120,100,1)", "rgba(200,0,10,0.6)")));
        this._darkTex = this._own(new THREE.CanvasTexture(glowCanvas("rgba(10,8,2,1)", "rgba(10,8,2,0.9)")));
        this._tarotTex = this._loadArcana();
        this._buildLights();
        this._buildStars();
        this._buildEarth(earthTex);
        this._buildTower();
        this._buildGiant(giant);
        this._buildAnatomy();
        this._buildGod();
        this._buildTear();
        this._buildBeams();
        this._buildWounds();
        this._buildFireball();
        this._buildHenge();
        this._buildArc();
        this._buildArsenal();
        this._buildSpear();
        this._buildBlasts();
        this._buildCorpse();
        this._buildCockpit(pilot);
        this._dissolvable(this.pilotModel);
        // Where the spear leaves the giant's hand, and so where the Moon has
        // to stand to be grazed on the way to God's eye.
        this._poseGiant(CUE.release + 0.05);
        this.main.updateMatrixWorld(true);
        this.releasePoint = this._boneAt("rHand", new THREE.Vector3());
        this._buildMoon(moonTex);
        this._buildStrikes();
        this._buildWard();
        this._buildDeep(this._planetTex || {});
        this._shardSeeds = this._sampleGiant(CUE.shatter);
        this._prevτ = undefined;
        this._psx();
        this._warm();
    };

    MovieStage.prototype._warm = function () {
        const r = this.renderer;
        [[this.main, this.camera], [this.pit, this.pitCamera], [this.henge, this.hengeCamera], [this.deep, this.deepCamera]].forEach(([scene, cam]) => {
            try { if (r.compile) r.compile(scene, cam); } catch (e) { /* compiled on first sight instead */ }
        });
        if (typeof r.initTexture === "function") {
            this._owned.forEach((x) => {
                if (x && x.isTexture && x.image) { try { r.initTexture(x); } catch (e) { /* uploaded on first use */ } }
            });
        }
    };

    // Every material in every scene gets the snap. The movie's own shader
    // edits keep their program keys alongside the look's.
    MovieStage.prototype._psx = function () {
        const done = new Set();
        withMoviePSX((S) => {
            if (!S) return;
            [this.main, this.pit, this.henge, this.deep].forEach((scene) => scene.traverse((o) => {
                if (!o.material) return;
                (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
                    if (!m || done.has(m)) return;
                    done.add(m);
                    const had = typeof m.customProgramCacheKey === "function" ? m.customProgramCacheKey : null;
                    S.applyToMaterial(m);
                    const look = m.customProgramCacheKey;
                    if (had && look !== had) m.customProgramCacheKey = function () { return look.call(this) + "|" + had.call(this); };
                });
            }));
        });
    };

    //--- light and sky -------------------------------------------------------

    MovieStage.prototype._buildLights = function () {
        this.main.add(new THREE.AmbientLight(0x2a3550, 0.75));
        const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
        // The sun stands on the horizon of Europe: the line between day and
        // night runs down the middle of it, and the Omega Tower is on it.
        this.sunDir = new THREE.Vector3(-1, 0.02, 0.3).normalize();
        sun.position.copy(this.sunDir).multiplyScalar(10000);
        this.main.add(sun);
        this.godLight = new THREE.PointLight(0xffe6a0, 0, 0, 2);
        this.main.add(this.godLight);
        this.fireLight = new THREE.PointLight(0xff7a20, 0, 0, 2);
        this.main.add(this.fireLight);
    };

    MovieStage.prototype._buildStars = function () {
        const s = new Spray(this, 3000, true);
        const r = rng(0x5ea5);
        s.begin();
        for (let i = 0; i < 3000; i++) {
            const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
            const warm = r();
            s.put(q * Math.cos(a) * 60000, u * 60000, q * Math.sin(a) * 60000,
                90 + r() * 260, 0.35 + r() * 0.65, lerp(0.75, 1, warm), lerp(0.8, 0.95, warm), lerp(1, 0.75, warm));
        }
        s.end();
        this.main.add(s.points);
    };

    MovieStage.prototype._buildEarth = function (tex) {
        const geo = this._own(new THREE.SphereGeometry(R, 96, 64));
        const lights = this._own(new THREE.CanvasTexture(cityLightsCanvas(tex && tex.image)));
        const mat = this._own(new THREE.MeshPhongMaterial({
            map: tex || null,
            color: tex ? 0xffffff : 0x22446a,
            specular: 0x223344,
            shininess: 14,
            emissive: 0xffd9a0,
            emissiveMap: lights,
            emissiveIntensity: 1.25
        }));
        // The city lights burn only on the night side.
        this.earthU = { uSunView: { value: new THREE.Vector3(1, 0, 0) } };
        const eu = this.earthU;
        mat.onBeforeCompile = function (shader) {
            shader.uniforms.uSunView = eu.uSunView;
            shader.fragmentShader = "uniform vec3 uSunView;\n" + shader.fragmentShader.replace("#include <emissivemap_fragment>",
                "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= (1.0 - smoothstep(-0.18, 0.12, dot(normal, uSunView)));");
        };
        mat.customProgramCacheKey = () => "startinEarth";
        this.earth = new THREE.Mesh(geo, mat);
        const lat = TOWER_LAT * Math.PI / 180, lon = TOWER_LON * Math.PI / 180;
        const site = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
        this._earthBase = new THREE.Quaternion().setFromUnitVectors(site, new THREE.Vector3(0, 1, 0));
        this._spinQ = new THREE.Quaternion();
        this.main.add(this.earth);
        const atmos = new THREE.Mesh(this._own(new THREE.SphereGeometry(R * 1.035, 64, 48)), this._own(new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color(0x5aa8ff) }, uOpacity: { value: 1 }, uPush: { value: 0 }, uTime: { value: 0 } },
            vertexShader: FRESNEL_VERT,
            fragmentShader: ATMOS_FRAG,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })));
        this.main.add(atmos);
        // Towns underfoot for the shots taken from the ground.
        const towns = new Spray(this, 900, true);
        const r = rng(0x70c5);
        towns.begin();
        for (let i = 0; i < 900; i++) {
            const a = r() * Math.PI * 2, d = 20 + Math.pow(r(), 0.6) * 900;
            const x = Math.cos(a) * d, z = Math.sin(a) * d;
            const y = Math.sqrt(Math.max(0, R * R - x * x - z * z)) + 0.6;
            towns.put(x, y, z, 1.6 + r() * 3, 0.5 + r() * 0.5, 1, 0.8, 0.5);
        }
        towns.end();
        this.main.add(towns.points);
        this._buildKessler();
    };

    // The Omega Tower: a spear Eris drove into the Earth in 1992, a shaft the
    // size of a country running up out of the atmosphere, banded in gold,
    // with the celestial throne floating over its tip. The giant climbs out
    // of the seam in its face.
    function towerCanvas() {
        return canvasOf(256, 1024, (ctx, w, h) => {
            ctx.fillStyle = "#14110d";
            ctx.fillRect(0, 0, w, h);
            const r = rng(0x0e9a);
            for (let i = 0; i < 900; i++) {
                ctx.fillStyle = "rgba(" + (40 + Math.floor(r() * 40)) + ",34,26,0.6)";
                ctx.fillRect(r() * w, r() * h, 2 + r() * 14, 1 + r() * 4);
            }
            ctx.fillStyle = "rgba(255,200,90,0.95)";
            for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 2, h);
            for (let y = 0; y < h; y += 64) ctx.fillRect(0, y, w, 3);
            for (let i = 0; i < 400; i++) {
                ctx.fillStyle = r() > 0.5 ? "rgba(255,226,150,0.9)" : "rgba(160,220,255,0.7)";
                ctx.fillRect(Math.floor(r() * 8) * 32 + 6 + r() * 20, r() * h, 2, 2);
            }
        });
    }

    const TOWER_BACK = 0.035;   // radians behind the giant's first footing
    const TOWER_H = 900;

    // The Kessler cloud: what ENVISAT started at Y2K, a year of collisions
    // later. Laid out the way GalaxySim draws it round the Earth (a dense low
    // shell in every inclination, a flat graveyard ring further out, a faint
    // haze), every fragment one random triangle so the whole belt is one mesh.
    function debrisMesh(own, o) {
        let seed = o.seed >>> 0;
        const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
        const pos = new Float32Array(o.count * 9);
        for (let i = 0; i < o.count; i++) {
            const r = o.rMin + (o.rMax - o.rMin) * rand();
            const th = rand() * Math.PI * 2, u = rand() * 2 - 1, q = Math.sqrt(Math.max(0, 1 - u * u));
            const cx = Math.cos(th) * q * r, cy = u * r * o.flat, cz = Math.sin(th) * q * r;
            const size = o.sizeMin + (o.sizeMax - o.sizeMin) * rand();
            for (let v = 0; v < 3; v++) {
                const a = rand() * Math.PI * 2, b = rand() * Math.PI - Math.PI / 2, k = i * 9 + v * 3;
                pos[k] = cx + Math.cos(a) * Math.cos(b) * size;
                pos[k + 1] = cy + Math.sin(b) * size;
                pos[k + 2] = cz + Math.sin(a) * Math.cos(b) * size;
            }
        }
        const geo = own(new THREE.BufferGeometry());
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        return new THREE.Mesh(geo, own(new THREE.MeshBasicMaterial({
            color: o.color, side: THREE.DoubleSide, transparent: true, opacity: o.opacity, depthWrite: false
        })));
    }

    MovieStage.prototype._buildKessler = function () {
        const own = (x) => this._own(x);
        const low = debrisMesh(own, { count: 2600, rMin: R * 1.09, rMax: R * 1.4, flat: 0.85, seed: 0x4e57,
            sizeMin: R * 0.004, sizeMax: R * 0.016, color: 0xcfd8e6, opacity: 0.95 });
        const graveyard = debrisMesh(own, { count: 900, rMin: R * 1.5, rMax: R * 1.66, flat: 0.12, seed: 0x4e7a,
            sizeMin: R * 0.004, sizeMax: R * 0.013, color: 0xb6c2d4, opacity: 0.8 });
        const haze = new THREE.Mesh(own(new THREE.SphereGeometry(R * 1.34, 32, 20)), own(new THREE.MeshBasicMaterial({
            color: 0x8fa6c8, transparent: true, opacity: 0.05, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        [low, graveyard].forEach((m) => { m.frustumCulled = false; });
        this.kessler = { low, graveyard };
        this.main.add(low, graveyard, haze);
    };

    // The two shells precess at different rates, so the cloud never reads as
    // a painted halo.
    MovieStage.prototype._poseKessler = function (τ) {
        const k = this.kessler;
        if (!k) return;
        k.low.rotation.set(0.4 + τ * 0.004, τ * 0.02, 0);
        k.graveyard.rotation.set(0.35, -τ * 0.009, 0.12);
    };

    MovieStage.prototype._buildTower = function () {
        const tower = new THREE.Group();
        tower.position.set(0, R * Math.cos(TOWER_BACK), -R * Math.sin(TOWER_BACK));
        tower.rotation.x = -TOWER_BACK;
        const tex = this._own(new THREE.CanvasTexture(towerCanvas()));
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 4);
        const shaft = new THREE.Mesh(this._own(new THREE.CylinderGeometry(5, 26, TOWER_H, 8, 24)), this._own(new THREE.MeshStandardMaterial({
            color: 0x3a342c, roughness: 0.55, metalness: 0.2, map: tex,
            emissive: 0xffc060, emissiveMap: tex, emissiveIntensity: 0.55
        })));
        shaft.position.y = TOWER_H / 2 - 4;
        const glow = new THREE.Mesh(this._own(new THREE.CylinderGeometry(9, 40, TOWER_H, 16, 1, true)), this._own(new THREE.MeshBasicMaterial({
            color: 0xffb040, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        glow.position.y = TOWER_H / 2;
        tower.add(shaft, glow);
        // The rings that hold the dimensions together.
        this.towerRings = [0.18, 0.36, 0.55, 0.74, 0.9].map((k, i) => {
            const rad = lerp(26, 5, k) + 7;
            const m = new THREE.Mesh(this._own(new THREE.TorusGeometry(rad, 0.9 + (1 - k) * 1.2, 6, 48)), this._own(new THREE.MeshBasicMaterial({
                color: i % 2 ? 0x9ad8ff : 0xffd070, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            m.rotation.x = Math.PI / 2;
            m.position.y = TOWER_H * k;
            tower.add(m);
            return m;
        });
        // The celestial throne, floating over the tip.
        const throne = new THREE.Group();
        throne.position.y = TOWER_H + 40;
        const gold = this._own(new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0xc08a20, emissiveIntensity: 0.9, roughness: 0.3 }));
        const seat = new THREE.Mesh(this._own(new THREE.BoxGeometry(18, 4, 14)), gold);
        const back = new THREE.Mesh(this._own(new THREE.BoxGeometry(18, 26, 3)), gold);
        back.position.set(0, 13, -6);
        const halo = new THREE.Mesh(this._own(new THREE.TorusGeometry(16, 1.2, 6, 48)), this._own(new THREE.MeshBasicMaterial({
            color: 0xfff2c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        halo.position.set(0, 30, -7);
        throne.add(seat, back, halo);
        [-1, 0, 1].forEach((x) => {
            const spike = new THREE.Mesh(this._own(new THREE.ConeGeometry(2.4, 26, 6)), gold);
            spike.position.set(x * 12, 30 + (x ? 0 : 10), -6);
            throne.add(spike);
        });
        const beacon = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xfff4d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        beacon.position.y = 20;
        beacon.scale.setScalar(120);
        throne.add(beacon);
        tower.add(throne);
        // The seam in its face the giant climbs out of.
        const seam = new THREE.Mesh(this._own(new THREE.PlaneGeometry(1, 1)), this._own(new THREE.MeshBasicMaterial({
            map: this._own(new THREE.CanvasTexture(tearCanvas())), color: 0xfff0c0, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })));
        seam.position.set(0, 300, 22);
        const flare = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        flare.position.set(0, 120, 30);
        tower.add(seam, flare);
        this.tower = { group: tower, shaft, glow, throne, beacon, seam, flare };
        this.main.add(tower);
    };

    MovieStage.prototype._poseTower = function (τ) {
        const t = this.tower;
        const open = window4(τ, CUE.rise - 1.5, CUE.rise + 0.5, CUE.stand + 3, CUE.stand + 8);
        t.seam.material.opacity = open;
        t.seam.scale.set(10 + 70 * open, 600 * Math.min(1, open * 2), 1);
        t.flare.material.opacity = open * 0.9;
        t.flare.scale.setScalar(120 + 500 * open);
        t.beacon.material.opacity = 0.7 + 0.3 * Math.sin(τ * 2.2);
        t.throne.rotation.y = τ * 0.05;
        this.towerRings.forEach((m, i) => { m.rotation.z = τ * (0.1 + i * 0.04) * (i % 2 ? 1 : -1); });
        // Struck by the light, the whole shaft charges the way a launch tower
        // does: lit from inside, rings of light racing up it.
        const charge = window4(τ, CUE.towerHit - 0.1, CUE.towerHit + 0.4, CUE.stand + 2, CUE.gold);
        t.shaft.material.emissiveIntensity = 0.55 + 2.6 * charge;
        t.glow.material.opacity = 0.12 + 0.45 * charge;
        this.climbRings.forEach((m, i) => {
            const k = ((τ - CUE.towerHit) * 0.9 + i / this.climbRings.length) % 1;
            m.visible = charge > 0.01 && τ >= CUE.towerHit;
            m.position.y = k * TOWER_H;
            const rad = lerp(26, 5, k) + 10;
            m.scale.setScalar(rad);
            m.material.opacity = charge * Math.sin(k * Math.PI);
        });
        // And the seal, a hundred kilometres across, round its foot.
        const seal = smooth(span(τ, CUE.towerHit, CUE.towerHit + 1.5)) * (1 - smooth(span(τ, CUE.stand + 2, CUE.gold + 2)));
        this.towerSeal.material.opacity = seal * (0.85 + 0.15 * Math.sin(τ * 5));
        this.towerSeal.rotation.z = -τ * 0.08;
        this.towerSeal.visible = seal > 0.01;
    };

    // The light she became, shot up out of Stonehenge and brought down on the
    // tip of the Omega Tower.
    MovieStage.prototype._buildArc = function () {
        const ringGeo = this._own(new THREE.TorusGeometry(1, 0.06, 6, 48));
        this.climbRings = [];
        for (let i = 0; i < 7; i++) {
            const m = new THREE.Mesh(ringGeo, this._own(new THREE.MeshBasicMaterial({
                color: i % 2 ? 0xfff2c0 : 0xffc040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            m.rotation.x = Math.PI / 2;
            m.visible = false;
            this.tower.group.add(m);
            this.climbRings.push(m);
        }
        this.towerSeal = new THREE.Mesh(this._own(new THREE.PlaneGeometry(700, 700)), this._own(new THREE.MeshBasicMaterial({
            map: this.sealTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })));
        this.towerSeal.rotation.x = -Math.PI / 2;
        this.towerSeal.position.y = 3;
        this.towerSeal.visible = false;
        this.tower.group.add(this.towerSeal);
        // The curve: from the stones, up out of the atmosphere, and down.
        this._spinQ.setFromAxisAngle(this._t.a.set(0, 1, 0), -0.004 * CUE.towerHit);
        const q = this._spinQ.clone().multiply(this._earthBase);
        const lat = 51.18 * Math.PI / 180, lon = -1.83 * Math.PI / 180;
        const henge = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).applyQuaternion(q).multiplyScalar(R);
        this.tower.group.updateMatrixWorld(true);
        const tip = this.tower.group.localToWorld(new THREE.Vector3(0, TOWER_H + 40, 0));
        const apex = henge.clone().add(tip).multiplyScalar(0.5).setLength(R + 1500);
        const curve = new THREE.QuadraticBezierCurve3(henge, apex, tip);
        this.arcCurve = curve;
        this.hengePoint = henge;
        const geo = this._own(new THREE.TubeGeometry(curve, 240, 7, 8, false));
        this.arc = new THREE.Mesh(geo, this._own(new THREE.MeshBasicMaterial({
            color: 0xffe2a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        this.arc.frustumCulled = false;
        this.arcCount = geo.index ? geo.index.count : 0;
        this.arcHead = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        this.arcHead.scale.setScalar(260);
        this.main.add(this.arc, this.arcHead);
    };

    MovieStage.prototype._poseArc = function (τ) {
        const go = span(τ, CUE.arc, CUE.towerHit);
        const fade = 1 - smooth(span(τ, CUE.towerHit + 0.4, CUE.rise + 1));
        this.arc.visible = go > 0 && fade > 0.01;
        this.arc.geometry.setDrawRange(0, Math.floor(this.arcCount * go / 3) * 3);
        this.arc.material.opacity = 0.95 * fade;
        this.arcHead.visible = go > 0 && go < 1;
        if (this.arcHead.visible) this.arcCurve.getPoint(go, this.arcHead.position);
    };

    //--- Stonehenge -----------------------------------------------------------

    // Built from its plan, in metres: the sarsen circle with what is left of
    // its lintels, the five trilithons in their horseshoe opening north-east,
    // the bluestones inside, the Altar Stone she lies on and the Heel Stone
    // out on the avenue. A night of fog, torches and a low moon.
    function stoneCanvas() {
        return canvasOf(256, 256, (ctx, w, h) => {
            const r = rng(0x570e);
            ctx.fillStyle = "#77746c";
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 2600; i++) {
                const g = 90 + Math.floor(r() * 70);
                ctx.fillStyle = "rgba(" + g + "," + (g - 4) + "," + (g - 10) + ",0.35)";
                ctx.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 4);
            }
            for (let i = 0; i < 90; i++) {
                ctx.fillStyle = r() > 0.5 ? "rgba(170,170,110,0.35)" : "rgba(60,70,50,0.35)";
                ctx.beginPath();
                ctx.arc(r() * w, r() * h, 2 + r() * 10, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }
    function grassCanvas() {
        return canvasOf(256, 256, (ctx, w, h) => {
            const r = rng(0x9a55);
            ctx.fillStyle = "#1c2a16";
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 5000; i++) {
                ctx.fillStyle = "rgba(" + (30 + Math.floor(r() * 40)) + "," + (50 + Math.floor(r() * 50)) + ",30,0.5)";
                ctx.fillRect(r() * w, r() * h, 1, 2 + r() * 4);
            }
        });
    }
    // The Seal of Solomon: two circles, the hexagram, and a ring of sigils.
    function sealCanvas() {
        return canvasOf(1024, 1024, (ctx, w) => {
            const c = w / 2;
            ctx.strokeStyle = "rgba(255,214,110,1)";
            ctx.shadowColor = "rgba(255,200,80,1)";
            ctx.shadowBlur = 18;
            ctx.lineWidth = 10;
            [0.47, 0.41, 0.3].forEach((k) => { ctx.beginPath(); ctx.arc(c, c, w * k, 0, Math.PI * 2); ctx.stroke(); });
            const tri = (rot) => {
                ctx.beginPath();
                for (let i = 0; i <= 3; i++) {
                    const a = rot + i * Math.PI * 2 / 3;
                    const x = c + Math.cos(a) * w * 0.41, y = c + Math.sin(a) * w * 0.41;
                    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                }
                ctx.stroke();
            };
            tri(-Math.PI / 2);
            tri(Math.PI / 2);
            const r = rng(0x5010);
            ctx.lineWidth = 5;
            for (let i = 0; i < 28; i++) {
                const a = i / 28 * Math.PI * 2;
                ctx.save();
                ctx.translate(c + Math.cos(a) * w * 0.44, c + Math.sin(a) * w * 0.44);
                ctx.rotate(a + Math.PI / 2);
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const x = (r() - 0.5) * 22, y = (r() - 0.5) * 18;
                    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                }
                ctx.stroke();
                ctx.restore();
            }
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(c, c, w * 0.07, 0, Math.PI * 2); ctx.stroke();
        });
    }
    function skyCanvas() {
        return canvasOf(8, 256, (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, "#010208");
            g.addColorStop(0.45, "#071026");
            g.addColorStop(0.5, "#1a2440");
            g.addColorStop(1, "#05070c");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        });
    }

    const ALTAR_TOP = 0.75;

    MovieStage.prototype._buildHenge = function () {
        const h = this.henge;
        h.fog = new THREE.FogExp2(0x0b1324, 0.016);
        h.add(new THREE.AmbientLight(0x4a5a80, 0.55));
        const moon = new THREE.DirectionalLight(0xa8bcff, 0.75);
        moon.position.set(-40, 50, -60);
        h.add(moon);
        const sky = new THREE.Mesh(this._own(new THREE.SphereGeometry(450, 24, 16)), this._own(new THREE.MeshBasicMaterial({
            map: this._own(new THREE.CanvasTexture(skyCanvas())), side: THREE.BackSide, fog: false, depthWrite: false
        })));
        h.add(sky);
        const stars = new Spray(this, 900, true);
        const r0 = rng(0x51a7);
        stars.begin();
        for (let i = 0; i < 900; i++) {
            const u = r0() * 0.95, a = r0() * Math.PI * 2, q = Math.sqrt(1 - u * u);
            stars.put(q * Math.cos(a) * 420, u * 420, q * Math.sin(a) * 420, 1.2 + r0() * 2.4, 0.4 + r0() * 0.6, 0.85, 0.9, 1);
        }
        stars.end();
        stars.mat.fog = false;
        h.add(stars.points);
        const moonDisc = new THREE.Sprite(this._own(new THREE.SpriteMaterial({ map: this._glowTex, color: 0xdde6ff, fog: false, depthWrite: false })));
        moonDisc.position.set(-160, 120, -240);
        moonDisc.scale.setScalar(60);
        h.add(moonDisc);
        const grassTex = this._own(new THREE.CanvasTexture(grassCanvas()));
        grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
        grassTex.repeat.set(40, 40);
        const ground = new THREE.Mesh(this._own(new THREE.CircleGeometry(400, 48)), this._own(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })));
        ground.rotation.x = -Math.PI / 2;
        h.add(ground);
        const bank = new THREE.Mesh(this._own(new THREE.TorusGeometry(52, 1.6, 6, 64)), ground.material);
        bank.rotation.x = Math.PI / 2;
        bank.scale.z = 0.4;
        h.add(bank);

        const stoneTex = this._own(new THREE.CanvasTexture(stoneCanvas()));
        const stoneMat = this._own(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 }));
        const r = rng(0x5707e);
        // A worked block, its faces dressed by hand and never flat.
        const block = (w, ht, d, x, y, z, ry, rx, rz) => {
            const g = this._own(new THREE.BoxGeometry(w, ht, d, 3, 5, 2));
            const pos = g.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const k = 0.06 + 0.05 * r();
                pos.setXYZ(i, pos.getX(i) * (1 + (r() - 0.5) * k), pos.getY(i) * (1 + (r() - 0.5) * 0.04), pos.getZ(i) * (1 + (r() - 0.5) * k));
            }
            g.computeVertexNormals();
            const m = new THREE.Mesh(g, stoneMat);
            m.position.set(x, y, z);
            m.rotation.set(rx || 0, ry || 0, rz || 0, "YXZ");
            h.add(m);
            return m;
        };
        // The sarsen circle: thirty uprights, seventeen still standing.
        const fallen = { 8: 1, 9: 1, 13: 1, 14: 1, 17: 1, 18: 1, 19: 1, 20: 1, 24: 1, 25: 1, 27: 1, 28: 1, 29: 1 };
        const lie = { 9: 1, 18: 1, 25: 1 };
        for (let i = 0; i < 30; i++) {
            const a = i / 30 * Math.PI * 2;
            const x = Math.cos(a) * 16.5, z = Math.sin(a) * 16.5;
            if (lie[i]) block(2.1, 4.1, 1.1, x * 1.05, 0.6, z * 1.05, -a, Math.PI / 2, 0.08);
            else if (!fallen[i]) block(2.1, 4.1, 1.1, x, 2.05, z, -a + Math.PI / 2, (r() - 0.5) * 0.05, (r() - 0.5) * 0.05);
        }
        // The lintels still up, on the run of uprights to the north-east.
        [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [29, 0], [26, 27], [10, 11], [21, 22]].forEach(([i, j]) => {
            if (fallen[i] || fallen[j]) return;
            const a = (i / 30 + (j - i === 1 || (i === 29 && j === 0) ? 1 / 60 : 0)) * Math.PI * 2;
            block(3.4, 0.8, 1.0, Math.cos(a) * 16.5, 4.5, Math.sin(a) * 16.5, -a + Math.PI / 2);
        });
        // The five trilithons, tallest at the back of the horseshoe.
        [[-1.9, 6.1], [-0.95, 6.6], [0, 7.3], [0.95, 6.6], [1.9, 6.1]].forEach(([k, ht]) => {
            const a = Math.PI + k * 0.55;
            const cx = Math.cos(a) * 8.5, cz = Math.sin(a) * 8.5;
            const tx = -Math.sin(a), tz = Math.cos(a);
            block(2.2, ht, 1.2, cx + tx * 1.3, ht / 2, cz + tz * 1.3, -a + Math.PI / 2);
            block(2.2, ht, 1.2, cx - tx * 1.3, ht / 2, cz - tz * 1.3, -a + Math.PI / 2);
            block(5.0, 0.9, 1.1, cx, ht + 0.45, cz, -a + Math.PI / 2);
        });
        // The bluestones.
        for (let i = 0; i < 34; i++) {
            if (r() < 0.3) continue;
            const a = i / 34 * Math.PI * 2;
            const ht = 1.4 + r() * 0.8;
            block(0.8, ht, 0.5, Math.cos(a) * 12, ht / 2, Math.sin(a) * 12, -a + Math.PI / 2);
        }
        for (let i = 0; i < 13; i++) {
            const a = Math.PI + (i / 12 - 0.5) * 3.3;
            const ht = 1.8 + r() * 0.6;
            block(0.6, ht, 0.5, Math.cos(a) * 5.6, ht / 2, Math.sin(a) * 5.6, -a + Math.PI / 2);
        }
        // The Heel Stone, leaning out on the avenue.
        block(2.4, 4.8, 2.0, 40, 2.2, 6, 0.3, 0, 0.18);
        // The Altar Stone, and the girl laid on it.
        block(1.0, ALTAR_TOP, 4.8, 0, ALTAR_TOP / 2, -0.6, 0);
        this.pilotAltar = new THREE.Group();
        this.pilotAltar.position.set(0, ALTAR_TOP, 0.4);
        h.add(this.pilotAltar);
        // The torches.
        this.torches = [];
        [[3.2, 2.0], [-3.2, 2.0], [3.2, -3.4], [-3.2, -3.4]].forEach(([x, z], i) => {
            const pole = new THREE.Mesh(this._own(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 6)), this._own(new THREE.MeshStandardMaterial({ color: 0x2a1c10 })));
            pole.position.set(x, 0.9, z);
            const flame = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
                map: this._glowTex, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            flame.position.set(x, 1.95, z);
            flame.scale.setScalar(0.8);
            const light = new THREE.PointLight(0xff9a40, 1.4, 14, 2);
            light.position.set(x, 2.1, z);
            h.add(pole, flame, light);
            this.torches.push({ flame, light, seed: i * 1.7 });
        });
        this._buildArtifacts();
        // The seal, drawn on the grass round the altar.
        this.sealTex = this._own(new THREE.CanvasTexture(sealCanvas()));
        this.groundSeal = new THREE.Mesh(this._own(new THREE.PlaneGeometry(18, 18)), this._own(new THREE.MeshBasicMaterial({
            map: this.sealTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })));
        this.groundSeal.rotation.x = -Math.PI / 2;
        this.groundSeal.position.set(0, 0.03, -0.6);
        h.add(this.groundSeal);
        // The pillar of gold that takes her.
        this.pillar = new THREE.Mesh(this._own(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true)), this._own(new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffd27a) }, uPush: { value: 0 } },
            vertexShader: FRESNEL_VERT,
            fragmentShader: BEAM_FRAG,
            transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false
        })));
        this.pillar.frustumCulled = false;
        h.add(this.pillar);
        this.pillarGlow = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })));
        h.add(this.pillarGlow);
        this.hengeBlood = new Spray(this, 500, false);
        this.hengeBlood.mat.fog = false;
        h.add(this.hengeBlood.points);
        this.hengeMotes = new Spray(this, 900, true);
        this.hengeMotes.mat.fog = false;
        h.add(this.hengeMotes.points);
        this.bloodPool = new THREE.Mesh(this._own(new THREE.CircleGeometry(1, 32)), this._own(new THREE.MeshBasicMaterial({
            color: 0x4a0006, transparent: true, opacity: 0.9, depthWrite: false
        })));
        this.bloodPool.rotation.x = -Math.PI / 2;
        this.bloodPool.position.set(0, ALTAR_TOP + 0.005, -0.3);
        h.add(this.bloodPool);
    };

    // The seventeen weapons, forged by the weapon system from a seed of their
    // own each (so no two are alike and no two plays are alike), copied off
    // its cache with materials of their own, and laid tip-forward along +Z.
    function artifactModel(i, wtype, seed) {
        const WSP = window.WeaponSystemProcedural;
        if (!WSP || typeof WSP.createModel !== "function") return null;
        try {
            return WSP.createModel({ id: 990001 + i, name: "", note: "", wtypeId: wtype, meta: { ForgeSeed: seed } }) || null;
        } catch (e) {
            console.warn("[StartinMovie] the weapon system could not forge a blade", e);
            return null;
        }
    }

    // Weapons that strike with a heavy head (mace, axe, staff); everything else
    // goes in point first.
    const STRIKE_HEAD = new Set([3, 4, 6]);
    // A weapon laid along +Z (grip at 0, far end at `len`) turned round when
    // the end that should strike is the near one: measured, not assumed,
    // since the weapon system does not build every type the same way round.
    function strikeEndForward(g, len, headFirst) {
        g.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
        const m = new THREE.Matrix4();
        const v = new THREE.Vector3();
        let near = 0, far = 0;
        g.traverse((o) => {
            if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
            m.multiplyMatrices(inv, o.matrixWorld);
            const pos = o.geometry.attributes.position;
            const step = Math.max(1, Math.floor(pos.count / 400));
            for (let i = 0; i < pos.count; i += step) {
                v.fromBufferAttribute(pos, i).applyMatrix4(m);
                const r = Math.hypot(v.x, v.y);
                if (v.z < len * 0.2) near = Math.max(near, r);
                else if (v.z > len * 0.8) far = Math.max(far, r);
            }
        });
        const farIsStriking = headFirst ? far >= near : far <= near;
        if (farIsStriking) return g;
        const outer = new THREE.Group();
        g.rotation.y = Math.PI;
        g.position.z = len;
        outer.add(g);
        return outer;
    }

    MovieStage.prototype._buildArtifacts = function () {
        const own = (x) => this._own(x);
        const steel = own(new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.9, roughness: 0.25 }));
        const play = (Math.random() * 0x7fffffff) >>> 0;
        this.artifacts = STABS.map((st, i) => {
            const len = STAB_LENGTH[st.wtype] || 1;
            const built = artifactModel(i, st.wtype, (play + i * 0x9E3779B1) >>> 0);
            let g;
            if (built) {
                built.traverse((o) => {
                    if (!o.isMesh) return;
                    o.frustumCulled = false;
                    const copy = (m) => (m && m.clone ? own(m.clone()) : m);
                    o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
                });
                g = strikeEndForward(laidAlongZ(built, len), len, STRIKE_HEAD.has(st.wtype));
            } else {
                g = new THREE.Group();
                const blade = new THREE.Mesh(own(new THREE.ConeGeometry(0.03, len, 6)), steel);
                blade.rotation.x = Math.PI / 2;
                blade.position.z = len / 2;
                g.add(blade);
            }
            g.visible = false;
            this.henge.add(g);
            // The line it comes down along: from high up, off its bearing.
            const dir = new THREE.Vector3(Math.cos(st.bearing) * Math.cos(st.fall), -Math.sin(st.fall), Math.sin(st.bearing) * Math.cos(st.fall)).normalize();
            return { group: g, len, dir, stab: st };
        });
        // The blood that runs off the stone and pools on the grass.
        this.groundPool = new THREE.Mesh(own(new THREE.CircleGeometry(1, 32)), own(new THREE.MeshBasicMaterial({
            color: 0x3a0005, transparent: true, opacity: 0.9, depthWrite: false
        })));
        this.groundPool.rotation.x = -Math.PI / 2;
        this.groundPool.position.set(0.75, 0.02, -0.2);
        this.groundPool.scale.set(1.2, 0.8, 1);
        this.henge.add(this.groundPool);
    };

    MovieStage.prototype._stabPoint = function (s, out) {
        const e = this.pilotRig.entries[s.role] || this.pilotRig.entries.chest || this.pilotRig.entries.hips;
        if (e) e.bone.getWorldPosition(out); else out.set(0, ALTAR_TOP + 0.2, -0.3);
        return out.add(this._t.f.set(s.aim[0], 0.03, s.aim[1]));
    };

    MovieStage.prototype._poseHenge = function (τ) {
        this.torches.forEach((t) => {
            const f = 0.85 + 0.15 * Math.sin(τ * 13 + t.seed) * Math.sin(τ * 7.3 + t.seed * 2);
            t.flame.scale.setScalar(0.8 * f);
            t.light.intensity = 1.4 * f;
        });
        // One after another they fall out of the dark and go into her, and
        // stay in her, until the light takes her apart.
        const target = this._t.a;
        const kept = 1 - smooth(span(τ, CUE.dissolve, CUE.dissolve + 1.4));
        this.artifacts.forEach((w) => {
            const s = w.stab;
            const fly = span(τ, s.at - 0.32, s.at);
            w.group.visible = τ >= s.at - 0.32 && kept > 0.01;
            if (!w.group.visible) return;
            this._stabPoint(s, target);
            // Driven in about a quarter of its length, or a hand's breadth.
            const sink = w.len * 0.34;
            const tip = this._t.c.copy(target).addScaledVector(w.dir, sink - 12 * (1 - fly * fly));
            w.group.position.copy(tip).addScaledVector(w.dir, -w.len);
            w.group.lookAt(this._t.e.copy(w.group.position).add(w.dir));
            // A shudder as it strikes.
            const hit = decay(τ, s.at, 9) * 0.06;
            w.group.rotateX(Math.sin(τ * 70) * hit);
            w.group.scale.setScalar(kept);
        });
        // Blood: the spurts, what she coughs up, and the pool on the stone.
        const r = rng(0xb1d);
        this.hengeBlood.begin();
        const gone = 1 - smooth(span(τ, CUE.dissolve, CUE.shootUp));
        STABS.forEach((s, si) => {
            const age = τ - s.at;
            if (age < 0 || age > 2) return;
            this._stabPoint(s, target);
            for (let i = 0; i < 40; i++) {
                const r = pr(0xb1d0 + si * 131, i);
                const vx = (r() - 0.5) * 1.6, vy = 1 + r() * 2.2, vz = (r() - 0.5) * 1.6;
                this.hengeBlood.put(target.x + vx * age, target.y + vy * age - 4.9 * age * age, target.z + vz * age,
                    0.025 + r() * 0.03, (1 - age / 2) * gone, 0.5, 0.01, 0.03);
            }
        });
        const head = this.pilotRig.entries.head;
        if (head && τ >= CUE.spit && τ < CUE.spit + 2.2) {
            head.bone.getWorldPosition(target);
            const age = τ - CUE.spit;
            for (let i = 0; i < 70; i++) {
                const r = pr(0xb1d1, i);
                const vx = (r() - 0.5) * 0.8, vy = 1.4 + r() * 1.8, vz = (r() - 0.3) * 0.8;
                this.hengeBlood.put(target.x + vx * age, target.y + 0.08 + vy * age - 4.9 * age * age, target.z + 0.1 + vz * age,
                    0.02 + r() * 0.025, Math.max(0, 1 - age / 2.2) * gone, 0.55, 0.0, 0.02);
            }
        }
        this.hengeBlood.end();
        const pool = smooth(span(τ, CUE.impale, CUE.dead + 1));
        this.bloodPool.visible = pool > 0.01 && gone > 0.01;
        this.bloodPool.scale.set(0.15 + 0.6 * pool, 0.15 + 2.2 * pool, 1);
        this.bloodPool.material.opacity = 0.92 * gone;
        // It runs over the edge of the stone and spreads on the grass.
        const ground = smooth(span(τ, CUE.impale + 2.5, CUE.pillar));
        this.groundPool.visible = ground > 0.01;
        this.groundPool.scale.set(0.2 + 1.6 * ground, 0.15 + 1.2 * ground, 1);
        // The seal burns up out of the grass as she dies.
        const seal = smooth(span(τ, CUE.seal, CUE.seal + 1.2)) * (1 - smooth(span(τ, CUE.shootUp + 0.6, CUE.arc)));
        this.groundSeal.material.opacity = seal * (0.85 + 0.15 * Math.sin(τ * 6));
        this.groundSeal.rotation.z = τ * 0.12;
        // The pillar comes down on her, and goes back up with her in it.
        const down = smooth(span(τ, CUE.pillar, CUE.dissolve));
        const up = smooth(span(τ, CUE.shootUp, CUE.arc - 0.1));
        const thick = lerp(0.2, 1.6, down) * (1 - up * 0.85);
        const bottom = lerp(ALTAR_TOP + 300, ALTAR_TOP, down) + up * 260;
        const top = 600;
        this.pillar.visible = down > 0.001 && up < 0.999;
        this.pillar.position.set(0, (bottom + top) / 2, -0.3);
        this.pillar.scale.set(thick, Math.max(0.1, top - bottom), thick);
        this.pillar.material.uniforms.uOpacity.value = down * (1 - up * 0.5);
        this.pillar.material.uniforms.uTime.value = τ;
        this.pillarGlow.position.set(0, Math.max(ALTAR_TOP, bottom) + 0.5, -0.3);
        this.pillarGlow.scale.setScalar(6 + 10 * down);
        this.pillarGlow.material.opacity = down * (1 - up);
        // What is left of her rising as light.
        this.hengeMotes.begin();
        if (τ > CUE.dissolve - 0.2 && τ < CUE.arc) {
            const chest = this.pilotRig.entries.chest;
            if (chest) chest.bone.getWorldPosition(target); else target.set(0, ALTAR_TOP + 0.2, -0.3);
            for (let i = 0; i < 900; i++) {
                const r = pr(0xb1d2, i);
                const born = CUE.dissolve + r() * 2.2;
                const age = τ - born;
                const ox = (r() - 0.5) * 0.6, oz = (r() - 0.5) * 1.6, sp = 2 + r() * 6;
                if (age < 0 || age > 3) continue;
                this.hengeMotes.put(target.x + ox * (1 - age * 0.3), target.y + sp * age * age, target.z + oz * (1 - age * 0.3),
                    0.04 + r() * 0.05, (1 - age / 3), 1, 0.85, 0.45);
            }
        }
        this.hengeMotes.end();
    };

    //--- the giant -----------------------------------------------------------

    function goldCompile(m, u, halo) {
        m.onBeforeCompile = function (shader) {
            shader.uniforms.uRim = u.uRim;
            shader.uniforms.uDissolve = u.uDissolve;
            shader.uniforms.uPush = u.uPush;
            shader.vertexShader = "uniform float uPush;\nvarying vec3 vDPos;\n" + shader.vertexShader
                .replace("#include <skinning_vertex>", "#include <skinning_vertex>\n" +
                    (halo ? "transformed += normalize(objectNormal) * uPush;\n" : "") + "vDPos = transformed;");
            shader.fragmentShader = "uniform vec3 uRim;\nuniform float uDissolve;\nvarying vec3 vDPos;\n" + GLSL_NOISE + "\n" +
                shader.fragmentShader.replace("#include <dithering_fragment>", [
                    "float smvF = 1.0 - abs(dot(normal, normalize(vViewPosition)));",
                    halo ? "gl_FragColor.rgb *= pow(smvF, 1.6);" : "gl_FragColor.rgb += uRim * pow(smvF, 2.2) * 1.6;",
                    "float smvN = smvNoise(vDPos * 9.0);",
                    "if (smvN < uDissolve) discard;",
                    "gl_FragColor.rgb += vec3(1.0, 0.85, 0.4) * (1.0 - smoothstep(uDissolve, uDissolve + 0.08, smvN)) * step(0.001, uDissolve) * 3.0;",
                    "#include <dithering_fragment>"
                ].join("\n"));
        };
        m.customProgramCacheKey = () => (halo ? "startinGoldHalo" : "startinGold");
    }

    MovieStage.prototype._buildGiant = function (fig) {
        const model = fig.model;
        this.giantRig = fig.rig;
        // Made of light, she weighs nothing: the hair floats free.
        if (this.giantRig.physics) {
            this.giantRig.physics.gravityScale = 0;
            this.giantRig.physics.float = 0.35;
        }
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const tall = (box.max.y - box.min.y) || 1.6;
        const k = GIANT_H / tall;
        this.giantScale = k;
        this.giantU = {
            uRim: { value: new THREE.Color(0xfff0b0) },
            uDissolve: { value: 0 },
            uPush: { value: 0.012 }
        };
        const halos = [];
        model.traverse((o) => {
            if (!o.isMesh) return;
            o.frustumCulled = false;
            const src = Array.isArray(o.material) ? o.material[0] : o.material;
            const m = this._own(new THREE.MeshStandardMaterial({
                color: GOLD, emissive: 0x9a6408, emissiveIntensity: 1.0,
                roughness: 0.32, metalness: 0,
                alphaTest: (src && src.alphaTest) || 0, map: (src && src.map) || null,
                side: (src && src.side) || THREE.FrontSide
            }));
            m.skinning = !!o.isSkinnedMesh;
            m.morphTargets = !!(src && src.morphTargets);
            goldCompile(m, this.giantU, false);
            o.material = m;
            if (o.isSkinnedMesh) halos.push(o);
        });
        // A shell of light a hair outside the gold, moving with the bones.
        halos.forEach((o) => {
            const m = this._own(new THREE.MeshStandardMaterial({
                color: 0x000000, emissive: 0xffd270, emissiveIntensity: 1.2,
                transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
            }));
            m.skinning = true;
            goldCompile(m, this.giantU, true);
            const shell = new THREE.SkinnedMesh(o.geometry, m);
            shell.bind(o.skeleton, o.bindMatrix);
            shell.frustumCulled = false;
            o.parent.add(shell);
        });
        model.scale.setScalar(k);
        settleRig(this.giantRig, "idle");
        this.giantModel = model;
        this.giantLift = -box.min.y * k;
        this.giantPivot = new THREE.Group();
        this.giantRoot = new THREE.Group();
        this.giantRoot.position.set(0, R, 0);
        this.giantRoot.add(model);
        this.giantPivot.add(this.giantRoot);
        this.main.add(this.giantPivot);
    };

    MovieStage.prototype._poseGiant = function (τ, dt) {
        // Out of the tower, then the first steps along the curvature.
        const rise = smooth(span(τ, CUE.rise, CUE.stand));
        this.giantModel.visible = τ >= CUE.rise;
        this.giantModel.position.y = this.giantLift - GIANT_H * 1.05 * (1 - rise);
        // Her first steps carry her a long way round the curve of the Earth,
        // away from the tower: the stride below is slowed to match the ground.
        this.giantPivot.rotation.x = WALK_ARC * smooth(span(τ, CUE.stand, CUE.hush));
        this._poseLeap(τ);
        // A body that size moves slowly: the rig runs at under half speed.
        const pace = giantLoop(τ) === "walk" ? WALK_PACE : 0.45;
        driveRig(this.giantRig, giantLoop(τ), (dt || 0) * pace, (p) => giantLayers(p, τ, this.variant));
        // The gold closes over the body last, and comes apart at the end.
        const form = 1 - smooth(span(τ, LAYERS.skin[0], LAYERS.skin[1]));
        const shatter = smooth(span(τ, CUE.shatter + 0.2, CUE.fall));
        this.giantU.uDissolve.value = Math.max(form, shatter) * 1.02;
        this._poseAnatomy(τ);
    };

    // On a natural 1 she leaves the ground: a leap across the sky at him that
    // the Moon stops, and back down onto the curvature.
    MovieStage.prototype._poseLeap = function (τ) {
        const root = this.giantRoot;
        root.position.set(0, R, 0);
        root.quaternion.identity();
        if (!this.variant || this.variant.kind !== "fists") return;
        const leap = window4(τ, CUE.jump, CUE.formHit - 0.2, CUE.formHit + 0.15, CUE.spear - 0.05);
        if (leap <= 0) return;
        this.giantPivot.updateMatrixWorld(true);
        // To where her fist meets the Moon.
        const P0 = this._t.e.copy(this.leapPoint || this.moonPos);
        const reach = this._t.f.copy(P0).sub(this._t.d.set(0, R, 0)).normalize();
        const to = this._t.d.copy(P0).addScaledVector(reach, -GIANT_H * 0.8);
        this.giantPivot.worldToLocal(to);
        root.position.lerp(to, smooth(leap));
        root.position.y += Math.sin(leap * Math.PI) * GIANT_H * 0.6;
        const tilt = this._t.f.copy(to).sub(this._t.e.set(0, R, 0)).normalize();
        root.quaternion.setFromUnitVectors(this._t.e.set(0, 1, 0), tilt);
        root.quaternion.slerp(this._qId || (this._qId = new THREE.Quaternion()), 1 - smooth(leap) * 0.6);
    };

    //--- the body under the gold ---------------------------------------------

    // Every limb of her rig, parent to child: what the bones, veins, nerves
    // and muscles are laid along, so they move with her as she walks.
    const SEGMENTS = [
        ["hips", "spine", 0.11], ["spine", "chest", 0.12], ["chest", "upperChest", 0.13],
        ["upperChest", "neck", 0.05], ["neck", "head", 0.045],
        ["upperChest", "lUpperArm", 0.05], ["lUpperArm", "lLowerArm", 0.045], ["lLowerArm", "lHand", 0.035],
        ["upperChest", "rUpperArm", 0.05], ["rUpperArm", "rLowerArm", 0.045], ["rLowerArm", "rHand", 0.035],
        ["hips", "lUpperLeg", 0.07], ["lUpperLeg", "lLowerLeg", 0.07], ["lLowerLeg", "lFoot", 0.05],
        ["hips", "rUpperLeg", 0.07], ["rUpperLeg", "rLowerLeg", 0.07], ["rLowerLeg", "rFoot", 0.05]
    ];

    function striationCanvas() {
        return canvasOf(64, 256, (ctx, w, h) => {
            ctx.fillStyle = "#7a1018";
            ctx.fillRect(0, 0, w, h);
            const r = rng(0x5717);
            for (let x = 0; x < w; x += 2) {
                ctx.fillStyle = "rgba(" + (150 + Math.floor(r() * 80)) + ",30,40," + (0.3 + r() * 0.5) + ")";
                ctx.fillRect(x, 0, 1, h);
            }
            for (let i = 0; i < 40; i++) {
                ctx.fillStyle = "rgba(240,220,200,0.35)";
                ctx.fillRect(0, r() * h, w, 1);
            }
        });
    }

    MovieStage.prototype._buildAnatomy = function () {
        const rig = this.giantRig;
        this.giantModel.updateMatrixWorld(true);
        const mats = {
            bone: this._own(new THREE.MeshStandardMaterial({ color: 0xeee6d2, emissive: 0x3a3020, roughness: 0.6, transparent: true })),
            vein: this._own(new THREE.MeshBasicMaterial({ color: 0xe0142c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
            artery: this._own(new THREE.MeshBasicMaterial({ color: 0x3050ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
            nerve: this._own(new THREE.MeshBasicMaterial({ color: 0xfff0b8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
            muscle: this._own(new THREE.MeshStandardMaterial({
                map: this._own(new THREE.CanvasTexture(striationCanvas())), color: 0xffffff, emissive: 0x401010,
                roughness: 0.5, transparent: true
            }))
        };
        this.anatomyMats = mats;
        this.anatomy = { bones: [], veins: [], nerves: [], muscles: [] };
        const Y = new THREE.Vector3(0, 1, 0);
        const depthOf = { upperChest: 0, chest: 1, neck: 1, spine: 2, head: 2, lUpperArm: 1, rUpperArm: 1, hips: 3,
            lLowerArm: 2, rLowerArm: 2, lUpperLeg: 4, rUpperLeg: 4, lHand: 3, rHand: 3, lLowerLeg: 5, rLowerLeg: 5, lFoot: 6, rFoot: 6 };
        const r = rng(0xa9a7);
        SEGMENTS.forEach(([from, to, rad0]) => {
            const a = rig.entries[from], b = rig.entries[to];
            if (!a || !b) return;
            // A radius in metres of her, in this bone's own units (the export's
            // bones need not be in metres).
            const rad = rad0 * this._boneUnit(a.bone);
            const end = a.bone.worldToLocal(b.bone.getWorldPosition(new THREE.Vector3()));
            const len = end.length();
            if (len < 1e-4) return;
            const dir = end.clone().normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(Y, dir);
            const delay = (depthOf[to] || 0) / 7;
            // The bone itself, and the knob of the joint at its end.
            const shaft = new THREE.Mesh(this._own(new THREE.CylinderGeometry(rad * 0.22, rad * 0.26, len * 0.92, 8)), mats.bone);
            shaft.position.copy(end).multiplyScalar(0.5);
            shaft.quaternion.copy(q);
            const knob = new THREE.Mesh(this._own(new THREE.SphereGeometry(rad * 0.34, 10, 8)), mats.bone);
            knob.position.copy(end);
            a.bone.add(shaft, knob);
            this.anatomy.bones.push({ meshes: [shaft, knob], delay });
            // The muscle round it: a striated spindle.
            const muscle = new THREE.Mesh(this._own(new THREE.SphereGeometry(1, 16, 12)), mats.muscle);
            muscle.position.copy(end).multiplyScalar(0.5);
            muscle.quaternion.copy(q);
            muscle.userData.size = new THREE.Vector3(rad * 0.95, len * 0.55, rad * 0.95);
            muscle.scale.setScalar(0.0001);
            a.bone.add(muscle);
            this.anatomy.muscles.push({ mesh: muscle, delay });
            // Veins and arteries wound round the limb, and a nerve down its middle.
            const side1 = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
            const side2 = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
            const tube = (ring, turns, phase, thick, mat, list) => {
                const pts = [];
                for (let i = 0; i <= 24; i++) {
                    const u = i / 24;
                    const ang = phase + u * turns * Math.PI * 2;
                    pts.push(end.clone().multiplyScalar(u)
                        .addScaledVector(side1, Math.cos(ang) * ring)
                        .addScaledVector(side2, Math.sin(ang) * ring));
                }
                const g = this._own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, thick, 5, false));
                const m = new THREE.Mesh(g, mat);
                m.frustumCulled = false;
                a.bone.add(m);
                list.push({ mesh: m, delay: delay + r() * 0.08, count: g.index ? g.index.count : 0 });
            };
            tube(rad * 1.02, 0.6 + r() * 0.5, r() * 6, rad * 0.06, mats.vein, this.anatomy.veins);
            tube(rad * 1.0, -0.4 - r() * 0.6, r() * 6, rad * 0.05, mats.vein, this.anatomy.veins);
            tube(rad * 0.98, 0.3 + r() * 0.4, r() * 6, rad * 0.055, mats.artery, this.anatomy.veins);
            tube(rad * 0.3, 0.15, r() * 6, rad * 0.03, mats.nerve, this.anatomy.nerves);
            tube(rad * 0.7, 1.2, r() * 6, rad * 0.018, mats.nerve, this.anatomy.nerves);
        });
        this._buildBones(depthOf);
        this._buildMagician();
    };

    // Her skeleton, made to her own measure: every piece is laid where her rig
    // puts it (metres in her model's axes, from the bone it rides on) and
    // rides that bone, so it walks when she walks. Skull and jaw, a spine of
    // vertebrae, the ribcage and sternum, collarbones and shoulder blades, the
    // pelvis, the paired bones of forearm and shin, fingers and feet.
    MovieStage.prototype._buildBones = function (depthOf) {
        const rig = this.giantRig;
        const k = this.giantScale;
        const mat = this.anatomyMats.bone;
        const socket = this._own(new THREE.MeshBasicMaterial({ color: 0x0a0604, transparent: true }));
        this.anatomyMats.socket = socket;
        const own = (g) => this._own(g);
        const modelQ = this.giantModel.getWorldQuaternion(new THREE.Quaternion());
        const at = (role) => (rig.entries[role] ? rig.entries[role].bone.getWorldPosition(new THREE.Vector3()) : null);
        const Y = new THREE.Vector3(0, 1, 0);
        // A piece on `role`'s bone at world point `wp`, turned to `q` (model
        // axes), with its own resting scale.
        const place = (role, geo, wp, q, scale, delay, m) => {
            const e = rig.entries[role];
            if (!e || !wp) return null;
            const mesh = new THREE.Mesh(own(geo), m || mat);
            e.bone.add(mesh);
            mesh.position.copy(e.bone.worldToLocal(wp.clone()));
            const bq = e.bone.getWorldQuaternion(new THREE.Quaternion()).invert();
            mesh.quaternion.copy(bq.multiply(modelQ.clone().multiply(q || new THREE.Quaternion())));
            mesh.userData.base = (scale || new THREE.Vector3(1, 1, 1)).clone().multiplyScalar(this._boneUnit(e.bone));
            this.anatomy.bones.push({ meshes: [mesh], delay: delay === undefined ? (depthOf[role] || 0) / 7 : delay });
            return mesh;
        };
        const off = (p, x, y, z) => p.clone().add(new THREE.Vector3(x, y, z).applyQuaternion(modelQ).multiplyScalar(k));
        const along = (a, b) => new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize().applyQuaternion(modelQ.clone().invert()));
        // A bone between two points: a shaft with a knob at each end.
        const longBone = (role, a, b, rad, delay) => {
            const len = a.distanceTo(b) / k;
            const mid = a.clone().lerp(b, 0.5);
            place(role, new THREE.CylinderGeometry(rad * 0.7, rad * 0.8, len * 0.86, 8), mid, along(a, b), null, delay);
            place(role, new THREE.SphereGeometry(rad * 1.25, 8, 6), a.clone().lerp(b, 0.06), null, null, delay);
            place(role, new THREE.SphereGeometry(rad * 1.2, 8, 6), a.clone().lerp(b, 0.94), null, null, delay);
        };
        const head = at("head"), neck = at("neck"), upper = at("upperChest"), chest = at("chest"),
            spine = at("spine"), hips = at("hips");
        // The skull: the vault, the face under it, two sockets, and the jaw.
        if (head) {
            place("head", new THREE.SphereGeometry(0.082, 18, 14), off(head, 0, 0.085, -0.005), null, new THREE.Vector3(0.92, 1.0, 1.12), 0.2);
            place("head", new THREE.SphereGeometry(0.052, 14, 10), off(head, 0, 0.04, 0.045), null, new THREE.Vector3(1, 0.9, 0.8), 0.2);
            [-1, 1].forEach((side) => place("head", new THREE.SphereGeometry(0.017, 10, 8), off(head, side * 0.031, 0.062, 0.083), null, null, 0.2, socket));
            place("head", new THREE.SphereGeometry(0.01, 8, 6), off(head, 0, 0.036, 0.094), null, new THREE.Vector3(1, 1.4, 0.6), 0.2, socket);
            place("head", new THREE.TorusGeometry(0.042, 0.009, 6, 14, Math.PI), off(head, 0, 0.005, 0.03),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.25, 0, Math.PI)), new THREE.Vector3(1, 1.1, 1), 0.22);
        }
        // The spine: one vertebra every few centimetres, from the tailbone to
        // the skull, laid just behind the line of the body.
        const chain = [hips, spine, chest, upper, neck, head];
        const roles = ["hips", "spine", "chest", "upperChest", "neck"];
        for (let i = 0; i < roles.length; i++) {
            const a = chain[i], b = chain[i + 1];
            if (!a || !b) continue;
            const n = Math.max(2, Math.round(a.distanceTo(b) / k / 0.03));
            for (let j = 0; j < n; j++) {
                const p = off(a.clone().lerp(b, (j + 0.5) / n), 0, 0, i < 4 ? -0.045 : -0.02);
                place(roles[i], new THREE.CylinderGeometry(0.019, 0.021, 0.016, 10), p, along(a, b), null, (depthOf[roles[i]] || 0) / 7 + j * 0.01);
                place(roles[i], new THREE.BoxGeometry(0.008, 0.012, 0.03), off(p, 0, 0, -0.02), along(a, b), null, (depthOf[roles[i]] || 0) / 7 + j * 0.01);
            }
        }
        // The ribcage: twelve pairs of hoops round the chest, open at the front
        // where the sternum closes them.
        if (chest && upper) {
            for (let i = 0; i < 12; i++) {
                const u = i / 11;
                const y = (1 - u) * 0.1 - u * 0.11;
                const rad = 0.075 + 0.04 * Math.sin(Math.PI * (0.25 + u * 0.6));
                const role = u < 0.5 ? "upperChest" : "chest";
                const base = u < 0.5 ? upper : chest;
                const hoop = new THREE.TorusGeometry(rad, 0.006, 5, 24, Math.PI * 1.7);
                place(role, hoop, off(base, 0, y + (u < 0.5 ? 0 : 0.1), -0.01),
                    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.2, 0, Math.PI / 2 + Math.PI * 0.15)),
                    new THREE.Vector3(1.15, 0.85, 1), 0.05 + u * 0.12);
            }
            place("upperChest", new THREE.BoxGeometry(0.03, 0.16, 0.012), off(upper, 0, -0.02, 0.085), null, null, 0.05);
        }
        // Collarbones and shoulder blades.
        ["l", "r"].forEach((side) => {
            const sh = at(side + "UpperArm");
            if (upper && sh) {
                longBone("upperChest", off(upper, 0, 0.07, 0.06), off(sh, 0, 0.01, 0.02), 0.009, 0.08);
                place("upperChest", new THREE.SphereGeometry(0.06, 10, 8), off(upper, (side === "l" ? 1 : -1) * 0.07, 0.01, -0.07), null, new THREE.Vector3(1, 1.2, 0.2), 0.08);
            }
        });
        // The pelvis: the ring, and the two wings of the hip.
        if (hips) {
            place("hips", new THREE.TorusGeometry(0.075, 0.018, 8, 20), off(hips, 0, -0.03, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.4, 0, 0)), new THREE.Vector3(1.1, 0.8, 1), 0.3);
            [-1, 1].forEach((side) => place("hips", new THREE.SphereGeometry(0.06, 10, 8), off(hips, side * 0.085, 0.02, -0.01), null, new THREE.Vector3(0.45, 1, 0.9), 0.3));
        }
        // Forearm and shin are two bones each; the second rides beside the first.
        [["lLowerArm", "lHand", 0.007], ["rLowerArm", "rHand", 0.007], ["lLowerLeg", "lFoot", 0.008], ["rLowerLeg", "rFoot", 0.008]].forEach(([a, b, rad]) => {
            const pa = at(a), pb = at(b);
            if (pa && pb) longBone(a, off(pa, 0, 0, -0.02), off(pb, 0, 0, -0.015), rad, (depthOf[b] || 0) / 7);
        });
        // The hands, built off the end of the forearm (her rig's finger joints
        // do not sit where the forearm ends): palm bones, four fingers and a
        // thumb, all riding the hand joint.
        ["l", "r"].forEach((side) => {
            const hand = at(side + "Hand"), elbow = at(side + "LowerArm");
            if (!hand || !elbow) return;
            const dir = hand.clone().sub(elbow).normalize();
            const ref = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            const across = new THREE.Vector3().crossVectors(dir, ref).normalize();
            const P = (alongM, acrossM) => hand.clone().addScaledVector(dir, alongM * k).addScaledVector(across, acrossM * k);
            for (let f = 0; f < 4; f++) {
                const o = (f - 1.5) * 0.017;
                longBone(side + "Hand", P(0.005, o * 0.6), P(0.07, o), 0.004, 0.5);
                longBone(side + "Hand", P(0.075, o), P(0.115 + (f === 1 || f === 2 ? 0.01 : 0), o * 1.1), 0.0035, 0.55);
                longBone(side + "Hand", P(0.12, o * 1.1), P(0.145, o * 1.15), 0.003, 0.6);
            }
            longBone(side + "Hand", P(0.01, 0.025), P(0.045, 0.05), 0.0045, 0.5);
            longBone(side + "Hand", P(0.05, 0.052), P(0.08, 0.065), 0.0035, 0.55);
        });
        // The feet: heel to toes, five rays across each.
        ["l", "r"].forEach((side) => {
            const foot = at(side + "Foot");
            if (!foot) return;
            for (let t = -2; t <= 2; t++) {
                longBone(side + "Foot", off(foot, t * 0.008, -0.02, -0.01), off(foot, t * 0.016, -0.07, 0.15), 0.004, 0.95);
            }
            place(side + "Foot", new THREE.SphereGeometry(0.025, 8, 6), off(foot, 0, -0.05, -0.04), null, new THREE.Vector3(0.8, 0.9, 1.3), 0.95);
        });
    };

    // How far along a layer is at τ (0 to 1 as it forms), and how much of it
    // still shows once the next layer has closed over it.
    function layerGrowth(τ, L) { return span(τ, L[0], L[1]); }
    function layerShows(τ, L) { return 1 - smooth(span(τ, L[2], L[3])); }

    // The Magician, reversed, held before the skull's face: it hangs there
    // while she is bones and veins, and is gone once the muscles grow.
    // How many of a bone's own units make one metre of her: her model is
    // scaled to the giant, and a bone may carry a scale of its own on top.
    MovieStage.prototype._boneUnit = function (bone) {
        const s = bone.getWorldScale(new THREE.Vector3()).x;
        return s > 1e-9 ? this.giantScale / s : 1;
    };

    MovieStage.prototype._buildMagician = function () {
        const e = this.giantRig.entries.head;
        if (!e) return;
        const tex = this._own(new THREE.TextureLoader().load("img/arcana/1.png"));
        if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
        // A unit card, sized in the world each frame: kept out of the bone's
        // own hierarchy so no scale the model's bones carry can blow it up.
        const card = new THREE.Mesh(this._own(new THREE.PlaneGeometry(1, ARCANA_RATIO)), this._own(new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false
        })));
        const k = this.giantScale;
        const modelQ = this.giantModel.getWorldQuaternion(new THREE.Quaternion());
        // Just before the skull, as wide as it is.
        const wp = e.bone.getWorldPosition(new THREE.Vector3())
            .add(new THREE.Vector3(0, 0.08, 0.12).applyQuaternion(modelQ).multiplyScalar(k));
        // Facing out of her face, and upside down: reversed.
        const want = modelQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI)));
        const boneQ = e.bone.getWorldQuaternion(new THREE.Quaternion());
        card.visible = false;
        this.main.add(card);
        this.magician = card;
        this.magicianHome = {
            bone: e.bone,
            local: e.bone.worldToLocal(wp.clone()),
            rel: boneQ.clone().invert().multiply(want),
            size: 0.11 * k
        };
    };

    // When the gold has nearly closed over her, the card comes away from her
    // face and drops, turning over, all the way down to the ground.
    function magicianFalls() { return LAYERS.skin[0] + 0.75 * (LAYERS.skin[1] - LAYERS.skin[0]); }

    MovieStage.prototype._poseMagician = function (τ) {
        const card = this.magician, home = this.magicianHome;
        const drop = magicianFalls();
        const age = τ - drop;
        card.scale.setScalar(home.size);
        if (age < 0) {
            // On her face (and back on it if the clock goes back past the drop),
            // following her head as it turns.
            this._magicianFall = null;
            home.bone.updateWorldMatrix(true, false);
            card.position.copy(home.local).applyMatrix4(home.bone.matrixWorld);
            card.quaternion.copy(home.bone.getWorldQuaternion(this._magicianQ || (this._magicianQ = new THREE.Quaternion()))).multiply(home.rel);
            const k = smooth(span(τ, LAYERS.bones[0] + 0.5, LAYERS.bones[1] + 0.5));
            card.visible = k > 0.01;
            card.material.opacity = k;
            return;
        }
        if (!this._magicianFall) {
            // Let go where it is.
            this._magicianFall = {
                pos: card.position.clone(),
                quat: card.quaternion.clone(),
                down: card.position.clone().normalize().negate(),
                drift: this.front.clone().multiplyScalar(14).addScaledVector(this.side, -9)
            };
        }
        const f = this._magicianFall;
        // Down onto the curve it hangs over, drifting and turning over.
        const fall = Math.min(0.5 * 95 * age * age, f.pos.length() - R);
        card.position.copy(f.pos).addScaledVector(f.down, fall).addScaledVector(f.drift, age);
        const spin = this._magicianSpin || (this._magicianSpin = new THREE.Quaternion());
        spin.setFromAxisAngle(this._t.e.set(0.6, 1, 0.25).normalize(), age * 2.4);
        card.quaternion.copy(f.quat).multiply(spin);
        const k = 1 - smooth(span(age, 3, 4.5));
        card.visible = k > 0.01;
        card.material.opacity = k;
    };

    MovieStage.prototype._poseAnatomy = function (τ) {
        if (this.magician) this._poseMagician(τ);
        if (!this.anatomy) return;
        const per = (g, delay) => clamp01((g - delay * 0.6) / 0.4);
        const shatter = 1 - smooth(span(τ, CUE.shatter, CUE.shatter + 0.5));
        const bonesG = layerGrowth(τ, LAYERS.bones), bonesS = layerShows(τ, LAYERS.bones);
        this.anatomyMats.bone.opacity = bonesS;
        if (this.anatomyMats.socket) this.anatomyMats.socket.opacity = bonesS;
        this.anatomy.bones.forEach((b) => {
            const k = Math.max(0.0001, per(bonesG, b.delay));
            b.meshes.forEach((m) => {
                m.visible = k > 0.01 && bonesS > 0.01;
                if (m.userData.base) m.scale.copy(m.userData.base).multiplyScalar(k); else m.scale.setScalar(k);
            });
        });
        const draw = (list, L, mat, base) => {
            const g = layerGrowth(τ, L), show = layerShows(τ, L);
            mat.opacity = base * show * shatter;
            list.forEach((v) => {
                const k = per(g, v.delay);
                v.mesh.visible = k > 0.01 && show > 0.01;
                v.mesh.geometry.setDrawRange(0, Math.floor(v.count * k / 3) * 3);
            });
        };
        draw(this.anatomy.veins, LAYERS.veins, this.anatomyMats.vein, 0.95);
        this.anatomyMats.artery.opacity = this.anatomyMats.vein.opacity;
        draw(this.anatomy.nerves, LAYERS.nerves, this.anatomyMats.nerve, 0.9);
        const mg = layerGrowth(τ, LAYERS.muscles), ms = layerShows(τ, LAYERS.muscles);
        this.anatomyMats.muscle.opacity = ms;
        this.anatomy.muscles.forEach((m) => {
            const k = per(mg, m.delay);
            m.mesh.visible = k > 0.01 && ms > 0.01;
            const s = m.mesh.userData.size;
            m.mesh.scale.set(Math.max(0.0001, s.x * k), Math.max(0.0001, s.y * k), Math.max(0.0001, s.z * k));
        });
    };

    MovieStage.prototype._boneAt = function (role, out) {
        const en = this.giantRig.entries[role] || this.giantRig.entries.chest || this.giantRig.entries.hips;
        return en ? en.bone.getWorldPosition(out) : out.copy(this.C);
    };

    // The giant's bones where they stand at τ, for the shards she breaks into.
    MovieStage.prototype._sampleGiant = function (τ) {
        this._poseGiant(τ);
        this.main.updateMatrixWorld(true);
        const out = [];
        Object.keys(this.giantRig.entries).forEach((role) => {
            if (/Finger/.test(role)) return;
            out.push(this.giantRig.entries[role].bone.getWorldPosition(new THREE.Vector3()));
        });
        return out;
    };

    //--- God -----------------------------------------------------------------

    // The hypertriangle of the loading screen, in three dimensions: the same
    // five-cell, turning at the same rates, its edges real.
    const S5 = Math.sqrt(5);
    const CELL = (function () {
        const raw = [[1, 1, 1, -1 / S5], [1, -1, -1, -1 / S5], [-1, 1, -1, -1 / S5], [-1, -1, 1, -1 / S5], [0, 0, 0, 4 / S5]];
        const n = Math.hypot(raw[0][0], raw[0][1], raw[0][2], raw[0][3]);
        const verts = raw.map((v) => v.map((c) => c / n));
        const edges = [];
        for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) edges.push([i, j]);
        return { verts, edges };
    })();

    function projectCell(t, out) {
        const v = [0, 0, 0, 0];
        const rot = (a, b, ang) => {
            const c = Math.cos(ang), s = Math.sin(ang);
            const va = v[a], vb = v[b];
            v[a] = va * c - vb * s;
            v[b] = va * s + vb * c;
        };
        const breath = Math.sin(t * 0.37) * 0.35;
        for (let i = 0; i < 5; i++) {
            for (let c = 0; c < 4; c++) v[c] = CELL.verts[i][c];
            rot(0, 3, t * 0.55 + breath);
            rot(1, 2, t * 0.9);
            rot(0, 2, Math.sin(t * 0.21) * 0.6);
            const w = 1 / (2.4 - v[3]);
            rot(0, 1, t * 0.16);
            out[i].set(v[0] * w, v[1] * w, v[2] * w);
            out[i].depth = v[2] * w + v[3] * 0.5;
        }
        return out;
    }

    MovieStage.prototype._buildGod = function () {
        const god = new THREE.Group();
        const cage = new THREE.Group();
        god.add(cage);
        this.godPts = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
        // The cage's widest reach over a long run, so GOD_SIZE is its radius.
        let reach = 0;
        for (let k = 0; k < 1500; k++) projectCell(k * 0.173, this.godPts).forEach((p) => { reach = Math.max(reach, p.length()); });
        this.godReach = reach || 1;
        const unit = this._own(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true));
        this.godEdges = CELL.edges.map(() => {
            const coreMat = this._own(new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffc000, emissiveIntensity: 1, roughness: 0.4 }));
            const glowMat = this._own(new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
            const core = new THREE.Mesh(unit, coreMat);
            const glow = new THREE.Mesh(unit, glowMat);
            cage.add(core, glow);
            return { core, glow };
        });
        this.godVerts = [0, 1, 2, 3, 4].map(() => {
            const s = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
                map: this._glowTex, color: 0xfff6d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            cage.add(s);
            return s;
        });
        // The half-closed eye at the heart of it.
        const eye = new THREE.Group();
        const S = GOD_SIZE;
        const well = new THREE.Sprite(this._own(new THREE.SpriteMaterial({ map: this._darkTex, transparent: true, depthWrite: false })));
        well.scale.setScalar(S * 0.8);
        const irisTex = this._own(new THREE.CanvasTexture(irisCanvas()));
        const iris = new THREE.Mesh(this._own(new THREE.CircleGeometry(S * 0.12, 48)), this._own(new THREE.MeshBasicMaterial({
            map: irisTex, transparent: true, depthWrite: false
        })));
        iris.position.z = 2;
        const lid = new THREE.Mesh(this._own(new THREE.TorusGeometry(S * 0.32, S * 0.022, 8, 48, Math.PI)), this._own(new THREE.MeshBasicMaterial({ color: 0xffd700 })));
        lid.position.z = 4;
        const glare = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        glare.scale.setScalar(S * 1.6);
        eye.add(well, iris, lid, glare);
        god.add(eye);
        this.god = { group: god, cage, eye, well, iris, lid, glare };
        this.main.add(god);
    };

    // Where God hangs at τ: still in the sky, then, dead, falling into orbit.
    MovieStage.prototype._godAt = function (τ, out) {
        out.set(GOD_AT[0], GOD_AT[1] + Math.sin(τ * 0.3) * 20, GOD_AT[2]);
        const fall = smooth(span(τ, CUE.rot, CUE.rot + 3));
        if (fall > 0) {
            const e1 = this._t.e.set(GOD_AT[0], GOD_AT[1], GOD_AT[2]).normalize();
            const th = (τ - CUE.rot) * 0.22;
            const o = this._t.f.copy(e1).multiplyScalar(Math.cos(th) * ORBIT_R).add(this._t.d.set(Math.sin(th) * ORBIT_R, 0, 0));
            out.lerp(o, fall);
        }
        return out;
    };

    MovieStage.prototype._poseGod = function (τ) {
        const g = this.god;
        this._godAt(τ, this.G);
        g.group.position.copy(this.G);
        const grow = τ < CUE.godIn ? 0 : easeOutBack(clamp01((τ - CUE.godIn) / 7));
        const shrink = 1 - smooth(span(τ, CUE.rot, CUE.rot + 1.6));
        g.group.visible = grow > 0.001 && shrink > 0.001;
        g.group.scale.setScalar(Math.max(0.001, grow * lerp(0.3, 1, shrink)));
        // Dead, he stops turning.
        const rt = τ < CUE.impact ? τ : CUE.impact + (1 - Math.exp(-(τ - CUE.impact) * 0.8)) / 0.8;
        const pts = projectCell(rt, this.godPts);
        let lo = Infinity, hi = -Infinity;
        pts.forEach((p) => { lo = Math.min(lo, p.depth); hi = Math.max(hi, p.depth); });
        const k = GOD_SIZE / this.godReach;
        const stone = smooth(span(τ, CUE.statue, CUE.statue + 1.6));
        const cracked = smooth(span(τ, CUE.statue + 1.2, CUE.rot));
        const white = new THREE.Color(0xf2efe6);
        const ab = this._t.a, dir = this._t.b, Y = this._t.c.set(0, 1, 0);
        const r = rng(0xc4ac);
        CELL.edges.forEach(([i, j], n) => {
            const e = this.godEdges[n];
            const p = pts[i], q = pts[j];
            const near = clamp01(((p.depth + q.depth) / 2 - lo) / ((hi - lo) || 1));
            ab.copy(p).add(q).multiplyScalar(0.5 * k);
            dir.copy(q).sub(p);
            const len = dir.length() * k;
            dir.normalize();
            // Cracking: every edge breaks off a little from its neighbours.
            ab.addScaledVector(this._t.d.set(r() - 0.5, r() - 0.5, r() - 0.5), cracked * GOD_SIZE * 0.08);
            [e.core, e.glow].forEach((m, w) => {
                m.position.copy(ab);
                m.quaternion.setFromUnitVectors(Y, dir);
                const rad = GOD_SIZE * (w ? 0.04 : 0.012) * (0.7 + 0.6 * near);
                m.scale.set(rad, len * (1 - cracked * 0.06), rad);
            });
            e.core.material.color.setHex(0xffd700).lerp(white, stone);
            e.core.material.emissive.setHex(0xffc000).multiplyScalar(1 - stone);
            e.glow.material.opacity = (0.12 + 0.3 * near) * (1 - stone);
        });
        pts.forEach((p, i) => {
            const s = this.godVerts[i];
            const near = clamp01((p.depth - lo) / ((hi - lo) || 1));
            s.position.copy(p).multiplyScalar(k);
            s.scale.setScalar(GOD_SIZE * (0.12 + 0.12 * near));
            s.material.opacity = (0.5 + 0.5 * near) * (1 - stone);
        });
        // The eye: half shut, blinking every 4.5 seconds, wide open to strike.
        const strike = Math.max(window4(τ, CUE.eye, CUE.eye + 1.2, CUE.holyRay - 1, CUE.holyRay),
            window4(τ, CUE.holyRay, CUE.holyRay + 0.4, CUE.fireball, CUE.fireball + 1),
            window4(τ, CUE.windUp, CUE.windUp + 0.8, CUE.impact, CUE.impact + 0.01));
        const phase = (τ % 4.5) / 4.5;
        let open = 1;
        if (phase > 0.88) {
            const b = phase < 0.93 ? (phase - 0.88) / 0.05 : (1 - phase) / 0.07;
            open = 1 - 0.88 * (0.5 - 0.5 * Math.cos(Math.PI * b));
        }
        const dead = τ >= CUE.impact;
        open = dead ? lerp(1, 0.08, smooth(span(τ, CUE.impact, CUE.impact + 1.2))) : lerp(open * 0.62, 1, strike);
        g.iris.scale.set(1, Math.max(0.05, open), 1);
        g.iris.position.y = GOD_SIZE * 0.03 * (1 - open);
        g.lid.scale.set(1, Math.max(0.08, open), 1);
        g.lid.position.y = -GOD_SIZE * 0.08 * (1 - open);
        g.iris.material.color.setHex(0xffffff).lerp(white, stone);
        g.lid.material.color.setHex(0xffd700).lerp(white, stone);
        g.well.material.opacity = 1 - cracked;
        g.glare.material.opacity = Math.max(strike * 0.35, decay(τ, CUE.impact, 2) * 1.2) * (1 - stone);
        this.godLight.position.copy(this.G);
        this.godLight.intensity = (g.group.visible ? 0.6 + strike * 1.4 : 0) * (1 - stone);
    };

    MovieStage.prototype._buildTear = function () {
        const tex = this._own(new THREE.CanvasTexture(tearCanvas()));
        // Drawn over the sky, not added to it, so its void is black.
        this.tear = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false
        })));
        this.tear.renderOrder = 2;
        this.tearGlow = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xfff0c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        this.main.add(this.tear, this.tearGlow);
    };

    MovieStage.prototype._poseTear = function (τ) {
        // It splits as he comes, and seals again once he is through.
        const open = smooth(span(τ, CUE.tear, CUE.godIn + 2)) * (1 - smooth(span(τ, CUE.eye - 0.5, CUE.eye + 1.8)));
        const pos = this._t.a.set(GOD_AT[0], GOD_AT[1], GOD_AT[2]);
        pos.addScaledVector(this._t.b.copy(pos).normalize(), 600);
        this.tear.position.copy(pos);
        this.tearGlow.position.copy(pos);
        this.tear.visible = this.tearGlow.visible = open > 0.002;
        // It splits along its length first, then gapes.
        this.tear.scale.set(80 + 1700 * open, 3800 * Math.min(1, open * 2.5), 1);
        this.tear.material.opacity = Math.min(1, open * 3);
        this.tearGlow.scale.setScalar(3200 * open);
        this.tearGlow.material.opacity = 0.45 * open;
    };

    //--- holy light ----------------------------------------------------------

    MovieStage.prototype._buildBeams = function () {
        const geo = this._own(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true));
        const make = () => {
            const mat = this._own(new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffe8a8) }, uPush: { value: 0 } },
                vertexShader: FRESNEL_VERT,
                fragmentShader: BEAM_FRAG,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            }));
            const m = new THREE.Mesh(geo, mat);
            m.frustumCulled = false;
            m.visible = false;
            const flare = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
                map: this._glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            flare.visible = false;
            this.main.add(m, flare);
            return { m, flare };
        };
        this.beamPool = [];
        for (let i = 0; i < 16; i++) this.beamPool.push(make());
    };

    // Every beam God casts: from where, to where, when, how wide.
    MovieStage.prototype._beamList = function (τ) {
        const list = [];
        const sky = (out, dx, dz) => out.copy(this.C).addScaledVector(this.up, 2600).addScaledVector(this.side, dx).addScaledVector(this.front, dz);
        const bone = (role) => this._boneAt(role, new THREE.Vector3());
        list.push({ t0: CUE.rayHit - 0.5, t1: CUE.rayHit + 1.2, w: 16, from: this.G.clone(), to: bone("lUpperArm") });
        list.push({ t0: CUE.judgmentHit - 0.6, t1: CUE.judgmentHit + 1.3, w: 30, from: sky(new THREE.Vector3(), 0, 40), to: bone("upperChest") });
        const r = rng(0x9111a);
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2 + 0.3, d = 150 + r() * 70;
            const foot = new THREE.Vector3().copy(this.C).addScaledVector(this.side, Math.cos(a) * d).addScaledVector(this.front, Math.sin(a) * d);
            const t0 = CUE.holyPillars + 0.15 + i * 0.22;
            list.push({ t0, t1: t0 + 1.6, w: 18, from: foot.clone().addScaledVector(this.up, 2600), to: foot });
        }
        list.push({ t0: CUE.pillarsHit - 0.4, t1: CUE.pillarsHit + 1.1, w: 22, from: sky(new THREE.Vector3(), 260, 120), to: bone("rUpperArm") });
        list.push({ t0: CUE.annihilationHit - 0.35, t1: CUE.annihilationHit + 1.1, w: 64, from: this.G.clone(), to: bone("head") });
        // A natural 1: he keeps firing and she knocks every beam away with
        // her bare fists, off into the dark.
        if (this.variant && this.variant.kind === "fists") {
            DEFLECTS.forEach((t, i) => {
                const fist = bone(i % 2 ? "lHand" : "rHand");
                list.push({ t0: t - 0.3, t1: t + 0.15, w: 22, from: this.G.clone(), to: fist });
                const away = fist.clone().addScaledVector(this.side, (i % 2 ? -1 : 1) * 2600).addScaledVector(this.up, 1400 + r() * 800);
                list.push({ t0: t, t1: t + 0.5, w: 18, from: fist.clone(), to: away });
            });
        }
        return list.filter((b) => τ > b.t0 - 0.01 && τ < b.t1 + 0.6);
    };

    MovieStage.prototype._poseBeams = function (τ) {
        const list = this._beamList(τ);
        const Y = this._t.c.set(0, 1, 0);
        this.beamPool.forEach((slot, i) => {
            const b = list[i];
            slot.m.visible = slot.flare.visible = !!b;
            if (!b) return;
            const k = window4(τ, b.t0, b.t0 + 0.15, b.t1, b.t1 + 0.5);
            const dir = this._t.a.copy(b.to).sub(b.from);
            const len = dir.length();
            dir.normalize();
            slot.m.position.copy(b.from).addScaledVector(dir, len / 2);
            slot.m.quaternion.setFromUnitVectors(Y, dir);
            const throb = 1 + 0.12 * Math.sin(τ * 40 + i);
            slot.m.scale.set(b.w * throb * (0.4 + 0.6 * k), len, b.w * throb * (0.4 + 0.6 * k));
            slot.m.material.uniforms.uOpacity.value = k;
            slot.m.material.uniforms.uTime.value = τ;
            slot.flare.position.copy(b.to);
            slot.flare.scale.setScalar(b.w * 9 * k);
            slot.flare.material.opacity = k;
        });
    };

    //--- the wounds ----------------------------------------------------------

    MovieStage.prototype._buildWounds = function () {
        this.wounds = HITS.map(() => {
            const slash = new THREE.Mesh(this._own(new THREE.PlaneGeometry(1, 1)), this._own(new THREE.MeshBasicMaterial({
                color: 0xff2030, transparent: true, side: THREE.DoubleSide, depthWrite: false
            })));
            const core = new THREE.Mesh(this._own(new THREE.PlaneGeometry(1, 1)), this._own(new THREE.MeshBasicMaterial({
                color: 0xffe0d0, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
            })));
            slash.visible = core.visible = false;
            this.main.add(slash, core);
            return { slash, core, at: new THREE.Vector3() };
        });
        this.blood = new Spray(this, 1400, false);
        this.main.add(this.blood.points);
    };

    // A scratch where each beam landed, and blood beading from it, falling
    // off the gold toward the Earth.
    MovieStage.prototype._poseWounds = function (τ, cam) {
        const k = this.giantScale;
        const gone = 1 - smooth(span(τ, CUE.shatter, CUE.shatter + 1.5));
        this.blood.begin();
        HITS.forEach((h, n) => {
            const w = this.wounds[n];
            const live = τ >= h.at && gone > 0;
            w.slash.visible = w.core.visible = live;
            if (!live) return;
            this._boneAt(h.bone, w.at);
            w.at.addScaledVector(this.front, h.depth * k).addScaledVector(this.up, h.lift * k);
            const open = smooth(span(τ, h.at, h.at + 0.25));
            [w.slash, w.core].forEach((m, c) => {
                m.position.copy(w.at).addScaledVector(this.front, c ? 0.6 : 0.3);
                m.quaternion.copy(cam.quaternion);
                m.rotateZ(0.5 + n * 0.7);
                m.scale.set(0.16 * k * open, (c ? 0.004 : 0.012) * k, 1);
                m.material.opacity = c ? decay(τ, h.at, 0.8) * 0.9 + 0.1 : gone;
            });
            const r = rng(0xb100d + n * 97);
            const down = this._t.d.copy(w.at).normalize().negate();
            // The spurt as the light lands.
            for (let i = 0; i < 40; i++) {
                const r = pr(0xb100d + n * 97, i);
                const age = τ - h.at;
                const vx = (r() - 0.5) * 2, vy = (r() - 0.2) * 2, vz = r() * 1.5;
                if (age > 1.6) continue;
                const sp = (20 + r() * 50) * age;
                const dir = this._t.e.copy(this.side).multiplyScalar(vx).addScaledVector(this.up, vy).addScaledVector(this.front, vz);
                this.blood.put(
                    w.at.x + dir.x * sp + down.x * 40 * age * age,
                    w.at.y + dir.y * sp + down.y * 40 * age * age,
                    w.at.z + dir.z * sp + down.z * 40 * age * age,
                    (2 + r() * 4) * (1 + age), (1 - age / 1.6) * gone, 0.62, 0.02, 0.05);
            }
            // The beads that keep running after.
            const P = 2.6, N = 60;
            for (let i = 0; i < N; i++) {
                const r = pr(0xb200d + n * 97, i);
                const off = i / N * P;
                const since = τ - h.at - off;
                if (since < 0) continue;
                const age = since % P;
                const drift = (r() - 0.5) * 8;
                this.blood.put(
                    w.at.x + down.x * 22 * age * age + this.side.x * drift * age,
                    w.at.y + down.y * 22 * age * age + this.side.y * drift * age,
                    w.at.z + down.z * 22 * age * age + this.side.z * drift * age,
                    2.2 + r() * 2.5, (1 - age / P) * 0.95 * gone, 0.55 + r() * 0.15, 0.01, 0.04);
            }
        });
        this.blood.end();
    };

    //--- GenericFireball -----------------------------------------------------

    MovieStage.prototype._buildFireball = function () {
        const fire = (push, opacity, hot) => this._own(new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity }, uHot: { value: hot }, uPush: { value: push } },
            vertexShader: FRESNEL_VERT,
            fragmentShader: FIRE_FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        const ball = this._own(new THREE.SphereGeometry(1, 48, 32));
        const group = new THREE.Group();
        const core = new THREE.Mesh(ball, fire(0.05, 1, 1.4));
        const shellA = new THREE.Mesh(ball, fire(0.28, 0.6, 0.8));
        shellA.scale.setScalar(1.25);
        const shellB = new THREE.Mesh(ball, fire(0.45, 0.35, 0.4));
        shellB.scale.setScalar(1.6);
        const ring = new THREE.Mesh(this._own(new THREE.TorusGeometry(1.9, 0.06, 8, 64)), this._own(new THREE.MeshBasicMaterial({
            color: 0xffa040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        const glow = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        glow.scale.setScalar(6);
        group.add(core, shellA, shellB, ring, glow);
        group.visible = false;
        this.main.add(group);
        this.fireball = { group, core, shellA, shellB, ring, glow, mats: [core.material, shellA.material, shellB.material] };
        this.fbPos = new THREE.Vector3();
        this.fbDir = new THREE.Vector3(0, 0, 1);
        this.embers = new Spray(this, 900, true);
        this.main.add(this.embers.points);
    };

    MovieStage.prototype._poseFireball = function (τ) {
        const f = this.fireball;
        const palm = this._boneAt("lHand", this._t.a).addScaledVector(this.front, FB_R * 1.3);
        const flyK = Math.pow(span(τ, CUE.fireballRelease, CUE.fireballHit), 1.6);
        this.fbPos.copy(palm).lerp(this.G, flyK);
        this.fbDir.copy(this.G).sub(palm).normalize();
        const grow = smooth(span(τ, CUE.fireball, CUE.fireball + 0.9));
        const burst = span(τ, CUE.fireballHit, CUE.fireballHit + 1.4);
        const live = τ >= CUE.fireball && burst < 1;
        f.group.visible = live;
        this.fireLight.intensity = live ? 2.5 * (1 - burst) : 0;
        this.fireLight.position.copy(this.fbPos);
        this.embers.begin();
        if (live) {
            const size = FB_R * grow * (1 + 0.04 * Math.sin(τ * 30)) * (burst > 0 ? 1 + 12 * Math.pow(burst, 0.6) : 1);
            f.group.position.copy(this.fbPos);
            f.group.scale.setScalar(Math.max(0.01, size));
            f.ring.quaternion.setFromUnitVectors(this._t.b.set(0, 0, 1), this.fbDir);
            f.ring.rotateZ(τ * 3);
            f.ring.scale.setScalar(1 + 0.15 * Math.sin(τ * 9) + burst * 3);
            const fade = 1 - burst;
            f.mats.forEach((m, i) => {
                m.uniforms.uTime.value = τ + i * 3.1;
                m.uniforms.uOpacity.value = [1, 0.6, 0.35][i] * fade;
            });
            f.ring.material.opacity = 0.6 * fade;
            f.glow.material.opacity = fade;
        }
        // The trail it leaves and the sparks it bursts into.
        const r = rng(0xe3be);
        for (let i = 0; i < 500; i++) {
            const r = pr(0xe3be, i);
            const born = CUE.fireball + 0.3 + r() * (CUE.fireballHit - CUE.fireball - 0.3);
            const age = τ - born;
            const life = 1.2 + r() * 1.2;
            const jx = r() - 0.5, jy = r() - 0.5, jz = r() - 0.5;
            if (age < 0 || age > life) continue;
            const u = clamp01((born - CUE.fireballRelease) / (CUE.fireballHit - CUE.fireballRelease));
            const at = this._t.c.copy(palm).lerp(this.G, Math.pow(u, 1.6));
            const sp = 40 * age;
            this.embers.put(at.x + jx * FB_R * 1.4 + jx * sp, at.y + jy * FB_R * 1.4 + jy * sp + 20 * age, at.z + jz * FB_R * 1.4 + jz * sp,
                6 + r() * 10, 1 - age / life, 1, 0.55 + r() * 0.3, 0.15);
        }
        for (let i = 0; i < 400; i++) {
            const r = pr(0xe3bf, i);
            const age = τ - CUE.fireballHit;
            const life = 1.6 + r() * 1.6;
            const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u), sp = 300 + r() * 900;
            if (age < 0 || age > life) continue;
            const d = sp * age * (1 - age / (life * 2.2));
            this.embers.put(this.G.x + q * Math.cos(a) * d, this.G.y + u * d, this.G.z + q * Math.sin(a) * d,
                10 + r() * 22, 1 - age / life, 1, 0.5 + r() * 0.4, 0.1);
        }
        this.embers.end();
    };

    //--- the Spear of Memories -----------------------------------------------

    // Two spears, one gold and one deep blue, drawn up out of her head side by
    // side; then they wind round each other into a double spiral, a rung of
    // memory between them at every turn. The winding is done on the GPU: each
    // strand is a straight tube bent onto its helix by uTwist.
    const STRAND_VERT = [
        "uniform float uTwist;",
        "uniform float uSep;",
        "uniform float uRad;",
        "uniform float uTurns;",
        "uniform float uPhase;",
        "uniform float uLen;",
        "varying float vU;",
        "varying vec3 vN;",
        "varying vec3 vV;",
        "void main() {",
        "  float u = position.z / uLen + 0.5;",
        "  vU = u;",
        "  float a = u * uTurns * 6.2831853 + uPhase;",
        "  vec2 c = mix(vec2(uSep, 0.0), vec2(cos(a), sin(a)) * uRad, uTwist);",
        "  vec3 pos = vec3(position.xy + c, position.z);",
        "  vec4 mv = modelViewMatrix * vec4(pos, 1.0);",
        "  vN = normalize(normalMatrix * normal);",
        "  vV = normalize(-mv.xyz);",
        "  gl_Position = projectionMatrix * mv;",
        "}"
    ].join("\n");
    const STRAND_FRAG = [
        "uniform vec3 uColor;",
        "uniform float uGrow;",
        "uniform float uOpacity;",
        "varying float vU;",
        "varying vec3 vN;",
        "varying vec3 vV;",
        "void main() {",
        "  if (vU > uGrow) discard;",
        "  float f = abs(dot(normalize(vN), normalize(vV)));",
        "  float tip = smoothstep(uGrow - 0.04, uGrow, vU);",
        "  vec3 col = mix(uColor, vec3(1.0), pow(f, 3.0) * 0.6 + tip);",
        "  gl_FragColor = vec4(col, uOpacity * (0.55 + 0.45 * f));",
        "}"
    ].join("\n");
    const SPEAR_TURNS = 7;
    const SPEAR_RAD = 16;
    const SPEAR_SEP = 34;

    function strandCenter(u, phase, sep, twist, out) {
        const a = u * SPEAR_TURNS * Math.PI * 2 + phase;
        out.x = lerp(sep, Math.cos(a) * SPEAR_RAD, twist);
        out.y = lerp(0, Math.sin(a) * SPEAR_RAD, twist);
        return out;
    }

    // One pair of strands and its rungs; built twice (the giant's, and the
    // small one rising from the pilot's head).
    MovieStage.prototype._buildHelix = function (parent) {
        const L = SPEAR_LEN;
        const geo = this._own(new THREE.CylinderGeometry(3.2, 3.2, L, 8, 240, true));
        geo.rotateX(Math.PI / 2);
        const strand = (color, phase, sep) => {
            const mat = this._own(new THREE.ShaderMaterial({
                uniforms: {
                    uTwist: { value: 0 }, uSep: { value: sep }, uRad: { value: SPEAR_RAD }, uTurns: { value: SPEAR_TURNS },
                    uPhase: { value: phase }, uLen: { value: L }, uColor: { value: new THREE.Color(color) },
                    uGrow: { value: 0 }, uOpacity: { value: 1 }
                },
                vertexShader: STRAND_VERT,
                fragmentShader: STRAND_FRAG,
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
            }));
            const m = new THREE.Mesh(geo, mat);
            m.frustumCulled = false;
            return m;
        };
        const inner = new THREE.Group();
        const gold = strand(0xffc53a, 0, SPEAR_SEP);
        const blue = strand(0x1636ff, Math.PI, -SPEAR_SEP);
        inner.add(gold, blue);
        const rungGeo = this._own(new THREE.PlaneGeometry(1, 1));
        const rungs = [];
        for (let i = 0; i < ARCANA; i++) {
            const m = new THREE.Mesh(rungGeo, this._own(new THREE.MeshBasicMaterial({
                map: this._tarotTex[i % this._tarotTex.length], side: THREE.DoubleSide
            })));
            m.userData.u = (i + 0.5) / ARCANA;
            m.visible = false;
            inner.add(m);
            rungs.push(m);
        }
        const tip = new THREE.Mesh(this._own(new THREE.ConeGeometry(SPEAR_RAD * 0.9, 70, 16)), this._own(new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        tip.rotation.x = Math.PI / 2;
        tip.position.z = L / 2 + 30;
        const glow = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xd8d0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        glow.scale.setScalar(L * 0.9);
        inner.add(tip, glow);
        const group = new THREE.Group();
        group.add(inner);
        group.visible = false;
        parent.add(group);
        return { group, inner, strands: [gold, blue], rungs, tip, glow, a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
    };

    // Lays the pair out for how far it has grown and how far it has wound.
    MovieStage.prototype._shapeHelix = function (h, grow, twist, opacity) {
        h.strands.forEach((m) => {
            m.material.uniforms.uGrow.value = grow;
            m.material.uniforms.uTwist.value = twist;
            m.material.uniforms.uOpacity.value = opacity;
        });
        h.rungs.forEach((m) => {
            const u = m.userData.u;
            m.visible = u <= grow && twist > 0.55 && opacity > 0.05;
            if (!m.visible) return;
            strandCenter(u, 0, SPEAR_SEP, twist, h.a);
            strandCenter(u, Math.PI, -SPEAR_SEP, twist, h.b);
            const dx = h.b.x - h.a.x, dy = h.b.y - h.a.y;
            m.position.set((h.a.x + h.b.x) / 2, (h.a.y + h.b.y) / 2, (u - 0.5) * SPEAR_LEN);
            m.rotation.set(Math.PI / 2, 0, Math.atan2(dy, dx), "ZXY");
            // Card-shaped: as wide as the gap between the strands, its height
            // running along the spear.
            const w = Math.max(0.01, Math.hypot(dx, dy)) * 0.9;
            m.scale.set(w, Math.max(0.01, w * ARCANA_RATIO * smooth((twist - 0.55) / 0.45)), 1);
        });
    };

    MovieStage.prototype._buildSpear = function () {
        const h = this._buildHelix(this.main);
        this.spear = h;
        this.spearPos = new THREE.Vector3();
        this.spearDir = new THREE.Vector3(0, 0, 1);
        this.spearTrail = new Spray(this, 700, true);
        this.main.add(this.spearTrail.points);
        // The one coming out of the real Em's head, in the capsule.
        this.pitSpear = this._buildHelix(this.pit);
    };

    MovieStage.prototype._spearFlight = function (τ) {
        return clamp01((τ - CUE.release) / (CUE.impact - CUE.release));
    };

    MovieStage.prototype._poseSpear = function (τ) {
        const s = this.spear;
        const live = τ >= CUE.spear && τ < CUE.deep + 0.5;
        s.group.visible = live;
        this.spearTrail.begin();
        // The pilot's: up out of her head while she convulses.
        const ps = this.pitSpear;
        const pitLive = window4(τ, CUE.spear, CUE.spear + 0.2, CUE.helixDone + 0.6, CUE.windUp);
        ps.group.visible = pitLive > 0.01;
        if (ps.group.visible) {
            const g = smooth(span(τ, CUE.spear + 0.1, CUE.helixDone));
            const k = 1.6 / SPEAR_LEN;
            ps.group.position.copy(this.pilotHead).add(this._t.a.set(0, 0.1 + SPEAR_LEN * k * 0.5, 0));
            ps.group.quaternion.setFromUnitVectors(this._t.b.set(0, 0, 1), this._t.c.set(0, 1, 0));
            ps.group.scale.setScalar(k);
            ps.inner.rotation.z = τ * 1.4;
            this._shapeHelix(ps, g, smooth(span(τ, CUE.spear + 0.8, CUE.helixDone + 0.4)), pitLive);
            ps.tip.visible = false;
        }
        if (!live) { this.spearTrail.end(); return; }
        const target = this._t.a.copy(this.G);
        const grow = smooth(span(τ, CUE.spear + 0.2, CUE.helixDone));
        const twist = smooth(span(τ, CUE.spear + 1.0, CUE.windUp));
        const tight = smooth(span(τ, CUE.windUp, CUE.release));
        this._shapeHelix(s, grow, twist, 1);
        s.inner.scale.set(lerp(1, 0.5, tight), lerp(1, 0.5, tight), lerp(1, 1.2, tight));
        s.tip.visible = tight > 0.05;
        s.tip.scale.setScalar(Math.max(0.01, tight));
        s.glow.material.opacity = 0.3 + 0.7 * tight;
        const flight = this._spearFlight(τ);
        const hand = this._boneAt("rHand", this._t.b);
        const head = this._boneAt("head", this._t.c);
        if (τ < CUE.helixDone) {
            // Rising out of the crown of her head.
            this.spearPos.copy(head).addScaledVector(this.up, GIANT_H * 0.08 + SPEAR_LEN * 0.5);
            this.spearDir.copy(this.up);
        } else if (τ < CUE.release) {
            this.spearPos.copy(hand);
            this.spearDir.copy(target).sub(hand).normalize();
            if (τ < CUE.windUp) this.spearDir.lerp(this.up, 0.5).normalize();
        } else if (τ < CUE.impact) {
            this.spearPos.copy(this.releasePoint).lerp(target, flight);
            this.spearDir.copy(target).sub(this.releasePoint).normalize();
        } else {
            // Through him, and out the far side, on its way out of the world.
            this.spearDir.copy(target).sub(this.releasePoint).normalize();
            this.spearPos.copy(target).addScaledVector(this.spearDir, Math.pow(τ - CUE.impact, 1.5) * 4200);
        }
        s.group.position.copy(this.spearPos);
        s.group.quaternion.setFromUnitVectors(this._t.d.set(0, 0, 1), this.spearDir);
        s.inner.rotation.z = τ * (τ < CUE.release ? 0.6 : 4);
        // In flight it sheds memories behind it like sparks.
        const r = rng(0x5bea2);
        if (τ >= CUE.release) {
            for (let i = 0; i < 700; i++) {
                const r = pr(0x5bea2, i);
                const born = CUE.release + r() * (CUE.impact - CUE.release);
                const age = τ - born;
                const life = 1.4 + r() * 2;
                const jx = r() - 0.5, jy = r() - 0.5, jz = r() - 0.5;
                const blue = r() > 0.5;
                if (age < 0 || age > life) continue;
                const at = this._t.e.copy(this.releasePoint).lerp(target, this._spearFlight(born));
                this.spearTrail.put(at.x + jx * 60 * (1 + age), at.y + jy * 60 * (1 + age), at.z + jz * 60 * (1 + age),
                    8 + r() * 12, (1 - age / life) * 0.9, blue ? 0.3 : 1, blue ? 0.45 : 0.85, blue ? 1 : 0.45);
            }
        }
        this.spearTrail.end();
    };

    //--- the vector gun, the dice, and what the dice made of it --------------

    // A shape of the vector gun, built by the weapon system itself (the same
    // model the first-person overlay shows), turned to lie along +Z with its
    // grip at the origin and scaled to `len`. Null when that system is not
    // there to ask.
    function vectorModel(key) {
        const VG = window.VectorGun;
        const WSP = window.WeaponSystemProcedural;
        if (!VG || !WSP || typeof VG.withForm !== "function" || typeof WSP.createModel !== "function") return null;
        try {
            const gun = VG.gunData && VG.gunData();
            if (!gun) return null;
            return VG.withForm(key, () => WSP.createModel(gun)) || null;
        } catch (e) { return null; }
    }
    function laidAlongZ(model, len) {
        const outer = new THREE.Group();
        const inner = new THREE.Group();
        outer.add(inner);
        inner.add(model);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z) || 1;
        if (size.x === longest) inner.rotation.y = -Math.PI / 2;
        else if (size.y === longest) inner.rotation.x = Math.PI / 2;
        inner.updateMatrixWorld(true);
        const turned = new THREE.Box3().setFromObject(inner);
        inner.position.z = -turned.min.z;
        inner.position.x = -(turned.min.x + turned.max.x) / 2;
        inner.position.y = -(turned.min.y + turned.max.y) / 2;
        outer.scale.setScalar(len / longest);
        return outer;
    }
    // When the weapon system is missing: a plain blade of gold light.
    function stubWeapon(len, own) {
        const g = new THREE.Group();
        const m = new THREE.Mesh(own(new THREE.BoxGeometry(0.06, 0.12, 1)), own(new THREE.MeshBasicMaterial({ color: 0xffd36a })));
        m.position.z = 0.5;
        g.add(m);
        g.scale.setScalar(len);
        return g;
    }

    MovieStage.prototype._buildArsenal = function () {
        const v = this.variant;
        const own = (x) => this._own(x);
        // The weapon system hands out copies of cached models that share
        // their materials with the gun in her hand in play: lit up on copies.
        const gold = new THREE.Color(0xffc860);
        const glowUp = (root) => root.traverse((o) => {
            if (!o.isMesh) return;
            o.frustumCulled = false;
            const lit = (m) => {
                if (!m || !m.clone) return m;
                const c = own(m.clone());
                if (c.emissive) { c.emissive.lerp(gold, 0.35); c.emissiveIntensity = Math.max(c.emissiveIntensity || 0, 0.6); }
                return c;
            };
            o.material = Array.isArray(o.material) ? o.material.map(lit) : lit(o.material);
        });
        const make = (key, len) => {
            const built = vectorModel(key);
            const g = built ? laidAlongZ(built, len) : stubWeapon(len, own);
            g.userData.model = built;
            glowUp(g);
            g.visible = false;
            this.main.add(g);
            return g;
        };
        this.gunModel = make("gun", GIANT_H * 0.3);
        this.formModel = null;
        if (v.kind !== "fists") {
            const len = v.kind === "grimoire" ? GIANT_H * 0.32 : v.kind === "ranged" ? GIANT_H * 0.5 : GIANT_H * 0.8;
            this.formModel = make(v.key || "solomon", len);
        }
        this.weaponGlow = new THREE.Sprite(own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        this.main.add(this.weaponGlow);
        this.motes = new Spray(this, 700, true);
        this.main.add(this.motes.points);
        // The Dice of Yaldabaoth: the game's own d20, lent by Dice3D.
        this.dice = this._borrowDice();
        // What the attack throws.
        this.volley = new Spray(this, 4000, true);
        this.main.add(this.volley.points);
        // The seal opening round the book, on a natural 20.
        this.bookSeal = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({
            map: this.sealTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })));
        this.bookSeal.visible = false;
        this.main.add(this.bookSeal);
    };

    MovieStage.prototype._borrowDice = function () {
        const D = window.Dice3D;
        const proto = D && Object.getPrototypeOf(D);
        const group = new THREE.Group();
        group.visible = false;
        this.main.add(group);
        let lend = null;
        if (proto && typeof proto._createD20Mesh === "function" && typeof proto._faceQuaternion === "function") {
            try {
                lend = Object.create(proto);
                lend._scene = group;
                lend._renderer = this.renderer;
                lend._createD20Mesh();
            } catch (e) { lend = null; }
        }
        if (!lend || !lend._diceMesh) {
            const m = new THREE.Mesh(this._own(new THREE.IcosahedronGeometry(0.78, 0)), this._own(new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0x6a4a10 })));
            group.add(m);
            lend = null;
        } else {
            const mats = lend._diceMesh.material;
            (Array.isArray(mats) ? mats : [mats]).forEach((m) => { this._own(m); if (m.map) this._own(m.map); m.emissive && m.emissive.setHex(0x221a08); });
            this._own(lend._diceMesh.geometry);
        }
        group.scale.setScalar(GIANT_H * 0.14);
        const light = new THREE.PointLight(0xffe0a0, 0, 0, 2);
        group.add(light);
        const face = this.variant.face;
        return {
            group, light,
            land: lend ? lend._faceQuaternion(face) : new THREE.Quaternion(),
            spin: new THREE.Vector3(0.6, 1, 0.3).normalize(),
            q: new THREE.Quaternion()
        };
    };

    // Where her weapon is: in the right hand, along the forearm.
    MovieStage.prototype._handFrame = function (pos, dir) {
        this._boneAt("rHand", pos);
        const elbow = this._boneAt("rLowerArm", this._t.f);
        dir.copy(pos).sub(elbow).normalize();
        return pos;
    };

    MovieStage.prototype._poseArsenal = function (τ) {
        const v = this.variant;
        const hand = this._t.a, dir = this._t.b;
        this._handFrame(hand, dir);
        // The gun comes together out of light in her hand.
        const gunIn = smooth(span(τ, CUE.gun, CUE.gun + 1.2));
        const g = this.gunModel;
        this._poseFold(τ);
        g.visible = gunIn > 0.01 && τ < CUE.form + 0.05;
        if (g.visible) {
            g.position.copy(hand);
            g.lookAt(this._t.c.copy(hand).add(dir));
            g.scale.setScalar(Math.max(0.001, g.userData.k || (g.userData.k = g.scale.x)) * gunIn);
        }
        // And folds into whatever the dice says: the gun's own fold, panel by
        // panel, and the new shape rising out of the packet (_poseFold).
        const f = this.formModel;
        const formOut = smooth(span(τ, CUE.spear - 0.5, CUE.spear + 0.3));
        if (f) {
            f.visible = τ >= CUE.form && formOut < 0.99;
            if (f.visible) {
                const k = (f.userData.k || (f.userData.k = f.scale.x)) * (1 - formOut);
                f.scale.setScalar(Math.max(0.001, k));
                if (v.kind === "grimoire") {
                    // The book floats open before her, facing him.
                    this._boneAt("upperChest", f.position).addScaledVector(this.front, GIANT_H * 0.32).addScaledVector(this.up, GIANT_H * 0.05);
                    f.lookAt(this.G);
                } else {
                    f.position.copy(hand);
                    f.lookAt(this._t.c.copy(hand).add(dir));
                }
            }
        }
        const glowAt = v.kind === "grimoire" && f ? f.position : hand;
        const flash = Math.max(window4(τ, CUE.gun, CUE.gun + 0.3, CUE.gun + 0.8, CUE.gun + 1.6), window4(τ, CUE.form - 0.2, CUE.form, CUE.form + 0.5, CUE.form + 1.4));
        this.weaponGlow.position.copy(glowAt);
        this.weaponGlow.scale.setScalar(GIANT_H * 0.7 * (0.5 + flash));
        this.weaponGlow.material.opacity = flash;
        // Light gathering into the hand as each shape forms.
        const r = rng(0x40e5);
        this.motes.begin();
        [CUE.gun, CUE.form].forEach((t0) => {
            for (let i = 0; i < 350; i++) {
                const r = pr(0x40e5 + Math.round(t0 * 100), i);
                const born = t0 - 0.4 + r() * 1.1;
                const age = τ - born;
                const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u), d = GIANT_H * (0.25 + r() * 0.5);
                if (age < 0 || age > 0.9) continue;
                const k = 1 - age / 0.9;
                this.motes.put(glowAt.x + q * Math.cos(a) * d * k, glowAt.y + u * d * k, glowAt.z + q * Math.sin(a) * d * k,
                    5 + r() * 9, Math.sin(k * Math.PI), 1, 0.85, 0.45);
            }
        });
        this.motes.end();
        this._poseDiceThrow(τ);
        this._poseAttack(τ, hand, dir);
    };

    // The vector gun's own SWITCH, the fold its menu and battle play: the
    // pistol shuts panel by panel into a packet in her hand, and the shape the
    // dice gave rises out of it. Driven on the movie clock; going back past it
    // (a replay) puts both shapes back whole.
    const FOLD_LEAD = 0.75;
    MovieStage.prototype._poseFold = function (τ) {
        const WSP = window.WeaponSystemProcedural;
        const gun = this.gunModel && this.gunModel.userData.model;
        const form = this.formModel && this.formModel.userData.model;
        if (!WSP || typeof WSP.startVectorSwitch !== "function") return;
        const st = this._fold || (this._fold = { folding: false, rising: false, at: 0 });
        const restore = (m) => {
            if (!m) return;
            const parts = (m._vectorSwitch && m._vectorSwitch.parts) || m._vectorFolded;
            if (parts) WSP._restoreVectorParts(parts);
            m._vectorSwitch = null;
            m._vectorFolded = null;
        };
        if (τ < CUE.form - FOLD_LEAD || τ < st.at) {
            if (st.folding || st.rising) { restore(gun); restore(form); }
            st.folding = st.rising = false;
            st.at = τ;
            return;
        }
        const step = Math.max(0, τ - st.at) * 1000;
        st.at = τ;
        if (gun && !st.folding) {
            st.folding = true;
            WSP.startVectorSwitch(gun, "fold", { pace: FOLD_LEAD * 1000 / (WSP.VECTOR_FOLD_MS || 900) });
        } else if (gun && gun._vectorSwitch) {
            WSP.tickVectorSwitch(gun, step);
        }
        if (form && !st.rising && τ >= CUE.form) {
            st.rising = true;
            WSP.startVectorSwitch(form, "rise", { pace: 0.9 });
        } else if (form && form._vectorSwitch) {
            WSP.tickVectorSwitch(form, step);
        }
    };

    MovieStage.prototype._poseDiceThrow = function (τ) {
        const d = this.dice;
        const live = τ >= CUE.dice - 0.15 && τ < CUE.form + 0.4;
        d.group.visible = live;
        d.light.intensity = live ? 1.6 : 0;
        if (!live) return;
        const from = this._boneAt("lHand", this._t.c);
        const to = this._t.d.copy(this.C).addScaledVector(this.up, GIANT_H * 0.8).lerp(this.G, 0.16);
        const u = smooth(span(τ, CUE.dice, CUE.diceLand));
        d.group.position.copy(from).lerp(to, u).addScaledVector(this.up, Math.sin(u * Math.PI) * GIANT_H * 0.4);
        // It tumbles hard and slows; the face it lands on is turned to camera
        // once the camera is placed (_facing).
        const spin = 26 * (1 - Math.exp(-(τ - CUE.dice) * 1.2));
        d.q.setFromAxisAngle(d.spin, spin);
        const out = 1 - smooth(span(τ, CUE.form - 0.1, CUE.form + 0.4));
        d.group.scale.setScalar(GIANT_H * 0.14 * Math.max(0.01, out) * smooth(span(τ, CUE.dice - 0.15, CUE.dice + 0.1)));
    };

    // The attack the dice decided.
    MovieStage.prototype._poseAttack = function (τ, hand, dir) {
        const v = this.variant;
        this.volley.begin();
        const live = τ >= CUE.form && τ < CUE.spear + 1;
        if (live && v.kind === "grimoire" && this.formModel) {
            // Graceful Death: every page of the book read at once, a barrage
            // a continent wide, and all of it breaking on the Moon.
            const book = this.formModel.position;
            const { n0, e1, e2 } = this.strikeFrame;
            const C0 = this.moonPos;
            const palette = [[1, 0.85, 0.4], [0.7, 0.4, 1], [0.4, 0.9, 1], [1, 0.3, 0.3], [0.4, 1, 0.55], [1, 1, 1]];
            for (let i = 0; i < 700; i++) {
                const r = pr(0xa77ad, i);
                const born = CUE.barrage + 0.2 + r() * (CUE.spear - CUE.barrage - 1.2), flight = 0.9 + r() * 0.6;
                const age = τ - born;
                const a = r() * Math.PI * 2, rho = 0.1 + r() * 1.15;
                const ca = Math.cos(a) * Math.sin(rho), sa = Math.sin(a) * Math.sin(rho), cr = Math.cos(rho);
                const c = palette[i % palette.length];
                const arcK = r() - 0.5;
                if (age < 0 || age > flight) continue;
                const tx = C0.x + (n0.x * cr + e1.x * ca + e2.x * sa) * MOON_R;
                const ty = C0.y + (n0.y * cr + e1.y * ca + e2.y * sa) * MOON_R;
                const tz = C0.z + (n0.z * cr + e1.z * ca + e2.z * sa) * MOON_R;
                const arc = Math.sin(age / flight * Math.PI) * 600 * arcK;
                for (let k = 0; k < 3; k++) {
                    const u = Math.max(0, age / flight - k * 0.05);
                    this.volley.put(lerp(book.x, tx, u) + arc, lerp(book.y, ty, u) + arc * 0.5, lerp(book.z, tz, u),
                        22 - k * 5, 1 - k * 0.3, c[0], c[1], c[2]);
                }
            }
            const s = window4(τ, CUE.form + 0.4, CUE.barrage, CUE.spear - 0.8, CUE.spear);
            this.bookSeal.visible = s > 0.01;
            this.bookSeal.position.copy(book).addScaledVector(this._t.d.copy(this.G).sub(book).normalize(), GIANT_H * 0.05);
            this.bookSeal.lookAt(this.G);
            this.bookSeal.rotateZ(τ * 0.6);
            this.bookSeal.scale.setScalar(GIANT_H * (0.5 + 0.9 * s));
            this.bookSeal.material.opacity = s;
        } else {
            this.bookSeal.visible = false;
        }
        this._poseStrikes(τ, hand, dir);
        this.volley.end();
    };

    //--- the dice's answer, stopped by the Moon --------------------------------

    // A fresh cut in the Moon's face: white hot down the middle, gold to its
    // edges, tapering to nothing at both ends (or, `dark`, the gouge under
    // it). Its length runs down the texture.
    function slashCanvas(dark) {
        return canvasOf(64, 256, (ctx, w, h) => {
            for (let y = 0; y < h; y++) {
                const taper = Math.pow(Math.sin((y + 0.5) / h * Math.PI), 0.6);
                const g = ctx.createLinearGradient(0, 0, w, 0);
                if (dark) {
                    g.addColorStop(0, "rgba(20,14,10,0)");
                    g.addColorStop(0.5 - 0.3 * taper, "rgba(20,14,10," + (0.6 * taper) + ")");
                    g.addColorStop(0.5, "rgba(8,5,4," + taper + ")");
                    g.addColorStop(0.5 + 0.3 * taper, "rgba(20,14,10," + (0.6 * taper) + ")");
                    g.addColorStop(1, "rgba(20,14,10,0)");
                } else {
                    g.addColorStop(0, "rgba(255,120,30,0)");
                    g.addColorStop(0.5 - 0.2 * taper, "rgba(255,150,50," + (0.5 * taper) + ")");
                    g.addColorStop(0.5, "rgba(255,250,225," + taper + ")");
                    g.addColorStop(0.5 + 0.2 * taper, "rgba(255,150,50," + (0.5 * taper) + ")");
                    g.addColorStop(1, "rgba(255,120,30,0)");
                }
                ctx.fillStyle = g;
                ctx.fillRect(0, y, w, 1);
            }
        });
    }

    // Rows of a cut's strip: it is carved row by row, end to end.
    const SCAR_ROWS = 24;

    // Where each blow lands on the Moon and the cuts it leaves there, laid
    // out once: on the face turned to her, clear of where the spear will
    // bore through it later.
    MovieStage.prototype._buildStrikes = function () {
        const own = (x) => this._own(x);
        const v = this.variant;
        const atk = attackFor(v);
        this.attack = atk;
        const C0 = this.moonPos;
        const hand = this.releasePoint;
        const n0 = hand.clone().sub(C0).normalize();
        const e1 = new THREE.Vector3(0, 1, 0).addScaledVector(n0, -n0.y).normalize();
        const e2 = new THREE.Vector3().crossVectors(n0, e1);
        this.strikeFrame = { n0, e1, e2 };
        this.strikeNormal = n0;
        const hole = this.moon.entry.clone().sub(C0).normalize();
        const r = rng(0x5ca7 + v.face);
        // The direction `rho` radians off `n`, at bearing `a` round it.
        const tilt = (n, a, rho) => {
            const t1 = e1.clone().addScaledVector(n, -e1.dot(n)).normalize();
            const t2 = new THREE.Vector3().crossVectors(n, t1);
            return n.clone().multiplyScalar(Math.cos(rho)).addScaledVector(t1, Math.cos(a) * Math.sin(rho))
                .addScaledVector(t2, Math.sin(a) * Math.sin(rho)).normalize();
        };
        const pick = (reach, rhoMax) => {
            let best = null, bestA = -1;
            for (let k = 0; k < 40; k++) {
                const n = tilt(n0, r() * Math.PI * 2, 0.08 + r() * rhoMax);
                const a = n.angleTo(hole);
                if (a > 0.3 + reach) return n;
                if (a > bestA) { bestA = a; best = n; }
            }
            return best;
        };
        const tangent = (n, d) => {
            const t = d.clone().addScaledVector(n, -d.dot(n));
            return t.lengthSq() > 1e-8 ? t.normalize() : e1.clone().addScaledVector(n, -e1.dot(n)).normalize();
        };
        const turn = (n, d, a) => d.clone().multiplyScalar(Math.cos(a)).addScaledVector(new THREE.Vector3().crossVectors(n, d), Math.sin(a));
        const off = (n, d, a) => n.clone().multiplyScalar(Math.cos(a)).addScaledVector(d, Math.sin(a)).normalize();
        const probe = new THREE.Object3D();
        const ringGeo = own(new THREE.RingGeometry(0.82, 1, 64, 1, 0, Math.PI));
        const glowTex = own(new THREE.CanvasTexture(slashCanvas(false)));
        const darkTex = own(new THREE.CanvasTexture(slashCanvas(true)));
        const basis = new THREE.Matrix4();
        // A strip of the Moon's own sphere, a hair above it, centred on `c`
        // and running along `d`.
        const strip = (c, d, len, w, lift, tex, additive) => {
            const geo = own(new THREE.SphereGeometry(MOON_R * lift, 2, SCAR_ROWS, -w / 2, w, Math.PI / 2 - len / 2, len));
            const m = new THREE.Mesh(geo, own(new THREE.MeshBasicMaterial({
                map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
                blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
            })));
            const x = c.clone().negate();
            const z = new THREE.Vector3().crossVectors(x, d).normalize();
            const y = new THREE.Vector3().crossVectors(z, x).normalize();
            basis.makeBasis(x, y, z);
            m.quaternion.setFromRotationMatrix(basis);
            m.position.copy(C0);
            m.renderOrder = additive ? 2 : 1;
            m.visible = false;
            this.main.add(m);
            return m;
        };
        const sc = atk.scar;
        const lay = sc.lay || "single";
        const reach = lay === "scatter" || lay === "ring" ? 0.18 + sc.len : sc.len / 2 + (lay === "parallel" ? sc.w * 4 : 0);
        const rhoMax = atk.motion === "leap" ? 0.3 : atk.motion === "read" ? 1.1 : 0.95;
        this.strikeFx = strikesOf(v).map((st) => {
            const n = pick(reach, rhoMax);
            const point = C0.clone().addScaledVector(n, MOON_R);
            // The cut runs the way the edge was swung; a shot's, any way.
            const roll = atk.roll === "alt" ? (st.i % 2 ? -0.7 : 0.7) : typeof atk.roll === "number" ? atk.roll : 0.4;
            let d;
            if (atk.throw === "crescent") {
                probe.position.copy(hand);
                probe.lookAt(point);
                if (!atk.flat) probe.rotateZ(roll);
                d = tangent(n, new THREE.Vector3(1, 0, 0).applyQuaternion(probe.quaternion));
            } else {
                d = turn(n, tangent(n, e1), r() * Math.PI);
            }
            const perp = new THREE.Vector3().crossVectors(n, d).normalize();
            const lines = [];
            const add = (c, dd) => lines.push({ c, d: tangent(c, dd) });
            if (lay === "star") {
                for (let k = 0; k < sc.n; k++) add(n, turn(n, d, k * Math.PI / sc.n));
            } else if (lay === "parallel") {
                for (let k = 0; k < sc.n; k++) add(off(n, perp, (k - (sc.n - 1) / 2) * sc.w * 3.5), d);
            } else if (lay === "ring") {
                for (let k = 0; k < sc.n; k++) {
                    const a = k * Math.PI * 2 / sc.n;
                    add(off(n, turn(n, d, a), 0.12), turn(n, d, a + Math.PI / 2));
                }
            } else if (lay === "scatter") {
                for (let k = 0; k < sc.n; k++) add(tilt(n, r() * Math.PI * 2, 0.03 + r() * 0.12), turn(n, d, r() * Math.PI));
            } else {
                add(n, d);
            }
            const carve = sc.grind || 0.12;
            const meshes = lines.map((L) => ({
                carve,
                dark: strip(L.c, L.d, sc.len, sc.w * 2.2, 1.003, darkTex, false),
                glow: strip(L.c, L.d, sc.len, sc.w, 1.007, glowTex, true),
                c: L.c, d: L.d
            }));
            // A shot lands where each of its cuts is; anything else, at the centre.
            const scattered = atk.throw === "streak" && (lay === "scatter" || lay === "ring");
            const targets = scattered ? lines.map((L) => C0.clone().addScaledVector(L.c, MOON_R)) : [point];
            const cres = atk.throw === "crescent" ? Array.from({ length: atk.claws || 1 }, () => {
                const m = new THREE.Mesh(ringGeo, own(new THREE.MeshBasicMaterial({
                    color: 0xffe6a0, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
                })));
                m.visible = false;
                this.main.add(m);
                return m;
            }) : [];
            const flash = new THREE.Sprite(own(new THREE.SpriteMaterial({
                map: this._glowTex, color: 0xffd8a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            flash.visible = false;
            this.main.add(flash);
            return { st, n, point, perp, roll, lines: meshes, targets, cres, flash, carve, seed: 0x5c1a + st.i * 97 + v.face };
        });
        // On a natural 1 she goes herself, to where her fist will land.
        this.leapPoint = atk.motion === "leap" && this.strikeFx.length ? this.strikeFx[0].point : null;
    };

    // A point along a cut, `k` of the way from the end it is carved from.
    MovieStage.prototype._scarPoint = function (L, len, k, out) {
        const φ = len / 2 - k * len;
        return out.copy(L.c).multiplyScalar(Math.cos(φ)).addScaledVector(L.d, Math.sin(φ)).multiplyScalar(MOON_R).add(this.moonPos);
    };

    MovieStage.prototype._poseStrikes = function (τ, hand, dir) {
        const fx = this.strikeFx;
        if (!fx) return;
        const atk = this.attack;
        const len = atk.scar.len;
        const o = this._sv || (this._sv = { o: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3() });
        const big = atk.motion === "leap";
        fx.forEach((f) => {
            const st = f.st;
            const flight = st.arrive - st.t;
            // What crosses the sky, from the hand that sent it.
            if (flight > 0 && atk.motion !== "read") {
                const age = τ - st.t;
                const going = age >= 0 && age < flight;
                const left = (atk.motion === "jab" || atk.motion === "flurry" || atk.motion === "claw") && st.i % 2 === 1;
                const from = left ? this._boneAt("lHand", o.o) : o.o.copy(hand);
                from.addScaledVector(dir, GIANT_H * (atk.throw === "streak" ? 0.45 : 0.3));
                f.cres.forEach((m, j) => {
                    m.visible = going;
                    if (!going) return;
                    const u = age / flight;
                    m.position.copy(from).lerp(f.point, u).addScaledVector(f.perp, (j - (f.cres.length - 1) / 2) * GIANT_H * 0.14);
                    m.lookAt(f.point);
                    if (atk.flat) m.rotateX(Math.PI / 2); else m.rotateZ(f.roll);
                    if (atk.spin) m.rotateZ(τ * 30);
                    const k = GIANT_H * (0.35 + 0.55 * u) * (atk.size || 1);
                    m.scale.set(k, atk.thin ? k * 0.45 : k, k);
                    m.material.opacity = 0.95 * Math.min(1, age * 10);
                });
                if (going && atk.throw === "streak") {
                    f.targets.forEach((p) => {
                        for (let k = 0; k < 6; k++) {
                            const u = age / flight - k * (atk.trail || 0.1) / 6;
                            if (u < 0) break;
                            this.volley.put(lerp(from.x, p.x, u), lerp(from.y, p.y, u), lerp(from.z, p.z, u),
                                (atk.size || 12) * (1 - k * 0.12), 1 - k * 0.15, 1, 0.9, 0.55);
                        }
                    });
                }
            }
            // And the Moon taking it: the cut carved, white hot, then cooling.
            const since = τ - st.arrive;
            const shown = since >= 0;
            f.lines.forEach((L) => {
                L.glow.visible = L.dark.visible = shown;
                if (!shown) return;
                const k = clamp01(since / L.carve);
                const count = 12 * Math.max(1, Math.ceil(SCAR_ROWS * k));
                L.glow.geometry.setDrawRange(0, count);
                L.dark.geometry.setDrawRange(0, count);
                const heat = since < L.carve ? 1 : Math.exp(-(since - L.carve) * 0.7);
                L.glow.material.opacity = 0.25 + 0.75 * heat;
                L.dark.material.opacity = 0.75 * Math.min(1, since * 8);
            });
            // The flash where it struck (at the teeth, while a cut grinds).
            const fl = f.flash;
            const slow = f.carve > 0.2;
            const grinding = slow && since >= 0 && since < f.carve;
            fl.visible = since >= 0 && since < f.carve + 2;
            if (fl.visible) {
                if (grinding) this._scarPoint(f.lines[0], len, since / f.carve, fl.position); else fl.position.copy(f.point);
                const after = grinding ? 0 : since - (slow ? f.carve : 0);
                fl.scale.setScalar(MOON_R * (big ? 1.3 : 0.45) * (grinding ? 0.6 + 0.1 * Math.sin(τ * 40) : Math.exp(-after * 2.2)));
                fl.material.opacity = grinding ? 0.9 : Math.exp(-after * 3);
            }
            // Sparks and splinters of rock thrown off it.
            if (since >= 0 && since < f.carve + 0.8) {
                const nS = big ? 90 : 36;
                for (let j = 0; j < nS; j++) {
                    const r = pr(f.seed, j);
                    const born = slow ? r() * f.carve : r() * 0.05;
                    const sp = (big ? 260 : 120) + r() * 200;
                    const vx = r() - 0.5, vy = r() - 0.5, vz = r() - 0.5;
                    const size = 6 + r() * 8, g = 0.7 + r() * 0.25;
                    const a = since - born;
                    if (a < 0 || a > 0.7) continue;
                    const at = slow ? this._scarPoint(f.lines[0], len, born / f.carve, o.p) : o.p.copy(f.point);
                    at.addScaledVector(f.n, sp * a).add(o.q.set(vx, vy, vz).multiplyScalar(sp * 1.6 * a));
                    this.volley.put(at.x, at.y, at.z, size, 1 - a / 0.7, 1, g, 0.4);
                }
            }
        });
    };

    //--- the eye's ward --------------------------------------------------------

    // God's last defence: a wall of light in triangles thrown up across the
    // spear's path in front of his eye. The tip presses into it in the slow
    // last second, it cracks from the point outwards, and it bursts into
    // shards a moment before the spear goes through; the shockwave of the
    // impact follows.
    function wardCanvas() {
        return canvasOf(512, 512, (ctx, w, h) => {
            const c = w / 2, cy = h * 0.56;
            ctx.globalCompositeOperation = "lighter";
            const tri = (r, width, alpha) => {
                ctx.strokeStyle = "rgba(255,150,50," + alpha + ")";
                ctx.lineWidth = width;
                ctx.beginPath();
                for (let i = 0; i <= 3; i++) {
                    const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
                    const x = c + Math.cos(a) * r, y = cy + Math.sin(a) * r;
                    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
            };
            for (let i = 0; i < 9; i++) {
                const r = 30 + i * 26;
                tri(r, 16, 0.08);
                tri(r, 4, 0.55 - i * 0.04);
            }
            const g = ctx.createRadialGradient(c, cy, 0, c, cy, 240);
            g.addColorStop(0, "rgba(255,190,90,0.35)");
            g.addColorStop(1, "rgba(255,120,30,0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        });
    }
    function wardCrackCanvas() {
        return canvasOf(512, 512, (ctx, w, h) => {
            const r = rng(0xc4a6);
            ctx.lineCap = "round";
            for (let k = 0; k < 22; k++) {
                let x = w / 2, y = h * 0.56, a = r() * Math.PI * 2;
                ctx.strokeStyle = "rgba(255,255,240,0.95)";
                ctx.lineWidth = 1.5 + r() * 3;
                ctx.beginPath();
                ctx.moveTo(x, y);
                const n = 6 + Math.floor(r() * 10);
                for (let i = 0; i < n; i++) {
                    a += (r() - 0.5) * 0.8;
                    x += Math.cos(a) * 18; y += Math.sin(a) * 18;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        });
    }

    MovieStage.prototype._buildWard = function () {
        const own = (x) => this._own(x);
        const plane = own(new THREE.PlaneGeometry(1, 1));
        const add = (tex, color) => {
            const m = new THREE.Mesh(plane, own(new THREE.MeshBasicMaterial({
                map: tex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
                depthWrite: false, side: THREE.DoubleSide
            })));
            m.visible = false;
            this.main.add(m);
            return m;
        };
        const tex = own(new THREE.CanvasTexture(wardCanvas()));
        this.ward = {
            wall: add(tex, 0xffffff),
            echoes: [0, 1, 2].map(() => add(tex, 0xffb060)),
            cracks: add(own(new THREE.CanvasTexture(wardCrackCanvas())), 0xffffff),
            flare: (() => {
                const f = new THREE.Sprite(own(new THREE.SpriteMaterial({
                    map: this._glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
                })));
                f.visible = false;
                this.main.add(f);
                return f;
            })(),
            shards: [],
            rings: [0, 1].map((i) => {
                const m = new THREE.Mesh(own(new THREE.TorusGeometry(1, i ? 0.012 : 0.03, 8, 96)), own(new THREE.MeshBasicMaterial({
                    color: i ? 0xffffff : 0xffc860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
                })));
                m.visible = false;
                this.main.add(m);
                return m;
            })
        };
        // The shards it breaks into: triangles of it, each with its own way out.
        const shardGeo = own(new THREE.BufferGeometry());
        shardGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0.6, 0, -0.52, -0.3, 0, 0.52, -0.3, 0]), 3));
        const shardMat = own(new THREE.MeshBasicMaterial({
            color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        }));
        this.ward.shardMat = shardMat;
        const r = rng(0x5ba8d);
        for (let i = 0; i < 60; i++) {
            const m = new THREE.Mesh(shardGeo, shardMat);
            m.visible = false;
            m.userData = { a: r() * Math.PI * 2, d: Math.sqrt(r()), sp: 0.6 + r() * 1.6, size: 0.04 + r() * 0.09, spin: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(14) };
            this.main.add(m);
            this.ward.shards.push(m);
        }
    };

    MovieStage.prototype._poseWard = function (τ) {
        const w = this.ward;
        if (!w) return;
        const dir = this.spearDir;
        const S = GOD_SIZE * 1.25;
        // A little in front of the eye, square to the spear.
        const at = this._t.a.copy(this.G).addScaledVector(dir, -GOD_SIZE * 0.32);
        const face = this._t.b.copy(at).sub(dir);
        const up = CUE.silence - 1.2, breakAt = CUE.impact - 0.06;
        const shown = smooth(span(τ, up, up + 0.5)) * (τ < breakAt ? 1 : 0);
        const press = smooth(span(τ, CUE.silence, breakAt));
        const all = [w.wall, w.cracks].concat(w.echoes);
        all.forEach((m) => {
            m.visible = shown > 0.01;
            if (!m.visible) return;
            m.position.copy(at);
            m.lookAt(face);
        });
        if (shown > 0.01) {
            // It throbs harder the harder it is pushed.
            const throb = 1 + 0.04 * Math.sin(τ * (14 + press * 30));
            w.wall.scale.setScalar(S * throb);
            w.wall.material.opacity = shown * (0.75 + 0.25 * press);
            w.echoes.forEach((m, i) => {
                const ph = ((τ * (1.4 + press * 3) + i / 3) % 1);
                m.scale.setScalar(S * (1 + ph * 0.7));
                m.material.opacity = shown * (1 - ph) * 0.45;
            });
            w.cracks.scale.setScalar(S * (0.2 + 0.9 * press));
            w.cracks.material.opacity = smooth(span(τ, CUE.silence + 0.2, breakAt)) * shown;
        }
        // Where the point is in it, white hot.
        const touching = τ >= CUE.silence - 0.2 && τ < breakAt + 0.25;
        w.flare.visible = touching;
        if (touching) {
            w.flare.position.copy(at);
            w.flare.scale.setScalar(GOD_SIZE * (0.4 + 1.6 * press + 3 * decay(τ, breakAt, 6)));
            w.flare.material.opacity = Math.min(1, 0.5 + press);
        }
        // The break: every shard of it thrown out round the spear and on.
        const age = τ - breakAt;
        const flying = age >= 0 && age < 2.5;
        w.shardMat.opacity = flying ? 1 - smooth(span(age, 1.2, 2.5)) : 0;
        const side = this._t.c.set(dir.y, -dir.x, 0);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        const other = this._t.d.crossVectors(dir, side).normalize();
        w.shards.forEach((m) => {
            m.visible = flying;
            if (!flying) return;
            const u = m.userData;
            const out = S * 0.5 * u.d + S * u.sp * age;
            m.position.copy(at)
                .addScaledVector(side, Math.cos(u.a) * out)
                .addScaledVector(other, Math.sin(u.a) * out)
                .addScaledVector(dir, S * 0.6 * age * u.sp);
            m.rotation.set(u.spin.x * age, u.spin.y * age, u.spin.z * age);
            m.scale.setScalar(S * u.size);
        });
        // And the shockwave out of him as it goes in.
        w.rings.forEach((m, i) => {
            const a = τ - CUE.impact - i * 0.12;
            m.visible = a >= 0 && a < 1.6;
            if (!m.visible) return;
            m.position.copy(this.G);
            m.quaternion.setFromUnitVectors(this._t.e.set(0, 0, 1), dir);
            m.scale.setScalar(GOD_SIZE * (0.3 + 7 * Math.pow(a / 1.6, 0.6)));
            m.material.opacity = (1 - a / 1.6) * (i ? 0.9 : 0.7);
        });
    };

    //--- the Moon ------------------------------------------------------------

    // The Moon stands across the spear's path, a little off its centre, and the
    // spear goes straight through it: a round hole is drilled along its line
    // from the side it comes in to the side it leaves by, the inside of the
    // tunnel glows as it cools, and rock is thrown out of both mouths.
    const MOON_OFF = 0.38;      // how far off centre the line passes, in radii
    const MOON_HOLE = 0.16;     // the hole's radius, in radii

    MovieStage.prototype._buildMoon = function (tex) {
        const G0 = new THREE.Vector3(GOD_AT[0], GOD_AT[1], GOD_AT[2]);
        const H = this.releasePoint;
        const dir = G0.clone().sub(H).normalize();
        const X = new THREE.Vector3(1, 0, 0);
        const perp = X.clone().addScaledVector(dir, -X.dot(dir)).normalize();
        const mid = H.clone().lerp(G0, 0.5);
        this.moonPos = mid.clone().addScaledVector(perp, MOON_R * MOON_OFF);
        const half = MOON_R * Math.sqrt(1 - MOON_OFF * MOON_OFF);
        const entry = mid.clone().addScaledVector(dir, -half);
        const exit = mid.clone().addScaledVector(dir, half);
        this.grazePoint = exit;
        const holeR = MOON_R * MOON_HOLE;
        // When the spear's tip reaches each mouth.
        const total = H.distanceTo(G0);
        const flight = CUE.impact - CUE.release;
        const tIn = CUE.release + flight * (H.distanceTo(entry) / total);
        const tOut = CUE.release + flight * (H.distanceTo(exit) / total);
        const u = { uHoleA: { value: new THREE.Vector3() }, uHoleD: { value: dir.clone() }, uHoleR: { value: 0 },
            uDrill: { value: 0 }, uHeat: { value: 0 } };
        const mat = this._own(new THREE.MeshPhongMaterial({
            map: tex || null, color: tex ? 0xffffff : 0x9a9a96, emissive: 0x2a2a30, emissiveMap: tex || null, shininess: 2
        }));
        // The hole is cut in the Moon's own frame: the moon does not turn, so
        // the line through it can be given once, relative to its centre.
        u.uHoleA.value.copy(entry).sub(this.moonPos);
        mat.onBeforeCompile = function (shader) {
            Object.assign(shader.uniforms, u);
            shader.vertexShader = "varying vec3 vMoonP;\n" + shader.vertexShader
                .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMoonP = position;");
            shader.fragmentShader = "uniform vec3 uHoleA;\nuniform vec3 uHoleD;\nuniform float uHoleR;\nuniform float uDrill;\nuniform float uHeat;\nvarying vec3 vMoonP;\n" +
                shader.fragmentShader
                    .replace("#include <clipping_planes_fragment>", [
                        "#include <clipping_planes_fragment>",
                        "vec3 smvHd = vMoonP - uHoleA;",
                        "float smvHt = dot(smvHd, uHoleD);",
                        "float smvHr = length(smvHd - uHoleD * smvHt);",
                        "if (smvHr < uHoleR && smvHt < uDrill) discard;"
                    ].join("\n"))
                    .replace("#include <emissivemap_fragment>", [
                        "#include <emissivemap_fragment>",
                        "totalEmissiveRadiance += vec3(1.0, 0.45, 0.12) * uHeat * (1.0 - smoothstep(uHoleR, uHoleR * 1.6 + 0.001, smvHr)) * step(0.001, uHoleR) * step(smvHt, uDrill + uHoleR);"
                    ].join("\n"));
        };
        mat.customProgramCacheKey = () => "startinMoon";
        const moon = new THREE.Mesh(this._own(new THREE.SphereGeometry(MOON_R, 96, 64)), mat);
        moon.position.copy(this.moonPos);
        this.main.add(moon);
        // The tunnel's wall, glowing and then cooling.
        const tunnel = new THREE.Mesh(this._own(new THREE.CylinderGeometry(holeR, holeR, 1, 32, 1, true)), this._own(new THREE.MeshStandardMaterial({
            color: 0x3a3632, roughness: 1, emissive: 0xff6a20, emissiveIntensity: 1, side: THREE.DoubleSide
        })));
        tunnel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        tunnel.visible = false;
        this.main.add(tunnel);
        // A burning rim round each mouth.
        const rim = () => {
            const m = new THREE.Mesh(this._own(new THREE.TorusGeometry(holeR * 1.08, holeR * 0.16, 8, 48)), this._own(new THREE.MeshBasicMaterial({
                color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            m.visible = false;
            this.main.add(m);
            return m;
        };
        const flashAt = (p) => {
            const f = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
                map: this._glowTex, color: 0xffd080, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            f.position.copy(p);
            this.main.add(f);
            return f;
        };
        const rimIn = rim(), rimOut = rim();
        rimIn.position.copy(entry);
        rimOut.position.copy(exit);
        // Rock knocked out of the far side, drifting off for good.
        const rocks = [];
        const r = rng(0x30c4);
        const rockGeo = this._own(new THREE.IcosahedronGeometry(1, 0));
        const rockMat = this._own(new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1, emissive: 0x3a1a08 }));
        for (let i = 0; i < 14; i++) {
            const m = new THREE.Mesh(rockGeo, rockMat);
            m.scale.setScalar(4 + r() * 14);
            m.userData.v = dir.clone().multiplyScalar(80 + r() * 160).add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(90));
            m.userData.spin = new THREE.Vector3(r(), r(), r());
            m.visible = false;
            this.main.add(m);
            rocks.push(m);
        }
        this.moon = {
            mesh: moon, u, tunnel, rimIn, rimOut, flashIn: flashAt(entry), flashOut: flashAt(exit), rocks,
            dir, entry, exit, half, holeR, tIn, tOut
        };
        this.moonDust = new Spray(this, 420, false);
        this.main.add(this.moonDust.points);
    };

    MovieStage.prototype._poseMoon = function (τ) {
        const m = this.moon;
        // Drilled from mouth to mouth as the tip goes through.
        const drill = span(τ, m.tIn, m.tOut);
        const open = τ >= m.tIn;
        m.u.uHoleR.value = open ? m.holeR * smooth(Math.min(1, (τ - m.tIn) / 0.08 + 0.4)) : 0;
        m.u.uDrill.value = drill * m.half * 2 + (drill >= 1 ? m.holeR * 2 : 0);
        const heat = open ? Math.exp(-Math.max(0, τ - m.tOut) * 0.35) : 0;
        m.u.uHeat.value = heat * 1.6;
        m.tunnel.visible = drill > 0.01;
        if (m.tunnel.visible) {
            const len = Math.max(0.01, drill * m.half * 2);
            m.tunnel.position.copy(m.entry).addScaledVector(m.dir, len / 2);
            m.tunnel.scale.set(1, len, 1);
            m.tunnel.material.emissiveIntensity = 0.15 + 1.6 * heat;
        }
        [[m.rimIn, m.tIn], [m.rimOut, m.tOut]].forEach(([ring, t0]) => {
            ring.visible = τ >= t0;
            ring.material.opacity = ring.visible ? Math.min(1, (τ - t0) * 8) * (0.25 + 0.75 * heat) : 0;
        });
        [[m.flashIn, m.tIn], [m.flashOut, m.tOut]].forEach(([f, t0]) => {
            f.visible = τ >= t0 && τ < t0 + 3;
            f.scale.setScalar(MOON_R * 1.6 * decay(τ, t0, 1.2));
            f.material.opacity = decay(τ, t0, 1.5);
        });
        const age = τ - m.tOut;
        m.rocks.forEach((rock) => {
            rock.visible = age >= 0;
            if (age < 0) return;
            rock.position.copy(m.exit).addScaledVector(rock.userData.v, age);
            rock.rotation.set(rock.userData.spin.x * age, rock.userData.spin.y * age, rock.userData.spin.z * age);
        });
        // Dust blown back out of the way in and on out of the way out.
        this.moonDust.begin();
        [[m.entry, m.tIn, -1, 0xd057], [m.exit, m.tOut, 1, 0xd058]].forEach(([at, t0, sign, seed]) => {
            const a = τ - t0;
            if (a < 0) return;
            for (let i = 0; i < 210; i++) {
                const r = pr(seed, i);
                const life = 3 + r() * 5;
                const v = this._t.a.copy(m.dir).multiplyScalar(sign * (40 + r() * 160))
                    .add(this._t.b.set(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(140));
                if (a > life) continue;
                this.moonDust.put(at.x + v.x * a, at.y + v.y * a, at.z + v.z * a,
                    4 + r() * 10 + a * 3, (1 - a / life) * 0.8, 0.75, 0.68, 0.6);
            }
        });
        this.moonDust.end();
    };

    //--- the golden blasts ---------------------------------------------------

    MovieStage.prototype._buildBlasts = function () {
        const ringGeo = this._own(new THREE.RingGeometry(0.82, 1, 48, 1));
        const ballGeo = this._own(new THREE.SphereGeometry(1, 24, 16));
        const glow = (color, extra) => this._own(new THREE.MeshBasicMaterial(Object.assign({
            color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
        }, extra || {})));
        const holeMat = () => this._own(new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uRim: { value: new THREE.Color(0xffc840) }, uPush: { value: 0 } },
            vertexShader: FRESNEL_VERT,
            fragmentShader: HOLE_FRAG
        }));
        // The schedule: the impact itself, then a wave on every beat until
        // the music stops.
        const r = rng(0x60d5);
        const list = [{ at: CUE.impact, off: [0, 0, 0], R: 650, cross: true }];
        beatsBetween(CUE.impact + 0.2, CUE.fall).forEach((b, wave) => {
            const n = 3 + (wave % 3);
            for (let i = 0; i < n; i++) {
                const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u), d = 500 + r() * 2600;
                const rad = 90 + r() * 280;
                list.push({ at: b + r() * 0.12, off: [q * Math.cos(a) * d, u * d * 0.7 + 300, q * Math.sin(a) * d], R: rad, cross: rad > 260 });
            }
        });
        this.blastList = list;
        this.blasts = list.map((b) => {
            const tint = b.color ? new THREE.Color(b.color) : null;
            const ring = new THREE.Mesh(ringGeo, glow(tint ? tint.getHex() : 0xffe6a0, { side: THREE.DoubleSide }));
            const core = new THREE.Mesh(ringGeo, glow(0xffffff, { side: THREE.DoubleSide }));
            const ball = new THREE.Mesh(ballGeo, glow(tint ? tint.clone().multiplyScalar(0.8).getHex() : 0xffb020));
            const heart = new THREE.Mesh(ballGeo, glow(0xfff3d0));
            const hole = new THREE.Mesh(ballGeo, holeMat());
            if (tint) hole.material.uniforms.uRim.value.copy(tint);
            hole.renderOrder = 2;
            [ring, core, ball, heart, hole].forEach((m) => { m.visible = false; this.main.add(m); });
            return { ring, core, ball, heart, hole };
        });
    };

    MovieStage.prototype._poseBlasts = function (τ, cam) {
        const RING = 0.8, HOLE = 1.8;
        const base = this._t.a.copy(this.G);
        this.blastList.forEach((b, i) => {
            const s = this.blasts[i];
            const a = τ - b.at;
            [s.ring, s.core, s.ball, s.heart, s.hole].forEach((m) => { m.visible = false; });
            if (a < 0 || a > RING + HOLE + 0.5) return;
            const at = this._t.b.copy(base).add(this._t.c.set(b.off[0], b.off[1], b.off[2]));
            if (a < RING) {
                const u = a / RING;
                const open = Math.min(1, u * 1.6);
                const rad = b.R * smooth(open);
                const fade = Math.sin(open * Math.PI * 0.5) * (1 - u * 0.25);
                [s.ring, s.core].forEach((m, c) => {
                    m.visible = true;
                    m.position.copy(at);
                    m.quaternion.copy(cam.quaternion);
                    m.rotateZ(τ * 0.4 + i);
                    m.scale.setScalar(Math.max(0.01, rad * (c ? 0.94 : 1)));
                    m.material.opacity = fade * (c ? 0.5 : 0.85);
                });
                s.ball.visible = s.heart.visible = true;
                s.ball.position.copy(at);
                s.ball.scale.setScalar(Math.max(0.01, rad * 0.78));
                s.ball.material.opacity = fade * (1 - u * 0.4) * 0.55;
                s.heart.position.copy(at);
                s.heart.scale.setScalar(Math.max(0.01, rad * (0.1 + u * 0.18)));
                s.heart.material.opacity = fade * 0.9;
            } else {
                // The collapse into a golden black hole, and its evaporation.
                const c = (a - RING) / HOLE;
                const full = b.R * 0.78;
                const fall = 1 - smooth(c / 0.55);
                s.ball.visible = fall > 0.01;
                s.ball.position.copy(at);
                s.ball.scale.setScalar(Math.max(0.01, full * fall));
                s.ball.material.opacity = 0.45 * fall;
                const holeR = full * 0.3 * smooth(c / 0.25) * (1 - smooth((c - 0.4) / 0.6));
                s.hole.visible = holeR > 0.5;
                s.hole.position.copy(at);
                s.hole.scale.setScalar(Math.max(0.01, holeR));
                s.hole.material.uniforms.uOpacity.value = 1 - smooth((c - 0.85) / 0.15);
                s.hole.material.uniforms.uTime.value = τ;
                s.ring.visible = holeR > 0.5;
                s.ring.position.copy(at);
                s.ring.quaternion.copy(cam.quaternion);
                s.ring.rotateZ(τ * 3 + i);
                s.ring.scale.setScalar(Math.max(0.01, holeR * 2.4));
                s.ring.material.opacity = 0.7 * Math.sin(clamp01(c) * Math.PI);
            }
        });
    };

    //--- the corpse ----------------------------------------------------------

    // An impossible triangle, the way Escher drew it: three beams at right
    // angles that only close up from where the eye stands, so it is always
    // turned to face whoever looks at it. Made of meat.
    MovieStage.prototype._buildCorpse = function () {
        const outer = new THREE.Group();
        const inner = new THREE.Group();
        outer.add(inner);
        const L = 1, th = 0.2;
        this.fleshU = { uTime: { value: 0 }, uRot: { value: 0 } };
        const u = this.fleshU;
        const mat = this._own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 }));
        mat.onBeforeCompile = function (shader) {
            shader.uniforms.uTime = u.uTime;
            shader.uniforms.uRot = u.uRot;
            shader.vertexShader = "uniform float uTime;\nuniform float uRot;\nvarying vec3 vFP;\n" + GLSL_NOISE + "\n" + shader.vertexShader
                .replace("#include <begin_vertex>", [
                    "vec3 transformed = vec3(position);",
                    "float smvW = smvNoise(position * 7.0 + vec3(uTime * 0.6, 0.0, uTime * 0.4));",
                    "transformed += normal * (smvW - 0.4) * 0.07 * uRot;",
                    "vFP = position;"
                ].join("\n"));
            shader.fragmentShader = "uniform float uTime;\nuniform float uRot;\nvarying vec3 vFP;\n" + GLSL_NOISE + "\n" + shader.fragmentShader
                .replace("#include <color_fragment>", [
                    "#include <color_fragment>",
                    "float smvM = smvFbm(vFP * 6.0);",
                    "float smvV = 1.0 - smoothstep(0.0, 0.06, abs(smvNoise(vFP * 14.0 + vec3(1.7)) - 0.5));",
                    "vec3 smvFlesh = mix(vec3(0.42, 0.06, 0.12), vec3(0.78, 0.32, 0.30), smvM);",
                    "smvFlesh = mix(smvFlesh, vec3(0.20, 0.02, 0.18), smvV * 0.8);",
                    "smvFlesh = mix(smvFlesh, vec3(0.80, 0.74, 0.40), smoothstep(0.72, 0.8, smvNoise(vFP * 22.0)) * 0.7);",
                    "vec3 smvStone = vec3(0.93, 0.92, 0.88) * (0.85 + 0.15 * smvM);",
                    "diffuseColor.rgb = mix(smvStone, smvFlesh, uRot);"
                ].join("\n"));
        };
        mat.customProgramCacheKey = () => "startinFlesh";
        this._own(mat);
        const beam = (len, axis, at) => {
            const g = this._own(new THREE.BoxGeometry(
                axis === "x" ? len + th : th, axis === "y" ? len + th : th, axis === "z" ? len + th : th,
                axis === "x" ? 40 : 4, axis === "y" ? 40 : 4, axis === "z" ? 40 : 4));
            const m = new THREE.Mesh(g, mat);
            m.position.set(at[0], at[1], at[2]);
            inner.add(m);
        };
        beam(L, "x", [L / 2, 0, 0]);
        beam(L, "y", [L, L / 2, 0]);
        beam(L, "z", [L, L, L / 2]);
        inner.position.set(-0.75 * L, -0.5 * L, -0.25 * L);
        outer.visible = false;
        this.main.add(outer);
        this.corpse = outer;
        this.drips = new Spray(this, 400, false);
        this.main.add(this.drips.points);
        this._diag = new THREE.Vector3(1, 1, 1).normalize();
    };

    MovieStage.prototype._poseCorpse = function (τ, cam) {
        const grow = smooth(span(τ, CUE.rot, CUE.rot + 2));
        this.corpse.visible = grow > 0.001;
        this.fleshU.uTime.value = τ;
        this.fleshU.uRot.value = smooth(span(τ, CUE.rot + 0.3, CUE.rot + 2.2));
        this.drips.begin();
        if (this.corpse.visible) {
            this.corpse.position.copy(this.G);
            this.corpse.scale.setScalar(GOD_SIZE * 1.15 * grow);
            const toCam = this._t.a.copy(cam.position).sub(this.G).normalize();
            this.corpse.quaternion.setFromUnitVectors(this._diag, toCam);
            const r = rng(0xd41b);
            const down = this._t.b.copy(this.G).normalize().negate();
            for (let i = 0; i < 400; i++) {
                const r = pr(0xd41b, i);
                const born = CUE.rot + r() * 14;
                const age = τ - born;
                const life = 2 + r() * 2.5;
                const ox = (r() - 0.5) * GOD_SIZE, oy = (r() - 0.5) * GOD_SIZE, oz = (r() - 0.5) * GOD_SIZE;
                if (age < 0 || age > life) continue;
                const fall = 30 * age * age;
                this.drips.put(this.G.x + ox * grow + down.x * fall, this.G.y + oy * grow + down.y * fall, this.G.z + oz * grow + down.z * fall,
                    6 + r() * 10, (1 - age / life) * 0.85 * this.fleshU.uRot.value, 0.42, 0.05, 0.1);
            }
        }
        this.drips.end();
    };

    //--- the giant breaking --------------------------------------------------

    MovieStage.prototype._poseShards = function (τ) {
        if (!this.shards) {
            this.shards = new Spray(this, 3200, true);
            this.main.add(this.shards.points);
        }
        const s = this.shards;
        s.begin();
        if (τ >= CUE.shatter) {
            const r = rng(0x5ba2d);
            const seeds = this._shardSeeds;
            const k = this.giantScale;
            for (let i = 0; i < 3200; i++) {
                const r = pr(0x5ba2d, i);
                const born = CUE.shatter + 0.2 + r() * 2.6;
                const age = τ - born;
                const life = 3 + r() * 5;
                const p = seeds[Math.floor(r() * seeds.length)];
                const ox = (r() - 0.5) * 0.24 * k, oy = (r() - 0.5) * 0.24 * k, oz = (r() - 0.5) * 0.24 * k;
                const v = this._t.a.set(r() - 0.5, r() - 0.2, r() - 0.5).multiplyScalar(40 + r() * 110);
                if (age < 0 || age > life) continue;
                const warm = r();
                this.shards.put(p.x + ox + v.x * age, p.y + oy + v.y * age, p.z + oz + v.z * age,
                    3 + r() * 7, (1 - age / life) * 0.95, 1, lerp(0.75, 0.95, warm), lerp(0.3, 0.75, warm));
            }
        }
        s.end();
    };

    //--- the cockpit ---------------------------------------------------------

    MovieStage.prototype._buildCockpit = function (fig) {
        const pit = this.pit;
        this.pilotModel = fig.model;
        this.pilotRig = fig.rig;
        this.pilotModel.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        // The movie opens on her already laid on the altar.
        settleRig(this.pilotRig, "death");
        // In the capsule's liquid her hair hardly hangs.
        if (this.pilotRig.physics) {
            this.pilotRig.physics.gravityScale = 0.15;
            this.pilotRig.physics.float = 0.2;
        }
        pit.fog = new THREE.Fog(0x2a1400, 1.5, 9);
        pit.add(new THREE.AmbientLight(0xffb060, 0.55));
        const key = new THREE.PointLight(0xffc070, 1.1, 8, 2);
        key.position.set(0.3, 1.6, 1.4);
        pit.add(key);
        this.alarmLight = new THREE.PointLight(0xff1a10, 0, 7, 2);
        this.alarmLight.position.set(-0.4, 1.9, 0.6);
        pit.add(this.alarmLight);
        this.pitU = { uTime: { value: 0 }, uAlarm: { value: 0 }, uDissolve: { value: 0 }, uPush: { value: 0 } };
        const capsule = new THREE.Mesh(this._own(new THREE.CylinderGeometry(1.5, 1.5, 5, 40, 12, true)), this._own(new THREE.ShaderMaterial({
            uniforms: this.pitU,
            vertexShader: FRESNEL_VERT,
            fragmentShader: PIT_FRAG,
            side: THREE.BackSide
        })));
        capsule.rotation.x = Math.PI / 2;
        capsule.position.y = 1.0;
        pit.add(capsule);
        const seat = new THREE.Mesh(this._own(new THREE.BoxGeometry(0.6, 0.12, 0.6)), this._own(new THREE.MeshStandardMaterial({ color: 0x30241a, roughness: 0.6 })));
        seat.position.set(0, 0.42, -0.08);
        const back = new THREE.Mesh(this._own(new THREE.BoxGeometry(0.6, 0.9, 0.1)), seat.material);
        back.position.set(0, 0.9, -0.42);
        pit.add(seat, back);
        const gripGeo = this._own(new THREE.CylinderGeometry(0.03, 0.035, 0.22, 10));
        const gripMat = this._own(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x401800 }));
        [-0.26, 0.26].forEach((x) => {
            const g = new THREE.Mesh(gripGeo, gripMat);
            g.position.set(x, 0.62, 0.32);
            pit.add(g);
        });
        this.hudRings = [0.9, 1.12, 1.34].map((r, i) => {
            const m = new THREE.Mesh(this._own(new THREE.TorusGeometry(r, 0.006, 6, 96)), this._own(new THREE.MeshBasicMaterial({
                color: i === 1 ? 0x70ffe0 : 0xffb040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            m.position.y = 1.05;
            pit.add(m);
            return m;
        });
        // The rest of the deck, turning slowly round her in the liquid.
        this.panels = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const m = new THREE.Mesh(this._own(new THREE.PlaneGeometry(0.2, 0.2 * ARCANA_RATIO)), this._own(new THREE.MeshBasicMaterial({
                map: this._tarotTex[(7 + i) % this._tarotTex.length], transparent: true, opacity: 0.9,
                depthWrite: false, side: THREE.DoubleSide
            })));
            m.userData.i = i;
            pit.add(m);
            return m;
        });
        // The memories, floating round her as they are taken.
        this.memoryHolos = this._tarotTex.slice(0, 7).map((tex) => {
            const m = new THREE.Mesh(this._own(new THREE.PlaneGeometry(0.18, 0.18 * ARCANA_RATIO)), this._own(new THREE.MeshBasicMaterial({
                map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
            })));
            pit.add(m);
            return m;
        });
        this.bubbles = new Spray(this, 260, true);
        pit.add(this.bubbles.points);
        this.tears = new Spray(this, 60, true);
        pit.add(this.tears.points);
        this.pilotHome = new THREE.Group();
        this.pilotHome.add(this.pilotModel);
        pit.add(this.pilotHome);
        this.pilotFall = new THREE.Group();
        this.main.add(this.pilotFall);
        this.pilotFallLight = new THREE.PointLight(0xffd8a0, 1.2, 40, 2);
        this.pilotFall.add(this.pilotFallLight);
        this.reentry = new Spray(this, 500, true);
        this.main.add(this.reentry.points);
        // Her eyelids, when the model has them.
        this.blink = [];
        this.pilotModel.traverse((o) => {
            if (!o.morphTargetDictionary || !o.morphTargetInfluences) return;
            Object.keys(o.morphTargetDictionary).forEach((name) => {
                if (/EYE_Close$/i.test(name) || /^blink$/i.test(name)) this.blink.push([o, o.morphTargetDictionary[name]]);
            });
        });
        this.pilotHead = new THREE.Vector3();
    };

    MovieStage.prototype._fallPos = function (τ, out) {
        const u = span(τ, CUE.fall, CUE.flash);
        return out.set(0, R + lerp(260, 40, Math.pow(u, 1.4)), 140);
    };

    MovieStage.prototype._posePilot = function (τ, where, dt) {
        const holder = where === "fall" ? this.pilotFall : where === "altar" ? this.pilotAltar : this.pilotHome;
        if (this.pilotModel.parent !== holder) holder.add(this.pilotModel);
        // A cut to another place finds her already in that place's pose, not
        // easing out of the last one.
        if (this._pilotWhere !== where) {
            this._pilotWhere = where;
            settleRig(this.pilotRig, pilotLoop(τ, where));
        }
        if (where === "fall") {
            this._fallPos(τ, this.pilotFall.position);
            this.pilotFall.rotation.set(-1.15 + Math.sin(τ * 0.7) * 0.15, τ * 0.35, Math.sin(τ * 0.5) * 0.2);
        }
        driveRig(this.pilotRig, pilotLoop(τ, where), dt || 0, (p) => pilotLayers(p, τ, where));
        // The pillar takes her apart on the altar; she is whole again inside.
        this.pilotU.uDissolve.value = where === "altar" ? smooth(span(τ, CUE.dissolve, CUE.shootUp)) * 1.02 : 0;
        // Eyes open on the stone until she dies; shut in the capsule until she
        // wakes; squeezed at every blow.
        const shut = where === "altar" ? smooth(span(τ, CUE.dead - 0.3, CUE.dead + 0.3))
            : 1 - smooth(span(τ, CUE.eyesOpen, CUE.eyesOpen + 0.5));
        const blows = where === "altar" ? STABS.map((s) => s.at) : HITS.map((h) => h.at);
        const squeeze = blows.reduce((m, at) => Math.max(m, window4(τ, at, at + 0.1, at + 0.4, at + 0.8)), 0);
        this.blink.forEach(([mesh, i]) => { mesh.morphTargetInfluences[i] = Math.max(shut, squeeze * 0.8); });
        const head = this.pilotRig.entries.head;
        holder.updateMatrixWorld(true);
        if (head) head.bone.getWorldPosition(this.pilotHead);
        else this.pilotHead.set(0, 1.45, 0).applyMatrix4(holder.matrixWorld);
    };

    // The dossier figure's own materials, taught to come apart in light.
    MovieStage.prototype._dissolvable = function (root) {
        const u = this.pilotU;
        const seen = new Set();
        root.traverse((o) => {
            if (!o.isMesh) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
                if (!m || seen.has(m)) return;
                seen.add(m);
                const prev = m.onBeforeCompile;
                m.onBeforeCompile = function (shader, renderer) {
                    if (typeof prev === "function") prev.call(this, shader, renderer);
                    shader.uniforms.uDissolve = u.uDissolve;
                    shader.vertexShader = "varying vec3 vDPos;\n" + shader.vertexShader
                        .replace("#include <skinning_vertex>", "#include <skinning_vertex>\nvDPos = transformed;");
                    shader.fragmentShader = "uniform float uDissolve;\nvarying vec3 vDPos;\n" + GLSL_NOISE + "\n" +
                        shader.fragmentShader.replace("#include <dithering_fragment>", [
                            "float smvN = smvNoise(vDPos * 22.0);",
                            "if (smvN < uDissolve) discard;",
                            "gl_FragColor.rgb += vec3(1.0, 0.85, 0.4) * (1.0 - smoothstep(uDissolve, uDissolve + 0.08, smvN)) * step(0.001, uDissolve) * 3.0;",
                            "#include <dithering_fragment>"
                        ].join("\n"));
                };
                m.customProgramCacheKey = () => "startinPilot";
                m.needsUpdate = true;
            });
        });
    };

    MovieStage.prototype._poseCockpit = function (τ) {
        const alarm = Math.max(window4(τ, CUE.rayHit, CUE.rayHit + 0.2, CUE.judgment, CUE.judgment + 0.4),
            window4(τ, CUE.annihilationHit - 0.1, CUE.annihilationHit, CUE.fireball, CUE.fireball + 0.5), hitShake(τ));
        const flash = 0.5 + 0.5 * Math.sign(Math.sin(τ * 9));
        this.pitU.uTime.value = τ;
        this.pitU.uAlarm.value = clamp01(alarm) * (0.6 + 0.4 * flash);
        this.pitU.uDissolve.value = smooth(span(τ, CUE.pitBreak, CUE.fall)) * 1.02;
        this.alarmLight.intensity = 2.5 * this.pitU.uAlarm.value;
        const gone = 1 - smooth(span(τ, CUE.pitBreak, CUE.pitBreak + 1));
        this.hudRings.forEach((m, i) => {
            m.rotation.set(Math.PI / 2 + Math.sin(τ * 0.3 + i) * 0.4, τ * (0.3 + i * 0.25) * (i % 2 ? 1 : -1), 0);
            m.material.opacity = 0.6 * gone;
        });
        this.panels.forEach((m) => {
            const i = m.userData.i;
            const a = τ * 0.22 + i * Math.PI * 2 / this.panels.length;
            const rad = 1.0 + 0.12 * Math.sin(τ * 0.5 + i);
            m.position.set(Math.sin(a) * rad, 1.1 + 0.35 * Math.sin(τ * 0.4 + i * 1.7), Math.cos(a) * rad);
            m.lookAt(0, 1.2, 0);
            m.rotateZ(0.25 * Math.sin(τ * 0.6 + i));
            m.material.opacity = 0.9 * gone;
        });
        // The memories drift past her face while the spear is drawn.
        const mem = window4(τ, CUE.spear + 0.6, CUE.helixDone, CUE.release, CUE.release + 0.6);
        this.memoryHolos.forEach((m, i) => {
            const a = τ * 0.5 + i * Math.PI * 2 / this.memoryHolos.length;
            m.position.set(Math.sin(a) * 0.7, 1.25 + Math.sin(τ + i) * 0.2, Math.cos(a) * 0.7);
            m.lookAt(0, 1.3, 0);
            m.material.opacity = 0.8 * mem;
        });
        const r = rng(0xb0bb);
        this.bubbles.begin();
        for (let i = 0; i < 260; i++) {
            const r = pr(0xb0bb, i);
            const x = (r() - 0.5) * 2.4, z = (r() - 0.5) * 4, sp = 0.15 + r() * 0.3, ph = r() * 3;
            const y = ((τ * sp + ph) % 3) - 0.4;
            this.bubbles.put(x + Math.sin(τ * 2 + i) * 0.03, y, z, 0.015 + r() * 0.03, 0.5 * gone, 1, 0.85, 0.6);
        }
        this.bubbles.end();
        // Tears do not fall in the liquid: they lift away from her.
        this.tears.begin();
        const cry = window4(τ, CUE.helixDone, CUE.helixDone + 0.3, CUE.release + 1, CUE.release + 3);
        if (cry > 0) {
            for (let i = 0; i < 60; i++) {
                const r = pr(0xb0bc, i);
                const born = CUE.helixDone + r() * 3;
                const age = τ - born;
                const side = i % 2 ? 1 : -1;
                if (age < 0 || age > 2.5) continue;
                this.tears.put(this.pilotHead.x + side * 0.035 + (r() - 0.5) * 0.04 * age,
                    this.pilotHead.y + 0.02 + 0.06 * age, this.pilotHead.z + 0.09 + 0.05 * age,
                    0.012 + r() * 0.01, cry * (1 - age / 2.5), 0.85, 0.95, 1);
            }
        }
        this.tears.end();
    };

    // Daybreak. As she falls the sun comes up over Europe, and the last shot
    // is the first morning of 2001 from orbit.
    MovieStage.prototype._poseDawn = function (τ) {
        if (!this._sunBase) {
            this._sunBase = this.sunDir.clone();
            this._sunDawn = new THREE.Vector3(-0.55, 0.62, 0.55).normalize();
            this.sunLight = null;
            this.main.children.forEach((o) => { if (o.isDirectionalLight) this.sunLight = o; });
            this.sunDisc = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
                map: this._glowTex, color: 0xfff0d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
            })));
            this.main.add(this.sunDisc);
            this.atmosU = null;
            this.main.children.forEach((o) => { if (o.material && o.material.uniforms && o.material.uniforms.uColor && o.material.side === THREE.BackSide) this.atmosU = o.material.uniforms; });
        }
        const dawn = smooth(span(τ, CUE.fall, CUE.flash + 1.5));
        this.sunDir.copy(this._sunBase).lerp(this._sunDawn, dawn).normalize();
        if (this.sunLight) {
            this.sunLight.position.copy(this.sunDir).multiplyScalar(10000);
            this.sunLight.color.setHex(0xfff4e0).lerp(this._dawnColor || (this._dawnColor = new THREE.Color(1, 0.72, 0.45)), dawn * (1 - dawn) * 2);
        }
        if (this.atmosU) this.atmosU.uColor.value.setHex(0x5aa8ff).lerp(new THREE.Color(0xffa860), dawn * 0.7);
        this.sunDisc.visible = dawn > 0.01;
        this.sunDisc.position.copy(this.sunDir).multiplyScalar(30000);
        this.sunDisc.scale.setScalar(5200 * (0.6 + 0.4 * dawn));
        this.sunDisc.material.opacity = dawn;
    };

    MovieStage.prototype._poseReentry = function (τ, falling) {
        this.reentry.begin();
        if (falling) {
            const p = this.pilotFall.position;
            const r = rng(0x4e3e);
            for (let i = 0; i < 500; i++) {
                const r = pr(0x4e3e, i);
                const ph = r(), sp = 0.8 + r() * 1.5;
                const age = (τ * sp + ph) % 1;
                const a = r() * Math.PI * 2, d = 0.3 + r() * 1.4 * age;
                const gold = i % 3 === 0;
                this.reentry.put(p.x + Math.cos(a) * d, p.y + age * (gold ? 6 : 14), p.z + Math.sin(a) * d,
                    gold ? 0.25 : 0.4 + age * 0.8, (1 - age) * (gold ? 1 : 0.6), 1, gold ? 0.85 : 0.5, gold ? 0.4 : 0.15);
            }
        }
        this.reentry.end();
    };

    //--- out through the solar system ----------------------------------------

    // The spear does not stop in him. It goes on out: past Jupiter, through a
    // trail of rocks it turns to dust, and into Saturn, through the rings and
    // into the planet, where it goes off the size of the Earth. A scene of its
    // own, with its own scale: the spear covers it in two and a half seconds.
    const DEEP_V = 24000;               // spear speed, units a second
    const RJ = 2800, RS = 2400;         // Jupiter, Saturn
    const JUP_AT = [5600, -900, DEEP_V * (CUE.jupiter - CUE.deep)];
    const SAT_TILT = 26.7 * Math.PI / 180;
    const SAT_AT = [0, -0.8 * RS, DEEP_V * (CUE.saturnHit - CUE.deep) + 0.6 * RS];

    function ringCanvas() {
        return canvasOf(512, 8, (ctx, w, h) => {
            const r = rng(0x5a7);
            for (let x = 0; x < w; x++) {
                const u = x / w;
                const cassini = u > 0.58 && u < 0.64;
                const a = cassini ? 0.05 : (0.35 + 0.5 * r()) * (0.6 + 0.4 * Math.sin(u * 40));
                const c = 190 + Math.floor(r() * 50);
                ctx.fillStyle = "rgba(" + c + "," + (c - 18) + "," + (c - 50) + "," + a.toFixed(3) + ")";
                ctx.fillRect(x, 0, 1, h);
            }
        });
    }

    MovieStage.prototype._buildDeep = function (tex) {
        const d = this.deep;
        d.add(new THREE.AmbientLight(0x303848, 0.5));
        const sun = new THREE.DirectionalLight(0xfff2dd, 1.3);
        sun.position.set(-0.4, 0.3, -1).multiplyScalar(1000);
        d.add(sun);
        const stars = new Spray(this, 3000, true);
        const r = rng(0xdee9);
        stars.begin();
        for (let i = 0; i < 3000; i++) {
            const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
            stars.put(q * Math.cos(a) * 250000, u * 250000, q * Math.sin(a) * 250000 + 30000, 400 + r() * 900, 0.4 + r() * 0.6, 1, 0.95, 0.9);
        }
        stars.end();
        d.add(stars.points);
        // Jupiter, painted the way the rocket launch paints it.
        let jupMap = null;
        const RL = window.RocketLaunch && window.RocketLaunch.Stage;
        if (RL && RL.prototype && typeof RL.prototype._paintJupiter === "function") {
            try {
                jupMap = RL.prototype._paintJupiter.call({
                    _tex: (w, h, draw) => this._own(new THREE.CanvasTexture(canvasOf(w, h, draw)))
                });
            } catch (e) { jupMap = null; }
        }
        jupMap = jupMap || tex.jupiter || null;
        this.jupiter = new THREE.Mesh(this._own(new THREE.SphereGeometry(RJ, 64, 48)), this._own(new THREE.MeshPhongMaterial({
            map: jupMap, color: jupMap ? 0xffffff : 0xc89a6a, shininess: 6, specular: 0x241c14, emissive: 0x2a2018, emissiveMap: jupMap
        })));
        this.jupiter.position.set(JUP_AT[0], JUP_AT[1], JUP_AT[2]);
        this.jupiter.rotation.z = 0.05;
        d.add(this.jupiter);
        // The scar the spear's wake tears in his cloud tops.
        this.jupScar = new THREE.Sprite(this._own(new THREE.SpriteMaterial({
            map: this._glowTex, color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
        })));
        this.jupScar.position.set(JUP_AT[0] - RJ * 0.98, JUP_AT[1] + 300, JUP_AT[2]);
        d.add(this.jupScar);
        // Rocks along the way, each blown apart as it goes by.
        this.rocks = [];
        const rockGeo = this._own(new THREE.IcosahedronGeometry(1, 1));
        const rockMat = this._own(new THREE.MeshStandardMaterial({ color: 0x7a7066, roughness: 1, flatShading: true }));
        for (let i = 0; i < 36; i++) {
            const z = 4000 + r() * (SAT_AT[2] - 12000);
            const a = r() * Math.PI * 2, off = 120 + r() * 600;
            const m = new THREE.Mesh(rockGeo, rockMat);
            m.position.set(Math.cos(a) * off, Math.sin(a) * off, z);
            m.scale.set(30 + r() * 90, 25 + r() * 70, 30 + r() * 80);
            m.userData.at = CUE.deep + z / DEEP_V;
            d.add(m);
            this.rocks.push(m);
        }
        this.deepDust = new Spray(this, 2600, true);
        d.add(this.deepDust.points);
        // Saturn, tilted on its axis, rings and all.
        const sat = new THREE.Group();
        sat.position.set(SAT_AT[0], SAT_AT[1], SAT_AT[2]);
        sat.rotation.x = SAT_TILT;
        const body = new THREE.Mesh(this._own(new THREE.SphereGeometry(RS, 64, 48)), this._own(new THREE.MeshPhongMaterial({
            map: tex.saturn || null, color: tex.saturn ? 0xffffff : 0xe0c890, shininess: 4, emissive: 0x241e14, emissiveMap: tex.saturn || null
        })));
        body.scale.y = 0.9;
        sat.add(body);
        const ringGeo = this._own(new THREE.RingGeometry(RS * 1.25, RS * 2.3, 160, 1));
        // The ring's texture runs across its width.
        const uv = ringGeo.attributes.uv, pos = ringGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const rr = Math.hypot(pos.getX(i), pos.getY(i));
            uv.setXY(i, (rr - RS * 1.25) / (RS * 1.05), 0.5);
        }
        const ring = new THREE.Mesh(ringGeo, this._own(new THREE.MeshBasicMaterial({
            map: this._own(new THREE.CanvasTexture(ringCanvas())), transparent: true, side: THREE.DoubleSide, depthWrite: false
        })));
        ring.rotation.x = -Math.PI / 2;
        sat.add(ring);
        d.add(sat);
        this.saturn = { group: sat, body, ring };
        // The ring as grains, for the part the spear tears through.
        this.ringGrains = new Spray(this, 5000, false);
        d.add(this.ringGrains.points);
        this._grains = [];
        for (let i = 0; i < 5000; i++) this._grains.push([RS * (1.25 + r() * 1.05), r() * Math.PI * 2, r(), r(), r()]);
        // Where the spear crosses the ring plane, and where it hits.
        sat.updateMatrixWorld(true);
        const n = new THREE.Vector3(0, 1, 0).applyQuaternion(sat.quaternion);
        const c = sat.position;
        this.ringCross = new THREE.Vector3(0, 0, c.dot(n) / n.z);
        const zHit = c.z - Math.sqrt(Math.max(0, RS * RS - c.y * c.y));
        this.saturnHitPoint = new THREE.Vector3(0, 0, zHit);
        try {
            const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, -1000), new THREE.Vector3(0, 0, 1));
            const hit = ray.intersectObject(body, false)[0];
            if (hit) this.saturnHitPoint.copy(hit.point);
        } catch (e) { /* the sphere's answer stands */ }
        this.ringNormal = n;
        // The blast: the size of the Earth, gold, collapsing into a black hole.
        const own = (x) => this._own(x);
        const ballGeo = own(new THREE.SphereGeometry(1, 32, 24));
        const add = (m) => { m.visible = false; d.add(m); return m; };
        const glowMat = (color) => own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.satBlast = {
            ball: add(new THREE.Mesh(ballGeo, glowMat(0xffb020))),
            heart: add(new THREE.Mesh(ballGeo, glowMat(0xfff4d8))),
            ring: add(new THREE.Mesh(own(new THREE.RingGeometry(0.85, 1, 64, 1)), own(new THREE.MeshBasicMaterial({
                color: 0xffe6a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
            })))),
            hole: add(new THREE.Mesh(ballGeo, own(new THREE.ShaderMaterial({
                transparent: true, depthWrite: false,
                uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uRim: { value: new THREE.Color(0xffc840) }, uPush: { value: 0 } },
                vertexShader: FRESNEL_VERT, fragmentShader: HOLE_FRAG
            })))),
            flare: add(new THREE.Sprite(own(new THREE.SpriteMaterial({
                map: this._glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
            }))))
        };
        this.satWave = new Spray(this, 1200, true);
        d.add(this.satWave.points);
        this.deepTrail = new Spray(this, 900, true);
        d.add(this.deepTrail.points);
    };

    MovieStage.prototype._deepSpearAt = function (τ, out) {
        const z = Math.min(DEEP_V * (τ - CUE.deep), this.saturnHitPoint.z);
        return out.set(0, 0, z);
    };

    MovieStage.prototype._poseDeep = function (τ, active) {
        if (!this.saturn) return;
        const s = this.spear;
        // The spear lives where the shot is.
        const holder = active ? this.deep : this.main;
        if (s.group.parent !== holder) holder.add(s.group);
        if (!active) return;
        s.group.visible = τ < CUE.saturnHit + 0.05;
        this._deepSpearAt(τ, s.group.position);
        s.group.quaternion.identity();
        s.inner.scale.set(0.5, 0.5, 1.2);
        s.tip.visible = true;
        s.tip.scale.setScalar(1);
        this._shapeHelix(s, 1, 1, 1);
        s.inner.rotation.z = τ * 4;
        const sp = s.group.position;
        const r = rng(0xdee9a);
        // The wake.
        this.deepTrail.begin();
        for (let i = 0; i < 900; i++) {
            const r = pr(0xdee9a, i);
            const back = r() * 9000, age = back / DEEP_V;
            if (sp.z - back < 0) continue;
            const blue = r() > 0.5;
            this.deepTrail.put((r() - 0.5) * 80 * (1 + age * 8), (r() - 0.5) * 80 * (1 + age * 8), sp.z - back,
                30 + r() * 50, (1 - back / 9000) * 0.9, blue ? 0.3 : 1, blue ? 0.45 : 0.85, blue ? 1 : 0.4);
        }
        this.deepTrail.end();
        // Jupiter's cloud tops, torn as it passes.
        const scar = smooth(span(τ, CUE.jupiter - 0.1, CUE.jupiter + 0.3));
        this.jupScar.scale.set(RJ * 1.6 * scar, RJ * 0.5 * scar, 1);
        this.jupScar.material.opacity = scar * 0.9;
        this.jupiter.rotation.y = τ * 0.05;
        // The rocks it passes, blown to grit.
        this.deepDust.begin();
        this.rocks.forEach((m, i) => {
            const age = τ - m.userData.at;
            m.visible = age < 0;
            if (age < 0 || age > 2) return;
            for (let k = 0; k < 70; k++) {
                const r = pr(0xdee9b + i * 977, k);
                const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u), v = 400 + r() * 1400;
                this.deepDust.put(m.position.x + q * Math.cos(a) * v * age, m.position.y + u * v * age, m.position.z + q * Math.sin(a) * v * age,
                    20 + r() * 40, (1 - age / 2) * (k % 4 ? 0.7 : 1), 1, k % 4 ? 0.7 : 1, k % 4 ? 0.35 : 0.9);
            }
        });
        this.deepDust.end();
        // The rings: whole, then torn where it went through, the tear running
        // outward through them as a wave.
        const cross = CUE.saturnHit - (this.saturnHitPoint.z - this.ringCross.z) / DEEP_V;
        const cAge = τ - cross;
        this.saturn.ring.material.opacity = cAge > 0 ? lerp(1, 0.45, smooth(cAge * 2)) : 1;
        const g = this.saturn.group;
        const local = this._t.a.copy(this.ringCross);
        g.worldToLocal(local);
        this.ringGrains.begin();
        this._grains.forEach(([rad, ang, j1, j2, j3]) => {
            const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
            let px = x, py = (j1 - 0.5) * 30, pz = z;
            if (cAge > 0) {
                const dx = x - local.x, dz = z - local.z;
                const dist = Math.hypot(dx, dz) || 1;
                const push = 2600 * Math.exp(-dist / 900) * Math.min(1, cAge * 3);
                px += dx / dist * push * cAge;
                pz += dz / dist * push * cAge;
                py += (j2 - 0.5) * 3000 * Math.exp(-dist / 900) * cAge;
                py += 220 * Math.sin(dist * 0.004 - cAge * 9) * Math.exp(-dist / 3500) * Math.min(1, cAge * 2);
            }
            const p = this._t.b.set(px, py, pz).applyMatrix4(g.matrixWorld);
            this.ringGrains.put(p.x, p.y, p.z, 26 + j3 * 30, 0.55, 0.85, 0.78, 0.62);
        });
        this.ringGrains.end();
        // The blast, and the shock running round the planet.
        const b = this.satBlast;
        const a = τ - CUE.saturnHit;
        const H = this.saturnHitPoint;
        [b.ball, b.heart, b.ring, b.hole, b.flare].forEach((m) => { m.visible = false; });
        this.satWave.begin();
        if (a >= 0) {
            const E = RS * 0.11;
            const grow = 1 - Math.exp(-a * 3);
            b.ball.visible = b.heart.visible = b.flare.visible = true;
            b.ball.position.copy(H);
            b.ball.scale.setScalar(E * 2.6 * grow);
            b.ball.material.opacity = 0.75 * (1 - smooth(span(a, 0.6, 1.6)));
            b.heart.position.copy(H);
            b.heart.scale.setScalar(E * 1.2 * grow);
            b.heart.material.opacity = 1 - smooth(span(a, 0.4, 1.2));
            b.flare.position.copy(H);
            b.flare.scale.setScalar(E * 14 * grow);
            b.flare.material.opacity = 1 - smooth(span(a, 0.2, 1.4));
            b.ring.visible = true;
            b.ring.position.copy(H);
            b.ring.lookAt(this.saturn.group.position);
            b.ring.scale.setScalar(E * (1 + 9 * a));
            b.ring.material.opacity = Math.max(0, 1 - a / 1.6);
            const holeR = E * 1.4 * smooth(span(a, 0.7, 1.0)) * (1 - smooth(span(a, 1.2, 2.2)));
            b.hole.visible = holeR > 1;
            b.hole.position.copy(H);
            b.hole.scale.setScalar(Math.max(0.01, holeR));
            b.hole.material.uniforms.uOpacity.value = 1;
            b.hole.material.uniforms.uTime.value = τ;
            // Fire running out across the cloud tops in a ring.
            const c = this.saturn.group.position;
            const nrm = this._t.c.copy(H).sub(c).normalize();
            const t1 = this._t.d.set(1, 0, 0).cross(nrm).normalize();
            const t2 = this._t.e.copy(nrm).cross(t1).normalize();
            const theta = Math.min(1.2, a * 0.7);
            for (let i = 0; i < 1200; i++) {
                const r = pr(0xdee9c, i);
                const phi = i / 1200 * Math.PI * 2 + r() * 0.01;
                const th = theta * (0.92 + 0.08 * r());
                const dirX = nrm.x * Math.cos(th) + (t1.x * Math.cos(phi) + t2.x * Math.sin(phi)) * Math.sin(th);
                const dirY = nrm.y * Math.cos(th) + (t1.y * Math.cos(phi) + t2.y * Math.sin(phi)) * Math.sin(th);
                const dirZ = nrm.z * Math.cos(th) + (t1.z * Math.cos(phi) + t2.z * Math.sin(phi)) * Math.sin(th);
                const rr = RS * 1.01;
                this.satWave.put(c.x + dirX * rr, c.y + dirY * rr * 0.9, c.z + dirZ * rr, 60 + r() * 80,
                    (1 - a / 3.5) * 0.9, 1, 0.6 + r() * 0.3, 0.2);
            }
        }
        this.satWave.end();
    };

    Object.assign(MovieStage.prototype, {
        _cam_spearCruise(u, τ, cam) {
            const p = this.spear.group.position;
            this._look(cam, at(p).add(this._t.a.set(-160, 95, -lerp(560, 700, u))), at(p).add(this._t.b.set(0, 0, 3000)), 58, 5);
        },
        _cam_saturnApproach(u, τ, cam) {
            const c = this.ringCross;
            this._look(cam, at(c).add(this._t.a.set(lerp(2600, 2300, u), 700, 1600)), at(c).lerp(this.saturnHitPoint, 0.5).add(this._t.b.set(0, 0, -800 * (1 - u))), 55, 5);
        },
        _cam_saturnBlast(u, τ, cam) {
            const c = this.saturn.group.position;
            this._look(cam, at(c).add(this._t.a.set(lerp(11000, 12000, u), 3200, -4200)), at(c).lerp(this.saturnHitPoint, 0.4), 45, 5);
        }
    });

    //--- one frame -----------------------------------------------------------

    MovieStage.prototype._world = function (τ, shot, dt) {
        // The Earth turns under all of it, slowly.
        this._spinQ.setFromAxisAngle(this._t.a.set(0, 1, 0), -0.004 * τ);
        this.earth.quaternion.copy(this._spinQ).multiply(this._earthBase);
        this._poseTower(τ);
        this._poseKessler(τ);
        this._poseArc(τ);
        this._poseGiant(τ, dt);
        this.giantPivot.updateMatrixWorld(true);
        this.giantRoot.getWorldPosition(this.C);
        this.up.set(0, 1, 0).applyQuaternion(this.giantPivot.quaternion);
        this.front.set(0, 0, 1).applyQuaternion(this.giantPivot.quaternion);
        this.side.set(1, 0, 0).applyQuaternion(this.giantPivot.quaternion);
        this._poseGod(τ);
        this._poseTear(τ);
        this._poseBeams(τ);
        this._poseFireball(τ);
        this._poseArsenal(τ);
        const where = shot.scene === "henge" ? "altar" : shot.fall ? "fall" : "pit";
        this._posePilot(τ, where, dt);
        this._poseSpear(τ);
        this._poseWard(τ);
        this._poseMoon(τ);
        this._poseShards(τ);
        this._poseDeep(τ, shot.scene === "deep");
        if (shot.scene === "henge") this._poseHenge(τ);
        this._poseCockpit(τ);
        this._poseReentry(τ, where === "fall");
        this._poseDawn(τ, where === "fall");
    };

    // After the camera is placed: what has to face it.
    MovieStage.prototype._facing = function (τ, cam) {
        this.god.eye.quaternion.copy(cam.quaternion);
        this._poseWounds(τ, cam);
        this._poseBlasts(τ, cam);
        this._poseCorpse(τ, cam);
        // The city lights know which side of the line the sun is on.
        this.earthU.uSunView.value.copy(this.sunDir).transformDirection(cam.matrixWorldInverse);
        // The dice lands with its face square to whoever is watching.
        const d = this.dice;
        if (d && d.group.visible) {
            const land = smooth(span(τ, CUE.diceLand - 0.6, CUE.diceLand));
            const face = new THREE.Quaternion().copy(cam.quaternion).multiply(d.land);
            d.group.quaternion.copy(d.q).slerp(face, land);
        }
        const k = this.h / (2 * Math.tan(cam.fov * Math.PI / 360));
        this._sprays.forEach((s) => { s.mat.uniforms.uScale.value = k; });
    };

    MovieStage.prototype.render = function (t, dt) {
        const shot = shotAt(t);
        const r = this.renderer;
        r.clear();
        if (!this.ready || shot.scene === "black") return;
        const τ = worldTime(t);
        const u = clamp01((t - shot.from) / (shot.to - shot.from));
        this._world(τ, shot, dt);
        const scene = { cockpit: this.pit, henge: this.henge, deep: this.deep }[shot.scene] || this.main;
        const cam = { cockpit: this.pitCamera, henge: this.hengeCamera, deep: this.deepCamera }[shot.scene] || this.camera;
        scene.updateMatrixWorld(true);
        const fn = this["_cam_" + shot.cam];
        if (typeof fn === "function") fn.call(this, u, τ, cam, shot);
        // God's blows shake the frame.
        const small = shot.scene === "cockpit" || shot.scene === "henge";
        const shake = (shot.scene === "henge" ? 0 : hitShake(τ)) * (small ? 0.035 : 7);
        if (shake > 0.0005) {
            cam.position.x += Math.sin(t * 61) * shake;
            cam.position.y += Math.sin(t * 47 + 1) * shake;
            cam.updateMatrixWorld(true);
        }
        this._facing(τ, cam);
        withMoviePSX((S) => (S ? S.render(r, scene, cam) : r.render(scene, cam)));
    };

    //--- the cameras ---------------------------------------------------------

    MovieStage.prototype._look = function (cam, pos, target, fov, near) {
        cam.position.copy(pos);
        // Only the main scene tilts with the giant's footing on the curve.
        if (cam === this.camera) cam.up.copy(this.up);
        else cam.up.set(0, 1, 0);
        cam.lookAt(target);
        cam.fov = fov;
        cam.near = near || (cam === this.pitCamera ? 0.03 : cam === this.hengeCamera ? 0.05 : cam === this.deepCamera ? 5 : 2);
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);
    };
    function at(base) { return base.clone(); }

    Object.assign(MovieStage.prototype, {
        _cam_moonPass(u, τ, cam) {
            const m = this.moonPos;
            const out = at(m).normalize();
            const pos = at(m).addScaledVector(out, MOON_R + 220).add(this._t.a.set(lerp(-320, 320, u), lerp(90, -30, u), 0));
            const target = at(m).lerp(this._t.b.set(0, R * 0.7, 0), 0.25 + 0.6 * u);
            this._look(cam, pos, target, 50);
        },
        _cam_europe(u, τ, cam) {
            this._look(cam, this._t.a.set(lerp(520, 260, u), R + lerp(1500, 900, u), lerp(2600, 1700, u)),
                this._t.b.set(0, R + lerp(100, 200, u), 0), 40);
        },
        _cam_emerge(u, τ, cam) {
            const ang = lerp(0.6, 1.0, u);
            const rise = smooth(span(τ, CUE.rise, CUE.stand));
            this._look(cam, this._t.a.set(Math.sin(ang) * 1500, R + 300, Math.cos(ang) * 1500),
                at(this.C).addScaledVector(this.up, GIANT_H * (0.15 + 0.4 * rise)), 42);
        },
        _cam_groundUp(u, τ, cam) {
            const pos = at(this.C).addScaledVector(this.front, 300).addScaledVector(this.side, lerp(70, 40, u));
            pos.setLength(R + 5);
            this._look(cam, pos, at(this.C).addScaledVector(this.up, GIANT_H * lerp(0.55, 0.8, u)), 72, 1);
        },
        _cam_face(u, τ, cam) {
            const head = this._boneAt("head", new THREE.Vector3());
            this._look(cam, at(head).addScaledVector(this.front, lerp(140, 85, u)).addScaledVector(this.up, lerp(14, 2, u)), head, 30);
        },
        // From the ground: low, ahead of her, tilting up from her body to her
        // face as she goes over.
        _cam_crowdUp(u, τ, cam) {
            const pos = at(this.C).addScaledVector(this.front, lerp(340, 300, u)).addScaledVector(this.side, -110);
            pos.setLength(R + 2);
            const head = this._boneAt("head", new THREE.Vector3());
            this._look(cam, pos, at(this.C).addScaledVector(this.up, GIANT_H * 0.35).lerp(head, smooth(u)), 74, 1);
        },
        _cam_standWide(u, τ, cam) {
            this._look(cam, at(this.C).addScaledVector(this.front, 1600).addScaledVector(this.side, lerp(950, 700, u)).addScaledVector(this.up, 380),
                at(this.C).addScaledVector(this.up, GIANT_H * 0.55), 45);
        },
        _cam_pitWide(u, τ, cam) {
            this._look(cam, this._t.a.set(0.1, lerp(1.3, 1.22, u), lerp(2.1, 1.7, u)), at(this.pilotHead).add(this._t.b.set(0, -0.3, 0)), 55);
        },
        _cam_pitFace(u, τ, cam) {
            this._look(cam, at(this.pilotHead).add(this._t.a.set(0.05, 0.02, lerp(0.58, 0.42, u))), this.pilotHead, 35);
        },
        _cam_pitAlarm(u, τ, cam) {
            this._look(cam, at(this.pilotHead).add(this._t.a.set(lerp(0.65, 0.55, u), 0.15, 0.9)), this.pilotHead, 45);
        },
        _cam_pitTears(u, τ, cam) {
            this._look(cam, at(this.pilotHead).add(this._t.a.set(-0.25, 0.02, lerp(0.5, 0.4, u))), this.pilotHead, 32);
        },
        _cam_pitBreak(u, τ, cam) {
            this._look(cam, this._t.a.set(0, lerp(1.4, 2.6, u), lerp(2.4, 3.4, u)), at(this.pilotHead).add(this._t.b.set(0, -0.2, 0)), 60);
        },
        _cam_overShoulder(u, τ, cam) {
            const head = this._boneAt("head", new THREE.Vector3());
            this._look(cam, at(head).addScaledVector(this.front, -170).addScaledVector(this.side, -80).addScaledVector(this.up, 45),
                this._t.b.set(GOD_AT[0], GOD_AT[1], GOD_AT[2]), lerp(55, 48, u));
        },
        _godToGiant() {
            return at(this.C).addScaledVector(this.up, 300).sub(this.G).normalize();
        },
        _cam_godReveal(u, τ, cam) {
            const d = this._godToGiant();
            this._look(cam, at(this.G).addScaledVector(d, lerp(2200, 1750, u)).addScaledVector(this.side, 420).addScaledVector(this.up, 100), this.G, 45);
        },
        _cam_godEye(u, τ, cam) {
            const d = this._godToGiant();
            this._look(cam, at(this.G).addScaledVector(d, lerp(1150, 820, u)), this.G, 38);
        },
        _cam_standoff(u, τ, cam) {
            const mid = at(this.C).addScaledVector(this.up, 250).lerp(this.G, 0.5);
            const dist = this.G.distanceTo(this.C);
            this._look(cam, at(mid).addScaledVector(this.side, dist * lerp(0.95, 0.85, u)).addScaledVector(this.up, -200), mid, 50);
        },
        _cam_rayWide(u, τ, cam) {
            this._look(cam, at(this.C).addScaledVector(this.side, -900).addScaledVector(this.front, lerp(500, 420, u)).addScaledVector(this.up, 350),
                at(this.C).addScaledVector(this.up, GIANT_H * 0.65), 45);
        },
        _cam_rayReplay(u, τ, cam) {
            const b = this._boneAt("lUpperArm", new THREE.Vector3());
            this._look(cam, at(b).addScaledVector(this.side, -lerp(170, 140, u)).addScaledVector(this.front, 90).addScaledVector(this.up, 30), b, 40);
        },
        _cam_judgment(u, τ, cam) {
            const c = this._boneAt("upperChest", new THREE.Vector3());
            this._look(cam, at(this.C).addScaledVector(this.front, 520).addScaledVector(this.side, lerp(300, 220, u)).addScaledVector(this.up, 120),
                at(c).addScaledVector(this.up, 60), 55);
        },
        _cam_pillars(u, τ, cam) {
            const ang = lerp(-0.7, 0.25, u);
            this._look(cam, at(this.C).addScaledVector(this.side, Math.sin(ang) * 1300).addScaledVector(this.front, Math.cos(ang) * 1300).addScaledVector(this.up, 520),
                at(this.C).addScaledVector(this.up, GIANT_H * 0.5), 50);
        },
        _cam_annihilationWide(u, τ, cam) {
            const d = this._godToGiant();
            this._look(cam, at(this.G).addScaledVector(d, -650).addScaledVector(this.up, 260).addScaledVector(this.side, 220),
                at(this.C).addScaledVector(this.up, GIANT_H * 0.6), 35);
        },
        _cam_bleedFace(u, τ, cam) {
            const head = this._boneAt("head", new THREE.Vector3());
            this._look(cam, at(head).addScaledVector(this.front, lerp(100, 85, u)).addScaledVector(this.side, 38), head, 32);
        },
        _cam_palm(u, τ, cam) {
            const h = this._boneAt("lHand", new THREE.Vector3());
            this._look(cam, at(h).addScaledVector(this.side, -lerp(170, 140, u)).addScaledVector(this.front, 40).addScaledVector(this.up, 50), this.fbPos, 42);
        },
        _cam_fireChase(u, τ, cam) {
            this._look(cam, at(this.fbPos).addScaledVector(this.fbDir, -lerp(280, 340, u)).addScaledVector(this.up, 70).addScaledVector(this.side, 40),
                at(this.fbPos).addScaledVector(this.fbDir, 400), 55);
        },
        _cam_fireBurst(u, τ, cam) {
            const d = this._godToGiant();
            this._look(cam, at(this.G).addScaledVector(this.side, lerp(2400, 2200, u)).addScaledVector(this.up, 600).addScaledVector(d, 900), this.G, 45);
        },
        _cam_chest(u, τ, cam) {
            const c = this._boneAt("upperChest", new THREE.Vector3());
            this._look(cam, at(c).addScaledVector(this.front, lerp(200, 150, u)).addScaledVector(this.side, 55).addScaledVector(this.up, 20),
                at(c).addScaledVector(this.front, 40), 42);
        },
        _cam_memories(u, τ, cam) {
            this._look(cam, at(this.spearPos).addScaledVector(this.side, 70).addScaledVector(this.up, 25).addScaledVector(this.spearDir, lerp(-90, 60, u)),
                at(this.spearPos).addScaledVector(this.spearDir, lerp(-40, 110, u)), 45);
        },
        _cam_throwWide(u, τ, cam) {
            this._look(cam, at(this.C).addScaledVector(this.side, 1500).addScaledVector(this.up, 450).addScaledVector(this.front, 200),
                at(this.C).addScaledVector(this.up, GIANT_H * 0.7).addScaledVector(this.front, lerp(0, 700, u)), 45);
        },
        _cam_throwLow(u, τ, cam) {
            const h = this._boneAt("rHand", new THREE.Vector3());
            const pos = at(this.C).addScaledVector(this.front, 330).addScaledVector(this.side, -lerp(140, 100, u));
            pos.setLength(R + 30);
            this._look(cam, pos, h, 62);
        },
        _cam_spearPov(u, τ, cam) {
            this._look(cam, at(this.spearPos).addScaledVector(this.spearDir, -140).addScaledVector(this.up, 30).addScaledVector(this.side, 24),
                at(this.spearPos).addScaledVector(this.spearDir, 600), 60, 1);
        },
        _cam_approach(u, τ, cam) {
            const d = this._godToGiant();
            this._look(cam, at(this.G).addScaledVector(d, 950).addScaledVector(this.side, 240).addScaledVector(this.up, 130), this.spearPos, 50);
        },
        _cam_eyeHold(u, τ, cam) {
            const d = this._godToGiant();
            this._look(cam, at(this.G).addScaledVector(d, lerp(300, 240, u)).addScaledVector(this.side, 230), at(this.G).addScaledVector(d, 60), 42);
        },
        _cam_impactWide(u, τ, cam) {
            const d = this._godToGiant();
            this._look(cam, at(this.G).addScaledVector(this.side, lerp(3300, 3800, u)).addScaledVector(this.up, 1200).addScaledVector(d, 1600), this.G, 55);
        },
        _cam_groundSky(u, τ, cam) {
            const pos = at(this.C).addScaledVector(this.front, 520).addScaledVector(this.side, -60);
            pos.setLength(R + 6);
            this._look(cam, pos, this.G, 85, 1);
        },
        _cam_statue(u, τ, cam) {
            const ang = lerp(0.2, 0.9, u);
            this._look(cam, at(this.G).addScaledVector(this.side, Math.sin(ang) * 1000).addScaledVector(this.front, -Math.cos(ang) * 1000).addScaledVector(this.up, 220), this.G, 40);
        },
        _cam_corpseOrbit(u, τ, cam) {
            this._look(cam, this._t.a.set(lerp(4400, 4000, u), 2700, lerp(4200, 3900, u)), at(this.G).lerp(this._t.b.set(0, R * 0.6, 0), 0.5), 45);
        },
        _cam_shatter(u, τ, cam) {
            this._look(cam, at(this.C).addScaledVector(this.front, lerp(1600, 1800, u)).addScaledVector(this.side, 1000).addScaledVector(this.up, 420),
                at(this.C).addScaledVector(this.up, GIANT_H * 0.5), 45);
        },
        _cam_fallBelow(u, τ, cam) {
            const p = this.pilotFall.position;
            this._look(cam, at(p).add(this._t.a.set(1.7, -2.6, 1.5)), at(p).add(this._t.b.set(0, 0.5, 0)), 62, 0.05);
        },
        _cam_dawn(u, τ, cam) {
            // Low over Europe, looking along the curve into the sunrise.
            const top = this._t.c.set(0, R, 0);
            const flat = this._t.d.copy(this.sunDir).setY(0).normalize();
            this._look(cam, at(top).addScaledVector(flat, -lerp(900, 700, u)).add(this._t.e.set(0, lerp(420, 380, u), 0)),
                at(top).addScaledVector(flat, 3000).add(this._t.f.set(0, 240, 0)), 50);
        },
        _cam_fallAbove(u, τ, cam) {
            const p = this.pilotFall.position;
            this._look(cam, at(p).add(this._t.a.set(0.8, lerp(3.2, 6, u), -1.6)), at(p).add(this._t.b.set(0, -1.5, 0)), 60, 0.05);
        }
    });

    // The shots of the ritual, the light, the dice and the spear's birth.
    Object.assign(MovieStage.prototype, {
        _cam_hengeWide(u, τ, cam) {
            const a = lerp(0.5, 1.15, u);
            this._look(cam, this._t.a.set(Math.cos(a) * 42, lerp(16, 8, u), Math.sin(a) * 42), this._t.b.set(0, 2.2, -0.4), 45);
        },
        _cam_hengeAltar(u, τ, cam) {
            this._look(cam, this._t.a.set(lerp(4.6, 3.4, u), lerp(8.5, 5.6, u), lerp(3.4, 2.4, u)), this._t.b.set(0, ALTAR_TOP + 0.2, -0.5), 42);
        },
        _cam_stab(u, τ, cam, shot) {
            // Looking back up the line the blade comes down.
            const w = this.artifacts[(shot && shot.stab) || 0];
            const target = this._stabPoint(w.stab, new THREE.Vector3());
            const side = this._t.c.set(-w.dir.z, 0, w.dir.x).normalize();
            this._look(cam, at(target).addScaledVector(w.dir, -lerp(1.9, 1.5, u)).addScaledVector(side, 1.2).add(this._t.d.set(0, 0.5, 0)),
                at(target).add(this._t.e.set(0, 0.15, 0)), 50);
        },
        _cam_spitBlood(u, τ, cam) {
            this._look(cam, at(this.pilotHead).add(this._t.a.set(lerp(0.62, 0.48, u), 0.42, 0.22)), this.pilotHead, 34);
        },
        _cam_sealWide(u, τ, cam) {
            this._look(cam, this._t.a.set(0.5, lerp(20, 27, u), lerp(10, 5, u)), this._t.b.set(0, 0, -0.6), 52);
        },
        _cam_pillarDown(u, τ, cam) {
            this._look(cam, this._t.a.set(lerp(6.5, 5.2, u), 1.5, lerp(5.2, 4.4, u)), this._t.b.set(0, lerp(2.5, 6, u), -0.5), 55);
        },
        _cam_pillarUp(u, τ, cam) {
            this._look(cam, this._t.a.set(3.2, 0.9, 3.2), this._t.b.set(0, lerp(40, 160, u), -0.5), 78);
        },
        _cam_lightArc(u, τ, cam) {
            const mid = this.hengePoint.clone().lerp(this.tower.group.position, 0.5).normalize();
            this._look(cam, at(mid).multiplyScalar(R + lerp(3000, 2500, u)).add(this._t.a.set(lerp(-600, -200, u), 0, -900)),
                at(mid).multiplyScalar(R + 300), 45);
        },
        _cam_layersClose(u, τ, cam) {
            const c = this._boneAt("upperChest", new THREE.Vector3());
            this._look(cam, at(c).addScaledVector(this.front, lerp(260, 190, u)).addScaledVector(this.side, lerp(150, 90, u)).addScaledVector(this.up, -40),
                at(c).addScaledVector(this.up, -60), 44);
        },
        _cam_gunForm(u, τ, cam) {
            const h = this._boneAt("rHand", new THREE.Vector3());
            this._look(cam, at(h).addScaledVector(this.side, lerp(260, 200, u)).addScaledVector(this.front, 120).addScaledVector(this.up, 40), h, 42);
        },
        _cam_diceRoll(u, τ, cam) {
            const d = this.dice.group.position;
            const k = smooth(span(τ, CUE.diceLand - 0.4, CUE.diceLand + 0.3));
            this._look(cam, at(d).addScaledVector(this.front, lerp(420, 230, k)).addScaledVector(this.side, lerp(260, 40, k)).addScaledVector(this.up, lerp(120, 20, k)),
                d, lerp(48, 34, k));
        },
        _cam_formReveal(u, τ, cam) {
            const f = this.formModel ? this.formModel.position : this._boneAt("rHand", new THREE.Vector3());
            this._look(cam, at(f).addScaledVector(this.side, lerp(380, 300, u)).addScaledVector(this.front, 260).addScaledVector(this.up, 80),
                at(f).addScaledVector(this.front, 100), 46);
        },
        _cam_formAttack(u, τ, cam) {
            const mid = at(this.C).addScaledVector(this.up, GIANT_H * 0.6).lerp(this.G, 0.45);
            const dist = this.G.distanceTo(this.C);
            this._look(cam, at(mid).addScaledVector(this.side, dist * lerp(0.75, 0.62, u)).addScaledVector(this.up, 300), mid, 52);
        },
        _cam_formClose(u, τ, cam) {
            if (this.variant.kind === "fists") {
                // Riding the leap.
                const h = this._boneAt("head", new THREE.Vector3());
                this._look(cam, at(h).addScaledVector(this.side, 320).addScaledVector(this.front, -200).addScaledVector(this.up, 80), at(h).lerp(this.moonPos, 0.4), 55);
                return;
            }
            const src = this.formModel ? this.formModel.position : this._boneAt("rHand", new THREE.Vector3());
            this._look(cam, at(src).addScaledVector(this.front, -260).addScaledVector(this.side, 180).addScaledVector(this.up, 90), at(src).lerp(this.moonPos, 0.6), 55);
        },
        _cam_formImpact(u, τ, cam) {
            // The Moon took it: its face freshly cut, and him untouched beyond.
            const m = this.moonPos, n = this.strikeNormal;
            this._look(cam, at(m).addScaledVector(n, MOON_R * lerp(3.4, 3.0, u)).addScaledVector(this.side, MOON_R * 1.4).addScaledVector(this.up, MOON_R * 0.5),
                at(m).addScaledVector(n, MOON_R * 0.5), 42);
        },
        _cam_pitSpear(u, τ, cam) {
            this._look(cam, at(this.pilotHead).add(this._t.a.set(0.2, lerp(-0.25, -0.15, u), lerp(1.1, 0.9, u))),
                at(this.pilotHead).add(this._t.b.set(0, lerp(0.4, 1.0, u), 0)), 58);
        },
        _cam_headSpear(u, τ, cam) {
            const h = this._boneAt("head", new THREE.Vector3());
            this._look(cam, at(h).addScaledVector(this.front, lerp(520, 440, u)).addScaledVector(this.side, 160).addScaledVector(this.up, 40),
                at(h).addScaledVector(this.up, lerp(140, 260, u)), 50);
        }
    });

    MovieStage.prototype.dispose = function () {
        this._disposed = true;
        this._owned.forEach((x) => { try { x.dispose(); } catch (e) { /* already gone */ } });
        this._owned = [];
        [this.giantModel, this.pilotModel].forEach((root) => {
            if (!root) return;
            root.traverse((o) => {
                if (o.geometry) { try { o.geometry.dispose(); } catch (e) { /* shared */ } }
                const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
                mats.forEach((m) => {
                    Object.keys(m).forEach((k) => { if (m[k] && m[k].isTexture) { try { m[k].dispose(); } catch (e) { /* shared */ } } });
                    try { m.dispose(); } catch (e) { /* shared */ }
                });
            });
        });
        try { if (window.SnapVertexShader) window.SnapVertexShader.disposeContext(this.renderer); } catch (e) { /* gone */ }
        try { this.renderer.dispose(); } catch (e) { /* lost */ }
        try { this.renderer.forceContextLoss(); } catch (e) { /* lost */ }
    };

    //=========================================================================
    // What is laid over the picture at t
    //=========================================================================
    // The card, the attack label, the flashes and the logo, each with how
    // much of it shows.
    function overlayState(t, labels) {
        const card = CARDS.find((c) => t >= c.from && t < c.to) || null;
        let label = null;
        (labels || LABELS).forEach((l, i, all) => {
            const next = all[i + 1];
            const until = Math.min(l.at + LABEL_HOLD, next ? next.at : Infinity);
            if (t >= l.at && t < until) label = Object.assign({ until }, l);
        });
        const τ = worldTime(t);
        const white = Math.max(
            decay(τ, CUE.impact, 1.3), decay(τ, CUE.fireballHit, 3) * 0.6, decay(τ, CUE.gold, 3) * 0.3,
            decay(t, CUE.tear, 2.5) * 0.25, window4(t, CUE.flash - 0.2, CUE.flash, CUE.flash + 0.1, CUE.flash + 0.9),
            decay(τ, CUE.towerHit, 2.2) * 0.7 * (t > CUE.arc ? 1 : 0), decay(τ, CUE.saturnHit, 2) * 0.6,
            decay(τ, CUE.formHit, 2.5) * 0.5, decay(t, CUE.shootUp, 3) * 0.5 * (t < CUE.arc ? 1 : 0),
            decay(t, CUE.graze, 4) * 0.35 * (t < CUE.graze + 2 ? 1 : 0));
        return {
            card,
            cardAlpha: card ? window4(t, card.from, card.from + 0.35, card.to - 0.45, card.to) : 0,
            label,
            labelAlpha: label ? window4(t, label.at, label.at + 0.12, label.until - 0.3, label.until) : 0,
            labelPop: label ? 1 + 0.25 * (1 - smooth(span(t, label.at, label.at + 0.2))) : 1,
            white: clamp01(white),
            logoAlpha: window4(t, CUE.title, CUE.title + 1.4, DURATION - 0.9, DURATION - 0.3),
            logoGrow: 1 + 0.04 * span(t, CUE.title, DURATION),
            shade: smooth(span(t, DURATION - 0.8, DURATION))
        };
    }

    //=========================================================================
    // Scene_StartinMovie
    //=========================================================================
    function Scene_StartinMovie() {
        this.initialize.apply(this, arguments);
    }
    Scene_StartinMovie.prototype = Object.create(Scene_Base.prototype);
    Scene_StartinMovie.prototype.constructor = Scene_StartinMovie;

    Scene_StartinMovie.prototype.initialize = function () {
        Scene_Base.prototype.initialize.call(this);
        this._onDone = null;
        this._state = "loading";
        this._finished = false;
        this._frames = 0;
        this._t = 0;
        // The dice is thrown afresh every time the movie plays.
        this._variant = variantFor(rollFace());
        this._labels = labelsFor(this._variant);
        this._sfx = sfxFor(this._variant);
        this._sfxAt = 0;
    };

    Scene_StartinMovie.prototype.prepare = function (onDone, opts) {
        this._onDone = typeof onDone === "function" ? onDone : null;
        // A face picked beforehand (the minigame list asks) instead of a roll.
        const face = opts && Number(opts.face);
        if (face >= 1 && face <= 20) {
            this._variant = variantFor(face);
            this._labels = labelsFor(this._variant);
            this._sfx = sfxFor(this._variant);
        }
    };

    Scene_StartinMovie.prototype.create = function () {
        Scene_Base.prototype.create.call(this);
        this._born = now();
        try {
            const size = stageSize();
            this._stage = new MovieStage(size.w, size.h, this._variant);
            this._stageSprite = new PIXI.Sprite(PIXI.Texture.from(this._stage.domElement));
            this._stageSprite.scale.set(Graphics.width / this._stage.w, Graphics.height / this._stage.h);
            this.addChild(this._stageSprite);
            this._stage.load().then((ok) => {
                if (this._finished) return;
                this._state = ok ? "ready" : "failed";
            }).catch((e) => {
                console.error("[StartinMovie] the movie could not be built", e);
                this._state = "failed";
            });
        } catch (e) {
            console.error("[StartinMovie] no 3D for the movie", e);
            this._state = "failed";
        }
        this.createOverlay();
        if (!this._music) {
            try { this._music = AudioManager.createBuffer("bgm/", TRACK); } catch (e) { this._music = null; }
        }
    };

    // The track is decoded far enough to start the movie's stretch of it.
    Scene_StartinMovie.prototype._musicReady = function () {
        const b = this._music;
        if (!b) return true;
        return !!(b.isReady && b.isReady() && (b._isLoaded || (b._totalTime || 0) > START_OFFSET + MUSIC_END + 2) &&
            (b._totalTime || 0) > START_OFFSET + 1);
    };

    Scene_StartinMovie.prototype._startMusic = function () {
        const bgm = { name: TRACK, volume: 90, pitch: 100, pan: 0 };
        const b = this._music;
        if (!b) { AudioManager.playBgm(bgm, START_OFFSET); return; }
        AudioManager.stopBgm();
        AudioManager._bgmBuffer = b;
        AudioManager.updateBgmParameters(bgm);
        AudioManager.updateCurrentBgm(bgm, START_OFFSET);
        b.play(false, START_OFFSET);
    };

    // The size the movie is drawn at: the screen, capped at 1280 wide.
    function stageSize() {
        const k = Graphics.width > 1280 ? 1280 / Graphics.width : 1;
        return { w: Math.round(Graphics.width * k), h: Math.round(Graphics.height * k) };
    }

    function now() {
        return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    }

    Scene_StartinMovie.prototype.createOverlay = function () {
        const W = Graphics.width, H = Graphics.height;
        const bar = Math.round(H * 0.1);
        const black = new Bitmap(W, bar);
        black.fillAll("#000000");
        this._barTop = new Sprite(black);
        this._barBottom = new Sprite(black);
        this._barBottom.y = H - bar;
        this._white = new Sprite(new Bitmap(W, H));
        this._white.bitmap.fillAll("#ffffff");
        this._white.opacity = 0;
        this._shade = new Sprite(new Bitmap(W, H));
        this._shade.bitmap.fillAll("#000000");
        this._shade.opacity = 0;
        this._card = new Sprite(new Bitmap(W, 200));
        this._card.y = Math.round((H - 200) / 2);
        this._card.opacity = 0;
        this._label = new Sprite(new Bitmap(Math.min(W, 640), 64));
        this._label.anchor.x = 0.5;
        this._label.x = Math.round(W / 2);
        this._label.y = bar + 10;
        this._label.opacity = 0;
        // The game's own logo, for the first morning.
        this._logo = new Sprite(ImageManager.loadPicture("Logo")); // i18n-ignore  picture file
        this._logo.anchor.x = this._logo.anchor.y = 0.5;
        this._logo.x = Math.round(W / 2);
        this._logo.y = Math.round(H * 0.44);
        this._logo.opacity = 0;
        [this._white, this._logo, this._shade, this._barTop, this._barBottom, this._card, this._label].forEach((s) => this.addChild(s));
        this._cardKey = null;
        this._labelKey = null;
    };

    function textFace() {
        return (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem.mainFontFace) ? $gameSystem.mainFontFace() : "sans-serif"; // i18n-ignore  font
    }

    // The title cards: stark serif capitals on black.
    Scene_StartinMovie.prototype._drawCard = function (card) {
        const b = this._card.bitmap;
        b.clear();
        if (!card) return;
        b.fontFace = "serif"; // i18n-ignore  font
        b.fontBold = true;
        b.fontSize = 76;
        b.textColor = "#f4f1ea";
        b.outlineWidth = 0;
        this._card.y = Math.round(card.low ? Graphics.height * 0.66 : (Graphics.height - 200) / 2);
        if (card.low) {
            b.fontSize = 34;
            b.textColor = "#fff4dc";
            b.drawText(T("StartinMovie.cards." + card.key), 0, 60, b.width, 60, "center");
            return;
        }
        b.drawText(T("StartinMovie.cards." + card.key), 0, 40, b.width, 90, "center");
        if (card.sub) {
            b.fontBold = false;
            b.fontSize = 24;
            b.textColor = "#c8a860";
            b.drawText(T("StartinMovie.cards." + card.sub), 0, 132, b.width, 36, "center");
        }
    };

    // An attack's name, top centre: gold on God's, red on Em's.
    Scene_StartinMovie.prototype._drawLabel = function (label) {
        const b = this._label.bitmap;
        b.clear();
        if (!label) return;
        const em = label.by === "em";
        b.fillRect(0, 8, b.width, 48, "rgba(0,0,0,0.55)");
        b.fillRect(0, 8, b.width, 2, em ? "#e8203a" : "#ffd36a");
        b.fillRect(0, 54, b.width, 2, em ? "#e8203a" : "#ffd36a");
        b.fontFace = textFace();
        b.fontBold = true;
        b.fontSize = 32;
        b.textColor = em ? "#ffffff" : "#fff2c0";
        b.outlineColor = em ? "rgba(140,0,20,0.9)" : "rgba(120,80,0,0.9)";
        b.outlineWidth = 4;
        b.drawText(label.text ? T(label.text) : T("StartinMovie.labels." + label.key), 0, 12, b.width, 40, "center");
    };

    Scene_StartinMovie.prototype.start = function () {
        Scene_Base.prototype.start.call(this);
        const radio = window.TunableRadio;
        if (radio && radio.isOn && radio.isOn()) {
            try { if (radio.suspend) radio.suspend(); else radio.stop(); } catch (e) { /* already off */ }
        }
    };

    Scene_StartinMovie.prototype.wantsSkip = function () {
        if (this._frames < 20) return false;
        return Input.isTriggered("ok") || Input.isTriggered("cancel") || Input.isTriggered("escape") ||
            TouchInput.isTriggered() || (typeof TouchInput.isCancelled === "function" && TouchInput.isCancelled());
    };

    // The needle in the band's recording, as movie time, once it is moving.
    // Read off the buffer itself: started at an offset its start time sits
    // in the audio clock's past, which the shared "is it started" test takes
    // for not started at all.
    Scene_StartinMovie.prototype._musicTime = function () {
        const buf = AudioManager._bgmBuffer;
        if (!buf || buf !== (this._music || buf) || !buf.isPlaying || !buf.isPlaying() || !buf.isReady || !buf.isReady()) return null;
        const pos = buf.seek();
        return Number.isFinite(pos) && pos > 0 ? pos - START_OFFSET : null;
    };

    Scene_StartinMovie.prototype.update = function () {
        Scene_Base.prototype.update.call(this);
        this._frames++;
        if (this._finished) return;
        if (this.wantsSkip()) { this.finish(); return; }
        const wall = now();
        if (this._state === "failed") { this.finish(); return; }
        if (this._state === "loading") {
            if ((wall - this._born) / 1000 > LOAD_TIMEOUT) this.finish();
            return;
        }
        if (this._state === "ready") {
            // The picture is built: wait (a little) for the band too.
            if (!this._musicReady() && (wall - this._born) / 1000 < LOAD_TIMEOUT + CUE_TIMEOUT) return;
            this._startMusic();
            this._cueAt = wall;
            this._state = "cue";
        }
        if (this._state === "cue") {
            const m = this._musicTime();
            if (m === null && (wall - this._cueAt) / 1000 < CUE_TIMEOUT) return;
            this._wall0 = wall - Math.max(0, m || 0) * 1000;
            this._last = wall;
            this._state = "play";
        }
        let t = (wall - this._wall0) / 1000;
        const m = this._musicTime();
        if (m !== null && m >= 0 && m < MUSIC_END && Math.abs(m - t) > 0.08) {
            this._wall0 = wall - m * 1000;
            t = m;
        }
        const dt = Math.min(0.1, Math.max(0, (wall - this._last) / 1000));
        this._last = wall;
        this._t = t;
        if (t >= DURATION) { this.finish(); return; }
        if (t >= CUE.title && !this._fading) {
            this._fading = true;
            AudioManager.fadeOutBgm(DURATION - CUE.title);
        }
        this._playSfx(t);
        this._stage.render(t, dt);
        if (this._stageSprite && this._stageSprite.texture) this._stageSprite.texture.update();
        this.updateOverlay(t);
    };

    // Every sound effect whose moment the clock has just passed; one that is
    // already well behind (a skipped load) is dropped rather than played late.
    Scene_StartinMovie.prototype._playSfx = function (t) {
        while (this._sfxAt < this._sfx.length && this._sfx[this._sfxAt][0] <= t) {
            const [at, name, volume, pitch] = this._sfx[this._sfxAt++];
            if (t - at < 0.4) AudioManager.playSe({ name, volume: Math.round(volume * SFX_GAIN), pitch, pan: 0 });
        }
    };

    Scene_StartinMovie.prototype.updateOverlay = function (t) {
        const o = overlayState(t, this._labels);
        const ck = o.card ? o.card.key : null;
        if (ck !== this._cardKey) { this._cardKey = ck; this._drawCard(o.card); }
        this._card.opacity = 255 * o.cardAlpha;
        const lk = o.label ? String(o.label.at) : null;
        if (lk !== this._labelKey) { this._labelKey = lk; this._drawLabel(o.label); }
        this._label.opacity = 255 * o.labelAlpha;
        this._label.scale.set(o.labelPop, 1);
        this._white.opacity = 255 * o.white;
        this._logo.opacity = 255 * o.logoAlpha;
        if (this._logo.bitmap && this._logo.bitmap.width) {
            const fit = Math.min(1, (Graphics.width * 0.55) / this._logo.bitmap.width);
            this._logo.scale.set(fit * o.logoGrow);
        }
        this._shade.opacity = 255 * o.shade;
        // Fullscreen gets the whole picture: no letterbox.
        const full = !!(Graphics._isFullScreen && Graphics._isFullScreen());
        this._barTop.visible = this._barBottom.visible = !full;
    };

    Scene_StartinMovie.prototype.finish = function () {
        if (this._finished) return;
        this._finished = true;
        AudioManager.stopBgm();
        const done = this._onDone;
        if (done) done();
        else SceneManager.pop();
    };

    Scene_StartinMovie.prototype.terminate = function () {
        Scene_Base.prototype.terminate.call(this);
        if (this._stageSprite) {
            this.removeChild(this._stageSprite);
            try { this._stageSprite.destroy({ texture: true, baseTexture: true }); } catch (e) { /* gone */ }
            this._stageSprite = null;
        }
        if (this._stage) { this._stage.dispose(); this._stage = null; }
        // The track loaded for the movie and never started (a skip while it
        // was still loading) is let go here.
        if (this._music && AudioManager._bgmBuffer !== this._music) {
            try { this._music.destroy(); } catch (e) { /* gone */ }
        }
        this._music = null;
    };

    window.Scene_StartinMovie = Scene_StartinMovie;

    //=========================================================================
    // Hooks
    //=========================================================================
    function canPlay() {
        return typeof THREE !== "undefined" && typeof PIXI !== "undefined" && !!window.ActorModel3D &&
            typeof window.ActorModel3D.figure === "function";
    }

    // A new story is begun: the movie first, then the run itself (the landing
    // and Em's creation wizard). `run` takes the movie's place when it ends.
    function beforeStory(run) {
        if (!canPlay()) { run(); return false; }
        SceneManager.goto(Scene_StartinMovie);
        SceneManager.prepareNextScene(run);
        return true;
    }

    // Played over whatever is on screen, then back to it.
    // Played over whatever is on screen (a map, the minigame list), then back
    // to it with the music that was playing.
    // `opts.face`: a dice face to play instead of rolling (1 to 20).
    function play(opts) {
        if (!canPlay()) return false;
        const music = AudioManager.saveBgm ? AudioManager.saveBgm() : null;
        SceneManager.push(Scene_StartinMovie);
        SceneManager.prepareNextScene(() => {
            SceneManager.pop();
            if (music && music.name) AudioManager.replayBgm(music);
            else if (typeof $gameMap !== "undefined" && $gameMap && $gameMap.mapId && $gameMap.mapId() > 0) $gameMap.autoplay();
        }, { face: opts && opts.face });
        return true;
    }

    // Every face of the Dice of Yaldabaoth with the shape of the vector gun it
    // gives: what a picker shows.
    function diceFaces() {
        const out = [];
        for (let f = 1; f <= 20; f++) {
            const v = variantFor(f);
            out.push({ face: f, key: v.key, kind: v.kind, name: v.key ? T("VectorGun.shape." + v.key + ".name") : "" });
        }
        return out;
    }

    PluginManager.registerCommand(PLUGIN, "play", play);

    window.StartinMovie = {
        TRACK, START_OFFSET, TRACK_SECONDS, BPM, BEAT0, MUSIC_END, DURATION,
        CUE, HITS, STABS, LAYERS, LABELS, CARDS, SHOTS, DEFLECTS,
        beat, beatsBetween, shotAt, worldTime, variantFor, labelsFor, sfxFor, FORM_ATTACKS, attackFor, strikesFor,
        // The stage itself, for the test suite to build and run headless.
        Stage: MovieStage,
        overlayState,
        diceFaces,
        canPlay,
        beforeStory,
        cameras: () => Object.keys(MovieStage.prototype).filter((k) => k.indexOf("_cam_") === 0).map((k) => k.slice(5)),
        play
    };
    // i18n-ignore-end
})();
