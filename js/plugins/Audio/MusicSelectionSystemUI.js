/*:
 * @target MZ
 * @plugindesc Music Selection System UI, HTML book-spread for MusicSelectionSystem.js
 * @author Omni-Lex
 * @help Requires MusicSelectionSystem.js loaded before this file.
 */

(() => {
  "use strict";

  const MSS = () => window.MusicSelectionSystem;

  // ============================================================
  //  Scene_MusicSelection, book-spread track selector
  // ============================================================

  class Scene_MusicSelection extends Scene_MenuBase {
    create() {
      super.create();
      const tracks = MSS().MUSIC_TRACKS;
      this._tracks = tracks;
      // Start cursor on the currently saved track
      this._idx = Math.max(0, tracks.findIndex(t => t.value === ConfigManager.battleMusicName));
      this._el  = null;
      this._refreshDOM();
      this._previewTrack(tracks[this._idx]);
    }

    // ── Full DOM rebuild ──────────────────────────────────────

    _refreshDOM() {
      if (this._el) { this._el.remove(); this._el = null; }

      const el = document.createElement('div');
      el.id        = 'music-sel-container';
      el.className = 'book-spread';
      el.innerHTML = `
        <div class="left-page">
          ${this._buildLeft()}
        </div>
        <div class="right-page">
          ${this._buildRight()}
        </div>`;

      document.body.appendChild(el);
      this._el = el;
      this._attachClicks();
    }

    // ── Left page: track list ─────────────────────────────────

    _buildLeft() {
      const saved = ConfigManager.battleMusicName;
      const rows  = this._tracks.map((t, i) => {
        const isSaved = t.value === saved;
        const sel  = i === this._idx ? ' selected' : '';
        const mark = isSaved ? '<span class="ms-saved-mark">►</span>' : '<span class="ms-saved-mark ms-mark-empty"></span>';
        const comp = t.composer ? `<span class="ms-composer">${t.composer}</span>` : '';
        return `<div class="item-slot ms-track-row${sel}" data-idx="${i}">
          ${mark}
          <span class="ms-track-name">${t.name}</span>
          ${comp}
        </div>`;
      }).join('');

      return `
        <div class="inspect-section-title">${T('MusicSelection.battleMusic')}</div>
        <div class="ms-track-list">${rows}</div>`;
    }

    // ── Right page: selected track detail ─────────────────────

    _buildRight() {
      const t      = this._tracks[this._idx];
      const saved  = ConfigManager.battleMusicName;
      if (!t) return '';

      const isNone   = t.value === MSS().MUSIC_NONE;
      const isMap    = t.value === MSS().MUSIC_MAP;
      const isRandom = t.value === MSS().MUSIC_RANDOM;
      const isSaved  = t.value === saved;

      let descHTML;
      if (isNone)        descHTML = `<p class="inspect-lore">${T('MusicSelection.noMusic')}</p>`;
      else if (isRandom) descHTML = `<p class="inspect-lore">${T('MusicSelection.randomEachBattle')}</p>`;
      else if (isMap)    descHTML = `<p class="inspect-lore">${T('MusicSelection.continueMap')}</p>`;
      else               descHTML = `<p class="inspect-lore">${T('MusicSelection.playingAsBattle')}</p>`;

      const compHTML = t.composer
        ? `<div class="inspect-spec-row"><span class="inspect-spec-label">${T('MusicSelection.composer')}</span><span class="inspect-spec-value">${t.composer}</span></div>`
        : '';

      const savedBadge = isSaved
        ? `<div class="ms-active-badge">${T('MusicSelection.currentSelection')}</div>`
        : '';

      const noteAnim = (!isNone && !isMap)
        ? `<div class="ms-note-anim">♪</div>`
        : '';

      return `
        <div class="inspect-header">
          <span class="inspect-name">${t.name}</span>
        </div>
        ${descHTML}
        ${compHTML}
        ${savedBadge}
        ${noteAnim}
        <div class="ms-ok-hint">${T('MusicSelection.ui.pressOkHint')}</div>`;
    }

    // ── Click / hover wiring ──────────────────────────────────

    _attachClicks() {
      if (!this._el) return;
      this._el.querySelectorAll('.ms-track-row').forEach((el, i) => {
        el.addEventListener('mouseenter', () => {
          if (i !== this._idx) { this._idx = i; this._onNavigate(); }
        });
        el.addEventListener('click', () => { this._idx = i; this._confirmSelection(); });
      });
    }

    // ── Highlight + right-page update ─────────────────────────

    _updateHighlight() {
      if (!this._el) return;
      this._el.querySelectorAll('.ms-track-row').forEach((el, i) => {
        el.classList.toggle('selected', i === this._idx);
      });
    }

    _updateRight() {
      const right = this._el ? this._el.querySelector('.right-page') : null;
      if (right) right.innerHTML = this._buildRight();
    }

    _onNavigate() {
      this._previewTrack(this._tracks[this._idx]);
      this._updateHighlight();
      this._updateRight();
      const sel = this._el && this._el.querySelector('.ms-track-row.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    // ── Audio preview ─────────────────────────────────────────

    _previewTrack(track) {
      if (!track) return;
      // Random auditions one of its draws rather than staying silent.
      MSS().previewTrackValue(track.value, 60);
    }

    // ── Confirm and save ──────────────────────────────────────

    _confirmSelection() {
      const track = this._tracks[this._idx];
      if (!track) return;
      ConfigManager.battleMusicName = track.value;
      ConfigManager.save();
      SoundManager.playOk();
      MSS().previewTrackValue(track.value, 90);
      // Rebuild left to show new ► marker
      const left = this._el ? this._el.querySelector('.left-page') : null;
      if (left) {
        left.innerHTML = this._buildLeft();
        this._attachClicks();  // re-wire after innerHTML swap
      }
      this._updateRight();
    }

    // ── Input loop ────────────────────────────────────────────

    update() {
      super.update();
      const len = this._tracks.length;

      if (Input.isRepeated('down') || Input.isRepeated('s')) {
        if (this._idx < len - 1) { this._idx++; SoundManager.playCursor(); this._onNavigate(); }
      }
      if (Input.isRepeated('up') || Input.isRepeated('w')) {
        if (this._idx > 0) { this._idx--; SoundManager.playCursor(); this._onNavigate(); }
      }
      if (Input.isTriggered('ok')) {
        this._confirmSelection();
        this.popScene();
      }
      if (Input.isTriggered('cancel')) {
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

  window.Scene_MusicSelection = Scene_MusicSelection;

})();
