/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Self-organizing Skill Graph and 2D Atlas layout calculations.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const GROVE_MAX = 20;
    const GROVE_MIN = 4;
    const GROVE_FANOUT = 3;
    const FUSION_CATEGORY = 'Fusion';
    const ROLE_RE = /<role:\s*([^>]+)>/i;

    const SKY_SCHOOLS = {
        MartialArts:       { hue:  18 },
        Convokation:       { hue: 285 },
        HolyMagic:         { hue:  47 },
        ForbiddenMagic:    { hue: 332 },
        Bestial:           { hue:  28 },
        MetaMagic:         { hue: 196 },
        Leadership:        { hue:  42 },
        Geomancy:          { hue:  78 },
        Swordsmanship:     { hue: 208 },
        Pyromancy:         { hue:  12 },
        ChaosMagic:        { hue: 312 },
        PsychicAbilities:  { hue: 272 },
        Tactical:          { hue: 186 },
        AstralMagic:       { hue: 254 },
        Electromancy:      { hue:  54 },
        Roguery:           { hue: 148 },
        Aeromancy:         { hue: 172 },
        Arcanism:          { hue: 232 },
        Pastoral:          { hue: 104 },
        Alchemistry:       { hue: 132 },
        Cryomancy:         { hue: 192 },
        Performance:       { hue: 322 },
        Necromancy:        { hue: 266 },
        StatusMagic:       { hue: 164 },
        VoidMagic:         { hue: 248 },
        Cooking:           { hue:  26 },
        Firearms:          { hue: 204 },
        Basic:             { hue: 212 },
        Idromancy:         { hue: 200 },
        Healing:           { hue: 140 },
        Dominion:          { hue:  38 },
        Illusion:          { hue: 292 },
        Augury:            { hue: 222 },
        Chronomancy:       { hue:  50 },
        Technomagical:     { hue: 158 },
        Mutation:          { hue:  96 },
        Vocation:          { hue:  34 },
        Economy:           { hue:  60 },
        Oneiromancy:       { hue: 300 },
        Hunting:           { hue:  88 },
        Fusion:            { hue: 190 }
    };

    const SKY_ELEMENT_HUE = { 2: 14, 3: 194, 4: 52, 5: 210, 6: 32, 7: 158, 8: 46, 9: 292 };

    const SkillShapes = {
        hash: function (str) {
            const s = String(str);
            let h = 2166136261;
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return h >>> 0;
        },

        school: function (category) {
            return SKY_SCHOOLS[category] || { hue: this.hash(category || '') % 360 };
        },

        schoolNames: function () {
            return Object.keys(SKY_SCHOOLS);
        },

        hueFor: function (skillId, category) {
            const base = this.school(category).hue;
            const skill = $dataSkills[skillId];
            const el = (skill && skill.damage) ? skill.damage.elementId : 0;
            const hue = (SKY_ELEMENT_HUE[el] !== undefined) ? SKY_ELEMENT_HUE[el] : base;
            return (hue + ((skillId * 37) % 13) - 6 + 360) % 360;
        }
    };

    window.SkillShapes = SkillShapes;
    SkillMaster.SkillShapes = SkillShapes;

    const SkillGraph = {
        _trees: null,
        _index: null,

        _reset: function () {
            if (!this._trees) { this._trees = {}; this._index = {}; }
        },

        _key: function (category) {
            const MN = window.MagicNature;
            const level = (MN && MN.level && MN.level()) || 'normal';
            if (category === FUSION_CATEGORY) {
                const scene = SceneManager._scene;
                return `${category}|${level}|${(scene && scene._teachActorId) || 0}`;
            }
            return `${category}|${level}`;
        },

        _lane: function (skill) {
            const el = (skill.damage && skill.damage.elementId) || 0;
            if (el > 1) return 'E' + el;
            const role = (skill.note || '').match(ROLE_RE);
            if (role) return 'R' + role[1].trim();
            if (el === 1) return 'R@physical';
            return 'R@other';
        },

        _organise: function (category) {
            this._reset();
            const key = this._key(category);
            if (this._trees[key]) return this._trees[key];

            const getSkills = SkillMaster.getSkillsByCategory || window.getSkillsByCategory;
            const skills = getSkills(category).filter(s => s && s.name && !s.name.startsWith('<--'));
            const tree = { category: category, nodes: {}, order: [], tiers: [], groves: [] };
            this._trees[key] = tree;
            if (!skills.length) return tree;

            const forbidden = [];
            const climb = [];
            for (const skill of skills) {
                (this.isForbidden(skill.id) ? forbidden : climb).push(skill);
            }

            const power = {};
            const scoreFn = SkillMaster.skillPower || window.skillPower || (() => 1);
            for (const skill of skills) power[skill.id] = scoreFn(skill);
            const rank = (a, b) => (power[a.id] - power[b.id]) || (a.id - b.id);

            const laneNames = Array.from(new Set(skills.map(s => this._lane(s)))).sort();
            const laneOf = {};
            laneNames.forEach((name, i) => { laneOf[name] = i; });
            tree.lanes = laneNames;

            for (const members of this._groves(climb, rank)) {
                this._grow(tree, category, members, laneOf, false);
            }
            if (forbidden.length) {
                this._grow(tree, category, forbidden.slice().sort(rank), laneOf, true);
            }

            this._rank(tree);
            return tree;
        },

        _groves: function (climb, rank) {
            if (!climb.length) return [];
            const byLane = {};
            for (const skill of climb) {
                const lane = this._lane(skill);
                (byLane[lane] = byLane[lane] || []).push(skill);
            }
            const groves = [];
            const spill = [];
            const deal = (list) => {
                const parts = Math.max(1, Math.ceil(list.length / GROVE_MAX));
                const bins = [];
                for (let i = 0; i < parts; i++) bins.push([]);
                list.slice().sort(rank).forEach((skill, i) => bins[i % parts].push(skill));
                for (const bin of bins) if (bin.length) groves.push(bin);
            };
            for (const lane of Object.keys(byLane).sort()) {
                const list = byLane[lane];
                if (list.length < GROVE_MIN) spill.push(...list);
                else deal(list);
            }
            if (spill.length) deal(spill);
            if (!groves.length) deal(climb);
            return groves;
        },

        _grow: function (tree, category, members, laneOf, forbidden) {
            if (!members.length) return;
            const grove = { index: tree.groves.length, nodes: [], forbidden: !!forbidden };
            members.forEach((skill, seat) => {
                const node = {
                    id: skill.id, skill: skill, category: category,
                    tier: 0, grove: grove.index, seat: seat,
                    lane: laneOf[this._lane(skill)] || 0,
                    forbidden: !!forbidden,
                    parents: [], children: [], need: 0
                };
                grove.nodes.push(node);
                tree.nodes[skill.id] = node;
                tree.order.push(node);
                this._index[skill.id] = node;
            });
            if (!forbidden) {
                for (let i = 1; i < grove.nodes.length; i++) {
                    const parent = grove.nodes[Math.floor((i - 1) / GROVE_FANOUT)];
                    const node = grove.nodes[i];
                    node.parents = [parent.id];
                    node.tier = parent.tier + 1;
                    node.need = 1;
                    parent.children.push(node.id);
                }
            }
            grove.depth = grove.nodes.reduce((d, n) => Math.max(d, n.tier), 0);
            tree.groves.push(grove);
        },

        _rank: function (tree) {
            let deepest = 0;
            for (const node of tree.order) if (!node.forbidden) deepest = Math.max(deepest, node.tier);
            for (const node of tree.order) if (node.forbidden) node.tier = deepest + 1;
            const tiers = [];
            for (const node of tree.order) {
                (tiers[node.tier] = tiers[node.tier] || []).push(node);
            }
            for (let t = 0; t < tiers.length; t++) if (!tiers[t]) tiers[t] = [];
            tree.tiers = tiers;
        },

        _nodeFor: function (skillId) {
            this._reset();
            const known = this._index[skillId];
            if (known) return known;
            const category = SkillMaster.getSkillCategory ? SkillMaster.getSkillCategory(skillId) : null;
            if (!category) return null;
            this._organise(category);
            return this._index[skillId] || null;
        },

        node: function (skillId) {
            return this._nodeFor(skillId);
        },

        links: function (skillId) {
            const node = this._nodeFor(skillId);
            if (!node) return [];
            return node.parents.concat(node.children);
        },

        requires: function (skillId) {
            const node = this._nodeFor(skillId);
            return node ? node.parents : [];
        },

        needed: function (skillId) {
            const node = this._nodeFor(skillId);
            return node ? node.need : 0;
        },

        isForbidden: function (skillId) {
            const skill = $dataSkills[skillId];
            return !!(skill && /<Forbidden>/i.test(skill.note || ''));
        },

        _core: {},
        core: function (category) {
            if (this._core[category]) return this._core[category];
            const inner = [], outer = [];
            if (typeof $dataSkills !== 'undefined' && $dataSkills) {
                for (const skill of $dataSkills) {
                    if (!skill || !skill.name || skill.name.startsWith('<--')) continue;
                    const cat = SkillMaster.getSkillCategory ? SkillMaster.getSkillCategory(skill.id) : null;
                    if (cat !== category) continue;
                    (this.isForbidden(skill.id) ? inner : outer).push(skill.id);
                }
            }
            const entry = { forbidden: inner, school: outer };
            this._core[category] = entry;
            return entry;
        },

        // The level floor a skill's <Esoteric> / <Forbidden> tag asks for, 0
        // when it asks for nothing. Mastering a whole school is no longer a
        // condition of anything: window.SkillArcana is the one authority.
        arcaneLevel: function (skillId) {
            return window.SkillArcana ? window.SkillArcana.requiredLevel(skillId) : 0;
        },

        isEntry: function (skillId) {
            const node = this._nodeFor(skillId);
            if (!node) return true;
            return !node.forbidden && node.tier === 0;
        },

        isOpen: function (actor, skillId) {
            if (!actor || actor.isLearnedSkill(skillId)) return false;
            if (SkillMaster.isWorkshopMode && SkillMaster.isWorkshopMode()) return true;
            const arcana = window.SkillArcana;
            if (arcana) {
                if (arcana.isSandbox()) return true;
                // A Cultist takes nothing from the tree, and nobody reads an
                // esoteric or forbidden skill below its level floor.
                if (!arcana.canLearnFromTree(actor, skillId)) return false;
            }
            if (actor.actorId) SkillMaster.actorCategoryManager.setActor(actor.actorId());
            const node = this._nodeFor(skillId);
            if (!node) return true;
            const category = node.category;
            // Past the level floor a forbidden node stands open on its own.
            if (node.forbidden) return true;
            const foreign = SkillMaster.actorCategoryManager.isForeign(category);
            if (!foreign && node.tier === 0) return true;
            if (!node.parents.length) return !foreign;
            let held = 0;
            for (const id of node.parents) if (actor.isLearnedSkill(id)) held++;
            return held >= Math.max(1, node.need);
        },

        openers: function (skillId, actor) {
            // A forbidden skill has no prerequisite skills any more, only a
            // level floor, so there is nothing to list for one.
            if (this.isForbidden(skillId)) return [];
            return this.requires(skillId)
                .filter(id => !(actor && actor.isLearnedSkill(id)))
                .map(id => $dataSkills[id])
                .filter(s => s && s.name);
        },

        stillWanted: function (skillId, actor) {
            const node = this._nodeFor(skillId);
            if (!node || node.forbidden || !node.parents.length) return 0;
            let held = 0;
            for (const id of node.parents) if (actor && actor.isLearnedSkill(id)) held++;
            return Math.max(0, Math.max(1, node.need) - held);
        },

        invalidate: function () {
            this._trees = null;
            this._index = null;
            this._core = {};
        },

        graph: function (category) {
            const tree = this._organise(category);
            if (tree.graph) return tree.graph;

            const nodes = tree.order.map(n => ({
                id: n.id, skill: n.skill, tier: n.tier,
                grove: n.grove, seat: n.seat, forbidden: n.forbidden,
                parent: n.parents.length ? n.parents[0] : 0, children: n.children.slice()
            }));
            const placed = {};
            for (const n of nodes) placed[n.id] = n;

            const edges = [];
            for (const n of tree.order) {
                for (const parent of n.parents) {
                    if (placed[parent] && placed[n.id]) edges.push([placed[parent], placed[n.id]]);
                }
            }

            tree.graph = {
                nodes: nodes, edges: edges,
                tiers: tree.tiers.length, groves: tree.groves.length
            };
            return tree.graph;
        }
    };

    window.SkillGraph = SkillGraph;
    SkillMaster.SkillGraph = SkillGraph;

    //=============================================================================
    // SkillAtlas (2D Layout calculation)
    //=============================================================================

    const SKY_COL = 1.9;
    const SKY_ROW = 2.5;
    const SKY_GROVE_GAP = 3.4;
    const SKY_PAD = 2.6;

    const SkillAtlas = {
        _atlas: null,
        _key: null,
        _figures: {},

        build: function (category) {
            const name = Array.isArray(category) ? category[0] : category;
            const MN = window.MagicNature;
            const key = String(name || '') + '|' + ((MN && MN.level && MN.level()) || 'normal');
            if (this._atlas && this._key === key) return this._atlas;
            const figure = name ? this._figureFor(name, key) : null;
            const atlas = {
                circles: figure ? [figure] : [],
                radius: figure ? figure.radius : 1,
                width: figure ? figure.width : 1,
                height: figure ? figure.height : 1,
                hue: figure ? figure.hue : 210,
                index: {}
            };
            if (figure) for (const node of figure.nodes) atlas.index[node.id] = node;
            atlas.category = String(name || '');
            atlas.key = key;
            this._key = key;
            this._atlas = atlas;
            return atlas;
        },

        invalidate: function () {
            this._atlas = null;
            this._key = null;
        },

        _figureFor: function (category, key) {
            const graph = SkillGraph.graph(category);
            if (!graph || !graph.nodes.length) { delete this._figures[key]; return null; }
            const sig = graph.nodes.map(n => `${n.id}:${n.grove}:${n.tier}:${n.seat}`).join('|');
            const kept = this._figures[key];
            if (kept && kept.sig === sig) return kept.figure;
            const figure = this._figure(category);
            if (figure) this._figures[key] = { sig: sig, figure: figure };
            else delete this._figures[key];
            return figure;
        },

        _figure: function (category) {
            const graph = SkillGraph.graph(category);
            if (!graph || !graph.nodes.length) return null;

            const cfg = SkillShapes.school(category);
            const seed = SkillShapes.hash(category);

            const byId = {};
            const groves = [];
            for (const n of graph.nodes) {
                const g = (groves[n.grove] = groves[n.grove] || { index: n.grove, nodes: [] });
                const node = {
                    id: n.id, skill: n.skill, category: category,
                    tier: n.tier, grove: n.grove, seat: n.seat,
                    forbidden: !!n.forbidden, parent: n.parent, children: n.children,
                    x: 0, y: 0, z: 0,
                    hue: SkillShapes.hueFor(n.id, category),
                    sx: 0, sy: 0, sd: 0, vis: false
                };
                g.nodes.push(node);
                byId[n.id] = node;
            }

            const boxes = [];
            for (const grove of groves) {
                if (!grove) continue;
                boxes.push(this._layGrove(grove, byId));
            }
            this._packGroves(boxes);

            const nodes = [];
            for (const grove of groves) if (grove) nodes.push(...grove.nodes);

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const n of nodes) {
                if (n.x < minX) minX = n.x;
                if (n.x > maxX) maxX = n.x;
                if (n.y < minY) minY = n.y;
                if (n.y > maxY) maxY = n.y;
            }
            const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
            for (const n of nodes) { n.x -= cx; n.y -= cy; }

            const edges = [];
            for (const [a, b] of graph.edges) {
                if (byId[a.id] && byId[b.id]) edges.push([byId[a.id], byId[b.id]]);
            }

            const width = (maxX - minX) + SKY_PAD * 2;
            const height = (maxY - minY) + SKY_PAD * 2;
            return {
                category: category, hue: cfg.hue,
                nodes: nodes, edges: edges,
                groves: boxes.length, seed: seed,
                width: width, height: height,
                radius: Math.hypot(width, height) / 2
            };
        },

        _layGrove: function (grove, byId) {
            const roots = grove.nodes.filter(n => !n.parent);
            let cursor = 0;
            const place = (root) => {
                const stack = [{ node: root, opened: false }];
                while (stack.length) {
                    const frame = stack[stack.length - 1];
                    const node = frame.node;
                    const kids = (node.children || [])
                        .map(id => byId[id])
                        .filter(k => k && k.grove === node.grove);
                    if (!frame.opened) {
                        frame.opened = true;
                        node.y = node.tier * SKY_ROW;
                        if (kids.length) {
                            for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], opened: false });
                            continue;
                        }
                        node.x = cursor * SKY_COL;
                        cursor++;
                    } else {
                        let lo = Infinity, hi = -Infinity;
                        for (const kid of kids) { lo = Math.min(lo, kid.x); hi = Math.max(hi, kid.x); }
                        node.x = (lo + hi) / 2;
                    }
                    stack.pop();
                }
            };
            for (const root of roots) {
                if (cursor) cursor += 1;
                place(root);
            }
            for (const node of grove.nodes) {
                if (node.parent || roots.includes(node)) continue;
                node.y = node.tier * SKY_ROW;
                node.x = cursor * SKY_COL;
                cursor++;
            }

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const n of grove.nodes) {
                if (n.x < minX) minX = n.x;
                if (n.x > maxX) maxX = n.x;
                if (n.y < minY) minY = n.y;
                if (n.y > maxY) maxY = n.y;
            }
            for (const n of grove.nodes) { n.x -= minX; n.y -= minY; }
            return {
                grove: grove,
                w: (maxX - minX) + SKY_GROVE_GAP,
                h: (maxY - minY) + SKY_GROVE_GAP
            };
        },

        _packGroves: function (boxes) {
            if (!boxes.length) return;
            let area = 0;
            for (const box of boxes) area += box.w * box.h;
            const want = Math.max(boxes[0].w, Math.sqrt(area * 16 / 9));
            let rowX = 0, rowTop = 0, rowH = 0;
            for (const box of boxes) {
                if (rowX > 0 && rowX + box.w > want) {
                    rowTop -= rowH;
                    rowX = 0;
                    rowH = 0;
                }
                for (const n of box.grove.nodes) {
                    n.x += rowX;
                    n.y += rowTop - box.h;
                }
                rowX += box.w;
                rowH = Math.max(rowH, box.h);
            }
        }
    };

    window.SkillAtlas = SkillAtlas;
    SkillMaster.SkillAtlas = SkillAtlas;

})();
