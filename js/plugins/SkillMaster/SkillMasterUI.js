/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Main Encyclopedia Scene & 2D Skill Tree Controller.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const CATEGORY_PAGE_COLS = 2;
    const SKILL_GRID_COLS = 2;
    const ATLAS_ZOOM_DEFAULT = 1.0;
    const ATLAS_ZOOM_WHOLE = 0.65;
    const ATLAS_ZOOM_STEP = 1.15;
    const ATLAS_WHEEL_STEP = 1.08;

    function getSwitchableMembers() {
        return ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [];
    }

    const Scene_SkillEncyclopedia = window.Scene_SkillEncyclopedia || function () {
        this.initialize(...arguments);
    };
    if (!window.Scene_SkillEncyclopedia) {
        Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        Scene_SkillEncyclopedia.prototype.constructor = Scene_SkillEncyclopedia;
        window.Scene_SkillEncyclopedia = Scene_SkillEncyclopedia;
    }

    Scene_SkillEncyclopedia.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
        this._viewMode = 'category';
        const varId = (SkillMaster.params && SkillMaster.params.variableId) || 1;
        this._preselectedSkillId = $gameVariables ? $gameVariables.value(varId) : 0;
        this.handlePreselection();
    };

    Scene_SkillEncyclopedia.prototype.handlePreselection = function () {
        this._categoryPane = 0;
        this._selectedCategoryIndex = 0;
        this._selectedSkillIndex = 0;
        this._selectedActionIndex = 0;
        this._focusSkillId = 0;
        this._atlasZoom = 0;
        this._atlasCategory = null;
        this._atlasMemory = {};
        this._categoryFuseFocused = false;

        const leader = $gameParty ? $gameParty.leader() : null;
        this._teachActorId = leader ? leader.actorId() : 1;
        SkillMaster.actorCategoryManager.setActor(this._teachActorId);

        if (this._preselectedSkillId > 0) {
            const skillId = this._preselectedSkillId;
            const skill = $dataSkills[skillId];
            if (skill) {
                const category = SkillMaster.getSkillCategory(skillId);
                if (category) {
                    this._selectedCategory = category;
                    const split = SkillMaster.getSplitSkillCategories();
                    const pane = SkillMaster.getCategoryType(category) === 'Magic' ? 1 : 0;
                    const list = pane === 1 ? split.Magic : split.Skill;
                    const catIdx = list.indexOf(category);
                    if (catIdx !== -1) {
                        this._categoryPane = pane;
                        this._selectedCategoryIndex = catIdx;
                        const skills = SkillMaster.getSkillsByCategory(category);
                        const skillIdx = skills.findIndex(s => s.id === skillId);
                        if (skillIdx !== -1) {
                            this._selectedSkillIndex = skillIdx;
                            this._focusSkillId = skillId;
                            this._viewMode = 'detail';
                            this._selectedActionIndex = 0;
                            this._preselectedSkillId = 0;
                            return;
                        }
                    }
                }
            }
            this._preselectedSkillId = 0;
        }
    };

    Scene_SkillEncyclopedia.prototype.getTeachActor = function () {
        return ($gameActors && $gameActors.actor(this._teachActorId)) || ($gameParty && $gameParty.leader());
    };

    Scene_SkillEncyclopedia.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        if (SkillMaster.injectAllCustomSpells) SkillMaster.injectAllCustomSpells();
        this.createCategoryWindow();
        this.createSkillListWindow();
        this.createSkillDetailWindow();
        this.createUISkillDOM();
        if (window.CharSwitcher) {
            window.CharSwitcher.installTabKey(this, (dir) => {
                if (this._viewMode !== 'spellEditor' && this._viewMode !== 'preview') this.cycleTeachActor(dir);
            });
        }
    };

    Scene_SkillEncyclopedia.prototype.terminate = function () {
        Scene_MenuBase.prototype.terminate.call(this);
        if (window.CCNav) window.CCNav.detach(this);
        if (window.CharSwitcher) window.CharSwitcher.removeTabKey(this);
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        if (window.SkillTree2D) window.SkillTree2D.dispose();
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

    Scene_SkillEncyclopedia.prototype.createCategoryWindow = function () {
        this._categoryWindow = new Window_SkillCategory(new Rectangle(0, 0, 100, 100));
        this._categoryWindow.visible = false;
        this.addWindow(this._categoryWindow);
    };

    Scene_SkillEncyclopedia.prototype.createSkillListWindow = function () {
        this._skillListWindow = new Window_SkillMasterList(new Rectangle(0, 0, 100, 100));
        this._skillListWindow.visible = false;
        this.addWindow(this._skillListWindow);
    };

    Scene_SkillEncyclopedia.prototype.createSkillDetailWindow = function () {
        this._skillDetailWindow = new Window_SkillDetail(new Rectangle(0, 0, 100, 100));
        this._skillDetailWindow.visible = false;
        this.addWindow(this._skillDetailWindow);
    };

    Scene_SkillEncyclopedia.prototype.createUISkillDOM = function () {
        this._dndContainer = document.createElement('div');
        this._dndContainer.id = 'menu-container';
        this._dndContainer.style.position = 'absolute';
        this._dndContainer.style.top = '0';
        this._dndContainer.style.left = '0';
        this._dndContainer.style.width = '100%';
        this._dndContainer.style.height = '100%';
        this._dndContainer.style.zIndex = '1000';
        this._dndContainer.style.background = 'radial-gradient(circle, var(--accent-bronze-translucent-78, rgba(35,28,20,0.78)) 0%, var(--shadow-heavy, rgba(0,0,0,0.92)) 100%)';
        this._dndContainer.style.display = 'flex';
        this._dndContainer.style.justifyContent = 'center';
        this._dndContainer.style.alignItems = 'center';
        this._dndContainer.style.fontFamily = "var(--font-ui)";
        this._dndContainer.style.color = 'var(--bg-bg-alt-25-translucent-8, #e5e0d8)';
        this._dndContainer.style.boxSizing = 'border-box';
        this._dndContainer.style.opacity = '0';
        this._dndContainer.style.transition = 'opacity 0.22s ease-out';

        this._dndContainer.innerHTML = `
            <div class="book-spread">
                <div class="spine-divider"></div>
                <div class="left-page" style="position:relative">
                    <div id="left-page-content" style="display:flex; flex-direction:column; flex:1; min-height:0"></div>
                </div>
                <div class="right-page" style="position:relative">
                    <div class="companion-switcher" id="skillmaster-companion-row" style="flex:0 0 auto; justify-content:flex-end; min-height:26px; margin-bottom:10px"></div>
                    <div id="right-page-content" style="display:flex; flex-direction:column; flex:1 1 auto; min-height:0"></div>
                </div>
            </div>
        `;

        document.body.appendChild(this._dndContainer);

        if (window.CCNav) window.CCNav.attach(this, this._dndContainer);

        this._dndContainer.addEventListener("wheel", (e) => {
            e.preventDefault();
            let box = e.target.closest && e.target.closest('.skill-scroll-box');
            if (!box) {
                box = document.getElementById('category-scroll-box-left') ||
                      document.getElementById('category-scroll-box-right') ||
                      document.getElementById('skills-scroll-box');
            }
            if (!box) {
                if (document.getElementById('skill-atlas-canvas')) {
                    this.setAtlasZoom(this.atlasZoom() * (e.deltaY > 0 ? 1 / ATLAS_WHEEL_STEP : ATLAS_WHEEL_STEP));
                }
                return;
            }
            box.scrollTop += e.deltaY;
        }, { passive: false });

        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        this._lastPopupKey = null;

        this.refreshUISkillDOM();

        setTimeout(() => {
            if (this._dndContainer) {
                this._dndContainer.style.opacity = '1';
            }
        }, 16);
    };

    Scene_SkillEncyclopedia.prototype.getCategoryEmoji = function (catName) {
        return '';
    };

    //=========================================================================
    // 2D Skill Tree Atlas Controller
    //=========================================================================

    Scene_SkillEncyclopedia.prototype.atlasCategories = function () {
        const split = this.getSplitCategoriesCached();
        return split.Skill.filter(c => c !== 'All').concat(split.Magic);
    };

    Scene_SkillEncyclopedia.prototype.viewedCategory = function () {
        const list = this.atlasCategories();
        if (!list.length) return null;
        if (!this._atlasCategory || !list.includes(this._atlasCategory)) {
            const chosen = this._selectedCategory;
            this._atlasCategory = list.includes(chosen) ? chosen : list[0];
        }
        return this._atlasCategory;
    };

    Scene_SkillEncyclopedia.prototype.currentAtlas = function () {
        return SkillMaster.SkillAtlas ? SkillMaster.SkillAtlas.build(this.viewedCategory()) : { circles: [], index: {} };
    };

    Scene_SkillEncyclopedia.prototype.showAtlasCategory = function (category) {
        const list = this.atlasCategories();
        if (!category || !list.includes(category) || category === this._atlasCategory) return false;
        if (!this._atlasMemory) this._atlasMemory = {};
        if (this._atlasCategory) {
            this._atlasMemory[this._atlasCategory] = {
                skillId: this._focusSkillId, zoom: this._atlasZoom
            };
        }
        this._atlasCategory = category;
        this._selectedCategory = category;
        if (this._skillListWindow) this._skillListWindow.setCategory(category);
        const kept = this._atlasMemory[category];
        this._atlasZoom = 0;
        this._focusSkillId = 0;
        if (kept && this.currentAtlas().index[kept.skillId]) {
            this._focusSkillId = kept.skillId;
            this._atlasZoom = kept.zoom || 0;
        } else {
            this.defaultGraphFocus();
        }
        return true;
    };

    Scene_SkillEncyclopedia.prototype.pageAtlasSchool = function (dir) {
        const list = this.atlasCategories();
        if (list.length <= 1) return false;
        const cur = list.indexOf(this.viewedCategory());
        const next = ((cur < 0 ? 0 : cur) + dir + list.length) % list.length;
        if (!this.showAtlasCategory(list[next])) return false;
        SoundManager.playCursor();
        this.refreshUISkillDOM();
        this.centreAtlasOnFocus();
        return true;
    };

    Scene_SkillEncyclopedia.prototype.usesGraphView = function () {
        return window.SkillTree2D && window.SkillTree2D.available() && this.currentAtlas().circles.length > 0;
    };

    Scene_SkillEncyclopedia.prototype.focusedSkill = function () {
        if (this.usesGraphView()) {
            const skill = $dataSkills[this._focusSkillId];
            if (skill) return skill;
        }
        const skills = this.getSkillsByCategoryCached(this._selectedCategory);
        return skills[this._selectedSkillIndex] || null;
    };

    Scene_SkillEncyclopedia.prototype.focusedCategory = function () {
        if (this.usesGraphView()) return this.viewedCategory();
        return this._selectedCategory;
    };

    Scene_SkillEncyclopedia.prototype.focusSkillId = function (skillId) {
        if (this.currentAtlas().index[skillId]) {
            this._focusSkillId = skillId;
            return true;
        }
        const skills = this.getSkillsByCategoryCached(this._selectedCategory);
        const idx = skills.findIndex(s => s.id === skillId);
        if (idx >= 0) {
            this._selectedSkillIndex = idx;
            this._focusSkillId = skillId;
        }
        return idx >= 0;
    };

    Scene_SkillEncyclopedia.prototype.ensureAtlasFocus = function () {
        const atlas = this.currentAtlas();
        if (!atlas.circles.length || atlas.index[this._focusSkillId]) return;
        this.defaultGraphFocus();
    };

    Scene_SkillEncyclopedia.prototype.defaultGraphFocus = function () {
        const atlas = this.currentAtlas();
        if (!atlas.circles.length) return;
        const circle = atlas.circles[0];
        const actor = this.getTeachActor();
        const known = actor ? circle.nodes.find(n => actor.isLearnedSkill(n.id)) : null;
        const entry = circle.nodes.find(n => n.tier === 0) || circle.nodes[0];
        this.focusSkillId((known || entry).id);
    };

    Scene_SkillEncyclopedia.prototype.graphStateKey = function () {
        const actor = this.getTeachActor();
        const atlas = this.currentAtlas();
        let learned = 0;
        if (actor) {
            for (const circle of atlas.circles) {
                for (const node of circle.nodes) if (actor.isLearnedSkill(node.id)) learned++;
            }
        }
        return `${atlas.key}|${actor ? actor.actorId() : 0}|${learned}`;
    };

    Scene_SkillEncyclopedia.prototype.atlasLearnedCount = function (category) {
        const circle = this.currentAtlas().circles.find(s => !category || s.category === category);
        const actor = this.getTeachActor();
        if (!circle) return { learned: 0, total: 0 };
        let learned = 0;
        if (actor) for (const node of circle.nodes) if (actor.isLearnedSkill(node.id)) learned++;
        return { learned: learned, total: circle.nodes.length };
    };

    Scene_SkillEncyclopedia.prototype.atlasProgressText = function (category) {
        const count = this.atlasLearnedCount(category);
        return typeof T === 'function' ? T('SkillMaster.atlas.progress', { learned: count.learned, total: count.total }) : `${count.learned} / ${count.total}`;
    };

    Scene_SkillEncyclopedia.prototype.atlasZoom = function () {
        if (!this._atlasZoom) this._atlasZoom = ATLAS_ZOOM_DEFAULT;
        return this._atlasZoom;
    };

    Scene_SkillEncyclopedia.prototype.defaultAtlasZoom = function () {
        return ATLAS_ZOOM_DEFAULT;
    };

    Scene_SkillEncyclopedia.prototype.wholeAtlasZoom = function () {
        return ATLAS_ZOOM_WHOLE;
    };

    Scene_SkillEncyclopedia.prototype.setAtlasZoom = function (zoom) {
        this._atlasZoom = zoom;
        if (window.SkillTree2D) window.SkillTree2D.setZoom(zoom);
    };

    Scene_SkillEncyclopedia.prototype.zoomAtlas = function (dir) {
        this.setAtlasZoom(dir > 0 ? this.atlasZoom() * ATLAS_ZOOM_STEP : this.atlasZoom() / ATLAS_ZOOM_STEP);
    };

    Scene_SkillEncyclopedia.prototype.syncAtlasSky = function () {
        const canvas = document.getElementById('skill-atlas-canvas');
        if (!canvas) {
            if (window.SkillTree2D) window.SkillTree2D.dispose();
            return;
        }
        if (!window.SkillTree2D.state || window.SkillTree2D.state.canvas !== canvas) {
            window.SkillTree2D.mount(canvas, document.getElementById('skill-atlas-labels'), this);
            if (!window.SkillTree2D.state) return;
            window.SkillTree2D.setZoom(this.atlasZoom());
            this.bindAtlasPointer();
            this._lastGraphKey = null;
        }
        const atlas = this.currentAtlas();
        const figure = atlas.circles[0] || null;
        if (window.SkillTree2D.state.figure !== figure) {
            window.SkillTree2D.setAtlas(atlas);
            this._lastGraphKey = null;
            window.SkillTree2D.setZoom(this.atlasZoom());
            window.SkillTree2D.lookAt(this._focusSkillId, true);
        }
        const graphKey = this.graphStateKey();
        if (graphKey !== this._lastGraphKey) {
            this._lastGraphKey = graphKey;
            window.SkillTree2D.repaint(this.getTeachActor(), this._focusSkillId);
        }
    };

    Scene_SkillEncyclopedia.prototype.bindAtlasPointer = function () {
        const st = window.SkillTree2D.state;
        if (!st || st.bound) return;
        const canvas = st.canvas;
        st.bound = true;
        const DEAD = 5;
        let dragging = false, fromX = 0, fromY = 0;
        st.dragged = false;

        const L = st.listeners;
        L.down = (e) => {
            if (e.button !== 0 && e.button !== 2) return;
            dragging = true;
            st.dragged = false;
            fromX = e.clientX; fromY = e.clientY;
            canvas.style.cursor = 'grabbing';
        };
        L.move = (e) => {
            const rect = canvas.getBoundingClientRect();
            if (!dragging) {
                st.hoverId = window.SkillTree2D.pick(e.clientX - rect.left, e.clientY - rect.top);
                canvas.style.cursor = st.hoverId ? 'pointer' : 'grab';
                return;
            }
            const dx = e.clientX - fromX, dy = e.clientY - fromY;
            if (!st.dragged && Math.abs(dx) + Math.abs(dy) < DEAD) return;
            st.dragged = true;
            window.SkillTree2D.pan(dx, dy);
            fromX = e.clientX; fromY = e.clientY;
        };
        L.up = () => {
            dragging = false;
            canvas.style.cursor = 'grab';
        };
        L.click = (e) => {
            if (st.dragged) { st.dragged = false; return; }
            const rect = canvas.getBoundingClientRect();
            const id = window.SkillTree2D.pick(e.clientX - rect.left, e.clientY - rect.top);
            if (id) this.selectGraphNode(id);
        };
        L.wheel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.setAtlasZoom(this.atlasZoom() * (e.deltaY > 0 ? 1 / ATLAS_WHEEL_STEP : ATLAS_WHEEL_STEP));
        };
        L.ctx = (e) => e.preventDefault();

        canvas.addEventListener('pointerdown', L.down);
        canvas.addEventListener('pointermove', L.move);
        window.addEventListener('pointerup', L.up);
        canvas.addEventListener('click', L.click);
        canvas.addEventListener('wheel', L.wheel, { passive: false });
        canvas.addEventListener('contextmenu', L.ctx);
    };

    Scene_SkillEncyclopedia.prototype.renderAtlasPagerHTML = function () {
        const list = this.atlasCategories();
        const cur = list.indexOf(this.viewedCategory());
        if (list.length <= 1 || cur < 0) return '';
        const prev = list[(cur - 1 + list.length) % list.length];
        const next = list[(cur + 1) % list.length];
        const schoolOfText = typeof T === 'function' ? T('SkillMaster.atlas.schoolOf', { index: cur + 1, total: list.length }) : `${cur + 1} / ${list.length}`;
        return `
            <div class="sg-pager">
                <span class="sg-pager-arrow" onclick="SceneManager._scene.pageAtlasSchool(-1)" title="${SkillMaster.getCategoryDisplayName(prev)}">&#8249;</span>
                <span class="sg-pager-name">${SkillMaster.getCategoryDisplayName(list[cur])}</span>
                <span class="sg-pager-count">${schoolOfText}</span>
                <span class="sg-pager-arrow" onclick="SceneManager._scene.pageAtlasSchool(1)" title="${SkillMaster.getCategoryDisplayName(next)}">&#8250;</span>
            </div>`;
    };

    Scene_SkillEncyclopedia.prototype.renderAtlasChromeHTML = function () {
        const legendKey = (color, label) =>
            `<span class="sg-legend-key"><span class="sg-legend-dot" style="border:2px solid ${color}"></span>${label}</span>`;
        const lMastered = typeof T === 'function' ? T('SkillMaster.graph.legendLearned') : 'Mastered';
        const lOpen = typeof T === 'function' ? T('SkillMaster.graph.legendOpen') : 'Available';
        const lLocked = typeof T === 'function' ? T('SkillMaster.graph.legendLocked') : 'Locked';
        const hint = typeof T === 'function' ? T('SkillMaster.atlas.hint') : 'Drag to Pan · Wheel to Zoom';

        return `
            ${this.renderAtlasPagerHTML()}
            <div class="sg-legend">
                ${legendKey('var(--border-forest-green, #52c41a)', lMastered)}
                ${legendKey('var(--text-secondary-active, #e5c07b)', lOpen)}
                ${legendKey('var(--border-secondary-hover-translucent-15, #4b5563)', lLocked)}
                <span class="sg-legend-key">
                    <span class="sg-zoom" onclick="SceneManager._scene.zoomAtlas(-1)" title="Zoom Out">-</span>
                    <span class="sg-zoom" onclick="SceneManager._scene.zoomAtlas(1)" title="Zoom In">+</span>
                </span>
                <span class="sg-hint">${hint}</span>
            </div>`;
    };

    Scene_SkillEncyclopedia.prototype.renderAtlasBannerHTML = function () {
        const category = this.viewedCategory();
        const count = this.atlasLearnedCount(category);
        const progressText = typeof T === 'function' ? T('SkillMaster.atlas.progress', { learned: count.learned, total: count.total }) : `${count.learned}/${count.total}`;
        return `${SkillMaster.getCategoryDisplayName(category)}<span class="sg-banner-sub">${progressText}</span>`;
    };

    Scene_SkillEncyclopedia.prototype.renderSkillAtlasHTML = function () {
        return `
            <div id="sg3-chrome">${this.renderAtlasChromeHTML()}</div>
            <div id="skill-atlas-box" class="sg3-sky sg2d-sky-box" style="flex:1; position:relative; overflow:hidden">
                <canvas id="skill-atlas-canvas" style="position:absolute; top:0; left:0; width:100%; height:100%"></canvas>
                <div id="skill-atlas-labels" class="sg3-labels" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none"></div>
                <div id="sg3-banner" class="sg-banner">${this.renderAtlasBannerHTML()}</div>
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.renderSkillListHTML = function () {
        const skills = SkillMaster.getSkillsByCategory(this._selectedCategory);
        const teachActor = this.getTeachActor();
        let skillsListHTML = "";

        skills.forEach((skill, idx) => {
            const isFocused = (this._selectedSkillIndex === idx);
            const isLearned = teachActor ? teachActor.isLearnedSkill(skill.id) : false;
            const isOpen = window.SkillGraph ? window.SkillGraph.isOpen(teachActor, skill.id) : true;
            const badge = isLearned
                ? `<span style="font-family:var(--font-ui); font-size:1.081rem; text-transform:uppercase; color:var(--text-forest-complete, var(--text-cost-ok)); border:1px solid var(--border-forest-green, var(--text-cost-ok)); padding:1px 5px; font-weight:bold; background:var(--bg-success-green-15, rgba(82,196,26,0.15)); letter-spacing:0.5px">${typeof T === 'function' ? T('SkillMaster.mastered') : 'Mastered'}</span>`
                : (!isOpen ? `<span style="font-family:var(--font-ui); font-size:1.081rem; text-transform:uppercase; color:var(--text-card-medium, #aaa); border:1px solid var(--border-secondary-hover-translucent-15, #555); padding:1px 5px; letter-spacing:0.5px">${typeof T === 'function' ? T('SkillMaster.graph.locked') : 'Locked'}</span>` : '');

            skillsListHTML += `
                <div class="skill-card ${isFocused ? 'focused' : ''}" onclick="SceneManager._scene.selectSkill(${idx})" style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--accent-gray-2-translucent-0, rgba(20,20,20,0.4)); border:1px solid ${isFocused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--border-secondary-hover-translucent-15, rgba(255,255,255,0.15))'}; border-radius:6px; cursor:pointer; font-family:var(--font-ui); opacity:${isLearned || isOpen ? 1 : 0.6}; transition:all 0.15s ease">
                    <div style="display:flex; align-items:center; gap:10px">
                        <div style="${SkillMaster.getSkillIconStyle(skill.iconIndex)} transform: scale(0.8); flex-shrink: 0; image-rendering: pixelated; margin-right: 2px"></div>
                        <div style="font-weight:bold; color:${isFocused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--text-card-medium, #ddd)'}; font-size:1.365rem">${skill.name}</div>
                    </div>
                    ${badge}
                </div>
            `;
        });

        return `
            <div id="skills-scroll-box" class="skill-scroll-box" style="flex:1; overflow-y:auto; padding-right:10px; display:grid; grid-template-columns:repeat(${SKILL_GRID_COLS}, 1fr); gap:10px; align-content:start; box-sizing:border-box">
                ${skillsListHTML}
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.selectGraphNode = function (skillId) {
        if (this._focusSkillId !== skillId && !this.focusSkillId(skillId)) return;
        this.scrollGraphToFocus();
        this.openFocusedSkill();
    };

    Scene_SkillEncyclopedia.prototype.openFocusedSkill = function () {
        const skill = this.focusedSkill();
        if (!skill) { SoundManager.playBuzzer(); return; }
        this._skillDetailWindow.setSkill(skill);
        this._viewMode = 'detail';
        this._selectedActionIndex = 0;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.moveGraphFocus = function (dx, dy) {
        this.ensureAtlasFocus();
        const atlas = this.currentAtlas();
        const from = atlas.index[this._focusSkillId];
        if (!from) return false;

        let best = null;
        let bestScore = Infinity;
        for (const circle of atlas.circles) {
            for (const node of circle.nodes) {
                if (node.id === from.id) continue;
                const vx = node.x - from.x;
                const vy = node.y - from.y;
                const along = vx * dx + vy * dy;
                if (along <= 0.05) continue;
                const across = Math.abs(vx * dy - vy * dx);
                if (across > along * 1.9) continue;
                const score = along + across * 2.2;
                if (score < bestScore) {
                    bestScore = score;
                    best = node;
                }
            }
        }
        if (!best) return false;
        this.focusSkillId(best.id);
        return true;
    };

    Scene_SkillEncyclopedia.prototype.scrollGraphToFocus = function () {
        if (window.SkillTree2D) {
            window.SkillTree2D.setFocus(this._focusSkillId);
            window.SkillTree2D.lookAt(this._focusSkillId, false);
        }
    };

    Scene_SkillEncyclopedia.prototype.centreAtlasOnFocus = function () {
        if (window.SkillTree2D) {
            window.SkillTree2D.setFocus(this._focusSkillId);
            window.SkillTree2D.lookAt(this._focusSkillId, true);
        }
    };

    Scene_SkillEncyclopedia.prototype.repaintAtlasFocus = function () {
        if (window.SkillTree2D) window.SkillTree2D.setFocus(this._focusSkillId);
        const title = document.getElementById('atlas-school-name');
        const activeCat = this.focusedCategory();
        if (title && activeCat) title.textContent = SkillMaster.getCategoryDisplayName(activeCat);
        const chrome = document.getElementById('sg3-chrome');
        if (chrome) {
            const html = this.renderAtlasChromeHTML();
            if (chrome.innerHTML !== html) chrome.innerHTML = html;
        }
        const banner = document.getElementById('sg3-banner');
        if (banner) {
            const html = this.renderAtlasBannerHTML();
            if (banner.innerHTML !== html) banner.innerHTML = html;
        }
    };

    //=========================================================================
    // Skill Detail Sheet Renderer
    //=========================================================================

    Scene_SkillEncyclopedia.prototype.renderSkillDetailHTML = function (skill, knowledge, opts) {
        opts = opts || {};
        const allowActionFocus = (this._viewMode === 'detail');
        let actionsListHTML = "";
        const actor = this.getTeachActor();

        if (actor) {
            const hasSkill = actor.isLearnedSkill(skill.id);
            const cost = $gameSystem.getSkillKnowledgeCost(skill.id, actor.actorId());
            const canAfford = knowledge >= cost;
            const isActionFocused = allowActionFocus && (this._selectedActionIndex === 0);
            const isOpen = window.SkillGraph ? window.SkillGraph.isOpen(actor, skill.id) : true;

            if (hasSkill) {
                const learnedLabel = typeof T === 'function' ? T('SkillMaster.learned') : 'Learned';
                actionsListHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-success-green-15, rgba(82,196,26,0.15)); border:1px solid var(--border-forest-green, var(--text-cost-ok)); border-radius:6px; color:var(--text-forest-complete, var(--text-cost-ok)); font-weight:bold; font-size:1.365rem">
                        <span>${actor.name()}</span>
                        <span style="font-family:var(--font-ui); font-size:1.196rem; text-transform:uppercase">✓ ${learnedLabel}</span>
                    </div>
                `;
                actionsListHTML += this.carryToggleHTML(actor, skill, allowActionFocus);
                actionsListHTML += this.fusionActionsHTML(actor, skill);
            } else if (!isOpen) {
                const graph = window.SkillGraph;
                const openers = graph ? graph.openers(skill.id, actor).map(s => s.name) : [];
                const wanted = graph ? graph.stillWanted(skill.id, actor) : 1;
                const lockLine = (graph && graph.isForbidden(skill.id))
                    ? (function () {
                        const isSpell = skill.stypeId === 1;
                        const kind = typeof T === 'function'
                            ? T(isSpell ? 'SkillMaster.graph.lockedKindSpells' : 'SkillMaster.graph.lockedKindSkills')
                            : (isSpell ? 'spells' : 'skills');
                        const missing = openers.length || wanted;
                        return typeof T === 'function'
                            ? T('SkillMaster.graph.lockedBySchool', { kind: kind, count: missing })
                            : `You need to know the rest of the school first, missing ${kind}: ${missing}`;
                    })()
                    : (openers.length
                        ? (wanted > 1
                            ? (typeof T === 'function' ? T('SkillMaster.graph.lockedByCount', { need: wanted, skills: openers.join(', ') }) : `Requires ${wanted} more of: ${openers.join(', ')}`)
                            : (typeof T === 'function' ? T('SkillMaster.graph.lockedBy', { skills: openers.join(', ') }) : `Requires: ${openers.join(', ')}`))
                        : (typeof T === 'function' ? T('SkillMaster.graph.lockedHint') : 'Prerequisites not yet unlocked.'));
                const lockedTitle = typeof T === 'function' ? T('SkillMaster.graph.locked') : 'Locked';
                actionsListHTML += `
                    <div style="padding:10px 14px; background:var(--bg-card-translucent-5, rgba(20,20,20,0.5)); border-radius:6px; font-family:var(--font-ui)">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; font-size:1.292rem; color:var(--text-card-medium, #ddd)">
                            <span>${lockedTitle}</span>
                            <span style="color:var(--shadow-shadow-alt-5-translucent-40, #aaa)">${cost} KP</span>
                        </div>
                        <div style="margin-top:5px; font-size:1.145rem; line-height:1.35; color:var(--text-card-medium, #bbb)">
                            ${lockLine}
                        </div>
                    </div>
                `;
            } else {
                const teachText = typeof T === 'function' ? T('SkillMaster.teachPupil', { actor: actor.name() }) : `Teach ${actor.name()}`;
                actionsListHTML += `
                    <div class="action-button ${isActionFocused ? 'focused' : ''} ${!canAfford ? 'disabled' : ''}" onclick="SceneManager._scene.teachSkill(${actor.actorId()}, ${cost})" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:${isActionFocused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--accent-gray-2-translucent-0, rgba(30,30,30,0.6))'}; border:1px solid ${isActionFocused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--border-secondary-hover-translucent-15, rgba(255,255,255,0.2))'}; border-radius:6px; cursor:${canAfford ? 'pointer' : 'not-allowed'}; font-family:var(--font-ui); opacity:${canAfford ? 1 : 0.6}; transition:all 0.15s ease">
                        <span style="font-weight:bold; color:${isActionFocused ? 'var(--text-pure-black, #000)' : 'var(--text-card-medium, #fff)'}">${teachText}</span>
                        <span style="font-family:var(--font-ui); font-weight:bold; color:${isActionFocused ? 'var(--text-pure-black, #000)' : canAfford ? 'var(--text-text-alt-3, #e5c07b)' : 'var(--shadow-shadow-alt-5-translucent-40, #888)'}">${cost} KP</span>
                    </div>
                `;
            }
        }

        const detailedInfoHTML = window.SkillDetails ? window.SkillDetails.build(skill, actor) : '';

        let descriptionText = skill.description || (typeof T === 'function' ? T('SkillMaster.noDescriptionAvailable') : 'No description available');
        if (window.translateText) descriptionText = window.translateText(descriptionText);

        const isPreviewFocused = allowActionFocus && (this._selectedActionIndex === 1);
        const previewLabel = typeof T === 'function' ? T('SkillMaster.preview') : 'Preview';
        const previewBtnHTML = `
            <div class="action-button preview-button ${isPreviewFocused ? 'focused' : ''}" onclick="SceneManager._scene.openSpellPreview(${skill.id})" style="flex:0 0 auto; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4px; padding:10px 16px; background:${isPreviewFocused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--bg-card-translucent-5, rgba(20,20,20,0.5))'}; border:1px solid ${isPreviewFocused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--border-secondary-hover-translucent-15, rgba(255,255,255,0.2))'}; border-radius:6px; cursor:pointer; font-family:var(--font-ui); transition:all 0.15s ease">
                <span style="font-size:1.658rem; line-height:1">◈</span>
                <span style="font-weight:bold; text-transform:uppercase; font-size:1.17rem; color:${isPreviewFocused ? 'var(--text-pure-black, #000)' : 'var(--text-secondary-active, #e5c07b)'}">${previewLabel}</span>
            </div>`;

        const note = skill.note || '';
        const tagForbidden = typeof T === 'function' ? T('SkillMaster.tag.forbidden') : 'Forbidden';
        const tagEsoteric = typeof T === 'function' ? T('SkillMaster.tag.esoteric') : 'Esoteric';
        const occultBadge = /<Forbidden>/i.test(note)
            ? `<span class="sg-occult sg-forbidden">${tagForbidden}</span>`
            : (/<Esoteric>/i.test(note) ? `<span class="sg-occult">${tagEsoteric}</span>` : '');

        const dt = (skill.meta && skill.meta.DamageType) ||
            (skill.note && (skill.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
        const damageTypeBadge = (dt && String(dt).trim() !== 'None')
            ? `<span>&middot;</span><span style="color:var(--text-secondary-active, var(--text-primary-hover)); font-weight:bold;">${String(dt).trim()}</span>`
            : '';

        const rootSizing = opts.popup ? 'flex:1 1 auto; min-height:0;' : 'height:100%;';
        const closeBtnHTML = opts.popup
            ? `<div class="focusable" onclick="SceneManager._scene.dismissSkillDetail()" title="${typeof T === 'function' ? T('SkillMaster.close') : 'Close'}" style="flex:0 0 auto; margin-left:auto; align-self:flex-start; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-secondary-hover-translucent-15); border-radius:50%; color:var(--text-secondary-active, var(--text-primary-hover)); cursor:pointer; font-size:1.292rem; line-height:1">✕</div>`
            : '';

        const teachLabel = typeof T === 'function' ? T('SkillMaster.teach') : 'Teach';
        const heldLabel = typeof T === 'function' ? T('SkillMaster.atlas.held', { knowledge: knowledge }) : `${knowledge} KP held`;

        return `
            <div style="display:flex; flex-direction:column; gap:12px; ${rootSizing} box-sizing:border-box">
                <div style="display:flex; align-items:center; gap:12px; border-bottom:2px solid var(--border-secondary-hover-translucent-15); padding-bottom:8px">
                    <div style="${SkillMaster.getSkillIconStyle(skill.iconIndex)} transform: scale(1.2); flex-shrink: 0; image-rendering: pixelated; margin-right: 2px"></div>
                    <div>
                        <h3 class="cc-header-gothic" style="font-size:2.134rem; color:var(--text-secondary-active, var(--text-primary-hover)); margin:0; line-height:1.2">
                            ${skill.name}
                        </h3>
                        <div style="display:flex; align-items:center; gap:8px; font-size:1.196rem; color:var(--text-inverse, #bbb); text-transform:uppercase; margin-top:3px">
                            <span>MP ${skill.mpCost || 0}</span>
                            <span>&middot;</span>
                            <span>AP ${skill.tpCost || 0}</span>
                            ${damageTypeBadge}
                            ${occultBadge}
                        </div>
                    </div>
                    ${closeBtnHTML}
                </div>

                <div style="font-size:1.292rem; line-height:1.5; color:var(--text-highlight-active, #e5e0d8); background:var(--bg-card-translucent-5, rgba(20,20,20,0.5)); border:1px solid var(--border-secondary-hover-translucent-15); border-radius:6px; padding:10px 14px">
                    "${descriptionText}"
                </div>

                <div class="skill-scroll-box" style="flex:1; min-height:0; overflow-y:auto; padding-right:6px; font-family:var(--font-ui); font-size:1.365rem; color:var(--text-card-medium, #ddd)">
                    ${detailedInfoHTML}
                </div>

                <div style="display:flex; flex-direction:column; gap:8px; margin-top:auto; padding-top:12px">
                    <h4 style="margin:0 0 4px 0; font-family:var(--font-ui); color:var(--text-secondary-active, var(--text-primary-hover)); font-size:1.658rem; text-align:center">
                        ${teachLabel}
                        <span style="font-size:1.196rem; font-weight:normal; color:var(--text-card-medium, #aaa); letter-spacing:0.5px">&middot; ${heldLabel}</span>
                    </h4>
                    <div style="display:flex; gap:8px; align-items:stretch">
                        <div style="flex:1; display:flex; flex-direction:column; gap:8px; max-height:150px; overflow-y:auto; padding-right:4px">
                            ${actionsListHTML}
                        </div>
                        ${previewBtnHTML}
                    </div>
                </div>
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.skillPopupKey = function (skill, knowledge) {
        const actor = this.getTeachActor();
        const LO = window.BattleLoadout;
        const carried = (LO && actor) ? `${LO.isActive(actor, skill) ? 1 : 0}${LO.count(actor)}` : '';
        return `${skill.id}|${actor ? actor.actorId() : 0}|${knowledge}|${this._selectedActionIndex}|${actor && actor.isLearnedSkill(skill.id) ? 1 : 0}|${carried}`;
    };

    Scene_SkillEncyclopedia.prototype.closeSkillDetailPopup = function () {
        const el = document.getElementById('skill-detail-popup');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        this._lastPopupKey = null;
    };

    Scene_SkillEncyclopedia.prototype.dismissSkillDetail = function () {
        if (this._viewMode !== 'detail') return;
        this._viewMode = 'list';
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.updateSkillDetailPopup = function (skill, knowledge) {
        if (!this._dndContainer) return;
        const key = this.skillPopupKey(skill, knowledge);
        let overlay = document.getElementById('skill-detail-popup');
        if (overlay && this._lastPopupKey === key) return;

        const cardHTML = this.renderSkillDetailHTML(skill, knowledge, { popup: true });
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'skill-detail-popup';
            overlay.style.cssText = "position:absolute; top:0; right:0; bottom:0; z-index:1500; display:flex; align-items:stretch; justify-content:flex-end; pointer-events:none; font-family:var(--font-ui);";
            this._dndContainer.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div id="skill-detail-bar" onclick="event.stopPropagation()" style="pointer-events:auto; width:min(30vw, 460px); min-width:340px; height:100%; display:flex; flex-direction:column; overflow-y:auto; padding:18px 20px; box-sizing:border-box; background:var(--bg-black-translucent-96, rgba(12,12,14,0.96)); border-left:1.5px solid var(--border-focus-hover, var(--text-primary-hover)); box-shadow:-10px 0 30px rgba(0,0,0,0.75)">
                ${cardHTML}
            </div>`;
        this._lastPopupKey = key;
    };

    //=========================================================================
    // DOM Refresh & View Modes
    //=========================================================================

    Scene_SkillEncyclopedia.prototype.refreshUISkillDOM = function () {
        if (!this._dndContainer) return;
        const useItalian = ConfigManager.language === 'it';
        const knowledge = $gameSystem.getKnowledge();

        SkillMaster.actorCategoryManager.setActor(this._teachActorId);

        const compRow = document.getElementById('skillmaster-companion-row');
        if (compRow) {
            const members = getSwitchableMembers();
            if (this._viewMode === 'spellEditor' || members.length <= 1) {
                compRow.style.display = 'none';
                compRow.innerHTML = '';
            } else {
                compRow.style.display = 'flex';
                let tabs = '';
                members.forEach((m, idx) => {
                    const sel = m.actorId() === this._teachActorId ? 'selected' : '';
                    tabs += `<div class="companion-tab ${sel}" onclick="SceneManager._scene.switchTeachActor(${idx})">${m.name()}</div>`;
                });
                compRow.innerHTML = window.CharSwitcher ? window.CharSwitcher.inner(`<div class="companion-tabs-row">${tabs}</div>`, members.length) : `<div class="companion-tabs-row">${tabs}</div>`;
            }
        }

        const graphSpread = (this._viewMode === 'list' || this._viewMode === 'detail' || this._viewMode === 'preview') && this.usesGraphView();
        if (graphSpread) this.ensureAtlasFocus();
        if (!graphSpread && window.SkillTree2D) window.SkillTree2D.dispose();

        const fullPageList = graphSpread;
        const spreadEl = this._dndContainer.querySelector('.book-spread');
        const leftPageEl = this._dndContainer.querySelector('.left-page');
        const rightPageEl = this._dndContainer.querySelector('.right-page');
        const spineEl = this._dndContainer.querySelector('.spine-divider');
        if (spreadEl) spreadEl.classList.toggle('skill-fullpage', fullPageList);
        if (leftPageEl) leftPageEl.style.width = fullPageList ? '100%' : '';
        if (rightPageEl) rightPageEl.style.display = fullPageList ? 'none' : '';
        if (spineEl) spineEl.style.display = fullPageList ? 'none' : '';

        if (compRow && compRow.style.display !== 'none') {
            if (fullPageList && leftPageEl && compRow.parentNode !== leftPageEl) {
                leftPageEl.appendChild(compRow);
                compRow.style.position = 'absolute';
                compRow.style.top = '10px';
                compRow.style.right = '45px';
                compRow.style.zIndex = '12';
                compRow.style.marginBottom = '0';
            } else if (!fullPageList && rightPageEl && compRow.parentNode !== rightPageEl) {
                rightPageEl.insertBefore(compRow, rightPageEl.firstChild);
                compRow.style.position = '';
                compRow.style.top = '';
                compRow.style.right = '';
                compRow.style.zIndex = '';
                compRow.style.marginBottom = '10px';
            }
        }

        if (!graphSpread) this.closeSkillDetailPopup();

        if (this._viewMode === 'spellEditor') {
            this.renderSpellEditor(useItalian, knowledge);
            return;
        }

        if (this._viewMode === 'magicSystems') {
            this.renderMagicSystemsView();
            return;
        }

        const renderCategoryCardsHTML = (list, pane) => {
            let html = "";
            list.forEach((cat, idx) => {
                const focused = (this._categoryPane === pane && this._selectedCategoryIndex === idx);
                const catName = SkillMaster.getCategoryDisplayName(cat);
                let bonusBadge = "";
                if (cat !== "All") {
                    if (SkillMaster.actorCategoryManager.isPrimary(cat)) {
                        bonusBadge = `<span style="font-family:var(--font-ui); font-size:1.081rem; background:var(--text-secondary-active, var(--text-primary-hover)); color:#000; padding:1px 5px; font-weight:bold; letter-spacing:0.5px">3x KP</span>`;
                    } else if (SkillMaster.actorCategoryManager.isSecondary(cat)) {
                        bonusBadge = `<span style="font-family:var(--font-ui); font-size:1.081rem; background:var(--text-secondary-active, var(--text-primary-hover)); color:#000; padding:1px 5px; font-weight:bold; letter-spacing:0.5px">1.5x KP</span>`;
                    } else if (SkillMaster.actorCategoryManager.isForeign(cat)) {
                        bonusBadge = `<span style="font-family:var(--font-ui); font-size:1.081rem; background:transparent; color:var(--text-card-medium, #aaa); border:1px solid var(--border-secondary-hover-translucent-15); padding:1px 5px; font-weight:bold; letter-spacing:0.5px">${typeof T === 'function' ? T('SkillMaster.foreignSchool') : 'Foreign'}</span>`;
                    }
                }
                html += `
                    <div class="category-card ${focused ? 'focused' : ''}" data-pane="${pane}" data-idx="${idx}" onclick="SceneManager._scene.selectCategoryClick(${pane}, ${idx})" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:8px; padding:14px 8px; min-height:100px; background:${focused ? 'var(--bg-tertiary-focus-translucent-45, rgba(45,35,25,0.45))' : 'var(--bg-card-translucent-5, rgba(20,20,20,0.5))'}; border:1.5px solid ${focused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--border-secondary-hover-translucent-15, rgba(255,255,255,0.2))'}; border-radius:8px; cursor:pointer; font-family:var(--font-ui); transition:all 0.15s ease">
                        <div style="${SkillMaster.getCategoryIconStyle(cat)} transform: scale(1.35); flex-shrink: 0; image-rendering: pixelated"></div>
                        <div class="category-card-name" style="font-weight:bold; color:${focused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--text-card-medium, #ddd)'}; font-size:1.329rem; line-height:1.2">
                            ${catName}
                        </div>
                        ${bonusBadge}
                    </div>
                `;
            });
            return html;
        };

        const leftPageBox = document.getElementById('left-page-content');
        if (!leftPageBox) return;

        const leftMode = graphSpread ? 'atlas' : this._viewMode;
        const needsLeftRebuild = (this._lastLeftMode !== leftMode) ||
            (leftMode !== 'atlas' && this._viewMode !== 'category' &&
                this._lastLeftCategory !== this._selectedCategory);

        if (needsLeftRebuild) {
            let leftPageHTML = "";
            if (this._viewMode === 'category') {
                const split = SkillMaster.getSplitSkillCategories();
                const categoriesListHTML = renderCategoryCardsHTML(split.Skill, 0);
                const backBtnText = typeof T === 'function' ? T('SkillMaster.back') : 'Back';
                const skillsTitle = typeof T === 'function' ? T('SkillMaster.skills') : 'Skills';

                leftPageHTML = `
                    <div class="page-header-bar">
                      <div class="back-button focusable" onclick="SceneManager._scene.categoryBack()">${backBtnText}</div>
                      <h2 class="cc-header-gothic" style="text-align:center; font-size:2.542rem">${skillsTitle}</h2>
                    </div>
                    <div id="category-scroll-box-left" class="skill-scroll-box" style="flex:1; overflow-y:auto; padding-right:10px; display:grid; grid-template-columns:repeat(${CATEGORY_PAGE_COLS}, 1fr); gap:10px; align-content:start; box-sizing:border-box">
                        ${categoriesListHTML}
                    </div>
                `;
            } else {
                const returnBtnText = typeof T === 'function' ? T('SkillMaster.back') : 'Back';
                const onAtlas = this.usesGraphView();
                const bodyHTML = onAtlas ? this.renderSkillAtlasHTML() : this.renderSkillListHTML();
                const heading = onAtlas ? this.focusedCategory() : this._selectedCategory;
                leftPageHTML = `
                    <div class="page-header-bar">
                      <div class="back-button focusable" onclick="SceneManager._scene.goBack()">${returnBtnText}</div>
                      <h2 id="atlas-school-name" class="cc-header-gothic" style="border: none; margin: 0; padding: 0; text-align: center; font-size: 2.134rem">${SkillMaster.getCategoryDisplayName(heading)}</h2>
                    </div>
                    ${bodyHTML}
                `;
            }

            leftPageBox.innerHTML = leftPageHTML;
            this._lastLeftMode = leftMode;
            this._lastLeftCategory = this._selectedCategory;
        }

        if (this._viewMode === 'category') {
            const applyFocus = (boxId, pane) => {
                const box = document.getElementById(boxId);
                if (!box) return;
                box.querySelectorAll('.category-card').forEach((card) => {
                    const idx = parseInt(card.dataset.idx, 10);
                    const focused = (this._categoryPane === pane && this._selectedCategoryIndex === idx);
                    card.classList.toggle('focused', focused);
                    card.style.borderColor = focused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--border-secondary-hover-translucent-15)';
                    card.style.background = focused ? 'var(--bg-tertiary-focus-translucent-45, rgba(45,35,25,0.45))' : 'var(--bg-card-translucent-5, rgba(20,20,20,0.5))';
                    const nameDiv = card.querySelector('.category-card-name');
                    if (nameDiv) nameDiv.style.color = focused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--text-card-medium, #ddd)';
                });
            };
            applyFocus('category-scroll-box-left', 0);
            applyFocus('category-scroll-box-right', 1);
            const fuseEl = document.querySelector('.fuse-spells-btn');
            if (fuseEl) {
                const on = !!this._categoryFuseFocused;
                fuseEl.classList.toggle('focused', on);
                fuseEl.style.background = on ? 'var(--text-secondary-active, #e5c07b)' : 'var(--bg-card-translucent-5, rgba(20,20,20,0.5))';
                fuseEl.style.color = on ? '#000' : 'var(--text-secondary-active, #e5c07b)';
                if (on && fuseEl.scrollIntoView) fuseEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (this.usesGraphView()) {
            this.syncAtlasSky();
            this.repaintAtlasFocus();
            if (needsLeftRebuild) this.centreAtlasOnFocus();
        } else {
            const cards = leftPageBox.querySelectorAll('.skill-card');
            cards.forEach((card, idx) => {
                if (idx === this._selectedSkillIndex) {
                    card.classList.add('focused');
                    card.style.borderColor = 'var(--text-secondary-active, #e5c07b)';
                    const nameDiv = card.querySelector('div:last-child div:last-child');
                    if (nameDiv) nameDiv.style.color = 'var(--text-secondary-active, #e5c07b)';
                } else {
                    card.classList.remove('focused');
                    card.style.borderColor = 'var(--border-secondary-hover-translucent-15)';
                    const nameDiv = card.querySelector('div:last-child div:last-child');
                    if (nameDiv) nameDiv.style.color = 'var(--text-card-medium, #ddd)';
                }
            });
        }

        const rightPageBox = document.getElementById('right-page-content');
        if (!rightPageBox) return;

        const skill = this.focusedSkill();
        const skillId = skill ? skill.id : null;

        if (graphSpread) {
            if (this._viewMode === 'detail' && skill) {
                this.updateSkillDetailPopup(skill, knowledge);
            } else if (this._viewMode !== 'preview') {
                this.closeSkillDetailPopup();
            }
            this._lastRightMode = null;
            this._lastRightSkillId = null;
            this._lastRightKnowledge = null;
            return;
        }

        const needsRightRebuild = (this._lastRightMode !== this._viewMode) ||
            ((this._viewMode === 'detail' || this._viewMode === 'list') && this._lastRightSkillId !== skillId) ||
            (this._viewMode === 'detail' && this._lastRightActionIndex !== this._selectedActionIndex) ||
            (this._lastRightKnowledge !== knowledge);

        if (needsRightRebuild) {
            let rightPageHTML = "";

            if (this._viewMode === 'category') {
                const split = SkillMaster.getSplitSkillCategories();
                const magicListHTML = renderCategoryCardsHTML(split.Magic, 1);
                const magicTitle = typeof T === 'function' ? T('SkillMaster.magic') : 'Magic';
                const teachActor = this.getTeachActor();
                const pupilLabel = typeof T === 'function' ? T('SkillMaster.pupil') : 'Pupil';
                const pupilLine = teachActor
                    ? `<div style="font-family:var(--font-ui); font-size:1.219rem; color:var(--text-card-medium, #aaa); text-align:center; margin-top:8px">${pupilLabel} <strong style="color:var(--text-secondary-active, var(--text-primary-hover))">${teachActor.name()}</strong> &middot; ${knowledge} KP</div>`
                    : '';
                const fuseLabel = typeof T === 'function' ? T('SkillMaster.fuseSpells') : 'Fuse Spells';
                const magicSysLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.tabLabel') : 'Magical Systems Wheel';

                const fuseBtn = `
                    <div class="fuse-spells-btn focusable" onclick="SceneManager._scene.openSpellEditor()" style="position:relative; display:flex; align-items:center; justify-content:center; gap:6px; margin-top:12px; padding:10px 14px; font-family:var(--font-ui); font-size:1.292rem; background:var(--bg-card-translucent-5, rgba(20,20,20,0.5)); color:var(--text-secondary-active, var(--text-primary-hover)); border-radius:6px; font-weight:bold; cursor:pointer; border:1.5px solid var(--text-secondary-active, var(--text-primary-hover)); text-transform:uppercase; letter-spacing:0.5px; user-select:none">${fuseLabel}</div>`;
                const magicSystemsBtn = `
                    <div class="magic-systems-btn focusable" onclick="SceneManager._scene.openMagicSystems()" style="position:relative; display:flex; align-items:center; justify-content:center; gap:6px; margin-top:10px; padding:10px 14px; font-family:var(--font-ui); font-size:1.292rem; background:var(--bg-card-translucent-5, rgba(20,20,20,0.5)); color:var(--text-secondary-active, var(--text-primary-hover)); border-radius:6px; font-weight:bold; cursor:pointer; border:1.5px solid var(--text-secondary-active, var(--text-primary-hover)); text-transform:uppercase; letter-spacing:0.5px; user-select:none">${magicSysLabel}</div>`;

                rightPageHTML = `
                    <div class="page-header-bar">
                      <h2 class="cc-header-gothic" style="text-align:center; font-size:2.542rem">${magicTitle}</h2>
                    </div>
                    <div id="category-scroll-box-right" class="skill-scroll-box" style="flex:1; overflow-y:auto; padding-right:10px; display:grid; grid-template-columns:repeat(${CATEGORY_PAGE_COLS}, 1fr); gap:10px; align-content:start; box-sizing:border-box">
                        ${magicListHTML}
                    </div>
                    ${fuseBtn}
                    ${magicSystemsBtn}
                    ${pupilLine}
                `;
            } else if (this._viewMode === 'list' || this._viewMode === 'detail') {
                if (!skill) {
                    const selectPrompt = typeof T === 'function' ? T('SkillMaster.selectASkill') : 'Select a skill';
                    rightPageHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; gap:20px; padding:20px; box-sizing:border-box">
                            <div style="${SkillMaster.getCategoryIconStyle('All')} transform: scale(2.0); image-rendering: pixelated; margin-bottom: 12px"></div>
                            <h3 class="cc-header-gothic" style="font-size:2.204rem; color:var(--text-secondary-active, var(--text-primary-hover)); margin:0">
                                ${selectPrompt}
                            </h3>
                        </div>
                    `;
                } else {
                    rightPageHTML = this.renderSkillDetailHTML(skill, knowledge, { popup: false });
                }
            }

            rightPageBox.innerHTML = rightPageHTML;
            this._lastRightMode = this._viewMode;
            this._lastRightSkillId = skillId;
            this._lastRightActionIndex = this._selectedActionIndex;
            this._lastRightKnowledge = knowledge;
        }
    };

    Scene_SkillEncyclopedia.prototype.switchTeachActor = function (index) {
        const members = getSwitchableMembers();
        const actor = members[index];
        if (!actor || actor.actorId() === this._teachActorId) return;
        this._teachActorId = actor.actorId();
        SkillMaster.actorCategoryManager.setActor(this._teachActorId);
        SoundManager.playCursor();

        this._splitCategoriesCache = null;
        this._skillsByCategoryKey = null;
        this._categoryPane = 0;
        this._selectedCategoryIndex = 0;
        this._categoryFuseFocused = false;
        this._selectedSkillIndex = 0;

        const allowed = SkillMaster.actorCategoryManager.allowedCategories();
        const stillOpen = !this._selectedCategory || this._selectedCategory === 'All' || !allowed || allowed.includes(this._selectedCategory);
        this._atlasZoom = 0;
        this._atlasMemory = {};
        if (this._atlasCategory && allowed && !allowed.includes(this._atlasCategory)) {
            this._atlasCategory = null;
        }
        if (!stillOpen && (this._viewMode === 'list' || this._viewMode === 'detail')) {
            this._viewMode = 'category';
            this._selectedCategory = null;
        } else if (this.usesGraphView()) {
            this.defaultGraphFocus();
        }

        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.cycleTeachActor = function (dir) {
        const members = getSwitchableMembers();
        if (members.length <= 1) return;
        const cur = members.findIndex(m => m.actorId() === this._teachActorId);
        const next = ((cur < 0 ? 0 : cur) + dir + members.length) % members.length;
        this.switchTeachActor(next);
    };

    Scene_SkillEncyclopedia.prototype.selectCategory = function () {
        const split = SkillMaster.getSplitSkillCategories();
        const list = this._categoryPane === 1 ? split.Magic : split.Skill;
        const cat = list[this._selectedCategoryIndex];
        if (!cat) { SoundManager.playBuzzer(); return; }
        this._selectedCategory = cat;
        this._skillListWindow.setCategory(this._selectedCategory);
        this._viewMode = 'list';
        this._selectedSkillIndex = 0;

        const schools = this.atlasCategories();
        this._atlasCategory = schools.includes(cat) ? cat : (schools[0] || null);
        this._atlasZoom = 0;
        this._focusSkillId = 0;
        if (this.usesGraphView()) this.defaultGraphFocus();
        SoundManager.playOk();
        this.refreshUISkillDOM();
        this.centreAtlasOnFocus();
    };

    Scene_SkillEncyclopedia.prototype.selectCategoryClick = function (pane, index) {
        this._categoryPane = pane;
        this._selectedCategoryIndex = index;
        this._categoryFuseFocused = false;
        this.selectCategory();
    };

    Scene_SkillEncyclopedia.prototype.categoryBack = function () {
        this.popScene();
    };

    Scene_SkillEncyclopedia.prototype.selectSkill = function (index) {
        this._selectedSkillIndex = index;
        const skills = SkillMaster.getSkillsByCategory(this._selectedCategory);
        const skill = skills[this._selectedSkillIndex];
        if (skill) {
            this._focusSkillId = skill.id;
            this._skillDetailWindow.setSkill(skill);
            this._viewMode = 'detail';
            this._selectedActionIndex = 0;
            SoundManager.playOk();
            this.refreshUISkillDOM();
        }
    };

    Scene_SkillEncyclopedia.prototype.carryToggleHTML = function (actor, skill, allowFocus) {
        const LO = window.BattleLoadout;
        if (!LO) return '';
        const locked = LO.isAlwaysCarried(actor, skill);
        const active = LO.isActive(actor, skill);
        const full = !active && !locked && !LO.hasRoom(actor);
        const label = locked ? (typeof T === 'function' ? T('SkillMaster.carry.locked') : 'Always Carried')
            : active ? (typeof T === 'function' ? T('SkillMaster.carry.drop') : 'Unequip Skill')
                : full ? (typeof T === 'function' ? T('SkillMaster.carry.full') : 'Loadout Full') : (typeof T === 'function' ? T('SkillMaster.carry.take') : 'Equip Skill');
        const count = `${LO.count(actor)} / ${LO.MAX}`;
        const focused = allowFocus && (this._selectedActionIndex === 0) && !locked;
        const usable = !locked && (active || !full);
        return `
            <div class="action-button carry-button ${focused ? 'focused' : ''} ${usable ? '' : 'disabled'}" onclick="SceneManager._scene.toggleCarry(${actor.actorId()})" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; margin-top:6px; background:${active ? 'var(--bg-tertiary-focus-translucent-45, rgba(45,35,25,0.45))' : 'var(--accent-gray-2-translucent-0, rgba(20,20,20,0.5))'}; border:1px solid ${focused ? 'var(--text-secondary-active, #e5c07b)' : 'var(--border-secondary-hover-translucent-15)'}; border-radius:6px; cursor:${usable ? 'pointer' : 'not-allowed'}; font-family:var(--font-ui); opacity:${usable ? 1 : 0.6}; transition:all 0.15s ease">
                <span style="font-weight:bold; font-size:1.292rem; text-transform:uppercase">${active ? '◉' : '○'} ${label}</span>
                <span style="font-size:1.196rem; color:var(--text-card-medium, #aaa)">${count}</span>
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.toggleCarry = function (actorId) {
        const actor = $gameActors.actor(actorId);
        const skill = this.focusedSkill();
        if (!actor || !skill || !window.BattleLoadout) return;
        const LO = window.BattleLoadout;
        if (LO.isAlwaysCarried(actor, skill)) { SoundManager.playBuzzer(); return; }
        if (LO.isActive(actor, skill)) {
            LO.remove(actor, skill);
            SoundManager.playCancel();
        } else {
            if (!LO.hasRoom(actor)) { SoundManager.playBuzzer(); return; }
            LO.add(actor, skill);
            SoundManager.playOk();
        }
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.fusionActionsHTML = function (actor, skill) {
        if (!skill || !skill._customSpell || skill._ownerActorId !== actor.actorId()) return '';
        const btn = (label, handler, danger) => `
            <div class="action-button focusable" onclick="${handler}" style="flex:1; display:flex; justify-content:center; align-items:center; padding:9px 12px; background:var(--accent-gray-2-translucent-0, rgba(20,20,20,0.5)); border:1px solid ${danger ? 'var(--text-danger-hover, #ff4d4f)' : 'var(--border-secondary-hover-translucent-15)'}; border-radius:6px; cursor:pointer; font-family:var(--font-ui); font-size:1.259rem; font-weight:bold; text-transform:uppercase; color:${danger ? 'var(--text-danger-hover, #ff4d4f)' : 'var(--text-secondary-active, #e5c07b)'}; transition:all 0.15s ease">
                ${label}
            </div>
        `;
        const renameLabel = typeof T === 'function' ? T('SkillMaster.rename') : 'Rename';
        const dissolveLabel = typeof T === 'function' ? T('SkillMaster.dissolve') : 'Dissolve';
        return `
            <div style="display:flex; gap:8px; margin-top:6px">
                ${btn(renameLabel, `SceneManager._scene.renameFusedSpell(${skill.id})`, false)}
                ${btn(dissolveLabel, `SceneManager._scene.dissolveFusedSpell(${skill.id})`, true)}
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.renameFusedSpell = function (skillId) {
        const spell = $dataSkills[skillId];
        if (!spell || !spell._customSpell) return;
        const current = spell.name || '';
        const promptText = typeof T === 'function' ? T('SkillMaster.renamePrompt') : 'Enter new spell name:';
        const next = (window.prompt && window.prompt(promptText, current)) || '';
        const clean = next.trim();
        if (!clean || clean === current) return;
        spell.name = clean;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.dissolveFusedSpell = function (skillId) {
        const actor = this.getTeachActor();
        const spell = $dataSkills[skillId];
        if (!actor || !spell || !spell._customSpell) return;
        const confirmText = typeof T === 'function' ? T('SkillMaster.dissolveConfirm', { name: spell.name }) : `Dissolve ${spell.name} into knowledge?`;
        if (window.confirm && !window.confirm(confirmText)) return;
        const refund = Math.floor(SkillMaster.kpTeachCost(spell) * 0.5);
        $gameSystem.addKnowledge(refund);
        actor.forgetSkill(skillId);
        $gameSystem.removeCustomSpell(skillId);
        this.invalidateLearnedSkillCaches();
        SoundManager.playRecovery();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.teachSkill = function (actorId, cost) {
        const actor = $gameActors.actor(actorId);
        const skill = this.focusedSkill();
        const isWorkshop = SkillMaster.isWorkshopMode && SkillMaster.isWorkshopMode();

        if (!actor || !skill || (!isWorkshop && $gameSystem.getKnowledge() < cost)) {
            SoundManager.playBuzzer();
            return;
        }

        const graph = window.SkillGraph;
        if (!isWorkshop && graph && !graph.isOpen(actor, skill.id)) {
            SoundManager.playBuzzer();
            const toast = typeof T === 'function' ? T('SkillMaster.graph.lockedToast', { skill: skill.name }) : `${skill.name} is locked!`;
            this._skillDetailWindow.showMessage(toast);
            this.refreshUISkillDOM();
            return;
        }

        if (!isWorkshop) $gameSystem.spendKnowledge(cost);
        actor.learnSkill(skill.id);
        this.invalidateLearnedSkillCaches();
        SoundManager.playRecovery();

        const learnedToast = typeof T === 'function' ? T('SkillMaster.actorLearned', { actor: actor.name(), skill: skill.name }) : `${actor.name()} learned ${skill.name}!`;
        this._skillDetailWindow.showMessage(learnedToast);
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.goBack = function () {
        this._viewMode = 'category';
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.invalidateLearnedSkillCaches = function () {
        this._editorCandidatesKey = null;
        if (window.SkillGraph) window.SkillGraph.invalidate();
        if (SkillMaster.SkillAtlas) SkillMaster.SkillAtlas.invalidate();
        this._splitCategoriesCache = null;
    };

    Scene_SkillEncyclopedia.prototype.getSplitCategoriesCached = function () {
        if (!this._splitCategoriesCache || this._splitCategoriesActorId !== this._teachActorId) {
            SkillMaster.actorCategoryManager.setActor(this._teachActorId);
            this._splitCategoriesActorId = this._teachActorId;
            this._splitCategoriesCache = SkillMaster.getSplitSkillCategories();
        }
        return this._splitCategoriesCache;
    };

    Scene_SkillEncyclopedia.prototype.getSkillsByCategoryCached = function (category) {
        const key = `${this._teachActorId}:${category}`;
        if (this._skillsByCategoryKey !== key) {
            SkillMaster.actorCategoryManager.setActor(this._teachActorId);
            this._skillsByCategoryKey = key;
            this._skillsByCategoryCache = SkillMaster.getSkillsByCategory(category);
        }
        return this._skillsByCategoryCache;
    };

    Scene_SkillEncyclopedia.prototype.scrollToActiveItem = function (containerId, selector) {
        const container = document.getElementById(containerId);
        const active = document.querySelector(selector);
        if (container && active) {
            const containerRect = container.getBoundingClientRect();
            const activeRect = active.getBoundingClientRect();
            if (activeRect.bottom > containerRect.bottom) {
                container.scrollTop += (activeRect.bottom - containerRect.bottom) + 10;
            } else if (activeRect.top < containerRect.top) {
                container.scrollTop -= (containerRect.top - activeRect.top) + 10;
            }
        }
    };

    Scene_SkillEncyclopedia.prototype.onNavLeave = function () {
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype._ccEnterNav = function (dir) {
        return !!window.CCNav && window.CCNav.tryEnterFromBoard(dir);
    };

    Scene_SkillEncyclopedia.prototype.ccScrollTarget = function () {
        return document.getElementById('skills-scroll-box') ||
            document.getElementById('category-scroll-box-right') ||
            document.getElementById('category-scroll-box-left') ||
            (this._dndContainer && this._dndContainer.querySelector('.skill-scroll-box'));
    };

    Scene_SkillEncyclopedia.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);

        if (window.CCNav && window.CCNav.update()) return;
        if (window.CCScroll) window.CCScroll.update(this._dndContainer);

        if (this._viewMode !== 'spellEditor' && this._viewMode !== 'preview' && getSwitchableMembers().length > 1) {
            if (Input.isTriggered('pagedown')) { this.cycleTeachActor(1); return; }
            if (Input.isTriggered('pageup')) { this.cycleTeachActor(-1); return; }
        }

        if (this._viewMode === 'category') {
            const split = this.getSplitCategoriesCached();
            const lists = [split.Skill, split.Magic];
            const cols = CATEGORY_PAGE_COLS;
            let pane = this._categoryPane;
            let idx = this._selectedCategoryIndex;
            const prevPane = pane, prevIdx = idx;
            const curLen = lists[pane].length;

            if (this._categoryFuseFocused) {
                if (Input.isTriggered('ok')) {
                    this.openSpellEditor();
                    return;
                }
                if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    this.categoryBack();
                    return;
                }
                if (Input.isTriggered('up') || Input.isRepeated('up') || Input.isTriggered('left') || Input.isRepeated('left')) {
                    this._categoryFuseFocused = false;
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                }
                return;
            }

            if (Input.isTriggered('shift')) {
                this.openSpellEditor();
                return;
            } else if (Input.isTriggered('ok')) {
                this.selectCategory();
                return;
            } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.categoryBack();
                return;
            } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
                const col = idx % cols;
                if (col === cols - 1 && pane === 0 && lists[1].length > 0) {
                    const row = Math.floor(idx / cols);
                    pane = 1;
                    idx = Math.min(row * cols, lists[1].length - 1);
                } else if (idx + 1 < curLen) {
                    idx += 1;
                }
            } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                const col = idx % cols;
                if (col === 0 && pane === 1 && lists[0].length > 0) {
                    const row = Math.floor(idx / cols);
                    pane = 0;
                    idx = Math.min(row * cols + (cols - 1), lists[0].length - 1);
                } else if (idx - 1 >= 0) {
                    idx -= 1;
                }
            } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                if (idx + cols < curLen) {
                    idx += cols;
                } else if (pane === 1 && idx === curLen - 1) {
                    this._categoryFuseFocused = true;
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                    return;
                } else {
                    idx = curLen - 1;
                }
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                if (idx - cols >= 0) {
                    idx -= cols;
                } else if (this._ccEnterNav('up')) {
                    return;
                }
            }

            if (pane !== prevPane || idx !== prevIdx) {
                this._categoryPane = pane;
                this._selectedCategoryIndex = idx;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                const boxId = pane === 1 ? 'category-scroll-box-right' : 'category-scroll-box-left';
                this.scrollToActiveItem(boxId, `#${boxId} .category-card.focused`);
            }
        } else if (this._viewMode === 'list') {
            if (this.usesGraphView()) {
                if (Input.isTriggered('ok')) {
                    this.openFocusedSkill();
                    return;
                }
                if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    this._viewMode = 'category';
                    SoundManager.playCancel();
                    this.refreshUISkillDOM();
                    return;
                }
                if (Input.isTriggered('shift')) {
                    const wide = this.wholeAtlasZoom();
                    this.setAtlasZoom(this.atlasZoom() > wide + 0.01 ? wide : this.defaultAtlasZoom());
                    this.scrollGraphToFocus();
                    SoundManager.playCursor();
                    return;
                }
                let moved = false;
                if (Input.isTriggered('right') || Input.isRepeated('right')) {
                    moved = this.moveGraphFocus(1, 0);
                    if (!moved && this.pageAtlasSchool(1)) return;
                } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                    moved = this.moveGraphFocus(-1, 0);
                    if (!moved && this.pageAtlasSchool(-1)) return;
                } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    moved = this.moveGraphFocus(0, 1);
                    if (!moved && this._ccEnterNav('down')) return;
                } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                    moved = this.moveGraphFocus(0, -1);
                    if (!moved && this._ccEnterNav('up')) return;
                }
                if (moved) {
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                    this.scrollGraphToFocus();
                }
                return;
            }

            const skills = this.getSkillsByCategoryCached(this._selectedCategory);
            const max = skills.length;
            if (max === 0) {
                if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    this._viewMode = 'category';
                    SoundManager.playCancel();
                    this.refreshUISkillDOM();
                }
                return;
            }
            const cols = SKILL_GRID_COLS;
            const prev = this._selectedSkillIndex;
            if (Input.isTriggered('ok')) {
                this.selectSkill(this._selectedSkillIndex);
                return;
            } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this._viewMode = 'category';
                SoundManager.playCancel();
                this.refreshUISkillDOM();
                return;
            } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
                this._selectedSkillIndex = (this._selectedSkillIndex + 1) % max;
            } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                this._selectedSkillIndex = (this._selectedSkillIndex - 1 + max) % max;
            } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                if (this._selectedSkillIndex + cols < max) {
                    this._selectedSkillIndex += cols;
                } else if (this._selectedSkillIndex === max - 1 && this._ccEnterNav('down')) {
                    return;
                } else {
                    this._selectedSkillIndex = max - 1;
                }
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                if (this._selectedSkillIndex - cols >= 0) {
                    this._selectedSkillIndex -= cols;
                } else if (this._ccEnterNav('up')) {
                    return;
                }
            }

            if (this._selectedSkillIndex !== prev) {
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                this.scrollToActiveItem('skills-scroll-box', '.skill-card.focused');
            }
        } else if (this._viewMode === 'preview') {
            this.updateSpellPreviewInput();
        } else if (this._viewMode === 'detail') {
            const skill = this.focusedSkill();
            const maxActions = 2;

            if (Input.isTriggered('down') || Input.isRepeated('down') || Input.isTriggered('right') || Input.isRepeated('right')) {
                if (this._selectedActionIndex === maxActions - 1 && this._ccEnterNav('down')) return;
                this._selectedActionIndex = (this._selectedActionIndex + 1) % maxActions;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
            } else if (Input.isTriggered('up') || Input.isRepeated('up') || Input.isTriggered('left') || Input.isRepeated('left')) {
                this._selectedActionIndex = (this._selectedActionIndex - 1 + maxActions) % maxActions;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
            } else if (Input.isTriggered('ok')) {
                if (!skill) {
                    SoundManager.playBuzzer();
                } else if (this._selectedActionIndex === 0) {
                    const actor = this.getTeachActor();
                    const cost = $gameSystem.getSkillKnowledgeCost(skill.id, actor.actorId());
                    this.teachSkill(actor.actorId(), cost);
                } else {
                    this.openSpellPreview(skill.id);
                }
            } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this._viewMode = 'list';
                SoundManager.playCancel();
                this.refreshUISkillDOM();
            }
        } else if (this._viewMode === 'spellEditor') {
            this.updateSpellEditorInput();
        } else if (this._viewMode === 'magicSystems') {
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.closeMagicSystems();
                return;
            }
            for (const dir of ['down', 'right', 'up', 'left']) {
                if (Input.isTriggered(dir) || Input.isRepeated(dir)) {
                    this._ccEnterNav(dir);
                    break;
                }
            }
        }

        if (window.CCNav) window.CCNav.paint();
    };

    window.Scene_SkillEncyclopedia = Scene_SkillEncyclopedia;
    SkillMaster.Scene_SkillEncyclopedia = Scene_SkillEncyclopedia;

})();
