//=============================================================================
// MoneyFormatter.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Money Formatter v1.1.0
 * @author Omni-Lex
 * @version 1.1.0
 * @description v1.1.0 Formats money display and truncates long item names
 *
 * @help MoneyFormatter.js
 * 
 * This plugin reformats money display by adding a dot before the last two digits.
 * For example: 12345 becomes 123.45
 * 
 * Additionally, item names longer than 10 characters are truncated with "..."
 * 
 * The plugin automatically applies to all money displays in the game including:
 * - Status windows
 * - Shop windows  
 * - Item acquisition messages
 * 
 * No additional setup required - just install and activate the plugin.
 * 
 * License: Free for commercial and non-commercial use
 */

(() => {
    'use strict';

    // Function to format money with dot before last two digits
    Window_Base.prototype.drawCurrencyValue = function(value, unit, x, y, width) {
        const formattedValue = this.formatMoneyValue(value);
        const unitWidth = this.textWidth(unit);
        this.resetTextColor();
        this.drawText(formattedValue, x, y, width - unitWidth - 6, "right");
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(unit, x + width - unitWidth, y, unitWidth, "right");
    };

    // Format money value with dot before last two digits.
    //
    // The rule lives in a plain function rather than only on Window_Base, because most of the
    // game's money is printed by DOM and parchment panels that have no window to call it on.
    // Those had no way to reach this and each wrote the conversion out again.
    function formatMoneyValue(value) {
        // The sign and any fraction are taken off the number BEFORE it is split
        // into euros and cents. Slicing the string straight was what printed a
        // negative wage as "-.50" and -5 as "0.-5", and 12.5 as "12..5": the
        // minus sign and the decimal point were being counted as digits.
        const cents = Math.round(Math.abs(Number(value) || 0));
        const sign = (Number(value) || 0) < 0 ? "-" : "";
        const valueStr = String(cents);

        // Under a euro: no whole part to print, so the cents carry it.
        if (valueStr.length <= 2) {
            const result = "0." + valueStr.padStart(2, '0');
            return result.endsWith(".00") ? "0" : sign + result;
        }

        // Insert dot before last two digits
        const mainPart = valueStr.slice(0, -2);
        const decimalPart = valueStr.slice(-2);
        const result = mainPart + "." + decimalPart;
        return sign + (result.endsWith(".00") ? mainPart : result);
    }

    Window_Base.prototype.formatMoneyValue = function(value) {
        return formatMoneyValue(value);
    };

    // The one place anything outside a window can ask for the same wording. Diary.js already
    // looks for exactly this shape.
    window.MoneyFormatter = { format: formatMoneyValue };

    // Truncate item names longer than 18 characters
    Window_Base.prototype.truncateItemName = function(name) {
        if (name.length > 18) {
            return name.substring(0, 18) + "...";
        }
        return name;
    };

    // Override drawItemName to truncate long names
    const _Window_Base_drawItemName = Window_Base.prototype.drawItemName;
    Window_Base.prototype.drawItemName = function(item, x, y, width) {
        if (item) {
            const iconY = y + (this.lineHeight() - ImageManager.iconHeight) / 2;
            const textMargin = ImageManager.iconWidth + 4;
            const itemWidth = Math.max(0, width - textMargin);
            const truncatedName = this.truncateItemName(item.name);
            this.resetTextColor();
            this.drawIcon(item.iconIndex, x, iconY);
            this.drawText(truncatedName, x + textMargin, y, itemWidth);
        }
    };

    // Override Window_Gold drawValue method (full reimplementation, no super call)
    Window_Gold.prototype.drawValue = function() {
        const x = this.itemPadding();
        const y = 0;
        const width = this.innerWidth - this.itemPadding() * 2;
        const value = $gameParty ? $gameParty._gold : 0;
        const unit = $dataSystem ? $dataSystem.currencyUnit : "";
        const formattedValue = this.formatMoneyValue(value);
        const unitWidth = this.textWidth(unit);
        
        this.resetTextColor();
        this.drawText(formattedValue, x, y, width - unitWidth - 6, "right");
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(unit, x + width - unitWidth, y, unitWidth, "right");
    };



    // Override message display for money gain/loss
    const _Game_Message_add = Game_Message.prototype.add;
    Game_Message.prototype.add = function(text) {
        // Check if the text contains money references and format them
        const moneyRegex = /\\G\[(\d+)\]/g;
        const formattedText = text.replace(moneyRegex, (match, amount) => {
            const formattedAmount = this.formatMoneyForMessage(parseInt(amount));
            const currencyUnit = $dataSystem ? $dataSystem.currencyUnit : "";
            return formattedAmount + " " + currencyUnit;
        });
        
        _Game_Message_add.call(this, formattedText);
    };

    // Format money for message display
    Game_Message.prototype.formatMoneyForMessage = function(value) {
        const valueStr = value.toString();
        
        if (valueStr.length <= 2) {
            return "0." + valueStr.padStart(2, '0');
        }
        
        const mainPart = valueStr.slice(0, -2);
        const decimalPart = valueStr.slice(-2);
        return mainPart + "." + decimalPart;
    };

})();