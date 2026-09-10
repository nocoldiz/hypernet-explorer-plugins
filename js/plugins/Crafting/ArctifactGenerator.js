/*:
 * @target MZ
* @plugindesc Creates procedurally generated items, weapons, and armor with random properties
* @author Omni-Lex
*
* @command GenerateAllRandom
* @text Generate All Random Items
* @desc Fills all available slots with random artifacts, weapons and armors of random levels
*
* @command RandomArtifactByLevel
* @text Add Level-Appropriate Artifact
* @desc Adds a random artifact with level close to the player's level
*
* @command RandomArtifact
* @text Add Totally Random Artifact
* @desc Adds a completely random artifact to inventory
*
* @command SacrificeMemberForWeapon
* @text Sacrifice Party Member for Weapon
* @desc Choose an active party member to sacrifice; they die and a procedural weapon is forged from them. Outside battle only.
*
* @help
* This plugin creates procedurally generated items with the <Category: Artifact> tag
* and weapons/armor with <Category: Procedural> tag.
* 
* Items from ID 1501-1600 are reserved for artifacts.
* Weapons from ID 1501-1550 are reserved for procedural weapons.
* Armors from ID 1501-1550 are reserved for procedural armors.
* 
* ============================================================================
* Plugin Commands (MV format):
* ============================================================================
* GenerateAllRandom           # Fills all slots with random procedural items
* RandomArtifactByLevel       # Adds level-appropriate artifact to inventory
* RandomArtifact              # Adds completely random artifact to inventory
* SacrificeMemberForWeapon    # Choose a party member to sacrifice into a weapon
*
* ============================================================================
* Terms of Use:
* Free for use in both commercial and non-commercial projects.
* ============================================================================
*/

(function() {
// Set to true to enable verbose boot/generation logging.
const DEBUG_LOG = false;
function debugLog() {
    if (DEBUG_LOG) console.log.apply(console, arguments);
}
// Configuration
const ARTIFACT_START_ID = 1501;
const ARTIFACT_END_ID = 1600;
const ARTIFACT_COUNT = ARTIFACT_END_ID - ARTIFACT_START_ID + 1;

const WEAPON_START_ID = 1501;
const WEAPON_END_ID = 1550;
const WEAPON_COUNT = WEAPON_END_ID - WEAPON_START_ID + 1;

const ARMOR_START_ID = 1501;
const ARMOR_END_ID = 1550;
const ARMOR_COUNT = ARMOR_END_ID - ARMOR_START_ID + 1;

// Name generation components with expanded bizarre naming conventions
const artifactPrefixes = () => T.pool("Artifacts.artifact.prefix");

const artifactNouns = () => T.pool("Artifacts.artifact.noun");

const artifactSuffixes = () => T.pool("Artifacts.artifact.suffix");

// Effect types
// `text` is a key under the Artifacts namespace, resolved by artifactText()
// when the description is written, so an artifact rolled in one language reads
// in the other.
// i18n-ignore-start: key fragments, not display text
const effectTypes = [
    { type: "addParam", params: [0], text: "stat.0" },        // MaxHP
    { type: "addParam", params: [1], text: "stat.1" },        // MaxMP
    { type: "addParam", params: [2], text: "stat.2" },        // ATK
    { type: "addParam", params: [3], text: "stat.3" },        // DEF
    { type: "addParam", params: [4], text: "stat.4" },        // MAT
    { type: "addParam", params: [5], text: "stat.5" },        // MDF
    { type: "addParam", params: [6], text: "stat.6" },        // AGI
    { type: "addParam", params: [7], text: "stat.7" },        // LUK
    { type: "addState", text: "effect.grantsRegen" },         // State (specify in params)
    { type: "removeState", text: "effect.preventsPoison" },   // State (specify in params)
    { type: "addDebuff", text: "effect.weakensEnemies" },     // Debuff (specify in params)
    { type: "removeDebuff", text: "effect.providesResistance" } // Debuff (specify in params)
];
// i18n-ignore-end

const artifactText = (leaf) => {
    const key = "Artifacts." + leaf;
    return T.has(key) ? T(key) : String(leaf || "");
};
const statName = (i) => artifactText("stat." + i);
const elementName = (i) => artifactText("element." + i);
const stateName = (i) => artifactText("state." + i);
const immunityName = (i) => artifactText("immunity." + i);

// Initialize items, weapons, and armors when game starts
const _DataManager_onLoad = DataManager.onLoad;
DataManager.onLoad = function(object) {
    _DataManager_onLoad.call(this, object);
    if (object === $dataItems) {
        initializeArtifactTemplates();
        debugLog("Initialized artifact templates in slots " + ARTIFACT_START_ID + "-" + ARTIFACT_END_ID);
    } else if (object === $dataWeapons) {
        initializeWeaponTemplates();
        debugLog("Initialized weapon templates in slots " + WEAPON_START_ID + "-" + WEAPON_END_ID);
    } else if (object === $dataArmors) {
        initializeArmorTemplates();
        debugLog("Initialized armor templates in slots " + ARMOR_START_ID + "-" + ARMOR_END_ID);
    }
};

// Make sure our database is large enough for our procedural items
const _Scene_Boot_start = Scene_Boot.prototype.start;
Scene_Boot.prototype.start = function() {
    // Ensure database arrays are large enough
    const requiredItemsLength = ARTIFACT_END_ID + 1;
    if ($dataItems.length < requiredItemsLength) {
        const originalLength = $dataItems.length;
        for (let i = originalLength; i < requiredItemsLength; i++) {
            $dataItems[i] = null;
        }
        debugLog("Extended $dataItems from " + originalLength + " to " + $dataItems.length);
    }
    
    const requiredWeaponsLength = WEAPON_END_ID + 1;
    if ($dataWeapons.length < requiredWeaponsLength) {
        const originalLength = $dataWeapons.length;
        for (let i = originalLength; i < requiredWeaponsLength; i++) {
            $dataWeapons[i] = null;
        }
        debugLog("Extended $dataWeapons from " + originalLength + " to " + $dataWeapons.length);
    }
    
    const requiredArmorsLength = ARMOR_END_ID + 1;
    if ($dataArmors.length < requiredArmorsLength) {
        const originalLength = $dataArmors.length;
        for (let i = originalLength; i < requiredArmorsLength; i++) {
            $dataArmors[i] = null;
        }
        debugLog("Extended $dataArmors from " + originalLength + " to " + $dataArmors.length);
    }
    
    // Call original function
    _Scene_Boot_start.call(this);
};

// Set up the artifact template items
function initializeArtifactTemplates() {
    for (let i = 0; i < ARTIFACT_COUNT; i++) {
        const id = ARTIFACT_START_ID + i;
        
        if (!$dataItems[id]) {
            $dataItems[id] = JSON.parse(JSON.stringify($dataItems[1])); // Clone from a basic item
        }
        
        // Set basic template properties
        $dataItems[id].id = id;
        // i18n-ignore-start: sentinel names for unused procedural rows.
        // ProceduralQuestSystem and HypernetArtifactAnalyzer both exclude a
        // slot by testing name.startsWith("Empty "), so this is an id.
        $dataItems[id].name = "Empty Artifact Slot " + id;
        $dataItems[id].description = "Reserved for procedural generation";
        // i18n-ignore-end
        $dataItems[id].note = "<Category: Artifact>\n<Procedural: true>";
        $dataItems[id].iconIndex = 160 + (i % 16); // Assign a generic icon
        $dataItems[id].price = 0;
        $dataItems[id].occasion = 2; // 2 means "Menu Screen"
        $dataItems[id].scope = 7;    // 7 means "One Ally"
        $dataItems[id].effects = [];
        $dataItems[id].isGenerated = false;
    }
}

// Set up the weapon template items
function initializeWeaponTemplates() {
    for (let i = 0; i < WEAPON_COUNT; i++) {
        const id = WEAPON_START_ID + i;
        
        if (!$dataWeapons[id]) {
            $dataWeapons[id] = JSON.parse(JSON.stringify($dataWeapons[1])); // Clone from a basic weapon
        }
        
        // Set basic template properties
        $dataWeapons[id].id = id;
        // i18n-ignore-start: sentinel names for unused procedural rows.
        // ProceduralQuestSystem and HypernetArtifactAnalyzer both exclude a
        // slot by testing name.startsWith("Empty "), so this is an id.
        $dataWeapons[id].name = "Empty Weapon Slot " + id;
        $dataWeapons[id].description = "Reserved for procedural generation";
        // i18n-ignore-end
        $dataWeapons[id].note = "<Category: Procedural>\n<Procedural: true>";
        $dataWeapons[id].iconIndex = 96 + (i % 16); // Assign a generic weapon icon
        $dataWeapons[id].price = 0;
        $dataWeapons[id].wtypeId = 0;
        $dataWeapons[id].params = [0, 0, 0, 0, 0, 0, 0, 0]; // All stats at 0
        $dataWeapons[id].traits = [];
        $dataWeapons[id].isGenerated = false;
    }
}

// Set up the armor template items
function initializeArmorTemplates() {
    for (let i = 0; i < ARMOR_COUNT; i++) {
        const id = ARMOR_START_ID + i;
        
        if (!$dataArmors[id]) {
            $dataArmors[id] = JSON.parse(JSON.stringify($dataArmors[1])); // Clone from a basic armor
        }
        
        // Set basic template properties
        $dataArmors[id].id = id;
        // i18n-ignore-start: sentinel names for unused procedural rows.
        // ProceduralQuestSystem and HypernetArtifactAnalyzer both exclude a
        // slot by testing name.startsWith("Empty "), so this is an id.
        $dataArmors[id].name = "Empty Armor Slot " + id;
        $dataArmors[id].description = "Reserved for procedural generation";
        // i18n-ignore-end
        $dataArmors[id].note = "<Category: Procedural>\n<Procedural: true>";
        $dataArmors[id].iconIndex = 128 + (i % 16); // Assign a generic armor icon
        $dataArmors[id].price = 0;
        $dataArmors[id].atypeId = 0;
        $dataArmors[id].etypeId = 1; // Default to body armor
        $dataArmors[id].params = [0, 0, 0, 0, 0, 0, 0, 0]; // All stats at 0
        $dataArmors[id].traits = [];
        $dataArmors[id].isGenerated = false;
    }
}

// Generate a bizarrely random artifact name
function generateArtifactName() {
    const prefix = artifactPrefixes()[Math.floor(Math.random() * artifactPrefixes().length)];
    const noun = artifactNouns()[Math.floor(Math.random() * artifactNouns().length)];
    const suffix = artifactSuffixes()[Math.floor(Math.random() * artifactSuffixes().length)];
    
    // Additional bizarre name elements and modifiers
    const nameFormats = [
        // Standard with hyphenated prefix
        () => prefix + noun + " " + suffix,
        
        // Reversed order with strange punctuation
        () => noun + " " + suffix + " [" + prefix.replace("-", "") + "]",
        
        // Fragmented with unusual separators
        () => prefix + noun + ":::" + suffix.replace(" ", "/"),
        
        // Glitched text simulation
        () => prefix.toUpperCase() + "<" + noun + ">" + suffix.toLowerCase(),
        
        // With numeric designations
        () => prefix + noun + " " + suffix + " [v" + (Math.floor(Math.random() * 9) + 1) + "." + (Math.floor(Math.random() * 99) + 1) + "]",
        
        // With strange symbols
        () => "†" + prefix + noun + "†" + " " + suffix,
        
        // With reversed elements
        () => prefix + noun.split("").reverse().join("") + " " + suffix,
        
        // Nested parentheses
        () => prefix + "(" + noun + "(" + suffix + "))",
        
        // Serial number format
        () => "X-" + (Math.floor(Math.random() * 999) + 1) + "-" + prefix.replace("-", "") + "/" + noun,
        
        // Binary prefix
        () => "0b" + Math.floor(Math.random() * 256).toString(2) + " " + prefix + noun,
        
        // Hex code format
        () => "#" + Math.floor(Math.random() * 16777215).toString(16).toUpperCase() + ":" + prefix + noun,
        
        // URL-like format
        () => prefix.replace("-", "") + "://" + noun.toLowerCase() + "." + suffix.replace(/\s+/g, "-").toLowerCase(),
        
        // Mathematical notation
        () => "∫" + prefix + "(" + noun + ")d" + suffix.split(" ")[1],
        
        // Chemical formula style
        () => prefix.replace("-", "") + noun.charAt(0) + Math.floor(Math.random() * 9 + 1) + noun.charAt(1) + Math.floor(Math.random() * 9 + 1),
        
        // Redacted format
        () => prefix + "[REDACTED]" + " " + suffix,
        
        // Corrupted text
        () => prefix + noun + " " + suffix.split("").map(c => Math.random() > 0.8 ? '?' : c).join(""),
        
        // Terminal command style
        () => "sudo " + prefix.toLowerCase() + noun.toLowerCase() + " --" + suffix.replace(/\s+/g, "-").toLowerCase(),
        
        // Mixed caps
        () => prefix + noun.split("").map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join("") + " " + suffix,
        
        // Nested brackets
        () => prefix + "[[" + noun + "]]" + " " + suffix,
        
        // Quantum superposition format
        () => prefix + "(" + noun + "+" + artifactNouns()[Math.floor(Math.random() * artifactNouns().length)] + ")/√2" + " " + suffix,
        
        // Inverted case
        () => prefix.toLowerCase() + noun.toUpperCase() + " " + suffix,
        
        // File extension format. The extension is the suffix's second word,
        // but a locale is free to write a suffix that is one word long (the
        // Korean bank has one), so the whole suffix stands in for it rather
        // than the format reaching past the end of the split.
        () => prefix + noun + "." + (suffix.split(" ")[1] || suffix).substring(0, 3),
        
        // Time code format
        () => prefix + "[" + Math.floor(Math.random() * 24) + ":" + Math.floor(Math.random() * 60) + ":" + Math.floor(Math.random() * 60) + "]" + noun,
        
        // Plain prefix + noun + suffix
        () => prefix + noun + " " + suffix,
        
        // Matrix coordinate style
        () => prefix + "[" + Math.floor(Math.random() * 9) + "," + Math.floor(Math.random() * 9) + "," + Math.floor(Math.random() * 9) + "]" + " " + noun,
        
        // Register notation
        () => prefix + noun + " " + suffix + " R" + Math.floor(Math.random() * 32),
        
        // Compound weird format (multiple of the above combined)
        () => {
            const innerPrefix = artifactPrefixes()[Math.floor(Math.random() * artifactPrefixes().length)];
            return prefix.toUpperCase() + "{" + innerPrefix + noun + "}" + " " + suffix;
        },
        
        // ROT13-style encoding (simplified)
        () => prefix + noun.split("").map(c => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + 13) % 26) + 65);
            if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + 13) % 26) + 97);
            return c;
        }).join("") + " " + suffix,
        
        // Strikethrough simulation
        () => prefix + noun.split("").join('\u0336') + " " + suffix,
        
        // Recursive naming
        () => prefix + noun + " " + suffix + " " + prefix + noun,
        
        // Coordinate grid reference
        () => "[" + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 100) + "] " + prefix + noun,
        
        // Alternate dimension designation
        () => "Earth-" + Math.floor(Math.random() * 10000) + " " + prefix + noun,
        
        // Network address style
        () => "192.168." + Math.floor(Math.random() * 256) + "." + Math.floor(Math.random() * 256) + "/" + prefix.replace("-", "") + noun,
        
        // Cryptic ID format
        () => "SCP-" + Math.floor(Math.random() * 6000) + ": " + prefix + noun,
        
        // Corrupted text with Unicode
        () => prefix + noun.split("").map(c => Math.random() > 0.7 ? String.fromCharCode(c.charCodeAt(0) + 768 + Math.floor(Math.random() * 20)) : c).join("") + " " + suffix,
        
        // Warning label format
        () => "DANGER: CLASS-" + Math.floor(Math.random() * 5 + 1) + " " + prefix + noun,
        
        // Logical operation format
        () => prefix + "(" + noun + " ⊕ " + suffix.split(" ")[1] + ")",
        
        // Base64-like format
        () => prefix + noun + "==" + suffix.replace(/\s+/g, "+"),
        
        // Temporal coordinates
        () => "T-" + Math.floor(Math.random() * 10000) + " " + prefix + noun
    ];
    
    // Choose a random format
    const formatFunc = nameFormats[Math.floor(Math.random() * nameFormats.length)];
    return formatFunc();
}

// Generate random effects based on level
function generateEffects(level) {
    const effects = [];
    const effectCount = Math.floor(level / 20) + 1; // 1-5 effects based on level
    
    // RMMZ Game_Action effect codes (see rmmz_objects Game_Action.applyItemEffect).
    const EFFECT_ADD_STATE    = 21;
    const EFFECT_REMOVE_STATE = 22;
    const EFFECT_ADD_DEBUFF   = 32;
    const EFFECT_REMOVE_DEBUFF = 34;
    const EFFECT_GROW         = 42; // permanent parameter growth

    for (let i = 0; i < effectCount; i++) {
        const effectTemplate = effectTypes[Math.floor(Math.random() * effectTypes.length)];
        // Keep type/text for description; emit a real RMMZ effect object
        // (code/dataId/value1/value2) that Game_Action.applyItemEffect understands.
        const effect = { type: effectTemplate.type, text: effectTemplate.text };

        if (effect.type === "addParam") {
            const value = Math.floor(level * (1 + Math.random()));
            effect.code = EFFECT_GROW;
            effect.dataId = effectTemplate.params[0]; // paramId 0-7
            effect.value1 = value;
            effect.value2 = 0;
            effect.amount = value; // shown in description
        } else if (effect.type === "addState") {
            const stateId = Math.floor(Math.random() * 10) + 1;
            effect.code = EFFECT_ADD_STATE;
            effect.dataId = stateId;
            effect.value1 = 1.0; // application chance
            effect.value2 = 0;
        } else if (effect.type === "removeState") {
            const stateId = Math.floor(Math.random() * 10) + 1;
            effect.code = EFFECT_REMOVE_STATE;
            effect.dataId = stateId;
            effect.value1 = 1.0; // removal chance
            effect.value2 = 0;
        } else if (effect.type === "addDebuff") {
            const paramId = Math.floor(Math.random() * 8);
            effect.code = EFFECT_ADD_DEBUFF;
            effect.dataId = paramId;
            effect.value1 = 3; // turns
            effect.value2 = 0;
        } else if (effect.type === "removeDebuff") {
            const paramId = Math.floor(Math.random() * 8);
            effect.code = EFFECT_REMOVE_DEBUFF;
            effect.dataId = paramId;
            effect.value1 = 0;
            effect.value2 = 0;
        }

        effects.push(effect);
    }

    return effects;
}

// Generate description text based on effects
function generateDescription(effects, level) {
    let desc = T("Artifacts.desc.artifactHeader", { level: level }) + "\n";

    effects.forEach(effect => {
        if (effect.type === "addParam" && typeof effect.amount === "number") {
            desc += "+" + effect.amount + " " + artifactText(effect.text) + "\n";
        } else {
            desc += artifactText(effect.text) + "\n";
        }
    });
    
    return desc.trim();
}

// Find an available artifact slot
function findAvailableArtifactSlot() {
    for (let i = 0; i < ARTIFACT_COUNT; i++) {
        const id = ARTIFACT_START_ID + i;
        if (!$dataItems[id].isGenerated) {
            return id;
        }
    }
    return -1; // No slots available
}

// Find an available weapon slot
function findAvailableWeaponSlot() {
    for (let i = 0; i < WEAPON_COUNT; i++) {
        const id = WEAPON_START_ID + i;
        if (!$dataWeapons[id].isGenerated) {
            return id;
        }
    }
    return -1; // No slots available
}

// Find an available armor slot
function findAvailableArmorSlot() {
    for (let i = 0; i < ARMOR_COUNT; i++) {
        const id = ARMOR_START_ID + i;
        if (!$dataArmors[id].isGenerated) {
            return id;
        }
    }
    return -1; // No slots available
}

// Generate a single artifact
function generateArtifact(level) {
    // Cap level between 1-99
    level = Math.max(1, Math.min(99, level));
    
    // Find an available slot
    const id = findAvailableArtifactSlot();
    if (id === -1) {
        console.error("No available artifact slots!");
        return -1;
    }
    
    // Generate artifact properties
    const name = generateArtifactName();
    const effects = generateEffects(level);
    const description = generateDescription(effects, level);
    const iconIndex = 176 + Math.floor(Math.random() * 8); // Choose from better looking icons
    const price = level * 100 * (1 + Math.floor(Math.random() * 5));
    
    // Update the item
    $dataItems[id].name = name;
    $dataItems[id].description = description;
    $dataItems[id].iconIndex = iconIndex;
    $dataItems[id].price = price;
    $dataItems[id].effects = effects;
    $dataItems[id].meta = { 
        Category: "Artifact", // i18n-ignore: note-tag category id
        
        Procedural: true, 
        Level: level 
    };
    $dataItems[id].isGenerated = true;
    
    debugLog("Generated artifact ID: " + id + " - " + name); // Add debug logging
    
    return id;
}

// Reset all artifact slots
function resetArtifactSlots() {
    for (let i = 0; i < ARTIFACT_COUNT; i++) {
        const id = ARTIFACT_START_ID + i;
        $dataItems[id].isGenerated = false;
        // i18n-ignore-start: sentinel names for unused procedural rows.
        // ProceduralQuestSystem and HypernetArtifactAnalyzer both exclude a
        // slot by testing name.startsWith("Empty "), so this is an id.
        $dataItems[id].name = "Empty Artifact Slot " + id;
        $dataItems[id].description = "Reserved for procedural generation";
        // i18n-ignore-end
    }
}

// Reset all weapon slots
function resetWeaponSlots() {
    for (let i = 0; i < WEAPON_COUNT; i++) {
        const id = WEAPON_START_ID + i;
        $dataWeapons[id].isGenerated = false;
        // i18n-ignore-start: sentinel names for unused procedural rows.
        // ProceduralQuestSystem and HypernetArtifactAnalyzer both exclude a
        // slot by testing name.startsWith("Empty "), so this is an id.
        $dataWeapons[id].name = "Empty Weapon Slot " + id;
        $dataWeapons[id].description = "Reserved for procedural generation";
        // i18n-ignore-end
    }
}

// Reset all armor slots
function resetArmorSlots() {
    for (let i = 0; i < ARMOR_COUNT; i++) {
        const id = ARMOR_START_ID + i;
        $dataArmors[id].isGenerated = false;
        // i18n-ignore-start: sentinel names for unused procedural rows.
        // ProceduralQuestSystem and HypernetArtifactAnalyzer both exclude a
        // slot by testing name.startsWith("Empty "), so this is an id.
        $dataArmors[id].name = "Empty Armor Slot " + id;
        $dataArmors[id].description = "Reserved for procedural generation";
        // i18n-ignore-end
    }
}

// Plugin command processing
// Commands are looked up under Utils.extractFileName of the plugins.js entry, i.e. this
// file's own bare name. The old ProceduralItemGenerator name is kept alongside it so events
// authored before the rename still reach the same handlers.
const pluginName = "ArctifactGenerator";
const LEGACY_PLUGIN_NAME = "ProceduralItemGenerator";
function registerArtifactCommand(commandName, handler) {
    for (const key of [pluginName, LEGACY_PLUGIN_NAME]) {
        PluginManager.registerCommand(key, commandName, handler);
    }
}

// Generate all procedural items with random levels
function generateAllRandom() {
    resetArtifactSlots();
    resetWeaponSlots();
    resetArmorSlots();
    
    // Generate artifacts for all available slots
    for (let i = 0; i < ARTIFACT_COUNT; i++) {
        const level = Math.floor(Math.random() * 99) + 1; // Random level 1-99
        generateArtifact(level);
    }
    
    // Generate weapons for all available slots
    for (let i = 0; i < WEAPON_COUNT; i++) {
        const level = Math.floor(Math.random() * 99) + 1; // Random level 1-99
        const type = Math.floor(Math.random() * 9) + 1; // Random weapon type 1-9
        generateWeapon(level, type);
    }
    
    // Generate armor for all available slots
    for (let i = 0; i < ARMOR_COUNT; i++) {
        const level = Math.floor(Math.random() * 99) + 1; // Random level 1-99
        const type = Math.floor(Math.random() * 5) + 1; // Random armor type 1-5
        generateArmor(level, type);
    }
    
    debugLog("Generated all procedural items with random levels");
}

// Get player level - depends on your game's level structure
function getPlayerLevel() {
    // Default to leader's level if available
    if ($gameParty && $gameParty.leader()) {
        return $gameParty.leader().level;
    }
    
    // Fallback to a random level if no leader available
    return Math.floor(Math.random() * 99) + 1;
}

// Add a level-appropriate artifact to inventory
function addLevelAppropriateArtifact() {
    const playerLevel = getPlayerLevel();
    
    // Generate a level close to the player's level (±5 levels, capped at 1-99)
    const levelVariance = Math.floor(Math.random() * 11) - 5; // -5 to +5
    const artifactLevel = Math.max(1, Math.min(99, playerLevel + levelVariance));
    
    const artifactId = generateArtifact(artifactLevel);
    if (artifactId > 0) {
        $gameParty.gainItem($dataItems[artifactId], 1);
        debugLog("Added level-appropriate artifact: " + $dataItems[artifactId].name + " (Level " + artifactLevel + ") to inventory");
        debugLog("Current inventory count: " + $gameParty.numItems($dataItems[artifactId]));
    } else {
        console.error("Failed to add artifact to inventory - invalid ID returned");
    }
}

// Add a totally random artifact to inventory
function addRandomArtifact() {
    const level = Math.floor(Math.random() * 99) + 1; // Random level 1-99
    const artifactId = generateArtifact(level);
    if (artifactId > 0) {
        $gameParty.gainItem($dataItems[artifactId], 1);
        debugLog("Added random artifact: " + $dataItems[artifactId].name + " (Level " + level + ") to inventory");
        debugLog("Current inventory count: " + $gameParty.numItems($dataItems[artifactId]));
    } else {
        console.error("Failed to add artifact to inventory - invalid ID returned");
    }
}

// Sacrifice a party member into a procedural weapon. A ritual, never a battle
// death: it is only ever offered outside a fight. The leader is never among
// the choices (same rule CharacterPresets.retirePartyMember applies - hand
// leadership over first), so the party can never end up leaderless or empty.
function sacrificeEligibleMembers() {
    if (!$gameParty) return [];
    return $gameParty.members().filter((actor, index) => index > 0 && actor && !actor.isDead());
}

function sacrificeMemberIntoWeapon(actor) {
    const level = Math.max(1, actor.level || 1);
    const equipped = actor.weapons && actor.weapons()[0];
    const typeId = equipped ? equipped.wtypeId : 0; // 0 lets generateWeapon roll one at random

    const weaponId = generateWeapon(level, typeId);
    if (weaponId === -1) {
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T("Artifacts.sacrifice.noSlots"), { severity: "warning" });
        }
        return;
    }

    const weapon = $dataWeapons[weaponId];
    weapon.name = T("Artifacts.sacrifice.namePattern", { name: actor.name(), weapon: weapon.name });
    weapon.description = weapon.description + "\n\n" + T("Artifacts.sacrifice.descLine", { name: actor.name(), level: level });

    const actorName = actor.name();
    actor.die();
    actor.refresh();
    $gameParty.removeActor(actor.actorId());
    $gameParty.gainItem(weapon, 1);

    window.skipLocalization = true;
    $gameMessage.add(T("Artifacts.sacrifice.result", { name: actorName, weapon: weapon.name }));
    window.skipLocalization = false;
}

// The prompt: which member is spared to become the weapon. Defaults the
// cursor to Cancel, since this is the one command in the plugin that is not
// reversible by rolling again.
function askSacrificeMember() {
    if (!$gameParty || $gameParty.inBattle()) {
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T("Artifacts.sacrifice.blockedInBattle"), { severity: "warning" });
        }
        return;
    }
    if (!$gameMessage || $gameMessage.isBusy()) return;

    const members = sacrificeEligibleMembers();
    if (!members.length) {
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T("Artifacts.sacrifice.noEligible"), { severity: "warning" });
        }
        return;
    }

    window.skipLocalization = true;
    $gameMessage.add(T("Artifacts.sacrifice.prompt"));
    window.skipLocalization = false;
    $gameMessage.setChoices(
        members.map((actor) => actor.name()).concat(T("Artifacts.sacrifice.cancel")),
        members.length,           // default cursor on Cancel
        members.length            // the cancel row is also what Escape picks
    );
    $gameMessage.setChoiceCallback((index) => {
        const actor = members[index];
        if (actor) sacrificeMemberIntoWeapon(actor);
    });
}

// MV and older plugin command handling
const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);

    if (command === "GenerateAllRandom") {
        generateAllRandom();
    } else if (command === "RandomArtifactByLevel") {
        addLevelAppropriateArtifact();
    } else if (command === "RandomArtifact") {
        addRandomArtifact();
    } else if (command === "SacrificeMemberForWeapon") {
        askSacrificeMember();
    }
};

// MZ plugin command handling (if MZ is detected)
if (Utils.RPGMAKER_NAME === "MZ") {
    registerArtifactCommand("GenerateAllRandom", args => {
        generateAllRandom();
    });

    registerArtifactCommand("RandomArtifactByLevel", args => {
        addLevelAppropriateArtifact();
    });

    registerArtifactCommand("RandomArtifact", args => {
        addRandomArtifact();
    });

    registerArtifactCommand("SacrificeMemberForWeapon", args => {
        askSacrificeMember();
    });
}

// Add methods to Game_System to generate items programmatically
Game_System.prototype.generateArtifact = function(level) {
    return generateArtifact(level);
};

Game_System.prototype.generateWeapon = function(level, type) {
    return generateWeapon(level, type);
};

Game_System.prototype.generateArmor = function(level, type) {
    return generateArmor(level, type);
};

// Enhance item display to show procedural item properties
const _Window_ItemList_drawItem = Window_ItemList.prototype.drawItem;
Window_ItemList.prototype.drawItem = function(index) {
    const item = this._data[index];
    if (item && item.meta && (item.meta.Category === "Artifact" || item.meta.Category === "Procedural")) {
        const rect = this.itemRect(index);
        const iconBoxWidth = Window_Base._iconWidth + 4;
        
        // Draw icon
        this.drawIcon(item.iconIndex, rect.x, rect.y + 2);
        
        // Choose color based on category
        if (item.meta.Category === "Artifact") {
            this.changeTextColor(ColorManager.textColor(3)); // Color 3 (blue) for artifacts
        } else if (item.meta.Category === "Procedural") {
            // Check if it's a weapon or armor and use different colors
            if (DataManager.isWeapon(item)) {
                this.changeTextColor(ColorManager.textColor(2)); // Color 2 (green) for weapons
            } else if (DataManager.isArmor(item)) {
                this.changeTextColor(ColorManager.textColor(6)); // Color 6 (cyan) for armor
            }
        }
        
        // Draw item name
        this.drawText(item.name, rect.x + iconBoxWidth, rect.y, rect.width - iconBoxWidth);
        
        // Reset text color
        this.resetTextColor();
    } else {
        _Window_ItemList_drawItem.call(this, index);
    }
};
// Generate weapon description
function generateWeaponDescription(level, typeId, traits, params) {
    let desc = T("Artifacts.desc.weaponHeader", { level: level, kind: weaponNouns(typeId)[0] || "" }) + "\n";

    // Add attack value
    desc += T("Artifacts.desc.attackPower", { value: params[2] }) + "\n";

    // Add any bonus stats
    for (let i = 0; i < params.length; i++) {
        if (i !== 2 && params[i] > 0) { // Skip the attack stat (already shown)
            desc += "+" + params[i] + " " + statName(i) + "\n";
        }
    }

    // Add traits descriptions
    traits.forEach(trait => {
        if (trait.code === 31) { // Element Rate
            desc += T("Artifacts.desc.imbued", { element: elementName(trait.dataId) }) + "\n";
        } else if (trait.code === 32) { // Attack State
            const chance = Math.floor(trait.value * 100);
            desc += T("Artifacts.desc.inflictChance", { chance: chance, state: stateName(trait.dataId) }) + "\n";
        } else if (trait.code === 22) { // Critical Rate
            const bonus = Math.floor((trait.value - 1) * 100);
            desc += T("Artifacts.desc.critRate", { bonus: bonus }) + "\n";
        } else if (trait.code === 34) { // Attack Times+
            desc += T("Artifacts.desc.hitsTwice") + "\n";
        } else if (trait.code === 21) { // Param Rate
            const bonus = Math.floor((trait.value - 1) * 100);
            desc += "+" + bonus + "% " + statName(trait.dataId) + "\n";
        }
    });

    // Add flavor text based on level
    if (level < 30) {
        desc += "\n" + T("Artifacts.flavor.weapon0");
    } else if (level < 60) {
        desc += "\n" + T("Artifacts.flavor.weapon1");
    } else if (level < 90) {
        desc += "\n" + T("Artifacts.flavor.weapon2");
    } else {
        desc += "\n" + T("Artifacts.flavor.weapon3");
    }
    
    return desc;
}

// Generate armor description
function generateArmorDescription(level, typeId, traits, params) {
    let desc = T("Artifacts.desc.armorHeader", { level: level, kind: armorNouns(typeId)[0] || "" }) + "\n";

    // Add defense value
    desc += T("Artifacts.desc.defense", { value: params[3] }) + "\n";

    // Add any bonus stats
    for (let i = 0; i < params.length; i++) {
        if (i !== 3 && params[i] > 0) { // Skip the defense stat (already shown)
            desc += "+" + params[i] + " " + statName(i) + "\n";
        }
    }

    // Add traits descriptions
    traits.forEach(trait => {
        if (trait.code === 11) { // Element Rate
            const resistance = Math.floor((1 - trait.value) * 100);
            desc += T("Artifacts.desc.resistance", { value: resistance, what: elementName(trait.dataId) }) + "\n";
        } else if (trait.code === 13) { // State Rate
            const resistance = Math.floor((1 - trait.value) * 100);
            desc += T("Artifacts.desc.resistance", { value: resistance, what: stateName(trait.dataId) }) + "\n";
        } else if (trait.code === 21) { // Param Rate
            const bonus = Math.floor((trait.value - 1) * 100);
            desc += "+" + bonus + "% " + statName(trait.dataId) + "\n";
        } else if (trait.code === 23) { // TP Charge Rate
            const bonus = Math.floor((trait.value - 1) * 100);
            desc += T("Artifacts.desc.tpGain", { bonus: bonus }) + "\n";
        } else if (trait.code === 14) { // State Immunity
            desc += T("Artifacts.desc.autoState", { state: immunityName(trait.dataId) }) + "\n";
        }
    });

    // Add flavor text based on level
    if (level < 30) {
        desc += "\n" + T("Artifacts.flavor.armor0");
    } else if (level < 60) {
        desc += "\n" + T("Artifacts.flavor.armor1");
    } else if (level < 90) {
        desc += "\n" + T("Artifacts.flavor.armor2");
    } else {
        desc += "\n" + T("Artifacts.flavor.armor3");
    }
    
    return desc;
}    // Generate weapon traits based on level
function generateWeaponTraits(level) {
    const traits = [];
    
    // Add elemental property (chance increases with level)
    if (Math.random() < 0.2 + (level / 200)) {
        const elements = [3, 4, 5, 6, 7, 8, 9]; // Standard elements (fire, ice, thunder, etc.)
        const element = elements[Math.floor(Math.random() * elements.length)];
        
        traits.push({
            code: 31, // Element Rate
            dataId: element,
            value: 1.0 // Attack has this element
        });
    }
    
    // Add state infliction (chance increases with level)
    if (Math.random() < 0.15 + (level / 300)) {
        const states = [4, 5, 6, 7, 8, 9, 10]; // Standard debilitating states (poison, blind, silence, etc.)
        const state = states[Math.floor(Math.random() * states.length)];
        const chance = 0.1 + (level / 300); // 10% base + up to 33% at level 99
        
        traits.push({
            code: 32, // Attack State
            dataId: state,
            value: chance // Chance to inflict state
        });
    }
    
    // Add critical hit bonus (rarer, for higher level weapons)
    if (Math.random() < 0.05 + (level / 400)) {
        traits.push({
            code: 22, // XPARAM
            dataId: 2, // Critical hit rate (0=Hit, 1=Eva, 2=Cri)
            value: 0.15 + (level / 300) // 15% base + up to 33% at level 99
        });
    }
    
    // Add attack hits+ (very rare, for high level weapons)
    if (Math.random() < 0.02 + (level / 500)) {
        traits.push({
            code: 34, // Attack Times+
            dataId: 0,
            value: 1 // One additional attack
        });
    }
    
    // Add parameter boost traits
    const statChance = 0.1 + (level / 300);
    if (Math.random() < statChance) {
        const paramId = Math.floor(Math.random() * 8);
        const boost = 1.0 + (level / 200); // Up to 50% boost at level 99
        
        traits.push({
            code: 21, // Param Rate
            dataId: paramId,
            value: boost
        });
    }
    
    return traits;
}

// Generate armor traits based on level
function generateArmorTraits(level) {
    const traits = [];
    
    // Add elemental resistance (chance increases with level)
    if (Math.random() < 0.25 + (level / 200)) {
        const elements = [3, 4, 5, 6, 7, 8, 9]; // Standard elements (fire, ice, thunder, etc.)
        const element = elements[Math.floor(Math.random() * elements.length)];
        const resistance = 1.0 - (0.2 + (level / 400)); // 20% to 45% resistance
        
        traits.push({
            code: 11, // Element Rate
            dataId: element,
            value: resistance
        });
    }
    
    // Add state resistance (chance increases with level)
    if (Math.random() < 0.2 + (level / 200)) {
        const states = [4, 5, 6, 7, 8, 9, 10]; // Standard debilitating states (poison, blind, silence, etc.)
        const state = states[Math.floor(Math.random() * states.length)];
        const resistance = 1.0 - (0.15 + (level / 300)); // 15% to 48% resistance
        
        traits.push({
            code: 13, // State Rate
            dataId: state,
            value: resistance
        });
    }
    
    // Add parameter boost traits
    const statChance = 0.15 + (level / 300);
    if (Math.random() < statChance) {
        const paramId = Math.floor(Math.random() * 8);
        const boost = 1.0 + (level / 200); // Up to 50% boost at level 99
        
        traits.push({
            code: 21, // Param Rate
            dataId: paramId,
            value: boost
        });
    }
    
    // Add special effects for higher level armor
    if (level > 50) {
        // Chance for TP generation trait
        if (Math.random() < 0.1) {
            traits.push({
                code: 23, // TP Charge Rate
                dataId: 0,
                value: 1.1 + ((level - 50) / 100) // 10% to 60% boost
            });
        }
    }
    
    return traits;
}    // Generate a weapon name
function generateWeaponName(typeId) {
    const nouns = weaponNouns(typeId);
    const pool = nouns.length ? nouns : weaponNouns(1); // Default to swords if type is invalid
    const noun = pool[Math.floor(Math.random() * pool.length)];
    const prefix = agreedPrefix("weapon", noun);
    const suffix = Math.random() > 0.5 ? " " + weaponSuffixes()[Math.floor(Math.random() * weaponSuffixes().length)] : "";
    
    // The pattern decides the word order, so it moves with the language.
    return applyNamePattern("weapon", prefix, noun, suffix);
}

// Generate an armor name
function generateArmorName(typeId) {
    const nouns = armorNouns(typeId);
    const pool = nouns.length ? nouns : armorNouns(2); // Default to body armor if type is invalid
    const noun = pool[Math.floor(Math.random() * pool.length)];
    const prefix = agreedPrefix("armor", noun);
    const suffix = Math.random() > 0.5 ? " " + armorSuffixes()[Math.floor(Math.random() * armorSuffixes().length)] : "";
    
    // The pattern decides the word order, so it moves with the language.
    return applyNamePattern("armor", prefix, noun, suffix);
}    // Generate a procedural weapon
function generateWeapon(level, typeId) {
    // Cap level between 1-99
    level = Math.max(1, Math.min(99, level));
    
    // Find an available slot
    const id = findAvailableWeaponSlot();
    if (id === -1) {
        console.error("No available weapon slots!");
        return -1;
    }
    
    // Determine weapon type if not specified
    if (!typeId || !weaponNouns(typeId).length) {
        typeId = Math.floor(Math.random() * 9) + 1; // Random weapon type 1-9
    }
    
    // Generate base stats based on level
    const baseDamage = Math.floor(5 + (level * 1.5));
    const params = [0, 0, baseDamage, 0, 0, 0, 0, 0]; // Set attack stat
    
    // Add random bonus stats
    const statCount = Math.floor(level / 20) + 1; // 1-5 bonus stats based on level
    for (let i = 0; i < statCount; i++) {
        const statIndex = Math.floor(Math.random() * 8);
        if (statIndex !== 2) { // Skip attack stat since we already set it
            params[statIndex] += Math.floor(level * 0.5 * (0.5 + Math.random()));
        }
    }
    
    // Generate name
    const name = generateWeaponName(typeId);
    
    // Generate weapon traits
    const traits = generateWeaponTraits(level);
    
    // Generate description
    const description = generateWeaponDescription(level, typeId, traits, params);
    
    // Set icon based on weapon type
    const typeIconBase = {
        1: 96,   // Swords
        2: 100,  // Spears
        3: 104,  // Axes
        4: 108,  // Maces
        5: 102,  // Bows
        6: 110,  // Daggers
        7: 101,  // Staves
        8: 111,  // Guns
        9: 106   // Hand weapons
    };
    const iconIndex = typeIconBase[typeId] + Math.floor(Math.random() * 4); // Variation within type
    
    // Calculate price based on level and traits
    const price = level * 200 * (1 + traits.length * 0.5) * (1 + Math.floor(Math.random() * 3));
    
    // Update the weapon
    $dataWeapons[id].name = name;
    $dataWeapons[id].description = description;
    $dataWeapons[id].iconIndex = iconIndex;
    $dataWeapons[id].price = price;
    $dataWeapons[id].params = params;
    $dataWeapons[id].traits = traits;
    $dataWeapons[id].wtypeId = typeId;
    $dataWeapons[id].meta = {
        Category: "Procedural", // i18n-ignore: note-tag category id
        Procedural: true,
        Level: level,
        Type: typeId
    };
    $dataWeapons[id].isGenerated = true;
    
    return id;
}

// Generate a procedural armor
function generateArmor(level, typeId) {
    // Cap level between 1-99
    level = Math.max(1, Math.min(99, level));
    
    // Find an available slot
    const id = findAvailableArmorSlot();
    if (id === -1) {
        console.error("No available armor slots!");
        return -1;
    }
    
    // Determine armor type if not specified (1-5)
    if (!typeId || !armorNouns(typeId).length) {
        typeId = Math.floor(Math.random() * 5) + 1; // Random armor type 1-5
    }
    
    // Set etypeId based on type
    const etypeIdMap = {
        1: 3, // Head
        2: 4, // Body
        3: 2, // Shield
        4: 5, // Arms
        5: 6  // Legs
    };
    
    // Generate base stats based on level
    const baseDefense = Math.floor(3 + (level * 1.2));
    const params = [0, 0, 0, baseDefense, 0, 0, 0, 0]; // Set defense stat
    
    // Add random bonus stats
    const statCount = Math.floor(level / 20) + 1; // 1-5 bonus stats based on level
    for (let i = 0; i < statCount; i++) {
        const statIndex = Math.floor(Math.random() * 8);
        if (statIndex !== 3) { // Skip defense stat since we already set it
            params[statIndex] += Math.floor(level * 0.5 * (0.5 + Math.random()));
        }
    }
    
    // Generate name
    const name = generateArmorName(typeId);
    
    // Generate armor traits
    const traits = generateArmorTraits(level);
    
    // Generate description
    const description = generateArmorDescription(level, typeId, traits, params);
    
    // Set icon based on armor type
    const typeIconBase = {
        1: 128, // Head
        2: 135, // Body
        3: 144, // Shield
        4: 149, // Arms
        5: 152  // Legs
    };
    const iconIndex = typeIconBase[typeId] + Math.floor(Math.random() * 4); // Variation within type
    
    // Calculate price based on level and traits
    const price = level * 150 * (1 + traits.length * 0.5) * (1 + Math.floor(Math.random() * 3));
    
    // Update the armor
    $dataArmors[id].name = name;
    $dataArmors[id].description = description;
    $dataArmors[id].iconIndex = iconIndex;
    $dataArmors[id].price = price;
    $dataArmors[id].params = params;
    $dataArmors[id].traits = traits;
    $dataArmors[id].atypeId = 1; // Default to all armor types can equip
    $dataArmors[id].etypeId = etypeIdMap[typeId];
    $dataArmors[id].meta = {
        Category: "Procedural", // i18n-ignore: note-tag category id
        Procedural: true,
        Level: level,
        Type: typeId
    };
    $dataArmors[id].isGenerated = true;
    
    return id;
}    // An adjective agrees with the noun it is put on, so a language that inflects
// ships a parallel feminine list plus a noun gender map; one that does not
// (English) ships neither and the base list is used as it stands.
function agreedPrefix(kind, noun) {
    const base = T.pool("Artifacts." + kind + ".prefix");
    const idx = Math.floor(Math.random() * base.length);
    const femKey = "Artifacts." + kind + ".prefixF";
    if (T.has(femKey)) {
        const genderKey = "Artifacts." + kind + ".nounGender";
        const genders = T.has(genderKey) ? T.obj(genderKey) : {};
        if (genders[noun] === "f") {
            const fem = T.pool(femKey);
            if (fem[idx]) return fem[idx];
        }
    }
    return base[idx];
}

// The definite article a noun takes. English has one; a language that inflects
// it ships a per-noun map and the article carries its own trailing space (or
// none, for an elided "L'").
function nounArticle(kind, noun) {
    const key = "Artifacts." + kind + ".nounArticle";
    const map = T.has(key) ? T.obj(key) : {};
    return map[noun] || T("Artifacts.articleDefault");
}

// Name patterns carry the word order: "{prefix} {noun}" in English,
// "{noun} {prefix}" where the adjective follows. {n} is the +N mark and
// {the} the definite article.
function applyNamePattern(kind, prefix, noun, suffix) {
    const patterns = T.list("Artifacts.pattern." + kind);
    const tmpl = patterns[Math.floor(Math.random() * patterns.length)] || "{prefix} {noun}{suffix}"; // i18n-ignore: last-resort pattern
    return tmpl
        .replace(/\{the\}/g, () => nounArticle(kind, noun))
        .replace(/\{prefix\}/g, prefix)
        .replace(/\{noun\}/g, noun)
        .replace(/\{suffix\}/g, suffix)
        .replace(/\{n\}/g, String(Math.floor(Math.random() * 5) + 1));
}


const weaponNouns = (typeId) => T.pool("Artifacts.weapon.noun." + typeId);

const weaponSuffixes = () => T.pool("Artifacts.weapon.suffix");


const armorNouns = (typeId) => T.pool("Artifacts.armor.noun." + typeId);

const armorSuffixes = () => T.pool("Artifacts.armor.suffix");
})();