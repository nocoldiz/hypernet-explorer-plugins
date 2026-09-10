//=============================================================================
// 3D Battler System (Core)
// Version: 2.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Core for procedural/GLB 3D battlers. Hosts the scene, the shared
 * ProceduralBattler3D base class (part-losing engine) and the archetype registry.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler System v2.0.0 (Core)
 * ============================================================================
 *
 * This plugin replaces 2D battler sprites with 3D models during battle.
 *
 * v2.0 splits the old monolith into a CORE (this file) plus per-archetype
 * family plugins. The core owns:
 *   - the Three.js scene (Battle3DScene),
 *   - the GLB model loader (BattlerModel3D),
 *   - the shared procedural base class (window.Battler3D.Base /
 *     ProceduralBattler3D) which implements the goblin-derived part-losing
 *     (dismemberment cascade), hit-flash, skin generation and animation state
 *     machine that EVERY archetype reuses,
 *   - an archetype registry (window.Battler3D.registerArchetype) that family
 *     plugins call to add new body plans.
 *
 * Load order (plugins.js):
 *   3DBattlerSystem  (this core)  -> must load first
 *   3DBattler_Humanoid
 *   3DBattler_Flora
 *   3DBattler_Amorphous
 *   ... any future family plugins
 *
 * ============================================================================
 * Adding a new archetype (from a family plugin)
 * ============================================================================
 *
 *   class MyModel extends window.Battler3D.Base { ... }
 *   window.Battler3D.registerArchetype('myarchetype', {
 *       aliases: ['myarch', 'myname'],   // lowercase name tokens that match it
 *       scale:   2.5,                     // default scale when none on the note
 *       weapon:  0,                       // 0 = no weapon, n = fixed, undefined = random
 *       create:  (scale, offsetY, enemy, weaponType, key) =>
 *                    new MyModel(scale, offsetY, enemy, weaponType, key),
 *   });
 *
 * An enemy is matched to an archetype by its <Archetype: Name> note meta, or
 * by a keyword token in its name (matched against the registered aliases).
 *
 * ============================================================================
 * Three.js Setup
 * ============================================================================
 *
 * Requires Three.js + GLTFLoader to be loaded BEFORE this plugin, e.g. in
 * index.html:
 *   <script src="js/libs/three.min.js"></script>
 *   <script src="js/libs/GLTFLoader.js"></script>
 *
 * ============================================================================
 * GLB enemy note tags (BattlerModel3D path, unchanged from v1)
 * ============================================================================
 *   <3d_model: filename.glb>
 *   <3d_scale: 1.0>
 *   <3d_offset_y: 0>
 *
 * GLB animations (named exactly in the GLB):
 *   idle / attack / specialAttack / hit / death / spawn  (+ numbered variants)
 *
 * ============================================================================
 * What a battle costs, and what it does not
 * ============================================================================
 *
 * ONE WebGL context for the whole session (acquireBattleRenderer). A renderer
 * used to be built and thrown away per battle, so every fight paid again for a
 * fresh context, a fresh compile of every shader variant and a fresh upload of
 * every texture: that was most of what "loading the 3D enemies" meant. Kept
 * alive, three's program cache and the texture uploads survive between fights,
 * and the browser's live-context cap (the reason the old code handed the
 * context back) settles for good, since there is only ever one. Scenes are
 * still per battle; only the context is not.
 *
 * ONE pass, at ONE size. The canvas is sized by the perf knob (renderScale)
 * TIMES the retro downsample, and the scene is drawn straight into it; the
 * PIXI sprite scales it back up with nearest sampling. PSXShader.render's own
 * render-target-and-blit is not used here because it would only repeat that
 * reduction at the cost of a whole extra full-screen pass a frame, and it left
 * the canvas (and so the per-frame upload into the PIXI texture) at full size.
 * The vertex snapping and the colour banding are in the patched materials, not
 * in that pass, so the picture is the same.
 *
 * SOLID MATERIALS RENDER SOLID. Families build with `transparent: true` so the
 * death fade and the dismemberment fade can drive opacity later; armFadeOnDemand
 * puts the ones that are actually opaque back in the opaque queue and turns
 * `opacity` into an accessor that re-arms transparency the first time anything
 * drives it under 1. Nothing in a family has to change: a fade still just
 * writes `mat.opacity`. Do not read `mat.transparent` to mean "this is a body
 * material"; iterate the family's own `_materials` instead.
 *
 * ============================================================================
 *
 * @param actorModels
 * @text Actor 3D Models
 * @desc Configure 3D models for actors
 * @type struct<ActorModel>[]
 * @default []
 *
 * @param enableDebug
 * @text Enable Debug Mode
 * @desc Show console logs for debugging
 * @type boolean
 * @default true
 *
 * @param cameraDistance
 * @text Camera Distance
 * @desc Distance of camera from battlers
 * @type number
 * @decimals 1
 * @default 8
 *
 * @param cameraHeight
 * @text Camera Height
 * @desc Height of camera
 * @type number
 * @decimals 1
 * @default 2
 *
 * @param ambientLightColor
 * @text Ambient Light Color
 * @desc Ambient light color (hex)
 * @type string
 * @default #ffffff
 *
 * @param ambientLightIntensity
 * @text Ambient Light Intensity
 * @desc Intensity of ambient light
 * @type number
 * @decimals 2
 * @min 0
 * @max 2
 * @default 0.6
 *
 * @param directionalLightColor
 * @text Directional Light Color
 * @desc Directional light color (hex)
 * @type string
 * @default #ffffff
 *
 * @param directionalLightIntensity
 * @text Directional Light Intensity
 * @desc Intensity of directional light
 * @type number
 * @decimals 2
 * @min 0
 * @max 2
 * @default 0.8
 *
 * @param dayNightLighting
 * @text Day/Night Lighting
 * @desc Light the 3D battle from the in-game clock: colour, direction and sun height all follow the time of day.
 * @type boolean
 * @default true
 *
 * @param dayNightShadows
 * @text Cast Shadows
 * @desc Battlers cast a shadow on the ground, angled and coloured by the time of day. Costs one extra small pass.
 * @type boolean
 * @default false
 *
 * @param shadowMapSize
 * @text Shadow Resolution
 * @desc Shadow map size in pixels. 0 = auto (256 on a software/no-GPU renderer, 512 otherwise). Lower = faster, blockier.
 * @type number
 * @min 0
 * @max 2048
 * @default 0
 *
 * @param shadowUpdateEvery
 * @text Shadow Refresh Interval
 * @desc Redraw the shadow map every N drawn frames. Higher = cheaper. 1 = every frame.
 * @type number
 * @min 1
 * @max 10
 * @default 3
 *
 * @param envReflections
 * @text Sky Reflections
 * @desc Metal on battlers and weapons reflects the sky, tinted by the time of day. Rebuilt only when the light moves.
 * @type boolean
 * @default true
 *
 * @param renderScale
 * @text Render Scale
 * @desc Internal 3D resolution multiplier, multiplied by the retro downsample. 0 = auto (0.5 on a software/no-GPU renderer, 1 on a real GPU). Lower = faster, blockier.
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0
 *
 * @param maxFps
 * @text 3D Max FPS
 * @desc Cap how often the 3D layer redraws. Big win with no GPU. 0 = uncapped (follow game FPS).
 * @type number
 * @min 0
 * @max 60
 * @default 30
 *
 * @param antialias
 * @text Antialiasing
 * @desc MSAA smoothing. Very costly in software rendering; leave OFF for no-GPU machines.
 * @type boolean
 * @default false
 */

/*~struct~ActorModel:
 * @param actorId
 * @text Actor ID
 * @desc ID of the actor
 * @type actor
 * @default 1
 *
 * @param modelFile
 * @text Model Filename
 * @desc GLB filename (in img/3d/)
 * @type string
 * @default character.glb
 *
 * @param scale
 * @text Scale
 * @desc Scale of the model
 * @type number
 * @decimals 2
 * @min 0.1
 * @max 10
 * @default 1.0
 *
 * @param offsetY
 * @text Y Offset
 * @desc Vertical offset of the model
 * @type number
 * @decimals 0
 * @min -500
 * @max 500
 * @default 0
 */

(() => {
    'use strict';

    const pluginName = '3DBattlerSystem';
    const parameters = PluginManager.parameters(pluginName);

    const config = {
        actorModels: JSON.parse(parameters.actorModels || '[]').map(str => JSON.parse(str)),
        enableDebug: parameters.enableDebug === 'true',
        cameraDistance: Number(parameters.cameraDistance || 8),
        cameraHeight: Number(parameters.cameraHeight || 2),
        ambientLightColor: parameters.ambientLightColor || '#ffffff',
        ambientLightIntensity: Number(parameters.ambientLightIntensity || 0.6),
        directionalLightColor: parameters.directionalLightColor || '#ffffff',
        directionalLightIntensity: Number(parameters.directionalLightIntensity || 0.8),
        // Day/night rig. Every one of these is a perf knob as much as a look
        // knob, so they default to the cheap end of what still reads as lit.
        dayNightLighting: parameters.dayNightLighting !== 'false',
        dayNightShadows: parameters.dayNightShadows === 'true',
        shadowMapSize: Number(parameters.shadowMapSize || 0),
        shadowUpdateEvery: Math.max(1, Number(parameters.shadowUpdateEvery || 3)),
        envReflections: parameters.envReflections !== 'false',
        // Perf knobs for GPU-less / weak machines. renderScale 0 = auto-detect.
        renderScale: Number(parameters.renderScale || 0),
        maxFps: Number(parameters.maxFps !== undefined ? parameters.maxFps : 30),
        antialias: parameters.antialias === 'true'
    };

    // Detect a software / no-GPU WebGL backend (SwiftShader, llvmpipe, Mesa
    // softpipe, Microsoft Basic Render). These are fill-rate bound, so we halve
    // the internal render resolution for them by default.
    function detectSoftwareRenderer(renderer) {
        try {
            const gl = renderer.getContext();
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            if (!dbg) return false;
            const r = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
            return /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(r);
        } catch (e) { return false; }
    }

    // Debug logging (exposed so family plugins can share it)
    function debugLog(...args) {
        if (config.enableDebug) {
            console.log('[3D Battler]', ...args);
        }
    }

    // Check if Three.js is loaded
    if (typeof THREE === 'undefined') {
        console.error('[3D Battler] THREE.js is not loaded! Please add three.min.js to your project.');
        console.error('[3D Battler] Add this to index.html: <script src="js/libs/three.min.js"></script>');
        return;
    }

    if (typeof THREE.GLTFLoader === 'undefined') {
        console.error('[3D Battler] GLTFLoader is not loaded! Please add GLTFLoader.js to your project.');
        console.error('[3D Battler] Add this to index.html: <script src="js/libs/GLTFLoader.js"></script>');
        return;
    }

    // Polyfill THREE.CapsuleGeometry for older Three.js builds (the bundled
    // r128 predates it; it was added in r142). Many battler families build limbs
    // with `new THREE.CapsuleGeometry(...)`, so without this they throw
    // "THREE.CapsuleGeometry is not a constructor" and the model fails to load.
    // Implemented as a LatheGeometry of the capsule's half-outline (a cylinder of
    // `length` centred on the origin with a hemisphere of `radius` on each end),
    // which matches the real geometry's footprint and centring.
    if (typeof THREE.CapsuleGeometry === 'undefined') {
        THREE.CapsuleGeometry = function (radius = 1, length = 1, capSegments = 4, radialSegments = 8) {
            const r = radius, hl = length / 2;
            const cs = Math.max(1, capSegments | 0);
            const pts = [];
            for (let i = 0; i <= cs; i++) {           // bottom hemisphere: (0,-hl-r) -> (r,-hl)
                const a = -Math.PI / 2 + (Math.PI / 2) * (i / cs);
                pts.push(new THREE.Vector2(Math.cos(a) * r, -hl + Math.sin(a) * r));
            }
            for (let i = 0; i <= cs; i++) {           // top hemisphere: (r,hl) -> (0,hl+r)
                const a = (Math.PI / 2) * (i / cs);
                pts.push(new THREE.Vector2(Math.cos(a) * r, hl + Math.sin(a) * r));
            }
            return new THREE.LatheGeometry(pts, Math.max(3, radialSegments | 0));
        };
    }

    debugLog('Core plugin initialized successfully');

    //=============================================================================
    // Archetype registry
    //=============================================================================
    // Family plugins call window.Battler3D.registerArchetype(key, def). The core
    // resolves an enemy to a registered archetype by its <Archetype:> meta or by
    // a keyword token in its name (matched against the registered aliases).
    const ArchetypeRegistry = {};   // key (lowercase) -> def
    const AliasIndex = {};          // alias token -> key (lowercase)

    function registerArchetype(key, def) {
        const k = String(key).toLowerCase();
        def = def || {};
        ArchetypeRegistry[k] = def;
        AliasIndex[k] = k;
        (def.aliases || []).forEach(a => { AliasIndex[String(a).toLowerCase()] = k; });
        debugLog(`Registered archetype: ${k}`, def.aliases || []);
    }

    // Split a (possibly camelCase / concatenated) name into lowercase word tokens.
    // "BrawnyOgre" -> ["brawny","ogre"]; "OrcCaptain" -> ["orc","captain"].
    // Token matching avoids false positives like "Sorceress"/"Porcupine"/"Scorche".
    function creatureNameTokens(name) {
        return String(name || '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .toLowerCase()
            .split(/[^a-z]+/)
            .filter(Boolean);
    }

    // A forced-model note tag pins one enemy to a specific registered model,
    // overriding archetype/name detection. Every enemy now carries an explicit
    // <Model3D: key> tag (baked by scripts/bake_model_tags.js) that names the
    // exact model to render, so model choice is data-driven rather than inferred
    // from the name. Legacy aliases still honoured: <Battler3D:>, <3DModel:>,
    // <3d_archetype:>. Model3D wins so the baked value is authoritative.
    function resolveForced(meta) {
        if (!meta) return null;
        const tag = meta['Model3D'] || meta['Battler3D'] || meta['3DModel'] || meta['3d_archetype'];
        if (!tag) return null;
        const k = String(tag).trim().toLowerCase();
        // Prefer a DIRECT registered key over an alias: the tag names an exact
        // model, and some keys double as another model's keyword alias (e.g.
        // `enchantress` is also a witch alias), so an alias-first lookup would
        // mis-route the explicit tag.
        return (ArchetypeRegistry[k] ? k : null) || AliasIndex[k] || null;
    }

    // Exact full-name -> model key, for unique named enemies/bosses that have no
    // archetype keyword in their name (e.g. "The Surgeon", "Lilith the Corruptor").
    const NamedIndex = {};
    function registerNamed(name, key) {
        if (!name || !key) return;
        NamedIndex[String(name).trim().toLowerCase()] = String(key).toLowerCase();
    }

    // Match an archetype from a meta object + name (shared by both resolvers).
    // Priority: forced tag -> exact unique name -> <Archetype:> meta -> name tokens.
    function resolveFromData(meta, name) {
        const forced = resolveForced(meta);
        if (forced) return forced;
        const nm = name ? String(name).trim().toLowerCase() : '';
        if (nm && NamedIndex[nm] && ArchetypeRegistry[NamedIndex[nm]]) return NamedIndex[nm];
        const arche = (meta && meta['Archetype']) ? String(meta['Archetype']).trim().toLowerCase() : '';
        if (arche && AliasIndex[arche]) return AliasIndex[arche];
        const tokens = creatureNameTokens(name);
        // Longer alias tokens win first (e.g. "hobgoblin" before "goblin").
        for (const tok of tokens.slice().sort((a, b) => b.length - a.length)) {
            if (AliasIndex[tok]) return AliasIndex[tok];
        }
        return null;
    }

    // Resolve which registered procedural archetype (if any) an enemy renders as.
    // Priority: forced <Battler3D:> tag, then <Archetype:> meta, then name tokens.
    function resolveArchetype(enemy) {
        if (!enemy || !enemy.enemy) return null;
        const ed = enemy.enemy();
        return resolveFromData(ed.meta || {}, ed.name);
    }

    // ── One fight's forced body ─────────────────────────────────────────────
    // A battle can be told what its enemies look like regardless of what the
    // troop holds, as { archetype, tint }: the archetype names a registered
    // procedural model every enemy of that fight is built as, and the tint is a
    // colour their whole body is pulled towards. The zombie apocalypse is what
    // it was written for (NPCSystem walks the party into one of the dead and
    // the fight is against a green procedural body, not against whatever
    // battler the generic person troop carries), and it is cleared at the top
    // of BattleManager.setup below so no later fight can inherit it.
    function battleOverride() {
        const o = (typeof $gameTemp !== 'undefined' && $gameTemp) ? $gameTemp._battler3DOverride : null;
        return (o && typeof o === 'object') ? o : null;
    }

    // The archetype key one enemy of THIS fight renders as: the override's, if
    // this battle has one and it names a model that is actually registered.
    function battleArchetype(enemy) {
        const o = battleOverride();
        if (o && o.archetype) {
            const k = String(o.archetype).toLowerCase();
            if (ArchetypeRegistry[k]) return k;
        }
        return resolveArchetype(enemy);
    }

    // Pull every material of a built model towards one colour. Mutated in
    // place rather than cloned: a procedural body builds its own materials per
    // instance, and the part-loss flashes, the death fade and the spawn fade
    // all hold references to exactly these, so replacing them would leave that
    // bookkeeping pointing at materials nothing renders.
    const OVERRIDE_TINT_STRENGTH = 0.55;
    function applyModelTint(root, tint) {
        if (!root || typeof root.traverse !== 'function' || typeof THREE === 'undefined') return;
        const target = new THREE.Color(tint);
        root.traverse(obj => {
            const mat = obj.material;
            if (!mat) return;
            const list = Array.isArray(mat) ? mat : [mat];
            for (const m of list) {
                if (m && m.color && m.color.lerp) m.color.lerp(target, OVERRIDE_TINT_STRENGTH);
                if (m && m.emissive && m.emissive.lerp) m.emissive.lerp(target, OVERRIDE_TINT_STRENGTH * 0.5);
            }
        });
    }

    //=============================================================================
    // BattlerModel3D - Manages an individual GLB model (unchanged from v1)
    //=============================================================================

    class BattlerModel3D {
        constructor(filename, scale, offsetY) {
            this.filename = filename;
            this.scale = scale || 1.0;
            this.offsetY = offsetY || 0;
            this.model = null;
            this.mixer = null;
            this.animations = {};
            this.currentAnimation = null;
            this.selectedIdleAnim = null; // Store the selected idle animation
            this.loaded = false;
            // Hit-stop state (mirrors ProceduralBattler3D): freezes the mixer
            // briefly on impact for fighting-game weight.
            this._hitStop = 0;
            debugLog(`Creating BattlerModel3D: ${filename}, scale: ${scale}, offset: ${offsetY}`);
        }

        // Freeze the animation on impact + hold an impact squash, scaled by the
        // hit (0..~1.5), so the stop is evident. Mirrors ProceduralBattler3D.
        triggerHitStop(intensity) {
            const i = Math.max(0, Math.min(1.5, intensity || 0));
            if (i <= 0) return;
            const dur = 0.14 + i * 0.26;
            this._hitStop = Math.max(this._hitStop || 0, dur);
            this._hitStopMax = this._hitStop;
            this._hitStopI = i;
            if (this.model && !this._hitStopBaseScale) {
                this._hitStopBaseScale = this.model.scale.clone();
            }
        }

        _applyHitStopSquash() {
            if (!this.model || !this._hitStopBaseScale) return;
            const b = this._hitStopBaseScale;
            if (this._hitStop > 0) {
                const k = Math.max(0, this._hitStop / (this._hitStopMax || 1));
                const s = 0.22 * (this._hitStopI || 0) * k;
                this.model.scale.set(b.x * (1 + s), b.y * (1 - s), b.z * (1 + s));
            } else {
                this.model.scale.copy(b);
                this._hitStopBaseScale = null;
            }
        }

        async load() {
            return new Promise((resolve, reject) => {
                const loader = new THREE.GLTFLoader();
                const path = `img/3d/${this.filename}`;

                debugLog(`Loading model from: ${path}`);

                loader.load(
                    path,
                    (gltf) => {
                        debugLog(`Model loaded successfully: ${this.filename}`);
                        this.model = gltf.scene;
                        this.model.scale.set(this.scale, this.scale, this.scale);

                        // Setup animations
                        if (gltf.animations && gltf.animations.length > 0) {
                            this.mixer = new THREE.AnimationMixer(this.model);

                            debugLog(`Found ${gltf.animations.length} animations:`, gltf.animations.map(a => a.name));

                            gltf.animations.forEach(clip => {
                                this.animations[clip.name.toLowerCase()] = clip;
                            });
                        } else {
                            debugLog(`No animations found in model: ${this.filename}`);
                        }

                        this.loaded = true;
                        resolve(this);
                    },
                    (progress) => {
                        debugLog(`Loading progress: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
                    },
                    (error) => {
                        console.error(`Failed to load 3D model: ${path}`, error);
                        reject(error);
                    }
                );
            });
        }

        playAnimation(animName, loop = true, onComplete = null) {
            // Death is terminal: the battle hooks re-fire 'death' every frame
            // while the enemy is dead; restarting the clip each frame would
            // churn allocations and keep the death animation at frame 0.
            if (this._deathPlayed) return false;
            if (!this.mixer) {
                debugLog(`No mixer available for animation: ${animName}`);
                return false;
            }

            // Check for variations (attack, attack2, attack3, etc.)
            const availableVariations = this.getAnimationVariations(animName);

            if (availableVariations.length === 0) {
                debugLog(`Animation not found: ${animName}. Available:`, Object.keys(this.animations));
                return false;
            }

            // Pick a random variation
            const selectedAnim = availableVariations[Math.floor(Math.random() * availableVariations.length)];
            debugLog(`Selected animation variation: ${selectedAnim} from ${availableVariations.length} options`);

            if (this.currentAnimation) {
                this.currentAnimation.fadeOut(0.2);
            }

            const clip = this.animations[selectedAnim];
            const action = this.mixer.clipAction(clip);

            action.reset();
            action.fadeIn(0.2);
            action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);

            if (!loop) {
                action.clampWhenFinished = true;
            }

            if (onComplete) {
                const listener = (e) => {
                    if (e.action === action) {
                        this.mixer.removeEventListener('finished', listener);
                        onComplete();
                    }
                };
                this.mixer.addEventListener('finished', listener);
            }

            action.play();
            this.currentAnimation = action;
            if (animName.toLowerCase() === 'death') this._deathPlayed = true;
            debugLog(`Playing animation: ${selectedAnim}`);
            return true;
        }

        getAnimationVariations(baseName) {
            // The clip set is fixed after load, so variation lists are cached
            // (this is called from per-frame battle hooks).
            const lowerBaseName = baseName.toLowerCase();
            const cache = this._animVariations || (this._animVariations = {});
            if (cache[lowerBaseName]) return cache[lowerBaseName];

            const variations = [];

            // Check for base animation (e.g., "attack")
            if (this.animations[lowerBaseName]) {
                variations.push(lowerBaseName);
            }

            // Check for numbered variations (e.g., "attack2", "attack3", etc.)
            for (let i = 2; i <= 20; i++) {
                const varName = lowerBaseName + i;
                if (this.animations[varName]) {
                    variations.push(varName);
                }
            }

            cache[lowerBaseName] = variations;
            return variations;
        }

        selectIdleAnimation() {
            // Select idle animation once and store it
            if (!this.selectedIdleAnim) {
                const idleVariations = this.getAnimationVariations('idle');
                if (idleVariations.length > 0) {
                    this.selectedIdleAnim = idleVariations[Math.floor(Math.random() * idleVariations.length)];
                    debugLog(`Selected idle animation: ${this.selectedIdleAnim} from ${idleVariations.length} options`);
                } else {
                    this.selectedIdleAnim = null;
                }
            }
            return this.selectedIdleAnim;
        }

        playIdleAnimation() {
            const idleAnim = this.selectIdleAnimation();
            if (idleAnim && this.animations[idleAnim]) {
                if (this.currentAnimation) {
                    this.currentAnimation.fadeOut(0.2);
                }

                const clip = this.animations[idleAnim];
                const action = this.mixer.clipAction(clip);

                action.reset();
                action.fadeIn(0.2);
                action.setLoop(THREE.LoopRepeat);
                action.play();
                this.currentAnimation = action;
                debugLog(`Playing idle animation: ${idleAnim}`);
                return true;
            }
            return false;
        }

        update(deltaTime) {
            // Hit-stop: hold the current frame (skip the mixer) + held squash.
            // Skipped while dying so the death fade is never stalled.
            if (this._hitStop > 0 && !this._deathFading) {
                this._hitStop -= deltaTime;
                this._applyHitStopSquash();
                return;
            }
            if (this._hitStopBaseScale) this._applyHitStopSquash();
            if (this.mixer) {
                this.mixer.update(deltaTime);
            }
            // Slain: fade the whole model off. Works whether or not the GLB has
            // a 'death' clip, so a killed GLB battler always vanishes instead of
            // freezing in place.
            if (this._deathFading) this.applyDeathFade(deltaTime);
        }

        // ── Death fade ───────────────────────────────────────────────────────
        // Once the battler is slain, drive every material's opacity to 0 over
        // DEATH_FADE_TIME then hide the model. Mirrors
        // ProceduralBattler3D.applyDeathFade so GLB-backed battlers (which have
        // no procedural fade) still fade off on death - whether killed by HP
        // loss or a lethal hit to a vital body part. Idempotent: startDeathFade
        // is safe to call every frame from the death hooks.
        startDeathFade() {
            if (this._deathFading) return;
            this._deathFading = true;
            this._deathFadeT = 0;
        }

        applyDeathFade(deltaTime) {
            if (!this._deathMats) {
                this._deathMats = [];
                if (this.model) this.model.traverse(o => {
                    if (!o.material) return;
                    const arr = Array.isArray(o.material) ? o.material : [o.material];
                    for (const m of arr) { m.transparent = true; this._deathMats.push(m); }
                });
            }
            this._deathFadeT = (this._deathFadeT || 0) + deltaTime;
            const p = Math.min(1, this._deathFadeT / DEATH_FADE_TIME);
            for (const m of this._deathMats) m.opacity = Math.min(m.opacity, 1 - p);
            if (p >= 1 && this.model) this.model.visible = false;
        }

        hasAnimation(animName) {
            return this.getAnimationVariations(animName).length > 0;
        }
    }

    //=============================================================================
    // ProceduralBattler3D - shared base for ALL procedural archetypes
    //=============================================================================
    // Owns the goblin-derived part-losing engine and supporting infrastructure
    // that every body plan reuses:
    //   - seeded RNG + procedural skin texture generation
    //   - the simple animation state machine (idle/attack/specialattack/hit/
    //     death/spawn) used to drive the procedural FK poses
    //   - hit-flash (emissive red fade) keyed by body-part -> mesh map
    //   - dismemberment cascade: hides mesh chains when battler._bodyParts[KEY]
    //     .destroyed flips, driven by a declarative rule list
    //
    // Subclasses (HumanoidBattler3D, FloraBattler3D, ...) build the geometry in
    // load(), populate this._partMeshMap / this._cascadeRules, and implement
    // animatePose(dt) (and optionally deathPose(dt) / onCascade(parts)).
    // Bosses add a palette of distinct magic/skill casts (cast/beam/summon/slam/
    // roar) plus the universal spawn/death so a boss never replays one gesture.
    // Locomotion loops (walk / run / fly / swim). Unlike the action anims these
    // never auto-return to idle (no ONESHOT_DURATION entry); they play until the
    // gait is changed. Used by the overworld consumers (CamperDrivingSystem /
    // DreamSystem) to animate roaming 3D battlers. Every family inherits them for
    // free via the base's _applyLocomotionMotion overlay, so no per-family work.
    const LOCO_STATES = ['walk', 'run', 'fly', 'swim'];
    const ANIM_STATES = ['idle', 'attack', 'specialattack', 'hit', 'death', 'spawn', 'cast', 'beam', 'summon', 'slam', 'roar'].concat(LOCO_STATES);
    // Magic-flavoured skill anims a boss cycles through (digit-stripped base names).
    const BOSS_MAGIC_ANIMS = ['specialattack', 'cast', 'beam', 'summon'];
    const BOSS_PHYS_ANIMS = ['attack', 'slam', 'roar'];
    // One-shot animations and how long they play before snapping back to idle.
    const ONESHOT_DURATION = { hit: 0.25, attack: 0.65, specialattack: 0.95, spawn: 1.0, cast: 1.1, beam: 0.95, summon: 1.25, slam: 0.85, roar: 1.05 };
    // A destroyed body part flashes red then fades away over this long; a slain
    // enemy freezes its pose and fades the whole model off over this long.
    const PART_DESTROY_TIME = 0.5;
    // How long a hit-flash takes to ease back to the body's own colour.
    const HIT_FLASH_TIME = 0.45;
    // The body part a party member has NAMED - the limb an aim is on, or the one
    // a grapple is being planned against - breathes yellow while the choice is
    // being made, so the plan is read off the monster and not off the menu. How
    // far toward yellow the part goes at the bottom and the top of that breath,
    // and how fast it breathes (radians a second).
    const AIM_HIGHLIGHT_MIN = 0.30;
    const AIM_HIGHLIGHT_MAX = 0.85;
    const AIM_HIGHLIGHT_PULSE = 4.5;
    const DEATH_FADE_TIME = 1.1;
    // A biped that has lost BOTH legs cannot stand: its model topples to the
    // ground over this long, and is lifted by this much (in local units, i.e.
    // scaled by the model scale) so the flattened body rests ON the ground
    // instead of half inside it. See _updateProne / _applyProne.
    const PRONE_FALL_TIME = 0.7;
    const PRONE_LIFT = 0.30;

    // Perf caches: skin textures are shared across same-profile/colour models
    // (keyed by texture file + quantised HSL) so we don't regenerate a 64x64
    // noise canvas per battler, and detail images are decoded once.
    const _SKIN_TEX_CACHE = new Map();
    const _DETAIL_IMG_CACHE = new Map();

    class ProceduralBattler3D {
        constructor(scale, offsetY, battler, profile, weaponType, creatureType) {
            this.scale = scale || 1.0;
            this.offsetY = offsetY || 0;
            this.battler = battler;
            this.creatureType = creatureType || null;
            this.profile = profile || {};
            this.weaponType = (weaponType !== undefined && weaponType !== null) ? weaponType : 0;

            this.model = null;
            this.bodyGroup = new THREE.Group();
            this.loaded = false;
            this.currentAnimation = 'idle';
            this.animTime = 0;
            this.onAnimationComplete = null;
            this.physicsWorld = null;

            // Part-losing engine state (populated by subclasses in load()).
            this._partMeshMap = {};   // body-part KEY -> mesh (for hit-flash)
            this._cascadeRules = [];  // [{ gone:[KEYS], hide:[meshes] }]
            this._flashMeshes = [];
            // The named-part highlight: which key is lit, and the mesh and its
            // untouched colours while it is (see updateAimHighlight).
            this._aimHl = null;
            this._aimHlKey = null;
            this._aimHlTime = 0;
            // Dismembered parts flash red then fade out (instead of vanishing).
            this._destroyFades = [];   // [{ obj, mats, t }]
            this._destroyStarted = new Set();
            this._deathMats = null;    // lazily-collected materials for the death fade

            // Hit-stop: on impact the pose freezes for a brief window (scaled by
            // the size of the hit) like a fighting game, giving blows weight.
            this._hitStop = 0;

            // Prone (biped families only): 0 = standing, 1 = flat on the ground
            // after losing both legs. See _updateProne / _applyProne.
            this._proneT = 0;
            this._proneBaseY = null;
            this._baseX = null;
            this._baseY = null;

            // Two seeded RNG streams:
            //   idRand  - keyed to the MONSTER ID only, so every enemy id of an
            //             archetype gets its own consistent body shape / texture /
            //             colour (two different goblins look different).
            //   rand    - keyed to id + battle index, for fine per-instance noise
            //             so identical-id clones are not pixel-perfect copies.
            let eid = 1, idx = 0, hasEnemy = false;
            if (this.battler) {
                if (typeof this.battler.enemyId === 'function') { eid = this.battler.enemyId() || 1; hasEnemy = true; }
                else if (typeof this.battler.actorId === 'function') eid = 1000 + (this.battler.actorId() || 0);
                if (typeof this.battler.index === 'function') idx = this.battler.index() || 0;
            } else {
                eid = 1 + Math.floor(Math.random() * 9999); // decorative previews vary freely
            }
            // Fold the originating battle event into the identity so the SAME
            // enemy event always looks identical when re-fought, while the same
            // enemy id at a different event/coords looks slightly different.
            // The troop index keeps multiple same-id enemies in one fight
            // distinct (and is stable across re-battles for a fixed troop).
            const origin = (hasEnemy && window.Battler3D && window.Battler3D._battleOriginSeed)
                ? (window.Battler3D._battleOriginSeed >>> 0) : 0;
            const mix = (a, b) => (((a >>> 0) ^ Math.imul((((b >>> 0) + 0x9e3779b9) | 0), 2654435761)) >>> 0);
            const seed01 = (n) => {
                const x = Math.sin(((n >>> 0) % 1000003) * 0.000379 + 1.13) * 43758.5453;
                const f = x - Math.floor(x);
                return f > 0.0001 ? f : 0.123;
            };
            // World / generation seed hash (0 for the canonical default "esoteric").
            // Folded into the SPECIES identity below so a different world seed
            // re-rolls a species' skin texture, colour AND baseline proportions.
            // In battle this is the fight's own randomised roll, everywhere
            // else the world seed (see Battler3D.lookSeedHash).
            const gseed = (window.Battler3D && window.Battler3D.lookSeedHash)
                ? window.Battler3D.lookSeedHash()
                : ((window.Battler3D && window.Battler3D.genSeedHash) ? window.Battler3D.genSeedHash() : 0);

            // Species identity: keyed to the enemy id + world seed ONLY (NOT the
            // battle event / troop index), so EVERY instance of a species under a
            // given world seed shares the SAME skin texture and colour. Equals the
            // previous per-id seed for the no-event case, so "esoteric" + the
            // bestiary / title / viewer previews stay pixel-identical.
            let sm = mix(mix(0, eid), 1);
            if (gseed) sm = mix(sm, gseed);
            this._idRngState = seed01(sm);                  // texture / colour / baseline shape
            this._rngState   = seed01(mix(sm, 0x55555555)); // fine grain (also species-stable)
            // The raw species identity, kept so a family can hash its OWN stable
            // per-species choice (the humanoid picks a mouth shape off it) without
            // drawing from idRand and shifting every draw made after it.
            this._speciesSeed = sm >>> 0;

            // Separate per-INSTANCE stream (event origin + troop index) used ONLY
            // to jitter body proportions very slightly between instances of the
            // same species; textures and colours are left untouched. Null for the
            // canonical (no-event) preview so bestiary/title art is unchanged.
            this._propJitter = (origin || idx)
                ? (() => { let js = seed01(mix(mix(sm, origin), idx + 1));
                           return () => { js = Math.abs(Math.sin(js * 9301 + 0.49297)); return js; }; })()
                : null;

            const p = this.profile;

            // ── Per-ID body-shape variation ──────────────────────────────────
            // sizeMul scales the whole creature; shapeXYZ stretches it non-
            // uniformly (taller/shorter, wider/leaner) for the physics-free
            // families; bulkMul/headMul drive the humanoid's radial knobs (which
            // are physics-safe, unlike non-uniform model scaling).
            this.sizeMul = 0.86 + this.idRand() * 0.30;        // ~0.86 .. 1.16
            this.shapeXYZ = {
                x: 0.86 + this.idRand() * 0.30,                // width
                y: 0.90 + this.idRand() * 0.26,                // height
                z: 0.86 + this.idRand() * 0.30                 // depth
            };
            this.bulkMul = 0.84 + this.idRand() * 0.36;        // ~0.84 .. 1.20
            this.headMul = 0.86 + this.idRand() * 0.30;
            // A non-default world seed changes a species' BUILD GREATLY (squat vs
            // lanky, big/small head), scaling the baseline draws above. Derived
            // from the species+seed identity (sm); skipped for "esoteric".
            if (gseed) {
                const sr = (k) => { const x = Math.sin((sm >>> 0) * 0.000761 + k * 3.1123) * 24634.6345; return x - Math.floor(x); };
                this.sizeMul    *= 0.78 + sr(1) * 0.55;   // ~0.78 .. 1.33
                this.shapeXYZ.x *= 0.82 + sr(2) * 0.42;   // ~0.82 .. 1.24
                this.shapeXYZ.y *= 0.82 + sr(3) * 0.42;
                this.shapeXYZ.z *= 0.82 + sr(4) * 0.42;
                this.bulkMul    *= 0.80 + sr(5) * 0.48;
                this.headMul    *= 0.78 + sr(6) * 0.55;
            }
            // Very slight per-instance body-proportion jitter (+/-6%) around the
            // species baseline (colour + skin get their own slight per-instance
            // variation below). Skipped for the canonical preview (propJitter null).
            if (this._propJitter) {
                const J = 0.06, jr = this._propJitter;
                this.sizeMul    *= 1 + (jr() * 2 - 1) * J;
                this.shapeXYZ.x *= 1 + (jr() * 2 - 1) * J;
                this.shapeXYZ.y *= 1 + (jr() * 2 - 1) * J;
                this.shapeXYZ.z *= 1 + (jr() * 2 - 1) * J;
                this.bulkMul    *= 1 + (jr() * 2 - 1) * J;
                this.headMul    *= 1 + (jr() * 2 - 1) * J;
            }
            // Global trim so battlers sit a touch smaller on the field. (Title /
            // bestiary previews reframe by bounding box, so they are unaffected.)
            this.scale = (scale || 1.0) * this.sizeMul * 0.85;

            // Facing: non-bipedal creatures read better at a slight 3/4 angle
            // (facing screen-left) rather than staring straight at the camera.
            // Bipedal/humanoid models override this to 0 (front-on). Applied as a
            // yaw on a wrapper group when the model is added to the battle scene.
            this.facingYaw = -0.5;

            // Per-ID skin colour from the profile's HSL ranges.
            let hue = (p.hue ? p.hue[0] + this.idRand() * p.hue[1] : this.idRand());
            let sat = (p.sat ? p.sat[0] + this.idRand() * p.sat[1] : 0.5);
            let lit = (p.lit ? p.lit[0] + this.idRand() * p.lit[1] : 0.4);
            // A non-default world seed recolours each species strongly: the
            // profile hue ranges are often deliberately narrow, so on their own a
            // new seed barely shifts the palette. Rotate the hue across the FULL
            // wheel and nudge saturation/lightness, derived from the species+seed
            // identity (sm) so it is stable per species per seed. Skipped for the
            // default "esoteric" seed (gseed 0), keeping the baseline palette.
            if (gseed) {
                const hr = (k) => { const x = Math.sin((sm >>> 0) * 0.000913 + k * 2.399963) * 43758.5453; return x - Math.floor(x); };
                hue = (hue + hr(1)) % 1;
                sat = Math.max(0.12, Math.min(1, sat + (hr(2) - 0.5) * 0.55));
                lit = Math.max(0.16, Math.min(0.86, lit + (hr(3) - 0.5) * 0.38));
            }
            // Slight per-instance colour variation so instances of the SAME species
            // under the SAME seed differ a little. It also crosses the skin-texture
            // cache's quantised-HSL key, so the baked texture varies slightly too.
            // None for the canonical preview (this._propJitter null).
            if (this._propJitter) {
                const jr = this._propJitter;
                hue = (hue + (jr() - 0.5) * 0.06 + 1) % 1;
                sat = Math.max(0.10, Math.min(1, sat + (jr() - 0.5) * 0.12));
                lit = Math.max(0.14, Math.min(0.90, lit + (jr() - 0.5) * 0.10));
            }
            this.color = new THREE.Color().setHSL(hue, sat, lit);

            // Per-ID texture pick from a themed pool (falls back to profile.texture).
            this.skinTextureFile = this._pickTexture(p);
            // Skin noise seed: per-INSTANCE when this is a live instance (so the
            // texture grain varies slightly between same-species instances), else
            // the species-stable value for the canonical preview.
            this.skinSeed = (this._propJitter ? this._propJitter() : this.rand()) * 1000;
            this.posture = p.slouch || 0;
        }

        // ── Seeded RNG (id + instance) ───────────────────────────────────────
        rand() {
            this._rngState = Math.abs(Math.sin(this._rngState * 10000));
            return this._rngState;
        }

        // ── Seeded RNG (monster id only) ─────────────────────────────────────
        idRand() {
            this._idRngState = Math.abs(Math.sin(this._idRngState * 9301 + 0.49297));
            return this._idRngState;
        }

        // Pick a texture for this monster id from the profile's pool. Profiles can
        // supply `textures: [...]` directly or a `texturePool` name resolved from
        // window.Battler3D.TEXTURE_POOLS; otherwise the single `texture` is used.
        _pickTexture(p) {
            const POOLS = window.Battler3D.TEXTURE_POOLS || {};
            let pool = null;
            if (Array.isArray(p.textures) && p.textures.length) pool = p.textures;
            else if (p.texturePool && POOLS[p.texturePool]) pool = POOLS[p.texturePool];
            else if (p.texture) return p.texture;
            // Fallback so every archetype still gets an id-varied surface.
            if (!pool || !pool.length) pool = POOLS.all || null;
            if (pool && pool.length) return pool[Math.floor(this.idRand() * pool.length)];
            return p.texture || null;
        }

        // Lazily build and cache the per-id skin CanvasTexture so multiple body
        // materials can share one texture object.
        skinTex() {
            if (!this._skinTextureObj) this._skinTextureObj = this.buildSkinTexture(this.skinTextureFile);
            return this._skinTextureObj;
        }

        // Apply the per-id skin texture as the colour map of a material (keeps
        // the material's own colour tint). Returns the material for chaining.
        applySkin(mat) {
            if (mat) { mat.map = this.skinTex(); mat.needsUpdate = true; }
            return mat;
        }

        // ── Shared draconic-family geometry helpers ──────────────────────────
        // A tapered cylinder strut linking two points, used to bridge chained
        // ball/segment bodies (necks, tails, spines) into a continuous silhouette
        // instead of a loose row of floating spheres.
        addStrut(parent, mat, p0, p1, r0, r1, radialSegments) {
            const a = (p0 instanceof THREE.Vector3) ? p0 : new THREE.Vector3(p0.x, p0.y, p0.z);
            const b = (p1 instanceof THREE.Vector3) ? p1 : new THREE.Vector3(p1.x, p1.y, p1.z);
            const dir = new THREE.Vector3().subVectors(b, a);
            const len = dir.length();
            if (len < 1e-4 || !parent) return null;
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.01, r1), Math.max(0.01, r0), len, radialSegments || 6), mat);
            cyl.position.copy(a).lerp(b, 0.5);
            cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
            parent.add(cyl);
            return cyl;
        }

        // A darker, opaque clone of a membrane material for wing/rib bone struts,
        // cached per source material so repeat calls reuse the same instance.
        _wingBoneMat(mat) {
            if (!this._wingBoneCache) this._wingBoneCache = new Map();
            let bone = this._wingBoneCache.get(mat);
            if (!bone) {
                bone = mat.clone();
                bone.color.multiplyScalar(0.5);
                bone.transparent = false; bone.opacity = 1.0;
                bone.emissiveIntensity = 0;
                this._wingBoneCache.set(mat, bone);
            }
            return bone;
        }

        // A batlike dragon wing: an arm bone from the shoulder to a "knuckle",
        // several finger struts fanning out from there, and a scalloped membrane
        // (a triangle fan with the trailing edge between fingers pulled back
        // toward the knuckle) so the wing reads as webbed skin stretched over
        // bones rather than one solid flat sail. Kept to the same call shape as
        // the old flat-cone `_wing(mat, side, x, y, z)` so every caller across
        // the draconic families can swap in unchanged: `x,y,z` is the shoulder
        // attachment point on the body, `side` is -1 (left) or 1 (right).
        buildDragonWing(mat, side, x, y, z, opts) {
            opts = opts || {};
            const g = new THREE.Group();
            const fingers = opts.fingers || 4;
            const span = opts.span !== undefined ? opts.span : 1.5;
            const angMin = opts.angMin !== undefined ? opts.angMin : 0.55;
            const angMax = opts.angMax !== undefined ? opts.angMax : 1.55;
            const droop = opts.droop !== undefined ? opts.droop : 0.22;
            const boneMat = this._wingBoneMat(mat);

            const armLen = span * 0.32;
            this.addStrut(g, boneMat, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, armLen, 0.02), 0.065, 0.045);
            const knuckle = new THREE.Vector3(0, armLen, 0.02);

            const tips = [];
            for (let i = 0; i < fingers; i++) {
                const t = fingers > 1 ? i / (fingers - 1) : 0;
                const ang = angMin + (angMax - angMin) * t;
                const len = span * (1.0 - t * 0.32);
                const tip = new THREE.Vector3(0, len, 0);
                tip.applyAxisAngle(new THREE.Vector3(0, 0, 1), side * ang);
                tip.add(knuckle);
                tips.push(tip);
                this.addStrut(g, boneMat, knuckle, tip, 0.035, 0.02);
            }

            const shoulder = new THREE.Vector3(0, 0, 0);
            const verts = [];
            const pushTri = (a, b, c) => { verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
            pushTri(shoulder, knuckle, tips[0]);
            for (let i = 0; i < tips.length - 1; i++) {
                pushTri(shoulder, tips[i], tips[i + 1]);
                const scallop = tips[i].clone().lerp(tips[i + 1], 0.5).lerp(knuckle, droop);
                pushTri(tips[i], scallop, tips[i + 1]);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            geo.computeVertexNormals();
            const membrane = new THREE.Mesh(geo, mat);
            g.add(membrane);

            g.position.set(x, y, z); g._side = side; g._wingTips = tips;
            this.bodyGroup.add(g);
            if (this._wings) this._wings.push(g);
            return g;
        }

        // Apply this.scale plus the per-id non-uniform body proportions to the
        // model. Used by the physics-free families (humanoid keeps uniform scale
        // so its ragdoll stays aligned). The model is always at full size: every
        // family's animatePose still passes a 0..1 `growth` for the spawn window,
        // but growing a whole troop from nothing every fight used to write a new
        // scale vector on every battler every frame for the first second of every
        // battle. It is read as a fade now instead (see _applySpawnFade), which
        // is both the cheaper op (a handful of `opacity` writes, armed for the
        // fast opaque path the same way the death fade already is) and a plainer
        // entrance than a body inflating from a point.
        applyModelScale(growth = 1) {
            if (!this.model) return;
            if (this._fitClamp === undefined) this._computeFitClamp();
            const s = this.scale * this._fitClamp, sh = this._shapeProportions();
            this.model.scale.set(s * sh.x, s * sh.y, s * sh.z);
            if (growth < 1) this._applySpawnFade(growth);
            else if (this._spawnFadeMats) this._clearSpawnFade();
        }

        // Lazily cache every material once (mirrors applyDeathFade's own cache)
        // then just write `opacity` on that flat list each frame while the spawn
        // fade is running. armModelFades already armed each material's opacity
        // accessor at add-time, so this never forces the transparent/blended
        // render path except for the short window it is actually fading.
        _applySpawnFade(growth) {
            if (!this.model) return;
            if (!this._spawnFadeMats) {
                this._spawnFadeMats = [];
                this.model.traverse(o => {
                    if (!o.material) return;
                    const arr = Array.isArray(o.material) ? o.material : [o.material];
                    for (const m of arr) this._spawnFadeMats.push(m);
                });
            }
            const op = growth < 0 ? 0 : growth;
            for (const m of this._spawnFadeMats) m.opacity = op;
        }

        _clearSpawnFade() {
            for (const m of this._spawnFadeMats) m.opacity = 1;
            this._spawnFadeMats = null;
        }

        // The non-uniform body proportions, kept readable. Several independent
        // rolls multiply into shapeXYZ (per-id variation, the world seed's build
        // shift, per-instance jitter, and a family's own tweaks on top), and
        // stacked worst cases used to reach a 2:1 axis ratio, i.e. a creature
        // rendered visibly squashed or stretched rather than differently built.
        // The spread is compressed here (never a hard cut, so the direction of a
        // build survives) until the longest axis is at most MAX_ANISO times the
        // shortest, about the volume the raw rolls already implied.
        _shapeProportions() {
            const sh = this.shapeXYZ;
            const c = this._shapeFitCache;
            if (c && c.x === sh.x && c.y === sh.y && c.z === sh.z) return c.out;
            const MAX_ANISO = 1.28;
            const x = Math.max(sh.x, 1e-4), y = Math.max(sh.y, 1e-4), z = Math.max(sh.z, 1e-4);
            const g = Math.cbrt(x * y * z);
            let out = { x: x, y: y, z: z };
            const r = Math.max(x, y, z) / Math.min(x, y, z);
            if (r > MAX_ANISO) {
                const e = Math.log(MAX_ANISO) / Math.log(r);
                out = {
                    x: g * Math.pow(x / g, e),
                    y: g * Math.pow(y / g, e),
                    z: g * Math.pow(z / g, e)
                };
            }
            this._shapeFitCache = { x: sh.x, y: sh.y, z: sh.z, out: out };
            return out;
        }

        // Clamp (computed once) so a model can never render larger than the battle
        // view and spill off-screen. Measures the model's world bounding box at
        // full nominal scale and derives a uniform shrink factor if it exceeds the
        // visible envelope (the camera frames roughly +/-3.3 world units tall about
        // y=1, feet sitting at y~-1.5). Never enlarges (factor capped at 1).
        _computeFitClamp() {
            this._fitClamp = 1;
            if (!this.model || typeof THREE.Box3 === 'undefined') return;
            const sh = this._shapeProportions(), s = this.scale;
            this.model.scale.set(s * sh.x, s * sh.y, s * sh.z); // full scale, no growth/clamp
            this.model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(this.model);
            if (box.isEmpty()) return;
            const size = new THREE.Vector3();
            box.getSize(size);
            const MAX_H = 5.0, MAX_W = 8.5; // world units that comfortably fit the view
            this._fitClamp = Math.min(1, MAX_H / Math.max(size.y, 1e-3), MAX_W / Math.max(size.x, 1e-3));
        }

        // ── Procedural skin texture (tint + optional photo overlay) ──────────
        // Builds a 128x128 CanvasTexture from the per-creature colour, optionally
        // compositing a real surface image from img/textures for grain/relief.
        buildSkinTexture(textureFile) {
            const hsl = {}; this.color.getHSL(hsl);

            // Share one texture across models with the same texture + similar
            // colour (quantised) so we don't regenerate noise per battler.
            const key = (textureFile || '') + '|' +
                (hsl.h * 24 | 0) + '|' + (hsl.s * 12 | 0) + '|' + (hsl.l * 12 | 0);
            const cached = _SKIN_TEX_CACHE.get(key);
            if (cached) return cached;

            const SZ = 64; // quarter the pixels of the old 128x128
            const canvas = document.createElement('canvas');
            canvas.width = SZ; canvas.height = SZ;
            const ctx = canvas.getContext('2d');
            const imgData = ctx.createImageData(SZ, SZ);
            const data = imgData.data;
            const seed = this.skinSeed;
            const tmp = new THREE.Color();                 // reused (no per-pixel alloc)
            const noise = (window.ProcGenUtils && window.ProcGenUtils.fbmNoise) || null;
            for (let y = 0; y < SZ; y++) {
                for (let x = 0; x < SZ; x++) {
                    const n = noise ? noise(x * 0.2, y * 0.2, seed, 3) : 0; // 3 octaves
                    let l = hsl.l + n * 0.2;
                    l = l < 0 ? 0 : (l > 1 ? 1 : l);
                    tmp.setHSL(hsl.h, hsl.s, l);
                    const idx = (y * SZ + x) * 4;
                    data[idx] = tmp.r * 255; data[idx + 1] = tmp.g * 255; data[idx + 2] = tmp.b * 255; data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            const tex = new THREE.CanvasTexture(canvas);
            _SKIN_TEX_CACHE.set(key, tex);

            if (textureFile) {
                const apply = (img) => {
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.globalAlpha = 0.85;
                    ctx.drawImage(img, 0, 0, SZ, SZ);
                    ctx.globalAlpha = 1.0;
                    ctx.globalCompositeOperation = 'source-over';
                    tex.needsUpdate = true;
                };
                let img = _DETAIL_IMG_CACHE.get(textureFile);
                if (img && img.complete && img.naturalWidth) {
                    apply(img);
                } else {
                    if (!img) {
                        img = new Image();
                        img.src = 'img/textures/' + textureFile;
                        _DETAIL_IMG_CACHE.set(textureFile, img);
                    }
                    img.addEventListener('load', () => apply(img), { once: true });
                    img.addEventListener('error', () => debugLog(`Skin texture not found: ${textureFile}`), { once: true });
                }
            }
            return tex;
        }

        // ── Animation state machine (procedural) ─────────────────────────────
        playAnimation(animName, loop = true, onComplete = null) {
            // Death is terminal: once slain, ignore further state changes so the
            // death fade's timer advances monotonically (the battle hooks re-fire
            // 'death' every frame while the enemy is dead). Checked before the
            // string normalisation so the per-frame re-fires cost nothing.
            if (this.currentAnimation === 'death') return false;
            animName = animName.toLowerCase().replace(/[0-9]/g, '');
            if (ANIM_STATES.includes(animName)) {
                this.currentAnimation = animName;
                this.animTime = 0;
                this.onAnimationComplete = onComplete;
                return true;
            }
            return false;
        }

        playIdleAnimation() {
            this.playAnimation('idle');
            return true;
        }

        hasAnimation(animName) {
            animName = animName.toLowerCase().replace(/[0-9]/g, '');
            return ANIM_STATES.includes(animName);
        }

        // ── Standing still vs actually travelling ────────────────────────────
        // True only while a locomotion loop plays, i.e. the model is really
        // crossing the overworld rather than holding its ground in a battle.
        isLocomoting() {
            return LOCO_STATES.includes(this.currentAnimation);
        }

        // Multiplier a family applies to its own leg-swing gait: a full stride
        // while walking the world or lunging on an attack, none while the model
        // is just standing there. Quadrupeds used to walk on the spot for the
        // whole battle; now they plant their feet and only breathe.
        strideMul(fast) {
            return (fast || this.isLocomoting()) ? 1 : 0;
        }

        // ── Locomotion (walk / run / fly / swim) ─────────────────────────────
        // Start a looping gait. Falls back to a walk for any unknown value.
        playGait(gait) {
            gait = String(gait || 'walk').toLowerCase();
            if (gait === 'idle') return this.playIdleAnimation();
            if (!LOCO_STATES.includes(gait)) gait = 'walk';
            return this.playAnimation(gait);
        }

        // Feed the enemy's <Speed: 0-6> tag so the gait cadence (stride/flap/wag
        // frequency) matches how fast the creature is meant to move. Idempotent.
        setGaitSpeed(speedTag) {
            const s = Math.max(0, Math.min(6, Number(speedTag)));
            this._gaitSpeedMul = 0.6 + (isNaN(s) ? 3 : s) * 0.16;   // ~0.6 .. 1.56
        }

        // Lazily nest every built mesh under a private "locomotion group" the base
        // owns exclusively, so the gait bob/lean/undulation composes on top of the
        // family's own idle pose AND is fully independent of whatever the consumer
        // does to this.model (world placement, facing yaw, scale). Created once,
        // after load(), so it captures the family's finished geometry.
        _ensureLocoGroup() {
            if (this._locoGroup) return this._locoGroup;
            if (!this.bodyGroup || typeof THREE === 'undefined') return null;
            const g = new THREE.Group();
            const kids = this.bodyGroup.children.slice();
            for (const k of kids) g.add(k);
            this.bodyGroup.add(g);
            this._locoGroup = g;
            return g;
        }

        // Whole-body locomotion overlay, layered on top of the family idle pose.
        // Local units (translations auto-scale with the model's ancestors;
        // rotations are scale-invariant), driven by animTime and the gait cadence.
        _applyLocomotionMotion() {
            const g = this._ensureLocoGroup();
            if (!g) return;
            const t = this.animTime, spd = this._gaitSpeedMul || 1;
            let py = 0, rx = 0, ry = 0, rz = 0;
            switch (this.currentAnimation) {
                case 'walk': {
                    const f = 5.0 * spd;
                    py = Math.abs(Math.sin(t * f)) * 0.14;          // stride bounce
                    rx = Math.sin(t * f) * 0.05;                    // fore/aft rock
                    rz = Math.sin(t * f * 0.5) * 0.045;             // gentle sway
                    break;
                }
                case 'run': {
                    const f = 8.0 * spd;
                    py = Math.abs(Math.sin(t * f)) * 0.30;          // big bound
                    rx = 0.13 + Math.sin(t * f) * 0.07;            // forward lean + bounce
                    rz = Math.sin(t * f * 0.5) * 0.075;
                    break;
                }
                case 'fly': {
                    const f = 2.2 * spd;
                    py = Math.sin(t * f) * 0.40;                    // hover
                    rz = Math.sin(t * f * 0.7) * 0.10;             // bank
                    rx = -0.06 + Math.sin(t * f * 1.3) * 0.035;    // nose up + flutter
                    break;
                }
                case 'swim': {
                    const f = 3.0 * spd;
                    ry = Math.sin(t * f) * 0.16;                    // fishtail yaw
                    rz = Math.sin(t * f + 1.0) * 0.12;             // roll
                    py = Math.sin(t * f * 0.6) * 0.18;             // slow undulation
                    rx = Math.sin(t * f * 0.5) * 0.05;
                    break;
                }
                default: return;
            }
            g.position.y = py;
            g.rotation.set(rx, ry, rz);
            // Walk / run also swing the model's own limbs (fly / swim stay whole-body).
            if (this.currentAnimation === 'walk') this._animateGaitLimbs(false);
            else if (this.currentAnimation === 'run') this._animateGaitLimbs(true);
            else if (this._gaitLimbsActive) this._releaseGaitLimbs();
        }

        // Gather this model's own limb meshes from _partMeshMap (legs / arms /
        // tail) plus a per-MODEL gait signature (cadence, amplitude, phase, skew)
        // derived from its species seed. Because every bespoke model exposes a
        // different set of parts AND gets its own signature, each one walks/runs
        // distinctly. Legless models (slimes, orbs) just keep the body bounce.
        _ensureGaitLimbs() {
            if (this._gaitLimbs) return this._gaitLimbs;
            const legs = [], arms = [], tails = [];
            const map = this._partMeshMap || {};
            for (const key in map) {
                const mesh = map[key];
                if (!mesh || !mesh.isObject3D) continue;
                if (/LEG/.test(key)) legs.push(mesh);
                else if (/ARM|APPENDAGE|PINCER|CLAW/.test(key)) arms.push(mesh);
                else if (/TAIL/.test(key)) tails.push(mesh);
            }
            const cap = (arr) => arr.map(m => ({ mesh: m, baseX: m.rotation.x, baseY: m.rotation.y }));
            // Stable per-model signature (does NOT advance the idRand stream).
            const s = this._idRngState || 1;
            const r = (k) => { const x = Math.sin(s * 9301 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
            this._gaitLimbs = {
                legs: cap(legs), arms: cap(arms), tails: cap(tails),
                freqMul: 0.85 + r(1) * 0.5,       // cadence
                legAmp:  0.30 + r(2) * 0.24,      // stride length
                armAmp:  0.16 + r(3) * 0.30,      // arm swing
                tailAmp: 0.08 + r(4) * 0.24,      // tail sway
                phase:   r(5) * Math.PI * 2,      // start phase
                skew:    (r(6) - 0.5) * 0.35      // gait asymmetry
            };
            return this._gaitLimbs;
        }

        // Swing legs (alternating), counter-swing arms, and sway the tail around
        // each limb's captured neutral pose. Assigns absolute rotations (no drift)
        // so it cleanly overrides the family idle pose while the gait plays.
        _animateGaitLimbs(isRun) {
            const L = this._ensureGaitLimbs();
            const t = this.animTime, spd = this._gaitSpeedMul || 1;
            const ph = t * (isRun ? 8.0 : 5.0) * spd * L.freqMul + L.phase;
            const ampL = L.legAmp * (isRun ? 1.7 : 1);
            const ampA = L.armAmp * (isRun ? 1.6 : 1);
            for (let i = 0; i < L.legs.length; i++) {
                const e = L.legs[i], dir = (i % 2 === 0) ? 1 : -1;
                e.mesh.rotation.x = e.baseX + Math.sin(ph + (dir < 0 ? Math.PI : 0)) * ampL + L.skew * dir * 0.15;
            }
            for (let i = 0; i < L.arms.length; i++) {
                const e = L.arms[i], dir = (i % 2 === 0) ? 1 : -1;
                e.mesh.rotation.x = e.baseX + Math.sin(ph + (dir < 0 ? 0 : Math.PI)) * ampA;   // opposite the same-side leg
            }
            for (const e of L.tails) e.mesh.rotation.y = e.baseY + Math.sin(ph * 0.5) * L.tailAmp;
            this._gaitLimbsActive = true;
        }

        // Restore limbs to their captured neutral pose when a gait ends.
        _releaseGaitLimbs() {
            const L = this._gaitLimbs;
            if (L) {
                for (const e of L.legs)  e.mesh.rotation.x = e.baseX;
                for (const e of L.arms)  e.mesh.rotation.x = e.baseX;
                for (const e of L.tails) e.mesh.rotation.y = e.baseY;
            }
            this._gaitLimbsActive = false;
        }

        // ── Hit-flash ────────────────────────────────────────────────────────
        flashBodyPart(partKey) {
            if (!partKey) return;
            let mesh = this._partMeshMap[partKey];
            // If the specific part key isn't mapped, fall back to the first visible
            // mesh in the part map so every 3D model still flashes red on hit even
            // when its archetype uses different part keys than the health system.
            if (!mesh || !mesh.visible || !mesh.material) {
                for (const k in this._partMeshMap) {
                    const m = this._partMeshMap[k];
                    if (m && m.visible && m.material) { mesh = m; break; }
                }
            }
            if (!mesh || !mesh.visible) return;
            // A part is very often a GROUP (a whole leg, a head with its ears
            // and teeth) rather than one mesh: every quadruped family maps its
            // limbs that way. A group has no material of its own, so the flash
            // used to fall through here and nothing lit up when a beast was
            // hit. Flash every material under it instead, and hand each back.
            let mats;
            if (mesh.material) mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            else {
                mats = [];
                const seen = new Set();
                mesh.traverse(o => {
                    if (!o.isMesh || !o.material) return;
                    for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) {
                        if (mt && mt.color && !seen.has(mt)) { seen.add(mt); mats.push(mt); }
                    }
                });
                if (!mats.length) return;
            }
            // A highlighted part is currently painted yellow, and that yellow is
            // not the body's colour: take the real one off the highlight, or the
            // flash would restore the part lit even after the aim moved on.
            const lit = (this._aimHl && this._aimHl.mesh === mesh) ? this._aimHl : null;
            const origColors = mats.map((m, i) => lit
                ? (lit.origColors[i] ? lit.origColors[i].clone() : null)
                : (m.color ? m.color.clone() : null));
            const existing = this._flashMeshes.find(f => f.mesh === mesh);
            if (existing) {
                existing.timer = HIT_FLASH_TIME; // restart if hit again before fade finishes
            } else {
                this._flashMeshes.push({ mesh, mats, origColors, timer: HIT_FLASH_TIME });
            }
        }

        updateFlash(deltaTime) {
            for (let i = this._flashMeshes.length - 1; i >= 0; i--) {
                const f = this._flashMeshes[i];
                f.timer -= deltaTime;
                if (f.timer <= 0) {
                    // Restore original colors on all materials.
                    for (let j = 0; j < f.mats.length; j++) {
                        const m = f.mats[j];
                        if (m && m.color && f.origColors[j]) {
                            m.color.copy(f.origColors[j]);
                        }
                    }
                    this._flashMeshes.splice(i, 1);
                } else {
                    const k = Math.min(1, f.timer / HIT_FLASH_TIME); // 1 -> 0 over the flash
                    // Blend the material's OWN colour toward red by however much
                    // of the flash is left. Driving it to (k,0,0) instead, as this
                    // used to, meant the flash did not ease back to the body: it
                    // faded through to black and then snapped back on the frame
                    // the timer expired. Works on every material type, including
                    // MeshBasicMaterial, which has no emissive to use instead.
                    for (let j = 0; j < f.mats.length; j++) {
                        const m = f.mats[j];
                        if (!m || !m.color) continue;
                        const o = f.origColors[j];
                        if (o) m.color.setRGB(o.r + (1 - o.r) * k, o.g * (1 - k), o.b * (1 - k));
                        else m.color.setRGB(k, 0, 0);
                    }
                }
            }
        }

        // ── Named-part highlight ─────────────────────────────────
        // Driven entirely off the battler (`_aimHighlightPart`, set by the Aim
        // and Wrestle menus in Health_Monsters.js), so nothing has to reach into
        // the scene to move the light: the menu writes a part key onto the
        // monster and the model picks it up on its next frame. Only a part the
        // model actually maps is lit - lighting a fallback limb would say the
        // aim is somewhere it is not.
        updateAimHighlight(deltaTime) {
            const key = (this.battler && this.battler._aimHighlightPart) || null;
            if (key !== this._aimHlKey) {
                this._settleAimHighlight();
                this._aimHlKey = key;
                if (key) this._captureAimHighlight(key);
            }
            const lit = this._aimHl;
            if (!lit) return;
            this._aimHlTime += deltaTime;
            // A hit owns the mesh for as long as it flashes: a blow landing has
            // to read as a blow landing. The highlight waits it out and takes the
            // colour back on the frame after the flash restores it.
            if (this._flashMeshes.some(f => f.mesh === lit.mesh)) return;
            const k = AIM_HIGHLIGHT_MIN + (AIM_HIGHLIGHT_MAX - AIM_HIGHLIGHT_MIN) *
                (0.5 + 0.5 * Math.sin(this._aimHlTime * AIM_HIGHLIGHT_PULSE));
            for (let i = 0; i < lit.mats.length; i++) {
                const m = lit.mats[i], o = lit.origColors[i];
                if (!m || !m.color || !o) continue;
                // Toward (1,1,0): red and green up to full, blue driven out.
                m.color.setRGB(o.r + (1 - o.r) * k, o.g + (1 - o.g) * k, o.b * (1 - k));
            }
        }

        // The mesh a health-system part key names on THIS model. Exact key first;
        // failing that, the mapped key that shares the most words with it, so a
        // family calling its limb ARM_LEFT still lights up for a LEFT_ARM aim.
        // Nothing shared means nothing lit: a fallback limb (which is what the
        // hit-flash does) would say the blow is going somewhere it is not.
        _resolveAimMesh(key) {
            const map = this._partMeshMap || {};
            if (map[key]) return map[key];
            const upper = String(key).toUpperCase();
            const words = upper.split(/[^A-Z0-9]+/).filter(Boolean);
            let best = null, bestScore = 0;
            for (const k in map) {
                if (!map[k]) continue;
                const other = String(k).toUpperCase();
                if (other === upper) return map[k];
                const otherWords = other.split(/[^A-Z0-9]+/).filter(Boolean);
                let score = 0;
                for (const w of words) if (otherWords.indexOf(w) >= 0) score++;
                if (score > bestScore) { bestScore = score; best = map[k]; }
            }
            return bestScore > 0 ? best : null;
        }

        _captureAimHighlight(key) {
            const mesh = this._resolveAimMesh(key);
            if (!mesh || !mesh.visible || !mesh.material) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            // A live flash is already holding this mesh's real colours; take them
            // from it rather than from the red it is painted at this instant.
            const flash = this._flashMeshes.find(f => f.mesh === mesh);
            const origColors = mats.map((m, i) => (flash && flash.origColors[i])
                ? flash.origColors[i].clone()
                : (m.color ? m.color.clone() : null));
            this._aimHl = { mesh, mats, origColors };
            this._aimHlTime = 0;
        }

        // Put the lit part back to its own colour and drop the highlight. With a
        // `root`, only when the lit mesh is inside it (a part about to be severed
        // out from under the light).
        _settleAimHighlight(root) {
            const lit = this._aimHl;
            if (!lit) return;
            if (root) {
                let inside = false;
                root.traverse(o => { if (o === lit.mesh) inside = true; });
                if (!inside) return;
            }
            for (let i = 0; i < lit.mats.length; i++) {
                const m = lit.mats[i], o = lit.origColors[i];
                if (m && m.color && o) m.color.copy(o);
            }
            this._aimHl = null;
            this._aimHlKey = null;
        }

        // ── Dismemberment cascade ────────────────────────────────────────────
        // When any of a rule's body-part keys is gone, the matching mesh chains
        // flash red and fade out (rather than vanishing instantly). Rules use
        // union semantics (parent-first ordering reproduces the goblin's
        // if/else-if chain hiding without explicit branching).
        applyCascade(parts) {
            if (!parts) return;
            this._ensureCascadeMeta();
            // Part loss only moves when something is severed (or grown back), but
            // this used to walk every rule of every model on every frame of every
            // fight, re-deciding the same answer. Hash which parts are gone (the
            // map is a couple of dozen entries and the loop is one property read
            // each) and step over the whole rule set while that has not changed.
            let sig = 0, i = 0;
            for (const k in parts) {
                i++;
                if (parts[k] && parts[k].destroyed) sig = (sig * 31 + i) | 0;
            }
            if (sig === this._cascadeSig) return;
            this._cascadeSig = sig;
            const gone = (k) => parts[k] && parts[k].destroyed;
            for (const rule of this._cascadeRules) {
                if (rule._wholeBody) continue; // root parts must never blank the whole model
                if (rule.gone.some(gone)) {
                    for (const m of rule.hide) { if (m) this._startPartDestroy(m); }
                }
            }
        }

        // ── Blood on a broken part ───────────────────────────────────────────
        // A part that was broken rather than cut stays on the model, so the only
        // sign of it is the wound itself: the part's own materials are cloned
        // (never the shared originals) and stained toward this battler's blood
        // colour, which BloodSplatterFX reads off the enemy's archetype notes.
        _bloodColor() {
            const b = this.battler;
            if (b && typeof b.getBloodColor === 'function') {
                try { return b.getBloodColor(); } catch (e) { /* fall through */ }
            }
            return '#8a0303';
        }

        applyPartBlood(parts) {
            if (!parts || !this._partMeshMap) return;
            // Same cheap signature trick applyCascade uses: nothing is repainted
            // while the set of bloodied parts has not moved.
            let sig = 0, i = 0;
            for (const k in parts) {
                i++;
                const p = parts[k];
                if (p && !p.destroyed && (p.broken || p.ruined || p.currentHp <= 0)) {
                    sig = (sig * 31 + i) | 0;
                }
            }
            if (sig === this._bloodSig) return;
            this._bloodSig = sig;
            if (!this._bloodied) this._bloodied = new Set();
            const THREE = window.THREE;
            if (!THREE) return;
            const blood = new THREE.Color(this._bloodColor());
            for (const key in parts) {
                const p = parts[key];
                if (!p || p.destroyed) continue;
                if (!(p.broken || p.ruined || p.currentHp <= 0)) continue;
                const mesh = this._partMeshMap[key];
                if (!mesh || this._bloodied.has(mesh)) continue;
                this._bloodied.add(mesh);
                this._settleFlash(mesh);
                this._settleAimHighlight(mesh);
                mesh.traverse(o => {
                    if (!o.material) return;
                    const src = Array.isArray(o.material) ? o.material : [o.material];
                    const stained = src.map(m => {
                        const c = m.clone();
                        if (c.color) c.color.lerp(blood, 0.55);
                        if (c.userData) { c.userData._psx = false; c.userData._pxa = false; }
                        const rs = window.RetroShader ? window.RetroShader.active() : window.PSXShader;
                        if (rs) rs.applyToMaterial(c);
                        return c;
                    });
                    o.material = Array.isArray(o.material) ? stained : stained[0];
                });
            }
        }

        // Flag "root/whole-body" cascade rules: a rule whose hide list covers
        // (almost) the entire model is a structural rule (e.g. CORE/BODY/TORSO
        // gone -> hide everything). Losing a root part must NEVER delete the rest
        // of the model, so these rules are never auto-applied from part loss.
        // Detected by effect (mesh coverage), so it is name-agnostic across every
        // family. Whole-model removal still happens on death via applyDeathFade.
        _ensureCascadeMeta() {
            if (this._cascadeMetaDone) return;
            this._cascadeMetaDone = true;
            const all = new Set();
            for (const k in this._partMeshMap) { if (this._partMeshMap[k]) all.add(this._partMeshMap[k]); }
            for (const r of (this._cascadeRules || [])) { for (const m of (r.hide || [])) { if (m) all.add(m); } }
            const total = all.size;
            // A rule is "root/whole-body" if EITHER it hides most of the model
            // (coverage heuristic) OR any of its trigger keys names a structural
            // root part (body / torso / core / trunk / chest / spine / root).
            // Losing the body/root bone must NEVER delete the model from part loss (#97).
            const ROOT_KEY = /(^|_)(body|torso|core|trunk|chest|spine|root|main|hull|base)(_|$)/i;
            for (const r of (this._cascadeRules || [])) {
                const hidden = new Set((r.hide || []).filter(Boolean));
                const coversMost = total >= 2 && hidden.size >= Math.ceil(total * 0.7);
                const isRootKey = (r.gone || []).some(k => ROOT_KEY.test(String(k)));
                r._wholeBody = coversMost || isRootKey;
            }
        }

        // Instantly hide (no flash/fade) the mesh chains of any destroyed body
        // part, for static previews like the status screen. Root/whole-body rules
        // are skipped, so a creature missing a torso still shows the rest of its
        // model rather than vanishing. `parts` is a KEY -> {destroyed,currentHp}
        // map (e.g. an actor's _bodyParts).
        hideBrokenParts(parts) {
            if (!parts || !this._cascadeRules) return;
            this._ensureCascadeMeta();
            const gone = (k) => parts[k] && (parts[k].destroyed || parts[k].currentHp <= 0);
            for (const rule of this._cascadeRules) {
                if (rule._wholeBody) continue;
                if (rule.gone.some(gone)) {
                    for (const m of rule.hide) { if (m) m.visible = false; }
                }
            }
        }

        // Put back the original colours of any live hit-flash on `root` or
        // anything under it, and drop those entries. Called before a part's
        // materials are swapped out from under the flash.
        _settleFlash(root) {
            if (!this._flashMeshes.length || !root) return;
            const inside = new Set();
            root.traverse(o => inside.add(o));
            for (let i = this._flashMeshes.length - 1; i >= 0; i--) {
                const f = this._flashMeshes[i];
                if (!inside.has(f.mesh)) continue;
                for (let j = 0; j < f.mats.length; j++) {
                    const m = f.mats[j];
                    if (m && m.color && f.origColors[j]) m.color.copy(f.origColors[j]);
                }
                this._flashMeshes.splice(i, 1);
            }
        }

        // Begin the red-flash-then-fade for a freshly destroyed part. The part's
        // materials are CLONED so the fade/flash is isolated even when families
        // share one material across several parts (e.g. a single fur material).
        _startPartDestroy(obj) {
            if (!obj || this._destroyStarted.has(obj)) return;
            this._destroyStarted.add(obj);
            // A part can be severed mid-flash. The clones below replace the
            // materials the flash is holding, so the flash would go on writing
            // red into detached materials and the severed limb would fade out
            // stuck at whatever red it was cloned at. Settle the flash onto the
            // source materials first, so the clone is born the body's colour.
            this._settleFlash(obj);
            // Same for the named-part light: the clones below would go on being
            // painted yellow while the severed limb fades.
            this._settleAimHighlight(obj);
            const mats = [];
            obj.traverse(o => {
                if (!o.material) return;
                const src = Array.isArray(o.material) ? o.material : [o.material];
                // A clone carries userData across but NOT onBeforeCompile or
                // customProgramCacheKey, so it would land in the renderer as an
                // unknown material: a fresh shader compile in the middle of a
                // fight, and a severed limb rendered without the retro pass the
                // rest of the body has. Clear the marker and patch it again so it
                // shares the program every other battler material is already on.
                const cloned = src.map(m => {
                    const c = m.clone();
                    c.transparent = true;
                    if (c.userData) { c.userData._psx = false; c.userData._pxa = false; }
                    const _rs = window.RetroShader ? window.RetroShader.active() : window.PSXShader;
                    if (_rs) _rs.applyToMaterial(c);
                    return c;
                });
                o.material = Array.isArray(o.material) ? cloned : cloned[0];
                for (const c of cloned) mats.push(c);
            });
            this._destroyFades.push({ obj, mats, t: 0 });
        }

        updateDestroyFade(deltaTime) {
            for (let i = this._destroyFades.length - 1; i >= 0; i--) {
                const f = this._destroyFades[i];
                f.t += deltaTime;
                const k = 1 - Math.min(1, f.t / PART_DESTROY_TIME); // 1 -> 0
                for (const m of f.mats) {
                    m.opacity = Math.min(m.opacity, k);
                    if (m.emissive) m.emissive.setRGB(k, 0, 0); // red flash, fades out with k
                }
                if (k <= 0) {
                    f.obj.visible = false;
                    for (const m of f.mats) { if (m.emissive) m.emissive.setRGB(0, 0, 0); }
                    this._destroyFades.splice(i, 1);
                }
            }
        }

        // ── Death fade: stop animating and fade the whole model off ──────────
        // Collects every material under the model once, then drives opacity to 0.
        // Shared materials all fade together here (we WANT the whole body to go).
        applyDeathFade(deltaTime) {
            if (!this._deathMats) {
                this._deathMats = [];
                if (this.model) this.model.traverse(o => {
                    if (!o.material) return;
                    const arr = Array.isArray(o.material) ? o.material : [o.material];
                    for (const m of arr) { m.transparent = true; this._deathMats.push(m); }
                });
            }
            const p = Math.min(1, this.animTime / DEATH_FADE_TIME);
            for (const m of this._deathMats) m.opacity = Math.min(m.opacity, 1 - p);
            // Faded out is not gone: a fully transparent body is still submitted
            // to the renderer every frame, and with a whole troop those corpses
            // add up. Take it off the field once the fade has finished.
            if (p >= 1 && this.model) this.model.visible = false;
        }

        // ── Main per-frame update (shared) ───────────────────────────────────
        update(deltaTime) {
            if (!this.loaded) return;

            // Hit-stop: hold the current pose for the freeze window so the impact
            // lands with weight (animTime is NOT advanced), with a held squash so
            // the stop is obvious. Flashes and fades keep running so the hit still
            // reads. Skipped while dying so the death sequence is never stalled.
            if (this._hitStop > 0 && this.currentAnimation !== 'death') {
                this._hitStop -= deltaTime;
                this._applyHitStopSquash();
                this.updateFlash(deltaTime);
                this.updateAimHighlight(deltaTime);
                this.updateDestroyFade(deltaTime);
                return;
            }
            // Freeze just ended: clear the squash and restore the base scale.
            // Death overrides the decrement path above, so _hitStop can still be
            // positive here; zero it so the squash restores instead of the death
            // fade playing the whole model flattened.
            if (this.currentAnimation === 'death') this._hitStop = 0;
            if (this._hitStopBaseScale) this._applyHitStopSquash();

            // Paralysis (12) / Freeze (11): hold the current pose. animTime is NOT
            // advanced and the pose hooks are skipped, but flashes, fades and the
            // dismemberment cascade keep running so hits and death still register.
            // Death always overrides so a kill is never stuck frozen (#97).
            if (this.currentAnimation !== 'death' && this._isAnimFrozenByState()) {
                const parts = (this.battler && this.battler._bodyParts) ? this.battler._bodyParts : null;
                if (parts) { this.applyCascade(parts); this.applyPartBlood(parts); if (this.onCascade) this.onCascade(parts); }
                this.updateFlash(deltaTime);
                this.updateAimHighlight(deltaTime);
                this.updateDestroyFade(deltaTime);
                this._closeEyesIfAsleep();
                return;
            }

            this.animTime += deltaTime;

            // One-shot animations (hit / skill-attack / magic / spawn) auto-return
            // to idle once their duration elapses, firing the completion callback
            // the battle hooks rely on. Without this a model stays stuck mid-swing.
            const dur = ONESHOT_DURATION[this.currentAnimation];
            if (dur && this.animTime >= dur) {
                const cb = this.onAnimationComplete;
                this.onAnimationComplete = null;
                this.currentAnimation = 'idle';
                this.animTime = 0;
                if (cb) { try { cb(); } catch (e) { /* ignore */ } }
            }

            const parts = (this.battler && this.battler._bodyParts) ? this.battler._bodyParts : null;
            if (parts) {
                this.applyCascade(parts);
                this.applyPartBlood(parts);
                if (this.onCascade) this.onCascade(parts);
            }
            this.updateFlash(deltaTime);
            this.updateAimHighlight(deltaTime);
            this.updateDestroyFade(deltaTime);

            if (this.currentAnimation === 'death') {
                // Drop any leftover action-gesture offset before the death pose.
                if (this.model && (this._lastGestPZ || this._lastGestRX)) {
                    this.model.position.z -= this._lastGestPZ || 0;
                    this.model.rotation.x -= this._lastGestRX || 0;
                    this._lastGestPZ = 0; this._lastGestRX = 0;
                }
                // Stop the live animation, let the family add a topple flourish,
                // and fade the whole model off (physics-free death).
                this.deathPose(deltaTime);
                this.applyDeathFade(deltaTime);
                this._applyBossIntroOutro();
            } else {
                this.animatePose(deltaTime);
                if (this.useBaseActionMotion !== false) this._applyActionMotion();
                if (LOCO_STATES.includes(this.currentAnimation)) this._applyLocomotionMotion();
                else if (this._gaitLimbsActive) this._releaseGaitLimbs();
                this._applyBossIntroOutro();
                this._closeEyesIfAsleep();
            }
        }

        // Generic whole-body gesture layered on top of each family's pose so the
        // three action animations are always visually distinct, even for models
        // that animate attack/specialattack alike: skill = forward LUNGE, magic =
        // charged SHUDDER (rises + vibrates), hit = backward RECOIL. Applied as a
        // delta on the model's free axes (z position, x rotation) so it never
        // disturbs the family's own pose or the title/bestiary centring.
        _applyActionMotion() {
            if (!this.model) return;
            const t = this.animTime, s = this.scale, anim = this.currentAnimation;
            let pz = 0, rx = 0;
            if (anim === 'attack') {
                const e = Math.max(0, Math.sin(Math.min(t * 7, Math.PI)));
                pz = e * 0.35 * s; rx = e * 0.16;            // jab toward the player
            } else if (anim === 'specialattack') {
                const env = Math.exp(-t * 1.4);
                pz = -0.18 * s * env; rx = Math.sin(t * 17) * 0.14 * env; // channel + shudder
            } else if (anim === 'hit') {
                const e = Math.exp(-t * 14);
                pz = -0.55 * s * e; rx = -0.38 * e;          // knocked back (quick recoil)
            } else if (anim === 'cast') {
                // Channel: rear back, rise, vibrate with rising intensity.
                const env = Math.min(1, t * 2) * Math.exp(-t * 0.9);
                pz = -0.22 * s * env; rx = -0.22 * env + Math.sin(t * 22) * 0.05 * env;
            } else if (anim === 'beam') {
                // Thrust forward and HOLD the lunge (firing a beam/bolt).
                const e = Math.min(1, t * 6) * (t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) * 3));
                pz = 0.5 * s * e; rx = 0.14 * e;
            } else if (anim === 'summon') {
                // Arms-wide upward call: rear, slow sway, no lunge.
                const env = Math.sin(Math.min(t * 2.6, Math.PI));
                pz = -0.12 * s * env; rx = -0.18 * env;
            } else if (anim === 'slam') {
                // Rear up then drive down hard.
                const up = Math.max(0, Math.sin(Math.min(t * 6, Math.PI * 0.5)));
                const down = t > 0.42 ? Math.max(0, Math.sin(Math.min((t - 0.42) * 9, Math.PI))) : 0;
                rx = -0.4 * up + 0.5 * down; pz = 0.4 * s * down;
            } else if (anim === 'roar') {
                // Throw head/body back, swell, hold.
                const env = Math.sin(Math.min(t * 2.4, Math.PI));
                rx = -0.45 * env; pz = -0.14 * s * env;
            }
            // Remove last frame's delta, then apply the new one.
            this.model.position.z += pz - (this._lastGestPZ || 0);
            this.model.rotation.x += rx - (this._lastGestRX || 0);
            this._lastGestPZ = pz; this._lastGestRX = rx;
            // Pulse any glowing core/orb brighter during a cast so magic reads.
            if (anim === 'cast' || anim === 'beam' || anim === 'summon' || anim === 'specialattack') {
                this._setGlow(1.2 + Math.sin(t * 12) * 0.6);
                this._glowPulsed = true;
            } else if (this._glowPulsed) {
                // A family that drives its orb every frame overwrites this
                // anyway; the many that set it once at build time did not, and
                // were left permanently over-bright by whatever the last frame
                // of the cast happened to be.
                this._glowPulsed = false;
                this._setGlow(null);
            }
        }

        // Drive the emissive intensity of whichever glowing core/orb the family
        // registered. `null` restores the value the material was built with.
        _setGlow(v) {
            for (let i = 0; i < 2; i++) {
                const mesh = i === 0 ? this.coreGlow : this.staffOrb;
                const mat = mesh && mesh.material;
                if (!mat) continue;
                if (mat._b3dGlowBase === undefined) mat._b3dGlowBase = mat.emissiveIntensity;
                mat.emissiveIntensity = (v === null) ? mat._b3dGlowBase : v;
            }
        }
        // True once per model: is this battler tagged <Boss> in its enemy note?
        _isBoss() {
            if (this._isBossCache !== undefined) return this._isBossCache;
            let v = false;
            try { const id = this.battler && this.battler.enemyId && this.battler.enemyId(); if (id && typeof $dataEnemies !== 'undefined' && $dataEnemies[id] && /<Boss>/i.test($dataEnemies[id].note || '')) v = true; } catch (e) {}
            return (this._isBossCache = v);
        }
        // Per-boss spawn & death flourishes: each <Boss> deterministically draws
        // one of six entrances and one of six exits from its enemy id, so no two
        // boss kinds spawn or die the same way. Layered on the model's free axes
        // (py & rz are re-set by the owning pose each frame -> applied directly;
        // px & ry persist -> delta-tracked; rx is left to _applyActionMotion).
        _bossStyle() {
            if (this._bsCache) return this._bsCache;
            let id = 0; try { id = (this.battler && this.battler.enemyId && this.battler.enemyId()) || 0; } catch (e) {}
            return (this._bsCache = { sp: id % 6, de: ((id / 6) | 0) % 6 });
        }
        _applyBossIntroOutro() {
            if (!this.model || !this._isBoss()) return;
            const m = this.model, s = this.scale, st = this._bossStyle();
            let px = 0, py = 0, ry = 0, rz = 0;
            if (this.currentAnimation === 'spawn') {
                const prog = Math.min(1, this.animTime / (ONESHOT_DURATION.spawn || 1)), e = 1 - prog, T = this.animTime;
                switch (st.sp) {
                    case 0: py = -2.4 * s * e * e; ry = e * Math.PI * 3; break;                                   // erupt from the ground, spinning
                    case 1: py = 3.2 * s * e * e; rz = e * 0.4; break;                                            // crash down from above
                    case 2: ry = e * Math.PI * 9; px = Math.sin(prog * 34) * 0.35 * s * e; py = -0.5 * s * e; break; // warp/teleport-in flicker
                    case 3: px = -3.4 * s * e * e; ry = e * Math.PI * 1.5; break;                                  // streak in from stage-left
                    case 4: py = -1.7 * s * e; rz = Math.sin(T * 26) * 0.28 * e; break;                           // rise with a violent shudder
                    case 5: rz = e * 1.5; py = -0.8 * s * e; break;                                               // unfold upright from a tilt
                }
            } else if (this.currentAnimation === 'death') {
                const prog = Math.min(1, this.animTime / DEATH_FADE_TIME);
                switch (st.de) {
                    case 0: py = -0.7 * s * prog; ry = prog * prog * Math.PI * 2.5; break;                        // sink into the floor, spinning out
                    case 1: py = 2.8 * s * prog * prog; ry = prog * Math.PI; break;                               // soul ascends skyward
                    case 2: ry = prog * Math.PI * 11; px = Math.sin(prog * 44) * 0.25 * s; py = -0.3 * s * prog; break; // shatter / violent spin
                    case 3: py = -2.0 * s * prog * prog; break;                                                   // collapse straight down
                    case 4: px = -0.9 * s * prog; ry = prog * Math.PI * 0.9; py = -0.25 * s * prog; break;        // crumble & drift apart
                    case 5: py = 1.5 * s * Math.sin(Math.min(prog * 2.6, Math.PI)); rz = prog * 0.9; break;       // blown back, then drop
                }
            }
            // py & rz: owning pose resets them each frame -> add directly.
            m.position.y += py; m.rotation.z += rz;
            // px & ry: persistent axes -> delta-track so they zero out cleanly.
            const L = this._lastBoss || (this._lastBoss = { px: 0, ry: 0 });
            m.position.x += px - L.px; m.rotation.y += ry - L.ry; L.px = px; L.ry = ry;
        }

        // ── Hit-stop ─────────────────────────────────────────────────────────
        // Freeze the pose for a window on impact (fighting-game style) and hold an
        // "impact squash" so the stop is unmistakable even from a near-still idle.
        // The `intensity` (0..~1.5) comes from the damage popup (fraction of max
        // HP, boosted for crits / severed parts): a light tap freezes ~0.18s, a
        // crushing blow ~0.5s. Takes the longer of any overlapping freezes.
        triggerHitStop(intensity) {
            const i = Math.max(0, Math.min(1.5, intensity || 0));
            if (i <= 0) return;
            const dur = 0.14 + i * 0.26;
            this._hitStop = Math.max(this._hitStop || 0, dur);
            this._hitStopMax = this._hitStop;
            this._hitStopI = i;
            // Capture the current scale ONCE so the held squash is relative to it
            // and restores cleanly (don't recapture mid-freeze on a multi-hit).
            if (this.model && !this._hitStopBaseScale) {
                this._hitStopBaseScale = this.model.scale.clone();
            }
        }

        // Apply / fade the held impact squash during a freeze (flattened + widened,
        // easing back to neutral over the freeze). Restores the base scale when the
        // freeze ends. Returns true while a squash is active.
        _applyHitStopSquash() {
            if (!this.model || !this._hitStopBaseScale) return false;
            const b = this._hitStopBaseScale;
            if (this._hitStop > 0) {
                const k = Math.max(0, this._hitStop / (this._hitStopMax || 1)); // 1 -> 0
                const s = 0.22 * (this._hitStopI || 0) * k;                     // squash amount
                this.model.scale.set(b.x * (1 + s), b.y * (1 - s), b.z * (1 + s));
                return true;
            }
            this.model.scale.copy(b);
            this._hitStopBaseScale = null;
            return false;
        }

        // True when the battler is paralyzed (12) or frozen (11): pose is held.
        _isAnimFrozenByState() {
            const b = this.battler;
            if (!b || typeof b.isStateAffected !== 'function') return false;
            try { return b.isStateAffected(11) || b.isStateAffected(12); } catch (e) { return false; }
        }
        // True when the battler is asleep (state 10).
        _isAsleep() {
            const b = this.battler;
            if (!b || typeof b.isStateAffected !== 'function') return false;
            try { return b.isStateAffected(10); } catch (e) { return false; }
        }
        // Sleep: flatten any registered eye meshes (families set leftEyeMesh /
        // rightEyeMesh). Applied AFTER the family pose so it wins over blinking.
        // No-op for families that do not model eyes (#97).
        _closeEyesIfAsleep() {
            if (!this._isAsleep()) return;
            if (this.leftEyeMesh) this.leftEyeMesh.scale.y = 0.06;
            if (this.rightEyeMesh) this.rightEyeMesh.scale.y = 0.06;
        }

        // ── Prone: a BIPED that has lost both legs ───────────────────────────
        // Only the two-legged families call these (a spider that loses two of
        // eight legs still stands); they pose in their own local space, so the
        // whole rig keeps animating - arms, head and face - while it lies there.
        //
        // Is the whole leg chain on one side gone? Read from the battler's own
        // part map so every schema a biped rig serves is covered: the goblin's
        // THIGH/SHIN split and the simple LEFT_LEG/RIGHT_LEG one alike. A lost
        // foot does not count - the creature can still prop itself on the stump.
        _legLost(side) {
            const parts = this.battler && this.battler._bodyParts;
            if (!parts) return false;
            return [side + '_THIGH', side + '_LEG', side + '_SHIN']
                .some(k => parts[k] && parts[k].destroyed);
        }

        // Advance the topple (and the righting again, should a leg come back via
        // a regenerating part or a prosthetic), returning the progress 0..1.
        _updateProne(deltaTime) {
            const step = (deltaTime || 0) / PRONE_FALL_TIME;
            const down = this._legLost('LEFT') && this._legLost('RIGHT');
            this._proneT = down
                ? Math.min(1, (this._proneT || 0) + step)
                : Math.max(0, (this._proneT || 0) - step);
            return this._proneT;
        }

        // Lay the model out on the ground, applied at the MODEL ROOT (which sits
        // at the creature's ground point, so it tips over its own hips). Call it
        // LAST in animatePose, once the family's local pose is finished.
        // `baseY` is the model's standing height (families that drive
        // position.y themselves pass their own _baseY).
        _applyProne(p, baseY) {
            if (!this.model) return;
            if (baseY === undefined || baseY === null) {
                if (this._proneBaseY === null || this._proneBaseY === undefined) this._proneBaseY = this.model.position.y;
                baseY = this._proneBaseY;
            }
            const e = p * p * (3 - 2 * p);                 // smoothstep: falls, settles
            this.model.rotation.z = -Math.PI * 0.5 * e;    // topples sideways
            // Rolled flat the body's long axis sits right on the pivot, which
            // would bury half the torso: lift it by roughly half a torso.
            this.model.position.y = baseY + PRONE_LIFT * this.scale * e;
        }

        // Subclass hooks (no-ops by default). The base death visual is the
        // whole-model fade driven by applyDeathFade(); families override
        // deathPose(dt) to add a topple/collapse flourish on top.
        async load(/* physicsWorld, startX, startY, startZ */) { this.loaded = true; }
        animatePose(/* deltaTime */) {}
        deathPose(/* deltaTime */) {}
    }

    //=============================================================================
    // Draw-call reduction for a built battler
    //=============================================================================
    // A procedural battler is assembled from dozens of small primitives, each of
    // which was its own draw call with its own material and uniform upload. The
    // measured average was 32 meshes and 14 materials per creature, with the
    // worst carrying 251 meshes and one (a hairball) carrying 88 materials for
    // its 88 meshes: a six-strong troop was asking the driver for two hundred
    // draws before a single effect was on screen.
    //
    // Two passes fix that, in this order, because the second only groups meshes
    // that already share a material and most families give every primitive one
    // of its own:
    //
    //   1. materials that are identical in every respect become one material
    //   2. meshes that never move relative to each other and now share that
    //      material are baked into one buffer
    //
    // What must NOT be touched, and why:
    //   - anything in _partMeshMap, and anything a cascade rule hides: those are
    //     the body parts, and the hit flash and dismemberment reach them by
    //     reference and repaint their materials one at a time
    //   - anything a family holds in a field of its own: every animation poses
    //     limbs through those references
    //   - anything carrying children, or animation data in userData
    // A protected mesh keeps its own mesh AND its own material, so no flash and
    // no severing can ever reach a neighbour through shared state.

    // Fields whose contents are scanned for Object3D references. The model root
    // and its body group are the scene graph itself and are walked separately.
    const _OPTIMISE_SKIP_FIELDS = new Set(['model', 'bodyGroup', 'battler', 'profile', 'physicsWorld']);

    // Every Object3D a family can still reach by name after load().
    function collectReferencedNodes(battlerModel, out) {
        const seen = new Set();
        const visit = (value, depth) => {
            if (!value || depth > 3 || typeof value !== 'object') return;
            if (seen.has(value)) return;
            seen.add(value);
            if (value.isObject3D) { out.add(value); return; }
            if (Array.isArray(value)) { for (const v of value) visit(v, depth + 1); return; }
            if (value instanceof Map) { value.forEach(v => visit(v, depth + 1)); return; }
            if (value instanceof Set) { value.forEach(v => visit(v, depth + 1)); return; }
            // A plain bag of parts (this.limbs = { left: mesh }) is worth one
            // more level; anything with a prototype of its own is not ours.
            const proto = Object.getPrototypeOf(value);
            if (proto !== Object.prototype && proto !== null) return;
            for (const k in value) visit(value[k], depth + 1);
        };
        for (const key in battlerModel) {
            if (_OPTIMISE_SKIP_FIELDS.has(key)) continue;
            visit(battlerModel[key], 0);
        }
        return out;
    }

    // The meshes the flash, the dismemberment cascade and the family's own
    // animations reach by reference.
    function collectProtectedMeshes(battlerModel) {
        const out = new Set();
        const map = battlerModel._partMeshMap || {};
        for (const k in map) if (map[k]) out.add(map[k]);
        for (const rule of (battlerModel._cascadeRules || [])) {
            for (const m of (rule.hide || [])) if (m) out.add(m);
        }
        collectReferencedNodes(battlerModel, out);
        // Each of those nodes is protected in ITSELF, and not down its subtree,
        // because nothing here needs its descendants to stay loose:
        //   - the hit flash repaints _partMeshMap[key].material by reference, so
        //     only that node has to survive as itself
        //   - a cascade rule hides its targets with visible = false, which the
        //     whole subtree follows anyway
        //   - an animation poses a group, and a group whose loose leaves have
        //     been baked into one child poses exactly as it did
        // Protecting the subtrees as well marked every mesh in the model (a wolf
        // is 82 meshes and all 82 sit under one part or another) and left the
        // passes below nothing to do at all.
        return out;
    }

    function hasAnimationData(obj) {
        const ud = obj && obj.userData;
        if (!ud) return false;
        for (const k in ud) if (ud[k] !== undefined && ud[k] !== null) return true;
        return false;
    }

    // Two materials are interchangeable when everything the renderer reads off
    // them agrees. Anything with a custom program or a per-instance uniform is
    // excluded by giving it no key at all.
    const _MAT_NUMERIC_KEYS = ['roughness', 'metalness', 'opacity', 'shininess', 'reflectivity',
        'emissiveIntensity', 'clearcoat', 'transmission', 'ior', 'bumpScale', 'displacementScale'];
    function materialKey(mat) {
        if (!mat || mat.isShaderMaterial) return null;
        if (THREE.Material && mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return null;
        if (mat.userData && mat.userData._noShare) return null;
        const parts = [mat.type];
        parts.push(mat.color ? mat.color.getHexString() : '-');
        parts.push(mat.emissive ? mat.emissive.getHexString() : '-');
        parts.push(mat.specular ? mat.specular.getHexString() : '-');
        for (const k of _MAT_NUMERIC_KEYS) parts.push(mat[k] === undefined ? '-' : String(mat[k]));
        parts.push(mat.transparent ? 't' : 'o', String(mat.side), mat.flatShading ? 'f' : 's',
            mat.wireframe ? 'w' : '-', mat.depthWrite ? 'd' : '-', mat.depthTest ? 'z' : '-',
            String(mat.blending), mat.vertexColors ? 'vc' : '-', mat.fog ? 'fg' : '-',
            mat.toneMapped ? 'tm' : '-', String(mat.alphaTest));
        for (const slot of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap',
            'alphaMap', 'aoMap', 'bumpMap', 'envMap', 'lightMap', 'displacementMap', 'specularMap']) {
            parts.push(mat[slot] ? mat[slot].uuid : '-');
        }
        return parts.join('|');
    }

    // Pass 1: one material instance per distinct look, among the meshes nothing
    // repaints individually.
    function shareIdenticalMaterials(root, protectedMeshes) {
        const byKey = new Map();
        let saved = 0;
        root.traverse(obj => {
            if (!obj.isMesh || !obj.material || Array.isArray(obj.material)) return;
            if (protectedMeshes.has(obj)) return;
            const key = materialKey(obj.material);
            if (!key) return;
            const first = byKey.get(key);
            if (!first) { byKey.set(key, obj.material); return; }
            if (first === obj.material) return;
            const dead = obj.material;
            obj.material = first;
            saved++;
            if (typeof dead.dispose === 'function') dead.dispose();
        });
        return saved;
    }

    // Concatenates non-indexed geometries carrying position (plus normal and uv
    // where every part has them). Written out because the three this game ships
    // has no BufferGeometryUtils; the weapon overlay carries the same helper.
    function concatGeometries(geometries) {
        if (!geometries.length) return null;
        const wantNormal = geometries.every(g => g.attributes.normal);
        const wantUv = geometries.every(g => g.attributes.uv);
        let total = 0;
        for (const g of geometries) {
            if (!g.attributes.position) return null;
            total += g.attributes.position.count;
        }
        const position = new Float32Array(total * 3);
        const normal = wantNormal ? new Float32Array(total * 3) : null;
        const uv = wantUv ? new Float32Array(total * 2) : null;
        let v = 0;
        for (const g of geometries) {
            const p = g.attributes.position;
            position.set(p.array.subarray(0, p.count * 3), v * 3);
            if (normal) normal.set(g.attributes.normal.array.subarray(0, p.count * 3), v * 3);
            if (uv) uv.set(g.attributes.uv.array.subarray(0, p.count * 2), v * 2);
            v += p.count;
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(position, 3));
        if (normal) out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
        if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        return out;
    }

    // Pass 2: bake the unprotected leaves of each anchor into one buffer per
    // material. An anchor is the model root or any node the animations move, so
    // the decoration on a moving limb still collapses; it just collapses into
    // that limb rather than into the creature around it.
    function mergeStaticDecor(root, protectedMeshes) {
        if (!root || typeof THREE === 'undefined' || !THREE.BufferGeometry) return 0;
        root.updateMatrixWorld(true);

        const isAnchor = (obj) => obj === root || protectedMeshes.has(obj) || hasAnimationData(obj);
        const anchorOf = (obj) => {
            let node = obj;
            while (node) {
                if (isAnchor(node)) return node;
                node = node.parent;
            }
            return root;
        };
        const anchors = [root];
        root.traverse(obj => { if (obj !== root && isAnchor(obj)) anchors.push(obj); });

        const removals = [];
        const inverse = new THREE.Matrix4();
        const local = new THREE.Matrix4();
        let merged = 0;

        for (const anchor of anchors) {
            const buckets = new Map();
            anchor.traverse(obj => {
                if (obj === anchor) return;
                if (!obj.isMesh || !obj.geometry || !obj.material) return;
                if (Array.isArray(obj.material)) return;
                if (protectedMeshes.has(obj) || hasAnimationData(obj)) return;
                if (obj.children.length) return;
                if (obj.geometry.morphAttributes && Object.keys(obj.geometry.morphAttributes).length) return;
                if (!obj.visible) return;
                if (anchorOf(obj.parent) !== anchor) return;
                const key = obj.material.uuid;
                if (!buckets.has(key)) buckets.set(key, { material: obj.material, meshes: [] });
                buckets.get(key).meshes.push(obj);
            });

            inverse.copy(anchor.matrixWorld).invert();
            for (const bucket of buckets.values()) {
                if (bucket.meshes.length < 2) continue;
                const parts = [];
                for (const mesh of bucket.meshes) {
                    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
                    local.multiplyMatrices(inverse, mesh.matrixWorld);
                    geo.applyMatrix4(local);
                    parts.push(geo);
                    removals.push(mesh);
                }
                const geometry = concatGeometries(parts);
                for (const g of parts) g.dispose();
                if (!geometry) continue;
                const mesh = new THREE.Mesh(geometry, bucket.material);
                mesh.castShadow = bucket.meshes[0].castShadow;
                mesh.receiveShadow = bucket.meshes[0].receiveShadow;
                mesh.userData._merged = true;
                anchor.add(mesh);
                merged += bucket.meshes.length - 1;
            }
        }

        for (const mesh of removals) {
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose();
        }
        return merged;
    }

    // ---------------------------------------------------------------------
    // Pass 0: the low-poly look.
    //
    // Every family builds its model out of THREE primitives at whatever
    // resolution read well in isolation, which across the whole roster averages
    // out to smooth plastic. Rebuilding each primitive at a coarser segment
    // count and shading it flat gives every battler the same faceted,
    // hand-cut silhouette without touching a single family file. The caps are
    // deliberately mild: the shape a builder asked for survives, it just shows
    // its facets.
    const _FACET_CAPS = {
        SphereGeometry: [10, 7],
        SphereBufferGeometry: [10, 7],
        CapsuleGeometry: [4, 8],
        CylinderGeometry: [9, 1],
        ConeGeometry: [9, 1],
        TorusGeometry: [8, 10],
        TorusKnotGeometry: [48, 6],
        LatheGeometry: [9],
        CircleGeometry: [10],
        RingGeometry: [10, 1],
        TubeGeometry: [24, 6]
    };
    // Constructor argument names, in order, per geometry type.
    const _FACET_ARGS = {
        SphereGeometry: ['radius', 'widthSegments', 'heightSegments', 'phiStart', 'phiLength', 'thetaStart', 'thetaLength'],
        SphereBufferGeometry: ['radius', 'widthSegments', 'heightSegments', 'phiStart', 'phiLength', 'thetaStart', 'thetaLength'],
        CapsuleGeometry: ['radius', 'length', 'capSegments', 'radialSegments'],
        CylinderGeometry: ['radiusTop', 'radiusBottom', 'height', 'radialSegments', 'heightSegments', 'openEnded', 'thetaStart', 'thetaLength'],
        ConeGeometry: ['radius', 'height', 'radialSegments', 'heightSegments', 'openEnded', 'thetaStart', 'thetaLength'],
        TorusGeometry: ['radius', 'tube', 'radialSegments', 'tubularSegments', 'arc'],
        TorusKnotGeometry: ['radius', 'tube', 'tubularSegments', 'radialSegments', 'p', 'q'],
        LatheGeometry: ['points', 'segments', 'phiStart', 'phiLength'],
        CircleGeometry: ['radius', 'segments', 'thetaStart', 'thetaLength'],
        RingGeometry: ['innerRadius', 'outerRadius', 'thetaSegments', 'phiSegments', 'thetaStart', 'thetaLength'],
        TubeGeometry: ['path', 'tubularSegments', 'radius', 'radialSegments', 'closed']
    };
    // Which argument slots the caps above apply to, in cap order.
    const _FACET_SLOTS = {
        SphereGeometry: ['widthSegments', 'heightSegments'],
        SphereBufferGeometry: ['widthSegments', 'heightSegments'],
        CapsuleGeometry: ['capSegments', 'radialSegments'],
        CylinderGeometry: ['radialSegments', 'heightSegments'],
        ConeGeometry: ['radialSegments', 'heightSegments'],
        TorusGeometry: ['radialSegments', 'tubularSegments'],
        TorusKnotGeometry: ['tubularSegments', 'radialSegments'],
        LatheGeometry: ['segments'],
        CircleGeometry: ['segments'],
        RingGeometry: ['thetaSegments', 'phiSegments'],
        TubeGeometry: ['tubularSegments', 'radialSegments']
    };
    // A geometry can be shared by several meshes (families cache and clone
    // parts), so each source is coarsened once and the result handed to every
    // user. The originals are never disposed: another live model may still be
    // drawing one.
    const _facetCache = typeof WeakMap === 'function' ? new WeakMap() : null;

    function isPristinePrimitive(geo, Ctor, names) {
        const mine = geo.getAttribute && geo.getAttribute('position');
        if (!mine) return false;
        let ref = null;
        try {
            ref = new Ctor(...names.map(n => geo.parameters[n]));
        } catch (e) {
            return false;
        }
        try {
            const theirs = ref.getAttribute('position');
            if (!theirs || theirs.count !== mine.count) return false;
            const a = mine.array, b = theirs.array;
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (Math.abs(a[i] - b[i]) > 1e-5) return false;
            }
            return true;
        } finally {
            ref.dispose();
        }
    }

    function coarsenGeometry(geo) {
        if (!geo || !geo.parameters || geo.morphAttributes && Object.keys(geo.morphAttributes).length) return null;
        const type = geo.type;
        const caps = _FACET_CAPS[type];
        const names = _FACET_ARGS[type];
        const slots = _FACET_SLOTS[type];
        if (!caps || !names || !slots) return null;
        const Ctor = THREE[type];
        if (typeof Ctor !== 'function') return null;
        if (_facetCache && _facetCache.has(geo)) return _facetCache.get(geo);

        const params = Object.assign({}, geo.parameters);
        let changed = false;
        for (let i = 0; i < slots.length; i++) {
            const name = slots[i];
            const cap = caps[i];
            const cur = params[name];
            if (typeof cur !== 'number') continue;
            // Most of the way down, never past the cap: a builder that already
            // asked for something blocky keeps exactly what it asked for.
            const want = Math.max(cap, Math.round(cur * 0.6));
            const next = Math.min(cur, want);
            if (next !== cur) { params[name] = next; changed = true; }
        }
        if (!changed) { if (_facetCache) _facetCache.set(geo, null); return null; }

        // .parameters survives a builder editing the vertices in place, so it
        // is not on its own proof that this geometry is still the primitive it
        // says it is. Rebuild it at its OWN parameters and compare: a pristine
        // primitive matches vertex for vertex, a sculpted one does not, and a
        // sculpted one must be left alone or the sculpting is thrown away.
        if (!isPristinePrimitive(geo, Ctor, names)) {
            if (_facetCache) _facetCache.set(geo, null);
            return null;
        }

        let out = null;
        try {
            out = new Ctor(...names.map(n => params[n]));
        } catch (e) {
            out = null;
        }
        if (out && geo.userData) out.userData = Object.assign({}, geo.userData);
        if (_facetCache) _facetCache.set(geo, out);
        return out;
    }

    // Walk the model, coarsen every parametric primitive in it and shade the
    // meshes that carry one flat. Skinned meshes and loaded GLB geometry have
    // no .parameters and are left exactly as they are, and so is anything a
    // builder has already edited vertex by vertex.
    function facetBattlerModel(root) {
        let touched = 0;
        const flattened = new Set();
        root.traverse(obj => {
            if (!obj.isMesh || obj.isSkinnedMesh || !obj.geometry) return;
            const next = coarsenGeometry(obj.geometry);
            if (next) { obj.geometry = next; touched++; }
            if (!obj.geometry.parameters) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
                if (!mat || mat.isShaderMaterial || mat.flatShading || flattened.has(mat)) continue;
                if (mat.map || mat.normalMap) continue; // painted sheets read wrong faceted
                mat.flatShading = true;
                mat.needsUpdate = true;
                flattened.add(mat);
            }
        });
        return touched;
    }

    // Run both passes over a battler that has finished load(). Safe to call more
    // than once: the second call finds nothing left to do.
    function optimiseBattlerModel(battlerModel) {
        const root = battlerModel && battlerModel.model;
        if (!root || battlerModel._optimised) return null;
        battlerModel._optimised = true;
        try {
            const facets = facetBattlerModel(root);
            const protectedMeshes = collectProtectedMeshes(battlerModel);
            const materials = shareIdenticalMaterials(root, protectedMeshes);
            const meshes = mergeStaticDecor(root, protectedMeshes);
            return { facets, materials, meshes };
        } catch (e) {
            console.warn('[3D Battler] draw-call pass failed, model left as built', e);
            return null;
        }
    }

    //=============================================================================
    // Battle3DScene - Manages the 3D rendering scene (unchanged from v1)
    //=============================================================================

    // Traverse a removed model and release its GPU resources. Only per-model
    // geometry and materials are disposed; skin textures live in the shared
    // _SKIN_TEX_CACHE and are reused across battlers, so their .map references
    // are deliberately left intact (never dispose a shared/cached singleton).
    // ── Shader programs, across battles ──────────────────────────────────────
    // three hands a compiled program back the moment the last material using it
    // is disposed, and tearing the field down at the end of a fight disposes
    // every material on it. So the programs the battlers had just been drawn
    // with were thrown away between fights and compiled again on the opening
    // frame of the next one, which is a good part of the hitch a battle used to
    // start with: a shader compile blocks the driver, and it lands on exactly
    // the frame the fight appears.
    //
    // The renderer is already the session's one battle context and outlives
    // every fight (acquireBattleRenderer), so the programs may as well outlive
    // them too. One material per distinct program is held back from disposal;
    // that keeps the program's use count off zero, and the next battle's
    // structurally identical materials find it already compiled in three's own
    // cache. Bounded, and a material with no geometry behind it is a few dozen
    // bytes.
    const PROGRAM_KEEPALIVE_MAX = 64;
    const _programKeepAlive = new Map();   // program cacheKey -> the material held back

    // The cache keys of the programs a material has actually been compiled into.
    // Null for one that was never drawn, which has no program to keep.
    function materialProgramKeys(mat) {
        const renderer = _sharedRenderer;
        if (!renderer || !renderer.properties || !renderer.properties.get) return null;
        let props;
        try { props = renderer.properties.get(mat); } catch (e) { return null; }
        const programs = props && props.programs;
        if (!programs || typeof programs.forEach !== 'function') return null;
        const keys = [];
        programs.forEach(prog => { if (prog && prog.cacheKey) keys.push(prog.cacheKey); });
        return keys.length ? keys : null;
    }

    // Held back rather than disposed? Only for a program nothing is holding yet.
    function keepMaterialAlive(mat) {
        if (_programKeepAlive.size >= PROGRAM_KEEPALIVE_MAX) return false;
        const keys = materialProgramKeys(mat);
        if (!keys) return false;
        let novel = false;
        for (const k of keys) { if (!_programKeepAlive.has(k)) { novel = true; break; } }
        if (!novel) return false;
        for (const k of keys) { if (!_programKeepAlive.has(k)) _programKeepAlive.set(k, mat); }
        return true;
    }

    // A rebuilt context (see acquireBattleRenderer) compiles from scratch, so
    // what the old one was holding is only dead weight.
    function resetProgramKeepAlive() {
        _programKeepAlive.clear();
    }

    function disposeObject3DResources(root) {
        if (!root || typeof root.traverse !== 'function') return;
        const releaseMaterial = m => {
            if (!m || typeof m.dispose !== 'function') return;
            if (keepMaterialAlive(m)) return;
            m.dispose();
        };
        root.traverse(obj => {
            if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                obj.geometry.dispose();
            }
            const mat = obj.material;
            if (!mat) return;
            if (Array.isArray(mat)) {
                mat.forEach(releaseMaterial);
            } else {
                releaseMaterial(mat);
            }
        });
    }

    // A battler is a solid object, but every family builds its materials with
    // `transparent: true` because the death fade and the dismemberment fade drive
    // opacity later on. A material that merely MIGHT fade one day still pays the
    // whole price of being transparent every frame it is drawn: it is taken out of
    // the opaque queue (so it is never depth-sorted front to back and never gets
    // early-z rejection, which is expensive on a model built from thirty
    // interpenetrating primitives), sorted back to front instead, and blended per
    // fragment. Over the real database that is 35,500 of 42,900 materials standing
    // in the transparent queue at full opacity, i.e. for nothing.
    //
    // So a solid material is put back in the opaque queue and the fade is armed
    // instead: `opacity` becomes an accessor that flips `transparent` back on the
    // first time anything drives it below 1, and off again if it returns. Nothing
    // in a family changes; a fade still just writes `mat.opacity`.
    function armFadeOnDemand(mat) {
        if (!mat || !mat.transparent || mat._b3dOpaque) return;
        if (!(mat.opacity >= 1)) return;                     // genuinely translucent
        if (mat.depthWrite === false) return;                // a glow / overlay pass
        if (mat.blending !== undefined && mat.blending !== THREE.NormalBlending) return;
        if (mat.alphaMap || mat.alphaTest) return;           // cut-out, needs the queue
        mat._b3dOpaque = true;
        mat.transparent = false;
        let value = mat.opacity;
        Object.defineProperty(mat, 'opacity', {
            configurable: true,
            enumerable: true,
            get() { return value; },
            set(v) {
                value = v;
                const want = v < 1;
                if (this.transparent !== want) this.transparent = want;
            }
        });
    }

    function armModelFades(root) {
        if (!root || typeof root.traverse !== 'function') return;
        root.traverse(obj => {
            const mat = obj.material;
            if (!mat) return;
            if (Array.isArray(mat)) mat.forEach(armFadeOnDemand);
            else armFadeOnDemand(mat);
        });
    }

    // ONE WebGL context for every battle of the session.
    //
    // A renderer used to be built and thrown away per battle, which meant a fresh
    // context (tens of ms), a fresh shader compile of every material variant and a
    // fresh upload of every texture at the start of each fight: the whole cost of
    // "loading the 3D enemies" was paid again for a creature the party had just
    // fought. Kept alive across battles, the context, three's own program cache
    // and the texture uploads all survive, so the second and every later battle
    // starts with almost nothing left to build. It also settles the browser's
    // live-context cap for good (the reason the old code had to hand the context
    // back at all): there is only ever one.
    let _sharedRenderer = null;

    function acquireBattleRenderer() {
        if (_sharedRenderer) {
            // A context can still be lost (driver reset, tab eviction). A lost one
            // renders nothing, so drop it and build a replacement.
            let lost = false;
            try {
                const gl = _sharedRenderer.getContext();
                lost = !gl || (gl.isContextLost && gl.isContextLost());
            } catch (e) { lost = true; }
            if (!lost) return _sharedRenderer;
            try { _sharedRenderer.dispose(); } catch (e) { /* already gone */ }
            _sharedRenderer = null;
            resetProgramKeepAlive();
        }
        // Antialias defaults OFF: MSAA is one of the most expensive things a
        // software rasterizer does, and the game already targets a low-fi
        // (PSXShader) look, so it costs a lot for little benefit here.
        _sharedRenderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: config.antialias,
            powerPreference: 'high-performance'
        });
        _sharedRenderer.setPixelRatio(1); // composited into a PIXI texture at game res
        _sharedRenderer.setClearColor(0x000000, 0);
        return _sharedRenderer;
    }

    // How many pixels the battle layer actually rasterises, as a share of the
    // screen. Two factors, folded into ONE canvas size rather than two passes:
    //   renderScale  the perf knob (auto: half resolution on a software renderer)
    //   retro        PSXShader's own downsample
    // PSXShader.render() reaches the second by drawing the scene into a low-res
    // render target and blitting it back up over a full-size canvas, which costs
    // a whole extra full-screen pass every frame AND leaves the canvas (and so
    // the per-frame upload into the PIXI texture) at full size for no gain. The
    // vertex snapping and the colour banding live in the patched materials, not
    // in that pass, so rendering straight into a smaller canvas and letting the
    // PIXI sprite scale it up with nearest sampling is the same picture, one
    // pass and a smaller upload cheaper.
    function battleRenderScale(renderer) {
        // The perf half never moves, and asking it costs a WEBGL_debug_renderer_info
        // lookup, so it is answered once per context; only the retro half is live.
        if (renderer._b3dBaseScale === undefined) {
            const rs = config.renderScale;
            renderer._b3dBaseScale = (!rs || rs <= 0)
                ? (detectSoftwareRenderer(renderer) ? 0.5 : 1)
                : rs;
        }
        let scale = renderer._b3dBaseScale;
        const retro = window.RetroShader ? window.RetroShader.active() : window.PSXShader;
        if (retro && retro.enabled) {
            const down = retro.downscaleFor ? retro.downscaleFor('scene') : retro.downscale;
            if (down > 0 && down < 0.999) scale *= down;
        }
        return Math.max(0.1, Math.min(1, scale));
    }

    //=========================================================================
    // Day / night lighting rig
    //
    // TimeDateSystem answers what the light looks like (colours, a direction,
    // a shadow strength); this turns that answer into three.js. It is written
    // once here and used twice: by the battle scene below, and by the first
    // person weapon overlay, which reaches for window.Battler3D.Lighting. That
    // is deliberate. If the two built their own rigs the sword in your hands
    // would catch a different sun than the one throwing the monster's shadow.
    //
    // The whole thing is built to cost nothing on a normal frame:
    //  - the solve is cached by TimeDateSystem and stamped with a `key`, so a
    //    frame where the clock has not moved is one integer compare and out;
    //  - the shadow map is taken off three's automatic path and redrawn every
    //    Nth drawn frame instead of every frame, which is where most of the
    //    saving is (the shadow pass draws every caster a second time);
    //  - the sky reflection is a 32x16 texture, and it is rebuilt only when the
    //    light itself moves, not per frame.
    //=========================================================================

    // A 32x16 equirectangular sky: a vertical sky-to-ground ramp with the sun
    // burned into it at its real bearing. Tiny on purpose. PMREM blurs it into
    // a reflection probe, and at the roughness the game's metals use nothing
    // finer would survive the blur anyway.
    const ENV_TEX_W = 32;
    const ENV_TEX_H = 16;
    // cos of the sun disc's half angle (~26 degrees), which at this texture
    // size is two or three texels across.
    const SUN_DISC_COS = 0.9;

    // Is the battle being fought over the live 3D world rather than a painted
    // battleback? Then the ground behind the battlers is real ground, with its
    // own sun on it, and nothing here should be drawing a second one.
    function onLiveGround() {
        const VWS = window.VoxelWorldSystem;
        return !!(VWS && VWS.isBattleView && VWS.isBattleView());
    }

    // Where the shadow catcher sits until the field has been measured. Matches
    // the y a procedural battler is first placed at, so the very first frame of
    // a fight already has the shadows roughly under the feet rather than
    // sliding into place.
    const DEFAULT_GROUND_Y = -1.5;

    function buildSkyEquirect(light) {
        const w = ENV_TEX_W, h = ENV_TEX_H;
        const data = new Uint8Array(w * h * 4);
        const sky = new THREE.Color(light.skyColor);
        const gnd = new THREE.Color(light.groundColor);
        const key = new THREE.Color(light.keyColor);
        const horizon = sky.clone().lerp(gnd, 0.5);
        const c = new THREE.Color();
        const d = light.dir;

        // three samples an equirect map as u = atan2(z, x)/2pi + 0.5 and
        // v = asin(y)/pi + 0.5, and a DataTexture's first row is v = 0. So row
        // zero is straight DOWN, not up, and the azimuth is measured from the
        // middle of the row. Getting either wrong puts the ground in the sky
        // and the sun's highlight on the wrong side of the blade, which is the
        // one thing this texture exists to get right.
        for (let y = 0; y < h; y++) {
            const phi = (y + 0.5) / h * Math.PI;
            const vy = -Math.cos(phi);  // -1 straight down .. +1 straight up
            const rh = Math.sin(phi);   // length of the horizontal component
            // Two ramps meeting at the horizon rather than one sky-to-ground
            // fade: a real horizon is a bright band, and it is the band that
            // shows up in a curved blade.
            if (vy >= 0) c.copy(horizon).lerp(sky, Math.pow(vy, 0.6));
            else c.copy(horizon).lerp(gnd, Math.pow(-vy, 0.5));

            for (let x = 0; x < w; x++) {
                const theta = ((x + 0.5) / w - 0.5) * Math.PI * 2;
                const vx = Math.cos(theta) * rh;
                const vz = Math.sin(theta) * rh;
                const dot = vx * d.x + vy * d.y + vz * d.z;
                const i = (y * w + x) * 4;
                let r = c.r, g = c.g, b = c.b;
                // A tight disc, not a wide glow. PMREM blurs this into a broad
                // highlight anyway, and a wide one here would clip the whole
                // upper sky to white and take the day's colour with it, which
                // is precisely the tint the reflection is supposed to carry.
                if (dot > SUN_DISC_COS) {
                    // Soft-edged, so the blur does not smear a hard square.
                    const s = Math.pow((dot - SUN_DISC_COS) / (1 - SUN_DISC_COS), 2) *
                        light.keyIntensity * 1.6;
                    r += key.r * s; g += key.g * s; b += key.b * s;
                }
                data[i] = Math.min(255, r * 255);
                data[i + 1] = Math.min(255, g * 255);
                data[i + 2] = Math.min(255, b * 255);
                data[i + 3] = 255;
            }
        }

        const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.needsUpdate = true;
        return tex;
    }

    // How many baked sky probes the renderer keeps (see DayNightRig._refreshEnv).
    const ENV_PROBE_CACHE_MAX = 6;

    class DayNightRig {
        // opts.shadows      cast shadows onto a ground catcher (battle only)
        // opts.groundY      height of that catcher, in scene units
        // opts.radius       half-width of the lit area, sizes the shadow frustum
        // opts.env          build the sky reflection probe
        // opts.dirDistance  how far out to park the light (scene units)
        constructor(scene, renderer, opts) {
            opts = opts || {};
            this.scene = scene;
            this.renderer = renderer;
            this._radius = opts.radius || 8;
            this._dirDistance = opts.dirDistance || this._radius * 1.6;
            this._env = config.envReflections && opts.env !== false;
            this._shadows = config.dayNightShadows && !!opts.shadows;
            this._lightKey = -1;
            this._envKey = -1;
            this._envRT = null;
            this._frame = 0;
            this._envFailed = false;
            this._envActive = false;

            // A hemisphere light, not a flat ambient: sky colour from above and
            // bounced ground colour from below is what stops a night battler
            // from reading as a grey cut-out. Costs the same as an ambient.
            this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
            scene.add(this.hemi);

            this.key = new THREE.DirectionalLight(0xffffff, 1);
            this.key.position.set(0, this._dirDistance, 0);
            scene.add(this.key);
            scene.add(this.key.target);

            // A dim opposite light so the unlit side keeps its silhouette
            // instead of going to black. Never casts.
            this.fill = new THREE.DirectionalLight(0xffffff, 0.18);
            scene.add(this.fill);

            if (this._shadows) this._initShadows(opts);
            this.update(true);
        }

        _initShadows(opts) {
            const renderer = this.renderer;
            renderer.shadowMap.enabled = true;
            // PCF, not PCFSoft: the soft variant takes many more taps for a
            // blur the retro downsample throws away again.
            renderer.shadowMap.type = THREE.PCFShadowMap;
            // Off three's automatic path so the shadow map is redrawn on our
            // schedule (see update) rather than on every single frame.
            renderer.shadowMap.autoUpdate = false;
            renderer.shadowMap.needsUpdate = true;

            let size = config.shadowMapSize;
            if (!size || size <= 0) size = detectSoftwareRenderer(renderer) ? 256 : 512;

            this.key.castShadow = true;
            this.key.shadow.mapSize.set(size, size);
            this.key.shadow.bias = -0.0012;
            this.key.shadow.normalBias = 0.02;
            const cam = this.key.shadow.camera;
            const r = this._radius;
            cam.left = -r; cam.right = r;
            cam.top = r; cam.bottom = -r;
            cam.near = 0.5;
            cam.far = this._dirDistance * 2.5;
            cam.updateProjectionMatrix();

            // The catcher exists only to be darkened: ShadowMaterial draws
            // nothing where nothing is shadowed, so the 2D battle background
            // shows straight through it. depthWrite off so a full-field plane
            // cannot occlude the battlers standing on it.
            this._groundMat = new THREE.ShadowMaterial({ opacity: 0.5 });
            this._groundMat.depthWrite = false;
            this._ground = new THREE.Mesh(
                new THREE.PlaneGeometry(this._radius * 3, this._radius * 3),
                this._groundMat
            );
            this._ground.rotation.x = -Math.PI / 2;
            this._ground.position.y = opts.groundY !== undefined ? opts.groundY : -1.5;
            this._ground.receiveShadow = true;
            this.scene.add(this._ground);
        }

        // Called when the field settles: the models know where their feet are,
        // the catcher does not, so it is dropped onto the lowest one.
        setGroundY(y) {
            if (!this._ground || !isFinite(y)) return;
            if (Math.abs(this._ground.position.y - y) < 0.01) return;
            this._ground.position.y = y;
            if (this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
        }

        // Flag a model's meshes as shadow casters. Only casters are drawn into
        // the shadow map, so a model that never gets marked costs nothing.
        // Receiving is left off: the ground catches the shadows, and making
        // every battler a receiver would recompile its materials for a result
        // the retro downsample mostly eats.
        markCaster(root) {
            if (!this._shadows || !root) return;
            root.traverse(o => { if (o.isMesh) o.castShadow = true; });
            this.renderer.shadowMap.needsUpdate = true;
        }

        update(force) {
            const tds = window.TimeDateSystem;
            if (!tds || !tds.getDayNightLight) return;
            let light;
            try { light = tds.getDayNightLight(); } catch (e) { return; }
            if (!light) return;

            // The live-ground answer is part of what _apply decides, and it can
            // change without the light changing at all (a fight opened in the
            // 3D world, or one left), so it is watched alongside the key.
            const live = onLiveGround();
            if (force || light.key !== this._lightKey || live !== this._onLiveGround) {
                this._lightKey = light.key;
                this._onLiveGround = live;
                this._apply(light);
            }

            // Shadow map on its own clock. Everything that can invalidate it
            // out of band (a moved light, a new caster, a moved catcher) sets
            // needsUpdate directly, so this only has to cover the steady state
            // of battlers animating in place.
            if (this._shadows && (++this._frame % config.shadowUpdateEvery) === 0) {
                this.renderer.shadowMap.needsUpdate = true;
            }
        }

        _apply(light) {
            const d = light.dir;
            const dist = this._dirDistance;

            this.hemi.color.setHex(light.skyColor);
            this.hemi.groundColor.setHex(light.groundColor);
            // Once the sky probe is up it is itself lighting everything, so the
            // hemisphere light stands down to make room. Without this the two
            // ambients stack and a noon battler washes out to a flat silhouette
            // brighter than it ever was before any of this.
            this.hemi.intensity = light.ambientIntensity * (this._envActive ? 0.45 : 1);

            this.key.color.setHex(light.keyColor);
            this.key.intensity = light.keyIntensity;
            this.key.position.set(d.x * dist, d.y * dist, d.z * dist);
            this.key.target.position.set(0, 0, 0);
            this.key.target.updateMatrixWorld();

            // The fill stands opposite and low, and is the sky's colour rather
            // than the sun's: it is standing in for light off the ground.
            this.fill.color.setHex(light.skyColor);
            this.fill.intensity = 0.12 + 0.14 * light.night;
            this.fill.position.set(-d.x * dist, dist * 0.35, -d.z * dist);

            if (this._groundMat) {
                this._groundMat.opacity = light.shadowOpacity;
                // Under heavy cloud there is no shadow left to draw, so the
                // whole extra pass is switched off rather than spent rendering
                // something that composites to nothing.
                //
                // And a fight in the 3D world has no use for it at all: the
                // catcher is one flat plane at the height of the lowest pair of
                // feet, which is the right answer over a painted backdrop and
                // the wrong one over real ground seen in perspective - it puts
                // a grey ellipse under the monster that lies across the hill it
                // is standing on. That world lights and shadows itself.
                const worth = light.shadowOpacity > 0.05 && !onLiveGround();
                this.key.castShadow = worth;
                this._ground.visible = worth;
                // A shadow is a hole in the sky's light, so it takes the sky's
                // colour: blue at night, warm at noon, never flat black.
                this._groundMat.color.setHex(light.skyColor).multiplyScalar(0.35);
                this.renderer.shadowMap.needsUpdate = true;
            }

            if (this._env) this._refreshEnv(light);
        }

        // The reflection probe. Rebuilding runs a PMREM pass, so it is held to
        // the coarser of the two clocks: a handful of times an in-game hour,
        // never per frame.
        //
        // The baked probe belongs to the RENDERER rather than to this rig. The
        // renderer is the session's one battle context and outlives every
        // fight (see acquireBattleRenderer), while the rig is built and thrown
        // away with each one: keeping the probe on the rig meant every battle
        // opened by running the same sky through PMREM again, which is a
        // shader pass plus a mip chain, on the very frame the fight appears.
        // A handful of hours' skies are kept so walking into a second fight in
        // the same weather at the same hour costs a map lookup.
        _refreshEnv(light) {
            if (this._envFailed) return;
            const envKey = Math.round(light.hour * 4) * 8 + Math.round(light.night * 3);
            if (envKey === this._envKey) return;
            this._envKey = envKey;
            try {
                let store = this.renderer._b3dEnvCache;
                if (!store) store = this.renderer._b3dEnvCache = new Map();
                let rt = store.get(envKey);
                if (!rt) {
                    let pmrem = this.renderer._b3dPmrem;
                    if (!pmrem) {
                        pmrem = this.renderer._b3dPmrem = new THREE.PMREMGenerator(this.renderer);
                        pmrem.compileEquirectangularShader();
                    }
                    const src = buildSkyEquirect(light);
                    rt = pmrem.fromEquirectangular(src);
                    src.dispose();
                    store.set(envKey, rt);
                    // Bounded, so a long session cannot accumulate a probe per
                    // quarter hour of game time. The sky in use is never the one
                    // handed back.
                    if (store.size > ENV_PROBE_CACHE_MAX) {
                        for (const oldKey of store.keys()) {
                            if (oldKey === envKey) continue;
                            const old = store.get(oldKey);
                            store.delete(oldKey);
                            if (old) old.dispose();
                            break;
                        }
                    }
                }
                this._envRT = rt;
                // Read back by _apply to stand the hemisphere light down. Set
                // here rather than at construction because the probe can fail.
                if (!this._envActive) { this._envActive = true; this.hemi.intensity *= 0.45; }
                // Applied scene-wide rather than per material: three hands
                // scene.environment to every MeshStandardMaterial by itself, so
                // every battler body and every weapon part picks the sky up
                // with no traversal and nothing to keep in sync.
                this.scene.environment = rt.texture;
            } catch (e) {
                // No probe is a survivable loss (metals fall back to direct
                // light); a probe that throws every few minutes is not.
                this._envFailed = true;
                this.scene.environment = null;
                debugLog('Day/night reflection probe unavailable: ' + e);
            }
        }

        dispose() {
            const s = this.scene;
            if (this.hemi) s.remove(this.hemi);
            if (this.key) { s.remove(this.key); s.remove(this.key.target); }
            if (this.fill) s.remove(this.fill);
            if (this._ground) {
                s.remove(this._ground);
                this._ground.geometry.dispose();
                this._groundMat.dispose();
            }
            // NOT disposed: the baked probe lives in the renderer's cache and
            // the next fight at this hour is about to want it back.
            this._envRT = null;
            s.environment = null;
            // The PMREM generator stays on the renderer: it belongs to the
            // context, which outlives the battle, and its compiled shader is
            // the expensive half.
            if (this.renderer && this.renderer.shadowMap) {
                this.renderer.shadowMap.autoUpdate = true;
            }
        }
    }

    class Battle3DScene {
        constructor() {
            this.scene = null;
            this.camera = null;
            this.renderer = null;
            this.physicsWorld = null;
            this.models = new Map();
            this.clock = new THREE.Clock();
            this._disposed = false;
            debugLog('Battle3DScene created');
        }

        initialize(width, height) {
            debugLog(`Initializing 3D scene: ${width}x${height}`);

            // Scene
            this.scene = new THREE.Scene();

            // Camera
            this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
            this.camera.position.set(0, config.cameraHeight, config.cameraDistance);
            this.camera.lookAt(0, 1, 0);

            this.renderer = acquireBattleRenderer();
            this._viewW = width;
            this._viewH = height;

            // Resolution scaling: rendering fewer pixels is the single biggest win
            // without a GPU (software rasterizers are fill-rate bound). The PIXI
            // sprite upscales the smaller canvas back to full screen (see
            // create3DSprite), so nothing else needs to change.
            this._renderScale = battleRenderScale(this.renderer);
            this._applyRenderSize();

            // Frame pacing: only redraw the (fill-rate-heavy) 3D pass up to maxFps.
            // animTime still advances by real elapsed time via the clock delta, so
            // poses keep correct timing - we just rasterize + re-upload the texture
            // fewer times (roughly half the cost at 30fps vs a 60fps game loop).
            this._minFrameMs = config.maxFps > 0 ? (1000 / config.maxFps) : 0;
            this._lastRenderMs = 0;
            this._lastDrew = false;

            // Lighting. The day/night rig replaces the old pair of fixed white
            // lights outright rather than sitting on top of them: two suns
            // would wash the tint straight back out.
            if (config.dayNightLighting) {
                this.lighting = new DayNightRig(this.scene, this.renderer, {
                    shadows: false,
                    env: true,
                    // Wide enough to hold the spread row of battlers.
                    radius: ENEMY_SPREAD_HALF_SPAN + 2,
                    groundY: DEFAULT_GROUND_Y,
                });
            } else {
                this.lighting = null;
                const ambientLight = new THREE.AmbientLight(
                    config.ambientLightColor,
                    config.ambientLightIntensity
                );
                this.scene.add(ambientLight);

                const directionalLight = new THREE.DirectionalLight(
                    config.directionalLightColor,
                    config.directionalLightIntensity
                );
                directionalLight.position.set(5, 10, 5);
                this.scene.add(directionalLight);
            }

            debugLog('3D scene initialized successfully');

            // Physics removed: every procedural battler now uses fixed/kinematic
            // animation (idle/attack via FK, death via fade) and ragdoll death is
            // gone, so there is no Cannon.js world to build or step. Families keep
            // their physics-free fallback path because this stays null.
            this.physicsWorld = null;
        }

        // Size the shared canvas for this scene's own view + scale. The renderer
        // outlives the battle, so the size is re-stated here rather than assumed.
        _applyRenderSize() {
            const w = Math.max(1, Math.round(this._viewW * this._renderScale));
            const h = Math.max(1, Math.round(this._viewH * this._renderScale));
            const el = this.renderer.domElement;
            if (el.width !== w || el.height !== h) this.renderer.setSize(w, h, false);
        }

        // The retro downsample is a live setting (Options -> Shader), and it is
        // folded into the canvas size rather than run as its own pass, so a change
        // has to be picked up here. Cheap: one comparison a frame, a resize only
        // when the player actually moved the slider.
        _syncRenderScale() {
            const rs = battleRenderScale(this.renderer);
            if (Math.abs(rs - this._renderScale) < 0.001) return false;
            this._renderScale = rs;
            this._applyRenderSize();
            return true;
        }

        async addModel(key, battlerModel, x, y, z) {
            debugLog(`Adding model: ${key} at position (${x}, ${y}, ${z})`);

            try {
                if (this._disposed || !this.scene) return; // scene torn down before this ran
                const actualY = y + battlerModel.offsetY / 100;
                if (!battlerModel.loaded) {
                    await battlerModel.load(this.physicsWorld, x, actualY, z);
                }
                // load() awaits: the scene may have been disposed meanwhile.
                if (this._disposed || !this.scene) return;

                // Non-bipedal models face slightly left: reparent their content
                // into a yawed wrapper so the family's own animations (which run
                // in local space) are unaffected.
                if (battlerModel.facingYaw && battlerModel.model && !battlerModel._facingApplied) {
                    battlerModel._facingApplied = true;
                    const inner = new THREE.Group();
                    inner.rotation.y = battlerModel.facingYaw;
                    const kids = battlerModel.model.children.slice();
                    for (const k of kids) inner.add(k);
                    battlerModel.model.add(inner);
                }

                // Before anything else reads the tree: fewer materials and
                // fewer meshes means less for the retro pass, the tint and the
                // shadow marker to walk, and far fewer draws once it is on
                // screen. Body parts and animated limbs are left untouched.
                optimiseBattlerModel(battlerModel);

                battlerModel.model.position.set(x, actualY, z);
                const _retro = window.RetroShader ? window.RetroShader.active() : window.PSXShader;
                if (_retro) _retro.applyToObject(battlerModel.model);
                if (battlerModel._overrideTint != null) {
                    applyModelTint(battlerModel.model, battlerModel._overrideTint);
                }
                armModelFades(battlerModel.model);
                this.scene.add(battlerModel.model);
                this.models.set(key, battlerModel);
                if (this.lighting) this.lighting.markCaster(battlerModel.model);

                debugLog(`Model added successfully: ${key}`);

                // Play spawn or idle animation
                if (battlerModel.hasAnimation('spawn')) {
                    battlerModel.playAnimation('spawn', false, () => {
                        battlerModel.playIdleAnimation();
                    });
                } else {
                    battlerModel.playIdleAnimation();
                }
            } catch (error) {
                console.error(`Failed to add model ${key}:`, error);
            }
        }

        removeModel(key) {
            const model = this.models.get(key);
            if (model && model.model) {
                this.scene.remove(model.model);
                disposeObject3DResources(model.model);
                this.models.delete(key);
                debugLog(`Model removed: ${key}`);
            }
        }

        getModel(key) {
            return this.models.get(key);
        }

        hasModels() {
            return this.models.size > 0;
        }

        update() {
            const delta = this.clock.getDelta();
            // No physics step: all battlers animate kinematically. A model that is
            // no longer on the field (its death fade finished and hid the root, or
            // it was talked round and walked off) has nothing left to animate, so
            // it is stepped over rather than posed for the rest of the fight.
            this.models.forEach(model => {
                const root = model && model.model;
                if (root && root.visible === false) return;
                model.update(delta);
            });
        }

        render() {
            this._lastDrew = false;
            // Below 60fps the engine runs the logic two or three times per drawn
            // frame (window.FrameBudget in Core/ParchmentToast.js) and only the
            // last of them reaches the screen, so a whole three.js pass on any
            // of the others is drawn at full price into a frame nobody gets.
            // Like the frame cap below, this leaves the clock alone: the delta
            // rolls into the pass that is actually drawn, so the animation
            // advances by the true elapsed time.
            if (window.FrameBudget && !window.FrameBudget.isPresented()) return;
            // Nothing on the 3D layer (e.g. 2D/Sprites mode, or before models
            // finish loading) -> skip the whole pass. Keep the clock current so
            // the first real frame doesn't get a huge accumulated delta.
            if (this.models.size === 0) { this.clock.getDelta(); return; }
            // Frame-rate cap: skip this pass if we drew too recently. Do NOT touch
            // the clock, so its accumulated delta rolls into the next real frame
            // and animations advance by the true elapsed time when we do draw.
            if (this._minFrameMs > 0) {
                const now = (typeof performance !== 'undefined' && performance.now)
                    ? performance.now() : Date.now();
                if (this._lastRenderMs && (now - this._lastRenderMs) < this._minFrameMs) return;
                this._lastRenderMs = now;
            }
            this._syncRenderScale();
            this.update();
            // After update(), so a light that moved this frame is already in
            // place when the shadow map is told to redraw. Costs one integer
            // compare on the frames the clock has not moved.
            if (this.lighting) this.lighting.update();
            // Straight to the canvas: the retro downsample is already in the canvas
            // size (see battleRenderScale), so PSXShader.render's render-target pass
            // would only re-do the same reduction and blit it back at a cost.
            this.renderer.render(this.scene, this.camera);
            this._lastDrew = true;
        }

        dispose() {
            // Release per-model geometry/materials before dropping references so
            // toggling 3D off (or leaving battle) does not leak GPU memory.
            this.models.forEach(model => {
                if (model && model.model) {
                    if (this.scene) this.scene.remove(model.model);
                    disposeObject3DResources(model.model);
                }
            });
            this.models.clear();
            if (this.lighting) { this.lighting.dispose(); this.lighting = null; }
            // The renderer is deliberately NOT disposed: it is the session's one
            // battle context (see acquireBattleRenderer), and handing it back would
            // throw away the shader programs and texture uploads the next battle is
            // about to ask for again. Clear it so the fight just ended is not left
            // sitting on the canvas for the next one to open on.
            if (this.renderer) {
                try {
                    this.renderer.setRenderTarget(null);
                    this.renderer.clear(true, true, true);
                } catch (e) { /* context already gone */ }
            }
            this._disposed = true;
            debugLog('3D scene disposed');
        }
    }

    // A forced body belongs to the one fight it was armed for: cleared here, so
    // the caller arms it AFTER BattleManager.setup (the way NPCSystem's zombie
    // collision does) and no later battle can inherit it.
    const _BattleManager_setup_battler3DOverride = BattleManager.setup;
    BattleManager.setup = function (troopId, canEscape, canLose) {
        if (typeof $gameTemp !== 'undefined' && $gameTemp) $gameTemp._battler3DOverride = null;
        _BattleManager_setup_battler3DOverride.call(this, troopId, canEscape, canLose);
    };

    //=============================================================================
    // Public API (registry + base class) for family plugins
    //=============================================================================
    window.Battler3D = window.Battler3D || {};
    window.Battler3D.Base = ProceduralBattler3D;
    window.Battler3D.registerArchetype = registerArchetype;
    window.Battler3D.registerNamed = registerNamed;
    // Exposed for the headless draw-call harness (test/test_battle_3d_perf.js).
    window.Battler3D.optimiseModel = optimiseBattlerModel;
    window.Battler3D.facetModel = facetBattlerModel;
    window.Battler3D.debugLog = debugLog;
    // Shared with the first person weapon overlay, which runs its own scene in
    // its own context but must be lit by the same sun. See DayNightRig.
    window.Battler3D.DayNightRig = DayNightRig;
    window.Battler3D.dayNightEnabled = () => config.dayNightLighting;
    window.Battler3D.CREATURE_PROFILES = window.Battler3D.CREATURE_PROFILES || {};

    // Themed texture pools (img/textures) used for per-monster-id texture
    // variation. A profile selects one with `texturePool: '<name>'`; if a profile
    // has none, _pickTexture falls back to the broad 'all' pool, so EVERY
    // procedural battler gets a random surface that varies by monster id.
    window.Battler3D.TEXTURE_POOLS = window.Battler3D.TEXTURE_POOLS || {
        flesh:   ['dusty_pink_stone.jpg', 'peach_stone.jpg', 'tan_pink_marble.jpg', 'mauve_rock.jpg', 'grey_pink_stone.jpg', 'olive_peach_stone.jpg', 'golden_brown_leather.jpg'],
        green:   ['mossy_green_rock.jpg', 'dark_moss_marble.jpg', 'olive_cracked_rock.jpg', 'green_marble.jpg', 'dark_mossy_slate.jpg', 'sage_green_stone.jpg', 'yellow_green_moss_marble.jpg'],
        bone:    ['beige_sandstone.jpg', 'cream_pastel_marble.jpg', 'khaki_stone.jpg', 'mottled_tan_stone.jpg', 'pale_gold_stone.jpg', 'tan_stone.jpg'],
        stone:   ['brown_stone.jpg', 'charcoal_brown_stone.jpg', 'grey_concrete.jpg', 'blue_slate.jpg', 'brown_grey_slate.jpg', 'weathered_concrete.jpg', 'grey_marble.jpg'],
        metal:   ['copper_patina.jpg', 'dark_gold_foil.jpg', 'grey_teal_stone.jpg', 'bright_gold.jpg', 'grey_smoke_marble.jpg', 'molten_gold.jpg', 'rust_copper_marble.jpg'],
        wood:    ['brown_leather_stone.jpg', 'copper_brown_stone.jpg', 'mottled_tan_stone.jpg', 'ochre_watercolor_stone.jpg', 'khaki_stone.jpg', 'warm_brown_cloud_stone.jpg'],
        crystal: ['malachite.jpg', 'emerald_marble.jpg', 'teal_marble.jpg', 'amber_onyx_marble.jpg', 'iridescent_oil.jpg', 'turquoise_verdigris.jpg'],
        void:    ['violet_psychedelic.jpg', 'magenta_psychedelic.jpg', 'crimson_psychedelic.jpg', 'psychedelic_marble.jpg', 'dark_grey_smoke.jpg', 'dark_green_smoke_marble.jpg'],
        fire:    ['fire.jpg', 'molten_gold.jpg', 'burnt_orange_rock.jpg', 'red_marble.jpg', 'rust_copper_marble.jpg', 'crimson_psychedelic.jpg'],
        water:   ['teal_marble.jpg', 'teal_patina_stone.jpg', 'blue_slate.jpg', 'grey_teal_stone.jpg', 'turquoise_verdigris.jpg', 'sage_cloud_marble.jpg'],
        foliage: ['green_marble.jpg', 'sage_green_stone.jpg', 'dark_moss_marble.jpg', 'yellow_green_marble.jpg', 'green_patina_marble.jpg', 'olive_cracked_rock.jpg'],
        pale:    ['cream_pastel_marble.jpg', 'pale_sage_stone.jpg', 'lavender_stucco.jpg', 'tan_cloud_stone.jpg', 'pale_gold_stone.jpg', 'grey_cloud_concrete.jpg'],
        fur:     ['warm_brown_cloud_stone.jpg', 'taupe_cloud_marble.jpg', 'mauve_brown_rock.jpg', 'tan_cloudy_stone.jpg', 'grey_brown_watercolor.jpg', 'khaki_stone.jpg'],
        all:     ['brown_leather_stone.jpg', 'mossy_green_rock.jpg', 'beige_sandstone.jpg', 'grey_concrete.jpg', 'copper_patina.jpg', 'malachite.jpg', 'dusty_pink_stone.jpg', 'teal_marble.jpg', 'mauve_rock.jpg', 'olive_cracked_rock.jpg', 'tan_stone.jpg', 'amber_onyx_marble.jpg']
    };

    // List every registered archetype key (used by the title screen preview).
    window.Battler3D.list = () => Object.keys(ArchetypeRegistry);

    // How big an archetype actually ends up.
    //
    // The registered `scale` is what the model is BUILT at - an orc is 3.1, an
    // ogre 4.2, a plain human 2.6 - and for most archetypes that is also the
    // size it is shown at, so it is the game's own statement of how big the
    // creature is. A family that rescales its models after building them says
    // so with `worldScale`, which wins: the goblinoids are all built at about
    // a human's scale and then stood on a height of their own, so a goblin's
    // 2.5 is not a goblin's size and its worldScale of 1.43 is.
    //
    // Read by the overworld, which has to stand the same creature on real
    // ground beside a party and wants it the size the battle view shows. Zero
    // for a key nobody registered, so a caller can tell "no answer" from
    // "small".
    window.Battler3D.archetypeScale = function (key) {
        const def = ArchetypeRegistry[String(key || '').toLowerCase()];
        if (!def) return 0;
        return Number(def.worldScale) || Number(def.scale) || 1.0;
    };

    // Instantiate a procedural model for a registered archetype. Pass a null
    // battler for decorative previews (no body parts -> no dismemberment), and a
    // null physicsWorld at load() time to use the kinematic (physics-free) pose.
    window.Battler3D.create = function (key, scale, offsetY, battler, weaponType) {
        const k = String(key).toLowerCase();
        const def = ArchetypeRegistry[k];
        if (!def) return null;
        const sc = scale || def.scale || 1.0;
        let wt = weaponType;
        if (wt === undefined) wt = (def.weapon !== undefined ? def.weapon : Math.floor(Math.random() * 12) + 1);
        return def.create(sc, offsetY || 0, battler || null, wt, k);
    };

    // Human-readable label for an archetype key ("hobgoblin" -> "Hobgoblin").
    window.Battler3D.displayName = function (key) {
        const k = String(key || '');
        return k.charAt(0).toUpperCase() + k.slice(1);
    };

    // Resolve a registered archetype key from a raw $dataEnemies entry (meta +
    // name), for UIs like the Bestiary that work with data rather than a live
    // Game_Enemy. Returns null when no archetype matches.
    window.Battler3D.resolveKey = function (enemyData) {
        if (!enemyData) return null;
        return resolveFromData(enemyData.meta || {}, enemyData.name);
    };

    //=============================================================================
    // Locomotion metadata (derived from Enemies.json)
    //=============================================================================
    // Reads an enemy's existing metadata (its <Archetype:>, <Biome:>, <Speed:>,
    // <Movement:> note tags plus its name) and derives HOW it should move on the
    // overworld: the gait (fly / swim / run / walk / idle), a movement-speed tag
    // (0-6) and a movement type (approach / random / fixed / fleeing). Consumers
    // (CamperDrivingSystem, DreamSystem) use this to pick and drive the matching
    // locomotion animation. An explicit <Gait: fly|swim|run|walk|idle> tag (or its
    // <Locomotion:> alias) overrides the derivation for hand-tuned cases.

    // Gait is INTRINSIC to the creature, so it is classified from the enemy's own
    // identity (name + <Archetype:>), NOT its <Biome:> habitat (a bunny on a sky
    // island still walks). Matched against camelCase-split word tokens, so there
    // are no substring false positives like "sea" in "disease".
    const _AQUATIC_TOKENS = new Set(['fish','shark','squid','octopus','kraken','crab',
        'lobster','jelly','jellyfish','eel','seahorse','whale','dolphin','siren','merfolk',
        'mermaid','aquatic','tide','tidal','coral','abyssal','leviathan','nautilus','shrimp',
        'sardine','catfish','marine','naga','manta','turtle','tortoise','frog','toad','newt',
        'axolotl','tadpole','anemone','barnacle','crustacean','urchin','starfish','piranha',
        'carp','koi','sushi','tuna','salmon','brine','abyss','deepsea','pufferfish','guppy',
        'tentacler','tentacled','hydromancer','tidecaller','seadragon','parrotfish','reef']);
    const _FLYING_TOKENS = new Set(['bird','bat','ghost','wisp','sprite','fairy','pixie',
        'phoenix','dragonfly','moth','harpy','banshee','djinn','djinni','wraith','seraph',
        'angel','cherub','winged','wing','flying','pegasus','wyvern','griffin','gryphon',
        'beholder','willowisp','ophanim','sylph','jay','crow','raven','owl','eagle','hawk',
        'vulture','falcon','flamingo','mosquito','gnat']);
    // Archetype strings (lowercased) that are decisively air/water dwellers.
    const _AQUATIC_ARCHES = new Set(['aquaticfish','octopus','tentacledcreature','crustacean',
        'abyssalleviathan','waterelemental','amphibian','frog','snail']);
    const _FLYING_ARCHES = new Set(['bird','bat','ghost','phoenix','fairy','angel','ophanim',
        'drone','airelemental','stormelemental']);

    function _tokenSet(name, arche) {
        const s = new Set();
        for (const src of [name, arche]) {
            for (const tok of creatureNameTokens(src)) s.add(tok);
        }
        return s;
    }

    function _metaVal(meta, note, keys) {
        if (meta) { for (const k of keys) { if (meta[k] != null) return String(meta[k]); } }
        if (note) {
            for (const k of keys) {
                const m = note.match(new RegExp('<' + k + ':\\s*([^>]+)>', 'i'));
                if (m) return m[1];
            }
        }
        return null;
    }

    // Derive { gait, speed, movement } from any $dataEnemies entry.
    window.Battler3D.resolveLocomotion = function (enemyData) {
        const meta = (enemyData && enemyData.meta) || {};
        const note = (enemyData && enemyData.note) || '';
        const name = (enemyData && enemyData.name) || '';
        const arche = String(_metaVal(meta, note, ['Archetype']) || '').trim().toLowerCase();

        let speed = parseInt(_metaVal(meta, note, ['Speed']), 10);
        if (isNaN(speed)) speed = 3;
        let movement = String(_metaVal(meta, note, ['Movement']) || 'random').trim().toLowerCase();
        if (['approach', 'random', 'fixed', 'fleeing'].indexOf(movement) < 0) movement = 'random';

        // Explicit override tag wins.
        let gait = String(_metaVal(meta, note, ['Gait', 'Locomotion']) || '').trim().toLowerCase();
        if (['fly', 'swim', 'run', 'walk', 'idle'].indexOf(gait) < 0) {
            const toks = _tokenSet(name, arche);
            const anyTok = (set) => { for (const t of toks) if (set.has(t)) return true; return false; };
            const isAquatic = _AQUATIC_ARCHES.has(arche) || anyTok(_AQUATIC_TOKENS);
            const isFlying  = _FLYING_ARCHES.has(arche) || anyTok(_FLYING_TOKENS);
            if (isAquatic) gait = 'swim';                 // water precedence (sea dragons swim)
            else if (isFlying) gait = 'fly';
            else if (movement === 'fixed') gait = 'idle'; // rooted creatures (turrets, totems)
            else if (speed >= 5 || movement === 'fleeing') gait = 'run';
            else gait = 'walk';
        }
        return { gait, speed, movement };
    };

    // Gait -> decorative overworld movement speed (world units / second).
    window.Battler3D.gaitMoveSpeed = function (speedTag, gait) {
        let s = Number(speedTag); if (isNaN(s)) s = 3;
        const base = 7 + s * 5;   // ~12 (slow) .. 37 (fastest) units/s
        const mul = gait === 'run' ? 1.7 : gait === 'fly' ? 1.3 : gait === 'swim' ? 1.15 : 1.0;
        return base * mul;
    };

    // Convenience for callers that only have a registered model KEY (e.g. the
    // DreamSystem, which picks a random archetype rather than a specific enemy).
    // Model keys are lowercase concatenations with no word boundaries
    // ("giantjellyfish", "frozenbat"), so this substring-matches the gait tokens
    // (length >= 4 to avoid noise) rather than tokenising. Returns fly/swim/walk.
    window.Battler3D.gaitForKey = function (key) {
        const k = String(key || '').toLowerCase();
        // length >= 5 so short roots ("moth", "crow", "bat") can't false-match
        // inside unrelated keys ("mammoth", "scarecrow", "combat").
        const sub = (set) => { for (const w of set) { if (w.length >= 5 && k.indexOf(w) >= 0) return true; } return false; };
        if (sub(_AQUATIC_TOKENS)) return 'swim';
        if (sub(_FLYING_TOKENS)) return 'fly';
        if (/bat$/.test(k)) return 'fly';   // "...bat" (bats are common flyers)
        return 'walk';
    };

    //=============================================================================
    // World / generation seed
    //=============================================================================
    // A seed that re-rolls every enemy's id-derived look (skin texture, colour,
    // and body proportions) so the SAME species renders differently from one
    // world seed to the next. The canonical default "esoteric" hashes to 0, a
    // no-op that reproduces the baseline appearance and default textures.
    // Set it BEFORE creating a model (each Battler3D.create reads it at build
    // time); rebuild existing models to apply a new seed.
    window.Battler3D._genSeed = window.Battler3D._genSeed || 'esoteric';
    window.Battler3D.getGenSeed = function () { return window.Battler3D._genSeed || 'esoteric'; };
    window.Battler3D.setGenSeed = function (seed) {
        window.Battler3D._genSeed = (seed == null || seed === '') ? 'esoteric' : String(seed);
        return window.Battler3D._genSeed;
    };
    // 0 for the default "esoteric" seed (identity/no-op), otherwise a stable hash.
    window.Battler3D.genSeedHash = function () {
        const s = window.Battler3D.getGenSeed();
        return (s === 'esoteric') ? 0 : (_strHash(s) >>> 0);
    };

    //=============================================================================
    // Procedural hair
    //=============================================================================
    // STATIC geometry only: hair is built once as part of the head and never
    // touched again -- no bones, no per-frame update, no physics. It therefore
    // costs nothing to animate and can never lag behind or clip through the body
    // the way a simulated strand would.
    //
    // Every shape is built for a head sphere of radius `r` centred on the
    // parent's origin and facing +Z, so one style key means the same thing in
    // every family AND in the player's character creator.
    //
    // 'helmet' is deliberately part of the STYLE pool rather than a separate
    // concept: a rolled head can still come up armoured. build() returns null
    // for it (and for 'bald') so each family draws its own helmet art.
    const HAIR_STYLES = ['short', 'crop', 'bob', 'long', 'ponytail', 'topknot',
                         'braids', 'mohawk', 'afro', 'dreads', 'spiky', 'bald', 'helmet'];
    const HAIR_WEIGHTS = [14, 10, 7, 9, 8, 6, 5, 4, 4, 4, 6, 5, 8];  // parallel to HAIR_STYLES
    const HAIR_COLORS = [
        { key: 'black',    hex: 0x1a1512 }, { key: 'darkbrown', hex: 0x3a2418 },
        { key: 'brown',    hex: 0x5c3b22 }, { key: 'chestnut',  hex: 0x7a4a26 },
        { key: 'auburn',   hex: 0x8c3a1c }, { key: 'ginger',    hex: 0xc0561e },
        { key: 'blond',    hex: 0xd6b45c }, { key: 'sandy',     hex: 0xb99a63 },
        { key: 'platinum', hex: 0xe6dfc6 }, { key: 'ash',       hex: 0x9a958c },
        { key: 'grey',     hex: 0xb6b2ac }, { key: 'white',     hex: 0xe8e8e4 },
        // Exotic tail of the list, only drawn when the caller opts in.
        { key: 'moss',     hex: 0x4a6a3a }, { key: 'ink',       hex: 0x2a2a4a },
        { key: 'wine',     hex: 0x5a1c2e }, { key: 'teal',      hex: 0x2a6a6a }
    ];
    const HAIR_NATURAL = 12;   // how many of HAIR_COLORS are ordinary hair colours

    // Pick a style + colour from a 0..1 RNG. Feed it a SEEDED stream (the base's
    // idRand, keyed to enemy id + world seed) and every enemy id keeps its own
    // hair while a new world seed re-rolls the whole cast.
    // opts.noHelmet drops the armoured roll; opts.exotic opens the unnatural colours.
    // idRand and its siblings are |sin| streams, so their values pile up near 0
    // and 1 (an arcsine distribution). Fed straight into a weighted pick that
    // would skew hard toward the FIRST and LAST entry of the list -- a cast of
    // nothing but crops and helmets. Taking the fraction of a large-prime
    // multiple whitens the draw back to near-uniform without touching the
    // shared stream (which every existing model's proportions depend on).
    function hairUniform(rand) {
        const x = rand() * 9973;
        return x - Math.floor(x);
    }

    function rollHair(rand, opts) {
        opts = opts || {};
        const skip = (s) => (opts.noHelmet && s === 'helmet');
        let total = 0;
        for (let i = 0; i < HAIR_STYLES.length; i++) if (!skip(HAIR_STYLES[i])) total += HAIR_WEIGHTS[i];
        let n = hairUniform(rand) * total, style = HAIR_STYLES[0];
        for (let i = 0; i < HAIR_STYLES.length; i++) {
            if (skip(HAIR_STYLES[i])) continue;
            n -= HAIR_WEIGHTS[i];
            if (n <= 0) { style = HAIR_STYLES[i]; break; }
        }
        const pool = opts.exotic ? HAIR_COLORS.length : HAIR_NATURAL;
        const c = HAIR_COLORS[Math.min(pool - 1, Math.floor(hairUniform(rand) * pool))];
        return { style: style, color: c.hex, colorKey: c.key };
    }

    function hairColorHex(key) {
        for (const c of HAIR_COLORS) if (c.key === key) return c.hex;
        return HAIR_COLORS[2].hex;
    }

    // Build one style. `mat` is supplied by the caller so the family keeps its
    // own material bookkeeping (death fade, skin tinting). Returns null when the
    // style has no hair geometry of its own.
    function buildHair(style, r, mat) {
        if (typeof THREE === 'undefined' || !style || style === 'bald' || style === 'helmet') return null;
        r = r || 0.3;
        const g = new THREE.Group();
        const M = (geo) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
        // Skullcap: `theta` is how far down the sphere it wraps (0.5 = to the
        // equator), `grow` how far it sits proud of the scalp.
        const cap = (theta, grow) => {
            const c = M(new THREE.SphereGeometry(r * (grow || 1.10), 14, 12, 0, Math.PI * 2, 0, Math.PI * theta));
            c.position.y = r * 0.04; return c;
        };
        switch (style) {
            case 'short': cap(0.54); break;
            case 'crop': {                       // cap + a blunt squared fringe
                cap(0.5);
                const f = M(new THREE.BoxGeometry(r * 1.45, r * 0.3, r * 0.5));
                f.position.set(0, r * 0.56, r * 0.72);
                break;
            }
            case 'bob': {                        // chin-length, straight sides
                cap(0.62, 1.11);
                for (const sx of [-1, 1]) {
                    const p = M(new THREE.BoxGeometry(r * 0.32, r * 1.0, r * 1.2));
                    p.position.set(sx * r * 0.92, -r * 0.34, -r * 0.04);
                }
                const b = M(new THREE.BoxGeometry(r * 1.5, r * 0.95, r * 0.32));
                b.position.set(0, -r * 0.32, -r * 0.9);
                break;
            }
            case 'long': {                       // curtain down past the shoulders
                cap(0.6, 1.10);
                const b = M(new THREE.BoxGeometry(r * 1.5, r * 2.1, r * 0.36));
                b.position.set(0, -r * 1.0, -r * 0.88);
                for (const sx of [-1, 1]) {
                    const p = M(new THREE.BoxGeometry(r * 0.28, r * 1.5, r * 0.85));
                    p.position.set(sx * r * 0.95, -r * 0.6, -r * 0.24);
                }
                break;
            }
            case 'ponytail': {
                cap(0.56);
                const tie = M(new THREE.TorusGeometry(r * 0.17, r * 0.05, 6, 10));
                tie.position.set(0, r * 0.34, -r * 1.0); tie.rotation.x = Math.PI / 2;
                const t = M(new THREE.CylinderGeometry(r * 0.15, r * 0.07, r * 1.35, 6));
                t.position.set(0, -r * 0.24, -r * 1.28); t.rotation.x = 0.45;
                break;
            }
            case 'topknot': {
                cap(0.5);
                const bun = M(new THREE.SphereGeometry(r * 0.3, 10, 8));
                bun.position.set(0, r * 1.18, -r * 0.08);
                const band = M(new THREE.TorusGeometry(r * 0.2, r * 0.045, 6, 10));
                band.position.set(0, r * 0.92, -r * 0.06); band.rotation.x = Math.PI / 2;
                break;
            }
            case 'braids': {
                cap(0.56);
                for (const sx of [-1, 1]) {
                    let y = -r * 0.1, br = r * 0.15;
                    for (let i = 0; i < 4; i++) {
                        const s = M(new THREE.SphereGeometry(br, 8, 7));
                        s.position.set(sx * r * 0.88, y, -r * 0.05);
                        y -= r * 0.3; br *= 0.9;
                    }
                }
                break;
            }
            case 'mohawk': {                     // shaved sides, ridge down the middle
                for (let i = 0; i < 7; i++) {
                    const u = i / 6;                                  // 0 = back, 1 = front
                    const h = r * (0.34 + Math.sin(u * Math.PI) * 0.5);
                    const s = M(new THREE.ConeGeometry(r * 0.13, h, 5));
                    s.position.set(0, r * (0.92 + h / (2 * r) - 0.1), r * (-0.72 + u * 1.44));
                }
                break;
            }
            case 'afro': {
                const a = M(new THREE.SphereGeometry(r * 1.4, 14, 12));
                a.position.y = r * 0.18; a.scale.set(1, 0.94, 1);
                break;
            }
            case 'dreads': {
                cap(0.5);
                for (let i = 0; i < 9; i++) {
                    const ang = (i / 9) * Math.PI * 2;
                    const d = M(new THREE.CylinderGeometry(r * 0.09, r * 0.07, r * 1.25, 5));
                    d.position.set(Math.cos(ang) * r * 0.78, -r * 0.5, Math.sin(ang) * r * 0.78 - r * 0.1);
                    d.rotation.z = Math.cos(ang) * 0.18; d.rotation.x = -Math.sin(ang) * 0.18;
                }
                break;
            }
            case 'spiky': {
                cap(0.48);
                for (let i = 0; i < 8; i++) {
                    const ang = (i / 8) * Math.PI * 2, lean = 0.45;
                    const s = M(new THREE.ConeGeometry(r * 0.11, r * 0.62, 5));
                    s.position.set(Math.cos(ang) * r * 0.5, r * 0.95, Math.sin(ang) * r * 0.5);
                    s.rotation.z = -Math.cos(ang) * lean; s.rotation.x = Math.sin(ang) * lean;
                }
                break;
            }
            default: return null;
        }
        return g;
    }

    window.Battler3D.Hair = {
        STYLES: HAIR_STYLES.slice(),
        COLORS: HAIR_COLORS.map(c => ({ key: c.key, hex: c.hex })),
        COLOR_KEYS: HAIR_COLORS.map(c => c.key),
        NATURAL_COLORS: HAIR_NATURAL,
        roll: rollHair,
        colorHex: hairColorHex,
        build: buildHair
    };

    //=============================================================================
    // Per-event appearance identity
    //=============================================================================
    // Each battle gets an "origin seed" derived from the map + the event that
    // started it (BSE startBattle or a normal RPG Maker Battle Processing on an
    // event). Models fold this into their per-id variation so the SAME enemy
    // event always renders identically when re-fought, while the same enemy id
    // at a DIFFERENT event/coords looks slightly different. 0 = no event context
    // (bestiary/title) -> a stable canonical look per enemy id.
    window.Battler3D._battleOriginSeed = 0;

    // Every fight also rolls its OWN look seed, which stands in for the world
    // generation seed for as long as the battle runs: the monsters the party
    // meets in the field are not one look per species handed down by the world,
    // each one is its own creature. The roll is kept against the event that
    // started the fight (in the save), so a monster fled from is wearing the
    // same body when the party runs into it again -- that same event, not just
    // another monster out of the same troop. A fight with no event behind it (a
    // plain random encounter) rolls fresh every time and remembers nothing.
    window.Battler3D._battleLookSeed = 0;
    window.Battler3D._battleOriginKey = '';

    function _randomLookSeed() {
        return (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
    }

    function _lookSeedStore() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
        if (!$gameSystem._b3dLookSeeds) $gameSystem._b3dLookSeeds = {};
        return $gameSystem._b3dLookSeeds;
    }

    // How many fled-from monsters are remembered. Only a fight that was NOT won
    // leaves an entry behind, so the list grows slowly; past the cap the oldest
    // rolls are let go and those monsters are strangers again.
    const LOOK_SEED_MEMORY = 400;

    function _lookSeedFor(key) {
        const store = key ? _lookSeedStore() : null;
        if (!store) return _randomLookSeed();
        if (!store[key]) {
            const keys = Object.keys(store);
            for (let i = 0; i <= keys.length - LOOK_SEED_MEMORY; i++) delete store[keys[i]];
            store[key] = _randomLookSeed();
        }
        return store[key] >>> 0;
    }

    // What a model actually folds in as its generation seed. A seed somebody
    // asked for by name always wins: the bestiary, the creature wizard and the
    // viewer each set one around the model they are about to build, and they
    // must get the creature they asked for even mid-fight. With none set (the
    // whole of ordinary play, where the seed stays at its default) it is the
    // running battle's own roll, and 0 -- the canonical look -- outside battle.
    window.Battler3D.lookSeedHash = function () {
        const g = window.Battler3D.genSeedHash ? window.Battler3D.genSeedHash() : 0;
        if (g) return g;
        return (window.Battler3D._battleLookSeed || 0) >>> 0;
    };

    // The identity of the body a battler is wearing right now, small enough to
    // be written onto an actor and read back later: a monster recruited out of
    // a fight keeps the body it was talked to in, on the status sheet and in
    // the Empathize panel.
    window.Battler3D.currentLook = function (index) {
        return {
            seed: (window.Battler3D._battleLookSeed || 0) >>> 0,
            origin: (window.Battler3D._battleOriginSeed || 0) >>> 0,
            index: index || 0
        };
    };

    // Build something with a recorded look instead of the current one.
    window.Battler3D.withLook = function (look, fn) {
        const B = window.Battler3D;
        if (!look || (!look.seed && !look.origin)) return fn();
        const ps = B._battleLookSeed, po = B._battleOriginSeed;
        B._battleLookSeed = (look.seed || 0) >>> 0;
        B._battleOriginSeed = (look.origin || 0) >>> 0;
        try { return fn(); } finally { B._battleLookSeed = ps; B._battleOriginSeed = po; }
    };

    function _strHash(s) {
        s = String(s);
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    // Which monster event this fight belongs to. Empty when there is nothing
    // stable behind the battle: a plain random encounter, a preview.
    function computeBattleOriginKey(pending) {
        try {
            // The battle system names the map event a fight was set up against
            // (the same identity it keys that monster's kept HP on) and drops
            // the name when the fight ends, so it is both the most accurate
            // answer and the only one that cannot be left over from before.
            const st = window.BattleSystemEnhanced && window.BattleSystemEnhanced.State;
            if (st && st.currentBattleEventId) return String(st.currentBattleEventId);
            // A vanilla Battle Processing knows its own event, parallel ones
            // included, and said so on the way in.
            if (pending) return String(pending);
            // Otherwise whichever event is running the trigger.
            const mapId = ($gameMap && $gameMap.mapId) ? $gameMap.mapId() : 0;
            const evId = ($gameMap && $gameMap._interpreter) ? ($gameMap._interpreter._eventId || 0) : 0;
            if (!evId || !mapId) return '';
            return mapId + ':' + evId;
        } catch (e) {
            return '';
        }
    }

    // Vanilla "Battle Processing" runs inside an interpreter that knows its exact
    // event (even parallel events). Capture that as a pending origin so the same
    // event always yields the same seed.
    const _GameInterpreter_command301 = Game_Interpreter.prototype.command301;
    Game_Interpreter.prototype.command301 = function(params) {
        if (this._eventId && $gameMap && $gameMap.mapId) {
            window.Battler3D._pendingOrigin = $gameMap.mapId() + ':' + this._eventId;
        }
        return _GameInterpreter_command301.call(this, params);
    };

    const _BattleManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        const key = computeBattleOriginKey(window.Battler3D._pendingOrigin);
        window.Battler3D._pendingOrigin = '';
        window.Battler3D._battleOriginKey = key;
        window.Battler3D._battleOriginSeed = key ? _strHash(key) : 0;
        window.Battler3D._battleLookSeed = _lookSeedFor(key);
        _BattleManager_setup.call(this, troopId, canEscape, canLose);
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        // Won: that creature is dead, so its roll is dropped and whatever
        // stands on the spot next is a body of its own. A flee or a loss keeps
        // it, because the same monster is still out there waiting.
        if (result === 0 && window.Battler3D._battleOriginKey) {
            const store = _lookSeedStore();
            if (store) delete store[window.Battler3D._battleOriginKey];
        }
        window.Battler3D._battleOriginSeed = 0; // canonical look again outside battle
        window.Battler3D._battleLookSeed = 0;
        window.Battler3D._battleOriginKey = '';
        _BattleManager_endBattle.call(this, result);
    };

    //=============================================================================
    // Spriteset_Battle Integration
    //=============================================================================

    const _Spriteset_Battle_initialize = Spriteset_Battle.prototype.initialize;
    Spriteset_Battle.prototype.initialize = function() {
        this._battle3DScene = null;
        this._battle3DCanvas = null;
        this._battle3DSprite = null;
        debugLog('Spriteset_Battle initialize');
        _Spriteset_Battle_initialize.call(this);
    };

    const _Spriteset_Battle_createLowerLayer = Spriteset_Battle.prototype.createLowerLayer;
    Spriteset_Battle.prototype.createLowerLayer = function() {
        _Spriteset_Battle_createLowerLayer.call(this);
        this.create3DScene();
        this.create3DSprite();
    };

    Spriteset_Battle.prototype.create3DScene = function() {
        debugLog('Creating 3D scene');
        this._battle3DScene = new Battle3DScene();
        this._battle3DScene.initialize(Graphics.width, Graphics.height);
        debugLog('3D scene created');
    };

    Spriteset_Battle.prototype.create3DSprite = function() {
        if (!this._battle3DScene) return;

        debugLog('Creating 3D sprite container');

        // Create a PIXI sprite from the Three.js canvas. The canvas belongs to the
        // session-wide battle renderer, so PIXI.Texture.from returns the SAME
        // texture every battle (keyed on the canvas) and the upload survives with
        // it; only its declared size has to be restated when the render scale or
        // the game resolution moved between fights.
        const canvas = this._battle3DScene.renderer.domElement;
        const texture = PIXI.Texture.from(canvas);
        const base = texture.baseTexture;
        // Nearest sampling: the canvas is rendered at the retro/perf scale and the
        // sprite blows it back up, which is exactly the upscale PSXShader's own
        // blit used to do. Smoothing it here would sand the pixels back off.
        base.scaleMode = PIXI.SCALE_MODES.NEAREST;
        if (base.realWidth !== canvas.width || base.realHeight !== canvas.height) {
            base.setRealSize(canvas.width, canvas.height);
        }
        this._battle3DSprite = new PIXI.Sprite(texture);

        // The canvas is full-resolution (Graphics.width x Graphics.height), but
        // _battleField is offset by (Graphics.width - boxWidth)/2 horizontally and
        // by battleFieldOffsetY() vertically. Negate that offset so the canvas maps
        // to the actual screen and a model at world x=0 lands at true screen center.
        this._battle3DSprite.x = -this._battleField.x;
        this._battle3DSprite.y = -this._battleField.y;

        // When the 3D scene renders at a reduced internal resolution (no-GPU perf
        // path), its canvas is smaller than the screen. Scale the sprite up from
        // its top-left origin so the smaller canvas still covers the full field;
        // screen-projection math (getBattlerPartPosition) is unaffected since it
        // works in full Graphics.width/height space plus this sprite offset.
        const rs = this._battle3DScene._renderScale || 1;
        this._battle3DSpriteScale = rs;
        if (rs !== 1) this._battle3DSprite.scale.set(1 / rs, 1 / rs);

        // Add to the battleback layer so it renders in the correct order
        this._battleField.addChild(this._battle3DSprite);

        debugLog('3D sprite added to battle field');
    };

    const _Spriteset_Battle_createEnemies = Spriteset_Battle.prototype.createEnemies;
    Spriteset_Battle.prototype.createEnemies = function() {
        _Spriteset_Battle_createEnemies.call(this);
        // Built on the next tick rather than a tenth of a second later. The delay
        // was there to be sure the 2D sprites had been positioned, but
        // Sprite_Enemy#setBattler already calls setHome (which positions them) as
        // it is created, so everything create3DEnemies reads is standing by the
        // time createEnemies returns; waiting six frames only held the monsters
        // off the field. Still a timer, so a fast scene change can cancel it (see
        // destroy) before it fires against a disposed scene.
        this._create3DEnemiesTimer = setTimeout(() => {
            this._create3DEnemiesTimer = null;
            this.create3DEnemies();
        }, 0);
    };

    // A pack is drawn slightly smaller than the same creature met alone. Three
    // or four monsters at their solo size fill the field edge to edge, and the
    // spread (spreadEnemyModels) can only answer that by squeezing them into
    // each other's air; taking a little off every model first buys that room
    // back and leaves the fight readable. Gentle on purpose: a duo is barely
    // touched, and nothing ever drops below TROOP_SCALE_FLOOR of its natural
    // size, so a big monster still reads as a big monster. Applied at build time
    // (create3DEnemies), so spreadEnemyModels measures the size the creature is
    // actually drawn at and the HUD's compact bars land on its real feet.
    const TROOP_SCALE_STEP = 0.93;  // compounded per monster past the first
    const TROOP_SCALE_FLOOR = 0.72;

    function troopScaleFactor(count) {
        if (!(count > 1)) return 1;
        return Math.max(TROOP_SCALE_FLOOR, Math.pow(TROOP_SCALE_STEP, count - 1));
    }

    Spriteset_Battle.prototype.create3DEnemies = function() {
        // Scene may have been disposed/nulled between the setTimeout and now.
        if (!this._battle3DScene || this._battle3DScene._disposed) return;
        // A sprite field never moves after it is built, so it counts as settled.
        this._3dEnemyLayoutSettled = false;
        // Only render 3D enemy models when the Enemy Battlers option is set to
        // 3D (1). In Sprites (2) mode, leave the enemy's own <Char:> sprite up.
        if (typeof ConfigManager !== 'undefined' &&
            ConfigManager.enemyBattlers !== undefined &&
            ConfigManager.enemyBattlers !== 1) {
            debugLog('Enemy Battlers not in 3D mode; skipping 3D enemies');
            this._3dEnemyLayoutSettled = true;
            return;
        }

        debugLog('Creating 3D enemies');

        const enemies = $gameTroop.members();
        const pending = [];

        // Pre-count procedural creatures so we can spread them across the field.
        const procCount = enemies.filter(e => battleArchetype(e)).length;
        let procSlot = 0;

        // A crowd is drawn a little smaller than a lone monster (see
        // troopScaleFactor). Counted over the creatures that actually get a
        // model, so a troop member with no 3D body never shrinks the ones beside
        // it. Every model in the fight takes the same factor, procedural or
        // authored GLB, so the troop keeps its relative sizes.
        const modelCount = enemies.filter(
            e => battleArchetype(e) || e.enemy().meta['3d_model']
        ).length;
        const crowdScale = troopScaleFactor(modelCount);

        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            const data = enemy.enemy().meta;
            const archetypeKey = battleArchetype(enemy);
            const def = archetypeKey ? ArchetypeRegistry[archetypeKey] : null;

            debugLog(`Enemy ${i}:`, enemy.enemy().name, 'Archetype:', archetypeKey, 'Meta:', data);

            if (def || data['3d_model']) {
                let scale = Number(data['3d_scale'] || 0);
                if (!scale) scale = def ? (def.scale || 1.0) : 1.0; // per-archetype default
                scale *= crowdScale;
                const offsetY = Number(data['3d_offset_y'] || 0);

                let battlerModel;
                if (def) {
                    debugLog(`Configuring procedural ${archetypeKey} enemy`);

                    // Resolve weapon type: explicit meta wins; else the archetype
                    // default (0 = none); else a random melee/ranged type.
                    let weaponType;
                    const weaponTypeMeta = data['weaponType'];
                    if (weaponTypeMeta !== undefined) {
                        weaponType = parseInt(String(weaponTypeMeta).trim());
                        if (isNaN(weaponType)) weaponType = Math.floor(Math.random() * 12) + 1;
                    } else if (def.weapon !== undefined) {
                        weaponType = def.weapon;
                    } else {
                        weaponType = Math.floor(Math.random() * 12) + 1;
                    }

                    battlerModel = def.create(scale, offsetY, enemy, weaponType, archetypeKey);
                    // A forced body is a forced colour too (see battleOverride):
                    // the tint is applied once the model has built itself, in
                    // Battle3DScene.addModel.
                    const ov = battleOverride();
                    if (battlerModel && ov && ov.tint != null) battlerModel._overrideTint = ov.tint;
                } else {
                    const filename = data['3d_model'];
                    debugLog(`Configuring 3D enemy: ${filename}`);
                    battlerModel = new BattlerModel3D(filename, scale, offsetY);
                }

                // MZ sorts _enemySprites by spriteId/screen-y, so it is NOT aligned
                // with troop-member order (enemies[i]). Match the sprite by its
                // battler so the correct 2D sprite is hidden / read for GLB fallback.
                const sprite = this._enemySprites.find(s => s && (s._battler || s._enemy) === enemy);
                if (!sprite) {
                    console.error(`Enemy sprite for troop index ${i} not found!`);
                    continue;
                }

                let posX, posY, posZ = 0;
                if (def) {
                    // Spread multiple procedural creatures evenly around centre.
                    // This is only the opening guess: spreadEnemyModels re-lays
                    // them out by their measured width once they have loaded.
                    if (procCount === 3) {
                        const trioGuess = [
                            { x: -4.5, z: -4.5 },
                            { x: 0,    z: 0 },
                            { x: 4.5,  z: -4.5 }
                        ];
                        const slot = trioGuess[procSlot] || { x: 0, z: 0 };
                        posX = slot.x;
                        posZ = slot.z;
                        posY = -1.5;
                        procSlot++;
                    } else {
                        posX = procCount > 1 ? (procSlot - (procCount - 1) / 2) * ENEMY_SPREAD_GUESS : 0;
                        posY = -1.5;
                        posZ = 0;
                        procSlot++;
                    }
                } else {
                    posX = (sprite.x / Graphics.width) * 4 - 2;
                    posY = -((sprite.y / Graphics.height) * 4 - 2);
                    posZ = 0;
                }

                debugLog(`Enemy ${i} 3D pos: (${posX}, ${posY}, ${posZ})`);

                pending.push(this._battle3DScene.addModel(`enemy_${i}`, battlerModel, posX, posY, posZ));

                // Hide 2D sprite
                sprite.hide();
                debugLog(`Enemy sprite ${i} hidden`);
            }
        }

        // Models load asynchronously. After they all resolve, run the spread
        // pass immediately (settles geometry-free/inline procedural models that
        // are already in the scene), then once more on the next animation frame
        // (so GLB-loaded geometry bounding boxes are fully measurable).
        Promise.all(pending).then(() => {
            this.spreadEnemyModels();
            // Second pass on the next frame: some GLB models or procedural
            // sub-meshes only land in the scene graph after the first render tick,
            // so a deferred re-spread catches them and produces a clean layout.
            requestAnimationFrame(() => {
                if (this._battle3DScene && !this._battle3DScene._disposed) {
                    this.spreadEnemyModels();
                }
            });
        });
    };

    // A troop used to stand on a fixed 2.4-unit pitch, which a big creature
    // (a coyote is some three units across) simply grew through: two monsters
    // ended up drawn one inside the other. Lay the procedural models out by the
    // width they actually measure, leaving real air between neighbours, and keep
    // the row inside what the 45 degree camera sees at the creatures' plane.
    // Z-depth stagger applied per procedural slot so that even if x-spread
    // produces a very tight result, same-species enemies read as separate models.
    const ENEMY_SPREAD_Z_STEP = 0.6; // depth step per slot (rear = higher z index)

    const ENEMY_SPREAD_GUESS = 4.2; // opening pitch, before anything is measured
    const ENEMY_SPREAD_GAP = 1.6;   // clear air between two neighbours
    const ENEMY_SPREAD_HALF_SPAN = 5.6;
    const ENEMY_SPREAD_FALLBACK_W = 2.2; // for a model that measures as nothing

    // A row of three or more used the whole half-span, which walks the outer
    // creatures out under the battle log running across the middle of the
    // screen. From three up the line is pulled in towards the centre instead,
    // and the air between neighbours with it, so the whole pack stands in the
    // clear band the log leaves; the z stagger below is what keeps them apart.
    const ENEMY_SPREAD_PACK_FROM = 3;
    const ENEMY_SPREAD_PACK_SPAN = 0.72; // of the half-span, for a pack
    const ENEMY_SPREAD_PACK_GAP = 0.55;  // of the gap, for a pack

    function spreadHalfSpan(count) {
        return count >= ENEMY_SPREAD_PACK_FROM
            ? ENEMY_SPREAD_HALF_SPAN * ENEMY_SPREAD_PACK_SPAN
            : ENEMY_SPREAD_HALF_SPAN;
    }

    function spreadGap(count) {
        return count >= ENEMY_SPREAD_PACK_FROM
            ? ENEMY_SPREAD_GAP * ENEMY_SPREAD_PACK_GAP
            : ENEMY_SPREAD_GAP;
    }
    let _spreadBoxScratch = null;        // one box, reused (the pass runs twice)

    Spriteset_Battle.prototype.spreadEnemyModels = function() {
        const scene3d = this._battle3DScene;
        if (!scene3d || scene3d._disposed || typeof THREE === 'undefined') return;

        const enemies = $gameTroop.members();
        const row = [];
        let zSlot = 0;
        const box = _spreadBoxScratch || (_spreadBoxScratch = new THREE.Box3());
        for (let i = 0; i < enemies.length; i++) {
            // Enemies placed from their 2D slot (authored GLB models) keep the
            // troop layout they were given; only the procedural row is spread.
            if (!resolveArchetype(enemies[i])) continue;
            const battlerModel = scene3d.getModel(`enemy_${i}`);
            const root = battlerModel && battlerModel.model;
            if (!root) continue;
            box.setFromObject(root);
            const measured = box.isEmpty() ? 0 : box.max.x - box.min.x;
            const width = isFinite(measured) && measured > 0.05 ? measured : ENEMY_SPREAD_FALLBACK_W;
            // A model whose geometry is not centred on its root would drift when
            // placed by centre, so carry the offset and take it back out below.
            const centerOffset = box.isEmpty() ? 0 : (box.max.x + box.min.x) / 2 - root.position.x;
            // Apply a z-depth stagger so overlapping enemies are always distinct.
            root.position.z = zSlot * ENEMY_SPREAD_Z_STEP;
            row.push({ root, width, centerOffset, battlerModel });
            zSlot++;
        }

        if (row.length === 3) {
            // Triangle formation when facing 3 enemies:
            // 1 front-center flanked by 2 rear enemies (left flank, right flank at red X positions)
            const trio = [
                { x: -4.5, z: -4.5 },
                { x: 0,    z: 0 },
                { x: 4.5,  z: -4.5 }
            ];
            for (let idx = 0; idx < 3; idx++) {
                const e = row[idx];
                const pos = trio[idx];
                e.root.position.x = pos.x - e.centerOffset;
                e.root.position.z = pos.z;
                if (e.battlerModel) e.battlerModel._baseX = e.root.position.x;
            }
            debugLog(`Positioned 3 enemy models in triangle formation`);
        } else if (row.length > 1) {
            const totalW = row.reduce((sum, e) => sum + e.width, 0);
            const maxSpan = spreadHalfSpan(row.length) * 2;
            let gap = spreadGap(row.length);
            if (totalW + gap * (row.length - 1) > maxSpan) {
                gap = Math.max(0.15, (maxSpan - totalW) / (row.length - 1));
            }
            const span = totalW + gap * (row.length - 1);
            // A row of giants can still outgrow the view: pull the whole line in
            // rather than letting the outer creatures walk off the screen.
            const squeeze = span > maxSpan ? maxSpan / span : 1;
            let cursor = -span / 2;
            for (const e of row) {
                const center = (cursor + e.width / 2) * squeeze;
                e.root.position.x = center - e.centerOffset;
                if (e.battlerModel) e.battlerModel._baseX = e.root.position.x;
                cursor += e.width + gap;
            }
            debugLog(`Spread ${row.length} enemy models over ${(span * squeeze).toFixed(2)} units`);
        } else if (row.length === 1) {
            // Single enemy: reset z depth to 0 and centre on screen.
            row[0].root.position.z = 0;
            if (row[0].battlerModel) row[0].battlerModel._baseX = row[0].root.position.x;
        }

        // Drop the shadow catcher onto the lowest pair of feet on the field and
        // re-flag casters. Both have to wait for this pass rather than run at
        // addModel time: a GLB's geometry is only measurable once it is in the
        // scene, and families that build sub-meshes on the first tick would
        // otherwise cast nothing. It runs twice per battle, not per frame.
        if (scene3d.lighting) {
            let minY = Infinity;
            scene3d.models.forEach(model => {
                const root = model && model.model;
                if (!root) return;
                scene3d.lighting.markCaster(root);
                box.setFromObject(root);
                if (!box.isEmpty() && isFinite(box.min.y)) minY = Math.min(minY, box.min.y);
            });
            if (isFinite(minY)) scene3d.lighting.setGroundY(minY);
        }

        // The HUD reads this to know the field has stopped moving and its
        // compact enemy bars can be locked in place.
        this._3dEnemyLayoutSettled = true;
    };

    const _Spriteset_Battle_createActors = Spriteset_Battle.prototype.createActors;
    Spriteset_Battle.prototype.createActors = function() {
        _Spriteset_Battle_createActors.call(this);
        // Actors keep the delay the enemies no longer need: createActors builds
        // the sprites with no battler at all (updateActors hands them one on the
        // first update), so unlike an enemy sprite they are not positioned yet.
        // Tracked so destroy can cancel it before it fires against a disposed scene.
        this._create3DActorsTimer = setTimeout(() => {
            this._create3DActorsTimer = null;
            this.create3DActors();
        }, 100);
    };

    Spriteset_Battle.prototype.create3DActors = function() {
        // Scene may have been disposed/nulled between the setTimeout and now.
        if (!this._battle3DScene || this._battle3DScene._disposed) return;
        debugLog('Creating 3D actors');
        const actors = $gameParty.battleMembers();

        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            const actorConfig = config.actorModels.find(m => Number(m.actorId) === actor.actorId());

            debugLog(`Actor ${i}:`, actor.name(), 'ID:', actor.actorId(), 'Config:', actorConfig);

            if (actorConfig) {
                const filename = actorConfig.modelFile;
                const scale = Number(actorConfig.scale || 1.0);
                const offsetY = Number(actorConfig.offsetY || 0);

                debugLog(`Configuring 3D actor: ${filename}`);

                const battlerModel = new BattlerModel3D(filename, scale, offsetY);
                const sprite = this._actorSprites[i];

                if (!sprite) {
                    console.error(`Actor sprite ${i} not found!`);
                    continue;
                }

                // Calculate 3D position from 2D sprite position
                const screenX = (sprite.x / Graphics.width) * 4 - 2;
                const screenY = -((sprite.y / Graphics.height) * 4 - 2);

                debugLog(`Actor ${i} 2D pos: (${sprite.x}, ${sprite.y}) -> 3D pos: (${screenX}, ${screenY}, 0)`);

                this._battle3DScene.addModel(`actor_${i}`, battlerModel, screenX, screenY, 0);

                // Hide 2D sprite
                sprite.hide();
                debugLog(`Actor sprite ${i} hidden`);
            }
        }
    };

    const _Spriteset_Battle_update = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        _Spriteset_Battle_update.call(this);
        if (this._battle3DScene) {
            this._battle3DScene.render();
            // Re-upload the PIXI texture only on frames the 3D layer actually drew
            // (skips the costly full-canvas GPU upload on frame-capped/idle frames).
            if (this._battle3DScene._lastDrew && this._battle3DSprite && this._battle3DSprite.texture) {
                this.sync3DSpriteScale();
                this._battle3DSprite.texture.update();
            }
        }
    };

    // The 3D canvas is rendered at a fraction of the screen and the sprite blows
    // it back up. That fraction can move while the fight is on (the retro
    // downsample is an Options slider), so the sprite and the texture's declared
    // size follow it. One comparison a drawn frame; nothing happens until it does.
    Spriteset_Battle.prototype.sync3DSpriteScale = function() {
        const rs = this._battle3DScene._renderScale || 1;
        if (this._battle3DSpriteScale === rs) return;
        this._battle3DSpriteScale = rs;
        this._battle3DSprite.scale.set(1 / rs, 1 / rs);
        const canvas = this._battle3DScene.renderer.domElement;
        const base = this._battle3DSprite.texture.baseTexture;
        if (base.realWidth !== canvas.width || base.realHeight !== canvas.height) {
            base.setRealSize(canvas.width, canvas.height);
        }
    };

    const _Spriteset_Battle_destroy = Spriteset_Battle.prototype.destroy;
    Spriteset_Battle.prototype.destroy = function(options) {
        // Cancel any pending deferred 3D creation so it cannot run against the
        // scene we are about to dispose.
        if (this._create3DEnemiesTimer) { clearTimeout(this._create3DEnemiesTimer); this._create3DEnemiesTimer = null; }
        if (this._create3DActorsTimer) { clearTimeout(this._create3DActorsTimer); this._create3DActorsTimer = null; }
        if (this._battle3DSprite) {
            if (this._battle3DSprite.parent) {
                this._battle3DSprite.parent.removeChild(this._battle3DSprite);
            }
            // Sprite only: the texture is the shared battle canvas's and the next
            // battle picks it straight back up (PIXI.Texture.from keys on the
            // canvas), so destroying it would throw away an upload we want.
            this._battle3DSprite.destroy();
            this._battle3DSprite = null;
            this._battle3DSpriteScale = null;
            debugLog('3D sprite destroyed');
        }
        if (this._battle3DScene) {
            this._battle3DScene.dispose();
            this._battle3DScene = null;
        }
        _Spriteset_Battle_destroy.call(this, options);
    };

    //=============================================================================
    // Animation Triggers
    //=============================================================================

    Spriteset_Battle.prototype.get3DModel = function(battler) {
        if (!battler) return null;

        if (battler.isActor()) {
            const index = $gameParty.battleMembers().indexOf(battler);
            return this._battle3DScene ? this._battle3DScene.getModel(`actor_${index}`) : null;
        } else {
            const index = $gameTroop.members().indexOf(battler);
            return this._battle3DScene ? this._battle3DScene.getModel(`enemy_${index}`) : null;
        }
    };

    // Scratch vector reused by getBattlerPartPosition (lazily created so it does
    // not depend on THREE being present at plugin-load time).
    let _partPosScratch = null;

    // Project a battler's body-part mesh to 2D and return its position in the
    // SAME coordinate space the 2D battler sprites / blood FX use (battleField
    // local). Returns null unless we are actually rendering this battler in 3D
    // (models present, mesh exists), so 2D/Sprites mode callers transparently
    // fall back to the battler sprite. Used by blood/effect plugins to localise
    // splatters and gibs onto the limb that was actually struck or severed.
    //
    // When partKey is null/undefined, ALWAYS returns the model's centre position
    // (not a random limb), so skill/Effekseer animations are centred on the enemy
    // even in multi-battle where enemies are spread across the field.
    Spriteset_Battle.prototype.getBattlerPartPosition = function(battler, partKey) {
        if (!this._battle3DScene || !this._battle3DSprite) return null;
        if (typeof THREE === 'undefined') return null;
        if (!this._battle3DScene.hasModels()) return null;
        const model = this.get3DModel(battler);
        if (!model) return null;
        const cam = this._battle3DScene.camera;
        if (!cam) return null;

        // Reuse a scratch vector: this runs many times per hit (blood/gib FX).
        const v = _partPosScratch || (_partPosScratch = new THREE.Vector3());

        // When no specific part is requested, always centre on the model root
        // (lifted to body centre). This ensures skill/Effekseer animations are
        // centred on the enemy, not offset to a random limb.
        if (!partKey) {
            if (model.model) {
                model.model.getWorldPosition(v);
                v.y += 1; // lift from the base toward the body centre
            } else {
                return null;
            }
            v.project(cam);
            if (!isFinite(v.x) || !isFinite(v.y) || v.z > 1) return null;
            const px = (v.x * 0.5 + 0.5) * Graphics.width;
            const py = (-v.y * 0.5 + 0.5) * Graphics.height;
            return { x: px + this._battle3DSprite.x, y: py + this._battle3DSprite.y };
        }

        // Specific part requested: look it up in the part mesh map.
        let mesh = model._partMeshMap ? model._partMeshMap[partKey] : null;
        if (!mesh && model._partMeshMap) {
            // No mesh for this part: fall back to any limb so effects still land
            // on the model rather than the hidden 2D slot.
            for (const k in model._partMeshMap) {
                if (model._partMeshMap[k]) { mesh = model._partMeshMap[k]; break; }
            }
        }

        if (mesh) {
            mesh.getWorldPosition(v);
        } else if (model.model) {
            model.model.getWorldPosition(v);
            v.y += 1; // lift from the base toward the body centre
        } else {
            return null;
        }
        v.project(cam);
        if (!isFinite(v.x) || !isFinite(v.y) || v.z > 1) return null; // off-screen/behind
        const px = (v.x * 0.5 + 0.5) * Graphics.width;
        const py = (-v.y * 0.5 + 0.5) * Graphics.height;
        // The 3D canvas sprite sits at _battleField-local (-_battleField.x,
        // -_battleField.y), so adding its offset converts canvas px -> field-local.
        return { x: px + this._battle3DSprite.x, y: py + this._battle3DSprite.y };
    };

    const _Sprite_Battler_updateDamagePopup = Sprite_Battler.prototype.updateDamagePopup;
    Sprite_Battler.prototype.updateDamagePopup = function() {
        _Sprite_Battler_updateDamagePopup.call(this);

        if (this._damages.length > 0 && SceneManager._scene && SceneManager._scene._spriteset) {
            const model = SceneManager._scene._spriteset.get3DModel(this._battler);
            if (model) {
                const result = this._battler.result && this._battler.result();
                const isCritical = !!(result && result.critical);
                const partLost = !!this._battler._partLostStagger;

                // Every damaging hit freezes the model briefly (hit-stop), scaled
                // by the size of the blow (fraction of max HP): chip damage barely
                // pauses, heavy blows hang noticeably. Crits / severed parts freeze
                // harder. Fired once per damage batch (guard resets when popups clear).
                if (!this._3dHitStopDone && model.triggerHitStop) {
                    const dmg = result ? Math.max(0, result.hpDamage || 0) : 0;
                    if (dmg > 0) {
                        const maxhp = Math.max(1, this._battler.mhp || 1);
                        let intensity = 0.15 + Math.min(1, dmg / maxhp) * 0.85;
                        if (isCritical || partLost) intensity = Math.min(1.5, intensity * 1.5);
                        model.triggerHitStop(intensity);
                    }
                    this._3dHitStopDone = true;
                }

                // The whole-body stagger/recoil is reserved for impactful blows:
                // a critical hit or a severed/destroyed body part. Ordinary hits
                // only get the hit-stop + localised hit-flash, no flinch. Fired once
                // per damage batch (the guard resets when the popups clear).
                if ((isCritical || partLost) && !this._3dStaggerDone) {
                    model.playAnimation('hit', false, () => { model.playIdleAnimation(); });
                    this._battler._partLostStagger = false;
                    this._3dStaggerDone = true;
                }
                if (this._battler._lastHitPart) {
                    model.flashBodyPart(this._battler._lastHitPart);
                    this._battler._lastHitPart = null;
                }
            }
        } else if (this._damages.length === 0) {
            this._3dStaggerDone = false;
            this._3dHitStopDone = false;
        }
    };

    const _Sprite_Actor_startMotion = Sprite_Actor.prototype.startMotion;
    Sprite_Actor.prototype.startMotion = function(motionType) {
        _Sprite_Actor_startMotion.call(this, motionType);

        if (SceneManager._scene && SceneManager._scene._spriteset) {
            const model = SceneManager._scene._spriteset.get3DModel(this._battler);
            if (model) {
                switch (motionType) {
                    case 'attack':
                    case 'thrust':
                    case 'swing':
                    case 'missile':
                        model.playAnimation('attack', false, () => {
                            model.playIdleAnimation();
                        });
                        break;
                    case 'skill': {
                        // Bosses cycle their skill palette; others magic->specialattack.
                        const act = this._battler.currentAction && this._battler.currentAction();
                        const anim = pick3DActionAnim(this._battler, act, model);
                        model.playAnimation(anim, false, () => { model.playIdleAnimation(); });
                        break;
                    }
                    case 'damage':
                        model.playAnimation('hit', false, () => {
                            model.playIdleAnimation();
                        });
                        break;
                    case 'dead':
                        model.playAnimation('death', false);
                        if (model.startDeathFade) model.startDeathFade();
                        break;
                }
            }
        }
    };

    // Choose the 3D animation for an action. Bosses (tagged <Boss>) cycle their
    // skills through a palette of distinct magic/physical casts (keyed by skill
    // id so a given skill always looks the same); everyone else keeps the simple
    // magic->specialattack / else->attack mapping.
    function pick3DActionAnim(battler, action, model) {
        const isMagic = !!(action && action.isMagical && action.isMagical());
        if (model && model._isBoss && model._isBoss()) {
            const item = action && action.item && action.item();
            const sid = item ? Math.abs(item.id) : 0;
            const pool = isMagic ? BOSS_MAGIC_ANIMS : BOSS_PHYS_ANIMS;
            const cand = pool.filter(a => model.hasAnimation(a));
            if (cand.length) return cand[sid % cand.length];
        }
        return (isMagic && model.hasAnimation('specialattack')) ? 'specialattack' : 'attack';
    }

    const _Sprite_Enemy_initMembers = Sprite_Enemy.prototype.initMembers;
    Sprite_Enemy.prototype.initMembers = function() {
        _Sprite_Enemy_initMembers.call(this);
        this._3dAttackStarted = false;
    };

    // What the model is doing is read every frame from the battler it belongs to:
    // the swing it is taking, the death it is falling into, the exit it is walking
    // out of. This hangs off update() rather than updateBitmap() because the bitmap
    // hook is not ours alone - ReactiveEnemyBattler loads after this plugin and
    // REPLACES Sprite_Enemy#updateBitmap outright (it swaps in its own hit/idle
    // sheets and never chains), which silently took the 3D attack animations and,
    // worse, the death fade with it. A killed monster then stood on the field for
    // the rest of the fight; with a lone enemy the battle ended on the spot and
    // nobody saw it, but a troop (see BattleSystemEnhanced section 7) kept its
    // corpses standing. update() is wrapped by every plugin in the chain, so the
    // model always hears about it.
    const _Sprite_Enemy_update_3D = Sprite_Enemy.prototype.update;
    Sprite_Enemy.prototype.update = function() {
        _Sprite_Enemy_update_3D.call(this);
        this.update3DBattlerState();
    };

    Sprite_Enemy.prototype.update3DBattlerState = function() {
        const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
        if (!this._battler || !spriteset || !spriteset.get3DModel) return;
        const model = spriteset.get3DModel(this._battler);
        if (!model) return;

        if (this._battler.isActing()) {
            if (!this._3dAttackStarted) {
                this._3dAttackStarted = true;
                const action = this._battler.currentAction();

                // Bosses cycle a palette of magic/skill casts; others keep the
                // simple magic->specialattack / else->attack mapping.
                const anim = pick3DActionAnim(this._battler, action, model);
                model.playAnimation(anim, false, () => {
                    model.playIdleAnimation();
                });
            }
        } else {
            this._3dAttackStarted = false;
        }

        if (this._battler.isDead()) {
            model.playAnimation('death', false);
            // GLB models have no procedural fade; start the whole-model
            // fade-off explicitly so they vanish on death too (fires for
            // both HP-loss deaths and lethal body-part kills).
            if (model.startDeathFade) model.startDeathFade();
        } else if (this._battler.isHidden()) {
            // Taken off the field alive: a monster talked round mid-fight
            // (EnemyTalkSystem) is hidden rather than killed, and the rest
            // of its pack fights on, so the model has to go the same way
            // the 2D sprite's "disappear" effect takes it. Nothing plays
            // over it: the creature walked out, it did not fall.
            if (model.startDeathFade) model.startDeathFade();
            else if (model.model) model.model.visible = false;
        }
    };

    //=========================================================================
    // F2 Hotkey: toggle enemy 3D battlers on the fly (merged from the former
    // standalone Battle3DHotkey plugin). Flips ConfigManager.enemyBattlers
    // between 3D (1) and Sprites (2) anywhere, including mid-battle. Only the
    // 3D battlers are affected here; the 3D weapon option is left untouched.
    //=========================================================================

    // Is the 3D battler path currently active? (1 = 3D)
    function is3DActive() {
        return ConfigManager.enemyBattlers === 1;
    }

    // Apply the new mode to the live Spriteset_Battle so the swap happens
    // immediately instead of only on the next battle.
    function applyToBattle(turnOn) {
        if (!$gameParty || !$gameParty.inBattle()) return;
        const scene = SceneManager._scene;
        const ss = scene && scene._spriteset;
        if (!ss) return;

        const sc3d = ss._battle3DScene;
        if (!sc3d || !sc3d.models) return;

        // Always clear existing battler models first so a re-enable cannot
        // stack duplicates on top of the previous ones.
        for (const key of Array.from(sc3d.models.keys())) {
            if (key.startsWith('enemy_') || key.startsWith('actor_')) {
                sc3d.removeModel(key);
            }
        }
        if (turnOn) {
            // Rebuild the 3D models (hides the matching 2D sprites itself).
            if (ss.create3DEnemies) ss.create3DEnemies();
            if (ss.create3DActors) ss.create3DActors();
        } else {
            // Reveal the sprite battlers the models had hidden. show() clears
            // the _hidden flag; per-frame updateVisibility still re-hides dead
            // or otherwise non-visible battlers, so this is safe on all.
            (ss._enemySprites || []).forEach(s => { if (s) s.show(); });
            (ss._actorSprites || []).forEach(s => { if (s) s.show(); });
        }
    }

    // Brief on-screen confirmation so the toggle is legible off the
    // battlefield, through the shared notification popup like everything else.
    function showToast(text) {
        if (window.ParchmentToast) {
            window.ParchmentToast.show(text, { duration: 70, key: 'battler3d-toggle' });
        }
    }

    function toggle3DBattlers() {
        const turnOn = !is3DActive();

        // The only two modes left: 1 = 3D models, 2 = the enemy's <Char:>
        // sprite. charBasedSprites mirrors "== 2" for older readers.
        ConfigManager.enemyBattlers = turnOn ? 1 : 2;
        ConfigManager.charBasedSprites = !turnOn;
        ConfigManager.save();

        try { applyToBattle(turnOn); } catch (e) { console.error('[3DBattlerSystem][F2]', e); }

        showToast(window.T(turnOn
            ? 'GameOptions.enemyBattlerToast.model3d'
            : 'GameOptions.enemyBattlerToast.sprites'));
    }

    document.addEventListener('keydown', (event) => {
        // F2 only, ignore auto-repeat and typing into text fields.
        if (event.key !== 'F2' && event.keyCode !== 113) return;
        if (event.repeat) return;
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        event.preventDefault();
        toggle3DBattlers();
    }, true);

    //=========================================================================
    // Auto-load the procedural battler family plugins.
    //=========================================================================
    // Instead of listing every js/plugins/Battler3D/3DBattler_*.js in plugins.js,
    // the core injects them here, in dependency order, right after this script
    // (which has already defined window.Battler3D.Base / registerArchetype / ...).
    // Each injected script runs in order (async=false) and registers its archetypes.
    //
    // To add a new family: drop the file in js/plugins/Battler3D/ and add its name
    // below (order matters - a family that name-pins or overrides another must come
    // after it; the bespoke/unique families load last so their pins win).
    //
    // NOTE: these files are NOT in $plugins, so RPG Maker's "Exclude unused files"
    // on deployment will not detect them. Keep that option OFF when packaging, or
    // copy js/plugins/Battler3D/ into the build manually.
    const BATTLER3D_FAMILIES = [
        '3DBattler_Humanoid', '3DBattler_Flora', '3DBattler_Amorphous', '3DBattler_Elemental',
        '3DBattler_Winged', '3DBattler_Birds', '3DBattler_Mechanical', '3DBattler_Aberration',
        '3DBattler_Quadruped', '3DBattler_Beasts', '3DBattler_Aquatic', '3DBattler_Fish',
        '3DBattler_Arachnid', '3DBattler_Draconic', '3DBattler_Exotic', '3DBattler_Unique',
        '3DBattler_Bosses', '3DBattler_Oddities', '3DBattler_Flavor', '3DBattler_CatHybrids',
        '3DBattler_Apex', '3DBattler_UniqueLow',
        '3DBattler_Bugs', '3DBattler_Oozes', '3DBattler_Critters', '3DBattler_Spirits',
        '3DBattler_Imps', '3DBattler_Bones', '3DBattler_SmallFauna',
        '3DBattler_Drones', '3DBattler_Serpents', '3DBattler_Fey',
        '3DBattler_Sprouts', '3DBattler_Sparks', '3DBattler_Oddments', '3DBattler_Folk',
        '3DBattler_Eris'
    ];
    (function loadBattler3DFamilies() {
        const host = document.body || document.head || document.documentElement;
        if (!host) return;
        const dir = 'js/plugins/Battler3D/';
        for (const name of BATTLER3D_FAMILIES) {
            const src = dir + name + '.js';
            if (document.querySelector('script[src="' + src + '"]')) continue; // already loaded
            const s = document.createElement('script');
            s.type = 'text/javascript';
            s.src = src;
            s.async = false; // preserve insertion order so dependencies load first
            s.defer = false;
            s.onerror = () => console.error('[3D Battler] Failed to load family: ' + src);
            host.appendChild(s);
        }
    })();
})();
