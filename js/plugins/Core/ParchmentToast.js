/*:
 * @target MZ
 * @plugindesc v2.0.0 Central notification service. Every transient popup in the game is built and shown here. Exposes window.ParchmentToast.
 * @author Hypernet
 *
 * @help ParchmentToast.js
 *
 * The single place transient notifications are built and displayed. Every
 * popup in the game routes through it, so rewards, needs, level ups, refunds,
 * bounties and plain messages all share one visual language
 * (.html-parchment-overlay in theme.css) and one stacking behaviour.
 *
 * Never build a Window_Base toast or a one-off DOM popup: add a builder here
 * instead, so the new notification is themed and stacked like every other.
 *
 * -----------------------------------------------------------------------
 * Plain text
 * -----------------------------------------------------------------------
 *   ParchmentToast.show("You are hungry", { severity: "warning" });
 *
 *   severity  'info' (default) | 'warning' | 'danger' | 'good'
 *   duration  display time in frames (default 120 = 2s), excludes fades
 *   html      true to inject the string as HTML (default: plain text)
 *   key       de-duplication key (defaults to the text itself)
 *   title     optional bold heading line above the text
 *   icon      optional IconSet index drawn before the text
 *
 * -----------------------------------------------------------------------
 * Builders (prefer these over hand-rolled HTML)
 * -----------------------------------------------------------------------
 *   ParchmentToast.reward({ entries, gold, exp, knowledge, lines, title })
 *       entries: [{ id }] item ids, [{ obj }] data objects, or
 *                [{ icon, name, qty }] literals. Duplicates are merged.
 *       An item whose rarity can be read (anything given as an id or an
 *       object) is named in its rarity colour, the same ladder the inventory
 *       and the shop paint. The popup also stays up longer the more lines it
 *       carries, so a haul of six things is not gone before it is read.
 *
 *   ParchmentToast.need('leisure', +8, { note: '2 technophobes -8' })
 *       Reads the current party median from PartyNeeds, so every need change
 *       in the game reports identically ("Fun 62% up +8").
 *
 *   ParchmentToast.specUp(actor, 290, 3)
 *       Specialization level up. Accepts a spec id, a spec name, or the spec
 *       object; the level name comes from window.Specializations.
 *
 *   ParchmentToast.skillCast(actor, skill)
 *       The skill's own Message lines ("%1 lays the whole world bare!"), the
 *       ones the battle log reads out. Cast from a menu there is no log, so
 *       the line is shown here instead. Called for you: every menu route into
 *       a skill goes through useItem, which announces the cast itself.
 *
 *   ParchmentToast.gold(1200)      money gained, formatted in euros
 *   ParchmentToast.money(1200)     the formatted string on its own
 *   ParchmentToast.icon(176)       one IconSet cell as inline HTML
 *
 * -----------------------------------------------------------------------
 * Standing notifications
 * -----------------------------------------------------------------------
 * A condition that lasts (overencumbered, poisoned, hunted) is not an event
 * to be announced once: it stays up for as long as it is true.
 *
 *   ParchmentToast.sticky("Overencumbered", { key: 'encumbrance',
 *                                             severity: 'danger' });
 *   ParchmentToast.dismiss('encumbrance');   // the moment it stops being true
 *
 * A sticky toast never expires and is never evicted to make room for a
 * transient one. Calling sticky() again with the same key redraws it in
 * place, so a live readout (a weight, a countdown) simply keeps its slot.
 * ParchmentToast.isLive(key) answers whether one is up.
 *
 * -----------------------------------------------------------------------
 * Event gains
 * -----------------------------------------------------------------------
 * Change Gold, Change Items, Change Weapons and Change Armors report what the
 * party actually received through reward(), so a chest built in the editor
 * pops the same popup as battle spoils or random loot without anyone writing
 * a message for it. Everything one event gains in the same frame is collected
 * into a single toast, and only the real delta is announced: an inventory
 * already at 99, or gold at the cap, gains nothing and says nothing. Losses
 * are silent.
 *
 * A gain a plugin already announced itself is not announced twice: reward()
 * remembers what it drew for a moment, and a matching event gain right after
 * it is dropped.
 *
 * An event whose name starts with "Acquire" or "Treasure" shows no Show Text
 * or Show Scrolling Text at all. The stock treasure page ends in "\C[?]0\G
 * were found!", which is what the toast already says, and a message box stops
 * the player to say it.
 *
 * -----------------------------------------------------------------------
 * Several notifications at once
 * -----------------------------------------------------------------------
 * Toasts stack and never replace one another, so a single action can report
 * everything it did. Use group() to fire them together, slightly staggered so
 * they animate in one after the other:
 *
 *   ParchmentToast.group([
 *       () => ParchmentToast.need('leisure', 12),
 *       () => ParchmentToast.specUp(actor, 'Video Gaming', 3)
 *   ]);
 *
 * Up to 6 are on screen at once; the oldest is dropped past that. Showing a
 * notification whose key is already up refreshes its timer instead of
 * stacking a duplicate. No plugin commands.
 */
(() => {
  "use strict";

  const FADE_MS = 400;
  const FRAME_MS = 1000 / 60;
  const MAX_TOASTS = 6;
  const GROUP_STAGGER_MS = 130;
  // A popup is read at a glance over a moving map, so it says its piece and
  // gets out of the way: two seconds for a plain one, less for a meter change.
  const DEFAULT_DURATION = 120;

  // An event named for what it hands over says it in the popup, not in a
  // message box. Matched case-insensitively on the prefix, so "Treasure
  // (1200€)" and "Acquire (Bone)" are both covered.
  const SILENT_EVENT_PREFIXES = ["acquire", "treasure"];  // i18n-ignore  event names in the editor

  // How long a reward already drawn swallows the matching event gain. Long
  // enough to cover one interaction, short enough that finding the same item
  // again a moment later still reports it.
  const GAIN_DEDUPE_MS = 1200;

  // A find of one thing is read at a glance; a find of six is read line by
  // line, so the popup buys extra time for every line past the first.
  const REWARD_BASE_FRAMES = 240;
  const REWARD_LINE_FRAMES = 55;
  const REWARD_MAX_FRAMES = 660;
  // Bulk reward items are chunked so a large container or chest find never
  // trails off the screen: each portion displays up to MAX_REWARD_ENTRIES,
  // lingers for reading, fades out, and yields to the next portion.
  const MAX_REWARD_ENTRIES = 6;

  // The rarity ladder ItemSystemUtils reads out of js/db/Items/Rarity.json,
  // low to high. A row is coloured by where its tier sits in that ladder, not
  // by its name, so a table that renames or adds tiers still lands on a class.
  const RARITY_CLASSES = ["common", "uncommon", "rare", "epic", "legendary"];  // i18n-ignore  css class suffixes

  let _stackEl = null;
  let _rafId = null;
  const _live = new Map(); // key -> { el, hideAt, fading }

  // ==========================================================================
  // Frame budget  (window.FrameBudget)
  // --------------------------------------------------------------------------
  // Not about notifications, and it may well deserve a plugin of its own: it
  // sits here because this is the earliest Core plugin that already owns a
  // shared DOM overlay layer, so every overlay in the game can reach it before
  // its own first frame.
  //
  // WHY IT EXISTS
  // The engine holds game speed steady by running the logic more than once per
  // drawn frame: SceneManager.determineRepeatNumber returns 2 at 30fps, so
  // updateMain, and every Scene_Map.update hook behind it, runs twice while
  // only the second one is ever rendered. On a desk that never shows. On a
  // handheld it means half of the cosmetic work in the game is paid for and
  // then thrown away, and paying for it is what put the frame rate under 60 in
  // the first place.
  //
  // So gameplay keeps running on every tick, as the engine intends, and
  // cosmetics (a HUD rewrite, an overlay follow, a lighting repaint) run only
  // on the tick that is about to be drawn:
  //
  //     if (!FrameBudget.isPresented()) return;   // nothing would be seen
  //
  // Two more helpers, same reason:
  //
  //     FrameBudget.canvasRect()    the #gameCanvas rect, read from the DOM at
  //                                 most once per drawn frame. Every read is a
  //                                 forced synchronous layout, and a dozen
  //                                 overlays were each taking their own.
  //     FrameBudget.every(key, hz)  true at most hz times a second, for the
  //                                 overlays that never needed 60. One key per
  //                                 call site: two sites sharing a key share
  //                                 the budget.
  //
  // Every call is safe before the engine exists and outside a logic tick: the
  // answer defaults to "yes, do the work", so a caller that starts guarding
  // with it can never end up doing less than it did before.
  // ==========================================================================
  let _tickTotal = 1;
  let _tickIndex = 1;
  let _framePresented = 0;
  let _rectCache = null;
  let _rectFrame = -1;
  const _everyMarks = new Map();

  function isPresented() {
    return _tickIndex >= _tickTotal;
  }

  function nowMs() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  function every(key, hz) {
    const rate = Number(hz) > 0 ? Number(hz) : 1;
    const period = 1000 / rate;
    const now = nowMs();
    const last = _everyMarks.get(key);
    if (last !== undefined && now - last < period) return false;
    _everyMarks.set(key, now);
    return true;
  }

  function invalidateRect() {
    _rectCache = null;
    _rectFrame = -1;
  }

  function canvasRect() {
    if (_rectFrame === _framePresented && _rectCache) return _rectCache;
    if (typeof document === "undefined" || !document.getElementById) return null;
    const canvas = document.getElementById("gameCanvas");
    if (!canvas || typeof canvas.getBoundingClientRect !== "function") return null;
    const r = canvas.getBoundingClientRect();
    if (!r || !(r.width > 0) || !(r.height > 0)) return null;
    // The live DOMRect, handed out as read only: a caller that needs to keep it
    // past this frame copies the numbers it wants out of it.
    _rectCache = r;
    _rectFrame = _framePresented;
    return r;
  }

  // determineRepeatNumber is called exactly once per drawn frame, before the
  // batch of logic ticks that frame is going to run, which makes it the one
  // place that knows how many ticks are about to share the frame. updateMain
  // then counts them off. A tick that arrives from anywhere else leaves the
  // index clamped at the total, so isPresented() stays true and nothing is
  // silently skipped.
  function hookEngine() {
    if (typeof SceneManager === "undefined" || !SceneManager) return false;
    if (SceneManager._frameBudgetHooked) return true;
    const determine = SceneManager.determineRepeatNumber;
    const updateMain = SceneManager.updateMain;
    if (typeof determine !== "function" || typeof updateMain !== "function") return false;
    SceneManager._frameBudgetHooked = true;
    SceneManager.determineRepeatNumber = function (deltaTime) {
      const n = determine.call(this, deltaTime);
      _tickTotal = n > 0 ? n : 1;
      // A frame that owes no logic tick at all runs nothing, so it is left
      // counted as done: a caller that asks between batches, off a
      // requestAnimationFrame loop of its own, is told yes rather than being
      // stalled until the next tick arrives.
      _tickIndex = n > 0 ? 0 : _tickTotal;
      _framePresented++;
      invalidateRect();
      return n;
    };
    SceneManager.updateMain = function () {
      if (_tickIndex < _tickTotal) _tickIndex++;
      updateMain.call(this);
    };
    return true;
  }

  // The scan below reads offsetWidth/offsetHeight and getComputedStyle over
  // every child of <body>, which is a layout each time, so its answer is
  // cached. A DOM page opening or closing a few frames before the render rate
  // follows it is not something anyone can see.
  const COVERED_RECHECK_FRAMES = 10;
  const _coveredCache = new Map(); // fraction -> { frame, value }

  // Is a full-screen DOM page standing over the game view? Menu agnostic on
  // purpose: it asks the page, not a list of plugins, so a menu written next
  // year counts without registering anything. `fraction` is how much of the
  // window a child of <body> has to cover to count as one, which is why
  // UI/ASCIIMode.js can share this scan while asking a looser question of it.
  function isCanvasCovered(fraction) {
    const frac = Number(fraction) > 0 ? Number(fraction) : 0.8;
    if (typeof document === "undefined" || !document.body) return false;
    const frame = typeof Graphics !== "undefined" && Graphics ? (Graphics.frameCount || 0) : 0;
    const hit = _coveredCache.get(frac);
    if (hit && frame - hit.frame < COVERED_RECHECK_FRAMES) return hit.value;
    const value = computeCovered(frac);
    _coveredCache.set(frac, { frame, value });
    return value;
  }

  function computeCovered(frac) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!(w > 0) || !(h > 0)) return false;
    const kids = document.body.children || [];
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      if (!el) continue;
      const tag = el.tagName;
      // The engine's own furniture, and anything that is not a box: the canvas
      // being covered cannot count as the thing covering it.
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "CANVAS" ||
          tag === "VIDEO" || tag === "IMG") continue;
      if (el.id === "gameCanvas" || el.id === "errorPrinter" || el.id === "fpsCounter") continue;
      if (!(el.offsetWidth >= w * frac) || !(el.offsetHeight >= h * frac)) continue;
      const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (!cs) return true;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (parseFloat(cs.opacity || "1") <= 0.01) continue;
      return true;
    }
    return false;
  }

  // The engine's own render rate is deliberately NOT touched from here. Drawing
  // the scene behind a full-screen DOM page at a fraction of the frame rate
  // looks like a saving on paper, and it reads as the game running weirdly:
  // a parchment page is often translucent, so the map behind it is on show and
  // stutters. isCanvasCovered() stays as a question overlays can ask about
  // themselves.

  if (typeof window !== "undefined" && window.addEventListener) {
    // A resize lands between frames, so the cached rect is stale before the
    // next batch clears it.
    window.addEventListener("resize", invalidateRect);
  }

  window.FrameBudget = {
    isPresented,
    canvasRect,
    invalidateRect,
    every,
    isCanvasCovered,
    hookEngine,
    // For tests and for the console: what the budget thinks this frame is.
    stats() {
      return {
        tickIndex: _tickIndex,
        tickTotal: _tickTotal,
        frame: _framePresented,
        presented: isPresented()
      };
    }
  };
  hookEngine();

  // ==========================================================================
  // Stack plumbing
  // ==========================================================================
  function ensureStack() {
    if (_stackEl && document.body.contains(_stackEl)) return _stackEl;
    // Purge stale stacks (page persists across Title <-> Map transitions)
    document.querySelectorAll("#html-toast-stack").forEach((e) => e.remove());
    _stackEl = document.createElement("div");
    _stackEl.id = "html-toast-stack";
    document.body.appendChild(_stackEl);
    return _stackEl;
  }

  function syncPosition() {
    if (!_stackEl) return;
    // Shared read: the stack is one of a dozen overlays that all want the
    // canvas box, and the budget takes the layout hit once for all of them.
    const r = canvasRect();
    if (!r) return;
    const sx = r.width / Graphics.width;
    const sy = r.height / Graphics.height;
    const s = _stackEl.style;
    // Anchored to the canvas' top-right corner: the party HUD (PartyHud.js)
    // owns the top-left one, so the two never have to dodge each other.
    s.left = "auto";
    s.right = (window.innerWidth - r.right) + 20 * sx + "px";
    s.top = r.top + 20 * sy + "px";
    s.fontSize = Math.round(16 * sy) + "px";
  }

  function tick() {
    if (_live.size === 0) {
      _rafId = null;
      return;
    }
    syncPosition();
    const now = Date.now();
    // A transient toast raised on the map does not follow the party into a
    // fight: once a battle is running it comes down at once, so it never sits
    // over the enemy bars. A standing notification is left alone.
    const fighting = typeof $gameParty !== "undefined" && !!$gameParty && $gameParty.inBattle();
    for (const [key, toast] of _live) {
      if (!toast.fading && (now >= toast.hideAt || (fighting && !toast.persist))) {
        toast.fading = true;
        toast.el.style.opacity = "0";
        toast.fadeTimer = setTimeout(() => {
          if (toast.el.parentNode) toast.el.parentNode.removeChild(toast.el);
          _live.delete(key);
          if (typeof toast.onDismiss === "function") {
            const cb = toast.onDismiss;
            toast.onDismiss = null;
            try { cb(); } catch (e) { console.warn(e); }
          }
        }, FADE_MS);
      }
    }
    _rafId = requestAnimationFrame(tick);
  }

  // ==========================================================================
  // Small shared helpers
  // ==========================================================================
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // While a battle is running, a transient notification is written into the
  // battle log (purple background) instead of floating over the HUD, where
  // it used to sit on top of the enemy bars and party portraits. A standing
  // notification (persist/sticky) is excluded: it needs to stay in place and
  // be redrawn, which a scrolling log line cannot do.
  function activeBattleLogWindow() {
    if (typeof $gameParty === "undefined" || !$gameParty || !$gameParty.inBattle()) return null;
    const mbm = window.MapBattleMode;
    if (mbm && typeof mbm.isActive === "function" && mbm.isActive() && mbm._logWindow) {
      return mbm._logWindow;
    }
    if (typeof BattleManager !== "undefined" && BattleManager._logWindow) {
      return BattleManager._logWindow;
    }
    return null;
  }

  function stripHtml(html) {
    return String(html)
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toLogText(text, opts) {
    const body = opts.html ? stripHtml(text) : String(text);
    return opts.title ? `${opts.title}: ${body}` : body;
  }

  function localized(name) {
    if (!name) return "";
    try {
      return typeof window.translateText === "function" ? window.translateText(name) : name;
    } catch (e) {
      return name;
    }
  }

  // The css class that paints an item's name in its rarity colour. Nothing
  // is painted for something with no rarity to read (a literal entry, a
  // reward drawn before ItemSystemUtils loaded).
  function rarityClass(obj) {
    const utils = window.ItemSystemUtils;
    if (!obj || !utils || typeof utils.getItemRarity !== "function") return "";
    try {
      const tiers = utils.RARITY_TIERS || [];
      const index = tiers.indexOf(utils.getItemRarity(obj));
      if (index < 0) return "";
      // The ladder is stretched onto the five classes, so a table of three or
      // of eight tiers still spans common to legendary.
      const span = Math.max(tiers.length - 1, 1);
      const slot = Math.round((index / span) * (RARITY_CLASSES.length - 1));
      return "toast-rarity--" + RARITY_CLASSES[slot];  // i18n-ignore  css class
    } catch (e) {
      return "";
    }
  }

  // One IconSet cell as inline HTML, sized in em so the sprite tracks the
  // toast's own font size at any resolution. The inline style carries no
  // colour, so the theme presets' [style*="color:#..."] remaps never see it.
  function icon(iconIndex) {
    const idx = Number(iconIndex) || 0;
    const col = idx % 16;
    const row = Math.floor(idx / 16);
    const S = 1.2; // em per icon cell
    return `<span class="toast-icon" style="width:${S}em; height:${S}em;` +
      ` background-size:${S * 16}em auto;` +
      ` background-position:-${S * col}em -${S * row}em;"></span>`;  // i18n-ignore  inline style
  }

  // Money is always shown in euros: the raw gold value carries two implied
  // decimals (1200 gold = 12.00), the same split MoneyFormatter draws.
  function money(gold) {
    const value = Math.round(Number(gold) || 0);
    const unit = (typeof $dataSystem !== "undefined" && $dataSystem) ? $dataSystem.currencyUnit : "";
    const sign = value < 0 ? "-" : "";
    const str = String(Math.abs(value));
    let main;
    if (str.length <= 2) {
      main = "0." + str.padStart(2, "0");
    } else {
      main = str.slice(0, -2) + "." + str.slice(-2);
    }
    if (main.endsWith(".00")) main = main.slice(0, -3);
    return `${sign}${main}${unit ? " " + unit : ""}`;
  }

  // ==========================================================================
  // show, the one code path every notification ends up in
  // ==========================================================================
  // Draws the caller's content into an element. A title or a leading icon
  // promotes the toast to HTML; the caller's own text is escaped unless it
  // explicitly asked for HTML.
  function renderInto(el, text, opts) {
    const body = opts.html ? String(text) : escapeHtml(String(text));
    if (opts.title || opts.icon != null) {
      let inner = "";
      if (opts.title) inner += `<div class="toast-title">${escapeHtml(opts.title)}</div>`;
      inner += opts.icon != null
        ? `<div class="toast-row">${icon(opts.icon)}<span>${body}</span></div>`
        : body;
      el.innerHTML = inner;
    } else if (opts.html) {
      el.innerHTML = body;
    } else {
      el.textContent = String(text);
    }
  }

  function classNameFor(severity, persist) {
    return `html-parchment-overlay html-toast html-toast--${severity}` +
      (persist ? " html-toast--sticky" : "");
  }

  function show(text, opts = {}) {
    if (text === null || text === undefined || text === "") return;
    const severity = opts.severity || "info";
    const persist = !!opts.persist;

    if (!persist) {
      const log = activeBattleLogWindow();
      if (log && typeof log.addToast === "function") {
        // plainLog: the line reads as an ordinary combat line in the log, with
        // no purple toast background behind it.
        if (opts.plainLog) {
          log.addText(toLogText(text, opts));
        } else {
          log.addToast(toLogText(text, opts));
        }
        if (typeof opts.onDismiss === "function") {
          const cb = opts.onDismiss;
          opts.onDismiss = null;
          try { cb(); } catch (e) { console.warn(e); }
        }
        return;
      }
    }

    const durationMs = (opts.duration || DEFAULT_DURATION) * FRAME_MS;
    const key = String(opts.key != null ? opts.key : text);
    const hideAt = persist ? Infinity : Date.now() + durationMs;

    const existing = _live.get(key);
    if (existing) {
      // Refresh, don't stack dupes. A standing notification is redrawn where it
      // already is, so its readout can move without it losing its slot. This
      // also revives a toast that was mid fade-out (dismissed, then the same
      // key fires again within FADE_MS) instead of layering a second element
      // on top of the one still disappearing.
      if (existing.fadeTimer != null) {
        clearTimeout(existing.fadeTimer);
        existing.fadeTimer = null;
      }
      existing.fading = false;
      existing.hideAt = hideAt;
      existing.persist = persist;
      existing.onDismiss = opts.onDismiss;
      existing.el.className = classNameFor(severity, persist);
      existing.el.style.opacity = "1";
      renderInto(existing.el, text, opts);
      return;
    }

    const stack = ensureStack();

    // Cap the stack: drop the oldest transient toast. A standing notification
    // is never evicted, since the condition it reports is still true.
    if (_live.size >= MAX_TOASTS) {
      for (const [k, toast] of _live) {
        if (toast.persist) continue;
        if (toast.fadeTimer != null) {
          clearTimeout(toast.fadeTimer);
          toast.fadeTimer = null;
        }
        toast.onDismiss = null;
        if (toast.el.parentNode) toast.el.parentNode.removeChild(toast.el);
        _live.delete(k);
        break;
      }
    }

    const el = document.createElement("div");
    el.className = classNameFor(severity, persist);
    renderInto(el, text, opts);

    el.style.opacity = "0";
    stack.appendChild(el);
    syncPosition();
    // Fade in on the next frame, after initial layout
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    });

    _live.set(key, { el, hideAt, fading: false, persist, onDismiss: opts.onDismiss });
    if (_rafId === null) _rafId = requestAnimationFrame(tick);
  }

  /**
   * A notification that stays up until the condition it reports goes away.
   * Always give it a key: that key is how it is redrawn and how it is taken
   * down again with dismiss().
   */
  function sticky(text, opts = {}) {
    show(text, Object.assign({}, opts, { persist: true, key: opts.key != null ? opts.key : text }));
  }

  // Takes a notification down early, sticky or not. Silent if nothing is up.
  function dismiss(key) {
    const k = String(key);
    const toast = _live.get(k);
    if (!toast || toast.fading) return;
    toast.fading = true;
    toast.el.style.opacity = "0";
    toast.fadeTimer = setTimeout(() => {
      if (toast.el.parentNode) toast.el.parentNode.removeChild(toast.el);
      _live.delete(k);
      if (typeof toast.onDismiss === "function") {
        const cb = toast.onDismiss;
        toast.onDismiss = null;
        try { cb(); } catch (e) { console.warn(e); }
      }
    }, FADE_MS);
  }

  // Also the self-healing check a standing notification leans on: a toast whose
  // element has left the page (the stack was rebuilt under it) is forgotten
  // here, so the next show() puts it back rather than believing it is still up.
  function isLive(key) {
    const k = String(key);
    const toast = _live.get(k);
    if (!toast || toast.fading) return false;
    if (!toast.el.parentNode || !document.body.contains(toast.el)) {
      _live.delete(k);
      return false;
    }
    return true;
  }

  function clear() {
    for (const [, toast] of _live) {
      if (toast.fadeTimer != null) {
        clearTimeout(toast.fadeTimer);
        toast.fadeTimer = null;
      }
      toast.onDismiss = null;
      if (toast.el.parentNode) toast.el.parentNode.removeChild(toast.el);
    }
    _live.clear();
  }

  // Fire several notifications for one action, staggered so they animate in
  // one after the other instead of appearing as a single block.
  function group(items) {
    if (!Array.isArray(items)) return;
    let slot = 0;
    for (const item of items) {
      if (!item) continue;
      const run = () => {
        try {
          if (typeof item === "function") item();
          else if (typeof item === "string") show(item);
          else show(item.text, item);
        } catch (e) {
          console.warn("[ParchmentToast] grouped notification failed", e);
        }
      };
      if (slot === 0) run();
      else setTimeout(run, slot * GROUP_STAGGER_MS);
      slot++;
    }
  }

  // ==========================================================================
  // Builders
  // ==========================================================================

  // Accepts { id } (item id), { obj } (any items/weapons/armors record) or a
  // literal { icon, name, qty }, and normalizes them all to one shape.
  function normalizeEntry(e) {
    if (!e) return null;
    let obj = e.obj || null;
    if (!obj && e.id != null && typeof $dataItems !== "undefined" && $dataItems) {
      obj = $dataItems[e.id];
    }
    const name = e.name || (obj ? localized(obj.name) : "");
    if (!name) return null;
    return {
      icon: e.icon != null ? e.icon : (obj ? obj.iconIndex || 0 : 0),
      name,
      qty: e.qty == null ? 1 : e.qty,
      rarity: e.rarity != null ? e.rarity : rarityClass(obj)
    };
  }

  function mergeEntries(entries) {
    const merged = new Map();
    for (const raw of (entries || [])) {
      const e = normalizeEntry(raw);
      if (!e || e.qty <= 0) continue;
      const key = `${e.icon}|${e.name}`;
      const hit = merged.get(key);
      if (hit) hit.qty += e.qty;
      else merged.set(key, e);
    }
    return [...merged.values()];
  }

  function entryRow(e) {
    const qty = e.qty > 1 ? `<span class="toast-qty">&times;${e.qty}</span>` : "";
    const rarity = e.rarity ? " " + e.rarity : "";
    return `<div class="toast-row toast-item${rarity}">${icon(e.icon)}` +
      `<span class="toast-item-name">${escapeHtml(e.name)}</span>${qty}</div>`;
  }

  function buildRewardHtml(title, head, lines, chunkEntries) {
    let html = title ? `<div class="toast-title">${escapeHtml(title)}</div>` : "";
    if (head && head.length) html += `<div class="toast-value">${escapeHtml(head.join(", "))}</div>`;
    if (lines) {
      for (const line of lines) html += `<div class="toast-note">${escapeHtml(line)}</div>`;
    }
    for (const e of chunkEntries) html += entryRow(e);
    return html;
  }

  /**
   * The standard "you got something" popup: battle spoils, harvested terrain,
   * dismantled furniture, opened loot. Every caller renders identically.
   *
   * reward({ entries, gold, exp, knowledge, lines, title, severity, duration })
   */
  function reward(opts = {}) {
    const entries = mergeEntries(opts.entries);
    const gold = Number(opts.gold) || 0;
    const exp = Number(opts.exp) || 0;
    const knowledge = Number(opts.knowledge) || 0;
    const lines = (opts.lines || []).filter(Boolean);
    if (!entries.length && !gold && !exp && !knowledge && !lines.length) return;

    // Remember what was just drawn, so the event command that hands the same
    // thing over a moment later does not report it a second time. A popup that
    // came from an event gain in the first place is not remembered: two chests
    // holding the same item, opened one after the other, are two finds.
    if (!opts.fromEventGain) noteRewarded(opts.entries, gold);

    const head = [];
    if (exp) head.push(`${exp} EXP`);
    if (gold) head.push(money(gold));
    if (knowledge) head.push(`${knowledge} KP`);

    const title = opts.title === null
      ? ""
      : (opts.title || T('ParchmentToast.obtained'));

    const chunks = [];
    if (entries.length === 0) {
      chunks.push([]);
    } else {
      for (let i = 0; i < entries.length; i += MAX_REWARD_ENTRIES) {
        chunks.push(entries.slice(i, i + MAX_REWARD_ENTRIES));
      }
    }

    const baseKey = opts.key || `reward:${Date.now()}:${Math.random()}`;

    function showChunk(index) {
      if (index >= chunks.length) return;
      const isFirst = (index === 0);
      const chunkEntries = chunks[index];
      const chunkHead = isFirst ? head : [];
      const chunkLines = isFirst ? lines : [];
      const html = buildRewardHtml(title, chunkHead, chunkLines, chunkEntries);

      // Everything the popup asks to be read counts: the value line, the notes
      // and every item row.
      const lineCount = chunkEntries.length + chunkLines.length + (chunkHead.length ? 1 : 0);
      const duration = opts.duration || Math.min(
        REWARD_BASE_FRAMES + REWARD_LINE_FRAMES * Math.max(0, lineCount - 1),
        REWARD_MAX_FRAMES
      );

      const chunkKey = chunks.length > 1 ? `${baseKey}:${index}` : baseKey;

      show(html, {
        severity: opts.severity || "info",
        duration,
        html: true,
        // Rewards are always a fresh event, never a repeat of a live toast.
        key: chunkKey,
        onDismiss: () => {
          const fighting = typeof $gameParty !== "undefined" && !!$gameParty && $gameParty.inBattle();
          if (fighting) return;
          showChunk(index + 1);
        }
      });
    }

    showChunk(0);
  }

  function gold(amount, opts = {}) {
    if (!amount) return;
    reward({
      gold: amount,
      title: opts.title,
      severity: opts.severity,
      duration: opts.duration
    });
  }

  // --------------------------------------------------------------------------
  // Needs (hunger / sleep / hygiene / social / leisure aka Fun)
  // --------------------------------------------------------------------------
  // PartyNeeds.LABELS already resolves through T.obj('TimeDate.needLabel'),
  // so this is the one place the vocabulary lives.
  function needLabel(needKey) {
    const labels = window.PartyNeeds && window.PartyNeeds.LABELS;
    return (labels && labels[needKey]) || needKey;
  }

  function needMedian(needKey) {
    try {
      const median = window.PartyNeeds && window.PartyNeeds.partyMedian
        ? window.PartyNeeds.partyMedian() : null;
      const v = median ? median[needKey] : null;
      return (v === null || v === undefined) ? null : Math.round(v);
    } catch (e) {
      return null;
    }
  }

  /**
   * "Fun 62% up +8" - the single format every need change in the game reports
   * in, whether it came from a minigame, the television, a meal or a bath.
   *
   * need('leisure', +8, { value, note, severity, duration })
   */
  function need(needKey, delta, opts = {}) {
    const d = Math.round(Number(delta) || 0);
    const label = opts.label || needLabel(needKey);
    const value = opts.value != null ? Math.round(opts.value) : needMedian(needKey);
    const shown = value === null ? "--" : value;
    const arrow = d > 0 ? "▲" : (d < 0 ? "▼" : "●");
    const sign = d > 0 ? "+" : "";
    const cls = d > 0 ? "toast-delta-up" : (d < 0 ? "toast-delta-down" : "toast-note");

    let html = `<div class="toast-row"><span>${escapeHtml(label)} ${shown}%</span>` +
      `<span class="${cls}">${arrow} ${sign}${d}</span></div>`;
    if (opts.note) html += `<div class="toast-note">${escapeHtml(opts.note)}</div>`;

    show(html, {
      severity: opts.severity || (d < 0 ? "warning" : "info"),
      duration: opts.duration || 80,
      html: true,
      // Keyed per need so a Fun change and a Hunger change coexist, but two
      // Fun changes in a row refresh one another rather than piling up.
      key: `need:${needKey}:${d}`  // i18n-ignore  dedupe key
    });
  }

  // --------------------------------------------------------------------------
  // Faction standing
  // --------------------------------------------------------------------------
  /**
   * "Sisters of the Ash 42 up +6" - every reputation change in the game, from
   * a quest paid out, a theft seen, a trial or a vote in the assembly, reports
   * in this one format. Crossing into a new band (friendly, hostile, ...) is
   * called out on a second line, because that is the part that changes how the
   * world treats the party.
   *
   * reputation('Sisters of the Ash', +6, { value, band, bandChanged, note })
   */
  function reputation(name, delta, opts = {}) {
    const d = Math.round(Number(delta) || 0);
    if (!d) return;
    const value = opts.value != null ? Math.round(opts.value) : null;
    const shown = value === null ? "--" : value;
    const arrow = d > 0 ? "▲" : "▼";
    const sign = d > 0 ? "+" : "";
    const cls = d > 0 ? "toast-delta-up" : "toast-delta-down";

    let html = `<div class="toast-row"><span>${escapeHtml(String(name))} ${shown}</span>` +
      `<span class="${cls}">${arrow} ${sign}${d}</span></div>`;
    if (opts.bandChanged && opts.band) {
      html += `<div class="toast-note">${escapeHtml(String(opts.band))}</div>`;
    }
    if (opts.note) html += `<div class="toast-note">${escapeHtml(opts.note)}</div>`;

    show(html, {
      severity: opts.severity || (opts.bandChanged ? (d > 0 ? "good" : "danger")
                                                   : (d < 0 ? "warning" : "info")),
      duration: opts.duration || (opts.bandChanged ? 200 : 120),
      html: true,
      title: opts.title || null,
      key: `rep:${name}`  // i18n-ignore  dedupe key
    });
  }

  // --------------------------------------------------------------------------
  // Specialization level ups
  // --------------------------------------------------------------------------
  function resolveSpec(spec) {
    const db = window.Specializations;
    if (!spec) return null;
    if (typeof spec === "object") return spec;
    if (!db || !db.ready) return null;
    if (typeof spec === "number") return db.byId ? db.byId.get(spec) : null;
    if (db.byName && db.byName.get) return db.byName.get(spec) || null;
    return null;
  }

  function specLevelName(level) {
    const db = window.Specializations;
    if (db && db.ready && typeof db.levelName === "function") {
      return db.levelName(level);
    }
    return String(level);
  }

  /**
   * "Em: Video Gaming -> Skilled". Called on every level up in the game, so a
   * weapon proficiency, a courtroom hour and a night at the arcade all report
   * the same way. Safe to call with a spec that could not be resolved.
   */
  function specUp(actor, spec, newLevel, opts = {}) {
    if (!newLevel) return;
    const resolved = resolveSpec(spec);
    const db = window.Specializations;
    const name = opts.name || (resolved
      ? (db && db.displayName ? db.displayName(resolved) : localized(resolved.name))
      : null);
    if (!name) return;
    const who = actor && actor.name ? actor.name() : "";
    const levelName = specLevelName(newLevel);
    const line = `${who ? who + ": " : ""}${name} → ${levelName}`;
    show(line, {
      severity: opts.severity || "good",
      duration: opts.duration || 180,
      icon: opts.icon,
      // In battle these arrive between attack lines, so they are drawn like
      // any other log line instead of as a purple toast.
      plainLog: true,
      key: `spec:${who}:${name}:${newLevel}`  // i18n-ignore  dedupe key
    });
  }

  /**
   * "Wasmir level rose to 3!" with a line an ability the level taught. A
   * character level is otherwise read out in a message box, which at the end
   * of a fight means a wall of text over the battle background: the battle
   * plugin holds these until the map is back and fires them here, one toast an
   * actor, right after the spoils.
   *
   * levelUp(name, level, newSkills)  - newSkills are skill records or names.
   */
  function levelUp(actorName, level, newSkills, opts = {}) {
    const who = localized(actorName);
    if (!who || !level) return;
    const tm = typeof TextManager !== "undefined" ? TextManager : null;
    const head = tm && tm.levelUp
      ? tm.levelUp.format(who, tm.level, level)
      : `${who} ${level}`;
    let html = `<div class="toast-title">${escapeHtml(head)}</div>`;
    for (const skill of (newSkills || [])) {
      const name = localized(typeof skill === "string" ? skill : (skill && skill.name));
      if (!name) continue;
      const learned = tm && tm.obtainSkill ? tm.obtainSkill.format(name) : name;
      const iconIndex = (skill && skill.iconIndex) || 0;
      html += `<div class="toast-row">${iconIndex ? icon(iconIndex) : ""}` +
        `<span>${escapeHtml(learned)}</span></div>`;
    }
    show(html, {
      severity: opts.severity || "good",
      duration: opts.duration || 240,
      html: true,
      key: `levelup:${who}:${level}`  // i18n-ignore  dedupe key
    });
  }

  // --------------------------------------------------------------------------
  // Skills cast outside battle
  // --------------------------------------------------------------------------
  // A skill carries its own two Message lines, and in a fight the battle log
  // reads them out. Cast from a menu there is no log to read them, so the
  // sentence would be lost and the skill would go off in silence: it is shown
  // here instead, so a skill sounds the same wherever it was used from.

  // %1 is who cast it, %2 is the skill, the same substitution the log makes.
  function skillCastLines(subject, skill) {
    const who = subject && subject.name ? subject.name() : "";
    const name = localized(skill.name);
    const lines = [];
    for (const raw of [skill.message1, skill.message2]) {
      const text = localized(raw);
      if (!text) continue;
      lines.push(typeof text.format === "function" ? text.format(who, name) : text);
    }
    return lines;
  }

  function skillCast(subject, skill, opts = {}) {
    if (!skill) return;
    const lines = skillCastLines(subject, skill);
    if (!lines.length) return;
    let html = `<div class="toast-row">${skill.iconIndex ? icon(skill.iconIndex) : ""}` +
      `<span>${escapeHtml(lines[0])}</span></div>`;
    for (const extra of lines.slice(1)) {
      html += `<div class="toast-note">${escapeHtml(extra)}</div>`;
    }
    const who = subject && subject.name ? subject.name() : "";
    show(html, {
      severity: opts.severity || "info",
      duration: opts.duration || 200,
      html: true,
      // Casting the same skill again refreshes the line rather than piling a
      // second copy of the same sentence on top of it.
      key: `skillcast:${who}:${skill.id}`  // i18n-ignore  dedupe key
    });
  }

  // Every menu route into a skill ends in useItem (the skill scene, the menu
  // search bar, the hotbar, the idle explorer), so the announcement is made
  // once here instead of at each of them. Nothing is said in battle, where the
  // log already reads the line out, and nothing is said for a battler outside
  // the party: those are being simulated (the tournament), not played.
  function announcesCast(subject, item) {
    if (!item || !item.id) return false;
    if (typeof DataManager === "undefined" || typeof DataManager.isSkill !== "function") return false;
    if (!DataManager.isSkill(item)) return false;
    if (typeof $gameParty === "undefined" || !$gameParty || $gameParty.inBattle()) return false;
    const members = ($gameParty.allMembers ? $gameParty.allMembers() : $gameParty.members()) || [];
    return members.indexOf(subject) >= 0;
  }

  if (typeof Game_Battler !== "undefined") {
    const _Game_Battler_useItem = Game_Battler.prototype.useItem;
    Game_Battler.prototype.useItem = function (item) {
      _Game_Battler_useItem.call(this, item);
      if (announcesCast(this, item)) skillCast(this, item);
    };
  }

  // ==========================================================================
  // Event gains
  // ==========================================================================
  // Anything a chest, a shop event or a quest page hands the party is a reward
  // like any other, so it is drawn by reward() rather than read out in a
  // message box the player has to close.

  const _rewarded = new Map(); // fingerprint -> timestamp

  function fingerprint(obj) {
    if (!obj) return null;
    if (typeof DataManager !== "undefined") {
      if (DataManager.isWeapon(obj)) return "w" + obj.id;
      if (DataManager.isArmor(obj)) return "a" + obj.id;
    }
    return "i" + obj.id;
  }

  function goldFingerprint(amount) {
    return "gold:" + Math.round(amount);  // i18n-ignore  dedupe key
  }

  function noteRewarded(entries, goldAmount) {
    const now = Date.now();
    for (const e of (entries || [])) {
      if (!e) continue;
      const fp = e.obj ? fingerprint(e.obj) : (e.id != null ? "i" + e.id : null);
      if (fp) _rewarded.set(fp, now);
    }
    if (goldAmount) _rewarded.set(goldFingerprint(goldAmount), now);
  }

  function alreadyRewarded(fp) {
    const at = _rewarded.get(fp);
    if (at == null) return false;
    if (Date.now() - at >= GAIN_DEDUPE_MS) {
      _rewarded.delete(fp);
      return false;
    }
    return true;
  }

  // One event can hand over money and several items in the same frame, and
  // that is one find, not four popups: the gains are collected and drawn
  // together once the interpreter has finished with them.
  let _pendingGains = null;   // { gold, entries: Map(fingerprint -> { obj, qty }) }
  let _gainTimer = null;

  function pendingGains() {
    if (!_pendingGains) _pendingGains = { gold: 0, entries: new Map() };
    if (_gainTimer === null) _gainTimer = setTimeout(flushGains, 0);
    return _pendingGains;
  }

  function queueGoldGain(amount) {
    const value = Math.round(Number(amount) || 0);
    if (value <= 0) return;
    pendingGains().gold += value;
  }

  function queueItemGain(obj, amount) {
    const qty = Math.round(Number(amount) || 0);
    if (!obj || qty <= 0) return;
    const fp = fingerprint(obj);
    const entries = pendingGains().entries;
    const hit = entries.get(fp);
    if (hit) hit.qty += qty;
    else entries.set(fp, { obj, qty });
  }

  function flushGains() {
    _gainTimer = null;
    const batch = _pendingGains;
    _pendingGains = null;
    if (!batch) return;

    const entries = [];
    for (const [fp, entry] of batch.entries) {
      if (alreadyRewarded(fp)) continue;
      entries.push({ obj: entry.obj, qty: entry.qty });
    }
    const goldAmount = alreadyRewarded(goldFingerprint(batch.gold)) ? 0 : batch.gold;
    if (!entries.length && !goldAmount) return;

    reward({ entries, gold: goldAmount, fromEventGain: true });
  }

  // The event doing the talking. A common event called from a map event keeps
  // its caller's id, so a chest that delegates its page still counts as one.
  function interpreterEventName(interpreter) {
    if (typeof $gameMap === "undefined" || !$gameMap) return "";
    const eventId = interpreter && interpreter.eventId ? interpreter.eventId() : 0;
    if (!eventId) return "";
    if (interpreter._mapId && interpreter._mapId !== $gameMap.mapId()) return "";
    const event = $gameMap.event(eventId);
    const data = event && event.event ? event.event() : null;
    return data && data.name ? String(data.name).trim() : "";
  }

  function isSilentEvent(interpreter) {
    const name = interpreterEventName(interpreter).toLowerCase();
    return SILENT_EVENT_PREFIXES.some((prefix) => name.startsWith(prefix));
  }

  if (typeof Game_Interpreter !== "undefined") {
    // Dropping the command alone would leave its text lines behind as
    // commands of their own, so they are stepped over exactly as the message
    // would have consumed them.
    const skipFollowing = (interpreter, code) => {
      while (interpreter.nextEventCode() === code) interpreter._index++;
    };

    const _command101 = Game_Interpreter.prototype.command101;
    Game_Interpreter.prototype.command101 = function (params) {
      if (isSilentEvent(this)) {
        skipFollowing(this, 401);
        return true;
      }
      return _command101.call(this, params);
    };

    const _command105 = Game_Interpreter.prototype.command105;
    Game_Interpreter.prototype.command105 = function (params) {
      if (isSilentEvent(this)) {
        skipFollowing(this, 405);
        return true;
      }
      return _command105.call(this, params);
    };

    // The party is measured before and after, so what is announced is what it
    // actually received.
    const _command125 = Game_Interpreter.prototype.command125;
    Game_Interpreter.prototype.command125 = function (params) {
      const before = $gameParty.gold();
      const result = _command125.call(this, params);
      queueGoldGain($gameParty.gold() - before);
      return result;
    };

    const hookItemCommand = (code, database) => {
      const method = "command" + code;
      const original = Game_Interpreter.prototype[method];
      Game_Interpreter.prototype[method] = function (params) {
        const db = database();
        const obj = db ? db[params[0]] : null;
        const before = obj ? $gameParty.numItems(obj) : 0;
        const result = original.call(this, params);
        if (obj) queueItemGain(obj, $gameParty.numItems(obj) - before);
        return result;
      };
    };

    hookItemCommand(126, () => (typeof $dataItems !== "undefined" ? $dataItems : null));
    hookItemCommand(127, () => (typeof $dataWeapons !== "undefined" ? $dataWeapons : null));
    hookItemCommand(128, () => (typeof $dataArmors !== "undefined" ? $dataArmors : null));
  }

  window.ParchmentToast = {
    show,
    sticky,
    dismiss,
    isLive,
    clear,
    group,
    reward,
    gold,
    need,
    reputation,
    specUp,
    levelUp,
    skillCast,
    icon,
    money
  };
})();
