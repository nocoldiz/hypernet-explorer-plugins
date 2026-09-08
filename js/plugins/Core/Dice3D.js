/*:
 * @target MZ
 * @plugindesc v1.6.0 High-Legibility Compact 3D d20 Dice System with Perfectly Upright Faces, Unified Premium Result Window & an event-driven stat check.
 * @author Omni-Lex
 * @pluginName Dice3D
 *
 * @help Dice3D.js
 *
 * Provides a sleek, compact, hardware-accelerated 3D d20 dice throw across the screen
 * for battles, trials, negotiations, rites, and social actions.
 *
 * Features:
 * - 100% mathematically level, upright face-to-camera alignment for all 20 facets
 * - Slower, graceful tumbling physics (860ms) with gentle settle
 * - Scaled, high-contrast bold numerals with zero distortion
 * - Single unified glassmorphic result window with dynamic calculation summing
 * - Audio-synced CC0 dice rolls and outcome chimes
 * - Exposes window.Dice3D
 *
 * ---------------------------------------------------------------------------
 * Stat Check (plugin command)
 * ---------------------------------------------------------------------------
 * Asks the player, in a modal, whether to try a d20 check against a number:
 * the card names the stat, the modifier it lends and the number to reach, and
 * offers Try or Walk away. Nothing at all happens if they walk away.
 *
 * Try throws the die on screen and then, by the result:
 *   - success: turns a switch on, turns a self switch of THIS event on, and
 *     writes a number into a variable - any of the three, or all of them
 *   - failure: the same three, with their own values
 *
 * A natural 20 always succeeds and a natural 1 always fails, whatever the
 * modifier says. The total rolled can be written into a variable of its own,
 * so an event can grade the outcome rather than only pass or fail it.
 *
 * The event waits on the modal and on the die, so the command that follows
 * runs after the result is known.
 *
 * @command StatCheck
 * @text Stat Check (d20)
 * @desc Offer a d20 check against a target number, then set switches and variables by the result.
 *
 * @arg stat
 * @text Stat
 * @desc The ability the roll leans on. Its modifier is added to the die.
 * @type select
 * @option STR
 * @option CON
 * @option INT
 * @option WIS
 * @option DEX
 * @option PSI
 * @option NONE
 * @default STR
 *
 * @arg dc
 * @text Number to reach
 * @desc The roll plus the modifier must reach this to succeed.
 * @type number
 * @min 1
 * @max 40
 * @default 12
 *
 * @arg who
 * @text Who rolls
 * @desc Whose modifier the die is read with.
 * @type select
 * @option Party leader
 * @value leader
 * @option Best in the party
 * @value best
 * @option A chosen character
 * @value actor
 * @default leader
 *
 * @arg actorId
 * @text Chosen character
 * @desc Only read when "Who rolls" is set to a chosen character.
 * @type actor
 * @default 0
 *
 * @arg label
 * @text Title
 * @desc What the card and the die call this check. Left empty, it names the stat.
 * @type string
 * @default
 *
 * @arg allowCancel
 * @text Offer a way out
 * @desc When off, the card has no Walk away button and the check must be tried.
 * @type boolean
 * @default true
 *
 * @arg successSwitch
 * @text On success: switch
 * @desc Turned ON when the check succeeds. Leave empty for none.
 * @type switch
 * @default 0
 *
 * @arg successSelfSwitch
 * @text On success: self switch
 * @desc Self switch of this event, turned ON when the check succeeds.
 * @type select
 * @option (none)
 * @value
 * @option A
 * @option B
 * @option C
 * @option D
 * @default
 *
 * @arg successVariable
 * @text On success: variable
 * @desc Written when the check succeeds. Leave empty for none.
 * @type variable
 * @default 0
 *
 * @arg successValue
 * @text On success: value
 * @desc The number written into that variable.
 * @type number
 * @min -9999999
 * @default 1
 *
 * @arg failSwitch
 * @text On failure: switch
 * @desc Turned ON when the check fails. Leave empty for none.
 * @type switch
 * @default 0
 *
 * @arg failSelfSwitch
 * @text On failure: self switch
 * @desc Self switch of this event, turned ON when the check fails.
 * @type select
 * @option (none)
 * @value
 * @option A
 * @option B
 * @option C
 * @option D
 * @default
 *
 * @arg failVariable
 * @text On failure: variable
 * @desc Written when the check fails. Leave empty for none.
 * @type variable
 * @default 0
 *
 * @arg failValue
 * @text On failure: value
 * @desc The number written into that variable.
 * @type number
 * @min -9999999
 * @default 0
 *
 * @arg totalVariable
 * @text Total rolled
 * @desc Always written with the roll plus the modifier, however it went.
 * @type variable
 * @default 0
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'Dice3D';

    // Every word this plugin puts on screen comes out of
    // js/i18n/<lang>/plugins/Dice3D.json.
    const DT = (key, params) => (window.T ? window.T('Dice3D.' + key, params) : key);

    // The six abilities, in the order the engine keeps its parameters. NONE is
    // a flat die: fortune with nobody's arm behind it.
    const STAT_PARAM = { STR: 2, CON: 3, INT: 4, WIS: 5, DEX: 6, PSI: 7 };

    const statLabel = (stat) =>
        (window.CCStatLabel ? window.CCStatLabel(stat) : stat);

    class Dice3DManager {
        constructor() {
            this._active = false;
            this._canvas = null;
            this._renderer = null;
            this._scene = null;
            this._camera = null;
            this._diceMesh = null;
            this._faceNormals = [];
            this._faceUpVectors = [];
            this._faceRightVectors = [];
            this._faceQuats = [];
            this._animFrameId = null;
            // How many dice are in the air or waiting their turn. The scene,
            // the card and the frame loop are all single: two throws at once
            // would land on top of each other, so a second one waits.
            this._pendingRolls = 0;
            this._rollChain = null;
            this._initStyles();
        }

        // True from the moment a die is asked for until the last one has
        // landed. A caller that must not fire twice asks this before rolling.
        isRolling() {
            return this._pendingRolls > 0;
        }

        _shouldShow3D(options = {}) {
            if (options.forceToast === true) return false;
            if (options.force3D === true) return true;
            if (typeof $gameParty !== 'undefined' && $gameParty.inBattle && $gameParty.inBattle()) return true;

            const act = String(options.actionName || '').toLowerCase();
            if (act.includes('eris') || act.includes('onu') || act.includes('court') ||
                act.includes('romance') || act.includes('propose') || act.includes('proposal') ||
                act.includes('empathize') || act.includes('steal') || act.includes('shoplift') || act.includes('pickpocket') ||
                act.includes('summon') || act.includes('fusion') || act.includes('spell') ||
                act.includes('recruit') || act.includes('tame') || act.includes('talk') || act.includes('bash') ||
                act.includes('cook') || act.includes('culinary')) {
                return true;
            }
            return false;
        }

        _initStyles() {
            if (typeof document === 'undefined') return;
            if (document.getElementById('dice3d-styles')) return;
            const style = document.createElement('style');
            style.id = 'dice3d-styles';
            style.textContent = `
                #dice3d-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    z-index: 999999;
                    pointer-events: none;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    opacity: 1;
                    transition: opacity 0.45s ease;
                }
                #dice3d-container.fade-out {
                    opacity: 0;
                }
                #dice3d-canvas {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                }
                /* The result strip: a thin rule of a card, read at a glance.
                   No glow, no gradient, no boxed status word: the numbers are
                   the message and everything else stays out of their way. */
                #dice3d-banner {
                    position: absolute;
                    bottom: 15%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                    padding: 10px 22px;
                    background: rgba(10, 9, 8, 0.82);
                    border: 1px solid rgba(212, 175, 55, 0.28);
                    border-radius: 3px;
                    font-family: 'Cinzel', var(--font-ui), 'GameFont';
                    color: var(--text-success-active);
                    opacity: 0;
                    transform: translateY(10px);
                    transition: opacity 0.22s ease, transform 0.22s ease;
                    pointer-events: none;
                    min-width: 210px;
                }
                #dice3d-banner.show {
                    opacity: 1;
                    transform: translateY(0);
                }
                #dice3d-banner.crit-success { border-color: rgba(255, 215, 0, 0.55); }
                #dice3d-banner.crit-fail { border-color: rgba(255, 51, 68, 0.55); }
                .dice3d-header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                }
                .dice3d-title {
                    font-size: 0.66rem;
                    letter-spacing: 1.6px;
                    text-transform: uppercase;
                    color: #9d9382;
                    font-weight: normal;
                }
                /* The scoreboard: what was rolled over what it had to reach. */
                .dice3d-score {
                    display: flex;
                    align-items: baseline;
                    justify-content: center;
                    gap: 8px;
                    margin: 2px 0 0;
                }
                .dice3d-score-cell {
                    display: flex;
                    flex-direction: row;
                    align-items: baseline;
                    gap: 5px;
                }
                .dice3d-score-num {
                    font-size: 1.8rem;
                    line-height: 1.1;
                    font-weight: 700;
                    color: var(--text-success-active);
                    transition: color 0.2s ease;
                }
                .dice3d-score-num.need { color: #e5c158; }
                .dice3d-score-num.summed { color: var(--text-primary-hover); }
                .dice3d-score-num.crit-success { color: var(--text-primary-hover); }
                .dice3d-score-num.crit-fail { color: #ff4d4d; }
                .dice3d-score-label {
                    font-size: 0.58rem;
                    letter-spacing: 1.2px;
                    text-transform: uppercase;
                    color: #7d766a;
                }
                .dice3d-slash {
                    font-size: 1.2rem;
                    font-weight: 300;
                    color: #6d6558;
                }
                .dice3d-breakdown {
                    font-size: 0.72rem;
                    letter-spacing: 0.4px;
                    color: #9d9382;
                    text-align: center;
                }
                .dice3d-breakdown .mod { color: #81c784; }
                .dice3d-breakdown .mod.neg { color: #ef9a9a; }
                .dice3d-status {
                    font-size: 0.72rem;
                    font-weight: bold;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    padding: 0;
                    background: none;
                    border: none;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }
                .dice3d-status.visible { opacity: 1; }
                .dice3d-status.success { color: #a5d6a7; }
                .dice3d-status.failure { color: #ef9a9a; }
                .dice3d-status.crit-success { color: var(--text-primary-hover); }
                .dice3d-status.crit-fail { color: #ff5252; }
                .dice3d-footer {
                    font-size: 0.72rem;
                    color: #b0bec5;
                    letter-spacing: 0.5px;
                }
                /* ---------------------------------------------------------
                   The card that offers the check before the die is thrown.
                   It is the only part of this plugin the player can click, so
                   it is the only part that takes pointer events.
                   --------------------------------------------------------- */
                #dice3d-prompt {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    z-index: 1000000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.55);
                    backdrop-filter: blur(2px);
                    font-family: 'Cinzel', var(--font-ui), 'GameFont';
                    opacity: 0;
                    transition: opacity 0.18s ease;
                }
                #dice3d-prompt.show { opacity: 1; }
                .dice3d-prompt-card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 10px;
                    min-width: 340px;
                    max-width: 78vw;
                    padding: 22px 34px 20px;
                    background: linear-gradient(145deg, rgba(22, 19, 15, 0.97), rgba(10, 9, 8, 0.99));
                    border: 1.5px solid var(--text-primary-hover);
                    border-radius: 10px;
                    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.9), 0 0 26px rgba(212, 175, 55, 0.3);
                    transform: translateY(14px) scale(0.96);
                    transition: transform 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                #dice3d-prompt.show .dice3d-prompt-card { transform: translateY(0) scale(1); }
                .dice3d-prompt-title {
                    font-size: 0.86rem;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    color: #e5c158;
                    font-weight: bold;
                    text-align: center;
                    border-bottom: 1px solid rgba(212, 175, 55, 0.3);
                    padding-bottom: 6px;
                    width: 100%;
                }
                .dice3d-prompt-who {
                    font-size: 0.82rem;
                    color: #b0bec5;
                    letter-spacing: 0.5px;
                }
                .dice3d-prompt-target {
                    font-size: 1.9rem;
                    font-weight: 900;
                    color: var(--text-success-active);
                    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
                }
                .dice3d-prompt-formula {
                    font-size: 1rem;
                    color: #81c784;
                    letter-spacing: 1px;
                }
                .dice3d-prompt-buttons {
                    display: flex;
                    gap: 14px;
                    margin-top: 8px;
                }
                .dice3d-prompt-btn {
                    min-width: 120px;
                    padding: 8px 18px;
                    font-family: inherit;
                    font-size: 0.92rem;
                    font-weight: bold;
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                    color: #e0e0e0;
                    background: rgba(0, 0, 0, 0.55);
                    border: 1px solid rgba(212, 175, 55, 0.45);
                    border-radius: 5px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .dice3d-prompt-btn:hover { color: var(--text-success-active); border-color: var(--text-primary-hover); }
                .dice3d-prompt-btn.selected {
                    color: var(--text-primary-hover);
                    border-color: var(--text-primary-hover);
                    background: rgba(212, 175, 55, 0.16);
                    box-shadow: 0 0 14px rgba(255, 215, 0, 0.45);
                    transform: scale(1.04);
                }
            `;
            document.head.appendChild(style);
        }

        _setupThree() {
            if (this._scene) return;
            if (typeof THREE === 'undefined' || typeof document === 'undefined') return;

            const container = document.createElement('div');
            container.id = 'dice3d-container';
            container.style.display = 'none';

            const canvas = document.createElement('canvas');
            canvas.id = 'dice3d-canvas';
            container.appendChild(canvas);

            const banner = document.createElement('div');
            banner.id = 'dice3d-banner';
            banner.innerHTML = `
                <div class="dice3d-header">
                    <span class="dice3d-title" id="dice3d-title"></span>
                </div>
                <div class="dice3d-score">
                    <div class="dice3d-score-cell">
                        <span class="dice3d-score-num" id="dice3d-num"></span>
                        <span class="dice3d-score-label" id="dice3d-label-rolled"></span>
                    </div>
                    <span class="dice3d-slash">/</span>
                    <div class="dice3d-score-cell">
                        <span class="dice3d-score-num need" id="dice3d-need"></span>
                        <span class="dice3d-score-label" id="dice3d-label-need"></span>
                    </div>
                </div>
                <div class="dice3d-breakdown" id="dice3d-detail"></div>
                <div class="dice3d-status" id="dice3d-status"></div>
            `;
            container.appendChild(banner);
            document.body.appendChild(container);

            this._container = container;
            this._canvas = canvas;
            this._banner = banner;

            const w = window.innerWidth || 1280;
            const h = window.innerHeight || 720;
            this._renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
            this._renderer.setSize(w, h);
            this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

            this._scene = new THREE.Scene();
            this._camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
            this._camera.position.set(0, 0, 7.5);

            // Studio lighting
            const ambient = new THREE.AmbientLight(0xfff7ed, 1.4);
            this._scene.add(ambient);

            const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
            keyLight.position.set(4, 6, 8);
            this._scene.add(keyLight);

            const fillLight = new THREE.DirectionalLight(0xaaccff, 1.2);
            fillLight.position.set(-6, -3, 5);
            this._scene.add(fillLight);

            const rimLight = new THREE.PointLight(0xffd700, 2.5, 14);
            rimLight.position.set(0, 2.5, 3.0);
            this._scene.add(rimLight);
            this._rimLight = rimLight;

            // Build d20 with custom triangular UVs
            this._createD20Mesh();

            window.addEventListener('resize', () => {
                if (!this._renderer || !this._camera) return;
                const nw = window.innerWidth || 1280;
                const nh = window.innerHeight || 720;
                this._camera.aspect = nw / nh;
                this._camera.updateProjectionMatrix();
                this._renderer.setSize(nw, nh);
            });
        }

        _createFaceTexture(number, isGold = false, isCrimson = false) {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            const pTop = { x: 256, y: 45 };
            const pLeft = { x: 32, y: 450 };
            const pRight = { x: 480, y: 450 };

            // Fill background
            ctx.fillStyle = isGold ? '#533708' : isCrimson ? '#380808' : '#0a0d12';
            ctx.fillRect(0, 0, 512, 512);

            // Draw Triangle Facet Body
            ctx.beginPath();
            ctx.moveTo(pTop.x, pTop.y);
            ctx.lineTo(pRight.x, pRight.y);
            ctx.lineTo(pLeft.x, pLeft.y);
            ctx.closePath();

            const grad = ctx.createRadialGradient(256, 305, 20, 256, 305, 260);
            if (isGold) {
                grad.addColorStop(0, '#e5b84c');
                grad.addColorStop(0.65, '#9e731b');
                grad.addColorStop(1, '#4f3507');
            } else if (isCrimson) {
                grad.addColorStop(0, '#c62828');
                grad.addColorStop(0.65, '#7f1313');
                grad.addColorStop(1, '#3b0606');
            } else {
                grad.addColorStop(0, '#2e3846');
                grad.addColorStop(0.6, '#181e26');
                grad.addColorStop(1, '#090b0e');
            }
            ctx.fillStyle = grad;
            ctx.fill();

            // Heavy Gold/Filigree Outer Border
            ctx.strokeStyle = isGold ? '#ffe082' : isCrimson ? '#ff6666' : '#d4af37';
            ctx.lineWidth = 26;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Inner Fine Inlay
            ctx.beginPath();
            ctx.moveTo(256, 95);
            ctx.lineTo(435, 415);
            ctx.lineTo(77, 415);
            ctx.closePath();
            ctx.strokeStyle = isGold ? 'rgba(255, 240, 180, 0.8)' : isCrimson ? 'rgba(255, 150, 150, 0.8)' : 'rgba(212, 175, 55, 0.65)';
            ctx.lineWidth = 6;
            ctx.stroke();

            // Sized-down, elegant, ultra-crisp numeral in center of facet
            const numY = 305;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 155px "Montserrat", "Arial Black", "Trebuchet MS", sans-serif';

            // Thick deep black shadow/outline for extreme clarity
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 18;
            ctx.lineJoin = 'miter';
            ctx.miterLimit = 2;
            ctx.strokeText(String(number), 256, numY);

            // Crisp brilliant white numeral fill
            ctx.fillStyle = '#ffffff';
            ctx.fillText(String(number), 256, numY);

            // Underline bar for 6 & 9 so they are never confused
            if (number === 6 || number === 9) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(190, 385, 132, 18);
                ctx.fillStyle = isGold ? '#ffe082' : isCrimson ? '#ff6666' : '#ffd700';
                ctx.fillRect(194, 388, 124, 12);
            }

            const tex = new THREE.CanvasTexture(canvas);
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.needsUpdate = true;
            return tex;
        }

        _createD20Mesh() {
            const baseGeom = new THREE.IcosahedronGeometry(0.78, 0);
            const nonIndexed = baseGeom.toNonIndexed();
            nonIndexed.clearGroups();

            const pos = nonIndexed.attributes.position;
            const uvs = new Float32Array(20 * 3 * 2);
            this._faceNormals = [];
            this._faceUpVectors = [];
            this._faceRightVectors = [];
            this._faceQuats = [];

            for (let i = 0; i < 20; i++) {
                nonIndexed.addGroup(i * 3, 3, i);

                const i0 = i * 3;
                const vA = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
                const vB = new THREE.Vector3(pos.getX(i0 + 1), pos.getY(i0 + 1), pos.getZ(i0 + 1));
                const vC = new THREE.Vector3(pos.getX(i0 + 2), pos.getY(i0 + 2), pos.getZ(i0 + 2));

                const center = new THREE.Vector3().add(vA).add(vB).add(vC).divideScalar(3);
                const normal = new THREE.Vector3()
                    .crossVectors(vB.clone().sub(vA), vC.clone().sub(vA))
                    .normalize();
                
                if (normal.dot(center) < 0) {
                    normal.negate();
                }

                // Explicit local frame anchored directly to vertex A
                const uVec = vA.clone().sub(center).normalize();
                // Right handed frame: right x up must give the normal, or the
                // basis below is a reflection and the landed face comes out
                // skewed instead of square to the camera.
                const rVec = new THREE.Vector3().crossVectors(uVec, normal).normalize();

                this._faceNormals[i] = normal;
                this._faceUpVectors[i] = uVec;
                this._faceRightVectors[i] = rVec;

                // Determine which vertex is right vs left
                const dotB = vB.clone().sub(center).dot(rVec);
                let uvB, uvC;
                if (dotB > 0) {
                    uvB = [0.94, 0.12];
                    uvC = [0.06, 0.12];
                } else {
                    uvB = [0.06, 0.12];
                    uvC = [0.94, 0.12];
                }

                const uvMap = {
                    0: [0.5, 0.92],
                    1: uvB,
                    2: uvC
                };

                for (let k = 0; k < 3; k++) {
                    const uvIdx = (i0 + k) * 2;
                    const uv = uvMap[k];
                    uvs[uvIdx] = uv[0];
                    uvs[uvIdx + 1] = uv[1];
                }
            }

            nonIndexed.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

            const materials = [];
            for (let i = 1; i <= 20; i++) {
                const is20 = (i === 20);
                const is1 = (i === 1);
                const tex = this._createFaceTexture(i, is20, is1);
                materials.push(new THREE.MeshStandardMaterial({
                    map: tex,
                    roughness: is20 ? 0.15 : is1 ? 0.2 : 0.22,
                    metalness: is20 ? 0.85 : is1 ? 0.5 : 0.6,
                    color: 0xffffff
                }));
            }

            this._diceMesh = new THREE.Mesh(nonIndexed, materials);
            this._scene.add(this._diceMesh);
        }

        // The rotation that lays the given face flat against the camera, with
        // its numeral upright. Cached: the basis never changes once built.
        _faceQuaternion(targetNum) {
            const faceIdx = Math.max(0, Math.min(19, targetNum - 1));
            if (!this._faceQuats) this._faceQuats = [];
            if (this._faceQuats[faceIdx]) return this._faceQuats[faceIdx];

            const normal = this._faceNormals[faceIdx];
            const up = this._faceUpVectors[faceIdx];
            const right = this._faceRightVectors[faceIdx];
            if (!normal || !up || !right) return null;

            // Rotate mesh so face normal points to +Z, up points to +Y, right points to +X
            const rotMatrix = new THREE.Matrix4().makeBasis(right, up, normal);
            rotMatrix.transpose();
            const q = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
            this._faceQuats[faceIdx] = q;
            return q;
        }

        _orientFace(targetNum) {
            if (!this._diceMesh) return;
            const q = this._faceQuaternion(targetNum);
            if (q) this._diceMesh.quaternion.copy(q);
        }

        _playSE(name, volume = 90, pitch = 100) {
            if (typeof AudioManager !== 'undefined' && AudioManager.playSe) {
                AudioManager.playSe({ name, volume, pitch: Math.round(pitch), pan: 0 });
            } else if (typeof SoundManager !== 'undefined') {
                if (name === 'Ok') SoundManager.playOk?.();
                else if (name.includes('Buzzer')) SoundManager.playBuzzer?.();
            }
        }

        rollD20(options = {}) {
            const {
                dc = null,
                modifier = 0,
                statName = '',
                actionName = DT('check.default'),
                actor = null,
                forcedRoll = null
            } = options;

            const rawRoll = forcedRoll !== null ? forcedRoll : Math.floor(Math.random() * 20) + 1;
            const nat1 = (rawRoll === 1);
            const nat20 = (rawRoll === 20);
            const total = rawRoll + modifier;
            
            let success = false;
            if (nat20) {
                success = true;
            } else if (nat1) {
                success = false;
            } else if (dc !== null) {
                success = (total >= dc);
            } else {
                success = (rawRoll >= 10);
            }

            const resultData = {
                roll: rawRoll,
                modifier,
                total,
                dc,
                success,
                nat1,
                nat20,
                statName,
                actionName
            };

            const shouldShow3D = this._shouldShow3D(options);

            if (!shouldShow3D) {
                const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
                const statPart = statName ? ` (${statName})` : '';
                const dcStr = dc !== null ? DT('toast.versus', { dc }) : '';
                const outcomeStr = nat20 ? DT('outcome.critSuccess')
                    : nat1 ? DT('outcome.critFailure')
                    : success ? DT('outcome.success') : DT('outcome.failure');
                const toastMsg = DT('toast.line', {
                    action: actionName, roll: rawRoll, mod: modStr, stat: statPart,
                    total, versus: dcStr, outcome: outcomeStr
                });
                
                if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
                    window.ParchmentToast.show(toastMsg, {
                        severity: (nat20 || success) ? 'good' : 'danger',
                        duration: 200
                    });
                }
                if (nat20 || success) this._playSE('PixelUI/PixelUI (18)', 90, 100);
                else this._playSE('PixelUI/PixelUI (27)', 85, 90);
                return Promise.resolve(resultData);
            }

            if (typeof THREE === 'undefined' || typeof window === 'undefined' || !window.document) {
                return Promise.resolve(resultData);
            }

            // One die on screen at a time: a throw asked for while another is
            // still tumbling is queued behind it rather than stealing its
            // scene, its card and its frame loop half way through.
            const throwIt = () => this._throwD20(resultData, options);
            this._pendingRolls++;
            // Nothing in the air: the die leaves the hand now. Something in the
            // air: this one waits behind it, however that one ends.
            let roll;
            if (this._rollChain) {
                roll = this._rollChain.then(throwIt, throwIt);
            } else {
                try { roll = Promise.resolve(throwIt()); }
                catch (e) { roll = Promise.reject(e); }
            }
            const settle = () => {
                this._pendingRolls--;
                if (this._pendingRolls <= 0) this._rollChain = null;
            };
            roll.then(settle, settle);
            this._rollChain = roll.then(() => {}, () => {});
            return roll;
        }

        // The throw itself: the scene, the card and the frame loop. Only ever
        // entered through rollD20, which keeps the throws one behind another.
        _throwD20(resultData, options) {
            const { dc, modifier, statName, actionName, roll: rawRoll, total, nat1, nat20, success } = resultData;

            return new Promise((resolve) => {
                this._setupThree();
                if (!this._container) {
                    return resolve(resultData);
                }
                this._container.className = '';
                this._container.style.display = 'flex';
                this._banner.className = '';

                const titleEl = document.getElementById('dice3d-title');
                const numEl = document.getElementById('dice3d-num');
                const needEl = document.getElementById('dice3d-need');
                const rolledLabelEl = document.getElementById('dice3d-label-rolled');
                const needLabelEl = document.getElementById('dice3d-label-need');
                const statusEl = document.getElementById('dice3d-status');
                const detailEl = document.getElementById('dice3d-detail');

                const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
                const modClass = modifier < 0 ? 'mod neg' : 'mod';

                if (titleEl) titleEl.textContent = actionName.toUpperCase();
                if (rolledLabelEl) rolledLabelEl.textContent = DT('card.rolledLabel');
                if (needLabelEl) needLabelEl.textContent = DT('card.neededLabel');
                if (needEl) needEl.textContent = dc !== null ? String(dc) : DT('card.anyTarget');
                if (numEl) {
                    // Until the modifier is added in, the scoreboard shows the
                    // bare die: the player watches the number climb to the total.
                    numEl.textContent = String(rawRoll);
                    numEl.className = 'dice3d-score-num' + (nat20 ? ' crit-success' : nat1 ? ' crit-fail' : '');
                }
                if (statusEl) {
                    statusEl.className = 'dice3d-status';
                }
                if (detailEl) {
                    detailEl.innerHTML = modifier === 0
                        ? DT('card.breakdownFlat', { roll: rawRoll })
                        : DT('card.breakdown', {
                            roll: rawRoll,
                            mod: `<span class="${modClass}">${modStr}</span>`,
                            stat: statName || ''
                        });
                }

                const startX = (Math.random() > 0.5 ? 1 : -1) * (4.2 + Math.random() * 1.0);
                const startY = 2.8 + Math.random() * 1.0;
                const endX = (Math.random() - 0.5) * 0.25;
                const endY = 0.05;

                const startRotX = Math.random() * Math.PI * 6;
                const startRotY = Math.random() * Math.PI * 6;
                const startRotZ = Math.random() * Math.PI * 6;

                const startTime = performance.now();
                // A check thrown mid battle must not stall the turn: unless the
                // caller says otherwise, a die in battle keeps the quick pacing
                // and closes itself as soon as the total has been read.
                const inBattle = (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.inBattle && $gameParty.inBattle());
                const quick = options.quick !== undefined ? !!options.quick : !!inBattle;
                // Unhurried cinematic pacing by default; quick pacing auto-closes
                // fast once the total is read, for checks thrown mid-action (a
                // battle should not stall on a die once the number is known).
                const rollDuration = 1000;                   // 1.0s smooth tumble & landing
                const pauseBeforeSum = quick ? 260 : 650;    // raw roll assessment pause
                const holdDuration = quick ? 700 : 2200;     // display of calculated total & outcome
                const fadeDuration = quick ? 280 : 450;      // smooth dissolve exit
                const totalDuration = rollDuration + pauseBeforeSum + holdDuration + fadeDuration;

                if (this._rimLight) {
                    this._rimLight.color.setHex(nat20 ? 0xffd700 : nat1 ? 0xff2233 : 0xd4af37);
                }

                // Initial dice shake sound
                this._playSE('Casino/dice_shake_' + (Math.floor(Math.random() * 3) + 1), 85, 95 + Math.random() * 10);

                let midTumbled = false;
                let landed = false;
                let summed = false;
                let exiting = false;

                const animate = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(1, elapsed / rollDuration);

                    // Mid-roll dice tumble sound
                    if (!midTumbled && elapsed >= 320) {
                        midTumbled = true;
                        this._playSE('Casino/dice_throw_' + (Math.floor(Math.random() * 3) + 1), 95, 95 + Math.random() * 10);
                    }

                    // Gentle, smooth easing curve
                    const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
                    const p = easeOutQuart(progress);

                    if (progress < 1) {
                        this._diceMesh.position.x = startX + (endX - startX) * p;
                        this._diceMesh.position.y = startY + (endY - startY) * p + Math.sin(progress * Math.PI) * 0.8;
                        this._diceMesh.position.z = Math.sin(progress * Math.PI) * 1.5;

                        this._diceMesh.rotation.x = startRotX * (1 - progress);
                        this._diceMesh.rotation.y = startRotY * (1 - progress);
                        this._diceMesh.rotation.z = startRotZ * (1 - progress);
                        this._diceMesh.scale.setScalar(0.42 + progress * 0.16);
                        // The last stretch of the tumble eases straight into the
                        // landed face, so the die settles square instead of
                        // snapping to it on the frame it touches down.
                        if (progress > 0.6) {
                            const q = this._faceQuaternion(rawRoll);
                            if (q) {
                                const t = (progress - 0.6) / 0.4;
                                this._diceMesh.quaternion.slerp(q, t * t * (3 - 2 * t));
                            }
                        }
                    } else {
                        const activeHoldTime = elapsed - rollDuration;

                        // Check if we reached the smooth exit phase
                        if (activeHoldTime >= (pauseBeforeSum + holdDuration)) {
                            if (!exiting) {
                                exiting = true;
                                this._banner.className = '';
                                if (this._container) this._container.classList.add('fade-out');
                            }
                            const exitProgress = Math.min(1, (activeHoldTime - (pauseBeforeSum + holdDuration)) / fadeDuration);
                            this._diceMesh.position.y = endY + exitProgress * 0.35;
                            this._diceMesh.scale.setScalar(0.58 * (1 - exitProgress * 0.15));
                        } else {
                            this._diceMesh.position.set(endX, endY, 0);
                            this._diceMesh.scale.setScalar(0.58);
                        }

                        this._orientFace(rawRoll);

                        // Phase 1: Landing
                        if (!landed) {
                            landed = true;
                            this._banner.className = 'show' + (nat20 ? ' crit-success' : nat1 ? ' crit-fail' : '');

                            // Landing impact sound
                            this._playSE('Casino/dice_grab_' + (Math.floor(Math.random() * 2) + 1), 75, 105);
                        }

                        // Phase 2: Visual summing sequence after landing assessment pause
                        if (activeHoldTime >= pauseBeforeSum && !summed) {
                            summed = true;

                            if (numEl) {
                                numEl.textContent = String(total);
                                numEl.classList.add('summed');
                            }
                            if (statusEl) {
                                if (nat20) {
                                    statusEl.textContent = DT('outcome.critSuccess');
                                    statusEl.className = 'dice3d-status crit-success visible';
                                } else if (nat1) {
                                    statusEl.textContent = DT('outcome.critFailure');
                                    statusEl.className = 'dice3d-status crit-fail visible';
                                } else {
                                    statusEl.textContent = success ? DT('outcome.success') : DT('outcome.failure');
                                    statusEl.className = 'dice3d-status ' + (success ? 'success visible' : 'failure visible');
                                }
                            }

                            // Stat sum sound & outcome chime
                            this._playSE('Item3', 85, 115);
                            if (nat20) {
                                this._playSE('Bell3', 95, 120);
                            } else if (nat1) {
                                this._playSE('Down1', 90, 85);
                            } else if (success) {
                                this._playSE('PixelUI/PixelUI (18)', 90, 100);
                            } else {
                                this._playSE('PixelUI/PixelUI (27)', 85, 90);
                            }
                        }
                    }

                    this._renderer.render(this._scene, this._camera);

                    if (elapsed < totalDuration) {
                        this._animFrameId = requestAnimationFrame(animate);
                    } else {
                        setTimeout(() => {
                            this._container.style.display = 'none';
                            this._container.className = '';
                            resolve(resultData);
                        }, 50);
                    }
                };

                this._animFrameId = requestAnimationFrame(animate);
            });
        }

        // ==============================================================
        // THE OFFERED CHECK
        //
        //   A die thrown by an event is not a die thrown at somebody: the
        //   player is told what the roll is worth and what it has to reach,
        //   and decides whether to try it at all. The card below is that
        //   offer; rollD20 above is what happens once it is accepted.
        // ==============================================================

        // True from the moment a check is offered until its die has landed, so
        // the event that asked for it can stand still and wait (see the wait
        // mode registered at the bottom of this file).
        isBusy() {
            return !!this._checkRunning || this.isRolling();
        }

        // What an ability lends the roll, read the way every other d20 in the
        // game reads it: the D&D modifier of a bounded score.
        statModifier(battler, stat) {
            const paramId = STAT_PARAM[String(stat || '').toUpperCase()];
            if (!battler || paramId === undefined) return 0;
            if (typeof battler.abilityMod === 'function') return battler.abilityMod(paramId);
            const value = typeof battler.param === 'function' ? battler.param(paramId) : 10;
            return Math.floor(((value || 10) - 10) / 2);
        }

        // Whoever in the party has the best arm, or head, for this particular
        // check. A party of nobody rolls flat.
        bestRoller(stat) {
            if (typeof $gameParty === 'undefined' || !$gameParty) return null;
            const members = ($gameParty.members ? $gameParty.members() : []) || [];
            let best = null;
            let bestMod = -Infinity;
            for (const member of members) {
                const mod = this.statModifier(member, stat);
                if (mod > bestMod) { bestMod = mod; best = member; }
            }
            return best;
        }

        _escapeHtml(text) {
            return String(text === undefined || text === null ? '' : text)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // The card itself. Resolves true when the player takes the check on,
        // false when they walk away from it. Mouse and cursor both work, and
        // the cursor is what a gamepad drives, so the pad works too.
        _offerCheck(spec) {
            return new Promise((resolve) => {
                if (typeof document === 'undefined') return resolve(true);

                const choices = [{ key: 'try', text: DT('prompt.try') }];
                if (spec.allowCancel) choices.push({ key: 'cancel', text: DT('prompt.cancel') });

                const overlay = document.createElement('div');
                overlay.id = 'dice3d-prompt';
                overlay.innerHTML = `
                    <div class="dice3d-prompt-card">
                        <div class="dice3d-prompt-title">${this._escapeHtml(spec.title)}</div>
                        <div class="dice3d-prompt-who">${this._escapeHtml(spec.who)}</div>
                        <div class="dice3d-prompt-target">${this._escapeHtml(spec.target)}</div>
                        <div class="dice3d-prompt-formula">${this._escapeHtml(spec.formula)}</div>
                        <div class="dice3d-prompt-buttons">
                            ${choices.map((c, i) =>
                                `<button type="button" class="dice3d-prompt-btn" data-index="${i}">${this._escapeHtml(c.text)}</button>`
                            ).join('')}
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);
                requestAnimationFrame(() => overlay.classList.add('show'));

                const buttons = Array.from(overlay.querySelectorAll('.dice3d-prompt-btn'));
                let index = 0;
                let frame = null;
                let closed = false;

                const paint = () => buttons.forEach((btn, i) =>
                    btn.classList.toggle('selected', i === index));
                paint();

                const move = (delta) => {
                    if (choices.length < 2) return;
                    index = (index + delta + choices.length) % choices.length;
                    paint();
                    this._playSE('Cursor1', 70, 100);
                };

                const close = (key) => {
                    if (closed) return;
                    closed = true;
                    if (frame) cancelAnimationFrame(frame);
                    this._playSE(key === 'try' ? 'Ok' : 'Cancel1', 80, 100);
                    overlay.classList.remove('show');
                    setTimeout(() => {
                        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    }, 180);
                    // The keypress that answered the card must not also answer
                    // whatever the event does next.
                    if (typeof Input !== 'undefined' && Input.clear) Input.clear();
                    resolve(key === 'try');
                };

                buttons.forEach((btn, i) => {
                    btn.addEventListener('mouseenter', () => { index = i; paint(); });
                    btn.addEventListener('click', () => { index = i; close(choices[i].key); });
                });

                // The cursor is read from the engine's own input, so a keyboard
                // and a gamepad reach the card by the same road.
                const step = () => {
                    if (closed) return;
                    if (typeof Input !== 'undefined') {
                        if (Input.isTriggered('right') || Input.isTriggered('down')) move(1);
                        else if (Input.isTriggered('left') || Input.isTriggered('up')) move(-1);
                        else if (Input.isTriggered('ok')) return close(choices[index].key);
                        else if (Input.isTriggered('cancel') && spec.allowCancel) return close('cancel');
                    }
                    frame = requestAnimationFrame(step);
                };
                frame = requestAnimationFrame(step);
            });
        }

        /**
         * Offer a d20 check and, if it is taken on, throw it.
         *
         *   stat        one of STR/CON/INT/WIS/DEX/PSI, or NONE for a flat die
         *   dc          the number the roll plus the modifier has to reach
         *   battler     whose modifier is used; the party leader by default
         *   title       what the card and the die call it
         *   allowCancel whether walking away is offered at all
         *   prompt      false throws the die with no card at all
         *
         * Resolves with the roll result, plus `cancelled` when the player
         * walked away, in which case nothing was rolled and nothing happened.
         */
        async statCheck(options = {}) {
            const stat = String(options.stat || 'NONE').toUpperCase();
            const flat = !STAT_PARAM.hasOwnProperty(stat);
            const dc = Math.max(1, Math.round(Number(options.dc) || 10));
            const battler = options.battler !== undefined
                ? options.battler
                : (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.leader
                    ? $gameParty.leader() : null);
            const modifier = flat ? 0 : this.statModifier(battler, stat);
            const label = flat ? '' : statLabel(stat);
            const title = options.title || (flat ? DT('prompt.titleFlat') : DT('prompt.title', { stat: label }));
            const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

            this._checkRunning = true;
            try {
                if (options.prompt !== false) {
                    const accepted = await this._offerCheck({
                        title,
                        who: battler && battler.name ? DT('prompt.who', { name: battler.name() }) : '',
                        target: DT('prompt.target', { dc }),
                        formula: flat ? DT('prompt.formulaFlat') : DT('prompt.formula', { mod: modStr, stat: label }),
                        allowCancel: options.allowCancel !== false
                    });
                    if (!accepted) {
                        return { cancelled: true, success: false, roll: 0, modifier, total: 0, dc };
                    }
                }
                const result = await this.rollD20({
                    dc,
                    modifier,
                    statName: label,
                    actionName: title,
                    force3D: true
                });
                return Object.assign({ cancelled: false }, result);
            } finally {
                this._checkRunning = false;
            }
        }

        rollPercentage(chancePercent, options = {}) {
            const clamped = Math.max(5, Math.min(95, Math.round(chancePercent)));
            const dc = Math.max(2, Math.min(20, 21 - Math.round(clamped / 5)));
            return this.rollD20({
                ...options,
                dc,
                actionName: options.actionName || DT('check.percentage')
            });
        }
    }

    window.Dice3D = new Dice3DManager();

    // ==================================================================
    // THE EVENT-DRIVEN CHECK
    //
    //   An event asks for a check, the player takes it on or walks away, and
    //   the answer comes back as switches and variables the event can branch
    //   on. Nothing is set when the player walks away: an offer refused is not
    //   a failure, and an event that wants to treat it as one turns its own
    //   switch off before asking.
    // ==================================================================
    const toId = (value) => {
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : 0;
    };

    // One side of the result: a switch, a self switch of the event that asked,
    // a variable, or any mixture of the three.
    function applyBranch(branch, context) {
        const switchId = toId(branch.switchId);
        if (switchId && typeof $gameSwitches !== 'undefined') {
            $gameSwitches.setValue(switchId, true);
        }
        // "(none)" is what the editor shows for the empty option, and what it
        // hands back when the option carries no value of its own.
        const selfKey = String(branch.selfSwitch || '').trim().toUpperCase();
        const named = selfKey && selfKey !== '(NONE)';
        if (named && context.eventId && typeof $gameSelfSwitches !== 'undefined') {
            $gameSelfSwitches.setValue([context.mapId, context.eventId, selfKey], true);
        }
        const variableId = toId(branch.variableId);
        if (variableId && typeof $gameVariables !== 'undefined') {
            $gameVariables.setValue(variableId, Math.round(Number(branch.value) || 0));
        }
    }

    function resolveRoller(args, stat) {
        if (typeof $gameParty === 'undefined' || !$gameParty) return null;
        const who = String(args.who || 'leader');
        if (who === 'best') return window.Dice3D.bestRoller(stat);
        if (who === 'actor') {
            const actorId = toId(args.actorId);
            const actor = actorId && typeof $gameActors !== 'undefined' ? $gameActors.actor(actorId) : null;
            if (actor) return actor;
        }
        return $gameParty.leader ? $gameParty.leader() : null;
    }

    PluginManager.registerCommand(PLUGIN_NAME, 'StatCheck', function (args) {
        const context = {
            mapId: typeof $gameMap !== 'undefined' && $gameMap ? $gameMap.mapId() : 0,
            eventId: this.eventId ? this.eventId() : 0
        };
        const stat = String(args.stat || 'NONE').toUpperCase();

        window.Dice3D.statCheck({
            stat,
            dc: Number(args.dc),
            battler: resolveRoller(args, stat),
            title: String(args.label || '').trim() || null,
            allowCancel: String(args.allowCancel) !== 'false'
        }).then((result) => {
            if (!result || result.cancelled) return;
            const totalVariable = toId(args.totalVariable);
            if (totalVariable && typeof $gameVariables !== 'undefined') {
                $gameVariables.setValue(totalVariable, result.total);
            }
            applyBranch(result.success ? {
                switchId: args.successSwitch,
                selfSwitch: args.successSelfSwitch,
                variableId: args.successVariable,
                value: args.successValue
            } : {
                switchId: args.failSwitch,
                selfSwitch: args.failSelfSwitch,
                variableId: args.failVariable,
                value: args.failValue
            }, context);
        }).catch((e) => {
            console.error('Dice3D StatCheck: ' + e.message);   // i18n-ignore: developer diagnostic
        });

        this.setWaitMode('dice3dCheck');
    });

    // The event stands still while the card is up and the die is in the air.
    const _Game_Interpreter_updateWaitMode_Dice3D = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function () {
        if (this._waitMode === 'dice3dCheck') {
            if (window.Dice3D && window.Dice3D.isBusy()) return true;
            this._waitMode = '';
            return false;
        }
        return _Game_Interpreter_updateWaitMode_Dice3D.call(this);
    };

})();
