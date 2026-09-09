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
 *   duration  display time in frames (default 180 = 3s), excludes fades
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

  // The rarity ladder ItemSystemUtils reads out of js/db/Items/Rarity.json,
  // low to high. A row is coloured by where its tier sits in that ladder, not
  // by its name, so a table that renames or adds tiers still lands on a class.
  const RARITY_CLASSES = ["common", "uncommon", "rare", "epic", "legendary"];  // i18n-ignore  css class suffixes

  let _stackEl = null;
  let _rafId = null;
  const _live = new Map(); // key -> { el, hideAt, fading }

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
    const canvas = document.getElementById("gameCanvas");
    if (!canvas || !_stackEl) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / Graphics.width;
    const sy = r.height / Graphics.height;
    const s = _stackEl.style;
    // Anchored to the canvas' top-right corner: the party HUD (PartyHud.js)
    // owns the top-left one, so the two never have to dodge each other.
    s.left = "auto";
    s.right = (window.innerWidth - r.right) + 20 * sx + "px";
    s.top = r.top + 20 * sy + "px";
    s.fontSize = Math.round(19 * sy) + "px";
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
        return;
      }
    }

    const durationMs = (opts.duration || 180) * FRAME_MS;
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

    _live.set(key, { el, hideAt, fading: false, persist });
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

    const head = [];
    if (exp) head.push(`${exp} EXP`);
    if (gold) head.push(money(gold));
    if (knowledge) head.push(`${knowledge} KP`);

    const title = opts.title === null
      ? ""
      : (opts.title || T('ParchmentToast.obtained'));

    let html = title ? `<div class="toast-title">${escapeHtml(title)}</div>` : "";
    if (head.length) html += `<div class="toast-value">${escapeHtml(head.join(", "))}</div>`;
    for (const line of lines) html += `<div class="toast-note">${escapeHtml(line)}</div>`;
    for (const e of entries) html += entryRow(e);

    // Remember what was just drawn, so the event command that hands the same
    // thing over a moment later does not report it a second time. A popup that
    // came from an event gain in the first place is not remembered: two chests
    // holding the same item, opened one after the other, are two finds.
    if (!opts.fromEventGain) noteRewarded(opts.entries, gold);

    // Everything the popup asks to be read counts: the value line, the notes
    // and every item row.
    const lineCount = entries.length + lines.length + (head.length ? 1 : 0);
    const duration = opts.duration || Math.min(
      REWARD_BASE_FRAMES + REWARD_LINE_FRAMES * Math.max(0, lineCount - 1),
      REWARD_MAX_FRAMES
    );

    show(html, {
      severity: opts.severity || "info",
      duration,
      html: true,
      // Rewards are always a fresh event, never a repeat of a live toast.
      key: opts.key || `reward:${Date.now()}:${Math.random()}`  // i18n-ignore  dedupe key
    });
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
      duration: opts.duration || 110,
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
