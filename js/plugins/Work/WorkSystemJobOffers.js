/*:
 * @target MZ
 * @plugindesc v1.0.0 Job Offers Menu - Browse available jobs with locations
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help WorkSystemJobOffers.js
 * === Job Offers Menu v1.0.0 ===
 *
 * Adds a "Job Offers" menu command that shows random available jobs.
 * Displays job details including duration, hourly pay, and locations.
 *
 * Requirements:
 * - DataService.js must be loaded first
 *
 * --- Plugin Commands ---
 *
 * @command openJobOffers
 * @text Open Job Offers Menu
 * @desc Opens the Job Offers browser showing random available jobs.
 *
 * @param numberOfJobs
 * @text Number of Jobs Shown
 * @type number
 * @min 3
 * @max 20
 * @default 8
 * @desc How many random jobs to display in the Job Offers menu
 *
 * @param showInMenu
 * @text Show in Main Menu
 * @type boolean
 * @default true
 * @desc Add "Job Offers" command to main menu
 *
 * @param menuCommandName
 * @text Menu Command Name
 * @type text
 * @default Job Offers
 * @desc Name of the menu command (English)
 *
 * @param menuCommandName_IT
 * @text Menu Command Name (Italian)
 * @type text
 * @default Offerte di Lavoro
 * @desc Name of the menu command (Italian)
 */

(() => {
  'use strict';

  const pluginName = "WorkSystemJobOffers";
  const parameters = PluginManager.parameters(pluginName);
  const numberOfJobs = Number(parameters['numberOfJobs'] || 8);
  const showInMenu = parameters['showInMenu'] === 'true';

  //=============================================================================
  // Location labels
  //=============================================================================
  // A job's locations are raw map ids. They read as "<map group> - <map name>":
  // the first half is the map's <MapGroup: Name> note tag (resolved through
  // NPCSystem's group registry, which is what the rest of the game reads for
  // town membership), the second half is the map's own display name. Reading a
  // display name means parsing that map's JSON, so every answer is memoized for
  // the session, per language.
  const _locationLabels = {};

  // Display name off the map itself, falling back to the MapInfos name with the
  // editor's numbering prefix stripped ("705 - North Docks" -> "North Docks").
  function mapDisplayName(mapId) {
    let data = null;
    if (typeof $dataMap !== 'undefined' && $dataMap && $dataMap.id === mapId) data = $dataMap;
    else if (window.NPCSystem && window.NPCSystem.loadMapData) {
      try { data = window.NPCSystem.loadMapData(mapId); } catch (e) { data = null; }
    }
    if (data && data.displayName) return data.displayName;

    const info = (typeof $dataMapInfos !== 'undefined' && $dataMapInfos) ? $dataMapInfos[mapId] : null;
    const name = (info && info.name) ? String(info.name) : '';
    const stripped = name.replace(/^\s*[A-Za-z]{0,2}\d+\s*-\s*/, '').trim();
    return stripped || name.trim();
  }

  // Readable name of the group the map belongs to, "" when it belongs to none.
  function mapGroupLabel(mapId) {
    let groupName = null;
    try {
      if (window.NPCSystem && window.NPCSystem.findMapGroupByMap) {
        groupName = window.NPCSystem.findMapGroupByMap(mapId);
      }
    } catch (e) { groupName = null; }
    if (!groupName) return '';

    // Procedural settlements ("Proc:x,y") carry their own readable label.
    const grp = (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._npcMapGroups)
      ? $gameSystem._npcMapGroups[groupName] : null;
    if (grp && grp.displayName) return grp.displayName;
    if (/^Proc:/i.test(groupName)) return '';

    // Group keys are written without spaces ("FrozenStation"); the town of that
    // name in Destinations.json knows how it is meant to read.
    return (window.WorkSystem && window.WorkSystem.destinationName)
      ? window.WorkSystem.destinationName(groupName) : groupName;
  }

  function locationLabel(mapId) {
    const id = Number(mapId);
    if (!Number.isFinite(id) || id <= 0) return String(mapId == null ? '' : mapId);

    const lang = (typeof ConfigManager !== 'undefined' && ConfigManager.language) || 'en';
    const cacheKey = `${lang}:${id}`;
    if (_locationLabels[cacheKey]) return _locationLabels[cacheKey];

    const location = mapDisplayName(id);
    const group = mapGroupLabel(id);
    let label;
    if (group && location) label = T('WorkSystem.locationInGroup', { group: group, location: location });
    else label = location || group || T('WorkSystem.mapNumbered', { id: id });

    _locationLabels[cacheKey] = label;
    return label;
  }

  window.WorkSystem = window.WorkSystem || {};
  window.WorkSystem.locationLabel = locationLabel;

  //=============================================================================
  // Plugin Commands
  //=============================================================================

  PluginManager.registerCommand(pluginName, "openJobOffers", args => {
    SceneManager.push(Scene_JobOffers);
  });

  if (window.HypernetOS) {
    window.HypernetOS.registerApp({
      id: 'app-job-offers',
      name: T('WorkSystem.jobBoardApp'),
      icon: 244,
      launchFn: function() {
        if (window.HypernetJobsApp) {
          window.HypernetJobsApp.launch();
        } else {
          SceneManager.push(Scene_JobOffers);
        }
      },
      desktopShortcut: true
    });
  }

  //=============================================================================
  // Window_MenuCommand - Add Job Offers to main menu
  //=============================================================================



  //=============================================================================
  // Scene_JobOffers - Main job offers scene
  //=============================================================================

  // --- HypernetJobsApp ---
  window.HypernetJobsApp = {
    appInstance: null,
    win: null,
    launch: function(params) {
      if (!window.HypernetWindowManager) return;
      
      if (!this.win || !document.getElementById('app-job-offers')) {
        this.win = window.HypernetWindowManager.createWindow({
          id: 'app-job-offers',
          title: T('WorkSystem.jobBoardApp'),
          icon: 244,
          width: 950,
          height: 600,
          contentHTML: '<div class="job-offers-host" id="job-offers-content"></div>'
        });

        this.appInstance = new Scene_JobOffers();
        this.appInstance._isAppMode = true;
        this.appInstance.create();
        
        this.win.addEventListener('hypernet-closed', () => {
          if (this.appInstance) {
            this.appInstance.terminate();
            this.appInstance = null;
          }
          this.win = null;
        });
      } else {
        window.HypernetWindowManager.bringToFront(this.win);
      }
    },
    update: function() {
      if (this.appInstance && this.win) {
        if (this.win.classList.contains('active')) {
          this.appInstance.update();
        }
      }
    }
  };

  class Scene_JobOffers extends Scene_MenuBase {
    create() {
      super.create();
      this.createJobListWindow();
      this.createDetailWindow();

      // Hide native windows to display DOM
      if (this._jobListWindow) this._jobListWindow.visible = false;
      if (this._detailWindow) this._detailWindow.visible = false;

      this._dndFocusSection = 'list';
      this._dndActorIndex = 0;

      this.createUIJobOffersDOM();
      // Populate the DOM immediately. In app mode update() bails out early (the
      // OS focus ring drives input), so without this initial render the window
      // would stay blank until a navigation event fired.
      this.refreshUIJobOffersDOM();
    }

    createJobListWindow() {
      const rect = new Rectangle(0, 0, 0, 0);
      this._jobListWindow = new Window_JobOffersList(rect);
      this.addWindow(this._jobListWindow);
    }

    createDetailWindow() {
      const rect = new Rectangle(0, 0, 0, 0);
      this._detailWindow = new Window_JobDetails(rect);
      this._jobListWindow.setDetailWindow(this._detailWindow);
      this.addWindow(this._detailWindow);
    }

    onJobOk() {
      // Handled by custom D&D navigation
    }

    onActorSelected(actor, remote) {
      const job = this._jobListWindow.currentJob();
      if (job && actor) {
        this.startWork(actor, job, remote);
      }
    }

    startWork(actor, job, remote) {
      // Store work data and return to map
      $gameTemp._pendingWork = {
        actorId: actor.actorId(),
        job: job,
        remote: !!remote
      };
      this.popScene();

      // A remote shift is worked from wherever the party is standing, right
      // now, so the OS has to be left as well: the hours only run on the map,
      // where the travel card can show them passing.
      if (remote) this.leaveHypernetOS();
    }

    leaveHypernetOS() {
      const scene = SceneManager._scene;
      if (window.Scene_HypernetOS && scene instanceof window.Scene_HypernetOS) {
        scene.popScene();
      }
    }

    popScene() {
      if (this._isAppMode) {
        if (window.HypernetJobsApp && window.HypernetJobsApp.win) {
          window.HypernetWindowManager.closeWindow(window.HypernetJobsApp.win);
        }
        return;
      }
      super.popScene();
    }

    terminate() {
      if (!this._isAppMode) super.terminate();
      if (this._dndContainer) {
        const container = this._dndContainer;
        container.classList.add("joboffers-leaving");
        setTimeout(() => {
          if (container && container.parentNode) {
            container.parentNode.removeChild(container);
          }
        }, 200);
        this._dndContainer = null;
      }
    }

    createUIJobOffersDOM() {
      this._dndContainer = document.createElement('div');
      this._dndContainer.classList.add('joboffers-root');

      if (this._isAppMode) {
        const parent = document.getElementById('job-offers-content');
        if (parent) {
          // No id="menu-container" here: that id carries the fullscreen
          // parchment frame, which paints a dark border inside an OS window
          // and makes the board the one app that does not look like Archways.
          // In the OS the board wears the shell's own chrome instead.
          this._dndContainer.classList.add('xp-app', 'joboffers-xp');
          parent.appendChild(this._dndContainer);
          return;
        }
      }

      // Only the fullscreen scene is the parchment menu, so only it takes the id.
      this._dndContainer.id = 'menu-container';

      // Standalone the board IS the screen; in a Hypernet window it fills the
      // window. Both looks are in the stylesheet, off one class.
      this._dndContainer.classList.add('joboffers-standalone');
      document.body.appendChild(this._dndContainer);
    }

    refreshUIJobOffersDOM() {
      if (!this._dndContainer) return;

      const jobs = this._jobListWindow ? this._jobListWindow._data : [];
      const selectedIndex = this._jobListWindow ? this._jobListWindow.index() : 0;
      const selectedJob = jobs[selectedIndex] || null;

      const actors = $gameParty.members();
      const selectedActor = actors[this._dndActorIndex] || actors[0];

      // One markup, both modes. The left page always lists the offers; the
      // right page reads the contract, or the roster once a job is being
      // filled. The two pages of the screen are the tab strip.
      const rightPageHTML = this._dndFocusSection === 'actors'
        ? this.getActorSelectionHTML(actors, this._dndActorIndex, selectedJob)
        : this.getJobOfferContractHTML(selectedJob, selectedActor);

      this._dndContainer.innerHTML = `
        <div class="book-spread joboffers-spread">
          <div class="left-page">
            ${this.getJobsOffersBoardHTML(jobs, selectedIndex)}
          </div>
          <div class="right-page">
            ${rightPageHTML}
          </div>
        </div>`;

      this.applyActorFaces();

      // Scroll whatever the cursor is on into view.
      setTimeout(() => {
        if (!this._dndContainer) return;
        ['#jobs-list', '#roster-list'].forEach(sel => {
          const listEl = this._dndContainer.querySelector(sel);
          if (!listEl) return;
          const selectedEl = listEl.querySelector('.selected');
          if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }, 50);
    }

    // A candidate's portrait is data (a file name and a size), so it is handed
    // to the stylesheet as custom properties rather than written into markup.
    applyActorFaces() {
      if (!this._dndContainer) return;
      this._dndContainer.querySelectorAll('.job-face[data-size]').forEach(el => {
        el.style.setProperty('--job-face-size', el.dataset.size + 'px');
        if (el.dataset.face) {
          el.style.setProperty('--job-face-img', window.UIPanel.assetUrl(`img/busts/${el.dataset.face}.png`));
        }
      });
    }

    // The two pages of this screen, as the shared tab strip.
    getSectionTabsHTML(sref, hasJob) {
      const tab = (key, label, on) =>
        `<div class="backpack-tab${this.xpc('xp-tab')}${on ? ' selected active' : ''} focusable" tabindex="0"` +
        ` data-focus-key="tab-${key}" onclick="${sref}.showSection('${key}')">${label}</div>`;
      return `<div class="backpack-tabs${this.xpc('xp-tabs')}">
        ${tab('list', T('WorkSystem.jobBoardOffers'), this._dndFocusSection === 'list')}
        ${hasJob ? tab('actors', T('WorkSystem.candidateRoster'), this._dndFocusSection === 'actors') : ''}
      </div>`;
    }

    showSection(key) {
      if (key === this._dndFocusSection) return;
      if (key === 'actors') { this.openCandidateRoster(); return; }
      this.retractActorSelection();
    }

    getJobsOffersBoardHTML(jobs, selectedIndex) {
      // In OS app mode the active RMMZ scene is Scene_HypernetOS (no job
      // handlers), so inline onclicks must target the live app instance.
      const sref = this._isAppMode ? 'window.HypernetJobsApp.appInstance' : 'SceneManager._scene';

      let listHTML = "";
      if (jobs.length === 0) {
        listHTML = `<div class="ui-empty${this.xpc('xp-empty')}"><div class="ui-empty-text">${T('WorkSystem.noJobOffersCurrentlyAvailable')}</div></div>`;
      } else {
        jobs.forEach((job, idx) => {
          const isSelected = idx === selectedIndex;
          const jobName = window.WorkSystem.jobName(job);
          const hourlyPay = Math.round(job.basePay / job.duration);
          listHTML += `
            <div class="item-slot job-item focusable ${isSelected ? 'selected' : ''}" tabindex="0"
                 data-focus-key="job-${idx}" onclick="${sref}.selectJobItem(${idx})">
              <div class="job-item-info">
                <span class="job-item-name">${jobName}</span>
                <span class="job-item-meta">${window.WorkSystem.jobCategoryLabel(job)} &middot; ${job.duration}h ${this.getRemoteTagHTML(job)}</span>
              </div>
              <div class="job-item-pay">${(hourlyPay / 100).toFixed(2)}&euro;/hr</div>
            </div>`;
        });
      }

      return `
        <div class="page-header-bar">
          <div class="back-button${this.xpc('xp-btn')} focusable" tabindex="0" data-focus-key="back-btn" onclick="${sref}.popScene()">
            ${T('WorkSystem.dismiss')}
          </div>
          <h2 class="title">${T('WorkSystem.jobBoardOffers')}</h2>
        </div>
        ${this.getSectionTabsHTML(sref, !!jobs[selectedIndex])}
        <div class="ui-list ui-scroll${this.xpc('xp-list')}" id="jobs-list">${listHTML}</div>`;
    }

    getLocationName(mapId) {
      return locationLabel(mapId);
    }

    getJobOfferContractHTML(job, actor) {
      if (!job) {
        return `<div class="ui-empty${this.xpc('xp-empty')}"><div class="ui-empty-text">${T('WorkSystem.selectAJobOfferTo')}</div></div>`;
      }

      const jobName = window.WorkSystem.jobName(job);
      const description = window.WorkSystem.jobDescription(job);

      const reqCheck = window.WorkSystem.meetsRequirements(actor, job);
      const chancePercent = Math.floor(window.WorkSystem.calculateSuccessChance(actor, job) * 100);
      const chanceClass = chancePercent >= 70 ? "chance--good"
        : chancePercent >= 40 ? "chance--fair" : "chance--poor";

      const statKeyMapping = window.WorkSystem && window.WorkSystem.statKeyMapping ? window.WorkSystem.statKeyMapping : {};
      const _si18n = window.WorkSystem && window.WorkSystem.si18n ? window.WorkSystem.si18n : (k) => k;

      let requirementsHTML = "";
      for (const [stat, required] of Object.entries(job.requirements)) {
        const actorValue = window.WorkSystem.getActorStat(actor, stat);
        const meetsReq = actorValue >= required;
        const mappedName = statKeyMapping[stat] || stat;
        requirementsHTML += `
          <div class="inspect-spec-row job-req ${meetsReq ? 'req--met' : 'req--unmet'}">
            <span class="inspect-spec-label">${_si18n(mappedName)}</span>
            <span class="inspect-spec-value">${actorValue} / ${required}</span>
          </div>`;
      }

      const locationsHTML = (job.locations && job.locations.length > 0)
        ? `<div class="inspect-section-title">${T('WorkSystem.availableLocations')}</div>
           <div class="ui-chip-row">
             ${job.locations.map(loc => `<span class="ui-chip">${this.getLocationName(loc)}</span>`).join('')}
           </div>`
        : "";

      const factionRow = (job.factionId !== undefined && job.factionId !== null)
        ? `<div class="inspect-spec-row">
             <span class="inspect-spec-label">${T('WorkSystem.faction')}</span>
             <span class="inspect-spec-value">${this._detailWindow.getFactionName(job.factionId)}</span>
           </div>`
        : "";

      return `
        <div class="ui-detail job-contract">
          <div class="ui-detail-head">
            <div class="ui-detail-titles">
              <h3 class="job-contract-title">${jobName}</h3>
              <div class="job-contract-kicker">${T('WorkSystem.proposalContract')}</div>
            </div>
          </div>
          <div class="ui-detail-scroll ui-scroll">
            <div class="ui-prose job-contract-brief">${description}</div>
            <div class="inspect-spec-grid">
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${T('WorkSystem.categoryLabel')}</span>
                <span class="inspect-spec-value">${window.WorkSystem.jobCategoryLabel(job)}</span>
              </div>
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${T('WorkSystem.duration')}</span>
                <span class="inspect-spec-value">${T('WorkSystem.hoursValue', { hours: job.duration })}</span>
              </div>
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${T('WorkSystem.hourlyRate')}</span>
                <span class="inspect-spec-value">&euro;${(job.basePay / job.duration / 100).toFixed(2)}</span>
              </div>
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${T('WorkSystem.totalReward')}</span>
                <span class="inspect-spec-value job-reward">&euro;${(job.basePay / 100).toFixed(2)}</span>
              </div>
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${T('WorkSystem.remoteWorkLabel')}</span>
                <span class="inspect-spec-value ${this.isRemoteJob(job) ? 'req--met' : 'req--unmet'}">
                  ${this.isRemoteJob(job) ? T('WorkSystem.remoteAvailable') : T('WorkSystem.remoteOnSiteOnly')}
                </span>
              </div>
              ${factionRow}
            </div>
            ${locationsHTML}
            <div class="inspect-section-title">${T('WorkSystem.requiredStats')} (${actor.name()})</div>
            <div class="inspect-spec-grid${this.xpc('xp-group')}">${requirementsHTML}</div>
            <div class="inspect-spec-row">
              <span class="inspect-spec-label">${T('WorkSystem.estimatedSuccessRate')}</span>
              <span class="inspect-spec-value ${chanceClass}">${chancePercent}%</span>
            </div>
            ${!reqCheck.meets
              ? `<div class="ui-prose job-deficit">${T('WorkSystem.deficitWarning')}</div>` : ''}
          </div>
          ${this.getPartyImpactHTML()}
          ${this.getChooseCandidateButtonHTML()}
        </div>`;
    }

    // The way off the contract page and onto the roster, where a job is
    // actually taken. Without it the board is a dead end for anyone not
    // driving the scene from the keyboard: in the OS app the focus ring is the
    // only input, and it has nothing to press until this button exists.
    getChooseCandidateButtonHTML() {
      if (this._dndFocusSection !== 'list') return '';
      const sref = this._isAppMode ? 'window.HypernetJobsApp.appInstance' : 'SceneManager._scene';
      return `<div class="inspect-actions${this.xpc('xp-row-right')}">
        <div class="inspect-btn${this.xpc('xp-btn')} focusable" tabindex="0" data-focus-key="choose-btn"
             onclick="${sref}.openCandidateRoster()">${T('WorkSystem.chooseCandidate')}</div>
      </div>`;
    }

    // A job that can be done down the wire gets a second way to take it: the
    // same contract, worked from wherever the party is standing. Jobs that
    // cannot are simply not offered the button.
    isRemoteJob(job) {
      return !!(job && job.remote);
    }

    getRemoteWorkButtonHTML(job, sref) {
      if (!this.isRemoteJob(job)) return '';
      return `<div class="inspect-btn${this.xpc('xp-btn')} focusable" tabindex="0" data-focus-key="remote-btn"
                   onclick="${sref}.confirmRemoteWork()">${T('WorkSystem.remoteWork')}</div>`;
    }

    // Small "remote" chip for the board listing, so the offers that can be
    // taken without leaving the terminal are picked out at a glance.
    getRemoteTagHTML(job) {
      if (!this.isRemoteJob(job)) return '';

      return `<span class="job-remote-tag">${T('WorkSystem.remoteTag')}</span>`;
    }

    getActorFaceHTML(actor, size = 64) {
      const faceName = actor.faceName();
      if (!faceName) {
        return `<div class="job-face job-face--initial" data-size="${size}">${actor.name().charAt(0)}</div>`;
      }
      return `<div class="job-face" data-size="${size}" data-face="${faceName}"></div>`;
    }

    getActorRequirementDetailHTML(actor, job) {
      const statKeyMapping = window.WorkSystem && window.WorkSystem.statKeyMapping ? window.WorkSystem.statKeyMapping : {};
      const _si18n = window.WorkSystem && window.WorkSystem.si18n ? window.WorkSystem.si18n : (k) => k;

      let html = "";
      for (const [stat, required] of Object.entries(job.requirements)) {
        const actorValue = window.WorkSystem.getActorStat(actor, stat);
        const isMet = actorValue >= required;
        const mappedName = statKeyMapping[stat] || stat;
        const statLabel = _si18n(mappedName);

        html += `
          <div class="job-req-mini ${isMet ? 'req--met' : 'req--unmet'}">
            <span>${statLabel}</span>
            <span>${actorValue} / ${required}</span>
          </div>`;
      }
      return html;
    }

    getActorSelectionHTML(actors, selectedActorIndex, selectedJob) {
      const sref = this._isAppMode ? 'window.HypernetJobsApp.appInstance' : 'SceneManager._scene';

      const listHTML = actors.map((actor, idx) => {
        const isSelected = idx === selectedActorIndex;
        const chancePercent = Math.floor(window.WorkSystem.calculateSuccessChance(actor, selectedJob) * 100);
        const chanceClass = chancePercent >= 70 ? "chance--good"
          : chancePercent >= 40 ? "chance--fair" : "chance--poor";
        return `
          <div class="item-slot roster-item focusable ${isSelected ? 'selected' : ''}" tabindex="0"
               data-focus-key="actor-${idx}" onclick="${sref}.selectActorItem(${idx})">
            ${this.getActorFaceHTML(actor, 44)}
            <div class="roster-item-info">
              <div class="roster-item-head">
                <strong class="roster-item-name">${actor.name()}</strong>
                <span class="roster-item-chance ${chanceClass}">${T('WorkSystem.successRatePct', { pct: chancePercent })}</span>
              </div>
              <div class="roster-item-reqs">${this.getActorRequirementDetailHTML(actor, selectedJob)}</div>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="ui-detail job-roster">
          <div class="ui-detail-head">
            <div class="ui-detail-titles">
              <h3 class="job-contract-title">${T('WorkSystem.candidateRoster')}</h3>
            </div>
          </div>
          <div class="ui-detail-scroll ui-scroll${this.xpc('xp-list')}" id="roster-list">${listHTML}${this.getAwayRosterHTML()}</div>
          <div class="inspect-actions${this.xpc('xp-row-right')}">
            <div class="inspect-btn${this.xpc('xp-btn default')} focusable" tabindex="0" data-focus-key="accept-btn"
                 onclick="${sref}.confirmActorSelection()">${T('WorkSystem.acceptJobOffer')}</div>
            ${this.getRemoteWorkButtonHTML(selectedJob, sref)}
            <div class="inspect-btn inspect-btn--secondary${this.xpc('xp-btn')} focusable" tabindex="0"
                 onclick="${sref}.retractActorSelection()">${T('WorkSystem.retractCandidate')}</div>
          </div>
        </div>`;
    }

    selectJobItem(index) {
      if (this._jobListWindow) {
        this._jobListWindow.select(index);
        this._dndFocusSection = 'list';
        SoundManager.playOk();
        this.refreshUIJobOffersDOM();
      }
    }

    openCandidateRoster() {
      if (!this._jobListWindow || !this._jobListWindow.currentJob()) {
        SoundManager.playBuzzer();
        return;
      }
      this._dndFocusSection = 'actors';
      this._dndActorIndex = 0;
      SoundManager.playOk();
      this.refreshUIJobOffersDOM();
    }

    selectActorItem(index) {
      this._dndActorIndex = index;
      this._dndFocusSection = 'actors';
      SoundManager.playOk();
      this.refreshUIJobOffersDOM();
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

    // Same contract, worked over the Hypernet instead of on site. Only offered
    // for the jobs that carry "remote": true in Jobs.json.
    confirmRemoteWork() {
      const job = this._jobListWindow ? this._jobListWindow.currentJob() : null;
      const actor = $gameParty.members()[this._dndActorIndex];
      if (job && job.remote && actor) {
        SoundManager.playOk();
        this.onActorSelected(actor, true);
      } else {
        SoundManager.playBuzzer();
      }
    }

    retractActorSelection() {
      SoundManager.playCancel();
      this._dndFocusSection = 'list';
      this.refreshUIJobOffersDOM();
    }

    update() {
      super.update();

      // In the OS the focus ring already walks every .focusable control and
      // presses it, so reading Input here as well moves the cursor twice for
      // one key. The ring is the only navigation in app mode; the board just
      // keeps the shift clock running so somebody's hours can end while the
      // player is sitting in front of the terminal.
      if (this._isAppMode) {
        this.updateWorkShiftClock();
        return;
      }

      if (this._dndContainer) {
        let moved = false;
        const job = this._jobListWindow ? this._jobListWindow.currentJob() : null;

        if (this._dndFocusSection === 'list') {
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
          } else if (Input.isTriggered('left') || this.isKeyPressed('KeyA')) {
            this._dndFocusSection = 'list';
            moved = true;
            SoundManager.playCancel();
          } else if (Input.isTriggered('ok')) {
            this.confirmActorSelection();
          } else if (Input.isTriggered('shift') && this.isRemoteJob(job)) {
            // Outside the OS there is no focus ring to tab onto the second
            // button, so remote work answers to Shift on the roster page.
            this.confirmRemoteWork();
          }
        }

        if (Input.isTriggered('pagedown') || Input.isTriggered('pageup')) {
          this.showSection(this._dndFocusSection === 'list' ? 'actors' : 'list');
          return;
        }

        if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
          if (this._dndFocusSection === 'actors') {
            this.retractActorSelection();
          } else {
            SoundManager.playCancel();
            this.popScene();
          }
        }

        if (moved) {
          this.refreshUIJobOffersDOM();
        }
      }
    }

    // ------------------------------------------------------------------
    // Shifts and the party
    //
    // Taking a contract on site does not fast forward the day: the candidate
    // LEAVES the party for the hours it runs (WorkSystem.Shifts.dispatch) and
    // walks back in when they are up. The board therefore has to say who is
    // already out, how long they have left, and what will happen to the party
    // if this offer is taken, because none of that is visible from the desk.
    // ------------------------------------------------------------------

    workShifts() {
      return (window.WorkSystem && window.WorkSystem.Shifts) || null;
    }

    // Anybody away is a real actor who is simply not in $gameParty, so the
    // roster cannot show them and the board has to ask the shift ledger.
    awayEntries() {
      const shifts = this.workShifts();
      return shifts && shifts.list ? shifts.list() : [];
    }

    // The clock only ticks on the map, so a shift that ends while the player
    // is in the OS would leave its worker away until the map came back. The
    // app keeps it running, and redraws when somebody actually returns.
    updateWorkShiftClock() {
      const shifts = this.workShifts();
      if (!shifts || !shifts.update) return;
      const before = this.awayEntries().length;
      shifts.update();
      const after = this.awayEntries().length;
      if (after !== before) this.refreshUIJobOffersDOM();
    }

    // Somebody has to be left to play as: Shifts.dispatch refuses the last
    // member standing, and the contract is then worked the old way, behind a
    // fade with the hours skipped. That is a different afternoon, so it is
    // said on the contract rather than discovered afterwards.
    wouldEmptyParty() {
      return $gameParty.members().length <= 1;
    }

    // The Busy list the party menu shows, on the board that sent them away.
    getAwayRosterHTML() {
      const entries = this.awayEntries();
      if (entries.length === 0) return '';
      const shifts = this.workShifts();
      const rows = entries.map(entry => {
        const actor = $gameActors.actor(entry.actorId);
        if (!actor) return '';
        const left = shifts.remaining(entry);
        const hours = Math.floor(left / 60);
        const mins = Math.round(left % 60);
        return `
          <div class="item-slot roster-item roster-item--away">
            ${this.getActorFaceHTML(actor, 44)}
            <div class="roster-item-info">
              <div class="roster-item-head">
                <strong class="roster-item-name">${actor.name()}</strong>
                <span class="roster-item-chance job-away-clock">${T('WorkSystem.shift.remaining', { hours: hours, minutes: mins })}</span>
              </div>
              <div class="roster-item-reqs">${T('WorkSystem.shift.awayOn', { job: window.WorkSystem.jobName(entry.job) })}</div>
            </div>
          </div>`;
      }).join('');
      return `<div class="inspect-section-title">${T('WorkSystem.shift.awayTitle')}</div>${rows}`;
    }

    // What taking this contract does to the party, said before it is taken.
    getPartyImpactHTML() {
      const text = this.wouldEmptyParty()
        ? T('WorkSystem.shift.lastMemberWarning')
        : T('WorkSystem.shift.leavesParty');
      return `<div class="ui-prose job-party-impact${this.wouldEmptyParty() ? ' job-deficit' : ''}">${text}</div>`;
    }

    // In the OS the board wears Archways' own controls (the .xp-* vocabulary
    // in css/hypernet.css) so it reads like a program and not like the
    // parchment menu; the fullscreen scene keeps the parchment.
    xpc(names) {
      return this._isAppMode ? ' ' + names : '';
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

  //=============================================================================
  // Who the board will hire
  //=============================================================================
  // A job offer is somebody putting a name on a payroll. Two things stop them:
  // a manhunt (nobody wants the police asking why that name is on their books)
  // and, where the offer comes from a faction, that faction's opinion of the
  // party. Both are asked through the plugin that owns them, so a missing
  // plugin simply hires everybody the way it always did.
  //
  // The offer is withheld rather than shown and refused: a board that lists
  // work it will not give reads as a bug, and the party has the pause menu and
  // the wiki to find out why the column is thinner than usual.
  function isJobOpenToParty(job) {
    try {
      const crime = window.CrimeSystem;
      if (crime && typeof crime.refusesRegisteredService === "function" &&
          crime.refusesRegisteredService()) {
        return false;
      }
      const factions = window.$gameFactions;
      const id = job && job.factionId;
      if (factions && typeof factions.getReputationFor === "function" &&
          Number.isFinite(id) && id >= 0) {
        const who = window.$gameParty && $gameParty.leader ? $gameParty.leader() : null;
        const threshold = typeof factions.standingRefusalThreshold === "function"
          ? factions.standingRefusalThreshold() : -40;
        if (factions.getReputationFor(who, id) <= threshold) return false;
      }
      return true;
    } catch (e) {
      // A board that cannot answer the question offers the work.
      return true;
    }
  }

  //=============================================================================
  // Window_JobOffersList - Job list window
  //=============================================================================

  class Window_JobOffersList extends Window_Selectable {
    initialize(rect) {
      super.initialize(rect);
      this._data = [];
      this._detailWindow = null;
      this.refresh();
    }

    maxCols() {
      return 1;
    }

    maxItems() {
      return this._data ? this._data.length : 0;
    }

    setDetailWindow(window) {
      this._detailWindow = window;
      this.updateDetailWindow();
    }

    currentJob() {
      return this._data[this.index()];
    }

    makeItemList() {
      // A job offer is somebody hiring. There is nobody left to hire anyone in
      // an empty world, so the board is bare rather than re-shuffled every
      // time it is opened. See WorldManager.populationMode.
      const WM = window.WorldManager;
      if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) return [];
      if (!window.WorkSystem || !window.WorkSystem.Jobs) {
        console.error("WorkSystem.Jobs not loaded!");
        return [];
      }

      const allJobs = window.WorkSystem.Jobs;
      const shuffled = [...allJobs].sort(() => Math.random() - 0.5);
      return shuffled.filter(isJobOpenToParty).slice(0, numberOfJobs);
    }

    refresh() {
      this._data = this.makeItemList();
      super.refresh();
    }

    drawItem(index) {
      const job = this._data[index];
      if (!job) return;

      const rect = this.itemLineRect(index);
      const language = ConfigManager.language || 'en';
      const jobName = window.WorkSystem.jobName(job);
      const hourlyPay = Math.round(job.basePay / job.duration);

      // Draw job name
      this.changeTextColor(ColorManager.systemColor());
      this.drawText(jobName, rect.x, rect.y, rect.width - 150);

      // Draw duration and hourly pay
      this.changeTextColor(ColorManager.normalColor());
      const payText = `${(hourlyPay / 100).toFixed(2)}€/hr`;
      const durationText = `${job.duration}h`;
      const infoText = `${durationText} | ${payText}`;
      this.drawText(infoText, rect.x + rect.width - 150, rect.y, 150, 'right');
    }

    select(index) {
      super.select(index);
      this.updateDetailWindow();
    }

    updateDetailWindow() {
      if (this._detailWindow) {
        const job = this.currentJob();
        this._detailWindow.setJob(job);
      }
    }
  }

  //=============================================================================
  // Window_JobDetails - Combined detail display window
  //=============================================================================

  class Window_JobDetails extends Window_Base {
    initialize(rect) {
      super.initialize(rect);
      this._job = null;
    }

    setJob(job) {
      if (this._job !== job) {
        this._job = job;
        this.refresh();
      }
    }

    refresh() {
      this.contents.clear();
      if (!this._job) return;

      const language = ConfigManager.language || 'en';
      const lineHeight = this.lineHeight();
      let y = 0;

      // Job description
      this.changeTextColor(ColorManager.systemColor());
      const descLabel =T('WorkSystem.description');
      this.drawText(descLabel, 0, y, this.contentsWidth());
      y += lineHeight;

      this.changeTextColor(ColorManager.normalColor());
      const description = window.WorkSystem.jobDescription(this._job);
      const wrappedDesc = this.wrapText(description, this.contentsWidth());
      for (const line of wrappedDesc) {
        this.drawText(line, 0, y, this.contentsWidth());
        y += lineHeight;
      }

      // Total pay
      y += 5;
      this.changeTextColor(ColorManager.systemColor());
      const totalPayLabel =T('WorkSystem.totalPay');
      this.drawText(`${totalPayLabel}: `, 0, y, 200);
      this.changeTextColor(ColorManager.normalColor());
      this.drawText(`${(this._job.basePay / 100).toFixed(2)}€`, 200, y, this.contentsWidth() - 200);
      y += lineHeight;

      // Faction info if applicable
      if (this._job.factionId !== undefined && this._job.factionId !== null) {
        this.changeTextColor(ColorManager.systemColor());
        const factionLabel =T('WorkSystem.faction');
        this.drawText(`${factionLabel}:`, 0, y, 200);
        this.changeTextColor(ColorManager.textColor(17)); // Purple/special color
        const factionName = this.getFactionName(this._job.factionId);
        this.drawText(factionName, 200, y, this.contentsWidth() - 200);
        y += lineHeight;
      }

      y += 10;

      // Divide into two columns for locations and requirements
      const columnWidth = Math.floor(this.contentsWidth() / 2);
      const leftX = 0;
      const rightX = columnWidth + 20;
      const startY = y;

      // Left column: Locations
      y = startY;
      this.changeTextColor(ColorManager.systemColor());
      const locationsLabel =T('WorkSystem.availableLocations');
      this.drawText(locationsLabel, leftX, y, columnWidth);
      y += lineHeight;

      this.changeTextColor(ColorManager.normalColor());
      if (!this._job.locations || this._job.locations.length === 0) {
        const unknownText =T('WorkSystem.unknown');
        this.drawText(unknownText, leftX + 10, y, columnWidth - 10);
      } else {
        for (const location of this._job.locations) {
          this.drawText('• ' + this.getLocationName(location), leftX + 10, y, columnWidth - 10);
          y += lineHeight;
        }
      }

      // Right column: Requirements
      y = startY;
      this.changeTextColor(ColorManager.systemColor());
      const reqText =T('WorkSystem.requirements');
      this.drawText(reqText, rightX, y, columnWidth);
      y += lineHeight;

      const requirements = this._job.requirements;
      const actor = $gameParty.leader();

      for (const [stat, value] of Object.entries(requirements)) {
        let actorValue = this.getActorStat(actor, stat);
        const meetsReq = actorValue >= value;

        this.changeTextColor(meetsReq ? ColorManager.normalColor() : ColorManager.deathColor());

        const mappedStat = window.WorkSystem && window.WorkSystem.statKeyMapping ? window.WorkSystem.statKeyMapping[stat] : stat;
        const translatedStat = window.WorkSystem && window.WorkSystem.si18n ? window.WorkSystem.si18n(mappedStat) : stat;

        this.drawText(`${translatedStat}: ${value} (${actorValue})`, rightX + 10, y, columnWidth - 10);
        y += lineHeight;
      }
    }

    wrapText(text, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const testWidth = this.textWidth(testLine);

        if (testWidth > maxWidth && currentLine) {
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

    getLocationName(mapId) {
      return locationLabel(mapId);
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

  // Export windows for external use
  window.Scene_JobOffers = Scene_JobOffers;
  window.Window_JobOffersList = Window_JobOffersList;
  window.Window_JobDetails = Window_JobDetails;

  console.log('WorkSystemJobOffers loaded');

})();
