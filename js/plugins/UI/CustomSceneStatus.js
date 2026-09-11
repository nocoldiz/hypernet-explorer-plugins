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
 * - Scrollable biological limb-health vitals tracking (Dwarf Fortress limb damage)
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

    // ── Shared character-switcher hint helper (idempotent across plugins) ──────
    // Shows controller bumper hints (L / R) around a .companion-tabs-row when a
    // gamepad is connected, or a single TAB hint otherwise. Also installs a Tab
    // keyboard shortcut that cycles characters only while no controller is
    // connected (the bumpers / pageup-pagedown handle it when one is).
    if (!window.CharSwitcher) {
        window.CharSwitcher = {
            isControllerConnected() {
                const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                for (let i = 0; i < pads.length; i++) {
                    if (pads[i] && pads[i].connected) return true;
                }
                return false;
            },
            parts(memberCount) {
                if (!memberCount || memberCount <= 1) return { left: '', right: '' };
                if (this.isControllerConnected()) {
                    return {
                        left: '<span class="char-switch-hint">L</span>',
                        right: '<span class="char-switch-hint">R</span>'
                    };
                }
                return { left: '', right: '<span class="char-switch-hint">TAB</span>' };
            },
            inner(tabsRowHTML, memberCount) {
                const p = this.parts(memberCount);
                return p.left + tabsRowHTML + p.right;
            },
            wrap(tabsRowHTML, memberCount) {
                return `<div class="companion-switcher">${this.inner(tabsRowHTML, memberCount)}</div>`;
            },
            installTabKey(scene, onCycle) {
                if (scene._charSwitchTabListener) return;
                scene._charSwitchTabListener = (e) => {
                    if (e.key !== 'Tab') return; // i18n-ignore: DOM key name
                    e.preventDefault();
                    if (this.isControllerConnected()) return;
                    onCycle(e.shiftKey ? -1 : 1);
                };
                window.addEventListener('keydown', scene._charSwitchTabListener);
            },
            removeTabKey(scene) {
                if (scene._charSwitchTabListener) {
                    window.removeEventListener('keydown', scene._charSwitchTabListener);
                    scene._charSwitchTabListener = null;
                }
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
    // down a page that was never tall enough for them: the raw numbers (the
    // default), the traits written out, what is permanently on, and the body's
    // own condition. The chips are the shared bookmark-tab design the backpack
    // and the shop already use (.backpack-tabs / .backpack-tab in css/theme.css).
    //=============================================================================

    const STATUS_TABS = [
        { id: "attributes", labelKey: "SceneStatus.ui.tabAttributes" },
        { id: "bio", labelKey: "SceneStatus.ui.tabBio" },
        { id: "backstory", labelKey: "SceneStatus.ui.tabBackstory" },
        { id: "traits", labelKey: "SceneStatus.ui.tabTraits" },
        { id: "passives", labelKey: "SceneStatus.ui.tabPassives" },
        { id: "diseases", labelKey: "SceneStatus.ui.tabDiseases" }
    ];

    // The section the sheet opens on. Attributes is what the page is for, and
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
                <div class="card-label status-04">${T('SceneStatus.ui.statBreakdown') || "Stat Bonuses & Modifiers"}</div>
                <table class="status-stat-table">
                    <thead>
                        <tr>
                            <th>${T('SceneStatus.parameters') || "Stat"}</th>
                            <th>${T('SceneStatus.ui.statBase') || "Base"}</th>
                            <th>${T('SceneStatus.ui.statGear') || "Gear"}</th>
                            <th>${T('SceneStatus.ui.statTraits') || "Traits"}</th>
                            <th>${T('SceneStatus.ui.statAwarded') || "Points"}</th>
                            <th>${T('SceneStatus.ui.statInjuries') || "Injuries"}</th>
                            <th>${T('SceneStatus.total') || "Total"}</th>
                            <th>${T('SceneStatus.ui.statMod') || "Mod"}</th>
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
            case 0: genderLabel = `${T("MainMenu.gender.male") || "Male"} (He/Him)`; break;
            case 1: genderLabel = `${T("MainMenu.gender.female") || "Female"} (She/Her)`; break;
            case 2: genderLabel = `${T("MainMenu.gender.nonBinary") || "Non-Binary"} (They/Them)`; break;
            case 3: genderLabel = `${T("MainMenu.gender.cocoon") || "Cocoon"} (It/Its)`; break;
            default: genderLabel = T("MainMenu.gender.fluid") || "Fluid"; break;
        }

        const ccUtils = window.CharacterCreationUtils;
        const repVar = (ccUtils && ccUtils.getReproductiveVariableId)
            ? ccUtils.getReproductiveVariableId(Math.max(0, memberIndex)) : 87;
        const repType = $gameVariables ? $gameVariables.value(repVar) : 0;
        let repName = "";
        switch (repType) {
            case -1: repName = T("MainMenu.reproduction.none") || "None"; break;
            case 0: repName = T("MainMenu.reproduction.testicles") || "Testicles"; break;
            case 1: repName = T("MainMenu.reproduction.uterus") || "Uterus"; break;
            case 2: repName = T("MainMenu.reproduction.oviparous") || "Oviparous"; break;
            case 3: repName = T("MainMenu.reproduction.plant") || "Plant"; break;
            case 4: repName = T("MainMenu.reproduction.mitosis") || "Mitosis"; break;
            default: repName = T("MainMenu.reproduction.unknown") || "Unknown"; break;
        }
        const health = window.HealthCore;
        const gestationDays = health && health.getPregnancyDuration ? health.getPregnancyDuration(actor, repType) : (repType === 4 ? 1 : 280);

        const archKeys = (health && health.getActorArchetypeKeys) ? health.getActorArchetypeKeys(actor) : [];
        const archNames = archKeys.map(k => health.getArchetypeDisplayName(k)).filter(Boolean);
        const archetypeText = archNames.length ? archNames.join(" / ") : (profile?.isCreature ? "Creature" : "Humanoid");

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
        const wealthLabels = [T("Empathize.destitute") || "Destitute", T("Empathize.poor") || "Poor", T("Empathize.workingClass") || "Working Class", T("Empathize.middleClass") || "Middle Class", T("Empathize.wealthy") || "Wealthy"];
        const wealthText = wealthLabels[wealthTier] || wealthLabels[2];

        const morality = profile?.moralityScore ?? 0;
        const moralMap = [
            { threshold: -60, label: T("Empathize.evil") || "Evil", band: "wicked" },
            { threshold: -20, label: T("Empathize.dishonest") || "Dishonest", band: "wicked" },
            { threshold: 20, label: T("Empathize.neutral") || "Neutral", band: "neutral" },
            { threshold: 60, label: T("Empathize.honest") || "Honest", band: "upright" },
            { threshold: Infinity, label: T("Empathize.virtuous") || "Virtuous", band: "upright" }
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
            specsHTML = `<div class="status-06">${T('SceneStatus.ui.noSpecializations') || "No trained specializations..."}</div>`;
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
                <div class="card-label">${T('SceneStatus.ui.backstoryTitle') || "Backstory & Formative Events"}</div>
                ${narrative ? `<div class="status-bio-narrative">${escapeAttr(narrative)}</div>` : `<div class="status-06">${T('SceneStatus.ui.noBackstory') || "No backstory recorded..."}</div>`}
                ${eventsHTML}
            </div>
        `;
        }

        return `
            <div class="status-bio-section">
                <div class="card-label">${T('SceneStatus.ui.identityTitle') || "Identity & Demographics"}</div>
                <div class="status-bio-grid">
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.gender') || "Gender"}:</span>
                        <span class="status-bio-item-val">${escapeAttr(genderLabel)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.reproduction') || "Reproduction"}:</span>
                        <span class="status-bio-item-val">${escapeAttr(repName)} <span class="status-07">(${gestationDays}d)</span></span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.archetype') || "Archetype"}:</span>
                        <span class="status-bio-item-val status-08">${escapeAttr(archetypeText)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.age') || "Age"}:</span>
                        <span class="status-bio-item-val">${escapeAttr(ageVal)} <span class="status-07">(${birthYearVal})</span></span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.bloodType') || "Blood Type"}:</span>
                        <span class="status-bio-item-val status-02">${escapeAttr(bloodType)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.hometown') || "Hometown"}:</span>
                        <span class="status-bio-item-val">${escapeAttr(homeTown)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.nation') || "Nation"}:</span>
                        <span class="status-bio-item-val">${escapeAttr(nationName)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.sexualOrientation') || "Sexual"}:</span>
                        <span class="status-bio-item-val">${escapeAttr(sexualOrientation)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.romanticOrientation') || "Romantic"}:</span>
                        <span class="status-bio-item-val">${escapeAttr(romanticOrientation)}</span>
                    </div>
                </div>
            </div>

            <div class="status-bio-section">
                <div class="card-label">${T('SceneStatus.ui.societyTitle') || "Society & Creed"}</div>
                <div class="status-bio-grid">
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.personality') || "Personality"}:</span>
                        <span class="status-bio-item-val"><span style="${iconStyle(persIcon, 16)} vertical-align:middle"></span> ${escapeAttr(persName)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.ideology') || "Ideology"}:</span>
                        <span class="status-bio-item-val"><span style="${iconStyle(186, 16)} vertical-align:middle"></span> ${escapeAttr(ideologyName)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.faction') || "Faction"}:</span>
                        <span class="status-bio-item-val"><span style="${iconStyle(factionIcon, 16)} vertical-align:middle"></span> ${escapeAttr(factionName)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.wealth') || "Wealth"}:</span>
                        <span class="status-bio-item-val"><span style="${iconStyle(314, 16)} vertical-align:middle"></span> ${escapeAttr(wealthText)}</span>
                    </div>
                    <div class="status-bio-item">
                        <span class="status-bio-item-lbl">${T('SceneStatus.ui.morality') || "Morality"}:</span>
                        <span class="status-bio-item-val badge morality--${moralEntry.band}">${escapeAttr(moralEntry.label)} (${morality >= 0 ? '+' : ''}${morality})</span>
                    </div>
                </div>
                ${persDesc ? `<div class="status-09">${escapeAttr(persDesc)}</div>` : ''}
            </div>

            <div class="status-bio-section">
                <div class="card-label">${T('SceneStatus.ui.specializationsTitle') || "Specializations & Skills"}</div>
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
            window.skipLocalization = true;
            $gameMessage.add(T("SceneStatus.descriptionSet", { name: actor.name() }));
            window.skipLocalization = false;
        } else {
            window.skipLocalization = true;
            $gameMessage.add(T("SceneStatus.invalidIndex"));
            window.skipLocalization = false;
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
                        
                        <div class="backpack-tabs status-tabs" id="status-tabs"></div>

                        <div id="status-lower-cards">
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
                    <div class="right-page">
                        <div class="status-right-header">
                            <div class="companion-switcher" id="status-companion-switcher"></div>
                        </div>

                        <div class="status-left-body">
                        <div class="status-bust-wrapper">
                            <canvas id="status-bust" width="440" height="500"></canvas>
                        </div>

                        <div class="status-gauges-box">
                            <div class="status-gauge-grid">
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

                            <div class="status-gauge-row">
                                <div class="status-gauge-meta">
                                    <span class="gauge-label">${T('SceneStatus.ui.ap')}</span>
                                    <span class="gauge-value" id="status-tp-text"></span>
                                </div>
                                <div class="status-gauge-bar-outer">
                                    <div class="status-gauge-bar-inner tp" id="status-tp-bar"></div>
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

                            <div class="status-needs-rows" id="status-needs"></div>
                        </div>

                        <div class="status-anatomy-panel">
                            <div class="anatomy-grid" id="bodyparts-scroll-container"></div>
                        </div>
                        </div>
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

        const tpTextEl = spread.querySelector("#status-tp-text");
        if (tpTextEl) tpTextEl.textContent = `${Math.ceil(actor.tp)}`;
        const tpBarEl = spread.querySelector("#status-tp-bar");
        if (tpBarEl) tpBarEl.style.width = `${(actor.tp / actor.maxTp()) * 100}%`;

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
                { label: T("SceneStatus.need.leisure"), cls: "leisure", fn: "leisurePercent" }
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
            const raiseHTML = window.StatPoints.canSpend(actor, p.id)
                ? `<div class="stat-medallion-raise focusable" title="${escapeAttr(T('SceneStatus.ui.raiseAttribute'))}" onclick="SceneManager._scene.spendStatPoint(${p.id})">+</div>`
                : "";

            paramsGridHTML += `
                <div class="stat-medallion">
                    <div class="stat-medallion-lbl">${p.name}</div>
                    <div class="stat-medallion-row">
                        <div class="stat-medallion-val">${displayValHTML}</div>
                        <div class="stat-medallion-mod">${mod}</div>
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
            ? `<div class="stat-points-banner">${T('SceneStatus.ui.attributePoints').replace("{points}", pointsLeft)}</div>`
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
                        <div class="anatomy-cell-bar"><div class="bodypart-bar" style="width:${barWidth}%"></div></div>
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
                selectedPart.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
        if (battlerField && typeof battlerField === 'string' && isMonsterPortraitActor(actor)) {
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
            for (const enemy of $dataEnemies) {
                if (!enemy || enemy.battlerName !== battlerField) continue;
                const key = window.Battler3D.resolveKey(enemy);
                if (key) return { kind: 'enemy', archKey: key, enemyId: enemy.id, actorId: actor.actorId() };
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
            return { kind: 'glb', path: presetModel, actorId: actor.actorId() };
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
    function loadPortraitGLB(path) {
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return Promise.resolve(null);
        if (!glbPortraitCache[path]) {
            glbPortraitCache[path] = new Promise((resolve) => {
                const fail = () => { glbPortraitFailed[path] = true; resolve(null); };
                try {
                    new THREE.GLTFLoader().load(path,
                        (gltf) => {
                            if (gltf && gltf.scene) resolve(gltf.scene);
                            else fail();
                        },
                        undefined,
                        fail);
                } catch (e) { fail(); }
            });
        }
        // Dressed in what the viewers expect of a battler: a still figure with
        // no animations to play, framed like the bust it stands in for.
        return glbPortraitCache[path].then((scene) => scene ? {
            model: scene,
            portraitCrop: 0.5,
            currentAnimation: null,
            update() {},
            hasAnimation() { return false; },
            playAnimation() {}
        } : null);
    }

    // Where a portrait viewer puts the camera, and where the subject has to be
    // moved to sit centred in the frame. A creature is framed whole, on both
    // axes. A model standing in for a bust says so with `portraitCrop`, the
    // fraction of its height a portrait should show, and only that top slice is
    // fitted, and only vertically: the head and chest fill the frame the way the
    // bust art did, and arms held out to the sides fall outside it.
    function portraitFraming(battler, camera, margin) {
        const box    = new THREE.Box3().setFromObject(battler.model);
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
            return loadPortraitGLB(info.path);
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
        modelAvailable(path)  { return !!path && !glbPortraitFailed[path]; }
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
            try { battler.update(1 / 60); } catch (e) {}
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
        if (selected) selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

        // The shoulder buttons keep the party switcher they have on every other
        // book spread; left / right now turn the page's own tabs, which is the
        // only thing those keys can mean once the left page has sections.
        if (Input.isTriggered('pagedown')) {
            this.nextActor();
            return;
        }

        if (Input.isTriggered('pageup')) {
            this.previousActor();
            return;
        }

        if (Input.isTriggered('right')) {
            this.cycleStatusTab(1);
            return;
        }

        if (Input.isTriggered('left')) {
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

        // The anatomy grid lives on the right page, so its cursor answers to
        // up / down whichever section of the left page is being read.
        const actor = this.actor();
        if (actor && actor._bodyParts) {
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