/*:
 * @target MZ
 * @plugindesc HyperTamer Virtual Pet System v3.0.0
 * @author Omni-Lex
 * @url
 * @help
 * ============================================================================
 * HyperTamer - Virtual Pet Plugin for RPG Maker MZ
 * ============================================================================
 *
 * A first generation keychain pet on a monochrome LCD. The creature lives in
 * real time, whether the device is open or not:
 *
 * - An egg hatches a minute after the device is first switched on.
 * - Egg, baby, child, teen and adult stages. Each form is a creature from the
 *   enemy database, and how well the last stage was kept (care mistakes and
 *   discipline) decides how strong the next form is.
 * - Four hunger hearts and four happy hearts that empty on their own.
 * - Meals (a hunger heart) and snacks (a happy heart, more weight, and too
 *   many make it sick).
 * - Droppings that make it sick if left, sickness that needs one or two
 *   doses of medicine, and death if a sickness or an empty stomach is left
 *   for half a day.
 * - A bedtime, and a light that has to be switched off once it sleeps.
 * - A call for attention: answer it within 15 minutes or it counts as a care
 *   mistake. Some calls are whims, answered with a scolding (discipline).
 * - The left or right guessing game: three wins in five for a happy heart.
 * - An Options screen inside the device: notices (ParchmentToast popups
 *   while the device is closed), sound, and a fresh egg.
 * - Old age: a well kept adult lives far longer than a neglected one.
 *
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 *
 * Open HyperTamer - Opens the virtual pet interface
 * Reset Pet - Lays a new egg (the current pet is lost!)
 *
 * @param lcdColorTint
 * @text LCD Color Tint
 * @desc Hex color for the LCD screen tint
 * @type string
 * @default #9BBC0F
 *
 * @param maxOfflineHours
 * @text Max Offline Hours
 * @desc Maximum hours the pet keeps living while the game is closed
 * @type number
 * @min 1
 * @max 168
 * @default 24
 *
 * @param deathEnabled
 * @text Enable Pet Death
 * @desc Can pets die from neglect, sickness and old age?
 * @type boolean
 * @default true
 *
 * @param feedSound
 * @text Feed Sound Effect
 * @desc Sound effect when feeding pet
 * @type file
 * @dir audio/se/
 * @default Heal1
 *
 * @param playSound
 * @text Play Sound Effect
 * @desc Sound effect of the guessing game
 * @type file
 * @dir audio/se/
 * @default Jump1
 *
 * @param cleanSound
 * @text Clean Sound Effect
 * @desc Sound effect when cleaning up after the pet
 * @type file
 * @dir audio/se/
 * @default Water1
 *
 * @param happySound
 * @text Happy Sound Effect
 * @desc Sound effect when pet is happy
 * @type file
 * @dir audio/se/
 * @default Coin
 *
 * @param sadSound
 * @text Sad Sound Effect
 * @desc Sound effect of a call for attention
 * @type file
 * @dir audio/se/
 * @default Down1
 *
 * @param growthSound
 * @text Growth Sound Effect
 * @desc Sound effect when the egg hatches or the pet grows
 * @type file
 * @dir audio/se/
 * @default Powerup
 *
 * @command openHyperTamer
 * @text Open HyperTamer
 * @desc Opens the virtual pet interface
 *
 * @command resetPet
 * @text Reset Pet
 * @desc Lays a new egg (the current pet is lost!)
 *
 */

(() => {
    'use strict';

    const pluginName = 'HyperTamer';
    const parameters = PluginManager.parameters(pluginName);

    const lcdColorTint = parseInt(String(parameters['lcdColorTint'] || '#9BBC0F').replace('#', '0x')) || 0x9BBC0F;
    const maxOfflineHours = Number(parameters['maxOfflineHours']) || 24;
    const deathEnabled = parameters['deathEnabled'] !== 'false';

    // Sound effects
    const soundEffects = {
        feed: parameters['feedSound'] || 'Heal1',
        play: parameters['playSound'] || 'Jump1',
        clean: parameters['cleanSound'] || 'Water1',
        happy: parameters['happySound'] || 'Coin',
        sad: parameters['sadSound'] || 'Down1',
        growth: parameters['growthSound'] || 'Powerup'
    };

    const DATA_VERSION = 3;
    const MINUTE = 60 * 1000;
    const HEARTS = 4;
    const MAX_POOPS = 4;
    // Minutes an unanswered call waits before it counts as a mistake.
    const CALL_GRACE = 15;
    // Minutes a sickness or an empty stomach can be left before it kills.
    const NEGLECT_DEATH = 12 * 60;
    // Minutes the oldest dropping can lie before it makes the pet sick.
    const DIRTY_SICK = 3 * 60;

    // Durations and emptying rates in minutes; sleep is [bedtime, wake hour]
    // on the real clock; weight is the stage's base weight in grams.
    const STAGE_RULES = {
        egg:   { lasts: 1 },
        baby:  { lasts: 60,       hunger: 6,  happy: 5,  poop: 12,  weight: 5,  sleep: null },
        child: { lasts: 24 * 60,  hunger: 40, happy: 35, poop: 90,  weight: 10, sleep: [20, 9] },
        teen:  { lasts: 48 * 60,  hunger: 55, happy: 50, poop: 120, weight: 20, sleep: [21, 9] },
        adult: { lasts: Infinity, hunger: 70, happy: 60, poop: 150, weight: 30, sleep: [22, 9] }
    };
    const NEXT_STAGE = { egg: 'baby', baby: 'child', child: 'teen', teen: 'adult' };


    // Register the plugin commands under both the bare name and the folder
    // qualified one: PluginManager.callCommand keys on whatever string the
    // event stored, and the calls saved in CommonEvents say 'Minigames/...'.
    [pluginName, 'Minigames/' + pluginName].forEach(key => {
        PluginManager.registerCommand(key, 'openHyperTamer', args => {
            SceneManager.push(Scene_HyperTamer);
        });
        PluginManager.registerCommand(key, 'resetPet', args => {
            $gameSystem.hyperTamerReset();
        });
    });

    //=============================================================================
    // Sound
    //=============================================================================

    const soundOn = function() {
        return !(window.$gameSystem && $gameSystem.hyperTamerOptions && !$gameSystem.hyperTamerOptions().sound);
    };

    const playPetSound = function(type) {
        if (!soundOn()) return;
        AudioManager.playSe({ name: soundEffects[type], volume: 90, pitch: 100, pan: 0 });
    };

    const playSystemSound = function(name) {
        if (!soundOn()) return;
        if (SoundManager[name]) SoundManager[name]();
    };

    //=============================================================================
    // LCD Filter for PIXI
    //=============================================================================

    class LCDFilter extends PIXI.Filter {
        constructor() {
            const vertexShader = `
                attribute vec2 aVertexPosition;
                attribute vec2 aTextureCoord;
                uniform mat3 projectionMatrix;
                varying vec2 vTextureCoord;
                void main(void) {
                    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
                    vTextureCoord = aTextureCoord;
                }
            `;

            const fragmentShader = `
                varying vec2 vTextureCoord;
                uniform sampler2D uSampler;
                uniform vec3 tint;

                void main(void) {
                    // Direct 1:1 texture sampling for crystal-clear LCD display
                    vec4 color = texture2D(uSampler, vTextureCoord);

                    // Convert to grayscale luminance
                    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));

                    // Apply LCD tint: maps luminance onto the LCD green color scheme
                    vec3 tinted = mix(vec3(0.0), tint, gray);

                    gl_FragColor = vec4(tinted, color.a);
                }
            `;

            super(vertexShader, fragmentShader);

            this.uniforms.tint = new Float32Array([
                ((lcdColorTint >> 16) & 0xFF) / 255,
                ((lcdColorTint >> 8) & 0xFF) / 255,
                (lcdColorTint & 0xFF) / 255
            ]);
        }
    }

    //=============================================================================
    // The pet simulation. Plain functions over the saved record, stepped one
    // real minute at a time, so a closed device and an open one age a pet the
    // same way. Every roll comes from the record's own generator.
    //=============================================================================

    const rand = function(data) {
        let t = (data.rng = (data.rng + 0x6D2B79F5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // The database dividers ("<-- 1-10 -->") carry a battler image but are
    // not creatures, and a boss is nobody's pet: <Boss> reads back as meta.Boss.
    const formPool = function() {
        const pool = (window.$dataEnemies || []).filter(e =>
            e && e.name && e.battlerName && !e.name.startsWith('<--') &&
            !(e.meta && (e.meta.Boss || e.meta.boss))
        );
        const power = e => (e.params || []).reduce((sum, v) => sum + (Number(v) || 0), 0);
        return pool.sort((a, b) => (power(a) - power(b)) || (a.id - b.id));
    };

    // A band is a slice of the pool ordered weakest first: [0.8, 1] is the
    // strongest fifth. The better the care, the higher the band.
    const formBand = function(data, stage) {
        const mistakes = data.careMistakes;
        switch (stage) {
            case 'baby':  return { band: [0, 0.2], quality: 'good' };
            case 'child': return { band: [0.1, 0.35], quality: 'good' };
            case 'teen':  return mistakes <= 2 ? { band: [0.45, 0.7], quality: 'good' }
                                               : { band: [0.25, 0.5], quality: 'bad' };
            default:
                if (mistakes <= 2 && data.discipline >= HEARTS) return { band: [0.8, 1], quality: 'best' };
                if (mistakes <= 3) return { band: [0.6, 0.85], quality: 'good' };
                if (mistakes <= 6) return { band: [0.4, 0.65], quality: 'medium' };
                return { band: [0.2, 0.45], quality: 'bad' };
        }
    };

    // Adult lifespan in days from hatching, by how the teen was kept.
    const LIFESPAN = { best: 18, good: 14, medium: 11, bad: 8 };

    const pickForm = function(data, band) {
        const pool = formPool();
        if (pool.length === 0) return null;
        const lo = Math.floor(band[0] * pool.length);
        const hi = Math.max(lo + 1, Math.ceil(band[1] * pool.length));
        const slice = pool.slice(lo, Math.min(hi, pool.length));
        const list = slice.length ? slice : pool;
        return list[Math.floor(rand(data) * list.length)];
    };

    const createEgg = function(now, generation) {
        const data = {
            version: DATA_VERSION,
            generation: generation || 1,
            rng: (Math.floor(Math.random() * 4294967296) >>> 0),
            simTime: now,
            stage: 'egg',
            stageMinutes: 0,
            ageMinutes: 0,
            petId: 0,
            petName: '',
            alive: true,
            cause: null,
            hunger: HEARTS,
            happy: HEARTS,
            weight: 5,
            discipline: 0,
            careMistakes: 0,
            totalMistakes: 0,
            disciplineMistakes: 0,
            poops: 0,
            dirtyMinutes: 0,
            sick: false,
            sickMinutes: 0,
            dosesLeft: 0,
            snackStreak: 0,
            starveMinutes: 0,
            asleep: false,
            lightsOn: true,
            whim: false,
            call: null,
            lifespan: 0,
            timers: { hunger: 0, happy: 0, poop: 0 }
            // NB: do not store the live $dataEnemies record here - it bloats saves
            // and goes stale across DB edits. Resolve via $dataEnemies[petId] on read.
        };
        return data;
    };

    const becomeForm = function(data, stage, events) {
        const oldName = data.petName;
        const oldBase = STAGE_RULES[data.stage].weight || 0;
        const pick = formBand(data, stage);
        const enemy = pickForm(data, pick.band);
        data.stage = stage;
        data.stageMinutes = 0;
        data.careMistakes = 0;
        if (enemy) {
            data.petId = enemy.id;
            data.petName = enemy.name;
        }
        data.weight = STAGE_RULES[stage].weight + Math.max(0, data.weight - oldBase);
        if (stage === 'adult') data.lifespan = LIFESPAN[pick.quality];
        events.push({ type: stage === 'baby' ? 'hatch' : 'evolve', from: oldName, name: data.petName });
    };

    const makeSick = function(data, events) {
        if (data.sick) return;
        data.sick = true;
        data.sickMinutes = 0;
        data.dosesLeft = rand(data) < 0.5 ? 1 : 2;
        events.push({ type: 'sick', name: data.petName });
    };

    const die = function(data, cause, events) {
        if (!deathEnabled) return;
        data.alive = false;
        data.cause = cause;
        data.call = null;
        events.push({ type: 'death', cause: cause, name: data.petName });
    };

    const isSleepHour = function(rule, time) {
        if (!rule.sleep) return false;
        const hour = new Date(time).getHours();
        const [bed, wake] = rule.sleep;
        return bed > wake ? (hour >= bed || hour < wake) : (hour >= bed && hour < wake);
    };

    const wantedCall = function(data) {
        if (data.asleep) return data.lightsOn ? 'lights' : null;
        if (data.hunger === 0) return 'hunger';
        if (data.happy === 0) return 'happy';
        if (data.whim) return 'whim';
        return null;
    };

    const updateCall = function(data, events) {
        const reason = wantedCall(data);
        if (!reason) {
            data.call = null;
        } else if (!data.call || data.call.reason !== reason) {
            data.call = { reason: reason, minutes: 0, counted: false };
            events.push({ type: 'call', reason: reason, name: data.petName });
        } else if (!data.call.counted && ++data.call.minutes >= CALL_GRACE) {
            data.call.counted = true;
            if (reason === 'whim') {
                // An ignored whim goes unpunished, and so the pet learns nothing.
                data.whim = false;
                data.disciplineMistakes++;
            } else {
                data.careMistakes++;
                data.totalMistakes++;
            }
            events.push({ type: 'mistake', reason: reason, name: data.petName });
        }
    };

    const stepMinute = function(data, time, events) {
        if (!data.alive) return;
        data.stageMinutes++;
        if (data.stage === 'egg') {
            if (data.stageMinutes >= STAGE_RULES.egg.lasts) becomeForm(data, 'baby', events);
            return;
        }
        data.ageMinutes++;
        const rule = STAGE_RULES[data.stage];

        const sleepy = isSleepHour(rule, time);
        if (sleepy && !data.asleep) {
            data.asleep = true;
            data.whim = false;
            events.push({ type: 'sleep', name: data.petName });
        } else if (!sleepy && data.asleep) {
            data.asleep = false;
            data.lightsOn = true;
        }

        if (!data.asleep) {
            if (++data.timers.hunger >= rule.hunger) {
                data.timers.hunger = 0;
                data.hunger = Math.max(0, data.hunger - 1);
            }
            if (++data.timers.happy >= rule.happy) {
                data.timers.happy = 0;
                data.happy = Math.max(0, data.happy - 1);
            }
            if (++data.timers.poop >= rule.poop) {
                data.timers.poop = 0;
                if (data.poops === 0) data.dirtyMinutes = 0;
                data.poops = Math.min(MAX_POOPS, data.poops + 1);
                events.push({ type: 'poop', name: data.petName });
            }
            if (!data.whim && !data.call && data.stage !== 'baby' && rand(data) < 1 / 240) {
                data.whim = true;
            }
        }

        if (data.poops > 0) {
            data.dirtyMinutes++;
            if (data.dirtyMinutes >= DIRTY_SICK || data.poops >= MAX_POOPS) makeSick(data, events);
        }

        if (data.sick && ++data.sickMinutes >= NEGLECT_DEATH) return die(data, 'sick', events);
        data.starveMinutes = data.hunger === 0 ? data.starveMinutes + 1 : 0;
        if (data.starveMinutes >= NEGLECT_DEATH) return die(data, 'hunger', events);

        updateCall(data, events);

        // A pet grows only once it is awake, the way the old handhelds did.
        if (data.stageMinutes >= rule.lasts && !data.asleep && NEXT_STAGE[data.stage]) {
            becomeForm(data, NEXT_STAGE[data.stage], events);
        }
        if (data.stage === 'adult' && data.lifespan > 0 &&
            Math.floor(data.ageMinutes / 1440) >= data.lifespan) {
            die(data, 'age', events);
        }
    };

    // Brings the record up to `now`. Time the game spent closed beyond the
    // offline cap is skipped, not lived.
    const simulate = function(data, now) {
        const events = [];
        if (!data) return events;
        const cap = maxOfflineHours * 60 * MINUTE;
        if (now - data.simTime > cap) data.simTime = now - cap;
        while (data.simTime + MINUTE <= now) {
            data.simTime += MINUTE;
            stepMinute(data, data.simTime, events);
            if (!data.alive) {
                data.simTime = now;
                break;
            }
        }
        return events;
    };

    const ageDays = data => Math.floor(data.ageMinutes / 1440);
    const stageWeight = data => STAGE_RULES[data.stage].weight || 5;

    // The buttons. Each returns the word the screen shows back.
    const Actions = {
        ready(data) {
            if (!data.alive) return 'dead';
            if (data.stage === 'egg') return 'egg';
            if (data.asleep) return 'asleep';
            return null;
        },
        meal(data) {
            const busy = Actions.ready(data);
            if (busy) return busy;
            if (data.whim) return 'refuse';
            if (data.hunger >= HEARTS) return 'full';
            data.hunger++;
            data.weight++;
            data.snackStreak = 0;
            return 'yum';
        },
        snack(data, events) {
            const busy = Actions.ready(data);
            if (busy) return busy;
            if (data.whim) return 'refuse';
            data.happy = Math.min(HEARTS, data.happy + 1);
            data.weight += 2;
            data.snackStreak++;
            if (data.snackStreak >= 3 && rand(data) < 0.5) makeSick(data, events || []);
            return 'yum';
        },
        lights(data, on) {
            data.lightsOn = !!on;
            return on ? 'lightOn' : 'lightOff';
        },
        canPlay(data) {
            const busy = Actions.ready(data);
            if (busy) return busy;
            if (data.whim) return 'refuse';
            if (data.sick) return 'refuse';
            return null;
        },
        gameResult(data, wins) {
            data.weight = Math.max(stageWeight(data), data.weight - 1);
            if (wins >= 3) data.happy = Math.min(HEARTS, data.happy + 1);
            return wins >= 3 ? 'gameWin' : 'gameLose';
        },
        medicine(data) {
            if (!data.alive) return 'dead';
            if (data.stage === 'egg') return 'egg';
            if (!data.sick) return 'notSick';
            data.dosesLeft = Math.max(0, data.dosesLeft - 1);
            if (data.dosesLeft > 0) return 'dose';
            data.sick = false;
            data.sickMinutes = 0;
            return 'cured';
        },
        bath(data) {
            if (!data.alive) return 'dead';
            if (data.stage === 'egg') return 'egg';
            data.poops = 0;
            data.dirtyMinutes = 0;
            return 'clean';
        },
        scold(data) {
            const busy = Actions.ready(data);
            if (busy) return busy;
            if (data.whim) {
                data.whim = false;
                data.call = null;
                data.discipline = Math.min(HEARTS, data.discipline + 1);
                return 'scolded';
            }
            data.happy = Math.max(0, data.happy - 1);
            return 'sulking';
        }
    };

    //=============================================================================
    // Game_System Extensions
    //=============================================================================

    Game_System.prototype.hyperTamerOptions = function() {
        if (!this._hyperTamerOptions) {
            this._hyperTamerOptions = { notifications: false, sound: true };
        }
        return this._hyperTamerOptions;
    };

    Game_System.prototype.hyperTamerData = function() {
        // The egg is laid the first time the device is opened, not at new
        // game: a device nobody ever looked at keeps no starving creature.
        // A pet from the old ruleset gives way to a fresh egg.
        if (!this._hyperTamerData || this._hyperTamerData.version !== DATA_VERSION) {
            this._hyperTamerData = createEgg(Date.now(), 1);
        }
        return this._hyperTamerData;
    };

    // The pet if the device was ever switched on, without laying an egg.
    Game_System.prototype.hyperTamerExisting = function() {
        const data = this._hyperTamerData;
        return data && data.version === DATA_VERSION ? data : null;
    };

    Game_System.prototype.hyperTamerReset = function() {
        const old = this.hyperTamerExisting();
        this._hyperTamerData = createEgg(Date.now(), old ? old.generation + 1 : 1);
    };

    Game_System.prototype.hyperTamerTick = function(now) {
        return simulate(this.hyperTamerExisting(), now == null ? Date.now() : now);
    };

    //=============================================================================
    // Notices: while the device is closed the pet keeps living, and with the
    // option on every call, sickness, growth and death reaches a toast.
    //=============================================================================

    const NOTICE_SEVERITY = { call: 'warning', sick: 'danger', death: 'danger', hatch: 'good', evolve: 'good', poop: 'info' };

    const noticeText = function(event) {
        const name = event.name || T('HyperTamer.stage_egg');
        switch (event.type) {
            case 'call': return T('HyperTamer.notice_' + event.reason, { name: name });
            case 'sick': return T('HyperTamer.notice_sick', { name: name });
            case 'poop': return T('HyperTamer.notice_poop', { name: name });
            case 'hatch': return T('HyperTamer.notice_hatch', { name: name });
            case 'evolve': return T('HyperTamer.notice_evolve', { from: event.from || name, name: name });
            case 'death': return T('HyperTamer.notice_death', { name: name });
            default: return null;
        }
    };

    const notify = function(events) {
        if (!events.length || !window.ParchmentToast) return;
        if (!$gameSystem.hyperTamerOptions().notifications) return;
        // A long absence can pile up a day of calls: say only the latest of each.
        const latest = {};
        events.forEach(e => { if (NOTICE_SEVERITY[e.type]) latest[e.type] = e; });
        Object.keys(latest).forEach(type => {
            const text = noticeText(latest[type]);
            if (!text) return;
            window.ParchmentToast.show(text, {
                title: T('HyperTamer.menuCommand'),
                severity: NOTICE_SEVERITY[type],
                key: 'hypertamer-' + type // i18n-ignore: toast dedupe key
            });
        });
    };

    if (typeof Scene_Map !== 'undefined') {
        const _Scene_Map_update = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            _Scene_Map_update.call(this);
            this._hyperTamerFrames = (this._hyperTamerFrames || 0) + 1;
            if (this._hyperTamerFrames < 60) return;
            this._hyperTamerFrames = 0;
            if (!window.$gameSystem || !$gameSystem.hyperTamerExisting()) return;
            notify($gameSystem.hyperTamerTick());
        };
    }

    //=============================================================================
    // Pixel glyphs: the LCD's own dot matrix pictures.
    //=============================================================================

    const GLYPHS = {
        heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
        heartEmpty: ['.XX.XX.', 'X..X..X', 'X.....X', '.X...X.', '..X.X..', '...X...'],
        skull: ['.XXXXX.', 'XXXXXXX', 'X..X..X', 'XXXXXXX', '.XX.XX.', '.XXXXX.', '.X.X.X.'],
        poop: ['...X....', '..XX....', '..XXX...', '.XXXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX'],
        egg: ['...XXX...', '..XXXXX..', '.XXX.XXX.', '.XXXXXXX.', 'XXXXXXXXX', 'XX.XXXX.X',
              'XXXXXXXXX', 'XXXX.XXXX', '.XXXXXXX.', '..XXXXX..'],
        grave: ['...XXX...', '..XXXXX..', '.XXXXXXX.', '.XXX.XXX.', '.XX...XX.', '.XXX.XXX.',
                '.XXX.XXX.', '.XXXXXXX.', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX'],
        segment: ['XXXXX', 'XXXXX', 'XXXXX', 'XXXXX'],
        segmentEmpty: ['XXXXX', 'X...X', 'X...X', 'XXXXX']
    };

    const drawGlyph = function(bitmap, name, x, y, scale, color) {
        const rows = GLYPHS[name];
        rows.forEach((row, ry) => {
            for (let rx = 0; rx < row.length; rx++) {
                if (row[rx] === 'X') bitmap.fillRect(x + rx * scale, y + ry * scale, scale, scale, color);
            }
        });
    };

    //=============================================================================
    // Scene_HyperTamer
    //=============================================================================

    const LCD_W = 320;
    const LCD_H = 240;
    const LIT = '#ffffff';
    const DIM = '#555555';
    const GROUND = '#1c1c1c';
    const PET_AREA = { y: 32, h: 176 };
    // The eight printed icons around the dot matrix, and the call light.
    const ICONS = ['food', 'light', 'game', 'med', 'bath', 'meter', 'scold', 'options'];
    const ICON_RECTS = [
        { x: 0, y: 4 }, { x: 64, y: 4 }, { x: 128, y: 4 }, { x: 192, y: 4 }, { x: 256, y: 4 },
        { x: 0, y: 212 }, { x: 80, y: 212 }, { x: 160, y: 212 }
    ].map((r, i) => Object.assign({ w: i < 5 ? 64 : 80, h: 24 }, r));
    const CALL_RECT = { x: 240, y: 212, w: 80, h: 24 };
    const OPTIONS = ['notifications', 'sound', 'reset'];
    const ROUNDS = 5;

    class Scene_HyperTamer extends Scene_Base {
        initialize() {
            super.initialize();
            this._mode = 'main';
            this._selected = -1;
            this._cursor = 0;
            this._frame = 0;
            this._tickFrames = 0;
            this._petX = LCD_W / 2;
            this._petDir = 1;
            this._anim = null;
            this._game = null;
            this._confirmReset = false;
        }

        create() {
            super.create();
            $gameSystem.hyperTamerData();
            $gameSystem.hyperTamerTick();
            this.createBackground();
            this.createLCDScreen();
            this.createDeviceFrame();
            this.loadPet();
            this.redraw();
            if (window.MinigameFun) window.MinigameFun.played('Animal Training'); // i18n-ignore: specialization id
        }

        data() {
            return $gameSystem.hyperTamerData();
        }

        createBackground() {
            this._backgroundSprite = new Sprite();
            this._backgroundSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
            this._backgroundSprite.bitmap.fillAll('black');
            this.addChild(this._backgroundSprite);
        }

        createLCDScreen() {
            this._lcdContainer = new Sprite();
            this._lcdContainer.bitmap = new Bitmap(LCD_W, LCD_H);
            // The filter maps luminance onto the tint, so the panel's own
            // ground has to be dark: it is the unlit state of the display.
            this._lcdContainer.bitmap.fillRect(0, 0, LCD_W, LCD_H, GROUND);
            this._lcdContainer.x = Math.floor((Graphics.width - LCD_W) / 2);
            this._lcdContainer.y = Math.floor((Graphics.height - LCD_H) / 2) - 50;
            this._lcdFilter = new LCDFilter();
            this._lcdContainer.filters = [this._lcdFilter];
            this.addChild(this._lcdContainer);

            this._petSprite = new Sprite();
            this._petSprite.anchor.x = 0.5;
            this._petSprite.anchor.y = 1;
            this._petSprite.visible = false;
            this._lcdContainer.addChild(this._petSprite);

            this._overlay = new Sprite();
            this._overlay.bitmap = new Bitmap(LCD_W, LCD_H);
            this._lcdContainer.addChild(this._overlay);
        }

        loadPet() {
            const data = this.data();
            const enemy = data.petId ? $dataEnemies[data.petId] : null;
            this._petBaseScale = 1;
            this._petLoadedId = data.petId;
            if (!enemy || !enemy.battlerName) {
                this._petSprite.bitmap = null;
                return;
            }
            const bitmap = ImageManager.loadEnemy(enemy.battlerName);
            this._petSprite.bitmap = bitmap;
            this._petSprite.setFrame(0, 0, 0, 0);
            bitmap.addLoadListener(() => {
                if (this._petSprite.bitmap !== bitmap) return;
                // The frame is opened up only now: it was collapsed while
                // the battler loaded so no stray corner of the sheet showed.
                this._petSprite.setFrame(0, 0, bitmap.width, bitmap.height);
                // The younger the form, the smaller it is drawn.
                const room = { baby: 70, child: 95, teen: 120, adult: 150 }[data.stage] || 120;
                this._petBaseScale = Math.min(room / bitmap.width, room / bitmap.height, 1);
            });
        }

        createDeviceFrame() {
            const w = Graphics.width;
            const h = Graphics.height;
            const lx = this._lcdContainer.x;
            const ly = this._lcdContainer.y;
            const bitmap = new Bitmap(w, h);
            // Shell, then the bezel ring, then the window punched back out so
            // the LCD underneath shows through the middle of the case.
            bitmap.gradientFillRect(0, 0, w, h, '#d8d4c0', '#a29e8c', true);
            bitmap.fillRect(lx - 16, ly - 16, LCD_W + 32, LCD_H + 32, '#3a3a32');
            bitmap.clearRect(lx, ly, LCD_W, LCD_H);
            // The three buttons under the screen, A B C like the old keychains.
            this._shellButtons = ['A', 'B', 'C'].map((id, i) => ({
                id: id, x: w / 2 + (i - 1) * 80, y: ly + LCD_H + 64 + (i === 1 ? 12 : 0), r: 20
            }));
            this._shellButtons.forEach(b => {
                bitmap.drawCircle(b.x, b.y + 3, b.r, '#6e6b5c');
                bitmap.drawCircle(b.x, b.y, b.r, '#c84a3a');
                bitmap.fontSize = 16;
                bitmap.textColor = '#3a3a32';
                bitmap.outlineWidth = 0;
                bitmap.drawText(T('HyperTamer.button' + b.id), b.x - 20, b.y + b.r + 4, 40, 20, 'center');
            });
            this._deviceFrame = new Sprite(bitmap);
            this.addChild(this._deviceFrame);
        }

        //-------------------------------------------------------------------------
        // Buttons
        //-------------------------------------------------------------------------

        // A: next icon or next choice. In the game, the left guess.
        pressA() {
            if (this._anim) return;
            const data = this.data();
            if (!data.alive) return;
            switch (this._mode) {
                case 'main':
                    this._selected = (this._selected + 1) % ICONS.length;
                    playSystemSound('playCursor');
                    break;
                case 'feed': case 'light':
                    this._cursor = 1 - this._cursor;
                    playSystemSound('playCursor');
                    break;
                case 'options':
                    this._cursor = (this._cursor + 1) % OPTIONS.length;
                    this._confirmReset = false;
                    playSystemSound('playCursor');
                    break;
                case 'meter':
                    this._cursor = (this._cursor + 1) % 4;
                    playSystemSound('playCursor');
                    break;
                case 'game':
                    this.guess('left');
                    break;
            }
            this.redraw();
        }

        // B: carry out. In the game, the right guess.
        pressB() {
            if (this._anim) return;
            const data = this.data();
            if (!data.alive) {
                $gameSystem.hyperTamerReset();
                this.backToMain();
                this.loadPet();
                playPetSound('growth');
                this.redraw();
                return;
            }
            switch (this._mode) {
                case 'main':
                    if (this._selected < 0) this._selected = 0;
                    else this.execute(ICONS[this._selected]);
                    break;
                case 'feed': {
                    const events = [];
                    const word = this._cursor === 0 ? Actions.meal(data) : Actions.snack(data, events);
                    this.showResult(word, word === 'yum' ? 'feed' : null);
                    break;
                }
                case 'light':
                    this.showResult(Actions.lights(data, this._cursor === 0), null);
                    break;
                case 'meter':
                    this._cursor = (this._cursor + 1) % 4;
                    playSystemSound('playCursor');
                    break;
                case 'options':
                    this.chooseOption();
                    break;
                case 'game':
                    this.guess('right');
                    break;
            }
            this.redraw();
        }

        // C: back out. With nothing selected, the device is put away.
        pressC() {
            if (this._anim) return;
            if (this._mode === 'game') return;
            if (this._mode !== 'main') {
                this.backToMain();
                playSystemSound('playCancel');
            } else if (this._selected >= 0) {
                this._selected = -1;
                playSystemSound('playCancel');
            } else {
                this.popScene();
                return;
            }
            this.redraw();
        }

        backToMain() {
            this._mode = 'main';
            this._cursor = 0;
            this._confirmReset = false;
            this._game = null;
        }

        execute(icon) {
            const data = this.data();
            switch (icon) {
                case 'food':
                    this._mode = 'feed';
                    this._cursor = 0;
                    playSystemSound('playOk');
                    break;
                case 'light':
                    this._mode = 'light';
                    this._cursor = data.lightsOn ? 0 : 1;
                    playSystemSound('playOk');
                    break;
                case 'game': {
                    const busy = Actions.canPlay(data);
                    if (busy) this.showResult(busy, null);
                    else this.startGame();
                    break;
                }
                case 'med': {
                    const word = Actions.medicine(data);
                    this.showResult(word, word === 'cured' ? 'happy' : null);
                    break;
                }
                case 'bath': {
                    const word = Actions.bath(data);
                    this.showResult(word, word === 'clean' ? 'clean' : null, word === 'clean' ? 'bath' : null);
                    break;
                }
                case 'meter':
                    this._mode = 'meter';
                    this._cursor = 0;
                    playSystemSound('playOk');
                    break;
                case 'scold':
                    this.showResult(Actions.scold(data), null);
                    break;
                case 'options':
                    this._mode = 'options';
                    this._cursor = 0;
                    this._confirmReset = false;
                    playSystemSound('playOk');
                    break;
            }
        }

        chooseOption() {
            const options = $gameSystem.hyperTamerOptions();
            const option = OPTIONS[this._cursor];
            if (option === 'notifications') {
                options.notifications = !options.notifications;
                playSystemSound('playOk');
            } else if (option === 'sound') {
                options.sound = !options.sound;
                playSystemSound('playOk');
            } else if (!this._confirmReset) {
                this._confirmReset = true;
                playSystemSound('playOk');
            } else {
                $gameSystem.hyperTamerReset();
                this.backToMain();
                this._selected = -1;
                this.loadPet();
                playPetSound('growth');
            }
        }

        // A short reply on the screen, then back to the icons.
        showResult(word, sound, kind) {
            const bad = ['refuse', 'full', 'egg', 'asleep', 'notSick', 'sulking', 'dead'];
            if (sound) playPetSound(sound);
            else if (bad.includes(word)) playSystemSound('playBuzzer');
            else playSystemSound('playOk');
            this._mode = 'main';
            this._anim = { word: word, kind: kind || null, frames: 70, total: 70 };
        }

        //-------------------------------------------------------------------------
        // The left or right game
        //-------------------------------------------------------------------------

        startGame() {
            playSystemSound('playOk');
            this._mode = 'game';
            this._game = { round: 1, wins: 0, losses: 0, phase: 'guess', side: null, won: false, frames: 0 };
            this._petX = LCD_W / 2;
        }

        guess(side) {
            const game = this._game;
            if (!game || game.phase !== 'guess') return;
            const data = this.data();
            game.side = rand(data) < 0.5 ? 'left' : 'right';
            game.won = game.side === side;
            if (game.won) game.wins++;
            else game.losses++;
            game.phase = 'reveal';
            game.frames = 45;
            this._petX = game.side === 'left' ? 90 : 230;
            this._petDir = game.side === 'left' ? -1 : 1;
            if (game.won) playPetSound('play');
            else playSystemSound('playBuzzer');
        }

        updateGame() {
            const game = this._game;
            if (!game || game.phase === 'guess') return;
            if (--game.frames > 0) return;
            if (game.phase === 'reveal') {
                this._petX = LCD_W / 2;
                if (game.round >= ROUNDS) {
                    game.phase = 'score';
                    game.frames = 90;
                } else {
                    game.round++;
                    game.phase = 'guess';
                }
            } else if (game.phase === 'score') {
                const word = Actions.gameResult(this.data(), game.wins);
                // i18n-ignore: 'Animal Training' is the specialization id
                if (window.MinigameFun) (game.wins >= 3) ? window.MinigameFun.won('Animal Training') : window.MinigameFun.lost('Animal Training');
                this._game = null;
                this.showResult(word, game.wins >= 3 ? 'happy' : null);
            }
            this.redraw();
        }

        //-------------------------------------------------------------------------
        // Drawing
        //-------------------------------------------------------------------------

        redraw() {
            const b = this._overlay.bitmap;
            const data = this.data();
            b.clear();
            b.outlineWidth = 0;
            this.drawIcons(b, data);
            this._petSprite.visible = false;

            if (!data.alive) return this.drawGrave(b, data);
            if (this._anim) return this.drawAnim(b, data);
            switch (this._mode) {
                case 'feed': return this.drawChoice(b, [T('HyperTamer.meal'), T('HyperTamer.snack')]);
                case 'light': return this.drawChoice(b, [T('HyperTamer.lightOn'), T('HyperTamer.lightOff')]);
                case 'meter': return this.drawMeter(b, data);
                case 'options': return this.drawOptions(b);
                case 'game': return this.drawGame(b, data);
                default: return this.drawPetArea(b, data);
            }
        }

        drawIcons(b, data) {
            b.fontSize = 12;
            ICONS.forEach((icon, i) => {
                const r = ICON_RECTS[i];
                if (i === this._selected) {
                    b.fillRect(r.x + 3, r.y, r.w - 6, r.h, LIT);
                    b.textColor = GROUND;
                } else {
                    b.textColor = LIT;
                }
                b.drawText(T('HyperTamer.icon_' + icon), r.x, r.y, r.w, r.h, 'center');
            });
            // The call light blinks while the pet wants something.
            const calling = data.alive && data.call && (this._frame % 40) < 26;
            if (calling) b.fillRect(CALL_RECT.x + 3, CALL_RECT.y, CALL_RECT.w - 6, CALL_RECT.h, LIT);
            b.textColor = calling ? GROUND : DIM;
            b.drawText(T('HyperTamer.icon_call'), CALL_RECT.x, CALL_RECT.y, CALL_RECT.w, CALL_RECT.h, 'center');
            b.textColor = LIT;
        }

        showPet(x, bob) {
            const data = this.data();
            if (!this._petSprite.bitmap) return;
            const s = this._petBaseScale || 1;
            this._petSprite.visible = true;
            this._petSprite.x = Math.round(x);
            this._petSprite.y = PET_AREA.y + PET_AREA.h - 8 - (bob || 0);
            this._petSprite.scale.x = s * this._petDir;
            this._petSprite.scale.y = s;
            if (data.asleep) this._petSprite.scale.y = s * (0.95 + (Math.floor(this._frame / 30) % 2) * 0.05);
        }

        drawPetArea(b, data) {
            if (!data.lightsOn) {
                b.fillRect(0, PET_AREA.y, LCD_W, PET_AREA.h, '#000000');
                return;
            }
            const mid = PET_AREA.y + PET_AREA.h / 2;
            if (data.stage === 'egg') {
                const wobble = (Math.floor(this._frame / 20) % 2) * 4 - 2;
                drawGlyph(b, 'egg', LCD_W / 2 - 27 + wobble, mid - 30, 6, LIT);
                return;
            }
            this.showPet(this._petX, 0);
            if (data.asleep) {
                b.fontSize = 14 + (Math.floor(this._frame / 30) % 2) * 4;
                b.drawText(T('HyperTamer.zzz'), this._petX + 30, PET_AREA.y + 8, 60, 24, 'left');
            }
            for (let i = 0; i < data.poops; i++) {
                const col = Math.floor(i / 2);
                const row = i % 2;
                drawGlyph(b, 'poop', LCD_W - 34 - col * 30, PET_AREA.y + PET_AREA.h - 30 - row * 32, 3, LIT);
            }
            if (data.sick) drawGlyph(b, 'skull', 12, PET_AREA.y + 8, 3, LIT);
        }

        drawChoice(b, lines) {
            b.fontSize = 22;
            lines.forEach((line, i) => {
                const y = PET_AREA.y + 44 + i * 44;
                if (i === this._cursor) b.fillRect(90, y + 12, 10, 10, LIT);
                b.drawText(line, 110, y, 180, 34, 'left');
            });
        }

        drawHearts(b, filled, y) {
            for (let i = 0; i < HEARTS; i++) {
                drawGlyph(b, i < filled ? 'heart' : 'heartEmpty', 82 + i * 42, y, 5, LIT);
            }
        }

        drawMeter(b, data) {
            const top = PET_AREA.y + 16;
            b.fontSize = 18;
            switch (this._cursor) {
                case 0:
                    b.drawText(data.petName || T('HyperTamer.stage_egg'), 0, top, LCD_W, 26, 'center');
                    b.fontSize = 15;
                    b.drawText(T('HyperTamer.stage_' + data.stage), 0, top + 30, LCD_W, 22, 'center');
                    b.drawText(T('HyperTamer.ageLine', { n: ageDays(data) }), 0, top + 58, LCD_W, 22, 'center');
                    b.drawText(T('HyperTamer.weightLine', { n: data.weight }), 0, top + 84, LCD_W, 22, 'center');
                    b.drawText(T('HyperTamer.generationLine', { n: data.generation }), 0, top + 110, LCD_W, 22, 'center');
                    break;
                case 1:
                    b.drawText(T('HyperTamer.discipline'), 0, top + 20, LCD_W, 26, 'center');
                    for (let i = 0; i < HEARTS; i++) {
                        drawGlyph(b, i < data.discipline ? 'segment' : 'segmentEmpty', 70 + i * 48, top + 70, 8, LIT);
                    }
                    break;
                case 2:
                    b.drawText(T('HyperTamer.hungry'), 0, top + 20, LCD_W, 26, 'center');
                    this.drawHearts(b, data.hunger, top + 70);
                    break;
                default:
                    b.drawText(T('HyperTamer.happy'), 0, top + 20, LCD_W, 26, 'center');
                    this.drawHearts(b, data.happy, top + 70);
            }
        }

        drawOptions(b) {
            const options = $gameSystem.hyperTamerOptions();
            b.fontSize = 17;
            OPTIONS.forEach((option, i) => {
                const y = PET_AREA.y + 26 + i * 44;
                if (i === this._cursor) b.fillRect(22, y + 11, 8, 8, LIT);
                b.drawText(T('HyperTamer.opt_' + option), 40, y, 170, 30, 'left');
                let value = '';
                if (option === 'notifications') value = T(options.notifications ? 'HyperTamer.optOn' : 'HyperTamer.optOff');
                else if (option === 'sound') value = T(options.sound ? 'HyperTamer.optOn' : 'HyperTamer.optOff');
                else if (this._confirmReset && i === this._cursor) value = T('HyperTamer.optConfirm');
                b.drawText(value, 200, y, 100, 30, 'right');
            });
        }

        drawGame(b, data) {
            const game = this._game;
            if (!game) return;
            b.fontSize = 14;
            b.drawText(T('HyperTamer.gameRound', { n: game.round, total: ROUNDS }), 8, PET_AREA.y + 4, 150, 20, 'left');
            b.drawText(T('HyperTamer.gameScore', { w: game.wins, l: game.losses }), 160, PET_AREA.y + 4, 150, 20, 'right');
            if (game.phase === 'score') {
                b.fontSize = 30;
                b.drawText(T('HyperTamer.gameScore', { w: game.wins, l: game.losses }), 0, PET_AREA.y + 60, LCD_W, 40, 'center');
                b.fontSize = 18;
                b.drawText(T(game.wins >= 3 ? 'HyperTamer.gameWin' : 'HyperTamer.gameLose'), 0, PET_AREA.y + 104, LCD_W, 30, 'center');
                return;
            }
            this.showPet(this._petX, game.phase === 'reveal' && game.won ? 10 : 0);
            if (game.phase === 'guess') {
                b.fontSize = 26;
                b.drawText(T('HyperTamer.gameAsk'), 0, PET_AREA.y + 24, LCD_W, 36, 'center');
            } else {
                b.fontSize = 18;
                b.drawText(T(game.won ? 'HyperTamer.roundWin' : 'HyperTamer.roundLose'), 0, PET_AREA.y + 28, LCD_W, 30, 'center');
            }
        }

        drawAnim(b, data) {
            const anim = this._anim;
            if (data.lightsOn && data.stage !== 'egg') {
                const bob = (anim.word === 'yum' || anim.word === 'cured' || anim.word === 'gameWin')
                    ? (Math.floor(this._frame / 8) % 2) * 6 : 0;
                this.showPet(LCD_W / 2, bob);
            } else if (data.stage === 'egg') {
                drawGlyph(b, 'egg', LCD_W / 2 - 27, PET_AREA.y + 58, 6, LIT);
            }
            if (anim.kind === 'bath') {
                // The flush sweeps across the screen.
                const x = Math.floor(LCD_W * (1 - anim.frames / anim.total));
                b.fillRect(x, PET_AREA.y, 4, PET_AREA.h, LIT);
                b.fillRect(Math.max(0, x - 12), PET_AREA.y, 2, PET_AREA.h, LIT);
            }
            b.fontSize = 20;
            b.drawText(T('HyperTamer.say_' + anim.word), 0, PET_AREA.y + 6, LCD_W, 30, 'center');
        }

        drawGrave(b, data) {
            drawGlyph(b, 'grave', LCD_W / 2 - 27, PET_AREA.y + 6, 6, LIT);
            b.fontSize = 18;
            b.drawText(T('HyperTamer.petDied'), 0, PET_AREA.y + 80, LCD_W, 26, 'center');
            b.fontSize = 14;
            const cause = data.cause ? T('HyperTamer.cause_' + data.cause) : '';
            b.drawText(T('HyperTamer.graveLine', { name: data.petName || T('HyperTamer.stage_egg'), n: ageDays(data), cause: cause }),
                0, PET_AREA.y + 108, LCD_W, 22, 'center');
            b.drawText(T('HyperTamer.hatchNew'), 0, PET_AREA.y + 138, LCD_W, 22, 'center');
        }

        //-------------------------------------------------------------------------
        // Frame loop
        //-------------------------------------------------------------------------

        handleEvents(events) {
            events.forEach(e => {
                if (e.type === 'call') playPetSound('sad');
                else if (e.type === 'hatch' || e.type === 'evolve') playPetSound('growth');
                else if (e.type === 'death') playPetSound('sad');
            });
            const data = this.data();
            if (data.petId !== this._petLoadedId) this.loadPet();
            if (!data.alive) {
                this.backToMain();
                this._anim = null;
            }
        }

        handleTouch() {
            if (!TouchInput.isTriggered()) return;
            const tx = TouchInput.x;
            const ty = TouchInput.y;
            const hit = (this._shellButtons || []).find(btn => Math.hypot(tx - btn.x, ty - btn.y) <= btn.r + 6);
            if (hit) {
                this['press' + hit.id]();
                return;
            }
            // Touching a printed icon picks it and presses it.
            const lx = tx - this._lcdContainer.x;
            const ly = ty - this._lcdContainer.y;
            if (this._mode !== 'main' || this._anim || !this.data().alive) return;
            const index = ICON_RECTS.findIndex(r => lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h);
            if (index >= 0) {
                this._selected = index;
                this.execute(ICONS[index]);
                this.redraw();
            }
        }

        update() {
            super.update();
            this._frame++;

            // The pet lives by the real clock: catch it up once a second.
            if (++this._tickFrames >= 60) {
                this._tickFrames = 0;
                const events = $gameSystem.hyperTamerTick();
                if (events.length) this.handleEvents(events);
            }

            if (Input.isTriggered('cancel')) this.pressC();
            else if (Input.isTriggered('ok')) this.pressB();
            else if (this._mode === 'game' && Input.isTriggered('left')) this.guess('left');
            else if (this._mode === 'game' && Input.isTriggered('right')) this.guess('right');
            else if (Input.isRepeated('right')) this.pressA();
            else if (Input.isRepeated('left')) this.stepBack();
            else this.handleTouch();

            if (this._anim && --this._anim.frames <= 0) this._anim = null;
            this.updateGame();
            this.updateWalk();

            // An LCD does not redraw every frame.
            if (this._frame % 6 === 0) this.redraw();
        }

        // Left walks the choices backwards, the counterpart of A.
        stepBack() {
            if (this._anim || !this.data().alive) return;
            if (this._mode === 'main') {
                this._selected = (this._selected - 1 + ICONS.length) % ICONS.length;
            } else if (this._mode === 'feed' || this._mode === 'light') {
                this._cursor = 1 - this._cursor;
            } else if (this._mode === 'options') {
                this._cursor = (this._cursor - 1 + OPTIONS.length) % OPTIONS.length;
                this._confirmReset = false;
            } else if (this._mode === 'meter') {
                this._cursor = (this._cursor + 3) % 4;
            } else {
                return;
            }
            playSystemSound('playCursor');
            this.redraw();
        }

        // Awake and idle, the pet shuffles across the screen in steps.
        updateWalk() {
            const data = this.data();
            if (this._mode !== 'main' || this._anim || !data.alive || data.asleep || data.stage === 'egg') return;
            if (this._frame % 40 !== 0) return;
            if (Math.random() < 0.25) this._petDir = -this._petDir;
            const next = this._petX + this._petDir * 12;
            if (next < 80 || next > 220) this._petDir = -this._petDir;
            else this._petX = next;
        }
    }

    window.Scene_HyperTamer = Scene_HyperTamer;
    window.HyperTamer = {
        STAGE_RULES: STAGE_RULES,
        Actions: Actions,
        createEgg: createEgg,
        simulate: simulate,
        formPool: formPool,
        noticeText: noticeText,
        notify: notify
    };
})();
