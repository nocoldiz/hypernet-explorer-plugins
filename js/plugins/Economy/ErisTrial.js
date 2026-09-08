//=============================================================================
// ErisTrial.js - Procedural Trial System with Eris
// Version: 1.3.0
// Author: Assistant
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Eris Trial System v1.3.0 - With Prison Bounty System
 * @author Assistant
 * @version 1.3.0
 * @description A procedural trial system with Eris, with prison bounty reduction.
 *
 * @param bountyVariable
 * @text Bounty Variable ID
 * @desc Variable ID that stores player bounty
 * @type variable
 * @default 66
 *
 * @param returnMapVariable
 * @text Return Map Variable ID
 * @desc Variable ID for map to return if innocent
 * @type variable
 * @default 76
 *
 * @param returnXVariable
 * @text Return X Variable ID
 * @desc Variable ID for X coordinate if innocent
 * @type variable
 * @default 74
 *
 * @param returnYVariable
 * @text Return Y Variable ID
 * @desc Variable ID for Y coordinate if innocent
 * @type variable
 * @default 75
 *
 * @param prisonMapId
 * @text Prison Map ID
 * @desc Map ID for prison when guilty
 * @type number
 * @default 1102
 *
 * @param prisonX
 * @text Prison X Coordinate
 * @desc X coordinate in prison map
 * @type number
 * @default 8
 *
 * @param prisonY
 * @text Prison Y Coordinate
 * @desc Y coordinate in prison map
 * @type number
 * @default 7
 *
 * @param bountyReductionRate
 * @text Bounty Reduction Rate
 * @desc Amount of bounty reduced per real-time second in prison (in gold)
 * @type number
 * @default 100
 *
 * @help ErisTrial.js
 *
 * This plugin creates a procedurally generated trial system featuring Eris,
 * the ex-goddess of discord turned deranged Goddess of Justice.
 *
 * Version 1.3.0 adds prison bounty reduction system.
 *
 * Features:
 * - Procedural dialogue that changes every trial: the courtroom, the gallery,
 *   the staff and the ambience are rolled per trial, Eris cites invented case
 *   law and produces invented exhibits mid-hearing, and every spoken line
 *   resolves "{a|b|c}" alternations as it is said
 * - A defence bar. Before the hearing opens the player retains one of five
 *   advocates, nominates a party member, or stands alone. The five are real
 *   NPCs pulled from js/db/WorldGen/NPCPools.json, fixed for the lifetime of
 *   the world by the creation seed and shared by every savegame of it
 *   (world folder npcs.json -> erisLawyers). Their rank is written onto the
 *   real society profile: level, INT (MAT), WIS (MDF), the Law specialization
 *   (id 155) and the "Defence Lawyer" job (Jobs.json id 139), so they read as
 *   lawyers in the Empathize panel too. Recruiting one into the party strikes
 *   them off the bar and the next name in the world's seeded queue replaces
 *   them. The brief shows each option's sprite, level, INT, WIS, Law level,
 *   disposition toward the party, fee, and the projected odds of every outcome,
 *   computed with the same model the verdict runs on (projectOutcome), which
 *   swings hard on the mood Eris turned up in. She greets counsel in her own
 *   voice and, depending on that mood, throws them out of the room, in which
 *   case their bonus is gone and the fee is not refunded.
 * - Law (Specialization 155) is earned only by arguing: the defendant who
 *   represents themselves, or the companion who stands up instead, gains a few
 *   points per hearing (thresholds 8/20/45/90) and their level feeds straight
 *   back into the odds. Retaining a professional teaches the party nothing.
 * - Unpredictable trial outcomes based on Eris's mood
 * - Multiple choice responses during trial
 * - Guilty/Not Guilty plea system
 * - Procedural sentencing: a named term is served by the game clock (and clears
 *   the bounty on release), an open-ended one grinds the bounty down in-cell
 * - Prison system with gradual bounty reduction
 * - Random Eris dialogue when released from prison
 * - Em (switch 48, or an actor named Em in the party) is tried differently:
 *   Eris is openly jealous over Bubba (docs/Lore.odt), convicts on sight,
 *   pronounces a full capital sentence from the court's own list and then
 *   commutes it to prison at the last second. Dating her as Em raises
 *   $gameSystem._erisEmBond (written by ErisDateSystem.js), which softens her
 *   mood, drops most charges and eventually pardons outright, though she stays
 *   fickle enough to swing back
 * - Everybody else gets the same channel through ErisDateSystem.js, which
 *   writes $gameSystem._erisPlayerBond (0..1, opinion plus dates seen through).
 *   A defendant she has had dinner with meets a warmer mood wheel, a lower
 *   conviction chance, shorter sentences and, high enough, an outright
 *   dismissal before the charges are read. She is still fickle: sometimes an
 *   evening buys nothing at all and she says so
 *
 * Plugin Commands:
 * - Start Trial: Begins the trial sequence
 * - Skip to Jail: Teleports directly to jail and serves sentence, skipping trial
 * - Auto-Serve Sentence: Instantly settles the bounty as served and teleports
 *   back to the saved location, skipping both the trial and the wait in a cell
 * - Open Reverse Trial: (Sandbox mode only) Play as Eris and judge a random NPC.
 *   The reverse trial is paced one message at a time (confirm to advance) and
 *   lets you choose Eris's opening remarks, interrogation approach per charge,
 *   closing remark and parting words on top of mood, verdict and sentence.
 *
 * @command startTrial
 * @text Start Trial
 * @desc Begin the trial with Eris
 *
 * @command skipToJail
 * @text Skip to Jail
 * @desc Teleport directly to jail and serve your sentence, skipping the trial
 *
 * @command autoServeSentence
 * @text Auto-Serve Sentence
 * @desc Instantly serve your sentence and teleport back to where you came from, skipping the wait
 *
 * @command openReverseTrial
 * @text Open Reverse Trial (Sandbox)
 * @desc Sandbox mode only: play as Eris and put a random NPC from the global pool on trial
 */

(() => {
  "use strict";

  const pluginName = "ErisTrial";
  const parameters = PluginManager.parameters(pluginName);
  const bountyVariableId = parseInt(parameters["bountyVariable"] || 66);
  const returnMapVariable = parseInt(parameters["returnMapVariable"] || 76);
  const returnXVariable = parseInt(parameters["returnXVariable"] || 74);
  const returnYVariable = parseInt(parameters["returnYVariable"] || 75);
  const prisonMapId = parseInt(parameters["prisonMapId"] || 1102);
  const prisonX = parseInt(parameters["prisonX"] || 8);
  const prisonY = parseInt(parameters["prisonY"] || 7);
  const bountyReductionRate = parseInt(parameters["bountyReductionRate"] || 100);

  // The bounty is two things that have to agree: the itemised record in
  // CrimeSystem and the variable everything else reads. Writing the variable
  // alone (which is what the court used to do) left the record standing, and
  // the next crime committed re-totalled it and handed the party back the
  // whole sheet they had just served time for. Both settlements go through
  // CrimeSystem now, which also calls off the manhunt.
  function settleBountyTo(amount) {
    const target = Math.max(0, Math.round(amount) || 0);
    if (window.CrimeSystem && window.CrimeSystem.setTotalBounty) {
      return window.CrimeSystem.setTotalBounty(target);
    }
    if ($gameVariables) $gameVariables.setValue(bountyVariableId, target);
    return target;
  }

  function forgiveBounty() {
    if (window.CrimeSystem && window.CrimeSystem.clearBounty) {
      window.CrimeSystem.clearBounty({ silent: true });
      return;
    }
    if (window.playerCrimes) window.playerCrimes = [];
    if ($gameVariables) $gameVariables.setValue(bountyVariableId, 0);
  }

  // Eris's mood, shown as a real IconSet glyph instead of an emoji (indices
  // per js/db/Sprites/Icons.json). MOOD_ICON_DEFAULT stands in for an unknown
  // mood: an hourglass, the court still deliberating.
  const MOOD_ICONS = {
    benevolent: 7,    // Charmed
    neutral: 161,     // Gray Stone
    irritated: 5,     // Rage
    chaotic: 10,      // Confusion
    vindictive: 1,    // Dead
    whimsical: 89,    // Pink Star
    bored: 11,        // Sleep
    dramatic: 199     // Lyre
  };
  const MOOD_ICON_DEFAULT = 220; // Hourglass

  // Inline IconSet sprite for the DOM pages. The frame is a computed offset, so
  // it goes in as custom properties and .eris-icon in css/theme.css draws it.
  function erisIconHTML(iconIndex, size = 20) {
    const x = (iconIndex % 16) * size;
    const y = Math.floor(iconIndex / 16) * size;
    return `<span class="eris-icon" style="--icon-size:${size}px;--icon-x:-${x}px;--icon-y:-${y}px;"></span>`;
  }

  function moodIconHTML(mood, size = 20) {
    return erisIconHTML(MOOD_ICONS[mood] || MOOD_ICON_DEFAULT, size);
  }

  // Check language

  //=============================================================================
  // Window_TrialCrimes
  // A window to display the list of crimes.
  //=============================================================================
  function Window_TrialCrimes() {
    this.initialize(...arguments);
  }

  Window_TrialCrimes.prototype = Object.create(Window_Base.prototype);
  Window_TrialCrimes.prototype.constructor = Window_TrialCrimes;

  Window_TrialCrimes.prototype.initialize = function (crimes) {
    this._crimes = crimes;
    const width = this.windowWidth();
    const height = this.windowHeight();
    Window_Base.prototype.initialize.call(this, new Rectangle(8, 8, width, height));
    this.refresh();
  };

  Window_TrialCrimes.prototype.windowWidth = function () {
    return 300;
  };

  Window_TrialCrimes.prototype.windowHeight = function () {
    const minHeight = this.fittingHeight(1);
    const neededHeight = this.fittingHeight(this._crimes.length || 1);
    return Math.max(minHeight, neededHeight);
  };

  Window_TrialCrimes.prototype.refresh = function () {


    this.contents.clear();
    const title = T('ErisTrial.line.crimes');
    this.changeTextColor(ColorManager.systemColor());
    this.drawText(title, 0, 0, this.contentsWidth(), 'left');
    this.resetTextColor();
    if (this._crimes.length > 0) {
      this._crimes.forEach((crime, index) => {
        this.drawText(crime.name, 4, this.lineHeight() * (index + 1), this.contentsWidth());
      });
    } else {
      const noCrimes = T('ErisTrial.line.noneYet');
      this.drawText(noCrimes, 4, this.lineHeight(), this.contentsWidth());
    }
  };

  //=============================================================================
  // Prison Manager
  //=============================================================================
  // Same shared overlay shell every parchment HUD uses (FastTravelSystem's
  // Window_TravelTimer, RentSystem's room list, ...). The cell countdown is
  // drawn the same way on purpose: it is the same kind of "something is
  // ticking in the background" readout, so it should look like one.
  function formatSentenceRemain(remainMinutes) {
    const minutes = Math.max(0, Math.floor(remainMinutes));
    const days = Math.floor(minutes / 1440);
    const hh = String(Math.floor((minutes % 1440) / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const clock = `${hh}:${mm}`;
    return days > 0 ? T('ErisTrial.line.prisonDays', { n: days }) + clock : clock;
  }

  class PrisonManager {
    constructor() {
      this._htmlEl = null;
      this._isInPrison = false;
      this._sentenceReleaseTime = null; // Fixed-length sentence (game minutes, var 114)
      this._servedSentence = false;     // True while a fixed term is being served
      this._tickFrame = 0;              // real-time accumulator, ticks the bounty down once a second
      this._releasing = false;          // guards releasePrisoner against re-entry
    }

    startPrisonTime(initialBounty, sentenceMinutes) {
      if (this._isInPrison) return;

      this._isInPrison = true;
      this._tickFrame = 0;
      this._createOverlay();

      // Fixed-length sentence (e.g. one month after losing/fleeing the Eris
      // challenge). Released by game time (Variable 114) regardless of bounty.
      if (sentenceMinutes && sentenceMinutes > 0) {
        this._sentenceReleaseTime = ($gameVariables.value(114) || 0) + sentenceMinutes;
      } else {
        this._sentenceReleaseTime = null;
      }
      // A fixed term is served by the clock, so the bounty is never ground down
      // inside the cell: releasePrisoner writes it off once the time is done.
      this._servedSentence = this._sentenceReleaseTime !== null;
      this._refresh(initialBounty);
    }

    _createOverlay() {
      const old = document.getElementById('html-prison-timer');
      if (old) old.remove();
      const el = document.createElement('div');
      el.id = 'html-prison-timer';
      el.className = 'html-parchment-overlay';
      this._htmlEl = el;
      document.body.appendChild(el);
    }

    _syncPos() {
      const canvas = document.getElementById('gameCanvas');
      if (!canvas || !this._htmlEl) return;
      const r = canvas.getBoundingClientRect();
      const sx = r.width / Graphics.width, sy = r.height / Graphics.height;
      const s = this._htmlEl.style;
      s.right    = (window.innerWidth - r.right + 9 * sx) + 'px';
      s.top      = (r.top + 8 * sy) + 'px';
      s.padding  = `${Math.round(12 * sy)}px ${Math.round(20 * sx)}px`;
      s.minWidth = Math.round(220 * sx) + 'px';
    }

    _refresh(bounty) {
      if (!this._htmlEl) return;
      const euros = window.CrimeSystem ? window.CrimeSystem.goldToEuros(bounty)
        : ((bounty / 1000) * 10).toFixed(2) + '€';

      let timeHtml;
      if (this._sentenceReleaseTime !== null) {
        const remain = this._sentenceReleaseTime - ($gameVariables.value(114) || 0);
        timeHtml = `<div class="prison-timer-time">${formatSentenceRemain(remain)}</div>`;
      } else {
        const secs = bounty > 0 ? Math.ceil(bounty / Math.max(1, bountyReductionRate)) : 0;
        const mm = String(Math.floor(secs / 60)).padStart(2, '0');
        const ss = String(secs % 60).padStart(2, '0');
        timeHtml = `<div class="prison-timer-time">${mm}:${ss}</div>`;
      }

      // A fixed term is served by the clock (Variable 114), and sleeping/waiting
      // already advances that same clock -- the cell just never gave the player a
      // bed, tent or any other tile to trigger the sleep/wait menu with, so time
      // in here could only ever pass by standing around waiting on real-world
      // clock ticks. The button opens the same menu a bed would.
      const sleepHtml = this._sentenceReleaseTime !== null
        ? `<button type="button" class="prison-timer-sleep-btn" onclick="window.prisonManager.openSleep()">${T('ErisTrial.line.prisonSleepButton')}</button>`
        : '';

      this._htmlEl.innerHTML =
        `<div class="prison-timer-label">${T('ErisTrial.line.prisonTimeRemaining')}</div>` +
        timeHtml +
        `<div class="prison-timer-bounty">${T('ErisTrial.line.bounty')} ${euros}</div>` +
        sleepHtml;
      this._htmlEl.style.display = 'block';
      this._syncPos();
    }

    // Opens the normal sleep/wait menu from inside the cell -- same entry point
    // a bed tile calls elsewhere, "main" mode so resting (full recovery) is on
    // the table, not just a bare wait. Only offered for a fixed-length sentence:
    // an open-ended bounty grind already ticks down every real second regardless
    // of standing still, so there is nothing sleeping would speed up there.
    openSleep() {
      if (!this._isInPrison || this._sentenceReleaseTime === null) return;
      const scene = SceneManager._scene;
      if (scene && typeof scene.openSleepMenu === 'function') scene.openSleepMenu('main');
    }

    // The sleep button was a click and nothing else, which left a player on a
    // pad serving a fixed sentence in real time with no way to skip it. Confirm
    // opens the same menu from anywhere in the cell. There is nothing else in
    // here to press it on - no bed, no door, no furniture, which is the whole
    // reason the button had to exist - so the key is free, and it is still
    // handed to a message or an event first if one is running.
    updateSleepInput() {
      if (this._sentenceReleaseTime === null) return;
      if (typeof Input === 'undefined' || !Input.isTriggered('ok')) return;
      if ($gameMessage && $gameMessage.isBusy()) return;
      if ($gameMap && $gameMap.isEventRunning()) return;
      this.openSleep();
    }

    // Consumed once per real second, not per game-minute: a cell is too
    // small to pace out the ten steps a game-minute used to cost, which is
    // what left the old countdown looking dead while the party sat still.
    reduceBounty() {
      const currentBounty = $gameVariables.value(bountyVariableId) || 0;
      if (currentBounty <= 0) {
        this.releasePrisoner();
        return;
      }

      const newBounty = settleBountyTo(Math.max(0, currentBounty - bountyReductionRate));
      this._refresh(newBounty);

      if (newBounty <= 0) {
        this.releasePrisoner();
      }
    }

    async releasePrisoner() {
      if (this._releasing) return;
      this._releasing = true;
      this.stopPrisonTime();

      // Time served settles the debt, record and all: a fixed-term sentence
      // never touched the bounty while it ran, so it is written off here, and
      // an open-ended one has already been ground down to nothing.
      forgiveBounty();

      // Show release message
      await this.showReleaseMessage();

      // Transfer to saved location
      const mapId = $gameVariables.value(returnMapVariable) || 1;
      const x = $gameVariables.value(returnXVariable) || 0;
      const y = $gameVariables.value(returnYVariable) || 0;
      $gamePlayer.reserveTransfer(mapId, x, y, 2, 0);
      // Clear the stored return location so a later trial from a different
      // place captures fresh coords (startTrial only records when it's falsy).
      $gameVariables.setValue(returnMapVariable, 0);
      $gameVariables.setValue(returnXVariable, 0);
      $gameVariables.setValue(returnYVariable, 0);
      this._releasing = false;
    }

    async showReleaseMessage() {

      const messages = T.pool('ErisTrial.bank.showReleaseMessage.messages');

      const message = vary(messages[Math.floor(Math.random() * messages.length)]);
      window.skipLocalization = true;
      $gameMessage.setBackground(2); $gameMessage.add("\\C[3]" + message + "\\C[0]");
      window.skipLocalization = false;

      return new Promise((resolve) => {
        const wait = () => {
          if ($gameMessage.isBusy()) {
            requestAnimationFrame(wait);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(wait);
      });
    }

    stopPrisonTime() {
      if (this._htmlEl) {
        if (this._htmlEl.parentNode) this._htmlEl.parentNode.removeChild(this._htmlEl);
        this._htmlEl = null;
      }

      this._isInPrison = false;
      this._sentenceReleaseTime = null;
      this._servedSentence = false;
      this._tickFrame = 0;
    }

    update() {
      if (this._isInPrison) {
        // Fixed-length sentence takes priority over bounty reduction.
        if (this._sentenceReleaseTime !== null) {
          if (($gameVariables.value(114) || 0) >= this._sentenceReleaseTime) {
            this.releasePrisoner();
            return;
          }
          if (Graphics.frameCount % 60 === 0) {
            this._refresh($gameVariables.value(bountyVariableId) || 0);
          }
        } else if (++this._tickFrame >= 60) {
          this._tickFrame = 0;
          this.reduceBounty();
        }
        if (this._htmlEl) this._syncPos();
        this.updateSleepInput();
      }

      // Check if player left prison map
      if (this._isInPrison && $gameMap.mapId() !== prisonMapId) {
        this.stopPrisonTime();
      }
    }

    isInPrison() {
      return this._isInPrison;
    }
  }

  // Create global prison manager
  if (!window.prisonManager) {
    window.prisonManager = new PrisonManager();
  }

  //=============================================================================
  // ErisChallengeBattle - Gimmicky battle script for the Eris challenge
  // (troop 1342, which contains Eris = enemy 1343).
  //
  // Phase 1 (turns 1-9): Eris fully heals the party every 3rd turn while
  // mocking them. Combined with the BattleSystemEnhancedMechanics tweak, nobody
  // can die during the first 10 turns. Pure humiliation.
  // Phase 2 (turn 10+): she stops babysitting, fully heals HERSELF, and the
  // real, lethal battle begins.
  //=============================================================================
  const ERIS_TROOP_ID = 1342;
  // Her battle portrait: the wasteland DJ, tagged with her own name.
  const ERIS_BUST_IMAGE = "WastelandDJ";

  window.ErisChallengeBattle = {
    _lastTurn: -1,

    // Has she been beaten in this WORLD? The flag behind this is world-scoped
    // (Core/WorldManager.js, world file field `erisDefeated`), so every
    // savegame of the world she was beaten in agrees that she is gone: the
    // bounty stops growing here, and nothing offers an evening with her again.
    isErisDefeated() {
      return !!(typeof $gameSystem !== "undefined" && $gameSystem &&
                $gameSystem._erisBountyImmunity);
    },

    reset() {
      this._lastTurn = -1;
      // A fresh fight, a fresh body: she rolls a new one and starts
      // shifting again from the top.
      if (window.ErisAppearance) window.ErisAppearance.reset();
    },

    isErisBattle() {
      return $gameParty.inBattle() && $gameTroop._troopId === ERIS_TROOP_ID;
    },

    // Her portrait slides in beside the line, name on the tag, the same
    // way an NPC talks on the map.
    _showBust() {
      const scene = SceneManager._scene;
      const bm = scene && scene._bustManager;
      if (!bm) return false;
      try {
        const name = T('ErisTrial.line.erisName');
        bm.showCustomBust(ERIS_BUST_IMAGE, name);
        if (bm.nameWindow) {
          bm.nameWindow.setCharacterName(name);
          bm.nameWindow.showName();
          bm.nameIsVisible = true;
        }
      } catch (e) {
        return false;
      }
      return true;
    },

    _say(text) {
      const withBust = this._showBust();
      window.skipLocalization = true;
      // With the bust up her name is on the tag; without one, keep the old
      // inline speaker so the line never loses its voice.
      $gameMessage.add(withBust ? text : ("\\C[3]" + T('ErisTrial.line.eris') + "\\C[0]" + text));
      window.skipLocalization = false;
    },

    _pick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },

    _fullHealParty() {
      $gameParty.members().forEach(a => a.recoverAll());
    },

    _fullHealEris() {
      const eris = $gameTroop.members()[0];
      if (eris) eris.recoverAll();
    },

    // Small, harmless chaos to keep phase 1 feeling unhinged.
    _randomInsanity() {
      try {
        const eris = $gameTroop.members()[0];
        const roll = Math.floor(Math.random() * 4);
        if (roll === 0) {
          // Hand out free TP, because why not.
          $gameParty.members().forEach(a => a.gainTp(50));
        } else if (roll === 1 && eris) {
          // Eris flaunts her own vitality.
          eris.recoverAll();
        } else if (roll === 2) {
          // A random ally gets a full top-up mid-turn.
          const m = $gameParty.aliveMembers();
          if (m.length) this._pick(m).recoverAll();
        }
        // roll === 3: pure talk, no mechanical effect.
      } catch (e) {
        // Never let flavor break the battle.
      }
    },

    onTurnEnd() {
      if (!this.isErisBattle()) return;
      const turn = $gameTroop.turnCount();
      if (turn <= 0) return;
      if (turn === this._lastTurn) return; // idempotent: once per turn
      this._lastTurn = turn;

      const it = ConfigManager.language === "it";

      if (turn < 10) {
        // While she is still playing, she wears a different body every
        // turn: skin, hair, eyes and clothes all re-roll where they can
        // see it happen.
        if (window.ErisAppearance) window.ErisAppearance.shift();
        if (turn % 3 === 0) {
          // Heal the whole party to 100%, mockingly.
          this._fullHealParty();
          this._say(this._pick(T.pool('ErisTrial.bank.onTurnEnd.lines')));
        } else if (Math.random() < 0.4) {
          // Filler taunt + a dash of chaos on non-heal turns.
          this._say(this._pick(T.pool('ErisTrial.bank.onTurnEnd.lines2')));
          this._randomInsanity();
        }
      } else if (turn === 10) {
        // Stop coddling them; heal herself and start the real fight. She
        // settles into the body she is standing in, her own hair back, and
        // that is the shape she fights in from here.
        if (window.ErisAppearance) window.ErisAppearance.lock();
        this._fullHealEris();
        this._say(this._pick(T.pool('ErisTrial.bank.onTurnEnd.lines3')));
      }
    },
  };

  // Reset the per-turn guard whenever the Eris battle is (re)started.
  const _BattleManager_setup_Eris = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    _BattleManager_setup_Eris.call(this, troopId, canEscape, canLose);
    if (troopId === ERIS_TROOP_ID && window.ErisChallengeBattle) {
      window.ErisChallengeBattle.reset();
    }
  };

  // Backup trigger: fire the turn logic whenever the troop turn advances, in
  // case the ATB/turn-end troop event page does not run. The idempotent guard
  // in onTurnEnd() keeps this from double-firing with the Troops.json script.
  const _Game_Troop_increaseTurn = Game_Troop.prototype.increaseTurn;
  Game_Troop.prototype.increaseTurn = function () {
    _Game_Troop_increaseTurn.call(this);
    if (window.ErisChallengeBattle) window.ErisChallengeBattle.onTurnEnd();
  };

  //=============================================================================
  // Scene_Map - Update prison manager and handle prison start
  //=============================================================================
  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update.call(this);
    if (window.prisonManager) {
      window.prisonManager.update();
    }
  };

  //=============================================================================
  // Scene_Map - the court owns the input while it is sitting
  //=============================================================================
  // Escape, the pad's cancel/menu button and a right click all call the map
  // menu, and the parchment menu adopts whatever #menu-container it finds on
  // the page. During a hearing that container IS the courtroom, so the menu
  // took the transcript and the choice panel with it and the trial played on
  // blind: every line went past unseen, and a choice with no panel to draw
  // answered its own question. A court in session is marked in the DOM, and
  // while that mark is there the menu cannot be called at all. The mark goes
  // with the node, so a hearing that ends badly cannot leave the menu locked.
  let courtNode = null;
  function markCourt(el) {
    courtNode = el;
    el.dataset.erisCourt = '1';
  }
  // `isConnected` is what makes the mark self-clearing: once the page is off the
  // document the court is not sitting, however the hearing ended.
  function courtIsSitting() {
    return !!(courtNode && courtNode.isConnected);
  }

  const _Scene_Map_isMenuCalled = Scene_Map.prototype.isMenuCalled;
  Scene_Map.prototype.isMenuCalled = function () {
    return courtIsSitting() ? false : _Scene_Map_isMenuCalled.call(this);
  };

  const _Scene_Map_isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
  Scene_Map.prototype.isMenuEnabled = function () {
    return courtIsSitting() ? false : _Scene_Map_isMenuEnabled.call(this);
  };

  // Every way in eventually goes through here (Tab, the pad, a right click), so
  // the door is barred at the door itself rather than at each key.
  const _Scene_Map_callMenu = Scene_Map.prototype.callMenu;
  Scene_Map.prototype.callMenu = function () {
    if (courtIsSitting()) return;
    _Scene_Map_callMenu.call(this);
  };

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);

    // Check if we need to start prison time
    if ($gameMap.mapId() === prisonMapId) {
      if ($gameTemp._startPrisonOnLoad) {
        const bounty = $gameTemp._prisonBounty || $gameVariables.value(bountyVariableId);
        const sentence = $gameTemp._prisonSentenceMinutes || 0;
        if (window.prisonManager) {
          window.prisonManager.startPrisonTime(bounty, sentence);
        }
        // The day the doors closed, in the party's own diary (Diary.js), which
        // puts the sentence into words of its own.
        if (window.Diary) window.Diary.onTrial('prison', { minutes: sentence });
        $gameTemp._startPrisonOnLoad = false;
        $gameTemp._prisonBounty = null;
        $gameTemp._prisonSentenceMinutes = null;
      } else if (window.prisonManager && !window.prisonManager.isInPrison()) {
        // Standing on the prison map without having just been sent here
        // (a loaded save, a debug teleport, a stray transfer): a cell with
        // nothing owed does not hold anyone, whatever put them here, so they
        // are walked straight back out. Time still owed picks the open-ended
        // sentence back up instead of leaving the countdown dead.
        const bounty = $gameVariables.value(bountyVariableId) || 0;
        if (bounty <= 0) {
          window.prisonManager.releasePrisoner();
        } else {
          window.prisonManager.startPrisonTime(bounty, 0);
        }
      }
    }

    // The player defeated Eris in the challenge battle: her court stands empty.
    if ($gameTemp._erisChallengeWon) {
      $gameTemp._erisChallengeWon = false;
      const it = ConfigManager.language === "it";
      const msg = T('ErisTrial.line.theCourtIsEmpty');
      window.skipLocalization = true;
      $gameMessage.setBackground(2);
      $gameMessage.add("\\C[8]" + msg + "\\C[0]");
      window.skipLocalization = false;
    }
  };

  // Shared pool of absurd Eris-flavored accusations, used both by the normal
  // trial (player as defendant) and the reversed sandbox trial (player as Eris).
  function getRandomCrimeAccusation() {

    const accusations = T.pool('ErisTrial.bank.getRandomCrimeAccusation.accusations');

    return accusations[Math.floor(Math.random() * accusations.length)];
  }

  //=============================================================================
  // Procedural trial flavour
  //=============================================================================
  //
  // No two trials should read the same. Three layers do that:
  //   1. vary()  - inline "{a|b|c}" alternation, resolved as each line is spoken
  //   2. banks   - the courtroom, the gallery, the exhibits, the precedents and
  //                the sentence are assembled from pools when the trial opens
  //   3. beats   - interruptions and asides dropped into the running order
  // Unlike the item/skill lore templates (window.ItemDescription) none of this is
  // world-seeded, and that is the point: the SAME player must never sit through
  // the same trial twice.

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // The court's words live in js/i18n/<lang>/conversations/ErisTrial.json.
  // The banks below are lazy views onto it, re-resolved when the language
  // changes, so nothing is frozen at load time.
  let _trialBankLang = null;
  const _trialBankCache = new Map();
  function trialBank(key) {
    const lang_ = T.language();
    if (lang_ !== _trialBankLang) { _trialBankLang = lang_; _trialBankCache.clear(); }
    if (!_trialBankCache.has(key)) _trialBankCache.set(key, T.obj(key));
    return _trialBankCache.get(key);
  }
  // A list of lines with no metadata attached.
  const trialLines = (key) => trialBank(key).map((text) => ({ text }));
  // A list of lines that each carry metadata (a sentence length, a fee band).
  // The metadata stays in the plugin; only the words come from the JSON.
  function trialRecords(meta, key, extra) {
    const lines = trialBank(key);
    const more = extra ? trialBank(extra.key) : null;
    return meta.map((m, i) => {
      const rec = Object.assign({}, m, { text: lines[i] });
      if (more) rec[extra.field] = more[i];
      return rec;
    });
  }
  // The banks come out of trialBank() already resolved for the active language,
  // so this only unwraps a lazy view that was passed uncalled.
  const bank = (b) => (typeof b === "function" ? b() : b);
  const pickFrom = (b) => pick(bank(b));

  // Resolves "{a|b|c}" groups innermost-first, so groups can nest.
  function vary(text) {
    if (typeof text !== "string" || text.indexOf("{") < 0) return text;
    let out = text;
    let guard = 0;
    while (guard++ < 64) {
      const next = out.replace(/\{([^{}]*)\}/, (m, body) => pick(body.split("|")));
      if (next === out) break;
      out = next;
    }
    return out;
  }

  // Where the court happens to be today. Eris runs billions of trials at once
  // and never bothers to hold two of them in the same room.
  const COURT_VENUES = () => trialBank('ErisTrial.courtVenues');

  const COURT_GALLERY = () => trialBank('ErisTrial.courtGallery');

  const COURT_STAFF = () => trialBank('ErisTrial.courtStaff');

  const COURT_AMBIENCE = () => trialBank('ErisTrial.courtAmbience');

  // Absurd case law. Eris cites it with total confidence.
  const PRECEDENT_PARTIES = () => trialBank('ErisTrial.precedentParties');

  const PRECEDENT_RULINGS = () => trialBank('ErisTrial.precedentRulings');

  const EXHIBIT_ITEMS = () => trialBank('ErisTrial.exhibitItems');

  const EXHIBIT_PLACES = () => trialBank('ErisTrial.exhibitPlaces');

  // Mid-trial interruptions. Dropped in at random between beats.
  const TRIAL_INTERRUPTIONS = () => trialBank('ErisTrial.trialInterruptions');

  // Sentences handed down on a guilty verdict. `minutes` feeds the fixed-term
  // release in PrisonManager (game minutes, Variable 114); a null term keeps the
  // classic behaviour of grinding the bounty down inside the cell.
  const TRIAL_SENTENCES_META = [{"key":"night","minutes":480},{"key":"threeDays","minutes":4320},{"key":"week","minutes":10080},{"key":"fortnight","minutes":20160},{"key":"month","minutes":43200},{"key":"season","minutes":129600},{"key":"debt","minutes":null},{"key":"debtToo","minutes":null}];
  const TRIAL_SENTENCES = () => trialRecords(TRIAL_SENTENCES_META, 'ErisTrial.trialSentences');

  //=============================================================================
  // Em
  //=============================================================================
  //
  // Eris is not impartial about Em, and the lore says exactly why (docs/Lore.odt):
  // Bubba travels with the wannabe witch, Bubba feels nothing for her and still
  // loves Eris, and the goddess of discord bends cosmic law and probability to
  // make Em's life hell anyway. Every trial Em stands in is that grudge with a
  // gavel in it. ErisDateSystem writes the counterweight: $gameSystem._erisEmBond,
  // how much of herself Eris has admitted to Em over a date, 0..1.
  const ErisEm = {
    // Same test SaveSystem uses for the Game Over line: switch 48, or an actor
    // literally named Em in the party.
    inPlay() {
      if (window.$gameSwitches && $gameSwitches.value(48)) return true;
      return !!(window.$gameParty && $gameParty.members &&
        $gameParty.members().some(m => m && m.name() === "Em"));
    },
    bond() {
      if (!window.$gameSystem) return 0;
      return Math.max(0, Math.min(1, Number($gameSystem._erisEmBond) || 0));
    },
    setBond(value) {
      if (!window.$gameSystem) return;
      $gameSystem._erisEmBond = Math.max(0, Math.min(1, Number(value) || 0));
    },
    // Secrets she has already let slip, so the next date goes further instead of
    // repeating itself.
    told() {
      if (!window.$gameSystem) return [];
      if (!$gameSystem._erisEmSecrets) $gameSystem._erisEmSecrets = [];
      return $gameSystem._erisEmSecrets;
    },
    tell(key) {
      const told = this.told();
      if (key && told.indexOf(key) < 0) told.push(key);
    }
  };
  window.ErisEm = ErisEm;

  //=============================================================================
  // Bubba
  //=============================================================================
  //
  // The other half of the same grudge (docs/Lore.odt). Eris spent years on Route
  // 666 with a mechanic from Westford and left him to take a throne she is not
  // qualified for, and she has never once said why. Dragging Em in front of the
  // bench is easy. Dragging HIM in front of it is the single situation the
  // goddess of discord cannot run: she is mortified, drops the charges before
  // they are read, and has him escorted out before anybody sees her face.
  // ErisDateSystem writes $gameSystem._erisBubbaBond (0..1), how far she has
  // climbed down over the dates; here it only makes her worse at hiding it.
  const ErisBubba = {
    // Switch 49 is his dossier's; the name check covers a Bubba who joined
    // outside character creation, or a run whose switches were reset.
    inPlay() {
      if (window.$gameSwitches && $gameSwitches.value(49)) return true;
      return !!(window.$gameParty && $gameParty.members &&
        $gameParty.members().some(m => m && m.name() === "Bubba"));  // i18n-ignore  actor name match
    },
    bond() {
      if (!window.$gameSystem) return 0;
      return Math.max(0, Math.min(1, Number($gameSystem._erisBubbaBond) || 0));
    },
    setBond(value) {
      if (!window.$gameSystem) return;
      $gameSystem._erisBubbaBond = Math.max(0, Math.min(1, Number(value) || 0));
    },
    // What she has already admitted to him on a date, so the next one goes
    // further instead of circling the same excuse.
    told() {
      if (!window.$gameSystem) return [];
      if (!$gameSystem._erisBubbaTold) $gameSystem._erisBubbaTold = [];
      return $gameSystem._erisBubbaTold;
    },
    tell(key) {
      const told = this.told();
      if (key && told.indexOf(key) < 0) told.push(key);
    }
  };
  window.ErisBubba = ErisBubba;

  // The moment she looks up and sees who the bailiffs have brought in.
  const BUBBA_TRIAL_OPENINGS = () => trialBank('ErisTrial.bubbaTrialOpenings');

  // Business the court pretends not to see while she gets through this.
  const BUBBA_TRIAL_FLUSTER = () => trialBank('ErisTrial.bubbaTrialFluster');

  // The charges, read out by somebody who has already decided not to press them.
  const BUBBA_TRIAL_CHARGES = () => trialBank('ErisTrial.bubbaTrialCharges');

  // The pardon, arriving far too fast and dressed up as procedure.
  const BUBBA_TRIAL_PARDONS = () => trialBank('ErisTrial.bubbaTrialPardons');

  // And out, before he can say anything back.
  const BUBBA_TRIAL_DISMISSALS = () => trialBank('ErisTrial.bubbaTrialDismissals');

  // What slips out when the dates have already got somewhere (bond >= 0.4).
  const BUBBA_TRIAL_SLIPS = () => trialBank('ErisTrial.bubbaTrialSlips');

  // Her opening at an Em trial: the grudge, undisguised.
  const EM_TRIAL_OPENINGS = () => trialBank('ErisTrial.emTrialOpenings');

  // The jealousy, which she never quite says out loud.
  const EM_TRIAL_JABS = () => trialBank('ErisTrial.emTrialJabs');

  // Capital sentence for Em: pronounced in full, then commuted at the last
  // possible second. She always commutes it. She would never actually do it.
  const EM_CAPITAL_BUILDUP = () => trialBank('ErisTrial.emCapitalBuildup');

  const EM_COMMUTE_REASONS = () => trialBank('ErisTrial.emCommuteReasons');

  // Once Em has actually got somewhere with her on a date, the grudge starts
  // losing to whatever the other thing is. She stays fickle about it.
  const EM_PARDON_LINES = () => trialBank('ErisTrial.emPardonLines');

  // Fickle: even with the bond high she sometimes swings back.
  const EM_RELAPSE_LINES = () => trialBank('ErisTrial.emRelapseLines');

  //=============================================================================
  // Eris and the player
  //=============================================================================
  //
  // The counterweight Em and Bubba already have, written for whoever is actually
  // playing. ErisDateSystem records how the evenings went in
  // $gameSystem._erisPlayerBond (0..1, opinion + how many dates were seen
  // through) and this is the only channel the court reads: a goddess who has sat
  // across a table from you is measurably worse at pretending she has not. It
  // softens her mood, drops the odds of a conviction, shortens what she hands
  // down and, high enough, throws the case out before it is read. She stays
  // fickle: a bond is a lean, never a guarantee.
  const ErisPlayerBond = {
    bond() {
      if (!window.$gameSystem) return 0;
      return Math.max(0, Math.min(1, Number($gameSystem._erisPlayerBond) || 0));
    },
    setBond(value) {
      if (!window.$gameSystem) return;
      $gameSystem._erisPlayerBond = Math.max(0, Math.min(1, Number(value) || 0));
    },
    dates() {
      if (!window.$gameSystem) return 0;
      return Math.max(0, Number($gameSystem._erisDatesCompleted) || 0);
    },
    noteDate() {
      if (!window.$gameSystem) return 0;
      $gameSystem._erisDatesCompleted = this.dates() + 1;
      return $gameSystem._erisDatesCompleted;
    }
  };
  window.ErisPlayerBond = ErisPlayerBond;


  // The bond winning outright: the case ends before it starts.
  const ERIS_CLEMENCY_LINES = () => trialBank('ErisTrial.erisClemencyLines');

  // Fickle in the other direction: sometimes the evenings buy nothing at all.
  const ERIS_COLD_SNAP_LINES = () => trialBank('ErisTrial.erisColdSnapLines');

  //=============================================================================
  // The defence bar
  //=============================================================================
  //
  // Eris's court has never had a defence, which is exactly why one is worth
  // buying. Five advocates practise in front of her bench. They are not invented
  // for the occasion: they are pulled out of the world's own NPC pools
  // (js/db/WorldGen/NPCPools.json, the same events NPCSystem spawns) and fixed
  // for the lifetime of the world by the creation seed, so every savegame of a
  // world briefs the same five people. They are ranked, and the rank is written
  // onto the real society profile: level, INT (MAT) and WIS (MDF) are overridden
  // and the "Defence Lawyer" job (Jobs.json id 139) is pinned on, so the same
  // person reads as a lawyer in the Empathize panel and everywhere else.
  //
  // They stay ordinary NPCs in every other respect, which includes being
  // recruitable. Taking one into the party strikes them off the bar, and the
  // next name in the world's seeded queue is called to it.
  const LAWYER_JOB_ID = 139;
  const LAWYER_ROSTER_SIZE = 5;

  // "Law" (js/db/Skills/Specialization.json id 155, Academia, INT). The bar
  // trains it professionally; everybody else picks it up the hard way, one
  // hearing at a time, by standing up in Eris's court and trying. It is a real
  // specialization, so it shows in the Specializations menu and on the NPC
  // Empathize panel like any other, and it moves the odds either way.
  const LAW_SPEC_ID = 155;
  // Where each rank of the bar sits on the five-step ladder (1 = Untrained).
  const LAWYER_LAW_LEVELS = [5, 5, 4, 3, 2];
  // Points awarded per hearing. EXP_TO_NEXT is [-, 8, 20, 45, 90], so this is
  // three or four trials to Beginner and a career to Master.
  const LAW_EXP_PER_TRIAL = 2;
  const LAW_EXP_ARGUING = 1;   // extra for actually standing up to argue
  const LAW_EXP_WON = 2;       // extra for walking back out again

  // The Law level whoever is arguing actually holds.
  function lawLevelOf(option) {
    if (!option) return 1;
    if (option.kind === "npc") {
      return LAWYER_LAW_LEVELS[Math.min(option.rank, LAWYER_LAW_LEVELS.length - 1)] || 1;
    }
    const actor = lawActorFor(option);
    if (actor && actor.specializationLevel) {
      try { return actor.specializationLevel(LAW_SPEC_ID); } catch (e) { return 1; }
    }
    return 1;
  }

  // Who earns the Law points for this option: the companion who stood up, or,
  // with the defence bench empty, the party leader defending themselves.
  function lawActorFor(option) {
    if (!$gameParty || !$gameParty.members) return null;
    if (!option || option.kind === "npc") return null;
    if (option.kind === "party") {
      return $gameParty.members().find(m => m && m.actorId() === option.actorId) || null;
    }
    return $gameParty.leader ? $gameParty.leader() : null;
  }

  // Rank 0 is the silk, rank 4 the duty solicitor. `flat` is a retainer in gold
  // (100g = 1.00€), `cut` the share of the bounty they take on top.
  const LAWYER_RANKS_META = [{"level":42,"int":78,"wis":74,"flat":60000,"cut":0.1},{"level":33,"int":61,"wis":58,"flat":28000,"cut":0.08},{"level":25,"int":47,"wis":45,"flat":12000,"cut":0.06},{"level":17,"int":33,"wis":32,"flat":5000,"cut":0.045},{"level":9,"int":20,"wis":19,"flat":1200,"cut":0.03}];
  const LAWYER_RANKS = () => trialRecords(LAWYER_RANKS_META, 'ErisTrial.lawyerRanks');

  // How much of a defence Eris is willing to hear at all. Spite and chaos do not
  // listen; boredom and benevolence do. This multiplies everything an advocate
  // is worth, which is why the odds board swings so hard on her mood.
  const LAWYER_MOOD_WEIGHT = {
    benevolent: 1.40, neutral: 1.00, bored: 1.15, dramatic: 0.80,
    whimsical: 0.85, chaotic: 0.45, irritated: 0.65, vindictive: 0.40
  };

  // How likely she is to throw the advocate out before they have opened their
  // mouth. A banned lawyer's bonus is simply gone; the fee is not refunded.
  const LAWYER_BAN_CHANCE = {
    benevolent: 0.05, neutral: 0.15, bored: 0.18, dramatic: 0.26,
    whimsical: 0.22, chaotic: 0.34, irritated: 0.38, vindictive: 0.48
  };

  const _lawyerRng = (seed) => (window.NPCShared ? new window.NPCShared.Rng(seed) : {
    next: () => Math.random(),
    int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    nextInt: (a, b) => a + Math.floor(Math.random() * (b - a))
  });

  const _lawyerHash = (s) => (window.NPCShared ? window.NPCShared.nameHash(s) : (() => {
    let h = 5381;
    for (let i = 0; i < String(s).length; i++) h = ((h * 33) ^ String(s).charCodeAt(i)) >>> 0;
    return h || 1;
  })());

  const ErisLawyers = {
    // Every named person in the world's NPC pools who carries a walking sprite.
    // Placeholder event names ("NPC", "EV003", ...) are events, not people, and
    // never take silk. Cached per session; the pools do not change at runtime.
    _pool: null,
    pool() {
      if (this._pool) return this._pool;
      const out = [];
      const seen = new Set();
      const pools = window.WorldGen && window.WorldGen.NPCPools;
      if (pools) {
        for (const [group, list] of Object.entries(pools)) {
          if (group.startsWith("__") || !Array.isArray(list)) continue;
          for (const entry of list) {
            const ed = entry && entry.eventData;
            if (!ed || !ed.name) continue;
            const name = String(ed.name).trim();
            if (name.length < 2 || seen.has(name)) continue;
            if (/^(npc|event|test|ev\d*|copy)\b/i.test(name)) continue;
            const image = (ed.pages && ed.pages[0] && ed.pages[0].image) || null;
            if (!image || !image.characterName) continue;
            seen.add(name);
            out.push({
              name,
              group,
              characterName: image.characterName,
              characterIndex: image.characterIndex || 0
            });
          }
        }
      }
      this._pool = out;
      return out;
    },

    seed() {
      const ws = window.NPCShared ? window.NPCShared.worldSeed()
        : (window.HistoryManager && window.HistoryManager.getSeed ? window.HistoryManager.getSeed() : 19002001);
      // Its own corner of the world seed, so calling the bar does not disturb
      // anything else derived from it.
      return (ws ^ 0x1a77e45) >>> 0;
    },

    // The world's queue of advocates, in the order the bar calls them. Fixed by
    // the creation seed, so it is identical in every savegame of this world.
    order() {
      const pool = this.pool();
      if (!pool.length) return [];
      const rng = _lawyerRng(this.seed());
      const shuffled = window.NPCShared
        ? window.NPCShared.seededShuffle(pool, rng)
        : pool.slice();
      return shuffled;
    },

    store() {
      if (!window.$gameSystem) return null;
      const seed = this.seed();
      let s = $gameSystem._erisLawyers;
      if (!s || s.seed !== seed) {
        s = { seed, retired: [] };
        $gameSystem._erisLawyers = s;
      }
      if (!Array.isArray(s.retired)) s.retired = [];
      return s;
    },

    // Anyone who has walked out of the pool and into the party (now or at any
    // point in this world's history) has stopped practising. Struck off, and the
    // queue moves up.
    _isRecruited(name) {
      const inParty = ($gameParty && $gameParty.members
        ? $gameParty.members().some(m => m && m.name() === name) : false);
      if (inParty) return true;
      const past = window.$gameSystem && $gameSystem._npcPastPartyMembers;
      if (Array.isArray(past)) {
        return past.some(p => p === name || (p && p.name === name));
      }
      return false;
    },

    // The five practising right now, best first. Reconciles recruitment on the
    // way, so simply opening the brief promotes whoever needs promoting.
    roster() {
      const store = this.store();
      const order = this.order();
      if (!store || !order.length) return [];

      const retired = new Set(store.retired);
      const out = [];
      for (const entry of order) {
        if (out.length >= LAWYER_ROSTER_SIZE) break;
        if (retired.has(entry.name)) continue;
        if (this._isRecruited(entry.name)) {
          // Struck off for good: the world remembers, so a later playthrough
          // does not brief someone who left with a previous party.
          if (store.retired.indexOf(entry.name) < 0) store.retired.push(entry.name);
          retired.add(entry.name);
          continue;
        }
        out.push(entry);
      }
      return out.map((entry, rank) => this.describe(entry, rank));
    },

    // Pin the rank onto the person: real society profile, real overridden stats,
    // real job. Everything downstream (Empathize, the sim, the wiki) reads these.
    ensureProfile(entry, rank) {
      if (!entry) return null;
      let profile = null;
      try {
        profile = window.NPCSocietyRegistry?.getProfile?.(entry.name)
          || window.NPCSocietyRegistry?.ensureProfile?.(entry.name, null)
          || null;
      } catch (e) { profile = null; }
      if (!profile) return null;

      const band = LAWYER_RANKS()[Math.min(rank, LAWYER_RANKS().length - 1)];
      // Seeded jitter, so two worlds do not brief numerically identical people.
      const rng = _lawyerRng((this.seed() ^ _lawyerHash(entry.name)) >>> 0);
      const jitter = (spread) => rng.int(-spread, spread);

      profile._erisLawyerRank = rank;
      profile.level = Math.max(1, band.level + jitter(3));
      // The court has no INT/WIS of its own: MAT is the mind that builds the
      // argument and MDF the judgement that knows which one to make, so the
      // ladder is written onto those and displayed under the legal names.
      profile.mat = Math.max(1, band.int + jitter(4));
      profile.mdf = Math.max(1, band.wis + jitter(4));
      profile.currentJobId = LAWYER_JOB_ID;
      profile.workMapId = prisonMapId;
      if (profile.workShift == null) profile.workShift = 1;

      // The Law specialization, pinned at the level their seniority implies.
      // _specOverrides is honoured by the Empathize panel's specialization list
      // (NPCEmpathizeUI._getNpcSpecializations), so the person the player meets
      // on the street reads as trained in it.
      const lawLevel = LAWYER_LAW_LEVELS[Math.min(rank, LAWYER_LAW_LEVELS.length - 1)] || 2;
      profile._specOverrides = Object.assign({}, profile._specOverrides, { [LAW_SPEC_ID]: lawLevel });
      // The cached display rows predate the override; drop them so the panel
      // rebuilds with Law in place.
      if (profile._specCache) profile._specCache = null;
      // Pinned: JobManager only reassigns a profile whose job is still null, so
      // an advocate never drifts back into warehouse work.
      profile._erisLawyerJobLocked = true;
      return profile;
    },

    // What the lawyer thinks of the person doing the hiring. Their own earned
    // standing with the party leader when the Empathize maths is available,
    // otherwise the party-wide baseline.
    disposition(profile) {
      if (!profile) return 0;
      const leader = $gameParty && $gameParty.leader ? $gameParty.leader() : null;
      const h = window.NPCEmpathize && window.NPCEmpathize._helpers;
      if (leader && h && h._npcEffectiveOpinion) {
        try { return h._npcEffectiveOpinion(profile, leader); } catch (e) { /* fall through */ }
      }
      return Math.round(profile.playerOpinion || 0);
    },

    // The retainer plus their cut of whatever the court says you are worth.
    fee(rank, bounty) {
      const band = LAWYER_RANKS()[Math.min(rank, LAWYER_RANKS().length - 1)];
      return Math.round(band.flat + Math.max(0, bounty || 0) * band.cut);
    },

    describe(entry, rank) {
      const profile = this.ensureProfile(entry, rank);
      const band = LAWYER_RANKS()[Math.min(rank, LAWYER_RANKS().length - 1)];
      const bounty = $gameVariables ? ($gameVariables.value(bountyVariableId) || 0) : 0;
      return {
        kind: "npc",
        rank,
        name: entry.name,
        title: band.text,
        group: entry.group,
        characterName: entry.characterName,
        characterIndex: entry.characterIndex,
        profile,
        level: profile ? profile.level : band.level,
        int: profile ? profile.mat : band.int,
        wis: profile ? profile.mdf : band.wis,
        disposition: this.disposition(profile),
        fee: this.fee(rank, bounty),
        banned: false
      };
    },

    isLawyer(name) {
      return this.roster().some(l => l.name === name);
    },

    // Working a case together moves the needle for everybody in the room, and
    // the result moves it further. Applied to each party member's own standing
    // with this advocate (NPCEmpathize per-actor reputation), and to the
    // party-wide baseline the rest of the sim reads.
    recordTrial(lawyer, outcome) {
      if (!lawyer || lawyer.kind !== "npc" || !lawyer.profile) return;
      const profile = lawyer.profile;
      // Passive: a brief taken is a brief taken, whatever the bench decides.
      let delta = 2;
      if (outcome === "innocent") delta += 10;
      else if (outcome === "guilty") delta -= 6;
      if (lawyer.banned) delta -= 2; // thrown out, and not for the first time

      const h = window.NPCEmpathize && window.NPCEmpathize._helpers;
      const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
      for (const actor of members) {
        if (!actor) continue;
        if (h && h._addNpcOpinion) {
          try { h._addNpcOpinion(profile, actor.actorId(), delta); continue; } catch (e) { /* fall through */ }
        }
        const map = (profile.opinions || (profile.opinions = {}));
        const id = actor.actorId();
        const base = map[id] != null ? map[id] : (profile.playerOpinion || 0);
        map[id] = Math.max(-100, Math.min(100, Math.round(base + delta)));
      }
      profile.playerOpinion = Math.max(-100, Math.min(100,
        Math.round((profile.playerOpinion || 0) + delta)));

      if (!Array.isArray(profile.eventLog)) profile.eventLog = [];
      profile.eventLog.push({
        type: "work",
        text: outcome === "innocent"
          ? T('ErisTrial.log.acquittal')
          : (lawyer.banned ? T('ErisTrial.log.thrownOut') : T('ErisTrial.log.lostCase')),
        gameMin: $gameVariables ? ($gameVariables.value(114) || 0) : 0
      });
    }
  };
  window.ErisLawyers = ErisLawyers;

  // World initialization: the five advocates practising before Eris's bench are
  // drawn from the world's own NPCs and their rank is written onto their real
  // society profile (stats, the Law specialization, the Defence Lawyer job).
  // Deciding that when the world is made means they are already lawyers when
  // the player meets one on the street, instead of becoming lawyers the first
  // time somebody is arrested.
  if (window.WorldManager?.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer("erisLawyers", 80, () => {
      ErisLawyers.roster();
    });
  }

  // The advocate's own walking sprite, sliced out of its character sheet for
  // the brief's DOM page: the player picks the person they will meet on the
  // street, not a portrait invented for a menu. Big (!$) sheets are 3x4, normal
  // ones pack eight characters into a 12x8 grid.
  //
  // It is drawn onto a canvas rather than stretched as a CSS background: a sheet
  // cell is only square by convention, and forcing one into a square box
  // squashed every sprite that was not. The frame is fitted into the box at its
  // own proportions and centred, the same way the menu portraits are.
  function paintLawyerSprite(canvas, characterName, characterIndex = 0) {
    if (!canvas || !characterName) return;
    const bitmap = ImageManager.loadCharacter(characterName);
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !bitmap.width || !bitmap.height) return;
      ctx.imageSmoothingEnabled = false;
      const isBig = ImageManager.isBigCharacter(characterName);
      const pw = bitmap.width / (isBig ? 3 : 12);
      const ph = bitmap.height / (isBig ? 4 : 8);
      const blockX = isBig ? 0 : (characterIndex % 4) * 3;
      const blockY = isBig ? 0 : Math.floor(characterIndex / 4) * 4;
      const sx = (blockX + 1) * pw; // standing, middle frame
      const sy = blockY * ph;       // facing the player
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fit = Math.min(canvas.width / pw, canvas.height / ph);
      const dw = pw * fit;
      const dh = ph * fit;
      ctx.drawImage(bitmap.canvas, sx, sy, pw, ph,
        (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    };
    if (bitmap.isReady()) draw();
    else bitmap.addLoadListener(draw);
  }

  // How much argument is actually being carried, 0..1. Stats do most of it,
  // standing and seniority the rest, and the Law specialization sits on top of
  // both: knowing the law is not the same as being clever at it.
  //
  // An empty defence bench is not automatically nothing. A defendant who has
  // stood up in this court often enough to have trained Law argues their own
  // case, badly but really, which is the whole reason the skill trains.
  function lawyerStrength(l) {
    if (!l || l.banned) return 0;
    const law = (Math.max(1, Math.min(5, lawLevelOf(l))) - 1) / 4; // 0..1

    if (l.kind === "none") {
      // Self-representation: no fee, no advocate, only what the defendant knows.
      return Math.max(0, Math.min(1, law * 0.35));
    }

    const stat = ((l.int || 0) + (l.wis || 0)) / 2;
    const disp = Math.max(-100, Math.min(100, l.disposition || 0));
    return Math.max(0, Math.min(1,
      (Math.min(stat, 90) / 90) * 0.42 +
      (Math.min(l.level || 1, 50) / 50) * 0.22 +
      ((disp + 100) / 200) * 0.16 +
      law * 0.20
    ));
  }

  // Her odds of throwing them out. Mood leads; a strong, well-liked advocate is
  // harder to dismiss, and a goddess who has been to dinner with the defendant
  // is in no hurry to clear the room.
  function lawyerBanChance(l, mood, bond) {
    if (!l || l.kind === "none") return 0;
    let base = LAWYER_BAN_CHANCE[mood] != null ? LAWYER_BAN_CHANCE[mood] : 0.2;
    // Sending a friend up to argue for you is its own provocation.
    if (l.kind === "party") base += 0.08;
    base *= (1 - lawyerStrength(l) * 0.30);
    base *= (1 - (bond || 0) * 0.60);
    return Math.max(0, Math.min(0.85, base));
  }

  // The court's own arithmetic, in one place, so the board shown before the
  // hearing is the board that is actually played.
  function baseGuiltyChance(mood, chaos, plea) {
    let g = 0.5 + (chaos - 0.5) * 0.4;
    if (mood === "benevolent") g -= 0.25;
    else if (mood === "vindictive") g += 0.3;
    else if (mood === "whimsical" && plea === 2) g -= 0.2;
    return g;
  }

  // How receptive she is today. An advocate's argument and her own memory of
  // dinner both have to get through the same filter, which is why the mood she
  // turned up in swings the board harder than anything the player can buy.
  function moodReceptiveness(mood) {
    return LAWYER_MOOD_WEIGHT[mood] != null ? LAWYER_MOOD_WEIGHT[mood] : 1;
  }

  function lawyerRelief(l, mood) {
    return lawyerStrength(l) * 0.52 * moodReceptiveness(mood);
  }

  // The dating bond, filtered more gently than an advocate's: she is arguing
  // with herself, which is harder to win but never entirely deaf, so even a
  // vindictive Eris keeps some of it.
  function bondRelief(bond, mood) {
    return (bond || 0) * 0.45 * (0.55 + moodReceptiveness(mood) * 0.45);
  }

  // The full projection for one option: what the player is buying, stated as
  // the four things that can happen. `reversalRate` folds in her standing
  // 10% last-second change of mind, so the numbers are honest.
  function projectOutcome({ lawyer, mood, chaos, bond, isEm, emBond, reversalRate = 0.1 }) {
    const clamp = (v) => Math.max(0.02, Math.min(0.98, v));
    let base = baseGuiltyChance(mood, chaos, null);
    if (isEm) base = 0.95 - (emBond || 0) * 0.8;
    const withoutLawyer = clamp(base - bondRelief(bond, mood));
    const withLawyer = clamp(withoutLawyer - lawyerRelief(lawyer, mood));
    const pBan = lawyerBanChance(lawyer, mood, bond);

    let guilty = pBan * withoutLawyer + (1 - pBan) * withLawyer;
    // Her reversal is applied to whatever she just decided, either way.
    guilty = guilty * (1 - reversalRate) + (1 - guilty) * reversalRate;

    // An advocate who stays in the room also argues the sentence down.
    const pShort = Math.max(0.35, Math.min(0.95,
      0.5 + lawyerStrength(lawyer) * 0.4 * (1 - pBan) + (bond || 0) * 0.15));

    return {
      acquitted: guilty >= 1 ? 0 : (1 - guilty),
      shortTerm: guilty * pShort,
      longTerm: guilty * (1 - pShort),
      banned: pBan,
      guilty,
      pShort
    };
  }

  // ── Eris on the subject of lawyers ──────────────────────────────────────
  // She has never needed a defence bar and says so, at length, every time one
  // walks in. Mood-keyed, because how she takes it is the whole mechanic.
  const LAWYER_GREETINGS = () => trialBank('ErisTrial.lawyerGreetings');

  // A friend from the party standing up instead: she takes that personally.
  const LAWYER_PARTY_GREETINGS = () => trialBank('ErisTrial.lawyerPartyGreetings');

  // Standing there without one.
  const LAWYER_ABSENT_LINES = () => trialBank('ErisTrial.lawyerAbsentLines');

  // Thrown out. Mood decides how ceremonious she is about it.
  const LAWYER_BAN_LINES = () => trialBank('ErisTrial.lawyerBanLines');

  // What an advocate who survived the introduction actually does with the time.
  const LAWYER_OBJECTIONS = () => trialBank('ErisTrial.lawyerObjections');

  // Her replies to them. Warm, cold, or simply loud, per mood.
  const LAWYER_ERIS_REPLIES = () => trialBank('ErisTrial.lawyerErisReplies');

  //=============================================================================
  // Advancing the hearing, message by message
  //=============================================================================
  // Cancel (Escape, the pad's B button, a right click) does not skip anything:
  // it hands the pace over to the court. Auto-play closes one message after
  // another on a timer, so every line is still spoken into the transcript
  // exactly as if the player had pressed on, and it gives the reins back the
  // moment a question is asked or the player presses anything themselves.
  //
  // Both benches use this: the ordinary hearing and the one where the player
  // wears the robe.
  const AUTO_BASE_MS = 190;
  const AUTO_PER_CHAR_MS = 7;
  const AUTO_MAX_MS = 900;

  // Long lines hold the page longer than short ones, so an auto-played hearing
  // still reads as a hearing rather than a scroll.
  function autoAdvanceDelay(trial) {
    const log = trial._dialogueLog;
    const last = log && log.length ? log[log.length - 1] : null;
    const chars = last ? String(last.text).length : 0;
    return Math.min(AUTO_MAX_MS, AUTO_BASE_MS + chars * AUTO_PER_CHAR_MS);
  }

  // Escape and the pad's cancel button both read as 'cancel' through Input;
  // the right mouse button arrives as a TouchInput cancel. Polled in one place
  // so a single press can only ever be counted once.
  function cancelPressed() {
    return Input.isTriggered('cancel') || TouchInput.isCancelled();
  }

  // The two states of the continue caret. Glyphs rather than words: they are
  // the same in every language and they name no key.
  const CARET_WAIT = '▾';
  const CARET_AUTO = '▸▸';

  function waitForAdvance(trial, minReadMs = 260) {
    const log = trial._ensureBook();
    let hint = null;
    if (log) {
      hint = document.createElement('div');
      hint.className = 'eris-continue-hint';
      log.appendChild(hint);
      log.scrollTop = log.scrollHeight;
    }

    return new Promise(resolve => {
      const advanceKeys = ['Enter', 'NumpadEnter', 'Space'];
      let readyAt = performance.now() + minReadMs;
      let autoAt = trial._autoPlay ? performance.now() + autoAdvanceDelay(trial) : 0;
      let armed = false;
      let active = true;

      // The mark under the newest line is a caret, never a key legend: the
      // game names no keys (docs/task/ui_fixing.md). One chevron means the
      // transcript is waiting on the reader, two mean it is running itself.
      const paintHint = () => {
        if (!hint) return;
        hint.classList.toggle('auto', !!trial._autoPlay);
        if (trial._autoPlay) {
          hint.textContent = CARET_AUTO;
          hint.classList.add('ready');
        } else {
          hint.textContent = CARET_WAIT;
          hint.classList.toggle('ready', armed);
        }
      };

      const done = () => {
        active = false;
        document.removeEventListener('keydown', kh);
        if (log) log.removeEventListener('click', ch);
        if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
        // Drop the press so the next wait or choice does not inherit it.
        Input.clear();
        resolve();
      };

      const startAuto = () => {
        trial._autoPlay = true;
        autoAt = performance.now() + autoAdvanceDelay(trial);
        SoundManager.playCursor();
        paintHint();
      };

      // Taking the pace back leaves the player on the line they are reading,
      // with the usual read gate in front of them.
      const stopAuto = () => {
        trial._autoPlay = false;
        armed = false;
        readyAt = performance.now() + 200;
        paintHint();
      };

      const kh = (e) => {
        if (!armed || e.repeat || trial._autoPlay) return;
        if (advanceKeys.includes(e.code)) { e.preventDefault(); SoundManager.playOk(); done(); }
      };
      // The whole transcript is the continue button, the prompt under the
      // newest line included.
      const ch = () => {
        if (trial._autoPlay) { stopAuto(); SoundManager.playOk(); done(); return; }
        if (armed) { SoundManager.playOk(); done(); }
      };
      document.addEventListener('keydown', kh);
      if (log) log.addEventListener('click', ch);
      paintHint();

      const poll = () => {
        if (!active) return;

        if (trial._autoPlay) {
          // Cancel again stops the playback; pressing on takes the line AND
          // the pace back.
          if (cancelPressed()) {
            stopAuto();
          } else if (Input.isTriggered('ok')) {
            stopAuto();
            SoundManager.playOk();
            done();
            return;
          } else if (performance.now() >= autoAt) {
            done();
            return;
          }
          requestAnimationFrame(poll);
          return;
        }

        // Cancel plays the rest of the hearing out; it is offered before the
        // read gate, since it is not an answer to anything.
        if (cancelPressed()) {
          startAuto();
          requestAnimationFrame(poll);
          return;
        }

        if (!armed) {
          const held = Input.isPressed('ok') || Input.isPressed('down') || Input.isPressed('right');
          if (!held && performance.now() >= readyAt) {
            armed = true;
            paintHint();
          }
        } else if (Input.isTriggered('ok') || Input.isTriggered('down') || Input.isTriggered('right')) {
          SoundManager.playOk();
          done();
          return;
        }
        requestAnimationFrame(poll);
      };
      poll();
    });
  }

  //=============================================================================
  // ErisTrial Class
  //=============================================================================
  class ErisTrial {
    constructor() {
      this.mood = "";
      this.playerPlea = "";
      this.crimes = [];
      this.bounty = 0;
      this.chaos = 0;
      this.verdict = null;

      // UI Properties
      this._container = null;
      this._dialogueLog = [];
      this._updateInterval = null;
      // Cancel plays the hearing out on its own until the next question.
      this._autoPlay = false;

      // Who is actually in the dock. Bubba outranks Em: the grudge she tries Em
      // for is about him, and with him standing there she cannot perform any of
      // it. So a party carrying both gets the mortified version, not the trial.
      this.isBubba = ErisBubba.inPlay();
      this.bubbaBond = this.isBubba ? ErisBubba.bond() : 0;
      this.isEm = ErisEm.inPlay() && !this.isBubba;
      this.emBond = this.isEm ? ErisEm.bond() : 0;
      // Set once the capital sentence has been pronounced and taken back.
      this.commuted = false;

      // How many evenings the defendant has spent with the judge. Em and Bubba
      // have their own, sharper channels; this is everyone else's, and it is
      // deliberately never applied on top of theirs.
      this.playerBond = (this.isEm || this.isBubba) ? 0 : ErisPlayerBond.bond();
      // Chosen at the brief: the advocate, and whether she let them stay.
      this.lawyer = null;
      this.lawyerBanned = false;
      // Set when the bond alone ends the hearing before the charges are read.
      this.pardoned = false;

      // Load crimes
      this.loadPlayerCrimes();

      // Set Eris's mood
      this.setMood();

      // Today's court, assembled fresh. Nothing here repeats between trials.
      this.court = this.rollCourt();
      // The sentence waiting at the end of a guilty verdict.
      this.sentence = pick(TRIAL_SENTENCES());

      // Initialize chaos level
      this.chaos = Math.random() * 0.5 + 0.1;
    }

    // A courtroom drawn from the pools: venue, gallery, staff, ambience.
    rollCourt() {
      return {
        venue: pickFrom(COURT_VENUES()),
        gallery: pickFrom(COURT_GALLERY()),
        staff: pickFrom(COURT_STAFF()),
        ambience: pickFrom(COURT_AMBIENCE())
      };
    }

    // Narration line describing where this trial is being held.
    courtDescription() {
      return T('ErisTrial.line.courtDescription', {
        venue: this.court.venue, gallery: this.court.gallery,
        staff: this.court.staff, ambience: this.court.ambience
      });
    }

    // "I refer the court to X versus Y, 1743. The ruling was..."
    citePrecedent() {
      const parties = bank(PRECEDENT_PARTIES()).slice();
      const a = parties.splice(Math.floor(Math.random() * parties.length), 1)[0];
      const b = parties[Math.floor(Math.random() * parties.length)];
      const year = 1200 + Math.floor(Math.random() * 802);
      const ruling = pickFrom(PRECEDENT_RULINGS());
      return T('ErisTrial.line.citePrecedent',
        { a: a, b: b, year: year, ruling: ruling });
    }

    // "Exhibit F: half a train ticket, recovered from your own coat pocket."
    presentExhibit() {
      const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const item = pickFrom(EXHIBIT_ITEMS());
      const place = pickFrom(EXHIBIT_PLACES());
      return T('ErisTrial.line.presentExhibit',
        { letter: letter, item: item, place: place });
    }

    // Drops an aside into the running order. Called between beats; most of the
    // time it says nothing at all, so the pacing itself varies too.
    async maybeInterrupt(chance = 0.35) {
      if (Math.random() > chance) return;
      const roll = Math.random();
      const line = roll < 0.45 ? pickFrom(TRIAL_INTERRUPTIONS())
        : roll < 0.75 ? this.citePrecedent()
          : this.presentExhibit();
      this._addDialogue(line);
      await this._waitForAdvance();
    }

    _adjustChaos(amount) {
      this.chaos += amount;
      this.chaos = Math.max(0, Math.min(1, this.chaos));
    }

    loadPlayerCrimes() {
      const playerCrimeKeys = window.playerCrimes || [];
      const { PresetCrimes } = window.Messages || {};

      this.crimes = [];
      let totalBounty = 0;

      for (const crimeKey of playerCrimeKeys) {
        if (PresetCrimes && PresetCrimes[crimeKey]) {
          this.crimes.push({
            key: crimeKey,
            name: PresetCrimes[crimeKey].name,
            bounty: PresetCrimes[crimeKey].bounty,
          });
          totalBounty += PresetCrimes[crimeKey].bounty;
        }
      }

      this.bounty = $gameVariables.value(bountyVariableId) || totalBounty;
    }

    setMood() {
      const moods = [
        "benevolent",
        "neutral",
        "irritated",
        "chaotic",
        "vindictive",
        "whimsical",
        "bored",
        "dramatic",
      ];

      // Em never gets the full wheel. Cold and vindictive by default; the more
      // of herself Eris has admitted to her on a date, the more the warm moods
      // creep back in. She stays fickle either way, so the pool is weighted,
      // never fixed.
      if (this.isEm) {
        const hostile = ["vindictive", "vindictive", "irritated", "dramatic"];
        const softened = ["benevolent", "whimsical", "neutral", "chaotic"];
        const pool = Math.random() < this.emBond ? softened : hostile;
        this.mood = pick(pool);
        return;
      }

      // A defendant she has had dinner with does not get the cold end of the
      // wheel as often. Weighted, not fixed: she is still Eris about it.
      if (this.playerBond > 0 && Math.random() < this.playerBond * 0.85) {
        this.mood = pick(["benevolent", "benevolent", "whimsical", "neutral", "bored"]);
        return;
      }

      this.mood = moods[Math.floor(Math.random() * moods.length)];
    }

    formatEuros(gold) {
      const euros = gold / 100;
      return euros.toFixed(2) + "€";
    }

    getRandomCrimeAccusation() {
      return getRandomCrimeAccusation();
    }

    _loadResources() {

    }

    _createTrialUI() {
      this._loadResources();
      this._dialogueLog = [];
      this._container = document.createElement('div');
      this._container.id = 'menu-container';
      markCourt(this._container);
      document.body.appendChild(this._container);
      this._renderBook();
      this._updateInterval = setInterval(() => this._updateTrialUI(), 500);
    }

    _renderBook() {
      const crimesHTML = this.crimes.length > 0
        ? this.crimes.map(c => `<div class="inspect-spec-row"><span class="inspect-spec-label">${c.name}</span><span class="inspect-spec-value">${this.formatEuros(c.bounty)}</span></div>`).join('')
        : `<div class="ui-empty-text">${T('ErisTrial.line.noCrimesOnRecord')}</div>`;
      const logHTML = this._dialogueLog.map(e => {
        const body = String(e.text).replace(/\r?\n/g, '<br>');
        if (e.who === 'narrator') return `<div class="eris-dialogue-entry narrator">${body}</div>`;
        const speaker = e.who === 'eris' ? 'Eris' : (T('ErisTrial.line.you'));
        return `<div class="eris-dialogue-entry ${e.who}"><span class="eris-speaker">${speaker}</span>${body}</div>`;
      }).join('');
      this._container.innerHTML = `
        <div class="book-spread">
          <div class="left-page page-top">
            <div class="page-header-bar"><h2 class="title">${T('ErisTrial.line.theTrial')}</h2></div>
            <div class="eris-dialogue-log" id="eris-log">${logHTML}</div>
            <div class="eris-choices-panel" id="eris-choices"></div>
          </div>
          <div class="right-page page-top">
            <div class="page-header-bar"><h2 class="title">Eris</h2></div>
            <div class="ui-chip-row">
              <span class="ui-chip">${moodIconHTML(this.mood)} ${this.mood}</span>
            </div>
            <h3 class="inspect-section-title">${T('ErisTrial.line.charges')}</h3>
            <div class="eris-rows">${crimesHTML}</div>
            <div class="eris-total">
              <span>${T('ErisTrial.line.totalBounty')}</span>
              <span>${this.formatEuros(this.bounty)}</span>
            </div>
            <div class="eris-meter">
              <div class="meter-label">${T('ErisTrial.line.chaosLevel')}</div>
              <div class="eris-meter-track"><div class="eris-meter-fill" id="eris-chaos" style="--fill:${this.chaos * 100}%"></div></div>
            </div>
            <h3 class="inspect-section-title">${T('ErisTrial.line.todaySCourt')}</h3>
            <div class="eris-rows">
              <div class="inspect-spec-row inspect-spec-row--stacked">
                <span class="inspect-spec-label">${T('ErisTrial.line.venue')}</span>
                <span class="inspect-spec-value">${this.court.venue}</span>
              </div>
              <div class="inspect-spec-row inspect-spec-row--stacked">
                <span class="inspect-spec-label">${T('ErisTrial.line.gallery')}</span>
                <span class="inspect-spec-value">${this.court.gallery}</span>
              </div>
            </div>
          </div>
        </div>`;
      const log = document.getElementById('eris-log');
      if (log) log.scrollTop = log.scrollHeight;
    }

    _updateTrialUI() {
      const bar = document.getElementById('eris-chaos');
      if (bar) bar.style.setProperty('--fill', `${this.chaos * 100}%`);
    }

    _removeTrialUI() {
      if (this._container) {
        this._container.classList.add('eris-fading');
        const c = this._container;
        setTimeout(() => { if (c && c.parentNode) c.parentNode.removeChild(c); }, 250);
        this._container = null;
      }
      if (this._updateInterval) {
        clearInterval(this._updateInterval);
        this._updateInterval = null;
      }
    }

    // who: true/'player' for the player's own line, 'narrator' for stage
    // directions, anything else for Eris. Every line goes through vary() first,
    // so "{a|b|c}" groups written into the banks are rolled as they are spoken.
    _addDialogue(text, isPlayer = false) {
      const who = isPlayer === 'narrator' ? 'narrator' : (isPlayer ? 'player' : 'eris');
      const clean = vary(String(text)).replace(/\\C\[\d+\]/g, '');
      this._dialogueLog.push({ who, text: clean });
      const log = document.getElementById('eris-log');
      if (log) {
        const entry = document.createElement('div');
        entry.className = `eris-dialogue-entry ${who}`;
        // Render explicit newlines as line breaks (innerHTML collapses raw \n to spaces).
        const html = clean.replace(/\r?\n/g, '<br>');
        const speaker = who === 'narrator' ? '' :
          `<span class="eris-speaker">${who === 'player' ? (T('ErisTrial.line.you')) : 'Eris'}</span>`;
        entry.innerHTML = `${speaker}${html}`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
      }
    }

    // The transcript is the record, not the screen. If something has taken the
    // page away underneath the hearing, draw it again from the log rather than
    // play the rest of the trial out to nobody.
    _ensureBook() {
      let log = document.getElementById('eris-log');
      if (log) return log;
      if (!this._container) return null;
      if (!this._container.parentNode) document.body.appendChild(this._container);
      this._renderBook();
      return document.getElementById('eris-log');
    }

    // Shows one message at a time and blocks until the player presses on, or
    // until auto-play closes it for them.
    _waitForAdvance(minReadMs = 260) {
      return waitForAdvance(this, minReadMs);
    }

    _showChoicesDOM(rawChoices) {
      // Choices carry alternations too, so the defendant never reads back the
      // same line twice either.
      const choices = rawChoices.map(vary);
      // A question is where auto-play always hands the hearing back.
      this._autoPlay = false;
      return new Promise(resolve => {
        // A question with nowhere to draw its answers used to answer itself.
        let panel = document.getElementById('eris-choices');
        if (!panel) {
          this._ensureBook();
          panel = document.getElementById('eris-choices');
        }
        if (!panel) { resolve(0); return; }
        panel.innerHTML = '';
        let sel = 0;
        let active = true;
        // The press that closed the last message must not also answer the
        // question it asked.
        let armed = false;
        const readyAt = performance.now() + 200;
        const btns = choices.map((text, i) => {
          const btn = document.createElement('div');
          btn.className = 'eris-choice-btn focusable' + (i === 0 ? ' selected' : '');
          btn.textContent = text;
          btn.addEventListener('click', () => { if (armed) finish(i); });
          panel.appendChild(btn);
          return btn;
        });
        const upd = () => btns.forEach((b, i) => b.classList.toggle('selected', i === sel));
        const finish = (idx) => {
          active = false;
          this._addDialogue(choices[idx], true);
          panel.innerHTML = '';
          SoundManager.playOk();
          Input.clear();
          resolve(idx);
        };

        // Keyboard and pad both arrive through Input alone: a DOM keydown
        // handler beside this poll moved the cursor twice per press.
        const poll = () => {
          if (!active) return;
          if (!armed) {
            if (!Input.isPressed('ok') && performance.now() >= readyAt) armed = true;
            requestAnimationFrame(poll);
            return;
          }
          if (Input.isTriggered('down') || Input.isRepeated('down') || Input.isTriggered('right') || Input.isRepeated('right')) {
            sel = (sel + 1) % btns.length;
            upd();
            SoundManager.playCursor();
          } else if (Input.isTriggered('up') || Input.isRepeated('up') || Input.isTriggered('left') || Input.isRepeated('left')) {
            sel = (sel - 1 + btns.length) % btns.length;
            upd();
            SoundManager.playCursor();
          } else if (Input.isTriggered('ok')) {
            finish(sel);
            return;
          }
          requestAnimationFrame(poll);
        };
        poll();
      });
    }

    // `text` overrides the stamped word, so the same stamp can carry the
    // impartiality score at the end of the hearing.
    _showVerdictStamp(verdict, text) {
      const spread = this._container ? this._container.querySelector('.book-spread') : null;
      if (!spread) return;
      // The stamp is centred and absolutely positioned, so a second one would
      // land exactly on top of the first: the score replaces the verdict.
      spread.querySelectorAll('.eris-verdict-stamp').forEach(el => el.remove());
      const stamp = document.createElement('div');
      stamp.className = `eris-verdict-stamp ${verdict}`;
      stamp.textContent = text != null
        ? String(text)
        : (verdict === 'guilty' ? (T('ErisTrial.line.guilty')) : (T('ErisTrial.line.innocent')));
      spread.appendChild(stamp);
    }

    // ── The brief ─────────────────────────────────────────────────────────
    // Everything the player gets to decide before the door opens: which of the
    // world's five advocates to retain, a party member instead, or nobody, with
    // the projected outcome of each recomputed live against the mood Eris turned
    // up in. The percentages are the real model (projectOutcome), not decoration.

    // Options in the order they are offered: the bar by seniority, then anyone
    // travelling with you, then the empty chair.
    _lawyerOptions() {
      const options = [];

      for (const l of ErisLawyers.roster()) options.push(l);

      const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
      for (const actor of members) {
        if (!actor) continue;
        options.push({
          kind: "party",
          name: actor.name(),
          title: T('ErisTrial.line.partyMember'),
          actorId: actor.actorId(),
          characterName: actor.characterName(),
          characterIndex: actor.characterIndex(),
          level: actor.level,
          // A companion argues with the same two faculties an advocate does.
          int: actor.mat,
          wis: actor.mdf,
          // Somebody who travels with you is, by definition, on your side.
          disposition: 100,
          fee: 0,
          banned: false
        });
      }

      options.push({
        kind: "none",
        name: T('ErisTrial.line.noLawyer'),
        title: T('ErisTrial.line.defendYourself'),
        characterName: null,
        characterIndex: 0,
        level: 0, int: 0, wis: 0, disposition: 0, fee: 0, banned: false
      });

      return options;
    }

    _lawyerOdds(option) {
      return projectOutcome({
        lawyer: option,
        mood: this.mood,
        chaos: this.chaos,
        bond: this.playerBond,
        isEm: this.isEm,
        emBond: this.emBond
      });
    }

    _dispositionLabel(value) {
      if (value >= 70) return T('ErisTrial.line.devoted');
      if (value >= 35) return T('ErisTrial.line.warm');
      if (value >= 10) return T('ErisTrial.line.favourable');
      if (value > -10) return T('ErisTrial.line.indifferent');
      if (value > -40) return T('ErisTrial.line.cold');
      return T('ErisTrial.line.hostile');
    }

    _lawyerCardHTML(option) {
      const odds = this._lawyerOdds(option);
      const pct = (v) => `${Math.round(v * 100)}%`;
      const esc = window.NPCShared ? window.NPCShared.escapeHtml : ((s) => String(s ?? ""));
      const gold = $gameParty ? $gameParty.gold() : 0;
      const affordable = option.fee <= gold;

      const sprite = option.characterName
        ? `<canvas class="eris-lawyer-sprite" width="64" height="64" data-lawyer-sprite="1"></canvas>`
        : `<div class="eris-lawyer-sprite eris-lawyer-sprite-empty"></div>`;

      const lawLevel = lawLevelOf(option);
      const lawName = (window.Specializations && window.Specializations.ready)
        ? window.Specializations.levelName(lawLevel)
        : String(lawLevel);
      const lawRow = `<div class="inspect-spec-row"><span class="inspect-spec-label">${T('ErisTrial.line.law')}</span><span class="inspect-spec-value">${esc(lawName)}</span></div>`;

      const fact = (label, value) =>
        `<div class="inspect-spec-row"><span class="inspect-spec-label">${label}</span><span class="inspect-spec-value">${value}</span></div>`;

      const statRow = option.kind === "none"
        ? `<div class="ui-empty-text">${T('ErisTrial.line.nobodySpeaksForYouOnly')}</div>
           ${lawRow}`
        : `
          ${fact(T('ErisTrial.line.level'), option.level)}
          ${fact('INT', option.int)}
          ${fact('WIS', option.wis)}
          ${lawRow}
          ${fact(T('ErisTrial.line.disposition'), `${this._dispositionLabel(option.disposition)} (${Math.round(option.disposition)})`)}`;

      const feeRow = option.kind === "npc"
        ? `<div class="eris-total${affordable ? "" : " eris-fee-short"}">
             <span>${T('ErisTrial.line.fee')}</span>
             <span>${this.formatEuros(option.fee)}</span>
           </div>`
        : `<div class="eris-total"><span>${T('ErisTrial.line.fee')}</span><span>${T('ErisTrial.line.none')}</span></div>`;

      const bar = (label, value, cls) => `
        <div class="eris-odds-row">
          <span class="eris-odds-label">${esc(label)}</span>
          <span class="eris-odds-track"><span class="eris-odds-fill ${cls}" style="--fill:${Math.round(value * 100)}%"></span></span>
          <span class="eris-odds-value">${pct(value)}</span>
        </div>`;

      const banRow = option.kind === "none" ? "" :
        bar(T('ErisTrial.line.thrownOutOfCourt'), odds.banned, "ban");

      return `
        <div class="ui-detail eris-lawyer-card">
          <div class="ui-detail-head">
            ${sprite}
            <div class="ui-detail-titles">
              <div class="eris-lawyer-name">${esc(option.name)}</div>
              <div class="eris-lawyer-title">${esc(option.title)}</div>
            </div>
          </div>
          <div class="eris-rows">${statRow}</div>
          ${feeRow}
          <h3 class="inspect-section-title">${T('ErisTrial.line.projectedOutcome')}</h3>
          <div class="eris-odds-list">
            ${bar(T('ErisTrial.line.acquitted'), odds.acquitted, "good")}
            ${bar(T('ErisTrial.line.shortSentence'), odds.shortTerm, "warn")}
            ${bar(T('ErisTrial.line.longSentence'), odds.longTerm, "bad")}
            ${banRow}
          </div>
          ${affordable ? "" : `<div class="ui-empty-text">${T('ErisTrial.line.youCannotAffordThis')}</div>`}
        </div>`;
    }

    async chooseLawyer() {
      const options = this._lawyerOptions();
      if (!options.length) return;

      const container = document.createElement("div");
      container.id = "menu-container";
      markCourt(container);
      document.body.appendChild(container);

      const esc = window.NPCShared ? window.NPCShared.escapeHtml : ((s) => String(s ?? ""));
      const gold = () => ($gameParty ? $gameParty.gold() : 0);
      let sel = 0;

      // The spread is built once. Moving the cursor only marks the new row and
      // rewrites the dossier on the right page: rebuilding the whole page made
      // it flash on every keypress and threw away the row nodes (and their
      // listeners) mid-hover.
      const listHTML = options.map((o, i) => {
        const cost = o.kind === "npc" ? this.formatEuros(o.fee) : (T('ErisTrial.line.free'));
        const poor = o.kind === "npc" && o.fee > gold();
        return `<div class="eris-choice-btn eris-lawyer-row focusable${poor ? " eris-row-poor" : ""}" data-index="${i}" tabindex="0">
                  <span>${esc(o.name)}</span><span class="eris-lawyer-cost">${cost}</span>
                </div>`;
      }).join("");

      container.innerHTML = `
        <div class="book-spread">
          <div class="left-page page-top">
            <div class="page-header-bar"><h2 class="title">${T('ErisTrial.line.theDefence')}</h2></div>
            <div class="ui-prose">${T('ErisTrial.line.erisSCourtHasNever')}</div>
            <div class="ui-chip-row">
              <span class="ui-chip">${moodIconHTML(this.mood)} ${this.mood}</span>
              <span class="ui-chip">${T('ErisTrial.line.funds')}: ${this.formatEuros(gold())}</span>
            </div>
            <div class="eris-choices-panel" id="eris-lawyer-list">${listHTML}</div>
          </div>
          <div class="right-page page-top" id="eris-lawyer-card"></div>
        </div>`;

      const rows = Array.from(container.querySelectorAll(".eris-lawyer-row"));
      const cardPage = container.querySelector("#eris-lawyer-card");

      const render = () => {
        rows.forEach((el, i) => el.classList.toggle("selected", i === sel));
        cardPage.innerHTML = this._lawyerCardHTML(options[sel]);
        paintLawyerSprite(cardPage.querySelector("canvas[data-lawyer-sprite]"),
          options[sel].characterName, options[sel].characterIndex || 0);
      };

      rows.forEach(el => {
        el.addEventListener("mouseenter", () => {
          const i = Number(el.dataset.index);
          if (i === sel) return;
          sel = i;
          render();
        });
        el.addEventListener("click", () => { sel = Number(el.dataset.index); confirm(); });
      });

      let done = null;
      const finished = new Promise(resolve => { done = resolve; });
      let active = true;

      const confirm = () => {
        // The mouse and the Input poll can both reach here; the fee must only
        // ever be paid once.
        if (!active) return;
        const option = options[sel];
        if (option.kind === "npc" && option.fee > gold()) {
          SoundManager.playBuzzer();
          return;
        }
        active = false;
        SoundManager.playOk();
        Input.clear();
        if (option.kind === "npc" && option.fee > 0) $gameParty.loseGold(option.fee);
        // The empty bench is kept as an option object rather than nulled: a
        // defendant with trained Law still argues their own case, and the maths
        // has to be able to ask them what they know.
        this.lawyer = option;
        container.classList.add("eris-fading");
        setTimeout(() => { if (container.parentNode) container.parentNode.removeChild(container); }, 250);
        done();
      };

      const move = (delta) => {
        sel = (sel + delta + options.length) % options.length;
        SoundManager.playCursor();
        render();
      };

      render();
      // Keyboard and pad both arrive through Input alone. A DOM keydown handler
      // used to run alongside this poll, so one arrow press moved the cursor
      // twice: with two names on the bench that is a move back to where it
      // started, which read as the menu ignoring the key.
      Input.clear();
      let armed = false;
      const poll = () => {
        if (!active) return;
        if (!armed) {
          // The same press that opened the brief must not also retain counsel.
          if (!Input.isPressed("ok")) armed = true;
          requestAnimationFrame(poll);
          return;
        }
        if (Input.isTriggered("down") || Input.isRepeated("down") ||
          Input.isTriggered("right") || Input.isRepeated("right")) move(1);
        else if (Input.isTriggered("up") || Input.isRepeated("up") ||
          Input.isTriggered("left") || Input.isRepeated("left")) move(-1);
        else if (Input.isTriggered("ok")) { confirm(); return; }
        requestAnimationFrame(poll);
      };
      poll();

      await finished;
    }

    // Whether the advocate is allowed to stay, and what she says about it either
    // way. A banned lawyer keeps the fee spent and loses every point of bonus,
    // which is exactly the risk the odds board priced.
    async presentLawyer() {
      const l = this.lawyer;

      if (!l || l.kind === "none") {
        this._addDialogue(pickFrom(LAWYER_ABSENT_LINES()));
        await this._waitForAdvance();
        // Somebody who has trained Law is not silent just because the bench is
        // empty, and she notices.
        if (lawLevelOf(l || { kind: "none" }) >= 3) {
          this._addDialogue(T('ErisTrial.line.youVePreparedAloneOut'));
          await this._waitForAdvance();
        }
        return;
      }

      this._addDialogue(T('ErisTrial.line.lawyerTakesBench', { name: l.name }),
        "narrator");
      await this._waitForAdvance();

      if (l.kind === "party") {
        this._addDialogue(pickFrom(LAWYER_PARTY_GREETINGS()));
      } else {
        const byMood = bank(LAWYER_GREETINGS())[this.mood] || bank(LAWYER_GREETINGS()).neutral;
        this._addDialogue(pick(byMood));
      }
      await this._waitForAdvance();

      if (Math.random() < lawyerBanChance(l, this.mood, this.playerBond)) {
        const lines = pickFrom(LAWYER_BAN_LINES());
        for (const line of lines) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
        l.banned = true;
        this.lawyerBanned = true;
        this._adjustChaos(0.1);
        this._addDialogue(T('ErisTrial.line.lawyerEscortedOut', { name: l.name }),
          "narrator");
        await this._waitForAdvance();
      }
    }

    // An advocate still in the room does something with the time. Called between
    // beats, most of the time silently, so the pacing never settles.
    async maybeLawyerBeat(chance = 0.5) {
      const l = this.lawyer;
      if (!l || l.kind === "none" || l.banned) return;
      if (Math.random() > chance) return;

      this._addDialogue(`${l.name}: ${vary(pickFrom(LAWYER_OBJECTIONS()))}`, true);
      await this._waitForAdvance();
      this._addDialogue(pickFrom(LAWYER_ERIS_REPLIES()));
      await this._waitForAdvance();
      // Arguing well is its own small disorder in a court run on whim.
      this._adjustChaos(-0.04 * lawyerStrength(l));
    }

    // The dating bond winning on its own, before any of the machinery runs. Rare
    // and never certain, exactly like the woman it comes from.
    async maybeClemency() {
      if (this.pardoned || this.playerBond < 0.55) return false;
      if (Math.random() > this.playerBond * 0.45) return false;

      for (const line of pickFrom(ERIS_CLEMENCY_LINES())) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      this.pardoned = true;
      this.verdict = "innocent";
      this._showVerdictStamp("innocent");
      await new Promise(r => setTimeout(r, 900));
      await this.showImpartialityScore();
      this.finishTrial();
      return true;
    }

    async startTrial() {
      // Check if bounty is zero - special case
      if (this.bounty <= 0) {
        await this.zeroBountyRant();
        return;
      }

      // Standing in the dock is a day the party will remember (Diary.js).
      if (window.Diary) window.Diary.onTrial('start', {});

      // Before the bailiffs open the door: who is arguing for you, and what
      // that buys against the mood she happens to be in today. Bubba never gets
      // this far, his charges are gone before they are read.
      if (!this.isBubba) {
        await this.chooseLawyer();
      }

      this._createTrialUI();

      // Where the court is sitting today, rolled fresh for every trial.
      this._addDialogue(this.courtDescription(), 'narrator');
      await this._waitForAdvance();

      // Bubba in the dock ends the hearing before it starts.
      if (this.isBubba) {
        await this.runBubbaTrial();
        return;
      }

      // The defence takes its seat, or is thrown out of the room.
      await this.presentLawyer();

      await this.showOpening();

      // A goddess who has been courted, and lost the argument with herself.
      if (await this.maybeClemency()) return;

      await this.maybeInterrupt(0.4);
      await this.maybeLawyerBeat(0.5);

      if (Math.random() < 0.15 && this.mood === "chaotic") {
        await this.immediateVerdict();
        return;
      }

      await this.askPlea();
      await this.maybeInterrupt(0.5);
      await this.maybeLawyerBeat(0.55);

      // The player chose to fight Eris; the battle takes over from here.
      if (this._challengeStarted) {
        return;
      }

      switch (this.mood) {
        case "benevolent":
          await this.benevolentTrial();
          break;
        case "vindictive":
          await this.vindictiveTrial();
          break;
        case "whimsical":
          await this.playfulTrial();
          break;
        case "bored":
          await this.boredTrial();
          break;
        case "dramatic":
          await this.dramaticTrial();
          break;
        default:
          await this.chaoticTrial();
      }

      await this.maybeInterrupt(0.45);
      await this.maybeLawyerBeat(0.6);
      await this.deliverVerdict();
    }

    async zeroBountyRant() {

      const rants = T.pool('ErisTrial.bank.zeroBountyRant.rants');

      const rant = rants[Math.floor(Math.random() * rants.length)];
      window.skipLocalization = true;
      $gameMessage.setBackground(2); $gameMessage.add(rant);
      window.skipLocalization = false;

      await this.waitForMessage();

      // Additional rant line sometimes
      if (Math.random() < 0.4) {
        const additionalRants = T.pool('ErisTrial.bank.zeroBountyRant.additionalRants');

        const additional = additionalRants[Math.floor(Math.random() * additionalRants.length)];
        window.skipLocalization = true;
        $gameMessage.setBackground(2); $gameMessage.add(additional);
        window.skipLocalization = false;

        await this.waitForMessage();
      }

      // Release and teleport
      const mapId = $gameVariables.value(returnMapVariable) || 1;
      const x = $gameVariables.value(returnXVariable) || 0;
      const y = $gameVariables.value(returnYVariable) || 0;
      $gamePlayer.reserveTransfer(mapId, x, y, 2, 0);
    }

    async showOpening() {

      // The witch gets her own opening, and it is personal.
      if (this.isEm) {
        await this.showEmOpening();
        return;
      }

      // Opening based on mood - multiple dialogue boxes
      if (this.mood === "benevolent") {
        const openings = T.pool('ErisTrial.bank.showOpening.openings');
        const chosen = openings[Math.floor(Math.random() * openings.length)];
        for (const line of chosen) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      } else if (this.mood === "vindictive") {
        const openings = T.pool('ErisTrial.bank.showOpening.openings2');
        const chosen = openings[Math.floor(Math.random() * openings.length)];
        for (const line of chosen) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      } else if (this.mood === "chaotic") {
        const openings = T.pool('ErisTrial.bank.showOpening.openings3');
        const chosen = openings[Math.floor(Math.random() * openings.length)];
        for (const line of chosen) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      } else if (this.mood === "whimsical") {
        const openings = T.pool('ErisTrial.bank.showOpening.openings4');
        const chosen = openings[Math.floor(Math.random() * openings.length)];
        for (const line of chosen) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      } else if (this.mood === "bored") {
        const openings = T.pool('ErisTrial.bank.showOpening.openings5');
        const chosen = openings[Math.floor(Math.random() * openings.length)];
        for (const line of chosen) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      } else if (this.mood === "dramatic") {
        const openings = T.pool('ErisTrial.bank.showOpening.openings6');
        const chosen = openings[Math.floor(Math.random() * openings.length)];
        for (const line of chosen) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      } else if (this.mood === "irritated") {
        const openings = T.pool('ErisTrial.bank.showOpening.openings7');
        const chosen = openings[Math.floor(Math.random() * openings.length)];
        for (const line of chosen) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      } else {
        // neutral
        const openings = T.pool('ErisTrial.bank.showOpening.openings8');
        const chosen = openings[Math.floor(Math.random() * openings.length)];
        for (const line of chosen) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }

      // Bounty announcement
      if (this.bounty > 0) {
        const bountyAnnouncements = T.pool('ErisTrial.bank.showOpening.bountyAnnouncements')
          .map(line => line.replace('{bounty}', this.formatEuros(this.bounty)));
        this._addDialogue(bountyAnnouncements[Math.floor(Math.random() * bountyAnnouncements.length)]);
        await this._waitForAdvance();
      }

    }

    // Em's opening: the grudge, then one or two jabs about the camper and the
    // mechanic sleeping in it, then the bounty. Softer only in proportion to
    // how much Eris has already admitted to her on a date.
    async showEmOpening() {

      const opening = pickFrom(EM_TRIAL_OPENINGS());
      for (const line of opening) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      // The higher the bond, the fewer jabs get through.
      const jabPool = bank(EM_TRIAL_JABS()).slice();
      const jabCount = Math.max(0, Math.round((1 - this.emBond) * (1 + Math.floor(Math.random() * 2))));
      for (let i = 0; i < jabCount && jabPool.length; i++) {
        this._addDialogue(jabPool.splice(Math.floor(Math.random() * jabPool.length), 1)[0]);
        await this._waitForAdvance();
      }

      if (this.emBond >= 0.5) {
        const softer = T.pool('ErisTrial.bank.showEmOpening.softer');
        for (const line of softer) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }

      if (this.bounty > 0) {
        const announcements = T.pool('ErisTrial.bank.showEmOpening.announcements')
          .map(line => line.replace('{bounty}', this.formatEuros(this.bounty)));
        this._addDialogue(pick(announcements));
        await this._waitForAdvance();
      }
    }

    // Bubba only. She sees who it is, the court stops being a court, the
    // charges are dropped unread and he is out of the door before the gallery
    // works out what it just watched. No plea, no mood branch, no roll: the one
    // hearing in ninety-two dimensions whose outcome was never in question.
    // Every beat is drawn from a pool, so no two of these read the same either.
    async runBubbaTrial() {
      const opening = pickFrom(BUBBA_TRIAL_OPENINGS());
      for (const line of opening) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      // Business the room pretends not to see. The further the dates have got,
      // the less she manages to keep off her face.
      const flusterPool = bank(BUBBA_TRIAL_FLUSTER()).slice();
      const flusterCount = 1 + Math.round(this.bubbaBond * 2) + Math.floor(Math.random() * 2);
      for (let i = 0; i < flusterCount && flusterPool.length; i++) {
        this._addDialogue(flusterPool.splice(Math.floor(Math.random() * flusterPool.length), 1)[0], 'narrator');
        await this._waitForAdvance();
      }

      this._addDialogue(pickFrom(BUBBA_TRIAL_CHARGES()));
      await this._waitForAdvance();

      if (this.bounty > 0) {
        this._addDialogue(T('ErisTrial.line.bubbaBountyWaived')
          .replace('{bounty}', this.formatEuros(this.bounty)));
        await this._waitForAdvance();
      }

      const pardon = pickFrom(BUBBA_TRIAL_PARDONS());
      for (const line of pardon) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      this.verdict = "innocent";
      this._showVerdictStamp("innocent");

      this._addDialogue(pickFrom(BUBBA_TRIAL_DISMISSALS()));
      await this._waitForAdvance();

      // Once she has admitted anything to him on a date, something gets out
      // here too, and the record is not allowed to keep it.
      if (this.bubbaBond >= 0.4) {
        this._addDialogue(pickFrom(BUBBA_TRIAL_SLIPS()), 'narrator');
        await this._waitForAdvance();
      }

      await this.showImpartialityScore();
      await new Promise(r => setTimeout(r, 800));
      this.finishTrial();
    }

    // How impartial the bench actually was, scored the same way the sandbox
    // trial scores the player for sitting in her chair (ErisReverseTrial's
    // _computeScore / _rankForScore). There it grades how you played her; here
    // it grades how she played herself, and the two are shown under the same
    // heading so a player who has done both reads one scale.
    _computeImpartialityScore() {
      let score = 100;
      const guilty = this.verdict === "guilty";
      // The court's own version of the truth: a bounty exists because somebody
      // saw the party do something, so crimes on the sheet are the ground truth.
      const trueGuilty = (this.crimes && this.crimes.length > 0) || this.bounty > 0;

      if (guilty && !trueGuilty) score -= 40;      // convicted with nothing on the sheet
      if (!guilty && trueGuilty) score -= 30;      // walked out on a real bounty

      if (guilty) {
        // A named term is proportionate; the open-ended grind and the commuted
        // capital sentence are not.
        if (this.commuted) score -= 25;
        else if (!(this.sentence && this.sentence.minutes)) score -= 10;
        if (this.bounty > 0 && this.bounty < 5000) score -= 10;
      }

      const harshMoods = ["vindictive", "irritated", "dramatic"];
      const softMoods  = ["benevolent", "whimsical"];
      if (harshMoods.includes(this.mood) && guilty) score -= 10;
      if (softMoods.includes(this.mood) && !guilty && trueGuilty) score -= 10;
      if (this.mood === "chaotic") score -= 10;

      // The two hearings she has no business presiding over at all.
      if (this.isEm)    score -= 25 + Math.round((1 - this.emBond) * 15);
      if (this.isBubba) score -= 55;

      // Throwing the defence out of the room is not a procedural nicety, and
      // neither is presiding over a defendant she has been to dinner with.
      if (this.lawyerBanned) score -= 20;
      if (this.pardoned)     score -= 30;
      else if (this.playerBond > 0) score -= Math.round(this.playerBond * 15);

      score -= Math.round(this.chaos * 10);

      return Math.max(0, Math.min(100, Math.round(score)));
    }

    _impartialityRank(score) {
      if (score >= 90) return T('ErisTrial.line.impartialJudge');
      if (score >= 70) return T('ErisTrial.line.fairMostly');
      if (score >= 45) return T('ErisTrial.line.questionableJustice');
      if (score >= 20) return T('ErisTrial.line.wildlyBiased');
      return T('ErisTrial.line.utterTyrant');
    }

    async showImpartialityScore() {
      const score = this._computeImpartialityScore();
      this._addDialogue(T('ErisTrial.line.impartialityScore',
        { score: score, rank: this._impartialityRank(score) }), 'narrator');
      this._showVerdictStamp(score >= 60 ? 'innocent' : 'guilty', String(score));
      await this._waitForAdvance(600);
    }

    async immediateVerdict() {

      const immediate = T.pool('ErisTrial.bank.immediateVerdict.immediate');
      this._addDialogue(
        immediate[Math.floor(Math.random() * immediate.length)]
      );

      await this._waitForAdvance();

      this.verdict = Math.random() < 0.7 ? "guilty" : "innocent";
      await this.showImpartialityScore();
      this.finishTrial();
    }

    async askPlea() {


      const introductions = T.pool('ErisTrial.bank.askPlea.introductions');

      const intro = introductions[Math.floor(Math.random() * introductions.length)];
      for (const line of intro) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const pleaQuestions = T.pool('ErisTrial.bank.askPlea.pleaQuestions');

      const question = pleaQuestions[Math.floor(Math.random() * pleaQuestions.length)];
      for (const line of question) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const choices = T.pool('ErisTrial.bank.askPlea.choices');

      this.playerPlea = await this._showChoicesDOM(choices);

      // "Challenge Eris" diverges from the verdict flow entirely into a battle.
      if (this.playerPlea === 4) {
        await this.challengeEris();
        return;
      }

      await this.respondToPlea();

    }

    async respondToPlea() {


      const responses = {
        0: { // Guilty plea
          benevolent: T.pool('ErisTrial.bank.respondToPlea.lines'),
          vindictive: T.pool('ErisTrial.bank.respondToPlea.lines2'),
          chaotic: T.pool('ErisTrial.bank.respondToPlea.lines3'),
          whimsical: T.pool('ErisTrial.bank.respondToPlea.lines4'),
          bored: T.pool('ErisTrial.bank.respondToPlea.lines5'),
          dramatic: T.pool('ErisTrial.bank.respondToPlea.dramatic')
        },
        1: { // Not guilty plea
          benevolent: T.pool('ErisTrial.bank.respondToPlea.benevolent'),
          vindictive: T.pool('ErisTrial.bank.respondToPlea.lines6'),
          chaotic: T.pool('ErisTrial.bank.respondToPlea.lines7'),
          whimsical: T.pool('ErisTrial.bank.respondToPlea.lines8'),
          bored: T.pool('ErisTrial.bank.respondToPlea.lines9'),
          dramatic: T.pool('ErisTrial.bank.respondToPlea.dramatic2')
        },
        2: { // It's complicated
          benevolent: T.pool('ErisTrial.bank.respondToPlea.benevolent2'),
          vindictive: T.pool('ErisTrial.bank.respondToPlea.lines10'),
          chaotic: T.pool('ErisTrial.bank.respondToPlea.lines11'),
          whimsical: T.pool('ErisTrial.bank.respondToPlea.lines12'),
          bored: T.pool('ErisTrial.bank.respondToPlea.lines13'),
          dramatic: T.pool('ErisTrial.bank.respondToPlea.dramatic3')
        },
        3: { // You're guilty
          benevolent: T.pool('ErisTrial.bank.respondToPlea.benevolent3'),
          vindictive: T.pool('ErisTrial.bank.respondToPlea.lines14'),
          chaotic: T.pool('ErisTrial.bank.respondToPlea.lines15'),
          whimsical: T.pool('ErisTrial.bank.respondToPlea.lines16'),
          bored: T.pool('ErisTrial.bank.respondToPlea.lines17'),
          dramatic: T.pool('ErisTrial.bank.respondToPlea.dramatic4')
        }
      };

      const moodResponses = responses[this.playerPlea];
      const response = moodResponses[this.mood] || moodResponses["chaotic"] || (T.pool('ErisTrial.bank.respondToPlea.lines'));

      for (const line of response) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

    }

    async challengeEris() {

      // Brief, mood-flavored build-up before the fight.
      const dialogues = T.obj('ErisTrial.bank.challengeEris.dialogues');

      const lines = dialogues[this.mood] || dialogues["chaotic"];
      for (const line of lines) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      this._challengeStarted = true;
      this._removeTrialUI();

      // Let the trial UI fade before pushing the battle scene.
      await new Promise(r => setTimeout(r, 300));
      this._startErisBattle();
    }

    _startErisBattle() {
      // canEscape = true (flee -> prison), canLose = false (death -> game over).
      BattleManager.setup(1342, true, false);
      if (BattleManager.setBattleTest) BattleManager.setBattleTest(false);
      if (BattleManager.setArenaMode) BattleManager.setArenaMode(false);
      if (BattleManager.setGauntletMode) BattleManager.setGauntletMode(false);
      BattleManager.setEventCallback(result => this._onErisBattleResult(result));
      $gamePlayer.makeEncounterCount();
      SceneManager.push(Scene_Battle);
    }

    _onErisBattleResult(result) {
      if (result === 0) {
        // Victory: Eris is gone, the court stands empty, and the bounty system
        // will never grow from new crimes again.
        $gameSystem._erisBountyImmunity = true;
        $gameTemp._erisChallengeWon = true;

        const mapId = $gameVariables.value(returnMapVariable) || 1;
        const x = $gameVariables.value(returnXVariable) || 0;
        const y = $gameVariables.value(returnYVariable) || 0;
        $gamePlayer.reserveTransfer(mapId, x, y, 2, 0);
      } else if (result === 1) {
        // Escaped: the party is patched up and thrown in prison for a month.
        $gameParty.members().forEach(a => a.recoverAll());

        const currentBounty = $gameVariables.value(bountyVariableId);
        $gamePlayer.reserveTransfer(prisonMapId, prisonX, prisonY, 2, 0);
        $gameTemp._startPrisonOnLoad = true;
        $gameTemp._prisonBounty = currentBounty;
        $gameTemp._prisonSentenceMinutes = 30 * 24 * 60; // one month
      }
      // result === 2 (party wipe): handled by the default game-over flow.
    }

    async benevolentTrial() {


      const intro = T.pool('ErisTrial.bank.benevolentTrial.intro');

      for (const line of intro) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const questions = T.pool('ErisTrial.bank.benevolentTrial.questions');

      const chosen = questions[Math.floor(Math.random() * questions.length)];
      for (const line of chosen) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const choices = T.pool('ErisTrial.bank.benevolentTrial.choices');

      let playerChoice = await this._showChoicesDOM(choices);
        if (playerChoice === 0) this._adjustChaos(-0.2);
        else if (playerChoice === 1) this._adjustChaos(0.2);

      // Response to choice
      const responses = T.obj('ErisTrial.bank.benevolentTrial.responses');

      const response = responses[playerChoice];
      for (const line of response) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      // Additional philosophical musings
      if (Math.random() < 0.6) {
        const musings = T.pool('ErisTrial.bank.benevolentTrial.musings');

        const musing = musings[Math.floor(Math.random() * musings.length)];
        for (const line of musing) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }

    }

    async vindictiveTrial() {


      const intro = T.pool('ErisTrial.bank.vindictiveTrial.intro');

      for (const line of intro) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const realCrime =
        this.crimes.length > 0
          ? this.crimes[Math.floor(Math.random() * this.crimes.length)].name
          : this.getRandomCrimeAccusation();

      const accusations = T.pool('ErisTrial.bank.vindictiveTrial.accusations')
        .map(speech => speech.map(line => line.replace('{crime}', realCrime)));

      const chosenAccusation = accusations[Math.floor(Math.random() * accusations.length)];
      for (const line of chosenAccusation) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      if (Math.random() < 0.7) {
        const additionalCrime = this.getRandomCrimeAccusation();
        const additional = T.pool('ErisTrial.bank.vindictiveTrial.additional')
          .map(line => line.replace('{crime}', additionalCrime));

        for (const line of additional) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }

      if (Math.random() < 0.6) {
        const futureCrimes = T.pool('ErisTrial.bank.vindictiveTrial.futureCrimes');

        for (const line of futureCrimes) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }

      const rants = T.pool('ErisTrial.bank.vindictiveTrial.rants');

      const rant = rants[Math.floor(Math.random() * rants.length)];
      for (const line of rant) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      this._adjustChaos(0.3);
    }

    async playfulTrial() {


      const intro = T.pool('ErisTrial.bank.playfulTrial.intro');

      for (const line of intro) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const games = T.pool('ErisTrial.bank.playfulTrial.games');

      const game = games[Math.floor(Math.random() * games.length)];
      for (const line of game) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const choices = T.pool('ErisTrial.bank.playfulTrial.choices');

      let playerChoice = await this._showChoicesDOM(choices);
        if (playerChoice === 0 || playerChoice === 3) this._adjustChaos(-0.3);
        else this._adjustChaos(0.1);

      const reactions = {
        0: T.pool('ErisTrial.bank.playfulTrial.lines'),
        1: T.pool('ErisTrial.bank.playfulTrial.lines2'),
        2: T.pool('ErisTrial.bank.playfulTrial.lines3'),
        3: T.pool('ErisTrial.bank.playfulTrial.3')
      };

      const reaction = reactions[playerChoice];
      for (const line of reaction) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      if (Math.random() < 0.5) {
        const extra = T.pool('ErisTrial.bank.playfulTrial.extra');

        for (const line of extra) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }

    }

    async boredTrial() {


      const intro = T.pool('ErisTrial.bank.boredTrial.intro');

      for (const line of intro) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const bored = T.pool('ErisTrial.bank.boredTrial.bored');

      const chosen = bored[Math.floor(Math.random() * bored.length)];
      for (const line of chosen) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const choices = T.pool('ErisTrial.bank.boredTrial.choices');

      let playerChoice = await this._showChoicesDOM(choices);
        if (playerChoice === 1) this._adjustChaos(0.5);
        else if (playerChoice === 3) this._adjustChaos(-0.2);

      const responses = {
        0: T.pool('ErisTrial.bank.boredTrial.0'),
        1: T.pool('ErisTrial.bank.boredTrial.lines'),
        2: T.pool('ErisTrial.bank.boredTrial.lines2'),
        3: T.pool('ErisTrial.bank.boredTrial.3')
      };

      const response = responses[playerChoice];
      for (const line of response) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      if (Math.random() < 0.4) {
        const complaint = T.pool('ErisTrial.bank.boredTrial.complaint');

        for (const line of complaint) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }

    }

    async dramaticTrial() {


      const intro = T.pool('ErisTrial.bank.dramaticTrial.intro');

      for (const line of intro) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const dramatic = T.pool('ErisTrial.bank.dramaticTrial.dramatic');

      const chosen = dramatic[Math.floor(Math.random() * dramatic.length)];
      for (const line of chosen) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const proclamation = T.pool('ErisTrial.bank.dramaticTrial.proclamation');

      for (const line of proclamation) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const question = T.pool('ErisTrial.bank.dramaticTrial.question');

      for (const line of question) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const choices = T.pool('ErisTrial.bank.dramaticTrial.choices');

      const playerChoice = await this._showChoicesDOM(choices);
      if (playerChoice === 0) this._adjustChaos(-0.1);
      else if (playerChoice === 3) this._adjustChaos(0.4);

      const responses = {
        0: T.pool('ErisTrial.bank.dramaticTrial.0'),
        1: T.pool('ErisTrial.bank.dramaticTrial.lines'),
        2: T.pool('ErisTrial.bank.dramaticTrial.lines2'),
        3: T.pool('ErisTrial.bank.dramaticTrial.3')
      };

      const response = responses[playerChoice];
      for (const line of response) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      if (Math.random() < 0.5) {
        const finale = T.pool('ErisTrial.bank.dramaticTrial.finale');

        for (const line of finale) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }

    }

    async chaoticTrial() {


      const intro = T.pool('ErisTrial.bank.chaoticTrial.intro');

      for (const line of intro) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      const chaosLevel = Math.floor(Math.random() * 5);

      switch (chaosLevel) {
        case 0:
          const crime = this.getRandomCrimeAccusation();
          const accusation = T.pool('ErisTrial.bank.chaoticTrial.accusation')
            .map(line => line.replace('{crime}', crime));

          for (const line of accusation) {
            this._addDialogue(line);
            await this._waitForAdvance();
          }
          break;

        case 1:
          const random = T.pool('ErisTrial.bank.chaoticTrial.random');

          const chosen = random[Math.floor(Math.random() * random.length)];
          for (const line of chosen) {
            this._addDialogue(line);
            await this._waitForAdvance();
          }
          break;

        case 2:
          const forget = T.pool('ErisTrial.bank.chaoticTrial.forget');

          for (const line of forget) {
            this._addDialogue(line);
            await this._waitForAdvance();
          }
          break;

        case 3:
          const argue = T.pool('ErisTrial.bank.chaoticTrial.argue');

          for (const line of argue) {
            this._addDialogue(line);
            await this._waitForAdvance();
          }
          break;

        case 4:
          const chaos = T.pool('ErisTrial.bank.chaoticTrial.chaos');

          for (const line of chaos) {
            this._addDialogue(line);
            await this._waitForAdvance();
          }
          break;
      }

      if (Math.random() < 0.6) {
        const extra = T.pool('ErisTrial.bank.chaoticTrial.extra');

        for (const line of extra) {
          this._addDialogue(line);
          await this._waitForAdvance();
        }
      }


      this._adjustChaos(Math.random() - 0.5);
    }

    async deliverVerdict() {

      if (this.verdict === null) {
        let guiltyChance = 0.5 + (this.chaos - 0.5) * 0.4;

        if (this.mood === "benevolent") {
          guiltyChance -= 0.25;
        } else if (this.mood === "vindictive") {
          guiltyChance += 0.3;
        } else if (this.mood === "whimsical" && this.playerPlea === 2) {
          guiltyChance -= 0.2;
        }

        // Em is convicted on sight, unless the dates have got somewhere. A full
        // bond pardons most of what she is dragged in for, but never all of it:
        // Eris is fickle by nature and reserves the right to swing back.
        if (this.isEm) {
          guiltyChance = 0.95 - this.emBond * 0.8;
        }

        // The evenings, then the defence. Both are subtracted from the same
        // number the odds board projected before the door opened, and the
        // defence is worth only as much as her mood is willing to hear.
        guiltyChance -= bondRelief(this.playerBond, this.mood);
        guiltyChance -= lawyerRelief(this.lawyer, this.mood);

        // PSI (Charisma / Soul presence) provides advocacy relief
        const leader = (typeof $gameParty !== 'undefined' && $gameParty.leader) ? $gameParty.leader() : null;
        const psiMod = leader ? Math.floor(((leader.luk || 10) - 10) / 2) : 0;
        guiltyChance -= (psiMod * 0.035);

        guiltyChance = Math.max(0.02, Math.min(0.98, guiltyChance));

        const innocentChance = Math.round((1 - guiltyChance) * 100);
        if (window.Dice3D) {
          const res = await window.Dice3D.rollPercentage(innocentChance, {
            actionName: "Eris Court Verdict",
            statName: "PSI (Charisma)",
            modifier: psiMod
          });
          this.verdict = res.success ? "innocent" : "guilty";
        } else {
          this.verdict = Math.random() < guiltyChance ? "guilty" : "innocent";
        }
      }

      // Fickle in the other direction: an evening bought a lean, not a promise,
      // and every so often she says so out loud on the way to convicting you.
      if (!this.isEm && this.playerBond >= 0.4 && this.verdict === "innocent"
        && Math.random() < 0.12) {
        this._addDialogue(pickFrom(ERIS_COLD_SNAP_LINES()));
        await this._waitForAdvance();
        this.verdict = "guilty";
      }

      // A pardon that lands while she is still holding a grudge gets taken back
      // on the spot. It is the same fickleness that runs the rest of the court.
      if (this.isEm && this.verdict === "innocent" && Math.random() < 0.15) {
        this._addDialogue(pickFrom(EM_RELAPSE_LINES()));
        await this._waitForAdvance();
        this.verdict = "guilty";
      }

      // Her usual last-second reversal never applies to Em: that trial has its
      // own reversal built into the sentence.
      if (!this.isEm && Math.random() < 0.1) {
        const changeText = T('ErisTrial.line.waitIVeChangedMy');
        this._addDialogue(changeText);

        await this._waitForAdvance();
        this.verdict = this.verdict === "guilty" ? "innocent" : "guilty";
      }

      await this.announceVerdict();
      this._showVerdictStamp(this.verdict);
      await new Promise(r => setTimeout(r, 1500));

      // The bench gets graded too, under the same heading the sandbox trial
      // grades the player with.
      await this.showImpartialityScore();

      this.finishTrial();
    }

    // Everything that happens once the verdict is fixed, in one place: the
    // sentence a surviving advocate argued down, what the brief did to the
    // lawyer's standing with the party, and the transfer itself.
    finishTrial() {
      // A defence still in the room at the end argues the term down; the odds
      // board priced this as "short sentence" against "long sentence".
      if (this.verdict === "guilty" && !this.commuted) {
        const pShort = Math.max(0.35, Math.min(0.95,
          0.5 + lawyerStrength(this.lawyer) * 0.4 + this.playerBond * 0.15));
        const terms = TRIAL_SENTENCES().filter(s => s.minutes);
        const short = terms.filter(s => s.minutes <= 7 * 24 * 60);
        const long = TRIAL_SENTENCES().filter(s => !s.minutes || s.minutes > 7 * 24 * 60);
        const pool = (Math.random() < pShort ? short : long);
        if (pool.length) this.sentence = pick(pool);
      }

      // Working a case together moves the advocate's standing with everyone who
      // was in the room, win or lose (ErisLawyers.recordTrial).
      ErisLawyers.recordTrial(this.lawyer, this.verdict);

      // What the bench decided, in the party's own diary (Diary.js).
      if (window.Diary) {
        window.Diary.onTrial('verdict', {
          verdict: this.verdict,
          sentence: (this.sentence && this.sentence.name) || ""
        });
      }

      // Whoever did the arguing learns something from it.
      this.awardLawExperience();

      this.executeVerdict();
    }

    // Law (Specialization 155) is only ever earned the hard way: by standing up
    // in this court without a professional, or by being the companion who stood
    // up instead. Retaining one of the bar teaches the defendant nothing, which
    // is precisely the trade the brief offers. A few points a hearing against
    // thresholds of 8/20/45/90, so it is a career, not an afternoon.
    awardLawExperience() {
      const option = this.lawyer || { kind: "none" };
      const actor = lawActorFor(option);
      if (!actor || !actor.gainSpecializationExp) return;

      let exp = LAW_EXP_PER_TRIAL;
      // Actually getting to speak is worth more than sitting through it.
      if (!this.lawyerBanned) exp += LAW_EXP_ARGUING;
      if (this.verdict === "innocent") exp += LAW_EXP_WON;

      // Routed through the shared award service so the courtroom raises the
      // same toast as every other specialization in the game. `soloist` keeps
      // the existing rule exactly: only whoever argued learns anything, with
      // no onlooker share to the rest of the party.
      try {
        if (window.SpecializationXP) {
          window.SpecializationXP.award(LAW_SPEC_ID, exp, {
            actor,
            soloist: true,
            name: T.has('ErisTrial.lawSpecName') ? T('ErisTrial.lawSpecName') : null
          });
        } else {
          actor.gainSpecializationExp(LAW_SPEC_ID, exp);
        }
      } catch (e) { /* a toast is never worth breaking a verdict over */ }
    }

    async announceVerdict() {

      // Em's verdict is announced her own way: the death sentence in full, then
      // taken back, or an outright pardon once the dates have gone far enough.
      if (this.isEm) {
        await this.announceEmVerdict();
        return;
      }

      const drumrolls = T.pool('ErisTrial.bank.announceVerdict.drumrolls');

      const drumroll = drumrolls[Math.floor(Math.random() * drumrolls.length)];
      for (const line of drumroll) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      if (this.verdict === "guilty") {
        const guiltyVerdicts = T.pool('ErisTrial.bank.announceVerdict.guiltyVerdicts');

        const verdict = guiltyVerdicts[Math.floor(Math.random() * guiltyVerdicts.length)];
        for (const line of verdict) {
          this._addDialogue("\\C[2]" + line + "\\C[0]");
          await this._waitForAdvance();
        }

        // The sentence itself, rolled with the rest of the trial.
        this._addDialogue(this.sentence.text);
        await this._waitForAdvance();

        if (Math.random() < 0.5) {
          const extras = T.pool('ErisTrial.bank.announceVerdict.extras');

          const extra = extras[Math.floor(Math.random() * extras.length)];
          for (const line of extra) {
            this._addDialogue(line);
            await this._waitForAdvance();
          }
        }
      } else {
        const innocentVerdicts = T.pool('ErisTrial.bank.announceVerdict.innocentVerdicts');

        const verdict = innocentVerdicts[Math.floor(Math.random() * innocentVerdicts.length)];
        for (const line of verdict) {
          this._addDialogue("\\C[3]" + line + "\\C[0]");
          await this._waitForAdvance();
        }

        if (Math.random() < 0.5) {
          const extras = T.pool('ErisTrial.bank.announceVerdict.extras2');

          const extra = extras[Math.floor(Math.random() * extras.length)];
          for (const line of extra) {
            this._addDialogue(line);
            await this._waitForAdvance();
          }
        }
      }

    }

    // Em only. Guilty means the full capital sentence, named out loud from the
    // list the court actually keeps (REVERSE_CAPITAL_OPTIONS), and then commuted
    // to prison at the last possible second. She always commutes it.
    async announceEmVerdict() {

      if (this.verdict === "innocent") {
        const pardon = pickFrom(EM_PARDON_LINES());
        for (const line of pardon) {
          this._addDialogue("\\C[3]" + line + "\\C[0]");
          await this._waitForAdvance();
        }
        return;
      }

      const guilty = T.pool('ErisTrial.bank.announceEmVerdict.guilty');
      for (const line of guilty) {
        this._addDialogue("\\C[2]" + line + "\\C[0]");
        await this._waitForAdvance();
      }

      const buildup = pickFrom(EM_CAPITAL_BUILDUP());
      for (const line of buildup) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      // The sentence itself, drawn from the court's real list of capital options.
      const capital = pick(REVERSE_CAPITAL_OPTIONS());
      const name = capital.text;
      const flavour = capital.line;
      this._addDialogue("\\C[2]" + T('ErisTrial.line.emDeathSentence',
        { sentence: name }) + "\\C[0]");
      await this._waitForAdvance();
      this._addDialogue(flavour, 'narrator');
      await this._waitForAdvance();

      // And takes it back.
      const commute = pickFrom(EM_COMMUTE_REASONS());
      for (const line of commute) {
        this._addDialogue(line);
        await this._waitForAdvance();
      }

      this.commuted = true;
      // A commuted sentence is always a definite term, never the bounty grind:
      // she wants to know exactly how long Em is where she put her.
      const terms = TRIAL_SENTENCES().filter(s => s.minutes);
      this.sentence = pick(terms);
      this._addDialogue(this.sentence.text);
      await this._waitForAdvance();
    }

    executeVerdict() {

      this._removeTrialUI();

      if (this.verdict === "guilty") {
        // Store bounty for prison manager
        const currentBounty = this.bounty;

        $gamePlayer.reserveTransfer(prisonMapId, prisonX, prisonY, 2, 0);

        // Use a flag to start prison time on next map load
        $gameTemp._startPrisonOnLoad = true;
        $gameTemp._prisonBounty = currentBounty;
        // A named term is served by the clock (PrisonManager releases on
        // Variable 114 and wipes the bounty on the way out); the open-ended
        // sentences keep the old behaviour of grinding the bounty down in-cell.
        $gameTemp._prisonSentenceMinutes = (this.sentence && this.sentence.minutes) || 0;
      } else {
        // Clear crimes and bounty when found innocent
        forgiveBounty();

        const mapId = $gameVariables.value(returnMapVariable) || 1;
        const x = $gameVariables.value(returnXVariable) || 0;
        const y = $gameVariables.value(returnYVariable) || 0;
        $gamePlayer.reserveTransfer(mapId, x, y, 2, 0);
        // Clear the stored return location so a later trial captures fresh coords.
        $gameVariables.setValue(returnMapVariable, 0);
        $gameVariables.setValue(returnXVariable, 0);
        $gameVariables.setValue(returnYVariable, 0);
      }
    }

    async waitForMessage() {
      return new Promise((resolve) => {
        const wait = () => {
          if ($gameMessage.isBusy()) {
            requestAnimationFrame(wait);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(wait);
      });
    }
  }

  //=============================================================================
  // ErisReverseTrial - Sandbox-only role reversal: the player plays Eris and
  // judges a random NPC pulled from the global NPC society pool
  // ($gameSystem._npcSociety, populated by NPCSociety.js/NPCSocietyRegistry).
  // Reuses the same book-spread/DOM UI classes as the normal trial.
  //=============================================================================
  const REVERSE_MOODS = ["benevolent", "neutral", "irritated", "chaotic", "vindictive", "whimsical", "bored", "dramatic"];

  const REVERSE_MOOD_LABELS = () => trialBank('ErisTrial.reverseMoodLabels');

  const REVERSE_MOOD_FLAVOR = () => trialBank('ErisTrial.reverseMoodFlavor');

  const REVERSE_JAIL_OPTIONS_META = [{"key":"week","severity":15},{"key":"month","severity":35},{"key":"year","severity":55},{"key":"decade","severity":75},{"key":"life","severity":95}];
  const REVERSE_JAIL_OPTIONS = () => trialRecords(REVERSE_JAIL_OPTIONS_META, 'ErisTrial.reverseJailOptions');

  const REVERSE_CAPITAL_OPTIONS_META = [{"key": "guillotine"}, {"key": "firingSquad"}, {"key": "hanging"}, {"key": "electricChair"}, {"key": "sword"}, {"key": "injection"}, {"key": "stone"}, {"key": "disintegrate"}, {"key": "void"}, {"key": "soulDevour"}, {"key": "toad"}, {"key": "lightning"}];
  const REVERSE_CAPITAL_OPTIONS = () => trialRecords(REVERSE_CAPITAL_OPTIONS_META,
    'ErisTrial.reverseCapitalOptions', { key: 'ErisTrial.reverseCapitalLines', field: 'line' });

  // Pick n distinct random entries from a pool (used to vary the spoken-line
  // choices offered on every replay of the reverse trial).
  const reversePickSome = (pool, n) => {
    const rest = pool.slice();
    const out = [];
    while (rest.length && out.length < n) {
      out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    }
    return out;
  };

  // Opening remarks: how the player-as-Eris calls the court to order.
  const REVERSE_OPENING_LINES = () => trialLines('ErisTrial.reverseOpeningLines');

  const REVERSE_OPENING_REPLIES = () => trialLines('ErisTrial.reverseOpeningReplies');

  // Interrogation approaches. `read` marks how honest the resulting demeanor
  // signal is: "true" tracks actual guilt, "noisy" is unreliable, "none" gives
  // nothing away.
  const REVERSE_PRESS_APPROACHES_META = [{"key": "explain", "read": "true"}, {"key": "evidence", "read": "true"}, {"key": "mock", "read": "noisy"}, {"key": "threaten", "read": "noisy"}, {"key": "sympathy", "read": "true"}, {"key": "bored", "read": "none"}, {"key": "divine", "read": "noisy"}];
  const REVERSE_PRESS_APPROACHES = () => trialRecords(REVERSE_PRESS_APPROACHES_META, 'ErisTrial.reversePressApproaches');

  // Closing remarks before the verdict is cast.
  const REVERSE_CLOSING_LINES = () => trialLines('ErisTrial.reverseClosingLines');

  const REVERSE_FINAL_PLEAS = () => trialLines('ErisTrial.reverseFinalPleas');

  // Parting words once the sentence has been handed down.
  const REVERSE_PARTING_LINES = () => trialLines('ErisTrial.reversePartingLines');

  class ErisReverseTrial {
    constructor() {
      this.defendantName = null;
      this.defendantProfile = null;
      this.mood = null;
      this.charges = [];
      this.crimeSeverity = 0;
      this.trueGuilty = false;
      this.verdict = null;
      this.sentenceType = null; // "time" | "capital"
      this.sentenceLabel = "";
      this.sentenceSeverity = 0;
      this.score = 0;

      this._container = null;
      this._dialogueLog = [];
      // Cancel plays the hearing out on its own until the next question, on the
      // bench as well as in the dock.
      this._autoPlay = false;
      this._readSignal = 0;   // > 0 reads as evasive, < 0 as composed
      this._pressCount = 0;
    }

    _t() {
      return ConfigManager.language === "it";
    }

    _pickDefendant() {
      const soc = ($gameSystem && $gameSystem._npcSociety) || {};
      const names = Object.keys(soc).filter(n => soc[n] && typeof soc[n].moralityScore === "number");
      if (!names.length) return false;
      this.defendantName = names[Math.floor(Math.random() * names.length)];
      this.defendantProfile = soc[this.defendantName];
      return true;
    }

    _personalityName() {
      const idx = this.defendantProfile?.personalityIndex;
      if (idx == null) return null;
      return window._NPCSocietyDataLoader?.personalities?.[idx]?.name || null;
    }

    _rollCase() {
      const numCharges = 1 + Math.floor(Math.random() * 3);
      const bands = [[10, 25], [30, 55], [60, 90]];
      this.charges = [];
      let total = 0;
      for (let i = 0; i < numCharges; i++) {
        const band = bands[Math.floor(Math.random() * bands.length)];
        const severity = band[0] + Math.floor(Math.random() * (band[1] - band[0] + 1));
        this.charges.push({ text: getRandomCrimeAccusation(), severity });
        total += severity;
      }
      this.crimeSeverity = Math.round(total / numCharges);

      const morality = this.defendantProfile.moralityScore || 0;
      const guiltProb = Math.max(5, Math.min(95, 50 - morality / 2));
      this.trueGuilty = Math.random() * 100 < guiltProb;
    }

    _createUI() {
      this._dialogueLog = [];
      this._container = document.createElement('div');
      this._container.id = 'menu-container';
      markCourt(this._container);
      document.body.appendChild(this._container);
      this._renderBook();
    }

    _renderBook() {
      const chargesHTML = this.charges.length > 0
        ? this.charges.map(c => `<div class="inspect-spec-row"><span class="inspect-spec-label">${c.text}</span><span class="inspect-spec-value">${c.severity}/100</span></div>`).join('')
        : `<div class="ui-empty-text">${T('ErisTrial.line.noCharges')}</div>`;
      const logHTML = this._dialogueLog.map(e => {
        const cls = this._entryClass(e.who);
        const speaker = this._speakerLabel(e.who);
        const body = String(e.text).replace(/\r?\n/g, '<br>');
        const head = speaker ? `<span class="eris-speaker">${speaker}</span>` : '';
        return `<div class="eris-dialogue-entry ${cls}">${head}${body}</div>`;
      }).join('');
      const moodBadge = this.mood
        ? `<span class="ui-chip">${moodIconHTML(this.mood)} ${REVERSE_MOOD_LABELS()[this.mood]}</span>`
        : `<span class="ui-chip">${T('ErisTrial.line.pending')}</span>`;
      const personality = this._personalityName();

      this._container.innerHTML = `
        <div class="book-spread">
          <div class="left-page page-top">
            <div class="page-header-bar"><h2 class="title">${T('ErisTrial.line.erisSCourt')}</h2></div>
            <div class="eris-dialogue-log" id="eris-log">${logHTML}</div>
            <div class="eris-choices-panel" id="eris-choices"></div>
          </div>
          <div class="right-page page-top">
            <div class="page-header-bar"><h2 class="title">${T('ErisTrial.line.defendant')}</h2></div>
            <div class="ui-chip-row">
              ${moodBadge}
              <span class="ui-chip">${this.defendantName}</span>
              ${personality ? `<span class="ui-chip">${personality}</span>` : ''}
            </div>
            <h3 class="inspect-section-title">${T('ErisTrial.line.charges')}</h3>
            <div class="eris-rows">${chargesHTML}</div>
            <div class="eris-total">
              <span>${T('ErisTrial.line.caseSeverity')}</span>
              <span>${this.crimeSeverity}/100</span>
            </div>
            <div class="eris-total">
              <span>${T('ErisTrial.line.demeanor')}</span>
              <span id="eris-demeanor">${this._demeanorLabel()}</span>
            </div>
          </div>
        </div>`;
      const log = document.getElementById('eris-log');
      if (log) log.scrollTop = log.scrollHeight;
    }

    _removeUI() {
      if (this._container) {
        this._container.classList.add('eris-fading');
        const c = this._container;
        setTimeout(() => { if (c && c.parentNode) c.parentNode.removeChild(c); }, 250);
        this._container = null;
      }
    }

    // who: 'eris' (the player), 'defendant', or 'narrator' (stage direction)
    _entryClass(who) {
      if (who === 'eris') return 'player';
      if (who === 'narrator') return 'narrator';
      return 'eris';
    }

    _speakerLabel(who) {
      if (who === 'eris') return T('ErisTrial.line.youEris');
      if (who === 'narrator') return '';
      return this.defendantName;
    }

    _addDialogue(text, who = 'defendant') {
      const role = who === true ? 'eris' : (who || 'defendant');
      const clean = text.replace(/\\C\[\d+\]/g, '');
      this._dialogueLog.push({ who: role, text: clean });
      const log = document.getElementById('eris-log');
      if (log) {
        const entry = document.createElement('div');
        entry.className = `eris-dialogue-entry ${this._entryClass(role)}`;
        const html = clean.replace(/\r?\n/g, '<br>');
        const speaker = this._speakerLabel(role);
        entry.innerHTML = `${speaker ? `<span class="eris-speaker">${speaker}</span>` : ''}${html}`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
      }
    }

    // The transcript is the record, not the screen: if something has taken the
    // page away underneath the hearing, draw it again from the log.
    _ensureBook() {
      let log = document.getElementById('eris-log');
      if (log) return log;
      if (!this._container) return null;
      if (!this._container.parentNode) document.body.appendChild(this._container);
      this._renderBook();
      return document.getElementById('eris-log');
    }

    // Shows one message at a time and blocks until the player presses on, or
    // until auto-play closes it for them.
    _waitForAdvance(minReadMs = 260) {
      return waitForAdvance(this, minReadMs);
    }

    // choices: array of strings. When `echo` is false the picked line is not
    // logged as spoken dialogue (used for menu-like picks such as the mood).
    _showChoicesDOM(choices, echo = true) {
      // A question is where auto-play always hands the hearing back.
      this._autoPlay = false;
      return new Promise(resolve => {
        // A question with nowhere to draw its answers used to answer itself.
        let panel = document.getElementById('eris-choices');
        if (!panel) {
          this._ensureBook();
          panel = document.getElementById('eris-choices');
        }
        if (!panel) { resolve(0); return; }
        panel.innerHTML = '';
        let sel = 0;
        let active = true;
        let armed = false;
        const readyAt = performance.now() + 200;
        const btns = choices.map((text, i) => {
          const btn = document.createElement('div');
          btn.className = 'eris-choice-btn focusable' + (i === 0 ? ' selected' : '');
          btn.textContent = text;
          btn.addEventListener('click', () => { if (armed) finish(i); });
          panel.appendChild(btn);
          return btn;
        });
        const upd = () => btns.forEach((b, i) => b.classList.toggle('selected', i === sel));
        const finish = (idx) => {
          active = false;
          if (echo) this._addDialogue(choices[idx], 'eris');
          panel.innerHTML = '';
          SoundManager.playOk();
          Input.clear();
          resolve(idx);
        };

        // Keyboard and pad both arrive through Input alone: a DOM keydown
        // handler beside this poll moved the cursor twice per press.
        const poll = () => {
          if (!active) return;
          if (!armed) {
            if (!Input.isPressed('ok') && performance.now() >= readyAt) armed = true;
            requestAnimationFrame(poll);
            return;
          }
          if (Input.isTriggered('down') || Input.isRepeated('down') || Input.isTriggered('right') || Input.isRepeated('right')) {
            sel = (sel + 1) % btns.length;
            upd();
            SoundManager.playCursor();
          } else if (Input.isTriggered('up') || Input.isRepeated('up') || Input.isTriggered('left') || Input.isRepeated('left')) {
            sel = (sel - 1 + btns.length) % btns.length;
            upd();
            SoundManager.playCursor();
          } else if (Input.isTriggered('ok')) {
            finish(sel);
            return;
          }
          requestAnimationFrame(poll);
        };
        poll();
      });
    }

    // Picks n random lines from a bilingual pool and lets the player choose one.
    // Returns the chosen entry (already echoed into the log as Eris's line).
    async _chooseLine(pool, n = 4) {
      const opts = reversePickSome(pool, Math.min(n, pool.length));
      const idx = await this._showChoicesDOM(opts.map(o => o.text));
      return opts[idx];
    }

    _demeanorLabel() {
      if (this._pressCount === 0) return T('ErisTrial.line.unread');
      if (this._readSignal > 0) return T('ErisTrial.line.evasive');
      if (this._readSignal < 0) return T('ErisTrial.line.composed');
      return T('ErisTrial.line.unreadable');
    }

    _recordRead(approach) {
      this._pressCount++;
      if (approach.read === 'true') {
        this._readSignal += this.trueGuilty ? 1 : -1;
      } else if (approach.read === 'noisy') {
        // Half the time it reflects the truth, half the time pure noise.
        if (Math.random() < 0.5) this._readSignal += this.trueGuilty ? 1 : -1;
        else this._readSignal += Math.random() < 0.5 ? 1 : -1;
      }
      const cell = document.getElementById('eris-demeanor');
      if (cell) cell.textContent = this._demeanorLabel();
    }

    _showStamp(cssClass, text) {
      const spread = this._container ? this._container.querySelector('.book-spread') : null;
      if (!spread) return;
      const stamp = document.createElement('div');
      stamp.className = `eris-verdict-stamp ${cssClass}`;
      stamp.textContent = text;
      spread.appendChild(stamp);
    }

    async _chooseMood() {
      this._addDialogue(T('ErisTrial.line.beforeITakeTheBench'), 'eris');
      await this._waitForAdvance();

      const labels = REVERSE_MOOD_LABELS();
      const idx = await this._showChoicesDOM(REVERSE_MOODS.map(m => labels[m]), false);
      this.mood = REVERSE_MOODS[idx];

      const flavor = REVERSE_MOOD_FLAVOR()[this.mood];
      this._renderBook();
      this._addDialogue(flavor.open, 'eris');
      await this._waitForAdvance();
    }

    async _openCourt() {
      const name = this.defendantName;
      this._addDialogue(T('ErisTrial.reverse.bringIn', { name: name }), 'eris');
      await this._waitForAdvance();

      this._addDialogue(T('ErisTrial.reverse.ledBeforeBench', { name: name }),
        'narrator');
      await this._waitForAdvance();

      await this._chooseLine(REVERSE_OPENING_LINES(), 4);
      await this._waitForAdvance();

      const reply = reversePickSome(REVERSE_OPENING_REPLIES(), 1)[0];
      this._addDialogue(reply.text);
      await this._waitForAdvance();
    }

    async _presentCharges() {
      const name = this.defendantName;

      for (const c of this.charges) {
        this._addDialogue(T('ErisTrial.reverse.accusedOf', { charge: c.text }), 'eris');
        await this._waitForAdvance();
      }

      const personality = this._personalityName();
      if (personality) {
        this._addDialogue(T('ErisTrial.reverse.defendantSeems',
          { name: name, personality: personality.toLowerCase() }), 'narrator');
        await this._waitForAdvance();
      }
    }

    // The player picks how to press the defendant, once per charge. Each
    // approach draws a different answer and colours the demeanor reading.
    async _interrogate() {
      const rounds = this.charges.length;

      for (let i = 0; i < rounds; i++) {
        this._addDialogue(T('ErisTrial.reverse.chargeOf',
          { index: i + 1, total: rounds }), 'narrator');
        await this._waitForAdvance();

        const opts = reversePickSome(REVERSE_PRESS_APPROACHES(), Math.min(4, REVERSE_PRESS_APPROACHES().length));
        const idx = await this._showChoicesDOM(opts.map(o => o.text));
        const approach = opts[idx];
        await this._waitForAdvance();

        const replies = trialBank('ErisTrial.reversePressReplies')[approach.key] || {};
        const pool = (this.trueGuilty ? replies.guilty : replies.innocent) || [];
        const reply = reversePickSome(pool, 1)[0];
        this._addDialogue(reply);
        this._recordRead(approach);
        await this._waitForAdvance();
      }
    }

    async _chooseVerdict() {

      await this._chooseLine(REVERSE_CLOSING_LINES(), 4);
      await this._waitForAdvance();

      const plea = reversePickSome(REVERSE_FINAL_PLEAS(), 1)[0];
      this._addDialogue(plea.text);
      await this._waitForAdvance();

      this._addDialogue(T('ErisTrial.line.howDoIRuleOn'), 'eris');
      await this._waitForAdvance();

      const choices = T.pool('ErisTrial.bank._chooseVerdict.choices');
      const idx = await this._showChoicesDOM(choices, false);
      this.verdict = idx === 0 ? "guilty" : "innocent";

      const flavor = REVERSE_MOOD_FLAVOR()[this.mood];
      this._addDialogue(this.verdict === "guilty" ? flavor.guilty : flavor.innocent, 'eris');
      await this._waitForAdvance();
    }

    async _choosePunishment() {
      this._addDialogue(T('ErisTrial.line.andTheSentenceShallBe'), 'eris');
      await this._waitForAdvance();

      const typeChoices = T.pool('ErisTrial.bank._choosePunishment.typeChoices');
      const typeIdx = await this._showChoicesDOM(typeChoices, false);

      if (typeIdx === 0) {
        this.sentenceType = "time";
        const optIdx = await this._showChoicesDOM(REVERSE_JAIL_OPTIONS().map(o => o.text), false);
        const opt = REVERSE_JAIL_OPTIONS()[optIdx];
        this.sentenceLabel = opt.text;
        this.sentenceSeverity = opt.severity;
        this._addDialogue(T('ErisTrial.reverse.takeThemAway',
          { sentence: opt.text }), 'eris');
        await this._waitForAdvance();
      } else {
        this.sentenceType = "capital";
        const optIdx = await this._showChoicesDOM(REVERSE_CAPITAL_OPTIONS().map(o => o.text), false);
        const opt = REVERSE_CAPITAL_OPTIONS()[optIdx];
        this.sentenceLabel = opt.text;
        this.sentenceSeverity = 100;
        this._addDialogue(opt.line, 'narrator');
        await this._waitForAdvance();
      }
    }

    async _partingWords() {
      await this._chooseLine(REVERSE_PARTING_LINES(), 4);
      await this._waitForAdvance();
    }

    _computeScore() {
      let score = 100;
      const guilty = this.verdict === "guilty";

      if (guilty !== this.trueGuilty) score -= 30;

      if (guilty) {
        const mismatch = Math.abs(this.sentenceSeverity - this.crimeSeverity);
        score -= Math.round(mismatch * 0.4);
        if (this.sentenceType === "capital" && (!this.trueGuilty || this.crimeSeverity < 40)) {
          score -= 25;
        }
      } else if (this.trueGuilty && this.crimeSeverity > 60) {
        score -= 15;
      }

      const harshMoods = ["vindictive", "irritated", "dramatic"];
      const softMoods = ["benevolent", "whimsical"];
      if (harshMoods.includes(this.mood) && guilty && this.sentenceSeverity >= 75) score -= 10;
      if (softMoods.includes(this.mood) && !guilty && this.trueGuilty) score -= 10;

      this.score = Math.max(0, Math.min(100, Math.round(score)));
    }

    _rankForScore(score) {
      if (score >= 90) return T('ErisTrial.line.impartialJudge');
      if (score >= 70) return T('ErisTrial.line.fairMostly');
      if (score >= 45) return T('ErisTrial.line.questionableJustice');
      if (score >= 20) return T('ErisTrial.line.wildlyBiased');
      return T('ErisTrial.line.utterTyrant');
    }

    async _revealTruth() {
      this._addDialogue(T('ErisTrial.reverse.truth', {
        name: this.defendantName,
        verdict: T(this.trueGuilty ? 'ErisTrial.reverse.guilty'
                                   : 'ErisTrial.reverse.innocent')
      }), 'narrator');
      await this._waitForAdvance();

      // Same heading as the normal trial's own score (ErisTrial.
      // showImpartialityScore), so both modes read as one scale.
      const rank = this._rankForScore(this.score);
      this._addDialogue(T('ErisTrial.line.impartialityScore',
        { score: this.score, rank: rank }), 'narrator');
      this._showStamp(this.score >= 60 ? 'innocent' : 'guilty', String(this.score));
      await this._waitForAdvance(600);
    }

    async run() {
      if (!this._pickDefendant()) {
        window.skipLocalization = true;
        $gameMessage.add(T('ErisTrial.line.noNpcsFoundInThe'));
        window.skipLocalization = false;
        return;
      }

      this._rollCase();
      this._createUI();

      await this._chooseMood();
      await this._openCourt();
      await this._presentCharges();
      await this._interrogate();
      await this._chooseVerdict();
      if (this.verdict === "guilty") {
        await this._choosePunishment();
      } else {
        this.sentenceType = null;
        this.sentenceSeverity = 0;
      }
      await this._partingWords();
      this._computeScore();
      await this._revealTruth();

      this._removeUI();
    }
  }

  window.ErisReverseTrial = ErisReverseTrial;

  // Plugin Command Registration
  PluginManager.registerCommand(pluginName, "startTrial", (args) => {
    if (!$gameVariables.value(returnMapVariable)) {
      $gameVariables.setValue(returnMapVariable, $gameMap.mapId());
      $gameVariables.setValue(returnXVariable, $gamePlayer.x);
      $gameVariables.setValue(returnYVariable, $gamePlayer.y);
    }

    const trial = new ErisTrial();
    trial.startTrial();
  });

  PluginManager.registerCommand(pluginName, "skipToJail", (args) => {
    // Save current location for release
    if (!$gameVariables.value(returnMapVariable)) {
      $gameVariables.setValue(returnMapVariable, $gameMap.mapId());
      $gameVariables.setValue(returnXVariable, $gamePlayer.x);
      $gameVariables.setValue(returnYVariable, $gamePlayer.y);
    }

    // Get current bounty
    const currentBounty = $gameVariables.value(bountyVariableId);

    // Transfer directly to prison
    $gamePlayer.reserveTransfer(prisonMapId, prisonX, prisonY, 2, 0);

    // Flag to start prison time when the map loads
    $gameTemp._startPrisonOnLoad = true;
    $gameTemp._prisonBounty = currentBounty;
  });

  PluginManager.registerCommand(pluginName, "autoServeSentence", (args) => {
    // Save current location for release, same as the other custody commands,
    // in case this is called without having gone through startTrial/skipToJail.
    if (!$gameVariables.value(returnMapVariable)) {
      $gameVariables.setValue(returnMapVariable, $gameMap.mapId());
      $gameVariables.setValue(returnXVariable, $gamePlayer.x);
      $gameVariables.setValue(returnYVariable, $gamePlayer.y);
    }

    // Reuses the real release flow (forgives the bounty, shows Eris's release
    // line, teleports to the saved return spot) instead of the real-time wait.
    if (window.prisonManager) {
      window.prisonManager.releasePrisoner();
    }
  });

  PluginManager.registerCommand(pluginName, "openReverseTrial", (args) => {
    if (!($gameSystem && $gameSystem._isSandboxMode)) {
      const it = ConfigManager.language === "it";
      window.skipLocalization = true;
      $gameMessage.add(T('ErisTrial.line.onlyAvailableInSandboxMode'));
      window.skipLocalization = false;
      return;
    }

    const trial = new ErisReverseTrial();
    trial.run();
  });

  window.ErisTrial = ErisTrial;
})();