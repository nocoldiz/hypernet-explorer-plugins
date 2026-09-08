/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Procedural Spell & Skill Fusion System.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const FORGE_DOMINANT_IDX = 0;
    const FORGE_RECESSIVE_IDX = 1;
    const FORGE_ANIM_IDX = 2;
    const FORGE_CREATE_IDX = 3;
    const FORGE_SPLIT_BASE = 4;

    function makeFusedSpellName(names) {
        const parts = names.map(n => {
            const clean = String(n || '').replace(/[^A-Za-z]/g, '');
            if (!clean) return '';
            const chunk = clean.slice(0, 4);
            return chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase();
        }).filter(Boolean);
        return parts.join('') || 'CustomSpell';
    }

    function buildFusedSkill(components, actorId, animationId) {
        const clone = obj => JSON.parse(JSON.stringify(obj));
        const dominant = components[0];
        const recessive = components[1];
        const fused = clone(dominant);

        fused.id = $gameSystem.allocCustomSkillId();
        fused.name = makeFusedSpellName(components.map(c => c.name));
        fused.mpCost = components.reduce((sum, c) => sum + (c.mpCost || 0), 0);
        fused.tpCost = components.reduce((sum, c) => sum + (c.tpCost || 0), 0);

        fused.damage = clone(dominant.damage);
        fused.iconIndex = dominant.iconIndex;

        const recCat = recessive ? SkillMaster.getSkillCategory(recessive.id) : null;
        const recIsSkill = recCat ? SkillMaster.getCategoryType(recCat) !== 'Magic' : false;
        fused._resultIsSkill = recIsSkill;
        if (recIsSkill && recessive) {
            fused.stypeId = recessive.stypeId;
        }

        fused.effects = [];
        for (const c of components) {
            for (const e of (c.effects || [])) fused.effects.push(clone(e));
        }

        if (animationId && animationId > 0) fused.animationId = animationId;

        const names = components.map(c => c.name).join(' + ');
        const descKey = recIsSkill ? 'SkillMaster.fusedSkillDesc' : 'SkillMaster.fusedSpellDesc';
        fused.description = typeof T === 'function'
            ? T(descKey, { parts: names, dominant: dominant.name })
            : `${names} (Dominant: ${dominant.name})`;

        fused.note = '<customSpell>\n<category:' + SkillMaster.FUSION_CATEGORY + '>';
        fused.meta = { customSpell: true };
        fused._customSpell = true;
        fused._ownerActorId = actorId;
        fused._components = components.map(c => c.id);
        fused._baseSkillId = dominant.id;
        fused._animationId = fused.animationId;
        return fused;
    }

    SkillMaster.makeFusedSpellName = makeFusedSpellName;
    SkillMaster.buildFusedSkill = buildFusedSkill;

    if (!window.Scene_SkillEncyclopedia) {
        window.Scene_SkillEncyclopedia = function () {
            this.initialize(...arguments);
        };
        window.Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        window.Scene_SkillEncyclopedia.prototype.constructor = window.Scene_SkillEncyclopedia;
    }

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    Proto.getEditorCandidatesCached = function (slotIndex) {
        const actor = this.getTeachActor();
        const key = `${slotIndex}:${actor ? actor.actorId() : 0}:${this._editorSlots ? this._editorSlots.join(',') : ''}`;
        if (this._editorCandidatesKey !== key) {
            this._editorCandidatesKey = key;
            this._editorCandidatesCache = this.getEditorCandidates(slotIndex);
        }
        return this._editorCandidatesCache;
    };

    Proto.getEditorCandidates = function (slotIndex) {
        const actor = this.getTeachActor();
        if (!actor) return [];
        const dominantSlot = (slotIndex === FORGE_DOMINANT_IDX);
        const chosenElsewhere = (this._editorSlots || []).filter((id, i) => id != null && i !== slotIndex);
        return actor.skills().filter(s => {
            if (!s || !s.name) return false;
            if (s.id === 1 || s.id === 2) return false;
            if (s._customSpell) return false;
            if (!actor.isLearnedSkill(s.id)) return false;
            if (chosenElsewhere.includes(s.id)) return false;
            if (Array.isArray(s.effects) && s.effects.some(e => e && e.code === Game_Action.EFFECT_COMMON_EVENT)) return false;
            const cat = SkillMaster.getSkillCategory(s.id);
            if (cat && cat.toLowerCase() === 'basic') return false;
            const type = cat ? SkillMaster.getCategoryType(cat) : 'Skill';
            return dominantSlot ? type === 'Magic' : true;
        });
    };

    Proto.getEditorCustomSpells = function () {
        const actor = this.getTeachActor();
        if (!actor || typeof $gameSystem === 'undefined') return [];
        return $gameSystem.getCustomSpells().filter(s =>
            s && s._ownerActorId === actor.actorId() && actor.isLearnedSkill(s.id));
    };

    Proto.getAvailableAnimations = function () {
        if (!this._animCache) {
            this._animCache = [];
            if (typeof $dataAnimations !== 'undefined' && $dataAnimations) {
                for (const a of $dataAnimations) {
                    if (a && a.name && a.name.trim() && a.effectName) this._animCache.push(a);
                }
            }
        }
        return this._animCache;
    };

    Proto.getDefaultAnimId = function () {
        if (!this._editorSlots) return 0;
        for (const id of this._editorSlots) {
            const sk = id && $dataSkills[id];
            if (sk && sk.animationId > 0) return sk.animationId;
        }
        return 0;
    };

    Proto.openSpellEditor = function () {
        this._viewMode = 'spellEditor';
        this._editorSlots = [null, null];
        this._editorFocus = 0;
        this._editorPicking = false;
        this._editorPickIndex = 0;
        this._editorAnimPicking = false;
        this._editorAnimPickIndex = 0;
        this._editorAnimId = 0;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeSpellEditor = function () {
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        this._viewMode = 'category';
        this._editorPicking = false;
        this._editorAnimPicking = false;
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.editorFocusSlot = function (i) {
        this._editorFocus = i;
        const candidates = this.getEditorCandidates(i);
        if (candidates.length === 0) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return; }
        this._editorPicking = true;
        this._editorPickIndex = 0;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.editorPickCandidate = function (k) {
        const candidates = this.getEditorCandidates(this._editorFocus);
        const skill = candidates[k];
        if (!skill) { SoundManager.playBuzzer(); return; }
        this._editorSlots[this._editorFocus] = skill.id;
        this._editorPicking = false;
        if (!this._editorAnimId) this._editorAnimId = this.getDefaultAnimId();
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.openAnimPicker = function () {
        if (typeof $dataAnimations === 'undefined' || !$dataAnimations) { SoundManager.playBuzzer(); return; }
        const list = this.getAvailableAnimations();
        if (!list.length) { SoundManager.playBuzzer(); return; }
        if (this._editorAnimId <= 0 || !$dataAnimations[this._editorAnimId]) {
            this._editorAnimId = this.getDefaultAnimId();
        }
        this._animBackupId = this._editorAnimId;
        let idx = list.findIndex(a => a.id === this._editorAnimId);
        if (idx < 0) idx = 0;
        this._editorAnimPickIndex = idx;
        this._editorAnimId = list[idx].id;
        this._editorAnimPicking = true;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.editorAnimHighlight = function (k) {
        const list = this.getAvailableAnimations();
        if (!list.length) return;
        k = ((k % list.length) + list.length) % list.length;
        this._editorAnimPickIndex = k;
        this._editorAnimId = list[k].id;

        const box = document.getElementById('anim-list-box');
        if (box) {
            box.querySelectorAll('.anim-row').forEach(row => {
                const ri = parseInt(row.dataset.idx, 10);
                const on = ri === k;
                row.classList.toggle('focused', on);
            });
        }
        const label = document.getElementById('anim-preview-label');
        if (label) label.textContent = `#${list[k].id} · ${list[k].name}`;
        if (window.SkillAnimPreview) window.SkillAnimPreview.setAnimation(this._editorAnimId);
        SoundManager.playCursor();
        this.scrollToActiveItem('anim-list-box', '#anim-list-box .anim-row.focused');
    };

    Proto.editorConfirmAnim = function () {
        this._editorAnimPicking = false;
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        this._editorFocus = FORGE_ANIM_IDX;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.editorCancelAnim = function () {
        this._editorAnimPicking = false;
        this._editorAnimId = this._animBackupId || this.getDefaultAnimId();
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.editorFusionCost = function () {
        if (!this._editorSlots || !this._editorSlots.every(x => x != null)) return 0;
        const actor = this.getTeachActor();
        return SkillMaster.kpFusionCost(this._editorSlots, actor ? actor.actorId() : 0);
    };

    Proto.editorCreate = async function () {
        if (!this._editorSlots || !this._editorSlots.every(x => x != null)) { SoundManager.playBuzzer(); return; }
        const actor = this.getTeachActor();
        const components = this._editorSlots.map(id => $dataSkills[id]);
        if (components.some(c => !c)) { SoundManager.playBuzzer(); return; }

        const cost = SkillMaster.kpFusionCost(this._editorSlots, actor.actorId());
        if ($gameSystem.getKnowledge() < cost) { SoundManager.playBuzzer(); return; }
        $gameSystem.spendKnowledge(cost);

        const intMod = actor ? (actor.intMod ?? Math.floor(((actor.mat || 10) - 10) / 2)) : 0;
        const dc = Math.min(18, Math.max(10, 11 + Math.floor(cost / 30)));
        let rollRes = null;

        if (window.Dice3D) {
            rollRes = await window.Dice3D.rollD20({
                actionName: `Arcane Fusion: ${components.map(c => c.name).join(' + ')}`,
                statName: 'INT',
                modifier: intMod,
                dc: dc,
                force3D: true
            });
        } else {
            const rawRoll = Math.floor(Math.random() * 20) + 1;
            rollRes = {
                roll: rawRoll,
                modifier: intMod,
                total: rawRoll + intMod,
                nat1: rawRoll === 1,
                nat20: rawRoll === 20,
                success: rawRoll === 20 || (rawRoll !== 1 && rawRoll + intMod >= dc)
            };
        }

        const consumedSlots = this._editorSlots.slice();
        const animId = (this._editorAnimId && this._editorAnimId > 0) ? this._editorAnimId : this.getDefaultAnimId();
        this._editorSlots = [null, null];
        this._editorAnimId = 0;
        this._editorFocus = FORGE_CREATE_IDX;

        if (rollRes.success) {
            const fused = buildFusedSkill(components, actor.actorId(), animId);

            if (rollRes.nat20) {
                fused.mpCost = Math.max(1, Math.round((fused.mpCost || 1) * 0.8));
                fused.name = '★ ' + fused.name;
                if (fused.damage && fused.damage.formula) {
                    fused.damage.formula = `(${fused.damage.formula}) * 1.25`;
                }
            }

            $gameSystem.addCustomSpell(fused);
            for (const id of consumedSlots) actor.forgetSkill(id);
            actor.learnSkill(fused.id);
            this.invalidateLearnedSkillCaches();
            SoundManager.playRecovery();

            window.skipLocalization = true;
            if (typeof T === 'function') {
                if (rollRes.nat20) {
                    $gameMessage.add(T('SkillMaster.fusionCritical', {
                        result: T('SkillMaster.fusedResult', {
                            name: fused.name, cost: cost, left: $gameSystem.getKnowledge(),
                        }),
                    }));
                } else {
                    $gameMessage.add(T('SkillMaster.fusedResult', {
                        name: fused.name, cost: cost, left: $gameSystem.getKnowledge(),
                    }));
                }
            }
            window.skipLocalization = false;
        } else {
            for (const id of consumedSlots) actor.forgetSkill(id);
            this.invalidateLearnedSkillCaches();
            SoundManager.playBuzzer();

            window.skipLocalization = true;
            if (typeof T === 'function') {
                $gameMessage.add(T('SkillMaster.fusionFailed', {
                    dc: dc, components: components.map(c => c.name).join(' & '),
                }));
            }
            window.skipLocalization = false;
        }

        this.refreshUISkillDOM();
    };

    Proto.editorSplit = function (spellId) {
        const actor = this.getTeachActor();
        const spell = $dataSkills[spellId];
        if (!spell || !spell._components) { SoundManager.playBuzzer(); return; }
        const parts = spell._components.slice();

        actor.forgetSkill(spellId);
        for (const cid of parts) actor.learnSkill(cid);
        this.invalidateLearnedSkillCaches();
        $gameSystem.removeCustomSpell(spellId);

        this._editorFocus = FORGE_CREATE_IDX;
        SoundManager.playRecovery();

        window.skipLocalization = true;
        if (typeof T === 'function') {
            $gameMessage.add(T('SkillMaster.splitResult', { name: spell.name }));
        }
        window.skipLocalization = false;

        this.refreshUISkillDOM();
    };

    Proto.setupAnimPreview = function () {
        requestAnimationFrame(() => {
            if (this._viewMode !== 'spellEditor' || !this._editorAnimPicking) return;
            const canvas = document.getElementById('anim-preview-canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(64, Math.floor(rect.width));
            canvas.height = Math.max(64, Math.floor(rect.height));
            if (window.SkillAnimPreview && window.SkillAnimPreview.isSupported() && window.SkillAnimPreview.init(canvas)) {
                window.SkillAnimPreview.setAnimation(this._editorAnimId);
            }
        });
    };

    Proto.renderSpellEditor = function (useItalian, knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const actor = this.getTeachActor();
        const picking = this._editorPicking;
        const animPicking = this._editorAnimPicking;

        const slotMeta = [
            { label: typeof T === 'function' ? T('SkillMaster.dominantSpell') : 'Dominant Spell',
              hint: typeof T === 'function' ? T('SkillMaster.magicOnlyDefinesTheEffect') : 'Magic only · Defines effect & damage' },
            { label: typeof T === 'function' ? T('SkillMaster.recessiveSpellOrSkill') : 'Recessive Spell / Skill',
              hint: typeof T === 'function' ? T('SkillMaster.spellOrSkillSetsThe') : 'Spell or Skill · Determines result type' }
        ];
        let slotsHTML = '';
        this._editorSlots.forEach((id, i) => {
            const skill = id ? $dataSkills[id] : null;
            const focused = !animPicking && this._editorFocus === i;
            const meta = slotMeta[i] || { label: '', hint: '' };
            let typeBadge = '';
            if (skill && i === FORGE_RECESSIVE_IDX) {
                const cat = SkillMaster.getSkillCategory(skill.id);
                const isSkill = cat ? SkillMaster.getCategoryType(cat) !== 'Magic' : false;
                const bLabel = isSkill ? (typeof T === 'function' ? T('SkillMaster.skill') : 'Skill') : (typeof T === 'function' ? T('SkillMaster.magic') : 'Magic');
                typeBadge = `<span class="spellforge-badge spellforge-badge--inline">${bLabel}</span>`;
            }
            const inner = skill
                ? `<div class="spellforge-slot-filled"><div class="cc-rpg-icon spellforge-icon" style="${SkillMaster.getSkillIconStyle(skill.iconIndex)}"></div><span class="spellforge-slot-name">${skill.name}</span><span class="spellforge-slot-cost">MP ${skill.mpCost} · AP ${skill.tpCost}</span></div>`
                : `<span class="spellforge-slot-empty">${typeof T === 'function' ? T('SkillMaster.emptyPressToChoose') : '[ Empty - Click to choose ]'}</span>`;
            slotsHTML += `
                <div class="focusable spellforge-slot ${focused ? 'focused' : ''}" onclick="SceneManager._scene.editorFocusSlot(${i})">
                    <span class="spellforge-slot-label">${meta.label}${typeBadge}</span>
                    ${inner}
                    <span class="spellforge-slot-hint">${meta.hint}</span>
                </div>`;
        });

        const animId = (this._editorAnimId && this._editorAnimId > 0) ? this._editorAnimId : this.getDefaultAnimId();
        const animData = animId && $dataAnimations ? $dataAnimations[animId] : null;
        const animName = animData ? `#${animId} · ${animData.name}` : (typeof T === 'function' ? T('SkillMaster.default') : 'Default');
        const animFocused = !animPicking && this._editorFocus === FORGE_ANIM_IDX;
        const animRowHTML = `
            <div class="focusable spellforge-slot ${animFocused ? 'focused' : ''}" onclick="SceneManager._scene.openAnimPicker()">
                <span class="spellforge-slot-label">${typeof T === 'function' ? T('SkillMaster.animation') : 'Animation'}</span>
                <span class="spellforge-slot-name">${animName}</span>
            </div>`;

        const allFilled = this._editorSlots.every(x => x != null);
        const fuseCost = allFilled ? this.editorFusionCost() : 0;
        const canPay = !allFilled || knowledge >= fuseCost;
        const canForge = allFilled && canPay;
        const createFocused = !animPicking && this._editorFocus === FORGE_CREATE_IDX;
        const costTag = allFilled ? ` <span class="spellforge-cost-tag">&middot; ${fuseCost} KP</span>` : '';
        const createHTML = `
            <div class="focusable spellforge-button ${createFocused ? 'focused' : ''} ${canForge ? '' : 'disabled'}" onclick="SceneManager._scene.editorCreate()">
                ${typeof T === 'function' ? T('SkillMaster.fuseSpells2') : 'Fuse Spells'}${costTag}
            </div>
            <div class="spellforge-price ${canPay ? '' : 'spellforge-price--short'}">
                ${typeof T === 'function' ? T('SkillMaster.knowledge') : 'Knowledge'}: <strong>${knowledge} KP</strong>${allFilled && !canPay ? (typeof T === 'function' ? T('SkillMaster.notEnough') : ' (Not enough KP)') : ''}
            </div>`;

        const customSpells = this.getEditorCustomSpells();
        let fusedListHTML = '';
        customSpells.forEach((s, k) => {
            const focusIdx = FORGE_SPLIT_BASE + k;
            const focused = !animPicking && this._editorFocus === focusIdx;
            fusedListHTML += `
                <div class="focusable spellforge-row ${focused ? 'focused' : ''}" onclick="SceneManager._scene.editorSplit(${s.id})">
                    <span class="spellforge-row-name"><div class="cc-rpg-icon spellforge-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></div>${s.name}</span>
                    <span class="spellforge-split-tag">${typeof T === 'function' ? T('SkillMaster.split') : 'Split'}</span>
                </div>`;
        });
        if (!fusedListHTML) fusedListHTML = `<div class="spellforge-empty">${typeof T === 'function' ? T('SkillMaster.noFusedSpellsYet') : 'No fused spells forged yet'}</div>`;

        const backBtn = typeof T === 'function' ? T('SkillMaster.back') : 'Back';
        const title = typeof T === 'function' ? T('SkillMaster.fuseSpells3') : 'Spell Fusion';
        leftBox.innerHTML = `
            <div class="page-header-bar spellforge-header">
              <div class="back-button focusable" onclick="SceneManager._scene.closeSpellEditor()">${backBtn}</div>
              <h2 class="cc-header-gothic spellforge-title">${title}</h2>
            </div>
            <div class="spellforge-slot-stack">
                ${slotsHTML}
                ${animRowHTML}
                ${createHTML}
            </div>
            <div class="spellforge-rule"></div>
            <h4 class="spellforge-subhead">${typeof T === 'function' ? T('SkillMaster.fusedSpells') : 'Forged Spells'}</h4>
            <div id="fused-scroll-box" class="skill-scroll-box spellforge-scroll">
                ${fusedListHTML}
            </div>`;

        let rightHTML = '';
        if (picking) {
            const slotIdx = this._editorFocus;
            const candidates = this.getEditorCandidates(slotIdx);
            let candHTML = '';
            candidates.forEach((s, k) => {
                const focused = this._editorPickIndex === k;
                candHTML += `
                    <div class="focusable spellforge-row spellforge-row--plain ${focused ? 'focused' : ''}" onclick="SceneManager._scene.editorPickCandidate(${k})">
                        <span class="spellforge-row-name spellforge-row-name--quiet"><div class="cc-rpg-icon spellforge-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></div>${s.name}</span>
                        <span class="spellforge-row-cost">MP ${s.mpCost} · AP ${s.tpCost}</span>
                    </div>`;
            });
            if (!candHTML) candHTML = `<div class="spellforge-empty spellforge-empty--centred">${typeof T === 'function' ? T('SkillMaster.noAvailableSkillsForThis') : 'No available skills for this slot'}</div>`;
            const pickTitle = slotIdx === FORGE_DOMINANT_IDX
                ? (typeof T === 'function' ? T('SkillMaster.chooseDominantSpell') : 'Choose Dominant Spell')
                : (typeof T === 'function' ? T('SkillMaster.chooseRecessive') : 'Choose Recessive Component');
            rightHTML = `
                <div class="page-header-bar">
                  <h2 class="cc-header-gothic spellforge-title spellforge-title--pick">${pickTitle}</h2>
                </div>
                <div id="candidates-scroll-box" class="skill-scroll-box spellforge-scroll">
                    ${candHTML}
                </div>`;
        } else if (animPicking) {
            const list = this.getAvailableAnimations();
            const cur = list[this._editorAnimPickIndex] || list[0];
            const faceX = (actor.faceIndex() % 4) * 144;
            const faceY = Math.floor(actor.faceIndex() / 4) * 144;
            let rowsHTML = '';
            list.forEach((a, k) => {
                const on = this._editorAnimPickIndex === k;
                rowsHTML += `
                    <div class="anim-row spellforge-row spellforge-row--plain spellforge-row--tight ${on ? 'focused' : ''}" data-idx="${k}" onclick="SceneManager._scene.editorAnimHighlight(${k})">
                        <span class="spellforge-anim-name">${a.name}</span>
                        <span class="spellforge-anim-id">#${a.id}</span>
                    </div>`;
            });
            const pickTitle = typeof T === 'function' ? T('SkillMaster.chooseAnimation') : 'Choose Animation';
            const useLbl = typeof T === 'function' ? T('SkillMaster.use') : 'Use';
            const backLbl = typeof T === 'function' ? T('SkillMaster.cancel') : 'Cancel';
            rightHTML = `
                <div class="spellforge-page">
                    <div class="page-header-bar page-header-bar--compact">
                      <h2 class="cc-header-gothic spellforge-title spellforge-title--anim">${pickTitle}</h2>
                    </div>
                    <div class="spellforge-stage">
                        <div class="spellforge-stage-face" style="--spellforge-face:${window.UIPanel.assetUrl('img/faces/' + actor.faceName() + '.png')}; --spellforge-face-x:-${faceX}px; --spellforge-face-y:-${faceY}px"></div>
                        <canvas id="anim-preview-canvas" class="spellforge-stage-canvas"></canvas>
                    </div>
                    <div id="anim-preview-label" class="spellforge-stage-label">${cur ? `#${cur.id} · ${cur.name}` : ''}</div>
                    <div id="anim-list-box" class="skill-scroll-box spellforge-scroll spellforge-scroll--tight">
                        ${rowsHTML}
                    </div>
                    <div class="spellforge-actions">
                        <div class="focusable spellforge-action spellforge-action--primary" onclick="SceneManager._scene.editorConfirmAnim()">${useLbl}</div>
                        <div class="focusable spellforge-action" onclick="SceneManager._scene.editorCancelAnim()">${backLbl}</div>
                    </div>
                </div>`;
        } else {
            const filledIds = this._editorSlots.filter(x => x != null);
            if (filledIds.length === this._editorSlots.length) {
                const filled = this._editorSlots.map(id => $dataSkills[id]);
                const dominant = filled[FORGE_DOMINANT_IDX];
                const recessive = filled[FORGE_RECESSIVE_IDX];
                const previewName = makeFusedSpellName(filled.map(s => s.name));
                const mp = filled.reduce((a, s) => a + (s.mpCost || 0), 0);
                const ap = filled.reduce((a, s) => a + (s.tpCost || 0), 0);
                const recCat = recessive ? SkillMaster.getSkillCategory(recessive.id) : null;
                const resultIsSkill = recCat ? SkillMaster.getCategoryType(recCat) !== 'Magic' : false;
                const resultKind = resultIsSkill ? (typeof T === 'function' ? T('SkillMaster.skill') : 'Skill') : (typeof T === 'function' ? T('SkillMaster.magic') : 'Magic');
                const previewCost = this.editorFusionCost();
                rightHTML = `
                    <div class="spellforge-preview">
                        <h3 class="cc-header-gothic spellforge-preview-head">${typeof T === 'function' ? T('SkillMaster.preview2') : 'Preview'}</h3>
                        <div class="spellforge-preview-name">${previewName}</div>
                        <span class="spellforge-badge">${typeof T === 'function' ? T('SkillMaster.becomesA') : 'Becomes a'} ${resultKind}</span>
                        <div class="spellforge-preview-costs"><div><strong>${typeof T === 'function' ? T('SkillMaster.mpLabel') : 'MP'}</strong> ${mp}</div><div><strong>${typeof T === 'function' ? T('SkillMaster.apLabel') : 'AP'}</strong> ${ap}</div></div>
                        <div class="spellforge-preview-price ${knowledge >= previewCost ? '' : 'spellforge-price--short'}"><strong>${typeof T === 'function' ? T('SkillMaster.fusionCost') : 'Fusion Cost'}</strong> ${previewCost} KP <span class="spellforge-preview-purse">(${typeof T === 'function' ? T('SkillMaster.youHold') : 'You have'} ${knowledge})</span></div>
                        <div class="spellforge-rule spellforge-rule--short"></div>
                        <div class="spellforge-preview-pair">${typeof T === 'function' ? T('SkillMaster.dominant') : 'Dominant'}: <strong class="spellforge-em">${dominant.name}</strong> &middot; ${typeof T === 'function' ? T('SkillMaster.recessive') : 'Recessive'}: <strong class="spellforge-em">${recessive.name}</strong></div>
                        <div class="spellforge-preview-note">${typeof T === 'function' ? T('SkillMaster.theDominantDefinesDamageAnd') : 'Dominant sets core properties, recessive provides mixed traits.'}</div>
                    </div>`;
            } else {
                rightHTML = `
                    <div class="spellforge-preview spellforge-preview--roomy">
                        <div class="cc-rpg-icon spellforge-crest" style="${SkillMaster.getCategoryIconStyle('All')}"></div>
                        <h3 class="cc-header-gothic spellforge-preview-head">${typeof T === 'function' ? T('SkillMaster.fuseSpells3') : 'Spell Fusion'}</h3>
                        <div class="spellforge-preview-note spellforge-preview-note--lead">${typeof T === 'function' ? T('SkillMaster.forgeBlurb', { actor: actor.name(), knowledge: knowledge }) : `Combine two known abilities into a unique spell for ${actor.name()}.`}</div>
                    </div>`;
            }
        }

        rightBox.innerHTML = rightHTML;
        if (animPicking) this.setupAnimPreview();
    };

    Proto.updateSpellEditorInput = function () {
        if (this._editorPicking) {
            const candidates = this.getEditorCandidatesCached(this._editorFocus);
            const max = candidates.length;
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this._editorPicking = false;
                SoundManager.playCancel();
                this.refreshUISkillDOM();
                return;
            }
            if (max === 0) return;
            const prev = this._editorPickIndex;
            if (Input.isTriggered('ok')) { this.editorPickCandidate(this._editorPickIndex); return; }
            else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                this._editorPickIndex = (this._editorPickIndex + 1) % max;
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                this._editorPickIndex = (this._editorPickIndex - 1 + max) % max;
            }
            if (this._editorPickIndex !== prev) {
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                this.scrollToActiveItem('candidates-scroll-box', '#candidates-scroll-box .focused');
            }
            return;
        }

        if (this._editorAnimPicking) {
            const list = this.getAvailableAnimations();
            const max = list.length;
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.editorCancelAnim();
                return;
            }
            if (max === 0) return;
            if (Input.isTriggered('ok')) { this.editorConfirmAnim(); return; }
            else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                this.editorAnimHighlight(this._editorAnimPickIndex + 1);
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                this.editorAnimHighlight(this._editorAnimPickIndex - 1);
            }
            return;
        }

        const customCount = this.getEditorCustomSpells().length;
        const maxFocus = FORGE_SPLIT_BASE + customCount;
        const prev = this._editorFocus;

        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeSpellEditor();
            return;
        } else if (Input.isTriggered('ok')) {
            if (this._editorFocus <= FORGE_RECESSIVE_IDX) {
                this.editorFocusSlot(this._editorFocus);
            } else if (this._editorFocus === FORGE_ANIM_IDX) {
                this.openAnimPicker();
            } else if (this._editorFocus === FORGE_CREATE_IDX) {
                this.editorCreate();
            } else {
                const list = this.getEditorCustomSpells();
                const spell = list[this._editorFocus - FORGE_SPLIT_BASE];
                if (spell) this.editorSplit(spell.id); else SoundManager.playBuzzer();
            }
            return;
        } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
            this._editorFocus = (this._editorFocus + 1) % maxFocus;
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
            this._editorFocus = (this._editorFocus - 1 + maxFocus) % maxFocus;
        } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
            if (this._ccEnterNav('right')) return;
        }

        if (this._editorFocus !== prev) {
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            this.scrollToActiveItem('fused-scroll-box', '#fused-scroll-box .focused');
        }
    };

})();
