//=============================================================================
// CustomSceneStatus.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Custom Scene Status v2.0.0
 * @author OmniLex & Antigravity
 * @version 2.0.0
 * @description Gorgeous D&D Book Spread Status screen with campfire sepia aesthetic and biological limb tracking.
 * @param maxDescriptionLength
 * @text Max Description Length
 * @desc Maximum number of characters for character descriptions
 * @type number
 * @default 200
 * @min 50
 * @max 500
 *
 * @command setCharacterDescription
 * @text Set Character Description
 * @desc Set a description for a party member
 *
 * @arg partyMemberIndex
 * @text Party Member
 * @desc Which party member (1, 2, or 3)
 * @type select
 * @option Party Member 1
 * @value 1
 * @option Party Member 2
 * @value 2
 * @option Party Member 3
 * @value 3
 * @default 1
 *
 * @arg description
 * @text Description
 * @desc The character description text
 * @type multiline_string
 * @default
 *
 * @help CustomSceneStatus.js
 *
 * This plugin replaces the default Scene_Status with a custom version.
 *
 * --- Features ---
 * - Double-page parchment layout spreading across the screen (D&D Book Theme)
 * - Circular companion selection tabs at the top of the sheet
 * - Correctly cropped bust portraits drawn dynamically inside an ornate portrait frame
 * - Sepia status gauges for Vitals (HP), Energy (MP), Tension (TP) and Level Progression (EXP)
 * - Embossed medallions grid showing STR, CON, DEX, INT, WIS, PSI and active stat modifiers
 * - Alignment elemental badge, and a traits page writing every trait out in full
 * - Right-page sections (Attributes / Traits / Passives / Anatomy), the last one
 *   read being the one the sheet opens on next time
 * - Scrollable biological limb-health vitals tracking (fortress sim limb damage)
 * - Fast, flicker-free rendering with page caching
 */

(() => {
  // A severed-magic world has no magic in it, so there is nothing to spend a
  // magic meter on: the MP row is not drawn at all. See window.MagicNature.
  function hideMpBar() {
    const MN = window.MagicNature;
    return !!(MN && typeof MN.level === "function" && MN.level() === "severed");
  }

    'use strict';

    // ── The shared party switcher (idempotent across plugins) ─────────────────
    // Every screen that shows a party member steps it with L2 / R2 (the , and .
    // keys on a keyboard), through window.UINav.partyDir(). A scene hands its
    // step over once with installTabKey(scene, onCycle) and this runs it at the
    // head of the scene's update, so no screen reads the triggers itself. The
    // switcher prints no key hint of its own: PadUI stamps L2 / R2 on its two
    // ends while a pad is in hand.
    if (!window.CharSwitcher) {
        window.CharSwitcher = {
            isControllerConnected() {
                return typeof Input !== 'undefined' && typeof Input.lastInputDevice === 'function'
                    ? Input.lastInputDevice() === 'pad' : false;
            },
            parts() { return { left: '', right: '' }; },
            inner(tabsRowHTML) { return tabsRowHTML; },
            wrap(tabsRowHTML, memberCount) {
                return `<div class="companion-switcher">${this.inner(tabsRowHTML, memberCount)}</div>`;
            },
            // The name is historical: it installs the party step, which is on
            // the triggers now and on Tab no longer (Tab steps the tabs).
            installTabKey(scene, onCycle) {
                if (!scene || scene._charSwitchCycle) return;
                scene._charSwitchCycle = onCycle;
                const update = scene.update;
                scene.update = function () {
                    const nav = window.UINav;
                    const busy = window.Controller && window.Controller.textEntryOpen &&
                        window.Controller.textEntryOpen();
                    if (nav && this._charSwitchCycle && !busy && !this._uiModalOpen) {
                        const dir = nav.partyDir();
                        if (dir) {
                            this._charSwitchCycle(dir);
                            nav.consume('partyPrev');
                            nav.consume('partyNext');
                        }
                    }
                    return update.apply(this, arguments);
                };
            },
            removeTabKey(scene) {
                if (scene) scene._charSwitchCycle = null;
            }
        };
    }

    const pluginName = 'CustomSceneStatus';
    const parameters = PluginManager.parameters(pluginName);
    const maxDescriptionLength = parseInt(parameters['maxDescriptionLength'] || 200);


    let _statsI18n = null;

    const _loadStatsI18n = async () => {
        const lang = ConfigManager.language || 'en';
        const url = `js/i18n/${lang}/stats.json`;
        try {
            const response = await fetch(url);
            _statsI18n = await response.json();
        } catch (e) {
            console.error('CustomSceneStatus: Failed to load i18n data from ' + url, e);
        }
    };

    const _si18n = (key, fallback) => {
        if (_statsI18n && _statsI18n[key]) {
            return _statsI18n[key];
        }
        return fallback !== undefined ? fallback : key;
    };

    // Legacy trait data still ships { en: "...", it: "..." } objects instead of
    // an i18n key path; pick the active language and fall back to English.
    const _pickLocalized = (obj) => {
        if (!obj || typeof obj !== 'object') return "";
        const lang = ConfigManager.language || 'en';
        return obj[lang] || obj.en || "";
    };

    _loadStatsI18n();

    // Initialize character descriptions storage safely.
    // Stored on $gameSystem so descriptions persist into save files ($dataSystem is
    // not serialized into saves and lost the data across load).
    function initializeDescriptions() {
        if ($gameSystem && !$gameSystem._characterDescriptions) {
            $gameSystem._characterDescriptions = {};
        }
    }

    //=============================================================================
    // Bust Image Loading Helper
    //=============================================================================

    function getActorBustImagePath(actor) {
        if (!actor) return null;

        const actorId = actor.actorId && actor.actorId();
        const characterName = actor.characterName();
        const { SpritesAssociation } = window.Sprites || {};

        // Player 1 (Actor 1) special handling
        if (actorId === 1) {
            // Priority 1: Check Variable 109 (Player 1 bust name)
            const player1BustName = $gameActors.actor(1).vnBust();
            if (player1BustName && player1BustName !== "") {
                return "img/busts/" + player1BustName;
            }

            // Priority 2: If Switch 77 is ON, use Variable 106 for monster form
            if ($gameSwitches.value(77)) {
                const player1MonsterName = $gameActors.actor(1).vnBattler();
                if (player1MonsterName && player1MonsterName !== "") {
                    return "img/enemies/" + player1MonsterName;
                }
            }

            // Priority 3: Fall back to SpritesAssociation
            if (characterName && SpritesAssociation) {
                const spritesheetName = characterName.split('.')[0];
                const characterIndex = actor.characterIndex();

                if (SpritesAssociation[spritesheetName] &&
                    SpritesAssociation[spritesheetName][characterIndex]) {
                    const bustName = SpritesAssociation[spritesheetName][characterIndex];
                    return "img/busts/" + bustName;
                }
            }

            return "img/busts/7";
        }

        // Player 2 (Actor 2) special handling
        if (actorId === 2) {
            // Priority 1: Check Variable 117 (Player 2 bust name)
            const player2BustName = $gameActors.actor(2).vnBust();
            if (player2BustName && player2BustName !== "") {
                return "img/busts/" + player2BustName;
            }

            // Priority 2: If Switch 78 is ON, use Variable 107 for monster form
            if ($gameSwitches.value(78)) {
                const player2MonsterName = $gameActors.actor(2).vnBattler();
                if (player2MonsterName && player2MonsterName !== "") {
                    return "img/enemies/" + player2MonsterName;
                }
            }

            // Priority 3: Fall back to SpritesAssociation
            if (characterName && SpritesAssociation) {
                const spritesheetName = characterName.split('.')[0];
                const characterIndex = actor.characterIndex();

                if (SpritesAssociation[spritesheetName] &&
                    SpritesAssociation[spritesheetName][characterIndex]) {
                    const bustName = SpritesAssociation[spritesheetName][characterIndex];
                    return "img/busts/" + bustName;
                }
            }

            return "img/busts/7";
        }

        // Player 3 (Actor 3) special handling
        if (actorId === 3) {
            // Priority 1: Check Variable 118 (Player 3 bust name)
            const player3BustName = $gameActors.actor(3).vnBust();
            if (player3BustName && player3BustName !== "") {
                return "img/busts/" + player3BustName;
            }

            // Priority 2: If Switch 79 is ON, use Variable 108 for monster form
            if ($gameSwitches.value(79)) {
                const player3MonsterName = $gameActors.actor(3).vnBattler();
                if (player3MonsterName && player3MonsterName !== "") {
                    return "img/enemies/" + player3MonsterName;
                }
            }

            // Priority 3: Fall back to SpritesAssociation
            if (characterName && SpritesAssociation) {
                const spritesheetName = characterName.split('.')[0];
                const characterIndex = actor.characterIndex();

                if (SpritesAssociation[spritesheetName] &&
                    SpritesAssociation[spritesheetName][characterIndex]) {
                    const bustName = SpritesAssociation[spritesheetName][characterIndex];
                    return "img/busts/" + bustName;
                }
            }

            return "img/busts/7";
        }

        // Fallback to SpritesAssociation for any other actors
        if (characterName && SpritesAssociation) {
            const spritesheetName = characterName.split('.')[0];
            const characterIndex = actor.characterIndex();

            if (SpritesAssociation[spritesheetName] &&
                SpritesAssociation[spritesheetName][characterIndex]) {
                const bustName = SpritesAssociation[spritesheetName][characterIndex];
                return "img/busts/" + bustName;
            }
        }

        // Final fallback to default bust path structure
        return "img/busts/7";
    }

    function drawBustImage(bitmap, actor, x, y, width, height) {
        const bustPath = getActorBustImagePath(actor);

        // Always clear the area first
        bitmap.clearRect(x, y, width, height);

        if (!bustPath) return;

        // Determine if this is an enemy image (don't crop) or bust image (crop)
        const shouldCrop = !bustPath.includes('img/enemies/');

        // Load the main bust image
        const bustBitmap = ImageManager.loadBitmap('', bustPath);

        bustBitmap.addLoadListener(() => {
            // Check if the bitmap actually loaded successfully
            if (bustBitmap.width > 0 && bustBitmap.height > 0) {
                drawBustToCanvas(bitmap, bustBitmap, x, y, width, height, shouldCrop);
            }
        });
    }

    function drawBustToCanvas(bitmap, sourceBitmap, x, y, width, height, shouldCrop = true) {
        try {
            // Disable image smoothing for pixel-perfect rendering
            const context = bitmap.context;
            const oldSmoothing = context.imageSmoothingEnabled;
            context.imageSmoothingEnabled = false;

            // Get source image dimensions
            const sourceWidth = sourceBitmap.width > 0 ? sourceBitmap.width : 889;
            const sourceHeight = sourceBitmap.height > 0 ? sourceBitmap.height : 1200;

            let cropTop = 0;
            let cropLeft = 0;
            let croppedSourceWidth = sourceWidth;
            let croppedSourceHeight = sourceHeight;

            // For bust images, zoom in on the face area with tighter cropping
            if (shouldCrop) {
                // Crop from top to show face details (320px from top instead of 180px)
                cropTop = 320;
                // Crop from sides to zoom in (center 60% of width)
                cropLeft = Math.round(sourceWidth * 0.2);
                croppedSourceWidth = Math.round(sourceWidth * 0.6);
                croppedSourceHeight = sourceHeight - cropTop;
            }

            const aspectRatio = croppedSourceWidth / croppedSourceHeight;

            // Calculate draw dimensions to fit within the display area while maintaining aspect ratio
            let drawWidth = width;
            let drawHeight = Math.round(width / aspectRatio);

            // If height exceeds available space, scale down
            if (drawHeight > height) {
                drawHeight = height;
                drawWidth = Math.round(height * aspectRatio);
            }

            // Center the image within the specified area
            const drawX = Math.round(x + (width - drawWidth) / 2);
            const drawY = Math.round(y + (height - drawHeight) / 2);

            // Draw the image (cropped if it's a bust, full if it's an enemy)
            bitmap.blt(sourceBitmap, cropLeft, cropTop, croppedSourceWidth, croppedSourceHeight, drawX, drawY, drawWidth, drawHeight);

            // Restore original smoothing setting
            context.imageSmoothingEnabled = oldSmoothing;
        } catch (error) {
            // Silently handle errors
        }
    }

    //=============================================================================
    // Translation Helper
    //=============================================================================



    // Copy lives in js/i18n/<lang>/plugins/SceneStatus.json.
    function getText(key) {
        return T("SceneStatus." + key);
    }

    let i18nData = null;

    const loadI18nData = async () => {
        const lang = ConfigManager.language || "en";
        const url = `js/i18n/${lang}/traits.json`;
        try {
            const response = await fetch(url);
            i18nData = await response.json();
            // Trait names and descriptions are read straight out of this bank,
            // so redraw a status screen that opened before the fetch landed.
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Status && scene.refreshUIStatus) {
                scene.refreshUIStatus();
            }
        } catch (e) {
            console.error("CustomSceneStatus: Failed to load i18n data from " + url, e);
        }
    };

    const resolveI18nPath = (path, obj) => {
        if (!path || !obj) return null;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    // A trait's name/description is either an i18n key path into traits.json
    // (loaded into i18nData) or a legacy { en, it } object. Anything that does
    // not resolve falls back to the raw value so a missing translation still
    // reads as something.
    const resolveTraitField = (value) => {
        if (!value) return "";
        if (typeof value === 'object') return _pickLocalized(value);
        const text = String(value);
        if (text.includes('.')) {
            const resolved = i18nData ? resolveI18nPath(text, i18nData) : null;
            if (typeof resolved === 'string') return resolved;
        }
        return text;
    };

    const escapeAttr = (text) => String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    // Database display names, localized the way the rest of the menus do it.
    const dbName = (entry) =>
        window.CCDbName ? window.CCDbName(entry) : (entry && entry.name) || "";

    const iconStyle = (iconIndex, size) => {
        const box = `width:${size}px; height:${size}px; display:inline-block; flex:0 0 auto;`;
        if (!iconIndex) return box;
        const col = iconIndex % 16;
        const row = Math.floor(iconIndex / 16);
        return `${box} background-image:url('img/system/IconSet.png'); background-size:${size * 16}px auto; background-position:-${col * size}px -${row * size}px; image-rendering:pixelated;`;
    };

    const TRAIT_CATEGORY_KEYS = {
        genetic: "tabGenetic",
        physical: "tabPhysical",
        mental: "tabMental",
        magical: "tabMagical"
    };   // i18n-ignore: keys into Traits.<tab*>

    const paramDisplayName = (key) => ({
        hp: _si18n("HP", "HP"),
        mp: _si18n("MP", "MP"),
        atk: _si18n("ATT", "STR"),
        def: _si18n("DEF", "CON"),
        mat: _si18n("M.ATT", "INT"),
        mdf: _si18n("M.DEF", "WIS"),
        agi: _si18n("AGILITY", "DEX"),
        luk: _si18n("LUCK", "PSI"),
        eva: "EVA"   // i18n-ignore: universal stat abbreviation
    })[key] || key;

    // Specializations (js/db/Skills/Specialization.json) this trait gives a head
    // start in. Empty until window.Specializations finishes its async load.
    const traitSpecializations = (trait) => {
        if (!trait || typeof trait.name !== "string") return [];
        if (!window.Specializations || !window.Specializations.ready) return [];
        const slug = trait.name.split(".")[1];
        if (!slug) return [];
        const rows = [];
        window.Specializations.list.forEach(spec => {
            const level = spec.traitStart && spec.traitStart[slug];
            if (level) rows.push(`${window.Specializations.displayName(spec)} (${window.Specializations.levelName(level)})`);
        });
        return rows.sort();
    };

    // A trait written out in full: what it is, what it says, and everything it
    // does to the character. One of these is drawn per trait on the traits tab,
    // so nothing about a trait is hidden behind a chip any more.
    function buildTraitDossierHTML(trait) {
        const name = resolveTraitField(trait.name);
        const desc = resolveTraitField(trait.description);
        const categoryKey = TRAIT_CATEGORY_KEYS[trait.category];

        const badge = (label, color) =>
            `<span class="status-trait-badge"${color ? ` style="color:${color}"` : ""}>${escapeAttr(label)}</span>`;

        const iconBadge = (iconIndex, label, suffix) =>
            `<span class="status-trait-badge"><span style="${iconStyle(iconIndex, 16)}"></span>${escapeAttr(label)}${suffix ? ` ${suffix}` : ""}</span>`;

        const statBadges = (stats, color) => Object.keys(stats || {}).map(key => {
            const value = stats[key];
            return badge(`${paramDisplayName(key)} ${value > 0 ? "+" : ""}${value}`, color);
        }).join("");

        // trait.items is a flat array with one entry per copy, so tally by id.
        const counted = (ids) => {
            const tally = {};
            (ids || []).forEach(id => { tally[id] = (tally[id] || 0) + 1; });
            return tally;
        };
        const dbBadges = (ids, table) => {
            const tally = counted(ids);
            return Object.keys(tally).map(id => {
                const entry = table[id];
                return entry ? iconBadge(entry.iconIndex, dbName(entry), tally[id] > 1 ? `x${tally[id]}` : "") : "";
            }).join("");
        };

        const skillBadges = (trait.skills || []).map(id => {
            const skill = $dataSkills[id];
            return skill ? iconBadge(skill.iconIndex, dbName(skill), "") : "";
        }).join("");

        const equipBadges = (trait.equipment || []).map(id => {
            const entry = $dataWeapons[id] || $dataArmors[id];
            return entry ? iconBadge(entry.iconIndex, dbName(entry), "") : "";
        }).join("");

        const specBadges = traitSpecializations(trait).map(text => badge(text)).join("");

        const row = (label, content) => content ? `
            <div class="status-trait-row">
                <span class="status-trait-row-label">${label}</span>
                <span class="status-trait-badges">${content}</span>
            </div>
        ` : "";

        // What the trait cost to take, in the same badge the creation screen
        // prices it with. TraitPoints lives in TraitSelector.js.
        const points = window.TraitPoints;
        const costBadge = points ? points.costBadgeHTML(points.costOf(trait)) : "";

        return `
            <div class="status-trait-head">
                <span style="${iconStyle(trait.icon, 22)}"></span>
                <span class="status-trait-name">${escapeAttr(name)}</span>
                ${costBadge}
            </div>
            <div class="status-trait-desc">${escapeAttr(desc) || T('SceneStatus.trait.noDescription')}</div>
            ${row(T('SceneStatus.trait.category'), categoryKey ? badge(T('Traits.' + categoryKey)) : "")}
            ${row(T('Traits.benefits'), statBadges(trait.positive, 'var(--text-forest-green)'))}
            ${row(T('Traits.drawbacks'), statBadges(trait.negative, 'var(--accent-red-3)'))}
            ${row(T('Traits.grantsSkills'), skillBadges)}
            ${row(T('Traits.startingItems'), dbBadges(trait.items, $dataItems))}
            ${row(T('SceneStatus.trait.equipment'), equipBadges)}
            ${row(T('SceneStatus.trait.specializations'), specBadges)}
        `;
    }

    // The purse the character's traits were bought out of, printed above them:
    // what was spent, out of what the budget and the drawbacks made available.
    function buildTraitPointsHTML(traits) {
        const points = window.TraitPoints;
        if (!points) return "";
        const tally = points.tally(traits);
        const paidBack = tally.credit > 0 ? ` <span class="trait-cost refund">+${tally.credit}</span>` : "";
        return `
            <div class="status-trait-points">
                <span class="status-trait-row-label">${T('SceneStatus.trait.points')}</span>
                <span><b>${tally.spent}</b> / ${tally.available}${paidBack}</span>
            </div>
        `;
    }

    // Every trait the character carries, each one fully written out, however
    // many there are: the page scrolls rather than capping the list. A stored
    // entry is sometimes a trimmed copy (id, icon and name only), so the trait
    // database is read over it before the dossier is built.
    function buildTraitsPageHTML(actor) {
        const stored = (actor && actor._selectedTraits) || [];
        if (stored.length === 0) {
            return `<div class="status-traits-empty">${T('SceneStatus.ui.noTraits')}</div>`;
        }
        const traits = stored.map(entry => {
            const full = getTraitById(entry.id);
            return full ? Object.assign({}, full, entry) : entry;
        });
        return buildTraitPointsHTML(traits) + traits
            .map(trait => `<div class="status-trait-entry">${buildTraitDossierHTML(trait)}</div>`)
            .join("");
    }

    //=============================================================================
    // Right-page tabs
    //
    // The sheet is read one section at a time instead of stacking every card
    // down a page that was never tall enough for them: the body part by part
    // (the default), the raw numbers, the traits written out, what is permanently on, and the body's
    // own condition. The chips are the shared bookmark-tab design the backpack
    // and the shop already use (.backpack-tabs / .backpack-tab in css/theme.css).
    //=============================================================================

    const STATUS_TABS = [
        { id: "bodyparts", labelKey: "SceneStatus.ui.tabBodyParts" },
        { id: "attributes", labelKey: "SceneStatus.ui.tabAttributes" },
        { id: "bio", labelKey: "SceneStatus.ui.tabBio" },
        { id: "backstory", labelKey: "SceneStatus.ui.tabBackstory" },
        { id: "traits", labelKey: "SceneStatus.ui.tabTraits" },
        { id: "passives", labelKey: "SceneStatus.ui.tabPassives" },
        { id: "diseases", labelKey: "SceneStatus.ui.tabDiseases" }
    ];

    // The section the sheet opens on. The body is what the page is for, and
    // whichever tab was last read is kept on $gameSystem so re-opening the
    // screen (or another character's) comes back to it rather than to the top.
    const DEFAULT_STATUS_TAB = STATUS_TABS[0].id;

    const rememberedStatusTab = () => {
        const stored = $gameSystem ? $gameSystem._statusActiveTab : null;
        return STATUS_TABS.some(tab => tab.id === stored) ? stored : DEFAULT_STATUS_TAB;
    };

    const rememberStatusTab = (tabId) => {
        if ($gameSystem) $gameSystem._statusActiveTab = tabId;
    };

    // How far one press of up / down moves the traits page, in pixels.
    const TRAIT_SCROLL_STEP = 48;

    // ------------------------------------------------------------------
    // Attribute points
    // ------------------------------------------------------------------
    // A class param curve here climbs about two points across the whole of
    // levels 1 to 99, and the sheet reads on the D&D scale where a stat of 10
    // is the average and every two points are one modifier step. One free
    // point every four levels is therefore already generous: 24 points by
    // level 99, four per attribute if they are spread evenly, which is +2
    // modifier on every line. The gap is kept at four (any wider and the
    // reward stops landing often enough to feel like progress, any tighter
    // and the curve outruns every enemy in the book) and a per attribute cap
    // stops the whole pool being dumped into one stat.
    const STAT_POINT_LEVEL_GAP = 4;
    const STAT_POINT_PER_STAT_CAP = 8;
    const STAT_POINT_PARAM_IDS = [2, 3, 4, 5, 6, 7];

    // Points are permanent: spending one writes it into the actor's own
    // _paramPlus, which is saved with the actor and never expires. The ledger
    // beside it is only there so the sheet can tell an awarded point from a
    // trait bonus and so the per attribute cap can be enforced.
    function statNameForParam(paramId) {
        switch (Number(paramId)) {
            case 2: return _si18n("ATT", "STR");
            case 3: return _si18n("DEF", "CON");
            case 4: return _si18n("M.ATT", "INT");
            case 5: return _si18n("M.DEF", "WIS");
            case 6: return _si18n("AGILITY", "DEX");
            case 7: return _si18n("LUCK", "PSI");
            default: return "";
        }
    }

    window.StatPoints = {
        levelGap: STAT_POINT_LEVEL_GAP,
        perStatCap: STAT_POINT_PER_STAT_CAP,
        paramIds: STAT_POINT_PARAM_IDS.slice(),

        earned(actor) {
            if (!actor) return 0;
            return Math.floor(actor.level / STAT_POINT_LEVEL_GAP);
        },

        ledger(actor) {
            if (!actor) return {};
            if (!actor._statPointsSpent) actor._statPointsSpent = {};
            return actor._statPointsSpent;
        },

        spentOn(actor, paramId) {
            return this.ledger(actor)[paramId] || 0;
        },

        totalSpent(actor) {
            const led = this.ledger(actor);
            return STAT_POINT_PARAM_IDS.reduce((sum, id) => sum + (led[id] || 0), 0);
        },

        available(actor) {
            return Math.max(0, this.earned(actor) - this.totalSpent(actor));
        },

        canSpend(actor, paramId) {
            if (!actor || STAT_POINT_PARAM_IDS.indexOf(Number(paramId)) < 0) return false;
            if (this.available(actor) <= 0) return false;
            return this.spentOn(actor, paramId) < STAT_POINT_PER_STAT_CAP;
        },

        spend(actor, paramId) {
            paramId = Number(paramId);
            if (!this.canSpend(actor, paramId)) return false;
            const led = this.ledger(actor);
            led[paramId] = (led[paramId] || 0) + 1;
            actor.addParam(paramId, 1);
            return true;
        }
    };

    // Build the stat bonuses and modifier breakdown table for the Attributes tab
    function buildStatBreakdownHTML(actor) {
        if (!actor) return "";
        const params = [
            { name: _si18n("ATT", "STR"), id: 2, icon: 76 },
            { name: _si18n("DEF", "CON"), id: 3, icon: 77 },
            { name: _si18n("AGILITY", "DEX"), id: 6, icon: 81 },
            { name: _si18n("M.ATT", "INT"), id: 4, icon: 79 },
            { name: _si18n("M.DEF", "WIS"), id: 5, icon: 80 },
            { name: _si18n("LUCK", "PSI"), id: 7, icon: 82 }
        ];

        const rows = params.map(p => {
            const baseVal = actor.paramBase(p.id);
            const equipVal = actor.equips().reduce((acc, eq) => acc + (eq && eq.params ? (eq.params[p.id] || 0) : 0), 0);
            const awardedVal = window.StatPoints.spentOn(actor, p.id);
            const traitVal = ((actor._paramPlus && actor._paramPlus[p.id]) || 0) - awardedVal;
            const limbMod = (actor._statModifiers && actor._statModifiers[p.id]) || 0;
            const totalVal = actor.param(p.id);
            const dndModNum = Math.floor((totalVal - 10) / 2);
            const dndModText = dndModNum >= 0 ? "+" + dndModNum : String(dndModNum);

            const equipClass = equipVal > 0 ? "status-stat-bonus-positive" : (equipVal < 0 ? "status-stat-bonus-negative" : "status-stat-bonus-zero");
            const traitClass = traitVal > 0 ? "status-stat-bonus-positive" : (traitVal < 0 ? "status-stat-bonus-negative" : "status-stat-bonus-zero");
            const awardedClass = awardedVal > 0 ? "status-stat-bonus-positive" : "status-stat-bonus-zero";
            const limbClass = limbMod > 0 ? "status-stat-bonus-positive" : (limbMod < 0 ? "status-stat-bonus-negative" : "status-stat-bonus-zero");

            const equipStr = equipVal > 0 ? `+${equipVal}` : String(equipVal);
            const traitStr = traitVal > 0 ? `+${traitVal}` : String(traitVal);
            const awardedStr = awardedVal > 0 ? `+${awardedVal}` : "0";
            const limbStr = limbMod !== 0 ? `${limbMod > 0 ? '+' : ''}${limbMod}%` : "0%";

            return `
                <tr>
                    <td><span class="status-01" style="${iconStyle(p.icon, 16)} vertical-align:middle"></span>${escapeAttr(p.name)}</td>
                    <td class="status-02">${baseVal}</td>
                    <td class="${equipClass}">${equipStr}</td>
                    <td class="${traitClass}">${traitStr}</td>
                    <td class="${awardedClass}">${awardedStr}</td>
                    <td class="${limbClass}">${limbStr}</td>
                    <td class="status-03">${totalVal}</td>
                    <td><span class="status-stat-mod-badge">${dndModText}</span></td>
                </tr>
            `;
        }).join("");

        return `
            <div class="status-stat-breakdown-card">
                <div class="card-label status-04">${T('SceneStatus.ui.statBreakdown')}</div>
                <table class="status-stat-table">
                    <thead>
                        <tr>
                            <th>${T('SceneStatus.parameters')}</th>
                            <th>${T('SceneStatus.ui.statBase')}</th>
                            <th>${T('SceneStatus.ui.statGear')}</th>
                            <th>${T('SceneStatus.ui.statTraits')}</th>
                            <th>${T('SceneStatus.ui.statAwarded')}</th>
                            <th>${T('SceneStatus.ui.statInjuries')}</th>
                            <th>${T('SceneStatus.total')}</th>
                            <th>${T('SceneStatus.ui.statMod')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    }

    function getActorProfile(actor) {
        if (!actor) return null;
        const name = actor.name();
        if (window.NPCEmpathize && window.NPCEmpathize._helpers && window.NPCEmpathize._helpers._getProfile) {
            const p = window.NPCEmpathize._helpers._getProfile(name);
            if (p) return p;
        }
        if ($gameSystem && $gameSystem._npcSociety && $gameSystem._npcSociety[name]) {
            return $gameSystem._npcSociety[name];
        }
        if (window.NPCSocietyRegistry && window.NPCSocietyRegistry.ensureProfile) {
            try {
                window.NPCSocietyRegistry.ensureProfile(name, actor.currentClass() ? actor.currentClass().id : null);
                if ($gameSystem && $gameSystem._npcSociety && $gameSystem._npcSociety[name]) {
                    return $gameSystem._npcSociety[name];
                }
            } catch (e) {}
        }
        return null;
    }

    // The bio sheet and the backstory are two tabs off one build: both are read
    // from the same profile, so splitting them into two functions would only
    // mean resolving that profile twice. `section` says which half is wanted.
    function buildBioPageHTML(actor, section) {
        if (!actor) return "";
        const profile = getActorProfile(actor);
        const memberIndex = $gameParty.allMembers().indexOf(actor);

        // 1. Demographics & Identity
        const genderVal = actor.gender ? actor.gender() : (profile?.gender ?? 0);
        let genderLabel = "";
        switch (genderVal) {
            case 0: genderLabel = `${T("MainMenu.gender.male")} (He/Him)`; break;
            case 1: genderLabel = `${T("MainMenu.gender.female")} (She/Her)`; break;
            case 2: genderLabel = `${T("MainMenu.gender.nonBinary")} (They/Them)`; break;
            case 3: genderLabel = `${T("MainMenu.gender.cocoon")} (It/Its)`; break;
            default: genderLabel = T("MainMenu.gender.fluid"); break;
        }

        const ccUtils = window.CharacterCreationUtils;
        const repVar = (ccUtils && ccUtils.getReproductiveVariableId)
            ? ccUtils.getReproductiveVariableId(Math.max(0, memberIndex)) : 87;
        const repType = $gameVariables ? $gameVariables.value(repVar) : 0;
        let repName = "";
        switch (repType) {
            case -1: repName = T("MainMenu.reproduction.none"); break;
            case 0: repName = T("MainMenu.reproduction.testicles"); break;
            case 1: repName = T("MainMenu.reproduction.uterus"); break;
            case 2: repName = T("MainMenu.reproduction.oviparous"); break;
            case 3: repName = T("MainMenu.reproduction.plant"); break;
            case 4: repName = T("MainMenu.reproduction.mitosis"); break;
            default: repName = T("MainMenu.reproduction.unknown"); break;
        }
        const health = window.HealthCore;
        const gestationDays = health && health.getPregnancyDuration ? health.getPregnancyDuration(actor, repType) : (repType === 4 ? 1 : 280);

        const archKeys = (health && health.getActorArchetypeKeys) ? health.getActorArchetypeKeys(actor) : [];
        const archNames = archKeys.map(k => health.getArchetypeDisplayName(k)).filter(Boolean);
        const archetypeText = archNames.length ? archNames.join(" / ") : (profile?.isCreature ? T('SceneStatus.ui.archetypeCreature') : T('SceneStatus.ui.archetypeHumanoid'));

        const nowYear = (window.NPCLifeSim && window.NPCLifeSim.currentYear) ? window.NPCLifeSim.currentYear() : 2001;
        let ageVal = ($gameSystem._ccBirthAge && $gameSystem._ccBirthAge[memberIndex]) ||
                     (window.NPCLifeSim && window.NPCLifeSim.ageOf && window.NPCLifeSim.ageOf(actor.name())) || null;
        let birthYearVal = profile?._birthYearOverride || null;
        if (birthYearVal && !ageVal) ageVal = Math.max(18, nowYear - birthYearVal);
        if (ageVal && !birthYearVal) birthYearVal = nowYear - ageVal;
        if (!ageVal) {
            const minAge = (window.NPCLifeSim && window.NPCLifeSim.MIN_NPC_AGE) || 18;
            ageVal = minAge + Math.max(0, actor.level || 1) * 2;
            birthYearVal = nowYear - ageVal;
        }

        let bloodType = "O+";
        if (window.BloodTypeService && window.BloodTypeService.getForActor) {
            const bt = window.BloodTypeService.getForActor(actor);
            if (bt) bloodType = bt;
        } else if (profile?.bloodType) {
            bloodType = profile.bloodType;
        }

        const homeGroup = profile?._homeGroupName;
        let homeTown = "-";
        if (homeGroup) {
            homeTown = (window.WorkSystem && window.WorkSystem.destinationName) ? window.WorkSystem.destinationName(homeGroup) : homeGroup;
        } else if (profile?.birthplace) {
            homeTown = (window.WorkSystem && window.WorkSystem.destinationName) ? window.WorkSystem.destinationName(profile.birthplace) : profile.birthplace;
        }
        const nationId = profile?.birthplace || profile?._birthplaceOverride || null;
        const nationName = nationId && window.WorldNames ? window.WorldNames.nation(nationId) : (nationId || "-");

        let sexualOrientation = "-";
        let romanticOrientation = "-";
        if (window.NPCEmpathize && window.NPCEmpathize._helpers && window.NPCEmpathize._helpers._npcRomance) {
            const rom = window.NPCEmpathize._helpers._npcRomance(actor.name(), profile);
            if (rom) {
                if (rom.sexual) {
                    const k = rom.sexual.name;
                    sexualOrientation = (window.T && window.T.has && window.T.has(k)) ? window.T(k) : (rom.sexual.key || "-");
                }
                if (rom.romantic) {
                    const k = rom.romantic.name;
                    romanticOrientation = (window.T && window.T.has && window.T.has(k)) ? window.T(k) : (rom.romantic.key || "-");
                }
            }
        }

        // 2. Society, Creed & Morality
        const dl = window._NPCSocietyDataLoader;
        let persName = "-";
        let persIcon = 4;
        let persDesc = "";
        if (profile && profile.personalityIndex >= 0 && dl?.personalities) {
            const pObj = dl.personalities[profile.personalityIndex];
            if (pObj) {
                persName = (window.NPCEmpathize && window.NPCEmpathize._helpers && window.NPCEmpathize._helpers._personalityLabel)
                    ? window.NPCEmpathize._helpers._personalityLabel(pObj.name)
                    : (pObj.name || "-");
                persIcon = pObj.iconIndex || 4;
                persDesc = pObj.description || "";
            }
        }

        const ideology = window.NPCShared ? window.NPCShared.ideologyFor(profile) : null;
        // DataService.t hands the key straight back when the entry is missing, so
        // an unresolved lookup has to be spotted and titled by hand rather than
        // printed as "ideology.genomic_purity_restorationist".
        const titleCase = (key) => (key || "").split('.').pop().split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        let ideologyName = "-";
        if (ideology) {
            const looked = window.DataService?.t?.(ideology.name);
            ideologyName = (looked && looked !== ideology.name) ? looked : titleCase(ideology.name);
        }

        let factionName = "-";
        let factionIcon = 187;
        if (profile && profile.factionIndex >= 0 && dl?.factions) {
            const fObj = dl.factions[profile.factionIndex];
            if (fObj) {
                factionName = (window.NPCEmpathize && window.NPCEmpathize._helpers && window.NPCEmpathize._helpers._factionDisplayName)
                    ? window.NPCEmpathize._helpers._factionDisplayName(fObj)
                    : (fObj.name || "-");
                factionIcon = fObj.iconIndex || 187;
            }
        }

        const wealthTier = profile?.wealthTierChosen != null ? profile.wealthTierChosen : (profile?.wealthTierBase ?? 2);
        const wealthLabels = [T("Empathize.destitute"), T("Empathize.poor"), T("Empathize.workingClass"), T("Empathize.middleClass"), T("Empathize.wealthy")];
        const wealthText = wealthLabels[wealthTier] || wealthLabels[2];

        const morality = profile?.moralityScore ?? 0;
        const moralMap = [
            { threshold: -60, label: T("Empathize.evil"), band: "wicked" },
            { threshold: -20, label: T("Empathize.dishonest"), band: "wicked" },
            { threshold: 20, label: T("Empathize.neutral"), band: "neutral" },
            { threshold: 60, label: T("Empathize.honest"), band: "upright" },
            { threshold: Infinity, label: T("Empathize.virtuous"), band: "upright" }
        ];
        const moralEntry = moralMap.find(e => morality < e.threshold) || moralMap[2];

        // 3. Specializations
        const specs = [];
        if (window.Specializations?.ready && actor.specializationLevel) {
            window.Specializations.list.forEach(spec => {
                const lvl = actor.specializationLevel(spec.id);
                if (lvl > 1) {
                    specs.push({
                        name: window.Specializations.displayName(spec),
                        levelName: window.Specializations.levelName(lvl),
                        icon: spec.iconIndex || 0
                    });
                }
            });
            specs.sort((a, b) => a.name.localeCompare(b.name));
        }

        let specsHTML = "";
        if (specs.length) {
            // Specializations read as a list of names, not as buttons: no plate
            // and no frame, only the icon, the name and the rank behind it.
            specsHTML = `<div class="status-spec-tags">` +
                specs.map(s => `<span class="status-spec-tag"><span style="${iconStyle(s.icon, 16)}"></span>${escapeAttr(s.name)} <b>(${escapeAttr(s.levelName)})</b></span>`).join("") +
                `</div>`;
        } else {
            specsHTML = `<div class="status-06">${T('SceneStatus.ui.noSpecializations')}</div>`;
        }

        // 4. Backstory Narrative & Formative Events
        if (profile && !profile.backstory && window.NPCHistSim?.generateBackstoryNow) {
            try { window.NPCHistSim.generateBackstoryNow(actor.name()); } catch (e) {}
        }
        const backstory = profile?.backstory;
        const emStory = (actor.name() === "Em" && window.CharacterPresets?.getEmBackstory)
            ? window.CharacterPresets.getEmBackstory(ConfigManager.language)
            : null;
        let narrative = "";
        if (emStory && emStory.paragraphs) {
            narrative = emStory.paragraphs.join("\n\n");
        } else if (backstory) {
            narrative = window.NPCHistSim?.narrativeOf?.(backstory) ?? backstory.narrative ?? "";
        } else if ($gameSystem?._characterDescriptions?.[actor.actorId()]) {
            narrative = $gameSystem._characterDescriptions[actor.actorId()];
        }

        const events = backstory?.formativeEvents || [];
        const ICONS = window.HistorySimulator_ICONS || {};
        let eventsHTML = "";
        if (events.length) {
            eventsHTML = `<div class="status-bio-events-list">` +
                events.map(ev => {
                    const iconId = ICONS[ev.category] || 245;
                    return `
                        <div class="status-bio-event-row">
                            <span style="${iconStyle(iconId, 16)}"></span>
                            <span class="status-bio-event-date">${escapeAttr(ev.date)}</span>
                            <span>${escapeAttr(ev.description)}</span>
                        </div>
                    `;
                }).join("") +
                `</div>`;
        }

        if (section === "backstory") {
            return `
            <div class="status-bio-section">
                <div class="card-label">${T('SceneStatus.ui.backstoryTitle')}</div>
                ${narrative ? `<div class="status-bio-narrative">${escapeAttr(narrative)}</div>` : `<div class="status-06">${T('SceneStatus.ui.noBackstory')}</div>`}
                ${eventsHTML}
            </div>
        `;
        }

        return `
            <div class="status-bio-section">
                <div class="card-label">${T('SceneStatus.ui.identityTitle')}</div>
                <div class="status-bio-grid">
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.gender')}:</span>
                        <span class="status-bio-item-val">${escapeAttr(genderLabel)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.reproduction')}:</span>
                        <span class="status-bio-item-val">${escapeAttr(repName)} <span class="status-07">(${gestationDays}d)</span></span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.archetype')}:</span>
                        <span class="status-bio-item-val status-08">${escapeAttr(archetypeText)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.age')}:</span>
                        <span class="status-bio-item-val">${escapeAttr(ageVal)} <span class="status-07">(${birthYearVal})</span></span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.bloodType')}:</span>
                        <span class="status-bio-item-val status-02">${escapeAttr(bloodType)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.hometown')}:</span>
                        <span class="status-bio-item-val">${escapeAttr(homeTown)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.nation')}:</span>
                        <span class="status-bio-item-val">${escapeAttr(nationName)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.sexualOrientation')}:</span>
                        <span class="status-bio-item-val">${escapeAttr(sexualOrientation)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.romanticOrientation')}:</span>
                        <span class="status-bio-item-val">${escapeAttr(romanticOrientation)}</span>
                    </div>
                </div>
            </div>

            <div class="status-bio-section">
                <div class="card-label">${T('SceneStatus.ui.societyTitle')}</div>
                <div class="status-bio-grid">
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.personality')}:</span>
                        <span class="status-bio-item-val"><span style="${iconStyle(persIcon, 16)} vertical-align:middle"></span> ${escapeAttr(persName)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.ideology')}:</span>
                        <span class="status-bio-item-val"><span style="${iconStyle(186, 16)} vertical-align:middle"></span> ${escapeAttr(ideologyName)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.faction')}:</span>
                        <span class="status-bio-item-val"><span style="${iconStyle(factionIcon, 16)} vertical-align:middle"></span> ${escapeAttr(factionName)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.wealth')}:</span>
                        <span class="status-bio-item-val"><span style="${iconStyle(314, 16)} vertical-align:middle"></span> ${escapeAttr(wealthText)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.morality')}:</span>
                        <span class="status-bio-item-val badge morality--${moralEntry.band}">${escapeAttr(moralEntry.label)} (${morality >= 0 ? '+' : ''}${morality})</span>
                    </div>
                </div>
                ${persDesc ? `<div class="status-09">${escapeAttr(persDesc)}</div>` : ''}
            </div>

            <div class="status-bio-section">
                <div class="card-label">${T('SceneStatus.ui.specializationsTitle')}</div>
                ${specsHTML}
            </div>
        `;
    }

    // The element a class declares (<elem: n> in its notebox) doubles as the
    // emblem of its signature passive. 0 when the class declares none, which
    // leaves the row's icon slot empty rather than printing a wrong sprite.
    const ELEMENT_ICONS = [0, 96, 64, 65, 66, 67, 68, 69, 70, 71];

    const classElementIcon = (actorClass) => {
        const match = actorClass && actorClass.note && actorClass.note.match(/<elem:\s*(\d+)>/);
        if (!match) return 0;
        return ELEMENT_ICONS[parseInt(match[1], 10)] || 0;
    };

    // Everything this character IS outside a fight and inside one: the class's
    // own ability, the ability each selected trait carries (both read from
    // BattleSystemPassiveSkills, so the wording matches the creation screens)
    // and the limit break the class pulls off the floor once a day
    // (window.LimitBreak). Em, carrying the vector gun, opens the pact book
    // instead of her class's, and her card says so.
    function buildPassivesHTML(actor) {
        const api = window.BattleSystemPassiveSkills;
        const actorClass = actor.currentClass();
        const rows = [];

        if (api && actorClass) {
            const name = api.getPassiveName(actorClass.id);
            if (name) {
                rows.push({
                    icon: classElementIcon(actorClass),
                    name: name,
                    desc: api.getPassiveEffect(actorClass.id),
                    tag: T("SceneStatus.ui.sourceClass")
                });
            }
        }

        if (api && api.getActorTraitPassives) {
            api.getActorTraitPassives(actor).forEach(passive => {
                const trait = getTraitById(passive.traitId);
                rows.push({
                    icon: (trait && trait.icon) || 0,
                    name: passive.name,
                    desc: passive.desc,
                    tag: T("SceneStatus.ui.sourceTrait")
                });
            });
        }

        const LB = window.LimitBreak;
        if (LB && actorClass) {
            const card = LB.cardForClass ? LB.cardForClass(actorClass.id) : null;
            if (card && card.name) {
                rows.push({
                    icon: 76,
                    name: card.name,
                    desc: card.desc,
                    tag: T("SceneStatus.ui.sourceLimit")
                });
            }
            // The pact the gun opens instead, which is nobody's but hers.
            if (LB.usesGrimoire && LB.usesGrimoire(actor) && LB.grimoireCard) {
                const pact = LB.grimoireCard();
                if (pact && pact.name) {
                    rows.push({
                        icon: 76,
                        name: pact.name,
                        desc: pact.desc,
                        tag: T("SceneStatus.ui.sourceLimit")
                    });
                }
            }
        }

        if (!rows.length) {
            return `<div class="status-empty-note">${T("SceneStatus.ui.noPassives")}</div>`;
        }

        return rows.map(row => `
            <div class="status-passive-row">
                <span style="${iconStyle(row.icon, 32)}"></span>
                <div class="status-passive-body">
                    <div class="status-passive-name">
                        <span>${escapeAttr(row.name)}</span>
                        <span class="status-passive-tag">${escapeAttr(row.tag)}</span>
                    </div>
                    <div class="status-passive-desc">${escapeAttr(row.desc)}</div>
                </div>
            </div>
        `).join("");
    }

    //=============================================================================
    // Seeded Random Number Generator
    //=============================================================================

    class SeededRandom {
        constructor(seed) {
            this.seed = seed;
        }

        next() {
            this.seed = (this.seed * 9301 + 49297) % 233280;
            return this.seed / 233280;
        }
    }

    function stringToSeed(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    //=============================================================================
    // Trait Generation
    //=============================================================================

    function getTraitById(traitId) {
        if (!window.Health || !window.Health.Traits) {
            return null;
        }
        return window.Health.Traits.find(trait => trait.id === traitId);
    }

    // A companion's traits, rolled from their name so the same character always
    // carries the same ones. The roll goes through TraitPoints, so a generated
    // sheet is bought out of the same purse a player would spend and can never
    // hold more than the budget pays for. Only id / icon / name are stored: the
    // rest is read back out of the trait database when the sheet is drawn.
    function generateRandomTraits(actorName) {
        const points = window.TraitPoints;
        if (!points || !window.Health || !(window.Health.Traits || []).length) {
            return [];
        }
        const rng = new SeededRandom(stringToSeed(actorName));
        return points.pick({ rng: () => rng.next() }).map(trait => ({
            id: trait.id,
            icon: trait.icon,
            name: trait.name
        }));
    }

    function ensureActorTraits(actor, partyIndex) {
        if (partyIndex === 0) {
            // First party member has no auto-generated traits
            if (!actor._selectedTraits) {
                actor._selectedTraits = [];
            }
        } else {
            // Other party members get seeded random traits
            if (!actor._selectedTraits || actor._selectedTraits.length === 0) {
                actor._selectedTraits = generateRandomTraits(actor.name());
            }
        }
    }

    //=============================================================================
    // Plugin Commands
    //=============================================================================

    PluginManager.registerCommand(pluginName, "setCharacterDescription", args => {
        const partyIndex = parseInt(args.partyMemberIndex) - 1;
        const description = args.description || "";
        const actor = $gameParty.allMembers()[partyIndex];

        if (actor) {
            if (!$gameSystem || !$gameSystem._characterDescriptions) {
                initializeDescriptions();
            }

            const truncatedDescription = description.length > maxDescriptionLength
                ? description.substring(0, maxDescriptionLength) + "..."
                : description;

            $gameSystem._characterDescriptions[actor.actorId()] = truncatedDescription;
            if (window.ParchmentToast) {
              window.ParchmentToast.show(T("SceneStatus.descriptionSet", { name: actor.name() }), {
                severity: 'info'
              });
            }
        } else {
            if (window.ParchmentToast) {
              window.ParchmentToast.show(T("SceneStatus.invalidIndex"), {
                severity: 'warning'
              });
            }
        }
    });

    //=============================================================================
    // Eager i18n initialization
    //=============================================================================
    loadI18nData();

    //=============================================================================
    // Scene_Status Overrides & UI UI Spread Engine
    //=============================================================================

    const _Scene_Status_create = Scene_Status.prototype.create;
    Scene_Status.prototype.create = function () {
        _Scene_Status_create.call(this);

        // Hide standard canvas windows. Scene_Status builds four of them
        // (profile, status, params, equip) and this list used to name two that
        // MZ never creates, so three parchment windowskin panels were left
        // drawn over the black backdrop under the DOM spread.
        ["_profileWindow", "_statusWindow", "_statusParamsWindow",
            "_statusEquipWindow", "_cancelButton", "_pageupButton",
            "_pagedownButton"].forEach(key => {
                const win = this[key];
                if (!win) return;
                win.visible = false;
                if (win.deactivate) win.deactivate();
            });

        // Set actor index to active menu actor
        this._actorIndex = $gameParty.allMembers().indexOf(this.actor());
        if (this._actorIndex < 0) this._actorIndex = 0;

        // UI UI states
        this._dndActiveSection = "stats"; // "stats", "bodyparts"
        this._dndSelectedIndex = 0;
        this._dndLastLeftPageKey = "";
        this._dndActiveTab = rememberedStatusTab();

        this.createUIStatusOverlay();
        window.CharSwitcher.installTabKey(this, (dir) => {
            if (dir > 0) this.nextActor();
            else this.previousActor();
        });
    };

    Scene_Status.prototype.start = function () {
        Scene_MenuBase.prototype.start.call(this);
        this.refreshActor();
    };

    Scene_Status.prototype.refreshActor = function () {
        const actor = this.actor();
        ensureActorTraits(actor, this._actorIndex);
        this.refreshUIStatus();
    };

    Scene_Status.prototype.onActorChange = function () {
        Scene_MenuBase.prototype.onActorChange.call(this);
        this.refreshActor();
    };

    Scene_Status.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);
        this.updateUIStatusInput();
    };

    Scene_Status.prototype.nextActor = function () {
        this._actorIndex = (this._actorIndex + 1) % $gameParty.allMembers().length;
        this.refreshActor();
        SoundManager.playCursor();
    };

    Scene_Status.prototype.previousActor = function () {
        this._actorIndex = (this._actorIndex - 1 + $gameParty.allMembers().length) % $gameParty.allMembers().length;
        this.refreshActor();
        SoundManager.playCursor();
    };

    Scene_Status.prototype.actor = function () {
        return $gameParty.allMembers()[this._actorIndex];
    };

    const _Scene_Status_terminate = Scene_Status.prototype.terminate;
    Scene_Status.prototype.terminate = function () {
        _Scene_Status_terminate.call(this);
        this.cleanupStatus3D();
        window.CharSwitcher.removeTabKey(this);
        if (this._dndContainer) {
            const container = this._dndContainer;
            container.style.transition = "opacity 0.2s ease-out";
            container.style.opacity = "0";
            container.style.pointerEvents = "none";
            setTimeout(() => {
                if (container && container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }, 200);
            this._dndContainer = null;
        }
        // Cleanup styles to prevent bleed-through/shrinking of main menu spread
        const styleBlock = document.getElementById("status-styles");
        if (styleBlock) {
            styleBlock.remove();
        }
    };

    // --- Overlay & CSS Engine ---

    Scene_Status.prototype.createUIStatusOverlay = function () {
        // Inject Google Fonts


        // Inject custom stylesheet block
        // Create DOM wrapper
        this._dndContainer = document.createElement("div");
        this._dndContainer.id = "status-menu-container";
        this._dndContainer.style.opacity = "0";
        this._dndContainer.style.transition = "opacity 0.22s ease-out";
        document.body.appendChild(this._dndContainer);

        this.refreshUIStatus();

        setTimeout(() => {
            if (this._dndContainer) {
                this._dndContainer.style.opacity = "1";
            }
        }, 16);
    };

    Scene_Status.prototype.refreshUIStatus = function () {
        if (!this._dndContainer) return;

        const actor = this.actor();
        if (!actor) return;

        const backBtnText = T("SceneStatus.back");

        // Check if book spread framework is present; if not, build it once
        let spread = this._dndContainer.querySelector(".book-spread");
        if (!spread) {
            this._dndContainer.innerHTML = `
                <div class="book-spread">
                    <div class="left-page status-13">
                        <div class="page-header-bar status-10">
                            <div class="back-button focusable status-11" onclick="SceneManager._scene.popScene()">
                                ${backBtnText}
                            </div>
                            <h2 class="title status-12" id="status-actor-name"></h2>
                        </div>

                        <div class="status-left-body">
                        <div class="status-portrait-column">
                            <div class="status-bust-wrapper">
                                <canvas id="status-bust" width="440" height="500"></canvas>
                            </div>
                        </div>

                            <div class="status-vitals-box">
                            <div class="status-gauge-row">
                                <div class="status-gauge-meta">
                                    <span class="gauge-label">${T('SceneStatus.ui.hp')}</span>
                                    <span class="gauge-value" id="status-hp-text"></span>
                                </div>
                                <div class="status-gauge-bar-outer">
                                    <div class="status-gauge-bar-inner hp" id="status-hp-bar"></div>
                                </div>
                            </div>

                            <div class="status-gauge-row">
                                <div class="status-gauge-meta">
                                    <span class="gauge-label">${T('SceneStatus.ui.mp')}</span>
                                    <span class="gauge-value" id="status-mp-text"></span>
                                </div>
                                <div class="status-gauge-bar-outer">
                                    <div class="status-gauge-bar-inner mp" id="status-mp-bar"></div>
                                </div>
                            </div>

                            <!-- Action points are spent one at a time and never
                                 read as a share of anything, so the number is the
                                 whole reading and the track is gone. -->
                            <div class="status-gauge-row status-vital-plain">
                                <div class="status-gauge-meta">
                                    <span class="gauge-label">${T('SceneStatus.ui.ap')}</span>
                                    <span class="gauge-value" id="status-tp-text"></span>
                                </div>
                            </div>

                            <div class="status-gauge-row">
                                <div class="status-gauge-meta">
                                    <span class="gauge-label">${T('SceneStatus.ui.experience')}</span>
                                    <span class="gauge-value" id="status-exp-text"></span>
                                </div>
                                <div class="status-gauge-bar-outer">
                                    <div class="status-gauge-bar-inner exp" id="status-exp-bar"></div>
                                </div>
                            </div>
                            </div>

                        <div class="status-gauges-box">
                            <div class="status-needs-rows" id="status-needs"></div>
                        </div>
                        </div>
                    </div>
                    <div class="right-page">
                        <div class="status-right-header">
                            <div class="companion-switcher" id="status-companion-switcher"></div>
                        </div>

                        <div class="backpack-tabs status-tabs" id="status-tabs"></div>

                        <div id="status-lower-cards">
                            <div class="status-tab-panel" data-status-tab="bodyparts">
                                <div class="status-anatomy-panel">
                                    <div class="anatomy-grid" id="bodyparts-scroll-container"></div>
                                </div>
                            </div>

                            <div class="status-tab-panel" data-status-tab="passives">
                                <div class="bodyparts-card">
                                    <div class="card-label">${T('SceneStatus.ui.passiveAbilities')}</div>
                                    <div class="bodyparts-list" id="status-passives-list"></div>
                                </div>
                            </div>

                            <div class="status-tab-panel" data-status-tab="backstory">
                                <div class="bodyparts-card status-16">
                                    <div class="status-bio-scroll" id="status-backstory-scroll"></div>
                                </div>
                            </div>

                            <div class="status-tab-panel" data-status-tab="attributes">
                                <div id="status-attr-cards">
                                    <div class="stats-medallions-grid" id="status-medallions"></div>
                                    <div id="status-stat-breakdown"></div>
                                </div>

                                <div class="status-alignment-row">
                                    <div class="status-15" id="status-alignment-container"></div>
                                    <div class="status-15" id="status-magicsystem-container"></div>
                                </div>
                            </div>

                            <div class="status-tab-panel" data-status-tab="bio">
                                <div class="bodyparts-card status-16">
                                    <div class="status-bio-scroll" id="status-bio-scroll"></div>
                                </div>
                            </div>

                            <div class="status-tab-panel" data-status-tab="traits">
                                <div class="bodyparts-card">
                                    <div class="card-label">${T('SceneStatus.ui.characterTraits')}</div>
                                    <div class="status-traits-full" id="status-traits"></div>
                                </div>
                            </div>

                            <div class="status-tab-panel" data-status-tab="diseases">
                                <div class="bodyparts-card">
                                    <div class="card-label">${T('SceneStatus.ui.tabDiseases')}</div>
                                    <div class="bodyparts-list" id="status-diseases"></div>
                                </div>
                            </div>
                        </div>

                        <div class="status-actions" id="status-actions"></div>
                    </div>
                </div>
            `;
            spread = this._dndContainer.querySelector(".book-spread");
        }

        // 1. Companion navigation tabs HTML
        const allMembers = $gameParty.allMembers();
        let companionTabsHTML = "";
        allMembers.forEach((member, idx) => {
            const isSelected = member === actor ? "selected" : "";
            companionTabsHTML += `
                <div class="companion-tab ${isSelected}" onclick="SceneManager._scene.selectUIActor(${idx})">
                    ${member.name()}
                </div>
            `;
        });
        const tabsRow = spread.querySelector("#status-companion-switcher");
        if (tabsRow) {
            tabsRow.innerHTML = window.CharSwitcher.inner(
                `<div class="companion-tabs-row status-17">${companionTabsHTML}</div>`,
                allMembers.length
            );
        }

        // 1b. Right page section tabs, and the actions bar sitting under them.
        // Empathize is offered only while the panel plugin is loaded, since it
        // is what owns the character sheet the button opens.
        const tabsEl = spread.querySelector("#status-tabs");
        if (tabsEl) {
            tabsEl.innerHTML = STATUS_TABS.map(tab => `
                <div class="backpack-tab focusable${tab.id === this._dndActiveTab ? " active" : ""}"
                     data-status-tab-btn="${tab.id}"
                     onclick="SceneManager._scene.selectStatusTab('${tab.id}')">${T(tab.labelKey)}</div>
            `).join("");
        }
        this.applyStatusTab();

        const actionsEl = spread.querySelector("#status-actions");
        if (actionsEl) {
            actionsEl.innerHTML = (window.NPCEmpathize && window.NPCEmpathize.openForActor)
                ? `<div class="inspect-btn focusable" onclick="SceneManager._scene.openStatusEmpathize()">${T("SceneStatus.ui.empathize")}</div>`
                : "";
        }

        // 2. Left Page content updates
        const actorNameEl = spread.querySelector("#status-actor-name");
        if (actorNameEl) actorNameEl.textContent = T("SceneStatus.actorLine", { name: actor.name(), klass: actor.currentClass().name, level: actor.level });

        // Calculate EXP
        const currentExp = actor.currentExp() || 0;
        let expRate = 0;
        let expForThisLevel = 0;
        let expGainedThisLevel = 0;
        if (actor.isMaxLevel()) {
            expRate = 1;
        } else {
            const currentLevelExp = actor.currentLevelExp();
            const nextLevelExp = actor.nextLevelExp();
            expForThisLevel = nextLevelExp - currentLevelExp;
            expGainedThisLevel = currentExp - currentLevelExp;
            expRate = expForThisLevel > 0 ? (expGainedThisLevel / expForThisLevel) : 0;
        }

        // Update Left Page Gauges
        const hpTextEl = spread.querySelector("#status-hp-text");
        if (hpTextEl) hpTextEl.textContent = `${actor.hp} / ${actor.mhp}`;
        const hpBarEl = spread.querySelector("#status-hp-bar");
        if (hpBarEl) hpBarEl.style.width = `${actor.hpRate() * 100}%`;

        const mpTextEl = spread.querySelector("#status-mp-text");
        if (mpTextEl) mpTextEl.textContent = `${actor.mp} / ${actor.mmp}`;
        const mpBarEl = spread.querySelector("#status-mp-bar");
        if (mpBarEl) mpBarEl.style.width = `${actor.mpRate() * 100}%`;
        // Nothing to spend it on in a severed world: the whole row goes.
        if (hideMpBar()) {
            const row = (mpBarEl && mpBarEl.closest(".status-gauge-row")) ||
                        (mpTextEl && mpTextEl.closest(".status-gauge-row"));
            if (row) row.style.display = "none";
            else {
                if (mpTextEl) mpTextEl.style.display = "none";
                if (mpBarEl && mpBarEl.parentElement) mpBarEl.parentElement.style.display = "none";
            }
        }

        // Action points are written as a plain number: they are spent one at a
        // time, so how full the pool is says less than how many are in it.
        const tpTextEl = spread.querySelector("#status-tp-text");
        if (tpTextEl) tpTextEl.textContent = `${Math.ceil(actor.tp)} / ${actor.maxTp()}`;

        // The gauge counts the points earned inside the current level.
        const expTextEl = spread.querySelector("#status-exp-text");
        if (actor.isMaxLevel()) {
            if (expTextEl) expTextEl.textContent = T("SceneStatus.ui.expMax");
        } else {
            if (expTextEl) expTextEl.textContent = `${expGainedThisLevel} / ${expForThisLevel}`;
        }
        const expBarEl = spread.querySelector("#status-exp-bar");
        if (expBarEl) expBarEl.style.width = `${expRate * 100}%`;

        // Character Needs gauges (hunger / sleep / hygiene / social / leisure)
        // Sourced from TimeDateSystem. Each is guarded so the status screen still
        // works when that plugin is absent.
        const needsEl = spread.querySelector("#status-needs");
        if (needsEl) {
            const needDefs = [
                { label: T("SceneStatus.need.hunger"), cls: "hunger", fn: "hungerPercent" },
                { label: T("SceneStatus.need.sleep"), cls: "sleep", fn: "sleepPercent" },
                { label: T("SceneStatus.need.hygiene"), cls: "hygiene", fn: "hygienePercent" },
                { label: T("SceneStatus.need.social"), cls: "social", fn: "socialPercent" },
                { label: T("SceneStatus.need.leisure"), cls: "leisure", fn: "leisurePercent" },
                { label: T("SceneStatus.need.bladder"), cls: "bladder", fn: "bladderPercent" }
            ];

            // Uniform needs palette: gold when healthy, orange when low, red
            // when critical. Inline color overrides the per-class gradient so
            // every needs bar reads on the same scale.

            let needsHTML = "";
            needDefs.forEach(need => {
                if (typeof actor[need.fn] !== "function") return;
                // Hunger is the one meter that reads past full: a big meal
                // carries into the overeating range and the number says so,
                // amber over 100% and red at the line the state is applied on
                // (window.NeedGauge.hungerBand). The bar itself still stops at
                // its own width; it is the colour that carries the surplus.
                const over = need.cls === "hunger";
                const raw = Math.max(0, Math.round(actor[need.fn]()));
                const pct = over ? raw : Math.min(100, raw);
                const band = over ? window.NeedGauge.hungerBand(pct) : window.NeedGauge.band(pct);
                const width = Math.max(0, Math.min(100, pct));
                needsHTML += `
                    <div class="status-gauge-row">
                        <div class="status-gauge-meta">
                            <span class="gauge-label">${need.label}</span>
                            <span class="gauge-value gauge-ink ${band}">${pct}%</span>
                        </div>
                        <div class="status-gauge-bar-outer">
                            <div class="status-gauge-bar-inner gauge-fill ${need.cls} ${band}" style="width:${width}%"></div>
                        </div>
                    </div>
                `;
            });

            // Addiction cravings hang off the same list, read the other way
            // round: the bar fills as the craving grows, so a full one is this
            // character in withdrawal. A character with no addiction trait has
            // no meter and adds no row.
            const addictions = window.AddictionSystem;
            if (addictions) {
                addictions.cravingsFor(actor).forEach(craving => {
                    const pct = Math.max(0, Math.min(100, Math.round(craving.value)));
                    const band = window.NeedGauge.cravingBand(pct);
                    needsHTML += `
                    <div class="status-gauge-row">
                        <div class="status-gauge-meta">
                            <span class="gauge-label">${craving.label}</span>
                            <span class="gauge-value gauge-ink ${band}">${pct}%</span>
                        </div>
                        <div class="status-gauge-bar-outer">
                            <div class="status-gauge-bar-inner gauge-fill ${band}" style="width:${pct}%"></div>
                        </div>
                    </div>
                `;
                });
            }

            needsEl.innerHTML = needsHTML;
        }

        // 3. Right Page Content updates
        const params = [
            { name: _si18n("ATT", "STR"), val: actor.param(2), id: 2 },
            { name: _si18n("DEF", "CON"), val: actor.param(3), id: 3 },
            { name: _si18n("AGILITY", "DEX"), val: actor.param(6), id: 6 },
            { name: _si18n("M.ATT", "INT"), val: actor.param(4), id: 4 },
            { name: _si18n("M.DEF", "WIS"), val: actor.param(5), id: 5 },
            { name: _si18n("LUCK", "PSI"), val: actor.param(7), id: 7 }
        ];

        const getModText = (val) => {
            const m = Math.floor((val - 10) / 2);
            return m >= 0 ? "+" + m : String(m);
        };

        let paramsGridHTML = "";
        params.forEach(p => {
            const mod = getModText(p.val);
            const modifier = (actor._statModifiers && actor._statModifiers[p.id]) || 0;
            let displayValHTML = `<span class="stat-number">${p.val}</span>`;
            if (modifier !== 0) {
                const origVal = p.val - modifier;
                displayValHTML = `
                    <span class="stat-number debuffed status-18">${origVal}</span>
                    <span class="stat-number">${p.val}</span>
                `;
            }

            const spent = window.StatPoints.spentOn(actor, p.id);
            const spentHTML = spent > 0
                ? `<div class="stat-medallion-spent">+${spent}</div>`
                : "";
            const canRaise = window.StatPoints.canSpend(actor, p.id);
            const raiseHTML = canRaise
                ? `<div class="stat-medallion-raise focusable" title="${escapeAttr(T('SceneStatus.ui.raiseAttribute'))}" onclick="SceneManager._scene.spendStatPoint(${p.id})">+</div>`
                : "";
            // The mouse has the + itself; a keyboard and a pad walk the raisable
            // stats with Y and spend into the lit one with X (see
            // updateUIStatusInput). Without this the + was the one control on
            // the sheet that only a mouse could ever press.
            const litRaise = canRaise && p.id === this.raiseCursorParam();

            paramsGridHTML += `
                <div class="stat-medallion${litRaise ? ' raise-lit' : ''}">
                    <div class="stat-medallion-lbl">${p.name}</div>
                    <div class="stat-medallion-row">
                        <div class="stat-medallion-val">${displayValHTML}</div>
                        <div class="stat-medallion-mod">(${mod})</div>
                        ${raiseHTML}
                    </div>
                    ${spentHTML}
                </div>
            `;
        });

        // The unspent pool, announced above the medallions so the points are
        // not missed while the sheet is on another tab.
        const pointsLeft = window.StatPoints.available(actor);
        const pointsHTML = pointsLeft > 0
            ? `<div class="stat-points-banner">${T('SceneStatus.ui.attributePoints', { points: pointsLeft })}</div>`
            : "";

        const medallionsEl = spread.querySelector("#status-medallions");
        if (medallionsEl) medallionsEl.innerHTML = pointsHTML + paramsGridHTML;

        const breakdownEl = spread.querySelector("#status-stat-breakdown");
        if (breakdownEl) breakdownEl.innerHTML = buildStatBreakdownHTML(actor);

        const bioEl = spread.querySelector("#status-bio-scroll");
        if (bioEl) bioEl.innerHTML = buildBioPageHTML(actor, "bio");

        const backstoryEl = spread.querySelector("#status-backstory-scroll");
        if (backstoryEl) backstoryEl.innerHTML = buildBioPageHTML(actor, "backstory");

        // Alignment Element
        let elementHTML = "";
        const actorClass = actor.currentClass();
        if (actorClass && actorClass.note) {
            const elemMatch = actorClass.note.match(/<elem:\s*(\d+)>/);
            if (elemMatch) {
                const elementId = parseInt(elemMatch[1]);
                if (elementId > 0 && elementId < $dataSystem.elements.length) {
                    const elementName = $dataSystem.elements[elementId];
                    const elementIcons = [0, 96, 64, 65, 66, 67, 68, 69, 70, 71];
                    const elementIcon = elementIcons[elementId] || 0;
                    const x = (elementIcon % 16) * 32;
                    const y = Math.floor(elementIcon / 16) * 32;

                    elementHTML = `
                        <div class="status-element-box">
                            <span class="element-title">${T('SceneStatus.ui.alignment')}</span>
                            <span class="element-badge">
                                <span class="icon status-19" style="background:url('img/system/IconSet.png') -${x}px -${y}px no-repeat"></span>
                                <span class="status-20">${elementName}</span>
                            </span>
                        </div>
                    `;
                }
            }
        }
        const alignmentContainer = spread.querySelector("#status-alignment-container");
        if (alignmentContainer) alignmentContainer.innerHTML = elementHTML;

        // Magic System badge (gen_class_magic_system_tags.js): only a
        // magical class carries the tag at all, so a mundane profession's
        // row simply stays empty rather than printing "None".
        let magicSystemHTML = "";
        if (actorClass && actorClass.note) {
            const magicMatch = actorClass.note.match(/<MagicalSystem:\s*([^>]+)>/i);
            if (magicMatch) {
                const systemKey = magicMatch[1].trim();
                const systemName = T('SkillsMenu.magicSystem.' + systemKey) || systemKey;
                magicSystemHTML = `
                    <div class="status-element-box">
                        <span class="element-title">${T('SceneStatus.ui.magicSystem')}</span>
                        <span class="element-badge">
                            <span class="status-20">${systemName}</span>
                        </span>
                    </div>
                `;
            }
        }
        const magicSystemContainer = spread.querySelector("#status-magicsystem-container");
        if (magicSystemContainer) magicSystemContainer.innerHTML = magicSystemHTML;

        // Traits, each one written out in full on its own tab: the page they
        // used to share was never tall enough for a dossier, so they were chips
        // that had to be hovered one at a time to say anything.
        const traitsEl = spread.querySelector("#status-traits");
        if (traitsEl) traitsEl.innerHTML = buildTraitsPageHTML(actor);

        // The illnesses page is Health_DiseaseSystem's own sheet, printed
        // verbatim, so the status screen and the Biologics tab can never
        // disagree about what somebody is carrying or what would treat it.
        const diseasesEl = spread.querySelector("#status-diseases");
        if (diseasesEl) {
            diseasesEl.innerHTML = window.DiseaseSystem && window.DiseaseSystem.panelHTML
                ? window.DiseaseSystem.panelHTML(actor)
                : `<div class="status-traits-empty">${T('SceneStatus.ui.noDiseaseData')}</div>`;
        }

        // Passive abilities: the class's signature passive plus every trait
        // passive this character carries, all of them always on.
        const passivesEl = spread.querySelector("#status-passives-list");
        if (passivesEl) passivesEl.innerHTML = buildPassivesHTML(actor);

        // Biological Body Parts List
        if (!actor._bodyParts && window.initializeBodyParts) {
            window.initializeBodyParts(actor);
        }
        const bodyParts = [];
        if (actor._bodyParts) {
            for (const key in actor._bodyParts) {
                // The key comes along: it is what says whether the part can be
                // cut off, and so which word goes over a ruined one.
                if (actor._bodyParts[key]) bodyParts.push(Object.assign({ key }, actor._bodyParts[key]));
            }
        }
        bodyParts.sort((a, b) => {
            const aD = (a.destroyed || a.currentHp <= 0) ? 0 : 1;
            const bD = (b.destroyed || b.currentHp <= 0) ? 0 : 1;
            return aD - bD;
        });

        let bodyPartsHTML = "";
        if (bodyParts.length === 0) {
            bodyPartsHTML = `<div class="status-25">${T('SceneStatus.ui.noVitals')}</div>`;
        } else {
            bodyParts.forEach((part, idx) => {
                // Broken, cut off or destroyed: one word, and which one is
                // the difficulty's and the part's business, not this screen's
                // (window.HealthCore.partStatusLabel).
                const HC = window.HealthCore;
                const statusText = HC && HC.partStatusLabel
                    ? HC.partStatusLabel(actor, part.key, part) : "";
                const isDestroyed = !!statusText || part.destroyed || part.currentHp <= 0;
                const hpRate = part.maxHp > 0 ? (part.currentHp / part.maxHp) : 0;
                const hpPercent = Math.round(hpRate * 100);
                const isSelected = (this._dndActiveSection === "bodyparts" && this._dndSelectedIndex === idx) ? "selected" : "";
                const strikeClass = isDestroyed ? "destroyed" : "";
                const hpText = isDestroyed
                    ? (statusText || T('HealthCore.statusBroken'))
                    : `${part.currentHp}/${part.maxHp}`;
                const barWidth = isDestroyed ? 0 : hpPercent;
                const partName = (typeof part.name === 'string' && part.name.includes('.') && window.getArchetypeText)
                    ? window.getArchetypeText(part.name)
                    : part.name;

                bodyPartsHTML += `
                    <div class="anatomy-cell ${isSelected} ${strikeClass}" onclick="SceneManager._scene.selectUIBodyPart(${idx})">
                        <div class="anatomy-cell-top">
                            <span class="bodypart-name">${partName}</span>
                            <span class="bodypart-hp-val">${hpText}</span>
                        </div>
                        <div class="status-gauge-bar-outer anatomy-cell-bar">
                            <div class="status-gauge-bar-inner bodypart-bar" style="width:${barWidth}%"></div>
                        </div>
                    </div>
                `;
            });
        }
        const bodyPartsEl = spread.querySelector("#bodyparts-scroll-container");
        if (bodyPartsEl) bodyPartsEl.innerHTML = bodyPartsHTML;

        // 4. Draw bust portrait canvas
        this.drawUIStatusBust(actor, "status-bust");

        // 5. Scroll selected body part into view if active
        if (this._dndActiveSection === "bodyparts") {
            const selectedPart = spread.querySelector(".anatomy-cell.selected");
            if (selectedPart) {
                selectedPart.scrollIntoView({ block: "nearest" });
            }
        }
    };

    //=============================================================================
    // Right-page tab controller. Only the active panel is in the layout, so a
    // section never has to share the page's height with the two it replaced.
    //=============================================================================

    Scene_Status.prototype.applyStatusTab = function () {
        if (!this._dndContainer) return;
        this._dndContainer.querySelectorAll(".status-tab-panel").forEach(panel => {
            panel.classList.toggle("active", panel.dataset.statusTab === this._dndActiveTab);
        });
        this._dndContainer.querySelectorAll("[data-status-tab-btn]").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.statusTabBtn === this._dndActiveTab);
        });
    };

    Scene_Status.prototype.selectStatusTab = function (tabId, silent) {
        if (!STATUS_TABS.some(tab => tab.id === tabId)) return;
        if (this._dndActiveTab === tabId) return;
        this._dndActiveTab = tabId;
        rememberStatusTab(tabId);
        if (!silent) SoundManager.playCursor();
        // Only the sections page changes. Every panel is filled on refresh and
        // then hidden, so showing another one is a class toggle: a full refresh
        // here would redraw the portrait page and tear the 3D model down with
        // it.
        this.applyStatusTab();
    };

    Scene_Status.prototype.cycleStatusTab = function (direction) {
        const index = STATUS_TABS.findIndex(tab => tab.id === this._dndActiveTab);
        const next = (index + direction + STATUS_TABS.length) % STATUS_TABS.length;
        this.selectStatusTab(STATUS_TABS[next].id);
    };

    // The full social sheet for this character, the same panel an NPC is read
    // in. Pushed, so Cancel there comes straight back to this screen.
    Scene_Status.prototype.openStatusEmpathize = function () {
        const actor = this.actor();
        if (!actor || !window.NPCEmpathize || !window.NPCEmpathize.openForActor) return;
        SoundManager.playOk();
        window.NPCEmpathize.openForActor(actor.actorId());
    };

    Scene_Status.prototype.drawUIStatusBust = function (actor, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Creature actors render a live procedural 3D model (reusing the Bestiary
        // viewport) in place of the flat 2D enemy battler, when the 3D battler
        // system is active and the chosen battler maps to a model.
        const info3D = this.getStatus3DInfo(actor);
        if (info3D) {
            canvas.style.display = 'none';
            this.syncStatus3D(info3D);
            return;
        }
        // Not a 3D creature: tear down any prior viewer and show the 2D portrait.
        this.cleanupStatus3D();
        canvas.style.display = '';

        const bustPath = getActorBustImagePath(actor);
        if (!bustPath) return;

        const bitmap = ImageManager.loadBitmap('', bustPath);
        const drawBust = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true;

            const shouldCrop = false;
            const sourceWidth = bitmap.width > 0 ? bitmap.width : 889;
            const sourceHeight = bitmap.height > 0 ? bitmap.height : 1200;

            let cropTop = 0;
            let cropLeft = 0;
            let croppedSourceWidth = sourceWidth;
            let croppedSourceHeight = sourceHeight;

            const aspectRatio = croppedSourceWidth / croppedSourceHeight;
            let drawWidth = canvas.width;
            let drawHeight = Math.round(canvas.width / aspectRatio);

            if (drawHeight > canvas.height) {
                drawHeight = canvas.height;
                drawWidth = Math.round(canvas.height * aspectRatio);
            }

            const drawX = Math.round((canvas.width - drawWidth) / 2);
            const drawY = Math.round((canvas.height - drawHeight) / 2);

            ctx.drawImage(bitmap.canvas, cropLeft, cropTop, croppedSourceWidth, croppedSourceHeight, drawX, drawY, drawWidth, drawHeight);
        };

        if (bitmap.isReady()) {
            drawBust();
        } else {
            bitmap.addLoadListener(drawBust);
        }
    };

    //=============================================================================
    // 3D portrait viewport for creature actors (ported from Bestiary.js).
    // Only used when the 3D battler system is active and the actor's chosen
    // battler image resolves to a procedural archetype.
    //=============================================================================

    // True when this actor is portrayed by a monster rather than by a person:
    // a creature built in the creature wizard, an enemy recruited through the
    // talk menu, a summon, or a protagonist in monster form. Their portrait is
    // the creature itself, never a bust or a walking sprite.
    //
    // Both tests are rewritten every time a slot is filled - the monster-form
    // switch (77/78/79) by every character-creation path, "sprite" by the three
    // monster paths alone - so a person built into a slot that once held a
    // creature is never mistaken for one. `_isCreatureActor` is deliberately NOT
    // consulted: nothing ever clears it, so it outlives the creature that set it.
    function isMonsterPortraitActor(actor) {
        if (!actor) return false;
        if (typeof actor.portraitMode === 'function' && actor.portraitMode() === 'sprite') return true;
        // A character whose class is one of the creature classes is a creature
        // whatever portrait style its slot happens to carry: a beast recruited
        // into the fourth seat never went through the wizard that writes the
        // "sprite" style, and was being drawn as whoever held the slot before.
        // window.NPCCreature owns that boundary; it is never re-derived here.
        if (window.NPCCreature && window.NPCCreature.isNonSentientActor &&
            window.NPCCreature.isNonSentientActor(actor)) return true;
        const slot = actor.actorId();
        return !!($gameSwitches && slot >= 1 && slot <= 3 && $gameSwitches.value(76 + slot));
    }

    Scene_Status.prototype.getStatus3DInfo = function (actor) {
        if (!actor) return null;
        if (!(typeof THREE !== 'undefined' && window.Battler3D && window.Battler3D.create && window.Battler3D.resolveKey)) return null;

        const battlerField = typeof actor.vnBattler === 'function' ? actor.vnBattler() : null;

        // A monster recruited through the talk system (and a creature whose
        // species was picked in the creature wizard) records the enemy it came
        // from, so its own bespoke model is built instead of the first enemy
        // that happens to share the same battler art. This is checked BEFORE the
        // portrait style: the recruit rewrote the slot's portrait, but a slot
        // filled before that record existed still carries the art style its
        // previous occupant chose, and the monster must not be drawn as them.
        // The record is ignored once the slot's portrait no longer matches it (a
        // later character rewrote the slot and never cleared the id).
        const recruitedId = actor._recruitedEnemyId;
        const recruited = recruitedId ? $dataEnemies[recruitedId] : null;
        if (recruited && battlerField && recruited.battlerName === battlerField) {
            const recruitKey = window.Battler3D.resolveKey(recruited);
            if (recruitKey) {
                // ...rebuilt with the look it was wearing in the fight it was
                // talked out of, so it is that individual and not another one
                // of its kind (window.Battler3D.withLook).
                return { kind: 'enemy', archKey: recruitKey, enemyId: recruited.id,
                         actorId: actor.actorId(), look: actor._recruitedLook || null };
            }
        }

        // Creature / monster form: the actor carries the battler image of the
        // species it was built from. That species is ALWAYS shown as its
        // procedural 3D model - the same model previewed when the battler was
        // picked - so the flat enemy image (and any bust left on the slot by a
        // previous occupant) never stands in for it. The 2D battler art is only
        // the fallback for a species no archetype resolves for.
        // The sculpture is asked for before the species image, because a
        // creature that carries one is portrayed by it even with no battler
        // recorded on the slot at all.
        if (isMonsterPortraitActor(actor)) {
            // A creature whose player picked 2D Bust on the creation Bio tab is
            // drawn by that bust. The wizard marks the pick on the creature
            // itself (_ccCreatureBust), so a slot's stale "bust" style left by
            // an earlier occupant never reads as one.
            const mode = typeof actor.portraitMode === 'function' ? actor.portraitMode() : 0;
            if (mode === 'bust' && actor._ccCreatureBust && actor.vnBust && actor.vnBust()) return null;
            // A creature the wizard built always carries its own sculpted body
            // (ensureCreatureModel stamps one the moment it becomes a creature),
            // parts, colours and proportions the player may have hand-edited in
            // the 3D Studio. That sculpture is what portrays it here, never the
            // bare species template - the stock archetype rebuild below is only
            // for a monster with no such record (a battle-recruited enemy that
            // never went through the wizard).
            if (window.CC3DModel && window.CC3DModel.isAvailable && window.CC3DModel.isAvailable()) {
                const creatureCfg = window.CC3DModel.getConfig(actor.actorId());
                if (creatureCfg) return { kind: 'custom', cfg: creatureCfg, actorId: actor.actorId() };
            }
            if (battlerField && typeof battlerField === 'string') {
                for (const enemy of $dataEnemies) {
                    if (!enemy || enemy.battlerName !== battlerField) continue;
                    const key = window.Battler3D.resolveKey(enemy);
                    if (key) return { kind: 'enemy', archKey: key, enemyId: enemy.id, actorId: actor.actorId() };
                }
            }
            return null;
        }

        // A dossier that shipped a 3D model of the person it describes (Em) is
        // portrayed by that model wherever her flat bust would have been drawn,
        // whatever portrait style the slot carries. A model that could not be
        // read is never asked for twice, so a missing file falls back to the
        // bust rather than to an empty frame.
        const presetModel = window.CharacterPresets && window.CharacterPresets.getActorPresetModel
            ? window.CharacterPresets.getActorPresetModel(actor) : null;
        if (presetModel && !glbPortraitFailed[presetModel]) {
            return { kind: 'glb', path: presetModel, actorId: actor.actorId(), colours: actorModelColours(actor) };
        }

        // Humanoids: the portrait style is an exclusive choice made at character
        // creation and stored on the actor - EITHER a drawn bust OR a 3D model.
        // "bust" renders flat art even when a stale 3D config is still around.
        // An unset value (characters made before the choice existed) keeps the
        // old behaviour of preferring the 3D model when one resolves.
        const portraitMode = typeof actor.portraitMode === 'function' ? actor.portraitMode() : 0;
        if (portraitMode === 'bust' || portraitMode === 'sprite') return null;
        // Humanoid actors with a saved character-creation 3D model config
        // render their customized procedural model instead of the flat bust.
        if (window.CC3DModel && window.CC3DModel.isAvailable && window.CC3DModel.isAvailable()) {
            const cfg = window.CC3DModel.getConfig(actor.actorId());
            if (cfg) return { kind: 'custom', cfg: cfg, actorId: actor.actorId() };
        }
        return null;
    };

    // Stable identity for a 3D portrait: rebuilding is only needed when the
    // subject actually changes (different creature, edited custom config).
    function status3DKey(info) {
        if (info.kind === 'glb') return 'glb:' + info.path;
        if (info.kind === 'custom') return 'custom:' + info.actorId + ':' + JSON.stringify(info.cfg);
        // The look roll is part of the identity: two recruits of the same
        // species are two different bodies, and moving between them has to
        // rebuild the model rather than reuse the one already standing.
        const look = info.look;
        return 'enemy:' + info.enemyId + (look ? ':' + look.seed + ':' + look.origin + ':' + look.index : '');
    }

    // Dossier GLB portraits. The file is parsed once and the scene it yields is
    // reused by every viewer that asks for it afterwards: only one portrait is
    // ever on screen at a time, and re-reading a multi-megabyte model each time
    // the status sheet opens would stall the menu. A failed load is remembered
    // too, so a missing file is not retried on every refresh.
    const glbPortraitCache = {};
    const glbPortraitFailed = {};

    // A character export (VRM through Blender) leaves metallicFactor unset, and
    // glTF reads an unset factor as 1: every surface becomes a mirror, and with
    // no environment to reflect a mirror is black except where the key light
    // glints off it, so the face only showed once turned side on. The same
    // export marks every material BLEND, which depth sorts skin and hair as
    // glass. A portrait is a painted figure: no metal, and cut-out alpha.
    // The same export ships 2048 pixel maps, six of them in Em.glb: well over a
    // hundred megabytes of video memory per context once mipmapped, which an
    // integrated GPU did not survive. A portrait never fills more than a
    // quarter of the screen, so every map is brought down to PORTRAIT_TEX_MAX.
    const PORTRAIT_TEX_MAX = 1024;

    function shrinkPortraitTexture(tex, done) {
        if (!tex || !tex.isTexture || done.has(tex)) return;
        done.add(tex);
        const img = tex.image;
        const w = img && (img.width || img.naturalWidth);
        const h = img && (img.height || img.naturalHeight);
        if (!w || !h || Math.max(w, h) <= PORTRAIT_TEX_MAX || typeof document === 'undefined') return;
        const k = PORTRAIT_TEX_MAX / Math.max(w, h);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * k));
        canvas.height = Math.max(1, Math.round(h * k));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        try { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); } catch (e) { return; }
        if (img.close) { try { img.close(); } catch (e) {} }
        tex.image = canvas;
        tex.needsUpdate = true;
    }

    // The export also writes KHR_materials_specular, which the loader can only
    // honour as MeshPhysicalMaterial: the heaviest shader three has, seventeen
    // times over. Its extras are invisible on a painted figure with no metal,
    // so every one becomes the standard material it extends.
    function plainPortraitMaterial(m) {
        if (!m || !m.isMeshPhysicalMaterial || typeof THREE === 'undefined' || !THREE.MeshStandardMaterial) return m;
        const std = new THREE.MeshStandardMaterial();
        std.copy(m);
        std.name = m.name;
        return std;
    }

    function dressPortraitMaterials(root) {
        const shrunk = new Set();
        root.traverse((obj) => {
            if (!obj.material) return;
            if (Array.isArray(obj.material)) obj.material = obj.material.map(plainPortraitMaterial);
            else obj.material = plainPortraitMaterial(obj.material);
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
                Object.keys(m).forEach((k) => shrinkPortraitTexture(m[k], shrunk));
                if ('metalness' in m) m.metalness = 0;
                if (m.transparent) {
                    m.transparent = false;
                    m.alphaTest = Math.max(m.alphaTest || 0, 0.5);
                    m.depthWrite = true;
                }
                m.needsUpdate = true;
            });
        });
        return root;
    }

    //=============================================================================
    // Dossier model colours: skin, hair, dress, belt, boots, underwear, glasses
    //=============================================================================
    // The export names every material after what it covers (_SKIN_, _HAIR_,
    // _CLOTH_), so that is what says which colour it wears. Shoes stay as they
    // are; the brows follow the hair. A tinted material is repainted in the
    // shader: the texture's own shading is kept as a brightness, measured
    // against the texture's average, and the chosen colour is laid over it, so
    // any colour reads as itself at mid-tone rather than multiplied darker.
    // Uniforms, not a rebuild: a picker dragged across the wheel repaints live.
    const MODEL_COLOUR_MATCH = {
        skin:    (n) => /_SKIN_/i.test(n),
        hair:    (n) => /_HAIR_/i.test(n) || /FaceBrow/i.test(n),
        belt:    (n) => /_CLOTH_02/i.test(n),
        boots:   (n) => /Shoes/i.test(n),
        glasses: (n) => /GlassesHiFrame/i.test(n),
        dress:   (n) => /_CLOTH/i.test(n)
    };

    // The body texture carries more than skin: the stockings down the legs and
    // under the feet, and the underwear across the hips, are painted on it.
    // They are told apart from skin by colour (skin is warm, they are grey to
    // black) and from each other by where they sit on the texture, so the
    // body takes three colours at once. Regions are texture fractions, top
    // left origin, as the export lays them out.
    const BODY_SPLIT_MATCH = (n) => /Body_\d+_SKIN/i.test(n);
    const BODY_SPLIT_GLSL = [
        'float splitHi = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));',
        'float splitLo = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));',
        'float splitCloth = (1.0 - smoothstep(0.04, 0.10, splitHi - splitLo)) * (1.0 - step(0.35, splitHi));',
        'float splitMid = step(0.24, vUv.x) * step(vUv.x, 0.76);',
        'float splitThong = step(abs(vUv.x - 0.5), 0.04) * step(0.47, vUv.y) * step(vUv.y, 0.66);',
        'float splitUnder = max(splitMid * step(0.47, vUv.y) * step(vUv.y, 0.585), splitThong);',
        'float splitBoots = max((1.0 - splitMid) * step(0.5, vUv.y), splitMid * step(0.585, vUv.y) * step(vUv.y, 0.80) * (1.0 - splitThong));',
        'splitUnder *= splitCloth; splitBoots *= splitCloth;'
    ].join('\n');

    // The same split on the CPU, for the reference brightness of each region.
    function bodySplitRegion(u, v, hi, lo) {
        const cloth = (hi - lo) < 0.07 && hi < 0.35;
        if (!cloth) return 'skin';
        const mid = u >= 0.24 && u <= 0.76;
        const thong = Math.abs(u - 0.5) <= 0.04 && v >= 0.47 && v <= 0.66;
        if ((mid && v >= 0.47 && v <= 0.585) || thong) return 'underwear';
        if ((!mid && v >= 0.5) || (mid && v >= 0.585 && v <= 0.80)) return 'boots';
        return 'skin';
    }

    function modelColourPart(name) {
        const n = String(name || '');
        return Object.keys(MODEL_COLOUR_MATCH).find((p) => MODEL_COLOUR_MATCH[p](n)) || null;
    }

    // Mean brightness of a map, in the space the shader reads it in. Opaque
    // texels only: the cut-out around a hair card is not part of the hair.
    // Mean brightness of the stockings and of the underwear on a body texture,
    // in linear space, each fitted on its own texels only.
    function textureSplitLuma(tex) {
        const out = { boots: 0.03, underwear: 0.03 };
        if (!tex || !tex.image) return out;
        tex.userData = tex.userData || {};
        if (tex.userData.splitLuma) return tex.userData.splitLuma;
        try {
            const S = 128;
            const canvas = document.createElement('canvas');
            canvas.width = S; canvas.height = S;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tex.image, 0, 0, S, S);
            const d = ctx.getImageData(0, 0, S, S).data;
            const srgb = THREE.sRGBEncoding !== undefined && tex.encoding === THREE.sRGBEncoding;
            const lin = (x) => srgb ? Math.pow(x / 255, 2.2) : x / 255;
            const sum = { boots: 0, underwear: 0 }, n = { boots: 0, underwear: 0 };
            for (let y = 0; y < S; y++) {
                for (let x = 0; x < S; x++) {
                    const i = (y * S + x) * 4;
                    if (d[i + 3] < 128) continue;
                    const r = lin(d[i]), g = lin(d[i + 1]), b = lin(d[i + 2]);
                    const part = bodySplitRegion((x + 0.5) / S, (y + 0.5) / S, Math.max(r, g, b), Math.min(r, g, b));
                    if (part === 'skin') continue;
                    sum[part] += 0.299 * r + 0.587 * g + 0.114 * b;
                    n[part]++;
                }
            }
            if (n.boots) out.boots = sum.boots / n.boots;
            if (n.underwear) out.underwear = sum.underwear / n.underwear;
        } catch (e) {}
        out.boots = Math.max(0.01, out.boots);
        out.underwear = Math.max(0.01, out.underwear);
        tex.userData.splitLuma = out;
        return out;
    }

    function textureMeanLuma(tex) {
        if (!tex || !tex.image) return 0.5;
        tex.userData = tex.userData || {};
        if (tex.userData.meanLuma) return tex.userData.meanLuma;
        let mean = 0.5;
        try {
            const S = 64;
            const canvas = document.createElement('canvas');
            canvas.width = S; canvas.height = S;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tex.image, 0, 0, S, S);
            const d = ctx.getImageData(0, 0, S, S).data;
            let sum = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 128) continue;
                sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
                n++;
            }
            if (n) mean = sum / n;
            if (THREE.sRGBEncoding !== undefined && tex.encoding === THREE.sRGBEncoding) mean = Math.pow(mean, 2.2);
        } catch (e) {}
        tex.userData.meanLuma = Math.max(0.02, mean);
        return tex.userData.meanLuma;
    }

    // Hooks the recolour into a material once. The program cache key is held
    // behind a property so a later shader patch (PSXShader sets its own key)
    // still compiles a tinted material apart from a plain one.
    // A split material (the body) also takes uBoots and uUnder, laid over
    // the stockings and the underwear only, while uTint keeps to the skin.
    function tintableMaterial(m, split) {
        if (m.userData.modelTint) return m.userData.modelTint;
        split = !!split && !!m.map;
        const refs = split ? textureSplitLuma(m.map) : null;
        const u = {
            uTint:     { value: new THREE.Color(1, 1, 1) },
            uTintOn:   { value: 0 },
            uTintRef:  { value: m.map ? textureMeanLuma(m.map) : 1 },
            uBoots:    { value: new THREE.Color(1, 1, 1) },
            uBootsOn:  { value: 0 },
            uBootsRef: { value: refs ? refs.boots : 1 },
            uUnder:    { value: new THREE.Color(1, 1, 1) },
            uUnderOn:  { value: 0 },
            uUnderRef: { value: refs ? refs.underwear : 1 }
        };
        m.userData.modelTint = u;
        m.userData.modelTintSplit = split;
        const body = split ? [
            '#include <map_fragment>',
            'if (uTintOn + uBootsOn + uUnderOn > 0.5) {',
            '  float tintL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
            BODY_SPLIT_GLSL,
            '  vec3 tinted = diffuseColor.rgb;',
            '  if (uTintOn > 0.5) tinted = mix(tinted, uTint * clamp(tintL / uTintRef, 0.0, 1.6), 1.0 - splitCloth);',
            '  if (uBootsOn > 0.5) tinted = mix(tinted, uBoots * clamp(tintL / uBootsRef, 0.0, 1.6), splitBoots);',
            '  if (uUnderOn > 0.5) tinted = mix(tinted, uUnder * clamp(tintL / uUnderRef, 0.0, 1.6), splitUnder);',
            '  diffuseColor.rgb = tinted;',
            '}'
        ] : [
            '#include <map_fragment>',
            'if (uTintOn > 0.5) {',
            '  float tintL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
            '  diffuseColor.rgb = uTint * clamp(tintL / uTintRef, 0.0, 1.6);',
            '}'
        ];
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = function (shader, renderer) {
            if (typeof prev === 'function') prev.call(this, shader, renderer);
            Object.assign(shader.uniforms, u);
            shader.fragmentShader = 'uniform vec3 uTint;\nuniform float uTintOn;\nuniform float uTintRef;\n' +
                'uniform vec3 uBoots;\nuniform float uBootsOn;\nuniform float uBootsRef;\n' +
                'uniform vec3 uUnder;\nuniform float uUnderOn;\nuniform float uUnderRef;\n' +
                shader.fragmentShader.replace('#include <map_fragment>', body.join('\n'));
        };
        let innerKey = m.customProgramCacheKey;
        Object.defineProperty(m, 'customProgramCacheKey', {
            configurable: true,
            get() { return () => 'modelTint|' + (typeof innerKey === 'function' ? innerKey.call(m) : ''); },
            set(fn) { innerKey = fn; }
        });
        m.needsUpdate = true;
        return u;
    }

    // Paints `colours` ({ skin, hair, dress, belt, boots, underwear, glasses },
    // "#rrggbb" or null) onto a dossier model. A null part goes back to the
    // colour it shipped with.
    function tintDossierModel(root, colours) {
        if (!root || typeof THREE === 'undefined') return;
        const c = colours || {};
        const paint = (on, col, hex) => { on.value = hex ? 1 : 0; if (hex) col.value.set(hex); };
        root.traverse((obj) => {
            if (!obj.material) return;
            (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => {
                const part = modelColourPart(m.name);
                if (!part) return;
                const split = BODY_SPLIT_MATCH(m.name);
                const hex = c[part];
                const any = hex || (split && (c.boots || c.underwear));
                if (!any && !m.userData.modelTint) return;
                const u = tintableMaterial(m, split);
                paint(u.uTintOn, u.uTint, hex);
                if (m.userData.modelTintSplit) {
                    paint(u.uBootsOn, u.uBoots, c.boots);
                    paint(u.uUnderOn, u.uUnder, c.underwear);
                }
            });
        });
    }

    function actorModelColours(actor) {
        return (actor && typeof actor.modelColours === 'function') ? actor.modelColours() : null;
    }

    //=============================================================================
    // Humanoid rig: a dossier model posed and animated
    //=============================================================================
    // The dossier export carries a full weighted VRM skeleton (J_Bip_*) but no
    // animation clips. HumanoidRig finds the bones by the part they play and
    // poses them procedurally. Every pose is written in MODEL axes, as if the
    // figure stood in its rest T-pose facing +Z with its left arm along +X:
    //   x  pitches: a spine leans forward, a hanging limb swings back,
    //      a limb held forward drops
    //   y  turns about the vertical: a T-pose arm swings forward or back
    //   z  rolls in the frontal plane: a T-pose arm is lowered or raised
    // Euler order XYZ, so z is applied first, then y, then x. Each rotation is
    // applied in its parent's frame, so a forearm bends with the upper arm it
    // hangs from, and nothing depends on the axes the exporter left on a bone.
    // Mixamo names are read too, so a later dossier exported that way rigs the
    // same.
    const RIG_SPINE = {
        hips:       ['J_Bip_C_Hips', 'mixamorigHips', 'Hips'],
        spine:      ['J_Bip_C_Spine', 'mixamorigSpine', 'Spine'],
        chest:      ['J_Bip_C_Chest', 'mixamorigSpine1', 'Chest'],
        upperChest: ['J_Bip_C_UpperChest', 'mixamorigSpine2', 'UpperChest'],
        neck:       ['J_Bip_C_Neck', 'mixamorigNeck', 'Neck'],
        head:       ['J_Bip_C_Head', 'mixamorigHead', 'Head']
    };
    const RIG_LIMBS = {
        Shoulder: ['Shoulder', 'Shoulder'], UpperArm: ['UpperArm', 'Arm'],
        LowerArm: ['LowerArm', 'ForeArm'],  Hand:     ['Hand', 'Hand'],
        UpperLeg: ['UpperLeg', 'UpLeg'],    LowerLeg: ['LowerLeg', 'Leg'],
        Foot:     ['Foot', 'Foot'],         Toe:      ['ToeBase', 'ToeBase']
    };
    const RIG_FINGERS = [['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Little', 'Pinky']];

    function rigBoneNames() {
        const roles = {};
        Object.keys(RIG_SPINE).forEach((role) => { roles[role] = RIG_SPINE[role]; });
        [['l', 'L', 'Left'], ['r', 'R', 'Right']].forEach(([s, vrm, mix]) => {
            Object.keys(RIG_LIMBS).forEach((part) => {
                const [v, m] = RIG_LIMBS[part];
                roles[s + part] = ['J_Bip_' + vrm + '_' + v, 'mixamorig' + mix + m, mix + m];
            });
            RIG_FINGERS.forEach(([v, m]) => {
                for (let k = 1; k <= 3; k++) {
                    roles[s + 'Finger' + v + k] = ['J_Bip_' + vrm + '_' + v + k, 'mixamorig' + mix + 'Hand' + m + k];
                }
            });
        });
        return roles;
    }
    const RIG_ROLES = rigBoneNames();

    // Every animation the rig answers to. Loops run until another is asked
    // for; one-shots play over whatever loop is running and end by themselves.
    const RIG_LOOPS = ['idle', 'walk', 'run', 'crouch', 'crouchWalk', 'jump', 'fall',
                       'swim', 'aim', 'sit', 'dance', 'death'];
    const RIG_ONESHOTS = { shoot: 0.22, melee: 0.5, hurt: 0.45, wave: 2.2, nod: 0.9, jumpLand: 0.3 };
    const RIG_UPPER = ['spine', 'chest', 'upperChest', 'neck', 'head',
                       'lShoulder', 'lUpperArm', 'lLowerArm', 'lHand',
                       'rShoulder', 'rUpperArm', 'rLowerArm', 'rHand'];

    const D2R = Math.PI / 180;
    const rigLerp = (a, b, t) => a + (b - a) * t;
    const rigClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // Pose helpers. A pose is { role: [x, y, z] } in degrees, plus `off` for
    // the hips' position in metres, model space.
    function rigAdd(pose, role, x, y, z) {
        const p = pose[role] || (pose[role] = [0, 0, 0]);
        p[0] += x || 0; p[1] += y || 0; p[2] += z || 0;
    }
    function rigFingers(pose, side, curl) {
        // Fingers lie along the T-pose arm, palm down: a curl rolls them toward
        // the palm, which is -z on the left hand and +z on the right.
        const sign = side === 'l' ? -1 : 1;
        RIG_FINGERS.forEach(([v]) => {
            rigAdd(pose, side + 'Finger' + v + '1', 0, 0, sign * curl * 0.8);
            rigAdd(pose, side + 'Finger' + v + '2', 0, 0, sign * curl);
            rigAdd(pose, side + 'Finger' + v + '3', 0, 0, sign * curl * 0.7);
        });
    }
    // Arms down at the sides from the T-pose, elbows soft, hands relaxed.
    function rigStand(pose, drop, elbow) {
        rigAdd(pose, 'lUpperArm', 0, 0, -drop);
        rigAdd(pose, 'rUpperArm', 0, 0, drop);
        rigAdd(pose, 'lLowerArm', 0, -elbow, 0);
        rigAdd(pose, 'rLowerArm', 0, elbow, 0);
        rigFingers(pose, 'l', 18);
        rigFingers(pose, 'r', 18);
    }

    // The loops. `t` is seconds since the loop began, `ph` the stride phase in
    // radians, `p` the state the caller passed in.
    const RIG_POSES = {
        idle(t) {
            const pose = { off: [0, 0, 0] };
            rigStand(pose, 74, 10);
            const breath = Math.sin(t * 1.7);
            rigAdd(pose, 'chest', 1.5 * breath, 0, 0);
            rigAdd(pose, 'upperChest', 1 * breath, 0, 0);
            rigAdd(pose, 'lShoulder', 0, 0, 1.2 * breath);
            rigAdd(pose, 'rShoulder', 0, 0, -1.2 * breath);
            rigAdd(pose, 'hips', 0, 0, 1.5 * Math.sin(t * 0.45));
            rigAdd(pose, 'spine', 0, 0, -1.5 * Math.sin(t * 0.45));
            // Glances about now and then, never a metronome.
            rigAdd(pose, 'head', 4 * Math.sin(t * 0.31), 12 * Math.sin(t * 0.23) * Math.sin(t * 0.11), 2 * Math.sin(t * 0.17));
            rigAdd(pose, 'lUpperArm', 2 * Math.sin(t * 0.6), 0, 2 * breath);
            rigAdd(pose, 'rUpperArm', 2 * Math.sin(t * 0.6 + 1), 0, -2 * breath);
            rigAdd(pose, 'lUpperLeg', 0, 0, -2);
            rigAdd(pose, 'rUpperLeg', 0, 0, 2);
            return pose;
        },
        // Walking and running are one gait: `run` is how far toward the run
        // it has gone (0 to 1), so speeding up blends rather than snaps.
        walk(t, ph, p) {
            const run = rigClamp(p.run || 0, 0, 1);
            const pose = { off: [0, 0, 0] };
            const s = Math.sin(ph), c = Math.cos(ph);
            rigStand(pose, rigLerp(74, 64, run), rigLerp(18, 85, run));
            const leg = rigLerp(26, 46, run), knee = rigLerp(38, 88, run), arm = rigLerp(18, 38, run);
            rigAdd(pose, 'lUpperLeg', -leg * s, 0, 0);
            rigAdd(pose, 'rUpperLeg', leg * s, 0, 0);
            rigAdd(pose, 'lLowerLeg', 6 + knee * Math.max(0, c), 0, 0);
            rigAdd(pose, 'rLowerLeg', 6 + knee * Math.max(0, -c), 0, 0);
            rigAdd(pose, 'lFoot', -8 * s - 6 * Math.max(0, c), 0, 0);
            rigAdd(pose, 'rFoot', 8 * s - 6 * Math.max(0, -c), 0, 0);
            rigAdd(pose, 'lUpperArm', arm * s, 0, 0);
            rigAdd(pose, 'rUpperArm', -arm * s, 0, 0);
            rigAdd(pose, 'hips', 0, 7 * s, 2 * c);
            rigAdd(pose, 'spine', rigLerp(3, 12, run), 0, 0);
            rigAdd(pose, 'chest', rigLerp(1, 5, run), -9 * s, -c);
            rigAdd(pose, 'head', -rigLerp(2, 10, run), 2 * s, 0);
            if (run > 0.5) { rigFingers(pose, 'l', 40 * run); rigFingers(pose, 'r', 40 * run); }
            // The pelvis is lowest as a foot lands and highest over the
            // planted leg.
            pose.off[1] = rigLerp(0.025, 0.06, run) * (Math.abs(c) - 0.6) - 0.03 * run;
            return pose;
        },
        run(t, ph, p) {
            return RIG_POSES.walk(t, ph, Object.assign({}, p, { run: 1 }));
        },
        crouch(t) {
            const pose = { off: [0, -0.34, 0] };
            rigStand(pose, 64, 50);
            rigAdd(pose, 'lUpperLeg', -72, 0, -6);
            rigAdd(pose, 'rUpperLeg', -72, 0, 6);
            rigAdd(pose, 'lLowerLeg', 112, 0, 0);
            rigAdd(pose, 'rLowerLeg', 112, 0, 0);
            rigAdd(pose, 'lFoot', -38, 0, 0);
            rigAdd(pose, 'rFoot', -38, 0, 0);
            rigAdd(pose, 'spine', 18 + Math.sin(t * 1.7), 0, 0);
            rigAdd(pose, 'chest', 6, 0, 0);
            rigAdd(pose, 'head', -18, 0, 0);
            rigAdd(pose, 'lUpperArm', -25, 0, 0);
            rigAdd(pose, 'rUpperArm', -25, 0, 0);
            return pose;
        },
        crouchWalk(t, ph) {
            const pose = RIG_POSES.crouch(t);
            const s = Math.sin(ph), c = Math.cos(ph);
            rigAdd(pose, 'lUpperLeg', -16 * s, 0, 0);
            rigAdd(pose, 'rUpperLeg', 16 * s, 0, 0);
            rigAdd(pose, 'lLowerLeg', 14 * Math.max(0, c), 0, 0);
            rigAdd(pose, 'rLowerLeg', 14 * Math.max(0, -c), 0, 0);
            rigAdd(pose, 'lUpperArm', 10 * s, 0, 0);
            rigAdd(pose, 'rUpperArm', -10 * s, 0, 0);
            rigAdd(pose, 'hips', 0, 5 * s, 0);
            pose.off[1] += 0.02 * (Math.abs(c) - 0.6);
            return pose;
        },
        jump() {
            const pose = { off: [0, 0.02, 0] };
            rigStand(pose, 38, 40);
            rigAdd(pose, 'lUpperArm', -30, 0, 0);
            rigAdd(pose, 'rUpperArm', -30, 0, 0);
            rigAdd(pose, 'lUpperLeg', -44, 0, 0);
            rigAdd(pose, 'rUpperLeg', -14, 0, 0);
            rigAdd(pose, 'lLowerLeg', 70, 0, 0);
            rigAdd(pose, 'rLowerLeg', 48, 0, 0);
            rigAdd(pose, 'spine', 6, 0, 0);
            rigAdd(pose, 'head', -8, 0, 0);
            return pose;
        },
        fall(t) {
            const pose = { off: [0, 0, 0] };
            const flail = Math.sin(t * 7);
            rigStand(pose, 22, 25);
            rigAdd(pose, 'lUpperArm', -10 + 6 * flail, 0, 4 * flail);
            rigAdd(pose, 'rUpperArm', -10 - 6 * flail, 0, 4 * flail);
            rigAdd(pose, 'lUpperLeg', -24, 0, -5);
            rigAdd(pose, 'rUpperLeg', 10, 0, 5);
            rigAdd(pose, 'lLowerLeg', 30, 0, 0);
            rigAdd(pose, 'rLowerLeg', 42, 0, 0);
            rigAdd(pose, 'spine', -6, 0, 0);
            rigAdd(pose, 'head', -10, 0, 0);
            rigFingers(pose, 'l', -6);
            rigFingers(pose, 'r', -6);
            return pose;
        },
        // Breaststroke arms over a flutter kick, the body laid along the water.
        swim(t, ph) {
            const pose = { off: [0, -0.55, -0.1] };
            const s = Math.sin(ph), c = Math.cos(ph);
            rigAdd(pose, 'hips', 72, 0, 0);
            rigAdd(pose, 'neck', -30, 0, 0);
            rigAdd(pose, 'head', -30, 0, 0);
            const reach = 0.5 + 0.5 * c;
            rigAdd(pose, 'lUpperArm', 0, rigLerp(-15, -80, reach), rigLerp(-30, 10, reach));
            rigAdd(pose, 'rUpperArm', 0, rigLerp(15, 80, reach), rigLerp(30, -10, reach));
            rigAdd(pose, 'lLowerArm', 0, rigLerp(-90, -10, reach), 0);
            rigAdd(pose, 'rLowerArm', 0, rigLerp(90, 10, reach), 0);
            const kick = Math.sin(ph * 3);
            rigAdd(pose, 'lUpperLeg', 14 * kick, 0, -4);
            rigAdd(pose, 'rUpperLeg', -14 * kick, 0, 4);
            rigAdd(pose, 'lLowerLeg', 10 + 10 * Math.max(0, kick), 0, 0);
            rigAdd(pose, 'rLowerLeg', 10 + 10 * Math.max(0, -kick), 0, 0);
            rigAdd(pose, 'lFoot', 40, 0, 0);
            rigAdd(pose, 'rFoot', 40, 0, 0);
            pose.off[1] += 0.02 * s;
            return pose;
        },
        // A two-handed hold, raised to the line of sight. `pitch` (radians,
        // up positive) tips the arms, chest and head toward it.
        aim(t, ph, p) {
            const pose = { off: [0, 0, 0] };
            const pitch = rigClamp((p.pitch || 0) / D2R, -70, 70);
            rigAdd(pose, 'rUpperArm', -pitch * 0.75, 82, 6);
            rigAdd(pose, 'rLowerArm', 0, 12, 0);
            rigAdd(pose, 'rHand', 0, 0, -8);
            rigAdd(pose, 'lUpperArm', -pitch * 0.75, -104, -10);
            rigAdd(pose, 'lLowerArm', 0, -48, 0);
            rigAdd(pose, 'lHand', 0, -10, 0);
            rigFingers(pose, 'r', 70);
            rigFingers(pose, 'l', 55);
            rigAdd(pose, 'chest', -pitch * 0.2 + 0.6 * Math.sin(t * 1.7), -6, 0);
            rigAdd(pose, 'upperChest', -pitch * 0.1, -6, 0);
            rigAdd(pose, 'neck', -pitch * 0.25, 6, 0);
            rigAdd(pose, 'head', -pitch * 0.35, 6, 2);
            return pose;
        },
        sit(t) {
            const pose = { off: [0, -0.43, -0.05] };
            rigStand(pose, 70, 55);
            rigAdd(pose, 'lUpperArm', -22, 0, 0);
            rigAdd(pose, 'rUpperArm', -22, 0, 0);
            rigAdd(pose, 'lUpperLeg', -88, 0, -4);
            rigAdd(pose, 'rUpperLeg', -88, 0, 4);
            rigAdd(pose, 'lLowerLeg', 88, 0, 0);
            rigAdd(pose, 'rLowerLeg', 88, 0, 0);
            rigAdd(pose, 'spine', 4 + Math.sin(t * 1.5), 0, 0);
            rigAdd(pose, 'head', 6 * Math.sin(t * 0.2), 10 * Math.sin(t * 0.13), 0);
            return pose;
        },
        dance(t) {
            const pose = { off: [0, 0, 0] };
            const beat = t * Math.PI * 2 * 1.05;
            const s = Math.sin(beat), b = Math.abs(Math.sin(beat));
            rigStand(pose, 40, 70);
            rigAdd(pose, 'lUpperArm', -20 + 25 * s, 0, -20 * b);
            rigAdd(pose, 'rUpperArm', -20 - 25 * s, 0, 20 * b);
            rigAdd(pose, 'hips', 0, 12 * s, 6 * s);
            rigAdd(pose, 'chest', 0, -14 * s, -6 * s);
            rigAdd(pose, 'head', 6 * b, 8 * s, 0);
            rigAdd(pose, 'lUpperLeg', -10 * b, 0, 0);
            rigAdd(pose, 'lLowerLeg', 18 * b, 0, 0);
            rigAdd(pose, 'rUpperLeg', -10 * (1 - b), 0, 0);
            rigAdd(pose, 'rLowerLeg', 18 * (1 - b), 0, 0);
            pose.off[1] = -0.04 * b;
            return pose;
        },
        // Falls back and lies on the ground.
        death() {
            const pose = { off: [0, -0.82, -0.25] };
            rigAdd(pose, 'hips', -86, 0, 4);
            rigAdd(pose, 'spine', -4, 0, 0);
            rigAdd(pose, 'head', 0, 25, 0);
            rigAdd(pose, 'lUpperArm', 0, 0, -48);
            rigAdd(pose, 'rUpperArm', 0, 0, 32);
            rigAdd(pose, 'lLowerArm', 0, -20, 0);
            rigAdd(pose, 'rLowerArm', 0, 35, 0);
            rigAdd(pose, 'lUpperLeg', -8, 0, -10);
            rigAdd(pose, 'rUpperLeg', -22, 0, 6);
            rigAdd(pose, 'rLowerLeg', 30, 0, 0);
            rigAdd(pose, 'lFoot', 30, 0, 0);
            rigAdd(pose, 'rFoot', 30, 0, 0);
            rigFingers(pose, 'l', 30);
            rigFingers(pose, 'r', 30);
            return pose;
        }
    };

    // The one-shots, added over the running loop. `k` runs 0 to 1 across the
    // shot; each returns what it adds.
    const RIG_LAYERS = {
        // Recoil: the muzzle kicks up and the shoulders take it.
        shoot(k) {
            const pose = { off: [0, 0, -0.01 * (1 - k)] };
            const kick = Math.exp(-k * 6) * (k < 0.08 ? k / 0.08 : 1);
            rigAdd(pose, 'rUpperArm', -9 * kick, 0, 0);
            rigAdd(pose, 'lUpperArm', -7 * kick, 0, 0);
            rigAdd(pose, 'rLowerArm', 0, 8 * kick, 0);
            rigAdd(pose, 'chest', -3 * kick, 0, 0);
            rigAdd(pose, 'head', -2 * kick, 0, 0);
            return pose;
        },
        // Wind up over the right shoulder, then cut down and across.
        melee(k) {
            const pose = { off: [0, 0, 0] };
            const up = k < 0.35 ? k / 0.35 : 1;
            const cut = k < 0.35 ? 0 : Math.min(1, (k - 0.35) / 0.3);
            const back = k > 0.75 ? (k - 0.75) / 0.25 : 0;
            const w = 1 - back;
            rigAdd(pose, 'rUpperArm', w * rigLerp(-120 * up, 30, cut), w * rigLerp(0, 30, cut), w * -20 * up);
            rigAdd(pose, 'rLowerArm', 0, w * rigLerp(60 * up, 10, cut), 0);
            rigAdd(pose, 'chest', w * rigLerp(-6 * up, 10, cut), w * rigLerp(-28 * up, 32, cut), 0);
            rigAdd(pose, 'hips', 0, w * rigLerp(-8 * up, 10, cut), 0);
            rigFingers(pose, 'r', 60 * w);
            return pose;
        },
        // A flinch: the head snaps back and the arms come up.
        hurt(k) {
            const pose = { off: [0, -0.04 * Math.sin(k * Math.PI), 0] };
            const f = Math.sin(Math.min(1, k * 2.5) * Math.PI / 2) * (1 - k);
            rigAdd(pose, 'spine', -12 * f, 0, 4 * f);
            rigAdd(pose, 'chest', -8 * f, 6 * f, 0);
            rigAdd(pose, 'head', -16 * f, -8 * f, 6 * f);
            rigAdd(pose, 'lUpperArm', -30 * f, 0, 20 * f);
            rigAdd(pose, 'rUpperArm', -30 * f, 0, -20 * f);
            return pose;
        },
        // A raised right hand, waving from the elbow.
        wave(k, t) {
            const pose = { off: [0, 0, 0] };
            const w = Math.sin(Math.min(1, k * 6) * Math.PI / 2) * Math.min(1, (1 - k) * 6);
            rigAdd(pose, 'rUpperArm', 0, 20 * w, -128 * w);
            rigAdd(pose, 'rLowerArm', 0, 0, w * (-55 + 28 * Math.sin(t * 11)));
            rigAdd(pose, 'head', -4 * w, 10 * w, -4 * w);
            rigFingers(pose, 'r', -16 * w);
            return pose;
        },
        nod(k) {
            const pose = { off: [0, 0, 0] };
            rigAdd(pose, 'head', 14 * Math.sin(k * Math.PI * 2) * (1 - k), 0, 0);
            rigAdd(pose, 'neck', 6 * Math.sin(k * Math.PI * 2) * (1 - k), 0, 0);
            return pose;
        },
        // Knees give on landing.
        jumpLand(k) {
            const d = Math.sin(k * Math.PI);
            const pose = { off: [0, -0.1 * d, 0] };
            rigAdd(pose, 'lUpperLeg', -26 * d, 0, 0);
            rigAdd(pose, 'rUpperLeg', -26 * d, 0, 0);
            rigAdd(pose, 'lLowerLeg', 48 * d, 0, 0);
            rigAdd(pose, 'rLowerLeg', 48 * d, 0, 0);
            rigAdd(pose, 'lFoot', -22 * d, 0, 0);
            rigAdd(pose, 'rFoot', -22 * d, 0, 0);
            rigAdd(pose, 'spine', 10 * d, 0, 0);
            return pose;
        }
    };

    // Which loop the state of a body on the move asks for.
    function rigLoopFor(state) {
        if (state.dead) return 'death';
        if (state.sit) return 'sit';
        if (state.swim) return 'swim';
        if (state.grounded === false) return (state.vy || 0) > 0.5 ? 'jump' : 'fall';
        const moving = (state.speed || 0) > 0.25;
        if (state.crouch) return moving ? 'crouchWalk' : 'crouch';
        return moving ? 'walk' : 'idle';
    }

    //=============================================================================
    // Secondary motion: hair and skirt
    //=============================================================================
    // Hair hangs on the VRM spring-bone chains (J_Sec_*, rooted on the head):
    // each joint's tail is a verlet point pulled back toward the rest shape,
    // dragged, weighed down a little and kept out of the head and chest. A
    // skirt with no chains of its own is skinned whole to a loose bone (Em's
    // hem hangs on `neutral_bone`, outside the skeleton, so it never followed
    // her hips at all): that bone is carried by the hips and swung as one
    // pendulum from the waist. Everything is simulated in WORLD space, so
    // walking, turning and the turntable all set it moving.
    const RIG_SPRING = { stiffness: 1.1, drag: 0.32, gravity: 0.12, hitRadius: 0.02 };
    const RIG_HEM = { length: 0.28, stiffness: 18, drag: 0.22, gravity: 0.6, maxAngle: 12 };
    const RIG_HEM_BONES = ['neutral_bone'];
    // Spheres the hair is kept out of: [role, offset in model metres, radius].
    const RIG_COLLIDERS = [['head', [0, 0.08, 0.01], 0.095], ['neck', [0, 0.02, 0], 0.06],
                           ['upperChest', [0, 0.06, -0.01], 0.11]];
    const RIG_STEP = 1 / 60;

    function RigPhysics(root, byName, entries) {
        this.root = root;
        this.springs = [];
        this.colliders = [];
        this.hem = null;
        this.ready = false;
        this._m = new THREE.Matrix4();
        this._m2 = new THREE.Matrix4();
        this._p = new THREE.Vector3();
        this._q = new THREE.Quaternion();
        this._q2 = new THREE.Quaternion();
        this._s = new THREE.Vector3();
        this._a = new THREE.Vector3();
        this._b = new THREE.Vector3();
        this._c = new THREE.Vector3();
        this._e = new THREE.Vector3();
        this._lastRoot = new THREE.Vector3();

        // Chains, root to tip: a J_Sec_ bone whose parent is not one.
        const isSec = (o) => !!(o && o.name && o.name.indexOf('J_Sec_') === 0);
        Object.keys(byName).forEach((name) => {
            const bone = byName[name];
            if (!isSec(bone) || isSec(bone.parent) || /_end$/.test(name)) return;
            let b = bone;
            while (b && b.children.length) {
                const tail = b.children.find((c) => isSec(c)) || b.children[0];
                if (!tail.position.lengthSq()) break;
                this.springs.push({
                    bone: b, child: tail, restQ: b.quaternion.clone(),
                    axis: tail.position.clone().normalize(),
                    length: 0, tail: new THREE.Vector3(), prev: new THREE.Vector3()
                });
                b = isSec(tail) && !/_end$/.test(tail.name) ? tail : null;
            }
        });

        RIG_COLLIDERS.forEach(([role, off, r]) => {
            if (entries[role]) this.colliders.push({ bone: entries[role].bone, off, r, local: new THREE.Vector3(), c: new THREE.Vector3() });
        });

        // The hem bone: skinned, but not carried by the hips.
        const hips = entries.hips && entries.hips.bone;
        const hemBone = hips && RIG_HEM_BONES.map((n) => byName[n]).find(Boolean);
        if (hemBone) {
            let under = false;
            for (let o = hemBone.parent; o; o = o.parent) if (o === hips) under = true;
            if (!under) {
                root.updateMatrixWorld(true);
                const hipsInv = hips.matrixWorld.clone().invert();
                const restHipsQ = hips.getWorldQuaternion(new THREE.Quaternion());
                const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
                this.hem = {
                    bone: hemBone, hips,
                    restP: hemBone.position.clone(), restQ: hemBone.quaternion.clone(), restS: hemBone.scale.clone(),
                    // The hem in the hips' own frame, as it was exported.
                    offset: hipsInv.multiply(hemBone.matrixWorld),
                    // Straight down the model, in the hips' frame.
                    down: new THREE.Vector3(0, -1, 0).applyQuaternion(rootQ).applyQuaternion(restHipsQ.invert()).normalize(),
                    tail: new THREE.Vector3(), prev: new THREE.Vector3(), downW: new THREE.Vector3(),
                    pivot: new THREE.Vector3()
                };
            }
        }
    }

    RigPhysics.prototype.active = function () {
        return this.springs.length > 0 || !!this.hem;
    };

    // World units per model metre.
    RigPhysics.prototype.scale = function () {
        this.root.matrixWorld.decompose(this._p, this._q, this._s);
        return this._s.x || 1;
    };

    // Lays every tail at rest where the pose puts it now: on the first step,
    // and whenever the figure jumped rather than moved.
    RigPhysics.prototype.settle = function () {
        const s = this.scale();
        this.springs.forEach((sp) => {
            sp.bone.quaternion.copy(sp.restQ);
            sp.bone.updateMatrixWorld(true);
            sp.bone.getWorldPosition(this._a);
            sp.child.getWorldPosition(sp.tail);
            sp.length = this._a.distanceTo(sp.tail) || 0.01 * s;
            sp.prev.copy(sp.tail);
        });
        this.colliders.forEach((c) => {
            c.bone.getWorldPosition(this._a);
            this.root.matrixWorld.decompose(this._p, this._q, this._s);
            this._b.set(c.off[0], c.off[1], c.off[2]).multiplyScalar(s).applyQuaternion(this._q).add(this._a);
            c.local.copy(c.bone.worldToLocal(this._b));
        });
        if (this.hem) {
            const h = this.hem;
            h.hips.getWorldPosition(this._a);
            h.hips.getWorldQuaternion(this._q);
            h.downW.copy(h.down).applyQuaternion(this._q);
            h.tail.copy(h.downW).multiplyScalar(RIG_HEM.length * s).add(this._a);
            h.prev.copy(h.tail);
            h.pivot.copy(this._a);
        }
        this.root.getWorldPosition(this._lastRoot);
        this.ready = true;
    };

    RigPhysics.prototype.reset = function () {
        this.ready = false;
        this.springs.forEach((sp) => sp.bone.quaternion.copy(sp.restQ));
        const h = this.hem;
        if (h) { h.bone.position.copy(h.restP); h.bone.quaternion.copy(h.restQ); h.bone.scale.copy(h.restS); }
    };

    // Advances the simulation by dt seconds over the pose just applied.
    RigPhysics.prototype.update = function (dt) {
        if (!this.active() || !(dt > 0)) return;
        // Brought back to rest before the steps, so the colliders and chain
        // roots read the pose this frame put the body in.
        this.springs.forEach((sp) => sp.bone.quaternion.copy(sp.restQ));
        this.root.updateWorldMatrix(true, true);
        const s = this.scale();
        this.root.getWorldPosition(this._c);
        if (!this.ready || this._c.distanceTo(this._lastRoot) > 1.5 * s) this.settle();
        this._lastRoot.copy(this._c);
        this.colliders.forEach((c) => c.c.copy(c.local).applyMatrix4(c.bone.matrixWorld));
        const n = Math.min(6, Math.max(1, Math.round(dt / RIG_STEP)));
        for (let i = 0; i < n; i++) {
            this.stepSprings(dt / n, s);
            this.stepHem(dt / n, s);
        }
    };

    RigPhysics.prototype.stepSprings = function (dt, s) {
        const P = RIG_SPRING;
        const pos = this._a, next = this._b, d = this._c;
        this.springs.forEach((sp) => {
            const bone = sp.bone;
            // The bone's frame as its parent holds it now, at rest.
            bone.parent.matrixWorld.decompose(this._p, this._q2, this._s);
            this._q.copy(this._q2).multiply(sp.restQ);
            bone.quaternion.copy(sp.restQ);
            bone.updateMatrix();
            bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix);
            pos.setFromMatrixPosition(bone.matrixWorld);

            next.copy(sp.tail).sub(sp.prev).multiplyScalar(1 - P.drag).add(sp.tail);
            next.addScaledVector(d.copy(sp.axis).applyQuaternion(this._q), P.stiffness * dt * s);
            next.y -= P.gravity * dt * s;
            next.sub(pos).setLength(sp.length).add(pos);
            this.colliders.forEach((c) => {
                const r = (c.r + P.hitRadius) * s;
                d.copy(next).sub(c.c);
                const len = d.length();
                if (len < r && len > 1e-6) next.copy(c.c).addScaledVector(d, r / len);
            });
            next.sub(pos).setLength(sp.length).add(pos);
            sp.prev.copy(sp.tail);
            sp.tail.copy(next);

            // Turned from the rest axis toward the tail, in the bone's frame.
            d.copy(next).sub(pos).applyQuaternion(this._q.invert()).normalize();
            this._q2.setFromUnitVectors(sp.axis, d);
            bone.quaternion.copy(sp.restQ).multiply(this._q2);
            bone.updateMatrix();
            bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix);
        });
    };

    RigPhysics.prototype.stepHem = function (dt, s) {
        const h = this.hem;
        if (!h) return;
        const P = RIG_HEM;
        const pivot = this._a, next = this._b, d = this._c;
        h.hips.matrixWorld.decompose(pivot, this._q, this._s);
        h.downW.copy(h.down).applyQuaternion(this._q);
        const L = P.length * s;
        // Pulled toward hanging straight below the waist, with a little weight.
        // Drag only damps what the hem does apart from the waist, so a steady
        // run sways it rather than holding it streamed out behind.
        const waist = this._e.copy(pivot).sub(h.pivot);
        next.copy(h.tail).sub(h.prev);
        next.addScaledVector(d.copy(waist).sub(next), P.drag);
        // The pull is measured against the waist where the hem last was, so
        // the waist's own travel (already in the velocity) is not added twice.
        d.copy(h.downW).multiplyScalar(L).add(h.pivot).sub(h.tail);
        next.addScaledVector(d, Math.min(1, P.stiffness * dt)).add(h.tail);
        h.pivot.copy(pivot);
        next.y -= P.gravity * dt * dt * s;
        d.copy(next).sub(pivot).normalize();
        // Never swung further out than a skirt would go.
        const max = P.maxAngle * D2R;
        const ang = Math.acos(rigClamp(d.dot(h.downW), -1, 1));
        if (ang > max) {
            this._q2.setFromUnitVectors(h.downW, d);
            this._q2.slerp(new THREE.Quaternion(), 1 - max / ang);
            d.copy(h.downW).applyQuaternion(this._q2);
        }
        next.copy(d).multiplyScalar(L).add(pivot);
        h.prev.copy(h.tail);
        h.tail.copy(next);

        // The hem where the hips carry it, then swung about the waist.
        this._q2.setFromUnitVectors(h.downW, d);
        const swing = this._m2.makeRotationFromQuaternion(this._q2);
        d.copy(pivot).applyQuaternion(this._q2);
        swing.setPosition(pivot.x - d.x, pivot.y - d.y, pivot.z - d.z);
        const m = this._m.multiplyMatrices(h.hips.matrixWorld, h.offset).premultiply(swing);
        const bone = h.bone;
        bone.matrixWorld.copy(m);
        const local = this._m2.copy(bone.parent.matrixWorld).invert().multiply(m);
        local.decompose(bone.position, bone.quaternion, bone.scale);
        bone.matrix.copy(local);
    };

    function HumanoidRig(root) {
        this.root = root;
        this.entries = {};
        this.loop = 'idle';
        this.loopTime = 0;
        this.time = 0;
        this.phase = 0;
        this.shots = [];
        this.cur = {};
        this.curOff = [0, 0, 0];
        this.aimWeight = 0;
        this.wasGrounded = true;
        this._q = new THREE.Quaternion();
        this._e = new THREE.Euler(0, 0, 0, 'XYZ');
        this._v = new THREE.Vector3();

        const byName = {};
        root.traverse((o) => { if (o.isBone && !byName[o.name]) byName[o.name] = o; });
        root.updateMatrixWorld(true);
        const rootQInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
        const rootScale = root.getWorldScale(new THREE.Vector3()).x || 1;
        Object.keys(RIG_ROLES).forEach((role) => {
            const name = RIG_ROLES[role].find((n) => byName[n]);
            if (!name) return;
            const bone = byName[name];
            const parent = bone.parent;
            const parentQ = parent
                ? rootQInv.clone().multiply(parent.getWorldQuaternion(new THREE.Quaternion()))
                : new THREE.Quaternion();
            const parentScale = parent ? (parent.getWorldScale(new THREE.Vector3()).x / rootScale) || 1 : 1;
            this.entries[role] = {
                bone,
                restQ: bone.quaternion.clone(),
                restP: bone.position.clone(),
                parentQ,
                parentQInv: parentQ.clone().invert(),
                parentScale
            };
        });
        // Hair and skirt, when the model has any to swing.
        const physics = new RigPhysics(root, byName, this.entries);
        this.physics = physics.active() ? physics : null;
    }

    // A figure the rig can do something with: hips, legs and arms found.
    HumanoidRig.prototype.isRigged = function () {
        return ['hips', 'lUpperArm', 'rUpperArm', 'lUpperLeg', 'rUpperLeg'].every((r) => this.entries[r]);
    };

    HumanoidRig.prototype.has = function (name) {
        return RIG_LOOPS.indexOf(name) >= 0 || Object.prototype.hasOwnProperty.call(RIG_ONESHOTS, name);
    };

    // Plays a named animation: a loop replaces the running one, a one-shot
    // plays over it.
    HumanoidRig.prototype.play = function (name) {
        if (Object.prototype.hasOwnProperty.call(RIG_ONESHOTS, name)) {
            // Shots retrigger rather than stack, so automatic fire keeps one
            // recoil going instead of piling them up.
            this.shots = this.shots.filter((s) => s.name !== name);
            this.shots.push({ name, t: 0, dur: RIG_ONESHOTS[name] });
            return true;
        }
        if (RIG_LOOPS.indexOf(name) < 0) return false;
        if (this.loop !== name) { this.loop = name; this.loopTime = 0; }
        this._forced = name;
        return true;
    };

    // Hands the loop back to the state passed to update().
    HumanoidRig.prototype.release = function () { this._forced = null; };

    // Advances the animation by dt seconds. `state` describes the body the
    // rig belongs to: { speed (m/s), grounded, vy, crouch, swim, sit, dead,
    // aim, pitch }. With no state the rig plays whatever loop was last asked
    // for, idle by default.
    HumanoidRig.prototype.update = function (dt, state) {
        dt = Math.min(Math.max(dt || 0, 0), 0.1);
        this.time += dt;
        this.loopTime += dt;
        const st = state || {};
        if (state && !this._forced) {
            const next = rigLoopFor(st);
            if (next !== this.loop) {
                if (next === 'idle' || next === 'walk' || next === 'crouch' || next === 'crouchWalk') {
                    if (this.loop === 'fall' || this.loop === 'jump') this.play('jumpLand');
                }
                if (!((this.loop === 'walk' && next === 'walk'))) this.loopTime = 0;
                this.loop = next;
            }
        }
        // A loop asked for by name, with no body to read, keeps its own pace.
        const LOOP_PACE = { walk: 1.5, run: 5.5, crouchWalk: 1.2, swim: 1.2 };
        const speed = state ? (st.speed || 0) : (LOOP_PACE[this.loop] || 0);
        const run = rigClamp((speed - 2.2) / 2.3, 0, 1);
        // One stride (two steps) per this many metres: longer when running.
        const stride = this.loop === 'swim' ? 2.2 : rigLerp(1.35, 2.6, run);
        this.phase = (this.phase + dt * Math.max(speed, this.loop === 'swim' ? 0.9 : 0) / stride * Math.PI * 2) % (Math.PI * 2);

        const p = { run, pitch: st.pitch || 0 };
        const target = RIG_POSES[this.loop](this.loopTime, this.phase, p);

        // The weapon hold is an upper-body layer, so the legs keep walking,
        // running or crouching under it.
        const wantAim = this.loop === 'aim' || (!!st.aim && this.loop !== 'death' && this.loop !== 'swim' && this.loop !== 'sit');
        this.aimWeight = rigClamp(this.aimWeight + (wantAim ? dt : -dt) * 7, 0, 1);
        if (this.aimWeight > 0 && this.loop !== 'aim') {
            const aim = RIG_POSES.aim(this.loopTime, this.phase, p);
            const w = this.aimWeight;
            RIG_UPPER.concat(Object.keys(aim).filter((r) => r.indexOf('Finger') > 0)).forEach((role) => {
                const a = target[role] || [0, 0, 0];
                const b = aim[role] || [0, 0, 0];
                // The spine keeps some of the gait so a run still reads as one.
                const k = (role === 'spine' || role === 'chest') ? w * 0.6 : w;
                target[role] = [rigLerp(a[0], b[0], k), rigLerp(a[1], b[1], k), rigLerp(a[2], b[2], k)];
            });
        }

        // Ease every channel toward the target: switching loops blends
        // instead of snapping. Dying takes its time.
        const ease = 1 - Math.exp(-dt * (this.loop === 'death' ? 4 : 14));
        const roles = new Set(Object.keys(this.cur).concat(Object.keys(target)));
        roles.delete('off');
        roles.forEach((role) => {
            const c = this.cur[role] || (this.cur[role] = [0, 0, 0]);
            const g = target[role] || [0, 0, 0];
            c[0] += (g[0] - c[0]) * ease; c[1] += (g[1] - c[1]) * ease; c[2] += (g[2] - c[2]) * ease;
        });
        const off = target.off || [0, 0, 0];
        for (let i = 0; i < 3; i++) this.curOff[i] += (off[i] - this.curOff[i]) * ease;

        // One-shots go over the eased pose, so a recoil is as sharp as it
        // should be.
        const pose = {};
        roles.forEach((role) => { pose[role] = this.cur[role].slice(); });
        const poseOff = this.curOff.slice();
        this.shots.forEach((s) => {
            s.t += dt;
            const layer = RIG_LAYERS[s.name](Math.min(1, s.t / s.dur), this.time);
            Object.keys(layer).forEach((role) => {
                if (role === 'off') { for (let i = 0; i < 3; i++) poseOff[i] += layer.off[i]; return; }
                rigAdd(pose, role, layer[role][0], layer[role][1], layer[role][2]);
            });
        });
        this.shots = this.shots.filter((s) => s.t < s.dur);
        this.apply(pose, poseOff);
        if (this.physics) this.physics.update(dt);
    };

    // Writes a pose onto the bones: each rotation is turned from model axes
    // into the bone's own frame through its parent's rest orientation.
    HumanoidRig.prototype.apply = function (pose, off) {
        const q = this._q, e = this._e;
        Object.keys(this.entries).forEach((role) => {
            const en = this.entries[role];
            const r = pose[role];
            if (!r) { en.bone.quaternion.copy(en.restQ); return; }
            e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, 'XYZ');
            q.setFromEuler(e);
            en.bone.quaternion.copy(en.parentQInv).multiply(q).multiply(en.parentQ).multiply(en.restQ);
        });
        const hips = this.entries.hips;
        if (hips) {
            const v = this._v.set(off[0], off[1], off[2]).applyQuaternion(hips.parentQInv).divideScalar(hips.parentScale);
            hips.bone.position.copy(hips.restP).add(v);
        }
    };

    // Back to the T-pose the file was exported in.
    HumanoidRig.prototype.reset = function () {
        Object.keys(this.entries).forEach((role) => {
            const en = this.entries[role];
            en.bone.quaternion.copy(en.restQ);
            en.bone.position.copy(en.restP);
        });
        this.cur = {};
        this.curOff = [0, 0, 0];
        this.shots = [];
        if (this.physics) this.physics.reset();
    };

    // The rig a model carries, built on first ask. Null for a model with no
    // humanoid skeleton.
    function humanoidRigFor(root) {
        if (!root || typeof THREE === 'undefined') return null;
        if (root.userData && root.userData.humanoidRig !== undefined) return root.userData.humanoidRig;
        let rig = new HumanoidRig(root);
        if (!rig.isRigged()) rig = null;
        root.userData = root.userData || {};
        root.userData.humanoidRig = rig;
        return rig;
    }

    // A dossier model of its own, never the cached portrait scene: a body
    // walking about in the world poses its bones every frame, and the status
    // sheet must not find it mid-stride. Parsed from the bytes the portrait
    // load already fetched when it can, so the file is read once.
    const glbFigureBytes = {};
    function loadFigureGLB(path) {
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !path) return Promise.resolve(null);
        if (glbPortraitFailed[path]) return Promise.resolve(null);
        if (!glbFigureBytes[path]) {
            glbFigureBytes[path] = new Promise((resolve) => {
                const loader = new THREE.FileLoader();
                loader.setResponseType('arraybuffer');
                loader.load(path, resolve, undefined, () => resolve(null));
            });
        }
        return glbFigureBytes[path].then((bytes) => new Promise((resolve) => {
            if (!bytes) { resolve(null); return; }
            try {
                new THREE.GLTFLoader().parse(bytes, '', (gltf) => {
                    if (!gltf || !gltf.scene) { resolve(null); return; }
                    const root = dressPortraitMaterials(gltf.scene);
                    resolve({ model: root, rig: humanoidRigFor(root) });
                }, () => resolve(null));
            } catch (e) { resolve(null); }
        }));
    }

    function loadPortraitGLB(path) {
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return Promise.resolve(null);
        if (!glbPortraitCache[path]) {
            glbPortraitCache[path] = new Promise((resolve) => {
                const fail = () => { glbPortraitFailed[path] = true; resolve(null); };
                try {
                    new THREE.GLTFLoader().load(path,
                        (gltf) => {
                            if (gltf && gltf.scene) resolve(dressPortraitMaterials(gltf.scene));
                            else fail();
                        },
                        undefined,
                        fail);
                } catch (e) { fail(); }
            });
        }
        // Dressed in what the viewers expect of a battler, framed like the bust
        // it stands in for. A rigged figure breathes and looks about in its
        // idle loop instead of holding the export's T-pose. currentAnimation
        // stays null, so the viewers never set it swinging an attack.
        return glbPortraitCache[path].then((scene) => {
            if (!scene) return null;
            const rig = humanoidRigFor(scene);
            return {
                model: scene,
                rig,
                portraitCrop: 0.5,
                currentAnimation: null,
                update(dt) { if (rig) rig.update(dt); },
                hasAnimation(name) { return !!(rig && rig.has(name)); },
                playAnimation(name) { if (rig) rig.play(name); }
            };
        });
    }

    // Where a portrait viewer puts the camera, and where the subject has to be
    // moved to sit centred in the frame. A creature is framed whole, on both
    // axes. A model standing in for a bust says so with `portraitCrop`, the
    // fraction of its height a portrait should show, and only that top slice is
    // fitted, and only vertically: the head and chest fill the frame the way the
    // bust art did, and arms held out to the sides fall outside it.
    // The box a skinned figure actually fills in its current pose. Box3 reads
    // the geometry as exported, which for a rigged dossier model is the
    // T-pose, arms out, so a figure framed off it stood far too small or
    // spilled out of the frame. Every few vertices are run through the skin.
    function posedBox(root) {
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        root.updateMatrixWorld(true);
        root.traverse((obj) => {
            if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes.position) return;
            if (!obj.visible) return;
            const pos = obj.geometry.attributes.position;
            const step = Math.max(1, Math.floor(pos.count / 1500));
            for (let i = 0; i < pos.count; i += step) {
                v.fromBufferAttribute(pos, i);
                if (obj.isSkinnedMesh && obj.boneTransform) obj.boneTransform(i, v);
                v.applyMatrix4(obj.matrixWorld);
                box.expandByPoint(v);
            }
        });
        return box;
    }

    function portraitFraming(battler, camera, margin) {
        // A dossier GLB is cached and shared, so it can still hang off the
        // offset holder of the viewer that showed it last. Measured there, the
        // old offset cancelled the new one and the camera aimed at her feet.
        if (battler.model.parent) battler.model.parent.remove(battler.model);
        const box    = battler.rig ? posedBox(battler.model) : new THREE.Box3().setFromObject(battler.model);
        const size   = new THREE.Vector3(); box.getSize(size);
        const center = new THREE.Vector3(); box.getCenter(center);
        const vHalf  = (camera.fov * Math.PI / 180) / 2;
        const crop   = battler.portraitCrop || 0;
        if (crop > 0 && crop < 1) {
            const sliceHeight = size.y * crop;
            center.y = box.max.y - sliceHeight / 2;
            return { center, distance: Math.max((sliceHeight / 2) / Math.tan(vHalf), 0.1) * margin };
        }
        // 40 degrees is the VERTICAL field, so on a frame taller than it is wide
        // the horizontal one is the narrower of the two, and a wide body (a
        // quadruped seen side on) overflows it if only the vertical is fitted.
        // Yaw is the player's to turn, so the depth is fitted as a width too.
        const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
        const distV = (size.y / 2) / Math.tan(vHalf);
        const distH = (Math.max(size.x, size.z) / 2) / Math.tan(hHalf);
        return { center, distance: Math.max(distV, distH, 0.1) * margin };
    }

    // Builds what a portrait info object names: the custom humanoid assembled
    // in character creation, or a creature archetype model rebuilt with the look
    // seed it was rolled with. Resolves to null when nothing can be built.
    function buildActorModel3D(info) {
        if (!info) return Promise.resolve(null);
        if (info.kind === "glb") {
            return loadPortraitGLB(info.path).then((b) => {
                if (b) tintDossierModel(b.model, info.colours);
                return b;
            });
        }
        if (info.kind === "custom") {
            return Promise.resolve(window.CC3DModel.buildModel(info.cfg, info.actorId));
        }
        const look = info.look || null;
        const fakeBattler = { enemyId: () => info.enemyId, index: () => (look ? (look.index || 0) : 0) };
        const storedSeed = (window.CC3DModel && window.CC3DModel.getCreatureSeed)
            ? window.CC3DModel.getCreatureSeed(info.actorId) : null;
        const make = () => window.Battler3D.create(info.archKey, 0, 0, fakeBattler);
        // A monster recruited out of a battle carries that battle's look roll,
        // which stands in for the world seed here the way it did in the fight.
        // A creature built in the wizard carries the seed it was rolled under.
        let built;
        if (look && window.Battler3D.withLook) built = window.Battler3D.withLook(look, make);
        else if (storedSeed && window.CC3DModel && window.CC3DModel.withGenSeed) built = window.CC3DModel.withGenSeed(storedSeed, make);
        else built = make();
        if (!built) return Promise.resolve(null);
        return Promise.resolve(built.load(null, 0, 0, 0)).then(() => built);
    }

    // What the portrait is told about this character's anatomy: the parts they
    // still have plus the ones they no longer have at all, which is the only
    // way a missing limb reads as missing rather than as never mentioned
    // (window.HealthCore.partStates).
    function actorPartStates(actor) {
        if (!actor) return null;
        const HC = window.HealthCore;
        if (HC && HC.partStates) return HC.partStates(actor);
        return actor._bodyParts || null;
    }

    // The one answer to "which 3D model portrays this character". It is resolved
    // from the character's own identity: the species it was recruited from, the
    // battler it carries, or the model built for it in character creation, with
    // the look seed that model was rolled with. Every screen that draws the same
    // character reads it from here, so no two of them can disagree about who it
    // is (the Empathize panel is the other caller).
    window.ActorModel3D = {
        infoFor(actor) { return Scene_Status.prototype.getStatus3DInfo(actor); },
        keyFor(info)   { return info ? status3DKey(info) : ""; },
        build(info)    { return buildActorModel3D(info); },
        framing(battler, camera, margin) { return portraitFraming(battler, camera, margin || 1); },
        // A model file that could not be read once is not asked for again: the
        // screens that would have shown it fall back to the flat bust.
        modelAvailable(path)  { return !!path && !glbPortraitFailed[path]; },
        // The rigged dossier figure that walks for this character in a 3D
        // world: its own copy, { model, rig }, or null when the character has
        // no dossier model or it has no humanoid skeleton.
        figureFor(actor) {
            const path = window.CharacterPresets && window.CharacterPresets.getActorPresetModel
                ? window.CharacterPresets.getActorPresetModel(actor) : null;
            return loadFigureGLB(path).then((fig) => {
                if (!fig || !fig.rig) return null;
                tintDossierModel(fig.model, actorModelColours(actor));
                return fig;
            });
        },
        // Repaints a dossier model in { skin, hair, dress } on the spot.
        tint(root, colours) { tintDossierModel(root, colours); },
        rigFor(root) { return humanoidRigFor(root); },
        animations() { return RIG_LOOPS.concat(Object.keys(RIG_ONESHOTS)); }
    };

    Scene_Status.prototype.syncStatus3D = function (info) {
        const canvas = document.getElementById('status-bust-3d');
        const key = status3DKey(info);
        // Already showing this subject on a live canvas: just refresh which
        // limbs are hidden (they may have broken/healed since), then bail.
        if (this._status3D && canvas && this._status3D.canvas === canvas && this._status3DKey === key) {
            const m = this._status3D.model;
            const parts = actorPartStates(this.actor());
            if (m && parts && m.hideBrokenParts) { try { m.hideBrokenParts(parts); } catch (e) {} }
            if (m && info.kind === 'glb') tintDossierModel(m.model, info.colours);
            return;
        }
        this._status3DKey = key;
        this.initStatus3D(info);
    };

    Scene_Status.prototype.initStatus3D = function (info) {
        this.cleanupStatus3D();
        if (typeof THREE === 'undefined' || !window.Battler3D || !window.Battler3D.create) return;
        const bustCanvas = document.getElementById('status-bust');
        const wrapper = bustCanvas ? bustCanvas.parentNode : null;
        if (!wrapper) return;

        // Reuse or create the 3D canvas overlay, sized to match the bust area.
        let canvas = document.getElementById('status-bust-3d');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'status-bust-3d';
            // Sized by the stylesheet (100% of the portrait box, letterboxed),
            // never in pixels: a fixed size would spill over the gauges below
            // once the page is shorter than the portrait.
            canvas.style.cssText = 'display:block; cursor:grab;';
            wrapper.appendChild(canvas);
        }
        canvas.style.display = 'block';

        // The buffer matches the box it is drawn in, so the portrait uses the
        // whole width the page gives it rather than being letterboxed down from
        // a fixed portrait buffer. The constants are the fallback for a box that
        // has not been laid out yet.
        const rect   = canvas.getBoundingClientRect();
        const width  = Math.max(1, Math.round(rect.width)  || 440);
        const height = Math.max(1, Math.round(rect.height) || 500);
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setSize(width, height, false);
        renderer.setPixelRatio(1);

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const keyLight  = new THREE.DirectionalLight(0xfff2d0, 0.85); keyLight.position.set(3, 5, 4);   scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.35); fillLight.position.set(-3, -2, 2); scene.add(fillLight);

        const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 300);
        camera.position.set(0, 0, 8);

        const pivot = new THREE.Group();
        scene.add(pivot);

        const state = {
            renderer, canvas, scene, camera, pivot,
            model: null, rafId: 0, disposed: false, dragging: false, attackTimer: 0, frameAcc: 0,
            activeButton: -1, prev: { x: 0, y: 0 }, clock: new THREE.Clock(), listeners: {}
        };
        this._status3D = state;

        // Build the subject: a creature's archetype model (rebuilt with the
        // random look seed rolled at creation, when one was saved) or the
        // custom humanoid assembled in the character-creation 3D step.
        const loadPromise = buildActorModel3D(info);

        // Reflect this creature's broken limbs: hide the meshes of any destroyed
        // body part, and of any part that is no longer on the body at all
        // (root parts are protected by the model, so it never blanks the whole
        // figure).
        const brokenParts = actorPartStates(this.actor());

        loadPromise.then((battler) => {
            if (state.disposed) return;
            // Nothing could be built for this subject: drop the viewer rather
            // than leaving a live context behind an empty frame.
            if (!battler || !battler.model) {
                this.cleanupStatus3D();
                // A dossier model that failed to load is now off the table, so
                // asking again draws the flat bust instead of nothing at all.
                if (info.kind === 'glb') this.drawUIStatusBust(this.actor(), 'status-bust');
                return;
            }
            // A dossier model stands whole on the status sheet, settled into
            // its idle pose before it is measured, so she always fits the frame.
            if (battler.rig) {
                battler.portraitCrop = 0;
                if (battler.rig.reset) battler.rig.reset();
                for (let i = 0; i < 40; i++) { try { battler.update(1 / 30); } catch (e) {} }
            } else {
                try { battler.update(1 / 60); } catch (e) {}
            }
            try { if (brokenParts && battler.hideBrokenParts) battler.hideBrokenParts(brokenParts); } catch (e) {}
            const fit    = portraitFraming(battler, camera, 1.15);
            const holder = new THREE.Group();
            holder.position.copy(fit.center).multiplyScalar(-1);
            holder.add(battler.model);
            if (window.PSXShader) window.PSXShader.applyToObject(battler.model);
            pivot.add(holder);
            camera.position.set(0, 0, fit.distance);
            camera.lookAt(0, 0, 0);
            state.model = battler;
            state.attackTimer = 1.2;
        }).catch(() => {});

        // ── Mouse / touch controls (mirror the Bestiary 3D preview) ─────────
        const L = state.listeners;
        L.onDown = (e) => {
            if (e.button === 0 || e.button === 1) {
                state.activeButton = e.button; state.dragging = true;
                state.prev = { x: e.clientX, y: e.clientY };
                if (e.button === 1) e.preventDefault();
                canvas.style.cursor = 'grabbing';
            }
        };
        L.onMove = (e) => {
            if (state.activeButton === -1) return;
            const dx = e.clientX - state.prev.x, dy = e.clientY - state.prev.y;
            if (state.activeButton === 0) {
                pivot.rotation.y += dx * 0.012; pivot.rotation.x += dy * 0.012;
            } else if (state.activeButton === 1) {
                const ps = 0.0035 * camera.position.z;
                camera.position.x -= dx * ps; camera.position.y += dy * ps;
            }
            state.prev = { x: e.clientX, y: e.clientY };
        };
        L.onUp = () => { state.activeButton = -1; state.dragging = false; canvas.style.cursor = 'grab'; };
        L.onWheel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            camera.position.z = Math.max(1.5, Math.min(60, camera.position.z + e.deltaY * 0.012));
        };
        L.onAux = (e) => { if (e.button === 1) e.preventDefault(); };
        L.onCtx = (e) => e.preventDefault();
        L.onTStart = (e) => { if (e.touches.length === 1) { state.dragging = true; state.activeButton = 0; state.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } };
        L.onTMove = (e) => {
            if (e.touches.length === 1) {
                const dx = e.touches[0].clientX - state.prev.x, dy = e.touches[0].clientY - state.prev.y;
                pivot.rotation.y += dx * 0.012; pivot.rotation.x += dy * 0.012;
                state.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };
        L.onTEnd = () => { state.dragging = false; state.activeButton = -1; };

        canvas.addEventListener('mousedown',   L.onDown);
        canvas.addEventListener('mousemove',   L.onMove);
        window.addEventListener('mouseup',     L.onUp);
        canvas.addEventListener('wheel',       L.onWheel, { passive: false });
        canvas.addEventListener('auxclick',    L.onAux);
        canvas.addEventListener('contextmenu', L.onCtx);
        canvas.addEventListener('touchstart',  L.onTStart);
        canvas.addEventListener('touchmove',   L.onTMove);
        window.addEventListener('touchend',    L.onTEnd);

        const FRAME = 1 / 30;
        const animate = () => {
            if (state.disposed) return;
            state.rafId = requestAnimationFrame(animate);
            state.frameAcc += Math.min(state.clock.getDelta(), 0.05);
            if (state.frameAcc < FRAME) return;
            const dt = state.frameAcc;
            state.frameAcc = 0;
            if (state.model) {
                state.attackTimer -= dt;
                if (state.attackTimer <= 0 && state.model.currentAnimation === 'idle') {
                    const anim = (state.model.hasAnimation('specialattack') && Math.random() < 0.4)
                        ? 'specialattack' : 'attack';
                    try { state.model.playAnimation(anim, false); } catch (e) {}
                    state.attackTimer = 2.4 + Math.random() * 1.6;
                }
                try { state.model.update(dt); } catch (e) {}
            }
            if (window.PSXShader) {
                window.PSXShader.render(renderer, scene, camera);
            } else {
                renderer.render(scene, camera);
            }
        };
        animate();
    };

    Scene_Status.prototype.cleanupStatus3D = function () {
        const s = this._status3D;
        this._status3DKey = null;
        if (!s) return;
        s.disposed = true;
        cancelAnimationFrame(s.rafId);
        const L = s.listeners || {}, c = s.canvas;
        if (c) {
            c.removeEventListener('mousedown',   L.onDown);
            c.removeEventListener('mousemove',   L.onMove);
            c.removeEventListener('wheel',       L.onWheel);
            c.removeEventListener('auxclick',    L.onAux);
            c.removeEventListener('contextmenu', L.onCtx);
            c.removeEventListener('touchstart',  L.onTStart);
            c.removeEventListener('touchmove',   L.onTMove);
            if (c.parentNode) c.parentNode.removeChild(c);
        }
        window.removeEventListener('mouseup',  L.onUp);
        window.removeEventListener('touchend', L.onTEnd);
        // dispose() leaves the WebGL context alive. The browser caps live
        // contexts and force-loses the OLDEST past the cap, which is the game's
        // own canvas: PIXI then silently stops rendering and the picture freezes
        // until the game is restarted. A fresh canvas is built on every open, so
        // releasing the context here costs nothing.
        try { s.renderer.dispose(); } catch (e) {}
        try { if (s.renderer.forceContextLoss) s.renderer.forceContextLoss(); } catch (e) {}
        this._status3D = null;
    };

    Scene_Status.prototype.selectUIActor = function (index) {
        if (index >= 0 && index < $gameParty.allMembers().length) {
            this._actorIndex = index;
            SoundManager.playCursor();
            this.refreshActor();
        }
    };

    // The attributes a point could go into right now, in the order the
    // medallions are drawn in. Read for the keyboard cursor below and nowhere
    // else, so the grid stays the one place that decides the order.
    Scene_Status.prototype.raisableParams = function () {
        const actor = this.actor();
        if (!actor || !window.StatPoints) return [];
        return [2, 3, 6, 4, 5, 7].filter((id) => window.StatPoints.canSpend(actor, id));
    };

    // Which of them the cursor is on. Kept as a POSITION rather than as a param
    // id, because spending a point can take a stat out of the list under the
    // cursor (the pool empties, or the stat caps) and a position simply lands on
    // whatever is there now.
    Scene_Status.prototype.raiseCursorParam = function () {
        const list = this.raisableParams();
        if (!list.length) return -1;
        const at = (this._raiseCursor || 0) % list.length;
        return list[at];
    };

    Scene_Status.prototype.stepRaiseCursor = function (dir) {
        const list = this.raisableParams();
        if (list.length < 2) return false;
        this._raiseCursor = ((this._raiseCursor || 0) + dir + list.length) % list.length;
        SoundManager.playCursor();
        this.refreshUIStatus();
        return true;
    };

    // Spending an attribute point from the medallion grid. Permanent: the
    // point is written into the actor and the sheet is redrawn under it.
    Scene_Status.prototype.spendStatPoint = function (paramId) {
        const actor = this.actor();
        if (!actor || !window.StatPoints.spend(actor, paramId)) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playEquip();
        if (window.ParchmentToast) {
            window.ParchmentToast.show(
                T('SceneStatus.ui.attributeRaised')
                    .replace("{stat}", statNameForParam(paramId))
                    .replace("{value}", actor.param(paramId))
            );
        }
        this.refreshUIStatus();
    };

    // Walking the anatomy moves one frame around one cell. The whole sheet -
    // the medallions, the stat breakdown, the needs, the bio, the backstory,
    // the passives, the ailments - says exactly the same thing before and
    // after, so it is left standing and only the frame is moved.
    Scene_Status.prototype.markUIBodyPart = function () {
        const spread = this._dndContainer && this._dndContainer.querySelector(".book-spread");
        if (!spread) return false;
        const cells = spread.querySelectorAll(".anatomy-cell");
        if (!cells.length) return false;
        const on = this._dndActiveSection === "bodyparts";
        cells.forEach((cell, idx) => {
            cell.classList.toggle("selected", on && idx === this._dndSelectedIndex);
        });
        const selected = spread.querySelector(".anatomy-cell.selected");
        if (selected) selected.scrollIntoView({ block: "nearest" });
        return true;
    };

    Scene_Status.prototype.selectUIBodyPart = function (index) {
        this._dndActiveSection = "bodyparts";
        this._dndSelectedIndex = index;
        SoundManager.playCursor();
        if (!this.markUIBodyPart()) this.refreshUIStatus();
    };

    Scene_Status.prototype.getUIReproductionName = function (type) {
        switch (type) {
            case -1: return T("MainMenu.reproduction.none");
            case 0: return T("MainMenu.reproduction.testicles");
            case 1: return T("MainMenu.reproduction.uterus");
            case 2: return T("MainMenu.reproduction.oviparous");
            case 3: return T("MainMenu.reproduction.plant");
            case 4: return T("MainMenu.reproduction.mitosis");
            default: return T("MainMenu.reproduction.unknown");
        }
    };

    Scene_Status.prototype.getUIGenderName = function (gender) {
        switch (gender) {
            case 0: return T("MainMenu.gender.male");
            case 1: return T("MainMenu.gender.female");
            case 2: return T("MainMenu.gender.nonBinary");
            case 3: return T("MainMenu.gender.cocoon");
            default: return T("MainMenu.gender.fluid");
        }
    };

    Scene_Status.prototype.updateUIStatusInput = function () {
        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
            SoundManager.playCancel();
            this.popScene();
            return;
        }

        // L1 / R1 (and left / right) turn the page's tabs; L2 / R2 change the
        // member (CharSwitcher, installed with the scene).
        const tabStep = window.UINav ? window.UINav.tabDir() : 0;
        if (tabStep) {
            this.cycleStatusTab(tabStep);
            return;
        }

        if (Input.isRepeated('right')) {
            this.cycleStatusTab(1);
            return;
        }

        if (Input.isRepeated('left')) {
            this.cycleStatusTab(-1);
            return;
        }

        // The one thing this page DOES rather than shows: opening the member's
        // own sheet. It used to be the single button here a cursor could not
        // reach, since the spread has no board and nothing read Confirm.
        if (Input.isTriggered('ok')) {
            this.openStatusEmpathize();
            return;
        }

        // The medallions' + was the one control on this sheet a mouse alone
        // could press. Y walks the stats a point could go into, X spends into
        // the one it is lit on; both do nothing at all while there is no point
        // to spend, so neither is in the way on an ordinary read of the sheet.
        if (Input.isTriggered('menu') && this.stepRaiseCursor(1)) return;
        if (Input.isTriggered('shift')) {
            const id = this.raiseCursorParam();
            if (id >= 0) {
                this.spendStatPoint(id);
                return;
            }
        }

        // The traits and bio pages are scrollable dossiers
        if (this._dndActiveTab === "traits") {
            const list = this._dndContainer && this._dndContainer.querySelector("#status-traits");
            if (list) {
                if (Input.isRepeated('down')) list.scrollTop += TRAIT_SCROLL_STEP;
                else if (Input.isRepeated('up')) list.scrollTop -= TRAIT_SCROLL_STEP;
            }
            return;
        }

        if (this._dndActiveTab === "bio" || this._dndActiveTab === "backstory") {
            const sel = this._dndActiveTab === "bio" ? "#status-bio-scroll" : "#status-backstory-scroll";
            const list = this._dndContainer && this._dndContainer.querySelector(sel);
            if (list) {
                if (Input.isRepeated('down')) list.scrollTop += TRAIT_SCROLL_STEP;
                else if (Input.isRepeated('up')) list.scrollTop -= TRAIT_SCROLL_STEP;
            }
            return;
        }

        // The anatomy grid is a tab of its own, so its cursor answers to
        // up / down only while that tab is the one being read.
        const actor = this.actor();
        if (this._dndActiveTab === "bodyparts" && actor && actor._bodyParts) {
            const bodyParts = [];
            for (const key in actor._bodyParts) {
                if (actor._bodyParts[key]) bodyParts.push(actor._bodyParts[key]);
            }

            if (bodyParts.length > 0) {
                if (Input.isRepeated('down')) {
                    this._dndActiveSection = "bodyparts";
                    this._dndSelectedIndex = (this._dndSelectedIndex + 1) % bodyParts.length;
                    SoundManager.playCursor();
                    if (!this.markUIBodyPart()) this.refreshUIStatus();
                    return;
                }
                if (Input.isRepeated('up')) {
                    this._dndActiveSection = "bodyparts";
                    this._dndSelectedIndex = (this._dndSelectedIndex - 1 + bodyParts.length) % bodyParts.length;
                    SoundManager.playCursor();
                    if (!this.markUIBodyPart()) this.refreshUIStatus();
                    return;
                }
            }
        }
    };

    //=============================================================================
    // Window Constructors & Stub Prototypes for MZ compatibility
    //=============================================================================

    function Window_CustomStatus() {
        this.initialize(...arguments);
    }
    Window_CustomStatus.prototype = Object.create(Window_StatusBase.prototype);
    Window_CustomStatus.prototype.constructor = Window_CustomStatus;
    Window_CustomStatus.prototype.initialize = function (rect) {
        Window_StatusBase.prototype.initialize.call(this, rect);
        this.visible = false;
        this.active = false;
    };
    Window_CustomStatus.prototype.setActor = function (actor) { };
    Window_CustomStatus.prototype.setActorIndex = function (index) { };

    function Window_StatusStates() {
        this.initialize(...arguments);
    }
    Window_StatusStates.prototype = Object.create(Window_Base.prototype);
    Window_StatusStates.prototype.constructor = Window_StatusStates;
    Window_StatusStates.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.visible = false;
        this.active = false;
    };
    Window_StatusStates.prototype.setActor = function (actor) { };

    function Window_StatusParams() {
        this.initialize(...arguments);
    }
    Window_StatusParams.prototype = Object.create(Window_Base.prototype);
    Window_StatusParams.prototype.constructor = Window_StatusParams;
    Window_StatusParams.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.visible = false;
        this.active = false;
    };
    Window_StatusParams.prototype.setActor = function (actor) { };

})();