//=============================================================================
// 3D Battler System - Folk Uniques (config-driven humanoids)
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke humanoid one-off models (bandits, cultists, mages,
 * fighters, elves, ogres, knights, lizardfolk, gnomes, etc.) built from compact
 * per-enemy configs + name-based assignment. Requires 3DBattlerSystem + families.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Folk Uniques
 * ============================================================================
 *
 * One flexible humanoid body plan (torso/head/2 arms/2 legs + headgear + weapons)
 * driven by a per-enemy CONFIG, so each named enemy gets a distinct silhouette
 * while sharing the Humanoid archetype body-part keys (HEAD/TORSO + arm/leg keys)
 * so dismemberment + hit-flash work. Pinned by exact name.
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Folk] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    // ── Rig constants (limbs hinge at the elbow/knee) ───────────────────────
    const ELBOW_Y = -0.42;          // joint height in the shoulder/hip group
    const GRIP_Y = -0.38;           // hand height inside the forearm group
    const SLASH_PERIOD = 0.65;      // seconds per swing (= the core's one-shot
                                    // 'attack' duration, so one press = one cut)
    // Weapon pitch, in the forearm frame, that puts the shaft out PAST the fist
    // along the swing instead of running back up the arm.
    const WEAPON_OUT = 2.75;

    // Head types that get rolled into procedural hair (see _rollHair). Anything
    // else -- hood, wizardhat, tophat, crown, conehat, hornhelm, horns -- is a
    // deliberate silhouette and is left alone.
    const HAIR_HEADS = ['helmet', 'hair', 'none', 'mohawk'];
    // Texture pools that never grow hair.
    const BALD_TEX = ['bone', 'stone', 'metal'];
    const HEAD_R = 0.26;            // hair is fitted to the Folk skull sphere

    // ── Per-enemy configs (data; the base reads these) ──────────────────────
    // Fields (all optional except name): scale, skin, outfit (torso colour),
    // pants, head (hood|helmet|hat|wizardhat|crown|hornhelm|hair|tophat|none),
    // headColor, wpnR/wpnL (sword|dagger|axe|mace|staff|bow|crossbow|lute|
    // pickaxe|club|fists), accent, tex (texturePool), robe (bool), snout, beard,
    // ears (cat|elf), tail, twoHead, glow.
    const CONFIGS = {
        // ── Misc humanoid-variant archetypes ──
        orccaptain:        { name: 'Orc Captain',        scale: 2.3, skin: 0x6a8a4a, outfit: 0x4a3a28, head: 'hornhelm', headColor: 0x6a7079, wpnR: 'axe', tex: 'green', eyeColor: 0xcc3322 },
        bloodaxeraider:    { name: 'Bloodaxe Raider',    scale: 2.5, skin: 0x6a8a4a, outfit: 0x5a3a2a, head: 'hornhelm', headColor: 0x8a8a8a, wpnR: 'axe', wpnL: 'axe', tex: 'green', eyeColor: 0xff2200, beard: 0x2a1a10 },
        reanimatedguard:   { name: 'Reanimated Guard',   scale: 2.2, skin: 0x8a9a7a, outfit: 0x6a7079, head: 'helmet', headColor: 0x7a8088, wpnR: 'spear', tex: 'metal', eyeColor: 0x66ff88 },
        touristskeleton:   { name: 'Tourist Skeleton',   scale: 2.0, skin: 0xe0dcc8, outfit: 0xdd5544, head: 'tophat', headColor: 0x2a2a2a, wpnR: 'camera', tex: 'bone', eyeColor: 0x111111, bony: true },
        elvenbladesinger:  { name: 'Elven Bladesinger',  scale: 2.2, skin: 0xe8d8c0, outfit: 0x3a6a5a, head: 'hair', headColor: 0xe8e0a0, wpnR: 'sword', robe: true, tex: 'pale', ears: 'elf', accent: 0x66ffcc },
        elvenflameweaver:  { name: 'Elven Flame Weaver',  scale: 2.2, skin: 0xe8d8c0, outfit: 0x8a3a2a, head: 'hair', headColor: 0xcc4422, wpnR: 'staff', robe: true, tex: 'fire', ears: 'elf', accent: 0xff6622 },
        bihuman:           { name: 'Bi Human',           scale: 2.2, skin: 0xc8a888, outfit: 0x4a5a6a, head: 'hair', headColor: 0x3a2a1a, twoHead: true, tex: 'flesh' },
        doublesinger:      { name: 'Double Singer',      scale: 2.2, skin: 0xc8a888, outfit: 0x7a4a8a, head: 'hair', headColor: 0x2a1a10, twoHead: true, wpnR: 'lute', tex: 'flesh', accent: 0xffcc44 },
        cavegnome:         { name: 'Cave Gnome',         scale: 1.7, skin: 0xc8a070, outfit: 0x6a5238, head: 'conehat', headColor: 0xcc2222, wpnR: 'pickaxe', tex: 'wood', beard: 0xddddcc, accent: 0xffcc44 },
        bonesentinel:      { name: 'Bone Sentinel',      scale: 2.3, skin: 0xd8d0bc, outfit: 0x4a4a52, head: 'helmet', headColor: 0x5a5a62, wpnR: 'halberd', tex: 'bone', eyeColor: 0x88ddff, bony: true },
        stoneshifter:      { name: 'Stone Shifter',      scale: 1.9, skin: 0x7a7068, outfit: 0x5a544a, head: 'none', wpnR: 'fists', tex: 'stone', eyeColor: 0x88aa66, rocky: true },
        banditarcher_rep:  { name: 'Bandit Archer',      scale: 2.1, skin: 0x6a8a5a, outfit: 0x4a3a2a, head: 'hood', headColor: 0x3a2a1a, wpnR: 'bow', tex: 'green', snout: true, tail: true, eyeColor: 0xffcc33 },
        banditbard_rep:    { name: 'Bandit Bard',        scale: 2.1, skin: 0x6a8a5a, outfit: 0x6a4a7a, head: 'hat', headColor: 0x5a3a6a, wpnR: 'lute', tex: 'green', snout: true, tail: true, eyeColor: 0xffcc33, accent: 0xffcc44 },

        // ── Bandits / cultists / casters / fighters (humanoid) ──
        abandonednovice:   { name: 'Abandoned Novice',   scale: 2.0, skin: 0xb8c0c8, outfit: 0x4a5a7a, head: 'hood', headColor: 0x3a4a6a, wpnR: 'staff', robe: true, tex: 'pale', glow: true, accent: 0x88aaff },
        apprenticepyro:    { name: 'Apprentice Pyromancer', scale: 2.0, skin: 0xc8a888, outfit: 0x9a3a2a, head: 'wizardhat', headColor: 0x7a2a1a, wpnR: 'staff', robe: true, tex: 'fire', accent: 0xff6622 },
        bloodinitiate:     { name: 'Blood Initiate',     scale: 2.0, skin: 0xc8a888, outfit: 0x7a1a1a, head: 'hood', headColor: 0x5a1010, wpnR: 'dagger', robe: true, tex: 'flesh', accent: 0xcc2233 },
        cultistacolyte:    { name: 'Cultist Acolyte',    scale: 2.1, skin: 0xc0a890, outfit: 0x3a2a4a, head: 'hood', headColor: 0x2a1a3a, wpnR: 'dagger', robe: true, tex: 'void', accent: 0x9933cc },
        forestpoacher:     { name: 'Forest Poacher',     scale: 2.1, skin: 0xc8a070, outfit: 0x4a5a2a, head: 'hood', headColor: 0x3a4a1a, wpnR: 'bow', tex: 'foliage', beard: 0x4a3a20 },
        glittergoblin:     { name: 'Glitter Goblin',     scale: 1.8, skin: 0x9ac86a, outfit: 0xcc66cc, head: 'none', wpnR: 'dagger', tex: 'crystal', eyeColor: 0xffee44, glow: true, accent: 0xffaaff },
        marshskulk:        { name: 'Marsh Skulk',        scale: 2.0, skin: 0x6a7a4a, outfit: 0x3a4a2a, head: 'none', wpnR: 'dagger', tex: 'green', eyeColor: 0xaacc44, hunch: true },
        mineslave:         { name: 'Mine Slave',         scale: 2.0, skin: 0xa89070, outfit: 0x4a4038, head: 'none', wpnR: 'pickaxe', tex: 'stone', beard: 0x3a2a1a, hunch: true },
        noviceboxer:       { name: 'Novice Boxer',       scale: 2.1, skin: 0xc8a888, outfit: 0x3a5a8a, head: 'none', wpnR: 'gloves', wpnL: 'gloves', tex: 'flesh', eyeColor: 0x222222 },
        pitfighter:        { name: 'Pit Fighter',        scale: 2.2, skin: 0xb89878, outfit: 0x5a3a2a, head: 'none', wpnR: 'fists', tex: 'flesh', eyeColor: 0x222222, bare: true },
        plaguecarrier:     { name: 'Plague Carrier',     scale: 2.1, skin: 0x8a9a6a, outfit: 0x5a5040, head: 'none', wpnR: 'fists', tex: 'flesh', eyeColor: 0xaacc44, zombie: true },
        pregnantseahorse:  { name: 'Pregnant Seahorse',  scale: 2.0, skin: 0xa89880, outfit: 0x4a4438, head: 'hood', headColor: 0x3a342a, wpnR: 'dagger', tex: 'pale', hunch: true },
        skybard:           { name: 'Sky Bard',           scale: 2.1, skin: 0xc8a888, outfit: 0x3a6a8a, head: 'hat', headColor: 0x2a4a6a, wpnR: 'lute', tex: 'pale', accent: 0x66ccff },
        snowwerewolf:      { name: 'Snow Werewolf',      scale: 2.4, skin: 0xe0e4ea, outfit: 0xc8ccd2, head: 'none', wpnR: 'claws', tex: 'fur', snout: true, ears: 'cat', tail: true, eyeColor: 0x66ccff, beast: true },
        swampwitchnovice:  { name: 'Swamp Witch Novice', scale: 2.0, skin: 0x9aa888, outfit: 0x3a4a3a, head: 'wizardhat', headColor: 0x2a3a2a, wpnR: 'staff', robe: true, tex: 'green', accent: 0x66cc66 },
        toothratkin:       { name: 'Tooth Ratkin',       scale: 1.8, skin: 0xc0b8a8, outfit: 0x5a4a3a, head: 'none', wpnR: 'dagger', tex: 'pale', snout: true, ears: 'cat', tail: true, eyeColor: 0xcc3322 },
        youngogre:         { name: 'Young Ogre',         scale: 2.3, skin: 0x9aac7a, outfit: 0x5a4a30, head: 'none', wpnR: 'club', tex: 'green', eyeColor: 0xcc6622 },
        amateurpugilist:   { name: 'Amateur Pugilist',   scale: 2.1, skin: 0xb89878, outfit: 0x6a3a3a, head: 'none', wpnR: 'gloves', wpnL: 'gloves', tex: 'flesh' },
        banditassassin:    { name: 'Bandit Assassin',    scale: 2.1, skin: 0xb8a890, outfit: 0x2a2a30, head: 'hood', headColor: 0x1a1a20, wpnR: 'dagger', wpnL: 'dagger', tex: 'void', eyeColor: 0x88ff66, accent: 0x66ff66 },
        banditchief:       { name: 'Bandit Chief',       scale: 2.3, skin: 0xc8a070, outfit: 0x5a2a2a, head: 'helmet', headColor: 0x6a6a52, wpnR: 'sword', tex: 'metal', beard: 0x3a2a1a },
        banditcleric:      { name: 'Bandit Cleric',      scale: 2.1, skin: 0xc8a888, outfit: 0x6a6048, head: 'hood', headColor: 0x5a5038, wpnR: 'mace', robe: true, tex: 'pale', accent: 0xffe080 },
        banditcrossbowman: { name: 'Bandit Crossbowman', scale: 2.1, skin: 0xc0a070, outfit: 0x4a3a2a, head: 'helmet', headColor: 0x5a5040, wpnR: 'crossbow', tex: 'metal' },
        banditgrunt:       { name: 'Bandit Grunt',       scale: 2.2, skin: 0xc8a070, outfit: 0x4a3a2a, head: 'none', wpnR: 'sword', tex: 'flesh', beard: 0x3a2a1a },
        banditmage:        { name: 'Bandit Mage',        scale: 2.1, skin: 0xc8a888, outfit: 0x3a3a6a, head: 'wizardhat', headColor: 0x2a2a5a, wpnR: 'staff', robe: true, tex: 'void', accent: 0x6688ff },
        banditpyromancer:  { name: 'Bandit Pyromancer',  scale: 2.1, skin: 0xc8a070, outfit: 0x8a2a1a, head: 'wizardhat', headColor: 0x6a1a10, wpnR: 'staff', robe: true, tex: 'fire', accent: 0xff5522 },
        banditrogue:       { name: 'Bandit Rogue',       scale: 2.1, skin: 0xc0a080, outfit: 0x3a3028, head: 'hood', headColor: 0x2a2018, wpnR: 'dagger', tex: 'flesh', eyeColor: 0x333333 },
        banditscout:       { name: 'Bandit Scout',       scale: 2.1, skin: 0xc0a070, outfit: 0x3a4a2a, head: 'hood', headColor: 0x2a3a1a, wpnR: 'bow', tex: 'foliage' },
        chicchanshaman:    { name: 'Chicchan Serpent Shaman', scale: 2.2, skin: 0x5a8a6a, outfit: 0x3a6a4a, head: 'crown', headColor: 0xd4af37, wpnR: 'staff', robe: true, tex: 'green', snout: true, accent: 0x66ffaa, feathers: true },

        // ── Undead (corpses / skeletons) ──
        apprenticesremains: { name: "Apprentice's Remains", scale: 2.0, skin: 0xd8d0bc, outfit: 0x4a4a6a, head: 'hood', headColor: 0x3a3a5a, wpnR: 'staff', robe: true, tex: 'bone', eyeColor: 0x88ddff, bony: true },
        armoredremains:     { name: 'Armored Remains',     scale: 2.1, skin: 0xd8d0bc, outfit: 0x6a6a72, head: 'helmet', headColor: 0x6a6a72, wpnR: 'sword', tex: 'metal', eyeColor: 0x88ddff, bony: true },
        boneyardhunter:     { name: 'Boneyard Hunter',     scale: 2.0, skin: 0xcfc6a8, outfit: 0x4a4038, head: 'none', wpnR: 'claws', tex: 'bone', eyeColor: 0xff5522, bony: true, hunch: true },
        decayingcorpse:     { name: 'Decaying Corpse',     scale: 2.0, skin: 0x8a9a6a, outfit: 0x5a5040, head: 'none', wpnR: 'fists', tex: 'flesh', eyeColor: 0xaacc44, zombie: true, hunch: true },
        fallenwarrior:      { name: 'Fallen Warrior',      scale: 2.1, skin: 0x8a9a7a, outfit: 0x5a5248, head: 'helmet', headColor: 0x5a5a52, wpnR: 'sword', tex: 'metal', eyeColor: 0x99cc66, zombie: true },
        festeringcorpse:    { name: 'Festering Corpse',    scale: 2.1, skin: 0x7a9a5a, outfit: 0x4a4a38, head: 'none', wpnR: 'fists', tex: 'green', eyeColor: 0xccff44, zombie: true, hunch: true },
        forgottenacolyte:   { name: 'Forgotten Acolyte',   scale: 2.0, skin: 0x9a9a8a, outfit: 0x5a5648, head: 'hood', headColor: 0x4a4638, wpnR: 'mace', robe: true, tex: 'pale', eyeColor: 0xffe080, zombie: true },
        frosttouchedthrall: { name: 'Frost-Touched Thrall', scale: 2.0, skin: 0xaaccd8, outfit: 0x6a7a8a, head: 'none', wpnR: 'fists', tex: 'water', eyeColor: 0x66ddff, zombie: true, hunch: true },
        graveyardshambler:  { name: 'Graveyard Shambler',  scale: 2.0, skin: 0x8a8068, outfit: 0x4a4234, head: 'none', wpnR: 'fists', tex: 'flesh', eyeColor: 0xaacc44, zombie: true, hunch: true },
        tombguardian:       { name: 'Tomb Guardian',       scale: 2.4, skin: 0x8a9a6a, outfit: 0x5a5040, head: 'helmet', headColor: 0x6a5a3a, wpnR: 'club', tex: 'flesh', eyeColor: 0x99cc66, zombie: true },
        undeadarcher:       { name: 'Undead Archer',       scale: 2.1, skin: 0xd8d0bc, outfit: 0x4a4a3a, head: 'none', wpnR: 'bow', tex: 'bone', eyeColor: 0x88ddff, bony: true },
        zombievillager:     { name: 'Zombie Villager',     scale: 2.0, skin: 0x8a9a6a, outfit: 0x6a5a48, head: 'none', wpnR: 'fists', tex: 'flesh', eyeColor: 0xaacc44, zombie: true, hunch: true },
        drownedrevenant:    { name: 'Drowned Revenant',    scale: 2.1, skin: 0x6a8a8a, outfit: 0x3a4a4a, head: 'none', wpnR: 'dagger', tex: 'water', eyeColor: 0x66ffcc, zombie: true, hunch: true },

        // ── Enemies 201-400 (humanoid-keyed) ──
        elvenfrostmage:    { name: 'Elven Frost Mage',    scale: 2.2, skin: 0xe6dccb, outfit: 0x3a6a8a, head: 'wizardhat', headColor: 0x2a4a6a, wpnR: 'staff', robe: true, ears: 'elf', tex: 'water', accent: 0x88ddff },
        elvengeomancer:    { name: 'Elven Geomancer',     scale: 2.2, skin: 0xe6dccb, outfit: 0x6a5a3a, head: 'hood', headColor: 0x5a4a2a, wpnR: 'staff', robe: true, ears: 'elf', tex: 'stone', accent: 0xc8a060 },
        elvenhighmage:     { name: 'Elven High Mage',     scale: 2.3, skin: 0xe6dccb, outfit: 0x4a2a6a, head: 'wizardhat', headColor: 0x3a1a5a, wpnR: 'staff', robe: true, ears: 'elf', tex: 'void', accent: 0xcc88ff },
        elvenmystic:       { name: 'Elven Mystic',        scale: 2.2, skin: 0xe6dccb, outfit: 0x3a6a5a, head: 'hood', headColor: 0x2a4a3a, wpnR: 'staff', robe: true, ears: 'elf', tex: 'green', accent: 0x66ffcc },
        elvenrangercaptain:{ name: 'Elven Ranger Captain', scale: 2.2, skin: 0xe6dccb, outfit: 0x3a5a2a, head: 'hood', headColor: 0x2a4a1a, wpnR: 'bow', ears: 'elf', tex: 'foliage', accent: 0x88cc66 },
        elvenroyalguard:   { name: 'Elven Royal Guard',   scale: 2.2, skin: 0xe6dccb, outfit: 0x8a9aaa, head: 'helmet', headColor: 0x9aaaba, wpnR: 'spear', ears: 'elf', tex: 'metal', accent: 0xcce0ff },
        elvenscout:        { name: 'Elven Scout',         scale: 2.1, skin: 0xe6dccb, outfit: 0x4a5a3a, head: 'hood', headColor: 0x3a4a2a, wpnR: 'dagger', ears: 'elf', tex: 'foliage' },
        elvensharpshooter: { name: 'Elven Sharpshooter',  scale: 2.2, skin: 0xe6dccb, outfit: 0x4a5a4a, head: 'hood', headColor: 0x3a4a3a, wpnR: 'bow', ears: 'elf', tex: 'foliage', accent: 0x88ffaa },
        elvenswordmaster:  { name: 'Elven Swordmaster',   scale: 2.2, skin: 0xe6dccb, outfit: 0x3a6a4a, head: 'hair', headColor: 0xe8e0a0, wpnR: 'sword', ears: 'elf', tex: 'pale', accent: 0x66ffcc },
        embercaster:       { name: 'Ember Caster',        scale: 2.0, skin: 0xc8a070, outfit: 0x9a3a1a, head: 'wizardhat', headColor: 0x7a2a10, wpnR: 'staff', robe: true, tex: 'fire', accent: 0xff6622 },
        frostapprentice:   { name: 'Frost Apprentice',    scale: 2.0, skin: 0xc8b0a0, outfit: 0x4a6a8a, head: 'hood', headColor: 0x3a5a7a, wpnR: 'staff', robe: true, tex: 'water', accent: 0x88ddff },
        frostweaver:       { name: 'Frost Weaver',        scale: 2.1, skin: 0xc8b0a0, outfit: 0x3a5a8a, head: 'wizardhat', headColor: 0x2a4a7a, wpnR: 'staff', robe: true, tex: 'water', accent: 0xaaeeff },
        haloacolyte:       { name: 'Halo Acolyte',        scale: 2.0, skin: 0xc8a888, outfit: 0xe8e0d0, head: 'hood', headColor: 0xd8d0c0, wpnR: 'mace', robe: true, tex: 'pale', accent: 0xffe080 },
        luminousdeacon:    { name: 'Luminous Deacon',     scale: 2.1, skin: 0xc8a888, outfit: 0xf0e8d0, head: 'hood', headColor: 0xe0d8c0, wpnR: 'staff', robe: true, tex: 'pale', accent: 0xffe890 },
        murkwallowghoul:   { name: 'Murkwallow Ghoul',    scale: 2.1, skin: 0x5a6a4a, outfit: 0x3a4030, head: 'none', wpnR: 'claws', tex: 'green', eyeColor: 0xaacc44, zombie: true, hunch: true },
        noviceillusionist: { name: 'Novice Illusionist',  scale: 2.0, skin: 0xc8a888, outfit: 0x5a3a7a, head: 'wizardhat', headColor: 0x4a2a6a, wpnR: 'staff', robe: true, tex: 'void', accent: 0xaa66ff },
        novicepaladin:     { name: 'Novice Paladin',      scale: 2.2, skin: 0xc8a888, outfit: 0xc8ccd2, head: 'helmet', headColor: 0xd0d4da, wpnR: 'mace', tex: 'metal', accent: 0xffe080 },
        ogrebrute:         { name: 'Ogre Brute',          scale: 2.4, skin: 0x9aac7a, outfit: 0x5a4a30, head: 'none', wpnR: 'club', tex: 'green', eyeColor: 0xcc6622 },
        ogrecrusher:       { name: 'Ogre Crusher',        scale: 2.6, skin: 0x8a9a6a, outfit: 0x5a3a28, head: 'none', wpnR: 'club', tex: 'green', eyeColor: 0xcc4422 },
        ogrefireshaman:    { name: 'Ogre Fire Shaman',    scale: 2.4, skin: 0x9aac7a, outfit: 0x7a3a1a, head: 'horns', headColor: 0x4a3020, wpnR: 'staff', tex: 'fire', eyeColor: 0xff6622, accent: 0xff5522 },
        ogremystic:        { name: 'Ogre Mystic',         scale: 2.4, skin: 0x9aac7a, outfit: 0x4a3a6a, head: 'none', wpnR: 'staff', tex: 'void', twoHead: true, eyeColor: 0xaa66ff, accent: 0x9966ff },
        orcbruiser:        { name: 'Orc Bruiser',         scale: 2.4, skin: 0x6a8a4a, outfit: 0x4a3a28, head: 'hornhelm', headColor: 0x6a7079, wpnR: 'club', tex: 'green', eyeColor: 0xcc4422 },
        professionalboxer: { name: 'Professional Boxer',  scale: 2.2, skin: 0xb89878, outfit: 0x8a2a2a, head: 'none', wpnR: 'gloves', wpnL: 'gloves', tex: 'flesh' },
        rattlingremains:   { name: 'Rattling Remains',    scale: 2.0, skin: 0xd8d0bc, outfit: 0x4a4438, head: 'none', wpnR: 'sword', tex: 'bone', eyeColor: 0x66ff88, bony: true },
        savageberserker:   { name: 'Savage Berserker',    scale: 2.3, skin: 0xc09878, outfit: 0x5a3a28, head: 'none', wpnR: 'axe', wpnL: 'axe', tex: 'fur', beard: 0x6a3a20, eyeColor: 0xcc3322 },
        spacezebra:        { name: 'Space Zebra',         scale: 2.1, skin: 0xe8e8e8, outfit: 0x2a2a2a, head: 'helmet', headColor: 0xaab0c0, wpnR: 'fists', tex: 'pale', eyeColor: 0x222222 },
        stealthyoperative: { name: 'Stealthy Operative',  scale: 2.1, skin: 0xb8a890, outfit: 0x2a2a32, head: 'hood', headColor: 0x1a1a22, wpnR: 'dagger', tex: 'void', eyeColor: 0x66ccff },
        streetbrawler:     { name: 'Street Brawler',      scale: 2.2, skin: 0xb89878, outfit: 0x3a4a5a, head: 'none', wpnR: 'gloves', tex: 'flesh', beard: 0x3a2a1a },
        streetpunk:        { name: 'Street Punk',         scale: 2.1, skin: 0xc8a888, outfit: 0x4a3a4a, head: 'mohawk', headColor: 0xcc3344, wpnR: 'fists', tex: 'flesh' },
        thorfolk:          { name: 'Thor',                scale: 2.4, skin: 0xe0c8a8, outfit: 0x8a2a2a, head: 'horns', headColor: 0xb0b8c0, wpnR: 'mace', tex: 'metal', beard: 0xe8d090, eyeColor: 0x88ddff, accent: 0x88ddff },
        tomekeepersunstone:{ name: 'Tomekeeper of the Sunstone', scale: 2.2, skin: 0xc0a888, outfit: 0x8a6a2a, head: 'hood', headColor: 0x6a4a1a, wpnR: 'staff', robe: true, tex: 'fire', beard: 0xcccccc, accent: 0xffcc44 },
        voiddesolator:     { name: 'Void Desolator',      scale: 2.4, skin: 0x4a4055, outfit: 0x2a2038, head: 'horns', headColor: 0x6a5a7a, wpnR: 'club', tex: 'void', eyeColor: 0xaa66ff, accent: 0x9933cc, snout: true },
        wanderingarcher:   { name: 'Wandering Archer',    scale: 2.2, skin: 0xc8a888, outfit: 0x7a7a82, head: 'helmet', headColor: 0x8a8a92, wpnR: 'bow', tex: 'metal' },
        wildripper:        { name: 'Wild ripper',         scale: 2.2, skin: 0xb09870, outfit: 0x5a4a30, head: 'none', wpnR: 'claws', tex: 'fur', snout: true, ears: 'cat', tail: true, eyeColor: 0xffcc33, beast: true },
        xibalbaglyphweaver:{ name: 'Xibalba Glyphweaver', scale: 2.2, skin: 0xb0a8b8, outfit: 0x2a2a3a, head: 'hood', headColor: 0x1a1a2a, wpnR: 'staff', robe: true, tex: 'void', eyeColor: 0x66ffcc, accent: 0x66ffaa, glow: true },
        zephyrwizard:      { name: 'Zephyr Wizard',       scale: 2.0, skin: 0xc8a888, outfit: 0x6a8a9a, head: 'wizardhat', headColor: 0x5a7a8a, wpnR: 'staff', robe: true, tex: 'pale', accent: 0xaaffee },
        abyssalhydromancer:{ name: 'Abyssal Hydromancer', scale: 2.2, skin: 0xa8b8c0, outfit: 0x2a4a6a, head: 'wizardhat', headColor: 0x1a3a5a, wpnR: 'staff', robe: true, tex: 'water', accent: 0x66bbff },
        akiratanaka:       { name: 'Gremory',        scale: 2.1, skin: 0xd8b890, outfit: 0xe8e8e0, head: 'hair', headColor: 0x1a1a1a, wpnR: 'gloves', wpnL: 'gloves', tex: 'pale', eyeColor: 0x222222 },
        furyhowlbarbarian: { name: 'Furyhowl Barbarian',  scale: 2.5, skin: 0x8a7a5a, outfit: 0x5a3a28, head: 'horns', headColor: 0x3a2a1a, wpnR: 'axe', tex: 'fur', snout: true, eyeColor: 0xcc3322, beast: true },
        gnomeherbalist:    { name: 'Gnome Herbalist',     scale: 1.7, skin: 0xc8a070, outfit: 0x4a6a3a, head: 'conehat', headColor: 0xcc2222, wpnR: 'staff', tex: 'foliage', beard: 0xcccccc, accent: 0x88cc66 },
        gnomeminer:        { name: 'Gnome Miner',         scale: 1.7, skin: 0xc8a070, outfit: 0x5a4a38, head: 'conehat', headColor: 0xcc2222, wpnR: 'pickaxe', tex: 'stone', beard: 0xb8b0a0 },
        gnomepeasant:      { name: 'Gnome Peasant',       scale: 1.7, skin: 0xc8a070, outfit: 0x6a5a40, head: 'conehat', headColor: 0xcc2222, wpnR: 'fists', tex: 'wood', beard: 0xc8c0b0 },
        gnomescout:        { name: 'Gnome Scout',         scale: 1.7, skin: 0xc8a070, outfit: 0x4a5a3a, head: 'conehat', headColor: 0xcc2222, wpnR: 'dagger', tex: 'foliage', beard: 0xb8b0a0 },
        gnometinkerer:     { name: 'Gnome Tinkerer',      scale: 1.7, skin: 0xc8a070, outfit: 0x6a6048, head: 'conehat', headColor: 0xcc2222, wpnR: 'mace', tex: 'metal', beard: 0xddddcc, accent: 0xffcc44 },
        gnometrickster:    { name: 'Gnome Trickster',     scale: 1.7, skin: 0xc8a070, outfit: 0x6a4a6a, head: 'conehat', headColor: 0xcc2222, wpnR: 'dagger', tex: 'pale', beard: 0xc8c0b0, accent: 0xffaaff },

        // ── Demons (humanoid-keyed; horns/tail/wings) ──
        emberfiend:        { name: 'Ember Fiend',         scale: 1.9, skin: 0xc83a22, outfit: 0x6a2010, head: 'horns', headColor: 0x2a1008, wpnR: 'fists', tex: 'fire', tail: 'barb', wings: true, wingColor: 0x5a1810, eyeColor: 0xffcc22, accent: 0xff6622 },
        frostdeciever:     { name: 'Frost Deciever',      scale: 2.0, skin: 0x8ab0c8, outfit: 0x2a4a6a, head: 'horns', headColor: 0x1a3a5a, wpnR: 'dagger', tex: 'water', tail: 'barb', wings: true, wingColor: 0x2a4a6a, eyeColor: 0x88ddff, accent: 0x88ddff },
        frostsuccubus:     { name: 'Frost Succubus',      scale: 2.1, skin: 0xc8d4e0, outfit: 0x5a3a6a, head: 'hair', headColor: 0x6a4a8a, wpnR: 'dagger', tex: 'water', tail: 'barb', wings: true, wingColor: 0x4a3a5a, eyeColor: 0x88ddff, accent: 0xaaddff },
        gravelimp:         { name: 'Gravel Imp',          scale: 1.8, skin: 0x7a7068, outfit: 0x5a544a, head: 'horns', headColor: 0x4a4038, wpnR: 'fists', tex: 'stone', tail: 'barb', eyeColor: 0xcc8822, rocky: true },
        mirrorfiend:       { name: 'Mirror Fiend',        scale: 2.0, skin: 0xb8c0c8, outfit: 0x6a7079, head: 'horns', headColor: 0x8a9098, wpnR: 'dagger', tex: 'metal', tail: 'barb', wings: true, wingColor: 0x8a9098, eyeColor: 0xffffff, accent: 0xeeeeff },
        nightmareweaver:   { name: 'Nightmare Weaver',    scale: 2.2, skin: 0x4a3a5a, outfit: 0x2a1a3a, head: 'horns', headColor: 0x3a2a4a, wpnR: 'staff', robe: true, tex: 'void', tail: 'barb', wings: true, wingColor: 0x2a1a3a, eyeColor: 0xaa66ff, accent: 0x9933cc },
        soulmerchant:      { name: 'Soul Merchant',       scale: 2.1, skin: 0x9a3a3a, outfit: 0x3a2a18, head: 'hood', headColor: 0x2a1a10, wpnR: 'staff', robe: true, tex: 'void', tail: 'barb', eyeColor: 0xffcc44, accent: 0xffcc44 },
        tricksterimp:      { name: 'Trickster Imp',       scale: 1.8, skin: 0x9a4acc, outfit: 0x4a2a6a, head: 'horns', headColor: 0x3a1a5a, wpnR: 'dagger', tex: 'void', tail: 'barb', wings: true, wingColor: 0x4a2a6a, eyeColor: 0xffee44, accent: 0xcc66ff },
        venomdevil:        { name: 'Venom Devil',         scale: 2.0, skin: 0x5a8a3a, outfit: 0x3a5a1a, head: 'horns', headColor: 0x2a4a10, wpnR: 'dagger', tex: 'green', tail: 'barb', wings: true, wingColor: 0x3a5a1a, eyeColor: 0xccff44, accent: 0x88ff44 },
        abyssalfiend:      { name: 'Abyssal Fiend',       scale: 2.6, skin: 0x7a1a1a, outfit: 0x3a0a0a, head: 'horns', headColor: 0x1a0808, wpnR: 'club', tex: 'fire', tail: 'barb', wings: true, wingColor: 0x2a0808, eyeColor: 0xff4422, accent: 0xff3311 },
        // ── Auto-generated bespoke configs for remaining shared enemies ──
        fk_animatedgravestalker: { name: "Animated Gravestalker", skin: 0xe0dcc8, outfit: 0x4a4a52, tex: "bone", bony: true, eyeColor: 0x88ddff, wpnR: "dagger", head: "hood" },
        fk_arcanearchmage: { name: "Arcane Archmage", skin: 0xc8a888, outfit: 0x6a4a3a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff", head: "wizardhat" },
        fk_blindingsadist: { name: "Blinding Sadist", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa },
        fk_bloodcountess: { name: "Blood Countess", skin: 0xd8d0d4, outfit: 0x4a1018, head: "hair", headColor: 0x1a1a1a, tex: "pale", eyeColor: 0xff2222, robe: true },
        fk_bloodthirstycrusader: { name: "Bloodthirsty Crusader", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_bonecommander: { name: "Bone Commander", scale: 2.6, skin: 0x8a9a7a, outfit: 0x5a4a3a, tex: "green", glow: true, eyeColor: 0x66ff88, zombie: true, wpnR: "sword", head: "helmet" },
        fk_bubba: { name: "Bubba", skin: 0xc8a888, outfit: 0x5a3a4a, tex: "flesh", eyeColor: 0x222222 },
        fk_championcontender: { name: "Champion Contender", skin: 0xc8a888, outfit: 0x3a5a3a, tex: "flesh", eyeColor: 0x222222, wpnR: "sword" },
        fk_consecratedguardian: { name: "Consecrated Guardian", skin: 0xc8a888, outfit: 0x5a5a3a, tex: "flesh", eyeColor: 0x222222, wpnR: "sword", head: "helmet" },
        fk_coralenchantress: { name: "Coral Enchantress", skin: 0xc8a888, outfit: 0x3a4a5a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff" },
        fk_corpsecarverknight: { name: "Corpsecarver Knight", skin: 0x8a9a7a, outfit: 0x4a5a4a, tex: "green", zombie: true, eyeColor: 0x88ff66, wpnR: "sword", head: "helmet" },
        fk_corruptedknight: { name: "Corrupted Knight", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_crimsonanalizer: { name: "Crimson Analizer", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_crimsonharbinger: { name: "Crimson Harbinger", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_cryptbornshrieker: { name: "Cryptborn Shrieker", scale: 2.6, skin: 0x8a9a7a, outfit: 0x5a4a3a, tex: "green", glow: true, eyeColor: 0x66ff88, zombie: true },
        fk_darkmage: { name: "Dark Mage", skin: 0xc8a888, outfit: 0x4a3a2a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff", head: "wizardhat" },
        fk_desertcommander: { name: "Desert Commander", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, tex: "green", eyeColor: 0xcc6622, wpnR: "sword", head: "helmet" },
        fk_devotedtemplar: { name: "Devoted Templar", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "mace" },
        fk_diegojaguarrodriguez: { name: "Marchosias", skin: 0xc8a888, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_discorevenant: { name: "Disco Revenant", skin: 0x8a9a7a, outfit: 0x4a4a6a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_divinearbiter: { name: "Divine Arbiter", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa },
        fk_dominanttaskmaster: { name: "Dominant Taskmaster", skin: 0xc8a888, outfit: 0x3a5a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_dreadknight: { name: "Dread Knight", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_earthelemental: { name: "Earth Elemental", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_elenashadowrodriguez: { name: "Bathin", skin: 0xc8a888, outfit: 0x5a5a3a, tex: "flesh", eyeColor: 0x222222, head: "hood" },
        fk_eliteboxingchampion: { name: "Elite Boxing Champion", skin: 0xc8a888, outfit: 0x3a4a5a, tex: "flesh", eyeColor: 0x222222, wpnR: "sword" },
        fk_em: { name: "Em", skin: 0xc8a888, outfit: 0x5a5a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_essenceleech: { name: "Essence Leech", skin: 0xd8d0d4, outfit: 0x4a1018, head: "hair", headColor: 0x1a1a1a, tex: "pale", eyeColor: 0xff2222, robe: true },
        fk_eternalintern: { name: "Eternal Intern", scale: 1.7, skin: 0xc8a070, outfit: 0x3a4a5a, head: "conehat", headColor: 0xcc2222, beard: 14540236, tex: "wood" },
        fk_feyenchantress: { name: "Fey Enchantress", scale: 1.6, skin: 0xe8d0e0, outfit: 0x6a4a3a, wings: true, wingColor: 0xbfe9ff, tex: "pale", glow: true, eyeColor: 0x66ffff, wpnR: "staff" },
        fk_fierysleepdemon: { name: "Fiery Sleep Demon", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_fossilsentinel: { name: "Fossil Sentinel", scale: 2.6, skin: 0x8a9a7a, outfit: 0x5a4a3a, tex: "green", glow: true, eyeColor: 0x66ff88, zombie: true, wpnR: "sword", head: "helmet" },
        fk_frostenchantress: { name: "Frost Enchantress", skin: 0xc8a888, outfit: 0x5a4a6a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff" },
        fk_gnomealchemist: { name: "Gnome Alchemist", scale: 1.7, skin: 0xc8a070, outfit: 0x4a5a4a, head: "conehat", headColor: 0xcc2222, beard: 14540236, tex: "wood" },
        fk_gnomeartificer: { name: "Gnome Artificer", scale: 1.7, skin: 0xc8a070, outfit: 0x3a5a3a, head: "conehat", headColor: 0xcc2222, beard: 14540236, tex: "wood" },
        fk_gnomebombardier: { name: "Gnome Bombardier", scale: 1.7, skin: 0xc8a070, outfit: 0x6a5a3a, head: "conehat", headColor: 0xcc2222, beard: 14540236, tex: "wood", wpnR: "lute" },
        fk_gnomeengineer: { name: "Gnome Engineer", scale: 1.7, skin: 0xc8a070, outfit: 0x5a3a3a, head: "conehat", headColor: 0xcc2222, beard: 14540236, tex: "wood" },
        fk_gnomeshaman: { name: "Gnome Shaman", scale: 1.7, skin: 0xc8a070, outfit: 0x4a5a4a, head: "conehat", headColor: 0xcc2222, beard: 14540236, tex: "wood" },
        fk_gnomewarlock: { name: "Gnome Warlock", scale: 1.7, skin: 0xc8a070, outfit: 0x5a3a3a, head: "conehat", headColor: 0xcc2222, beard: 14540236, tex: "wood", wpnR: "staff" },
        fk_graveboundrevenant: { name: "Gravebound Revenant", skin: 0x8a9a7a, outfit: 0x5a3a4a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_guardianvindicator: { name: "Guardian Vindicator", skin: 0xc8a888, outfit: 0x5a4a6a, tex: "flesh", eyeColor: 0x222222, wpnR: "sword", head: "helmet" },
        fk_infernaldevastator: { name: "Infernal Devastator", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_infernalprodigy: { name: "Infernal Prodigy", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_infernalwarmonger: { name: "Infernal Warmonger", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_labyrinthguardian: { name: "Labyrinth Guardian", scale: 2.6, skin: 0x9aac7a, outfit: 0x6a4a3a, twoHead: true, tex: "flesh", eyeColor: 0xcc6622, wpnR: "sword", head: "helmet" },
        fk_livingarmor: { name: "Living Armor", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_livingmonolith: { name: "Living Monolith", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_masterchen: { name: "Paimon", skin: 0xc8a888, outfit: 0x5a4a6a, tex: "flesh", eyeColor: 0x222222 },
        fk_mechanicalgolem: { name: "Mechanical Golem", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_merchantsnightmare: { name: "Merchant's Nightmare", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_militarycyborg: { name: "Military Cyborg", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_mindsculptor: { name: "Mind Sculptor", skin: 0xc8a888, outfit: 0x5a4a6a, tex: "flesh", eyeColor: 0x222222 },
        fk_mountaincrusher: { name: "Mountain Crusher", skin: 0xc8a888, outfit: 0x3a4a5a, tex: "flesh", eyeColor: 0x222222 },
        fk_mountainogre: { name: "Mountain Ogre", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, tex: "green", eyeColor: 0xcc6622 },
        fk_mysticprodigy: { name: "Mystic Prodigy", skin: 0xc8a888, outfit: 0x3a5a5a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff" },
        fk_necroticchampion: { name: "Necrotic Champion", skin: 0xe0dcc8, outfit: 0x4a4a52, tex: "bone", bony: true, eyeColor: 0x88ddff, wpnR: "sword" },
        fk_nephilimremnant: { name: "Nephilim Remnant", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa },
        fk_noviceshaolinacolyte: { name: "Novice Shaolin Acolyte", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, tex: "green", eyeColor: 0xcc6622, wpnR: "mace", head: "hood" },
        fk_obsidianburrower: { name: "Obsidian Burrower", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_oceanwarlock: { name: "Ocean Warlock", skin: 0xc8a888, outfit: 0x3a4a5a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff", head: "wizardhat" },
        fk_ogrearchmage: { name: "Ogre Archmage", skin: 0xc8a888, outfit: 0x3a4a5a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff", head: "wizardhat" },
        fk_ogrechampion: { name: "Ogre Champion", skin: 0xc8a888, outfit: 0x4a5a4a, tex: "flesh", eyeColor: 0x222222, wpnR: "sword" },
        fk_ogreelementaladept: { name: "Ogre Elemental Adept", skin: 0xc8a888, outfit: 0x4a3a2a, tex: "flesh", eyeColor: 0x222222 },
        fk_ogrewarlord: { name: "Ogre Warlord", skin: 0xc8a888, outfit: 0x4a3a2a, tex: "flesh", eyeColor: 0x222222, head: "hornhelm" },
        fk_painenthusiast: { name: "Pain Enthusiast", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_permafrostconjurer: { name: "Permafrost Conjurer", skin: 0xc8a888, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff", head: "wizardhat" },
        fk_philosophicalzombie: { name: "Philosophical Zombie", skin: 0x8a9a7a, outfit: 0x6a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_photondefender: { name: "Photon Defender", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff, wpnR: "sword" },
        fk_plasmajuggernaut: { name: "Plasma Juggernaut", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_poisonpooka: { name: "Poison Pooka", scale: 1.6, skin: 0xe8d0e0, outfit: 0x6a4a3a, wings: true, wingColor: 0xbfe9ff, tex: "pale", glow: true, eyeColor: 0x66ffff },
        fk_quantumsupersoldier: { name: "Quantum Supersoldier", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff, wpnR: "sword" },
        fk_quetzalcoatlchanneler: { name: "Quetzalcoatl Channeler", skin: 0xc8a888, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_radiantarchpriest: { name: "Radiant Archpriest", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa, wpnR: "mace" },
        fk_radiantjusticar: { name: "Radiant Justicar", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal" },
        fk_rashidalsayf: { name: "Zagan", skin: 0xc8a888, outfit: 0x5a4a6a, tex: "flesh", eyeColor: 0x222222 },
        fk_roguesentinel: { name: "Rogue Sentinel", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff, wpnR: "dagger" },
        fk_royalchampion: { name: "Royal Champion", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_royalknight: { name: "Royal Knight", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_sandgolem: { name: "Sand Golem", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_scarecrowsentinel: { name: "Scarecrow Sentinel", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff, wpnR: "sword" },
        fk_sculptorssorrow: { name: "Sculptor's Sorrow", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_securitysentinel: { name: "Security Sentinel", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff, wpnR: "sword" },
        fk_seismictunneler: { name: "Seismic Tunneler", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_shadowblade: { name: "Shadow Blade", skin: 0xc8a888, outfit: 0x5a5a3a, tex: "flesh", eyeColor: 0x222222, head: "hood" },
        fk_shadowblade2: { name: "Shadow Blade", skin: 0xc8a888, outfit: 0x5a5a3a, tex: "flesh", eyeColor: 0x222222, head: "hood" },
        fk_shadowthief: { name: "Shadow Thief", skin: 0xc8a888, outfit: 0x4a5a4a, tex: "flesh", eyeColor: 0x222222, wpnR: "dagger", head: "hood" },
        fk_somnolentapparition: { name: "Somnolent Apparition", skin: 0xc8a888, outfit: 0x4a5a4a, tex: "flesh", eyeColor: 0x222222 },
        fk_starcaller: { name: "Star Caller", skin: 0xc8a888, outfit: 0x3a4a5a, tex: "flesh", eyeColor: 0x222222 },
        fk_terragolem: { name: "Terra Golem", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_thoughtweaver: { name: "Thought Weaver", skin: 0xc8a888, outfit: 0x3a5a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_treasuregolem: { name: "Treasure Golem", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_viktorironfistvolkov: { name: "Andras", skin: 0xc8a888, outfit: 0x4a5a4a, tex: "flesh", eyeColor: 0x222222 },
        fk_voidsorcerer: { name: "Void Sorcerer", skin: 0xc8a888, outfit: 0x3a5a5a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff", head: "wizardhat" },
        fk_warbornchieftain: { name: "Warborn Chieftain", scale: 2.6, skin: 0x9aac7a, outfit: 0x4a3a2a, twoHead: true, tex: "flesh", eyeColor: 0xcc6622, head: "hornhelm" },
        fk_wintercourtknight: { name: "Winter Court Knight", scale: 1.6, skin: 0xe8d0e0, outfit: 0x6a5a3a, wings: true, wingColor: 0xbfe9ff, tex: "pale", glow: true, eyeColor: 0x66ffff, wpnR: "sword", head: "helmet" },
        fk_abyssalpixie: { name: "Abyssal Pixie", scale: 1.6, skin: 0xe8d0e0, outfit: 0x4a5a4a, wings: true, wingColor: 0xbfe9ff, tex: "pale", glow: true, eyeColor: 0x66ffff },
        fk_astralsentinel: { name: "Astral Sentinel", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa, wpnR: "sword" },
        fk_blightsylph: { name: "Blight Sylph", scale: 1.6, skin: 0xe8d0e0, outfit: 0x4a5a4a, wings: true, wingColor: 0xbfe9ff, tex: "pale", glow: true, eyeColor: 0x66ffff },
        fk_bloodlordsupreme: { name: "Bloodlord Supreme", skin: 0xd8d0d4, outfit: 0x4a1018, head: "hair", headColor: 0x1a1a1a, tex: "pale", eyeColor: 0xff2222, robe: true },
        fk_boggolem: { name: "Bog Golem", scale: 2.6, skin: 0x8a9a7a, outfit: 0x5a4a3a, tex: "green", glow: true, eyeColor: 0x66ff88, zombie: true },
        fk_celestialarbiter: { name: "Celestial Arbiter", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa },
        fk_cerberussentinel: { name: "Cerberus Sentinel", scale: 2.6, skin: 0x9aac7a, outfit: 0x5a3a3a, twoHead: true, tex: "flesh", eyeColor: 0xcc6622, wpnR: "sword", head: "helmet" },
        fk_corporateninja: { name: "Corporate Ninja", skin: 0xc8a888, outfit: 0x3a5a5a, tex: "flesh", eyeColor: 0x222222, wpnR: "dagger" },
        fk_crystallineshardbeast: { name: "Crystalline Shardbeast", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_emberwarder: { name: "Ember Warder", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_frostarchmagus: { name: "Frost Archmagus", skin: 0xc8a888, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_frostknight: { name: "Frost Knight", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_greyzetareticulan: { name: "Grey Zeta Reticulan", skin: 0xc8a888, outfit: 0x4a3a2a, tex: "flesh", eyeColor: 0x222222 },
        fk_infernalannihilator: { name: "Infernal Annihilator", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_infernalwarhound: { name: "Infernal Warhound", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_infernopooka: { name: "Inferno Pooka", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_ironsentinel: { name: "Iron Sentinel", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_laughingmireidol: { name: "Laughing Mire Idol", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_moltenguardian: { name: "Molten Guardian", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_mountaindevastator: { name: "Mountain Devastator", skin: 0xc8a888, outfit: 0x6a4a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_mountaindevastator2: { name: "Mountain Devastator", scale: 2.6, skin: 0x9aac7a, outfit: 0x6a4a3a, twoHead: true, tex: "flesh", eyeColor: 0xcc6622 },
        fk_mountaingiant: { name: "Mountain Giant", skin: 0xc8a888, outfit: 0x5a3a4a, tex: "flesh", eyeColor: 0x222222 },
        fk_nethercourtduchess: { name: "Nether Court Duchess", scale: 1.6, skin: 0xe8d0e0, outfit: 0x5a3a4a, wings: true, wingColor: 0xbfe9ff, tex: "pale", glow: true, eyeColor: 0x66ffff },
        fk_nightmaremage: { name: "Nightmare Mage", skin: 0xc8a888, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x222222, wpnR: "staff", head: "wizardhat" },
        fk_nightveilassassin: { name: "Nightveil Assassin", skin: 0xc8a888, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x222222, wpnR: "dagger", head: "hood" },
        fk_ogrewarlockking: { name: "Ogre Warlock King", scale: 2.6, skin: 0x9aac7a, outfit: 0x6a5a3a, twoHead: true, tex: "flesh", eyeColor: 0xcc6622, wpnR: "staff", head: "wizardhat" },
        fk_petrifiedenforcer: { name: "Petrified Enforcer", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_primordialgolem: { name: "Primordial Golem", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_radiantdefender: { name: "Radiant Defender", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_royaljusticar: { name: "Royal Justicar", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal" },
        fk_shadowassassin: { name: "Shadow Assassin", skin: 0xc8a888, outfit: 0x6a5a3a, tex: "flesh", eyeColor: 0x222222, wpnR: "dagger", head: "hood" },
        fk_siegeautomation: { name: "Siege Automation", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_tanko: { name: "Tanko", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_vampiricnightwing: { name: "Vampiric Nightwing", skin: 0x8a9a7a, outfit: 0x5a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_warhyppotaur: { name: "War Hyppotaur", scale: 2.6, skin: 0x6a4a2a, head: "horns", hornColor: 0xe8e0d0, tex: "flesh", eyeColor: 0xcc3322 },
        fk_celestialprotector: { name: "Celestial Protector", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa },
        fk_duskcommander: { name: "Dusk Commander", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal", wpnR: "sword" },
        fk_ironpalmdisciple: { name: "Iron Palm Disciple", skin: 0xc8a888, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_mechanizedharbinger: { name: "Mechanized Harbinger", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_moltenefreeti: { name: "Molten Efreeti", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_nepenthemycoastrum: { name: "Nepenthe Mycoastrum", scale: 1.6, skin: 0xe8d0e0, outfit: 0x6a5a3a, wings: true, wingColor: 0xbfe9ff, tex: "pale", glow: true, eyeColor: 0x66ffff },
        fk_phylacteryguardian: { name: "Phylactery Guardian", scale: 2.6, skin: 0x8a9a7a, outfit: 0x5a4a3a, tex: "green", glow: true, eyeColor: 0x66ff88, zombie: true, wpnR: "sword", head: "helmet" },
        fk_stonebulwark: { name: "Stone Bulwark", scale: 3, skin: 0x7a7068, rocky: true, tex: "stone", eyeColor: 0x88aa66 },
        fk_cinderheartscion: { name: "Cinderheart Scion", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_infernalpyromancer: { name: "Infernal Pyromancer", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00, wpnR: "staff" },
        fk_marrowarchmage: { name: "Marrow Archmage", skin: 0xd8d0d4, outfit: 0x4a1018, head: "hair", headColor: 0x1a1a1a, tex: "pale", eyeColor: 0xff2222, robe: true, wpnR: "bow" },
        fk_zenfistmaster: { name: "Zen Fist Master", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, tex: "green", eyeColor: 0xcc6622 },
        fk_foulgouger: { name: "Foul Gouger", scale: 2.6, skin: 0x6a4a2a, head: "horns", hornColor: 0xe8e0d0, tex: "flesh", eyeColor: 0xcc3322 },
        fk_infernoarchivist: { name: "Inferno Archivist", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_screamingjar: { name: "Screaming Jar", skin: 0xd8d0d4, outfit: 0x4a1018, head: "hair", headColor: 0x1a1a1a, tex: "pale", eyeColor: 0xff2222, robe: true },
        fk_bloodcountessep: { name: "Blood Countess :EP", skin: 0xd8d0d4, outfit: 0x4a1018, head: "hair", headColor: 0x1a1a1a, tex: "pale", eyeColor: 0xff2222, robe: true },
        fk_crimsonvampireep: { name: "Crimson Vampire :EP", skin: 0xd8d0d4, outfit: 0x4a1018, head: "hair", headColor: 0x1a1a1a, tex: "pale", eyeColor: 0xff2222, robe: true },
        fk_hollowmother: { name: "Hollow Mother", skin: 0x8a9a7a, outfit: 0x5a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_basaltstonegolem: { name: "Basaltstone Golem", scale: 1.7, skin: 0xc8a070, outfit: 0x5a5a3a, head: "conehat", headColor: 0xcc2222, beard: 14540236, tex: "wood" },
        fk_dopedchimp: { name: "Doped Chimp", skin: 0xc8a888, outfit: 0x3a5a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_hungerincarnate: { name: "Hunger Incarnate", skin: 0xc8a888, outfit: 0x6a4a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_mirrorbasher: { name: "Mirror Basher", skin: 0x8a8f98, outfit: 0x6a6a72, head: "helmet", headColor: 0x6a6a72, tex: "metal" },
        fk_surgeonofsouls: { name: "Surgeon of Souls", skin: 0xc8a888, outfit: 0x6a4a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_cherubichostalpha: { name: "Cherubic Host-Alpha", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa },
        fk_fierydeity: { name: "Fiery Deity", skin: 0xc8a888, outfit: 0x6a4a3a, tex: "flesh", eyeColor: 0x222222 },
        fk_dominionoftheflame: { name: "Dominion of the Flame", scale: 2.6, skin: 0xe8dcc0, outfit: 0xf0e8d0, head: "hair", headColor: 0xe8e0a0, wings: true, wingColor: 0xffffff, tex: "bone", glow: true, eyeColor: 0xfff0aa },
        fk_cultistofcthulhu: { name: "Cultist of Cthulhu", skin: 0xc8a888, outfit: 0x6a4a3a, tex: "flesh", eyeColor: 0x222222, head: "hood" },
        fk_cultistofnyarlathotep: { name: "Cultist of Nyarlathotep", skin: 0xc8a888, outfit: 0x4a5a4a, tex: "flesh", eyeColor: 0x222222, head: "hood" },
        fk_cultistofshubniggurath: { name: "Cultist of Shub-Niggurath", skin: 0xc8a888, outfit: 0x3a5a5a, tex: "flesh", eyeColor: 0x222222, head: "hood" },
        fk_cultistofyogsothoth: { name: "Cultist of Yog-Sothoth", skin: 0xc8a888, outfit: 0x4a5a4a, tex: "flesh", eyeColor: 0x222222, head: "hood" },
        fk_saltcuredmourner: { name: "Salt-Cured Mourner", skin: 0x8a9a7a, outfit: 0x5a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_saltcuredcerecloth: { name: "Salt-Cured Cerecloth", skin: 0x8a9a7a, outfit: 0x6a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_saltcuredwight: { name: "Salt-Cured Wight", skin: 0x8a9a7a, outfit: 0x6a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_forgottencadaver: { name: "Forgotten Cadaver", skin: 0x8a9a7a, outfit: 0x6a4a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_restlesscharnelhound: { name: "Restless Charnelhound", skin: 0x8a9a7a, outfit: 0x5a4a6a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_restlesspallbearer: { name: "Restless Pallbearer", skin: 0x8a9a7a, outfit: 0x6a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_plaguecerecloth: { name: "Plague Cerecloth", skin: 0x8a9a7a, outfit: 0x5a3a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_witheredmourner: { name: "Withered Mourner", skin: 0x8a9a7a, outfit: 0x6a4a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_witheredcharnelhound: { name: "Withered Charnelhound", skin: 0x8a9a7a, outfit: 0x5a3a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_cerementgravewalker: { name: "Cerement Gravewalker", skin: 0x8a9a7a, outfit: 0x6a4a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_cerementbonepicker: { name: "Cerement Bonepicker", skin: 0x8a9a7a, outfit: 0x3a5a5a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_plaguehusk: { name: "Plague Husk", skin: 0x8a9a7a, outfit: 0x3a5a5a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_cryptbonepicker: { name: "Crypt Bonepicker", skin: 0x8a9a7a, outfit: 0x4a3a2a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_rottinghusk: { name: "Rotting Husk", skin: 0x8a9a7a, outfit: 0x5a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_witheredhusk: { name: "Withered Husk", skin: 0x8a9a7a, outfit: 0x3a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_restlesscadaver: { name: "Restless Cadaver", skin: 0x8a9a7a, outfit: 0x6a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_cryptwight: { name: "Crypt Wight", skin: 0x8a9a7a, outfit: 0x3a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_cerementboneknight: { name: "Cerement Boneknight", skin: 0x8a9a7a, outfit: 0x5a3a4a, tex: "green", zombie: true, eyeColor: 0x88ff66, wpnR: "sword", head: "helmet" },
        fk_gildedrevenant: { name: "Gilded Revenant", skin: 0x8a9a7a, outfit: 0x5a3a4a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_sunkenhusk: { name: "Sunken Husk", skin: 0x8a9a7a, outfit: 0x3a4a5a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_hollowbonepicker: { name: "Hollow Bonepicker", skin: 0x8a9a7a, outfit: 0x3a5a5a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_restlessbonepicker: { name: "Restless Bonepicker", skin: 0x8a9a7a, outfit: 0x6a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_restlessthrall: { name: "Restless Thrall", skin: 0x8a9a7a, outfit: 0x4a5a4a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_witheredthrall: { name: "Withered Thrall", skin: 0x8a9a7a, outfit: 0x3a4a5a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_graveboundgravewalker: { name: "Grave-Bound Gravewalker", skin: 0x8a9a7a, outfit: 0x3a4a5a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_cinderwrappedsentinel: { name: "Cinder-Wrapped Sentinel", skin: 0x8a9a7a, outfit: 0x3a5a5a, tex: "green", zombie: true, eyeColor: 0x88ff66, wpnR: "sword", head: "helmet" },
        fk_graveboundmourner: { name: "Grave-Bound Mourner", skin: 0x8a9a7a, outfit: 0x4a5a4a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_restlessgravewalker: { name: "Restless Gravewalker", skin: 0x8a9a7a, outfit: 0x4a3a2a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_hollowcharnelhound: { name: "Hollow Charnelhound", skin: 0x8a9a7a, outfit: 0x5a3a4a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_forgottenboneknight: { name: "Forgotten Boneknight", skin: 0x8a9a7a, outfit: 0x3a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66, wpnR: "sword", head: "helmet" },
        fk_graveboundboneknight: { name: "Grave-Bound Boneknight", skin: 0x8a9a7a, outfit: 0x3a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66, wpnR: "sword", head: "helmet" },
        fk_gildedthrall: { name: "Gilded Thrall", skin: 0x8a9a7a, outfit: 0x4a5a4a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_saltcuredgravewalker: { name: "Salt-Cured Gravewalker", skin: 0x8a9a7a, outfit: 0x3a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_forgottencharnelhound: { name: "Forgotten Charnelhound", skin: 0x8a9a7a, outfit: 0x3a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_gildedsentinel: { name: "Gilded Sentinel", skin: 0x8a9a7a, outfit: 0x3a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66, wpnR: "sword", head: "helmet" },
        fk_hollowgravewalker: { name: "Hollow Gravewalker", skin: 0x8a9a7a, outfit: 0x5a3a4a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_mummifiedgravewalker: { name: "Mummified Gravewalker", skin: 0x8a9a7a, outfit: 0x6a4a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_cinderwrappedwight: { name: "Cinder-Wrapped Wight", skin: 0x8a9a7a, outfit: 0x5a3a4a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_hollowwight: { name: "Hollow Wight", skin: 0x8a9a7a, outfit: 0x5a5a3a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_sunkengravewalker: { name: "Sunken Gravewalker", skin: 0x8a9a7a, outfit: 0x3a5a5a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_cryptrevenant: { name: "Crypt Revenant", skin: 0x8a9a7a, outfit: 0x4a4a6a, tex: "green", zombie: true, eyeColor: 0x88ff66 },
        fk_whisperingtormentor: { name: "Whispering Tormentor", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_hollowpixie: { name: "Hollow Pixie", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_fangedimp: { name: "Fanged Imp", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_whisperingnixie: { name: "Whispering Nixie", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_leeringsprite: { name: "Leering Sprite", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_glimmeringdevilkin: { name: "Glimmering Devilkin", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_brimstonefiend: { name: "Brimstone Fiend", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_spitefulpixie: { name: "Spiteful Pixie", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_gibberingfiend: { name: "Gibbering Fiend", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_mockingwhisperling: { name: "Mocking Whisperling", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_caperingdevilkin: { name: "Capering Devilkin", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_hexingcambion: { name: "Hexing Cambion", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_leeringpixie: { name: "Leering Pixie", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_brimstonedevilkin: { name: "Brimstone Devilkin", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_brimstonecambion: { name: "Brimstone Cambion", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_mockingnixie: { name: "Mocking Nixie", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_sulphurnixie: { name: "Sulphur Nixie", skin: 0xaa3a3a, outfit: 0x3a1018, head: "horns", wings: true, wingColor: 0x3a1018, tail: true, tex: "flesh", eyeColor: 0xff3a00 },
        fk_disgracedbot: { name: "Disgraced Bot", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_veterangoon: { name: "Veteran Goon", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_backalleybot: { name: "Back-Alley Bot", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_bogstandardsharpshooter: { name: "Bog-Standard Sharpshooter", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_bogstandardmarauder: { name: "Bog-Standard Marauder", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_rustedtinker: { name: "Rusted Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_twitchydrone: { name: "Twitchy Drone", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff, wpnR: "staff" },
        fk_scrapsentry: { name: "Scrap Sentry", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_grizzledbot: { name: "Grizzled Bot", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_bogstandardtinker: { name: "Bog-Standard Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_grizzledtinker: { name: "Grizzled Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_hiredtinker: { name: "Hired Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_scrapbot: { name: "Scrap Bot", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_renegadedrone: { name: "Renegade Drone", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_conscriptautomaton: { name: "Conscript Automaton", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        fk_maskedraider: { name: "Masked Raider", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff, wpnR: "axe" },
        fk_overclockedraider: { name: "Overclocked Raider", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff, wpnR: "axe" },
        fk_salvagedsentry: { name: "Salvaged Sentry", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, tex: "metal", glow: true, eyeColor: 0x66ccff },
        // ── Auto-generated bespoke configs for remaining shared enemies ──
        fk_overclockedpoacher: { name: "Overclocked Poacher", skin: 0xb0a890, outfit: 0x6a5a3a, tex: "metal", eyeColor: 0x88ccff, wpnR: "bow" },
        fk_disgracedsharpshooter: { name: "Disgraced Sharpshooter", skin: 0xb0a890, outfit: 0x5a5a3a, tex: "flesh", eyeColor: 0x88ccff, wpnR: "bow" },
        fk_rustedbrawler: { name: "Rusted Brawler", skin: 0xb0a890, outfit: 0x4a5a4a, tex: "metal", eyeColor: 0x88ccff, wpnR: "gloves" },
        fk_overclockedenforcer: { name: "Overclocked Enforcer", skin: 0xb0a890, outfit: 0x5a3a3a, tex: "metal", eyeColor: 0x88ccff },
        fk_rustedraider: { name: "Rusted Raider", skin: 0xb0a890, outfit: 0x5a4a6a, tex: "metal", eyeColor: 0x88ccff, wpnR: "axe" },
        fk_twitchysharpshooter: { name: "Twitchy Sharpshooter", skin: 0xb0a890, outfit: 0x5a5a3a, tex: "flesh", eyeColor: 0x88ccff, wpnR: "bow" },
        fk_hiredpoacher: { name: "Hired Poacher", skin: 0xb0a890, outfit: 0x5a4a6a, tex: "flesh", eyeColor: 0x88ccff, wpnR: "bow" },
        fk_conscriptgoon: { name: "Conscript Goon", skin: 0xb0a890, outfit: 0x5a3a4a, tex: "flesh", eyeColor: 0x88ccff },
        fk_overclockedbrawler: { name: "Overclocked Brawler", skin: 0xb0a890, outfit: 0x5a5a3a, tex: "metal", eyeColor: 0x88ccff, wpnR: "gloves" },
        fk_maskedbruiser: { name: "Masked Bruiser", skin: 0xb0a890, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x88ccff, head: "hood" },
        fk_conscriptmarauder: { name: "Conscript Marauder", skin: 0xb0a890, outfit: 0x6a4a3a, tex: "flesh", eyeColor: 0x88ccff },
        fk_maskedoutlaw: { name: "Masked Outlaw", skin: 0xb0a890, outfit: 0x4a4a6a, tex: "flesh", eyeColor: 0x88ccff, head: "hood" },
        fk_conscriptbruiser: { name: "Conscript Bruiser", skin: 0xb0a890, outfit: 0x4a4a6a, tex: "flesh", eyeColor: 0x88ccff },
        fk_scrapgoon: { name: "Scrap Goon", skin: 0xb0a890, outfit: 0x4a5a4a, tex: "metal", eyeColor: 0x88ccff },
        fk_renegadeenforcer: { name: "Renegade Enforcer", skin: 0xb0a890, outfit: 0x5a3a3a, tex: "flesh", eyeColor: 0x88ccff },
        fk_renegadepoacher: { name: "Renegade Poacher", skin: 0xb0a890, outfit: 0x4a4a6a, tex: "flesh", eyeColor: 0x88ccff, wpnR: "bow" },
        // -- Bespoke per-enemy Folk split configs (flk_) --
        flk_festeringcorpse: { name: "Festering Corpse", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_rottinghusk: { name: "Rotting Husk", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "bow", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_frosttouchedthrall: { name: "Frost-Touched Thrall", skin: 0xaaccd8, outfit: 0x4a4438, wpnR: "bow", tex: "water", hunch: true, zombie: true, eyeColor: 0x66ddff },
        flk_cerementgravewalker: { name: "Cerement Gravewalker", skin: 0xaaccd8, outfit: 0x4a4438, wpnR: "fists", tex: "water", hunch: false, zombie: true, eyeColor: 0x66ddff },
        flk_restlesscadaver: { name: "Restless Cadaver", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_hollowbonepicker: { name: "Hollow Bonepicker", skin: 0xd8d0bc, outfit: 0x4a4438, wpnR: "sword", tex: "bone", hunch: true, bony: true, eyeColor: 0x88ddff },
        flk_restlessbonepicker: { name: "Restless Bonepicker", skin: 0xd8d0bc, outfit: 0x4a4438, wpnR: "sword", tex: "bone", hunch: true, bony: true, eyeColor: 0x88ddff },
        flk_hollowgravewalker: { name: "Hollow Gravewalker", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_hollowwight: { name: "Hollow Wight", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_graveyardshambler: { name: "Graveyard Shambler", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_restlesspallbearer: { name: "Restless Pallbearer", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_plaguecerecloth: { name: "Plague Cerecloth", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_mineslave: { name: "Mine Slave", skin: 0xa89070, outfit: 0x4a4038, wpnR: "pickaxe", tex: "stone", beard: 3811866, hunch: true, eyeColor: 0x333333 },
        flk_twitchytinker: { name: "Twitchy Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "staff", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_orccaptain: { name: "Orc Captain", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
        flk_conscriptbruiser: { name: "Conscript Bruiser", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "gloves", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_plaguecarrier: { name: "Plague Carrier", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
        flk_saltcuredmourner: { name: "Salt-Cured Mourner", skin: 0x8a9a6a, outfit: 0x4a4438, head: "hood", wpnR: "mace", tex: "green", robe: true, hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_cryptwight: { name: "Crypt Wight", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_sunkenhusk: { name: "Sunken Husk", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_hollowcharnelhound: { name: "Hollow Charnelhound", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_forgottencharnelhound: { name: "Forgotten Charnelhound", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_reanimatedguard: { name: "Reanimated Guard", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
        flk_witheredhusk: { name: "Withered Husk", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_graveboundmourner: { name: "Grave-Bound Mourner", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
        flk_touristskeleton: { name: "Tourist Skeleton", skin: 0xd8d0bc, outfit: 0x4a4438, wpnR: "sword", tex: "bone", hunch: false, bony: true, eyeColor: 0x88ddff },
        flk_plaguehusk: { name: "Plague Husk", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_cerementboneknight: { name: "Cerement Boneknight", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
        flk_restlessthrall: { name: "Restless Thrall", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_witheredthrall: { name: "Withered Thrall", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_forgottenboneknight: { name: "Forgotten Boneknight", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
        flk_undeadarcher: { name: "Undead Archer", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "bow", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_saltcuredwight: { name: "Salt-Cured Wight", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_cerementbonepicker: { name: "Cerement Bonepicker", skin: 0xaaccd8, outfit: 0x4a4438, wpnR: "sword", tex: "water", hunch: false, bony: true, eyeColor: 0x66ddff },
        flk_gildedthrall: { name: "Gilded Thrall", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_banditchief: { name: "Bandit Chief", scale: 2.3, skin: 0xc8a070, outfit: 0x5a2a2a, head: "helmet", headColor: 0x6a6a52, wpnR: "sword", tex: "flesh", beard: 3811866, eyeColor: 0x333333 },
        flk_overclockedenforcer: { name: "Overclocked Enforcer", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_banditgrunt: { name: "Bandit Grunt", scale: 2.2, skin: 0xc8a070, outfit: 0x4a3a2a, wpnR: "sword", tex: "flesh", beard: 3811866, eyeColor: 0x333333 },
        flk_hiredpoacher: { name: "Hired Poacher", scale: 2.3, skin: 0xc8a070, outfit: 0x5a2a2a, head: "helmet", headColor: 0x6a6a52, wpnR: "sword", tex: "flesh", beard: 3811866, eyeColor: 0x333333 },
        flk_banditrogue: { name: "Bandit Rogue", skin: 0xc8a070, outfit: 0x2a2a30, head: "hood", headColor: 0x1a1a20, wpnR: "dagger", tex: "void", eyeColor: 0x66ccff },
        flk_salvagedoutlaw: { name: "Salvaged Outlaw", skin: 0xc8a070, outfit: 0x2a2a30, head: "hood", headColor: 0x1a1a20, wpnR: "dagger", tex: "void", eyeColor: 0x66ccff },
        flk_overclockedpoacher: { name: "Overclocked Poacher", skin: 0xc8a070, outfit: 0x3a4a2a, head: "hood", headColor: 0x2a3a1a, wpnR: "bow", tex: "foliage", eyeColor: 0x333333 },
        flk_renegadeoutlaw: { name: "Renegade Outlaw", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_bogstandardtinker: { name: "Bog-Standard Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "staff", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_salvagedsentry: { name: "Salvaged Sentry", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "mace", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_banditscout: { name: "Bandit Scout", skin: 0xc8a070, outfit: 0x2a2a30, head: "hood", headColor: 0x1a1a20, wpnR: "dagger", tex: "void", eyeColor: 0x66ccff },
        flk_twitchysharpshooter: { name: "Twitchy Sharpshooter", skin: 0xc8a070, outfit: 0x3a4a2a, head: "hood", headColor: 0x2a3a1a, wpnR: "bow", tex: "foliage", eyeColor: 0x333333, accent: 0x88e0ff },
        flk_maskedbruiser: { name: "Masked Bruiser", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_renegadepoacher: { name: "Renegade Poacher", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "gloves", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_backalleysharpshooter: { name: "Back-Alley Sharpshooter", skin: 0xc8a070, outfit: 0x3a4a2a, head: "hood", headColor: 0x2a3a1a, wpnR: "bow", tex: "foliage", eyeColor: 0x333333 },
        flk_drownedrevenant: { name: "Drowned Revenant", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_saltcuredcerecloth: { name: "Salt-Cured Cerecloth", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_restlesscharnelhound: { name: "Restless Charnelhound", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_witheredmourner: { name: "Withered Mourner", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
        flk_gildedrevenant: { name: "Gilded Revenant", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_gnometinkerer: { name: "Gnome Tinkerer", scale: 1.7, skin: 0xc8a070, outfit: 0x6a6048, head: "conehat", headColor: 0xcc2222, wpnR: "mace", tex: "metal", beard: 14540236, accent: 0xffcc44 },
        flk_conscriptgoon: { name: "Conscript Goon", scale: 2.2, skin: 0xc8a070, outfit: 0x3a4a5a, wpnR: "gloves", tex: "flesh", beard: 3811866, eyeColor: 0x333333 },
        flk_conscriptmarauder: { name: "Conscript Marauder", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "axe", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_murkwallowghoul: { name: "Murkwallow Ghoul", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_forgottencadaver: { name: "Forgotten Cadaver", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_witheredcharnelhound: { name: "Withered Charnelhound", skin: 0xaaccd8, outfit: 0x4a4438, wpnR: "fists", tex: "water", hunch: true, zombie: true, eyeColor: 0x66ddff },
        flk_restlessgravewalker: { name: "Restless Gravewalker", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_saltcuredgravewalker: { name: "Salt-Cured Gravewalker", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_mummifiedgravewalker: { name: "Mummified Gravewalker", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_cinderwrappedwight: { name: "Cinder-Wrapped Wight", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_ogrebrute: { name: "Ogre Brute", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_bogstandardmarauder: { name: "Bog-Standard Marauder", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "crossbow", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_rustedtinker: { name: "Rusted Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "gloves", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_renegadeenforcer: { name: "Renegade Enforcer", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "gloves", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_overclockedraider: { name: "Overclocked Raider", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "axe", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_ogrecrusher: { name: "Ogre Crusher", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_rustedraider: { name: "Rusted Raider", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_rattlingremains: { name: "Rattling Remains", skin: 0xd8d0bc, outfit: 0x4a4438, wpnR: "sword", tex: "bone", hunch: false, bony: true, eyeColor: 0x88ddff },
        flk_cryptbonepicker: { name: "Crypt Bonepicker", skin: 0xd8d0bc, outfit: 0x4a4438, wpnR: "sword", tex: "bone", hunch: false, bony: true, eyeColor: 0x88ddff },
        flk_graveboundgravewalker: { name: "Grave-Bound Gravewalker", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: false, zombie: true, eyeColor: 0xaacc44 },
        flk_graveboundboneknight: { name: "Grave-Bound Boneknight", skin: 0xd8d0bc, outfit: 0x4a4438, head: "helmet", headColor: 0x6a6a72, wpnR: "sword", tex: "bone", hunch: true, bony: true, eyeColor: 0x88ddff },
        flk_sunkengravewalker: { name: "Sunken Gravewalker", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
        flk_cryptrevenant: { name: "Crypt Revenant", skin: 0x8a9a6a, outfit: 0x4a4438, wpnR: "fists", tex: "green", hunch: true, zombie: true, eyeColor: 0xaacc44 },
        flk_stealthyoperative: { name: "Stealthy Operative", skin: 0xc8a070, outfit: 0x2a2a30, head: "hood", headColor: 0x1a1a20, wpnR: "dagger", tex: "void", eyeColor: 0x66ccff },
        flk_bogstandardsharpshooter: { name: "Bog-Standard Sharpshooter", skin: 0xc8a070, outfit: 0x3a4a2a, head: "hood", headColor: 0x2a3a1a, wpnR: "bow", tex: "foliage", eyeColor: 0x333333 },
        flk_overclockedbrawler: { name: "Overclocked Brawler", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_maskedraider: { name: "Masked Raider", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "axe", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_streetbrawler: { name: "Street Brawler", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_conscriptraider: { name: "Conscript Raider", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "axe", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_veterangoon: { name: "Veteran Goon", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "mace", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_scrapraider: { name: "Scrap Raider", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "axe", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_rustedbrawler: { name: "Rusted Brawler", scale: 2.5, skin: 0x9aac7a, outfit: 0x5a4a30, wpnR: "club", tex: "green", eyeColor: 0xcc6622 },
        flk_bogstandardgoon: { name: "Bog-Standard Goon", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "mace", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_scrapsentry: { name: "Scrap Sentry", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "axe", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_hiredtinker: { name: "Hired Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "staff", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_scrapgoon: { name: "Scrap Goon", scale: 2.2, skin: 0xc8a070, outfit: 0x3a4a5a, wpnR: "gloves", tex: "flesh", beard: 3811866, eyeColor: 0x333333 },
        flk_thor: { name: "Thor", scale: 2.4, skin: 0xe0c8a8, outfit: 0x8a2a2a, head: "horns", headColor: 0xb0b8c0, wpnR: "mace", tex: "metal", beard: 15257744, eyeColor: 0x88ddff, accent: 0x88ddff },
        flk_disgracedsharpshooter: { name: "Disgraced Sharpshooter", skin: 0xc8a070, outfit: 0x3a4a2a, head: "hood", headColor: 0x2a3a1a, wpnR: "bow", tex: "foliage", eyeColor: 0x333333, accent: 0x88e0ff },
        flk_grizzledtinker: { name: "Grizzled Tinker", skin: 0x8a8f98, outfit: 0x55606a, head: "helmet", headColor: 0x6a7079, wpnR: "crossbow", tex: "metal", glow: true, eyeColor: 0x66ccff },
        flk_maskedoutlaw: { name: "Masked Outlaw", skin: 0xc8a070, outfit: 0x2a2a30, head: "hood", headColor: 0x1a1a20, wpnR: "dagger", tex: "void", eyeColor: 0x66ccff },
        flk_shadowblade: { name: "Shadow Blade", skin: 0xc8a070, outfit: 0x2a2a30, head: "hood", headColor: 0x1a1a20, wpnR: "dagger", tex: "void", eyeColor: 0x66ccff },
        flk_mountaindevastator: { name: "Mountain Devastator", skin: 0xc8a070, outfit: 0x3a3028, wpnR: "sword", tex: "flesh", eyeColor: 0x333333 },
    };

    class FolkBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const cfg = CONFIGS[creatureType] || CONFIGS.banditgrunt;
            const profile = {
                variant: creatureType, scale: cfg.scale || 2.1, texturePool: cfg.tex || 'flesh',
                bodyColor: cfg.skin || 0xc8a888, accent: cfg.accent || 0x884422,
                hue: [0.08, 0.05], sat: [0.30, 0.12], lit: [0.5, 0.1]
            };
            super(scale, offsetY, battler, profile, 0, creatureType || 'banditgrunt');
            this.cfg = cfg;
            this.variant = creatureType;
            this._materials = [];
            this._baseY = null;
            this.facingYaw = 0;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.5 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.55 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(0xf4f4f4, 1.0, 0.2));
            eye.position.set(x, y, z);
            const pup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 6, 6), this._mat(accent || 0x222222, 1.0, 0.2, (accent && accent !== 0x222222 && accent !== 0x111111) ? accent : null)); pup.position.set(0, 0, r * 0.6); eye.add(pup);
            parent.add(eye); return eye;
        }

        _weapon(type, cfg) {
            const steel = this._mat(0x9aa0aa, 1, 0.4), wood = this._mat(0x5a3a20, 1, 0.7), dark = this._mat(0x2a2a2a, 1, 0.4);
            const accentMat = this._mat(cfg.accent || 0x884422, 1, 0.2, cfg.accent);
            let w = new THREE.Group();
            switch (type) {
                case 'sword': { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.02), steel); bl.position.y = 0.4; w.add(bl); const gd = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), wood); gd.position.y = 0.08; w.add(gd); break; }
                case 'dagger': { const bl = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 4), steel); bl.position.y = 0.2; w.add(bl); break; }
                case 'axe': { const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), wood); haft.position.y = 0.3; w.add(haft); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.02), steel); blade.position.set(0.12, 0.56, 0); w.add(blade); break; }
                case 'mace': { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), wood); sh.position.y = 0.3; w.add(sh); const hd = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), steel); hd.position.y = 0.62; w.add(hd); break; }
                case 'club': { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.05, 0.7, 8), wood); c.position.y = 0.35; w.add(c); break; }
                case 'staff': { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), wood); rod.position.y = 0.4; w.add(rod); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), accentMat); orb.position.y = 0.96; w.add(orb); w._orb = orb; break; }
                case 'bow': { const arc = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 6, 16, Math.PI * 1.2), wood); arc.rotation.z = Math.PI / 2 + 0.9; w.add(arc); const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.62, 3), this._mat(0xddddcc, 1, 0.5)); w.add(str); break; }
                case 'crossbow': { const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), wood); w.add(stock); const limb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.03), wood); limb.position.y = 0.16; w.add(limb); break; }
                case 'spear': { const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), wood); haft.position.y = 0.45; w.add(haft); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), steel); tip.position.y = 1.1; w.add(tip); break; }
                case 'halberd': { const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6), wood); haft.position.y = 0.5; w.add(haft); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.02), steel); blade.position.set(0.13, 1.0, 0); w.add(blade); const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5), steel); spike.position.y = 1.3; w.add(spike); break; }
                case 'pickaxe': { const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), wood); haft.position.y = 0.3; w.add(haft); const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), steel); head.position.y = 0.6; head.rotation.z = 0.3; w.add(head); break; }
                case 'lute': { const bodyL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), wood); bodyL.scale.set(1, 1, 0.5); bodyL.position.y = 0.1; w.add(bodyL); const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), wood); neck.position.y = 0.4; w.add(neck); break; }
                case 'camera': { const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.1), dark); box.position.y = 0.1; w.add(box); const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), steel); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.1, 0.08); w.add(lens); break; }
                case 'gloves': case 'claws': { const fist = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), type === 'claws' ? this._skinMat(cfg.skin, 0.6) : this._mat(0x8a2a2a, 1, 0.6)); w.add(fist); if (type === 'claws') for (const cx of [-0.05, 0, 0.05]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), this._mat(0xeeeeee, 1, 0.3)); claw.position.set(cx, 0, 0.1); claw.rotation.x = 1.4; w.add(claw); } break; }
                default: return null;
            }
            return w;
        }

        // Put a weapon in a hand. Weapons are modelled along +Y with the grip at
        // the origin, so parenting one to the arm at the wrist used to run the
        // whole shaft straight back UP the arm (a staff came out of the elbow).
        // The grip is offset out of the forearm's own axis, sideways (away from
        // the body) and forward, and tilted so the shaft diverges further the
        // higher it goes; the hand is nudged onto that grip so it still holds
        // it. `_rest` is the held-upright pose the poses interpolate from.
        // Fist-type "weapons" replace the hand and stay on the limb axis.
        _hold(arm, type, side, cfg) {
            const w = this._weapon(type, cfg);
            if (!w) return null;
            if (type === 'gloves' || type === 'claws') {
                w.position.set(0, GRIP_Y, 0.04);
            } else {
                w.position.set(side * 0.11, GRIP_Y, 0.09);
                w.rotation.set(0.12, 0, -side * 0.2);
                w._rest = w.rotation.clone();
                if (arm._hand) arm._hand.position.set(side * 0.075, GRIP_Y + 0.01, 0.06);
            }
            (arm._fore || arm).add(w);
            arm._weapon = w; arm._wpnType = type;
            return w;
        }

        // Static procedural hair from the shared core library (no bones, no
        // per-frame work). Falls back to the old plain cap if the core is older
        // than the hair module.
        _buildHair(g, cfg) {
            // No roll (a bare-boned body kept its configured head): fall back to
            // the literal style the config asked for.
            const style = cfg.hair || (cfg.head === 'mohawk' ? 'mohawk' : 'short');
            if (style === 'bald') return;
            const H = window.Battler3D && window.Battler3D.Hair;
            const col = cfg.hairColor != null ? cfg.hairColor : (cfg.headColor || 0x3a2a1a);
            const mat = this._mat(col, 1, 0.85);
            const hair = H && H.build(style, HEAD_R, mat);
            if (hair) { g.add(hair); return; }
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.7), mat);
            cap.position.y = 0.06; g.add(cap);
        }

        _headgear(g, cfg) {
            const c = cfg.headColor || 0x3a2a1a;
            switch (cfg.head) {
                case 'hood': { const hood = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), this._mat(c, 1, 0.8)); hood.position.y = 0.04; g.add(hood); const drape = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.4, 10, 1, true), this._mat(c, 1, 0.8)); drape.position.y = -0.12; g.add(drape); break; }
                case 'helmet': { const helm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), this._mat(c, 1, 0.4)); helm.position.y = 0.03; g.add(helm); const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), this._mat(c, 1, 0.4)); nasal.position.set(0, -0.02, 0.26); g.add(nasal); break; }
                case 'hornhelm': { const helm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), this._mat(c, 1, 0.4)); helm.position.y = 0.03; g.add(helm); for (const hx of [-0.22, 0.22]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 6), this._mat(0xe8e0d0, 1, 0.5)); horn.position.set(hx, 0.12, 0); horn.rotation.z = hx > 0 ? -1.0 : 1.0; g.add(horn); } break; }
                case 'hat': { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), this._mat(c, 1, 0.7)); brim.position.y = 0.18; g.add(brim); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 12), this._mat(c, 1, 0.7)); cone.position.y = 0.44; g.add(cone); break; }
                case 'conehat': { const rc = cfg.headColor || 0xcc2222; const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 14), this._mat(rc, 1, 0.7)); cone.position.set(0.02, 0.46, 0); cone.rotation.z = -0.08; g.add(cone); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(rc, 1, 0.7)); tip.position.set(0.06, 0.86, 0); g.add(tip); break; }
                case 'wizardhat': { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 16), this._mat(c, 1, 0.8)); brim.position.y = 0.18; g.add(brim); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.66, 12), this._mat(c, 1, 0.8)); cone.position.set(0.04, 0.5, 0); cone.rotation.z = -0.2; g.add(cone); break; }
                case 'tophat': { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), this._mat(c, 1, 0.5)); brim.position.y = 0.2; g.add(brim); const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 16), this._mat(c, 1, 0.5)); top.position.y = 0.37; g.add(top); break; }
                case 'crown': { const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 12), this._mat(c, 1, 0.3, c)); cr.position.y = 0.22; g.add(cr); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), this._mat(c, 1, 0.3, c)); sp.position.set(Math.cos(a) * 0.26, 0.3, Math.sin(a) * 0.26); g.add(sp); } break; }
                case 'hair': case 'mohawk': this._buildHair(g, cfg); break;
                case 'horns': { for (const hx of [-0.16, 0.16]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.32, 6), this._mat(cfg.hornColor || 0xe8e0d0, 1, 0.5)); horn.position.set(hx, 0.18, 0); horn.rotation.z = hx > 0 ? -0.6 : 0.6; horn.rotation.x = -0.2; g.add(horn); } break; }
                default: break;
            }
        }

        _makeHead(cfg) {
            const g = new THREE.Group();
            const skin = this._skinMat(cfg.skin || 0xc8a888, 0.5);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skin); skull.scale.set(1, 1.1, 1); if (cfg.gaunt) skull.scale.set(0.92, 1.18, 0.92); g.add(skull);
            // Expressive, per-enemy face: jittered eye size + spacing, a brow set
            // to a random mood, and a mouth line.
            const er = 0.035 + this.idRand() * 0.025, esp = 0.085 + this.idRand() * 0.02;
            this._eye(g, -esp, 0.02, 0.2, er, cfg.eyeColor || 0x222222); this._eye(g, esp, 0.02, 0.2, er, cfg.eyeColor || 0x222222);
            const browMat = this._mat(cfg.beard || 0x2a1a10, 1, 0.8), browA = (this.idRand() - 0.5) * 0.8;
            for (const bx of [-esp, esp]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.03), browMat); brow.position.set(bx, 0.085 + Math.abs(bx === esp ? browA : -browA) * 0.04, 0.21); brow.rotation.z = (bx > 0 ? -browA : browA); g.add(brow); }
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08 + this.idRand() * 0.05, 0.018, 0.02), this._mat(cfg.zombie ? 0x2a1010 : 0x5a3a30, 1, 0.6)); mouth.position.set(0, -0.1, 0.21); mouth.rotation.z = (this.idRand() - 0.5) * 0.4; g.add(mouth);
            if (cfg.zombie) for (let i = 0; i < 3; i++) { const th = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), this._mat(0xe8e0d0, 1, 0.4)); th.position.set(-0.04 + i * 0.04, -0.08, 0.23); g.add(th); }
            if (cfg.snout) { const sn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 6), skin); sn.position.set(0, -0.05, 0.22); sn.rotation.x = Math.PI / 2; g.add(sn); }
            if (cfg.beard) { const bd = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 8), this._mat(cfg.beard, 1, 0.85)); bd.position.set(0, -0.22, 0.1); g.add(bd); }
            if (cfg.ears === 'cat') for (const ex of [-0.16, 0.16]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), skin); ear.position.set(ex, 0.24, 0); ear.rotation.z = ex * 1.2; g.add(ear); }
            if (cfg.ears === 'elf') for (const ex of [-0.24, 0.24]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), skin); ear.position.set(ex, 0.04, 0); ear.rotation.z = ex * 1.6; g.add(ear); }
            if (cfg.feathers) for (let i = 0; i < 5; i++) { const a = (i / 5 - 0.5) * 1.4; const fe = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 4), this._mat(cfg.accent || 0x66ffaa, 1, 0.5, cfg.accent)); fe.position.set(Math.sin(a) * 0.2, 0.3, -0.1); fe.rotation.z = -a; g.add(fe); }
            this._headgear(g, cfg);
            return g;
        }

        // Limbs hinge: the upper segment hangs off the shoulder/hip group and
        // everything below the elbow/knee lives in a nested group, so the arm
        // can FOLD. Rest geometry is unchanged (the sub-group just re-bases the
        // lower segment and the hand off ELBOW_Y).
        _limb(x, y, cfg, arm, sleeve) {
            const g = new THREE.Group();
            const skin = this._skinMat(cfg.skin || 0xc8a888, 0.6);
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.42, 7), sleeve); upper.position.y = -0.21; g.add(upper);
            const fore = new THREE.Group(); fore.position.y = ELBOW_Y; g.add(fore);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.4, 7), (arm && !cfg.robe) ? skin : sleeve); lower.position.y = -0.58 - ELBOW_Y; fore.add(lower);
            const end = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), arm ? skin : this._mat(0x2a2018, 1, 0.7)); end.position.y = -0.78 - ELBOW_Y; fore.add(end);
            g._fore = fore; g._hand = end;
            g.position.set(x, y, 0); g._x = x; g._arm = arm; this.bodyGroup.add(g); return g;
        }
        _tail(cfg) {
            const g = new THREE.Group(); const mat = this._skinMat(cfg.skin || 0xc8a888, 0.6); let py = 0;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.07 - i * 0.01, 8, 8), mat); seg.position.set(0, py, -0.12 * i - 0.1); g.add(seg); py -= 0.02; }
            if (cfg.tail === 'barb') { const barb = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 5), this._mat(0x2a1a14, 1, 0.5)); barb.position.set(0, -0.04, -0.72); barb.rotation.x = -Math.PI / 2; g.add(barb); }
            g.position.set(0, 0.85, -0.2); this.bodyGroup.add(g); return g;
        }
        _demonWing(side, cfg) {
            const g = new THREE.Group();
            const mat = this._mat(cfg.wingColor || 0x3a2030, 0.85, 0.7);
            const membrane = new THREE.Mesh(new THREE.CircleGeometry(0.5, 3), mat); membrane.scale.set(1, 0.95, 1); membrane.position.x = side * 0.4; g.add(membrane);
            for (let i = 0; i < 3; i++) { const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), mat); rib.position.set(side * (0.2 + i * 0.18), 0.1 - i * 0.12, 0.01); rib.rotation.z = side * (0.5 - i * 0.35); g.add(rib); }
            g.position.set(side * 0.26, 1.35, -0.16); g.rotation.y = side * 0.5; g._side = side; this.bodyGroup.add(g); return g;
        }

        // Perturb an RGB hex per-enemy so a shared config never looks identical.
        _jit(hex, amt) {
            let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
            const f = () => 1 + (this.idRand() - 0.5) * 2 * amt;
            r = Math.max(0, Math.min(255, Math.round(r * f())));
            g = Math.max(0, Math.min(255, Math.round(g * f())));
            b = Math.max(0, Math.min(255, Math.round(b * f())));
            return (r << 16) | (g << 8) | b;
        }
        _enemyName() {
            try { const id = this.battler && this.battler.enemyId && this.battler.enemyId(); if (id && typeof $dataEnemies !== 'undefined' && $dataEnemies[id]) return String($dataEnemies[id].name || ''); } catch (e) {}
            return this.cfg && this.cfg.name || '';
        }
        // Build a per-enemy variant of the shared config: colour jitter + keyword
        // dressing parsed from the enemy's own name, so a 7-strong shared group
        // reads as seven distinct, description-fitting individuals.
        _varyCfg() {
            const c = Object.assign({}, this.cfg);
            c.skin = this._jit(c.skin || 0xc8a888, 0.10);
            c.outfit = this._jit(c.outfit || 0x5a4030, 0.18);
            if (c.headColor) c.headColor = this._jit(c.headColor, 0.16);
            const nm = this._enemyName().toLowerCase();
            const has = w => nm.indexOf(w) >= 0;
            const re = rx => rx.test(nm);
            if (has('cinder') || has('ember') || has('ashen') || has('charred') || has('scorch')) { c.outfit = 0x2a221c; c.accent = 0xff6622; c.emberGlow = true; }
            if (has('salt-cured') || has('frost') || has('frozen') || has('rime') || has('glacial') || has('winter') || has('ice')) { c.skin = this._jit(0xbcc8d0, 0.06); c.accent = 0x88e0ff; }
            if (has('gilded') || has('golden')) { c.accent = 0xffcc44; c.goldTrim = true; }
            if (has('mummified') || has('cerement') || has('cerecloth') || has('bandage')) { c.bandages = true; c.skin = this._jit(0xcabd92, 0.08); }
            if (has('hollow') || has('gaunt') || has('starv')) { c.gaunt = true; c.eyeColor = c.eyeColor || 0x66ffaa; }
            if (has('crypt') || has('grave') || has('sunken') || has('murk') || has('bog') || has('mire')) { c.skin = this._jit(0x7a8a6a, 0.08); c.mossy = true; }
            if (has('plague') || has('festering') || has('rotting') || has('pustul') || has('pox')) { c.boils = true; c.skin = this._jit(0x8a9a64, 0.08); }
            if (has('withered') || has('forgotten') || has('restless') || has('lost') || has('tattered') || has('ragged')) c.tattered = true;
            if (has('blood') || has('crimson') || has('scarlet') || has('gore')) c.accent = 0xcc2233;
            if (has('shadow') || has('umbral') || has('void') || has('nether') || has('dusk') || has('night')) { c.outfit = this._jit(0x20202a, 0.2); c.accent = c.accent || 0x9933cc; }
            if (re(/(gravewalker|wight|cadaver|bonepicker|boneknight|husk|thrall|revenant|pallbearer|mourner|charnelhound|skeleton|lich|ghoul|corpse)/)) c.zombie = true;
            if (re(/(boneknight|sentinel|guard|warden)/) && !c.head) { c.head = 'helmet'; c.headColor = c.headColor || 0x6a6a72; }
            if (re(/(charnelhound|skulk|hunch|crawl)/)) c.hunch = true;
            if (re(/(mourner|pallbearer|cerecloth|priest|cleric|acolyte)/)) c.robe = true;
            c._extra = (this.idRand() * 4) | 0;
            this._rollHair(c);
            this._vcfg = c;
            return c;
        }

        // Procedural hair replaces the old one-helmet-fits-all (and the bare
        // scalp). Rolled off idRand, which is keyed to the enemy id + the world
        // seed, so every enemy id of a species keeps its own hair and a new
        // world seed re-rolls the whole cast. Narrative headgear (hood, wizard
        // hat, crown, horns, ...) is left alone -- it is the silhouette that
        // makes those enemies readable. 'helmet' stays in the pool, so an
        // armoured head is now one roll among many instead of the default.
        _rollHair(c) {
            const H = window.Battler3D && window.Battler3D.Hair;
            if (!H || HAIR_HEADS.indexOf(c.head || 'none') < 0) return;
            // Bare bone / stone / metal bodies grow nothing: they keep whatever
            // head they were configured with (a bare skull, or a helmet on it).
            if (c.bony || c.rocky || BALD_TEX.indexOf(c.tex) >= 0) return;
            const roll = H.roll(() => this.idRand(), { exotic: !!c.glow });
            c.hair = roll.style;
            c.hairColor = roll.color;
            c.head = (roll.style === 'helmet') ? 'helmet' : 'hair';
            if (c.beard) c.beard = roll.color;   // facial hair matches the scalp
        }
        // Per-enemy extra clothing/flesh detail attached to the torso (FK + dismember-safe).
        _extraDressing(cfg) {
            const T = this.torso;
            if (cfg.bandages) { const bm = this._mat(0xcabd92, 1, 0.9); for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.27 - i * 0.005, 0.03, 5, 12), bm); w.position.y = 0.22 - i * 0.13; w.rotation.x = Math.PI / 2 + (this.idRand() - 0.5) * 0.3; T.add(w); } }
            if (cfg.boils) { const bo = this._mat(cfg.accent && cfg.accent !== 0x884422 ? cfg.accent : 0x9acc4a, 1, 0.5); for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04 + this.idRand() * 0.04, 7, 6), bo); b.position.set((this.idRand() - 0.5) * 0.42, (this.idRand() - 0.5) * 0.6, 0.22 + this.idRand() * 0.08); T.add(b); } }
            if (cfg.mossy) { const mo = this._mat(0x4a6a3a, 1, 0.95); for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), mo); m.scale.set(1.4, 0.4, 1); m.position.set((this.idRand() - 0.5) * 0.4, (this.idRand() - 0.5) * 0.5, 0.24); T.add(m); } }
            if (cfg.tattered) { const tm = this._mat(cfg.outfit || 0x4a4040, 1, 0.85); for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const strip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28 + this.idRand() * 0.2, 3), tm); strip.position.set(Math.cos(a) * 0.26, -0.42, Math.sin(a) * 0.26); strip.rotation.x = Math.PI; T.add(strip); } }
            if (cfg.goldTrim) { const gt = this._mat(0xffcc44, 1, 0.3, 0x4a3a08); const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 16), gt); band.position.y = 0.05; band.rotation.x = Math.PI / 2; T.add(band); }
            // Per-id accessory: 0 belt, 1 shoulder strap, 2 cape, 3 none.
            if (cfg._extra === 0) { const belt = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.04, 6, 14), this._mat(0x2a1a10, 1, 0.6)); belt.position.y = -0.18; belt.rotation.x = Math.PI / 2; T.add(belt); }
            else if (cfg._extra === 1) { const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), this._mat(0x3a2a1a, 1, 0.6)); strap.position.set(0, 0.0, 0.2); strap.rotation.set(0, 0, 0.6); T.add(strap); }
            else if (cfg._extra === 2) { const cape = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.95, 10, 1, true), this._mat(this._jit(cfg.outfit || 0x4a3030, 0.2), 0.95, 0.8)); cape.position.set(0, -0.32, -0.16); T.add(cape); }
        }

        _build() {
            const cfg = this._varyCfg();
            const cloth = this._mat(cfg.outfit || 0x5a4030, 1, 0.78);
            const pants = this._mat(cfg.pants || 0x3a2a1a, 1, 0.78);
            // Torso (+ robe skirt).
            this.torso = new THREE.Group();
            const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.7, 10), cloth); this.torso.add(chest);
            if (cfg.robe) { const robe = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.05, 12, 1, true), cloth); robe.position.y = -0.4; this.torso.add(robe); }
            if (cfg.rocky) for (let i = 0; i < 5; i++) { const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), cloth); rock.position.set((this.idRand() - 0.5) * 0.4, (this.idRand() - 0.5) * 0.5, 0.2); this.torso.add(rock); }
            this.torso.position.set(0, cfg.hunch ? 1.0 : 1.1, 0); if (cfg.hunch) this.torso.rotation.x = 0.3; this.bodyGroup.add(this.torso);
            // Head(s).
            const headY = (cfg.hunch ? 1.42 : 1.55);
            this.head = this._makeHead(cfg); this.head.position.set(0, headY, cfg.hunch ? 0.12 : 0);
            if (cfg.twoHead) { this.head.position.x = -0.18; this.head2 = this._makeHead(cfg); this.head2.position.set(0.18, headY, 0); this.bodyGroup.add(this.head2); }
            this.bodyGroup.add(this.head);
            // Arms + legs.
            this.leftArm = this._limb(-0.33, 1.35, cfg, true, cloth); this.rightArm = this._limb(0.33, 1.35, cfg, true, cloth);
            this.leftLeg = this._limb(-0.13, 0.72, cfg, false, pants); this.rightLeg = this._limb(0.13, 0.72, cfg, false, pants);
            // Weapons in hands.
            if (cfg.wpnR) this._hold(this.rightArm, cfg.wpnR, 1, cfg);
            if (cfg.wpnL) this._hold(this.leftArm, cfg.wpnL, -1, cfg);
            if (cfg.tail) this.tail = this._tail(cfg);
            if (cfg.wings) { this.leftWing = this._demonWing(-1, cfg); this.rightWing = this._demonWing(1, cfg); }
            // Per-enemy build (gaunt/burly) + description-driven extra dressing.
            const bw = (this.bulkMul || 1) * (cfg.gaunt ? 0.78 : 1);
            this.torso.scale.x *= bw; this.torso.scale.z *= bw;
            [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach(l => { if (l) { l.scale.x *= bw; l.scale.z *= bw; } });
            if (this.headMul) { this.head.scale.multiplyScalar(this.headMul); if (this.head2) this.head2.scale.multiplyScalar(this.headMul); }
            this._extraDressing(cfg);
            // Per-id idle lean for a touch more individuality.
            this._leanZ = (this.idRand() - 0.5) * 0.06;
            // Part map (humanoid keys).
            this._partMeshMap = {};
            ['HEAD', 'SKULL', 'BRAIN', 'FACE', 'HELMET', 'HAT', 'HORNS', 'TEETH', 'MOUTH', 'BEARD'].forEach(k => this._partMeshMap[k] = this.head);
            ['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'PELVIS', 'MASS', 'ROBE', 'CHESTPLATE', 'HEART'].forEach(k => this._partMeshMap[k] = this.torso);
            ['LEFT_ARM', 'LEFT_UPPER_ARM', 'LEFT_FOREARM', 'LEFT_HAND', 'PAULDRON_LEFT'].forEach(k => this._partMeshMap[k] = this.leftArm);
            ['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'RIGHT_FOREARM', 'RIGHT_HAND', 'CLAWS', 'ARM_CANNON'].forEach(k => this._partMeshMap[k] = this.rightArm);
            ['LEFT_LEG', 'LEFT_THIGH', 'LEFT_SHIN', 'LEFT_FOOT', 'GREAVES_LEFT'].forEach(k => this._partMeshMap[k] = this.leftLeg);
            ['RIGHT_LEG', 'RIGHT_THIGH', 'RIGHT_SHIN', 'RIGHT_FOOT', 'GREAVES_RIGHT'].forEach(k => this._partMeshMap[k] = this.rightLeg);
            if (this.leftWing) { this._partMeshMap.LEFT_WING = this.leftWing; this._partMeshMap.RIGHT_WING = this.rightWing; }
            const heads = [this.head, this.head2].filter(Boolean);
            const extra = [this.tail, this.leftWing, this.rightWing].filter(Boolean);
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE'], hide: [this.torso, ...heads, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, ...extra] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: heads },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [this.rightLeg] },
                this.leftWing ? { gone: ['LEFT_WING'], hide: [this.leftWing] } : null,
                this.rightWing ? { gone: ['RIGHT_WING'], hide: [this.rightWing] } : null,
            ].filter(Boolean);
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            this._build();
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // Pose one arm chain: shoulder swing (x) + raise (z), the elbow hinge,
        // and the held weapon. `swing` 0..1 blends the weapon from "held
        // upright" (counter-rotated against the arm chain so the shaft stays
        // vertical however the arm moves) to "extended out past the fist", so a
        // slash leads with the blade instead of dragging the shaft sideways.
        _setArm(arm, rx, rz, elbow, swing) {
            if (!arm) return;
            arm.rotation.x = rx; arm.rotation.z = rz;
            if (arm._fore) arm._fore.rotation.x = elbow;
            const w = arm._weapon;
            if (!w || !w._rest) return;
            const up = w._rest.x - (rx + elbow), k = swing || 0;
            w.rotation.x = up + (WEAPON_OUT - up) * k;
            w.rotation.z = w._rest.z * (1 - k);
        }

        // Swing progress for a slash cycle: <0 winding up, 1 fully followed
        // through, easing back to a 0 guard. `phase` offsets the cycle so a
        // second armed hand alternates instead of mirroring.
        _slashK(t, phase) {
            const p = ((t / SLASH_PERIOD + (phase || 0)) % 1 + 1) % 1;
            const e = u => u * u * (3 - 2 * u);
            if (p < 0.32) return -0.35 * e(p / 0.32);
            if (p < 0.58) return -0.35 + 1.35 * e((p - 0.32) / 0.26);
            return 1 - e((p - 0.58) / 0.42);
        }

        // Diagonal downward slash. The shoulder and the elbow drive it TOGETHER:
        // wound up (k<0) the upper arm is back and the elbow folded hard so the
        // weapon is cocked high and outside; through the strike the shoulder
        // swings down and across the body while the elbow extends, so the hand
        // travels a real arc instead of the whole limb pivoting as one plank.
        _armSlash(arm, side, k, swing) {
            this._setArm(arm, -0.072 - 0.778 * k, side * (0.376 - 0.926 * k), 1.704 * (k - 1), swing);
        }

        _poseArms(anim, t, dt) {
            const armedL = !!(this.leftArm && this.leftArm._weapon && this.leftArm._weapon._rest);
            const ranged = (this.rightArm && (this.rightArm._wpnType === 'bow' || this.rightArm._wpnType === 'crossbow'));
            // Weapons only ride out past the fist while swinging; ease in and out
            // of that so raising and lowering the weapon reads as a motion.
            const want = (anim === 'attack' && !ranged) ? 1 : 0;
            if (this._swing === undefined) this._swing = want;
            this._swing += (want - this._swing) * Math.min(1, (dt || 0.016) * 14);
            if (anim === 'attack' && !ranged) {
                const k = this._slashK(t, 0);
                this._armSlash(this.rightArm, 1, k, this._swing);
                // Off hand alternates its own slash when armed, else guards.
                if (armedL) this._armSlash(this.leftArm, -1, this._slashK(t, 0.5), this._swing);
                else this._setArm(this.leftArm, 0.25 - k * 0.2, -0.3, -0.9, this._swing);
                if (this.torso) this.torso.rotation.y = -k * 0.26;
                return;
            }
            if (anim === 'attack') {
                // Bow/crossbow: hold the weapon out at the target and draw the
                // off hand back. Swinging it like a sword never read right.
                const draw = 0.5 + Math.sin(t * 5) * 0.5;
                this._setArm(this.rightArm, -1.25, 0.06, -0.18, this._swing);
                this._setArm(this.leftArm, -0.95 + draw * 0.25, -0.22, -0.5 - draw * 0.9, this._swing);
                if (this.torso) this.torso.rotation.y = 0.18;
                return;
            }
            if (anim === 'specialattack') {
                // Channelling: weapon arm raised with a folded elbow so the
                // staff is held ALOFT (the grip counter-rotation keeps the shaft
                // upright), off hand tracing sigils, fine tremor throughout.
                const q = Math.sin(t * 7) * 0.06;
                this._setArm(this.rightArm, -0.62 + q, 0.5, -1.32 - q, this._swing);
                this._setArm(this.leftArm, -0.5 - q, -0.42, -1.15 + q, this._swing);
                if (this.torso) this.torso.rotation.y = Math.sin(t * 3.5) * 0.05;
                return;
            }
            const sway = Math.sin(t * 1.6) * 0.12, bend = Math.sin(t * 1.6) * 0.05;
            this._setArm(this.leftArm, sway, -0.06, -0.22 + bend, this._swing);
            this._setArm(this.rightArm, -sway, 0.06, -0.22 - bend, this._swing);
            if (this.torso) this.torso.rotation.y = 0;
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime, anim = this.currentAnimation, cfg = this.cfg;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.02 * this.scale;
            // Both legs severed: this biped topples and keeps animating on the
            // ground (applied at the end, once the pose below is finished).
            const prone = this._updateProne(deltaTime);
            // Idle breathing; the arms/weapons are posed as a chain.
            if (this.torso) this.torso.rotation.z = (this._leanZ || 0) + Math.sin(t * 1.4) * 0.02;
            this._poseArms(anim, t, deltaTime);
            if (this.head) this.head.rotation.y = Math.sin(t * 1.1) * 0.12;
            if (this.head2) this.head2.rotation.y = Math.sin(t * 1.1 + 1.5) * 0.16;
            if (this.tail) this.tail.rotation.y = Math.sin(t * 2.2) * 0.3;
            if (this.leftWing) this.leftWing.rotation.y = 0.5 + Math.sin(t * (fast ? 12 : 6)) * 0.4;
            if (this.rightWing) this.rightWing.rotation.y = -0.5 - Math.sin(t * (fast ? 12 : 6)) * 0.4;
            // Caster glow.
            if (this.rightArm && this.rightArm._weapon && this.rightArm._weapon._orb) this.rightArm._weapon._orb.material.emissiveIntensity = (fast ? 1.6 : 0.7) + Math.sin(t * 5) * 0.4;
            if (cfg && cfg.glow && this.torso) { /* faint shimmer handled by emissive on accents */ }
            if (prone > 0) this._applyProne(prone, this._baseY);
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.2);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.3 * this.scale;
            // Already lying down (both legs severed): keep the prone roll rather
            // than crumpling a second time from upright.
            if (!this._proneT) this.model.rotation.z = prog * 1.2; // crumples
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new FolkBattler3D(scale, offsetY, enemy, weaponType, key);

    // Literal NAMED block (also parsed by scripts/gen_3d_models_doc.js).
    const NAMED = {
        orccaptain: [], bloodaxeraider: ["Bloodaxe Raider"], reanimatedguard: [],
        touristskeleton: [], elvenbladesinger: ["Elven Bladesinger"], elvenflameweaver: ["Elven Flame Weaver"],
        bihuman: ["Bi Human"], doublesinger: ["Double Singer"], cavegnome: ["Cave Gnome"],
        bonesentinel: ["Bone Sentinel"], stoneshifter: ["Stone Shifter"], banditarcher_rep: ["Bandit Archer"], banditbard_rep: ["Bandit Bard"],
        abandonednovice: ["Abandoned Novice"], apprenticepyro: ["Apprentice Pyromancer"], bloodinitiate: ["Blood Initiate"],
        cultistacolyte: ["Cultist Acolyte"], forestpoacher: ["Forest Poacher"], marshskulk: ["Marsh Skulk"],
        mineslave: [], noviceboxer: ["Novice Boxer"], pitfighter: ["Pit Fighter"], plaguecarrier: [],
        skybard: ["Sky Bard"], snowwerewolf: ["Snow Werewolf"], swampwitchnovice: ["Swamp Witch Novice"],
        toothratkin: ["Tooth Ratkin"], youngogre: ["Young Ogre"], amateurpugilist: ["Amateur Pugilist"], banditassassin: ["Bandit Assassin"],
        banditchief: [], banditcleric: ["Bandit Cleric"], banditcrossbowman: ["Bandit Crossbowman"], banditgrunt: [],
        banditmage: ["Bandit Mage"], banditpyromancer: ["Bandit Pyromancer"], banditrogue: [], banditscout: [],
        chicchanshaman: ["Chicchan Serpent Shaman"],
        apprenticesremains: ["Apprentice's Remains"], armoredremains: ["Armored Remains"], boneyardhunter: ["Boneyard Hunter"],
        decayingcorpse: ["Decaying Corpse"], fallenwarrior: ["Fallen Warrior"], festeringcorpse: [],
        forgottenacolyte: ["Forgotten Acolyte"], frosttouchedthrall: [], graveyardshambler: [],
        tombguardian: ["Tomb Guardian"], undeadarcher: [], zombievillager: ["Zombie Villager"], drownedrevenant: [],
        elvenfrostmage: ["Elven Frost Mage"], elvengeomancer: ["Elven Geomancer"], elvenhighmage: ["Elven High Mage"], elvenmystic: ["Elven Mystic"],
        elvenrangercaptain: ["Elven Ranger Captain"], elvenroyalguard: ["Elven Royal Guard"], elvenscout: ["Elven Scout"], elvensharpshooter: ["Elven Sharpshooter"],
        elvenswordmaster: ["Elven Swordmaster"], embercaster: ["Ember Caster"], frostapprentice: ["Frost Apprentice"], frostweaver: ["Frost Weaver"],
        haloacolyte: ["Halo Acolyte"], luminousdeacon: ["Luminous Deacon"], murkwallowghoul: [], noviceillusionist: ["Novice Illusionist"],
        novicepaladin: ["Novice Paladin"], ogrebrute: [], ogrecrusher: [], ogrefireshaman: ["Ogre Fire Shaman"],
        ogremystic: ["Ogre Mystic"], orcbruiser: ["Orc Bruiser"], professionalboxer: ["Professional Boxer"], rattlingremains: [],
        savageberserker: ["Savage Berserker"], spacezebra: ["Space Zebra"], stealthyoperative: [], streetbrawler: [],
        streetpunk: ["Street Punk"], thorfolk: [], tomekeepersunstone: ["Tomekeeper of the Sunstone"], voiddesolator: ["Void Desolator"],
        wanderingarcher: ["Wandering Archer"], wildripper: ["Wild ripper"], xibalbaglyphweaver: ["Xibalba Glyphweaver"], zephyrwizard: ["Zephyr Wizard"],
        abyssalhydromancer: ["Abyssal Hydromancer"], akiratanaka: ["Gremory"], furyhowlbarbarian: ["Furyhowl Barbarian"], gnomeherbalist: ["Gnome Herbalist"],
        gnomeminer: ["Gnome Miner"], gnomepeasant: ["Gnome Peasant"], gnomescout: ["Gnome Scout"], gnometinkerer: [], gnometrickster: ["Gnome Trickster"],
        emberfiend: ["Ember Fiend"], frostdeciever: ["Frost Deciever"], frostsuccubus: ["Frost Succubus"], gravelimp: ["Gravel Imp"], mirrorfiend: ["Mirror Fiend"],
        nightmareweaver: ["Nightmare Weaver"], soulmerchant: ["Soul Merchant"], tricksterimp: ["Trickster Imp"], venomdevil: ["Venom Devil"], abyssalfiend: ["Abyssal Fiend"],
        // ── Auto-generated pins ──
        fk_animatedgravestalker: ["Animated Gravestalker"],
        fk_arcanearchmage: ["Arcane Archmage"],
        fk_blindingsadist: ["Blinding Sadist"],
        fk_bloodcountess: ["Blood Countess"],
        fk_bloodthirstycrusader: ["Bloodthirsty Crusader"],
        fk_bonecommander: ["Bone Commander"],
        fk_bubba: ["Bubba"],
        fk_championcontender: ["Champion Contender"],
        fk_consecratedguardian: ["Consecrated Guardian"],
        fk_coralenchantress: ["Coral Enchantress"],
        fk_corpsecarverknight: ["Corpsecarver Knight"],
        fk_corruptedknight: ["Corrupted Knight"],
        fk_crimsonanalizer: ["Crimson Analizer"],
        fk_crimsonharbinger: ["Crimson Harbinger"],
        fk_cryptbornshrieker: ["Cryptborn Shrieker"],
        fk_darkmage: ["Dark Mage"],
        fk_desertcommander: ["Desert Commander"],
        fk_devotedtemplar: ["Devoted Templar"],
        fk_diegojaguarrodriguez: ["Marchosias"],
        fk_discorevenant: ["Disco Revenant"],
        fk_divinearbiter: ["Divine Arbiter"],
        fk_dominanttaskmaster: ["Dominant Taskmaster"],
        fk_dreadknight: ["Dread Knight"],
        fk_earthelemental: ["Earth Elemental"],
        fk_elenashadowrodriguez: ["Bathin"],
        fk_eliteboxingchampion: ["Elite Boxing Champion"],
        fk_em: ["Em"],
        fk_essenceleech: ["Essence Leech"],
        fk_eternalintern: ["Eternal Intern"],
        fk_feyenchantress: ["Fey Enchantress"],
        fk_fierysleepdemon: ["Fiery Sleep Demon"],
        fk_fossilsentinel: ["Fossil Sentinel"],
        fk_frostenchantress: ["Frost Enchantress"],
        fk_gnomealchemist: ["Gnome Alchemist"],
        fk_gnomeartificer: ["Gnome Artificer"],
        fk_gnomebombardier: ["Gnome Bombardier"],
        fk_gnomeengineer: ["Gnome Engineer"],
        fk_gnomeshaman: ["Gnome Shaman"],
        fk_gnomewarlock: ["Gnome Warlock"],
        fk_graveboundrevenant: ["Gravebound Revenant"],
        fk_guardianvindicator: ["Guardian Vindicator"],
        fk_infernaldevastator: ["Infernal Devastator"],
        fk_infernalprodigy: ["Infernal Prodigy"],
        fk_infernalwarmonger: ["Infernal Warmonger"],
        fk_labyrinthguardian: ["Labyrinth Guardian"],
        fk_livingarmor: ["Living Armor"],
        fk_livingmonolith: ["Living Monolith"],
        fk_masterchen: ["Paimon"],
        fk_mechanicalgolem: ["Mechanical Golem"],
        fk_merchantsnightmare: ["Merchant's Nightmare"],
        fk_militarycyborg: ["Military Cyborg"],
        fk_mindsculptor: ["Mind Sculptor"],
        fk_mountaincrusher: ["Mountain Crusher"],
        fk_mountainogre: ["Mountain Ogre"],
        fk_mysticprodigy: ["Mystic Prodigy"],
        fk_necroticchampion: ["Necrotic Champion"],
        fk_nephilimremnant: ["Nephilim Remnant"],
        fk_noviceshaolinacolyte: ["Novice Shaolin Acolyte"],
        fk_obsidianburrower: ["Obsidian Burrower"],
        fk_oceanwarlock: ["Ocean Warlock"],
        fk_ogrearchmage: ["Ogre Archmage"],
        fk_ogrechampion: ["Ogre Champion"],
        fk_ogreelementaladept: ["Ogre Elemental Adept"],
        fk_ogrewarlord: ["Ogre Warlord"],
        fk_painenthusiast: ["Pain Enthusiast"],
        fk_permafrostconjurer: ["Permafrost Conjurer"],
        fk_philosophicalzombie: ["Philosophical Zombie"],
        fk_photondefender: ["Photon Defender"],
        fk_plasmajuggernaut: ["Plasma Juggernaut"],
        fk_poisonpooka: ["Poison Pooka"],
        fk_quantumsupersoldier: ["Quantum Supersoldier"],
        fk_quetzalcoatlchanneler: ["Quetzalcoatl Channeler"],
        fk_radiantarchpriest: ["Radiant Archpriest"],
        fk_radiantjusticar: ["Radiant Justicar"],
        fk_rashidalsayf: ["Zagan"],
        fk_roguesentinel: ["Rogue Sentinel"],
        fk_royalchampion: ["Royal Champion"],
        fk_royalknight: ["Royal Knight"],
        fk_sandgolem: ["Sand Golem"],
        fk_scarecrowsentinel: ["Scarecrow Sentinel"],
        fk_sculptorssorrow: ["Sculptor's Sorrow"],
        fk_securitysentinel: ["Security Sentinel"],
        fk_seismictunneler: ["Seismic Tunneler"],
        fk_shadowblade: ["Shadow Blade"],
        fk_shadowblade2: [],
        fk_shadowthief: ["Shadow Thief"],
        fk_somnolentapparition: ["Somnolent Apparition"],
        fk_starcaller: ["Star Caller"],
        fk_terragolem: ["Terra Golem"],
        fk_thoughtweaver: ["Thought Weaver"],
        fk_treasuregolem: ["Treasure Golem"],
        fk_viktorironfistvolkov: ["Andras"],
        fk_voidsorcerer: ["Void Sorcerer"],
        fk_warbornchieftain: ["Warborn Chieftain"],
        fk_wintercourtknight: ["Winter Court Knight"],
        fk_abyssalpixie: ["Abyssal Pixie"],
        fk_astralsentinel: ["Astral Sentinel"],
        fk_blightsylph: ["Blight Sylph"],
        fk_bloodlordsupreme: ["Bloodlord Supreme"],
        fk_boggolem: ["Bog Golem"],
        fk_celestialarbiter: ["Celestial Arbiter"],
        fk_cerberussentinel: ["Cerberus Sentinel"],
        fk_corporateninja: ["Corporate Ninja"],
        fk_crystallineshardbeast: ["Crystalline Shardbeast"],
        fk_emberwarder: ["Ember Warder"],
        fk_frostarchmagus: ["Frost Archmagus"],
        fk_frostknight: ["Frost Knight"],
        fk_greyzetareticulan: ["Grey Zeta Reticulan"],
        fk_infernalannihilator: ["Infernal Annihilator"],
        fk_infernalwarhound: ["Infernal Warhound"],
        fk_infernopooka: ["Inferno Pooka"],
        fk_ironsentinel: ["Iron Sentinel"],
        fk_laughingmireidol: ["Laughing Mire Idol"],
        fk_moltenguardian: ["Molten Guardian"],
        fk_mountaindevastator: ["Mountain Devastator"],
        fk_mountaindevastator2: [],
        fk_mountaingiant: ["Mountain Giant"],
        fk_nethercourtduchess: ["Nether Court Duchess"],
        fk_nightmaremage: ["Nightmare Mage"],
        fk_nightveilassassin: ["Nightveil Assassin"],
        fk_ogrewarlockking: ["Ogre Warlock King"],
        fk_petrifiedenforcer: ["Petrified Enforcer"],
        fk_primordialgolem: ["Primordial Golem"],
        fk_radiantdefender: ["Radiant Defender"],
        fk_royaljusticar: ["Royal Justicar"],
        fk_shadowassassin: ["Shadow Assassin"],
        fk_siegeautomation: ["Siege Automation"],
        fk_tanko: ["Tanko"],
        fk_vampiricnightwing: ["Vampiric Nightwing"],
        fk_warhyppotaur: ["War Hyppotaur"],
        fk_celestialprotector: ["Celestial Protector"],
        fk_duskcommander: ["Dusk Commander"],
        fk_ironpalmdisciple: ["Iron Palm Disciple"],
        fk_mechanizedharbinger: ["Mechanized Harbinger"],
        fk_moltenefreeti: ["Molten Efreeti"],
        fk_nepenthemycoastrum: ["Nepenthe Mycoastrum"],
        fk_phylacteryguardian: ["Phylactery Guardian"],
        fk_stonebulwark: ["Stone Bulwark"],
        fk_cinderheartscion: ["Cinderheart Scion"],
        fk_infernalpyromancer: ["Infernal Pyromancer"],
        fk_marrowarchmage: ["Marrow Archmage"],
        fk_zenfistmaster: ["Zen Fist Master"],
        fk_foulgouger: ["Foul Gouger"],
        fk_infernoarchivist: ["Inferno Archivist"],
        fk_screamingjar: ["Screaming Jar"],
        fk_bloodcountessep: ["Blood Countess :EP"],
        fk_crimsonvampireep: ["Crimson Vampire :EP"],
        fk_hollowmother: ["Hollow Mother"],
        fk_basaltstonegolem: ["Basaltstone Golem"],
        fk_dopedchimp: ["Doped Chimp"],
        fk_hungerincarnate: ["Hunger Incarnate"],
        fk_mirrorbasher: ["Mirror Basher"],
        fk_surgeonofsouls: ["Surgeon of Souls"],
        fk_cherubichostalpha: ["Cherubic Host-Alpha"],
        fk_fierydeity: ["Fiery Deity"],
        fk_dominionoftheflame: ["Dominion of the Flame"],
        fk_cultistofcthulhu: ["Cultist of Cthulhu"],
        fk_cultistofnyarlathotep: ["Cultist of Nyarlathotep"],
        fk_cultistofshubniggurath: ["Cultist of Shub-Niggurath"],
        fk_cultistofyogsothoth: ["Cultist of Yog-Sothoth"],
        fk_saltcuredmourner: ["Salt-Cured Mourner"],
        fk_saltcuredcerecloth: ["Salt-Cured Cerecloth"],
        fk_saltcuredwight: ["Salt-Cured Wight"],
        fk_forgottencadaver: ["Forgotten Cadaver"],
        fk_restlesscharnelhound: ["Restless Charnelhound"],
        fk_restlesspallbearer: ["Restless Pallbearer"],
        fk_plaguecerecloth: ["Plague Cerecloth"],
        fk_witheredmourner: ["Withered Mourner"],
        fk_witheredcharnelhound: ["Withered Charnelhound"],
        fk_cerementgravewalker: ["Cerement Gravewalker"],
        fk_cerementbonepicker: ["Cerement Bonepicker"],
        fk_plaguehusk: ["Plague Husk"],
        fk_cryptbonepicker: ["Crypt Bonepicker"],
        fk_rottinghusk: ["Rotting Husk"],
        fk_witheredhusk: ["Withered Husk"],
        fk_restlesscadaver: ["Restless Cadaver"],
        fk_cryptwight: ["Crypt Wight"],
        fk_cerementboneknight: ["Cerement Boneknight"],
        fk_gildedrevenant: ["Gilded Revenant"],
        fk_sunkenhusk: ["Sunken Husk"],
        fk_hollowbonepicker: ["Hollow Bonepicker"],
        fk_restlessbonepicker: ["Restless Bonepicker"],
        fk_restlessthrall: ["Restless Thrall"],
        fk_witheredthrall: ["Withered Thrall"],
        fk_graveboundgravewalker: ["Grave-Bound Gravewalker"],
        fk_cinderwrappedsentinel: ["Cinder-Wrapped Sentinel"],
        fk_graveboundmourner: ["Grave-Bound Mourner"],
        fk_restlessgravewalker: ["Restless Gravewalker"],
        fk_hollowcharnelhound: ["Hollow Charnelhound"],
        fk_forgottenboneknight: ["Forgotten Boneknight"],
        fk_graveboundboneknight: ["Grave-Bound Boneknight"],
        fk_gildedthrall: ["Gilded Thrall"],
        fk_saltcuredgravewalker: ["Salt-Cured Gravewalker"],
        fk_forgottencharnelhound: ["Forgotten Charnelhound"],
        fk_gildedsentinel: ["Gilded Sentinel"],
        fk_hollowgravewalker: ["Hollow Gravewalker"],
        fk_mummifiedgravewalker: ["Mummified Gravewalker"],
        fk_cinderwrappedwight: ["Cinder-Wrapped Wight"],
        fk_hollowwight: ["Hollow Wight"],
        fk_sunkengravewalker: ["Sunken Gravewalker"],
        fk_cryptrevenant: ["Crypt Revenant"],
        fk_whisperingtormentor: ["Whispering Tormentor"],
        fk_hollowpixie: ["Hollow Pixie"],
        fk_fangedimp: ["Fanged Imp"],
        fk_whisperingnixie: ["Whispering Nixie"],
        fk_leeringsprite: ["Leering Sprite"],
        fk_glimmeringdevilkin: ["Glimmering Devilkin"],
        fk_brimstonefiend: ["Brimstone Fiend"],
        fk_spitefulpixie: ["Spiteful Pixie"],
        fk_gibberingfiend: ["Gibbering Fiend"],
        fk_mockingwhisperling: ["Mocking Whisperling"],
        fk_caperingdevilkin: ["Capering Devilkin"],
        fk_hexingcambion: ["Hexing Cambion"],
        fk_leeringpixie: ["Leering Pixie"],
        fk_brimstonedevilkin: ["Brimstone Devilkin"],
        fk_brimstonecambion: ["Brimstone Cambion"],
        fk_mockingnixie: ["Mocking Nixie"],
        fk_sulphurnixie: ["Sulphur Nixie"],
        fk_disgracedbot: ["Disgraced Bot"],
        fk_veterangoon: ["Veteran Goon"],
        fk_backalleybot: ["Back-Alley Bot"],
        fk_bogstandardsharpshooter: ["Bog-Standard Sharpshooter"],
        fk_bogstandardmarauder: ["Bog-Standard Marauder"],
        fk_rustedtinker: ["Rusted Tinker"],
        fk_twitchydrone: ["Twitchy Drone"],
        fk_scrapsentry: ["Scrap Sentry"],
        fk_grizzledbot: ["Grizzled Bot"],
        fk_bogstandardtinker: ["Bog-Standard Tinker"],
        fk_grizzledtinker: ["Grizzled Tinker"],
        fk_hiredtinker: ["Hired Tinker"],
        fk_scrapbot: ["Scrap Bot"],
        fk_renegadedrone: ["Renegade Drone"],
        fk_conscriptautomaton: ["Conscript Automaton"],
        fk_maskedraider: ["Masked Raider"],
        fk_overclockedraider: ["Overclocked Raider"],
        fk_salvagedsentry: ["Salvaged Sentry"],
        // ── Auto-generated pins ──
        fk_overclockedpoacher: ["Overclocked Poacher"],
        fk_disgracedsharpshooter: ["Disgraced Sharpshooter"],
        fk_rustedbrawler: ["Rusted Brawler"],
        fk_overclockedenforcer: ["Overclocked Enforcer"],
        fk_rustedraider: ["Rusted Raider"],
        fk_twitchysharpshooter: ["Twitchy Sharpshooter"],
        fk_hiredpoacher: ["Hired Poacher"],
        fk_conscriptgoon: ["Conscript Goon"],
        fk_overclockedbrawler: ["Overclocked Brawler"],
        fk_maskedbruiser: ["Masked Bruiser"],
        fk_conscriptmarauder: ["Conscript Marauder"],
        fk_maskedoutlaw: ["Masked Outlaw"],
        fk_conscriptbruiser: ["Conscript Bruiser"],
        fk_scrapgoon: ["Scrap Goon"],
        fk_renegadeenforcer: ["Renegade Enforcer"],
        fk_renegadepoacher: ["Renegade Poacher"],
        // -- Bespoke per-enemy Folk split pins (flk_) --
        flk_festeringcorpse: ["Festering Corpse"],
        flk_rottinghusk: ["Rotting Husk"],
        flk_frosttouchedthrall: ["Frost-Touched Thrall"],
        flk_cerementgravewalker: ["Cerement Gravewalker"],
        flk_restlesscadaver: ["Restless Cadaver"],
        flk_hollowbonepicker: ["Hollow Bonepicker"],
        flk_restlessbonepicker: ["Restless Bonepicker"],
        flk_hollowgravewalker: ["Hollow Gravewalker"],
        flk_hollowwight: ["Hollow Wight"],
        flk_graveyardshambler: ["Graveyard Shambler"],
        flk_restlesspallbearer: ["Restless Pallbearer"],
        flk_plaguecerecloth: ["Plague Cerecloth"],
        flk_mineslave: ["Mine Slave"],
        flk_twitchytinker: ["Twitchy Tinker"],
        flk_orccaptain: ["Orc Captain"],
        flk_conscriptbruiser: ["Conscript Bruiser"],
        flk_plaguecarrier: ["Plague Carrier"],
        flk_saltcuredmourner: ["Salt-Cured Mourner"],
        flk_cryptwight: ["Crypt Wight"],
        flk_sunkenhusk: ["Sunken Husk"],
        flk_hollowcharnelhound: ["Hollow Charnelhound"],
        flk_forgottencharnelhound: ["Forgotten Charnelhound"],
        flk_reanimatedguard: ["Reanimated Guard"],
        flk_witheredhusk: ["Withered Husk"],
        flk_graveboundmourner: ["Grave-Bound Mourner"],
        flk_touristskeleton: ["Tourist Skeleton"],
        flk_plaguehusk: ["Plague Husk"],
        flk_cerementboneknight: ["Cerement Boneknight"],
        flk_restlessthrall: ["Restless Thrall"],
        flk_witheredthrall: ["Withered Thrall"],
        flk_forgottenboneknight: ["Forgotten Boneknight"],
        flk_undeadarcher: ["Undead Archer"],
        flk_saltcuredwight: ["Salt-Cured Wight"],
        flk_cerementbonepicker: ["Cerement Bonepicker"],
        flk_gildedthrall: ["Gilded Thrall"],
        flk_banditchief: ["Bandit Chief"],
        flk_overclockedenforcer: ["Overclocked Enforcer"],
        flk_banditgrunt: ["Bandit Grunt"],
        flk_hiredpoacher: ["Hired Poacher"],
        flk_banditrogue: ["Bandit Rogue"],
        flk_salvagedoutlaw: ["Salvaged Outlaw"],
        flk_overclockedpoacher: ["Overclocked Poacher"],
        flk_renegadeoutlaw: ["Renegade Outlaw"],
        flk_bogstandardtinker: ["Bog-Standard Tinker"],
        flk_salvagedsentry: ["Salvaged Sentry"],
        flk_banditscout: ["Bandit Scout"],
        flk_twitchysharpshooter: ["Twitchy Sharpshooter"],
        flk_maskedbruiser: ["Masked Bruiser"],
        flk_renegadepoacher: ["Renegade Poacher"],
        flk_backalleysharpshooter: ["Back-Alley Sharpshooter"],
        flk_drownedrevenant: ["Drowned Revenant"],
        flk_saltcuredcerecloth: ["Salt-Cured Cerecloth"],
        flk_restlesscharnelhound: ["Restless Charnelhound"],
        flk_witheredmourner: ["Withered Mourner"],
        flk_gildedrevenant: ["Gilded Revenant"],
        flk_gnometinkerer: ["Gnome Tinkerer"],
        flk_conscriptgoon: ["Conscript Goon"],
        flk_conscriptmarauder: ["Conscript Marauder"],
        flk_murkwallowghoul: ["Murkwallow Ghoul"],
        flk_forgottencadaver: ["Forgotten Cadaver"],
        flk_witheredcharnelhound: ["Withered Charnelhound"],
        flk_restlessgravewalker: ["Restless Gravewalker"],
        flk_saltcuredgravewalker: ["Salt-Cured Gravewalker"],
        flk_mummifiedgravewalker: ["Mummified Gravewalker"],
        flk_cinderwrappedwight: ["Cinder-Wrapped Wight"],
        flk_ogrebrute: ["Ogre Brute"],
        flk_bogstandardmarauder: ["Bog-Standard Marauder"],
        flk_rustedtinker: ["Rusted Tinker"],
        flk_renegadeenforcer: ["Renegade Enforcer"],
        flk_overclockedraider: ["Overclocked Raider"],
        flk_ogrecrusher: ["Ogre Crusher"],
        flk_rustedraider: ["Rusted Raider"],
        flk_rattlingremains: ["Rattling Remains"],
        flk_cryptbonepicker: ["Crypt Bonepicker"],
        flk_graveboundgravewalker: ["Grave-Bound Gravewalker"],
        flk_graveboundboneknight: ["Grave-Bound Boneknight"],
        flk_sunkengravewalker: ["Sunken Gravewalker"],
        flk_cryptrevenant: ["Crypt Revenant"],
        flk_stealthyoperative: ["Stealthy Operative"],
        flk_bogstandardsharpshooter: ["Bog-Standard Sharpshooter"],
        flk_overclockedbrawler: ["Overclocked Brawler"],
        flk_maskedraider: ["Masked Raider"],
        flk_streetbrawler: ["Street Brawler"],
        flk_conscriptraider: ["Conscript Raider"],
        flk_veterangoon: ["Veteran Goon"],
        flk_scrapraider: ["Scrap Raider"],
        flk_rustedbrawler: ["Rusted Brawler"],
        flk_bogstandardgoon: ["Bog-Standard Goon"],
        flk_scrapsentry: ["Scrap Sentry"],
        flk_hiredtinker: ["Hired Tinker"],
        flk_scrapgoon: ["Scrap Goon"],
        flk_thor: ["Thor"],
        flk_disgracedsharpshooter: ["Disgraced Sharpshooter"],
        flk_grizzledtinker: ["Grizzled Tinker"],
        flk_maskedoutlaw: ["Masked Outlaw"],
        flk_shadowblade: ["Shadow Blade"],
        flk_mountaindevastator: ["Mountain Devastator"],

    };

    const reg = window.Battler3D.registerArchetype;
    Object.keys(NAMED).forEach(k => reg(k, { aliases: [k], scale: (CONFIGS[k] && CONFIGS[k].scale) || 2.1, weapon: 0, create: make }));
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Folk uniques registered (' + Object.keys(NAMED).length + ')');
})();
