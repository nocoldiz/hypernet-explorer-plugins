/*:
 * @target MZ
 * @plugindesc Show States UI, HTML book-spread for ShowStates.js
 * @author Omni-Lex
 * @help Requires ShowStates.js loaded before this file.
 *
 * Scene_StateList renders the status effect compendium in the standard
 * parchment book-spread layout used by the other menus: full-screen backdrop,
 * left page = header bar + scrollable list, right page = inspect panel.
 *
 * Navigation: up/down (WS) move, left/right page by ten, Esc closes.
 */

(() => {
  "use strict";

  const SS = () => window.ShowStates;

  const ICON_SIZE = 32;
  const ICON_COLS = 16;
  const PAGE_JUMP = 10;

  const tr = (text) => {
    if (!text) return '';
    return typeof window.translateText === 'function' ? window.translateText(text) : text;
  };

  const paramName = (id) => (['HP', 'MP', 'STR', 'CON', 'INT', 'WIS', 'DEX', 'PSI'][id] || T('Inventory.spec.stat'));

  function drawIcon(canvas, iconIdx) {
    if (!iconIdx) return;
    const bm = ImageManager.loadSystem('IconSet');
    const render = () => {
      if (!bm || !bm.isReady()) return;
      const sx  = (iconIdx % ICON_COLS) * ICON_SIZE;
      const sy  = Math.floor(iconIdx / ICON_COLS) * ICON_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bm.canvas, sx, sy, ICON_SIZE, ICON_SIZE, 0, 0, canvas.width, canvas.height);
    };
    if (bm.isReady()) render();
    else bm.addLoadListener(render);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\C\[\d+\]/gi, '')
      .replace(/\\I\[\d+\]/gi, '')
      .replace(/\\N\[\d+\]/gi, '')
      .trim();
  }

  // ── State data readers ──────────────────────────────────────

  // <Hex: #RRGGBB> tints the name, same tag the battle HUD reads.
  function stateColor(s) {
    if (!s || !s.note) return '';
    const m = s.note.match(/<Hex:\s*(#[0-9A-Fa-f]{3,8})>/i);
    return m ? m[1] : '';
  }

  // The tint is shown as a swatch, never as the ink: several state colours are
  // near-black and would vanish into the parchment page.
  function swatch(s) {
    const color = stateColor(s);
    return color ? `<span class="sl-swatch" style="background:${color}"></span>` : '';
  }

  // Everything in the note that is not a tag, if an author wrote prose there.
  function stateProse(s) {
    if (!s || !s.note) return '';
    return s.note.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function restrictionLabel(s) {
    const list = T.list('Battle.states.restrictions');
    return list[s.restriction] || list[0] || '';
  }

  function durationText(s) {
    if (!s.autoRemovalTiming) return T('Battle.states.durationPersistent');
    if (s.minTurns === s.maxTurns) {
      return s.minTurns === 1 ? T('Battle.states.turn1') : T('Battle.states.turnsN', { n: s.minTurns });
    }
    return T('Battle.states.turnsRange', { min: s.minTurns, max: s.maxTurns });
  }

  function removalTimingText(s) {
    const list = T.list('Battle.states.removalTiming');
    return list[s.autoRemovalTiming] || list[0] || '';
  }

  // Trait codes shared with the inventory inspect panel, so the wording of a
  // stat change reads the same wherever the player meets it.
  function traitLines(s) {
    const out = [];
    (s.traits || []).forEach(t => {
      const val = t.value, did = t.dataId;
      let desc = '';
      if      (t.code === 11) { const el = $dataSystem.elements[did]; desc = T('Inventory.trait.resistance', { element: el || T('Inventory.trait.elementFallback'), pct: Math.round(val * 100) }); }
      else if (t.code === 12) desc = T('Inventory.trait.debuffRate', { param: paramName(did), pct: Math.round(val * 100) });
      else if (t.code === 13) { const st = $dataStates[did]; if (st && st.name) desc = T('Inventory.trait.susceptibility', { state: tr(st.name), pct: Math.round(val * 100) }); }
      else if (t.code === 14) { const st = $dataStates[did]; if (st && st.name) desc = T('Inventory.trait.resistState', { state: tr(st.name) }); }
      else if (t.code === 21) desc = T('Inventory.trait.paramRate', { param: paramName(did), pct: Math.round(val * 100) });
      else if (t.code === 22) { const exN = T.list('Inventory.xparam'); desc = T('Inventory.trait.xparamLine', { name: exN[did] || T('Inventory.trait.specialStat'), value: `${val >= 0 ? '+' : ''}${Math.round(val * 100)}` }); }
      else if (t.code === 23) { const spN = T.list('Inventory.sparam'); desc = T('Inventory.trait.sparamLine', { name: spN[did] || T('Inventory.trait.specialProperty'), pct: Math.round(val * 100) }); }
      else if (t.code === 31) { const el = $dataSystem.elements[did]; desc = T('Inventory.trait.attackElement', { element: el || T('Inventory.trait.physicalFallback') }); }
      else if (t.code === 32) { const st = $dataStates[did]; if (st && st.name) desc = T('Battle.states.trait.attackState', { state: tr(st.name), pct: Math.round(val * 100) }); }
      else if (t.code === 33) desc = T('Inventory.trait.attackSpeed', { value: `${val > 0 ? '+' : ''}${val}` });
      else if (t.code === 34) desc = T('Inventory.trait.attackTimes', { value: val });
      else if (t.code === 35) { const sk = $dataSkills[did]; if (sk && sk.name) desc = T('Battle.states.trait.attackSkill', { skill: tr(sk.name) }); }
      else if (t.code === 41) { const st = $dataSystem.skillTypes[did]; if (st) desc = T('Battle.states.trait.addSkillType', { type: tr(st) }); }
      else if (t.code === 42) { const st = $dataSystem.skillTypes[did]; if (st) desc = T('Battle.states.trait.sealSkillType', { type: tr(st) }); }
      else if (t.code === 43) { const sk = $dataSkills[did]; if (sk && sk.name) desc = T('Battle.states.trait.addSkill', { skill: tr(sk.name) }); }
      else if (t.code === 44) { const sk = $dataSkills[did]; if (sk && sk.name) desc = T('Battle.states.trait.sealSkill', { skill: tr(sk.name) }); }
      else if (t.code === 61) desc = T('Battle.states.trait.actionTimes', { pct: Math.round(val * 100) });
      else if (t.code === 62 && did === 0) desc = T('Battle.states.trait.autoBattle');
      else if (t.code === 62 && did === 1) desc = T('Battle.states.trait.guard');
      else if (t.code === 62 && did === 2) desc = T('Battle.states.trait.substitute');
      else if (t.code === 62 && did === 3) desc = T('Battle.states.trait.preserveTp');
      if (desc) out.push(desc);
    });
    return out;
  }

  function removalLines(s) {
    const L = SS().L;
    const out = [];
    if (s.removeAtBattleEnd)   out.push(L.atBattleEnd);
    if (s.removeByRestriction) out.push(L.byRestriction);
    if (s.removeByDamage)      out.push(T('Battle.states.byDamageChance', { label: L.byDamage, pct: s.chanceByDamage }));
    if (s.removeByWalking)     out.push(T('Battle.states.byWalkingSteps', { label: L.byWalking, steps: s.stepsToRemove }));
    return out;
  }

  function messageLines(s) {
    const who = T('Battle.states.someone');
    const fmt = (msg) => (msg ? escHtml(tr(msg).replace(/%1/g, who)) : '');
    const rows = [
      { label: T('Battle.states.msgOnActor'), text: fmt(s.message1) },
      { label: T('Battle.states.msgOnEnemy'), text: fmt(s.message2) },
      { label: T('Battle.states.msgPersist'), text: fmt(s.message3) },
      { label: T('Battle.states.msgRemoved'), text: fmt(s.message4) },
    ];
    return rows.filter(r => r.text);
  }

  function affectedMembers(s) {
    if (!$gameParty) return [];
    return $gameParty.members().filter(m => m.isStateAffected(s.id));
  }

  // ============================================================
  //  window.StateTip, the hover explanation
  // ============================================================
  // A status tag on a battle card is one word, and one word never said what
  // the status DOES. The compendium page already knows how to read a state,
  // so the same readers answer the hover: the authored line first, then the
  // effects the traits spell out, how long it lasts and what lifts it.
  //
  // A chip is marked with StateTip.mark(el, ...) rather than given listeners
  // of its own: the HUD pools its elements and hands the same node back as a
  // different chip a frame later, so the listening is done once, on the
  // document, and the chip only ever carries the data.

  const TIP_ID = 'state-tip-popup';
  const TIP_MARGIN = 12;

  // The authored sentence for a state, keyed by its English database name the
  // way every other database bank is keyed. Falls back to whatever prose an
  // author left in the note field.
  function stateDescription(s) {
    if (!s) return '';
    let bank = {};
    try { bank = (window.T && window.T.obj) ? window.T.obj('Battle.states.desc') : {}; } catch (e) { bank = {}; }
    const line = bank && (bank[s.name] || bank[String(s.id)]);
    return line || stateProse(s);
  }

  // Everything the hover says about a state, as rows of { label, text }.
  function stateTipRows(s) {
    const rows = [];
    const effects = traitLines(s);
    if (effects.length) rows.push({ label: T('Battle.states.effectsHeader'), text: effects.join(', ') });
    rows.push({ label: T('Battle.states.duration'), text: durationText(s) });
    const conds = removalLines(s);
    if (conds.length) rows.push({ label: SS().L.removalHeader, text: conds.join(', ') });
    return rows;
  }

  function tipBodyFor(s) {
    const desc = stateDescription(s);
    const parts = [];
    if (desc) parts.push(`<div class="state-tip-desc">${escHtml(desc)}</div>`);
    for (const row of stateTipRows(s)) {
      parts.push(`<div class="state-tip-row"><span class="state-tip-label">${escHtml(row.label)}</span>${escHtml(row.text)}</div>`);
    }
    return parts.join('');
  }

  function tipElement() {
    let el = document.getElementById(TIP_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = TIP_ID;
    el.className = 'state-tip';
    document.body.appendChild(el);
    return el;
  }

  function hideTip() {
    const el = document.getElementById(TIP_ID);
    if (el) el.classList.remove('state-tip--on');
  }

  // Pinned to the marked chip, above it when there is room and below it when
  // there is not, and never off the side of the window.
  function placeTip(el, anchor) {
    const r = anchor.getBoundingClientRect();
    el.style.left = '0px';
    el.style.top = '0px';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(TIP_MARGIN, Math.min(x, window.innerWidth - w - TIP_MARGIN));
    let y = r.top - h - 8;
    if (y < TIP_MARGIN) y = Math.min(r.bottom + 8, window.innerHeight - h - TIP_MARGIN);
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
  }

  function showTip(anchor) {
    const title = anchor.getAttribute('data-tip-title') || '';
    const body = anchor.getAttribute('data-tip-body') || '';
    if (!title && !body) return;
    const el = tipElement();
    el.innerHTML =
      (title ? `<div class="state-tip-title">${escHtml(title)}</div>` : '') +
      (body || '');
    const ink = anchor.getAttribute('data-tip-ink');
    if (ink) el.style.setProperty('--state-tip-ink', ink);
    else el.style.removeProperty('--state-tip-ink');
    el.classList.add('state-tip--on');
    placeTip(el, anchor);
  }

  let _listening = false;
  function listen() {
    if (_listening || typeof document === 'undefined') return;
    _listening = true;
    const marked = (node) => (node && node.closest) ? node.closest('[data-tip-title],[data-tip-body]') : null;
    document.addEventListener('mouseover', (ev) => {
      const el = marked(ev.target);
      if (el) showTip(el); else hideTip();
    }, true);
    document.addEventListener('mouseout', (ev) => {
      if (marked(ev.target)) hideTip();
    }, true);
    // A chip that is torn down or scrolled away under a still hand leaves the
    // hover standing, so any click and any wheel puts it away too.
    document.addEventListener('mousedown', hideTip, true);
    document.addEventListener('wheel', hideTip, true);
  }

  window.StateTip = {
    // Mark an element as explainable. Either { stateId } for a database state,
    // or { title, body } for anything else that wears a chip (the class
    // gimmick counters live in BattleSystemPassiveSkills and pass their own).
    mark(el, opts) {
      if (!el || !opts) return el;
      listen();
      if (opts.stateId) {
        const s = $dataStates && $dataStates[opts.stateId];
        if (!s) return el;
        el.setAttribute('data-tip-title', tr(s.name));
        el.setAttribute('data-tip-body', tipBodyFor(s));
        const hex = stateColor(s);
        if (hex) el.setAttribute('data-tip-ink', hex);
        else el.removeAttribute('data-tip-ink');
        return el;
      }
      if (opts.title) el.setAttribute('data-tip-title', opts.title);
      else el.removeAttribute('data-tip-title');
      if (opts.text) el.setAttribute('data-tip-body', `<div class="state-tip-desc">${escHtml(opts.text)}</div>`);
      else if (opts.body) el.setAttribute('data-tip-body', opts.body);
      else el.removeAttribute('data-tip-body');
      if (opts.ink) el.setAttribute('data-tip-ink', opts.ink);
      else el.removeAttribute('data-tip-ink');
      return el;
    },
    // The pooled HUD elements come back as something else a frame later.
    clear(el) {
      if (!el) return el;
      el.removeAttribute('data-tip-title');
      el.removeAttribute('data-tip-body');
      el.removeAttribute('data-tip-ink');
      return el;
    },
    describe: stateDescription,
    hide: hideTip,
  };

  // ============================================================
  //  Scene_StateList, book-spread state inspector
  // ============================================================

  class Scene_StateList extends Scene_MenuBase {
    create() {
      super.create();
      this._states = SS().getStates();
      this._idx    = 0;
      this._el     = null;
      this._buildDOM();
    }

    // ── Container + one-time skeleton ─────────────────────────

    _buildDOM() {
      if (this._el) { this._el.remove(); this._el = null; }
      const el = document.createElement('div');
      el.id = 'state-list-container';
      el.style.opacity    = '0';
      el.style.transition = 'opacity 0.22s ease-out';
      el.innerHTML = `
        <div class="book-spread">
          <div class="left-page">
            <div class="page-header-bar">
              <div class="back-button focusable" id="sl-back" tabindex="0">${T('Battle.states.back')}</div>
              <h2 class="title">${T('Battle.states.statusEffects')}</h2>
            </div>
            <div class="sl-list" id="sl-list">${this._buildRows()}</div>
            <div class="sl-footer">
              <span>${T('Battle.states.countLabel', { n: this._states.length })}</span>
            </div>
          </div>
          <div class="right-page" id="sl-detail">${this._buildDetail()}</div>
        </div>`;
      document.body.appendChild(el);
      this._el = el;
      this._attachEvents();
      this._renderIcons(el);
      setTimeout(() => { if (this._el) this._el.style.opacity = '1'; }, 16);
    }

    // ── Left page: state rows ─────────────────────────────────

    _buildRows() {
      if (!this._states.length) return `<p class="item-grid-empty">${T('Battle.states.noStates')}</p>`;
      return this._states.map((s, i) => {
        const sel     = i === this._idx ? ' selected' : '';
        const held    = affectedMembers(s).length;
        const badge   = held ? `<span class="item-slot-count">${held}</span>` : '';
        return `<div class="item-slot sl-row${sel} focusable" data-idx="${i}" tabindex="0">
          <div class="item-slot-icon"><canvas class="sl-icon" data-icon="${s.iconIndex}" width="32" height="32"></canvas></div>
          <div class="item-slot-info">
            <div class="item-slot-name">${swatch(s)}${escHtml(tr(s.name))}</div>
            <div class="item-slot-meta">
              <span>${escHtml(durationText(s))}</span>
              <span>${escHtml(restrictionLabel(s))}</span>
            </div>
          </div>
          ${badge}
        </div>`;
      }).join('');
    }

    // ── Right page: selected state dossier ────────────────────

    _buildDetail() {
      const s = this._states[this._idx];
      if (!s) return `<p class="item-grid-empty">${T('Battle.states.selectPrompt')}</p>`;

      const prose  = stateDescription(s);
      const traits = traitLines(s);
      const conds  = removalLines(s);
      const msgs   = messageLines(s);
      const held   = affectedMembers(s);

      const section = (title, body) => body
        ? `<div class="inspect-section-title">${title}</div>${body}`
        : '';
      const bullets = (lines) => lines.map(l => `<div class="inspect-bullet-item">${escHtml(l)}</div>`).join('');

      return `
        <div class="inspect-header">
          <div class="inspect-frame"><canvas class="sl-icon-lg" data-icon="${s.iconIndex}" width="48" height="48"></canvas></div>
          <div class="inspect-title-box">
            <h3 class="inspect-name">${swatch(s)}${escHtml(tr(s.name))}</h3>
            <div class="inspect-rarity">${escHtml(restrictionLabel(s))}</div>
          </div>
        </div>
        <div class="inspect-meta-grid">
          <div class="inspect-meta-item"><span>${T('Battle.states.duration')}</span><span class="inspect-meta-val">${escHtml(durationText(s))}</span></div>
          <div class="inspect-meta-item"><span>${T('Battle.states.expires')}</span><span class="inspect-meta-val">${escHtml(removalTimingText(s))}</span></div>
          <div class="inspect-meta-item"><span>${T('Battle.states.priority')}</span><span class="inspect-meta-val">${s.priority}</span></div>
        </div>
        <div class="inspect-lore sl-detail-body">
          ${prose ? `<p class="sl-note">${escHtml(prose)}</p>` : ''}
          ${section(T('Battle.states.effectsHeader'), traits.length
            ? bullets(traits)
            : `<div class="sl-empty-line">${T('Battle.states.noEffects')}</div>`)}
          ${section(SS().L.removalHeader, conds.length
            ? bullets(conds)
            : `<div class="sl-empty-line">${T('Battle.states.noRemoval')}</div>`)}
          ${section(T('Battle.states.messagesHeader'), msgs.length
            ? msgs.map(m => `<div class="inspect-spec-row"><span class="inspect-spec-label">${m.label}</span><span class="inspect-spec-value">${m.text}</span></div>`).join('')
            : '')}
          ${section(T('Battle.states.affectedHeader'), held.length
            ? bullets(held.map(m => m.name()))
            : `<div class="sl-empty-line">${T('Battle.states.noneAffected')}</div>`)}
        </div>`;
    }

    // ── Icon rendering ────────────────────────────────────────

    _renderIcons(root) {
      const scope = root || this._el;
      if (!scope) return;
      scope.querySelectorAll('canvas[data-icon]').forEach(cv => {
        drawIcon(cv, parseInt(cv.dataset.icon));
      });
    }

    // ── Mouse events ──────────────────────────────────────────

    _attachEvents() {
      if (!this._el) return;

      this._el.addEventListener('mouseover', ev => {
        const row = ev.target.closest('.sl-row');
        if (!row) return;
        const i = parseInt(row.dataset.idx);
        if (!isNaN(i) && i !== this._idx) this._select(i, false);
      });

      this._el.addEventListener('click', ev => {
        if (ev.target.closest('#sl-back')) { SoundManager.playCancel(); this.popScene(); return; }
        const row = ev.target.closest('.sl-row');
        if (!row) return;
        const i = parseInt(row.dataset.idx);
        if (!isNaN(i)) this._select(i, i !== this._idx);
      });

      // The engine swallows document wheel events, so the list scrolls by hand.
      this._el.addEventListener('wheel', ev => {
        ev.preventDefault();
        const list = this._el.querySelector('#sl-list');
        if (list) list.scrollTop += ev.deltaY;
      }, { passive: false });
    }

    // ── Selection ─────────────────────────────────────────────

    _select(idx, playSound) {
      const len = this._states.length;
      if (!len) return;
      const next = Math.max(0, Math.min(len - 1, idx));
      if (next === this._idx) return;
      this._idx = next;
      if (playSound) SoundManager.playCursor();
      this._updateHighlight();
      this._updateDetail();
    }

    _updateHighlight() {
      if (!this._el) return;
      this._el.querySelectorAll('.sl-row').forEach((el, i) => {
        el.classList.toggle('selected', i === this._idx);
      });
      const sel = this._el.querySelector('.sl-row.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    _updateDetail() {
      const panel = this._el && this._el.querySelector('#sl-detail');
      if (!panel) return;
      panel.innerHTML = this._buildDetail();
      this._renderIcons(panel);
    }

    // ── Input loop ────────────────────────────────────────────

    update() {
      super.update();
      if (Input.isRepeated('down') || Input.isRepeated('s')) {
        this._select(this._idx + 1, true);
      } else if (Input.isRepeated('up') || Input.isRepeated('w')) {
        this._select(this._idx - 1, true);
      } else if (Input.isRepeated('right') || Input.isRepeated('pagedown')) {
        this._select(this._idx + PAGE_JUMP, true);
      } else if (Input.isRepeated('left') || Input.isRepeated('pageup')) {
        this._select(this._idx - PAGE_JUMP, true);
      } else if (Input.isTriggered('cancel')) {
        SoundManager.playCancel();
        this.popScene();
      }
    }

    // ── Teardown ──────────────────────────────────────────────

    terminate() {
      if (this._el) { this._el.remove(); this._el = null; }
      super.terminate();
    }
  }

  window.Scene_StateList = Scene_StateList;

})();
