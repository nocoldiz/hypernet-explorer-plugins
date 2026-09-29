/*:
 * @target MZ
 * @plugindesc v1.0.0 ONU Assembly UI - the chamber, the agenda page and the division board. Exposes window.ONUAssemblyUI.
 * @author Hypernet
 *
 * @help ONUAssemblyUI.js
 *
 * The drawing half of NPC/ONUAssembly.js. The system holds the roster, the
 * motions, the ballots and the ledger; this file holds every element the
 * player ever sees of them.
 *
 * Nothing here knows the rules. It reads `window.ONUAssembly._model`, which
 * the system publishes when it loads, and it asks that for the words, the
 * standings and the money. It never writes to the ledger.
 *
 * The screen is the shared spread of docs/task/ui_fixing.md: a left page that
 * is the transcript and the answers, a right page that is the agenda, the
 * dossier or the division board. No colour, no size and no measure is named
 * in here: the classes live in css/theme.css and the two presets ink them.
 *
 * The file also draws the main menu's Politics pocket (Scene_Politics): who
 * governs the place the party stands in, the town hall, the nation and the
 * bloc above it, read off NPCPolitics.describePlace and NPCPolitics.electedOf,
 * plus every party in the world narrowed to a place (Parties tab) and the
 * party's own political party (Own party tab: found it, or edit its name,
 * creed, tenets and weekly subscription fee).
 *
 * And the Propaganda2 HypernetOS program (window.Propaganda2App, the last
 * section): the same party office, the party index with its filters, paid
 * conversion and smear campaigns with the simulation's projection, and
 * candidacies in any election still to come. The rules for all of it live in
 * NPCPolitics.js (THE PARTY'S OWN POLITICAL PARTY); these screens only ask.
 */

(() => {
  "use strict";

  // The system publishes this when it loads. Read late rather than captured,
  // because either plugin may be the one the engine loads first.
  const M = () => (window.ONUAssembly && window.ONUAssembly._model) || null;
  const T = (k, t) => { const m = M(); return m ? m.T(k, t) : k; };
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // For a value written inside an attribute, where a quote would end it.
  const escAttr = (s) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const COURT_ATTR = "data-onu-sitting";

  function assemblyIsSitting() {
    const node = document.querySelector("[" + COURT_ATTR + "]");
    return !!(node && node.isConnected);
  }

  // Escape and the pad's cancel both read as 'cancel'; the right mouse button
  // arrives as a TouchInput cancel. Polled in one place so a single press can
  // only ever be counted once.
  const cancelPressed = () => Input.isTriggered("cancel") || TouchInput.isCancelled();

  // The chamber's prompts poll on animation frames, and a screen can draw
  // more than one of those per game frame. Input only changes on a game
  // frame, so a poll reads it at most once per frame: one press, one action.
  const freshInputFrame = (state) => {
    const frame = (typeof Graphics !== "undefined" && Graphics.frameCount) || 0;
    if (state.frame === frame) return false;
    state.frame = frame;
    return true;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const AUTO_BASE_MS = 620;
  const AUTO_PER_CHAR_MS = 26;
  const AUTO_MAX_MS = 5200;

  // The two states of the continue caret. Glyphs rather than words: they are
  // the same in every language and they name no key, which is the rule the
  // whole UI pass is written to (docs/task/ui_fixing.md).
  const CARET_WAIT = "▾";
  const CARET_AUTO = "▸▸";

  //===========================================================================
  // The chamber
  //===========================================================================
  //
  // One transcript, one right page, one set of answers. The log is the record
  // and not the screen, so the page can be rebuilt from it if something takes
  // it away underneath a sitting.

  class Chamber {
    constructor(titleKey) {
      this._titleKey = titleKey || "ONUMenu.ui.assembly";
      this._log = [];
      this._autoPlay = false;
      this._sidebar = "";
      this._container = null;
      this._headline = "";
    }

    open() {
      this._container = document.createElement("div");
      this._container.id = "menu-container";
      this._container.setAttribute(COURT_ATTR, "1");
      document.body.appendChild(this._container);
      this.render();
    }

    close() {
      if (!this._container) return;
      const c = this._container;
      c.classList.add("onu-closing");
      setTimeout(() => { if (c && c.parentNode) c.parentNode.removeChild(c); }, 250);
      this._container = null;
    }

    setSidebar(html) {
      this._sidebar = html || "";
      const page = this._container ? this._container.querySelector("#onu-side") : null;
      if (page) page.innerHTML = this._sidebar; else this.render();
      paintMeasures(this._container);
    }

    setHeadline(text) {
      this._headline = text || "";
      const el = this._container ? this._container.querySelector("#onu-headline") : null;
      if (el) el.textContent = this._headline;
    }

    logHTML() {
      return this._log.map((e) => {
        const body = esc(e.text).replace(/\r?\n/g, "<br>");
        if (e.who === "narrator") return `<div class="onu-line narrator">${body}</div>`;
        const speaker = e.speaker ? `<span class="onu-line-speaker">${esc(e.speaker)}</span>` : "";
        return `<div class="onu-line ${e.who}">${speaker}${body}</div>`;
      }).join("");
    }

    render() {
      if (!this._container) return;
      this._container.innerHTML = `
        <div class="book-spread">
          <div class="left-page onu-page">
            <div class="page-header-bar"><h2 class="title">${T(this._titleKey)}</h2></div>
            <div class="onu-headline" id="onu-headline">${esc(this._headline)}</div>
            <div class="onu-transcript ui-scroll" id="onu-log">${this.logHTML()}</div>
            <div class="onu-answers" id="onu-choices"></div>
          </div>
          <div class="right-page onu-page ui-detail" id="onu-side">${this._sidebar}</div>
        </div>`;
      const log = this._container.querySelector("#onu-log");
      if (log) log.scrollTop = log.scrollHeight;
      paintMeasures(this._container);
    }

    // The transcript is the record. If something has taken the page away, draw
    // it again from the log rather than play the rest of the sitting out to
    // nobody.
    ensure() {
      let log = document.getElementById("onu-log");
      if (log) return log;
      if (!this._container) return null;
      if (!this._container.parentNode) document.body.appendChild(this._container);
      this.render();
      return document.getElementById("onu-log");
    }

    // who: 'narrator' for stage directions, 'player' for the delegate the
    // player is, anything else for a speaker on the floor.
    add(text, who, speaker) {
      const m = M();
      const clean = (m ? m.vary(String(text)) : String(text)).replace(/\\C\[\d+\]/g, "");
      const kind = who === "narrator" ? "narrator" : (who === "player" ? "player" : "floor");
      this._log.push({ who: kind, text: clean, speaker: speaker || "" });
      const log = this.ensure();
      if (!log) return;
      const entry = document.createElement("div");
      entry.className = `onu-line ${kind}`;
      const body = esc(clean).replace(/\r?\n/g, "<br>");
      entry.innerHTML = (speaker ? `<span class="onu-line-speaker">${esc(speaker)}</span>` : "") + body;
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }

    autoDelay() {
      const last = this._log.length ? this._log[this._log.length - 1] : null;
      const chars = last ? String(last.text).length : 0;
      return Math.min(AUTO_MAX_MS, AUTO_BASE_MS + chars * AUTO_PER_CHAR_MS);
    }

    // Shows one message at a time and blocks until the player presses on, or
    // until auto play closes it for them.
    advance(minReadMs = 260) {
      const log = this.ensure();
      let hint = null;
      if (log) {
        hint = document.createElement("div");
        hint.className = "onu-caret";
        log.appendChild(hint);
        log.scrollTop = log.scrollHeight;
      }

      return new Promise((resolve) => {
        let readyAt = performance.now() + minReadMs;
        let autoAt = this._autoPlay ? performance.now() + this.autoDelay() : 0;
        let armed = false;
        let active = true;

        // One chevron means the transcript is waiting on the reader, two mean
        // it is running itself. Never a key name.
        const paint = () => {
          if (!hint) return;
          hint.classList.toggle("auto", !!this._autoPlay);
          if (this._autoPlay) {
            hint.textContent = CARET_AUTO;
            hint.classList.add("ready");
          } else {
            hint.textContent = CARET_WAIT;
            hint.classList.toggle("ready", armed);
          }
        };

        const done = () => {
          active = false;
          if (log) log.removeEventListener("click", ch);
          if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
          // Drop the press so the next wait or choice does not inherit it.
          Input.clear();
          resolve();
        };

        const startAuto = () => {
          this._autoPlay = true;
          autoAt = performance.now() + this.autoDelay();
          SoundManager.playCursor();
          paint();
        };
        const stopAuto = () => {
          this._autoPlay = false;
          armed = false;
          readyAt = performance.now() + 200;
          paint();
        };

        // Enter and Space reach the poll through Input as 'ok', like the pad's
        // A: a DOM keydown handler beside it used to advance a second time.
        const ch = () => {
          if (this._autoPlay) { stopAuto(); SoundManager.playOk(); done(); return; }
          if (armed) { SoundManager.playOk(); done(); }
        };
        if (log) log.addEventListener("click", ch);
        paint();

        const frameGate = { frame: -1 };
        const poll = () => {
          if (!active) return;
          if (!freshInputFrame(frameGate)) { requestAnimationFrame(poll); return; }
          if (this._autoPlay) {
            if (cancelPressed()) {
              stopAuto();
            } else if (Input.isTriggered("ok")) {
              stopAuto(); SoundManager.playOk(); done(); return;
            } else if (performance.now() >= autoAt) {
              done(); return;
            }
            requestAnimationFrame(poll);
            return;
          }
          if (cancelPressed()) { startAuto(); requestAnimationFrame(poll); return; }
          if (!armed) {
            const held = Input.isPressed("ok") || Input.isPressed("down") || Input.isPressed("right");
            if (!held && performance.now() >= readyAt) { armed = true; paint(); }
          } else if (Input.isTriggered("ok") || Input.isTriggered("down") || Input.isTriggered("right")) {
            SoundManager.playOk(); done(); return;
          }
          requestAnimationFrame(poll);
        };
        poll();
      });
    }

    // Returns the chosen index. Keyboard and pad both arrive through Input
    // alone: a DOM keydown handler beside this poll moved the cursor twice per
    // press. `echo` false keeps a menu choice out of the transcript.
    choose(rawChoices, opts) {
      const options = opts || {};
      const m = M();
      const choices = rawChoices.map((c) => (typeof c === "string" ? { text: c } : c));
      const labels = choices.map((c) => (m ? m.vary(c.text) : c.text));
      // A question is where auto play always hands the sitting back.
      this._autoPlay = false;
      return new Promise((resolve) => {
        let panel = document.getElementById("onu-choices");
        if (!panel) { this.ensure(); panel = document.getElementById("onu-choices"); }
        if (!panel) { resolve(0); return; }
        panel.innerHTML = "";
        let sel = 0;
        let active = true;
        // The press that closed the last message must not also answer the
        // question it asked.
        let armed = false;
        const readyAt = performance.now() + 200;

        const btns = labels.map((text, i) => {
          const btn = document.createElement("div");
          btn.className = "onu-answer focusable" + (i === 0 ? " selected" : "") +
            (choices[i].disabled ? " disabled" : "");
          btn.tabIndex = 0;
          btn.textContent = text;
          btn.addEventListener("mouseenter", () => { if (armed) { sel = i; upd(); } });
          btn.addEventListener("click", () => { if (armed) finish(i); });
          panel.appendChild(btn);
          return btn;
        });
        const upd = () => btns.forEach((b, i) => b.classList.toggle("selected", i === sel));
        const finish = (idx) => {
          if (choices[idx].disabled) { SoundManager.playBuzzer(); return; }
          active = false;
          if (options.echo !== false) this.add(labels[idx], "player", options.speaker || T("ONUMenu.ui.you"));
          panel.innerHTML = "";
          SoundManager.playOk();
          Input.clear();
          resolve(idx);
        };

        const frameGate = { frame: -1 };
        const poll = () => {
          if (!active) return;
          if (!freshInputFrame(frameGate)) { requestAnimationFrame(poll); return; }
          if (!armed) {
            if (!Input.isPressed("ok") && performance.now() >= readyAt) armed = true;
            requestAnimationFrame(poll);
            return;
          }
          if (Input.isTriggered("down") || Input.isRepeated("down")) {
            sel = (sel + 1) % btns.length; upd(); SoundManager.playCursor();
            if (options.onMove) options.onMove(sel);
          } else if (Input.isTriggered("up") || Input.isRepeated("up")) {
            sel = (sel - 1 + btns.length) % btns.length; upd(); SoundManager.playCursor();
            if (options.onMove) options.onMove(sel);
          } else if (Input.isTriggered("ok")) {
            finish(sel); return;
          } else if (options.cancelIndex != null && cancelPressed()) {
            active = false;
            panel.innerHTML = "";
            SoundManager.playCancel();
            Input.clear();
            resolve(options.cancelIndex);
            return;
          }
          requestAnimationFrame(poll);
        };
        poll();
      });
    }
  }

  //===========================================================================
  // The right page
  //===========================================================================

  // Every measure the stylesheet cannot know is handed over as a custom
  // property once the markup has landed, which is how the pass keeps an
  // inline style attribute out of a template without giving up a data driven bar.
  function paintMeasures(root) {
    const scope = root || document;
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll("[data-onu-fill]").forEach((el) => {
      el.style.setProperty("--onu-fill", el.getAttribute("data-onu-fill") + "%");
    });
  }

  // `axis` is the stat the bar measures, and also the modifier that inks it:
  // .onu-stat--military and friends live in theme.css so a preset can retune
  // the whole page without this file naming a single colour.
  function statBar(label, value, max, axis) {
    const pct = Math.round(Math.max(0, Math.min(100, (value / max) * 100)));
    return `<div class="onu-stat-row">
      <span class="onu-stat-label">${label}</span>
      <span class="onu-stat-track">
        <span class="onu-stat-fill onu-stat--${axis}" data-onu-fill="${pct}"></span>
      </span>
      <span class="onu-stat-value">${value}</span>
    </div>`;
  }

  function factRow(label, value) {
    return `<div class="inspect-spec-row">
      <span class="inspect-spec-label">${label}</span>
      <span class="inspect-spec-value">${value}</span>
    </div>`;
  }

  function dossierHTML(delegation, actor) {
    const m = M();
    if (!delegation || !m) return "";
    const rep = m.standingFor(actor, delegation);
    const branches = delegation.branchIds
      .map((id) => {
        const f = $gameFactions.getFaction(id);
        return f ? FactionDataManager.instance.t(f.name) : null;
      })
      .filter(Boolean);
    const s = delegation.stats;
    const bars = delegation.kind === "hyperpower" ? [
      statBar(T("ONUMenu.stat.military"), s.military, 200, "military"),
      statBar(T("ONUMenu.stat.economy"), s.economy, 200, "economy"),
      statBar(T("ONUMenu.stat.population"), s.population, 300, "population"),
      statBar(T("ONUMenu.stat.information"), s.information, 100, "information"),
      statBar(T("ONUMenu.stat.arcane"), s.arcane, 100, "arcane"),
    ].join("") : [
      statBar(T("ONUMenu.stat.information"), s.information, 100, "information"),
      statBar(T("ONUMenu.stat.arcane"), s.arcane, 100, "arcane"),
    ].join("");

    return `
      <div class="ui-detail-head">
        <canvas class="onu-emblem" id="onu-emblem" width="32" height="32"></canvas>
        <div class="ui-detail-titles">
          <h3 class="onu-delegation">${esc(delegation.name)}</h3>
          <div class="onu-led-by">${T("ONUMenu.ui.ledBy", { leader: esc(m.leaderOf(delegation)) })}</div>
        </div>
      </div>
      <div class="ui-prose onu-dossier-lore ui-scroll">
        ${delegation.description || T("Factions.noDossier")}
      </div>
      <div class="ui-section">${bars}</div>
      ${branches.length ? `<div class="inspect-spec-row inspect-spec-row--stacked">
        <span class="inspect-spec-label">${T("Factions.branches")}</span>
        <span class="inspect-spec-value">${esc(branches.join(", "))}</span>
      </div>` : ""}
      <div class="ui-section">
        ${factRow(T("ONUMenu.ui.yourStanding"),
          `<span class="${$gameFactions.reputationClassOf(rep)}">${$gameFactions.reputationLevelOf(rep)} (${rep})</span>`)}
        ${factRow(T("ONUMenu.ui.projectedStipend"), m.euros(m.projectedStipend(rep)))}
      </div>`;
  }

  function drawEmblem(iconIndex, canvasId) {
    const canvas = document.getElementById(canvasId || "onu-emblem");
    if (!canvas || !iconIndex) return;
    const bitmap = ImageManager.loadSystem("IconSet");
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, 32, 32);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap.canvas, (iconIndex % 16) * 32, Math.floor(iconIndex / 16) * 32, 32, 32, 0, 0, 32, 32);
    };
    if (bitmap.isReady()) draw(); else bitmap.addLoadListener(draw);
  }

  // The agenda page: what is on the floor and how the room has voted so far.
  function agendaHTML(session, motion) {
    const rows = session.agenda.map((m, i) => {
      const state = i < session.index ? "done" : (i === session.index ? "current" : "pending");
      const mark = state === "done"
        ? (session.results[i] && session.results[i].passed ? T("ONUMenu.ui.carried") : T("ONUMenu.ui.failed"))
        : (state === "current" ? T("ONUMenu.ui.onTheFloor") : T("ONUMenu.ui.toCome"));
      const markClass = state === "done"
        ? (session.results[i] && session.results[i].passed ? "onu-mark--carried" : "onu-mark--failed")
        : (state === "current" ? "onu-mark--current" : "onu-mark--pending");
      return `<div class="inspect-spec-row${state === "pending" ? " onu-row--pending" : ""}">
        <span class="inspect-spec-label">${esc(m.title)}</span>
        <span class="inspect-spec-value ${markClass}">${mark}</span>
      </div>`;
    }).join("");

    const seat = session.actor
      ? factRow(T("ONUMenu.ui.representing"),
        esc(session.sg ? T("ONUMenu.role.secretaryGeneral") : (session.delegation ? session.delegation.name : "?")))
      : "";

    return `
      <div class="ui-detail-head"><h3 class="onu-delegation">${T("ONUMenu.ui.agenda")}</h3></div>
      <div class="ui-section">
        <h4 class="onu-section-head">${T("ONUMenu.ui.chamber")}</h4>
        ${factRow(T("ONUMenu.ui.venue"), esc(session.venue))}
        ${factRow(T("ONUMenu.ui.chairing"), esc(session.chair))}
      </div>
      <div class="ui-section">
        <h4 class="onu-section-head">${T("ONUMenu.ui.motions")}</h4>
        ${rows}
      </div>
      <div class="ui-section">
        ${motion ? factRow(T("ONUMenu.ui.ballotKind"),
          motion.ballot === "secret" ? T("ONUMenu.ui.secretBallot") : T("ONUMenu.ui.publicBallot")) : ""}
        ${seat}
      </div>`;
  }

  // The board: one tile per seat, inked for, against or abstaining. A tile is
  // a reading and not an option, so it carries no plate and no frame: the vote
  // is the ink, and a hairline under the name.
  function boardHTML(entries, opts) {
    const secret = !!(opts && opts.secret);
    const tiles = entries.map((e, i) => `
      <div class="onu-seat" id="onu-seat-${i}">
        ${secret ? T("ONUMenu.ui.sealedSeat") : esc(e.delegation.name)}
      </div>`).join("");
    return `
      <div class="ui-detail-head"><h3 class="onu-delegation">${T("ONUMenu.ui.division")}</h3></div>
      <div class="ui-prose onu-ballot-note">
        ${secret ? T("ONUMenu.ui.secretBallotNote") : T("ONUMenu.ui.publicBallotNote")}
      </div>
      <div class="onu-board" id="onu-board">${tiles}</div>
      <div class="onu-tally" id="onu-tally"></div>`;
  }

  // How a seat is painted once it has voted: .onu-seat--for / --against /
  // --abstain in theme.css. Kept as classes so the board reads on either
  // preset instead of the one it was drawn against.
  const VOTE_CLASSES = ["onu-seat--for", "onu-seat--against", "onu-seat--abstain"];

  function paintSeat(index, vote) {
    const el = document.getElementById("onu-seat-" + index);
    if (!el) return;
    el.classList.remove(...VOTE_CLASSES);
    el.classList.add(VOTE_CLASSES.includes("onu-seat--" + vote) ? "onu-seat--" + vote : "onu-seat--abstain");
  }

  function paintTally(counts) {
    const el = document.getElementById("onu-tally");
    if (!el) return;
    el.innerHTML =
      `<span class="onu-tally-part onu-tally--for">${T("ONUMenu.ui.votesFor")} ${counts.for}</span>` +
      `<span class="onu-tally-part onu-tally--against">${T("ONUMenu.ui.votesAgainst")} ${counts.against}</span>` +
      `<span class="onu-tally-part onu-tally--abstain">${T("ONUMenu.ui.votesAbstain")} ${counts.abstain}</span>`;
  }

  // A notice with nothing to inspect beside it: no seat, or no power willing
  // to vouch for the traveller.
  function noticeHTML(titleKey, hintKey) {
    return `<div class="onu-notice">
      <h3 class="onu-notice-title">${T(titleKey)}</h3>
      <p class="onu-notice-text">${T(hintKey)}</p>
    </div>`;
  }

  // The chair's own page: it represents nobody, so it reads as a service
  // record rather than as a dossier.
  function secretaryHTML(actor, post, state) {
    const m = M();
    if (!m) return "";
    return `
      <div class="ui-detail-head"><h3 class="onu-delegation">${T("ONUMenu.role.secretaryGeneral")}</h3></div>
      <div class="ui-prose onu-dossier-lore">${T("ONUMenu.ui.sgBlurb")}</div>
      <div class="ui-section">
        ${factRow(T("ONUMenu.ui.weeksServed"), post.weeksServed || 0)}
        ${factRow(T("ONUMenu.ui.weeklyStipend"), m.euros(m.weeklyPay(actor)))}
        ${factRow(T("ONUMenu.ui.sessionsHeld"), (state && state.sessionsHeld) || 0)}
      </div>`;
  }

  // A seated delegate's page: the dossier of the power they serve, with their
  // own service under it.
  function seatedHTML(actor, post, delegation) {
    const m = M();
    if (!m) return "";
    return dossierHTML(delegation, actor) + `<div class="ui-section">
      ${factRow(T("ONUMenu.ui.weeksServed"), post.weeksServed || 0)}
      ${factRow(T("ONUMenu.ui.weeklyStipend"), m.euros(m.weeklyPay(actor)))}
    </div>`;
  }

  window.ONUAssemblyUI = {
    Chamber,
    assemblyIsSitting,
    sleep,
    statBar,
    dossierHTML,
    drawEmblem,
    agendaHTML,
    boardHTML,
    paintSeat,
    paintTally,
    noticeHTML,
    secretaryHTML,
    seatedHTML,
  };

  // The Chamber portal is drawing, so it lives here; everything it knows it
  // asks window.ONUAssembly for, late, like the rest of this file.
  const OA = () => window.ONUAssembly;
  const catchUpSessions = () => OA().catchUpSessions();
  const weeksUntilSession = () => OA().weeksUntilSession();
  const delegations = () => OA().delegations();
  const delegationByKey = (k) => OA().delegationByKey(k);
  const standingFor = (a, d) => OA().standingFor(a, d);
  const leaderOf = (d) => OA().leaderOf(d);
  const joinableFor = (a) => OA().joinableFor(a);
  const postOf = (a) => OA().postOf(a);
  const euros = (g) => M().euros(g);
  const chamberMotions = () => M().motions();
  //===========================================================================
  // Chamber: the assembly's public portal, as a HypernetOS program
  //===========================================================================
  // The assembly sits every Monday whether anyone from the party is in the room
  // or not, and until now the only way to learn any of it was to take a seat.
  // This is the portal the chamber publishes to: who the powers are, who leads
  // them, where the party stands with each, which seats the party holds and
  // what it is paid for them, and the list of business the chamber is even
  // allowed to put to a vote. Taking a seat, speaking and voting are done in
  // the chamber, in person, because that is the game.
  const ONU_APP_ID = 'app-chamber';
  const ONU_ICON = 192; // Letter, per js/db/Sprites/Icons.json

  // The CH fragments are .chp-* classes in css/hypernet.css.

  const chEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const chIcon = (index, size) => (window.HypernetOS ? window.HypernetOS.getIconHTML(index, size || 16) : '');

  const CHAMBER_TABS = ['floor', 'powers', 'seats', 'business'];

  window.ChamberPortal = {
    win: null,
    tab: 'floor',

    launch() {
      if (!window.HypernetOS || !window.HypernetOS.WindowManager) return;
      const win = window.HypernetOS.WindowManager.createWindow({
        id: ONU_APP_ID,
        title: T('ONUMenu.portal.appName'),
        icon: ONU_ICON,
        width: 850,
        height: 560,
        contentHTML: `
          <div class="chp-app">
            <div class="chp-header">
              <div class="chp-logo">${chIcon(ONU_ICON, 34)}</div>
              <div class="chp-grow">
                <div class="chp-title">${T('ONUMenu.portal.appName')}</div>
                <div class="chp-subtitle">${T('ONUMenu.portal.subtitle')}</div>
              </div>
              <div id="ch-next" class="chp-aside"></div>
            </div>
            <div class="chp-body">
              <div id="ch-nav" class="chp-nav"></div>
              <div id="ch-panel" class="chp-panel"></div>
            </div>
            <div class="chp-status"><span>${T('ONUMenu.portal.inPerson')}</span></div>
          </div>`
      });
      this.win = win;
      this.bind();
      // The sittings nobody attended are resolved the same way walking in does
      // it, so the portal never reports a chamber that is weeks behind.
      try { catchUpSessions(); } catch (e) { console.warn('[Chamber]', e); }
      this.render();
    },

    bind() {
      if (!this.win || this.win.dataset.chBound) return;
      this.win.dataset.chBound = '1';
      this.win.addEventListener('click', ev => {
        const hit = ev.target.closest('[data-ch-tab]');
        if (!hit) return;
        ev.stopPropagation();
        if (this.tab === hit.dataset.chTab) return;
        this.tab = hit.dataset.chTab;
        if (window.SoundManager) SoundManager.playCursor();
        this.render();
      });
    },

    render() {
      if (!this.win || !this.win.isConnected) return;
      const nav = this.win.querySelector('#ch-nav');
      if (nav) {
        nav.innerHTML = CHAMBER_TABS.map(tab => {
          const on = this.tab === tab;
          return `<div class="focusable chp-navItem${on ? ' chp-nav-on' : ''}" tabindex="0" id="ch-tab-${tab}" data-ch-tab="${tab}">
            ${chEsc(T('ONUMenu.portal.tab.' + tab))}</div>`;
        }).join('');
      }
      const panel = this.win.querySelector('#ch-panel');
      if (panel) {
        if (this.tab === 'floor') panel.innerHTML = this.floorHTML();
        else if (this.tab === 'powers') panel.innerHTML = this.powersHTML();
        else if (this.tab === 'seats') panel.innerHTML = this.seatsHTML();
        else panel.innerHTML = this.businessHTML();
      }
      const next = this.win.querySelector('#ch-next');
      if (next) {
        let weeks = 0;
        try { weeks = weeksUntilSession(); } catch (e) { weeks = 0; }
        next.textContent = weeks > 0
          ? T('ONUMenu.portal.nextSittingIn', { n: weeks })
          : T('ONUMenu.portal.sittingThisWeek');
      }
    },

    ourSeats() {
      try { return window.ONUAssembly.listPosts() || []; } catch (e) { return []; }
    },

    powers() {
      try { return delegations() || []; } catch (e) { console.warn('[Chamber]', e); return []; }
    },

    floorHTML() {
      const seats = this.ourSeats();
      const powers = this.powers();
      const pay = seats.reduce((n, s) => n + (Number(s.weeklyPay) || 0), 0);
      return `
        <h2 class="chp-h">${T('ONUMenu.portal.floorTitle')}</h2>
        <div class="chp-card">
          <div>${T('ONUMenu.portal.powersSeated', { n: powers.length })}</div>
          <div>${seats.length
            ? T('ONUMenu.portal.weHold', { n: seats.length, pay: euros(pay) })
            : T('ONUMenu.portal.weHoldNothing')}</div>
        </div>
        ${seats.length ? `<div class="chp-card chp-tight"><table class="chp-table">
          <thead><tr>
            <th class="chp-th">${T('ONUMenu.portal.colDelegate')}</th>
            <th class="chp-th">${T('ONUMenu.portal.colFor')}</th>
            <th class="chp-th">${T('ONUMenu.portal.colStanding')}</th>
            <th class="chp-th chp-right">${T('ONUMenu.portal.colWeekly')}</th>
          </tr></thead><tbody>${seats.map(seat => `<tr>
            <td class="chp-td">${chEsc(seat.actorName)}</td>
            <td class="chp-td">${chIcon(seat.iconIndex)} ${chEsc(seat.factionName)}</td>
            <td class="chp-td">${chEsc(seat.standingLabel)}</td>
            <td class="chp-td chp-right">${chEsc(euros(seat.weeklyPay))}</td>
          </tr>`).join('')}</tbody></table></div>` : ''}
        <div class="chp-note">${T('ONUMenu.portal.floorNote')}</div>`;
    },

    powersHTML() {
      const powers = this.powers();
      if (!powers.length) {
        return `<h2 class="chp-h">${T('ONUMenu.portal.tab.powers')}</h2>
          <div class="chp-card chp-note">${T('ONUMenu.portal.noChamber')}</div>`;
      }
      // Standing is per character, so the column reads for the party leader:
      // the one who would be shown to the door first.
      const leader = (window.$gameParty && $gameParty.leader) ? $gameParty.leader() : null;
      const rows = powers.map(power => {
        let standing = 0;
        try { standing = leader ? standingFor(leader, power) : 0; } catch (e) { standing = 0; }
        const label = ($gameFactions && $gameFactions.reputationLevelOf)
          ? $gameFactions.reputationLevelOf(standing) : String(standing);
        return `<tr>
          <td class="chp-td">${chIcon(power.iconIndex)} ${chEsc(power.name)}</td>
          <td class="chp-td">${chEsc(leaderOf(power) || '')}</td>
          <td class="chp-td chp-right">${standing}</td>
          <td class="chp-td">${chEsc(label)}</td>
        </tr>`;
      }).join('');
      return `<h2 class="chp-h">${T('ONUMenu.portal.tab.powers')}</h2>
        <div class="chp-note chp-mb">${T('ONUMenu.portal.powersBlurb', {
          who: leader ? leader.name() : '' })}</div>
        <div class="chp-card chp-tight"><table class="chp-table">
          <thead><tr>
            <th class="chp-th">${T('ONUMenu.portal.colPower')}</th>
            <th class="chp-th">${T('ONUMenu.portal.colLeader')}</th>
            <th class="chp-th chp-right">${T('ONUMenu.portal.colPoints')}</th>
            <th class="chp-th">${T('ONUMenu.portal.colStanding')}</th>
          </tr></thead><tbody>${rows}</tbody></table></div>`;
    },

    seatsHTML() {
      const leader = (window.$gameParty && $gameParty.leader) ? $gameParty.leader() : null;
      const members = (window.$gameParty && $gameParty.members) ? $gameParty.members() : [];
      const rows = members.map(actor => {
        let post = null, open = [];
        try { post = postOf(actor); } catch (e) { post = null; }
        try { open = joinableFor(actor) || []; } catch (e) { open = []; }
        const seat = post
          ? (post.sg ? T('ONUMenu.role.secretaryGeneral')
            : (delegationByKey(post.key) || {}).name || '')
          : T('ONUMenu.portal.unseated');
        return `<tr>
          <td class="chp-td">${chEsc(actor.name())}</td>
          <td class="chp-td">${chEsc(seat)}</td>
          <td class="chp-td chp-note">${post ? T('ONUMenu.portal.alreadySeated')
            : (open.length ? open.map(d => chEsc(d.name)).join(', ') : T('ONUMenu.portal.wouldTakeNobody'))}</td>
        </tr>`;
      }).join('');
      return `<h2 class="chp-h">${T('ONUMenu.portal.tab.seats')}</h2>
        <div class="chp-note chp-mb">${T('ONUMenu.portal.seatsBlurb')}</div>
        <div class="chp-card chp-tight"><table class="chp-table">
          <thead><tr>
            <th class="chp-th">${T('ONUMenu.portal.colWho')}</th>
            <th class="chp-th">${T('ONUMenu.portal.colSeat')}</th>
            <th class="chp-th">${T('ONUMenu.portal.colWouldSeat')}</th>
          </tr></thead><tbody>${rows}</tbody></table></div>
        ${leader ? '' : `<div class="chp-note">${T('ONUMenu.portal.noParty')}</div>`}`;
    },

    businessHTML() {
      const rows = chamberMotions().map(motion => `<tr>
        <td class="chp-td">${chEsc(T('ONUAssembly.motion.' + motion.key + '.tag'))}</td>
        <td class="chp-td">${motion.grave
          ? `<b class="chp-bad">${T('ONUMenu.portal.grave')}</b>`
          : T('ONUMenu.portal.ordinary')}</td>
      </tr>`).join('');
      return `<h2 class="chp-h">${T('ONUMenu.portal.tab.business')}</h2>
        <div class="chp-note chp-mb">${T('ONUMenu.portal.businessBlurb')}</div>
        <div class="chp-card chp-tight"><table class="chp-table">
          <thead><tr>
            <th class="chp-th">${T('ONUMenu.portal.colMotion')}</th>
            <th class="chp-th">${T('ONUMenu.portal.colWeight')}</th>
          </tr></thead><tbody>${rows}</tbody></table></div>
        <div class="chp-note">${T('ONUMenu.portal.graveNote')}</div>`;
    },
  };

  if (window.HypernetOS && window.HypernetOS.registerApp) {
    window.HypernetOS.registerApp({
      id: ONU_APP_ID,
      name: T('ONUMenu.portal.appName'),
      icon: ONU_ICON,
      category: 'civic',
      launchFn: function () { window.ChamberPortal.launch(); },
      desktopShortcut: true,
    });
  }

  //===========================================================================
  // THE POLITICS MENU (Scene_Politics)
  //===========================================================================
  //
  // The main menu's Politics pocket: who governs the place the party stands
  // in, at every level at once. The shared spread of docs/task/ui_fixing.md
  // (shape A): the left page is the tab rail (Here, Nation, Hyperpower,
  // Elected) and the list that tab holds, the right page is the detail of the
  // row the cursor is on.
  //
  // Like the chamber above it, nothing here knows the rules: it reads
  // NPCPolitics.describePlace and NPCPolitics.electedOf and draws, and never
  // writes a line of the political state. Every name of a person opens their
  // Empathize panel; a government, a party or a bloc opens its article.
  //
  // It lives in this file because this file is already where the world's
  // politics are drawn. Every colour and measure is a class in css/theme.css.

  const PT = (key, params) => (typeof window.T === "function" ? window.T(key, params) : key);
  const PTAB_IDS = ["here", "nation", "power", "elected", "parties", "own"]; // i18n-ignore: tab ids, labels are Politics.menu.tab.*
  const politicsMemo = { tab: 0, index: 0 };

  const polNation = (n) => (window.WorldNames && window.WorldNames.nation ? window.WorldNames.nation(n) : n);
  const polPower = (n) => (window.WorldNames && window.WorldNames.power ? window.WorldNames.power(n) : n);
  const polLeader = (n) => (window.WorldNames && window.WorldNames.leader ? window.WorldNames.leader(n) : n);
  const polEuros = (gold) => (window.MoneyFormatter && window.MoneyFormatter.format)
    ? window.MoneyFormatter.format(gold) : String(Math.round((Number(gold) || 0) / 100));

  function polFact(label, value) {
    return `<div class="inspect-spec-row"><span class="inspect-spec-label">${esc(label)}</span>` +
      `<span class="inspect-spec-value">${value}</span></div>`;
  }
  function polSection(title, body) {
    return `<div class="ui-section"><div class="inspect-section-title">${esc(title)}</div>${body}</div>`;
  }
  function polEmpty(text) {
    return `<div class="ui-empty"><div class="ui-empty-text">${esc(text)}</div></div>`;
  }
  function polDetail(title, sub, body, actions) {
    return `<div class="ui-detail">
        <div class="ui-detail-head"><div class="ui-detail-titles">
          <h2>${esc(title)}</h2>${sub ? `<div class="ui-detail-sub">${esc(sub)}</div>` : ""}
        </div></div>
        <div class="ui-detail-scroll ui-scroll">${body}</div>
        ${actions ? `<div class="inspect-actions">${actions}</div>` : ""}
      </div>`;
  }
  // A meter of the realm (legitimacy, unrest...), drawn with the chamber's own
  // bar so the two screens read the same.
  function polMeter(label, value, axis) {
    return statBar(esc(label), Math.round(Number(value) || 0), 100, axis);
  }

  function polPartyOf(polityName, partyId) {
    if (!partyId || !window.NPCPolitics) return null;
    return window.NPCPolitics.getPartyOf(polityName, partyId) || null;
  }

  //---------------------------------------------------------------------------
  // The party's own political party, as both screens draw it
  //---------------------------------------------------------------------------
  // Scene_Politics (the Own party and Parties tabs) and the Propaganda2 program
  // below both found, edit and read the one party of the player's that
  // NPCPolitics keeps (THE PARTY'S OWN POLITICAL PARTY), so the words and the
  // draft rules live here once.

  const polCreedLabel = (id) => {
    const creed = window.NPCShared && window.NPCShared.ideologyById ? window.NPCShared.ideologyById(id) : null;
    return creed ? PT(creed.name) : PT("Politics.menu.val.chooseCreed");
  };
  const polTenetName = (id) => PT("Politics.tenet." + id + ".name");
  const polTenetDesc = (id) => PT("Politics.tenet." + id + ".desc");
  const polFeeClassLabel = (fee) => PT("Politics.menu.feeClass." + window.NPCPolitics.feeClass(fee));
  const polFeeLabel = (fee) => PT("Politics.menu.val.feeWeekly", { fee: polEuros(fee) });

  function polScopeLabel(scope) {
    if (!scope || scope.kind === "world" || !scope.value) return PT("Politics.menu.scope.world"); // i18n-ignore: scope id
    const opt = (window.NPCPolitics.scopeOptions(scope.kind) || []).find(o => o.value === scope.value);
    const label = opt ? opt.label : scope.value;
    const named = scope.kind === "nation" ? polNation(label) : scope.kind === "power" ? polPower(label) : label; // i18n-ignore: scope ids
    return PT("Politics.menu.scope." + scope.kind + "Of", { name: named });
  }

  // A fresh founding sheet: the faction's name when the party already flies a
  // banner, a rolled one otherwise.
  function polNewDraft() {
    const P = window.NPCPolitics;
    const banner = window.$gameFactions && $gameFactions.playerFaction ? $gameFactions.playerFaction() : null;
    return {
      founding: true,
      name: banner ? banner.name : P.rollPlayerPartyName(),
      ideologyId: null,
      tenets: [],
      fee: P.DEFAULT_PLAYER_FEE,
    };
  }

  function polEditDraft(party) {
    return { founding: false, name: party.name, ideologyId: party.ideologyId, tenets: party.tenets.slice(), fee: party.fee };
  }

  // Take up or drop a tenet. Taking one up drops any it clashes with; answers
  // false when the sheet already holds as many as a party may.
  function polToggleTenet(draft, id) {
    const P = window.NPCPolitics;
    if (draft.tenets.includes(id)) {
      draft.tenets = draft.tenets.filter(t => t !== id);
      return true;
    }
    const kept = draft.tenets.filter(t => !P.tenetsClash(t, id));
    if (kept.length >= P.MAX_PLAYER_TENETS) return false;
    draft.tenets = kept.concat([id]);
    return true;
  }

  // The fee a player typed, in euros, read back into gold.
  function polParseFee(text) {
    const n = parseFloat(String(text == null ? "" : text).replace(",", ".").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }

  // Found or save the sheet. Answers { ok, key, params } for the toast.
  function polCommitDraft(draft) {
    const P = window.NPCPolitics;
    if (!draft.ideologyId) return { ok: false, key: "Politics.menu.msg.needCreed" };
    if (draft.founding) {
      const party = P.foundPlayerParty(draft);
      if (!party) return { ok: false, key: "Politics.menu.msg.alreadyFounded" };
      return { ok: true, key: "Politics.menu.msg.founded", params: { party: party.name, n: party.members.length } };
    }
    if (!P.editPlayerParty(draft)) return { ok: false, key: "Politics.menu.msg.noParty" };
    return { ok: true, key: "Politics.menu.msg.saved", params: { party: P.playerParty().name } };
  }

  function polToast(key, params, severity) {
    const text = PT(key, params);
    if (window.ParchmentToast && window.ParchmentToast.show) window.ParchmentToast.show(text, severity ? { severity } : {});
  }

  // The platform as the policies it would enact, for either screen.
  function polPlatformRows(platform) {
    const rows = window.NPCPolitics.policiesFor ? window.NPCPolitics.policiesFor(platform) : [];
    return rows.filter(r => r.policy).map(r => ({ label: r.fieldName, value: r.policy.name }));
  }

  // The engine's menu base is not there in a bare node harness: the scene is
  // only defined where it can be pushed.
  if (typeof Scene_MenuBase === "function") {
  class Scene_Politics extends Scene_MenuBase {
    create() {
      super.create();
      const P = window.NPCPolitics;
      this._place = P && P.describePlace ? P.describePlace() : null;
      this._tab = Math.max(0, Math.min(PTAB_IDS.length - 1, politicsMemo.tab || 0));
      this._index = Math.max(0, politicsMemo.index || 0);
      this._rows = [];
      this._partyScope = { kind: "world" }; // i18n-ignore: scope id
      this._picker = null;
      this._draft = null;
      this._draftIndex = 0;
      this._draftPicker = null;
      this._draftModal = null;
      this._ask = null;
      this._bar = window.MenuSearchBar ? window.MenuSearchBar.create({
        id: "politics", // i18n-ignore: search strip id
        placeholder: PT("Politics.menu.searchPlaceholder"),
        sorts: ["name"],
        onChange: () => {
          this._index = 0;
          this.refreshPolitics();
          if (this._bar) this._bar.restoreFocus();
        },
      }) : null;
      this.buildPoliticsDOM();
    }

    update() {
      super.update();
      // A typed name or fee has the keys while its panel or the pad's letter
      // sheet is up.
      if (this._ask) return;
      if (window.Controller && Controller.textEntryOpen && Controller.textEntryOpen()) return;
      // The founding sheet is a modal: while it is up the spread under it
      // takes no keys.
      if (this._draft) { this.updateDraftInput(); return; }
      if (!(window.MenuSearchBar && window.MenuSearchBar.isTyping())) this.updatePoliticsInput();
    }

    terminate() {
      politicsMemo.tab = this._tab;
      politicsMemo.index = this._index;
      if (this._bar) { this._bar.dispose(); this._bar = null; }
      this.closePoliticsAsk();
      this.closePoliticsDraft();
      if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root);
      this._root = null;
      super.terminate();
    }

    buildPoliticsDOM() {
      const root = document.createElement("div");
      root.id = "menu-container";
      root.classList.add("politics-scene");
      root.innerHTML = `
        <div class="book-spread">
          <div class="left-page pol-page">
            <div class="page-header-bar">
              <div class="back-button focusable" data-pol-act="back">${esc(PT("Politics.menu.back"))}</div>
              <h2 class="title">${esc(PT("Politics.menu.title"))}</h2>
            </div>
            <div class="pol-place" id="pol-place"></div>
            <div class="backpack-tabs" id="pol-tabs"></div>
            <div id="pol-search-slot"></div>
            <div class="ui-list ui-scroll pol-list" id="pol-list"></div>
          </div>
          <div class="right-page pol-page" id="pol-detail"></div>
        </div>`;
      document.body.appendChild(root);
      this._root = root;
      // One listener for the whole spread: every control says what it is in
      // a data attribute, and the same three methods the keys call answer it.
      root.addEventListener("click", (e) => this.onPoliticsClick(e));
      root.addEventListener("wheel", (e) => {
        const box = e.target.closest("#pol-list, .ui-detail-scroll");
        if (box) box.scrollTop += e.deltaY;
        e.stopPropagation();
        e.preventDefault();
      }, { passive: false });
      this.refreshPolitics();
    }

    onPoliticsClick(e) {
      const tab = e.target.closest("[data-pol-tab]");
      if (tab) { this.setPoliticsTab(Number(tab.getAttribute("data-pol-tab"))); return; }
      const row = e.target.closest("[data-pol-row]");
      if (row) { this.selectPoliticsRow(Number(row.getAttribute("data-pol-row"))); return; }
      const act = e.target.closest("[data-pol-act]");
      if (!act) return;
      const what = act.getAttribute("data-pol-act");
      if (what === "back") this.closePolitics(); // i18n-ignore: action id
      else if (what === "found") this.openPoliticsDraft(polNewDraft()); // i18n-ignore: action id
      else if (what === "edit") this.editOwnParty(); // i18n-ignore: action id
      else this.activatePoliticsRow();
    }

    // ---- what each tab lists ----------------------------------------------

    politicsRows() {
      const place = this._place;
      const id = PTAB_IDS[this._tab];
      if (this._picker) return this.pickerRows();
      if (id === "parties") return this.partiesRows(); // i18n-ignore: tab id
      if (id === "own") return this.ownRows(); // i18n-ignore: tab id
      if (!place || !place.live) return [{ kind: "none", text: PT("Politics.menu.empty.noPolitics") }];
      if (id === "here") { // i18n-ignore: tab id
        const rows = [{ kind: "townHall", name: PT("Politics.menu.row.townHall") }];
        const holders = window.NPCPolitics.electedOf(place).filter(r => r.level === "local"); // i18n-ignore: level id
        for (const h of holders) rows.push({ kind: "person", name: h.name, sub: h.office, person: h });
        return rows;
      }
      if (id === "nation" || id === "power") { // i18n-ignore: tab ids
        const polity = id === "nation" ? place.nation : place.power; // i18n-ignore: tab id
        if (!polity) return [{ kind: "none", text: this.noPolityText(id) }];
        const rows = [{ kind: "government", name: PT("Politics.menu.row.government"), polity }];
        const parties = (polity.parties || []).filter(p => (p.seats || 0) > 0 || p.id === polity.rulingPartyId)
          .sort((a, b) => (b.seats || 0) - (a.seats || 0) || String(a.name).localeCompare(String(b.name)));
        for (const party of parties) {
          rows.push({ kind: "party", name: party.name, polity, party,
            sub: PT("Politics.menu.val.partyShare", { share: party.lastShare || 0, seats: party.seats || 0 }) });
        }
        rows.push({ kind: "elections", name: PT("Politics.menu.row.elections"), polity });
        if (id === "power") rows.push({ kind: "members", name: PT("Politics.menu.row.members"), polity }); // i18n-ignore: tab id
        return rows;
      }
      const all = window.NPCPolitics.electedOf(place).map(h => ({
        kind: "person", name: h.name, sub: h.office, person: h,
        badge: PT("Politics.menu.level." + h.level),
      }));
      if (!all.length) return [{ kind: "none", text: PT("Politics.menu.empty.noElected") }];
      if (!this._bar) return all;
      return this._bar.apply(all, (row) => ({ name: polLeader(row.name) + " " + row.sub }));
    }

    // ---- the picker: a list that stands in for the tab's own ------------------

    openPoliticsPicker(title, options, onPick) {
      this._picker = { title, options, onPick, returnIndex: this._index };
      this._index = 0;
      if (this._bar) this._bar.query = "";
      SoundManager.playOk();
      this.refreshPolitics();
    }

    closePoliticsPicker() {
      if (!this._picker) return;
      this._index = this._picker.returnIndex || 0;
      this._picker = null;
      if (this._bar) this._bar.query = "";
    }

    pickerRows() {
      const rows = this._picker.options.map(o => ({ kind: "pick", name: o.name, sub: o.sub || "", option: o }));
      const shown = this._bar ? this._bar.apply(rows, (row) => ({ name: row.name + " " + row.sub })) : rows;
      return shown.length ? shown : [{ kind: "none", text: PT("Politics.menu.empty.noMatch") }];
    }

    // ---- Parties: every party in the world, narrowed to a place ---------------

    partiesRows() {
      const P = window.NPCPolitics;
      const rows = [{ kind: "filter", name: PT("Politics.menu.row.filter"), sub: polScopeLabel(this._partyScope) }];
      const all = (P && P.partiesIn ? P.partiesIn(this._partyScope) : []).map(entry => ({
        kind: "anyParty", name: entry.party.name, entry,
        sub: PT("Politics.menu.val.supporters", { n: entry.supporters }),
        badge: entry.isPlayer ? PT("Politics.menu.val.yours")
          : (entry.polityKind === "nation" ? polNation(entry.polityName) : polPower(entry.polityName)), // i18n-ignore: polity kind
      }));
      const shown = this._bar ? this._bar.apply(all, (row) => ({ name: row.name + " " + row.badge })) : all;
      if (!shown.length) rows.push({ kind: "none", text: PT("Politics.menu.empty.noPartiesFound") });
      return rows.concat(shown);
    }

    // Filter: first the kind of place, then which one.
    openPartyFilter() {
      const P = window.NPCPolitics;
      const kinds = P.SCOPE_KINDS.map(kind => ({ name: PT("Politics.menu.scope." + kind), value: kind }));
      this.openPoliticsPicker(PT("Politics.menu.row.filter"), kinds, (kind) => {
        if (kind === "world") { this._partyScope = { kind }; return; } // i18n-ignore: scope id
        const options = P.scopeOptions(kind).map(o => ({
          name: kind === "nation" ? polNation(o.label) : kind === "power" ? polPower(o.label) : o.label, // i18n-ignore: scope ids
          value: o.value,
        }));
        this.openPoliticsPicker(PT("Politics.menu.scope." + kind), options, (value) => {
          this._partyScope = { kind, value };
        });
      });
    }

    anyPartyHTML(entry) {
      const party = entry.party;
      if (entry.isPlayer) return this.ownPartyHTML();
      const polity = window.NPCPolitics.getPolity(entry.polityName);
      const leader = polity ? (polity.politicians || {})[party.leaderId] : null;
      const polityLabel = entry.polityKind === "nation" ? polNation(entry.polityName) : polPower(entry.polityName); // i18n-ignore: polity kind
      let body = `<div class="inspect-spec-grid">
          ${polFact(PT("Politics.menu.lbl.polity"), esc(polityLabel))}
          ${polFact(PT("Politics.menu.lbl.supporters"), esc(entry.supporters))}
          ${polFact(PT("Politics.menu.lbl.leader"), esc(leader ? polLeader(leader.name) : PT("Politics.menu.val.vacant")))}
          ${polFact(PT("Politics.menu.lbl.seats"), esc(party.seats || 0))}
          ${polFact(PT("Politics.menu.lbl.share"), esc(party.lastShare || 0) + "%")}
          ${party.ideologyId ? polFact(PT("Politics.menu.lbl.ideology"), esc(polCreedLabel(party.ideologyId))) : ""}
          ${party.foundedYear != null ? polFact(PT("Politics.menu.lbl.founded"), esc(party.foundedYear)) : ""}
        </div>`;
      body += this.platformSectionHTML(party.platform);
      const action = `<div class="inspect-btn focusable" data-pol-act="open" data-pad="confirm">${esc(PT("Politics.menu.lbl.party"))}</div>`;
      return polDetail(party.name, polityLabel, body, action);
    }

    platformSectionHTML(platform) {
      const rows = polPlatformRows(platform);
      if (!rows.length) return "";
      return polSection(PT("Politics.menu.sec.platform"),
        `<div class="inspect-spec-grid">${rows.map(r => polFact(r.label, esc(r.value))).join("")}</div>`);
    }

    // ---- Own party: the founding sheet, then the party itself -----------------

    ownRows() {
      const P = window.NPCPolitics;
      if (!P || !P.foundPlayerParty) return [{ kind: "none", text: PT("Politics.menu.empty.noPolitics") }];
      const party = P.playerParty();
      if (!party) return [{ kind: "ownFound", name: PT("Politics.menu.row.found") }];
      const rows = [
        { kind: "ownParty", name: party.name, sub: polCreedLabel(party.ideologyId) },
        { kind: "ownEdit", name: PT("Politics.menu.row.edit") },
        { kind: "ownSupporters", name: PT("Politics.menu.lbl.supporters"), sub: String(P.playerSupporters().length) },
      ];
      for (const name of party.members) rows.push({ kind: "ownMember", name, sub: PT("Politics.menu.val.member") });
      return rows;
    }

    // The Own party tab before there is a party: one row, and the button
    // that raises the founding sheet over the spread.
    ownFoundHTML() {
      const body = `<div class="ui-empty-note">${esc(PT("Politics.menu.msg.noParty"))}</div>` +
        `<div class="ui-empty-note">${esc(PT("Politics.menu.hint.found"))}</div>`;
      const action = `<div class="inspect-btn focusable" data-pol-act="found" data-pad="confirm">${esc(PT("Politics.menu.row.found"))}</div>`;
      return polDetail(PT("Politics.menu.sec.founding"), "", body, action);
    }

    ownPartyHTML() {
      const P = window.NPCPolitics;
      const party = P.playerParty();
      if (!party) return polEmpty(PT("Politics.menu.msg.noParty"));
      const supporters = P.playerSupporters().length;
      const campaigns = P.listCampaigns().filter(c => !c.done).length;
      const last = party.lastIncome;
      let body = `<div class="inspect-spec-grid">
          ${polFact(PT("Politics.menu.lbl.ideology"), esc(polCreedLabel(party.ideologyId)))}
          ${polFact(PT("Politics.menu.lbl.tenets"), esc(party.tenets.length ? party.tenets.map(polTenetName).join(", ") : PT("Politics.menu.val.none")))}
          ${polFact(PT("Politics.menu.lbl.founded"), esc(party.founded || party.foundedYear))}
          ${polFact(PT("Politics.menu.lbl.fee"), esc(polFeeLabel(party.fee)))}
          ${polFact(PT("Politics.menu.lbl.attracts"), esc(polFeeClassLabel(party.fee)))}
          ${polFact(PT("Politics.menu.lbl.supporters"), esc(supporters))}
          ${polFact(PT("Politics.menu.lbl.takings"), esc(polEuros(P.weeklyTakings())))}
          ${polFact(PT("Politics.menu.lbl.lastPayout"), esc(last ? PT("Politics.menu.val.payout", { gold: polEuros(last.gold), weeks: last.weeks, date: last.date }) : PT("Politics.menu.val.none")))}
          ${polFact(PT("Politics.menu.lbl.totalEarned"), esc(polEuros(party.totalIncome || 0)))}
          ${polFact(PT("Politics.menu.lbl.campaigns"), esc(campaigns))}
        </div>`;
      body += polSection(PT("Politics.menu.sec.partyMembers"), party.members.length
        ? `<div class="ui-chip-row">${party.members.map(n => `<span class="ui-chip">${esc(n)}</span>`).join("")}</div>`
        : `<div class="ui-empty-note">${esc(PT("Politics.menu.val.none"))}</div>`);
      body += this.platformSectionHTML(party.platform);
      body += `<div class="ui-empty-note">${esc(PT("Politics.menu.hint.propaganda"))}</div>`;
      const action = `<div class="inspect-btn focusable" data-pol-act="edit" data-pad="confirm">${esc(PT("Politics.menu.row.edit"))}</div>`;
      return polDetail(party.name, PT("Politics.menu.val.yours"), body, action);
    }

    editOwnParty() {
      const party = window.NPCPolitics && window.NPCPolitics.playerParty();
      if (!party) { SoundManager.playBuzzer(); return; }
      this.openPoliticsDraft(polEditDraft(party));
    }

    commitPoliticsDraft() {
      if (!this._draft) { SoundManager.playBuzzer(); return; }
      const result = polCommitDraft(this._draft);
      if (!result.ok) {
        SoundManager.playBuzzer();
        polToast(result.key, result.params, "warning"); // i18n-ignore: toast severity
        return;
      }
      SoundManager.playOk();
      polToast(result.key, result.params);
      this.closePoliticsDraft();
      this._index = 0;
      this.refreshPolitics();
    }

    // ---- the founding sheet: a modal over the spread ---------------------------
    // Found or edit, the sheet is one panel in the middle of the screen: the
    // name, the creed, the fee and the tenets on the left, what they add up
    // to on the right, Found and Cancel under both. The creed picker takes the
    // panel's list while it is open; Cancel backs out of it, then the sheet.

    openPoliticsDraft(draft) {
      if (!window.NPCPolitics) { SoundManager.playBuzzer(); return; }
      this.closePoliticsDraft();
      this._draft = draft;
      this._draftIndex = 0;
      this._draftPicker = null;
      const modal = document.createElement("div");
      modal.className = "ui-overlay pol-draft-modal";
      modal.innerHTML = `
        <div class="ui-panel pol-draft-box">
          <div class="pol-draft-head">
            <h3 class="title" id="pol-draft-title"></h3>
            <div class="pol-draft-sub" id="pol-draft-sub"></div>
          </div>
          <div class="pol-draft-body">
            <div class="ui-list ui-scroll pol-list pol-draft-list" id="pol-draft-list"></div>
            <div class="ui-scroll pol-draft-detail" id="pol-draft-detail"></div>
          </div>
          <div class="inspect-actions ui-panel-actions">
            <div class="inspect-btn focusable" data-pol-dact="commit" id="pol-draft-commit"></div>
            <div class="inspect-btn focusable" data-pol-dact="cancel">${esc(PT("Politics.menu.row.cancel"))}</div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => this.onDraftClick(e));
      modal.addEventListener("wheel", (e) => {
        const box = e.target.closest(".pol-draft-list, .pol-draft-detail");
        if (box) box.scrollTop += e.deltaY;
        e.stopPropagation();
        e.preventDefault();
      }, { passive: false });
      this._draftModal = modal;
      SoundManager.playOk();
      this.refreshPolitics();
    }

    closePoliticsDraft() {
      const modal = this._draftModal;
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      this._draftModal = null;
      this._draft = null;
      this._draftPicker = null;
      this._draftIndex = 0;
    }

    cancelPoliticsDraft() {
      SoundManager.playCancel();
      if (this._draftPicker) {
        this._draftIndex = this._draftPicker.returnIndex || 0;
        this._draftPicker = null;
      } else {
        this.closePoliticsDraft();
      }
      this.refreshPolitics();
    }

    draftRows() {
      const P = window.NPCPolitics;
      if (this._draftPicker) {
        return this._draftPicker.options.map(o => ({ kind: "pick", name: o.name, sub: o.sub || "", option: o }));
      }
      const d = this._draft;
      const rows = [
        { kind: "draftName", name: PT("Politics.menu.lbl.name"), sub: d.name },
        { kind: "draftCreed", name: PT("Politics.menu.lbl.ideology"), sub: d.ideologyId ? polCreedLabel(d.ideologyId) : PT("Politics.menu.val.chooseCreed") },
        { kind: "draftFee", name: PT("Politics.menu.lbl.fee"), sub: polFeeLabel(d.fee) + " · " + polFeeClassLabel(d.fee) },
      ];
      for (const t of P.PLAYER_TENETS) {
        rows.push({ kind: "tenet", id: t.id, name: polTenetName(t.id),
          sub: PT("Politics.menu.lbl.tenet"), badge: d.tenets.includes(t.id) ? PT("Politics.menu.val.held") : "" });
      }
      rows.push({ kind: "draftConfirm", name: PT(d.founding ? "Politics.menu.row.found" : "Politics.menu.row.save") });
      return rows;
    }

    refreshPoliticsDraft() {
      const modal = this._draftModal;
      const d = this._draft;
      if (!modal || !d) return;
      this._draftRows = this.draftRows();
      if (this._draftIndex >= this._draftRows.length) this._draftIndex = Math.max(0, this._draftRows.length - 1);
      const row = this._draftRows[this._draftIndex];
      modal.querySelector("#pol-draft-title").textContent = PT(d.founding ? "Politics.menu.sec.founding" : "Politics.menu.sec.editing");
      modal.querySelector("#pol-draft-sub").textContent = this._draftPicker ? this._draftPicker.title : d.name;
      modal.querySelector("#pol-draft-commit").textContent = PT(d.founding ? "Politics.menu.row.found" : "Politics.menu.row.save");
      const list = modal.querySelector("#pol-draft-list");
      list.innerHTML = this._draftRows.map((r, i) => this.politicsRowHTML(r, i, this._draftIndex, "data-pol-drow")).join("");
      const sel = list.querySelector(".pol-row.selected");
      if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
      const detail = modal.querySelector("#pol-draft-detail");
      detail.innerHTML = this.draftDetailHTML(row);
      paintMeasures(detail);
    }

    // What the sheet adds up to, with a word on the row under the cursor.
    draftDetailHTML(row) {
      const P = window.NPCPolitics;
      if (row && row.kind === "pick") {
        return row.option.detail ? row.option.detail() : `<div class="ui-empty-note">${esc(PT("Politics.menu.hint.pick"))}</div>`;
      }
      const d = this._draft;
      let focus = "";
      if (!row) focus = "";
      else if (row.kind === "tenet") focus = polTenetDesc(row.id);
      else if (row.kind === "draftFee") focus = PT("Politics.menu.hint.fee");
      else if (row.kind === "draftCreed") focus = PT("Politics.menu.hint.creed");
      else if (row.kind === "draftConfirm") focus = PT(d.founding ? "Politics.menu.hint.found" : "Politics.menu.hint.save");
      else focus = PT("Politics.menu.hint.tenets", { n: P.MAX_PLAYER_TENETS });
      let body = focus ? `<div class="ui-empty-note">${esc(focus)}</div>` : "";
      body += `<div class="inspect-spec-grid">
          ${polFact(PT("Politics.menu.lbl.name"), esc(d.name))}
          ${polFact(PT("Politics.menu.lbl.ideology"), esc(d.ideologyId ? polCreedLabel(d.ideologyId) : PT("Politics.menu.val.chooseCreed")))}
          ${polFact(PT("Politics.menu.lbl.tenets"), esc(d.tenets.length ? d.tenets.map(polTenetName).join(", ") : PT("Politics.menu.val.none")))}
          ${polFact(PT("Politics.menu.lbl.fee"), esc(polFeeLabel(d.fee)))}
          ${polFact(PT("Politics.menu.lbl.attracts"), esc(polFeeClassLabel(d.fee)))}
          ${!d.founding ? polFact(PT("Politics.menu.lbl.takings"), esc(polEuros(P.weeklyTakings(d.fee)))) : ""}
        </div>`;
      if (d.ideologyId) body += this.platformSectionHTML(P.playerPartyPlatform(d.ideologyId, d.tenets));
      return body;
    }

    onDraftClick(e) {
      const row = e.target.closest("[data-pol-drow]");
      if (row) {
        const i = Number(row.getAttribute("data-pol-drow"));
        if (i === this._draftIndex) { this.activateDraftRow(); return; }
        this._draftIndex = i;
        SoundManager.playCursor();
        this.refreshPolitics();
        return;
      }
      const act = e.target.closest("[data-pol-dact]");
      if (!act) return;
      if (act.getAttribute("data-pol-dact") === "commit") this.commitPoliticsDraft(); // i18n-ignore: action id
      else this.cancelPoliticsDraft();
    }

    activateDraftRow() {
      const P = window.NPCPolitics;
      const d = this._draft;
      const row = (this._draftRows || [])[this._draftIndex];
      if (!row || !d) { SoundManager.playBuzzer(); return; }
      switch (row.kind) {
        case "pick": {
          const picker = this._draftPicker;
          SoundManager.playOk();
          this._draftIndex = picker.returnIndex || 0;
          this._draftPicker = null;
          picker.onPick(row.option.value);
          this.refreshPolitics();
          return;
        }
        case "draftName":
          this.askPolitics(PT("Politics.menu.lbl.name"), d.name, (v) => { if (v.trim()) d.name = v.trim().slice(0, 48); });
          return;
        case "draftFee":
          this.askPolitics(PT("Politics.menu.hint.feeEntry"), String((d.fee || 0) / 100), (v) => {
            const gold = polParseFee(v);
            if (gold != null) d.fee = Math.max(0, Math.min(P.MAX_PLAYER_FEE, gold));
          });
          return;
        case "draftCreed": {
          const creeds = P.foundableCreeds().map(c => ({
            name: PT(c.name), value: c.id,
            detail: () => this.platformSectionHTML(P.playerPartyPlatform(c.id, [])) || polEmpty(PT("Politics.menu.hint.pick")),
          })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
          const current = creeds.findIndex(c => c.value === d.ideologyId);
          this._draftPicker = { title: PT("Politics.menu.lbl.ideology"), options: creeds,
            onPick: (id) => { d.ideologyId = id; }, returnIndex: this._draftIndex };
          this._draftIndex = Math.max(0, current);
          SoundManager.playOk();
          this.refreshPolitics();
          return;
        }
        case "tenet":
          if (!polToggleTenet(d, row.id)) {
            SoundManager.playBuzzer();
            polToast("Politics.menu.msg.tooManyTenets", { n: P.MAX_PLAYER_TENETS }, "warning"); // i18n-ignore: toast severity
            return;
          }
          SoundManager.playCursor();
          this.refreshPolitics();
          return;
        case "draftConfirm": this.commitPoliticsDraft(); return;
        default: SoundManager.playBuzzer();
      }
    }

    updateDraftInput() {
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) { this.cancelPoliticsDraft(); return; }
      const rows = this._draftRows || [];
      if (Input.isRepeated("down") && this._draftIndex < rows.length - 1) {
        this._draftIndex++;
        SoundManager.playCursor();
        this.refreshPolitics();
        return;
      }
      if (Input.isRepeated("up") && this._draftIndex > 0) {
        this._draftIndex--;
        SoundManager.playCursor();
        this.refreshPolitics();
        return;
      }
      if (Input.isTriggered("ok")) this.activateDraftRow();
    }

    // A line of text from the player: the pad's letter sheet, or a small panel
    // with a field for a keyboard.
    askPolitics(title, value, onCommit) {
      const pad = typeof Input.lastInputDevice === "function" && Input.lastInputDevice() === "pad";
      if (pad && window.Controller && typeof Controller.textEntry === "function") {
        Controller.textEntry({ title, value, max: 48, onCommit: (v) => { onCommit(String(v || "")); this.refreshPolitics(); } });
        return;
      }
      const panel = document.createElement("div");
      panel.className = "ui-overlay";
      panel.innerHTML = `
        <div class="ui-panel">
          <h3 class="title">${esc(title)}</h3>
          <input class="ui-input" type="text" maxlength="48" aria-label="${escAttr(title)}">
          <div class="inspect-actions ui-panel-actions">
            <div class="inspect-btn focusable" data-pol-ask="ok">${esc(PT("Politics.menu.row.confirm"))}</div>
          </div>
          <div class="ui-panel-dismiss focusable" data-pol-ask="cancel">${esc(PT("Politics.menu.row.cancel"))}</div>
        </div>`;
      document.body.appendChild(panel);
      const field = panel.querySelector("input");
      field.value = value;
      const done = (ok) => {
        const typed = field.value;
        this.closePoliticsAsk();
        if (ok) { SoundManager.playOk(); onCommit(typed); } else SoundManager.playCancel();
        this.refreshPolitics();
      };
      field.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(true);
        else if (e.key === "Escape") done(false);
      });
      field.addEventListener("keyup", (e) => e.stopPropagation());
      field.addEventListener("keypress", (e) => e.stopPropagation());
      panel.addEventListener("click", (e) => {
        const hit = e.target.closest("[data-pol-ask]");
        if (hit) done(hit.getAttribute("data-pol-ask") === "ok");
      });
      this._ask = { panel, done };
      if (field.focus) { field.focus(); if (field.select) field.select(); }
    }

    closePoliticsAsk() {
      if (!this._ask) return;
      const panel = this._ask.panel;
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      this._ask = null;
    }

    noPolityText(id) {
      const place = this._place;
      if (id === "nation") { // i18n-ignore: tab id
        return place.country
          ? PT("Politics.menu.empty.noNation", { country: polNation(place.country) })
          : PT("Politics.menu.empty.noCountry");
      }
      return PT("Politics.menu.empty.noPower");
    }

    // ---- drawing -------------------------------------------------------------

    refreshPolitics() {
      if (!this._root) return;
      const place = this._place;
      const placeEl = this._root.querySelector("#pol-place");
      if (placeEl) {
        const where = [place && place.groupLabel, place && place.country && polNation(place.country)]
          .filter((v, i, a) => v && a.indexOf(v) === i).join(", ");
        placeEl.textContent = where || PT("Politics.menu.empty.noPlace");
      }
      const tabs = this._root.querySelector("#pol-tabs");
      if (tabs) {
        tabs.innerHTML = PTAB_IDS.map((id, i) =>
          `<div class="backpack-tab focusable${i === this._tab ? " active" : ""}" data-pol-tab="${i}">` +
          `${esc(PT("Politics.menu.tab." + id))}</div>`).join("");
      }
      // The strip filters the Elected list, the only one long enough to search.
      const slot = this._root.querySelector("#pol-search-slot");
      if (slot) {
        const searchable = this._picker || ["elected", "parties"].includes(PTAB_IDS[this._tab]); // i18n-ignore: tab ids
        slot.innerHTML = (this._bar && searchable) ? this._bar.html() : "";
      }
      this._rows = this.politicsRows();
      if (this._index >= this._rows.length) this._index = Math.max(0, this._rows.length - 1);
      const list = this._root.querySelector("#pol-list");
      if (list) {
        list.innerHTML = this._rows.map((row, i) => this.politicsRowHTML(row, i)).join("");
        const sel = list.querySelector(".pol-row.selected");
        if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
      }
      const detail = this._root.querySelector("#pol-detail");
      if (detail) {
        detail.innerHTML = this.politicsDetailHTML(this._rows[this._index]);
        paintMeasures(detail);
      }
      this.refreshPoliticsDraft();
    }

    politicsRowHTML(row, i, selected = this._index, attr = "data-pol-row") {
      if (row.kind === "none") return polEmpty(row.text);
      const sel = i === selected ? " selected" : "";
      const name = row.kind === "person" ? polLeader(row.name) : row.name;
      return `<div class="pol-row focusable${sel}" ${attr}="${i}">
          <span class="pol-row-main">
            <span class="pol-row-name">${esc(name)}</span>
            ${row.sub ? `<span class="pol-row-sub">${esc(row.sub)}</span>` : ""}
          </span>
          ${row.badge ? `<span class="pol-row-badge">${esc(row.badge)}</span>` : ""}
        </div>`;
    }

    politicsDetailHTML(row) {
      if (!row) return polEmpty(PT("Politics.menu.empty.noSelection"));
      if (row.kind === "none") return polEmpty(row.text);
      if (row.kind === "townHall") return this.townHallHTML();
      if (row.kind === "person") return this.personHTML(row.person);
      if (row.kind === "government") return this.governmentHTML(row.polity);
      if (row.kind === "party") return this.partyHTML(row.polity, row.party);
      if (row.kind === "elections") return this.electionsHTML(row.polity);
      if (row.kind === "members") return this.membersHTML(row.polity);
      if (row.kind === "pick") {
        return polDetail(this._picker.title, row.name,
          row.option.detail ? row.option.detail() : `<div class="ui-empty-note">${esc(PT("Politics.menu.hint.pick"))}</div>`);
      }
      if (row.kind === "filter") {
        return polDetail(PT("Politics.menu.row.filter"), polScopeLabel(this._partyScope),
          `<div class="ui-empty-note">${esc(PT("Politics.menu.hint.filter"))}</div>`,
          `<div class="inspect-btn focusable" data-pol-act="open" data-pad="confirm">${esc(PT("Politics.menu.row.filter"))}</div>`);
      }
      if (row.kind === "anyParty") return this.anyPartyHTML(row.entry);
      if (row.kind === "ownFound") return this.ownFoundHTML();
      if (["ownParty", "ownEdit", "ownSupporters", "ownMember"].includes(row.kind)) return this.ownPartyHTML(); // i18n-ignore: row kinds
      return polEmpty(PT("Politics.menu.empty.noSelection"));
    }

    townHallHTML() {
      const P = window.NPCPolitics;
      const place = this._place;
      const s = place.settlement;
      const title = place.groupLabel || (place.country ? polNation(place.country) : PT("Politics.menu.row.townHall"));
      if (!s) {
        return polDetail(title, PT("Politics.menu.row.townHall"), polEmpty(PT("Politics.menu.empty.noLocal")));
      }
      let body = `<div class="inspect-spec-grid">
          ${place.country ? polFact(PT("Politics.menu.lbl.country"), esc(polNation(place.country))) : ""}
          ${place.powerName ? polFact(PT("Politics.menu.lbl.power"), esc(polPower(place.powerName))) : ""}
          ${polFact(PT("Politics.menu.lbl.nextLocalElection"),
            esc(s.nextLocalElectionMinute != null ? P.dateOf(s.nextLocalElectionMinute) : PT("Politics.menu.val.notScheduled")))}
        </div>`;
      const offices = Object.keys(s.offices || {}).map(office =>
        polFact(P.officeLabel(office), esc(s.offices[office] ? polLeader(s.offices[office]) : PT("Politics.menu.val.vacant")))).join("");
      body += polSection(PT("Politics.menu.sec.offices"), `<div class="inspect-spec-grid">${offices}</div>`);
      const past = (s.history || []).slice(0, 6);
      body += polSection(PT("Politics.menu.sec.history"), past.length
        ? `<div class="ui-succession">${past.map(h =>
            `<div class="ui-succession-row"><span class="ui-succession-name">${esc(polLeader(h.mayor))}</span>` +
            `<span class="ui-succession-years">${esc(h.date)} · ${esc(PT("Politics.menu.lbl.votes"))} ${esc(h.votes)}</span></div>`).join("")}</div>`
        : `<div class="ui-empty-note">${esc(PT("Politics.menu.empty.noElections"))}</div>`);
      return polDetail(title, PT("Politics.menu.row.townHall"), body);
    }

    personHTML(h) {
      const P = window.NPCPolitics;
      const place = this._place;
      const polity = h.level === "nation" ? place.nation : (h.level === "power" ? place.power : null); // i18n-ignore: level ids
      let party = null;
      if (polity) party = polPartyOf(polity.name, h.partyId);
      else {
        const identity = P.getIdentity ? P.getIdentity(h.name) : null;
        if (identity && identity.partyId) party = polPartyOf(identity.power, identity.partyId);
      }
      const pol = polity && h.polId ? (polity.politicians || {})[h.polId] : null;
      const polityLabel = h.level === "local" ? (place.groupLabel || h.polity) // i18n-ignore: level id
        : h.level === "nation" ? polNation(h.polity) : polPower(h.polity); // i18n-ignore: level id
      const standing = h.main ? PT("Politics.menu.val.mainPlayer")
        : h.level === "local" ? PT("Politics.menu.val.townsperson") // i18n-ignore: level id
          : h.person ? PT("Politics.menu.val.livesIn", { place: this.homeOf(h.name) || polityLabel })
            : PT("Politics.menu.val.recordOnly");
      const body = `<div class="inspect-spec-grid">
          ${polFact(PT("Politics.menu.lbl.office"), esc(h.office))}
          ${polFact(PT("Politics.menu.lbl.level"), esc(PT("Politics.menu.level." + h.level)))}
          ${polFact(PT("Politics.menu.lbl.polity"), esc(polityLabel))}
          ${polFact(PT("Politics.menu.lbl.party"), esc(party ? party.name : PT("Politics.menu.val.independent")))}
          ${pol ? polFact(PT("Politics.menu.lbl.age"), esc(P.politicianAgeOf(pol))) : ""}
          ${polFact(PT("Politics.menu.lbl.status"), esc(standing))}
        </div>`;
      const action = `<div class="inspect-btn focusable" data-pol-act="open" data-pad="confirm">${esc(PT("Politics.menu.empathize"))}</div>`;
      return polDetail(polLeader(h.name), `${h.office} · ${polityLabel}`, body, action);
    }

    // Where a person made by the politics lives: their home group's own name.
    homeOf(name) {
      const profile = ($gameSystem && $gameSystem._npcSociety) ? $gameSystem._npcSociety[name] : null;
      const group = profile && profile._homeGroupName;
      if (!group) return null;
      const grp = ($gameSystem._npcMapGroups || {})[group];
      return (grp && (grp.displayName || grp.foundedTown)) || group;
    }

    polityTitle(polity) {
      return polity.kind === "nation" ? polNation(polity.name) : polPower(polity.name);
    }

    governmentHTML(polity) {
      const P = window.NPCPolitics;
      const head = (polity.politicians || {})[polity.headId];
      const ruling = (polity.parties || []).find(p => p.id === polity.rulingPartyId) || null;
      const partners = (polity.coalition || []).length - 1;
      const coalition = ruling && partners > 0
        ? PT("Politics.menu.val.coalitionPartners", { party: ruling.name, n: partners })
        : (ruling ? ruling.name : PT("Politics.menu.val.none"));
      const s = polity.state || {};
      const pol = polity.policies || {};
      let body = `<div class="inspect-spec-grid">
          ${polFact(PT("Politics.menu.lbl.govType"), esc(P.powerLabel(polity, "govType")))}
          ${polFact(P.powerLabel(polity, "headTitle"), esc(head ? polLeader(head.name) : PT("Politics.menu.val.vacant")))}
          ${polFact(PT("Politics.menu.lbl.rulingParty"), esc(ruling ? ruling.name : PT("Politics.menu.val.independent")))}
          ${polFact(PT("Politics.menu.lbl.coalition"), esc(coalition))}
          ${polFact(PT("Politics.menu.lbl.legislature"), esc(P.powerLabel(polity, "legislature")))}
          ${polFact(PT("Politics.menu.lbl.seats"), esc(polity.seats))}
          ${polFact(PT("Politics.menu.lbl.nextElection"),
            esc(polity.nextElectionMinute != null ? P.dateOf(polity.nextElectionMinute) : PT("Politics.menu.val.notScheduled")))}
        </div>`;
      body += polSection(PT("Politics.menu.sec.state"),
        polMeter(PT("Politics.menu.lbl.legitimacy"), s.legitimacy, "legitimacy") + // i18n-ignore: meter axis
        polMeter(PT("Politics.menu.lbl.stability"), s.stability, "stability") + // i18n-ignore: meter axis
        polMeter(PT("Politics.menu.lbl.unrest"), s.unrest, "unrest") + // i18n-ignore: meter axis
        polMeter(PT("Politics.menu.lbl.economy"), s.economyMood, "mood") + // i18n-ignore: meter axis
        `<div class="inspect-spec-grid">${polFact(PT("Politics.menu.lbl.treasury"), esc(polEuros(s.treasury)))}</div>`);
      body += polSection(PT("Politics.menu.sec.policies"), `<div class="inspect-spec-grid">
          ${polFact(PT("Politics.menu.lbl.taxRate"), esc(pol.taxRate) + "%")}
          ${polFact(PT("Politics.menu.lbl.censorship"), esc(pol.censorship))}
          ${polFact(PT("Politics.menu.lbl.conscription"), esc(pol.conscription))}
          ${polFact(PT("Politics.menu.lbl.welfare"), esc(pol.welfare))}
          ${polFact(PT("Politics.menu.lbl.festivals"), esc(pol.festivals))}
          ${polFact(PT("Politics.menu.lbl.curfew"), esc(pol.curfew ? PT("Politics.menu.val.curfewOn") : PT("Politics.menu.val.curfewOff")))}
        </div>`);
      const last = (polity.elections || [])[0];
      if (last) body += polSection(PT("Politics.menu.sec.lastResults"), this.resultsHTML(polity, last));
      const action = `<div class="inspect-btn focusable" data-pol-act="open" data-pad="confirm">${esc(PT("Politics.menu.row.government"))}</div>`;
      return polDetail(this.polityTitle(polity), P.powerLabel(polity, "govType"), body, action);
    }

    resultsHTML(polity, e) {
      const rows = (e.results || []).slice(0, 6).map(r => {
        const won = r.partyId === e.winnerPartyId || r.name === e.winner;
        return statBar(esc(r.name), Number(r.share) || 0, 100, won ? "winner" : "share"); // i18n-ignore: meter axes
      }).join("");
      const meta = `${esc(e.date)}${e.label === "snap" ? " (" + esc(PT("Politics.menu.val.snap")) + ")" : ""}` +
        `${e.turnout != null ? " · " + esc(PT("Politics.menu.lbl.turnout")) + " " + esc(e.turnout) + "%" : ""}`;
      return `<div class="pol-election-meta">${meta}</div>${rows}` +
        (e.head && e.head !== "-" ? `<div class="inspect-spec-grid">${polFact(window.NPCPolitics.powerLabel(polity, "headTitle"), esc(polLeader(e.head)))}</div>` : "");
    }

    partyHTML(polity, party) {
      const leader = (polity.politicians || {})[party.leaderId];
      const creed = window.NPCShared && window.NPCShared.ideologyById ? window.NPCShared.ideologyById(party.ideologyId) : null;
      const body = `<div class="inspect-spec-grid">
          ${polFact(PT("Politics.menu.lbl.leader"), esc(leader ? polLeader(leader.name) : PT("Politics.menu.val.vacant")))}
          ${polFact(PT("Politics.menu.lbl.seats"), esc(party.seats || 0))}
          ${polFact(PT("Politics.menu.lbl.share"), esc(party.lastShare || 0) + "%")}
          ${party.foundedYear != null ? polFact(PT("Politics.menu.lbl.founded"), esc(party.foundedYear)) : ""}
          ${creed ? polFact(PT("Politics.menu.lbl.govType"), esc(PT(creed.name))) : ""}
        </div>`;
      const action = `<div class="inspect-btn focusable" data-pol-act="open" data-pad="confirm">${esc(PT("Politics.menu.lbl.party"))}</div>`;
      return polDetail(party.name, this.polityTitle(polity), body, action);
    }

    electionsHTML(polity) {
      const P = window.NPCPolitics;
      let body = `<div class="inspect-spec-grid">
          ${polFact(PT("Politics.menu.lbl.nextElection"),
            esc(polity.nextElectionMinute != null ? P.dateOf(polity.nextElectionMinute) : PT("Politics.menu.val.notScheduled")))}
        </div>`;
      const list = (polity.elections || []).slice(0, 5);
      body += list.length
        ? list.map(e => polSection(`${PT("Politics.menu.lbl.winner")}: ${e.winner || "-"}`, this.resultsHTML(polity, e))).join("")
        : `<div class="ui-empty-note">${esc(PT("Politics.menu.empty.noElections"))}</div>`;
      return polDetail(this.polityTitle(polity), P.electionLabelOf(polity.name), body);
    }

    membersHTML(polity) {
      const HM = window.HistoryManager;
      const members = (polity.memberCountries || []).slice().sort();
      let body = polSection(PT("Politics.menu.sec.members"), members.length
        ? `<div class="ui-chip-row">${members.map(n => `<span class="ui-chip">${esc(polNation(n))}</span>`).join("")}</div>`
        : `<div class="ui-empty-note">${esc(PT("Politics.menu.val.none"))}</div>`);
      let wars = [];
      try {
        wars = (HM && HM.activeWars ? HM.activeWars() : [])
          .filter(w => w && (w.attacker === polity.name || w.defender === polity.name));
      } catch (e) { wars = []; }
      body += polSection(PT("Politics.menu.sec.wars"), wars.length
        ? `<div class="ui-succession">${wars.map(w => `<div class="ui-succession-row"><span class="ui-succession-name">${esc(
            PT("Politics.menu.val.warLine", { attacker: polPower(w.attacker), defender: polPower(w.defender), since: w.since || "?" }))}</span></div>`).join("")}</div>`
        : `<div class="ui-empty-note">${esc(PT("Politics.menu.empty.noWars"))}</div>`);
      body += `<div class="inspect-spec-grid">${polFact(PT("Politics.menu.lbl.onu"), esc(this.onuSeatOf(polity.name)))}</div>`;
      return polDetail(this.polityTitle(polity), PT("Politics.menu.row.members"), body);
    }

    // Whether the bloc sits in the ONU assembly, and how.
    onuSeatOf(powerName) {
      try {
        const A = window.ONUAssembly;
        const factions = window.$gameFactions;
        if (!A || !factions || !A.delegations) return PT("Politics.menu.val.notSeated");
        const seat = A.delegations().find(d => d && d.kind === "hyperpower" && // i18n-ignore: delegation kind
          (factions.getHyperpower(d.hyperpowerId) || {}).name === powerName);
        if (seat) return seat.observer ? PT("Politics.menu.val.observer") : PT("Politics.menu.val.seated");
      } catch (e) { /* no chamber in this build */ }
      return PT("Politics.menu.val.notSeated");
    }

    // ---- the three verbs ------------------------------------------------------

    setPoliticsTab(i) {
      const next = Math.max(0, Math.min(PTAB_IDS.length - 1, i));
      if (next === this._tab) return;
      this.closePoliticsPicker();
      this._tab = next;
      this._index = 0;
      SoundManager.playCursor();
      this.refreshPolitics();
    }

    selectPoliticsRow(i) {
      if (!this._rows.length) return;
      const next = Math.max(0, Math.min(this._rows.length - 1, i));
      if (next === this._index) {
        this.activatePoliticsRow();
        return;
      }
      this._index = next;
      SoundManager.playCursor();
      this.refreshPolitics();
    }

    // Confirm on a row: a person opens their Empathize panel, a government,
    // a party or a bloc opens its article.
    activatePoliticsRow() {
      const row = this._rows[this._index];
      if (row && this.activatePartyRow(row)) return;
      const E = window.NPCEmpathize;
      if (!row || !E || row.kind === "none" || row.kind === "townHall") { SoundManager.playBuzzer(); return; }
      SoundManager.playOk();
      politicsMemo.tab = this._tab;
      politicsMemo.index = this._index;
      if (row.kind === "person") { E.openByName(row.name); return; }
      if (row.kind === "party") { E.openEntity("party", row.party.id); return; } // i18n-ignore: wiki entity type
      const polity = row.polity;
      E.openEntity(polity.kind === "nation" ? "nation" : "power", polity.name); // i18n-ignore: wiki entity types
    }

    // The rows of the two party tabs and the picker. Answers true when it
    // handled the row.
    activatePartyRow(row) {
      switch (row.kind) {
        case "pick": {
          const picker = this._picker;
          SoundManager.playOk();
          this.closePoliticsPicker();
          picker.onPick(row.option.value);
          this.refreshPolitics();
          return true;
        }
        case "filter": this.openPartyFilter(); return true;
        case "anyParty":
          if (row.entry.isPlayer) { this.setPoliticsTab(PTAB_IDS.indexOf("own")); return true; } // i18n-ignore: tab id
          if (!window.NPCEmpathize) { SoundManager.playBuzzer(); return true; }
          SoundManager.playOk();
          politicsMemo.tab = this._tab;
          politicsMemo.index = this._index;
          window.NPCEmpathize.openEntity("party", row.entry.party.id); // i18n-ignore: wiki entity type
          return true;
        case "ownFound": this.openPoliticsDraft(polNewDraft()); return true;
        case "ownEdit": this.editOwnParty(); return true;
        case "ownParty": case "ownSupporters": case "ownMember":
          SoundManager.playBuzzer();
          return true;
        default: return false;
      }
    }

    closePolitics() {
      SoundManager.playCancel();
      this.popScene();
    }

    updatePoliticsInput() {
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        // Backing out of a picker, then out of an edit, before the menu.
        if (this._picker) {
          SoundManager.playCancel();
          this.closePoliticsPicker();
          this.refreshPolitics();
          return;
        }
        this.closePolitics();
        return;
      }
      const tabDir = window.UINav ? window.UINav.tabDir() : 0;
      if (tabDir) {
        this.setPoliticsTab(this._tab + tabDir);
        if (window.UINav && window.UINav.consume) window.UINav.consume("tab"); // i18n-ignore: input action
        return;
      }
      if (Input.isRepeated("left")) { this.setPoliticsTab(this._tab - 1); return; }
      if (Input.isRepeated("right")) { this.setPoliticsTab(this._tab + 1); return; }
      if (Input.isRepeated("down") && this._index < this._rows.length - 1) {
        this._index++;
        SoundManager.playCursor();
        this.refreshPolitics();
        return;
      }
      if (Input.isRepeated("up") && this._index > 0) {
        this._index--;
        SoundManager.playCursor();
        this.refreshPolitics();
        return;
      }
      if (Input.isTriggered("ok")) this.activatePoliticsRow();
    }
  }

  window.Scene_Politics = Scene_Politics;
  }

  //===========================================================================
  // Propaganda2: the party's political office, as a HypernetOS program
  //===========================================================================
  // Four pages over the same NPCPolitics state the Politics menu reads:
  //   Party      found the party's own political party, or edit it: name,
  //              creed, tenets and the weekly subscription fee
  //   Parties    every party in the world, narrowed to a town, a nation or a
  //              hyperpower, searchable by name
  //   Campaigns  money spent over days or months to win people to a party
  //              (any party) or to smear one, with the simulation's own
  //              projection of how many it will reach before a coin is spent
  //   Elections  every election still to come, and a member of the team put
  //              down as a candidate in any of them
  // Every control is a .focusable with a stable id so the OS focus ring walks
  // it with keys and a pad (see HypernetOS app navigation). The pg-* classes
  // are in css/hypernet.css next to the chamber's chp-* ones.

  const PG_APP_ID = "app-propaganda2"; // i18n-ignore: app id
  const PG_ICON = 203; // Horn, per js/db/Sprites/Icons.json
  const PG_TABS = ["party", "parties", "campaigns", "elections"]; // i18n-ignore: tab ids, labels are Politics.app.tab.*
  const PG_LIST_CAP = 80;

  const pgIcon = (index, size) => (window.HypernetOS ? window.HypernetOS.getIconHTML(index, size || 16) : "");
  const pgChip = (id, on, label, attrs) =>
    `<div class="focusable pg-chip${on ? " pg-chip-on" : ""}" tabindex="0" id="${id}" ${attrs}>${esc(label)}</div>`;
  const pgBtn = (id, label, attrs, extra) =>
    `<div class="focusable pg-btn${extra ? " " + extra : ""}" tabindex="0" id="${id}" ${attrs}>${esc(label)}</div>`;
  const pgFact = (label, value) =>
    `<tr><td class="chp-td pg-lbl">${esc(label)}</td><td class="chp-td">${value}</td></tr>`;
  const pgMatch = (text, q) => !q || String(text).toLowerCase().includes(String(q).toLowerCase());
  const pgDuration = (days) => (days >= 30
    ? PT(days === 30 ? "Politics.app.duration.month" : "Politics.app.duration.months", { n: Math.round(days / 30) })
    : PT(days === 1 ? "Politics.app.duration.day" : "Politics.app.duration.days", { n: days }));

  window.Propaganda2App = {
    win: null,
    tab: "party",
    draft: null,
    creedOpen: false,
    creedQuery: "",
    partyScope: { kind: "world" }, // i18n-ignore: scope id
    partyScopeQuery: "",
    partyQuery: "",
    partyPick: null,
    camp: { kind: "convert", target: "player", scope: { kind: "world" }, intensity: "leaflets", days: 7 }, // i18n-ignore: form defaults
    campTargetQuery: "",
    campScopeQuery: "",
    elecScope: { kind: "world" }, // i18n-ignore: scope id
    elecScopeQuery: "",
    elecQuery: "",
    elecActor: null,
    msg: null,

    launch() {
      if (!window.HypernetOS || !window.HypernetOS.WindowManager || !window.NPCPolitics) return;
      const win = window.HypernetOS.WindowManager.createWindow({
        id: PG_APP_ID,
        title: PT("Politics.app.name"),
        icon: PG_ICON,
        width: 900,
        height: 600,
        contentHTML: `
          <div class="chp-app pg-app">
            <div class="chp-header pg-header">
              <div class="chp-logo">${pgIcon(PG_ICON, 34)}</div>
              <div class="chp-grow">
                <div class="chp-title">${esc(PT("Politics.app.name"))}</div>
                <div class="chp-subtitle">${esc(PT("Politics.app.subtitle"))}</div>
              </div>
              <div id="pg-purse" class="chp-aside"></div>
            </div>
            <div class="chp-body">
              <div id="pg-nav" class="chp-nav"></div>
              <div id="pg-panel" class="chp-panel"></div>
            </div>
            <div class="chp-status"><span id="pg-status"></span></div>
          </div>`,
      });
      this.win = win;
      this.msg = null;
      try { window.NPCPolitics.advancePlayerPolitics(); } catch (e) { console.warn("[Propaganda2]", e); }
      this.bind();
      this.render();
    },

    bind() {
      if (!this.win || this.win.dataset.pgBound) return;
      this.win.dataset.pgBound = "1";
      this.win.addEventListener("click", (ev) => {
        const hit = ev.target.closest("[data-pg]");
        if (!hit || !this.win.contains(hit)) return;
        ev.stopPropagation();
        this.act(hit.getAttribute("data-pg"), hit.getAttribute("data-v"), hit.getAttribute("data-key"));
      });
      // The fields own the keyboard while they hold it: RPG Maker listens on
      // the document, so a typed letter must not also walk the focus ring.
      const stop = (ev) => { if (ev.target.matches && ev.target.matches("input[data-pgin]") && ev.key !== "Escape") ev.stopPropagation(); };
      this.win.addEventListener("keydown", stop);
      this.win.addEventListener("keyup", stop);
      this.win.addEventListener("keypress", stop);
      this.win.addEventListener("input", (ev) => {
        const field = ev.target.closest("input[data-pgin]");
        if (field) this.typed(field.getAttribute("data-pgin"), field.value);
      });
    },

    // ---- drawing ---------------------------------------------------------------

    render() {
      if (!this.win || !this.win.isConnected) return;
      const P = window.NPCPolitics;
      // A re-render must not steal the field the player is typing in.
      const active = document.activeElement;
      const focusId = active && this.win.contains(active) ? active.id : null;
      const caret = active && typeof active.selectionStart === "number" ? active.selectionStart : null;

      const nav = this.win.querySelector("#pg-nav");
      if (nav) {
        nav.innerHTML = PG_TABS.map(tab => `<div class="focusable chp-navItem${this.tab === tab ? " chp-nav-on" : ""}" tabindex="0"
          id="pg-tab-${tab}" data-pg="tab" data-v="${tab}">${esc(PT("Politics.app.tab." + tab))}</div>`).join("");
      }
      const panel = this.win.querySelector("#pg-panel");
      if (panel) {
        let html = this.msg ? `<div class="chp-card pg-msg${this.msg.bad ? " chp-bad" : ""}">${esc(this.msg.text)}</div>` : "";
        if (this.tab === "party") html += this.partyHTML(); // i18n-ignore: tab id
        else if (this.tab === "parties") html += this.partiesHTML(); // i18n-ignore: tab id
        else if (this.tab === "campaigns") html += this.campaignsHTML(); // i18n-ignore: tab id
        else html += this.electionsHTML();
        panel.innerHTML = html;
      }
      const gold = window.$gameParty && $gameParty.gold ? $gameParty.gold() : 0;
      const purse = this.win.querySelector("#pg-purse");
      if (purse) purse.textContent = PT("Politics.app.purse", { money: polEuros(gold) });
      const status = this.win.querySelector("#pg-status");
      if (status) {
        const party = P.playerParty();
        status.textContent = party
          ? PT("Politics.app.statusParty", { party: party.name, n: P.playerSupporters().length, takings: polEuros(P.weeklyTakings()) })
          : PT("Politics.app.statusNoParty");
      }
      if (focusId) {
        const again = this.win.querySelector("#" + focusId);
        if (again && again.focus) {
          again.focus();
          if (caret != null && again.setSelectionRange) { try { again.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ } }
        }
      }
    },

    field(id, key, value, placeholder, extra) {
      return `<input class="pg-input${extra ? " " + extra : ""}" type="text" maxlength="48" id="${id}" data-pgin="${key}"
        value="${escAttr(value)}" placeholder="${escAttr(placeholder || "")}" aria-label="${escAttr(placeholder || "")}">`;
    },

    // A where-picker: the four kinds as chips, then the places of that kind.
    scopeHTML(key, scope, query) {
      const P = window.NPCPolitics;
      let html = `<div class="pg-row">${P.SCOPE_KINDS.map(kind =>
        pgChip(`pg-${key}-kind-${kind}`, scope.kind === kind, PT("Politics.menu.scope." + kind),
          `data-pg="scopeKind" data-key="${key}" data-v="${kind}"`)).join("")}</div>`;
      if (scope.kind !== "world") { // i18n-ignore: scope id
        const options = P.scopeOptions(scope.kind).filter(o => pgMatch(o.label, query)).slice(0, PG_LIST_CAP);
        html += `<div class="pg-row">${this.field(`pg-${key}-sq`, key + "ScopeQuery", query, PT("Politics.app.searchPlace"))}
          <span class="chp-note">${esc(polScopeLabel(scope))}</span></div>
          <div class="pg-pick">${options.map((o, i) => `<div class="focusable pg-item${scope.value === o.value ? " pg-item-on" : ""}" tabindex="0"
            id="pg-${key}-opt-${i}" data-pg="scopeVal" data-key="${key}" data-v="${escAttr(o.value)}">${esc(
            scope.kind === "nation" ? polNation(o.label) : scope.kind === "power" ? polPower(o.label) : o.label)}</div>`).join("") // i18n-ignore: scope ids
            || `<div class="chp-note">${esc(PT("Politics.menu.empty.noMatch"))}</div>`}</div>`;
      }
      return html;
    },

    platformHTML(platform) {
      const rows = polPlatformRows(platform);
      return rows.length ? `<table class="chp-table">${rows.map(r => pgFact(r.label, esc(r.value))).join("")}</table>` : "";
    },

    // ---- Party ---------------------------------------------------------------------

    partyHTML() {
      const P = window.NPCPolitics;
      const party = P.playerParty();
      if (!party && !this.draft) this.draft = polNewDraft();
      if (!this.draft) return this.ownPartyHTML(party);
      const d = this.draft;
      let html = `<h2 class="chp-h">${esc(PT(d.founding ? "Politics.menu.sec.founding" : "Politics.menu.sec.editing"))}</h2>
        <div class="chp-card">
          <div class="pg-lbl">${esc(PT("Politics.menu.lbl.name"))}</div>
          <div class="pg-row">${this.field("pg-name", "name", d.name, PT("Politics.menu.lbl.name"), "pg-wide")}
            ${pgBtn("pg-reroll", PT("Politics.app.reroll"), 'data-pg="reroll"')}</div>
          <div class="pg-lbl">${esc(PT("Politics.menu.lbl.ideology"))}</div>
          <div class="pg-row"><b>${esc(d.ideologyId ? polCreedLabel(d.ideologyId) : PT("Politics.menu.val.chooseCreed"))}</b>
            ${pgBtn("pg-creed", PT(this.creedOpen ? "Politics.app.closeList" : "Politics.app.chooseCreed"), 'data-pg="creedToggle"')}</div>`;
      if (this.creedOpen) {
        const creeds = P.foundableCreeds().map(c => ({ id: c.id, name: PT(c.name) }))
          .filter(c => pgMatch(c.name, this.creedQuery))
          .sort((a, b) => a.name.localeCompare(b.name)).slice(0, PG_LIST_CAP);
        html += `<div class="pg-row">${this.field("pg-creed-q", "creedQuery", this.creedQuery, PT("Politics.app.searchCreed"))}</div>
          <div class="pg-pick">${creeds.map((c, i) => `<div class="focusable pg-item${d.ideologyId === c.id ? " pg-item-on" : ""}" tabindex="0"
            id="pg-creed-${i}" data-pg="creed" data-v="${escAttr(c.id)}">${esc(c.name)}</div>`).join("")}</div>`;
      }
      html += `<div class="pg-lbl">${esc(PT("Politics.menu.lbl.fee"))}</div>
          <div class="pg-row">${this.field("pg-fee", "fee", String((d.fee || 0) / 100), PT("Politics.menu.hint.feeEntry"))}
            <span>${esc(polFeeLabel(d.fee))} · ${esc(PT("Politics.menu.lbl.attracts"))}: <b>${esc(polFeeClassLabel(d.fee))}</b></span></div>
          <div class="chp-note">${esc(PT("Politics.menu.hint.fee"))}</div>
          <div class="pg-lbl">${esc(PT("Politics.menu.hint.tenets", { n: P.MAX_PLAYER_TENETS }))}</div>
          <div class="pg-row pg-wrap">${P.PLAYER_TENETS.map(t => pgChip(`pg-tenet-${t.id}`, d.tenets.includes(t.id), polTenetName(t.id),
            `data-pg="tenet" data-v="${t.id}" title="${escAttr(polTenetDesc(t.id))}"`)).join("")}</div>
          <div class="chp-note">${esc(d.tenets.map(polTenetDesc).join(" "))}</div>
        </div>`;
      if (d.ideologyId) {
        html += `<div class="chp-card chp-tight"><div class="pg-lbl">${esc(PT("Politics.menu.sec.platform"))}</div>
          ${this.platformHTML(P.playerPartyPlatform(d.ideologyId, d.tenets))}</div>`;
      }
      html += `<div class="pg-row">${pgBtn("pg-commit", PT(d.founding ? "Politics.menu.row.found" : "Politics.menu.row.save"), 'data-pg="commit"', "pg-primary")}
        ${d.founding ? "" : pgBtn("pg-discard", PT("Politics.menu.row.discard"), 'data-pg="discard"')}</div>
        <div class="chp-note">${esc(PT(d.founding ? "Politics.menu.hint.found" : "Politics.menu.hint.save"))}</div>`;
      return html;
    },

    ownPartyHTML(party) {
      const P = window.NPCPolitics;
      const last = party.lastIncome;
      return `<h2 class="chp-h">${esc(party.name)}</h2>
        <div class="chp-card chp-tight"><table class="chp-table">
          ${pgFact(PT("Politics.menu.lbl.ideology"), esc(polCreedLabel(party.ideologyId)))}
          ${pgFact(PT("Politics.menu.lbl.tenets"), esc(party.tenets.length ? party.tenets.map(polTenetName).join(", ") : PT("Politics.menu.val.none")))}
          ${pgFact(PT("Politics.menu.lbl.founded"), esc(party.founded || party.foundedYear))}
          ${pgFact(PT("Politics.menu.lbl.fee"), esc(polFeeLabel(party.fee)))}
          ${pgFact(PT("Politics.menu.lbl.attracts"), esc(polFeeClassLabel(party.fee)))}
          ${pgFact(PT("Politics.menu.lbl.supporters"), esc(P.playerSupporters().length))}
          ${pgFact(PT("Politics.menu.lbl.takings"), esc(polEuros(P.weeklyTakings())))}
          ${pgFact(PT("Politics.menu.lbl.lastPayout"), esc(last ? PT("Politics.menu.val.payout", { gold: polEuros(last.gold), weeks: last.weeks, date: last.date }) : PT("Politics.menu.val.none")))}
          ${pgFact(PT("Politics.menu.lbl.totalEarned"), esc(polEuros(party.totalIncome || 0)))}
          ${pgFact(PT("Politics.menu.sec.partyMembers"), esc(party.members.join(", ") || PT("Politics.menu.val.none")))}
        </table></div>
        <div class="chp-card chp-tight"><div class="pg-lbl">${esc(PT("Politics.menu.sec.platform"))}</div>${this.platformHTML(party.platform)}</div>
        <div class="pg-row">${pgBtn("pg-edit", PT("Politics.menu.row.edit"), 'data-pg="edit"', "pg-primary")}
          ${pgBtn("pg-go-campaign", PT("Politics.app.tab.campaigns"), 'data-pg="tab" data-v="campaigns"')}</div>`;
    },

    // ---- Parties ---------------------------------------------------------------------

    partiesHTML() {
      const P = window.NPCPolitics;
      const all = P.partiesIn(this.partyScope).filter(e => pgMatch(e.party.name, this.partyQuery));
      const shown = all.slice(0, PG_LIST_CAP);
      const where = (e) => e.isPlayer ? PT("Politics.menu.val.yours")
        : (e.polityKind === "nation" ? polNation(e.polityName) : polPower(e.polityName)); // i18n-ignore: polity kind
      let html = `<h2 class="chp-h">${esc(PT("Politics.app.tab.parties"))}</h2>
        <div class="chp-card">${this.scopeHTML("party", this.partyScope, this.partyScopeQuery)}
          <div class="pg-row">${this.field("pg-party-q", "partyQuery", this.partyQuery, PT("Politics.app.searchParty"), "pg-wide")}
            <span class="chp-note">${esc(PT("Politics.app.shown", { n: shown.length, total: all.length }))}</span></div></div>`;
      const picked = this.partyPick ? all.find(e => (e.isPlayer ? "player" : e.party.id) === this.partyPick) : null; // i18n-ignore: target key
      if (picked) html += this.partyCardHTML(picked, where(picked));
      html += `<div class="chp-card chp-tight"><table class="chp-table"><thead><tr>
          <th class="chp-th">${esc(PT("Politics.menu.lbl.party"))}</th>
          <th class="chp-th">${esc(PT("Politics.menu.lbl.polity"))}</th>
          <th class="chp-th">${esc(PT("Politics.menu.lbl.ideology"))}</th>
          <th class="chp-th chp-right">${esc(PT("Politics.menu.lbl.supporters"))}</th>
          <th class="chp-th chp-right">${esc(PT("Politics.menu.lbl.seats"))}</th>
        </tr></thead><tbody>${shown.map((e, i) => {
          const key = e.isPlayer ? "player" : e.party.id; // i18n-ignore: target key
          return `<tr class="focusable pg-tr${this.partyPick === key ? " pg-item-on" : ""}" tabindex="0" id="pg-party-${i}" data-pg="partyPick" data-v="${escAttr(key)}">
            <td class="chp-td">${esc(e.party.name)}</td><td class="chp-td">${esc(where(e))}</td>
            <td class="chp-td">${esc(e.party.ideologyId ? polCreedLabel(e.party.ideologyId) : "")}</td>
            <td class="chp-td chp-right">${esc(e.supporters)}</td><td class="chp-td chp-right">${esc(e.isPlayer ? "-" : (e.party.seats || 0))}</td></tr>`;
        }).join("") || `<tr><td class="chp-td chp-note" colspan="5">${esc(PT("Politics.menu.empty.noPartiesFound"))}</td></tr>`}</tbody></table></div>`;
      return html;
    },

    partyCardHTML(e, where) {
      const P = window.NPCPolitics;
      const polity = e.isPlayer ? null : P.getPolity(e.polityName);
      const leader = polity ? (polity.politicians || {})[e.party.leaderId] : null;
      const key = e.isPlayer ? "player" : e.party.id; // i18n-ignore: target key
      return `<div class="chp-card"><div class="pg-lbl">${esc(e.party.name)}</div><table class="chp-table">
          ${pgFact(PT("Politics.menu.lbl.polity"), esc(where))}
          ${pgFact(PT("Politics.menu.lbl.supporters"), esc(e.supporters))}
          ${e.isPlayer ? "" : pgFact(PT("Politics.menu.lbl.leader"), esc(leader ? polLeader(leader.name) : PT("Politics.menu.val.vacant")))}
          ${e.isPlayer ? "" : pgFact(PT("Politics.menu.lbl.share"), esc((e.party.lastShare || 0) + "%"))}
          ${e.party.ideologyId ? pgFact(PT("Politics.menu.lbl.ideology"), esc(polCreedLabel(e.party.ideologyId))) : ""}
        </table>${this.platformHTML(e.party.platform)}
        <div class="pg-row">${pgBtn("pg-promote", PT("Politics.app.promote"), `data-pg="promote" data-v="${escAttr(key)}"`)}
          ${e.isPlayer ? "" : pgBtn("pg-smear", PT("Politics.app.smear"), `data-pg="smearTarget" data-v="${escAttr(key)}"`)}</div></div>`;
    },

    // ---- Campaigns ---------------------------------------------------------------------

    campaignTargets() {
      const P = window.NPCPolitics;
      const list = P.partiesIn({ kind: "world" }); // i18n-ignore: scope id
      return this.camp.kind === "smear" ? list.filter(e => !e.isPlayer) : list; // i18n-ignore: campaign kind
    },

    campaignSpec() {
      const P = window.NPCPolitics;
      const c = this.camp;
      const intensity = P.CAMPAIGN_INTENSITIES.find(i => i.id === c.intensity) || P.CAMPAIGN_INTENSITIES[0];
      return {
        kind: c.kind,
        targetKind: c.target === "player" ? "player" : "party", // i18n-ignore: target kinds
        partyId: c.target === "player" ? null : c.target, // i18n-ignore: target key
        scope: c.scope, intensity: intensity.id, dailyGold: intensity.dailyGold, days: c.days,
      };
    },

    targetLabel(key) {
      const P = window.NPCPolitics;
      if (key === "player") return P.playerParty() ? P.playerParty().name : PT("Politics.app.noOwnParty"); // i18n-ignore: target key
      const found = P.findParty(key);
      return found ? found.party.name : PT("Politics.app.chooseTarget");
    },

    campaignsHTML() {
      const P = window.NPCPolitics;
      const c = this.camp;
      const targets = this.campaignTargets().filter(e => pgMatch(e.party.name, this.campTargetQuery)).slice(0, PG_LIST_CAP);
      const spec = this.campaignSpec();
      const proj = P.projectCampaign(spec);
      let html = `<h2 class="chp-h">${esc(PT("Politics.app.newCampaign"))}</h2>
        <div class="chp-card">
          <div class="pg-lbl">${esc(PT("Politics.app.campaignKind"))}</div>
          <div class="pg-row">${["convert", "smear"].map(k => pgChip(`pg-ck-${k}`, c.kind === k, PT("Politics.app.kind." + k), `data-pg="campKind" data-v="${k}"`)).join("")}</div>
          <div class="chp-note">${esc(PT("Politics.app.kindHint." + c.kind))}</div>
          <div class="pg-lbl">${esc(PT("Politics.app.target"))}: <b>${esc(this.targetLabel(c.target))}</b></div>
          <div class="pg-row">${this.field("pg-target-q", "campTargetQuery", this.campTargetQuery, PT("Politics.app.searchParty"), "pg-wide")}</div>
          <div class="pg-pick">${targets.map((e, i) => {
            const key = e.isPlayer ? "player" : e.party.id; // i18n-ignore: target key
            const where = e.isPlayer ? PT("Politics.menu.val.yours") : (e.polityKind === "nation" ? polNation(e.polityName) : polPower(e.polityName)); // i18n-ignore: polity kind
            return `<div class="focusable pg-item${c.target === key ? " pg-item-on" : ""}" tabindex="0" id="pg-target-${i}" data-pg="campTarget" data-v="${escAttr(key)}">${esc(e.party.name)} <span class="chp-note">${esc(where)}</span></div>`;
          }).join("") || `<div class="chp-note">${esc(PT("Politics.menu.empty.noPartiesFound"))}</div>`}</div>
          <div class="pg-lbl">${esc(PT("Politics.app.where"))}</div>
          ${this.scopeHTML("camp", c.scope, this.campScopeQuery)}
          <div class="pg-lbl">${esc(PT("Politics.app.intensity"))}</div>
          <div class="pg-row pg-wrap">${P.CAMPAIGN_INTENSITIES.map(i => pgChip(`pg-int-${i.id}`, c.intensity === i.id,
            PT("Politics.app.intensityOf." + i.id, { money: polEuros(i.dailyGold) }), `data-pg="campIntensity" data-v="${i.id}"`)).join("")}</div>
          <div class="pg-lbl">${esc(PT("Politics.app.duration.title"))}</div>
          <div class="pg-row pg-wrap">${P.CAMPAIGN_DURATIONS.map(days => pgChip(`pg-days-${days}`, c.days === days, pgDuration(days), `data-pg="campDays" data-v="${days}"`)).join("")}</div>
        </div>`;
      html += `<div class="chp-card"><div class="pg-lbl">${esc(PT("Politics.app.projection"))}</div>` + (proj
        ? `<table class="chp-table">
            ${pgFact(PT("Politics.app.eligible." + c.kind), esc(proj.eligible))}
            ${pgFact(PT("Politics.app.reach"), esc(proj.reach + "%"))}
            ${pgFact(PT("Politics.app.expected." + c.kind), `<b>${esc(proj.expected)}</b>`)}
            ${pgFact(PT("Politics.app.cost"), esc(polEuros(proj.cost)))}
          </table>`
        : `<div class="chp-note">${esc(PT("Politics.app.noProjection"))}</div>`) +
        `<div class="pg-row">${pgBtn("pg-launch", PT("Politics.app.launch"), 'data-pg="launch"', "pg-primary")}</div></div>`;
      const list = P.listCampaigns();
      html += `<h2 class="chp-h">${esc(PT("Politics.app.campaigns"))}</h2><div class="chp-card chp-tight"><table class="chp-table"><thead><tr>
          <th class="chp-th">${esc(PT("Politics.app.campaignKind"))}</th>
          <th class="chp-th">${esc(PT("Politics.app.target"))}</th>
          <th class="chp-th">${esc(PT("Politics.app.where"))}</th>
          <th class="chp-th chp-right">${esc(PT("Politics.app.progress"))}</th>
          <th class="chp-th">${esc(PT("Politics.app.state"))}</th>
        </tr></thead><tbody>${list.map(k => `<tr>
          <td class="chp-td">${esc(PT("Politics.app.kind." + (k.kind || "convert")))}</td>
          <td class="chp-td">${esc(k.partyName)}</td>
          <td class="chp-td">${esc(polScopeLabel(k.scope))}</td>
          <td class="chp-td chp-right">${esc(PT("Politics.app.progressOf", { n: k.converted, of: k.projected }))}</td>
          <td class="chp-td">${esc(k.done ? PT("Politics.app.done") : PT("Politics.app.running", { date: window.NPCPolitics.dateOf(k.endMinute) }))}</td>
        </tr>`).join("") || `<tr><td class="chp-td chp-note" colspan="5">${esc(PT("Politics.app.noCampaigns"))}</td></tr>`}</tbody></table></div>`;
      return html;
    },

    // ---- Elections ---------------------------------------------------------------------

    electionsHTML() {
      const P = window.NPCPolitics;
      const team = (window.$gameParty && $gameParty.allMembers ? $gameParty.allMembers() : []).filter(Boolean).map(m => m.name());
      if (!this.elecActor || !team.includes(this.elecActor)) this.elecActor = team[0] || null;
      const all = P.upcomingElections(this.elecScope).filter(e => pgMatch(e.label + " " + e.office, this.elecQuery));
      const shown = all.slice(0, PG_LIST_CAP);
      const whereOf = (e) => e.level === "nation" ? polNation(e.label) : e.level === "power" ? polPower(e.label) : e.label; // i18n-ignore: level ids
      let html = `<h2 class="chp-h">${esc(PT("Politics.app.tab.elections"))}</h2>
        <div class="chp-card">
          <div class="pg-lbl">${esc(PT("Politics.app.candidate"))}</div>
          <div class="pg-row pg-wrap">${team.map((name, i) => pgChip(`pg-actor-${i}`, this.elecActor === name, name, `data-pg="elecActor" data-v="${escAttr(name)}"`)).join("")
            || `<span class="chp-note">${esc(PT("Politics.app.noTeam"))}</span>`}</div>
          <div class="chp-note">${esc(P.playerParty() ? PT("Politics.app.runsFor", { party: P.playerParty().name }) : PT("Politics.app.runsAlone"))}</div>
          ${this.scopeHTML("elec", this.elecScope, this.elecScopeQuery)}
          <div class="pg-row">${this.field("pg-elec-q", "elecQuery", this.elecQuery, PT("Politics.app.searchElection"), "pg-wide")}
            <span class="chp-note">${esc(PT("Politics.app.shown", { n: shown.length, total: all.length }))}</span></div>
        </div>
        <div class="chp-card chp-tight"><table class="chp-table"><thead><tr>
          <th class="chp-th">${esc(PT("Politics.app.date"))}</th>
          <th class="chp-th">${esc(PT("Politics.menu.lbl.office"))}</th>
          <th class="chp-th">${esc(PT("Politics.app.where"))}</th>
          <th class="chp-th chp-right">${esc(PT("Politics.app.deposit"))}</th>
          <th class="chp-th"></th>
        </tr></thead><tbody>${shown.map((e, i) => `<tr>
          <td class="chp-td">${esc(e.date)}</td>
          <td class="chp-td">${esc(e.office)} <span class="chp-note">${esc(PT("Politics.menu.level." + e.level))}</span></td>
          <td class="chp-td">${esc(whereOf(e))}${e.standing.length ? `<div class="chp-note">${esc(PT("Politics.app.standing", { names: e.standing.join(", ") }))}</div>` : ""}</td>
          <td class="chp-td chp-right">${esc(polEuros(e.deposit))}</td>
          <td class="chp-td">${e.open
            ? pgBtn(`pg-stand-${i}`, PT("Politics.app.stand"), `data-pg="stand" data-key="${e.level}" data-v="${escAttr(e.polity)}"`)
            : `<span class="chp-note">${esc(PT("Politics.app.closed." + (e.system === "conclave" ? "conclave" : "other")))}</span>`}</td>
        </tr>`).join("") || `<tr><td class="chp-td chp-note" colspan="5">${esc(PT("Politics.app.noElections"))}</td></tr>`}</tbody></table></div>`;
      const mine = P.listCandidacies();
      html += `<h2 class="chp-h">${esc(PT("Politics.app.candidacies"))}</h2><div class="chp-card chp-tight"><table class="chp-table"><thead><tr>
          <th class="chp-th">${esc(PT("Politics.app.candidate"))}</th>
          <th class="chp-th">${esc(PT("Politics.app.where"))}</th>
          <th class="chp-th">${esc(PT("Politics.app.date"))}</th>
          <th class="chp-th">${esc(PT("Politics.app.state"))}</th>
          <th class="chp-th"></th>
        </tr></thead><tbody>${mine.map((c, i) => `<tr>
          <td class="chp-td">${esc(c.actor)}</td>
          <td class="chp-td">${esc(c.level === "nation" ? polNation(c.polity) : c.level === "power" ? polPower(c.polity) : c.polity)}</td>
          <td class="chp-td">${esc(c.electionDate)}</td>
          <td class="chp-td">${esc(c.share == null ? PT("Politics.app.cand." + c.status)
            : PT("Politics.app.candResult", { status: PT("Politics.app.cand." + c.status), share: c.share, winnerShare: c.winnerShare }))}</td>
          <td class="chp-td">${c.status === "standing" ? pgBtn(`pg-withdraw-${i}`, PT("Politics.app.withdraw"), `data-pg="withdraw" data-v="${c.id}"`) : ""}</td>
        </tr>`).join("") || `<tr><td class="chp-td chp-note" colspan="5">${esc(PT("Politics.app.noCandidacies"))}</td></tr>`}</tbody></table></div>`;
      return html;
    },

    // ---- what the controls do -----------------------------------------------------------

    say(key, params, bad) {
      this.msg = { text: PT(key, params), bad: !!bad };
    },

    // Typing only updates state; lists that the text narrows are redrawn.
    typed(key, value) {
      const d = this.draft;
      if (key === "name" && d) { d.name = value; return; }
      if (key === "fee" && d) {
        const gold = polParseFee(value);
        if (gold != null) d.fee = Math.max(0, Math.min(window.NPCPolitics.MAX_PLAYER_FEE, gold));
      } else if (key in this) this[key] = value;
      this.render();
    },

    scopeOf(key) {
      return key === "party" ? "partyScope" : key === "camp" ? null : "elecScope"; // i18n-ignore: picker keys
    },

    setScope(key, scope) {
      if (key === "camp") this.camp.scope = scope; // i18n-ignore: picker key
      else this[this.scopeOf(key)] = scope;
    },

    getScope(key) {
      return key === "camp" ? this.camp.scope : this[this.scopeOf(key)]; // i18n-ignore: picker key
    },

    act(what, v, key) {
      const P = window.NPCPolitics;
      const snd = (s) => { if (window.SoundManager && SoundManager[s]) SoundManager[s](); };
      const d = this.draft;
      this.msg = null;
      switch (what) {
        case "tab": if (this.tab !== v) { this.tab = v; snd("playCursor"); } break;
        case "reroll": if (d) { d.name = P.rollPlayerPartyName(); snd("playCursor"); } break;
        case "creedToggle": this.creedOpen = !this.creedOpen; snd("playCursor"); break;
        case "creed": if (d) { d.ideologyId = v; this.creedOpen = false; snd("playOk"); } break;
        case "tenet":
          if (d && !polToggleTenet(d, v)) { snd("playBuzzer"); this.say("Politics.menu.msg.tooManyTenets", { n: P.MAX_PLAYER_TENETS }, true); }
          else snd("playCursor");
          break;
        case "commit": {
          if (!d) break;
          const result = polCommitDraft(d);
          this.say(result.key, result.params, !result.ok);
          if (result.ok) { this.draft = null; snd("playOk"); } else snd("playBuzzer");
          break;
        }
        case "discard": this.draft = null; snd("playCancel"); break;
        case "edit": if (P.playerParty()) { this.draft = polEditDraft(P.playerParty()); snd("playOk"); } break;
        case "scopeKind": {
          const scope = v === "world" ? { kind: v } : { kind: v, value: null }; // i18n-ignore: scope id
          this.setScope(key, scope);
          snd("playCursor");
          break;
        }
        case "scopeVal": this.setScope(key, { kind: this.getScope(key).kind, value: v }); snd("playCursor"); break;
        case "partyPick": this.partyPick = this.partyPick === v ? null : v; snd("playCursor"); break;
        case "promote": this.camp.kind = "convert"; this.camp.target = v; this.tab = "campaigns"; snd("playOk"); break; // i18n-ignore: campaign kind, tab id
        case "smearTarget": this.camp.kind = "smear"; this.camp.target = v; this.tab = "campaigns"; snd("playOk"); break; // i18n-ignore: campaign kind, tab id
        case "campKind":
          this.camp.kind = v;
          if (v === "smear" && this.camp.target === "player") this.camp.target = null; // i18n-ignore: campaign kind, target key
          snd("playCursor");
          break;
        case "campTarget": this.camp.target = v; snd("playCursor"); break;
        case "campIntensity": this.camp.intensity = v; snd("playCursor"); break;
        case "campDays": this.camp.days = Number(v) || 1; snd("playCursor"); break;
        case "launch": {
          const result = P.launchCampaign(this.campaignSpec());
          if (result.ok) {
            snd("playOk");
            this.say("Politics.app.launched", { party: result.campaign.partyName, n: result.campaign.projected, cost: polEuros(result.campaign.cost) });
          } else {
            snd("playBuzzer");
            this.say("Politics.app.fail." + result.reason, null, true);
          }
          break;
        }
        case "elecActor": this.elecActor = v; snd("playCursor"); break;
        case "stand": {
          const result = P.standForElection({ actor: this.elecActor, level: key, polity: v });
          if (result.ok) {
            snd("playOk");
            this.say("Politics.app.standingNow", { name: result.candidacy.actor, date: result.candidacy.electionDate });
          } else {
            snd("playBuzzer");
            this.say("Politics.app.fail." + result.reason, null, true);
          }
          break;
        }
        case "withdraw": if (P.withdrawCandidacy(Number(v))) snd("playCancel"); break;
        default: return;
      }
      this.render();
    },
  };

  if (window.HypernetOS && window.HypernetOS.registerApp) {
    window.HypernetOS.registerApp({
      id: PG_APP_ID,
      name: PT("Politics.app.name"),
      icon: PG_ICON,
      category: "civic", // i18n-ignore: app category id
      launchFn: function () { window.Propaganda2App.launch(); },
      desktopShortcut: true,
    });
  }

})();
