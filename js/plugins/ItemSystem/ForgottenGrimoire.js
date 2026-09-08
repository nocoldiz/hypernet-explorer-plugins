/*:
 * @target MZ
 * @plugindesc Forgotten Grimoire v1.1.0 - learn a spell from 5 random offers (parchment 2-page). [Claude]
 * @author Omni-Lex
 *
 * @help ForgottenGrimoire.js
 *
 * A parchment two-page reader. Five random offers are rolled ONCE when the book
 * opens, against the whole party, and never change: picking a different reader
 * does not reroll them. A reader can only claim an offer whose MP cost is within
 * their MAX MP, whose <StatReq: STAT N> floor their base stat clears
 * (window.SkillStatReq), and that they do not already know; the rest are greyed
 * out. Every card names the stat it is written in.
 *
 * The party's median Luck (PSI) raises the rare chance that a Forbidden spell
 * surfaces among the offers.
 *
 * An <Esoteric> or <Forbidden> offer is drawn on a live animated background
 * (violet / ember, .grim-card.arcane in css/theme.css) so a dangerous page is
 * recognisable at a glance. It still surfaces for a reader who is too young
 * for it, greyed out: window.SkillArcana asks level 20 for esoteric knowledge
 * and level 80 for forbidden knowledge. A Cultist (class 8) is the exception
 * and copies anything written down, whatever their level or stats.
 *
 * Styling reuses the shared parchment classes (#menu-container / .book-spread /
 * .left-page / .right-page / .title), so it adapts automatically to the active
 * theme (Omega Tower, Archive Foundation, ...).
 *
 * Three plugin commands:
 *   - openForbidden : only Forbidden-tagged spells. Header "Forbidden Grimoire".
 *   - openGrimoire  : a magic school (dropdown), or Random for all esoteric
 *                     spells. Header "<School> Grimoire" / "Forgotten Grimoire".
 *   - openSkillBook : a skill category (dropdown). Header "<Category> Skill Book".
 *
 * Items (X Grimoire / Y Skill Book) are linked to common events that call these
 * commands; see docs/analysis/esoteric_skills_plan.md.
 *
 * @command openForbidden
 * @text Open Forbidden Grimoire
 * @desc Offer 5 random Forbidden spells to learn.
 *
 * @command openGrimoire
 * @text Open Grimoire (Magic School)
 * @desc Offer 5 random spells from a magic school (or all esoteric if Random).
 *
 * @arg category
 * @text Magic School
 * @type select
 * @default Random
 * @option Random (Forgotten Grimoire)
 * @value Random
 * @option Pyromancy
 * @value Pyromancy
 * @option Cryomancy
 * @value Cryomancy
 * @option Electromancy
 * @value Electromancy
 * @option Idromancy
 * @value Idromancy
 * @option Aeromancy
 * @value Aeromancy
 * @option Geomancy
 * @value Geomancy
 * @option ChaosMagic
 * @value ChaosMagic
 * @option HolyMagic
 * @value HolyMagic
 * @option VoidMagic
 * @value VoidMagic
 * @option Necromancy
 * @value Necromancy
 * @option ForbiddenMagic
 * @value ForbiddenMagic
 * @option AstralMagic
 * @value AstralMagic
 * @option Arcanism
 * @value Arcanism
 * @option MetaMagic
 * @value MetaMagic
 * @option PsychicAbilities
 * @value PsychicAbilities
 * @option StatusMagic
 * @value StatusMagic
 * @option Convokation
 * @value Convokation
 * @option Augury
 * @value Augury
 * @option Chronomancy
 * @value Chronomancy
 * @option Illusion
 * @value Illusion
 * @option Mutation
 * @value Mutation
 * @option Oneiromancy
 * @value Oneiromancy
 * @option Healing
 * @value Healing
 * @option Technomagical
 * @value Technomagical
 *
 * @command openSkillBook
 * @text Open Skill Book (Skill Category)
 * @desc Offer 5 random skills from a skill category.
 *
 * @arg category
 * @text Skill Category
 * @type select
 * @default MartialArts
 * @option MartialArts
 * @value MartialArts
 * @option Swordsmanship
 * @value Swordsmanship
 * @option Bestial
 * @value Bestial
 * @option Alchemistry
 * @value Alchemistry
 * @option Firearms
 * @value Firearms
 * @option Cooking
 * @value Cooking
 * @option Performance
 * @value Performance
 * @option Leadership
 * @value Leadership
 * @option Tactical
 * @value Tactical
 * @option Roguery
 * @value Roguery
 * @option Pastoral
 * @value Pastoral
 * @option Dominion
 * @value Dominion
 * @option Economy
 * @value Economy
 * @option Vocation
 * @value Vocation
 */

(() => {
    "use strict";
    const PLUGIN = "ForgottenGrimoire";
    const OFFER_COUNT = 5;
    // How long the learned spell stays on screen before the book closes.
    const LEARN_HOLD_MS = 1500;

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------
    const prettify = (s) => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");
    const isRealSkill = (s) => s && s.name && !s.name.startsWith("<") && !s.name.startsWith("ESK");

    function medianPartyPSI() {
        const lucks = $gameParty.members().map(a => a.luk);
        if (!lucks.length) return 10;
        lucks.sort((a, b) => a - b);
        const mid = Math.floor(lucks.length / 2);
        return lucks.length % 2 ? lucks[mid] : (lucks[mid - 1] + lucks[mid]) / 2;
    }
    // very rare base chance, climbing with PSI
    function forbiddenChance() {
        return Math.min(0.35, 0.03 + medianPartyPSI() * 0.004);
    }
    function manifestLabel() {
        const p = Math.round(forbiddenChance() * 100);
        return T('Grimoire.forbiddenDraw', { percent: p });
    }

    // ---------------------------------------------------------------------
    // Input manager (keyboard / gamepad), two focus panels
    // ---------------------------------------------------------------------
    const GrimInput = {
        init(scene) { this.scene = scene; this.active = false; },
        activate() { this.active = true; },
        deactivate() { this.active = false; },
        update() {
            if (!this.active || !this.scene) return;
            const sc = this.scene;
            if (sc._busy) return;
            const onSpells = sc._focus === "spells";
            const list = onSpells ? sc._offered : $gameParty.members();
            const len = list.length;

            if (Input.isTriggered("cancel")) {
                SoundManager.playCancel();
                if (onSpells) { sc._focus = "party"; sc.syncSelection(); }
                else sc.popScene();
                return;
            }
            if (Input.isTriggered("ok")) {
                if (onSpells) sc.chooseSpell(sc._spellIdx);
                else { sc._focus = "spells"; sc._spellIdx = 0; SoundManager.playOk(); sc.syncSelection(); }
                return;
            }
            if (len === 0) {
                if ((Input.isTriggered("left") || Input.isTriggered("right")) && onSpells) {
                    sc._focus = "party"; SoundManager.playCursor(); sc.syncSelection();
                }
                return;
            }
            if (Input.isTriggered("right") && !onSpells) { sc._focus = "spells"; sc._spellIdx = 0; SoundManager.playCursor(); sc.syncSelection(); return; }
            if (Input.isTriggered("left") && onSpells) { sc._focus = "party"; SoundManager.playCursor(); sc.syncSelection(); return; }

            let moved = false, idx = onSpells ? sc._spellIdx : sc._actorIdx;
            if (Input.isRepeated("down")) { idx = (idx + 1) % len; moved = true; }
            else if (Input.isRepeated("up")) { idx = (idx - 1 + len) % len; moved = true; }
            if (moved) {
                SoundManager.playCursor();
                if (onSpells) { sc._spellIdx = idx; sc.syncSelection(); }
                else { sc.selectActor(idx); }
            }
        }
    };

    // ---------------------------------------------------------------------
    // Scene
    // ---------------------------------------------------------------------
    function Scene_ForgottenGrimoire() { this.initialize(...arguments); }
    Scene_ForgottenGrimoire.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_ForgottenGrimoire.prototype.constructor = Scene_ForgottenGrimoire;
    window.Scene_ForgottenGrimoire = Scene_ForgottenGrimoire;

    Scene_ForgottenGrimoire.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        if (this._windowLayer) this._windowLayer.visible = false;
        if (this._cancelButton) this._cancelButton.visible = false;

        const p = $gameTemp._grimoireParams || { mode: "grimoire", category: "Random" };
        this._mode = p.mode;
        this._category = p.category || "Random";
        this._focus = "party";
        this._actorIdx = 0;
        this._spellIdx = 0;
        this._busy = false;

        this._pool = this.buildPool();
        this._actor = $gameParty.members()[0] || $gameParty.leader();
        this.rollOffers();

        GrimInput.init(this);
        this.createDOM();
    };

    Scene_ForgottenGrimoire.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);
        GrimInput.update();
    };

    Scene_ForgottenGrimoire.prototype.terminate = function () {
        GrimInput.deactivate();
        if (this._dom) {
            const c = this._dom;
            c.style.transition = "opacity .2s ease-out"; c.style.opacity = "0"; c.style.pointerEvents = "none";
            setTimeout(() => { if (c && c.parentNode) c.parentNode.removeChild(c); }, 200);
            this._dom = null;
        }
        Scene_MenuBase.prototype.terminate.call(this);
    };

    Scene_ForgottenGrimoire.prototype.headerTitle = function () {
        if (this._mode === "forbidden") return T('Grimoire.forbiddenTitle');
        if (this._mode === "skillbook") {
            return T('Grimoire.skillBookTitle', { school: prettify(this._category) });
        }
        // grimoire
        if (!this._category || this._category === "Random") {  // i18n-ignore  category id
            return T('Grimoire.forgottenTitle');
        }
        return T('Grimoire.schoolTitle', { school: prettify(this._category) });
    };

    Scene_ForgottenGrimoire.prototype.buildPool = function () {
        const all = $dataSkills.filter(isRealSkill);
        if (this._mode === "forbidden") {
            return all.filter(s => s.meta && s.meta.Esoteric && s.meta.Forbidden);
        }
        if (this._mode === "grimoire" && (!this._category || this._category === "Random")) {
            return all.filter(s => s.meta && s.meta.Esoteric);
        }
        const cat = this._category;
        return all.filter(s => s.meta && String(s.meta.category) === cat);
    };

    Scene_ForgottenGrimoire.prototype.canLearn = function (actor, s) {
        return !this.blockedReason(actor, s);
    };

    // Why this reader cannot take the spell: null when they can.
    //
    // A grimoire is not a battle: what is written here has to be understood
    // before it can be copied out, so unlike the skill menu (which lets a
    // character carry anything they know and simply fumble it) the book will
    // not open for a reader who is short of the stat it is written in.
    Scene_ForgottenGrimoire.prototype.blockedReason = function (actor, s) {
        if (!actor || !s) return "mp";
        if (actor.skills().some(k => k && k.id === s.id)) return "known";
        const arcana = window.SkillArcana;
        // A Cultist reads anything that is written down: the class gimmick
        // buys past the stat floor, the MP ceiling and the level floor alike.
        if (arcana && (arcana.isSandbox() || arcana.isCultist(actor))) return null;
        // Esoteric and forbidden pages still surface for a reader who is too
        // young for them; they simply cannot be copied out yet.
        if (arcana && !arcana.canLearnFromBook(actor, s)) return "level";
        if ((s.mpCost || 0) > actor.mmp) return "mp";
        if (window.SkillStatReq && !window.SkillStatReq.meets(actor, s)) return "stat";
        return null;
    };

    // What may be OFFERED at all, as opposed to what this reader may take.
    // The level floor is deliberately ignored here so a forbidden page can be
    // shown, animated and refused rather than quietly kept out of the book.
    Scene_ForgottenGrimoire.prototype.canSurface = function (actor, s) {
        const reason = this.blockedReason(actor, s);
        return !reason || reason === "level";
    };

    // "Requires INT 14", the floor written into the spell itself.
    Scene_ForgottenGrimoire.prototype.requirementLabel = function (s) {
        const svc = window.SkillStatReq;
        const req = svc && svc.of(s);
        if (!req) return "";
        return T('Grimoire.ui.requires', { stat: svc.statName(req.stat), points: req.points });
    };

    // The five offers belong to the book, not to the reader: they are rolled
    // once when it opens against the whole party, so switching reader cannot
    // reroll them. A spell out of a given reader's reach is shown greyed.
    Scene_ForgottenGrimoire.prototype.rollOffers = function () {
        const members = $gameParty.members();
        const affordable = this._pool.filter(s => members.some(a => this.canSurface(a, s)));
        const forb = affordable.filter(s => s.meta && s.meta.Forbidden);
        const norm = affordable.filter(s => !(s.meta && s.meta.Forbidden));
        const chance = forbiddenChance();
        const pickFrom = (arr, used) => {
            const pool = arr.filter(s => !used.has(s.id));
            if (!pool.length) return null;
            return pool[Math.floor(Math.random() * pool.length)];
        };
        const used = new Set();
        const out = [];
        for (let i = 0; i < OFFER_COUNT; i++) {
            let pick = null;
            if (this._mode === "forbidden") {
                pick = pickFrom(affordable, used);
            } else {
                const wantForb = Math.random() < chance && forb.length > 0;
                pick = wantForb ? pickFrom(forb, used) : pickFrom(norm, used);
                if (!pick) pick = pickFrom(affordable, used);   // fallback
            }
            if (!pick) break;
            used.add(pick.id);
            out.push(pick);
        }
        this._offered = out;
        if (this._spellIdx >= out.length) this._spellIdx = 0;
    };

    Scene_ForgottenGrimoire.prototype.blockedLabel = function (s) {
        const reason = this.blockedReason(this._actor, s);
        if (!reason) return "";
        if (reason === "known") return T('Grimoire.ui.alreadyKnown');
        if (reason === "level") {
            const arcana = window.SkillArcana;
            const level = arcana.requiredLevel(s);
            return T(arcana.isForbidden(s) ? 'Grimoire.ui.beyondLevelForbidden' : 'Grimoire.ui.beyondLevelEsoteric', { level: level });
        }
        if (reason === "stat") {
            const svc = window.SkillStatReq;
            const req = svc.of(s);
            return T('Grimoire.ui.beyondStat', { stat: svc.statName(req.stat), points: req.points });
        }
        return T('Grimoire.ui.beyondReach');
    };

    // Changing reader leaves the five offers exactly where they are: only which
    // of them that reader can bear changes, so patch the live cards instead of
    // rebuilding the page under the cursor.
    Scene_ForgottenGrimoire.prototype.selectActor = function (i) {
        const members = $gameParty.members();
        if (i < 0 || i >= members.length) return;
        this._actorIdx = i;
        this._actor = members[i];
        this._focus = "party";
        this.syncSelection();
        this.syncOffers();
    };

    Scene_ForgottenGrimoire.prototype.syncOffers = function () {
        if (!this._dom) return;
        this._dom.querySelectorAll(".grim-card").forEach((el, i) => {
            const s = this._offered[i];
            if (!s) return;
            const label = this.blockedLabel(s);
            el.classList.toggle("blocked", !!label);
            const why = el.querySelector(".grim-blocked");
            if (why) why.textContent = label;
        });
    };

    // Cursor moves only change which card wears .sel, so paint that straight
    // onto the live nodes: rebuilding the overlay restarts every transition on
    // it and reads as a flash. A full redraw is only for changed content.
    Scene_ForgottenGrimoire.prototype.syncSelection = function () {
        if (!this._dom) return;
        this._dom.querySelectorAll(".grim-actor").forEach((el, i) => {
            el.classList.toggle("sel", this._focus === "party" && i === this._actorIdx);
        });
        this._dom.querySelectorAll(".grim-card").forEach((el, i) => {
            el.classList.toggle("sel", this._focus === "spells" && i === this._spellIdx);
        });
    };

    Scene_ForgottenGrimoire.prototype.chooseSpell = function (i) {
        const s = this._offered[i];
        if (!s || this._busy) { SoundManager.playBuzzer(); return; }
        if (this.blockedReason(this._actor, s)) { SoundManager.playBuzzer(); return; }
        this._busy = true;
        this._actor.learnSkill(s.id);
        SoundManager.playUseSkill();
        this._learnedIdx = i;
        const card = this._dom && this._dom.querySelectorAll(".grim-card")[i];
        if (card) card.classList.add("learned");
        setTimeout(() => this.popScene(), LEARN_HOLD_MS);
    };

    // ----- DOM -----
    Scene_ForgottenGrimoire.prototype.createDOM = function () {
        this._dom = document.createElement("div");
        this._dom.id = "menu-container";
        this._dom.style.opacity = "0";
        this._dom.style.transition = "opacity .22s ease-out";
        document.body.appendChild(this._dom);
        this.redraw();
        GrimInput.activate();
        setTimeout(() => { if (this._dom) this._dom.style.opacity = "1"; }, 16);
    };

    // Never name this "render": a Scene is a PIXI.Container and the renderer
    // calls container.render() every frame, which would rebuild the overlay 60
    // times a second and stop the scene's own children being drawn.
    Scene_ForgottenGrimoire.prototype.redraw = function () {
        if (!this._dom) return;
        const back = T('Grimoire.back');

        // left page: party members
        const members = $gameParty.members();
        let actorsHTML = "";
        members.forEach((a, idx) => {
            const sel = (this._focus === "party" && idx === this._actorIdx) ? "sel" : "";
            actorsHTML += `<div class="grim-actor focusable ${sel}" onclick="SceneManager._scene.selectActor(${idx})">
                <span>${a.name()}</span><span class="grim-mp">${a.mp}/${a.mmp} MP</span></div>`;
        });

        const leftHTML = `
          <div class="left-page">
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.popScene()">${back}</div>
              <h2 class="title" style="font-size:1.665em;">${this.headerTitle()}</h2>
            </div>
            <div style="font-family:var(--font-ui); font-style: normal; opacity:0.8; font-size:0.892em; margin-bottom:12px; color:var(--text-primary-hover,#58180D);">
              ${T('Grimoire.ui.blurb')}
            </div>
            <div style="font-family:var(--font-ui); font-weight:bold; font-size:0.928em; margin-bottom:6px; color:var(--text-primary-hover,#58180D);">${T('Grimoire.ui.partyReader')}</div>
            <div class="grim-list">${actorsHTML}</div>
            <div class="grim-psi">
              <div style="font-weight:bold; color:var(--accent-gold-pure,#b8860b);">${T('Grimoire.ui.psychicDiagnostics')}</div>
              <div class="row"><span>${T('Grimoire.ui.medianPsi')}</span><span style="font-weight:bold;">${medianPartyPSI()}</span></div>
              <div class="row"><span>${T('Grimoire.ui.forbiddenSurfacing')}</span><span>${manifestLabel()}</span></div>
            </div>
          </div>`;

        // right page: offers
        let cardsHTML = "";
        if (!this._offered.length) {
            cardsHTML = `<div class="grim-empty">${T('Grimoire.noSpells')}</div>`;
        } else {
            this._offered.forEach((s, idx) => {
                const sel = (this._focus === "spells" && idx === this._spellIdx) ? "sel" : "";
                const learned = (this._learnedIdx === idx) ? "learned" : "";
                const blocked = this.blockedReason(this._actor, s) ? "blocked" : "";
                const rank = window.SkillArcana ? window.SkillArcana.rank(s) : null;
                const arcane = rank ? `arcane ${rank}` : "";
                const forb = rank === "forbidden"
                    ? `<span class="grim-forbidden">${T('Grimoire.ui.forbidden')}</span>`
                    : (rank === "esoteric" ? `<span class="grim-esoteric">${T('Grimoire.ui.esoteric')}</span>` : "");
                const desc = (s.description || "").replace(/\n/g, " ");
                // The reason line is always in the DOM (empty when the reader
                // can take the spell) so syncOffers can rewrite it in place.
                const req = this.requirementLabel(s);
                cardsHTML += `<div class="grim-card focusable ${sel} ${learned} ${blocked} ${arcane}" onclick="SceneManager._scene.chooseSpell(${idx})">
                    <div class="grim-name"><span>${s.name}</span><span class="grim-mp">${s.mpCost} MP</span></div>
                    ${forb}<span class="grim-blocked">${this.blockedLabel(s)}</span>
                    ${req ? `<div class="grim-req">${req}</div>` : ""}
                    <div class="grim-desc">${desc}</div>
                </div>`;
            });
        }

        const rightHTML = `
          <div class="right-page">
            <h2 class="title" style="font-size:1.475em; margin-bottom:12px;">${T('Grimoire.ui.whisperedSpells')}</h2>
            <div class="grim-list">${cardsHTML}</div>
          </div>`;

        this._dom.innerHTML = `<div class="book-spread">${leftHTML}${rightHTML}</div>`;
    };

    // ---------------------------------------------------------------------
    // Plugin commands
    // ---------------------------------------------------------------------
    function launch(mode, category) {
        $gameTemp._grimoireParams = { mode, category: category || "Random" };
        SceneManager.push(Scene_ForgottenGrimoire);
    }
    PluginManager.registerCommand(PLUGIN, "openForbidden", () => launch("forbidden", null));
    PluginManager.registerCommand(PLUGIN, "openGrimoire", (args) => launch("grimoire", args.category || "Random"));
    PluginManager.registerCommand(PLUGIN, "openSkillBook", (args) => launch("skillbook", args.category || ""));
})();
