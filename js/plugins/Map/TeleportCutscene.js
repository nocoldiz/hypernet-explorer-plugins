/*:
 * @target MZ
 * @plugindesc Teleport cutscene with light beam effect
 * @author OmniLex
 * @url https://github.com/
 *
 * @help TeleportCutscene.js
 *
 * Plays a short teleport cutscene before a transfer. The look depends on
 * where the party is standing when the teleport starts:
 *
 *  - On an exterior map the party rises to the sky inside pillars of light.
 *  - On an interior or covered map there is no sky to rise to: the party
 *    stands in place and dissolves into a black void instead.
 *
 * Which one plays is decided by the map's own note tags: <Exterior> always
 * means the sky version, <Covered> and <Interior> (or a procedural interior,
 * as answered by WorldMapReturn.isInteriorMap) mean the void.
 *
 * Script API (used by the Omega Tower teleport and Return to Ship):
 *   window.TeleportCutscene.play({ mapId, x, y, dir, fadeType })
 *   window.TeleportCutscene.play({ onTeleport: () => { ... } })
 * The onTeleport form runs the callback in place of the plain transfer, for
 * teleports that are not a simple reserveTransfer (boarding the starship).
 *
 * A call with no destination (no mapId, or mapId 0) plays the cutscene as a
 * pure effect: nothing is transferred and the party returns to the map. The
 * MirageMarch common event drives it this way.
 *
 * Plugin Commands:
 *   playTeleportCutscene - Plays the teleport cutscene and transfers player
 *
 * @command playTeleportCutscene
 * @text Play Teleport Cutscene
 * @desc Plays the teleport cutscene and transfers to target location
 *
 * @arg mapId
 * @text Map ID
 * @type number
 * @min 1
 * @default 1
 * @desc Target map ID to teleport to
 *
 * @arg x
 * @text X Coordinate
 * @type number
 * @min 0
 * @default 0
 * @desc Target X coordinate
 *
 * @arg y
 * @text Y Coordinate
 * @type number
 * @min 0
 * @default 0
 * @desc Target Y coordinate
 *
 * @arg fadeType
 * @text Fade Type
 * @type select
 * @option Black
 * @value 0
 * @option White
 * @value 1
 * @option None
 * @value 2
 * @default 0
 * @desc Fade type after teleport completes
 */

(() => {
    'use strict';

    const pluginName = 'TeleportCutscene';

    // ------------------------------------------------------------------
    // Which cutscene the current map earns. <Exterior> always wins (the
    // three-venue convention); <Covered> is a roof without walls and gets
    // the void like an interior; everything else defers to the one shared
    // indoor/outdoor answer, WorldMapReturn.isInteriorMap, which already
    // knows about <Interior> and procedural interiors.
    // ------------------------------------------------------------------
    function isExteriorHere() {
        const note = (typeof $dataMap !== 'undefined' && $dataMap && $dataMap.note) ? $dataMap.note : '';
        if (/<Exterior>/i.test(note)) return true;
        if (/<Covered>/i.test(note)) return false;
        const wmr = window.WorldMapReturn;
        if (wmr && typeof wmr.isInteriorMap === 'function') {
            return !wmr.isInteriorMap();
        }
        return !/<Interior>/i.test(note);
    }

    function currentVariant() {
        return isExteriorHere() ? 'ascend' : 'void';
    }

    PluginManager.registerCommand(pluginName, 'playTeleportCutscene', args => {
        play({
            mapId: Number(args.mapId),
            x: Number(args.x),
            y: Number(args.y),
            fadeType: Number(args.fadeType)
        });
    });

    // The one way in. goto (not push) so it works from the menu (Return to
    // Ship) as well as from the map; the scene ends with goto(Scene_Map)
    // either way. The variant is read off the map the party is leaving,
    // before any scene change can swap $dataMap out from under it.
    function play(options) {
        const opts = Object.assign({ variant: currentVariant() }, options || {});
        SceneManager.goto(Scene_TeleportCutscene);
        SceneManager.prepareNextScene(opts);
    }

    //-----------------------------------------------------------------------------
    // Scene_TeleportCutscene
    //-----------------------------------------------------------------------------

    class Scene_TeleportCutscene extends Scene_Base {
        initialize() {
            super.initialize();
            this._mapId = 0;
            this._x = 0;
            this._y = 0;
            this._dir = 0;
            this._fadeType = 0;
            this._variant = 'ascend';
            this._onTeleport = null;
        }

        prepare(options) {
            // Old positional form (mapId, x, y, fadeType) kept working for
            // anything that still calls prepareNextScene the 2023 way.
            if (typeof options !== 'object' || options === null) {
                const args = arguments;
                options = { mapId: args[0], x: args[1], y: args[2], fadeType: args[3] };
            }
            this._mapId = Number(options.mapId) || 0;
            this._x = Number(options.x) || 0;
            this._y = Number(options.y) || 0;
            this._dir = Number(options.dir) || 0;
            this._fadeType = Number(options.fadeType) || 0;
            this._variant = options.variant === 'void' ? 'void' : 'ascend';
            this._onTeleport = typeof options.onTeleport === 'function' ? options.onTeleport : null;
        }

        create() {
            super.create();
            this.createBackground();
            this.createCharacterSprites();
            if (this._variant === 'ascend') this.createLightBeams();
            this._phase = 'idle';
            this._phaseTimer = 0;
        }

        createBackground() {
            this._backgroundSprite = new Sprite();
            this._backgroundSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
            if (this._variant === 'ascend') {
                // A night sky to rise into: black at the top, a deep blue
                // band where the party stands.
                const ctx = this._backgroundSprite.bitmap.context;
                const grad = ctx.createLinearGradient(0, 0, 0, Graphics.height);
                grad.addColorStop(0, '#000008');
                grad.addColorStop(0.65, '#0a1430');
                grad.addColorStop(1, '#16224a');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, Graphics.width, Graphics.height);
            } else {
                this._backgroundSprite.bitmap.fillAll('black');
            }
            this.addChild(this._backgroundSprite);
        }

        createCharacterSprites() {
            this._characterSprites = [];
            const party = $gameParty.battleMembers();
            const spacing = Graphics.width / (party.length + 1);

            for (let i = 0; i < party.length; i++) {
                const actor = party[i];
                const characterName = actor.characterName();
                const characterIndex = actor.characterIndex();

                const sprite = new Sprite();
                sprite.bitmap = ImageManager.loadCharacter(characterName);

                // $-prefixed sheets hold a single 3x4 character; regular sheets
                // hold 8 characters in a 12x8 grid. The frame is cut once the
                // sheet has loaded: an uncached sheet still reads 0x0 here.
                const isBig = ImageManager.isBigCharacter(characterName);
                const n = isBig ? 0 : characterIndex;
                sprite.bitmap.addLoadListener(bitmap => {
                    const pw = isBig ? bitmap.width / 3 : bitmap.width / 12;
                    const ph = isBig ? bitmap.height / 4 : bitmap.height / 8;
                    const sx = (n % 4) * 3 * pw + pw; // Front-facing (middle frame)
                    const sy = Math.floor(n / 4) * 4 * ph; // Front-facing direction
                    sprite.setFrame(sx, sy, pw, ph);
                });
                sprite.anchor.x = 0.5;
                sprite.anchor.y = 1.0;
                sprite.x = spacing * (i + 1);
                sprite.y = Graphics.height / 2 + 100;
                sprite.opacity = 0;
                sprite._homeY = sprite.y;

                this.addChild(sprite);
                this._characterSprites.push(sprite);
            }
        }

        createLightBeams() {
            this._lightBeams = [];

            for (let i = 0; i < this._characterSprites.length; i++) {
                const charSprite = this._characterSprites[i];
                const beam = new Sprite();
                beam.bitmap = this.createBeamBitmap();
                beam.anchor.x = 0.5;
                beam.anchor.y = 1.0;
                beam.x = charSprite.x;
                beam.y = charSprite.y;
                beam.opacity = 0;
                beam.scale.y = 0;

                this.addChild(beam);
                this._lightBeams.push(beam);
            }
        }

        createBeamBitmap() {
            const width = 60;
            const height = Graphics.height * 2;
            const bitmap = new Bitmap(width, height);

            // Create gradient light beam
            const context = bitmap.context;
            const gradient = context.createLinearGradient(width / 2, 0, width / 2, height);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
            gradient.addColorStop(0.3, 'rgba(200, 230, 255, 0.8)');
            gradient.addColorStop(0.5, 'rgba(150, 200, 255, 1)');
            gradient.addColorStop(0.7, 'rgba(200, 230, 255, 0.8)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);

            return bitmap;
        }

        update() {
            super.update();
            this._phaseTimer++;

            switch (this._phase) {
                case 'idle':
                    if (this._phaseTimer > 30) {
                        this._phase = 'fadeIn';
                        this._phaseTimer = 0;
                    }
                    break;
                case 'fadeIn':
                    this.updateFadeIn();
                    break;
                case 'transform':
                    this.updateGlowPhase();
                    break;
                case 'beam':
                    this.updateBeam();
                    break;
                case 'dissolve':
                    this.updateDissolve();
                    break;
                case 'complete':
                    if (this._phaseTimer > 30) {
                        this.performTeleport();
                    }
                    break;
            }
        }

        updateFadeIn() {
            const duration = 60;
            const progress = Math.min(this._phaseTimer / duration, 1);

            for (const sprite of this._characterSprites) {
                sprite.opacity = 255 * progress;
            }

            if (this._phaseTimer >= duration + 30) {
                this._phase = this._variant === 'void' ? 'dissolve' : 'transform';
                this._phaseTimer = 0;
            }
        }

        // Exterior only: the beams wake up around the party while they start
        // to glow. The sprites stay visible: they are about to ride the light
        // up, not vanish into it. Never name this updateTransform: that is
        // PIXI's per-frame transform pass on every display object, and an
        // override runs from the renderer instead of the scene's own update.
        updateGlowPhase() {
            const duration = 60;
            const progress = Math.min(this._phaseTimer / duration, 1);

            for (let i = 0; i < this._characterSprites.length; i++) {
                const sprite = this._characterSprites[i];
                const beam = this._lightBeams[i];

                beam.opacity = 255 * progress;
                beam.scale.y = progress;

                // Make character glow/flash
                const flash = Math.sin(this._phaseTimer * 0.2) * 0.3 + 0.7;
                sprite.setBlendColor([255 * flash, 255 * flash, 255 * flash, 0]);
            }

            if (this._phaseTimer >= duration) {
                this._phase = 'beam';
                this._phaseTimer = 0;
                this.playLiftSound();
            }
        }

        // The pillars take the party up: one teleport whoosh as the climb
        // starts.
        playLiftSound() {
            if (typeof AudioManager === 'undefined' || !AudioManager.playSe) return;
            AudioManager.playSe({ name: 'Teleport', volume: 90, pitch: 100, pan: 0 });
        }

        // Exterior only: the party rises to the sky inside their pillars of
        // light, accelerating, and fades out near the top of the climb.
        updateBeam() {
            const duration = 90;
            const progress = Math.min(this._phaseTimer / duration, 1);
            const rise = 8 + progress * 10;

            for (let i = 0; i < this._lightBeams.length; i++) {
                const beam = this._lightBeams[i];
                const sprite = this._characterSprites[i];

                beam.y -= rise;
                sprite.y -= rise;

                // Fade out near the end
                if (progress > 0.7) {
                    const fadeProgress = (progress - 0.7) / 0.3;
                    beam.opacity = 255 * (1 - fadeProgress);
                    sprite.opacity = 255 * (1 - fadeProgress);
                }

                // Scale effect (pulsing)
                beam.scale.x = 1 + Math.sin(this._phaseTimer * 0.1) * 0.2;
            }

            if (this._phaseTimer >= duration) {
                this._phase = 'complete';
                this._phaseTimer = 0;
            }
        }

        // Interior / covered only: no beams and nobody moves. The party
        // darkens where they stand, flickering out into the black void until
        // nothing is left of them.
        updateDissolve() {
            const duration = 120;
            const progress = Math.min(this._phaseTimer / duration, 1);

            for (const sprite of this._characterSprites) {
                const dark = 255 * progress;
                sprite.setBlendColor([-dark, -dark, -dark, 0]);
                if (progress > 0.4) {
                    const fadeProgress = (progress - 0.4) / 0.6;
                    const flicker = Math.sin(this._phaseTimer * 0.5) * 20 * (1 - fadeProgress);
                    sprite.opacity = Math.max(0, 255 * (1 - fadeProgress) + flicker);
                }
            }

            if (this._phaseTimer >= duration) {
                this._phase = 'complete';
                this._phaseTimer = 0;
            }
        }

        performTeleport() {
            if (this._onTeleport) {
                this._onTeleport();
            } else if (this._mapId > 0) {
                $gamePlayer.reserveTransfer(this._mapId, this._x, this._y, this._dir, this._fadeType);
            } else {
                // No destination travelled with the options: the argument-less
                // plugin command (the MirageMarch common event) does exactly
                // this, leaving mapId at 0. Reserving a transfer to map 0 can
                // never load - Scene_Map.create would request a map that is not
                // on disk and Scene_Map.isReady would wait on it forever. The
                // engine draws nothing while a scene loads, so the last frame
                // rendered, the cutscene's sky gradient, would stay frozen on
                // screen. Stand the party back up where they already are.
                console.warn("TeleportCutscene: no destination map given; ending the cutscene without a transfer.");  // i18n-ignore  console diagnostic
            }
            SceneManager.goto(Scene_Map);
        }

        isReady() {
            return super.isReady() &&
                   this._characterSprites.every(s => s.bitmap && s.bitmap.isReady());
        }
    }

    window.Scene_TeleportCutscene = Scene_TeleportCutscene;
    window.TeleportCutscene = { play, isExteriorHere, currentVariant };

})();
