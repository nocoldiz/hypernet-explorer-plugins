/*:
 * @target MZ
 * @plugindesc NPC Empathize UI: screens 4 and 5, the entity wiki and its index
 * @author Omni-Lex
 * @base NPCEmpathizeUI
 * @orderAfter NPCEmpathizeUI
 * @orderAfter NPCEmpathizeUI_Dossier
 * @help
 * ============================================================================
 * NPCEmpathizeUI_Wiki, part of the NPCEmpathizeUI family
 * ============================================================================
 * Owns SCREEN 4 OF 5 (the entity wiki), the wiki index tab, the armies
 * shelf, SCREEN 5 OF 5 (the wiki index) and the More tab.
 *
 * Reads the helpers it shares with the rest of the family off
 * Scene_NPCEmpathize._internal and publishes its own there. Load it right after
 * NPCEmpathizeUI_Dossier.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const { Scene_NPCEmpathize } = window.NPCEmpathize;
  const {
    _atypeName, _axisBarRow, _bustUrl, _ccHover, _dbText, _emblemOf, _encId, _escapeHtml, _euros,
    _eventRows, _getT, _headTitle, _iconSpan, _ideologyLabel, _kvRow, _LEADER_OF_KIND,
    _leaderIdeology, _linkify, _meterRow, _paramLabels, _presetTraitBank, _statBarRow, _swapHTML,
    _traitDisplayName, _viewName, _wikiDeathDate, _wikiIsDead, _wikiLink, _worldName, _wtypeName,
    EQUIP_ICON, SKILL_ICON, SPEC_ICON, T2, TRAIT_ICON, Wiki,
  } = Scene_NPCEmpathize._internal;

  // ============================================================================
  // WIKI, entity profile rendering (nations, hyperpowers, leaders, artifacts,
  // factions). The chat tab does not exist here; tabs are entity-specific and
  // every recognized name in the content is a hyperlink to its own profile.
  // ============================================================================

  const ENTITY_TAB_SETS = {
    nation:   T => [
      { id: 'overview',   label: T.overview },
      { id: 'govHistory', label: T.governmentHistory },
      { id: 'elections',  label: T.electionRecords },
      { id: 'events',     label: T.eventsTab },
    ],
    power:    T => [
      { id: 'overview',  label: T.overview },
      { id: 'leaders',   label: T.leadersTab },
      { id: 'elections', label: T.electionRecords },
      { id: 'events',    label: T.eventsTab },
    ],
    leader:   T => [
      { id: 'overview', label: T.overview },
      { id: 'events',   label: T.eventsTab },
    ],
    artifact: T => [
      { id: 'overview', label: T.overview },
      { id: 'holders',  label: T.holdersTab },
    ],
    faction:  T => [
      { id: 'overview', label: T.overview },
      { id: 'members',  label: T.membersTab },
      { id: 'events',   label: T.eventsTab },
    ],
    // One of the worlds the Omega Tower opens onto. It has a full article
    // like any nation, and no card on the wiki's front page: those shelves
    // list Earth, and a floor world is not on Earth. It is reached by
    // clicking somebody who is from one (NPCEmpathize.getWorld).
    world:    T => [
      { id: 'overview', label: T.overview },
      { id: 'people',   label: T.worldPeopleTab },
    ],
  };

  // ============================================================================
  // SCREEN 4 OF 5: THE ENTITY WIKI
  // ============================================================================
  // An article about a thing rather than a person: a nation, a hyperpower, a
  // faction, a party, a creed, an artifact or a historical leader. Same shell,
  // same tab bar, a different subject.

  Scene_NPCEmpathize.prototype._renderEntityInner = function () {
    const T    = _getT();
    const ent  = this._entity;
    const view = Wiki.get(ent.type, ent.id);

    const tabs = view ? (ENTITY_TAB_SETS[view.type]?.(T) ?? [{ id: 'overview', label: T.overview }])
                      : [{ id: 'overview', label: T.overview }];
    tabs.push({ id: 'wiki', label: T.wikiTab });
    this._entityTabs = tabs.map(t => t.id);
    if (!this._entityTabs.includes(this._activeTab)) this._activeTab = this._entityTabs[0];

    if (this._tabBarEl) {
      // Same chip as everywhere else, closing the panel when there is nothing
      // behind it to go back to.
      const backHTML = this._buildBackBtnHTML(T, { closeWhenEmpty: true });
      _swapHTML(this._tabBarEl, backHTML + this._buildTabHintHTML() + tabs.map(tab => `
        <div class="npc-tab${this._activeTab === tab.id ? ' active' : ''}"
             onmousedown="event.stopPropagation();SceneManager._scene._setTab('${tab.id}')">${_escapeHtml(tab.label)}</div>`).join(''));
      this._tabBarEl.classList.toggle('npc-tab-bar--focused', this._activeArea === 'tabs');
    }

    if (!this._leftEl || !this._rightEl) return;
    this._rightEl.classList.remove('npc-right-panel--chat');

    if (!view) {
      _swapHTML(this._leftEl, `
        <div class="npc-entity-emblem">?</div>
        <div class="npc-entity-title">${_escapeHtml(String(ent.id))}</div>`);
      _swapHTML(this._rightEl, this._activeTab === 'wiki'
        ? this._buildWikiTabHTML(T)
        : `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`);
      return;
    }

    _swapHTML(this._leftEl, this._buildEntityLeftHTML(view, T));

    let rightHTML;
    const tab = this._activeTab;
    if (tab === 'wiki') {
      rightHTML = this._buildWikiTabHTML(T);
    } else if (view.type === 'nation') {
      rightHTML = tab === 'govHistory' ? this._buildNationGovHistoryHTML(view, T)
        : tab === 'elections' ? this._buildElectionsHTML(view.ownGov || view.power, T)
        : tab === 'events'    ? this._buildEntityEventsHTML(view, T)
        : this._buildNationOverviewHTML(view, T);
    } else if (view.type === 'power') {
      rightHTML = tab === 'leaders' ? this._buildPowerLeadersHTML(view, T)
        : tab === 'elections' ? this._buildElectionsHTML(view.live, T)
        : tab === 'events'    ? this._buildEntityEventsHTML(view, T)
        : this._buildPowerOverviewHTML(view, T);
    } else if (view.type === 'leader') {
      rightHTML = tab === 'events' ? this._buildEntityEventsHTML(view, T)
        : this._buildLeaderOverviewHTML(view, T);
    } else if (view.type === 'artifact') {
      rightHTML = tab === 'holders' ? this._buildArtifactHoldersHTML(view, T)
        : this._buildArtifactOverviewHTML(view, T);
    } else if (view.type === 'faction') {
      rightHTML = tab === 'members' ? this._buildFactionMembersHTML(view, T)
        : tab === 'events' ? this._buildEntityEventsHTML(view, T)
        : this._buildFactionOverviewHTML(view, T);
    } else if (view.type === 'party') {
      rightHTML = this._buildPartyOverviewHTML(view, T);
    } else if (view.type === 'world') {
      rightHTML = tab === 'people' ? this._buildWorldPeopleHTML(view, T)
        : this._buildWorldOverviewHTML(view, T);
    } else if (view.type === 'ideology') {
      rightHTML = this._buildIdeologyOverviewHTML(view, T);
    } else {
      rightHTML = this._buildEntityEventsHTML(view, T);
    }
    _swapHTML(this._rightEl, rightHTML);
  };

  // ── Left column: emblem + entity-specific side panel (replaces needs bars) ──

  Scene_NPCEmpathize.prototype._buildEntityLeftHTML = function (view, T) {
    const emblem = _emblemOf(view.type);
    const kickerMap = {
      nation: T.wikiNation, power: T.wikiHyperpower, leader: T.wikiLeader,
      artifact: T.wikiArtifact, faction: T.wikiFaction,
      party: T.wikiPoliticalParty, ideology: T.wikiIdeology,
    };
    const kicker = kickerMap[view.type] || emblem.kicker;

    let sideHTML = '';
    if (view.type === 'power') {
      const s = view.live?.state;
      if (s) {
        sideHTML =
          _meterRow(T.legitimacy, s.legitimacy, 'npc-fill--ok') +
          _meterRow(T.stability,  s.stability,  'npc-fill--mp') +
          _meterRow(T.unrest,        s.unrest,     'npc-fill--bad') +
          _meterRow(T.economyLbl,   s.economyMood, 'npc-fill--warn') +
          `<div class="npc-ident-row npc-mt-2">${_iconSpan(314, 17)}<span>${T.treasury}: ${_euros(view.live.state.treasury)}</span></div>`;
      } else if (view.hist) {
        sideHTML =
          _statBarRow(T.militaryLbl,       Math.round(view.hist.military ?? 0),    400, 'npc-fill--bad') +
          _statBarRow(T.economyLbl,         Math.round(view.hist.economy ?? 0),     400, 'npc-fill--warn') +
          _statBarRow(T.informationLbl, Math.round(view.hist.information ?? 0), 400, 'npc-fill--mp') +
          _statBarRow(T.arcaneLbl,           Math.round(view.hist.arcane ?? 0),      400, 'npc-fill--info');
      }
      // Show current holy leader for dual-track powers (e.g. Holy Vatican Empire)
      if (view.currentHoly) {
        sideHTML += `<hr class="npc-r-sep">` +
          `<div class="npc-ident-row">${_iconSpan(245, 17)}<span class="npc-sub">${_escapeHtml(T.holyLeader)}:</span>&nbsp;${_wikiLink('leader', view.currentHoly.name)}</div>`;
      }
    } else if (view.type === 'nation') {
      const ctrlHTML = view.controller !== 'Neutral'
        ? _wikiLink('power', view.controller)
        : `<span>${_escapeHtml(T.independent)}</span>`;
      sideHTML = `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.controlledBy)}:</span>&nbsp;${ctrlHTML}</div>`;
      if (view.government) sideHTML += _kvRow(186, T.government, _escapeHtml(view.government));
      // The nation's own government first; the bloc holding it only when the
      // nation keeps none of its own.
      const s = (view.ownGov || view.power)?.state;
      if (s) {
        sideHTML += `<hr class="npc-r-sep">` +
          _meterRow(T.legitimacy, s.legitimacy, 'npc-fill--ok') +
          _meterRow(T.stability,  s.stability,  'npc-fill--mp') +
          _meterRow(T.unrest,        s.unrest,     'npc-fill--bad') +
          _meterRow(T.economyLbl,   s.economyMood, 'npc-fill--warn');
      }
    } else if (view.type === 'leader') {
      if (view.kind === 'politician' && view.pol) {
        const p = view.pol;
        sideHTML =
          _statBarRow(T.charisma,   Math.round(p.charisma),  100, 'npc-fill--warn') +
          _statBarRow(T.integrity, Math.round(p.integrity), 100, 'npc-fill--ok') +
          _statBarRow(T.cunning,     Math.round(p.cunning),   100, 'npc-fill--info') +
          _statBarRow(T.ambition,   Math.round(p.ambition),  100, 'npc-fill--bad') +
          _meterRow(T.approval,     p.approval, 'npc-fill--mp');
      } else if (view.leader) {
        sideHTML = _kvRow(186, T.ideologyLbl, _escapeHtml(_leaderIdeology(view.leader))) +
          _kvRow(220, T.reignLbl, _escapeHtml(`${view.leader.years?.[0] ?? '?'} – ${view.leader.years?.[1] ?? '?'}`));
      }
    } else if (view.type === 'artifact') {
      const data = view.data;
      if (data) {
        if (Array.isArray(data.params)) {
          const PL = _paramLabels();
          data.params.forEach((v, i) => {
            if (v) sideHTML += _statBarRow(PL[i], v, 255, 'npc-fill--info');
          });
        }
        sideHTML += `<hr class="npc-r-sep">` +
          `<div class="npc-ident-row">${_iconSpan(314, 17)}<span>${T.valueLbl}: <strong>${_euros(data.price)}</strong></span></div>`;
        if (data.weight) sideHTML += _kvRow(208, T.weightLbl, `${data.weight}`);
      }
      if (view.rec) {
        sideHTML += _kvRow(220, T.discovered, _escapeHtml(view.rec.date || '?'));
        const holder = view.rec.holders?.[view.rec.holders.length - 1];
        if (holder) sideHTML += `<div class="npc-ident-row">${_iconSpan(210, 17)}<span class="npc-sub">${_escapeHtml(T.currentHolder)}:</span>&nbsp;${_linkify(holder.holder)}</div>`;
      }
    } else if (view.type === 'faction') {
      const h = view.hist;
      if (h) {
        sideHTML =
          _statBarRow(T.arcaneLbl,           Math.round(h.arcane ?? 0),      200, 'npc-fill--info') +
          _statBarRow(T.techLbl,               Math.round(h.tech ?? 0),        200, 'npc-fill--warn') +
          _statBarRow(T.informationLbl, Math.round(h.information ?? 0), 200, 'npc-fill--mp');
      } else if (view.dlFaction) {
        sideHTML =
          _statBarRow(T.arcaneLbl,           Math.round(view.dlFaction.arcane ?? 0),      200, 'npc-fill--info') +
          _statBarRow(T.techLbl,               Math.round(view.dlFaction.velocity ?? 0),   200, 'npc-fill--warn') +
          _statBarRow(T.informationLbl, Math.round(view.dlFaction.information ?? 0), 200, 'npc-fill--mp');
      }
      // Show parent hyperpower if present
      if (view.parentPower) {
        sideHTML += `<hr class="npc-r-sep">` +
          `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.wikiHyperpower)}:</span>&nbsp;${_wikiLink('power', view.parentPower)}</div>`;
      }
    } else if (view.type === 'party') {
      const p = view.party;
      sideHTML = `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.wikiHyperpower)}:</span>&nbsp;${_wikiLink('power', view.power.name)}</div>`;
      if (view.ideology) sideHTML += `<div class="npc-ident-row">${_iconSpan(187, 17)}<span class="npc-sub">${_escapeHtml(T.ideologyLbl)}:</span>&nbsp;${_wikiLink('ideology', view.ideology.id, _ideologyLabel(view.ideology.id))}</div>`;
      if (view.leader) sideHTML += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(T.leaderOfPartyLbl)}:</span>&nbsp;${_wikiLink('leader', view.leader.name)}</div>`;
      sideHTML += `<hr class="npc-r-sep">`;
      if (p.foundedYear != null) sideHTML += _kvRow(220, T.foundedLbl, `${p.foundedYear}`);
      if (p.lastShare != null) sideHTML += _kvRow(216, T.lastShareLbl, `${p.lastShare}%${p.seats ? ` · ${p.seats} ${T.seats?.toLowerCase?.() || 'seats'}` : ''}`);
      sideHTML += _kvRow(314, T.fundsLbl, _euros(p.funds));
    } else if (view.type === 'ideology') {
      const ax = view.ideo?.axes || {};
      sideHTML =
        _axisBarRow(T.axisEcon, ax.econ, 'npc-fill--warn') +
        _axisBarRow(T.axisAuth, ax.auth, 'npc-fill--bad') +
        _axisBarRow(T.axisTrad, ax.trad, 'npc-fill--info') +
        _axisBarRow(T.axisMil,  ax.mil,  'npc-fill--mp') +
        _axisBarRow(T.axisMyst, ax.myst, 'npc-fill--ok');
    }

    let deadHTML = '';
    if (view.type === 'leader' && view.death) {
      const when = view.death.date ? `, ${_escapeHtml(view.death.date)}` : '';
      deadHTML = `<div class="npc-dead-badge">✝ ${_escapeHtml(T.deceased)}${when}</div>`;
    }

    // A leader is a person, and the portrait here is the same picture the panel
    // that opens on them shows (both ask HistoryManager.leaderBust), so
    // stepping from the article into the person never changes who you are
    // looking at. Where the book has no picture for them the article is headed
    // by nothing at all: no emblem of initials stands in for a face, and a
    // named portrait with no file behind it leaves the head empty.
    const bustPath = view.type === 'leader' ? _leaderBustPath(view) : null;
    const headHTML = bustPath
      ? `<div class="npc-portrait-wrap">
           <img src="${_escapeHtml(bustPath)}" alt=""
                onerror="this.parentElement.hidden=true">
         </div>`
      : '';

    return `
      ${headHTML}
      <div class="npc-entity-kicker">${_escapeHtml(kicker)}</div>
      <div class="npc-entity-title">${_escapeHtml(_viewName(view))}</div>
      ${_wikiFavStarHTML(view.type, view.id ?? view.name, _viewName(view), T)}
      ${deadHTML}
      ${view.type === 'leader' ? _leaderEmpathizeButtonHTML(view, T) : ''}
      <div class="npc-vitals-footer">${sideHTML}</div>`;
  };

  // The portrait a leader's article is headed with. The dossier carries it
  // (LeaderPersona resolves the book's own `bust` first, then the bust their
  // walk sheet already has); a procedural politician the book never named has
  // none, and their article is simply headed by their name.
  function _leaderBustPath(view) {
    const stored = view?.dossier?.bustPath;
    if (!stored || stored === '7' || stored === 0 || stored === '0') return null;
    // The book can name a portrait that was never drawn (a dossier edited by
    // hand, a look that never got its art). No house bust stands in for it:
    // an unresolvable or missing name means no portrait at all.
    return _bustUrl(stored, null);
  }

  // Every leader is a living character, whether or not they were ever drawn on
  // a map: the world's politics moves them, the century's events are written
  // about them, and the society sim mints a person for the name the moment
  // anybody asks for one. This is the way in. It opens the ordinary Empathize
  // panel by name, which is the same panel a person standing in the street
  // gets, so a leader can be read, talked to and remembered like anyone else.
  function _leaderEmpathizeButtonHTML(view, T) {
    const name = String(view?.name ?? '');
    if (!name) return '';
    const safe = _encId(name);
    const d = view.dossier;
    // Which version of them the panel will open on, said plainly before it is
    // opened: the one this world made of them, or the one they start as.
    const noteKey = d && SOURCE_NOTE_KEYS[d.source];
    const note = noteKey ? T[noteKey] : '';
    // A leader who is travelling with the player is not read remotely: their
    // own actor is opened, so the panel shows the character sheet the player
    // has been building rather than a profile of somebody by that name.
    const open = (d && d.source === 'party' && d.actorId)
      ? `window.NPCEmpathize.openForActor(${d.actorId})`
      : `window.NPCEmpathize.openByName(decodeURIComponent('${safe}'))`;
    return `
      <div class="npc-entity-empathize">
        <div class="npc-chat-action-btn" onmousedown="event.stopPropagation();${open}">
          ${_iconSpan(82, 16)} ${_escapeHtml(T.empathizeBtn)}
        </div>
        ${note ? `<div class="npc-entity-empathize-note">${_escapeHtml(note)}</div>` : ''}
      </div>`;
  }

  // Where a leader's sheet came from, in the reader's words. `preset` and
  // `synthetic` are both "as they begin"; the other three say this world has
  // already made something of them.
  // What a leader's sheet was read off, said out loud on the article. An
  // untaken dossier says nothing: "playable, as they begin" is the default
  // state of every one of them and was noise on every page it appeared on.
  const SOURCE_NOTE_KEYS = {
    party:     'leaderSourceParty',
    retired:   'leaderSourceRetired',
    past:      'leaderSourcePast',
    preset:    '',
    synthetic: '',
  };

  // ── Nation ──────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildNationOverviewHTML = function (view, T) {
    // Seats, head, next election and policies are the nation's own when it
    // has a government of its own, and the holding bloc's otherwise.
    const power = view.ownGov || view.power;
    let html = `<div class="npc-profile-name">${_escapeHtml(_viewName(view))}</div>`;
    const sub = [view.government,
      view.controller !== 'Neutral' ? _worldName('power', view.controller) : (T.independent)].filter(Boolean);
    html += `<div class="npc-profile-sub">${_escapeHtml(sub.join(' · '))}</div><hr class="npc-r-sep">`;

    html += `<div class="npc-sec-hdr">${T.government}</div>`;
    if (view.government) html += _kvRow(186, T.government, _escapeHtml(view.government));
    html += `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.controlledBy)}:</span>&nbsp;${
      view.controller !== 'Neutral' ? _wikiLink('power', view.controller) : _escapeHtml(T.independent)
    }</div>`;
    if (view.faction && view.faction !== 'Neutral') {
      html += `<div class="npc-ident-row">${_iconSpan(187, 17)}<span class="npc-sub">${_escapeHtml(T.wikiFaction)}:</span>&nbsp;${_linkify(_worldName('faction', view.faction))}</div>`;
    }
    if (power) {
      const head = power.politicians?.[power.headId];
      html += _kvRow(216, T.seats, `${power.seats}, ${_escapeHtml(window.NPCPolitics?.powerLabel?.(power, 'legislature') || power.legislature)}`);
      if (head) html += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(_headTitle(power))}:</span>&nbsp;${_wikiLink('leader', head.name)}</div>`;
      const dateOf = window.NPCPolitics?.dateOf;
      if (power.nextElectionMinute != null && dateOf) {
        html += _kvRow(220, T.nextElection, _escapeHtml(dateOf(power.nextElectionMinute)));
      }
      const pol = power.policies;
      if (pol) {
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.policiesLbl}</div>
          <div class="npc-stats-row">${_escapeHtml(`${T.taxRate} ${pol.taxRate}% · ${T.censorship} ${pol.censorship} · ${T.conscription} ${pol.conscription} · ${T.welfare} ${pol.welfare}`)}${pol.curfew ? ` · <span class="npc-bad npc-em">${_escapeHtml(T.curfewActive)}</span>` : ''}</div>`;
      }
    }

    // Latest government change, for flavor
    const last = view.history[view.history.length - 1];
    if (last && view.history.length > 1) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.governmentHistory}</div>
        <div class="npc-life-row"><span class="npc-life-time">${_escapeHtml(last.date)}</span><span>${_linkify(`${last.government} (${last.reason})`)}</span></div>`;
    }

    if (view.settlements.length) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.settlementsLbl}</div>`;
      for (const s of view.settlements) {
        const mayor = s.offices?.mayor;
        html += `<div class="npc-ident-row">${_iconSpan(190, 17)}<span>${_escapeHtml(s.group)}</span>${
          mayor ? `<span class="npc-sub">&nbsp;- ${_escapeHtml(T.mayorLbl)}:&nbsp;</span>${_wikiLink('npc', mayor)}` : ''
        }</div>`;
      }
    }

    if (view.seasons) {
      const su = view.seasons.summer, wi = view.seasons.winter;
      if (su && wi) {
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.climateLbl}</div>
          <div class="npc-stats-row">${su.dayTemp}°C / ${su.nightTemp}°C &nbsp;·&nbsp; ${wi.dayTemp}°C / ${wi.nightTemp}°C</div>`;
      }
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildNationGovHistoryHTML = function (view, T) {
    let html = `<div class="npc-sec-hdr">${T.governmentHistory}</div><hr class="npc-r-sep">`;
    if (!view.history.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    // newest first
    html += view.history.slice().reverse().map(rec => `
      <div class="npc-life-row">
        <span class="npc-life-time">${_escapeHtml(rec.date)}</span>
        <span><strong>${_escapeHtml(rec.government)}</strong>
          ${rec.controller !== 'Neutral' ? `- ${_wikiLink('power', rec.controller)}` : `- ${_escapeHtml(T.independent)}`}
          <span class="npc-sub">(${_linkify(rec.reason || '')})</span></span>
      </div>`).join('');
    return html;
  };

  // ── Elections (shared by nation + hyperpower) ───────────────────────────────

  Scene_NPCEmpathize.prototype._buildElectionsHTML = function (power, T) {
    let html = `<div class="npc-sec-hdr">${T.electionRecords}</div><hr class="npc-r-sep">`;
    if (!power || !power.elections?.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    const dateOf = window.NPCPolitics?.dateOf;
    if (power.nextElectionMinute != null && dateOf) {
      html += _kvRow(220, T.nextElection, _escapeHtml(dateOf(power.nextElectionMinute)));
      html += `<hr class="npc-r-sep">`;
    }
    for (const e of power.elections.slice(0, 10)) {
      html += `<div class="npc-routine-sub-hdr">${_escapeHtml(e.date)}${e.label === 'snap' ? ` (${T.snapLbl})` : ''}${e.turnout != null ? `, ${T.turnoutLbl} ${e.turnout}%` : ''}</div>`;
      for (const r of (e.results || []).slice(0, 5)) {
        const isWinner = r.partyId === e.winnerPartyId || r.name === e.winner;
        html += `
          <div class="npc-vital-row">
            <span class="npc-vital-lbl npc-vital-lbl--wide ${isWinner ? 'npc-em' : ''}">${_escapeHtml(r.name)}</span>
            <div class="npc-vital-track"><div class="npc-vital-fill ${isWinner ? 'npc-fill--green' : 'npc-fill--bark'}" style="--npc-w:${Math.min(100, r.share)}%"></div></div>
            <span class="npc-vital-pct npc-vital-pct--wide">${r.share}%${r.seats != null ? ` · ${r.seats}` : ''}</span>
          </div>`;
      }
      if (e.head && e.head !== '-') {
        html += `<div class="npc-ident-row npc-mt-1">${_iconSpan(215, 15)}<span class="npc-sub">${_escapeHtml(_headTitle(power))}:</span>&nbsp;${_wikiLink('leader', e.head)}</div>`;
      }
      for (const n of (e.notes || [])) {
        html += `<div class="npc-stats-row npc-sub">* ${_linkify(n)}</div>`;
      }
    }
    return html;
  };

  // ── Hyperpower ──────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildPowerOverviewHTML = function (view, T) {
    const live = view.live;
    let html = `<div class="npc-profile-name">${_escapeHtml(_viewName(view))}</div>`;
    const sub = [live?.govType, live?.legislature].filter(Boolean);
    html += `<div class="npc-profile-sub">${_escapeHtml(sub.join(' · '))}</div><hr class="npc-r-sep">`;

    if (live) {
      const head = live.politicians?.[live.headId];
      const ruling = live.parties?.find(p => p.id === live.rulingPartyId);
      html += `<div class="npc-sec-hdr">${T.government}</div>`;
      html += _kvRow(186, T.government, _escapeHtml(live.govType));
      if (head) html += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(_headTitle(live))}:</span>&nbsp;${_wikiLink('leader', head.name)}<span class="npc-sub">&nbsp;(${T.approval} ${Math.round(head.approval)}%)</span></div>`;
      else html += _kvRow(215, live.headTitle, _escapeHtml(T.vacant));
      if (ruling) html += _kvRow(187, T.rulingParty, _wikiLink('party', ruling.id, ruling.name) + (live.coalition?.length > 1 ? ` <span class="npc-sub">(+${live.coalition.length - 1})</span>` : ''));
      else if (head) html += _kvRow(187, T.rulingParty, _escapeHtml(T.independent));
      html += _kvRow(216, T.seats, `${live.seats}, ${_escapeHtml(live.legislature)}`);
      const dateOf = window.NPCPolitics?.dateOf;
      if (live.nextElectionMinute != null && dateOf) html += _kvRow(220, T.nextElection, _escapeHtml(dateOf(live.nextElectionMinute)));

      // A bloc's bench is made of the benches of the nations inside it
      // (NPCPolitics.ensureCountryParties stamps `country` on every party), so
      // the chamber is printed nation by nation rather than as one long list.
      // The home nation leads, the rest follow in name order; a party with no
      // nation of its own (an off-world power's own bench) sits under the
      // power's name.
      if (live.parties?.length) {
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.partiesLbl}</div>`;
        const byNation = new Map();
        for (const p of live.parties) {
          const key = p.country || live.name;
          if (!byNation.has(key)) byNation.set(key, []);
          byNation.get(key).push(p);
        }
        const keys = Array.from(byNation.keys()).sort((a, b) => {
          if (a === live.homeNation) return -1;
          if (b === live.homeNation) return 1;
          return String(a).localeCompare(String(b));
        });
        for (const nation of keys) {
          const isNation = nation !== live.name;
          html += `<div class="npc-ident-row npc-mt-1">${_iconSpan(97, 15)}<span class="npc-sub">${
            isNation ? _wikiLink('nation', nation) : _escapeHtml(_worldName('power', nation))
          }</span></div>`;
          for (const p of byNation.get(nation)) {
            const leader = live.politicians?.[p.leaderId];
            html += `<div class="npc-ident-row npc-wiki-party-row">${_iconSpan(187, 17)}<span>${_wikiLink('party', p.id, p.name)}</span><span class="npc-sub">&nbsp;- ${p.lastShare}%${p.seats ? ` · ${p.seats} ${T.seats?.toLowerCase?.() || 'seats'}` : ''}</span>${
              leader ? `<span class="npc-sub">&nbsp;·&nbsp;</span>${_wikiLink('leader', leader.name)}` : ''
            }</div>`;
          }
        }
      }

      const pol = live.policies;
      if (pol) {
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.policiesLbl}</div>
          <div class="npc-stats-row">${_escapeHtml(`${T.taxRate} ${pol.taxRate}% · ${T.censorship} ${pol.censorship} · ${T.conscription} ${pol.conscription} · ${T.welfare} ${pol.welfare} · ${T.festivalsLbl} ${pol.festivals}`)}${pol.curfew ? ` · <span class="npc-bad npc-em">${_escapeHtml(T.curfewActive)}</span>` : ''}</div>`;
      }
    }

    // The yearbook figures rather than the simulation's bare indices: how many
    // people live here, how many of them are under arms, how many practise the
    // arcane, what the place produces in a year and how free its press is
    // (HistoryManager.realFigures / freedomRank own that reading).
    if (view.hist) {
      const fig = window.HistoryManager?.realFigures?.(view.hist);
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.stats}</div>`;
      if (fig) {
        const rank = window.HistoryManager?.freedomRank?.(view.name || _viewName(view));
        html += _kvRow(97,  T.inhabitantsLbl,   _escapeHtml(fig.population.toLocaleString()));
        html += _kvRow(322, T.soldiersLbl,      _escapeHtml(fig.soldiers.toLocaleString()));
        html += _kvRow(101, T.practitionersLbl, _escapeHtml(fig.practitioners.toLocaleString()));
        html += _kvRow(314, T.gdpLbl,           _escapeHtml(_euros(fig.gdp * 100)));  // _euros reads cents
        html += _kvRow(193, T.freedomIndexLbl,
          _escapeHtml(`${fig.freedom}/100${rank ? ` (#${rank.rank}/${rank.of})` : ''}`));
      } else {
        html += `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
      }
    }

    // What this power actually has in the field, as against the yearbook's
    // count of everybody of military age: the columns the roster is moving
    // around the map right now (ArmyEventsManager), who holds each one and how
    // many men are standing in it. A power whose head has raised nothing says
    // so in a line rather than in an empty section.
    {
      const held  = _armiesOfPower(view.name || _viewName(view));
      const men   = held.reduce((n, a) => n + (Number(a.troopCount) || 0), 0);
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T.armiesTab)} (${held.length})</div>`;
      if (!held.length) {
        html += `<p class="npc-empty">${_escapeHtml(T.armiesNone)}</p>`;
      } else {
        html += _kvRow(322, T.armyStrength,
          _escapeHtml(`${men.toLocaleString()} ${T.armySoldiers}`));
        html += held.map(a => `
          <div class="npc-ident-row">${_iconSpan(220, 17)}<span class="npc-sub">${_escapeHtml(_armyStatusLabel(a, T))}:</span>&nbsp;${
            a.leaderName ? _wikiLink('leader', a.leaderName) : `<span class="npc-sub">${_escapeHtml(T.unknown || '?')}</span>`
          }<span class="npc-sub">&nbsp;·&nbsp;${_escapeHtml(`${a.troopCount} ${T.armySoldiers}`)}</span></div>`).join('');
      }
    }

    html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.memberNations} (${view.nations.length})</div><div class="npc-tag-wrap">`;
    html += view.nations.map(n => `<span class="npc-tag">${_wikiLink('nation', n)}</span>`).join('')
      || `<span class="npc-sub">${_escapeHtml(T.noRecords)}</span>`;
    html += `</div>`;

    // The orders, guilds and divisions that answer to this power.
    const factions = view.factions || [];
    if (factions.length) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.wikiFactions} (${factions.length})</div><div class="npc-tag-wrap">`;
      html += factions.map(f => `<span class="npc-tag">${_wikiLink('faction', f)}</span>`).join('');
      html += `</div>`;
    }

    if (live?.rumors?.length) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.rumorsLbl}</div>`;
      for (const r of live.rumors.slice(0, 5)) {
        html += `<div class="npc-thought">&ldquo;${_linkify(`${r.subjectName}, ${r.kind}`)}&rdquo; <span class="npc-sub">(${_escapeHtml(r.date)})</span></div>`;
      }
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildPowerLeadersHTML = function (view, T) {
    const live = view.live;
    let html = `<div class="npc-sec-hdr">${T.pastLeaders}</div><hr class="npc-r-sep">`;

    // Reign pockets from the live simulation
    const headHistory = live?.headHistory || [];
    if (headHistory.length) {
      const liveHeadTitle = window.NPCPolitics?.powerLabel?.(live, 'headTitle') || live.headTitle;
      html += `<div class="npc-routine-sub-hdr">${T.pastLeaders}, ${_escapeHtml(liveHeadTitle)}</div>`;
      html += headHistory.map(h => `
        <div class="npc-life-row npc-life-row--plain">
          <span class="npc-life-time">${_escapeHtml(h.date)}${h.endDate ? ` → ${_escapeHtml(h.endDate)}` : ''}</span>
          <span>${_wikiLink('leader', h.name)} <span class="npc-sub">(${_escapeHtml(window.NPCPolitics?.accessionLabel?.(h.how) || h.how || '?')})</span>${h.endDate ? '' : ` <span class="npc-good">- ${_escapeHtml(T.currentLeader)}</span>`}</span>
        </div>`).join('');
    }

    // Historical leader roster from history.json
    const histLeaders = view.hist?.leaders || [];
    if (histLeaders.length) {
      const hm = window.HistoryManager;
      const deaths = hm?.getLeaderDeaths?.() || {};
      const deadList = hm?.getDeadLeaders?.() || [];
      html += `<div class="npc-routine-sub-hdr">${T.leadersTab}</div>`;
      html += histLeaders.map(l => {
        const isDead = _wikiIsDead(deadList.includes(l.name) || !!deaths[l.name]);
        const deathDate = _wikiDeathDate(deaths[l.name]?.date);
        return `
        <div class="npc-life-row npc-life-row--plain">
          <span class="npc-life-time">${_escapeHtml(`${l.years?.[0] ?? '?'}–${l.years?.[1] ?? '?'}`)}</span>
          <span>${_wikiLink('leader', l.name)}${isDead ? ` <span class="npc-bad">✝${deathDate ? ' ' + _escapeHtml(deathDate) : ''}</span>` : ''}
            <span class="npc-sub">- ${_escapeHtml(_leaderIdeology(l))}</span></span>
        </div>`;
      }).join('');
    }

    // Living political class
    if (live?.politicians) {
      const pols = Object.values(live.politicians)
        .sort((a, b) => (b.alive - a.alive) || (b.approval - a.approval))
        .slice(0, 40);
      if (pols.length) {
        html += `<div class="npc-routine-sub-hdr">${T.politicalClass}</div><div class="npc-tag-wrap">`;
        html += pols.map(p => {
          const dead = _wikiIsDead(!p.alive);
          return `<span class="npc-tag npc-sub"${dead ? '' : ''}>${_wikiLink('leader', p.name)}${dead ? ' ✝' : ''}</span>`;
        }).join('');
        html += `</div>`;
      }
    }

    if (html.indexOf('npc-life-row') < 0 && html.indexOf('npc-tag') < 0) {
      html += `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    return html;
  };

  // ── Leader ──────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildLeaderOverviewHTML = function (view, T) {
    let html = `<div class="npc-profile-name">${_escapeHtml(_viewName(view))}</div>`;

    if (view.kind === 'politician' && view.pol && view.power) {
      const p = view.pol;
      const power = view.power;
      const party = power.parties?.find(x => x.id === p.partyId);
      const polOffice = window.NPCPolitics?.politicianOffice?.(power, p) || p.office || null;
      const sub = [polOffice, power.name].filter(Boolean);
      html += `<div class="npc-profile-sub">${_escapeHtml(sub.join(' · '))}</div>`;
      if (view.death) {
        html += `<div class="npc-dead-badge npc-mt-1 npc-mb-3">✝ ${_escapeHtml(T.deceased)}${view.death.date ? `, ${_escapeHtml(view.death.date)}` : ''}${view.death.cause ? ` (${_escapeHtml(view.death.cause)})` : ''}</div>`;
      }
      html += `<hr class="npc-r-sep">`;
      html += `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(T.wikiHyperpower)}:</span>&nbsp;${_wikiLink('power', power.name)}</div>`;
      if (party) html += _kvRow(187, T.partyLbl, _wikiLink('party', party.id, party.name));
      else if (p.office) html += _kvRow(187, T.partyLbl, _escapeHtml(T.independent));
      if (p.office) html += _kvRow(215, T.status, _escapeHtml(polOffice));
      const age = window.NPCPolitics?.politicianAgeOf?.(p);
      if (age != null && !view.death) html += _kvRow(84, T.ageLbl, `${age}`);
      if (p.scandals) html += _kvRow(1, T('Empathize.scandalsLbl'), `${p.scandals}`);

      // Ideology leanings
      const tags = [];
      const ix = p.ideology || {};
      if (ix.econ <= -40) tags.push('collectivist'); else if (ix.econ >= 40) tags.push('free-marketeer');
      if (ix.auth <= -40) tags.push('libertarian'); else if (ix.auth >= 40) tags.push('authoritarian');
      if (ix.trad <= -40) tags.push('progressive'); else if (ix.trad >= 40) tags.push('traditionalist');
      if (ix.mil <= -40) tags.push('pacifist'); else if (ix.mil >= 40) tags.push('militarist');
      if (ix.myst <= -40) tags.push('rationalist'); else if (ix.myst >= 40) tags.push('mystic');
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.ideologyLbl}</div><div class="npc-tag-wrap">`;
      html += (tags.length ? tags : ['moderate']).map(t => `<span class="npc-tag">${_escapeHtml(t)}</span>`).join('');
      html += `</div>`;

      // The character sheet, not seven bars: a politician is a person with a
      // class, a level, parameters, skills and a coat, exactly like anybody
      // else the player can meet. The political bars they are judged BY stay
      // in the left column.
      html += this._buildCharacterSheetHTML(p.name, T);
      html += this._buildLifeHTML(p.name, T);
    } else if (view.kind === 'historical' && view.leader) {
      const l = view.leader;
      const ofKind = _LEADER_OF_KIND[view.ofType] || 'power';
      html += `<div class="npc-profile-sub">${_escapeHtml(view.of ? _worldName(ofKind, view.of) : '')}</div>`;
      if (view.death) {
        html += `<div class="npc-dead-badge npc-mt-1 npc-mb-3">✝ ${_escapeHtml(T.deceased)}${view.death.date ? `, ${_escapeHtml(view.death.date)}` : ''}${view.death.cause ? ` (${_escapeHtml(view.death.cause)})` : ''}</div>`;
      }
      html += `<hr class="npc-r-sep">`;
      if (view.of) {
        const ofLabel = ofKind === 'power' ? T.wikiHyperpower
          : ofKind === 'faction' ? T.wikiFaction : T.wikiNation;
        // A leader whose only tie is the nation in the book may name a place
        // the archive has no page for ("United States (Free States of
        // Midwest)"), so the link is only drawn where it would open something.
        let linked = true;
        if (ofKind === 'nation') {
          try { linked = !!Wiki.get('nation', view.of); } catch (e) { linked = false; }
        }
        const target = linked ? _wikiLink(ofKind, view.of) : _escapeHtml(_worldName(ofKind, view.of));
        html += `<div class="npc-ident-row">${_iconSpan(97, 17)}<span class="npc-sub">${_escapeHtml(ofLabel)}:</span>&nbsp;${target}</div>`;
      }
      html += _kvRow(186, T.ideologyLbl, _escapeHtml(_leaderIdeology(l)));
      html += _kvRow(220, T.reignLbl, _escapeHtml(`${l.years?.[0] ?? '?'} – ${l.years?.[1] ?? '?'}`));
      // The one thing about them that is neither an office nor a date: what
      // this world says happened to them (Leaders.json `loreKey`).
      // `T` here is the label table, so the key is read through the resolver
      // itself, exactly as every other data-held key on this page is.
      const lore = _dbText(l.loreKey || view.record?.loreKey || '');
      if (lore && lore !== (l.loreKey || view.record?.loreKey)) {
        html += `<hr class="npc-r-sep"><div class="npc-backstory-text">${_escapeHtml(lore)}</div>`;
      }
    }
    // The person behind the office, on every leader's article whichever kind
    // they are: the vocation they read as, when and where they were born, the
    // traits they carry and the trades they are credited with. Drawn by the
    // same builder a pre-made character's dossier uses, because for the leaders
    // who ARE pre-made characters this is literally that dossier.
    // The columns this leader holds today, if any: a seated head marches their
    // power's field army, a recorded leader out of office marches their own.
    html += this._buildArmyHoldingHTML(view.kind === 'politician' && view.pol ? view.pol.name : (view.name || _viewName(view)), T);
    html += this._buildLeaderDossierHTML(view, T);
    // ...and the sheet and the life behind the dates, which is the whole of
    // what a procedural leader used to have on their page: nothing.
    if (view.kind !== 'politician') {
      html += this._buildCharacterSheetHTML(view.name || _viewName(view), T);
      html += this._buildLifeHTML(view.name || _viewName(view), T);
    }
    return html;
  };

  // The sheet behind an office. A leader, a politician or a head of state used
  // to be seven bars of charisma and ambition, which says what they are LIKE
  // and nothing about what they can DO. window.LeaderPersona.characterSheetFor
  // builds the same sheet a party member has - class, level, the eight
  // parameters off that class's own growth curve, the skills the class knows
  // at that level, the traits they are read by and what they are carrying -
  // for everybody the world holds a record of, written or procedural. This
  // draws it the way the status screen draws a companion.
  Scene_NPCEmpathize.prototype._buildCharacterSheetHTML = function (name, T) {
    const sheet = window.LeaderPersona?.characterSheetFor?.(name);
    if (!sheet) return '';
    let html = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T.stats)}</div>`;
    html += _kvRow(126, T.vocationLbl, _escapeHtml(sheet.className || '?'));
    html += _kvRow(87,  T.levelLbl,    `${sheet.level}`);

    if (sheet.params) {
      const PL = _paramLabels();
      html += `<div class="npc-param-grid">` + sheet.params.map((v, i) =>
        `<div class="npc-param-cell"><span class="npc-sub">${_escapeHtml(PL[i])}</span>` +
        `<strong>${v}</strong></div>`).join('') + `</div>`;
    }

    // What they are dressed in. A leader's gear is picked out of what their
    // class may equip in the price band their standing earns, so a marshal is
    // carrying a marshal's sword and a cardinal is not.
    const eq = sheet.equipment;
    if (eq && (eq.weaponId || eq.armorIds?.length)) {
      const tags = [];
      const w = eq.weaponId && $dataWeapons ? $dataWeapons[eq.weaponId] : null;
      if (w) tags.push(`<span class="npc-tag" ${_ccHover('weapon', w.id)}>${_iconSpan(w.iconIndex || 0, 15)}${_escapeHtml(w.name)}</span>`);
      for (const id of (eq.armorIds || [])) {
        const a = $dataArmors ? $dataArmors[id] : null;
        if (a) tags.push(`<span class="npc-tag" ${_ccHover('armor', a.id)}>${_iconSpan(a.iconIndex || 0, 15)}${_escapeHtml(a.name)}</span>`);
      }
      if (tags.length) {
        html += `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(EQUIP_ICON, 15)} ${_escapeHtml(T.equipment)}</div>` +
          `<div class="npc-tag-wrap">${tags.join('')}</div>`;
      }
    }

    const traitBank = _presetTraitBank();
    if (sheet.traits?.length && traitBank.length) {
      const tags = sheet.traits.map(id => {
        const trait = traitBank.find(t => t.id === id);
        return trait
          ? `<span class="npc-tag" ${_ccHover('trait', trait.id)}>${_iconSpan(trait.icon || TRAIT_ICON, 15)}${_escapeHtml(_traitDisplayName(trait))}</span>`
          : '';
      }).filter(Boolean).join('');
      if (tags) {
        html += `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(TRAIT_ICON, 15)} ${_escapeHtml(T.traits)}</div>` +
          `<div class="npc-tag-wrap">${tags}</div>`;
      }
    }

    if (sheet.specializations?.length && window.Specializations?.ready) {
      const tags = sheet.specializations.map(entry => {
        const spec = window.Specializations.byId.get(entry.id);
        if (!spec) return '';
        return `<span class="npc-tag">${_escapeHtml(window.Specializations.displayName(spec))} ` +
          `<span class="npc-sub">(${_escapeHtml(window.Specializations.levelName(entry.level))})</span></span>`;
      }).filter(Boolean).join('');
      if (tags) {
        html += `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(SPEC_ICON, 15)} ${_escapeHtml(T.specializations)}</div>` +
          `<div class="npc-tag-wrap">${tags}</div>`;
      }
    }

    if (sheet.skills?.length && $dataSkills) {
      const tags = sheet.skills.map(id => {
        const sk = $dataSkills[id];
        return sk ? `<span class="npc-tag" ${_ccHover('skill', sk.id)}>${_iconSpan(sk.iconIndex || SKILL_ICON, 15)}${_escapeHtml(sk.name)}</span>` : '';
      }).filter(Boolean).join('');
      if (tags) {
        html += `<div class="npc-sec-hdr npc-mt-2">${_iconSpan(SKILL_ICON, 15)} ${_escapeHtml(T.skills)}</div>` +
          `<div class="npc-tag-wrap">${tags}</div>`;
      }
    }
    return html;
  };

  // The life behind the dates. Every procedural leader has one simulated for
  // them when the world is made (LeaderPersona.bakeLives); a written one gets
  // theirs derived the same way. Every beat is a key, so it reads in whatever
  // language the article is opened in.
  Scene_NPCEmpathize.prototype._buildLifeHTML = function (name, T) {
    // Only for the people nobody wrote. A leader the book holds already has a
    // real life on record, and inventing beats for Mussolini would put fiction
    // next to fact on the same page.
    if (window.LeaderPersona?.isBookLeader?.(name)) return '';
    const life = window.LeaderPersona?.lifeFor?.(name) || [];
    if (!life.length) return '';
    let html = `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T.lifeLbl)}</div>`;
    html += life.map(beat => {
      const text = (window.T && window.T.has && window.T.has(beat.key))
        ? window.T(beat.key, beat.params || {}) : '';
      if (!text) return '';
      return `<div class="npc-life-row npc-life-row--plain">
          <span class="npc-life-time">${_escapeHtml(String(beat.year))}</span>
          <span>${_escapeHtml(text)}</span>
        </div>`;
    }).join('');
    return html;
  };

  // A leader's character sheet. `view.dossier` is preset-shaped by design (see
  // window.LeaderPersona), so _buildPresetHTML draws it unchanged; the rows
  // above it say which version of them is being read.
  Scene_NPCEmpathize.prototype._buildLeaderDossierHTML = function (view, T) {
    const d = view.dossier;
    if (!d) return '';
    const lang = ConfigManager.language === 'it' ? 'it' : 'en';
    let html = '';
    // Some of the people in the book are also dossiers the player can be: the
    // article says so outright, whether that dossier is still sitting unplayed
    // or is currently walking around wearing the player's boots.
    if (d.isPresetCharacter) {
      html += `<div class="npc-badge-row npc-mt-2"><span class="npc-badge">${_iconSpan(82, 15)}${_escapeHtml(T.presetCharacterBadge)}</span></div>`;
    }
    const noteKey = SOURCE_NOTE_KEYS[d.source];
    if (noteKey || d.level > 1) {
      const bits = [];
      if (noteKey) bits.push(T[noteKey]);
      if (d.level > 1) bits.push(`${T.levelAbbr} ${d.level}`);
      if (d.departure?.leftDate) bits.push(`${T.leftPartyLbl} ${d.departure.leftDate}`);
      html += `<hr class="npc-r-sep"><div class="npc-profile-sub npc-left">${_escapeHtml(bits.join(' · '))}</div>`;
    }
    return html + this._buildPresetHTML(d, T, lang, { omitLists: true });
  };

  // ── Artifact ────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildArtifactOverviewHTML = function (view, T) {
    const data = view.data;
    const kindLabel = view.kind === 'weapon' ? (T.artifactKindWeapon)
      : view.kind === 'armor' ? (T.artifactKindArmor)
      : (T.artifactKindItem);
    let html = `<div class="npc-profile-name">${_iconSpan(data?.iconIndex ?? 245, 26)} ${_escapeHtml(view.name)}</div>`;
    html += `<div class="npc-profile-sub">${_escapeHtml(kindLabel)}${view.kind === 'weapon' && data?.wtypeId ? ` · ${_escapeHtml(_wtypeName(data.wtypeId))}` : ''}${view.kind === 'armor' && data?.atypeId ? ` · ${_escapeHtml(_atypeName(data.atypeId))}` : ''}</div>`;
    html += `<hr class="npc-r-sep">`;
    if (data?.description) html += `<div class="npc-backstory-text">${_escapeHtml(data.description)}</div>`;

    html += `<div class="npc-sec-hdr npc-mt-3">${T.stats}</div>`;
    if (Array.isArray(data?.params)) {
      const PL = _paramLabels();
      const parts = data.params.map((v, i) => v ? `${PL[i]} +${v}` : null).filter(Boolean);
      html += `<div class="npc-stats-row">${parts.length ? _escapeHtml(parts.join(' · ')) : '-'}</div>`;
    }
    html += `<div class="npc-ident-row npc-mt-2">${_iconSpan(314, 17)}<span>${T.valueLbl}: <strong>${_euros(data?.price)}</strong></span></div>`;
    if (data?.weight) html += _kvRow(208, T.weightLbl, `${data.weight}`);

    if (view.rec) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.discovered}</div>`;
      html += `<div class="npc-life-row"><span class="npc-life-time">${_escapeHtml(view.rec.date || '?')}</span><span>${_linkify(window.T('History.artifact.found', { holder: view.rec.origin, action: view.rec.action, artifact: view.rec.name }))}</span></div>`;
      const holder = view.rec.holders?.[view.rec.holders.length - 1];
      if (holder) {
        html += `<div class="npc-ident-row npc-mt-2">${_iconSpan(210, 17)}<span class="npc-sub">${_escapeHtml(T.currentHolder)}:</span>&nbsp;${_linkify(holder.holder)}<span class="npc-sub">&nbsp;(${_escapeHtml(holder.since || '?')})</span></div>`;
      }
    } else {
      html += `<hr class="npc-r-sep"><p class="npc-sub">${_escapeHtml(T.noRecords)}</p>`;
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildArtifactHoldersHTML = function (view, T) {
    let html = `<div class="npc-sec-hdr">${T.pastHolders}</div><hr class="npc-r-sep">`;
    const holders = view.rec?.holders || [];
    if (!holders.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    html += holders.slice().reverse().map((h, i) => `
      <div class="npc-life-row">
        <span class="npc-life-time">${_escapeHtml(h.since || '?')}</span>
        <span>${_linkify(h.holder)}${h.power && h.power !== h.holder ? ` <span class="npc-sub">(${_linkify(h.power)})</span>` : ''}
          <span class="npc-sub">- ${_escapeHtml(h.how || '?')}</span>${i === 0 ? ` <span class="npc-good">- ${_escapeHtml(T.currentHolder)}</span>` : ''}</span>
      </div>`).join('');
    return html;
  };

  // ── Faction ─────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildFactionOverviewHTML = function (view, T) {
    let html = `<div class="npc-profile-name">${_escapeHtml(_viewName(view))}</div>`;
    html += `<div class="npc-profile-sub">${_escapeHtml(T.wikiFaction)}</div><hr class="npc-r-sep">`;
    const h = view.hist || view.dlFaction;
    if (h) {
      html += `<div class="npc-sec-hdr">${T.stats}</div>
        <div class="npc-stats-row">${_escapeHtml(`${T.arcaneLbl} ${Math.round(h.arcane ?? 0)} · ${T.techLbl} ${Math.round((view.hist ? h.tech : h.velocity) ?? 0)} · ${T.informationLbl} ${Math.round(h.information ?? 0)}`)}</div>`;
      const leaders = view.hist?.leaders || [];
      if (leaders.length) {
        const hm = window.HistoryManager;
        const deaths = hm?.getLeaderDeaths?.() || {};
        const deadList = hm?.getDeadLeaders?.() || [];
        html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.pastLeaders}</div>`;
        html += leaders.map(l => {
          const isDead = _wikiIsDead(deadList.includes(l.name) || !!deaths[l.name]);
          return `<div class="npc-life-row">
            <span class="npc-life-time">${_escapeHtml(`${l.years?.[0] ?? '?'}–${l.years?.[1] ?? '?'}`)}</span>
            <span>${_wikiLink('leader', l.name)}${isDead ? ' <span class="npc-bad">✝</span>' : ''} <span class="npc-sub">- ${_escapeHtml(_leaderIdeology(l))}</span></span>
          </div>`;
        }).join('');
      }
    }
    if (view.dlFaction && window.$gameFactions?.getReputation && view.dlIndex >= 0) {
      const rep = window.$gameFactions.getReputation(view.dlIndex) ?? 0;
      html += `<hr class="npc-r-sep">` + _meterRow(T('Empathize.reputationLbl'), Math.round((rep + 100) / 2), rep >= 0 ? 'var(--text-cost-ok)' : 'var(--text-cost-bad)');
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildFactionMembersHTML = function (view, T) {
    let html = `<div class="npc-sec-hdr">${T.factionMembersLbl}</div><hr class="npc-r-sep">`;
    if (!view.members.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    // The party's own banner is manned by companions and hired soldiers, not
    // by catalogued NPCs, so its roll is printed without links into a wiki
    // that holds no article for any of them.
    html += `<div class="npc-tag-wrap">` +
      view.members.map(n => `<span class="npc-tag">${_iconSpan(82, 15)}` +
        `${view.plainMembers ? _escapeHtml(n) : _wikiLink('npc', n)}</span>`).join('') +
      `</div>`;
    return html;
  };

  // ── Political party ─────────────────────────────────────────────────────────

  // A world of the Omega Tower. What it is, who lives on it, how heavy they
  // are and what it is governed by - or that it is governed by nothing,
  // which is the honest answer for a world of beasts.
  Scene_NPCEmpathize.prototype._buildWorldOverviewHTML = function (view, T) {
    const w = view.world;
    const kindLabel = T2('DungeonFloor.worldKind.' + w.kind, w.kind);
    let html = `<div class="npc-profile-name">${_escapeHtml(view.name)}</div>`;
    html += `<div class="npc-profile-sub">${_escapeHtml(kindLabel)}</div>`;

    const blurb = T2('DungeonFloor.worldKindBlurb.' + w.kind, '');
    if (blurb) html += `<div class="npc-policy-desc">${_escapeHtml(blurb)}</div>`;

    html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.overview}</div>`;
    html += _kvRow(97, T2('DungeonFloor.world.reachedFrom'),
      T2('DungeonFloor.world.reachedFloor', '', { floor: w.floor }));
    // It is nowhere on the world map, and saying so is the point.
    html += `<div class="npc-ident-row npc-sub">${_escapeHtml(T2('DungeonFloor.world.offworld'))}</div>`;
    html += _kvRow(158, T2('DungeonFloor.world.population'),
      T2('DungeonFloor.populationMode.' + w.populationMode, w.populationMode));
    html += _kvRow(79, T2('DungeonFloor.world.magic'),
      T2('DungeonFloor.magicalLevel.' + w.magicalLevel, w.magicalLevel));

    // The dominant people, where there is one. A world of beasts is a world
    // of one animal far more often than it is a menagerie.
    if (w.dominant) {
      const raceName = w.dominant.classId && typeof $dataClasses !== 'undefined'
        ? ($dataClasses[w.dominant.classId]?.name || '') : '';
      const label = raceName || _escapeHtml(w.demonym);
      html += _kvRow(187, T2('DungeonFloor.world.dominant'),
        T2('DungeonFloor.world.dominantShare', '',
          { name: label, percent: Math.round(w.dominant.share * 100) }));
    }

    html += _kvRow(83, T2('DungeonFloor.world.band'),
      T2('DungeonFloor.world.bandRange', '',
        { median: w.band.median, min: w.band.min, max: w.band.max }));

    // Who runs it.
    html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T2('DungeonFloor.world.power'))}</div>`;
    if (w.earthborn) {
      html += `<div class="npc-ident-row npc-sub">${_escapeHtml(T2('DungeonFloor.world.earthSeat'))}</div>`;
    } else if (view.power) {
      html += `<div class="npc-ident-row">${_iconSpan(215, 17)}${_wikiLink('power', w.powerName)}</div>`;
    } else {
      html += `<div class="npc-ident-row npc-sub">${_escapeHtml(T2('DungeonFloor.world.noGovernment'))}</div>`;
    }
    return html;
  };

  // Its bench, and the people on it the party has actually met.
  Scene_NPCEmpathize.prototype._buildWorldPeopleHTML = function (view, T) {
    const w = view.world;
    let html = `<div class="npc-sec-hdr">${_escapeHtml(T2('DungeonFloor.world.parties'))}</div>`;
    if (w.earthborn) {
      html += `<p class="npc-empty">${_escapeHtml(T2('DungeonFloor.world.earthSeat'))}</p>`;
    } else if (view.power && view.parties.length) {
      for (const party of view.parties) {
        html += `<div class="npc-ident-row">${_iconSpan(187, 17)}` +
          (party.id && view.power.parties?.[party.id]
            ? _wikiLink('party', party.id, party.name)
            : `<span>${_escapeHtml(party.name)}</span>`) + `</div>`;
      }
    } else {
      html += `<p class="npc-empty">${_escapeHtml(T2('DungeonFloor.world.noGovernment'))}</p>`;
    }

    // Everybody from this world the simulation has minted so far.
    const group = window.TowerWorlds?.groupName?.(w.floor) || null;
    const society = (typeof $gameSystem !== 'undefined' && $gameSystem?._npcSociety) || {};
    const locals = Object.entries(society)
      .filter(([, prof]) => prof && prof._homeGroupName === group)
      .map(([name]) => name).sort();
    html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T2('DungeonFloor.world.heading'))}</div>`;
    if (!locals.length) {
      html += `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    } else {
      for (const name of locals.slice(0, 60)) {
        html += `<div class="npc-ident-row">${_iconSpan(97, 17)}${_wikiLink('npc', name)}</div>`;
      }
    }
    return html;
  };

  Scene_NPCEmpathize.prototype._buildPartyOverviewHTML = function (view, T) {
    const p = view.party;
    const power = view.power;
    let html = `<div class="npc-profile-name">${_escapeHtml(view.name)}</div>`;
    const sub = [_worldName('power', power.name), _ideologyLabel(view.ideology?.id)].filter(Boolean);
    html += `<div class="npc-profile-sub">${_escapeHtml(sub.join(' · '))}</div>`;
    if (power.rulingPartyId === p.id) {
      html += `<div class="npc-dead-badge npc-dead-badge--ruling">${_escapeHtml(T.rulingParty)}</div>`;
    }
    html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.overview}</div>`;
    if (p.country) html += _kvRow(97, T.originLbl, _escapeHtml(p.country));
    if (view.leader) html += `<div class="npc-ident-row">${_iconSpan(215, 17)}<span class="npc-sub">${_escapeHtml(T.leaderOfPartyLbl)}:</span>&nbsp;${_wikiLink('leader', view.leader.name)}</div>`;
    if (p.foundedYear != null) html += _kvRow(220, T.foundedLbl, `${p.foundedYear}`);
    html += _kvRow(216, T.lastShareLbl, `${p.lastShare ?? 0}%${p.seats ? ` · ${p.seats} ${T.seats?.toLowerCase?.() || 'seats'}` : ''}`);
    html += _kvRow(314, T.fundsLbl, _euros(p.funds));

    // What the platform would actually DO in office: one policy per field, read
    // out of js/db/WorldGen/Policies.json by NPCPolitics.policiesFor. The five
    // bare axis bars said nothing a reader could act on, and the authority axis
    // is not a policy field at all - science is.
    const policies = window.NPCPolitics?.policiesFor?.(p.platform) || [];
    if (policies.length) {
      html += `<hr class="npc-r-sep"><div class="npc-sec-hdr">${T.platformLbl}</div>`;
      for (const row of policies) {
        if (!row.policy) continue;
        html += `<div class="npc-ident-row">${_iconSpan(row.icon, 17)}` +
          `<span class="npc-sub">${_escapeHtml(row.fieldName)}:</span>&nbsp;` +
          `<strong>${_escapeHtml(row.policy.name)}</strong></div>` +
          `<div class="npc-policy-desc">${_escapeHtml(row.policy.desc)}</div>`;
      }
    }
    return html;
  };

  // ── Ideology ─────────────────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildIdeologyOverviewHTML = function (view, T) {
    let html = `<div class="npc-profile-name">${_escapeHtml(view.name)}</div><hr class="npc-r-sep">`;
    html += `<div class="npc-sec-hdr">${T.heldByLbl} (${view.parties.length})</div>`;
    if (!view.parties.length) {
      html += `<p class="npc-empty">${_escapeHtml(T.noParties)}</p>`;
    } else {
      // Grouped by hyperpower, so "multiple parties, one ideology" reads as
      // the pattern it is rather than a flat unsorted list.
      const byPower = new Map();
      for (const { party, powerName } of view.parties) {
        if (!byPower.has(powerName)) byPower.set(powerName, []);
        byPower.get(powerName).push(party);
      }
      for (const [powerName, parties] of byPower) {
        html += `<div class="npc-ident-row npc-mt-3">${_iconSpan(97, 17)}${_wikiLink('power', powerName)}</div><div class="npc-tag-wrap">`;
        html += parties.map(p => `<span class="npc-tag">${_wikiLink('party', p.id, p.name)}</span>`).join('');
        html += `</div>`;
      }
    }
    return html;
  };

  // ── Shared chronicle tab ────────────────────────────────────────────────────

  Scene_NPCEmpathize.prototype._buildEntityEventsHTML = function (view, T) {
    const ICONS = window.HistorySimulator_ICONS ?? {};
    let html = `<div class="npc-sec-hdr">${T.worldEventsLbl}</div><hr class="npc-r-sep">`;
    const fromHistory = view.events || [];
    const fromPolitics = view.type === 'power' ? (view.live?.events || []) : [];
    if (!fromHistory.length && !fromPolitics.length) {
      return html + `<p class="npc-empty">${_escapeHtml(T.noRecords)}</p>`;
    }
    if (fromPolitics.length) {
      html += `<div class="npc-routine-sub-hdr">${_escapeHtml(T.eventsTab)}</div>`;
      html += fromPolitics.slice(0, 20).map(e => `
        <div class="npc-life-row">
          <span class="npc-life-time">${_escapeHtml(e.date ?? '?')}</span>
          <span>${_linkify(e.desc ?? '')}</span>
        </div>`).join('');
    }
    if (fromHistory.length) {
      html += `<div class="npc-routine-sub-hdr">${_escapeHtml(T.lifeHistoryTimeline)}</div>`;
      html += _eventRows(fromHistory, ICONS);
    }
    return html;
  };

  // ============================================================================
  // WIKI INDEX TAB, category grid → entry grid (the encyclopedia's "browse
  // all" view). People entries open the NPC's own Empathize panel, remotely
  // if they aren't on the current map; everything else opens its wiki profile.
  // ============================================================================

  const WIKI_CATEGORIES = [
    { id: 'favourites',       glyph: '☆', labelKey: 'wikiFavourites' },
    { id: 'party',            glyph: '', labelKey: 'wikiParty' },
    { id: 'people',           glyph: '☺', labelKey: 'wikiPeople' },
    { id: 'mainPlayers',      glyph: '★', labelKey: 'wikiMainPlayers' },
    { id: 'leaders',          glyph: '☻', labelKey: 'wikiLeaders' },
    { id: 'politicians',      glyph: '☗', labelKey: 'wikiPoliticians' },
    { id: 'powers',           glyph: '♛', labelKey: 'wikiHyperpowers' },
    { id: 'nations',          glyph: '⚑', labelKey: 'wikiNations' },
    { id: 'artifacts',        glyph: '✦', labelKey: 'wikiArtifacts' },
    { id: 'factions',         glyph: '⚜', labelKey: 'wikiFactions' },
    { id: 'politicalParties', glyph: '⚖', labelKey: 'wikiPoliticalParties' },
    { id: 'ideologies',       glyph: '✪', labelKey: 'wikiIdeologies' },
    { id: 'armies',           glyph: '⚔', labelKey: 'armiesTab' },
  ];

  // The Omega Tower half of the front page: the worlds its floors open onto,
  // then the same shelves again, holding only what those worlds rolled. Its
  // cards open 'tower:<id>', which is how the entry grid knows which half of
  // a shelf to draw.
  const TOWER_WIKI_CATEGORIES = [
    { id: 'worlds',           glyph: '◈', labelKey: 'wikiWorlds' },
    { id: 'people',           glyph: '☺', labelKey: 'wikiPeople' },
    { id: 'politicians',      glyph: '☗', labelKey: 'wikiPoliticians' },
    { id: 'powers',           glyph: '♛', labelKey: 'wikiHyperpowers' },
    { id: 'politicalParties', glyph: '⚖', labelKey: 'wikiPoliticalParties' },
    { id: 'ideologies',       glyph: '✪', labelKey: 'wikiIdeologies' },
    { id: 'armies',           glyph: '⚔', labelKey: 'armiesTab' },
  ];
  const _TOWER_WIKI_PREFIX = 'tower:';   // i18n-ignore  category key

  // 'tower:people' -> the tower's People shelf; a bare id is Earth's.
  function _wikiCategoryOf(key) {
    const k = String(key || '');
    return k.indexOf(_TOWER_WIKI_PREFIX) === 0
      ? { realm: 'tower', id: k.slice(_TOWER_WIKI_PREFIX.length) }
      : { realm: 'earth', id: k };
  }

  // Past party members (NPCSystemParty's removeActor snapshots), excluding
  // anyone who has since rejoined the active roster.
  function _pastPartyMembers() {
    const currentNames = new Set(($gameParty?.members() ?? []).map(a => a.name()));
    return ($gameSystem?._npcPastPartyMembers ?? []).filter(p => p?.name && !currentNames.has(p.name));
  }

  // What kind of thing a starred entry is, printed under its name on the
  // favourites shelf, where a nation, a creed and a tower world sit together.
  function _favKindLabel(type, T) {
    return {
      nation: T.wikiNation, power: T.wikiHyperpower, leader: T.wikiLeader,
      artifact: T.wikiArtifact, faction: T.wikiFaction,
      party: T.wikiPoliticalParty, ideology: T.wikiIdeology,
      world: T.wikiWorld, npc: T.wikiPerson,
    }[type] || '';
  }

  // The star itself. Filled when the article is on the reading list, hollow
  // when it is not; the same chip heads a person's panel and a thing's
  // article, so anything the wiki can open can be kept.
  function _wikiFavStarHTML(type, id, name, T) {
    if (!id) return '';
    const on = Wiki.isFavourite(type, id);
    return `
      <div class="npc-wiki-fav${on ? ' npc-wiki-fav--on' : ''}"
           title="${_escapeHtml(on ? T.wikiUnstar : T.wikiStar)}"
           onmousedown="event.stopPropagation();SceneManager._scene._toggleWikiFavourite('${type}','${_encId(id)}','${_encId(name || id)}')">
        <span class="npc-wiki-fav-glyph">${on ? '★' : '☆'}</span>
        <span class="npc-wiki-fav-label">${_escapeHtml(on ? T.wikiUnstar : T.wikiStar)}</span>
      </div>`;
  }

  function _wikiEntryTile(type, id, labelHTML, subHTML) {
    const safeId = _encId(id);
    return `
      <div class="npc-wiki-entry" onmousedown="event.stopPropagation();window.NPCEmpathize.openEntity('${type}','${safeId}')">
        <span class="npc-wiki-entry-name">${labelHTML}</span>
        ${subHTML ? `<span class="npc-wiki-entry-sub">${subHTML}</span>` : ''}
      </div>`;
  }


  // ============================================================================
  // THE ARMIES SHELF
  // ============================================================================
  // Who is under arms today, and under whom. The roster itself is
  // window.ArmyCampaign (ArmyEventsManager): one column per seated head of a
  // hyperpower, a private column for the recorded leaders who hold no seat,
  // and the party's own army standing beside them. Every one of them answers
  // the same four questions - formation, strength, upkeep and morale - so a
  // state army and the party's dozen hirelings can be read off the same page.

  function _armyApi() { return window.ArmyCampaign || null; }

  function _armyText(key) {
    const api = _armyApi();
    if (api && typeof api.factionText === 'function') return api.factionText(key);
    const s = String(key || '');
    const i = s.lastIndexOf('.');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  // Cents a week, written the way every other price in these menus is written.
  function _armyMoney(cents) {
    return `€${((Number(cents) || 0) / 100).toFixed(2)}`;
  }

  // What the column is doing today: patrolling its own ground, garrisoned on a
  // city, marching somewhere, reinforcing another column or in the field
  // against one. The roster is the one that decides (ArmyEventsManager); this
  // only puts the word to it.
  function _armyStatusLabel(army, T) {
    const key = 'armyStatus' + String(army.status || 'idle').replace(/^./, c => c.toUpperCase());
    return T[key] || T.armyStatusIdle || String(army.status || '');
  }

  function _armyTitle(army, T) {
    if (army.kind === 'party') return T.armyPartyColumn || 'Your army';
    if (army.kind === 'power') return `${_worldName('power', army.powerName)} ${T.armyFieldArmy}`;
    return T.armyPrivateColumn;
  }

  // The bar every army stat is drawn as: the same shape the needs bars use, so
  // morale and coherence read as the gauges they are rather than as numbers.
  function _armyBar(pct, cls) {
    const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    return `<span class="npc-army-bar"><span class="npc-army-bar-fill ${cls || ''}" style="--npc-w:${v}%"></span></span>`;
  }

  function _armyFormationHTML(army, T) {
    const groups = army.formation || [];
    if (!groups.length) return `<div class="npc-sub">${_escapeHtml(T.armyNoFormation)}</div>`;
    return `<div class="npc-army-formation">${groups.map(g => `
      <div class="npc-army-unit">
        <span class="npc-army-unit-name">${_escapeHtml(_armyText(g.name))}</span>
        <span class="npc-army-unit-drill">${_escapeHtml(_armyText(g.formation))}</span>
        <span class="npc-army-unit-count">${g.count}</span>
      </div>`).join('')}</div>`;
  }

  // One army, drawn whole: who leads it, what it is made of and what it costs.
  function _armyCardHTML(army, T, opts) {
    const leaderHTML = army.leaderName
      ? (army.kind === 'party'
        ? _escapeHtml(army.leaderName)
        : _wikiLink('leader', army.leaderName))
      : `<span class="npc-sub">${_escapeHtml(T.unknown || '?')}</span>`;
    const head = (opts && opts.hideTitle) ? '' : `
      <div class="npc-army-card-hdr">
        <span class="npc-army-card-title">${_escapeHtml(_armyTitle(army, T))}</span>
        <span class="npc-sub">${leaderHTML}</span>
      </div>`;
    return `
      <div class="npc-army-card">
        ${head}
        <div class="npc-ident-row">${_iconSpan(220, 17)}<span class="npc-sub">${_escapeHtml(T.armyStatus)}:</span>&nbsp;${_escapeHtml(_armyStatusLabel(army, T))}</div>
        <div class="npc-ident-row">${_iconSpan(322, 17)}<span class="npc-sub">${_escapeHtml(T.armyStrength)}:</span>&nbsp;<strong>${army.troopCount}</strong>&nbsp;<span class="npc-sub">${_escapeHtml(T.armySoldiers)}</span></div>
        <div class="npc-ident-row">${_iconSpan(314, 17)}<span class="npc-sub">${_escapeHtml(T.armyUpkeep)}:</span>&nbsp;${_armyMoney(army.upkeep)}&nbsp;<span class="npc-sub">${_escapeHtml(T.armyPerWeek)}</span></div>
        <div class="npc-ident-row">${_iconSpan(176, 17)}<span class="npc-sub">${_escapeHtml(T.armyMorale)}:</span>&nbsp;${_armyBar(army.morale, 'npc-army-bar-morale')}&nbsp;${Math.round(army.morale)}%</div>
        <div class="npc-ident-row">${_iconSpan(187, 17)}<span class="npc-sub">${_escapeHtml(T.armyCoherence)}:</span>&nbsp;${_armyBar(army.coherence, 'npc-army-bar-coherence')}&nbsp;${Math.round(army.coherence)}%</div>
        <div class="npc-sec-hdr npc-mt-1">${_escapeHtml(T.armyFormation)}</div>
        ${_armyFormationHTML(army, T)}
      </div>`;
  }

  // The block that hangs off a leader's own article: the columns THEY hold.
  // Most of the political class holds none, and says so in one line rather
  // than in an empty panel.
  Scene_NPCEmpathize.prototype._buildArmyHoldingHTML = function (name, T) {
    const api = _armyApi();
    if (!api || typeof api.armiesOfLeader !== 'function') return '';
    let held = [];
    try { held = api.armiesOfLeader(name) || []; } catch (e) { return ''; }
    if (!held.length) return '';
    return `<hr class="npc-r-sep"><div class="npc-sec-hdr">${_escapeHtml(T.armiesTab)}</div>`
      + held.map(a => _armyCardHTML(a, T)).join('');
  };

  // Every column standing in the world today, the party's own among them,
  // biggest first. The Wiki's Armies shelf is built off this, and so is the
  // count on its card; a world with no roster at all answers with an empty
  // list rather than throwing the panel open on an error page.
  function _listArmies() {
    const api = _armyApi();
    try { return (api && api.listArmies) ? api.listArmies() : []; } catch (e) { return []; }
  }

  // The columns one hyperpower has in the field, for the block its article
  // prints under its own figures.
  function _armiesOfPower(name) {
    const api = _armyApi();
    if (!api || typeof api.armiesOfPower !== 'function') return [];
    try { return api.armiesOfPower(name) || []; } catch (e) { return []; }
  }

  // ============================================================================
  // SCREEN 5 OF 5: THE WIKI INDEX
  // ============================================================================
  // The catalogue the articles above are reached from: one card per category,
  // then the entries inside it.

  // The columns in the field on one half of the setting. The party's own
  // column marches on Earth.
  function _listArmiesIn(realm) {
    const tower = realm === 'tower';
    return _listArmies().filter(a =>
      (a.kind !== 'party' && Wiki.isTowerPower(a.powerName)) === tower);
  }

  Scene_NPCEmpathize.prototype._buildWikiTabHTML = function (T) {
    const pets = window.PetSystem ? window.PetSystem.getPets() : [];
    const countOf = (id, realm) => {
      if (id === 'favourites') return Wiki.listFavourites().length;
      if (id === 'party') {
        return ($gameParty?.members()?.length ?? 0) + _pastPartyMembers().length + pets.length;
      }
      if (id === 'armies') return _listArmiesIn(realm).length;
      return (Wiki.listIn(id, realm) || []).length;
    };

    // ── Category grid ─────────────────────────────────────────────────────────
    if (!this._wikiCategory) {
      // The category last opened keeps a golden border while the grid is up, so
      // coming back out of a category still shows which one you were reading.
      const cards = (list, realm) => list.map(cat => {
        const key = (realm === 'tower' ? _TOWER_WIKI_PREFIX : '') + cat.id;
        return `
        <div class="npc-wiki-card${this._lastWikiCategory === key ? ' npc-wiki-card-selected' : ''}" onmousedown="event.stopPropagation();SceneManager._scene._setWikiCategory('${key}')">
          <span class="npc-wiki-card-glyph">${cat.glyph}</span>
          <span class="npc-wiki-card-label">${_escapeHtml(T[cat.labelKey] || cat.fallback)}</span>
          <span class="npc-wiki-card-count">${countOf(cat.id, realm)}</span>
        </div>`;
      }).join('');
      return `
        <div class="npc-wiki-hdr">
          <div class="npc-sec-hdr">${_escapeHtml(T.wikiTab)}, ${_escapeHtml(T.wikiCategories)}</div>
          <hr class="npc-r-sep">
        </div>
        <div class="npc-sec-hdr npc-wiki-realm-hdr">${_escapeHtml(T.wikiEarth)}</div>
        <div class="npc-wiki-grid npc-wiki-grid--cards">${cards(WIKI_CATEGORIES, 'earth')}</div>
        <div class="npc-sec-hdr npc-wiki-realm-hdr">${_escapeHtml(T.wikiOmegaTower)}</div>
        <div class="npc-wiki-grid npc-wiki-grid--cards">${cards(TOWER_WIKI_CATEGORIES, 'tower')}</div>`;
    }

    // ── Entry grid for the selected category ─────────────────────────────────
    const sel = _wikiCategoryOf(this._wikiCategory);
    const realm = sel.realm;
    const shelf = realm === 'tower' ? TOWER_WIKI_CATEGORIES : WIKI_CATEGORIES;
    const cat = shelf.find(c => c.id === sel.id) || shelf[0];
    const realmLbl = realm === 'tower' ? `${_escapeHtml(T.wikiOmegaTower)} · ` : '';
    const headerHTML = `
      <div class="npc-wiki-hdr">
      <div class="npc-panel-top-hdr">
        <div class="npc-sec-hdr npc-wiki-cat-selected npc-mb-0">${cat.glyph} ${realmLbl}${_escapeHtml(T[cat.labelKey] || cat.fallback)} (${countOf(cat.id, realm)})</div>
        <span class="npc-back-btn" onmousedown="event.stopPropagation();SceneManager._scene._setWikiCategory(null)">← ${_escapeHtml(T.wikiCategories)}</span>
      </div>
      <hr class="npc-r-sep">
      </div>`;

    let tiles = '';
    switch (cat.id) {
      // Everything the player has starred, whatever shelf it came off.
      case 'favourites': {
        const favs = Wiki.listFavourites();
        tiles = favs.length
          ? favs.map(f => _wikiEntryTile(f.type, f.id, _escapeHtml(f.name),
              _escapeHtml(_favKindLabel(f.type, T)))).join('')
          : `<p class="npc-empty">${_escapeHtml(T.wikiNoFavourites)}</p>`;
        break;
      }
      case 'party': {
        // Current members open in actor mode, full profile *and* the chat
        // tab, always available while they travel with you. Past members
        // open remotely by name (their NPC profile lives on in the society).
        // Where this party was last written into the world folder, which is
        // where any other savegame of the world would find them standing
        // (NPCSystem.js, VisitingParties). Named as a place, not as a tile.
        const VP = window.PartyPresence;
        const ownLastSeen = VP?.lastSeenName?.(VP.currentSlot?.() ?? 0) ?? null;
        const seenLine = where => (where
          ? ` · ${_escapeHtml(T.partyLastSeen)} ${_escapeHtml(where)}`
          : '');
        const current = ($gameParty?.members() ?? []);
        const curTiles = current.map(a => `
          <div class="npc-wiki-entry" onmousedown="event.stopPropagation();window.NPCEmpathize.openForActor(${a.actorId()})">
            <span class="npc-wiki-entry-name">${_escapeHtml(a.name())}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(T.partyCurrentMember)} · ${_escapeHtml(a.currentClass()?.name || '')} Lv.${a.level}${seenLine(ownLastSeen)}</span>
          </div>`).join('');
        // The other playthroughs of this world, and where each was left. They
        // are people this party can actually meet, so they are listed here with
        // the same "last seen" line rather than being invisible until walked
        // into; the tile opens their profile by name like any other.
        const visitorTiles = (VP?.otherParties?.() ?? []).map(party => {
          const where = VP.lastSeenName(party.slot);
          return (party.members || []).map(m => `
          <div class="npc-wiki-entry" onmousedown="event.stopPropagation();window.NPCEmpathize.openByName(decodeURIComponent('${_encId(m.name)}'))">
            <span class="npc-wiki-entry-name">${_escapeHtml(m.name)}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(T.partyOtherMember)}${party.leaderName ? ` (${_escapeHtml(party.leaderName)})` : ''}${seenLine(where)}</span>
          </div>`).join('');
        }).join('');
        // Former members carry how they left (NPCSystemParty's roster history):
        // retired to a dossier, dismissed, or dead, with the date it happened.
        const pastTiles = _pastPartyMembers().map(p => {
          const statusLabel = p.reason === 'died'
            ? (T.partyDeadMember)
            : p.reason === 'retired'
              ? (T.partyRetiredMember)
              : (T.partyFormerMember);
          const when = p.deathDate || p.leftDate || '';
          return `
          <div class="npc-wiki-entry" onmousedown="event.stopPropagation();window.NPCEmpathize.openByName(decodeURIComponent('${_encId(p.name)}'))">
            <span class="npc-wiki-entry-name">${_escapeHtml(p.name)}${p.reason === 'died' ? ' <span class="npc-bad">✝</span>' : ''}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(statusLabel)}${when ? ` ${_escapeHtml(when)}` : ''} · ${_escapeHtml(p.className || '')} Lv.${p.level || 1}</span>
          </div>`;
        }).join('');
        // Pets/followers: trailing map companions that never battle. Informational
        // tiles only, with the active follower flagged.
        const petList   = window.PetSystem ? window.PetSystem.getPets() : [];
        const activePet = window.PetSystem ? window.PetSystem.getActivePet() : null;
        const petTiles  = petList.map(pet => {
          const typeLabel = pet.isFollower
            ? (T.petFollower)
            : (T.petPet);
          const activeSuffix = (activePet && pet.id === activePet.id)
            ? ` · ${_escapeHtml(T.petFollowing)}`
            : '';
          return `
          <div class="npc-wiki-entry">
            <span class="npc-wiki-entry-name">${_escapeHtml(pet.name)}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(typeLabel)}${activeSuffix} · Lv.${pet.level || 1}</span>
          </div>`;
        }).join('');
        tiles = curTiles + pastTiles + petTiles + visitorTiles;
        break;
      }
      // Every world the tower opens onto, under the floor it is reached from.
      case 'worlds':
        tiles = Wiki.listIn('worlds', realm).map(w =>
          _wikiEntryTile('world', w.id, `◈ ${_escapeHtml(w.name)}`,
            [T2('DungeonFloor.worldKind.' + w.kind, w.kind),
             T2('DungeonFloor.world.reachedFloor', '', { floor: w.floor })]
              .filter(Boolean).map(_escapeHtml).join(' · '))
        ).join('');
        break;
      case 'people':
        tiles = Wiki.listIn('people', realm).map(p =>
          _wikiEntryTile('npc', p.name, _escapeHtml(p.name), p.group ? _escapeHtml(p.group) : '')
        ).join('');
        break;
      // Both shelves draw the same tile: the article behind it does not care
      // which half of the cast the person came from.
      case 'mainPlayers':
      case 'leaders': {
        const roll = Wiki.listIn(cat.id, realm);
        tiles = roll.map(l =>
          _wikiEntryTile('leader', l.name,
            `${_escapeHtml(_worldName('leader', l.name))}${l.dead ? ' <span class="npc-bad">✝</span>' : ''}`,
            l.of ? _escapeHtml(_worldName(_LEADER_OF_KIND[l.ofType] || 'power', l.of)) : '')
        ).join('');
        break;
      }
      case 'politicians':
        // Everybody the world elected without history writing them down. The
        // article behind the tile is the same leader profile: it simply has a
        // politician on the other side of it instead of a book entry.
        tiles = Wiki.listIn('politicians', realm).map(p =>
          _wikiEntryTile('leader', p.name,
            `${_escapeHtml(_worldName('leader', p.name))}${p.dead ? ' <span class="npc-bad">✝</span>' : ''}`,
            [p.office, p.of ? _worldName(_LEADER_OF_KIND[p.ofType] || 'power', p.of) : '']
              .filter(Boolean).map(_escapeHtml).join(' · '))
        ).join('');
        break;
      case 'powers':
        tiles = Wiki.listIn('powers', realm).map(n => {
          const live = window.NPCPolitics?.getPower?.(n);
          return _wikiEntryTile('power', n, `♛ ${_escapeHtml(_worldName('power', n))}`,
            live ? _escapeHtml(window.NPCPolitics?.powerLabel?.(live, 'govType') || live.govType) : '');
        }).join('');
        break;
      case 'nations':
        tiles = Wiki.listIn('nations', realm).map(n =>
          _wikiEntryTile('nation', n.name, `⚑ ${_escapeHtml(_worldName('nation', n.name))}`,
            n.controller && n.controller !== 'Neutral'
              ? _escapeHtml(_worldName('power', n.controller)) : _escapeHtml(T.independent))
        ).join('');
        break;
      case 'artifacts':
        tiles = Wiki.listIn('artifacts', realm).map(a => {
          const kindLabel = a.kind === 'weapon' ? (T.artifactKindWeapon)
            : a.kind === 'armor' ? (T.artifactKindArmor)
            : (T.artifactKindItem);
          return _wikiEntryTile('artifact', a.key,
            `${_iconSpan(a.iconIndex ?? 245, 15)} ${_escapeHtml(a.name)}`, _escapeHtml(kindLabel));
        }).join('');
        break;
      case 'factions':
        tiles = Wiki.listIn('factions', realm).map(n =>
          _wikiEntryTile('faction', n, `⚜ ${_escapeHtml(_worldName('faction', n))}`, '')
        ).join('');
        break;
      case 'politicalParties':
        tiles = Wiki.listIn('politicalParties', realm).map(p => {
          const ideoLabel = _ideologyLabel(p.ideologyId);
          const sub = [_worldName('power', p.powerName), ideoLabel].filter(Boolean).join(' · ');
          return _wikiEntryTile('party', p.id, `⚖ ${_escapeHtml(p.name)}`, _escapeHtml(sub));
        }).join('');
        break;
      case 'armies':
        // Every column standing today, biggest first, each under the name of
        // whoever holds it. The tile opens that leader's article, where the
        // column itself is written out in full (_buildArmyHoldingHTML); the
        // party's own army is led by a party member with no article to open,
        // so its tile is a plain row like a pet's.
        tiles = _listArmiesIn(realm).map(a => {
          const men   = `${a.troopCount} ${T.armySoldiers}`;
          const label = `⚔ ${_escapeHtml(_armyTitle(a, T))}`;
          if (a.kind === 'party' || !a.leaderName) {
            return `
          <div class="npc-wiki-entry">
            <span class="npc-wiki-entry-name">${label}</span>
            <span class="npc-wiki-entry-sub">${_escapeHtml(a.leaderName || T.unknown || '?')} · ${_escapeHtml(men)}</span>
          </div>`;
          }
          return _wikiEntryTile('leader', a.leaderName, label,
            `${_escapeHtml(_worldName('leader', a.leaderName))} · ${_escapeHtml(men)}`);
        }).join('');
        break;
      case 'ideologies':
        tiles = Wiki.listIn('ideologies', realm).map(e => {
          const label = window.T ? window.T(e.name) : e.id;
          const sub = e.partyCount
            ? T.n('Empathize.ideologyPartyCount', e.partyCount, { n: e.partyCount })
            : T.noParties;
          return _wikiEntryTile('ideology', e.id, `✪ ${_escapeHtml(label)}`, _escapeHtml(sub));
        }).join('');
        break;
    }
    if (!tiles) {
      tiles = `<p class="npc-sub">${_escapeHtml(T.noRecords)}</p>`;
    }

    return `${headerHTML}<div class="npc-wiki-grid">${tiles}</div>`;
  };

  // ============================================================================
  // More tab
  // ============================================================================

  Scene_NPCEmpathize.prototype._buildMoreHTML = function (T) {
    const items = [
      { id: 'leave', label: T.leave },
    ];
    const rowsHTML = items.map(it => `
      <div class="npc-action-row" onmousedown="event.stopPropagation();SceneManager._scene._moreAction('${it.id}')">
        <span class="npc-action-label">${_escapeHtml(it.label)}</span>
        <span class="npc-action-arrow">←</span>
      </div>`).join('');

    return `<div class="npc-sec-hdr npc-mb-2">${T.more}</div>${rowsHTML}`;
  };

  Object.assign(Scene_NPCEmpathize._internal, {
    _wikiFavStarHTML,
  });
})();
