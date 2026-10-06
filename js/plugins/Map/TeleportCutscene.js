/*:
 * @target MZ
 * @plugindesc Teleport cutscene with light beam effect
 * @author OmniLex
 * @url https://github.com/
 *
 * @help TeleportCutscene.js
 *
 * Plays a short teleport cutscene before a transfer, over a snapshot of the
 * map the party is leaving, from the tiles they were standing on. The look
 * depends on where the party is when the teleport starts:
 *
 *  - On an exterior map night falls over the map, sparks gather and the
 *    party rises to the sky inside pillars of light, ending in a white flash.
 *  - On an interior or covered map there is no sky to rise to: the walls
 *    fall away into a closing ring of black, embers are pulled off the party
 *    and they dissolve where they stand into the void.
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
    // before any scene change can swap $dataMap out from under it, and so
    // is the picture of it: from the map a fresh snapshot is taken, from a
    // menu the snapshot the menu was opened over is reused.
    function play(options) {
        const opts = Object.assign({ variant: currentVariant() }, options || {});
        if (SceneManager._scene instanceof Scene_Map && typeof SceneManager.snapForBackground === 'function') {
            snapWithoutParty(SceneManager._scene);
        }
        SceneManager.goto(Scene_TeleportCutscene);
        SceneManager.prepareNextScene(opts);
    }

    // The cutscene draws its own copy of the party on top of the snapshot,
    // so the map sprites of the player and followers are hidden for the one
    // frame the snapshot takes. Left in, they stayed standing on their tiles
    // in their old facing while their copies lifted off or sank away.
    function isPartyCharacter(ch) {
        if (!ch) return false;
        if (typeof $gamePlayer !== 'undefined' && ch === $gamePlayer) return true;
        return typeof Game_Follower !== 'undefined' && ch instanceof Game_Follower;
    }

    function snapWithoutParty(scene) {
        const spriteset = scene && scene._spriteset;
        const sprites = (spriteset && spriteset._characterSprites) || [];
        const hidden = [];
        for (const sprite of sprites) {
            if (sprite && sprite.visible && isPartyCharacter(sprite._character)) {
                sprite.visible = false;
                hidden.push(sprite);
            }
        }
        try {
            SceneManager.snapForBackground();
        } finally {
            for (const sprite of hidden) sprite.visible = true;
        }
    }

    // Where every party member stands on screen, leader first. The cutscene
    // starts from the real tiles so the party lifts off (or sinks away)
    // from where the player last saw them. Without a player (tests, a scene
    // with no map behind it) they line up across the middle instead.
    function facing(ch) {
        const d = typeof ch.direction === 'function' ? ch.direction() : 2;
        return [2, 4, 6, 8].includes(d) ? d : 2;
    }

    function partyScreenSpots(count) {
        const spots = [];
        const player = typeof $gamePlayer !== 'undefined' ? $gamePlayer : null;
        if (player && typeof player.screenX === 'function') {
            spots.push({ x: player.screenX(), y: player.screenY(), dir: facing(player) });
            const followers = player.followers && player.followers();
            const visible = followers && followers.visibleFollowers ? followers.visibleFollowers() : [];
            for (const f of visible) {
                if (spots.length >= count) break;
                spots.push({ x: f.screenX(), y: f.screenY(), dir: facing(f) });
            }
        }
        const spacing = Graphics.width / (count + 1);
        while (spots.length < count) {
            spots.push({ x: spacing * (spots.length + 1), y: Graphics.height / 2 + 100, dir: 2 });
        }
        return spots.slice(0, count);
    }

    //-----------------------------------------------------------------------------
    // Scene_TeleportCutscene
    //-----------------------------------------------------------------------------

    const PHASES = {
        ascend: ['hold', 'gather', 'lift', 'flash'],
        void: ['hold', 'gather', 'sink', 'flash']
    };
    const DURATION = { hold: 20, gather: 60, lift: 90, sink: 110, flash: 30 };

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
            this.createParticles();
            this.createVignette();
            this.createFlash();
            this._phaseIndex = 0;
            this._phase = PHASES[this._variant][0];
            this._phaseTimer = 0;
            this._done = false;
        }

        // The map the party is leaving, as it was last drawn, with a sheet
        // over it that the phases tighten: night falls for the climb, the
        // void swallows the room.
        createBackground() {
            this._backgroundSprite = new Sprite();
            const snap = typeof SceneManager.backgroundBitmap === 'function' ? SceneManager.backgroundBitmap() : null;
            this._backgroundSprite.bitmap = snap || this.solidBitmap('black');
            this.addChild(this._backgroundSprite);

            this._shade = new Sprite();
            this._shade.bitmap = this.solidBitmap(this._variant === 'ascend' ? '#0a1430' : 'black');
            this._shade.opacity = 0;
            this.addChild(this._shade);
        }

        solidBitmap(color) {
            const bmp = new Bitmap(Graphics.width, Graphics.height);
            bmp.fillAll(color);
            return bmp;
        }

        createCharacterSprites() {
            this._characterSprites = [];
            const party = $gameParty.battleMembers();
            const spots = partyScreenSpots(party.length);

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
                const row = (spots[i].dir || 2) / 2 - 1;
                sprite.bitmap.addLoadListener(bitmap => {
                    const pw = isBig ? bitmap.width / 3 : bitmap.width / 12;
                    const ph = isBig ? bitmap.height / 4 : bitmap.height / 8;
                    const sx = (n % 4) * 3 * pw + pw; // Standing (middle frame)
                    const sy = (Math.floor(n / 4) * 4 + row) * ph; // Facing as on the map
                    sprite.setFrame(sx, sy, pw, ph);
                });
                sprite.anchor.x = 0.5;
                sprite.anchor.y = 1.0;
                sprite.x = spots[i].x;
                sprite.y = spots[i].y;
                sprite._homeX = sprite.x;
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
                beam.y = charSprite.y + 8;
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

        // A pool of motes shared by the whole party. Outside they are sparks
        // that drift up out of the ground around each member and chase the
        // beams; inside they are embers torn off the party and pulled down
        // into the dark.
        createParticles() {
            this._particles = [];
            this._particleBitmap = new Bitmap(6, 6);
            this._particleBitmap.drawCircle(3, 3, 3, this._variant === 'ascend' ? '#dceeff' : '#6a4cff');
            const perMember = 14;
            for (let i = 0; i < this._characterSprites.length * perMember; i++) {
                const p = new Sprite();
                p.bitmap = this._particleBitmap;
                p.anchor.x = 0.5;
                p.anchor.y = 0.5;
                p.opacity = 0;
                p._owner = i % this._characterSprites.length;
                p._life = 0;
                this.addChild(p);
                this._particles.push(p);
            }
        }

        spawnParticle(p) {
            const owner = this._characterSprites[p._owner];
            const spread = 28;
            p._life = 30 + Math.floor(Math.random() * 30);
            p._maxLife = p._life;
            p.x = owner.x + (Math.random() * 2 - 1) * spread;
            p.y = owner.y - Math.random() * 12;
            if (this._variant === 'ascend') {
                p._vx = (Math.random() * 2 - 1) * 0.6;
                p._vy = -(1.5 + Math.random() * 3);
            } else {
                p.y = owner.y - Math.random() * 48;
                p._vx = (owner.x - p.x) * 0.04;
                p._vy = 1 + Math.random() * 2;
            }
            const s = 0.4 + Math.random() * 0.8;
            p.scale.x = s;
            p.scale.y = s;
        }

        updateParticles(spawnChance) {
            for (const p of this._particles) {
                if (p._life <= 0) {
                    if (Math.random() < spawnChance) this.spawnParticle(p);
                    else { p.opacity = 0; continue; }
                }
                p._life--;
                p.x += p._vx;
                p.y += p._vy;
                if (this._variant === 'ascend') p._vy -= 0.08;
                p.opacity = 255 * Math.min(1, p._life / p._maxLife * 2);
            }
        }

        // Interior only: the edges of the room go first. The vignette is a
        // ring of black that closes on the party until only they are left.
        createVignette() {
            this._vignette = null;
            if (this._variant !== 'void') return;
            const bmp = new Bitmap(Graphics.width, Graphics.height);
            const ctx = bmp.context;
            const cx = Graphics.width / 2;
            const cy = Graphics.height / 2;
            const r = Math.max(Graphics.width, Graphics.height) * 0.75;
            const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.85)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, Graphics.width, Graphics.height);
            this._vignette = new Sprite();
            this._vignette.bitmap = bmp;
            this._vignette.anchor.x = 0.5;
            this._vignette.anchor.y = 0.5;
            this._vignette.x = cx;
            this._vignette.y = cy;
            this._vignette.scale.x = 2.5;
            this._vignette.scale.y = 2.5;
            this._vignette.opacity = 0;
            this.addChild(this._vignette);
        }

        // The last thing seen: a white sheet for the sky, a black one for
        // the void, which the transfer's own fade then takes over from.
        createFlash() {
            this._flash = new Sprite();
            this._flash.bitmap = this.solidBitmap(this._variant === 'ascend' ? 'white' : 'black');
            this._flash.opacity = 0;
            this.addChild(this._flash);
        }

        update() {
            super.update();
            if (this._done) return;
            this._phaseTimer++;
            const progress = Math.min(this._phaseTimer / DURATION[this._phase], 1);

            switch (this._phase) {
                case 'hold': break;
                case 'gather': this.updateGather(progress); break;
                case 'lift': this.updateLift(progress); break;
                case 'sink': this.updateSink(progress); break;
                case 'flash': this.updateFlash(progress); break;
            }

            if (progress >= 1) this.nextPhase();
        }

        nextPhase() {
            const list = PHASES[this._variant];
            this._phaseIndex++;
            this._phaseTimer = 0;
            if (this._phaseIndex >= list.length) {
                this._done = true;
                this.performTeleport();
                return;
            }
            this._phase = list[this._phaseIndex];
            if (this._phase === 'lift') this.playLiftSound();
            if (this._phase === 'sink') this.playSinkSound();
        }

        // The map goes quiet: outside night falls over it and the beams wake
        // up around the party, who start to glow; inside the walls fall away
        // into the dark and the party is ringed by embers.
        updateGather(progress) {
            this._shade.opacity = (this._variant === 'ascend' ? 200 : 160) * progress;
            if (this._variant === 'ascend') {
                for (let i = 0; i < this._characterSprites.length; i++) {
                    const sprite = this._characterSprites[i];
                    const beam = this._lightBeams[i];
                    beam.opacity = 255 * progress;
                    beam.scale.y = progress;
                    const flash = Math.sin(this._phaseTimer * 0.2) * 0.3 + 0.7;
                    sprite.setBlendColor([255 * flash, 255 * flash, 255 * flash, 0]);
                }
            } else if (this._vignette) {
                this._vignette.opacity = 255 * progress;
                const sc = 2.5 - 1.3 * progress;
                this._vignette.scale.x = sc;
                this._vignette.scale.y = sc;
            }
            this.updateParticles(0.08 * progress);
        }

        // The pillars take the party up: one teleport whoosh as the climb
        // starts.
        playLiftSound() {
            if (typeof AudioManager === 'undefined' || !AudioManager.playSe) return;
            AudioManager.playSe({ name: 'Teleport', volume: 90, pitch: 100, pan: 0 });
        }

        // The void takes the party down: the same whoosh, pitched into a
        // low drone.
        playSinkSound() {
            if (typeof AudioManager === 'undefined' || !AudioManager.playSe) return;
            AudioManager.playSe({ name: 'Teleport', volume: 80, pitch: 60, pan: 0 });
        }

        // Exterior only: the party rises to the sky inside their pillars of
        // light, accelerating, the ground shivering under them, and fade out
        // near the top of the climb. The beams stay rooted to the tiles they
        // left so the pillar stretches between ground and sky.
        updateLift(progress) {
            const rise = 6 + progress * 14;
            const shake = progress < 0.4 ? Math.sin(this._phaseTimer * 1.3) * 3 * (1 - progress / 0.4) : 0;
            this._backgroundSprite.x = shake;

            for (let i = 0; i < this._lightBeams.length; i++) {
                const beam = this._lightBeams[i];
                const sprite = this._characterSprites[i];
                sprite.y -= rise;
                sprite.x = sprite._homeX + Math.sin(this._phaseTimer * 0.15 + i) * 3;
                beam.scale.x = 1 + Math.sin(this._phaseTimer * 0.1) * 0.2;
                if (progress > 0.7) {
                    const fade = (progress - 0.7) / 0.3;
                    beam.opacity = 255 * (1 - fade);
                    sprite.opacity = 255 * (1 - fade);
                }
            }
            this.updateParticles(0.35);
        }

        // Interior / covered only: no beams and nobody walks. The vignette
        // closes to a pinhole, the party darkens where they stand and
        // flickers out, sinking a few pixels into the floor as the last of
        // them goes.
        updateSink(progress) {
            this._shade.opacity = 160 + 95 * progress;
            if (this._vignette) {
                const sc = 1.2 - 0.9 * progress;
                this._vignette.scale.x = sc;
                this._vignette.scale.y = sc;
            }
            for (const sprite of this._characterSprites) {
                const dark = 255 * progress;
                sprite.setBlendColor([-dark, -dark, -dark, 0]);
                sprite.y = sprite._homeY + 10 * progress * progress;
                if (progress > 0.4) {
                    const fade = (progress - 0.4) / 0.6;
                    const flicker = Math.sin(this._phaseTimer * 0.5) * 20 * (1 - fade);
                    sprite.opacity = Math.max(0, 255 * (1 - fade) + flicker);
                }
            }
            this.updateParticles(0.3 * (1 - progress));
        }

        // The flash fills the screen and holds it for the hand-over.
        updateFlash(progress) {
            this._flash.opacity = 255 * Math.min(1, progress * 3);
            this.updateParticles(0);
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
                // rendered would stay frozen on screen. Stand the party back
                // up where they already are.
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
    window.TeleportCutscene = { play, isExteriorHere, currentVariant, partyScreenSpots };

})();
