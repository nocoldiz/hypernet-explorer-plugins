/*:
 * @target MZ
 * @plugindesc Visual Piano v2.1.0 - Three-octave visual keyboard with full-QWERTY and gamepad play
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * Visual Piano Plugin for RPG Maker MZ
 * ============================================================================
 *
 * A visual three-octave piano keyboard (C3 to B5) playable with the whole
 * typing keyboard, a gamepad, or the mouse. Keys light up when pressed and
 * show the button bound to them.
 *
 * ----------------------------------------------------------------------------
 * KEYBOARD (tracker / DAW style, two manuals)
 * ----------------------------------------------------------------------------
 * Lower manual (starts on the base octave):
 *   whites  Z X C V B N M , . /  '
 *   blacks   S D   G H J   L ;
 * Upper manual (one octave above the lower one):
 *   whites  Q W E R T Y U I O P [ ]
 *   blacks   2 3   5 6 7   9 0   = \
 *
 * Every alphanumeric and punctuation key is bound: the keys sitting where a
 * black key cannot exist (A F K 1 4 8 - `) double the white note under them,
 * so no key on the board is dead.
 *
 * Other controls:
 * - Shift      : cycle the voice (piano / sine / square / triangle / sawtooth)
 * - F1-F5      : pick a voice directly
 * - Up / Down  : transpose the whole keyboard one octave
 * - Left/Right : move the on-screen cursor (shared with the gamepad)
 * - Space      : sustain pedal
 * - Escape     : close the piano
 *
 * ----------------------------------------------------------------------------
 * GAMEPAD
 * ----------------------------------------------------------------------------
 * - Left stick / D-pad Left-Right : move the cursor one semitone
 * - D-pad Up / Down               : move the cursor one octave
 * - A                             : play the key under the cursor (held)
 * - X                             : cycle the voice
 * - Y                             : sustain pedal (held)
 * - LB / RB                       : transpose one octave down / up
 * - LT / RT                       : cursor one octave down / up
 * - B                             : close the piano
 *
 * ============================================================================
 *
 * @command openPiano
 * @text Open Piano
 * @desc Opens the visual piano interface
 *
 * @command closePiano
 * @text Close Piano
 * @desc Closes the visual piano interface
 *
 * @command setWaveform
 * @text Set Waveform
 * @desc Changes the synthesizer voice
 * @arg waveform
 * @type select
 * @option piano
 * @option sine
 * @option square
 * @option triangle
 * @option sawtooth
 * @default piano
 * @desc Select the voice
 *
 * @param defaultWaveform
 * @text Default Waveform
 * @type select
 * @option piano
 * @option sine
 * @option square
 * @option triangle
 * @option sawtooth
 * @default piano
 * @desc Default voice when the piano opens
 *
 * @param defaultVolume
 * @text Default Volume
 * @type number
 * @min 0
 * @max 100
 * @default 30
 * @desc Instrument volume (0-100). Scaled by the SE volume setting.
 */

(() => {
    'use strict';

    const pluginName = 'VisualPiano';
    const parameters = PluginManager.parameters(pluginName);
    const defaultWaveform = parameters.defaultWaveform || 'piano';
    const defaultVolume = (parseInt(parameters.defaultVolume) || 30) / 100;

    // Notes struck per point of Playing Piano (specialization 209). Roughly a
    // short passage; the daily cap in SpecializationXP does the rest.
    const NOTES_PER_POINT = 24;

    const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const BLACK_NOTES = { 'C#': 0, 'D#': 1, 'F#': 3, 'G#': 4, 'A#': 5 };
    // 'piano' is not an oscillator type: it is a struck-string voice built from
    // the harmonic table below. The four raw oscillator shapes follow it.
    const WAVEFORMS = ['piano', 'sine', 'square', 'triangle', 'sawtooth'];

    // Amplitude of each partial of the piano voice, fundamental first. Even
    // partials stay present but weak, which is what keeps it from reading as a
    // clarinet, and the tail is short enough to avoid a buzzing top end.
    const PIANO_PARTIALS = [
        1, 0.42, 0.28, 0.16, 0.11, 0.075, 0.05, 0.035,
        0.024, 0.017, 0.012, 0.008, 0.006, 0.004
    ];
    // Two strings per note, a few cents apart: the beating between them is most
    // of what a listener hears as "piano" rather than "organ".
    const PIANO_DETUNE = 7;

    // Peak amplitude of a single note, per voice. The raw shapes are levelled
    // against each other by ear (a sawtooth carries far more energy than a sine
    // at the same amplitude), so switching voice does not change how loud the
    // instrument is, and a full chord stays inside the limiter.
    const VOICE_PEAK = {
        piano: 0.34, sine: 0.34, triangle: 0.30, square: 0.17, sawtooth: 0.19
    };
    const OCTAVE_COUNT = 3;
    const MIN_BASE_OCTAVE = 0;
    const MAX_BASE_OCTAVE = 7;

    // Every key of a QWERTY board, laid out like a tracker's typing keyboard:
    // two manuals an octave apart, whites on the home rows, blacks on the row
    // above. Entries flagged `gap` sit where a black key cannot exist (E#/B#)
    // and simply double the white note beneath them, so no key is dead.
    // [ code, note, octave offset, gap ]
    const KEY_MAP_TABLE = [
        // --- Lower manual: whites Z X C V B N M , . / ' -----------------
        ['KeyA', 'C', 0, true],
        ['KeyZ', 'C', 0], ['KeyS', 'C#', 0],
        ['KeyX', 'D', 0], ['KeyD', 'D#', 0],
        ['KeyC', 'E', 0], ['KeyF', 'E', 0, true],
        ['KeyV', 'F', 0], ['KeyG', 'F#', 0],
        ['KeyB', 'G', 0], ['KeyH', 'G#', 0],
        ['KeyN', 'A', 0], ['KeyJ', 'A#', 0],
        ['KeyM', 'B', 0], ['KeyK', 'B', 0, true],
        ['Comma', 'C', 1], ['KeyL', 'C#', 1],
        ['Period', 'D', 1], ['Semicolon', 'D#', 1],
        ['Slash', 'E', 1], ['Quote', 'F', 1, true],
        // --- Upper manual: whites Q W E R T Y U I O P [ ] ---------------
        ['Backquote', 'B', 0, true],
        ['KeyQ', 'C', 1], ['Digit1', 'C', 1, true], ['Digit2', 'C#', 1],
        ['KeyW', 'D', 1], ['Digit3', 'D#', 1],
        ['KeyE', 'E', 1], ['Digit4', 'E', 1, true],
        ['KeyR', 'F', 1], ['Digit5', 'F#', 1],
        ['KeyT', 'G', 1], ['Digit6', 'G#', 1],
        ['KeyY', 'A', 1], ['Digit7', 'A#', 1],
        ['KeyU', 'B', 1], ['Digit8', 'B', 1, true],
        ['KeyI', 'C', 2], ['Digit9', 'C#', 2],
        ['KeyO', 'D', 2], ['Digit0', 'D#', 2],
        ['KeyP', 'E', 2], ['Minus', 'E', 2, true],
        ['BracketLeft', 'F', 2], ['Equal', 'F#', 2],
        ['BracketRight', 'G', 2], ['Backslash', 'G#', 2]
    ];

    const PUNCT_LABELS = {
        Comma: ',', Period: '.', Semicolon: ';', Slash: '/', Quote: "'",
        BracketLeft: '[', BracketRight: ']', Backslash: '\\',
        Minus: '-', Equal: '=', Backquote: '`'
    };

    // The piano is an instrument the player is holding, so it obeys the SE
    // slider (and, through it, the master volume) like any other sound effect.
    function seVolumeScale() {
        if (typeof AudioManager === 'undefined') return 1;
        const level = typeof AudioManager.getConfigVolume_Se === 'function'
            ? AudioManager.getConfigVolume_Se()
            : AudioManager.seVolume;
        const n = Number(level);
        if (!isFinite(n)) return 1;
        return Math.max(0, Math.min(100, n)) / 100;
    }

    function labelForCode(code) {
        if (PUNCT_LABELS[code]) return PUNCT_LABELS[code];
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        return code;
    }

    // Gamepad button indices (standard mapping)
    const PAD = {
        A: 0, B: 1, X: 2, Y: 3,
        LB: 4, RB: 5, LT: 6, RT: 7,
        DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15
    };
    const PAD_POLL_MS = 16;
    const PAD_AXIS_DEADZONE = 0.5;
    const PAD_REPEAT_MS = 140;

    class VisualPiano {
        constructor() {
            this.audioContext = null;
            this.masterGain = null;
            this.waveform = defaultWaveform;
            this.activeNotes = new Map();
            this.sustain = false;
            this.baseOctave = 3;
            this.isOpen = false;

            this.noteToMidi = {
                'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
                'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
            };

            // code -> { note, octave, type, gap }, plus the reverse lookup used
            // for the labels printed on each drawn key (primary binding wins).
            this.keyMappings = {};
            this.semitoneLabels = {};
            for (const [code, note, octave, gap] of KEY_MAP_TABLE) {
                this.keyMappings[code] = {
                    note, octave, gap: !!gap,
                    type: note.includes('#') ? 'black' : 'white'
                };
                const semitone = octave * 12 + this.noteToMidi[note];
                if (!gap && this.semitoneLabels[semitone] === undefined) {
                    this.semitoneLabels[semitone] = labelForCode(code);
                }
            }

            this.container = null;
            this.pianoKeys = new Map();      // midi -> key element
            this.cursorSemitone = 0;         // gamepad cursor, relative to base
            this._padNoteMidi = null;        // note currently held by the pad
            this._padPrev = {};
            this._padAxisAt = 0;
            this._gamepadPoll = null;
            this.initAudio();
            this.setupEventListeners();
        }

        initAudio() {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = defaultVolume * seVolumeScale();
            // Ten keys down at once must not be ten times as loud as one: the
            // limiter catches the chord instead of clipping the output.
            this.limiter = this.audioContext.createDynamicsCompressor();
            this.limiter.threshold.value = -12;
            this.limiter.knee.value = 6;
            this.limiter.ratio.value = 12;
            this.limiter.attack.value = 0.004;
            this.limiter.release.value = 0.2;
            this.masterGain.connect(this.limiter);
            this.limiter.connect(this.audioContext.destination);
            this.pianoWave = null;
        }

        // Follow the SE slider live: the options menu can move it between two
        // notes, and a sustaining chord should ride the change with them.
        syncVolume() {
            if (!this.masterGain) return;
            const target = defaultVolume * seVolumeScale();
            const now = this.audioContext.currentTime;
            const gain = this.masterGain.gain;
            gain.cancelScheduledValues(now);
            gain.setTargetAtTime(target, now, 0.02);
        }

        // Built once and shared by every string: a PeriodicWave is immutable.
        getPianoWave() {
            if (!this.pianoWave) {
                const real = new Float32Array(PIANO_PARTIALS.length + 1);
                const imag = new Float32Array(PIANO_PARTIALS.length + 1);
                for (let i = 0; i < PIANO_PARTIALS.length; i++) {
                    imag[i + 1] = PIANO_PARTIALS[i];
                }
                this.pianoWave = this.audioContext.createPeriodicWave(real, imag, {
                    disableNormalization: false
                });
            }
            return this.pianoWave;
        }

        open() {
            if (this.isOpen) return;
            this.isOpen = true;
            this.cursorSemitone = 12; // start on the middle octave's C
            this.syncVolume();
            this.createUI();

            if (window.MinigameFun) window.MinigameFun.played('Playing Piano');

            // Resume audio context if needed
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            this.startGamepadPolling();
        }

        close() {
            if (!this.isOpen) return;
            this.isOpen = false;
            this.stopGamepadPolling();
            this.stopAllNotes();
            this.sustain = false;
            if (this.container) {
                this.container.remove();
                this.container = null;
            }
            this.pianoKeys.clear();
            // The button that closed the piano (pad B, Escape) is usually still
            // down: the engine must not read it as a fresh cancel on the map.
            // Input keeps being cleared until every pad button is let go.
            this._drainInput = true;
            if (typeof Input !== 'undefined') Input.clear();
            if (typeof TouchInput !== 'undefined') TouchInput.clear();
        }

        // True while a pad button that was down at close time is still held.
        padStillHeld() {
            const state = this.readPadState();
            for (const k in state) {
                if (k !== 'axisX' && state[k]) return true;
            }
            return false;
        }

        // ====================================================================
        // UI
        // ====================================================================
        createUI() {
            // Fit three octaves inside the window, however wide it happens to be.
            const whiteCount = OCTAVE_COUNT * 7;
            const avail = Math.min((window.innerWidth || 1280) - 60, 1280);
            const whiteW = Math.max(26, Math.floor(avail / whiteCount));
            const blackW = Math.max(16, Math.round(whiteW * 0.62));
            const whiteH = Math.min(150, Math.max(96, Math.round(whiteW * 2.6)));
            const blackH = Math.round(whiteH * 0.66);

            this.container = document.createElement('div');
            this.container.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(20, 20, 30, 0.95);
                border: 2px solid #444;
                border-radius: 10px;
                padding: 16px 20px 20px;
                z-index: 10000;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                text-align: center;
                color: white;
                margin-bottom: 10px;
                font-family: Arial, sans-serif;
            `;
            header.innerHTML = `
                <h3 style="margin: 0 0 5px 0;">${T('Piano.title')}</h3>
                <div style="font-size: 12px;">
                    ${T('Piano.waveform')}: <span id="waveform-display">${this.waveform}</span> |
                    ${T('Piano.octave')}: <span id="octave-display">${this.baseOctave}</span>
                </div>
            `;
            this.container.appendChild(header);

            const keyboard = document.createElement('div');
            keyboard.style.cssText = `
                position: relative;
                width: ${whiteCount * whiteW}px;
                height: ${whiteH}px;
                user-select: none;
            `;

            // White keys first, so the black ones can overlap them.
            let whiteIndex = 0;
            for (let octave = 0; octave < OCTAVE_COUNT; octave++) {
                for (const note of WHITE_NOTES) {
                    keyboard.appendChild(this.createKey(
                        note, octave, 'white', whiteIndex * whiteW, whiteW, whiteH
                    ));
                    whiteIndex++;
                }
            }
            for (let octave = 0; octave < OCTAVE_COUNT; octave++) {
                for (const [note, whiteOffset] of Object.entries(BLACK_NOTES)) {
                    const x = (octave * 7 + whiteOffset + 1) * whiteW - Math.round(blackW / 2);
                    keyboard.appendChild(this.createKey(
                        note, octave, 'black', x, blackW, blackH
                    ));
                }
            }

            // TouchInput also listens on document: without this, clicking a
            // piano key would double as a click on the map behind it.
            for (const type of ['mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) {
                this.container.addEventListener(type, e => e.stopPropagation());
            }

            this.container.appendChild(keyboard);
            document.body.appendChild(this.container);
            this.refreshCursor();
        }

        // Rebuild the board in place (used when the octave is transposed).
        refreshUI() {
            if (!this.isOpen || !this.container) return;
            this.container.remove();
            this.container = null;
            this.pianoKeys.clear();
            this.createUI();
        }

        createKey(note, octave, type, x, width, height) {
            const key = document.createElement('div');
            const isBlack = type === 'black';

            key.dataset.black = isBlack ? '1' : '0';
            key.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: 0;
                width: ${width - 2}px;
                height: ${height}px;
                background: ${isBlack ? '#222' : '#fff'};
                border: 1px solid #000;
                border-radius: 0 0 5px 5px;
                cursor: pointer;
                z-index: ${isBlack ? 2 : 1};
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                align-items: center;
                padding-bottom: 8px;
                box-sizing: border-box;
                transition: background 0.1s;
            `;

            const label = document.createElement('div');
            label.style.cssText = `
                color: ${isBlack ? '#fff' : '#000'};
                font-size: ${width >= 40 ? 12 : 10}px;
                font-weight: bold;
                margin-bottom: 4px;
            `;
            label.textContent = note + (this.baseOctave + octave);
            key.appendChild(label);

            const semitone = octave * 12 + this.noteToMidi[note];
            const keyLabel = document.createElement('div');
            keyLabel.style.cssText = `
                color: ${isBlack ? '#aaa' : '#666'};
                font-size: 10px;
                font-family: monospace;
            `;
            keyLabel.textContent = this.semitoneLabels[semitone] || '';
            key.appendChild(keyLabel);

            const midiNote = this.getMidiNote(note, octave);
            key.dataset.semitone = String(semitone);
            this.pianoKeys.set(midiNote, key);

            key.addEventListener('mousedown', () => {
                if (!this.isOpen) return;
                this.cursorSemitone = semitone;
                this.refreshCursor();
                this.playNote(midiNote);
            });
            key.addEventListener('mouseup', () => {
                if (this.isOpen) this.stopNote(midiNote);
            });
            key.addEventListener('mouseleave', () => {
                if (this.isOpen) this.stopNote(midiNote);
            });

            return key;
        }

        keyElementColor(key, pressed) {
            const isBlack = key.dataset.black === '1';
            if (pressed) return isBlack ? '#444' : '#ccc';
            return isBlack ? '#222' : '#fff';
        }

        // ====================================================================
        // Notes
        // ====================================================================
        getMidiNote(note, octave) {
            return (this.baseOctave + octave) * 12 + this.noteToMidi[note];
        }

        midiToFrequency(midi) {
            return 440 * Math.pow(2, (midi - 69) / 12);
        }

        playNote(midiNote) {
            if (this.activeNotes.has(midiNote)) return;

            this.syncVolume();

            const ctx = this.audioContext;
            const now = ctx.currentTime;
            const freq = this.midiToFrequency(midiNote);
            const gainNode = ctx.createGain();
            const sources = [];
            const peak = VOICE_PEAK[this.waveform] || 0.3;

            if (this.waveform === 'piano') {
                // A hammered string: bright at the strike, dark and quiet a
                // moment later, so a held key decays instead of droning.
                const wave = this.getPianoWave();
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.Q.value = 0.7;
                filter.frequency.setValueAtTime(Math.min(14000, freq * 16), now);
                filter.frequency.exponentialRampToValueAtTime(
                    Math.max(500, freq * 4), now + 0.7
                );

                for (const detune of [-PIANO_DETUNE, PIANO_DETUNE]) {
                    const osc = ctx.createOscillator();
                    osc.setPeriodicWave(wave);
                    osc.frequency.value = freq;
                    osc.detune.value = detune;
                    osc.connect(filter);
                    sources.push(osc);
                }
                filter.connect(gainNode);

                gainNode.gain.setValueAtTime(0.0001, now);
                gainNode.gain.linearRampToValueAtTime(peak, now + 0.005);
                gainNode.gain.exponentialRampToValueAtTime(peak * 0.32, now + 0.4);
                gainNode.gain.exponentialRampToValueAtTime(peak * 0.04, now + 4);
                // A held string eventually dies on its own rather than sitting
                // there humming until the key is let go.
                gainNode.gain.exponentialRampToValueAtTime(0.0004, now + 10);
            } else {
                const osc = ctx.createOscillator();
                osc.type = this.waveform;
                osc.frequency.value = freq;
                osc.connect(gainNode);
                sources.push(osc);

                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(peak, now + 0.01);
            }

            gainNode.connect(this.masterGain);
            for (const src of sources) src.start();

            this.activeNotes.set(midiNote, { sources, gainNode });
            this.trainPiano();

            const key = this.pianoKeys.get(midiNote);
            if (key) key.style.background = this.keyElementColor(key, true);
        }

        // Playing is what teaches the piano, not opening the lid. Every note
        // struck counts towards a point, and a point is only banked once the
        // player has actually played a passage rather than hit one key, which
        // is why this counts notes instead of awarding per note.
        trainPiano() {
            this._notesPlayed = (this._notesPlayed || 0) + 1;
            if (this._notesPlayed < NOTES_PER_POINT) return;
            this._notesPlayed = 0;
            if (window.SpecializationXP) {
                try { window.SpecializationXP.awardCapped('Playing Piano', 1); } catch (e) { /* never break the keyboard over a toast */ }
            }
        }

        stopNote(midiNote) {
            const note = this.activeNotes.get(midiNote);
            if (!note) return;

            const { sources, gainNode } = note;
            const now = this.audioContext.currentTime;
            // The piano voice is already decaying on its own; damping it is a
            // felt against a string, not a gate, so it gets a softer release.
            const isPiano = sources.length > 1;
            const releaseTime = this.sustain
                ? (isPiano ? 1.2 : 0.5)
                : (isPiano ? 0.22 : 0.1);

            // The note is mid-envelope: hold whatever it has reached now, or the
            // scheduled ramps would keep running through the release.
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(Math.max(0.0001, gainNode.gain.value), now);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);
            for (const src of sources) src.stop(now + releaseTime + 0.1);

            this.activeNotes.delete(midiNote);

            setTimeout(() => {
                // The key may have been struck again during the release tail.
                if (this.activeNotes.has(midiNote)) return;
                const key = this.pianoKeys.get(midiNote);
                if (key) key.style.background = this.keyElementColor(key, false);
            }, releaseTime * 1000);
        }

        stopAllNotes() {
            for (const midiNote of Array.from(this.activeNotes.keys())) {
                this.stopNote(midiNote);
            }
            this._padNoteMidi = null;
        }

        setWaveform(waveform) {
            this.waveform = waveform;
            const display = document.getElementById('waveform-display');
            if (display) display.textContent = waveform;
        }

        cycleWaveform(step) {
            const i = WAVEFORMS.indexOf(this.waveform);
            const next = (i < 0 ? 0 : i + (step || 1) + WAVEFORMS.length) % WAVEFORMS.length;
            this.setWaveform(WAVEFORMS[next]);
        }

        // Transpose the whole board. Held notes are released first: their midi
        // numbers belong to the old octave.
        shiftOctave(delta) {
            const next = this.baseOctave + delta;
            if (next < MIN_BASE_OCTAVE || next + OCTAVE_COUNT - 1 > MAX_BASE_OCTAVE) return;
            this.stopAllNotes();
            this.baseOctave = next;
            this.refreshUI();
        }

        // ====================================================================
        // Cursor (gamepad / arrow keys)
        // ====================================================================
        moveCursor(delta) {
            const max = OCTAVE_COUNT * 12 - 1;
            const next = Math.max(0, Math.min(max, this.cursorSemitone + delta));
            if (next === this.cursorSemitone) return;
            this.cursorSemitone = next;
            this.refreshCursor();
        }

        cursorMidi() {
            return this.baseOctave * 12 + this.cursorSemitone;
        }

        refreshCursor() {
            const target = this.cursorMidi();
            for (const [midi, key] of this.pianoKeys) {
                key.style.boxShadow = (midi === target)
                    ? 'inset 0 0 0 3px #ffcc33'
                    : 'none';
            }
        }

        // ====================================================================
        // Gamepad
        // ====================================================================
        startGamepadPolling() {
            // Seed the previous state from the live pad so a button still held
            // from whatever opened the piano does not fire immediately.
            this._padPrev = this.readPadState();
            this._padAxisAt = 0;
            this._gamepadPoll = setInterval(() => this.pollGamepad(), PAD_POLL_MS);
        }

        stopGamepadPolling() {
            if (this._gamepadPoll) {
                clearInterval(this._gamepadPoll);
                this._gamepadPoll = null;
            }
            this._padPrev = {};
        }

        readPadState() {
            const state = { axisX: 0 };
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (const pad of pads) {
                if (!pad || !pad.connected) continue;
                for (let i = 0; i < pad.buttons.length; i++) {
                    if (pad.buttons[i] && pad.buttons[i].pressed) state[i] = true;
                }
                const ax = pad.axes && pad.axes.length > 0 ? pad.axes[0] : 0;
                if (Math.abs(ax) > Math.abs(state.axisX)) state.axisX = ax;
            }
            return state;
        }

        pollGamepad() {
            if (!this.isOpen) return;
            const now = Date.now();
            const state = this.readPadState();
            const prev = this._padPrev;
            const pressed = i => !!state[i] && !prev[i];
            const released = i => !state[i] && !!prev[i];

            if (pressed(PAD.B)) { this._padPrev = state; this.close(); return; }

            // Cursor: D-pad steps once per press, the stick auto-repeats.
            if (pressed(PAD.DPAD_LEFT)) this.moveCursor(-1);
            if (pressed(PAD.DPAD_RIGHT)) this.moveCursor(1);
            if (pressed(PAD.DPAD_DOWN)) this.moveCursor(-12);
            if (pressed(PAD.DPAD_UP)) this.moveCursor(12);
            if (pressed(PAD.LT)) this.moveCursor(-12);
            if (pressed(PAD.RT)) this.moveCursor(12);
            if (Math.abs(state.axisX) > PAD_AXIS_DEADZONE) {
                if (now - this._padAxisAt >= PAD_REPEAT_MS) {
                    this._padAxisAt = now;
                    this.moveCursor(state.axisX > 0 ? 1 : -1);
                }
            } else {
                this._padAxisAt = 0;
            }

            if (pressed(PAD.LB)) this.shiftOctave(-1);
            if (pressed(PAD.RB)) this.shiftOctave(1);
            if (pressed(PAD.X)) this.cycleWaveform(1);

            // Y is a held pedal, like Shift on the keyboard.
            if (pressed(PAD.Y)) this.sustain = true;
            if (released(PAD.Y)) this.sustain = false;

            // A holds the cursor note; moving the cursor while held re-triggers.
            if (state[PAD.A]) {
                const midi = this.cursorMidi();
                if (this._padNoteMidi !== midi) {
                    if (this._padNoteMidi !== null) this.stopNote(this._padNoteMidi);
                    this._padNoteMidi = midi;
                    this.playNote(midi);
                }
            } else if (this._padNoteMidi !== null) {
                this.stopNote(this._padNoteMidi);
                this._padNoteMidi = null;
            }

            this._padPrev = state;
        }

        // ====================================================================
        // Keyboard
        // ====================================================================
        setupEventListeners() {
            // Capture phase: while the piano is open the game engine must not
            // also see these keys (they would walk the player / open menus).
            document.addEventListener('keydown', (e) => {
                if (!this.isOpen) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) return;

                if (e.code === 'Escape') {
                    this.close();
                    return;
                }

                // Voice: Shift cycles, and the function row picks one directly
                // (the digit row is all notes now).
                if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                    this.cycleWaveform(1);
                    return;
                }
                const waveIndex = ['F1', 'F2', 'F3', 'F4', 'F5'].indexOf(e.code);
                if (waveIndex >= 0) {
                    this.setWaveform(WAVEFORMS[waveIndex]);
                    return;
                }

                if (e.code === 'ArrowUp') { this.shiftOctave(1); return; }
                if (e.code === 'ArrowDown') { this.shiftOctave(-1); return; }
                if (e.code === 'ArrowLeft') { this.moveCursor(-1); return; }
                if (e.code === 'ArrowRight') { this.moveCursor(1); return; }

                if (e.code === 'Space') { this.sustain = true; return; }

                const mapping = this.keyMappings[e.code];
                if (mapping) {
                    this.playNote(this.getMidiNote(mapping.note, mapping.octave));
                }
            }, true);

            document.addEventListener('keyup', (e) => {
                if (!this.isOpen) return;
                e.preventDefault();
                e.stopPropagation();

                if (e.code === 'Space') { this.sustain = false; return; }

                const mapping = this.keyMappings[e.code];
                if (mapping) {
                    this.stopNote(this.getMidiNote(mapping.note, mapping.octave));
                }
            }, true);

            // Losing focus with keys down would leave oscillators ringing.
            window.addEventListener('blur', () => {
                if (this.isOpen) this.stopAllNotes();
            });
        }
    }

    // Create global instance
    window.VisualPiano = new VisualPiano();

    // The engine polls the raw gamepad itself, so swallowing the DOM events is
    // not enough: clear the input state every frame while the piano is open.
    const _Input_update = Input.update;
    Input.update = function () {
        _Input_update.call(this);
        const piano = window.VisualPiano;
        if (piano && piano.isOpen) {
            this.clear();
            TouchInput.clear();
        } else if (piano && piano._drainInput) {
            if (piano.padStillHeld()) this.clear();
            else piano._drainInput = false;
        }
    };

    // Register plugin commands
    PluginManager.registerCommand(pluginName, 'openPiano', () => {
        window.VisualPiano.open();
    });

    PluginManager.registerCommand(pluginName, 'closePiano', () => {
        window.VisualPiano.close();
    });

    PluginManager.registerCommand(pluginName, 'setWaveform', args => {
        window.VisualPiano.setWaveform(args.waveform);
    });
})();
