/*:
 * @target MZ
 * @plugindesc Faction Screen UI v1.0.0, DOM overlay for FactionDataManager
 * @author Omni-Lex
 *
 * @help FactionDataManagerUI.js
 *
 * The drawing half of the faction register. Must be listed AFTER
 * NPC/FactionDataManager.js in the Plugin Manager.
 *
 * FactionDataManager.js owns the data: the factions, the hyperpowers, the
 * standings, the accords, the party's own banner. This file owns what the
 * player sees of them: Scene_FactionStatus, Scene_PlayerFaction and the
 * Window_FactionStatus fallback, and nothing else.
 *
 * Every colour, size and space it uses is a class in css/theme.css. There is
 * no inline styling here and there must never be any: see
 * docs/task/ui_fixing.md.
 */

//=============================================================================
// Scene_FactionStatus
//=============================================================================

function Scene_FactionStatus() {
  this.initialize(...arguments);
}

Scene_FactionStatus.prototype = Object.create(Scene_MenuBase.prototype);
Scene_FactionStatus.prototype.constructor = Scene_FactionStatus;
window.Scene_FactionStatus = Scene_FactionStatus;

Scene_FactionStatus.prototype.initialize = function () {
  Scene_MenuBase.prototype.initialize.call(this);
  this._selectMode = false;
  this._onConfirm = null;
};

// Selection mode: pushed with SceneManager.push(Scene_FactionStatus) then
// SceneManager.prepareNextScene("select", callback) (same convention as
// Scene_BuyTroops.prepare in ArmyManager.js). While in this mode, confirming
// a faction calls `callback(factionId)` and pops the scene instead of the
// normal no-op OK. Used by the character-creation Faction Leader / Deserter
// origins to let the player pick a faction with this same browser.
Scene_FactionStatus.prototype.prepare = function (mode, onConfirm) {
  this._selectMode = mode === "select";
  this._onConfirm = typeof onConfirm === "function" ? onConfirm : null;
};

Scene_FactionStatus.prototype.create = function () {
  Scene_MenuBase.prototype.create.call(this);
  this.createFactionStatusWindow();

  if (this._factionStatusWindow) {
    this._factionStatusWindow.visible = false;
    this._factionStatusWindow.deactivate();
  }

  this._dndSelectedIndex = 0;
  // Whose standings the page shows. Opens on whoever the menu was last on.
  const members = this.switchableMembers();
  const menuActor = (window.$gameParty && $gameParty.menuActor) ? $gameParty.menuActor() : null;
  this._repActorIndex = Math.max(0, members.indexOf(menuActor));

  // The shared search + filter strip (UI/MenuSearchBar.js), sitting under the
  // title as it does in every other list menu. A faction has a name and
  // nothing else worth ordering on, and since the list is a tree the ordering
  // runs A-Z WITHIN it rather than across it, which is what the tag is named
  // after (see getFactionList).
  this._factionBar = window.MenuSearchBar ? window.MenuSearchBar.create({
    id: 'factions',
    placeholder: T('Factions.searchPlaceholder'),
    sorts: ['name'],
    sortLabels: { name: T('Factions.sortName') },
    onChange: () => {
      this._dndSelectedIndex = 0;
      this.refreshUIFactions();
      if (this._factionBar) this._factionBar.restoreFocus();
    }
  }) : null;

  this.createUIFactionsOverlay();
  if (window.CharSwitcher) {
    window.CharSwitcher.installTabKey(this, (dir) => this.cycleRepActor(dir));
  }
};

Scene_FactionStatus.prototype.createFactionStatusWindow = function () {
  const rect = this.factionStatusWindowRect();
  this._factionStatusWindow = new Window_FactionStatus(rect);
  this._factionStatusWindow.setHandler("cancel", this.popScene.bind(this));
  this.addWindow(this._factionStatusWindow);
};

Scene_FactionStatus.prototype.factionStatusWindowRect = function () {
  const wx = 0;
  const wy = this.mainAreaTop();
  const ww = Graphics.boxWidth;
  const wh = this.mainAreaHeight();
  return new Rectangle(wx, wy, ww, wh);
};

Scene_FactionStatus.prototype.createUIFactionsOverlay = function () {


  // Create Factions DOM container
  this._dndContainer = document.createElement("div");
  this._dndContainer.id = "menu-container";
  // Scopes this screen's own reading size: the dossier on the right page is
  // prose, not a stat block, and is set larger than the shared fact styles.
  this._dndContainer.classList.add("factions-scene");
  this._dndContainer.style.opacity = "0";
  this._dndContainer.style.transition = "opacity 0.22s ease-out";
  document.body.appendChild(this._dndContainer);

  // RPG Maker attaches a document-level wheel listener that preventDefaults,
  // which kills native scrolling inside DOM overlays: without this the left
  // faction list could not be scrolled with the wheel at all. Scroll the
  // scrollable region under the pointer ourselves and stop the event before it
  // reaches the game. Bound on the container, which survives every refresh
  // (the pages inside it are re-rendered).
  this._dndContainer.addEventListener("wheel", (e) => {
    const box = e.target.closest("#factions-grid, #faction-detail-scroll, #pf-allegiance, .right-page");
    if (box) box.scrollTop += e.deltaY;
    e.stopPropagation();
    e.preventDefault();
  }, { passive: false });

  this.refreshUIFactions();
  UIFactionsInputManager.activate(this);

  setTimeout(() => {
    if (this._dndContainer) {
      this._dndContainer.style.opacity = "1";
    }
  }, 16);
};

// The name a hyperpower is shown under, resolved once for both pages
// (Game_Factions.hyperpowerLabel).
Scene_FactionStatus.prototype.hyperpowerLabel = function (hp) {
  return $gameFactions.hyperpowerLabel(hp);
};

// The tree the lore describes: a hyperpower, then the factions that answer to
// it, then the independents that answer to nobody.
//
// `parentHyperpower` in Factions.json names the power a faction answers to, and
// no faction speaks for a power: a power's row IS the power, read through its
// own "hp:<id>" standing key, wearing the emblem of the first branch under it.
// A faction with no `parentHyperpower` is an orphan: still listed, still with a
// standing of its own, but sworn to nobody and seated nowhere.
// The Archive article for the hyperpower the cursor is standing on, the same
// one the page's own button opens. A row that is a faction rather than a power,
// or a build without the Archive, simply has nothing to open.
Scene_FactionStatus.prototype.openHighlightedWiki = function () {
  const list = this.getFactionList();
  const entry = list[this._dndSelectedIndex];
  // The party's own banner answers Confirm with its management screen: that is
  // the useful page, and the Archive article for it says less than this one.
  if (entry && entry.isPlayer) {
    this.openPlayerFaction();
    return;
  }
  const power = entry && entry.kind === "hyperpower" ? entry.hyperpower : null;
  if (!power || !window.NPCEmpathize || typeof window.NPCEmpathize.openEntity !== "function") {
    SoundManager.playBuzzer();
    return;
  }
  SoundManager.playOk();
  window.NPCEmpathize.openEntity("power", power.name);
};

// Which powers are standing open. Kept on $gameSystem rather than on the scene
// so the register is found the way it was left, this visit and the next. Every
// power starts closed: eighty two rows of branches is not a list anybody reads,
// and the powers themselves are what the register is for.
Scene_FactionStatus.prototype.openPowers = function () {
  if (!$gameSystem._factionOpenPowers) $gameSystem._factionOpenPowers = {};
  return $gameSystem._factionOpenPowers;
};

Scene_FactionStatus.prototype.isPowerOpen = function (id) {
  return !!this.openPowers()[id];
};

Scene_FactionStatus.prototype.togglePower = function (id) {
  const open = this.openPowers();
  if (open[id]) delete open[id];
  else open[id] = true;
  SoundManager.playCursor();
  // The rows below the one that moved change, so the left page is rebuilt.
  this._dndLastLeftPageKey = null;
  this.refreshUIFactions();
};

Scene_FactionStatus.prototype.getFactionList = function () {
  // The tree, built branch by branch. A top-level row carries its own children
  // rather than the whole thing being flattened up front, so the ordering
  // below can never move a sub-faction out from under its power.
  const groups = [];

  // The party's own banner, when it has raised one: a branch of the power it
  // swore to, or a group of its own standing among the independents. A
  // register opened to pick a faction for somebody else never lists it, since
  // it has no entry in Factions.json for that caller to look up afterwards.
  const playerRow = this._selectMode ? null : $gameFactions.playerFactionRecord();

  $gameFactions.getHyperpowers().forEach((hp) => {
    const power = {
      kind: "hyperpower",
      isSub: false,
      hyperpower: hp,
      faction: null,
      standingKey: $gameFactions.hyperpowerStandingKey(hp.id),
      name: this.hyperpowerLabel(hp),
      iconIndex: $gameFactions.hyperpowerIcon(hp.id),
      children: [],
    };
    power.children = $gameFactions.getHyperpowerFactions(hp.id)
      .map((child) => ({
        kind: "faction",
        isSub: true,
        faction: child,
        hyperpower: hp,
        standingKey: String(child.id),
        name: FactionDataManager.instance.t(child.name),
        iconIndex: child.iconIndex,
      }));
    // A banner sworn to this power is listed under it like any other branch.
    if (playerRow && playerRow.hyperpower && playerRow.hyperpower.id === hp.id) {
      power.children.push(playerRow);
    }
    groups.push(power);
  });

  $gameFactions.getIndependentFactions().forEach((faction) => {
    groups.push({
      kind: "faction",
      isSub: false,
      faction: faction,
      standingKey: String(faction.id),
      name: FactionDataManager.instance.t(faction.name),
      iconIndex: faction.iconIndex,
      children: [],
    });
  });

  if (playerRow && !playerRow.hyperpower) groups.push(playerRow);

  // A closed power contributes its own row and none of its branches. The
  // search strip is the one exception: typing a query opens the tree, because
  // a hit hidden inside a closed power is a hit nobody can see.
  const searching = !!(this._factionBar && this._factionBar.query);
  const shownChildren = (group) =>
    (searching || this.isPowerOpen(group.standingKey)) ? (group.children || []) : [];
  const flatten = (rows) => rows.reduce((out, row) => out.concat([row], shownChildren(row)), []);
  if (!this._factionBar) return flatten(groups);

  // The search strip filters and orders a FLAT list, and handing it the
  // flattened tree is what tore every sub-faction away from its power: an A-Z
  // pass interleaved Britannia's divisions with the Vatican's orders and left
  // each one sitting under whichever unrelated power happened to land above
  // it. So the strip's answer is read as a RANK and re-applied within the
  // tree: powers ordered against powers, children only against their own
  // siblings. A power whose own name misses the query still stands as the
  // header for children that match it, so a hit is never shown parentless.
  const rank = new Map();
  const wholeTree = groups.reduce((out, row) => out.concat([row], row.children || []), []);
  this._factionBar
    .apply(wholeTree, (row) => ({ name: row.name }))
    .forEach((row, i) => rank.set(row, i));

  const rankOf = (row) => (rank.has(row) ? rank.get(row) : Infinity);
  // A power stands where its OWN name puts it. Only a power the query filtered
  // out - kept solely as the header of children that matched - is slotted by
  // the first of those children instead.
  const groupRank = (group) =>
    rank.has(group)
      ? rank.get(group)
      : (group.children || []).reduce((best, child) => Math.min(best, rankOf(child)), Infinity);

  const list = [];
  groups
    .map((group) => ({
      group,
      kids: shownChildren(group).filter((child) => rank.has(child))
        .sort((a, b) => rankOf(a) - rankOf(b)),
    }))
    .filter((entry) => rank.has(entry.group) || entry.kids.length)
    .sort((a, b) => groupRank(a.group) - groupRank(b.group))
    .forEach((entry) => {
      list.push(entry.group);
      entry.kids.forEach((child) => list.push(child));
    });

  return list;
};

// Whose standings the page is showing. The switcher lives on the right page,
// as it does in every other book spread.
Scene_FactionStatus.prototype.switchableMembers = function () {
  return (window.$gameParty && $gameParty.members) ? $gameParty.members().filter((m) => !!m) : [];
};

Scene_FactionStatus.prototype.viewedActor = function () {
  const members = this.switchableMembers();
  if (!members.length) return null;
  const idx = Math.max(0, Math.min(members.length - 1, this._repActorIndex || 0));
  return members[idx];
};

Scene_FactionStatus.prototype.switchRepActor = function (index) {
  const members = this.switchableMembers();
  if (index < 0 || index >= members.length || index === this._repActorIndex) return;
  SoundManager.playCursor();
  this._repActorIndex = index;
  this.refreshUIFactions();
};

Scene_FactionStatus.prototype.cycleRepActor = function (dir) {
  const members = this.switchableMembers();
  if (members.length <= 1) return;
  const next = ((this._repActorIndex || 0) + dir + members.length) % members.length;
  this.switchRepActor(next);
};

Scene_FactionStatus.prototype.refreshUIFactions = function () {
  if (!this._dndContainer) return;

  const factionList = this.getFactionList();

  if (this._dndSelectedIndex >= factionList.length) {
    this._dndSelectedIndex = Math.max(0, factionList.length - 1);
  }

  const selectedRecord = factionList[this._dndSelectedIndex] || null;
  // Standings are read for one character at a time: the world's opinion plus
  // that traveller's own. See Game_Factions.getReputationFor.
  const viewed = this.viewedActor();

  // Generate Left Page: Faction Politics Spread. The rows themselves are filled
  // in by the windowed list further down (UI/MenuVirtualList.js): reading one
  // standing costs a lookup per row, and only the rows on the page are worth
  // paying for.
  const factionRowHTML = (item, idx) => {
    if (!item) return "";
    const isFocused = this._dndSelectedIndex === idx ? "selected" : "";
    const isSub = item.isSub ? "faction-sub" : "";
    const subMarker = item.isSub ? `<span class="faction-sub-marker">⤍</span>` : "";
    // A power that has branches carries the fold that opens them. The caret is
    // its own control so the row behind it still selects rather than folding,
    // and it is .focusable so a pad reaches it as well as the Right key does.
    const foldable = !item.isSub && (item.children || []).length > 0;
    const isOpen = foldable && this.isPowerOpen(item.standingKey);
    const fold = foldable
      ? `<span class="faction-fold focusable ${isOpen ? "is-open" : ""}" onclick="event.stopPropagation(); SceneManager._scene.togglePower('${item.standingKey}')">&#9656;</span>`
      : `<span class="faction-fold faction-fold--none"></span>`;

    const reputation = $gameFactions.getReputationFor(viewed, item.standingKey);
    const reputationLevel = $gameFactions.reputationLevelOf(reputation);
    const reputationClass = $gameFactions.reputationClassOf(reputation);

    return `
      <div class="faction-row ${isFocused} ${isSub}" data-idx="${idx}" onclick="SceneManager._scene.selectUIFaction(${idx})">
        ${fold}
        ${subMarker}
        ${!item.isSub && item.iconIndex ? `
          <div class="faction-icon-frame">
            <canvas class="fac-row-emblem" id="fac-canvas-${idx}" width="32" height="32"></canvas>
          </div>
        ` : ""}
        <div class="faction-info">
          <span class="faction-name">${FRS.escapeText(item.name)}</span>
          ${foldable && !isOpen ? `<span class="faction-branch-count">${(item.children || []).length}</span>` : ""}
        </div>
        <span class="faction-rep-badge ${reputationClass}">${reputationLevel} (${reputation})</span>
      </div>
    `;
  };

  const backBtnText = T("Factions.back");
  const factionsTitle = T("Factions.title");
  // One banner per world: the header button only ever founds it, and it goes
  // away for good once the banner is up (the faction is then run from its own
  // row's action). A register opened to pick a faction for somebody else never
  // offers it at all.
  const ownBtnHTML = (this._selectMode || $gameFactions.hasPlayerFaction()) ? "" : `
        <div class="page-header-action focusable" onclick="SceneManager._scene.openPlayerFaction()">
          ${T("Factions.player.formButton")}
        </div>`;

  const leftPageHTML = `
    <div class="left-page">
      <div class="page-header-bar">
        <div class="back-button focusable" onclick="SceneManager._scene.popScene()">
          ${backBtnText}
        </div>
        <h2 class="title">${factionsTitle}</h2>${ownBtnHTML}
      </div>
      ${this._factionBar ? this._factionBar.html() : ""}
      <div class="backpack-grid ui-list" id="factions-grid"></div>
    </div>
  `;

  // Determine left page key to see if left page needs full render.
  // The badges are per character, so a change of character is a full redraw.
  const ownFaction = $gameFactions.playerFaction();
  const leftPageKey = `${factionList.length}:${viewed ? viewed.actorId() : 0}:` +
    `${ownFaction ? ownFaction.name + "/" + (ownFaction.parentHyperpower || "") : ""}:` +
    (this._factionBar ? this._factionBar.query + this._factionBar.sortDir : '');
  const leftPageContainer = this._dndContainer.querySelector(".left-page");

  // The character switcher belongs at the top of the RIGHT page, right
  // aligned, as it does in every other book spread in the game.
  const members = this.switchableMembers();
  let switcherHTML = "";
  if (members.length > 1 && window.CharSwitcher) {
    const tabs = members.map((m, i) => {
      const sel = (this._repActorIndex || 0) === i ? "selected" : "";
      return `<div class="companion-tab ${sel}" onclick="SceneManager._scene.switchRepActor(${i})">${m.name()}</div>`;
    }).join("");
    switcherHTML = `<div class="companion-switcher ui-switcher-row">` +
      window.CharSwitcher.inner(`<div class="companion-tabs-row">${tabs}</div>`, members.length) +
      `</div>`;
  }

  // Generate Right Page: Political Heraldry Codicil
  let rightPageHTML = "";

  if (!selectedRecord) {
    rightPageHTML = `
      <div class="right-page">
        ${switcherHTML}
        <div class="ui-empty">
          <h3 class="title">${T("Factions.selectTitle")}</h3>
          <p class="ui-empty-text">${T("Factions.selectHint")}</p>
        </div>
      </div>
    `;
  } else {
    // A hyperpower's dossier is read off its head faction where it has one, so
    // an entry with no faction of its own still has a description to show.
    const faction = selectedRecord.faction;
    const isPower = selectedRecord.kind === "hyperpower";
    const hp = selectedRecord.hyperpower;
    const factionName = selectedRecord.name;
    const factionNameHTML = FRS.escapeText(factionName);
    const isPlayerFaction = !!selectedRecord.isPlayer;
    // The party's banner has no dossier written for it: its own page is the
    // roll it is carrying and the day it was raised.
    const description = isPlayerFaction
      ? T("Factions.player.dossier", { name: factionNameHTML })
      : faction
        ? FactionDataManager.instance.t(faction.description)
        : T("Factions.noDossier");

    // One fact: what it is called, and the answer under it. The pair used to be
    // flung to opposite edges of a page-wide row, which put two words at each
    // end of six inches of nothing.
    const fact = (label, value, wide) =>
      `<div class="ui-fact${wide ? " ui-fact--wide" : ""}">` +
      `<span class="ui-fact-lbl">${label}</span>` +
      `<span class="ui-fact-val">${value}</span></div>`;

    // Who has governed it. The roster is not a cabinet sitting today: it is
    // every officeholder the book of leaders has on file for this power, and
    // each of them held the office between two years. So it is printed as a
    // succession, newest reign first, with the span each one served.
    const leaderSource = isPower
      ? [].concat(hp.data.leaders || [], hp.data.holy_leaders || [])
      : (faction && faction.leaders) || [];
    let leadersHTML = "";
    if (leaderSource.length > 0) {
      // Leaders.json holds some of these as slugs ("linus_torvalds"), and the
      // localiser hands a key straight back when there is no entry for it, so
      // an unresolved name is titled here rather than printed as a slug.
      const leaderName = (raw) => {
        const key = (raw && raw.name) ? raw.name : raw;
        const looked = FactionDataManager.instance.t(key);
        const text = (looked && looked !== key) ? looked : String(key || "");
        if (!/[_.]/.test(text)) return text;
        return text.split(/[_.]/).filter(Boolean)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      };
      // A reign that runs past the world's own present is still running: it is
      // written as an open span rather than as a year nobody has reached.
      const events = (window.HistoryManager && window.HistoryManager.getEvents)
        ? window.HistoryManager.getEvents() : null;
      const lastDate = events && events.length ? events[events.length - 1].date : null;
      const nowYear = Number(String(lastDate || "").slice(0, 4)) || 2001;
      const reignOf = (raw) => {
        const y = (raw && raw.years) || [];
        const from = Number(y[0]);
        const to = Number(y[1]);
        if (!Number.isFinite(from)) return "";
        if (!Number.isFinite(to) || to >= nowYear) {
          return T("Factions.reignOpen", { from: from });
        }
        return T("Factions.reignSpan", { from: from, to: to });
      };
      const rows = leaderSource.slice()
        .sort((a, b) => (Number((b.years || [])[0]) || 0) - (Number((a.years || [])[0]) || 0))
        .map(l => `<div class="ui-succession-row">` +
          `<span class="ui-succession-name">${leaderName(l)}</span>` +
          `<span class="ui-succession-years">${reignOf(l)}</span></div>`)
        .join("");
      leadersHTML = fact(T("Factions.pastGovernments"),
        `<div class="ui-succession">${rows}</div>`, true);
    }

    // The two offices a power holds: who governs it, and who it answers to.
    // The moral guide is drawn from a fixed set (Leaders.json `moralGuide`) and
    // succeeds by that power's own rule - a crown by descent, a papacy by
    // conclave, the Archive's by seniority (HistorySimulator).
    let officesHTML = "";
    if (isPower && window.HistoryManager) {
      const HM = window.HistoryManager;
      const moral = HM.getMoralGuide ? HM.getMoralGuide(hp.name) : null;
      // The political office answers with whoever holds it, written down or
      // elected (HistorySimulator.politicalLeaderOf).
      const political = HM.politicalLeaderOf
        ? HM.politicalLeaderOf(hp.name)
        : ((HM.getCurrentLeaders ? HM.getCurrentLeaders() : HM._currentLeaders || {})[hp.name] || null);
      // A leader the century buried still holds their line in the record, and
      // is marked the way the wiki marks them: with a cross. Whoever is merely
      // dying carries the same cross, dimmed - a diagnosis nobody survives is
      // public long before the funeral is.
      const deaths = HM.getLeaderDeaths ? HM.getLeaderDeaths() : {};
      const illnesses = HM.getLeaderIllnesses ? HM.getLeaderIllnesses() : {};
      const mark = leader => {
        const name = leader && leader.name;
        if (!name) return "";
        if (deaths[name]) return ` <span class="npc-bad">✝</span>`;
        if (illnesses[name]) return ` <span class="npc-sub">✝</span>`;
        return "";
      };
      const row = (labelKey, leader) => leader
        ? fact(T(labelKey), FactionDataManager.instance.t(leader.name) + mark(leader))
        : "";
      officesHTML = row("Factions.moralGuide", moral) + row("Factions.politicalLeader", political);
    }

    // The present day, where the roster above is the past: whichever real
    // political party (or, since not everyone answers to one, independent
    // politician) NPCPolitics currently has sitting in this hyperpower's own
    // seat of power. Only hyperpowers NPCPolitics actually simulates have
    // this (Mages Guild, Free States of Midwest and a few others are lore
    // only, so `live` is null for them and nothing is shown).
    let currentGovHTML = "";
    if (isPower && window.NPCPolitics) {
      const live = window.NPCPolitics.getPower(hp.name);
      if (live) {
        const head = live.politicians?.[live.headId];
        const rulingParty = live.parties?.find(p => p.id === live.rulingPartyId);
        const partyLine = rulingParty ? FactionDataManager.instance.t(rulingParty.name) : T("Factions.independentParty");
        currentGovHTML = fact(T("Factions.currentGovernment"),
          `${head ? `${FactionDataManager.instance.t(head.name)} (${window.NPCPolitics.powerLabel(live, "headTitle")}), ` : ""}` +
          T("Factions.rulingPartyLine", { party: partyLine }), true);
      }
    }

    // The branches that answer to this power, so the tree is readable from the
    // dossier as well as from the list.
    let branchesHTML = "";
    if (isPower) {
      const branches = $gameFactions.getHyperpowerFactions(hp.id);
      if (branches.length) {
        branchesHTML = fact(T("Factions.branches"),
          branches.map(b => FactionDataManager.instance.t(b.name)).join(", "), true);
      }
    }

    // What it actually holds. The world simulation's map wins (a century of
    // conquests moves nations between powers); the country table answers for a
    // world whose history was never run.
    let countriesHTML = "";
    if (isPower) {
      const held = $gameFactions.countriesOfHyperpower(hp.name);
      countriesHTML = fact(T("Factions.controlledCountries", { count: held.length }),
        held.length
          ? held.map(n => (window.WorldNames ? window.WorldNames.any(n) : n)).join(", ")
          : T("Factions.holdsNothing"), true);
    }

    // What it has in the field today. The campaign roster (ArmyCampaign, in
    // ArmyEventsManager) rolls the standing columns of every power once a day;
    // this is that list, read from the power's side: how many columns it has
    // out, how many soldiers they add up to and who is commanding each of them.
    // A power at peace on the day has none, and the row simply says so.
    let armiesHTML = "";
    if (isPower && window.ArmyCampaign && typeof window.ArmyCampaign.listArmies === "function") {
      let columns = [];
      try {
        columns = window.ArmyCampaign.listArmies({ includeParty: false })
          .filter(a => a.powerName === hp.name);
      } catch (e) { columns = []; }
      const soldiers = columns.reduce((sum, a) => sum + (a.troopCount || 0), 0);
      armiesHTML = fact(T("Factions.armiesLbl", { count: columns.length }),
        columns.length
          ? columns.map(a => T("Factions.armyLine", {
            leader: FRS.escapeText(String(a.leaderName || "")),
            count: a.troopCount,
            status: window.ArmyCampaign.statusLabel ? window.ArmyCampaign.statusLabel(a) : "",
          })).join(", ")
          : T("Factions.noArmies"), true);
    }

    // What the party's own banner holds: who has joined it, who it answers to,
    // and the way back into the screen where both are changed.
    let ownFactionHTML = "";
    if (isPlayerFaction) {
      const roster = $gameFactions.playerFactionRoster();
      const overlord = $gameFactions.playerFactionOverlord();
      const rows = [
        fact(T("Factions.player.membersLbl"), T("Factions.player.membersLine", {
          total: roster.total, party: roster.party.length, army: roster.army.length,
        })),
        fact(T("Factions.player.allegianceLbl"),
          overlord ? this.hyperpowerLabel(overlord) : T("Factions.player.noOverlord")),
      ];
      if (faction.founded) {
        rows.push(fact(T("Factions.player.foundedLbl"), FRS.escapeText(faction.founded)));
      }
      ownFactionHTML = rows.join("");
    }

    // ...and the long version of the same dossier, in the Archive's own wiki.
    let wikiHTML = "";
    if ((isPower || isPlayerFaction) && window.NPCEmpathize
      && typeof window.NPCEmpathize.openEntity === "function") {
      const kind = isPower ? "power" : "faction";
      const target = encodeURIComponent(isPower ? hp.name : factionName).replace(/'/g, "%27");
      wikiHTML = `
        <div class="inspect-btn focusable"
             onclick="window.NPCEmpathize.openEntity('${kind}', '${target}')">
          ${T("Factions.openWiki")}
        </div>
      `;
    }

    // This character's standing, named as well as numbered.
    const rep = $gameFactions.getReputationFor(viewed, selectedRecord.standingKey);
    const standingHTML = viewed ? `
      <div class="fac-standing ${$gameFactions.reputationClassOf(rep)}">
        <span class="fac-standing-who">${T("Factions.standingOf", { name: viewed.name() })}</span>
        <span class="fac-standing-val">${$gameFactions.reputationLevelOf(rep)} (${rep})</span>
      </div>
    ` : "";

    // A seat at the assembly, when the plugin that hands them out is loaded.
    let postHTML = "";
    if (viewed && window.ONUAssembly && typeof window.ONUAssembly.postLabelFor === "function") {
      const label = window.ONUAssembly.postLabelFor(viewed, selectedRecord.standingKey);
      if (label) {
        postHTML = `<div class="fac-post">${label}</div>`;
      }
    }

    // Where this entry stands with every hyperpower in the world, not with the
    // first three independents that happened to be listed. A branch keeps its
    // own accords, so it can be reading them off a different line from its
    // parent's (Game_Factions.getAccordsFor).
    const relationsHTML = $gameFactions.getAccordsFor(selectedRecord).map(accord => {
      const relClass = accord.value > 0 ? "faction-accord--allied"
        : accord.value < 0 ? "faction-accord--hostile"
        : "faction-accord--neutral";
      return `
        <div class="fac-accord ${relClass}">
          <span class="fac-accord-name">${T(accord.isOwnPower ? "Factions.versusOwn" : "Factions.versus", { name: accord.name })}</span>
          <span class="fac-accord-value">${$gameFactions.relationshipNameOf(accord.value)}</span>
        </div>
      `;
    }).join("");

    rightPageHTML = `
      <div class="right-page">
        ${switcherHTML}
        <div class="ui-detail">

          <div class="ui-detail-head">
            <div class="heraldry-emblem-box">
              <canvas class="fac-emblem" id="heraldry-canvas" width="32" height="32"></canvas>
            </div>
            <div class="ui-detail-titles">
              <h3 class="heraldry-title">${factionNameHTML}</h3>
              <div class="heraldry-subtitle">${T(isPower ? "Factions.kindPower" : "Factions.kindFaction")}</div>
            </div>
            ${standingHTML}
          </div>

          <div class="ui-detail-scroll" id="faction-detail-scroll">
            <div class="ui-prose">${description}</div>
            ${postHTML}

            ${officesHTML || currentGovHTML || leadersHTML ? `
              <div class="inspect-section-title">${T("Factions.leadershipTitle")}</div>
              <div class="ui-fact-grid">
                ${officesHTML}
                ${currentGovHTML}
                ${leadersHTML}
              </div>` : ""}

            ${branchesHTML || countriesHTML || ownFactionHTML || armiesHTML ? `
              <div class="inspect-section-title">${T("Factions.holdingsTitle")}</div>
              <div class="ui-fact-grid">
                ${ownFactionHTML}
                ${branchesHTML}
                ${countriesHTML}
                ${armiesHTML}
              </div>` : ""}

            <div class="inspect-section-title">${T("Factions.diplomaticAgreements")}</div>
            <div class="fac-accord-grid" id="faction-accords">
              ${relationsHTML || `<div class="ui-empty-note">${T("Factions.independent")}</div>`}
            </div>
          </div>

          <div class="inspect-actions">
            ${isPlayerFaction ? `<div class="inspect-btn focusable"
              onclick="SceneManager._scene.openPlayerFaction()">${T("Factions.player.manageButton")}</div>` : ""}
            ${wikiHTML}
          </div>

        </div>
      </div>
    `;
  }

  if (!leftPageContainer || this._dndLastLeftPageKey !== leftPageKey) {
    this._dndLastLeftPageKey = leftPageKey;
    // Draw double page spread
    this._dndContainer.innerHTML = `
      <div class="book-spread">
        ${leftPageHTML}
        ${rightPageHTML}
      </div>
    `;
  } else {
    // Left page already drawn! Update only the right page in-place (the rows
    // themselves are repainted with the window below).
    const rightPageContainer = this._dndContainer.querySelector(".right-page");
    if (rightPageContainer) {
      rightPageContainer.outerHTML = rightPageHTML;
    }
  }

  // The roll of factions, windowed, with each visible row's emblem drawn as it
  // comes on screen (UI/MenuVirtualList.js).
  const grid = this._dndContainer.querySelector("#factions-grid");
  if (grid) {
    window.MenuVirtualList.render(grid, {
      key: leftPageKey,
      count: factionList.length,
      renderItem: (idx) => factionRowHTML(factionList[idx], idx),
      // Walking the roll moves one mark. Every standing and every emblem on
      // screen already reads right, so the window is left as it is rather than
      // rebuilt and its emblems redrawn a canvas at a time.
      focus: { index: this._dndSelectedIndex, selector: '.faction-row', className: 'selected' },
      onWindow: (win, from, to) => {
        for (let idx = from; idx < to; idx++) {
          const item = factionList[idx];
          if (item && !item.isSub && item.iconIndex) {
            this.drawUIFactionEmblem(item.iconIndex, `fac-canvas-${idx}`);
          }
        }
      }
    });
    // Scroll active item into view, by index: the row is only in the DOM once
    // the window reaches it.
    window.MenuVirtualList.scrollToIndex(grid, this._dndSelectedIndex);
  }

  if (selectedRecord && selectedRecord.iconIndex) {
    this.drawUIFactionEmblem(selectedRecord.iconIndex, "heraldry-canvas");
  }
};

Scene_FactionStatus.prototype.drawUIFactionEmblem = function (iconIndex, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const bitmap = ImageManager.loadSystem("IconSet");

  const drawIcon = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 32, 32);
    ctx.imageSmoothingEnabled = false;

    const pw = 32;
    const ph = 32;
    const sx = (iconIndex % 16) * pw;
    const sy = Math.floor(iconIndex / 16) * ph;

    ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, 0, 0, 32, 32);
  };

  if (bitmap.isReady()) {
    drawIcon();
  } else {
    bitmap.addLoadListener(drawIcon);
  }
};

Scene_FactionStatus.prototype.selectUIFaction = function (idx) {
  SoundManager.playCursor();
  this._dndSelectedIndex = idx;
  this.refreshUIFactions();
};

// Scene hook updates & intercepts
const _Scene_FactionStatus_update = Scene_FactionStatus.prototype.update;
Scene_FactionStatus.prototype.update = function () {
  _Scene_FactionStatus_update.call(this);
  // The founding panel is modal: while it is up the register neither moves its
  // cursor nor answers Cancel by leaving.
  if (this._foundPanel) return;
  // A focused search field owns the keyboard (UI/MenuSearchBar.js).
  if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;
  UIFactionsInputManager.update();
};

const _Scene_FactionStatus_terminate = Scene_FactionStatus.prototype.terminate;
Scene_FactionStatus.prototype.terminate = function () {
  _Scene_FactionStatus_terminate.call(this);
  if (this._foundPanel) {
    if (this._foundPanel.parentNode) this._foundPanel.parentNode.removeChild(this._foundPanel);
    this._foundPanel = null;
  }
  if (this._factionBar) { this._factionBar.dispose(); this._factionBar = null; }
  UIFactionsInputManager.deactivate();
  if (window.CharSwitcher) window.CharSwitcher.removeTabKey(this);
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
};

// Keyboard and Gamepad Interceptor for Factions Screen
const UIFactionsInputManager = {
  _scene: null,
  _active: false,

  activate: function (scene) {
    this._scene = scene;
    this._active = true;
  },

  deactivate: function () {
    this._active = false;
    this._scene = null;
  },

  update: function () {
    if (!this._active || !this._scene) return;

    if (Input.isTriggered('pagedown')) {
      this._scene.cycleRepActor(1);
    } else if (Input.isTriggered('pageup')) {
      this._scene.cycleRepActor(-1);
    } else if (Input.isTriggered('down')) {
      this.handleMove("down");
    } else if (Input.isTriggered('up')) {
      this.handleMove("up");
    } else if (Input.isTriggered('right')) {
      this.handleFold(true);
    } else if (Input.isTriggered('left')) {
      this.handleFold(false);
    } else if (Input.isTriggered('ok')) {
      this.handleOk();
    } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
      this.handleCancel();
    }
  },

  handleMove: function (dir) {
    const scene = this._scene;
    const list = scene.getFactionList();
    const count = list.length;

    if (dir === "down") {
      if (scene._dndSelectedIndex < count - 1) {
        SoundManager.playCursor();
        scene._dndSelectedIndex++;
        scene.refreshUIFactions();
      }
    } else if (dir === "up") {
      if (scene._dndSelectedIndex > 0) {
        SoundManager.playCursor();
        scene._dndSelectedIndex--;
        scene.refreshUIFactions();
      }
    }
  },

  // Right opens the power under the cursor, left shuts it. A branch answers
  // left by jumping to the power it hangs from, so one key walks back out of
  // the tree without counting rows.
  handleFold: function (open) {
    const scene = this._scene;
    const list = scene.getFactionList();
    const row = list[scene._dndSelectedIndex];
    if (!row) return;
    if (row.kind === "hyperpower" && (row.children || []).length) {
      if (scene.isPowerOpen(row.standingKey) !== open) scene.togglePower(row.standingKey);
      return;
    }
    if (!open && row.isSub) {
      for (let i = scene._dndSelectedIndex - 1; i >= 0; i--) {
        if (!list[i].isSub) {
          SoundManager.playCursor();
          scene._dndSelectedIndex = i;
          scene.refreshUIFactions();
          return;
        }
      }
    }
  },

  handleOk: function () {
    const scene = this._scene;
    if (scene && scene._selectMode) {
      const list = scene.getFactionList();
      const entry = list[scene._dndSelectedIndex];
      // Five hyperpowers have no faction of their own, so there is no id to
      // hand back: a caller asking for a faction cannot be given one of those.
      // Nor can it be given the party's own banner, which is world state and
      // has no entry in Factions.json for the caller to look up afterwards.
      if (!entry || !entry.faction || entry.isPlayer) {
        SoundManager.playBuzzer();
        return;
      }
      SoundManager.playOk();
      if (scene._onConfirm) {
        const callback = scene._onConfirm;
        scene._onConfirm = null;
        callback(entry.faction.id);
      }
      scene.popScene();
      return;
    }
    // Not picking a faction for somebody else: Confirm opens the long dossier
    // in the Archive, which is what the button on the page does. It was the one
    // control on this screen a cursor could not reach - the list walks with the
    // stick, but the wiki was a click and nothing else.
    scene.openHighlightedWiki();
  },

  handleCancel: function () {
    SoundManager.playCancel();
    this._scene.popScene();
  }
};

//=============================================================================
// Founding a faction of your own
//=============================================================================
//
// The register's own button. One banner per world: before it is raised this
// opens the founding panel, after it is raised it opens the room where the
// faction is run (Scene_PlayerFaction).

Scene_FactionStatus.prototype.openPlayerFaction = function () {
  if ($gameFactions.hasPlayerFaction()) {
    SoundManager.playOk();
    SceneManager.push(Scene_PlayerFaction);
    return;
  }
  this.openFoundingPanel();
};

// The panel is a sibling of the book rather than a child of it: the spread is
// re-rendered whole on every cursor move, and a field being typed into cannot
// survive that.
Scene_FactionStatus.prototype.openFoundingPanel = function () {
  if (this._foundPanel) return;
  SoundManager.playOk();

  const panel = document.createElement("div");
  panel.className = "ui-overlay";
  panel.innerHTML = `
    <div class="ui-panel">
      <h3 class="title">${T("Factions.player.foundTitle")}</h3>
      <p class="ui-panel-hint">${T("Factions.player.foundHint")}</p>
      <input class="ui-input" type="text" maxlength="48"
             aria-label="${T("Factions.player.nameLbl")}">
      <div class="inspect-actions ui-panel-actions">
        <div class="inspect-btn focusable"
             onclick="SceneManager._scene.rerollFactionName()">${T("Factions.player.reroll")}</div>
        <div class="inspect-btn focusable"
             onclick="SceneManager._scene.confirmFounding()">${T("Factions.player.confirm")}</div>
      </div>
      <div class="ui-panel-dismiss focusable"
           onclick="SceneManager._scene.closeFoundingPanel()">${T("Factions.player.cancel")}</div>
    </div>
  `;
  document.body.appendChild(panel);
  this._foundPanel = panel;

  const field = panel.querySelector("input");
  // Set through the property, never through the markup: a rolled name is
  // prose and has no business being pasted into an attribute.
  field.value = $gameFactions.rollPlayerFactionName();
  // A focused field owns the keyboard. RPG Maker listens on the document, so
  // every key has to be stopped at the element or the game reads it too.
  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") this.confirmFounding();
    else if (e.key === "Escape") this.closeFoundingPanel();
  });
  field.addEventListener("keyup", (e) => e.stopPropagation());
  field.addEventListener("keypress", (e) => e.stopPropagation());
  field.focus();
  field.select();
};

Scene_FactionStatus.prototype.rerollFactionName = function () {
  if (!this._foundPanel) return;
  SoundManager.playCursor();
  const field = this._foundPanel.querySelector("input");
  if (!field) return;
  field.value = $gameFactions.rollPlayerFactionName();
  field.focus();
  field.select();
};

Scene_FactionStatus.prototype.closeFoundingPanel = function () {
  if (!this._foundPanel) return;
  SoundManager.playCancel();
  if (this._foundPanel.parentNode) this._foundPanel.parentNode.removeChild(this._foundPanel);
  this._foundPanel = null;
};

Scene_FactionStatus.prototype.confirmFounding = function () {
  if (!this._foundPanel) return;
  const field = this._foundPanel.querySelector("input");
  const typed = field ? field.value : "";
  // Founding is once and for all, and the button should never have offered it
  // a second time: refuse rather than overwrite a banner that already flies.
  if ($gameFactions.hasPlayerFaction()) {
    SoundManager.playBuzzer();
    this.closeFoundingPanel();
    return;
  }
  const record = $gameFactions.foundPlayerFaction(typed);
  SoundManager.playOk();
  if (this._foundPanel.parentNode) this._foundPanel.parentNode.removeChild(this._foundPanel);
  this._foundPanel = null;

  if (window.ParchmentToast) {
    window.ParchmentToast.show(
      T("Factions.player.foundedToast", { name: FRS.escapeText(record.name) }),
      { severity: "info", key: "player-faction" });
  }

  // Land the cursor on the row that was just added, wherever the tree put it.
  this._dndLastLeftPageKey = null;
  const list = this.getFactionList();
  const idx = list.findIndex((row) => row && row.isPlayer);
  if (idx >= 0) this._dndSelectedIndex = idx;
  this.refreshUIFactions();
};

//=============================================================================
// Scene_PlayerFaction - running the banner you raised
//=============================================================================
//
// The left page is the roll: who has joined, counted and named. The right page
// is the allegiance: the powers this faction may swear itself to, and the way
// back out of a vow already taken.

function Scene_PlayerFaction() {
  this.initialize(...arguments);
}

Scene_PlayerFaction.prototype = Object.create(Scene_MenuBase.prototype);
Scene_PlayerFaction.prototype.constructor = Scene_PlayerFaction;
window.Scene_PlayerFaction = Scene_PlayerFaction;

Scene_PlayerFaction.prototype.initialize = function () {
  Scene_MenuBase.prototype.initialize.call(this);
  this._pfIndex = 0;
};

Scene_PlayerFaction.prototype.create = function () {
  Scene_MenuBase.prototype.create.call(this);
  this._pfIndex = 0;

  this._pfContainer = document.createElement("div");
  this._pfContainer.id = "menu-container";
  this._pfContainer.style.opacity = "0";
  this._pfContainer.style.transition = "opacity 0.22s ease-out";
  document.body.appendChild(this._pfContainer);

  // Same reason as the register: RPG Maker preventDefaults wheel on the
  // document, so a DOM overlay has to scroll itself.
  this._pfContainer.addEventListener("wheel", (e) => {
    const box = e.target.closest("#pf-roster, #pf-allegiance, .left-page, .right-page");
    if (box) box.scrollTop += e.deltaY;
    e.stopPropagation();
    e.preventDefault();
  }, { passive: false });

  this.refreshPlayerFaction();

  setTimeout(() => {
    if (this._pfContainer) this._pfContainer.style.opacity = "1";
  }, 16);
};

// The rows the right page walks: standing alone first, then every power that
// could be sworn to. The vow already taken is not offered again.
Scene_PlayerFaction.prototype.allegianceOptions = function () {
  const overlord = $gameFactions.playerFactionOverlord();
  const rows = [];
  if (overlord) rows.push({ id: null, name: T("Factions.player.renounce"), current: false });
  else rows.push({ id: null, name: T("Factions.player.noOverlord"), current: true });
  $gameFactions.getHyperpowers().forEach((hp) => {
    rows.push({
      id: hp.id,
      name: $gameFactions.hyperpowerLabel(hp),
      current: !!overlord && overlord.id === hp.id,
    });
  });
  return rows;
};

Scene_PlayerFaction.prototype.refreshPlayerFaction = function () {
  if (!this._pfContainer) return;
  const record = $gameFactions.playerFaction();
  if (!record) { this.popScene(); return; }

  const roster = $gameFactions.playerFactionRoster();
  const overlord = $gameFactions.playerFactionOverlord();
  const options = this.allegianceOptions();
  if (this._pfIndex >= options.length) this._pfIndex = options.length - 1;

  const nameRow = (label, value) =>
    `<div class="inspect-spec-row"><span class="inspect-spec-label">${label}</span>` +
    `<span class="inspect-spec-value">${value}</span></div>`;

  const memberTags = (names) => names.length
    ? `<div class="ui-chip-row">${names.map((n) =>
        `<span class="ui-chip">${FRS.escapeText(n)}</span>`).join("")}</div>`
    : `<div class="ui-empty-note">${T("Factions.player.emptyRoll")}</div>`;

  const leftPageHTML = `
    <div class="left-page">
      <div class="page-header-bar">
        <div class="back-button focusable" onclick="SceneManager._scene.popScene()">
          ${T("Factions.back")}
        </div>
        <h2 class="title">${FRS.escapeText(record.name)}</h2>
        <div class="page-header-action focusable"
             onclick="SceneManager._scene.openRenamePanel()">${T("Factions.player.rename")}</div>
      </div>
      <div class="ui-section">
        ${nameRow(T("Factions.player.membersLbl"), T("Factions.player.membersLine", {
          total: roster.total, party: roster.party.length, army: roster.army.length,
        }))}
        ${nameRow(T("Factions.player.allegianceLbl"),
          overlord ? $gameFactions.hyperpowerLabel(overlord) : T("Factions.player.noOverlord"))}
        ${record.founded ? nameRow(T("Factions.player.foundedLbl"), FRS.escapeText(record.founded)) : ""}
      </div>
      <div class="backpack-grid ui-list" id="pf-roster">
        <h4 class="inspect-section-title">${T("Factions.player.companionsLbl", { count: roster.party.length })}</h4>
        ${memberTags(roster.party)}
        <h4 class="inspect-section-title">${T("Factions.player.soldiersLbl", { count: roster.army.length })}</h4>
        ${memberTags(roster.army)}
      </div>
    </div>
  `;

  const optionHTML = options.map((option, idx) => {
    const selected = this._pfIndex === idx ? "selected" : "";
    const badge = option.current
      ? `<span class="faction-rep-badge faction-rep--exalted">${T("Factions.player.currentVow")}</span>`
      : "";
    return `
      <div class="faction-row ${selected}" onclick="SceneManager._scene.chooseAllegiance(${idx})">
        <div class="faction-info"><span class="faction-name">${FRS.escapeText(option.name)}</span></div>
        ${badge}
      </div>
    `;
  }).join("");

  const rightPageHTML = `
    <div class="right-page">
      <div class="faction-heraldry-card">
        <div class="heraldry-header">
          <h3 class="heraldry-title">${T("Factions.player.allegianceTitle")}</h3>
        </div>
        <div class="ui-prose">${T("Factions.player.allegianceHint")}</div>
        <div class="faction-accords" id="pf-allegiance">${optionHTML}</div>
      </div>
    </div>
  `;

  this._pfContainer.innerHTML = `<div class="book-spread">${leftPageHTML}${rightPageHTML}</div>`;

  const list = this._pfContainer.querySelector("#pf-allegiance");
  const row = list ? list.children[this._pfIndex] : null;
  if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
};

Scene_PlayerFaction.prototype.movePlayerFactionCursor = function (delta) {
  const options = this.allegianceOptions();
  const next = this._pfIndex + delta;
  if (next < 0 || next >= options.length) return;
  SoundManager.playCursor();
  this._pfIndex = next;
  this.refreshPlayerFaction();
};

Scene_PlayerFaction.prototype.chooseAllegiance = function (idx) {
  const options = this.allegianceOptions();
  const option = options[idx];
  if (!option) return;
  this._pfIndex = idx;
  if (option.current) {
    SoundManager.playBuzzer();
    this.refreshPlayerFaction();
    return;
  }
  SoundManager.playOk();
  $gameFactions.swearPlayerFactionTo(option.id);
  const record = $gameFactions.playerFaction();
  if (window.ParchmentToast) {
    window.ParchmentToast.show(
      option.id === null
        ? T("Factions.player.renouncedToast", { faction: FRS.escapeText(record.name) })
        : T("Factions.player.swornToast", {
          faction: FRS.escapeText(record.name), power: FRS.escapeText(option.name),
        }),
      { severity: "info", key: "player-faction" });
  }
  this._pfIndex = 0;
  this.refreshPlayerFaction();
};

Scene_PlayerFaction.prototype.openRenamePanel = function () {
  if (this._pfRenamePanel) return;
  SoundManager.playOk();
  const record = $gameFactions.playerFaction();

  const panel = document.createElement("div");
  panel.className = "ui-overlay";
  panel.innerHTML = `
    <div class="ui-panel">
      <h3 class="title">${T("Factions.player.rename")}</h3>
      <p class="ui-panel-hint">${T("Factions.player.renameHint")}</p>
      <input class="ui-input" type="text" maxlength="48"
             aria-label="${T("Factions.player.nameLbl")}">
      <div class="inspect-actions ui-panel-actions">
        <div class="inspect-btn focusable"
             onclick="SceneManager._scene.rerollRename()">${T("Factions.player.reroll")}</div>
        <div class="inspect-btn focusable"
             onclick="SceneManager._scene.confirmRename()">${T("Factions.player.confirm")}</div>
      </div>
      <div class="ui-panel-dismiss focusable"
           onclick="SceneManager._scene.closeRenamePanel()">${T("Factions.player.cancel")}</div>
    </div>
  `;
  document.body.appendChild(panel);
  this._pfRenamePanel = panel;

  const field = panel.querySelector("input");
  field.value = record ? record.name : "";
  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") this.confirmRename();
    else if (e.key === "Escape") this.closeRenamePanel();
  });
  field.addEventListener("keyup", (e) => e.stopPropagation());
  field.addEventListener("keypress", (e) => e.stopPropagation());
  field.focus();
  field.select();
};

Scene_PlayerFaction.prototype.rerollRename = function () {
  if (!this._pfRenamePanel) return;
  SoundManager.playCursor();
  const field = this._pfRenamePanel.querySelector("input");
  if (!field) return;
  field.value = $gameFactions.rollPlayerFactionName();
  field.focus();
  field.select();
};

Scene_PlayerFaction.prototype.closeRenamePanel = function () {
  if (!this._pfRenamePanel) return;
  SoundManager.playCancel();
  if (this._pfRenamePanel.parentNode) this._pfRenamePanel.parentNode.removeChild(this._pfRenamePanel);
  this._pfRenamePanel = null;
};

Scene_PlayerFaction.prototype.confirmRename = function () {
  if (!this._pfRenamePanel) return;
  const field = this._pfRenamePanel.querySelector("input");
  const renamed = $gameFactions.renamePlayerFaction(field ? field.value : "");
  if (renamed) SoundManager.playOk(); else SoundManager.playBuzzer();
  if (this._pfRenamePanel.parentNode) this._pfRenamePanel.parentNode.removeChild(this._pfRenamePanel);
  this._pfRenamePanel = null;
  this.refreshPlayerFaction();
};

Scene_PlayerFaction.prototype.update = function () {
  Scene_MenuBase.prototype.update.call(this);
  // A focused field owns the keyboard, here as everywhere else.
  if (this._pfRenamePanel) return;
  if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;

  if (Input.isTriggered("down")) this.movePlayerFactionCursor(1);
  else if (Input.isTriggered("up")) this.movePlayerFactionCursor(-1);
  // The rename button, for a hand that never touches the mouse.
  else if (Input.isTriggered("shift")) this.openRenamePanel();
  else if (Input.isTriggered("ok")) this.chooseAllegiance(this._pfIndex);
  else if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
    SoundManager.playCancel();
    this.popScene();
  }
};

Scene_PlayerFaction.prototype.terminate = function () {
  Scene_MenuBase.prototype.terminate.call(this);
  this.closeRenamePanel();
  if (this._pfContainer) {
    const container = this._pfContainer;
    container.style.transition = "opacity 0.2s ease-out";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    setTimeout(() => {
      if (container && container.parentNode) container.parentNode.removeChild(container);
    }, 200);
    this._pfContainer = null;
  }
};



//=============================================================================

// Window_FactionStatus

//=============================================================================



function Window_FactionStatus() {

  this.initialize(...arguments);

}



Window_FactionStatus.prototype = Object.create(Window_Selectable.prototype);

Window_FactionStatus.prototype.constructor = Window_FactionStatus;



Window_FactionStatus.prototype.initialize = function (rect) {

  Window_Selectable.prototype.initialize.call(this, rect);

  this.makeItemList();

  this.refresh();

  this.activate();

};



// The canvas fallback list groups the same way the DOM spread does: by
// hyperpower, which each faction names in `parentHyperpower`. No faction stands
// in for a power any more, so a power's row is the power itself.
Window_FactionStatus.prototype.makeItemList = function () {

  this._data = [];

  $gameFactions.getHyperpowers().forEach((hp) => {

    $gameFactions.getHyperpowerFactions(hp.id).forEach((child) => {

      this._data.push({ faction: child, isSub: true });

    });

  });

  $gameFactions.getIndependentFactions().forEach((faction) => {

    this._data.push({ faction: faction, isSub: false });

  });

};



Window_FactionStatus.prototype.maxItems = function () {

  return this._data ? this._data.length : 0;

};



Window_FactionStatus.prototype.itemHeight = function () {



  return this.lineHeight(); // Each item takes one line



};



Window_FactionStatus.prototype.drawItem = function (index) {



  const item = this._data[index];



  const faction = item.faction;



  if (faction) {



    const rect = this.itemLineRect(index);







    // Determine which language to use for name and description



    const factionName = FactionDataManager.instance.t(faction.name);







    const reputation = $gameFactions.getReputation(faction.id);



    const reputationLevel = $gameFactions.getReputationLevel(faction.id);



    const reputationColor = $gameFactions.getReputationColor(faction.id);







    const iconWidth = ImageManager.iconWidth;



    const baseTextIndent = iconWidth + 4; // Space for icon + padding



    const subFactionIndent = 32; // Additional indent for subfactions







    let currentTextX = rect.x;







    // Draw icon for main factions



    if (!item.isSub && faction.iconIndex) {



      this.drawIcon(faction.iconIndex, currentTextX, rect.y);



    }







    // Adjust textX based on whether it's a subfaction or main faction



    if (item.isSub) {



      currentTextX += baseTextIndent + subFactionIndent; // Subfactions get icon space + additional indent



    } else {



      currentTextX += baseTextIndent; // Main factions just get icon space



    }







    const availableWidth = rect.width - (currentTextX - rect.x);



    const textY = rect.y;







    // Draw faction name (left-aligned)



    this.changeTextColor(ColorManager.normalColor());



    this.drawText(factionName, currentTextX, textY, availableWidth / 2, "left");







    // Draw reputation (right-aligned)



    this.changeTextColor(reputationColor);



    const repText = reputationLevel + ` (${reputation})`;



    this.drawText(repText, currentTextX + availableWidth / 2, textY, availableWidth / 2, "right");



  }



};



Window_FactionStatus.prototype.update = function () {

  Window_Selectable.prototype.update.call(this);

  if (this.isOpenAndActive()) {

    if (Input.isTriggered("ok") || Input.isTriggered("cancel")) {

      SoundManager.playCancel();

      this.callHandler("cancel");

    }

  }

};

