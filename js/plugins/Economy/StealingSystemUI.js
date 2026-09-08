/*:
 * @target MZ
 * @plugindesc Stealing System UI, dialogue-style choice overlay for StealingSystem.js
 * @author Omni-Lex
 * @help Requires StealingSystem.js loaded before this file.
 */

(() => {
  "use strict";

  const SS = () => window.StealingSystem;

  // Return a CSS-var colour matching the steal chance bracket
  function chanceColor(pct) {
    if (pct >= 75) return 'var(--border-success)';
    if (pct >= 50) return 'var(--text-text-alt-14-hover)';
    if (pct >= 25) return 'var(--text-text-alt-9)';
    return 'var(--text-text-alt-8)';
  }

  // ============================================================
  //  Scene_Steal, compact dialogue-style steal overlay
  // ============================================================

  class Scene_Steal extends Scene_MenuBase {
    create() {
      super.create();
      const agi    = $gameParty.leader() ? $gameParty.leader().agi : 1;
      this._items  = SS().scanItems();
      this._agi    = agi;
      this._idx    = 0;
      this._el     = null;
      // One hand in one pocket: the die takes seconds to land, and until it
      // has, no key, pad or click may pick a second thing off the shelf.
      this._busy   = false;
      this._refreshDOM();
    }

    // ── DOM build ─────────────────────────────────────────────

    _refreshDOM() {
      if (this._wrap) { this._wrap.remove(); this._wrap = null; this._el = null; }

      const wrap = document.createElement('div');
      wrap.id = 'steal-overlay';

      const el = document.createElement('div');
      el.id = 'steal-window';
      el.innerHTML = `
        <div class="steal-title">${SS().translate('stealTitle')}</div>
        <div class="steal-choice-list">${this._buildRows()}</div>`;

      wrap.appendChild(el);
      document.body.appendChild(wrap);
      this._wrap = wrap;
      this._el   = el;

      this._attachClicks();
      this._drawIcons();
    }

    _buildRows() {
      if (this._items.length === 0) {
        return `<div class="steal-empty">${T('Steal.nothingNearby')}</div>`;
      }

      // A shelf reads like a pocket: the backpack's own row, part for part
      // (.item-slot), so the mark, the icon, the name and the line under it
      // are the same everywhere in the game. What a pocket spends on weight
      // this spends on the odds, and the count on the right is what the
      // counter has left rather than what the party is carrying.
      return this._items.map((entry, i) => {
        const item     = entry.data;
        const chance   = SS().calcChance(item, this._agi);
        const color    = chanceColor(chance);
        const sel      = i === this._idx ? ' selected' : '';
        const canvasId = `steal-ic-${i}`;
        const rarity   = window.ItemSystemUtils
          ? window.ItemSystemUtils.itemRarityClass(item) : 'rarity--common';
        const stock    = Number.isFinite(entry.stock) ? entry.stock : null;
        const countHTML = stock === null ? ''
          : `<span class="item-slot-count">x${stock}</span>`;
        return `<div class="item-slot steal-choice${sel}" data-idx="${i}"
            data-icon-index="${item.iconIndex}" data-canvas-id="${canvasId}">
          <div class="item-rarity-bar ${rarity}"></div>
          <div class="item-slot-icon">
            <canvas id="${canvasId}" class="item-slot-icon-canvas--sm" width="32" height="32"></canvas>
          </div>
          <div class="item-slot-info">
            <div class="item-slot-name">${item.name}</div>
            <div class="item-slot-meta">
              <span class="steal-choice-pct" style="color:${color}">${chance}%</span>
              ${countHTML}
            </div>
          </div>
        </div>`;
      }).join('');
    }

    // Every row's icon painted out of the IconSet, the same way the backpack
    // and the containers paint theirs.
    _drawIcons() {
      if (!this._el) return;
      const bitmap = ImageManager.loadSystem('IconSet');
      const rows = Array.from(this._el.querySelectorAll('.steal-choice[data-canvas-id]'));
      const draw = () => {
        for (const row of rows) {
          const canvas = document.getElementById(row.getAttribute('data-canvas-id'));
          if (!canvas) continue;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          const iconIndex = parseInt(row.getAttribute('data-icon-index'), 10) || 0;
          ctx.clearRect(0, 0, 32, 32);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(bitmap.canvas, (iconIndex % 16) * 32, Math.floor(iconIndex / 16) * 32,
                        32, 32, 0, 0, 32, 32);
        }
      };
      if (bitmap.isReady()) draw();
      else bitmap.addLoadListener(draw);
    }

    // ── Click / hover wiring ──────────────────────────────────

    _attachClicks() {
      if (!this._el) return;
      this._el.querySelectorAll('.steal-choice').forEach((el, i) => {
        el.addEventListener('mouseenter', () => {
          if (i !== this._idx) { this._idx = i; this._updateHighlight(); }
        });
        el.addEventListener('click', () => {
          if (this._busy) return;
          this._idx = i;
          SoundManager.playOk();
          this._doSteal();
        });
      });
    }

    _updateHighlight() {
      if (!this._el) return;
      this._el.querySelectorAll('.steal-choice').forEach((el, i) => {
        el.classList.toggle('selected', i === this._idx);
      });
    }

    // ── Steal action ──────────────────────────────────────────

    async _doSteal() {
      if (this._busy) return;
      const entry  = this._items[this._idx];
      if (!entry) return;
      this._busy = true;
      // The choice is spent the moment it is made: the list comes off the page
      // before the die is thrown, so nothing is left on screen to pick again.
      this._closeDOM();
      const item   = entry.data;
      const chance  = SS().calcChance(item, this._agi);
      const modifier = SS().rollModifier(this._agi);
      const success = await SS().performSteal(chance, { actionName: 'Shop Shoplift', modifier });

      $gameVariables.setValue(79, item.price || 0);

      if (success) {
        $gameParty.gainItem(item, 1, false);
        SS().reduceStock(entry);
        window.skipLocalization = true;
        $gameMessage.add(`${SS().translate('stealSuccess')} ${item.name}!`);
        window.skipLocalization = false;
      } else {
        $gameTemp.reserveCommonEvent(125);
      }

      this.popScene();
    }

    // ── Input loop ────────────────────────────────────────────

    update() {
      super.update();
      // While the die is in the air the scene answers to nothing: the attempt
      // has already been made, and the scene closes itself once it lands.
      if (this._busy) return;
      const len = this._items.length;

      if (len === 0) {
        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) { SoundManager.playCancel(); this.popScene(); }
        return;
      }

      if (Input.isRepeated('down') || Input.isRepeated('s')) {
        if (this._idx < len - 1) { this._idx++; SoundManager.playCursor(); this._updateHighlight(); }
      }
      if (Input.isRepeated('up') || Input.isRepeated('w')) {
        if (this._idx > 0)       { this._idx--; SoundManager.playCursor(); this._updateHighlight(); }
      }
      if (Input.isTriggered('ok')) {
        SoundManager.playOk();
        this._doSteal();
      }
      if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        this.popScene();
      }
    }

    // ── Teardown ──────────────────────────────────────────────

    terminate() {
      this._closeDOM();
      super.terminate();
    }

    _closeDOM() {
      if (this._wrap) { this._wrap.remove(); this._wrap = null; this._el = null; }
    }
  }

  window.Scene_Steal = Scene_Steal;

})();
