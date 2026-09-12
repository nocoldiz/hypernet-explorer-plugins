// ============================================================================
// Battle System Enhanced - Map UI & Enemy Level Nameplates
// For RPG Maker MZ
// ============================================================================

/*:
 * @target MZ
 * @plugindesc v2.0 Level Display: enemy level labels on map character sprites.
 * @author Combined by Claude, modified by OmniLex
 * @pluginName BattleSystemEnhancedLevelDisplay
 *
 * @help
 * ============================================================================
 * BattleSystemEnhancedLevelDisplay, Sub-module
 * ============================================================================
 *
 * Requires BattleSystemEnhanced.js (Core) and all preceding sub-modules.
 *
 * Provides overworld UI element layer by attaching floating numeric level tags
 * relative to visible map character rendering points.
 *
 * Loading order (LAST):
 *   1. BattleSystemEnhanced.js (Core)
 *   2. BattleSystemEnhancedEncounters.js
 *   3. BattleSystemEnhancedState.js
 *   4. BattleSystemEnhancedDeath.js
 *   5. BattleSystemEnhancedMechanics.js
 *   6. BattleSystemEnhancedLevelDisplay.js (THIS PLUGIN)
 */

(() => {
    'use strict';

    if (!window.BattleSystemEnhanced) {
        console.error('BattleSystemEnhancedLevelDisplay: Core plugin not loaded!');
        return;
    }
    const BSE = window.BattleSystemEnhanced;

    // ========================================================================
    // 1. Helper: Get enemy level from event
    // ========================================================================

    // A troop's level never changes, and this is now asked once per enemy
    // sprite per frame (the plate watches the level band, not just the troop
    // id), so the note regex behind it is run once per troop and remembered.
    const troopLevelCache = new Map();

    function getEnemyLevelFromEvent(event) {
        if (!event._fixedTroopId || event._fixedTroopId === 0) return 0;
        const cached = troopLevelCache.get(event._fixedTroopId);
        if (cached !== undefined) return cached;
        const troop = $dataTroops[event._fixedTroopId];
        if (!troop || !troop.members.length) return 0;
        let maxLevel = 0;
        for (const member of troop.members) {
            const enemyData = $dataEnemies[member.enemyId];
            if (enemyData && enemyData.note) {
                const level = BSE.Helpers.getEnemyLevel(enemyData.note);
                if (level > maxLevel) maxLevel = level;
            }
        }
        troopLevelCache.set(event._fixedTroopId, maxLevel);
        return maxLevel;
    }

    // Expose for other modules (used in enemy-vs-enemy combat)
    window.getEnemyLevelFromEvent = getEnemyLevelFromEvent;

    // ========================================================================
    // 2. Sprite_Character - Override update for enemy level labels
    // ========================================================================

    // The plate is NOT a child of the character sprite. A child of the sprite
    // shares its z (3 for a normal character), and the engine's balloon sprites
    // sit at z 7 in the very same tilemap, so a "!" popping over a monster that
    // has just noticed the party used to swallow the level. The plate is a
    // sibling instead, parked one step above the balloons, and follows its
    // owner sprite by hand every frame.
    const LEVEL_PLATE_Z = 8;

    // Every plate currently standing on the map, whoever owns it. A plate is an
    // extra sprite the engine knows nothing about, so it only lives as long as
    // its owner keeps saying, once a frame, that it should: the stamp below is
    // that word, and the sweep in Spriteset_Map.update takes off anything that
    // stopped hearing it. That is what a level of a monster long gone was doing
    // hanging over empty ground - the sprite behind it had quietly stopped
    // being updated, and nothing was left to notice.
    const livePlates = new Set();

    // Two frames of slack, so a second spriteset that updates after this one
    // (split screen) does not lose plates it is about to refresh.
    const PLATE_STALE_FRAMES = 2;

    function plateFrame() {
        return typeof Graphics !== 'undefined' ? (Graphics.frameCount || 0) : 0;
    }

    const _Sprite_Character_update_EnemyLevel = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _Sprite_Character_update_EnemyLevel.call(this);
        this.updateEnemyLevelLabel();
    };

    Sprite_Character.prototype.updateEnemyLevelLabel = function() {
        const character = this._character;
        if (!character || !character.eventId) return this.dropEnemyLevelLabel();
        const eventId = character.eventId();
        if (!eventId) return this.dropEnemyLevelLabel();
        // For an event sprite, this._character IS the Game_Event, so use it
        // directly instead of re-resolving $gameMap.event(eventId) every frame
        // for every character sprite on the map.
        const event = character;
        const eventData = event.event ? event.event() : null;
        if (!eventData) return this.dropEnemyLevelLabel();

        // The sprite has to be showing the map's OWN event. A spriteset built a
        // second time under a live scene, or an event dropped from $gameMap and
        // replaced, leaves sprites bound to a Game_Event nothing moves any more:
        // they stand frozen where the creature was last seen, and their plate
        // stands there with them. An erased event goes the same way.
        const live = $gameMap && $gameMap.event ? $gameMap.event(eventId) : event;
        if (live !== event || event._erased) return this.dropEnemyLevelLabel();

        // Only show for events with a fixed troop ID assigned. If the troop was
        // cleared (e.g. the enemy was defeated), remove any stale label instead
        // of leaving it floating on the map.
        if (!event._fixedTroopId || event._fixedTroopId === 0) {
            return this.dropEnemyLevelLabel();
        }

        // Rebuild when the troop changes, and also when the party has crossed
        // into a different level band against it: the plate is colour-coded on
        // the gap, so a party that levels up past a monster has to see it go
        // back to white without waiting for the troop to change.
        //
        // Both of those are pure functions of two things, the troop and the
        // party's median level, and the level itself is already cached per
        // troop. So neither was ever worth deriving until one of the two had
        // actually moved, yet the band was derived for every enemy sprite on
        // every frame, and BSE.Helpers.levelGapTier allocates a result object
        // each time it is asked. The median is the cheap one to test (it is
        // frame-cached for the whole sweep), so it is what gates the rest.
        const median = partyMedianLevel();
        const troopChanged = this._lastEnemyTroopId !== event._fixedTroopId;
        if (troopChanged || this._lastEnemyMedian !== median) {
            this._lastEnemyMedian = median;
            const enemyLevel = getEnemyLevelFromEvent(event);
            const band = enemyLevel > 0 ? levelGapTierFor(enemyLevel) : -1;
            // A new troop reprints the plate even at the same colour, because
            // the number on it is the troop's, not the band's.
            if (troopChanged || this._lastEnemyLevelBand !== band) {
                this._lastEnemyTroopId = event._fixedTroopId;
                this._lastEnemyLevelBand = band;

                // Remove old label if exists
                this.removeEnemyLevelLabel();

                if (enemyLevel > 0) {
                    this.createEnemyLevelLabel(enemyLevel, band);
                }
            }
        }

        this.syncEnemyLevelLabel();
        // The owner's word for this frame: without it the sweep below assumes
        // the sprite has stopped being updated and takes the plate off the map.
        if (this._enemyLevelLabel) this._enemyLevelLabel._plateFrame = plateFrame();
    };

    // Dropping the plate AND the memory of what it was drawn for, so a sprite
    // that comes back to life (an event slot re-dealt to another monster) builds
    // a fresh one instead of trusting the cache.
    Sprite_Character.prototype.dropEnemyLevelLabel = function() {
        this.removeEnemyLevelLabel();
        this._lastEnemyTroopId = 0;
        this._lastEnemyLevelBand = -1;
    };

    // The plate rides in the sprite's own container, so it has to be told where
    // its owner ended up this frame, and has to inherit the states it used to
    // get for free as a child: a hidden or transparent character carries a
    // hidden plate with it.
    Sprite_Character.prototype.syncEnemyLevelLabel = function() {
        const label = this._enemyLevelLabel;
        if (!label) return;
        const container = this.parent;
        if (!container) {
            this.removeEnemyLevelLabel();
            return;
        }
        if (label.parent !== container) {
            if (label.parent) label.parent.removeChild(label);
            container.addChild(label);
        }
        this.placeEnemyLevelLabel();
    };

    // Copying the owner's position once per frame is not enough: the map can be
    // dragged (and the display position pushed) after the spriteset has already
    // updated, so a plate synced at update time trails its monster by a frame
    // for as long as the drag lasts. The position is therefore taken again at
    // render time, in the plate's own updateTransform, where the owner sprite
    // has its final coordinates for this frame.
    Sprite_Character.prototype.placeEnemyLevelLabel = function() {
        const label = this._enemyLevelLabel;
        if (!label) return;
        label.x = this.x;
        label.y = this.y - 50;
        // The plate sits well above its owner, so a monster standing just past
        // the bottom or the side of the screen would still push its level onto
        // the map. Nothing shows for an owner the player cannot see.
        label.visible = this.visible && this.opacity > 0 && this.isOwnerOnScreen();
    };

    // Whether the character the plate belongs to is inside the viewport, with
    // a tile of slack so a plate does not blink out on the edge of a scroll.
    Sprite_Character.prototype.isOwnerOnScreen = function() {
        const w = Graphics.width;
        const h = Graphics.height;
        const padX = $gameMap ? $gameMap.tileWidth() : 48;
        const padY = $gameMap ? $gameMap.tileHeight() : 48;
        return this.x >= -padX && this.x <= w + padX &&
               this.y >= -padY && this.y <= h + padY;
    };

    Sprite_Character.prototype.removeEnemyLevelLabel = function() {
        const label = this._enemyLevelLabel;
        if (!label) return;
        livePlates.delete(label);
        label._plateOwner = null;
        // Hidden as well as detached: anything still holding this plate (the
        // tilemap mid-walk, the deferred list below) must not draw it again.
        label.visible = false;
        if (label.parent) label.parent.removeChild(label);
        this._enemyLevelLabel = null;
    };

    // Which of the core's three level bands a monster falls in against the
    // party median. The plate reads the same rule the damage layer runs on
    // (BSE.Helpers.levelGapTier), so what the colour promises is what the
    // fight delivers.
    let medianCacheFrame = -1;
    let medianCacheValue = 1;

    function partyMedianLevel() {
        const frame = typeof Graphics !== 'undefined' ? Graphics.frameCount : -1;
        if (frame === medianCacheFrame) return medianCacheValue;
        const party = $gameParty ? $gameParty.members() : [];
        medianCacheValue = party.length > 0 ? BSE.Helpers.getMedianLevel(party) : 1;
        medianCacheFrame = frame;
        return medianCacheValue;
    }

    function levelGapTierFor(level) {
        return BSE.Helpers.levelGapTier(level, partyMedianLevel()).tier;
    }

    // White inside the band the party can fell, amber through the band they
    // can still take at a cost, red once the fight is out of reach.
    const LEVEL_PLATE_COLORS = {};
    LEVEL_PLATE_COLORS[BSE.Data.LEVEL_GAP_EVEN]     = '#FFFFFF';
    LEVEL_PLATE_COLORS[BSE.Data.LEVEL_GAP_HARD]     = '#FFD11A';
    LEVEL_PLATE_COLORS[BSE.Data.LEVEL_GAP_HOPELESS] = '#FF3B30';

    Sprite_Character.prototype.createEnemyLevelLabel = function(level, band) {
        const tier = band != null && band >= 0 ? band : levelGapTierFor(level);
        const color = LEVEL_PLATE_COLORS[tier] || '#FFFFFF';

        this._enemyLevelLabel = new Sprite();
        this._enemyLevelLabel._plateOwner = this;
        this._enemyLevelLabel._plateFrame = plateFrame();
        livePlates.add(this._enemyLevelLabel);
        this._enemyLevelLabel.bitmap = new Bitmap(80, 30);
        this._enemyLevelLabel.anchor.x = 0.5;
        this._enemyLevelLabel.anchor.y = 1;

        const bitmap = this._enemyLevelLabel.bitmap;
        bitmap.fontFace = 'GameFont';
        bitmap.fontSize = 18;
        bitmap.textColor = color;
        bitmap.outlineColor = 'rgba(0, 0, 0, 0.8)';
        bitmap.outlineWidth = 4;

        bitmap.drawText(`L. ${level}`, 0, 0, 80, 30, 'center');

        // Above the balloons rather than inside the character sprite. The
        // tilemap sorts its children on z first, so this reads over anything
        // the engine pops on a monster that has spotted the party.
        this._enemyLevelLabel.z = LEVEL_PLATE_Z;
        // A tilemap runs update() on every child it holds; the plate uses that
        // to clean itself up if its owner sprite is ever pulled off the map
        // without going through removeEnemyLevelLabel.
        const owner = this;
        this._enemyLevelLabel.update = function() {
            if (!owner.parent || owner._enemyLevelLabel !== this) {
                // The tilemap is walking its own child list right now, so the
                // plate is only hidden here and unhooked a moment later: pulling
                // it out mid-walk makes the tilemap skip the next child, and the
                // plate after this one would keep drawing over a monster that is
                // no longer on the map.
                this.visible = false;
                livePlates.delete(this);
                if (owner._enemyLevelLabel === this) {
                    owner._enemyLevelLabel = null;
                    owner._lastEnemyTroopId = 0;
                    owner._lastEnemyLevelBand = -1;
                }
                orphanedPlates.push(this);
                return;
            }
            // The owner is walked before the plates (z 3 against z 8), so by now
            // it has either stamped this frame or it has stopped being updated
            // at all. An unstamped plate draws nothing while the sweep decides.
            if (this._plateFrame !== plateFrame()) {
                this.visible = false;
                return;
            }
            owner.placeEnemyLevelLabel();
        };
        // Invisible children are skipped by the renderer, so the plate cannot
        // rely on updateTransform alone to bring itself back; update() above
        // decides visibility, and this only keeps the position honest for a map
        // that moved after the spriteset had its turn.
        this._enemyLevelLabel.updateTransform = function() {
            if (owner._enemyLevelLabel === this) owner.placeEnemyLevelLabel();
            PIXI.Sprite.prototype.updateTransform.call(this);
        };
        this.syncEnemyLevelLabel();
    };

    // ========================================================================
    // 4. Deferred removal of plates whose owner has left the map
    // ========================================================================

    const orphanedPlates = [];

    const _Spriteset_Map_update_EnemyLevel = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update_EnemyLevel.call(this);
        while (orphanedPlates.length > 0) {
            const plate = orphanedPlates.pop();
            livePlates.delete(plate);
            if (plate.parent) plate.parent.removeChild(plate);
        }
        // Everything above runs off a sprite that is still being updated. This
        // does not: it walks the plates themselves and takes off any the owner
        // has stopped placing, whatever the reason - a sprite pulled out of the
        // map, one left over from a spriteset built a second time, one bound to
        // an event that no longer exists. Deleting from a Set while walking it
        // is safe.
        const now = plateFrame();
        for (const plate of livePlates) {
            if (now - (plate._plateFrame || 0) < PLATE_STALE_FRAMES) continue;
            livePlates.delete(plate);
            plate.visible = false;
            const owner = plate._plateOwner;
            plate._plateOwner = null;
            if (owner && owner._enemyLevelLabel === plate) owner.dropEnemyLevelLabel();
            if (plate.parent) plate.parent.removeChild(plate);
        }
    };

})();