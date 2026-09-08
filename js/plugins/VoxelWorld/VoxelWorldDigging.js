//=============================================================================
// VoxelWorldDigging.js
// VoxelWorld: the pick - aiming at a cube, breaking it, putting one back
//
// The tool that makes the field destructible from inside the game rather than
// from the console. It owns the cube the eye is pointed at, the outline drawn
// round it, how long a given material takes to break, the shower of chips that
// comes off it, and what a seam of ore is worth when it does.
//
// It is deliberately input-agnostic: the scene reads the keyboard, the mouse
// and the pad, and hands this a plain intent every frame.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - the digging tool: aim, break, place, chips and drops
 * @author Omni-Lex
 *
 * @help
 * Breaking and placing cubes in the voxel world.
 *
 * Rock is slower to break than turf, bedrock never gives, and a seam of ore
 * found deep enough goes into the party's bags. Blocks taken out can be put
 * back, which is how a bridge over a ravine or a step up a cliff gets built.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldDigging.js'); return; }

    const { MAT, MATERIALS, ORE_ITEMS, PLACEABLE, VOX, VOXEL_STEP_MATERIAL,
            VoxelWorldState, voxelHash3, FOOT_EYE, FOOT_BODY_R } = VW;

    // The voice of a cube. Everything that happens to one - a blow landing on
    // it, it coming apart, one being set down - is heard as the material it is
    // made of, through the game's own step-sound library (window.Footsteps, the
    // door onto js/db/WorldGen/FootstepMaterials.json). Rock rings, turf thuds,
    // gravel rattles and mud squelches, and none of it is a separate bank of
    // sounds that has to be kept in step with the 2D game's.
    function matVoice(mat, volume, pitch) {
        const def = MATERIALS[mat];
        const key = def && VOXEL_STEP_MATERIAL[def.key];
        const F = window.Footsteps;
        if (key && F && F.play) return F.play(key, { volume });
        return false;
    }

    // Seconds to break one cube of hardness 1. Everything else is a multiple.
    const DIG_UNIT   = 0.34;

    // -------------------------------------------------------------------------
    // Digging with a weapon
    // -------------------------------------------------------------------------
    // There is no pick in this game. The thing in the leader's hands is the
    // thing they dig with, and a weapon goes through a cube in ONE blow: a
    // tunnel is opened at the speed the party walks, not at the speed a
    // hardness table allows. Bare hands are the only thing the world resists,
    // and it resists them by exactly one extra blow, which is enough for the
    // difference between armed and unarmed to be felt without a wall ever
    // becoming a chore.
    const HITS_ARMED   = 1;
    const HITS_UNARMED = 2;
    // How fast the swings come while the button is held: a blow, then the time
    // it takes to draw back for the next one.
    const SWING_TIME   = 0.42;
    // A gun does not swing, it fires - faster, and from wherever it can reach.
    const SHOT_TIME    = 0.30;
    // How far a weapon reaches into the world, in world units. A hand weapon
    // reaches an arm's length (VOX.REACH); anything with <Range: n> on it
    // reaches n world squares, which is what lets a rifle take the top off a
    // ridge from the other side of a field.
    const RANGE_STEP   = 120;   // world units per step of <Range:>
    const RANGE_MAX    = 900;
    // How many chips a broken cube throws, and how long they live.
    const CHIP_MAX   = 160;
    const CHIP_LIFE  = 0.75;
    const CHIP_COUNT = 7;

    // -------------------------------------------------------------------------
    // The three quick bars
    // -------------------------------------------------------------------------
    // One strip along the bottom of the screen, three things it can be showing.
    // TAB (L2 on a pad) walks between them, and what is in hand is whatever the
    // lit cell of the bar that is up holds:
    //
    //   blocks   the weapon and everything dug out of the world (the default)
    //   items    the party's own quick-use favourites, the map bar's nine slots
    //   spells   the leader's carried battle loadout, cast out into the world
    //
    // The bars are not three inventories: each is a view onto something the game
    // already keeps (window.ItemHotbar, window.BattleLoadout), so a favourite
    // starred in the backpack is on the bar out here without anything being
    // copied anywhere.
    const BAR_MODES = ['blocks', 'items', 'spells'];  // i18n-ignore  mode ids
    // Nine cells, the same nine the item bar and the battle loadout both carry,
    // so the number keys mean the same thing whichever bar is up.
    const SPELL_SLOTS = 9;

    // -------------------------------------------------------------------------
    // Casting into the world
    // -------------------------------------------------------------------------
    // A spell fired out here is not a battle action. There is nobody taking a
    // turn, no damage is dealt to anybody, and nothing has hit points: what a
    // bolt does when it lands is open a fight with whatever it landed on, and
    // take a bite out of the ground.
    //
    // How big a bite is the skill's OWN damage formula, evaluated with the
    // caster on both sides of it: a cantrip scuffs the wall, a meteor opens a
    // crater. A spell that heals never touches the ground - it was not aimed at
    // the world in the first place.
    const SPELL_RANGE_STEP    = 120;   // world units per step of <Range:> on a skill
    const SPELL_RANGE_DEFAULT = 420;   // how far a spell with nothing said about it goes
    const SPELL_RANGE_MAX     = 1600;
    const SPELL_SPEED         = 520;   // world units a second the bolt travels
    const SPELL_COOLDOWN      = 0.45;  // seconds between casts, so one press is one bolt
    // What the crater comes to. The formula's value is rooted before it is used:
    // damage runs to the thousands late on, and a crater the size of a village
    // is not what "a big spell" should mean.
    const BLAST_MIN_R  = 1.2;          // in cubes
    const BLAST_MAX_R  = 7;
    const BLAST_SCALE  = 0.55;
    // How far past the crater a creature still counts as caught in it.
    const BLAST_CATCH  = 2.2;

    // The colour a bolt burns, by the element the skill is of. Read off the
    // database's own element list rather than a table of names, so a world with
    // its own elements still lights something.
    const ELEMENT_COLOURS = [
        0xffe6a8, 0xf2f2f2, 0xff7a3c, 0x8fd8ff, 0xffd24a, 0x9be36a,
        0xd0e8ff, 0xc59bff, 0xff6a9c, 0x9affe0
    ];

    // Whether a skill is meant to mend rather than break. HP and MP recovery
    // are the two the database says so about; everything else that carries a
    // formula is taken at its word.
    const isHealingSkill = (skill) => {
        const d = skill && skill.damage;
        return !!d && (d.type === 3 || d.type === 4);
    };

    const matName = m => {
        const def = MATERIALS[m];
        return def ? T('VoxelWorld.material.' + def.key) : '';
    };

    // =========================================================================
    // BlockBar, the quick bar of what has been dug up
    // =========================================================================
    // A cube broken out of the world does not vanish and does not go into the
    // party's bags: it goes on the bar along the bottom of the screen, and it is
    // put back into the world from there. The bar is the whole inventory of
    // blocks - there is nowhere else for one to be - which is what makes it a
    // real limit: BAR_SLOTS kinds of block at a time, SLOT_MAX of each, and when
    // every slot is taken nothing more can be picked up until one is emptied by
    // building with it.
    //
    // Slot 0 is not a block. It is the weapon in the leader's hands, which is
    // what the bar cycles back to and what digging is done with, so one wheel
    // (or L1/R1) runs the whole thing: weapon, then every block collected.
    //
    // It lives in the WORLD, not in the savegame: walk out of the 3D world and
    // back in, load another save of the same world, and the stack of dirt is
    // still on the bar (VoxelWorldState, save/worlds/<name>/voxelworld.json).
    // =========================================================================
    const BAR_SLOTS = 8;      // kinds of block that can be carried at once
    const SLOT_MAX  = 99;     // cubes of one kind in one slot

    class BlockBar {
        constructor() {
            this._slots = null;
            this._sel   = 0;          // 0 = the weapon, 1..BAR_SLOTS = a block
        }

        // Read out of the world the first time anybody asks, so a bar is never
        // built before there is a world to build it from.
        get slots() {
            if (!this._slots) {
                const saved = VoxelWorldState.blocks ? VoxelWorldState.blocks() : null;
                this._slots = new Array(BAR_SLOTS);
                for (let i = 0; i < BAR_SLOTS; i++) {
                    const s = saved && saved[i];
                    this._slots[i] = (s && s.mat && s.count > 0)
                        ? { mat: s.mat | 0, count: Math.min(SLOT_MAX, s.count | 0) }
                        : null;
                }
            }
            return this._slots;
        }

        _save() {
            if (VoxelWorldState.setBlocks) VoxelWorldState.setBlocks(this._slots);
        }

        // --- what is in hand ---------------------------------------------
        get selected()      { return this._sel; }
        get holdingWeapon() { return this._sel === 0; }
        // The slot record in hand, or null while the weapon is.
        get held() {
            if (this._sel === 0) return null;
            return this.slots[this._sel - 1];
        }
        get heldMaterial() {
            const s = this.held;
            return (s && s.count > 0) ? s.mat : 0;
        }

        // The wheel, and L1/R1. Steps through the weapon and every slot that has
        // anything in it; empty slots are skipped, so the bar never leaves the
        // player holding nothing.
        cycle(dir) {
            const step = dir < 0 ? -1 : 1;
            const n = BAR_SLOTS + 1;
            for (let k = 0; k < n; k++) {
                this._sel = ((this._sel + step) % n + n) % n;
                if (this._sel === 0) return this._sel;
                const s = this.slots[this._sel - 1];
                if (s && s.count > 0) return this._sel;
            }
            this._sel = 0;
            return 0;
        }
        // Straight to a slot (the number keys).
        select(i) {
            if (i === 0) { this._sel = 0; return true; }
            const s = this.slots[i - 1];
            if (!s || s.count <= 0) return false;
            this._sel = i;
            return true;
        }

        // --- picking one up ------------------------------------------------
        // True when it went on the bar. False when every slot is taken by some
        // other kind of block and this one has nowhere to go: the cube stays in
        // the world, which is the whole point of a bar with a bottom to it.
        add(mat) {
            if (!mat) return false;
            const slots = this.slots;
            for (const s of slots) {
                if (s && s.mat === mat && s.count < SLOT_MAX) { s.count++; this._save(); return true; }
            }
            // Already carrying a full stack of it and nowhere to start another.
            for (let i = 0; i < BAR_SLOTS; i++) {
                if (!slots[i]) { slots[i] = { mat, count: 1 }; this._save(); return true; }
            }
            return false;
        }
        // Is there room for one more of this kind? Asked before a cube is broken
        // so the player is told why nothing happened rather than losing it.
        canTake(mat) {
            if (!mat) return false;
            const slots = this.slots;
            for (const s of slots) {
                if (s && s.mat === mat) return s.count < SLOT_MAX;
            }
            return slots.some(s => !s);
        }

        // --- putting one back ----------------------------------------------
        // Spends one of whatever is in hand. Returns the material spent, or 0.
        spendHeld() {
            const s = this.held;
            if (!s || s.count <= 0) return 0;
            const mat = s.mat;
            s.count--;
            if (s.count <= 0) {
                this.slots[this._sel - 1] = null;
                // The last of a kind: back to the weapon rather than an empty hand.
                this.cycle(1);
            }
            this._save();
            return mat;
        }

        // What the HUD draws: every slot, in order, with the weapon at the head.
        // The weapon's own name comes in from the tool, which is what knows what
        // is in the leader's hands (see VoxelTool.weaponName), so the bar can
        // say what a cell holds the way every other quick bar in the game does.
        readout(weaponName) {
            const out = [{ weapon: true, on: this._sel === 0, name: weaponName || '' }];
            const slots = this.slots;
            for (let i = 0; i < BAR_SLOTS; i++) {
                const s = slots[i];
                out.push({
                    weapon: false,
                    on: this._sel === i + 1,
                    mat: s ? s.mat : 0,
                    count: s ? s.count : 0,
                    name: s ? matName(s.mat) : '',
                    colour: s ? matColour(s.mat) : null,
                });
            }
            return out;
        }
    }

    // The colour a block reads as on the bar. A biome-coloured cube (turf, and
    // whatever the world map paints a square) has no fixed colour of its own, so
    // it is given the one it wears in most of the world rather than left black.
    const BAR_BIOME_RGB = { r: 0.42, g: 0.58, b: 0.30 };
    function matColour(mat) {
        const def = MATERIALS[mat];
        if (!def) return null;
        const c = def.biome ? BAR_BIOME_RGB : def.rgb;
        if (!c) return null;
        const hex = (v) => Math.max(0, Math.min(255, Math.round(Math.pow(v, 1 / 2.2) * 255)));
        return `rgb(${hex(c.r)},${hex(c.g)},${hex(c.b)})`;
    }

    // =========================================================================
    // ChipFx, the debris a broken cube throws
    // =========================================================================
    class ChipFx {
        constructor(scene) {
            this._scene = scene;
            this._geo   = new THREE.BoxGeometry(VOX.SIZE * 0.22, VOX.SIZE * 0.22, VOX.SIZE * 0.22);
            // Per-instance colour, not vertex colour: a BoxGeometry carries no
            // colour attribute, and asking the material for one it has not got
            // draws the whole shower black.
            this._mat   = new THREE.MeshLambertMaterial({ color: 0xffffff });
            this._mesh  = new THREE.InstancedMesh(this._geo, this._mat, CHIP_MAX);
            this._mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this._mesh.frustumCulled = false;
            this._mesh.count = CHIP_MAX;
            // setColorAt allocates instanceColor the way the renderer expects.
            this._white = new THREE.Color(1, 1, 1);
            for (let i = 0; i < CHIP_MAX; i++) this._mesh.setColorAt(i, this._white);
            scene.add(this._mesh);

            this._p = new Array(CHIP_MAX);
            for (let i = 0; i < CHIP_MAX; i++) this._p[i] = { life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
            this._next = 0;
            this._m = new THREE.Matrix4();
            this._q = new THREE.Quaternion();
            this._v = new THREE.Vector3();
            this._scale = new THREE.Vector3(1, 1, 1);
            this._one = new THREE.Vector3(1, 1, 1);
            this._hidden = new THREE.Vector3(0, -1e6, 0);
        }

        burst(x, y, z, r, g, b, n) {
            const count = n || CHIP_COUNT;
            for (let i = 0; i < count; i++) {
                const p = this._p[this._next];
                const idx = this._next;
                this._next = (this._next + 1) % CHIP_MAX;
                p.life = CHIP_LIFE;
                p.x = x + (Math.random() - 0.5) * VOX.SIZE;
                p.y = y + (Math.random() - 0.5) * VOX.SIZE;
                p.z = z + (Math.random() - 0.5) * VOX.SIZE;
                p.vx = (Math.random() - 0.5) * 55;
                p.vy = 24 + Math.random() * 46;
                p.vz = (Math.random() - 0.5) * 55;
                if (this._mesh.instanceColor) this._mesh.instanceColor.setXYZ(idx, r, g, b);
            }
            if (this._mesh.instanceColor) this._mesh.instanceColor.needsUpdate = true;
        }

        update(dt) {
            let live = false;
            for (let i = 0; i < CHIP_MAX; i++) {
                const p = this._p[i];
                if (p.life <= 0) {
                    this._m.compose(this._hidden, this._q, this._one);
                    this._mesh.setMatrixAt(i, this._m);
                    continue;
                }
                live = true;
                p.life -= dt;
                p.vy -= 260 * dt;
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                const k = Math.max(0.05, p.life / CHIP_LIFE);
                this._v.set(p.x, p.y, p.z);
                this._scale.set(k, k, k);
                this._m.compose(this._v, this._q, this._scale);
                this._mesh.setMatrixAt(i, this._m);
            }
            this._mesh.instanceMatrix.needsUpdate = true;
            this._mesh.visible = live;
        }

        dispose() {
            this._scene.remove(this._mesh);
            this._geo.dispose();
            this._mat.dispose();
        }
    }

    // =========================================================================
    // SpellCaster, the spell bar and the bolt it fires
    // =========================================================================
    // The leader's carried loadout, aimed down the crosshair. A cast puts a
    // bolt in the air; the bolt flies until it hits something solid or runs out
    // of range, and then it bursts: the skill's own battle animation goes off
    // at that point (through the world's Effekseer context, see VoxelWorldFx's
    // SpellFx), the ground gives, and anything standing in the blast turns
    // round and fights.
    //
    // The scene owns the two things this cannot know about, handed in as hooks:
    //   onBurst(x, y, z, radius, damage)   who was caught in it
    //   onAnimation(id, x, y, z)           play the skill's animation there
    class SpellCaster {
        constructor(scene, terrain, hooks) {
            this._scene   = scene;
            this._terrain = terrain;
            this._hooks   = hooks || {};
            this._bolts   = [];
            this._cool    = 0;
            this._sel     = 0;   // which of the nine carried spells is in hand

            this._group = new THREE.Group();
            this._group.frustumCulled = false;
            scene.add(this._group);

            // The bolt itself, and the ring that says where it would land. Both
            // are built once and moved: a spell is fired often enough that
            // building geometry per cast would be felt.
            this._boltGeo = new THREE.SphereGeometry(2.4, 10, 8);
            this._ringGeo = new THREE.TorusGeometry(6, 0.9, 6, 20);
            this._ringMat = new THREE.MeshBasicMaterial({
                color: 0xbfe4ff, transparent: true, opacity: 0.55, depthTest: false
            });
            this._ring = new THREE.Mesh(this._ringGeo, this._ringMat);
            this._ring.visible = false;
            this._ring.renderOrder = 900;
            this._group.add(this._ring);
        }

        // --- what the leader carries -----------------------------------------
        // The nine of the battle loadout, in carry order, with the gaps left in
        // so a cell never moves under the player's thumb between one look and
        // the next.
        static leader() {
            return (typeof $gameParty !== 'undefined' && $gameParty)
                ? $gameParty.leader() : null;
        }
        static spells() {
            const actor = SpellCaster.leader();
            const out = new Array(SPELL_SLOTS).fill(null);
            if (!actor || !window.BattleLoadout || !window.BattleLoadout.ids) return out;
            const ids = window.BattleLoadout.ids(actor) || [];
            for (let i = 0; i < SPELL_SLOTS && i < ids.length; i++) {
                out[i] = $dataSkills[ids[i]] || null;
            }
            return out;
        }

        get selected() { return this._sel; }
        select(i) {
            if (i < 0 || i >= SPELL_SLOTS) return false;
            this._sel = i;
            return true;
        }
        cycle(dir) {
            const step = dir < 0 ? -1 : 1;
            this._sel = ((this._sel + step) % SPELL_SLOTS + SPELL_SLOTS) % SPELL_SLOTS;
        }
        held() { return SpellCaster.spells()[this._sel] || null; }

        // What the quick bar draws for the spell view.
        readout() {
            const actor = SpellCaster.leader();
            return SpellCaster.spells().map((skill, i) => {
                if (!skill) return null;
                return {
                    spell: true,
                    on: i === this._sel,
                    id: skill.id,
                    name: skill.name,
                    iconIndex: skill.iconIndex || 0,
                    enabled: !!(actor && actor.canPaySkillCost && actor.canPaySkillCost(skill))
                };
            });
        }

        // --- firing one ------------------------------------------------------
        // How far this spell carries. A skill says so with <Range: n> the way a
        // weapon does; anything else reaches as far as a spell reaches.
        static rangeOf(skill) {
            const m = skill && skill.note && skill.note.match(/<Range:\s*(\d+)\s*>/i);
            const steps = m ? parseInt(m[1], 10) : 0;
            if (!steps) return SPELL_RANGE_DEFAULT;
            return Math.min(SPELL_RANGE_MAX, steps * SPELL_RANGE_STEP);
        }

        // What the skill's own formula comes to, with the caster on both sides
        // of it. Not damage dealt to anybody: the number the crater is sized on.
        static forceOf(skill) {
            const actor = SpellCaster.leader();
            if (!actor || typeof Game_Action === 'undefined') return 0;
            try {
                const action = new Game_Action(actor);
                action.setSkill(skill.id);
                return Math.abs(action.evalDamageFormula(actor)) || 0;
            } catch (e) {
                return 0;
            }
        }

        static colourOf(skill) {
            const id = (skill && skill.damage && skill.damage.elementId) || 0;
            if (id <= 0) return ELEMENT_COLOURS[0];
            return ELEMENT_COLOURS[id % ELEMENT_COLOURS.length];
        }

        // True when the bolt left the hand. Everything that would stop it -
        // nothing carried in that cell, no magic to pay with, a cast still
        // cooling - is answered here rather than by the caller.
        cast(origin, dir) {
            const skill = this.held();
            if (!skill || this._cool > 0) return false;
            const actor = SpellCaster.leader();
            if (!actor || !actor.canPaySkillCost || !actor.canPaySkillCost(skill)) {
                if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
                return false;
            }
            actor.paySkillCost(skill);
            this._cool = SPELL_COOLDOWN;

            const colour = SpellCaster.colourOf(skill);
            const mesh = new THREE.Mesh(this._boltGeo, new THREE.MeshBasicMaterial({
                color: colour, transparent: true, opacity: 0.9, depthWrite: false
            }));
            mesh.position.copy(origin);
            mesh.frustumCulled = false;
            this._group.add(mesh);
            this._bolts.push({
                mesh, skill,
                dir: dir.clone().normalize(),
                pos: origin.clone(),
                gone: 0,
                range: SpellCaster.rangeOf(skill)
            });
            if (skill.id && typeof AudioManager !== 'undefined') {
                try { AudioManager.playStaticSe({ name: 'Magic1', volume: 70, pitch: 100, pan: 0 }); }
                catch (e) { /* no such SE in this build */ }
            }
            return true;
        }

        // The ring that says where the spell in hand would land, drawn at the
        // first thing the crosshair is on or at the end of its reach.
        aim(origin, dir, showing) {
            const skill = showing ? this.held() : null;
            if (!skill) { this._ring.visible = false; return; }
            const range = SpellCaster.rangeOf(skill);
            const hit = this._terrain.field.raycast(
                origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
            const d = hit ? Math.max(8, hit.dist || range) : range;
            this._ring.position.copy(dir).multiplyScalar(d).add(origin);
            this._ring.lookAt(origin);
            this._ring.visible = true;
            this._ringMat.color.setHex(SpellCaster.colourOf(skill));
        }

        update(dt) {
            if (this._cool > 0) this._cool -= dt;
            for (let i = this._bolts.length - 1; i >= 0; i--) {
                const b = this._bolts[i];
                const stepLen = Math.min(SPELL_SPEED * dt, b.range - b.gone);
                // Walked in one raycast rather than one position test: at this
                // speed a bolt covers several cubes a frame, and a wall it flew
                // through is a wall it did not hit.
                const hit = this._terrain.field.raycast(
                    b.pos.x, b.pos.y, b.pos.z, b.dir.x, b.dir.y, b.dir.z, stepLen + 1);
                b.pos.addScaledVector(b.dir, stepLen);
                b.gone += stepLen;
                b.mesh.position.copy(b.pos);
                if (hit || b.gone >= b.range - 0.01) {
                    this._burst(b);
                    this._group.remove(b.mesh);
                    b.mesh.material.dispose();
                    this._bolts.splice(i, 1);
                }
            }
        }

        // Where it landed. The animation goes off first, because that is what
        // the player is looking at; the ground and whatever was standing on it
        // follow in the same frame.
        _burst(bolt) {
            const { skill, pos } = bolt;
            const anim = skill.animationId;
            if (this._hooks.onAnimation && anim > 0) {
                this._hooks.onAnimation(anim, pos.x, pos.y, pos.z);
            }
            const force = SpellCaster.forceOf(skill);
            // A spell that mends leaves the world exactly as it found it.
            const radius = isHealingSkill(skill) ? 0 : Math.max(BLAST_MIN_R,
                Math.min(BLAST_MAX_R, 1 + Math.sqrt(Math.max(0, force)) * BLAST_SCALE));
            if (radius > 0 && this._terrain.field.carveSphere) {
                this._terrain.field.carveSphere(pos.x, pos.y, pos.z, radius * VOX.SIZE);
            }
            if (this._hooks.onBurst) {
                this._hooks.onBurst(pos.x, pos.y, pos.z,
                    Math.max(radius, BLAST_MIN_R) * VOX.SIZE * BLAST_CATCH, force, skill);
            }
        }

        dispose() {
            for (const b of this._bolts) {
                this._group.remove(b.mesh);
                b.mesh.material.dispose();
            }
            this._bolts = [];
            this._scene.remove(this._group);
            this._boltGeo.dispose();
            this._ringGeo.dispose();
            this._ringMat.dispose();
        }
    }

    // =========================================================================
    // VoxelTool
    // =========================================================================
    class VoxelTool {
        constructor(scene, terrain) {
            this._scene   = scene;
            this._terrain = terrain;
            this._active  = false;
            this._progress = 0;
            this._bar     = new BlockBar();
            this.target   = null;        // last raycast hit, or null
            this._lastKey = '';
            this._swingT  = 0;           // time until the next blow lands
            this._hits    = 0;           // blows already landed on this cube
            this._chips   = new ChipFx(scene);

            // The outline round the cube being looked at, and the ghost that
            // fills in as it is broken.
            const g = new THREE.BoxGeometry(VOX.SIZE * 1.02, VOX.SIZE * 1.02, VOX.SIZE * 1.02);
            this._outline = new THREE.LineSegments(
                new THREE.EdgesGeometry(g),
                new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.8, depthTest: true })
            );
            this._outline.visible = false;
            this._outline.frustumCulled = false;
            scene.add(this._outline);

            this._ghostMat = new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0, depthWrite: false
            });
            this._ghost = new THREE.Mesh(g, this._ghostMat);
            this._ghost.visible = false;
            this._ghost.frustumCulled = false;
            scene.add(this._ghost);
            this._boxGeo = g;
        }

        setActive(on) {
            this._active = !!on;
            if (!on) {
                this.target = null;
                this._progress = 0;
                this._outline.visible = false;
                this._ghost.visible = false;
            }
        }

        // --- which of the three bars is up ------------------------------------
        // The mode lives on the tool because the tool is what the scene already
        // asks about the thing in the party's hands. Blocks is the default and
        // the one every other part of the world was written against: while any
        // other bar is up, the pick neither digs nor builds.
        get barMode()     { return BAR_MODES[this._barMode || 0]; }
        get barModeIndex(){ return this._barMode || 0; }
        cycleBarMode(dir) {
            const step = dir < 0 ? -1 : 1;
            const n = BAR_MODES.length;
            this._barMode = (((this._barMode || 0) + step) % n + n) % n;
            return this.barMode;
        }
        get onBlocks() { return (this._barMode || 0) === 0; }

        // What is in hand comes off the bar now, not off a fixed list of
        // placeable materials: you build with what you dug up.
        get bar()              { return this._bar; }
        get selectedMaterial() { return this._bar.heldMaterial || PLACEABLE[0]; }
        get selectedName()     { return this._bar.holdingWeapon ? '' : matName(this.selectedMaterial); }
        // What the quick bar's first cell is holding: whatever the leader is
        // armed with, down to the fists of their own archetype, and a plain
        // "bare hands" for anybody the weapon plugins have nothing to say about.
        get weaponName() {
            const w = this._weaponNow();
            return (w && w.name) ? w.name : T('VoxelWorld.tool.bareHands');
        }
        get targetName()       { return this.target ? matName(this.target.mat) : ''; }
        get progress()         { return this._progress; }

        cycle(dir) { this._bar.cycle(dir); }

        // ---------------------------------------------------------------------
        // What the thing in the leader's hands is worth against rock
        // ---------------------------------------------------------------------
        // The weapon's attack, and whether it is something you swing or
        // something you fire. Read off the party every time it is asked, so
        // changing weapon in the menu changes how fast the wall comes down.
        _weaponNow() {
            const actor = (typeof $gameParty !== 'undefined' && $gameParty)
                ? $gameParty.leader() : null;
            if (!actor) return null;
            const w = (actor.weapons && actor.weapons()[0]) || null;
            if (w) return w;
            // An empty hand is not empty: it is the fist of the character's
            // archetype, the same one the battle scene arms them with.
            if (window.WeaponSystemProcedural && WeaponSystemProcedural.unarmedWeaponFor) {
                try { return WeaponSystemProcedural.unarmedWeaponFor(actor); } catch (e) { /* fists it is */ }
            }
            return null;
        }
        // Whether the leader is actually holding something. The fist that
        // stands in for an empty hand (_weaponNow) is a weapon everywhere else
        // in the game, so it cannot be the thing that answers this.
        _armed() {
            const actor = (typeof $gameParty !== 'undefined' && $gameParty)
                ? $gameParty.leader() : null;
            return !!(actor && actor.weapons && actor.weapons()[0]);
        }
        // Steps of <Range:> on the weapon; 0 for anything you have to be next to.
        _weaponRange(w) {
            const m = w && w.note && w.note.match(/<Range:\s*(\d+)\s*>/i);
            return m ? Math.max(0, parseInt(m[1], 10)) : 0;
        }
        // How far it can break something from.
        reach() {
            const steps = this._weaponRange(this._weaponNow());
            if (steps <= 1) return VOX.REACH;
            return Math.min(RANGE_MAX, steps * RANGE_STEP);
        }
        // How many blows this cube takes, with what is in hand. A weapon takes
        // it out on the blow that lands; a bare fist wants a second one. What
        // the cube is made of does not enter into it - bedrock is not diggable
        // at all, and everything that is, gives.
        hitsFor(mat) {
            const def = MATERIALS[mat];
            if (!def || !def.diggable) return Infinity;
            return this._armed() ? HITS_ARMED : HITS_UNARMED;
        }

        // ---------------------------------------------------------------------
        // One frame.
        //   input.origin / input.dir  the eye ray, as THREE.Vector3
        //   input.dig                 the attack button, held
        //   input.place               the build button, this frame only
        //   input.cycle               -1 / 0 / +1 along the quick bar
        //
        // The attack button does BOTH jobs, and which one it does is whatever is
        // in hand: the weapon digs, a block builds. That is the whole of the
        // control scheme out here - one button, and a wheel that says what it
        // means. `place` (the G key) still forces a build, for anybody who
        // learned it that way.
        // ---------------------------------------------------------------------
        update(dt, input) {
            this._chips.update(dt);
            if (this._swingT > 0) this._swingT -= dt;
            if (!this._active || !input || !input.origin || !input.dir) {
                this._outline.visible = false;
                this._ghost.visible = false;
                return;
            }
            if (input.cycle) this.cycle(input.cycle);

            const holdingBlock = !this._bar.holdingWeapon;
            const o = input.origin, d = input.dir;
            // Where the eye is, kept for the one question a build has to ask:
            // is that cube the one I am standing in?
            this._eye = { x: o.x, y: o.y, z: o.z };
            // A weapon reaches as far as it reaches: an arm's length for
            // anything you swing, most of a field for anything you fire. A
            // block is placed at arm's length whatever you are carrying.
            const reach = input.reach || (holdingBlock ? VOX.REACH : this.reach());
            const hit = this._terrain.field.raycast(o.x, o.y, o.z, d.x, d.y, d.z, reach);
            this.target = hit;

            if (!hit) {
                this._progress = 0;
                this._hits = 0;
                this._lastKey = '';
                this._outline.visible = false;
                this._ghost.visible = false;
                return;
            }

            const S = VOX.SIZE;
            const cx = (hit.vx + 0.5) * S, cy = (hit.vy + 0.5) * S, cz = (hit.vz + 0.5) * S;
            this._outline.position.set(cx, cy, cz);
            this._outline.visible = true;
            this._ghost.position.set(cx, cy, cz);

            const key = hit.vx + ':' + hit.vy + ':' + hit.vz;
            if (key !== this._lastKey) {
                this._lastKey = key;
                this._progress = 0;
                this._hits = 0;
            }

            // --- building ---------------------------------------------------
            if (input.place || (input.dig && holdingBlock)) {
                if (this._swingT <= 0) {
                    this._swingT = SWING_TIME * 0.6;
                    this._place(hit);
                }
                this._progress = 0;
                this._ghost.visible = false;
                return;
            }

            // --- digging ----------------------------------------------------
            const def = MATERIALS[hit.mat];
            if (input.dig && def && def.diggable) {
                // The bar has a bottom to it: a cube with nowhere to go is left
                // where it is rather than destroyed for nothing.
                if (!this._bar.canTake(hit.mat)) {
                    this._notifyOnce('barFull', T('VoxelWorld.tool.barFull'));
                    this._progress = 0;
                    this._ghost.visible = false;
                    return;
                }
                const need = this.hitsFor(hit.mat);
                if (this._swingT <= 0) {
                    // The blow itself: the weapon in the leader's hands swings
                    // or fires, with its own sound, and a bite comes out of the
                    // cube. Nothing about digging is silent or still any more.
                    this._strike();
                    this._hits++;
                    this._swingT = this._isRanged() ? SHOT_TIME : SWING_TIME;
                    this._spray(hit.vx, hit.vy, hit.vz, hit.mat, 3);
                    // The bite the blow takes out of it, quieter than the cube
                    // finally giving: the weapon's own sound is over the top.
                    matVoice(hit.mat, 55);
                    if (this._hits >= need) {
                        this._hits = 0;
                        this._progress = 0;
                        this._break(hit);
                        return;
                    }
                }
                this._progress = Math.min(1, this._hits / need);
                this._ghost.visible = true;
                this._ghostMat.opacity = Math.min(0.45, this._progress * 0.45);
            } else {
                if (input.dig && def && !def.diggable) {
                    this._notifyOnce('bedrock', T('VoxelWorld.tool.bedrock'));
                }
                this._progress = 0;
                this._hits = 0;
                this._ghost.visible = false;
            }
        }

        // Is what is in hand fired rather than swung? Anything that reaches
        // past its own arm is.
        _isRanged() { return this._weaponRange(this._weaponNow()) > 1; }

        // Swing it, or fire it. The overlay owns the animation and the sound,
        // and it is the same blow that would have hit a creature standing where
        // the rock is, so it is played through the same door.
        _strike() {
            const W = VW.CamperWeapon;
            if (W && W.swing) { try { W.swing(); } catch (e) { /* no overlay */ } }
        }

        // ---------------------------------------------------------------------
        _break(hit) {
            const mat = this._terrain.field.breakAt(hit.vx, hit.vy, hit.vz);
            if (!mat) return;
            this._spray(hit.vx, hit.vy, hit.vz, mat);
            // Onto the bar it goes. A SEAM is the exception: what comes out of
            // one is worth something in the bags (its own material, see the
            // MATERIALS table) rather than a cube to build a wall out of.
            // Everything else - brick, glass, marble, plank - goes on the bar
            // to be built with, which is the whole point of a block.
            const def = MATERIALS[mat];
            if (def && def.drop && def.seam) this._reward(mat);
            else if (!this._bar.add(mat)) this._notifyOnce('barFull', T('VoxelWorld.tool.barFull'));
            // It comes apart in its own voice, over the crack of it giving.
            this._playSe('Break', 60, 92 + Math.floor(Math.random() * 20));
            matVoice(mat, 100);
            this._lastKey = '';
        }

        _place(hit) {
            // Nothing in hand but the weapon: a weapon does not build.
            if (this._bar.holdingWeapon) {
                this._notifyOnce('noBlock', T('VoxelWorld.tool.noBlock'));
                return;
            }
            const p = hit.place;
            const mat = this._bar.heldMaterial;
            if (!mat) return;
            // A cube never goes where the builder is standing. Aiming down at
            // your own feet to raise a tower otherwise fills the cell the body
            // occupies, and the builder is left inside their own wall.
            if (this._inBuilder(p.vx, p.vy, p.vz)) {
                this._notifyOnce('noRoom', T('VoxelWorld.tool.noRoom'));
                return;
            }
            const ok = this._terrain.field.placeAt(p.vx, p.vy, p.vz, mat);
            if (!ok) {
                this._notifyOnce('noRoom', T('VoxelWorld.tool.noRoom'));
                return;
            }
            this._bar.spendHeld();
            // Set down, in the voice of the thing being set down.
            if (!matVoice(mat, 92)) this._playSe('Equip1', 80, 110);
        }

        // Does that cube overlap the person placing it? The eye is the only
        // thing the tool is told about the builder, so the body is taken as a
        // column of the walker's own width hanging under it.
        _inBuilder(vx, vy, vz) {
            const e = this._eye;
            if (!e) return false;
            const S = VOX.SIZE;
            const hw = S * 0.5 + (FOOT_BODY_R || 4) * 0.85;
            if (Math.abs(e.x - (vx + 0.5) * S) >= hw) return false;
            if (Math.abs(e.z - (vz + 0.5) * S) >= hw) return false;
            const feet = e.y - (FOOT_EYE || 7);
            const head = e.y + S * 0.4;
            return (vy + 1) * S > feet && vy * S < head;
        }

        // Chips in the colour of the cube that just went - a handful off every
        // blow, a shower when it finally gives.
        _spray(vx, vy, vz, mat, n) {
            const S = VOX.SIZE;
            const def = MATERIALS[mat] || MATERIALS[MAT.ROCK];
            let r, g, b;
            if (def.biome) {
                const c = this._terrain.field.genColumn(vx, vz, {});
                r = c.r; g = c.g; b = c.b;
            } else {
                r = def.rgb.r; g = def.rgb.g; b = def.rgb.b;
            }
            this._chips.burst((vx + 0.5) * S, (vy + 0.5) * S, (vz + 0.5) * S, r, g, b, n);
        }

        // A seam is the reason to dig deep in the first place. WHAT it pays is
        // the block's own business: every ore, and every worked block worth
        // salvaging, carries the id of the item in data/Items.json one cube of
        // it is worth (see the MATERIALS table). The old generic seam is the
        // one exception - it predates the split and still pays out of the hat.
        _reward(mat) {
            const def = MATERIALS[mat];
            if (!def || !def.drop) return;
            if (typeof $gameParty === 'undefined' || !$gameParty || typeof $dataItems === 'undefined') return;
            const id = mat === MAT.ORE
                ? ORE_ITEMS[Math.floor(Math.random() * ORE_ITEMS.length)]
                : def.drop;
            const item = $dataItems[id];
            if (!item) return;
            if ($gameParty.numItems(item) >= $gameParty.maxItems(item)) {
                this._notifyOnce('full', T('VoxelWorld.tool.pouchFull'));
                return;
            }
            $gameParty.gainItem(item, 1);
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T('VoxelWorld.tool.struck', { name: item.name }),
                    { icon: item.iconIndex, duration: 150 });
            }
        }

        // The bumper as a plough: a camper shoving into a bank at speed takes
        // cubes out of it instead of stopping dead against a wall of ground.
        // Returns how many went, so the caller can bleed the speed that cost.
        plough(x, y, z, radius) {
            const res = this._terrain.carve(x, y, z, radius);
            if (res.count) {
                const def = MATERIALS[res.mat] || MATERIALS[MAT.ROCK];
                const c = def.biome
                    ? this._terrain.field.genColumn(Math.floor(x / VOX.SIZE), Math.floor(z / VOX.SIZE), {})
                    : def.rgb;
                this._chips.burst(x, y, z, c.r, c.g, c.b, Math.min(24, res.count * 2));
                this._playSe('Earth1', 70, 60);
                matVoice(res.mat, 100);
            }
            return res.count;
        }

        _notifyOnce(tag, text) {
            if (this._lastNote === tag && (this._noteAt || 0) > Date.now() - 2500) return;
            this._lastNote = tag;
            this._noteAt = Date.now();
            if (window.ParchmentToast) window.ParchmentToast.show(text, { duration: 100 });
        }

        _playSe(name, volume, pitch) {
            try { AudioManager.playSe({ name, volume, pitch, pan: 0 }); } catch (e) { /* no such SE */ }
        }

        dispose() {
            this._chips.dispose();
            this._scene.remove(this._outline);
            this._scene.remove(this._ghost);
            this._outline.geometry.dispose();
            this._outline.material.dispose();
            this._boxGeo.dispose();
            this._ghostMat.dispose();
            this.target = null;
        }
    }

    // Kept off the hot path but useful to anything that wants the same jitter
    // the mesher uses (a preview, a test harness).
    VoxelTool.hash = voxelHash3;

    // Handed to the rest of the suite.
    Object.assign(VW, {
        VoxelTool, ChipFx, BlockBar, SpellCaster, matName, matColour,
        isHealingSkill, BAR_MODES, BAR_SLOTS, SLOT_MAX, SPELL_SLOTS
    });
})();
