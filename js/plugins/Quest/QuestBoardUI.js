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
      this._btn = -1;               // cursor over the sheet's action strip
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
        if (t.closest(".qb-back")) { this._closeBoard(); return; }
        const sheetAct = t.closest("[data-act]");
        if (sheetAct) {
          this._btn = Number(sheetAct.dataset.btn) || 0;
          this._runSheetAction(sheetAct.dataset.act);
          return;
        }
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
        const tab = t.closest("[data-tab]");
        if (tab) { this._switchTab(tab.dataset.tab); return; }
        const card = t.closest("[data-card]");
        if (card) {
          const idx = Number(card.dataset.card) || 0;
          if (idx !== this._focus) {
            this._focus = idx;
            this._btn = -1;
            SoundManager.playCursor();
            this._refresh();
          }
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
        if (card && !this._composer) {
          const idx = Number(card.dataset.card) || 0;
          if (idx !== this._focus) { this._focus = idx; this._btn = -1; this._refresh(); }
        }
      });
    }

    _refresh() {
      if (!this._el) return;
      const api = PQ();
      const cards = this._cards();
      const slots = this._tab === "posted" ? cards.length + 1 : cards.length;
      this._focus = Math.max(0, Math.min(this._focus, slots - 1));

      const postedCount = api ? api.postedForBoard().length : 0;

      let rowsHTML = "";
      if (this._tab === "posted") {
        // Never empty: the blank sheet is always the first entry.
        rowsHTML = this._postedCardsHTML(cards);
      } else if (!cards.length) {
        rowsHTML = `<div class="ui-empty"><div class="ui-empty-text">${this._tab === "offers"
          ? T('QuestBoard.nothingButRustyPinsAndOlderRegretsComeBackTo')
          : T('QuestBoard.noSignedContracts')}</div></div>`;
      } else if (this._tab === "offers") {
        rowsHTML = cards.map((o, i) => this._offerNoteHTML(o, i)).join("");
      } else {
        rowsHTML = cards.map((q, i) => this._contractNoteHTML(q, i)).join("");
      }

      // The board key is a map group or a destination key; the header reads the
      // place's name ("FrozenStation" -> "Frozen Station").
      const boardName = esc(
        (this._boardKey && window.WorkSystem?.destinationName)
          ? window.WorkSystem.destinationName(this._boardKey)
          : (this._boardKey || "?"));

      const tab = (key, label, n) =>
        `<div class="backpack-tab focusable qb-tab${this._tab === key ? " selected" : ""}"` +
        ` tabindex="0" data-tab="${key}">${label} ${n}</div>`;

      this._el.innerHTML = `
        <div class="book-spread qb-spread">
          <div class="left-page">
            <div class="page-header-bar" id="qb-header">
              <div class="back-button focusable qb-back" tabindex="0">${T('QuestBoard.back')}</div>
              <h2 class="title" id="qb-title">${T('QuestBoard.questBoard')}</h2>
            </div>
            <div class="qb-place" id="qb-sub">${boardName}</div>
            <div class="backpack-tabs" id="qb-tabs">
              ${tab("offers", T('QuestBoard.offers'), this._offers.length)}
              ${tab("contracts", T('QuestBoard.contracts'), api ? api.activeQuests().length : 0)}
              ${tab("posted", T('QuestBoard.posted'), postedCount)}
            </div>
            <div class="ui-list ui-scroll" id="qb-cards">${rowsHTML}</div>
          </div>
          <div class="right-page">${this._detailHTML()}</div>
        </div>
        ${this._composerHTML()}`;
      this._scrollToFocus();
    }

    _scrollToFocus() {
      if (!this._el) return;
      const f = this._el.querySelector(".qb-note.selected");
      if (f) f.scrollIntoView({ block: "nearest" });
    }

    _offerNoteHTML(o, i) {
      const api = PQ();
      const stars = '<span class="qb-star"></span>'.repeat(Math.max(0, Math.min(5, o.diff)));
      const stepsNote = o.steps.length > 1
        ? `<div class="qb-note-steps">${o.steps.length} ${T('QuestBoard.objectives')} ${o.stepMode === "seq" ? T('QuestBoard.inOrder') : T('QuestBoard.anyOrder')}</div>` : "";
      return `<div class="item-slot qb-note focusable ${i === this._focus ? "selected" : ""}"
        tabindex="0" data-card="${i}">
        <div class="qb-note-info">
          <div class="qb-note-head">
            <span class="qb-note-title">${esc(o.title)}</span>
            ${o.deadlineHours ? `<span class="ui-chip qb-urgent">${T('QuestBoard.urgent')} ${o.deadlineHours}h</span>` : ""}
          </div>
          <div class="qb-note-giver">${esc(o.giverLabel)}</div>
          <div class="qb-note-reward">${T('QuestBoard.reward')}${esc(api.rewardText(o, false))}</div>
          ${o.payGold > 0 ? `<div class="qb-note-deadline">${T('QuestBoard.costs')}${esc(api.euros(o.payGold))}</div>` : ""}
          ${stepsNote}
          <div class="qb-diff">${stars}</div>
        </div>
      </div>`;
    }

    _contractNoteHTML(q, i) {
      const api = PQ();
      const claimable = q.status === "claimable";
      const statusText = claimable
        ? T('QuestBoard.readyCollectYourReward')
        : (q.deadlineAt ? T('QuestBoard.timeLeft') + api.hoursLeftText(q.deadlineAt) : T('QuestBoard.inProgress'));
      return `<div class="item-slot qb-note qb-contract focusable ${i === this._focus ? "selected" : ""}"
        tabindex="0" data-card="${i}">
        <div class="qb-note-info">
          <div class="qb-note-head">
            <span class="qb-note-title">${esc(q.title)}</span>
            <span class="ui-chip qb-status ${claimable ? "qb-status--ready" : "qb-status--active"}">${esc(statusText)}</span>
          </div>
          <div class="qb-note-giver">${esc(q.giverLabel)}</div>
          <div class="qb-note-steps">${esc(api.objectiveText(q)).replace(/\n/g, "<br>")}</div>
        </div>
      </div>`;
    }

    // The record the cursor stands on, and what kind of thing it is. Every
    // panel and every action on this screen is answered from this one place.
    _current() {
      if (this._tab === "posted") {
        if (this._focus === 0) return { kind: "new", rec: null };
        const rec = this._postedAt(this._focus);
        return rec ? { kind: "posted", rec } : { kind: "none", rec: null };
      }
      const rec = this._cards()[this._focus];
      if (!rec) return { kind: "none", rec: null };
      return { kind: this._tab === "offers" ? "offer" : "contract", rec };
    }

    // Everything the sheet on the right page can be acted on with, declared
    // once: the markup, the cursor and Confirm all read this one list.
    _sheetButtons() {
      const api = PQ();
      const { kind, rec } = this._current();
      const out = [];
      if (!api) return out;
      if (kind === "new") {
        out.push({ key: "compose", label: T('QuestBoard.writeANotice'), cls: "" });
        return out;
      }
      if (kind === "offer") {
        out.push({
          key: "accept",
          label: rec.payGold > 0
            ? T('QuestBoard.signAndPay') + api.euros(rec.payGold)
            : T('QuestBoard.signTheContract'),
          cls: "",
        });
      } else if (kind === "contract") {
        const claimable = rec.status === "claimable";
        const supplyBlocked = claimable && rec.steps.some(st => st.kind === "supply_items"
          && $gameParty.numItems($dataItems[st.itemId]) < st.qty);
        if (claimable && !supplyBlocked) {
          out.push({ key: "claim", label: `${T('QuestBoard.collect')} ${api.rewardText(rec, false)}`, cls: "" });
        }
        out.push({
          key: this._confirmAbandon === rec.qid ? "abandon-confirm" : "abandon",
          label: this._confirmAbandon === rec.qid
            ? T('QuestBoard.confirmAbandonPenaltiesApply')
            : T('QuestBoard.abandon'),
          cls: " inspect-btn--danger",
        });
      } else if (kind === "posted") {
        const mine = api.isOwnPost(rec);
        if (mine && rec.status === "open") {
          out.push({ key: "withdraw", label: T('QuestBoard.withdrawNotice'), cls: " inspect-btn--danger" });
        } else if (mine && (rec.status === "done" || rec.status === "expired")) {
          out.push({ key: "collect", label: T('QuestBoard.collectNotice'), cls: "" });
        } else if (!mine && rec.status === "open"
          && $gameParty.members().length >= (rec.minParty || 1)) {
          out.push({ key: "take", label: T('QuestBoard.takeNotice'), cls: "" });
        }
      }
      const loc = this._detailLocation();
      if (loc) {
        out.push({ key: "map", label: T('QuestBoard.showOnMapAt', { x: loc.wx, y: loc.wy }), cls: " inspect-btn--secondary" });
      }
      return out;
    }

    _runSheetAction(key) {
      const { kind, rec } = this._current();
      switch (key) {
        case "compose": this._openComposer(); break;
        case "accept": this._acceptCurrent(); break;
        case "claim": this._claim(rec.qid); break;
        case "abandon": this._askAbandon(rec.qid); break;
        case "abandon-confirm": this._doAbandon(rec.qid); break;
        case "take": this._takePosted(rec.id); break;
        case "withdraw": this._withdrawPosted(rec.id); break;
        case "collect": this._collectPosted(rec.id); break;
        case "map": this._showOnMap(); break;
        default: break;
      }
    }

    _moveSheetButton(delta) {
      const btns = this._sheetButtons();
      if (!btns.length) return false;
      const at = this._btn;
      this._btn = at < 0
        ? (delta > 0 ? 0 : btns.length - 1)
        : (at + delta + btns.length) % btns.length;
      SoundManager.playCursor();
      this._refresh();
      return true;
    }

    _triggerSheetButton() {
      const btns = this._sheetButtons();
      const b = btns[this._btn] || btns[0];
      if (!b) return false;
      this._runSheetAction(b.key);
      return true;
    }

    _actionsHTML() {
      const btns = this._sheetButtons();
      if (!btns.length) return "";
      const html = btns.map((b, i) => {
        const on = i === this._btn ? " selected" : "";
        return `<div class="inspect-btn qb-action focusable${b.cls}${on}" tabindex="0"` +
          ` data-act="${esc(b.key)}" data-btn="${i}">${esc(b.label)}</div>`;
      }).join("");
      return `<div class="inspect-actions">${html}</div>`;
    }

    _detailHTML() {
      const api = PQ();
      const { kind, rec } = this._current();
      if (kind === "new") {
        return `<div class="ui-detail qb-detail">
          <div class="ui-detail-head">
            <div class="ui-detail-titles">
              <h3 class="qb-d-title">${T('QuestBoard.writeANotice')}</h3>
            </div>
          </div>
          <div class="ui-detail-scroll ui-scroll">
            <div class="ui-prose">${T('QuestBoard.writeANoticeHint')}</div>
          </div>
          ${this._actionsHTML()}
        </div>`;
      }
      if (!rec || !api) {
        return `<div class="ui-empty"><div class="ui-empty-text">${T('QuestBoard.selectANotice')}</div></div>`;
      }
      const termLines = kind === "posted" ? api.postedTerms(rec) : api.termsLines(rec);
      const terms = termLines.map(line => {
        const warn = /Penalty|Penale|prosecuted|perseguito|cost|Costo/i.test(line);
        return `<div class="qb-d-line${warn ? " qb-d-line--warn" : ""}">${esc(line)}</div>`;
      }).join("");
      const crew = kind === "posted" && (rec.minParty || 1) > 1
        ? `<div class="ui-chip-row"><span class="ui-chip">${T('QuestBoard.crewOf', { n: rec.minParty })}</span>` +
          (api.isOwnPost(rec) ? `<span class="ui-chip qb-mine">${T('QuestBoard.yourNotice')}</span>` : "") +
          `</div>`
        : (kind === "posted" && api.isOwnPost(rec)
          ? `<div class="ui-chip-row"><span class="ui-chip qb-mine">${T('QuestBoard.yourNotice')}</span></div>` : "");
      const shortCrew = kind === "posted" && !api.isOwnPost(rec) && rec.status === "open"
        && $gameParty.members().length < (rec.minParty || 1)
        ? `<div class="qb-d-line qb-d-line--warn">${T('QuestBoard.needsCrew', { n: rec.minParty })}</div>` : "";
      const supplyNote = kind === "contract" && rec.status === "claimable"
        && rec.steps.some(st => st.kind === "supply_items"
          && $gameParty.numItems($dataItems[st.itemId]) < st.qty)
        ? `<div class="qb-d-line qb-d-line--warn">${T('QuestBoard.bringTheGoodsToCollect')}</div>` : "";

      return `<div class="ui-detail qb-detail">
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <h3 class="qb-d-title">${esc(rec.title)}</h3>
            <div class="qb-d-giver">${T('QuestBoard.postedBy')}${esc(rec.giverLabel || "")}</div>
          </div>
        </div>
        <div class="ui-detail-scroll ui-scroll">
          ${crew}
          <div class="ui-prose qb-d-body">${esc(rec.body || "")}</div>
          <div class="inspect-section-title">${T('QuestBoard.objectives2')}</div>
          <div class="ui-prose qb-d-steps">${esc(api.objectiveText(rec))}</div>
          <div class="inspect-section-title">${T('QuestBoard.terms')}</div>
          ${terms}
          ${shortCrew}
          ${supplyNote}
        </div>
        ${this._actionsHTML()}
      </div>`;
    }

    // The world tile the open sheet points at, or null for contracts with nothing
    // to pin (supply runs, arena bouts, market positions).
    _detailLocation() {
      const api = PQ();
      const { rec } = this._current();
      if (!rec || !api || typeof api.questLocation !== "function") return null;
      return api.questLocation(rec);
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
      // Straight to the map rather than popScene: the request can only be
      // carried out by Scene_Map, and the board may sit above a menu stack.
      SceneManager.goto(Scene_Map);
    }


    // ---- actions ----
    _switchTab(tab) {
      if (tab === this._tab) return;
      this._tab = tab;
      this._focus = 0;
      this._btn = -1;
      this._composer = null;
      this._confirmAbandon = null;
      SoundManager.playCursor();
      this._refresh();
    }

    // One step back, whatever is on screen: sheet, pending confirmation, board.
    _back() {
      if (this._composer) { this._closeComposer(); return; }
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
      const { kind, rec } = this._current();
      if (!api || kind !== "offer") return;
      const res = api.acceptOffer(rec);
      if (!res.ok) {
        SoundManager.playBuzzer();
        if (window.ParchmentToast && res.reason) {
          window.ParchmentToast.show(res.reason, { severity: "warning" });
        }
        return;
      }
      SoundManager.playOk();
      this._btn = -1;
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
      let html = `<div class="item-slot qb-note qb-post-new focusable ${this._focus === 0 ? "selected" : ""}"
        tabindex="0" data-card="0">
        <div class="qb-note-info">
          <div class="qb-note-title">${T('QuestBoard.writeANotice')}</div>
          <div class="qb-note-steps">${T('QuestBoard.writeANoticeHint')}</div>
        </div>
      </div>`;
      html += recs.map((rec, i) => this._postedNoteHTML(rec, i + 1)).join("");
      return html;
    }

    _postedNoteHTML(rec, i) {
      const api = PQ();
      const mine = api.isOwnPost(rec);
      const stars = '<span class="qb-star"></span>'.repeat(Math.max(0, Math.min(5, rec.diff)));
      const crew = (rec.minParty || 1) > 1
        ? `<div class="qb-note-crew">${T('QuestBoard.crewOf', { n: rec.minParty })}</div>` : "";
      return `<div class="item-slot qb-note qb-posted focusable ${i === this._focus ? "selected" : ""}"
        tabindex="0" data-card="${i}">
        <div class="qb-note-info">
          <div class="qb-note-head">
            <span class="qb-note-title">${esc(rec.title)}</span>
            ${mine ? `<span class="ui-chip qb-mine">${T('QuestBoard.yourNotice')}</span>` : ""}
          </div>
          <div class="qb-note-giver">${esc(rec.giverLabel || "")}</div>
          <div class="qb-note-reward">${T('QuestBoard.reward')}${esc(api.rewardText(rec, true))}</div>
          <div class="qb-status ${rec.status === "open" ? "qb-status--active" : "qb-status--ready"}">${esc(api.postedStatusLine(rec))}</div>
          ${crew}
          <div class="qb-diff">${stars}</div>
        </div>
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
        const focused = i === c.row && !c.picker ? " selected" : "";
        const act = (r.kind === "action" || r.kind === "list") ? ` data-crow-act="${r.id}"` : "";
        const arrows = (r.kind === "cycle" || r.kind === "stars" || r.kind === "number" || r.kind === "money")
          ? `<span class="qb-c-arrow" data-cdelta="${r.id}:-1">&lsaquo;</span>` +
            `<span class="qb-c-val">${value(r.id)}</span>` +
            `<span class="qb-c-arrow" data-cdelta="${r.id}:1">&rsaquo;</span>`
          : `<span class="qb-c-val">${value(r.id)}</span>`;
        return `<div class="item-slot qb-c-row focusable${focused} qb-c-${r.kind}" tabindex="0" data-crow="${i}"${act}>
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

      return `<div class="ui-overlay" id="qb-compose-backdrop"><div class="ui-panel" id="qb-compose">
        <div class="page-header-bar">
          <div class="back-button focusable" tabindex="0" data-close-compose="1">${T('QuestBoard.back')}</div>
          <h2 class="title">${T('QuestBoard.composeTitle')}</h2>
        </div>
        <div class="ui-panel-body ui-scroll qb-c-page">
        <div class="ui-prose qb-c-intro">${T('QuestBoard.composeIntro')}</div>
        <div class="qb-c-rows">${rowsHTML}</div>
        <div class="inspect-section-title">${T('QuestBoard.composeRate')}</div>
        <div class="qb-c-rate qb-c-rate--${rateClass}">
          ${T('QuestBoard.composeRateLine', {
            offered: api.euros(offered), asking: api.euros(asking),
            pct: Math.round(gen * 100),
          })}
        </div>
        <div class="qb-c-note">${T('QuestBoard.composeRateHint')}</div>
        ${isRequest ? `<div class="qb-c-note qb-c-derived">${T('QuestBoard.composeDerivedDiff')}
          <span class="qb-c-val">${'<span class="qb-star"></span>'.repeat(diff)}</span></div>` : ""}
        <div class="inspect-section-title">${T('QuestBoard.composeEscrow')}</div>
        <div class="qb-c-note">${esc(escrowLines.join("  ·  "))}</div>
        <div class="inspect-section-title">${T('QuestBoard.composePreview')}</div>
        ${preview ? `<div class="qb-c-preview">
          <div class="qb-c-prev-title">${esc(preview.title)}</div>
          <div class="qb-c-prev-giver">${esc(preview.giverLabel || "")}</div>
          <div class="qb-c-prev-body">${esc(preview.body)}</div>
          <div class="qb-c-prev-steps">${esc(api.objectiveText(preview)).replace(/\n/g, "<br>")}</div>
        </div>` : `<div class="qb-c-note">${T('QuestBoard.composeNothingYet')}</div>`}
        </div>
        <div class="inspect-actions">
          <div class="inspect-btn focusable" tabindex="0" data-crow-act="post">${T('QuestBoard.composePost')}</div>
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
        return `<div class="item-slot qb-p-row focusable" tabindex="0" data-cpick="${e.kind}:${e.id}">
          ${iconHTML(e.obj.iconIndex)}
          <span class="qb-p-name">${esc(e.obj.name)}</span>
          <span class="qb-p-price">${esc(api.euros(e.obj.price || 0))}</span>
          <span class="qb-p-held">${held > 0 ? T('QuestBoard.composeHeld', { n: held }) : ""}</span>
        </div>`;
      }).join("") || `<div class="qb-c-note">${T('QuestBoard.composeNoMatch')}</div>`;
      return `<div class="ui-overlay" id="qb-pick-backdrop"><div class="ui-panel" id="qb-pick">
        <div class="page-header-bar">
          <div class="back-button focusable" tabindex="0" data-close-picker="1">${T('QuestBoard.back')}</div>
          <h2 class="title">${p.which === "wanted" ? T('QuestBoard.composePickWanted') : T('QuestBoard.composePickGoods')}</h2>
        </div>
        <div class="qb-p-head">
          <span class="qb-p-search">${T('QuestBoard.composeSearch')}: <b>${esc(p.query) || "&hellip;"}</b></span>
          <span class="qb-p-page">${p.page + 1}/${pages}</span>
        </div>
        <div class="ui-panel-body ui-scroll qb-p-list">${rows}</div>
        <div class="inspect-actions">
          <div class="inspect-btn focusable" tabindex="0" data-cpage="-1">&lsaquo;</div>
          <div class="inspect-btn focusable" tabindex="0" data-cpage="1">&rsaquo;</div>
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
      this._btn = -1;
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
      this._btn = -1;
      this._refresh();
    }

    _collectPosted(id) {
      const api = PQ();
      const res = api.collectPostedDelivery(id);
      if (!res.ok) { SoundManager.playBuzzer(); return; }
      SoundManager.playShop();
      this._btn = -1;
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

      if (Input.isTriggered("cancel")) {
        this._back();
        return;
      }

      // L1 / R1 step the board strip, as they do on every tabbed page.
      if (Input.isTriggered("pagedown") || Input.isTriggered("pageup")) {
        const order = ["offers", "contracts", "posted"];
        const back = Input.isTriggered("pageup");
        const i = order.indexOf(this._tab);
        this._switchTab(order[(i + (back ? order.length - 1 : 1)) % order.length]);
        return;
      }

      const count = this._tab === "posted" ? this._cards().length + 1 : this._cards().length;

      // Up and down walk the notices, and the sheet on the right follows.
      let moved = false;
      if (count) {
        if (Input.isRepeated("down")) { this._focus = Math.min(count - 1, this._focus + 1); moved = true; }
        else if (Input.isRepeated("up")) { this._focus = Math.max(0, this._focus - 1); moved = true; }
      }
      if (moved) {
        this._btn = -1;
        SoundManager.playCursor();
        this._refresh();
        return;
      }

      // Left and right walk the sheet's action strip, Confirm fires it.
      if (Input.isRepeated("right")) { if (this._moveSheetButton(1)) return; }
      else if (Input.isRepeated("left")) { if (this._moveSheetButton(-1)) return; }
      if (Input.isTriggered("ok")) { this._triggerSheetButton(); }
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
