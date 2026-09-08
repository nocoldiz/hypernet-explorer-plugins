/*:
 * @target MZ
 * @plugindesc Adds mouse and keyboard control options to battle system
 * @author Omni-Lex
 * @help Mouse Battle Controls v1.1.0
 *
 * This plugin adds the following controls to the battle system:
 *
 * Mouse Controls:
 * - Left click on an enemy to execute the current selected command
 * - Right click to cycle to the next command in the command window
 * - Mouse wheel to scroll through available commands
 *
 * Keyboard Controls:
 * - Number keys 1-5 to select and execute the corresponding commands
 *   (For example, if Attack is the first command, pressing 1 will select Attack)
 *
 * No plugin parameters are required.
 *
 * Terms of Use:
 * Free for use in both commercial and non-commercial projects.
 */

(() => {
    'use strict';

    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        this.setupKeyboardInput();
    };

    Scene_Battle.prototype.setupKeyboardInput = function() {
        // Register number keys 1-5 as valid input methods
        Input.keyMapper[49] = "1"; // 1 key
        Input.keyMapper[50] = "2"; // 2 key
        Input.keyMapper[51] = "3"; // 3 key
        Input.keyMapper[52] = "4"; // 4 key
        Input.keyMapper[53] = "5"; // 5 key
    };    // Add number key handler function
    // Superseded by the battle hotbar (BattleSystemEnhancedHUD.js), which
    // casts the acting member's synced skills directly off 1-9. Leaving this
    // active would double-fire: it used to select+confirm whatever row sat
    // at that index in the currently active window, on the same keypress.
    Scene_Battle.prototype.handleNumberKeys = function() {};

    //=============================================================================
    // Mouse Input Extension
    //=============================================================================
    
    const _Scene_Battle_initialize = Scene_Battle.prototype.initialize;
    Scene_Battle.prototype.initialize = function() {
        _Scene_Battle_initialize.call(this);
        this._mouseTargetX = 0;
        this._mouseTargetY = 0;
        this._isRightMousePressed = false;
        this._lastRightMousePressed = false;
        this._clickedEnemyForSelection = null;
    };
    
    //=============================================================================
    // Handle Mouse Movement to Track Position
    //=============================================================================
    
    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update.call(this);
        this.updateMousePosition();
        this.updateMouseControls();
    };
    
    Scene_Battle.prototype.updateMousePosition = function() {
        this._mouseTargetX = TouchInput.x;
        this._mouseTargetY = TouchInput.y;
    };
    
    //=============================================================================
    // Mouse Control Functions
    //=============================================================================
    
    Scene_Battle.prototype.updateMouseControls = function() {
        // Handle right mouse button to cycle commands
        
        // Handle mouse wheel for command selection
        this.handleMouseWheel();
        
        // Handle number key presses (1-5)
        this.handleNumberKeys();
        
        // Left click is already handled by TouchInput.isTriggered()
        // But we'll enhance it for targeting enemies directly
        if (TouchInput.isTriggered()) {
            this.handleLeftClick();
        }
    };
    

    
    Scene_Battle.prototype.handleMouseWheel = function() {
        if (TouchInput.wheelY !== 0) {
            if (this._actorCommandWindow.active) {
                // Move up or down in the command list
                const direction = TouchInput.wheelY > 0 ? 1 : -1;
                const maxItems = this._actorCommandWindow.maxItems();
                let index = this._actorCommandWindow.index() + direction;
                
                // Wrap around the list
                if (index < 0) index = maxItems - 1;
                if (index >= maxItems) index = 0;
                
                this._actorCommandWindow.select(index);
                SoundManager.playCursor();
            } else if (this._partyCommandWindow.active) {
                // Handle mouse wheel for party command window
                const direction = TouchInput.wheelY > 0 ? 1 : -1;
                const maxItems = this._partyCommandWindow.maxItems();
                let index = this._partyCommandWindow.index() + direction;
                
                // Wrap around the list
                if (index < 0) index = maxItems - 1;
                if (index >= maxItems) index = 0;
                
                this._partyCommandWindow.select(index);
                SoundManager.playCursor();
            }
        }
    };
    
    Scene_Battle.prototype.handleLeftClick = function() {
        // If we're in the main command window and clicked on an enemy
        if (this._actorCommandWindow.active) {
            const selectedCommand = this._actorCommandWindow.currentSymbol();
            const clickedEnemy = this.getClickedEnemy();
            
            // Handle all command types that could target an enemy
            if (clickedEnemy !== null) {
                // For attack - directly process the command and select the enemy
                if (selectedCommand === 'attack') {
                    this._actorCommandWindow.processOk();
                    if (this._enemyWindow.active) {
                        const enemyIndex = $gameTroop.members().indexOf(clickedEnemy);
                        if (enemyIndex >= 0) {
                            this._enemyWindow.select(enemyIndex);
                            this._enemyWindow.processOk();
                        }
                    }
                }
                // For skills - process the command, waiting for skill selection
                else if (selectedCommand === 'skill') {
                    this._actorCommandWindow.processOk();
                    // Store clicked enemy for later use
                    this._clickedEnemyForSelection = clickedEnemy;
                }
                // For items - process the command, waiting for item selection
                else if (selectedCommand === 'item') {
                    this._actorCommandWindow.processOk();
                    // Store clicked enemy for later use
                    this._clickedEnemyForSelection = clickedEnemy;
                }
                // For guard/defend - process the command (usually doesn't need target)
                else if (selectedCommand === 'guard') {
                    this._actorCommandWindow.processOk();
                }
            }
        }
        // If we're in the skill window and have a stored enemy
        else if (this._skillWindow && this._skillWindow.active && this._clickedEnemyForSelection) {
            const skill = this._skillWindow.item();
            if (skill && skill.scope > 0 && skill.scope < 4) { // Check if skill targets enemies
                this._skillWindow.processOk();
                if (this._enemyWindow.active) {
                    const enemyIndex = $gameTroop.members().indexOf(this._clickedEnemyForSelection);
                    if (enemyIndex >= 0) {
                        this._enemyWindow.select(enemyIndex);
                        this._enemyWindow.processOk();
                        this._clickedEnemyForSelection = null;
                    }
                }
            }
        }
        // If we're in the item window and have a stored enemy
        else if (this._itemWindow && this._itemWindow.active && this._clickedEnemyForSelection) {
            const item = this._itemWindow.item();
            if (item && item.scope > 0 && item.scope < 4) { // Check if item targets enemies
                this._itemWindow.processOk();
                if (this._enemyWindow.active) {
                    const enemyIndex = $gameTroop.members().indexOf(this._clickedEnemyForSelection);
                    if (enemyIndex >= 0) {
                        this._enemyWindow.select(enemyIndex);
                        this._enemyWindow.processOk();
                        this._clickedEnemyForSelection = null;
                    }
                }
            }
        }
        // If we're directly in the enemy selection window
        else if (this._enemyWindow && this._enemyWindow.active) {
            const clickedEnemy = this.getClickedEnemy();
            if (clickedEnemy !== null) {
                const enemyIndex = $gameTroop.members().indexOf(clickedEnemy);
                if (enemyIndex >= 0) {
                    this._enemyWindow.select(enemyIndex);
                    this._enemyWindow.processOk();
                }
            }
        }
    };
    
    Scene_Battle.prototype.getClickedEnemy = function() {
        for (const enemy of $gameTroop.aliveMembers()) {
            const sprite = this._spriteset.findTargetSprite(enemy);
            if (sprite && this.isMouseOverSprite(sprite)) {
                return enemy;
            }
        }
        return null;
    };
    
    Scene_Battle.prototype.isMouseOverSprite = function(sprite) {
        const x = this._mouseTargetX;
        const y = this._mouseTargetY;
        const rect = new Rectangle(
            sprite.x - sprite.width / 2,
            sprite.y - sprite.height,
            sprite.width,
            sprite.height
        );
        return rect.contains(x, y);
    };
    
    //=============================================================================
    // Add method to Spriteset_Battle to find a specific battler sprite
    //=============================================================================
    
    Spriteset_Battle.prototype.findTargetSprite = function(battler) {
        if (battler.isActor()) {
            return this.actorSprite(battler);
        } else {
            return this.enemySprite(battler);
        }
    };
    
    Spriteset_Battle.prototype.enemySprite = function(enemy) {
        for (const sprite of this._enemySprites) {
            if (sprite._battler === enemy) {
                return sprite;
            }
        }
        return null;
    };
    
    Spriteset_Battle.prototype.actorSprite = function(actor) {
        if (this._actorSprites) {
            for (const sprite of this._actorSprites) {
                if (sprite._battler === actor) {
                    return sprite;
                }
            }
        }
        return null;
    };
    
    //=============================================================================
    // UIScroll, mouse wheel scrolling for every DOM overlay in the game
    //=============================================================================
    // RMMZ swallows the wheel at the document level: rmmz_core.js binds
    // TouchInput._onWheel with { passive: false } and calls preventDefault on
    // every event, so no DOM overlay a plugin builds ever scrolls by itself.
    // Historically each menu worked around that by binding its own wheel
    // handler, which meant the menus that forgot could not be scrolled with
    // the wheel at all, and the ones that remembered all reimplemented the
    // same walk, usually hardwired to a single pane so their other overflow
    // regions stayed stuck anyway.
    //
    // This is that walk, done once for the whole game. It listens on the
    // document in the CAPTURE phase, so it runs before both TouchInput and any
    // handler a plugin bound on its own container:
    //
    //   * from the event target, walk up looking for a pane that really
    //     overflows on Y and is set to auto/scroll
    //   * scroll it, then preventDefault + stopPropagation so neither the game
    //     nor the plugin's own container handler acts on the same notch
    //   * find nothing, and do nothing at all, so wheel-as-zoom overlays (the
    //     world atlas map, the driving camera, the 3D previews) are untouched
    //
    // Deferring to what is already there: the walk stops at any element that
    // registered a wheel listener of its own (see the addEventListener hook
    // below, which tags them). So a 3D preview canvas keeps zooming, a scene
    // that steps a selection per notch keeps stepping, and only the panes
    // nobody wired reach this. An element can also opt out by hand with the
    // `data-wheel-own` attribute.
    const UIScroll = {
        // How far above the target we look for a pane. Overlays nest deeply
        // (page > column > list > row > cell > label); the bound only keeps a
        // stray event cheap, it is not meant to exclude anything real.
        MAX_DEPTH: 24,
        // Below this a pane is not really overflowing, it is the rounding
        // artefact of a fractional layout.
        MIN_OVERFLOW: 2,
        // Bounds on the fallback search below. Panes sit within a few levels
        // of the overlay root, and the node cap keeps a notch on a very large
        // menu from costing a layout pass over the whole tree.
        FALLBACK_DEPTH: 5,
        FALLBACK_NODES: 400,

        // Wheel deltas arrive in pixels, lines or pages depending on the
        // device; normalise them all to pixels.
        deltaOf(event) {
            const dy = event.deltaY;
            if (event.deltaMode === 1) return dy * 40;
            if (event.deltaMode === 2) return dy * 400;
            return dy;
        },

        isScrollable(el) {
            if (!el || el.nodeType !== 1) return false;
            if (el.scrollHeight - el.clientHeight < this.MIN_OVERFLOW) return false;
            const overflow = getComputedStyle(el).overflowY;
            return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
        },

        // True while the pane can still move the way the notch is asking for.
        canScroll(el, delta) {
            if (delta < 0) return el.scrollTop > 0;
            return el.scrollTop < el.scrollHeight - el.clientHeight - 1;
        },

        // Something else already owns the wheel here.
        ownsWheel(el) {
            return !!(el.__uiScrollOwnWheel || (el.hasAttribute && el.hasAttribute('data-wheel-own')));
        },

        // The pane a notch at `node` should move: the nearest scrollable
        // ancestor with room left in that direction, else the nearest
        // scrollable ancestor at all, so a pane pinned at its end still
        // swallows the notch instead of letting the map zoom behind it.
        // Bails out the moment the walk meets an owner of the wheel, without
        // trying the fallback below: a pane that owner is keeping to itself is
        // not ours to move.
        paneFor(node, delta) {
            let el = node;
            let depth = 0;
            let pinned = null;
            let overlay = null;
            while (el && el.nodeType === 1 && depth++ < this.MAX_DEPTH) {
                if (this.ownsWheel(el)) return null;
                if (this.isScrollable(el)) {
                    if (this.canScroll(el, delta)) return el;
                    if (!pinned) pinned = el;
                }
                if (el.parentElement === document.body) overlay = el;
                el = el.parentElement;
            }
            if (pinned) return pinned;
            // Nothing under the pointer scrolls: the notch landed on a header,
            // a footer or the padding around the content. Fall back to the one
            // pane of this overlay that can still move, which is what the
            // player means when a menu has a single list on it.
            return overlay ? this.onlyPaneOf(overlay, delta) : null;
        },

        // The single scrollable pane of `root` that has room in this
        // direction. Deliberately gives up when the overlay has more than one,
        // since guessing which of two lists the player meant is worse than
        // doing nothing. The search is a bounded breadth first walk (a pane is
        // never searched for nested panes) so it stays cheap on the big
        // overlays even though it runs per notch.
        onlyPaneOf(root, delta) {
            let found = null;
            let seen = 0;
            const walk = (el, depth) => {
                if (depth > this.FALLBACK_DEPTH) return true;
                for (const child of el.children) {
                    if (++seen > this.FALLBACK_NODES) return false;
                    if (this.ownsWheel(child)) return false;
                    if (this.isScrollable(child)) {
                        if (found) return false;
                        found = child;
                    } else if (!walk(child, depth + 1)) {
                        return false;
                    }
                }
                return true;
            };
            if (!walk(root, 0)) return null;
            return found && this.canScroll(found, delta) ? found : null;
        },

        // ---- L2 / R2, the controller's wheel ------------------------------
        // The walk above answers a notch of the wheel. A pad has no notch: MZ's
        // gamepad map has no name for the analog triggers at all (they are
        // buttons 6 and 7, read raw through Core/AnalogStickInput), so nothing
        // in the engine ever turns a pulled trigger into anything. Without this
        // a player on a pad cannot read a page of text that does not fit: the
        // cursor walks the cards, and the prose beside them stays where it is.
        //
        // Same pane, same rules, polled once a frame instead of once a notch.
        TRIGGER_SPEED: 26,      // pixels a frame at a fully pulled trigger
        TRIGGER_DEADZONE: 0.15, // some pads rest a little above zero
        STEP_WAIT: 20,          // frames before a held trigger starts repeating
        STEP_INTERVAL: 5,       // and how often it repeats after that
        _hold: 0,
        _px: -1,
        _py: -1,

        // Where the mouse last was, so a pulled trigger scrolls the pane the
        // player is pointing at, exactly as their wheel would.
        trackPointer(event) {
            this._px = event.clientX;
            this._py = event.clientY;
        },

        // The pane a trigger should move, in the order a player means it:
        //   the pane the open scene names, for a screen that knows which of its
        //   panes is the one being read;
        //   the pane under the pointer, if the mouse is over the overlay;
        //   the pane holding whatever the cursor is lit on, so the text beside
        //   a focused control scrolls with it;
        //   else the one pane of the overlay that can still move, and failing
        //   that the right page of a book spread, which is the page a menu in
        //   this game puts its prose on.
        triggerPane(delta) {
            const scene = SceneManager._scene;
            const named = scene && (scene.onUIScrollTarget || scene.ccScrollTarget);
            if (named) {
                const pane = named.call(scene);
                if (this.isScrollable(pane)) return pane;
            }
            if (this._px >= 0 && document.elementFromPoint) {
                const at = document.elementFromPoint(this._px, this._py);
                if (at && at.id !== 'gameCanvas') {
                    const pane = this.paneFor(at, delta);
                    if (pane) return pane;
                }
            }
            const lit = document.querySelector('.cc-nav-focus, .focused, .kb-focus');
            if (lit) {
                const pane = this.paneFor(lit, delta);
                if (pane) return pane;
            }
            const overlay = this.topOverlay();
            if (!overlay) return null;
            return this.onlyPaneOf(overlay, delta) ||
                this.rightPageOf(overlay, delta);
        },

        // The overlay a plugin has put over the game: the last child of the
        // body that is on screen and is not the canvas itself.
        topOverlay() {
            const kids = document.body ? document.body.children : [];
            for (let i = kids.length - 1; i >= 0; i--) {
                const el = kids[i];
                if (!el || el.nodeType !== 1) continue;
                if (el.id === 'gameCanvas' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
                if (el.style && el.style.display === 'none') continue;
                if (!el.clientHeight) continue;
                return el;
            }
            return null;
        },

        // A book spread reads left to right: the left page carries the list the
        // cursor walks and the right page carries what it says about the thing
        // under the cursor. When an overlay has more than one pane and the walk
        // above gave up, the right page is the one being read.
        rightPageOf(root, delta) {
            const pages = root.querySelectorAll('.cc-page-right, .right-page');
            for (const page of pages) {
                if (this.isScrollable(page) && this.canScroll(page, delta)) return page;
                const inner = page.querySelectorAll('*');
                for (const el of inner) {
                    if (this.isScrollable(el) && this.canScroll(el, delta)) return el;
                }
            }
            return null;
        },

        // Read once a frame while any overlay is up, AFTER the open scene has
        // had its turn: a screen that wants the triggers for something of its
        // own - the conversation panel's social web zooms with them, the shop
        // counts a quantity with them, the hyperdeck turns its case - has read
        // them by now, and reading is the claim (see AnalogStickInput). This
        // poll stands down whenever somebody else has already asked, so one
        // pull never does two things at once.
        updateTriggers() {
            const pads = window.AnalogStickInput;
            if (!pads || typeof pads.leftTrigger !== 'function') return;
            if (typeof pads.triggerReadsThisFrame === 'function' &&
                pads.triggerReadsThisFrame() > 0) return;
            const dz = this.TRIGGER_DEADZONE;
            const pull = (v) => (v > dz ? (v - dz) / (1 - dz) : 0);
            const amount = (pull(pads.rightTrigger()) - pull(pads.leftTrigger())) * this.TRIGGER_SPEED;
            if (!amount) {
                this._hold = 0;
                return;
            }
            this._hold++;
            // A scene that takes a notch to move a selection takes a pulled
            // trigger the same way, on the cadence of a held direction rather
            // than sixty times a second.
            const scene = SceneManager._scene;
            const step = scene && (scene.onUIWheelStep || scene.ccScrollStep);
            if (step) {
                const t = this._hold;
                const fires = t === 1 || (t >= this.STEP_WAIT && (t - this.STEP_WAIT) % this.STEP_INTERVAL === 0);
                if (fires && step.call(scene, amount > 0 ? 1 : -1)) return;
                if (!fires) return;
            }
            const pane = this.triggerPane(amount);
            if (pane) pane.scrollTop += amount;
        },

        onWheel(event) {
            if (event.defaultPrevented) return;
            const target = event.target;
            if (!target || target.nodeType !== 1) return;
            // The game canvas is not an overlay; leave it to TouchInput.
            if (target.id === 'gameCanvas') return;
            const delta = this.deltaOf(event);
            if (!delta) return;
            // A scene can take the notch itself and move a selection instead
            // (CharacterCreation's hometown dropdown does; see CCScroll).
            const scene = SceneManager._scene;
            const step = scene && (scene.onUIWheelStep || scene.ccScrollStep);
            if (step && step.call(scene, delta > 0 ? 1 : -1)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const pane = this.paneFor(target, delta);
            if (!pane) return;
            pane.scrollTop += delta;
            event.preventDefault();
            event.stopPropagation();
        },

        // Tags every element that binds a wheel listener of its own, which is
        // how paneFor knows to keep its hands off. Elements only: a listener
        // on document or window is a global fallback (camera zoom behind an
        // overlay) and is meant to be superseded by a pane under the pointer.
        hookListeners() {
            const proto = EventTarget.prototype;
            const original = proto.addEventListener;
            if (original.__uiScrollHooked) return;
            const patched = function (type, listener, options) {
                if (type === 'wheel' && this && this.nodeType === 1) {
                    this.__uiScrollOwnWheel = true;
                }
                return original.call(this, type, listener, options);
            };
            patched.__uiScrollHooked = true;
            proto.addEventListener = patched;
        },

        install() {
            if (this._installed) return;
            this._installed = true;
            this.hookListeners();
            document.addEventListener('wheel', (e) => this.onWheel(e), { capture: true, passive: false });
            document.addEventListener('pointermove', (e) => this.trackPointer(e), { passive: true });
            // Once a frame, for the whole game, after the scene has updated:
            // the triggers are polled rather than delivered, so there is
            // nothing to listen for, and going last is what lets a scene that
            // wants them for itself have them (see updateTriggers).
            const _updateScene = SceneManager.updateScene;
            SceneManager.updateScene = function () {
                _updateScene.apply(this, arguments);
                if (this.isCurrentSceneStarted && this.isCurrentSceneStarted()) UIScroll.updateTriggers();
            };
        }
    };

    window.UIScroll = UIScroll;

    //=========================================================================
    // PadUI - the controller face of every menu in the game
    //=========================================================================
    // A menu used to read the same on a keyboard and on a pad: a Back button
    // that says Back, a Discard button that says Discard, and no way to know
    // which button on the thing in your hands does either. The letters live
    // here now, in one table, and are stamped onto the buttons themselves while
    // a pad is the device in use - and taken straight off again the moment a
    // key is pressed, so a keyboard player is never shown a button they do not
    // have. No screen writes a button face of its own.
    //
    // A screen opts a control in by naming the ROLE it plays:
    //
    //     <div class="inspect-btn" data-pad="discard">Discard</div>
    //
    // and the badge appears inside it. The one role no screen has to declare is
    // the Back button, which is the same control, in the same place, on every
    // screen (docs/task/ui_fixing.md): every `.back-button` is stamped with
    // Cancel wherever it is found.
    const PadUI = {
        // i18n-ignore-start  physical button faces, not prose
        BUTTON: {
            confirm:   'A',
            cancel:    'B',
            alt:       'X',      // Input 'shift': the page's secondary verb
            extra:     'Y',      // Input 'menu': the page's third verb
            tabPrev:   'L1',     // 'pageup'
            tabNext:   'R1',     // 'pagedown'
            scrollUp:  'L2',
            scrollDown:'R2',
            stick:     'L3',
            select:    'Select',
            start:     'Start'
        },
        // What a control called `data-pad="<role>"` is pressed with. Roles are
        // named after what the control DOES, so the same verb wears the same
        // button on every screen in the game.
        ROLES: {
            confirm:  'confirm',
            use:      'confirm',
            select:   'confirm',
            cancel:   'cancel',
            back:     'cancel',
            close:    'cancel',
            discard:  'extra',
            drop:     'extra',
            sort:     'alt',
            favorite: 'alt',
            tabPrev:  'tabPrev',
            tabNext:  'tabNext'
        },
        // i18n-ignore-end

        BADGE_CLASS: 'pad-badge',

        // Whether the player is on a pad right now. Input.lastInputDevice is
        // the one answer to that question (see the bottom of this file).
        active() {
            return !!(typeof Input !== 'undefined' && Input.lastInputDevice &&
                Input.lastInputDevice() === 'pad');
        },

        // The face of a role, or of a button named outright ('L1').
        glyph(role) {
            if (!role) return '';
            const mapped = this.ROLES[role] || role;
            return this.BUTTON[mapped] || '';
        },

        // The markup a host can put inside its own button when it builds one by
        // hand. Empty on a keyboard, so a template can always ask for it.
        badge(role) {
            if (!this.active()) return '';
            const face = this.glyph(role);
            return face ? `<span class="${this.BADGE_CLASS}">${face}</span>` : '';
        },

        //---------------------------------------------------------------------
        // Stamping the badges onto what is already on screen
        //---------------------------------------------------------------------
        // What a control is, in this order: what it says it is, the one class
        // every Back button in the game wears, and failing both the name it was
        // given. A screen names its buttons after what they do - `.msb-confirm`,
        // `.save-modal-cancel`, `.kb-detail-close` - so a class whose LAST word
        // is a verb this table knows is that verb. Matching the last word only
        // is what keeps `.travel-confirm-panel` (a panel) and `.ui-closed` (a
        // state) out of it. `data-pad="none"` opts a control out.
        CLASS_ROLES: {
            confirm: 'confirm',
            accept:  'confirm',
            apply:   'confirm',
            cancel:  'cancel',
            close:   'cancel',
            back:    'cancel',
            discard: 'discard',
            drop:    'discard'
        },

        roleOf(el) {
            const named = el.getAttribute && el.getAttribute('data-pad');
            if (named) return named === 'none' ? null : named;
            if (!el.classList) return null;
            if (el.classList.contains('back-button')) return 'cancel';
            for (const token of el.classList) {
                const last = String(token).split('-').pop();
                if (this.CLASS_ROLES[last]) return this.CLASS_ROLES[last];
            }
            return null;
        },

        markOne(el, on) {
            const role = this.roleOf(el);
            if (!role) return;
            if (!on || !this.glyph(role)) {
                this.unstamp(el);
                return;
            }
            // The face reads ahead of the word on a Back button (it IS the
            // control) and after it on a verb, which reads as the sentence the
            // button is: "Discard (Y)".
            const first = !!(el.classList && el.classList.contains('back-button'));
            this.stamp(el, this.glyph(role), first);
        },

        // The tab strips: L1 and R1 step them everywhere, so the strip says so
        // at its two ends rather than each screen printing a legend.
        TAB_STRIPS: '.backpack-tabs, .ui-tabs, .cc-tabs',

        decorateTabs(scope, on) {
            const strips = scope.querySelectorAll(this.TAB_STRIPS);
            for (const strip of strips) {
                // `children` is elements only, whatever the host: the text
                // between two tabs is not a tab.
                const tabs = Array.prototype.slice.call(strip.children || []);
                // Whatever the strip was wearing comes off first: a strip is
                // redrawn as the player walks it, and a device can change
                // between two redraws.
                for (const tab of tabs) this.unstamp(tab);
                if (!on || tabs.length < 2) continue;
                this.stamp(tabs[0], this.BUTTON.tabPrev, true);
                this.stamp(tabs[tabs.length - 1], this.BUTTON.tabNext, false);
            }
        },

        // Take a badge off, wherever it was put.
        unstamp(el) {
            const badge = el && el.querySelector && el.querySelector('.' + this.BADGE_CLASS);
            if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
        },

        // One badge inside one element, put in front of its word or after it.
        stamp(el, face, first) {
            if (!el || !face) return;
            const existing = el.querySelector && el.querySelector('.' + this.BADGE_CLASS);
            if (existing) {
                if (existing.textContent !== face) existing.textContent = face;
                return;
            }
            const badge = document.createElement('span');
            badge.className = this.BADGE_CLASS;
            badge.textContent = face;
            if (first) el.insertBefore(badge, el.firstChild);
            else el.appendChild(badge);
        },

        decorate(root) {
            const scope = root || document;
            if (!scope.querySelectorAll) return;
            const on = this.active();
            const marks = scope.querySelectorAll(
                '[data-pad], .back-button, [class$="confirm"], [class*="confirm "],' +
                '[class$="cancel"], [class*="cancel "], [class$="close"], [class*="close "],' +
                '[class$="accept"], [class*="accept "], [class$="apply"], [class*="apply "],' +
                '[class$="discard"], [class*="discard "], [class$="drop"], [class*="drop "]');
            for (const el of marks) this.markOne(el, on);
            this.decorateTabs(scope, on);
        },

        //---------------------------------------------------------------------
        // L2 and R2, on the pane they scroll
        //---------------------------------------------------------------------
        // The triggers scroll whatever pane the page is reading (UIScroll), and
        // that is the one thing about them a player cannot guess. So while a
        // pad is in hand the pane says so itself: L2 at the top edge, R2 at the
        // bottom, each one lit only while there is somewhere to go that way.
        // The chips ride in a layer of their own over the page, so no menu's
        // layout is touched by them.
        RAIL_ID: 'pad-rails',

        railLayer() {
            let layer = document.getElementById(this.RAIL_ID);
            if (!layer) {
                layer = document.createElement('div');
                layer.id = this.RAIL_ID;
                if (document.body) document.body.appendChild(layer);
            }
            return layer;
        },

        // Every pane on screen the triggers would move: scrollable, showing,
        // and big enough to be a pane rather than a chip.
        scrollPanes() {
            const overlay = UIScroll.topOverlay();
            if (!overlay || !overlay.querySelectorAll) return [];
            const out = [];
            const seen = new Set();
            const consider = (el) => {
                if (!el || seen.has(el)) return;
                seen.add(el);
                if (!UIScroll.isScrollable(el)) return;
                if (el.scrollHeight - el.clientHeight < 8) return;
                if (el.clientHeight < 60) return;
                out.push(el);
            };
            consider(overlay);
            for (const el of overlay.querySelectorAll('*')) consider(el);
            return out;
        },

        updateRails() {
            const layer = this.railLayer();
            if (!layer) return;
            const panes = this.active() ? this.scrollPanes() : [];
            const wanted = panes.length * 2;
            while (layer.children.length < wanted) {
                const chip = document.createElement('div');
                chip.className = 'pad-rail-chip';
                layer.appendChild(chip);
            }
            while (layer.children.length > wanted) {
                const last = layer.lastChild;
                if (!last) break;
                layer.removeChild(last);
                if (layer.lastChild === last) break;
            }
            panes.forEach((pane, i) => {
                const box = pane.getBoundingClientRect();
                const atTop = pane.scrollTop <= 1;
                const atEnd = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1;
                const place = (chip, face, x, y, spent) => {
                    if (chip.textContent !== face) chip.textContent = face;
                    chip.classList.toggle('spent', spent);
                    chip.style.setProperty('--ui-at-x', Math.round(x) + 'px');
                    chip.style.setProperty('--ui-at-y', Math.round(y) + 'px');
                };
                // i18n-ignore-start  physical button faces
                place(layer.children[i * 2], this.BUTTON.scrollUp,
                    box.right - 6, box.top + 2, atTop);
                place(layer.children[i * 2 + 1], this.BUTTON.scrollDown,
                    box.right - 6, box.bottom - 18, atEnd);
                // i18n-ignore-end
            });
        },

        //---------------------------------------------------------------------
        // Live
        //---------------------------------------------------------------------
        // Menus are redrawn wholesale (a page rebuilds its innerHTML on every
        // cursor move), so the badges are put back by watching the document
        // rather than by asking every screen to remember to call decorate().
        install() {
            if (this._installed || typeof document === 'undefined') return;
            this._installed = true;
            this._lastDevice = null;
            if (window.MutationObserver && document.body) {
                this._observer = new MutationObserver(() => { this._dirty = true; });
                this._observer.observe(document.body, { childList: true, subtree: true });
            }
            const _updateScene = SceneManager.updateScene;
            SceneManager.updateScene = function () {
                _updateScene.apply(this, arguments);
                PadUI.frame();
            };
        },

        // Once a frame: cheap unless something moved. A device change repaints
        // everything, since every badge on screen is wrong at that moment.
        frame() {
            const device = this.active();
            if (device !== this._lastDevice) {
                this._lastDevice = device;
                this._dirty = true;
                // One class on the body is how the stylesheet knows: the
                // keyboard-only controls (a search field nobody can type into
                // on a pad) are taken off screen by a rule rather than by every
                // menu remembering to hide them.
                if (document.body) document.body.classList.toggle('pad-input', device);
            }
            if (this._dirty) {
                this._dirty = false;
                this.decorate(document);
            }
            this._railTick = (this._railTick || 0) + 1;
            if (this._railTick % 6 === 0) this.updateRails();
        }
    };

    window.PadUI = PadUI;
    PadUI.install();

    //=========================================================================
    // UIPanel - the one answer to "is this overlay showing"
    //=========================================================================
    // Every DOM screen in the game used to write display, opacity,
    // pointer-events and a transition onto its own panels, which meant the
    // stylesheet could not say what an open panel looks like and a preset
    // could not re-ink one. A panel now carries `.ui-open` or `.ui-closed`
    // and nothing else: what open looks like is a rule, per panel, in
    // css/theme.css. The two values a sheet genuinely cannot know - where a
    // floating box was put and how full a bar is - are handed over as custom
    // properties.
    const UIPanel = {
        open(el) {
            if (!el) return;
            el.classList.remove('ui-closed');
            el.classList.add('ui-open');
        },
        close(el) {
            if (!el) return;
            el.classList.remove('ui-open');
            el.classList.add('ui-closed');
        },
        toggle(el, on) { return on ? this.open(el) : this.close(el); },
        isOpen(el) { return !!el && el.classList.contains('ui-open'); },
        // The other half of the question, and not its negation: a panel that
        // was never opened by name (one the stylesheet shows by default) is
        // not closed, it simply never said.
        isClosed(el) {
            if (!el) return true;
            if (el.classList.contains('ui-closed')) return true;
            return !!(el.style && el.style.display === 'none');
        },
        // A tooltip or any other box placed at a point on the screen.
        placeAt(el, x, y) {
            if (!el) return;
            el.style.setProperty('--ui-at-x', `${x}px`);
            el.style.setProperty('--ui-at-y', `${y}px`);
        },
        // A meter's fill, 0..100. `axis` is 'w' (the default) or 'h'.
        setBar(el, pct, axis) {
            if (!el) return;
            el.style.setProperty(axis === 'h' ? '--ui-bar-h' : '--ui-bar-w', `${pct}%`);
        },
        // An image handed to a rule as a custom property.
        // ---------------------------------------------------------------
        // A relative url() inside a custom property is resolved against the
        // STYLESHEET that reads the property back, not against the page that
        // wrote it: `img/busts/x.png` written onto an element and read by a
        // rule in css/theme.css is looked for in css/img/busts/x.png, which
        // is nowhere, and the element paints nothing with no error anywhere.
        // That is what blanked every sprite, bust, portrait and vehicle card
        // the moment they moved off inline backgrounds. Any path going into
        // a property comes through here and leaves absolute.
        //
        // The value is written UNQUOTED. Nearly every caller drops it into a
        // style="..." attribute built by a template literal, and a url("...")
        // there closes the attribute at its first inner quote: the browser
        // kept `--cc-sprite-url:url(` and threw the rest away, which blanked
        // the wizard's sidebar sprite, bust and tab portraits without an
        // error. The few characters an unquoted url() cannot carry are percent
        // encoded instead, which every URL loader reads back as the same file.
        assetUrl(path) {
            if (!path) return 'none';
            let href;
            try {
                href = new URL(path, document.baseURI).href;
            } catch (e) {
                href = String(path);
            }
            return `url(${UIPanel.escapeCssUrl(href)})`;
        },

        // What url() needs escaped when it goes unquoted: quotes of both kinds,
        // parentheses and whitespace.
        escapeCssUrl(href) {
            return String(href).replace(/[()'"\s]/g, (c) =>
                '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
        }
    };

    window.UIPanel = UIPanel;
    UIScroll.install();

    // =========================================================================
    // Which device is actually in the player's hands
    //
    // A key badge on a screen ("TAB", "R1") has to name one device, not three
    // (docs/task/ui_fixing.md, rule 9), and this is the one place that question
    // is asked. Whichever of the two last did something wins; before either has,
    // a plugged in pad is assumed and a bare keyboard falls back to itself.
    // =========================================================================
    if (!Input.lastInputDevice) {
        let device = null;

        const padPressed = () => {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (let i = 0; i < pads.length; i++) {
                const pad = pads[i];
                if (!pad || !pad.connected) continue;
                for (let b = 0; b < pad.buttons.length; b++) {
                    const button = pad.buttons[b];
                    if (button && (button.pressed || button.value > 0.5)) return true;
                }
                for (let a = 0; a < pad.axes.length; a++) {
                    if (Math.abs(pad.axes[a]) > 0.5) return true;
                }
            }
            return false;
        };

        const padConnected = () => {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (let i = 0; i < pads.length; i++) {
                if (pads[i] && pads[i].connected) return true;
            }
            return false;
        };

        document.addEventListener('keydown', () => { device = 'keyboard'; }, { passive: true });

        // The pad is polled rather than delivered, so it is read once a frame
        // off the same hook the triggers use.
        const _updateInput = Input.update;
        Input.update = function () {
            _updateInput.apply(this, arguments);
            if (padPressed()) device = 'pad';
        };

        Input.lastInputDevice = function () {
            if (device) return device;
            return padConnected() ? 'pad' : 'keyboard';
        };
    }

})();