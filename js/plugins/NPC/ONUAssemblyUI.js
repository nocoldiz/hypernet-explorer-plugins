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
 */

(() => {
  "use strict";

  // The system publishes this when it loads. Read late rather than captured,
  // because either plugin may be the one the engine loads first.
  const M = () => (window.ONUAssembly && window.ONUAssembly._model) || null;
  const T = (k, t) => { const m = M(); return m ? m.T(k, t) : k; };
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const COURT_ATTR = "data-onu-sitting";

  function assemblyIsSitting() {
    const node = document.querySelector("[" + COURT_ATTR + "]");
    return !!(node && node.isConnected);
  }

  // Escape and the pad's cancel both read as 'cancel'; the right mouse button
  // arrives as a TouchInput cancel. Polled in one place so a single press can
  // only ever be counted once.
  const cancelPressed = () => Input.isTriggered("cancel") || TouchInput.isCancelled();

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
        const advanceKeys = ["Enter", "NumpadEnter", "Space"];
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
          document.removeEventListener("keydown", kh);
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

        const kh = (e) => {
          if (!armed || e.repeat || this._autoPlay) return;
          if (advanceKeys.includes(e.code)) { e.preventDefault(); SoundManager.playOk(); done(); }
        };
        const ch = () => {
          if (this._autoPlay) { stopAuto(); SoundManager.playOk(); done(); return; }
          if (armed) { SoundManager.playOk(); done(); }
        };
        document.addEventListener("keydown", kh);
        if (log) log.addEventListener("click", ch);
        paint();

        const poll = () => {
          if (!active) return;
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

        const poll = () => {
          if (!active) return;
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
})();
