/*:
 * @target MZ
 * @plugindesc Battle HUD: party and enemy bars, weaknesses and body parts.
 * @author Omni-Lex
 *
 * @help
 * The heads-up display of the enhanced battle system. Load it after
 * BattleSystemEnhanced.js. No parameters and no plugin commands.
 */

(() => {

  // A severed-magic world has no magic in it, so a magic meter is a bar that
  // can only ever be full and can never be spent: it is not drawn at all.
  // Read live rather than cached , the answer belongs to the world, and one
  // session can open a different one. See window.MagicNature.
  function hideMpBar() {
    const MN = window.MagicNature;
    return !!(MN && typeof MN.level === "function" && MN.level() === "severed");
  }

  "use strict";
  const pluginName = "BattleSystemEnhancedHUD";
  const parameters = PluginManager.parameters(pluginName);
  const damageColor = String(parameters["DamageColor"] || "#ffffff");
  // The colours a skill's own cost is written in, in the skill list.
  const mpSkillColor = String(parameters["MPSkillColor"] || "#44aaff");
  const tpSkillColor = String(parameters["TPSkillColor"] || "#ff9900");
  const animationSpeed = Number(parameters["AnimationSpeed"] || 5);

  // Enemy bars. Every monster wears the same small bar, alone or in a pack, and
  // they are stacked in one column in the top-right corner. They used to be
  // drawn under each monster's own feet, which put text over the creatures,
  // moved with every lunge and stagger, and left the troop unreadable the
  // moment two of them stood close together; and a lone monster used to get a
  // large bar of its own carrying a full affinity table, an AP orb and a list
  // of its severed limbs, none of which the field needs said twice over. What
  // survived of that table is the part worth acting on: the elements the
  // monster is soft to, as chips in the row under its gauges.
  // The gauges are exactly as long as the party's own: UI/PartyHud.js gives a
  // card 264px and spends 26 of them on the orb gutter, leaving this. The
  // bitmap around them is that length plus the padding and the gutter this
  // side carves out for its own orb (worked out under MINI, below).
  const PARTY_GAUGE_W = 238;
  const miniBarBitmapHeight = 78;
  const miniBarRightMargin = 40; // clear air kept off the right edge
  // Same top edge as the party cards (UI/PartyHud.js hudY, set in plugins.js),
  // so the two columns start at the same height in their opposite corners.
  const miniBarColumnTop = 34;
  const miniBarStackStep = 70; // vertical distance between stacked bars
  const miniBarColumnBottom = 24; // air kept under the lowest bar
  // The AP/TP orb's own footprint (22px plus its 2px border on both sides),
  // matching UI/PartyHud.js's .phud-orb exactly.
  const ORB_SIZE = 22;
  const ORB_GUTTER = 26;
  // How far the orb rides back over the end of the gauges (UI/PartyHud.js
  // stands its own orb over the start of theirs by the same few pixels).
  const ORB_OVERLAP = 8;
  const MINI = {
    padX: 8,
    thickness: 13, // same bar height as PartyHud's .phud-bars-container .phud-bar
    nameH: 18,
    hpY: 19,
  };
  // The party cards lean their bars with CSS skewX(-25deg) (css/game.css
  // .phud-bars-container .phud-bar); the enemy bar is drawn straight onto a
  // canvas instead of transformed, so the same lean is expressed as a
  // per-row pixel offset here.
  MINI.ang = MINI.thickness * Math.tan(25 * Math.PI / 180);
  MINI.mpY = MINI.hpY + MINI.thickness + 3;
  MINI.chipY = MINI.mpY + MINI.thickness + 5;
  const miniBarWidth = Math.round(
    PARTY_GAUGE_W + ORB_GUTTER + MINI.padX * 2 + MINI.ang
  );

  // The same HP thresholds the party cards switch colour at
  // (UI/PartyHud.js WARN_PCT / CRIT_PCT), so a monster's bar reads the same
  // warning a party member's does.
  const WARN_PCT = 30;
  const CRIT_PCT = 15;

  function miniBarGeometry(width) {
    const x = MINI.padX + MINI.ang;
    return { x, w: Math.max(20, width - x - MINI.padX) };
  }

  // The HP/MP gauges themselves stop short of the full column width, leaving
  // room for the AP orb at the right (UI/PartyHud.js carves the same gutter
  // out of its own bars, on the left, via .phud-bars-container padding-left).
  function miniBarGaugeGeometry(width) {
    const full = miniBarGeometry(width);
    return { x: full.x, w: Math.max(20, full.w - ORB_GUTTER) };
  }

  // Compact bars belong to the ordinary battle scene: a tactical map battle
  // (MapBattleMode) builds its own bar layout on Scene_Map, where the monsters
  // are map events rather than battler sprites to sit under.
  function multipleEnemiesInBattle() {
    if (!$gameTroop || $gameTroop.members().length <= 1) return false;
    return SceneManager._scene instanceof Scene_Battle;
  }

  let _footPosScratch = null;

  // Where a battler stands on screen, in scene coordinates. In a 3D battle the
  // 2D sprite is hidden and keeps its untouched layout slot, so the model itself
  // is asked for its position (its root sits at the creature's feet); otherwise
  // the battler sprite answers, offset by the battle field it lives in.
  function battlerFootPosition(battler) {
    const scene = SceneManager._scene;
    const spriteset = scene && scene._spriteset;
    if (!battler || !spriteset) return null;

    const scene3d = spriteset._battle3DScene;
    if (
      scene3d &&
      scene3d.camera &&
      typeof THREE !== "undefined" &&
      typeof spriteset.get3DModel === "function" &&
      (typeof scene3d.hasModels !== "function" || scene3d.hasModels())
    ) {
      const model = spriteset.get3DModel(battler);
      const root = model && model.model;
      if (root) {
        const v = _footPosScratch || (_footPosScratch = new THREE.Vector3());
        root.getWorldPosition(v);
        v.project(scene3d.camera);
        if (isFinite(v.x) && isFinite(v.y) && v.z <= 1) {
          return {
            x: (v.x * 0.5 + 0.5) * Graphics.width,
            y: (-v.y * 0.5 + 0.5) * Graphics.height,
          };
        }
      }
    }

    const sprites = spriteset._enemySprites || [];
    const sprite = sprites.find((s) => s && s._battler === battler);
    if (!sprite) return null;
    const field = spriteset._battleField;
    return {
      x: sprite.x + (field ? field.x : 0),
      y: sprite.y + (field ? field.y : 0),
    };
  }

  // The same reading taken over the creature's head instead of under its feet,
  // for the target chevron. A 3D model is measured (the top of the box it
  // actually occupies, projected through the battle camera) rather than assumed,
  // since a duck and a giant do not wear a marker at the same height; a 2D
  // battler answers with the top of its own bitmap.
  let _headBoxScratch = null;
  let _headPosScratch = null;
  let _headBoxOwner = null;    // whose box _headBoxScratch currently holds
  let _headBoxFrame = -999;
  const HEAD_BOX_TTL = 10;     // frames a measured head box is trusted for
  const HEAD_FALLBACK_H = 120; // when nothing can be measured

  function battlerHeadPosition(battler) {
    const scene = SceneManager._scene;
    const spriteset = scene && scene._spriteset;
    if (!battler || !spriteset) return null;

    const scene3d = spriteset._battle3DScene;
    if (
      scene3d &&
      scene3d.camera &&
      typeof THREE !== "undefined" &&
      typeof spriteset.get3DModel === "function" &&
      (typeof scene3d.hasModels !== "function" || scene3d.hasModels())
    ) {
      const model = spriteset.get3DModel(battler);
      const root = model && model.model;
      if (root && root.visible) {
        const box = _headBoxScratch || (_headBoxScratch = new THREE.Box3());
        // Measuring the box walks every mesh of the model and updates the whole
        // subtree's world matrices, and the chevron asks for it on every frame the
        // target picker is open. A breathing idle does not change how tall a
        // creature is from one frame to the next, so the reading is held for a few
        // frames per model; the chevron's own bob is what the eye reads anyway.
        const now = Graphics.frameCount;
        if (_headBoxOwner !== root || now - _headBoxFrame >= HEAD_BOX_TTL) {
          box.setFromObject(root);
          _headBoxOwner = root;
          _headBoxFrame = now;
        }
        if (!box.isEmpty()) {
          const v = _headPosScratch || (_headPosScratch = new THREE.Vector3());
          v.set(
            (box.min.x + box.max.x) / 2,
            box.max.y,
            (box.min.z + box.max.z) / 2
          );
          v.project(scene3d.camera);
          if (isFinite(v.x) && isFinite(v.y) && v.z <= 1) {
            return {
              x: (v.x * 0.5 + 0.5) * Graphics.width,
              y: (-v.y * 0.5 + 0.5) * Graphics.height,
            };
          }
        }
      }
    }

    const foot = battlerFootPosition(battler);
    if (!foot) return null;
    const sprites = spriteset._enemySprites || [];
    const sprite = sprites.find((s) => s && s._battler === battler);
    const height =
      sprite && sprite.bitmap && sprite.bitmap.height
        ? sprite.bitmap.height
        : HEAD_FALLBACK_H;
    return { x: foot.x, y: foot.y - height };
  }

  Game_Actor.prototype.traitObjectsWithoutStates = function() {
    const objects = [];
    objects.push(this.actor(), this.currentClass());
    for (const item of this.equips()) {
      if (item) {
        objects.push(item);
      }
    }
    return objects;
  };

  Game_Actor.prototype.paramWithoutStatesAndBuffs = function(paramId) {
    const basePlus = this.paramBasePlus(paramId);
    
    // Calculate paramRate using traitObjectsWithoutStates
    const traitObjects = this.traitObjectsWithoutStates();
    const rate = traitObjects.reduce((r, obj) => {
      if (obj && obj.traits) {
        const paramTraits = obj.traits.filter(t => t.code === 21 && t.dataId === paramId);
        return r * paramTraits.reduce((pr, t) => pr * t.value, 1);
      }
      return r;
    }, 1);
    
    let value = basePlus * rate;
    const maxValue = this.paramMax(paramId);
    const minParam = this.paramMin(paramId);
    return Math.round(value.clamp(minParam, maxValue));
  };

  // --- HTML Text Overlay Implementation ---
  ;

  let _cachedScale = null;
  window.addEventListener('resize', () => { _cachedScale = null; });

  function _hudGetScale() {
    if (_cachedScale) return _cachedScale;
    const el = document.getElementById('gameCanvas');
    if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
    const r = el.getBoundingClientRect();
    _cachedScale = {
      sx: r.width / Graphics.width,
      sy: r.height / Graphics.height,
      ox: r.left,
      oy: r.top
    };
    return _cachedScale;
  }

  class HtmlTextOverlay {
    constructor(parentSprite) {
      this.parentSprite = parentSprite;
      this.root = document.createElement('div');
      this.root.className = 'bse-hud-layer';
      document.body.appendChild(this.root);
      this._pool = [];
      this._usedCount = 0;
    }

    update() {
      const visible = this.parentSprite && this.parentSprite.visible &&
                      this.parentSprite.worldAlpha > 0 && this.parentSprite.parent;
      if (!visible) {
        if (this._lastVisible !== false) {
          window.UIPanel.close(this.root);
          this._lastVisible = false;
        }
        return;
      }

      const sc = _hudGetScale();
      let pt = { x: 0, y: 0 };
      if (typeof this.parentSprite.getGlobalPosition === 'function') {
        pt = this.parentSprite.getGlobalPosition();
      } else {
        let node = this.parentSprite;
        while (node) {
          pt.x += node.x;
          pt.y += node.y;
          node = node.parent;
        }
      }

      const left = (sc.ox + pt.x * sc.sx).toFixed(1);
      const top  = (sc.oy + pt.y * sc.sy).toFixed(1);
      const transform = `scale(${sc.sx.toFixed(4)}, ${sc.sy.toFixed(4)})`;
      const opacity = this.parentSprite.worldAlpha;

      if (this._lastVisible !== true || this._lastLeft !== left ||
          this._lastTop !== top || this._lastTransform !== transform ||
          this._lastOpacity !== opacity) {
        window.UIPanel.open(this.root);
        window.UIPanel.placeAt(this.root, left, top);
        this.root.style.setProperty('--hud-transform', transform);
        this.root.style.setProperty('--hud-fade', opacity);
        this._lastVisible   = true;
        this._lastLeft      = left;
        this._lastTop       = top;
        this._lastTransform = transform;
        this._lastOpacity   = opacity;
      }
    }

    clear() {
      this._usedCount = 0;
      for (const el of this._pool) {
        window.UIPanel.close(el);
      }
    }

    _getEl() {
      if (this._usedCount < this._pool.length) {
        const el = this._pool[this._usedCount++];
        window.UIPanel.open(el);
        return el;
      }
      const el = document.createElement('div');
      this.root.appendChild(el);
      this._pool.push(el);
      this._usedCount++;
      return el;
    }

    addText(text, x, y, width, align, fontSize, color, bold, outlineColor, outlineWidth = 2, fontFace = "Bitter, serif", lineHeight = null) {
      const el = this._getEl();
      el.innerHTML = text;
      // Every one of these is a value the sheet cannot know: where the line
      // sits over the battler, how big the canvas is drawing it, and what
      // colour the battle system asked for. They are handed over as custom
      // properties; .bse-hud-text says what a line of HUD text IS.
      // The class is reset first because the pool hands the same element back
      // as a chip one frame and as plain text the next.
      el.className = 'bse-hud-text' +
        (bold ? ' bse-hud-text--bold' : '') +
        (outlineColor && outlineWidth > 0 ? ' bse-hud-text--outlined' : '');
      // The same reason the class is reset: the node may have been a status
      // chip with a hover explanation on it a frame ago.
      if (window.StateTip) window.StateTip.clear(el);
      const st = el.style;
      st.setProperty('--hud-x', x + 'px');
      st.setProperty('--hud-y', y + 'px');
      st.setProperty('--hud-w', width ? width + 'px' : 'auto');
      st.setProperty('--hud-align', align || 'left');
      st.setProperty('--hud-size', fontSize + 'px');
      st.setProperty('--hud-ink', color || 'var(--text-pure-white)');
      st.setProperty('--hud-face', fontFace);
      st.setProperty('--hud-line', lineHeight ? lineHeight + 'px' : 'normal');
      st.setProperty('--hud-outline', outlineColor || 'transparent');
      st.setProperty('--hud-outline-w', (outlineWidth || 0) + 'px');
      return el;
    }

    destroy() {
      if (this.root && this.root.parentNode) {
        this.root.parentNode.removeChild(this.root);
      }
      this._pool = [];
    }
  }

  const helpWindowHeightBonus = Number(
    parameters["HelpWindowHeightBonus"] || 20
  );

  function getEnemyLevel(battler) {
    if (!battler.isEnemy || !battler.isEnemy()) return "";

    const notes = battler.enemy().note || "";
    const levelMatch = notes.match(/<Level:\s*(\d+)>/i);

    if (levelMatch && levelMatch[1]) {
      return "L." + levelMatch[1];
    }
    return "";
  }

  // The level on an enemy nameplate is colour-coded on the same three bands
  // the damage layer runs on (BSE.Helpers.levelGapTier): white while the party
  // can fell it, amber through the band they can still take at a cost, red
  // once the fight is out of reach. The map nameplates in
  // BattleSystemEnhancedLevelDisplay.js use the same three colours, so a
  // monster does not change colour on the way into the fight.
  const LEVEL_TIER_COLORS = ["#ffffff", "#ffd11a", "#ff3b30"];

  function enemyLevelColor(battler) {
    const BSE = window.BattleSystemEnhanced;
    if (!BSE || !BSE.Helpers || !BSE.Helpers.levelGapTier) return LEVEL_TIER_COLORS[0];
    if (!battler || !battler.isEnemy || !battler.isEnemy()) return LEVEL_TIER_COLORS[0];
    const notes = battler.enemy().note || "";
    const levelMatch = notes.match(/<Level:\s*(\d+)>/i);
    if (!levelMatch) return LEVEL_TIER_COLORS[0];
    const party = $gameParty ? $gameParty.members() : [];
    if (!party.length) return LEVEL_TIER_COLORS[0];
    const median = BSE.Helpers.getMedianLevel(party);
    const tier = BSE.Helpers.levelGapTier(Number(levelMatch[1]), median).tier;
    return LEVEL_TIER_COLORS[tier] || LEVEL_TIER_COLORS[0];
  }
  // Read a state's <Hex: #RRGGBB> color from its note, for tinting status tags
  function getStateHexColor(state) {
    if (!state || !state.note) return null;
    const m = state.note.match(/<Hex:\s*(#[0-9A-Fa-f]{3,8})>/i);
    return m ? m[1] : null;
  }

  //=========================================================================
  // The monster's chips
  //=========================================================================
  // Every chip on a monster's card is built here and handed to the bar as
  // { text, color, background, edge }, so the elemental affinities and the
  // ailments come out of the same mould and lie in the same row.

  // How much an element is worth against this monster, as the multiplier a hit
  // would actually be scaled by. Asked of the battler rather than read off the
  // database entry, so a state that has made it vulnerable counts too.
  // Only what HURTS is named: a soft spot is a plan for the next turn, while
  // the full affinity table (resistances and immunities included) belongs to
  // the Bestiary, which has a page to lay it out on rather than a strip under
  // a health bar. The worst three are enough to aim at.
  const MAX_ELEMENT_CHIPS = 3;
  const ELEMENT_CHIP_EPSILON = 0.01;

  // The one localised bank of element names in the game lives with the
  // Bestiary, which is the page that lays the whole affinity table out; the
  // bar borrows it rather than keeping a second list that could drift from it.
  // Held between redraws: the bar is redrawn a dozen times a second and the
  // names only change when the player changes language.
  let _elementNames = null;
  let _elementNamesLang = null;

  function elementNames() {
    const lang = String(
      (typeof ConfigManager !== "undefined" && ConfigManager.language) || ""
    );
    if (_elementNames && _elementNamesLang === lang) return _elementNames;
    const names = (window.T && window.T.list) ? window.T.list("Bestiary.elements") : [];
    _elementNames = names.length > 1
      ? names
      : ($dataSystem && $dataSystem.elements ? $dataSystem.elements : []);
    _elementNamesLang = lang;
    return _elementNames;
  }

  function elementChipsFor(battler) {
    if (!battler || typeof battler.elementRate !== "function") return [];
    const source = elementNames();
    const found = [];
    for (let id = 1; id < source.length; id++) {
      const name = source[id];
      if (!name) continue;
      let rate = 1;
      try {
        rate = Number(battler.elementRate(id));
      } catch (e) {
        continue;
      }
      if (!isFinite(rate) || rate <= 1 + ELEMENT_CHIP_EPSILON) continue;
      found.push({ name, rate });
    }
    found.sort((a, b) => b.rate - a.rate);
    return found.slice(0, MAX_ELEMENT_CHIPS).map((el) => ({
      text: window.T
        ? window.T("Battle.hud.elementChip", {
            element: el.name,
            rate: Number(el.rate.toFixed(1)),
          })
        : el.name,
      // The same green the party cards paint a favourable stat multiplier in
      // (css/game.css .phud-stat): on a monster, a weakness is good news.
      color: "#7dff9a",
      background: "linear-gradient(180deg, rgba(20,58,30,0.92), rgba(10,32,16,0.92))",
      edge: "rgba(125,255,154,0.6)",
    }));
  }

  // What is currently wrong with the monster. A state with no icon is database
  // plumbing nobody is meant to read, exactly as on the party cards.
  function stateChipsFor(battler) {
    if (!battler || typeof battler.states !== "function") return [];
    return battler.states()
      .filter((state) => state && state.iconIndex > 0)
      .map((state) => {
        const isDebuff = state.restriction && state.restriction > 0;
        const hex = getStateHexColor(state);
        return {
          stateId: state.id,
          text: window.translateText ? window.translateText(state.name) : state.name,
          color: hex || (isDebuff ? "#ffd0d0" : "#ffe9c2"),
          background: isDebuff
            ? "linear-gradient(180deg, rgba(80,24,24,0.92), rgba(45,12,12,0.92))"
            : "linear-gradient(180deg, rgba(70,48,20,0.92), rgba(40,26,10,0.92))",
          edge: hex || (isDebuff ? "rgba(255,150,150,0.6)" : "rgba(255,214,150,0.6)"),
        };
      });
  }

  //=========================================================================
  // Battle UI Fixes - Window_Help modifications
  //=========================================================================

  const _Window_Help_initialize = Window_Help.prototype.initialize;
  Window_Help.prototype.initialize = function (rect) {
    // Adjust height if in battle (optional bonus)
    if ($gameParty && $gameParty.inBattle && $gameParty.inBattle()) {
      rect.height += helpWindowHeightBonus;
    }
    _Window_Help_initialize.call(this, rect);

    // Always create the HTML overlay (it will be hidden when not needed)
    const old = document.getElementById('html-battle-help-overlay');
    if (old) old.remove();

    const root = document.createElement('div');
    root.id = 'html-battle-help-overlay';
    root.className = 'bse-slide-panel bse-help-panel';
    this._htmlHelpRoot = root;
    document.body.appendChild(root);
  };

  const _Window_Help_destroy = Window_Help.prototype.destroy || Window_Base.prototype.destroy;
  Window_Help.prototype.destroy = function (options) {
      if (this._htmlHelpRoot && this._htmlHelpRoot.parentNode) {
          this._htmlHelpRoot.parentNode.removeChild(this._htmlHelpRoot);
      }
      this._htmlHelpRoot = null;
      if (_Window_Help_destroy) _Window_Help_destroy.call(this, options);
  };

  const _Window_Help_show = Window_Help.prototype.show;
  Window_Help.prototype.show = function () {
      _Window_Help_show.call(this);
  };

  // The description box is a DOM node, so it only slides away while the window
  // that owns it is still being updated. A scene that ends (or a map battle
  // that hands the keys back) stops those updates mid-frame and used to leave
  // the last description standing on screen; every one of those exits calls
  // this instead.
  function hideBattleHelpOverlay() {
      const root = document.getElementById('html-battle-help-overlay');
      if (!root) return;
      root.classList.add('bse-slide-panel--quick');
      root.classList.remove('bse-slide-panel--in');
  }
  window.BattleHelpOverlay = { hide: hideBattleHelpOverlay };

  const _Window_Help_hide = Window_Help.prototype.hide;
  Window_Help.prototype.hide = function () {
      _Window_Help_hide.call(this);
      this._htmlHelpSlideState = 'hidden';
      this._lastRawHelpText = null;
      hideBattleHelpOverlay();
  };

  // Leaving a scene, and the end of a battle played out on the map, both drop
  // the description with the rest of the battle UI.
  const _BSEHelp_Scene_Base_terminate = Scene_Base.prototype.terminate;
  Scene_Base.prototype.terminate = function () {
      hideBattleHelpOverlay();
      _BSEHelp_Scene_Base_terminate.call(this);
  };

  const _BSEHelp_BattleManager_endBattle = BattleManager.endBattle;
  BattleManager.endBattle = function (result) {
      hideBattleHelpOverlay();
      _BSEHelp_BattleManager_endBattle.call(this, result);
  };

  const _Window_Help_render = Window_Help.prototype.render;
  Window_Help.prototype.render = function (renderer) {
      if ($gameParty.inBattle()) {
          return; // Prevent PIXI rendering
      }
      _Window_Help_render.call(this, renderer);
  };

  const _Window_Help__render = Window_Help.prototype._render;
  Window_Help.prototype._render = function (renderer) {
      if ($gameParty.inBattle()) {
          return; // Prevent PIXI rendering
      }
      _Window_Help__render.call(this, renderer);
  };

  const _Window_Help_update = Window_Help.prototype.update;
  Window_Help.prototype.update = function () {
      _Window_Help_update.call(this);

      if (!this._htmlHelpRoot) return;

      // Only display the custom HTML help overlay in battle scenes
      const inBattle = $gameParty && typeof $gameParty.inBattle === 'function' && $gameParty.inBattle();
      const txt = (this._text || '').trim();

      if (!inBattle || !this.visible || this.height === 0 || this.width === 0 || !txt) {
          if (this._htmlHelpSlideState !== 'hidden') {
              this._htmlHelpSlideState = 'hidden';
              this._htmlHelpRoot.classList.add('bse-slide-panel--quick');
              this._htmlHelpRoot.classList.remove('bse-slide-panel--in');
          }
          this._lastRawHelpText = null;
          return;
      }

      if (txt !== this._lastRawHelpText) {
          this._lastRawHelpText = txt;
          let text = this._text || '';
          if (typeof window.translateText === 'function') {
              text = window.translateText(text);
          }
          
          text = text.replace(/\\C\[\d+\]/gi, '')
                     .replace(/\\V\[\d+\]/gi, '')
                     .replace(/\\N\[\d+\]/gi, '')
                     .replace(/\\P\[\d+\]/gi, '')
                     .replace(/\\G/gi, '');

          // Convert \I[n] icon codes into inline iconset spans so element
          // icons render to the left of their name in the help box.
          text = text.replace(/\\I\[(\d+)\]/gi, function (m, n) {
              return `<span class="cc-rpg-icon bse-help-icon" style="${window.CCArt.icon(Number(n), 32)}"></span>`;
          });

          // Wrap in a single block child so the flex-column root does not
          // stack the inline icon span as its own row above the element name.
          const formattedText = '<div>' + text.replace(/\n/g, '<br/>') + '</div>';
          if (this._htmlHelpRoot.innerHTML !== formattedText) {
              this._htmlHelpRoot.innerHTML = formattedText;
          }
      }

      const sc = _hudGetScale();
      const pad = this.padding || 12;
      const s = this._htmlHelpRoot.style;

      // The box belongs to the list page under it, so it takes that page's
      // width and stands directly on its top edge (window.BattleListPage,
      // published by whichever of the skill / item pages is open). A page whose
      // height follows its contents would otherwise leave the description
      // stranded halfway up the screen.
      const page = window.BattleListPage || { MARGIN: 20, GAP: 10, TOP: 184, width: 420, height: 460 };
      const fixedW = page.width * sc.sx;

      // The description always reads from the middle of the screen, whichever
      // side the list page itself is on and whatever the control mode: it is
      // the one thing the player has to read, so it never hides in a corner.
      // Both pages hang from page.TOP, so the box stands on that one line and
      // does not move when the player switches between them.
      const centreX = sc.ox + (Graphics.width * sc.sx) / 2;
      const leftEdgeX = centreX - fixedW / 2;
      const bottomEdgeY = sc.oy + (page.TOP - page.GAP) * sc.sy;

      const leftStr = Math.max(0, leftEdgeX) + 'px';
      const bottomStr = Math.max(0, window.innerHeight - bottomEdgeY) + 'px';
      const widthStr = fixedW + 'px';
      const paddingStr = Math.round(pad * sc.sy) + 'px ' + Math.round(pad * sc.sx) + 'px';

      const baseFontSize = (typeof this.standardFontSize === 'function')
          ? this.standardFontSize() : 24;
      const scaledFont = Math.round(baseFontSize * sc.sy * 0.85);
      const fontSizeStr = scaledFont + 'px';

      if (s.right !== '') s.right = '';
      if (s.top !== '') s.top = '';
      if (s.width !== widthStr) s.width = widthStr;
      if (s.height !== 'auto') s.height = 'auto';
      if (s.left !== leftStr) s.left = leftStr;
      if (s.bottom !== bottomStr) s.bottom = bottomStr;
      if (s.maxWidth !== widthStr) s.maxWidth = widthStr;
      if (s.padding !== paddingStr) s.padding = paddingStr;
      if (s.fontSize !== fontSizeStr) s.fontSize = fontSizeStr;

      // Apply the slide-in animation transition
      if (this._htmlHelpSlideState !== 'shown') {
          this._htmlHelpSlideState = 'shown';
          s.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease';
          s.transform = 'translateX(0)';
          s.opacity = '1';
          s.pointerEvents = 'auto';
      }
  };

  const _Scene_Battle_helpWindowRect = Scene_Battle.prototype.helpWindowRect;
  Scene_Battle.prototype.helpWindowRect = function () {
    const rect = _Scene_Battle_helpWindowRect.call(this);
    rect.height += helpWindowHeightBonus;
    return rect;
  };

  // Adjust other windows to account for taller help window
  const _Scene_Battle_skillWindowRect = Scene_Battle.prototype.skillWindowRect;
  Scene_Battle.prototype.skillWindowRect = function () {
    const rect = _Scene_Battle_skillWindowRect.call(this);
    rect.y += helpWindowHeightBonus;
    rect.height -= helpWindowHeightBonus + 200;
    return rect;
  };

  const _Scene_Battle_itemWindowRect = Scene_Battle.prototype.itemWindowRect;
  Scene_Battle.prototype.itemWindowRect = function () {
    const rect = _Scene_Battle_itemWindowRect.call(this);
    rect.y += helpWindowHeightBonus;
    rect.height -= helpWindowHeightBonus + 200;
    return rect;
  };

  //=========================================================================
  // Battle UI Fixes - Window_BattleItem single column
  //=========================================================================

  // -------------------------------------------------------------------------
  // HTML Battle Item Overlay ,  parchment overlay matching DialogueSystem
  // -------------------------------------------------------------------------


  // window.CCArt (CharacterCreation/CharacterCreationShared.js) is the one
  // place an IconSet cell is worked out; .cc-rpg-icon in css/theme.css is what
  // one looks like. This wants it three quarters size with a gutter after it,
  // which is what .bse-item-icon adds.
  function paintIcon(span, iconIndex) {
      span.className = 'cc-rpg-icon bse-item-icon';
      span.setAttribute('style', window.CCArt.icon(iconIndex, 32));
  }

  //=============================================================================
  // Window_BattleItem Categorization
  //=============================================================================
  const MIN_ITEMS_FOR_CATEGORIZATION = 10;

  Window_BattleItem.prototype.isCategorized = function () {
    if (!$gameParty) return false;
    const totalItems = $gameParty.allItems().filter(item => this.includes(item)).length;
    return totalItems > MIN_ITEMS_FOR_CATEGORIZATION;
  };

  const _Window_BattleItem_makeItemList = Window_BattleItem.prototype.makeItemList;
  Window_BattleItem.prototype.makeItemList = function () {
    if (this.isCategorized()) {
      if (!this.visible) {
        this._categoryMode = true;
        this._selectedCategory = null;
      }
      if (this._categoryMode) {
        const categoriesSet = new Set();
        const allItems = $gameParty.allItems().filter(item => this.includes(item));
        for (const item of allItems) {
          const cat = (item.meta && typeof item.meta.category === 'string' && item.meta.category.trim()) || "General";
          categoriesSet.add(cat);
        }
        this._data = Array.from(categoriesSet).sort();
      } else {
        this._data = $gameParty.allItems().filter(item => {
          if (!this.includes(item)) return false;
          const cat = (item.meta && typeof item.meta.category === 'string' && item.meta.category.trim()) || "General";
          return cat === this._selectedCategory;
        });
      }
    } else {
      _Window_BattleItem_makeItemList.call(this);
    }
  };

  const _Window_BattleItem_processOk = Window_BattleItem.prototype.processOk;
  Window_BattleItem.prototype.processOk = function () {
    if (this.isCategorized() && this._categoryMode) {
      if (this.isCurrentItemEnabled()) {
        SoundManager.playOk();
        this._selectedCategory = this.item();
        this._categoryMode = false;
        this.refresh();
        this.select(0);
        this.activate();
      } else {
        this.playBuzzerSound();
      }
    } else {
      _Window_BattleItem_processOk.call(this);
    }
  };

  const _Window_BattleItem_processCancel = Window_BattleItem.prototype.processCancel;
  Window_BattleItem.prototype.processCancel = function () {
    if (this.isCategorized() && !this._categoryMode) {
      SoundManager.playCancel();
      this._categoryMode = true;
      this._selectedCategory = null;
      this.refresh();
      this.select(0);
      this.activate();
    } else {
      _Window_BattleItem_processCancel.call(this);
    }
  };

  const _Window_BattleItem_isEnabled = Window_BattleItem.prototype.isEnabled;
  Window_BattleItem.prototype.isEnabled = function (item) {
    if (typeof item === 'string') {
      return $gameParty.allItems().some(x => {
        if (!this.includes(x)) return false;
        const cat = (x.meta && typeof x.meta.category === 'string' && x.meta.category.trim()) || "General";
        return cat === item && $gameParty.canUse(x);
      });
    }
    return _Window_BattleItem_isEnabled.call(this, item);
  };

  const _Window_BattleItem_updateHelp = Window_BattleItem.prototype.updateHelp;
  Window_BattleItem.prototype.updateHelp = function () {
    if (this.isCategorized() && this._categoryMode) {
      if (this._helpWindow) {
        this._helpWindow.setText('');
      }
    } else {
      _Window_BattleItem_updateHelp.call(this);
    }
  };

  const _Window_BattleItem_initialize = Window_BattleItem.prototype.initialize;
  Window_BattleItem.prototype.initialize = function (rect) {
    _Window_BattleItem_initialize.call(this, rect);
    
    // Remove old overlay if any
    const old = document.getElementById('html-battle-item-overlay');
    if (old) old.remove();

    const root = document.createElement('div');
    root.id = 'html-battle-item-overlay';
    root.className = 'bse-slide-panel bse-item-panel';
    
    // Right click to cancel / back out
    root.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.active && typeof this.processCancel === 'function') {
            this.processCancel();
        }
    });

    root.addEventListener("wheel", (e) => {
        e.preventDefault();
        root.scrollTop += e.deltaY;
    }, { passive: false });

    this._htmlItemRoot = root;
    document.body.appendChild(root);
  };

  // Keep the window logically active/visible to the engine for keyboard/controller input,
  // but prevent PIXI from drawing its canvas graphics.
  Window_BattleItem.prototype.render = function (renderer) {
      // Prevent PIXI rendering
  };

  Window_BattleItem.prototype._render = function (renderer) {
      // Prevent PIXI rendering
  };

  const _Window_BattleItem_destroy = Window_BattleItem.prototype.destroy || Window_Selectable.prototype.destroy;
  Window_BattleItem.prototype.destroy = function (options) {
      if (this._htmlItemRoot && this._htmlItemRoot.parentNode) {
          this._htmlItemRoot.parentNode.removeChild(this._htmlItemRoot);
      }
      this._htmlItemRoot = null;
      if (_Window_BattleItem_destroy) _Window_BattleItem_destroy.call(this, options);
  };

  const _Window_BattleItem_show = Window_BattleItem.prototype.show;
  Window_BattleItem.prototype.show = function () {
      if (this.isCategorized()) {
          this._categoryMode = true;
          this._selectedCategory = null;
      } else {
          this._categoryMode = false;
          this._selectedCategory = null;
      }
      this.refresh();
      _Window_BattleItem_show.call(this);
      this.select(0);
      if (this._htmlItemRoot) {
          this._buildItemHtml();
          setTimeout(() => {
              if (this._htmlItemRoot && this.visible) {
                  this._htmlItemRoot.classList.add('bse-slide-panel--in');
              }
          }, 0);
      }
  };

  // update() writes the slid-in transform/opacity as INLINE styles, and an
  // inline style outranks the stylesheet: dropping the --in class alone can
  // never take the panel back off the screen. Every close goes through this,
  // which clears what update() wrote.
  Window_BattleItem.prototype._closeItemHtml = function () {
      const root = this._htmlItemRoot;
      if (!root) return;
      root.classList.remove('bse-slide-panel--in');
      // So the next open re-applies the layout instead of assuming it stands.
      this._lastIdx = null;
  };

  const _Window_BattleItem_hide = Window_BattleItem.prototype.hide;
  Window_BattleItem.prototype.hide = function () {
      _Window_BattleItem_hide.call(this);
      this._closeItemHtml();
  };

  const _Window_BattleItem_refresh = Window_BattleItem.prototype.refresh;
  Window_BattleItem.prototype.refresh = function () {
      _Window_BattleItem_refresh.call(this);
      if (this._htmlItemRoot) {
          this._buildItemHtml();
      }
  };

  // Always return 1 column for battle items to prevent name truncation
  Window_BattleItem.prototype.maxCols = function () {
    return 1;
  };

  // No column spacing needed for single column
  Window_BattleItem.prototype.colSpacing = function () {
    return 0;
  };

  Window_BattleItem.prototype.processTouch = function () {
    // Disable standard touch inputs to prevent conflict with custom HTML overlay events
  };

  Window_BattleItem.prototype.processCursorMove = function () {
      if (this.isCursorMovable()) {
          const isP2 = window.$gameSplitScreen && window.$gameSplitScreen.active &&
              this._actor && this._actor.multiplayerPlayerId && this._actor.multiplayerPlayerId() === 2;
          const input = isP2 ? window.$gameSplitScreen : Input;

          if (input.isRepeated("down")) {
              if (this.index() >= this.maxItems() - 1) {
                  this.select(0);
                  this.playCursorSound();
              } else {
                  this.cursorDown(input.isTriggered("down"));
              }
          } else if (input.isRepeated("up")) {
              if (this.index() <= 0) {
                  this.select(this.maxItems() - 1);
                  this.playCursorSound();
              } else {
                  this.cursorUp(input.isTriggered("up"));
              }
          } else if (input.isRepeated("right")) {
              this.cursorRight(input.isTriggered("right"));
          } else if (input.isRepeated("left")) {
              this.cursorLeft(input.isTriggered("left"));
          } else {
              if (!this.isHandled("pagedown") && input.isRepeated("pagedown")) this.cursorPagedown();
              if (!this.isHandled("pageup") && input.isRepeated("pageup")) this.cursorPageup();
          }
      }
  };

  Window_BattleItem.prototype.drawItem = function (index) {
    // No-op: custom HTML overlay handles rendering, prevents canvas drawing crashes
  };

  Window_BattleItem.prototype._buildItemHtml = function () {
      const root = this._htmlItemRoot;
      if (!root) return;
      root.innerHTML = '';



      const sc = _hudGetScale();
      const baseFontSize = (typeof this.standardFontSize === 'function')
          ? this.standardFontSize() : 24;
      const scaledFont = Math.round(baseFontSize * sc.sy * 0.85);

      const self = this;
      const items = this._data || [];

      this._htmlItemEls = items.map((item, i) => {
          const el = document.createElement('div');
          el.dataset.idx = i;
          el.className = 'bse-item-row';
          el.style.setProperty('--hud-size', scaledFont + 'px');

          // Left side: Icon + Name
          const leftDiv = document.createElement('div');
          leftDiv.className = 'bse-item-row-name';

          if (typeof item === 'string') {
              // Category Mode
              const iconIndex = 209; // Generic bag icon
              const iconSpan = document.createElement('span');
              paintIcon(iconSpan, iconIndex);
              leftDiv.appendChild(iconSpan);

              const nameSpan = document.createElement('span');
              nameSpan.textContent = item;
              leftDiv.appendChild(nameSpan);
              el.appendChild(leftDiv);

              // Right side: Item count in this category
              const rightDiv = document.createElement('div');
              rightDiv.className = 'bse-item-row-count';

              const count = $gameParty.allItems().filter(x => {
                  if (!self.includes(x)) return false;
                  const cat = (x.meta && typeof x.meta.category === 'string' && x.meta.category.trim()) || "General";
                  return cat === item;
              }).length;

              const countSpan = document.createElement('span');
              countSpan.textContent = '(' + count + ')';
              rightDiv.appendChild(countSpan);
              el.appendChild(rightDiv);

              const isEnabled = $gameParty.allItems().some(x => {
                  if (!self.includes(x)) return false;
                  const cat = (x.meta && typeof x.meta.category === 'string' && x.meta.category.trim()) || "General";
                  return cat === item && $gameParty.canUse(x);
              });
              if (!isEnabled) {
                  el.classList.add('bse-item-row--spent');
              }
          } else if (item) {
              // Standard Item Mode
              const iconIndex = item.iconIndex;
              const iconSpan = document.createElement('span');
              paintIcon(iconSpan, iconIndex);
              leftDiv.appendChild(iconSpan);

              const nameSpan = document.createElement('span');
              nameSpan.textContent = item.name;
              leftDiv.appendChild(nameSpan);
              el.appendChild(leftDiv);

              // Right side: Quantity / Number
              const rightDiv = document.createElement('div');
              rightDiv.className = 'bse-item-row-count';

              const count = $gameParty.numItems(item);
              const countSpan = document.createElement('span');
              countSpan.textContent = 'x' + count;
              rightDiv.appendChild(countSpan);
              el.appendChild(rightDiv);

              // Enable/disable based on whether party can use the item in battle
              const isEnabled = $gameParty.canUse(item);
              if (!isEnabled) {
                  el.classList.add('bse-item-row--spent');
              }
          } else {
              el.classList.add('bse-hidden');
          }

          el.addEventListener('mouseover', () => {
              if (self.active && typeof self.select === 'function') {
                  self.select(i);
              }
          });

          el.addEventListener('click', () => {
              if (self.active && typeof self.select === 'function') {
                  self.select(i);
              }
              if (self.active && typeof self.processOk === 'function') {
                  self.processOk();
              }
          });

          root.appendChild(el);
          return el;
      });
  };

  const _Window_BattleItem_update = Window_BattleItem.prototype.update;
  Window_BattleItem.prototype.update = function () {
      _Window_BattleItem_update.call(this);

      if (!this._htmlItemRoot) return;

      const isClosed = !this.visible || this.openness === 0 || !this.isOpen() || this.height === 0 || this.width === 0;

      if (isClosed) {
          if (this._lastStateClosed !== true) {
              this._closeItemHtml();
              this._lastStateClosed = true;
          }
          return;
      }

      this._lastStateClosed = false;

      const sc = _hudGetScale();
      const pad = this.padding || 12;
      const s = this._htmlItemRoot.style;
      const idx = this.index();

      if (this._lastIdx !== idx || this._lastSx !== sc.sx || this._lastSy !== sc.sy) {
          this._lastIdx = idx;
          this._lastSx = sc.sx;
          this._lastSy = sc.sy;

          // The page hangs from the top line both battle lists share
          // (window.BattleListPage), so switching between items and skills
          // never moves the panel, and reaches down to the bottom margin.
          const page = window.BattleListPage;
          const ITEM_W = 340;
          const ITEM_H = page ? page.maxHeight() : 420;
          const ITEM_TOP = page ? page.TOP : 184;
          const scaledW = ITEM_W * sc.sx;
          const scaledH = ITEM_H * sc.sy;
          // The description box stands on this page while it is the open one.
          if (page) page.set(ITEM_W, ITEM_H);

          const targetLeft = page
              ? page.leftPx(scaledW, sc)
              : sc.ox + (Graphics.width * sc.sx) - scaledW - (20 * sc.sx);
          const targetTop = sc.oy + (ITEM_TOP * sc.sy);

          // Geometry is handed over as custom properties, the way the rest of
          // the HUD does it; the slid-in state itself is the panel's own class,
          // so nothing has to write transform or opacity onto the element.
          s.setProperty('--bse-item-x', targetLeft + 'px');
          s.setProperty('--bse-item-y', targetTop + 'px');
          s.setProperty('--bse-item-w', scaledW + 'px');
          s.setProperty('--bse-item-h', scaledH + 'px');
          s.setProperty('--bse-item-pad',
              Math.round(pad * sc.sy) + 'px ' + Math.round(pad * sc.sx) + 'px');
          this._htmlItemRoot.classList.add('bse-slide-panel--in');

          const baseFontSize = (typeof this.standardFontSize === 'function')
              ? this.standardFontSize() : 24;
          const scaledFont = Math.round(baseFontSize * sc.sy * 0.85);

          if (this._htmlItemEls) {
              this._htmlItemEls.forEach((el, i) => {
                  el.style.setProperty('--hud-size', scaledFont + 'px');
                  el.classList.toggle('bse-item-row--on', i === idx);
              });

              // Scroll the selected element into view for keyboard/controller navigation
              if (this._htmlItemEls[idx]) {
                  const container = this._htmlItemRoot;
                  const el = this._htmlItemEls[idx];
                  const cRect = container.getBoundingClientRect();
                  const eRect = el.getBoundingClientRect();
                  if (eRect.top < cRect.top) {
                      container.scrollTop -= cRect.top - eRect.top;
                  } else if (eRect.bottom > cRect.bottom) {
                      container.scrollTop += eRect.bottom - cRect.bottom;
                  }
              }
          }
      }
  };

  // Make sure regular item windows (outside battle) keep their normal behavior
  const _Window_ItemList_maxCols = Window_ItemList.prototype.maxCols;
  Window_ItemList.prototype.maxCols = function () {
    // Only affect battle item window, not regular item lists
    if (this.constructor === Window_BattleItem) {
      return 1;
    }
    return _Window_ItemList_maxCols.call(this);
  };

  // Ensure help window text wrapping works properly with increased height
  const _Window_Help_refresh = Window_Help.prototype.refresh;
  Window_Help.prototype.refresh = function () {
    _Window_Help_refresh.call(this);
    if (this._htmlHelpRoot) {
      let text = this._text || '';
      // Strip common raw RPG Maker MZ canvas color and icon text codes
      text = text.replace(/\\C\[\d+\]/gi, '');
      text = text.replace(/\\I\[\d+\]/gi, '');
      text = text.replace(/\\V\[\d+\]/gi, '');
      text = text.replace(/\\N\[\d+\]/gi, '');
      text = text.replace(/\\P\[\d+\]/gi, '');
      text = text.replace(/\\G/gi, '');

      // Render double newlines or single newlines cleanly as <br/>
      this._htmlHelpRoot.innerHTML = text.replace(/\n/g, '<br/>');
    }
  };

  //=========================================================================
  // Original Battle Bar Code continues below
  //=========================================================================

  function Sprite_BattleBar() {
    this.initialize(...arguments);
  }
  Sprite_BattleBar.prototype = Object.create(Sprite.prototype);
  Sprite_BattleBar.prototype.constructor = Sprite_BattleBar;
  // Expose so other plugins (e.g. class passives) can extend the monster bars,
  // and so MapBattleMode can deal the same bars out on Scene_Map.
  window.Sprite_BattleBar = Sprite_BattleBar;
  Sprite_BattleBar.prototype.initialize = function (battler, customWidth = null) {
    Sprite.prototype.initialize.call(this);
    this._htmlOverlay = new HtmlTextOverlay(this);
    this._battler = battler;
    this._barBitmapWidth = customWidth || miniBarWidth;
    this.bitmap = new Bitmap(this._barBitmapWidth, miniBarBitmapHeight);
    this._lastHp = battler.hp;
    this._lastMaxHp = battler.mhp;
    this._lastMp = battler.mp;
    this._lastMaxMp = battler.mmp;
    this._lastTp = battler.tp;
    this._displayHp = battler.hp;
    this._damageChunkHp = battler.hp;
    this._createOrb();
    this.refresh();
    this.createDamageOverlay();
  };

  // The same AP/TP orb the party cards wear (UI/PartyHud.js _makeOrb), built
  // once and written into in place. It uses the same phud-orb* classes, kept
  // outside #party-hud (see css/game.css's unscoped copy of those rules), so
  // it renders identically without living inside the party's own DOM tree.
  Sprite_BattleBar.prototype._createOrb = function () {
    const orb = document.createElement("div");
    orb.className = "phud-orb ebar-orb";
    const ghost = document.createElement("div");
    ghost.className = "phud-orb-ghost";
    const fill = document.createElement("div");
    fill.className = "phud-orb-fill";
    const val = document.createElement("span");
    val.className = "phud-orb-val";
    orb.appendChild(ghost);
    orb.appendChild(fill);
    orb.appendChild(val);
    this._htmlOverlay.root.appendChild(orb);
    this._orb = { orb, ghost, fill, val };
  };

  const _Sprite_BattleBar_destroy = Sprite_BattleBar.prototype.destroy || Sprite.prototype.destroy;
  Sprite_BattleBar.prototype.destroy = function (options) {
    if (this._htmlOverlay) this._htmlOverlay.destroy();
    if (_Sprite_BattleBar_destroy) _Sprite_BattleBar_destroy.call(this, options);
  };

  Sprite_BattleBar.prototype.update = function () {
    Sprite.prototype.update.call(this);
    // A monster that has left the field takes its bar with it: killed, or talked
    // round and hidden (EnemyTalkSystem). The scene sweeps the bars too, but it
    // does so AFTER its children have updated and not at all while another plugin
    // is driving the scene (Health_Monsters' Check panel), so the bar and the DOM
    // text it carries would outlive the creature by a frame or by a whole panel.
    // Decided here, they go in the same frame the battler does.
    if (this._battler) this.visible = this._battler.isAlive();
    if (this._htmlOverlay) this._htmlOverlay.update();
    if (!this._battler) return;

    this.updateGaugeAnimation();

    const b = this._battler;
    if (b.hp < this._lastHp) {
      this._damageChunkHp = this._displayHp;
      this._displayHp = b.hp;
      this.updateDamageOverlay();
    } else if (b.hp > this._lastHp) {
      this._displayHp = b.hp;
      this._damageChunkHp = b.hp;
      this.updateDamageOverlay();
    }

    if (this._damageChunkHp > this._displayHp) {
      this._damageChunkHp = Math.max(
        this._displayHp,
        this._damageChunkHp - b.mhp / (60 * animationSpeed)
      );
      this.updateDamageOverlay();
    }

    if (
      b.hp !== this._lastHp ||
      b.mhp !== this._lastMaxHp ||
      b.mp !== this._lastMp ||
      b.mmp !== this._lastMaxMp ||
      b.tp !== this._lastTp
    ) {
      this.refresh();
      this._lastHp = b.hp;
      this._lastMaxHp = b.mhp;
      this._lastMp = b.mp;
      this._lastMaxMp = b.mmp;
      this._lastTp = b.tp;
    }
  };
  // The bar is redrawn a few times a second so its gradient stays alive, and
  // no more often: at every other frame this was a major source of canvas and
  // DOM churn. Nothing is drawn at all while the bar cannot be seen or the
  // creature is already dead (a fallen monster's bar is hidden by the scene in
  // the same frame, so there is no death animation to keep feeding).
  Sprite_BattleBar.prototype.updateGaugeAnimation = function () {
    if (!this.visible || this.worldVisible === false) return;
    if (this._battler.isDead()) return;
    this._refreshCounter = (this._refreshCounter || 0) + 1;
    if (this._refreshCounter % 4 === 0) this.refresh();
  };

  Sprite_BattleBar.prototype.updateDamageOverlay = function () {
    if (!this._damageOverlay) return;
    const b = this._battler;
    const geo = miniBarGaugeGeometry(this.bitmap.width);
    const hpWidth = geo.w * (this._displayHp / Math.max(1, b.mhp));
    const dmgWidth = geo.w * (this._damageChunkHp / Math.max(1, b.mhp));
    this._damageOverlay.bitmap.clear();
    if (dmgWidth <= hpWidth) return;
    const ctx = this._damageOverlay.bitmap.context;
    ctx.fillStyle = damageColor;
    ctx.beginPath();
    ctx.moveTo(geo.x + hpWidth, 0);
    ctx.lineTo(geo.x + dmgWidth, 0);
    ctx.lineTo(geo.x + dmgWidth - MINI.ang, MINI.thickness);
    ctx.lineTo(geo.x + hpWidth - MINI.ang, MINI.thickness);
    ctx.closePath();
    ctx.fill();
  };

  // The depletion chunk that trails a hit: the slice of the bar the monster has
  // just lost, riding on its own overlay sprite so the gauge underneath is not
  // redrawn for it.
  Sprite_BattleBar.prototype.createDamageOverlay = function () {
    this._damageOverlay = new Sprite();
    this._damageOverlay.bitmap = new Bitmap(this._barBitmapWidth, MINI.thickness);
    this._damageOverlay.y = MINI.hpY;
    this.addChild(this._damageOverlay);
  };

  // Every monster on the field wears the same compact bar: the angled HP/MP
  // pair, the AP/TP orb, the name, the level and its status chips - the same
  // elements the party's own cards carry (UI/PartyHud.js), mirrored to the
  // right since the column stands in the opposite corner, plus the elements it
  // is soft to. A lone monster used to get a large bar carrying the full
  // affinity table and a list of its severed limbs too, but a severed limb is
  // now missing from the model itself and a stat change is called out in the
  // battle log as it happens, so neither had anything left to say that the
  // field was not already saying.
  Sprite_BattleBar.prototype.refresh = function () {
    if (!this._battler) return;
    this.bitmap.clear();
    if (this._htmlOverlay) this._htmlOverlay.clear();
    if (window.AsciiMode && window.AsciiMode.active) {
      if (this._orb) window.UIPanel.close(this._orb.orb);
      this.refreshAsciiEnemyBar();
      return;
    }
    if (this._orb) window.UIPanel.open(this._orb.orb);
    this.refreshMinimalEnemyBar();
  };

  // The same bar written as text, for ASCII mode: the name and level, a short
  // HP gauge, and the magic gauge under it where there is magic to spend.
  Sprite_BattleBar.prototype.refreshAsciiEnemyBar = function () {
    const b = this._battler;
    const w = this.bitmap.width;
    const overlay = this._htmlOverlay;
    if (!overlay) return;
    const CELLS = 14;
    const lineHeight = 16;
    let y = 0;

    this.bitmap.fontSize = 12;
    this.bitmap.fontFace = "monospace";
    this.bitmap.outlineWidth = 0;

    const level = b.level ? ` L.${b.level}` : "";
    overlay.addText(b.name() + level, 0, y, w, "left", 12, "#ffd700", false, null, 0, "monospace", lineHeight);
    y += lineHeight;

    const gauge = (rate, glyph) => {
      const filled = Math.max(0, Math.min(CELLS, Math.floor(rate * CELLS)));
      return `[${glyph.repeat(filled)}${" ".repeat(CELLS - filled)}]`;
    };

    const hp = Math.floor(this._displayHp !== undefined ? this._displayHp : b.hp);
    const hpBar = gauge(hp / Math.max(1, b.mhp), "=");
    overlay.addText(`HP ${hpBar} ${hp}/${b.mhp}`, 0, y, w, "left", 12, "#ff4444", false, null, 0, "monospace", lineHeight);
    y += lineHeight;

    // A severed-magic world has no magic to spend, so the row closes up.
    if (!hideMpBar() && b.mmp > 0) {
      const mpBar = gauge(b.mp / Math.max(1, b.mmp), "*");
      overlay.addText(`MP ${mpBar} ${Math.floor(b.mp)}/${b.mmp}`, 0, y, w, "left", 12, "#00ffff", false, null, 0, "monospace", lineHeight);
    }
  };
  // The monster bar: an angled HP gauge with the magic one under it, the AP/TP
  // orb, the name, the level, the elements it is soft to and the status chips.
  // No severed limbs: a severed limb is now missing from the model itself, and
  // a stat change is called out in the battle log as it happens, so neither had
  // anything left to say that the field was not already saying.
  Sprite_BattleBar.prototype.refreshMinimalEnemyBar = function () {
    const b = this._battler;
    const bitmap = this.bitmap;
    const ctx = bitmap.context;
    const W = bitmap.width;
    const geo = miniBarGeometry(W);
    const barGeo = miniBarGaugeGeometry(W);

    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const hpRate = clamp01(this._displayHp / Math.max(1, b.mhp));
    const chunkRate = clamp01(
      (this._damageChunkHp !== undefined ? this._damageChunkHp : b.hp) /
        Math.max(1, b.mhp)
    );

    // Track, border and fill match the party cards' own bars exactly
    // (css/game.css .phud-bar / .phud-fill): a neutral dark track, a
    // two-stop gradient fill and a flat highlight over the top half rather
    // than a painted bevel, so a monster's HP reads the same language a
    // party member's does.
    const BAR_TRACK = "rgba(0,0,0,0.55)";
    const BAR_BORDER = "rgba(0,0,0,0.55)";

    const drawGauge = (y, rate, dark, bright) => {
      const ang = MINI.ang;
      const h = MINI.thickness;
      const fillW = Math.round(barGeo.w * clamp01(rate));
      ctx.fillStyle = BAR_TRACK;
      ctx.beginPath();
      ctx.moveTo(barGeo.x, y);
      ctx.lineTo(barGeo.x + barGeo.w, y);
      ctx.lineTo(barGeo.x + barGeo.w - ang, y + h);
      ctx.lineTo(barGeo.x - ang, y + h);
      ctx.closePath();
      ctx.fill();
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barGeo.x, 0, barGeo.x + barGeo.w, 0);
        grad.addColorStop(0, dark);
        grad.addColorStop(1, bright);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(barGeo.x, y);
        ctx.lineTo(barGeo.x + fillW, y);
        ctx.lineTo(barGeo.x + fillW - ang, y + h);
        ctx.lineTo(barGeo.x - ang, y + h);
        ctx.closePath();
        ctx.fill();
        const hiH = Math.max(1, Math.floor(h / 2));
        const hiAng = ang / 2;
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        // Highlight over the TOP half, same as the party cards' bars
        // (linear-gradient(to bottom, rgba(255,255,255,.28) 50%, transparent 50%)).
        ctx.moveTo(barGeo.x, y);
        ctx.lineTo(barGeo.x + fillW, y);
        ctx.lineTo(barGeo.x + fillW - hiAng, y + hiH);
        ctx.lineTo(barGeo.x - hiAng, y + hiH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = BAR_BORDER;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(barGeo.x, y);
      ctx.lineTo(barGeo.x + barGeo.w, y);
      ctx.lineTo(barGeo.x + barGeo.w - ang, y + h);
      ctx.lineTo(barGeo.x - ang, y + h);
      ctx.closePath();
      ctx.stroke();
    };

    // HP steps through the same low/critical colours the party cards do
    // (.phud-bar-low / .phud-bar-critical), including the critical pulse.
    let hpDark = "#7a1420", hpBright = "#d94a4a";
    const hpCritical = hpRate > 0 && hpRate <= CRIT_PCT / 100;
    const hpLow = !hpCritical && hpRate > 0 && hpRate <= WARN_PCT / 100;
    if (hpCritical) {
      hpBright = "#ff5a5a";
    } else if (hpLow) {
      hpDark = "#7a4a10";
      hpBright = "#e0a63a";
    }
    if (hpCritical) {
      const pulse = 1.35 + 0.35 * Math.sin(Graphics.frameCount / 8.6);
      ctx.filter = `brightness(${pulse.toFixed(2)})`;
    }
    drawGauge(MINI.hpY, hpRate, hpDark, hpBright);
    if (hpCritical) ctx.filter = "none";

    const hasMp = b.mmp > 0;
    if (hasMp) {
      drawGauge(MINI.mpY, b.mp / Math.max(1, b.mmp), "#16386e", "#4a86d9");
    }
    bitmap._baseTexture.update();

    // Depletion chunk rides on the overlay sprite, as it does on the big bar
    // (absent on the very first draw, which runs before the overlay is created)
    if (this._damageOverlay && chunkRate > hpRate) this.updateDamageOverlay();

    const isTargeted = !!(
      SceneManager._scene &&
      SceneManager._scene._enemyWindow &&
      SceneManager._scene._enemyWindow.active &&
      b.isSelected()
    );

    const level = getEnemyLevel(b);
    const rawName = window.translateText ? window.translateText(b.name()) : b.name();

    if (this._htmlOverlay) {
      const nameBoxW = Math.max(40, geo.w + MINI.ang);
      const nameEl = this._htmlOverlay.addText(
        level
          ? `<span>${rawName}</span><span class="bse-mini-level" style="--hud-ink:${enemyLevelColor(b)}">${level}</span>`
          : rawName,
        geo.x - MINI.ang,
        -2,
        nameBoxW,
        "right",
        15,
        isTargeted ? "#fff0b0" : "#ffffff",
        true,
        "black",
        1,
        "Bitter, serif",
        MINI.nameH
      );
      if (nameEl) {
        nameEl.classList.add("bse-mini-name");
        // The same ambient glow the party cards put on a targeted member's
        // name (css/game.css .phud-card.phud-targeted .phud-name).
        if (isTargeted) {
          nameEl.classList.add("bse-mini-name--targeted");
        }
        if (level) {
          // Only the name is allowed to shorten; the level tag always shows.
          nameEl.classList.add("bse-mini-name--tagged");
          nameEl.children[0].className = "bse-mini-name-text";
          nameEl.children[1].className = "bse-mini-name-tag";
        }
      }

      // The bar's own current/max value, written inside it exactly like the
      // party cards' bars do (css/game.css .phud-bar-lbl), mirrored to sit
      // against the right edge since this column is anchored to the right
      // of the screen rather than the left.
      const addBarLabel = (text, y) => {
        const el = this._htmlOverlay.addText(
          text, barGeo.x - MINI.ang, y, barGeo.w + MINI.ang, "right",
          12, "#f4ecd8", true, null, 0, "Bitter, serif", MINI.thickness
        );
        if (el) {
          el.classList.add("bse-bar-label");
        }
      };
      addBarLabel(Math.floor(b.hp) + "/" + Math.floor(b.mhp), MINI.hpY);
      if (hasMp) {
        addBarLabel(Math.floor(b.mp) + "/" + Math.floor(b.mmp), MINI.mpY);
      }

      // The AP/TP orb, exactly like the party cards' own (UI/PartyHud.js
      // _writeOrb), sitting in the gutter to the RIGHT of the gauges instead
      // of the left, since this whole card mirrors the party's rather than
      // repeating it verbatim.
      if (this._orb) {
        const maxTp = Math.max(1, b.maxTp ? b.maxTp() : 100);
        const tp = Math.max(0, Math.floor(b.tp));
        const rate = Math.max(0, Math.min(1, tp / maxTp));
        const orbTop = hasMp
          ? (MINI.hpY + MINI.mpY + MINI.thickness) / 2 - ORB_SIZE / 2
          : MINI.hpY + MINI.thickness / 2 - ORB_SIZE / 2;
        // Pulled a few pixels further in than the gutter it was carved out
        // of, so the orb sits over the tail of the gauges rather than beside
        // them, the way the party's own orb overlaps the head of theirs.
        window.UIPanel.placeAt(this._orb.orb, geo.x + geo.w - ORB_SIZE - ORB_OVERLAP, orbTop);
        window.UIPanel.setBar(this._orb.fill, (rate * 100).toFixed(1), 'h');
        window.UIPanel.setBar(this._orb.ghost, (rate * 100).toFixed(1), 'h');
        this._orb.val.textContent = String(tp);
        this._orb.orb.classList.toggle("phud-orb-empty", tp <= 0);
      }

      // The chip row: what the monster is soft to, then what is currently
      // wrong with it. Both read as the party cards' own chips do, and both
      // share the one row under the gauges, so a monster that picks up four
      // ailments mid-fight never grows a second row and never shoves the
      // monster stacked below it down the column.
      const chips = elementChipsFor(b).concat(stateChipsFor(b));
      if (chips.length > 0) {
        const chipFont = 11;
        const chipPadX = 6;
        const chipH = 16;
        const rowStartX = geo.x - MINI.ang;
        const rowMaxX = geo.x + geo.w;
        let rowX = rowStartX;
        const rowY = hasMp ? MINI.chipY : MINI.mpY;
        bitmap.fontSize = chipFont;
        bitmap.fontBold = true;
        for (const chip of chips) {
          const chipW = Math.ceil(bitmap.measureTextWidth(chip.text)) + chipPadX * 2;
          // One row only: the rest of it stays on the Check screen
          if (rowX > rowStartX && rowX + chipW > rowMaxX) break;
          const el = this._htmlOverlay.addText(
            chip.text,
            rowX,
            rowY,
            chipW,
            "center",
            chipFont,
            chip.color,
            true,
            null,
            0,
            "Bitter, serif",
            chipH - 2
          );
          if (el) {
            el.classList.add("bse-hud-chip");
            // What the ailment actually does, on hover. An element chip is
            // already its own sentence, so only a state carries one.
            if (window.StateTip) {
              if (chip.stateId) window.StateTip.mark(el, { stateId: chip.stateId });
              else window.StateTip.clear(el);
            }
            el.style.setProperty("--hud-chip-h", chipH + "px");
            el.style.setProperty("--hud-chip-pad", chipPadX + "px");
            el.style.setProperty("--hud-chip-bg", chip.background);
            el.style.setProperty("--hud-chip-edge", chip.edge);
          }
          rowX += chipW + 4;
        }
      }
    }
  };

  // Frames between two attempts to line the monster column up with the party
  // cards, while the cards are still being laid out by the browser.
  const MINI_BAR_ALIGN_RETRY = 6;

  // Where the compact bars stand: one column in the top-right corner, the same
  // corner the large single-enemy bar occupies, in troop order.
  //
  // The column stands level with the party's own cards rather than at a height
  // of its own: the first monster's gauges line up with the first member's,
  // and the stack takes the party's row pitch, so the two corners read as one
  // row of pairs. The party HUD is measured for it (UI/PartyHud.js
  // barRowMetrics), since its cards are HTML and their real height depends on
  // the font the language is set in. With the HUD switched off there is
  // nothing to line up with and the column falls back to its own top. The step
  // is squeezed when a big troop would otherwise run off the bottom.
  // Returns whether it managed to line the column up with the party, so the
  // caller can ask again next frame while the cards are still being laid out.
  function layoutMinimalEnemyBars(sprites) {
    if (!sprites || sprites.length === 0) return true;
    const w = sprites[0].bitmap ? sprites[0].bitmap.width : miniBarWidth;
    const x = Math.round(Math.max(4, Graphics.width - w - miniBarRightMargin));
    const party = window.PartyHud && window.PartyHud.barRowMetrics
      ? window.PartyHud.barRowMetrics()
      : null;
    // The sprite's own y is the top of its bitmap, while the gauge inside it
    // is drawn MINI.hpY lower down, so the offset is taken back off here.
    const top = party ? party.top - MINI.hpY : miniBarColumnTop;
    const pitch = party && party.step > 0 ? party.step : miniBarStackStep;
    const room =
      Graphics.height - top - miniBarColumnBottom - miniBarBitmapHeight;
    const step =
      sprites.length > 1
        ? Math.min(pitch, Math.max(28, room / (sprites.length - 1)))
        : pitch;
    for (let i = 0; i < sprites.length; i++) {
      sprites[i].x = x;
      sprites[i].y = Math.round(top + i * step);
    }
    return !!party;
  }

  // ==========================================================================
  // Target chevron
  // ==========================================================================
  // Which monster an action lands on is shown on the monster: a gold chevron
  // riding over its head, bobbing so it is never mistaken for scenery. The
  // engine's own picker was a box of names drawn across the middle of the
  // field, covering the very creatures it was naming. That window still exists
  // and still reads the input (every plugin that borrows it - the Check/Aim
  // menus, the card system - keeps working), but nothing of it is drawn.
  const CHEVRON_W = 34;
  const CHEVRON_H = 24;
  const CHEVRON_GAP = 12; // clear air between the chevron's tip and the head
  const CHEVRON_BOB = 5; // how far it rides up and down
  const CHEVRON_PERIOD = 22; // frames per bob
  const CHEVRON_COLOR = "#ffd700"; // the gold a targeted monster's name takes

  function makeChevronBitmap() {
    const bmp = new Bitmap(CHEVRON_W, CHEVRON_H + 4);
    const ctx = bmp.context;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(3, 4);
    ctx.lineTo(CHEVRON_W - 3, 4);
    ctx.lineTo(CHEVRON_W / 2, CHEVRON_H);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.stroke();
    ctx.fillStyle = CHEVRON_COLOR;
    ctx.fill();
    ctx.restore();
    bmp._baseTexture.update();
    return bmp;
  }

  Scene_Battle.prototype.createTargetChevron = function () {
    this._targetChevron = new Sprite(makeChevronBitmap());
    this._targetChevron.anchor.x = 0.5;
    this._targetChevron.anchor.y = 1; // the tip sits on the sprite's own y
    this._targetChevron.visible = false;
    this._targetChevronPhase = 0;
    this.addChild(this._targetChevron);
  };

  Scene_Battle.prototype.updateTargetChevron = function () {
    const chevron = this._targetChevron;
    if (!chevron) return;
    const win = this._enemyWindow;
    const picking = win && win.active && win.visible && win.isOpen();
    const enemy = picking ? win.enemy() : null;
    if (!enemy || !enemy.isAlive()) {
      chevron.visible = false;
      return;
    }
    const head = battlerHeadPosition(enemy);
    if (!head) {
      chevron.visible = false;
      return;
    }
    this._targetChevronPhase += 1;
    const bob = Math.sin(this._targetChevronPhase / CHEVRON_PERIOD) * CHEVRON_BOB;
    chevron.x = Math.round(head.x);
    chevron.y = Math.round(
      Math.max(chevron.height + 2, head.y - CHEVRON_GAP + bob)
    );
    chevron.visible = true;
  };

  const _Window_BattleEnemy_initialize = Window_BattleEnemy.prototype.initialize;
  Window_BattleEnemy.prototype.initialize = function (rect) {
    _Window_BattleEnemy_initialize.call(this, rect);
    // Kept alive for input, drawn not at all: frame, background, names and
    // cursor all go, leaving the chevron to say who is being aimed at.
    this.opacity = 0;
    this.contentsOpacity = 0;
    this.cursorVisible = false;
  };

  // ==========================================================================
  // Enemy target buttons: with 2+ living candidates the chevron says who is
  // aimed at, but a plain Attack leaves the actor's own command list standing
  // (the engine's default startEnemySelection never hides it, unlike Skill
  // and Item) - a frozen Attack/Defense/... list nothing can be done with
  // while a target is being chosen. That footprint is put to use instead: one
  // named row per candidate, replacing whatever command list sat there,
  // clickable to confirm the target. Hooked on Window_BattleEnemy itself, so
  // every caller that opens it (the ordinary attack/skill/item target,
  // Check/Aim in Health_Monsters, the card system) gets it for free, the same
  // way they already get the chevron (section 15b/7).
  // ==========================================================================
  const ENEMY_TARGET_ROW_H = 40;
  const ENEMY_TARGET_NAME_PX = 16;
  const ENEMY_TARGET_HP_PX = 15;
  // What a row spends on anything that is not text: the label's left margin,
  // the gap before the HP tail and the tail's own right margin (theme.css).
  const ENEMY_TARGET_CHROME = 14 + 18 + 12;
  const ENEMY_TARGET_MAX_W = 420;

  // Measured on a canvas of its own: the rows are HTML drawn in the UI serif, which is
  // neither the window font nor anything the engine can measure. One context
  // is kept for the whole session.
  let _hudMeasureCtx = null;
  function _hudTextWidth(text, px) {
    if (!_hudMeasureCtx) _hudMeasureCtx = document.createElement('canvas').getContext('2d');
    _hudMeasureCtx.font = `bold ${px}px 'Bitter', serif`;
    return _hudMeasureCtx.measureText(String(text || '')).width;
  }

  function _enemyTargetName(enemy) {
    const raw = enemy.name();
    return window.translateText ? window.translateText(raw) : raw;
  }

  // What the row says about the body it names, on the right edge of the row.
  function _enemyTargetHp(enemy) {
    return Math.floor(enemy.hp) + '/' + Math.floor(enemy.mhp) + ' ' + TextManager.hpA;
  }

  // A name is the whole point of the row, so the rows are as wide as the
  // longest one plus its HP rather than as wide as the command list they stand
  // in for: "Vegetal Vampire" was being cut to "Vegetal Vampi..." in a box
  // sized for "Attack".
  function _enemyTargetWidth(enemies, slot) {
    let widest = 0;
    for (const enemy of enemies) {
      widest = Math.max(widest,
        _hudTextWidth(_enemyTargetName(enemy), ENEMY_TARGET_NAME_PX) +
        _hudTextWidth(_enemyTargetHp(enemy), ENEMY_TARGET_HP_PX));
    }
    const cap = Math.min(ENEMY_TARGET_MAX_W, Graphics.boxWidth - 60);
    return Math.max(slot.w, Math.min(cap, Math.ceil(widest) + ENEMY_TARGET_CHROME));
  }

  // Cached because updateEnemyTargetButtons asks for it on every frame of the
  // battle, whether a target is being chosen or not. Re-looked-up if the node
  // ever leaves the document (a scene teardown that clears document.body).
  let _enemyTargetEl = null;
  function _enemyTargetFind() {
    if (_enemyTargetEl && _enemyTargetEl.isConnected) return _enemyTargetEl;
    _enemyTargetEl = document.getElementById('html-enemytarget-overlay');
    return _enemyTargetEl;
  }

  function _enemyTargetRoot() {
    let root = _enemyTargetFind();
    if (!root) {
      root = document.createElement('div');
      root.id = 'html-enemytarget-overlay';
      root.className = 'bse-target-list';
      document.body.appendChild(root);
      _enemyTargetEl = root;
    }
    return root;
  }

  // The rect the actor's own command list occupies, in game pixels: the
  // footprint the name rows take over while a target is being chosen.
  function _enemyTargetSlot() {
    const scene = SceneManager._scene;
    const cmdWin = scene && scene._actorCommandWindow;
    if (!cmdWin) return null;
    let pt;
    if (typeof cmdWin.getGlobalPosition === 'function') {
      pt = cmdWin.getGlobalPosition();
    } else {
      pt = { x: cmdWin.x, y: cmdWin.y };
      let node = cmdWin.parent;
      while (node) { pt.x += node.x || 0; pt.y += node.y || 0; node = node.parent; }
    }
    const pad = cmdWin.padding || 0;
    return {
      x: pt.x + pad,
      bottom: pt.y + pad + (cmdWin.innerHeight != null ? cmdWin.innerHeight : (cmdWin.height - pad * 2)),
      w: cmdWin.innerWidth != null ? cmdWin.innerWidth : (cmdWin.width - pad * 2)
    };
  }

  function _buildEnemyTargetRows(win, slot, width) {
    const root = _enemyTargetRoot();
    root.innerHTML = '';
    const enemies = win._enemies || [];
    const sel = win.index();

    enemies.forEach((enemy, i) => {
      const isSel = i === sel;
      const item = document.createElement('div');
      item.className = 'actorcmd-item' + (isSel ? '' : ' unsel');
      item.classList.add('bse-target-row');
      item.style.setProperty('--hud-w', width + 'px');

      const darkBase = document.createElement('div');
      darkBase.className = 'actorcmd-darkbase';
      item.appendChild(darkBase);

      const stripe = document.createElement('div');
      stripe.className = 'actorcmd-stripe' + (isSel ? ' sel' : '');

      item.appendChild(stripe);

      const sep = document.createElement('div');
      sep.className = 'actorcmd-sep';
      if (isSel) sep.classList.add('sel');
      item.appendChild(sep);

      const label = document.createElement('div');
      label.className = 'actorcmd-label';

      label.textContent = _enemyTargetName(enemy);
      item.appendChild(label);

      const hp = document.createElement('div');
      hp.className = 'actorcmd-cost';

      hp.textContent = _enemyTargetHp(enemy);
      item.appendChild(hp);

      // Hover moves the pick (and the chevron with it); the click confirms it,
      // the same two-step the party card touch-target already offers actors.
      item.addEventListener('mouseenter', () => {
        if (win.active && win.index() !== i) win.select(i);
      });
      item.addEventListener('pointerup', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (!win.active) return;
        win.select(i);
        win.processOk();
      });

      root.appendChild(item);
    });
  }

  // Hide/restore the actor command list around the picker's own lifetime,
  // remembering whatever visibility it already had (Attack leaves it
  // visible-but-frozen, Skill/Item already hid it before the picker opened)
  // so leaving the picker never shows a command list that was not there to
  // begin with.
  const _Window_BattleEnemy_show = Window_BattleEnemy.prototype.show;
  Window_BattleEnemy.prototype.show = function () {
    _Window_BattleEnemy_show.call(this);
    const scene = SceneManager._scene;
    const cmdWin = scene && scene._actorCommandWindow;
    if (cmdWin) {
      this._enemyTargetSavedCmdVisible = cmdWin.visible;
      cmdWin.hide();
    }
    this._enemyTargetLastIdx = null;
    this._enemyTargetLastCount = null;
  };

  const _Window_BattleEnemy_hide = Window_BattleEnemy.prototype.hide;
  Window_BattleEnemy.prototype.hide = function () {
    _Window_BattleEnemy_hide.call(this);
    const scene = SceneManager._scene;
    const cmdWin = scene && scene._actorCommandWindow;
    if (cmdWin && this._enemyTargetSavedCmdVisible) {
      cmdWin.show();
    }
    this._enemyTargetSavedCmdVisible = null;
    const root = _enemyTargetFind();
    window.UIPanel.close(root);
  };

  Scene_Battle.prototype.updateEnemyTargetButtons = function () {
    const win = this._enemyWindow;
    const root = _enemyTargetFind();
    const active = win && win.visible && win.isOpen && win.isOpen();
    if (!active) {
      window.UIPanel.close(root);
      return;
    }
    const enemies = win._enemies || [];
    const idx = win.index();
    if (
      root && root.style.display !== 'none' &&
      win._enemyTargetLastIdx === idx && win._enemyTargetLastCount === enemies.length
    ) {
      return; // nothing changed since the last frame
    }
    const slot = _enemyTargetSlot();
    if (!slot || enemies.length === 0) {
      window.UIPanel.close(root);
      return;
    }
    win._enemyTargetLastIdx = idx;
    win._enemyTargetLastCount = enemies.length;

    // The command list this stands in for is pinned to the right edge of the
    // screen, so a row wider than that list grows leftward and the two keep
    // the same right edge.
    const width = _enemyTargetWidth(enemies, slot);
    const left = slot.x + slot.w - width;
    _buildEnemyTargetRows(win, slot, width);
    const listRoot = _enemyTargetRoot();
    const sc = _hudGetScale();
    const top = slot.bottom - enemies.length * ENEMY_TARGET_ROW_H;
    window.UIPanel.open(listRoot);
    window.UIPanel.placeAt(listRoot, sc.ox + left * sc.sx, sc.oy + top * sc.sy);
    listRoot.style.setProperty('--hud-transform', `scale(${sc.sx}, ${sc.sy})`);
  };

  const _Window_SkillList_drawSkillCost =
    Window_SkillList.prototype.drawSkillCost;
  Window_SkillList.prototype.drawSkillCost = function (skill, x, y, width) {
    if (this._actor.skillTpCost(skill) > 0) {
      const tpCost = this._actor.skillTpCost(skill);
      const hasEnoughTp = this._actor.tp >= tpCost;
      if (hasEnoughTp) {
        this.changeTextColor(tpSkillColor);
      } else {
        this.changeTextColor("#888888");
      }
      this.drawText(tpCost, x, y, width, "right");
    } else if (this._actor.skillMpCost(skill) > 0) {
      const mpCost = this._actor.skillMpCost(skill);
      const hasEnoughMp = this._actor.mp >= mpCost;
      if (hasEnoughMp) {
        this.changeTextColor(mpSkillColor);
      } else {
        this.changeTextColor("#888888");
      }
      this.drawText(mpCost, x, y, width, "right");
    }
  };
  Window_SkillList.prototype.isSkillUsable = function (skill) {
    return this._actor && this._actor.canUse(skill);
  };
  const _Window_SkillList_refresh = Window_SkillList.prototype.refresh;
  Window_SkillList.prototype.refresh = function () {
    this._lastMp = this._actor ? this._actor.mp : null;
    this._lastTp = this._actor ? this._actor.tp : null;
    _Window_SkillList_refresh.call(this);
  };
  const _Window_SkillList_update = Window_SkillList.prototype.update;
  Window_SkillList.prototype.update = function () {
    _Window_SkillList_update.call(this);
    if (this._actor) {
      if (this._actor.mp !== this._lastMp || this._actor.tp !== this._lastTp) {
        this.refresh();
      }
    }
  };
  const _Window_SkillList_select = Window_SkillList.prototype.select;
  Window_SkillList.prototype.select = function (index) {
    _Window_SkillList_select.call(this, index);
    this.updateTPProjection();
  };
  // What the skill under the cursor would cost in AP, shown on the caster's own
  // orb before it is paid: the fill drops to what would be left, the dimmer
  // ring behind it stays at the current level, and the gap between the two is
  // the price. The orb belongs to the shared party HUD (UI/PartyHud.js).
  Window_SkillList.prototype.updateTPProjection = function () {
    if (!this._actor || !this.active) return;
    const skill = this.item();
    const cost = skill ? this._actor.skillTpCost(skill) : 0;
    // A skill the caster cannot pay for is quoted at their current AP rather
    // than at a negative one: the buzzer is what says they cannot cast it.
    const left = cost > 0 && this._actor.tp >= cost ? this._actor.tp - cost : null;
    window.PartyHud?.setProjectedAp?.(this._actor, left);
  };
  const _Window_SkillList_deactivate = Window_SkillList.prototype.deactivate;
  Window_SkillList.prototype.deactivate = function () {
    _Window_SkillList_deactivate.call(this);
    window.PartyHud?.setProjectedAp?.(this._actor, null);
  };
  Window_Selectable.prototype.drawItemBackground = function (index) { };
  const _Window_SkillList_drawItem = Window_SkillList.prototype.drawItem;
  Window_SkillList.prototype.drawItem = function (index) {
    if (this._actor) {
      const skill = this._data[index];
      if (skill) {
        const rect = this.itemLineRect(index);
        const costWidth = this.costWidth();
        const skillName = this._actor.canUse(skill) ? skill.name : skill.name;
        this.changePaintOpacity(this._actor.canUse(skill));
        this.drawItemName(skill, rect.x, rect.y, rect.width - costWidth);
        this.drawSkillCost(skill, rect.x, rect.y, rect.width);
        this.changePaintOpacity(true);
      }
    }
  };
  const _Window_ItemList_drawItem = Window_ItemList.prototype.drawItem;
  Window_ItemList.prototype.drawItem = function (index) {
    const item = this._data[index];
    if (item) {
      const rect = this.itemLineRect(index);
      const nameWidth = rect.width;
      this.changePaintOpacity(this.isEnabled(item));
      this.drawItemName(item, rect.x, rect.y, nameWidth);
      this.changePaintOpacity(true);
    }
  };
  const _Scene_Battle_createDisplayObjects =
    Scene_Battle.prototype.createDisplayObjects;
  Scene_Battle.prototype.createDisplayObjects = function () {
    _Scene_Battle_createDisplayObjects.call(this);
    this.createBattleHealthBars();
    // After the window layer, so the marker rides over the field rather than
    // under whatever window happens to be open.
    this.createTargetChevron();
  };
  // The bars this scene owns are the monsters', all of them, in one column in
  // the top-right corner. The party stands on the shared HUD cards over on the
  // left (UI/PartyHud.js), the same ones the map puts them on, so nothing here
  // draws a party member any more.
  Scene_Battle.prototype.createBattleHealthBars = function () {
    this._battleHealthBarSprites = [];
    const miniBars = [];
    for (const enemy of $gameTroop.members()) {
      if (!enemy.isAlive()) continue;
      const sprite = new Sprite_BattleBar(enemy, miniBarWidth);
      this.addChild(sprite);
      this._battleHealthBarSprites.push(sprite);
      miniBars.push(sprite);
    }
    layoutMinimalEnemyBars(miniBars);
  };

  Scene_Battle.prototype.createEnemyHPSprite = function (enemy) {
    const sprite = new Sprite();
    sprite._enemy = enemy;
    sprite._lastHp = enemy.hp;

    sprite.bitmap = new Bitmap(200, 30);

    // Position under the enemy battler with resolution awareness
    const enemySprite = this._spriteset._enemySprites.find(s => s._battler === enemy);
    if (enemySprite) {
      sprite.x = enemySprite.x - 100;
      sprite.y = enemySprite.y + enemySprite.height / 2 - 200;
    }

    sprite._htmlOverlay = new HtmlTextOverlay(sprite);

    sprite.destroy = function (options) {
      if (this._htmlOverlay) this._htmlOverlay.destroy();
      Sprite.prototype.destroy.call(this, options);
    };

    sprite.update = function () {
      Sprite.prototype.update.call(this);
      if (this._htmlOverlay) this._htmlOverlay.update();

      if (!this._enemy || !this._enemy.isAlive()) {
        this.visible = false;
        return;
      }

      if (this._enemy.hp !== this._lastHp) {
        this.refreshHP();
        this._lastHp = this._enemy.hp;
      }
    };

    sprite.refreshHP = function () {
      this.bitmap.clear();
      if (this._htmlOverlay) this._htmlOverlay.clear();

      const hp = this._enemy.hp;
      const maxHp = this._enemy.mhp;
      const hpRate = hp / Math.max(1, maxHp);

      let color = "#ffffff";
      if (hpRate <= 0.25) color = "#ff4444";
      else if (hpRate <= 0.5) color = "#ffff00";
      else if (hpRate <= 0.75) color = "#ffaa00";

      if (this._htmlOverlay) this._htmlOverlay.addText(`${hp}`, 0, 0, 200, "center", 20, color, true, "black", 1, "Bitter, serif", 30);
    };

    sprite.refreshHP();
    return sprite;
  };

  const _Scene_Battle_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function () {
    _Scene_Battle_update.call(this);
    this.updateBattleHealthBars();
    this.updateTargetChevron();
    this.updateEnemyTargetButtons();
  };
  Scene_Battle.prototype.updateBattleHealthBars = function () {
    const sprites = this._battleHealthBarSprites;
    if (!sprites) return;
    let living = 0;
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      if (!sprite) continue;
      if (sprite._battler) sprite.visible = sprite._battler.isAlive();
      if (sprite.visible) living++;
    }

    // Every monster's bar stacks in one column in the top-right corner,
    // never above its own sprite, standing level with the party's own cards
    // over on the left (UI/PartyHud.js). Those cards are HTML and cannot be
    // measured until the browser has laid them out, which is a frame or two
    // after the battle opens, so an unaligned column simply asks again next
    // frame rather than settling for a height of its own.
    //
    // The column only moves when a monster dies, so the list of bars is built
    // here rather than allocated every frame of every fight to compare one
    // integer against the last one.
    if (living === this._miniBarColumnCount && !this._miniBarNeedsAlign) return;
    // Measuring the party's cards forces the browser to lay the whole document
    // out (UI/PartyHud.js barRowMetrics is four getBoundingClientRect calls),
    // and the retry runs precisely while the fight is opening and the DOM is at
    // its most expensive to measure. Asking every frame bought nothing: the
    // cards need a frame or two either way, so the retry is put on its own
    // slower clock. A real change (a monster died) still lands the same frame,
    // since that comes in through the count above.
    if (this._miniBarNeedsAlign && living === this._miniBarColumnCount) {
      this._miniBarAlignWait = (this._miniBarAlignWait || 0) + 1;
      if (this._miniBarAlignWait < MINI_BAR_ALIGN_RETRY) return;
    }
    this._miniBarAlignWait = 0;
    const miniBars = sprites.filter((s) => s && s.visible);
    this._miniBarColumnCount = miniBars.length;
    this._miniBarNeedsAlign =
      !layoutMinimalEnemyBars(miniBars) && !!ConfigManager.partyHud;
  };
  const _Window_ActorCommand_initialize =
    Window_ActorCommand.prototype.initialize;

  Window_ActorCommand.prototype.initialize = function (rect) {
    if (rect) {
      const lineHeight = this.lineHeight();
      const itemPadding = this.itemPadding();
      const extraHeight = lineHeight + itemPadding * 2;
      rect.height += extraHeight;
    }
    _Window_ActorCommand_initialize.call(this, rect);
  };
  Window_ActorCommand.prototype.maxVisibleItems = function () {
    return 6;
  };
  Window_ActorCommand.prototype.numVisibleRows = function () {
    return 6;
  };
  Window_ActorCommand.prototype.windowHeight = function () {
    return this.fittingHeight(this.numVisibleRows());
  };
  const _Scene_Battle_updateActorCommandWindowPosition =
    Scene_Battle.prototype.updateActorCommandWindowPosition;
  Scene_Battle.prototype.updateActorCommandWindowPosition = function () {
    _Scene_Battle_updateActorCommandWindowPosition.call(this);
    if (
      this._actorCommandWindow.y + this._actorCommandWindow.height >
      Graphics.boxHeight
    ) {
      const overflow =
        this._actorCommandWindow.y +
        this._actorCommandWindow.height -
        Graphics.boxHeight;
      this._actorCommandWindow.y -= overflow + 4;
    }
  };
  Window_ActorCommand.prototype.updateLayoutForExtraCommand = function () {
    const height = this.windowHeight();
    if (this.height !== height) {
      this.height = height;
      this.createContents();
    }
  };
  const _Window_ActorCommand_refresh = Window_ActorCommand.prototype.refresh;
  Window_ActorCommand.prototype.refresh = function () {
    this.updateLayoutForExtraCommand();
    _Window_ActorCommand_refresh.call(this);
  };


  // Add the helper method for individual skill commands
  Window_ActorCommand.prototype.addSkillCommand = function (skillTypeId) {
    const name = $dataSystem.skillTypes[skillTypeId];
    this.addCommand(name, "skill", true, skillTypeId);
  };
  const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
  Scene_Battle.prototype.terminate = function () {
    _Scene_Battle_terminate.call(this);
    this.removeBattleHealthBars();
    if (this._targetChevron) {
      this.removeChild(this._targetChevron);
      if (typeof this._targetChevron.destroy === "function") {
        this._targetChevron.destroy({ children: true });
      }
      this._targetChevron = null;
    }
  };
  Scene_Battle.prototype.removeBattleHealthBars = function () {
    if (!this._battleHealthBarSprites) return;
    for (const sprite of this._battleHealthBarSprites) {
      if (!sprite) continue;
      this.removeChild(sprite);
      if (typeof sprite.destroy === 'function') sprite.destroy({ children: true });
    }
    this._battleHealthBarSprites = [];
  };
  // Generic alchemical override: extract cropped face from full-body bust
  Window_Base.prototype.drawFace = function(faceName, faceIndex, x, y, width, height) {
    if (!faceName) return;
    width = width || ImageManager.faceWidth;
    height = height || ImageManager.faceHeight;
    
    let bitmap = ImageManager.loadBitmap("img/busts/", faceName);
    const drawClippedFace = () => {
      const sw = bitmap.width * 0.6;
      const sh = bitmap.width * 0.6;
      const sx = (bitmap.width - sw) / 2;
      const sy = bitmap.height * 0.05; // Upper bust face area
      this.contents.blt(bitmap, sx, sy, sw, sh, x, y, width, height);
    };

    bitmap.addLoadListener(() => {
      if (bitmap.width > 0 && bitmap.height > 0) {
        drawClippedFace();
      } else {
        // Fallback to '7' if primary bust loading fails
        bitmap = ImageManager.loadBitmap("img/busts/", "7");
        bitmap.addLoadListener(drawClippedFace);
      }
    });
  };

  // Hide the legacy RPG Maker actor selection window completely
  const _Window_BattleActor_initialize = Window_BattleActor.prototype.initialize;
  Window_BattleActor.prototype.initialize = function(rect) {
    _Window_BattleActor_initialize.call(this, rect);
    this.opacity = 0;
    this.contentsOpacity = 0;
  };

  const _Window_BattleActor_show = Window_BattleActor.prototype.show;
  Window_BattleActor.prototype.show = function() {
    // Temporarily map WASD to standard directional controls for smooth targeting
    this._originalKeyMapper = Object.assign({}, Input.keyMapper);
    Input.keyMapper[87] = "up";     // W
    Input.keyMapper[83] = "down";   // S
    Input.keyMapper[65] = "left";   // A
    Input.keyMapper[68] = "right";  // D
    
    _Window_BattleActor_show.call(this);
    this.opacity = 0;
    this.contentsOpacity = 0;
  };

  const _Window_BattleActor_hide = Window_BattleActor.prototype.hide;
  Window_BattleActor.prototype.hide = function() {
    _Window_BattleActor_hide.call(this);
    // Restore original key mappings when targeting is finished
    if (this._originalKeyMapper) {
      Input.keyMapper = this._originalKeyMapper;
      this._originalKeyMapper = null;
    }
  };

  // Prevent drawing legacy actor status/text at the bottom
  Window_BattleActor.prototype.drawItem = function(index) {
    // Do absolutely nothing to ensure legacy text is removed
  };

  // Override processCursorMove to support WASD, arrow keys, and gamepad D-pad in all directions
  Window_BattleActor.prototype.processCursorMove = function() {
    if (this.isCursorMovable()) {
      const maxItems = this.maxItems();
      if (maxItems > 0) {
        const lastIndex = this.index();
        if (Input.isRepeated("up") || Input.isRepeated("left")) {
          this.select((this.index() - 1 + maxItems) % maxItems);
        } else if (Input.isRepeated("down") || Input.isRepeated("right")) {
          this.select((this.index() + 1) % maxItems);
        }
        if (this.index() !== lastIndex) {
          this.playCursorSound();
        }
      }
    }
  };

  //=============================================================================
  // Battle Hotbar , Daggerfall-style quickbar of the acting member's first
  // nine synced (carried) skills. Numbers 1-9 arm a slot while held and cast
  // it on release; the bar itself
  // can take keyboard/gamepad focus away from the actor command window with
  // Left/Right or L1/R1 (pageup/pagedown), since that vertical list never uses
  // horizontal input of its own (Window_ActorCommand.maxCols() is 1, so
  // cursorLeft/cursorRight are already no-ops there) and its few rows fit on
  // one page (so cursorPageup/Pagedown are no-ops too). See window.BattleHotbar.
  //=============================================================================
  const HOTBAR_SLOTS = 9;
  const HOTBAR_SLOT_PX = 52;
  const HOTBAR_MARGIN_BOTTOM = 10; // how close the bar itself sits to the bottom edge
  const HOTBAR_LOG_GAP = 8; // extra clearance kept between the log's own reserve and the bar
  // The armed skill's name rides under the row, between it and the bottom edge.
  const HOTBAR_LABEL_PX = (window.HotbarUI && window.HotbarUI.LABEL_BLOCK_PX) || 0;

  // MPP_SmoothBattleLog2.js reads this to keep the log clear of the bar.
  window.BattleHotbar = window.BattleHotbar || {};
  window.BattleHotbar.reservedHeight =
    HOTBAR_SLOT_PX + HOTBAR_LABEL_PX + HOTBAR_MARGIN_BOTTOM + HOTBAR_LOG_GAP;
  // Where the row of slots ends, in canvas pixels. The command list next to it
  // stands on the same line (BattleSystemEnhanchedCommands.js) so the two read
  // as one bar across the bottom of the screen.
  window.BattleHotbar.slotBottomY = function () {
    return Graphics.height - HOTBAR_MARGIN_BOTTOM - HOTBAR_LABEL_PX;
  };

  let _hotbarActive = false; // true once the bar, rather than the command list, owns direction input
  let _hotbarIndex = 0;
  // A member carrying more skills than the row has slots reads them a page of
  // nine at a time; the chevrons at either end of the row say so, and Left /
  // Right turns the page once the cursor walks off the end of the one shown.
  let _hotbarPage = 0;
  let _hotbarActor = null;
  // Window_ActorCommand.processCursorMove hands off focus on the same Left/
  // Right press that updateBattleHotbar (later in the very same frame) would
  // otherwise also read as a repeat and step again; this eats that one frame.
  let _hotbarJustActivated = false;

  // The slot row itself, its markup, tooltip and canvas-synced placement, is
  // the shared widget (Core/HotbarUI.js); the item favourites bar on the map
  // is the same thing with a different set of entries behind it.
  const _hotbarBar = new HotbarUI({
    id: 'html-hotbar-overlay',
    slots: HOTBAR_SLOTS,
    slotPx: HOTBAR_SLOT_PX,
    marginBottom: HOTBAR_MARGIN_BOTTOM,
    zIndex: 352,
    showLabel: true,
    onSlotClick: (i) => {
      const actor = BattleManager.actor();
      const page = _hotbarPageSkills(_hotbarSkills(actor));
      if (page[i]) _hotbarUseSkill(actor, page[i]);
    },
    onPagePrev: () => _hotbarTurnPage(-1),
    onPageNext: () => _hotbarTurnPage(1)
  });

  // The carried loadout first, then the skills that cost it no slot (the
  // basics, and whatever a piece of kit or a state lends the member): those
  // are castable too, so the bar reaches them rather than pretending they are
  // not there. A body's own limb moves are left out; they belong to the parts
  // menu, not to the quick bar.
  function _hotbarSkills(actor) {
    if (!actor || !window.BattleLoadout) return [];
    const LO = window.BattleLoadout;
    const carried = LO.ids(actor).map(id => $dataSkills[id]).filter(Boolean);
    const seen = new Set(carried.map(skill => skill.id));
    const anatomy = (window.HealthCore && window.HealthCore.anatomySkillIds)
      ? window.HealthCore.anatomySkillIds(actor) : null;
    const known = typeof actor.skills === 'function' ? actor.skills() : [];
    const extra = typeof LO.isAlwaysCarried !== 'function' ? [] : known.filter(skill =>
      skill && !seen.has(skill.id) && LO.isAlwaysCarried(actor, skill) &&
      !(anatomy && anatomy.has(skill.id)));
    return carried.concat(extra);
  }

  // How many pages of nine the carried skills fill, and the slice standing on
  // the row right now. A bar that fits in one page never shows a chevron.
  function _hotbarPageCount(skills) {
    return Math.max(1, Math.ceil(skills.length / HOTBAR_SLOTS));
  }

  function _hotbarPageSkills(skills) {
    const pages = _hotbarPageCount(skills);
    if (_hotbarPage >= pages) _hotbarPage = 0;
    return skills.slice(_hotbarPage * HOTBAR_SLOTS, (_hotbarPage + 1) * HOTBAR_SLOTS);
  }

  // Turn to the next / previous page, wrapping at either end, and land the
  // cursor on the edge the player came in from.
  function _hotbarTurnPage(step) {
    const skills = _hotbarSkills(BattleManager.actor() || _hotbarActor);
    const pages = _hotbarPageCount(skills);
    if (pages < 2) return false;
    _hotbarPage = (_hotbarPage + step + pages) % pages;
    const shown = _hotbarPageSkills(skills);
    _hotbarIndex = step > 0 ? 0 : Math.max(0, shown.length - 1);
    SoundManager.playCursor();
    return true;
  }

  // The tooltip shows the skill's name and its cost only, nothing else.
  function _hotbarTooltipText(actor, skill) {
    let costText = '';
    if (actor.skillTpCost(skill) > 0) {
      costText = `${actor.skillTpCost(skill)} ${TextManager.tp}`;
    } else if (actor.skillMpCost(skill) > 0) {
      costText = `${actor.skillMpCost(skill)} ${TextManager.mp}`;
    }
    return costText ? `${skill.name} - ${costText}` : skill.name;
  }

  function _hotbarEntries(actor, skills) {
    const entries = [];
    const shown = _hotbarPageSkills(skills);
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const skill = shown[i];
      entries.push(skill ? {
        iconIndex: skill.iconIndex,
        enabled: actor.canUse(skill),
        tooltip: _hotbarTooltipText(actor, skill)
      } : null);
    }
    return entries;
  }

  // Casts exactly the way choosing the skill from the ordinary skill list
  // and confirming it would (Scene_Battle.prototype.onSkillOk): the skill
  // and item windows are stood down first since either may be sitting open
  // underneath the bar.
  // True while the fight is being played out on the map instead of in
  // Scene_Battle (BattleSystem/MapBattleMode.js). The bar is the same bar and
  // the actor's carried skills are the same skills; only the windows it has to
  // stand down and the call that hands the chosen action on differ.
  function _hotbarOnMap() {
    return !!(window.MapBattleMode && window.MapBattleMode.isActive());
  }

  function _hotbarUseSkill(actor, skill) {
    const scene = SceneManager._scene;
    const onMap = _hotbarOnMap();
    if (!onMap && !(scene instanceof Scene_Battle)) return false;
    if (!BattleManager.isInputting() || BattleManager.actor() !== actor) return false;
    const action = BattleManager.inputtingAction();
    if (!action) return false;
    if (!actor.canUse(skill)) {
      SoundManager.playBuzzer();
      return false;
    }
    const MBM = window.MapBattleMode;
    // On the map the skill and item lists belong to MapBattleMode, not to the
    // scene; everywhere else they are the scene's own.
    const host = onMap ? MBM : scene;
    if (host._skillWindow) { host._skillWindow.deactivate(); host._skillWindow.hide(); }
    if (host._itemWindow) { host._itemWindow.deactivate(); host._itemWindow.hide(); }
    // The skill list may be open as rows in the command menu
    // (CategorizedBattleSkills.js); the bar casts straight past it.
    const cmdWindow = onMap ? MBM._cmdWindow : scene._actorCommandWindow;
    if (window.BattleSkillMenu) window.BattleSkillMenu.close(cmdWindow);
    _hotbarActive = false;
    action.setSkill(skill.id);
    actor.setLastBattleSkill(skill);
    SoundManager.playOk();
    if (onMap) {
      // Same landing as picking the skill out of the map-battle skill list:
      // close the command window, then either pass the turn on or open the
      // tile cursor when the action needs a target.
      MBM._closeCommandWindow();
      MBM._closeSubWindows();
      MBM._afterActionSelected();
    } else {
      scene.onSelectAction();
    }
    return true;
  }

  // The bar is centred on the whole screen, not just the (off-center) log
  // column, and held well clear of the log above it (see HOTBAR_LOG_GAP).
  function _updateHotbarPosition(actor, skills) {
    // A held number key names its slot the same way bar focus does, without
    // taking direction input off the command list.
    const armed = _hotbarKeyArmed !== null;
    _hotbarBar.render(_hotbarEntries(actor, skills), {
      selected: armed ? _hotbarKeyArmed : _hotbarIndex,
      active: _hotbarActive || armed,
      page: _hotbarPage,
      pages: _hotbarPageCount(skills)
    });

    // Dim the command list while the bar holds direction focus, so it never
    // reads as two things arguing over which is selected.
    const cmdRoot = document.getElementById('html-actorcmd-overlay');
    if (cmdRoot) cmdRoot.classList.toggle('bse-dimmed', !!_hotbarActive);
  }

  function _hideHotbar() {
    _hotbarBar.hide();
    const cmdRoot = document.getElementById('html-actorcmd-overlay');
    if (cmdRoot) cmdRoot.classList.remove('bse-dimmed');
  }

  const _Scene_Battle_update_hotbar = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function () {
    _Scene_Battle_update_hotbar.call(this);
    this.updateBattleHotbar();
  };

  // Which number key currently holds the bar (null for none), and which of
  // them are still down but already spent by a later press.
  let _hotbarKeyArmed = null;
  let _hotbarKeySpent = [];

  function _clearHotbarKeys() {
    _hotbarKeyArmed = null;
    _hotbarKeySpent = [];
  }

  // Returns true once a held key has been released and its skill cast.
  function _updateHotbarKeyHold(actor, allSkills) {
    const skills = _hotbarPageSkills(allSkills);
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      if (!skills[i] || !Input.isTriggered(String(i + 1))) continue;
      // Whatever was armed before is now just a key waiting to be let go.
      if (_hotbarKeyArmed !== null && _hotbarKeyArmed !== i) {
        _hotbarKeySpent.push(_hotbarKeyArmed);
      }
      _hotbarKeyArmed = i;
    }
    _hotbarKeySpent = _hotbarKeySpent.filter(i => Input.isPressed(String(i + 1)));
    if (_hotbarKeyArmed === null) return false;
    if (!skills[_hotbarKeyArmed]) {
      _clearHotbarKeys();
      return false;
    }
    if (Input.isPressed(String(_hotbarKeyArmed + 1))) return false;
    const skill = skills[_hotbarKeyArmed];
    _clearHotbarKeys();
    _hotbarUseSkill(actor, skill);
    return true;
  }

  // `inert` draws the bar but answers nothing: MapBattleMode passes it while
  // the tile cursor, a walk animation or the talk menu owns the keyboard, so a
  // number key aimed at those never also fires a slot.
  function _updateBattleHotbar(inert) {
    const actor = BattleManager.actor();
    const inputting = !!actor && BattleManager.isInputting() && !$gameMessage.isBusy();
    if (!inputting) {
      // Freeze on the last actor's bar instead of hiding it: it should stay
      // on screen through that actor's own action, not pop out the instant
      // input ends and back in for whoever's turn comes next.
      if ($gameMessage.isBusy() || !_hotbarActor) {
        _hotbarActive = false;
        _hotbarActor = null;
        _hideHotbar();
        return;
      }
      const frozenSkills = _hotbarSkills(_hotbarActor);
      if (frozenSkills.length === 0) {
        _hotbarActive = false;
        _hotbarActor = null;
        _hideHotbar();
        return;
      }
      _hotbarActive = false;
      _updateHotbarPosition(_hotbarActor, frozenSkills);
      return;
    }
    if (actor !== _hotbarActor) {
      _hotbarActor = actor;
      _clearHotbarKeys();
      _hotbarActive = false;
      _hotbarIndex = 0;
      _hotbarPage = 0;
    }
    const skills = _hotbarSkills(actor);
    if (skills.length === 0) {
      _hideHotbar();
      return;
    }

    // Number keys arm rather than cast: holding one only names its skill on
    // the line under the row, and the cast happens when that key is let go.
    // Pressing a second number while the first is still down re-arms onto the
    // new one, and the keys underneath it are spent, so releasing them later
    // does nothing.
    if (inert) {
      _hotbarActive = false;
      _clearHotbarKeys();
      _updateHotbarPosition(actor, skills);
      return;
    }

    if (_updateHotbarKeyHold(actor, skills)) return;

    if (_hotbarActive) {
      if (_hotbarJustActivated) {
        // The keypress that handed focus over was already consumed by
        // Window_ActorCommand.processCursorMove this same frame.
        _hotbarJustActivated = false;
      } else if (Input.isTriggered('cancel') || Input.isTriggered('up')) {
        _hotbarActive = false;
        SoundManager.playCancel();
      } else if (Input.isRepeated('left') || Input.isRepeated('pageup')) {
        // pageup/pagedown are the shoulder buttons L1/R1 (CustomCommandMapper.js).
        // Walking off the near end of a paged row turns to the page before it.
        const shown = _hotbarPageSkills(skills);
        if (_hotbarIndex <= 0 && !_hotbarTurnPage(-1)) {
          _hotbarIndex = shown.length - 1;
          SoundManager.playCursor();
        } else if (_hotbarIndex > 0) {
          _hotbarIndex -= 1;
          SoundManager.playCursor();
        }
      } else if (Input.isRepeated('right') || Input.isRepeated('pagedown')) {
        const shown = _hotbarPageSkills(skills);
        if (_hotbarIndex >= shown.length - 1 && !_hotbarTurnPage(1)) {
          _hotbarIndex = 0;
          SoundManager.playCursor();
        } else if (_hotbarIndex < shown.length - 1) {
          _hotbarIndex += 1;
          SoundManager.playCursor();
        }
      } else if (Input.isTriggered('ok')) {
        const shown = _hotbarPageSkills(skills);
        if (shown[_hotbarIndex]) _hotbarUseSkill(actor, shown[_hotbarIndex]);
      }
    }

    _updateHotbarPosition(actor, skills);
  }

  Scene_Battle.prototype.updateBattleHotbar = _updateBattleHotbar;

  // MapBattleMode.js drives the very same bar from Scene_Map, where there is
  // no Scene_Battle to hang an update on: without this the spell quickbar
  // simply never appeared once a fight was played out on the map.
  window.BattleHotbar.update = _updateBattleHotbar;
  window.BattleHotbar.hide = function () {
    _hotbarActive = false;
    _clearHotbarKeys();
    _hotbarActor = null;
    _hideHotbar();
  };

  const _Scene_Battle_terminate_hotbar = Scene_Battle.prototype.terminate;
  Scene_Battle.prototype.terminate = function () {
    _hotbarActive = false;
    _clearHotbarKeys();
    _hotbarActor = null;
    _hideHotbar();
    _Scene_Battle_terminate_hotbar.call(this);
  };

  // Left/Right (and L1/R1, i.e. pageup/pagedown) hand focus to the bar from
  // the actor command list, entering on its last carried skill or its first
  // respectively; every other key (up/down/ok/cancel) is untouched. While the
  // bar holds focus the list's own cursor movement and OK/Cancel are suspended
  // so the two never fight over the same key press.
  const _Window_ActorCommand_processCursorMove_hotbar = Window_ActorCommand.prototype.processCursorMove;
  Window_ActorCommand.prototype.processCursorMove = function () {
    if (_hotbarActive) return;
    const back = Input.isTriggered('left') || Input.isTriggered('pageup');
    const fwd = Input.isTriggered('right') || Input.isTriggered('pagedown');
    if (this.isCursorMovable() && (back || fwd)) {
      const skills = _hotbarSkills(this._actor);
      if (skills.length > 0) {
        _hotbarActive = true;
        _hotbarJustActivated = true;
        _hotbarIndex = back ? skills.length - 1 : 0;
        SoundManager.playCursor();
        return;
      }
    }
    _Window_ActorCommand_processCursorMove_hotbar.call(this);
  };

  const _Window_ActorCommand_processHandling_hotbar = Window_ActorCommand.prototype.processHandling;
  Window_ActorCommand.prototype.processHandling = function () {
    if (_hotbarActive) return;
    _Window_ActorCommand_processHandling_hotbar.call(this);
  };
})();

//=============================================================================
// Enemy-attack animations aimed at the party: sound only
//
// This is a front-view battle: the party stands on the shared HUD cards in the
// top-left (UI/PartyHud.js), so there are no Sprite_Actor targets for the
// engine to play animations over. Drawing the effect over the cards buried
// them, so an enemy action aimed at the party is now heard and not seen: the
// animation's sound timings play on schedule and nothing is rendered.
//=============================================================================
(() => {
  "use strict";

  // SEs waiting for their frame, drained once per battle-scene update.
  let _pendingSounds = [];

  // MV animations carry a frames table; MZ (Effekseer) ones do not.
  function isMVAnimation(animation) {
    return !!animation.frames;
  }

  // Queue every SE of an animation at its own frame offset. MV animations step
  // once every 4 game frames (Sprite_AnimationMV's rate), so their timings are
  // scaled; MZ sound timings are already in game frames.
  function queueAnimationSounds(animationId) {
    const animation = $dataAnimations && $dataAnimations[animationId];
    if (!animation) return;
    const mv = isMVAnimation(animation);
    const timings = (mv ? animation.timings : animation.soundTimings) || [];
    const rate = mv ? 4 : 1;
    for (const timing of timings) {
      if (!timing || !timing.se) continue;
      const delay = Math.max(0, Math.round((timing.frame || 0) * rate));
      if (delay <= 0) AudioManager.playSe(timing.se);
      else _pendingSounds.push({ delay, se: timing.se });
    }
  }

  function updatePendingSounds() {
    if (!_pendingSounds.length) return;
    const still = [];
    for (const entry of _pendingSounds) {
      if (--entry.delay <= 0) AudioManager.playSe(entry.se);
      else still.push(entry);
    }
    _pendingSounds = still;
  }

  function clearPendingSounds() {
    _pendingSounds = [];
  }

  const _Scene_Battle_update_animSounds = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function () {
    _Scene_Battle_update_animSounds.call(this);
    updatePendingSounds();
  };

  const _Scene_Battle_terminate_animSounds = Scene_Battle.prototype.terminate;
  Scene_Battle.prototype.terminate = function () {
    clearPendingSounds();
    _Scene_Battle_terminate_animSounds.call(this);
  };

  const _WBL_showAnimation = Window_BattleLog.prototype.showAnimation;
  Window_BattleLog.prototype.showAnimation = function (subject, targets, animationId) {
    // Map Battle Mode (MapBattleMode.js): combatants are real map characters,
    // not portrait cards, so let the default engine targeting reach their
    // actual on-map sprite instead of silencing the effect.
    if (window.MapBattleMode && window.MapBattleMode.isActive()) {
      _WBL_showAnimation.call(this, subject, targets, animationId);
      return;
    }
    if (animationId > 0 && subject && subject.isEnemy && subject.isEnemy() && Array.isArray(targets)) {
      const actorTargets = targets.filter(t => t && t.isActor && t.isActor());
      if (actorTargets.length > 0) {
        queueAnimationSounds(animationId);
        // Let any non-actor targets keep the default handling.
        const otherTargets = targets.filter(t => !(t && t.isActor && t.isActor()));
        if (otherTargets.length > 0) {
          _WBL_showAnimation.call(this, subject, otherTargets, animationId);
        }
        return;
      }
    }
    _WBL_showAnimation.call(this, subject, targets, animationId);
  };

  window.BattleSystemEnhanced = window.BattleSystemEnhanced || {};
  window.BattleSystemEnhanced.EnemyAnimationSound = {
    queue: queueAnimationSounds,
    update: updatePendingSounds,
    clear: clearPendingSounds,
    pending: () => _pendingSounds.slice()
  };
})();
