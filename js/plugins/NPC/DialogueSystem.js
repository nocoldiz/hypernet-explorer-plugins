/*:
 * @target MZ MV
 * @plugindesc Parchment HTML dialogue, choice overlay, keyword system, and VN bust display.
 * @author Sang Hendrix / Antigravity / Omni-Lex
 *
 * @command showBust
 * @text Show Character Bust
 * @desc Manually display a character bust on screen.
 *
 * @command hideBusts
 * @text Hide All Busts
 * @desc Manually hide all bust images and names.
 *
 * @command batchDialogue
 * @text Batch Dialogue Mode
 * @desc Bust stays visible across multiple messages until conversation ends.
 *
 * @command showCustomBust
 * @text Show Custom Bust
 * @desc Display a specific bust image from the busts/ folder.
 *
 * @arg imageName
 * @type string
 * @text Image Name
 * @desc Name of the image in busts/ (without extension).
 *
 * @arg characterName
 * @type string
 * @text Character Name
 * @desc Name to display (optional).
 *
 * @command playerBatchDialogue
 * @text Show Player Bust
 * @desc Display a specific bust image from the busts/ folder.
 *
 * @arg imageName
 * @type string
 * @text Image Name
 * @desc Name of the image in busts/ (without extension).
 *
 * @command playStory
 * @text Play Story Dialogue
 * @desc Play a written scene from js/db/Dialogues, as a bust conversation.
 *
 * @arg fileName
 * @type string
 * @text Script Name
 * @desc Name of the script in js/db/Dialogues, without the _en suffix (ex: mainquest1).
 *
 * @arg sceneName
 * @type string
 * @text Scene
 * @desc The scene inside that script, named under its rule of dashes (ex: intro, new_year_eve). Empty plays the whole file.
 *
 * @command Rumors
 * @text Talk To NPC
 * @desc One random bust exchange with the calling NPC: they open, the party opens, or they pass on a rumour.
 *
 * @help
 * DialogueSystem.js
 * -----------------------------------------------------------------------
 * Merged plugin combining:
 * 1. HTML Message Window: DOM textbox with parchment style
 * 2. HTML Choice List: DOM choice overlay
 * 3. Keyword System: [Keyword] extraction, coloring, gating
 * 4. VN Bust System: character bust sprites with slide animation
 * -----------------------------------------------------------------------
 * This plugin owns the *conversation*: the box the player reads, the choices
 * they answer with, and the face doing the talking. It does not own popups.
 *
 * Anything transient the player only glances at - a topic learned, a reward,
 * a need moving, a level gained - belongs to the shared notification service
 * (window.ParchmentToast, Core/ParchmentToast.js) and never to a message box
 * or a bespoke overlay declared here. Several notifications can be on screen
 * at once, so an event that does three things reports all three.
 * -----------------------------------------------------------------------
 */

var Imported = Imported || {};
Imported.DialogueSystem = true;

(function () {
    "use strict";

    const PLUGIN_NAME = "DialogueSystem";

    // Who is standing at this event right now. A <Shop> counter is named after
    // the fixture ("Shop", "Bar") and worked in shifts by somebody else, so
    // every line the player reads and every society lookup has to go through
    // NPCSim rather than the raw event name.
    function _npcNameForEvent(ev) {
        if (!ev) return null;
        const name = window.NPCSim?.npcNameForEvent?.(ev) ?? ev.event()?.name?.trim();
        return name || null;
    }

    // -------------------------------------------------------------------------
    // Bust display constants
    // -------------------------------------------------------------------------
    const bustOpacity      = 255;
    const bustAspect       = 0.74;  // every portrait in img/busts is about 3:4
    const bustMaxHeight    = 615;   // the tallest a portrait is ever drawn
    const bustMinHeight    = 240;   // and the shortest, on a very short screen
    const bustTopMargin    = 6;     // air above its head
    const bustEdgeMargin   = 0;     // portraits stand flush against the screen edges
    // A story scene stages one of its speakers against either edge of the
    // screen and dims whoever is not talking.
    // The listener of a story scene is not made see-through, it is taken out of
    // the light: full opacity, the brightness pulled down. A transparent
    // portrait shows the map through somebody's face.
    const storyDimTone     = [-96, -96, -96, 0];
    const storyLitTone     = [0, 0, 0, 0];
    const fadeInDuration   = 12;
    const fadeOutDuration  = 12;

    const SpritesAssociation = (window.Sprites && window.Sprites.SpritesAssociation) || {};

    // -------------------------------------------------------------------------
    // Bust size helpers
    // -------------------------------------------------------------------------
    // Every portrait in the game is staged the same way, whether it is one
    // speaker or a whole story cast: feet on the bottom edge of the screen,
    // head clear of the top of it, flush against the screen edge on its own
    // side. The message box is a DOM overlay drawn over the canvas, so whatever
    // a portrait puts behind the box is simply swallowed by it and the two read
    // as one block. Standing on the box's top edge instead, as the single
    // speaker used to, cut the portrait straight across in mid air wherever the
    // box was narrower than the side it hangs on, and squeezed its head against
    // the top of the screen whenever the box sat high.
    function bustFloor() { return Graphics.height; }

    // The tallest a portrait can be drawn: what is left of the screen above the
    // floor, and what the slice of screen width it is allowed to fill can hold.
    // The photographic busts are drawn all the way to the top of their own
    // file, so anything spent above the screen's top edge is a decapitated head.
    function bustHeightFor(halfWidth) {
        const room = Math.max(0, bustFloor() - bustTopMargin);
        const wide = Math.max(0, halfWidth) / bustAspect;
        return Math.round(Math.max(bustMinHeight, Math.min(bustMaxHeight, room, wide)));
    }

    function getBustHeight() { return bustHeightFor(Graphics.width / 2 - bustEdgeMargin); }
    function getBustWidth()  { return Math.round(getBustHeight() * bustAspect); }

    function addBustToScene(bust, scene) {
        if (!scene || bust.parent) return;
        if (scene._windowLayer) {
            const idx = scene.children.indexOf(scene._windowLayer);
            if (idx >= 0) { scene.addChildAt(bust, idx); return; }
        }
        if (scene._messageWindow) {
            const idx = scene.children.indexOf(scene._messageWindow);
            if (idx >= 0) { scene.addChildAt(bust, idx); return; }
        }
        scene.addChild(bust);
    }

    // -------------------------------------------------------------------------
    // Auto Wrap Text
    // -------------------------------------------------------------------------
    function _wrapWords(text, maxLen) {
        let result = '';
        let lineLen = 0;
        const words = text.split(' ');
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (!word) continue;
            if (word.length > maxLen) {
                if (lineLen > 0) { result += '\n'; lineLen = 0; }
                for (let j = 0; j < word.length; j += maxLen) {
                    const chunk = word.substring(j, Math.min(j + maxLen, word.length));
                    result += chunk;
                    if (j + maxLen < word.length) { result += '-\n'; lineLen = 0; }
                    else { lineLen = chunk.length; }
                }
            } else {
                if (lineLen + word.length + (lineLen > 0 ? 1 : 0) > maxLen) { result += '\n'; lineLen = 0; }
                if (lineLen > 0) { result += ' '; lineLen++; }
                result += word;
                lineLen += word.length;
            }
        }
        return result;
    }

    // The parchment box is HTML (#html-msg-text, white-space: pre-wrap), so the
    // browser wraps at the real box width using the real font metrics.
    function _htmlMessageActive() {
        return typeof document !== 'undefined' && !!document.getElementById('html-msg-text');
    }

    function autoWrapText(text, maxLineLength = 60) {
        if (maxLineLength === 60) maxLineLength = 68;
        // Strip every manually-authored line break and reflow from scratch. Event
        // text frequently has hand-placed newlines (4-line Show Text boxes, breaks
        // dropped mid-sentence) that wrap badly in the parchment box, so we flatten
        // the whole thing to a single run of words first.
        const flat = String(text).replace(/\r?\n/g, ' ').replace(/  +/g, ' ').trim();
        if (!flat) return '';
        // Force a hard line break after every sentence that ends in '.', i.e. a
        // period followed by whitespace or end-of-text. Decimals and money like
        // "12.00" are left alone because no whitespace follows the dot.
        const sentences = flat.replace(/\.(\s+|$)/g, '.\n').split('\n')
            .map(s => s.trim()).filter(s => s.length > 0);
        // Fixed-width breaks on top of the browser's own wrapping are what caused
        // stray short lines mid-sentence ("...claims to be / from the / year
        // 2000."): our break landed in one place, the CSS wrap in another. Let the
        // box wrap itself and only keep the per-sentence breaks. The character
        // count is still used for the canvas window, which has no wrapping at all.
        if (_htmlMessageActive()) return sentences.join('\n');
        return sentences.map(s => _wrapWords(s, maxLineLength)).join('\n');
    }

    // -------------------------------------------------------------------------
    // Paginating a long line
    // -------------------------------------------------------------------------
    // The box is four rows tall and clips whatever runs past them, so a line
    // longer than that is not squeezed in: it is dealt out over as many boxes
    // as it needs. A box always ends between two words, never inside one, and
    // never inside a [Topic] either, since the brackets are read later.
    const MSG_BOX_ROWS   = 4;
    const MSG_LINE_CHARS = 46;  // what one row of the parchment box holds

    // A page that opened a bracket it never closed hands the whole unfinished
    // run to the page after it, so a topic is always read out of one box.
    function _healBrackets(pages) {
        for (let i = 0; i < pages.length - 1; i++) {
            const page = pages[i];
            const open = page.lastIndexOf('[');
            if (open < 0 || page.indexOf(']', open) >= 0) continue;
            pages[i]     = page.slice(0, open).trim();
            pages[i + 1] = (page.slice(open) + ' ' + pages[i + 1]).trim();
        }
        return pages.filter(page => page.length > 0);
    }

    function paginateMessage(text, rows = MSG_BOX_ROWS, cols = MSG_LINE_CHARS) {
        const flat = String(text == null ? '' : text)
            .replace(/\r?\n/g, ' ').replace(/  +/g, ' ').trim();
        if (!flat) return [];
        // The box breaks a line after every sentence (see autoWrapText), so a
        // page is counted in the rows those breaks actually produce.
        const sentences = flat.replace(/\.(\s+|$)/g, '.\n').split('\n')
            .map(s => s.trim()).filter(s => s.length > 0);
        const pages = [];
        let page = [];
        let used = 0;
        const flush = () => { if (page.length) { pages.push(page.join(' ')); page = []; used = 0; } };
        for (const sentence of sentences) {
            const lines = _wrapWords(sentence, cols).split('\n');
            while (lines.length) {
                if (used >= rows) { flush(); continue; }
                const take = lines.splice(0, rows - used);
                page.push(take.join(' '));
                used += take.length;
                if (lines.length) flush();
            }
        }
        flush();
        return _healBrackets(pages);
    }

    Window_Message.prototype.numVisibleRows    = function () { return 4; };
    Window_Message.prototype.standardFontSize  = function () { return 29; };
    Window_ChoiceList.prototype.standardFontSize = function () { return 29; };

    // -------------------------------------------------------------------------
    // BustManagerNameWindow, thin adapter; reuses #html-msg-name from the message overlay
    // Name is positioned each frame by Window_Message.update, no slide, no transition.
    // -------------------------------------------------------------------------
    class BustManagerNameWindow {
        constructor() {
            this._characterName = '';
            this._visible       = false;
            // Which end of the message box the tag sits on. It is always the
            // end opposite the portrait, so the two never overlap: an NPC
            // stands on the right and is named on the left, a party member
            // stands on the left and is named on the right.
            this._side          = 'left';
        }

        setCharacterName(name) { this._characterName = name || ''; }

        setSide(side) { this._side = side === 'right' ? 'right' : 'left'; }

        showName() { if (this._characterName) this._visible = true; }

        hideName() {
            this._visible = false;
            const el = document.getElementById('html-msg-name');
            if (el) el.style.display = 'none';
        }

        update() { /* positioning handled entirely by Window_Message.update */ }

        get parent() { return document.body; }
    }

    // -------------------------------------------------------------------------
    // BustManager
    // -------------------------------------------------------------------------
    class BustManager {
        constructor() {
            this.characterBust       = null;
            this.nameWindow          = null;
            this.currentCharacterKey = null;
            this.batchDialogueMode   = false;
            this.nameIsVisible       = false;
            this.bustIsVisible       = false;
            this.activeEventId       = null;
            this.lastKnownEventId    = null;
            this.hideScheduled       = false;
            // Who is speaking decides which side of the screen the portrait
            // stands on: the party talks from the left, everybody else from
            // the right, the way a visual novel stages a conversation.
            this.bustSide            = 'right';
            // While true, this manager is being driven line by line by an
            // external exchange (see startNPCExchange below) instead of by the
            // interpreter's own event: startMessage must not re-derive the bust
            // from $gameMap._interpreter, and terminateMessage must hand control
            // to the exchange queue instead of the usual auto-hide check.
            this.exchangeMode        = false;
            // A story script puts its whole cast on stage before the first
            // line and leaves it there (see setStoryCast): the speakers stand
            // side by side, clear of the box, and whoever is not talking is
            // darkened rather than faded.
            this.storyMode           = false;
            this.storySlots          = [];
            // Whether the corner chart has been asked to stand aside for a
            // portrait standing in its corner (see syncMinimapCover).
            this._minimapCovered     = false;
        }

        initialize() {
            this.createBustSprites();
            this.nameWindow = new BustManagerNameWindow();
        }

        createBustSprites() {
            this.characterBust           = new Sprite();
            this.characterBust.opacity   = 0;
            this.characterBust.anchor.x  = 0;
            this.characterBust.anchor.y  = 1;
            this.setupBustPosition(this.characterBust);
            this.updateBustHiddenPosition();
            this.characterBust.x = this.characterBust._hiddenX;

        }

        // A story scene is staged as a cast, not as one portrait at a time: the
        // people the scene is between stand side by side for the whole of it,
        // and the name tag stays on the left with them.
        setStoryMode(on) {
            const wanted = !!on;
            if (wanted === this.storyMode) return;
            this.storyMode = wanted;
            if (!wanted) this.clearStoryCast();
            // The one-slot portrait has no part in a story scene: the cast
            // replaces it outright rather than standing behind it.
            if (wanted && this.characterBust) {
                if (this.characterBust.parent) this.characterBust.parent.removeChild(this.characterBust);
                this.characterBust.opacity      = 0;
                this.characterBust._slideType   = null;
                this.characterBust._slideDuration = 0;
                this.currentCharacterKey        = null;
            }
            if (wanted && this.nameWindow) this.nameWindow.setSide('left');
            this.refreshLayout(true);
        }

        // `cast` is the speakers of the scene in the order they first talk,
        // each { key, imageName }. Everybody is put up at once, before the
        // first line, so nobody appears out of nowhere halfway through.
        setStoryCast(cast) {
            this.clearStoryCast();
            if (!this.storyMode || !cast || !cast.length) return;
            const scene = SceneManager._scene;
            const seated = cast.slice(0, 2);
            // Which end of the stage each of them stands on. A cast that says
            // so is obeyed, which is what keeps a lone speaker on their own
            // side (an NPC passing on a rumour with nobody answering stands on
            // the right, where an NPC always stands, rather than sliding over
            // to the empty left end). A cast that says nothing, or one that
            // seats two people on the same side, falls back to the order they
            // speak in, since the two ends cannot both be the left one.
            const sides = seated.map((entry, i) =>
                (entry.side === 'left' || entry.side === 'right') ? entry.side : (i === 0 ? 'left' : 'right'));
            if (sides.length === 2 && sides[0] === sides[1]) { sides[0] = 'left'; sides[1] = 'right'; }
            this.storySlots = seated.map((entry, i) => {
                const sprite    = new Sprite();
                sprite.anchor.x = 0;
                sprite.anchor.y = 1;
                sprite.opacity  = bustOpacity;
                sprite.storyKey = entry.key;
                sprite.storySide = sides[i];
                const path      = this.resolveBustPath(entry.imageName);
                try {
                    const bitmap = ImageManager.loadBitmap('img/', path);
                    sprite.bitmap = bitmap;
                    bitmap.addLoadListener(() => this.layoutStoryCast());
                } catch (err) {
                    console.warn('Failed to load story bust:', path, err);
                    sprite.bitmap = this._loadFallback();
                }
                if (scene) addBustToScene(sprite, scene);
                return sprite;
            });
            this.layoutStoryCast();
            // Parked off their own edges, invisible, until every one of them can
            // be drawn: a cast that walked in while still decoding walked in as
            // nothing at all and appeared, standing at its marks, when the last
            // load finished. A slide already spent cannot be replayed.
            (this.storySlots || []).forEach(sprite => {
                sprite.opacity = 0;
                if (sprite._hiddenX != null) sprite.x = sprite._hiddenX;
            });
            this._castPending = this.storySlots.slice();
            this.setStoryActive(null);
            this._updatePendingStoryCast();
        }

        // They walk in together, and only once all of them have pixels: one
        // portrait still decoding would otherwise cost the whole stage its
        // entrance. Polled from update(), like the single portrait's own load.
        _updatePendingStoryCast() {
            const pending = this._castPending;
            if (!pending) return;
            const slots = this.storySlots || [];
            // The scene moved on while they were loading (a new cast, or the
            // end of the scene): whatever is on stage now owns it.
            if (!pending.length || !pending.every(sprite => slots.includes(sprite))) {
                this._castPending = null;
                return;
            }
            if (pending.some(sprite => !this._bitmapReady(sprite.bitmap)
                && !this._bitmapFailed(sprite.bitmap) && sprite.bitmap)) return;

            // One of them has no portrait to show: it stands in the fallback and
            // waits on that the same way, once.
            let swapped = false;
            for (const sprite of pending) {
                if (sprite.bitmap && !this._bitmapFailed(sprite.bitmap)) continue;
                if (sprite._bustFallbackTried) continue;
                sprite._bustFallbackTried = true;
                sprite.bitmap = this._loadFallback();
                swapped = true;
            }
            if (swapped) return;

            this._castPending = null;
            this.layoutStoryCast();
            this.slideStoryCastIn();
        }

        // The cast is not simply switched on: each of them walks in from their
        // own edge of the screen, the left one rightwards and the right one
        // leftwards, under the same fade a single portrait gets.
        slideStoryCastIn() {
            (this.storySlots || []).forEach(sprite => {
                sprite.x              = sprite._hiddenX;
                sprite.opacity        = 0;
                sprite._slideType     = 'in';
                sprite._slideTarget   = sprite._targetX;
                sprite._slideDuration = fadeInDuration;
            });
        }

        // Leaving the stage is the same walk backwards, so the sprite is kept
        // alive until it is off screen and only then taken out of the scene.
        slideStoryCastOut() {
            const leaving = (this.storySlots || []).filter(s => s.parent);
            leaving.forEach(sprite => {
                sprite._slideType     = 'out';
                sprite._slideTarget   = sprite._hiddenX;
                sprite._slideDuration = fadeOutDuration;
            });
            this._retiringSlots = (this._retiringSlots || []).concat(leaving);
            this.storySlots = [];
        }

        // Advances one sprite's slide. A method rather than a closure built
        // inside updateStorySlots: that ran every frame and allocated this
        // function again each time, for a stage that is empty on almost all of
        // them.
        _walkStorySlot(sprite) {
            if (sprite._slideDuration > 0) {
                sprite.x += (sprite._slideTarget - sprite.x) / sprite._slideDuration;
                sprite._slideDuration -= 1;
                if (sprite._slideType === 'in') {
                    sprite.opacity = bustOpacity * (1 - sprite._slideDuration / fadeInDuration);
                } else {
                    sprite.opacity = bustOpacity * (sprite._slideDuration / fadeOutDuration);
                }
                return true;
            }
            return false;
        }

        updateStorySlots() {
            const slots = this.storySlots;
            const retiring = this._retiringSlots;
            // Nobody on stage and nobody walking off it: there is nothing here
            // to advance, and this is the state on almost every frame.
            if ((!slots || !slots.length) && (!retiring || !retiring.length)) return;

            if (slots) {
                for (let i = 0; i < slots.length; i++) this._walkStorySlot(slots[i]);
            }
            if (!retiring || !retiring.length) return;
            this._retiringSlots = retiring.filter(sprite => {
                if (this._walkStorySlot(sprite)) return true;
                if (sprite.parent) sprite.parent.removeChild(sprite);
                sprite.opacity = 0;
                return false;
            });
        }

        clearStoryCast() {
            this.slideStoryCastOut();
        }

        // The cast stands beside the box, not over it: one portrait against the
        // left edge of the screen and one against the right, staged exactly as
        // a single speaker is (bustFloor / getBustHeight above), so a story
        // scene and an ordinary conversation draw the same portrait in the same
        // place. Only the middle of the screen is out of bounds, so the two of
        // them never run into each other.
        storyLayout() {
            const height = getBustHeight();
            const width  = Math.round(height * bustAspect);
            return {
                width,
                height,
                x: i => (i === 0 ? bustEdgeMargin : Graphics.width - bustEdgeMargin - width),
                // The edge each slot walks in from and retires to: the left one
                // off the left of the screen, the right one off the right.
                hiddenX: i => (i === 0 ? -width : Graphics.width + width),
                y: bustFloor(),
            };
        }

        layoutStoryCast() {
            const slots = this.storySlots || [];
            if (!slots.length) return;
            const layout = this.storyLayout();
            slots.forEach((sprite, i) => {
                // The place is the side they stand on, not their turn order.
                const end = sprite.storySide === 'right' ? 1 : sprite.storySide === 'left' ? 0 : i;
                this.scaleBustToFit(sprite, layout.width, layout.height);
                sprite._targetX = layout.x(end);
                sprite._hiddenX = layout.hiddenX(end);
                sprite.y        = layout.y;
                if (sprite._slideDuration > 0) {
                    sprite._slideTarget = sprite._slideType === 'out'
                        ? sprite._hiddenX : sprite._targetX;
                } else {
                    sprite.x = sprite._slideType === 'out' ? sprite._hiddenX : sprite._targetX;
                }
            });
        }

        // Who is talking is the one in the light; everybody else on stage is
        // darkened, at full opacity, and drawn behind them.
        setStoryActive(key) {
            const slots = this.storySlots || [];
            // The name tag belongs to the portrait under the light, so it
            // crosses the box with the turn instead of sitting on one end of
            // the stage while the other end talks.
            if (this.nameWindow && key) {
                const idx = slots.findIndex(s => s.storyKey === key);
                if (idx >= 0) {
                    const side = slots[idx].storySide;
                    this.nameWindow.setSide(side || (idx === 0 ? 'left' : 'right'));
                }
            }
            slots.forEach(sprite => {
                const lit = !!key && sprite.storyKey === key;
                if (sprite.setColorTone) sprite.setColorTone(lit ? storyLitTone : storyDimTone);
                // A portrait still walking in keeps its fade, and one still
                // waiting on its pixels keeps its edge; only one already
                // standing there is held at full opacity.
                if (!(sprite._slideDuration > 0) && !this._castPending) sprite.opacity = bustOpacity;
                if (lit && sprite.parent && sprite.parent.addChild) sprite.parent.addChild(sprite);
            });
        }

        updateBustHiddenPosition() {
            const width = getBustWidth();
            const left  = this.bustSide === 'left';
            // A portrait slides off the edge it stands on, so a party member
            // enters from the left and an NPC from the right.
            this.characterBust._hiddenX = left ? -width : Graphics.width + width;
            if (window.$gameSplitScreen && window.$gameSplitScreen.active) {
                this.characterBust._targetX = (Graphics.width - width) / 2;
            } else {
                // Flush with the screen edge on its own side, no margin.
                this.characterBust._targetX = left
                    ? bustEdgeMargin : Graphics.width - bustEdgeMargin - width;
            }
        }

        // The portrait side, and with it the name tag's opposite side. Called
        // before any target is computed, since both hidden and target x depend
        // on it.
        setBustSide(side) {
            const wanted  = side === 'left' ? 'left' : 'right';
            const changed = wanted !== this.bustSide;
            this.bustSide = wanted;
            if (this.nameWindow) this.nameWindow.setSide(this.storyMode ? 'left' : (wanted === 'left' ? 'right' : 'left'));
            this.updateBustHiddenPosition();
            // Changing ends is not a walk across the screen: the portrait is
            // parked off the new edge and slides in from there, under the same
            // fade the first line of a conversation gets.
            if (changed) this.characterBust.x = this.characterBust._hiddenX;
            return changed;
        }

        // A speaker who is one of the party talks from the left. The name is
        // the only thing every front end (exchanges, the TV studio, the VN
        // plugin commands) reliably passes, so that is what is matched.
        sideForSpeaker(displayName) {
            const name = String(displayName || '').split(',')[0].trim();
            if (!name) return 'right';
            try {
                const members = ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [];
                if (members.some(a => a && a.name && a.name().trim() === name)) return 'left';
            } catch (err) { /* no party yet */ }
            return 'right';
        }

        // The floor the portrait stands on: the bottom edge of the screen, the
        // same one the story cast stands on, whatever the box below is doing.
        getBustY() { return bustFloor(); }

        setupBustPosition(sprite) { sprite.y = this.getBustY(); }

        // The portrait is measured against the screen alone, so the fit is redone
        // when the screen changes (a resolution change, split screen coming and
        // going) or when it changes ends, and never otherwise.
        // Compared field by field rather than as one joined string. This is
        // asked on every frame the map is up, and the four things it watches
        // (the screen size, which side the portrait stands on, story mode and
        // split screen) change a handful of times in a session, so building a
        // string to throw away was the whole cost of the check.
        refreshLayout(force) {
            const w = Graphics.width;
            const h = Graphics.height;
            const side = this.bustSide;
            const story = !!this.storyMode;
            const split = !!(window.$gameSplitScreen && window.$gameSplitScreen.active);
            if (!force && w === this._layoutW && h === this._layoutH &&
                side === this._layoutSide && story === this._layoutStory &&
                split === this._layoutSplit) return;
            this._layoutW = w;
            this._layoutH = h;
            this._layoutSide = side;
            this._layoutStory = story;
            this._layoutSplit = split;
            const s = this.characterBust;
            if (!s) return;
            this.updateBustHiddenPosition();
            s.y = this.getBustY();
            if (s.bitmap) this.scaleBustToFit(s);
            if (s._slideDuration > 0) {
                s._slideTarget = s._slideType === 'out' ? s._hiddenX : s._targetX;
            } else if (this.bustIsVisible) {
                s.x = s._targetX;
            }
            this.layoutStoryCast();
        }

        scaleBustToFit(sprite, width, height) {
            if (!sprite.bitmap || !sprite.bitmap.width || !sprite.bitmap.height) {
                if (sprite.bitmap) sprite.bitmap.addLoadListener(() => this.scaleBustToFit(sprite, width, height));
                return;
            }
            const w = width  || getBustWidth();
            const h = height || getBustHeight();
            const scale = Math.min(w / sprite.bitmap.width, h / sprite.bitmap.height);
            sprite.scale.x = scale;
            sprite.scale.y = scale;
        }

        _loadFallback() {
            try { return ImageManager.loadBitmap('img/busts/', '7'); } catch (e) { return null; }
        }

        // A bitmap that cannot answer whether it is ready (a stub, an odd
        // loader) counts as ready rather than holding the stage forever.
        _bitmapReady(bitmap) {
            if (!bitmap) return false;
            if (typeof bitmap.isReady === 'function') return bitmap.isReady();
            return bitmap.width > 0 && bitmap.height > 0;
        }

        _bitmapFailed(bitmap) {
            return !!bitmap && typeof bitmap.isError === 'function' && bitmap.isError();
        }

        // A portrait that is not in ImageManager's cache yet needs a few frames
        // to decode, and the walk-in used to start the moment the load was
        // ASKED for: the slide played out on an empty sprite and the bust
        // appeared already parked at its mark when the bitmap finally landed.
        // Only a cached portrait, which is every show after the first, ever
        // slid. So the walk waits for the pixels. Polled from update() rather
        // than hung off addLoadListener, which never fires for a bitmap that
        // failed to load.
        _beginBustLoad(bitmap, key, fallback, path) {
            this._pendingBust = { bitmap, key, fallback: fallback || null, path };
            // Off its own edge and invisible until then, so a portrait waiting
            // on its pixels is not a blank sprite standing in the slot.
            this.characterBust.opacity = 0;
            this.characterBust.x       = this.characterBust._hiddenX;
            this._updatePendingBust();
        }

        _updatePendingBust() {
            const pending = this._pendingBust;
            if (!pending) return;
            const { bitmap, key, fallback, path } = pending;
            if (!this._bitmapReady(bitmap) && !this._bitmapFailed(bitmap)) return;

            // Another line asked for a different portrait while this one was
            // decoding: that load owns the sprite now.
            if (this.currentCharacterKey !== key) { this._pendingBust = null; return; }

            if (this._bitmapReady(bitmap) && bitmap.width > 0 && bitmap.height > 0) {
                this._pendingBust = null;
                this._applyBitmap(bitmap, fallback, path);
            } else if (fallback) {
                // Wait on the fallback exactly the same way rather than walking
                // a sprite that still has nothing to draw.
                this._pendingBust = { bitmap: fallback, key, fallback: null, path };
                this._updatePendingBust();
                return;
            } else {
                console.error("Bust image and fallback both unavailable:", path);
                this._pendingBust = null;
                this.bustIsVisible = false;
                return;
            }
            this.slideIn();
        }

        _applyBitmap(bitmap, fallback, path) {
            if (bitmap.width > 0 && bitmap.height > 0) {
                this.characterBust.bitmap = bitmap;
            } else if (fallback) {
                this.characterBust.bitmap = fallback;
                console.warn("Bust image failed, using fallback:", path);
            } else {
                console.error("Bust image and fallback both unavailable:", path);
            }
            this.scaleBustToFit(this.characterBust);
        }

        getBustImageForCharacter(characterName, characterIndex) {
            if (!characterName) return null;
            if (characterName.startsWith("$") || characterName.startsWith("!") || characterName.startsWith("Objects")) {
                return "busts/7";
            }
            const spritesheetName = characterName.split('.')[0];

            try {
                const commentBust = window.BustPath.resolve(this.getBustNameFromEventComment());
                if (commentBust) return `busts/${commentBust}`;
            } catch (err) {
                console.warn("Error checking event comment for bust name:", err);
            }

            // A pre-made character's own portrait, before anything derived from
            // the walk sheet: a dossier can be played in an alternate look and
            // each look has its own bust, so only the dossier itself (or the
            // party member taken from it) knows which face belongs here.
            const presetBust = this.getPresetBustForSprite(spritesheetName, characterIndex);
            if (presetBust) return `busts/${presetBust}`;

            if (window.NPCSim?.getBustForNPC) {
                try {
                    const evId    = $gameMap?._interpreter?._eventId;
                    const npcName = evId ? _npcNameForEvent($gameMap.event(evId)) : null;
                    if (npcName) {
                        const b = window.BustPath.resolve(window.NPCSim.getBustForNPC(npcName));
                        if (b) return `busts/${b}`;
                    }
                } catch (_) {}
            }

            if (SpritesAssociation[spritesheetName]?.[characterIndex]) {
                const b = window.BustPath.resolve(SpritesAssociation[spritesheetName][characterIndex]);
                if (b) return `busts/${b}`;
            }

            return `busts/7`;
        }

        // The bust of a pre-made character standing on this sprite sheet, or
        // null when the sheet belongs to nobody in particular. A party member
        // wearing the sheet answers first (their own bust follows them however
        // they have been dressed since), then the dossiers and their alternate
        // looks. Mirrors VisualNovelBustSystem's method of the same name, which
        // is where the two bust front ends have to agree.
        getPresetBustForSprite(spritesheetName, characterIndex) {
            if (!spritesheetName) return null;
            const idx = characterIndex || 0;
            try {
                const members = ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [];
                for (const actor of members) {
                    if (!actor || actor.characterName() !== spritesheetName) continue;
                    if ((actor.characterIndex() || 0) !== idx) continue;
                    const bust = window.BustPath.resolve(actor.vnBust ? actor.vnBust() : null);
                    if (bust) return bust;
                }
            } catch (err) { /* no party yet */ }

            const CP = window.CharacterPresets;
            if (!CP || !CP.getCharacterPresets) return null;
            try {
                for (const preset of CP.getCharacterPresets()) {
                    const looks = CP.getPresetSkins ? CP.getPresetSkins(preset) : [preset];
                    for (const look of looks) {
                        if (!look || look.sprite !== spritesheetName) continue;
                        if ((look.spriteIndex || 0) !== idx) continue;
                        if (look.busts) return look.busts;
                    }
                }
            } catch (err) { /* dossiers not loaded */ }
            return null;
        }

        getBustNameFromEventComment() {
            const interpreter = $gameMap._interpreter;
            if (!interpreter || !interpreter._eventId) return null;
            const gameEvent = $gameMap.event(interpreter._eventId);
            if (!gameEvent) return null;
            // A `bust: <name>` line names the portrait outright, and is read
            // through the same service the Empathize panel reads it with, so
            // the message box and the panel can never show two faces.
            const written = window.NPCInitSpec?.bustFor?.(null, gameEvent);
            if (written) return written;
            const eventData = gameEvent.event();
            if (!eventData?.pages) return null;
            const page = eventData.pages.find(p => gameEvent.meetsConditions(p));
            if (!page?.list) return null;
            for (const cmd of page.list) {
                if (cmd.code === 108 || cmd.code === 408) {
                    const comment = cmd.parameters[0];
                    if (comment && typeof comment === 'string') {
                        const trimmed = comment.trim();
                        if (trimmed && !trimmed.includes(' ')) return trimmed;
                    }
                }
            }
            return null;
        }

        getCharacterDisplayName(eventId) {
            if (eventId) {
                const gameEvent = $gameMap.event(eventId);
                const evName = _npcNameForEvent(gameEvent);
                if (evName) {
                    return evName;
                }
            }
            const charInfo = this.getCurrentEventCharacterInfo();
            if (charInfo?.characterName) {
                const displayName = this.convertCamelCaseToReadable(charInfo.characterName.split('.')[0]);
                return displayName;
            }
            return "";
        }

        convertCamelCaseToReadable(text) {
            if (!text || typeof text !== 'string') return '';
            let r = text.replace(/_/g, ' ');
            r = r.replace(/([a-z])([A-Z])/g, '$1 $2');
            r = r.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
            return r.split(' ').map(w => w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }

        getCurrentEventCharacterInfo() {
            const interpreter = $gameMap._interpreter;
            if (!interpreter || !interpreter._eventId) return null;
            const gameEvent = $gameMap.event(interpreter._eventId);
            if (!gameEvent) return null;
            const page = gameEvent.event().pages.find(p => gameEvent.meetsConditions(p));
            if (!page?.image?.characterName) return null;
            return { characterName: page.image.characterName, characterIndex: page.image.characterIndex, eventId: interpreter._eventId };
        }

        shouldShowBustAndName() {
            const interpreter = $gameMap._interpreter;
            if (!interpreter || !interpreter._eventId) return false;
            const gameEvent = $gameMap.event(interpreter._eventId);
            if (!gameEvent) return false;
            const eventName = gameEvent.event().name;
            if (eventName && (eventName.startsWith("EV") || eventName.startsWith("Treasure") || eventName.startsWith("Random"))) return false;
            const page = gameEvent.event().pages.find(p => gameEvent.meetsConditions(p));
            if (!page?.image) return false;
            const cn = page.image.characterName;
            if (!cn || cn === "" || cn === "none") return false;
            if (cn.toLowerCase().includes("objects/") || cn.toLowerCase().startsWith("objects")) return false;
            return true;
        }

        checkImageExists(path) {
            if (Utils.isNwjs()) {
                try {
                    const fs       = require('fs');
                    const nodePath = require('path');
                    return fs.existsSync(nodePath.join(process.cwd(), 'img', path + '.png'));
                } catch (e) { return false; }
            }
            return true;
        }

        resolveBustPath(imageName) {
            const resolvedName = window.BustPath.resolve(imageName);
            const path = resolvedName ? `busts/${resolvedName}` : `busts/7`;
            return this.checkImageExists(path) ? path : `busts/7`;
        }

        showCustomBust(imageName, characterName, side) {
            if (!imageName) return;
            const path         = this.resolveBustPath(imageName);
            const key          = `custom_${imageName}`;
            const fallback     = this._loadFallback();

            if (this.nameWindow) {
                let displayName = characterName || this.convertCamelCaseToReadable(imageName);
                this.nameWindow.setCharacterName(displayName);
                this.nameWindow.showName();
                this.nameIsVisible = true;
            }

            // In a story scene the whole cast is already standing there: the
            // line only moves the light from one of them to the other.
            if (this.storyMode && (this.storySlots || []).length) {
                this.setStoryActive(key);
                this.currentCharacterKey = key;
                this.bustIsVisible       = true;
                this.activeEventId       = 'custom';
                this.hideScheduled       = false;
                return;
            }

            const sideChanged = this.setBustSide(side || this.sideForSpeaker(characterName));

            // Same portrait as last line, but now speaking from the other end
            // of the screen: it has to cross over instead of standing still.
            if (this.currentCharacterKey === key && this.characterBust.parent) {
                if (sideChanged) this.slideIn();
                return;
            }

            // The key is claimed before the load is asked for: it is what the
            // poll below checks its own portrait against.
            this.currentCharacterKey = key;
            const scene = SceneManager._scene;
            if (!this.characterBust.parent && scene) addBustToScene(this.characterBust, scene);

            try {
                this._beginBustLoad(ImageManager.loadBitmap('img/', path), key, fallback, path);
            } catch (err) {
                console.warn("Failed to load custom bust:", path, err);
                if (fallback) this._beginBustLoad(fallback, key, null, path);
            }
            this.bustIsVisible = true;
            this.activeEventId = 'custom';
            this.hideScheduled = false;
        }

        showBusts() {
            const charInfo   = this.getCurrentEventCharacterInfo();
            const shouldShow = this.shouldShowBustAndName();
            if (!shouldShow || !charInfo) { this.bustIsVisible = false; return; }

            const { characterName, characterIndex, eventId } = charInfo;
            const key      = `${characterName}_${characterIndex}`;
            const fallback = this._loadFallback();

            this.activeEventId    = eventId;
            this.lastKnownEventId = eventId;
            this.hideScheduled    = false;

            // An event on the map is somebody the party is facing: it keeps the
            // right-hand slot, whatever the party leader does next.
            const sideChanged = this.setBustSide(this.sideForSpeaker(this.getCharacterDisplayName(eventId)));

            let targetX;
            if (window.$gameSplitScreen && window.$gameSplitScreen.active) {
                const activator = $gameMessage._eventActivator;
                const w         = getBustWidth();
                if      (activator === "p1") targetX = 0;
                else if (activator === "p2") targetX = Graphics.width - w;
                else                          targetX = (Graphics.width - w) / 2;
            } else {
                targetX = this.characterBust._targetX; // set by setBustSide above
            }

            const targetChanged = targetX !== this.characterBust._targetX;
            this.characterBust._targetX = targetX;

            if (this.currentCharacterKey === key && this.characterBust.parent) {
                if (targetChanged || sideChanged) this.slideIn();
                if (this.nameWindow && !this.nameIsVisible) { this.nameWindow.showName(); this.nameIsVisible = true; }
                this.bustIsVisible = true;
                return;
            }

            let path = this.getBustImageForCharacter(characterName, characterIndex);
            if (!path) return;
            if (!this.checkImageExists(path)) { console.warn(`Bust not found: ${path}, using fallback`); path = `busts/7`; }

            this.currentCharacterKey = key;
            const scene = SceneManager._scene;
            if (!this.characterBust.parent && scene) addBustToScene(this.characterBust, scene);

            if (this.nameWindow) {
                this.nameWindow.setCharacterName(this.getCharacterDisplayName(eventId));
                this.nameWindow.showName();
                this.nameIsVisible = true;
            }

            try {
                this._beginBustLoad(ImageManager.loadBitmap('img/', path), key, fallback, path);
            } catch (err) {
                console.warn("Failed to load bust:", path, err);
                if (fallback) this._beginBustLoad(fallback, key, null, path);
            }
            this.bustIsVisible = true;
        }

        hideBusts() {
            if (this.characterBust.parent) this.slideOut();
            this.clearStoryCast();
            if (this.nameWindow) { this.nameWindow.hideName(); this.nameIsVisible = false; }
            this.currentCharacterKey = null;
            this.batchDialogueMode   = false;
            this.bustIsVisible       = false;
            this.activeEventId       = null;
            this.hideScheduled       = false;
            this.syncMinimapCover();
        }

        // Is the party standing at the left end of the stage? In a two-sided
        // conversation they always are, and that end of the screen is the same
        // bottom-left corner the chart is drawn in.
        leftBustShowing() {
            if (this.storyMode && (this.storySlots || []).length) {
                return this.storySlots.some(slot => slot && slot.storySide === 'left');
            }
            return !!this.bustIsVisible && this.bustSide === 'left';
        }

        // The corner chart gives way to that portrait rather than being drawn
        // through it, and comes back the moment the conversation ends. Asked
        // every frame, but the chart is only told when the answer changes.
        syncMinimapCover() {
            const want = this.leftBustShowing();
            if (want === this._minimapCovered) return;
            this._minimapCovered = want;
            try { window.WorldMapView?.setConversationCover?.(want); }
            catch (err) { /* no chart on this scene */ }
        }

        enableBatchDialogue() { this.batchDialogueMode = true; this.showBusts(); }

        isStillInActiveEvent() {
            const interp = $gameMap._interpreter;
            return interp ? interp._eventId === this.activeEventId : false;
        }

        hasEventEnded() {
            const interp = $gameMap._interpreter;
            if (!interp) return true;
            if (!interp.isRunning()) return true;
            if (interp._eventId !== this.activeEventId && this.activeEventId !== null) return true;
            return false;
        }

        shouldAutoHide() {
            if (this.batchDialogueMode) return false;
            if (this.isStillInActiveEvent()) return false;
            return this.hasEventEnded();
        }

        isMessageWindowClosed() {
            const scene = SceneManager._scene;
            if (!scene || !scene._messageWindow) return true;
            return !scene._messageWindow.isOpen() && !scene._messageWindow.isOpening();
        }

        onResolutionChange() {
            this.refreshLayout(true);
        }

        slideIn() {
            const s = this.characterBust;
            // The walk is declared BEFORE the layout is refreshed: a refresh
            // with nothing sliding parks a visible portrait on its mark, which
            // left this walk to play out from the finish line.
            s._slideType     = 'in';
            s._slideDuration = fadeInDuration;
            this.refreshLayout(true);
            // Nothing drawn means nothing to walk from, so it starts off its
            // own edge instead of fading in place: a resolution change or an
            // interrupted walk-out can leave the sprite anywhere.
            if (s.opacity <= 0) s.x = s._hiddenX;
            s._slideTarget = s._targetX;
        }

        slideOut() {
            this.characterBust._slideTarget  = this.characterBust._hiddenX;
            this.characterBust._slideDuration = fadeOutDuration;
            this.characterBust._slideType     = 'out';
        }

        update() {
            this.refreshLayout(false);
            this._updatePendingBust();
            this._updatePendingStoryCast();
            this.updateStorySlots();
            const s = this.characterBust;
            if (s._slideDuration > 0) {
                s.x += (s._slideTarget - s.x) / s._slideDuration;
                s._slideDuration -= 1;
                if      (s._slideType === 'in')  s.opacity = bustOpacity * (1 - s._slideDuration / fadeInDuration);
                else if (s._slideType === 'out') s.opacity = bustOpacity * (s._slideDuration / fadeOutDuration);
            } else if (s._slideType === 'out' && s.parent) {
                s.parent.removeChild(s);
                s.opacity = 0;
                this.bustIsVisible = false;
            }

            if (this.bustIsVisible && !this.batchDialogueMode) {
                const closed = this.isMessageWindowClosed();
                const ended  = this.hasEventEnded();
                if (closed && ended && !this.hideScheduled) { this.hideScheduled = true; this.hideBusts(); }
                if (!closed && this.isStillInActiveEvent())   this.hideScheduled = false;
            }
            this.syncMinimapCover();
        }
    }

    // -------------------------------------------------------------------------
    // Scene_Map hooks
    // -------------------------------------------------------------------------
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);
        this._bustManager = new BustManager();
        this._bustManager.initialize();
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        if (this._bustManager) this._bustManager.update();
    };

    // -------------------------------------------------------------------------
    // Scene_Battle hooks
    // -------------------------------------------------------------------------
    // No portrait ever stands in a fight. A battle is read off the field and
    // off the command list, and a bust sliding in over either of them hides the
    // one thing the player is looking at, so Scene_Battle is given no manager
    // at all: whoever talks mid-fight (Eris, an enemy, the combat tutorial)
    // speaks out of a plain box with their name inline.
    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function () {
        this._bustManager = null;
        _Scene_Battle_terminate.call(this);
    };

    const _Graphics_resize = Graphics.resize;
    Graphics.resize = function (width, height) {
        _Graphics_resize.call(this, width, height);
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) scene._bustManager.onResolutionChange();
    };

    // -------------------------------------------------------------------------
    // Message window width: always 800px, centered
    // -------------------------------------------------------------------------
    const MESSAGE_WINDOW_WIDTH = 640;
    function overrideMessageWindowRect(SceneClass) {
        const _orig = SceneClass.prototype.messageWindowRect;
        if (!_orig) return;
        SceneClass.prototype.messageWindowRect = function () {
            const rect = _orig.call(this);
            rect.width = MESSAGE_WINDOW_WIDTH;
            rect.x     = Math.floor((Graphics.boxWidth - MESSAGE_WINDOW_WIDTH) / 2);
            return rect;
        };
    }
    overrideMessageWindowRect(Scene_Map);
    overrideMessageWindowRect(Scene_Battle);

    // -------------------------------------------------------------------------
    // HTML Message Window
    // -------------------------------------------------------------------------
    function _msgGetScale() {
        const el = document.getElementById('gameCanvas');
        if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
        const r = el.getBoundingClientRect();
        return { sx: r.width / Graphics.width, sy: r.height / Graphics.height, ox: r.left, oy: r.top };
    }

    function _stripMsgEscapes(text) {
        return (text || '')
            .replace(/\x1b[A-Z]+\[\d*\]/gi, '')
            .replace(/\x1b[{}!><.$|^\\]/gi, '')
            .replace(/\x1b./gi, '');
    }

    // Strip the *full* current message text, memoized on the window so the three
    // regex passes run once per message rather than every frame it's open.
    function _stripFull(win) {
        const t = win._textState ? win._textState.text : '';
        const c = win._htmlMsgFullCache;
        if (c && c.text === t) return c.out;
        const out = _stripMsgEscapes(t);
        win._htmlMsgFullCache = { text: t, out };
        return out;
    }

    // The line itself is plain white; a marked run is written in gold, so a
    // topic the party can ask about and a name a rumour drops in read off the
    // box at a glance (see the marks under "Proper nouns in a spoken line").
    // The text is revealed one character at a time, so a mark that has not been
    // closed yet colours the tail of the line and closes itself.
    function _msgEscapeHtml(t) {
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Typing must never move a word that is already on screen. The box wraps
    // itself (white-space: pre-wrap), so revealing the line one character at a
    // time by growing the element's text makes the browser re-wrap on every
    // frame and the last word of a row jumps down the moment it no longer fits.
    // The whole line is written out from the first frame instead, and the part
    // not yet typed is only made invisible: the wrap is computed once, off the
    // finished line, and nothing ever moves while it is read out.
    function _msgRenderReveal(el, text, shownLen) {
        if (!el) return;
        const marked = new RegExp('(' + NAME_OPEN + '[^' + NAME_CLOSE + ']*' + NAME_CLOSE + '?)');
        const parts = String(text).split(marked).filter(part => part !== undefined && part !== '');
        let at   = 0; // offset into the marked text, which is what shownLen counts
        let html = '';
        for (const part of parts) {
            const isKey = part.charAt(0) === NAME_OPEN;
            const start = at;
            at += part.length;
            const body  = isKey ? stripNameMarks(part) : part;
            const open  = isKey ? '<span class="msg-keyword">' : '';
            const close = isKey ? '</span>' : '';
            if (shownLen >= at) {
                html += open + _msgEscapeHtml(body) + close;
            } else if (shownLen <= start) {
                html += open + '<span class="msg-unrevealed">' + _msgEscapeHtml(body) + '</span>' + close;
            } else {
                // The reveal falls inside this part; a keyword's own opening mark
                // is one character of the marked text that is never drawn.
                const cut = isKey
                    ? Math.max(0, Math.min(body.length, shownLen - start - 1))
                    : shownLen - start;
                // The cut almost always lands inside a word, and the word is
                // then two elements rather than one. The word it falls in is
                // held together so no engine can decide to wrap between the
                // half being typed and the half still waiting.
                const wordStart = body.lastIndexOf(' ', cut - 1) + 1;
                let wordEnd = body.indexOf(' ', cut);
                if (wordEnd < 0) wordEnd = body.length;
                html += open + _msgEscapeHtml(body.slice(0, wordStart))
                     + '<span class="msg-split">'
                     + _msgEscapeHtml(body.slice(wordStart, cut))
                     + '<span class="msg-unrevealed">' + _msgEscapeHtml(body.slice(cut, wordEnd)) + '</span>'
                     + '</span>'
                     + '<span class="msg-unrevealed">' + _msgEscapeHtml(body.slice(wordEnd)) + '</span>'
                     + close;
            }
        }
        el.innerHTML = html;
    }

    function _msgSetText(el, text) {
        _msgRenderReveal(el, text, Infinity);
    }

    // The reveal is the one thing about the box a test can hold on to without a
    // browser: it is asked to draw the same line at every length and the whole
    // line has to come out of it every time.
    window.DialogueTextBox = { render: _msgRenderReveal, wrap: autoWrapText, paginate: paginateMessage };

    // -------------------------------------------------------------------------
    // Letter voices: the line is chattered as it is typed
    // -------------------------------------------------------------------------
    // Every letter the typewriter reveals plays a short vowel or consonant blip
    // out of audio/se/Vowels and audio/se/Consonants, the way a village of
    // animals talks. The speaker's own pitch is the `pitch` field of their sheet
    // in js/db/WorldGen/NPCs.json, so the same NPC always sounds like themselves;
    // a sheet nobody catalogued falls back to a pitch hashed off the name, which
    // is just as stable. A gold run (a [Keyword] or a marked name) is spoken a
    // third higher, so a topic is heard as well as seen. Off unless the player
    // turns "Dialogue Voices" on in the Audio options.
    const VOICE_TIERS   = [{ tag: 'Low', nominal: 85 }, { tag: 'Mid', nominal: 110 }, { tag: 'High', nominal: 140 }];
    const VOICE_VOWELS  = 'AEIOU';
    const VOICE_KEY_MUL = 1.3;   // the gold third
    const VOICE_STEP    = 2;     // one blip every other letter
    const VOICE_GAP_MS  = 45;    // and never two inside this window
    const VOICE_DEFAULT_PITCH = 100;
    const VOICE_DEFAULT_VOLUME = 60;  // the Audio option's own default

    // The chatter has its own slider in the Audio options, kept off seVolume.
    function _voiceVolume() {
        const v = typeof ConfigManager !== 'undefined' ? Number(ConfigManager.dialogueVoicesVolume) : NaN;
        return isFinite(v) ? Math.max(0, Math.min(100, v)) : VOICE_DEFAULT_VOLUME;
    }

    function _voiceEnabled() {
        return typeof ConfigManager !== 'undefined' && !!ConfigManager.dialogueVoices;
    }

    function _voiceHash(text) {
        let h = 0;
        const s = String(text || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
    }

    // The sheet the line is spoken off, when a map event is talking.
    function _voiceSpeakerSheet() {
        try {
            const scene = SceneManager._scene;
            const bm    = scene && scene._bustManager;
            const info  = bm && bm.getCurrentEventCharacterInfo ? bm.getCurrentEventCharacterInfo() : null;
            return info && info.characterName ? String(info.characterName).split('.')[0] : '';
        } catch (err) { return ''; }
    }

    // A box with nobody behind it, a signpost, a notice, a plaque, still has to
    // be heard. It is voiced off the name of the event that opened it, so the
    // same sign always reads back in the same voice and two different signs do
    // not sound like the same person.
    function _voiceEventKey() {
        try {
            const interp = $gameMap && $gameMap._interpreter;
            if (!interp || !interp._eventId) return '';
            const ev = $gameMap.event(interp._eventId);
            const name = ev && ev.event() ? ev.event().name : '';
            return name ? String(name) : '';
        } catch (err) { return ''; }
    }

    // Is anybody actually on stage? The chatter is the voice of whoever is
    // drawn beside the box, so a line with no portrait next to it is read
    // rather than spoken: a shop counter, a system notice, a chest, a sign, any
    // box raised outside a conversation stays silent.
    function _voiceIsStaged() {
        try {
            const bm = SceneManager._scene && SceneManager._scene._bustManager;
            if (!bm) return false;
            if (bm.storyMode && (bm.storySlots || []).length) return true;
            return !!bm.bustIsVisible;
        } catch (err) { return false; }
    }

    // Whose name is on the tag beside the box. In an exchange (a story scene,
    // an NPC talk) nothing is ever written into $gameMessage's speaker: the
    // name travels with the bust, so the tag is read first and the message's
    // own speaker only where there is no bust to read.
    function _voiceSpeakerName() {
        try {
            const bm = SceneManager._scene && SceneManager._scene._bustManager;
            const nm = bm && bm.nameWindow;
            const shown = nm && nm._characterName ? String(nm._characterName).trim() : '';
            if (shown) return shown;
        } catch (err) { /* no bust manager */ }
        try {
            if ($gameMessage && $gameMessage.speakerName) return $gameMessage.speakerName() || '';
        } catch (err) { /* no message */ }
        return '';
    }

    // The travelling cast speak in a story scene, where there is no map event
    // and so no sheet to read a pitch off: their voice is written here instead
    // of hashed off their name, so Bubba always answers low.
    // Bubba sits at the bottom of what the blips can carry: against the Low
    // tier's nominal 85 his 43 plays back at the SE pitch floor, which is the
    // deepest a letter voice goes.
    const VOICE_CAST_PITCH = { Bubba: 43, Em: 126 }; // i18n-ignore: actor names matched at runtime

    // The base pitch of whoever is speaking: the written cast first, the
    // catalogued sheet after that, hashed last.
    function _voicePitchFor(sheet, name) {
        const cast = VOICE_CAST_PITCH[String(name == null ? '' : name).trim()];
        if (isFinite(cast) && cast > 0) return cast;
        const entry = sheet && window.WorldGen && window.WorldGen.NPCs ? window.WorldGen.NPCs[sheet] : null;
        const own   = entry ? Number(entry.pitch) : NaN;
        if (isFinite(own) && own > 0) return own;
        const key = sheet || name;
        if (!key) return VOICE_DEFAULT_PITCH;
        return 78 + (_voiceHash(key) % 55); // 78..132, the range the sheets use
    }

    function _voiceTierFor(pitch) {
        if (pitch < 96)  return VOICE_TIERS[0];
        if (pitch < 122) return VOICE_TIERS[1];
        return VOICE_TIERS[2];
    }

    // One letter, one file. Anything that is not a letter (space, punctuation,
    // a digit) is silent, which is what gives the chatter its rhythm.
    function _voiceSeFor(letter, tier) {
        const c = letter.toUpperCase();
        if (!/^[A-Z]$/.test(c)) return null;
        return VOICE_VOWELS.indexOf(c) >= 0
            ? 'Vowels/Vowel_' + c + '_' + tier.tag
            : 'Consonants/Cons_' + c + '_' + tier.tag;
    }

    // A letter blip whose ogg is not in the build must never reach the engine's
    // load error box: Scene_Base.update asks AudioManager to rethrow any errored
    // buffer, so the voice buffers are swept out of that list first and the name
    // is remembered as missing so it is not requested again.
    const _voiceIsVoiceUrl = (url) => /\/(Vowels|Consonants)\//.test(String(url || ''));

    const _AudioManager_checkErrors = AudioManager.checkErrors;
    AudioManager.checkErrors = function() {
        try {
            const buffers = this._seBuffers || [];
            for (let i = buffers.length - 1; i >= 0; i--) {
                const b = buffers[i];
                if (!b || !b.isError() || !_voiceIsVoiceUrl(b.url)) continue;
                const m = /\/((?:Vowels|Consonants)\/[^/.]+)/.exec(String(b.url));
                if (m) DialogueVoice._missing[m[1]] = true;
                buffers.splice(i, 1);
            }
        } catch (err) { /* the sweep is never allowed to be the crash itself */ }
        if (typeof _AudioManager_checkErrors === 'function') _AudioManager_checkErrors.call(this);
    };

    const DialogueVoice = {
        // SE names whose file could not be loaded or played: asked for once,
        // then left alone for the rest of the session.
        _missing: Object.create(null),
        _last: 0,
        _count: 0,
        _sheet: '',
        _name: '',
        _pitch: VOICE_DEFAULT_PITCH,

        // A new line: the speaker is looked up once, not per letter.
        begin() {
            this._count = 0;
            this._sheet = _voiceSpeakerSheet();
            this._name  = _voiceSpeakerName();
            this._pitch = _voicePitchFor(this._sheet, this._name || _voiceEventKey());
        },

        pitch() { return this._pitch; },

        // Play one letter. `gold` raises it by the keyword third.
        speakLetter(letter, gold, now) {
            if (!_voiceEnabled()) return false;
            if (!_voiceIsStaged()) return false;
            const tier = _voiceTierFor(this._pitch);
            const se   = _voiceSeFor(letter, tier);
            if (!se) return false;
            const t = (now === undefined) ? Date.now() : now;
            if (t - this._last < VOICE_GAP_MS) return false;
            if ((this._count++ % VOICE_STEP) !== 0) return false;
            this._last = t;
            const ratio = (this._pitch / tier.nominal) * (gold ? VOICE_KEY_MUL : 1);
            const pitch = Math.max(50, Math.min(150, Math.round(100 * ratio)));
            // A blip whose ogg was never shipped is simply not heard: the
            // chatter is decoration, and neither a missing file nor an audio
            // backend that refuses to decode it may reach the player as an
            // error. A name that failed once is never asked for again.
            if (DialogueVoice._missing[se]) return false;
            try {
                if (typeof AudioManager !== 'undefined' && AudioManager.playSe) {
                    AudioManager.playSe({ name: se, volume: _voiceVolume(), pitch, pan: 0 });
                }
            } catch (err) {
                DialogueVoice._missing[se] = true;
                return false;
            }
            return true;
        },

        // The slice of the line that was just revealed. `text` still carries the
        // gold marks, so whether a letter is inside one is read straight off it.
        speakRange(text, from, to, now) {
            if (!_voiceEnabled() || !text) return;
            if (!_voiceIsStaged()) return;
            let gold = text.lastIndexOf(NAME_OPEN, Math.max(0, from - 1)) >
                       text.lastIndexOf(NAME_CLOSE, Math.max(0, from - 1));
            for (let i = Math.max(0, from); i < Math.min(text.length, to); i++) {
                const ch = text.charAt(i);
                if (ch === NAME_OPEN)  { gold = true;  continue; }
                if (ch === NAME_CLOSE) { gold = false; continue; }
                this.speakLetter(ch, gold, now);
            }
        },
    };

    window.DialogueVoice = DialogueVoice;

    const _WM_initialize = Window_Message.prototype.initialize;
    Window_Message.prototype.initialize = function (rect) {
        _WM_initialize.call(this, rect);
        this.visible = false;

        ['html-msg-overlay', 'html-msg-name'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); });

        const root = document.createElement('div');
        root.id = 'html-msg-overlay';
        this._htmlMsgRoot = root;

        const nameEl = document.createElement('div');
        nameEl.id = 'html-msg-name';
        nameEl.style.transition = 'none'; // no sliding, position is recomputed each frame
        this._htmlMsgName = nameEl;

        const textEl = document.createElement('div');
        textEl.id = 'html-msg-text';
        this._htmlMsgText = textEl;
        root.appendChild(textEl);

        this._htmlMsgHideDelay = 0;

        document.body.appendChild(root);
        document.body.appendChild(nameEl);
    };

    Game_Message.prototype.allText = function () {
        return autoWrapText(this._texts.join(' '));
    };

    const _WM_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        _WM_startMessage.call(this);
        this._htmlMsgTurbo      = false;
        this._htmlMsgTurboCount = 0;
        this._htmlMsgVoiceText  = null;
        this._htmlMsgVoiceShown = 0;
        DialogueVoice.begin();
        if (this._htmlMsgRoot) {
            this._htmlMsgRoot.style.display = 'block';
            this._htmlMsgHideDelay  = 0;
            this._htmlMsgPendingHide = false;
            // Don't clear text yet, keep previous text until typewriter starts,
            // so there's no blank flash between consecutive dialogue boxes.
        }
        const scene = SceneManager._scene;
        if (scene && scene._bustManager && !scene._bustManager.exchangeMode &&
            !facelessIsRunning()) scene._bustManager.showBusts();
    };

    const _WM_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function () {
        if (this._htmlMsgRoot && this._textState) {
            const full = _stripMsgEscapes(this._textState.text);
            _msgSetText(this._htmlMsgText, full);
            this._htmlMsgLastText  = full;
            this._htmlMsgLastShown = full.length;
        }
        // A message raised from outside the interpreter (the voxel world asks a
        // passer-by a question this way) can be closed on a frame where the
        // scene's own companion windows are not associated with this one, and
        // the engine's terminate then throws on a window it assumes is there.
        // Failing here leaves the box up forever with every key refused, so the
        // close is completed by hand instead.
        try {
            _WM_terminateMessage.call(this);
        } catch (e) {
            console.error('[DialogueSystem] terminateMessage', e);
            this.close();
            if (this._goldWindow) this._goldWindow.close();
            $gameMessage.clear();
        }
        if (this._htmlMsgRoot) this._htmlMsgPendingHide = true;
        // A faceless run owns the box until it is empty, wherever it is played.
        if (facelessIsRunning()) { advanceFacelessMessage(); return; }
        const scene = SceneManager._scene;
        if (scene && scene._bustManager && scene._bustManager.exchangeMode) {
            advanceNPCExchange();
            return;
        }
        if (scene && scene._bustManager && scene._bustManager.shouldAutoHide()) {
            scene._bustManager.hideBusts();
        }
    };

    // The item quick bar holds the bottom edge of the map screen and stays up
    // while you talk (ItemSystem/ItemSystemHotbar.js), so a box placed at the
    // bottom is lifted clear of it rather than dropped over it.
    function bottomBarReserve() {
        const bar = window.ItemHotbar;
        if (!bar || typeof bar.mapBarReservedHeight !== 'function') return 0;
        const px = bar.mapBarReservedHeight();
        return px > 0 ? px + 6 : 0; // a hair of air between box and bar
    }

    // The screen is taller than the UI frame the engine measures against:
    // ResolutionSwitcher runs the game at 1280x720 while Graphics.boxHeight
    // stays at the 624 written in System.json, so the engine's own placement
    // leaves a bottom box floating almost a hundred pixels short of the bottom,
    // in the middle of the portrait instead of under its feet. Every position
    // type is re-measured against the real screen, and the bottom one then sits
    // on the same floor the portrait stands on.
    // The box never touches the screen edge: it is inset on both sides and
    // lifted off the floor by the same margin, so it reads as a card laid on
    // the scene rather than a bar welded to the frame. The portraits stand on
    // the floor of the screen behind it (bustFloor above) and are not measured
    // against it, so the box is free to move without resizing anybody.
    const msgEdgeMargin = 20;

    const _WM_updatePlacement = Window_Message.prototype.updatePlacement;
    Window_Message.prototype.updatePlacement = function () {
        _WM_updatePlacement.call(this);
        const m  = msgEdgeMargin;
        const ww = Math.max(160, Math.min(MESSAGE_WINDOW_WIDTH, Graphics.boxWidth - m * 2));
        if (this.width !== ww) {
            this.width = ww;
            if (typeof this.createContents === 'function') this.createContents();
        }
        this.x = Math.round((Graphics.width - this.width) / 2);
        const floor = Graphics.height - bottomBarReserve() - m;
        const room  = Math.max(0, floor - m - this.height);
        this.y = Math.max(m, m + (this._positionType * room) / 2);
    };

    // Hurrying a line along. The engine's own answer to a keypress is
    // `_showFast`, which empties the rest of the line into the box in a single
    // frame: the reveal stops being a reveal and the letters stop being spoken.
    // The press is taken as "faster", not "now": the typewriter keeps writing
    // one letter at a time, several letters a frame instead of one, so the line
    // still arrives letter by letter and is still chattered as it lands.
    const MSG_TURBO_CHARS = 6; // letters per frame once the player asks to hurry

    Window_Message.prototype.updateShowFast = function () {
        if (this.isTriggered()) this._htmlMsgTurbo = true;
    };

    const _WM_shouldBreakHere = Window_Message.prototype.shouldBreakHere;
    Window_Message.prototype.shouldBreakHere = function (textState) {
        if (this._htmlMsgTurbo && !this._showFast && !this._lineShowFast &&
            this.canBreakHere(textState)) {
            this._htmlMsgTurboCount = (this._htmlMsgTurboCount || 0) + 1;
            return this._htmlMsgTurboCount % MSG_TURBO_CHARS === 0;
        }
        return _WM_shouldBreakHere.call(this, textState);
    };

    const _WM_newPage = Window_Message.prototype.newPage;
    Window_Message.prototype.newPage = function (textState) {
        this._htmlMsgTurbo      = false;
        this._htmlMsgTurboCount = 0;
        this._htmlMsgVoiceText  = null;
        this._htmlMsgVoiceShown = 0;
        _WM_newPage.call(this, textState);
    };

    // The chatter keeps its own record of how much of the line has been spoken,
    // separate from the one the reveal keeps for what is drawn. The drawn record
    // deliberately holds the previous line until the typewriter writes its first
    // character (so the box never flashes empty), which used to mean the opening
    // letters of a line were never chattered, and a short line, a signpost or any
    // other box that is over in a few frames, was heard as nothing at all.
    Window_Message.prototype._htmlMsgSpeak = function (full, shown) {
        if (full !== this._htmlMsgVoiceText) {
            this._htmlMsgVoiceText  = full;
            this._htmlMsgVoiceShown = 0;
        }
        if (shown > this._htmlMsgVoiceShown) {
            DialogueVoice.speakRange(full, this._htmlMsgVoiceShown, shown);
            this._htmlMsgVoiceShown = shown;
        }
    };

    const _WM_update = Window_Message.prototype.update;
    Window_Message.prototype.update = function () {
        let preFullText = null;
        if (this._htmlMsgRoot && this._htmlMsgRoot.style.display !== 'none' && this._textState) {
            preFullText = _stripFull(this);
        }

        _WM_update.call(this);
        this.visible = false;

        if (this._htmlMsgPendingHide) {
            this._htmlMsgPendingHide = false;
            this._htmlMsgHideDelay = 2;
        }
        if (this._htmlMsgHideDelay > 0) {
            this._htmlMsgHideDelay--;
            if (this._htmlMsgHideDelay === 0 && !this._textState && this._htmlMsgRoot) {
                this._htmlMsgRoot.style.display = 'none';
                if (this._htmlMsgText) this._htmlMsgText.textContent = '';
                this._htmlMsgLastText = null;
            }
        }

        if (!this._htmlMsgRoot || this._htmlMsgRoot.style.display === 'none') {
            if (this._htmlMsgName) this._htmlMsgName.style.display = 'none';
            return;
        }

        // Canvas rect (getBoundingClientRect forces layout) is recomputed only
        // when the game/window size actually changes, not every frame.
        const gw = Graphics.width, gh = Graphics.height;
        const winW = window.innerWidth, winH = window.innerHeight;
        let scCache = this._htmlMsgScaleCache;
        if (!scCache || scCache.winW !== winW || scCache.winH !== winH || scCache.gw !== gw || scCache.gh !== gh) {
            scCache = this._htmlMsgScaleCache = { winW, winH, gw, gh, sc: _msgGetScale() };
        }
        const sc       = scCache.sc;
        const pad      = this.padding || 12;
        const baseFontSize = (typeof this.standardFontSize === 'function') ? this.standardFontSize() : 29;
        const centeredLeft = sc.ox + (sc.sx * gw / 2) - (this.width * sc.sx) / 2;

        // Which end of the box the name tag hangs from: the end opposite the
        // portrait, so the speaker's face and their name are never stacked on
        // top of each other.
        const nameAdapter = SceneManager._scene && SceneManager._scene._bustManager
                          ? SceneManager._scene._bustManager.nameWindow : null;
        const nameSide    = (nameAdapter && nameAdapter._side === 'right') ? 'right' : 'left';

        // All the box/name geometry depends only on the scale + this.y/width/
        // height/padding/fontSize + the name side; skip the ~12 style writes
        // when none changed.
        const geomSig = sc.sx + ',' + sc.sy + ',' + sc.ox + ',' + sc.oy + ',' +
                        this.width + ',' + this.height + ',' + this.y + ',' + pad + ',' +
                        baseFontSize + ',' + nameSide + ',' + winW;
        if (geomSig !== this._htmlMsgGeomSig) {
            this._htmlMsgGeomSig = geomSig;
            const s       = this._htmlMsgRoot.style;
            const scaledW = this.width  * sc.sx;
            const scaledH = this.height * sc.sy;

            s.left    = centeredLeft + 'px';
            s.top     = (sc.oy + this.y * sc.sy) + 'px';
            s.width   = scaledW + 'px';
            s.height  = scaledH + 'px';
            s.padding = Math.round(pad * sc.sy) + 'px ' + Math.round(pad * sc.sx) + 'px';

            this._htmlMsgText.style.fontSize = Math.round(baseFontSize * sc.sy * 0.85) + 'px';
            this._htmlMsgName.style.fontSize = Math.round(20 * sc.sy) + 'px';

            // Name anchored flush above one edge of the textbox, no animation.
            // The right-hand anchor uses the `right` longhand so the tag does
            // not need to be measured before it can be placed.
            const nameH   = Math.round(28 * sc.sy);
            const nameIns = Math.round(16 * sc.sx);
            this._htmlMsgName.style.top = (sc.oy + this.y * sc.sy - nameH - Math.round(6 * sc.sy)) + 'px';
            if (nameSide === 'right') {
                this._htmlMsgName.style.left  = 'auto';
                this._htmlMsgName.style.right = (winW - (centeredLeft + scaledW - nameIns)) + 'px';
            } else {
                this._htmlMsgName.style.right = 'auto';
                this._htmlMsgName.style.left  = (centeredLeft + nameIns) + 'px';
            }
        }

        // Text reveal. The element always holds the finished line; only how much
        // of it is visible changes, so the wrap is fixed for the whole reveal.
        if (this._textState) {
            const isFast = this._showFast || this._lineShowFast;
            // Re-strip only when the visible slice actually changed (text ident +
            // reveal index; index -1 flags the fast/full path).
            const idx = isFast ? -1 : this._textState.index;
            const rc  = this._htmlMsgStripCache;
            let full, shown;
            if (rc && rc.text === this._textState.text && rc.index === idx) {
                full  = rc.full;
                shown = rc.shown;
            } else {
                full  = _stripMsgEscapes(this._textState.text);
                shown = isFast ? full.length
                    : _stripMsgEscapes(this._textState.text.substring(0, this._textState.index)).length;
                this._htmlMsgStripCache = { text: this._textState.text, index: idx, full, shown };
            }
            // Hold previous text until the typewriter writes its first character,
            // avoids a blank flash between messages.
            if (shown > 0 || !this._htmlMsgLastText) {
                if (full !== this._htmlMsgLastText || shown !== this._htmlMsgLastShown) {
                    _msgRenderReveal(this._htmlMsgText, full, shown);
                    // Chatter the letters that were just written out. A line
                    // skipped to the end (or a new line) is never machine-gunned:
                    // only a forward step inside the same line is spoken.
                    if (!isFast) this._htmlMsgSpeak(full, shown);
                    this._htmlMsgLastText  = full;
                    this._htmlMsgLastShown = shown;
                }
            }
        } else if (preFullText !== null &&
                   (preFullText !== this._htmlMsgLastText ||
                    this._htmlMsgLastShown < preFullText.length)) {
            // The engine finishes the line and drops its text state in the same
            // frame (onEndOfText), so the last characters are typed on a frame
            // the reveal above never sees. The line already on screen is the
            // right one, only shorter than it should be, so the tail has to be
            // painted here as well: comparing the text alone left the box frozen
            // at whatever the typewriter had reached, which is what ate the last
            // letter of a line and the whole tail of a line hurried along.
            _msgSetText(this._htmlMsgText, preFullText);
            this._htmlMsgSpeak(preFullText, preFullText.length);
            this._htmlMsgLastText  = preFullText;
            this._htmlMsgLastShown = preFullText.length;
        }

        // Name: read from BustManager adapter (no separate vn-name-overlay needed)
        const scene = SceneManager._scene;
        const nm    = scene && scene._bustManager && scene._bustManager.nameWindow;
        let name    = (nm && nm._visible) ? (nm._characterName || '') : '';
        if (!name && $gameMessage && typeof $gameMessage.speakerName === 'function') {
            name = $gameMessage.speakerName() || '';
        }

        if (name) {
            this._htmlMsgName.textContent   = name;
            this._htmlMsgName.style.display = 'block';
        } else {
            this._htmlMsgName.style.display = 'none';
        }
    };

    const _WM_destroy = Window_Message.prototype.destroy;
    Window_Message.prototype.destroy = function (options) {
        if (this._htmlMsgRoot && this._htmlMsgRoot.parentNode) this._htmlMsgRoot.parentNode.removeChild(this._htmlMsgRoot);
        if (this._htmlMsgName && this._htmlMsgName.parentNode) this._htmlMsgName.parentNode.removeChild(this._htmlMsgName);
        this._htmlMsgRoot = null;
        this._htmlMsgName = null;
        _WM_destroy.call(this, options);
    };

    // -------------------------------------------------------------------------
    // HTML Choice List
    // -------------------------------------------------------------------------
    // A choice list is a column of lines unless the caller asked for a grid
    // just before it set the choices. The spec says how many columns to lay
    // the entries out in and how many of them fall under each heading; the
    // Ask / Tell topics are the one thing that uses it so far. It is consumed
    // by the window that opens next and never outlives it.
    let pendingChoiceGrid = null;
    function setChoiceGrid(spec) { pendingChoiceGrid = spec || null; }

    const _WCL_initialize = Window_ChoiceList.prototype.initialize;
    Window_ChoiceList.prototype.initialize = function () {
        _WCL_initialize.call(this);
        this.visible = false;
        const old = document.getElementById('html-choice-overlay');
        if (old) old.remove();
        const root = document.createElement('div');
        root.id = 'html-choice-overlay';
        this._htmlChoiceRoot = root;
        document.body.appendChild(root);
    };

    const _WCL_start = Window_ChoiceList.prototype.start;
    Window_ChoiceList.prototype.start = function () {
        _WCL_start.call(this);
        this._htmlChoiceLastIndex = -1;
        this._htmlChoiceGrid = pendingChoiceGrid;
        pendingChoiceGrid    = null;
        if (this._htmlChoiceRoot) {
            this._htmlChoiceRoot.style.display = 'block';
            this._buildChoiceItems();
        }
    };

    Window_ChoiceList.prototype._buildChoiceItems = function () {
        const root = this._htmlChoiceRoot;
        if (!root) return;
        root.innerHTML = '';
        const list = this._list || [];
        const self = this;
        const grid = this._htmlChoiceGrid;
        this._htmlChoiceOriginalIndices = [];
        this._htmlChoiceEls = [];
        root.classList.toggle('story-ask-grid', !!grid);

        // In grid mode the entries are laid out under their headings, so an
        // entry is appended to the section it belongs to rather than to the
        // overlay itself. The tail past the last section (Cancel) stands on
        // its own line under the whole grid.
        let cell = root;
        let left = 0;
        const sections = grid ? (grid.groups || []).slice() : [];
        // A group marked `side` is not another bank down the board: it is the
        // narrow column standing to the right of the topics (the sheet's own
        // switches), so the board is split in two columns the moment one of
        // them asks for it.
        let mainCol  = root;
        let asideCol = null;
        if (grid && sections.some(g => g.side)) {
            const cols = document.createElement('div');
            cols.className = 'html-choice-cols';
            mainCol  = document.createElement('div');
            asideCol = document.createElement('div');
            mainCol.className  = 'html-choice-col';
            asideCol.className = 'html-choice-col html-choice-aside';
            cols.appendChild(mainCol);
            cols.appendChild(asideCol);
            root.appendChild(cols);
        }
        const nextCell = () => {
            if (!grid) return;
            while (left <= 0 && sections.length) {
                const group  = sections.shift();
                const column = group.side && asideCol ? asideCol : mainCol;
                const header = document.createElement('div');
                header.className   = 'html-choice-group';
                header.textContent = group.title;
                column.appendChild(header);
                cell = document.createElement('div');
                cell.className = 'html-choice-rows';
                // Equal fractions of a column that is only as wide as its own
                // content collapse to one word per line, which is what the
                // board looked like once there were more than a handful of
                // topics. The columns are sized to what is written in them
                // instead, and never asked to hold more entries than they fit.
                const cols = group.side ? 1
                    : Math.max(1, Math.min(group.count || 1, grid.cols || 2));
                // minmax(0, max-content): a track is as wide as what is written
                // in it and no wider, but it may still be squeezed rather than
                // spilling out of its column over the one beside it.
                cell.style.gridTemplateColumns = `repeat(${cols}, minmax(0, max-content))`;
                column.appendChild(cell);
                left = group.count;
            }
            if (left <= 0) cell = root; // the tail: Cancel
        };

        list.forEach((cmd, i) => {
            if (cmd.hidden) return;
            const enabled = cmd.enabled !== false;
            this._htmlChoiceOriginalIndices.push(i);
            nextCell();
            const item = document.createElement('div');
            item.dataset.idx = i;
            item.className   = enabled ? 'html-choice-item' : 'html-choice-item disabled';
            if (grid && cell === root) item.classList.add('html-choice-tail');
            item.style.cursor = enabled ? 'pointer' : 'default';
            item.textContent  = cmd.name;
            if (enabled) {
                item.addEventListener('mouseover', () => { if (self.active && typeof self.select === 'function') self.select(i); });
                item.addEventListener('click',     () => {
                    if (self.active && typeof self.select    === 'function') self.select(i);
                    if (self.active && typeof self.processOk === 'function') self.processOk();
                });
            }
            cell.appendChild(item);
            if (cell !== root) left--;
            self._htmlChoiceEls.push(item);
        });

        const firstVisible = list.findIndex(cmd => !cmd.hidden);
        if (firstVisible >= 0 && typeof this.select === 'function') this.select(firstVisible);
    };

    // Position choice window above the message window (right-aligned)
    const _WCL_updatePlacement = Window_ChoiceList.prototype.updatePlacement;
    Window_ChoiceList.prototype.updatePlacement = function () {
        _WCL_updatePlacement.call(this);
        const scene  = SceneManager._scene;
        const msgWin = scene ? scene._messageWindow : null;
        if (msgWin) {
            const floor = Graphics.height - this.height - 10 - bottomBarReserve();
            // The box is drawn centred on the screen rather than at the window's
            // own x (see the DOM geometry in Window_Message.update), so the
            // choices are hung off that centred right edge, not off msgWin.x.
            const boxLeft = (Graphics.width - msgWin.width) / 2;
            let tx = boxLeft + msgWin.width - this.width;
            let ty = msgWin.y - this.height - 10;
            if (ty < 10) ty = msgWin.y + msgWin.height + 10;
            this.x = Math.max(10, Math.min(tx, Graphics.width - this.width - 10));
            this.y = Math.max(10, Math.min(ty, floor));
        }
    };

    const _WCL_update = Window_ChoiceList.prototype.update;
    Window_ChoiceList.prototype.update = function () {
        _WCL_update.call(this);
        this.visible = false;
        if (!this._htmlChoiceRoot || this._htmlChoiceRoot.style.display === 'none') return;
        if (!this._htmlChoiceEls || this._htmlChoiceEls.length === 0) return;

        if (this.active && this._htmlChoiceGrid) {
            // A grid is walked in two directions: left and right step one
            // entry, up and down a whole row, and the walk runs over the
            // headings so the banks read as one board.
            const visible = this._htmlChoiceOriginalIndices || [];
            const cols    = Math.max(1, this._htmlChoiceGrid.cols || 2);
            const here    = Math.max(0, visible.indexOf(this._index));
            const step    = d => {
                const to = Math.max(0, Math.min(visible.length - 1, here + d));
                if (to === here) return;
                if (typeof this.select === 'function') this.select(visible[to]);
                if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
            };
            if      (Input.isRepeated('down'))  step(cols);
            else if (Input.isRepeated('up'))    step(-cols);
            else if (Input.isRepeated('right')) step(1);
            else if (Input.isRepeated('left'))  step(-1);
            if      (Input.isTriggered('ok'))     { if (typeof this.processOk     === 'function') this.processOk(); }
            else if (Input.isTriggered('cancel')) { if (typeof this.processCancel === 'function') this.processCancel(); }
        } else if (this.active) {
            const list      = this._list || [];
            const fullCount = list.length;
            const cur       = this._index >= 0 ? this._index : 0;
            const findNext  = (start, dir) => {
                for (let n = 1; n <= fullCount; n++) {
                    const idx = (start + dir * n + fullCount) % fullCount;
                    if (!list[idx] || (!list[idx].hidden && list[idx].enabled !== false)) return idx;
                }
                return start;
            };
            if (Input.isRepeated('down')) {
                if (typeof this.select === 'function') this.select(findNext(cur, 1));
                if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
            } else if (Input.isRepeated('up')) {
                if (typeof this.select === 'function') this.select(findNext(cur, -1));
                if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
            }
            if      (Input.isTriggered('ok'))     { if (typeof this.processOk     === 'function') this.processOk(); }
            else if (Input.isTriggered('cancel')) { if (typeof this.processCancel === 'function') this.processCancel(); }
        }

        const sc       = _msgGetScale();
        const s        = this._htmlChoiceRoot.style;
        if (this._htmlChoiceGrid) {
            // The board is wider than the engine measured the choice window to
            // be, so it is centred on the screen instead of hung off it.
            s.left      = '50%';
            s.top       = '50%';
            s.transform = 'translate(-50%, -50%)';
            s.width     = 'auto';
        } else {
            s.transform = '';
            s.left  = (sc.ox + this.x * sc.sx) + 'px';
            s.top   = (sc.oy + this.y * sc.sy) + 'px';
            s.width = (this.width * sc.sx) + 'px';
        }

        // The board carries far more entries than a plain choice list, so it is
        // written a size down from one.
        const baseFont   = (typeof this.standardFontSize === 'function') ? this.standardFontSize() : 26;
        const scaledFont = Math.round(baseFont * sc.sy * (this._htmlChoiceGrid ? 0.62 : 0.85));
        const idx        = this._index >= 0 ? this._index : 0;
        if (this._htmlChoiceOriginalIndices) {
            this._htmlChoiceEls.forEach((el, vi) => {
                el.style.fontSize    = scaledFont + 'px';
                const sel            = this._htmlChoiceOriginalIndices[vi] === idx;
                el.classList.toggle('selected', sel);
            });
        }
    };

    const _WCL_close = Window_ChoiceList.prototype.close;
    Window_ChoiceList.prototype.close = function () {
        _WCL_close.call(this);
        this._htmlChoiceGrid = null;
        if (this._htmlChoiceRoot) this._htmlChoiceRoot.style.display = 'none';
    };

    const _WCL_destroy = Window_ChoiceList.prototype.destroy;
    Window_ChoiceList.prototype.destroy = function (options) {
        if (this._htmlChoiceRoot && this._htmlChoiceRoot.parentNode) this._htmlChoiceRoot.parentNode.removeChild(this._htmlChoiceRoot);
        this._htmlChoiceRoot = null;
        _WCL_destroy.call(this, options);
    };

    // -------------------------------------------------------------------------
    // Keyword System: ChoiceList
    // -------------------------------------------------------------------------
    if (Utils.RPGMAKER_NAME === "MZ") {
        const _WCL_makeCommandList = Window_ChoiceList.prototype.makeCommandList;
        Window_ChoiceList.prototype.makeCommandList = function () {
            _WCL_makeCommandList.call(this);
            for (let i = 0; i < this._list.length; i++) {
                const cmd = this._list[i];
                let text    = cmd.name;
                let enabled = true;
                const switchMatch = text.match(/^(\d+)\s+(.*)/);
                if (switchMatch) {
                    const switchId = parseInt(switchMatch[1], 10);
                    text = switchMatch[2];
                    if (!$gameSwitches.value(switchId)) enabled = false;
                }
                if (enabled) {
                    const keywords = text.match(keywordRe());
                    if (keywords) {
                        let allKnown = true;
                        keywords.forEach(k => {
                            const kw = splitKeyword(k.slice(1, -1)).topic;
                            if (!$gameParty.members().some(a => a._keywords && a._keywords.includes(kw))) allKnown = false;
                        });
                        if (!allKnown) { enabled = false; cmd.hidden = true; }
                        else {
                            text = text.replace(keywordRe(), (_m, inner) => splitKeyword(inner).display);
                        }
                    }
                }
                if (!enabled) { cmd.name = cmd.hidden ? '' : '???'; cmd.enabled = false; }
                else          { cmd.name = text; }
            }
        };
    }

    // -------------------------------------------------------------------------
    // Keyword System: learning [Keyword] topics
    // -------------------------------------------------------------------------
    // A line of dialogue can teach several topics at once, and each one is a
    // notification in its own right: they go to the shared popup service, which
    // stacks them, rather than to a message box that would interrupt the very
    // conversation that taught them.
    function announceKeywords(learned) {
        if (!learned.length || !window.ParchmentToast) return;
        window.ParchmentToast.group(learned.map(keyword => () => {
            // A topic is filed under the one name the codex knows it by, but a
            // line can have named it with a synonym, so the popup reads the
            // page's own title rather than the words that happened to teach it.
            const shown = topicDisplayName(keyword);
            window.ParchmentToast.show(T('Dialogue.learnedTopic', { topic: shown }), {
                severity: 'good',
                duration: 600,
                key: `keyword:${keyword}`
            });
        }));
    }

    // A topic can be written [Tribunal | Judicial Dimension]: what the line
    // says is the left half, what the party actually learns is the right half.
    // With no pipe the two are the same thing.
    const KEYWORD_SOURCE = /\[([^\]]+)\]/.source;

    function keywordRe() { return new RegExp(KEYWORD_SOURCE, 'g'); }

    function splitKeyword(inner) {
        const pipe = inner.indexOf('|');
        if (pipe < 0) {
            const word = inner.trim();
            return { display: word, topic: word };
        }
        return { display: inner.slice(0, pipe).trim(), topic: inner.slice(pipe + 1).trim() };
    }

    // Teach every [Keyword] in `text` to the whole party, and hand back only
    // the ones nobody knew yet, so a topic is announced once and never again.
    function teachKeyword(keyword) {
        if (!keyword || typeof $gameParty === 'undefined' || !$gameParty) return false;
        let isNew = false;
        $gameParty.members().forEach(actor => {
            if (!actor._keywords) actor._keywords = [];
            if (!actor._keywords.includes(keyword)) {
                actor._keywords.push(keyword);
                isNew = true;
            }
        });
        return isNew;
    }

    function learnKeywords(text) {
        const learned = [];
        const keywordRegex = keywordRe();
        let match;
        while ((match = keywordRegex.exec(text)) !== null) {
            const keyword = splitKeyword(match[1]).topic;
            if (!keyword) continue;
            if (teachKeyword(keyword) && !learned.includes(keyword)) learned.push(keyword);
        }
        return learned;
    }

    // -------------------------------------------------------------------------
    // Keyword System: topics a line NAMES rather than brackets
    // -------------------------------------------------------------------------
    // A topic used to have to be written [in brackets] to be taught. It still
    // can be, and [Display | Topic] still says one thing and files another, but
    // the codex now carries the words each of its pages answers to
    // (js/db/Messages/HelpTopics.json: `keyword`, and `synonyms` for the other
    // names the same thing goes by), so simply NAMING one teaches it. The
    // phrase is marked where it stands, whatever wording was used, and the
    // popup announces the page's own title rather than the synonym.
    //
    // A page written for a menu command rather than for the world (Sleep,
    // Build, Continue) carries "autoDetect": false: those words are ordinary
    // prose and would light up in every second line. They are still taught the
    // old way, by being bracketed.
    const TOPIC_MIN_ALIAS = 3;

    let _topicAliases = null;   // lower-cased alias -> the page's own keyword
    let _topicNames   = null;   // keyword           -> the page's own title
    let _topicRegex   = null;
    let _topicLang    = null;

    function topicPages() {
        const bank = window.Messages && window.Messages.DialogueTopics;
        if (!bank) return [];
        return Array.isArray(bank) ? bank : Object.values(bank);
    }

    // The codex is read in the language being played, so the index is keyed in
    // it too and rebuilt when the language changes under it.
    function topicIndex() {
        const lang = (typeof ConfigManager !== 'undefined' && ConfigManager.language) || 'en';
        if (_topicAliases && _topicLang === lang) return _topicAliases;
        const aliases = new Map();
        const names   = new Map();
        const add = (alias, primary) => {
            const word = String(alias == null ? '' : alias).trim();
            if (word.length < TOPIC_MIN_ALIAS) return;
            const key = word.toLowerCase();
            if (!aliases.has(key)) aliases.set(key, primary);
        };
        topicPages().forEach(page => {
            if (!page || page.type !== 'topic' || !page.keyword) return;
            const primary = String(page.keyword);
            const title = window.HelpCodex && window.HelpCodex.titleOf(primary);
            names.set(primary, title || primary);
            if (page.autoDetect === false) return;
            add(primary, primary);
            (page.synonyms || []).forEach(word => add(word, primary));
            // The page's title in the language being played answers to itself,
            // so an Italian line teaches the same page an English one does.
            add(title, primary);
        });
        _topicAliases = aliases;
        _topicNames   = names;
        _topicRegex   = null;
        _topicLang    = lang;
        return aliases;
    }

    function topicDisplayName(keyword) {
        topicIndex();
        return (_topicNames && _topicNames.get(keyword)) || keyword;
    }

    // Longest alias first, so "Holy Vatican Empire" is matched before "Vatican"
    // and the page a line really names is the page it teaches.
    function topicMatcher() {
        topicIndex();
        if (_topicRegex !== null) return _topicRegex || null;
        const alts = Array.from(_topicAliases.keys())
            .sort((a, b) => b.length - a.length)
            .map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        _topicRegex = alts.length ? new RegExp('\\b(' + alts.join('|') + ')\\b', 'gi') : false;
        return _topicRegex || null;
    }

    // Teach and mark every topic a line names. What is already marked is
    // stepped over rather than read again, so a [Bracket] that was just
    // resolved is never matched a second time inside its own gold.
    function markNamedTopics(text) {
        const line = String(text == null ? '' : text);
        if (!line) return line;
        const re = topicMatcher();
        if (!re) return line;
        const learned = [];
        const marked = new RegExp('(' + NAME_OPEN + '[^' + NAME_CLOSE + ']*' + NAME_CLOSE + ')');
        const out = line.split(marked).map(part => {
            if (!part || part.charAt(0) === NAME_OPEN) return part || '';
            re.lastIndex = 0;
            return part.replace(re, (word) => {
                const primary = _topicAliases.get(word.toLowerCase());
                if (!primary) return word;
                if (teachKeyword(primary) && !learned.includes(primary)) learned.push(primary);
                return NAME_OPEN + word + NAME_CLOSE;
            });
        }).join('');
        announceKeywords(learned);
        return out;
    }

    // -------------------------------------------------------------------------
    // Keyword System: processMessageBuffer
    // -------------------------------------------------------------------------
    Game_Message.prototype.processMessageBuffer = function () {
        if (!this.messageBuffer || !this.messageBuffer.length) return;

        const scene = typeof SceneManager !== 'undefined' && SceneManager._scene;
        if (scene && scene._bustManager && typeof scene._bustManager.showBusts === 'function') {
            scene._bustManager.showBusts();
        }

        const fullMessage    = this.messageBuffer.join('\n');
        let processedText    = fullMessage;
        if (window.Imported && window.Imported['YEP_MessageCore'] && $gameSystem.wordWrap()) {
            processedText = '<WordWrap>' + processedText;
        }
        const translatedText = window.translateText ? window.translateText(processedText) : processedText;
        this.messageBuffer   = [];

        announceKeywords(learnKeywords(translatedText));

        const wrappedText   = autoWrapText(translatedText);
        const displayedText = markNamedTopics(wrappedText.replace(
            keywordRe(),
            (_m, inner) => NAME_OPEN + splitKeyword(inner).display + NAME_CLOSE
        ));
        displayedText.split('\n').forEach(line => this._texts.push(line));
    };

    if (typeof window.autoWrapText === 'undefined') {
        window.autoWrapText = autoWrapText;
    }

    // -------------------------------------------------------------------------
    // Rumors
    // -------------------------------------------------------------------------
    // What an NPC says when the player talks to them and the event has nothing
    // scripted to say. The line is written, not generated: it comes out of the
    // one generic bank, which everybody speaks from, whoever they are and
    // whether or not there is anybody behind the event at all (a cat, a
    // signpost, a body double in a cutscene).

    // How often talking to somebody is answered with the plain rumour rather
    // than a conversation. Everything else they could say is longer.
    const RUMOR_CHANCE = 0.25;

    function vary(text) {
        if (typeof text !== 'string' || text.indexOf('{') < 0) return text;
        let out = text;
        let guard = 0;
        while (guard++ < 64) {
            const next = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => {
                const parts = body.split('|');
                return parts[Math.floor(Math.random() * parts.length)];
            });
            if (next === out) break;
            out = next;
        }
        return out;
    }

    function pickRumor() {
        const pool = T.pool('Rumors.generic');
        if (!pool.length) return '';
        const raw = pool[Math.floor(Math.random() * pool.length)];
        return vary(raw);
    }

    // -------------------------------------------------------------------------
    // Proper nouns in a spoken line
    // -------------------------------------------------------------------------
    // Everything the rumour and conversation banks fill their templates with -
    // a party member, another NPC, a nation, a hyperpower, a faction, a town -
    // is a name the player is meant to catch, so it is printed in the same gold
    // a [Keyword] is printed in. The names are not marked at each of the two
    // dozen fill sites: the finished line is read against the roster of names
    // the world actually holds, which catches the ones a bank wrote out in full
    // as well as the ones a template dropped in.
    //
    // The mark is a pair of private characters, never a visible bracket: the
    // brackets a topic is written in are the writer's notation, not something
    // the player reads. A [Keyword] is marked the same way once the party has
    // been taught it (see processMessageBuffer). Only #html-msg-text reads the
    // marks (see _msgSetText); everything else that ever sees such a line is
    // handed the plain text through strip().
    const NAME_OPEN  = '\u2045';
    const NAME_CLOSE = '\u2046';

    // A name is worth marking when it reads as a name: two characters at the
    // least, opening and closing on a word character so \b can be trusted, and
    // not a word the banks use as ordinary prose.
    // A generated settlement, hyperpower or nation can be named with a word
    // that is also ordinary prose, and a line then reads with a gold "Then" at
    // the head of it. Any word a sentence is likely to open with is kept out of
    // the roster: a name is only marked when nothing else could have written it.
    const NAME_STOPWORDS = [ // i18n-ignore: prose words, never printed
        'The', 'And', 'You', 'One', 'Only', 'Man', 'Old', 'New', 'Some', 'Free',
        'Then', 'That', 'This', 'These', 'Those', 'There', 'Here', 'Now', 'Well',
        'But', 'So', 'Or', 'If', 'When', 'While', 'What', 'Who', 'Why', 'How',
        'Yes', 'No', 'Not', 'All', 'Any', 'Both', 'Each', 'Even', 'Just', 'Like',
        'Still', 'Also', 'Once', 'Very', 'Much', 'More', 'Most', 'Less', 'Least',
        'Good', 'Great', 'Big', 'Little', 'Long', 'Last', 'First', 'Next', 'Every',
        'Maybe', 'Never', 'Always', 'After', 'Before', 'Because', 'Since', 'Until',
        'They', 'Them', 'Their', 'She', 'Her', 'His', 'Him', 'Its', 'Our', 'Your',
        'We', 'Us', 'Me', 'My', 'It', 'He', 'Do', 'Does', 'Did', 'Was', 'Were',
        'Are', 'Is', 'Be', 'Been', 'Have', 'Has', 'Had', 'Will', 'Would', 'Could',
        'Should', 'Can', 'May', 'Might', 'Must', 'Let', 'Get', 'Got', 'Go', 'Come',
        'Say', 'Said', 'See', 'Look', 'Know', 'Think', 'Take', 'Make', 'Give',
    ];

    // A record's own id is written in snake_case ("giulio_andreotti"), a
    // sentence writes the same person out in words, and either spelling has to
    // be recognized: both are registered, and the id is registered as it stands
    // as well, since a generated line can quote one verbatim.
    function _idSpellings(id) {
        const raw = String(id == null ? '' : id).trim();
        if (!raw) return [];
        if (raw.indexOf('_') < 0) return [raw];
        const spaced = raw.split('_')
            .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
            .join(' ');
        return [raw, spaced];
    }

    // Everything the world itself knows a name for: nations, hyperpowers,
    // factions, parties, settlements, destinations and the people who lead
    // them. The party's own members are NOT in here: they are marked in a line
    // like any other name (see _nameRoster) but nobody picks up a rumour by
    // hearing their travelling companion's name said out loud.
    function _worldRoster() {
        const names = new Set();
        const add = v => {
            const name = String(v == null ? '' : v).trim();
            if (name.length < 2 || name.length > 48) return;
            if (!/^[\wÀ-ÿ].*[\wÀ-ÿ]$/.test(name)) return;
            if (NAME_STOPWORDS.includes(name)) return;
            names.add(name);
        };
        try { Object.keys($gameSystem?._npcSociety || {}).forEach(add); } catch (e) {}
        try { Object.keys($gameSystem?._npcMapGroups || {}).forEach(add); } catch (e) {}
        try { (window.NPCPolitics?.listPowers?.() || []).forEach(add); } catch (e) {}
        try { Object.keys(window.WorldGen?.Hyperpowers?.hyperpowers || {}).forEach(add); } catch (e) {}
        try {
            Object.values(window.WorldGen?.Countries || {}).forEach(c => add(c && c.country));
        } catch (e) {}
        try {
            ($gameFactions?.getAllFactions?.() || []).forEach(f => add(f && f.name));
        } catch (e) {}
        try {
            Object.entries(window.WorldGen?.Leaders || {}).forEach(([id, leader]) => {
                add(leader && leader.name);
                _idSpellings(id).forEach(add);
            });
        } catch (e) {}
        try { Object.keys(window.WorkSystem?.Destinations || {}).forEach(add); } catch (e) {}
        try {
            Object.values($gameSystem?._npcPolitics?.powers || {}).forEach(power => {
                (power?.parties || []).forEach(party => add(party && party.name));
                Object.values(power?.politicians || {}).forEach(pol => add(pol && pol.name));
            });
        } catch (e) {}
        try {
            Object.entries(window.WorldGen?.Parties || {}).forEach(([country, roster]) => {
                if (!Array.isArray(roster)) return;
                roster.forEach(party => add(party && party.name));
            });
        } catch (e) {}
        return names;
    }

    function _nameRoster() {
        const names = _worldRoster();
        const add = v => {
            const name = String(v == null ? '' : v).trim();
            if (name.length < 2 || name.length > 48) return;
            if (!/^[\wÀ-ÿ].*[\wÀ-ÿ]$/.test(name)) return;
            if (NAME_STOPWORDS.includes(name)) return;
            names.add(name);
        };
        try { ($gameParty?.allMembers?.() || []).forEach(a => add(a && a.name && a.name())); } catch (e) {}
        return names;
    }

    // The roster only changes when somebody joins the party, an NPC is minted
    // or a settlement is registered, so the pattern is rebuilt off that count
    // rather than on every line spoken.
    let _nameRegex = null;
    let _nameSig   = null;
    let _worldNames = null;

    function _nameSignature() {
        let party = '';
        try { party = ($gameParty?.allMembers?.() || []).map(a => a && a.name && a.name()).join(','); } catch (e) {}
        const npcs   = Object.keys($gameSystem?._npcSociety   || {}).length;
        const groups = Object.keys($gameSystem?._npcMapGroups || {}).length;
        return party + '|' + npcs + '|' + groups;
    }

    function _nameMatcher() {
        const sig = _nameSignature();
        if (_nameRegex && sig === _nameSig) return _nameRegex;
        _nameSig = sig;
        _worldNames = _worldRoster();
        const names = Array.from(_nameRoster()).sort((a, b) => b.length - a.length);
        if (!names.length) { _nameRegex = null; return null; }
        const alts = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        _nameRegex = new RegExp('\\b(' + alts + ')\\b', 'g');
        return _nameRegex;
    }

    // Mark every name the world knows in a spoken line. What is already marked
    // (a topic, a name marked by an earlier pass) is stepped over rather than
    // marked again, so nothing is ever nested.
    function highlightNames(text) {
        const line = String(text == null ? '' : text);
        if (!line) return line;
        const re = _nameMatcher();
        if (!re) return line;
        const marked = new RegExp('(' + NAME_OPEN + '[^' + NAME_CLOSE + ']*' + NAME_CLOSE + ')');
        return line.split(marked).map(part => {
            if (!part || part.charAt(0) === NAME_OPEN) return part || '';
            re.lastIndex = 0;
            return part.replace(re, m => { rememberRumor(m); return NAME_OPEN + m + NAME_CLOSE; });
        }).join('');
    }

    // A name the world knows, said out loud where the party can hear it, is
    // worth remembering even when nobody has written a codex page for it. The
    // Rumors shelf of the Archive is the list of them (UI/HelpMenu.js), and the
    // Empathize wiki answers for the ones that turn out to be a nation, a
    // hyperpower, a faction, a party or a leader. It belongs to the savegame,
    // not to the world: it is what THIS party has heard.
    function rememberRumor(name) {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return false;
        if (!_worldNames || !_worldNames.has(name)) return false;
        if (!$gameSystem._helpRumors) $gameSystem._helpRumors = {};
        if ($gameSystem._helpRumors[name]) return false;
        $gameSystem._helpRumors[name] = true;
        return true;
    }

    // Teach the party every [Topic] a line carries and mark it for the box.
    // Anything added straight to $gameMessage (a rumour, an exchange step, a
    // story line) goes through here, since only the messageBuffer path is read
    // by processMessageBuffer.
    function markKeywords(text) {
        const line = String(text == null ? '' : text);
        if (!line) return line;
        if (line.indexOf('[') < 0) return markNamedTopics(line);
        announceKeywords(learnKeywords(line));
        return markNamedTopics(
            line.replace(keywordRe(), (_m, inner) => NAME_OPEN + splitKeyword(inner).display + NAME_CLOSE)
        );
    }

    // A spoken line as the box should print it: its topics taught and marked,
    // then every name the world knows marked around them.
    function markSpokenLine(text) {
        return highlightNames(markKeywords(text));
    }

    function stripNameMarks(text) {
        return String(text == null ? '' : text).split(NAME_OPEN).join('').split(NAME_CLOSE).join('');
    }

    window.DialogueNames = {
        OPEN: NAME_OPEN,
        CLOSE: NAME_CLOSE,
        highlight: highlightNames,
        mark: markSpokenLine,
        strip: stripNameMarks,
        roster: _nameRoster,
        worldRoster: _worldRoster,
    };

    // The same reading, for a panel that paints its own HTML rather than
    // handing a line to the message box. The Empathize log speaks: what an NPC
    // answers there teaches a topic exactly as a line in the box does, and the
    // popup fires over the open panel. A thought bubble drifting over somebody
    // in the street is not somebody speaking TO the party, so nothing routed
    // through here is fed one.
    window.DialogueTopics = {
        // The line as it should be READ: topics taught and marked, every name
        // the world knows marked around them.
        mark: markSpokenLine,
        // The same, escaped and wrapped in the spans a DOM panel paints gold.
        html(text) {
            const marked = markSpokenLine(String(text == null ? '' : text));
            const escaped = marked
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            return escaped
                .split(NAME_OPEN).join('<span class="msg-keyword">')
                .split(NAME_CLOSE).join('</span>');
        },
        displayName: topicDisplayName,
        // What this party has heard named but has no page for.
        rumors() {
            try { return Object.keys($gameSystem._helpRumors || {}); } catch (e) { return []; }
        },
    };

    // -------------------------------------------------------------------------
    // NPC Exchange: a two-line VN beat played out on the map
    // -------------------------------------------------------------------------
    // A short player-line/NPC-line exchange, shown one bust at a time through
    // the same right-side slot showCustomBust already uses, alternating between
    // the speaking party member and the NPC. Driven from terminateMessage
    // (see above) rather than the interpreter's own command list, so it works
    // from a single plugin command call instead of two authored "Show Text"
    // commands.
    let _npcExchangeQueue = [];

    function advanceNPCExchange() {
        const scene = SceneManager._scene;
        const bm    = scene && scene._bustManager;
        if (!bm) { _npcExchangeQueue = []; return; }
        if (!_npcExchangeQueue.length) {
            bm.exchangeMode      = false;
            bm.batchDialogueMode = false;
            bm.hideBusts();
            bm.setStoryMode(false);
            return;
        }
        const step = _npcExchangeQueue.shift();
        bm.showCustomBust(step.imageName, step.displayName, step.side);
        $gameMessage.setBackground(0);
        $gameMessage.setPositionType(2);
        window.skipLocalization = true;
        $gameMessage.add(markSpokenLine(step.text));
        window.skipLocalization = false;
    }

    // -------------------------------------------------------------------------
    // Faceless boxes: a run of lines with nobody drawn beside them
    // -------------------------------------------------------------------------
    // An exchange needs a stage and a stage needs a bust manager, which a
    // battle has none of. A voice that has to be heard there (the combat
    // tutorial) is queued as plain boxes instead: one line per box, dealt out
    // of the same terminateMessage the exchange is dealt out of, with no
    // portrait and no name tag drawn over the field.
    let _facelessQueue = [];

    function facelessIsRunning() {
        return _facelessQueue.length > 0;
    }

    function advanceFacelessMessage() {
        if (!_facelessQueue.length) return false;
        const text = _facelessQueue.shift();
        $gameMessage.setBackground(0);
        $gameMessage.setPositionType(2);
        window.skipLocalization = true;
        $gameMessage.add(markSpokenLine(text));
        window.skipLocalization = false;
        return true;
    }

    // Every line is dealt out over as many boxes as it needs, the same way a
    // story step is.
    function sayFaceless(lines) {
        const list = (Array.isArray(lines) ? lines : [lines])
            .map(line => resolveStoryKeys(line))
            .filter(line => String(line || '').trim().length > 0);
        if (!list.length) return false;
        _facelessQueue = list.reduce((all, line) => all.concat(paginateMessage(line)), []);
        return advanceFacelessMessage();
    }

        // The portrait file of whoever is at the head of the party, named the way
    // showCustomBust files it. A conversation is always between the leader and
    // somebody else, so the left of the stage belongs to them even in a beat
    // they never speak in (a rumour the NPC gives on their own).
    function leaderBustName() {
        const H     = window.NPCEmpathize?._helpers;
        const actor = $gameParty && $gameParty.leader ? $gameParty.leader() : null;
        const full  = H?._resolveBustForActor ? H._resolveBustForActor(actor) : 'img/busts/7.png';
        return String(full).replace(/^img\/busts\//, '').replace(/\.png$/, '');
    }

    // `story` stages the whole exchange the way a story script is staged: the
    // two speakers standing on either side of the box for the whole of it, the
    // one who is not talking dimmed rather than taken away.
    // The stage has two places and they are sides, not turns: the party stands
    // on the left and whoever they are talking to on the right, whichever of
    // them opens. Each is named by the same key showCustomBust files its
    // portrait under. A scene with more than two voices falls back to the order
    // they first speak in, since sides cannot seat three.
    function exchangeCast(steps) {
        const keyed = step => ({ key: `custom_${step.imageName}`, imageName: step.imageName, side: step.side });
        const uniq  = [];
        for (const step of steps) {
            const entry = keyed(step);
            if (!uniq.some(c => c.key === entry.key)) uniq.push(entry);
        }
        if (uniq.length > 2) return uniq;
        const left  = steps.find(s => s.side === 'left');
        const right = steps.find(s => s.side === 'right');
        // Two people who both count as party members (Em asking Bubba, who
        // walks with her) are both read as speaking from the left. Sides are
        // places on a stage, not a property of the speaker: whenever the scene
        // has two voices they take one end each, in the order they first talk.
        if (uniq.length === 2) {
            // The leader keeps the left end whichever of the two opens.
            const leaderKey = `custom_${leaderBustName()}`;
            return uniq[1].key === leaderKey ? [uniq[1], uniq[0]] : uniq;
        }
        if (!left && !right) return uniq;
        // Only one of them talks: a rumour the NPC passes on, or a line the
        // party says to nobody. Nobody is stood opposite them for it. Two
        // portraits mean two voices, so the leader is only put on stage when
        // the leader actually answers.
        return [left, right].filter(Boolean).map(keyed);
    }

    // A step whose line is longer than the box is dealt out over as many
    // boxes as it needs, each one still spoken by the same portrait.
    function paginateSteps(steps) {
        const out = [];
        for (const step of steps) {
            const pages = paginateMessage(step.text);
            if (pages.length < 2) { out.push(step); continue; }
            pages.forEach(text => out.push(Object.assign({}, step, { text })));
        }
        return out;
    }

    // Every exchange is staged the way a story scene is: both speakers stand
    // on either side of the box for the whole of it and the one who is not
    // talking is dimmed, rather than one portrait appearing at a time.
    // A scene can be raised while the box that raised it is still on screen:
    // the Ask board runs its callback with the choice window still open, and a
    // plugin command runs with the event's own message still closing. The
    // clear that follows that box would swallow the first line of the scene,
    // which is why the opening line used to be missing. So the exchange is
    // armed but not spoken until the message is free, and the exchange flags
    // are only raised then, so the closing box cannot advance the queue on its
    // way out either.
    const EXCHANGE_WAIT_MS    = 16;
    const EXCHANGE_WAIT_TRIES = 180; // ~3 seconds, then it plays regardless

    function startNPCExchange(steps, story) {
        const scene = SceneManager._scene;
        const bm    = scene && scene._bustManager;
        if (!bm || !steps || !steps.length) return false;
        _npcExchangeQueue = paginateSteps(steps);
        const begin = tries => {
            const stage = SceneManager._scene && SceneManager._scene._bustManager;
            if (!stage) { _npcExchangeQueue = []; return; }
            const busy = typeof $gameMessage !== 'undefined' && $gameMessage
                && typeof $gameMessage.isBusy === 'function' && $gameMessage.isBusy();
            if (busy && tries < EXCHANGE_WAIT_TRIES) {
                setTimeout(() => begin(tries + 1), EXCHANGE_WAIT_MS);
                return;
            }
            stage.setStoryMode(true);
            stage.setStoryCast(exchangeCast(steps));
            stage.exchangeMode      = true;
            stage.batchDialogueMode = true;
            advanceNPCExchange();
        };
        begin(0);
        return true;
    }

    // The bust image an NPC event shows normally (same resolution showBusts()
    // would use), read out manually since exchangeMode skips that call.
    function _npcExchangeBust(ev) {
        const scene = SceneManager._scene;
        const bm    = scene && scene._bustManager;
        const data  = ev?.event?.();
        const page  = data?.pages?.find(p => ev.meetsConditions(p));
        const path  = bm ? bm.getBustImageForCharacter(page?.image?.characterName, page?.image?.characterIndex ?? 0) : null;
        return path ? path.replace(/^busts\//, '') : '7';
    }

    // One step of an exchange. The party always speaks from the left of the
    // screen and the NPC always answers from the right, whichever of them
    // opened the conversation, so a beat reads as two people facing each other.
    function playerStep(actor, text) {
        const H    = window.NPCEmpathize?._helpers;
        const full = H?._resolveBustForActor ? H._resolveBustForActor(actor) : 'img/busts/7.png';
        return {
            imageName: String(full).replace(/^img\/busts\//, '').replace(/\.png$/, ''),
            displayName: actor ? actor.name() : '',
            text,
            side: 'left',
        };
    }

    function npcStep(ev, npcName, text) {
        const bm = SceneManager._scene?._bustManager;
        return {
            imageName: _npcExchangeBust(ev),
            displayName: bm ? bm.getCharacterDisplayName(ev.eventId()) : npcName,
            text,
            side: 'right',
        };
    }

    // -------------------------------------------------------------------------
    // Em, Bubba, and the two of them to each other
    // -------------------------------------------------------------------------
    // Three banks in js/db/NPC/SocialLines.json answer for who is doing the
    // TALKING rather than for who is being talked to: `em`, how the world
    // treats the woman whose own memories were forged into the spear that
    // killed the Father; `bubba`, how it treats the man who handed everybody
    // the Liminal Engine back; and the pair, `em.bubba` and `bubba.em`, which
    // is the two of them with nobody else in the room.
    //
    // The Empathize panel has always read all three (_socialInteract). The map
    // talk did not, so the same townsman greeted her as a stranger in the
    // street and as the god-killer the moment the panel was opened, and the two
    // of them passed each other town gossip when the Rumors command was pointed
    // at either. Every builder below asks this one resolver, in the panel's own
    // order of precedence: the pair owns the exchange outright (the world's
    // opinion of either of them has nothing to do with it), then Em's stance,
    // then Bubba's admiration.
    // Winding each other up is time spent together and nothing else: a point of
    // standing, never a loss, whichever way the jab went. The same handful the
    // panel's own Bicker action pays (NPCEmpathize._bicker).
    const PAIR_BICKER_BOND_MIN = 1;
    const PAIR_BICKER_BOND_MAX = 3;
    const pairBickerBond = () => PAIR_BICKER_BOND_MIN +
        Math.floor(Math.random() * (PAIR_BICKER_BOND_MAX - PAIR_BICKER_BOND_MIN + 1));

    function talkLayer(ev, npcName, profile) {
        const H = window.NPCEmpathize?._helpers;
        const actor = (() => { try { return $gameParty.leader(); } catch (err) { return null; } })();
        if (!H || !actor || !npcName) return null;
        const pair = H._pairContext?.(actor, npcName, ev);
        if (pair) return pair;
        const em = H._emContext?.(profile, npcName, ev, actor);
        if (em) {
            // A stance is how the NPC answers HER, so it holds no voice for
            // her; hers is the `player` pool of the `em` block itself, one
            // register per tone, exactly where the panel reads it from
            // (_socialInteract: `_emDb().player?.[emTone]`). Talking to Bubba
            // is the exception: that stance is the pair bank, which carries
            // both voices.
            const own = em.data && em.data.player;
            return Object.assign({}, em, { voice: own || H._socialLines?.().em?.player || null });
        }
        return H._bubbaContext?.(actor) || null;
    }

    // What the talker says, in their own voice. `player` is keyed by tone where
    // the bank writes three registers for it (Em's, and both directions of the
    // pair) and is one flat pool where it writes one: Bubba deflects the same
    // modest way whatever was said to him.
    function layerPlayerLine(layer, tone) {
        const H = window.NPCEmpathize?._helpers;
        const pool = layer && (layer.voice || (layer.data && layer.data.player));
        if (!H || !pool) return '';
        return H._rand(Array.isArray(pool) ? pool : (pool[tone] || pool.neutral)) || '';
    }

    // What the other one says back, in that tone.
    function layerReplyLine(layer, tone) {
        const H = window.NPCEmpathize?._helpers;
        if (!H || !layer || !layer.data) return '';
        return H._rand(layer.data[tone] || layer.data.neutral) || '';
    }

    // How the other one opens: their greeting, or - for the pair, who have been
    // in the same camper for twelve years and greet each other by remarking on
    // the weather - a word about wherever the two of them are standing, when
    // the bank has one written for it (rain, a forest, a town, the small hours,
    // no money left).
    function layerGreetingLine(layer) {
        const H = window.NPCEmpathize?._helpers;
        if (!H || !layer || !layer.data) return '';
        const situation = layer.pair ? (H._pairSituationLine?.(layer.data) || '') : '';
        return situation || H._rand(layer.data.greeting) || '';
    }

    // What this exchange is worth. The pair keep one uncapped bond between them
    // and are on nobody's faction books for teasing each other, so whatever the
    // move was meant to cost, between those two it comes out the same way: up.
    function payLayer(layer, tone, delta) {
        const H = window.NPCEmpathize?._helpers;
        const mult = H?._stanceToneMult ? H._stanceToneMult(layer, tone) : 1;
        if (layer && layer.pair) {
            const bond = Math.round(Math.abs(delta) * mult);
            H?._addPairBond?.(bond);
            return bond;
        }
        return Math.round(delta * mult);
    }

    // Meeting somebody in the street is meeting them: the standing either of
    // them starts from is written on the first meeting wherever it happens, so
    // the panel opened afterwards displays what the street already decided.
    // Both halves are idempotent and gate on their own switch.
    function seedLayerMeeting(ev, npcName, profile) {
        const H = window.NPCEmpathize?._helpers;
        const actor = (() => { try { return $gameParty.leader(); } catch (err) { return null; } })();
        if (!H || !actor) return;
        try {
            H._emSeedFirstImpression?.(profile, npcName, ev);
            H._bubbaSeedFirstImpression?.(profile, actor);
        } catch (err) { /* no society profile to seed */ }
    }

    // A short, personality-flavoured beat between the party leader and an NPC,
    // picking one random action out of the same catalogue the Empathize panel's
    // Socialize submenu offers (praise, small talk, comment on weather, insult,
    // threaten, ...) and running it through the same tone/delta/personality
    // math _socialInteract uses (window.NPCEmpathize._helpers), so it reads as
    // the same system whether or not the panel was ever opened. Returns two
    // exchange steps (player line, then NPC line) or null if the pieces needed
    // aren't available.
    // The Socialize catalogue exactly as the panel's action row offers it
    // (NPCEmpathize._socialCatalog): the twelve tone-keyed interactions of the
    // bank, and with them the three entertainment moves - a story, a poem and a
    // joke - which are written in blocks of their own in SocialLines.json and
    // so were the three buttons on that row the street could never draw.
    function socialCatalog(db) {
        const out = (db.interactions || []).map(def => ({ id: def.id, def }));
        ['story', 'poem'].forEach(id => {
            const perf = db.performances && db.performances[id];
            if (perf) out.push({ id, perf });
        });
        if (db.jokes) out.push({ id: 'joke', joke: true });
        return out;
    }

    // Roll one catalogue move against this NPC with the panel's own maths
    // (_socialInteract): an interaction on its tone and on how often it has
    // been tried lately, a story or a poem on the NPC's personality lean and
    // their trait affinity with the performer, a joke on whether it lands at
    // all. Returns the two raw lines, the tone the stance banks answer in and
    // what the exchange is worth. An entertainment move has no tone of its own,
    // so it takes the sign of its own result, exactly as the panel reads it.
    function rollSocialMove(move, profile, actor, npcName) {
        const H = window.NPCEmpathize?._helpers;
        if (!H) return null;
        const db     = H._socialLines();
        const recent = H._countRecentInteractions ? H._countRecentInteractions(profile, 'social_' + move.id, 3) : 0;
        const mult   = tone => H._personalitySocialMult ? H._personalitySocialMult(profile, tone) : 1;
        let tone = '', delta = 0, playerLine = '', npcLine = '', sincere = true, subject = '';

        if (move.joke) {
            // The joke is built word by word out of the grammar in the bank, so
            // it comes out already in the language the game is played in.
            playerLine = H._genJoke ? H._genJoke() : '';
            if (Math.random() < Math.max(0.15, 0.7 - recent * 0.18)) {
                delta   = Math.round(Math.max(1, 5 - recent) * mult('positive'));
                npcLine = H._rand(Math.random() < 0.5 ? db.jokes?.landGood : db.jokes?.landGroan);
            } else {
                delta   = Math.round((recent >= 2 ? -(2 + recent) : -1) * mult('negative'));
                npcLine = H._rand(db.jokes?.flop);
                sincere = false;
            }
        } else if (move.perf) {
            const perf = move.perf;
            subject = window.RandomBookGenerator?.generateTitle?.() || T('Empathize.oldLegend');
            const lean   = (((profile?.personalityIndex ?? 0) % 7) - 3) * 2;
            const compat = Math.round((H._traitCompatBonus ? H._traitCompatBonus(profile, actor) : 0) / 10);
            const whim   = Math.floor(Math.random() * 11) - 5;
            const raw    = (perf.base || 5) + lean + compat + whim - recent * 2;
            if (raw > 0) {
                delta   = Math.max(1, Math.round(raw / 2 * mult('positive')));
                npcLine = H._rand(perf.good);
            } else {
                delta   = Math.min(-1, Math.round(raw / 2 * mult('negative')));
                npcLine = H._rand(perf.bad);
                sincere = false;
            }
            playerLine = H._rand(perf.player);
        } else {
            const def = move.def;
            tone       = def.tone;
            playerLine = H._rand(def.player);
            if (def.tone === 'positive') {
                delta = def.baseDelta - recent * Math.max(2, Math.ceil(def.baseDelta / 2.5));
                delta = Math.round(delta * mult('positive'));
                sincere = delta > 0;
                if (!sincere) delta = -Math.min(8, 2 + recent * 2);
            } else if (def.tone === 'neutral') {
                delta   = Math.max(0, (def.baseDelta || 1) - recent);
                delta   = Math.round(delta * mult('neutral'));
                sincere = delta > 0;
            } else { // negative
                delta   = def.baseDelta - Math.min(6, Math.max(0, recent - 1) * 2);
                delta   = Math.round(delta * mult('negative'));
                sincere = false;
            }
            const pool = def.tone === 'negative' ? def.responseBad : (sincere ? def.responseGood : def.responseBad);
            npcLine = H._rand(pool) || H._rand(def.responseGood) || H._rand(def.responseBad);
        }
        // A story, a poem and a joke are content the talker chose rather than a
        // register they spoke in, which is why the stance banks below answer
        // them without taking the line away (the panel does the same).
        return { id: move.id, tone, delta, playerLine, npcLine, sincere, subject, perf: !!(move.perf || move.joke) };
    }

    function buildSocialExchange(ev, npcName, profile) {
        const EM = window.NPCEmpathize;
        const H  = EM && EM._helpers;
        if (!H || !H._socialLines || !H._rand) return null;

        const actor   = $gameParty.leader();
        const actorId = actor && actor.actorId();
        // A beast at the head of the party has no prose to trade, only the
        // feral bank the old rumour path already knows how to read from.
        if (H._isNonSentientActor && H._isNonSentientActor(actor)) return null;
        const db  = H._socialLines();
        const cat = socialCatalog(db);
        if (!cat.length) return null;
        const move = cat[Math.floor(Math.random() * cat.length)];
        const roll = rollSocialMove(move, profile, actor, npcName);
        if (!roll) return null;
        // The move as the rest of this builder reads it: its own pools where it
        // has them, and the tone the stance banks answer in - the move's own
        // where it has one, the sign of the result where it has not.
        const def = Object.assign({}, move.def, {
            id: roll.id,
            tone: roll.tone || (roll.delta >= 0 ? 'positive' : 'negative'),
        });
        const sincere = roll.sincere;
        let delta     = roll.delta;

        const fill       = s => vary(String(s || '')
            .replace(/\{name\}/g, npcName)
            .replace(/\{subject\}/g, roll.subject || ''));
        // Em says it in her words, Bubba in his, and the two of them to each
        // other in theirs; anybody else says the move's own line. What the
        // talker chose to perform is theirs either way: a joke, a story and a
        // poem keep the line they generated, which is the rule the panel plays
        // by too, so Em tells the joke she built rather than a stance line.
        const layer      = talkLayer(ev, npcName, profile);
        if (layer) seedLayerMeeting(ev, npcName, profile);
        const playerLine = (!roll.perf && fill(layerPlayerLine(layer, def.tone)))
            || fill(roll.playerLine);
        if (!playerLine) return null;

        // Dialogue mode option: markovian sources the NPC's half of the
        // exchange from their own Markov word bank instead of the templated
        // Socialize response pools below. The player's line, the busts and the
        // opinion math are unaffected either way. Falls through to the usual
        // banks if the NPC has no Markov database of their own.
        let npcLine;
        if (ConfigManager.dialogueMode === 'markovian') {
            npcLine = window.MarkovNPCDialogue?.generateLine?.(npcName) || '';
        }
        // Gossip's own payoff is a teaser ("Well, since you asked...") with
        // nothing to actually tell: when it lands, the real content comes out
        // of the Rumors bank (the same generic pool the old Rumors command
        // read from), tacked on after the teaser.
        if (!npcLine && def.id === 'gossip' && sincere) {
            const teaser = fill(H._rand(def.responseGood));
            const rumor  = pickRumor();
            npcLine = rumor ? (teaser ? `${teaser} ${rumor}` : rumor) : teaser;
        }
        if (!npcLine) npcLine = fill(roll.npcLine);
        // The stance owns the reply, the same way it does in the panel: praise
        // from the god-killer lands very differently on a zealot and on an
        // invasive fan, and neither of them sounds like the generic pool. It
        // beats the markovian dialogue mode too, since a written character has
        // no word bank to be generated out of.
        const layerBack = layer ? fill(layerReplyLine(layer, def.tone)) : '';
        if (layerBack) npcLine = layerBack;
        if (!npcLine) return null;
        npcLine = vary(npcLine);

        delta = payLayer(layer, def.tone, delta);
        if (profile && actorId != null && H._addNpcOpinion && !(layer && layer.pair)) {
            H._addNpcOpinion(profile, actorId, delta);
            (profile.eventLog ??= []).push({
                tag: 'social_' + def.id, desc: `${def.id} (${delta >= 0 ? '+' : ''}${delta})`, // i18n-ignore: event-log record id
                timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
            });
        }
        // Entertainment that landed is worth something to everybody who was
        // standing there, in the street exactly as in the panel: the party's
        // Fun meter and the NPC's own boredom. A move that is not
        // entertainment, or one that flopped, pays nobody and returns 0.
        H._payFun?.(actorId, profile, npcName, def.id, delta);

        EM.recordNPCLine?.(npcName, playerLine, 'player');
        EM.recordNPCLine?.(npcName, npcLine, 'npc');

        return [playerStep(actor, playerLine), npcStep(ev, npcName, npcLine)];
    }

    // The other half of the same beat: the NPC speaks first and the party
    // answers. It reads out of the same Socialize catalogue, with the roles
    // swapped - the NPC says the line the player would have said (addressed to
    // the party leader by name) and the leader answers with the reply pool -
    // so nothing new has to be written for an NPC to open a conversation.
    //
    // Which move they open with is not random: somebody who thinks well of the
    // leader greets them warmly, somebody who cannot stand them opens with an
    // insult, and everybody in between makes small talk.
    function buildNpcOpeningExchange(ev, npcName, profile) {
        const EM = window.NPCEmpathize;
        const H  = EM && EM._helpers;
        if (!H || !H._socialLines || !H._rand) return null;

        const actor   = $gameParty.leader();
        const actorId = actor && actor.actorId();
        // A person DOES speak to the animal at the head of the party, in their
        // own words, the way anybody talks to a dog. What changes is the
        // answer: the party has no sentence to give back, only the noise its
        // class makes (see the playerLine below).
        const beastLeader = !!(H._isNonSentientActor && H._isNonSentientActor(actor));

        const opinion = H._npcEffectiveOpinion ? H._npcEffectiveOpinion(profile, actor) : 0;
        const tones   = opinion >= 25 ? ['positive', 'neutral']
                      : opinion <= -25 ? ['negative', 'neutral']
                      : ['neutral', 'positive'];
        // The same catalogue the party picks from, read the other way round.
        // Somebody who cannot stand the leader does not stop them in the street
        // to recite a poem at them, so the entertainment moves are offered only
        // where the bucket is not the hostile one.
        const cat     = socialCatalog(H._socialLines());
        if (!cat.length) return null;
        const pool    = cat.filter(m => m.def ? tones.includes(m.def.tone) : !tones.includes('negative'));
        const choices = pool.length ? pool : cat;
        const move    = choices[Math.floor(Math.random() * choices.length)];
        // An entertainment move has no tone written on it, and somebody who
        // stops you to perform is approaching warmly, so it opens as one: the
        // NPC says the line the party would have said, and the party answers
        // out of the pools that bank keeps for a turn that landed or flopped.
        // The joke is built on the spot, the way it is on the other side.
        const subject = move.perf
            ? (window.RandomBookGenerator?.generateTitle?.() || T('Empathize.oldLegend')) : '';
        const def     = move.def || {
            id: move.id,
            tone: 'positive',
            baseDelta: move.perf ? (move.perf.base || 5) : 4,
            player: move.perf ? move.perf.player : [H._genJoke ? H._genJoke() : ''],
            responseGood: move.perf ? move.perf.good : H._socialLines().jokes?.landGood,
            responseBad:  move.perf ? move.perf.bad  : H._socialLines().jokes?.flop,
        };

        // The NPC's opener names the person they are talking to; the party's
        // answer names the person who just spoke to them.
        const fillNpc    = s => vary(String(s || '')
            .replace(/\{name\}/g, actor ? actor.name() : '').replace(/\{subject\}/g, subject));
        const fillPlayer = s => vary(String(s || '')
            .replace(/\{name\}/g, npcName).replace(/\{subject\}/g, subject));

        // Whoever the leader is, this is the beat where somebody walks up and
        // opens their mouth, so it is the one the greeting banks were written
        // for: the stance an NPC holds Em in, the admiration Bubba is met with,
        // or - between those two - a word about the weather and the road, which
        // is how twelve years of the same camper greet each other.
        const layer = talkLayer(ev, npcName, profile);
        if (layer) seedLayerMeeting(ev, npcName, profile);

        let npcLine = layer ? fillNpc(layerGreetingLine(layer)) : '';
        if (!npcLine && ConfigManager.dialogueMode === 'markovian') {
            npcLine = window.MarkovNPCDialogue?.generateLine?.(npcName) || '';
        }
        // Gossip reversed is the NPC fishing for news, and the party is the one
        // with something to tell: the rumour bank stays out of it here, since
        // an NPC passing one on is its own outcome of this command.
        if (!npcLine) npcLine = fillNpc(H._rand(def.player));
        if (!npcLine) return null;
        npcLine = vary(npcLine);

        const warm       = def.tone !== 'negative';
        let playerLine   = fillPlayer(layerPlayerLine(layer, warm ? 'positive' : 'negative'))
                        || fillPlayer(H._rand(warm ? def.responseGood : def.responseBad))
                        || fillPlayer(H._rand(def.responseGood));
        if (!playerLine) return null;
        // The beast's half of it. The line above is what a person would have
        // said back; what actually comes out is that line's worth of noise, in
        // the voice of the class the leader is played as.
        if (beastLeader) {
            playerLine = EM.growlFor(playerLine, actor && actor.name()) || playerLine;
        }

        // Being spoken to first moves the ledger less than being courted: the
        // NPC already knows how they feel, the answer only nudges it.
        const mult = tone => H._personalitySocialMult ? H._personalitySocialMult(profile, tone) : 1;
        let delta  = Math.round(Math.sign(def.baseDelta) * Math.ceil(Math.abs(def.baseDelta) / 3) * mult(def.tone));
        if (def.tone === 'neutral') delta = Math.max(0, delta);

        delta = payLayer(layer, def.tone, delta);
        if (profile && actorId != null && H._addNpcOpinion && !(layer && layer.pair)) {
            H._addNpcOpinion(profile, actorId, delta);
            (profile.eventLog ??= []).push({
                tag: 'npc_social_' + def.id, desc: `${def.id} (${delta >= 0 ? '+' : ''}${delta})`, // i18n-ignore: event-log record id
                timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
            });
        }
        // Being told a good one is as entertaining as telling it: the Fun meter
        // is paid whichever side of the exchange the performance came from.
        H._payFun?.(actorId, profile, npcName, def.id, delta);

        EM.recordNPCLine?.(npcName, npcLine, 'npc');
        EM.recordNPCLine?.(npcName, playerLine, 'player');

        return [npcStep(ev, npcName, npcLine), playerStep(actor, playerLine)];
    }

    // Who this event is, as far as the simulation is concerned. An NPC the
    // player has already met has a profile; one they have not is minted here,
    // exactly as opening the Empathize panel on them would (NPCEmpathizeUI
    // does the same thing on its first render), because without one there is
    // no personality to talk in and the command could only ever fall through
    // to the flat rumour. Only somebody wearing a walking sprite is minted: a
    // signpost or a tile-image prop is not a person and never gets a sheet.
    function ensureNpcProfile(ev, npcName) {
        const reg = window.NPCSocietyRegistry;
        if (!ev || !npcName || !reg) return null;
        const existing = reg.getProfile?.(npcName);
        if (existing || !reg.ensureProfile) return existing || null;
        const data = ev.event?.();
        const page = data?.pages?.find(p => ev.meetsConditions(p));
        if (!page?.image?.characterName) return null;
        const H = window.NPCEmpathize?._helpers;
        return reg.ensureProfile(npcName, H?._extractClassId ? H._extractClassId(ev) : null) || null;
    }

    // A full conversation, not a greeting: the same tone-weighted script two
    // NPCs play out when they meet in the street (NPCConversation's positive /
    // neutral / negative / political-debate banks), staged here with the party
    // leader standing in for one of the two speakers. The leader's half is
    // voiced by their own society profile when they have one, so an argument
    // about the banks or an election reads as a real back and forth rather
    // than a one-line pleasantry. The NPC closes on whatever is actually on
    // their mind, straight out of ThoughtProvider, which is where the politics,
    // the world web and their own cravings get a word in.
    function buildTopicalExchange(ev, npcName, profile) {
        const NC = window.NPCConversation;
        if (!NC || !NC.buildScript || !NC.resolveLine) return null;
        const EM = window.NPCEmpathize;
        const H  = EM && EM._helpers;

        const actor   = $gameParty.leader();
        const actorId = actor && actor.actorId();
        // A beast at the head of the party has no half of a debate to hold.
        if (!actor || (H?._isNonSentientActor && H._isNonSentientActor(actor))) return null;

        // Em and Bubba do not debate the banks at each other out of the town's
        // script bank. What they do instead is bicker, which is its own written
        // exchange (buildPairBickerExchange below).
        if (H?._pairContext?.(actor, npcName, ev)) return null;

        const leaderName    = actor.name();
        const leaderProfile = window.NPCSocietyRegistry?.getProfile?.(leaderName) || null;
        const script        = NC.buildScript(leaderProfile, profile, leaderName, npcName);
        const lines         = script && script.lines;
        if (!Array.isArray(lines) || !lines.length) return null;

        const persLeader = NC._personalityNameOf?.(leaderProfile);
        const persNpc    = NC._personalityNameOf?.(profile);
        const steps      = [];
        for (const entry of lines) {
            if (!Array.isArray(entry)) continue;
            const [who, raw] = entry;
            let text = NC.resolveLine(raw, leaderName, npcName);
            text = NC.applyVoice ? NC.applyVoice(text, who === 0 ? persLeader : persNpc) : text;
            if (!text) continue;
            if (who === 0) {
                steps.push(playerStep(actor, text));
                EM?.recordNPCLine?.(npcName, text, 'player');
            } else {
                steps.push(npcStep(ev, npcName, text));
                EM?.recordNPCLine?.(npcName, text, 'npc');
            }
        }
        if (!steps.length) return null;

        // Half the time they end on the thing they were chewing on anyway.
        if (Math.random() < 0.5) {
            const thought = NC.ThoughtProvider?.pickThought?.(profile);
            if (thought) {
                steps.push(npcStep(ev, npcName, NC.vary ? NC.vary(thought) : thought));
                EM?.recordNPCLine?.(npcName, thought, 'npc');
            }
        }

        // The same relationship swing the conversation manager applies when two
        // NPCs finish a chat of this kind, aimed at the leader instead.
        const swing = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
        let delta = script.kind === 'positive' ? swing(3, 8)
                  : script.kind === 'negative' ? -swing(2, 7)
                  : script.kind === 'debate'   ? (script.agreement ? swing(3, 8) : -swing(2, 7))
                  : 1;
        if (profile && actorId != null && H?._addNpcOpinion) {
            H._addNpcOpinion(profile, actorId, delta);
            if (profile.social !== undefined) profile.social = Math.min(100, profile.social + 20);
            (profile.eventLog ??= []).push({
                tag: 'conversation_' + script.kind, desc: `${script.kind} (${delta >= 0 ? '+' : ''}${delta})`, // i18n-ignore: event-log record id
                timestamp: Date.now(), gameMin: $gameVariables?.value(114) ?? 0,
            });
        }

        return steps;
    }

    // Standing and talking to somebody is what the social meter is for, and it
    // is paid whatever the exchange was about. Every other kind of talk pays it
    // through _addNpcOpinion, which has an opinion to move; a rumour has none,
    // so it pays the company on its own. A beast has no conversation to give
    // and pays nothing: window.NPCEmpathize answers which is which.
    function payCompany(ev, npcName) {
        const EM = window.NPCEmpathize;
        const H  = EM && EM._helpers;
        if (!npcName || !H || !H._gainSocialFromCompany) return;
        if (EM.isNonSentientNPC?.(npcName)) return;
        const actorId = $gameParty?.leader?.()?.actorId();
        if (actorId == null) return;
        H._gainSocialFromCompany(actorId, ensureNpcProfile(ev, npcName));
    }

    // The third thing that can happen: no social move at all, just the rumour
    // bank, spoken over the NPC's own bust like anything else they say. This is
    // also the whole of what a beast or an unregistered event has to offer.
    function buildRumorExchange(ev, npcName, profile) {
        const EM = window.NPCEmpathize;
        // Who is standing there is not lost on the person passing the rumour
        // on: they greet the god-killer, or the man who built the Liminal
        // Engine, and then they tell them what they heard. The two of them
        // between themselves have no town gossip to trade at all, so the
        // greeting - or a word about the road they are on - is the whole beat.
        const layer   = talkLayer(ev, npcName, profile ?? null);
        if (layer) seedLayerMeeting(ev, npcName, profile ?? null);
        const hello   = layer ? vary(String(layerGreetingLine(layer))
                                     .replace(/\{name\}/g, npcName || '')) : '';
        let line = pickRumor();
        if (layer && layer.pair) line = '';
        if (!line && !hello) return null;
        line = line ? vary(line) : '';
        // A non-sentient creature has no words, only a noise as long as the line
        // it would have spoken.
        if (line && npcName && EM?.isNonSentientNPC?.(npcName)) line = EM.growlFor(line, npcName) || line;
        const said = [hello, line].filter(Boolean).join(' ');
        if (npcName) EM?.recordNPCLine?.(npcName, said, 'npc');
        payCompany(ev, npcName);
        return [npcStep(ev, npcName, said)];
    }

    // The two of them, teasing. `bicker` is written as the exchange it is - a
    // line and the answer to it - so it needs no tone, no opinion and no
    // personality lookup: it is the only pair of people in the game who already
    // know exactly how the other one will take it. Whoever is leading says the
    // `player` half, the other one answers, and the bond goes up either way.
    function buildPairBickerExchange(ev, npcName, profile) {
        const EM = window.NPCEmpathize;
        const H  = EM?._helpers;
        const actor = (() => { try { return $gameParty.leader(); } catch (err) { return null; } })();
        if (!actor) return null;
        const beat = EM?.pairTalkBeat?.(actor);
        if (beat && beat.player && beat.reply) {
            const fill = s => vary(String(s || '').replace(/\{name\}/g, npcName || ''));
            const pText = fill(beat.player);
            const rText = fill(beat.reply);
            EM?.recordNPCLine?.(npcName, pText, 'player');
            EM?.recordNPCLine?.(npcName, rText, 'npc');
            payCompany(ev, npcName);
            if (beat.reverse) {
                return [npcStep(ev, npcName, rText), playerStep(actor, pText)];
            }
            return [playerStep(actor, pText), npcStep(ev, npcName, rText)];
        }
        if (!H) return null;
        const layer = H._pairContext?.(actor, npcName, ev);
        const rawBeat = layer && H._rand?.(layer.data.bicker);
        if (!rawBeat || !rawBeat.player || !rawBeat.reply) return null;
        const fill = s => vary(String(s || '').replace(/\{name\}/g, npcName || ''));
        const said = fill(rawBeat.player);
        const back = fill(rawBeat.reply);
        if (!said || !back) return null;
        EM?.recordNPCLine?.(npcName, said, 'player');
        EM?.recordNPCLine?.(npcName, back, 'npc');
        H._addPairBond?.(pairBickerBond());
        payCompany(ev, npcName);
        return [playerStep(actor, said), npcStep(ev, npcName, back)];
    }

    // -------------------------------------------------------------------------
    // Story scripts
    // -------------------------------------------------------------------------
    // A written scene is a markdown file in js/db/Dialogues, one per language
    // ("mainquest1_en.md", "mainquest1_it.md"), named to the plugin command
    // without that suffix. It is played out through the very same left/right
    // bust exchange two NPCs trade in the street, so a scripted scene and an
    // emergent one read as one system.
    //
    // One file holds as many scenes as the writer wants. A rule of dashes ends
    // the scene above it, and the first word under that rule names the scene
    // below ("intro", "new_year_eve", "em_name"): that word is what the plugin
    // command's Scene argument picks. A file with no rule in it is one unnamed
    // scene, and a command with no scene named plays the whole file in order.
    //
    // The format is what a writer would type anyway:
    //
    //     ------------------------------------------------------------
    //     intro
    //
    //     Bubba:
    //     Em! I finally found you!
    //     Speaking of God...
    //
    //     Em:
    //     Who are you?
    //
    // A line that is only a name and a colon opens a block; every line under it
    // is one message box in that character's voice. The name is the portrait:
    // "Bubba" shows img/busts/presets/Bubba.png. Writing "Bubba - AlienMindMaster"
    // keeps the name Bubba on the tag and draws AlienMindMaster out of img/busts
    // instead, for when a character is not wearing their usual face.
    //
    // The party speaks from the left of the screen and everybody else answers
    // from the right, the same rule sideForSpeaker applies everywhere else. The
    // protagonist keeps the left slot in a story script whatever the party
    // looks like at that point, so her portrait is on the left and her name tag
    // opposite it on the right from the very first scene, before she has any
    // party to be looked up in.
    const STORY_DIR = 'js/db/Dialogues/';
    const STORY_EXT = '.md';
    // i18n-ignore: an actor name matched at runtime, the same match
    // AutoIdleExplorer's story regroup makes.
    const STORY_PROTAGONIST = 'Em';
    // The travelling companion the Ask menu belongs to, matched the same way.
    const STORY_ASK_BUBBA   = 'Bubba';

    function storyReadPath(rel) {
        if (typeof Utils !== 'undefined' && Utils.isNwjs && Utils.isNwjs()) {
            try {
                const fs       = require('fs');
                const nodePath = require('path');
                const full     = nodePath.join(process.cwd(), rel);
                return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
            } catch (err) { return null; }
        }
        // Browser build: the scene has to be in hand before the first box is
        // queued, so this one read is synchronous.
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', rel, false);
            xhr.send();
            return (xhr.status === 0 || xhr.status < 400) ? xhr.responseText : null;
        } catch (err) { return null; }
    }

    function storyFileText(fileName, lang) {
        return storyReadPath(`${STORY_DIR}${fileName}_${lang}${STORY_EXT}`);
    }

    // "mainquest1", "mainquest1_en.md" and "mainquest1.md" all name the same
    // script; anything with a path in it names nothing.
    function storyBaseName(fileName) {
        return String(fileName == null ? '' : fileName).trim()
            .replace(/\.(md|txt)$/i, '')
            .replace(/_[a-z]{2}$/i, '');
    }

    // The scene in the player's language, falling back to the English original
    // when that language has not been written yet.
    function loadStoryScript(fileName) {
        const name = storyBaseName(fileName);
        if (!name || /[\/]/.test(name)) return null;
        const lang = (typeof ConfigManager !== 'undefined' && ConfigManager.language) || 'en';
        return storyFileText(name, lang) || (lang === 'en' ? null : storyFileText(name, 'en'));
    }

    // "Bubba" -> spoken and drawn as Bubba; "Bubba - AlienMindMaster" -> named
    // Bubba, drawn as AlienMindMaster.
    function parseStorySpeaker(raw) {
        const parts = String(raw || '').split(/\s+-\s+/);
        const name  = parts[0].trim();
        const bust  = (parts[1] || '').trim() || name;
        return { name, bust };
    }

    function storySide(name) {
        const bm = SceneManager._scene && SceneManager._scene._bustManager;
        if (String(name).trim() === STORY_PROTAGONIST) return 'left';
        if (bm && bm.sideForSpeaker(name) === 'left') return 'left';
        // The protagonist keeps the left slot even in a scene played before she
        // is walking with anybody, when the party lookup has nobody to match.
        try {
            const hero = $gameActors && $gameActors.actor(1);
            if (hero && hero.name && hero.name().trim() === String(name).trim()) return 'left';
        } catch (err) { /* no actors yet */ }
        return 'right';
    }

    // A scene written for the keyboard has to read right for a pad too, so a
    // script names a control rather than a key: "press [CONTINUE]" is resolved
    // at the moment the box is built, off whichever device the player last
    // touched (Input.lastInputDevice, MouseControls.js).
    // The pad faces are the ones rmmz_core's gamepadMapper actually binds: ok
    // is A, cancel B, shift X, menu Y, pageup/pagedown the shoulders.
    const STORY_KEYS = { // i18n-ignore: button faces, the same names printed on the hardware
        CONTINUE:    { keyboard: 'ENTER',       pad: 'A'           },
        OK:          { keyboard: 'ENTER',       pad: 'A'           },
        INTERACT:    { keyboard: 'ENTER',       pad: 'A'           },
        CANCEL:      { keyboard: 'ESC',         pad: 'B'           },
        BACK:        { keyboard: 'ESC',         pad: 'B'           },
        MENU:        { keyboard: 'ESC',         pad: 'Y'           },
        SPRINT:      { keyboard: 'SHIFT',       pad: 'X'           },
        SCROLLWHEEL: { keyboard: 'SCROLLWHEEL', pad: 'RIGHT STICK' },
        TAB:         { keyboard: 'TAB',         pad: 'L1/R1'       },
        MOVE:        { keyboard: 'WASD',        pad: 'LEFT STICK'  },
        LOOK:        { keyboard: 'MOUSE',       pad: 'RIGHT STICK' },
        MAP:         { keyboard: 'M',           pad: 'M'           },
        ZOOMIN:      { keyboard: 'E',           pad: 'R2'          },
        ZOOMOUT:     { keyboard: 'Q',           pad: 'L2'          },
        HOTBAR:      { keyboard: '1-5',         pad: 'D-PAD'       },
        QUICKSAVE:   { keyboard: 'F9',          pad: 'F9'          },
        QUICKLOAD:   { keyboard: 'F10',         pad: 'F10'         },
    };
    const STORY_KEY_TOKEN = /\[([A-Z]+)\]/g;

    function resolveStoryKeys(text) {
        const pad = (typeof Input !== 'undefined' && Input.lastInputDevice
            && Input.lastInputDevice() === 'pad');
        return String(text == null ? '' : text).replace(STORY_KEY_TOKEN, (whole, token) => {
            const entry = STORY_KEYS[token];
            // A key name is printed in the same gold a keyword gets, so the
            // button to press stands out of the line at a glance.
            return entry ? NAME_OPEN + (pad ? entry.pad : entry.keyboard) + NAME_CLOSE : whole;
        });
    }

    function storyStep(speaker, text) {
        return {
            imageName:   speaker.bust,
            displayName: speaker.name,
            text:        resolveStoryKeys(text),
            side:        storySide(speaker.name),
        };
    }

    // A speaker header is a name alone on its line ("Bubba:"), or a one-word
    // name with the line already started ("Em: ...nope."). Anything else with a
    // colon in it is prose - "Remember kiddo: love is the deepest oil deposit"
    // is a line Bubba says, not a character called Remember kiddo.
    const STORY_HEADER      = /^([^:]{1,60}):\s*$/;
    const STORY_HEADER_LINE = /^([A-Za-z][\w'.-]*(?:\s+-\s+[A-Za-z][\w'.-]*)?):\s+(\S.*)$/;

    // A rule of dashes closes the scene above it; the first word under the rule
    // is the name of the scene below. Returns the file cut into named blocks in
    // the order they were written, the text before the first rule kept under an
    // empty name so a file written without any rule still plays.
    const STORY_RULE = /^-{8,}\s*$/;

    // A line is the scene's title, not a line anybody says, when it sits
    // directly under the scene name and is not itself a speaker header.
    function isStoryTitleLine(line) {
        return !!line && !STORY_HEADER.test(line) && !STORY_HEADER_LINE.test(line);
    }

    function splitStoryScenes(text) {
        const scenes = [];
        let current  = { name: '', title: '', lines: [] };
        let awaiting = false; // the rule has been read, the name has not
        let titling  = false; // the name has been read, its title line has not
        for (const raw of String(text == null ? '' : text).split(/\r?\n/)) {
            const line = raw.trim();
            if (STORY_RULE.test(line)) {
                if (current.lines.length) scenes.push(current);
                current  = { name: '', title: '', lines: [] };
                awaiting = true;
                titling  = false;
                continue;
            }
            if (awaiting) {
                if (!line) continue;
                // The name is the first word on the line, so a writer may leave
                // themselves a note beside it.
                current.name = line.split(/\s+/)[0];
                awaiting = false;
                titling  = true;
                continue;
            }
            // The very next line under the name, and only that one, is the
            // scene's title: what the Ask menu offers it as. A blank line there
            // means the scene simply has no title.
            if (titling) {
                titling = false;
                if (isStoryTitleLine(line)) { current.title = line; continue; }
            }
            current.lines.push(raw);
        }
        if (current.lines.length) scenes.push(current);
        return scenes.map(sc => ({ name: sc.name, title: sc.title, text: sc.lines.join('\n') }));
    }

    // The scenes a script offers as { name, title } pairs, in written order.
    function storySceneList(fileName) {
        const text = loadStoryScript(fileName);
        return text ? splitStoryScenes(text).filter(sc => sc.name)
            .map(sc => ({ name: sc.name, title: sc.title || sc.name })) : [];
    }

    // The scenes a script offers, by name, in the order they were written.
    function storySceneNames(fileName) {
        const text = loadStoryScript(fileName);
        return text ? splitStoryScenes(text).map(sc => sc.name).filter(Boolean) : [];
    }

    // The text of one named scene, or the whole file when no scene was asked
    // for. A scene the player's language has not been written to yet is taken
    // from the English original rather than played as silence.
    function storySceneText(fileName, sceneName) {
        const wanted = String(sceneName == null ? '' : sceneName).trim();
        const text   = loadStoryScript(fileName);
        if (!wanted) return text;
        if (!text) return null;
        const pick = list => (list.find(sc => sc.name === wanted) || null);
        const hit  = pick(splitStoryScenes(text));
        if (hit) return hit.text;
        const en = storyFileText(storyBaseName(fileName), 'en');
        const fallback = en ? pick(splitStoryScenes(en)) : null;
        return fallback ? fallback.text : null;
    }

    function parseStoryScript(text) {
        const steps = [];
        let speaker = null;
        let naming  = false; // the rule has been read, its scene name has not
        let titling = false; // the scene name has been read, its title has not
        for (const raw of String(text == null ? '' : text).split(/\r?\n/)) {
            const line = raw.trim();
            // A rule and the scene name under it are furniture, never a line
            // anybody says: a whole file played at once steps over them.
            if (STORY_RULE.test(line)) { naming = true; titling = false; speaker = null; continue; }
            if (naming) {
                if (!line) continue;
                naming  = false;
                titling = true;
                continue;
            }
            // The title line under the scene name is furniture too.
            if (titling) {
                titling = false;
                if (isStoryTitleLine(line)) continue;
            }
            if (!line) continue;
            const alone = line.match(STORY_HEADER);
            if (alone) { speaker = parseStorySpeaker(alone[1]); continue; }
            const inline = line.match(STORY_HEADER_LINE);
            if (inline) {
                speaker = parseStorySpeaker(inline[1]);
                steps.push(storyStep(speaker, inline[2]));
                continue;
            }
            if (!speaker) continue; // stage directions before anybody speaks
            steps.push(storyStep(speaker, line));
        }
        return steps;
    }

    // The sheet Map/MapLegend.js pins to the corner of the map is not a topic
    // Bubba talks through: the tips half of it is one switch he flips, and he
    // is the only one who flips it, since the options page carries no row for
    // it. The controls list is not his: it is always pinned and H folds it.
    const STORY_SHEET_NOTICES  = 'sheet_notices';  // i18n-ignore: toggle name

    // The tips are not a switch but three states, so the entry says which one
    // it is standing on and picking it steps to the next.
    function storyNoticeModeLabel() {
        const mode = window.MapLegend?.noticesMode?.() || 'first'; // i18n-ignore: setting value
        return T('Dialogue.askNotice_' + mode);
    }

    function storyAskToggles() {
        if (!window.MapLegend) return [];
        return [
            { name: STORY_SHEET_NOTICES,
              title: `${T('Dialogue.askToggleNotices')}: ${storyNoticeModeLabel()}`,
              run: () => window.MapLegend?.cycleNoticesMode?.() },
        ];
    }

    function playStoryScript(fileName, sceneName) {
        const label = sceneName ? `${fileName}#${sceneName}` : fileName;
        const text  = storySceneText(fileName, sceneName);
        if (!text) { console.warn(`Story script not found: ${label}`); return false; }
        const steps = parseStoryScript(text);
        if (!steps.length) { console.warn(`Story script has no lines: ${label}`); return false; }
        // A scene is staged where the party is standing, so whoever wandered off
        // under the autopilot closes up before the first bust slides in.
        try { window.AutoIdleExplorer?.regroup?.forStory?.(); } catch (err) { /* no autopilot */ }
        return startNPCExchange(steps, true);
    }

    // -------------------------------------------------------------------------
    // Asking Bubba, telling Em
    // -------------------------------------------------------------------------
    // Em and Bubba are the only two who have this conversation, and only with
    // each other: walking as Em, Bubba is Asked; walking as Bubba, Em is Told.
    // Anybody else talking to either of them gets the ordinary exchange.
    //
    // What can be raised comes in two banks, offered side by side in a grid
    // rather than down a list:
    //
    //   - the fixed ones, always available, written in the askbubba script
    //   - the ones this place brings up, named by the map's MapInfos entry (or
    //     its own note) as <Bubba: new_year_eve,em_name> and written in the
    //     mainquest script
    const STORY_ASK_FILE   = 'mainquest';           // i18n-ignore: script file name
    const STORY_ASK_FIXED  = 'askbubba';            // i18n-ignore: script file name
    const STORY_ASK_TAG    = /<Bubba:\s*([^>]*)>/i; // i18n-ignore: map note tag
    // Story mode is switch 100 and nothing else: the title screen turns it on
    // when a story run starts and every other reader of it (Core/WorldManager.js,
    // CharacterCreation/CharacterCreationPresets.js, Map/MapLegend.js) asks this
    // one. Switch 75 is the map-tooltips setting written by Core/GameOptions.js,
    // off in a fresh game and turned off again whenever the player takes the map
    // notices away, so gating the board on it hid the whole of it.
    const STORY_ASK_SWITCH = 100;                   // story mode
    const STORY_ASK_COLS   = 2;                     // columns of the grid
    const STORY_ASK_MAX_COLS = 4;                   // as wide as the board goes

    // The board grows sideways rather than downwards: a couple of topics stand
    // in two columns, a script that has grown a long bank of them is dealt out
    // over as many as four, so the whole of it is on screen at once whatever
    // the writer adds.
    function storyAskCols(groups) {
        const most = (groups || []).reduce(
            (n, g) => (g.side ? n : Math.max(n, g.scenes ? g.scenes.length : 0)), 0);
        if (most <= 4)  return STORY_ASK_COLS;
        if (most <= 12) return 3;
        return STORY_ASK_MAX_COLS;
    }

    function storyAskNote(mapId) {
        const id = mapId || (typeof $gameMap !== 'undefined' && $gameMap ? $gameMap.mapId() : 0);
        let note = '';
        try {
            const info = typeof $dataMapInfos !== 'undefined' && $dataMapInfos ? $dataMapInfos[id] : null;
            if (info && info.note) note = String(info.note);
        } catch (err) { /* no map infos loaded */ }
        if (!note) {
            try {
                if (typeof $dataMap !== 'undefined' && $dataMap && $dataMap.note) note = String($dataMap.note);
            } catch (err) { /* no map loaded */ }
        }
        return note;
    }

    // Every scene of a script, tagged with the file it has to be played from.
    function storyAskBank(fileName) {
        return storySceneList(fileName).map(sc => ({ name: sc.name, title: sc.title, file: fileName }));
    }

    // The topics that are always there, in the order they were written.
    function storyAskFixedScenes() {
        return storyAskBank(STORY_ASK_FIXED);
    }

    // The scenes this map brings up, in the order the note lists them, each
    // with the title its script gives it. A name the script does not hold is
    // dropped rather than offered as a dead question.
    function storyAskScenes(mapId) {
        const hit = STORY_ASK_TAG.exec(storyAskNote(mapId));
        if (!hit) return [];
        const wanted = hit[1].split(',').map(w => w.trim()).filter(Boolean);
        if (!wanted.length) return [];
        const written = storyAskBank(STORY_ASK_FILE);
        return wanted
            .map(name => written.find(sc => sc.name === name))
            .filter(Boolean);
    }

    // What Bubba can teach again rather than tell: the combat tutorial, rearmed
    // for the next fight. It is his lesson, so it is only offered when he is the
    // one being asked, never when he is the one asking Em.
    function storyAskLessons() {
        if (storyAskPartner() !== STORY_ASK_BUBBA) return [];
        return [{
            name:   COMBAT_TUTORIAL_TOPIC,
            title:  T('Dialogue.askCombat'),
            // Saying so is what arms it, so the board closes on his answer
            // instead of coming straight back up.
            run:    rearmCombatTutorial,
            reopen: false,
        }];
    }

    // The banks as the grid draws them, empty ones left out.
    function storyAskGroups(mapId) {
        const groups  = [];
        const fixed   = storyAskFixedScenes();
        const here    = storyAskScenes(mapId);
        const sheet   = storyAskToggles();
        const lessons = storyAskLessons();
        if (fixed.length)   groups.push({ title: T('Dialogue.askGroupFixed'), scenes: fixed });
        if (here.length)    groups.push({ title: T('Dialogue.askGroupHere'),  scenes: here  });
        if (sheet.length)   groups.push({ title: T('Dialogue.askGroupSheet'), scenes: sheet, side: true });
        if (lessons.length) groups.push({ title: T('Dialogue.askGroupAgain'), scenes: lessons, side: true });
        return groups;
    }

    // Who is walking at the head of the party, by name.
    function storyAskLeaderName() {
        try {
            const leader = $gameParty && $gameParty.leader();
            return leader && leader.name ? leader.name().trim() : '';
        } catch (err) { return ''; }
    }

    // The one person the leader may raise these topics with: Em asks Bubba,
    // Bubba tells Em. Anybody else at the head of the party has no partner.
    function storyAskPartner(leaderName) {
        const leader = leaderName == null ? storyAskLeaderName() : String(leaderName).trim();
        if (leader === STORY_PROTAGONIST) return STORY_ASK_BUBBA;
        if (leader === STORY_ASK_BUBBA)   return STORY_PROTAGONIST;
        return null;
    }

    // Asking is Em's word for it; Bubba, who is the one who remembers, tells.
    function storyAskVerb() {
        return storyAskLeaderName() === STORY_ASK_BUBBA
            ? T('Dialogue.askTell') : T('Dialogue.askAsk');
    }

    // Only in a story-mode playthrough, and only with Em or Bubba leading.
    function isStoryAsker() {
        try {
            if (!$gameSwitches || !$gameSwitches.value(STORY_ASK_SWITCH)) return false;
            return !!storyAskPartner();
        } catch (err) { return false; }
    }

    function canAskStory(name, mapId) {
        if (!isStoryAsker()) return false;
        if (String(name || '').trim() !== storyAskPartner()) return false;
        return storyAskGroups(mapId).some(g => g.scenes.length > 0);
    }

    // The two of them are on stage while the topics are up, the same pair a
    // story scene stands there: the leader on the left, the one being asked on
    // the right and lit, so a question is put to a face rather than to a menu.
    function storyAskStage(partner) {
        const bm = SceneManager._scene && SceneManager._scene._bustManager;
        if (!bm || !partner) return;
        const cast = exchangeCast([
            { imageName: leaderBustName(), side: 'left' },
            { imageName: partner,          side: 'right' },
        ]);
        bm.setStoryMode(true);
        bm.setStoryCast(cast);
        bm.showCustomBust(partner, partner, 'right');
    }

    // Nothing was asked after all: the cast walks off the way it came on.
    function storyAskUnstage() {
        const bm = SceneManager._scene && SceneManager._scene._bustManager;
        if (!bm) return;
        bm.setStoryMode(false);
        bm.hideBusts();
    }

    // A toggle flipped from the board brings the board straight back, so both
    // halves of the sheet can be set in one visit and the entry that was picked
    // is redrawn saying what it now stands on. The old window has to be all the
    // way shut first: opening over a message that is still closing leaves the
    // two boards drawn on top of each other.
    function reopenStoryAsk(mapId) {
        const tick = () => {
            const busy = typeof $gameMessage !== 'undefined' && $gameMessage &&
                (($gameMessage.isBusy && $gameMessage.isBusy()) ||
                 ($gameMessage.isChoice && $gameMessage.isChoice()));
            if (busy) { setTimeout(tick, 16); return; }
            openStoryAsk(mapId);
        };
        setTimeout(tick, 16);
    }

    // The grid itself: the fixed topics under their heading, this place's
    // under theirs, Cancel on its own line at the end.
    function openStoryAsk(mapId) {
        const groups = storyAskGroups(mapId);
        if (!groups.length) return false;
        const scenes  = groups.reduce((all, g) => all.concat(g.scenes), []);
        const choices = scenes.map(sc => sc.title);
        choices.push(T('Dialogue.askCancel'));
        setChoiceGrid({
            cols:   storyAskCols(groups),
            groups: groups.map(g => ({ title: g.title, count: g.scenes.length, side: !!g.side })),
        });
        storyAskStage(storyAskPartner());
        $gameMessage.setChoices(choices, 0, choices.length - 1);
        $gameMessage.setChoiceCallback(choice => {
            const picked = scenes[choice];
            if (!picked) { storyAskUnstage(); return; }
            // A toggle is flipped where it stands and the grid comes straight
            // back up, so both halves of the sheet can be set in one visit.
            if (picked.run) {
                try { picked.run(); } catch (err) { /* no legend */ }
                // A switch brings the board back so the next one can be set;
                // an entry that answers out loud (reopen: false) does not.
                if (picked.reopen !== false) reopenStoryAsk(mapId);
                return;
            }
            playStoryScript(picked.file, picked.name);
        });
        return true;
    }

    // The other one of the pair, as an actor in the party.
    function storyAskPartnerActor() {
        const name = storyAskPartner();
        if (!name) return null;
        try {
            const inParty = $gameParty.members().find(a => a && a.name && a.name().trim() === name);
            if (inParty) return inParty;
            if (name === STORY_ASK_BUBBA && $gameSwitches && $gameSwitches.value(STORY_ASK_SWITCH)) {
                return window.PartyRoster?.getBubbaActor?.() || ($gameActors ? $gameActors.actor(2) : null);
            }
            return null;
        } catch (err) { return null; }
    }

    // Talk is the two of them saying something to each other that is not a
    // story beat: the ordinary party discussion, put on the same stage the Ask
    // uses, with the leader on the left and the one being talked to on the
    // right. Answers false when there is no bank to draw a discussion from.
    function storyAskTalk() {
        const leader  = (() => { try { return $gameParty.leader(); } catch (err) { return null; } })();
        const partner = storyAskPartnerActor();
        if (!leader || !partner) return false;
        // These two have banks of their own for talking to each other, so the
        // party's generic discussion is the fallback rather than the first
        // thing tried. Which of their interactions comes up is picked at
        // random, the same catalogue the Empathize panel offers between them:
        // the jab, any of the Socialize moves, or her raising Court and him
        // turning it down (js/db/NPC/SocialLines.json). pairBickerBeat is the
        // older, jab-only entry point and stands behind it.
        const EMP = window.NPCEmpathize;
        const jab = EMP?.pairTalkBeat?.(leader) || EMP?.pairBickerBeat?.(leader);
        if (jab) {
            const firstActor  = jab.reverse ? partner : leader;
            const secondActor = jab.reverse ? leader : partner;
            const firstText   = jab.reverse ? jab.reply : jab.player;
            const secondText  = jab.reverse ? jab.player : jab.reply;
            const said = playerStep(firstActor, firstText);
            const back = playerStep(secondActor, secondText);
            said.side = firstActor === leader ? 'left' : 'right';
            back.side = secondActor === leader ? 'left' : 'right';
            return startNPCExchange([said, back], true);
        }
        const beats = window.PartyBanter?.discussion?.([leader, partner]);
        if (!beats || !beats.length) return false;
        const cast  = [leader, partner];
        const steps = beats.map(beat => {
            const actor = cast[beat.who] || leader;
            const step  = playerStep(actor, beat.text);
            step.side   = actor === leader ? 'left' : 'right';
            return step;
        });
        return startNPCExchange(steps, true);
    }

    // Bubba walking with the party is not an event: talking to him at the
    // leader's shoulder offers the topics and his own sheet side by side, so
    // the Ask never swallows the Empathize panel. Story mode only, since that
    // is the only playthrough canAskStory answers for.
    // Opening either one is deferred a tick: the choice window is still
    // closing while the callback runs.
    function openStoryAskMenu(actorId, mapId) {
        if (!storyAskGroups(mapId).some(g => g.scenes.length > 0)) return false;
        const choices = [
            T('Dialogue.askTalk'),
            storyAskVerb(),
            T('Dialogue.askEmpathize'),
            T('Dialogue.askCancel'),
        ];
        storyAskStage(storyAskPartner());
        $gameMessage.setChoices(choices, 0, choices.length - 1);
        $gameMessage.setChoiceCallback(choice => {
            // Talk is played where it stands; if the party has nothing to say
            // the cast walks off rather than leaving two portraits waiting.
            if (choice === 0) setTimeout(() => { if (!storyAskTalk()) storyAskUnstage(); }, 0);
            else if (choice === 1) setTimeout(() => openStoryAsk(mapId), 0);
            else if (choice === 2) {
                storyAskUnstage();
                setTimeout(() => window.NPCEmpathize?.openForActor?.(actorId), 0);
            } else storyAskUnstage();
        });
        return true;
    }

    // The scenes are readable outside the plugin command too (a quest step, a
    // cutscene, the test harness).
    window.StoryDialogue = {
        load:   loadStoryScript,
        split:  splitStoryScenes,
        scenes: storySceneNames,
        list:   storySceneList,
        scene:  storySceneText,
        parse:  parseStoryScript,
        play:   playStoryScript,
        // The Ask (as Em) / Tell (as Bubba) grid, in story mode only.
        askScenes:  storyAskScenes,
        askFixed:   storyAskFixedScenes,
        askGroups:  storyAskGroups,
        askCols:    storyAskCols,
        askVerb:    storyAskVerb,
        askPartner: storyAskPartner,
        canAsk:     canAskStory,
        // The one switch the board answers to, so nothing has to guess at it.
        askSwitch:  STORY_ASK_SWITCH,
        ask:        openStoryAsk,
        askStage:   storyAskStage,
        // The layout the board was handed, readable until the window opens.
        pendingGrid: () => pendingChoiceGrid,
        // The Ask / Empathize / Cancel menu a party-member Bubba offers.
        askMenu:   openStoryAskMenu,
        askTalk:   storyAskTalk,
        // The sheet's own switches, offered in the grid beside the topics.
        askToggles: storyAskToggles,
        noticeModeLabel: storyNoticeModeLabel,
    };

    // -------------------------------------------------------------------------
    // The combat tutorial
    // -------------------------------------------------------------------------
    // The first fight of a story-mode playthrough with Bubba walking along is
    // the one place the commands can be explained by somebody who is standing
    // there: he offers, and the offer can be waved off, in which case the fight
    // carries on untouched. Shown once and never again on its own; the Ask board
    // rearms it for exactly one more fight (storyAskLessons above).
    //
    // Two lessons are written, because there are two fights: the ordinary one,
    // read off the command list, and the one played out on the map, where a
    // range and a cursor come into it (BattleSystem/MapBattleMode.js).
    //
    // No portrait: a battle draws none (see the Scene_Battle hooks), so the
    // whole lesson is faceless boxes with his name inline, the same way Eris
    // talks mid-fight.
    const COMBAT_TUTORIAL_TOPIC = 'combat';  // i18n-ignore: the entry's own name

    function combatTutorialWalksWithBubba() {
        try {
            if ($gameSwitches && $gameSwitches.value(STORY_ASK_SWITCH)) return true;
            return $gameParty.members().some(
                a => a && a.name && a.name().trim() === STORY_ASK_BUBBA);
        } catch (err) { return false; }
    }

    function isCombatTutorialArmed() {
        try { return !!$gameSystem._combatTutorialArmed; } catch (err) { return false; }
    }

    function wasCombatTutorialSeen() {
        try { return !!$gameSystem._combatTutorialSeen; } catch (err) { return false; }
    }

    // Rearmed by hand from the Ask board: he says so, and the next fight opens
    // with the offer again.
    function rearmCombatTutorial() {
        try { $gameSystem._combatTutorialArmed = true; } catch (err) { return false; }
        sayFaceless([T('Dialogue.combat.rearm')]);
        return true;
    }

    function shouldOfferCombatTutorial() {
        try {
            if (!$gameSwitches || !$gameSwitches.value(STORY_ASK_SWITCH)) return false;
        } catch (err) { return false; }
        if (!combatTutorialWalksWithBubba()) return false;
        return isCombatTutorialArmed() || !wasCombatTutorialSeen();
    }

    // The lesson for the fight that is actually being played.
    function combatTutorialLines() {
        const onMap = !!(window.MapBattleMode && window.MapBattleMode.isActive &&
                         window.MapBattleMode.isActive());
        const key   = onMap ? 'Dialogue.combat.map' : 'Dialogue.combat.normal';
        const lines = (typeof T === 'function' && T.list) ? T.list(key) : null;
        return Array.isArray(lines) ? lines.filter(Boolean) : [];
    }

    // The offer, then the lesson if it is taken. Either way the tutorial is
    // spent: waving it off is an answer, not a postponement.
    function offerCombatTutorial() {
        if (!shouldOfferCombatTutorial()) return false;
        const lines = combatTutorialLines();
        if (!lines.length) return false;
        try {
            $gameSystem._combatTutorialArmed = false;
            $gameSystem._combatTutorialSeen  = true;
        } catch (err) { /* no system yet */ }
        sayFaceless([T('Dialogue.combat.offer')]);
        const choices = [T('Dialogue.combat.yes'), T('Dialogue.combat.no')];
        $gameMessage.setChoices(choices, 0, 1);
        $gameMessage.setChoiceCallback(choice => {
            if (choice === 0) sayFaceless(lines);
        });
        return true;
    }

    // Both presentations open the round through BattleManager.startBattle: the
    // ordinary fight from Scene_Battle, the tactical one from MapBattleMode's
    // own opening, which has already raised isActive() by the time it calls.
    // The box is queued, not shown: BattleManager.isBusy() reads $gameMessage,
    // so the first round waits for the lesson wherever it is being read.
    if (typeof BattleManager !== 'undefined' && BattleManager) {
        const _BattleManager_startBattle_tutorial = BattleManager.startBattle;
        BattleManager.startBattle = function () {
            _BattleManager_startBattle_tutorial.call(this);
            try { offerCombatTutorial(); } catch (err) {
                console.error('[DialogueSystem] combat tutorial', err);
            }
        };
    }

    window.CombatTutorial = {
        shouldOffer: shouldOfferCombatTutorial,
        lines:       combatTutorialLines,
        offer:       offerCombatTutorial,
        rearm:       rearmCombatTutorial,
        isArmed:     isCombatTutorialArmed,
        wasSeen:     wasCombatTutorialSeen,
    };

    // -------------------------------------------------------------------------
    // Plugin Commands
    // -------------------------------------------------------------------------
    PluginManager.registerCommand(PLUGIN_NAME, "showBust", () => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) scene._bustManager.showBusts();
    });

    PluginManager.registerCommand(PLUGIN_NAME, "hideBusts", () => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) scene._bustManager.hideBusts();
    });

    PluginManager.registerCommand(PLUGIN_NAME, "batchDialogue", () => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) scene._bustManager.enableBatchDialogue();
    });

    PluginManager.registerCommand(PLUGIN_NAME, "playerBatchDialogue", () => {
        // Reserved for player-specific bust display
    });

    // Talking to an NPC. Three things can happen, one of them at random, and
    // all three are played out as a bust exchange through the same right/left
    // slots a scripted conversation uses: the NPC opens and the party answers,
    // the party opens and the NPC answers, or the NPC passes on a rumour. The
    // flat, faceless message box the command used to draw is gone; it survives
    // only where there is no bust manager to draw into (a scene that is not the
    // map), which is the one case none of the three can be staged.
    function playNpcTalk() {
        const evId = this._eventId;
        const ev   = evId ? $gameMap.event(evId) : null;
        if (ev) ev.turnTowardPlayer();

        const npcName = _npcNameForEvent(ev);
        // Bubba standing as an event on a <Bubba: ...> map is asked, not
        // chatted with: the map's scenes are the whole of what he has to say.
        if (canAskStory(npcName) && openStoryAsk()) return true;
        const EM      = window.NPCEmpathize;
        const profile = ensureNpcProfile(ev, npcName);
        const sentient = !!(profile && profile.personalityIndex != null && !EM?.isNonSentientNPC?.(npcName));
        const bm      = SceneManager._scene?._bustManager;

        if (ev && bm) {
            // A beast or an unregistered event (a cat, a signpost, a body
            // double) has no Socialize catalogue behind it and only ever has
            // the rumour to give. For everybody else the plain rumour is the
            // exception, one talk in four; the rest of the time the exchange is
            // a proper conversation, the multi-beat scripts two NPCs trade,
            // with the greeting-sized social beats behind them as the fallback.
            let builders;
            // Em standing in front of Bubba, or Bubba in front of Em, is not a
            // person meeting a townsman: there is no rumour to pass, no opinion
            // to move and no debate to hold, only the two of them. They bicker,
            // they greet each other by remarking on the weather, or one of them
            // says something and the other answers it - all three out of the
            // pair banks (buildPairBickerExchange, and the layer inside the two
            // builders below).
            const pair = !!talkLayer(ev, npcName, profile)?.pair;
            if (pair) {
                const beats = [
                    () => buildPairBickerExchange(ev, npcName, profile),
                    () => buildSocialExchange(ev, npcName, profile),
                    () => buildNpcOpeningExchange(ev, npcName, profile),
                ];
                // Whichever of the three comes up first; the other two are
                // still there behind it if that one has nothing written.
                for (let i = beats.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [beats[i], beats[j]] = [beats[j], beats[i]];
                }
                builders = [...beats, () => buildRumorExchange(ev, npcName, profile)];
            } else if (!sentient || !EM || Math.random() < RUMOR_CHANCE) {
                builders = [() => buildRumorExchange(ev, npcName, profile)];
                if (sentient && EM) {
                    builders.push(() => buildNpcOpeningExchange(ev, npcName, profile));
                    builders.push(() => buildSocialExchange(ev, npcName, profile));
                }
            } else {
                const beats = [
                    () => buildNpcOpeningExchange(ev, npcName, profile),
                    () => buildSocialExchange(ev, npcName, profile),
                ];
                if (Math.random() < 0.5) beats.reverse();
                builders = [() => buildTopicalExchange(ev, npcName, profile), ...beats,
                            () => buildRumorExchange(ev, npcName, profile)];
            }
            // A builder that has nothing written to work with returns null
            // before it moves anything, so falling through to the next one
            // costs nothing.
            for (const build of builders) {
                const steps = build();
                // Staged the way a written scene is: everybody who speaks in
                // it on stage from the first line, the listener dimmed. A beat
                // the leader answers in is two portraits; a rumour nobody
                // answers is the NPC alone.
                if (steps && startNPCExchange(steps, true)) {
                    this.setWaitMode('message');
                    return true;
                }
            }
        }

        // Nowhere to stage a bust: the bare line, so the NPC is never mute. The
        // voices still hold here - it is the portraits there is no room for,
        // not the person - so whoever is talking is greeted as themselves.
        const bareLayer = talkLayer(ev, npcName, profile);
        const bareHello = bareLayer
            ? vary(String(layerGreetingLine(bareLayer)).replace(/\{name\}/g, npcName || ''))
            : '';
        let line = (bareLayer && bareLayer.pair) ? '' : pickRumor();
        line = [bareHello, line].filter(Boolean).join(' ');
        // Nothing at all to say: the caller is told so, since an older event
        // that came in through the Markov command still has its own line to
        // fall back on.
        if (!line) return false;
        if (npcName && EM?.isNonSentientNPC?.(npcName)) line = EM.growlFor(line, npcName) || line;
        if (npcName) EM?.recordNPCLine?.(npcName, line);
        payCompany(ev, npcName);

        $gameMessage.setBackground(0);
        $gameMessage.setPositionType(2);
        // The bank is already in the player's language; the string-for-string
        // translation pass would only try to match it again.
        window.skipLocalization = true;
        $gameMessage.add(markSpokenLine(line));
        window.skipLocalization = false;
        this.setWaitMode('message');
        return true;
    }

    PluginManager.registerCommand(PLUGIN_NAME, "Rumors", playNpcTalk);

    // The one way an NPC is talked to. Events minted at runtime (the
    // procedural NPC slots in NPC/NPCSystem.js, the Bologna ones) and the
    // handful of map events still carrying the old Markov command reach the
    // same staging through here, so Options > Dialogue Mode is obeyed
    // wherever the talk started: empathize plays the written exchange, and
    // markovian only swaps the NPC's own half for a Markov line.
    window.NPCTalk = {
        play: interpreter => playNpcTalk.call(interpreter),
        // A two-bust beat raised from outside the interpreter. The map's own
        // menus (making a fuss of an animal, of the companion at heel) have no
        // event command list to speak through, and a line added from inside a
        // choice callback is wiped by the box closing over it: handing the two
        // lines here stages them the way a talked-to NPC is staged instead,
        // the party on the left and whoever answers on the right.
        exchange: steps => startNPCExchange(steps, true),
        playerStep: (actor, text) =>
            playerStep(actor || ($gameParty && $gameParty.leader ? $gameParty.leader() : null), text),
        eventStep: (ev, npcName, text) => npcStep(ev, npcName, text),
        // Somebody with no event behind them at all (the companion at heel is
        // a follower, not an event): the portrait is resolved off the sprite
        // sheet they walk in, the same lookup an event's own bust comes from.
        spriteStep(characterName, characterIndex, displayName, text) {
            const bm   = SceneManager._scene && SceneManager._scene._bustManager;
            const path = bm ? bm.getBustImageForCharacter(characterName, characterIndex || 0) : null;
            return {
                imageName: path ? String(path).replace(/^busts\//, '') : '7',
                displayName: displayName || '',
                text,
                side: 'right',
            };
        },
    };

    // A written scene, played out as a bust conversation.
    PluginManager.registerCommand(PLUGIN_NAME, "playStory", function (args) {
        if (playStoryScript(args && args.fileName, args && args.sceneName)) {
            this.setWaitMode('message');
        }
    });

    PluginManager.registerCommand(PLUGIN_NAME, "showCustomBust", (args) => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) scene._bustManager.showCustomBust(args.imageName, args.characterName);
    });

})();
