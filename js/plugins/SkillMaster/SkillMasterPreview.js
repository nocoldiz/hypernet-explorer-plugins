/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Effekseer 3D Spell & Skill Animation Previewer.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const AnimPreview = {
        _ctx: null, _gl: null, _canvas: null,
        _effect: null, _handle: null, _effectName: '',
        _rafId: 0, _animId: 0, _dead: false,
        _yaw: 0, _pitch: 0.12, _dist: 10,
        _interactive: false, _dragging: false, _lastX: 0, _lastY: 0,
        _onDown: null, _onMove: null, _onUp: null, _onWheel: null,

        isSupported() { return !!window.effekseer; },

        init(canvas, interactive) {
            if (this._canvas === canvas && this._ctx) return true;
            this.dispose();
            if (!window.effekseer || !canvas) return false;
            const opts = { alpha: true, premultipliedAlpha: true, depth: true, antialias: true };
            const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
            if (!gl) return false;
            let ctx;
            try {
                ctx = window.effekseer.createContext();
                ctx.init(gl, { instanceMaxCount: 4000, squareMaxCount: 8000 });
                ctx.setRestorationOfStatesFlag(true);
            } catch (e) {
                console.error('SkillMaster AnimPreview: Effekseer init failed', e);
                return false;
            }
            this._canvas = canvas; this._gl = gl; this._ctx = ctx; this._dead = false;
            this._yaw = 0; this._pitch = 0.12; this._dist = 10;
            this._interactive = !!interactive;
            if (this._interactive) this._bindInput(canvas);
            this._startLoop();
            return true;
        },

        _bindInput(canvas) {
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            this._onDown = (e) => { this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY; e.preventDefault(); };
            this._onMove = (e) => {
                if (!this._dragging) return;
                this._yaw -= (e.clientX - this._lastX) * 0.01;
                this._pitch = clamp(this._pitch + (e.clientY - this._lastY) * 0.01, -1.3, 1.3);
                this._lastX = e.clientX; this._lastY = e.clientY;
            };
            this._onUp = () => { this._dragging = false; };
            this._onWheel = (e) => {
                this._dist = clamp(this._dist + (e.deltaY > 0 ? 1 : -1) * 1.2, 4, 26);
                e.preventDefault(); e.stopPropagation();
            };
            canvas.addEventListener('pointerdown', this._onDown);
            window.addEventListener('pointermove', this._onMove);
            window.addEventListener('pointerup', this._onUp);
            canvas.addEventListener('wheel', this._onWheel, { passive: false });
        },

        _unbindInput() {
            if (this._canvas && this._onDown) this._canvas.removeEventListener('pointerdown', this._onDown);
            if (this._onMove) window.removeEventListener('pointermove', this._onMove);
            if (this._onUp) window.removeEventListener('pointerup', this._onUp);
            if (this._canvas && this._onWheel) this._canvas.removeEventListener('wheel', this._onWheel);
            this._onDown = this._onMove = this._onUp = this._onWheel = null;
            this._dragging = false;
        },

        _viewMatrix() {
            const cp = Math.cos(this._pitch), sp = Math.sin(this._pitch);
            const sy = Math.sin(this._yaw), cy = Math.cos(this._yaw);
            const ex = this._dist * cp * sy, ey = this._dist * sp, ez = this._dist * cp * cy;
            let fx = -ex, fy = -ey, fz = -ez;
            const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
            let sx = -fz, sy2 = 0, sz = fx;
            const sl = Math.hypot(sx, sy2, sz) || 1; sx /= sl; sy2 /= sl; sz /= sl;
            const ux = sy2 * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy2 * fx;
            return [
                sx, ux, -fx, 0,
                sy2, uy, -fy, 0,
                sz, uz, -fz, 0,
                -(sx * ex + sy2 * ey + sz * ez),
                -(ux * ex + uy * ey + uz * ez),
                (fx * ex + fy * ey + fz * ez),
                1
            ];
        },

        setAnimation(animId) {
            if (!this._ctx) return;
            const anim = (typeof $dataAnimations !== 'undefined') && $dataAnimations[animId];
            this._animId = animId;
            if (!anim || anim.frames || !anim.effectName) {
                this._stopHandle(); this._effect = null; this._effectName = '';
                return;
            }
            const name = anim.effectName;
            if (name === this._effectName && this._effect) { this._replay(); return; }
            this._stopHandle();
            this._effect = null; this._effectName = name;
            const url = 'effects/' + Utils.encodeURI(name) + '.efkefc';
            try {
                const eff = this._ctx.loadEffect(url, 1,
                    () => { if (this._effectName === name) { this._effect = eff; this._replay(); } },
                    () => { /* load failed */ });
            } catch (e) { /* ignore */ }
        },

        _replay() {
            if (!this._ctx || !this._effect) return;
            this._stopHandle();
            try {
                this._handle = this._ctx.play(this._effect, 0, 0, 0);
                if (this._handle) { this._handle.setLocation(0, 0, 0); this._handle.setScale(1, 1, 1); }
            } catch (e) { this._handle = null; }
        },

        _stopHandle() {
            if (this._handle) { try { this._handle.stop(); } catch (e) {} this._handle = null; }
        },

        _startLoop() {
            const W = this._canvas.width, H = this._canvas.height;
            const size = Math.min(W, H);
            const p = -(size / H);
            const proj = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, p, 0, 0, 0, 1];
            const vx = Math.floor((W - size) / 2), vy = Math.floor((H - size) / 2);
            const loop = () => {
                if (this._dead) return;
                this._rafId = requestAnimationFrame(loop);
                const gl = this._gl, ctx = this._ctx;
                if (!gl || !ctx) return;
                try {
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    gl.viewport(vx, vy, size, size);
                    ctx.setProjectionMatrix(proj);
                    ctx.setCameraMatrix(this._viewMatrix());
                    ctx.update();
                    if (this._handle && !this._handle.exists && this._effect) this._replay();
                    ctx.beginDraw();
                    if (this._handle) ctx.drawHandle(this._handle);
                    ctx.endDraw();
                } catch (e) {
                    this._dead = true;
                }
            };
            this._rafId = requestAnimationFrame(loop);
        },

        dispose() {
            this._dead = true;
            this._unbindInput();
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
            this._stopHandle();
            if (this._gl) {
                try {
                    const ext = this._gl.getExtension('WEBGL_lose_context');
                    if (ext) ext.loseContext();
                } catch (e) {}
            }
            this._effect = null; this._effectName = '';
            this._ctx = null; this._gl = null; this._canvas = null;
        }
    };

    window.SkillAnimPreview = AnimPreview;
    SkillMaster.AnimPreview = AnimPreview;

    // Extend Scene_SkillEncyclopedia prototypes for animation preview
    if (!window.Scene_SkillEncyclopedia) {
        window.Scene_SkillEncyclopedia = function () {
            this.initialize(...arguments);
        };
        window.Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        window.Scene_SkillEncyclopedia.prototype.constructor = window.Scene_SkillEncyclopedia;
    }

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    Proto.openSpellPreview = function (skillId) {
        const skill = $dataSkills[skillId];
        if (!skill) { SoundManager.playBuzzer(); return; }
        this._previewSkillId = skillId;
        this._viewMode = 'preview';
        SoundManager.playOk();
        this.buildSpellPreviewOverlay(skill);
    };

    Proto.closeSpellPreview = function () {
        AnimPreview.dispose();
        const ov = document.getElementById('spell-preview-overlay');
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        this._viewMode = 'detail';
        SoundManager.playCancel();
    };

    Proto.buildSpellPreviewOverlay = function (skill) {
        if (!this._dndContainer) return;
        const anim = skill.animationId && $dataAnimations ? $dataAnimations[skill.animationId] : null;
        const previewable = !!(anim && anim.effectName && !anim.frames);
        const animLabel = anim && anim.name
            ? `#${skill.animationId} · ${anim.name}`
            : (typeof T === 'function' ? T('SkillMaster.noAnimation') : 'No Animation');
        const noEfkNote = previewable ? '' :
            `<div style="position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; text-align:center; color:var(--text-card-medium); font-size:1.292rem; pointer-events:none">${typeof T === 'function' ? T('SkillMaster.no3dAnimationForThis') : 'No 3D Animation'}</div>`;

        const old = document.getElementById('spell-preview-overlay');
        if (old && old.parentNode) old.parentNode.removeChild(old);

        const ov = document.createElement('div');
        ov.id = 'spell-preview-overlay';
        ov.style.cssText = 'position:absolute; top:0; left:0; right:0; bottom:0; z-index:2000; display:flex; align-items:center; justify-content:center; background:var(--shadow-black-translucent-75, rgba(0,0,0,0.75)); font-family:var(--font-ui);';
        ov.innerHTML = `
            <div style="width:82%; max-width:560px; max-height:88%; display:flex; flex-direction:column; gap:12px; padding:20px; box-sizing:border-box; background:var(--bg-dark-warm-translucent-96, rgba(20,18,15,0.96)); border:1.5px solid var(--border-focus-hover, var(--text-primary-hover)); border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.75)">
                <div style="display:flex; align-items:center; gap:12px; border-bottom:2px solid var(--border-secondary-hover-translucent-15); padding-bottom:8px">
                    <div style="${SkillMaster.getSkillIconStyle(skill.iconIndex)} transform:scale(1.1); flex-shrink:0; image-rendering:pixelated"></div>
                    <h3 class="cc-header-gothic" style="font-size:1.994rem; color:var(--text-secondary-active, var(--text-primary-hover)); margin:0">${skill.name}</h3>
                </div>
                <div id="spell-preview-stage" style="position:relative; width:100%; height:300px; border-radius:10px; overflow:hidden; border:1.5px solid var(--border-secondary-hover-translucent-15); background:radial-gradient(circle at 50% 42%, var(--bg-tertiary-focus-translucent-45, rgba(40,35,25,0.45)) 0%, rgba(10,8,6,1) 78%)">
                    <div style="position:absolute; left:50%; bottom:26px; transform:translate(-50%, 0) perspective(420px) rotateX(66deg); width:150px; height:150px; border-radius:50%; border:2px solid rgba(229,192,123,0.5); box-shadow:0 0 0 18px rgba(229,192,123,0.16) inset; background:radial-gradient(circle, rgba(229,192,123,0.16) 0%, transparent 70%)"></div>
                    <div style="position:absolute; left:50%; bottom:88px; transform:translateX(-50%); width:2px; height:70px; background:linear-gradient(to bottom, transparent, rgba(229,192,123,0.5)); pointer-events:none"></div>
                    <canvas id="spell-preview-canvas" style="position:absolute; top:0; left:0; width:100%; height:100%; cursor:grab; touch-action:none"></canvas>
                    ${noEfkNote}
                </div>
                <div style="text-align:center; font-size:1.234rem; color:var(--text-secondary-active, var(--text-primary-hover)); font-weight:bold">${animLabel}</div>
                <div style="text-align:center; font-size:1.17rem; color:var(--text-card-medium, #aaa)">${typeof T === 'function' ? T('SkillMaster.dragToRotateScrollTo') : 'Drag to rotate · Scroll to zoom'}</div>
                <div style="display:flex; gap:10px; margin-top:2px">
                    <div class="focusable" onclick="SceneManager._scene.replaySpellPreview()" style="flex:1; text-align:center; padding:9px; background:var(--text-text-alt-3, var(--text-primary-hover)); color:#000; border-radius:6px; cursor:pointer; font-weight:bold; text-transform:uppercase">${typeof T === 'function' ? T('SkillMaster.replay') : 'Replay'}</div>
                    <div class="focusable" onclick="SceneManager._scene.closeSpellPreview()" style="flex:0 0 auto; text-align:center; padding:9px 18px; background:transparent; color:var(--text-primary-hover, var(--text-success-active)); border:1.5px solid var(--text-primary-hover, var(--text-success-active)); border-radius:6px; cursor:pointer; font-weight:bold; text-transform:uppercase">${typeof T === 'function' ? T('SkillMaster.close') : 'Close'}</div>
                </div>
            </div>`;
        this._dndContainer.appendChild(ov);

        requestAnimationFrame(() => {
            if (this._viewMode !== 'preview') return;
            const canvas = document.getElementById('spell-preview-canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(64, Math.floor(rect.width));
            canvas.height = Math.max(64, Math.floor(rect.height));
            if (previewable && AnimPreview.isSupported() && AnimPreview.init(canvas, true)) {
                AnimPreview.setAnimation(skill.animationId);
            }
        });
    };

    Proto.replaySpellPreview = function () {
        const skill = $dataSkills[this._previewSkillId];
        if (skill && skill.animationId) AnimPreview.setAnimation(skill.animationId);
        SoundManager.playCursor();
    };

    Proto.updateSpellPreviewInput = function () {
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeSpellPreview();
            return;
        }
        if (Input.isTriggered('ok')) {
            this.replaySpellPreview();
            return;
        }
        for (const dir of ['down', 'right', 'up', 'left']) {
            if (Input.isTriggered(dir) || Input.isRepeated(dir)) {
                this._ccEnterNav(dir);
                break;
            }
        }
    };

})();
