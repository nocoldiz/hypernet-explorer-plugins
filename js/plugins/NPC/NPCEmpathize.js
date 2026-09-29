/*:
 * @target MZ
 * @plugindesc NPCEmpathize v3.0.0, NPC Interaction Logic
 * @author Omni-Lex
 * @help NPCEmpathize.js
 *
 * Core logic for the NPC Interaction Panel.
 * Must be listed BEFORE NPCEmpathizeUI.js in the Plugin Manager.
 *
 * Load Order:
 *   MarkovTextGenerator → NPCSystem → NPCSociety → NPCSimulationCore
 *   → NPCSystemParty → NPCEmpathize → NPCEmpathizeUI → MousePan → VisualNovelBustSystem
 *
 * Data files:
 *   data/personalityData.json , personality → markov db array map
 *   js/i18n/<lang>/plugins/Empathize.json, panel copy (via the shared resolver)
 *
 * @command Open
 * @desc Open the NPC dialogue panel for the active event (or a named event).
 *
 * @arg eventName
 * @text NPC Event Name
 * @type string
 * @default
 * @desc Leave blank to auto-detect the triggering NPC event, or supply an exact name.
 */

(() => {
  'use strict';

  const pluginName = 'NPCEmpathize';
  // ============================================================================
  // SECTION 4, INPUT PASSTHROUGH PATCH
  // ============================================================================

  const _Input_shouldPreventDefault_base = Input._shouldPreventDefault;
  Input._shouldPreventDefault = function (keyCode) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
    return _Input_shouldPreventDefault_base.call(this, keyCode);
  };

  // ============================================================================
  // SECTION 5, SCENE RESUME HOOK
  // ============================================================================

  const _Scene_Map_update_dlg = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update_dlg.call(this);
    if ($gameTemp._NPCEmpathizeReturnEvId != null) {
      const _safeEvId = $gameTemp._NPCEmpathizeReturnEvId;
      // Deferred tidy-up of the event the panel was launched from. The launch
      // event's paused interpreter and its starting flag were already cleared
      // synchronously in _releaseEventLock, so this pass exists ONLY to release a
      // lock that nothing else will ever release (a panel closed by an unusual
      // path).
      //
      // It must never clear _starting. This runs at the END of Scene_Map.update,
      // i.e. AFTER player input has been processed, so any _starting flag standing
      // here belongs to a BRAND NEW interaction the player just began, never to
      // the closed panel. Plenty of code queues a start without consuming it in
      // the same frame (a world-map Teleport, an event-touch trigger, a start
      // queued behind another starting event, the sit-mode re-check), and the
      // engine picks all of those up in Game_Map.updateInterpreter on the next
      // frame. Wiping the flag here is what made an NPC, or the next NPC walked
      // up to, silently refuse to talk right after the panel closed. The engine
      // can never be wedged by a stray _starting either: setupStartingMapEvent
      // consumes one every single frame, so leaving it alone is always safe.
      //
      // The lock is only released on a quiet frame (no interpreter running,
      // nothing starting), so the lock let go of is never one belonging to a
      // conversation that is live right now.
      const _interp = $gameMap?._interpreter;
      const _quiet  = !!$gameMap && !_interp?.isRunning() && !$gameMap.isAnyEventStarting();
      if (_quiet) {
        const _ev = $gameMap.event(_safeEvId);
        if (_ev && _ev._locked) _ev.unlock();
        $gameTemp._NPCEmpathizeReturnEvId     = null;
        $gameTemp._NPCEmpathizeReturnFrames   = 0;
      } else {
        // Someone is talking. Give them room, but give up before the id goes
        // stale: NPCSystem recycles event slots, so an id held too long stops
        // meaning the NPC the panel was opened on.
        $gameTemp._NPCEmpathizeReturnFrames = ($gameTemp._NPCEmpathizeReturnFrames ?? 0) + 1;
        if ($gameTemp._NPCEmpathizeReturnFrames > 120) {
          $gameTemp._NPCEmpathizeReturnEvId   = null;
          $gameTemp._NPCEmpathizeReturnFrames = 0;
        }
      }
    }
    if ($gameTemp._NPCEmpathizeTalkId != null) {
      const evId = $gameTemp._NPCEmpathizeTalkId;
      $gameTemp._NPCEmpathizeTalkId = null;
      $gameTemp._NPCEmpathizeBypass = true;
      try { $gameMap.event(evId)?.start(); }
      catch (e) { console.error('[NPCEmpathize] resume Talk failed', evId, e); }
    }
    if ($gameTemp._NPCEmpathizeOpenTrade) {
      const { goods, sellFactor, trader } = $gameTemp._NPCEmpathizeOpenTrade;
      $gameTemp._NPCEmpathizeOpenTrade = null;
      // Who the party is trading with: a one-of-a-kind piece sold to them is
      // theirs to carry (NPCUniqueGear.onShopSale, Quest/ThinkerMenu.js).
      $gameTemp._npcTradeWith          = trader || null;
      $gameTemp._npcTradeSellFactor    = sellFactor;
      SceneManager.push(Scene_Shop);
      SceneManager.prepareNextScene(goods, false);
    }
    // The card table is handed over the same way the shop is: the panel closes
    // first and the duel opens from the map, so the overlay is never left
    // hanging behind a scene it does not own.
    // The Ask / Tell board is handed back the same way: the panel is gone by
    // the time the choices are put up, so the grid has the screen to itself.
    if ($gameTemp._NPCEmpathizeOpenStoryAsk) {
      const speaker = $gameTemp._NPCEmpathizeOpenStoryAsk;
      $gameTemp._NPCEmpathizeOpenStoryAsk = null;
      try { window.StoryDialogue?.ask?.($gameMap?.mapId?.(), speaker); }
      catch (e) { console.error('[NPCEmpathize] open story ask failed', e); }
    }
    if ($gameTemp._NPCEmpathizeOpenCardDuel) {
      const config = $gameTemp._NPCEmpathizeOpenCardDuel;
      $gameTemp._NPCEmpathizeOpenCardDuel = null;
      if (window.CardDuel) window.CardDuel.start(config);
    }
    // And the Ask / Tell board, which is a choice window and so belongs to the
    // map rather than to an overlay that is on its way out. What is carried
    // across is who was doing the talking: the panel is opened on whoever the
    // switcher has focused, and that is rarely the party leader.
    if ($gameTemp._NPCEmpathizeOpenStoryAsk) {
      const speaker = $gameTemp._NPCEmpathizeOpenStoryAsk;
      $gameTemp._NPCEmpathizeOpenStoryAsk = null;
      window.StoryDialogue?.ask?.($gameMap?.mapId?.(), speaker);
    }
    if ($gameTemp._NPCEmpathizeStartBattle != null) {
      const troopId = $gameTemp._NPCEmpathizeStartBattle;
      const victim  = $gameTemp._NPCEmpathizeAttackTarget;
      const face    = $gameTemp._NPCEmpathizeAttackFace;
      const proxy   = $gameTemp._NPCEmpathizeAttackProxy;
      $gameTemp._NPCEmpathizeStartBattle  = null;
      $gameTemp._NPCEmpathizeAttackTarget = null;
      $gameTemp._NPCEmpathizeAttackFace   = null;
      $gameTemp._NPCEmpathizeAttackProxy  = null;
      // Armed only for the troop's own setup (SECTION 5d, Game_Enemy.setup).
      $gameTemp._NPCEmpathizeProxy = proxy ?? null;
      try { BattleManager.setup(troopId, true, false); }
      finally { $gameTemp._NPCEmpathizeProxy = null; }
      // Armed after setup on purpose: the setup hook in SECTION 5b clears both
      // markers, so a battle begun any other way can never inherit this victim
      // or wear their face.
      $gameTemp._NPCEmpathizeBattleTarget = victim ?? null;
      $gameTemp._NPCEmpathizeBattleFace   = face ?? null;
      SceneManager.push(Scene_Battle);
    }
  };

  // ============================================================================
  // SECTION 5b, OUTCOME OF AN ATTACKED NPC
  // ============================================================================
  // Killing the NPC the player set on from the panel flips that event's self
  // switch A, the same page swap a recruited NPC gets, so the map author decides
  // what is left standing there (a corpse page, an empty one, nothing). Only a
  // kill counts: fleeing the fight, or being beaten by them, leaves the NPC and
  // their page exactly as they were.

  const _BattleManager_setup_npcAttack = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    if ($gameTemp) {
      $gameTemp._NPCEmpathizeBattleTarget = null;
      $gameTemp._NPCEmpathizeBattleFace   = null;
    }
    _BattleManager_setup_npcAttack.call(this, troopId, canEscape, canLose);
  };

  const _BattleManager_processVictory_npcAttack = BattleManager.processVictory;
  BattleManager.processVictory = function () {
    const victim = $gameTemp?._NPCEmpathizeBattleTarget;
    if (victim) {
      $gameTemp._NPCEmpathizeBattleTarget = null;
      // A win is not always a kill: an enemy that runs off leaves the troop
      // with nobody alive in it and still ends the fight in victory. Bodies
      // only, so an NPC who got away is still there to be found.
      const troop  = $gameTroop?.members() ?? [];
      const killed = troop.length > 0 && troop.every(e => e.hp <= 0);
      if (killed && $gameSelfSwitches) _settleNpcBattle(victim, troop[0]);
      else if (troop[0]) _writeBattleWounds(victim.name, troop[0]);
    }
    _BattleManager_processVictory_npcAttack.call(this);
  };

  // A fight that ends any other way (the party ran, or lost) still leaves its
  // marks on the person they fought: the health and the wounds are theirs to
  // carry off (SECTION 5d, _writeBattleWounds).
  const _BattleManager_endBattle_npcAttack = BattleManager.endBattle;
  BattleManager.endBattle = function (result) {
    const victim = $gameTemp?._NPCEmpathizeBattleTarget;
    if (victim && result !== 0) {
      $gameTemp._NPCEmpathizeBattleTarget = null;
      const enemy = $gameTroop?.members?.()?.[0];
      if (enemy) {
        try { _writeBattleWounds(victim.name, enemy); }
        catch (e) { console.warn('[NPCEmpathize] battle wounds not written', e); }
      }
    }
    return _BattleManager_endBattle_npcAttack.call(this, result);
  };

  // ============================================================================
  // SECTION 5d, THE PERSON AS THE TROOP, AND WHAT A WIN LEAVES OF THEM
  // ============================================================================
  // A fight picked from the panel is fought against a Humanoid proxy enemy
  // (NPC_PROXY_ENEMY_ID, the Overworked Villager for its body plan and its
  // moves) that wears the person's own level, stats, health and name, in a
  // scratch troop slot of its own (the arena's trick). The body parts it is
  // hit on are the Humanoid ones, so a Blunt finish reads the way it does
  // for every battler (HealthCore.wasBluntDowned):
  //   downed  a Blunt finishing blow, every vital part intact: they are left
  //           lying there (NPCDowned.downByParty) and the charge is
  //           aggravated assault;
  //   dead    anything else: NPCLifeSim.killNpc, and the charge is murder.
  // Either way the money they had on them is the party's, not the troop's.
  // Somebody wanted is brought down lawfully: no charge, the bounty paid.

  const NPC_PROXY_ENEMY_ID = 291;
  // i18n-ignore-start: CrimeSystem preset ids, death cause ids, outcome ids
  const NPC_ASSAULT_CRIME = 'assault';
  const NPC_BATTLE_CAUSE  = 'battle';
  // i18n-ignore-end
  let _npcProxyTroopSlot = null;

  function _npcProxyTroopId() {
    if (_npcProxyTroopSlot && $dataTroops[_npcProxyTroopSlot]?._npcProxyScratch) return _npcProxyTroopSlot;
    _npcProxyTroopSlot = $dataTroops.length;
    const pages = JsonEx.makeDeepCopy($dataTroops[2]?.pages || []);
    for (const pg of pages) pg.list = [{ code: 0, indent: 0, parameters: [] }];
    $dataTroops[_npcProxyTroopSlot] = {
      id: _npcProxyTroopSlot, name: '', pages,
      members: [{ enemyId: NPC_PROXY_ENEMY_ID, x: 408, y: 436, hidden: false }],
      _npcProxyScratch: true
    };
    return _npcProxyTroopSlot;
  }

  // The proxy's data: a copy of the base enemy with the person on it.
  function _buildNpcProxy(npcName, profile) {
    const base = $dataEnemies?.[NPC_PROXY_ENEMY_ID];
    if (!base || !npcName) return null;
    const data = JsonEx.makeDeepCopy(base);
    const level = Math.max(1, Number(profile?.level) || 1);
    const stat = (k, i) => {
      const v = Number(profile?.[k] ?? profile?.stats?.[k]);
      return Math.max(1, Math.round(isFinite(v) && v > 0 ? v : (base.params[i] || 1)));
    };
    data.params = [stat('mhp', 0), stat('mmp', 1), stat('atk', 2), stat('def', 3),
      stat('mat', 4), stat('mdf', 5), stat('agi', 6), stat('luk', 7)];
    // Their implants add their parameters (NPCSim.Implants, Phase I).
    const implant = window.NPCSim?.Implants?.paramBonus?.(profile);
    if (implant) data.params = data.params.map((v, i) => Math.max(1, v + (Number(implant[i]) || 0)));
    data.name = npcName;
    const note = String(base.note || '');
    data.note = /<Level:\s*\d+>/i.test(note)
      ? note.replace(/<Level:\s*\d+>/i, '<Level: ' + level + '>')
      : note + '\n<Level: ' + level + '>';
    if (!/<Archetype:\s*Humanoid>/i.test(data.note)) data.note += '\n<Archetype: Humanoid>';
    data.gold = 0;
    data.dropItems = [];
    data.exp = Math.max(1, level * 10);
    const hp = typeof profile?.hp === 'number' && profile.hp > 0 ? Math.round(profile.hp) : null;
    return { enemyId: NPC_PROXY_ENEMY_ID, name: npcName, data, hp };
  }

  const _Game_Enemy_setup_npcProxy = Game_Enemy.prototype.setup;
  Game_Enemy.prototype.setup = function (enemyId, x, y) {
    const proxy = $gameTemp?._NPCEmpathizeProxy;
    this._npcProxyData = null;
    if (proxy && !proxy._used && enemyId === proxy.enemyId) {
      proxy._used = true;
      this._npcProxyData = proxy.data;
    }
    _Game_Enemy_setup_npcProxy.call(this, enemyId, x, y);
    if (this._npcProxyData && proxy.hp) this._hp = Math.min(this.mhp, proxy.hp);
  };

  const _Game_Enemy_enemy_npcProxy = Game_Enemy.prototype.enemy;
  Game_Enemy.prototype.enemy = function () {
    return this._npcProxyData || _Game_Enemy_enemy_npcProxy.call(this);
  };

  // What the fight did to the person's body, written back onto their profile
  // in the shape the map skirmish keeps it (profile.hp, profile.injuries
  // [{part, broken, cut, vital, lost}]): the health the proxy ended on, scaled
  // to their own maximum, and every Humanoid part it had broken or cut away.
  // A part cut off is lost for good (a prosthetic, NPCSim.Implants); a wound
  // they already carried on that part is made worse, never better. Answers
  // the injuries written, or null when there was nobody to write them on.
  function _writeBattleWounds(name, enemy) {
    const profile = name ? $gameSystem?._npcSociety?.[name] : null;
    if (!profile || !enemy) return null;
    const mhp = Math.max(1, Number(profile.mhp) || 100);
    const emhp = Math.max(1, Number(enemy.mhp) || mhp);
    const ehp = Math.max(0, Number(enemy.hp) || 0);
    profile.hp = Math.max(0, Math.min(mhp, Math.round(ehp * mhp / emhp)));
    if (!Array.isArray(profile.injuries)) profile.injuries = [];
    const written = [];
    const parts = enemy._bodyParts || {};
    for (const key of Object.keys(parts)) {
      const part = parts[key];
      if (!part || !(part.destroyed || part.broken)) continue;
      const cut = !!part.destroyed;
      const injury = { part: key, broken: true, cut, vital: !!part.vital };
      if (cut && part.canCutoff && !part.vital) injury.lost = true;
      const had = profile.injuries.find(i => i && i.part === key);
      if (had) {
        had.broken = true;
        had.cut = had.cut || cut;
        if (injury.lost) had.lost = true;
        delete had.mend;
        written.push(had);
      } else {
        profile.injuries.push(injury);
        written.push(injury);
      }
    }
    return written;
  }

  // What a won fight against a person leaves (SECTION 5b calls it).
  function _settleNpcBattle(victim, enemy) {
    const D      = window.NPCDowned;
    const name   = victim.name;
    // The wounds first: a body left where they fell shows them
    // (NPCDowned.fallOnMap reads profile.injuries), and somebody downed gets
    // up carrying them.
    try { _writeBattleWounds(name, enemy); }
    catch (e) { console.warn('[NPCEmpathize] battle wounds not written', e); }
    const wanted = !!window.NPCSystem?.isWanted?.(name);
    const HC     = window.HealthCore;
    const downed = !!(enemy && HC?.wasBluntDowned?.(enemy));
    D?.payPocketMoney?.(name);
    if (downed && D) {
      D.downByParty(name, victim);
      if (!wanted) D.fileCrime(D.crimeFor('downed'), name, name); // i18n-ignore: outcome id
    } else if (D) {
      D.killNpc(name, {
        kind: NPC_BATTLE_CAUSE, by: $gameParty?.leader?.()?.name?.() || null,
        byParty: true, mapId: victim.mapId, eventId: victim.eventId
      });
      if ($gameMap?.mapId() === victim.mapId) $gameMap.event(victim.eventId)?.refresh();
      if (!wanted) D.fileCrime(D.crimeFor('dead'), null, name); // i18n-ignore: outcome id
    } else {
      $gameSelfSwitches.setValue([victim.mapId, victim.eventId, 'A'], true);
      if ($gameMap?.mapId() === victim.mapId) $gameMap.event(victim.eventId)?.refresh();
      // A death is the world's, not this savegame's: recorded in the world
      // folder so the body stays where it fell in every playthrough of it
      // (NPCSystem.js, GoneRegistry).
      window.NPCGone?.record(victim.mapId, victim.eventId, name, 'killed');
    }
    // Somebody wanted pays out to whoever brought them down, and closes any
    // quest board warrant written on them (NPCSystem, NPCBounty).
    window.NPCSystem?.collectBounty?.(name);
  }

  // ============================================================================
  // SECTION 5c, THE NPC'S OWN FACE IN THE FIGHT
  // ============================================================================
  // A fight picked from the panel is against somebody the player was just
  // looking at, not against the generic battler the troop happens to hold, so
  // the enemy's own graphic is stood down and the NPC is drawn in its place,
  // standing ON the bottom edge of the screen with nothing under them:
  //   3D battlers (and plain 2D)  ->  the bust the panel was showing.
  //   Sprite battlers             ->  their walking sprite off the map.
  // The portrait is a sibling of the battler sprites inside the battle field,
  // the same place damage popups and battle animations live, and those are
  // positioned from the (hidden) enemy sprite, so they still land on the NPC.

  const FACE_MAX_W    = 0.55; // a bust may take this much of the screen width
  const FACE_MAX_H    = 0.95; // ...and this much of its height
  const FACE_SPRITE_H = 0.60; // a walking sprite is blown up to this much of it
  const FACE_FADE     = 12;   // opacity step of the fade in / death fade
  const FACE_PATTERNS = [0, 1, 2, 1];
  const FACE_PAT_WAIT = 15;   // frames per walking-sprite pattern

  // Sprites mode (enemyBattlers === 2), with the legacy flag honoured for
  // configs written before the option became a three-way.
  function _isSpriteBattlerMode() {
    if (typeof ConfigManager === 'undefined') return false;
    return ConfigManager.enemyBattlers === 2 || !!ConfigManager.charBasedSprites;
  }

  // Clickable, because the enemy sprite it stands in for is hidden and mouse
  // targeting goes through the sprite the pointer is over.
  class Sprite_NPCBattleFace extends Sprite_Clickable {
    constructor(face, battler, enemySprite) {
      super();
      this._face        = face;
      this._battler     = battler;
      this._enemySprite = enemySprite || null;
      this._charMode    = _isSpriteBattlerMode() && !!face.charName;
      this._laidOut     = false;
      this._pattern     = 0;
      this._patternWait = 0;
      this._selectCount = 0;
      this._fellBack    = false;
      this.anchor.x = 0.5;
      this.anchor.y = 1;   // the image hangs off its own bottom edge
      this.opacity  = 0;
      this.bitmap   = this._charMode
        ? ImageManager.loadCharacter(this._face.charName)
        : ImageManager.loadBitmap('img/busts/', this._face.bust);
    }

    // Size once the bitmap is in: a bust is fitted to the screen, a walking
    // sprite is blown up by a whole number so its pixels stay square.
    _layout() {
      const bmp = this.bitmap;
      if (!bmp || !bmp.isReady() || !bmp.width || !bmp.height) return false;
      if (this._charMode) {
        const big = ImageManager.isBigCharacter(this._face.charName);
        this._pw  = bmp.width  / (big ? 3 : 12);
        this._ph  = bmp.height / (big ? 4 : 8);
        this._blockX = big ? 0 : (this._face.charIndex % 4) * 3;
        this._blockY = big ? 0 : Math.floor(this._face.charIndex / 4) * 4;
        const k = Math.max(2, Math.floor((Graphics.height * FACE_SPRITE_H) / this._ph));
        this.scale.x = this.scale.y = k;
        this._drawW  = this._pw * k;
        this._setPatternFrame();
      } else {
        const k = Math.min((Graphics.width  * FACE_MAX_W) / bmp.width,
                           (Graphics.height * FACE_MAX_H) / bmp.height);
        this.scale.x = this.scale.y = k;
        this._drawW  = bmp.width * k;
        this.setFrame(0, 0, bmp.width, bmp.height);
      }
      return true;
    }

    // Facing down, the way the player was looking at them a moment ago.
    _setPatternFrame() {
      this.setFrame((this._blockX + FACE_PATTERNS[this._pattern]) * this._pw,
                    this._blockY * this._ph, this._pw, this._ph);
    }

    _updatePattern() {
      if (++this._patternWait < FACE_PAT_WAIT) return;
      this._patternWait = 0;
      this._pattern = (this._pattern + 1) % FACE_PATTERNS.length;
      this._setPatternFrame();
    }

    // Bottom edge flush with the bottom of the screen, held over the enemy
    // sprite's column so popups and animations keep meeting the portrait, and
    // clamped so no part of it runs off the side.
    _place() {
      const field = this.parent;
      const fx    = field ? field.x : 0;
      const fy    = field ? field.y : 0;
      const half  = (this._drawW || 0) / 2;
      const x     = this._enemySprite ? this._enemySprite.x : (Graphics.width / 2 - fx);
      const min   = half - fx;
      const max   = Graphics.width - half - fx;
      this.x = max > min ? Math.min(Math.max(x, min), max) : x;
      this.y = Graphics.height - fy;
    }

    _updateOpacity() {
      const gone = !this._battler || this._battler.isDead() || !this._battler.isAppeared();
      this.opacity = gone
        ? Math.max(0,   this.opacity - FACE_FADE)
        : Math.min(255, this.opacity + FACE_FADE);
    }

    // The drawn frame, in the sprite's own unscaled coordinates. The inherited
    // test reads this.width, which PIXI reports already multiplied by the scale
    // the portrait is blown up by, and would answer for a rectangle several
    // times too big.
    hitTest(x, y) {
      const w = this._charMode ? (this._pw || 0) : (this.bitmap?.width  || 0);
      const h = this._charMode ? (this._ph || 0) : (this.bitmap?.height || 0);
      return x >= -w / 2 && x < w / 2 && y >= -h && y < 0;
    }

    onMouseEnter() { $gameTemp.setTouchState(this._battler, 'select'); }
    onPress()      { $gameTemp.setTouchState(this._battler, 'select'); }

    // The blink the enemy sprite would have shown while it is the chosen target.
    _updateSelection() {
      if (this._battler?.isSelected?.()) {
        this._selectCount++;
        this.setBlendColor(this._selectCount % 30 < 15 ? [255, 255, 255, 64] : [0, 0, 0, 0]);
      } else if (this._selectCount > 0) {
        this._selectCount = 0;
        this.setBlendColor([0, 0, 0, 0]);
      }
    }

    update() {
      super.update();
      // A dossier can name a bust that was never drawn; fall back to the
      // house portrait rather than leaving an empty rectangle standing there.
      if (!this._fellBack && !this._charMode && this.bitmap?.isError?.()) {
        this._fellBack = true;
        this.bitmap = ImageManager.loadBitmap('img/busts/', '7');
        return;
      }
      if (!this._laidOut) {
        if (!this._layout()) return;
        this._laidOut = true;
      } else if (this._charMode) {
        this._updatePattern();
      }
      this._place();
      this._updateOpacity();
      this._updateSelection();
    }
  }

  const _Spriteset_Battle_createEnemies_face = Spriteset_Battle.prototype.createEnemies;
  Spriteset_Battle.prototype.createEnemies = function () {
    _Spriteset_Battle_createEnemies_face.call(this);
    this._npcFaceSprite  = null;
    this._npcFaceBattler = null;
    const face = $gameTemp?._NPCEmpathizeBattleFace;
    if (!face) return;
    // The panel fights one person, the first member of the troop it set up.
    const battler = $gameTroop.members()[0];
    if (!battler) return;
    const src = (this._enemySprites || []).find(s => s && (s._battler || s._enemy) === battler);
    const sprite = new Sprite_NPCBattleFace(face, battler, src);
    this._battleField.addChild(sprite);
    this._npcFaceSprite  = sprite;
    this._npcFaceBattler = battler;
  };

  const _Spriteset_Battle_update_face = Spriteset_Battle.prototype.update;
  Spriteset_Battle.prototype.update = function () {
    _Spriteset_Battle_update_face.call(this);
    if (!this._npcFaceSprite) return;
    // Kept down rather than hidden once: the battler graphic reloads itself
    // whenever the enemy's image changes, and 3D mode can hand a sprite back.
    const src = this._npcFaceSprite._enemySprite;
    if (src && !src._hidden) src.hide();
    // 3D mode builds its model a tick into the battle. The NPC wears their own
    // face instead, so the model comes straight back off the field the frame it
    // appears.
    const sc3d = this._battle3DScene;
    if (sc3d && !sc3d._disposed && sc3d.getModel) {
      const idx = $gameTroop.members().indexOf(this._npcFaceBattler);
      if (idx >= 0 && sc3d.getModel(`enemy_${idx}`)) sc3d.removeModel(`enemy_${idx}`);
    }
  };

  // ============================================================================
  // SECTION 6, INPUT MANAGER
  // ============================================================================

  // How far one arrow / d-pad press scrolls a tab that has nothing to select,
  // and how fast a fully pushed right stick scrolls, in pixels per frame.
  const SCROLL_KEY_STEP  = 64;
  const STICK_SPEED      = 26;
  const STICK_DEADZONE   = 0.15;
  const TRIGGER_SPEED    = 26;
  // Standard-mapping index of the pad's Select / Back button, which changes who
  // in the party is doing the talking. Input.gamepadMapper has no action on it
  // at all, so it is read raw through AnalogStickInput (the same route the
  // right stick and the triggers take below).

  const NPCEmpathizeInputManager = {
    _scene: null, _active: false,
    // Last pad-present state the tab-bar hint chip was drawn for; null forces
    // the first sync.
    _hintPad: null,

    activate(scene)  { this._scene = scene; this._active = true; this._hintPad = null; },
    deactivate()     { this._active = false; this._scene = null; this._hintPad = null; },

    // The chip in front of the first tab names L1/R1 or TAB depending on
    // whether a pad is plugged in, and a pad can be plugged in (or its battery
    // die) while the panel is open. The tab bar itself only redraws on a tab
    // change, so keep the chip in step here instead of re-rendering the bar.
    // The character switcher's own chip (L2 R2 / , .) rides along, for the
    // same reason: it is drawn once per render, not once per frame.
    _syncTabHint(scene) {
      const pads  = window.AnalogStickInput;
      const onPad = !!(pads && typeof pads.hasPad === 'function' && pads.hasPad());
      if (onPad === this._hintPad) return;
      this._hintPad = onPad;
      const el = scene._overlay?.querySelector('.npc-tab-hint');
      // i18n-ignore-start: physical controller / keyboard button ids
      if (el) {
        el.dataset.pad  = onPad ? '1' : '0';
        el.textContent  = onPad ? 'L1 R1' : 'TAB';
      }
      const focusEl = scene._overlay?.querySelector('.npc-focus-hint');
      if (focusEl) focusEl.textContent = onPad ? 'L2 R2' : ', .';
      // i18n-ignore-end
    },

    // The right stick scrolls the open tab's pane, the controller's mouse
    // wheel, read through the shared AnalogStickInput helper. On the Social
    // Web, which has nothing to scroll, it zooms the graph instead (pushed up
    // is in), which is what the wheel over the graph does. The triggers are
    // the party step here as on every menu.
    _updateStickScroll(scene) {
      const pads = window.AnalogStickInput;
      if (!pads || typeof pads.rightY !== 'function') return;
      if (scene._activeTab === 'web' && typeof scene.setWebZoom === 'function') {
        const ry     = pads.rightY();
        const push   = Math.abs(ry) > STICK_DEADZONE
          ? ((Math.abs(ry) - STICK_DEADZONE) / (1 - STICK_DEADZONE)) * -Math.sign(ry) : 0;
        const zoom   = push * TRIGGER_SPEED;
        // zoom tops out at TRIGGER_SPEED (26); this rate roughly doubles the
        // view over one second at a fully pulled trigger, the pixel-scroll
        // constant below being tuned for text, not for a multiplicative zoom.
        if (zoom) scene.setWebZoom(scene.webZoom() * (1 + zoom * 0.0005));
        return;
      }
      const y      = pads.rightY();
      const push   = Math.abs(y) > STICK_DEADZONE
        ? ((Math.abs(y) - STICK_DEADZONE) / (1 - STICK_DEADZONE)) * Math.sign(y) : 0;
      const amount = push * STICK_SPEED;
      if (!amount) return;
      scene._scrollActivePane?.(amount);
    },

    // The free-chat modal with no keyboard in hand. The sheet's Done sends the
    // line exactly as Enter does; backing out of the sheet leaves the modal
    // open with the draft kept, and B on the modal itself closes it.
    _updateChatModalPad(scene) {
      if (window.Controller && Controller.textEntryOpen && Controller.textEntryOpen()) return;
      if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        scene._closeChatModal?.();
        return;
      }
      if (!Input.isTriggered('ok')) return;
      if (!window.Controller || typeof Controller.textEntry !== 'function') return;
      const ta = scene._chatModalEl?.querySelector('#npc-dlg-ask-input');
      if (!ta) return;
      window.UINav?.swallowHeld?.();
      const title = scene._chatModalEl?.querySelector('.npc-chat-modal-title')?.textContent || '';
      Controller.textEntry({
        title,
        value: ta.value,
        max: 200,
        onCommit: (value) => {
          window.UINav?.swallowHeld?.();
          if (!scene._chatModalOpen) return;
          ta.value = String(value || '');
          scene._askDraft = ta.value;
          if (ta.value.trim()) scene._submitChatModal?.();
        },
        onCancel: () => { window.UINav?.swallowHeld?.(); }
      });
    },

    // The rename modal, the same way: its field holds the keyboard (its own
    // keydown listener answers Enter and Escape), so what reaches Input here is
    // the pad. A types the name on the letter sheet, B shuts the modal.
    _updateNameModalPad(scene) {
      if (window.Controller && Controller.textEntryOpen && Controller.textEntryOpen()) return;
      if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        window.UINav?.swallowHeld?.();
        scene._closeNameModal?.();
        return;
      }
      if (!Input.isTriggered('ok')) return;
      if (!window.Controller || typeof Controller.textEntry !== 'function') return;
      const field = scene._nameModalEl?.querySelector('#npc-dlg-name-input');
      if (!field) return;
      window.UINav?.swallowHeld?.();
      const title = scene._nameModalEl?.querySelector('.npc-chat-modal-title')?.textContent || '';
      Controller.textEntry({
        title,
        value: field.value,
        max: 24,
        onCommit: (value) => {
          window.UINav?.swallowHeld?.();
          if (!scene._nameModalOpen) return;
          field.value = String(value || '');
          if (field.value.trim()) scene._submitNameModal?.();
        },
        onCancel: () => { window.UINav?.swallowHeld?.(); }
      });
    },

    update() {
      if (!this._active || !this._scene) return;
      const scene = this._scene;
      this._syncTabHint(scene);
      // A Talk about / Teach / Learn pick sheet (CCPick, the character
      // creation dropdown) is modal: it reads the pad and nothing behind it does.
      if (scene._lessonPickOpen && window.CCPick?.isOpen?.()) {
        window.CCPick.pollInput();
        return;
      }
      if (scene._lessonPickOpen) scene._lessonPickOpen = false;
      if (scene._nameModalOpen) {
        this._updateNameModalPad(scene);
        return;
      }
      // Scope to the live overlay so a stale/duplicate #menu-container copy can
      // never hand us the wrong input element.
      const inp   = scene._overlay?.querySelector('#npc-dlg-ask-input')
        || document.getElementById('npc-dlg-ask-input');

      // Chat input has DOM focus, pass ALL keys to the browser, no game
      // navigation at all. This MUST run before the cancel/escape handler:
      // MZ's keyMapper maps letter keys (X to escape, plus W/A/S/D to
      // directions) regardless of which DOM element is focused, so without
      // this early return, typing a word containing one of those letters
      // would fire Input.isTriggered('escape') and blur the field mid-word (#129).
      // Detect focus via the ACTIVE element's id (robust to duplicate ids).
      // While the chat modal is open the game loop stays fully out of the way,
      // no navigation, cancel, or tab cycling can steal focus from the field.
      // A keyboard never reaches Input while the field holds it (the key
      // guard swallows every key), so what arrives here is the pad: A types
      // the line on the letter sheet, B shuts the modal.
      if (scene._chatModalOpen) {
        this._updateChatModalPad(scene);
        return;
      }

      // Any text field the panel is showing, not the chat box alone: the
      // detailed creation editor puts a search box over its longer pickers, and
      // it needs the keyboard for exactly the same reason.
      const ae = document.activeElement;
      const typing = !!ae && (
        ae.id === 'npc-dlg-ask-input' ||
        (!!scene._overlay && scene._overlay.contains(ae) &&
          (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))
      );
      scene._inputFocused = typing;
      if (typing) return;

      const cancelled = Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled();

      if (cancelled && scene._nameModalOpen) {
        scene._closeNameModal?.();
        return;
      }

      if (cancelled && (scene._introspectGenderMode || scene._introspectOrientMode || scene._introspectCreedMode)) {
        scene._cancelIntrospectSubMode?.();
        return;
      }

      if (cancelled && scene._socialMode && scene._isSelfTalk?.()) {
        scene._cancelSubMode?.();
        return;
      }

      // While navigating a content grid, Cancel backs out one level (entry list
      // -> categories -> tab bar) instead of closing the whole panel.
      if (cancelled && scene._activeArea === 'content') {
        scene._contentBack();
        return;
      }

      // Cancel / escape, handled once the text field no longer has focus
      if (cancelled) {
        scene._leave();
        return;
      }

      // The right stick scrolls whatever the open tab is showing, every frame
      // it is held off centre
      this._updateStickScroll(scene);

      // Who in the party is doing the talking: L2 / R2 on a pad, , and . on a
      // keyboard. Every reputation change lands on that member alone.
      const nav = window.UINav;
      const partyStep = nav ? nav.partyDir() : 0;
      if (partyStep) {
        scene._cycleFocusActor(partyStep);
        return;
      }

      // Tab cycling, from anywhere in the scene: L1 / R1 on a pad, Tab and
      // Shift+Tab on a keyboard. These are the ONLY way to change tab: the
      // d-pad, the stick and WASD stay inside the open tab, where they drive the
      // chat's dialogue options and the Wiki grid.
      const tabStep = nav ? nav.tabDir() : 0;
      if (tabStep) {
        // With the cursor on the chat's verb board, L1 / R1 first walk its
        // categories; past the first or the last one they turn the panel's
        // own tab as before (NPCEmpathizeUI_Chat.js, ACTION BOARD).
        if (scene._activeArea === 'actions' && scene._stepActionCategory?.(tabStep)) return;
        const tabs = scene._tabOrder();
        const cur  = tabs.indexOf(scene._activeTab);
        const next = (cur + tabStep + tabs.length) % tabs.length;
        scene._setTab(tabs[next]); // plays cursor SE, resets area/index, re-renders
        return;
      }

      // WASD hold-repeat simulation (matches MZ arrow-key timing). Only when the
      // key mapper does not already report W/A/S/D as directions: when it does
      // (HistorySimulatorUI maps them game-wide) Input carries the repeat and a
      // second stream here would step twice while a key is held.
      const wasdMapped = !!(Input.keyMapper && Input.keyMapper[87] === 'up');
      if (wasdMapped) {
        scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;
      }
      for (const dir of (wasdMapped ? [] : ['up', 'down', 'left', 'right'])) {
        if (scene._wasdHeld[dir]) {
          scene._wasdHoldFrames[dir]++;
          const t = scene._wasdHoldFrames[dir];
          if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0)
            scene._wasdInput[dir] = true;
        } else {
          scene._wasdHoldFrames[dir] = 0;
        }
      }

      const isDown  = Input.isTriggered('down')  || Input.isRepeated('down')  || scene._wasdInput.down;
      const isUp    = Input.isTriggered('up')    || Input.isRepeated('up')    || scene._wasdInput.up;
      const isLeft  = Input.isTriggered('left')  || Input.isRepeated('left')  || scene._wasdInput.left;
      const isRight = Input.isTriggered('right') || Input.isRepeated('right') || scene._wasdInput.right;
      scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;

      const isChatTab = scene._activeTab === 'chat';
      const area      = scene._activeArea;

      // Directions never leave the open tab (L1/R1 does that). Inside a tab they
      // move between whatever it offers: the chat actions, the Wiki grid, or,
      // on a plain reading page with nothing to select, the page itself.
      if (area === 'tabs') {
        // Directions no longer walk the tab bar; they drop straight into what
        // the open tab offers: the chat's dialogue options, or on any other
        // tab its links, tiles and buttons. Up is left out of the drop-in so
        // it can still scroll the page back up from here.
        const enter = isDown || isLeft || isRight || Input.isTriggered('ok');
        if (enter && isChatTab && !scene._entity) {
          SoundManager.playCursor();
          scene._activeArea = 'actions';
          scene._menuIndex  = 0;
          scene._updateSelectionHighlight();
        } else if (enter && scene._contentNavEnabled() && scene._enterContentArea()) {
          // Dropped onto the first thing on screen the tab offers to press
          // (Wiki cards, links, the star, the Social Web's people).
        } else if (isUp || isDown) {
          // Nothing to press on screen: directions just scroll the page.
          scene._scrollActivePane?.(isUp ? -SCROLL_KEY_STEP : SCROLL_KEY_STEP);
        }

      } else if (area === 'content') {
        if (isUp || isDown) {
          // An item within reach takes the cursor; failing that the page
          // scrolls on toward the next one, and only a page that cannot scroll
          // any further hands the cursor straight to it. Going up from the
          // top of the page falls back up to the tab bar.
          const dir  = isUp ? 'up' : 'down';
          const step = isUp ? -SCROLL_KEY_STEP : SCROLL_KEY_STEP;
          if (!scene._moveContent(dir, true) && !scene._scrollContent(step) &&
              !scene._moveContent(dir) && isUp) {
            SoundManager.playCursor();
            scene._activeArea = 'tabs';
            scene._updateSelectionHighlight();
          }
        } else if (isLeft)  { scene._moveContent('left');
        } else if (isRight) { scene._moveContent('right');
        } else if (Input.isTriggered('ok')) {
          scene._activateContent();
        }

      } else if (area === 'actions') {
        const btns  = scene._overlay?.querySelectorAll('.npc-chat-action-btn');
        const idx   = scene._menuIndex;

        // The dialogue options wrap into as many rows as they need, so all four
        // directions walk them geometrically: Down lands on the option below
        // rather than on the one after it in DOM order.
        if (isLeft || isRight || isDown) {
          const dir = isLeft ? 'left' : (isRight ? 'right' : 'down');
          // Nothing below the bottom row: read further down the log instead.
          // (The text field is reached through the "Free Chat" action, never by
          // a direction.)
          if (!scene._moveAction(dir) && isDown) {
            scene._scrollActivePane?.(SCROLL_KEY_STEP);
          }
        } else if (isUp) {
          // From the top row, fall back up to the tab bar.
          if (!scene._moveAction('up')) {
            SoundManager.playCursor();
            scene._activeArea = 'tabs';
            scene._menuIndex  = 0;
            scene._updateSelectionHighlight();
          }
        } else if (Input.isTriggered('ok')) {
          const btn = btns?.[idx];
          if (btn && !btn.classList.contains('npc-action-disabled')) {
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          }
        }
      }
    },
  };

  // ============================================================================
  // SECTION 8, PLUGIN COMMAND
  // ============================================================================

  PluginManager.registerCommand(pluginName, 'Open', args => {
    if ($gameTemp._NPCEmpathizeBypass) {
      $gameTemp._NPCEmpathizeBypass = false;
      return;
    }
    const evName = String(args.eventName || '').trim().toLowerCase();
    let evId = null;
    if (evName) {
      const ev = $gameMap?.events().find(e => e?.event()?.name?.trim().toLowerCase() === evName);
      if (!ev) { console.warn(`[NPCEmpathize] Open: no event named "${evName}" on current map.`); return; }
      evId = ev.eventId();
    } else {
      evId = $gameMap?._interpreter?._eventId ?? null;
      if (!evId) { console.warn('[NPCEmpathize] Open: no eventName given and no active event interpreter found.'); return; }
    }
    window.NPCEmpathize.open(evId);
  });

  // A hand laid on the animal from the street, without the panel. The beast
  // menu's first entry (NPCSystem's _creaturePageList) lands here: the same
  // action the panel's Pet button performs, spent where the player is standing
  // rather than behind a second window they then have to close. No band and no
  // roll, exactly as in the panel: petting cannot go wrong.
  PluginManager.registerCommand(pluginName, 'Pet', args => {
    const evName = String(args?.eventName || '').trim().toLowerCase();
    let ev = null;
    if (evName) {
      ev = $gameMap?.events().find(e => e?.event()?.name?.trim().toLowerCase() === evName) || null;
    } else {
      const evId = $gameMap?._interpreter?._eventId ?? null;
      ev = evId ? $gameMap.event(evId) : null;
    }
    if (ev) ev.turnTowardPlayer();
    const npcName = String(ev?.event()?.name || '').trim();
    if (!npcName) return;

    const T       = _getT();
    const profile = _getProfile(npcName);
    const actor   = $gameParty?.leader();
    if (profile) {
      _addNpcOpinion(profile, actor?.actorId(), PET_OPINION);
      (profile.eventLog ??= []).push({
        tag: 'feral', desc: 'pet', // i18n-ignore: event-log record id
        timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
      });
    }

    const kind = window.NPCCreature?.archetypeLabel?.(profile) || '';
    const own  = String(_rand(T.beastActPet || []) || '')
      .replace(/{name}/g, npcName).replace(/{kind}/g, kind);
    const noise = _feralNoise(2, _creatureClassOfNpc(npcName));
    const text  = [own, noise].filter(Boolean).join(' ');
    if (text) window.ParchmentToast?.show?.(text, { severity: 'info', duration: 260 });
    SoundManager.playOk();
  });

  // ============================================================================
  // FAMILY NAMESPACE (NPCEmpathize_*.js)
  // ============================================================================
  // The Empathize logic is split across the NPCEmpathize_*.js modules listed
  // in js/plugins.js right after this file: _Helpers (SECTIONS 1 to 3),
  // _Predisposition (3b), _Scene (7), _Wiki (8b), _Api (9, the public
  // window.NPCEmpathize table) and _Lessons (10). Each module reads the
  // helpers it shares with the others off NPCEmpathize._internal and
  // publishes its own there; a name owned by a module that loads later is
  // bound through _late, which NPCEmpathize_Api.js runs once the family is in.

  window.NPCEmpathize = { _internal: { _late: [] } };
  Object.assign(window.NPCEmpathize._internal, {
    _buildNpcProxy, _npcProxyTroopId, NPC_ASSAULT_CRIME, NPCEmpathizeInputManager,
  });

  // Owned by modules that load after this one, bound once the family is in.
  let _addNpcOpinion, _creatureClassOfNpc, _feralNoise, _getProfile, _getT, _rand, PET_OPINION;
  window.NPCEmpathize._internal._late.push(() => ({
    _addNpcOpinion, _creatureClassOfNpc, _feralNoise, _getProfile, _getT, _rand, PET_OPINION,
  } = window.NPCEmpathize._internal));
})();
