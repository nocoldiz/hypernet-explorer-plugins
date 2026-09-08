/*:
 * @target MZ
 * @plugindesc Allows for breaking/digging walls at runtime
 * @author Omni-Lex
 *
 * @param BreakableTilesetId
 * @desc Tileset ID that contains breakable walls
 * @default 1
 * 
 * @param ReplacementTileId
 * @desc ID of the tile that will replace broken walls
 * @default 0
 *
 * @help
 * This plugin allows players to break walls in the game.
 * 
 * How to use:
 * 1. Set the tileset ID for breakable walls in the plugin parameters
 * 2. Create a common event that calls the breakWallInFront function
 * 3. Assign that common event to a key or action button
 * 
 * Script calls:
 *   DiggingSystem.breakWallInFront() - Breaks wall in front of player
 *   DiggingSystem.isWallBreakable(x, y) - Checks if wall is breakable
 */

var DiggingSystem = DiggingSystem || {};

(function() {
    'use strict';
    
    var parameters = PluginManager.parameters('DiggingSystem');
    DiggingSystem.breakableTilesetId = Number(parameters['BreakableTilesetId'] || 1);
    DiggingSystem.replacementTileId = Number(parameters['ReplacementTileId'] || 0);
    
    // Function to check if a tile is a breakable wall
    DiggingSystem.isWallBreakable = function(x, y) {
        const mapId = $gameMap.mapId();
        const tileId = $gameMap.tileId(x, y, 0); // Layer 0 for ground/wall tiles
        
        // Check if the tile is from the breakable tileset
        const tilesetId = $gameMap.tileset().id;
        return tilesetId === this.breakableTilesetId && this.isWall(tileId);
    };
    
    // Helper function to determine if a tile is a wall (can be customized)
    DiggingSystem.isWall = function(tileId) {
        // This is a simplified check. You might need to adjust based on your tileset
        // Generally, walls have passage flags that block movement
        const flags = $gameMap.tilesetFlags()[tileId];
        return (flags & 0x0f) === 0x0f; // If all directions are blocked
    };
    
    // Function to get coordinates in front of the player
    DiggingSystem.getFrontPosition = function() {
        const direction = $gamePlayer.direction();
        // Use the map-aware rounding so digging wraps correctly on loop maps.
        const x = $gameMap.roundXWithDirection($gamePlayer.x, direction);
        const y = $gameMap.roundYWithDirection($gamePlayer.y, direction);
        return {x: x, y: y};
    };
    
    // Main function to break a wall in front of the player
    DiggingSystem.breakWallInFront = function() {
        const frontPos = this.getFrontPosition();
        
        if (this.isWallBreakable(frontPos.x, frontPos.y)) {
            // Replace the wall tile with the specified tile
            this.replaceTile(frontPos.x, frontPos.y, this.replacementTileId);
            
            // Update surrounding autotiles
            this.updateSurroundingAutotiles(frontPos.x, frontPos.y);
            
            // Play breaking sound effect (optional)
            AudioManager.playSe({name: 'Break', volume: 90, pitch: 100, pan: 0});
            
            return true;
        }
        
        return false;
    };
    
    // Procedurally-regenerated maps (world map 315 and proc map 636) reuse the
    // same map ID for wholly different layouts depending on the world cell the
    // player currently occupies (tracked in variables 43/44, set before setup).
    // Keying stored tile edits by map ID alone would replay one cell's digs onto
    // an unrelated cell's layout, so include the world coordinates for those maps.
    const PROC_MAP_IDS = [315, 636];
    DiggingSystem.getModifiedTilesKey = function(mapId) {
        if (PROC_MAP_IDS.indexOf(mapId) !== -1) {
            const wx = $gameVariables ? $gameVariables.value(43) : 0;
            const wy = $gameVariables ? $gameVariables.value(44) : 0;
            return mapId + '@' + wx + ',' + wy;
        }
        return mapId;
    };

    // Function to replace a tile at specific coordinates
    DiggingSystem.replaceTile = function(x, y, newTileId) {
        const mapId = $gameMap.mapId();
        const key = this.getModifiedTilesKey(mapId);

        // Store the change in game system for persistence
        if (!$gameSystem._modifiedTiles) {
            $gameSystem._modifiedTiles = {};
        }

        if (!$gameSystem._modifiedTiles[key]) {
            $gameSystem._modifiedTiles[key] = [];
        }

        // Save the modification, deduped by coordinate so repeated digs on the
        // same tile do not bloat the save with duplicate entries.
        const tiles = $gameSystem._modifiedTiles[key];
        const existingIndex = tiles.findIndex(t => t.x === x && t.y === y);
        if (existingIndex >= 0) {
            tiles[existingIndex].tileId = newTileId;
        } else {
            tiles.push({ x: x, y: y, tileId: newTileId });
        }
        
        // Modify the tile data directly
        const layer = 0; // Assuming walls are on layer 0
        const width = $dataMap.width;
        const height = $dataMap.height;
        
        // Update the map data
        const zIndex = layer * width * height;
        const index = zIndex + y * width + x;
        $dataMap.data[index] = newTileId;
        
        // Request a refresh of the map
        $gameMap.requestRefresh();
    };
    
    // Function to update surrounding autotiles.
    // The tilemap recomputes autotile shapes from neighbouring tile data on
    // refresh, so we only need to request a refresh here. Pushing the unchanged
    // neighbour tile IDs into _modifiedTiles did nothing except bloat the save.
    DiggingSystem.updateSurroundingAutotiles = function(x, y) {
        $gameMap.requestRefresh();
    };
    
    // Store original map load function to extend it
    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        
        // Apply stored tile modifications after loading the map. Use the
        // coordinate-aware key so regenerated proc maps (315/636) at a different
        // world cell never inherit another cell's stored edits.
        const key = DiggingSystem.getModifiedTilesKey(mapId);
        if ($gameSystem && $gameSystem._modifiedTiles && $gameSystem._modifiedTiles[key]) {
            const modifications = $gameSystem._modifiedTiles[key];
            
            for (let i = 0; i < modifications.length; i++) {
                const mod = modifications[i];
                const layer = 0;
                const width = $dataMap.width;
                const height = $dataMap.height;
                const zIndex = layer * width * height;
                const index = zIndex + mod.y * width + mod.x;
                
                // Apply the stored modification
                $dataMap.data[index] = mod.tileId;
            }
            
            this.requestRefresh();
        }
    };
})();
