/*:
 * @target MZ
 * @plugindesc v1.0.0 Work System - Select jobs, earn money, gain experience through labor
 * @author Omni-Lex
 * @base TimeDateSystem
 * @orderAfter TimeDateSystem
 *
 * @help WorkSystem.js
 * === Work System v1.0.0 ===
 *
 * Requires: TimeDateSystem.js and DataService.js
 *
 * --- Features ---
 * - Select from 30+ different jobs across multiple categories
 * - Choose which party member performs the work
 * - View stat requirements before starting
 * - Warning system for insufficient stats (but allows risky work)
 * - Screen darkens during work shift
 * - Procedural outcome messages based on performance
 * - Time passes during work (integrates with TimeDateSystem)
 * - Earn gold or lose it in disasters
 * - Take damage and suffer status effects from work accidents
 * - Success rates influenced by stats and luck
 *
 * --- Plugin Commands ---
 *
 * @command OpenWorkMenu
 * @text Open Work Menu
 * @desc Opens the work system job selection screen.
 *
 * @command OpenWorkMenuCategory
 * @text Open Work Menu (Category)
 * @desc Opens work menu filtered to a specific category.
 * @arg category
 * @type select
 * @option General
 * @option Combat
 * @option Magical
 * @option Social
 * @option Technical
 * @option Labor
 * @option Criminal
 * @option Faction
 * @default General
 * @desc The job category to display.
 *
 * @command ShowSingleJob
 * @text Show Single Job
 * @desc Shows a specific job without the job list.
 * @arg jobId
 * @type number
 * @min 1
 * @default 1
 * @desc The ID of the job to display.
 *
 * @param timeVariable
 * @text Time Variable
 * @desc Variable ID that stores game time in minutes (from TimeDateSystem).
 * @type variable
 * @default 114
 *
 * @param enableFactionJobs
 * @text Enable Faction Jobs
 * @desc Show faction-specific jobs in the work menu.
 * @type boolean
 * @default true
 *
 * @param showSuccessChance
 * @text Show Success Chance
 * @desc Display calculated success % before working.
 * @type boolean
 * @default true
 *
 * @param workFadeDuration
 * @text Work Fade Duration
 * @desc Frames for screen fade (60 = 1 second).
 * @type number
 * @default 30
 *
 * @param workDuration
 * @text Work Display Duration
 * @desc How long (in frames) the black screen lasts during work.
 * @type number
 * @default 120
 *
 * @param workSoundEffect
 * @text Work Sound Effect
 * @desc SE to play when work begins (leave blank for none).
 * @type file
 * @dir audio/se
 * @default
 */

(() => {
  'use strict';

  const pluginName = "WorkSystem";
  const parameters = PluginManager.parameters(pluginName);

  const settings = {
    timeVariable: Number(parameters.timeVariable || 114),
    enableFactionJobs: parameters.enableFactionJobs === "true",
    showSuccessChance: parameters.showSuccessChance === "true",
    workFadeDuration: Number(parameters.workFadeDuration || 30),
    workDuration: Number(parameters.workDuration || 120),
    workSoundEffect: String(parameters.workSoundEffect || "")
  };

  // What an hour on the clock costs the worker, matching the drain rates in
  // TimeDateSystem: 5% hunger and 3% sleep per hour worked.
  const HUNGER_PER_HOUR = 5;
  const SLEEP_PER_HOUR = 3;

  // The shift's clock. TimeDateSystem owns the same variable and also keeps the
  // readable date (variable 113) in step with it, so go through it when it is
  // loaded and fall back to the raw variable when it is not.
  function getGameTimeMinutes() {
    const TDS = window.TimeDateSystem;
    if (TDS && TDS.getGameTimeMinutes) return TDS.getGameTimeMinutes();
    return $gameVariables.value(settings.timeVariable) || 0;
  }

  function setGameTimeMinutes(minutes) {
    const TDS = window.TimeDateSystem;
    if (TDS && TDS.setGameTimeMinutes) {
      TDS.setGameTimeMinutes(minutes);
      if (TDS.updateGameDateVariable) TDS.updateGameDateVariable();
      return;
    }
    $gameVariables.setValue(settings.timeVariable, Math.max(0, minutes));
  }

  let _statsI18n = null;

  const _loadStatsI18n = async () => {
    const lang = ConfigManager.language || 'en';
    const url = `js/i18n/${lang}/stats.json`;
    try {
      const response = await fetch(url);
      _statsI18n = await response.json();

      // Force refresh of details panel if it exists and scene is active
      if (SceneManager._scene instanceof Scene_Work && SceneManager._scene._detailsPanel) {
        SceneManager._scene._detailsPanel.refresh();
      }
    } catch (e) {
      console.error('WorkSystem: Failed to load i18n data from ' + url, e);
    }
  };

  const _si18n = (key) => {
    if (_statsI18n && _statsI18n[key]) {
      return _statsI18n[key];
    }
    return key;
  };

  _loadStatsI18n();

  const statKeyMapping = {
    'HP': 'HP',
    'MP': 'MP',
    'ATK': 'ATT',
    'DEF': 'DEF',
    'MAT': 'M.ATT',
    'MDF': 'M.DEF',
    // i18n-ignore-start  the KEYS are stat ids from the job data
    'AGI': 'AGILITY',
    'LUK': 'LUCK',
    'Arcane': 'ARCANE',
    'Substance': 'SUBSTANCE',
    'Stealth': 'STEALTH',
    'Intimidation': 'INTIMIDATION'
  };
  // i18n-ignore-end

  window.WorkSystem = window.WorkSystem || {};
  window.WorkSystem.statKeyMapping = statKeyMapping;
  window.WorkSystem.si18n = _si18n;

  // A job's wording is not in Jobs.json: the file carries i18n keys
  // ("Jobs.<id>.name"), and the prose behind them lives in
  // js/i18n/<lang>/plugins/Jobs.json, so a shift reads in the player's
  // language. A
  // value that resolves to nothing is shown as written, which is what keeps a
  // modded or hand-added job with plain English in it readable.
  const _jobText = (value) => {
    if (!value) return '';
    const key = String(value);
    return (typeof T === 'function' && T.has && T.has(key)) ? T(key) : key;
  };
  window.WorkSystem.jobText = _jobText;
  window.WorkSystem.jobName = (job) => (job ? _jobText(job.name) : '');
  window.WorkSystem.jobDescription = (job) => (job ? _jobText(job.description) : '');

  // `category` and `spec` stay English ids in the data - they are what the code
  // filters and scores on - so the label is derived from the id rather than
  // stored beside it.
  window.WorkSystem.categoryLabel = function (category) {
    if (!category) return '';
    const key = 'Jobs.category.' + String(category).toLowerCase().replace(/[^a-z0-9]/g, '');
    return (typeof T === 'function' && T.has && T.has(key)) ? T(key) : String(category);
  };
  window.WorkSystem.jobCategoryLabel = (job) => window.WorkSystem.categoryLabel(job && job.category);

  // An outcome's `messages` is a key naming a pool of wordings, taken from the
  // active language whole (T.pool) so a translation never interleaves with
  // English. An older array of literal messages still works.
  window.WorkSystem.outcomeMessages = function (outcome) {
    if (!outcome || !outcome.messages) return [];
    if (Array.isArray(outcome.messages)) return outcome.messages;
    const pool = (typeof T === 'function' && T.pool) ? T.pool(String(outcome.messages)) : [];
    return pool.length ? pool : [];
  };

  // Resolve a job status (raw name like "Nausea" from Jobs.json, or a numeric
  // state id) to a state id. The name->id map is built lazily from $dataStates
  // by matching state names, then cached. There is no static WorkSystem.Status
  // table, so both the apply and display paths must go through this.
  let _statusMap = null;
  window.WorkSystem.resolveStatusId = function (status) {
    if (status == null) return 0;
    if (!isNaN(status)) return Number(status); // already a numeric state id
    if (!_statusMap && Array.isArray($dataStates)) {
      _statusMap = {};
      for (const st of $dataStates) {
        if (st && st.name) _statusMap[st.name.toUpperCase()] = st.id;
      }
    }
    return (_statusMap && _statusMap[String(status).toUpperCase()]) || 0;
  };

  // Helper function to get job by ID
  window.WorkSystem.getJob = function (jobId) {
    if (!window.WorkSystem || !window.WorkSystem.Jobs) return null;
    return window.WorkSystem.Jobs.find(job => job.id === jobId);
  };

  // Helper function to get jobs by category
  window.WorkSystem.getJobsByCategory = function (category) {
    if (!window.WorkSystem || !window.WorkSystem.Jobs) return [];
    return window.WorkSystem.Jobs.filter(job => job.category === category);
  };

  // Helper function to get faction jobs
  window.WorkSystem.getFactionJobs = function (factionId) {
    if (!window.WorkSystem || !window.WorkSystem.Jobs) return [];
    return window.WorkSystem.Jobs.filter(job => job.factionId === factionId);
  };

  // Helper function to get actor stat (including custom ones)
  window.WorkSystem.getActorStat = function (actor, stat) {
    if (!actor) return 0;
    switch (stat) {
      case 'ATK': return actor.atk;
      case 'DEF': return actor.def;
      case 'MAT': return actor.mat;
      case 'MDF': return actor.mdf;
      case 'AGI': return actor.agi;
      case 'LUK': return actor.luk;
      case 'HP': return actor.mhp;
      case 'MP': return actor.mmp;
      // i18n-ignore-start  stat ids
      case 'Arcane':
      case 'Substance':
      case 'Stealth':
      case 'Intimidation': {
        // The equip-derived stats live on the actor (ActorCharacterFields'
        // pvArcane/pvSubstance/pvStealth/pvIntimidation), written by
        // ItemSystemEquipment on every equip change. They used to be mirrored
        // into variables 121-132 and this read those variables, so once the
        // mirror was dropped every aesthetic requirement scored 0 no matter
        // what the worker was wearing.
        const getter = {
          'Arcane': 'pvArcane', 'Substance': 'pvSubstance',
          'Stealth': 'pvStealth', 'Intimidation': 'pvIntimidation'
        }[stat];
        // i18n-ignore-end
        if (typeof actor[getter] === 'function') return actor[getter]() || 0;
        // Background NPCs come through as plain stat proxies carrying the
        // lowercase profile fields (NPCSociety), not as Game_Actors.
        const key = stat.toLowerCase();
        if (typeof actor[key] === 'number') return actor[key];
        // Anything else that can still be asked what it is wearing.
        if (typeof actor.calculateCustomStats === 'function') {
          return actor.calculateCustomStats()[key] || 0;
        }
        return 0;
      }
      default: return 0;
    }
  };

  // The four equip-derived stats. They are percentages of the worker's kit
  // (ItemSystemEquipment), so they read 0-100 and always sum to about 100:
  // dressing for one job is dressing against another.
  const AESTHETIC_STATS = ['Arcane', 'Substance', 'Stealth', 'Intimidation']; // i18n-ignore: stat ids

  // What a job wants you to look like when it does not say so itself. A job
  // with explicit aesthetic requirements is judged on those instead.
  const CATEGORY_LOOK = { // i18n-ignore: Jobs.json category ids -> stat ids
    'Combat': 'Intimidation',
    'Criminal': 'Stealth',
    'Magical': 'Arcane',
    'Social': 'Substance',
    'Technical': 'Substance',
    'Labor': 'Substance',
    'General': 'Substance',
    'Faction': 'Arcane'
  };

  // Looking half the part is already dressed enough; the rest is polish.
  const LOOK_FULL = 50;

  // What a perfect look is worth: up to +15 points of success chance, and up to
  // a third again on the pay. Enough to feel, not enough to replace the stats.
  const LOOK_SUCCESS_WEIGHT = 0.15;
  const LOOK_PAY_WEIGHT = 0.33;

  // How well this worker is turned out for this job, 0-1. Meeting an aesthetic
  // requirement exactly is half marks - the bar is what gets you hired, not
  // what makes you good at it - and twice the bar is full marks, except that
  // full marks never arrive before half a wardrobe: a job asking for Arcane 10
  // should still tell a robed mage apart from someone in one lucky hat.
  window.WorkSystem.aestheticScore = function (actor, job) {
    const reqs = job.requirements || {};
    const named = AESTHETIC_STATS.filter(s => reqs[s] > 0);
    if (named.length) {
      let total = 0;
      for (const stat of named) {
        const full = Math.max(reqs[stat] * 2, LOOK_FULL);
        total += Math.min(1, this.getActorStat(actor, stat) / full);
      }
      return total / named.length;
    }
    // Jobs that name no look still have one: the shift goes better for a mage
    // who turns up in robes even when the posting never asked for them.
    const look = CATEGORY_LOOK[job.category];
    if (!look) return 0;
    return Math.min(1, this.getActorStat(actor, look) / LOOK_FULL);
  };

  // Helper function to check if actor meets requirements
  window.WorkSystem.meetsRequirements = function (actor, job) {
    const requirements = job.requirements;
    const results = {
      meets: true,
      deficits: []
    };

    for (const [stat, required] of Object.entries(requirements)) {
      const actorValue = this.getActorStat(actor, stat);

      if (actorValue < required) {
        results.meets = false;
        results.deficits.push({
          stat: stat,
          required: required,
          current: actorValue,
          deficit: required - actorValue
        });
      }
    }

    return results;
  };

  // Calculate success chance based on stat deficits
  window.WorkSystem.calculateSuccessChance = function (actor, job) {
    const check = this.meetsRequirements(actor, job);
    // Having done the job before is worth as much as the raw stats for it
    // (each job names its trade in Jobs.json "spec"). Three points a tier, and
    // it is the member taking the shift who is judged, not the party's best.
    const trained = (job.spec && window.SpecializationXP)
      ? (window.SpecializationXP.levelOf(actor, job.spec) - 1) * 0.03 : 0;

    // Clearing the aesthetic bar is not the same as clearing it twice over:
    // without this, 60% Arcane on a job asking 25 read exactly like 25.
    const look = this.aestheticScore(actor, job) * LOOK_SUCCESS_WEIGHT;

    if (check.meets) {
      return Math.min(0.97, 0.80 + trained + look); // 80% base success rate if requirements met
    }

    // Calculate penalty based on deficits
    let totalDeficit = 0;
    let totalRequired = 0;

    for (const deficit of check.deficits) {
      totalDeficit += deficit.deficit;
      totalRequired += deficit.required;
    }

    const deficitRatio = totalDeficit / totalRequired;
    // Training and turning up dressed for it partly cover for stats the worker
    // does not have.
    const successChance = Math.max(0.10, 0.80 + trained + look - (deficitRatio * 2)); // Minimum 10% chance

    return successChance;
  };

  // ============================================================================
  // The shift check
  // ----------------------------------------------------------------------------
  // A shift is settled by a d20 thrown where the player can watch it. Everything
  // the offer already weighed - the job's requirements against the worker's
  // stats, the trade they have trained, how they turned up dressed - is folded
  // into a single modifier against one fixed shift difficulty, so the odds on
  // the die are exactly the odds the contract quoted.
  // ============================================================================

  const WORK_SHIFT_DC = 12;

  // Chosen so that P(d20 + modifier >= DC) equals the quoted success chance.
  window.WorkSystem.workCheckModifier = function (actor, job) {
    const chance = this.calculateSuccessChance(actor, job);
    const raw = Math.round(chance * 20 - (21 - WORK_SHIFT_DC));
    return Math.max(-9, Math.min(10, raw));
  };

  // What the worker is being judged on: the job's steepest requirement, which
  // is the stat the shift really turns on.
  window.WorkSystem.workCheckStat = function (job) {
    const reqs = (job && job.requirements) || {};
    let best = null;
    let bestValue = -Infinity;
    for (const [stat, required] of Object.entries(reqs)) {
      if (required > bestValue) { bestValue = required; best = stat; }
    }
    if (!best) return '';
    return _si18n(statKeyMapping[best] || best);
  };

  // ============================================================================
  // Shift events
  // ----------------------------------------------------------------------------
  // Something out of the ordinary happens on roughly a third of shifts. A shift
  // is not only a dice roll against the job's requirements: it is also the rich
  // customer who takes a liking to how you are dressed, the inspector who does
  // not, and - on the jobs that carry a weapon - the fight that pays hazard
  // rates if you win it.
  //
  // Each entry may carry:
  //   categories  Jobs.json categories it can happen on (omitted = any job)
  //   outcomes    shift outcomes it can attach to (omitted = any)
  //   stat        the aesthetic stat it turns on. A good event grows far more
  //               likely the better the worker looks; a bad one is warded off
  //               by the same stat.
  //   payBonus    fraction of the job's base pay, added (or removed, if negative)
  //   hp / mp     damage taken
  //   state       status name or state id, resolved like the job's own
  //   specXp      extra specialization points for the job's trade
  //   battle      the event is a fight; see WorkManager.buildEventTroop
  // Every id needs a matching WorkSystem.event.<id> line in the i18n files.
  // ============================================================================

  const EVENT_CHANCE = 0.35;

  const WORK_EVENTS = [ // i18n-ignore-start  Jobs.json category ids and stat ids
    // --- Good -----------------------------------------------------------------
    {
      id: 'richCustomer', tone: 'good', weight: 4, payBonus: 0.55,
      categories: ['Social', 'General', 'Labor'], outcomes: ['success', 'partial'],
      stat: 'Substance'
    },
    {
      id: 'collector', tone: 'good', weight: 3, payBonus: 0.6, specXp: 2,
      categories: ['Magical', 'Technical'], outcomes: ['success', 'partial'],
      stat: 'Arcane'
    },
    {
      id: 'skimmed', tone: 'good', weight: 4, payBonus: 0.75,
      categories: ['Criminal'], outcomes: ['success', 'partial'],
      stat: 'Stealth'
    },
    {
      id: 'shakedown', tone: 'good', weight: 3, payBonus: 0.45,
      categories: ['Combat', 'Faction'], outcomes: ['success', 'partial'],
      stat: 'Intimidation'
    },
    {
      id: 'headhunted', tone: 'good', weight: 2, payBonus: 0.4, specXp: 3,
      outcomes: ['success'], stat: 'Substance'
    },
    {
      id: 'quietShift', tone: 'good', weight: 3, payBonus: 0.15,
      outcomes: ['success', 'partial']
    },
    {
      id: 'apprentice', tone: 'good', weight: 2, specXp: 4,
      outcomes: ['success']
    },
    // --- Fights ---------------------------------------------------------------
    // Only where carrying a weapon is part of the job. Never on remote work:
    // nobody is ambushed over the Hypernet.
    {
      id: 'ambush', tone: 'mixed', weight: 5, battle: true, payBonus: 0.5,
      categories: ['Combat', 'Criminal', 'Faction'],
      stat: 'Intimidation', wards: true
    },
    {
      id: 'raid', tone: 'mixed', weight: 3, battle: true, payBonus: 0.35,
      categories: ['Labor', 'General'], outcomes: ['success', 'partial', 'failure'],
      stat: 'Intimidation', wards: true
    },
    // --- Bad ------------------------------------------------------------------
    {
      id: 'difficultCustomer', tone: 'bad', weight: 3, payBonus: -0.3,
      categories: ['Social', 'General'], stat: 'Substance', wards: true
    },
    {
      id: 'inspection', tone: 'bad', weight: 3, payBonus: -0.35,
      categories: ['Faction', 'Criminal'], stat: 'Stealth', wards: true
    },
    {
      id: 'nearMiss', tone: 'mixed', weight: 3, hp: 25, payBonus: 0.2,
      categories: ['Labor', 'Technical'], stat: 'Substance', wards: true
    },
    {
      id: 'backlash', tone: 'bad', weight: 3, mp: 30, state: 'Nausea',
      categories: ['Magical'], stat: 'Arcane', wards: true
    },
    {
      id: 'docked', tone: 'bad', weight: 2, payBonus: -0.25,
      outcomes: ['partial', 'failure', 'disaster']
    }
  ]; // i18n-ignore-end

  // ============================================================================
  // Work Manager - Core Logic
  // ============================================================================

  class WorkManager {
    // How a thrown die reads on the shop floor: a natural 1 is the day
    // something goes badly wrong, anything under the difficulty is a shift
    // botched, scraping past it is a shift half done, and clearing it by five
    // or more is a shift done properly.
    static outcomeFromRoll(roll, modifier) {
      if (roll === 1) return 'disaster';
      if (roll === 20) return 'success';
      const margin = roll + modifier - WORK_SHIFT_DC;
      if (margin < 0) return 'failure';
      return margin >= 5 ? 'success' : 'partial';
    }

    static executeWork(actor, job, options) {
      const modifier = window.WorkSystem.workCheckModifier(actor, job);
      const opts = options || {};
      const roll = Number.isFinite(opts.forcedRoll)
        ? opts.forcedRoll : Math.floor(Math.random() * 20) + 1;

      return this.processOutcome(actor, job, this.outcomeFromRoll(roll, modifier), opts);
    }

    // The same shift, with the die thrown on screen. The result is handed back
    // through the callback once the throw has played out; with no 3D layer
    // present (a headless run, three.js missing) the shift settles at once, so
    // callers get their result the same way either way.
    static resolveWork(actor, job, options, done) {
      const opts = options || {};
      const dice = window.Dice3D;
      if (!dice || typeof dice.rollD20 !== 'function') {
        done(this.executeWork(actor, job, opts));
        return;
      }

      const modifier = window.WorkSystem.workCheckModifier(actor, job);
      const throwing = dice.rollD20({
        dc: WORK_SHIFT_DC,
        modifier: modifier,
        statName: window.WorkSystem.workCheckStat(job),
        actionName: T('WorkSystem.shiftCheck', { job: window.WorkSystem.jobName(job) }),
        actor: actor,
        force3D: true
      });

      const settle = (rolled) => {
        const roll = (rolled && Number.isFinite(rolled.roll))
          ? rolled.roll : Math.floor(Math.random() * 20) + 1;
        done(this.processOutcome(actor, job, this.outcomeFromRoll(roll, modifier), opts));
      };

      if (throwing && typeof throwing.then === 'function') throwing.then(settle);
      else settle(throwing);
    }

    // Pick the one thing worth telling about this shift, or nothing. A good
    // event's odds ride on how well the worker is dressed for it; a bad one's
    // odds fall the same way, so the wardrobe is felt in both directions.
    static rollEvent(actor, job, outcomeType, options) {
      const opts = options || {};
      if (Math.random() >= EVENT_CHANCE) return null;

      const pool = [];
      let total = 0;
      for (const ev of WORK_EVENTS) {
        if (ev.categories && !ev.categories.includes(job.category)) continue;
        if (ev.outcomes && !ev.outcomes.includes(outcomeType)) continue;
        // opts.remote, not job.remote: a job that *can* be done from home is
        // still ambushable when the worker went in person.
        if (ev.battle && opts.remote) continue;

        let weight = ev.weight;
        if (ev.stat) {
          const look = Math.min(1, window.WorkSystem.getActorStat(actor, ev.stat) / LOOK_FULL);
          // `wards` reads the stat as protection against the event rather than
          // an invitation to it.
          weight *= ev.wards ? (1.3 - look) : (0.2 + look * 1.8);
        }
        if (weight <= 0) continue;
        total += weight;
        pool.push({ ev, weight });
      }
      if (!pool.length) return null;

      let pick = Math.random() * total;
      for (const entry of pool) {
        pick -= entry.weight;
        if (pick <= 0) return entry.ev;
      }
      return pool[pool.length - 1].ev;
    }

    // An ad-hoc troop of enemies near the party's level, the same way the
    // anomaly encounters build theirs (ProceduralAdventureSystem).
    static buildEventTroop() {
      if (typeof $dataEnemies === 'undefined' || typeof $dataTroops === 'undefined') return 0;
      const members = $gameParty.battleMembers();
      const level = members.length
        ? Math.round(members.reduce((s, m) => s + m.level, 0) / members.length) : 1;
      const levelOf = (e) => (window.BSE && window.BSE.Helpers)
        ? (window.BSE.Helpers.getEnemyLevel(e.note) || 0) : 0;

      const pool = [];
      for (let i = 1; i < $dataEnemies.length; i++) {
        const e = $dataEnemies[i];
        if (!e || !e.name || !e.battlerName) continue;
        const lv = levelOf(e);
        if (lv > 0 && Math.abs(lv - level) <= Math.max(5, level * 0.25)) pool.push(i);
      }
      if (!pool.length) {
        for (let i = 1; i < $dataEnemies.length; i++) {
          if ($dataEnemies[i] && $dataEnemies[i].battlerName) pool.push(i);
        }
      }
      if (!pool.length) return 0;

      const enemyId = pool[Math.floor(Math.random() * pool.length)];
      const count = 1 + Math.floor(Math.random() * 2);
      const troopMembers = [];
      for (let m = 0; m < count; m++) {
        troopMembers.push({ enemyId, x: 360 + m * 180, y: 320, hidden: false });
      }
      const troopId = $dataTroops.length;
      $dataTroops.push({ id: troopId, members: troopMembers, name: $dataEnemies[enemyId].name, pages: [] });
      return troopId;
    }

    static processOutcome(actor, job, outcomeType, options) {
      const outcome = job.outcomes[outcomeType];

      // Select random message
      const messages = window.WorkSystem.outcomeMessages(outcome);
      const message = messages.length
        ? messages[Math.floor(Math.random() * messages.length)] : '';

      // Calculate pay. A tradesman is worth more than a warm body, so the
      // shift pays better once the job's specialization is trained, and a
      // worker who looks the part is tipped, trusted and sent the good work.
      const skill = (job.spec && window.SpecializationXP)
        ? window.SpecializationXP.multiplierFor(actor, job.spec, 0.08) : 1;
      const look = window.WorkSystem.aestheticScore(actor, job);
      // A botched shift is a botched shift however well dressed.
      const paidForLook = (outcomeType === 'success' || outcomeType === 'partial')
        ? 1 + look * LOOK_PAY_WEIGHT : 1;
      const basePay = Math.floor(job.basePay * outcome.payMultiplier * skill);
      const pay = Math.floor(basePay * paidForLook);

      // Get damage
      const damage = outcome.damage || {};
      const hpDamage = damage.hp || 0;
      const mpDamage = damage.mp || 0;

      // Get status effects
      const statuses = outcome.status || [];

      const result = {
        outcomeType: outcomeType,
        message: message,
        pay: pay,
        lookScore: look,
        lookBonus: pay - basePay,
        hpDamage: hpDamage,
        mpDamage: mpDamage,
        statuses: statuses,
        jobName: window.WorkSystem.jobName(job)
      };

      const event = this.rollEvent(actor, job, outcomeType, options);
      // A fight with nobody to fight is no event at all: the troop is built
      // first so a database too thin to supply one drops the whole event
      // rather than paying out hazard rates for an ambush that never came.
      const troopId = event && event.battle ? this.buildEventTroop() : 0;
      if (event && (!event.battle || troopId)) {
        result.event = { id: event.id, tone: event.tone };
        const bonus = event.payBonus ? Math.round(job.basePay * event.payBonus) : 0;
        if (troopId) {
          // Hazard rates are earned in the fight, not by being in it: the bonus
          // is paid out by the victory callback in startWorkEventBattle.
          result.battle = { troopId, reward: bonus };
        } else if (bonus) {
          result.eventPay = bonus;
          result.pay += bonus;
        }
        if (event.hp) result.hpDamage += event.hp;
        if (event.mp) result.mpDamage += event.mp;
        if (event.state) result.statuses = statuses.concat([event.state]);
        if (event.specXp) result.eventSpecXp = event.specXp;
      }

      return result;
    }

    // options.timeAlreadyPassed: the caller ran the clock (and the worker's
    // hunger/sleep) forward itself, slice by slice, so the shift could be
    // watched passing - see Scene_Map.startRemoteWorkSequence. Taking the same
    // hours again here would double-charge the shift.
    static applyWorkEffects(actor, job, result, options) {
      const opts = options || {};
      // Apply gold gain/loss
      if (result.pay > 0) {
        $gameParty.gainGold(result.pay);
      } else if (result.pay < 0) {
        $gameParty.loseGold(Math.abs(result.pay));
      }

      // A shift is a day of the party's life, so it goes in the diary
      // (Diary.js); the shift is over by the time this runs.
      if (window.Diary) {
        window.Diary.onWorkShift(window.WorkSystem.jobName(job), result.pay, job.duration || job.hours || 0, actor);
      }

      // A shift worked is a shift learned from, and it is the worker who
      // learns it rather than whoever happens to be leading the party.
      if (job.spec && window.SpecializationXP) {
        // A shift with something to it teaches more than a quiet one.
        const xp = 2 + (result.eventSpecXp || 0);
        window.SpecializationXP.awardCapped(job.spec, xp, { actor, soloist: true });
      }

      // Apply damage
      if (result.hpDamage > 0) {
        actor.gainHp(-result.hpDamage);
      }
      if (result.mpDamage > 0) {
        actor.gainMp(-result.mpDamage);
      }

      // Apply status effects
      for (const statusName of result.statuses) {
        const stateId = window.WorkSystem.resolveStatusId(statusName);
        if (stateId) {
          actor.addState(stateId);
        }
      }

      if (opts.timeAlreadyPassed) return;

      // Advance time (duration in hours, convert to minutes)
      setGameTimeMinutes(getGameTimeMinutes() + job.duration * 60);

      // Reduce hunger/sleep based on work duration
      if (actor.reduceHunger !== undefined) {
        actor.reduceHunger(job.duration * HUNGER_PER_HOUR);
        actor.reduceSleep(job.duration * SLEEP_PER_HOUR);
      }
    }
  }

  // The shift check answers to the harness in test/test_workremote.js as well
  // as to the map.
  window.WorkSystem.WorkManager = WorkManager;

  // ============================================================================
  // Window_WorkJobList - Displays available jobs
  // ============================================================================

  class Window_WorkJobList extends Window_Selectable {
    initialize(rect, category) {
      this._category = category || null;
      super.initialize(rect);
      this.refresh();
      this.select(0);
    }

    maxCols() {
      return 1;
    }

    maxItems() {
      return this._data ? this._data.length : 0;
    }

    item() {
      return this._data[this.index()];
    }

    makeItemList() {
      if (!window.WorkSystem || !window.WorkSystem.Jobs) {
        this._data = [];
        return;
      }

      let jobs = window.WorkSystem.Jobs;

      // Filter by category if specified
      if (this._category) {
        jobs = jobs.filter(job => job.category === this._category);
      }

      // Filter faction jobs based on settings
      if (!settings.enableFactionJobs) {
        jobs = jobs.filter(job => !job.factionId);
      }

      this._data = jobs;
    }

    drawItem(index) {
      const job = this._data[index];
      if (!job) return;

      const rect = this.itemLineRect(index);

      // Job name
      this.resetTextColor();
      const jobName = window.WorkSystem.jobName(job);
      this.drawText(jobName, rect.x + 4, rect.y, rect.width - 120);

      // Duration
      this.changeTextColor(ColorManager.systemColor());
      this.drawText(`${job.duration}h`, rect.x + rect.width - 150, rect.y, 50, 'right');

      // Pay
      // Highlight the shifts that pay above the middle of the €25-€100/hour band.
      const payColor = job.basePay / job.duration > 6250
        ? ColorManager.powerUpColor() : ColorManager.normalColor();
      this.changeTextColor(payColor);
      this.drawText(`€${(job.basePay / 100).toFixed(2)}`, rect.x + rect.width - 90, rect.y, 80, 'right');
    }

    refresh() {
      this.makeItemList();
      super.refresh();
    }

    updateHelp() {
      if (this._helpWindow) {
        const job = this.item();
        if (job) {
          const desc = window.WorkSystem.jobDescription(job);
          this._helpWindow.setText(desc);
        }
      }
    }
  }

  // ============================================================================
  // Window_WorkJobDetails - Shows detailed job info and requirements
  // ============================================================================


  // ============================================================================
  // Window_WorkActorSelect - Choose which party member works
  // ============================================================================


  // ============================================================================
  // Window_WorkDetailsPanel - Combined details and actor selection panel
  // ============================================================================

  class Window_WorkDetailsPanel extends Window_Selectable {
    initialize(rect) {
      super.initialize(rect);
      this._job = null;
      this._actor = null;
      this._actorSelectMode = false;
      this._singleJobMode = false;
      this._actors = [];
      this.deactivate();
      this.refresh();
    }

    setSingleJobMode(enabled) {
      this._singleJobMode = enabled;
    }

    setJob(job) {
      if (this._job !== job) {
        this._job = job;
        this.refresh();
      }
    }

    setActor(actor) {
      if (this._actor !== actor) {
        this._actor = actor;
        this.refresh();
      }
    }

    getSelectedActor() {
      if (this._actorSelectMode && this.index() >= 0) {
        return this._actors[this.index()];
      }
      return this._actor;
    }

    activateActorSelection() {
      this._actorSelectMode = true;
      this._actors = $gameParty.members();
      this.activate();
      this.select(0);
      this.setHandler('ok', this.onActorOk.bind(this));
      this.setHandler('cancel', this.onActorCancel.bind(this));
      this.refresh();
    }

    deactivateActorSelection() {
      this._actorSelectMode = false;
      this.deactivate();
      this.select(-1);
      // MZ has setHandler but no clearHandler, so calling one threw and left the panel stuck
      // in actor-selection mode. The handlers live in _handlers, keyed by symbol.
      delete this._handlers['ok'];
      delete this._handlers['cancel'];
      this.refresh();
    }

    onActorOk() {
      const actor = this.getSelectedActor();
      if (actor && SceneManager._scene.onActorSelected) {
        SceneManager._scene.onActorSelected(actor);
      }
    }

    onActorCancel() {
      if (SceneManager._scene.onActorCancel) {
        SceneManager._scene.onActorCancel();
      }
    }

    maxCols() {
      return this._actorSelectMode ? 4 : 1;
    }

    maxItems() {
      return this._actorSelectMode ? this._actors.length : 0;
    }

    itemHeight() {
      if (this._actorSelectMode) {
        return 100; // Height for actor portraits
      }
      return this.lineHeight();
    }

    drawItem(index) {
      if (!this._actorSelectMode) return;

      const actor = this._actors[index];
      if (!actor) return;

      const rect = this.itemRect(index);
      const x = rect.x + 4;
      const y = rect.y + 4;
      const width = rect.width - 8;

      // Draw actor face
      this.drawActorFace(actor, x, y, width, 80);

      // Draw actor name
      this.drawText(actor.name(), x, y + 80, width, 'center');
    }

    refresh() {
      this.contents.clear();

      if (!this._job) {
        this.drawText(T('WorkSystem.selectJob'), 0, 0, this.contentsWidth(), 'center');
        return;
      }

      if (this._actorSelectMode) {
        this.drawActorSelection();
      } else {
        this.drawJobDetails();
      }
    }

    drawJobDetails() {
      const job = this._job;
      const actor = this._actor || $gameParty.leader();
      const lineHeight = this.lineHeight();
      let y = 0;

      // Job description
      this.changeTextColor(ColorManager.systemColor());
      const descLabel =T('WorkSystem.description');
      this.drawText(descLabel, 0, y, this.contentsWidth());
      y += lineHeight;

      this.resetTextColor();
      const description = window.WorkSystem.jobDescription(job);
      const wrappedDesc = this.wrapText(description, this.contentsWidth());
      for (const line of wrappedDesc) {
        this.drawText(line, 10, y, this.contentsWidth() - 10);
        y += lineHeight;
      }

      y += 5;

      // Job info row
      this.changeTextColor(ColorManager.systemColor());
      this.drawText(window.WorkSystem.jobCategoryLabel(job), 0, y, 200);
      this.drawText(`${job.duration}h`, 210, y, 100);
      this.changeTextColor(ColorManager.textColor(14));
      this.drawText(`€${(job.basePay / 100).toFixed(2)}`, 320, y, 100);
      y += lineHeight;

      // Faction info if applicable
      if (job.factionId !== undefined && job.factionId !== null) {
        this.changeTextColor(ColorManager.systemColor());
        const factionLabel =T('WorkSystem.faction');
        this.drawText(`${factionLabel}:`, 0, y, 100);
        this.changeTextColor(ColorManager.textColor(17)); // Purple/special color
        const factionName = this.getFactionName(job.factionId);
        this.drawText(factionName, 110, y, 300);
        y += lineHeight;
      }

      y += 10;

      // Split into two columns
      const columnWidth = Math.floor(this.contentsWidth() / 2);
      const leftX = 0;
      const rightX = columnWidth + 20;
      const startY = y;

      // Left column: Locations
      y = startY;
      this.changeTextColor(ColorManager.systemColor());
      const locLabel =T('WorkSystem.locations');
      this.drawText(locLabel, leftX, y, columnWidth);
      y += lineHeight;

      this.resetTextColor();
      if (!job.locations || job.locations.length === 0) {
        const unknownText =T('WorkSystem.unknown');
        this.drawText(unknownText, leftX + 10, y, columnWidth - 10);
      } else {
        for (const location of job.locations) {
          this.drawText('• ' + location, leftX + 10, y, columnWidth - 10);
          y += lineHeight;
          if (y > this.contentsHeight() - lineHeight * 2) break;
        }
      }

      // Right column: Requirements
      y = startY;
      this.changeTextColor(ColorManager.systemColor());
      const reqLabel =T('WorkSystem.requirements');
      this.drawText(reqLabel, rightX, y, columnWidth);
      y += lineHeight;

      const requirements = job.requirements;
      for (const [stat, required] of Object.entries(requirements)) {
        const actorValue = window.WorkSystem.getActorStat(actor, stat);
        const meetsReq = actorValue >= required;

        this.changeTextColor(meetsReq ? ColorManager.powerUpColor() : ColorManager.deathColor());
        this.drawText(`${_si18n(statKeyMapping[stat] || stat)}: ${actorValue} / ${required}`, rightX + 10, y, columnWidth - 10);
        y += lineHeight;
      }

      // Success rate at bottom
      if (settings.showSuccessChance && actor) {
        const successChance = window.WorkSystem.calculateSuccessChance(actor, job);
        const chancePercent = Math.floor(successChance * 100);

        y = this.contentsHeight() - lineHeight * 2;
        this.changeTextColor(ColorManager.systemColor());
        const successLabel =T('WorkSystem.successRate');
        this.drawText(successLabel + ':', rightX, y, 150);

        let chanceColor;
        if (chancePercent >= 70) {
          chanceColor = ColorManager.powerUpColor();
        } else if (chancePercent >= 40) {
          chanceColor = ColorManager.normalColor();
        } else {
          chanceColor = ColorManager.deathColor();
        }
        this.changeTextColor(chanceColor);
        this.drawText(`${chancePercent}%`, rightX + 160, y, 100);
      }
    }

    drawActorSelection() {
      const lineHeight = this.lineHeight();

      // Draw instruction text
      this.changeTextColor(ColorManager.systemColor());
      const instructionText =T('WorkSystem.selectWorker');
      this.drawText(instructionText, 0, 0, this.contentsWidth(), 'center');

      // Draw actor portraits (handled by drawItem)
      super.refresh();
    }

    wrapText(text, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const testWidth = this.textWidth(testLine);

        if (testWidth > maxWidth - 20 && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines;
    }

    getActorStat(actor, stat) {
      return window.WorkSystem.getActorStat(actor, stat);
    }

    getFactionName(factionId) {
      // FactionDataManager owns the faction table and reaches it through $gameFactions;
      // there has never been a $dataFactions, so this used to fall through every time.
      if (typeof $gameFactions !== 'undefined' && $gameFactions && $gameFactions.getFaction) {
        const faction = $gameFactions.getFaction(factionId);
        if (faction && faction.name) {
          const FDM = typeof FactionDataManager !== 'undefined' ? FactionDataManager : null;
          return (FDM && FDM.instance) ? FDM.instance.t(faction.name) : faction.name;
        }
      }

      // Fallback names, used only while FactionDataManager has not loaded.
      const factionNames = T.obj('WorkSystem.factionName');

      return factionNames[factionId] || T('WorkSystem.factionNumbered', { id: factionId });
    }
  }

  // ============================================================================
  // Scene_Work - Main work system scene
  // ============================================================================

  class Scene_Work extends Scene_MenuBase {
    create() {
      super.create();
      this._category = $gameTemp._workCategory || null;
      this._singleJobId = $gameTemp._singleJobId || null;
      this._singleJobMode = this._singleJobId !== null;

      $gameTemp._workCategory = null;
      $gameTemp._singleJobId = null;

      if (this._singleJobMode) {
        this.createSingleJobView();
      } else {
        this.createJobListWindow();
        this.createDetailsPanel();
      }

      // Hide standard MZ canvas windows
      if (this._jobListWindow) this._jobListWindow.visible = false;
      if (this._detailsPanel) this._detailsPanel.visible = false;

      this._dndFocusSection = this._singleJobMode ? 'actors' : 'list';
      this._dndActorIndex = 0;

      this.createUIWorkDOM();
    }

    jobListWindowRect() {
      const wx = 0;
      const wy = 0;
      const ww = Graphics.boxWidth;
      const wh = Graphics.boxHeight * 0.40; // Top 40% of screen
      return new Rectangle(wx, wy, ww, wh);
    }

    detailsPanelRect() {
      const wx = 0;
      const wy = this._jobListWindow.y + this._jobListWindow.height;
      const ww = Graphics.boxWidth;
      const wh = Graphics.boxHeight - wy;
      return new Rectangle(wx, wy, ww, wh);
    }

    singleJobRect() {
      const wx = 0;
      const wy = 0;
      const ww = Graphics.boxWidth;
      const wh = Graphics.boxHeight;
      return new Rectangle(wx, wy, ww, wh);
    }

    createJobListWindow() {
      const rect = this.jobListWindowRect();
      this._jobListWindow = new Window_WorkJobList(rect, this._category);
      this._jobListWindow.setHandler('ok', this.onJobOk.bind(this));
      this._jobListWindow.setHandler('cancel', this.popScene.bind(this));
      this._jobListWindow.activate();
      this.addWindow(this._jobListWindow);
    }

    createDetailsPanel() {
      const rect = this.detailsPanelRect();
      this._detailsPanel = new Window_WorkDetailsPanel(rect);
      this.addWindow(this._detailsPanel);
    }

    createSingleJobView() {
      const rect = this.singleJobRect();
      this._detailsPanel = new Window_WorkDetailsPanel(rect);
      this._detailsPanel.setSingleJobMode(true);
      this.addWindow(this._detailsPanel);

      // Load the specific job
      const job = window.WorkSystem.getJob(this._singleJobId);
      if (job) {
        this._detailsPanel.setJob(job);
        this._detailsPanel.setActor($gameParty.leader());

        // Immediately show actor selection
        this._detailsPanel.activateActorSelection();
      } else {
        console.error(`Job ID ${this._singleJobId} not found!`);
        this.popScene();
      }
    }

    onJobOk() {
      // Handled by our custom UI navigation
    }

    onActorSelected(actor) {
      const job = this._singleJobMode ? window.WorkSystem.getJob(this._singleJobId) : this._jobListWindow.item();
      if (job && actor) {
        this.startWork(actor, job);
      }
    }

    onActorCancel() {
      // Handled by our custom UI navigation
    }

    startWork(actor, job) {
      // Store work data and return to map
      $gameTemp._pendingWork = {
        actorId: actor.actorId(),
        job: job
      };

      this.popScene();
    }

    terminate() {
      super.terminate();
      if (this._dndContainer) {
        const container = this._dndContainer;
        container.style.transition = "opacity 0.2s ease-out";
        container.style.opacity = "0";
        container.style.pointerEvents = "none";
        setTimeout(() => {
          if (container && container.parentNode) {
            container.parentNode.removeChild(container);
          }
        }, 200);
        this._dndContainer = null;
      }
    }

    createUIWorkDOM() {


      this._dndContainer = document.createElement('div');
      this._dndContainer.id = 'menu-container';
      this._dndContainer.style.position = 'absolute';
      this._dndContainer.style.top = '0';
      this._dndContainer.style.left = '0';
      this._dndContainer.style.width = '100%';
      this._dndContainer.style.height = '100%';
      this._dndContainer.style.zIndex = '1000';
      this._dndContainer.style.background = 'radial-gradient(circle, rgba(18, 10, 5, 0.93) 0%, rgba(5, 3, 1, 0.98) 100%)';
      this._dndContainer.style.display = 'flex';
      this._dndContainer.style.justifyContent = 'center';
      this._dndContainer.style.alignItems = 'center';
      this._dndContainer.style.fontFamily = "var(--font-ui)";
      this._dndContainer.style.boxSizing = 'border-box';

      document.body.appendChild(this._dndContainer);

      this.refreshUIWorkDOM();
    }

    refreshUIWorkDOM() {
      if (!this._dndContainer) return;

      const jobs = this._jobListWindow ? this._jobListWindow._data : [];
      const selectedIndex = this._jobListWindow ? this._jobListWindow.index() : 0;
      const selectedJob = this._singleJobMode ? window.WorkSystem.getJob(this._singleJobId) : (jobs[selectedIndex] || null);

      const actors = $gameParty.members();
      const selectedActorIndex = this._dndActorIndex;
      const selectedActor = actors[selectedActorIndex] || actors[0];

      // Every job trains its own specialization, and that specialization is
      // what decides the shift's pay and its accident odds. Name the one the
      // highlighted job runs on, so the board reads as a board of skills.
      if (window.SpecBadge) {
        if (selectedJob && selectedJob.spec) window.SpecBadge.show(selectedJob.spec);
        else window.SpecBadge.hide();
      }

      let leftPageHTML = "";
      let rightPageHTML = "";

      // Whichever fragment is drawn on the left page carries the screen's one
      // Back stamp, in its page header. The board writes its own; the contract
      // page is given one here, so a screen never ends up with two of them or
      // with none.
      const contractHeaderHTML = `
        <div class="page-header-bar">
          <div class="back-button focusable" onclick="SceneManager._scene.popScene()">
            ${T('WorkSystem.dismiss')}
          </div>
          <h2 class="title cc-header-gothic work-09">
            ${T('WorkSystem.guildRegistry')}
          </h2>
        </div>`;

      if (this._singleJobMode) {
        leftPageHTML = contractHeaderHTML + this.getJobContractHTML(selectedJob, selectedActor);
        rightPageHTML = this.getActorSelectionHTML(actors, selectedActorIndex, selectedJob);
      } else {
        if (this._dndFocusSection === 'list') {
          leftPageHTML = this.getJobsBoardHTML(jobs, selectedIndex);
          rightPageHTML = this.getJobContractHTML(selectedJob, selectedActor);
        } else {
          leftPageHTML = contractHeaderHTML + this.getJobContractHTML(selectedJob, selectedActor);
          rightPageHTML = this.getActorSelectionHTML(actors, selectedActorIndex, selectedJob);
        }
      }

      this._dndContainer.innerHTML = `
        <div class="cc-pockets-spread">
          <!-- Spine Shading -->
          <div class="work-01"></div>

          <!-- Left Page -->
          <div class="cc-page cc-page-left work-02">
            ${leftPageHTML}
          </div>

          <!-- Right Page -->
          <div class="cc-page cc-page-right work-02">
            ${rightPageHTML}
          </div>
        </div>
      `;

      // Auto scroll selected items
      setTimeout(() => {
        if (this._dndContainer) {
          const listEl = this._dndContainer.querySelector('#jobs-list');
          if (listEl) {
            const selectedEl = listEl.querySelector('[style*="background: rgba(74, 29, 15, 0.08)"]');
            if (selectedEl) {
              selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
          }

          const rosterEl = this._dndContainer.querySelector('#roster-list');
          if (rosterEl) {
            const selectedEl = rosterEl.querySelector('.roster-item.focused');
            if (selectedEl) {
              selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
          }
        }
      }, 50);
    }

    getJobsBoardHTML(jobs, selectedIndex) {
      const title = this._category
        ? T('WorkSystem.guildRegistryCategory', {
            category: window.WorkSystem.categoryLabel(this._category).toUpperCase()
          })
        : T('WorkSystem.guildRegistry');

      let listHTML = "";
      if (jobs.length === 0) {
        listHTML = `
          <div class="work-03">
            ${T('WorkSystem.noGuildLaborRequisitionsCurrently')}
          </div>
        `;
      } else {
        jobs.forEach((job, idx) => {
          const isSelected = idx === selectedIndex && this._dndFocusSection === 'list';
          const jobName = window.WorkSystem.jobName(job);



          listHTML += `
            <div class="job-item ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.selectJobItem(${idx})">
              <div class="work-04">
                <span class="work-05" style="font-weight:${isSelected ? 'bold' : 'normal'}">
                  ${jobName}
                </span>
                <span class="work-06">
                  ${window.WorkSystem.jobCategoryLabel(job)} • ${job.duration}h
                </span>
              </div>
              <div class="work-07">
                <span class="work-08">
                  €${(job.basePay / 100).toFixed(2)}
                </span>
              </div>
            </div>
          `;
        });
      }

      // The way out stands where it stands on every screen: first child of the
      // page header, top left of the left page. It used to be a stamp at the
      // foot of the list, which put it in a different place on every menu.
      return `
        <div class="page-header-bar">
          <div class="back-button focusable" onclick="SceneManager._scene.popScene()">
            ${T('WorkSystem.dismiss')}
          </div>
          <h2 class="title cc-header-gothic work-09">
            ${title}
          </h2>
        </div>
        <div class="work-10" id="jobs-list">
          ${listHTML}
        </div>
      `;
    }

    getJobContractHTML(job, actor) {
      if (!job) {
        return `
          <div class="work-13">
            ${T('WorkSystem.selectALaborContractTo')}
          </div>
        `;
      }

      const jobName = window.WorkSystem.jobName(job);
      const description = window.WorkSystem.jobDescription(job);

      const reqCheck = window.WorkSystem.meetsRequirements(actor, job);
      const successChance = window.WorkSystem.calculateSuccessChance(actor, job);
      const chancePercent = Math.floor(successChance * 100);

      const chanceClass = chancePercent >= 70 ? "chance--good"
        : chancePercent >= 40 ? "chance--fair" : "chance--poor";

      let requirementsHTML = "";
      for (const [stat, required] of Object.entries(job.requirements)) {
        const actorValue = window.WorkSystem.getActorStat(actor, stat);
        const meetsReq = actorValue >= required;
        const mappedName = statKeyMapping[stat] || stat;
        const statLabel = _si18n(mappedName);

        requirementsHTML += `
          <div class="work-14" style="color:${meetsReq ? 'var(--text-text-alt-18)' : 'var(--text-settings-active)'}; font-weight:${meetsReq ? 'normal' : 'bold'}">
            <span>${statLabel}</span>
            <span>${actorValue} / ${required}</span>
          </div>
        `;
      }

      let locationsHTML = "";
      if (job.locations && job.locations.length > 0) {
        locationsHTML = `
          <div class="work-15">
            <strong class="work-16">${T('WorkSystem.deploymentLocations')}:</strong>
            <div class="work-17">
              ${job.locations.map(loc => `<span class="work-18">${window.WorkSystem.locationLabel ? window.WorkSystem.locationLabel(loc) : loc}</span>`).join('')}
            </div>
          </div>
        `;
      }

      let factionHTML = "";
      if (job.factionId !== undefined && job.factionId !== null) {
        const factionName = this._detailsPanel.getFactionName(job.factionId);
        factionHTML = `
          <div class="work-14">
            <strong class="work-19">${T('WorkSystem.faction')}:</strong>
            <span class="work-20">${factionName}</span>
          </div>
        `;
      }

      return `
        <h2 class="cc-header-gothic work-21">
          ${T('WorkSystem.laborContract')}
        </h2>

        <div class="work-22">
          <div class="work-23">
            <div class="work-24">
              ${jobName}
            </div>

            <div class="work-25">
              "${description}"
            </div>

            <div class="work-26">
              <div class="work-14">
                <strong class="work-19">${T('WorkSystem.categoryLabel')}:</strong>
                <span>${window.WorkSystem.jobCategoryLabel(job)}</span>
              </div>
              <div class="work-14">
                <strong class="work-19">${T('WorkSystem.duration')}:</strong>
                <span>${T('WorkSystem.hoursValue', { hours: job.duration })}</span>
              </div>
              <div class="work-27">
                <span>${T('WorkSystem.baseReward')}:</span>
                <span>€${(job.basePay / 100).toFixed(2)}</span>
              </div>
              ${factionHTML}
            </div>

            ${locationsHTML}

            <div class="work-28">
              <strong class="work-16">${T('WorkSystem.statRequirements')} (${actor.name()}):</strong>
              <div class="work-29">
                ${requirementsHTML}
              </div>
            </div>

            ${settings.showSuccessChance ? `
            <div class="work-30">
              <span class="work-19">${T('WorkSystem.estimatedSuccessRate')}:</span>
              <span class="work-31 ${chanceClass}">${chancePercent}%</span>
            </div>
            ` : ''}

            ${!reqCheck.meets ? `
            <div class="work-32">
              Warning: Deficits detected! Undertaking this contract will carry higher hazards of failure and injury.
            </div>
            ` : ''}
          </div>
        </div>

      `;
    }

    getActorFaceHTML(actor, size = 64) {
      const faceName = actor.faceName();
      if (!faceName) {
        return `<div class="work-34" style="width:${size}px; height:${size}px">${actor.name().charAt(0)}</div>`;
      }

      return `
        <div class="work-35" style="width:${size}px; height:${size}px; background-image:url('img/busts/${faceName}.png')"></div>
      `;
    }

    getActorRequirementDetailHTML(actor, job) {
      let html = "";
      for (const [stat, required] of Object.entries(job.requirements)) {
        const actorValue = window.WorkSystem.getActorStat(actor, stat);
        const isMet = actorValue >= required;
        const mappedName = statKeyMapping[stat] || stat;
        const statLabel = _si18n(mappedName);

        html += `
          <div class="work-36" style="color:${isMet ? 'var(--text-text-alt-18)' : 'var(--text-settings-active)'}; font-weight:${isMet ? 'normal' : 'bold'}">
            <span>${statLabel}</span>
            <span>${actorValue} / ${required}</span>
          </div>
        `;
      }
      return html;
    }

    getActorSelectionHTML(actors, selectedActorIndex, selectedJob) {

      let listHTML = "";
      actors.forEach((actor, idx) => {
        const isSelected = idx === selectedActorIndex;
        const isFocused = isSelected && this._dndFocusSection === 'actors';

        const successChance = window.WorkSystem.calculateSuccessChance(actor, selectedJob);
        const chancePercent = Math.floor(successChance * 100);
        const chanceClass = chancePercent >= 70 ? "chance--good"
          : chancePercent >= 40 ? "chance--fair" : "chance--poor";



        listHTML += `
          <div class="roster-item focusable ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}" onclick="SceneManager._scene.selectActorItem(${idx})">
            ${this.getActorFaceHTML(actor, 54)}
            <div class="work-37">
              <div class="work-38">
                <strong class="work-05">
                  ${actor.name()}
                </strong>
                <span class="work-39 ${chanceClass}">
                  ${chancePercent}% SUCCESS
                </span>
              </div>
              <div class="work-40">
                ${this.getActorRequirementDetailHTML(actor, selectedJob)}
              </div>
            </div>
          </div>
        `;
      });

      return `
        <h2 class="cc-header-gothic work-09">
          ${T('WorkSystem.workerRoster')}
        </h2>

        <div class="work-41" id="roster-list">
          ${listHTML}
        </div>

        <div class="work-42">
          <div class="action-button focusable work-43" onclick="SceneManager._scene.confirmActorSelection()">
            ${T('WorkSystem.signContract')}
          </div>
          
          ${!this._singleJobMode ? `
          <div class="action-button focusable work-44" onclick="SceneManager._scene.retractActorSelection()">
            ${T('WorkSystem.retractContract')}
          </div>
          ` : ''}
        </div>
      `;
    }

    selectJobItem(index) {
      if (this._jobListWindow) {
        this._jobListWindow.select(index);
        this._dndFocusSection = 'list';
        SoundManager.playOk();
        this.refreshUIWorkDOM();
      }
    }

    selectActorItem(index) {
      this._dndActorIndex = index;
      this._dndFocusSection = 'actors';
      SoundManager.playOk();
      this.refreshUIWorkDOM();
    }

    confirmActorSelection() {
      const actor = $gameParty.members()[this._dndActorIndex];
      if (actor) {
        SoundManager.playOk();
        this.onActorSelected(actor);
      } else {
        SoundManager.playBuzzer();
      }
    }

    retractActorSelection() {
      SoundManager.playCancel();
      this._dndFocusSection = 'list';
      this._detailsPanel.deactivateActorSelection();
      if (this._jobListWindow) this._jobListWindow.activate();
      this.refreshUIWorkDOM();
    }

    update() {
      super.update();

      if (this._dndContainer) {
        let moved = false;
        const job = this._singleJobMode ? window.WorkSystem.getJob(this._singleJobId) : (this._jobListWindow ? this._jobListWindow.item() : null);

        if (this._dndFocusSection === 'list' && !this._singleJobMode) {
          if (Input.isTriggered('down') || Input.isRepeated('down') || this.isKeyPressed('KeyS')) {
            const currentIndex = this._jobListWindow.index();
            const maxItems = this._jobListWindow.maxItems();
            if (maxItems > 0) {
              const nextIndex = currentIndex < maxItems - 1 ? currentIndex + 1 : 0;
              this._jobListWindow.select(nextIndex);
              moved = true;
            }
          } else if (Input.isTriggered('up') || Input.isRepeated('up') || this.isKeyPressed('KeyW')) {
            const currentIndex = this._jobListWindow.index();
            const maxItems = this._jobListWindow.maxItems();
            if (maxItems > 0) {
              const prevIndex = currentIndex > 0 ? currentIndex - 1 : maxItems - 1;
              this._jobListWindow.select(prevIndex);
              moved = true;
            }
          } else if (Input.isTriggered('right') || this.isKeyPressed('KeyD') || Input.isTriggered('ok')) {
            if (job) {
              this._dndFocusSection = 'actors';
              this._dndActorIndex = 0;
              this._jobListWindow.deactivate();
              this._detailsPanel.activateActorSelection();
              moved = true;
              SoundManager.playOk();
            }
          }
        } else if (this._dndFocusSection === 'actors') {
          const maxActors = $gameParty.size();

          if (Input.isTriggered('down') || Input.isRepeated('down') || this.isKeyPressed('KeyS')) {
            if (maxActors > 0) {
              this._dndActorIndex = (this._dndActorIndex + 1) % maxActors;
              moved = true;
            }
          } else if (Input.isTriggered('up') || Input.isRepeated('up') || this.isKeyPressed('KeyW')) {
            if (maxActors > 0) {
              this._dndActorIndex = (this._dndActorIndex - 1 + maxActors) % maxActors;
              moved = true;
            }
          } else if ((Input.isTriggered('left') || this.isKeyPressed('KeyA')) && !this._singleJobMode) {
            this._dndFocusSection = 'list';
            this._detailsPanel.deactivateActorSelection();
            if (this._jobListWindow) this._jobListWindow.activate();
            moved = true;
            SoundManager.playCancel();
          } else if (Input.isTriggered('ok')) {
            this.confirmActorSelection();
          }
        }

        if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
          if (this._dndFocusSection === 'actors' && !this._singleJobMode) {
            this.retractActorSelection();
          } else {
            SoundManager.playCancel();
            this.popScene();
          }
        }

        if (moved) {
          this.refreshUIWorkDOM();
        }
      }

      // Sync details panel internally in the background
      if (!this._singleJobMode && this._jobListWindow) {
        const job = this._jobListWindow.item();
        const actor = $gameParty.members()[this._dndActorIndex] || $gameParty.leader();
        if (job && actor) {
          this._detailsPanel.setJob(job);
          this._detailsPanel.setActor(actor);
        }
      } else if (this._singleJobMode) {
        const actor = $gameParty.members()[this._dndActorIndex] || $gameParty.leader();
        if (actor) {
          this._detailsPanel.setActor(actor);
        }
      }
    }

    isKeyPressed(key) {
      // Input._currentState is keyed by mapped action name (e.g. 'up'), never by
      // physical codes like 'KeyW', so the old lookup was always undefined (dead).
      // Translate the physical key to the engine action bound to it and use the
      // same trigger+repeat test the arrows use.
      const codeToKeyCode = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68 };
      const keyCode = codeToKeyCode[key];
      const action = keyCode != null ? Input.keyMapper[keyCode] : null;
      return action ? (Input.isTriggered(action) || Input.isRepeated(action)) : false;
    }
  }

  // Three travellers at most, the ceiling character creation builds a party
  // to and the one Party Dynamics and CharacterCreationPresets both hold.
  const MAX_ACTIVE_PARTY = 3;

  // ============================================================================
  // Shifts away (window.WorkSystem.Shifts)
  //
  // Taking a contract no longer darkens the screen and skips the party's day
  // forward. The member who took it LEAVES: they are lifted out of the party
  // for the hours the job runs, the rest of the party carries on playing, and
  // the clock reaches the end of the shift on its own. Party Dynamics
  // (UI/CustomMainMenuLayout.js) lists them under Busy with the time still to
  // run, and when it runs out they come back to a free slot, or wait on the
  // bench when there is none.
  // ============================================================================

  const WorkShifts = {
    // Empty before a game is loaded: the menu and the map both ask early.
    list() {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return [];
      if (!$gameSystem._workShifts) $gameSystem._workShifts = [];
      return $gameSystem._workShifts;
    },

    entryFor(actorId) {
      return this.list().find(e => e.actorId === actorId) || null;
    },

    isBusy(actorId) {
      return !!this.entryFor(actorId);
    },

    // Minutes still to run, never below zero.
    remaining(entry) {
      if (!entry) return 0;
      return Math.max(0, entry.endMinute - getGameTimeMinutes());
    },

    // Send somebody off to work. Refused when they are the last one standing:
    // an empty party has nobody to play as, so that shift is worked the old
    // way, watched from behind the fade.
    dispatch(actor, job, remote) {
      if (!actor || !job) return false;
      const actorId = actor.actorId();
      if (this.isBusy(actorId)) return false;
      if (!$gameParty.members().some(m => m.actorId() === actorId)) return false;
      if ($gameParty.members().length <= 1) return false;

      const hours = Number(job.duration || job.hours || 0) || 0;
      if (hours <= 0) return false;

      const now = getGameTimeMinutes();
      this.list().push({
        actorId: actorId,
        job: job,
        remote: !!remote,
        startMinute: now,
        endMinute: now + Math.round(hours * 60)
      });

      // The roster ledger (NPC/NPCSystemParty.js) reads this: somebody at work
      // has not left the party, so no departure is written.
      $gameTemp._workShiftActorId = actorId;
      $gameParty.removeActor(actorId);
      $gameTemp._workShiftActorId = null;

      if (window.ParchmentToast) {
        window.ParchmentToast.show(T('WorkSystem.shift.dispatched', {
          actor: actor.name(),
          job: window.WorkSystem.jobName(job),
          hours: hours
        }), { severity: 'info', duration: 200 });
      }
      return true;
    },

    // Called once a frame from the map: whoever's hours are up comes home.
    update() {
      const list = this.list();
      if (list.length === 0) return;
      const now = getGameTimeMinutes();
      for (const entry of list.filter(e => e.endMinute <= now)) {
        this.finish(entry);
      }
    },

    // The shift is settled the moment it ends, wherever the party happens to
    // be: the hours are already gone off the clock, so only the pay, the wear
    // and the learning are applied here.
    finish(entry) {
      const list = this.list();
      const at = list.indexOf(entry);
      if (at >= 0) list.splice(at, 1);

      const actor = $gameActors.actor(entry.actorId);
      const job = entry.job;
      if (!actor || !job) return;

      const result = WorkManager.executeWork(actor, job, {});
      WorkManager.applyWorkEffects(actor, job, result, { timeAlreadyPassed: true });

      // applyWorkEffects only drains hunger and sleep when it is also the one
      // moving the clock, and here the hours passed while the party played.
      const hours = Number(job.duration || job.hours || 0) || 0;
      if (actor.reduceHunger !== undefined) {
        actor.reduceHunger(hours * HUNGER_PER_HOUR);
        actor.reduceSleep(hours * SLEEP_PER_HOUR);
      }

      const rejoined = $gameParty.members().length < MAX_ACTIVE_PARTY;
      if (rejoined) {
        $gameParty.addActor(entry.actorId);
      } else if (window.CharacterPresets && window.CharacterPresets.benchActorAsPreset) {
        // No seat left: they wait on the bench, where Party Dynamics can pick
        // them up again.
        window.CharacterPresets.benchActorAsPreset(actor, { retiredReason: 'work' }); // i18n-ignore: internal reason key
      }

      if (window.ParchmentToast) {
        const money = (result.pay / 100).toFixed(2);
        window.ParchmentToast.show(T(
          rejoined ? 'WorkSystem.shift.returned' : 'WorkSystem.shift.benched',
          { actor: actor.name(), job: window.WorkSystem.jobName(job), amount: money }
        ), { severity: result.pay >= 0 ? 'good' : 'warning', duration: 240 });
      }
    }
  };

  window.WorkSystem.Shifts = WorkShifts;

  // ============================================================================
  // Map Integration - Execute work on map
  // ============================================================================

  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update.call(this);

    if (this._remoteWork) {
      this.updateRemoteWorkSequence();
      return;
    }

    // Anybody away on a contract comes back the moment their hours are up,
    // whatever the party is doing at the time.
    WorkShifts.update();

    if ($gameTemp._pendingWork && !$gameMessage.isBusy() && !$gamePlayer.isMoving()) {
      this.processWork();
    }

    if ($gameTemp._workPendingBattle && !$gameMessage.isBusy() && !$gamePlayer.isMoving()
        && !this.isBusy() && !SceneManager.isSceneChanging()) {
      this.startWorkEventBattle();
    }
  };

  Scene_Map.prototype.processWork = function () {
    const workData = $gameTemp._pendingWork;
    $gameTemp._pendingWork = null;

    const actor = $gameActors.actor(workData.actorId);
    const job = workData.job;

    if (!actor || !job) return;

    // Start work sequence
    if (workData.remote) {
      this.startRemoteWorkSequence(actor, job);
    } else {
      this.startWorkSequence(actor, job);
    }
  };

  // ============================================================================
  // Remote work - the shift is worked from wherever the party is standing, over
  // the Hypernet, so there is nothing to watch but the hours going by. The clock
  // is therefore stepped forward a slice per frame the way a night's sleep is
  // (TimeDateSystem's _stepSleepAdvance), which keeps the map-info card up with
  // the date, the time and the party's needs all moving in real time.
  // ============================================================================

  // The whole shift plays out over this many frames whatever its length, so a
  // four-hour job and a twelve-hour one both take about two and a half seconds.
  const REMOTE_WORK_FRAMES = 150;

  Scene_Map.prototype.startRemoteWorkSequence = function (actor, job) {
    // Flagged for the travel window (TimeDateSystem's MapInfoHUD): the clock
    // is about to run fast behind the darkened screen, so the card shows.
    this._workSequenceActive = true;

    $gamePlayer.setMoveSpeed(0);

    if (settings.workSoundEffect) {
      AudioManager.playSe({
        name: settings.workSoundEffect,
        volume: 90,
        pitch: 100,
        pan: 0
      });
    }

    $gameScreen.startFadeOut(settings.workFadeDuration);

    // Hold until the screen is actually dark before the hours start moving.
    this._remoteWork = { actor: actor, job: job, wait: settings.workFadeDuration, advance: null };
  };

  Scene_Map.prototype.updateRemoteWorkSequence = function () {
    const s = this._remoteWork;
    if (!s) return;

    if (s.wait > 0) {
      s.wait--;
      return;
    }
    if (!s.advance) {
      this._beginRemoteWorkAdvance(s);
      return;
    }
    this._stepRemoteWorkAdvance(s);
  };

  Scene_Map.prototype._beginRemoteWorkAdvance = function (s) {
    const totalMinutes = s.job.duration * 60;
    const startTime = getGameTimeMinutes();

    s.advance = {
      totalMinutes: totalMinutes,
      doneMinutes: 0,
      minutesPerFrame: totalMinutes / REMOTE_WORK_FRAMES,
      startTime: startTime,
      // NPC schedules still tick once per simulated hour as the shift passes.
      nextNpcTick: startTime + 60,
    };
  };

  Scene_Map.prototype._stepRemoteWorkAdvance = function (s) {
    const a = s.advance;

    const prevDone = a.doneMinutes;
    a.doneMinutes = Math.min(a.totalMinutes, a.doneMinutes + a.minutesPerFrame);
    const deltaMin = a.doneMinutes - prevDone;
    const currentTime = a.startTime + a.doneMinutes;

    setGameTimeMinutes(Math.floor(currentTime));
    this._runRemoteWorkNpcTicks(a, currentTime);

    // The same wear the shift costs in applyWorkEffects, paid by the minute
    // instead of in one bite at the end so the bars visibly drop.
    const actor = s.actor;
    if (actor && actor.reduceHunger !== undefined) {
      actor.reduceHunger((HUNGER_PER_HOUR / 60) * deltaMin);
      actor.reduceSleep((SLEEP_PER_HOUR / 60) * deltaMin);
    }

    // Push the new state to the card immediately this frame.
    if (this._mapInfoHUD && this._mapInfoHUD._refresh) {
      this._mapInfoHUD._refresh();
    }

    if (a.doneMinutes >= a.totalMinutes) {
      this._finishRemoteWorkAdvance(s);
    }
  };

  Scene_Map.prototype._runRemoteWorkNpcTicks = function (a, upTo) {
    while (a.nextNpcTick <= upTo) {
      if (window.NPCSim?.tick) {
        try { window.NPCSim.tick(a.nextNpcTick); } catch (_) {}
      }
      a.nextNpcTick += 60;
    }
  };

  Scene_Map.prototype._finishRemoteWorkAdvance = function (s) {
    const a = s.advance;
    this._remoteWork = null;

    // Snap the clock to the exact end of the shift, finish the hourly NPC ticks,
    // then resolve background NPC life events across the whole shift in one pass.
    const endTime = a.startTime + a.totalMinutes;
    setGameTimeMinutes(endTime);
    this._runRemoteWorkNpcTicks(a, endTime);
    if (window.NPCLifeSim?.catchUp) {
      try { window.NPCLifeSim.catchUp(endTime); } catch (_) {}
    }

    const actor = s.actor;
    const job = s.job;
    // The hours are spent; how they went is thrown for over the dark screen.
    WorkManager.resolveWork(actor, job, { remote: true }, (result) => {
      if (SceneManager._scene !== this) return;
      WorkManager.applyWorkEffects(actor, job, result, { timeAlreadyPassed: true });

      // The shift itself is over; the travel window drops with the fade-in.
      this._workSequenceActive = false;

      $gameScreen.startFadeIn(settings.workFadeDuration);
      $gamePlayer.setMoveSpeed(4);

      setTimeout(() => {
        // Guard against a transfer swapping in a fresh Scene_Map mid-fade.
        if (SceneManager._scene !== this) return;
        this.displayWorkResult(actor, job, result);
      }, (settings.workFadeDuration / 60) * 1000);
    });
  };

  // The party is at the terminal for the whole shift: no walking off behind the
  // darkened screen while the clock runs.
  const _Game_Player_canMove_Work = Game_Player.prototype.canMove;
  Game_Player.prototype.canMove = function () {
    const scene = SceneManager._scene;
    if (scene instanceof Scene_Map && scene._remoteWork) return false;
    return _Game_Player_canMove_Work.call(this);
  };

  Scene_Map.prototype.startWorkSequence = function (actor, job) {
    // The shift is worked by one member while the rest of the party carries
    // on: nothing fades, nothing is skipped. Only a party that cannot spare
    // anybody falls through to the old watched-from-the-dark sequence below.
    if (WorkShifts.dispatch(actor, job)) return;

    // Flagged for the travel window (TimeDateSystem's MapInfoHUD): the clock
    // is about to run fast behind the darkened screen, so the card shows.
    this._workSequenceActive = true;

    // Disable player movement
    $gamePlayer.setMoveSpeed(0);

    // Play work sound effect
    if (settings.workSoundEffect) {
      AudioManager.playSe({
        name: settings.workSoundEffect,
        volume: 90,
        pitch: 100,
        pan: 0
      });
    }

    // Fade out screen
    $gameScreen.startFadeOut(settings.workFadeDuration);

    // Wait for fade, then process work
    setTimeout(() => {
      // A map transfer during the fade/work delay swaps in a fresh Scene_Map;
      // don't run work on a stale scene instance.
      if (SceneManager._scene !== this) return;
      this.executeWork(actor, job);
    }, (settings.workFadeDuration / 60) * 1000 + settings.workDuration / 60 * 1000);
  };

  Scene_Map.prototype.executeWork = function (actor, job) {
    // Throw for the shift over the darkened screen, then settle it.
    WorkManager.resolveWork(actor, job, {}, (result) => {
      if (SceneManager._scene !== this) return;

      // Apply effects
      WorkManager.applyWorkEffects(actor, job, result);

      // The shift itself is over; the travel window drops with the fade-in.
      this._workSequenceActive = false;

      // Fade back in
      $gameScreen.startFadeIn(settings.workFadeDuration);

      // Re-enable player movement
      $gamePlayer.setMoveSpeed(4);

      // Display result messages
      setTimeout(() => {
        // Guard against a transfer swapping in a fresh Scene_Map mid-fade.
        if (SceneManager._scene !== this) return;
        this.displayWorkResult(actor, job, result);
      }, (settings.workFadeDuration / 60) * 1000);
    });
  };

  Scene_Map.prototype.displayWorkResult = function (actor, job, result) {
    const jobName = window.WorkSystem.jobName(job);

    // Work complete message
    window.skipLocalization = true;
    $gameMessage.add(T('WorkSystem.finishedWorking', { actor: actor.name(), job: jobName }));
    window.skipLocalization = false;

    // Outcome message
    window.skipLocalization = true;
    $gameMessage.add(result.message);
    window.skipLocalization = false;

    // What made this shift worth talking about, if anything did.
    if (result.event) {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.event.' + result.event.id, { actor: actor.name() }));
      window.skipLocalization = false;
    }

    // Pay information
    if (result.pay > 0) {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.earned', { amount: (result.pay / 100).toFixed(2) }));
      window.skipLocalization = false;
    } else if (result.pay < 0) {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.lost', { amount: (Math.abs(result.pay) / 100).toFixed(2) }));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.noPay'));
      window.skipLocalization = false;
    }

    // Break out what the wardrobe and the event were worth, so the player can
    // see the aesthetic stats doing something rather than having to infer it.
    // Outside the branch above on purpose: a shift docked into the red still
    // owes the player the reason.
    if (result.lookBonus > 0) {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.lookBonus', { amount: (result.lookBonus / 100).toFixed(2) }));
      window.skipLocalization = false;
    }
    if (result.eventPay > 0) {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.eventBonus', { amount: (result.eventPay / 100).toFixed(2) }));
      window.skipLocalization = false;
    } else if (result.eventPay < 0) {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.eventPenalty', { amount: (Math.abs(result.eventPay) / 100).toFixed(2) }));
      window.skipLocalization = false;
    }

    // Damage information
    if (result.hpDamage > 0) {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.hpDamage', { amount: result.hpDamage }));
      window.skipLocalization = false;
    }
    if (result.mpDamage > 0) {
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.mpDamage', { amount: result.mpDamage }));
      window.skipLocalization = false;
    }

    // Status effects
    if (result.statuses.length > 0) {
      // result.statuses holds raw status names (e.g. "Nausea") or numeric ids,
      // mirroring applyWorkEffects. Resolve each to a state and use its display
      // name, falling back to the raw label when it can't be mapped.
      const stateNames = result.statuses.map(status => {
        const stateId = window.WorkSystem.resolveStatusId(status);
        const state = stateId && $dataStates[stateId];
        return (state && state.name) || String(status);
      }).join(', ');
      window.skipLocalization = true;
      $gameMessage.add(T('WorkSystem.afflicted', { states: stateNames }));
      window.skipLocalization = false;
    }

    // Time passed
    window.skipLocalization = true;
    $gameMessage.add(T('WorkSystem.hoursPassed', { hours: job.duration }));
    window.skipLocalization = false;

    // The fight comes after the shift is reported, once the player has read
    // through: Scene_Map.update picks it up when the message window clears.
    if (result.battle) {
      $gameTemp._workPendingBattle = { troopId: result.battle.troopId, reward: result.battle.reward || 0 };
    }
  };

  // A work event that turned into a fight. Escapable and losable both: a shift
  // that goes wrong should cost the party the hazard pay, not the game.
  Scene_Map.prototype.startWorkEventBattle = function () {
    const pending = $gameTemp._workPendingBattle;
    $gameTemp._workPendingBattle = null;
    if (!pending || !pending.troopId) return;

    BattleManager.setup(pending.troopId, true, true);
    BattleManager.setEventCallback((battleResult) => {
      // 0 is victory; escaping or being beaten pays nothing.
      if (battleResult === 0 && pending.reward > 0) {
        $gameParty.gainGold(pending.reward);
        const line = T('WorkSystem.hazardPay', { amount: (pending.reward / 100).toFixed(2) });
        if (window.ParchmentToast) {
          window.ParchmentToast.show(line, { severity: 'good' });
        } else {
          window.skipLocalization = true;
          $gameMessage.add(line);
          window.skipLocalization = false;
        }
      }
    });
    SceneManager.push(Scene_Battle);
  };

  // ============================================================================
  // Plugin Commands
  // ============================================================================

  PluginManager.registerCommand(pluginName, "OpenWorkMenu", args => {
    SceneManager.push(Scene_Work);
  });

  PluginManager.registerCommand(pluginName, "OpenWorkMenuCategory", args => {
    $gameTemp._workCategory = args.category;
    SceneManager.push(Scene_Work);
  });

  PluginManager.registerCommand(pluginName, "ShowSingleJob", args => {
    $gameTemp._singleJobId = Number(args.jobId);
    SceneManager.push(Scene_Work);
  });

  // ============================================================================
  // Add Work option to main menu (optional - can be enabled via menu command)
  // ============================================================================

  // Published so callers outside this file can reach the scene; AutoIdleExplorer gates
  // its "take a job" entry on it being present.
  window.Scene_Work = Scene_Work;

  // Uncomment below to add "Work" to main menu
  /*
  const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
  Window_MenuCommand.prototype.addOriginalCommands = function() {
    _Window_MenuCommand_addOriginalCommands.call(this);
    this.addCommand("Work", "work", true);
  };

  const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
  Scene_Menu.prototype.createCommandWindow = function() {
    _Scene_Menu_createCommandWindow.call(this);
    this._commandWindow.setHandler("work", this.commandWork.bind(this));
  };

  Scene_Menu.prototype.commandWork = function() {
    SceneManager.push(Scene_Work);
  };
  */

})();
