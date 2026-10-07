//=============================================================================
// 3D Battler System - Eris, Judgment of Discord (bespoke)
// Version: 2.5.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Dedicated, ultra-detailed bespoke model for enemy 1343
 * "Eris, Judgment of Discord" - a wasteland goddess of static and strife with
 * an actual human face, a seeded body she re-rolls between fights (skin from
 * porcelain to ebony to green, any hair colour in five hairstyles, her own
 * eyes and outfit), a slim gold circlet, a tailored jacket with a single gold
 * placket, textured cloth, leather, metal, skin and hair, arms properly joined
 * to the body, armoured shoulder pads, a short galaxy-painted cape hanging
 * behind her from a gold clasp, and a trailing wisp of consumed-order motes.
 * Replaces the earlier witch-rig / flowing-gown stand-ins. Requires
 * 3DBattlerSystem (core) + 3DBattler_Bosses.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Eris, Judgment of Discord
 * ============================================================================
 *
 * The ultimate boss Eris (Enemies.json id 1343) carries a forced
 * <Battler3D: eris> note tag. This family registers the `eris` archetype key
 * with its own dedicated, hand-built humanoid mesh and overrides any earlier
 * stand-in (this file loads AFTER 3DBattler_Bosses, so the last registration
 * of the key wins).
 *
 * Design:
 *   - A grounded humanoid figure (legs, hips, tapered jacket torso, gloved
 *     fists) instead of a towering gown, tailored rather than rigged: a nipped
 *     waist, shawl lapels, a single narrow gold placket with studs, a slim
 *     standing collar and a pendant on a fine chain. No crossed webbing.
 *   - Nothing is flat plastic: shared procedural canvas textures give the
 *     jacket a woven twill with stains, the leather a cracked grain, the gold
 *     a brushed and pitted finish, the skin pores and freckles, and the hair
 *     fine strands along every lock. Each map is painted near-white and reused
 *     as a roughness break-up, so the palette colours still come through.
 *   - A real face, not a mannequin: a skull built from a brow ridge, cheek
 *     bones, jaw and chin, a bridged nose, ears, a cupid's-bow mouth with a
 *     dark cavity behind it and human eyes set in real sockets (sclera,
 *     gold-amber iris with a limbal ring, pupil, catchlight, lashes and lids
 *     that blink on their own rhythm, squint under effort and screw shut when
 *     she laughs). Only a thin gaiter around the throat is left of her old
 *     rebreather, so nothing hides the face.
 *   - Five hairstyles, any of which she may be wearing: `tousled` (her own:
 *     crown spikes, two back layers, side locks), `long` (the restored mane,
 *     falling past the hips), `afro` (a globe of hair with the circlet worn
 *     outside it), `ponytail` (swept back into a gold tie) and `bob`. Each is
 *     a solid shell - crown cap plus a back piece with a window for the face -
 *     under 30 to 90 locks. Every lock is rooted on the scalp by _scalp() and
 *     aimed along the outward normal, so none of them can float off the head.
 *     Worn under a slim gold circlet with discreet ear cups and drop earrings
 *     (mapped to HORNS) - the old forehead sigil is gone.
 *   - window.ErisAppearance is the seeded wardrobe. A look (skin, hair colour
 *     and tips, eye colour, jacket/leather/metal and hairstyle) is rolled from
 *     the world gen seed + the battle number + how many times she has shifted,
 *     so one battle always replays exactly the same sequence of bodies. Her
 *     build never changes: proportions, rig and animation are the same woman
 *     underneath, and lips, blush, brows and lashes are mixed out of the rolled
 *     skin and hair so a green Eris never wears a human mouth.
 *       ErisAppearance.current() - the body she is standing in
 *       ErisAppearance.shift()   - wear the next one (a white-hot bloom, and
 *                                  never the same hairstyle twice running)
 *       ErisAppearance.lock()    - stop: she keeps this body but takes her own
 *                                  hair back, and fights in that shape
 *     TrialSystem.js drives it from the troop 1342 turn script: a shift on each
 *     of her first nine turns, then the lock on turn 10 when she stops healing
 *     and the real fight starts.
 *   - A short astral cape hanging BEHIND her from a gold collarbone clasp
 *     (two softly swaying segments, like a slow cloth-chain) painted with a
 *     procedural galaxy canvas texture - deep indigo, drifting gold/crimson
 *     nebula blooms and scattered stars. The cloth covers only the rear half
 *     of the figure, so the face, jacket front and arms are never behind it.
 *   - Armoured shoulder pauldrons (LEFT_WING / RIGHT_WING for dismemberment
 *     continuity with the Demon archetype) and a trailing wisp of orbiting
 *     gold motes and crimson discord shards (TAIL) - the "consumed order"
 *     she drags behind her.
 *   - Two-joint arms (shoulder + elbow), each shoulder set on a ball joint
 *     sunk into the torso so there is never a gap between arm and body.
 *     Every combat pose keeps the shoulder pitch well under horizontal and
 *     lets the elbow do the work, so a punch reads as a jab thrown from the
 *     chest rather than a stiff raised-arm salute. Summon/cast are the
 *     deliberate exception - arms lift high and wide, since that reads as
 *     channelling rather than saluting.
 *   - A varied idle: she rests, then grooves into a little dance, then
 *     breaks into a giggle, on a repeating cycle - alongside dedicated
 *     punch (attack), summon, cast, beam, slam and roar poses (the last five
 *     already dispatched generically by the core boss anim wiring).
 *   - Her form only glitches and destabilises once she is actually hurting:
 *     instability now reads the battler's current HP rate instead of the
 *     turn counter, and stays a perfectly clean render above ~40% HP.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Eris] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    // Palette: worn wasteland ivory-tan suit, dark leather rig, Maat-gold trim
    // and long radiant-gold hair, with crimson discord accents (the pendant,
    // the trailing shards). Hair colour drifts a little per enemy id.
    const E_PROFILE = {
        eris: {
            variant: 'eris', scale: 3.8, texturePool: 'metal',
            bodyColor: 0xcfc3a0,           // worn ivory-tan jacket
            suitDark: 0x2a241c,            // ribbed collar, gloves, boots, straps
            accent: 0xffd24a,              // Maat gold trim / headset
            hairColor: 0xf2c84b,           // radiant gold hair
            hairTip: 0xfff3c0,             // pale luminous tips
            discord: 0xc0233a,             // crimson pendant / discord shards
            skin: 0xf3ddc6,                // porcelain
            hue: [0.12, 0.04], sat: [0.55, 0.12], lit: [0.55, 0.10]
        }
    };

    // Low-HP instability starts under this fraction of max HP, ramps to full
    // as she nears death, and is exactly zero (a perfectly clean render)
    // above it.
    const INSTAB_HP_THRESHOLD = 0.4;

    // A lock is modelled growing along -Y, and the skull sits a touch above
    // the head group's origin: both are needed to root hair on the scalp.
    const STRAND_AXIS = new THREE.Vector3(0, -1, 0);
    const HEAD_CENTRE_Y = 0.02;

    //-------------------------------------------------------------------------
    // Shared procedural surface textures
    //-------------------------------------------------------------------------
    // Every map is painted near-white so the material's own colour still tints
    // it: they carry only weave, grain, brush marks, pores and wear. Cached
    // once for every Eris ever built, per repeat setting.
    const TEX_CACHE = {};
    const TEX_SIZE = { fabric: [256, 256], leather: [256, 256], metal: [128, 256], skin: [256, 256], hair: [64, 256] };
    const TEX_DRAW = {
        // Worn canvas twill: a fine weave, thread noise and old stains.
        fabric(ctx, w, h) {
            ctx.fillStyle = '#efeade'; ctx.fillRect(0, 0, w, h);
            for (let x = 0; x < w; x += 4) {
                ctx.strokeStyle = 'rgba(60,50,35,0.10)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
            }
            for (let y = 0; y < h; y += 4) {
                ctx.strokeStyle = 'rgba(255,252,240,0.16)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
            }
            for (let i = 0; i < 900; i++) {
                ctx.fillStyle = Math.random() < 0.5 ? 'rgba(70,60,45,0.09)' : 'rgba(255,255,245,0.12)';
                ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
            }
            for (let i = 0; i < 14; i++) {
                const x = Math.random() * w, y = Math.random() * h, r = 12 + Math.random() * 40;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, 'rgba(96,80,55,0.13)'); g.addColorStop(1, 'rgba(96,80,55,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
        },
        // Cracked leather: mottled cells, deep creases and a few pale scuffs.
        leather(ctx, w, h) {
            ctx.fillStyle = '#e9e4dc'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 260; i++) {
                const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 14;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, Math.random() < 0.55 ? 'rgba(40,32,24,0.16)' : 'rgba(255,255,250,0.14)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.strokeStyle = 'rgba(30,24,18,0.20)';
            for (let i = 0; i < 70; i++) {
                ctx.lineWidth = 0.5 + Math.random();
                let x = Math.random() * w, y = Math.random() * h;
                ctx.beginPath(); ctx.moveTo(x, y);
                for (let s = 0; s < 4; s++) { x += (Math.random() - 0.5) * 26; y += (Math.random() - 0.5) * 26; ctx.lineTo(x, y); }
                ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(255,255,250,0.18)'; ctx.lineWidth = 0.6;
            for (let i = 0; i < 18; i++) {
                const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); ctx.stroke();
            }
        },
        // Brushed, softly pitted metal for the gold trim.
        metal(ctx, w, h) {
            const g0 = ctx.createLinearGradient(0, 0, w, 0);
            g0.addColorStop(0, '#dcd6cc'); g0.addColorStop(0.35, '#fffdf6');
            g0.addColorStop(0.62, '#e6e0d4'); g0.addColorStop(1, '#f6f2e8');
            ctx.fillStyle = g0; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 700; i++) {
                ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(80,70,50,0.10)' : 'rgba(255,255,255,0.16)';
                ctx.lineWidth = 0.5 + Math.random();
                const x = Math.random() * w, y0 = Math.random() * h;
                ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + 10 + Math.random() * 60); ctx.stroke();
            }
            for (let i = 0; i < 20; i++) {
                ctx.fillStyle = 'rgba(50,42,30,0.22)';
                ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
            }
        },
        // Skin: soft warm mottling, fine pores and a scatter of freckles.
        skin(ctx, w, h) {
            ctx.fillStyle = '#fdf8f2'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 60; i++) {
                const x = Math.random() * w, y = Math.random() * h, r = 18 + Math.random() * 50;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, Math.random() < 0.5 ? 'rgba(214,150,130,0.10)' : 'rgba(255,255,255,0.12)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = 'rgba(190,150,130,0.07)';
            for (let i = 0; i < 1200; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
            ctx.fillStyle = 'rgba(160,110,80,0.15)';
            for (let i = 0; i < 40; i++) {
                ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 1.2, 0, Math.PI * 2); ctx.fill();
            }
        },
        // Hair: fine strands running the length of every lock.
        hair(ctx, w, h) {
            ctx.fillStyle = '#f4ecd8'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 220; i++) {
                ctx.strokeStyle = Math.random() < 0.45 ? 'rgba(120,90,30,0.18)' : 'rgba(255,255,240,0.22)';
                ctx.lineWidth = 0.5 + Math.random() * 1.8;
                const x = Math.random() * w, y0 = Math.random() * h;
                ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + (Math.random() - 0.5) * 3, y0 + 40 + Math.random() * 200); ctx.stroke();
            }
        }
    };

    function surfaceTex(key, rx, ry) {
        rx = rx || 1; ry = ry || 1;
        const ck = key + ':' + rx + 'x' + ry;
        if (TEX_CACHE[ck]) return TEX_CACHE[ck];
        if (!TEX_DRAW[key]) return null;
        let base = TEX_CACHE[key];
        if (!base) {
            const size = TEX_SIZE[key] || [256, 256];
            const cv = document.createElement('canvas');
            cv.width = size[0]; cv.height = size[1];
            TEX_DRAW[key](cv.getContext('2d'), size[0], size[1]);
            base = new THREE.CanvasTexture(cv);
            base.wrapS = base.wrapT = THREE.RepeatWrapping;
            TEX_CACHE[key] = base;
        }
        let tex = base;
        if (rx !== 1 || ry !== 1) {
            tex = base.clone();
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(rx, ry);
            tex.needsUpdate = true;
        }
        TEX_CACHE[ck] = tex;
        return tex;
    }

    //-------------------------------------------------------------------------
    // Seeded appearance: she is never twice the same woman
    //-------------------------------------------------------------------------
    // Eris wears a different body every battle. Skin, hair colour, eyes, outfit
    // and hairstyle are all rolled from (world seed + battle number + how many
    // times she has shifted so far), so a given battle always replays exactly
    // the same sequence of faces. Her build never changes: proportions, rig and
    // animation are the same woman underneath.
    const SKINS = [
        0xf6ddc8, 0xf0c9a4, 0xe3ab7f, 0xd49a6a, 0xc98d5f,   // porcelain -> tan
        0xa6673c, 0x8a5230, 0x6b3b20, 0x4e2c18,             // brown -> ebony
        0x9ac47a, 0x6f9f57                                  // and green, twice
    ];
    const HAIRS = [
        [0xf2c84b, 0xfff3c0],   // radiant gold
        [0xe8e4d6, 0xffffff],   // platinum
        [0x1b1b22, 0x4a4a5e],   // jet black
        [0x8c3a1e, 0xd07a45],   // auburn
        [0xd4652a, 0xffb070],   // copper
        [0x5a3a22, 0x9a6a3e],   // chestnut
        [0xb9bec7, 0xe9eef5],   // ash silver
        [0x6d1730, 0xc03a5a],   // wine
        [0x4a2a7a, 0xa07ae0],   // violet
        [0x1d5f5a, 0x63c8bd],   // teal
        [0xf2efe6, 0xfffdf4],   // white
        [0x1a2440, 0x556d9e]    // blue-black
    ];
    // [jacket, leather, metal trim]
    const OUTFITS = [
        [0xcfc3a0, 0x2a241c, 0xffd24a],   // worn ivory / dark leather / gold
        [0x3a3d44, 0x17181c, 0xd8dbe2],   // charcoal / black / silver
        [0x7c2230, 0x36121a, 0xffd24a],   // deep crimson / oxblood / gold
        [0x24304f, 0x141a2c, 0xc9a24a],   // midnight blue / navy / brass
        [0x2f4a33, 0x1c2a1e, 0xc98a3c],   // forest green / bark / bronze
        [0xe6e0d0, 0x4a4438, 0xe8e4ea],   // bone white / taupe / platinum
        [0x4a2f5e, 0x1e1428, 0xffd24a],   // plum / black / gold
        [0x9a5a24, 0x3a2412, 0xd2743a],   // rust ochre / brown / copper
        [0x545a62, 0x22262b, 0xa9b2bd]    // slate / iron / steel
    ];
    const EYE_COLORS = [0xffd24a, 0x4a7fd0, 0x4f9e5a, 0x8a6a4a, 0x9a6ad0, 0x6f8894, 0xc03a3a];
    const HAIR_STYLES = ['tousled', 'long', 'afro', 'ponytail', 'bob'];
    // Her own hair: what she goes back to when she stops shape-playing.
    const DEFAULT_HAIR_STYLE = 'tousled';

    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hashStr(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    function rollLook(seed, shift) {
        const s = (seed ^ Math.imul(shift + 1, 0x9E3779B1)) >>> 0;
        const r = mulberry32(s);
        const pick = arr => arr[Math.min(arr.length - 1, Math.floor(r() * arr.length))];
        const hair = pick(HAIRS), fit = pick(OUTFITS);
        return {
            seed: s, shift,
            skin: pick(SKINS),
            hair: hair[0], hairTip: hair[1],
            jacket: fit[0], leather: fit[1], metal: fit[2],
            eye: pick(EYE_COLORS),
            style: pick(HAIR_STYLES)
        };
    }

    // Every live Eris model, so a shift restyles whatever is on screen.
    const ERIS_LIVE = [];

    const ErisAppearance = {
        _shift: 0, _locked: false, _key: null, _worn: null,

        // Stable within one battle, different in the next one.
        _battleKey() {
            let gs = 0, bc = 0;
            try { gs = (window.Battler3D.genSeedHash && window.Battler3D.genSeedHash()) || 0; } catch (e) { gs = 0; }
            try { bc = (window.$gameSystem && $gameSystem.battleCount) ? $gameSystem.battleCount() : 0; } catch (e) { bc = 0; }
            return gs + ':' + bc;
        },
        _sync() {
            const k = this._battleKey();
            if (k !== this._key) { this._key = k; this._shift = 0; this._locked = false; this._worn = null; }
            return this._key;
        },
        seed() { return hashStr(this._sync()); },
        // The body she is standing in right now. Whatever is built mid-battle
        // (a re-entered scene, a second view of her) wears this same one.
        current() {
            this._sync();
            if (!this._worn) this._worn = rollLook(this.seed(), this._shift);
            return this._worn;
        },

        // One more turn of her playing dress-up with her own body.
        shift() {
            this._sync();
            if (this._locked) return this.current();
            const prev = this.current();
            this._shift++;
            const look = rollLook(this.seed(), this._shift);
            // Never wear the same head twice running: the point of the shift is
            // that they SEE her change. Still deterministic, still the same
            // sequence every time this battle is replayed.
            if (look.style === prev.style) {
                const i = HAIR_STYLES.indexOf(look.style);
                look.style = HAIR_STYLES[(i + 1 + (look.seed % (HAIR_STYLES.length - 1))) % HAIR_STYLES.length];
            }
            this._worn = look;
            this.apply(look, true);
            return look;
        },
        // She stops playing: she keeps the body she is standing in, but the
        // hair goes back to her own, and this is the face she fights in.
        lock() {
            this._sync();
            const p = E_PROFILE.eris;
            const look = Object.assign({}, this.current(), {
                hair: p.hairColor, hairTip: p.hairTip, style: DEFAULT_HAIR_STYLE
            });
            this._locked = true;
            this._worn = look;
            this.apply(look, true);
            return look;
        },
        isLocked() { return this._locked; },
        reset() { this._key = null; this._shift = 0; this._locked = false; this._worn = null; },

        apply(look, flash) {
            for (let i = ERIS_LIVE.length - 1; i >= 0; i--) {
                const inst = ERIS_LIVE[i];
                if (!inst.model || !inst.model.parent) { ERIS_LIVE.splice(i, 1); continue; }
                try { inst.applyLook(look, flash); } catch (e) { console.error('[3D Battler Eris] shift failed', e); }
            }
        },
        register(inst) {
            if (ERIS_LIVE.indexOf(inst) < 0) ERIS_LIVE.push(inst);
            while (ERIS_LIVE.length > 6) ERIS_LIVE.shift();
        },
        styles: HAIR_STYLES,
        roll: rollLook
    };
    window.ErisAppearance = ErisAppearance;

    class ErisBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = E_PROFILE.eris;
            super(scale, offsetY, battler, profile, 0, 'eris');
            this.variant = 'eris';
            this._materials = [];
            this._hair = [];        // [{ strand, pivots, phase, sway }]
            this._floaters = [];    // generic spinners (motes, shards)
            this._baseY = null;
            this._baseX = null;
            this.facingYaw = 0;     // front-on, like the bipedal bosses
            // A grounded humanoid now; only a faint chaos-levitation hover.
            this._rise = 0.08;
            // How badly her form is glitching apart this frame, driven by HP.
            this._instab = 0;
            this._jitterBases = null;
            this._irisMats = [];
            this._look = null;
            this._hairStyle = null;
            this._rng = null;       // the look's own PRNG, so a style is seeded
            this._shiftFx = 0;      // the bloom as one form gives way to the next
        }

        // Randomness for the current look. Seeded, so the same battle replays
        // the same sequence of faces; falls back to the per-id core stream.
        _rand() { return this._rng ? this._rng() : this.idRand(); }

        // Discord destabilisation factor from current HP: silent (0) above
        // INSTAB_HP_THRESHOLD, escalating as she nears death (capped so she
        // stays legible on screen).
        _lowLifeInstability() {
            let rate = 1;
            try {
                if (this.battler && typeof this.battler.hpRate === 'function') rate = this.battler.hpRate();
            } catch (e) { rate = 1; }
            if (!(rate >= 0) || rate >= INSTAB_HP_THRESHOLD) return 0;
            const f = 1 - (rate / INSTAB_HP_THRESHOLD); // 0 at threshold -> 1 at hp 0
            return Math.min(1.6, f * f * 1.6);
        }

        async load(physicsWorld) {
            this.physicsWorld = physicsWorld;
            this._build();
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            ErisAppearance.register(this);
            return this;
        }

        //---------------------------------------------------------------------
        // Material helpers
        //---------------------------------------------------------------------
        _mat(color, opts) {
            opts = opts || {};
            const m = new THREE.MeshStandardMaterial({
                color,
                roughness: opts.rough === undefined ? 0.65 : opts.rough,
                metalness: opts.metal === undefined ? 0.0 : opts.metal,
                emissive: new THREE.Color(opts.emissive || 0x000000),
                emissiveIntensity: opts.emissive ? (opts.glow === undefined ? 0.6 : opts.glow) : 0,
                transparent: true,
                opacity: opts.opacity === undefined ? 1.0 : opts.opacity,
                side: opts.side || THREE.FrontSide
            });
            if (opts.tex) {
                const rep = opts.rep || [1, 1];
                const map = surfaceTex(opts.tex, rep[0], rep[1]);
                if (map) {
                    m.map = map;
                    // The same greyscale detail doubles as a roughness break-up,
                    // so cloth, leather and metal stop reading as flat plastic.
                    if (opts.roughMap !== false) m.roughnessMap = map;
                    m.needsUpdate = true;
                }
            }
            if (opts.skin) this.applySkin(m);
            this._materials.push(m);
            return m;
        }

        //---------------------------------------------------------------------
        // Wearing a look
        //---------------------------------------------------------------------
        // Repaints every surface from a rolled look and, when the hairstyle is
        // a different one (or she is mid-shift), grows a whole new head of
        // hair. Nothing here touches geometry sizes or the rig: the woman
        // underneath keeps her proportions, she just stops being the same
        // person on the outside.
        applyLook(look, flash) {
            if (!look) look = rollLook(0, 0);
            const prevStyle = this._hairStyle;
            this._look = look;
            this._rng = mulberry32(look.seed);
            const C = hex => new THREE.Color(hex);
            const skin = C(look.skin);

            // Cloth, leather, metal.
            if (this.matSuit) this.matSuit.color.set(look.jacket);
            if (this.matSuitFine) this.matSuitFine.color.copy(C(look.jacket).multiplyScalar(1.08));
            if (this.matDark) this.matDark.color.set(look.leather);
            for (const m of [this.matTrim, this.matHalo]) {
                if (!m) continue;
                m.color.set(look.metal); m.emissive.set(look.metal);
            }
            // Skin, and every feature that has to agree with it - lips and
            // blush are mixed out of the skin itself, so a green Eris does not
            // end up wearing a pink human mouth.
            if (this.matSkin) this.matSkin.color.copy(skin);
            if (this.matSocket) this.matSocket.color.copy(skin.clone().multiplyScalar(0.84));
            if (this.matCheek) this.matCheek.color.copy(skin.clone().lerp(C(0xd0524a), 0.45));
            if (this.matLip) this.matLip.color.copy(skin.clone().lerp(C(0xb03a4a), 0.5));
            if (this.matLipLine) this.matLipLine.color.copy(skin.clone().lerp(C(0x7a2530), 0.65));
            // Hair, brows and lashes all come off the same dye.
            if (this.matHair) { this.matHair.color.set(look.hair); this.matHair.emissive.set(look.hair); }
            if (this.matHairTip) { this.matHairTip.color.set(look.hairTip); this.matHairTip.emissive.set(look.hairTip); }
            if (this.matBrow) this.matBrow.color.copy(C(look.hair).multiplyScalar(0.62));
            if (this.matLash) this.matLash.color.copy(C(look.hair).multiplyScalar(0.3));
            for (const m of this._irisMats) { m.color.set(look.eye); m.emissive.set(look.eye); }

            // The hairstyle. A shift always re-grows it, so even a repeated
            // style comes back parted differently.
            if (this.hairSpikes && (flash || prevStyle !== look.style)) {
                this._clearHair();
                this._growHair(look.style);
            }
            this._fitHeadsetToHair();
            if (flash) this._shiftFx = 1;
            return look;
        }

        // A big afro wears the circlet outside it instead of buried in it.
        _fitHeadsetToHair() {
            if (!this.headset) return;
            this.headset.scale.setScalar(this._hairStyle === 'afro' ? 1.34 : 1.0);
        }

        _clearHair() {
            this._hair.length = 0;
            for (const g of [this.hairSpikes, this.hairBack, this.fringe, this.sideLocks]) {
                if (!g) continue;
                for (let i = g.children.length - 1; i >= 0; i--) {
                    const c = g.children[i];
                    c.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
                    g.remove(c);
                }
            }
        }

        //---------------------------------------------------------------------
        // Build the whole figure
        //---------------------------------------------------------------------
        _build() {
            const p = this.profile;

            // Shared materials - every surface carries a woven, grained,
            // brushed or pored texture instead of a flat plastic colour.
            this.matSuit  = this._mat(p.bodyColor, { rough: 0.85, tex: 'fabric', rep: [4, 3] });
            this.matSuitFine = this._mat(p.bodyColor, { rough: 0.8, tex: 'fabric', rep: [2, 2] });
            this.matDark  = this._mat(p.suitDark, { rough: 0.75, tex: 'leather', rep: [3, 2] });
            this.matTrim  = this._mat(p.accent, { rough: 0.25, metal: 0.9, emissive: p.accent, glow: 0.55, skin: true, tex: 'metal', rep: [2, 1] });
            this.matSkin  = this._mat(p.skin, { rough: 0.45, tex: 'skin' });
            this.matHalo  = this._mat(p.accent, { rough: 0.2, metal: 0.85, emissive: p.accent, glow: 1.1, skin: true, tex: 'metal' });
            // Per-id hair colour drift makes each summoned Eris subtly unique.
            const hairCol = new THREE.Color(p.hairColor).lerp(this.color, 0.35);
            this.matHair  = this._mat(hairCol.getHex(), { rough: 0.35, metal: 0.45, emissive: p.hairColor, glow: 0.4, skin: true, tex: 'hair' });
            this.matHairTip = this._mat(p.hairTip, { rough: 0.3, metal: 0.3, emissive: p.hairTip, glow: 0.75, tex: 'hair' });
            this.matDiscord = this._mat(p.discord, { rough: 0.35, emissive: p.discord, glow: 0.85, tex: 'metal' });

            // This battle's body. Rolled before a single mesh is built, so the
            // hairstyle it picks is the one that actually gets grown below.
            this.applyLook(ErisAppearance.current(), false);

            // ── Legs + boots ───────────────────────────────────────────────────
            this.legs = [this._buildLeg(-1), this._buildLeg(1)];

            // ── Hips / belt ─────────────────────────────────────────────────────
            this.hips = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.275, 0.26, 18), this.matSuit);
            this.hips.position.y = 1.05; this.bodyGroup.add(this.hips);
            const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18), this.matTrim);
            belt.position.y = 1.2; this.bodyGroup.add(belt);
            // A slim oval clasp instead of a slab buckle.
            const buckle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), this.matHalo);
            buckle.scale.set(1.5, 0.9, 0.4); buckle.position.set(0, 1.2, 0.29); this.bodyGroup.add(buckle);

            // ── Torso: a long, high-waisted jacket nipped in at the waist ───────
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.265, 0.85, 18), this.matSuit);
            this.body.position.y = 1.65; this.bodyGroup.add(this.body);
            // The waist cinch that gives her a line instead of a barrel.
            const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.278, 0.288, 0.16, 18), this.matDark);
            waist.position.y = 1.31; this.bodyGroup.add(waist);
            const waistTrim = new THREE.Mesh(new THREE.TorusGeometry(0.286, 0.012, 6, 20), this.matTrim);
            waistTrim.rotation.x = Math.PI / 2; waistTrim.position.y = 1.39; this.bodyGroup.add(waistTrim);

            // A single narrow gold placket running down the breast, buttoned -
            // the crossed scavenger webbing is gone.
            const placket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.72, 0.02), this.matTrim);
            placket.position.set(0, 1.7, 0.322); placket.rotation.x = 0.11; this.bodyGroup.add(placket);
            for (let i = 0; i < 3; i++) {
                const y = 1.42 + i * 0.14;
                const stud = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), this.matHalo);
                stud.scale.set(1, 1, 0.6); stud.position.set(0, y, this._jacketZ(y) + 0.012); this.bodyGroup.add(stud);
            }
            // Shawl lapels sweeping from the collar out to the shoulders.
            for (const sx of [-1, 1]) {
                const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.5, 0.025), this.matSuitFine);
                lapel.position.set(sx * 0.115, 1.83, 0.308); lapel.rotation.set(0.08, 0, sx * 0.3);
                this.bodyGroup.add(lapel);
                const lapelTrim = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.5, 0.014), this.matTrim);
                lapelTrim.position.set(sx * 0.15, 1.83, 0.297); lapelTrim.rotation.set(0.08, 0, sx * 0.3);
                this.bodyGroup.add(lapelTrim);
            }

            // A slim standing collar with a single gold rim - a tailored line,
            // not the old stack of rebreather ribs.
            this.neckRibs = new THREE.Group();
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.185, 0.22, 18, 1, true), this.matSuitFine);
            collar.position.y = 2.11; this.neckRibs.add(collar);
            const collarRim = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.014, 6, 20), this.matTrim);
            collarRim.rotation.x = Math.PI / 2; collarRim.position.y = 2.21; this.neckRibs.add(collarRim);
            const collarBase = new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.02, 6, 20), this.matDark);
            collarBase.rotation.x = Math.PI / 2; collarBase.position.y = 2.0; this.neckRibs.add(collarBase);
            this.bodyGroup.add(this.neckRibs);

            // A pendant on a fine chain - the last ember of her divinity, worn
            // as jewellery instead of a floating sigil.
            for (const sx of [-1, 1]) {
                const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6), this.matTrim);
                chain.position.set(sx * 0.055, 1.97, 0.35); chain.rotation.z = sx * 0.28;
                this.bodyGroup.add(chain);
            }
            const setting = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 18), this.matHalo);
            setting.position.set(0, 1.85, 0.338); this.bodyGroup.add(setting);
            this.aura = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0),
                new THREE.MeshBasicMaterial({ color: p.discord, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
            this.aura.position.set(0, 1.85, 0.352); this.bodyGroup.add(this.aura);

            // ── Shoulder pauldrons (LEFT_WING / RIGHT_WING) ─────────────────────
            this.leftPad = this._buildShoulderPad(-1);
            this.rightPad = this._buildShoulderPad(1);

            // ── Arms (gloved fists, resting at her sides) ───────────────────────
            this.leftArm = this._buildArm(-1);
            this.rightArm = this._buildArm(1);

            // ── Head + face - a person, not a mannequin ─────────────────────────
            this.head = new THREE.Group();
            const matLip = this.matLip = this._mat(0xc4695f, { rough: 0.42, tex: 'skin' });
            const matLipLine = this.matLipLine = this._mat(0x8d4a44, { rough: 0.6 });
            const matLash = this.matLash = this._mat(0x2b1d12, { rough: 0.6 });
            const matBrow = this.matBrow = this._mat(0x8a6224, { rough: 0.7, tex: 'hair' });
            const matSclera = this._mat(0xfbf5ea, { rough: 0.25 });
            const matSocket = this.matSocket = this._mat(0xdcb7a2, { rough: 0.7, tex: 'skin' });
            const matPupil = this._mat(0x120c07, { rough: 0.35 });
            const matCavity = this._mat(0x3a1418, { rough: 0.9 });

            // Cranium, brow ridge, cheekbones, jaw and chin blended into one
            // soft skull instead of a bare ovoid.
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 26), this.matSkin);
            skull.scale.set(0.87, 1.0, 0.93); skull.position.y = 0.02; this.head.add(skull);
            const browRidge = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), this.matSkin);
            browRidge.scale.set(1.0, 0.42, 0.62); browRidge.position.set(0, 0.075, 0.115); this.head.add(browRidge);
            const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), this.matSkin);
            jaw.scale.set(0.82, 0.66, 0.8); jaw.position.set(0, -0.13, 0.015); this.head.add(jaw);
            const chin = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), this.matSkin);
            chin.scale.set(1.0, 0.85, 0.9); chin.position.set(0, -0.21, 0.11); this.head.add(chin);
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.2, 14), this.matSkin);
            neck.position.y = -0.28; this.head.add(neck);
            for (const sx of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), this.matSkin);
                ear.scale.set(0.45, 1.0, 0.72); ear.position.set(sx * 0.225, -0.03, 0.0); this.head.add(ear);
                const cheekBone = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), this.matSkin);
                cheekBone.scale.set(0.9, 0.62, 0.6); cheekBone.position.set(sx * 0.125, -0.045, 0.15); this.head.add(cheekBone);
            }

            // Nose: a bridge running down off the brow into a soft tip with wings.
            const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 0.12, 8), this.matSkin);
            bridge.position.set(0, 0.015, 0.222); bridge.rotation.x = -0.16; this.head.add(bridge);
            const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), this.matSkin);
            noseTip.scale.set(1.0, 0.85, 1.05); noseTip.position.set(0, -0.048, 0.243); this.head.add(noseTip);
            for (const sx of [-1, 1]) {
                const wing = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), this.matSkin);
                wing.scale.set(0.9, 0.8, 1.0); wing.position.set(sx * 0.029, -0.052, 0.228); this.head.add(wing);
            }

            // Mouth: a cupid's-bow upper lip, a fuller lower lip and a dark
            // cavity behind them, so she can open her mouth to shout or laugh.
            this.mouth = new THREE.Group();
            this.mouth.position.set(0, -0.125, 0.2);
            this.mouthCavity = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), matCavity);
            this.mouthCavity.scale.set(0.82, 0.12, 0.34); this.mouthCavity.position.set(0, -0.004, 0.012);
            this.mouth.add(this.mouthCavity);
            this.mouthUpper = new THREE.Group();
            for (const sx of [-1, 1]) {
                const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), matLip);
                lobe.scale.set(1.25, 0.5, 0.55); lobe.position.set(sx * 0.021, 0.014, 0.03); this.mouthUpper.add(lobe);
            }
            this.mouth.add(this.mouthUpper);
            this.mouthLower = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), matLip);
            this.mouthLower.scale.set(1.12, 0.5, 0.6); this.mouthLower.position.set(0, -0.022, 0.028);
            this.mouth.add(this.mouthLower);
            const lipLine = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.006, 0.012), matLipLine);
            lipLine.position.set(0, -0.003, 0.04); this.mouth.add(lipLine);
            this.head.add(this.mouth);

            // Blush high on the cheeks, barely there.
            const cheekMat = this.matCheek = this._mat(0xe4a99a, { rough: 0.6, opacity: 0.4, tex: 'skin' });
            for (const sx of [-1, 1]) {
                const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), cheekMat);
                cheek.scale.set(1.05, 0.6, 0.32); cheek.position.set(sx * 0.135, -0.055, 0.185); this.head.add(cheek);
            }

            // Human eyes set into real sockets: sclera, gold-amber iris with a
            // darker limbal ring, pupil, a catchlight and lids that blink.
            this.eyes = [];
            this._lids = [];
            this._blinkOff = this.idRand() * 4;
            for (const sx of [-1, 1]) {
                const socket = new THREE.Group();
                socket.position.set(sx * 0.103, 0.012, 0.175);
                socket.rotation.y = sx * 0.2;   // eyes sit on the curve of the skull

                const hollow = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), matSocket);
                hollow.scale.set(1.05, 0.82, 0.4); hollow.position.z = 0.004; socket.add(hollow);
                const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.052, 18, 16), matSclera);
                eyeball.scale.set(1.0, 0.92, 0.9); socket.add(eyeball);
                const irisMat = this._mat(p.accent, { rough: 0.2, emissive: p.accent, glow: 0.35 });
                this._irisMats.push(irisMat);
                const iris = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 14), irisMat);
                iris.scale.set(1, 1, 0.55); iris.position.z = 0.036; socket.add(iris);
                const limbal = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 18), this._mat(0x7a4a12, { rough: 0.4 }));
                limbal.position.z = 0.04; socket.add(limbal);
                const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), matPupil);
                pupil.scale.set(1, 1, 0.5); pupil.position.z = 0.048; socket.add(pupil);
                const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
                glint.position.set(-0.013, 0.015, 0.05); socket.add(glint);

                // Lids are real spherical caps sweeping over the eyeball.
                const upperLid = new THREE.Mesh(new THREE.SphereGeometry(0.056, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), this.matSkin);
                upperLid.rotation.x = -0.3; socket.add(upperLid);
                const lash = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.0065, 6, 22, Math.PI), matLash);
                lash.rotation.x = Math.PI / 2; lash.position.y = -0.009; upperLid.add(lash);
                const lowerLid = new THREE.Mesh(new THREE.SphereGeometry(0.056, 18, 12, 0, Math.PI * 2, Math.PI * 0.46, Math.PI * 0.54), this.matSkin);
                lowerLid.rotation.x = 0.26; socket.add(lowerLid);

                this.head.add(socket);
                this.eyes.push(iris); // action poses flare the iris, not a bare lens
                this._lids.push({ up: upperLid, low: lowerLid, upOpen: -0.3, upShut: 1.08, lowOpen: 0.26, lowShut: -0.82 });
            }
            // Brows drawn as a tapering arc of segments following the ridge.
            for (const sx of [-1, 1]) {
                for (let i = 0; i < 4; i++) {
                    const f = i / 3;
                    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.017 - f * 0.005, 0.022), matBrow);
                    seg.position.set(sx * (0.048 + i * 0.028), 0.082 + Math.sin(f * Math.PI) * 0.012 - f * 0.014, 0.222 - i * 0.013);
                    seg.rotation.z = -sx * (0.06 + f * 0.28);
                    this.head.add(seg);
                }
            }

            // A thin gaiter pulled down around the throat, not the face - the
            // only nod left to her old rebreather, kept low so she reads human.
            this.mask = new THREE.Group();
            const gaiter = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.035, 8, 16), this.matDark);
            gaiter.rotation.x = Math.PI / 2; gaiter.position.set(0, -0.34, 0.01); this.mask.add(gaiter);
            this.head.add(this.mask);

            // Headset worn as jewellery: a slim gold circlet over the hair and
            // a discreet cup at each ear. No forehead sigil. Mapped to HORNS.
            this.headset = new THREE.Group();
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.288, 0.013, 8, 24, Math.PI * 1.15), this.matTrim);
            band.rotation.z = Math.PI * 0.92; band.position.y = 0.05; this.headset.add(band);
            const bandInner = new THREE.Mesh(new THREE.TorusGeometry(0.288, 0.006, 6, 24, Math.PI * 1.15), this.matHalo);
            bandInner.rotation.z = Math.PI * 0.92; bandInner.position.set(0, 0.09, 0); this.headset.add(bandInner);
            for (const sx of [-1, 1]) {
                const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.04, 14), this.matDark);
                cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.265, -0.03, 0.005); this.headset.add(cup);
                const cupRim = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.009, 6, 16), this.matTrim);
                cupRim.rotation.y = Math.PI / 2; cupRim.position.set(sx * 0.286, -0.03, 0.005); this.headset.add(cupRim);
                // A small drop earring under each cup.
                const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), this.matHalo);
                drop.scale.set(0.7, 1.4, 0.7); drop.position.set(sx * 0.24, -0.115, 0.01); this.headset.add(drop);
            }
            this.head.add(this.headset);

            this.head.position.set(0, 2.35, 0);
            this.bodyGroup.add(this.head);

            // ── A full head of tousled golden hair (rides with the head) ────────
            this.hairSpikes = new THREE.Group();
            this.hairBack = new THREE.Group();
            this.fringe = new THREE.Group();
            this.sideLocks = new THREE.Group();
            this.head.add(this.hairSpikes, this.hairBack, this.fringe, this.sideLocks);
            this._growHair(this._look && this._look.style);
            this._fitHeadsetToHair();

            // ── Trailing wisp of consumed order (TAIL) + ambient motes/shards ──
            this._buildTail();
            this._buildAmbientFX();

            // ── Short astral cape, hanging behind her from a gold clasp ────────
            this._buildRobe();

            // Body-part -> mesh map + dismemberment cascade (Demon archetype).
            this._partMeshMap = {
                HEAD: this.head, SKULL: this.head, FACE: this.head, EYES: this.head,
                HORNS: this.headset,
                TORSO: this.body, BODY: this.body, CORE: this.body,
                LEFT_WING: this.leftPad, RIGHT_WING: this.rightPad, TAIL: this.tail,
                LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm
            };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE'], hide: [this.body, this.hips, this.head, this.leftArm, this.rightArm, this.leftPad, this.rightPad, this.legs[0], this.legs[1], this.tail, this.robeAnchor] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head] },
                { gone: ['HORNS'], hide: [this.headset] },
                { gone: ['LEFT_WING'], hide: [this.leftPad] },
                { gone: ['RIGHT_WING'], hide: [this.rightPad] },
                { gone: ['TAIL'], hide: [this.tail] }
            ];
        }

        _buildLeg(side) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.115, 0.52, 10), this.matSuit);
            thigh.position.y = -0.26; g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.46, 10), this.matDark);
            shin.position.y = -0.72; g.add(shin);
            const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.28), this.matDark);
            boot.position.set(0, -1.0, 0.05); g.add(boot);
            for (const cy of [-0.03, -0.56]) {
                const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 12), this.matTrim);
                cuff.position.y = cy; cuff.rotation.x = Math.PI / 2; g.add(cuff);
            }
            g.position.set(side * 0.19, 1.05, 0);
            g._side = side; g._restZ = 0; g._restX = 0;
            this.bodyGroup.add(g);
            return g;
        }

        _buildShoulderPad(side) {
            const g = new THREE.Group();
            const pad = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), this.matDark);
            pad.rotation.x = Math.PI; g.add(pad);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 6, 16), this.matTrim);
            rim.rotation.x = Math.PI / 2; rim.position.y = -0.02; g.add(rim);
            const loop = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.013, 6, 10), this.matTrim);
            loop.position.set(0, -0.15, 0.15); loop.rotation.y = Math.PI / 2; g.add(loop);
            g.position.set(side * 0.37, 2.06, -0.02);
            this.bodyGroup.add(g);
            return g;
        }

        // Two-joint arm (shoulder + elbow) ending in a gloved fist, hanging
        // naturally at her side with a relaxed elbow bend - a real jab bends
        // and extends at the elbow instead of the whole limb snapping up like
        // a salute.
        _buildArm(side) {
            const shoulder = new THREE.Group();
            // A ball joint sunk into the torso surface, so there is never a gap
            // between her body and the arm no matter how it swings.
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), this.matSuit);
            shoulder.add(ball);
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.5, 12), this.matSuit);
            upper.position.y = -0.25; shoulder.add(upper);
            const shoulderCuff = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.02, 6, 14), this.matTrim);
            shoulderCuff.position.y = -0.01; shoulderCuff.rotation.x = Math.PI / 2; shoulder.add(shoulderCuff);

            const elbow = new THREE.Group();
            elbow.position.y = -0.5;
            shoulder.add(elbow);

            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.46, 12), this.matDark);
            fore.position.y = -0.23; elbow.add(fore);
            for (const cy of [-0.02, -0.44]) {
                const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 14), this.matTrim);
                cuff.position.y = cy; cuff.rotation.x = Math.PI / 2; elbow.add(cuff);
            }
            const fist = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), this.matDark);
            fist.scale.set(1.0, 0.9, 1.05); fist.position.y = -0.5; elbow.add(fist);
            for (let f = 0; f < 4; f++) {
                const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), this.matDark);
                knuckle.position.set((f - 1.5) * 0.032, -0.43, 0.06); elbow.add(knuckle);
            }
            elbow._hand = fist;
            elbow._rest = 0.35; // relaxed bend at rest, not ramrod straight
            elbow.rotation.x = elbow._rest;

            shoulder.position.set(side * 0.36, 2.0, 0.0);
            shoulder.rotation.z = side * 0.05;
            shoulder.rotation.x = 0.03;
            shoulder._side = side;
            shoulder._restZ = shoulder.rotation.z;
            shoulder._restX = shoulder.rotation.x;
            shoulder._elbow = elbow;
            this.bodyGroup.add(shoulder);
            return shoulder;
        }

        // One segmented hair lock: a tapering chain that flicks with a
        // travelling sine wave, so a whole tousled clump reads as alive. It is
        // aimed by a direction vector rather than raw euler angles, which is
        // what keeps every lock growing outward from the scalp it is rooted in.
        _strand(reservoir, root, dir, len, segs, thick, tipFade) {
            const strand = new THREE.Group();
            let joint = strand;
            const segLen = len / segs;
            for (let s = 0; s < segs; s++) {
                const f = s / segs;
                const r0 = thick * (1 - f * 0.6);
                const r1 = thick * (1 - (f + 1 / segs) * 0.6);
                const mat = (tipFade && f > 0.6) ? this.matHairTip : this.matHair;
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(r1, 0.006), Math.max(r0, 0.008), segLen, 6), mat);
                seg.position.y = -segLen / 2;
                const pivot = new THREE.Group();
                pivot.position.y = (s === 0) ? 0 : -segLen;
                pivot.add(seg);
                pivot._rest = 0;
                joint.add(pivot);
                joint = pivot;
            }
            strand.position.copy(root);
            strand.quaternion.setFromUnitVectors(STRAND_AXIS, dir.clone().normalize());
            reservoir.add(strand);
            return strand;
        }

        // How far forward the jacket's front surface sits at a given height -
        // the torso is a taper, so trim glued at a fixed z would float off it.
        _jacketZ(y) {
            return 0.265 + 0.1059 * Math.max(0, Math.min(0.85, y - 1.225));
        }

        // A point on the hair shell: theta is the polar angle down from the
        // crown, phi the azimuth measured from her face (+Z). Every lock roots
        // through this, so none of them can float off the head.
        _scalp(theta, phi, r) {
            r = (r === undefined) ? 0.268 : r;
            const s = Math.sin(theta);
            return new THREE.Vector3(r * s * Math.sin(phi) * 0.9, HEAD_CENTRE_Y + r * Math.cos(theta) * 1.02, r * s * Math.cos(phi) * 0.96);
        }

        _registerStrand(strand, phase, sway) {
            const pivots = [];
            strand.traverse(o => { if (o._rest !== undefined) pivots.push(o); });
            this._hair.push({ strand, pivots, phase: phase * 6.28, sway });
        }

        // Grow a whole head of hair in one of her styles. Every lock is rooted
        // on the scalp shell and aimed along the outward normal, so no style
        // can leave strands floating beside her head.
        _growHair(style) {
            style = style || (this._look && this._look.style) || 'tousled';
            this._hairStyle = style;
            const rnd = () => this._rand();
            const centre = new THREE.Vector3(0, HEAD_CENTRE_Y, 0);
            const UP = new THREE.Vector3(0, 1, 0);
            const DOWN = new THREE.Vector3(0, -1, 0);
            const BACK_DOWN = new THREE.Vector3(0, -0.86, -0.5).normalize();
            const FORWARD_DOWN = new THREE.Vector3(0, -0.78, 0.62).normalize();

            // One lock. theta = polar angle down from the crown, phi = azimuth
            // measured from her face, comb = the direction it is brushed toward.
            const grow = (group, theta, phi, comb, combW, len, segs, thick, sway, rootR) => {
                const root = this._scalp(theta, phi, rootR);
                const dir = root.clone().sub(centre).normalize();
                if (comb) dir.lerp(comb, combW).normalize();
                dir.x += (rnd() - 0.5) * 0.22; dir.z += (rnd() - 0.5) * 0.22;
                const st = this._strand(group, root, dir, len, segs, thick, true);
                this._registerStrand(st, rnd() * 6.28, sway);
            };
            // The solid shell the locks grow out of, so no scalp shows through.
            // A cap closes the crown; the back piece leaves a window for the
            // face, `gap` turns of PI wide on either side of it.
            const capMesh = (r, thetaTurns, sx, sy, sz) => {
                const m = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 14, 0, Math.PI * 2, 0, Math.PI * thetaTurns), this.matHair);
                m.scale.set(sx, sy, sz); m.position.y = HEAD_CENTRE_Y; this.hairBack.add(m); return m;
            };
            const backMesh = (r, thetaTurns, gap, sx, sy, sz, dy, dz) => {
                const g = Math.PI * gap;
                const m = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 20, Math.PI * 0.5 + g, Math.PI * 2 - 2 * g, 0, Math.PI * thetaTurns), this.matHair);
                m.scale.set(sx, sy, sz); m.position.set(0, HEAD_CENTRE_Y + (dy || 0), dz || 0);
                this.hairBack.add(m); return m;
            };
            const lump = (theta, phi, r, rootR) => {
                const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), this.matHair);
                m.position.copy(this._scalp(theta, phi, rootR)); this.hairBack.add(m); return m;
            };
            const growFringe = (n, spread, len, thick) => {
                for (let i = 0; i < n; i++) {
                    grow(this.fringe, 0.5 + rnd() * 0.34, (rnd() - 0.5) * spread, FORWARD_DOWN,
                         0.55 + rnd() * 0.25, len + rnd() * 0.1, 2, thick, 0.12);
                }
            };

            if (style === 'long') {
                // The old mane, restored: a veil of hair falling past the hips.
                capMesh(0.278, 0.42, 0.9, 1.02, 0.96);
                backMesh(0.29, 0.95, 0.2, 0.92, 1.05, 1.0, -0.02, -0.02);
                for (let i = 0; i < 22; i++) {
                    grow(this.hairBack, 0.9 + rnd() * 1.2, Math.PI + (rnd() - 0.5) * 2.2, DOWN,
                         0.85, 1.0 + rnd() * 0.75, 6, 0.05, 0.17 + rnd() * 0.08);
                }
                for (const side of [-1, 1]) {
                    for (let i = 0; i < 7; i++) {
                        const phi = side * (Math.PI * 0.42 + rnd() * Math.PI * 0.3);
                        grow(this.sideLocks, 1.0 + rnd() * 0.7, phi, DOWN, 0.8, 0.75 + rnd() * 0.5, 5, 0.045, 0.16 + rnd() * 0.06);
                    }
                }
                for (let i = 0; i < 8; i++) {
                    grow(this.hairSpikes, 0.2 + rnd() * 0.4, rnd() * Math.PI * 2, UP, 0.3, 0.2 + rnd() * 0.12, 2, 0.035, 0.13);
                }
                growFringe(12, 1.6, 0.18, 0.034);

            } else if (style === 'afro') {
                // A globe of hair: a hairline hugging the skull, a puffed cloud
                // around and behind it, and a fuzz of short tufts all over.
                capMesh(0.288, 0.4, 0.92, 1.0, 0.96);
                backMesh(0.365, 0.8, 0.28, 1.02, 1.0, 1.0, 0.01, -0.03);
                for (let i = 0; i < 12; i++) {
                    const phi = 0.28 * Math.PI + rnd() * (Math.PI * 2 - 0.56 * Math.PI);
                    lump(0.25 + rnd() * 1.2, phi, 0.1 + rnd() * 0.06, 0.345);
                }
                for (let i = 0; i < 46; i++) {
                    const phi = 0.26 * Math.PI + rnd() * (Math.PI * 2 - 0.52 * Math.PI);
                    grow(this.hairSpikes, 0.14 + rnd() * 1.35, phi, null, 0,
                         0.1 + rnd() * 0.09, 2, 0.045, 0.07 + rnd() * 0.04, 0.35);
                }
                growFringe(6, 1.0, 0.1, 0.04);

            } else if (style === 'ponytail') {
                // Swept back tight and gathered at the nape with a gold tie.
                capMesh(0.276, 0.44, 0.9, 1.0, 0.96);
                backMesh(0.278, 0.62, 0.2, 0.9, 1.0, 0.95, 0, -0.015);
                const tie = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.018, 8, 16), this.matTrim);
                tie.position.copy(this._scalp(1.2, Math.PI, 0.28)); tie.rotation.x = Math.PI / 2;
                this.hairBack.add(tie);
                grow(this.hairBack, 1.2, Math.PI, BACK_DOWN, 0.75, 0.95, 7, 0.085, 0.2);
                for (let i = 0; i < 10; i++) {
                    grow(this.hairBack, 1.1 + rnd() * 0.25, Math.PI + (rnd() - 0.5) * 0.5, BACK_DOWN,
                         0.7 + rnd() * 0.15, 0.7 + rnd() * 0.4, 6, 0.045, 0.18 + rnd() * 0.07);
                }
                for (const side of [-1, 1]) {
                    for (let i = 0; i < 3; i++) {
                        grow(this.sideLocks, 0.75 + rnd() * 0.35, side * (Math.PI * 0.28 + rnd() * 0.25), DOWN,
                             0.7, 0.3 + rnd() * 0.16, 3, 0.03, 0.14);
                    }
                }
                growFringe(12, 1.5, 0.16, 0.032);

            } else if (style === 'bob') {
                // Blunt, jaw length, under a straight fringe.
                capMesh(0.28, 0.44, 0.9, 1.0, 0.96);
                backMesh(0.288, 0.78, 0.2, 0.94, 0.94, 1.0, -0.02, -0.015);
                for (let i = 0; i < 30; i++) {
                    const phi = 0.2 * Math.PI + rnd() * (Math.PI * 2 - 0.4 * Math.PI);
                    grow(this.hairBack, 1.05 + rnd() * 0.65, phi, DOWN, 0.78, 0.22 + rnd() * 0.1, 2, 0.04, 0.1 + rnd() * 0.05);
                }
                growFringe(14, 1.5, 0.16, 0.036);

            } else {
                // tousled - her own hair: crown spikes, two back layers, side locks.
                capMesh(0.278, 0.42, 0.9, 1.02, 0.96);
                backMesh(0.282, 0.82, 0.22, 0.92, 1.0, 0.98, -0.01, -0.012);
                const nape = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 16), this.matHair);
                nape.scale.set(1.0, 1.5, 0.85); nape.position.set(0, -0.3, -0.13); this.hairBack.add(nape);
                const rings = [14, 11, 8];
                for (let ring = 0; ring < rings.length; ring++) {
                    for (let i = 0; i < rings[ring]; i++) {
                        const theta = 0.12 + ring * 0.27 + (rnd() - 0.5) * 0.12;
                        const phi = (i / rings[ring]) * Math.PI * 2 + rnd() * 0.35 + ring * 0.4;
                        grow(this.hairSpikes, theta, phi, UP, 0.45 - ring * 0.12, 0.26 + rnd() * 0.2, 3, 0.04, 0.16 + rnd() * 0.08);
                    }
                }
                for (let i = 0; i < 20; i++) {
                    grow(this.hairBack, 0.75 + rnd() * 1.15, Math.PI + (rnd() - 0.5) * 2.0, DOWN,
                         0.55 + rnd() * 0.3, 0.36 + rnd() * 0.3, 3, 0.04, 0.15 + rnd() * 0.07);
                }
                for (let i = 0; i < 8; i++) {
                    grow(this.hairBack, 1.95 + rnd() * 0.45, Math.PI + (rnd() - 0.5) * 1.4, DOWN,
                         0.8, 0.45 + rnd() * 0.3, 3, 0.037, 0.13 + rnd() * 0.06);
                }
                for (const side of [-1, 1]) {
                    for (let i = 0; i < 8; i++) {
                        grow(this.sideLocks, 0.85 + rnd() * 0.8, side * (Math.PI / 2 + (rnd() - 0.5) * 0.75), DOWN,
                             0.6 + rnd() * 0.25, 0.22 + rnd() * 0.2, 2, 0.032, 0.14);
                    }
                }
                growFringe(13, 1.6, 0.18, 0.034);
            }
        }

        // A wisp of consumed order trailing from her lower back - crimson
        // shards and gold flecks streaming behind, dismemberment-mapped TAIL.
        _buildTail() {
            const rnd = () => this.idRand();
            this.tail = new THREE.Group();
            this._tailStreaks = [];
            for (let i = 0; i < 6; i++) {
                const t0 = i / 5;
                const streak = new THREE.Mesh(new THREE.ConeGeometry(0.05 - t0 * 0.02, 0.3 + t0 * 0.12, 6), (i % 2) ? this.matDiscord : this.matHalo);
                streak.position.set((rnd() - 0.5) * 0.14, 1.35 - t0 * 0.18, -0.22 - t0 * 0.22);
                streak.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.4);
                this.tail.add(streak);
                this._tailStreaks.push({ mesh: streak, phase: rnd() * 6.28, baseZ: streak.position.z });
            }
            this.bodyGroup.add(this.tail);
        }

        // Small ambient FX not tied to any dismemberable part: gold data-motes
        // and crimson discord shards drifting around her hands and hips.
        _buildAmbientFX() {
            const rnd = () => this.idRand();
            this.motes = new THREE.Group();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const r = 0.55 + (i % 3) * 0.09;
                const mo = new THREE.Mesh(new THREE.SphereGeometry(0.035 + (i % 2) * 0.015, 8, 8), this.matHairTip);
                mo.position.set(Math.cos(a) * r, 1.6 + Math.sin(a * 2) * 0.3, Math.sin(a) * r);
                this.motes.add(mo);
            }
            this.bodyGroup.add(this.motes);
            this._floaters.push({ obj: this.motes, axis: 'y', speed: 0.5 });

            this.shards = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const r = 0.7 + (i % 2) * 0.14;
                const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + (i % 3) * 0.018, 0), this.matDiscord);
                sh.position.set(Math.cos(a) * r, 1.5 + Math.cos(a * 3) * 0.25, Math.sin(a) * r);
                sh.rotation.set(a, a * 1.3, 0);
                sh._spin = 0.6 + (i % 4) * 0.3;
                this.shards.add(sh);
            }
            this.bodyGroup.add(this.shards);
            this._floaters.push({ obj: this.shards, axis: 'y', speed: -0.32 });
        }

        // A 256x512 canvas of deep-space indigo, drifting crimson/gold nebula
        // blooms and scattered stars - shared across every Eris instance since
        // it is pure backdrop art, not a per-id identity marker.
        _buildGalaxyTexture() {
            if (ErisBattler3D._galaxyTex) return ErisBattler3D._galaxyTex;
            const cv = document.createElement('canvas');
            cv.width = 256; cv.height = 512;
            const ctx = cv.getContext('2d');
            const bg = ctx.createLinearGradient(0, 0, 0, cv.height);
            bg.addColorStop(0, '#150a24'); bg.addColorStop(0.5, '#1e1036'); bg.addColorStop(1, '#0a0714');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);

            ctx.globalCompositeOperation = 'lighter';
            const blobs = ['#c0233a', '#ffd24a', '#8a3fe0', '#f2c84b'];
            for (let i = 0; i < 14; i++) {
                const x = Math.random() * cv.width, y = Math.random() * cv.height, r = 40 + Math.random() * 90;
                const col = blobs[i % blobs.length];
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, col + '66'); g.addColorStop(1, col + '00');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
            for (let i = 0; i < 260; i++) {
                const x = Math.random() * cv.width, y = Math.random() * cv.height, s = Math.random() * 1.5 + 0.2;
                ctx.globalAlpha = 0.35 + Math.random() * 0.65;
                ctx.fillStyle = '#fff8e0';
                ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            const tex = new THREE.CanvasTexture(cv);
            tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
            ErisBattler3D._galaxyTex = tex;
            return tex;
        }

        // A short astral cape hanging BEHIND her - the cloth covers only the
        // rear half of the figure so the face, chest rig and arms stay clear,
        // held on by a gold clasp at the collarbone. Two swaying frustum
        // segments (like the hair strands, but for cloth), textured with the
        // galaxy canvas.
        _buildRobe() {
            // theta 0 faces +Z, so a back-only arc starts at a quarter turn.
            const openStart = Math.PI * 0.5, openLen = Math.PI;
            this.matRobe = new THREE.MeshStandardMaterial({
                map: this._buildGalaxyTexture(), color: 0xffffff,
                roughness: 0.55, metalness: 0.08,
                emissive: new THREE.Color(0x2a1840), emissiveIntensity: 0.35,
                transparent: true, opacity: 0.94, side: THREE.DoubleSide
            });
            this._materials.push(this.matRobe);

            this.robeAnchor = new THREE.Group();
            this.robeAnchor.position.set(0, 2.16, -0.12);
            this.robeAnchor.rotation.x = -0.07;   // the fall of the cloth leans away behind her
            this.bodyGroup.add(this.robeAnchor);

            // The clasp and its cords - the only part of the cape that comes
            // round to the front, so it reads as worn rather than floating.
            const clasp = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), this.matHalo);
            clasp.position.set(0, -0.14, 0.46); this.robeAnchor.add(clasp);
            for (const sx of [-1, 1]) {
                const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8), this.matTrim);
                cord.position.set(sx * 0.19, -0.1, 0.28);
                cord.rotation.set(Math.PI / 2, 0, sx * 0.95);
                this.robeAnchor.add(cord);
            }

            // A short cape: a narrow collar flare over the shoulders, then a
            // wider fall reaching the hips - not a floor-length gown.
            const segDefs = [
                { rTop: 0.24, rBot: 0.5, h: 0.4 },
                { rTop: 0.5, rBot: 0.66, h: 0.62 }
            ];
            this.robeSegs = [];
            let parent = this.robeAnchor, vOff = 0;
            for (const d of segDefs) {
                const geo = new THREE.CylinderGeometry(d.rTop, d.rBot, d.h, 16, 1, true, openStart, openLen);
                const uv = geo.attributes.uv;
                for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5 + vOff);
                uv.needsUpdate = true;
                const mesh = new THREE.Mesh(geo, this.matRobe);
                mesh.position.y = -d.h / 2;
                const pivot = new THREE.Group();
                pivot.add(mesh);
                parent.add(pivot);
                this.robeSegs.push({ pivot, phase: this.idRand() * 6.28 });
                const next = new THREE.Group();
                next.position.y = -d.h;
                pivot.add(next);
                parent = next;
                vOff += 0.5;
            }
        }

        //---------------------------------------------------------------------
        // Animation
        //---------------------------------------------------------------------
        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;
            const anim = this.currentAnimation;
            const fast = (anim === 'attack' || anim === 'specialattack' || anim === 'beam' || anim === 'summon' || anim === 'slam' || anim === 'roar' || anim === 'cast');

            // Discord instability now reads current HP, not the turn count: a
            // clean render above ~40% HP, worsening chaos as she nears death.
            const ins = this._instab = this._lowLifeInstability();

            // Spawn: rise + radiance bloom.
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.95);
            this.applyModelScale(growth);

            // Gentle hover + hit jolt, plus an HP-driven shudder/drift.
            const hitJolt = anim === 'hit' ? Math.sin(t * 22) * Math.exp(-t * 6) * 0.09 : 0;
            const jz = ins > 0 ? (Math.sin(t * 31) + Math.sin(t * 19.3 + 1.7)) * 0.5 * 0.06 * ins : 0;
            this.model.rotation.z = hitJolt + jz;
            let ry = ins > 0 ? Math.sin(t * 23 + 0.5) * 0.05 * ins : 0;
            if (anim === 'attack') ry += Math.max(0, Math.sin(Math.min(t * 7, Math.PI))) * 0.12;
            this.model.rotation.y = ry;
            if (this._baseX === null) this._baseX = this.model.position.x;
            this.model.position.x = this._baseX + (ins > 0 ? Math.sin(t * 27) * 0.13 * ins : 0);

            const pers = this._idlePersonality(t);
            const danceBob = (anim === 'idle') ? pers.danceW * Math.abs(Math.sin(t * 3.2)) * 0.05 * this.scale : 0;
            this.model.position.y = this._baseY + this._rise + Math.sin(t * 1.1) * 0.05 * this.scale + danceBob
                + (ins > 0 ? Math.sin(t * 21 + 2) * 0.10 * ins : 0);

            // Head: idle personality owns it during idle, otherwise a simple
            // reactive tilt (bows into a punch, snaps up on a roar, etc).
            if (this.head && this.head.visible) {
                if (anim === 'idle') {
                    this.head.rotation.y = pers.swayW * Math.sin(t * 0.9) * 0.1 + pers.danceW * pers.grooveA * 0.18;
                    this.head.rotation.x = pers.swayW * Math.sin(t * 0.7) * 0.04 - pers.giggleW * 0.10 + pers.giggleW * pers.giggleShake;
                    this.head.rotation.z = pers.giggleW * Math.sin(t * 18 + 0.4) * 0.06 + pers.danceW * pers.grooveB * 0.08;
                } else {
                    const e = Math.max(0, Math.sin(Math.min(t * 6, Math.PI)));
                    this.head.rotation.z = 0;
                    this.head.rotation.y = Math.sin(t * 0.9) * 0.06;
                    if (anim === 'attack') this.head.rotation.x = -0.12 * e;
                    else if (anim === 'roar') this.head.rotation.x = -0.22 * Math.max(0, Math.sin(Math.min(t * 2.5, Math.PI)));
                    else if (anim === 'summon' || anim === 'cast') this.head.rotation.x = -0.15 * Math.max(0, Math.sin(Math.min(t * 2.6, Math.PI)));
                    else this.head.rotation.x = Math.sin(t * 0.7) * 0.04;
                }
            }

            // Eyes flare during action poses.
            const eyeGlow = fast ? 2.2 : (0.8 + Math.sin(t * 1.6) * 0.2);
            this.eyes.forEach(e => { if (e.material) e.material.emissiveIntensity = eyeGlow; });

            // Blinks, squints and the mouth.
            this._animateFace(t, anim, pers, ins);

            // Motes / shards spinners + the trailing wisp.
            this._floaters.forEach(f => {
                if (!f.obj.visible) return;
                f.obj.rotation[f.axis] += f.speed * deltaTime * (fast ? 2.2 : 1.0);
            });
            if (this.shards && this.shards.visible) {
                const surge = anim === 'specialattack' ? 1 + Math.sin(Math.min(t * 4, Math.PI)) * 0.45 : 1;
                this.shards.children.forEach(s => {
                    s.rotation.x += (s._spin || 0.6) * deltaTime;
                    s.rotation.y += (s._spin || 0.6) * 0.7 * deltaTime;
                    s.scale.setScalar(surge);
                });
            }
            if (this.tail && this.tail.visible && this._tailStreaks) {
                const sway = 0.06 + ins * 0.1;
                this._tailStreaks.forEach(ts => {
                    ts.mesh.position.z = ts.baseZ + Math.sin(t * 2.2 + ts.phase) * sway;
                    ts.mesh.position.x += Math.sin(t * 3.1 + ts.phase) * sway * 0.4 * deltaTime;
                });
            }

            // The flowing robe: a gentle rippling sway, growing more turbulent
            // with motion (dance/action) and with HP-driven instability.
            if (this.robeAnchor && this.robeAnchor.visible && this.robeSegs) {
                const motion = (fast ? 0.6 : 0) + pers.danceW * 0.4 + pers.giggleW * 0.25;
                const sway = 0.035 + motion * 0.05 + ins * 0.06;
                this.robeSegs.forEach((seg, i) => {
                    const amp = sway * (i + 1);
                    seg.pivot.rotation.z = Math.sin(t * 1.5 + seg.phase + i * 0.5) * amp;
                    seg.pivot.rotation.x = -0.05 + Math.cos(t * 1.2 + seg.phase) * amp * 0.6;
                });
                if (this.matRobe) this.matRobe.emissiveIntensity = 0.35 + Math.sin(t * 0.7) * 0.08 + (ins > 0 ? Math.sin(t * 20) * 0.25 * ins : 0);
            }

            // The pendant brightens with channelled power.
            if (this.aura) {
                this.aura.material.opacity = (fast ? 0.85 : 0.5) + Math.sin(t * 3) * 0.12;
                const ap = 1 + (anim === 'specialattack' ? Math.sin(Math.min(t * 3, Math.PI)) * 0.6 : 0) + Math.sin(t * 2) * 0.05;
                this.aura.scale.setScalar(ap);
            }

            // Arms (punch / summon / cast / beam / slam / roar / hit / idle-groove).
            this._animateArms(t, anim, pers);

            // The short mane.
            this._animateHair(t, anim, ins, pers);

            // Discord destabilisation: drift parts, warp the form, flicker light.
            this._applyInstability(t, ins);

            // The bloom as one body gives way to the next: everything that
            // glows flares white-hot for a moment and the shards blow outward.
            if (this._shiftFx > 0) {
                this._shiftFx = Math.max(0, this._shiftFx - deltaTime * 1.7);
                const f = this._shiftFx * this._shiftFx;
                const boost = 1 + f * 6;
                if (this.matHair) this.matHair.emissiveIntensity = 0.4 * boost;
                if (this.matHairTip) this.matHairTip.emissiveIntensity = 0.75 * boost;
                if (this.matTrim) this.matTrim.emissiveIntensity = 0.55 * boost;
                if (this.matHalo) this.matHalo.emissiveIntensity = 1.1 * boost;
                if (this.matDiscord) this.matDiscord.emissiveIntensity = 0.85 * boost;
                if (this.aura) this.aura.material.opacity = Math.min(1, 0.5 + f);
                if (this.shards && this.shards.visible) this.shards.children.forEach(sh => sh.scale.setScalar(1 + f * 1.4));
                this.model.rotation.z += Math.sin(t * 40) * 0.05 * f;
            }
        }

        // Weights for the idle personality cycle: rest -> dance -> giggle ->
        // rest, on a ~9s loop with soft crossfades so nothing pops.
        _win(ph, s, e, f) {
            if (ph < s - f || ph > e + f) return 0;
            if (ph < s) return (ph - (s - f)) / f;
            if (ph > e) return 1 - (ph - e) / f;
            return 1;
        }

        _idlePersonality(t) {
            const cyc = 9.0;
            const ph = (t % cyc) / cyc;
            const danceW = this._win(ph, 0.40, 0.72, 0.06);
            const giggleW = this._win(ph, 0.76, 0.98, 0.05);
            const swayW = Math.max(0, 1 - danceW - giggleW);
            return {
                danceW, giggleW, swayW,
                grooveA: Math.sin(t * 3.2),
                grooveB: Math.sin(t * 3.2 + Math.PI / 2),
                giggleShake: Math.sin(t * 18) * 0.05
            };
        }

        // The longer she fights and the lower her HP falls, the less her form
        // holds together: limbs and hair drift off their anchors, the jacket
        // and skull warp, and her light flickers between gold order and
        // crimson chaos. Everything is keyed off `ins` (HP-driven), so at
        // ins==0 the model snaps perfectly back to a stable, clean rest pose.
        _applyInstability(t, ins) {
            if (!this._jitterBases) {
                this._jitterBases = [];
                const add = (obj, seed) => { if (obj) this._jitterBases.push({ obj, base: obj.position.clone(), seed }); };
                add(this.head, 0.0); add(this.headset, 1.1);
                add(this.leftArm, 2.0); add(this.rightArm, 3.3);
                add(this.leftPad, 4.2); add(this.rightPad, 5.1);
                add(this.tail, 6.0); add(this.robeAnchor, 8.6);
            }
            for (const j of this._jitterBases) {
                const s = j.seed, a = ins * 0.08;
                j.obj.position.set(
                    j.base.x + Math.sin(t * 17 + s) * a,
                    j.base.y + Math.sin(t * 13 + s * 1.7) * a,
                    j.base.z + Math.sin(t * 23 + s * 0.6) * a
                );
            }
            if (this.body) {
                const w = ins * 0.14;
                this.body.scale.set(1 + Math.sin(t * 11) * w, 1 + Math.sin(t * 7 + 1) * w, 1 + Math.sin(t * 9 + 2) * w);
            }
            if (this.head) {
                const w = ins * 0.12;
                this.head.scale.set(1 + Math.sin(t * 15 + 1) * w, 1 + Math.sin(t * 12) * w, 1 + Math.sin(t * 18 + 2) * w);
            }
            if (ins <= 0) return;
            const flick = 1 + Math.sin(t * 29) * 0.6 * ins;
            if (this.matHair) this.matHair.emissiveIntensity = 0.4 * flick;
            if (this.matHairTip) this.matHairTip.emissiveIntensity = 0.75 * flick;
            if (this.matDiscord) {
                this.matDiscord.emissiveIntensity = (0.85 + Math.sin(t * 33 + 1) * 0.7 * ins);
                const mix = 0.5 + 0.5 * Math.sin(t * 5);
                if (!this._instColA) { this._instColA = new THREE.Color(); this._instColB = new THREE.Color(); }
                this._instColA.set(this.profile.discord);
                this._instColB.set(this.profile.accent);
                this.matDiscord.emissive.copy(this._instColA.lerp(this._instColB, mix * ins * 0.6));
            }
            if (this.shards && this.shards.visible) {
                this.shards.children.forEach((sh, i) => {
                    sh.scale.setScalar(1 + ins * (0.4 + Math.sin(t * 6 + i) * 0.3));
                });
            }
        }

        _animateArms(t, anim, pers) {
            const L = this.leftArm, R = this.rightArm;
            if (!L || !R) return;
            const Le = L._elbow, Re = R._elbow;
            // Shoulder pitch is capped well under horizontal (~90deg) for every
            // combat pose so a swing always reads as a punch/reach, never as a
            // stiff arm-raised salute.
            if (anim === 'attack') {
                // A right jab: shoulder drives forward as the elbow snaps
                // straight, left arm stays close to guard.
                const e = Math.max(0, Math.sin(Math.min(t * 7, Math.PI)));
                if (R.visible) { R.rotation.x = R._restX - e * 0.95; R.rotation.z = R._restZ - e * 0.12; if (Re) Re.rotation.x = Re._rest * (1 - e * 0.9); }
                if (L.visible) { L.rotation.x = L._restX - e * 0.25; L.rotation.z = L._restZ + e * 0.08; if (Le) Le.rotation.x = Le._rest * (1 - e * 0.3); }
            } else if (anim === 'specialattack') {
                // Both fists drive forward together - her judgment made physical.
                const e = Math.max(0, Math.sin(Math.min(t * 3, Math.PI)));
                [[L, Le], [R, Re]].forEach(([a, el]) => {
                    if (!a.visible) return;
                    a.rotation.x = a._restX - e * 1.05; a.rotation.z = a._restZ * (1 - e * 0.6);
                    if (el) el.rotation.x = el._rest * (1 - e * 0.85);
                });
            } else if (anim === 'summon' || anim === 'cast') {
                // Arms raise and spread wide overhead to call chaos to heel -
                // deliberately dramatic, unlike the capped punching poses.
                const e = Math.max(0, Math.sin(Math.min(t * 2.6, Math.PI)));
                [[L, Le], [R, Re]].forEach(([a, el]) => {
                    if (!a.visible) return;
                    a.rotation.x = a._restX - e * 1.9; a.rotation.z = a._restZ * (1 - e) + a._side * e * 0.6;
                    if (el) el.rotation.x = el._rest * (1 - e * 0.6);
                });
            } else if (anim === 'beam') {
                // One arm sights forward down a channelled line, the other braces.
                const e = Math.max(0, Math.sin(Math.min(t * 3, Math.PI)));
                if (R.visible) { R.rotation.x = R._restX - e * 1.0; R.rotation.z = R._restZ * (1 - e); if (Re) Re.rotation.x = Re._rest * (1 - e); }
                if (L.visible) { L.rotation.x = L._restX + e * 0.2; L.rotation.z = L._restZ + e * 0.3; if (Le) Le.rotation.x = Le._rest * (1 + e * 0.3); }
            } else if (anim === 'slam') {
                // A wind-up (elbow tucks in) then a downward double smash.
                const rise = Math.max(0, Math.sin(Math.min(t * 5, Math.PI / 2)));
                const drop = Math.max(0, Math.sin(Math.min(Math.max(0, t - 0.2) * 9, Math.PI)));
                [[L, Le], [R, Re]].forEach(([a, el]) => {
                    if (!a.visible) return;
                    a.rotation.x = a._restX - rise * 1.1 + drop * 1.3;
                    if (el) el.rotation.x = el._rest * (1 + rise * 0.6) * (1 - drop * 0.8);
                });
            } else if (anim === 'roar') {
                // Arms flare outward to the sides, chest out - a shout, not a salute.
                const e = Math.max(0, Math.sin(Math.min(t * 2.5, Math.PI)));
                [[L, Le], [R, Re]].forEach(([a, el]) => {
                    if (!a.visible) return;
                    a.rotation.z = a._restZ - a._side * e * 1.1; a.rotation.x = a._restX - e * 0.25;
                    if (el) el.rotation.x = el._rest * (1 - e * 0.4);
                });
            } else if (anim === 'hit') {
                const e = Math.exp(-t * 8);
                [[L, Le], [R, Re]].forEach(([a, el]) => {
                    if (!a.visible) return;
                    a.rotation.x = a._restX - e * 0.2;
                    if (el) el.rotation.x = el._rest * (1 + e * 0.5);
                });
            } else {
                // Idle personality: rest sway, a little dance groove, a giggle
                // shoulder-shake, cross-faded by _idlePersonality's weights.
                // The groove now lives mostly at the elbow so she swings her
                // forearms rather than raising her whole arm like a salute.
                if (L.visible) {
                    L.rotation.z = L._restZ + pers.swayW * Math.sin(t * 1.0) * 0.06 + pers.danceW * pers.grooveB * 0.14 + pers.giggleW * pers.giggleShake;
                    L.rotation.x = L._restX + pers.swayW * Math.sin(t * 0.8) * 0.04 + pers.danceW * Math.abs(pers.grooveA) * 0.12;
                    if (Le) Le.rotation.x = Le._rest + pers.danceW * (0.3 + pers.grooveA * 0.35) + pers.giggleW * Math.abs(pers.giggleShake) * 4;
                }
                if (R.visible) {
                    R.rotation.z = R._restZ - pers.swayW * Math.sin(t * 1.0) * 0.06 - pers.danceW * pers.grooveA * 0.14 - pers.giggleW * pers.giggleShake;
                    R.rotation.x = R._restX + pers.swayW * Math.sin(t * 0.8 + 1) * 0.04 + pers.danceW * Math.abs(pers.grooveB) * 0.12;
                    if (Re) Re.rotation.x = Re._rest + pers.danceW * (0.3 + pers.grooveB * 0.35) + pers.giggleW * Math.abs(pers.giggleShake) * 4;
                }
            }
        }

        // The face itself lives: she blinks on her own rhythm, screws her eyes
        // shut and opens her mouth when she laughs or shouts, and narrows them
        // when she throws a punch.
        _animateFace(t, anim, pers, ins) {
            const giggle = pers ? pers.giggleW : 0;
            // Idle blink: a quick close roughly every four and a half seconds.
            const cyc = 4.6, ph = (t + (this._blinkOff || 0)) % cyc;
            let close = ph < 0.17 ? Math.sin((ph / 0.17) * Math.PI) : 0;
            // Squints: laughing screws them shut, effort narrows them.
            close = Math.max(close, giggle * 0.75);
            if (anim === 'attack' || anim === 'specialattack' || anim === 'slam') {
                close = Math.max(close, Math.max(0, Math.sin(Math.min(t * 7, Math.PI))) * 0.45);
            } else if (anim === 'hit') {
                close = Math.max(close, Math.exp(-t * 5) * 0.85);
            } else if (anim === 'roar') {
                close = Math.max(close, Math.max(0, Math.sin(Math.min(t * 2.5, Math.PI))) * 0.5);
            }
            close = Math.min(1, close + (ins > 0 ? Math.max(0, Math.sin(t * 26)) * 0.25 * ins : 0));
            if (this._lids) {
                for (const l of this._lids) {
                    l.up.rotation.x = l.upOpen + (l.upShut - l.upOpen) * close;
                    l.low.rotation.x = l.lowOpen + (l.lowShut - l.lowOpen) * close;
                }
            }

            // Mouth: shouting, laughing and casting open it to different degrees.
            let open = 0.04 + Math.sin(t * 0.8) * 0.02 + giggle * 0.5;
            if (anim === 'roar') open = Math.max(open, 0.35 + Math.max(0, Math.sin(Math.min(t * 2.5, Math.PI))) * 0.55);
            else if (anim === 'summon' || anim === 'cast' || anim === 'beam') open = Math.max(open, Math.max(0, Math.sin(Math.min(t * 2.6, Math.PI))) * 0.4);
            else if (anim === 'attack' || anim === 'specialattack' || anim === 'slam') open = Math.max(open, Math.max(0, Math.sin(Math.min(t * 7, Math.PI))) * 0.45);
            else if (anim === 'hit') open = Math.max(open, Math.exp(-t * 5) * 0.6);
            open = Math.min(1, open);
            if (this.mouthLower) this.mouthLower.position.y = -0.022 - open * 0.055;
            if (this.mouthUpper) this.mouthUpper.position.y = open * 0.014;
            if (this.mouthCavity) this.mouthCavity.scale.y = 0.12 + open * 0.55;
            if (this.mouth) this.mouth.scale.x = 1 + giggle * 0.12;
        }

        _animateHair(t, anim, ins, pers) {
            ins = ins || 0;
            const fast = (anim === 'attack' || anim === 'specialattack' || anim === 'beam' || anim === 'summon' || anim === 'slam' || anim === 'roar');
            const personality = pers ? (pers.danceW * 0.8 + pers.giggleW * 1.1) : 0;
            const speed = (fast ? 5.0 : 2.0) + ins * 3.5 + personality * 2.0;
            for (const h of this._hair) {
                if (!h.strand.visible) continue;
                const amp = h.sway * (fast ? 1.5 : 1.0) * (1 + ins * 1.1 + personality * 0.6);
                for (let i = 0; i < h.pivots.length; i++) {
                    const piv = h.pivots[i];
                    const phase = h.phase + i * 0.7;
                    const chaos = ins > 0 ? Math.sin(t * 14 + phase * 2.3 + i) * 0.2 * ins : 0;
                    piv.rotation.z = Math.sin(t * speed + phase) * amp * (0.5 + i * 0.1) + chaos;
                    piv.rotation.x = piv._rest + Math.cos(t * (speed * 0.8) + phase) * amp * 0.4 + chaos * 0.6;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.3);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Her knees buckle and she slumps forward, the light going out.
            this.model.position.y = this._baseY + this._rise - prog * (this._rise + 0.55 * this.scale);
            this.model.rotation.x = prog * 0.7;
            this.model.rotation.z = prog * 0.25;
            if (this.head) this.head.rotation.x = prog * 0.5;
            for (const m of this._materials) {
                if (m.emissiveIntensity !== undefined) m.emissiveIntensity *= (1 - prog * 0.06);
            }
            if (this.aura) this.aura.material.opacity = 0.5 * (1 - prog);
            // Her eyes close and her mouth falls slack.
            if (this._lids) {
                for (const l of this._lids) {
                    l.up.rotation.x = l.upOpen + (l.upShut - l.upOpen) * prog;
                    l.low.rotation.x = l.lowOpen + (l.lowShut - l.lowOpen) * prog;
                }
            }
            if (this.mouthLower) this.mouthLower.position.y = -0.022 - prog * 0.03;
            if (this.mouthCavity) this.mouthCavity.scale.y = 0.12 + prog * 0.28;
            for (const h of this._hair) {
                for (let i = 0; i < h.pivots.length; i++) {
                    const piv = h.pivots[i];
                    piv.rotation.z *= (1 - prog);
                    piv.rotation.x = piv._rest * (1 - prog) + prog * 0.4;
                }
            }
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new ErisBattler3D(scale, offsetY, enemy, weaponType, key);

    // Override any earlier witch-variant stand-in.
    window.Battler3D.registerArchetype('eris', {
        aliases: ['eris', 'discordgoddess', 'judgmentofdiscord'],
        scale: E_PROFILE.eris.scale, weapon: 0, create: make
    });
    // Pin the exact enemy name too (belt and suspenders alongside <Battler3D: eris>).
    if (window.Battler3D.registerNamed) {
        window.Battler3D.registerNamed('Eris, Judgment of Discord', 'eris');
    }

    debugLog('Eris (bespoke wasteland discord-goddess model) registered');
})();
