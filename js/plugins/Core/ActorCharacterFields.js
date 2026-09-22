//=============================================================================
// ActorCharacterFields.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Per-character fields (gender, bust/battler portrait, equipment-derived stats) stored directly on the actor instead of in global game variables.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ActorCharacterFields.js
 * ============================================================================
 * These per-character values used to live in fixed global game variables, one
 * block per protagonist. They now live on the Game_Actor itself, so they are
 * party-private, travel with the character, and no longer occupy variable ids:
 *
 *   gender() / setGender(v) .................  0=Male 1=Female 2=Non-binary 3=Cocoon
 *   hormoneBalance() / setHormoneBalance(v) .  0=oestrogenic .. 100=androgenic,
 *                                              null where nobody has said
 *   vnBattler() / setVnBattler(v) ...........  monster/battler portrait image name (or 0)
 *   vnBust() / setVnBust(v) .................  bust portrait image name (or 0)
 *   portraitMode() / setPortraitMode(v) .....  "bust" | "sprite" | "model" (or 0)
 *   pvArcane/pvSubstance/pvStealth/pvIntimidation() + setters ... equip-derived stats
 *
 * portraitMode is the exclusive art style chosen at character creation. A
 * humanoid picks "bust" (hand-drawn portrait) or "model" (a procedural 3D model
 * built in the creation wizard); only the chosen one is ever displayed, so the
 * two never compete. "sprite" marks a monster instead: a creature built on an
 * existing species, an enemy recruited through the talk menu, or a summon. Those
 * are always shown as the procedural 3D model of that species (vnBattler names
 * its art, _recruitedEnemyId the exact enemy when it is known), and the flat
 * battler image only stands in when no 3D model resolves for the species.
 *
 * All plugins and events that used the old variables (gender 38-40, battler
 * 106-108, bust 109/117/118, stats 121-130) were rewritten to call these
 * accessors, and those variable ids were freed in System.json.
 * ============================================================================
 */

(() => {
    "use strict";

    // Numeric field: integer, default 0.
    function defNumField(getter, setter, key) {
        Game_Actor.prototype[getter] = function () {
            return this[key] === undefined || this[key] === null ? 0 : this[key];
        };
        Game_Actor.prototype[setter] = function (value) {
            this[key] = Math.floor(Number(value) || 0);
        };
    }

    // Free-form field (image name string, or 0 when unset). Default 0 keeps the
    // old `if (name) { ... }` falsy checks behaving as before.
    function defRawField(getter, setter, key) {
        Game_Actor.prototype[getter] = function () {
            return this[key] === undefined || this[key] === null ? 0 : this[key];
        };
        Game_Actor.prototype[setter] = function (value) {
            this[key] = value;
        };
    }

    defNumField("gender", "setGender", "_pvGender");

    // The sex-hormone balance the character was BUILT with: 0 is a wholly
    // oestrogenic body, 100 a wholly androgenic one, 50 an even one. It is not
    // a plain numeric field because there are three answers and not a hundred
    // and one: a number, and `null` for "nobody ever said". Null is what an
    // NPC answers, and what a character made before the creation slider existed
    // answers, and both of those have to keep reading their hormones off the
    // gender the way they always did (Health_BiologicSimulation). A default of
    // 0 would have read as "wholly oestrogenic" and rewritten every one of them.
    Game_Actor.prototype.hormoneBalance = function () {
        const v = this._pvHormoneBalance;
        return (v === undefined || v === null) ? null : v;
    };
    Game_Actor.prototype.setHormoneBalance = function (value) {
        if (value === null || value === undefined) {
            this._pvHormoneBalance = null;
            return;
        }
        this._pvHormoneBalance = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    };

    defRawField("vnBattler", "setVnBattler", "_pvBattler");
    defRawField("vnBust", "setVnBust", "_pvBust");
    defRawField("portraitMode", "setPortraitMode", "_pvPortraitMode");

    // How this body reproduces: 0 testes, 1 uterus, 2 oviparous, 3 plant,
    // 4 mitosis. It used to live in variables 87/115/116, which the writers
    // picked by ACTOR ID and the reader picked by PARTY INDEX - so reordering
    // the party handed a character somebody else's reproductive system, and a
    // pregnancy whose type read back as 0 gestated for ever without a birth.
    // null means nobody has said, which is what lets an old save migrate off
    // the variables once.
    Game_Actor.prototype.reproductionType = function () {
        const v = this._pvReproductionType;
        return (v === undefined || v === null) ? null : v;
    };
    Game_Actor.prototype.setReproductionType = function (value) {
        this._pvReproductionType = (value === null || value === undefined)
            ? null : Math.floor(Number(value) || 0);
    };

    defNumField("pvArcane", "setPvArcane", "_pvArcane");
    defNumField("pvSubstance", "setPvSubstance", "_pvSubstance");
    defNumField("pvStealth", "setPvStealth", "_pvStealth");
    defNumField("pvIntimidation", "setPvIntimidation", "_pvIntimidation");
})();
