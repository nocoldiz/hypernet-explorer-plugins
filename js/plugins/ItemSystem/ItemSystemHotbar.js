/*:
 * @target MZ
 * @plugindesc Item Hotbar v1.0.0 - favourite usable items on the same quick bar the battle system uses, on the map and in the backpack.
 * @author Omni-Lex
 * @help ItemSystemHotbar.js
 *
 * Nine favourite slots of usable items, drawn with the shared quick-bar
 * widget (Core/HotbarUI.js), i.e. the very same bar the battle system puts
 * the acting member's skills on.
 *
 * Where it shows
 *   Map       , bottom-centre, only while at least one slot is filled.
 *   Backpack  , under the item grid on the left page, where slots are
 *               assigned. Always drawn there, empty or not, since that is
 *               the surface you assign onto.
 *
 * An item that has to be given to somebody (an ally-scoped one) asks who on
 * the spot, over the map: a small card naming each companion and what they
 * have left. Arrows or the number keys choose, OK uses, Cancel walks away.
 * The use itself is window.ItemUse's, the very code the backpack uses, so an
 * item works the same whichever surface reached for it.
 *
 * Controls, on the map
 *   1 - 9      use that slot's item outright
 *   L1 / R1    arm the bar and step the highlight between filled slots
 *   Tab        same as R1, steps the highlight forward one slot
 *   OK         while armed, use the highlighted slot
 *   Cancel / a step / two idle seconds disarm it again
 *   Click/tap  use that slot
 *
 * Controls, in the backpack
 *   1 - 9      drop the inspected item into that slot
 *   Click/tap  drop the inspected item into that slot
 *   Drag       drag a grid item straight onto a slot to assign it
 *   Right click clear the slot
 *   The ☆ next to an item's name still toggles it into the first free slot.
 *
 * Only usable items qualify (occasion "always" or "outside battle"); weapons
 * and armour are equipped, not favourited, and slots store item ids, so
 * letting a weapon in would resolve to whichever *item* shares its id.
 *
 * Requires ItemSystemInventory.js (favourite storage on $gameSystem) and
 * Core/HotbarUI.js. Must load after both.
 */

(function () {
  'use strict';

  const T = window.T || ((k) => k);

  const SLOTS = 9;
  const IDLE_DISARM_FRAMES = 120; // ~2s at 60fps before the armed bar stands down

  // MouseControls.js only registers 1-5, and only once a battle has built its
  // windows, so the map favourites were unreachable on a fresh save and 6-9
  // never worked anywhere. Register the full row here, at load.
  for (let i = 1; i <= SLOTS; i++) {
    Input.keyMapper[48 + i] = String(i);
  }

  //===========================================================================
  // ItemHotbar , the favourites model
  //
  // Storage stays $gameSystem._favoriteItems (slot "1".."9" -> item id), the
  // shape older saves already carry.
  //===========================================================================

  // Row cache for ItemHotbar.entries(). The map bar is rendered every frame
  // the party is walking, and entries() answered it by building nine objects
  // and nine strings that HotbarUI reduces to a cache key and, almost always,
  // throws straight back away: at 60fps the whole bar was being priced to
  // discover that nothing had moved. Only three things change what it returns
  // - the slot assignments, the party's stock, and which $gameSystem is live -
  // so those three, and nothing else, retire the rows.
  let _entriesCache = null;
  let _entriesOwner = null;
  function invalidateHotbarEntries() {
    _entriesCache = null;
    _entriesOwner = null;
  }

  const ItemHotbar = {
    SLOTS: SLOTS,

    /** Slot index (0-based) to the string key the save file uses. */
    key(index) {
      return String(index + 1);
    },

    /** Weapons and armour are equipped, not favourited; see the header. */
    isFavoritable(item) {
      return !!item && DataManager.isItem(item) &&
        (item.occasion === 0 || item.occasion === 2);
    },

    itemAt(index) {
      const id = $gameSystem.getFavoriteItem(this.key(index));
      if (!id) return null;
      const item = $dataItems[id];
      return this.isFavoritable(item) ? item : null;
    },

    slotOf(item) {
      // Ids are only unique per kind, so an unfavouritable weapon must never
      // match the item that happens to share its id.
      if (!this.isFavoritable(item)) return -1;
      for (let i = 0; i < SLOTS; i++) {
        if ($gameSystem.getFavoriteItem(this.key(i)) === item.id) return i;
      }
      return -1;
    },

    isFavorited(item) {
      return this.slotOf(item) >= 0;
    },

    isEmpty() {
      for (let i = 0; i < SLOTS; i++) {
        if (this.itemAt(i)) return false;
      }
      return true;
    },

    firstFreeSlot() {
      for (let i = 0; i < SLOTS; i++) {
        if (!this.itemAt(i)) return i;
      }
      return -1;
    },

    /** Put `item` in `index`, vacating whatever slot already held it. */
    assign(index, item) {
      if (index < 0 || index >= SLOTS || !this.isFavoritable(item)) return false;
      const existing = this.slotOf(item);
      if (existing >= 0) $gameSystem.setFavoriteItem(this.key(existing), null);
      $gameSystem.setFavoriteItem(this.key(index), item.id);
      invalidateHotbarEntries();
      return true;
    },

    clear(index) {
      if (index < 0 || index >= SLOTS) return false;
      if (!$gameSystem.getFavoriteItem(this.key(index))) return false;
      $gameSystem.setFavoriteItem(this.key(index), null);
      invalidateHotbarEntries();
      return true;
    },

    /** Star behaviour: off if already carried, else into the first free slot. */
    toggle(item) {
      if (!this.isFavoritable(item)) return false;
      const slot = this.slotOf(item);
      if (slot >= 0) return this.clear(slot);
      const free = this.firstFreeSlot();
      // A full bar overwrites its last slot rather than silently doing nothing.
      return this.assign(free >= 0 ? free : SLOTS - 1, item);
    },

    /** Entries for HotbarUI.render. Cached; see invalidateHotbarEntries. */
    entries() {
      // A loaded save brings a whole new $gameSystem, and with it new slots,
      // so the owner is checked rather than trusted to have been invalidated.
      if (_entriesCache && _entriesOwner === $gameSystem) return _entriesCache;
      const list = [];
      for (let i = 0; i < SLOTS; i++) {
        const item = this.itemAt(i);
        if (!item) { list.push(null); continue; }
        const count = $gameParty.numItems(item);
        list.push({
          iconIndex: item.iconIndex,
          enabled: count > 0,
          count: count,
          tooltip: `${item.name} ×${count}`,
          // The slot already prints how many are left, so the line under the
          // bar only has to say what the thing is.
          label: item.name
        });
      }
      _entriesCache = list;
      _entriesOwner = $gameSystem;
      return list;
    },

    /** Index of the next filled slot in `dir`, or -1 when the bar is empty. */
    stepSlot(from, dir) {
      for (let n = 1; n <= SLOTS; n++) {
        const i = ((from + dir * n) % SLOTS + SLOTS) % SLOTS;
        if (this.itemAt(i)) return i;
      }
      return this.itemAt(from) ? from : -1;
    },

    /**
     * Use the slot's item from the map. An item that wants to know who it is
     * for asks on the spot, over the map, rather than throwing the backpack
     * open - and does not ask at all when the party is one person, since the
     * answer is already known; everything else is used where the player
     * stands. Either way the use itself is window.ItemUse's, the same code the
     * backpack uses.
     */
    use(index) {
      const item = this.itemAt(index);
      if (!item) return false;

      if ($gameParty.numItems(item) <= 0) {
        SoundManager.playBuzzer();
        return false;
      }

      if (window.ItemUse && window.ItemUse.needsTarget(item)) {
        // A question with one possible answer is not worth asking: travelling
        // alone, the bandage is yours, and the card would be a keypress in the
        // way of a wound.
        const rows = pickerRows(item);
        if (rows.length === 1) {
          const actor = rows[0].actor;
          if (actor && actor.canUse && !actor.canUse(item)) {
            SoundManager.playBuzzer();
            return false;
          }
          const result = actor
            ? window.ItemUse.onActor(actor, item)
            : window.ItemUse.onAllParty(item);
          return result.used;
        }
        SoundManager.playOk();
        openTargetPicker(item);
        return true;
      }

      if (!window.ItemUse) return false;
      return window.ItemUse.withoutTarget(item).used;
    },

    commonEventEffect(item) {
      if (!item || !item.effects) return 0;
      const effect = item.effects.find((e) => e.code === Game_Action.EFFECT_COMMON_EVENT);
      return effect ? effect.dataId : 0;
    }
  };

  // Every row carries a live count, so the party's stock changing is the other
  // thing that retires them. Spending the last potion has to grey its slot out
  // on the next frame, not whenever a slot happens to be reassigned.
  // Guarded: the engine defines Game_Party before any plugin runs, but the
  // test harness loads this file on its own, and a bar that cannot be rendered
  // there has nothing to invalidate either.
  if (typeof Game_Party !== 'undefined') {
    const _Game_Party_gainItem_hotbar = Game_Party.prototype.gainItem;
    Game_Party.prototype.gainItem = function (item, amount, includeEquip) {
      _Game_Party_gainItem_hotbar.call(this, item, amount, includeEquip);
      invalidateHotbarEntries();
    };
  }

  window.ItemHotbar = ItemHotbar;

  //===========================================================================
  // The map target picker
  //
  // A bandage is for somebody. Asked from the quick bar, that question used to
  // be answered by opening the whole backpack; it is answered here instead, on
  // a small card over the map that names each companion and what they have
  // left. Arrows or the number keys choose, OK uses, Cancel walks away. Alone,
  // the card never opens: the item goes straight to the one person there is.
  //===========================================================================

  const PICKER_ID = 'hotbar-target-picker';

  let _picker = null;   // { item, index, rows }

  // A severed-magic world has no magic to spend, so no MP is printed.
  function showMp() {
    const MN = window.MagicNature;
    return !(MN && typeof MN.level === 'function' && MN.level() === 'severed');
  }

  // Who the item can be handed to: every member, plus the whole party when the
  // item is scoped to all of them.
  function pickerRows(item) {
    const rows = $gameParty.members().map((actor) => ({ actor }));
    // "Everyone" is not a second answer when there is only one of you.
    if ((item.scope === 8 || item.scope === 10) && rows.length > 1) rows.push({ actor: null });
    return rows;
  }

  // A ration is eaten, not administered: the card asking who gets it says so.
  function pickerTitle(item) {
    const isFood = !!(window.ItemSystemUtils &&
      window.ItemSystemUtils.hasItemCategory(item, 'Food' /* i18n-ignore: category tag */));
    return isFood
      ? T('Inventory.ui.eatItem', { item: item.name })
      : T('Inventory.ui.useItemOn', { item: item.name });
  }

  function renderPicker() {
    if (!_picker) return;
    const el = document.getElementById(PICKER_ID);
    if (!el) return;
    const mp = showMp();
    const rowsHTML = _picker.rows.map((row, idx) => {
      const sel = idx === _picker.index ? ' selected' : '';
      const name = row.actor ? row.actor.name() : T('Inventory.ui.allPartyCompanions');
      const vitals = row.actor
        ? `<div class="htp-vitals">
             <span class="htp-hp">HP ${row.actor.hp}/${row.actor.mhp}</span>
             ${mp ? `<span class="htp-mp">MP ${row.actor.mp}/${row.actor.mmp}</span>` : ''}
           </div>`
        : '';
      return `
        <div class="htp-row${sel}" data-idx="${idx}">
          <div class="htp-num">${idx + 1}</div>
          <div class="htp-name">${name}</div>
          ${vitals}
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="htp-panel">
        <div class="htp-title">${pickerTitle(_picker.item)}</div>
        ${rowsHTML}
      </div>`;
  }

  function openTargetPicker(item) {
    closeTargetPicker();

    const rows = pickerRows(item);
    if (!rows.length) return;
    _picker = { item, index: 0, rows };
    $gamePlayer._hotbarTargeting = true;

    const el = document.createElement('div');
    el.id = PICKER_ID;
    // The map is underneath: no click of this card may reach it.
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('mouseup', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      SoundManager.playCancel();
      closeTargetPicker();
    });
    el.addEventListener('pointerup', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const row = e.target.closest && e.target.closest('.htp-row');
      if (!row) return;
      const idx = parseInt(row.dataset.idx, 10);
      if (!isNaN(idx)) applyPicker(idx);
    });
    document.body.appendChild(el);
    renderPicker();
  }

  function closeTargetPicker() {
    _picker = null;
    if ($gamePlayer) $gamePlayer._hotbarTargeting = false;
    const el = document.getElementById(PICKER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function applyPicker(index) {
    if (!_picker) return;
    const row = _picker.rows[index];
    const item = _picker.item;
    if (!row) return;

    // The item may have run out while the card was open (a common event, a
    // second bar press): asking for one that is gone is a buzzer, not a crash.
    if ($gameParty.numItems(item) <= 0) {
      SoundManager.playBuzzer();
      closeTargetPicker();
      return;
    }

    if (row.actor && row.actor.canUse && !row.actor.canUse(item)) {
      SoundManager.playBuzzer();
      return;
    }

    closeTargetPicker();
    if (row.actor) window.ItemUse.onActor(row.actor, item);
    else window.ItemUse.onAllParty(item);
  }

  function updatePickerInput() {
    if (!_picker) return false;

    for (let i = 0; i < _picker.rows.length && i < SLOTS; i++) {
      if (Input.isTriggered(String(i + 1))) {
        applyPicker(i);
        return true;
      }
    }
    if (Input.isRepeated('down')) {
      SoundManager.playCursor();
      _picker.index = (_picker.index + 1) % _picker.rows.length;
      renderPicker();
    } else if (Input.isRepeated('up')) {
      SoundManager.playCursor();
      _picker.index = (_picker.index - 1 + _picker.rows.length) % _picker.rows.length;
      renderPicker();
    } else if (Input.isTriggered('ok')) {
      spendOkPress();
      applyPicker(_picker.index);
    } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') ||
               Input.isTriggered('menu') || TouchInput.isCancelled()) {
      SoundManager.playCancel();
      closeTargetPicker();
    }
    return true;
  }

  // Standing still to answer the question: the player cannot walk out from
  // under the card, the way a throw being aimed holds them in place.
  const _Game_Player_canMove_hotbar = Game_Player.prototype.canMove;
  Game_Player.prototype.canMove = function () {
    if (this._hotbarTargeting) return false;
    return _Game_Player_canMove_hotbar.call(this);
  };

  //===========================================================================
  // The map bar
  //===========================================================================

  let _mapArmed = false;    // bumpers have handed the highlight to the bar
  let _mapIndex = 0;
  let _mapIdle = 0;
  let _suppressActionFrame = -1; // frame whose OK the bar has already spent

  // The bar and the target card are HTML, not Window_Selectable, so nothing
  // takes the OK press off the input state the way updateInputData() does for a
  // real window. Everything the map reads later in the same frame - the door in
  // front of the player, the swim/dive/drink prompt on the water it faces -
  // would otherwise answer the very press that used the item.
  function spendOkPress() {
    _suppressActionFrame = Graphics.frameCount;
    Input.update();
  }

  const _mapBar = new HotbarUI({
    id: 'html-item-hotbar-overlay',
    slots: SLOTS,
    zIndex: 260,
    showLabel: true,
    onSlotClick: (i) => {
      _mapArmed = false;
      ItemHotbar.use(i);
    }
  });

  // Which number key is holding the bar (null for none), and the keys still
  // down that a later press has already spent.
  let _mapKeyArmed = null;
  let _mapKeySpent = [];

  function clearMapKeys() {
    _mapKeyArmed = null;
    _mapKeySpent = [];
  }

  function disarmMapBar() {
    _mapArmed = false;
    _mapIdle = 0;
    clearMapKeys();
  }

  // Number keys name a slot while they are held and use it when they are let
  // go, the way the battle spell bar does (BattleSystemEnhancedHUD.js).
  // Pressing a second number over the first re-arms onto it, and the keys
  // underneath are spent, so releasing them later does nothing. Returns true
  // while a key is holding the bar, so nothing else reads that frame.
  function updateMapKeyHold() {
    for (let i = 0; i < SLOTS; i++) {
      if (!Input.isTriggered(String(i + 1))) continue;
      if (_mapKeyArmed !== null && _mapKeyArmed !== i) _mapKeySpent.push(_mapKeyArmed);
      _mapKeyArmed = i;
      _mapArmed = false;
      _mapIdle = 0;
    }
    _mapKeySpent = _mapKeySpent.filter(i => Input.isPressed(String(i + 1)));
    if (_mapKeyArmed === null) return false;
    if (Input.isPressed(String(_mapKeyArmed + 1))) return true;
    const slot = _mapKeyArmed;
    clearMapKeys();
    ItemHotbar.use(slot);
    return true;
  }

  // Whether the bar is on screen at all. A message, a choice window or a
  // running event does not take it away: talking to somebody is exactly when
  // you want to see what you are carrying, and a row that blinks out every
  // time a line of dialogue opens reads as a bug. Those cases only make it
  // inert (see mapBarLive below); what takes it off screen is leaving the map
  // altogether, a fade, the encounter zoom, or another bar in the same place.
  function mapBarVisible(scene) {
    if (!(scene instanceof Scene_Map)) return false;
    if (!$gameSystem || !$dataItems || !$gameParty) return false;
    if (SceneManager.isSceneChanging()) return false;
    if (scene.isFading()) return false;
    // Read rather than asked through Scene_Map.isBusy(): that call ticks its
    // own stuck-encounter counter, and it is the core update's to make.
    if (scene._encounterEffectDuration > 0) return false;
    // ThrowItemPlugin takes over the map with its own cursor and its own
    // reading of every button while a throw is being aimed.
    if ($gamePlayer._throwTargetingMode) return false;
    // The 3D world is played over a live Scene_Map, and it has a quick bar of
    // its own along the bottom of the screen: the weapon in the leader's hands
    // and every kind of block they have dug up (VoxelWorld/VoxelWorldDigging).
    // Two bars in the same place, both answering the number keys, is one bar
    // too many - and what is on this one is no use out there anyway, since
    // nothing in the 3D world is an item you eat or drink.
    if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive()) return false;
    // A fight played out on the map (BattleSystem/MapBattleMode.js) puts the
    // battle spell quickbar in exactly this spot, and both answer the number
    // keys. Battle items are reached through the battle Item command instead.
    if (window.MapBattleMode && window.MapBattleMode.isActive()) return false;
    return !ItemHotbar.isEmpty();
  }

  // Whether a slot can actually be fired. While a message is up, a choice is
  // waiting or an event is running, the keys and the OK press belong to them:
  // the bar stays drawn but answers nothing.
  function mapBarLive() {
    return !$gameMessage.isBusy() && !$gameMap.isEventRunning();
  }

  // Input runs before the base update so the OK that fires a slot never also
  // reaches Game_Player.triggerAction further down the same frame. The verdict
  // is taken once at the top of the frame and reused by both halves.
  let _mapVisible = false;
  let _mapAllowed = false;

  const _Scene_Map_update_hotbar = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _mapVisible = mapBarVisible(this);
    _mapAllowed = _mapVisible && mapBarLive();
    this.updateItemHotbarInput();
    _Scene_Map_update_hotbar.call(this);
    this.updateItemHotbarDisplay();
  };

  Scene_Map.prototype.updateItemHotbarInput = function () {
    // While the card is up it owns every key: no slot fires under it, and the
    // OK that answers it must not also open the door in front of the player.
    if (updatePickerInput()) return;

    if (!_mapAllowed) {
      disarmMapBar();
      return;
    }

    if (updateMapKeyHold()) return;

    // Tab is the party cycle on the map (Core/AutoIdleExplorer.js), so the bar
    // is stepped with the page keys and fired with the number keys.
    if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
      const dir = Input.isTriggered('pageup') ? -1 : 1;
      const next = _mapArmed
        ? ItemHotbar.stepSlot(_mapIndex, dir)
        : ItemHotbar.stepSlot(dir > 0 ? SLOTS - 1 : 0, dir);
      if (next >= 0) {
        _mapArmed = true;
        _mapIndex = next;
        _mapIdle = 0;
        SoundManager.playCursor();
      }
      return;
    }

    if (!_mapArmed) return;

    if (Input.isTriggered('ok')) {
      spendOkPress();
      disarmMapBar();
      ItemHotbar.use(_mapIndex);
      return;
    }
    if (Input.isTriggered('cancel') || Input.isTriggered('menu') || Input.dir4 !== 0) {
      // Walking away, or backing out, means the bar was not what you wanted.
      disarmMapBar();
      return;
    }
    if (++_mapIdle > IDLE_DISARM_FRAMES) disarmMapBar();
  };

  // What the bar is covering along the bottom edge of the map, in canvas
  // pixels, so anything else that wants that edge , the dialogue box, the
  // choice list , can sit above it instead of on top of it. 0 when the bar is
  // not up.
  ItemHotbar.mapBarReservedHeight = function () {
    if (!_mapVisible) return 0;
    return _mapBar.height() + _mapBar.marginBottom;
  };

  Scene_Map.prototype.updateItemHotbarDisplay = function () {
    if (!_mapVisible) {
      _mapBar.hide();
      return;
    }
    if (_mapArmed && !ItemHotbar.itemAt(_mapIndex)) disarmMapBar();
    // A held number key names its slot without the bar taking the bumpers.
    const keyArmed = _mapKeyArmed !== null;
    _mapBar.render(ItemHotbar.entries(), {
      selected: keyArmed ? _mapKeyArmed : _mapIndex,
      active: _mapArmed || keyArmed,
      inert: !_mapAllowed
    });
  };

  const _Scene_Map_terminate_hotbar = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    disarmMapBar();
    // The card belongs to this map scene: leaving takes it, and the standing
    // still that came with it, away.
    closeTargetPicker();
    _mapVisible = false;
    _mapAllowed = false;
    _mapBar.hide();
    _Scene_Map_terminate_hotbar.call(this);
  };

  // A map transfer or a load while the card was up would leave the flag set and
  // the player frozen, so a scene that starts with no card clears it.
  const _Scene_Map_start_hotbar = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    _Scene_Map_start_hotbar.call(this);
    if (!_picker && $gamePlayer && $gamePlayer._hotbarTargeting) {
      $gamePlayer._hotbarTargeting = false;
    }
  };

  // The OK press the bar just spent must not also open the door in front of
  // the player: Game_Player reads the same still-triggered key later on.
  const _Game_Player_triggerAction_hotbar = Game_Player.prototype.triggerAction;
  Game_Player.prototype.triggerAction = function () {
    if (_suppressActionFrame === Graphics.frameCount) return false;
    return _Game_Player_triggerAction_hotbar.call(this);
  };

  //===========================================================================
  // The backpack bar
  //
  // Inline, mounted into the left page by ItemSystemInventoryUI.js. Here a
  // slot is an assignment target rather than a trigger: the inspected item
  // drops into it on a click, and a right click empties it.
  //===========================================================================

  // Shared by a click on the slot (the inspected item drops in) and a drop
  // onto the slot (the dragged item drops in): same assignment, two ways to
  // reach for it.
  function dropItemOnSlot(i, item) {
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_EnhancedItem)) return;
    if (!ItemHotbar.isFavoritable(item)) {
      SoundManager.playBuzzer();
      return;
    }
    // Landing on the slot an item already sits in takes it back off the bar.
    if (ItemHotbar.slotOf(item) === i) ItemHotbar.clear(i);
    else ItemHotbar.assign(i, item);
    SoundManager.playOk();
    scene.refreshUIbackpack();
  }

  const _inventoryBar = new HotbarUI({
    id: 'backpack-hotbar-row',
    slots: SLOTS,
    inline: true,
    emptyClickable: true,
    onSlotClick: (i) => {
      const scene = SceneManager._scene;
      if (!(scene instanceof Scene_EnhancedItem)) return;
      dropItemOnSlot(i, scene._dndSelectedItem);
    },
    onSlotContext: (i) => {
      const scene = SceneManager._scene;
      if (!(scene instanceof Scene_EnhancedItem)) return;
      if (!ItemHotbar.clear(i)) return;
      SoundManager.playCancel();
      scene.refreshUIbackpack();
    },
    onSlotDrop: (i) => {
      const scene = SceneManager._scene;
      if (!(scene instanceof Scene_EnhancedItem)) return;
      const item = scene._dragItem;
      scene._dragItem = null;
      if (!item) return;
      dropItemOnSlot(i, item);
    }
  });

  /**
   * Markup the backpack's left page reserves for the bar.
   * @param {string} [headExtraHTML] Rides on the label row, right-aligned; the
   *        backpack hangs its carry-weight gauge there so the slots and the
   *        weight they cost read as one strip.
   */
  ItemHotbar.inventoryBarHTML = function (headExtraHTML) {
    return `<div class="backpack-hotbar">
        <div class="backpack-hotbar-head">
          ${headExtraHTML || ''}
        </div>
        <div class="backpack-hotbar-mount" id="backpack-hotbar-mount"></div>
      </div>`;
  };

  /** Called after every backpack refresh; the mount point survives rebuilds. */
  ItemHotbar.renderInventoryBar = function (scene) {
    const mount = document.getElementById('backpack-hotbar-mount');
    if (!mount) return;
    _inventoryBar.mount(mount);
    const selected = scene && scene._dndSelectedItem ? ItemHotbar.slotOf(scene._dndSelectedItem) : -1;
    _inventoryBar.render(ItemHotbar.entries(), { selected: selected, active: selected >= 0 });
  };

  ItemHotbar.disposeInventoryBar = function () {
    _inventoryBar.destroy();
  };
})();
