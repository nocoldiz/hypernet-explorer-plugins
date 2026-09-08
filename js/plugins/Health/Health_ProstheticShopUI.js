/*:
 * @target MZ
 * @plugindesc [UI] The prosthetic clinic and the field theatre, drawn.
 * @author Omni-Lex
 * @help
 * The drawing half of Health/Health_ProstheticShop.js (docs/task/ui_fixing.md,
 * "The plugin split"). The plugin decides what the screen says and hands it
 * over as data; this file is the only place that builds a tag for it.
 *
 * The screen is Shape A, the spread, and it is built out of the shared kit and
 * nothing else: .book-spread / .left-page / .right-page, one .page-header-bar
 * carrying the one .back-button, .item-slot rows in a .ui-list, and a right
 * page of .inspect-spec-grid pairs under .inspect-section-title headings with
 * the operation's .inspect-actions strip at the foot of it. Every colour, size
 * and space is a class in css/theme.css.
 */
(function () {
  "use strict";

  const IconSet = (icon, size) => {
    // The one place a sprite sheet offset is written. It is a coordinate, not a
    // colour, so it is the one thing still set on the element.
    const cell = 32;
    return `background:url('img/system/IconSet.png') -${(icon % 16) * cell}px -${Math.floor(icon / 16) * cell}px no-repeat;` +
      `width:${size}px;height:${size}px;`;
  };

  const esc = (text) => String(text === undefined || text === null ? "" : text);

  const fmt = () => (window.ProstheticShop && window.ProstheticShop.text) || {};
  const ring = () => window.ProstheticShop && window.ProstheticShop.ring;

  const ProstheticShopUI = {

    // ------------------------------------------------------------------
    // The whole page
    // ------------------------------------------------------------------
    render(scene) {
      const container = scene._dndContainer;
      if (!container) return;
      const page = scene._page || { title: "", brief: "", kind: scene._viewState };

      container.innerHTML = `
        <div class="book-spread">
          <div class="left-page">
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.onUICancel()">${T('Prosthetics.back')}</div>
              <h2 class="title">${esc(page.title)}</h2>
            </div>
            <p class="ui-prose pshop-brief">${esc(page.brief)}</p>
            <div class="ui-list ui-scroll pshop-list">${this.rows(scene, page)}</div>
          </div>
          <div class="right-page">${this.dossier(scene, scene._selectedActor)}</div>
        </div>
      `;

      // Every patient in the register wears their own face, and so does the one
      // on the facing page.
      if (page.kind === 'party') {
        $gameParty.members().forEach((actor, idx) => this.drawPortrait(actor, `pshop-face-${idx}`));
      }
      if (scene._selectedActor) this.drawPortrait(scene._selectedActor, 'pshop-patient-face');

      const nav = ring();
      if (nav) {
        nav.activate();
        // The cursor lands on the first row of the list rather than on the way
        // out of the screen.
        const first = nav.activeElements.findIndex((el) => el.classList.contains('item-slot'));
        if (first >= 0) {
          nav.focusIndex = first;
          nav.updateFocus();
        }
        scene.onUIFocusChange(nav.focusedRow());
      }
    },

    // ------------------------------------------------------------------
    // The left page: one list, whatever step the flow is on
    // ------------------------------------------------------------------
    rows(scene, page) {
      if (page.kind === 'party') return this.partyRows();
      if (page.kind === 'command') return this.commandRows(page.commands || []);

      const items = scene._activeListItems || [];
      if (items.length === 0) {
        const empty = page.kind === 'install_inventory'
          ? T('Prosthetics.noBodyPartItemsInInventory') : T('Prosthetics.nothingHere');
        return `<div class="ui-empty"><p class="ui-empty-text">${empty}</p></div>`;
      }
      return items.map((item, idx) => this.row(item, idx)).join("");
    },

    partyRows() {
      return $gameParty.members().map((actor, idx) => `
        <div class="item-slot focusable" onclick="SceneManager._scene.selectActor(${idx})">
          <div class="item-slot-icon"><canvas class="pshop-face" id="pshop-face-${idx}" width="48" height="48"></canvas></div>
          <div class="item-slot-info">
            <div class="item-slot-name">${esc(actor.name())}</div>
            <div class="item-slot-meta">
              ${esc(actor.currentClass() ? actor.currentClass().name : T('Prosthetics.classless'))}
              (${T('Prosthetics.levelShort', { level: actor.level })})
            </div>
          </div>
        </div>
      `).join("");
    },

    commandRows(commands) {
      return commands.map((c) => `
        <div class="item-slot focusable" onclick="SceneManager._scene.chooseCommand('${c.cmd}')">
          <div class="item-slot-icon"><span class="pshop-icon" style="${IconSet(c.icon, 32)}"></span></div>
          <div class="item-slot-info"><div class="item-slot-name">${esc(c.label)}</div></div>
        </div>
      `).join("");
    },

    // One row. What is under the name and what stands at the right of it is the
    // only thing that changes from step to step.
    row(item, idx) {
      const t = fmt();
      const blocked = item.alreadyOwned || item.blockedReason || item.vital || item.isCurrentlyInstalled;
      let meta = "";
      let value = "";

      if (item.isSurgeon) {
        meta = T('Prosthetics.surgerySpec', { level: item.levelName }) +
          (item.odds.self ? ` | ${T('Prosthetics.operatingOnSelf')}` : "");
        value = `${item.odds.chance}%`;
      } else if (item.isArchetypeChoice) {
        // Nothing but the name: the catalogue is a list of names.
      } else if (item.isSocket) {
        value = T('Prosthetics.attachTo');
      } else if (item.isImplantSocket) {
        meta = esc(item.currentProstheticName);
      } else if (item.isRemoveOption || item.isProsthetic) {
        meta = esc(item.note);
        value = item.isRemoveOption ? "" : (item.isCurrentlyInstalled ? T('Prosthetics.installed') : t.price(item.cost));
      } else if (item.isRemoveBodypart) {
        meta = (item.statEffect && item.statBonus > 0)
          ? T('Prosthetics.loses', { p1: t.paramName(item.statEffect.param), p2: item.statBonus }) : "";
        value = item.vital ? T('Prosthetics.vitalBadge') : t.price(item.cost);
      } else if (item.isReplaceSelectPart) {
        meta = item.vital
          ? T('Prosthetics.vitalBadge')
          : `${T('Prosthetics.removalFee2')} ${t.price(item.removalFee)}`;
      } else {
        // A part on a shelf, in the pack, or offered as a replacement.
        const bits = [];
        if (item.archetypeLabel) bits.push(`[${esc(item.archetypeLabel)}]`);
        if (item.statEffect) bits.push(`${t.paramName(item.statEffect.param)} +${item.statBonus}`);
        const skills = t.skillNames(item.skillId);
        if (skills) bits.push(skills);
        meta = bits.join(" | ");
        value = item.alreadyOwned
          ? T('Prosthetics.owned')
          : (item.blockedReason || t.price(item.cost));
      }

      const click = item.isArchetypeChoice
        ? `SceneManager._scene.chooseArchetype('${item.key}')`
        : `SceneManager._scene.selectListItem(${idx})`;

      return `
        <div class="item-slot focusable${blocked ? ' pshop-row--blocked' : ''}" data-row="${idx}" onclick="${click}">
          <div class="item-slot-info">
            <div class="item-slot-name">${esc(item.name)}${item.hasImplant ? ` <span class="ui-chip">${T('Prosthetics.implantChip')}</span>` : ""}</div>
            ${meta ? `<div class="item-slot-meta">${meta}</div>` : ""}
          </div>
          ${value ? `<span class="item-slot-count">${value}</span>` : ""}
        </div>
      `;
    },

    // ------------------------------------------------------------------
    // The right page: the patient, read the same way on every step
    // ------------------------------------------------------------------
    dossier(scene, actor) {
      if (!actor) {
        return `
          <div class="ui-detail">
            <div class="ui-empty">
              <h3 class="inspect-section-title">${T('Prosthetics.dossierTitle')}</h3>
              <p class="ui-empty-text">${T('Prosthetics.dossierPrompt')}</p>
            </div>
          </div>
        `;
      }

      const t = fmt();
      const members = $gameParty.members();
      const tabs = members.map((mem, idx) =>
        `<div class="companion-tab${mem === actor ? ' selected' : ''}" onclick="SceneManager._scene.switchSelectedActor(${idx})">${esc(mem.name())}</div>`
      ).join("");
      const switcher = `<div class="companion-switcher companion-switcher--header">${window.CharSwitcher.inner(
        `<div class="companion-tabs-row">${tabs}</div>`, members.length
      )}</div>`;

      const mod = (value) => {
        const m = Math.floor((value - 10) / 2);
        return m >= 0 ? `+${m}` : String(m);
      };
      const ability = (key, paramId) => `
        <div class="inspect-spec-row">
          <span class="inspect-spec-label">${T('Prosthetics.ability.' + key)}</span>
          <span class="inspect-spec-value">${actor.param(paramId)} (${mod(actor.param(paramId))})</span>
        </div>`;

      const gauge = (label, cur, max, rate, band) => `
        <div class="inspect-spec-row inspect-spec-row--stacked">
          <span class="inspect-spec-label">${label}</span>
          <span class="pshop-track"><span class="pshop-fill pshop-fill--${band}" style="width:${Math.floor(rate * 100)}%"></span></span>
          <span class="inspect-spec-value">${cur}/${max}</span>
        </div>`;

      let systems = "";
      if (actor._bodyParts) {
        systems = Object.keys(actor._bodyParts).map((partKey) => {
          const part = actor._bodyParts[partKey];
          const implant = t.implantName(actor._prosthetics ? actor._prosthetics[partKey] : null);
          return `
            <div class="inspect-spec-row">
              <span class="inspect-spec-label">${esc(part.name || partKey)}</span>
              <span class="inspect-spec-value${implant ? ' inspect-spec-value--gain' : ''}">${implant ? esc(implant) : T('Prosthetics.original')}</span>
            </div>`;
        }).join("");
      }

      return `
        <div class="ui-detail">
          ${switcher}
          <div class="ui-detail-head">
            <div class="pshop-portrait"><canvas id="pshop-patient-face" width="48" height="48"></canvas></div>
            <div class="ui-detail-titles">
              <h3>${esc(actor.name())}</h3>
              <div class="ui-detail-sub">
                ${esc(actor.currentClass() ? actor.currentClass().name : T('Prosthetics.classless'))}
                (${T('Prosthetics.levelShort', { level: actor.level })})
              </div>
              <div class="ui-detail-sub">${T('Prosthetics.genderReprLine', {
                gender: t.genderName(actor), repr: t.reproductionName(actor)
              })}</div>
            </div>
          </div>

          <div class="ui-detail-scroll ui-scroll">
            <h3 class="inspect-section-title">${T('Prosthetics.abilities')}</h3>
            <div class="inspect-spec-grid">
              ${ability('str', 2)}${ability('con', 3)}${ability('dex', 6)}
              ${ability('int', 4)}${ability('wis', 5)}${ability('psi', 7)}
            </div>

            <h3 class="inspect-section-title">${T('Prosthetics.vitals')}</h3>
            <div class="inspect-spec-grid pshop-vitals">
              ${gauge(T('Prosthetics.vital.hp'), actor.hp, actor.mhp, actor.hpRate(), 'hp')}
              ${gauge(T('Prosthetics.vital.mp'), actor.mp, actor.mmp, actor.mpRate(), 'mp')}
            </div>

            <h3 class="inspect-section-title">${T('Prosthetics.biologicalSystemsStatus')}</h3>
            <div class="inspect-spec-grid">${systems}</div>
          </div>

          <div class="pshop-briefing"></div>
        </div>
      `;
    },

    // ------------------------------------------------------------------
    // The briefing under the dossier: what this row would cost and do
    // ------------------------------------------------------------------
    renderPreview(scene, model, item) {
      const box = scene._dndContainer && scene._dndContainer.querySelector(".pshop-briefing");
      if (!box) return;
      const nav = ring();

      if (!model) {
        box.innerHTML = "";
        if (nav) nav.actionElements = [];
        return;
      }

      if (model.kind === 'surgeon') {
        box.innerHTML = this.surgeonBriefing(model);
        if (nav) nav.actionElements = [];
        return;
      }

      if (model.kind === 'socket') {
        box.innerHTML = `
          <h3 class="inspect-section-title">${T('Prosthetics.attachmentPoint')}</h3>
          <div class="inspect-spec-row">
            <span class="inspect-spec-label">${T('Prosthetics.attachedTo', { p1: esc(model.socketName) })}</span>
            <span class="inspect-spec-value">${esc(model.fitting)}</span>
          </div>
        `;
        if (nav) nav.actionElements = [];
        return;
      }

      const ledger = model.ledger.field
        ? `
          <div class="inspect-spec-row">
            <span class="inspect-spec-label">${T('Prosthetics.successChance')}</span>
            <span class="inspect-spec-value">${model.ledger.chance}%</span>
          </div>
          <div class="inspect-spec-row inspect-spec-row--stacked">
            <span class="inspect-spec-label">${esc(model.ledger.breakdown)}</span>
          </div>`
        : `
          <div class="inspect-spec-row">
            <span class="inspect-spec-label">${T('Prosthetics.surgeryFee')}</span>
            <span class="inspect-spec-value ${model.ledger.affordable ? 'inspect-spec-value--gain' : 'inspect-spec-value--loss'}">${esc(model.costText)}</span>
          </div>
          <div class="inspect-spec-row">
            <span class="inspect-spec-label">${T('Prosthetics.availableFunds')}</span>
            <span class="inspect-spec-value">${esc(model.ledger.funds)}</span>
          </div>`;

      box.innerHTML = `
        <h3 class="inspect-section-title">${esc(model.title)}</h3>
        <p class="ui-prose pshop-note">${esc(model.desc)}</p>
        ${model.warning ? `<p class="ui-prose pshop-warning">${esc(model.warning)}</p>` : ""}
        <div class="inspect-spec-grid">${ledger}</div>
        <div class="inspect-actions inspect-actions--row">
          <div class="inspect-btn action-focusable${model.enabled ? '' : ' disabled unusable'}"
               onclick="SceneManager._scene.executeSurgeryAction('${model.actionSymbol}')">${esc(model.actionLabel)}</div>
          <div class="inspect-btn action-focusable" onclick="SceneManager._scene.cancelSurgeryAction()">${T('Prosthetics.cancel')}</div>
        </div>
      `;

      if (nav) {
        nav.actionElements = Array.from(box.querySelectorAll('.action-focusable'));
        nav.actionIndex = 0;
        nav.updateFocus();
      }
    },

    // What this pair of hands is worth, spelled out before anybody is opened up.
    surgeonBriefing(model) {
      const odds = model.odds;
      const signed = (n) => (n >= 0 ? `+${n}` : String(n));
      const rows = [
        [T('Prosthetics.surgerySpecShort'), `${model.levelName} (${odds.base}%)`],
        [T('Prosthetics.venueLabel'), `${T('Prosthetics.venue.' + odds.venue)} ${signed(odds.venueMod)}`],
        [T('Prosthetics.weatherLabel'), `${T('Prosthetics.weather.' + odds.weather)} ${signed(odds.weatherMod)}`]
      ];
      if (odds.self) rows.push([T('Prosthetics.operatingOnSelf'), signed(odds.selfMod)]);
      rows.push([T('Prosthetics.successChance'), `${odds.chance}%`]);

      return `
        <h3 class="inspect-section-title">${esc(model.name)}</h3>
        <div class="inspect-spec-grid">
          ${rows.map(([label, value]) => `
            <div class="inspect-spec-row">
              <span class="inspect-spec-label">${label}</span>
              <span class="inspect-spec-value">${value}</span>
            </div>`).join("")}
        </div>
        <p class="ui-prose pshop-note">${T('Prosthetics.failureWarning')}</p>
      `;
    },

    // The walking sprite's front frame, as the patient's face.
    drawPortrait(actor, canvasId) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const bitmap = ImageManager.loadCharacter(actor.characterName());
      const draw = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;

        const isBig = ImageManager.isBigCharacter(actor.characterName());
        const pw = bitmap.width / (isBig ? 3 : 12);
        const ph = bitmap.height / (isBig ? 4 : 8);
        const charIndex = actor.characterIndex();
        const sx = ((charIndex % 4) * 3 + 1) * pw;
        const sy = (Math.floor(charIndex / 4) * 4) * ph;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, 0, 0, canvas.width, canvas.height);
      };

      if (bitmap.isReady()) draw();
      else bitmap.addLoadListener(draw);
    }
  };

  window.ProstheticShopUI = ProstheticShopUI;
})();
