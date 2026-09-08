/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Magical Systems Astrological Wheel Interface.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const TAU = Math.PI * 2;

    if (!window.Scene_SkillEncyclopedia) {
        window.Scene_SkillEncyclopedia = function () {
            this.initialize(...arguments);
        };
        window.Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        window.Scene_SkillEncyclopedia.prototype.constructor = window.Scene_SkillEncyclopedia;
    }

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    Proto.openMagicSystems = function () {
        this._viewMode = 'magicSystems';
        this._magicSystemSelected = null;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeMagicSystems = function () {
        this._viewMode = 'category';
        SoundManager.playCancel();
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        this.refreshUISkillDOM();
    };

    Proto.selectMagicSystem = function (id) {
        if (this._magicSystemSelected === id) return;
        this._magicSystemSelected = id;
        SoundManager.playCursor();
        this.refreshUISkillDOM();
    };

    Proto.renderMagicSystemsView = function () {
        const leftPageBox = document.getElementById('left-page-content');
        const rightPageBox = document.getElementById('right-page-content');
        if (!leftPageBox || !rightPageBox) return;

        const backLabel = typeof T === 'function' ? T('SkillMaster.back') : 'Back';
        const titleLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.title') : 'Magical Systems';

        leftPageBox.innerHTML = `
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.closeMagicSystems()">${backLabel}</div>
              <h2 class="cc-header-gothic" style="border:none; margin:0; padding:0; text-align:center; font-size:2.542rem">${titleLabel}</h2>
            </div>
            ${this.renderMagicSystemWheelHTML()}
        `;
        rightPageBox.innerHTML = this.renderMagicSystemDetailHTML();

        this._lastLeftMode = 'magicSystems';
        this._lastRightMode = 'magicSystems';
    };

    Proto.renderMagicSystemWheelHTML = function () {
        const systems = SkillMaster.getAllMagicalSystems();
        const size = 720;
        const cx = size / 2, cy = size / 2;
        const outerR = 270;
        const pentR = 64;
        const n = Math.max(1, systems.length);
        const selected = this._magicSystemSelected;
        const actor = this.getTeachActor();
        const actorSystem = actor ? SkillMaster.getActorMagicSystem(actor.actorId()) : null;

        const pts = systems.map((sys, i) => {
            const angle = -Math.PI / 2 + (i / n) * TAU;
            return { sys, x: cx + Math.cos(angle) * outerR, y: cy + Math.sin(angle) * outerR };
        });

        let ringHTML = '';
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            ringHTML += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border-secondary-hover-translucent-15)" stroke-width="1.5" />`;
        }
        let spokesHTML = '';
        for (const p of pts) {
            spokesHTML += `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="var(--border-secondary-hover-translucent-15)" stroke-width="1" stroke-dasharray="3,4" />`;
        }

        const rimHTML = `<circle class="ms-rim" cx="${cx}" cy="${cy}" r="${outerR + 38}" fill="none" stroke="var(--border-secondary-hover-translucent-15)" stroke-width="1" stroke-dasharray="2,10" />`;

        const starPts = [];
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * (TAU / 5);
            starPts.push([cx + Math.cos(a) * pentR, cy + Math.sin(a) * pentR]);
        }
        const order = [0, 2, 4, 1, 3, 0];
        const starPath = order.map((idx, i) => `${i === 0 ? 'M' : 'L'} ${starPts[idx][0].toFixed(1)} ${starPts[idx][1].toFixed(1)}`).join(' ') + ' Z';

        let nodesHTML = '';
        for (const p of pts) {
            const isSel = selected === p.sys.id;
            const isActor = actorSystem === p.sys.id;
            const skills = SkillMaster.getSkillsForMagicSystem(p.sys.id);
            const known = actor ? skills.filter(s => actor.isLearnedSkill(s.id)).length : 0;
            const pctLabel = skills.length ? Math.round(known / skills.length * 100) + '%' : '&mdash;';
            const yourSysTitle = typeof T === 'function' ? T('SkillMaster.magicSystem.yourSystem') : 'Your System';
            nodesHTML += `
                <div class="ms-node ${isSel ? 'ms-selected' : ''} ${isActor ? 'ms-actor' : ''}" data-id="${p.sys.id}" onclick="SceneManager._scene.selectMagicSystem('${p.sys.id}')" title="${isActor ? yourSysTitle : ''}" style="left:${(p.x - 70).toFixed(1)}px; top:${(p.y - 46).toFixed(1)}px">
                    <div class="ms-ring" style="border-color:${p.sys.color}"><span class="ms-pct" style="color:${p.sys.color}">${pctLabel}</span></div>
                    <div class="ms-name" style="color:${p.sys.color}">${SkillMaster.getMagicSystemDisplayName(p.sys.id)}</div>
                </div>`;
        }

        const hintLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.hint') : 'Click a magical system to view affiliated classes and spells';

        return `
            <div style="flex:1; display:flex; align-items:center; justify-content:center; min-height:0">
                <div class="ms-wheel-box" style="position:relative; width:${size}px; height:${size}px; flex-shrink:0">
                    <svg width="${size}" height="${size}" style="position:absolute; left:0; top:0">
                        ${rimHTML}
                        <g>${ringHTML}${spokesHTML}</g>
                        <g class="ms-pentacle">
                            <circle cx="${cx}" cy="${cy}" r="${pentR + 10}" fill="none" stroke="var(--text-secondary-active, #e5c07b)" stroke-width="1.5" />
                            <path d="${starPath}" fill="none" stroke="var(--text-secondary-active, #e5c07b)" stroke-width="1.5" />
                        </g>
                    </svg>
                    ${nodesHTML}
                </div>
            </div>
            <div style="text-align:center; opacity:0.65; font-family:var(--font-ui); font-size:1.15rem; padding-top:4px">${hintLabel}</div>
        `;
    };

    Proto.renderMagicSystemDetailHTML = function () {
        const id = this._magicSystemSelected;
        if (!id) {
            const emptyLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.empty') : 'Select a system to inspect';
            return `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; gap:16px; padding:20px; box-sizing:border-box">
                    <h3 class="cc-header-gothic" style="font-size:1.9rem; color:var(--text-secondary-active, var(--text-primary-hover)); margin:0">${emptyLabel}</h3>
                </div>`;
        }
        const sys = SkillMaster.getAllMagicalSystems().find(s => s.id === id);
        const color = sys ? sys.color : 'var(--text-secondary-active, #e5c07b)';
        const classNames = SkillMaster.getClassesForMagicSystem(id);
        const noClassesLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.noClasses') : 'No classes affiliated';
        const classesHTML = classNames.length
            ? `<ul style="margin:8px 0 0 0; padding-left:20px">${classNames.map(n => `<li style="margin-bottom:4px">${n}</li>`).join('')}</ul>`
            : `<div style="opacity:0.65; margin-top:8px">${noClassesLabel}</div>`;

        const actor = this.getTeachActor();
        const skills = SkillMaster.getSkillsForMagicSystem(id);
        const known = actor ? skills.filter(s => actor.isLearnedSkill(s.id)).length : 0;
        const fractionLine = skills.length
            ? `<div style="font-family:var(--font-ui); font-size:1.1rem; color:${color}; margin-top:4px">${typeof T === 'function' ? T('SkillMaster.magicSystem.knownFraction', { known: known, total: skills.length, pct: Math.round(known / skills.length * 100) }) : `Known: ${known} / ${skills.length} (${Math.round(known / skills.length * 100)}%)`}</div>`
            : '';
        const noSpellsLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.noSpells') : 'No spells listed';
        const spellsHTML = skills.length
            ? `<ul style="margin:8px 0 0 0; padding-left:20px">${skills.map(s => {
                const isKnown = actor && actor.isLearnedSkill(s.id);
                return `<li style="margin-bottom:4px; ${isKnown ? 'color:var(--text-forest-complete, var(--text-cost-ok)); font-weight:bold;' : ''}">${isKnown ? '&#10003; ' : ''}${s.name}</li>`;
              }).join('')}</ul>`
            : `<div style="opacity:0.65; margin-top:8px">${noSpellsLabel}</div>`;

        const classesHeading = typeof T === 'function' ? T('SkillMaster.magicSystem.classesHeading') : 'Affiliated Classes';
        const spellsHeading = typeof T === 'function' ? T('SkillMaster.magicSystem.spellsHeading') : 'Curriculum Spells';

        return `
            <div style="display:flex; flex-direction:column; height:100%; box-sizing:border-box">
                <div style="display:flex; align-items:center; gap:10px; padding-bottom:10px; margin-bottom:6px">
                    <span style="width:22px; height:22px; border-radius:50%; background:${color}; flex-shrink:0; box-shadow:0 0 8px ${color}"></span>
                    <h2 class="cc-header-gothic" style="border:none; margin:0; padding:0; font-size:2.1rem">${SkillMaster.getMagicSystemDisplayName(id)}</h2>
                </div>
                ${fractionLine}
                <div style="font-family:var(--font-ui); font-size:1.2rem; line-height:1.5; color:var(--text-card-medium, #ddd); margin-top:10px">${SkillMaster.getMagicSystemDesc(id)}</div>
                <h3 class="cc-header-gothic" style="font-size:1.4rem; margin-top:18px">${classesHeading}</h3>
                <div style="font-family:var(--font-ui); font-size:1.15rem; color:var(--text-success-active); max-height:26%; overflow-y:auto">${classesHTML}</div>
                <h3 class="cc-header-gothic" style="font-size:1.4rem; margin-top:14px">${spellsHeading}</h3>
                <div class="skill-scroll-box" style="flex:1; overflow-y:auto; font-family:var(--font-ui); font-size:1.15rem; color:var(--text-success-active)">${spellsHTML}</div>
            </div>
        `;
    };

})();
