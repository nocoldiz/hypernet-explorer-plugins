/*:
 * @target MZ
 * @plugindesc Character preset management system with save/load functionality and UI windows
 * @author Omni-Lex
 * @orderAfter CharacterCreationShared
 * @orderAfter StartingEquipment
 * @orderBefore ClassSelection
 * @orderBefore CharacterCreation
 *
 * @command saveCharacterPreset
 * @text Save Character Preset
 * @desc Saves the current character as a preset for future use
 *
 * @command savePartyMember
 * @text Send Away Party Member
 * @desc Retires a party member: removes them and files them as a playable dossier for this world
 *
 * @arg memberIndex
 * @text Party Slot
 * @desc Which party slot to retire. The leader (slot 1) cannot be retired, and the party is never left empty.
 * @type select
 * @option 2nd Party Member
 * @value 2
 * @option 3rd Party Member
 * @value 3
 * @default 2
 *
 * @help
 * This plugin manages character presets:
 * - Default preset data (Bubba, Em, Selene)
 * - Endless dossiers (endless: true) that are never spent for the world, and
 *   are listed first on the selection board
 * - Procedural dossier backgrounds (proceduralLore: "em") and hometowns
 *   (proceduralHometown: "em")
 * - Dossier vehicles (vehicle: { key, mapId, x, y, worldX, worldY }) parked for
 *   their owner at creation time
 * - Dossier skins (skins: [{ key, sprite, spriteIndex, busts }]), the alternate
 *   looks a pre-made character can be played as, picked on the dossier page
 * - Preset CRUD operations (create, read, update, delete)
 * - Character creation completion tracking
 * - Preset selection UI (Window_CharacterPresets)
 * - Stats explanation UI (Window_StatsExplanation)
 *
 * Dependencies:
 * - CharacterCreationShared.js (for trait application)
 * - StartingEquipment.js (for equipment management)
 *
 * Functions exported to global namespace:
 * - window.CharacterPresets.getCharacterPresets()
 * - window.CharacterPresets.getAvailableCharacterPresets()
 * - window.CharacterPresets.retirePartyMember(actorId)
 * - window.CharacterPresets.unretirePartyMember(presetId)
 * - window.CharacterPresets.getAvailableRetiredPresets()
 * - window.CharacterPresets.isPresetUsed(presetId)
 * - window.CharacterPresets.isPresetEndless(presetId)
 * - window.CharacterPresets.markPresetUsed(presetId)
 * - window.CharacterPresets.getPresetSwitchIds()
 * - window.CharacterPresets.getPresetLore(preset)
 * - window.CharacterPresets.getPresetHometown(preset)
 * - window.CharacterPresets.getPresetSkins(preset)
 * - window.CharacterPresets.getPresetSkin(preset, index)
 * - window.CharacterPresets.getPresetSkinLabel(skin)
 * - window.CharacterPresets.getPresetModel(preset)
 * - window.CharacterPresets.findPresetForActor(actor)
 * - window.CharacterPresets.getActorPresetModel(actor)
 * - window.CharacterPresets.getEmBackstory()
 * - window.CharacterPresets.isEmPlaythrough()
 * - window.CharacterPresets.isBeastCrew()
 * - window.CharacterPresets.emLabel(key, fallback)
 * - window.CharacterPresets.camperName(fallback)
 * - window.CharacterPresets.applyPresetVehicle(preset)
 * - window.CharacterPresets.removePresetById(presetId)
 * - window.CharacterPresets.getNextPresetId()
 * - window.CharacterPresets.markStepCompleted(stepIndex)
 * - window.CharacterPresets.isStepCompleted(stepIndex)
 * - window.CharacterPresets.Window_CharacterPresets
 * - window.CharacterPresets.Window_StatsExplanation
 */

(() => {
  const pluginName = "CharacterPresets";

  //=============================================================================
  // Default Character Presets Data
  //=============================================================================

  // Some historical dossiers were drawn more than once: the same person in a
  // second outfit, a second office, a second state of being. Those alternates
  // are skins, picked on the dossier page before the character is taken, and a
  // skin is a sprite and a bust that share one asset name (img/characters/Skab
  // and img/busts). `key` is the label the skin reads by, resolved from
  // CharPresets.skin.<key>; only the walk-cycle sheets qualify, since a skin is
  // what the player then walks around as.
  // `folder` names the sprite's own folder for the few sheets that do not sit
  // in Skab: the pose sheets live in img/characters/Animations.
  //
  // A dossier's portraits live in img/busts/presets/ rather than in the flat
  // img/busts/ the rest of the cast draws from, so the bust gallery (which
  // scans that one folder and never recurses) cannot offer somebody else the
  // face of a pre-made character. The prefix travels with the name because
  // every bust reader in the game builds its path as img/busts/<name>.png.
  const PRESET_BUSTS = "presets/";
  const skin = (key, asset, folder) => ({
    key,
    sprite: (folder || "Skab") + "/!$" + asset,
    spriteIndex: 0,
    busts: PRESET_BUSTS + asset,
  });

  // i18n-ignore-start: proper names, nation keys into HistorySimulator_COUNTRIES
  // and asset ids. Each dossier's prose lives in CharPresets.lore.<id>.
  let CharacterPresets = [
    {
      id: 1,
      name: "Bubba",
      loreKey: "bubba",
      characterType: "humanoid",
      classId: 54,
      sprite: "NPCs/!$Bubba1",
      spriteIndex: 0,
      mapId: 722,
      x: 55,
      y: 48,
      switches: [49, 50],
      birthDate: "1968-07-14", // Date of birth
      nationId: "Texas", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 90000,
      // What a man keeps in the cab: the shotgun, the cuffs that whistle up
      // The Beast, and the roadside kit he fixes it with.
      items: [
        { id: 1, amount: 5 },    // Potion x5
        { id: 111, amount: 1 },  // Liminal cuffs - summons The Beast
        { id: 1443, amount: 2 }, // First Aid Kit x2
        { id: 870, amount: 1 },  // Oil Flask x1
      ],
      weapons: [{ id: 459, amount: 1 }], // Bubba's Shotgun x1
      // Workwear, nothing enchanted: a trucker's cap, coveralls and the belt
      // his class starts with. All of it is cheap and all of it is level one.
      armors: [
        { id: 577, amount: 1 }, // Asphalt Captain Cap
        { id: 117, amount: 1 }, // Plain Work Coveralls
        { id: 115, amount: 1 }, // Field Repair Belt
      ],
      equips: [459, null, 577, 117, 115],
      skills: [10],
      traits: [],
      specializations: [
        { id: 173, level: 5 }, // Mechanics (Master)
        { id: 296, level: 3 }, // Welding
        { id: 285, level: 3 }, // Truck Driving
        { id: 96, level: 2 },  // Electrical Wiring
      ],
      busts: "presets/Bubba",
      // Kept off the dossier board: his record still exists for the story mode
      // and for a save that already carries him, but he is not offered as a
      // character the player can pick.
      hidden: true,
    },
    {
      id: 2,
      name: "Em",
      loreKey: "em",
      characterType: "humanoid",
      classId: 16, // Gunmancer
      sprite: "Other/!$Em",
      spriteIndex: 1,
      mapId: 722,
      x: 48,
      y: 48,
      switches: [48, 50],
      birthDate: "1982-11-03", // Date of birth
      // The one fixed point across her branches: whatever else that dimension
      // did with history, Em was born in Britain in it. The town is not fixed,
      // only the country. The town itself is Wimbledon in all of them.
      nationId: "United Kingdom", // Nation of birth (key into HistorySimulator_COUNTRIES)
      hometown: "Wimbledon", // i18n-ignore: place name. Born there in every branch
      gender: 1, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      // A witch with no past and no money: her purse is the camper's petty cash,
      // not a wage, so the sheet reads her standing rather than her coins.
      socialClass: 0, // 0=Destitute 1=Working 2=Middle 3=Wealthy
      reproduction: 1, // REPRODUCTION_TYPES.UTERUS
      sexualOrientation: "asexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "aromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 20000,
      // The cuffs and the broom she arrived with. The broom is summoned from the
      // item wherever she stands (VehicleSystem, item 168 -> common event 214),
      // so unlike The Beast below it is carried rather than parked.
      items: [
        { id: 111, amount: 1 }, // Liminal cuffs
        { id: 168, amount: 1 }, // Flying broom
        { id: 1, amount: 3 },   // Potion x3
        { id: 21, amount: 3 },  // Mana Tonic x3
        // The Ritual took her spells, not her library. What she walks out with
        // is two unread grimoires (ForgottenGrimoire: each one is five
        // offers, one kept) and the book she carries, so the story mode starts
        // with her magic still ahead of her rather than gone.
        { id: 1406, amount: 1 }, // Arcanism Grimoire
        { id: 1405, amount: 1 }, // Astral Magic Grimoire
        { id: 1832, amount: 1 }, // The Book of the Law
      ],
      weapons: [{ id: 525, amount: 1 }], // Vector gun
      // A witch who buys her robes off a market stall and a shooting glove for
      // the hand the vector gun sits in. Cheap, thematic and level one: the two
      // late-game jackets she used to start in are gone.
      armors: [
        { id: 467, amount: 1 }, // Discount Wizard Robe
        { id: 127, amount: 1 }, // Reflex Trigger Glove
      ],
      equips: [525, null, null, 467, 127],
      skills: [],
      // What the Ritual left her with: the potential that grew instead of
      // shrinking, the mark it burned in, the scarring of the spell that took
      // her memories, and the barrel she casts through.
      traits: [190, 193, 192, 202], // Magically Gifted, Witch-marked, Spell-scarred, Gun Fu
      specializations: [
        { id: 165, level: 4 }, // Magic Theory
        { id: 73, level: 3 },  // Spell Concentration
        { id: 164, level: 2 }, // Lucid Dreaming
      ],
      busts: "presets/Em",
      // Off the board like Bubba: the story mode is still played as her, and
      // every screen that reads her record still finds it. See `hidden` above.
      hidden: true,
      // The one dossier whose owner was modelled in 3D. Every screen that would
      // draw her flat bust as a portrait draws this model instead (the status
      // sheet and the Empathize panel), so her face is the same rig the rest of
      // the game shows her with.
      model: "models/Em.glb",
      // The Beast is waiting outside where she left it. Parked on her home map
      // (722) and mirrored onto the world map at 88,131 so it is visible and
      // boardable from map 315 too, not only from the tile it physically sits on.
      vehicle: { key: "camper", mapId: 722, x: 49, y: 44, worldX: 88, worldY: 131 },
      // Never spent: every playthrough of every world can pick Em again.
      endless: true,
      // Her history is the written one (docs/Lore.odt, CharPresets.emBackstory);
      // buildEmLore still rolls the branch she arrived from on top of it.
      proceduralLore: "em",
    },
    {
      id: 3,
      name: "Selene",
      loreKey: "selene",
      characterType: "humanoid",
      classId: 6,
      sprite: "NPCs/!$Hitman1",
      spriteIndex: 0,
      mapId: 561,
      x: 15,
      y: 11,
      switches: [58],
      birthDate: "1991-04-22", // Date of birth
      nationId: "Italy", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 1, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "homosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "homoromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 5000000,
      items: [],
      weapons: [],
      armors: [],
      equips: [],
      skills: [],
      traits: [],
      specializations: [
        { id: 1, level: 3 },   // Accounting
        { id: 259, level: 3 }, // Stock Trading
        { id: 186, level: 2 }, // Negotiation
      ],
      busts: "presets/Selene",
    },
    {
      id: 4,
      name: "Giulio Andreotti",
      loreKey: "andreotti",
      characterType: "humanoid",
      classId: 6, // CEO (power broker / statesman, closest analog to career politician)
      sprite: "Skab/!$Andreotti",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1919-01-14", // Date of birth
      nationId: "Italy", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 2000000, // 20,000€ - decades as the most powerful man in Italian politics
      items: [
        { id: 127, amount: 1 }, // Pocket Notebook - kept files on everyone
        { id: 711, amount: 1 }, // Newspaper
      ],
      weapons: [],
      armors: [{ id: 378, amount: 1 }], // Envoy's Sashed Coat
      equips: [null, null, null, 378, null],
      skills: [],
      traits: [7, 98, 116, 174], // Genius, Tactician, Devout, Infamous
      specializations: [
        { id: 706, level: 4 }, // Political Science
        { id: 350, level: 3 }, // Espionage - kept files on everyone
        { id: 277, level: 2 }, // Theology
        { id: 218, level: 2 }, // Public Speaking
      ],
      busts: "presets/Andreotti",
      skins: [
        skin("statesman", "Andreotti"),
        skin("arcane", "AndreottiArcane"),
        skin("pontiff", "AndreottiPope"),
        skin("seated", "AndreottiSitting", "Animations"),
      ],
    },
    {
      id: 5,
      name: "Margherita Hack",
      loreKey: "margheritaHack",
      characterType: "humanoid",
      classId: 53, // Physicist (astrophysicist)
      sprite: "Skab/!$MargheritaHack",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1922-06-12", // Date of birth
      nationId: "Italy", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 1, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 150000, // 1,500€ - famously modest academic salary
      items: [{ id: 150, amount: 1 }], // Telescope
      weapons: [],
      armors: [{ id: 404, amount: 1 }], // Shifting Sight Glasses
      equips: [null, null, null, null, 404],
      skills: [],
      traits: [7, 18, 37, 117], // Genius, Vegetarian, Skeptic, Atheist
      specializations: [
        { id: 23, level: 5 },  // Astronomy (Master)
        { id: 202, level: 4 }, // Physics
        { id: 429, level: 3 }, // Radio Astronomy
      ],
      busts: "presets/MargheritaHack",
      skins: [
        skin("astronomer", "MargheritaHack"),
        skin("eva", "MargheritaHackEVA"),
        skin("flightSuit", "MargheritaHackSpace"),
      ],
    },
    {
      id: 6,
      name: "Bill Clinton",
      loreKey: "billClinton",
      characterType: "humanoid",
      classId: 35, // Bard (charismatic orator and saxophonist)
      sprite: "Skab/!$BillClinton",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1946-08-19", // Date of birth
      // No nationId: the United States is not a nation tracked by HistorySimulator_COUNTRIES
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 4000000, // 40,000€ - wealthy career politician and public speaker
      items: [{ id: 175, amount: 1 }],
      weapons: [{ id: 187, amount: 1 }], // Presidential Saxophone - the sax goes everywhere he does
      armors: [{ id: 311, amount: 1 }], // Deal-Closer Suit
      equips: [187, null, null, 311, null],
      skills: [],
      traits: [81, 132, 143, 174], // Charismatic, Scholar, Bard, Infamous
      specializations: [
        { id: 820, level: 5 }, // Saxophone (Master) - the Arsenio Hall Show sax solo
        { id: 218, level: 4 }, // Public Speaking
        { id: 186, level: 3 }, // Negotiation
        { id: 155, level: 2 }, // Law - Yale Law, Arkansas AG
      ],
      busts: "presets/BillClinton",
    },
    {
      id: 7,
      name: "Richard Benson",
      loreKey: "richardBenson",
      characterType: "humanoid",
      classId: 60, // Entertainer (flamboyant Italian TV showman)
      sprite: "Skab/!$RichardBenson",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      nationId: "Italy", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 800000, // 8,000€ - TV celebrity earnings
      items: [{ id: 593, amount: 1 }], // Raw Chicken
      weapons: [
        { id: 189, amount: 1 }, // La chitarra infernale - the cherry burst Soloist
        { id: 325, amount: 1 }, // Il bastone infernale - the cane with the blade in it
      ],
      armors: [{ id: 298, amount: 1 }], // Rhinestone Denim Suit
      equips: [189, null, null, 298, null],
      skills: [],
      traits: [81, 82, 143, 173], // Charismatic, Extrovert, Bard, Famous
      specializations: [
        { id: 3, level: 3 },   // Acting
        { id: 218, level: 3 }, // Public Speaking
        { id: 240, level: 2 }, // Singing
        { id: 82, level: 2 },  // Dancing
      ],
      busts: "presets/RichardBenson",
    }, /*
    {
      id: 8,
      name: "Silvio Berlusconi",
      loreKey: "berlusconi",
      classId: 6, // CEO (media mogul / businessman)
      sprite: "Skab/!$Berlusconi",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1936-09-29", // Date of birth
      nationId: "Italy", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 8000000, // 80,000€ - media tycoon, once Italy's richest man
      items: [],
      weapons: [],
      armors: [{ id: 410, amount: 1 }], // Dominion Power Suit
      equips: [null, null, null, null, null],
      skills: [],
      traits: [81, 85, 131, 174], // Charismatic, Ambitious, Wealthy, Infamous
      specializations: [
        { id: 1, level: 3 },   // Accounting
        { id: 218, level: 4 }, // Public Speaking
        { id: 231, level: 3 }, // Seduction
        { id: 259, level: 2 }, // Stock Trading
      ],
      busts: "presets/Berlusconi",
    },
    {
      id: 9,
      name: "Carlo Azeglio Ciampi",
      loreKey: "ciampi",
      classId: 48, // Academic (central banker / technocrat)
      sprite: "Skab/!$Ciampi",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1920-12-09", // Date of birth
      nationId: "Italy", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 1200000, // 12,000€ - respected technocrat, Bank of Italy governor turned President
      items: [],
      weapons: [],
      armors: [{ id: 183, amount: 1 }], // Formal Service Tunic
      equips: [null, null, null, null, null],
      skills: [],
      traits: [95, 132, 171, 92], // Stoic, Scholar, Honest, Humble
      specializations: [
        { id: 1, level: 4 },   // Accounting
        { id: 259, level: 3 }, // Stock Trading
        { id: 258, level: 3 }, // Statistics
        { id: 135, level: 2 }, // History
      ],
      busts: "presets/Ciampi",
    },
    {
      id: 10,
      name: "Mario Draghi",
      loreKey: "draghi",
      classId: 32, // Commander ("whatever it takes" crisis leadership)
      sprite: "Skab/!$MarioDraghi",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1947-09-03", // Date of birth
      nationId: "Italy", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 3000000, // 30,000€ - ECB President turned Italian PM
      items: [],
      weapons: [],
      armors: [{ id: 420, amount: 1 }], // Broker's Formal Array
      equips: [null, null, null, null, null],
      skills: [],
      traits: [7, 40, 98, 173], // Genius, Workaholic, Tactician, Famous
      specializations: [
        { id: 259, level: 5 }, // Stock Trading (Master)
        { id: 1, level: 4 },   // Accounting
        { id: 156, level: 3 }, // Leadership
        { id: 258, level: 3 }, // Statistics
      ],
      busts: "presets/MarioDraghi",
      skins: [
        skin("banker", "MarioDraghi"),
        skin("ascended", "MarioDraghiAscended"),
      ],
    },*/
    {
      id: 8,
      name: "Pope Petrus II",
      loreKey: "popePetrus",
      characterType: "humanoid",
      classId: 59, // Priest
      sprite: "Skab/!$Ratzinger",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1927-04-16", // Date of birth
      nationId: "Italy", // Elected Pope while resident in Vatican City (not tracked separately)
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 500000, // 5,000€ - personal vow of modesty despite the office
      items: [],
      weapons: [],
      armors: [{ id: 519, amount: 1 }], // High Cleric's Vestments
      equips: [null, null, null, 519, null],
      skills: [],
      traits: [132, 116, 83, 50], // Scholar, Devout, Introvert, Ascetic
      specializations: [
        { id: 277, level: 5 }, // Theology (Master)
        { id: 199, level: 4 }, // Philosophy
        { id: 174, level: 3 }, // Meditation
        { id: 159, level: 3 }, // Linguistics
      ],
      busts: "presets/Ratzinger",
    },
    {
      id: 9,
      name: "Rita Levi-Montalcini",
      loreKey: "ritaLeviMontalcini",
      characterType: "humanoid",
      classId: 42, // Scientist (Nobel-laureate neurologist)
      sprite: "Skab/!$RitaLeviMontalcini",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1909-04-22", // Date of birth
      nationId: "Italy", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 1, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 600000, // 6,000€ - senator for life, lifelong modest academic
      items: [{ id: 954, amount: 1 }], // Penicillin Precursors
      weapons: [],
      armors: [{ id: 511, amount: 1 }], // Iron Conviction Robes
      equips: [null, null, null, 511, null],
      skills: [],
      traits: [7, 40, 97, 129], // Genius, Workaholic, Survivalist, Exiled
      specializations: [
        { id: 682, level: 5 }, // Neurology (Master)
        { id: 11, level: 4 },  // Anatomy
        { id: 511, level: 3 }, // Biochemical Engineering
        { id: 634, level: 2 }, // Immunology
      ],
      busts: "presets/RitaLeviMontalcini",
      skins: [
        skin("senator", "RitaLeviMontalcini"),
        skin("labCoat", "RitaLeviMontalciniScientist"),
      ],
    },
    {
      id: 10,
      name: "Aleister Crowley",
      loreKey: "aleisterCrowley",
      characterType: "humanoid",
      classId: 8, // Cultist (founder of Thelema)
      sprite: "Skab/!$AleisterCrowley",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1875-10-12", // Date of birth
      nationId: "United Kingdom", // Nation of birth (key into HistorySimulator_COUNTRIES)
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "bisexual", // key into js/db/NPC/Orientations.json (sexual); well documented in his own writing
      romanticOrientation: "biromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 300000, // 3,000€ - squandered his inherited fortune, died in poverty
      items: [{ id: 1404, amount: 1 }], // Forbidden Magic Grimoire
      weapons: [],
      armors: [{ id: 531, amount: 1 }], // Robes of the Great Beast
      equips: [null, null, null, 531, null],
      skills: [1404, 1405, 1477, 1492, 1513, 1558, 1567, 1570, 1580, 1600, 1617, 1655, 1668, 1679, 1685, 1700, 1707],
      traits: [81, 118, 104, 174], // Charismatic, Heretic, Drug Dependent, Infamous
      specializations: [
        { id: 165, level: 5 }, // Magic Theory (Master)
        { id: 309, level: 3 }, // Alchemy
        { id: 22, level: 3 },  // Astrology
        { id: 137, level: 3 }, // Hypnosis
      ],
      busts: "presets/AleisterCrowley",
      skins: [
        skin("magus", "AleisterCrowley"),
        // Asset name keeps the misspelling both files were shipped with.
        skin("arcane", "AleisteirCrowleyArcane"),
      ],
    },
    {
      id: 11,
      name: "Kofi Annan",
      loreKey: "kofiAnnan",
      characterType: "humanoid",
      classId: 39, // Sage (elder statesman / diplomat)
      sprite: "Skab/!$KofiAnnan",
      spriteIndex: 0,
      mapId: 400,
      x: 41,
      y: 15,
      switches: [],
      birthDate: "1938-04-08", // Date of birth
      // No nationId: Ghana is not a nation tracked by HistorySimulator_COUNTRIES
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 700000, // 7,000€ - UN Secretary-General, Nobel Peace Prize laureate
      items: [379],
      weapons: [],
      armors: [{ id: 378, amount: 1 }], // Envoy's Sashed Coat
      equips: [null, null, null, 378, null],
      skills: [],
      traits: [33, 81, 88, 171], // Empath, Charismatic, Generous, Honest
      specializations: [
        { id: 88, level: 5 },  // Diplomacy (Master)
        { id: 218, level: 3 }, // Public Speaking
        { id: 159, level: 3 }, // Linguistics
        { id: 706, level: 3 }, // Political Science
      ],
      busts: "presets/KofiAnnan",
    },
    {
      id: 12,
      name: "George W. Bush",
      loreKey: "georgeWBush",
      characterType: "humanoid",
      classId: 32, // Commander (wartime president)
      sprite: "Skab/!$GeorgeWBush",
      spriteIndex: 0,
      mapId: 708,
      x: 24,
      y: 12,
      switches: [],
      birthDate: "1946-07-06", // Date of birth
      // No nationId: the United States is not a nation tracked by HistorySimulator_COUNTRIES
      gender: 0, // 0=Male 1=Female 2=Non-binary 3=Cocoon
      sexualOrientation: "heterosexual", // key into js/db/NPC/Orientations.json (sexual)
      romanticOrientation: "heteroromantic", // key into js/db/NPC/Orientations.json (romantic)
      money: 5000000, // 50,000€ - Texas oil family wealth plus presidential post-career earnings
      items: [{ id: 131, amount: 1 }], // Bike - avid post-presidency mountain biker
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      traits: [116, 172, 89, 160], // Devout, Blunt, Loyal, Optimist
      specializations: [
        { id: 156, level: 3 }, // Leadership
        { id: 31, level: 3 },  // Baseball - managing partner of the Texas Rangers
        { id: 277, level: 2 }, // Theology
        { id: 218, level: 2 }, // Public Speaking
      ],
      busts: "presets/GeorgeWBush",
    }
  ];
  // i18n-ignore-end

  // The dossiers this file WROTE, as opposed to the ones the player made. A
  // hand-authored dossier is played as it was written and can never be deleted;
  // a saved character or a retired companion is the player's own and is theirs
  // to edit, reuse and throw away. Taken here, off the literal above, before
  // anything the savegame carries is merged into it.
  const AUTHORED_PRESET_IDS = new Set(CharacterPresets.map((preset) => preset.id));

  // Whether one dossier is one of those. A story mode dossier counts too (its
  // ids are added the moment that list is built, below).
  function isAuthoredPreset(presetId) {
    return AUTHORED_PRESET_IDS.has(Number(presetId));
  }

  //=============================================================================
  // Story mode-exclusive presets
  //=============================================================================
  // The story mode never builds a character from scratch: it offers exactly
  // these three dossiers on the same preset board used everywhere else (see
  // CharacterCreation.js's showPresetSelection / getAvailableCharacterPresets
  // below). None of the three is ever spent - every one is reusable across
  // every playthrough of every world - and each is rolled fresh (name,
  // gender, and for the sprite-pool ones the sprite too) every time the
  // story mode's character creation opens, so no two story modes look alike.
  //
  // `characterType` ("humanoid" | "creature") and, for a creature dossier,
  // `archetypes` (1-2 Archetypes.json keys, joined "A / B" for a hybrid)
  // are a general extension of the preset schema, not story mode-only fields:
  // see CharacterCreation.js's _applyPreset, which reads them through
  // window.applyCreatureSelection (CharacterCreationCreature.js) for any
  // preset that declares characterType: "creature".

  // i18n-ignore-start: sprite sheet keys, not prose
  const STORY_MODE_SLIME_SPRITES = [
    "Creatures/!$Slime1", "Creatures/!$Slime2", "NPCs/!$Slime3", "Creatures/!$Slime4",
    "Creatures/!$Slime5", "Creatures/!$Slime6", "Creatures/!$Slime7", "Creatures/!$Slime8",
  ];
  // i18n-ignore-end

  // The looks each story mode dossier may be worn as. They are written out rather
  // than filtered off the sprite catalogue's own class affinity: that affinity
  // is sparse and noisy (nothing at all answers to Paladin or Pro Wrestler, and
  // what answers to Witch includes joggers), so it cannot stand in for "sheets
  // that read as this class". The slimes are a list for the same reason.
  // i18n-ignore-start: sprite sheet keys, not prose
  const STORY_MODE_SPRITE_LISTS = {
    // The ring, and the people who make a living being watched in it.
    wrestler: [
      "Varlenian/!$Wrestler1", "NPCs/!$Pro1", "NPCs/!$Pro2",
      "NPCs/!$Announcer1", "NPCs/!$Announcer2", "NPCs/!$Jogger1",
    ],
    // Armour with an oath inside it.
    paladin: [
      "NPCs/!$ValiantKnight1", "NPCs/!$WanderingKnight1", "NPCs/!$WastelandKnight1",
      "NPCs/!$RoyalGuard1", "NPCs/!$DesertGuard1", "NPCs/!$NobleGuard3",
      "Varlenian/!$NobleGuard1", "Skab/!$LazyKnight",
    ],
    // Readers of things nobody said out loud.
    psyker: [
      "NPCs/!$TarotWitch1", "Skab/!$TarotWitch", "Zombies/!$OrcSeer1",
      "NPCs/!$Strangelove1", "NPCs/!$CyberWitch1", "Skab/!$CyberWitch",
    ],
    // Anyone who earns a room by playing to it.
    bard: [
      "NPCs/!$ExoticBard1", "Varlenian/!$ExoticBard2", "Skab/!$ExoticBard",
      "Skab/!$OperaSinger", "NPCs/!$HippieMusician1", "NPCs/!$HippieMusician2",
      "NPCs/!$DJ1", "NPCs/!$DJ2",
    ],
    // Robes with something worked into the hem.
    enchanter: [
      "NPCs/!$Mage1", "Varlenian/!$Mage2", "Varlenian/!$Enchantress1",
      "Varlenian/!$Enchantress2", "Skab/!$Enchantress", "Skab/!$ElvenArchmage",
      "Skab/!$ArcaneWizard", "Skab/!$RabbitWizard", "NPCs/!$CharmingPrince1",
    ],
    // People who call things, and the marks that leaves.
    convoker: [
      "NPCs/!$SunCultist1", "Skab/!$DarkPriestess", "Skab/!$DarkWitch",
      "Zombies/!$Lich3", "Skab/!$Lich", "Skab/!$ArcaneWizard",
    ],
    // Habits, vestments and the orders that issue them.
    nun: [
      "Skab/!$Nun", "NPCs/!$Nun2", "Zombies/!$OrcNun1", "Zombies/!$OrcVestal1",
      "NPCs/!$Priest2", "NPCs/!$Priest3", "Skab/!$DarkPriestess",
      "Skab/!$AndroidArchpriest", "NPCs/!$SpacerMonk1", "Zombies/!$OrcMonk1",
    ],
  };
  // i18n-ignore-end

  // Every walk sheet the sprite catalogue carries for one archetype (both the
  // extracted NPCs/ cells and the hand-drawn Skab/ ones), narrowed by an extra
  // test where the dossier wants one. A beta sheet is always left out, the same
  // rule SpriteCatalog.npcKeys() applies everywhere else.
  function storyModeCatalogPool(archetype, extra) {
    const catalog = (window.WorldGen && window.WorldGen.NPCs) || {};
    return Object.keys(catalog).filter((key) => {
      const entry = catalog[key];
      if (!entry || entry.npc !== true || entry.beta === true) return false;
      if (entry.Archetype !== archetype) return false;
      return extra ? extra(entry) : true;
    });
  }

  // The story mode's Witch is a person, and one the catalogue already calls a
  // caster: magical, and listed as suiting the Witch class. Arcane-themed ones
  // are preferred (the rest are cyberpunk and street looks that read as
  // anything but a witch), and the whole caster set stands in if the theme ever
  // stops being written.
  function storyModeWitchSpritePool() {
    const casters = storyModeCatalogPool("Humanoid", (entry) =>
      entry.magical === true && Array.isArray(entry.classes) && entry.classes.includes(2));
    const arcane = casters.filter((key) => {
      const entry = (window.WorldGen && window.WorldGen.NPCs || {})[key];
      return entry && entry.theme === "Arcane";
    });
    return arcane.length > 0 ? arcane : casters;
  }

  // The sheets one story mode dossier may be worn as, by pool key. Exported so
  // the sprite board can be opened on that dossier's own looks and no others.
  function getStoryModeSpritePool(poolKey) {
    return storyModeSpritePool(poolKey) || [];
  }

  function storyModeSpritePool(poolKey) {
    if (poolKey === "slime") return STORY_MODE_SLIME_SPRITES;
    // A goblin is a humanoid with a goblin's face, not an archetype of its own,
    // so the pool is the sheets whose own names say goblin.
    if (poolKey === "goblin") return storyModeCatalogPool("Humanoid")
      .filter((key) => /goblin/i.test(key));
    if (poolKey === "witch") return storyModeWitchSpritePool();
    return STORY_MODE_SPRITE_LISTS[poolKey] || null;
  }

  const STORY_MODE_PRESETS = [
    {
      id: 9001,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 2, // Witch
      spritePoolKey: "witch",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: what a witch is, spelled out.
      traits: [193, 190], // Witch-Marked, Magically Gifted
      specializations: [
        { id: 255, level: 4 }, // Spellcraft
        { id: 165, level: 3 }, // Magic Theory
        { id: 134, level: 2 }, // Herbalism
        { id: 271, level: 2 }, // Tarot Reading
      ],
    },
    {
      id: 9002,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 18, // Pro Wrestler
      spritePoolKey: "wrestler",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: the ring, and the show it puts on.
      traits: [153, 6], // Brawler, Athletic
      specializations: [
        { id: 301, level: 4 }, // Wrestling
        { id: 124, level: 3 }, // Grappling
        { id: 24, level: 2 },  // Athletics
        { id: 3, level: 2 },   // Acting
      ],
    },
    {
      id: 9003,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 16, // Gunmancer
      spritePoolKey: "goblin",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: a gun in one hand, a spell in the
      // other, which is the whole of what a gunmancer is.
      traits: [202, 190, 12], // Gun-Fu, Magically Gifted, Marksman
      specializations: [
        { id: 896, level: 4 }, // Gun
        { id: 255, level: 3 }, // Spellcraft
        { id: 222, level: 2 }, // Weapon Reloading
        { id: 28, level: 2 },  // Ballistics
      ],
    },
    {
      id: 9004,
      storyModeOnly: true,
      endless: true,
      characterType: "creature",
      archetypes: ["Slime"],
      classId: 64, // Mimic
      spritePoolKey: "slime",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: something that is never quite
      // whatever it is currently pretending to be.
      traits: [201, 179, 97], // Prosopometamorphopsia, Cold-Blooded, Survivalist
      specializations: [
        { id: 84, level: 4 },  // Deception
        { id: 3, level: 3 },   // Acting
        { id: 803, level: 2 }, // Voice Acting
        { id: 174, level: 2 }, // Meditation
      ],
    },
    {
      id: 9005,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 22, // Paladin
      spritePoolKey: "paladin",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: what a paladin already is.
      traits: [116, 155, 11], // Devout, Shield Master, Defensive
      specializations: [
        { id: 889, level: 4 }, // Sword
        { id: 620, level: 3 }, // Heavy Armor Training
        { id: 277, level: 2 }, // Theology
        { id: 645, level: 2 }, // Jousting
      ],
    },
    {
      id: 9006,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 49, // Psyker
      spritePoolKey: "psyker",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: what a psyker already is.
      traits: [196, 122, 52], // Clairvoyant, Prophetic, Synesthete
      specializations: [
        { id: 275, level: 4 }, // Telepathy
        { id: 274, level: 3 }, // Telekinesis
        { id: 66, level: 2 }, // Clairvoyance
        { id: 174, level: 2 }, // Meditation
      ],
    },
    {
      id: 9007,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 35, // Bard
      spritePoolKey: "bard",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: what a bard already is.
      traits: [144, 197, 8], // Beautiful, Booming Voice, Lucky
      specializations: [
        { id: 208, level: 4 }, // Playing Guitar
        { id: 183, level: 3 }, // Music Composition
        { id: 218, level: 2 }, // Public Speaking
        { id: 3, level: 2 }, // Acting
      ],
    },
    {
      id: 9008,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 12, // Enchanter
      spritePoolKey: "enchanter",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: what a enchanter already is.
      traits: [190, 139, 41], // Magically Gifted, Alchemist, Photographic Memory
      specializations: [
        { id: 731, level: 4 }, // Runecrafting
        { id: 255, level: 3 }, // Spellcraft
        { id: 805, level: 2 }, // Wand Making
        { id: 309, level: 2 }, // Alchemy
      ],
    },
    {
      id: 9009,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 5, // Convoker
      spritePoolKey: "convoker",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: what a convoker already is.
      traits: [99, 118, 186], // Cursed, Heretic, Beast Whisperer
      specializations: [
        { id: 510, level: 4 }, // Binding
        { id: 571, level: 3 }, // Divination
        { id: 515, level: 2 }, // Blood Magic
        { id: 277, level: 2 }, // Theology
      ],
    },
    {
      id: 9010,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 3, // Nun
      spritePoolKey: "nun",
      spriteIndex: 0,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "heterosexual",
      romanticOrientation: "heteroromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: what a nun already is.
      traits: [100, 119, 121], // Blessed, Pilgrim, Monk-Trained
      specializations: [
        { id: 277, level: 4 }, // Theology
        { id: 663, level: 3 }, // Mantra Chanting
        { id: 535, level: 2 }, // Choir Singing
        { id: 174, level: 2 }, // Meditation
      ],
    },
    {
      id: 9011,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 3, // Nun
      spritePoolKey: "nun",
      spriteIndex: 0,
      gender: 1,
      noBust: true,
      level: 1,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "asexual",
      romanticOrientation: "aromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: a clever tongue kept inside a
      // habit.
      traits: [7, 166, 172], // Genius, Cynic, Blunt
      specializations: [
        { id: 277, level: 4 }, // Theology
        { id: 199, level: 3 }, // Philosophy
        { id: 550, level: 2 }, // Creative Writing
        { id: 535, level: 2 }, // Choir Singing
      ],
    },
    {
      id: 9012,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 36, // Illusionist
      spritePoolKey: "goblin",
      spriteIndex: 0,
      gender: 1,
      noBust: true,
      level: 1,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "asexual",
      romanticOrientation: "aromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: a mind that never trusts what
      // it is shown, working the trade of showing things.
      traits: [5, 201, 190], // Paranoid, Prosopometamorphopsia, Magically Gifted
      specializations: [
        { id: 632, level: 4 }, // Illusion Magic
        { id: 137, level: 3 }, // Hypnosis
        { id: 84, level: 2 },  // Deception
        { id: 255, level: 2 }, // Spellcraft
      ],
    },
    {
      id: 9013,
      storyModeOnly: true,
      endless: true,
      characterType: "humanoid",
      classId: 2, // Witch
      spritePoolKey: "witch",
      spriteIndex: 0,
      gender: 0,
      noBust: true,
      level: 1,
      mapId: 1414,
      x: 87,
      y: 30,
      switches: [],
      sexualOrientation: "homosexual",
      romanticOrientation: "homoromantic",
      money: 0,
      items: [],
      weapons: [],
      armors: [],
      equips: [null, null, null, null, null],
      skills: [],
      // Fixed, and the same in every story mode: reading rather than shouting,
      // and a witch's mark under all of it.
      traits: [95, 132, 190], // Stoic, Scholar, Magically Gifted
      specializations: [
        { id: 165, level: 4 }, // Magic Theory
        { id: 255, level: 3 }, // Spellcraft
        { id: 62, level: 2 },  // Chess
        { id: 135, level: 2 }, // History
      ],
    },
  ];

  // The story mode's own dossiers are authored as much as the ones above.
  STORY_MODE_PRESETS.forEach((preset) => AUTHORED_PRESET_IDS.add(preset.id));

  /**
   * Every field the story mode rolls fresh for one dossier: a Markov name, a
   * random gender (0 male / 1 female / 2 non-binary / 3 cocoon) unless the
   * dossier pins one, and, for a dossier drawing from a sprite pool, the
   * sprite and, unless the dossier goes faceless, the bust to go with it.
   * @param {object} preset - Entry from STORY_MODE_PRESETS
   * @returns {object} { name, gender, sprite?, busts? }
   */
  function rollStoryModePresetFields(preset) {
    const roll = {
      gender: typeof preset.gender === "number"
        ? preset.gender
        : Math.floor(Math.random() * 4),
    };

    if (window.generateSeededMarkovName) {
      const seed = Date.now() + preset.id * 1000;
      const name = window.generateSeededMarkovName(
        Math.floor(seed / 1000) % 1000000,
        Math.floor(Math.random() * 1000000),
        preset.id,
        "names", 2, 4, 12
      );
      roll.name = (name && !/unknown/i.test(name)) ? name : "";
    }
    if (!roll.name) {
      roll.name = T('CharPresets.storyModeFallbackName') + " " + preset.id;
    }

    if (preset.spritePoolKey) {
      const pool = storyModeSpritePool(preset.spritePoolKey);
      const sprite = pool && pool.length
        ? pool[Math.floor(Math.random() * pool.length)]
        : null;
      if (sprite) {
        roll.sprite = sprite;
        const catalog = (window.WorldGen && window.WorldGen.NPCs) || {};
        const entry = catalog[sprite];
        roll.busts = preset.noBust
          ? ""
          : (entry && entry.busts && entry.busts[0]) || "";
      }
    }

    return roll;
  }

  /**
   * The per-save cache the story mode's rolled dossier fields live in, so the
   * board and the dossier page agree while the player is browsing it.
   * @returns {object} presetId -> rolled fields
   */
  function storyModePresetRollCache() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return {};
    if (!$gameSystem._storyModePresetRoll) $gameSystem._storyModePresetRoll = {};
    return $gameSystem._storyModePresetRoll;
  }

  /**
   * Re-rolls every story mode dossier. Called once whenever the story mode's
   * character creation opens, so no two story modes look alike; the rolled
   * fields then stay stable (see getStoryModeCharacterPresets) for the rest
   * of that session.
   */
  function resetStoryModePresetRolls() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return;
    $gameSystem._storyModePresetRoll = {};
  }

  /**
   * The story mode's three dossiers, with this session's rolled name/gender/
   * sprite filled in (rolling them now if nothing has yet).
   * @returns {array} Array of preset objects
   */
  function getStoryModeCharacterPresets() {
    const cache = storyModePresetRollCache();
    return STORY_MODE_PRESETS.map((preset) => {
      if (!cache[preset.id]) cache[preset.id] = rollStoryModePresetFields(preset);
      const roll = cache[preset.id];
      return Object.assign({}, preset, {
        name: roll.name,
        gender: roll.gender,
        sprite: roll.sprite || preset.sprite,
        busts: roll.busts || preset.busts,
      });
    });
  }

  /**
   * Whether the story mode's dossier board should be shown instead of the
   * world's own preset pool: the in-scene flag while the wizard is running,
   * falling back to the switch (cleared at the add-member step, mirroring
   * CharacterCreation.js's own isStoryModeFlow).
   * @returns {boolean} True while the story mode's creation flow is active
   */
  function isStoryModePresetFlow() {
    if (typeof Scene_CharacterCreation !== "undefined" && Scene_CharacterCreation && Scene_CharacterCreation._storyMode) {
      return true;
    }
    return !!($gameSwitches && $gameSwitches.value(100));
  }

  //=============================================================================
  // Procedural dossier lore (Em)
  //=============================================================================
  // Em is the one dossier that is never spent (endless: true), and the reason is
  // diegetic: the Em who walks out of character creation is never the same Em.
  // Each pick is a different branch of her, so her background cannot be a fixed
  // paragraph. It is composed out of five banks, one sentence each, from a seed
  // rolled once per playthrough and kept on $gameSystem (_emDimensionSeed): the
  // text is therefore stable while the player browses the dossier and for the
  // whole life of the resulting save, and freshly rolled on the next new game.

  const EM_BANK_COUNT = 5;

  /**
   * 32-bit integer hash, the same avalanche mix the other world-seeded
   * generators use, so one seed spreads evenly over the banks.
   * @param {number} n - Input integer
   * @returns {number} Hashed unsigned 32-bit integer
   */
  function mix32(n) {
    let h = n | 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /**
   * The dimension Em is arriving from in this playthrough. Rolled on first use
   * and stored on $gameSystem, so it is stable for this save and different in
   * the next new game (where $gameSystem is fresh). Mixed with the world seed so
   * the roll still belongs to the world it happens in.
   * @returns {number} Seed for buildEmLore
   */
  function emDimensionSeed() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return 1;
    if (!$gameSystem._emDimensionSeed) {
      const worldSeed = window.HistoryManager && window.HistoryManager.getSeed
        ? window.HistoryManager.getSeed() | 0
        : 0;
      const roll = Math.floor(Math.random() * 0x7fffffff);
      $gameSystem._emDimensionSeed = mix32(worldSeed ^ roll) || 1;
    }
    return $gameSystem._emDimensionSeed;
  }

  /**
   * Ninety-two percent of Em's memories were spent on the spear, and her own
   * history reads that way: a share of the longer words in every paragraph
   * goes under the archive marker. Which words go is seeded off the world seed
   * and the paragraph index, so one world always blacks out the same words and
   * the page does not flicker as it is re-rendered.
   * @param {string} text - One backstory paragraph
   * @param {number} index - Paragraph index, part of the seed
   * @returns {string} The paragraph with some words redacted
   */
  function redactEmMemories(text, index) {
    const worldSeed = window.HistoryManager && window.HistoryManager.getSeed
      ? window.HistoryManager.getSeed() | 0
      : 0;
    let state = mix32(worldSeed ^ mix32(index + 1)) || 1;
    const next = () => {
      state = mix32(state);
      return state / 0x100000000;
    };
    return String(text || "").replace(/[A-Za-z']{5,}/g, (word) =>
      next() < 0.3 ? "█".repeat(Math.min(9, word.length)) : word);
  }

  /**
   * Compose one Em background out of the banks.
   * @param {number} seed - Dimension seed
   * @returns {{en: string, it: string}} Localized lore
   */
  function buildEmLore(seed) {
    const parts = [];
    for (let i = 0; i < EM_BANK_COUNT; i++) {
      const bank = T.pool('CharPresets.emBank.' + i);
      if (bank.length) parts.push(bank[mix32(seed + i * 0x9e3779b9) % bank.length]);
    }
    return parts.join(" ");
  }

  /**
   * Whether this playthrough's Em is the world's first: the native one, born in
   * Wimbledon on this very branch, rather than one who fell in from elsewhere.
   * Read off the same counter emHometown() locks its own answer from, so the
   * two stay in step (Wimbledon + the fixed canon lore, or a rhyming town +
   * a rolled branch).
   * @returns {boolean} True when no Em has been taken from this world before
   */
  function isFirstEmIncarnation() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return true;
    return ($gameSystem._emIncarnations | 0) === 0;
  }

  /**
   * Lore of a dossier, resolving procedural backgrounds. Every consumer of
   * preset.lore should go through this instead of reading the field directly.
   * The world's first Em never fell from anywhere: she is native to this
   * branch, so her dossier reads the fixed canon lore instead of a rolled
   * "fell through a door" background. Every Em after her is a genuine drifter
   * and gets the fully random composed one.
   * @param {object} preset - Preset dossier
   * @returns {string} Lore in the active language, or "" when there is none
   */
  function getPresetLore(preset) {
    if (!preset) return "";
    if (preset.proceduralLore === "em") {
      // Her history is written (docs/Lore.odt), not rolled: the same paragraphs
      // the status sheet and the Empathize panel print. The rolled branch is
      // still what buildEmLore answers, and getEmBackstory hands it over
      // separately as the branch this Em arrived from.
      return getEmBackstory().paragraphs.join("<br><br>");
    }
    // Keyed by the dossier's own slug, not by its numeric id: ids have been
    // reused and retired as presets came and went, and a shifted id silently
    // handed one character another one's biography.
    if (preset.loreKey) {
      const slugKey = 'CharPresets.lore.' + preset.loreKey;
      if (T.has(slugKey)) return T(slugKey);
    }
    const key = 'CharPresets.lore.' + preset.id;
    if (T.has(key)) return T(key);
    // A retired party member's generated dossier carries its own sentence.
    const own = preset.lore;
    if (!own) return "";
    return typeof own === "string" ? own : (T.language() === "it" ? (own.it || own.en) : (own.en || own.it)) || "";
  }

  //=============================================================================
  // Procedural hometown (Em)
  //=============================================================================
  // Em is always British, in every branch she falls out of, but only the first
  // Em a world ever receives is from the Wimbledon that exists here. Every one
  // after her comes from a town that rhymes with it and does not exist on this
  // branch's maps: Kembledon, Brambledon, Thimbledon. The number of Ems a world
  // has already taken lives in $gameSystem._emIncarnations (world-scoped, see
  // recordEndlessPick), and the town picked for THIS playthrough is locked onto
  // $gameSystem._emHometown the first time anything asks for it, exactly like
  // the dimension seed: the dossier the player reads is the dossier they get,
  // and it stays that way for the life of the save even after the world counter
  // has moved on for the next playthrough.

  const EM_HOMETOWN_ORIGINAL = "Wimbledon";   // i18n-ignore: place name

  // First syllables; the suffix is always "bledon".
  // i18n-ignore-start: syllables of an invented place name, not prose
  const EM_TOWN_PREFIXES = [
    "Wem", "Ham", "Hem", "Kem", "Cam", "Bram", "Grim", "Tram", "Dun", "Fen",
    "Marl", "Pen", "Rud", "Sud", "Thim", "Tarn", "Wal", "Wor", "Yar", "Shel",
    "Stan", "Nor", "Hal", "Mor", "Pil", "Wen", "Wist", "Cor", "Ram", "Tid",
  ];
  // i18n-ignore-end

  /**
   * Name of the town this Em is from, for every incarnation after the first.
   * @param {number} seed - Dimension seed
   * @param {number} index - How many Ems this world has already taken
   * @returns {string} Town name ending in "bledon"
   */
  function buildEmTownName(seed, index) {
    const roll = mix32(seed + (index | 0) * 0x85ebca6b);
    return EM_TOWN_PREFIXES[roll % EM_TOWN_PREFIXES.length] + "bledon";
  }

  /**
   * Hometown of the Em of this playthrough. Rolled and locked on first use.
   * @returns {string} Town name
   */
  function emHometown() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) {
      return EM_HOMETOWN_ORIGINAL;
    }
    if (!$gameSystem._emHometown) {
      const index = $gameSystem._emIncarnations | 0;
      $gameSystem._emHometown = index > 0
        ? buildEmTownName(emDimensionSeed(), index)
        : EM_HOMETOWN_ORIGINAL;
    }
    return $gameSystem._emHometown;
  }

  /**
   * Hometown of a dossier, resolving procedural ones. Consumers should go
   * through this instead of reading preset.hometown directly.
   * @param {object} preset - Preset dossier
   * @returns {string} Town name, or "" when the dossier names no town
   */
  function getPresetHometown(preset) {
    if (!preset) return "";
    if (preset.proceduralHometown === "em") return emHometown();
    return preset.hometown || "";
  }

  //=============================================================================
  // Em's canon backstory (docs/Lore.odt)
  //=============================================================================
  // The branch she fell out of is rolled (buildEmLore above), but what was done
  // to her is fixed in every one of them, and it is the only party member's
  // history the life simulator can never produce: she has no simulated past,
  // because the Solomonic Ritual took it. The Empathize History tab prints this
  // whenever Em is the one being looked at. {town} is her rolled hometown.


  /**
   * Em's fixed history, with her rolled hometown filled in.
   * @param {string} [lang] - "it" or "en" (defaults to the current language)
   * @returns {{paragraphs: string[], branch: string}} Canon paragraphs plus the
   *   procedural paragraph describing the branch THIS Em arrived from
   */
  function getEmBackstory(lang) {
    const code = (lang || (typeof ConfigManager !== "undefined" ? ConfigManager.language : "en")) === "it" ? "it" : "en";
    const preset = getBasePresets().find((entry) => entry && entry.proceduralLore === "em") || null;
    const town = getPresetHometown(preset) || EM_HOMETOWN_ORIGINAL;
    // The branch this Em fell out of, straight from its generator: the written
    // history is what getPresetLore now answers with, so reading it back here
    // would only hand this function its own paragraphs.
    const lore = isFirstEmIncarnation()
      ? T('CharPresets.emOriginalLore')
      : buildEmLore(emDimensionSeed());
    return {
      paragraphs: T.pool('CharPresets.emBackstory').map((line, index) =>
        redactEmMemories(line.replace(/\{town\}/g, town), index)
      ),
      branch: lore || "",
    };
  }

  //=============================================================================
  // Em's register (UI relabelling while she is in play)
  //=============================================================================
  // Em is twenty-something, British, missing most of her life and refuses to
  // treat any of it with the gravity everyone else does. While she is in the
  // party the interface picks up her vocabulary: nobody rests, they nap; nobody
  // waits, they waste time; the party's leisure meter is a boredom meter. It is
  // cosmetic only, so every consumer passes the ordinary label as the fallback
  // and gets it straight back on an ordinary playthrough.
  //
  // Switch 48 is Em's dossier switch, 49 is Bubba's. The camper is The Beast to
  // both of them (it is his, and they share it), so its rename answers to
  // either, while the rest of the register is Em's alone.

  const EM_SWITCH = 48;
  // Switch 100 is the one the title screen turns on when a story run starts
  // (Titlescreen.js). Nothing else marks a save as story mode, so every reader
  // of isStoryMode() must ask this switch and no other.
  const STORY_MODE_SWITCH = 100;
  const BUBBA_SWITCH = 49;
  const EM_NAME = "Em";

  // Story mode is Em's story, so the wizard is not a wizard while it is running:
  // she is who she is. Her name, her face, her body, her class, her creed and
  // her (absent) job are all settled before the player ever sees the sheet, and
  // every control that would edit one of them answers to this predicate rather
  // than re-deriving "is this Em" from a literal of its own.
  const EM_PRESET_ID = 2;
  const EM_STORY_CLASS_ID = 16;      // Gunmancer
  const EM_STORY_GENDER = 1;         // Female
  // What she wakes up believing: Thelema, the creed of a witch who was left
  // with her will and nothing else. It is the one part of her sheet the player
  // is allowed a say in, and only within this shelf: a handful of creeds a
  // memory-wiped, gun-casting anarchist witch could plausibly hold. Everything
  // outside it is somebody else's Em.
  const EM_STORY_IDEOLOGY = "thelemic_magus";
  const EM_STORY_IDEOLOGY_CHOICES = [
    "thelemic_magus",
    "traditionalist_witch",
    "esoteric_psychologist",
    "metamagical_imaginism",
    "discordian_chaos",
    "individualist_egoist",
    "anarcho_syndicalist",
  ];
  const EM_STORY_JOB_ID = 0;         // No profession, and no way to pick one

  /**
   * Whether the wizard is currently editing story mode's Em: the one character
   * whose dossier the player is given rather than allowed to write.
   * @param {object} [actor] - Actor to test (defaults to the current member)
   * @returns {boolean} True while story mode is running on Em's own sheet
   */
  function isStoryModeEm(actor) {
    if (!isStoryModePresetFlow()) return false;
    if (typeof Scene_CharacterCreation === "undefined" || !Scene_CharacterCreation) return false;
    if (!actor && Scene_CharacterCreation.getCurrentActor) {
      actor = Scene_CharacterCreation.getCurrentActor();
    }
    if (!actor) return false;
    if (actor._presetId === EM_PRESET_ID) return true;
    const name = String(actor._presetName || (actor.name && actor.name()) || "").trim().toLowerCase();
    const key = String(actor._presetKey || "").trim().toLowerCase();
    return name === "em" || key === "em";
  }

  /**
   * The fields story mode holds Em to, for the controls that need to show them
   * as fixed rather than editable.
   * @returns {object} { presetId, classId, gender, ideologyId, jobId }
   */
  function storyModeEmLocks() {
    return {
      presetId: EM_PRESET_ID,
      classId: EM_STORY_CLASS_ID,
      gender: EM_STORY_GENDER,
      ideologyId: EM_STORY_IDEOLOGY,
      ideologyChoices: EM_STORY_IDEOLOGY_CHOICES.slice(),
      jobId: EM_STORY_JOB_ID
    };
  }

  /**
   * The creeds story mode lets the player hold Em to. The first of them is the
   * one she opens on.
   * @returns {string[]} Ideology.json ids, in the order they are offered
   */
  function storyModeEmIdeologyChoices() {
    return EM_STORY_IDEOLOGY_CHOICES.slice();
  }

  /**
   * Writes the locked fields onto Em's actor, so the sheet the player is shown
   * is the sheet the party starts with even if some earlier step wrote its own
   * value in. Safe to call on every render.
   * @param {object} actor - Em's actor
   */
  function applyStoryModeEmLocks(actor) {
    if (!actor || !isStoryModeEm(actor)) return;
    const locks = storyModeEmLocks();
    if (actor._classId !== locks.classId) {
      if (actor.changeClass) actor.changeClass(locks.classId, true);
      else actor._classId = locks.classId;
    }
    actor._gender = locks.gender;
    if (actor.setGender) actor.setGender(locks.gender);
    if (typeof $gameVariables !== "undefined" && $gameVariables) {
      const idx = (typeof Scene_CharacterCreation !== "undefined" && Scene_CharacterCreation._currentPartyMemberIndex) || 0;
      $gameVariables.setValue(38 + idx, locks.gender);
    }
    // The creed is a default, not a lock: whatever the player picked off the
    // shelf stands, and only a creed from outside it is written back.
    if (!EM_STORY_IDEOLOGY_CHOICES.includes(String(actor._ideologyId || ""))) {
      actor._ideologyId = locks.ideologyId;
    }
    actor._jobId = locks.jobId;
  }


  /**
   * Whether Em is in play. Switch 48 is set by her dossier when creation ends,
   * so it survives her being handed the party lead later; the name check covers
   * an Em who joined outside creation, or a run whose switches were reset.
   * @returns {boolean} True while Em travels with the party
   */
  function isEmPlaythrough() {
    if (typeof $gameSwitches !== "undefined" && $gameSwitches && $gameSwitches.value(EM_SWITCH)) {
      return true;
    }
    if (typeof $gameParty !== "undefined" && $gameParty && $gameParty.members) {
      return $gameParty.members().some((member) => member && member.name() === EM_NAME);
    }
    return false;
  }

  /**
   * Whether one actor IS Em: her dossier's preset, or her name on a member who
   * joined outside creation. The one answer anything asking "is this Em"
   * reads, so no other plugin re-derives her from a literal.
   * @param {object} actor - Actor to test
   * @returns {boolean} True when the actor is Em
   */
  function isEmActor(actor) {
    if (!actor) return false;
    if (actor._presetId === EM_PRESET_ID) return true;
    const name = typeof actor.name === "function" ? actor.name() : actor._presetName;
    return String(name || "").trim() === EM_NAME;
  }

  /**
   * Whether the camper is The Beast for this party: Em's dossier, Bubba's, or
   * either of them travelling with it.
   * @returns {boolean} True when the camper answers to its name
   */
  function isBeastCrew() {
    if (typeof $gameSwitches !== "undefined" && $gameSwitches &&
      ($gameSwitches.value(EM_SWITCH) || $gameSwitches.value(BUBBA_SWITCH))) {
      return true;
    }
    return isEmPlaythrough();
  }

  /**
   * Whether the story mode is running. The story mode is played as Em, but it
   * is the guided way in and keeps the plain menu wording rather than her own.
   * @returns {boolean} True while the story mode switch is on
   */
  function isStoryMode() {
    return typeof $gameSwitches !== "undefined" && !!$gameSwitches &&
      !!$gameSwitches.value(STORY_MODE_SWITCH);
  }

  /**
   * A label in Em's register, or the ordinary one when she is not in play or
   * the story mode is running.
   * @param {string} key - Key into CharPresets.emLabel
   * @param {string} fallback - Label used on an ordinary playthrough
   * @returns {string} Label to display
   */
  function emLabel(key, fallback) {
    if (isStoryMode()) return fallback;
    if (!isEmPlaythrough()) return fallback;
    const full = 'CharPresets.emLabel.' + key;
    return T.has(full) ? T(full) : fallback;
  }

  /**
   * A line for Em to heckle the player with when her dossier is sitting on the
   * board unpicked. Random each call, but never the same line twice in a row.
   * @param {string} [lastLine] - The line shown last, so it can be excluded
   * @returns {string} One of CharPresets.emRestlessLines
   */
  function getEmRestlessLine(lastLine) {
    const pool = T.pool('CharPresets.emRestlessLines');
    if (!pool || !pool.length) return '';
    if (pool.length === 1) return pool[0];
    let line = lastLine;
    while (line === lastLine) {
      line = pool[Math.floor(Math.random() * pool.length)];
    }
    return line;
  }

  /**
   * What the camper is called for this party.
   * @param {string} [fallback] - Name used by everyone else
   * @returns {string} "The Beast" for Em and Bubba, the fallback otherwise
   */
  function camperName(fallback) {
    const plain = fallback || T('CharPresets.camper');
    if (!isBeastCrew()) return plain;
    return T('CharPresets.theBeast');
  }

  //=============================================================================
  // Preset Management Functions
  //=============================================================================

  /**
   * Hand-authored + save-local presets, the array that write operations own
   * @returns {array} Array of preset objects (live reference, safe to mutate)
   */
  function getBasePresets() {
    // $gameSystem is serialized into the save file, so presets stored here
    // survive a restart. $dataSystem is re-seeded from the database on every
    // boot and is never serialized, so it must not be used for persistence.
    if (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._characterPresets) {
      return $gameSystem._characterPresets;
    }
    return CharacterPresets;
  }

  /**
   * Retired party members, world-scoped (see retirePartyMember)
   * @returns {array} Array of preset objects
   */
  function getRetiredPresets() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return [];
    const list = $gameSystem._retiredCharacterPresets;
    return Array.isArray(list) ? list : [];
  }

  /**
   * Get current character presets (dossiers + retired party members)
   * @returns {array} Array of preset objects (read-only: may be a fresh array)
   */
  function getCharacterPresets() {
    const base = getBasePresets();
    const retired = getRetiredPresets();
    const all = retired.length ? base.concat(retired) : base.slice();
    // Endless dossiers (Em) head the board: they are the only ones always
    // there, whatever the world has already spent. Sorted rather than kept
    // first in the array literal, so presets restored from an older save
    // ($gameSystem._characterPresets) come out in the same order too.
    return all.sort((a, b) => (b.endless ? 1 : 0) - (a.endless ? 1 : 0));
  }

  //=============================================================================
  // Per-world preset usage
  //=============================================================================
  // A pre-made character belongs to the world, not to a single playthrough: once
  // someone has started as Bubba in a world, that dossier is spent and no later
  // savegame of the same world can pick it again. The used ids live on
  // $gameSystem._usedCharacterPresets, which WorldManager redirects into the
  // world folder (world.json). Without WorldManager it degrades gracefully to a
  // plain per-save property.

  /**
   * Ids of presets already played in the current world
   * @returns {number[]} Used preset ids
   */
  function getUsedPresetIds() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return [];
    const ids = $gameSystem._usedCharacterPresets;
    return Array.isArray(ids) ? ids : [];
  }

  /**
   * Whether a dossier is exempt from the one-play-per-world rule. Em is the only
   * one: she is a different Em every time, so there is nothing to spend.
   * @param {number} presetId - Preset ID
   * @returns {boolean} Endless status
   */
  function isPresetEndless(presetId) {
    const preset = getCharacterPresets().find((entry) => entry.id === presetId);
    return !!(preset && preset.endless);
  }

  /**
   * Whether a preset has already been played in this world
   * @param {number} presetId - Preset ID
   * @returns {boolean} Used status
   */
  function isPresetUsed(presetId) {
    if (isPresetEndless(presetId)) return false;
    return getUsedPresetIds().indexOf(presetId) >= 0;
  }

  /**
   * Count an endless dossier being played, so the world knows how many of her
   * it has already taken (Em's hometown is her incarnation number, see
   * emHometown). Assigns rather than increments in place, because the field is
   * a WorldManager getter/setter pair backed by world.json.
   * @param {number} presetId - Preset ID being played
   */
  function recordEndlessPick(presetId) {
    const preset = getCharacterPresets().find((entry) => entry.id === presetId);
    if (!preset || preset.proceduralHometown !== "em") return;
    // Resolve before bumping: the town this playthrough gets is the one the
    // dossier showed, and the new count only applies to the next Em.
    emHometown();
    $gameSystem._emIncarnations = ($gameSystem._emIncarnations | 0) + 1;
  }

  /**
   * Retire a preset for the whole world (called when one is picked)
   * @param {number} presetId - Preset ID
   */
  function markPresetUsed(presetId) {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return;
    if (!(presetId > 0)) return;
    recordEndlessPick(presetId);
    if (isPresetEndless(presetId) || isPresetUsed(presetId)) return;
    // Assign a new array instead of pushing: the WorldManager-backed field is a
    // getter/setter pair, so only a completed write reaches the world file.
    $gameSystem._usedCharacterPresets = getUsedPresetIds().concat(presetId);
  }

  /**
   * Undo markPresetUsed. Only called while character creation is still open,
   * for a dossier applied to a seat and then abandoned before the party was
   * confirmed, so backing out of a pick does not spend it for the world.
   * @param {number} presetId - Preset ID
   */
  function unmarkPresetUsed(presetId) {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return;
    if (!(presetId > 0)) return;
    $gameSystem._usedCharacterPresets = getUsedPresetIds().filter((id) => id !== presetId);
  }

  /**
   * Presets that can still be picked in this world
   * @returns {array} Array of preset objects
   */
  function getAvailableCharacterPresets() {
    // The story mode offers its own three dossiers and nothing else (see
    // STORY_MODE_PRESETS above); the world's own pool is never mixed in.
    if (isStoryModePresetFlow()) return getStoryModeCharacterPresets();
    const used = getUsedPresetIds();
    // A hidden dossier is a record the game still owns but never offers: it is
    // filtered out of the board only, so lookups by id, a save that already
    // carries the character, and the story mode's own flow are untouched.
    return getCharacterPresets().filter(
      (preset) => !preset.hidden && (preset.endless || used.indexOf(preset.id) < 0)
    );
  }

  //=============================================================================
  // Dossier skins (alternate looks)
  //=============================================================================
  // A dossier without a `skins` list still has exactly one look, built here out
  // of the fields it already carries, so every consumer can treat presets
  // uniformly instead of branching on whether alternates exist. The first entry
  // is always the dossier's own sprite and bust.

  /**
   * Every look a dossier can be played as.
   * @param {object} preset - Preset dossier
   * @returns {Array<{key: string, sprite: string, spriteIndex: number, busts: string}>}
   */
  function getPresetSkins(preset) {
    if (!preset) return [];
    if (Array.isArray(preset.skins) && preset.skins.length > 0) return preset.skins;
    return [{
      key: "",
      sprite: preset.sprite,
      spriteIndex: preset.spriteIndex || 0,
      busts: preset.busts,
    }];
  }

  /**
   * One look of a dossier, by position. Out-of-range indices wrap back to the
   * dossier's own look rather than returning nothing.
   * @param {object} preset - Preset dossier
   * @param {number} index - Position in the skin list
   * @returns {object|null} Skin record
   */
  function getPresetSkin(preset, index) {
    const skins = getPresetSkins(preset);
    if (skins.length === 0) return null;
    const i = Number(index) || 0;
    return skins[(i % skins.length + skins.length) % skins.length];
  }

  /**
   * What a skin reads as on the dossier page.
   * @param {object} skinData - Skin record from getPresetSkins
   * @returns {string} Localized label
   */
  function getPresetSkinLabel(skinData) {
    if (!skinData || !skinData.key) return "";
    return T("CharPresets.skin." + skinData.key);
  }

  //=============================================================================
  // Dossier 3D models
  //=============================================================================
  // A dossier can ship a 3D model of the person it describes (`model`, a path to
  // a GLB). Where a screen would otherwise draw that character's flat bust as a
  // portrait, it draws this model: the status sheet's portrait frame and the
  // Empathize panel both ask for it here, so the two can never disagree about
  // what the character looks like. Only Em has one.

  /**
   * The model file a dossier is portrayed by, if it has one.
   * @param {object} preset - Preset dossier
   * @returns {string|null} Path to the GLB, or null when the dossier has none
   */
  function getPresetModel(preset) {
    const path = preset && preset.model;
    return (typeof path === "string" && path) ? path : null;
  }

  /**
   * The dossier a party member was made from. Matched on the bust the dossier
   * gave them first, so a character the player renamed is still recognised as
   * long as they still wear the dossier's face, and on the name second, for a
   * dossier character who joined without one being set.
   * @param {Game_Actor} actor - Party member
   * @returns {object|null} Preset dossier
   */
  function findPresetForActor(actor) {
    if (!actor) return null;
    const presets = getCharacterPresets();
    if (!presets.length) return null;
    const bust = actor.vnBust ? actor.vnBust() : null;
    if (bust && bust !== "7" && bust !== 0) {
      const byBust = presets.find((preset) => preset.busts === bust);
      if (byBust) return byBust;
    }
    const name = actor.name ? String(actor.name() || "").trim().toLowerCase() : "";
    if (!name) return null;
    return presets.find((preset) => String(preset.name ?? "").trim().toLowerCase() === name) || null;
  }

  /**
   * The model a party member is portrayed by, from the dossier they came from.
   * @param {Game_Actor} actor - Party member
   * @returns {string|null} Path to the GLB, or null for everybody else
   */
  function getActorPresetModel(actor) {
    return getPresetModel(findPresetForActor(actor));
  }

  //=============================================================================
  // Preset -> Empathize identity sync
  //=============================================================================
  // Presets carry curated identity data (gender, orientation, birth date/
  // nation) that the character-creation dossier already displays, but that
  // data used to stop there: nothing carried it onto the actor or onto the
  // NPCSociety profile the Empathize menu reads from ($gameSystem._npcSociety,
  // keyed by name). Left alone, opening Empathize on a preset-based party
  // member (window.NPCEmpathize.openForActor) rolled a fresh, unrelated
  // random profile the first time it was viewed, contradicting the dossier
  // (wrong gender/pronouns, wrong birth year/place).
  //
  // ensureProfile() only exists once NPCSociety's DataLoader has finished its
  // async fetches, which is not guaranteed yet during character creation. So
  // rather than depending on the profile existing right now, the desired
  // identity is stashed on $gameSystem._pendingPartyIdentity[name] and
  // NPCSociety.ensureProfile (NPC/NPCSociety.js) applies it the moment the
  // profile is actually generated, whenever that happens to be.

  /**
   * Sync a preset's curated identity onto the actor and (eventually) its
   * Empathize/NPCSociety profile.
   * @param {object} preset - Preset dossier
   * @param {Game_Actor} actor - Actor the preset was just applied to
   */
  function applyPresetIdentity(preset, actor) {
    if (!preset || !actor) return;

    if (preset.gender !== undefined && actor.setGender) {
      actor.setGender(preset.gender);
    }

    const name = actor.name();
    if (!name || typeof $gameSystem === "undefined" || !$gameSystem) return;

    const pending = {};
    if (preset.gender !== undefined) pending.gender = preset.gender;
    if (preset.sexualOrientation) pending.sexualKey = preset.sexualOrientation;
    if (preset.romanticOrientation) pending.romanticKey = preset.romanticOrientation;
    if (preset.birthDate) {
      const year = parseInt(String(preset.birthDate).slice(0, 4), 10);
      if (!isNaN(year)) pending.birthYear = year;
    }
    // A named hometown is the more precise birthplace, so it wins over the
    // nation; it also becomes the party's hometown, the same field the
    // CharacterCreation hometown step writes (NPCSociety reads it for the
    // home-settlement opinion bonus).
    const hometown = getPresetHometown(preset);
    if (hometown) {
      pending.birthplace = hometown;
      $gameSystem._ccHometown = hometown;
    } else if (preset.nationId) {
      pending.birthplace = preset.nationId;
    }
    if (Object.keys(pending).length === 0) return;

    if (!$gameSystem._pendingPartyIdentity) $gameSystem._pendingPartyIdentity = {};
    $gameSystem._pendingPartyIdentity[name] = pending;

    // Opportunistic immediate apply: if NPCSociety is already loaded (e.g. a
    // preset picked mid-playthrough rather than at boot), this creates and
    // seeds the profile right away instead of waiting for the first
    // Empathize view. ensureProfile() consumes and clears the pending entry
    // itself, so this is safe to call even when it's a no-op.
    window.NPCSocietyRegistry?.ensureProfile?.(name, preset.classId);
  }

  //=============================================================================
  // Preset vehicles
  //=============================================================================
  //
  // A dossier can start its owner with a vehicle already parked somewhere (Em's
  // camper). The parked spot lives in window.VehiclePosition, the single source
  // of truth VehicleSystem re-places every Game_Vehicle from on map load, so the
  // vehicle shows up both on the map it is parked on and on the world map at the
  // dossier's world coordinates.

  // Vehicle key -> { Game_Vehicle type, availability switch, shared-slot
  // sub-type }. The Car, Bike, Boat and Broom all share the engine's single
  // 'boat' Game_Vehicle, so parking one of them also has to say which one the
  // slot currently stands for ($gameSystem._boatType). Only the Camper and the
  // Car are additionally gated by an availability switch; the rest are owned by
  // holding their summoning item.
  const PRESET_VEHICLES = {
    camper: { type: "ship", switchId: 51 },
    car: { type: "boat", switchId: 64, boatType: "car" },
    bike: { type: "boat", switchId: 0, boatType: "bike" },
    boat: { type: "boat", switchId: 0, boatType: "boat" },
    broom: { type: "boat", switchId: 0, boatType: "broom" },
    airship: { type: "airship", switchId: 0 }
  };

  /**
   * Park the vehicle a preset dossier ships with, if it has one.
   * @param {object} preset - Preset dossier (reads preset.vehicle)
   */
  function applyPresetVehicle(preset) {
    const spec = preset && preset.vehicle;
    if (!spec) return;

    const key = spec.key || "camper";
    const meta = PRESET_VEHICLES[key];
    if (!meta) {
      console.warn(`CharacterPresets: preset "${preset.name}" wants unknown vehicle "${key}"`);
      return;
    }

    const mapId = Number(spec.mapId) || 0;
    const x = Number(spec.x) || 0;
    const y = Number(spec.y) || 0;
    // World-map coords default to the tile itself when the vehicle is parked on
    // the world map, so a dossier only has to spell them out when it is not.
    const worldX = (spec.worldX !== undefined) ? Number(spec.worldX) : (mapId === 315 ? x : 0);
    const worldY = (spec.worldY !== undefined) ? Number(spec.worldY) : (mapId === 315 ? y : 0);

    if (window.VehiclePosition) {
      window.VehiclePosition.set(key, mapId, x, y, worldX, worldY);
    } else {
      console.warn("CharacterPresets: VehicleSystem not loaded; preset vehicle not parked.");
    }

    // The car, bike, boat and broom share the engine's single 'boat' vehicle, so
    // the shared slot has to be told which one it currently is.
    if (meta.boatType) $gameSystem._boatType = meta.boatType;

    // Makes the vehicle available to the menus and events that gate on it.
    if (meta.switchId > 0) $gameSwitches.setValue(meta.switchId, true);

    // Place it now as well: the player is transferred straight to the dossier's
    // home map, and reconcileToStore only moves vehicles on map load.
    const vehicle = (typeof $gameMap !== "undefined" && $gameMap) ? $gameMap.vehicle(meta.type) : null;
    if (vehicle) {
      vehicle.setLocation(mapId, x, y);
      vehicle.refresh();
    }
  }

  /**
   * Save character presets to game data
   * @param {array} presets - Array of preset objects
   */
  function saveCharacterPresets(presets) {
    // Persist on $gameSystem (serialized with the save file) rather than
    // $dataSystem (re-seeded from the database on boot, never saved).
    if (typeof $gameSystem !== "undefined" && $gameSystem) {
      $gameSystem._characterPresets = presets;
    }
  }

  /**
   * Get the next available preset ID
   * @returns {number} Next preset ID
   */
  function getNextPresetId() {
    // Base presets only: retired party members own the separate 1000+ band
    // (getNextRetiredPresetId), so the two never hand out the same id.
    const currentPresets = getBasePresets();
    if (currentPresets.length === 0) {
      return 1;
    }
    const maxId = Math.max(...currentPresets.map((preset) => preset.id || 0));
    return maxId + 1;
  }

  /**
   * Remove a preset by ID (called when pregenerated character dies)
   * @param {number} presetId - Preset ID to remove
   * @returns {boolean} Success status
   */
  function removePresetById(presetId, opts) {
    // An endless dossier survives its own death: killing one Em only ends that
    // branch of her, so she stays in the pool (permadeath calls this).
    if (isPresetEndless(presetId)) {
      return false;
    }
    // A hand-authored dossier is part of the game, not of the player's own
    // collection: the board may delete what the player saved, never this.
    if (opts && opts.playerOnly && isAuthoredPreset(presetId)) {
      return false;
    }

    // Retired party members live in the world folder, not in the preset array.
    // Assign a new array: the WorldManager-backed field is a getter/setter pair,
    // so only a completed write reaches world.json.
    const retired = getRetiredPresets();
    const retiredIndex = retired.findIndex((preset) => preset.id === presetId);
    if (retiredIndex >= 0) {
      const removed = retired[retiredIndex];
      $gameSystem._retiredCharacterPresets = retired.filter((_, i) => i !== retiredIndex);
      console.log(`Removed retired character from pool: "${removed.name}" (ID: ${presetId})`);
      return true;
    }

    const currentPresets = getBasePresets();
    const index = currentPresets.findIndex((preset) => preset.id === presetId);

    if (index >= 0) {
      const removedPreset = currentPresets[index];
      currentPresets.splice(index, 1);
      saveCharacterPresets(currentPresets);
      CharacterPresets = currentPresets;
      console.log(`Removed preset from pool: "${removedPreset.name}" (ID: ${presetId})`);
      return true;
    } else {
      console.warn(`Preset with ID ${presetId} not found in pool`);
      return false;
    }
  }

  /**
   * Save current character as preset
   */
  function saveCurrentCharacterAsPreset() {
    const actor = $gameParty.leader();
    if (!actor) {
      window.skipLocalization = true;
      $gameMessage.add(T('CharPresets.noCharacterToSave'));
      window.skipLocalization = false;
      return;
    }

    const currentMapId = $gameMap.mapId();
    const playerX = $gamePlayer.x;
    const playerY = $gamePlayer.y;

    // Get current active switches
    const activeSwitches = [];
    for (let i = 1; i <= $gameSystem.switchesCount; i++) {
      if ($gameSwitches.value(i)) {
        activeSwitches.push(i);
      }
    }

    // Save inventory, money, equips, and skills
    const money = $gameParty.gold();
    const items = $gameParty
      .items()
      .map((item) => ({ id: item.id, amount: $gameParty.numItems(item) }));
    const weapons = $gameParty
      .weapons()
      .map((item) => ({ id: item.id, amount: $gameParty.numItems(item) }));
    const armors = $gameParty
      .armors()
      .map((item) => ({ id: item.id, amount: $gameParty.numItems(item) }));
    // A hand slot holds a weapon or a shield, so the slot no longer says which
    // database the id belongs to: each piece records it for itself.
    const equips = actor.equips().map((item) =>
      item ? { id: item.id, w: item.etypeId === 1 } : null);
    const skills = actor.skills().map((skill) => skill.id);

    // Get traits from actor if available
    const traits = (actor._selectedTraits || []).map((trait) => trait.id || 0).filter((id) => id > 0);

    // Get current presets
    const currentPresets = getBasePresets();

    // Check if a preset with this name already exists
    const existingIndex = currentPresets.findIndex(
      (preset) => preset.name === actor.name()
    );

    // Generate or reuse preset ID
    let presetId;
    if (existingIndex >= 0) {
      presetId = currentPresets[existingIndex].id;
    } else {
      presetId = getNextPresetId();
    }

    const newPreset = {
      id: presetId,
      name: actor.name(),
      classId: actor._classId,
      sprite: actor._characterName,
      spriteIndex: actor._characterIndex,
      mapId: currentMapId,
      x: playerX,
      y: playerY,
      switches: activeSwitches.slice(0, 10),
      money: money,
      items: items,
      weapons: weapons,
      armors: armors,
      equips: equips,
      skills: skills,
      traits: traits,
      isCreature: $gameSwitches.value(77),
      gender: actor.gender ? actor.gender() : 0,
    };

    if (existingIndex >= 0) {
      currentPresets[existingIndex] = newPreset;
      window.skipLocalization = true;
      $gameMessage.add(T('CharPresets.presetUpdated', { name: newPreset.name }));
      window.skipLocalization = false;
    } else {
      currentPresets.push(newPreset);
      window.skipLocalization = true;
      $gameMessage.add(T('CharPresets.presetSaved', { name: newPreset.name, id: presetId }));
      window.skipLocalization = false;
    }

    saveCharacterPresets(currentPresets);
    CharacterPresets = currentPresets;
  }

  /**
   * Send a companion away: retire them into a world dossier and drop them from
   * the party. The event-facing wrapper around retirePartyMember, kept for the
   * "SendAwayPartyMember" common events (108 / 109).
   * @param {number} memberPosition - 1-based party slot (2 = second member)
   */
  function savePartyMemberAsPreset(memberPosition = 2) {
    const partyMembers = $gameParty.members();
    const position = parseInt(memberPosition) || 2;
    const targetActor = partyMembers[position - 1];

    window.skipLocalization = true;
    if (!targetActor) {
      $gameMessage.add(T('CharPresets.noMemberAtPosition', { position: position }));
      window.skipLocalization = false;
      return;
    }

    const result = retirePartyMember(targetActor.actorId());
    if (!result.ok) {
      if (result.reason === "lastMember") {
        $gameMessage.add(T('CharPresets.partyCannotBeEmpty'));
      } else if (result.reason === "isLeader") {
        $gameMessage.add(T('CharPresets.leaderCannotLeave', { name: targetActor.name() }));
      } else {
        $gameMessage.add(T('CharPresets.cannotLeaveNow', { name: targetActor.name() }));
      }
      window.skipLocalization = false;
      return;
    }

    $gameMessage.add(T('CharPresets.memberRetired', { name: targetActor.name() }));
    window.skipLocalization = false;
  }

  //=============================================================================
  // Retiring a party member ("set inactive")
  //=============================================================================
  // The Dynamics menu can bench a companion instead of dismissing them for
  // good. A retired member is snapshotted into a dossier stored in the world
  // folder ($gameSystem._retiredCharacterPresets -> world.json
  // "retiredCharacters", see WorldManager.js), so every later playthrough of
  // the same world can pick them up in character creation as a pre-made
  // character. Like every dossier they are then spent for the whole world.

  // Maps a retired member is not allowed to call home: the world map and the
  // procedural sandbox have no persistent geometry to walk back into, so a new
  // character starting there would spawn in a regenerated nowhere. Falls back
  // to the station most hand-authored dossiers already start from.
  const UNHOMEABLE_MAP_IDS = [315, 636];
  const FALLBACK_HOME = { mapId: 708, x: 24, y: 12 };

  /**
   * Next id for a retired dossier. Kept in its own 1000+ band so it can never
   * collide with a hand-authored preset id (or with getNextPresetId's output).
   * Spent ids count as taken: a dossier that has been played, or that has walked
   * back into a party, leaves the retired list but its id must never be handed
   * out again, or the world's spent list would hide whoever inherits it.
   * @returns {number} Next retired preset ID
   */
  function getNextRetiredPresetId() {
    const ids = getRetiredPresets().map((preset) => preset.id || 0);
    const spent = getUsedPresetIds().filter((id) => id >= 1000);
    return Math.max(1000, ...ids, ...spent, 0) + 1;
  }

  /**
   * Build the dossier for a member being benched.
   * @param {Game_Actor} actor - Member leaving the active party
   * @returns {object} Preset object
   */
  // Switches 77/78/79 flag Actor 1/2/3 as portrayed by a battler image.
  function isCreatureSlot(actor) {
    const slot = actor && actor.actorId ? actor.actorId() : 0;
    return !!($gameSwitches && slot >= 1 && slot <= 3 && $gameSwitches.value(76 + slot));
  }

  function buildRetiredPreset(actor) {
    const minute = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
    // Same calendar the roster history prints (NPCSystemParty.js).
    const dateStr = window.PartyRoster && window.PartyRoster.dateOf
      ? window.PartyRoster.dateOf(minute)
      : "";

    const home = UNHOMEABLE_MAP_IDS.includes($gameMap.mapId())
      ? FALLBACK_HOME
      : { mapId: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y };

    // Gear worn on the way out travels with them. _applyPreset equips out of
    // the party's stock, so every worn piece is listed both as inventory and as
    // an equip slot; nothing is taken off the party that it still holds.
    // A hand slot holds a weapon or a shield, so the slot no longer says which
    // database the id belongs to: each piece records it for itself.
    const equips = actor.equips().map((item) =>
      item ? { id: item.id, w: item.etypeId === 1 } : null);
    const weapons = [];
    const armors = [];
    actor.equips().forEach((item, slotId) => {
      if (!item) return;
      const isWeapon = item.etypeId === 1;
      (isWeapon ? weapons : armors).push({ id: item.id, amount: 1 });
    });

    const specializations = Object.keys(actor._specLevels || {}).map((id) => ({
      id: Number(id),
      level: actor._specLevels[id],
    }));

    const className = actor.currentClass() ? actor.currentClass().name : "";
    const leaderName = $gameParty.leader() ? $gameParty.leader().name() : "";
    // Written once, in the language the retirement happened in: this dossier
    // is generated data, not a shipped string, so it has no key of its own.
    const lore = T(dateStr ? 'CharPresets.retiredLoreDated' : 'CharPresets.retiredLore', {
      leader: leaderName || T('CharPresets.theParty'),
      role: className || T('CharPresets.companion'),
      date: dateStr,
      level: actor.level,
    });

    return {
      id: getNextRetiredPresetId(),
      name: actor.name(),
      classId: actor._classId,
      sprite: actor.characterName(),
      spriteIndex: actor.characterIndex(),
      mapId: home.mapId,
      x: home.x,
      y: home.y,
      // Deliberately empty: a dossier must not switch on live story flags.
      switches: [],
      level: actor.level,
      money: 0,
      items: [],
      weapons,
      armors,
      equips,
      skills: actor.skills().map((skill) => skill.id),
      traits: (actor._selectedTraits || []).map((trait) => trait.id || 0).filter((id) => id > 0),
      specializations,
      busts: actor.vnBust ? actor.vnBust() : "",
      // A creature or a recruited monster is portrayed by a battler image, not
      // by a bust, so the dossier carries the image and the enemy it came from
      // (the status screen builds that enemy's 3D model from the id).
      battler: actor.vnBattler ? actor.vnBattler() : "",
      enemyId: actor._recruitedEnemyId || 0,
      isCreature: isCreatureSlot(actor),
      gender: actor.gender ? actor.gender() : 0,
      retired: true,
      retiredAtMin: minute,
      retiredDate: dateStr,
      retiredClassName: className,
      lore,
    };
  }

  /**
   * Bench a party member: snapshot them as a world dossier and remove them from
   * the active party. The leader never leaves, so the party can never end up
   * empty and never ends up leaderless: hand the party over first (Dynamics ->
   * Roster -> Make Leader), then retire the old leader.
   * @param {number} actorId - Actor to retire
   * @returns {object} { ok: boolean, reason?: string, preset?: object }
   */
  function retirePartyMember(actorId) {
    if (!$gameParty || !$gameActors) return { ok: false, reason: "noParty" };
    const actor = $gameParty.members().find((mem) => mem.actorId() === actorId);
    if (!actor) return { ok: false, reason: "notInParty" };
    if ($gameParty.members().length <= 1) return { ok: false, reason: "lastMember" };
    if ($gameParty.members()[0].actorId() === actorId) return { ok: false, reason: "isLeader" };
    // Em and Bubba travel together for the whole story mode (PartyRoster.isStoryLocked).
    if (window.PartyRoster?.isStoryLocked?.(actorId)) return { ok: false, reason: "storyLocked" };

    const preset = buildRetiredPreset(actor);
    // Assign a new array, the WorldManager-backed field is a getter/setter pair.
    $gameSystem._retiredCharacterPresets = getRetiredPresets()
      .filter((entry) => entry.name !== preset.name)
      .concat(preset);

    // Tells the roster-history hook (NPCSystemParty.js) this departure was a
    // retirement rather than a dismissal or a death.
    if ($gameTemp) $gameTemp._partyRetiringActorId = actorId;
    $gameParty.removeActor(actorId);
    if ($gameTemp) $gameTemp._partyRetiringActorId = null;

    return { ok: true, preset };
  }

  /**
   * Put somebody on the bench without them ever having travelled: a recruit who
   * said yes while the party was already three strong (NPCSystemParty.joinParty)
   * signs on as inactive, and the Dynamics board is where they are called up.
   * The actor handed in is a scratch slot holding their sheet, not a party
   * member, so nothing is removed from the party here.
   * @param {Game_Actor} actor - Actor slot carrying the recruit's sheet
   * @param {object} [extra] - Fields to stamp onto the dossier (isCreature, ...)
   * @returns {object} { ok: boolean, reason?: string, preset?: object }
   */
  function benchActorAsPreset(actor, extra) {
    if (!actor || !$gameSystem) return { ok: false, reason: "noActor" };
    const preset = Object.assign(buildRetiredPreset(actor), extra || {});
    // Assign a new array, the WorldManager-backed field is a getter/setter pair.
    $gameSystem._retiredCharacterPresets = getRetiredPresets()
      .filter((entry) => entry.name !== preset.name)
      .concat(preset);
    return { ok: true, preset };
  }

  //=============================================================================
  // Calling a retired member back ("set active")
  //=============================================================================
  // The bench belongs to the world, not to the savegame that filled it: every
  // playthrough of this world sees the same inactive dossiers in Dynamics ->
  // Roster and can call any of them back into an open party slot. Doing so
  // takes them off the world's books for good, so no other savegame can pick
  // them up in character creation or call them back a second time.

  // Actor 1 is the player, so a companion slot is Actor 2 or Actor 3: three
  // travellers at most, the same ceiling character creation builds a party to.
  const MAX_ACTIVE_PARTY = 3;

  /**
   * First free companion slot, or 0 when the party is full. Mirrors an NPC
   * recruit (NPCSystemParty.js): Actor 2, then Actor 3, except in multiplayer
   * (Switch 67) where Actor 3 is reserved for the remote guest.
   * @returns {number} Actor id, or 0
   */
  function freeCompanionActorId() {
    if (!$gameParty) return 0;
    const taken = $gameParty._actors || [];
    if ($gameSwitches && $gameSwitches.value(67)) {
      return taken.includes(3) ? 0 : 3;
    }
    if (!taken.includes(2)) return 2;
    if (!taken.includes(3)) return 3;
    return 0;
  }

  /**
   * Inactive dossiers this world can still call back. One already played in
   * character creation is spent, so it stays out of the roster's bench too.
   * @returns {array} Array of preset objects
   */
  function getAvailableRetiredPresets() {
    const used = getUsedPresetIds();
    return getRetiredPresets().filter((preset) => used.indexOf(preset.id) < 0);
  }

  /**
   * Write a retired dossier back onto a companion actor slot. The slot may hold
   * whoever last used it (an old recruit, or this same member before they were
   * benched), so every field is overwritten rather than merged.
   * @param {object} preset - Retired dossier
   * @param {Game_Actor} actor - Actor slot receiving them
   */
  function applyRetiredPreset(preset, actor) {
    actor.setName(preset.name);
    if (preset.sprite) {
      actor.setCharacterImage(preset.sprite, preset.spriteIndex || 0);
    }
    if ($dataClasses[preset.classId]) {
      actor.changeClass(preset.classId, false);
    }
    // After the class change, so the exp curve is the one they come back on.
    actor.changeLevel(Math.max(1, Math.min(99, preset.level || 1)), false);

    // initSkills drops the previous occupant's list and relearns the class
    // skills up to this level; the dossier's own skills go on top.
    actor.initSkills();
    (preset.skills || []).forEach((skillId) => {
      if ($dataSkills[skillId]) actor.learnSkill(skillId);
    });

    // The gear on the way out comes back with them. Strip the slot first with
    // forceChangeEquip (which does not pay the old occupant's equipment into
    // the party's stock), then hand the party one copy of each dossier piece
    // and equip it, so nothing is duplicated and nothing is conjured twice.
    actor.equips().forEach((item, slotId) => {
      if (item) actor.forceChangeEquip(slotId, null);
    });
    (preset.equips || []).forEach((entry, slotId) => {
      // Older dossiers stored a bare id per slot; newer ones say what it was.
      const itemId = (entry && typeof entry === 'object') ? entry.id : entry;
      if (!(itemId > 0)) return;
      const isWeapon = (entry && typeof entry === 'object')
        ? !!entry.w
        : actor.equipSlots()[slotId] === 1;
      const item = isWeapon ? $dataWeapons[itemId] : $dataArmors[itemId];
      if (!item) return;
      $gameParty.gainItem(item, 1);
      actor.changeEquip(slotId, item);
    });

    if (Array.isArray(preset.traits) && preset.traits.length &&
        window.CharacterCreationUtils && window.CharacterCreationUtils.applyTraitsToActor) {
      window.CharacterCreationUtils.applyTraitsToActor(actor, preset.traits);
    }

    actor._specLevels = {};
    if (Array.isArray(preset.specializations) && actor.setSpecializationTrainedLevel) {
      preset.specializations.forEach((entry) => {
        if (entry && entry.id) actor.setSpecializationTrainedLevel(entry.id, entry.level);
      });
    }

    // Switches 77/78/79 say whether Actor 1/2/3 is a creature; the slot may
    // still be flagged from whoever held it before, and a retired companion is
    // recorded as one or not in their own dossier.
    const slot = actor.actorId();
    if ($gameSwitches && slot >= 1 && slot <= 3) {
      $gameSwitches.setValue(76 + slot, !!preset.isCreature);
    }

    if (actor.setGender && preset.gender !== undefined) actor.setGender(preset.gender);
    // Whoever held the slot before is gone, including the monster it may have
    // been recruited from.
    actor._recruitedEnemyId = 0;
    actor._recruitedLook = null;   // the look roll of whoever held the slot before goes with them
    if (preset.busts && actor.setVnBust) {
      actor.setVnBust(preset.busts);
      if (actor.setPortraitMode) actor.setPortraitMode("bust");
    } else if (preset.battler && actor.setVnBattler) {
      // Portrayed by a battler image (a creature, or a monster recruited in
      // battle). Leaving the portrait mode unset lets the status screen build
      // the 3D model of the recorded enemy when one resolves, and fall back to
      // the flat battler image when it does not.
      if (actor.setVnBust) actor.setVnBust("");
      actor.setVnBattler(preset.battler);
      if (actor.setPortraitMode) actor.setPortraitMode(0);
      actor._recruitedEnemyId = preset.enemyId || 0;
      actor._recruitedLook = null;   // the look roll of whoever held the slot before goes with them
    }

    // Anatomy skills need no call here: Health_Core grants them on addActor.
    actor.refresh();
    // They have been resting since the day they were benched.
    actor.recoverAll();
  }

  /**
   * Call an inactive member back into the party.
   * @param {number} presetId - Retired dossier id
   * @returns {object} { ok: boolean, reason?: string, actorId?: number, preset?: object }
   */
  function unretirePartyMember(presetId) {
    if (!$gameParty || !$gameActors) return { ok: false, reason: "noParty" };

    const preset = getAvailableRetiredPresets().find((entry) => entry.id === presetId);
    if (!preset) return { ok: false, reason: "notRetired" };
    if ($gameParty.members().some((mem) => mem.name() === preset.name)) {
      return { ok: false, reason: "alreadyHere" };
    }
    if ($gameParty.members().length >= MAX_ACTIVE_PARTY) {
      return { ok: false, reason: "partyFull" };
    }

    const actorId = freeCompanionActorId();
    if (!actorId) return { ok: false, reason: "partyFull" };
    const actor = $gameActors.actor(actorId);
    if (!actor) return { ok: false, reason: "partyFull" };

    applyRetiredPreset(preset, actor);
    $gameParty.addActor(actorId);
    if ($gameVariables) $gameVariables.setValue(29, $gameParty.members().length);

    // Off the bench for good. Both writes assign a new array: the fields are
    // WorldManager getter/setter pairs backed by world.json, so only a
    // completed write reaches the world folder every savegame reads.
    $gameSystem._retiredCharacterPresets = getRetiredPresets()
      .filter((entry) => entry.id !== presetId);
    // Recorded as spent rather than simply dropped, so the id is never dealt
    // to a later retirement (getNextRetiredPresetId).
    $gameSystem._usedCharacterPresets = getUsedPresetIds().concat(presetId);

    return { ok: true, actorId, preset };
  }

  //=============================================================================
  // Character Creation Tracking Functions
  //=============================================================================

  /**
   * Mark a character creation step as completed
   * @param {number} stepIndex - Step index
   */
  function markStepCompleted(stepIndex) {
    // Completion state lives on $gameSystem so it is per-save and does not
    // leak between save files loaded in the same session.
    if (!$gameSystem) return;
    if (!$gameSystem._characterCreationCompleted) {
      $gameSystem._characterCreationCompleted = {};
    }
    $gameSystem._characterCreationCompleted[stepIndex] = true;
  }

  /**
   * Check if a character creation step is completed
   * @param {number} stepIndex - Step index
   * @returns {boolean} Completion status
   */
  function isStepCompleted(stepIndex) {
    if (!$gameSystem || !$gameSystem._characterCreationCompleted) {
      return false;
    }
    return $gameSystem._characterCreationCompleted[stepIndex] || false;
  }

  /**
   * Check if first character creation is completed
   * @returns {boolean} Completion status
   */
  function hasCompletedFirstCreation() {
    return !!($gameSystem && $gameSystem._hasCompletedFirstCreation);
  }

  /**
   * Mark first character creation as complete
   */
  function markFirstCreationComplete() {
    if ($gameSystem && !$gameSystem._hasCompletedFirstCreation) {
      $gameSystem._hasCompletedFirstCreation = true;
    }
  }

  //=============================================================================
  // DataManager Hooks
  //=============================================================================

  const _DataManager_onLoad = DataManager.onLoad;
  DataManager.onLoad = function (object) {
    _DataManager_onLoad.call(this, object);
    if (object === $dataSystem) {
      if (!$dataSystem.classLevels) {
        $dataSystem.classLevels = {};
      }
      if (!$dataSystem.characterPresets) {
        $dataSystem.characterPresets = [...CharacterPresets];
      } else {
        CharacterPresets = $dataSystem.characterPresets;
      }
      // Creation-completion state is per-save and lives on $gameSystem, not
      // $dataSystem (which is shared across save files in one session).
    }
  };

  //=============================================================================
  // Dossier switches
  //=============================================================================
  // A dossier's switches (Em's 48, Bubba's 49, Selene's 58, the shared 50) say
  // that THIS playthrough is that character's, and the whole social layer reads
  // them. They belong to the savegame that picked the dossier and to no other:
  // they are per-savegame switches (WorldManager's privateSwitches list), they
  // start off in every new game, and only applying a preset turns one on. The
  // playthrough that applied one is recorded in $gameSystem._currentPresetId.

  /**
   * Every switch id any dossier (hand-authored or retired) turns on
   * @returns {number[]} Switch ids
   */
  function getPresetSwitchIds() {
    const ids = new Set();
    for (const preset of getCharacterPresets()) {
      for (const id of preset.switches || []) {
        if (id > 0) ids.add(id);
      }
    }
    return Array.from(ids);
  }

  /**
   * Re-apply the dossier switches of the preset this savegame was started with.
   * Only used to migrate savegames written while those switches still lived in
   * the world's shared state, which no longer hands them out.
   */
  function restoreDossierSwitches() {
    if (typeof $gameSystem === "undefined" || !$gameSystem || !$gameSwitches) return;
    const presetId = $gameSystem._currentPresetId;
    if (!(presetId > 0)) return;
    const preset = getCharacterPresets().find((p) => p.id === presetId);
    if (!preset || !Array.isArray(preset.switches)) return;
    // Only while that character is still travelling with the party: dying
    // clears their switch (NPCSystemParty.js) and it has to stay cleared.
    if (!$gameParty || !$gameParty.members().some((a) => a.name() === preset.name)) return;
    preset.switches.forEach((id) => {
      if (id > 0) $gameSwitches.setValue(id, true);
    });
  }

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    // Saves written before the dossier switches became per-savegame kept them
    // only in the world folder, so they arrive here unset. Anything newer
    // carries them in its own binary and is left alone.
    if (window.WorldManager && window.WorldManager.activeWorldName &&
        !contents.privateSwitchSchema) {
      restoreDossierSwitches();
    }
  };

  const _DataManager_setupNewGame = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame.call(this);
    // Reset character creation completion flags for new game.
    // These run AFTER WorldManager.applyPublicState() so they override any
    // world-state switch values that WorldManager restored (e.g. Switch 33
    // "character creation complete" being stuck from a previous playthrough).
    if ($gameSystem) {
      $gameSystem._characterCreationCompleted = {};
      $gameSystem._hasCompletedFirstCreation = false;
      $gameSystem._currentPresetId = 0;
    }
    $gameSwitches.setValue(10, false);  // class selected
    $gameSwitches.setValue(13, false);  // character created
    $gameSwitches.setValue(33, false);  // character creation sequence complete
    // No new playthrough is Em's, Bubba's or Selene's until its own creation
    // picks that dossier, whatever an older savegame of this world played.
    getPresetSwitchIds().forEach((id) => $gameSwitches.setValue(id, false));
  };

  //=============================================================================
  // Window_CharacterPresets - Preset Selection UI
  //=============================================================================

  class Window_CharacterPresets extends Window_Selectable {
    initialize(rect) {
      // Only presets still free in this world; a played one never comes back.
      this._data = getAvailableCharacterPresets();
      // Which look each dossier is currently being shown in, kept per preset id
      // so moving the cursor away and back keeps the skin the player chose.
      // Set before super, which draws, and drawing reads it.
      this._skinIndexById = {};
      this._skinHandler = null;
      super.initialize(rect);

      // Preload all character sprites, alternate looks included: the DOM
      // dossier sizes a big-character frame from the loaded bitmap, so a skin
      // nobody has loaded yet would render at the wrong aspect ratio.
      this._loadedBitmaps = [];
      this._data.forEach((preset, index) => {
        getPresetSkins(preset).forEach((skinData, skinIdx) => {
          const bitmap = ImageManager.loadCharacter(skinData.sprite);
          if (skinIdx === 0) this._loadedBitmaps[index] = bitmap;
          bitmap.addLoadListener(() => {
            this.refresh();
          });
        });
      });

      this.refresh();
      this.select(0);
      this.activate();
    }

    maxItems() {
      return this._data ? this._data.length : 0;
    }

    // The board after a dossier has left it: deleting one of the player's own
    // rewrites the pool, and the list is read again rather than merely redrawn.
    rebuild() {
      this._data = getAvailableCharacterPresets();
      this.refresh();
    }

    maxCols() {
      if (!this._data || this._data.length === 0) return 1;
      return Math.min(this._data.length, 3); // Max 3 columns
    }

    itemHeight() {
      return 120; // Fixed height for character display
    }

    itemAt(index) {
      return this._data && this._data[index] ? this._data[index] : null;
    }

    //-------------------------------------------------------------------------
    // Skins: alternate looks for the dossier under the cursor
    //-------------------------------------------------------------------------

    /**
     * Which look a dossier is currently being shown in.
     * @param {number} [presetIndex] - Board position; defaults to the cursor
     * @returns {number} Position in that dossier's skin list
     */
    skinIndex(presetIndex) {
      const preset = this.itemAt(presetIndex === undefined ? this.index() : presetIndex);
      if (!preset) return 0;
      const stored = (this._skinIndexById || {})[preset.id] || 0;
      const count = getPresetSkins(preset).length;
      return count > 0 ? Math.min(stored, count - 1) : 0;
    }

    /**
     * The look the highlighted dossier would be played as right now.
     * @returns {object|null} Skin record
     */
    currentSkin() {
      return getPresetSkin(this.currentPreset(), this.skinIndex());
    }

    /**
     * Show the highlighted dossier in one of its other looks.
     * @param {number} skinIdx - Position in the skin list
     */
    selectSkin(skinIdx) {
      const preset = this.currentPreset();
      if (!preset) return;
      const skins = getPresetSkins(preset);
      if (skins.length < 2) return;
      const next = (Number(skinIdx) % skins.length + skins.length) % skins.length;
      if (next === this.skinIndex()) return;
      this._skinIndexById[preset.id] = next;
      SoundManager.playCursor();
      this.refresh();
      if (this._skinHandler) this._skinHandler();
    }

    /**
     * Step through the highlighted dossier's looks.
     * @param {number} dir - +1 forward, -1 back
     */
    cycleSkin(dir) {
      this.selectSkin(this.skinIndex() + (dir > 0 ? 1 : -1));
    }

    /**
     * Called whenever the shown look changes, so the scene can redraw the
     * parchment dossier the player is actually reading.
     * @param {Function} handler - Callback
     */
    setSkinHandler(handler) {
      this._skinHandler = handler;
    }

    drawItem(index) {
      const preset = this.itemAt(index);
      if (!preset) return;

      const skinData = getPresetSkin(preset, this.skinIndex(index));
      const rect = this.itemRect(index);
      const padding = 8;

      // Draw background
      this.contents.fillRect(
        rect.x + 2,
        rect.y + 2,
        rect.width - 4,
        rect.height - 4,
        "rgba(0, 0, 0, 0.3)"
      );

      // Draw character sprite
      const spriteY = rect.y + padding;
      const spriteHeight = 48;
      this.drawCharacterSprite(
        skinData ? skinData.sprite : preset.sprite,
        skinData ? skinData.spriteIndex : preset.spriteIndex,
        rect.x + rect.width / 2 - 24,
        spriteY
      );

      // Draw character name
      this.changeTextColor(ColorManager.systemColor());
      this.drawText(
        preset.name,
        rect.x,
        spriteY + spriteHeight + 4,
        rect.width,
        "center"
      );

      // Draw class name
      this.resetTextColor();
      const className = $dataClasses[preset.classId]
        ? $dataClasses[preset.classId].name
        : T('CharPresets.unknownClass');
      this.drawText(
        className,
        rect.x,
        spriteY + spriteHeight + this.lineHeight() + 4,
        rect.width,
        "center"
      );
    }

    drawCharacterSprite(spriteName, spriteIndex, x, y) {
      const bitmap = ImageManager.loadCharacter(spriteName);
      if (bitmap.isReady()) {
        const characterWidth = bitmap.width / 12; // 12 characters per sheet
        const characterHeight = bitmap.height / 8; // 8 directions

        const col = spriteIndex % 4;
        const row = Math.floor(spriteIndex / 4);

        const sx = col * characterWidth * 3; // Each character has 3 frames
        const sy = row * characterHeight * 4; // Each character has 4 directions

        // Draw the down-facing sprite (direction 0, frame 1 - middle frame)
        const frameWidth = characterWidth;
        const frameHeight = characterHeight;
        const frameX = sx + frameWidth; // Middle frame
        const frameY = sy; // Down direction

        this.contents.blt(
          bitmap,
          frameX,
          frameY,
          frameWidth,
          frameHeight,
          x,
          y,
          48,
          48
        );
      }
    }

    processOk() {
      const preset = this.itemAt(this.index());
      if (preset) {
        this.callOkHandler();
      }
    }

    currentPreset() {
      return this.itemAt(this.index());
    }
  }

  //=============================================================================
  // Window_StatsExplanation - Stats Help Window
  //=============================================================================

  class Window_StatsExplanation extends Window_Base {
    initialize(rect) {
      super.initialize(rect);
      this._handlers = {};
      this.refresh();
      this.activate();
    }

    setHandler(symbol, method) {
      this._handlers[symbol] = method;
    }

    isHandled(symbol) {
      return !!this._handlers[symbol];
    }

    callHandler(symbol) {
      if (this.isHandled(symbol)) {
        this._handlers[symbol]();
      }
    }

    close() {
      this.openness = 0;
    }

    refresh() {
      this.contents.clear();
      let y = 0;
      const lineHeight = this.lineHeight();

      // Title
      this.changeTextColor(ColorManager.systemColor());
      this.drawText(T('CharPresets.statsExplanation'), 0, y, this.contentsWidth(), "center");
      y += lineHeight * 1.5;
      this.resetTextColor();

      // One row per attribute, in the order the character sheet shows them.
      for (const stat of ["str", "con", "dex", "int", "wis", "psi"]) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(T('CharPresets.stat.' + stat + '.label'), 0, y, this.contentsWidth());
        y += lineHeight;
        this.resetTextColor();
        this.drawTextEx(T('CharPresets.stat.' + stat + '.desc'), this.itemPadding(), y);
        y += lineHeight * 1.5;
      }
    }

    update() {
      super.update();
      if (
        this.active &&
        (Input.isTriggered("cancel") || TouchInput.isCancelled())
      ) {
        if (this.isHandled("cancel")) {
          this.callHandler("cancel");
        }
      }
    }
  }

  //=============================================================================
  // Plugin Commands
  //=============================================================================

  PluginManager.registerCommand(pluginName, "saveCharacterPreset", () => {
    saveCurrentCharacterAsPreset();
  });

  const savePartyMemberCommand = (args) => {
    const memberIndex = args.memberIndex ? parseInt(args.memberIndex) : 1;
    savePartyMemberAsPreset(memberIndex);
  };
  PluginManager.registerCommand(pluginName, "savePartyMember", savePartyMemberCommand);
  // Legacy keys: older events invoke this command through ClassSelector or the file name.
  PluginManager.registerCommand("ClassSelector", "savePartyMember", savePartyMemberCommand);
  PluginManager.registerCommand("CharacterCreationPresets", "savePartyMember", savePartyMemberCommand);

  //=============================================================================
  // Exports to Global Namespace
  //=============================================================================

  window.CharacterPresets = {
    // Functions
    getCharacterPresets,
    getBasePresets,
    getRetiredPresets,
    getAvailableRetiredPresets,
    getAvailableCharacterPresets,
    retirePartyMember,
    benchActorAsPreset,
    unretirePartyMember,
    freeCompanionActorId,
    getUsedPresetIds,
    isPresetUsed,
    isPresetEndless,
    markPresetUsed,
    unmarkPresetUsed,
    getPresetSwitchIds,
    getPresetLore,
    getPresetHometown,
    getPresetSkins,
    getPresetSkin,
    getPresetSkinLabel,
    getPresetModel,
    findPresetForActor,
    getActorPresetModel,
    getEmBackstory,
    isEmPlaythrough,
    isEmActor,
    isStoryMode,
    isStoryModeEm,
    storyModeEmLocks,
    storyModeEmIdeologyChoices,
    applyStoryModeEmLocks,
    isBeastCrew,
    emLabel,
    getEmRestlessLine,
    camperName,
    saveCharacterPresets,
    getNextPresetId,
    removePresetById,
    isAuthoredPreset,
    applyPresetIdentity,
    applyPresetVehicle,
    saveCurrentCharacterAsPreset,
    savePartyMemberAsPreset,
    markStepCompleted,
    isStepCompleted,
    hasCompletedFirstCreation,
    markFirstCreationComplete,
    getStoryModeCharacterPresets,
    getStoryModeSpritePool,
    resetStoryModePresetRolls,

    // Windows
    Window_CharacterPresets,
    Window_StatsExplanation
  };

  // Backward compatibility
  window.removePresetById = removePresetById;
  window.getNextPresetId = getNextPresetId;

  console.log(`${pluginName} loaded successfully.`);
})();
