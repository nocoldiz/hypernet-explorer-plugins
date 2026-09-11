/*:
 * @target MZ
 * @plugindesc v1.1.0 Scenographic quest board: cork board of procedural post-it offers, signed contracts, and the sheet the party writes their own notices on (ProceduralQuestSystem front-end). [Claude]
 * @author Hypernet
 *
 * @help QuestBoardUI.js
 *
 * The player-facing notice board for ProceduralQuestSystem.js: a wooden cork
 * board covered in pinned, rotated post-it notes, one per procedural offer.
 * Clicking (or OK) opens the full parchment with the generated lore text and
 * the complete contract terms (reward or ???, upfront cost, advance,
 * deadline, penalty, breach bounty, faction effects) BEFORE accepting.
 *
 * A second tab lists signed contracts: progress, countdowns, reward
 * collection for claimable quests and abandoning (which triggers the failure
 * clauses, and says so).
 *
 * A third tab, Posted, is the board read the other way round: every notice a
 * PLAYER pinned up in this world, whichever savegame wrote it. The first card
 * is always the blank sheet, which opens the composer:
 *
 *   what          any archetype the engine knows, or a request for goods
 *   difficulty    chosen for an errand, read off the price for a request
 *   stationery    the hyperpower whose register the notice is written in
 *   purse         money, plus anything out of the party's own pack
 *   crew          the smallest party that may take it on
 *   expiry        the day it comes down
 *
 * The sheet shows the notice as it will read, the going rate for the work and
 * everything that goes into escrow, and rewrites the wording on demand. The
 * whole reward is paid when the pin goes in. Engine side, see the
 * player-posted contracts section of ProceduralQuestSystem.js.
 *
 * Zero setup: an event only needs the openQuestBoard plugin command. The
 * board's daily offers are derived automatically from where it stands.
 *
 * Load AFTER ProceduralQuestSystem.js.
 *
 * @command openQuestBoard
 * @text Open Quest Board
 * @desc Opens the quest board for the current location.
 *
 * @arg boardKey
 * @text Board Key (optional)
 * @desc Override the auto-detected location key (e.g. a Destinations.json name).
 * @type string
 * @default
 */

(() => {
  "use strict";

  const PLUGIN = "QuestBoardUI";

  function PQ() { return window.ProceduralQuests; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  const NOTE_COLORS = ["#faf2d3", "#e6ebd7", "#ebd7d7", "#d7ebeb", "#e9e0f0", "#f0e0e9", "#ebdcd0", "#d2e0db"];
  const SEAL_COLORS = ["#8b263e", "#1f4e79", "#3e6b2f", "#6b4a1f", "#4a2f6b", "#2f6b62", "#7a3b17", "#41414d"];

  // One IconSet cell, through the notification service that owns the sprite.
  // Silent if it is not loaded: an icon is decoration, and the sheet still reads.
  function iconHTML(index) {
    return (index && window.ParchmentToast) ? window.ParchmentToast.icon(index) : "";
  }

  function hashStr(s) {
    let h = 0x811c9dc5;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // ==========================================================================
  // Scene
  // ==========================================================================
  class Scene_QuestBoard extends Scene_MenuBase {
    prepare(boardKey) { this._boardKey = boardKey || null; }

    create() {
      super.create();
      this._tab = "offers";        // offers | contracts | posted
      this._focus = 0;
      this._detail = null;          // offer, quest or posted notice being inspected
      this._detailIsOffer = false;
      this._detailIsPosted = false;
      this._confirmAbandon = null;  // qid pending abandon confirmation
      this._composer = null;        // the notice the party is writing, if any
      this._el = null;

      const api = PQ();
      // Every board on a map is the same board: the engine resolves whatever the
      // event asked for down to this map's single seeded key (an override only
      // survives when it names another real place).
      if (api) {
        this._boardKey = api.resolveBoardKey
          ? api.resolveBoardKey(this._boardKey)
          : (this._boardKey || api.currentBoardKey());
        this._offers = api.offersForBoard(this._boardKey);
        // Courier deliveries and supply readiness resolve on board open.
        api.onBoardOpened(this._boardKey);
      } else {
        this._offers = [];
      }
      this._buildDOM();
    }

    terminate() {
      if (this._onKey) { document.removeEventListener("keydown", this._onKey, true); this._onKey = null; }
      if (this._el) { this._el.remove(); this._el = null; }
      super.terminate();
    }

    // ---- data ----
    _cards() {
      const api = PQ();
      if (this._tab === "offers") return this._offers;
      if (this._tab === "posted") return api ? api.postedForBoard() : [];
      return api ? api.activeQuests() : [];
    }

    // The Posted tab always carries the blank sheet in slot 0, so the notice at
    // card index i is the (i-1)th record.
    _postedAt(index) {
      const api = PQ();
      if (!api || index <= 0) return null;
      return api.postedForBoard()[index - 1] || null;
    }

    // ---- DOM ----
    _buildDOM() {
      const el = document.createElement("div");
      el.id = "qb-overlay";
      document.body.appendChild(el);
      this._el = el;
      this._refresh();

      el.addEventListener("click", ev => {
        const t = ev.target;
        if (t.closest("[data-close-detail]")) { this._closeDetail(); return; }
        if (t.id === "qb-detail-backdrop") { this._closeDetail(); return; }
        if (t.closest("[data-show-map]")) { this._showOnMap(); return; }
        const accept = t.closest("[data-accept]");
        if (accept) { this._acceptCurrent(); return; }
        const claim = t.closest("[data-claim]");
        if (claim) { this._claim(claim.dataset.claim); return; }
        const abandon = t.closest("[data-abandon]");
        if (abandon) { this._askAbandon(abandon.dataset.abandon); return; }
        const confirmAb = t.closest("[data-confirm-abandon]");
        if (confirmAb) { this._doAbandon(confirmAb.dataset.confirmAbandon); return; }
        if (t.closest("[data-close-compose]")) { this._closeComposer(); return; }
        if (t.closest("[data-close-picker]")) { this._composer.picker = null; SoundManager.playCancel(); this._refresh(); return; }
        const pick = t.closest("[data-cpick]");
        if (pick) {
          const [kind, id] = pick.dataset.cpick.split(":");
          this._pickGoods(kind, Number(id));
          return;
        }
        const page = t.closest("[data-cpage]");
        if (page) {
          this._composer.picker.page += Number(page.dataset.cpage);
          SoundManager.playCursor();
          this._refresh();
          return;
        }
        const drop = t.closest("[data-cdrop]");
        if (drop) {
          const [which, idx] = drop.dataset.cdrop.split(":");
          this._dropGoods(which, Number(idx));
          return;
        }
        const delta = t.closest("[data-cdelta]");
        if (delta) {
          const [id, dir] = delta.dataset.cdelta.split(":");
          this._adjustRow(id, Number(dir));
          return;
        }
        const act = t.closest("[data-crow-act]");
        if (act) { this._activateRow(act.dataset.crowAct); return; }
        const crow = t.closest("[data-crow]");
        if (crow) {
          this._composer.row = Number(crow.dataset.crow) || 0;
          SoundManager.playCursor();
          this._refresh();
          return;
        }
        const take = t.closest("[data-take]");
        if (take) { this._takePosted(take.dataset.take); return; }
        const withdraw = t.closest("[data-withdraw]");
        if (withdraw) { this._withdrawPosted(withdraw.dataset.withdraw); return; }
        const collect = t.closest("[data-collect]");
        if (collect) { this._collectPosted(collect.dataset.collect); return; }
        const tab = t.closest("[data-tab]");
        if (tab) { this._switchTab(tab.dataset.tab); return; }
        const card = t.closest("[data-card]");
        if (card) {
          this._focus = Number(card.dataset.card) || 0;
          this._openDetail();
          return;
        }
      });
      // Right click backs out one step, exactly like the cancel button: the open
      // sheet, then a pending confirmation, then the board itself (and it never
      // raises a browser menu).
      el.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        this._back();
      });
      // Typing filters the shelf. Only while it is open, and the key never
      // reaches the engine, so WASD does not walk the party under the overlay.
      this._onKey = ev => {
        const picker = this._composer && this._composer.picker;
        if (!picker) return;
        if (ev.key === "Backspace") {
          picker.query = picker.query.slice(0, -1);
        } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
          picker.query += ev.key;
        } else {
          return;
        }
        picker.page = 0;
        ev.preventDefault();
        ev.stopPropagation();
        this._refresh();
      };
      document.addEventListener("keydown", this._onKey, true);

      el.addEventListener("mouseover", ev => {
        const card = ev.target.closest("[data-card]");
        if (card && !this._detail && !this._composer) {
          const idx = Number(card.dataset.card) || 0;
          if (idx !== this._focus) { this._focus = idx; this._paintFocus(); }
        }
      });
    }

    _refresh() {
      if (!this._el) return;
      const api = PQ();
      const cards = this._cards();
      const slots = this._tab === "posted" ? cards.length + 1 : cards.length;
      this._focus = Math.max(0, Math.min(this._focus, slots - 1));

      const offersLabel = T('QuestBoard.offers');
      const contractsLabel = T('QuestBoard.contracts');
      const postedLabel = T('QuestBoard.posted');
      const postedCount = api ? api.postedForBoard().length : 0;
      const hint = T('QuestBoard.arrowsMoveOkReadTabSwitchEscClose');

      let cardsHTML = "";
      if (this._tab === "posted") {
        // Never empty: the blank sheet is always pinned there.
        cardsHTML = this._postedCardsHTML(cards);
      } else if (!cards.length) {
        cardsHTML = `<div class="qb-empty">${this._tab === "offers"
          ? T('QuestBoard.nothingButRustyPinsAndOlderRegretsComeBackTo')
          : T('QuestBoard.noSignedContracts')}</div>`;
      } else if (this._tab === "offers") {
        cardsHTML = cards.map((o, i) => this._offerNoteHTML(o, i)).join("");
      } else {
        cardsHTML = cards.map((q, i) => this._contractNoteHTML(q, i)).join("");
      }

      // The board key is a map group or a destination key; the header reads the
      // place's name ("FrozenStation" -> "Frozen Station").
      const boardName = esc(
        (this._boardKey && window.WorkSystem?.destinationName)
          ? window.WorkSystem.destinationName(this._boardKey)
          : (this._boardKey || "?"));

      const boardKey = `${this._boardKey || "?"}#${this._tab}#${cards.length}#${this._detail ? (this._detail.qid || this._detail.id || "1") : "0"}#${this._composer ? (this._composer.picker ? "p" : "c") + this._composer.row : "0"}#${this._confirmAbandon || "0"}`;
      const cardsEl = this._el.querySelector("#qb-cards");
      if (cardsEl && this._lastBoardKey === boardKey) {
        this._paintFocus();
        return;
      }
      this._lastBoardKey = boardKey;

      this._el.querySelectorAll("#qb-header, #qb-tabs, #qb-cards, #qb-detail-backdrop, #qb-compose-backdrop, #qb-pick-backdrop")
        .forEach(n => n.remove());
      this._el.insertAdjacentHTML("beforeend", `
        <div id="qb-header">
          <span id="qb-title">${T('QuestBoard.questBoard')}</span>
          <span id="qb-sub">${boardName}</span>
          <span id="qb-hint">${hint}</span>
        </div>
        <div id="qb-tabs">
          <span class="qb-tab ${this._tab === "offers" ? "active" : ""}" data-tab="offers">${offersLabel} (${this._offers.length})</span>
          <span class="qb-tab ${this._tab === "contracts" ? "active" : ""}" data-tab="contracts">${contractsLabel} (${api ? api.activeQuests().length : 0})</span>
          <span class="qb-tab ${this._tab === "posted" ? "active" : ""}" data-tab="posted">${postedLabel} (${postedCount})</span>
        </div>
        <div id="qb-cards">${cardsHTML}</div>
        ${this._detailHTML()}
        ${this._composerHTML()}`);
    }

    _offerNoteHTML(o, i) {
      const api = PQ();
      const rot = ((hashStr(o.qid) % 9) - 4) * 0.9;
      const bg = NOTE_COLORS[hashStr(o.qid + "c") % NOTE_COLORS.length];
      const pin = ["#b03030", "#2f5db0", "#2f8a45", "#a88a1f"][hashStr(o.qid + "p") % 4];
      const seal = SEAL_COLORS[(o.giverFaction != null ? o.giverFaction : hashStr(o.qid)) % SEAL_COLORS.length];
      const sealCh = esc(String(o.giverLabel || "?").replace(/^(a|an|the)\s+/i, "").charAt(0).toUpperCase());
      const stars = '<span class="qb-star"></span>'.repeat(Math.max(0, Math.min(5, o.diff)));
      const stepsNote = o.steps.length > 1
        ? `<div class="qb-note-steps">${o.steps.length} ${T('QuestBoard.objectives')} ${o.stepMode === "seq" ? T('QuestBoard.inOrder') : T('QuestBoard.anyOrder')}</div>` : "";
      return `<div class="qb-note ${i === this._focus && !this._detail ? "focused" : ""}"
        data-card="${i}" style="--rot:${rot}deg; --note-bg:${bg}; --pin:${pin}; --seal:${seal}">
        <div class="qb-pin"></div>
        ${o.deadlineHours ? `<div class="qb-urgent">${T('QuestBoard.urgent')} ${o.deadlineHours}h</div>` : ""}
        <div class="qb-note-title">${esc(o.title)}</div>
        <div class="qb-note-giver">${esc(o.giverLabel)}</div>
        <div class="qb-note-reward">${T('QuestBoard.reward')}${esc(api.rewardText(o, false))}</div>
        ${o.payGold > 0 ? `<div class="qb-note-deadline">${T('QuestBoard.costs')}${esc(api.euros(o.payGold))}</div>` : ""}
        ${stepsNote}
        <div class="qb-diff">${stars}</div>
        <div class="qb-seal">${sealCh}</div>
      </div>`;
    }

    _contractNoteHTML(q, i) {
      const api = PQ();
      const rot = ((hashStr(q.qid) % 7) - 3) * 0.7;
      const bg = NOTE_COLORS[hashStr(q.qid + "c") % NOTE_COLORS.length];
      const claimable = q.status === "claimable";
      const statusText = claimable
        ? T('QuestBoard.readyCollectYourReward')
        : (q.deadlineAt ? T('QuestBoard.timeLeft') + api.hoursLeftText(q.deadlineAt) : T('QuestBoard.inProgress'));
      const supplyBlocked = claimable && q.steps.some(s => s.kind === "supply_items"
        && $gameParty.numItems($dataItems[s.itemId]) < s.qty);
      const btns = [];
      if (claimable && !supplyBlocked) {
        btns.push(`<span class="qb-btn claim" data-claim="${esc(q.qid)}">${T('QuestBoard.collect')} ${esc(api.rewardText(q, false))}</span>`);
      } else if (supplyBlocked) {
        btns.push(`<span class="qb-status">${T('QuestBoard.bringTheGoodsToCollect')}</span>`);
      }
      if (this._confirmAbandon === q.qid) {
        btns.push(`<span class="qb-btn danger" data-confirm-abandon="${esc(q.qid)}">${T('QuestBoard.confirmAbandonPenaltiesApply')}</span>`);
      } else {
        btns.push(`<span class="qb-btn danger" data-abandon="${esc(q.qid)}">${T('QuestBoard.abandon')}</span>`);
      }
      return `<div class="qb-note qb-contract ${i === this._focus && !this._detail ? "focused" : ""}"
        data-card="${i}" style="--rot:${rot}deg; --note-bg:${bg}">
        <div class="qb-pin"></div>
        <div class="qb-note-title">${esc(q.title)}</div>
        <div class="qb-note-giver">${esc(q.giverLabel)}</div>
        <div class="qb-status ${claimable ? "claimable" : "active"}">${esc(statusText)}</div>
        <div class="qb-note-steps">${esc(api.objectiveText(q)).replace(/\n/g, "<br>")}</div>
        <div class="qb-btnrow">${btns.join("")}</div>
      </div>`;
    }

    _detailHTML() {
      if (!this._detail) return "";
      const api = PQ();
      const o = this._detail;
      const termLines = this._detailIsPosted ? api.postedTerms(o) : api.termsLines(o);
      const terms = termLines.map(line => {
        const warn = /Penalty|Penale|prosecuted|perseguito|cost|Costo/i.test(line);
        return `<div class="qb-d-line ${warn ? "warn" : ""}">${esc(line)}</div>`;
      }).join("");
      const steps = esc(api.objectiveText(o));
      let acceptBtn = "";
      if (this._detailIsOffer) {
        acceptBtn = `<span class="qb-btn claim" data-accept="1">${o.payGold > 0
          ? T('QuestBoard.signAndPay') + esc(api.euros(o.payGold))
          : T('QuestBoard.signTheContract')}</span>`;
      } else if (this._detailIsPosted) {
        const mine = api.isOwnPost(o);
        if (mine && o.status === "open") {
          acceptBtn = `<span class="qb-btn danger" data-withdraw="${esc(o.id)}">${T('QuestBoard.withdrawNotice')}</span>`;
        } else if (mine && (o.status === "done" || o.status === "expired")) {
          acceptBtn = `<span class="qb-btn claim" data-collect="${esc(o.id)}">${T('QuestBoard.collectNotice')}</span>`;
        } else if (!mine && o.status === "open") {
          acceptBtn = $gameParty.members().length < (o.minParty || 1)
            ? `<span class="qb-status">${T('QuestBoard.needsCrew', { n: o.minParty })}</span>`
            : `<span class="qb-btn claim" data-take="${esc(o.id)}">${T('QuestBoard.takeNotice')}</span>`;
        }
      }
      const loc = this._detailLocation();
      const mapBtn = loc
        ? `<span class="qb-btn map" data-show-map="1">${T('QuestBoard.showOnMapAt', { x: loc.wx, y: loc.wy })}</span>`
        : "";
      return `<div id="qb-detail-backdrop"><div id="qb-detail"><div class="qb-d-page">
        <h2>${esc(o.title)}</h2>
        <div class="qb-d-giver">${T('QuestBoard.postedBy')}${esc(o.giverLabel)}</div>
        <div class="qb-d-body">${esc(o.body)}</div>
        <div class="qb-d-sec">${T('QuestBoard.objectives2')}</div>
        <div class="qb-d-steps">${steps}</div>
        <div class="qb-d-sec">${T('QuestBoard.terms')}</div>
        ${terms}
        <div class="qb-d-btns">
          ${acceptBtn}
          ${mapBtn}
          <span class="qb-btn" data-close-detail="1">${T('QuestBoard.back')}</span>
        </div>
      </div></div></div>`;
    }

    // The world tile the open sheet points at, or null for contracts with nothing
    // to pin (supply runs, arena bouts, market positions).
    _detailLocation() {
      const api = PQ();
      if (!this._detail || !api || typeof api.questLocation !== "function") return null;
      return api.questLocation(this._detail);
    }

    // Leave the board and open the world map (the M map) centred on the site.
    _showOnMap() {
      const loc = this._detailLocation();
      if (!loc) return; // nothing to point at, and no button was drawn
      if (!window.WorldMapView) {
        SoundManager.playBuzzer();
        return;
      }
      window.WorldMapView.requestFocusAt(loc.wx, loc.wy);
      SoundManager.playOk();
      this._detail = null;
      // Straight to the map rather than popScene: the request can only be
      // carried out by Scene_Map, and the board may sit above a menu stack.
      SceneManager.goto(Scene_Map);
    }

    // Notes wrap freely across the full-screen board, so the column count is
    // whatever the layout ended up with: count the notes sharing the top row.
    _perRow() {
      if (!this._el) return 1;
      const notes = this._el.querySelectorAll("[data-card]");
      if (!notes.length) return 1;
      const top = notes[0].offsetTop;
      let n = 0;
      for (const note of notes) {
        if (note.offsetTop !== top) break;
        n++;
      }
      return Math.max(1, n);
    }

    _paintFocus() {
      if (!this._el) return;
      this._el.querySelectorAll("[data-card]").forEach(n => {
        n.classList.toggle("focused", Number(n.dataset.card) === this._focus && !this._detail);
      });
      const f = this._el.querySelector(".qb-note.focused");
      if (f) f.scrollIntoView({ block: "nearest" });
    }

    // ---- actions ----
    _switchTab(tab) {
      if (tab === this._tab) return;
      this._tab = tab;
      this._focus = 0;
      this._detail = null;
      this._detailIsPosted = false;
      this._composer = null;
      this._confirmAbandon = null;
      SoundManager.playCursor();
      this._refresh();
    }

    _openDetail() {
      if (this._tab === "posted") {
        // Card 0 is the blank sheet, not a notice: it opens the composer.
        if (this._focus === 0) { this._openComposer(); return; }
        const rec = this._postedAt(this._focus);
        if (!rec) return;
        this._detail = rec;
        this._detailIsOffer = false;
        this._detailIsPosted = true;
        SoundManager.playOk();
        this._refresh();
        return;
      }
      const cards = this._cards();
      const item = cards[this._focus];
      if (!item) return;
      this._detail = item;
      this._detailIsOffer = this._tab === "offers";
      this._detailIsPosted = false;
      SoundManager.playOk();
      this._refresh();
    }

    _closeDetail() {
      if (!this._detail) return;
      this._detail = null;
      SoundManager.playCancel();
      this._refresh();
    }

    // One step back, whatever is on screen: sheet, pending confirmation, board.
    _back() {
      if (this._composer) { this._closeComposer(); return; }
      if (this._detail) { this._closeDetail(); return; }
      if (this._confirmAbandon) {
        this._confirmAbandon = null;
        SoundManager.playCancel();
        this._refresh();
        return;
      }
      this._closeBoard();
    }

    _closeBoard() {
      if (this._closing) return;
      this._closing = true;
      SoundManager.playCancel();
      this.popScene();
    }

    _acceptCurrent() {
      const api = PQ();
      if (!api || !this._detail || !this._detailIsOffer) return;
      const res = api.acceptOffer(this._detail);
      if (!res.ok) {
        SoundManager.playBuzzer();
        if (window.ParchmentToast && res.reason) {
          window.ParchmentToast.show(res.reason, { severity: "warning" });
        }
        return;
      }
      SoundManager.playOk();
      this._detail = null;
      this._offers = api.offersForBoard(this._boardKey);
      this._refresh();
    }

    _claim(qid) {
      const api = PQ();
      if (!api) return;
      const res = api.claimQuest(qid);
      if (!res.ok) {
        SoundManager.playBuzzer();
        if (window.ParchmentToast && res.reason) {
          window.ParchmentToast.show(res.reason, { severity: "warning" });
        }
        return;
      }
      SoundManager.playShop();
      this._refresh();
    }

    _askAbandon(qid) {
      this._confirmAbandon = qid;
      SoundManager.playCursor();
      this._refresh();
    }

    _doAbandon(qid) {
      const api = PQ();
      if (api) api.abandonQuest(qid);
      this._confirmAbandon = null;
      SoundManager.playCancel();
      this._refresh();
    }

    // ========================================================================
    // Posted notices: the party's own board
    // ========================================================================
    // The first card is always the blank sheet: a board the party can write on
    // is only useful if writing on it is the obvious thing to do there.
    _postedCardsHTML(recs) {
      let html = `<div class="qb-note qb-post-new ${this._focus === 0 && !this._detail && !this._composer ? "focused" : ""}"
        data-card="0" style="--rot:-1.2deg">
        <div class="qb-pin"></div>
        <div class="qb-post-plus">+</div>
        <div class="qb-note-title">${T('QuestBoard.writeANotice')}</div>
        <div class="qb-note-steps">${T('QuestBoard.writeANoticeHint')}</div>
      </div>`;
      html += recs.map((rec, i) => this._postedNoteHTML(rec, i + 1)).join("");
      return html;
    }

    _postedNoteHTML(rec, i) {
      const api = PQ();
      const rot = ((hashStr(rec.id) % 7) - 3) * 0.8;
      const bg = NOTE_COLORS[hashStr(rec.id + "c") % NOTE_COLORS.length];
      const pin = ["#b03030", "#2f5db0", "#2f8a45", "#a88a1f"][hashStr(rec.id + "p") % 4];
      const mine = api.isOwnPost(rec);
      const stars = '<span class="qb-star"></span>'.repeat(Math.max(0, Math.min(5, rec.diff)));
      const btns = [];
      if (mine && rec.status === "open") {
        btns.push(`<span class="qb-btn danger" data-withdraw="${esc(rec.id)}">${T('QuestBoard.withdrawNotice')}</span>`);
      }
      if (mine && (rec.status === "done" || rec.status === "expired")) {
        btns.push(`<span class="qb-btn claim" data-collect="${esc(rec.id)}">${T('QuestBoard.collectNotice')}</span>`);
      }
      if (!mine && rec.status === "open") {
        const short = $gameParty.members().length < (rec.minParty || 1);
        btns.push(short
          ? `<span class="qb-status">${T('QuestBoard.needsCrew', { n: rec.minParty })}</span>`
          : `<span class="qb-btn claim" data-take="${esc(rec.id)}">${T('QuestBoard.takeNotice')}</span>`);
      }
      const crew = (rec.minParty || 1) > 1
        ? `<div class="qb-note-crew">${T('QuestBoard.crewOf', { n: rec.minParty })}</div>` : "";
      return `<div class="qb-note qb-posted ${i === this._focus && !this._detail && !this._composer ? "focused" : ""}"
        data-card="${i}" style="--rot:${rot}deg; --note-bg:${bg}; --pin:${pin}">
        <div class="qb-pin"></div>
        ${mine ? `<div class="qb-urgent qb-mine">${T('QuestBoard.yourNotice')}</div>` : ""}
        <div class="qb-note-title">${esc(rec.title)}</div>
        <div class="qb-note-giver">${esc(rec.giverLabel || "")}</div>
        <div class="qb-note-reward">${T('QuestBoard.reward')}${esc(api.rewardText(rec, true))}</div>
        <div class="qb-status ${rec.status === "open" ? "active" : "claimable"}">${esc(api.postedStatusLine(rec))}</div>
        ${crew}
        <div class="qb-diff">${stars}</div>
        <div class="qb-btnrow">${btns.join("")}</div>
      </div>`;
    }

    // ---- the composer ----
    _openComposer() {
      const api = PQ();
      if (!api) return;
      const styles = api.hyperpowerStyles();
      const types = api.postableTypes();
      this._composer = {
        type: types[0] ? types[0].key : api.POST_LIMITS.requestType,
        diff: 1,
        hyperpower: styles.length ? styles[0].key : null,
        minParty: 1,
        days: 7,
        gold: 0,
        goods: [],
        wanted: [],
        seed: 1 + (hashStr(String(Date.now())) % 100000),
        picker: null,
        row: 0,
      };
      SoundManager.playOk();
      this._refresh();
    }

    _closeComposer() {
      if (!this._composer) return;
      if (this._composer.picker) { this._composer.picker = null; SoundManager.playCancel(); this._refresh(); return; }
      this._composer = null;
      SoundManager.playCancel();
      this._refresh();
    }

    _draft() {
      const c = this._composer;
      return {
        type: c.type, diff: c.diff, hyperpower: c.hyperpower, minParty: c.minParty,
        days: c.days, gold: c.gold, goods: c.goods, wanted: c.wanted, seed: c.seed,
        boardKey: this._boardKey,
      };
    }

    // Every control on the sheet, in the order the arrow keys walk them. Each
    // row knows how to draw itself and what left/right and OK do to it, so the
    // keyboard, the pad and the mouse all drive the same list.
    _composerRows() {
      const api = PQ();
      const c = this._composer;
      const isRequest = c.type === api.POST_LIMITS.requestType;
      const rows = [];
      rows.push({ id: "type", label: T('QuestBoard.composeWhat'), kind: "cycle" });
      if (isRequest) rows.push({ id: "wanted", label: T('QuestBoard.composeWanted'), kind: "list" });
      else rows.push({ id: "diff", label: T('QuestBoard.composeDifficulty'), kind: "stars" });
      rows.push({ id: "style", label: T('QuestBoard.composeStyle'), kind: "cycle" });
      rows.push({ id: "gold", label: T('QuestBoard.composePurse'), kind: "money" });
      rows.push({ id: "goods", label: T('QuestBoard.composeGoods'), kind: "list" });
      rows.push({ id: "crew", label: T('QuestBoard.composeCrew'), kind: "number" });
      rows.push({ id: "days", label: T('QuestBoard.composeExpiry'), kind: "number" });
      rows.push({ id: "reword", label: T('QuestBoard.composeReword'), kind: "action" });
      rows.push({ id: "post", label: T('QuestBoard.composePost'), kind: "action" });
      return rows;
    }

    _composerHTML() {
      if (!this._composer) return "";
      const api = PQ();
      const c = this._composer;
      const isRequest = c.type === api.POST_LIMITS.requestType;
      const preview = this._preview();
      const rows = this._composerRows();
      const styles = api.hyperpowerStyles();
      const style = styles.find(s => s.key === c.hyperpower);
      const typeLabel = (api.postableTypes().find(t => t.key === c.type) || {}).label || c.type;

      const wantedValue = api.goodsValue(c.wanted);
      const diff = isRequest ? api.priceDifficulty(wantedValue) : c.diff;
      const rec = { diff, minParty: c.minParty, level: api.medianLevel(), reward: { gold: c.gold, goods: c.goods } };
      const asking = api.askingRate(rec);
      const offered = api.offeredValue(rec);
      const gen = offered / Math.max(1, asking);

      const value = (id) => {
        switch (id) {
          case "type": return esc(typeLabel);
          case "diff": return '<span class="qb-star"></span>'.repeat(c.diff);
          case "style": return style
            ? `${iconHTML(style.icon)}${esc(style.label)}`
            : T('QuestBoard.composeNoStyle');
          case "gold": return esc(api.euros(c.gold));
          case "crew": return T('QuestBoard.crewOf', { n: c.minParty });
          case "days": return T('QuestBoard.composeDays', { n: c.days });
          case "wanted": return this._goodsListHTML(c.wanted, "wanted");
          case "goods": return this._goodsListHTML(c.goods, "goods");
          default: return "";
        }
      };

      const rowsHTML = rows.map((r, i) => {
        const focused = i === c.row && !c.picker ? " focused" : "";
        const act = (r.kind === "action" || r.kind === "list") ? ` data-crow-act="${r.id}"` : "";
        const arrows = (r.kind === "cycle" || r.kind === "stars" || r.kind === "number" || r.kind === "money")
          ? `<span class="qb-c-arrow" data-cdelta="${r.id}:-1">&lsaquo;</span>` +
            `<span class="qb-c-val">${value(r.id)}</span>` +
            `<span class="qb-c-arrow" data-cdelta="${r.id}:1">&rsaquo;</span>`
          : `<span class="qb-c-val">${value(r.id)}</span>`;
        return `<div class="qb-c-row${focused} qb-c-${r.kind}" data-crow="${i}"${act}>
          <span class="qb-c-label">${esc(r.label)}</span>
          <span class="qb-c-field">${arrows}</span>
        </div>`;
      }).join("");

      const money = api.euros(c.gold);
      const escrowLines = [T('QuestBoard.composeEscrowGold', { sum: money })];
      for (const g of c.goods) {
        const obj = g.kind === "w" ? $dataWeapons[g.id] : g.kind === "a" ? $dataArmors[g.id] : $dataItems[g.id];
        if (obj) escrowLines.push(`${g.qty}x ${obj.name}`);
      }
      const rateClass = gen >= 1 ? "good" : (gen >= 0.6 ? "warn" : "bad");

      return `<div id="qb-compose-backdrop"><div id="qb-compose"><div class="qb-c-page">
        <h2>${T('QuestBoard.composeTitle')}</h2>
        <div class="qb-c-intro">${T('QuestBoard.composeIntro')}</div>
        <div class="qb-c-rows">${rowsHTML}</div>
        <div class="qb-d-sec">${T('QuestBoard.composeRate')}</div>
        <div class="qb-c-rate ${rateClass}">
          ${T('QuestBoard.composeRateLine', {
            offered: api.euros(offered), asking: api.euros(asking),
            pct: Math.round(gen * 100),
          })}
        </div>
        <div class="qb-c-note">${T('QuestBoard.composeRateHint')}</div>
        ${isRequest ? `<div class="qb-c-note qb-c-derived">${T('QuestBoard.composeDerivedDiff')}
          <span class="qb-c-val">${'<span class="qb-star"></span>'.repeat(diff)}</span></div>` : ""}
        <div class="qb-d-sec">${T('QuestBoard.composeEscrow')}</div>
        <div class="qb-c-note">${esc(escrowLines.join("  ·  "))}</div>
        <div class="qb-d-sec">${T('QuestBoard.composePreview')}</div>
        ${preview ? `<div class="qb-c-preview">
          <div class="qb-c-prev-title">${esc(preview.title)}</div>
          <div class="qb-c-prev-giver">${esc(preview.giverLabel || "")}</div>
          <div class="qb-c-prev-body">${esc(preview.body)}</div>
          <div class="qb-c-prev-steps">${esc(api.objectiveText(preview)).replace(/\n/g, "<br>")}</div>
        </div>` : `<div class="qb-c-note">${T('QuestBoard.composeNothingYet')}</div>`}
        <div class="qb-d-btns">
          <span class="qb-btn claim" data-crow-act="post">${T('QuestBoard.composePost')}</span>
          <span class="qb-btn" data-close-compose="1">${T('QuestBoard.back')}</span>
        </div>
      </div></div>${this._pickerHTML()}`;
    }

    // The notice as it would read, rebuilt whenever anything that could change
    // the wording moves. Nothing here is written down or paid for.
    //
    // Held against the draft it was written from: an archetype notice costs a
    // full pass of the generator, and the shelf on top of the sheet redraws on
    // every keystroke of its search.
    _preview() {
      const api = PQ();
      const c = this._composer;
      if (!c) return null;
      if (c.type === api.POST_LIMITS.requestType && !c.wanted.length) return null;
      const draft = this._draft();
      const key = JSON.stringify(draft);
      if (this._previewKey === key) return this._previewCache;
      this._previewKey = key;
      try {
        this._previewCache = api.previewPost(draft);
      } catch (e) {
        console.error("[QuestBoardUI] notice preview failed", e);
        this._previewCache = null;
      }
      return this._previewCache;
    }

    _goodsListHTML(list, which) {
      if (!list.length) {
        return `<span class="qb-c-empty">${T('QuestBoard.composeAddSomething')}</span>`;
      }
      return list.map((g, i) => {
        const obj = g.kind === "w" ? $dataWeapons[g.id] : g.kind === "a" ? $dataArmors[g.id] : $dataItems[g.id];
        if (!obj) return "";
        return `<span class="qb-c-chip" data-cdrop="${which}:${i}">${iconHTML(obj.iconIndex)}` +
          `${esc(obj.name)} <b>&times;${g.qty}</b> <span class="qb-c-x">&times;</span></span>`;
      }).join("");
    }

    // ---- the shelf a notice picks things off ----
    _openPicker(which) {
      this._composer.picker = { which, query: "", page: 0 };
      SoundManager.playOk();
      this._refresh();
    }

    // Anything the party could be asked for is anything with a price on it; a
    // reward can only be something they actually have in the pack.
    _pickerEntries() {
      const p = this._composer.picker;
      if (p.all) {
        const q = p.query.trim().toLowerCase();
        return q ? p.all.filter(e => e.obj.name.toLowerCase().includes(q)) : p.all;
      }
      const wanted = p.which === "wanted";
      const out = [];
      const push = (kind, db) => {
        for (let id = 1; id < db.length; id++) {
          const obj = db[id];
          if (!obj || !obj.name) continue;
          if (wanted) {
            if (!(obj.price > 0)) continue;
          } else if ($gameParty.numItems(obj) <= 0) continue;
          out.push({ kind, id, obj });
        }
      };
      push("i", $dataItems);
      push("w", $dataWeapons);
      push("a", $dataArmors);
      out.sort((a, b) => (a.obj.price || 0) - (b.obj.price || 0));
      p.all = out;
      return this._pickerEntries();
    }

    _pickerHTML() {
      const c = this._composer;
      if (!c || !c.picker) return "";
      const api = PQ();
      const p = c.picker;
      const all = this._pickerEntries();
      const PER = 40;
      const pages = Math.max(1, Math.ceil(all.length / PER));
      p.page = Math.max(0, Math.min(p.page, pages - 1));
      const slice = all.slice(p.page * PER, p.page * PER + PER);
      const rows = slice.map(e => {
        const held = $gameParty.numItems(e.obj);
        return `<div class="qb-p-row" data-cpick="${e.kind}:${e.id}">
          ${iconHTML(e.obj.iconIndex)}
          <span class="qb-p-name">${esc(e.obj.name)}</span>
          <span class="qb-p-price">${esc(api.euros(e.obj.price || 0))}</span>
          <span class="qb-p-held">${held > 0 ? T('QuestBoard.composeHeld', { n: held }) : ""}</span>
        </div>`;
      }).join("") || `<div class="qb-c-note">${T('QuestBoard.composeNoMatch')}</div>`;
      return `<div id="qb-pick-backdrop"><div id="qb-pick">
        <div class="qb-p-head">
          <span>${p.which === "wanted" ? T('QuestBoard.composePickWanted') : T('QuestBoard.composePickGoods')}</span>
          <span class="qb-p-search">${T('QuestBoard.composeSearch')}: <b>${esc(p.query) || "&hellip;"}</b></span>
          <span class="qb-p-page">${p.page + 1}/${pages}</span>
        </div>
        <div class="qb-p-list">${rows}</div>
        <div class="qb-d-btns">
          <span class="qb-btn" data-cpage="-1">&lsaquo;</span>
          <span class="qb-btn" data-cpage="1">&rsaquo;</span>
          <span class="qb-btn" data-close-picker="1">${T('QuestBoard.back')}</span>
        </div>
      </div></div>`;
    }

    _pickGoods(kind, id) {
      const c = this._composer;
      const list = c.picker.which === "wanted" ? c.wanted : c.goods;
      const hit = list.find(g => g.kind === kind && g.id === id);
      if (hit) hit.qty = Math.min(99, hit.qty + 1);
      else list.push({ kind, id, qty: 1 });
      SoundManager.playOk();
      this._refresh();
    }

    _dropGoods(which, index) {
      const list = which === "wanted" ? this._composer.wanted : this._composer.goods;
      if (index >= 0 && index < list.length) {
        if (list[index].qty > 1) list[index].qty--;
        else list.splice(index, 1);
      }
      SoundManager.playCancel();
      this._refresh();
    }

    // A purse is nudged in steps that stay useful whatever it is worth: a euro
    // at the bottom of the ladder, a thousand at the top.
    _goldStep(gold) {
      const euro = Math.abs(gold) / 100;
      if (euro < 50) return 100;          // 1 euro
      if (euro < 500) return 1000;        // 10 euros
      if (euro < 5000) return 10000;      // 100 euros
      return 100000;                      // 1000 euros
    }

    _adjustRow(id, dir) {
      const api = PQ();
      const c = this._composer;
      switch (id) {
        case "type": {
          const types = api.postableTypes();
          const i = Math.max(0, types.findIndex(t => t.key === c.type));
          c.type = types[(i + dir + types.length) % types.length].key;
          break;
        }
        case "style": {
          const styles = api.hyperpowerStyles();
          if (!styles.length) break;
          const i = Math.max(0, styles.findIndex(s => s.key === c.hyperpower));
          c.hyperpower = styles[(i + dir + styles.length) % styles.length].key;
          break;
        }
        case "diff": c.diff = Math.max(1, Math.min(5, c.diff + dir)); break;
        case "crew": c.minParty = Math.max(1, Math.min(api.POST_LIMITS.maxCrew, c.minParty + dir)); break;
        case "days": c.days = Math.max(api.POST_LIMITS.minDays,
          Math.min(api.POST_LIMITS.maxDays, c.days + dir)); break;
        case "gold": {
          const step = this._goldStep(c.gold + (dir > 0 ? 1 : -1));
          c.gold = Math.max(0, Math.min($gameParty.gold(), c.gold + step * dir));
          break;
        }
        default: return false;
      }
      SoundManager.playCursor();
      this._refresh();
      return true;
    }

    _activateRow(id) {
      if (id === "wanted" || id === "goods") { this._openPicker(id); return; }
      if (id === "reword") {
        this._composer.seed = 1 + (this._composer.seed * 7919 + 13) % 100000;
        SoundManager.playOk();
        this._refresh();
        return;
      }
      if (id === "post") { this._postNotice(); return; }
      // A value row answers OK by stepping forward, so the pad never has to
      // reach for a second button.
      this._adjustRow(id, 1);
    }

    _postNotice() {
      const api = PQ();
      const res = api.postQuest(this._draft());
      if (!res.ok) {
        SoundManager.playBuzzer();
        if (window.ParchmentToast && res.reason) {
          window.ParchmentToast.show(res.reason, { severity: "warning" });
        }
        return;
      }
      SoundManager.playShop();
      this._composer = null;
      this._focus = 0;
      this._refresh();
    }

    // ---- posted-notice actions ----
    _takePosted(id) {
      const api = PQ();
      const res = api.acceptPostedQuest(id);
      if (!res.ok) {
        SoundManager.playBuzzer();
        if (window.ParchmentToast && res.reason) {
          window.ParchmentToast.show(res.reason, { severity: "warning" });
        }
        return;
      }
      SoundManager.playOk();
      this._detail = null;
      this._refresh();
    }

    _withdrawPosted(id) {
      const api = PQ();
      const res = api.withdrawPost(id);
      if (!res.ok) {
        SoundManager.playBuzzer();
        if (window.ParchmentToast && res.reason) {
          window.ParchmentToast.show(res.reason, { severity: "warning" });
        }
        return;
      }
      SoundManager.playCancel();
      this._detail = null;
      this._refresh();
    }

    _collectPosted(id) {
      const api = PQ();
      const res = api.collectPostedDelivery(id);
      if (!res.ok) { SoundManager.playBuzzer(); return; }
      SoundManager.playShop();
      this._detail = null;
      this._refresh();
    }

    // ---- input ----
    update() {
      super.update();
      if (!this._el) return;

      // The right mouse button is handled by the overlay's contextmenu listener,
      // not here: it fires over the letterboxing too, and taking it from
      // TouchInput as well would back out twice on one click.
      if (this._composer) { this._updateComposer(); return; }

      if (this._detail) {
        if (Input.isTriggered("cancel")) this._closeDetail();
        else if (Input.isTriggered("shift")) this._showOnMap();
        else if (Input.isTriggered("ok") && this._detailIsOffer) this._acceptCurrent();
        return;
      }

      if (Input.isTriggered("cancel")) {
        this._back();
        return;
      }
      if (Input.isTriggered("tab") || Input.isTriggered("pagedown") || Input.isTriggered("pageup")) {
        const order = ["offers", "contracts", "posted"];
        const back = Input.isTriggered("pageup");
        const i = order.indexOf(this._tab);
        this._switchTab(order[(i + (back ? order.length - 1 : 1)) % order.length]);
        return;
      }
      if (Input.isTriggered("ok")) {
        if (this._tab === "posted") { this._openDetail(); return; }
        if (this._tab === "contracts") {
          // OK on a claimable contract collects it directly.
          const q = this._cards()[this._focus];
          if (q && q.status === "claimable") { this._claim(q.qid); return; }
        }
        this._openDetail();
        return;
      }

      const count = this._tab === "posted" ? this._cards().length + 1 : this._cards().length;
      if (!count) return;
      let moved = false;
      const perRow = this._perRow();
      if (Input.isRepeated("right")) { this._focus = (this._focus + 1) % count; moved = true; }
      else if (Input.isRepeated("left")) { this._focus = (this._focus - 1 + count) % count; moved = true; }
      else if (Input.isRepeated("down")) { this._focus = Math.min(count - 1, this._focus + perRow); moved = true; }
      else if (Input.isRepeated("up")) { this._focus = Math.max(0, this._focus - perRow); moved = true; }
      if (moved) {
        SoundManager.playCursor();
        this._paintFocus();
      }
    }

    // The sheet is a flat list of controls: up and down walk them, left and
    // right change the one under the cursor, OK acts on it. The shelf on top of
    // it takes typed letters, so a search is just typing.
    _updateComposer() {
      const c = this._composer;
      if (c.picker) { this._updatePicker(); return; }
      if (Input.isTriggered("cancel")) { this._closeComposer(); return; }
      const rows = this._composerRows();
      if (Input.isTriggered("ok")) { this._activateRow(rows[c.row].id); return; }
      if (Input.isRepeated("down")) {
        c.row = (c.row + 1) % rows.length;
        SoundManager.playCursor();
        this._refresh();
        return;
      }
      if (Input.isRepeated("up")) {
        c.row = (c.row - 1 + rows.length) % rows.length;
        SoundManager.playCursor();
        this._refresh();
        return;
      }
      if (Input.isRepeated("right")) { this._adjustRow(rows[c.row].id, 1); return; }
      if (Input.isRepeated("left")) { this._adjustRow(rows[c.row].id, -1); return; }
    }

    _updatePicker() {
      const p = this._composer.picker;
      if (Input.isTriggered("cancel")) {
        this._composer.picker = null;
        SoundManager.playCancel();
        this._refresh();
        return;
      }
      if (Input.isRepeated("right")) { p.page++; SoundManager.playCursor(); this._refresh(); return; }
      if (Input.isRepeated("left")) { p.page = Math.max(0, p.page - 1); SoundManager.playCursor(); this._refresh(); return; }
    }
  }

  window.Scene_QuestBoard = Scene_QuestBoard;

  // ==========================================================================
  // Plugin command
  // ==========================================================================
  PluginManager.registerCommand(PLUGIN, "openQuestBoard", args => {
    const boardKey = (args && args.boardKey) ? String(args.boardKey).trim() : "";
    SceneManager.push(Scene_QuestBoard);
    SceneManager.prepareNextScene(boardKey || null);
  });
})();
