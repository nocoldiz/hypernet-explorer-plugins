/*:
 * @target MZ
 * @plugindesc NPC Empathize UI: screen 3, the social web and the life record
 * @author Omni-Lex
 * @base NPCEmpathizeUI
 * @orderAfter NPCEmpathizeUI
 * @orderAfter NPCEmpathizeUI_Chat
 * @help
 * ============================================================================
 * NPCEmpathizeUI_Dossier, part of the NPCEmpathizeUI family
 * ============================================================================
 * Owns SCREEN 3 OF 5: the social web, the background, routine, biologics,
 * health, romance and life history tabs, the romance actions (court,
 * unwanted courting, propose) and Ask Directions. Publishes
 * window.NPCOrientationData, window.NPCRelationshipData and
 * window.NPCRolledGenitalCode.
 *
 * Reads the helpers it shares with the rest of the family off
 * Scene_NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathizeUI_Chat.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const { Scene_NPCEmpathize } = window.NPCEmpathize;
  const {
    _activityLabel, _addNpcAttraction, _addPairBond, _collapseByDay, _emStanceKey, _emVoiceLine,
    _escapeHtml, _euros, _extractContacts, _gameStamp, _getProfile, _getT, _goldTextToEuros,
    _hygienePenalty, _hygieneReadout, _iconSpan, _isBubbaActor, _isEmActor, _linkify, _meterRow,
    _needLabels, _personalitySocialMult, _rand, _resolveBustPath, _signatureLines, _socialLines, _timesSuffix,
    NEED_ICONS, OPT, vary,
  } = Scene_NPCEmpathize._internal;

  // ============================================================================
  // SCREEN 3 OF 5: THE LEDGER
  // ============================================================================
  // Who this person knows and who they love. The social web draws the contact
  // graph and the romance record below it draws the orientation, the standing
  // and the history. Both are read from the profile, so both band their
  // numbers rather than colouring them.

  // ============================================================================
  // Social web panel
  // ============================================================================

  // The graph is plain markup, not a canvas. Every earlier version painted it
  // imperatively in a frame callback after the render, and so had to survive the
  // panel being rebuilt underneath it, bust images landing late, and a stale
  // overlay owning the element - the failure mode being a tab that flashed the
  // web once and then sat there as an empty grey rectangle. An inline SVG is
  // part of the same innerHTML as the rest of the tab, so it is simply correct
  // on every render: nothing to schedule, nothing to clear, nothing to redraw
  // when an image finishes loading. The viewBox is sized to the finished
  // layout at 1:1, so the whole web fits at the default zoom and there is
  // nothing to pan by default - but a crowded roster earns its rings back via
  // the same zoom/pan the SkillMaster atlas uses (SkillMaster.js): the SVG's
  // own pixel size (not its viewBox) is scaled by `webZoom()`, sitting inside
  // a `.npc-web-sizer` box whose CSS size drives `.npc-web-stage`'s native
  // scrollLeft/scrollTop, so panning is just scrolling and needs no transform
  // math of its own. The wheel and L2/R2 zoom (about the pointer / the centre);
  // dragging anywhere but a node pans; a click on a node still fires immediately,
  // unaffected, because panning only ever arms on a press that starts off one.

  const _WEB_RING_CAP  = 8;   // nodes on the innermost ring
  const _WEB_RING_STEP = 4;   // each ring outward holds this many more
  const _WEB_R0        = 120; // radius of the innermost ring
  const _WEB_DR        = 98;  // gap between rings
  const _WEB_NODE_R    = 26;
  const _WEB_CENTER_R  = 34;
  const _WEB_MAX_NODES = 40;  // beyond this the graph is unreadable, the roster carries the rest

  // Everyone this person is connected to: the "met X" entries in their life log
  // merged with their standing relationships, so an acquaintance nobody has been
  // seen meeting yet still gets a (faint, dashed) thread of their own.
  // Whether this sheet belongs to somebody the history book seats in office.
  function _isWorldLeaderProfile(profile, npcName) {
    if (profile?._isWorldLeader) return true;
    try { return !!window.LeaderPersona?.isLeader?.(npcName); } catch (e) { return false; }
  }

  function _webContacts(profile, npcName) {
    const byName = new Map();
    for (const c of _extractContacts(profile, Infinity)) {
      if (c.name) byName.set(c.name, { name: c.name, meetings: c.count, opinion: 0, known: false });
    }
    // Synthetic and debug profiles can carry null or primitive relationship
    // entries, so every field here is read defensively.
    const rels = profile?.relationships ?? {};
    for (const [name, rel] of Object.entries(rels)) {
      if (!name) continue;
      const e = byName.get(name) ||
        { name: String(name), meetings: 0, opinion: 0, known: false };
      e.meetings = Math.max(e.meetings, Number(rel?.meetCount) || 0);
      e.opinion  = Number(rel?.opinion) || 0;
      e.known    = true;
      byName.set(name, e);
    }
    // A world leader's web is the political class and nothing else. They deal
    // with other heads of state, ministers and popes; whoever else a passing
    // sentence has them meeting is not a connection worth drawing on the same
    // chart as a succession.
    let entries = [...byName.values()];
    if (_isWorldLeaderProfile(profile, npcName)) {
      const isLeader = (n) => {
        try { return !!window.LeaderPersona?.isLeader?.(n); } catch (e) { return false; }
      };
      entries = entries.filter(e => isLeader(e.name));
    }
    return entries.sort((a, b) =>
      (b.meetings - a.meetings) || String(a.name).localeCompare(String(b.name)));
  }

  // Warm, cold or indifferent. A thread nobody has walked yet stays bark-coloured.
  function _webEdgeColor(entry) {
    if (!entry.meetings)      return 'var(--bg-npc-bark)';
    if (entry.opinion >= 20)  return 'var(--bg-npc-forest)';
    if (entry.opinion <= -20) return 'var(--border-npc-red)';
    return 'var(--text-text-alt-4)';
  }

  // Concentric rings, closest relationships innermost. Returns node centres in
  // graph space (the focus node sits at the origin) plus the outermost radius,
  // which is what the viewBox is built from.
  function _webLayout(count) {
    const pts = [];
    let ring = 0, placed = 0, outer = 0;
    while (placed < count) {
      const cap    = _WEB_RING_CAP + ring * _WEB_RING_STEP;
      const len    = Math.min(cap, count - placed);
      const radius = _WEB_R0 + ring * _WEB_DR;
      for (let i = 0; i < len; i++) {
        // The half-turn offset per ring keeps outer nodes out of the shadow of
        // the inner ones, so no thread is drawn straight through a face.
        const angle = (i / len) * Math.PI * 2 - Math.PI / 2 + ring * 0.42;
        pts.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      }
      outer = radius;
      placed += len;
      ring++;
    }
    return { pts, outer };
  }

  Scene_NPCEmpathize.prototype._buildWebHTML = function (T, profile, npcName, bustPath) {
    const all = _webContacts(profile, npcName);
    // Rows and nodes share one list, so a click handler can address either by
    // the same index; the graph simply stops at the first _WEB_MAX_NODES.
    this._webList = all;
    const drawn = all.slice(0, _WEB_MAX_NODES);

    const { pts, outer } = _webLayout(drawn.length);
    const pad  = _WEB_NODE_R + 34; // room for the name printed under a node
    const half = Math.max(_WEB_CENTER_R + 46, outer + pad);
    const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`;

    const num = n => (Math.round(n * 10) / 10).toString();

    // i18n-ignore-start: inline SVG markup for the connections web
    const edges = drawn.map((e, i) => {
      const p = pts[i];
      const w = Math.max(1.6, Math.min(5.5, 1.4 + e.meetings / 8));
      const dash = e.meetings <= 1 ? ' stroke-dasharray="7 5"' : '';
      return `<line x1="0" y1="0" x2="${num(p.x)}" y2="${num(p.y)}" ` +
             `stroke="${_webEdgeColor(e)}" stroke-width="${num(w)}" stroke-linecap="round" ` +
             `opacity="${e.meetings ? '0.9' : '0.45'}"${dash}/>`;
    }).join('');

    // i18n-ignore-end

    // How many times they have actually met, printed on the thread itself.
    const tallies = drawn.map((e, i) => {
      if (!e.meetings) return '';
      const p = pts[i];
      const mx = num(p.x / 2), my = num(p.y / 2);
      return `<g class="npc-web-tally">` +
             `<circle cx="${mx}" cy="${my}" r="12"/>` +
             `<text x="${mx}" y="${my}">${'×' + e.meetings}</text></g>`;
    }).join('');

    // One node. `index < 0` marks the focus node, which is not clickable.
    // The initial is painted under the portrait rather than instead of it, so a
    // bust that is missing or still loading degrades to a lettered disc with no
    // callback, no cache and no second draw.
    // i18n-ignore-start: inline SVG markup for one node of the web
    const node = (x, y, r, label, path, index) => {
      const clip    = `npcWebClip${index < 0 ? 'C' : index}`;
      const initial = _escapeHtml((String(label)[0] || '?').toUpperCase());
      const short   = String(label).length > 14 ? String(label).slice(0, 13) + '…' : String(label);
      const attrs   = index < 0
        ? 'class="npc-web-node npc-web-node--center"'
        : `class="npc-web-node" onmousedown="event.stopPropagation();SceneManager._scene._openWebNode(${index})"`;
      const img = path
        ? `<image href="${_escapeHtml(path)}" xlink:href="${_escapeHtml(path)}" ` +
          `x="${num(x - r)}" y="${num(y - r)}" width="${num(r * 2)}" height="${num(r * 2)}" ` +
          `preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>`
        : '';
      return `<g ${attrs}>` +
        `<clipPath id="${clip}"><circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}"/></clipPath>` +
        `<circle class="npc-web-disc" cx="${num(x)}" cy="${num(y)}" r="${num(r)}"/>` +
        `<text class="npc-web-initial" x="${num(x)}" y="${num(y)}" font-size="${Math.round(r)}">${initial}</text>` +
        img +
        `<circle class="npc-web-rim" cx="${num(x)}" cy="${num(y)}" r="${num(r)}"/>` +
        `<text class="npc-web-label" x="${num(x)}" y="${num(y + r + 16)}">${_escapeHtml(short)}</text>` +
        `</g>`;
    };

    // i18n-ignore-end

    const nodes = drawn.map((e, i) =>
      node(pts[i].x, pts[i].y, _WEB_NODE_R, e.name, _resolveBustPath(e.name, null), i)).join('');
    const centre = node(0, 0, _WEB_CENTER_R, npcName || '?', bustPath || null, -1);

    // The SVG's own pixel size (width/height, not its viewBox) is what the CSS
    // scale transform grows or shrinks; the sizer around it is set to match, so
    // its native scrollLeft/scrollTop is the pan. `webZoom()` persists on the
    // scene across re-renders (SkillMaster's atlas does the same), so leaving
    // the tab and coming back does not reset it.
    this._webBaseSize = { w: half * 2, h: half * 2 };
    const zoom = this.webZoom();

    // i18n-ignore-start: SVG frame for the web
    const graph =
      `<div class="npc-web-stage" id="npc-web-stage">
         <div class="npc-web-sizer" style="--npc-web-w:${Math.round(half * 2 * zoom)}px; --npc-web-h:${Math.round(half * 2 * zoom)}px">
           <svg class="npc-web-svg" viewBox="${viewBox}" width="${num(half * 2)}" height="${num(half * 2)}"
                style="--npc-web-zoom:${zoom}" xmlns="http://www.w3.org/2000/svg">
             ${edges}${tallies}${nodes}${centre}
           </svg>
         </div>
       </div>
       <div class="npc-web-legend">
         <span class="npc-web-zoom-controls">
           <span class="npc-web-zoom-btn" onmousedown="event.stopPropagation();SceneManager._scene.zoomWeb(-1)">&minus;</span>
           <span class="npc-web-zoom-btn" onmousedown="event.stopPropagation();SceneManager._scene.zoomWeb(1)">+</span>
         </span>
       </div>`;

    if (!all.length) {
      return `
        <div class="npc-web-fullscreen">
          <div class="npc-sec-hdr npc-mb-3">${T.socialWebTitle}</div>
          ${graph}
          <p class="npc-empty">${T.noContacts}</p>
          <p class="npc-note npc-faint">${T.contactsHint}</p>
        </div>`;
    }
    // i18n-ignore-end

    // The roster list of plain rows below the graph was dropped so the graph
    // itself can fill the whole tab; clicking a node is still how a contact's
    // own panel is opened (see _openWebNode below).
    return `
      <div class="npc-web-fullscreen">
        <div class="npc-sec-hdr npc-mb-3">${T.socialWebTitle}</div>
        ${graph}
      </div>`;
  };

  // A node was clicked: open that person's own panel, on their own Social
  // Web, so the player keeps walking the same graph outward.
  Scene_NPCEmpathize.prototype._openWebNode = function (index) {
    const entry = (this._webList || [])[index];
    if (!entry || !entry.name) return;
    SoundManager.playOk();
    window.NPCEmpathize?.openByName?.(entry.name, 'web');
  };

  // ── Social web: zoom / pan ─────────────────────────────────────────────────

  const _WEB_ZOOM_MIN  = 0.45;
  const _WEB_ZOOM_MAX  = 3.2;
  const _WEB_ZOOM_STEP = 1.2;   // one press of a legend button, or L2/R2 tapped
  const _WEB_WHEEL_STEP = 1.12; // one wheel tick

  Scene_NPCEmpathize.prototype._webStageEl = function () {
    return this._rightEl ? this._rightEl.querySelector('#npc-web-stage') : null;
  };

  // Whole-web-on-screen, matching what the fixed viewBox used to guarantee on
  // its own before zoom existed: fit the graph's diameter into the stage the
  // way it is CSS-sized (the stage now fills the right page top to bottom, so
  // its height tracks the panel's own clientHeight minus the header/legend
  // chrome around it), read off `_rightEl` since the stage itself is
  // mid-rebuild when this runs.
  Scene_NPCEmpathize.prototype._defaultWebZoom = function () {
    const base = this._webBaseSize;
    if (!base) return 1;
    const w = Math.max(280, (this._rightEl ? this._rightEl.clientWidth : 520) - 40);
    const h = Math.max(240, (this._rightEl ? this._rightEl.clientHeight : 500) - 90);
    const fit = Math.min(w, h) / Math.max(base.w, base.h);
    return Math.max(_WEB_ZOOM_MIN, Math.min(1.4, fit));
  };

  Scene_NPCEmpathize.prototype.webZoom = function () {
    if (!this._webZoom) this._webZoom = this._defaultWebZoom();
    return this._webZoom;
  };

  // Anchor coordinates are in the stage's own scroll-content space (i.e.
  // scrollLeft/Top plus a point inside the viewport); the point under them is
  // held still while the graph grows or shrinks beneath it, the same trick
  // SkillMaster's atlas zoom uses (SkillMaster.js, setAtlasZoom).
  Scene_NPCEmpathize.prototype.setWebZoom = function (zoom, anchorX, anchorY) {
    const stage = this._webStageEl();
    const sizer = stage && stage.querySelector('.npc-web-sizer');
    const svg   = stage && stage.querySelector('.npc-web-svg');
    const base  = this._webBaseSize;
    if (!stage || !sizer || !svg || !base) return;
    const next = Math.max(_WEB_ZOOM_MIN, Math.min(_WEB_ZOOM_MAX, zoom));
    const prev = this.webZoom();
    if (Math.abs(next - prev) < 0.001) return;

    const ax = (anchorX === undefined) ? stage.scrollLeft + stage.clientWidth / 2 : anchorX;
    const ay = (anchorY === undefined) ? stage.scrollTop + stage.clientHeight / 2 : anchorY;
    const worldX = ax / prev;
    const worldY = ay / prev;

    this._webZoom = next;
    sizer.style.setProperty('--npc-web-w', Math.round(base.w * next) + 'px');
    sizer.style.setProperty('--npc-web-h', Math.round(base.h * next) + 'px');
    svg.style.setProperty('--npc-web-zoom', String(next));
    stage.scrollLeft += worldX * next - ax;
    stage.scrollTop  += worldY * next - ay;
    this._webScrollX = stage.scrollLeft;
    this._webScrollY = stage.scrollTop;
  };

  // The legend's +/- buttons and the discrete end of L2/R2.
  Scene_NPCEmpathize.prototype.zoomWeb = function (dir, anchorX, anchorY) {
    this.setWebZoom(
      dir > 0 ? this.webZoom() * _WEB_ZOOM_STEP : this.webZoom() / _WEB_ZOOM_STEP,
      anchorX, anchorY
    );
  };

  // Drag anywhere on the field to pan; a press that starts on a node is left
  // alone so the node's own onmousedown still opens it immediately (this panel
  // fires on mousedown throughout, not click, so there is no "did it travel"
  // window to swallow afterwards the way SkillMaster's atlas gets one). Native
  // scrollLeft/scrollTop is the pan, so no transform math is needed here.
  // Idempotent per element: a rebuilt stage is a new node and gets bound fresh.
  Scene_NPCEmpathize.prototype._bindWebStagePointer = function (stage) {
    if (!stage || stage._webPointerBound) return;
    stage._webPointerBound = true;
    let dragging = false, fromX = 0, fromY = 0, startLeft = 0, startTop = 0;
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.npc-web-node')) return;
      dragging = true;
      fromX = e.clientX; fromY = e.clientY;
      startLeft = stage.scrollLeft; startTop = stage.scrollTop;
      stage.classList.add('npc-web-stage--dragging');
      if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      stage.scrollLeft = startLeft - (e.clientX - fromX);
      stage.scrollTop  = startTop  - (e.clientY - fromY);
    });
    const release = (e) => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('npc-web-stage--dragging');
      if (stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      this._webScrollX = stage.scrollLeft;
      this._webScrollY = stage.scrollTop;
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('scroll', () => {
      this._webScrollX = stage.scrollLeft;
      this._webScrollY = stage.scrollTop;
    });
  };

  // ============================================================================
  // Background tab
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildBackgroundTabHTML = function (T, profile, npcName) {
    // A beast has no biography. The history simulator writes everybody the same
    // life , a birthplace, a school, a first job, a marriage , and reading that
    // off an animal is where most of the invented human detail came from, so it
    // is neither generated nor printed for one (NPCCreature owns the boundary).
    const nonSentient = !!this._isNonSentientSubject?.();
    if (!nonSentient && profile && !profile.backstory) window.NPCHistSim?.generateBackstoryNow?.(npcName);
    const backstory  = nonSentient ? null : profile?.backstory;
    const headerHTML = `<div class="npc-sec-hdr">${T.historyTitle}</div><hr class="npc-r-sep">`;

    let backstoryHTML;
    // An animal's is its own (NPCLife_Animals): where it was born, to whom,
    // and what its kind is like, with no era and no human history in it.
    const Animals = window.NPCLifeSim?.Animals;
    const animalBio = (nonSentient && npcName && Animals?.isAnimalProfile?.(profile, npcName))
      ? (Animals.bioOf?.(npcName) || '') : '';
    if (animalBio) {
      const stage = Animals.stageOf?.(npcName);
      const days = Math.floor(Animals.ageDaysOf?.(npcName) || 0);
      const ageText = days >= 365 ? (window.T.n ? window.T.n('AnimalGrowth.age.years', Math.floor(days / 365)) : String(Math.floor(days / 365)))
        : (window.T.n ? window.T.n('AnimalGrowth.age.days', days) : String(days));
      const stageText = stage && window.T.has?.('NPCLife.animal.stage.' + stage) ? window.T('NPCLife.animal.stage.' + stage) : '';
      backstoryHTML = `
        <div class="npc-backstory-text">${_escapeHtml(animalBio)}</div>
        ${stageText ? `<div class="npc-backstory-meta">${_escapeHtml(window.T('Empathize.animalAge', { stage: stageText, age: ageText }))}</div>` : ''}`;
    } else if (!backstory) {
      backstoryHTML = `<p class="npc-empty">${_escapeHtml(T.noBackstory)}</p>`;
    } else {
      const ICONS  = window.HistorySimulator_ICONS ?? {};
      const evRows = (backstory.formativeEvents ?? []).map(e => {
        const iconId = ICONS[e.category] ?? 245;
        return `<div class="npc-backstory-event">${_iconSpan(iconId, 14)}<span>${_escapeHtml(e.date)}</span>, ${_escapeHtml(e.description)}</div>`;
      }).join('');

      backstoryHTML = `
        <div class="npc-backstory-text">${_escapeHtml(window.NPCHistSim?.narrativeOf?.(backstory) ?? backstory.narrative ?? '')}</div>
        <div class="npc-backstory-events">${evRows}</div>
        <div class="npc-backstory-meta">${_escapeHtml(T('NPCSociety.bio.bornMeta', { year: backstory.birthYear,
          place: window.WorkSystem?.destinationName ? window.WorkSystem.destinationName(backstory.birthplace) : backstory.birthplace }))}</div>`;
    }

    let lifeSummaryHTML = '';
    if (npcName && !nonSentient && window.NPCLifeSim) {
      window.NPCLifeSim.ensureLifeRecord?.(npcName, profile?._homeGroupName);
      const bio = window.NPCLifeSim.buildBiography?.(npcName);
      if (bio) {
        const lines = bio.split('\n').filter(Boolean)
          .map(line => `<div class="npc-backstory-event">${_escapeHtml(line)}</div>`).join('');
        lifeSummaryHTML = `
          <hr class="npc-r-sep">
          <div class="npc-sec-hdr">${T.lifeSummary}</div>
          <div class="npc-backstory-events">${lines}</div>`;
      }
    }

    // Company shares held (NPCSim.Stocks), valued at today's price.
    let sharesHTML = '';
    const shareRows = (!nonSentient && profile) ? (window.NPCSim?.Stocks?.describe?.(profile) || []) : [];
    if (shareRows.length) {
      const fmt = window.NPCShared?.formatMoney || ((v) => String(v));
      const list = shareRows.map(r => T('Empathize.shares.item', { company: r.name, value: fmt(r.value) })).join(', ');
      sharesHTML = `
          <hr class="npc-r-sep">
          <div class="npc-backstory-event">${_escapeHtml(T('Empathize.shares.holds', { list }))}</div>`;
    }

    // Family: kin both ways, a child on the way (NPCLifeSim FAMILY).
    const familyHTML = (npcName && !nonSentient)
      ? _familySectionHTML(window.NPCLifeSim?.getRecord?.(npcName) ?? null) : '';

    return `${headerHTML}${backstoryHTML}${lifeSummaryHTML}${familyHTML}${sharesHTML}`;
  };

  // ============================================================================
  // Routine tab
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildRoutineTabHTML = function (T, profile) {
    const headerHTML = `<div class="npc-sec-hdr">${T.routineTitle}</div><hr class="npc-r-sep">`;

    const RM = window.NPCSim?.RoutineManager;
    if (!profile || !RM) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noRoutineData)}</p>`;
    }

    const needLabels = _needLabels(T);
    const fmtHour    = h => `${String(h).padStart(2, '0')}:00`;
    // Why an hour went otherwise than planned (NPCSim routineLog), when the
    // reason is worth reading: leave, or an hour at the games.
    const overrideNote = (kind) => kind === 'sick' ? T.routineSickLeave
      : kind === 'parental' ? T.routineParentalLeave
      : kind === 'minigame' ? T.routineMinigame : '';
    const row = (hour, activity, cls, override) => {
      // An hour whose own id already says it (onLeave.sick, minigame) needs no note.
      const saysItself = /^onLeave\./.test(activity) || activity === 'minigame';
      const note = saysItself ? '' : overrideNote(override);
      const label = _activityLabel(activity, profile, T, needLabels) + (note ? ` (${note})` : '');
      return `
      <div class="npc-routine-row ${cls}"${cls === 'now' ? ' id="npc-routine-now"' : ''}>
        <span class="npc-routine-hour">${fmtHour(hour)}</span>
        ${_iconSpan(NEED_ICONS[activity] ?? 0, 14)}
        <span>${_escapeHtml(label)}</span>
      </div>`;
    };

    const past   = RM.getLast24Hours(profile) ?? [];
    const future = RM.getRestOfDay(profile)   ?? [];
    // Seen riding a bus or a train: the hour on screen reads "Traveling"
    // (display only, the routine is left as it is).
    const travelingHour = this._travelingHour;

    const pastRows   = past.map(e => {
      const now = !e.isPast;
      const activity = now && travelingHour != null && e.hour === travelingHour ? 'travelling' : e.activity;
      return row(e.hour, activity, now ? 'now' : 'past', e.override);
    }).join('');
    const futureRows = future.length
      ? future.map(e => row(e.hour, e.activity, '')).join('')
      : `<p class="npc-sub">${_escapeHtml(T.routineNothingPlanned)}</p>`;

    return `
      ${headerHTML}
      <div class="npc-routine-sub-hdr">${T.routinePast24h}</div>
      ${pastRows}
      <div class="npc-routine-sub-hdr">${T.routineRestOfDay}</div>
      ${futureRows}`;
  };

  // ============================================================================
  // Biologics tab
  // ============================================================================
  // Simplified anatomy readout: the NPC's limbs/organs come straight from
  // their archetype's part table (window.Health.Archetypes, the same
  // data Health_Core builds player body parts from), with per-part condition
  // and congenital missing limbs rolled deterministically from the world
  // seed. Display-only, no Health_BiologicSimulation machinery involved.

  let _archetypeI18nCache = null;
  function _archetypePartName(part, key) {
    const raw = part?.name;
    if (raw && typeof raw === 'string' && raw.includes('.')) {
      if (_archetypeI18nCache === null) {
        _archetypeI18nCache = {};
        try {
          const xhr = new XMLHttpRequest();
          const lang = ConfigManager.language === 'it' ? 'it' : 'en';
          xhr.open('GET', `js/i18n/${lang}/enemyArchetypes.json`, false);
          xhr.send();
          if (xhr.status === 200 || xhr.status === 0) _archetypeI18nCache = JSON.parse(xhr.responseText);
        } catch (_) {}
      }
      const resolved = raw.split('.').reduce((acc, p) => acc && acc[p], _archetypeI18nCache);
      if (resolved && typeof resolved === 'string') return resolved;
    }
    if (raw && typeof raw === 'string' && !raw.includes('.')) return raw;
    return key.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // ============================================================================
  // Health tab, current illnesses + pre-simulated medical history + conditions
  // ============================================================================

  // A severity is a band, not a colour: the stylesheet inks the name.
  const _SEV_BAND = {
    trivial: 'npc-fill--ok', mild: 'npc-fill--green', moderate: 'npc-fill--warn',
    severe: 'npc-fill--bad', lethal: 'npc-fill--bad', esoteric: 'npc-fill--info', chronic: 'npc-fill--warn',
  };

  Scene_NPCEmpathize.prototype._buildHealthTabHTML = function (T, profile, npcName) {
    const headerHTML = `<div class="npc-sec-hdr">${T.healthTitle}</div><hr class="npc-r-sep">`;
    const DS = window.DiseaseSystem;
    // Party members show their own live disease state; NPCs show a
    // world-seeded, pre-simulated medical history persisted on the profile.
    const actorObj = this._actorId != null ? $gameActors.actor(this._actorId) : null;
    if (!DS || (!actorObj && (!profile || !npcName))) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noHealth)}</p>`;
    }
    if (!actorObj) { try { DS.ensureNpcMedicalHistory(npcName, profile); } catch (e) {} }
    else { try { DS.ensureStoryConditions?.(); } catch (e) {} }

    const isChronic = d => d && (d.durationDays < 0 || d.durationDays >= 9999);

    const diseaseRow = entry => {
      const d = DS.getDisease(entry.id);
      if (!d) return '';
      const tags = [];
      if (entry.venereal || d.venereal)
        tags.push(`<span class="npc-badge npc-info">${_escapeHtml(T.venerealTag)}</span>`);
      if (entry.epidemic)
        tags.push(`<span class="npc-badge npc-bad">${_escapeHtml(T.epidemicTag)}</span>`);
      if (d.infective)
        tags.push(`<span class="npc-badge">${_escapeHtml(T.contagiousTag)} ${Math.round(d.transmission * 100)}%</span>`);
      const symptoms = (d.symptoms || []).slice(0, 4).join(', ');
      return `
        <div class="npc-ident-row npc-top">
          <span class="npc-sev-dot ${_SEV_BAND[d.severity] || 'npc-fill--calm'}"></span>
          <div class="npc-flex-1">
            <div><b>${_escapeHtml(d.name)}</b> <span class="npc-note">${_escapeHtml(d.category)}</span></div>
            ${tags.length ? `<div class="npc-badge-row npc-my-1">${tags.join('')}</div>` : ''}
            ${d.desc ? `<div class="npc-thought npc-mt-1">${_escapeHtml(d.desc)}</div>` : ''}
            ${symptoms ? `<div class="npc-note">${_escapeHtml(T.symptomsLbl)}: ${_escapeHtml(symptoms)}</div>` : ''}
          </div>
        </div>`;
    };

    const condRow = entry => {
      const c = DS.getCondition(entry.id != null ? entry.id : entry);
      if (!c) return '';
      const icon = c.category === 'injury' ? 176 : c.category === 'surgical' ? 168 : 186;
      return `
        <div class="npc-ident-row npc-top">
          ${_iconSpan(icon, 17)}
          <div class="npc-flex-1">
            <div><b>${_escapeHtml(c.name)}</b> <span class="npc-note">${_escapeHtml(c.category)}</span></div>
            ${c.desc ? `<div class="npc-thought npc-mt-1">${_escapeHtml(c.desc)}</div>` : ''}
          </div>
        </div>`;
    };

    const pastBadge = id => {
      const d = DS.getDisease(id);
      return d ? `<span class="npc-badge npc-my-1">${_escapeHtml(d.name)}</span>` : '';
    };

    // Every outbreak this person has been through: what they caught, and the
    // ones that swept their town while they were living in it. Historical
    // entries come from the century HistorySimulator generated, live ones from
    // the epidemics running right now.
    const epidemicRow = entry => {
      const disease = DS.getDisease(entry.diseaseId);
      const caught = entry.role === 'caught';
      const hysteria = entry.kind === 'hysteria';
      const roleLbl = caught
        ? (hysteria ? (T.epidemicSwept) : (T.epidemicCaught))
        : (T.epidemicLived);
      const tags = [`<span class="npc-badge ${caught ? 'npc-bad' : 'npc-off'}">${_escapeHtml(roleLbl)}</span>`];
      if (hysteria) tags.push(`<span class="npc-badge npc-info">${_escapeHtml(T.hysteriaTag)}</span>`);
      if (entry.historical) tags.push(`<span class="npc-badge">${_escapeHtml(T.historicalTag)}</span>`);
      return `
        <div class="npc-ident-row npc-top">
          ${_iconSpan(hysteria ? 79 : 176, 17)}
          <div class="npc-flex-1">
            <div><b>${_escapeHtml(entry.name || (disease ? disease.name : entry.diseaseId))}</b></div>
            <div class="npc-badge-row npc-my-1">${tags.join('')}</div>
            <div class="npc-note">${_escapeHtml(entry.place || '')}${entry.date ? `, ${_escapeHtml(String(entry.date))}` : ''}</div>
          </div>
        </div>`;
    };

    const cur   = actorObj ? DS.actorEntries(actorObj)    : DS.npcDiseases(profile);
    const conds = actorObj ? DS.actorConditions(actorObj) : DS.npcConditions(profile);
    const past  = actorObj ? DS.actorPast(actorObj)       : DS.npcPast(profile);
    const epis  = actorObj ? (DS.actorEpidemicHistory ? DS.actorEpidemicHistory(actorObj) : [])
                           : (DS.npcEpidemicHistory ? DS.npcEpidemicHistory(profile) : []);
    const acute   = cur.filter(e => { const d = DS.getDisease(e.id); return d && !isChronic(d); });
    const chronic = cur.filter(e => { const d = DS.getDisease(e.id); return d && isChronic(d); });

    // What is burning in their home town right now, whether or not they have it.
    let localHTML = '';
    const ES = window.EpidemicSystem;
    if (ES && !actorObj && profile) {
      const place = ES.placeForGroup(profile._homeGroupName);
      const live = place ? ES.activeAt(place.key) : [];
      if (live.length) {
        const rows = live.map(e => {
          const pct = (ES.prevalenceAt(place.key, e) * 100).toFixed(1);
          return `<div class="npc-ident-row"><div class="npc-flex-1"><b>${_escapeHtml(e.name)}</b>
            <div class="npc-note">${_escapeHtml(ES.placeName ? ES.placeName(place.key) : place.key)} &mdash; ${pct}% ${_escapeHtml(T.epidemicIll)}</div></div></div>`;
        }).join('');
        localHTML = `<div class="npc-sec-hdr npc-mt-4">${_escapeHtml(T.epidemicLocal)}</div>${rows}`;
      }
    }

    const section = (title, body, empty) =>
      `<div class="npc-sec-hdr npc-mt-4">${_escapeHtml(title)}</div>` +
      (body || `<p class="npc-sub">${_escapeHtml(empty)}</p>`);

    // Wounds taken in fights out on the map (NPCSystem, MAP SKIRMISH): the
    // map HP and every part broken or cut, named off the Humanoid table.
    let woundsHTML = '';
    if (!actorObj && profile && (Array.isArray(profile.injuries) || typeof profile.hp === 'number')) {
      const parts = window.Health?.Archetypes?.Humanoid?.parts || {}; // i18n-ignore: Archetypes.json id
      const injuries = Array.isArray(profile.injuries) ? profile.injuries : [];
      const D = window.NPCDowned;
      const nowMin = $gameVariables?.value(114) ?? 0;
      const treated = !!D?.isTreated?.(profile, nowMin);
      const rows = injuries.map(inj => {
        const key = inj && inj.part;
        if (!key) return '';
        const tags = [];
        if (inj.broken) tags.push(`<span class="npc-badge npc-amber">${_escapeHtml(T.woundBroken)}</span>`);
        if (inj.cut) tags.push(`<span class="npc-badge npc-bad">${_escapeHtml(T.woundCut)}</span>`);
        // A part lost for good, waiting on a prosthetic (NPCSim.Implants).
        if (inj.lost) tags.push(`<span class="npc-badge npc-bad">${_escapeHtml(window.T('Empathize.woundLost'))}</span>`);
        // How long it has left to knit (NPCSystem, DOWNED BODIES recovery).
        const days = D?.daysToHeal ? D.daysToHeal(inj, treated) : 0;
        if (days > 0) tags.push(`<span class="npc-badge">${_escapeHtml(window.T('Empathize.woundHealsIn', { days }))}</span>`);
        return `
        <div class="npc-ident-row npc-top">
          ${_iconSpan(176, 17)}
          <div class="npc-flex-1">
            <div><b>${_escapeHtml(_archetypePartName(parts[key], key))}</b></div>
            ${tags.length ? `<div class="npc-badge-row npc-my-1">${tags.join('')}</div>` : ''}
          </div>
        </div>`;
      }).join('');
      const mhp = Math.max(1, Number(profile.mhp) || 100);
      const hp = typeof profile.hp === 'number' ? Math.max(0, Math.round(profile.hp)) : mhp;
      const hpLine = `<p class="npc-sub">${_escapeHtml(window.T('Empathize.woundsHp', { hp, mhp }))}` +
        (profile.downed ? ` <span class="npc-badge npc-bad">${_escapeHtml(T.woundsDowned)}</span>` : '') +
        (treated ? ` <span class="npc-badge npc-good">${_escapeHtml(window.T('Empathize.woundsTreated'))}</span>` : '') +
        (!treated && D?.needsHeal?.(profile, nowMin)
          ? ` <span class="npc-badge npc-amber">${_escapeHtml(window.T('Empathize.woundsNeedHealer'))}</span>` : '') + `</p>`;
      woundsHTML = section(T.woundsTitle, hpLine + rows);
    }

    // Implants and prosthetics (NPCSim.Implants, Phase I).
    const implantsHTML = !actorObj && profile ? _implantsSectionHTML(profile, section) : '';

    return `
      ${headerHTML}
      ${woundsHTML}
      ${implantsHTML}
      ${section(T.currentIllness, acute.map(diseaseRow).join(''), T.noneCurrent)}
      ${chronic.length ? section(T.chronicConditions, chronic.map(diseaseRow).join('')) : ''}
      ${localHTML}
      ${section(T.epidemicsTitle, epis.map(epidemicRow).join(''), T.noEpidemics)}
      ${section(T.lastingConditions, conds.map(condRow).join(''), T.noneConditions)}
      ${section(T.pastIllness, past.length ? `<div class="npc-badge-row">${past.map(pastBadge).join('')}</div>` : '', T.noPast)}`;
  };

  // A party member's anatomy is not rolled: Health_Core keeps every limb and
  // organ on the actor (actor._bodyParts, a severed part being one deleted from
  // it), so the page reads the wounds the player's character actually carries
  // instead of a stranger's seeded anatomy.
  Scene_NPCEmpathize.prototype._buildActorBiologicsHTML = function (T, actor) {
    const headerHTML = `<div class="npc-sec-hdr">${T.biologicsTitle}</div><hr class="npc-r-sep">`;
    const HC   = window.HealthCore;
    const keys = HC?.getActorArchetypeKeys ? HC.getActorArchetypeKeys(actor) : ['Humanoid']; // i18n-ignore: Archetypes.json id
    const label = keys
      .map(k => (HC?.getArchetypeDisplayName ? HC.getArchetypeDisplayName(k) : k))
      .join(' / ');

    const held = actor._bodyParts || {};
    // Every part the archetype says they should have, so an amputation shows as
    // a missing limb rather than simply vanishing off the list.
    const expected = {};
    for (const key of keys) {
      const table = window.Health?.Archetypes?.[key]?.parts;
      if (table) for (const [k, part] of Object.entries(table)) if (!expected[k]) expected[k] = part;
    }
    const rows = [];
    for (const [key, part] of Object.entries(Object.keys(expected).length ? expected : held)) {
      const live = held[key];
      if (!live) { rows.push({ key, part, missing: true, cond: 0 }); continue; }
      const max  = live.maxHp || 1;
      rows.push({
        key,
        part: { name: live.name ?? part?.name, vital: live.vital ?? part?.vital },
        missing: false,
        cond: Math.max(0, Math.min(100, Math.round((live.currentHp / max) * 100))),
      });
    }
    if (!rows.length) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noBiologics)}</p>`;
    }

    let condSum = 0, condCount = 0;
    for (const row of rows) { if (!row.missing) { condSum += row.cond; condCount++; } }
    const overall = condCount ? Math.round(condSum / condCount) : 0;

    const condBand = v => v >= 85 ? 'npc-fill--ok' : v >= 65 ? 'npc-fill--warn' : 'npc-fill--bad';
    // The traveller's own bars, not a scale against a notional 2000 HP: nothing
    // here is guessed, so nothing here is drawn against a guessed maximum.
    const vitalsHTML = `
      <div class="npc-bio-vitals">
        ${_meterRow('HP', Math.round((actor.hp / Math.max(1, actor.mhp)) * 100), 'npc-fill--bad')}
        ${_meterRow('MP', Math.round((actor.mp / Math.max(1, actor.mmp)) * 100), 'npc-fill--mp')}
        ${_meterRow(T.biologicsCondition, overall, condBand(overall))}
      </div>`;

    return `
      ${headerHTML}
      <div class="npc-bio-archetype">${_escapeHtml(T.biologicsArchetype)}: <b>${_escapeHtml(label)}</b></div>
      ${this._bloodTypeSectionHTML(T, window.BloodTypeService?.forActor(actor), actor)}
      ${vitalsHTML}
      <div class="npc-routine-sub-hdr">${_escapeHtml(T.biologicsParts)}</div>
      <div class="npc-bio-grid">${_bioPartRowsHTML(rows, T, condBand)}</div>`;
  };

  // Blood type line (real name + rarity), a universal donor/recipient badge
  // where it applies, a note for the ultra-rare antigen-negative lineages,
  // and, whenever the panel is being read on behalf of someone other than
  // the person being displayed, a real ABO/Rh transfusion-compatibility
  // verdict against the party member currently doing the talking
  // (this._focusActor()). window.BloodTypeService (Health_BiologicSimulation)
  // is the only place that data and that calculation live.
  Scene_NPCEmpathize.prototype._bloodTypeSectionHTML = function (T, bloodEntry, subject) {
    const BTS = window.BloodTypeService;
    if (!BTS || !bloodEntry) return '';

    const badges = [];
    if (BTS.isUniversalDonor(bloodEntry.id)) badges.push(`<span class="npc-badge">${_escapeHtml(T.bloodUniversalDonor)}</span>`);
    if (BTS.isUniversalRecipient(bloodEntry.id)) badges.push(`<span class="npc-badge">${_escapeHtml(T.bloodUniversalRecipient)}</span>`);
    const badgeHTML = badges.length ? `<div class="npc-badge-row npc-my-1">${badges.join('')}</div>` : '';
    const rareNoteHTML = bloodEntry.rareAntigen
      ? `<div class="npc-thought npc-mt-1">${_escapeHtml(T.bloodRareAntigenNote)}</div>` : '';

    let compatHTML = '';
    const focusActor = this._focusActor ? this._focusActor() : null;
    if (focusActor && focusActor !== subject) {
      const focusEntry = BTS.forActor(focusActor);
      if (focusEntry) {
        const canGive = BTS.canDonate(bloodEntry.id, focusEntry.id);
        const canReceive = BTS.canDonate(focusEntry.id, bloodEntry.id);
        const label = canGive && canReceive ? T.bloodCompatBoth
          : canGive ? T.bloodCompatDonorOnly
          : canReceive ? T.bloodCompatRecipientOnly
          : T.bloodCompatNone;
        compatHTML = `<div class="npc-bio-archetype">${_escapeHtml(T.bloodCompatTitle)}: <b>${_escapeHtml(label)}</b></div>`;
      }
    }

    return `
      <div class="npc-bio-archetype">${_escapeHtml(T.bloodType)}: <b>${_escapeHtml(bloodEntry.type)} (${_escapeHtml(bloodEntry.rarity)})</b></div>
      ${badgeHTML}${rareNoteHTML}${compatHTML}`;
  };

  // The augments a person carries, each with the part it sits in and what
  // it does (NPCSim.Implants).
  function _implantsSectionHTML(profile, section) {
    const I = window.NPCSim?.Implants;
    const list = I?.describe ? I.describe(profile) : [];
    const names = (window.T && typeof window.T.list === 'function') ? window.T.list('HealthCore.paramNames') : [];
    const rows = list.map(imp => {
      const fx = Object.entries(imp.effects).map(([pid, v]) =>
        `${names[Number(pid)] || pid} ${v >= 0 ? '+' : ''}${v}`).join(', ');
      const tag = imp.prosthetic
        ? `<span class="npc-badge">${_escapeHtml(window.T('Empathize.implantProsthetic'))}</span>` : '';
      return `
        <div class="npc-ident-row npc-top">
          ${_iconSpan(176, 17)}
          <div class="npc-flex-1">
            <div><b>${_escapeHtml(imp.name)}</b> ${tag}</div>
            <div class="npc-note">${_escapeHtml(window.T('Empathize.implantOn', { part: imp.partName }))}${fx ? '<br>' + _escapeHtml(fx) : ''}</div>
          </div>
        </div>`;
    }).join('');
    return section(window.T('Empathize.implantsTitle'), rows, window.T('Empathize.implantsNone'));
  }

  function _bioPartRowsHTML(rows, T, condBand) {
    return rows.map(({ key, part, missing, cond, implant }) => {
      const label    = _escapeHtml(_archetypePartName(part, key));
      const vitalTag = part.vital ? `<span class="npc-bio-vital-tag">${_escapeHtml(T.biologicsVitalTag)}</span>` : '';
      if (implant) {
        return `
          <div class="npc-bio-part">
            <span class="npc-bio-part-name">${label}${vitalTag}</span>
            <span class="npc-badge">${_escapeHtml(implant)}</span>
          </div>`;
      }
      if (missing) {
        return `
          <div class="npc-bio-part npc-bio-missing">
            <span class="npc-bio-part-name">${label}</span>
            <span class="npc-bio-missing-lbl">${_escapeHtml(T.biologicsMissing)}</span>
          </div>`;
      }
      return `
        <div class="npc-bio-part">
          <span class="npc-bio-part-name">${label}${vitalTag}</span>
          <div class="npc-vital-track"><div class="npc-vital-fill ${condBand(cond)}" style="--npc-w:${cond}%"></div></div>
          <span class="npc-vital-pct">${cond}%</span>
        </div>`;
    }).join('');
  }

  Scene_NPCEmpathize.prototype._buildBiologicsTabHTML = function (T, profile, npcName) {
    const actorObj = this._actorId != null ? $gameActors.actor(this._actorId) : null;
    if (actorObj) return this._buildActorBiologicsHTML(T, actorObj);

    const headerHTML = `<div class="npc-sec-hdr">${T.biologicsTitle}</div><hr class="npc-r-sep">`;
    const archetype  = profile?.archetype || 'Humanoid'; // i18n-ignore: Archetypes.json id
    const parts      = window.Health?.Archetypes?.[archetype]?.parts;
    if (!profile || !parts || !Object.keys(parts).length) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noBiologics)}</p>`;
    }

    // World-seeded per-NPC anatomy roll, stable across sessions: the same
    // NPC in the same world is always missing the same (non-vital) limbs.
    const Shared = window.NPCShared;
    const rng    = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_bio') ^ Shared.worldSeed()) : null;
    const rnd    = () => (rng ? rng.next() : 0.5);

    const rows = [];
    for (const [key, part] of Object.entries(parts)) {
      let missing = !part.vital && !!part.canCutoff && rnd() < 0.06;
      let cond = Math.round(60 + rnd() * 40);
      if (part.vital) cond = Math.max(70, cond);
      rows.push({ key, part, missing, cond });
    }
    // Sandbox override (set by SandboxMode NPC manipulation): severed or
    // regenerated body parts. Applied on top of the deterministic roll.
    const bioOv = profile._bioOverride;
    if (bioOv) {
      for (const row of rows) {
        const o = bioOv[row.key];
        if (!o) continue;
        if (o.missing != null) row.missing = o.missing;
        if (o.cond    != null) row.cond    = o.cond;
      }
    }
    // Fights and the clinic on top of the roll: a part lost in a fight is
    // missing, an augment stands in its socket (NPCSim.Implants).
    const Imp = window.NPCSim?.Implants;
    if (Imp) {
      const lost = Imp.lostParts(profile);
      const fitted = Imp.byPart(profile);
      for (const row of rows) {
        if (lost.has(row.key)) row.missing = true;
        if (fitted[row.key]) { row.missing = false; row.cond = 100; row.implant = Imp.label(fitted[row.key]); }
      }
    }
    let condSum = 0, condCount = 0;
    for (const row of rows) { if (!row.missing) { condSum += row.cond; condCount++; } }
    const blood   = Math.round(80 + rnd() * 20);
    const overall = condCount ? Math.round(condSum / condCount) : 100;

    const condBand = v => v >= 85 ? 'npc-fill--ok' : v >= 65 ? 'npc-fill--warn' : 'npc-fill--bad';
    const vitalsHTML = `
      <div class="npc-bio-vitals">
        ${_meterRow('HP',  Math.min(100, Math.round(((profile.mhp ?? 0) / 2000) * 100)), 'npc-fill--bad')}
        ${_meterRow('MP',  Math.min(100, Math.round(((profile.mmp ?? 0) / 500)  * 100)), 'npc-fill--mp')}
        ${_meterRow(T.biologicsBlood, blood, 'npc-fill--bad')}
        ${_meterRow(T.biologicsCondition, overall, condBand(overall))}
      </div>`;

    return `
      ${headerHTML}
      <div class="npc-bio-archetype">${_escapeHtml(T.biologicsArchetype)}: <b>${_escapeHtml(archetype)}</b></div>
      ${this._bloodTypeSectionHTML(T, window.BloodTypeService?.forNpc(npcName), npcName)}
      ${vitalsHTML}
      <div class="npc-routine-sub-hdr">${_escapeHtml(T.biologicsParts)}</div>
      <div class="npc-bio-grid">${_bioPartRowsHTML(rows, T, condBand)}</div>`;
  };

  // ============================================================================
  // Romance tab
  // ============================================================================
  // Display-only. Each NPC's romantic + sexual orientation, Kinsey placement,
  // genitals (mirroring the prosthetic reproduction DB) and preferred
  // relationship style are rolled deterministically from the world seed, so the
  // same NPC in the same world always reads the same. Current sentimental
  // status and partner links come live from NPCLifeSim.

  let _orientationDb  = null;
  let _relationshipDb = null;

  function _loadJsonSync(url) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) return JSON.parse(xhr.responseText);
    } catch (e) {
      console.warn('[NPCEmpathizeUI] failed to load', url, e);
    }
    return null;
  }

  function _orientationData() {
    if (_orientationDb === null) _orientationDb = _loadJsonSync('js/db/NPC/Orientations.json') || {};
    return _orientationDb;
  }
  function _relationshipData() {
    if (_relationshipDb === null) _relationshipDb = _loadJsonSync('js/db/NPC/Relationships.json') || {};
    return _relationshipDb;
  }

  // The two rosters, for the readers outside this file: NPCSociety's event
  // initialization spec (SECTION 3c) resolves a written orientation or
  // relationship style against exactly the lists the panel draws from.
  window.NPCOrientationData  = _orientationData;
  window.NPCRelationshipData = _relationshipData;

  // Weighted random pick, weight read from o[key]; falls back to a flat pick.
  function _weightedPick(list, rng, key) {
    if (!list || !list.length) return null;
    const total = list.reduce((s, o) => s + (Number(o[key]) || 0), 0);
    if (total <= 0) return rng.pick(list);
    let r = rng.next() * total;
    for (const o of list) { r -= (Number(o[key]) || 0); if (r < 0) return o; }
    return list[list.length - 1];
  }

  // Genital label set mirrors Health_ProstheticShop.getReproductionName (the
  // prosthetic reproduction DB): None / Testicles / Uterus / Oviparous /
  // Plant Spores / Mitosis.
  // Codes are the ones Health_ProstheticShop uses; the words come from
  // Empathize.genital.<code>, with -1 written "none" so it is a valid key.
  const _genitalName = (code) => {
    const key = 'Empathize.genital.' + (String(code) === '-1' ? 'none' : String(code));
    return T.has(key) ? T(key) : 'N/A';
  };

  // Every genital code the DB knows: -1 None, 0 Testes, 1 Uterus, 2 Oviduct,
  // 3 Spore Gland, 4 Mitosis Gland.
  const _GENITAL_ALL   = [-1, 0, 1, 2, 3, 4];
  // An alien sprite (NPCs.json `aliens: true`) never carries a human uterus or
  // testes, whatever gender it rolled: alien biology is its own thing.
  const _GENITAL_ALIEN = [-1, 2, 3, 4];

  // A party member is not rolled: their body was answered on the Bio page (or
  // stated by the dossier they arrived on) and lives on the actor
  // (reproductionType), the very field the status sheet and the biologic
  // simulation read. Rolling one here made the panel contradict both, so Em
  // could be shown testes and Bubba a uterus.
  function _partyGenitalCode(npcName) {
    if (!npcName || typeof $gameParty === 'undefined' || !$gameParty) return null;
    const members = $gameParty.allMembers ? $gameParty.allMembers() : [];
    // A member whose body nobody has stated (a pet, a summon) answers null
    // and is rolled like anybody else.
    const member = members.find((m) => m && m.name() === npcName);
    if (!member || typeof member.reproductionType !== 'function') return null;
    const code = member.reproductionType();
    return _GENITAL_ALL.includes(code) ? code : null;
  }

  function _npcGenitalCode(npcName, profile) {
    const owned = _partyGenitalCode(npcName);
    if (owned !== null) return owned;

    const Shared = window.NPCShared;
    const rng    = Shared ? new Shared.Rng(Shared.nameHash(npcName + '_genitals') ^ Shared.worldSeed()) : null;
    const pick   = list => (rng ? rng.pick(list) : list[0]);
    const gender = profile?.gender ?? 0;

    if (Shared?.isAlienSprite?.(profile?.spriteKey)) return pick(_GENITAL_ALIEN);

    // Non-binary and Cocoon read as "varied", evenly across every option; so
    // does anybody whose archetype is not a plain Humanoid (Beast, Draconic,
    // Ooze...), since only a Humanoid body is ever guaranteed to match its
    // gender at all. Nothing stored defaults to Humanoid, same as everywhere
    // else that reads this field (see _archetypeRowLabel).
    const archetype = profile?.archetype || 'Humanoid';
    const humanBody = window.HealthCore?.isHumanoidBody ? window.HealthCore.isHumanoidBody(archetype) : archetype === 'Humanoid'; // i18n-ignore: Archetypes.json key
    if (gender === 2 || gender === 3 || !humanBody) return pick(_GENITAL_ALL);

    // A Humanoid reads its rolled gender onto its body 80% of the time; the
    // other 20% it is any of the remaining five options.
    const matched = gender === 1 ? 1 : 0; // Uterus for Female-coded, Testes for Male-coded
    if (!rng) return matched;
    return rng.next() < 0.8 ? matched : pick(_GENITAL_ALL.filter(c => c !== matched));
  }

  // The body a stranger was rolled with, asked for before they hold a seat of
  // their own. Recruiting somebody has to write that roll into their seat's
  // reproduction variable, or the seat answers 0 (Testes) and the person the
  // player was talking to changes shape on joining (NPCSystemParty.js).
  window.NPCRolledGenitalCode = (npcName, profile) => _npcGenitalCode(npcName, profile);

  // A bubbaromantic NPC (Orientations.json: 8% of the population, romantically
  // attached to Bubba Wilson and to nobody else) is the one person Bubba is
  // offered the Court option with at all.
  function _isBubbaromanticNpc(npcName, profile) {
    if (!npcName) return false;
    try {
      return _npcRomance(npcName, profile).romantic?.key === 'bubbaromantic';
    } catch (e) {
      return false;
    }
  }

  // Bubba (Switch 49) courting the one person who has loved him from a
  // distance: every Court move on her lands, no roll needed.
  function _bubbaGuaranteedLand(npcName, profile, actor) {
    return !!(_isBubbaActor?.(actor) && _isBubbaromanticNpc(npcName, profile));
  }

  // Orientation and relationship style are one answer shared with the life
  // simulation and the romance engine: window.NPCRomance (NPCSociety.js,
  // SECTION 3d, ROMANCE IDENTITY). The base roll is stored on the profile,
  // reconciled with the partner the simulation actually gave them (nobody is
  // shown exclusively straight while married to a man), and an override
  // (profile._orientOverride, set by the sandbox, a dossier or the event spec)
  // wins over both. The Kinsey scale reads from the sexual entry, so a
  // swapped one recalculates the placement on its own.
  function _npcRomance(npcName, profile) {
    const R = window.NPCRomance;
    const o = R ? R.orientation(npcName, profile) : { sexual: null, romantic: null };
    return { sexual: o.sexual, romantic: o.romantic, genitalCode: _npcGenitalCode(npcName, profile) };
  }

  // The style a couple lives by, or a single person leans toward. A Propose
  // that landed writes profile._relStyleOverride, which is read back first
  // (see _proposeInteract); a couple from before styles were written down
  // reads the old roll, seeded on both names so each half says the same word.
  function _npcRelationshipStyle(npcName, partnered, profile) {
    return window.NPCRomance?.styleFor?.(npcName, partnered, profile) ?? null;
  }

  // Orientations.json and Relationships.json carry i18n keys rather than words
  // ("Orientations.sexual.heterosexual.name"), so what the panel shows comes
  // out of js/i18n/<lang>/plugins/. window.T, not the panel's own label object
  // (which every render function receives as `T`). Anything that resolves to
  // nothing is shown as written.
  function _dbText(value) {
    if (!value) return '';
    const key = String(value);
    return (window.T && window.T.has && window.T.has(key)) ? window.T(key) : key;
  }

  // A personality's English `name` in PersonalityData.json is its id; the word
  // the dossier prints is reached from it (js/i18n/<lang>/plugins/Personality.json).
  function _personalityLabel(name) {
    if (!name) return '';
    const key = 'Personality.' + String(name).toLowerCase().replace(/[^a-z0-9]/g, '') + '.name';
    return (window.T && window.T.has && window.T.has(key)) ? window.T(key) : String(name);
  }

  // ============================================================================
  // Partners and family (NPCLifeSim FAMILY)
  // ============================================================================
  // Everyone a person is with, not only the primary partner a monogamous
  // record keeps, and the kin the life simulation wrote both ways: children
  // with their life stage and age, parents, siblings, grandparents and
  // grandchildren, a pregnancy and an adoption under way.

  // i18n-ignore-start: bond, kin and life stage ids of NPCLife_Family
  const _QP_BOND = 'queerplatonic';
  const _KIN_STAGES = ['newborn', 'child', 'adult'];
  // record.kin[other] names what THIS person is to the other, so a 'parent'
  // entry is one of their children (NPCLife_Family childrenOf).
  const _KIN_SHELVES = [
    { kin: 'parent',      key: 'childrenLbl' },
    { kin: 'child',       key: 'parentsLbl' },
    { kin: 'sibling',     key: 'siblingsLbl' },
    { kin: 'grandchild',  key: 'grandparentsLbl' },
    { kin: 'grandparent', key: 'grandchildrenLbl' },
  ];
  // i18n-ignore-end
  const _KIN_CAP = 8;               // names per shelf before "+N more"

  function _partnersOf(record) {
    const L = window.NPCLifeSim;
    if (L?.partnersOf) { try { return L.partnersOf(record) || []; } catch (e) { /* read it here */ } }
    if (Array.isArray(record?.partners) && record.partners.length) return record.partners;
    return record?.partner ? [record.partner] : [];
  }

  // One row per partner once there is more than one of them: the primary
  // first, a queerplatonic bond called what it is.
  function _partnerRowsHTML(record) {
    const list = _partnersOf(record).filter(p => p && p.name);
    if (list.length < 2) return '';
    const rows = list.map((p, i) => {
      const nameHTML = p.external ? `<b>${_escapeHtml(p.name)}</b>` : _npcLink(p.name);
      const tags = [];
      if (i === 0) tags.push(`<span class="npc-badge">${_escapeHtml(window.T('Empathize.dossier.primaryTag'))}</span>`);
      if (p.bond === _QP_BOND) tags.push(`<span class="npc-badge npc-info">${_escapeHtml(window.T('Empathize.dossier.qpTag'))}</span>`);
      return `<div class="npc-ident-row npc-row-indent">${_iconSpan(84, 17)}<span>${nameHTML}</span>${tags.length ? '&nbsp;' + tags.join(' ') : ''}</div>`;
    }).join('');
    return `<div class="npc-ident-row npc-mt-1"><span class="npc-sub">${_escapeHtml(window.T('Empathize.dossier.partnersLbl'))}:</span></div>${rows}`;
  }

  function _familyNow() {
    return (typeof $gameVariables !== 'undefined' && $gameVariables?.value(114)) || 0;
  }

  // "Mira (child, 6 years)", a link to them.
  function _childEntryHTML(name) {
    const L = window.NPCLifeSim;
    let stage = null, age = null;
    try { stage = L?.lifeStageOf?.(name) || null; } catch (e) { stage = null; }
    try { age = L?.ageOf?.(name); } catch (e) { age = null; }
    const bits = [];
    if (_KIN_STAGES.includes(stage)) bits.push(window.T('Empathize.dossier.stage.' + stage));
    if (age != null && age >= 0) bits.push(window.T.n('Empathize.dossier.age', age));
    return _npcLink(name) + (bits.length ? ` <span class="npc-sub">(${_escapeHtml(bits.join(', '))})</span>` : '');
  }

  function _familySectionHTML(record) {
    if (!record || record.nonSentient) return '';
    const kin = record.kin && typeof record.kin === 'object' ? record.kin : {};
    let rows = '';
    for (const shelf of _KIN_SHELVES) {
      const names = Object.keys(kin).filter(n => kin[n] === shelf.kin).sort();
      if (!names.length) continue;
      const shown = names.slice(0, _KIN_CAP);
      const entries = shelf.kin === 'parent' ? shown.map(_childEntryHTML) : shown.map(_npcLink);
      const more = names.length - shown.length;
      rows += `<div class="npc-ident-row npc-top">${_iconSpan(84, 17)}<span class="npc-sub">${_escapeHtml(window.T('Empathize.dossier.' + shelf.key))}:</span>&nbsp;` +
        `<span>${entries.join(', ')}${more > 0 ? ` <span class="npc-note">${_escapeHtml(window.T('Empathize.dossier.more', { n: more }))}</span>` : ''}</span></div>`;
    }
    // A child on the way, and one being taken in. Nobody expects in a world
    // where families no longer form (NPCShared.WorldModes).
    const WM = window.NPCShared?.WorldModes;
    const families = !WM?.hasFamilies || WM.hasFamilies();
    const now = _familyNow();
    const dueRow = (entry, soonKey, daysKey) => {
      if (!entry || typeof entry !== 'object') return '';
      const due = Number(entry.dueMin);
      const days = Number.isFinite(due) ? Math.ceil((due - now) / 1440) : 0;
      const text = days > 0 ? window.T.n(daysKey, days) : window.T(soonKey);
      const other = entry.otherParent ? ` <span class="npc-sub">(${_npcLink(entry.otherParent)})</span>` : '';
      return `<div class="npc-ident-row">${_iconSpan(84, 17)}<span>${_escapeHtml(text)}</span>${other}</div>`;
    };
    if (families) {
      rows += dueRow(record.pregnancy, 'Empathize.dossier.expectingSoon', 'Empathize.dossier.expectingIn');
      rows += dueRow(record.adoption, 'Empathize.dossier.adoptingSoon', 'Empathize.dossier.adoptingIn');
    }
    if (!rows) return '';
    return `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(window.T('Empathize.dossier.familyTitle'))}</div>${rows}`;
  }

  function _npcLink(name) {
    const arg = String(name ?? '').replace(/[\\'"<>]/g, '');
    return `<span class="npc-wiki-link" onmousedown="event.stopPropagation();window.NPCEmpathize.openByName('${arg}')">${_escapeHtml(name)}</span>`;
  }

  Scene_NPCEmpathize.prototype._buildRomanceTabHTML = function (T, profile, npcName) {
    const nm   = v => _dbText(v?.name);
    const ds   = v => _dbText(v?.desc);
    const headerHTML = `<div class="npc-sec-hdr">${T.romanceTitle}</div><hr class="npc-r-sep">`;

    if (!npcName) {
      return `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noRomance)}</p>`;
    }

    const db = _orientationData();
    const { sexual, romantic, genitalCode } = _npcRomance(npcName, profile);

    const esotericTag = o => o?.esoteric
      ? ` <span class="npc-badge npc-note">${_escapeHtml(T.esotericTag)}</span>` : '';
    const pctLine = o => o
      ? `<span class="npc-note npc-aside">${o.pct}% ${_escapeHtml(T.ofPopulation)}</span>` : '';

    // ── Orientation ──
    let orientHTML = `<div class="npc-sec-hdr npc-mt-1">${T.orientationLbl}</div>`;
    if (romantic) {
      orientHTML += `<div class="npc-ident-row">${_iconSpan(84, 17)}<span class="npc-sub">${_escapeHtml(T.romanticLbl)}:</span>&nbsp;<span><b>${_escapeHtml(nm(romantic))}</b></span>${pctLine(romantic)}${esotericTag(romantic)}</div>`;
      if (ds(romantic)) orientHTML += `<div class="npc-thought npc-mt-1">${_escapeHtml(ds(romantic))}</div>`;
    }
    if (sexual) {
      orientHTML += `<div class="npc-ident-row npc-mt-2">${_iconSpan(84, 17)}<span class="npc-sub">${_escapeHtml(T.sexualLbl)}:</span>&nbsp;<span><b>${_escapeHtml(nm(sexual))}</b></span>${pctLine(sexual)}${esotericTag(sexual)}</div>`;
      if (ds(sexual)) orientHTML += `<div class="npc-thought npc-mt-1">${_escapeHtml(ds(sexual))}</div>`;
    }

    // ── Kinsey scale (only for orientations that map onto it) ──
    let kinseyHTML = '';
    const kv = (sexual && sexual.kinsey !== null && sexual.kinsey !== undefined) ? sexual.kinsey : null;
    if (kv !== null) {
      // Same in-data shape as every other string in Orientations.json: a key
      // per step, read through the same resolver the name and desc accessors
      // above use.
      const scale = db.kinseyScale || {};
      const desc  = _dbText(scale[String(kv)]);
      kinseyHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.kinseyLbl}</div>` +
        `<div class="npc-ident-row">${_iconSpan(87, 17)}<span><b>${_escapeHtml('Kinsey ' + kv)}</b></span><span class="npc-sub">&nbsp;, ${_escapeHtml(desc)}</span></div>`;
      if (kv !== 'X') {
        let dots = '';
        for (let i = 0; i <= 6; i++) {
          const on = i === kv;
          dots += `<span class="npc-kinsey-dot ${on ? 'on' : ''}" title="${i}"></span>`;
        }
        kinseyHTML += `<div class="npc-kinsey-row">${dots}</div>`;
      }
    }

    // ── Anatomy: genitals (from the prosthetic reproduction DB) ──
    const genName = _genitalName(genitalCode);
    const anatomyHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.anatomyLbl}</div>` +
      `<div class="npc-ident-row">${_iconSpan(120, 17)}<span class="npc-sub">${_escapeHtml(T.genitalsLbl)}:</span>&nbsp;<span><b>${_escapeHtml(genName)}</b></span></div>`;

    // ── Sentimental status (live, from NPCLifeSim) ──
    let statusHTML = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.sentimentalLbl}</div>`;
    let partnered = false, record = null;
    if (window.NPCLifeSim) {
      window.NPCLifeSim.ensureLifeRecord?.(npcName, profile?._homeGroupName);
      record = window.NPCLifeSim.getRecord?.(npcName) ?? null;
    }
    if (record) {
      const partner    = record.partner;
      partnered        = !!partner;
      const partnerHTML = partner ? (partner.external ? `<b>${_escapeHtml(partner.name)}</b>` : _npcLink(partner.name)) : '';
      const status = record.maritalStatus || 'single';
      let line;
      if      (status === 'married'  && partner) line = `${_escapeHtml(T.marriedTo)} ${partnerHTML}`;
      else if (partner?.bond === _QP_BOND)      line = `${_escapeHtml(window.T('Empathize.dossier.qpWith'))} ${partnerHTML}`;
      else if (status === 'dating'   && partner) line = `${_escapeHtml(T.datingLbl)} ${partnerHTML}`;
      else if (status === 'married')             line = _escapeHtml(T.stMarried);
      else if (status === 'widowed')             line = _escapeHtml(T.stWidowed);
      else if (status === 'divorced')            line = _escapeHtml(T.stDivorced);
      else                                       line = _escapeHtml(T.stSingle);
      statusHTML += `<div class="npc-ident-row">${_iconSpan(84, 17)}<span>${line}</span></div>`;
      statusHTML += _partnerRowsHTML(record);
      if (record.timesMarried > 1) {
        statusHTML += `<div class="npc-row-indent">${_escapeHtml((T.timesMarried).replace('{n}', record.timesMarried))}</div>`;
      }
      const exes = (record.exPartners || []).filter(Boolean);
      if (exes.length) {
        const exList = exes.slice(-4).map(e => {
          const nmHtml = e.external ? _escapeHtml(e.name) : _npcLink(e.name);
          const out    = e.outcome ? ` <span class="npc-sub">(${_escapeHtml(e.outcome)})</span>` : '';
          return `${nmHtml}${out}`;
        }).join(', ');
        statusHTML += `<div class="npc-ident-row npc-mt-1"><span class="npc-sub">${_escapeHtml(T.exPartnersLbl)}:</span>&nbsp;<span>${exList}</span></div>`;
      }
    } else {
      statusHTML += `<div class="npc-ident-row">${_iconSpan(84, 17)}<span>${_escapeHtml(T.stSingle)}</span></div>`;
    }

    // ── Relationship style (deterministic, conditioned on being partnered) ──
    let styleHTML = '';
    const style = _npcRelationshipStyle(npcName, partnered, profile);
    if (style) {
      styleHTML = `<div class="npc-ident-row npc-mt-2">${_iconSpan(83, 17)}<span class="npc-sub">${_escapeHtml(T.relStyleLbl)}:</span>&nbsp;<span><b>${_escapeHtml(nm(style))}</b></span></div>`;
      if (ds(style)) styleHTML += `<div class="npc-thought npc-mt-1">${_escapeHtml(ds(style))}</div>`;
    }

    return `${headerHTML}${orientHTML}${kinseyHTML}${anatomyHTML}${statusHTML}${styleHTML}`;
  };

  // ============================================================================
  // Romance actions (Court submenu in the chat tab)
  // ============================================================================
  // High-risk, high-reward counterparts to the Socialize moves: each one shows
  // its own success chance and swings the focused party member's reputation far
  // harder than a compliment ever could. Courting never starts an actual
  // relationship with the player, it only moves reputation.
  //
  // A move is impossible (0%, an outright rejection) when the NPC is in an
  // exclusive partnership, is aromantic, is asexual and the move is physical,
  // or when their orientation rules the focused party member out. Non-binary
  // and Cocoon people, on EITHER side of the exchange, satisfy every gendered
  // orientation. Lines and per-move numbers live in SocialLines.json.

  const _ROM_SAME_GENDER = new Set(['homosexual', 'homoromantic']);
  const _ROM_DIFF_GENDER = new Set(['heterosexual', 'heteroromantic']);
  const _ROM_SYNTHETIC   = new Set(['digisexual', 'botromantic']);
  const _ROM_BOTANIC     = new Set(['dendrosexual', 'dendroromantic']);
  // Partnered relationship styles that admit nobody else.
  const _ROM_EXCLUSIVE_STYLES = new Set([
    'monogamous', 'civil-union', 'arranged-marriage', 'long-distance', 'companionate',
  ]);
  // How open a relationship style leaves an NPC to being courted at all.
  const _ROM_STYLE_MOD = {
    'polyamorous': 10, 'portland-polycule': 12, 'open-relationship': 8, 'throuple': 8,
    'friends-with-benefits': 10, 'situationship': 8, 'serial-monogamy': 5,
    'queerplatonic': -8, 'single-content': -14,
  };
  // Gender codes (ActorCharacterFields / NPC profiles): 0 Male, 1 Female,
  // 2 Non-binary, 3 Cocoon. The last two are compatible with everyone.
  const _ROM_GENDER_FLUID = g => g === 2 || g === 3;

  // ==========================================================================
  // Unwanted courting
  // ==========================================================================
  // Being turned down is part of courting, refusing to hear it is not. Every
  // move made on somebody whose opinion of the suitor is already negative is
  // counted, and once the count runs out the nEuroPolice hear about it: a
  // harassment charge with the bounty that carries, and no Court option with
  // that person for that party member until they think well of them again.
  // Winning them back round is the only thing that lifts it.
  const _HARASS_STRIKES  = 3;   // unwanted moves tolerated before a complaint
  const _HARASS_CRIME    = 'harassment'; // i18n-ignore: PresetCrimes.json key
  const _HARASS_FALLBACK = 250; // bounty when PresetCrimes.json holds no entry

  function _harassRecord(profile, actorId) {
    if (!profile || actorId == null) return null;
    const book = (profile._courtHarassment ??= {});
    return (book[actorId] ??= { strikes: 0, filed: false, charges: 0 });
  }

  // Is Court off the table for this member right now? Reading it is also what
  // clears it, the moment the NPC's opinion of them turns positive again.
  function _courtRefused(profile, actorId, opinion) {
    const rec = profile?._courtHarassment?.[actorId];
    if (!rec?.filed) return false;
    if ((Number(opinion) || 0) > 0) { rec.filed = false; rec.strikes = 0; return false; }
    return true;
  }

  // Counts one unwanted move and files the complaint when the count runs out.
  // Returns the line to show the player when one was filed, null otherwise.
  // Neither of the two can be reported for pestering the other. She is allowed
  // to ask, he is allowed to keep saying no, and no amount of asking puts a
  // bounty on her head over the one man who would post her bail.
  function _pairExempt(actorName, npcName) {
    const pair = new Set(['em', 'bubba']); // i18n-ignore: actor names matched at runtime
    const a = String(actorName || '').trim().toLowerCase();
    const b = String(npcName   || '').trim().toLowerCase();
    return a !== b && pair.has(a) && pair.has(b);
  }

  function _recordUnwantedCourting(profile, actorId, npcName, actorName) {
    if (_pairExempt(actorName, npcName)) return null;
    const rec = _harassRecord(profile, actorId);
    if (!rec || rec.filed) return null;
    rec.strikes = (rec.strikes || 0) + 1;
    if (rec.strikes < _HARASS_STRIKES) return null;

    rec.strikes = 0;
    rec.filed   = true;
    rec.charges = (rec.charges || 0) + 1;

    const CS     = window.CrimeSystem;
    const preset = CS?.getPresetCrime?.(_HARASS_CRIME);
    // A second complaint from the same person is taken more seriously.
    const asked  = Math.round((preset?.bounty || _HARASS_FALLBACK) * Math.min(4, rec.charges));
    const label  = CS?.presetCrimeName?.(_HARASS_CRIME) || preset?.name || _HARASS_CRIME;
    // What the charge actually costs is CrimeSystem's to decide (Streetwise
    // discount, sandbox self-pardon, Eris immunity), so read it rather than
    // quote the asking figure. Its own toast is a Scene_Map one and will not
    // show over this panel, which is why the line below says it here.
    const before = CS?.getTotalBounty?.() ?? 0;
    CS?.addCrime?.(label, asked, _HARASS_CRIME);
    const fine = (CS?.getTotalBounty?.() ?? 0) - before;

    (profile.eventLog ??= []).push({
      tag: 'romance_harassment', desc: `complaint filed (${fine})`, // i18n-ignore: event-log record id
      timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
    });
    if ((profile.factionIndex ?? -1) >= 0 && window.$gameFactions?.changeReputation)
      window.$gameFactions.changeReputation(profile.factionIndex, -5);

    return fine > 0
      ? T('Empathize.courtHarassmentFiled', { name: npcName, actor: actorName, fine: _euros(fine) })
      : T('Empathize.courtHarassmentFiledFree', { name: npcName, actor: actorName });
  }

  function _romanceDb()      { return _socialLines().romance || {}; }
  function _romanceActions() { return _romanceDb().actions || []; }
  function _romanceRejection(reason) { return (_romanceDb().rejection || {})[reason] || null; }

  function _actorIsSynthetic(actor) {
    const cls = actor?.currentClass?.()?.name || '';
    if (/cyborg|android|robot|machine|automaton/i.test(cls)) return true;
    return (actor?._selectedTraits || []).some(t => /cyber|robot|synthetic|machine/i.test(t?.name || ''));
  }
  function _actorIsBotanic(actor) {
    // Reproduction type 3 is plant spores (ActorCharacterFields).
    if (actor?.reproductionType?.() === 3) return true;
    return /plant|flora|dryad|treant|fungus/i.test(actor?.currentClass?.()?.name || '');
  }

  // Is this NPC currently in a partnership, and under which style?
  function _romanceStanding(npcName, profile) {
    let partnered = false;
    if (window.NPCLifeSim) {
      window.NPCLifeSim.ensureLifeRecord?.(npcName, profile?._homeGroupName);
      partnered = !!window.NPCLifeSim.getRecord?.(npcName)?.partner;
    }
    return { partnered, style: _npcRelationshipStyle(npcName, partnered, profile) };
  }

  // Why (if at all) a romance move cannot land right now. Returns null when the
  // move is allowed, otherwise the key of a `rejection` pool in SocialLines.json.
  function _romanceBlockReason(profile, npcName, actor, def) {
    if (!actor || !npcName) return 'orientation';

    // Em (Switch 48). Bubba is spoken for by a goddess who bends probability at
    // her rivals, and the people who blame her for the death of the Father, or
    // simply want her gone, are not going to be courted by her either.
    if (_isEmActor?.(actor)) {
      const stanceKey = _emStanceKey?.(profile, npcName, $gameMap?.event(SceneManager._scene?._eventId));
      if (stanceKey === 'bubba')   return 'bubbaHimself';
      if (stanceKey === 'zealot')  return 'emZealot';
      if (stanceKey === 'annoyed') return 'emAnnoyed';
    }

    const { sexual, romantic } = _npcRomance(npcName, profile);
    const { partnered, style } = _romanceStanding(npcName, profile);

    // 1. Spoken for, exclusively.
    if (partnered && _ROM_EXCLUSIVE_STYLES.has(style?.key)) return 'taken';
    if (style?.key === 'aromantic-solo') return 'aromantic';

    // 2. No romantic pull at all, and no physical one for asexual NPCs.
    if (romantic?.key === 'aromantic') return 'aromantic';
    if (def.physical && sexual?.key === 'asexual') return 'asexual';

    // 3. The orientation governing this move: physical moves answer to the
    //    sexual orientation, everything else to the romantic one, each falling
    //    back to the other when the governing one opts out entirely.
    const gov = def.physical
      ? (sexual   && sexual.key   !== 'asexual'   ? sexual   : romantic)
      : (romantic && romantic.key !== 'aromantic' ? romantic : sexual);
    if (!gov) return null;

    // 4. Orientations that want something the party simply is not.
    if (gov.key === 'bubbaromantic' && !/bubba/i.test(actor.name() || '')) return 'bubba';
    if (_ROM_SYNTHETIC.has(gov.key) && !_actorIsSynthetic(actor))          return 'synthetic';
    if (_ROM_BOTANIC.has(gov.key)   && !_actorIsBotanic(actor))            return 'botanic';

    // 5. Gender, unless either side is Non-binary or Cocoon.
    const ag = actor.gender ? actor.gender() : 0;
    const ng = profile?.gender ?? 0;
    if (_ROM_GENDER_FLUID(ag) || _ROM_GENDER_FLUID(ng)) return null;
    if (_ROM_SAME_GENDER.has(gov.key) && ag !== ng) return 'orientation';
    if (_ROM_DIFF_GENDER.has(gov.key) && ag === ng) return 'orientation';
    return null;
  }

  // Courting the same person over and over wears thin fast; repeating one
  // particular move wears thinnest of all.
  function _romanceFatigue(profile, id) {
    const nowMin = $gameVariables?.value(114) ?? 0;
    const cutoff = nowMin - 2 * 1440;
    let same = 0, any = 0;
    for (const e of profile?.eventLog || []) {
      if (typeof e?.tag !== 'string' || !e.tag.startsWith('romance_')) continue;
      if ((e.gameMin ?? 0) < cutoff) continue;
      any++;
      if (e.tag === 'romance_' + id) same++;
    }
    return any + same * 2;
  }

  function _romanceCharm(actor) {
    if (!actor) return 0;
    const luk = actor.luk ?? 0;
    return Math.max(-10, Math.min(14, Math.round((luk - 20) / 5) + Math.floor((actor.level ?? 1) / 8)));
  }

  // Odds the move lands. Attraction is now the dominant term (it is the axis
  // courting actually spends and builds, see _addNpcAttraction), disposition
  // a secondary one (trait compatibility and the hygiene of both parties
  // already ride inside the effective opinion), the boldness tier the main
  // brake.
  const _ROM_TIER_PENALTY = 11;
  // Courting happens at arm's length or closer, so the hygiene reading that
  // already dulled the disposition is felt a second time here, at full weight
  // in percentage points. Traits still rule it: a Feral suitor never notices,
  // a Germaphobe cannot get past it. See _hygienePenalty
  // (NPCEmpathize.js) for the whole table.
  const _ROM_HYGIENE_WEIGHT = 1;
  function _romanceChance(profile, npcName, actor, def, opinion, attraction) {
    const { sexual, romantic } = _npcRomance(npcName, profile);
    const { style }            = _romanceStanding(npcName, profile);

    let c = 44
      + (Number(attraction) || 0) * 0.55
      + (Number(opinion) || 0) * 0.20
      + _romanceCharm(actor)
      + Math.round((_personalitySocialMult(profile, 'positive') - 1) * 22)
      + (_ROM_STYLE_MOD[style?.key] || 0)
      + _hygienePenalty(profile, actor, _ROM_HYGIENE_WEIGHT)
      - (Number(def.tier) || 1) * _ROM_TIER_PENALTY
      - _romanceFatigue(profile, def.id) * 5;

    // Demi NPCs need the bond before anything else can grow on it.
    if ((sexual?.key === 'demisexual' || romantic?.key === 'demiromantic') && opinion < 45) c -= 25;
    // A sapioromantic is courted with wit rather than looks.
    if (romantic?.key === 'sapioromantic') c += Math.max(-8, Math.min(12, Math.round(((actor?.mat ?? 0) - 20) / 4)));
    // Nobody warms to a stranger they already dislike.
    if (opinion <= -60) c -= 15;

    // Good clothes open doors, the courting kind included.
    c += window.NPCEmpathize.Look?.odds('romance', actor, profile) || 0;
    return Math.round(Math.max(3, Math.min(95, c)));
  }

  // ==========================================================================
  // Propose (Court -> Propose)
  // ==========================================================================
  // A step past ordinary courting: naming an actual relationship out loud
  // instead of letting an attraction sit there unspent. It needs attraction
  // itself running very high, since that is the one axis courting exists to
  // build; it reads far better when the style asked for is already the one
  // the other person leans toward, and better again when the proposing party
  // member leans the exact same way.
  const _PROPOSE_MIN_ATTRACTION  = 60;  // below this the question is not even entertained
  const _PROPOSE_BASE            = -30;
  const _PROPOSE_ATTR_WEIGHT     = 0.9;
  const _PROPOSE_OPINION_WEIGHT  = 0.18;
  const _PROPOSE_NPC_MATCH_BONUS = 24;  // the style asked for is what THEY lean toward
  const _PROPOSE_MUTUAL_BONUS    = 20;  // AND the proposer leans the very same way

  // Every style an actual partnership could settle into; the "solo" styles
  // describe not being partnered at all, which a proposal is the opposite of.
  function _proposeStyles() {
    return (_relationshipData().styles || []).filter(s => s.mode === 'partnered' || s.mode === 'any');
  }

  // Reuses the ordinary Court gate (taken, aromantic, orientation, Em/Bubba...)
  // before adding the one rule that belongs to Propose alone.
  function _proposeBlockReason(profile, npcName, actor, attraction) {
    const reason = _romanceBlockReason(profile, npcName, actor, { physical: false });
    if (reason) return reason;
    if ((Number(attraction) || 0) < _PROPOSE_MIN_ATTRACTION) return 'lowAttraction';
    return null;
  }

  function _proposeChance(profile, npcName, actor, styleKey, attraction, opinion) {
    const npcStyle   = _npcRelationshipStyle(npcName, true, profile);
    const actorStyle = actor ? _npcRelationshipStyle(actor.name(), true, _getProfile(actor.name())) : null;
    let c = _PROPOSE_BASE
      + (Number(attraction) || 0) * _PROPOSE_ATTR_WEIGHT
      + (Number(opinion)    || 0) * _PROPOSE_OPINION_WEIGHT
      + _romanceCharm(actor)
      + Math.round((_personalitySocialMult(profile, 'positive') - 1) * 20)
      + _hygienePenalty(profile, actor, _ROM_HYGIENE_WEIGHT);
    if (npcStyle && styleKey === npcStyle.key) {
      c += _PROPOSE_NPC_MATCH_BONUS;
      if (actorStyle && styleKey === actorStyle.key) c += _PROPOSE_MUTUAL_BONUS;
    }
    return Math.round(Math.max(2, Math.min(96, c)));
  }

  // The Court submenu's rows, one per move, each carrying its own odds and the
  // reason it cannot land when it cannot.
  Scene_NPCEmpathize.prototype._romanceOptions = function () {
    const lang       = ConfigManager.language === 'it' ? 'it' : 'en';
    const npcName    = this._targetName();
    const profile    = _getProfile(npcName);
    const actor      = this._focusActor();
    const opinion    = this._focusOpinion(profile);
    const attraction = this._focusAttraction(profile);

    // Bubba (Switch 49) courting the one person who has loved him from a
    // distance for years: every move on her lands.
    const guaranteed = _bubbaGuaranteedLand(npcName, profile, actor);

    const moves = _romanceActions().map(def => {
      const reason = guaranteed ? null : _romanceBlockReason(profile, npcName, actor, def);
      const pool   = reason ? _romanceRejection(reason) : null;
      return {
        id:     def.id,
        label:  def.label || def.id,
        reason,
        reasonLabel: pool ? (pool.reasonLabel || '') : '',
        chance: reason ? 0 : (guaranteed ? 100 : _romanceChance(profile, npcName, actor, def, opinion, attraction)),
        gain:   Number(def.successDelta) || 0,
        loss:   Number(def.failDelta)    || 0,
      };
    });

    // Propose opens a further choice (which relationship style) rather than
    // resolving here, so it carries no single chance of its own to show.
    const proposeReason = _proposeBlockReason(profile, npcName, actor, attraction);
    moves.push({
      id: 'propose',
      label: T.proposeLabel,
      reason: proposeReason,
      reasonLabel: proposeReason === 'lowAttraction'
        ? T.proposeNeedsAttraction
        : (proposeReason ? (_romanceRejection(proposeReason)?.reasonLabel || '') : ''),
      chance: null,
      gain: 0,
      loss: 0,
      submenu: true,
    });
    return moves;
  };

  // Says out loud what the odds below have already been docked for, so a run of
  // suddenly hopeless numbers reads as a bath the party skipped rather than as
  // the NPC turning cold. Only the side that is actually noticed is mentioned,
  // and a suitor whose traits ignore the smell is told nothing.
  const _ROM_HYGIENE_HINT_AT = -4; // opinion points, below which it is worth saying
  Scene_NPCEmpathize.prototype._buildRomanceHygieneHint = function () {
    const npcName = this._targetName();
    const profile = _getProfile(npcName);
    const actor   = this._focusActor();
    if (!profile || !actor) return '';
    const { theirs, mine } = _hygieneReadout(profile, actor);
    const lines = [];
    if (theirs <= _ROM_HYGIENE_HINT_AT) lines.push(T('Empathize.hygieneCourtSelf', { name: npcName }));
    if (mine   <= _ROM_HYGIENE_HINT_AT) lines.push(T('Empathize.hygieneCourtNpc',  { name: npcName }));
    if (!lines.length) return '';
    return `<div class="npc-note npc-mb-1">` +
      lines.map(l => _escapeHtml(l)).join('<br>') + `</div>`;
  };

  Scene_NPCEmpathize.prototype._buildInlineRomanceActions = function (T) {
    let html = this._buildRomanceHygieneHint();
    html += this._romanceOptions().map(o => {
      const open = `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._romanceInteract('${o.id}')">`;
      if (o.reason) {
        return `${open}<span class="${OPT} npc-sub">${_escapeHtml(o.label)}</span>` +
          `<span class="npc-bad npc-aside">0%</span>` +
          (o.reasonLabel ? `<span class="npc-note npc-aside-sm">${_escapeHtml(o.reasonLabel)}</span>` : '') +
          `</div>`;
      }
      // Propose carries no single chance of its own: it opens a further page,
      // one row per relationship style, each with its own odds.
      if (o.submenu) {
        return `${open}<span class="${OPT}">${_escapeHtml(o.label)}</span>` +
          `<span class="npc-sub npc-aside">&rsaquo;</span></div>`;
      }
      const cc = o.chance >= 60 ? 'good' : o.chance >= 30 ? 'warm' : 'bad';
      return `${open}<span class="${OPT}">${_escapeHtml(o.label)}</span>` +
        `<span class="npc-good npc-aside">+${o.gain}♥</span>` +
        `<span class="npc-bad npc-aside-sm">${o.loss}♥</span>` +
        `<span class="npc-score--${cc} npc-aside npc-em">${o.chance}%</span></div>`;
    }).join('');
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // Leaves the Court list for the Propose list: every relationship style the
  // world knows, each with its own odds against this NPC. Refuses quietly
  // (the row was already greyed out) if reached through a stale panel.
  Scene_NPCEmpathize.prototype._openPropose = function () {
    const npcName    = this._targetName();
    const profile    = _getProfile(npcName);
    const actor      = this._focusActor();
    const attraction = this._focusAttraction(profile);
    if (_proposeBlockReason(profile, npcName, actor, attraction)) { SoundManager.playBuzzer(); return; }
    SoundManager.playCursor();
    this._romanceMode = false;
    this._proposeMode  = true;
    this._menuIndex    = 0;
    this._render();
  };

  Scene_NPCEmpathize.prototype._proposeOptions = function () {
    const nm          = v => _dbText(v?.name);
    const npcName     = this._targetName();
    const profile     = _getProfile(npcName);
    const actor       = this._focusActor();
    const opinion     = this._focusOpinion(profile);
    const attraction  = this._focusAttraction(profile);
    return _proposeStyles().map(style => ({
      key:    style.key,
      label:  nm(style),
      chance: _proposeChance(profile, npcName, actor, style.key, attraction, opinion),
    }));
  };

  Scene_NPCEmpathize.prototype._buildInlineProposeActions = function (T) {
    let html = `<div class="npc-note npc-mb-2">${_escapeHtml(T.proposeSubtitle)}</div>`;
    html += this._proposeOptions().map(o => {
      const cc = o.chance >= 60 ? 'good' : o.chance >= 30 ? 'warm' : 'bad';
      return `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._proposeInteract('${o.key}')">` +
        `<span class="${OPT}">${_escapeHtml(o.label)}</span>` +
        `<span class="npc-score--${cc} npc-aside npc-em">${o.chance}%</span></div>`;
    }).join('');
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelPropose()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  // Steps back from the style picker to the Court list it was opened from,
  // rather than all the way out to the standing menu of verbs.
  Scene_NPCEmpathize.prototype._cancelPropose = function () {
    this._proposeMode = false;
    this._romanceMode = true;
    this._menuIndex   = 0;
    this._render();
  };

  // Resolving a proposal: unlike an ordinary Court move it can actually start
  // something. A landed proposal writes the style asked for onto this NPC's
  // own record (_npcRelationshipStyle reads profile._relStyleOverride first,
  // exactly the way profile._orientOverride already overrules a rolled
  // orientation) and updates NPCLifeSim's sentimental-status record, the one
  // the Romance tab already reads live, so the panel tells the truth about it
  // from the very next render.
  Scene_NPCEmpathize.prototype._proposeInteract = async function (styleKey) {
    const nm      = v => _dbText(v?.name);
    const style   = (_relationshipData().styles || []).find(s => s.key === styleKey);
    if (!style) return;
    const npcName = this._targetName();
    const profile = _getProfile(npcName);
    const actor   = this._focusActor();
    const actorId = actor && actor.actorId();
    const fill    = s => vary(String(s || '').replace(/\{name\}/g, npcName).replace(/\{style\}/g, nm(style)));

    const priorOpinion = this._focusOpinion(profile);
    if (_courtRefused(profile, actorId, priorOpinion)) { SoundManager.playBuzzer(); return; }

    const priorAttraction = this._focusAttraction(profile);
    const reason = _proposeBlockReason(profile, npcName, actor, priorAttraction);
    const bank   = (_socialLines().romance || {}).propose || {};
    // Em puts a proposal the way she puts everything: sideways.
    let playerLine = fill(_emVoiceLine(actor, 'propose', styleKey) || _rand(bank.player));
    let npcLine, delta, landed = false;

    if (reason) {
      const pool = _romanceRejection(reason) || {};
      npcLine = fill(_rand(pool.lines)) || fill(_rand(bank.reject));
      delta   = Number(pool.delta) || -4;
    } else {
      const chance = _proposeChance(profile, npcName, actor, styleKey, priorAttraction, priorOpinion);
      if (window.Dice3D) {
        const res = await window.Dice3D.rollPercentage(chance, {
          actionName: `Proposal: ${nm(style)}`,
          statName: 'PSI',
          modifier: actor?.psiMod || 0
        });
        landed = res.success;
      } else {
        landed = Math.random() * 100 < chance;
      }
      npcLine = fill(_rand(landed ? bank.accept : bank.reject));
      delta   = landed ? 20 : -14;
    }
    // An icon of a look proposes in its own voice and is answered as one.
    if (!_emVoiceLine(actor, 'propose', styleKey)) {
      const sig = _signatureLines('propose', 'propose', landed ? 'accept' : 'reject', actor, profile);
      if (sig.player) playerLine = fill(sig.player);
      if (sig.npc && !reason) npcLine = fill(sig.npc);
    }

    if (profile && actorId != null) {
      _addNpcAttraction(profile, actorId, delta);
      (profile.eventLog ??= []).push({
        tag: 'romance_propose', desc: `propose ${styleKey} (${delta >= 0 ? '+' : ''}${delta})`, // i18n-ignore: event-log record id
        timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
      });
      if ((profile.factionIndex ?? -1) >= 0 && delta !== 0 && window.$gameFactions?.changeReputation)
        window.$gameFactions.changeReputation(profile.factionIndex, Math.round(delta / 8));
    }

    if (landed && profile) {
      profile._relStyleOverride = styleKey;
      if (window.NPCLifeSim && actor) {
        window.NPCLifeSim.ensureLifeRecord?.(npcName, profile?._homeGroupName);
        const record = window.NPCLifeSim.getRecord?.(npcName);
        if (record) {
          record.partner            = { name: actor.name(), external: true };
          record.maritalStatus      = (styleKey === 'arranged-marriage' || styleKey === 'civil-union')
            ? 'married' : 'dating';
          record.partnerSinceMinute = $gameVariables?.value(114) ?? 0;
        }
      }
    }

    const charge = priorOpinion < 0
      ? _recordUnwantedCourting(profile, actorId, npcName, actor ? actor.name() : '')
      : null;

    if (landed) SoundManager.playOk(); else SoundManager.playBuzzer();

    if (window.Diary && actor) {
      window.Diary.onRomance(actor.name(), npcName, 'propose_' + styleKey, landed);
    }

    this._proposeMode = false;
    this._romanceMode = false;
    this._activeTab   = 'chat';
    this._pushPlayerLine(playerLine);
    const deltaText   = `${delta >= 0 ? '+' : ''}${delta} ♥ (${actor ? actor.name() : ''})`;
    this._joinMessage = charge
      ? { type: 'reject', text: `${charge} ${deltaText}` }
      : { type: landed ? 'accept' : 'reject', text: deltaText };
    this._replyNpc(npcLine);
  };

  Scene_NPCEmpathize.prototype._romanceInteract = async function (id) {
    if (id === 'propose') return this._openPropose();
    const def = _romanceActions().find(a => a.id === id);
    if (!def) return;
    const npcName = this._targetName();
    const profile = _getProfile(npcName);
    const actor   = this._focusActor();
    const actorId = actor && actor.actorId();
    const fill    = s => vary(String(s || '').replace(/\{name\}/g, npcName));

    // A complaint already on file takes Court off the menu, so this is only
    // reachable through a stale panel: refuse it rather than act on it.
    const priorOpinion = this._focusOpinion(profile);
    if (_courtRefused(profile, actorId, priorOpinion)) { SoundManager.playBuzzer(); return; }

    const priorAttraction = this._focusAttraction(profile);
    // Bubba (Switch 49) courting the one person who has loved him from a
    // distance for years: every move on her lands, no roll needed.
    const guaranteed = _bubbaGuaranteedLand(npcName, profile, actor);
    const reason = guaranteed ? null : _romanceBlockReason(profile, npcName, actor, def);
    // A pass made by Em is made in her register, not in the house one: she
    // does not serenade anybody, she says something flat and British about it
    // and waits. Falls straight back to the shared bank for anybody else.
    let playerLine = fill(_emVoiceLine(actor, 'romance', def.id) || _rand(def.player));
    let npcLine, delta, landed = false;

    if (reason) {
      // Incompatible / 0% chance: a Nat 20 will NOT guarantee result and still yields 0 / failure
      const pool = _romanceRejection(reason) || {};
      npcLine = fill(_rand(pool.lines));
      delta   = Number(pool.delta) || 0;
      landed  = false;
    } else {
      const chance = guaranteed ? 100 : _romanceChance(profile, npcName, actor, def, priorOpinion, priorAttraction);
      if (guaranteed) {
        landed = true;
      } else if (window.Dice3D) {
        const res = await window.Dice3D.rollPercentage(chance, {
          actionName: `Romance: ${def.label || id}`,
          statName: 'PSI',
          modifier: actor?.psiMod || 0
        });
        landed = res.success;
      } else {
        landed = Math.random() * 100 < chance;
      }
      npcLine = fill(_rand(landed ? def.responseGood : def.responseBad));
      delta   = landed
        ? Math.max(1,  Math.round(def.successDelta * _personalitySocialMult(profile, 'positive')))
        : Math.min(-1, Math.round(def.failDelta    * _personalitySocialMult(profile, 'negative')));
    }
    // An icon of a look courts in its own voice and is answered as one. A
    // refusal on grounds (orientation, already taken...) keeps its own reason.
    if (!_emVoiceLine(actor, 'romance', def.id)) {
      const sig = _signatureLines('romance', def.id, landed ? 'good' : 'bad', actor, profile);
      if (sig.player) playerLine = fill(sig.player);
      if (sig.npc && !reason) npcLine = fill(sig.npc);
    }

    // Reputation is tracked apart from attraction: a move that lands moves how
    // much this NPC WANTS the focused member rather than how much they think
    // of them in general. Nothing is written to the NPCLifeSim partnership
    // record either, that is what Propose (below) is for.
    // Em raising it with Bubba. Nothing is written to attraction, because there
    // is none in either direction and the bar stays on zero forever: what moves
    // is the bond, and this is the only thing in the game that moves it down.
    const pairCtx = this._pairCtx?.() ?? null;
    if (pairCtx) _addPairBond(-Math.max(4, Math.abs(delta)));

    if (profile && actorId != null && !pairCtx) {
      _addNpcAttraction(profile, actorId, delta);
      (profile.eventLog ??= []).push({
        tag: 'romance_' + id, desc: `${id} (${delta >= 0 ? '+' : ''}${delta})`,
        timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
      });
      if ((profile.factionIndex ?? -1) >= 0 && delta !== 0 && window.$gameFactions?.changeReputation)
        window.$gameFactions.changeReputation(profile.factionIndex, Math.round(delta / 8));
    }

    // Pressing a suit on somebody who already dislikes the suitor is pestering
    // rather than flirting, and the third time it is a matter for the law.
    const charge = priorOpinion < 0
      ? _recordUnwantedCourting(profile, actorId, npcName, actor ? actor.name() : '')
      : null;

    // In the Holy Vatican Empire a touch shared in public is indecency under
    // canon law (CrimeSystem.publicAffection), and between two people of the
    // same gender it is fined ten times over. The crime toast is a Scene_Map
    // one, so the panel says it here.
    const indecency = landed ? (window.CrimeSystem?.publicAffection?.(actor, profile, id) ?? null) : null;
    const indecencyLine = indecency
      ? T(indecency.sameGender ? 'Empathize.indecencyFiledSameGender' : 'Empathize.indecencyFiled', {
          actor: actor ? actor.name() : '', name: npcName,
          charge: window.CrimeSystem.canonChargeName(indecency.charge), fine: _euros(indecency.fine),
        })
      : null;

    if (landed) SoundManager.playOk(); else SoundManager.playBuzzer();

    // A suit pressed, and how it landed, in the party's own diary (Diary.js).
    if (window.Diary && actor) {
      window.Diary.onRomance(actor.name(), npcName, id, landed);
    }

    this._romanceMode = false;
    this._activeTab   = 'chat';
    this._pushPlayerLine(playerLine);
    const deltaText   = `${delta >= 0 ? '+' : ''}${delta} ♥ (${actor ? actor.name() : ''})`;
    const filed = [charge, indecencyLine].filter(Boolean).join(' ');
    this._joinMessage = filed
      ? { type: 'reject', text: `${filed} ${deltaText}` }
      : { type: delta >= 0 ? 'accept' : 'reject', text: deltaText };
    // The bank line is what this person says: only free chat goes to the model.
    this._replyNpc(npcLine);
  };

  // ============================================================================
  // Ask Directions (chat submenu)
  // ============================================================================
  // The NPC points the player at anything worth walking to on the current map:
  // the door / teleport events, and everyone else standing on it. One tile
  // reads as one metre, and the bearing is taken from the PLAYER rather than
  // from the speaker, since it is the player who has to walk it.

  const _DIR_LABEL_KEYS = ['dirN', 'dirNE', 'dirE', 'dirSE', 'dirS', 'dirSW', 'dirW', 'dirNW'];
  const _DIR_FALLBACK   = ['north', 'north-east', 'east', 'south-east',
                           'south', 'south-west', 'west', 'north-west'];
  // Event names that count as a way out of the map.
  const _DIR_DOOR_RE = /^(doors?|teleport|transfer)\b/i;
  // Notes that mark an event as a person (NPCSystem's ai/local tags, or the
  // <NPC-classId> tag the society system stamps on citizens).
  const _DIR_PERSON_RE = /\bai\b|\blocal\b|NPC-\d+/i;
  const _DIR_MAX_PER_GROUP = 10;
  const _DIR_HERE_RADIUS   = 2; // closer than this and a bearing is meaningless

  // Exit event names are written for the map editor, not for the player:
  // "Door (1416 - Story mode Inn)", "Transfer (566 Training center)",
  // "Teleport - Roma". Only the place on the far side is worth saying out loud,
  // so the map id, the plumbing word and the punctuation between them all go.
  function _destinationName(rawName) {
    // A place that is a travel destination is said the way its Destinations.json
    // entry names it; anything else is said as the event wrote it.
    const spoken = (s) => window.WorkSystem?.destinationName
      ? window.WorkSystem.destinationName(s) : s;
    const name = String(rawName || '').trim();
    const paren = name.match(/\(([^)]*)\)/);
    if (paren) {
      const inner = paren[1].replace(/^\s*\d+\s*[-–—:.]?\s*/, '').trim();
      if (inner) return spoken(inner);
    }
    // "Teleport - Roma", "Door: Cellar", "Transfer 2 - Docks"
    const dashed = name.match(/^[A-Za-z]+\s*\d*\s*[-–—:]\s*(.+)$/);
    if (dashed && dashed[1].trim()) return spoken(dashed[1].trim());
    return spoken(name);
  }

  // Four doors onto the same Grove are one place as far as the player is
  // concerned, so entries are folded by the name they resolve to (case and
  // spacing ignored) rather than being numbered apart.
  function _dirGroupKey(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // 0 = north, then clockwise in 45 degree sectors. Map y grows southward.
  function _compassLabel(T, dx, dy) {
    const deg = Math.atan2(-dy, dx) * 180 / Math.PI; // 0 = east, 90 = north
    const i   = Math.round(((450 - deg) % 360) / 45) % 8;
    return T[_DIR_LABEL_KEYS[i]] || _DIR_FALLBACK[i];
  }

  // Everything on the map the speaker could sensibly point at, split into the
  // two groups the submenu shows and sorted nearest-first.
  Scene_NPCEmpathize.prototype._collectDirectionTargets = function () {
    const px = $gamePlayer?.x ?? 0;
    const py = $gamePlayer?.y ?? 0;
    const speaker = this._eventId;
    const doors = [], people = [];
    for (const ev of ($gameMap?.events?.() || [])) {
      if (!ev || ev._erased || ev.eventId() === speaker) continue;
      const data = ev.event?.();
      const name = (data?.name || '').trim();
      if (!name || /^Player\d+$/.test(name)) continue;
      const dx = ev.x - px, dy = ev.y - py;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      // A door is listed (and asked about) by where it leads, never by the
      // editor name; people already carry the name the player knows them by.
      // A Note on the event itself ("Dirty Inn") overrides the parsed name,
      // matching MapLevelDisplay's door-name override on the arrival banner.
      if (_DIR_DOOR_RE.test(name)) {
        const noteOverride = (data?.note || '').trim();
        doors.push({ name: noteOverride || _destinationName(name), dx, dy, dist });
      }
      else if (_DIR_PERSON_RE.test(data?.note || '') || _getProfile(name)) people.push({ name, dx, dy, dist });
    }
    // Nearest first, then folded by name: every way into the same place is one
    // row, standing for the nearest of them, carrying how many there are.
    const trim = list => {
      list.sort((a, b) => a.dist - b.dist);
      const byKey = {};
      const groups = [];
      for (const e of list) {
        const key = _dirGroupKey(e.name);
        if (byKey[key]) { byKey[key].count++; continue; }
        e.count = 1;
        e.label = e.name;
        byKey[key] = e;
        groups.push(e);
      }
      return groups.slice(0, _DIR_MAX_PER_GROUP);
    };
    return { doors: trim(doors), people: trim(people) };
  };

  Scene_NPCEmpathize.prototype._buildInlineDirectionActions = function (T) {
    const { doors, people } = this._collectDirectionTargets();
    // Flattened once here and kept on the scene, so the click handler answers
    // about exactly the row that was drawn.
    this._directionList = [...doors, ...people];

    const hdr = text =>
      `<div class="npc-row-full">${_escapeHtml(text)}</div>`;
    const row = (entry, i) =>
      `<div class="npc-chat-action-btn" onmousedown="event.stopPropagation();SceneManager._scene._answerDirections(${i})">` +
      `<span>${_escapeHtml(entry.label)}</span>` +
      (entry.count > 1
        ? `<span class="npc-sub npc-aside">${_escapeHtml(T('Empathize.directionsCount', { count: String(entry.count) }))}</span>`
        : '') +
      `<span class="npc-sub npc-aside">${entry.dist} m</span></div>`;

    let html = '';
    if (!this._directionList.length) {
      html = `<span class="npc-empty--inline">${_escapeHtml(T.directionsNone)}</span>`;
    } else {
      if (doors.length) {
        html += hdr(T.directionsDoors);
        html += doors.map((e, i) => row(e, i)).join('');
      }
      if (people.length) {
        html += hdr(T.directionsPeople);
        html += people.map((e, i) => row(e, doors.length + i)).join('');
      }
    }
    html += `<div class="npc-chat-action-btn npc-faint" onmousedown="event.stopPropagation();SceneManager._scene._cancelSubMode()">${_escapeHtml(T.cancel)}</div>`;
    return html;
  };

  Scene_NPCEmpathize.prototype._answerDirections = function (index) {
    const entry = (this._directionList || [])[index];
    if (!entry) return;
    const T = _getT();

    // Even asking the way is asked in her voice when it is Em asking.
    const emAsk = _emVoiceLine(this._focusActor(), 'directions');
    const ask = emAsk
      ? vary(String(emAsk).replace(/{target}/g, entry.label).replace(/{name}/g, this._targetName() || ''))
      : T('Empathize.directionsIntro', { target: entry.label });
    // A folded row stands for several of the same place, so the answer says
    // which one it is pointing at.
    const key = entry.dist <= _DIR_HERE_RADIUS ? 'directionsHere'
      : (entry.count > 1 ? 'directionsAnswerNearest' : 'directionsAnswer');
    const answer = vary(T('Empathize.' + key, {
      target: entry.label,
      count: String(entry.count || 1),
      dist: String(entry.dist),
      dir: _compassLabel(T, entry.dx, entry.dy),
    }));

    this._directionsMode = false;
    this._activeTab      = 'chat';
    this._joinMessage    = null;
    this._pushPlayerLine(ask);
    // The directions are the panel's answer and never the model's: only free
    // chat is handed to the model.
    this._replyNpc(answer);
  };

  // ============================================================================
  // Life history tab
  // ============================================================================

  // Em's history is the one the world already wrote for her (docs/Lore.odt), and
  // the only party member's past the life simulator can never produce: the
  // Solomonic Ritual took it. Printed above whatever has since been recorded,
  // with the procedural paragraph for the branch THIS Em arrived from last.
  function _buildEmBackstoryHTML(T, actorObj) {
    const CP = window.CharacterPresets;
    if (!actorObj || !CP?.getEmBackstory || !CP.isEmPlaythrough?.()) return '';
    if (actorObj.name() !== 'Em') return '';
    const story = CP.getEmBackstory(ConfigManager.language);
    if (!story || !story.paragraphs?.length) return '';
    const body = story.paragraphs
      .map(p => `<p class="npc-para">${_linkify(p)}</p>`)
      .join('');
    const branch = story.branch
      ? `<div class="npc-routine-sub-hdr">${_escapeHtml(T.emBranchHdr)}</div>
         <div class="npc-backstory-text">${_linkify(story.branch)}</div>`
      : '';
    return `<div class="npc-backstory-text">${body}</div>${branch}`;
  }

  Scene_NPCEmpathize.prototype._buildLifeHistoryHTML = function (T, profile, npcName) {
    const headerHTML = `
      <div class="npc-sec-hdr npc-mb-2">${T.lifeHistoryTitle}</div>
      <hr class="npc-r-sep">`;

    const actorObj = this._actorId != null ? $gameActors.actor(this._actorId) : null;
    const emHTML = _buildEmBackstoryHTML(T, actorObj);

    // An animal's own life (NPCLife_Animals): born, weaned, litters, a close
    // call, growing old, off its life record rather than a person's log.
    let animalHTML = '';
    if (npcName && window.NPCLifeSim && this._isNonSentientSubject?.()) {
      const rec = window.NPCLifeSim.getRecord?.(npcName);
      const events = (rec?.nonSentient && Array.isArray(rec.lifeEvents)) ? rec.lifeEvents : [];
      if (events.length) {
        const rows = events.slice(0, 20).map(e => `
          <div class="npc-life-row">
            <span class="npc-life-time">${_escapeHtml(e.date || '')}</span>
            <span>${_escapeHtml(window.NPCLifeSim.lifeEventText?.(e) || '')}</span>
          </div>`).join('');
        animalHTML = `<div class="npc-routine-sub-hdr">${_escapeHtml(window.T('Empathize.animalLifeEvents'))}</div>${rows}`;
      }
    }

    const log = profile?.eventLog ?? [];
    if (!log.length) {
      if (animalHTML) return `${headerHTML}${emHTML}${animalHTML}`;
      return emHTML
        ? `${headerHTML}${emHTML}`
        : `${headerHTML}<p class="npc-empty">${_escapeHtml(T.noLifeHistory)}</p>`;
    }

    const narrative = window.NPCSim?.StoryLogger?.generateNarrative?.(npcName)
      ?? T('Empathize.noRecordedHistory', { name: npcName });

    const rows = _collapseByDay(log.map(e => ({
      min:  e.gameMin ?? e.minute ?? 0,
      text: _goldTextToEuros(window.NPCSim?.StoryLogger?.textOf?.(e) ?? e.desc ?? ''),
    }))).map(g => `
      <div class="npc-life-row">
        <span class="npc-life-time">${_escapeHtml(g.when)}</span>
        <span>${_escapeHtml(g.text)}${_timesSuffix(g.count)}</span>
      </div>`).join('');

    return `
      ${headerHTML}
      ${emHTML}
      <div class="npc-backstory-text">${_escapeHtml(_goldTextToEuros(narrative))}</div>
      ${_buildQuestHistoryHTML(T, npcName)}
      ${animalHTML}
      <div class="npc-routine-sub-hdr">${T.lifeHistoryTimeline}</div>
      ${rows}`;
  };

  // Contracts this person has posted and the party has taken, honoured or not.
  // ProceduralQuestSystem records them per NPC name; a person the party has never
  // worked for contributes nothing to the page.
  function _buildQuestHistoryHTML(T, npcName) {
    const api = window.ProceduralQuests;
    if (!api || typeof api.npcQuestHistory !== 'function' || !npcName) return '';
    let log = [];
    try { log = api.npcQuestHistory(npcName) || []; } catch (e) { return ''; }
    if (!log.length) return '';

    const isIt = ConfigManager.language === 'it';
    const fmt = gameMin => _gameStamp(gameMin, true);
    const done = log.filter(e => e.outcome === 'done').length;
    const failed = log.length - done;

    const rows = log.slice().reverse().map(e => {
      const ok = e.outcome === 'done';
      const badge = ok ? (isIt ? 'ONORATO' : 'HONOURED') : (isIt ? 'FALLITO' : 'FAILED');
      const band = ok ? 'good' : 'bad';
      return `
        <div class="npc-life-row">
          <span class="npc-life-time">${fmt(e.minute)}</span>
          <span><strong class="npc-score--${band}">${badge}</strong> ${_escapeHtml(String(e.title || ''))}</span>
        </div>`;
    }).join('');

    const summary = T('Empathize.contractsSummary', { done: done, failed: failed });

    return `
      <div class="npc-routine-sub-hdr">${_escapeHtml(T('Empathize.contractsWithYou'))}</div>
      <div class="npc-thought">${_escapeHtml(summary)}</div>
      ${rows}`;
  }

  Object.assign(Scene_NPCEmpathize._internal, {
    _courtRefused, _dbText, _isBubbaromanticNpc, _orientationData, _personalityLabel,
    _WEB_WHEEL_STEP,
  });
})();
