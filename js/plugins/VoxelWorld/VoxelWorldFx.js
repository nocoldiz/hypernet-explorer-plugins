//=============================================================================
// VoxelWorldFx.js
// VoxelWorld: underwater bubbles, sky dome, wheel particles, engine audio, the sea
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - underwater bubbles, sky dome, wheel particles, engine audio, the sea
 * @author Omni-Lex
 *
 * @help
 * underwater bubbles, sky dome, wheel particles, engine audio, the sea.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldFx.js'); return; }

    const {
        WORLD_SCALE, WORLD_TILE_SIZE, loadTex, loadVoxelTex
    } = VW;

    // =========================================================================
    // UnderwaterFx, a rising bubble field shown only while submerged.
    // =========================================================================
    class UnderwaterFx {
        constructor(scene) {
            this._scene  = scene;
            this._sys    = null;
            this._active = false;
        }

        setActive(on) {
            if (on === this._active) return;
            this._active = on;
            if (on && !this._sys) {
                const COUNT = 600;
                const geo = new THREE.BufferGeometry();
                const pos = new Float32Array(COUNT * 3);
                for (let i = 0; i < COUNT; i++) {
                    pos[i * 3]     = (Math.random() - 0.5) * 800;
                    pos[i * 3 + 1] = Math.random() * 300 - 150;
                    pos[i * 3 + 2] = (Math.random() - 0.5) * 800;
                }
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                const mat = new THREE.PointsMaterial({
                    color: 0xbfe8ff, size: 2.4, transparent: true, opacity: 0.5, depthWrite: false
                });
                this._sys = new THREE.Points(geo, mat);
                this._scene.add(this._sys);
            }
            if (this._sys) this._sys.visible = on;
        }

        update(camX, camY, camZ, delta) {
            if (!this._active || !this._sys) return;
            const pos = this._sys.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                let y = pos.getY(i) + 28 * delta;
                if (y > 150) {
                    y = -150;
                    pos.setX(i, (Math.random() - 0.5) * 800);
                    pos.setZ(i, (Math.random() - 0.5) * 800);
                }
                pos.setY(i, y);
            }
            pos.needsUpdate = true;
            this._sys.position.set(camX, camY || 0, camZ);
        }

        dispose() {
            if (this._sys) {
                this._sys.geometry.dispose();
                this._sys.material.dispose();
                this._scene.remove(this._sys);
                this._sys = null;
            }
        }
    }

    // =========================================================================
    // SkyFx, cheap atmosphere dressing: a star dome and moon at night plus a
    // ring of drifting low-poly clouds. Everything follows the camper and is
    // fog-exempt so it reads at any draw distance.
    // =========================================================================
    // The moon, in numbers. MOON_SPACING and MOON_BIG mirror the battle sky's
    // own three-moon layout (a side pair and a larger one between).
    const MOON_TEX     = 128;   // pixels of the phase texture
    const MOON_SIZE    = 230;   // world units across, before the world scale
    const MOON_SPACING = 380;   // how far the Friday pair sits to either side
    const MOON_BIG     = 1.3;   // how much larger the middle one is
    const MOON_RISE    = 90;    // and how much higher it rides
    // How many of another world's moons are worth drawing. Some of the gas
    // giants in this galaxy have eighty.
    const ALIEN_MOON_MAX = 4;

    class SkyFx {
        constructor(scene) {
            this._scene = scene;
            this._group = new THREE.Group();
            scene.add(this._group);

            // --- Stars: fixed dome of screen-space points ---
            const N = 900;
            const pos = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {
                const az = Math.random() * Math.PI * 2;
                const el = Math.asin(Math.random());
                // Star dome scales with the world so it sits far beyond the (25x
                // taller) mountains rather than intersecting them.
                const r  = 2500 * WORLD_SCALE;
                pos[i * 3]     = Math.cos(az) * Math.cos(el) * r;
                pos[i * 3 + 1] = Math.sin(el) * r * 0.9 + 60 * WORLD_SCALE;
                pos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            this._starMat = new THREE.PointsMaterial({
                color: 0xdfe8ff, size: 1.8, sizeAttenuation: false,
                transparent: true, opacity: 0, depthWrite: false
            });
            this._starMat.fog = false;
            this._stars = new THREE.Points(geo, this._starMat);
            this._stars.frustumCulled = false;
            this._group.add(this._stars);

            // --- The moon, and what it is doing tonight ---------------------
            // It used to be a soft blob of light: the same smudge whatever night
            // it was. It is a disc now, lit the way the moon is actually lit on
            // the day the game is on, drawn off the same lunar arithmetic the
            // battle sky uses (window.SkyRenderer) so the two skies never
            // disagree about what is up there.
            //
            // And on a FRIDAY there are three of them, exactly as the battle sky
            // has always had: two out to the sides and a bigger one between.
            this._moonCanvas = document.createElement('canvas');
            this._moonCanvas.width = this._moonCanvas.height = MOON_TEX;
            this._moonTex = new THREE.CanvasTexture(this._moonCanvas);
            this._moonPhaseDrawn = null;
            this._paintMoon(0.5);          // full, until the calendar is asked
            this._moonMat = new THREE.SpriteMaterial({
                map: this._moonTex, transparent: true, depthWrite: false, depthTest: true, opacity: 0
            });
            this._moonMat.fog = false;

            // Three sprites, all sharing the one texture. Only the first is ever
            // up on an ordinary night.
            this._moons = [];
            for (let i = 0; i < 3; i++) {
                const sp = new THREE.Sprite(this._moonMat);
                sp.scale.set(MOON_SIZE * WORLD_SCALE, MOON_SIZE * WORLD_SCALE, 1);
                sp.visible = i === 0;
                this._group.add(sp);
                this._moons.push(sp);
            }
            this._moon = this._moons[0];   // the one everything else means
            // Another world's moons, once somebody says which world this is.
            this._world = null;
            this._alienMoons = [];

            // --- Low-poly clouds: one InstancedMesh of flattened icosahedra ---
            this._cloudGeo = new THREE.IcosahedronGeometry(46 * WORLD_SCALE, 0);
            // Unlit, and deliberately so: a cloud in a world drawn on this
            // palette is a flat white shape, not a lit surface. Lambert put the
            // sun on them and left the layer a dirty grey against a blue sky.
            this._cloudMat = new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0.85
            });
            this._cloudMat.fog = false;
            const COUNT = 26;
            this._clouds = new THREE.InstancedMesh(this._cloudGeo, this._cloudMat, COUNT);
            const dummy = new THREE.Object3D();
            let s = 12345;
            const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
            for (let i = 0; i < COUNT; i++) {
                const ang = rnd() * Math.PI * 2;
                const rad = (500 + rnd() * 1900) * WORLD_SCALE;
                dummy.position.set(Math.cos(ang) * rad, (470 + rnd() * 300) * WORLD_SCALE, Math.sin(ang) * rad);
                dummy.rotation.y = rnd() * Math.PI;
                dummy.scale.set(1.2 + rnd() * 2.4, 0.32 + rnd() * 0.2, 1.2 + rnd() * 2.4);
                dummy.updateMatrix();
                this._clouds.setMatrixAt(i, dummy.matrix);
            }
            this._clouds.frustumCulled = false;
            this._group.add(this._clouds);
            this._tmpC = new THREE.Color();
        }

        // The shape of a phase, as three numbers, so it can be reasoned about (and
        // tested) without a canvas to draw on.
        //
        //   waxing      the lit half is the right of the disc
        //   term        the terminator's half-width, as a fraction of the radius:
        //               the whole disc at the new moon, nothing at the quarters,
        //               the whole disc the other way at the full
        //   ellipseLit  whether that ellipse is filled with light or with dark.
        //               It eats into the lit half while the moon is a CRESCENT
        //               and fills part of the dark half while it is GIBBOUS,
        //               which is the whole difference between the two shapes.
        //   lit         the fraction of the disc that ends up lit
        static moonGeometry(phase) {
            const p = ((phase % 1) + 1) % 1;
            const term = Math.cos(2 * Math.PI * p);
            return {
                waxing: p < 0.5,
                term,
                ellipseLit: term < 0,
                lit: 0.5 - 0.5 * Math.cos(2 * Math.PI * p)
            };
        }

        // Repaint the disc for a phase, if it has actually moved on. `phase` is
        // 0 at the new moon, 0.5 at the full, as the battle sky counts it.
        //
        // The lit part of a moon is bounded by the LIMB on one side - the edge of
        // the disc - and by the TERMINATOR on the other, which is the circle of
        // sunrise seen edge on and so reads as an ellipse. Its half-width is
        // r*cos(2*pi*phase): the whole width at the new moon, nothing at the
        // quarters, and the whole width again the other way at the full. Whether
        // that ellipse is lit or dark is what makes a crescent a crescent and a
        // gibbous a gibbous.
        _paintMoon(phase) {
            const bucket = Math.round(phase * 64);
            if (this._moonPhaseDrawn === bucket) return;
            this._moonPhaseDrawn = bucket;
            SkyFx.paintPhase(this._moonCanvas, phase);
            this._moonTex.needsUpdate = true;
        }

        // A moon of any world, drawn into a canvas: the whole disc, most of it
        // unlit, with the terminator taken out of the lit half or added to it.
        // `lit` is the colour of the sunlit rock, which is the one thing that
        // makes another planet's moons its own rather than copies of ours.
        static paintPhase(canvas, phase, lit) {
            const S = canvas.width, c = S / 2, r = S * 0.34;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, S, S);
            const LIT = lit || '#f4f6ff';
            const rgb = SkyFx.cssRGB(LIT);
            const DARK = `rgba(${Math.round(rgb[0] * 0.28)},${Math.round(rgb[1] * 0.30)},` +
                         `${Math.round(rgb[2] * 0.38)},0.85)`;

            // The halo it casts, so it still reads as the light in the sky.
            const g = ctx.createRadialGradient(c, c, r * 0.9, c, c, S * 0.5);
            g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`);
            g.addColorStop(1, `rgba(${Math.round(rgb[0] * 0.6)},${Math.round(rgb[1] * 0.6)},` +
                             `${Math.round(rgb[2] * 0.7)},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, S, S);

            const disc = () => { ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill(); };

            // The whole disc is there on any night; most of it is simply unlit.
            ctx.fillStyle = DARK; disc();

            const geom = SkyFx.moonGeometry(phase);
            const waxing = geom.waxing;
            const tx = r * geom.term;
            // The lit half: the right of the disc while it waxes, the left while
            // it wanes.
            ctx.fillStyle = LIT;
            ctx.beginPath();
            ctx.arc(c, c, r, -Math.PI / 2, Math.PI / 2, !waxing);
            ctx.closePath();
            ctx.fill();

            // ...and the terminator taken out of it, or added to it.
            if (Math.abs(tx) > 0.5) {
                ctx.fillStyle = geom.ellipseLit ? LIT : DARK;
                ctx.beginPath();
                ctx.ellipse(c, c, Math.abs(tx), r, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // '#rrggbb' (or '#rgb') to three numbers. Anything unreadable is bone.
        static cssRGB(css) {
            let h = String(css || '').trim().replace('#', '');
            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            const n = parseInt(h, 16);
            if (h.length !== 6 || !isFinite(n)) return [244, 246, 255];
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }

        // Which world's sky this is. Null is Earth's, with its one moon and the
        // three of a Friday. A landed descriptor puts THAT world's moons up
        // instead: as many as it really has, each the size and the colour the
        // galaxy catalogue gives it, each on its own month so they drift past
        // one another over a night rather than moving as a set.
        //
        setAirless(airless) {
            this._airless = !!airless;
        }

        // A planet with no moons gets an empty sky, which is the honest answer
        // and is most of them.
        setWorld(desc) {
            this._disposeAlienMoons();
            this._world = desc || null;
            if (desc && (desc.atmosphere === false || desc.hasAtmosphere === false)) {
                this._airless = true;
            } else if (desc && (desc.atmosphere === true || desc.hasAtmosphere === true)) {
                this._airless = false;
            }
            if (!desc) return;
            const list = (desc.moons || []).slice(0, ALIEN_MOON_MAX);
            this._alienMoons = list.map((m, i) => {
                const cv = document.createElement('canvas');
                cv.width = cv.height = MOON_TEX;
                const tex = new THREE.CanvasTexture(cv);
                const mat = new THREE.SpriteMaterial({
                    map: tex, transparent: true, depthWrite: false, depthTest: true, opacity: 0
                });
                mat.fog = false;
                const sp = new THREE.Sprite(mat);
                this._group.add(sp);
                // How big it looks: our own moon is 0.27 Earth radii, and this
                // one is drawn against that. Kept inside bounds a sky can hold.
                const size = MOON_SIZE * WORLD_SCALE *
                    Math.max(0.35, Math.min(2.6, (m.radius || 0.27) / 0.27));
                sp.scale.set(size, size, 1);
                return {
                    sp, cv, tex, mat, size,
                    lit: m.color || '#cfd8e6',
                    // Its own month, so no two are ever at the same phase, and
                    // its own place along the arc, so they are spread out.
                    period: 4 + i * 5.5 + (m.radius || 0.3) * 9,
                    lane: (i - (list.length - 1) / 2) * 0.55,
                    rise: 1 - Math.abs(i % 3 - 1) * 0.28,
                    drawn: null,
                };
            });
        }

        _disposeAlienMoons() {
            for (const m of (this._alienMoons || [])) {
                this._group.remove(m.sp);
                m.tex.dispose();
                m.mat.dispose();
            }
            this._alienMoons = [];
        }

        // Another world's moons, over the same night arc Earth's uses. Elapsed
        // hours drive the phases: each moon runs its own month, so on any given
        // night one may be full while the next is a crescent.
        _updateAlienMoons(hour, dayFactor, elapsedH) {
            const t = Math.max(0, Math.min(1, (hour >= 18) ? (hour - 18) / 12 : (hour + 6) / 12));
            for (let i = 0; i < this._alienMoons.length; i++) {
                const m = this._alienMoons[i];
                const phase = ((elapsedH / (m.period * 24)) % 1 + 1) % 1;
                const bucket = Math.round(phase * 48);
                if (m.drawn !== bucket) {
                    m.drawn = bucket;
                    SkyFx.paintPhase(m.cv, phase, m.lit);
                    m.tex.needsUpdate = true;
                }
                // Each one a little further along the arc than the last, so they
                // rise and set in order instead of moving as one body.
                const tt = Math.max(0, Math.min(1, t + m.lane * 0.18));
                const az = Math.PI * (1 - tt);
                m.sp.position.set(
                    Math.cos(az) * 1900 * WORLD_SCALE + Math.sin(az) * m.lane * MOON_SPACING * WORLD_SCALE,
                    (150 + Math.sin(tt * Math.PI) * 1100 * m.rise) * WORLD_SCALE,
                    Math.sin(az) * 900 * WORLD_SCALE + Math.cos(az) * m.lane * MOON_SPACING * WORLD_SCALE
                );
                // A big moon close overhead is up in daylight too, the way ours
                // is when it is near full - the bigger it looks, the longer it
                // holds against the sky.
                const day = Math.max(0, (m.size / (MOON_SIZE * WORLD_SCALE)) - 0.9) * 0.35;
                m.sp.visible = true;
                m.mat.opacity = this._airless ? 0.95 : Math.max(0, 0.9 - dayFactor * (1.8 - day));
            }
        }

        // What the calendar says the sky is doing. Read off the battle sky's own
        // service so both agree; a full moon and no Friday if it is not loaded.
        _moonTonight() {
            const SR = window.SkyRenderer;
            if (!SR || !SR.calculateMoonPhase) return { phase: 0.5, friday: false };
            let phase = 0.5, friday = false;
            try {
                const date = SR.getGameDate ? SR.getGameDate() : new Date();
                const m = SR.calculateMoonPhase(date);
                if (m && isFinite(m.phase)) phase = ((m.phase % 1) + 1) % 1;
                friday = SR.isFriday ? !!SR.isFriday() : false;
            } catch (e) { /* the sky is not worth a crash */ }
            return { phase, friday };
        }

        update(camX, camZ, hour, dayFactor, delta, underwater, elapsedH) {
            this._group.position.set(camX, 0, camZ);
            this._group.visible = !underwater;
            if (underwater) return;

            if (this._airless) {
                this._starMat.opacity = 0.95;
                this._clouds.visible = false;
            } else {
                this._starMat.opacity = Math.max(0, 0.95 - dayFactor * 1.6);
                this._clouds.visible = true;

                // Clouds slowly orbit the camera (reads as wind drift) and dim at dusk.
                this._clouds.rotation.y += delta * 0.0045;
                this._tmpC.setRGB(
                    0.25 + dayFactor * 0.75,
                    0.27 + dayFactor * 0.73,
                    0.34 + dayFactor * 0.66
                );
                this._cloudMat.color.lerp(this._tmpC, Math.min(1, delta * 2));
                this._cloudMat.opacity = 0.55 + dayFactor * 0.3;
            }

            // On another world, that world's own moons: as many as it has, each
            // its own size, colour and month. Earth's moon and the three of a
            // Friday belong to Earth and stay there.
            if (this._world) {
                for (const sp of this._moons) sp.visible = false;
                this._updateAlienMoons(hour, dayFactor, elapsedH || 0);
                return;
            }

            // Moon: opposite arc to the sun, visible only after dark, and lit
            // the way it really is tonight.
            const sky = this._moonTonight();
            this._paintMoon(sky.phase);
            const nightT = (hour >= 18) ? (hour - 18) / 12 : (hour + 6) / 12;
            const t  = Math.max(0, Math.min(1, nightT));
            const az = Math.PI * (1 - t);
            const mx = Math.cos(az) * 1900 * WORLD_SCALE;
            const my = (150 + Math.sin(t * Math.PI) * 1100) * WORLD_SCALE;
            const mz = Math.sin(az) * 900 * WORLD_SCALE;

            // Three of them on a Friday, laid out as the battle sky lays them
            // out: one to each side and a bigger one between, riding a little
            // higher than its companions.
            const across = MOON_SPACING * WORLD_SCALE;
            for (let i = 0; i < this._moons.length; i++) {
                const sp = this._moons[i];
                sp.visible = sky.friday || i === 0;
                if (!sp.visible) continue;
                const side = sky.friday ? (i === 0 ? 0 : (i === 1 ? -1 : 1)) : 0;
                const big  = sky.friday && i === 0;
                const size = MOON_SIZE * (big ? MOON_BIG : 1) * WORLD_SCALE;
                sp.scale.set(size, size, 1);
                // Spread along the horizon, across the arc it is riding.
                sp.position.set(
                    mx - Math.sin(az) * side * across,
                    my + (big ? MOON_RISE * WORLD_SCALE : 0),
                    mz + Math.cos(az) * side * across
                );
            }
            this._moonMat.opacity = Math.max(0, 0.9 - dayFactor * 1.8);
        }

        dispose() {
            this._disposeAlienMoons();
            this._scene.remove(this._group);
            this._stars.geometry.dispose();
            this._starMat.dispose();
            this._moonTex.dispose();
            this._moonMat.dispose();
            this._cloudGeo.dispose();
            this._cloudMat.dispose();
        }
    }

    // =========================================================================
    // WheelFx, a small pooled particle system for wheel dust (offroad), tyre
    // smoke (drifting) and exhaust chuffs. CPU-integrated ring buffer; dead
    // particles are parked far underground so no per-frame allocation happens.
    // =========================================================================
    class WheelFx {
        constructor(scene) {
            this._scene = scene;
            const N = this._max = 220;
            this._pos  = new Float32Array(N * 3);
            this._col  = new Float32Array(N * 3);
            this._vel  = new Float32Array(N * 3);
            this._life = new Float32Array(N);
            for (let i = 0; i < N; i++) this._pos[i * 3 + 1] = -99999;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
            geo.setAttribute('color',    new THREE.BufferAttribute(this._col, 3));
            this._mat = new THREE.PointsMaterial({
                size: 4.0, vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false
            });
            this._pts = new THREE.Points(geo, this._mat);
            this._pts.frustumCulled = false;
            scene.add(this._pts);
            this._cursor = 0;
            this._dirty = false;
        }

        spawn(x, y, z, vx, vy, vz, r, g, b, life) {
            const i = this._cursor;
            this._cursor = (i + 1) % this._max;
            this._pos[i * 3] = x; this._pos[i * 3 + 1] = y; this._pos[i * 3 + 2] = z;
            this._vel[i * 3] = vx; this._vel[i * 3 + 1] = vy; this._vel[i * 3 + 2] = vz;
            this._col[i * 3] = r; this._col[i * 3 + 1] = g; this._col[i * 3 + 2] = b;
            this._life[i] = life;
            this._dirty = true;
        }

        update(delta) {
            let any = false;
            for (let i = 0; i < this._max; i++) {
                if (this._life[i] <= 0) continue;
                any = true;
                this._life[i] -= delta;
                if (this._life[i] <= 0) { this._pos[i * 3 + 1] = -99999; continue; }
                this._pos[i * 3]     += this._vel[i * 3]     * delta;
                this._pos[i * 3 + 1] += this._vel[i * 3 + 1] * delta;
                this._pos[i * 3 + 2] += this._vel[i * 3 + 2] * delta;
                this._vel[i * 3]     *= 0.92;
                this._vel[i * 3 + 2] *= 0.92;
                this._vel[i * 3 + 1] += 2.5 * delta;   // smoke/dust drifts upward as it thins
            }
            if (any || this._dirty) {
                this._pts.geometry.attributes.position.needsUpdate = true;
                this._pts.geometry.attributes.color.needsUpdate = true;
                this._dirty = any;
            }
        }

        dispose() {
            this._scene.remove(this._pts);
            this._pts.geometry.dispose();
            this._mat.dispose();
        }
    }

    // =========================================================================
    // EngineAudio, real sampled engine note via WebAudio. Two CC0 engine loops
    // (audio/se/CarEngineLoop.ogg + CarEngineRev.ogg, "racing car engine sound
    // loops" by domasx2, public domain) are looped and their playbackRate tracks
    // the gearbox RPM so the pitch rises through each gear; a high-rev layer
    // fades in near redline. Plus a looped-noise wind layer that rises with road
    // speed and a resonant tyre-screech layer driven by lateral slip.
    // Fully guarded so a missing/blocked AudioContext or absent files never throw.
    // =========================================================================
    class EngineAudio {
        constructor() {
            this._ok = false;
            this._ready = false;         // engine samples decoded + started
            this._liminalRate = 1;       // playback-rate multiplier for liminal drift
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                const ctx = new AC();
                this._ctx    = ctx;

                // Sampled engine loops feed a shared lowpass tone shaper; the base
                // loop carries the body of the note, the rev layer the top-end growl.
                this._filter = ctx.createBiquadFilter();
                this._filter.type = 'lowpass';
                this._filter.frequency.value = 700;
                this._engGain = ctx.createGain();
                this._engGain.gain.value = 0.0;
                this._revGain = ctx.createGain();
                this._revGain.gain.value = 0.0;
                this._engGain.connect(this._filter);
                this._revGain.connect(this._filter);
                this._filter.connect(ctx.destination);

                // One shared looped white-noise buffer feeds both the wind rush
                // (broad bandpass) and the tyre screech (narrow resonant band).
                const len = ctx.sampleRate * 2;
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const ch  = buf.getChannelData(0);
                for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
                this._noise = ctx.createBufferSource();
                this._noise.buffer = buf;
                this._noise.loop = true;
                this._windFilter = ctx.createBiquadFilter();
                this._windFilter.type = 'bandpass';
                this._windFilter.frequency.value = 650;
                this._windFilter.Q.value = 0.6;
                this._windGain = ctx.createGain();
                this._windGain.gain.value = 0;
                this._skidFilter = ctx.createBiquadFilter();
                this._skidFilter.type = 'bandpass';
                this._skidFilter.frequency.value = 2300;
                this._skidFilter.Q.value = 7;
                this._skidGain = ctx.createGain();
                this._skidGain.gain.value = 0;
                this._noise.connect(this._windFilter);
                this._windFilter.connect(this._windGain);
                this._windGain.connect(ctx.destination);
                this._noise.connect(this._skidFilter);
                this._skidFilter.connect(this._skidGain);
                this._skidGain.connect(ctx.destination);

                // Turbo whoosh: a bandpass off the shared noise that sweeps up and
                // swells while the accelerator boost is held.
                this._boostFilter = ctx.createBiquadFilter();
                this._boostFilter.type = 'bandpass';
                this._boostFilter.frequency.value = 320;
                this._boostFilter.Q.value = 1.4;
                this._boostGain = ctx.createGain();
                this._boostGain.gain.value = 0;
                this._noise.connect(this._boostFilter);
                this._boostFilter.connect(this._boostGain);
                this._boostGain.connect(ctx.destination);

                // Gear-shift blip: a short filtered-noise "chk" pulsed on each
                // gear change by playShift().
                this._shiftFilter = ctx.createBiquadFilter();
                this._shiftFilter.type = 'bandpass';
                this._shiftFilter.frequency.value = 900;
                this._shiftFilter.Q.value = 3;
                this._shiftGain = ctx.createGain();
                this._shiftGain.gain.value = 0;
                this._noise.connect(this._shiftFilter);
                this._shiftFilter.connect(this._shiftGain);
                this._shiftGain.connect(ctx.destination);

                this._noise.start();
                this._ok = true;
                this._loadSamples();
            } catch (e) { this._ok = false; }
        }

        // Decode the CC0 engine OGGs and start them as seamless loops. Async, so
        // setState stays silent (engine layers muted) until _ready flips true.
        _loadSamples() {
            const ctx = this._ctx;
            const load = (url) => fetch(url)
                .then(r => r.arrayBuffer())
                .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)));
            Promise.all([
                load('audio/se/CarEngineLoop.ogg'),
                load('audio/se/CarEngineRev.ogg')
            ]).then(([eng, rev]) => {
                if (!this._ok) return;
                this._engSrc = ctx.createBufferSource();
                this._engSrc.buffer = eng; this._engSrc.loop = true;
                this._engSrc.connect(this._engGain);
                this._engSrc.start();
                this._revSrc = ctx.createBufferSource();
                this._revSrc.buffer = rev; this._revSrc.loop = true;
                this._revSrc.connect(this._revGain);
                this._revSrc.start();
                this._ready = true;
            }).catch(() => { this._ready = false; });
        }

        setState(rpm01, load01, speedKmh, slip01, driving) {
            if (!this._ok) return;
            const ctx = this._ctx;
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            const now  = ctx.currentTime;
            const cfg = (typeof ConfigManager !== 'undefined' && ConfigManager.seVolume != null)
                ? ConfigManager.seVolume / 100 : 1;

            if (this._ready) {
                const r = Math.max(0, Math.min(1.05, rpm01 || 0));
                // Idle ~0.85x, redline ~2.55x. The rev layer runs a third faster.
                const rate = (0.85 + r * 1.7) * this._liminalRate;
                this._engSrc.playbackRate.setTargetAtTime(rate,        now, 0.05);
                this._revSrc.playbackRate.setTargetAtTime(rate * 1.33, now, 0.05);
                this._filter.frequency.setTargetAtTime(500 + r * 2200 + (load01 || 0) * 400, now, 0.08);
                const engVol = (driving ? 0.16 + r * 0.20 + (load01 || 0) * 0.05 : 0.11) * cfg;
                this._engGain.gain.setTargetAtTime(engVol, now, 0.08);
                const revVol = (driving ? Math.max(0, r - 0.35) * 0.28 + (load01 || 0) * 0.06 : 0) * cfg;
                this._revGain.gain.setTargetAtTime(revVol, now, 0.10);
            }

            const wind = Math.min(0.11, Math.max(0, (speedKmh || 0) - 25) * 0.00042) * cfg;
            this._windGain.gain.setTargetAtTime(wind, now, 0.15);
            this._windFilter.frequency.setTargetAtTime(500 + (speedKmh || 0) * 2.2, now, 0.2);
            const skid = Math.max(0, (slip01 || 0) - 0.25) * 0.10 * cfg;
            this._skidGain.gain.setTargetAtTime(skid, now, 0.05);
        }

        // Turbo layer on/off (accelerator boost held): swell + sweep up on, fall
        // away on release.
        setBoost(on) {
            if (!this._ok) return;
            const now = this._ctx.currentTime;
            const cfg = (typeof ConfigManager !== 'undefined' && ConfigManager.seVolume != null)
                ? ConfigManager.seVolume / 100 : 1;
            this._boostGain.gain.setTargetAtTime(on ? 0.12 * cfg : 0, now, on ? 0.12 : 0.25);
            this._boostFilter.frequency.setTargetAtTime(on ? 1400 : 320, now, on ? 0.5 : 0.3);
        }

        // One-shot mechanical "chk" on a gear change.
        playShift() {
            if (!this._ok) return;
            const now = this._ctx.currentTime;
            const cfg = (typeof ConfigManager !== 'undefined' && ConfigManager.seVolume != null)
                ? ConfigManager.seVolume / 100 : 1;
            try {
                const g = this._shiftGain.gain;
                g.cancelScheduledValues(now);
                g.setValueAtTime(0.0001, now);
                g.linearRampToValueAtTime(0.09 * cfg, now + 0.012);
                g.exponentialRampToValueAtTime(0.0008, now + 0.13);
                g.setValueAtTime(0, now + 0.14);
                const f = this._shiftFilter.frequency;
                f.cancelScheduledValues(now);
                f.setValueAtTime(1300, now);
                f.exponentialRampToValueAtTime(650, now + 0.13);
            } catch (e) { /* ignore */ }
        }

        // A slowed, sinking engine as the liminal overdrive takes hold.
        setLiminal(i) {
            if (!this._ok) return;
            this._liminalRate = 1 - Math.min(0.6, i * 0.5);
            if (i > 0) {
                const now = this._ctx.currentTime;
                this._filter.frequency.setTargetAtTime(420 * (1 - i * 0.55) + 80, now, 0.2);
            }
        }

        dispose() {
            if (!this._ok) return;
            try {
                const t = this._ctx.currentTime;
                this._engGain.gain.setTargetAtTime(0, t, 0.05);
                this._revGain.gain.setTargetAtTime(0, t, 0.05);
                this._windGain.gain.setTargetAtTime(0, t, 0.05);
                this._skidGain.gain.setTargetAtTime(0, t, 0.05);
                this._boostGain.gain.setTargetAtTime(0, t, 0.05);
                this._shiftGain.gain.setTargetAtTime(0, t, 0.05);
                if (this._engSrc) this._engSrc.stop(t + 0.2);
                if (this._revSrc) this._revSrc.stop(t + 0.2);
                this._noise.stop(t + 0.2);
                setTimeout(() => { this._ctx.close().catch(() => {}); }, 300);
            } catch (e) { /* ignore */ }
            this._ok = false;
        }
    }

    // =========================================================================
    // WaterPlane, a single large animated sea plane that follows the camera.
    // Sits just below ground (y = -2.5) so it only shows through the basins the
    // terrain digs for water tiles. Phong + sun specular gives a moving glint;
    // far cheaper than one plane per chunk and it never seams.
    // =========================================================================
    class WaterPlane {
        constructor(scene) {
            this._scene = scene;
            // Scales with the world so the sea reaches the horizon on the enlarged map.
            const geo = new THREE.PlaneGeometry(5000 * WORLD_SCALE, 5000 * WORLD_SCALE, 1, 1);
            geo.rotateX(-Math.PI / 2);
            this._mat = new THREE.MeshPhongMaterial({
                color:       0x2f86b8,
                specular:    0x9fd0ee,
                shininess:   90,
                transparent: true,
                opacity:     0.86,
                depthWrite:  false,
                side:        THREE.DoubleSide,  // visible as a ceiling when submerged
                map:         loadVoxelTex('sea.png', 24)
            });
            this._mesh = new THREE.Mesh(geo, this._mat);
            this._mesh.position.y = -2.5;
            this._mesh.renderOrder = -1;
            scene.add(this._mesh);
        }

        // Shown only when there is sea within sight. Inland the sheet is taken
        // down, so a dug shaft stays dry to the bottom.
        setVisible(on) { if (this._mesh) this._mesh.visible = !!on; }

        update(camX, camZ, t) {
            this._mesh.position.x = camX;
            this._mesh.position.z = camZ;
            // Gentle swell: bob the plane and shimmer the glint.
            this._mesh.position.y = -2.5 + Math.sin(t * 1.1) * 0.25;
            this._mat.opacity = 0.82 + Math.sin(t * 1.7) * 0.05;
        }

        dispose() {
            if (this._mesh) {
                this._scene.remove(this._mesh);
                this._mesh.geometry.dispose();
            }
            if (this._mat) this._mat.dispose();
        }
    }

    // =========================================================================
    // SolomonRitualFx: The Solomon Ritual
    // Triggered by F7 in developer mode while in voxel mode.
    // - The sky turns apocalyptic crimson red with heavy blood-red fog.
    // - A huge black occult summoning circle opens high in the sky and rotates.
    // - Lances of red pulsating energy rain down endlessly around the player.
    // - Scenery (trees/rocks/props) and voxel terrain are destroyed on impact.
    // - Evangelion-style cross-shaped Dirac explosions (✝) erupt from each crater.
    // - The player and camper take no damage.
    // =========================================================================
    class SolomonRitualFx {
        constructor(scene, terrain, overlay) {
            this._scene   = scene;
            this._terrain = terrain;
            this._overlay = overlay;
            this._active  = false;
            this._fade    = 0; // 0..1 transition
            this._time    = 0;
            this._spawnTimer = 0;
            this._lastSeTime = 0;
            this._sceneRef = null;

            this._group = new THREE.Group();
            this._group.visible = false;
            scene.add(this._group);

            this._initSummoningCircle();
            this._initLanceResources();
            this._initCrossResources();
            this._initOverlay();

            this._lances = [];
            this._crosses = [];
        }

        isActive() { return this._active; }
        setActive(on) {
            this._active = !!on;
            if (this._active) {
                this._group.visible = true;
                if (this._domOverlay) this._domOverlay.style.display = '';
            }
        }

        toggle() {
            this.setActive(!this.isActive());
            return this._active;
        }

        // --- 1. Arcane Black Summoning Circle in the Sky ---
        _initSummoningCircle() {
            const S = 1024;
            const cv = document.createElement('canvas');
            cv.width = cv.height = S;
            const ctx = cv.getContext('2d');
            const c = S / 2;

            ctx.clearRect(0, 0, S, S);

            // Deep obsidian / black lines with subtle red energy shadow
            ctx.shadowColor = 'rgba(255, 20, 40, 0.85)';
            ctx.shadowBlur = 12;
            ctx.strokeStyle = '#020001';
            ctx.fillStyle = '#020001';

            const drawRing = (r, w) => {
                ctx.lineWidth = w;
                ctx.beginPath();
                ctx.arc(c, c, r, 0, Math.PI * 2);
                ctx.stroke();
            };

            // Concentric boundary rings
            drawRing(485, 14);
            drawRing(460, 4);
            drawRing(442, 3);
            drawRing(360, 5);
            drawRing(340, 3);
            drawRing(240, 4);
            drawRing(150, 3);
            drawRing(80,  4);

            // Radial tick marks and runes between outer concentric rings
            const TICKS = 72;
            for (let i = 0; i < TICKS; i++) {
                const ang = (i / TICKS) * Math.PI * 2;
                const r1 = (i % 6 === 0) ? 442 : (i % 2 === 0) ? 452 : 456;
                const r2 = 460;
                ctx.lineWidth = (i % 6 === 0) ? 3.5 : 1.5;
                ctx.beginPath();
                ctx.moveTo(c + Math.cos(ang) * r1, c + Math.sin(ang) * r1);
                ctx.lineTo(c + Math.cos(ang) * r2, c + Math.sin(ang) * r2);
                ctx.stroke();
            }

            // 12 Occult Demonic Runes in the outer band
            for (let i = 0; i < 12; i++) {
                const ang = (i / 12) * Math.PI * 2;
                const rx = c + Math.cos(ang) * 400;
                const ry = c + Math.sin(ang) * 400;
                ctx.save();
                ctx.translate(rx, ry);
                ctx.rotate(ang + Math.PI / 2);
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(-12, -8); ctx.lineTo(12, -8);
                ctx.moveTo(0, -14);  ctx.lineTo(0, 14);
                ctx.moveTo(-8, 6);   ctx.lineTo(8, 6);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, -8, 5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // Interlaced Stars (Seal of Solomon / Pentagram / Heptagram)
            const drawStar = (points, radius, skip, width) => {
                ctx.lineWidth = width;
                ctx.beginPath();
                for (let i = 0; i <= points * skip; i++) {
                    const idx = (i * skip) % points;
                    const a = (idx / points) * Math.PI * 2 - Math.PI / 2;
                    const px = c + Math.cos(a) * radius;
                    const py = c + Math.sin(a) * radius;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            };

            drawStar(6, 340, 2, 5); // Hexagram Seal
            drawStar(7, 335, 3, 3); // Heptagram
            drawStar(5, 238, 2, 4); // Inverted Pentagram

            // Inner radiating occult rays
            for (let i = 0; i < 24; i++) {
                const ang = (i / 24) * Math.PI * 2;
                ctx.lineWidth = (i % 2 === 0) ? 2 : 1;
                ctx.beginPath();
                ctx.moveTo(c + Math.cos(ang) * 80, c + Math.sin(ang) * 80);
                ctx.lineTo(c + Math.cos(ang) * 150, c + Math.sin(ang) * 150);
                ctx.stroke();
            }

            // Center Dark Eye / Void
            ctx.beginPath();
            ctx.arc(c, c, 38, 0, Math.PI * 2);
            ctx.fill();
            // Demonic pupil slit
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ff1122';
            ctx.beginPath();
            ctx.ellipse(c, c, 6, 24, 0, 0, Math.PI * 2);
            ctx.fill();

            this._circleTex = new THREE.CanvasTexture(cv);
            this._circleMat = new THREE.MeshBasicMaterial({
                map: this._circleTex,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            this._circleMat.fog = false;

            const circleGeo = new THREE.PlaneGeometry(1700 * WORLD_SCALE, 1700 * WORLD_SCALE, 1, 1);
            circleGeo.rotateX(Math.PI / 2);
            this._circleMesh = new THREE.Mesh(circleGeo, this._circleMat);
            this._circleMesh.position.y = 520 * WORLD_SCALE;
            this._circleMesh.renderOrder = 2;
            this._group.add(this._circleMesh);

            // Counter-rotating inner ring for depth
            const innerGeo = new THREE.PlaneGeometry(950 * WORLD_SCALE, 950 * WORLD_SCALE, 1, 1);
            innerGeo.rotateX(Math.PI / 2);
            this._innerCircleMesh = new THREE.Mesh(innerGeo, this._circleMat);
            this._innerCircleMesh.position.y = 515 * WORLD_SCALE;
            this._innerCircleMesh.renderOrder = 3;
            this._group.add(this._innerCircleMesh);
        }

        // --- 2. Lances of Pulsating Red Energy ---
        _initLanceResources() {
            const S_W = 64, S_H = 256;
            const cv = document.createElement('canvas');
            cv.width = S_W; cv.height = S_H;
            const ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, S_W, S_H);

            // Outer crimson energy aura
            const gOuter = ctx.createLinearGradient(S_W / 2, 0, S_W / 2, S_H);
            gOuter.addColorStop(0,   'rgba(255, 0, 40, 0.95)');
            gOuter.addColorStop(0.7, 'rgba(230, 0, 30, 0.75)');
            gOuter.addColorStop(1,   'rgba(180, 0, 20, 0)');
            ctx.fillStyle = gOuter;
            ctx.beginPath();
            ctx.moveTo(S_W / 2, 0);
            ctx.lineTo(S_W - 6, S_H * 0.75);
            ctx.lineTo(S_W / 2, S_H);
            ctx.lineTo(6, S_H * 0.75);
            ctx.closePath();
            ctx.fill();

            // Inner intense white-hot core
            const gInner = ctx.createLinearGradient(S_W / 2, 0, S_W / 2, S_H);
            gInner.addColorStop(0,   'rgba(255, 255, 255, 1.0)');
            gInner.addColorStop(0.5, 'rgba(255, 220, 230, 0.95)');
            gInner.addColorStop(0.9, 'rgba(255, 100, 120, 0.4)');
            gInner.addColorStop(1,   'rgba(255, 0, 50, 0)');
            ctx.fillStyle = gInner;
            ctx.beginPath();
            ctx.moveTo(S_W / 2, 0);
            ctx.lineTo(S_W / 2 + 5, S_H * 0.7);
            ctx.lineTo(S_W / 2, S_H * 0.95);
            ctx.lineTo(S_W / 2 - 5, S_H * 0.7);
            ctx.closePath();
            ctx.fill();

            this._lanceTex = new THREE.CanvasTexture(cv);
            this._lanceMat = new THREE.MeshBasicMaterial({
                map: this._lanceTex,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            this._lanceMat.fog = false;

            // Crossed double-plane for 3D visibility from any camera angle
            const W = 11, H = 58;
            const p1 = new THREE.PlaneGeometry(W, H);
            const p2 = new THREE.PlaneGeometry(W, H);
            p2.rotateY(Math.PI / 2);
            p1.translate(0, H / 2, 0);
            p2.translate(0, H / 2, 0);

            const pos = new Float32Array(p1.attributes.position.array.length + p2.attributes.position.array.length);
            pos.set(p1.attributes.position.array, 0);
            pos.set(p2.attributes.position.array, p1.attributes.position.array.length);
            const uvs = new Float32Array(p1.attributes.uv.array.length + p2.attributes.uv.array.length);
            uvs.set(p1.attributes.uv.array, 0);
            uvs.set(p2.attributes.uv.array, p1.attributes.uv.array.length);

            const idx1 = p1.index.array;
            const idx2 = p2.index.array;
            const offset = p1.attributes.position.count;
            const indices = new Uint16Array(idx1.length + idx2.length);
            indices.set(idx1, 0);
            for (let i = 0; i < idx2.length; i++) indices[idx1.length + i] = idx2[i] + offset;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geo.setIndex(new THREE.BufferAttribute(indices, 1));
            this._lanceGeo = geo;
        }

        // --- 3. Evangelion Dirac Cross of Light (✝) Resources ---
        _initCrossResources() {
            const S = 256;
            const cv = document.createElement('canvas');
            cv.width = S; cv.height = S;
            const ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, S, S);

            // Radiant energy gradient with white-hot core and scarlet-crimson corona
            const rad = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
            rad.addColorStop(0,   'rgba(255, 255, 255, 1.0)');
            rad.addColorStop(0.18,'rgba(255, 180, 200, 0.95)');
            rad.addColorStop(0.55,'rgba(245, 10, 45, 0.70)');
            rad.addColorStop(1,   'rgba(180, 0, 20, 0)');
            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, S, S);

            this._crossTex = new THREE.CanvasTexture(cv);
            this._crossMat = new THREE.MeshBasicMaterial({
                map: this._crossTex,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            this._crossMat.fog = false;

            const ringGeo = new THREE.RingGeometry(0.5, 1.0, 32);
            ringGeo.rotateX(-Math.PI / 2);
            this._ringGeo = ringGeo;
            this._ringMat = new THREE.MeshBasicMaterial({
                color: 0xff1533,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            this._ringMat.fog = false;
        }

        _initOverlay() {
            if (!this._overlay) return;
            const d = document.createElement('div');
            d.id = 'camper-solomon-overlay';
            d.style.cssText = [
                'position:absolute', 'top:0', 'right:0', 'bottom:0', 'left:0',
                'pointer-events:none', 'z-index:3', 'opacity:0',
                'background:radial-gradient(ellipse at center, rgba(140, 0, 15, 0) 35%, rgba(200, 0, 25, 0.38) 75%, rgba(120, 0, 10, 0.72) 100%)',
                'mix-blend-mode:screen', 'transition:opacity 0.4s ease'
            ].join(';');
            this._overlay.appendChild(d);
            this._domOverlay = d;
        }

        _createCrossGroup() {
            const grp = new THREE.Group();

            // Vertical beam (crossed planes for 3D visibility from all 360 degrees)
            const V_H = 230, V_W = 14;
            const pV1 = new THREE.Mesh(new THREE.PlaneGeometry(V_W, V_H), this._crossMat);
            pV1.position.y = V_H / 2;
            const pV2 = new THREE.Mesh(new THREE.PlaneGeometry(V_W, V_H), this._crossMat);
            pV2.position.y = V_H / 2;
            pV2.rotation.y = Math.PI / 2;
            grp.add(pV1);
            grp.add(pV2);

            // Horizontal crossbar at 65% height (The iconic Evangelion Cross shape ✝)
            const H_W = 92, H_H = 14;
            const H_Y = V_H * 0.65;
            const pH1 = new THREE.Mesh(new THREE.PlaneGeometry(H_W, H_H), this._crossMat);
            pH1.position.y = H_Y;
            const pH2 = new THREE.Mesh(new THREE.PlaneGeometry(H_W, H_H), this._crossMat);
            pH2.position.y = H_Y;
            pH2.rotation.y = Math.PI / 2;
            grp.add(pH1);
            grp.add(pH2);

            // Center radiant flare at intersection
            const flare = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), this._crossMat);
            flare.position.y = H_Y;
            grp.add(flare);

            // Ground shockwave ring
            const ring = new THREE.Mesh(this._ringGeo, this._ringMat.clone());
            ring.position.y = 0.5;
            grp.add(ring);

            return {
                grp, pV1, pV2, pH1, pH2, flare, ring,
                age: 0,
                duration: 2.3,
                baseY: 0,
                x: 0, y: 0, z: 0
            };
        }

        _spawnLance(camX, camZ) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 14 + Math.random() * 155;
            const sx = camX + Math.cos(ang) * rad;
            const sz = camZ + Math.sin(ang) * rad;
            const sy = (380 + Math.random() * 90) * WORLD_SCALE;

            const mesh = new THREE.Mesh(this._lanceGeo, this._lanceMat);
            mesh.position.set(sx, sy, sz);
            mesh.rotation.x = Math.PI; // pointing down
            mesh.rotation.z = (Math.random() - 0.5) * 0.14;
            mesh.rotation.y = Math.random() * Math.PI * 2;
            this._group.add(mesh);

            this._lances.push({
                mesh,
                x: sx, y: sy, z: sz,
                vx: (Math.random() - 0.5) * 28,
                vy: -(520 + Math.random() * 180),
                vz: (Math.random() - 0.5) * 28,
                life: 0,
                phase: Math.random() * Math.PI * 2
            });
        }

        _triggerImpact(hitX, groundY, hitZ, camX, camZ) {
            // 1. Terrain Carving (Voxel Craters)
            if (this._terrain && this._terrain.carve) {
                this._terrain.carve(hitX, groundY, hitZ, 11);
            }

            // 2. Scenery & Prop Destruction (Felling trees, rocks, barrels)
            if (this._terrain && this._terrain.propsAt && this._terrain.fellProp) {
                const ts = WORLD_TILE_SIZE;
                const tx = Math.floor(hitX / ts), tz = Math.floor(hitZ / ts);
                const blastR2 = 28 * 28;
                for (let dj = -1; dj <= 1; dj++) {
                    for (let di = -1; di <= 1; di++) {
                        const ch = this._terrain.propsAt(tx + di, tz + dj);
                        if (!ch || !ch.grp || !ch.grp.userData || !ch.grp.userData.props) continue;
                        const props = ch.grp.userData.props;
                        for (let k = props.length - 1; k >= 0; k--) {
                            const p = props[k];
                            const px = ch.px + p.x, pz = ch.pz + p.z;
                            const d2 = (px - hitX) * (px - hitX) + (pz - hitZ) * (pz - hitZ);
                            if (d2 <= blastR2) {
                                this._terrain.fellProp({ rec: p, chunk: ch, x: px, y: p.y, z: pz });
                            }
                        }
                    }
                }
            }

            // 3. Spawn Evangelion Dirac Cross of Light (✝)
            const cross = this._createCrossGroup();
            cross.grp.position.set(hitX, groundY, hitZ);
            cross.baseY = groundY;
            cross.x = hitX; cross.y = groundY; cross.z = hitZ;
            this._group.add(cross.grp);
            this._crosses.push(cross);

            // 4. Explosion SE & Camera Shake
            const dist = Math.hypot(hitX - camX, hitZ - camZ);
            const now = performance.now();
            if (now - this._lastSeTime > 110) {
                this._lastSeTime = now;
                if (typeof AudioManager !== 'undefined' && AudioManager.playSe) {
                    const vol = Math.max(30, Math.min(100, Math.round(95 - dist * 0.35)));
                    const pitch = 85 + Math.floor(Math.random() * 30);
                    const pan = Math.max(-100, Math.min(100, Math.round((hitX - camX) * 0.6)));
                    AudioManager.playSe({ name: 'Explosion1', volume: vol, pitch: pitch, pan: pan });
                }
            }

            // Camera shake trauma based on proximity
            if (dist < 230 && this._sceneRef) {
                const trauma = (1 - dist / 230) * 0.38;
                this._sceneRef._solomonShake = Math.min(0.7, (this._sceneRef._solomonShake || 0) + trauma);
            }
        }

        _updateSummoningCircle(camX, camZ, delta, time) {
            this._circleMesh.position.set(camX, 520 * WORLD_SCALE, camZ);
            this._innerCircleMesh.position.set(camX, 515 * WORLD_SCALE, camZ);

            this._circleMesh.rotation.z += delta * 0.05;
            this._innerCircleMesh.rotation.z -= delta * 0.09;

            const baseScale = this._fade;
            const pulse = 1.0 + 0.03 * Math.sin(time * 3);
            this._circleMesh.scale.set(baseScale * pulse, baseScale * pulse, 1);
            this._innerCircleMesh.scale.set(baseScale * (1.0 - 0.02 * Math.sin(time * 4)), baseScale * (1.0 - 0.02 * Math.sin(time * 4)), 1);

            this._circleMat.opacity = this._fade * 0.96;
        }

        overrideSky(targetSky, targetFog, delta) {
            if (this._fade <= 0.001) return;
            if (!this._solomonSky) this._solomonSky = new THREE.Color(0x6a020a); // Blood crimson
            if (!this._solomonFog) this._solomonFog = new THREE.Color(0x380004); // Dark blood fog

            targetSky.lerp(this._solomonSky, this._fade * 0.96);
            targetFog.lerp(this._solomonFog, this._fade * 0.96);
        }

        update(camX, camY, camZ, delta, time, sceneRef) {
            this._sceneRef = sceneRef;
            this._time = time;

            // Fade intensity
            const targetFade = this._active ? 1.0 : 0.0;
            this._fade += (targetFade - this._fade) * Math.min(1, delta * (this._active ? 1.6 : 2.5));
            if (this._fade < 0.001) {
                this._fade = 0;
                if (!this._active && this._lances.length === 0 && this._crosses.length === 0) {
                    this._group.visible = false;
                    if (this._domOverlay) this._domOverlay.style.opacity = '0';
                    return;
                }
            }

            this._group.visible = true;

            // Screen crimson vignette
            if (this._domOverlay) {
                const pulse = 0.5 + 0.25 * Math.sin(time * 4);
                this._domOverlay.style.opacity = String((this._fade * pulse).toFixed(3));
            }

            // 1. Update Summoning Circle
            this._updateSummoningCircle(camX, camZ, delta, time);

            // 2. Spawn Lances while active
            if (this._active && this._fade > 0.35) {
                this._spawnTimer += delta;
                const SPAWN_INTERVAL = 0.09; // Continuous apocalyptic rain (~11 lances/sec)
                while (this._spawnTimer >= SPAWN_INTERVAL) {
                    this._spawnTimer -= SPAWN_INTERVAL;
                    this._spawnLance(camX, camZ);
                }
            }

            // 3. Update Lances
            for (let i = this._lances.length - 1; i >= 0; i--) {
                const l = this._lances[i];
                l.x += l.vx * delta;
                l.y += l.vy * delta;
                l.z += l.vz * delta;
                l.life += delta;

                l.mesh.position.set(l.x, l.y, l.z);
                const pulse = 1.0 + 0.35 * Math.sin(l.life * 28 + l.phase);
                l.mesh.scale.set(pulse, 1.0, pulse);

                const groundY = (this._terrain && this._terrain.field)
                    ? this._terrain.field.blockTopAt(l.x, l.z)
                    : 0;

                if (l.y <= groundY + 2 || l.y <= -30) {
                    this._triggerImpact(l.x, groundY, l.z, camX, camZ);
                    this._group.remove(l.mesh);
                    this._lances.splice(i, 1);
                }
            }

            // 4. Update Evangelion Cross Explosions
            for (let i = this._crosses.length - 1; i >= 0; i--) {
                const c = this._crosses[i];
                c.age += delta;

                if (c.age >= c.duration) {
                    this._group.remove(c.grp);
                    c.ring.material.dispose();
                    this._crosses.splice(i, 1);
                    continue;
                }

                // Eruption: vertical beam growth (0 - 0.12s)
                const vScale = Math.min(1.0, c.age / 0.12);
                c.pV1.scale.y = c.pV2.scale.y = vScale;

                // Horizontal crossbar expansion (0.06 - 0.20s)
                const hScale = Math.max(0, Math.min(1.0, (c.age - 0.06) / 0.14));
                c.pH1.scale.x = c.pH2.scale.x = hScale;

                // Center flare pulse
                const flareScale = (0.6 + 0.4 * Math.sin(c.age * 20)) * vScale;
                c.flare.scale.set(flareScale, flareScale, 1);

                // Expanding ground shockwave ring
                const ringScale = Math.min(60, c.age * 200);
                c.ring.scale.set(ringScale, ringScale, ringScale);
                c.ring.material.opacity = Math.max(0, 0.8 - (c.age / 0.8));

                // Pulsation & Ascension
                if (c.age > 1.2) {
                    const ascend = (c.age - 1.2) * 24;
                    c.grp.position.y = c.baseY + ascend;
                    const fadeOut = Math.max(0, (c.duration - c.age) / (c.duration - 1.2));
                    c.pV1.material.opacity = fadeOut * 0.95;
                    c.pH1.material.opacity = fadeOut * 0.95;
                } else {
                    const pulse = 1.0 + 0.06 * Math.sin(c.age * 25);
                    c.pV1.scale.x = c.pV2.scale.x = pulse;
                    c.pH1.scale.y = c.pH2.scale.y = pulse;
                }
            }
        }

        dispose() {
            this.setActive(false);
            for (const l of this._lances) this._group.remove(l.mesh);
            for (const c of this._crosses) {
                this._group.remove(c.grp);
                c.ring.material.dispose();
            }
            this._lances = [];
            this._crosses = [];

            this._scene.remove(this._group);
            this._circleTex.dispose();
            this._circleMat.dispose();
            this._lanceTex.dispose();
            this._lanceMat.dispose();
            this._crossTex.dispose();
            this._crossMat.dispose();
            this._lanceGeo.dispose();
            this._ringGeo.dispose();
            this._ringMat.dispose();

            if (this._domOverlay && this._domOverlay.parentNode) {
                this._domOverlay.parentNode.removeChild(this._domOverlay);
                this._domOverlay = null;
            }
        }
    }

    // =========================================================================
    // SpellFx, the game's own battle animations played out in this world
    // =========================================================================
    // An .efkefc is drawn by Effekseer, and Effekseer draws into whatever GL
    // context it was initialised on. The game's own context belongs to PIXI and
    // paints the canvas UNDER this world's overlay, so an animation played
    // through Sprite_Animation out here would go off behind a wall of voxels
    // and never be seen by anybody.
    //
    // So a SECOND Effekseer context is opened, on this world's own renderer.
    // The wasm runtime is already up (the game booted it), and a context is a
    // handful of buffers, so the whole cost of this is one init and one draw
    // call per burst. Placement is the engine's own trick, lifted straight out
    // of Sprite_Animation: the effect plays at the origin and the VIEWPORT is
    // moved to where the burst falls on screen, which is why an animation
    // authored for a battle line reads correctly over a first-person world.
    const SPELL_FX_VIEWPORT = 4096;   // the engine's own animation viewport size
    const SPELL_FX_REF_DIST = 160;    // the distance a burst is drawn at full size

    class SpellFx {
        constructor(renderer) {
            this._ctx = null;
            this._effects = new Map();   // url -> loaded effect
            this._live = [];             // { handle, anim, pos, frame, acc, end }
            this._proj = new THREE.Vector3();
            try {
                if (!window.effekseer || !window.effekseer.createContext) return;
                this._ctx = window.effekseer.createContext();
                this._ctx.init(renderer.getContext(),
                    { instanceMaxCount: 2000, squareMaxCount: 8000 });
                this._ctx.setRestorationOfStatesFlag(false);
            } catch (e) {
                this._ctx = null;   // no Effekseer out here; the world simply has no bursts
            }
        }

        ready() { return !!this._ctx; }

        // Play an Animations.json entry at a point in the world. An MV animation
        // (frames rather than an effect file) is not drawn out here: there is no
        // sprite-sheet pipeline in a 3D scene. True when something started.
        play(animationId, x, y, z) {
            if (!this._ctx || !(animationId > 0)) return false;
            const anim = (typeof $dataAnimations !== 'undefined') && $dataAnimations[animationId];
            if (!anim || !anim.effectName) return false;
            const url = 'effects/' + String(anim.effectName)
                .split('/').map(encodeURIComponent).join('/') + '.efkefc';
            const at = { x, y, z };
            const begin = (effect) => {
                if (!effect) return;
                let handle = null;
                try { handle = this._ctx.play(effect, 0, 0, 0); } catch (e) { return; }
                if (!handle) return;
                let end = 30;
                for (const t of (anim.soundTimings || []).concat(anim.flashTimings || [])) {
                    if (t.frame > end) end = t.frame;
                }
                this._live.push({ handle, anim, pos: at, frame: 0, acc: 0, end: end + 30 });
            };
            const cached = this._effects.get(url);
            if (cached) { begin(cached); return true; }
            try {
                const effect = this._ctx.loadEffect(url, 1,
                    () => begin(effect), () => { this._effects.delete(url); });
                this._effects.set(url, effect);
            } catch (e) { return false; }
            return true;
        }

        // Advance every burst and draw it, straight after the world has been
        // rendered and through the same camera it was rendered with.
        draw(renderer, camera, dt) {
            if (!this._ctx || this._live.length === 0) return;
            const gl = renderer.getContext();
            const glW = renderer.domElement.width, glH = renderer.domElement.height;
            const step = Math.min(0.05, dt);
            for (const fx of this._live) {
                fx.acc += step;
                while (fx.acc >= 1 / 60) {
                    fx.acc -= 1 / 60;
                    fx.frame++;
                    for (const t of (fx.anim.soundTimings || [])) {
                        if (t.frame === fx.frame && t.se && typeof AudioManager !== 'undefined') {
                            try { AudioManager.playSe(t.se); } catch (e) { /* silence, then */ }
                        }
                    }
                }
            }
            try { this._ctx.update(step * 60); } catch (e) { /* keep drawing regardless */ }

            const vw = SPELL_FX_VIEWPORT;
            const p = -(vw / glH);
            const half = Math.tan((camera.fov || 60) * Math.PI / 360);
            try {
                this._ctx.setProjectionMatrix([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, p, 0, 0, 0, 1]);
                this._ctx.setCameraMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1]);
                for (const fx of this._live) {
                    this._proj.set(fx.pos.x, fx.pos.y, fx.pos.z);
                    const dist = this._proj.distanceTo(camera.position);
                    this._proj.project(camera);
                    // Behind the eye, or well off the sides: nothing to draw.
                    if (this._proj.z > 1 || Math.abs(this._proj.x) > 2.5 ||
                        Math.abs(this._proj.y) > 2.5) continue;
                    const sx = (this._proj.x * 0.5 + 0.5) * glW;
                    const sy = (this._proj.y * 0.5 + 0.5) * glH;
                    // Screen space carries no depth, so the distance is put back
                    // by hand: a burst across the valley is small, one at the
                    // party's own feet fills the view.
                    const k = (SPELL_FX_REF_DIST / Math.max(20, dist)) / Math.max(0.2, half);
                    const s = ((fx.anim.scale || 100) / 100) *
                        Math.max(0.12, Math.min(3, k * 0.55));
                    const r = Math.PI / 180, rot = fx.anim.rotation || { x: 0, y: 0, z: 0 };
                    try {
                        fx.handle.setLocation(0, 0, 0);
                        fx.handle.setRotation(rot.x * r, rot.y * r, rot.z * r);
                        fx.handle.setScale(s, s, s);
                        fx.handle.setSpeed((fx.anim.speed || 100) / 100);
                    } catch (e) { /* the handle is gone; the sweep below drops it */ }
                    const ox = fx.anim.offsetX || 0, oy = fx.anim.offsetY || 0;
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    gl.viewport(ox - vw / 2 + sx, -oy - vw / 2 + sy, vw, vw);
                    this._ctx.beginDraw();
                    this._ctx.drawHandle(fx.handle);
                    this._ctx.endDraw();
                }
            } catch (e) {
                /* a malformed effect must never take the frame down with it */
            } finally {
                try { gl.viewport(0, 0, glW, glH); } catch (e) { /* nothing to put back */ }
                if (renderer.resetState) { try { renderer.resetState(); } catch (e) { /* ditto */ } }
            }

            // Retire whatever has burnt out.
            for (let i = this._live.length - 1; i >= 0; i--) {
                const fx = this._live[i];
                const alive = !!(fx.handle && fx.handle.exists);
                if ((!alive && fx.frame > fx.end) || fx.frame > fx.end + 300) {
                    this._live.splice(i, 1);
                }
            }
        }

        dispose() {
            if (!this._ctx) return;
            for (const fx of this._live) { try { fx.handle.stop(); } catch (e) { /* gone */ } }
            this._live = [];
            for (const effect of this._effects.values()) {
                try { this._ctx.releaseEffect(effect); } catch (e) { /* gone */ }
            }
            this._effects.clear();
            this._ctx = null;
        }
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        EngineAudio, SkyFx, SolomonRitualFx, SpellFx, UnderwaterFx, WaterPlane, WheelFx
    });
})();
