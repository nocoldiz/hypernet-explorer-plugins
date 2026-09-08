/*:
 * @target MZ
 * @pluginname NumbersOnlyHUD
 * @author Omni-Lex
 * @plugindesc Replaces all HP/MP/TP bars with left-aligned numbers only
 *
 * @help
 * This plugin removes all gauge bars and replaces them with simple left-aligned 
 * numbers in the format "current/max" for HP, MP, and TP in both battle and status screens.
 */

(function() {
    // ======= Core gauge overrides =======

    // Override drawGauge to suppress all gauge bars (this plugin shows numbers only).
    Window_Base.prototype.drawGauge = function(x, y, width, rate, color1, color2) {
        // Intentionally a no-op: prevents any gauge bar from being drawn.
    };
    
    // ======= Sprite_Gauge overrides =======
    
    // Save the original redraw method
    const _Sprite_Gauge_redraw = Sprite_Gauge.prototype.redraw;
    
    // Override the redraw method to use our custom drawing
    Sprite_Gauge.prototype.redraw = function() {
        // Clear the bitmap
        this.bitmap.clear();
        let label = ""
        
        // Set font properties
        this.bitmap.fontFace = $gameSystem.mainFontFace();
        this.bitmap.fontSize = 28; // Fixed font size instead of using this.fontSize()
        
        // Get values based on gauge type
        let current = 0;
        let max = 0;
        let color = "#ffffff";
        
        if (this._battler) {
            switch (this._statusType) {
                case "hp":
                    label = "HP";
                    current = this._battler.hp;
                    max = this._battler.mhp;
                    color = ColorManager.hpColor(this._battler);
                    break;
                case "mp":
                    label = "MP";
                    current = this._battler.mp;
                    max = this._battler.mmp;
                    color = ColorManager.mpColor(this._battler);
                    break;
                case "tp":
                    label = "AP";
                    current = this._battler.tp;
                    max = 100;
                    color = ColorManager.tpColor(this._battler);
                    break;
                default:
                    // For any other gauge types, use the original method
                    _Sprite_Gauge_redraw.call(this);
                    return;
            }
            
            // Set the text color
            this.bitmap.textColor = color;
            
            // Draw the text
            const width = this.bitmapWidth();
            const height = this.bitmapHeight();
            const text = current + " " + label
            this.bitmap.drawText(text, 0, 0, width, height, "left");
        }
    };
    
    // Override drawGaugeRect to do nothing (prevents the gauge background and fill)
    Sprite_Gauge.prototype.drawGaugeRect = function(x, y, width, height) {
        // Do nothing
    };
    
    // Override drawValue to do nothing (prevents drawing the value on top of the gauge)
    Sprite_Gauge.prototype.drawValue = function() {
        // Do nothing
    };
    
    // Override the label drawing (prevent Label: Value format)
    Sprite_Gauge.prototype.drawLabel = function() {
        // Do nothing
    };
    
    // ======= Status Base overrides =======
    
    // Preserve the original placeGauge to maintain gauge positioning
    const _Window_StatusBase_placeGauge = Window_StatusBase.prototype.placeGauge;
    Window_StatusBase.prototype.placeGauge = function(actor, type, x, y) {
        _Window_StatusBase_placeGauge.call(this, actor, type, x, y);
    };
    
    // Override drawActorHp to use text-only format
    Window_StatusBase.prototype.drawActorHp = function(actor, x, y, width) {
        this.changeTextColor(ColorManager.hpColor(actor));
        this.drawText(actor.hp + " HP", x, y, width, "left");
    };
    
    // Override drawActorMp to use text-only format
    Window_StatusBase.prototype.drawActorMp = function(actor, x, y, width) {
        this.changeTextColor(ColorManager.mpColor(actor));
        this.drawText(actor.mp + " MP", x, y, width, "left");
    };
    
    // Override drawActorTp to use text-only format
    Window_StatusBase.prototype.drawActorTp = function(actor, x, y, width) {
        this.changeTextColor(ColorManager.tpColor(actor));
        this.drawText(actor.tp + " AP", x, y, width, "left");
    };
})();