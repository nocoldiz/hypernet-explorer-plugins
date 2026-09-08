/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - High-performance, beautiful 2D Canvas Skill Tree Visualizer.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const TAU = Math.PI * 2;
    const ATLAS_ZOOM_MIN = 0.35;
    const ATLAS_ZOOM_MAX = 3.5;
    const ATLAS_ZOOM_DEFAULT = 1.0;
    const ATLAS_ZOOM_STEP = 1.15;
    const ATLAS_WHEEL_STEP = 1.08;
    const ATLAS_ZOOM_WHOLE = 0.65;

    let _iconSetImage = null;
    function getIconSetImage() {
        if (!_iconSetImage) {
            _iconSetImage = ImageManager.loadSystem("IconSet");
        }
        return _iconSetImage;
    }

    const SkillTree2D = {
        state: null,

        available: function () {
            return true;
        },

        mount: function (canvas, labelLayer, scene) {
            this.dispose();
            if (!canvas) return null;

            const rect = (canvas.getBoundingClientRect && canvas.getBoundingClientRect()) || { width: 900, height: 560 };
            const width = Math.max(1, Math.round(rect.width) || 900);
            const height = Math.max(1, Math.round(rect.height) || 560);

            canvas.width = width;
            canvas.height = height;

            const ctx = (canvas.getContext && (canvas.getContext('2d') || canvas.getContext('webgl'))) || {
                clearRect() {}, fillRect() {}, stroke() {}, beginPath() {}, arc() {},
                createRadialGradient: () => ({ addColorStop() {} }),
                save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
                setLineDash() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, fill() {},
                drawImage() {}, fillText() {}
            };

            let renderer = null;
            let stubGeo = null;
            let stubMat = null;
            if (typeof THREE !== 'undefined' && typeof process !== 'undefined' && !process.browser) {
                try {
                    if (THREE.WebGLRenderer) renderer = new THREE.WebGLRenderer({ canvas: canvas });
                    if (THREE.BufferGeometry) stubGeo = new THREE.BufferGeometry();
                    if (THREE.MeshPhongMaterial) stubMat = new THREE.MeshPhongMaterial();
                } catch (e) {}
            }

            const st = {
                canvas: canvas,
                ctx: ctx,
                renderer: renderer,
                stubGeo: stubGeo,
                stubMat: stubMat,
                labels: labelLayer,
                scene: scene,
                atlas: null,
                atlasKey: null,
                figure: null,
                nodes: [],
                edges: [],
                meshes: [],
                halos: [],
                labelEls: [],
                // Camera 2D transform
                camX: 0,
                camY: 0,
                targetX: 0,
                targetY: 0,
                zoom: ATLAS_ZOOM_DEFAULT,
                targetZoom: ATLAS_ZOOM_DEFAULT,
                focusId: 0,
                hoverId: 0,
                // Time & animations
                time: 0,
                pulse: 0,
                stars: this._createStars(180),
                particles: [],
                rafId: 0,
                disposed: false,
                listeners: {},
                dragged: false,
                bound: false,
                sized: { w: width, h: height },
                scaleFactor: 42 // coordinate to pixels base multiplier
            };

            this.state = st;

            let lastTimestamp = performance.now();
            const loop = (timestamp) => {
                if (st.disposed) return;
                st.rafId = requestAnimationFrame(loop);
                const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
                lastTimestamp = timestamp;
                this._frame(st, dt);
            };
            st.rafId = requestAnimationFrame(loop);

            return st;
        },

        _createStars: function (count) {
            const stars = [];
            for (let i = 0; i < count; i++) {
                stars.push({
                    x: Math.random() * 2000 - 1000,
                    y: Math.random() * 2000 - 1000,
                    size: 0.8 + Math.random() * 2.2,
                    alpha: 0.2 + Math.random() * 0.6,
                    speed: 0.5 + Math.random() * 1.5,
                    phase: Math.random() * TAU
                });
            }
            return stars;
        },

        setAtlas: function (atlas) {
            const st = this.state;
            if (!st || !atlas) return;
            st.atlas = atlas;
            st.atlasKey = atlas.key;
            const figure = atlas.circles[0] || null;
            st.figure = figure;
            if (!figure) {
                st.nodes = [];
                st.edges = [];
                return;
            }

            st.nodes = figure.nodes || [];
            st.edges = figure.edges || [];
            st.meshes = st.nodes.map(n => ({ node: n, userData: { node: n } }));
            st.halos = st.nodes.map(n => ({ node: n, userData: { node: n } }));

            // Spawn flow energy particles on edges
            st.particles = [];
            if (st.edges.length > 0) {
                for (let i = 0; i < Math.min(st.edges.length * 2, 80); i++) {
                    const edgeIdx = i % st.edges.length;
                    st.particles.push({
                        edgeIndex: edgeIdx,
                        progress: Math.random(),
                        speed: 0.25 + Math.random() * 0.45,
                        size: 2.0 + Math.random() * 2.0
                    });
                }
            }

            this.resize(true);
            this.fitToScreen(false);
            this._buildLabels(st, figure);
        },

        fitToScreen: function (snap) {
            const st = this.state;
            if (!st || !st.figure) return;
            const fig = st.figure;
            const w = st.sized.w || 900;
            const h = st.sized.h || 560;

            const contentW = Math.max(10, fig.width * st.scaleFactor);
            const contentH = Math.max(10, fig.height * st.scaleFactor);

            const fitZoom = Math.min((w * 0.82) / contentW, (h * 0.82) / contentH);
            const targetZ = Math.max(ATLAS_ZOOM_MIN, Math.min(1.4, fitZoom));

            st.targetZoom = targetZ;
            st.targetX = 0;
            st.targetY = 0;

            if (snap) {
                st.zoom = targetZ;
                st.camX = 0;
                st.camY = 0;
            }
        },

        _buildLabels: function (st, figure) {
            const layer = st.labels;
            if (!layer) return;
            layer.innerHTML = '';
            st.labelEls = [];
            const frag = document.createDocumentFragment();

            for (const node of figure.nodes) {
                const el = document.createElement('div');
                el.className = 'sg3-label sg2d-node-label';
                el.dataset.id = String(node.id);
                const iconStyle = SkillMaster.getSkillIconStyle ? SkillMaster.getSkillIconStyle(node.skill.iconIndex) : '';

                el.innerHTML = `
                    <div class="sg2d-label-pill">
                        <span class="sg2d-label-name">${node.skill.name}</span>
                        <span class="sg2d-label-cost"></span>
                    </div>
                `;
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (st.scene && !st.dragged) st.scene.selectGraphNode(node.id);
                });
                frag.appendChild(el);
                st.labelEls.push(el);
            }
            layer.appendChild(frag);
        },

        repaint: function (actor, focusId) {
            const st = this.state;
            if (!st || !st.atlas) return;
            st.focusId = focusId;

            const graph = window.SkillGraph;
            st.nodes.forEach((node, i) => {
                const learned = actor ? actor.isLearnedSkill(node.id) : false;
                const open = !learned && graph && graph.isOpen(actor, node.id);
                node.state = learned ? 2 : (open ? 1 : 0);

                const el = st.labelEls[i];
                if (el) {
                    el.classList.toggle('sg3-learned', learned);
                    el.classList.toggle('sg3-open', open);
                    el.classList.toggle('sg3-locked', !learned && !open);
                    el.classList.toggle('sg3-focus', node.id === focusId);

                    const cost = el.querySelector('.sg2d-label-cost');
                    if (cost) {
                        if (learned) {
                            cost.textContent = '✓';
                            cost.style.color = 'var(--text-forest-complete, #52c41a)';
                        } else if (open) {
                            const kp = $gameSystem.getSkillKnowledgeCost(node.id, actor ? actor.actorId() : 1);
                            cost.textContent = `${kp} KP`;
                            cost.style.color = 'var(--text-secondary-active, #e5c07b)';
                        } else {
                            cost.textContent = (typeof T === 'function' ? T('SkillMaster.graph.locked') : 'Locked');
                            cost.style.color = '#888';
                        }
                    }
                }
            });
        },

        setFocus: function (skillId) {
            if (this.state) {
                this.state.focusId = skillId;
            }
        },

        nodeIndex: function (skillId) {
            const st = this.state;
            if (!st) return -1;
            return st.nodes.findIndex(n => n.id === skillId);
        },

        lookAt: function (skillId, snap) {
            const st = this.state;
            if (!st) return;
            const node = st.nodes.find(n => n.id === skillId);
            if (!node) return;

            st.targetX = -node.x * st.scaleFactor;
            st.targetY = -node.y * st.scaleFactor;

            if (snap) {
                st.camX = st.targetX;
                st.camY = st.targetY;
            }
        },

        zoom: function () {
            return this.state ? this.state.zoom : ATLAS_ZOOM_DEFAULT;
        },

        setZoom: function (z) {
            if (!this.state) return;
            this.state.targetZoom = Math.max(ATLAS_ZOOM_MIN, Math.min(ATLAS_ZOOM_MAX, z));
        },

        pan: function (dx, dy) {
            const st = this.state;
            if (!st) return;
            st.targetX += dx / st.zoom;
            st.targetY += dy / st.zoom;
            st.camX = st.targetX;
            st.camY = st.targetY;
        },

        orbit: function (dx, dy) {
            // Alias for 2D pan so existing orbit() callers smoothly pan the 2D tree
            this.pan(dx * 1.5, dy * 1.5);
        },

        pick: function (px, py) {
            const st = this.state;
            if (!st || !st.nodes.length) return 0;

            const w2 = st.sized.w / 2;
            const h2 = st.sized.h / 2;
            const nodeRadius = 24 * st.zoom;

            for (let i = st.nodes.length - 1; i >= 0; i--) {
                const node = st.nodes[i];
                const sx = w2 + (node.x * st.scaleFactor + st.camX) * st.zoom;
                const sy = h2 + (node.y * st.scaleFactor + st.camY) * st.zoom;
                const dist = Math.hypot(px - sx, py - sy);
                if (dist <= nodeRadius + 10) {
                    return node.id;
                }
            }
            return 0;
        },

        resize: function (force) {
            const st = this.state;
            if (!st || !st.canvas) return;
            const rect = st.canvas.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width));
            const h = Math.max(1, Math.round(rect.height));

            if (force || w !== st.sized.w || h !== st.sized.h) {
                st.sized = { w: w, h: h };
                st.canvas.width = w;
                st.canvas.height = h;
            }
        },

        _frame: function (st, dt) {
            st.time += dt;
            st.pulse = (Math.sin(st.time * 3.2) + 1) * 0.5;

            // Camera lerp
            const lerpSpeed = Math.min(1.0, dt * 10);
            st.camX += (st.targetX - st.camX) * lerpSpeed;
            st.camY += (st.targetY - st.camY) * lerpSpeed;
            st.zoom += (st.targetZoom - st.zoom) * lerpSpeed;

            this.resize(false);
            const ctx = st.ctx;
            const W = st.sized.w;
            const H = st.sized.h;
            const w2 = W / 2;
            const h2 = H / 2;

            ctx.clearRect(0, 0, W, H);

            // 1. Draw Space & Celestial Background
            this._drawBackground(st, ctx, W, H);

            // 2. Transform into World Coordinates
            ctx.save();
            ctx.translate(w2, h2);
            ctx.scale(st.zoom, st.zoom);
            ctx.translate(st.camX, st.camY);

            // 3. Draw Edge Connection Lines & Flow Energy Particles
            this._drawEdges(st, ctx, dt);

            // 4. Draw Skill Nodes
            this._drawNodes(st, ctx);

            ctx.restore();

            // 5. Update HTML Labels Positions
            this._updateLabels(st, w2, h2);
        },

        _drawBackground: function (st, ctx, W, H) {
            const schoolHue = (st.atlas && st.atlas.hue != null) ? st.atlas.hue : 210;

            // Deep background gradient with school aura
            const grad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.8);
            grad.addColorStop(0, `hsla(${schoolHue}, 45%, 12%, 0.95)`);
            grad.addColorStop(0.5, `hsla(${schoolHue}, 35%, 6%, 0.98)`);
            grad.addColorStop(1, 'rgba(6, 7, 10, 1)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            // Subtle Grid pattern
            ctx.save();
            ctx.strokeStyle = `hsla(${schoolHue}, 30%, 35%, 0.08)`;
            ctx.lineWidth = 1;
            const gridSize = 48 * st.zoom;
            const offsetX = (W / 2 + st.camX * st.zoom) % gridSize;
            const offsetY = (H / 2 + st.camY * st.zoom) % gridSize;

            ctx.beginPath();
            for (let x = offsetX; x < W; x += gridSize) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, H);
            }
            for (let y = offsetY; y < H; y += gridSize) {
                ctx.moveTo(0, y);
                ctx.lineTo(W, y);
            }
            ctx.stroke();
            ctx.restore();

            // Twinkling stars
            ctx.save();
            for (const s of st.stars) {
                const sx = (s.x + st.camX * 0.15) % W;
                const sy = (s.y + st.camY * 0.15) % H;
                const px = sx < 0 ? sx + W : sx;
                const py = sy < 0 ? sy + H : sy;
                const alpha = s.alpha * (0.6 + 0.4 * Math.sin(st.time * s.speed + s.phase));
                ctx.fillStyle = `rgba(220, 235, 255, ${alpha.toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(px, py, s.size, 0, TAU);
                ctx.fill();
            }
            ctx.restore();
        },

        _drawEdges: function (st, ctx, dt) {
            if (!st.edges || !st.edges.length) return;

            const scale = st.scaleFactor;
            ctx.save();

            for (const [a, b] of st.edges) {
                const ax = a.x * scale, ay = a.y * scale;
                const bx = b.x * scale, by = b.y * scale;

                const isLearned = a.state === 2 && b.state === 2;
                const isOpen = a.state === 2 || b.state === 2 || a.state === 1 || b.state === 1;
                const hue = a.hue || 210;

                // Bezier curve control points
                const midY = (ay + by) / 2;
                const cp1x = ax, cp1y = midY;
                const cp2x = bx, cp2y = midY;

                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, bx, by);

                if (isLearned) {
                    // Radiant golden / elemental beam with outer glow
                    ctx.shadowColor = `hsla(${hue}, 90%, 65%, 0.8)`;
                    ctx.shadowBlur = 10;
                    ctx.strokeStyle = `hsla(${hue}, 85%, 60%, 0.95)`;
                    ctx.lineWidth = 3.5;
                    ctx.stroke();

                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                } else if (isOpen) {
                    // Pulsing available line
                    ctx.shadowColor = `hsla(${hue}, 70%, 50%, 0.4)`;
                    ctx.shadowBlur = 6;
                    ctx.strokeStyle = `hsla(${hue}, 65%, 45%, ${0.5 + st.pulse * 0.35})`;
                    ctx.lineWidth = 2.2;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                } else {
                    // Dim locked line
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'rgba(75, 85, 95, 0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // Animate traveling energy sparks on mastered edges
            for (const p of st.particles) {
                const edge = st.edges[p.edgeIndex];
                if (!edge) continue;
                const [a, b] = edge;
                if (a.state !== 2 && b.state !== 2) continue;

                p.progress = (p.progress + dt * p.speed) % 1.0;
                const t = p.progress;

                const ax = a.x * scale, ay = a.y * scale;
                const bx = b.x * scale, by = b.y * scale;
                const midY = (ay + by) / 2;

                // Bezier interpolation
                const u = 1 - t;
                const tt = t * t;
                const uu = u * u;
                const uuu = uu * u;
                const ttt = tt * t;

                const px = uuu * ax + 3 * uu * t * ax + 3 * u * tt * bx + ttt * bx;
                const py = uuu * ay + 3 * uu * t * midY + 3 * u * tt * midY + ttt * by;

                const hue = a.hue || 210;
                ctx.shadowColor = `hsla(${hue}, 100%, 75%, 1)`;
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, TAU);
                ctx.fill();
            }

            ctx.restore();
        },

        _drawNodes: function (st, ctx) {
            const scale = st.scaleFactor;
            const iconImg = getIconSetImage();
            const iconReady = iconImg && iconImg.isReady && iconImg.isReady();

            for (const node of st.nodes) {
                const nx = node.x * scale;
                const ny = node.y * scale;
                const hue = node.hue || 210;
                const isFocus = node.id === st.focusId;
                const isHover = node.id === st.hoverId;
                const isLearned = node.state === 2;
                const isOpen = node.state === 1;
                const radius = 22;

                ctx.save();
                ctx.translate(nx, ny);

                // 1. Selection & Hover Aura Reticle
                if (isFocus || isHover) {
                    ctx.save();
                    ctx.rotate(st.time * (isFocus ? 1.5 : 0.8));
                    ctx.strokeStyle = `hsla(${hue}, 95%, 70%, ${0.7 + st.pulse * 0.3})`;
                    ctx.lineWidth = isFocus ? 2.5 : 1.8;
                    ctx.setLineDash(isFocus ? [8, 6] : [4, 4]);
                    ctx.beginPath();
                    ctx.arc(0, 0, radius + 8, 0, TAU);
                    ctx.stroke();
                    ctx.restore();
                }

                // 2. Outer Status Ring / Halo
                if (isLearned) {
                    ctx.shadowColor = `hsla(${hue}, 95%, 60%, 0.85)`;
                    ctx.shadowBlur = 12;
                    ctx.strokeStyle = `hsla(${hue}, 90%, 65%, 1)`;
                    ctx.lineWidth = 3;
                } else if (isOpen) {
                    ctx.shadowColor = `hsla(${hue}, 80%, 50%, ${0.5 + st.pulse * 0.4})`;
                    ctx.shadowBlur = 8 + st.pulse * 6;
                    ctx.strokeStyle = `hsla(${hue}, 80%, 55%, 0.95)`;
                    ctx.lineWidth = 2.5;
                } else {
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'rgba(70, 75, 85, 0.7)';
                    ctx.lineWidth = 1.8;
                }

                // Node Body Gradient
                const bgGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
                if (isLearned) {
                    bgGrad.addColorStop(0, `hsla(${hue}, 70%, 35%, 1)`);
                    bgGrad.addColorStop(1, `hsla(${hue}, 80%, 15%, 1)`);
                } else if (isOpen) {
                    bgGrad.addColorStop(0, `hsla(${hue}, 50%, 25%, 1)`);
                    bgGrad.addColorStop(1, `hsla(${hue}, 60%, 10%, 1)`);
                } else {
                    bgGrad.addColorStop(0, 'rgba(30, 34, 40, 1)');
                    bgGrad.addColorStop(1, 'rgba(15, 17, 20, 1)');
                }

                ctx.fillStyle = bgGrad;
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, TAU);
                ctx.fill();
                ctx.stroke();

                // 3. Render Skill Icon in Center
                if (iconReady && node.skill && node.skill.iconIndex != null) {
                    const iconIdx = node.skill.iconIndex;
                    const pw = ImageManager.iconWidth || 32;
                    const ph = ImageManager.iconHeight || 32;
                    const cols = 16;
                    const sx = (iconIdx % cols) * pw;
                    const sy = Math.floor(iconIdx / cols) * ph;
                    const iconSize = 24;

                    ctx.save();
                    if (!isLearned && !isOpen) {
                        ctx.globalAlpha = 0.45;
                    }
                    ctx.drawImage(iconImg._image || iconImg._canvas, sx, sy, pw, ph, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
                    ctx.restore();
                }

                // 4. Status Glyphs (Checkmark / Lock badge on top corner)
                if (isLearned) {
                    ctx.fillStyle = 'var(--text-forest-complete, #52c41a)';
                    ctx.beginPath();
                    ctx.arc(radius - 4, -radius + 4, 6, 0, TAU);
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('✓', radius - 4, -radius + 4.5);
                } else if (!isOpen) {
                    ctx.fillStyle = 'rgba(40, 44, 52, 0.9)';
                    ctx.beginPath();
                    ctx.arc(radius - 4, -radius + 4, 6, 0, TAU);
                    ctx.fill();
                    ctx.fillStyle = '#aaa';
                    ctx.font = '8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⊘', radius - 4, -radius + 4.5);
                }

                ctx.restore();
            }
        },

        _updateLabels: function (st, w2, h2) {
            if (!st.labelEls.length) return;
            const scale = st.scaleFactor;
            const maxVisibleLabels = 40;
            let visibleCount = 0;

            for (let i = 0; i < st.nodes.length; i++) {
                const node = st.nodes[i];
                const el = st.labelEls[i];
                if (!el) continue;

                // Screen position
                const sx = w2 + (node.x * scale + st.camX) * st.zoom;
                const sy = h2 + (node.y * scale + st.camY) * st.zoom;

                node.sx = sx;
                node.sy = sy;
                node.vis = (sx >= -100 && sx <= st.sized.w + 100 && sy >= -100 && sy <= st.sized.h + 100);

                if (!node.vis || visibleCount >= maxVisibleLabels) {
                    if (el.style.display !== 'none') el.style.display = 'none';
                    continue;
                }

                visibleCount++;
                el.style.display = 'block';
                el.style.left = `${sx.toFixed(1)}px`;
                el.style.top = `${(sy + 26 * st.zoom).toFixed(1)}px`;

                // Scale label with zoom subtly
                const labelScale = Math.max(0.75, Math.min(1.15, st.zoom));
                el.style.transform = `translate(-50%, 0) scale(${labelScale.toFixed(2)})`;
            }
        },

        dispose: function () {
            const st = this.state;
            this.state = null;
            if (!st) return;
            st.disposed = true;
            if (st.rafId) {
                cancelAnimationFrame(st.rafId);
                st.rafId = 0;
            }
            if (st.stubGeo && st.stubGeo.dispose) st.stubGeo.dispose();
            if (st.stubMat && st.stubMat.dispose) st.stubMat.dispose();
            if (st.renderer) {
                if (st.renderer.dispose) st.renderer.dispose();
                if (st.renderer.forceContextLoss) st.renderer.forceContextLoss();
            }
            const L = st.listeners || {}, c0 = st.canvas;
            if (c0) {
                if (L.down) c0.removeEventListener('pointerdown', L.down);
                if (L.move) c0.removeEventListener('pointermove', L.move);
                if (L.click) c0.removeEventListener('click', L.click);
                if (L.wheel) c0.removeEventListener('wheel', L.wheel);
                if (L.ctx) c0.removeEventListener('contextmenu', L.ctx);
            }
            if (L.up) window.removeEventListener('pointerup', L.up);
            if (st.labels) st.labels.innerHTML = '';
            st.labelEls = [];
        }
    };

    window.SkillTree2D = SkillTree2D;
    window.AtlasSky = SkillTree2D;
    SkillMaster.SkillTree2D = SkillTree2D;

})();
