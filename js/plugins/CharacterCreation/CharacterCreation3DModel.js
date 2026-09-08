//=============================================================================
// CharacterCreation3DModel.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v4.1] Spore-style creature sculptor: the body it is made of and the parts to put on it down the left, the creature filling the rest, and what you build is the anatomy you fight with.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help CharacterCreation3DModel.js
 *
 * The editor a creature character is built in. A person is always portrayed by
 * a hand-drawn bust and a creature always by its sculpted model, so this scene
 * is the creature's half of that rule and is never asked about.
 *
 * The screen
 * ----------
 * A bar across the top, two sidebars down the left, and the creature filling
 * everything that is left:
 *
 *   TOP BAR   what the creature IS and what to do to all of it at once: its
 *             body, mirror symmetry, undo, redo, a reroll, the variation seed,
 *             and the way out.
 *   BODY      the first column: the anatomy the sculpt adds up to, every part
 *             with the share of HP it carries, where it came from and whether
 *             losing it is fatal. Every row that names a part of the MODEL is a
 *             way into it -- pointing at one selects it on the creature and
 *             stocks the shelf beside it -- so the list of what the creature is
 *             made of doubles as the way to change it. "+ Add part" at its head
 *             opens the chooser of every group, including the ones the creature
 *             is not wearing anything in and the two that are not parts at all
 *             (how the body is Built, how its Skin is coloured).
 *   PARTS     the second column: the open group. For a limb, a search box over
 *             a shelf of the real parts three across, each a small static
 *             render of itself; for an appendage, its states; for Build or
 *             Skin, their knobs.
 *   STAGE     the creature, with the sizer for whatever is selected in its
 *             bottom-right corner.
 *
 * Sculpting
 * ---------
 * Click a card and its part goes on. Nothing is carried across the screen, and
 * merely POINTING at a card changes nothing: the creature only ever shows what
 * has actually been sculpted, and a card's own picture is what a part is judged
 * by before it is chosen.
 *
 * ANY part of ANY creature can be worn ANYWHERE. A donor with no exact match
 * for the slot gives its nearest part instead -- a wing, a claw or a tentacle
 * all answer for an arm -- and a creature with no limb of its own there hangs
 * the part off its body (hostBodyCarrier) to be dragged into place. So the
 * shelf offers the whole roster for every slot, with the anatomically obvious
 * answers listed first, and every slot is offered on every creature.
 *
 * Any part of the creature can then be grabbed and dragged -- a fitted part or
 * one of the body's own limbs alike -- and dragging does whichever of Move,
 * Turn or Size is armed. The same three handles are drawn on the creature
 * (arrows, rings, a box) and mirrored by the sliders in the panel over it, so
 * turning a part never depends on catching a thin ring.
 *
 * A part can never come loose: every placement goes through snapXf(), which
 * shortens the offset until the part still overlaps the limb it hangs from.
 * The offset sliders are drawn against exactly that reach.
 *
 * Mirror symmetry, on by default, echoes every left-side edit onto the right,
 * flipped, and a mirrored pair wearing one donor shares a single donor seed so
 * both sides come out the same size, shape and colour.
 *
 * The TORSO is not sculptable: it is what the creature IS and everything hangs
 * off it. It is listed in the anatomy; it just cannot be picked, worn over or
 * dragged.
 *
 * Nothing is a one-way door: every gesture stows the creature it changed, so
 * Undo (or Ctrl+Z) puts it back. Snapshots are taken at the START of a gesture,
 * so a drag is one step back rather than a hundred.
 *
 * The creature NEVER animates here. It is posed exactly once, when it is built,
 * and then stands still -- a rig that breathes drags every part out from under
 * the cursor. A graft rides that pose as a child of its anchor; a bare limb IS
 * the anchor, so poseBareSlots seats those on top of the pose.
 *
 * Where a creature comes from
 * ---------------------------
 * Picking an archetype on the creature board opens the editor on an EXISTING
 * MONSTER of that kind (modelForArchetype, dealt deterministically from
 * $dataEnemies' <Archetype:> tags), which is then free to be re-sculpted. A
 * SECOND archetype is spliced on as extra parts: its limbs, always in matched
 * pairs, over every arm and leg the body can wear them on. Changing the board's
 * pick later goes through applyArchetypesToConfig, which only rebuilds the body
 * when the PRIMARY changed and otherwise swaps just the limbs the previous
 * splice put there, so hand-fitted parts survive.
 *
 * The editor only opens on a body it can WORK on: isSculptable rejects a model
 * with no part map behind it. Randomize rerolls everything ABOUT the creature
 * but never the creature itself.
 *
 * The body behind the model
 * -------------------------
 * A part fitted here joins the character's BIOLOGY: the donor archetype's own
 * part for that slot (its HP share, its vital flag, its skills) replaces the
 * one it was fitted over. anatomyFor() is what the right-hand column lists;
 * graftedParts() is the record written onto the actor as _ccGraftedParts /
 * _ccReplacedParts, which Health_Core's initializeBodyParts folds over the
 * archetypes' own anatomy. So a dragon head worn here is a dragon head in the
 * health menu, in the equip screen and in a fight.
 *
 * Part pictures
 * -------------
 * A shelf card carries a small STATIC render of the real part, built once and
 * kept as a data URL keyed by (slot, donor). They are taken on a renderer of
 * their own, on a 72px offscreen canvas with `preserveDrawingBuffer`: sharing
 * the creature's renderer and lifting the pixels out of its drawing buffer is a
 * trick that depends on nothing having composited the frame yet, and when it
 * misses there is no picture at all -- a shelf of empty black squares. That is
 * ONE extra WebGL context, opened once and released on the way out; the cap the
 * browser force-loses the oldest context at is far above three. Pictures are
 * asked for as their card scrolls into view and dealt one per frame, because
 * each costs a whole donor model to build.
 *
 * One mesh belongs to ONE slot, and the model root belongs to none. The
 * compatibility table dedupes by part KEY, which is not enough: two keys can
 * name the same mesh at runtime, and some families alias the body to the model
 * root -- tagging that made every click select the torso. indexSlotMeshes
 * claims each mesh once and skips the root, and the rail is drawn from the
 * anchors that really resolved rather than from what the table promised.
 *
 * Which archetypes a slot may wear is precomputed in
 * js/db/Battler3D/PartCompatibility.json by
 * tools/battler3d/scripts/gen_part_compatibility.py; re-run that script after
 * editing any 3DBattler_*.js family file's part map/registration, or PART_SLOTS
 * / BODY_KEYS below.
 *
 * Public API (all guarded, safe when the 3D system is absent):
 *   window.CC3DModel.isAvailable()
 *   window.CC3DModel.getConfig(actorId) / setConfig(actorId, cfg)
 *   window.CC3DModel.getCreatureSeed(actorId) / setCreatureSeed(actorId, s)
 *   window.CC3DModel.buildModel(cfg, actorId) -> Promise<battler|null>
 *   window.CC3DModel.withGenSeed(seed, fn)
 *   window.CC3DModel.partGroups(baseKey) / editableSlots(baseKey) / groupLabel(id)
 *   window.CC3DModel.snapXf(anchor, slot, xf) / slotReach(anchor, slot, xf)
 *   window.CC3DModel.modelForArchetype(healthKey, seed)
 *   window.CC3DModel.configFromArchetypes(keys) / applyArchetypesToConfig(cfg, keys)
 *   window.CC3DModel.anatomyFor(cfg, keys) / graftedParts(cfg, keys)
 *   window.Scene_CC3DModel.setup(actorId, returnSceneClass, options)
 *
 * Load AFTER Battler3D/3DBattlerSystem and Battler3D/3DBattler_Humanoid.
 */

(() => {
  "use strict";


  //===========================================================================
  // Constants
  //===========================================================================

  // Humanoid body presets offered as the base rig (must exist in
  // window.Battler3D.CREATURE_PROFILES; missing ones are filtered out).
  const BODY_KEYS = [
    "humanoid", "humanoid_roguelite", "elven", "gnome", "goblin", "hobgoblin",
    "orc", "ogre", "skeleton", "undead", "vampire", "reptilian", "minotaur",
    "demon", "wingeddemon", "angel", "fairy", "scarecrow", "robot", "golem",
    "armoredknight", "constructedundead", "doubleheadedhumanoid", "roboticdefender"
  ];
  const TEXTURE_POOL_KEYS = ["flesh", "green", "bone", "metal", "stone"];

  // Hair styles / colours come from the shared Battler3D hair library so the
  // creator can never drift from what the rig actually knows how to build. The
  // fallbacks keep the pickers usable if an older core is loaded.
  function hairLib() { return (window.Battler3D && window.Battler3D.Hair) || null; }
  function hairStyleKeys() {
    const H = hairLib();
    return (H && H.STYLES && H.STYLES.length) ? H.STYLES : ["short", "bald"];
  }
  function hairColorKeys() {
    const H = hairLib();
    return (H && H.COLOR_KEYS && H.COLOR_KEYS.length) ? H.COLOR_KEYS : ["brown"];
  }
  function hairColorHex(key) {
    const H = hairLib();
    return H && H.colorHex ? H.colorHex(key) : 0x5c3b22;
  }
  function hairSwatchCss(key) {
    return "#" + ("000000" + hairColorHex(key).toString(16)).slice(-6);
  }
  // Player-facing names for the library's keys. Anything the library adds later
  // falls through to the generic prettifier rather than showing blank.
  function hairLabel(kind, key) {
    const full = kind === "haircolor"
      ? 'CharCreate.hairColor.' + key
      : 'CharCreate.hairStyle.' + key;
    return T.has(full) ? T(full) : prettyArchetypeName(key);
  }
  // Hair is scalp-only: a body made of bone/metal/stone never grows it, matching
  // the rig's own rule, so the picker does not promise something it will ignore.
  function hairApplies(cfg) {
    return ["bone", "metal", "stone"].indexOf(cfg.texturePool) < 0;
  }

  // Anatomical slots on the humanoid rig. Each donor part is grafted onto the
  // slot's ANCHOR mesh (which the rig FK-animates, so the graft moves with the
  // body). `hideMats` meshes have their own visual muted (material.visible)
  // while still anchoring children; `hideMeshes` are fully hidden (they carry
  // no graft). `donorKeys` are tried in order against the donor's part map,
  // then a whole-model fallback. `fit` is the target size in rig units.
  // `seed` offsets the donor RNG so different slots of the SAME archetype vary.
  const PART_SLOTS = {
    head: {
      order: 0, label: () => T('CharCreate.head'),
      anchor: (b) => b.head, hideMats: (b) => [b.head], hideMeshes: () => [],
      donorKeys: ["HEAD", "SKULL", "HEAD_ONE", "HEAD_LEFT", "BEAK", "CEPHALOTHORAX", "CORE", "BRAIN"],
      family: ["HEAD", "SKULL", "BEAK", "MAW", "FACE", "CEPHALO", "BRAIN", "EYE", "CORE"],
      fit: 0.9, seed: 7919
    },
    torso: {
      order: 1, label: () => T('CharCreate.torso'),
      anchor: (b) => b.torso, hideMats: (b) => [b.torso], hideMeshes: () => [],
      donorKeys: ["TORSO", "BODY", "MASS", "ABDOMEN", "RIBCAGE", "CORE", "CHESTPLATE"],
      family: ["TORSO", "BODY", "ABDOMEN", "MASS", "RIBCAGE", "SHELL", "CHEST"],
      fit: 1.0, seed: 104729
    },
    armL: {
      order: 2, label: () => T('CharCreate.leftArm'),
      anchor: (b) => b.leftUpperArm, hideMats: (b) => [b.leftUpperArm],
      hideMeshes: (b) => [b.leftForearm, b.leftHand],
      donorKeys: ["LEFT_ARM", "LEFT_UPPER_ARM", "ARM", "LEFT_WING", "LEFT_LEG"],
      family: ["ARM", "WING", "CLAW", "PINCER", "TENTACLE", "HAND", "LIMB", "LEG"],
      side: "LEFT", fit: 0.6, seed: 1299709
    },
    armR: {
      order: 3, label: () => T('CharCreate.rightArm'),
      anchor: (b) => b.rightUpperArm, hideMats: (b) => [b.rightUpperArm],
      hideMeshes: (b) => [b.rightForearm, b.rightHand],
      donorKeys: ["RIGHT_ARM", "RIGHT_UPPER_ARM", "ARM", "RIGHT_WING", "RIGHT_LEG"],
      family: ["ARM", "WING", "CLAW", "PINCER", "TENTACLE", "HAND", "LIMB", "LEG"],
      side: "RIGHT", fit: 0.6, seed: 15485863
    },
    legL: {
      order: 4, label: () => T('CharCreate.leftLeg'),
      anchor: (b) => b.leftThigh, hideMats: (b) => [b.leftThigh],
      hideMeshes: (b) => [b.leftShin, b.leftFoot],
      donorKeys: ["LEFT_LEG", "LEFT_THIGH", "LEG", "TALONS", "TAIL"],
      family: ["LEG", "THIGH", "TALON", "FOOT", "HOOF", "TAIL", "LIMB", "ARM", "TENTACLE"],
      side: "LEFT", fit: 0.62, seed: 179424673
    },
    legR: {
      order: 5, label: () => T('CharCreate.rightLeg'),
      anchor: (b) => b.rightThigh, hideMats: (b) => [b.rightThigh],
      hideMeshes: (b) => [b.rightShin, b.rightFoot],
      donorKeys: ["RIGHT_LEG", "RIGHT_THIGH", "LEG", "TALONS", "TAIL"],
      family: ["LEG", "THIGH", "TALON", "FOOT", "HOOF", "TAIL", "LIMB", "ARM", "TENTACLE"],
      side: "RIGHT", fit: 0.62, seed: 32452843
    }
  };
  const SLOT_NAMES = Object.keys(PART_SLOTS).sort((a, b) => PART_SLOTS[a].order - PART_SLOTS[b].order);

  // Curated humanoid head presets, listed at the TOP of the head picker before
  // the ~600 creature archetypes. Each builds a bespoke head (skin-matched to
  // the body) so the roster reads as humanoid variety rather than goblin clones.
  // Ear shapes: 'round' (default, non-goblin), 'pointed' (goblin), 'long' (elf),
  // 'big' (large round), 'none'. The pointed-ear look the base rig used to wear
  // is preserved here as "Goblin Head". Keys are referenced as `hhead:<key>`.
  const HUMANOID_HEADS = [
    { key: "human", name: () => T('CharCreate.human'), ear: "round", nose: 0.9, shape: [1, 1, 1] },
    { key: "goblin", name: () => T('CharCreate.goblinHead'), ear: "pointed", nose: 1.0, shape: [1, 1, 1] },
    { key: "elf", name: () => T('CharCreate.elf'), ear: "long", nose: 0.75, shape: [0.95, 1.06, 0.95] },
    { key: "round", name: () => T('CharCreate.rounded'), ear: "round", nose: 0.8, shape: [1.12, 1.05, 1.12] },
    { key: "narrow", name: () => T('CharCreate.narrow'), ear: "round", nose: 1.0, shape: [0.85, 1.12, 0.95] },
    { key: "square", name: () => T('CharCreate.squareJaw'), ear: "round", nose: 1.0, shape: [1.05, 0.96, 1.0], jaw: 1 },
    { key: "youthful", name: () => T('CharCreate.youthful'), ear: "round", nose: 0.65, shape: [1.05, 0.95, 1.05], eyeBig: 1 },
    { key: "elder", name: () => T('CharCreate.elder'), ear: "big", nose: 1.35, shape: [0.95, 1.0, 0.95], brow: 1 },
    { key: "bigears", name: () => T('CharCreate.bigEars'), ear: "big", nose: 0.85, shape: [1.0, 1.0, 1.0] },
    { key: "orcish", name: () => T('CharCreate.orcish'), ear: "round", nose: 0.6, shape: [1.1, 1.0, 1.05], fangs: 2, brow: 1 },
    { key: "tusked", name: () => T('CharCreate.tusked'), ear: "round", nose: 0.8, shape: [1.05, 1.0, 1.05], fangs: 2 },
    { key: "fanged", name: () => T('CharCreate.fanged'), ear: "pointed", nose: 0.9, shape: [1.0, 1.0, 1.0], fangs: 1 },
    { key: "beastkin", name: () => T('CharCreate.beastkin'), ear: "pointed", nose: 1.1, shape: [1.0, 0.98, 1.06], snout: 1, fangs: 2 },
    { key: "longface", name: () => T('CharCreate.longFace'), ear: "round", nose: 1.1, shape: [0.9, 1.16, 0.95] },
    { key: "flat", name: () => T('CharCreate.flatFace'), ear: "none", nose: 0.4, shape: [1.06, 1.0, 0.9] },
    { key: "horned", name: () => T('CharCreate.horned'), ear: "round", nose: 0.9, shape: [1.0, 1.0, 1.0], horns: 1 },
    { key: "cyclops", name: () => T('CharCreate.cyclops'), ear: "round", nose: 0.9, shape: [1.0, 1.0, 1.0], oneEye: 1 }
  ];
  const HUMANOID_HEAD_MAP = {};
  HUMANOID_HEADS.forEach((h) => { HUMANOID_HEAD_MAP[h.key] = h; });
  const HHEAD_PREFIX = "hhead:";
  const isHeadPreset = (v) => typeof v === "string" && v.indexOf(HHEAD_PREFIX) === 0;

  // Body-preset keyword map: infers the starting body from the bust/sprite name
  // chosen in the previous step (elf portrait -> elven body, etc.).
  const BASE_KEYWORDS = [
    ["hobgoblin", "hobgoblin"], ["goblin", "goblin"], ["orc", "orc"], ["ogre", "ogre"],
    ["elven", "elven"], ["elf", "elven"], ["skeleton", "skeleton"], ["skull", "skeleton"],
    ["undead", "undead"], ["zombie", "undead"], ["ghoul", "undead"], ["vampire", "vampire"],
    ["demon", "demon"], ["fiend", "demon"], ["angel", "angel"], ["fairy", "fairy"], ["pixie", "fairy"],
    ["gnome", "gnome"], ["dwarf", "gnome"], ["robot", "robot"], ["android", "robot"], ["cyborg", "robot"],
    ["golem", "golem"], ["knight", "armoredknight"], ["paladin", "armoredknight"],
    ["reptil", "reptilian"], ["lizard", "reptilian"], ["minotaur", "minotaur"], ["scarecrow", "scarecrow"]
  ];

  //===========================================================================
  // Availability + persistence
  //===========================================================================

  function isAvailable() {
    return typeof THREE !== "undefined" &&
      !!(window.Battler3D && window.Battler3D.create && window.Battler3D.createCustomHumanoid);
  }

  function configStore() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    if (!$gameSystem._cc3DModelByActor) $gameSystem._cc3DModelByActor = {};
    return $gameSystem._cc3DModelByActor;
  }
  function seedStore() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    if (!$gameSystem._cc3DSeedByActor) $gameSystem._cc3DSeedByActor = {};
    return $gameSystem._cc3DSeedByActor;
  }

  function getConfig(actorId) {
    const s = configStore();
    return (s && s[actorId]) ? normalizeConfig(s[actorId]) : null;
  }
  function setConfig(actorId, cfg) {
    const s = configStore();
    if (!s) return;
    if (cfg) s[actorId] = JSON.parse(JSON.stringify(normalizeConfig(cfg)));
    else delete s[actorId];
  }
  function getCreatureSeed(actorId) {
    const s = seedStore();
    return (s && s[actorId]) || null;
  }
  function setCreatureSeed(actorId, seed) {
    const s = seedStore();
    if (!s) return;
    if (seed) s[actorId] = seed;
    else delete s[actorId];
  }

  function defaultParts() {
    const p = {};
    SLOT_NAMES.forEach((k) => { p[k] = "default"; });
    return p;
  }

  // Where a grafted part sits on its anchor, relative to the neat default fit:
  // an offset in anchor-local units, a rotation in radians and a size multiplier
  // over the fitted scale. This is what the sculptor's drag writes to, so a
  // wing can be pulled up onto a shoulder or a head pushed forward on its neck
  // instead of every donor snapping to the same spot.
  function defaultXf() {
    return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 };
  }
  function defaultPartXf() {
    const p = {};
    SLOT_NAMES.forEach((k) => { p[k] = defaultXf(); });
    return p;
  }

  function defaultConfig() {
    return {
      base: "humanoid",
      parts: defaultParts(),
      partXf: defaultPartXf(),
      // Which model the second archetype put on the limbs, so a later change of
      // second half knows what it is replacing and leaves the player's own
      // hand-fitted parts alone.
      secondary: null,
      symmetry: "mirror",
      seed: 1,
      height: 1.0, bulk: 1.0, headSize: 1.0, ears: 0.8, nose: 0.9,
      hue: 0.07, sat: 0.45, lit: 0.5, texturePool: "flesh",
      hairStyle: "short", hairColor: "darkbrown",
      fangs: 0, horns: 0, tail: 0, wings: 0, halo: 0
    };
  }

  // Fill in any missing keys and migrate the legacy flat `head` field into the
  // parts object, so configs saved by v1.0 keep working. A config saved before
  // the sculptor existed simply has every graft sitting at its default fit.
  function normalizeConfig(cfg) {
    const out = Object.assign(defaultConfig(), cfg || {});
    out.parts = Object.assign(defaultParts(), (cfg && cfg.parts) || {});
    const xf = defaultPartXf();
    SLOT_NAMES.forEach((k) => {
      const src = cfg && cfg.partXf && cfg.partXf[k];
      if (src) xf[k] = Object.assign(defaultXf(), src);
    });
    out.partXf = xf;
    if (out.symmetry !== "off") out.symmetry = "mirror";
    // Whatever a save, a preset or an older build put there, the torso is the
    // body's own: there is no such thing as a grafted one.
    Object.keys(FIXED_SLOTS).forEach((slot) => {
      out.parts[slot] = "default";
      out.partXf[slot] = defaultXf();
    });
    if (cfg && cfg.head && cfg.head !== "default" && (!cfg.parts || !cfg.parts.head)) {
      out.parts.head = cfg.head;
    }
    delete out.head;
    return out;
  }

  // The slot a left/right edit is echoed onto while mirror symmetry is on. The
  // rig's two sides share one local orientation, so an outward offset mirrors
  // by negating X (and the yaw/roll that go with it).
  const MIRROR_PAIR = { armL: "armR", armR: "armL", legL: "legR", legR: "legL" };
  function mirrorTargets(cfg, slot) {
    if (!cfg || cfg.symmetry !== "mirror") return [slot];
    const pair = MIRROR_PAIR[slot];
    return pair ? [slot, pair] : [slot];
  }
  function mirrorXf(xf) {
    return { x: -xf.x, y: xf.y, z: xf.z, rx: xf.rx, ry: -xf.ry, rz: -xf.rz, s: xf.s };
  }

  //===========================================================================
  // Option lists
  //===========================================================================

  function bodyOptions() {
    const P = (window.Battler3D && window.Battler3D.CREATURE_PROFILES) || {};
    const keys = BODY_KEYS.filter((k) => !!P[k]);
    return keys.length ? keys : ["humanoid"];
  }

  // A humanoid base uses the biped rig (part-swappable). Any other archetype is
  // treated as a whole non-humanoid "skeleton structure" built directly. Only
  // the creature editor offers the non-humanoid structures; humanoid party
  // members are restricted to bodyOptions().
  const _bodySet = new Set(BODY_KEYS);
  function isHumanoidBase(key) {
    return _bodySet.has(key);
  }

  // Structure roster for the creature editor: the editable humanoid presets
  // first, then every non-humanoid archetype skeleton (quadruped, serpent,
  // arachnid, avian, draconic, ooze, ...), each built whole with a seed-driven
  // look. Used only in creature mode.
  function structureOptions() {
    const hum = bodyOptions();
    const humSet = new Set(hum);
    // A structure with no part map behind it cannot be sculpted at all, so it
    // is not offered: picking one used to leave the editor answering every
    // click with a buzzer.
    const rest = allArchetypes().filter((k) => !humSet.has(k) && isSculptable(k));
    return hum.concat(rest);
  }

  // Every registered archetype, sorted, cached (the registry is fixed at load).
  let _archCache = null;
  function allArchetypes() {
    if (_archCache) return _archCache;
    let keys = [];
    if (window.Battler3D && window.Battler3D.list) keys = window.Battler3D.list().slice();
    _archCache = keys.sort();
    return _archCache;
  }

  // Battler3D registers its structures under lowercase keys ("gorgon"), while
  // Health/Archetypes.json names the very same creatures in CamelCase
  // ("Gorgon"). Character creation carries the Health spelling around, so every
  // key that reaches the 3D side goes through here first: without it a creature
  // built from an Archetypes.json key matched nothing and silently fell back to
  // the default humanoid config, which is why a picked archetype never showed
  // up on the model. Returns null for anything with no registered structure.
  let _lowerIndex = null;
  function canonicalArchetypeKey(key) {
    if (!key) return null;
    const raw = String(key);
    if (!_lowerIndex) {
      _lowerIndex = {};
      allArchetypes().forEach((k) => { _lowerIndex[k.toLowerCase()] = k; });
    }
    return _lowerIndex[raw.toLowerCase()] || null;
  }

  // Precomputed archetype -> slot -> matched donorKey (or null), generated by
  // tools/battler3d/scripts/gen_part_compatibility.py from the real per-archetype
  // _partMeshMap contents; re-run that script after touching any 3DBattler_*.js
  // family file's part map or registration, or PART_SLOTS/BODY_KEYS below.
  function partCompatibility() {
    return (window.Battler3D && window.Battler3D.PartCompatibility) || {};
  }

  // Does this archetype actually have a matching mesh for this slot? Humanoid
  // bases always do (the rig has every part); everything else is looked up in
  // the generated compatibility table (absent/stale data -> not compatible,
  // never silently "everything matches").
  function isSlotCompatible(archetypeKey, slot) {
    if (isHumanoidBase(archetypeKey)) return true;
    const entry = partCompatibility()[archetypeKey];
    return !!(entry && entry[slot]);
  }

  // Every registered archetype that has a real matching part for this slot
  // (excludes donors that would otherwise silently graft their whole model,
  // shrunk down, onto the anchor). Cached per slot like allArchetypes().
  let _compatCache = {};
  function compatibleArchetypesForSlot(slot) {
    if (_compatCache[slot]) return _compatCache[slot];
    const list = allArchetypes().filter((k) => isSlotCompatible(k, slot));
    _compatCache[slot] = list;
    return list;
  }

  // The specific _partMeshMap key an archetype matched for this slot (used both
  // as a donor's part-picker filter above, and -- for a non-humanoid creature
  // STRUCTURE acting as the HOST/base -- to find which of its own meshes a
  // slot should graft onto). Humanoid bases use their own hardcoded rig
  // properties instead (see PART_SLOTS' anchor()), so this only applies to
  // non-humanoid hosts/donors.
  function matchedDonorKeyForSlot(archetypeKey, slot) {
    const entry = partCompatibility()[archetypeKey];
    return (entry && entry[slot]) || null;
  }

  // Which of the 6 slots a creature STRUCTURE (a non-humanoid base) genuinely
  // has a distinct part for. A humanoid base supports all 6 by construction.
  // A non-humanoid base's slots are deduped by matched mesh key: e.g. a spider
  // has no real arms, but armL/armR's donorKeys fall back to LEFT_LEG/RIGHT_LEG
  // (the same mesh legL/legR already claim) -- exposing both would graft two
  // different donors onto the exact same physical leg. Checked in head/torso/
  // legs-before-arms order, so a single-blob creature (e.g. an ooze, where
  // both head and torso map to CORE) shows one "Head" row instead of a
  // duplicate "Torso" row, and shared limbs read as legs rather than arms.
  let _hostSlotsCache = {};
  function hostSupportedSlots(baseKey) {
    if (isHumanoidBase(baseKey)) return SLOT_NAMES.slice();
    if (_hostSlotsCache[baseKey]) return _hostSlotsCache[baseKey];
    const claimed = new Set();
    const supported = new Set();
    ["head", "torso", "legL", "legR", "armL", "armR"].forEach((slot) => {
      const key = matchedDonorKeyForSlot(baseKey, slot);
      if (!key || claimed.has(key)) return;
      claimed.add(key);
      supported.add(slot);
    });
    const ordered = SLOT_NAMES.filter((s) => supported.has(s));
    _hostSlotsCache[baseKey] = ordered;
    return ordered;
  }

  // The torso is what the creature IS, and everything else hangs off it: swapping
  // it or reshaping it deforms the whole body rather than editing a part of it.
  // So it is the one slot the sculptor never touches -- it is still listed in
  // the body's anatomy, it just cannot be picked, dropped on, or dragged.
  const FIXED_SLOTS = { torso: true };

  // The slots the sculptor offers on a body: ALL of them, minus the ones it is
  // not allowed to change. A creature is not held to the anatomy it was born
  // with -- a serpent can be given arms, a spider a head -- because a slot the
  // body has no limb of its own for hangs the part off its trunk instead
  // (hostBodyCarrier) and it is then dragged into place like any other. A body
  // with nothing to hang anything off at all offers nothing.
  function editableSlots(baseKey) {
    if (!hostBodyKeys(baseKey).length) return [];
    return SLOT_NAMES.filter((slot) => !FIXED_SLOTS[slot]);
  }

  // The part keys a body actually has on file, which is what says whether there
  // is anything to build on at all.
  function hostBodyKeys(baseKey) {
    if (isHumanoidBase(baseKey)) return SLOT_NAMES.slice();
    const entry = partCompatibility()[baseKey];
    if (!entry) return [];
    return Object.keys(entry).filter((slot) => entry[slot]);
  }

  // The APPENDAGES a body can grow: not slots on the rig but features of the
  // profile it is built from, which is why only the biped rig has them. They
  // are browsed alongside the slots as groups of their own, so "give it wings"
  // is found where a player looks for it rather than buried among the sliders.
  const APPENDAGE_GROUPS = [
    { key: "ears", label: () => T('CharCreate.ears'), kind: "slider" },
    { key: "horns", label: () => T('CharCreate.horns'), kind: "segment", states: [0, 1, 2],
      labels: () => [T('CharCreate.none3'), T('CharCreate.small'), T('CharCreate.large')] },
    { key: "fangs", label: () => T('CharCreate.fangs'), kind: "segment", states: [0, 1, 2],
      labels: () => [T('CharCreate.none3'), T('CharCreate.small'), T('CharCreate.large')] },
    { key: "wings", label: () => T('CharCreate.wings'), kind: "segment", states: [0, 1],
      labels: () => [T('CharCreate.no'), T('CharCreate.yes')] },
    { key: "tail", label: () => T('CharCreate.tail'), kind: "segment", states: [0, 1],
      labels: () => [T('CharCreate.no'), T('CharCreate.yes')] },
    { key: "halo", label: () => T('CharCreate.halo'), kind: "segment", states: [0, 1],
      labels: () => [T('CharCreate.no'), T('CharCreate.yes')] }
  ];
  const APPENDAGE_MAP = {};
  APPENDAGE_GROUPS.forEach((g) => { APPENDAGE_MAP[g.key] = g; });

  // Every group of body parts a body offers, in the order they are browsed: the
  // slots it really has, then -- on a biped rig -- the appendages it can grow.
  function partGroups(baseKey) {
    const groups = editableSlots(baseKey).map((slot) => ({ id: slot, kind: "slot" }));
    if (isHumanoidBase(baseKey)) {
      APPENDAGE_GROUPS.forEach((g) => groups.push({ id: g.key, kind: g.kind, appendage: g }));
    }
    return groups;
  }

  function groupLabel(id) {
    return APPENDAGE_MAP[id] ? APPENDAGE_MAP[id].label() : slotLabel(id);
  }

  // Any creature can lend any slot a part. The ones with a REAL matching mesh
  // are listed first, so the anatomically obvious answers are at the top of the
  // shelf and the rest of the roster follows -- offered, not hidden.
  let _slotRosterCache = {};
  function partOptions(slot) {
    if (_slotRosterCache[slot]) return _slotRosterCache[slot];
    const matching = compatibleArchetypesForSlot(slot);
    const known = new Set(matching);
    const rest = allArchetypes().filter((key) => !known.has(key));
    _slotRosterCache[slot] = ["default"].concat(matching, rest);
    return _slotRosterCache[slot];
  }

  // The head slot lists the curated humanoid heads first, then every
  // slot-compatible archetype.
  function optionsForSlot(slot) {
    if (slot === "head") {
      return ["default"]
        .concat(HUMANOID_HEADS.map((h) => HHEAD_PREFIX + h.key))
        .concat(partOptions("head").slice(1));
    }
    return partOptions(slot);
  }

  // Turn a raw archetype key into a readable label: drop the short family
  // namespace prefix (fk_, flk_, gob_, hmn_, ...), split camelCase / digit
  // boundaries into words, and capitalise. "fk_terragolem" -> "Terragolem",
  // "flk_banditChief" -> "Bandit Chief". A prefix is only stripped when it is a
  // short (2-4 char) token before an underscore, so keys like
  // "humanoid_roguelite" keep their meaningful first word.
  function prettyArchetypeName(key) {
    let s = String(key || "").replace(/^[a-z]{2,4}_/, "");
    s = s.replace(/_/g, " ")
         .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
         .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
         .trim();
    if (!s) s = String(key || "");
    return s.split(/\s+/).map((w) => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
  }

  function displayName(key) {
    if (key === "default") return T('CharCreate.default');
    if (isHeadPreset(key)) {
      const h = HUMANOID_HEAD_MAP[key.slice(HHEAD_PREFIX.length)];
      return h ? h.name() : key;
    }
    return prettyArchetypeName(key);
  }

  // Infer a starting body preset from a bust/sprite/category name.
  function suggestBaseFromName(str) {
    if (!str) return null;
    const s = String(str).toLowerCase();
    const bodies = bodyOptions();
    for (const [kw, base] of BASE_KEYWORDS) {
      if (s.indexOf(kw) !== -1 && bodies.indexOf(base) !== -1) return base;
    }
    return null;
  }

  // Build a starting config for a CUSTOM CREATURE from the archetype(s) the
  // player picked on the archetype board.
  //
  // The PRIMARY archetype opens the editor on a real monster of that kind --
  // an existing enemy's own 3D model, dealt deterministically from the
  // archetype -- so "Dragon" starts as a dragon that already looks like
  // something, and every slot on it is then free to be re-sculpted.
  //
  // A SECONDARY archetype is spliced on as EXTRA PARTS: its limbs are grafted
  // onto every arm and leg the body supports and can wear them, leaving the
  // primary's own head and torso alone, so the hybrid reads as "this monster,
  // with those limbs" -- and each grafted limb stays editable like any other.
  function configFromArchetypes(keys) {
    const cfg = defaultConfig();
    const list = (keys || []).filter(Boolean);
    if (!list.length) return cfg;
    const primary = list[0];
    const base = modelForArchetype(primary, cfg.seed) || canonicalArchetypeKey(primary);
    if (!base) return cfg;
    cfg.base = base;

    const secondary = list[1] ? (modelForArchetype(list[1], cfg.seed) || canonicalArchetypeKey(list[1])) : null;
    cfg.secondary = secondary;
    if (secondary) spliceLimbs(cfg, secondary);

    // A humanoid-family base is the one case where the biped knobs still apply,
    // so it borrows its profile's own skin tone and the body underneath the
    // grafts matches. Ignored for a whole non-humanoid structure.
    const P = (window.Battler3D && window.Battler3D.CREATURE_PROFILES) || {};
    const prof = P[base];
    if (prof) {
      if (prof.hue) cfg.hue = prof.hue[0];
      if (prof.sat) cfg.sat = prof.sat[0];
      if (prof.lit) cfg.lit = Math.min(0.7, prof.lit[0]);
    }
    return cfg;
  }

  // Hang a donor's limbs off a body, ALWAYS in matched pairs: an arm or a leg
  // the donor can only fill on one side is left off entirely, so a spliced body
  // is never accidentally lopsided. Both sides of a pair start at the same
  // placement and share one donor seed (donorSeedFor), so they come out mirror
  // images of each other rather than two unrelated limbs.
  function spliceLimbs(cfg, donor, onlyOver) {
    const supported = editableSlots(cfg.base);
    const has = (slot) => supported.indexOf(slot) >= 0;
    const free = (slot) => !onlyOver || onlyOver(slot);
    [["armL", "armR"], ["legL", "legR"]].forEach((pair) => {
      const [l, r] = pair;
      if (!has(l) || !has(r)) return;
      if (!isSlotCompatible(donor, l) || !isSlotCompatible(donor, r)) return;
      if (!free(l) || !free(r)) return;
      pair.forEach((slot) => { cfg.parts[slot] = donor; cfg.partXf[slot] = defaultXf(); });
    });
    // A body with a single limb where others have a pair still gets one.
    supported.forEach((slot) => {
      if (slot === "head" || slot === "torso") return;
      const pair = MIRROR_PAIR[slot];
      if (pair && has(pair)) return;             // settled above, as a pair
      if (!isSlotCompatible(donor, slot) || !free(slot)) return;
      cfg.parts[slot] = donor;
      cfg.partXf[slot] = defaultXf();
    });
  }

  // Put the archetype board's pick onto a model that may already have been
  // sculpted. A different PRIMARY is a different creature, so the body starts
  // again from that monster; a changed SECOND half only swaps the limbs the
  // previous splice put there, leaving every part the player fitted by hand
  // exactly where they left it.
  function applyArchetypesToConfig(existing, keys) {
    const list = (keys || []).filter(Boolean);
    if (!list.length) return existing ? normalizeConfig(existing) : defaultConfig();
    const fresh = configFromArchetypes(list);
    if (!existing) return fresh;
    const cfg = normalizeConfig(existing);
    if (cfg.base !== fresh.base) return fresh;
    const was = cfg.secondary || null;
    const now = fresh.secondary || null;
    if (was === now) return cfg;
    // Only the limbs the previous splice put there are up for grabs; anything
    // the player fitted by hand keeps its place.
    const spliceable = (slot) => cfg.parts[slot] === "default" || cfg.parts[slot] === was;
    if (was) {
      editableSlots(cfg.base).forEach((slot) => {
        if (cfg.parts[slot] !== was) return;
        cfg.parts[slot] = "default";
        cfg.partXf[slot] = defaultXf();
      });
    }
    if (now) spliceLimbs(cfg, now, spliceable);
    cfg.secondary = now;
    return cfg;
  }

  //===========================================================================
  // The biology behind the model
  //===========================================================================
  //
  // js/db/Health/Archetypes.json spells creatures in CamelCase ("Dragon") and
  // lists the body parts they are made of; Battler3D registers its structures
  // in lowercase, one per enemy ("dragon", "fk_terragolem"). Bridging the two
  // is what lets a part dragged onto the body carry its anatomy with it, and
  // what lets an archetype open on a real monster instead of a bare rig.

  function healthArchetypeTable() {
    return (window.Health && window.Health.Archetypes) || {};
  }

  // Health's own spelling of an archetype, from any spelling. Only cached once
  // the table has actually loaded, so an early call cannot poison the index.
  let _healthLower = null;
  function healthArchetypeName(key) {
    if (!key) return null;
    if (!_healthLower) {
      const table = healthArchetypeTable();
      const names = Object.keys(table);
      if (!names.length) return null;
      _healthLower = {};
      names.forEach((k) => { _healthLower[k.toLowerCase()] = k; });
    }
    return _healthLower[String(key).toLowerCase()] || null;
  }

  // Every enemy that has a 3D model, indexed both ways: which models can stand
  // for an archetype, and which archetype a model belongs to. Built once off
  // $dataEnemies' own <Archetype:> tags, and only cached once the database is
  // there to build it from.
  let _enemyModelIndex = null;
  function enemyModelIndex() {
    if (_enemyModelIndex) return _enemyModelIndex;
    const empty = { byArchetype: {}, archetypeOf: {} };
    const B = window.Battler3D;
    const enemies = (typeof $dataEnemies !== "undefined" && $dataEnemies) || null;
    if (!B || !B.resolveKey || !enemies || !enemies.length) return empty;
    const byArchetype = {};
    const archetypeOf = {};
    enemies.forEach((enemy) => {
      if (!enemy || !enemy.meta) return;
      const health = healthArchetypeName(String(enemy.meta.Archetype || "").trim());
      if (!health) return;
      let key = null;
      try { key = B.resolveKey(enemy); } catch (e) { key = null; }
      key = canonicalArchetypeKey(key);
      if (!key) return;
      if (!byArchetype[health]) byArchetype[health] = [];
      if (byArchetype[health].indexOf(key) < 0) byArchetype[health].push(key);
      if (!archetypeOf[key]) archetypeOf[key] = health;
    });
    Object.keys(byArchetype).forEach((k) => byArchetype[k].sort());
    _enemyModelIndex = { byArchetype, archetypeOf };
    return _enemyModelIndex;
  }

  function hashString(str) {
    let h = 2166136261;
    const text = String(str);
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // The Health archetype a donor's anatomy comes from: a model that IS an
  // archetype ("dragon") answers for itself, an enemy's own model
  // ("fk_terragolem") answers with the archetype that enemy is tagged with, and
  // a curated humanoid head is, of course, humanoid.
  function healthArchetypeOfModel(modelKey) {
    if (!modelKey || modelKey === "default") return null;
    if (isHeadPreset(modelKey)) return healthArchetypeName("Humanoid");
    return healthArchetypeName(modelKey) || enemyModelIndex().archetypeOf[modelKey] || null;
  }

  // An existing monster's model to open an archetype on, so picking "Dragon"
  // starts from a real dragon that can then be edited freely, rather than from
  // a bare rig. Deterministic: the same archetype and seed always deal the same
  // monster, and the pick is written into the config, so reopening the editor
  // never swaps the body out from under the player. Falls back to the
  // archetype's own registered structure when no enemy resolves.
  // A body the sculptor can actually work on: one with at least one slot that
  // has a real mesh behind it. A model with no compatibility entry can be worn
  // but nothing can be fitted to it and none of its own limbs can be found, so
  // opening on one would answer every click with a buzzer.
  function isSculptable(modelKey) {
    return !!modelKey && editableSlots(modelKey).length > 0;
  }


  function modelForArchetype(healthKey, seed) {
    const health = healthArchetypeName(healthKey);
    const fallback = canonicalArchetypeKey(health || healthKey);
    if (!health) return fallback;
    const list = (enemyModelIndex().byArchetype[health] || []).filter(isSculptable);
    if (list.length) return list[hashString(health + "|" + (seed || 1)) % list.length];
    // No enemy of this kind has a sculptable model: the archetype's own
    // structure stands in, and if that cannot be sculpted either the biped rig
    // does, so the editor always opens on something that works.
    if (isSculptable(fallback)) return fallback;
    return bodyOptions()[0] || "humanoid";
  }

  // The one anatomical part a graft brings with it, or null when the donor has
  // no anatomy on file. The part key is the first of the slot's own donorKeys
  // the donor archetype actually has -- the same rule the mesh graft follows --
  // so the body and the model always agree on what was replaced.
  function graftAnatomy(modelKey, slot) {
    if (!modelKey || modelKey === "default") return null;
    const health = healthArchetypeOfModel(modelKey);
    const entry = health && healthArchetypeTable()[health];
    if (!entry || !entry.parts) return null;
    const def = PART_SLOTS[slot] || {};
    const key = (def.donorKeys || []).find((k) => entry.parts[k]);
    if (!key) return null;
    return {
      key: key,
      part: Object.assign({}, entry.parts[key], {
        fromArchetype: 0, fromGraft: slot, graftFrom: health
      })
    };
  }

  // Which anatomical part each sculpted slot owns on a given body: the first of
  // the slot's own donorKeys the body actually has, claimed in the order
  // hostSupportedSlots claims meshes, so two slots never fight over one part
  // (an ooze's CORE is its head, not its torso as well).
  const CLAIM_ORDER = ["head", "torso", "legL", "legR", "armL", "armR"];
  function claimSlotParts(parts) {
    const claim = {};
    const taken = {};
    CLAIM_ORDER.forEach((slot) => {
      const def = PART_SLOTS[slot] || {};
      const key = (def.donorKeys || []).find((k) => parts[k] && !taken[k]);
      if (!key) return;
      claim[slot] = key;
      taken[key] = slot;
    });
    return claim;
  }

  // The whole picture of a sculpted body: the anatomy it comes to, the parts
  // the grafts brought with them, and the parts of the base body they
  // displaced. A graft stands IN PLACE OF what it was fitted over, so a spider
  // head worn by a dragon is not a dragon head as well.
  function resolveAnatomy(cfg, archetypeKeys) {
    const config = normalizeConfig(cfg);
    const HC = window.HealthCore;
    const parts = {};
    const base = (HC && HC.mergeArchetypeParts) ? HC.mergeArchetypeParts(archetypeKeys || []) : {};
    for (const key in base) parts[key] = base[key];
    const claim = claimSlotParts(parts);
    const grafts = {};
    const replaced = [];
    SLOT_NAMES.forEach((slot) => {
      const graft = graftAnatomy(config.parts[slot], slot);
      if (!graft) return;
      const covered = claim[slot];
      if (covered && covered !== graft.key) {
        delete parts[covered];
        if (replaced.indexOf(covered) < 0) replaced.push(covered);
      }
      parts[graft.key] = graft.part;
      grafts[graft.key] = graft.part;
      claim[slot] = graft.key;
    });
    return { parts: parts, grafts: grafts, replaced: replaced, claim: claim };
  }

  // Which sculptable slot each anatomical part belongs to, so a row in the body
  // list can point back at the part of the model it describes. Parts the
  // sculptor has no hold on (a tail, a stinger, an organ) answer with nothing.
  function slotsByPart(cfg, archetypeKeys) {
    const claim = resolveAnatomy(cfg, archetypeKeys).claim;
    const out = {};
    Object.keys(claim).forEach((slot) => {
      if (!FIXED_SLOTS[slot]) out[claim[slot]] = slot;
    });
    return out;
  }

  // Every part a sculpted body has. This is what the editor lists down its
  // right-hand column and what the character walks away wearing.
  function anatomyFor(cfg, archetypeKeys) {
    return resolveAnatomy(cfg, archetypeKeys).parts;
  }

  // Just what the grafts changed, keyed the way the body stores its parts: the
  // parts they brought and the ones they displaced. This is the record the
  // actor keeps, so Health_Core can fold it over the anatomy its archetypes
  // would otherwise give it.
  function graftedParts(cfg, archetypeKeys) {
    const resolved = resolveAnatomy(cfg, archetypeKeys);
    return { parts: resolved.grafts, replaced: resolved.replaced };
  }

  //===========================================================================
  // Profile assembly
  //===========================================================================

  function assembleProfile(cfg) {
    const P = (window.Battler3D && window.Battler3D.CREATURE_PROFILES) || {};
    const base = P[cfg.base] || P.humanoid || {};
    const prof = Object.assign({}, base);
    prof.key = "cc_" + (cfg.base || "humanoid");
    prof.scale = (base.scale || 2.6) * (cfg.height || 1);
    prof.bodyBulk = (base.bodyBulk || 1) * (cfg.bulk || 1);
    prof.headScale = (base.headScale || 1) * (cfg.headSize || 1);
    if (cfg.ears != null) prof.earScale = cfg.ears;
    if (cfg.nose != null) prof.noseScale = cfg.nose;
    if (cfg.fangs != null) prof.fangs = cfg.fangs;
    if (cfg.horns != null) prof.horns = cfg.horns;
    if (cfg.tail != null) prof.tail = cfg.tail;
    if (cfg.wings != null) prof.wings = cfg.wings;
    if (cfg.halo != null) prof.halo = cfg.halo;
    if (cfg.texturePool) { prof.texturePool = cfg.texturePool; delete prof.textures; }
    // Explicit hair always wins over the rig's own seeded roll, so what the
    // player picked is what they get. A bare-surface body stays bald.
    prof.hair = hairApplies(cfg)
      ? { style: cfg.hairStyle || "short", color: hairColorHex(cfg.hairColor) }
      : { style: "bald" };
    if (cfg.hue != null) prof.hue = [cfg.hue, 0.02];
    if (cfg.sat != null) prof.sat = [Math.max(0, cfg.sat - 0.03), 0.06];
    if (cfg.lit != null) prof.lit = [Math.max(0, cfg.lit - 0.03), 0.06];
    return prof;
  }

  function fakeIdentity(cfg, offset) {
    const id = (((cfg.seed | 0) >>> 0) || 1) + (offset || 0);
    return { enemyId: () => id, index: () => 0 };
  }

  //===========================================================================
  // Donor part extraction + grafting
  //===========================================================================

  function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m) { if (m.map) m.map.dispose(); m.dispose(); } });
      }
    });
  }

  // Resolve the donor mesh for a slot from its part map, avoiding the
  // whole-body mesh unless the slot genuinely wants it (it is used as the
  // fallback instead). Returns { part, isWhole }.
  // Any part of any creature can be worn anywhere, so a donor is never turned
  // away: what changes is HOW CLOSE a match it can give. In order --
  //   1. the exact part the slot asks for,
  //   2. anything of the right KIND (a wing, a claw or a tentacle all answer
  //      for an arm), preferring the matching side,
  //   3. any part it has at all, taken in a stable order,
  //   4. the whole creature, shrunk to fit, which is a fine thing to hang off a
  //      shoulder and the only honest answer for a donor made of one mesh.
  // Without step 2 and 3 a donor with no exact match went straight to 4, which
  // is why "any part" used to mean "a tiny whole monster".
  function resolveDonorPart(donor, slotDef) {
    const map = donor._partMeshMap || {};
    const usable = (mesh) => mesh && mesh !== donor.model;
    for (const key of slotDef.donorKeys) {
      if (usable(map[key])) return { part: map[key], isWhole: false };
    }
    const keys = Object.keys(map).filter((k) => usable(map[k])).sort();
    const family = slotDef.family || [];
    const kindOf = (key) => family.findIndex((token) => key.indexOf(token) >= 0);
    const sided = slotDef.side
      ? keys.filter((k) => k.indexOf(slotDef.side) >= 0)
      : [];
    for (const pool of [sided, keys]) {
      let best = null, bestRank = Infinity;
      for (const key of pool) {
        const rank = kindOf(key);
        if (rank >= 0 && rank < bestRank) { best = key; bestRank = rank; }
      }
      if (best) return { part: map[best], isWhole: false };
    }
    if (keys.length) return { part: map[keys[0]], isWhole: false };
    return { part: donor.model, isWhole: true };
  }

  // Center an Object3D at the origin and scale it to a target size.
  function wrapAndFit(part, fit) {
    const box = new THREE.Box3().setFromObject(part);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const inner = new THREE.Group();
    inner.position.copy(center).multiplyScalar(-1);
    inner.add(part);
    const wrap = new THREE.Group();
    wrap.scale.setScalar((fit || 0.85) / maxDim);
    wrap.add(inner);
    return wrap;
  }

  // Skin colour from a config's HSL knobs (clamped so grafts never blow white).
  function skinColor(cfg) {
    return new THREE.Color().setHSL(
      cfg.hue != null ? cfg.hue : 0.07,
      cfg.sat != null ? cfg.sat : 0.45,
      Math.min(0.72, cfg.lit != null ? cfg.lit : 0.55)
    );
  }

  // Build a bespoke humanoid head (skin-matched to the body) from a preset.
  function buildHumanoidHead(presetKey, cfg) {
    if (typeof THREE === "undefined") return null;
    const preset = HUMANOID_HEAD_MAP[presetKey] || HUMANOID_HEAD_MAP.human;
    const col = skinColor(cfg);
    const skin = () => new THREE.MeshStandardMaterial({ color: col.clone(), roughness: 0.85 });
    const g = new THREE.Group();
    const sh = preset.shape || [1, 1, 1];
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), skin());
    head.scale.set(sh[0], sh[1], sh[2]); g.add(head);

    if (preset.brow) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.14), skin());
      brow.material.color.multiplyScalar(0.78); brow.position.set(0, 0.15, 0.27); g.add(brow);
    }
    if (preset.snout) {
      const sn = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin());
      sn.scale.set(0.85, 0.7, 1.15); sn.position.set(0, -0.08, 0.28); g.add(sn);
    }
    if (preset.jaw) {
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.42), skin());
      jaw.position.set(0, -0.27, 0.04); g.add(jaw);
    }

    // Ears
    const ear = preset.ear || "round";
    if (ear === "pointed" || ear === "long") {
      const len = ear === "long" ? 0.6 : 0.4, rad = ear === "long" ? 0.07 : 0.1;
      const tilt = ear === "long" ? 0.5 : 0.2, back = ear === "long" ? -0.05 : 0, pitch = ear === "long" ? -0.3 : 0;
      const geo = new THREE.ConeGeometry(rad, len, 4);
      const le = new THREE.Mesh(geo, skin()); le.position.set(-0.34, 0.1, back); le.rotation.z = Math.PI / 2 + tilt; le.rotation.x = pitch; g.add(le);
      const re = new THREE.Mesh(geo, skin()); re.position.set(0.34, 0.1, back); re.rotation.z = -Math.PI / 2 - tilt; re.rotation.x = pitch; g.add(re);
    } else if (ear !== "none") {
      const r = ear === "big" ? 0.16 : 0.12;
      const geo = new THREE.SphereGeometry(r, 8, 8);
      const le = new THREE.Mesh(geo, skin()); le.position.set(-0.33, 0.06, 0.02); le.scale.set(0.5, 1.0, 0.7); g.add(le);
      const re = new THREE.Mesh(geo, skin()); re.position.set(0.33, 0.06, 0.02); re.scale.set(0.5, 1.0, 0.7); g.add(re);
    }

    // Nose
    const noseScale = preset.nose != null ? preset.nose : 0.9;
    if (noseScale > 0) {
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), skin());
      nose.position.set(0, 0, 0.35 * sh[2]); nose.rotation.x = Math.PI / 2; nose.scale.setScalar(noseScale); g.add(nose);
    }

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.2 });
    const pupMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const eyeR = preset.eyeBig ? 0.08 : 0.06;
    const mkEye = (x) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 8, 8), eyeMat); e.position.set(x, 0.08, 0.3 * sh[2]);
      const p = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.5, 8, 8), pupMat); p.position.set(0, 0, 0.04); e.add(p);
      g.add(e);
    };
    if (preset.oneEye) mkEye(0); else { mkEye(-0.15); mkEye(0.15); }

    // Mouth
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.025, 8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    mouth.position.set(0, -0.15, 0.33 * sh[2]); mouth.rotation.x = Math.PI / 2; g.add(mouth);

    // Fangs / tusks
    const fangs = preset.fangs || 0;
    if (fangs > 0) {
      const fMat = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.5 });
      const big = fangs >= 2, fLen = big ? 0.22 : 0.1, fRad = big ? 0.045 : 0.025;
      const fGeo = new THREE.ConeGeometry(fRad, fLen, 5);
      for (const fx of [-0.1, 0.1]) {
        const f = new THREE.Mesh(fGeo, fMat);
        f.position.set(fx, -0.13 + fLen * 0.5, 0.31);
        if (big) { f.rotation.x = Math.PI; f.position.y = -0.06; }
        g.add(f);
      }
    }

    // Horns
    if (preset.horns) {
      const hMat = new THREE.MeshStandardMaterial({ color: 0xe8ddc4, roughness: 0.6 });
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), hMat);
        h.position.set(s * 0.22, 0.28, -0.02); h.rotation.z = s * 0.6; g.add(h);
      }
    }
    return g;
  }

  // Build a self-contained, centered, fitted Object3D for one archetype's part.
  // Resolves to null when the 3D system is unavailable or the donor fails.
  function buildDonorGraft(archetypeKey, slotDef, cfg, seedOffset) {
    const B = window.Battler3D;
    if (!B || !B.create) return Promise.resolve(null);
    const seed = seedOffset == null ? slotDef.seed : seedOffset;
    let src = null;
    try { src = B.create(archetypeKey, 0, 0, fakeIdentity(cfg, seed)); } catch (e) { src = null; }
    if (!src) return Promise.resolve(null);
    return Promise.resolve(src.load(null, 0, 0, 0)).then(() => {
      if (!src.model) return null;
      try { src.update(1 / 60); } catch (e) { /* pose is cosmetic */ }
      const res = resolveDonorPart(src, slotDef);
      const part = res.part;
      if (!part) return null;
      if (part.parent) part.parent.remove(part);
      if (!res.isWhole) { part.position.set(0, 0, 0); part.rotation.set(0, 0, 0); }
      const wrap = wrapAndFit(part, slotDef.fit);
      // The extracted part is now owned by `wrap`; free the donor's leftovers.
      if (src.model) disposeObject3D(src.model);
      return wrap;
    }).catch(() => null);
  }

  // Each slot offsets the donor's RNG so two slots of the SAME archetype vary --
  // except a mirrored pair wearing the same donor, which shares ONE seed so the
  // two sides come out the same size, the same shape and the same colour. The
  // donor's own LEFT_/RIGHT_ meshes supply the handedness.
  function donorSeedFor(slotName, cfg) {
    const def = PART_SLOTS[slotName];
    const pair = MIRROR_PAIR[slotName];
    if (cfg.symmetry === "mirror" && pair && cfg.parts[pair] === cfg.parts[slotName]) {
      const lead = (slotName === "armR" || slotName === "legR") ? pair : slotName;
      return PART_SLOTS[lead].seed;
    }
    return def.seed;
  }

  // Resolve a graft Object3D for a slot value (head preset or donor archetype).
  function buildSlotGraft(slotName, value, cfg) {
    const def = PART_SLOTS[slotName];
    if (slotName === "head" && isHeadPreset(value)) {
      const head = buildHumanoidHead(value.slice(HHEAD_PREFIX.length), cfg);
      return Promise.resolve(head ? wrapAndFit(head, def.fit) : null);
    }
    return buildDonorGraft(value, def, cfg, donorSeedFor(slotName, cfg));
  }

  // Resolve the host mesh a slot should graft onto, plus any extra distal
  // meshes to hide alongside it. Humanoid hosts use PART_SLOTS' hardcoded rig
  // properties (their `hideMeshes` covers segments like forearm/hand that are
  // siblings, not children, of the anchor in that rig). A non-humanoid
  // structure host instead looks up its own matched _partMeshMap key (the same
  // compatibility data used to filter donor options), and derives "what else
  // to hide" from that family's own `_cascadeRules` -- the dismemberment rule
  // whose `gone` list includes our matched key already encodes "what
  // disappears alongside this part" per-family, which is exactly what a graft
  // should visually replace. Returns null when the host has no real part here.
  // The mesh a creature with no limb of its own hangs an EXTRA part off: its
  // body. A serpent has no arms, but an arm can still be stuck on its trunk and
  // then dragged into place, which is the whole point of being able to add any
  // part to any monster.
  function hostBodyCarrier(hostBattler) {
    const map = hostBattler._partMeshMap || {};
    const usable = (key) => map[key] && map[key] !== hostBattler.model;
    for (const key of PART_SLOTS.torso.donorKeys) if (usable(key)) return map[key];
    for (const key of PART_SLOTS.head.donorKeys) if (usable(key)) return map[key];
    const rest = Object.keys(map).filter(usable).sort();
    return rest.length ? map[rest[0]] : null;
  }

  function resolveHostAnchor(hostBattler, baseKey, slotName) {
    const def = PART_SLOTS[slotName];
    if (isHumanoidBase(baseKey)) {
      const anchor = def.anchor(hostBattler);
      if (!anchor) return null;
      return { anchor: anchor, hideMeshes: def.hideMeshes(hostBattler) };
    }
    const map = hostBattler._partMeshMap || {};
    const key = matchedDonorKeyForSlot(baseKey, slotName);
    const anchor = key ? map[key] : null;
    if (!anchor) {
      // No limb of its own here: the part is EXTRA, so it hangs off the body
      // and nothing of the creature is hidden to make room for it.
      const carrier = hostBodyCarrier(hostBattler);
      return carrier ? { anchor: carrier, hideMeshes: [], extra: true } : null;
    }
    const rules = hostBattler._cascadeRules || [];
    const rule = rules.find((r) => r.gone && r.gone.indexOf(key) !== -1);
    const hideMeshes = rule ? (rule.hide || []).filter((m) => m && m !== anchor) : [];
    return { anchor: anchor, hideMeshes: hideMeshes };
  }

  // How much of the contact between a graft and its anchor must survive being
  // shoved around. Below 1 the two are still overlapping, not merely touching,
  // so a part can never be left hanging by a hair.
  const CONTACT_KEEP = 0.75;

  // How far a graft may be pushed away from its anchor before it would come
  // loose, in the anchor's OWN local frame -- which is the frame the graft's
  // offset is written in, so no conversion is needed. The anchor's radius is
  // read off its real geometry where it has any; a bare Group falls back to the
  // slot's nominal fit. The graft's radius is half the size the slot fits it to,
  // scaled by the size knob.
  function slotReach(anchor, slotName, xf) {
    const def = PART_SLOTS[slotName] || {};
    const fit = def.fit || 0.85;
    const graftR = fit * ((xf && xf.s) || 1) * 0.5;
    let anchorR = fit * 0.5;
    const geo = anchor && anchor.geometry;
    if (geo) {
      if (!geo.boundingSphere && typeof geo.computeBoundingSphere === "function") {
        try { geo.computeBoundingSphere(); } catch (e) { /* a stripped geometry keeps the fallback */ }
      }
      if (geo.boundingSphere && geo.boundingSphere.radius > 0) anchorR = geo.boundingSphere.radius;
    }
    return (anchorR + graftR) * CONTACT_KEEP;
  }

  // Pull a placement back onto its anchor. A part may be slid anywhere around
  // the joint it hangs from, but never off it: past the contact limit the offset
  // is shortened along its own direction, so the part slides to the edge of what
  // still counts as attached and stays there instead of floating free. Every
  // path that writes a placement goes through this, so a body part is always
  // connected -- there is no way to build a creature with a head in mid-air.
  function snapXf(anchor, slotName, xf) {
    const out = Object.assign(defaultXf(), xf || {});
    const reach = slotReach(anchor, slotName, out);
    const d = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
    if (d > reach && d > 1e-6) {
      const k = reach / d;
      out.x *= k; out.y *= k; out.z *= k;
    }
    return out;
  }

  // Where a part sat before the sculptor touched it. A graft starts centred on
  // its anchor at the size the slot fitted it to; the body's OWN limb starts
  // whereever its rig put it -- so every placement is read as a nudge away from
  // that remembered pose rather than an absolute, and nothing compounds on a
  // rebuild.
  function rememberBasePose(obj) {
    if (!obj || !obj.position || !obj.rotation || !obj.scale) return null;
    if (!obj.userData) obj.userData = {};
    if (!obj.userData.ccBasePose) {
      obj.userData.ccBasePose = {
        px: obj.position.x, py: obj.position.y, pz: obj.position.z,
        rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z,
        sx: obj.scale.x || 1, sy: obj.scale.y || 1, sz: obj.scale.z || 1
      };
    }
    return obj.userData.ccBasePose;
  }

  // Seat a part at the offset / turn / size the sculptor left it at. Works on a
  // graft and on a bare limb alike, which is what lets every part of a creature
  // be moved and not only the ones that were dropped onto it. `kin` are the
  // distal segments that travel with a limb (a forearm and a hand are siblings
  // of the upper arm in the biped rig, not its children), so a limb always
  // moves as one piece.
  function applyPartPlacement(obj, xf, kin) {
    if (!obj) return;
    const t = Object.assign(defaultXf(), xf || {});
    const b = rememberBasePose(obj);
    if (!b) return;
    obj.position.set(b.px + t.x, b.py + t.y, b.pz + t.z);
    obj.rotation.set(b.rx + t.rx, b.ry + t.ry, b.rz + t.rz);
    obj.scale.set(b.sx * t.s, b.sy * t.s, b.sz * t.s);
    (kin || obj.userData.ccKin || []).forEach((m) => {
      const kb = rememberBasePose(m);
      if (!kb) return;
      m.position.set(kb.px + t.x, kb.py + t.y, kb.pz + t.z);
      m.scale.set(kb.sx * t.s, kb.sy * t.s, kb.sz * t.s);
    });
  }

  // Kept under its old name for callers outside this file.
  const applyGraftTransform = applyPartPlacement;

  // Graft a donor part onto a slot of a loaded host battler (humanoid rig or
  // non-humanoid creature structure).
  function graftSlot(hostBattler, slotName, archetypeKey, cfg) {
    const def = PART_SLOTS[slotName];
    if (!def) return Promise.resolve();
    const resolved = resolveHostAnchor(hostBattler, cfg.base, slotName);
    if (!resolved) return Promise.resolve();
    const anchor = resolved.anchor;
    return buildSlotGraft(slotName, archetypeKey, cfg).then((wrap) => {
      if (!wrap) return;
      // Mute the anchor's own visual (keeps it as the FK/parent carrier) and
      // hide any pre-existing child meshes (eyes / gear) before the graft is
      // parented.
      // ...but ONLY when the graft stands in place of a limb the creature has.
      // An extra part hung off the body must not blank the body.
      if (!resolved.extra) {
        if (anchor.material) { anchor.material.visible = false; }
        anchor.children.slice().forEach((c) =>
          c.traverse((o) => { if (o.isMesh) o.visible = false; }));
        resolved.hideMeshes.forEach((m) => { if (m) m.visible = false; });
      }
      // A placement can also arrive from a save, a preset or a hand-edited
      // config, so it is snapped here too rather than only where it is edited.
      applyGraftTransform(wrap, snapXf(anchor, slotName, cfg.partXf && cfg.partXf[slotName]));
      wrap.userData.ccSlot = slotName;
      anchor.add(wrap);
      hostBattler._ccGrafts = hostBattler._ccGrafts || {};
      hostBattler._ccGrafts[slotName] = wrap;
    });
  }

  // Label every mesh a slot owns so a click or a drop anywhere on the body
  // answers "which slot is this?". Anchors are tagged whether or not they
  // carry a graft, because an empty slot is exactly where a new part is
  // dropped. The tag is written on the anchor itself (not its subtree), so a
  // walk up from the hit mesh finds the DEEPEST slot first: a head grafted
  // inside a torso still reads as the head.
  function indexSlotMeshes(battler, cfg) {
    if (!battler) return {};
    const anchors = {};
    const taken = [];
    const grafts = battler._ccGrafts || {};
    editableSlots(cfg.base).forEach((slot) => {
      const resolved = resolveHostAnchor(battler, cfg.base, slot);
      if (!resolved || !resolved.anchor) return;
      const anchor = resolved.anchor;
      if (resolved.extra) {
        // A slot the creature has no limb of its own for only exists while
        // something is hung on it, and it SHARES the body it hangs from with
        // every other extra part -- so it never claims that mesh, and the graft
        // itself (tagged in graftSlot, and deeper in the tree) is what a click
        // lands on.
        if (grafts[slot]) anchors[slot] = anchor;
        return;
      }
      // The compatibility table dedupes by part KEY, which is not enough: two
      // keys can name the same mesh at runtime, and some families alias the
      // body to the model ROOT. Tagging the root would make every click
      // anywhere on the creature answer with that one slot, which is exactly
      // what made the whole model select as its torso. So a mesh belongs to the
      // first slot that claims it, and the root belongs to no slot at all.
      if (anchor === battler.model || taken.indexOf(anchor) >= 0) return;
      taken.push(anchor);
      anchor.userData.ccSlot = slot;
      // Only the segments that are still VISIBLE travel with the limb: the ones
      // a graft hid are gone from the picture and must not be dragged around
      // behind it.
      const kin = (resolved.hideMeshes || []).filter(Boolean);
      kin.forEach((m) => { m.userData.ccSlot = slot; });
      anchor.userData.ccKin = kin.filter((m) => m.visible !== false);
      anchors[slot] = anchor;
    });
    battler._ccAnchors = anchors;
    return anchors;
  }

  // Build a non-humanoid "skeleton structure" whole from its archetype, with a
  // seed-driven look (the Variation seed rerolls proportions/textures/colours
  // exactly like the creature preview reseed).
  function buildCreatureStructure(cfg) {
    const B = window.Battler3D;
    if (!B || !B.create) return Promise.resolve(null);
    const seedStr = "cc" + (((cfg.seed | 0)) || 1);
    const make = () => B.create(cfg.base, undefined, 0, fakeIdentity(cfg, 0));
    let battler = null;
    try { battler = withGenSeed(seedStr, make); } catch (e) { battler = null; }
    if (!battler) return Promise.resolve(null);
    return Promise.resolve(battler.load(null, 0, 0, 0)).then(() => battler).catch(() => null);
  }

  // Seat every BARE limb at the placement the sculptor left it on. A graft is a
  // child of its anchor, so posing the rig carries it along untouched; a bare
  // limb IS the anchor, and posing writes the very position this nudges. So the
  // rest pose is captured and the nudge applied only after the rig has been
  // posed -- which is why buildModel poses it exactly once and never again.
  // (A consumer that keeps animating the model, like the status screen, poses
  // over these nudges; the sculptor itself holds the model perfectly still.)
  function poseBareSlots(battler, cfg) {
    const anchors = battler._ccAnchors || {};
    const grafts = battler._ccGrafts || {};
    Object.keys(anchors).forEach((slot) => {
      if (grafts[slot]) return;
      const anchor = anchors[slot];
      rememberBasePose(anchor);
      (anchor.userData.ccKin || []).forEach(rememberBasePose);
      applyPartPlacement(anchor, cfg.partXf && cfg.partXf[slot]);
    });
  }

  // Graft every non-default slot onto a loaded host battler, in order.
  // Sequential so the shared resources settle; there are at most six.
  function graftAllSlots(battler, cfg) {
    let chain = Promise.resolve();
    SLOT_NAMES.forEach((slot) => {
      const key = cfg.parts[slot];
      if (key && key !== "default") {
        chain = chain.then(() => graftSlot(battler, slot, key, cfg));
      }
    });
    return chain;
  }

  // Build a loaded model for a config. Humanoid bases use the part-swappable
  // biped rig; a non-humanoid base builds its whole structure first and then
  // grafts onto whichever slots that structure itself has a real part for
  // (see hostSupportedSlots/resolveHostAnchor) -- so a creature host can be a
  // chimera too, not just a donor.
  function buildModel(cfg, actorId) {
    if (!isAvailable()) return Promise.resolve(null);
    cfg = normalizeConfig(cfg);
    const finish = (battler) => {
      indexSlotMeshes(battler, cfg);
      // The one and only pose: after it the rest positions are settled, so the
      // bare limbs can be nudged off them and stay there.
      try { battler.update(1 / 60); } catch (e) { /* pose is cosmetic */ }
      poseBareSlots(battler, cfg);
      return battler;
    };
    if (!isHumanoidBase(cfg.base)) {
      return buildCreatureStructure(cfg).then((battler) => {
        if (!battler) return null;
        return graftAllSlots(battler, cfg).then(() => finish(battler));
      });
    }
    const prof = assembleProfile(cfg);
    const battler = window.Battler3D.createCustomHumanoid(prof, prof.scale, 0, fakeIdentity(cfg, 0), 0);
    if (!battler) return Promise.resolve(null);
    return Promise.resolve(battler.load(null, 0, 0, 0))
      .then(() => graftAllSlots(battler, cfg))
      .then(() => finish(battler));
  }

  function withGenSeed(seed, fn) {
    const B = window.Battler3D;
    if (!seed || !B || !B.setGenSeed || !B.getGenSeed) return fn();
    const prev = B.getGenSeed();
    B.setGenSeed(seed);
    try { return fn(); } finally { B.setGenSeed(prev); }
  }

  window.CC3DModel = {
    isAvailable, defaultConfig, defaultXf, normalizeConfig, getConfig, setConfig,
    getCreatureSeed, setCreatureSeed, bodyOptions, partOptions, optionsForSlot,
    allArchetypes, displayName, buildModel, withGenSeed, suggestBaseFromName,
    configFromArchetypes, applyArchetypesToConfig, canonicalArchetypeKey, isHumanoidBase,
    structureOptions, SLOT_NAMES,
    isSlotCompatible, compatibleArchetypesForSlot, hostSupportedSlots, editableSlots, hostBodyKeys,
    partKeyName,
    isSculptable, rollParts, indexSlotMeshes, partGroups, groupLabel,
    mirrorTargets, mirrorXf, applyGraftTransform, applyPartPlacement, donorSeedFor,
    snapXf, slotReach,
    healthArchetypeName, healthArchetypeOfModel, modelForArchetype,
    graftAnatomy, anatomyFor, graftedParts, resolveAnatomy, slotsByPart,
    slotLabel: (s) => (PART_SLOTS[s] ? PART_SLOTS[s].label() : s)
  };

  //===========================================================================
  // randomConfig
  //===========================================================================

  function randomConfig() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const range = (min, max, step) => {
      const n = Math.floor((max - min) / step) + 1;
      return min + Math.floor(Math.random() * n) * step;
    };
    const r2 = (v) => Math.round(v * 100) / 100;
    const headPresets = HUMANOID_HEADS.map((h) => HHEAD_PREFIX + h.key);
    const rollFromPool = (pool) => (pool.length && Math.random() < 0.28) ? pick(pool) : "default";
    const parts = {};
    // Arms and legs are rolled once per pair (left/right) so a randomized
    // figure never ends up with mismatched limbs. Every roll draws only from
    // slot-compatible archetypes so a random figure never silently grafts a
    // donor's whole shrunken model onto a slot it has no real part for.
    let armPick = null;
    let legPick = null;
    SLOT_NAMES.forEach((slot) => {
      // A minority of slots get a wild donor; the rest stay default so the
      // random figure still reads as a coherent body most of the time. The
      // head favours the curated humanoid presets over raw creature heads.
      if (slot === "head" && Math.random() < 0.55) {
        parts[slot] = pick(headPresets);
      } else if (slot === "armL" || slot === "armR") {
        if (armPick === null) armPick = rollFromPool(compatibleArchetypesForSlot("armL"));
        parts[slot] = armPick;
      } else if (slot === "legL" || slot === "legR") {
        if (legPick === null) legPick = rollFromPool(compatibleArchetypesForSlot("legL"));
        parts[slot] = legPick;
      } else {
        parts[slot] = rollFromPool(compatibleArchetypesForSlot(slot));
      }
    });
    return {
      base: pick(bodyOptions()),
      parts,
      seed: 1 + Math.floor(Math.random() * 99998),
      height: r2(range(0.75, 1.35, 0.05)),
      bulk: r2(range(0.75, 1.35, 0.05)),
      headSize: r2(range(0.8, 1.4, 0.05)),
      ears: r2(range(0, 1.8, 0.1)),
      nose: r2(range(0, 1.8, 0.1)),
      hue: r2(range(0, 0.96, 0.04)),
      sat: r2(range(0.1, 0.9, 0.05)),
      lit: r2(range(0.25, 0.8, 0.05)),
      texturePool: pick(TEXTURE_POOL_KEYS),
      hairStyle: pick(hairStyleKeys().filter((s) => s !== "helmet")),
      // Natural colours most of the time, the exotic tail of the palette rarely.
      hairColor: (() => {
        const keys = hairColorKeys();
        const H = hairLib();
        const nat = (H && H.NATURAL_COLORS) || keys.length;
        return Math.random() < 0.12 ? pick(keys) : pick(keys.slice(0, nat));
      })(),
      fangs: Math.random() < 0.25 ? (Math.random() < 0.5 ? 1 : 2) : 0,
      horns: Math.random() < 0.2 ? (Math.random() < 0.5 ? 1 : 2) : 0,
      tail: Math.random() < 0.15 ? 1 : 0,
      wings: Math.random() < 0.12 ? 1 : 0,
      halo: Math.random() < 0.08 ? 1 : 0
    };
  }

  // Deal a fresh set of parts for whatever body a config is already built on,
  // in place. Only slots this body has, only donors those slots can wear, and a
  // mirrored pair is always rolled once for both sides so a random creature is
  // never lopsided.
  function rollParts(cfg) {
    const slots = editableSlots(cfg.base);
    const parts = defaultParts();
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const settled = {};
    slots.forEach((slot) => {
      if (settled[slot]) return;
      const targets = mirrorTargets(cfg, slot).filter((s) => slots.indexOf(s) >= 0);
      let roll = "default";
      if (slot === "head" && Math.random() < 0.45) {
        roll = HHEAD_PREFIX + pick(HUMANOID_HEADS).key;
      } else if (Math.random() < 0.35) {
        // Only a donor every side of the pair can wear, so the roll is never
        // dropped halfway through and left on one limb.
        const pool = compatibleArchetypesForSlot(slot)
          .filter((k) => targets.every((s) => isSlotCompatible(k, s)));
        if (pool.length) roll = pick(pool);
      }
      targets.forEach((s) => { parts[s] = roll; settled[s] = true; });
      settled[slot] = true;
    });
    cfg.parts = parts;
    cfg.partXf = defaultPartXf();
    return cfg;
  }

  //===========================================================================
  // Scene_CC3DModel -- the creature sculptor
  //===========================================================================
  //
  // The screen is the creature. It fills everything, with three thin frames
  // around it:
  //
  //   TOP BAR    what the creature IS and what to do to all of it at once --
  //              its body, mirror symmetry, undo, redo, a reroll, and the way
  //              out (Continue). There is no Back: a sculpt is never thrown
  //              away behind the player's back, so leaving keeps it and hands
  //              the flow back to whoever opened the sculptor.
  //   DRAWER     along the bottom, the parts. A rail of every GROUP the
  //              creature has (its limbs, the appendages it can grow, its
  //              build, its skin) and, under it, a shelf of the actual parts in
  //              the open group, each drawn as a small model of itself. Point
  //              at one to try it on, click it to keep it.
  //   BODY LIST  down the right, the anatomy the sculpt adds up to: every part
  //              with the share of HP it carries and whether losing it is
  //              fatal.
  //
  // A part already on the creature is grabbed and dragged: Move, Turn or Size,
  // whichever handle is armed. It can never come loose (snapXf) and the rig
  // never animates, so nothing ever moves out from under the cursor.

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const RAD = Math.PI / 180;
  const CSS_ID = (id) => String(id).replace(/[:|]/g, "-");

  function slotLabel(slot) {
    const def = PART_SLOTS[slot];
    return def ? def.label() : slot;
  }

  // A body-part key read out loud: LEFT_ARM -> Left Arm, FIRE_BREATH_ORGAN ->
  // Fire Breath Organ. The last-resort name for a part whose own label is
  // missing, so a row is never a bare percentage with nothing against it.
  function partKeyName(key) {
    return String(key || "").split(/[_\s]+/).filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ") || String(key || "");
  }

  // The three things a grabbed part can be doing.
  const HANDLES = ["move", "turn", "size"];

  // How far a part may be shoved, and how big or small it may be made, before
  // the numbers stop meaning anything. The real limit is contact (snapXf); this
  // is only the backstop.
  const XF_LIMIT = 3;
  const XF_SIZE_MIN = 0.2;
  const XF_SIZE_MAX = 3;

  // Real-world baselines the height / weight knobs are shown against.
  const HEIGHT_BASE_M = 1.7;
  const WEIGHT_BASE_KG = 70;

  // Sculpts to step back to.
  const HISTORY_MAX = 40;

  // A part is shown as a small STATIC render of the real thing. Each is built
  // once, drawn into a corner of the LIVE renderer and copied straight out of
  // its drawing buffer in the same tick -- no second WebGL context, because the
  // browser force-loses the OLDEST one past its cap and that would be the
  // game's own canvas. Keyed by slot: the same donor gives a different part to
  // a head than to a leg.
  const THUMB_SIZE = 72;
  const THUMB_CACHE_MAX = 400;
  const THUMB_CACHE = new Map();
  function thumbKey(slot, value, cfg) {
    // A curated humanoid head is skin-matched to the body, so its picture is
    // only good for the colour it was drawn in.
    if (isHeadPreset(value)) {
      return slot + "|" + value + "|" + [cfg.hue, cfg.sat, cfg.lit]
        .map((v) => Math.round((v || 0) * 20)).join(",");
    }
    return slot + "|" + value;
  }
  function cacheThumb(key, url) {
    if (THUMB_CACHE.size >= THUMB_CACHE_MAX) THUMB_CACHE.delete(THUMB_CACHE.keys().next().value);
    THUMB_CACHE.set(key, url);
  }

  // How many parts the shelf holds before it grows as it is scrolled.
  const SHELF_PAGE = 40;

  // The knobs that shape the body itself, and the ones that colour it. Neither
  // is a part, so they get a group each on the rail rather than a pane of their
  // own hidden behind a tab.
  const BUILD_SLIDERS = ["height", "bulk", "headSize", "nose"];
  const SKIN_SLIDERS = ["hue", "sat", "lit"];

  const CFG_SLIDERS = {
    height:   { min: 0.7, max: 1.4, step: 0.05, label: () => T('CharCreate.height'), unit: "height" },
    bulk:     { min: 0.7, max: 1.4, step: 0.05, label: () => T('CharCreate.weight'), unit: "weight" },
    headSize: { min: 0.7, max: 1.5, step: 0.05, label: () => T('CharCreate.headSize') },
    nose:     { min: 0, max: 2, step: 0.1, label: () => T('CharCreate.nose') },
    ears:     { min: 0, max: 2, step: 0.1, label: () => T('CharCreate.ears') },
    hue:      { min: 0, max: 0.96, step: 0.02, label: () => T('CharCreate.skinHue'), swatch: true },
    sat:      { min: 0, max: 1, step: 0.05, label: () => T('CharCreate.saturation') },
    lit:      { min: 0.15, max: 0.85, step: 0.05, label: () => T('CharCreate.lightness') }
  };

  const XF_SLIDERS = {
    x:  { min: -XF_LIMIT, max: XF_LIMIT, step: 0.02, label: () => T('CharCreate.cc3d.axisX'), unit: "offset" },
    y:  { min: -XF_LIMIT, max: XF_LIMIT, step: 0.02, label: () => T('CharCreate.cc3d.axisY'), unit: "offset" },
    z:  { min: -XF_LIMIT, max: XF_LIMIT, step: 0.02, label: () => T('CharCreate.cc3d.axisZ'), unit: "offset" },
    ry: { min: -Math.PI, max: Math.PI, step: 5 * RAD, label: () => T('CharCreate.cc3d.turn'), unit: "angle" },
    rx: { min: -Math.PI, max: Math.PI, step: 5 * RAD, label: () => T('CharCreate.cc3d.tilt'), unit: "angle" },
    rz: { min: -Math.PI, max: Math.PI, step: 5 * RAD, label: () => T('CharCreate.cc3d.roll'), unit: "angle" },
    s:  { min: XF_SIZE_MIN, max: XF_SIZE_MAX, step: 0.05, label: () => T('CharCreate.cc3d.size'), unit: "pct" }
  };

  //===========================================================================
  // The scene
  //===========================================================================

  function Scene_CC3DModel() {
    this.initialize(...arguments);
  }

  Scene_CC3DModel.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_CC3DModel.prototype.constructor = Scene_CC3DModel;

  // options: { suggestedBase, initArchetypes:[key,...], creature:true,
  //            returnByPop:true, confirmPops:n }.
  // returnByPop is for callers that PUSHED this scene over their own (the
  // sprite grid does): Back pops once, landing on the caller again, instead of
  // gotoing a fresh instance of a return scene.
  // A bare string is accepted as suggestedBase for backward compatibility.
  Scene_CC3DModel.setup = function (actorId, returnSceneClass, options) {
    Scene_CC3DModel._actorId = actorId || 1;
    Scene_CC3DModel._returnSceneClass = returnSceneClass || null;
    if (typeof options === "string") options = { suggestedBase: options };
    options = options || {};
    Scene_CC3DModel._returnByPop = !!options.returnByPop;
    // How many scenes Confirm pops in humanoid mode. The sprite-grid route
    // needs two (itself plus the grid, landing back on the map so the creation
    // common event resumes); a caller that pushed this editor straight over its
    // own scene, such as the Detailed creation editor, passes 1.
    Scene_CC3DModel._confirmPops = Number(options.confirmPops) > 0 ? Number(options.confirmPops) : 2;
    Scene_CC3DModel._suggestedBase = options.suggestedBase || null;
    Scene_CC3DModel._initArchetypes = options.initArchetypes || null;
    Scene_CC3DModel._creatureMode = !!options.creature;
    Scene_CC3DModel._creatureResult = null;
  };

  Scene_CC3DModel.prototype.initialize = function () {
    Scene_MenuBase.prototype.initialize.call(this);
    this._actorId = Scene_CC3DModel._actorId || 1;
    this._creatureMode = !!Scene_CC3DModel._creatureMode;

    const saved = getConfig(this._actorId);
    this._config = normalizeConfig(saved || {});
    // First visit for this actor: seed the starting config from context. A
    // custom creature opens on a real monster of its archetype; a humanoid on
    // the body detected from the bust or sprite chosen in the previous step.
    if (!saved) {
      if (Scene_CC3DModel._initArchetypes && Scene_CC3DModel._initArchetypes.length) {
        this._config = normalizeConfig(configFromArchetypes(Scene_CC3DModel._initArchetypes));
      } else if (Scene_CC3DModel._suggestedBase && bodyOptions().indexOf(Scene_CC3DModel._suggestedBase) !== -1) {
        this._config.base = Scene_CC3DModel._suggestedBase;
      }
    }
    this._archetypeKeys = this._actorArchetypes();

    this._group = null;            // the group open on the rail
    this._slot = null;             // the slot that group works on, if it is one
    this._selected = null;         // the part under the handles
    this._handle = "move";
    this._filter = "";
    this._shown = SHELF_PAGE;
    this._focus = 0;
    this._modal = null;
    this._sliderDrag = null;
    // Right and middle drags turn and pan the view. RMMZ reads the right
    // button as "cancel", and cancel leaves this scene, so an orbit used to
    // fire an exit on every press: enough of them drained the scene stack and
    // SceneManager.pop() walked off the end of it and shut the game down, with
    // the sculptor's own DOM still on screen and nothing left running behind
    // it. A stage drag swallows the cancel it caused.
    this._eatCancel = 0;
    this._leaving = false;
    this._history = [];
    this._future = [];
    this._hoverSlot = null;
    this._rebuildTimer = null;
    this._buildCounter = 0;
    this._view3D = null;
    this._grafts = {};
    this._anchors = {};
    this._thumbQueue = [];
    this._thumbAsked = {};
    this._thumbBusy = false;
    this._thumbReady = null;

    this._openGroup(this._groups()[0]);
  };

  // What a slot's placement actually moves: the graft it wears, or -- on a bare
  // slot -- the creature's OWN limb. Every part of the body can be dragged,
  // turned and resized, not only the ones that were dropped onto it; that is
  // what a body picked whole from an archetype is sculpted with.
  Scene_CC3DModel.prototype._movable = function (slot) {
    if (!slot) return null;
    return this._grafts[slot] || this._anchors[slot] || null;
  };

  // How far this slot's part may be pushed and still count as attached. A bare
  // limb is moved in its PARENT's frame, so its own radius is read through its
  // own scale to stay comparable with the offset.
  Scene_CC3DModel.prototype._reachFor = function (slot) {
    if (!slot) return XF_LIMIT;
    const xf = this._config.partXf[slot] || defaultXf();
    const anchor = this._anchors[slot];
    const bare = !this._grafts[slot];
    const frame = (bare && anchor && anchor.scale) ? (anchor.scale.x || 1) : 1;
    return Math.min(XF_LIMIT, slotReach(anchor, slot, xf) * frame);
  };

  Scene_CC3DModel.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    this._buildDom();
    this._initStage();
    this.rebuildModel();
  };

  Scene_CC3DModel.prototype.terminate = function () {
    Scene_MenuBase.prototype.terminate.call(this);
    if (this._rebuildTimer) { clearTimeout(this._rebuildTimer); this._rebuildTimer = null; }
    if (this._thumbWatcher) { this._thumbWatcher.disconnect(); this._thumbWatcher = null; }
    if (this._thumbReady && this._thumbReady.object) disposeObject3D(this._thumbReady.object);
    this._thumbReady = null;
    this._thumbQueue = [];
    this._sliderDrag = null;
    this.closeModal();
    this._teardownStage();
    if (this._root) window.CCPanel.hide(this._root);
    const styles = document.getElementById("cc3d-styles");
    if (styles) styles.remove();
  };

  //---------------------------------------------------------------------------
  // What the creature is built from
  //---------------------------------------------------------------------------

  // The archetypes this character is built from, in Health's own spelling. The
  // actor is the authority (the archetype board writes it there); the ones the
  // editor was opened with only stand in on a member with no body yet.
  Scene_CC3DModel.prototype._actorArchetypes = function () {
    const actor = (typeof $gameActors !== "undefined" && $gameActors)
      ? $gameActors.actor(this._actorId) : null;
    let raw;
    if (actor && actor._creatureArchetypes && actor._creatureArchetypes.length) raw = actor._creatureArchetypes;
    else if (actor && actor._currentArchetype) raw = [actor._currentArchetype];
    else raw = Scene_CC3DModel._initArchetypes || [];
    const out = [];
    raw.forEach((key) => {
      const health = healthArchetypeName(key);
      if (health && out.indexOf(health) < 0) out.push(health);
    });
    return out.slice(0, 2);
  };

  // Which slots this creature really has. Once a model has been built its
  // ANCHORS are the authority -- they are the parts that actually resolved on
  // the rig, which is not always what the compatibility table promised.
  // What can be taken hold of right now: the parts the built model really has,
  // which for a slot the creature was not born with means "once something is on
  // it". Everything that can be GIVEN a part is _addableGroups().
  Scene_CC3DModel.prototype._slots = function () {
    const found = Object.keys(this._anchors || {});
    if (found.length) return SLOT_NAMES.filter((s) => found.indexOf(s) >= 0);
    return editableSlots(this._config.base);
  };

  // Every group on the rail, in the order it is browsed: how the body is built,
  // how it is coloured, then each part of it and each appendage it can grow.
  Scene_CC3DModel.prototype._groups = function () {
    const groups = [];
    if (isHumanoidBase(this._config.base)) {
      groups.push({ id: "build", kind: "build", label: () => T('CharCreate.cc3d.build') });
      groups.push({ id: "skin", kind: "skin", label: () => T('CharCreate.cc3d.skin') });
    }
    // Every slot the creature can be given something in, whether or not it was
    // born with one there.
    partGroups(this._config.base).forEach((group) => {
      groups.push(Object.assign({ label: () => groupLabel(group.id) }, group));
    });
    return groups;
  };

  Scene_CC3DModel.prototype._group3 = function () {
    return this._groups().find((g) => g.id === this._group) || null;
  };

  Scene_CC3DModel.prototype._openGroup = function (group) {
    if (!group) { this._group = null; this._slot = null; return; }
    this._group = group.id;
    this._filter = "";
    this._shown = SHELF_PAGE;
    if (group.kind === "slot") {
      this._slot = group.id;
      this._selected = group.id;
    } else {
      this._slot = null;
    }
  };

  //---------------------------------------------------------------------------
  // Styles
  //---------------------------------------------------------------------------

  // The editor's stylesheet lives in css/theme.css with every other screen's,
  // so a preset can re-ink it and the contrast gate can measure it. Kept as a
  // no-op because the build path still calls it.
  Scene_CC3DModel.prototype._injectStyles = function () {};

  //---------------------------------------------------------------------------
  // Layout
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype._buildDom = function () {
    this._injectStyles();
    let root = document.getElementById("character-creation-container");
    if (!root) {
      root = document.createElement("div");
      root.id = "character-creation-container";
      document.body.appendChild(root);
    }
    this._root = root;
    window.CCPanel.show(root);
    root.innerHTML = `
      <div class="cc3d">
        <div class="cc3d-top" id="cc3d-top"></div>
        <div class="cc3d-mid">
          <div class="cc3d-side cc3d-anat">
            <div class="cc3d-title">${T('CharCreate.anatomy')}</div>
            <div class="cc3d-note" id="cc3d-body-count"></div>
            <div class="cc3d-add" data-focus="1" data-hnav="anat"
                 onclick="SceneManager._scene.openPicker('group')">+ ${T('CharCreate.cc3d.addPart')}</div>
            <div class="cc3d-scroll pockets-scroll" id="cc3d-body-list"></div>
          </div>
          <div class="cc3d-side cc3d-parts">
            <div class="cc3d-title" id="cc3d-parts-title"></div>
            <div id="cc3d-parts-bar"></div>
            <div class="cc3d-scroll pockets-scroll" id="cc3d-parts-body"></div>
          </div>
          <div class="cc3d-stage" id="cc3d-stage">
            <canvas id="cc3d-canvas"></canvas>
            <div class="cc3d-hint">${T('CharCreate.cc3d.hint')}</div>
            <div id="cc3d-handles"></div>
          </div>
        </div>
      </div>
      <div class="cc3d-modal" id="cc3d-modal"></div>
      <div class="cc3d-tip" id="cc3d-tip"></div>
    `;
    if (window.CCScroll) window.CCScroll.bindWheel(root);
    this._bindPointer();
    this.refreshAll();
  };

  Scene_CC3DModel.prototype.refreshAll = function () {
    this._renderTop();
    this._renderParts();
    this._renderHandles();
    this._renderBody();
    this._afterRender();
  };

  //---------------------------------------------------------------------------
  // Top bar
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype._renderTop = function () {
    const host = document.getElementById("cc3d-top");
    if (!host) return;
    const cfg = this._config;
    const mirror = cfg.symmetry === "mirror";
    host.innerHTML = `
      <span class="cc3d-title">${T('CharCreate.3dModel')}</span>
      <span class="cc3d-chip" data-focus="1" data-hnav="top"
            onclick="SceneManager._scene.openPicker('structure')">${displayName(cfg.base)}</span>
      <span class="cc3d-chip ${mirror ? "on" : ""}" data-focus="1" data-hnav="top"
            title="${T('CharCreate.cc3d.symmetry')}"
            onclick="SceneManager._scene.toggleSymmetry()">&#8646; ${mirror
              ? T('CharCreate.cc3d.symMirror') : T('CharCreate.cc3d.symOff')}</span>
      <span class="cc3d-chip ${this._history.length ? "" : "spent"}" data-focus="1" data-hnav="top"
            onclick="SceneManager._scene.undo()">&#8630; ${T('CharCreate.cc3d.undo')}</span>
      <span class="cc3d-chip ${this._future.length ? "" : "spent"}" data-focus="1" data-hnav="top"
            onclick="SceneManager._scene.redo()">&#8631; ${T('CharCreate.cc3d.redo')}</span>
      <span class="cc3d-chip" data-focus="1" data-hnav="top"
            onclick="SceneManager._scene.onRandomize()">${T('CharCreate.randomizeAll')}</span>
      <span class="cc3d-chip" data-focus="1" data-hnav="top"
            onclick="SceneManager._scene.rerollSeed()">${T('CharCreate.variation')} #${cfg.seed}</span>
      <span class="cc3d-spacer"></span>
      ${window.CCButtons.button(window.CCButtons.continueLabel(), {
        onclick: "SceneManager._scene.onConfirm()", confirm: true,
        attrs: 'data-focus="1" data-hnav="top"' })}
    `;
  };

  //---------------------------------------------------------------------------
  // The parts sidebar: whatever group is open
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype._renderParts = function () {
    const group = this._group3();
    const title = document.getElementById("cc3d-parts-title");
    if (title) title.textContent = group ? group.label() : T('CharCreate.cc3d.parts');
    const bar = document.getElementById("cc3d-parts-bar");
    if (bar) bar.innerHTML = this._partsBarHtml();
    const body = document.getElementById("cc3d-parts-body");
    if (body) body.innerHTML = this._drawerHtml();
  };

  // Only a shelf of parts needs a search box; a group of knobs or states does
  // not, so the bar is empty for those rather than promising a filter.
  Scene_CC3DModel.prototype._partsBarHtml = function () {
    const group = this._group3();
    if (!group) return "";
    if (group.kind !== "slot") {
      return `<div class="cc-row-inline"><span class="cc3d-chip grow" data-focus="1"
        data-hnav="partsbar" onclick="SceneManager._scene.surpriseGroup()"
        >${T('CharCreate.cc3d.surprise')}</span></div>`;
    }
    return `<div class="cc-row-inline">
        <input id="cc3d-search" class="cc3d-search" type="text" autocomplete="off"
               placeholder="${T('CharCreate.search')}" value="${this._filter}" />
        <span class="cc3d-chip" data-focus="1" data-hnav="partsbar"
              onclick="SceneManager._scene.surpriseGroup()">${T('CharCreate.cc3d.surprise')}</span>
      </div>
      <div class="cc3d-note" id="cc3d-shelf-count"></div>`;
  };

  // Every group the creature could be given something in, whether or not it is
  // wearing anything there yet. This is what "Add part" opens.
  Scene_CC3DModel.prototype._addableGroups = function () {
    return this._groups();
  };

  // What the open group holds: a shelf of parts, a set of states, or the knobs
  // that shape or colour the body.
  Scene_CC3DModel.prototype._drawerHtml = function () {
    const group = this._group3();
    if (!group) return `<p class="cc3d-note">${T('CharCreate.cc3d.pickAGroup')}</p>`;
    if (group.kind === "build") return this._knobsHtml(BUILD_SLIDERS.map((k) => "cfg:" + k));
    if (group.kind === "skin") return this._skinHtml();
    if (group.kind === "slot") return this._shelfHtml();
    return this._appendageHtml(group);
  };

  // A shelf of the real parts, each drawn as a small model of itself.
  Scene_CC3DModel.prototype._shelfHtml = function () {
    return `<div class="cc3d-shelf" id="cc3d-shelf">${this._cardsHtml()}</div>`;
  };

  Scene_CC3DModel.prototype._shelfOptions = function () {
    const all = optionsForSlot(this._slot);
    const filter = (this._filter || "").toLowerCase();
    if (!filter) return all;
    return all.filter((option) => option === "default"
      ? T('CharCreate.cc3d.bare').toLowerCase().includes(filter)
      : (displayName(option).toLowerCase().includes(filter) ||
         String(option).toLowerCase().includes(filter)));
  };

  Scene_CC3DModel.prototype._cardsHtml = function () {
    const options = this._shelfOptions();
    if (!options.length) return `<p class="cc3d-note">${T('CharCreate.noMatches')}</p>`;
    const worn = this._config.parts[this._slot];
    const end = Math.min(options.length, Math.max(SHELF_PAGE, this._shown));
    let html = "";
    for (let i = 0; i < end; i++) {
      const option = options[i];
      const bare = option === "default";
      const name = bare ? T('CharCreate.cc3d.bare') : displayName(option);
      let shot;
      if (bare) {
        shot = `<span class="cc3d-shot bare">&#9642;</span>`;
      } else {
        // A picture already taken is written straight into the card. Rebuilding
        // the shelf used to hand back blank images that only filled in again
        // when the watcher next fired, so every rebuild of the creature made
        // the whole shelf flash and redraw itself.
        const key = thumbKey(this._slot, option, this._config);
        const url = THUMB_CACHE.get(key);
        shot = `<span class="cc3d-shot"><img class="cc-visible" data-thumb="${key}" alt=""` + (url ? ` src="${url}"` : ``) + ` /></span>`;
      }
      html += `<div class="cc3d-card ${option === worn ? "on" : ""}" data-focus="1" data-hnav="shelf"
        data-part="${option}" title="${name}"
        onclick="SceneManager._scene.pickPart('${option}')"
        >${shot}<span class="cc3d-card-name">${name}</span></div>`;
    }
    return html;
  };

  Scene_CC3DModel.prototype._renderShelf = function () {
    const shelf = document.getElementById("cc3d-shelf");
    if (!shelf) { this._renderParts(); this._afterRender(); return; }
    shelf.innerHTML = this._cardsHtml();
    this._afterRender();
  };

  // An appendage is a feature of the body, not a mesh: it has states, not a
  // roster, so there is nothing to draw a picture of.
  Scene_CC3DModel.prototype._appendageHtml = function (group) {
    const appendage = group.appendage;
    if (appendage.kind === "slider") {
      return `<div class="cc3d-knobs">${this._sliderHtml("cfg:" + group.id)}</div>`;
    }
    const current = this._config[group.id];
    const labels = appendage.labels();
    const chips = appendage.states.map((state, i) =>
      `<span class="cc3d-chip ${state === current ? "on" : ""}" data-focus="1" data-hnav="knobs"
             onclick="SceneManager._scene.setAppendage('${group.id}', ${state})">${labels[i]}</span>`).join("");
    return `<div class="cc3d-knobs">${chips}</div>`;
  };

  Scene_CC3DModel.prototype._knobsHtml = function (ids) {
    const knobs = ids.map((id) => this._sliderHtml(id)).join("");
    return `<div class="cc3d-knobs">${knobs}</div>`;
  };

  Scene_CC3DModel.prototype._skinHtml = function () {
    const cfg = this._config;
    let html = `<span class="cc3d-chip" data-focus="1" data-hnav="knobs"
        onclick="SceneManager._scene.openPicker('surface')"><span class="cc3d-swatch cc3d-surface-${cfg.texturePool}"></span>${displayName(cfg.texturePool)}</span>`;
    if (hairApplies(cfg)) {
      html += `<span class="cc3d-chip" data-focus="1" data-hnav="knobs"
          onclick="SceneManager._scene.openPicker('hairstyle')">${hairLabel("hairstyle", cfg.hairStyle)}</span>
        <span class="cc3d-chip" data-focus="1" data-hnav="knobs"
          onclick="SceneManager._scene.openPicker('haircolor')"><span class="cc3d-swatch cc3d-swatch--round" style="--cc3d-swatch:${hairSwatchCss(cfg.hairColor)}"></span>${hairLabel("haircolor", cfg.hairColor)}</span>`;
    }
    html += SKIN_SLIDERS.map((key) => this._sliderHtml("cfg:" + key)).join("");
    return `<div class="cc3d-knobs">${html}</div>`;
  };

  //---------------------------------------------------------------------------
  // The handles for whatever is selected
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype._renderHandles = function () {
    const host = document.getElementById("cc3d-handles");
    if (host) host.innerHTML = this._handlesHtml();
  };

  Scene_CC3DModel.prototype._handlesHtml = function () {
    const slot = this._selected;
    if (!slot || this._slots().indexOf(slot) < 0) return "";
    const worn = this._config.parts[slot];
    const fitted = worn !== "default";
    const chips = HANDLES.map((handle) =>
      `<span class="cc3d-chip grow ${handle === this._handle ? "on" : ""}" data-focus="1" data-hnav="handles"
             onclick="SceneManager._scene.setHandle('${handle}')">${T('CharCreate.cc3d.' + handle)}</span>`).join("");
    const sliders = this._xfSliderIds().map((id) => this._sliderHtml(id)).join("");
    return `
      <div class="cc3d-handles">
        <div class="cc3d-handles-name">${slotLabel(slot)} &middot; ${fitted
          ? displayName(worn) : T('CharCreate.cc3d.bare')}</div>
        <div class="cc-row-inline cc-row-gap-tight">${chips}</div>
        ${sliders}
        <div class="cc-row-inline cc-row-gap-tight">
          <span class="cc3d-chip grow" data-focus="1" data-hnav="handles"
                onclick="SceneManager._scene.resetPart()">${T('CharCreate.cc3d.reset')}</span>
          ${fitted ? `<span class="cc3d-chip grow" data-focus="1" data-hnav="handles"
                onclick="SceneManager._scene.detachPart()">${T('CharCreate.cc3d.detach')}</span>` : ``}
        </div>
      </div>`;
  };

  Scene_CC3DModel.prototype._xfSliderIds = function () {
    if (this._handle === "turn") return ["xf:ry", "xf:rx", "xf:rz"];
    if (this._handle === "size") return ["xf:s"];
    return ["xf:x", "xf:y", "xf:z"];
  };

  //---------------------------------------------------------------------------
  // The body the sculpt adds up to
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype._renderBody = function () {
    const host = document.getElementById("cc3d-body-list");
    const count = document.getElementById("cc3d-body-count");
    if (count) {
      count.textContent = Object.keys(anatomyFor(this._config, this._archetypeKeys)).length +
        " " + T('CharCreate.bodyParts');
    }
    if (host) host.innerHTML = this._bodyHtml();
  };

  Scene_CC3DModel.prototype._bodyHtml = function () {
    const parts = anatomyFor(this._config, this._archetypeKeys);
    const keys = Object.keys(parts);
    if (!keys.length) return `<p class="cc3d-note">${T('CharCreate.noAnatomicalOrgansDefined')}</p>`;
    // Which row belongs to which part of the model, so pointing at one reaches
    // straight through to the thing it describes.
    const slots = slotsByPart(this._config, this._archetypeKeys);
    const HC = window.HealthCore;
    const spliced = (this._archetypeKeys || []).length > 1;
    return keys.map((key) => {
      const part = parts[key];
      // An archetype whose part carries an i18n key nothing answers for used to
      // leave a nameless row with a bare percentage against it. The key itself
      // is a perfectly good name once it is read out loud: LEFT_ARM -> Left Arm.
      const name = (HC && HC.archetypePartName && HC.archetypePartName(part)) ||
        (window.getArchetypeText && part.name ? window.getArchetypeText(part.name) : "") ||
        partKeyName(key);
      let tag = "";
      if (part.fromGraft) {
        tag = `<span class="cc3d-tag graft">${slotLabel(part.fromGraft)}</span>`;
      } else if (spliced) {
        tag = `<span class="cc3d-tag">${part.fromArchetype === 1
          ? T('CharCreate.secondary') : T('CharCreate.primary')}</span>`;
      }
      const vital = part.vital ? `<span class="cc3d-tag vital">${T('CharCreate.vital')}</span>` : "";
      // A row that names a part of the model is a way INTO it: pointing at one
      // selects it on the creature and stocks the shelf beside it, so the list
      // of what the creature is made of doubles as the way to change it.
      const slot = part.fromGraft || slots[key] || null;
      const reach = slot
        ? ` pick${slot === this._selected ? " on" : ""}" data-focus="1" data-hnav="body"
            onmouseenter="SceneManager._scene.selectSlot('${slot}')"
            onclick="SceneManager._scene.selectSlot('${slot}')`
        : `"`;
      return `<div class="cc3d-part${reach}>
          <span>${name}${tag}</span>
          <span class="cc3d-part-hp">${part.hpPercent}%${vital}</span>
        </div>`;
    }).join("");
  };

  //---------------------------------------------------------------------------
  // Sliders
  //---------------------------------------------------------------------------

  // id is "cfg:<key>" (a knob on the body, which needs the model rebuilt) or
  // "xf:<key>" (where the selected part sits, which is applied to the live
  // object with no rebuild at all).
  Scene_CC3DModel.prototype._sliderDef = function (id) {
    const parts = String(id).split(":");
    const kind = parts[0], key = parts[1];
    if (kind === "xf") {
      const def = XF_SLIDERS[key];
      if (!def || !this._selected) return null;
      const out = Object.assign({ kind, key }, def);
      if (def.unit === "offset") {
        // The bar spans exactly what the part can do, so dragging it never runs
        // into a dead stretch where the snap has already taken over.
        const reach = this._reachFor(this._selected);
        out.min = -reach; out.max = reach;
        out.step = Math.max(0.01, Math.round((reach / 30) * 100) / 100);
      }
      return out;
    }
    const def = CFG_SLIDERS[key];
    return def ? Object.assign({ kind, key }, def) : null;
  };

  Scene_CC3DModel.prototype._sliderValue = function (def) {
    if (def.kind === "xf") return (this._config.partXf[this._selected] || defaultXf())[def.key];
    return this._config[def.key];
  };

  Scene_CC3DModel.prototype._sliderText = function (def) {
    const value = this._sliderValue(def);
    if (def.swatch) {
      const css = `hsl(${Math.round(value * 360)}, ${Math.round((this._config.sat || 0.45) * 100)}%,` +
                  ` ${Math.round((this._config.lit || 0.6) * 100)}%)`;
      return `<span class="cc3d-swatch" style="--cc3d-swatch:${css}"></span>${Math.round(value * 360)}&deg;`;
    }
    if (def.unit === "height") {
      const cm = Math.round(HEIGHT_BASE_M * value * 100);
      return T('CharCreate.heightMetres', { m: Math.floor(cm / 100), cm: cm % 100 });
    }
    if (def.unit === "weight") return Math.round(WEIGHT_BASE_KG * value) + "kg";
    if (def.unit === "angle") return Math.round(value / RAD) + "&deg;";
    if (def.unit === "offset") return (value >= 0 ? "+" : "") + value.toFixed(2);
    return Math.round(value * 100) + "%";
  };

  Scene_CC3DModel.prototype._sliderHtml = function (id) {
    const def = this._sliderDef(id);
    if (!def) return "";
    const pct = clamp(((this._sliderValue(def) - def.min) / (def.max - def.min)) * 100, 0, 100);
    return `<div class="cc3d-sl" data-focus="1" data-slider="${id}">
        <div class="cc3d-sl-head"><span>${def.label()}</span>
          <span class="cc3d-sl-val" id="cc3d-v-${CSS_ID(id)}">${this._sliderText(def)}</span></div>
        <div class="cc3d-sl-bar" data-sliderbar="${id}">
          <div class="cc3d-sl-fill" id="cc3d-f-${CSS_ID(id)}" style="--cc-bar-w:${pct}%"></div>
        </div>
      </div>`;
  };

  Scene_CC3DModel.prototype._refreshSlider = function (id) {
    const def = this._sliderDef(id);
    if (!def) return;
    const value = document.getElementById("cc3d-v-" + CSS_ID(id));
    const fill = document.getElementById("cc3d-f-" + CSS_ID(id));
    if (value) value.innerHTML = this._sliderText(def);
    if (fill) fill.style.setProperty("--cc-bar-w",
      clamp(((this._sliderValue(def) - def.min) / (def.max - def.min)) * 100, 0, 100) + "%");
  };

  Scene_CC3DModel.prototype._refreshXfSliders = function () {
    this._xfSliderIds().forEach((id) => this._refreshSlider(id));
  };

  Scene_CC3DModel.prototype._setSlider = function (id, raw) {
    const def = this._sliderDef(id);
    if (!def) return;
    let value = clamp(raw, def.min, def.max);
    value = Math.round(value / def.step) * def.step;
    value = Math.round(value * 10000) / 10000;
    if (def.kind === "xf") {
      const xf = Object.assign(defaultXf(), this._config.partXf[this._selected]);
      if (xf[def.key] === value) return;
      xf[def.key] = value;
      this.applyPartTransform(this._selected, xf);
      // The snap may have shortened the whole offset, not only the axis that
      // moved, so every placement slider is re-read from what was kept.
      this._refreshXfSliders();
      return;
    }
    if (this._config[def.key] === value) return;
    this._config[def.key] = value;
    this._refreshSlider(id);
    if (def.key === "sat" || def.key === "lit") this._refreshSlider("cfg:hue");
    this.scheduleRebuild();
  };

  //---------------------------------------------------------------------------
  // Undo
  //---------------------------------------------------------------------------

  // Nothing in a sculptor should be a one-way door: every gesture that changes
  // the creature stows the one before it, so a wrong part, a mis-aimed drag or
  // an unlucky reroll is one press away from being put back. Snapshots are
  // taken at the START of a gesture, so a drag is one step back, not a hundred.
  Scene_CC3DModel.prototype.pushHistory = function () {
    this._history.push(JSON.stringify(this._config));
    if (this._history.length > HISTORY_MAX) this._history.shift();
    this._future.length = 0;
  };

  Scene_CC3DModel.prototype.undo = function () {
    if (!this._history.length) { SoundManager.playBuzzer(); return; }
    this._future.push(JSON.stringify(this._config));
    this._loadSculpt(this._history.pop());
  };

  Scene_CC3DModel.prototype.redo = function () {
    if (!this._future.length) { SoundManager.playBuzzer(); return; }
    this._history.push(JSON.stringify(this._config));
    this._loadSculpt(this._future.pop());
  };

  Scene_CC3DModel.prototype._loadSculpt = function (json) {
    let restored;
    try { restored = normalizeConfig(JSON.parse(json)); } catch (e) { return; }
    this._config = restored;
    const groups = this._groups();
    if (!groups.some((g) => g.id === this._group)) this._openGroup(groups[0]);
    if (this._selected && this._slots().indexOf(this._selected) < 0) this._selected = null;
    this.refreshAll();
    this.rebuildModel();
  };

  //---------------------------------------------------------------------------
  // Doing things to the creature
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype.openGroup = function (id) {
    const group = this._groups().find((g) => g.id === id);
    if (!group) return;
    this._openGroup(group);
    SoundManager.playCursor();
    this._renderParts();
    this._renderHandles();
    this._renderBody();
    this._afterRender();
    this._refreshSelection();
  };

  Scene_CC3DModel.prototype.toggleSymmetry = function () {
    this._config.symmetry = this._config.symmetry === "mirror" ? "off" : "mirror";
    SoundManager.playCursor();
    this._renderTop();
    this._afterRender();
  };

  Scene_CC3DModel.prototype.setHandle = function (handle) {
    if (HANDLES.indexOf(handle) < 0 || this._handle === handle) return;
    this._handle = handle;
    if (this._view3D && this._view3D.mode === "part") this._view3D.partHandle = handle;
    SoundManager.playCursor();
    this._renderHandles();
    this._afterRender();
    this._updateGizmo();
  };

  // Can this part be worn here? "Bare" always can (it takes a graft off), a
  // curated humanoid head only on the head, every other donor only where the
  // compatibility table says it has a real mesh -- and never on a fixed slot.
  // Anything can be worn anywhere. The only rules left are the ones that are
  // about the BODY rather than about anatomy: a slot this creature can be given
  // something in at all, the torso being the creature itself, and a curated
  // humanoid head being a head.
  Scene_CC3DModel.prototype._canFit = function (value, slot) {
    if (!slot || FIXED_SLOTS[slot]) return false;
    if (editableSlots(this._config.base).indexOf(slot) < 0) return false;
    if (value === "default") return true;
    if (isHeadPreset(value)) return slot === "head";
    return true;
  };

  Scene_CC3DModel.prototype.pickPart = function (value) {
    this.fitPart(this._slot, value);
  };

  Scene_CC3DModel.prototype.fitPart = function (slot, value) {
    if (!this._canFit(value, slot)) { SoundManager.playBuzzer(); return; }
    this.pushHistory();
    mirrorTargets(this._config, slot).forEach((target) => {
      if (!this._canFit(value, target)) return;
      this._config.parts[target] = value;
      // A fresh part starts at its own clean fit: swapping donors never
      // inherits the last one's shove.
      this._config.partXf[target] = defaultXf();
    });
    this._selected = slot;
    this._renderParts();
    this._renderHandles();
    this._renderBody();
    this._afterRender();
    this.scheduleRebuild();
  };

  Scene_CC3DModel.prototype.detachPart = function () {
    if (!this._selected || this._config.parts[this._selected] === "default") return;
    this.fitPart(this._selected, "default");
  };

  Scene_CC3DModel.prototype.resetPart = function () {
    if (!this._selected) return;
    this.pushHistory();
    this.applyPartTransform(this._selected, defaultXf());
    this._renderHandles();
    this._afterRender();
  };

  Scene_CC3DModel.prototype.setAppendage = function (key, state) {
    if (this._config[key] === state) return;
    this.pushHistory();
    this._config[key] = state;
    this._renderParts();
    this._renderBody();
    this._afterRender();
    this.scheduleRebuild();
  };

  // One group at a time is the fun way to build a creature: try a wild leg
  // without throwing away the head you like.
  Scene_CC3DModel.prototype.surpriseGroup = function () {
    const group = this._group3();
    if (!group) return;
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    if (group.kind === "slot") {
      const targets = mirrorTargets(this._config, group.id);
      const pool = this._shelfOptions()
        .filter((o) => o !== "default" && targets.every((t) => this._canFit(o, t)));
      if (!pool.length) { SoundManager.playBuzzer(); return; }
      this.fitPart(group.id, pick(pool));
      return;
    }
    if (group.appendage && group.appendage.kind === "slider") {
      this.pushHistory();
      this._config[group.id] = Math.round(Math.random() * 20) / 10;
      this._renderParts();
      this._afterRender();
      this.scheduleRebuild();
      return;
    }
    if (group.appendage) this.setAppendage(group.id, pick(group.appendage.states));
  };

  Scene_CC3DModel.prototype.rerollSeed = function () {
    this.pushHistory();
    this._config.seed = 1 + Math.floor(Math.random() * 99998);
    this._renderTop();
    this._afterRender();
    this.scheduleRebuild();
  };

  // Reroll everything ABOUT the creature, never the creature itself: the body
  // is what the player or their archetype chose, and throwing it away on a
  // reroll would mean losing it to change its details.
  Scene_CC3DModel.prototype.onRandomize = function () {
    this.pushHistory();
    const kept = {
      base: this._config.base,
      symmetry: this._config.symmetry,
      secondary: this._config.secondary
    };
    const next = normalizeConfig(randomConfig());
    Object.assign(next, kept);
    rollParts(next);
    this._config = next;
    const groups = this._groups();
    if (!groups.some((g) => g.id === this._group)) this._openGroup(groups[0]);
    this.refreshAll();
    this.scheduleRebuild();
  };

  // Write a part's placement into the sculpt and straight onto the live object:
  // moving a part never rebuilds the model, so the drag stays smooth.
  Scene_CC3DModel.prototype.applyPartTransform = function (slot, xf) {
    if (!slot) return;
    const wanted = {
      x: clamp(xf.x, -XF_LIMIT, XF_LIMIT),
      y: clamp(xf.y, -XF_LIMIT, XF_LIMIT),
      z: clamp(xf.z, -XF_LIMIT, XF_LIMIT),
      rx: xf.rx, ry: xf.ry, rz: xf.rz,
      s: clamp(xf.s, XF_SIZE_MIN, XF_SIZE_MAX)
    };
    mirrorTargets(this._config, slot).forEach((target, i) => {
      // Each side is snapped against ITS OWN part: a mirrored pair is not
      // always the same size, and both halves have to stay attached.
      const want = i === 0 ? wanted : mirrorXf(wanted);
      const reach = this._reachFor(target);
      const distance = Math.sqrt(want.x * want.x + want.y * want.y + want.z * want.z);
      const value = Object.assign(defaultXf(), want);
      if (distance > reach && distance > 1e-6) {
        const k = reach / distance;
        value.x *= k; value.y *= k; value.z *= k;
      }
      this._config.partXf[target] = value;
      applyPartPlacement(this._movable(target), value);
    });
  };

  //---------------------------------------------------------------------------
  // What is on the creature
  //---------------------------------------------------------------------------

  // The creature only ever shows what has actually been sculpted. Pointing at a
  // card used to put its part on straight away and take it off again on the way
  // past, which made the creature flicker through a hundred bodies while the
  // shelf was merely being read: a part changes when it is CHOSEN, never when
  // it is looked at. The card's own picture is what a part is judged by.
  Scene_CC3DModel.prototype._shownConfig = function () {
    return this._config;
  };

  //---------------------------------------------------------------------------
  // Leaving
  //---------------------------------------------------------------------------

  // Leaving happens exactly once. A second call cannot pop a second scene off
  // the stack, and a pop is never allowed to run past the bottom of it, which
  // is SceneManager.exit(): the game closing itself.
  Scene_CC3DModel.prototype._safePop = function () {
    if (SceneManager._stack && SceneManager._stack.length > 0) SceneManager.pop();
    else if (typeof Scene_Map !== "undefined") SceneManager.goto(Scene_Map);
  };

  // Nothing that happens on the way out is allowed to keep the player in here.
  // Writing the sculpt down and rebuilding the body from it both touch data
  // that came from a hundred donors, and a single part the store or Health
  // cannot swallow used to throw out of onConfirm with the leaving latch
  // already down: the Continue button and Escape both went dead, the sculptor
  // stayed on screen, and the only way out of a finished creature was closing
  // the game. The sculpt is saved as best it can be, and the scene leaves
  // either way.
  Scene_CC3DModel.prototype.onConfirm = function () {
    if (this._leaving) return;
    this._leaving = true;
    try { setConfig(this._actorId, this._config); } catch (e) { console.error(e); }
    try { this._applyAnatomyToActor(); } catch (e) { console.error(e); }
    // Creature mode was PUSHED over the creature scene: pop once back to it and
    // let it resume the flow. Humanoid mode mirrors the bust selector's exit: a
    // double pop past the sprite board it was opened from, landing on the
    // wizard, which resumes on the step after the one that opened the chain.
    try {
      if (this._creatureMode) {
        Scene_CC3DModel._creatureResult = "confirm";
        this._safePop();
        return;
      }
      // Back to whoever opened the sculptor, never past it: popping blind used
      // to walk the stack all the way out to the map, ending creation instead
      // of returning to the sheet the sculpt belongs to.
      if (Scene_CC3DModel._returnByPop) { this._safePop(); return; }
      const ret = Scene_CC3DModel._returnSceneClass;
      if (ret) { SceneManager.goto(ret); return; }
      this._safePop();
    } catch (e) {
      // The scene the sculptor was told to go back to is gone or broken. Fall
      // back to the plain pop, and if even that fails let the player press
      // Continue again rather than sealing them in.
      console.error(e);
      try { this._safePop(); } catch (e2) { console.error(e2); this._leaving = false; }
    }
  };

  // What the character walks away with. The parts the sculpt fitted are
  // recorded on the actor and its body rebuilt from its archetypes with those
  // folded over the top, so a dragon head worn here is a dragon head in the
  // health menu, in the equip screen and in a fight.
  Scene_CC3DModel.prototype._applyAnatomyToActor = function () {
    const actor = (typeof $gameActors !== "undefined" && $gameActors)
      ? $gameActors.actor(this._actorId) : null;
    if (!actor) return;
    const grafts = graftedParts(this._config, this._archetypeKeys);
    actor._ccGraftedParts = Object.keys(grafts.parts).length ? grafts.parts : null;
    actor._ccReplacedParts = grafts.replaced.length ? grafts.replaced : null;
    const kept = actor._bodyParts;
    actor._bodyParts = null;
    if (typeof window.initializeBodyParts === "function") {
      // A graft Health cannot read must not leave the character with no body at
      // all: the anatomy it walked in with is put back and the sculpt still
      // stands, rather than an actor whose every limb has vanished.
      try {
        window.initializeBodyParts(actor);
      } catch (e) {
        console.error(e);
        actor._ccGraftedParts = null;
        actor._ccReplacedParts = null;
        actor._bodyParts = kept || null;
      }
    }
  };

  //---------------------------------------------------------------------------
  // Focus ring (keyboard / controller)
  //---------------------------------------------------------------------------

  // Every control carries data-focus, so the ring is the screen read in
  // document order. Controls that sit in a row carry the same data-hnav: left
  // and right walk that row, up and down step out of it. Nothing is registered
  // twice and a re-render cannot desynchronise the ring from what is on screen.
  Scene_CC3DModel.prototype._focusEls = function () {
    return this._root
      ? Array.prototype.slice.call(this._root.querySelectorAll("[data-focus]"))
      : [];
  };

  const rowOf = (el) => (el ? el.getAttribute("data-hnav") : null);

  Scene_CC3DModel.prototype._afterRender = function () {
    const els = this._focusEls();
    if (this._focus >= els.length) this._focus = Math.max(0, els.length - 1);
    this._paintFocus(els, false);
    this._bindSearch();
    this._watchThumbs();
    const scroll = document.getElementById("cc3d-parts-body");
    if (scroll && !scroll._ccGrow) {
      scroll._ccGrow = true;
      scroll.addEventListener("scroll", () => this._growShelf());
    }
    const count = document.getElementById("cc3d-shelf-count");
    if (count) count.textContent = this._shelfOptions().length + " " + T('CharCreate.cc3d.parts');
  };

  Scene_CC3DModel.prototype._bindSearch = function () {
    const search = document.getElementById("cc3d-search");
    if (!search || search._ccBound) return;
    search._ccBound = true;
    search.addEventListener("input", () => {
      this._filter = search.value.toLowerCase();
      this._shown = SHELF_PAGE;
      this._renderShelf();
    });
    search.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) search.blur();
    });
  };

  Scene_CC3DModel.prototype._growShelf = function () {
    const scroll = document.getElementById("cc3d-parts-body");
    if (!scroll || this._shown >= this._shelfOptions().length) return;
    if (scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 260) return;
    this._shown += SHELF_PAGE;
    this._renderShelf();
  };

  Scene_CC3DModel.prototype._paintFocus = function (els, reveal) {
    els = els || this._focusEls();
    els.forEach((el, i) => el.classList.toggle("cc3d-focus", i === this._focus && !this._modal));
    const current = els[this._focus];
    if (reveal && current && current.scrollIntoView && !this._modal) {
      current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  Scene_CC3DModel.prototype._focusOn = function (el) {
    const els = this._focusEls();
    const i = els.indexOf(el);
    if (i >= 0 && i !== this._focus) { this._focus = i; this._paintFocus(els, false); }
  };

  Scene_CC3DModel.prototype._moveFocus = function (dir, vertical) {
    const els = this._focusEls();
    if (!els.length) return;
    const row = rowOf(els[this._focus]);
    let index = this._focus + dir;
    if (vertical && row) {
      // Stepping out of a row lands on the first control past the end of it,
      // so up and down move between the bar, the handles and the drawer rather
      // than crawling along one of them.
      while (index >= 0 && index < els.length && rowOf(els[index]) === row) index += dir;
    }
    if (!vertical && row) {
      // ...and left and right stay inside it.
      if (index < 0 || index >= els.length || rowOf(els[index]) !== row) return;
    }
    index = Math.max(0, Math.min(els.length - 1, index));
    if (index === this._focus) return;
    this._focus = index;
    SoundManager.playCursor();
    this._paintFocus(els, true);
    this._growShelf();
  };

  Scene_CC3DModel.prototype._activateFocus = function () {
    const el = this._focusEls()[this._focus];
    if (!el) return;
    if (el.hasAttribute("data-slider")) return;      // sliders answer to left / right
    if (el.id === "cc3d-search") { el.focus(); return; }
    const part = el.getAttribute("data-part");
    if (part !== null) { this.pickPart(part); return; }
    el.click();
  };

  Scene_CC3DModel.prototype._adjustFocus = function (dir) {
    const el = this._focusEls()[this._focus];
    if (!el) return;
    const id = el.getAttribute("data-slider");
    if (id) {
      const def = this._sliderDef(id);
      if (def) { this.pushHistory(); this._setSlider(id, this._sliderValue(def) + dir * def.step); }
      return;
    }
    this._moveFocus(dir, false);
  };

  //---------------------------------------------------------------------------
  // Pointer on the panels
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype._bindPointer = function () {
    const root = this._root;
    if (!root) return;
    this._onDown = (e) => {
      if (this._modal) return;
      const bar = e.target.closest && e.target.closest("[data-sliderbar]");
      if (bar) {
        this.pushHistory();
        this._sliderDrag = { id: bar.getAttribute("data-sliderbar"), bar: bar };
        this._focusOn(bar.parentElement);
        this._applySliderFromEvent(e);
        e.preventDefault();
        return;
      }
      // A card is not carried anywhere: choosing it is the whole gesture.
      const card = e.target.closest && e.target.closest("[data-focus]");
      if (card) this._focusOn(card);
    };
    this._onMove = (e) => { if (this._sliderDrag) this._applySliderFromEvent(e); };
    this._onUp = () => { this._sliderDrag = null; };
    // Ctrl+Z / Ctrl+Y, because that is where a hand already reaches for it.
    this._onKey = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = String(e.key || "").toLowerCase();
      if (key === "z" && !e.shiftKey) { this.undo(); e.preventDefault(); }
      else if (key === "y" || (key === "z" && e.shiftKey)) { this.redo(); e.preventDefault(); }
    };
    root.addEventListener("mousedown", this._onDown);
    window.addEventListener("mousemove", this._onMove);
    window.addEventListener("mouseup", this._onUp);
    window.addEventListener("keydown", this._onKey);
  };

  Scene_CC3DModel.prototype._applySliderFromEvent = function (e) {
    const drag = this._sliderDrag;
    if (!drag) return;
    const def = this._sliderDef(drag.id);
    if (!def) return;
    const rect = drag.bar.getBoundingClientRect();
    const t = clamp((e.clientX - rect.left) / (rect.width || 1), 0, 1);
    this._setSlider(drag.id, def.min + t * (def.max - def.min));
  };

  //---------------------------------------------------------------------------
  // Input
  //---------------------------------------------------------------------------

  // CCScroll hook: the shelf, or the picker grid while it is open.
  Scene_CC3DModel.prototype.ccScrollTarget = function () {
    return document.getElementById(this._modal ? "cc3d-modal-grid" : "cc3d-parts-body");
  };

  Scene_CC3DModel.prototype.update = function () {
    Scene_MenuBase.prototype.update.call(this);
    if (window.CCScroll) window.CCScroll.update(this._root);
    if (this._modal) { this._updateModalInput(); return; }
    // Escape and the pad's B leave the same way Continue does: with the sculpt
    // kept. There is no discard here, so a stray press cannot cost one.
    if (this._eatCancel > 0) {
      this._eatCancel--;
      if (TouchInput.isCancelled()) return;
    }
    if (Input.isTriggered("cancel") || TouchInput.isCancelled()) { this.onConfirm(); return; }
    if (Input.isRepeated("down")) this._moveFocus(1, true);
    else if (Input.isRepeated("up")) this._moveFocus(-1, true);
    else if (Input.isRepeated("right")) this._adjustFocus(1);
    else if (Input.isRepeated("left")) this._adjustFocus(-1);
    else if (Input.isTriggered("ok")) this._activateFocus();
    // Nothing else is bound. A stray key must never throw away a sculpt:
    // rerolling is a deliberate press of the chip that says so.
  };

  //---------------------------------------------------------------------------
  // The picker for the things that are not parts (body, surface, hair)
  //---------------------------------------------------------------------------

  const MODAL_COLS = 4;

  Scene_CC3DModel.prototype.openPicker = function (kind) {
    let options, current;
    if (kind === "group") {
      // Not a list of things to BE, a list of places to put something: every
      // group this creature has, whether or not it is wearing anything there.
      options = this._addableGroups().map((g) => g.id);
      current = this._group;
      if (!options.length) { SoundManager.playBuzzer(); return; }
    }
    else if (kind === "structure") { options = structureOptions(); current = this._config.base; }
    else if (kind === "surface") { options = TEXTURE_POOL_KEYS; current = this._config.texturePool; }
    else if (kind === "hairstyle") { options = hairStyleKeys(); current = this._config.hairStyle; }
    else if (kind === "haircolor") { options = hairColorKeys(); current = this._config.hairColor; }
    else return;
    this._modal = {
      kind: kind, options: options, filtered: options, filter: "",
      index: Math.max(0, options.indexOf(current)), page: 48, shown: 0
    };
    this._renderModal();
    this._paintFocus(null, false);
  };

  Scene_CC3DModel.prototype.closeModal = function () {
    if (!this._modal) return;
    this._modal = null;
    const el = document.getElementById("cc3d-modal");
    if (el) { el.classList.remove("open"); el.innerHTML = ""; }
    this._paintFocus(null, false);
  };

  Scene_CC3DModel.prototype._modalTitle = function () {
    const kind = this._modal.kind;
    if (kind === "group") return T('CharCreate.cc3d.addPart');
    if (kind === "structure") return T('CharCreate.structure');
    if (kind === "surface") return T('CharCreate.surface');
    if (kind === "hairstyle") return T('CharCreate.hair');
    return T('CharCreate.hairColour');
  };

  Scene_CC3DModel.prototype._renderModal = function () {
    const el = document.getElementById("cc3d-modal");
    if (!el) return;
    const modal = this._modal;
    // The overlay, its card and its grid are all in the stylesheet
    // (.cc3d-modal and friends); the only thing the markup knows that the
    // sheet cannot is how many columns the grid is meant to have.
    el.innerHTML = `
      <div class="cc3d-modal-card">
        <div class="cc3d-modal-head" data-nav-skip data-nav-owner="_updateModalInput">
          <h2 class="cc-header-gothic cc3d-modal-title">${this._modalTitle()}</h2>
          ${modal.kind === "structure" ? `<input id="cc3d-modal-search" class="cc3d-modal-search" type="text"
            placeholder="${T('CharCreate.search')}" value="${modal.filter}" />` : ``}
          <button class="cc-btn-treaty" onclick="SceneManager._scene.closeModal()"
            >${T('CharCreate.close')}</button>
        </div>
        <div id="cc3d-modal-grid" class="pockets-scroll cc3d-modal-grid"
             style="--cc3d-modal-cols:${MODAL_COLS}"></div>
      </div>`;
    el.classList.add("open");
    const search = document.getElementById("cc3d-modal-search");
    if (search) {
      search.addEventListener("input", () => {
        modal.filter = search.value.toLowerCase();
        modal.filtered = modal.options.filter((o) =>
          displayName(o).toLowerCase().includes(modal.filter) ||
          String(o).toLowerCase().includes(modal.filter));
        modal.index = 0;
        this._renderModalGrid();
      });
      search.addEventListener("keydown", (e) => {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) search.blur();
      });
    }
    this._renderModalGrid();
  };

  Scene_CC3DModel.prototype._renderModalGrid = function () {
    const grid = document.getElementById("cc3d-modal-grid");
    if (!grid || !this._modal) return;
    const modal = this._modal;
    modal.shown = 0;
    if (!modal.filtered.length) {
      grid.innerHTML = `<div class="cc3d-note cc-span-full-row">${T('CharCreate.noMatches')}</div>`;
      return;
    }
    grid.innerHTML = "";
    if (!grid._ccBound) {
      grid._ccBound = true;
      grid.addEventListener("scroll", () => this._growModalGrid(true));
      grid.addEventListener("wheel", (e) => {
        grid.scrollTop += e.deltaY;
        e.preventDefault(); e.stopPropagation();
        this._growModalGrid(true);
      }, { passive: false });
    }
    this._growModalGrid();
    this._ensureModalShown(modal.index);
    this._highlightModalCell();
  };

  Scene_CC3DModel.prototype._growModalGrid = function (onlyNearEnd) {
    const modal = this._modal;
    const grid = document.getElementById("cc3d-modal-grid");
    if (!modal || !grid || modal.shown >= modal.filtered.length) return;
    if (onlyNearEnd && grid.scrollTop + grid.clientHeight < grid.scrollHeight - 260) return;
    const end = Math.min(modal.filtered.length, modal.shown + modal.page);
    let html = "";
    for (let i = modal.shown; i < end; i++) html += this._modalCellHtml(modal.filtered[i], i);
    grid.insertAdjacentHTML("beforeend", html);
    modal.shown = end;
  };

  Scene_CC3DModel.prototype._ensureModalShown = function (index) {
    const modal = this._modal;
    if (!modal) return;
    while (modal.shown <= index && modal.shown < modal.filtered.length) this._growModalGrid();
  };

  Scene_CC3DModel.prototype._modalCellHtml = function (option, index) {
    const kind = this._modal.kind;
    const isHair = (kind === "hairstyle" || kind === "haircolor");
    let label = isHair ? hairLabel(kind, option) : displayName(option);
    let lead = "";
    if (kind === "group") {
      const group = this._groups().find((g) => g.id === option);
      label = group ? group.label() : option;
      const worn = group && group.kind === "slot" && this._config.parts[group.id] !== "default";
      const grown = group && group.appendage && !!this._config[group.id];
      if (worn || grown) lead = `<span class="cc3d-dot cc-rpg-icon-gap"></span>`;
    } else if (kind === "surface") {
      lead = `<span class="cc3d-swatch cc3d-swatch--lg cc3d-surface-${option}"></span>`;
    } else if (kind === "haircolor") {
      lead = `<span class="cc3d-swatch cc3d-swatch--lg cc3d-swatch--round" style="--cc3d-swatch:${hairSwatchCss(option)}"></span>`;
    }
    return `<div class="cc-wanted-card cc3d-cell" data-idx="${index}"
        onclick="SceneManager._scene.pickModalOption(${index})">
        <span class="cc3d-cell-label">${lead}${label}</span>
      </div>`;
  };

  Scene_CC3DModel.prototype._highlightModalCell = function () {
    const grid = document.getElementById("cc3d-modal-grid");
    if (!grid || !this._modal) return;
    grid.querySelectorAll(".cc3d-cell").forEach((cell) => {
      cell.classList.toggle("selected", parseInt(cell.getAttribute("data-idx"), 10) === this._modal.index);
    });
    const selected = grid.querySelector(".cc3d-cell.selected");
    if (selected && selected.scrollIntoView) selected.scrollIntoView({ block: "nearest" });
  };

  Scene_CC3DModel.prototype._moveModal = function (dCol, dRow) {
    const modal = this._modal;
    if (!modal) return;
    const index = clamp(modal.index + (dCol || 0) + (dRow || 0) * MODAL_COLS, 0, modal.filtered.length - 1);
    if (index === modal.index) return;
    modal.index = index;
    this._ensureModalShown(index);
    SoundManager.playCursor();
    this._highlightModalCell();
  };

  Scene_CC3DModel.prototype.pickModalOption = function (index) {
    const modal = this._modal;
    if (!modal) return;
    const option = modal.filtered[index];
    if (option == null) return;
    const kind = modal.kind;
    if (kind === "group") {
      this.closeModal();
      this.openGroup(option);
      return;
    }
    this.pushHistory();
    this.closeModal();
    if (kind === "structure") {
      if (this._config.base !== option) {
        this._config.base = option;
        // A different skeleton owns a different set of parts, and whatever was
        // hanging off the old one has nowhere to sit.
        this._config.parts = defaultParts();
        this._config.partXf = defaultPartXf();
        this._config.secondary = null;
        this._selected = null;
        this._anchors = {};
        this._openGroup(this._groups()[0]);
      }
    } else if (kind === "surface") this._config.texturePool = option;
    else if (kind === "hairstyle") this._config.hairStyle = option;
    else this._config.hairColor = option;
    this.refreshAll();
    this.scheduleRebuild();
  };

  Scene_CC3DModel.prototype._updateModalInput = function () {
    if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
      SoundManager.playCancel(); this.closeModal(); return;
    }
    if (Input.isRepeated("down")) this._moveModal(0, 1);
    else if (Input.isRepeated("up")) this._moveModal(0, -1);
    else if (Input.isRepeated("right")) this._moveModal(1, 0);
    else if (Input.isRepeated("left")) this._moveModal(-1, 0);
    else if (Input.isTriggered("ok")) this.pickModalOption(this._modal.index);
  };

  //---------------------------------------------------------------------------
  // The stage: the creature itself
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype._initStage = function () {
    if (!isAvailable()) return;
    const canvas = document.getElementById("cc3d-canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width) || 800);
    const height = Math.max(1, Math.round(rect.height) || 500);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    } catch (e) {
      return;
    }
    if (!renderer || !renderer.getContext || !renderer.getContext()) {
      if (renderer && renderer.dispose) {
        try { renderer.dispose(); } catch (e) {}
      }
      return;
    }
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);

    const scene = new THREE.Scene();
    // Muted studio lighting: MeshStandardMaterial with a light skin map blows
    // out to white under strong light, so keep the sum well under saturation.
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xfff2d0, 0.75); key.position.set(3, 5, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.3); fill.position.set(-3, -2, 2); scene.add(fill);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 300);
    camera.position.set(0, 0, 8);
    const pivot = new THREE.Group();
    scene.add(pivot);

    const state = {
      renderer: renderer, canvas: canvas, scene: scene, camera: camera, pivot: pivot,
      holder: null, model: null, rafId: 0, disposed: false, frameAcc: 0,
      mode: "none", partHandle: null, prev: { x: 0, y: 0 },
      clock: new THREE.Clock(), listeners: {},
      ray: new THREE.Raycaster(), pointer: new THREE.Vector2(),
      plane: new THREE.Plane(), grabLocal: new THREE.Vector3(),
      selHelper: null, selTarget: null, hoverHelper: null,
      gizmo: null, gizmoAxis: null, dragStart: null,
      size: { w: width, h: height }
    };
    this._view3D = state;
    this._createGizmo(state);
    this._createThumbStage();

    const L = state.listeners;
    L.onDown = (e) => this._onStageDown(e);
    L.onMove = (e) => this._onStageMove(e);
    L.onUp = () => this._onStageUp();
    L.onLeave = () => { this._hideTip(); this._setHoverSlot(null); this._hoverSlot = null; };
    L.onWheel = (e) => {
      if (this._modal) return;
      e.preventDefault(); e.stopPropagation();
      camera.position.z = clamp(camera.position.z + e.deltaY * 0.012, 1.5, 60);
    };
    L.onAux = (e) => { if (e.button === 1) e.preventDefault(); };
    L.onCtx = (e) => e.preventDefault();
    L.onTStart = (e) => {
      if (!this._modal && e.touches.length === 1) {
        state.mode = "orbit";
        state.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    L.onTMove = (e) => {
      if (state.mode === "orbit" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - state.prev.x, dy = e.touches[0].clientY - state.prev.y;
        pivot.rotation.y += dx * 0.012; pivot.rotation.x += dy * 0.012;
        state.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    L.onTEnd = () => { state.mode = "none"; };

    canvas.addEventListener("mousedown", L.onDown);
    canvas.addEventListener("mouseleave", L.onLeave);
    window.addEventListener("mousemove", L.onMove);
    window.addEventListener("mouseup", L.onUp);
    canvas.addEventListener("wheel", L.onWheel, { passive: false });
    canvas.addEventListener("auxclick", L.onAux);
    canvas.addEventListener("contextmenu", L.onCtx);
    canvas.addEventListener("touchstart", L.onTStart);
    canvas.addEventListener("touchmove", L.onTMove);
    window.addEventListener("touchend", L.onTEnd);

    const FRAME = 1 / 30;
    const animate = () => {
      if (state.disposed) return;
      state.rafId = requestAnimationFrame(animate);
      state.frameAcc += Math.min(state.clock.getDelta(), 0.05);
      if (state.frameAcc < FRAME) return;
      state.frameAcc = 0;
      this._resizeStage(state);
      this._pumpThumbs(state);
      // The creature NEVER animates here. It is posed once when it is built and
      // then stands perfectly still: a sculptor aims at limbs, and a rig that
      // breathes or swings an attack drags every part out from under the cursor
      // mid-drag and makes the whole thing a guess.
      if (state.selHelper) state.selHelper.update();
      if (state.hoverHelper) state.hoverHelper.update();
      this._updateGizmoTransform(state);
      if (window.PSXShader) window.PSXShader.render(renderer, scene, camera);
      else renderer.render(scene, camera);
    };
    animate();
  };

  Scene_CC3DModel.prototype._resizeStage = function (state) {
    const canvas = state.canvas;
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    if (w === state.size.w && h === state.size.h) return;
    state.size = { w: w, h: h };
    state.renderer.setSize(w, h, false);
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
  };

  //---------------------------------------------------------------------------
  // The handles drawn on the creature
  //---------------------------------------------------------------------------

  // Three sets sharing one group: arrows to slide the part along an axis, rings
  // to turn it, a box to resize it. Drawn on top of everything (depthTest off)
  // and rescaled every frame so they keep a constant size on screen however far
  // the camera has been pulled back.
  Scene_CC3DModel.prototype._createGizmo = function (state) {
    const flat = (color) => new THREE.MeshBasicMaterial({
      color: color, depthTest: false, depthWrite: false, transparent: true
    });
    const matX = flat(0xf87171), matY = flat(0x4ade80), matZ = flat(0x60a5fa), matC = flat(0xfacc15);
    const group = new THREE.Group();
    group.visible = false;
    group.renderOrder = 999;

    const shaft = new THREE.CylinderGeometry(0.014, 0.014, 1, 8);
    const tip = new THREE.ConeGeometry(0.07, 0.22, 10);
    const move = new THREE.Group(); move.name = "move";
    const arrow = (material, axis, rotation) => {
      const arm = new THREE.Group();
      const stick = new THREE.Mesh(shaft, material); stick.position.y = 0.5;
      const point = new THREE.Mesh(tip, material); point.position.y = 1.05;
      arm.add(stick, point);
      if (rotation) arm.rotation.set(rotation[0], rotation[1], rotation[2]);
      arm.userData.axis = axis;
      return arm;
    };
    move.add(arrow(matX, "x", [0, 0, -Math.PI / 2]));
    move.add(arrow(matY, "y", null));
    move.add(arrow(matZ, "z", [Math.PI / 2, 0, 0]));
    group.add(move);

    const ring = new THREE.TorusGeometry(0.85, 0.02, 8, 40);
    const turn = new THREE.Group(); turn.name = "turn"; turn.visible = false;
    const rx = new THREE.Mesh(ring, matX); rx.rotation.y = Math.PI / 2; rx.userData.axis = "rx";
    const ry = new THREE.Mesh(ring, matY); ry.rotation.x = Math.PI / 2; ry.userData.axis = "ry";
    const rz = new THREE.Mesh(ring, matZ); rz.userData.axis = "rz";
    turn.add(rx, ry, rz);
    group.add(turn);

    const size = new THREE.Group(); size.name = "size"; size.visible = false;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), matC);
    box.userData.axis = "s";
    size.add(box);
    group.add(size);

    state.gizmo = group;
    state.scene.add(group);
  };

  Scene_CC3DModel.prototype._updateGizmo = function () {
    const state = this._view3D;
    if (!state || !state.gizmo) return;
    state.gizmo.visible = !!this._movable(this._selected);
    HANDLES.forEach((name) => {
      const set = state.gizmo.getObjectByName(name);
      if (set) set.visible = (name === this._handle);
    });
  };

  Scene_CC3DModel.prototype._updateGizmoTransform = function (state) {
    if (!state.gizmo || !state.gizmo.visible) return;
    const part = this._movable(this._selected);
    if (!part) { state.gizmo.visible = false; return; }
    const position = new THREE.Vector3();
    part.getWorldPosition(position);
    state.gizmo.position.copy(position);
    const rotation = new THREE.Quaternion();
    part.getWorldQuaternion(rotation);
    state.gizmo.quaternion.copy(rotation);
    state.gizmo.scale.setScalar(Math.max(0.15, state.camera.position.distanceTo(position) * 0.13));
  };

  //---------------------------------------------------------------------------
  // Pointing at the creature
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype._setPointer = function (e) {
    const state = this._view3D;
    const rect = state.canvas.getBoundingClientRect();
    state.pointer.set(
      ((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1,
      -((e.clientY - rect.top) / (rect.height || 1)) * 2 + 1
    );
    state.ray.setFromCamera(state.pointer, state.camera);
  };

  // Which slot is under the cursor: the deepest tagged ancestor of whatever
  // mesh the ray hit, so a head grafted inside a torso reads as the head. A
  // fixed slot answers as background, because it is not a part to be worked on.
  Scene_CC3DModel.prototype._slotAtPointer = function (e) {
    const state = this._view3D;
    if (!state || !state.holder) return null;
    const rect = state.canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) return null;
    this._setPointer(e);
    const hits = state.ray.intersectObject(state.holder, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        const slot = node.userData && node.userData.ccSlot;
        if (slot) return FIXED_SLOTS[slot] ? null : slot;
        if (node === state.holder) break;
        node = node.parent;
      }
    }
    return null;
  };

  Scene_CC3DModel.prototype._onStageDown = function (e) {
    const state = this._view3D;
    if (!state || this._modal) return;
    if (e.button === 1) {
      state.mode = "pan"; state.prev = { x: e.clientX, y: e.clientY };
      this._eatCancel = 3;
      e.preventDefault(); return;
    }
    if (e.button === 2) {
      state.mode = "orbit"; state.prev = { x: e.clientX, y: e.clientY };
      this._eatCancel = 3;
      e.preventDefault(); return;
    }
    if (e.button !== 0) return;
    state.prev = { x: e.clientX, y: e.clientY };
    this._sculptTouched = false;
    this._setPointer(e);

    // 1. A handle drawn on the creature wins over anything behind it.
    if (state.gizmo && state.gizmo.visible) {
      const hits = state.ray.intersectObject(state.gizmo, true);
      if (hits.length) {
        let node = hits[0].object;
        while (node && !(node.userData && node.userData.axis) && node !== state.gizmo) node = node.parent;
        if (node && node.userData && node.userData.axis) {
          state.mode = "gizmo";
          state.gizmoAxis = node.userData.axis;
          state.dragStart = {
            xf: Object.assign(defaultXf(), this._config.partXf[this._selected]),
            point: this._planePointAt(state, e, true)
          };
          return;
        }
      }
    }

    // 2. A part of the creature: take hold of it.
    const slot = this._slotAtPointer(e);
    if (slot) {
      this.selectSlot(slot);
      const part = this._movable(slot);
      if (part) {
        state.mode = "part";
        // The armed handle decides what dragging the part does, so turning and
        // resizing are had by grabbing it, exactly like moving it, rather than
        // by catching a thin ring.
        state.partHandle = this._handle;
        if (state.partHandle === "move" && part.parent) {
          const world = new THREE.Vector3();
          part.getWorldPosition(world);
          state.plane.setFromNormalAndCoplanarPoint(
            state.camera.getWorldDirection(new THREE.Vector3()).negate(), world);
          const hit = new THREE.Vector3();
          state.ray.ray.intersectPlane(state.plane, hit);
          state.grabLocal.copy(part.parent.worldToLocal(hit.clone())).sub(part.position);
        }
        state.canvas.classList.add("cc-grabbing");
        return;
      }
      state.mode = "none";
      return;
    }

    // 3. Empty space: turn the creature round.
    state.mode = "orbit";
    state.canvas.classList.add("cc-grabbing");
  };

  // A point on the plane facing the camera through the selected part.
  Scene_CC3DModel.prototype._planePointAt = function (state, e, reset) {
    const part = this._movable(this._selected);
    if (!part) return new THREE.Vector3();
    if (reset) {
      const world = new THREE.Vector3();
      part.getWorldPosition(world);
      state.plane.setFromNormalAndCoplanarPoint(
        state.camera.getWorldDirection(new THREE.Vector3()).negate(), world);
    }
    this._setPointer(e);
    const point = new THREE.Vector3();
    state.ray.ray.intersectPlane(state.plane, point);
    return point;
  };

  Scene_CC3DModel.prototype._onStageMove = function (e) {
    const state = this._view3D;
    if (!state) return;
    if (state.mode === "none") { this._hoverModel(e); return; }
    this._hideTip();
    const dx = e.clientX - state.prev.x, dy = e.clientY - state.prev.y;
    if (state.mode === "orbit") {
      state.pivot.rotation.y += dx * 0.012;
      state.pivot.rotation.x += dy * 0.012;
    } else if (state.mode === "pan") {
      const speed = 0.0035 * state.camera.position.z;
      state.camera.position.x -= dx * speed;
      state.camera.position.y += dy * speed;
    } else if (state.mode === "part") {
      this._dragPart(state, e, dx, dy);
    } else if (state.mode === "gizmo" && state.dragStart) {
      this._dragGizmo(state, e);
    }
    state.prev = { x: e.clientX, y: e.clientY };
  };

  // Dragging the part itself, under whichever handle is armed: slide it along
  // the plane facing the camera, turn it (sideways yaws, up and down pitches),
  // or resize it (up grows, down shrinks).
  Scene_CC3DModel.prototype._dragPart = function (state, e, dx, dy) {
    const slot = this._selected;
    const part = this._movable(slot);
    if (!part) return;
    if (!this._sculptTouched) { this._sculptTouched = true; this.pushHistory(); }
    const xf = Object.assign(defaultXf(), this._config.partXf[slot]);
    const handle = state.partHandle || "move";
    if (handle === "move") {
      if (!part.parent) return;
      this._setPointer(e);
      const hit = new THREE.Vector3();
      if (!state.ray.ray.intersectPlane(state.plane, hit)) return;
      const local = part.parent.worldToLocal(hit).sub(state.grabLocal);
      xf.x = local.x; xf.y = local.y; xf.z = local.z;
    } else if (handle === "turn") {
      xf.ry += dx * 0.012;
      xf.rx += dy * 0.012;
    } else {
      xf.s = xf.s * (1 - dy * 0.01);
    }
    this.applyPartTransform(slot, xf);
    this._refreshXfSliders();
  };

  Scene_CC3DModel.prototype._dragGizmo = function (state, e) {
    if (!this._sculptTouched) { this._sculptTouched = true; this.pushHistory(); }
    const axis = state.gizmoAxis;
    const start = state.dragStart;
    const xf = Object.assign(defaultXf(), start.xf);
    if (axis === "x" || axis === "y" || axis === "z") {
      const part = this._movable(this._selected);
      if (!part || !part.parent) return;
      const now = this._planePointAt(state, e, false);
      const from = part.parent.worldToLocal(start.point.clone());
      const to = part.parent.worldToLocal(now.clone());
      xf[axis] = start.xf[axis] + (to[axis] - from[axis]);
    } else if (axis === "rx" || axis === "ry" || axis === "rz") {
      const delta = (axis === "ry" ? (e.clientX - state.prev.x) : (e.clientY - state.prev.y)) * 0.012;
      xf[axis] = (this._config.partXf[this._selected] || defaultXf())[axis] + delta;
      start.xf = Object.assign(defaultXf(), xf);   // a turn accumulates
    } else if (axis === "s") {
      xf.s = (this._config.partXf[this._selected] || defaultXf()).s *
        (1 + (state.prev.y - e.clientY) * 0.01);
      start.xf = Object.assign(defaultXf(), xf);
    }
    this.applyPartTransform(this._selected, xf);
    this._refreshXfSliders();
  };

  Scene_CC3DModel.prototype._onStageUp = function () {
    const state = this._view3D;
    if (!state) return;
    state.mode = "none";
    state.partHandle = null;
    state.gizmoAxis = null;
    state.dragStart = null;
    state.canvas.classList.remove("cc-grabbing");
  };

  // Nothing on the creature looks clickable until it lights up under the
  // pointer, so a part names itself and outlines itself on the way past.
  // Throttled: a raycast through a whole creature on every mouse move is more
  // work than the answer is worth.
  Scene_CC3DModel.prototype._hoverModel = function (e) {
    if (this._hoverAt === Graphics.frameCount) return;
    this._hoverAt = Graphics.frameCount;
    const slot = this._slotAtPointer(e);
    if (slot !== this._hoverSlot) {
      this._hoverSlot = slot;
      this._setHoverSlot(slot);
    }
    if (!slot) { this._hideTip(); return; }
    const worn = this._config.parts[slot];
    this._showTip(e, slotLabel(slot) + (worn === "default" ? "" : " · " + displayName(worn)));
  };

  Scene_CC3DModel.prototype._showTip = function (e, text) {
    const tip = document.getElementById("cc3d-tip");
    if (!tip) return;
    tip.textContent = text;
    window.CCPanel.show(tip);
    window.CCPanel.placeAt(tip, e.clientX + 14, e.clientY + 16);
  };

  Scene_CC3DModel.prototype._hideTip = function () {
    const tip = document.getElementById("cc3d-tip");
    if (tip) window.CCPanel.hide(tip);
  };

  //---------------------------------------------------------------------------
  // What is selected, and what is merely under the pointer
  //---------------------------------------------------------------------------

  // Clicking a part on the creature opens its group in the drawer, so the two
  // always show the same thing.
  Scene_CC3DModel.prototype.selectSlot = function (slot) {
    if (!slot || this._slots().indexOf(slot) < 0) return;
    this._selected = slot;
    if (this._group !== slot) {
      const group = this._groups().find((g) => g.id === slot);
      if (group) { this._openGroup(group); this._renderParts(); }
    }
    this._renderHandles();
    this._afterRender();
    this._refreshSelection();
  };

  Scene_CC3DModel.prototype._refreshSelection = function () {
    const state = this._view3D;
    if (!state) return;
    const target = this._movable(this._selected);
    if (state.selHelper && state.selTarget === target) { this._updateGizmo(); return; }
    if (state.selHelper) { state.scene.remove(state.selHelper); state.selHelper = null; }
    state.selTarget = target;
    if (target) {
      const helper = new THREE.BoxHelper(target, 0xffd700);
      helper.renderOrder = 998;
      if (helper.material) { helper.material.depthTest = false; helper.material.transparent = true; }
      state.scene.add(helper);
      state.selHelper = helper;
    }
    this._updateGizmo();
  };

  Scene_CC3DModel.prototype._setHoverSlot = function (slot) {
    const state = this._view3D;
    if (!state) return;
    if (state.hoverHelper) { state.scene.remove(state.hoverHelper); state.hoverHelper = null; }
    const target = (slot && slot !== this._selected) ? this._movable(slot) : null;
    if (!target) return;
    const helper = new THREE.BoxHelper(target, 0x7fd4ff);
    helper.renderOrder = 997;
    if (helper.material) { helper.material.depthTest = false; helper.material.transparent = true; }
    state.scene.add(helper);
    state.hoverHelper = helper;
  };

  //---------------------------------------------------------------------------
  // Part pictures
  //---------------------------------------------------------------------------

  // A little studio of its own for the part pictures, with its own renderer on
  // its own tiny offscreen canvas.
  //
  // Sharing the creature's renderer and lifting the pixels out of its drawing
  // buffer is a trick that depends on nothing having composited the frame yet,
  // and when it misses there is no picture at all -- which is exactly what a
  // shelf of empty black squares looks like. `preserveDrawingBuffer` makes the
  // grab unconditional, so a picture either exists or the build failed, with no
  // third state. It is ONE extra context, opened once and released on the way
  // out; the cap the browser force-loses the oldest context at is far above
  // three.
  Scene_CC3DModel.prototype._createThumbStage = function () {
    this._thumbScene = new THREE.Scene();
    this._thumbScene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xfff2d0, 0.85);
    key.position.set(2, 3, 4);
    this._thumbScene.add(key);
    // A rim from behind, so a dark part still reads against a dark card.
    const rim = new THREE.DirectionalLight(0xbcd4ff, 0.45);
    rim.position.set(-2, 1, -3);
    this._thumbScene.add(rim);
    this._thumbStage = new THREE.Group();
    this._thumbScene.add(this._thumbStage);
    this._thumbCam = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    this._thumbCanvas = document.createElement("canvas");
    this._thumbCanvas.width = THUMB_SIZE;
    this._thumbCanvas.height = THUMB_SIZE;
    try {
      this._thumbRenderer = new THREE.WebGLRenderer({
        canvas: this._thumbCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true
      });
      if (this._thumbRenderer && (!this._thumbRenderer.getContext || !this._thumbRenderer.getContext())) {
        try { this._thumbRenderer.dispose(); } catch (e) {}
        this._thumbRenderer = null;
      } else if (this._thumbRenderer) {
        this._thumbRenderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
        this._thumbRenderer.setPixelRatio(1);
      }
    } catch (e) {
      // No context to spare: the shelf still reads as names.
      this._thumbRenderer = null;
    }
  };

  // Only what is on screen is ever built: the roster runs to hundreds of parts
  // and each picture costs a whole donor model, so they are asked for as their
  // card scrolls into view and dealt one per frame.
  Scene_CC3DModel.prototype._watchThumbs = function () {
    const shelf = document.getElementById("cc3d-shelf");
    if (!shelf || typeof IntersectionObserver === "undefined") return;
    if (this._thumbWatcher) this._thumbWatcher.disconnect();
    else {
      this._thumbWatcher = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          this._thumbWatcher.unobserve(entry.target);
          const value = entry.target.getAttribute("data-part");
          if (value && value !== "default") this.requestThumb(value);
        });
      }, { root: document.getElementById("cc3d-parts-body"), rootMargin: "200px" });
    }
    shelf.querySelectorAll(".cc3d-card[data-part]").forEach((el) => {
      const img = el.querySelector("img[data-thumb]");
      if (img && !img.getAttribute("src")) this._thumbWatcher.observe(el);
    });
  };

  Scene_CC3DModel.prototype.requestThumb = function (value) {
    const key = thumbKey(this._slot, value, this._config);
    if (THUMB_CACHE.has(key)) { this._paintThumb(key); return; }
    if (this._thumbAsked[key]) return;
    this._thumbAsked[key] = true;
    this._thumbQueue.push({ key: key, slot: this._slot, value: value });
  };

  Scene_CC3DModel.prototype._paintThumb = function (key) {
    const url = THUMB_CACHE.get(key);
    if (!url || !this._root) return;
    this._root.querySelectorAll('img[data-thumb="' + key + '"]').forEach((img) => {
      img.src = url;
      img.classList.add("cc-visible");
    });
  };

  // One picture per frame: build it, then draw and grab it on the NEXT frame,
  // so a single frame never carries both a model build and a render.
  Scene_CC3DModel.prototype._pumpThumbs = function (state) {
    if (this._thumbReady) {
      const job = this._thumbReady;
      this._thumbReady = null;
      this._drawThumb(job);
      return;
    }
    if (this._thumbBusy || !this._thumbQueue.length || !this._thumbRenderer) return;
    const job = this._thumbQueue.shift();
    this._thumbBusy = true;
    buildSlotGraft(job.slot, job.value, this._config).then((object) => {
      this._thumbBusy = false;
      if (!object) return;
      if (!this._view3D || this._view3D.disposed) { disposeObject3D(object); return; }
      job.object = object;
      this._thumbReady = job;
    }).catch(() => { this._thumbBusy = false; });
  };

  Scene_CC3DModel.prototype._drawThumb = function (job) {
    const object = job.object;
    if (!object) return;
    if (!this._thumbRenderer) { disposeObject3D(object); return; }
    try {
      this._thumbStage.add(object);
      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z);
      // A part with no extent at all would frame to nothing and photograph as
      // an empty square, which is worse than no picture.
      if (!(maxDim > 0)) throw new Error("empty part");
      object.position.sub(center);
      // Three-quarter view, the way a part reads best: enough of the front to
      // recognise it, enough of the side to see its shape.
      const dist = (maxDim / (2 * Math.tan((40 * Math.PI / 180) / 2))) * 1.45;
      this._thumbCam.position.set(dist * 0.5, dist * 0.3, dist * 0.85);
      this._thumbCam.lookAt(0, 0, 0);
      this._thumbRenderer.render(this._thumbScene, this._thumbCam);
      cacheThumb(job.key, this._thumbCanvas.toDataURL("image/png"));
      this._paintThumb(job.key);
    } catch (e) {
      // A picture is a convenience; the shelf still reads as names without it.
    }
    this._thumbStage.remove(object);
    disposeObject3D(object);
  };

  //---------------------------------------------------------------------------
  // Building the creature
  //---------------------------------------------------------------------------

  Scene_CC3DModel.prototype.scheduleRebuild = function () {
    if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
    this._rebuildTimer = setTimeout(() => { this._rebuildTimer = null; this.rebuildModel(); }, 200);
  };

  Scene_CC3DModel.prototype.rebuildModel = function () {
    const state = this._view3D;
    if (!state) return;
    const buildId = ++this._buildCounter;
    buildModel(this._shownConfig(), this._actorId).then((battler) => {
      if (!battler || !battler.model) return;
      if (state.disposed || buildId !== this._buildCounter) {
        if (battler.model) disposeObject3D(battler.model);
        return;
      }
      if (state.selHelper) { state.scene.remove(state.selHelper); state.selHelper = null; }
      if (state.hoverHelper) { state.scene.remove(state.hoverHelper); state.hoverHelper = null; }
      state.selTarget = null;
      this._hoverSlot = null;
      if (state.holder) {
        disposeObject3D(state.holder);
        state.pivot.remove(state.holder);
        state.holder = null; state.model = null;
      }
      // buildModel has already posed it exactly once and seated the bare limbs
      // on top of that pose; posing again here would shove them back.
      const box = new THREE.Box3().setFromObject(battler.model);
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      const holder = new THREE.Group();
      holder.position.copy(center).multiplyScalar(-1);
      holder.add(battler.model);
      if (window.PSXShader) window.PSXShader.applyToObject(battler.model);
      state.pivot.add(holder);
      state.holder = holder; state.model = battler;
      this._grafts = battler._ccGrafts || {};
      this._anchors = battler._ccAnchors || {};
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fit = maxDim / (2 * Math.tan((40 * Math.PI / 180) / 2));
      state.camera.position.set(0, 0, fit * 1.35);
      state.camera.lookAt(0, 0, 0);
      if (this._selected && !this._movable(this._selected)) this._selected = null;
      this._refreshSelection();
      // The body list and the sizer follow the model; the SHELF does not. What
      // a slot may be given is the same before and after a rebuild, so redrawing
      // it here only threw away every picture on it.
      this._renderBody();
      this._renderHandles();
      this._afterRender();
    }).catch(() => {});
  };

  Scene_CC3DModel.prototype._teardownStage = function () {
    if (this._root && this._onDown) this._root.removeEventListener("mousedown", this._onDown);
    if (this._onMove) window.removeEventListener("mousemove", this._onMove);
    if (this._onUp) window.removeEventListener("mouseup", this._onUp);
    if (this._onKey) window.removeEventListener("keydown", this._onKey);
    const state = this._view3D;
    if (!state) return;
    state.disposed = true;
    cancelAnimationFrame(state.rafId);
    const L = state.listeners || {}, canvas = state.canvas;
    if (canvas) {
      canvas.removeEventListener("mousedown", L.onDown);
      canvas.removeEventListener("mouseleave", L.onLeave);
      canvas.removeEventListener("wheel", L.onWheel);
      canvas.removeEventListener("auxclick", L.onAux);
      canvas.removeEventListener("contextmenu", L.onCtx);
      canvas.removeEventListener("touchstart", L.onTStart);
      canvas.removeEventListener("touchmove", L.onTMove);
    }
    window.removeEventListener("mousemove", L.onMove);
    window.removeEventListener("mouseup", L.onUp);
    window.removeEventListener("touchend", L.onTEnd);
    if (state.holder) disposeObject3D(state.holder);
    if (state.gizmo) disposeObject3D(state.gizmo);
    if (this._thumbRenderer) {
      try { this._thumbRenderer.dispose(); } catch (e) { /* already lost */ }
      try {
        if (this._thumbRenderer.forceContextLoss) this._thumbRenderer.forceContextLoss();
      } catch (e) {}
      this._thumbRenderer = null;
    }
    // dispose() leaves the WebGL context alive. The browser caps live contexts
    // and force-loses the OLDEST past the cap, which is the game's own canvas:
    // PIXI then silently stops rendering and the picture freezes until the game
    // is restarted. Release it, then swap in a clean canvas node, since the
    // element a context was lost on can never host a new one.
    try { state.renderer.dispose(); } catch (e) { /* already lost */ }
    try { if (state.renderer.forceContextLoss) state.renderer.forceContextLoss(); } catch (e) {}
    if (canvas && canvas.parentNode) canvas.parentNode.replaceChild(canvas.cloneNode(false), canvas);
    this._view3D = null;
  };

  window.Scene_CC3DModel = Scene_CC3DModel;
})();
