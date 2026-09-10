//=============================================================================
// CategorizedBattleSkills.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Role-tabbed skill menu with a carried battle loadout of 9 skills per character.
 * @author Omni-Lex
 * @version 3.2.0
 *
 * @help CategorizedBattleSkills.js
 *
 * Combines CategorizedBattleSkills and CustomSkillsMenuSwitcher into one plugin.
 *
 * --- THE LOADOUT ---
 * A character knows far more than they can hold in their hands. At most 9
 * skills are carried at once, and only those reach the battle menus;
 * everything else is known but benched until the player says otherwise.
 * A newly learned skill is carried straight away while its half of the loadout
 * still has room. The Basic kit (<category:Basic>: Attack, Guard, Check, ...)
 * and anything a weapon or a state grants are always carried and spend no slot.
 *
 * window.BattleLoadout is the only way to ask what a character carries.
 *
 * --- STAT REQUIREMENTS ---
 * Every skill names a base stat and a floor for it (<StatReq: STAT N>, read by
 * window.SkillStatReq). Nothing here is gated on it: any known skill can be
 * carried and cast. A character UNDER the floor simply has a looser grip on the
 * skill and the action can come apart in their hands, which the battle system
 * rolls for; the list row wears the floor as a red chip and the inspect card
 * spells out what they hold against it and how often it will fumble.
 *
 * --- BATTLE ---
 * One flat list per skill type, holding that type's carried skills by name.
 * There is no category layer.
 *
 * --- MENU (Skills scene) ---
 * Three tabs by role, Offensive / Healing / Support, each listing skills AND
 * magic together by name, plus a "Level Up" tab of what the class still owes.
 * A skill is carried or benched from its row (Shift, or the pill on the card)
 * or from the action list on the right page.
 * Left/Right switches party members. The skill info panel replaces the status window.
 *
 * --- HOW TO USE ---
 * Add <role: Offensive|Healing|Support> to a skill's Note field. A skill
 * without one is bucketed from its own mechanics.
 *
 * --- CHANGE LOG ---
 * v3.1.0 - The Skills scene is the backpack's page: the same header, category
 *          chips, pocket cards, quick-slot strip (the loadout, on
 *          Core/HotbarUI.js) and inspect card, all inked by css/theme.css's
 *          ".inspect-pockets" rules rather than a stylesheet of its own.
 *          1-9 drops the skill being read into that slot of the loadout.
 * v3.0.0 - Carried battle loadout (7 skills + 7 magic). Skill menu tabs are
 *          roles, not schools. Battle categories, the categorization option
 *          and favourite skills all removed.
 * v2.0.0 - Merged CustomSkillsMenuSwitcher into CategorizedBattleSkills.
 *          Menu categories never grey out; individual skills grey if unusable.
 *          Category icons shown in menu skill list.
 * v1.6.1 - Fixed skill type filtering
 * v1.6.0 - Category descriptions in help window
 * v1.5.0 - Italian translation support
 * v1.4.0 - Cursor position memory
 * v1.3.0 - Category icons
 * v1.2.0 - Main menu Skills window + party switching
 */

(() => {
    'use strict';

    // Escape user/DB-provided strings before injecting into innerHTML so that
    // characters like < > & " ' (e.g. in damage formulas or notes) don't
    // corrupt the surrounding markup.
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // A database record's own name and description are the English ones the
    // editor wrote: the engine swaps them at draw time through its Bitmap /
    // drawTextEx hooks, which a DOM page never reaches. Every skill name and
    // description this page prints goes through here, so the menu reads in the
    // language the rest of the game is in (js/i18n/<lang>/skills.json).
    function dbText(text) {
        if (!text) return '';
        return typeof window.Hendrix_Localization === 'function'
            ? window.Hendrix_Localization(String(text))
            : String(text);
    }

    // ── Shared skill inspect service (idempotent across plugins) ──────────────
    // Builds the full "Combat Application / Damage / Skill Effects /
    // Classifications" block shown on the right page of the Skills scene, so any
    // other menu that inspects a skill (SkillMaster's Training encyclopedia,
    // ...) renders exactly the same information from the same code.
    if (!window.SkillDetails) {
        window.SkillDetails = (() => {
            const esc = escapeHtml;

            // The item inspect panel spells out the same engine enums and stat
            // names, so both read one vocabulary: Inventory.spec / Equip.
            const PARAM_KEYS = ["hp", "mp", "str", "con", "int", "wis", "dex", "psi"];
            const paramName = (paramId) => {
                const key = "Equip." + PARAM_KEYS[paramId];
                return PARAM_KEYS[paramId] && T.has(key) ? T(key) : T("Inventory.spec.stat");
            };

            const FORMULA_MAP = [
                { regex: /\b[ab]\.mhp\b/gi, key: "Inventory.spec.maxHp" },
                { regex: /\b[ab]\.mmp\b/gi, key: "Inventory.spec.maxMp" },
                { regex: /\b[ab]\.hp\b/gi, key: "Equip.hp" },
                { regex: /\b[ab]\.mp\b/gi, key: "Equip.mp" },
                { regex: /\b[ab]\.tp\b/gi, key: "SkillsMenu.unit.ap" },
                { regex: /\b[ab]\.atk\b/gi, key: "Equip.str" },
                { regex: /\b[ab]\.def\b/gi, key: "Equip.con" },
                { regex: /\b[ab]\.mat\b/gi, key: "Equip.int" },
                { regex: /\b[ab]\.mdf\b/gi, key: "Equip.wis" },
                { regex: /\b[ab]\.agi\b/gi, key: "Equip.dex" },
                { regex: /\b[ab]\.luk\b/gi, key: "Equip.psi" }
            ];
            const translateFormula = (formula) => {
                if (!formula) return "";
                let str = formula;
                FORMULA_MAP.forEach(m => { str = str.replace(m.regex, T(m.key)); });
                return str;
            };

            // Engine enum -> label, the index staying the id.
            const enumName = (key, index) => {
                const arr = T.list(key);
                return arr[index] || arr[0] || "";
            };
            // MapBattleMode tags anything that reaches across the field with a
            // range this large; it is a sentinel, not a number of tiles.
            const UNLIMITED_RANGE = 99;

            const occasionName = (occasion) => enumName("Inventory.spec.occasion", occasion);
            const scopeName = (scope) => enumName("Inventory.spec.scope", scope);
            const damageTypeName = (type) => enumName("Inventory.spec.damageType", type);

            const costTextOf = (skill) => {
                if (!skill) return "";
                if (skill.mpCost > 0) return T("SkillsMenu.cost.mp", { n: skill.mpCost });
                if (skill.tpCost > 0) return T("SkillsMenu.cost.ap", { n: skill.tpCost });
                return "";
            };

            const scaleOf = (skill) => {
                if (!skill || !skill.damage || !skill.damage.formula) return null;
                const formula = skill.damage.formula;
                // Values are Equip.* leaves, so the scaling stat is named in the
                // same vocabulary as the character sheet.
                const statPatterns = {
                    'a.atk': 'str',
                    'a.mat': 'int',
                    'a.param(2)': 'str',
                    'a.param(3)': 'con',
                    'a.param(4)': 'int',
                    'a.param(5)': 'wis',
                    'a.param(6)': 'dex',
                    'a.param(7)': 'psi'
                };
                let mainStat = null;
                let maxMultiplier = 0;
                for (const [pattern, statName] of Object.entries(statPatterns)) {
                    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const match = formula.match(new RegExp(escaped + '\\s*\\*\\s*([\\d.]+)', 'i'));
                    if (match) {
                        const m = parseFloat(match[1]);
                        if (m > maxMultiplier) { maxMultiplier = m; mainStat = statName; }
                    } else if (formula.includes(pattern) && maxMultiplier === 0) {
                        mainStat = statName; maxMultiplier = 1;
                    }
                }
                if (!mainStat) return null;
                let grade = 'F';
                if (maxMultiplier >= 9) grade = 'S';
                else if (maxMultiplier >= 7) grade = 'A';
                else if (maxMultiplier >= 5) grade = 'B';
                else if (maxMultiplier >= 3) grade = 'C';
                else if (maxMultiplier >= 2) grade = 'D';
                else if (maxMultiplier >= 1) grade = 'E';
                return { stat: T("Equip." + mainStat), grade: grade, multiplier: maxMultiplier };
            };

            const categoryOf = (skill) => {
                if (!skill || !skill.note) return null;
                const match = skill.note.match(/<category:\s*(\w+)>/i);
                if (!match) return null;
                return match[1].replace(/([A-Z])/g, ' $1').trim();
            };

            const isBasic = (skill) => {
                if (!skill || !skill.note) return false;
                return /<[Cc]ategory\s*:\s*Basic>/i.test(skill.note);
            };

            // Human label for the subtitle under the skill name.
            const typeLabelOf = (skill) => {
                const cat = categoryOf(skill);
                if (cat) return cat;
                if (isBasic(skill)) return T("SkillsMenu.discipline.basic");
                return T("SkillsMenu.discipline.standard");
            };

            // ── Spec collection ───────────────────────────────────────────────
            // `actor` is optional: the requirement reads as a bare floor when
            // nobody is holding the page, and as "what you have against it"
            // when somebody is.
            const combatSpecsOf = (skill, actor) => {
                const specs = [];
                if (!skill) return specs;
                if (skill.stypeId > 0) specs.push({ label: T("Inventory.spec.label.skillType"), val: ($dataSystem.skillTypes || [])[skill.stypeId] || T("Inventory.spec.label.skillFallback") });

                // A move the body teaches rather than the character: it is said
                // here whose claw, mouth or grafted augment it came with, since
                // that is also what takes it away when the part comes off.
                const anatomy = window.HealthCore && window.HealthCore.skillSourcePartNames
                    ? window.HealthCore.skillSourcePartNames(actor, skill.id) : [];
                if (anatomy.length) {
                    specs.push({ label: T("SkillsMenu.spec.label.grantedBy"), val: anatomy.join(", ") });
                }
                if (skill.occasion !== undefined) specs.push({ label: T("Inventory.spec.label.occasion"), val: occasionName(skill.occasion) });
                if (skill.scope !== undefined && skill.scope !== 0) specs.push({ label: T("Inventory.spec.label.target"), val: scopeName(skill.scope) });

                // The cost is already read off the header gauges, so it is not
                // repeated as a row here.

                const scaleData = scaleOf(skill);
                if (scaleData) specs.push({ label: T("Equip.scale"), val: `${scaleData.stat} (${scaleData.grade})` });

                if (skill.speed) specs.push({ label: T("Inventory.spec.label.speedAdjust"), val: (skill.speed > 0 ? "+" : "") + skill.speed });
                if (skill.successRate !== undefined && skill.successRate !== 100) specs.push({ label: T("Inventory.spec.label.successRate"), val: skill.successRate + "%" });
                if (skill.repeats !== undefined && skill.repeats > 1) specs.push({ label: T("Inventory.spec.label.repeatActions"), val: "x" + skill.repeats });
                if (skill.tpGain > 0) specs.push({ label: T("Inventory.spec.label.apGain"), val: "+" + skill.tpGain });

                // How far it reaches, in tiles of the map battle grid
                // (MapBattleMode's <Range:N>). The far end of the scale is not a
                // distance the player can pace out, it means "anywhere in the
                // fight", so it is named rather than numbered.
                const range = Number(skill.meta && skill.meta.Range);
                if (Number.isFinite(range) && range > 0) {
                    specs.push({
                        label: T("SkillsMenu.spec.label.range"),
                        val: range >= UNLIMITED_RANGE ? T("SkillsMenu.spec.range.unlimited")
                                                      : T.n("SkillsMenu.spec.range.tiles", range)
                    });
                }

                // Which of the ten magic systems it is worked through
                // (gen_magic_system_tags.js's <MagicSystem:X>), read out in the
                // current language.
                const system = skill.meta && skill.meta.MagicSystem;
                if (system) {
                    const key = "SkillsMenu.magicSystem." + String(system).trim();
                    specs.push({ label: T("SkillsMenu.magicSystem.label"), val: T.has(key) ? T(key) : String(system).trim() });
                }

                if (!skill.damage || !(skill.damage.type > 0)) {
                    const dt = (skill.meta && skill.meta.DamageType) ||
                        (skill.note && (skill.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
                    if (dt) {
                        specs.push({ label: T("SkillsMenu.spec.label.damageCategory") || "Damage Type", val: String(dt).trim() });
                    }
                }

                // The base stat the skill wants, and what the reader brings to
                // it (window.SkillStatReq, BattleSystemEnhanced.js). Nothing is
                // barred by falling short: the skill is still learned, still
                // carried and still cast, it just comes apart more often, and
                // the odds of that are worth reading before it is taken into a
                // fight.
                const svc = window.SkillStatReq;
                const req = svc && svc.of(skill);
                if (req) {
                    specs.push({
                        label: T("SkillsMenu.spec.label.statReq"),
                        val: svc.statName(req.stat) + " " + req.points
                    });
                    // The stat the caster actually holds is only worth a row of
                    // its own when it falls short: "9 (met)" under "INT 8" says
                    // nothing the row above has not already said.
                    const stand = actor && svc.check(actor, skill);
                    if (stand && !stand.met) {
                        specs.push({
                            label: T("SkillsMenu.spec.label.statHeld"),
                            val: T("SkillsMenu.spec.statShort", {
                                value: stand.have,
                                points: stand.points,
                                percent: Math.round(stand.failChance * 100)
                            })
                        });
                        // Why the sheet and this row disagree, said once: the
                        // total on the status screen counts gear and buffs, and
                        // the floor counts neither.
                        specs.push({
                            label: T("SkillsMenu.spec.label.statCounts"),
                            val: T("SkillsMenu.spec.statBaseNote")
                        });
                    }
                }
                return specs;
            };

            // Ordinary (non-boss) enemies with a <Level:> tag, the same reference
            // tools/classes/skill_model.js swings the class balance tables against.
            // Built once and cached: the tags never change at runtime.
            let _enemyLevelIndex = null;
            const enemyLevelIndex = () => {
                if (_enemyLevelIndex) return _enemyLevelIndex;
                _enemyLevelIndex = [];
                for (const e of $dataEnemies) {
                    if (!e || !e.note) continue;
                    if (/<Boss>/i.test(e.note)) continue;
                    const m = e.note.match(/<Level:\s*(\d+)\s*>/i);
                    if (!m) continue;
                    _enemyLevelIndex.push({ id: e.id, level: parseInt(m[1], 10) });
                }
                return _enemyLevelIndex;
            };

            // The formula reads as jargon; a number the caster would actually deal
            // does not. Evaluated with the REAL engine formula evaluator against the
            // windowed median of ordinary creatures nearest the caster's own level,
            // so two skills on the sheet are directly comparable numbers.
            const medianDamageFor = (skill, actor) => {
                if (!actor || !skill || !skill.damage || !(skill.damage.type > 0)) return null;
                const formula = skill.damage.formula ? skill.damage.formula.trim() : "";
                if (!formula || formula === "0" || formula === "0.0") return null;
                const index = enemyLevelIndex();
                if (!index.length) return null;
                const level = actor.level || 1;
                const nearest = index.slice()
                    .sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level))
                    .slice(0, 9);
                let action;
                try {
                    action = new Game_Action(actor);
                    action.setSkill(skill.id);
                } catch (err) { return null; }
                const results = [];
                for (const entry of nearest) {
                    try {
                        const enemy = new Game_Enemy(entry.id, 0, 0);
                        enemy.recoverAll();
                        if (enemy.initTp) enemy.initTp();
                        const value = action.evalDamageFormula(enemy);
                        if (isFinite(value)) results.push(value);
                    } catch (err) { /* a formula reaching for something this dummy target lacks */ }
                }
                if (!results.length) return null;
                results.sort((a, b) => a - b);
                const mid = Math.floor(results.length / 2);
                const median = results.length % 2
                    ? results[mid]
                    : (results[mid - 1] + results[mid]) / 2;
                return Math.round(median);
            };

            const damageSpecsOf = (skill, actor) => {
                const specs = [];
                if (!skill || !skill.damage || !(skill.damage.type > 0)) return specs;
                const damageCategory = (skill.meta && skill.meta.DamageType) ||
                    (skill.note && (skill.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
                if (damageCategory) {
                    specs.push({ label: T("SkillsMenu.spec.label.damageCategory") || "Damage Type", val: String(damageCategory).trim() });
                }
                specs.push({ label: T("Inventory.spec.label.damageType"), val: damageTypeName(skill.damage.type) });
                if (skill.damage.elementId > 0) {
                    specs.push({ label: T("Inventory.spec.label.attackElement"), val: ($dataSystem.elements || [])[skill.damage.elementId] || T("Inventory.spec.none") });
                }
                const formula = skill.damage.formula ? skill.damage.formula.trim() : "";
                if (formula && formula !== "0" && formula !== "0.0") {
                    const median = medianDamageFor(skill, actor);
                    if (median !== null) {
                        specs.push({ label: T("SkillsMenu.spec.label.damage"), val: String(median) });
                    } else {
                        specs.push({ label: T("Inventory.spec.label.formula"), val: translateFormula(formula) });
                    }
                }
                if (skill.damage.variance > 0) specs.push({ label: T("Inventory.spec.label.variance"), val: skill.damage.variance + "%" });
                if (skill.damage.critical) specs.push({ label: T("Inventory.spec.label.canCritical"), val: T("Inventory.spec.yes") });
                return specs;
            };

            // Six lines reading "Add Debuff: <stat> 20 turns" are one fact about
            // six stats, so effects that differ only in the parameter or state
            // they name are folded into a single row, in the place the first of
            // them held.
            const effectsOf = (skill) => {
                const list = [];
                if (!skill || !skill.effects) return list;
                const groups = new Map();
                const fold = (key, name, render) => {
                    if (!name) return;
                    const group = groups.get(key);
                    if (group) {
                        if (!group.names.includes(name)) group.names.push(name);
                        list[group.slot] = render(group.names);
                        return;
                    }
                    groups.set(key, { slot: list.length, names: [name] });
                    list.push(render([name]));
                };
                skill.effects.forEach(eff => {
                    let effDesc = "";
                    const val1 = eff.value1;
                    const val2 = eff.value2;
                    const dataId = eff.dataId;
                    if (eff.code === 21 || eff.code === 22) {
                        const state = $dataStates[dataId];
                        const chance = Math.round(val1 * 100);
                        const key = eff.code === 21 ? "Inventory.effect.addState" : "Inventory.effect.removeState";
                        fold(eff.code + "|" + chance, state && state.name,
                            names => T(key, { state: names.join(", "), chance: chance }));
                        return;
                    } else if (eff.code === 31 || eff.code === 32) {
                        const key = eff.code === 31 ? "Inventory.effect.addBuff" : "Inventory.effect.addDebuff";
                        fold(eff.code + "|" + val1, paramName(dataId),
                            names => T(key, { param: names.join(", "), turns: val1 }));
                        return;
                    } else if (eff.code === 33 || eff.code === 34) {
                        const key = eff.code === 33 ? "Inventory.effect.removeBuff" : "Inventory.effect.removeDebuff";
                        fold(String(eff.code), paramName(dataId),
                            names => T(key, { param: names.join(", ") }));
                        return;
                    } else if (eff.code === 11) {
                        if (val1 !== 0 || val2 !== 0) effDesc = T("Inventory.effect.recoverHp", { amount: `${val1 > 0 ? Math.round(val1 * 100) + "%" : ""}${val1 > 0 && val2 > 0 ? " + " : ""}${val2 > 0 ? val2 : ""}` });
                    } else if (eff.code === 12) {
                        if (val1 !== 0 || val2 !== 0) effDesc = T("Inventory.effect.recoverMp", { amount: `${val1 > 0 ? Math.round(val1 * 100) + "%" : ""}${val1 > 0 && val2 > 0 ? " + " : ""}${val2 > 0 ? val2 : ""}` });
                    } else if (eff.code === 13) {
                        effDesc = T("Inventory.effect.gainAp", { n: dataId });
                    } else if (eff.code === 41) {
                        effDesc = T("Inventory.effect.growParam", { param: paramName(dataId), n: val1 });
                    }
                    if (effDesc) list.push(effDesc);
                });
                return list;
            };

            // ── Rendering ─────────────────────────────────────────────────────
            const specRows = (specs) => specs.map(spec =>
                `<div class="inspect-spec-row"><span class="inspect-spec-label">${esc(spec.label)}:</span><span class="inspect-spec-value">${esc(spec.val)}</span></div>`
            ).join("");

            const section = (title, body) => `<div class="inspect-section-title">${esc(title)}</div>${body}`;

            // The specialization a skill is practised through (window.SkillSpecs,
            // SpecializationMenu.js): which discipline it trains, how far along
            // the character reading the page is, and what that is worth on the
            // skill's own numbers. Absent for the engine basics, which belong to
            // no discipline.
            const specRowsOf = (skill, actor) => {
                const svc = window.SkillSpecs;
                const def = svc ? svc.forSkill(skill) : null;
                if (!def) return [];
                const rows = [{
                    label: T("SkillsMenu.spec.trains"),
                    val: window.Specializations.displayName(def)
                }];
                if (actor && actor.specializationLevel) {
                    const level = actor.specializationLevel(def.id);
                    rows.push({
                        label: actor.name(),
                        val: window.Specializations.levelName(level)
                    });
                    const bonus = Math.round((svc.multiplier(actor, skill) - 1) * 100);
                    if (bonus > 0) {
                        rows.push({ label: T("SkillsMenu.spec.bonus"), val: `+${bonus}%` });
                    }
                }
                return rows;
            };

            function build(skill, actor) {
                if (!skill) return "";
                const combat = combatSpecsOf(skill, actor);
                const damage = damageSpecsOf(skill, actor);
                const effects = effectsOf(skill);
                const training = specRowsOf(skill, actor);

                let html = "";

                // One section after another, in the backpack's own vocabulary
                // (.inspect-section-title / .inspect-spec-row / .inspect-bullet-item),
                // so a skill read here is laid out and inked exactly as an item
                // read on the backpack's right page.
                // Info on the left, Damage on the right: two short columns read
                // in one glance rather than one long scroll.
                if (combat.length || damage.length) {
                    const left = combat.length ? section(T("SkillsMenu.section.info"), specRows(combat)) : "";
                    const right = damage.length ? section(T("SkillsMenu.section.damage"), specRows(damage)) : "";
                    html += `<div class="skill-detail-columns"><div class="skill-detail-col">${left}</div><div class="skill-detail-col">${right}</div></div>`;
                }

                if (effects.length) {
                    html += section(T("SkillsMenu.section.skillEffects"), effects.map(desc =>
                        `<div class="inspect-bullet-item">${esc(desc)}</div>`
                    ).join(""));
                }
                if (training.length) {
                    html += section(T("SkillsMenu.section.training"), specRows(training));
                }
                // The skill's lore closes the card, under every number, the way
                // an item's does on the backpack page: flavour is read last.
                const lore = (window.ItemSystemUtils && window.ItemSystemUtils.loreFor)
                    ? window.ItemSystemUtils.loreFor(skill) : "";
                if (lore) html += section(T("SkillsMenu.section.incantation"), `<div class="inspect-flavour">${esc(lore)}</div>`);
                return html;
            }

            // The whole right-page card for a skill: header, cost gauges,
            // scrolling reading, buttons. The Skills scene and the main menu's
            // search page both draw THIS, so the two can never drift apart.
            //   opts.canvasId    id of the icon canvas the caller will paint
            //   opts.subtitle    replaces the discipline line (the search page
            //                    names the member who knows it there)
            //   opts.actionsHTML the button strip under the card
            function card(skill, actor, opts) {
                if (!skill || !actor) return "";
                const o = opts || {};
                const canvasId = o.canvasId || "inspect-canvas";
                const subtitle = o.subtitle || typeLabelOf(skill);

                // What the cast costs against what the character holds, read in
                // the meta strip the backpack prints an item's weight and price
                // in. A cost the character cannot pay is inked red where the
                // pocket money would be.
                const maxAp = actor.maxTp ? actor.maxTp() : 100;
                const gauge = (label, current, maximum, cost) => {
                    const cur = Math.floor(current);
                    const max = Math.floor(maximum);
                    const color = cost > 0
                        ? (cost <= cur ? 'var(--text-success-active)' : 'var(--text-danger-hover)')
                        : 'var(--text-text-alt-7)';
                    return `
                        <div class="inspect-meta-item">
                            <span>${esc(label)}</span>
                            <span class="inspect-meta-val" style="color:${color};">${cur} / ${max}</span>
                        </div>`;
                };
                const resourceHTML =
                    gauge(T("SkillsMenu.unit.mp"), actor.mp, actor.mmp, actor.skillMpCost(skill)) +
                    gauge(T("SkillsMenu.unit.ap"), actor.tp, maxAp, actor.skillTpCost(skill));

                // The backpack's own card, class for class (.item-inspect,
                // css/theme.css): header, meta strip, one scrolling reading,
                // buttons pinned under it. Nothing here is skill-specific
                // markup, so a skill and an item are read on the same page.
                return `
                    <div class="item-inspect">
                        <div class="inspect-header">
                            <div class="inspect-frame">
                                <canvas id="${canvasId}" class="inspect-frame-canvas" width="32" height="32"></canvas>
                            </div>
                            <div class="inspect-title-box">
                                <h3 class="inspect-name">${esc(dbText(skill.name))}</h3>
                                <div class="inspect-rarity inspect-rarity--school">${esc(subtitle)}</div>
                            </div>
                        </div>
                        <div class="inspect-meta-grid">${resourceHTML}</div>
                        <div class="inspect-lore">
                            ${skill.description ? `<div class="inspect-desc">${esc(dbText(skill.description))}</div>` : ""}
                            ${build(skill, actor)}
                        </div>
                        <div class="inspect-actions">${o.actionsHTML || ""}</div>
                    </div>`;
            }

            return {
                build,
                card,
                costTextOf,
                scaleOf,
                categoryOf,
                isBasic,
                typeLabelOf,
                translateFormula,
                combatSpecsOf,
                damageSpecsOf,
                effectsOf
            };
        })();
    }

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
                    if (e.key !== 'Tab') return;
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

    const isDummySkill = skill => !skill.name || !skill.name.trim() || skill.name.startsWith('<--');

    //=============================================================================
    // Roles ,  the one grouping a skill has
    //=============================================================================
    // Schools (<category:>) survive as flavour on the inspect page and nowhere
    // else: what a skill is FOR is what the menu sorts it by.
    // i18n-ignore-start: role bucket ids, matched against the <role:> tag; the
    // visible names come from ROLE_DATA
    const ROLE_KEYS = ['Offensive', 'Healing', 'Support'];
    // i18n-ignore-end

    // nameKey/descKey are resolved at render time by getRoleInfo.
    const ROLE_DATA = {
        Offensive: {
            nameKey: "SkillsMenu.role.offensive.name",
            descKey: "SkillsMenu.role.offensive.description",
            icon: 97
        },
        Healing: {
            nameKey: "SkillsMenu.role.healing.name",
            descKey: "SkillsMenu.role.healing.description",
            icon: 75
        },
        Support: {
            nameKey: "SkillsMenu.role.support.name",
            descKey: "SkillsMenu.role.support.description",
            icon: 80
        }
    };

    // Infer a role from a skill's mechanics when it has no <role:> tag. Mirrors
    // the offline tagger in data/Skills.json so untagged/modded skills still bucket.
    function inferSkillRole(skill) {
        const dmg = skill.damage || {};
        const dtype = dmg.type || 0;
        const scope = skill.scope || 0;
        const effects = skill.effects || [];
        const codes = effects.map(e => e.code);
        const allyScope = scope >= 7 && scope <= 11;
        const enemyScope = scope >= 1 && scope <= 6;
        const hasRecover = codes.includes(11) || codes.includes(12);
        const hasCure = codes.includes(22);
        // i18n-ignore-start: role bucket ids, see ROLE_KEYS
        if (dtype === 3 || dtype === 4) return 'Healing';
        if ((hasRecover || hasCure) && allyScope) return 'Healing';
        if (hasRecover) return 'Healing';
        if (dtype === 1 || dtype === 2 || dtype === 5 || dtype === 6) return 'Offensive';
        if (enemyScope) return 'Offensive';
        return 'Support';
        // i18n-ignore-end
    }

    function getSkillRole(skill) {
        const r = skill.meta && skill.meta.role;
        if (typeof r === 'string') {
            const key = r.trim();
            const norm = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
            if (ROLE_DATA[norm]) return norm;
        }
        return inferSkillRole(skill);
    }

    function getRoleInfo(roleKey) {
        const data = ROLE_DATA[roleKey];
        if (!data) return { name: String(roleKey || ''), description: '', icon: 160 };
        return {
            name: T.has(data.nameKey) ? T(data.nameKey) : roleKey,
            description: T.has(data.descKey) ? T(data.descKey) : '',
            icon: data.icon
        };
    }
    const getRoleDisplayName = roleKey => getRoleInfo(roleKey).name;
    const getRoleDescription = roleKey => getRoleInfo(roleKey).description;

    // What a skill takes out of the pool it is actually paid from, so cards
    // sharing a role sort cheapest first regardless of which pool that is.
    function battleSkillCost(actor, skill) {
        const tp = actor.skillTpCost(skill);
        if (tp > 0) return tp;
        return actor.skillMpCost(skill);
    }

    // Role first (Offensive/Healing/Support, ROLE_KEYS order), cost second: the
    // grouping the battle skill list is divided into and the ordering inside
    // each group.
    function battleSkillSortCompare(actor) {
        return (a, b) => {
            const roleDiff = ROLE_KEYS.indexOf(getSkillRole(a)) - ROLE_KEYS.indexOf(getSkillRole(b));
            if (roleDiff !== 0) return roleDiff;
            const costDiff = battleSkillCost(actor, a) - battleSkillCost(actor, b);
            if (costDiff !== 0) return costDiff;
            return a.name.localeCompare(b.name);
        };
    }

    //=============================================================================
    // Battle loadout ,  what a character actually carries into a fight
    //=============================================================================
    // Knowing a skill and having it to hand are two different things. At most
    // LOADOUT_MAX skills can be carried at once; everything else is known but
    // benched. Two kinds of skill are always carried and spend no slot: the
    // Basic kit (the engine's own fallback moves) and anything a weapon or a
    // state grants, which comes and goes with what is worn.
    // The carried ids live on $gameSystem, so a loadout travels with the save.
    const LOADOUT_MAX = 9;

    // Width of the battle skill page, in game pixels. The description box above
    // it matches, so a line of help text breaks where the skill names do.
    const PAGE_WIDTH = 420;

    // The explicit tag, not getSkillCategory's catch-all: an untagged skill is
    // an ordinary skill, not a member of the engine's basic kit.
    const isBasicSkill = skill => !!skill && /<category\s*:\s*Basic\s*>/i.test(skill.note || '');

    // Esoteric skills are an occult roll of their own. They are hidden from the
    // role tabs (Offensive/Healing/Support) and only surface in the Esoteric tab
    // and the "All Skills" overview.
    const isEsotericSkill = skill => !!skill && /<esoteric\b/i.test(skill.note || '');

    // The stripe down the left edge of a list card. The backpack prints an
    // item's rarity there; a skill has no rarity, so it prints the role the
    // skill answers to, which is the one thing about it that never changes.
    // One answer, shared with the row wash below: --role-* in the presets. The
    // stripe used to name a different set (danger's *ink*, which is black, the
    // body grey and the accent gold), so a card's edge and the row it sat in
    // disagreed about what kind of skill it was.
    const ROLE_STRIPE = {
        Offensive: 'var(--role-offensive)',
        Healing: 'var(--role-healing)',
        Support: 'var(--role-support)'
    };
    function skillStripeColor(skill) {
        if (!skill || isBasicSkill(skill)) return 'var(--role-basic)';
        return ROLE_STRIPE[getSkillRole(skill)] || 'var(--role-basic)';
    }

    // A skill a body part or an installed augment grants is carried the way a
    // weapon's is: the anatomy teaches it, so it spends no loadout slot and
    // cannot be benched. It is learned rather than added, which is why it needs
    // asking for by name here. Losing the part is what takes it away, and only
    // Blood and Oil severs a part; on every other difficulty a ruined limb is
    // broken, not gone, and keeps its moves.
    // Asked once per skill row and once per carried id, so the answer is held
    // for the frame rather than walking every body part each time.
    const _anatomyCache = new WeakMap();
    function anatomySkillSet(actor) {
        const api = window.HealthCore;
        if (!api || !api.anatomySkillIds) return null;
        const frame = (typeof Graphics !== 'undefined' && Graphics.frameCount) || 0;
        const hit = _anatomyCache.get(actor);
        if (hit && hit.frame === frame) return hit.ids;
        const ids = api.anatomySkillIds(actor);
        _anatomyCache.set(actor, { frame, ids });
        return ids;
    }

    function isAnatomySkill(actor, skill) {
        if (!actor || !skill) return false;
        const ids = anatomySkillSet(actor);
        return !!ids && ids.has(skill.id);
    }

    function isAlwaysCarried(actor, skill) {
        if (!skill) return false;
        if (isBasicSkill(skill)) return true;
        if (!actor) return false;
        if (isAnatomySkill(actor, skill)) return true;
        return !actor.isLearnedSkill(skill.id) && actor.addedSkills().includes(skill.id);
    }

    function loadoutStore() {
        if (!$gameSystem._activeBattleSkills) $gameSystem._activeBattleSkills = {};
        return $gameSystem._activeBattleSkills;
    }

    // The raw carried list, in the order the skills were taken up. A character
    // who has never had one (an old save, or one built before this ran) is
    // seeded with the first LOADOUT_MAX skills they know, so nobody walks into
    // a fight with empty hands.
    function loadoutIds(actor) {
        if (!actor || typeof $gameSystem === 'undefined' || !$gameSystem) return [];
        const store = loadoutStore();
        const id = actor.actorId();
        if (!Array.isArray(store[id])) store[id] = seedLoadout(actor);
        return store[id];
    }

    function seedLoadout(actor) {
        const picked = [];
        for (const skill of actor.skills()) {
            if (!skill || isDummySkill(skill) || isAlwaysCarried(actor, skill)) continue;
            if (picked.length >= LOADOUT_MAX) break;
            picked.push(skill.id);
        }
        return picked;
    }

    // Presets ,  filling the carried row without picking nine skills by hand
    //-------------------------------------------------------------------------
    // What a character would take into a fight if they thought about it: four
    // ways to hurt something, two to bend the fight, three to stay standing, in
    // that order along the row. Anything always carried is left out, since it
    // spends no slot.
    const PRESET_PLAN = [
        // i18n-ignore-start: role bucket ids, see ROLE_KEYS
        { role: 'Offensive', slots: 4 },
        { role: 'Support', slots: 2 },
        { role: 'Healing', slots: 3 }
        // i18n-ignore-end
    ];

    // A skill whose <StatReq:> floor the character is under cannot be synced at
    // all: window.SkillStatReq is the one answer, so the card, the presets and
    // the keyboard all refuse the same skills.
    function isStatLocked(actor, skill) {
        if (!actor || !skill) return false;
        const svc = window.SkillStatReq;
        const stand = svc && svc.check(actor, skill);
        return !!(stand && !stand.met);
    }

    function presetCandidates(actor) {
        if (!actor) return [];
        const seen = new Set();
        return actor.skills().filter(skill => {
            if (!skill || isDummySkill(skill) || isAlwaysCarried(actor, skill)) return false;
            if (isStatLocked(actor, skill)) return false;
            if (seen.has(skill.id)) return false;
            seen.add(skill.id);
            return true;
        });
    }

    // What a skill DOES, as one number. A damaging or healing formula is rolled
    // with the engine's own evaluator against the caster themself, so the answer
    // is in the character's real numbers; everything else is priced off max HP,
    // which keeps a buff and a heal in the same units.
    function skillPower(actor, skill) {
        const dmg = skill.damage || {};
        const formula = dmg.formula ? String(dmg.formula).trim() : '';
        const repeats = Math.max(1, skill.repeats || 1);
        // Something that lands on the whole enemy party is worth more than the
        // same numbers on one target.
        const sweep = [2, 8, 10].includes(skill.scope) ? 1.5 : 1;
        if (dmg.type > 0 && formula && formula !== '0' && formula !== '0.0') {
            try {
                const action = new Game_Action(actor);
                action.setSkill(skill.id);
                // Signed for a heal, so the size of the effect is the magnitude.
                const value = Math.abs(action.evalDamageFormula(actor));
                if (isFinite(value) && value > 0) return value * repeats * sweep;
            } catch (err) { /* a formula reaching for a fight this menu has not got */ }
        }
        const mhp = Math.max(1, actor.mhp);
        let power = 0;
        for (const eff of skill.effects || []) {
            if (!eff) continue;
            const chance = eff.code === 21 ? Math.min(1, eff.value1 || 0) : 1;
            switch (eff.code) {
                case 11: power += (eff.value1 || 0) * mhp + (eff.value2 || 0); break;
                case 12: power += ((eff.value1 || 0) * Math.max(1, actor.mmp) + (eff.value2 || 0)) * 0.5; break;
                case 13: power += (eff.value1 || 0) * 3; break;
                case 21: power += 0.25 * mhp * chance; break;
                case 22: power += 0.15 * mhp; break;
                case 31: case 32: power += 0.12 * mhp * Math.min(2, (eff.value1 || 5) / 5); break;
                case 33: case 34: power += 0.08 * mhp; break;
                case 41: case 42: case 43: power += 0.2 * mhp; break;
                case 44: power += 0.1 * mhp; break;
                default: break;
            }
        }
        return power * repeats * sweep;
    }

    // What it is worth carrying: what it does, against what a cast takes out of
    // the pools it is paid from. A cheap move that can be thrown all fight beats
    // an expensive one that lands once, and one the character could never pay
    // for at full MP is all but struck off.
    function skillValue(actor, skill) {
        const power = skillPower(actor, skill);
        if (power <= 0) return 0;
        const mpCost = actor.skillMpCost(skill);
        const tpCost = actor.skillTpCost(skill);
        const maxMp = Math.max(1, actor.mmp);
        const maxAp = Math.max(1, actor.maxTp ? actor.maxTp() : 100);
        const load = mpCost / maxMp + tpCost / maxAp;
        const value = power / (1 + 2 * load);
        return mpCost > maxMp ? value * 0.05 : value;
    }

    function bestLoadoutIds(actor) {
        const byRole = { Offensive: [], Healing: [], Support: [] };
        for (const skill of presetCandidates(actor)) {
            const roll = byRole[getSkillRole(skill)] || byRole.Support;
            roll.push({ skill, score: skillValue(actor, skill) });
        }
        // The ranking inside a roll is what the plan asks for, so each roll is
        // sorted on its own. Scoring every entry against its own roll's best
        // then gives the one number leftovers from different roles can be
        // ordered by when a role comes up short and its slots need filling.
        for (const role of Object.keys(byRole)) {
            const roll = byRole[role];
            roll.sort((a, b) => b.score - a.score);
            const top = roll.length ? roll[0].score : 0;
            roll.forEach(entry => { entry.norm = top > 0 ? entry.score / top : 0; });
        }
        const picked = [];
        const rest = [];
        for (const step of PRESET_PLAN) {
            const roll = byRole[step.role] || [];
            for (const entry of roll.slice(0, step.slots)) picked.push(entry.skill.id);
            for (const entry of roll.slice(step.slots)) rest.push(entry);
        }
        rest.sort((a, b) => b.norm - a.norm);
        for (const entry of rest) {
            if (picked.length >= LOADOUT_MAX) break;
            picked.push(entry.skill.id);
        }
        return picked.slice(0, LOADOUT_MAX);
    }

    // The row a character packs when they are not thinking it through: the
    // same role plan as the best row, but each slot drawn out of that role's
    // whole spread weighted by what the skill is worth, so a character who has
    // gone on learning past their first spells actually carries some of the
    // later ones instead of the same opening kit every time.
    function assortedLoadoutIds(actor) {
        const byRole = { Offensive: [], Healing: [], Support: [] };
        for (const skill of presetCandidates(actor)) {
            const roll = byRole[getSkillRole(skill)] || byRole.Support;
            roll.push({ skill, score: skillValue(actor, skill) });
        }
        // A skill worth nothing on paper is still worth carrying now and then,
        // so every entry keeps a floor of a weight rather than being struck off.
        const draw = (roll) => {
            const total = roll.reduce((sum, e) => sum + Math.max(0.05, e.score), 0);
            let roll_ = Math.random() * total;
            for (let i = 0; i < roll.length; i++) {
                roll_ -= Math.max(0.05, roll[i].score);
                if (roll_ <= 0) return roll.splice(i, 1)[0];
            }
            return roll.pop();
        };
        const picked = [];
        const rest = [];
        for (const step of PRESET_PLAN) {
            const roll = (byRole[step.role] || []).slice();
            for (let i = 0; i < step.slots && roll.length; i++) picked.push(draw(roll).skill.id);
            rest.push(...roll);
        }
        while (picked.length < LOADOUT_MAX && rest.length) picked.push(draw(rest).skill.id);
        return picked.slice(0, LOADOUT_MAX);
    }

    function randomLoadoutIds(actor) {
        const pool = presetCandidates(actor).map(skill => skill.id);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, LOADOUT_MAX);
    }

    const BattleLoadout = {
        MAX: LOADOUT_MAX,

        isAlwaysCarried: isAlwaysCarried,
        isBasic: isBasicSkill,
        isStatLocked: isStatLocked,

        // Carried ids the character still knows, in carry order. An always
        // carried skill is dropped from the count even when an older save has
        // it stored here, since it no longer costs a slot.
        ids(actor) {
            if (!actor) return [];
            const known = new Set(actor.skills().map(s => s.id));
            return loadoutIds(actor).filter(id => {
                const skill = $dataSkills[id];
                // A stat floor the character has fallen under (a graft removed,
                // an augment pulled) puts the skill down on its own: what was
                // carried when the sheet was higher is not carried now.
                return skill && !isDummySkill(skill) && known.has(id) &&
                    !isAlwaysCarried(actor, skill) && !isStatLocked(actor, skill);
            });
        },

        isActive(actor, skill) {
            if (!actor || !skill) return false;
            if (isAlwaysCarried(actor, skill)) return true;
            if (isStatLocked(actor, skill)) return false;
            return loadoutIds(actor).includes(skill.id);
        },

        count(actor) {
            return this.ids(actor).length;
        },

        hasRoom(actor) {
            return this.count(actor) < LOADOUT_MAX;
        },

        // 'locked' , always carried, there is nothing to decide. 'full' , the
        // loadout is already at capacity. Otherwise 'on' / 'off'.
        toggle(actor, skill) {
            if (!actor || !skill) return 'locked';
            if (isAlwaysCarried(actor, skill)) return 'locked';
            const list = loadoutIds(actor);
            const i = list.indexOf(skill.id);
            if (i >= 0) {
                list.splice(i, 1);
                return 'off';
            }
            if (isStatLocked(actor, skill)) return 'statlocked';
            if (list.length >= LOADOUT_MAX) return 'full';
            list.push(skill.id);
            return 'on';
        },

        // Put a skill in a named slot of the carried row, the way a number key
        // drops an item into a backpack quick slot: whatever held that slot is
        // put down, and a slot past the end of what is carried means the first
        // free one. 'same' , it already stood there.
        setSlot(actor, index, skill) {
            if (!actor || !skill) return 'locked';
            if (isAlwaysCarried(actor, skill)) return 'locked';
            if (isStatLocked(actor, skill)) return 'statlocked';
            if (index < 0 || index >= LOADOUT_MAX) return 'locked';
            // The row shows this.ids(), not the raw stored list, so the slot the
            // player counted along is an index into the filtered view.
            const view = this.ids(actor);
            const at = view.indexOf(skill.id);
            if (at === index) return 'same';
            if (at >= 0) {
                // Already carried: this is a reordering, so nothing is put down.
                view.splice(at, 1);
                view.splice(Math.min(index, view.length), 0, skill.id);
            } else if (index < view.length) {
                // A new skill takes the slot, and whatever held it is benched.
                view[index] = skill.id;
            } else {
                // Past the end of what is carried: the first free slot.
                view.push(skill.id);
            }
            loadoutStore()[actor.actorId()] = view;
            return 'on';
        },

        // A freshly learned skill is taken up at once while the loadout has
        // room; past that it is learned and left on the bench.
        autoActivate(actor, skillId) {
            const skill = $dataSkills[skillId];
            if (!actor || !skill || isDummySkill(skill)) return false;
            if (isAlwaysCarried(actor, skill)) return false;
            if (isStatLocked(actor, skill)) return false;
            const list = loadoutIds(actor);
            if (list.includes(skillId)) return false;
            if (list.length >= LOADOUT_MAX) return false;
            list.push(skillId);
            return true;
        },

        // Put down everything carried and take up this row instead. The ids are
        // stored in the order given, since that order is what the row shows.
        setAll(actor, ids) {
            if (!actor) return [];
            const list = (ids || []).slice(0, LOADOUT_MAX);
            loadoutStore()[actor.actorId()] = list;
            return list;
        },

        // The row a character would pack for themself: see PRESET_PLAN.
        best(actor) {
            return actor ? this.setAll(actor, bestLoadoutIds(actor)) : [];
        },

        // The role plan of the best row, filled by weighted draw: a character
        // who knows more than nine skills packs a different nine each time.
        assorted(actor) {
            return actor ? this.setAll(actor, assortedLoadoutIds(actor)) : [];
        },

        // Nine of whatever they know, drawn out of the hat.
        randomize(actor) {
            return actor ? this.setAll(actor, randomLoadoutIds(actor)) : [];
        },

        drop(actor, skillId) {
            const list = loadoutIds(actor);
            const i = list.indexOf(skillId);
            if (i >= 0) list.splice(i, 1);
        },

        // What a battle menu shows for one skill type: that type's carried
        // skills, by name. The Basic kit has its own command and stays out.
        battleSkills(actor, stypeId) {
            if (!actor) return [];
            return actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && !isBasicSkill(skill) &&
                    (!stypeId || skill.stypeId === stypeId) && this.isActive(actor, skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
    };
    window.BattleLoadout = BattleLoadout;

    const _Game_Actor_learnSkill = Game_Actor.prototype.learnSkill;
    Game_Actor.prototype.learnSkill = function (skillId) {
        const knew = this.isLearnedSkill(skillId);
        _Game_Actor_learnSkill.call(this, skillId);
        if (!knew && this.isLearnedSkill(skillId)) BattleLoadout.autoActivate(this, skillId);
    };

    const _Game_Actor_forgetSkill = Game_Actor.prototype.forgetSkill;
    Game_Actor.prototype.forgetSkill = function (skillId) {
        _Game_Actor_forgetSkill.call(this, skillId);
        BattleLoadout.drop(this, skillId);
    };

    let _statsI18n = null;

    const _loadStatsI18n = async () => {
        const lang = ConfigManager.language || 'en';
        const url = `js/i18n/${lang}/stats.json`;
        try {
            const response = await fetch(url);
            _statsI18n = await response.json();
        } catch (e) {
            console.error('CategorizedBattleSkills: Failed to load i18n data from ' + url, e);
        }
    };

    const _si18n = (key) => {
        if (_statsI18n && _statsI18n[key]) {
            return _statsI18n[key];
        }
        return key;
    };

    _loadStatsI18n();

    //=============================================================================
    // BattleSkillMixin (used by Window_BattleSkill)
    //=============================================================================

    const BattleSkillMixin = {
        handleCursorMove: function () {
            const isP2 = window.$gameSplitScreen && window.$gameSplitScreen.active &&
                this._actor && this._actor.multiplayerPlayerId && this._actor.multiplayerPlayerId() === 2;
            const input = isP2 ? window.$gameSplitScreen : Input;

            if (input.isRepeated("down")) {
                if (this.index() >= this.maxItems() - 1) {
                    this.select(0);
                    this.playCursorSound();
                } else {
                    this.cursorDown(input.isTriggered("down"));
                }
            } else if (input.isRepeated("up")) {
                if (this.index() <= 0) {
                    this.select(this.maxItems() - 1);
                    this.playCursorSound();
                } else {
                    this.cursorUp(input.isTriggered("up"));
                }
            } else if (input.isRepeated("right")) {
                this.cursorRight(input.isTriggered("right"));
            } else if (input.isRepeated("left")) {
                this.cursorLeft(input.isTriggered("left"));
            } else {
                if (!this.isHandled("pagedown") && input.isRepeated("pagedown")) this.cursorPagedown();
                if (!this.isHandled("pageup") && input.isRepeated("pageup")) this.cursorPageup();
            }
        }
    };

    //=============================================================================
    // Window_BattleSkill ,  the carried skills of one skill type, by name
    // NOTE: This section must come before Window_SkillList overrides so that
    // prototype captures (maxCols, setActor, processOk, etc.) grab the base
    // RPG Maker versions, not our menu overrides.
    //=============================================================================

    // -------------------------------------------------------------------------
    // HTML Battle Skill Overlay ,  parchment overlay matching DialogueSystem
    // -------------------------------------------------------------------------
    // getBoundingClientRect() forces a synchronous layout, so cache the canvas
    // rect and only recompute it when the window is resized. Calling this every
    // frame from the skill-menu update() was a needless reflow per frame.
    let _cachedMsgScale = null;
    window.addEventListener('resize', () => { _cachedMsgScale = null; });

    function _msgGetScale() {
        if (_cachedMsgScale) return _cachedMsgScale;
        const el = document.getElementById('gameCanvas');
        if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
        const r = el.getBoundingClientRect();
        _cachedMsgScale = {
            sx: r.width / Graphics.width,
            sy: r.height / Graphics.height,
            ox: r.left,
            oy: r.top
        };
        return _cachedMsgScale;
    }

    function getIconStyle(iconIndex) {
        const x = (iconIndex % 16) * 32;
        const y = Math.floor(iconIndex / 16) * 32;
        return `background: url('img/system/IconSet.png') -${x}px -${y}px no-repeat; width: 32px; height: 32px; display: inline-block; vertical-align: middle; image-rendering: pixelated; transform: scale(0.75); margin-right: 4px;`;
    }

    // What a row is FOR is painted onto the row rather than written over a
    // group of them: the list is sorted by role anyway, so the colour bands
    // read as the grouping the headers used to spell out, and the page loses
    // three lines of shouting text. The palette is the battle command menu's
    // (BattleSystemEnhanchedCommands.js): attack red, heal green, support
    // blue, and the engine's own basic kit in its teal, so a skill row and a
    // command row of the same colour mean the same kind of thing.
    // The accent is the shared --role-* ink; the rgb triple is the darker base
    // the row's gradient washes from, which has to be numbers because it is
    // mixed per row rather than named.
    const ROLE_ROW_COLORS = {
        Offensive: { accent: 'var(--role-offensive)', rgb: [180, 25,  25 ] },
        Healing:   { accent: 'var(--role-healing)',   rgb: [25,  140, 80 ] },
        Support:   { accent: 'var(--role-support)',   rgb: [25,  80,  180] },
    };
    const BASIC_ROW_COLORS = { accent: 'var(--role-basic)', rgb: [40, 120, 150] };

    function skillRowColors(skill) {
        if (!skill || isBasicSkill(skill)) return BASIC_ROW_COLORS;
        return ROLE_ROW_COLORS[getSkillRole(skill)] || BASIC_ROW_COLORS;
    }

    // The whole look of one row, lit or not: the same dark base under the same
    // left-to-right colour wash the command rows carry, brightened when the
    // cursor is on it. Called from the builder and again from update() as the
    // cursor moves, so both states come out of one place.
    function paintSkillRow(el, skill, selected) {
        const { accent } = skillRowColors(skill);
        el.style.backgroundColor = selected
            ? 'var(--actorcmd-bg-sel)' : 'var(--actorcmd-bg)';
        el.style.backgroundImage = 'var(--actorcmd-bg-image, none)';
        el.style.color = selected
            ? 'var(--actorcmd-ink-sel)' : 'var(--actorcmd-ink)';
        el.style.borderColor = selected
            ? 'var(--actorcmd-border-sel)' : 'var(--actorcmd-border)';
        el.style.borderLeft = (selected ? '6px' : '4px') + ' solid ' + accent;
        el.style.boxShadow = selected ? '0 0 6px 1px ' + accent : 'none';
    }

    // ── The battle list page geometry (idempotent across plugins) ─────────────
    // The skill page, the item page (BattleSystemEnhancedHUD) and the
    // description box that sits on top of them are three panels that have to
    // agree: whichever list is open publishes the corner it occupies, in game
    // pixels, and the description box reads it. Without this the box is placed
    // against a size the page no longer has and drifts away from what it
    // describes.
    if (!window.BattleListPage) {
        window.BattleListPage = {
            MARGIN: 20,   // from the screen's right and bottom edges
            GAP: 10,      // between the description box and the page below it
            // Both pages hang from one top edge instead of standing on the
            // bottom one. They are not the same height , the item page is a
            // fixed roll, the skill page shrinks to the loadout it shows , so
            // bottom-anchored they started at two different lines and the
            // panel jumped every time the player switched between them.
            TOP: 184,
            width: 420,
            height: 460,
            // How tall a page may be before it runs into the bottom margin.
            maxHeight() {
                return Graphics.height - this.TOP - this.MARGIN;
            },
            set(width, height) {
                this.width = width;
                this.height = height;
            },
            // The pages stand on the same side as the command list they
            // replace (Options > Command Position, left by default), so the
            // skill page, the backpack and the description box all open there.
            onRight() {
                return !!(window.BattleCommandSide && window.BattleCommandSide.onRight());
            },
            // Left edge, in screen pixels, for a page of this scaled width.
            leftPx(scaledW, sc) {
                return this.onRight()
                    ? sc.ox + (Graphics.width * sc.sx) - scaledW - (this.MARGIN * sc.sx)
                    : sc.ox + (this.MARGIN * sc.sx);
            }
        };
    }

    const _Window_BattleSkill_initialize = Window_BattleSkill.prototype.initialize;
    Window_BattleSkill.prototype.initialize = function (rect) {
        _Window_BattleSkill_initialize.call(this, rect);
        this._basicMode = false;

        // Remove old overlay if any
        const old = document.getElementById('html-battle-skill-overlay');
        if (old) old.remove();

        const root = document.createElement('div');
        root.id = 'html-battle-skill-overlay';
        // i18n-ignore-start: a CSS declaration list, split over several lines
        root.style.cssText =
            'position:fixed;z-index:501;pointer-events:none;' +
            'box-sizing:border-box;overflow-y:auto;display:grid;' +
            'background:var(--shadow-black-translucent-75);' +
            'border:3px solid var(--border-subtle);border-radius:6px;' +
            'outline:1px solid var(--border-subtle-translucent-40);outline-offset:-7px;' +
            'background-image:radial-gradient(ellipse at center,' +
            'transparent 40%,var(--bg-brown-vignette-10) 100%);' +
            'padding:16px 12px;' +
            'transform:translateX(115%);opacity:0;' +
            'transition:transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease;';
        // i18n-ignore-end

        // Right click to cancel / back out. While the panel has been handed
        // over to _buildActorTargetItems (an ally-scoped skill asking who it
        // lands on, see the Window_BattleActor hooks below), the live window is
        // _actorTargetWindow rather than this skill list itself.
        root.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const win = this._actorTargetWindow || this;
            if (win.active && typeof win.processCancel === 'function') {
                win.processCancel();
            }
        });

        // Delegated pointer handling on the persistent root. Per-row listeners
        // were attached inside _buildSkillItems(), which rebuilds the rows on
        // every refresh(); a refresh landing between a row's mousedown and its
        // mouseup stranded the old listener and the 'click' silently dropped.
        // Delegating on the root (which never gets rebuilt) and activating on
        // pointerup makes every click register regardless of rebuild timing.
        const rowIdxFromEvent = (e) => {
            const el = e.target && e.target.closest && e.target.closest('[data-idx]');
            if (!el || !root.contains(el)) return -1;
            const i = parseInt(el.dataset.idx, 10);
            return isNaN(i) ? -1 : i;
        };
        root.addEventListener('mouseover', (e) => {
            const win = this._actorTargetWindow || this;
            if (!win.active) return;
            const i = rowIdxFromEvent(e);
            // Only select on an actual index change. 'mouseover' bubbles and
            // re-fires on every child boundary crossed inside the same row (the
            // name span, the HP span, the row itself), and while the ally-target
            // hand-over is active, select() rebuilds the whole row list
            // (_buildActorTargetItems). Rebuilding on every micro-movement tore
            // the row out from under the pointer mid-hover, so a click landing
            // right after a rebuild could miss: the element the gesture started
            // on was gone before pointerup re-hit-tested.
            if (i >= 0 && win.index() !== i && typeof win.select === 'function') win.select(i);
        });
        root.addEventListener('pointerup', (e) => {
            if (e.button !== undefined && e.button !== 0) return; // left button only
            const win = this._actorTargetWindow || this;
            if (!win.active) return;
            const i = rowIdxFromEvent(e);
            if (i < 0) return;
            if (typeof win.select === 'function') win.select(i);
            if (typeof win.processOk === 'function') win.processOk();
        });

        this._htmlSkillRoot = root;
        document.body.appendChild(root);

        root.addEventListener("wheel", (e) => {
            e.preventDefault();
            root.scrollTop += e.deltaY;
        }, { passive: false });
    };

    // Keep the window logically active/visible to the engine for keyboard/controller input,
    // but prevent PIXI from drawing its canvas graphics.
    Window_BattleSkill.prototype.render = function (renderer) {
        // Prevent PIXI rendering
    };

    Window_BattleSkill.prototype._render = function (renderer) {
        // Prevent PIXI rendering
    };

    const _Window_BattleSkill_destroy = Window_BattleSkill.prototype.destroy || Window_Selectable.prototype.destroy;
    Window_BattleSkill.prototype.destroy = function (options) {
        if (this._htmlSkillRoot && this._htmlSkillRoot.parentNode) {
            this._htmlSkillRoot.parentNode.removeChild(this._htmlSkillRoot);
        }
        this._htmlSkillRoot = null;
        if (_Window_BattleSkill_destroy) _Window_BattleSkill_destroy.call(this, options);
    };

    const _Window_BattleSkill_show = Window_BattleSkill.prototype.show;
    Window_BattleSkill.prototype.show = function () {
        this.refresh();
        _Window_BattleSkill_show.call(this);
        this.select(0);
        if (this._htmlSkillRoot) {
            this._buildSkillItems();
            setTimeout(() => {
                if (this._htmlSkillRoot && this.visible) {
                    this._htmlSkillRoot.style.transform = 'translateX(0)';
                    this._htmlSkillRoot.style.opacity = '1';
                    this._htmlSkillRoot.style.pointerEvents = 'auto';
                }
            }, 0);
        }
    };

    const _Window_BattleSkill_hide = Window_BattleSkill.prototype.hide;
    Window_BattleSkill.prototype.hide = function () {
        _Window_BattleSkill_hide.call(this);
        if (this._htmlSkillRoot) {
            this._htmlSkillRoot.style.transform = 'translateX(115%)';
            this._htmlSkillRoot.style.opacity = '0';
            this._htmlSkillRoot.style.pointerEvents = 'none';
        }
    };

    const _Window_BattleSkill_refresh = Window_BattleSkill.prototype.refresh;
    Window_BattleSkill.prototype.refresh = function () {
        _Window_BattleSkill_refresh.call(this);
        if (!this._htmlSkillRoot) return;
        // An MP/TP tick (Window_SkillList's own watcher, inherited into this
        // window's update loop) calls refresh() on whatever timer fires it,
        // including while an ally-scoped skill has handed this panel over to
        // _buildActorTargetItems. Rebuilding the ordinary skill list here threw
        // that hand-over away mid-pick: _actorTargetWindow went null, so the
        // delegated click handler fell back to this (inactive) window and every
        // mouse click on a party row silently did nothing, while OK/gamepad
        // input kept working because it talks to Window_BattleActor directly.
        if (this._actorTargetWindow && this._actorTargetWindow.active) {
            this._buildActorTargetItems(this._actorTargetWindow);
        } else {
            this._buildSkillItems();
        }
    };

    // Force single column layout to match narrow portrait page shape
    Window_BattleSkill.prototype.maxCols = function () {
        return 1;
    };

    Window_BattleSkill.prototype.processTouch = function () {
        // Disable standard touch inputs to prevent conflict with custom HTML overlay events
    };

    // The Basic command shows the engine's own kit across every skill type;
    // every other command shows that type's carried skills.
    Window_BattleSkill.prototype.makeItemList = function () {
        if (!this._actor) {
            this._data = [];
            return;
        }
        if (this._basicMode) {
            this._data = this._actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && isBasicSkill(skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        } else {
            this._data = BattleLoadout.battleSkills(this._actor, this._stypeId)
                .sort(battleSkillSortCompare(this._actor));
        }
    };

    // Enables/disables the cross-type "Basic" skill view used by the Basic battle command.
    Window_BattleSkill.prototype.setBasicMode = function (flag) {
        this._basicMode = !!flag;
    };

    Window_BattleSkill.prototype.drawItem = function (index) {
        const skill = this.itemAt(index);
        if (!skill) return;
        const rect = this.itemLineRect(index);
        // A skill the actor cannot pay for is drawn faded, the same answer the
        // HTML row gives, so the canvas fallback never reads as selectable when
        // the row it mirrors is locked.
        this.changePaintOpacity(this.isEnabled(skill));
        this.drawItemName(skill, rect.x, rect.y, rect.width - this.costWidth());
        this.drawSkillCost(skill, rect.x, rect.y, rect.width);
        this.changePaintOpacity(1);
    };

    // These shadow the Window_SkillList overrides installed further down (which
    // serve the menu scene); the battle list wants the base RPG Maker rule.
    // A carried skill the actor cannot afford right now is a locked row: it can
    // still be browsed and read, but Window_SkillList.isCurrentItemEnabled sends
    // OK on it to playBuzzerSound(), so nothing is chosen, no action is set and
    // the turn is not spent.
    Window_BattleSkill.prototype.isEnabled = function (item) {
        return !!(item && this._actor && this._actor.canUse(item));
    };

    const _Window_BattleSkill_processOk = Window_BattleSkill.prototype.processOk;
    Window_BattleSkill.prototype.processOk = function () {
        _Window_BattleSkill_processOk.call(this);
        TouchInput.clear();
    };

    const _Window_BattleSkill_processCancel = Window_BattleSkill.prototype.processCancel;
    Window_BattleSkill.prototype.processCancel = function () {
        _Window_BattleSkill_processCancel.call(this);
    };

    Window_BattleSkill.prototype.processCursorMove = function () {
        if (this.isCursorMovable()) {
            BattleSkillMixin.handleCursorMove.call(this);
        }
    };

    // Builds the battle help/description text for a skill, appending its element
    // (icon + name) so the player sees it in the description box. The MP/AP cost is
    // intentionally omitted here, it is already shown on each skill list entry.
    function buildBattleSkillHelpText(skill, actor) {
        let text = skill.description || '';
        if (skill.damage && skill.damage.elementId > 0 &&
            $dataSystem.elements && $dataSystem.elements[skill.damage.elementId]) {
            const iconIndex = 63 + skill.damage.elementId - 1;
            text += (text ? '\n' : '') +
                '\\I[' + iconIndex + ']' + $dataSystem.elements[skill.damage.elementId];
        }
        // What this battler is short of, spelled out under the description:
        // the row's red chip says WHICH stat, this says how badly it will tell.
        const svc = window.SkillStatReq;
        const stand = svc && actor ? svc.check(actor, skill) : null;
        if (stand && !stand.met) {
            text += (text ? '\n' : '') + T('SkillsMenu.spec.label.statReq') + ': ' +
                svc.statName(stand.stat) + ' ' + stand.points + '. ' +
                T('SkillsMenu.spec.statShort', {
                    value: stand.have, points: stand.points, percent: Math.round(stand.failChance * 100)
                }) + ' ' + T('SkillsMenu.spec.statBaseNote');
        }
        return text;
    }

    const _Window_BattleSkill_updateHelp = Window_BattleSkill.prototype.updateHelp;
    Window_BattleSkill.prototype.updateHelp = function () {
        const skill = this.item();
        if (skill) {
            this.setHelpWindowText(buildBattleSkillHelpText(skill, this._actor));
        } else {
            _Window_BattleSkill_updateHelp.call(this);
        }
    };

    Window_BattleSkill.prototype.setHelpWindowText = function (text) {
        if (this._helpWindow) this._helpWindow.setText(text);
    };

    Window_BattleSkill.prototype._buildSkillItems = function () {
        const root = this._htmlSkillRoot;
        if (!root) return;
        // Leaving the ally-target hand-over (see _buildActorTargetItems) back
        // to an ordinary skill list; the delegated pointer handlers read this
        // to know which window a click should land on.
        this._actorTargetWindow = null;
        // Rows are recreated unlit, so force update() to re-apply the selection
        // highlight and the font size on its next pass. The page is
        // sized off the rows, so the layout pass has to run again too: a list
        // that shed or gained entries is a page of a different height.
        this._lastSkillIdx = null;
        this._prevSkillHiIdx = null;
        this._lastSkillSy = null;
        root.innerHTML = '';

        root.style.display = 'grid';
        root.style.gridTemplateColumns = '1fr';
        root.style.gridGap = '6px 12px';
        root.style.alignContent = 'start';

        const sc = _msgGetScale();
        const baseFontSize = (typeof this.standardFontSize === 'function')
            ? this.standardFontSize() : 24;
        const scaledFont = Math.round(baseFontSize * sc.sy * 0.85);

        const items = this._data || [];

        // The list is sorted by role and coloured by it (paintSkillRow); there
        // are no group headers, so every line on the page is a line the player
        // can pick.
        this._htmlSkillEls = items.map((item, i) => {
            const el = document.createElement('div');
            el.dataset.idx = i;
            el.style.cssText =
                'font-family:var(--font-ui);font-weight:bold;color:var(--text-pure-white);' +
                'padding:6px 12px;border-radius:3px;cursor:pointer;' +
                'border:2px solid transparent;transition:background 0.1s, border-color 0.1s;' +
                'display:flex;align-items:center;justify-content:space-between;' +
                'user-select:none;box-sizing:border-box;min-height:40px;overflow:hidden;';
            el.style.fontSize = scaledFont + 'px';
            paintSkillRow(el, item, false);

            const leftDiv = document.createElement('div');
            leftDiv.style.cssText = 'display:flex;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

            const skill = item;
            const isEnabled = this._actor ? this._actor.canUse(skill) : false;

            const iconSpan = document.createElement('span');
            iconSpan.style.cssText = getIconStyle(skill.iconIndex);
            leftDiv.appendChild(iconSpan);

            const nameSpan = document.createElement('span');
            nameSpan.textContent = dbText(skill.name);
            leftDiv.appendChild(nameSpan);
            el.appendChild(leftDiv);

            const rightDiv = document.createElement('div');
            rightDiv.style.cssText = 'display:flex;align-items:center;font-size:85%;';

            // The stat floor this battler is UNDER, at the moment it matters
            // most. Nothing here refuses the pick: the skill is still cast, it
            // is just this likely to come apart on the way out
            // (BattleSystemEnhancedMechanics rolls it).
            const statSvc = window.SkillStatReq;
            const stand = statSvc && this._actor ? statSvc.check(this._actor, skill) : null;
            if (stand && !stand.met) {
                const reqSpan = document.createElement('span');
                reqSpan.style.cssText = 'color:var(--text-danger-dark);font-weight:bold;margin-left:8px;';
                reqSpan.textContent = statSvc.standingLabel(this._actor, skill);
                reqSpan.title = T('SkillsMenu.spec.statShort', {
                    value: stand.have, points: stand.points, percent: Math.round(stand.failChance * 100)
                });
                rightDiv.appendChild(reqSpan);
            }

            if (this._actor) {
                const tpCost = this._actor.skillTpCost(skill);
                const mpCost = this._actor.skillMpCost(skill);
                const costText = tpCost > 0 ? tpCost + ' AP' : (mpCost > 0 ? mpCost + ' MP' : '');
                if (costText) {
                    const costSpan = document.createElement('span');
                    costSpan.style.color = 'var(--text-primary-hover)';
                    costSpan.style.fontWeight = 'bold';
                    costSpan.style.marginLeft = '8px';
                    costSpan.textContent = costText;
                    rightDiv.appendChild(costSpan);
                }
            }
            el.appendChild(rightDiv);

            if (!isEnabled) {
                el.style.opacity = '0.4';
            }

            // Pointer handling is delegated on the persistent root (see
            // Window_BattleSkill.initialize); the data-idx attribute set above is
            // all the delegation needs, so no per-row listeners are attached here.
            root.appendChild(el);
            return el;
        });
    };

    const _Window_BattleSkill_update = Window_BattleSkill.prototype.update;
    Window_BattleSkill.prototype.update = function () {
        _Window_BattleSkill_update.call(this);

        if (!this._htmlSkillRoot) return;

        // Hide overlay if the window is closed or not open yet
        if (!this.visible || this.openness === 0 || !this.isOpen() || this.height === 0 || this.width === 0) {
            if (this._lastSkillClosed !== true) {
                this._htmlSkillRoot.style.transform = 'translateX(115%)';
                this._htmlSkillRoot.style.opacity = '0';
                this._htmlSkillRoot.style.pointerEvents = 'none';
                this._lastSkillClosed = true;
                this._lastSkillIdx = null;
            }
            return;
        }

        const sc = _msgGetScale();
        const idx = this.index();

        // Everything below writes to the DOM (and getBoundingClientRect() forces
        // a reflow). None of it changes unless the selection, scale, or open
        // state changed, so bail out early on the common no-change frame.
        if (this._lastSkillClosed === false && this._lastSkillIdx === idx &&
            this._lastSkillSx === sc.sx && this._lastSkillSy === sc.sy) {
            return;
        }
        const idxChanged = this._lastSkillIdx !== idx;
        const layoutChanged = this._lastSkillClosed !== false ||
            this._lastSkillSx !== sc.sx || this._lastSkillSy !== sc.sy;
        this._lastSkillClosed = false;
        this._lastSkillIdx = idx;
        this._lastSkillSx = sc.sx;
        this._lastSkillSy = sc.sy;

        const s = this._htmlSkillRoot.style;
        const baseFontSize = (typeof this.standardFontSize === 'function')
            ? this.standardFontSize() : 24;
        const scaledFont = Math.round(baseFontSize * sc.sy * 0.85);

        if (layoutChanged) {
            const page = window.BattleListPage;
            const pad = this.padding || 12;
            const padY = Math.round(pad * sc.sy);
            const padX = Math.round(pad * sc.sx);
            // Define portrait narrow page dimensions
            const scaledW = PAGE_WIDTH * sc.sx;

            s.width = scaledW + 'px';
            s.padding = padY + 'px ' + padX + 'px';

            // The rows carry the new font before anything is measured off them.
            if (this._htmlSkillEls) {
                this._htmlSkillEls.forEach(el => { el.style.fontSize = scaledFont + 'px'; });
            }

            // The page is as tall as the loadout it shows. A full carry is
            // LOADOUT_MAX skills or LOADOUT_MAX magic, so that many rows always
            // fit without scrolling; a shorter list shrinks to what it holds
            // instead of leaving the page half empty, and the Basic kit (which
            // answers to no loadout) stops at that same height and scrolls.
            const els = this._htmlSkillEls || [];
            const shown = Math.min(els.length, LOADOUT_MAX);
            let rowsH = 0;
            if (shown > 0) {
                const last = els[shown - 1];
                rowsH = last.offsetTop + last.offsetHeight - padY;
            }
            // Border-box: the 3px frame on both sides counts toward the height.
            const frameH = padY * 2 + 6;
            const minH = Math.round(120 * sc.sy);
            const maxH = page.maxHeight() * sc.sy;
            const scaledH = Math.max(minH, Math.min(rowsH + frameH, maxH));

            // The description box sits on top of this page, so it is told the
            // corner the page ended up occupying.
            page.set(PAGE_WIDTH, scaledH / sc.sy);

            // Its own edge, hanging from the shared top line the item page uses.
            const targetLeft = page.leftPx(scaledW, sc);
            const targetTop = sc.oy + (page.TOP * sc.sy);

            s.left = targetLeft + 'px';
            s.top = targetTop + 'px';
            s.height = scaledH + 'px';

            // Trigger slide-in/open transition styles
            s.transform = 'translateX(0)';
            s.opacity = '1';
            s.pointerEvents = 'auto';
        }

        if (this._htmlSkillEls) {
            const prevIdx = idxChanged ? this._prevSkillHiIdx : idx;
            // Only recolour the two rows whose highlight state flips; the font
            // size is stamped by the layout pass above, which measures off it.
            // Only while the rows are skills: handed over to the party list
            // (_buildActorTargetItems) they are actors, and paint themselves.
            const rowData = this._actorTargetWindow ? null : (this._data || []);
            if (rowData) {
                this._htmlSkillEls.forEach((el, i) => {
                    if (i === idx) paintSkillRow(el, rowData[i], true);
                    else if (i === prevIdx || layoutChanged) paintSkillRow(el, rowData[i], false);
                });
            }
            this._prevSkillHiIdx = idx;

            // Scroll the selected element into view for keyboard/controller navigation
            if (this._htmlSkillEls[idx]) {
                const container = this._htmlSkillRoot;
                const el = this._htmlSkillEls[idx];
                const cRect = container.getBoundingClientRect();
                const eRect = el.getBoundingClientRect();
                if (eRect.top < cRect.top) {
                    container.scrollTop -= cRect.top - eRect.top;
                } else if (eRect.bottom > cRect.bottom) {
                    container.scrollTop += eRect.bottom - cRect.bottom;
                }
            }
        }
    };


    //=============================================================================
    // The battle skill menu, drawn as the actor's command list
    //=============================================================================
    // A skill is chosen where every other action is chosen. The carried skills
    // (and the Basic kit, and the party an ally-scoped skill is pointed at)
    // REPLACE the actor's command rows, the same takeover the grapple plan
    // (Health_Monsters.js) and the talk menu (EnemyTalkSystem.js) do: each row
    // carries its own cost, greys out when the actor cannot pay it, and wears
    // the colour of the role it answers to. The drawing belongs to
    // BattleSystemEnhanchedCommands (that window is its); only the list is
    // ours, and it calls in through window.BattleSkillMenu.
    //
    // The description box (BattleSystemEnhancedHUD.js) still reads the scene's
    // help window, so it follows the cursor down the rows exactly as it did
    // when the list was a panel; it is anchored to the top edge of the menu
    // through window.BattleListPage.

    const ALLY_ROW_ICON    = 73;

    // What a row's tail says: the pool the skill is actually paid from.
    function battleRowCost(actor, skill) {
        const tp = actor.skillTpCost(skill);
        if (tp > 0) return T('SkillsMenu.cost.ap', { n: tp });
        const mp = actor.skillMpCost(skill);
        if (mp > 0) return T('SkillsMenu.cost.mp', { n: mp });
        return '';
    }

    // The same two lists Window_BattleSkill.makeItemList builds, in the same
    // order: the Basic kit answers to no role and stays alphabetical, and
    // everything else is the carried loadout, sorted by role then by cost.
    function battleMenuSkills(actor, mode, stypeId) {
        if (!actor) return [];
        if (mode === 'basic') {
            return actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && isBasicSkill(skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        return BattleLoadout.battleSkills(actor, stypeId || 0)
            .sort(battleSkillSortCompare(actor));
    }

    const BattleSkillMenu = {
        isMenuOpen(win) {
            return !!(win && win._skillSession);
        },

        // Stands in for Window_ActorCommand.makeCommandList while a skill is being chosen.
        makeCommandList(win) {
            const session = win._skillSession;
            if (!session) return;
            const push = (name, ext, enabled, icon, colors, cost, dim) =>
                win.addCommandWithIcon(name, "skillRow",
                    enabled !== false, ext, icon, enabled === false || !!dim, colors, cost);

            const actor = session.actor;
            const list = session.list;
            if (list.length === 0) {
                push(T('SkillsMenu.battle.none'), { kind: 'blocked' }, false, 76, null, '');
            }
            // Every carried skill is a row. The menu is bottom-pinned and
            // grows upward, so the list simply keeps adding rows until the
            // whole loadout is on screen: there is no page to turn.
            for (const skill of list) {
                push(skill.name, { kind: 'skill', id: skill.id }, actor.canUse(skill),
                     skill.iconIndex, skillRowColors(skill), battleRowCost(actor, skill));
            }
            push(T('SkillsMenu.battle.back'), { kind: 'back' }, true, 140, null, '');
        },

        // Take the command menu over. Its own handlers are put aside whole and
        // given back on the way out, so nothing else has to know this exists.
        open(win, scene, mode, stypeId, returnSymbol) {
            const actor = BattleManager.actor();
            if (!win || !actor) return false;
            const list = battleMenuSkills(actor, mode, stypeId);
            if (list.length === 0) return false;
            win._skillSession = {
                mode: mode, stypeId: stypeId, actor: actor, list: list, offset: 0,
                returnSymbol: returnSymbol || win.currentSymbol(),
            };
            // Only the FIRST takeover puts the menu's own handlers aside;
            // opening over a list that is already ours would otherwise save
            // our handlers as if they were the menu's and never give the real
            // ones back.
            if (!win._skillSavedHandlers) win._skillSavedHandlers = win._handlers;
            win._handlers = {};
            win.setHandler("skillRow", scene.onBattleSkillRow.bind(scene));
            win.setHandler("cancel", scene.onBattleSkillCancel.bind(scene));
            win.show();
            win.refresh();
            win.select(0);
            win.activate();
            scene.updateBattleSkillHelp();
            return true;
        },

        close(win) {
            if (!win || !win._skillSession) return null;
            const session = win._skillSession;
            win._skillSession = null;
            if (win._skillSavedHandlers) win._handlers = win._skillSavedHandlers;
            win._skillSavedHandlers = null;
            restoreHelpAnchor();
            // Back to the actor's own commands at once: the rows are drawn on
            // refresh, so a menu left unrefreshed would go on showing the list
            // the skill was just picked from while the target is chosen.
            win.refresh();
            if (session.returnSymbol) win.selectSymbol(session.returnSymbol);
            return session;
        },

        // Compatibility stubs (target selection is handled by BattleSystemEnhanchedCommands.js)
        openAlly(win, actorWindow) {},
        closeAlly(win) {},
    };
    window.BattleSkillMenu = BattleSkillMenu;

    // -------------------------------------------------------------------------
    // The description box, above the menu
    // -------------------------------------------------------------------------
    // The box is drawn by BattleSystemEnhancedHUD off the scene's help window,
    // and placed against whichever list published its corner (BattleListPage).
    // While the rows live in the command menu, that corner is the menu's own
    // top edge, which moves as the list grows and shrinks.
    let _savedPageTop = null;

    function anchorHelpToMenu(win) {
        const page = window.BattleListPage;
        if (!page || !win) return;
        if (_savedPageTop === null) _savedPageTop = page.TOP;
        page.width = PAGE_WIDTH;
        page.TOP = Math.max(80, win.y);
    }

    function restoreHelpAnchor() {
        const page = window.BattleListPage;
        if (page && _savedPageTop !== null) page.TOP = _savedPageTop;
        _savedPageTop = null;
        const scene = SceneManager._scene;
        if (scene && scene._helpWindow) {
            scene._helpWindow.setText('');
            scene._helpWindow.hide();
        }
    }

    Scene_Battle.prototype.updateBattleSkillHelp = function () {
        const win = this._actorCommandWindow;
        const session = win && win._skillSession;
        const help = this._helpWindow;
        if (!help) return;
        if (!session) {
            help.setText('');
            help.hide();
            return;
        }
        const ext = win.currentExt();
        const skill = ext && ext.kind === 'skill' ? $dataSkills[ext.id] : null;
        anchorHelpToMenu(win);
        help.setText(skill ? buildBattleSkillHelpText(skill, session.actor) : '');
        help.show();
    };

    // Every cursor move in the command menu is a chance for the description to
    // change; this is the only place the scene hears about one.
    const _WAC_select_BSM = Window_ActorCommand.prototype.select;
    Window_ActorCommand.prototype.select = function (index) {
        _WAC_select_BSM.call(this, index);
        const scene = SceneManager._scene;
        if (this._skillSession && scene && scene.updateBattleSkillHelp) {
            scene.updateBattleSkillHelp();
        }
    };

    // -------------------------------------------------------------------------
    // Picking a row
    // -------------------------------------------------------------------------
    Scene_Battle.prototype.onBattleSkillRow = function () {
        const win = this._actorCommandWindow;
        const session = win && win._skillSession;
        const ext = win ? win.currentExt() : null;
        if (!session || !ext) return;

        switch (ext.kind) {
            case 'back':
                this.onBattleSkillCancel();
                return;
            case 'skill': {
                const skill = $dataSkills[ext.id];
                const action = BattleManager.inputtingAction();
                if (!skill || !action) return;
                action.setSkill(skill.id);
                session.actor.setLastBattleSkill(skill);
                // Where to come back to if the target choice is backed out of.
                this._battleSkillReturn = {
                    mode: session.mode, stypeId: session.stypeId,
                    index: win.index(),
                    symbol: session.returnSymbol,
                };
                BattleSkillMenu.close(win);
                this.onSelectAction();
                return;
            }
            default:
                SoundManager.playBuzzer();
        }
    };

    Scene_Battle.prototype.onBattleSkillCancel = function () {
        const win = this._actorCommandWindow;
        // close() already puts the actor's own commands back and lands the
        // cursor on the row the list was opened from.
        BattleSkillMenu.close(win);
        this._battleSkillReturn = null;
        if (win) win.activate();
    };

    // Backing out of a target choice puts the list back exactly as it was left.
    Scene_Battle.prototype.reopenBattleSkillMenu = function () {
        const ret = this._battleSkillReturn;
        const win = this._actorCommandWindow;
        if (!ret || !win) return false;
        if (!BattleSkillMenu.open(win, this, ret.mode, ret.stypeId, ret.symbol)) return false;
        win.refresh();
        win.select(ret.index != null ? ret.index : 0);
        win.activate();
        return true;
    };


    //=============================================================================
    // Scene_Skill ,  fullscreen layout with party member switching
    //=============================================================================

    const _Scene_Skill_create = Scene_Skill.prototype.create;
    Scene_Skill.prototype.create = function () {
        _Scene_Skill_create.call(this);

        // Deactivate standard canvas windows and hide them
        if (this._skillTypeWindow) {
            this._skillTypeWindow.visible = false;
            this._skillTypeWindow.deactivate();
        }
        if (this._statusWindow) {
            this._statusWindow.visible = false;
            this._statusWindow.deactivate();
        }
        if (this._itemWindow) {
            this._itemWindow.visible = false;
            this._itemWindow.deactivate();
        }
        if (this._skillActionWindow) {
            this._skillActionWindow.visible = false;
            this._skillActionWindow.deactivate();
        }

        this._actorIndex = $gameParty.allMembers().indexOf(this.actor());
        if (this._actorIndex < 0) this._actorIndex = 0;

        // UI UI states
        this._dndActiveSection = "types"; // "types", "skills", "actions", "targets"
        this._dndSelectedTypeIndex = 0;
        // The two loadout chips ride the tab rail: when the cursor stands on one
        // of them this holds its kind, and no tab is lit as focused.
        this._dndSelectedPreset = null;
        this._dndSelectedIndex = 0; // selected skill row
        this._dndSelectedActionIndex = 0;
        this._dndSelectedTargetIndex = 0;
        this._dndTargetingMode = false;
        this._dndTargetingSkill = null;
        // A skill opened from the carried row rather than from the list; it may
        // not be listed under the open tab at all.
        this._dndInspectSkillId = null;

        // The shared search + filter strip (UI/MenuSearchBar.js), in this page's
        // vocabulary: disciplines and cast cost, never item categories or prices.
        this._skillBar = window.MenuSearchBar ? window.MenuSearchBar.create({
            id: 'skills',
            placeholder: T('SkillsMenu.searchPlaceholder'),
            sorts: ['name'],
            onChange: () => {
                // A new list means the old cursor points at nothing.
                this._dndSelectedIndex = 0;
                this._dndInspectSkillId = null;
                this.refreshUISkill();
                if (this._skillBar) this._skillBar.restoreFocus();
            }
        }) : null;

        this.createUISkillOverlay();
    };

    const _Scene_Skill_start = Scene_Skill.prototype.start;
    Scene_Skill.prototype.start = function () {
        _Scene_Skill_start.call(this);
        if (this._skillTypeWindow) {
            this._skillTypeWindow.visible = false;
            this._skillTypeWindow.deactivate();
        }
        if (this._itemWindow) {
            this._itemWindow.visible = false;
            this._itemWindow.deactivate();
        }
        if (this._statusWindow) {
            this._statusWindow.visible = false;
            this._statusWindow.deactivate();
        }
        if (this._skillActionWindow) {
            this._skillActionWindow.visible = false;
            this._skillActionWindow.deactivate();
        }
    };

    const _Scene_Skill_createStatusWindow = Scene_Skill.prototype.createStatusWindow;
    Scene_Skill.prototype.createStatusWindow = function () {
        const rect = this.statusWindowRect();
        this._statusWindow = new Window_SkillInfo(rect);
        this._statusWindow.setActor(this.actor());
        this.addWindow(this._statusWindow);
    };

    const _Scene_Skill_createItemWindow = Scene_Skill.prototype.createItemWindow;
    Scene_Skill.prototype.createItemWindow = function () {
        _Scene_Skill_createItemWindow.call(this);
        if (this._statusWindow && this._itemWindow) {
            this._itemWindow.setSkillInfoWindow(this._statusWindow);
        }
        this._itemWindow.setHandler('skillaction', this.onSkillAction.bind(this));
        const ww = 220;
        const wh = this.calcWindowHeight(3, true);
        const rect = new Rectangle(Math.floor((Graphics.boxWidth - ww) / 2), Math.floor((Graphics.boxHeight - wh) / 2), ww, wh);
        this._skillActionWindow = new Window_SkillAction(rect);
        this._skillActionWindow.setHandler('ok', this.onSkillActionOk.bind(this));
        this._skillActionWindow.setHandler('cancel', this.onSkillActionCancel.bind(this));
        this.addWindow(this._skillActionWindow);
    };

    Scene_Skill.prototype.onSkillAction = function () {
        this._skillActionWindow.setSkill(this.actor(), this._itemWindow.item());
    };

    Scene_Skill.prototype.onSkillActionOk = function () {
        const symbol = this._skillActionWindow.currentSymbol();
        if (symbol === 'use') {
            this._skillActionWindow.hide();
            this._skillActionWindow.deactivate();
            this.onItemOk();
        } else if (symbol === 'loadout') {
            const skill = this._itemWindow.item();
            if (skill) BattleLoadout.toggle(this.actor(), skill);
            this._skillActionWindow.hide();
            this._skillActionWindow.deactivate();
            this._itemWindow.refresh();
            this._itemWindow.activate();
        } else if (symbol === 'cancel') {
            this.onSkillActionCancel();
        }
    };

    Scene_Skill.prototype.onSkillActionCancel = function () {
        this._skillActionWindow.hide();
        this._skillActionWindow.deactivate();
        this._itemWindow.activate();
    };

    const _Scene_Skill_update = Scene_Skill.prototype.update;
    Scene_Skill.prototype.update = function () {
        if (this._skillTypeWindow && this._skillTypeWindow.active) this._skillTypeWindow.deactivate();
        if (this._itemWindow && this._itemWindow.active) this._itemWindow.deactivate();
        if (this._statusWindow && this._statusWindow.active) this._statusWindow.deactivate();
        if (this._skillActionWindow && this._skillActionWindow.active) this._skillActionWindow.deactivate();
        if (this._actorWindow && this._actorWindow.active) this._actorWindow.deactivate();

        _Scene_Skill_update.call(this);
        UISkillInputManager.update();
    };

    Scene_Skill.prototype.updateActorSelection = function () {
        // Handled directly inside UISkillInputManager
    };

    Scene_Skill.prototype.nextActor = function () {
        const allMembers = $gameParty.allMembers();
        if (allMembers.length <= 1) return;
        this._actorIndex = (this._actorIndex + 1) % allMembers.length;
        this.changeActor();
    };

    Scene_Skill.prototype.previousActor = function () {
        const allMembers = $gameParty.allMembers();
        if (allMembers.length <= 1) return;
        this._actorIndex = (this._actorIndex - 1 + allMembers.length) % allMembers.length;
        this.changeActor();
    };

    // Cycle the displayed party member from a keyboard/controller shortcut,
    // resetting the skill selection so the new actor opens cleanly.
    Scene_Skill.prototype.cycleUIActor = function (dir) {
        const allMembers = $gameParty.allMembers();
        if (allMembers.length <= 1) return;
        this._actorIndex = (this._actorIndex + dir + allMembers.length) % allMembers.length;
        this.changeActor();
        this.clearUIInspect();
        this._dndSelectedIndex = 0;
        this.refreshUISkill();
    };

    Scene_Skill.prototype.changeActor = function () {
        const newActor = $gameParty.allMembers()[this._actorIndex];
        if (newActor && this._actor !== newActor) {
            this._actor = newActor;
            SoundManager.playCursor();
            if (this._statusWindow) this._statusWindow.setActor(this._actor);
            if (this._skillTypeWindow) {
                this._skillTypeWindow.setActor(this._actor);
                this._skillTypeWindow.refresh();
            }
            if (this._itemWindow) {
                this._itemWindow.setActor(this._actor);
                this._itemWindow.refresh();
                this._itemWindow.scrollTo(0, 0);
                this._itemWindow.select(0);
            }
        }
    };

    Scene_Skill.prototype.actor = function () {
        return this._actor;
    };

    Scene_Skill.prototype.helpAreaHeight = function () {
        return this.calcWindowHeight(2, false);
    };

    Scene_Skill.prototype.helpAreaTop = function () {
        return Graphics.boxHeight - this.helpAreaHeight();
    };

    Scene_Skill.prototype.mainAreaTop = function () {
        return 0;
    };

    Scene_Skill.prototype.mainAreaHeight = function () {
        return Graphics.boxHeight - this.helpAreaHeight();
    };

    Scene_Skill.prototype.skillTypeWindowRect = function () {
        return new Rectangle(0, 0, 240, this.calcWindowHeight(4, true));
    };

    Scene_Skill.prototype.statusWindowRect = function () {
        return new Rectangle(240, 0, Graphics.boxWidth - 240, this.calcWindowHeight(4, true));
    };

    Scene_Skill.prototype.itemWindowRect = function () {
        const wy = this.calcWindowHeight(4, true);
        return new Rectangle(0, wy, Graphics.boxWidth, this.mainAreaHeight() - wy);
    };

    // --- UI UI Overlay Engine for Skills ---

    Scene_Skill.prototype.createUISkillOverlay = function () {
        // Create overlay container
        this._dndContainer = document.createElement("div");
        this._dndContainer.id = "menu-container";
        this._dndContainer.style.opacity = "0";
        this._dndContainer.style.transition = "opacity 0.22s ease-out";
        document.body.appendChild(this._dndContainer);

        // The wheel moves whatever is under the pointer. It used to always
        // scroll the left page's list, so the inspect card on the right could
        // be taller than the page and still refuse to move.
        this._dndContainer.addEventListener("wheel", (e) => {
            e.preventDefault();
            let node = e.target;
            while (node && node !== this._dndContainer) {
                if (node.scrollHeight > node.clientHeight + 1) {
                    const overflow = getComputedStyle(node).overflowY;
                    if (overflow === "auto" || overflow === "scroll") {
                        node.scrollTop += e.deltaY;
                        return;
                    }
                }
                node = node.parentElement;
            }
            const content = this._dndContainer.querySelector(".backpack-grid");
            if (content) content.scrollTop += e.deltaY;
        }, { passive: false });

        // The carried row is the backpack's quick-slot strip: the same widget
        // (Core/HotbarUI.js), the same nine numbered slots, mounted into the
        // foot of the left page. A click opens that skill on the right page,
        // a right click puts it down.
        this._loadoutBar = window.HotbarUI ? new window.HotbarUI({
            id: 'skill-loadout-row',
            slots: LOADOUT_MAX,
            inline: true,
            onSlotClick: (i) => this.clickUILoadoutCell(i),
            onSlotContext: (i) => this.dropUILoadoutCell(i),
            onSlotDrop: (i) => this.onUILoadoutSlotDrop(i),
            onSlotDragStart: (i) => this.onUILoadoutDragStart(i)
        }) : null;

        // Dropping a carried skill back on the pocket cards puts it down, the
        // mirror of dragging a card onto the row.
        this._dndContainer.addEventListener('dragover', (e) => {
            if (this._dragLoadoutSkill && e.target.closest && e.target.closest('.backpack-grid')) {
                e.preventDefault();
            }
        });
        this._dndContainer.addEventListener('drop', (e) => {
            const skill = this._dragLoadoutSkill;
            this._dragLoadoutSkill = null;
            if (!skill || !e.target.closest || !e.target.closest('.backpack-grid')) return;
            e.preventDefault();
            if (!BattleLoadout.isActive(this.actor(), skill)) return;
            this.toggleUILoadout(skill);
        });

        this.refreshUISkill();
        UISkillInputManager.activate(this);

        window.CharSwitcher.installTabKey(this, (dir) => this.cycleUIActor(dir));

        // Right-click anywhere on the overlay acts like the Back button
        this._dndContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            UISkillInputManager.handleCancel();
        });

        setTimeout(() => {
            if (this._dndContainer) {
                this._dndContainer.style.opacity = "1";
            }
        }, 16);
    };

    const _Scene_Skill_terminate = Scene_Skill.prototype.terminate;
    Scene_Skill.prototype.terminate = function () {
        _Scene_Skill_terminate.call(this);
        if (this._skillBar) { this._skillBar.dispose(); this._skillBar = null; }
        if (this._loadoutBar) { this._loadoutBar.destroy(); this._loadoutBar = null; }
        UISkillInputManager.deactivate();
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
    };

    // Three role tabs plus the class's own ledger. A tab is not a skill type:
    // skills and magic sit side by side inside each role.
    Scene_Skill.prototype.getUISkillTypes = function () {
        const actor = this.actor();
        if (!actor) return [];

        const list = [];
        // "All Skills" tab first, showing every known skill regardless of role
        list.push({ name: T('SkillsMenu.cmd.allSkills'), ext: "all", type: "all" });
        ROLE_KEYS.forEach(key => list.push({ name: getRoleDisplayName(key), ext: key, type: "role" }));
        // The engine's own kit answers to no role and no loadout, so it keeps
        // its own tab rather than crowding the ones a character chose.
        list.push({ name: T('SkillsMenu.cmd.basic'), ext: "basic", type: "basic" });
        // Esoteric tab: occult skills hidden from the role tabs
        list.push({ name: T('SkillsMenu.cmd.esoteric'), ext: "esoteric", type: "esoteric" });
        list.push({ name: T('SkillsMenu.cmd.levelUp'), ext: "levelup", type: "levelup" });

        return list;
    };

    // The tab rail as the cursor walks it: the roles with the two loadout chips
    // sitting where they are drawn, right after the overview tab. Left and right
    // step through this, so the chips are reachable without the mouse.
    Scene_Skill.prototype.getUISkillRail = function () {
        const rail = [];
        this.getUISkillTypes().forEach((type, index) => {
            rail.push({ kind: "type", index: index, name: type.name });
            if (type.ext === "all") {
                rail.push({ kind: "preset", preset: "best" });
                rail.push({ kind: "preset", preset: "random" });
            }
        });
        return rail;
    };

    // Where the cursor stands on that rail.
    Scene_Skill.prototype.getUIRailIndex = function (rail) {
        const entries = rail || this.getUISkillRail();
        const preset = this._dndSelectedPreset;
        const found = entries.findIndex(e => preset
            ? (e.kind === "preset" && e.preset === preset)
            : (e.kind === "type" && e.index === this._dndSelectedTypeIndex));
        return found >= 0 ? found : 0;
    };

    Scene_Skill.prototype.isUILevelUpTab = function () {
        const type = this.getUISkillTypes()[this._dndSelectedTypeIndex];
        return !!type && type.ext === "levelup";
    };

    Scene_Skill.prototype.isUIAllSkillsTab = function () {
        const type = this.getUISkillTypes()[this._dndSelectedTypeIndex];
        return !!type && type.ext === "all";
    };

    Scene_Skill.prototype.isUIEsotericTab = function () {
        const type = this.getUISkillTypes()[this._dndSelectedTypeIndex];
        return !!type && type.ext === "esoteric";
    };

    // A Level Up row is a {skill, level, isLearned} record; every other row is
    // the skill itself.
    Scene_Skill.prototype.uiSkillOf = function (entry) {
        if (!entry) return null;
        return this.isUILevelUpTab() ? entry.skill : entry;
    };

    // What the right page is reading: normally the row the cursor stands on,
    // but a click on the carried row overrides it with that skill, which the
    // open tab need not list at all.
    Scene_Skill.prototype.uiCurrentSkill = function () {
        if (this._dndInspectSkillId) {
            const skill = $dataSkills[this._dndInspectSkillId];
            if (skill) return skill;
            this._dndInspectSkillId = null;
        }
        const list = this.getUISkillsOnlyList();
        return this.uiSkillOf(list[this._dndSelectedIndex]);
    };

    // Leave whatever the carried row had opened and go back to reading the list.
    Scene_Skill.prototype.clearUIInspect = function () {
        this._dndInspectSkillId = null;
    };

    // Everything the open tab holds, before the search strip has had its say.
    Scene_Skill.prototype.getUISkillsOnlyListRaw = function () {
        const actor = this.actor();
        if (!actor) return [];
        const type = this.getUISkillTypes()[this._dndSelectedTypeIndex];
        if (!type) return [];

        if (type.ext === "levelup") {
            const classData = $dataClasses[actor._classId];
            if (!classData || !classData.learnings) return [];
            return classData.learnings
                .map(l => ({ skill: $dataSkills[l.skillId], level: l.level, isLearned: actor.isLearnedSkill(l.skillId) }))
                .filter(entry => entry.skill && !isDummySkill(entry.skill))
                .sort((a, b) => a.level !== b.level ? a.level - b.level : a.skill.name.localeCompare(b.skill.name));
        }
        // The basic kit is never dealt in among the skills a character chose:
        // it belongs to its own tab and to no other.
        if (type.ext === "basic") {
            return actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && isBasicSkill(skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        if (type.ext === "all") {
            return actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && !isBasicSkill(skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        if (type.ext === "esoteric") {
            return actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && !isBasicSkill(skill) && isEsotericSkill(skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        return actor.skills()
            .filter(skill => skill && !isDummySkill(skill) && !isBasicSkill(skill) &&
                !isEsotericSkill(skill) && getSkillRole(skill) === type.ext)
            .sort((a, b) => a.name.localeCompare(b.name));
    };

    // What the tab holds after the strip (UI/MenuSearchBar.js) has filtered and
    // ordered it. A skill has a discipline and a cost, not a weight or a price,
    // so those controls are never offered on this page.
    Scene_Skill.prototype.getUISkillsOnlyList = function () {
        const list = this.getUISkillsOnlyListRaw();
        if (!this._skillBar) return list;
        return this._skillBar.apply(list, entry => {
            const skill = this.uiSkillOf(entry);
            if (!skill) return null;
            return {
                name: dbText(skill.name),
                category: window.SkillDetails.categoryOf(skill) || '',
                subtitle: dbText(skill.description),
                cost: skill.mpCost || skill.tpCost || 0,
                // On the Level Up ledger the level is the level it is learned at.
                level: entry && entry.level ? entry.level : 0
            };
        });
    };

    Scene_Skill.prototype.getUISkillCostText = function (skill) {
        if (!skill) return "";
        if (skill.mpCost > 0) return `${skill.mpCost} MP`;
        if (skill.tpCost > 0) return `${skill.tpCost} AP`;
        return "";
    };

    Scene_Skill.prototype.getUISkillActions = function () {
        const skill = this.uiCurrentSkill();
        if (!skill) return [];

        const actions = [];
        const actor = this.actor();

        // A skill opened from the carried row is an ordinary skill even while
        // the Level Up ledger is the open tab.
        if (!this.isUILevelUpTab() || this._dndInspectSkillId) {
            // A skill that can only be cast in a fight is not offered here at
            // all. One that can be is always offered: whether it can be paid
            // for is answered by greying the button, not by taking it away.
            if (actor.isOccasionOk(skill)) actions.push("use");
            if (!BattleLoadout.isAlwaysCarried(actor, skill)) actions.push("loadout");
        }
        return actions;
    };

    // The action buttons under the inspect card, drawn the same for the full
    // refresh and the hover-only one.
    Scene_Skill.prototype._uiSkillActionsHTML = function (actor, skill) {
        return this.getUISkillActions().map((action, idx) => {
            const isFocused = (this._dndActiveSection === "actions" && this._dndSelectedActionIndex === idx) ? "selected" : "";
            let label = "";
            let unusable = "";
            if (action === "use") {
                label = T('SkillsMenu.action.useSkill');
                if (!actor.canUse(skill)) unusable = " unusable";
            } else if (action === "loadout") {
                label = BattleLoadout.isActive(actor, skill)
                    ? T('SkillsMenu.action.bench') : T('SkillsMenu.action.carry');
            }
            return `<div class="inspect-btn ${isFocused}${unusable}" onclick="SceneManager._scene.triggerUISkillAction('${action}')">${label}</div>`;
        }).join("");
    };

    // The right page when nothing is selected.
    Scene_Skill.prototype._uiSkillEmptyHTML = function () {
        // The backpack's own empty page, class for class.
        return `
            <div class="item-inspect item-inspect--empty">
                <div class="inspect-placeholder-icon"></div>
            </div>
        `;
    };

    // The inspect card: a header that holds still, one scrolling body carrying
    // the description and every number, and the buttons pinned under it. Both
    // the full refresh and the hover-only one draw the page from here, so they
    // cannot drift apart.
    Scene_Skill.prototype._uiSkillInspectHTML = function (actor, skill) {
        // The card itself is window.SkillDetails.card, which the main menu's
        // search page draws too, so the two pages cannot drift apart. This scene
        // only supplies the buttons that belong to it.
        return window.SkillDetails.card(skill, actor, {
            actionsHTML: this._uiSkillActionsHTML(actor, skill)
        });
    };

    // Take a skill up or put it down. A full loadout refuses rather than
    // silently doing nothing.
    Scene_Skill.prototype.toggleUILoadout = function (skill) {
        const actor = this.actor();
        if (!skill || !actor) return;
        const result = BattleLoadout.toggle(actor, skill);
        if (result === 'locked') {
            SoundManager.playBuzzer();
            return;
        }
        // A stat floor the character is under is a hard lock: the row says what
        // the sheet is missing rather than silently doing nothing.
        if (result === 'statlocked') {
            SoundManager.playBuzzer();
            const svc = window.SkillStatReq;
            const stand = svc && svc.check(actor, skill);
            if (window.ParchmentToast && stand) {
                window.ParchmentToast.show(T('SkillsMenu.loadout.statLocked', {
                    name: skill.name,
                    stat: svc.statName(stand.stat) + ' ' + stand.points,
                    value: stand.have
                }), { severity: "warning" });
            }
            return;
        }
        if (result === 'full') {
            SoundManager.playBuzzer();
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T('SkillsMenu.loadout.full', {
                    group: T('SkillsMenu.loadout.skills'),
                    max: BattleLoadout.MAX
                }), { severity: "warning" });
            }
            return;
        }
        SoundManager.playOk();
        // A skill put down has left the carried row, so the row can no longer
        // be what the right page is reading.
        if (result === 'off' && this._dndInspectSkillId === skill.id) this.clearUIInspect();
        this._itemWindow.refresh();
        this.refreshUISkill();
    };

    Scene_Skill.prototype.clickUILoadout = function (idx) {
        const list = this.getUISkillsOnlyList();
        const skill = this.uiSkillOf(list[idx]);
        if (!skill) return;
        this.clearUIInspect();
        this._dndActiveSection = "skills";
        this._dndSelectedIndex = idx;
        this.toggleUILoadout(skill);
    };

    // Fill the whole carried row in one go, from the buttons under the list:
    // 'best' packs the row a character would pack for themself, 'random' draws
    // it out of the hat. Either way whatever was carried is put down first.
    Scene_Skill.prototype.applyUILoadoutPreset = function (kind) {
        const actor = this.actor();
        if (!actor) return;
        const ids = kind === 'random' ? BattleLoadout.randomize(actor) : BattleLoadout.best(actor);
        if (!ids.length) {
            SoundManager.playBuzzer();
            return;
        }
        // Packing the row is the same act as changing what is worn, so it is the
        // equip sound rather than the menu's own OK.
        SoundManager.playEquip();
        // The right page may have been reading a skill that has just left the row.
        if (this._dndInspectSkillId && !ids.includes(this._dndInspectSkillId)) this.clearUIInspect();
        this._itemWindow.refresh();
        this.refreshUISkill();
        if (window.ParchmentToast) {
            const key = kind === 'random' ? 'SkillsMenu.loadout.randomApplied' : 'SkillsMenu.loadout.bestApplied';
            window.ParchmentToast.show(T(key, { n: ids.length }));
        }
    };

    // A cell of the carried row. The first click opens that skill on the right
    // page; clicking the cell of the skill already open puts it down, which
    // takes it off the row.
    Scene_Skill.prototype.clickUILoadoutCell = function (i) {
        const actor = this.actor();
        const skillId = BattleLoadout.ids(actor)[i];
        const skill = skillId ? $dataSkills[skillId] : null;
        if (!skill) return;
        if (this._dndInspectSkillId === skillId) {
            this._dndActiveSection = "skills";
            this.toggleUILoadout(skill);
            return;
        }
        SoundManager.playCursor();
        this._dndInspectSkillId = skillId;
        this._dndActiveSection = "actions";
        this._dndSelectedActionIndex = 0;
        this.refreshUISkill();
    };

    // 1-9 while a skill is being read drops it into that slot of the carried
    // row, the same assignment a number key makes in the backpack.
    Scene_Skill.prototype.assignUILoadoutSlot = function (index) {
        const actor = this.actor();
        const skill = this.uiCurrentSkill();
        if (!actor || !skill) { SoundManager.playBuzzer(); return; }
        const result = BattleLoadout.setSlot(actor, index, skill);
        if (result === 'locked' || result === 'statlocked') { SoundManager.playBuzzer(); return; }
        if (result === 'same') { SoundManager.playCursor(); return; }
        SoundManager.playOk();
        this._itemWindow.refresh();
        this.refreshUISkill();
    };

    // A right click on a carried cell puts that skill down, the way a right
    // click empties a backpack quick slot.
    Scene_Skill.prototype.dropUILoadoutCell = function (i) {
        const actor = this.actor();
        const skillId = BattleLoadout.ids(actor)[i];
        const skill = skillId ? $dataSkills[skillId] : null;
        if (!skill) return;
        this.toggleUILoadout(skill);
    };

    // Dragging a pocket card. Nothing here may redraw the page: rebuilding the
    // grid mid-drag would tear out the very element the browser is dragging.
    Scene_Skill.prototype.onUISkillDragStart = function (event, idx) {
        const list = this.getUISkillsOnlyList();
        const skill = this.uiSkillOf(list[idx]);
        if (!skill || this.isUILevelUpTab() || BattleLoadout.isAlwaysCarried(this.actor(), skill) ||
            BattleLoadout.isStatLocked(this.actor(), skill)) {
            event.preventDefault();
            return;
        }
        this._dragSkill = skill;
        this._dragLoadoutSkill = null;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', String(skill.id));
    };

    Scene_Skill.prototype.onUISkillDragEnd = function () {
        this._dragSkill = null;
    };

    // Picking a skill up out of the carried row, to drop it either on another
    // slot (a reorder) or back on the cards (putting it down).
    Scene_Skill.prototype.onUILoadoutDragStart = function (i) {
        const skillId = BattleLoadout.ids(this.actor())[i];
        const skill = skillId ? $dataSkills[skillId] : null;
        if (!skill) return false;
        this._dragLoadoutSkill = skill;
        this._dragSkill = skill;
        return true;
    };

    // A card, or another carried slot, dropped on slot i of the row.
    Scene_Skill.prototype.onUILoadoutSlotDrop = function (i) {
        const skill = this._dragSkill;
        this._dragSkill = null;
        this._dragLoadoutSkill = null;
        if (!skill) return;
        const actor = this.actor();
        const result = BattleLoadout.setSlot(actor, i, skill);
        if (result === 'locked' || result === 'statlocked') { SoundManager.playBuzzer(); return; }
        if (result === 'same') { SoundManager.playCursor(); return; }
        SoundManager.playOk();
        this._itemWindow.refresh();
        this.refreshUISkill();
    };

    // Paint the carried row into whatever mount point the current left page
    // holds. The bar itself (Core/HotbarUI.js) outlives the page, so its slots
    // are re-mounted rather than rebuilt.
    Scene_Skill.prototype._renderUILoadoutBar = function () {
        if (!this._loadoutBar) return;
        const mount = this._dndContainer && this._dndContainer.querySelector("#skill-loadout-mount");
        if (!mount) { this._loadoutBar.hide(); return; }
        const actor = this.actor();
        const ids = BattleLoadout.ids(actor);
        const entries = [];
        let selected = -1;
        for (let i = 0; i < LOADOUT_MAX; i++) {
            const skill = ids[i] ? $dataSkills[ids[i]] : null;
            if (!skill) { entries.push(null); continue; }
            if (this._dndInspectSkillId === skill.id) selected = i;
            entries.push({
                iconIndex: skill.iconIndex,
                // The bar shows what is CARRIED, not what can be cast standing
                // in a menu: a battle-only skill is greyed out by canUse and
                // left the whole row colourless. Affording the cast is the only
                // thing that dims a slot here.
                enabled: actor.canPaySkillCost(skill),
                tooltip: dbText(skill.name)
            });
        }
        this._loadoutBar.mount(mount);
        this._loadoutBar.render(entries, { selected: selected, active: selected >= 0 });
    };

    // A skill "calls a common event" when one of its effects reserves one
    // (effect code 44). The reservation is picked up by the map interpreter,
    // so such a skill can only play out once this menu is left behind.
    Scene_Skill.prototype._skillCallsCommonEvent = function (skill) {
        if (!skill || !skill.effects) return false;
        return skill.effects.some(eff => eff && eff.code === 44);
    };

    Scene_Skill.prototype.triggerUISkillAction = function (action) {
        const skill = this.uiCurrentSkill();
        if (!skill) return;

        const actor = this.actor();

        if (action === "use") {
            // The button is always drawn, so refusing has to be said out loud:
            // too little MP or AP buzzes and the turn goes nowhere.
            if (!actor.canUse(skill)) {
                SoundManager.playBuzzer();
                return;
            }
            if (this._skillCallsCommonEvent(skill)) {
                // A common-event skill must not stay inside the menu: the
                // event it reserves is run by the map interpreter, which only
                // runs once the menu is gone. Cast it, then go straight back to
                // the map so the reserved event actually plays out.
                SoundManager.playOk();
                // Game_Battler.useItem already pays the skill cost, so paying
                // it again here charged the caster twice.
                actor.useItem(skill);
                // Applying the skill to the caster reserves the common event
                // (the direct-use path above never calls apply, so do it here).
                const commonEventAction = new Game_Action(actor);
                commonEventAction.setItemObject(skill);
                commonEventAction.applyGlobal();
                // Land on the map however deep the menu stack happens to be.
                // Popping a fixed two scenes exited the game outright when the
                // skill list was opened straight off the map (a one entry
                // stack): the second pop found nothing left and called
                // SceneManager.exit().
                SceneManager._stack.length = 0;
                SceneManager.goto(Scene_Map);
                return;
            }
            if (skill.scope === 1 || skill.scope === 7 || skill.scope === 8 || skill.scope === 9 || skill.scope === 10 || skill.scope === 11) {
                SoundManager.playOk();
                this._dndTargetingMode = true;
                this._dndTargetingSkill = skill;
                this._dndActiveSection = "targets";
                this._dndSelectedTargetIndex = 0;
                this.refreshUISkill();
            } else {
                SoundManager.playOk();
                actor.useItem(skill);
                actor.paySkillCost(skill);
                this._itemWindow.refresh();
                this.refreshUISkill();
            }
        } else if (action === "loadout") {
            this.toggleUILoadout(skill);
        } else if (action === "back") {
            SoundManager.playCancel();
            this._dndActiveSection = "skills";
            this.refreshUISkill();
        }
    };

    // Enemy-scoped skills (one/all/random enemy) target the opposing troop;
    // everything else targets party members.
    Scene_Skill.prototype._isUISkillEnemyScope = function (skill) {
        return skill && skill.scope >= 1 && skill.scope <= 6;
    };

    Scene_Skill.prototype._getUISkillTargets = function (skill) {
        if (this._isUISkillEnemyScope(skill)) {
            return $gameTroop ? $gameTroop.aliveMembers() : [];
        }
        return $gameParty.members();
    };

    Scene_Skill.prototype.applyUISkillTarget = function (idx) {
        const skill = this._dndTargetingSkill;
        if (!skill) return;

        const actor = this.actor();
        const members = this._getUISkillTargets(skill);

        SoundManager.playUseSkill();

        if (idx === members.length) {
            actor.useItem(skill);
            members.forEach(member => {
                const action = new Game_Action(actor);
                action.setItemObject(skill);
                action.apply(member);
            });
        } else {
            const target = members[idx];
            if (target) {
                actor.useItem(skill);
                const action = new Game_Action(actor);
                action.setItemObject(skill);
                action.apply(target);
            }
        }

        this._itemWindow.refresh();
        this.cancelUISkillTargeting();
    };

    Scene_Skill.prototype.cancelUISkillTargeting = function () {
        SoundManager.playCancel();
        this._dndTargetingMode = false;
        this._dndTargetingSkill = null;
        this._dndActiveSection = "actions";
        this.refreshUISkill();
    };

    Scene_Skill.prototype.handleUICancel = function () {
        if (typeof UISkillInputManager !== 'undefined') {
            UISkillInputManager.handleCancel();
        }
    };

    Scene_Skill.prototype.refreshUISkill = function () {
        if (!this._dndContainer) return;

        const actor = this.actor();
        if (!actor) return;

        // 1. Companion navigation tabs
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

        const companionsRowHTML = window.CharSwitcher.inner(
            `<div class="companion-tabs-row">${companionTabsHTML}</div>`,
            allMembers.length
        );

        // 2. Skill Types Tab Column -> Horizontal Tab Row
        const types = this.getUISkillTypes();
        // Clamp the selected type index so switching to a member with fewer
        // skill types doesn't dereference types[idx] on undefined.
        if (this._dndSelectedTypeIndex >= types.length) {
            this._dndSelectedTypeIndex = Math.max(0, types.length - 1);
        }
        // The tabs are the backpack's category chips: same class, same block,
        // same two-row shape, so a filter reads the same in both menus.
        // The two presets that fill the whole carried row ride the same rail,
        // between the overview tab and the roles: they act on the loadout rather
        // than filter the list, so they are inked apart from the tabs proper.
        const onTypesRail = this._dndActiveSection === "types";
        let typesRowHTML = "";
        this.getUISkillRail().forEach(entry => {
            if (entry.kind === "preset") {
                const isFocused = (onTypesRail && this._dndSelectedPreset === entry.preset) ? "selected" : "";
                typesRowHTML += `<div class="backpack-tab preset-tab ${isFocused}" data-rail="preset:${entry.preset}" onclick="SceneManager._scene.applyUILoadoutPreset('${entry.preset}')">${escapeHtml(T('SkillsMenu.loadout.' + entry.preset))}</div>`;
                return;
            }
            const isActive = this._dndSelectedTypeIndex === entry.index ? "active" : "";
            const isFocused = (onTypesRail && !this._dndSelectedPreset && this._dndSelectedTypeIndex === entry.index) ? "selected" : "";
            typesRowHTML += `<div class="backpack-tab ${isActive} ${isFocused}" data-rail="type:${entry.index}" onclick="SceneManager._scene.selectUISkillType(${entry.index})">${escapeHtml(entry.name)}</div>`;
        });

        const skillTypesRowHTML = `
            <div class="backpack-tabs">
                <div class="backpack-tabs-row">${typesRowHTML}</div>
            </div>
        `;

        // 3. Get the list ,  one flat, name-ordered roll of the active tab
        const list = this.getUISkillsOnlyList();
        const isLevelUp = this.isUILevelUpTab();

        // Boundary protection
        if (this._dndSelectedIndex >= list.length) {
            this._dndSelectedIndex = Math.max(0, list.length - 1);
        }

        const selectedItem = this.uiCurrentSkill();

        // Determine left page key to see if left page needs full render. The
        // carried ids are part of it: taking a skill up repaints its chip. So
        // is whichever cell of the carried row is open, which is lit there.
        const carriedKey = BattleLoadout.ids(actor).join(',');
        // The strip's own state belongs in the key too: reversing the sort
        // leaves the list the same LENGTH, so without it the page would keep
        // showing the old order.
        const barKey = this._skillBar
            ? `${this._skillBar.query}|${this._skillBar.sortKey}|${this._skillBar.sortDir}` : '';
        const leftPageKey = `${actor.actorId()}_${this._dndSelectedTypeIndex}_${list.length}_${carriedKey}_${this._dndInspectSkillId || 0}_${barKey}`;

        const skillsTitle = T('SkillsMenu.title');
        const backBtnText = T('SkillsMenu.back');

        // The pockets are filled by the windowed list further down: a spellbook
        // runs to hundreds of cards, each with its own icon canvas, and only the
        // handful on screen is ever built (UI/MenuVirtualList.js).
        const leftPageContentHTML = `<div class="backpack-grid" id="skill-grid"></div>`;

        // What the character carries, in the backpack's own quick-slot strip:
        // nine numbered slots under a header line naming the strip. The row
        // itself already says how much of it is taken, so nothing counts it in
        // words; the presets that fill it ride the tab rail at the top.
        let loadoutGridHTML = "";
        if (!isLevelUp) {
            loadoutGridHTML = `
                <div class="backpack-hotbar">
                    <div class="backpack-hotbar-mount" id="skill-loadout-mount"></div>
                </div>
            `;
        }

        const leftPageHeaderHTML = `
            <div class="page-header-bar">
                <div class="back-button focusable" onclick="SceneManager._scene.exitUISkill()">${backBtnText}</div>
                <h2 class="title">${skillsTitle}</h2>
            </div>
            ${skillTypesRowHTML}
            ${this._skillBar ? `<div class="backpack-search">${this._skillBar.fieldHTML()}${this._skillBar.filtersHTML()}</div>` : ''}
        `;

        // Header, filters, the pockets, and the quick-slot strip at the foot:
        // the backpack's left page, in that order.
        const leftPageHTML = `
            ${leftPageHeaderHTML}
            ${leftPageContentHTML}
            ${loadoutGridHTML}
        `;

        // 4. Generate Right Page: Spell / Inspect Card
        let rightPageContentHTML = "";

        if (this._dndTargetingMode && this._dndTargetingSkill) {
            const skill = this._dndTargetingSkill;
            const targetUnit = this._getUISkillTargets(skill);
            let targetsHTML = "";
            targetUnit.forEach((companion, idx) => {
                const isFocused = (this._dndActiveSection === "targets" && this._dndSelectedTargetIndex === idx) ? "selected" : "";
                targetsHTML += `
                    <div class="target-option ${isFocused}" onclick="SceneManager._scene.applyUISkillTarget(${idx})">
                        ${escapeHtml(companion.name())} (HP: ${companion.hp}/${companion.mhp})
                    </div>
                `;
            });

            if (skill.scope === 8 || skill.scope === 10) {
                const isFocused = (this._dndActiveSection === "targets" && this._dndSelectedTargetIndex === targetUnit.length) ? "selected" : "";
                targetsHTML += `
                    <div class="target-option ${isFocused}" onclick="SceneManager._scene.applyUISkillTarget(${targetUnit.length})">
                        ${T('SkillsMenu.target.allCompanions')}
                    </div>
                `;
            }

            rightPageContentHTML = `
                <div class="target-overlay">
                    <h3 class="target-title">${T('SkillsMenu.target.title')}</h3>
                    <div style="font-family: var(--font-ui); margin-bottom: 15px; color:var(--text-primary-hover);">
                        ${T('SkillsMenu.target.prompt', { skill: `<strong>${escapeHtml(dbText(skill.name))}</strong>` })}
                    </div>
                    <div class="inspect-actions">
                        ${targetsHTML}
                        <div class="inspect-btn inspect-btn--secondary" onclick="SceneManager._scene.cancelUISkillTargeting()">${T('SkillsMenu.cmd.cancel')}</div>
                    </div>
                </div>
            `;
        } else if (!selectedItem) {
            rightPageContentHTML = this._uiSkillEmptyHTML();
        } else {
            rightPageContentHTML = this._uiSkillInspectHTML(actor, selectedItem);
        }

        // 5. Render to DOM
        // The character switcher lives at the top of the RIGHT page (its own
        // static row), so the left page can start with its title straight away.
        if (!this._dndContainer.querySelector(".book-spread")) {
            // ".inspect-pockets" is what makes this the backpack's page: the
            // compact chips, the denser pockets and the flat inspect card all
            // hang off it (css/theme.css).
            this._dndContainer.innerHTML = `
                <div class="book-spread inspect-pockets">
                    <div class="left-page"></div>
                    <div class="right-page">
                        <div class="companion-switcher" id="skill-companion-row" style="flex:0 0 auto; justify-content:flex-end; min-height:26px; margin-bottom:10px;"></div>
                        <div id="skill-right-body" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column;"></div>
                    </div>
                </div>
            `;
            this._dndLastLeftPageKey = null; // force initial draw
        }

        const leftPageContainer = this._dndContainer.querySelector(".left-page");
        const rightPageContainer = this._dndContainer.querySelector("#skill-right-body");

        const companionRow = this._dndContainer.querySelector("#skill-companion-row");
        if (companionRow) companionRow.innerHTML = companionsRowHTML;

        if (this._dndLastLeftPageKey !== leftPageKey) {
            this._dndLastLeftPageKey = leftPageKey;
            leftPageContainer.innerHTML = leftPageHTML;
        } else {
            // Left page already drawn! Update only the type tabs' classes
            // in-place (companion tabs live on the right page and are rebuilt
            // above; the cards themselves are repainted with the window below).
            const typeTabs = leftPageContainer.querySelectorAll(".backpack-tab[data-rail]");
            typeTabs.forEach((tab) => {
                const tag = tab.dataset.rail || "";
                if (tag.indexOf("preset:") === 0) {
                    // A loadout chip is never the open filter, only ever focused.
                    tab.classList.remove("active");
                    tab.classList.toggle("selected", onTypesRail && this._dndSelectedPreset === tag.slice(7));
                    return;
                }
                const idx = parseInt(tag.slice(5), 10);
                tab.classList.toggle("active", idx === this._dndSelectedTypeIndex);
                tab.classList.toggle("selected", onTypesRail && !this._dndSelectedPreset && idx === this._dndSelectedTypeIndex);
            });
        }

        // The pockets themselves: only the cards the page can show are built,
        // and their icons are drawn as they come into the window
        // (UI/MenuVirtualList.js).
        this._uiSkillGrid = leftPageContainer.querySelector("#skill-grid");
        if (this._uiSkillGrid) {
            window.MenuVirtualList.render(this._uiSkillGrid, {
                key: leftPageKey,
                count: list.length,
                renderItem: (idx) => this._uiSkillCardHTML(actor, list[idx], idx, isLevelUp),
                emptyHTML: `<div class="item-grid-empty">${T('SkillsMenu.empty.section')}</div>`,
                onWindow: (win, from, to) => {
                    for (let idx = from; idx < to; idx++) {
                        const entry = list[idx];
                        const item = isLevelUp ? (entry && entry.skill) : entry;
                        if (item) this.drawUISkillIcon(item.iconIndex, `skill-canvas-${idx}`);
                    }
                }
            });
        }

        // The strip's mount point is rebuilt with the left page, but the bar's
        // own root survives it, so the slots are only ever re-mounted and
        // re-rendered , never rebuilt from scratch with the page.
        this._renderUILoadoutBar();

        // Always update right page contents inside the static right-page container (prevents full page repaint/redraws)
        rightPageContainer.innerHTML = rightPageContentHTML;

        // Draw inspect canvas icon
        if (selectedItem) {
            this.drawUISkillIcon(selectedItem.iconIndex, "inspect-canvas");
        }

        // Scroll active item into view, by index: the card being moved onto is
        // only built once the window reaches it.
        if (this._dndActiveSection === "skills" && this._uiSkillGrid) {
            window.MenuVirtualList.scrollToIndex(this._uiSkillGrid, this._dndSelectedIndex);
        }
    };

    // One pocket card: rarity stripe, icon, name, and a meta line reading cost
    // on the left and the stack chip on the right. What the chip says is
    // whether the skill is synced.
    Scene_Skill.prototype._uiSkillCardHTML = function (actor, entry, idx, isLevelUp) {
        const item = isLevelUp ? (entry && entry.skill) : entry;
        if (!item) return "";

        const isLearned = isLevelUp ? entry.isLearned : true;
        const isFocused = (this._dndActiveSection === "skills" && this._dndSelectedIndex === idx) ? "selected" : "";
        const costText = this.getUISkillCostText(item);
        // A skill the character is short of the stat for cannot be synced at
        // all, so its card is greyed out the same way an unlearned one is.
        const statSvc = window.SkillStatReq;
        const standing = statSvc && statSvc.check(actor, item);
        const isStatLocked = !isLevelUp && !!(standing && !standing.met);
        const dimStyle = ((isLevelUp && !isLearned) || isStatLocked) ? ' style="opacity:0.6;"' : '';

        // The chip in the stack-count corner. On the ledger it is the level the
        // skill is learned at; everywhere else it says whether the skill is in
        // hand, and whether that is the player's to decide , the basic kit and
        // anything worn are simply carried, and say so without offering a click.
        let chipHTML = "";
        if (isLevelUp) {
            chipHTML = `<span class="item-slot-count">Lv ${entry.level}</span>`;
        } else if (BattleLoadout.isAlwaysCarried(actor, item)) {
            chipHTML = `<span class="item-slot-count">${T('SkillsMenu.loadout.always')}</span>`;
        }
        // A synced skill wears no chip: its name is written in gold instead, so
        // the row says what it carries without spending width on a glyph.
        const syncedClass = (!isLevelUp && !BattleLoadout.isAlwaysCarried(actor, item)
            && BattleLoadout.isActive(actor, item)) ? " skill-synced" : "";
        // A skill out of sync wears no chip at all: the bare card says it, and
        // the row stays as legible as any other.

        // A skill that can be cast away from a fight is worth knowing at a
        // glance, since it is the only kind this menu can actually use.
        const fieldFlag = actor.isOccasionOk(item)
            ? `<span class="skill-field-flag">${costText ? ' · ' : ''}${escapeHtml(T('SkillsMenu.tag.field'))}</span>` : "";

        // The base stat the skill leans on, printed on the row itself. It is
        // only worth the ink when the character is SHORT of it: a skill they
        // have the sheet for reads no differently from any other, and one they
        // do not is a skill that will come apart in their hands often enough
        // that it should say so before it is carried into a fight.
        const svc = statSvc;
        const stand = standing;
        const reqFlag = (stand && !stand.met)
            ? `<span class="skill-req-flag" title="${escapeHtml(T('SkillsMenu.spec.statShort', { value: stand.have, points: stand.points, percent: Math.round(stand.failChance * 100) }))}">${escapeHtml(svc.standingLabel(actor, item))}</span>`
            : "";

        // A card can be picked up and dropped on the carried row. The ledger
        // has no row to drop onto, and a skill the anatomy teaches is not the
        // player's to place, so neither is draggable.
        const dragAttrs = (!isLevelUp && !isStatLocked && !BattleLoadout.isAlwaysCarried(actor, item))
            ? ` draggable="true" ondragstart="SceneManager._scene.onUISkillDragStart(event, ${idx})" ondragend="SceneManager._scene.onUISkillDragEnd(event)"`
            : "";

        return `
            <div class="item-slot ${isFocused}${syncedClass}${isStatLocked ? " skill-stat-locked" : ""}"${dimStyle} data-skill-idx="${idx}"${dragAttrs} onclick="SceneManager._scene.clickUISkill(${idx})" ondblclick="SceneManager._scene.dblClickUISkill(${idx})">
                <div class="item-rarity-bar" style="background:${skillStripeColor(item)};"></div>
                <div class="item-slot-icon">
                    <canvas id="skill-canvas-${idx}" width="32" height="32" style="width:32px;height:32px;"></canvas>
                </div>
                <div class="item-slot-info">
                    <div class="item-slot-name">${escapeHtml(item.name)}</div>
                    <div class="item-slot-meta">
                        <span>${escapeHtml(costText)}${fieldFlag}${reqFlag}</span>
                        ${chipHTML}
                    </div>
                </div>
            </div>
        `;
    };

    Scene_Skill.prototype.drawUISkillIcon = function (iconIndex, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const bitmap = ImageManager.loadSystem("IconSet");
        const drawIcon = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, 32, 32);
            ctx.imageSmoothingEnabled = false;

            const pw = 32;
            const ph = 32;
            const sx = (iconIndex % 16) * pw;
            const sy = Math.floor(iconIndex / 16) * ph;

            ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, 0, 0, 32, 32);
        };

        if (bitmap.isReady()) {
            drawIcon();
        } else {
            bitmap.addLoadListener(drawIcon);
        }
    };

    Scene_Skill.prototype.selectUIActor = function (idx) {
        const allMembers = $gameParty.allMembers();
        const actor = allMembers[idx];
        if (actor && actor !== this.actor()) {
            this._actorIndex = idx;
            this.changeActor();
            this.clearUIInspect();
            this._dndSelectedIndex = 0;
            this.refreshUISkill();
        }
    };

    Scene_Skill.prototype.selectUISkillType = function (idx) {
        const types = this.getUISkillTypes();
        const type = types[idx];
        if (type) {
            SoundManager.playCursor();
            this.clearUIInspect();
            this._dndSelectedPreset = null;
            this._dndSelectedTypeIndex = idx;
            this._dndSelectedIndex = 0;
            this._itemWindow.setStypeId(type.ext);
            this.refreshUISkill();
        }
    };

    Scene_Skill.prototype.selectUISkill = function (idx) {
        SoundManager.playCursor();
        this.clearUIInspect();
        this._dndSelectedIndex = idx;
        this.refreshUISkill();
    };

    Scene_Skill.prototype.clickUISkill = function (idx) {
        const alreadySelected = (!this._dndInspectSkillId &&
            this._dndActiveSection === "skills" && this._dndSelectedIndex === idx);
        this.clearUIInspect();
        this._dndActiveSection = "skills";
        this._dndSelectedIndex = idx;
        if (alreadySelected) {
            // Second click = open actions (same as pressing OK)
            const actions = this.getUISkillActions();
            if (actions.length > 0) {
                SoundManager.playOk();
                this._dndActiveSection = "actions";
                this._dndSelectedActionIndex = 0;
            } else {
                SoundManager.playCursor();
            }
        } else {
            SoundManager.playCursor();
        }
        this.refreshUISkill();
    };

    // A double click on a card syncs the skill. It never desyncs one: that is
    // what the pill, the carried row and Shift are for. A full loadout says so
    // out loud rather than quietly doing nothing.
    Scene_Skill.prototype.dblClickUISkill = function (idx) {
        const list = this.getUISkillsOnlyList();
        const skill = this.uiSkillOf(list[idx]);
        if (!skill || this.isUILevelUpTab()) return;
        if (BattleLoadout.isActive(this.actor(), skill)) return;
        this.clearUIInspect();
        this._dndActiveSection = "skills";
        this._dndSelectedIndex = idx;
        this.toggleUILoadout(skill);
    };

    // The Back button leaves the menu outright, whichever section the cursor
    // happens to be in; stepping back one level is what Cancel is for.
    Scene_Skill.prototype.exitUISkill = function () {
        SoundManager.playCancel();
        this.popScene();
    };

    // Called on mouseenter ,  lightweight hover: only patches selection classes + right-page inspector.
    // Does NOT call refreshUISkill() to avoid DOM churn / mouseenter feedback loops.
    Scene_Skill.prototype.hoverUISkill = function (idx) {
        if (!this._dndContainer) return;
        if (!this._dndInspectSkillId && this._dndActiveSection === "skills" && this._dndSelectedIndex === idx) return;

        this.clearUIInspect();
        this._dndActiveSection = "skills";
        this._dndSelectedIndex = idx;

        // 1. Patch left-page skill card selection classes in-place
        const leftPageContainer = this._dndContainer.querySelector(".left-page");
        if (leftPageContainer) {
            const skillSlots = leftPageContainer.querySelectorAll(".item-slot");
            skillSlots.forEach((slot) => {
                const sIdx = parseInt(slot.getAttribute("data-skill-idx"), 10);
                if (sIdx === idx) slot.classList.add("selected");
                else slot.classList.remove("selected");
            });
        }

        // 2. Rebuild only the right-page inspector for the newly hovered skill
        this._refreshUISkillRightPage();
    };

    // Lightweight right-page-only refresh ,  called by hoverUISkill and by refreshUISkill's tail.
    Scene_Skill.prototype._refreshUISkillRightPage = function () {
        if (!this._dndContainer) return;
        const rightPageContainer = this._dndContainer.querySelector("#skill-right-body");
        if (!rightPageContainer) return;

        const actor = this.actor();
        if (!actor) return;

        const types = this.getUISkillTypes();
        if (!types.length) return;

        const selectedItem = this.uiCurrentSkill();

        // Same card as the full refresh, so hovering a skill and selecting it
        // show identical information.
        rightPageContainer.innerHTML = selectedItem
            ? this._uiSkillInspectHTML(actor, selectedItem)
            : this._uiSkillEmptyHTML();
        if (selectedItem) this.drawUISkillIcon(selectedItem.iconIndex, "inspect-canvas");
    };

    // Keyboard and Gamepad Interceptor for Skills/Spellbook Screen
    // Read off #skill-grid rather than restated: the handheld sheet narrows
    // it, and the cursor has to step by what is drawn.
    function skillCols() {
        return window.MenuVirtualList
            ? window.MenuVirtualList.columnsOf('#skill-grid', 3) : 3;
    }

    const UISkillInputManager = {
        _scene: null,
        _active: false,

        activate: function (scene) {
            this._scene = scene;
            this._active = true;
        },

        deactivate: function () {
            this._active = false;
            this._scene = null;
        },

        update: function () {
            if (!this._active || !this._scene) return;
            // A focused search field owns the keyboard: the cursor must not walk
            // the grid under the caret (UI/MenuSearchBar.js).
            if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;

            // 1-9 assigns the skill being read to that slot of the carried row.
            for (let n = 1; n <= LOADOUT_MAX; n++) {
                if (Input.isTriggered(String(n))) {
                    if (!this._scene._dndTargetingMode) this._scene.assignUILoadoutSlot(n - 1);
                    return;
                }
            }

            // Directions: isRepeated so holding a key auto-scrolls
            if (Input.isRepeated('down')) {
                this.handleMove("down");
            } else if (Input.isRepeated('up')) {
                this.handleMove("up");
            } else if (Input.isRepeated('left')) {
                this.handleMove("left");
            } else if (Input.isRepeated('right')) {
                this.handleMove("right");
            } else if (Input.isTriggered('ok')) {
                this.handleOk();
            } else if (Input.isTriggered('shift')) {
                // Take the highlighted skill up or put it down without leaving
                // the list: the quick way to rebuild a loadout.
                this.handleQuickToggle();
            } else if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                this.handleCancel();
            } else if (Input.isTriggered('pagedown')) {
                // L1 / Q ,  next actor
                this.handleActorCycle(1);
            } else if (Input.isTriggered('pageup')) {
                // R1 / W ,  previous actor
                this.handleActorCycle(-1);
            }
        },

        handleActorCycle: function (dir) {
            const scene = this._scene;
            const allMembers = $gameParty.allMembers();
            if (allMembers.length <= 1) return;
            SoundManager.playCursor();
            scene._actorIndex = (scene._actorIndex + dir + allMembers.length) % allMembers.length;
            scene.changeActor();
            scene.clearUIInspect();
            scene._dndSelectedPreset = null;
            scene._dndSelectedIndex = 0;
            scene.refreshUISkill();
        },

        handleQuickToggle: function () {
            const scene = this._scene;
            if (!scene || scene._dndTargetingMode) return;
            if (scene._dndActiveSection !== "skills" && scene._dndActiveSection !== "actions") return;
            if (scene.isUILevelUpTab() && !scene._dndInspectSkillId) return;
            const skill = scene.uiCurrentSkill();
            if (skill) scene.toggleUILoadout(skill);
        },

        // How many skills a line of the roll holds. Must match
        // .backpack-grid grid-template-columns in css/theme.css.
        handleMove: function (dir) {
            const scene = this._scene;
            const section = scene._dndActiveSection;
            // Walking the tabs or the list is reading the list again, so
            // whatever the carried row had opened is let go.
            if (section === "types" || section === "skills") scene.clearUIInspect();
            const types = scene.getUISkillTypes();
            const skillsOnlyList = scene.getUISkillsOnlyList();

            if (section === "types") {
                // The cursor walks the whole rail, loadout chips included, so
                // they are reached with the same step that changes a filter.
                if (dir === "left" || dir === "right") {
                    const rail = scene.getUISkillRail();
                    const step = dir === "left" ? -1 : 1;
                    const next = scene.getUIRailIndex(rail) + step;
                    if (next < 0 || next >= rail.length) {
                        // Walking off either end hands the page to the neighbour.
                        if (step < 0) scene.previousActor(); else scene.nextActor();
                        const newTypes = scene.getUISkillTypes();
                        scene._dndSelectedPreset = null;
                        scene._dndSelectedTypeIndex = step < 0 ? Math.max(0, newTypes.length - 1) : 0;
                        scene._dndSelectedIndex = 0;
                        if (newTypes[scene._dndSelectedTypeIndex]) {
                            scene._itemWindow.setStypeId(newTypes[scene._dndSelectedTypeIndex].ext);
                        }
                        scene.refreshUISkill();
                        return;
                    }
                    SoundManager.playCursor();
                    const entry = rail[next];
                    if (entry.kind === "preset") {
                        scene._dndSelectedPreset = entry.preset;
                    } else {
                        scene._dndSelectedPreset = null;
                        scene._dndSelectedTypeIndex = entry.index;
                        scene._dndSelectedIndex = 0;
                        scene._itemWindow.setStypeId(types[entry.index].ext);
                    }
                    scene.refreshUISkill();
                } else if (dir === "down") {
                    if (skillsOnlyList.length > 0) {
                        SoundManager.playCursor();
                        scene._dndActiveSection = "skills";
                        scene._dndSelectedIndex = 0;
                        scene.refreshUISkill();
                    }
                }
            } else if (section === "skills") {
                const list = skillsOnlyList;
                if (dir === "left") {
                    if (scene._dndSelectedIndex > 0) {
                        SoundManager.playCursor();
                        scene._dndSelectedIndex--;
                        scene.refreshUISkill();
                    }
                } else if (dir === "right") {
                    if (scene._dndSelectedIndex < list.length - 1) {
                        SoundManager.playCursor();
                        scene._dndSelectedIndex++;
                        scene.refreshUISkill();
                    } else if (list[scene._dndSelectedIndex]) {
                        const actions = scene.getUISkillActions();
                        if (actions.length > 0) {
                            SoundManager.playCursor();
                            scene._dndActiveSection = "actions";
                            scene._dndSelectedActionIndex = 0;
                            scene.refreshUISkill();
                        }
                    }
                } else if (dir === "down") {
                    // The roll is three across (.backpack-grid), so down is a
                    // row, not a page: it only leaves the list from the last
                    // row of it. Matches the backpack exactly.
                    if (scene._dndSelectedIndex + skillCols() < list.length) {
                        SoundManager.playCursor();
                        scene._dndSelectedIndex += skillCols();
                        scene.refreshUISkill();
                    } else if (list[scene._dndSelectedIndex]) {
                        const actions = scene.getUISkillActions();
                        if (actions.length > 0) {
                            SoundManager.playCursor();
                            scene._dndActiveSection = "actions";
                            scene._dndSelectedActionIndex = 0;
                            scene.refreshUISkill();
                        }
                    }
                } else if (dir === "up") {
                    if (scene._dndSelectedIndex - skillCols() >= 0) {
                        SoundManager.playCursor();
                        scene._dndSelectedIndex -= skillCols();
                        scene.refreshUISkill();
                    } else {
                        SoundManager.playCursor();
                        scene._dndActiveSection = "types";
                        scene.refreshUISkill();
                    }
                }
            } else if (section === "actions") {
                const actions = scene.getUISkillActions();
                if (dir === "down") {
                    if (scene._dndSelectedActionIndex < actions.length - 1) {
                        SoundManager.playCursor();
                        scene._dndSelectedActionIndex++;
                        scene.refreshUISkill();
                    }
                } else if (dir === "up") {
                    if (scene._dndSelectedActionIndex > 0) {
                        SoundManager.playCursor();
                        scene._dndSelectedActionIndex--;
                        scene.refreshUISkill();
                    }
                } else if (dir === "left") {
                    SoundManager.playCursor();
                    scene.clearUIInspect();
                    scene._dndActiveSection = "skills";
                    scene.refreshUISkill();
                }
            } else if (section === "targets") {
                const membersCount = scene._getUISkillTargets(scene._dndTargetingSkill).length;
                const totalTargets = scene._dndTargetingSkill.scope === 8 || scene._dndTargetingSkill.scope === 10 ? membersCount + 1 : membersCount;
                if (dir === "down") {
                    if (scene._dndSelectedTargetIndex < totalTargets - 1) {
                        SoundManager.playCursor();
                        scene._dndSelectedTargetIndex++;
                        scene.refreshUISkill();
                    }
                } else if (dir === "up") {
                    if (scene._dndSelectedTargetIndex > 0) {
                        SoundManager.playCursor();
                        scene._dndSelectedTargetIndex--;
                        scene.refreshUISkill();
                    }
                }
            }
        },

        handleOk: function () {
            if (this._okHandled) return;
            this._okHandled = true;
            setTimeout(() => { this._okHandled = false; }, 50);

            const scene = this._scene;
            const section = scene._dndActiveSection;

            if (section === "types") {
                if (scene._dndSelectedPreset) {
                    scene.applyUILoadoutPreset(scene._dndSelectedPreset);
                    return;
                }
                if (scene.getUISkillsOnlyList().length > 0) {
                    SoundManager.playOk();
                    scene._dndActiveSection = "skills";
                    scene._dndSelectedIndex = 0;
                    scene.refreshUISkill();
                }
            } else if (section === "skills") {
                const item = scene.getUISkillsOnlyList()[scene._dndSelectedIndex];
                if (!item) return;

                const actions = scene.getUISkillActions();
                if (actions.length > 0) {
                    SoundManager.playOk();
                    scene._dndActiveSection = "actions";
                    scene._dndSelectedActionIndex = 0;
                    scene.refreshUISkill();
                }
            } else if (section === "actions") {
                const actions = scene.getUISkillActions();
                const action = actions[scene._dndSelectedActionIndex];
                if (action) {
                    scene.triggerUISkillAction(action);
                }
            } else if (section === "targets") {
                scene.applyUISkillTarget(scene._dndSelectedTargetIndex);
            }
        },

        handleCancel: function () {
            if (this._cancelHandled) return;
            this._cancelHandled = true;
            setTimeout(() => { this._cancelHandled = false; }, 50);

            const scene = this._scene;
            const section = scene._dndActiveSection;

            if (scene._dndTargetingMode) {
                scene.cancelUISkillTargeting();
                return;
            }

            if (section === "actions") {
                SoundManager.playCancel();
                scene.clearUIInspect();
                scene._dndActiveSection = "skills";
                scene.refreshUISkill();
            } else if (section === "skills") {
                SoundManager.playCancel();
                scene.clearUIInspect();
                scene._dndActiveSection = "types";
                scene.refreshUISkill();
            } else {
                SoundManager.playCancel();
                scene.popScene();
            }
        }
    };

    //=============================================================================
    // Window_SkillType ,  add Basic and Level Up tabs; block left/right for actor switching
    //=============================================================================

    Window_SkillType.prototype.processCursorMove = function () {
        if (this.isCursorMovable()) {
            const lastIndex = this.index();
            const isP2 = window.$gameSplitScreen && window.$gameSplitScreen.active &&
                SceneManager._scene instanceof Scene_Battle &&
                this._actor && this._actor.multiplayerPlayerId && this._actor.multiplayerPlayerId() === 2;
            const input = isP2 ? window.$gameSplitScreen : Input;

            if (input.isRepeated("down")) this.cursorDown(input.isTriggered("down"));
            if (input.isRepeated("up")) this.cursorUp(input.isTriggered("up"));
            // Left/Right reserved for actor switching in Scene_Skill
            if (this.index() !== lastIndex) this.playCursorSound();
        }
    };

    // The menu's tabs are roles, not skill types: a character's magic and their
    // skills belong to the same three purposes, so they are listed together.
    Window_SkillType.prototype.makeCommandList = function () {
        if (!this._actor) return;
        this.addCommand(T('SkillsMenu.cmd.allSkills'), "skill", true, "all");
        ROLE_KEYS.forEach(key => this.addCommand(getRoleDisplayName(key), "skill", true, key));
        this.addCommand(T('SkillsMenu.cmd.basic'), "skill", true, "basic");
        this.addCommand(T('SkillsMenu.cmd.esoteric'), "skill", true, "esoteric");
        this.addCommand(T('SkillsMenu.cmd.levelUp'), "skill", true, "levelup");
    };

    const _Window_SkillType_update = Window_SkillType.prototype.update;
    Window_SkillType.prototype.update = function () {
        _Window_SkillType_update.call(this);
        if (this._itemWindow) {
            this._itemWindow.setStypeId(this.currentExt());
        }
    };

    //=============================================================================
    // Window_SkillList ,  one flat roll per role tab, plus the Level Up ledger;
    //                    skill info panel connection; left/right blocked for actor switching
    //=============================================================================

    const _Window_SkillList_initialize = Window_SkillList.prototype.initialize;
    Window_SkillList.prototype.initialize = function (rect) {
        _Window_SkillList_initialize.call(this, rect);
        this._skillInfoWindow = null;
    };

    const _Window_SkillList_setActor = Window_SkillList.prototype.setActor;
    Window_SkillList.prototype.setActor = function (actor) {
        _Window_SkillList_setActor.call(this, actor);
        this.updateSkillInfo();
    };

    // --- Skill info window connection ---

    Window_SkillList.prototype.setSkillInfoWindow = function (skillInfoWindow) {
        this._skillInfoWindow = skillInfoWindow;
        this.updateSkillInfo();
    };

    Window_SkillList.prototype._isSpecialStypeId = function () {
        return this._stypeId === "levelup";
    };

    Window_SkillList.prototype.updateSkillInfo = function () {
        if (this._skillInfoWindow) {
            this._skillInfoWindow.setItem(this.item());
        }
    };

    const _Window_SkillList_update = Window_SkillList.prototype.update;
    Window_SkillList.prototype.update = function () {
        _Window_SkillList_update.call(this);
        this.updateSkillInfo();
    };

    const _Window_SkillList_select = Window_SkillList.prototype.select;
    Window_SkillList.prototype.select = function (index) {
        _Window_SkillList_select.call(this, index);
        this.updateSkillInfo();
    };

    // --- Single column ---

    Window_SkillList.prototype.maxCols = function () {
        return 2;
    };

    // --- Block left/right (Scene_Skill handles actor switching) ---




    // --- Item list construction ---

    // A role key ("Offensive"...) lists that role whole, skills and magic
    // together; a numeric skill type lists what is carried of that type.
    Window_SkillList.prototype.makeItemList = function () {
        if (!this._actor) {
            this._data = [];
            return;
        }
        if (this._stypeId === "levelup") {
            this._data = this._makeLearnableSkillsList();
        } else if (this._stypeId === "basic") {
            this._data = this._actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && isBasicSkill(skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        } else if (this._stypeId === "all") {
            this._data = this._actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && !isBasicSkill(skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        } else if (this._stypeId === "esoteric") {
            this._data = this._actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && !isBasicSkill(skill) && isEsotericSkill(skill))
                .sort((a, b) => a.name.localeCompare(b.name));
        } else if (ROLE_KEYS.includes(this._stypeId)) {
            this._data = this._actor.skills()
                .filter(skill => skill && !isDummySkill(skill) && !isBasicSkill(skill) &&
                    !isEsotericSkill(skill) && getSkillRole(skill) === this._stypeId)
                .sort((a, b) => a.name.localeCompare(b.name));
        } else {
            this._data = BattleLoadout.battleSkills(this._actor, this._stypeId);
        }
    };

    // Skills that can be learned by level up
    Window_SkillList.prototype._makeLearnableSkillsList = function () {
        if (!this._actor) return [];
        const classData = $dataClasses[this._actor._classId];
        if (!classData || !classData.learnings) return [];
        return classData.learnings
            .map(l => ({ skill: $dataSkills[l.skillId], level: l.level, isLearned: this._actor.isLearnedSkill(l.skillId) }))
            .filter(entry => entry.skill && !isDummySkill(entry.skill))
            .sort((a, b) => a.level !== b.level ? a.level - b.level : a.skill.name.localeCompare(b.skill.name));
    };

    // --- item() accessor ---

    const _Window_SkillList_item = Window_SkillList.prototype.item;
    Window_SkillList.prototype.item = function () {
        if (this._stypeId === "levelup") {
            const data = this._data[this.index()];
            return data ? data.skill : null;
        }
        return _Window_SkillList_item.call(this);
    };

    // --- isEnabled ---

    const _Window_SkillList_isEnabled = Window_SkillList.prototype.isEnabled;
    Window_SkillList.prototype.isEnabled = function (item) {
        if (this._stypeId === "levelup") return false;
        return true; // All skills selectable; the action popup handles usability
    };

    // --- Drawing ---

    Window_SkillList.prototype.drawItem = function (index) {
        if (this._stypeId === "levelup") {
            this._drawLearnableSkillItem(index);
            return;
        }

        const item = this.itemAt(index);
        if (!item) return;
        const rect = this.itemLineRect(index);

        // Every skill is selectable; a benched one is drawn faded, since it is
        // known but not in hand.
        this.changePaintOpacity(BattleLoadout.isActive(this._actor, item));
        this.drawItemName(item, rect.x, rect.y, rect.width - this.costWidth());
        this.drawSkillCost(item, rect.x, rect.y, rect.width);
        this.changePaintOpacity(1);
    };

    Window_SkillList.prototype._drawLearnableSkillItem = function (index) {
        const entry = this._data[index];
        if (!entry || !entry.skill) return;
        const rect = this.itemLineRect(index);

        if (entry.isLearned) this.changePaintOpacity(false);

        const levelText = `Lv ${entry.level}: `;
        const levelWidth = this.textWidth(levelText);
        this.drawText(levelText, rect.x, rect.y, levelWidth);

        this.drawIcon(entry.skill.iconIndex, rect.x + levelWidth, rect.y + 2);
        const nameX = rect.x + levelWidth + ImageManager.iconWidth + 4;
        this.drawText(entry.skill.name, nameX, rect.y, rect.width - (nameX - rect.x) - 60);
        this.drawSkillCost(entry.skill, rect.x, rect.y, rect.width);

        this.changePaintOpacity(true);
    };

    // --- Process OK: hand over to the action popup ---

    const _Window_SkillList_processOk = Window_SkillList.prototype.processOk;
    Window_SkillList.prototype.processOk = function () {
        if (this._stypeId === "levelup" || !this.isHandled('skillaction')) {
            _Window_SkillList_processOk.call(this);
            return;
        }
        SoundManager.playOk();
        this.updateInputData();
        this.deactivate();
        this.callHandler('skillaction');
    };

    // --- Help window ---

    const _Window_SkillList_updateHelp = Window_SkillList.prototype.updateHelp;
    Window_SkillList.prototype.updateHelp = function () {
        if (this._skillInfoWindow) {
            this._skillInfoWindow.setItem(this.item());
        }
        _Window_SkillList_updateHelp.call(this);
    };

    Window_SkillList.prototype._setHelpText = function (text) {
        if (this._helpWindow) this._helpWindow.setText(text);
    };

    //=============================================================================
    // Window_SkillAction ,  context popup: Use / Carry-Bench / Cancel
    //=============================================================================

    function Window_SkillAction() {
        this.initialize(...arguments);
    }

    Window_SkillAction.prototype = Object.create(Window_Command.prototype);
    Window_SkillAction.prototype.constructor = Window_SkillAction;

    Window_SkillAction.prototype.initialize = function (rect) {
        Window_Command.prototype.initialize.call(this, rect);
        this._actor = null;
        this._skill = null;
        this.hide();
        this.deactivate();
    };

    Window_SkillAction.prototype.makeCommandList = function () {
        if (!this._actor || !this._skill) return;
        if (this._actor.canUse(this._skill)) {
            this.addCommand(T('SkillsMenu.cmd.use'), "use", true);
        }
        if (!BattleLoadout.isAlwaysCarried(this._actor, this._skill)) {
            const carried = BattleLoadout.isActive(this._actor, this._skill);
            this.addCommand(carried ? T('SkillsMenu.cmd.bench') : T('SkillsMenu.cmd.carry'), "loadout", true);
        }
        this.addCommand(T('SkillsMenu.cmd.cancel'), "cancel", true);
    };

    Window_SkillAction.prototype.setSkill = function (actor, skill) {
        this._actor = actor;
        this._skill = skill;
        this.clearCommandList();
        this.makeCommandList();
        // Resize to fit the actual number of commands
        const n = this._list.length;
        this.height = n * this.itemHeight() + $gameSystem.windowPadding() * 2;
        this.y = Math.floor((Graphics.boxHeight - this.height) / 2);
        this.createContents();
        this.select(0);
        this.refresh();
        this.show();
        this.activate();
    };

    window.Window_SkillAction = Window_SkillAction;

    //=============================================================================
    // Window_SkillInfo ,  replaces the status window in Scene_Skill
    //=============================================================================

    function Window_SkillInfo() {
        this.initialize(...arguments);
    }

    Window_SkillInfo.prototype = Object.create(Window_Base.prototype);
    Window_SkillInfo.prototype.constructor = Window_SkillInfo;

    Window_SkillInfo.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._actor = null;
        this._skill = null;
    };

    Window_SkillInfo.prototype.setActor = function (actor) {
        if (this._actor !== actor) {
            this._actor = actor;
            this.refresh();
        }
    };

    Window_SkillInfo.prototype.setItem = function (skill) {
        if (this._skill !== skill) {
            this._skill = skill;
            this.refresh();
        }
    };

    Window_SkillInfo.prototype.refresh = function () {
        this.contents.clear();
        if (this._skill) this.drawSkillInfo();
        this.drawPartyTabs();
    };

    const _getTranslation = function (key) {
        const k = 'SkillsMenu.info.' + key;
        return T.has(k) ? T(k) : key;
    };

    // These three delegate to the shared inspect service so the Skills scene,
    // the classic info window and SkillMaster all read the same numbers.
    Window_SkillInfo.prototype.getSkillScale = function (skill) {
        return window.SkillDetails.scaleOf(skill);
    };

    Window_SkillInfo.prototype.getSkillCategory = function (skill) {
        return window.SkillDetails.categoryOf(skill);
    };

    Window_SkillInfo.prototype.isBasicSkill = function (skill) {
        return window.SkillDetails.isBasic(skill);
    };

    Window_SkillInfo.prototype.drawSkillInfo = function () {
        const skill = this._skill;
        const lh = this.lineHeight();
        const x = this.itemPadding();
        let y = this.itemPadding();

        const category = this.getSkillCategory(skill);
        if (category) {
            this.drawKeyValue(T('SkillsMenu.info.type'), category, x, y);
            y += lh;
        }

        if (skill.damage.elementId > 0) {
            this.drawIcon(63 + skill.damage.elementId - 1, x, y + 2);
            this.drawText($dataSystem.elements[skill.damage.elementId] || _getTranslation('none'), x + ImageManager.iconWidth + 4, y, 150);
            y += lh;
        }

        const scaleData = this.getSkillScale(skill);
        if (scaleData) {
            const scaleText = `${scaleData.stat} (${scaleData.grade})`;
            this.drawKeyValue(T('SkillsMenu.info.scale'), scaleText, x, y);
            if (this.isBasicSkill(skill)) {
                const basicX = x + 100 + this.textWidth(scaleText) + 20;
                this.changeTextColor(ColorManager.systemColor());
                this.drawText(T('SkillsMenu.info.basic'), basicX, y, 100);
                this.resetTextColor();
            }
            y += lh;
        }

        const damageText = this.getDamageTypeText(skill);
        if (damageText) {
            const keyWidth = 100;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(_getTranslation('effect'), x, y, keyWidth);
            this.resetTextColor();
            const maxWidth = this.contents.width - keyWidth - x * 2;
            for (const line of this.wrapText(damageText, maxWidth)) {
                this.drawText(line, x + keyWidth + 20, y, maxWidth);
                y += lh;
            }
        }
    };

    Window_SkillInfo.prototype.wrapText = function (text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let current = '';
        for (const word of words) {
            const test = current ? current + ' ' + word : word;
            if (this.textWidth(test) > maxWidth && current) {
                lines.push(current);
                current = word;
            } else {
                current = test;
            }
        }
        if (current) lines.push(current);
        return lines.length > 0 ? lines : [text];
    };

    Window_SkillInfo.prototype.drawKeyValue = function (key, value, x, y) {
        const kw = 100;
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(key, x, y, kw);
        this.resetTextColor();
        this.drawText(value, x + kw, y, this.contents.width - kw - x * 2);
    };

    Window_SkillInfo.prototype.getDamageTypeText = function (skill) {
        const damage = skill.damage;
        const typeMap = { 1: 'hpDmg', 2: 'mpDmg', 3: 'hpHeal', 4: 'mpHeal', 5: 'hpDrain', 6: 'mpDrain' };
        let text = (damage && damage.type) ? typeMap[damage.type] ? _getTranslation(typeMap[damage.type]) : "" : "";

        const effects = skill.effects || [];

        const buffEffects = effects.filter(e => e.code === 31 || e.code === 32);
        if (buffEffects.length > 0) {
            const bt = buffEffects.map(e => {
                const paramKeys = ["HP", "MP", "ATT", "DEF", "M.ATT", "M.DEF", "AGILITY", "LUCK"];
                const key = paramKeys[e.dataId];
                const paramName = key && _statsI18n ? _si18n(key) : TextManager.param(e.dataId);
                return `${_getTranslation(e.code === 31 ? 'buffs' : 'debuffs')} ${paramName}`;
            }).join(", ");
            if (text) text += ", ";
            text += bt;
        }

        const stateEffects = effects.filter(e => e.code === 21 || e.code === 22);
        if (stateEffects.length > 0) {
            const st = stateEffects.map(e => { const s = $dataStates[e.dataId]; return s ? s.name : _getTranslation('state'); }).join(", ");
            if (text) text += ", ";
            text += st;
        }

        return text || _getTranslation('none');
    };

    Window_SkillInfo.prototype.drawPartyTabs = function () {
        if (!this._actor) return;
        const allMembers = $gameParty.allMembers();
        if (allMembers.length <= 1) return;
        const actorIndex = allMembers.indexOf(this._actor);
        if (actorIndex < 0) return;

        const tabWidth = 120;
        const tabHeight = 32;
        const tabSpacing = 10;
        const arrowWidth = 20;
        const total = allMembers.length === 2 ? tabWidth : (tabWidth * 2 + tabSpacing);
        const startX = this.contents.width - total - 20;
        const startY = 8;

        const prevIdx = (actorIndex - 1 + allMembers.length) % allMembers.length;
        const nextIdx = (actorIndex + 1) % allMembers.length;

        const overlayW = total + arrowWidth * 2 + 20;
        this.contents.fillRect(startX - arrowWidth - 15, startY - 8, overlayW, tabHeight + 16, 'rgba(0,0,0,0.5)');

        if (allMembers.length === 2) {
            this.drawArrow(startX - arrowWidth - 5, startY + tabHeight / 2, "left");
            this.drawTab(allMembers[prevIdx], startX, startY, tabWidth, tabHeight);
            this.drawArrow(startX + tabWidth + 5, startY + tabHeight / 2, "right");
        } else {
            const leftX = startX;
            this.drawArrow(leftX - arrowWidth - 5, startY + tabHeight / 2, "left");
            this.drawTab(allMembers[prevIdx], leftX, startY, tabWidth, tabHeight);
            const rightX = startX + tabWidth + tabSpacing;
            this.drawTab(allMembers[nextIdx], rightX, startY, tabWidth, tabHeight);
            this.drawArrow(rightX + tabWidth + 5, startY + tabHeight / 2, "right");
        }
    };

    Window_SkillInfo.prototype.drawArrow = function (x, y, direction) {
        this.changeTextColor(ColorManager.normalColor());
        this.contents.fontSize = 22;
        const arrowText = direction === "left" ? "◀" : "▶";
        this.contents.drawText(arrowText, x - 12, y - 11, 24, 22, "center");
        this.resetFontSettings();
    };

    Window_SkillInfo.prototype.drawTab = function (actor, x, y, width, height) {
        this.contents.fillRect(x, y, width, height, ColorManager.dimColor1());
        this.contents.strokeRect(x, y, width, height, ColorManager.outlineColor());
        this.contents.fontSize = 16;
        this.changeTextColor(ColorManager.normalColor());
        this.contents.drawText(actor.name(), x, y + (height - 16) / 2 - 2, width, 16, "center");
        this.resetFontSettings();
    };

    // =====================================================================
    // Assist
    // ---------------------------------------------------------------------
    // Common event 142 (the Assist skill) calls this. It borrows one battle
    // skill from another party member and has the user cast it at once, and
    // refunds half of what that skill cost once the borrowed action is over.
    // =====================================================================
    const ASSIST_COMMON_EVENT_ID = 142;

    function isAssistSkill(skill) {
        return (skill.effects || []).some(
            e => e && e.code === 44 && Number(e.dataId) === ASSIST_COMMON_EVENT_ID
        );
    }

    PluginManager.registerCommand("CategorizedBattleSkills", "assist", function () {
        if (!$gameParty.inBattle()) return;
        const subject = BattleManager._subject;
        const user = subject && subject.isActor && subject.isActor() ? subject : $gameParty.leader();
        if (!user) return;

        const pool = [];
        for (const donor of $gameParty.battleMembers()) {
            if (donor === user || !donor.isAlive()) continue;
            for (const skill of donor.skills()) {
                // occasion 0 (always) and 1 (battle only) are the ones a
                // battler can act with; 2 and 3 never reach a turn.
                if (!skill || skill.occasion > 1) continue;
                if (isAssistSkill(skill)) continue;
                if (!user.canPaySkillCost(skill)) continue;
                pool.push({ donor: donor, skill: skill });
            }
        }
        if (pool.length === 0) {
            if ($gameMessage) $gameMessage.add(T("SkillsMenu.assist.none"));
            return;
        }

        const pick = pool[Math.floor(Math.random() * pool.length)];
        user._assistRefund = {
            mp: Math.floor(user.skillMpCost(pick.skill) / 2),
            tp: Math.floor(user.skillTpCost(pick.skill) / 2)
        };
        if ($gameMessage) {
            $gameMessage.add(T("SkillsMenu.assist.borrowed", {
                actor: pick.donor.name(),
                skill: pick.skill.name
            }));
        }
        user.forceAction(pick.skill.id, -1);
        BattleManager.forceAction(user);
    });

    const _CBS_BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function () {
        const subject = this._subject;
        if (subject && subject._assistRefund) {
            const refund = subject._assistRefund;
            subject._assistRefund = null;
            subject.gainMp(refund.mp);
            subject.gainTp(refund.tp);
        }
        _CBS_BattleManager_endAction.call(this);
    };

    window.Window_SkillInfo = Window_SkillInfo;

})();
