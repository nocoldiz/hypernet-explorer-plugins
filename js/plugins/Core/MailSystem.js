/*:
 * @target MZ
 * @plugindesc The post: letters between parties, in this world and in every other one, with money and goods enclosed and a delivery date of the sender's choosing.
 * @author Esoteric Heavy Industries
 *
 * @command OpenMailCompose
 * @text Write a Letter
 * @desc Opens the post at the writing desk: address a letter, enclose money and goods, choose when it arrives, send it.
 *
 * @command OpenMailbox
 * @text Open the Mailbox
 * @desc Opens the post at the mailbox: every letter this party has been sent, and whatever came in the envelope.
 *
 * @help MailSystem.js
 * ============================================================================
 * A world folder is shared by every savegame of that world, and the machine
 * holds several worlds side by side. That is already a postal network: one
 * party can write to another party of the same world, or to a party living in
 * a different world entirely, and the letter waits in the recipient's mailbox
 * until somebody plays them.
 *
 * WHERE A LETTER LIVES
 *   A letter is stored in the world folder it is RECEIVED in, never in the
 *   sender's: save/worlds/<recipient world>/mail.json, written through
 *   WorldManager.writeWorldFile the moment it is sent, so the world it is
 *   addressed to does not have to be the one being played.
 *
 *   mail.json holds two things:
 *     parties - the address book: every party that has ever played in this
 *               world, with its leader, its members and when it was last seen.
 *               A party registers itself on the first map it loads.
 *     inbox   - the letters, keyed by the recipient party's id.
 *
 *   A party's id lives in the binary savegame ($gameSystem._mailPartyId), so a
 *   party IS a savegame: two savegames of one world are two correspondents.
 *
 * WHEN IT ARRIVES
 *   A letter carries a delivery date, measured in the RECIPIENT world's clock
 *   (its own worldTimeMinutes, which is the latest date any savegame of that
 *   world has reached). The sender may hold it back by days, months or years;
 *   until that date passes the letter is in transit and the mailbox will not
 *   show it. Writing to your own party with a delay is therefore a letter to
 *   your future self, and it is offered deliberately.
 *
 * WHAT IT COSTS
 *   Inside one world the post is free. A letter that has to cross into another
 *   world is priced against the two commodities that survive the crossing, oil
 *   and souls: their two prices multiplied, doubled once per step of
 *   dimensional distance between the two worlds (a figure derived from their
 *   names and seeds, so the same pair always costs the same), and never less
 *   than 300,000 EUR. In practice that is tens of millions of euros, and
 *   between distant dimensions it runs into the billions. It is meant to be
 *   ruinous: see window.MailSystem.postage(world, payload).
 *
 * COLLECTING
 *   Money and goods enclosed with a letter are taken out of the sender's
 *   pockets at once and handed over ONCE, when the recipient collects them.
 *   A collected letter can be read again but never pays twice.
 *
 * SERVICE
 *   window.MailSystem
 *     .partyId()                  this savegame's postal id
 *     .registerSelf()             write this party into its world's address book
 *     .directory()                every world and the parties in it
 *     .inbox({pending})           letters delivered to this party
 *     .pendingCount()             letters still in transit to this party
 *     .postage(world, payload)    what crossing to that world costs, in euros
 *     .send(letter)               -> { ok, error, fee }
 *     .collect(id) / .markRead(id) / .discard(id)
 *
 * POST EXPRESS
 *   The same post as a HypernetOS program, "app-hypermail", registered on the
 *   desktop by default: folders, a reading pane, an address book of every
 *   dimension and a compose sheet that encloses money and goods exactly as the
 *   parchment does. Launch it with window.HyperMailApp.launch(), or straight
 *   onto a blank sheet with window.HyperMailApp.compose(). The half written
 *   letter lives on $gameSystem._hypermailDraft.
 *
 * Requires Core/WorldManager (world folders) and reads Economy/StockMarket
 * prices when they are loaded. Load after WorldManager.
 * ============================================================================
 */

(() => {
  "use strict";

  const MAIL_FILE = "mail";
  const GOLD_PER_EURO = 100;
  // The floor under any crossing between worlds, in euros.
  const MIN_FOREIGN_FEE = 300000;
  // How far two dimensions can stand apart. The fee doubles per step, so the
  // ceiling here is what turns a hundred-thousand-euro stamp into a billion.
  const MAX_DIM_DISTANCE = 12;
  // Fallback commodity prices (in gold) when the market plugin is absent.
  const FALLBACK_OIL = 40000;
  const FALLBACK_SOUL = 66666;

  const DELAY_LIMITS = { days: 365, months: 120, years: 50 };

  //=========================================================================
  // Small helpers
  //=========================================================================

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  // 100 gold = 1.00 EUR everywhere in the project, drawn the way
  // Window_Base#formatMoneyValue draws it: a dot before the last two digits and
  // no grouping, since a grouped European figure and a decimal point read as
  // the same character.
  function moneyLabel(gold) {
    const value = Math.round(Number(gold) || 0);
    const str = String(Math.abs(value));
    let main = str.length <= 2 ? "0." + str.padStart(2, "0") : str.slice(0, -2) + "." + str.slice(-2);
    if (main.endsWith(".00")) main = main.slice(0, -3);
    const unit = ($dataSystem && $dataSystem.currencyUnit) || "";
    return `${value < 0 ? "-" : ""}${main}${unit ? " " + unit : ""}`;
  }

  function euroLabel(euros) {
    return moneyLabel(Math.round(Number(euros) || 0) * GOLD_PER_EURO);
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function WM() {
    return window.WorldManager || null;
  }

  function activeWorld() {
    const wm = WM();
    return wm && wm.activeWorldName ? wm.activeWorldName : null;
  }

  function hasParty() {
    return typeof $gameParty !== "undefined" && !!$gameParty && !!$gameParty.leader();
  }

  //=========================================================================
  // The world calendar
  //
  // The clock is minutes since 1 Jan 2001, 10:00 (TimeDateSystem's epoch), and
  // it is a real Gregorian calendar, so "three months from now" is answered by
  // a Date rather than by a month of fixed length.
  //=========================================================================

  function epoch() {
    return new Date(2001, 0, 1, 10, 0, 0);
  }

  function minutesToDate(minutes) {
    const d = epoch();
    d.setMinutes(d.getMinutes() + (Number(minutes) || 0));
    return d;
  }

  function dateToMinutes(date) {
    return Math.round((date.getTime() - epoch().getTime()) / 60000);
  }

  function addDelay(minutes, delay) {
    const d = minutesToDate(minutes);
    const years = Math.max(0, Number(delay && delay.years) || 0);
    const months = Math.max(0, Number(delay && delay.months) || 0);
    const days = Math.max(0, Number(delay && delay.days) || 0);
    if (years) d.setFullYear(d.getFullYear() + years);
    if (months) d.setMonth(d.getMonth() + months);
    if (days) d.setDate(d.getDate() + days);
    return dateToMinutes(d);
  }

  function stampOf(minutes) {
    if (window.TimeDateSystem && window.TimeDateSystem.getDateTimeFromMinutes) {
      return window.TimeDateSystem.getDateTimeFromMinutes(minutes).fullDate;
    }
    const d = minutesToDate(minutes);
    return d.toLocaleString();
  }

  // The latest date any savegame of that world has reached.
  function worldClock(worldName) {
    const wm = WM();
    if (!wm || !worldName) return 0;
    if (worldName === wm.activeWorldName) return wm.worldClockMinutes();
    if (!_foreignClocks.has(worldName)) {
      const info = wm.readWorldFile(worldName, "world");
      _foreignClocks.set(worldName, Math.max(0, Number(info && info.worldTimeMinutes) || 0));
    }
    return _foreignClocks.get(worldName);
  }

  // Another world's world.json is a disk read, and both the seed and the clock
  // of a world nobody is playing cannot move while this session runs, so each
  // is read once. The active world is never cached: its clock is the one that
  // ticks.
  const _foreignSeeds = new Map();
  const _foreignClocks = new Map();

  function worldSeed(worldName) {
    const wm = WM();
    if (!wm || !worldName) return "";
    if (worldName === wm.activeWorldName) {
      return String(wm.worldInfo().seed ?? "");
    }
    if (!_foreignSeeds.has(worldName)) {
      const info = wm.readWorldFile(worldName, "world");
      _foreignSeeds.set(worldName, String((info && info.seed) ?? ""));
    }
    return _foreignSeeds.get(worldName);
  }

  //=========================================================================
  // The mail file
  //=========================================================================

  function normalizeMail(data) {
    const out = (data && typeof data === "object") ? data : {};
    if (!out.parties || typeof out.parties !== "object") out.parties = {};
    if (!out.inbox || typeof out.inbox !== "object") out.inbox = {};
    if (!Number.isFinite(out.nextId)) out.nextId = 1;
    return out;
  }

  // The active world's file is the live cache, so mutating what comes back
  // mutates the world store; any other world's is a copy that has to be
  // written back with writeMail.
  function readMail(worldName) {
    const wm = WM();
    if (!wm || !worldName) return normalizeMail(null);
    if (worldName === wm.activeWorldName) return normalizeMail(wm.getFile(MAIL_FILE));
    return normalizeMail(wm.readWorldFile(worldName, MAIL_FILE));
  }

  function writeMail(worldName, data) {
    const wm = WM();
    if (!wm || !worldName || !wm.writeWorldFile) return false;
    return wm.writeWorldFile(worldName, MAIL_FILE, data);
  }

  //=========================================================================
  // Who this party is
  //=========================================================================

  function partyId() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    if (!$gameSystem._mailPartyId) {
      $gameSystem._mailPartyId = "P" + Date.now().toString(36) +
        Math.floor(Math.random() * 1679616).toString(36);
    }
    return $gameSystem._mailPartyId;
  }

  function selfCard() {
    const leader = hasParty() ? $gameParty.leader() : null;
    return {
      id: partyId(),
      world: activeWorld(),
      name: leader ? leader.name() : T("Mail.unknownParty"),
      members: hasParty() ? $gameParty.members().map((a) => a.name()) : [],
      level: leader ? leader.level : 0,
      minute: worldClock(activeWorld()),
      updatedAt: Date.now()
    };
  }

  function partyLabel(card) {
    if (!card) return T("Mail.unknownParty");
    const others = Math.max(0, (card.members || []).length - 1);
    return others > 0
      ? T("Mail.partyWith", { leader: card.name, count: others })
      : T("Mail.partyAlone", { leader: card.name });
  }

  // Writes this party into its own world's address book, so anybody else can
  // write to it. Cheap and idempotent; called on the first map of a session,
  // whenever the post is opened, and on every save.
  function registerSelf() {
    const world = activeWorld();
    if (!world || !hasParty()) return false;
    const data = readMail(world);
    data.parties[partyId()] = selfCard();
    invalidateDirectory();
    return writeMail(world, data);
  }

  //=========================================================================
  // The address book
  //
  // Reading it means opening every world's mail.json, so it is built once and
  // held until something is posted or this party's own card changes.
  //=========================================================================

  let _dirCache = null;

  function invalidateDirectory() {
    _dirCache = null;
  }

  function directory() {
    if (_dirCache) return _dirCache;
    const wm = WM();
    if (!wm) return [];
    const here = activeWorld();
    const names = (wm.listWorlds() || []).map((w) => w.name);
    if (here && !names.includes(here)) names.push(here);
    const me = partyId();
    const out = [];
    for (const world of names) {
      const data = readMail(world);
      const parties = Object.keys(data.parties)
        .map((id) => data.parties[id])
        .filter((card) => card && card.id)
        .map((card) => Object.assign({}, card, {
          world,
          isSelf: world === here && card.id === me
        }))
        .sort((a, b) => (b.minute || 0) - (a.minute || 0));
      if (parties.length) out.push({ world, foreign: world !== here, parties });
    }
    // Home first, then the other dimensions by name.
    out.sort((a, b) => {
      if (a.foreign !== b.foreign) return a.foreign ? 1 : -1;
      return String(a.world).localeCompare(String(b.world));
    });
    _dirCache = out;
    return out;
  }

  function findCard(world, id) {
    if (!world || !id) return null;
    for (const group of directory()) {
      if (group.world !== world) continue;
      const card = group.parties.find((c) => c.id === id);
      if (card) return card;
    }
    return null;
  }

  //=========================================================================
  // Postage
  //
  // Inside one world the post is free. Crossing into another is priced against
  // the two commodities that survive the crossing, and doubles with every step
  // of distance between the dimensions.
  //=========================================================================

  function commodityPrices() {
    const market = (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem.stockMarket) || null;
    let oil = market && market.getOilPrice ? Number(market.getOilPrice()) : NaN;
    let soul = market && market.getSoulsPrice ? Number(market.getSoulsPrice()) : NaN;
    if (!(oil > 0)) oil = FALLBACK_OIL;
    if (!(soul > 0)) soul = FALLBACK_SOUL;
    return { oil, soul };
  }

  // How far apart two dimensions stand, 0..MAX_DIM_DISTANCE. Symmetric and
  // stable: the same pair of worlds always answers the same. Two worlds grown
  // from the same seed are reflections of each other and sit half as far apart.
  function dimensionalDistance(a, b) {
    if (!a || !b || a === b) return 0;
    const sigA = a + "|" + worldSeed(a);
    const sigB = b + "|" + worldSeed(b);
    const key = [sigA, sigB].sort().join(" ");
    let d = hashString(key) % (MAX_DIM_DISTANCE + 1);
    if (worldSeed(a) === worldSeed(b)) d = Math.floor(d / 2);
    return d;
  }

  // What it costs to post into `targetWorld`, in euros. `payload` is optional
  // ({ gold, items }): a heavy envelope costs more than a bare letter.
  function postage(targetWorld, payload) {
    const here = activeWorld();
    if (!here || !targetWorld || targetWorld === here) return 0;
    const { oil, soul } = commodityPrices();
    const base = (oil / GOLD_PER_EURO) * (soul / GOLD_PER_EURO);
    const leap = Math.pow(2, dimensionalDistance(here, targetWorld));
    const pieces = payload && Array.isArray(payload.items)
      ? payload.items.reduce((n, ref) => n + (Number(ref.count) || 0), 0) : 0;
    const enclosed = payload ? (Number(payload.gold) || 0) / GOLD_PER_EURO : 0;
    const load = 1 + pieces * 0.05 + enclosed / 5000000;
    return Math.max(MIN_FOREIGN_FEE, Math.round(base * leap * load));
  }

  //=========================================================================
  // What can be put in an envelope
  //=========================================================================

  function itemKind(item) {
    if (!item) return null;
    if (DataManager.isItem(item)) return "item";
    if (DataManager.isWeapon(item)) return "weapon";
    if (DataManager.isArmor(item)) return "armor";
    return null;
  }

  function resolveRef(ref) {
    if (!ref) return null;
    const db = ref.kind === "weapon" ? $dataWeapons
      : ref.kind === "armor" ? $dataArmors
        : ref.kind === "item" ? $dataItems : null;
    return db ? db[Number(ref.id)] : null;
  }

  // A key item is never merchandise and is never posted either: it is somebody
  // else's quest that would go missing in the mail.
  function isMailable(item) {
    if (!item || !item.name) return false;
    if (DataManager.isItem(item) && item.itypeId === 2) return false;
    // Em's vector gun is never a parcel either (Weapon/VectorGunSystem.js).
    if (window.VectorGun && window.VectorGun.isBound(item)) return false;
    return !!itemKind(item);
  }

  function mailableStock() {
    if (!hasParty()) return [];
    return $gameParty.allItems()
      .filter(isMailable)
      .map((item) => ({
        item,
        kind: itemKind(item),
        id: item.id,
        held: $gameParty.numItems(item)
      }))
      .filter((row) => row.held > 0);
  }

  //=========================================================================
  // Sending, receiving, collecting
  //=========================================================================

  function sanitizeItems(items) {
    const out = [];
    for (const ref of (Array.isArray(items) ? items : [])) {
      const obj = resolveRef(ref);
      const count = Math.max(0, Math.floor(Number(ref.count) || 0));
      if (!obj || !count) continue;
      out.push({ kind: ref.kind, id: Number(ref.id), count });
    }
    return out;
  }

  // letter: { world, partyId, subject, body, gold, items, delay:{days,months,years} }
  function send(letter) {
    const here = activeWorld();
    if (!here) return { ok: false, error: T("Mail.error.noWorld") };
    if (!hasParty()) return { ok: false, error: T("Mail.error.noParty") };
    const world = letter && letter.world;
    const toId = letter && letter.partyId;
    if (!world || !toId) return { ok: false, error: T("Mail.error.noRecipient") };
    const recipient = findCard(world, toId);
    if (!recipient) return { ok: false, error: T("Mail.error.goneAway") };

    const items = sanitizeItems(letter.items);
    for (const ref of items) {
      const obj = resolveRef(ref);
      if (!obj || $gameParty.numItems(obj) < ref.count) {
        return { ok: false, error: T("Mail.error.shortStock", { item: obj ? obj.name : "?" }) };
      }
    }

    const gold = Math.max(0, Math.floor(Number(letter.gold) || 0));
    const fee = postage(world, { gold, items });
    const feeGold = fee * GOLD_PER_EURO;
    if ($gameParty.gold() < gold + feeGold) {
      return { ok: false, error: T("Mail.error.tooPoor", { total: moneyLabel(feeGold + gold) }) };
    }

    const subject = String(letter.subject || "").slice(0, 120).trim() || T("Mail.noSubject");
    const body = String(letter.body || "").slice(0, 8000);
    if (!body.trim() && !gold && !items.length) {
      return { ok: false, error: T("Mail.error.blank") };
    }

    const delay = {
      days: Math.min(DELAY_LIMITS.days, Math.max(0, Math.floor(Number(letter.delay && letter.delay.days) || 0))),
      months: Math.min(DELAY_LIMITS.months, Math.max(0, Math.floor(Number(letter.delay && letter.delay.months) || 0))),
      years: Math.min(DELAY_LIMITS.years, Math.max(0, Math.floor(Number(letter.delay && letter.delay.years) || 0)))
    };
    // The delivery date is read on the recipient's calendar, not the sender's.
    const arrival = addDelay(worldClock(world), delay);

    const data = readMail(world);
    const id = "M" + (data.nextId++) + "-" + Date.now().toString(36);
    const message = {
      id,
      from: {
        world: here,
        partyId: partyId(),
        name: selfCard().name,
        label: partyLabel(selfCard())
      },
      to: { world, partyId: toId, label: partyLabel(recipient) },
      subject,
      body,
      gold,
      items,
      fee,
      delay,
      sentAt: Date.now(),
      sentMinute: worldClock(here),
      deliverAt: arrival,
      read: false,
      announced: false,
      collected: false
    };
    if (!Array.isArray(data.inbox[toId])) data.inbox[toId] = [];
    data.inbox[toId].push(message);
    if (!writeMail(world, data)) {
      // The active world's file is the live cache: a letter that never reached
      // the disk must not be left sitting in it either.
      data.inbox[toId].pop();
      data.nextId--;
      return { ok: false, error: T("Mail.error.notPosted") };
    }

    // Paid only once the letter is safely in the recipient's folder.
    $gameParty.loseGold(gold + feeGold);
    for (const ref of items) {
      const obj = resolveRef(ref);
      if (obj) $gameParty.loseItem(obj, ref.count, false);
    }
    // Whoever is written to should be able to write back.
    registerSelf();
    return { ok: true, fee, message };
  }

  /**
   * Post a letter nobody wrote and nobody paid for: a delivery the WORLD makes,
   * to a party that may not even be the one playing. No sender party, no
   * postage, no stock check - the goods are conjured into the parcel rather
   * than taken out of somebody's pack, which is the whole difference from
   * send() above.
   *
   * letter: { world, partyId, from, subject, body, gold, items }
   * `from` is a plain label for the sender line. Answers { ok, message }.
   *
   * Idempotent on `letter.once`: a key stamped on the message and on the
   * recipient's box, so the same delivery made twice - two map loads, a reload -
   * lands once. This is what the patron vault's vessel is posted with.
   */
  function post(letter) {
    const world = letter && letter.world;
    const toId = letter && letter.partyId;
    if (!world || !toId) return { ok: false, error: T("Mail.error.noRecipient") };
    const data = readMail(world);
    if (!Array.isArray(data.inbox[toId])) data.inbox[toId] = [];
    const once = letter.once ? String(letter.once) : null;
    if (once && data.inbox[toId].some((m) => m && m.once === once)) {
      return { ok: false, already: true };
    }
    const items = sanitizeItems(letter.items);
    const gold = Math.max(0, Math.floor(Number(letter.gold) || 0));
    const recipient = findCard(world, toId);
    const id = "M" + (data.nextId++) + "-" + Date.now().toString(36);
    const message = {
      id,
      once,
      from: {
        world,
        partyId: null,
        name: String(letter.from || T("Mail.unknownParty")),
        label: String(letter.from || T("Mail.unknownParty"))
      },
      to: { world, partyId: toId, label: partyLabel(recipient) },
      subject: String(letter.subject || "").slice(0, 120).trim() || T("Mail.noSubject"),
      body: String(letter.body || "").slice(0, 8000),
      gold,
      items,
      fee: 0,
      delay: { days: 0, months: 0, years: 0 },
      sentAt: Date.now(),
      sentMinute: worldClock(world),
      // Already on the doormat: a world's own delivery does not travel.
      deliverAt: worldClock(world),
      read: false,
      announced: false,
      collected: false
    };
    data.inbox[toId].push(message);
    if (!writeMail(world, data)) {
      data.inbox[toId].pop();
      data.nextId--;
      return { ok: false, error: T("Mail.error.notPosted") };
    }
    return { ok: true, message };
  }

  /** Every party this world has written into its address book. */
  function partiesIn(world) {
    if (!world) return [];
    const data = readMail(world);
    return Object.keys(data.parties)
      .map((id) => data.parties[id])
      .filter((card) => card && card.id);
  }

  function ownLetters() {
    const world = activeWorld();
    if (!world || !hasParty()) return { world: null, data: null, list: [] };
    const data = readMail(world);
    const list = Array.isArray(data.inbox[partyId()]) ? data.inbox[partyId()] : [];
    return { world, data, list };
  }

  function inbox(options = {}) {
    const { world, list } = ownLetters();
    if (!world) return [];
    const now = worldClock(world);
    return list
      .filter((m) => options.pending ? true : (Number(m.deliverAt) || 0) <= now)
      .slice()
      .sort((a, b) => (Number(b.deliverAt) || 0) - (Number(a.deliverAt) || 0));
  }

  function pendingCount() {
    const { world, list } = ownLetters();
    if (!world) return 0;
    const now = worldClock(world);
    return list.filter((m) => (Number(m.deliverAt) || 0) > now).length;
  }

  function unreadCount() {
    return inbox().filter((m) => !m.read).length;
  }

  function findOwn(id) {
    const { world, data, list } = ownLetters();
    if (!world) return null;
    const message = list.find((m) => m.id === id) || null;
    return message ? { world, data, message } : null;
  }

  function markRead(id) {
    const found = findOwn(id);
    if (!found || found.message.read) return false;
    found.message.read = true;
    return writeMail(found.world, found.data);
  }

  // Whatever came in the envelope, handed over once and only once.
  function collect(id) {
    const found = findOwn(id);
    if (!found) return { ok: false, error: T("Mail.error.gone") };
    const { world, data, message } = found;
    if (message.collected) return { ok: false, error: T("Mail.error.alreadyTaken") };
    if ((Number(message.deliverAt) || 0) > worldClock(world)) {
      return { ok: false, error: T("Mail.error.notYet") };
    }
    const gold = Math.max(0, Math.floor(Number(message.gold) || 0));
    const items = sanitizeItems(message.items);
    if (!gold && !items.length) return { ok: false, error: T("Mail.error.emptyEnvelope") };
    if (gold) $gameParty.gainGold(gold);
    for (const ref of items) {
      const obj = resolveRef(ref);
      if (obj) $gameParty.gainItem(obj, ref.count, false);
    }
    message.collected = true;
    message.collectedAt = Date.now();
    message.read = true;
    writeMail(world, data);
    return { ok: true, gold, items };
  }

  function discard(id) {
    const found = findOwn(id);
    if (!found) return false;
    const { world, data, message } = found;
    const list = data.inbox[partyId()] || [];
    const at = list.indexOf(message);
    if (at < 0) return false;
    list.splice(at, 1);
    return writeMail(world, data);
  }

  // Letters that have just come due since the last look. Marks them announced,
  // so the toast is shown once and not on every map load afterwards.
  function takeArrivals() {
    const { world, data, list } = ownLetters();
    if (!world) return [];
    const now = worldClock(world);
    const fresh = list.filter((m) => !m.announced && (Number(m.deliverAt) || 0) <= now);
    if (!fresh.length) return [];
    fresh.forEach((m) => { m.announced = true; });
    writeMail(world, data);
    return fresh;
  }

  //=========================================================================
  // Nudge: the messenger, as a HypernetOS program
  //=========================================================================
  // The post carries parcels between parties and takes days doing it. This is
  // the other half: the live window, named after the one feature everybody
  // remembers. The contact list is the same address book the post reads - the
  // parties of this world, which are its other savegames - plus everyone
  // walking with you, plus the three names that answer whoever asks.
  //
  // What comes back is written by NPCEmpathize's own machinery: a language
  // model when one is picked in Options, and the Markov chain when there is
  // not, so the window works on any machine. The three named contacts carry a
  // paragraph of who they are, which is handed to the model and to nothing
  // else: the chain has no use for it.
  const NUDGE_APP_ID = 'app-nudge';
  const NUDGE_ICON = 246; // Talk, per js/db/Sprites/Icons.json

  const NG = {
    app: "display:flex; flex-direction:column; height:100%; background:var(--xp-face-5); " +
         "font-family:'Tahoma',sans-serif; font-size:15px; color:var(--xp-ink-2);",
    header: "display:flex; align-items:center; gap:12px; padding:8px 12px; " +
            "background:linear-gradient(to bottom,#4a8fd4,#2f6cb0); color:var(--xp-white); border-bottom:2px solid #1b3f6b;",
    list: "width:210px; flex-shrink:0; overflow-y:auto; background:var(--xp-white); " +
          "border-right:1px solid var(--xp-face-shade);",
    group: "padding:4px 8px; background:var(--xp-face-6); font-size:13px; font-weight:bold; color:#2f6cb0;",
    contact: "display:flex; gap:6px; align-items:center; padding:5px 8px; cursor:pointer; border-bottom:1px solid #f0efe8;",
    talk: "flex:1; min-width:0; display:flex; flex-direction:column; background:var(--xp-face-2);",
    log: "flex:1; overflow-y:auto; padding:10px 12px; background:var(--xp-white);",
    line: "margin-bottom:6px; line-height:1.45;",
    who: "font-weight:bold;",
    entry: "display:flex; gap:6px; padding:6px 8px; border-top:1px solid var(--xp-face-shade); background:var(--xp-face-5);",
    input: "flex:1; font-family:'Tahoma',sans-serif; font-size:14px; padding:4px 6px; " +
           "border:1px solid var(--xp-face-4); background:var(--xp-white);",
    btn: "padding:4px 12px; background:linear-gradient(to bottom,var(--xp-paper),#dcd8cc); " +
         "border:1px solid var(--xp-face-4); border-radius:3px; cursor:pointer; font-size:14px; user-select:none;",
    note: "color:var(--xp-ink-soft-2); font-size:13px;",
  };

  const ngEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const ngIcon = (index, size) => (window.HypernetOS ? window.HypernetOS.getIconHTML(index, size || 16) : '');

  // The three that answer whoever asks, and the paragraph each is handed to a
  // model. Every word of it is the lore the rest of the plugins already run on
  // (ErisDateSystem's own notes, docs/Lore.odt); the text itself is written in
  // the i18n file so it reads in the player's language.
  // i18n-ignore-start  contact ids
  const NUDGE_LORE = [
    { id: 'eris',  nameKey: 'Mail.nudge.lore.eris.name',  bioKey: 'Mail.nudge.lore.eris.bio',  status: 'busy' },
    { id: 'bubba', nameKey: 'Mail.nudge.lore.bubba.name', bioKey: 'Mail.nudge.lore.bubba.bio', status: 'online' },
    { id: 'em',    nameKey: 'Mail.nudge.lore.em.name',    bioKey: 'Mail.nudge.lore.em.bio',    status: 'away' },
  ];
  // i18n-ignore-end

  const NUDGE_STATUS_COLOUR = { online: '#2e8b3f', away: '#d0a020', busy: '#c0392b', offline: '#8b8b8b' };

  function nudgeChats() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return {};
    if (!$gameSystem._nudgeChats) $gameSystem._nudgeChats = {};
    return $gameSystem._nudgeChats;
  }

  window.Nudge = {
    win: null,
    contactKey: null,
    // Who is being waited on, keyed by contact: an answer belongs to the
    // conversation it was asked in, not to whichever one is on screen when it
    // finally lands.
    typing: {},

    launch() {
      if (!window.HypernetOS || !window.HypernetOS.WindowManager) return;
      // The address book is only as good as the last time anybody wrote in it.
      try { registerSelf(); } catch (e) { /* no world, no book */ }
      const win = window.HypernetOS.WindowManager.createWindow({
        id: NUDGE_APP_ID,
        title: T('Mail.nudge.appName'),
        icon: NUDGE_ICON,
        width: 780,
        height: 540,
        contentHTML: `
          <div style="${NG.app}">
            <div style="${NG.header}">
              <div style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.5))">${ngIcon(NUDGE_ICON, 28)}</div>
              <div style="flex:1; min-width:0">
                <div style="font-size:16px; font-weight:bold">${T('Mail.nudge.appName')}</div>
                <div id="ng-me" style="font-size:13px; opacity:0.85"></div>
              </div>
            </div>
            <div style="display:flex; flex:1; min-height:0">
              <div id="ng-list" style="${NG.list}"></div>
              <div id="ng-talk" style="${NG.talk}"></div>
            </div>
          </div>`
      });
      this.win = win;
      this.bind();
      // A model picked in Options is read off the disk the first time it is
      // asked; the window says hello, so it starts warming now.
      try { window.MarkovLLM?.warmUp?.(); } catch (e) { /* no model, no warm up */ }
      this.render();
    },

    bind() {
      if (!this.win || this.win.dataset.ngBound) return;
      this.win.dataset.ngBound = '1';
      this.win.addEventListener('click', ev => {
        const contact = ev.target.closest('[data-ng-contact]');
        if (contact) {
          ev.stopPropagation();
          this.contactKey = contact.dataset.ngContact;
          if (window.SoundManager) SoundManager.playCursor();
          this.render();
          return;
        }
        if (ev.target.closest('[data-ng-send]')) {
          ev.stopPropagation();
          this.send();
          return;
        }
        if (ev.target.closest('[data-ng-nudge]')) {
          ev.stopPropagation();
          this.shake();
        }
      });
      // Enter sends, and the keystroke never reaches the game underneath.
      this.win.addEventListener('keydown', ev => {
        if (!ev.target.closest('#ng-input')) return;
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          ev.preventDefault();
          this.send();
        }
      }, true);
    },

    // ---- who there is to talk to ----
    contacts() {
      const groups = [];
      const members = (window.$gameParty && $gameParty.members) ? $gameParty.members() : [];
      if (members.length) {
        groups.push({
          label: T('Mail.nudge.groupParty'),
          rows: members.map(actor => ({
            key: 'member:' + actor.actorId(),
            name: actor.name(),
            status: 'online',
            sub: actor.currentClass ? (actor.currentClass() || {}).name : '',
            actor,
          })),
        });
      }
      // The companions who are not walking with you. They are not in a
      // drawer: each of them lives somewhere the player sent them (the halls,
      // a house the party owns, the starship, the vault), and each of them is
      // reachable from here, which is the whole point of a messenger.
      const benched = (() => {
        try { return window.CharacterPresets?.getAvailableRetiredPresets?.() ?? []; }
        catch (e) { return []; }
      })().filter(entry => entry && entry.name);
      if (benched.length) {
        groups.push({
          label: T('Mail.nudge.groupBenched'),
          rows: benched.map(entry => ({
            key: 'benched:' + entry.id,
            name: entry.name,
            // Away, not offline: they are alive and somewhere, just not here.
            status: 'away',
            sub: (() => {
              try {
                const LG = window.PartyLodging;
                return LG ? LG.placeName(LG.assignmentOf(entry.name)) : '';
              } catch (e) { return ''; }
            })(),
            benched: entry,
          })),
        });
      }
      let others = [];
      try {
        const world = activeWorld();
        const me = partyId();
        others = world ? partiesIn(world).filter(card => card && card.id !== me) : [];
      } catch (e) { others = []; }
      if (others.length) {
        const rows = [];
        for (const card of others) {
          for (const name of (card.members || [])) {
            rows.push({
              key: 'party:' + card.id + ':' + name,
              name: name,
              // A party last heard from days ago is away, which is exactly what
              // the post already knows about it.
              status: this.freshness(card),
              sub: T('Mail.nudge.withParty', { leader: card.name }),
              card,
            });
          }
        }
        if (rows.length) groups.push({ label: T('Mail.nudge.groupWorld'), rows });
      }
      groups.push({
        label: T('Mail.nudge.groupOthers'),
        rows: NUDGE_LORE.map(entry => ({
          key: 'lore:' + entry.id,
          name: T(entry.nameKey),
          status: entry.status,
          sub: T('Mail.nudge.alwaysOn'),
          lore: entry,
        })),
      });
      return groups;
    },

    freshness(card) {
      try {
        const now = worldClock(activeWorld());
        const seen = Number(card.minute) || 0;
        if (now - seen > 60 * 24 * 7) return 'offline';
        if (now - seen > 60 * 24) return 'away';
      } catch (e) { /* no clock, assume they are about */ }
      return 'online';
    },

    contact() {
      for (const group of this.contacts()) {
        const hit = group.rows.find(row => row.key === this.contactKey);
        if (hit) return hit;
      }
      return null;
    },

    history(key) {
      const chats = nudgeChats();
      const at = key || this.contactKey;
      if (!at) return [];
      if (!Array.isArray(chats[at])) chats[at] = [];
      return chats[at];
    },

    // ---- drawing ----
    render() {
      if (!this.win || !this.win.isConnected) return;
      const list = this.win.querySelector('#ng-list');
      if (list) {
        list.innerHTML = this.contacts().map(group => `
          <div style="${NG.group}">${ngEsc(group.label)}</div>
          ${group.rows.map(row => {
            const on = row.key === this.contactKey;
            return `<div class="focusable" tabindex="0" id="ng-c-${ngEsc(row.key)}" data-ng-contact="${ngEsc(row.key)}"
              style="${NG.contact}${on ? 'background:#dce9f7;' : ''}">
              <span style="width:9px; height:9px; border-radius:50%; flex-shrink:0;
                    background:${NUDGE_STATUS_COLOUR[row.status] || NUDGE_STATUS_COLOUR.offline}"></span>
              <span style="flex:1; min-width:0">
                <span style="${NG.who}">${ngEsc(row.name)}</span>
                <span style="${NG.note}"> ${ngEsc(this.statusWord(row.status))}</span>
                ${row.sub ? `<div style="${NG.note}">${ngEsc(row.sub)}</div>` : ''}
              </span>
            </div>`;
          }).join('')}`).join('');
      }
      const talk = this.win.querySelector('#ng-talk');
      if (talk) {
        const contact = this.contact();
        if (!contact) {
          talk.innerHTML = `<div style="${NG.log}"><div style="${NG.note}">${T('Mail.nudge.pickSomebody')}</div></div>`;
        } else {
          const me = (window.$gameParty && $gameParty.leader) ? $gameParty.leader().name() : T('Mail.nudge.you');
          const lines = this.history().map(turn => `<div style="${NG.line}">
            <span style="${NG.who} color:${turn.role === 'me' ? '#2f6cb0' : '#8b2f5a'}">${ngEsc(turn.role === 'me' ? me : contact.name)}:</span>
            ${ngEsc(turn.text)}</div>`).join('')
            || `<div style="${NG.note}">${T('Mail.nudge.sayHello', { who: contact.name })}</div>`;
          talk.innerHTML = `
            <div style="padding:6px 10px; background:var(--xp-face-6); border-bottom:1px solid var(--xp-face-shade)">
              <b>${ngEsc(contact.name)}</b> <span style="${NG.note}">${ngEsc(contact.sub || '')}</span>
            </div>
            <div id="ng-log" style="${NG.log}">${lines}
              ${this.typing[contact.key] ? `<div style="${NG.note}">${T('Mail.nudge.typing', { who: contact.name })}</div>` : ''}</div>
            <div style="${NG.entry}">
              <input id="ng-input" class="focusable" tabindex="0" style="${NG.input}"
                     placeholder="${T('Mail.nudge.placeholder')}">
              <span class="focusable" tabindex="0" data-ng-send="1" style="${NG.btn}">${T('Mail.nudge.send')}</span>
              <span class="focusable" tabindex="0" data-ng-nudge="1" style="${NG.btn}">${T('Mail.nudge.nudge')}</span>
            </div>`;
          const log = talk.querySelector('#ng-log');
          if (log) log.scrollTop = log.scrollHeight;
        }
      }
      const me = this.win.querySelector('#ng-me');
      if (me) {
        const leader = (window.$gameParty && $gameParty.leader) ? $gameParty.leader() : null;
        me.textContent = leader
          ? T('Mail.nudge.signedIn', { who: leader.name() })
          : T('Mail.nudge.signedOut');
      }
    },

    statusWord(status) {
      return T('Mail.nudge.status.' + (status || 'offline'));
    },

    // The window jumps, the way it always did. Nothing else happens, which was
    // also true then.
    shake() {
      if (!this.win) return;
      if (window.SoundManager) SoundManager.playBuzzer();
      const start = Date.now();
      const left = parseInt(this.win.style.left, 10) || 0;
      const top = parseInt(this.win.style.top, 10) || 0;
      const tick = () => {
        if (!this.win || !this.win.isConnected) return;
        const t = Date.now() - start;
        if (t > 450) {
            this.win.style.left = left + 'px';
            this.win.style.top = top + 'px';
            return;
        }
        this.win.style.left = (left + Math.round(Math.sin(t / 18) * 8)) + 'px';
        this.win.style.top = (top + Math.round(Math.cos(t / 14) * 6)) + 'px';
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },

    // ---- saying something ----
    send() {
      const box = this.win && this.win.querySelector('#ng-input');
      const contact = this.contact();
      if (!box || !contact) return;
      const text = String(box.value || '').trim();
      if (!text) return;
      box.value = '';
      // The conversation this line was written in. Everything that follows is
      // filed under it, however long the model takes and wherever the player
      // clicks meanwhile.
      const key = contact.key;
      const history = this.history(key);
      history.push({ role: 'me', text: text.slice(0, 280) });
      while (history.length > 24) history.shift();
      this.typing[key] = true;
      this.render();
      this.answer(contact, text, key);
    },

    // What the contact is, in the words a model understands. A party member has
    // a sheet the game knows for certain; somebody else's party member is a
    // name and the party they walk with; the three named contacts carry their
    // own paragraph. The chain reads none of this and does not need to.
    //
    // A companion, travelling or benched, is the one the window knows most
    // about: NPCEmpathize's companionContext hands back their sheet, the
    // adventures the party diary has them in, and where they are answering
    // from, which for somebody benched is a place on the other side of the
    // world and a biome the party is not standing in. A window that did not
    // say that had every companion answering as if they were in the next room.
    contactContext(contact) {
      if (!contact || contact.lore) return {};
      const E = window.NPCEmpathize;
      if (!E || typeof E.companionContext !== 'function') return {};
      // Only the party's own: somebody else's party member is a name on a card
      // and this world knows nothing else about them.
      if (!contact.actor && !contact.benched) return {};
      try {
        return E.companionContext(contact.name, contact.actor || null) || {};
      } catch (e) {
        return {};
      }
    },

    async answer(contact, said, key) {
      const at = key || contact.key;
      const history = this.history(at).slice(0, -1);
      const leader = (window.$gameParty && $gameParty.leader) ? $gameParty.leader() : null;
      let reply = '';
      const llm = window.MarkovLLM;
      if (llm && llm.isEnabled && llm.isEnabled() && typeof llm.reply === 'function') {
        try {
          reply = await llm.reply(Object.assign({
            npcName: contact.name,
            npcBio: contact.lore ? T(contact.lore.bioKey) : (contact.actor || contact.benched
              ? T('Mail.nudge.bioMember', { who: contact.name })
              : T('Mail.nudge.bioStranger', { who: contact.name, leader: contact.card ? contact.card.name : '' })),
            speakerName: leader ? leader.name() : '',
            situation: T('Mail.nudge.situation'),
            // Whatever the line named, as this world has it: a hyperpower, one
            // of its leaders, a faction. Without it a model asked about
            // somebody our own history also knows answers about our one.
            topics: (window.NPCEmpathize && window.NPCEmpathize.worldTopics)
              ? window.NPCEmpathize.worldTopics(said) : '',
            startText: said,
            history: history.map(turn => ({ role: turn.role === 'me' ? 'player' : 'npc', text: turn.text })),
          }, this.contactContext(contact)));
        } catch (e) { reply = ''; }
      }
      if (!reply && window.generateMarkovString) {
        const seedLen = said.split(/\s+/).filter(Boolean).length;
        try {
          reply = window.generateMarkovString('all', {
            chainOrder: 2, minLength: 6 + seedLen, maxLength: 26 + seedLen,
            startText: said, npcName: contact.name,
          });
        } catch (e) { reply = ''; }
      }
      if (!reply || /^ERROR:/i.test(reply)) reply = T('Mail.nudge.noAnswer');
      if (reply.length > 280) reply = reply.slice(0, 277) + '...';
      const chat = this.history(at);
      chat.push({ role: 'them', text: reply });
      while (chat.length > 24) chat.shift();
      delete this.typing[at];
      // A reply that landed in a conversation the player has since left changes
      // nothing on screen, and redrawing would take the line they are typing
      // in this one with it.
      if (this.contactKey === at) this.render();
    },
  };

  // The post loads long before the desktop does, so the program cannot be
  // registered on load the way a Hypernet/*.js one is: it is registered on the
  // first boot, by when every plugin has had its turn.
  function registerNudgeApp() {
    if (!window.HypernetOS || !window.HypernetOS.registerApp) return;
    if (window.HypernetOS._apps && window.HypernetOS._apps[NUDGE_APP_ID]) return;
    window.HypernetOS.registerApp({
      id: NUDGE_APP_ID,
      name: T('Mail.nudge.appName'),
      icon: NUDGE_ICON,
      category: 'internet',
      launchFn: function () { window.Nudge.launch(); },
      desktopShortcut: true,
    });
  }

  if (typeof Scene_Boot !== 'undefined') {
    const _Scene_Boot_start_Nudge = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function () {
      _Scene_Boot_start_Nudge.call(this);
      registerNudgeApp();
    };
  }
  registerNudgeApp();

  window.MailSystem = {
    partyId,
    selfCard,
    partyLabel,
    registerSelf,
    directory,
    findCard,
    postage,
    dimensionalDistance,
    mailableStock,
    resolveRef,
    itemKind,
    isMailable,
    send,
    post,
    partiesIn,
    inbox,
    pendingCount,
    unreadCount,
    markRead,
    collect,
    discard,
    takeArrivals,
    stampOf,
    addDelay,
    worldClock,
    moneyLabel,
    euroLabel,
    MIN_FOREIGN_FEE,
    DELAY_LIMITS
  };

  //=========================================================================
  // The draft
  //
  // Kept on $gameSystem, so a letter half written survives closing the post,
  // walking somewhere else and coming back.
  //=========================================================================

  function blankDraft() {
    return {
      world: null,
      partyId: null,
      subject: "",
      body: "",
      gold: 0,
      items: [],
      delay: { days: 0, months: 0, years: 0 }
    };
  }

  function draft() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return blankDraft();
    const d = $gameSystem._mailDraft;
    if (!d || typeof d !== "object") {
      $gameSystem._mailDraft = blankDraft();
    } else {
      if (!d.delay || typeof d.delay !== "object") d.delay = { days: 0, months: 0, years: 0 };
      if (!Array.isArray(d.items)) d.items = [];
    }
    return $gameSystem._mailDraft;
  }

  function clearDraft() {
    if (typeof $gameSystem !== "undefined" && $gameSystem) $gameSystem._mailDraft = blankDraft();
  }

  function draftItemCount() {
    return draft().items.reduce((n, ref) => n + (Number(ref.count) || 0), 0);
  }

  function draftAttached(kind, id) {
    const ref = draft().items.find((r) => r.kind === kind && Number(r.id) === Number(id));
    return ref ? Math.max(0, Math.floor(Number(ref.count) || 0)) : 0;
  }

  function setDraftAttached(kind, id, count) {
    const d = draft();
    const at = d.items.findIndex((r) => r.kind === kind && Number(r.id) === Number(id));
    const value = Math.max(0, Math.floor(Number(count) || 0));
    if (value <= 0) {
      if (at >= 0) d.items.splice(at, 1);
    } else if (at >= 0) {
      d.items[at].count = value;
    } else {
      d.items.push({ kind, id: Number(id), count: value });
    }
  }

  // The draft outlives the party's pockets: an item sold or spent since the
  // letter was started cannot be posted, so the enclosure is trimmed to what
  // is actually in the bag every time the post is opened.
  function reconcileDraft() {
    const d = draft();
    if (!hasParty()) return;
    d.items = d.items.filter((ref) => {
      const obj = resolveRef(ref);
      if (!obj) return false;
      const held = $gameParty.numItems(obj);
      if (held <= 0) return false;
      ref.count = Math.min(ref.count, held);
      return ref.count > 0;
    });
    d.gold = Math.max(0, Math.min(Math.floor(Number(d.gold) || 0), $gameParty.gold()));
    if (d.world && d.partyId && !findCard(d.world, d.partyId)) {
      d.world = null;
      d.partyId = null;
    }
  }

  function draftFee() {
    const d = draft();
    if (!d.world) return 0;
    return postage(d.world, { gold: d.gold, items: d.items });
  }

  function draftArrival() {
    const d = draft();
    const world = d.world || activeWorld();
    if (!world) return 0;
    return addDelay(worldClock(world), d.delay);
  }

  //=========================================================================
  // Scene_MailSystem
  //
  // One book spread, two modes. The left page is the working page (the list of
  // letters, or the form the letter is addressed with); the right page is the
  // letter itself, which in compose mode carries the two fields that are
  // actually typed into.
  //=========================================================================

  const FORM_ROWS = ["recipient", "subject", "body", "money", "items", "days", "months", "years", "send"];

  class Scene_MailSystem extends Scene_MenuBase {
    prepare(mode) {
      this._startMode = mode === "compose" ? "compose" : "inbox";
    }

    create() {
      super.create();
      this._mode = this._startMode || "inbox";
      this._area = "tabs";            // tabs | list | form | recipients | items
      this._inboxIndex = 0;
      this._formIndex = 0;
      this._recipientIndex = 0;
      this._itemIndex = 0;
      this._confirmSend = false;
      this._holdFrames = 0;
      this._letters = [];
      this._recipients = [];
      this._stock = [];
      reconcileDraft();
      registerSelf();
      this.initMailDOM();
    }

    update() {
      super.update();
      if (this.isTyping()) {
        // The player is writing: the keyboard belongs to the field. Only a
        // controller cancel gets through, since the key guard swallows the
        // keystrokes before RMMZ ever sees them.
        if (Input.isTriggered("cancel")) this.blurEditors();
        return;
      }
      this.updateMailInput();
    }

    terminate() {
      this.commitEditors();
      if (this._keyGuard) {
        window.removeEventListener("keydown", this._keyGuard, true);
        window.removeEventListener("keyup", this._keyGuard, true);
        window.removeEventListener("keypress", this._keyGuard, true);
        this._keyGuard = null;
      }
      const container = document.getElementById("mail-container");
      if (container) container.remove();
      super.terminate();
    }

    //-------------------------------------------------------------------
    // DOM
    //-------------------------------------------------------------------

    initMailDOM() {
      this._container = document.createElement("div");
      this._container.id = "mail-container";

      this._container.innerHTML = `
        <div class="book-spread">
          <div class="left-page mail-page">
            <div class="page-header-bar">
              <div class="back-button focusable" id="mail-back">${escapeHtml(T("Mail.ui.back"))}</div>
              <h2 class="title">${escapeHtml(T("Mail.ui.title"))}</h2>
            </div>
            <div id="mail-tab-row" class="mail-tab-row"></div>
            <div id="mail-list" class="mail-scroll"></div>
          </div>
          <div class="right-page mail-page">
            <div id="mail-detail" class="mail-scroll"></div>
          </div>
        </div>
      `;
      document.body.appendChild(this._container);
      this._container.addEventListener("contextmenu", (e) => e.preventDefault());

      const back = this._container.querySelector("#mail-back");
      if (back) back.addEventListener("click", (e) => {
        e.stopPropagation();
        SoundManager.playCancel();
        this.popScene();
      });

      for (const id of ["mail-list", "mail-detail"]) {
        const box = document.getElementById(id);
        if (box) box.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
      }

      this.installKeyGuard();
      this._detailKey = null;
      this.refreshAll();
      setTimeout(() => {
        if (this._container) this._container.classList.add("mail-shown");
      }, 16);
    }

    // Always-on map plugins hang their own keydown handlers on the document and
    // several of them preventDefault plain letters, so a focused field would
    // never see a keystroke. This runs first, in the capture phase, and stops
    // the event reaching any of them WITHOUT preventing the default, which is
    // what actually types the character.
    installKeyGuard() {
      this._keyGuard = (ev) => {
        const ae = document.activeElement;
        if (!ae || (ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA")) return;
        ev.stopImmediatePropagation();
        if (ev.type !== "keydown") return;
        if (ev.key === "Escape" || (ev.key === "Enter" && ae.id === "mail-subject")) {
          ev.preventDefault();
          this.blurEditors();
        }
      };
      window.addEventListener("keydown", this._keyGuard, true);
      window.addEventListener("keyup", this._keyGuard, true);
      window.addEventListener("keypress", this._keyGuard, true);
    }

    isTyping() {
      const ae = document.activeElement;
      return !!ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
    }

    commitEditors() {
      const subject = document.getElementById("mail-subject");
      const body = document.getElementById("mail-body");
      const d = draft();
      if (subject) d.subject = subject.value;
      if (body) d.body = body.value;
    }

    blurEditors() {
      this.commitEditors();
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) ae.blur();
      this._area = "form";
      SoundManager.playCancel();
      this.refreshAll();
    }

    focusEditor(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.focus();
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch (e) { /* number fields */ }
    }

    //-------------------------------------------------------------------
    // Rendering
    //-------------------------------------------------------------------

    refreshAll() {
      if (!this._container) return;
      this.rebuildRows();
      this.renderTabs();
      this.renderList();
      this.renderDetail();
    }

    rebuildRows() {
      this._letters = inbox();
      if (this._inboxIndex >= this._letters.length) {
        this._inboxIndex = Math.max(0, this._letters.length - 1);
      }
      this._stock = mailableStock();
      if (this._itemIndex >= this._stock.length) {
        this._itemIndex = Math.max(0, this._stock.length - 1);
      }
      this._recipients = [];
      for (const group of directory()) {
        this._recipients.push({ header: true, world: group.world, foreign: group.foreign });
        for (const card of group.parties) this._recipients.push({ card });
      }
      if (this._recipientIndex >= this._recipients.length) {
        this._recipientIndex = Math.max(0, this._recipients.length - 1);
      }
    }

    renderTabs() {
      const row = document.getElementById("mail-tab-row");
      if (!row) return;
      const pending = pendingCount();
      const tabs = [
        { key: "inbox", label: T("Mail.ui.tab.inbox", { count: this._letters.length }) },
        { key: "compose", label: T("Mail.ui.tab.compose") }
      ];
      const trailing = pending > 0
        ? `<div class="mail-transit">${escapeHtml(T.n("Mail.ui.inTransit", pending))}</div>`
        : "";
      row.innerHTML = tabs.map((tab) => {
        const isSel = tab.key === this._mode;
        const isFocused = isSel && this._area === "tabs";
        return `<div class="mail-tab focusable${isSel ? " selected" : ""}" data-tab="${tab.key}"
            border:1.5px solid ${isFocused ? "var(--text-secondary-active)" : "var(--border-secondary-hover-translucent-15)"};
            color:${isSel ? "var(--text-secondary-active)" : "var(--text-card-medium)"};
          ">${escapeHtml(tab.label)}</div>`;
      }).join("") + trailing;
      row.querySelectorAll(".mail-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          this.setMode(tab.getAttribute("data-tab"));
          this._area = "tabs";
          this.refreshAll();
        });
      });
    }

    setMode(mode) {
      if (mode === this._mode) return;
      this.commitEditors();
      this._mode = mode;
      this._area = "tabs";
      this._confirmSend = false;
      this._detailKey = null;
      SoundManager.playCursor();
    }

    renderList() {
      const box = document.getElementById("mail-list");
      if (!box) return;
      const scroll = box.scrollTop;
      if (this._mode === "inbox") {
        box.innerHTML = this.buildInboxListHTML();
      } else if (this._area === "recipients") {
        box.innerHTML = this.buildRecipientListHTML();
      } else if (this._area === "items") {
        box.innerHTML = this.buildItemListHTML();
      } else {
        box.innerHTML = this.buildFormHTML();
      }
      box.scrollTop = scroll;
      this.wireList(box);
    }

    wireList(box) {
      box.querySelectorAll("[data-row]").forEach((el) => {
        el.addEventListener("click", (ev) => {
          const idx = parseInt(el.getAttribute("data-row"), 10);
          const step = ev.target && ev.target.getAttribute
            ? ev.target.getAttribute("data-step") : null;
          if (step) {
            ev.stopPropagation();
            this.selectRow(idx, false);
            this.adjustRow(Number(step));
            return;
          }
          this.selectRow(idx, true);
        });
      });
    }

    // Clicking a row focuses it, and optionally activates it.
    selectRow(idx, activate) {
      if (this._mode === "inbox") {
        this._area = "list";
        this._inboxIndex = idx;
        SoundManager.playCursor();
        this.refreshAll();
        if (activate) this.activateRow();
        return;
      }
      if (this._area === "recipients") {
        this._recipientIndex = idx;
      } else if (this._area === "items") {
        this._itemIndex = idx;
      } else {
        this._area = "form";
        this._formIndex = idx;
        this._confirmSend = false;
      }
      SoundManager.playCursor();
      this.refreshAll();
      if (activate) this.activateRow();
    }

    buildInboxListHTML() {
      if (!activeWorld()) return this.emptyNote(T("Mail.ui.noWorld"));
      if (!this._letters.length) return this.emptyNote(T("Mail.inbox.empty"));
      return this._letters.map((m, idx) => {
        const isSel = idx === this._inboxIndex;
        const isFocused = isSel && this._area === "list";
        const from = m.from || {};
        const foreign = from.world && from.world !== activeWorld();
        const self = from.partyId === partyId();
        const marks = [];
        if (!m.read) marks.push(T("Mail.inbox.mark.unread"));
        if (!m.collected && (m.gold || (m.items || []).length)) marks.push(T("Mail.inbox.mark.parcel"));
        const sub = self
          ? T("Mail.inbox.fromSelf")
          : T("Mail.inbox.fromLine", { who: from.label || from.name || "?", world: from.world || "?" });
        return `
          <div class="mail-row focusable ${isFocused ? "focused" : ""}${isSel ? " selected" : ""}" data-row="${idx}">
            <span class="mail-row-main">
              <span class="mail-row-subject">${escapeHtml(m.subject || T("Mail.noSubject"))}</span>
              <span class="mail-row-sub">${escapeHtml(sub)}${foreign && !self ? " " + escapeHtml(T("Mail.inbox.crossed")) : ""}</span>
            </span>
            <span class="mail-row-aside">
              <span class="mail-row-stamp">${escapeHtml(stampOf(m.deliverAt))}</span>
              ${marks.length ? `<span class="mail-row-marks">${escapeHtml(marks.join(" · "))}</span>` : ""}
            </span>
          </div>`;
      }).join("");
    }

    buildRecipientListHTML() {
      if (!this._recipients.length) return this.emptyNote(T("Mail.compose.noAddresses"));
      const d = draft();
      return this._recipients.map((entry, idx) => {
        if (entry.header) {
          return `<div class="mail-group-head">
            ${escapeHtml(entry.foreign ? T("Mail.compose.otherWorld", { world: entry.world }) : T("Mail.compose.thisWorld", { world: entry.world }))}
          </div>`;
        }
        const card = entry.card;
        const isSel = idx === this._recipientIndex;
        const chosen = d.world === card.world && d.partyId === card.id;
        const label = card.isSelf ? T("Mail.compose.yourself", { leader: card.name }) : partyLabel(card);
        const fee = card.world === activeWorld() ? 0 : postage(card.world, { gold: d.gold, items: d.items });
        const note = fee > 0
          ? T("Mail.compose.feeShort", { fee: euroLabel(fee) })
          : T("Mail.compose.seenOn", { date: stampOf(card.minute || 0) });
        return `
          <div class="mail-row focusable${isSel ? " selected" : ""}" data-row="${idx}">
            <span class="mail-row-main">
              <span class="mail-row-title">${chosen ? "&#10003; " : ""}${escapeHtml(label)}</span>
              <span class="mail-row-sub">${escapeHtml(note)}</span>
            </span>
            <span class="mail-row-count">${escapeHtml(T.n("Mail.compose.memberCount", (card.members || []).length))}</span>
          </div>`;
      }).join("");
    }

    buildItemListHTML() {
      if (!this._stock.length) return this.emptyNote(T("Mail.compose.nothingToSend"));
      return this._stock.map((row, idx) => {
        const isSel = idx === this._itemIndex;
        const attached = draftAttached(row.kind, row.id);
        return `
          <div class="mail-row focusable${isSel ? " selected" : ""}" data-row="${idx}">
            <span class="mail-row-main">
              <span class="mail-row-title${attached ? " mail-row-title--on" : ""}">${escapeHtml(row.item.name)}</span>
              <span class="mail-row-sub">${escapeHtml(T.n("Mail.compose.held", row.held))}</span>
            </span>
            <span class="mail-stepper">
              <span class="mail-step" data-row="${idx}" data-step="-1">&#65293;</span>
              <span class="mail-step-value">${attached}</span>
              <span class="mail-step" data-row="${idx}" data-step="1">&#65291;</span>
            </span>
          </div>`;
      }).join("");
    }

    formRowData(key) {
      const d = draft();
      switch (key) {
        case "recipient": {
          const card = d.world && d.partyId ? findCard(d.world, d.partyId) : null;
          const label = card
            ? (card.id === partyId() && card.world === activeWorld()
              ? T("Mail.compose.yourself", { leader: card.name })
              : T("Mail.compose.addressLine", { who: partyLabel(card), world: card.world }))
            : T("Mail.compose.noRecipient");
          return { label: T("Mail.compose.recipient"), value: label };
        }
        case "subject":
          return { label: T("Mail.compose.subject"), value: d.subject || T("Mail.compose.blankField") };
        case "body": {
          const words = d.body.trim() ? d.body.trim().split(/\s+/).length : 0;
          return { label: T("Mail.compose.body"), value: words ? T.n("Mail.compose.wordCount", words) : T("Mail.compose.blankField") };
        }
        case "money":
          return { label: T("Mail.compose.money"), value: moneyLabel(d.gold), adjustable: true };
        case "items":
          return { label: T("Mail.compose.items"), value: T.n("Mail.compose.pieces", draftItemCount()) };
        case "days":
          return { label: T("Mail.compose.delayDays"), value: String(d.delay.days), adjustable: true };
        case "months":
          return { label: T("Mail.compose.delayMonths"), value: String(d.delay.months), adjustable: true };
        case "years":
          return { label: T("Mail.compose.delayYears"), value: String(d.delay.years), adjustable: true };
        case "send":
          return { label: this._confirmSend ? T("Mail.compose.confirm") : T("Mail.compose.send"), value: "", action: true };
        default:
          return { label: key, value: "" };
      }
    }

    buildFormHTML() {
      if (!activeWorld()) return this.emptyNote(T("Mail.ui.noWorld"));
      return FORM_ROWS.map((key, idx) => {
        const row = this.formRowData(key);
        const isSel = idx === this._formIndex && this._area === "form";
        const arrows = row.adjustable
          ? `<span class="mail-step" data-row="${idx}" data-step="-1">&#9666;</span>
             <span class="mail-step-value mail-step-value--wide">${escapeHtml(row.value)}</span>
             <span class="mail-step" data-row="${idx}" data-step="1">&#9656;</span>`
          : `<span class="mail-field-value${row.action ? " mail-field-value--action" : ""}">${escapeHtml(row.value)}</span>`;
        return `
          <div class="mail-row mail-row--field focusable ${isSel ? "focused selected" : ""}${row.action ? " mail-row--action" : ""}" data-row="${idx}">
            <span class="mail-field-label">${escapeHtml(row.label)}</span>
            <span class="mail-field-arrows">${arrows}</span>
          </div>`;
      }).join("");
    }

    emptyNote(text) {
      return `<div class="mail-empty">${escapeHtml(text)}</div>`;
    }

    //-------------------------------------------------------------------
    // The right page
    //-------------------------------------------------------------------

    renderDetail() {
      const box = document.getElementById("mail-detail");
      if (!box) return;
      if (this._mode === "compose") {
        // The two editors live here, so the page is built once and only its
        // volatile lines are rewritten afterwards: rebuilding it while the
        // player is typing would take the caret with it.
        if (this._detailKey !== "compose") {
          box.innerHTML = this.buildComposeHTML();
          this._detailKey = "compose";
          this.wireComposeEditors();
        }
        this.syncComposeHTML();
        return;
      }
      const letter = this._letters[this._inboxIndex];
      const key = "inbox:" + (letter ? letter.id + ":" + letter.collected + ":" + letter.read : "none");
      if (this._detailKey === key) return;
      box.innerHTML = this.buildLetterHTML(letter);
      this._detailKey = key;
      const collect = box.querySelector("#mail-collect");
      if (collect) collect.addEventListener("click", () => this.collectCurrent());
      const burn = box.querySelector("#mail-discard");
      if (burn) burn.addEventListener("click", () => this.discardCurrent());
    }

    buildLetterHTML(letter) {
      if (!letter) {
        return `<div class="mail-empty mail-empty--page">${escapeHtml(T("Mail.inbox.pickOne"))}</div>`;
      }
      const from = letter.from || {};
      const self = from.partyId === partyId();
      const items = (letter.items || []).map((ref) => {
        const obj = resolveRef(ref);
        return obj ? `<div class="mail-enclosure">
            <span>${escapeHtml(obj.name)}</span><span class="mail-enclosure-count">&times;${ref.count}</span>
          </div>` : "";
      }).join("");
      const hasParcel = !!(letter.gold || (letter.items || []).length);
      const enclosed = hasParcel
        ? `${letter.gold ? `<div class="mail-enclosure">
              <span>${escapeHtml(T("Mail.inbox.moneyLine"))}</span><span class="mail-enclosure-count">${escapeHtml(moneyLabel(letter.gold))}</span>
            </div>` : ""}${items}`
        : `<div class="mail-note">${escapeHtml(T("Mail.inbox.nothingEnclosed"))}</div>`;

      const action = !hasParcel ? ""
        : letter.collected
          ? `<div class="mail-note mail-note--spaced">${escapeHtml(T("Mail.inbox.collectedAlready"))}</div>`
          : `<div id="mail-collect" class="focusable mail-collect">${escapeHtml(T("Mail.inbox.collect"))}</div>`;

      const held = letter.delay && (letter.delay.days || letter.delay.months || letter.delay.years)
        ? `<div class="mail-note mail-note--small">${escapeHtml(T("Mail.inbox.heldBack", { span: this.delaySpan(letter.delay) }))}</div>`
        : "";
      const crossed = from.world && from.world !== activeWorld()
        ? `<div class="mail-note mail-note--small">${escapeHtml(T("Mail.inbox.crossedFrom", { world: from.world, fee: euroLabel(letter.fee || 0) }))}</div>`
        : "";

      return `
        <div class="mail-letter">
          <h2 class="mail-letter-subject">${escapeHtml(letter.subject || T("Mail.noSubject"))}</h2>
          <div class="mail-letter-from">${escapeHtml(self ? T("Mail.inbox.fromSelf") : T("Mail.inbox.fromLine", { who: from.label || from.name || "?", world: from.world || "?" }))}</div>
          <div class="mail-letter-dates">${escapeHtml(T("Mail.inbox.written", { date: stampOf(letter.sentMinute || 0) }))} &middot; ${escapeHtml(T("Mail.inbox.arrived", { date: stampOf(letter.deliverAt || 0) }))}</div>
          ${held}${crossed}
          <div class="mail-letter-body">${escapeHtml(letter.body || "")}</div>
          <div class="mail-letter-enclosures">
            <div class="mail-enclosures-head">${escapeHtml(T("Mail.inbox.enclosed"))}</div>
            ${enclosed}
            ${action}
          </div>
          <div id="mail-discard" class="focusable mail-discard">${escapeHtml(T("Mail.inbox.discard"))}</div>
        </div>`;
    }

    delaySpan(delay) {
      const parts = [];
      if (delay.years) parts.push(T.n("Mail.span.years", delay.years));
      if (delay.months) parts.push(T.n("Mail.span.months", delay.months));
      if (delay.days) parts.push(T.n("Mail.span.days", delay.days));
      return parts.length ? parts.join(" ") : T("Mail.span.none");
    }

    buildComposeHTML() {
      const d = draft();
      return `
        <div class="mail-compose">
          <div id="mail-to-line" class="mail-to-line"></div>
          <div id="mail-route-line" class="mail-route-line"></div>
          <input id="mail-subject" type="text" maxlength="120" spellcheck="false"
            placeholder="${escapeHtml(T("Mail.compose.subjectPlaceholder"))}"
            value="${escapeHtml(d.subject)}"
            class="mail-input">
          <textarea id="mail-body" spellcheck="false"
            placeholder="${escapeHtml(T("Mail.compose.bodyPlaceholder"))}"
            class="mail-input mail-input--body">${escapeHtml(d.body)}</textarea>
          <div id="mail-enclosed-line" class="mail-status-line"></div>
          <div id="mail-cost-line" class="mail-status-line"></div>
          <div id="mail-warning-line" class="mail-warning-line"></div>
        </div>`;
    }

    wireComposeEditors() {
      const subject = document.getElementById("mail-subject");
      const body = document.getElementById("mail-body");
      if (subject) {
        subject.addEventListener("input", () => {
          draft().subject = subject.value;
          this.renderList();
        });
        subject.addEventListener("focus", () => { this._area = "form"; this._formIndex = FORM_ROWS.indexOf("subject"); });
      }
      if (body) {
        body.addEventListener("input", () => {
          draft().body = body.value;
          this.renderList();
        });
        body.addEventListener("focus", () => { this._area = "form"; this._formIndex = FORM_ROWS.indexOf("body"); });
      }
    }

    syncComposeHTML() {
      const d = draft();
      const card = d.world && d.partyId ? findCard(d.world, d.partyId) : null;
      const to = document.getElementById("mail-to-line");
      if (to) {
        to.textContent = card
          ? T("Mail.compose.toLine", { who: card.id === partyId() && card.world === activeWorld() ? T("Mail.compose.yourself", { leader: card.name }) : partyLabel(card) })
          : T("Mail.compose.toNobody");
      }
      const route = document.getElementById("mail-route-line");
      if (route) {
        const lines = [];
        if (card) {
          lines.push(card.world === activeWorld()
            ? T("Mail.compose.routeHome", { world: card.world })
            : T("Mail.compose.routeAcross", { world: card.world, steps: dimensionalDistance(activeWorld(), card.world) }));
        }
        lines.push(T("Mail.compose.arrives", { date: stampOf(draftArrival()), span: this.delaySpan(d.delay) }));
        route.textContent = lines.join(" · ");
      }
      const enclosedLine = document.getElementById("mail-enclosed-line");
      if (enclosedLine) {
        const names = d.items.map((ref) => {
          const obj = resolveRef(ref);
          return obj ? `${obj.name} x${ref.count}` : null;
        }).filter(Boolean);
        enclosedLine.textContent = (d.gold || names.length)
          ? T("Mail.compose.enclosedLine", {
            money: moneyLabel(d.gold),
            goods: names.length ? names.join(", ") : T("Mail.compose.noGoods")
          })
          : T("Mail.compose.enclosedNothing");
      }
      const costLine = document.getElementById("mail-cost-line");
      const fee = draftFee();
      if (costLine) {
        costLine.textContent = fee > 0
          ? T("Mail.compose.postageLine", { fee: euroLabel(fee), total: moneyLabel(fee * GOLD_PER_EURO + d.gold) })
          : T("Mail.compose.postageFree");
      }
      const warn = document.getElementById("mail-warning-line");
      if (warn) {
        const need = fee * GOLD_PER_EURO + d.gold;
        warn.textContent = (hasParty() && need > $gameParty.gold())
          ? T("Mail.compose.cannotAfford", { short: moneyLabel(need - $gameParty.gold()) })
          : "";
      }
      const subject = document.getElementById("mail-subject");
      if (subject && document.activeElement !== subject) subject.value = d.subject;
      const body = document.getElementById("mail-body");
      if (body && document.activeElement !== body) body.value = d.body;
    }

    //-------------------------------------------------------------------
    // Input
    //-------------------------------------------------------------------

    updateMailInput() {
      const cancel = Input.isTriggered("cancel") || Input.isTriggered("escape") || TouchInput.isCancelled();
      const ok = Input.isTriggered("ok");
      const down = Input.isRepeated("down");
      const up = Input.isRepeated("up");
      const right = Input.isRepeated("right");
      const left = Input.isRepeated("left");

      // Counted in frames held, not in repeats, so the step can start growing
      // after a fraction of a second rather than after a dozen ticks.
      if (Input.isPressed("right") || Input.isPressed("left")) this._holdFrames++;
      else this._holdFrames = 0;

      if (this._area === "tabs") {
        if (right) {
          this.setMode("compose");
          this.refreshAll();
        } else if (left) {
          this.setMode("inbox");
          this.refreshAll();
        } else if (down) {
          this._area = this._mode === "inbox" ? "list" : "form";
          SoundManager.playCursor();
          this.refreshAll();
        } else if (cancel) {
          SoundManager.playCancel();
          this.popScene();
        }
        return;
      }

      const count = this.rowCount();
      if (down || up) {
        const step = down ? 1 : -1;
        const next = this.nextIndex(this.rowIndex() + step, step);
        if (next === null) {
          if (step < 0) {
            this._area = this._area === "form" || this._area === "list" ? "tabs" : this._area;
            if (this._area === "tabs") SoundManager.playCursor();
          }
        } else if (next !== this.rowIndex()) {
          this.setRowIndex(next);
          SoundManager.playCursor();
        }
        this._confirmSend = false;
        this.refreshAll();
        this.scrollFocusIntoView();
        return;
      }
      if ((right || left) && count) {
        this.adjustRow(right ? 1 : -1);
        return;
      }
      if (ok && count) {
        this.activateRow();
        return;
      }
      // Burning a letter was the one thing in here that needed a mouse: the
      // envelope is opened and emptied with Confirm, but the fire under it had
      // only its button. SHIFT is the second verb everywhere else on a book
      // spread, and a letter that still holds anything refuses anyway.
      if (Input.isTriggered("shift") && this._mode === "inbox" && this._area === "list" && count) {
        this.discardCurrent();
        return;
      }
      if (cancel) {
        if (this._area === "recipients" || this._area === "items") {
          this._area = "form";
          this._confirmSend = false;
          SoundManager.playCancel();
          this.refreshAll();
        } else {
          this._area = "tabs";
          SoundManager.playCancel();
          this.refreshAll();
        }
      }
    }

    rowCount() {
      if (this._mode === "inbox") return this._letters.length;
      if (!activeWorld()) return 0;
      if (this._area === "recipients") return this._recipients.length;
      if (this._area === "items") return this._stock.length;
      return FORM_ROWS.length;
    }

    rowIndex() {
      if (this._mode === "inbox") return this._inboxIndex;
      if (this._area === "recipients") return this._recipientIndex;
      if (this._area === "items") return this._itemIndex;
      return this._formIndex;
    }

    setRowIndex(idx) {
      if (this._mode === "inbox") this._inboxIndex = idx;
      else if (this._area === "recipients") this._recipientIndex = idx;
      else if (this._area === "items") this._itemIndex = idx;
      else this._formIndex = idx;
    }

    // Walks past the world headings in the address book, which are captions
    // rather than choices.
    nextIndex(idx, step) {
      const count = this.rowCount();
      let i = idx;
      while (i >= 0 && i < count) {
        if (!(this._area === "recipients" && this._recipients[i] && this._recipients[i].header)) return i;
        i += step;
      }
      return null;
    }

    scrollFocusIntoView() {
      const box = document.getElementById("mail-list");
      if (!box) return;
      const rows = box.querySelectorAll("[data-row]");
      const el = rows[this.rowIndex()];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    }

    // Left/right on a row that carries a number.
    adjustRow(direction) {
      const d = draft();
      if (this._area === "items") {
        const row = this._stock[this._itemIndex];
        if (!row) return;
        const next = Math.max(0, Math.min(row.held, draftAttached(row.kind, row.id) + direction));
        setDraftAttached(row.kind, row.id, next);
        SoundManager.playCursor();
        this.refreshAll();
        return;
      }
      if (this._area !== "form") return;
      const key = FORM_ROWS[this._formIndex];
      if (key === "money") {
        // Held down the step grows by a decade at a time, so a fortune can be
        // enclosed without a thousand presses. One euro is 100 gold.
        const decade = Math.min(4, Math.floor(this._holdFrames / 45));
        const step = 100 * Math.pow(10, decade);
        const max = hasParty() ? $gameParty.gold() : 0;
        d.gold = Math.max(0, Math.min(max, d.gold + step * direction));
      } else if (key === "days" || key === "months" || key === "years") {
        const step = this._holdFrames > 90 ? 25 : this._holdFrames > 45 ? 5 : 1;
        d.delay[key] = Math.max(0, Math.min(DELAY_LIMITS[key], d.delay[key] + step * direction));
      } else {
        return;
      }
      this._confirmSend = false;
      SoundManager.playCursor();
      this.refreshAll();
    }

    activateRow() {
      if (this._mode === "inbox") {
        const letter = this._letters[this._inboxIndex];
        if (!letter) return;
        // First press opens the letter, the next one empties the envelope, so
        // a parcel can be taken with the keyboard or a controller alone.
        if (!letter.read) {
          markRead(letter.id);
          SoundManager.playOk();
          this._detailKey = null;
          this.refreshAll();
        } else if (!letter.collected && (letter.gold || (letter.items || []).length)) {
          this.collectCurrent();
        } else {
          SoundManager.playCursor();
        }
        return;
      }
      if (this._area === "recipients") {
        const entry = this._recipients[this._recipientIndex];
        if (!entry || entry.header || !entry.card) return;
        const d = draft();
        d.world = entry.card.world;
        d.partyId = entry.card.id;
        this._area = "form";
        this._formIndex = FORM_ROWS.indexOf("recipient");
        SoundManager.playOk();
        this.refreshAll();
        return;
      }
      if (this._area === "items") {
        const row = this._stock[this._itemIndex];
        if (!row) return;
        const attached = draftAttached(row.kind, row.id);
        setDraftAttached(row.kind, row.id, attached >= row.held ? 0 : row.held);
        SoundManager.playOk();
        this.refreshAll();
        return;
      }

      const key = FORM_ROWS[this._formIndex];
      switch (key) {
        case "recipient": {
          this._area = "recipients";
          // The list opens on a world heading, which is a caption and not a
          // choice, so the cursor starts on the first name under it.
          const first = this.nextIndex(this._recipientIndex, 1);
          this._recipientIndex = first === null ? (this.nextIndex(0, 1) ?? 0) : first;
          SoundManager.playOk();
          this.refreshAll();
          break;
        }
        case "subject":
          SoundManager.playOk();
          this.focusEditor("mail-subject");
          break;
        case "body":
          SoundManager.playOk();
          this.focusEditor("mail-body");
          break;
        case "items":
          this._area = "items";
          SoundManager.playOk();
          this.refreshAll();
          break;
        case "money":
        case "days":
        case "months":
        case "years":
          SoundManager.playCursor();
          break;
        case "send":
          this.trySend();
          break;
        default:
          break;
      }
    }

    trySend() {
      this.commitEditors();
      const d = draft();
      if (!this._confirmSend) {
        this._confirmSend = true;
        SoundManager.playCursor();
        this.refreshAll();
        return;
      }
      this._confirmSend = false;
      const result = send({
        world: d.world,
        partyId: d.partyId,
        subject: d.subject,
        body: d.body,
        gold: d.gold,
        items: d.items,
        delay: d.delay
      });
      if (!result.ok) {
        SoundManager.playBuzzer();
        this.toast(result.error, true);
        this.refreshAll();
        return;
      }
      SoundManager.playOk();
      this.toast(result.fee > 0
        ? T("Mail.toast.sentAcross", { fee: euroLabel(result.fee) })
        : T("Mail.toast.sent"));
      clearDraft();
      this._detailKey = null;
      this._area = "form";
      this._formIndex = 0;
      this.refreshAll();
    }

    collectCurrent() {
      const letter = this._letters[this._inboxIndex];
      if (!letter) return;
      const result = collect(letter.id);
      if (!result.ok) {
        SoundManager.playBuzzer();
        this.toast(result.error, true);
        return;
      }
      SoundManager.playOk();
      this.toast(T("Mail.toast.collected", {
        money: moneyLabel(result.gold),
        goods: T.n("Mail.toast.goods", result.items.length)
      }));
      this._detailKey = null;
      this.refreshAll();
    }

    discardCurrent() {
      const letter = this._letters[this._inboxIndex];
      if (!letter) return;
      if (!letter.collected && (letter.gold || (letter.items || []).length)) {
        SoundManager.playBuzzer();
        this.toast(T("Mail.error.stillFull"), true);
        return;
      }
      discard(letter.id);
      SoundManager.playCancel();
      this._detailKey = null;
      this.refreshAll();
    }

    toast(text, bad) {
      if (window.ParchmentToast && window.ParchmentToast.show) {
        window.ParchmentToast.show(text, {
          duration: bad ? 220 : 170,
          severity: bad ? "warning" : "good",
          category: "mail"
        });
      }
    }
  }

  window.Scene_MailSystem = Scene_MailSystem;

  //=========================================================================
  // Arrival notices and address-book upkeep
  //=========================================================================

  // A new game or a loaded savegame can be a different party, and possibly a
  // different world, so everything read once per session is read again.
  function resetCaches() {
    _foreignSeeds.clear();
    _foreignClocks.clear();
    invalidateDirectory();
    Scene_MailSystem._registeredThisSession = false;
  }

  const _DataManager_setupNewGame_mail = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame_mail.call(this);
    resetCaches();
  };

  const _DataManager_extractSaveContents_mail = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents_mail.call(this, contents);
    resetCaches();
  };

  const _Scene_Map_onMapLoaded_mail = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded_mail.call(this);
    if (!activeWorld() || !hasParty()) return;
    if (!Scene_MailSystem._registeredThisSession) {
      Scene_MailSystem._registeredThisSession = true;
      registerSelf();
    }
    const arrivals = takeArrivals();
    if (arrivals.length && window.ParchmentToast && window.ParchmentToast.show) {
      const text = arrivals.length === 1
        ? T("Mail.toast.arrivedOne", { subject: arrivals[0].subject })
        : T.n("Mail.toast.arrivedMany", arrivals.length);
      window.ParchmentToast.show(text, { duration: 300, severity: "good", category: "mail" });
    }
  };

  // The address book should say where the party was when it was last put down.
  const _DataManager_saveGame_mail = DataManager.saveGame;
  DataManager.saveGame = function (savefileId) {
    return _DataManager_saveGame_mail.call(this, savefileId).then((result) => {
      try { registerSelf(); } catch (e) { console.error("[MailSystem] registerSelf failed", e); }
      return result;
    });
  };

  //=========================================================================
  // Plugin commands
  //=========================================================================

  function openMail(mode) {
    SceneManager.push(Scene_MailSystem);
    SceneManager.prepareNextScene(mode);
  }

  for (const name of ["Core/MailSystem", "MailSystem"]) {
    PluginManager.registerCommand(name, "OpenMailCompose", () => openMail("compose"));
    PluginManager.registerCommand(name, "OpenMailbox", () => openMail("inbox"));
  }

  //=========================================================================
  // Post Express
  //
  // The same post, read and written at a desk instead of on a writing slope:
  // a HypernetOS window in the shape of the mail clients of the day. Three
  // panes, a folder list down the left, the letters top right and whichever
  // one is picked opened underneath. Everything it does it does through the
  // service above, so a letter written here and a letter written on the
  // parchment are the same letter, crossing into other dimensions included.
  //=========================================================================

  const HM_APP_ID = "app-hypermail";
  const HM_APP_ICON = 192; // Letter, per js/db/Sprites/Icons.json

  // The desk furniture, in the shell's own tokens so the window follows
  // whichever theme the desktop is wearing.
  const HS = {
    app: "display:flex; flex-direction:column; height:100%; background:var(--xp-face-5); " +
         "font-family:'Tahoma',sans-serif; font-size:14px; color:var(--xp-ink-2);",
    bar: "display:flex; align-items:center; gap:4px; padding:4px 6px; " +
         "background:linear-gradient(to bottom,var(--xp-paper),var(--xp-face-5)); " +
         "border-bottom:1px solid var(--xp-face-shade);",
    tool: "display:flex; align-items:center; gap:5px; padding:4px 9px; border:1px solid transparent; " +
          "border-radius:3px; cursor:pointer; user-select:none;",
    body: "flex:1; display:flex; min-height:0;",
    folders: "width:168px; flex-shrink:0; background:var(--xp-face-6); " +
             "border-right:1px solid var(--xp-face-shade); padding:6px 0; overflow-y:auto;",
    folder: "padding:6px 10px; cursor:pointer; border-left:4px solid transparent; user-select:none; " +
            "display:flex; align-items:center; gap:6px;",
    right: "flex:1; display:flex; flex-direction:column; min-width:0;",
    list: "height:44%; min-height:96px; overflow-y:auto; background:var(--xp-white); " +
          "border-bottom:2px solid var(--xp-face-shade);",
    pane: "flex:1; overflow-y:auto; padding:12px 14px; background:var(--xp-face-2);",
    row: "display:flex; gap:8px; align-items:baseline; padding:5px 9px; cursor:pointer; " +
         "border-bottom:1px solid var(--xp-face-6);",
    rowOn: "background:#316ac5; color:var(--xp-white);",
    status: "display:flex; gap:14px; align-items:center; border-top:1px solid var(--xp-face-shade); " +
            "padding:3px 9px; background:var(--xp-face-5); font-size:13px; color:var(--xp-ink-4);",
    card: "background:var(--xp-white); border:1px solid var(--xp-face-3); border-radius:3px; " +
          "padding:10px 12px; margin-bottom:8px;",
    btn: "display:inline-block; padding:4px 12px; background:linear-gradient(to bottom,var(--xp-paper),#dcd8cc); " +
         "border:1px solid var(--xp-face-4); border-radius:3px; cursor:pointer; color:var(--xp-ink); user-select:none;",
    h: "margin:0 0 8px; font-size:16px; font-weight:bold; color:#0b3d91;",
    note: "color:var(--xp-ink-soft-2); font-size:13px; line-height:1.5;",
    label: "display:block; font-size:12px; text-transform:uppercase; letter-spacing:0.4px; " +
           "color:var(--xp-ink-soft-2); margin-bottom:2px;",
    field: "width:100%; box-sizing:border-box; padding:4px 6px; font-family:inherit; font-size:14px; " +
           "border:1px solid var(--xp-face-4); background:var(--xp-white); color:var(--xp-ink);",
    table: "width:100%; border-collapse:collapse; font-size:13px;",
    th: "text-align:left; padding:3px 6px; border-bottom:1px solid var(--xp-face-shade); font-weight:bold;",
    td: "padding:3px 6px; border-bottom:1px solid #e6e3d8;"
  };

  const HM_FOLDERS = ["inbox", "transit", "compose", "book"];

  function hmIcon(index, size) {
    return window.HypernetOS && window.HypernetOS.getIconHTML
      ? window.HypernetOS.getIconHTML(index, size || 16) : "";
  }

  function hmBlankLetter() {
    return { world: null, partyId: null, subject: "", body: "", gold: 0, items: [],
      delay: { days: 0, months: 0, years: 0 } };
  }

  // The desk keeps its own half-written letter, so closing the window and
  // opening it again finds the sheet exactly where it was left. It rides on
  // $gameSystem, which means it survives a save the way the parchment draft does.
  function hmDraft() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return hmBlankLetter();
    const d = $gameSystem._hypermailDraft;
    if (!d || typeof d !== "object") {
      $gameSystem._hypermailDraft = hmBlankLetter();
    } else {
      if (!d.delay || typeof d.delay !== "object") d.delay = { days: 0, months: 0, years: 0 };
      if (!Array.isArray(d.items)) d.items = [];
    }
    return $gameSystem._hypermailDraft;
  }

  function hmClearDraft() {
    if (typeof $gameSystem !== "undefined" && $gameSystem) $gameSystem._hypermailDraft = hmBlankLetter();
  }

  // What is in the bags moves without the post knowing, so an enclosure is
  // trimmed to what the party can actually hand over before it is drawn.
  function hmReconcile() {
    const d = hmDraft();
    if (!hasParty()) return d;
    d.items = d.items.filter((ref) => {
      const obj = resolveRef(ref);
      if (!obj) return false;
      const held = $gameParty.numItems(obj);
      if (held <= 0) return false;
      ref.count = Math.min(ref.count, held);
      return ref.count > 0;
    });
    d.gold = Math.max(0, Math.min(Math.floor(Number(d.gold) || 0), $gameParty.gold()));
    if (d.world && d.partyId && !findCard(d.world, d.partyId)) {
      d.world = null;
      d.partyId = null;
    }
    return d;
  }

  function hmSpanLabel(delay) {
    const parts = [];
    for (const unit of ["years", "months", "days"]) {
      const n = Math.max(0, Number(delay && delay[unit]) || 0);
      if (n > 0) parts.push(T.n("Mail.span." + unit, n, { count: n }));
    }
    return parts.length ? parts.join(", ") : T("Mail.span.none");
  }

  window.HyperMailApp = {
    win: null,
    folder: "inbox",
    selectedId: null,
    message: "",

    launch: function () {
      if (!window.HypernetOS || !window.HypernetOS.WindowManager) return;
      const existing = document.getElementById(HM_APP_ID);
      if (existing) {
        this.win = existing;
        if (window.HypernetOS.WindowManager.focusWindow) {
          window.HypernetOS.WindowManager.focusWindow(existing);
        }
        this.render();
        return;
      }
      // A desk that is written from is a desk anybody may write back to.
      try { registerSelf(); } catch (e) { console.error("[PostExpress] registerSelf failed", e); }

      const contentHTML = `
        <div style="${HS.app}">
          <div style="${HS.bar}" id="hm-toolbar"></div>
          <div style="${HS.body}">
            <div style="${HS.folders}" id="hm-folders"></div>
            <div style="${HS.right}">
              <div style="${HS.list}" id="hm-list"></div>
              <div style="${HS.pane}" id="hm-pane"></div>
            </div>
          </div>
          <div style="${HS.status}">
            <span id="hm-account"></span>
            <span id="hm-counts"></span>
            <span id="hm-message" style="margin-left:auto; color:#0b3d91"></span>
          </div>
        </div>`;

      const win = window.HypernetOS.WindowManager.createWindow({
        id: HM_APP_ID,
        title: T("Mail.app.appName"),
        icon: HM_APP_ICON,
        width: 780,
        height: 540,
        contentHTML: contentHTML
      });
      this.win = win;
      this.message = "";
      this.render();
    },

    // Open the desk straight on a blank sheet.
    compose: function () {
      this.folder = "compose";
      this.launch();
    },

    say: function (text) {
      this.message = text || "";
      const el = this.win && this.win.querySelector("#hm-message");
      if (el) el.textContent = this.message;
    },

    el: function (tag, style, text, id) {
      const node = document.createElement(tag);
      if (style) node.style.cssText = style;
      if (text != null) node.textContent = text;
      if (id) node.id = id;
      return node;
    },

    button: function (label, style, id, onClick) {
      const b = this.el("div", style, label, id);
      b.className = "focusable";
      b.tabIndex = 0;
      b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
      return b;
    },

    render: function () {
      if (!this.win || !this.win.isConnected) return;
      this.renderToolbar();
      this.renderFolders();
      if (this.folder === "compose") this.renderCompose();
      else if (this.folder === "book") this.renderBook();
      else this.renderLetters();
      this.renderStatus();
    },

    // --- Chrome ------------------------------------------------------------

    renderToolbar: function () {
      const bar = this.win.querySelector("#hm-toolbar");
      if (!bar) return;
      bar.innerHTML = "";
      const tools = [
        { id: "new", icon: 192, label: T("Mail.app.tool.write"), run: () => {
            this.folder = "compose"; this.render(); } },
        { id: "open", icon: 191, label: T("Mail.app.tool.collect"), run: () => this.collectSelected() },
        { id: "del", icon: 168, label: T("Mail.app.tool.discard"), run: () => this.discardSelected() },
        { id: "sync", icon: 83, label: T("Mail.app.tool.sync"), run: () => {
            invalidateDirectory();
            try { registerSelf(); } catch (e) { console.error("[PostExpress] registerSelf failed", e); }
            this.say(T("Mail.app.synced"));
            this.render();
            if (window.SoundManager) SoundManager.playOk();
          } }
      ];
      tools.forEach((tool) => {
        const b = this.button("", HS.tool, "hm-tool-" + tool.id, tool.run);
        b.innerHTML = `${hmIcon(tool.icon, 16)}<span>${escapeHtml(tool.label)}</span>`;
        b.addEventListener("mouseenter", () => {
          b.style.background = "var(--xp-face-2)"; b.style.borderColor = "var(--xp-face-4)";
        });
        b.addEventListener("mouseleave", () => {
          b.style.background = "transparent"; b.style.borderColor = "transparent";
        });
        bar.appendChild(b);
      });
    },

    renderFolders: function () {
      const box = this.win.querySelector("#hm-folders");
      if (!box) return;
      box.innerHTML = "";
      const unread = hasParty() ? unreadCount() : 0;
      const waiting = hasParty() ? pendingCount() : 0;
      HM_FOLDERS.forEach((key) => {
        const on = this.folder === key;
        const count = key === "inbox" ? unread : key === "transit" ? waiting : 0;
        const item = this.button("", HS.folder +
          (on ? "background:var(--xp-face-2); border-left-color:#0b3d91; font-weight:bold;" : ""),
          "hm-folder-" + key, () => {
            if (this.folder === key) return;
            this.folder = key;
            this.selectedId = null;
            if (window.SoundManager) SoundManager.playCursor();
            this.render();
          });
        item.innerHTML = `${hmIcon(key === "book" ? 189 : key === "compose" ? 193 : 192, 16)}` +
          `<span>${escapeHtml(T("Mail.app.folder." + key))}</span>` +
          (count ? `<span style="margin-left:auto; font-weight:bold">${count}</span>` : "");
        box.appendChild(item);
      });
    },

    renderStatus: function () {
      const set = (sel, text) => {
        const el = this.win.querySelector(sel);
        if (el) el.textContent = text;
      };
      const world = activeWorld();
      set("#hm-account", world && hasParty()
        ? T("Mail.app.account", { party: partyLabel(selfCard()), world: world })
        : T("Mail.ui.noWorld"));
      set("#hm-counts", world && hasParty()
        ? T("Mail.app.counts", { unread: unreadCount(), transit: pendingCount() })
        : "");
      set("#hm-message", this.message || "");
    },

    // --- The letters -------------------------------------------------------

    letters: function () {
      if (!activeWorld() || !hasParty()) return [];
      const now = worldClock(activeWorld());
      if (this.folder === "transit") {
        return inbox({ pending: true }).filter((m) => (Number(m.deliverAt) || 0) > now);
      }
      return inbox();
    },

    renderLetters: function () {
      const list = this.win.querySelector("#hm-list");
      const pane = this.win.querySelector("#hm-pane");
      if (!list || !pane) return;
      list.style.display = "";
      const rows = this.letters();
      if (!rows.length) {
        list.innerHTML = `<div style="${HS.note} padding:14px">` +
          `${escapeHtml(this.folder === "transit" ? T("Mail.app.nothingInTransit") : T("Mail.inbox.empty"))}</div>`;
        pane.innerHTML = "";
        return;
      }
      if (!rows.some((m) => m.id === this.selectedId)) this.selectedId = rows[0].id;

      list.innerHTML = "";
      rows.forEach((m) => {
        const on = m.id === this.selectedId;
        const crossed = !!(m.from && m.from.world && m.to && m.from.world !== m.to.world);
        const row = this.button("", HS.row + (on ? HS.rowOn : (m.read ? "" : "font-weight:bold;")),
          "hm-row-" + m.id, () => {
            this.selectedId = m.id;
            if (this.folder === "inbox") markRead(m.id);
            if (window.SoundManager) SoundManager.playCursor();
            this.render();
          });
        const enclosed = (m.gold > 0 || (m.items || []).length) && !m.collected;
        row.innerHTML =
          `<span style="width:16px; flex-shrink:0">${enclosed ? hmIcon(191, 14) : ""}</span>` +
          `<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">` +
            `${escapeHtml(m.subject || T("Mail.noSubject"))}</span>` +
          `<span style="width:34%; flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ` +
            `font-size:13px; ${on ? "" : "color:var(--xp-ink-soft-2)"}">` +
            `${escapeHtml((m.from && m.from.label) || T("Mail.unknownParty"))}` +
            `${crossed ? " " + escapeHtml(T("Mail.inbox.crossed")) : ""}</span>` +
          `<span style="flex-shrink:0; font-size:12px; ${on ? "" : "color:var(--xp-ink-soft-2)"}">` +
            `${escapeHtml(stampOf(m.deliverAt))}</span>`;
        list.appendChild(row);
      });

      this.renderLetter(pane, rows.find((m) => m.id === this.selectedId));
    },

    renderLetter: function (pane, m) {
      if (!pane) return;
      if (!m) { pane.innerHTML = `<div style="${HS.note}">${T("Mail.inbox.pickOne")}</div>`; return; }
      const crossed = !!(m.from && m.from.world && m.to && m.from.world !== m.to.world);
      const goods = (m.items || []).map((ref) => {
        const obj = resolveRef(ref);
        return obj ? `${obj.name} x${ref.count}` : null;
      }).filter(Boolean);
      const held = (m.delay && (m.delay.days || m.delay.months || m.delay.years))
        ? T("Mail.inbox.heldBack", { span: hmSpanLabel(m.delay) }) : "";
      const late = (Number(m.deliverAt) || 0) > worldClock(activeWorld());
      const hasEnclosure = m.gold > 0 || goods.length > 0;

      pane.innerHTML = `
        <div style="${HS.card}">
          <div style="font-size:17px; font-weight:bold; margin-bottom:4px">${escapeHtml(m.subject || T("Mail.noSubject"))}</div>
          <div style="${HS.note}">${escapeHtml(m.from && m.from.partyId === partyId() && !crossed
              ? T("Mail.inbox.fromSelf")
              : T("Mail.inbox.fromLine", {
                  who: (m.from && m.from.label) || T("Mail.unknownParty"),
                  world: (m.from && m.from.world) || "?" }))}</div>
          <div style="${HS.note}">${escapeHtml(T("Mail.inbox.written", { date: stampOf(m.sentMinute) }))}</div>
          <div style="${HS.note}">${escapeHtml(late
              ? T("Mail.app.arrivesOn", { date: stampOf(m.deliverAt) })
              : T("Mail.inbox.arrived", { date: stampOf(m.deliverAt) }))}</div>
          ${held ? `<div style="${HS.note}">${escapeHtml(held)}</div>` : ""}
          ${crossed ? `<div style="${HS.note}">${escapeHtml(T("Mail.inbox.crossedFrom",
              { world: m.from.world, fee: euroLabel(m.fee || 0) }))}</div>` : ""}
        </div>
        <div style="${HS.card} white-space:pre-wrap; line-height:1.55; font-size:15px">${escapeHtml(m.body || "")}</div>
        <div style="${HS.card}">
          <div style="font-weight:bold; margin-bottom:4px">${escapeHtml(T("Mail.inbox.enclosed"))}</div>
          ${hasEnclosure ? `
            ${m.gold > 0 ? `<div>${escapeHtml(T("Mail.inbox.moneyLine"))}: ${escapeHtml(moneyLabel(m.gold))}</div>` : ""}
            ${goods.length ? `<div>${escapeHtml(goods.join(", "))}</div>` : ""}
            ${m.collected ? `<div style="${HS.note} margin-top:4px">${escapeHtml(T("Mail.inbox.collectedAlready"))}</div>` : ""}
          ` : `<div style="${HS.note}">${escapeHtml(T("Mail.inbox.nothingEnclosed"))}</div>`}
        </div>
        <div id="hm-letter-actions" style="display:flex; gap:6px"></div>`;

      const actions = pane.querySelector("#hm-letter-actions");
      if (!m.collected && hasEnclosure && !late) {
        actions.appendChild(this.button(T("Mail.inbox.collect"), HS.btn, "hm-collect", () => this.collectSelected()));
      }
      actions.appendChild(this.button(T("Mail.app.replyTo"), HS.btn, "hm-reply", () => this.replyTo(m)));
      if (!late) {
        actions.appendChild(this.button(T("Mail.inbox.discard"), HS.btn, "hm-discard", () => this.discardSelected()));
      }
    },

    collectSelected: function () {
      if (!this.selectedId) return;
      const result = collect(this.selectedId);
      if (!result.ok) {
        this.say(result.error);
        if (window.SoundManager) SoundManager.playBuzzer();
      } else {
        const goods = result.items.reduce((n, ref) => n + ref.count, 0);
        this.say(T("Mail.toast.collected", {
          money: moneyLabel(result.gold),
          goods: goods ? T.n("Mail.toast.goods", goods, { count: goods }) : T("Mail.compose.noGoods")
        }));
        if (window.SoundManager) SoundManager.playOk();
      }
      this.render();
    },

    discardSelected: function () {
      if (!this.selectedId) return;
      const letter = this.letters().find((m) => m.id === this.selectedId);
      if (letter && !letter.collected && (letter.gold > 0 || (letter.items || []).length)) {
        this.say(T("Mail.error.stillFull"));
        if (window.SoundManager) SoundManager.playBuzzer();
        return;
      }
      if (!discard(this.selectedId)) {
        this.say(T("Mail.error.gone"));
        return;
      }
      this.selectedId = null;
      if (window.SoundManager) SoundManager.playCancel();
      this.render();
    },

    replyTo: function (m) {
      const d = hmDraft();
      if (m && m.from && m.from.world && m.from.partyId) {
        d.world = m.from.world;
        d.partyId = m.from.partyId;
        d.subject = T("Mail.app.reSubject", { subject: m.subject || T("Mail.noSubject") }).slice(0, 120);
      }
      this.folder = "compose";
      this.render();
    },

    // --- The address book --------------------------------------------------

    renderBook: function () {
      const list = this.win.querySelector("#hm-list");
      const pane = this.win.querySelector("#hm-pane");
      if (!list || !pane) return;
      list.style.display = "none";
      const groups = activeWorld() ? directory() : [];
      if (!groups.length) {
        pane.innerHTML = `<div style="${HS.card} ${HS.note}">${escapeHtml(T("Mail.compose.noAddresses"))}</div>`;
        return;
      }
      const here = activeWorld();
      pane.innerHTML = `<h2 style="${HS.h}">${escapeHtml(T("Mail.app.folder.book"))}</h2>` +
        `<div style="${HS.note} margin-bottom:10px">${escapeHtml(T("Mail.app.bookBlurb"))}</div>` +
        groups.map((group) => {
          const steps = dimensionalDistance(here, group.world);
          return `<div style="${HS.card}">
            <div style="font-weight:bold">${escapeHtml(group.world)}</div>
            <div style="${HS.note} margin-bottom:6px">${escapeHtml(group.foreign
              ? T("Mail.compose.routeAcross", { world: group.world, steps: steps }) + " " +
                T("Mail.compose.feeShort", { fee: euroLabel(postage(group.world, null)) })
              : T("Mail.compose.routeHome", { world: group.world }))}</div>
            <table style="${HS.table}">
              <thead><tr>
                <th style="${HS.th}">${escapeHtml(T("Mail.app.colParty"))}</th>
                <th style="${HS.th}">${escapeHtml(T("Mail.app.colMembers"))}</th>
                <th style="${HS.th}">${escapeHtml(T("Mail.app.colSeen"))}</th>
              </tr></thead>
              <tbody>${group.parties.map((card) => `<tr>
                <td style="${HS.td}">${escapeHtml(partyLabel(card))}${card.isSelf
                  ? ` <span style="${HS.note}">${escapeHtml(T("Mail.app.thisIsYou"))}</span>` : ""}</td>
                <td style="${HS.td}">${escapeHtml(T.n("Mail.compose.memberCount",
                  (card.members || []).length, { count: (card.members || []).length }))}</td>
                <td style="${HS.td}">${escapeHtml(T("Mail.compose.seenOn", { date: stampOf(card.minute) }))}</td>
              </tr>`).join("")}</tbody>
            </table>
          </div>`;
        }).join("");
    },

    // --- Writing one -------------------------------------------------------

    renderCompose: function () {
      const list = this.win.querySelector("#hm-list");
      const pane = this.win.querySelector("#hm-pane");
      if (!list || !pane) return;
      list.style.display = "none";
      if (!activeWorld() || !hasParty()) {
        pane.innerHTML = `<div style="${HS.card} ${HS.note}">${escapeHtml(T("Mail.ui.noWorld"))}</div>`;
        return;
      }
      const d = hmReconcile();
      // The recipient is picked by its place in this list rather than by a
      // joined key: a world may be named anything at all, separators included.
      const options = [];
      directory().forEach((group) => group.parties.forEach((card) => options.push({
        world: group.world,
        id: card.id,
        label: card.isSelf
          ? T("Mail.compose.yourself", { leader: card.name })
          : T("Mail.compose.addressLine", { who: partyLabel(card), world: group.world })
      })));
      const chosen = options.findIndex((o) => o.world === d.world && o.id === d.partyId);
      const fee = d.world ? postage(d.world, { gold: d.gold, items: d.items }) : 0;
      const total = fee * GOLD_PER_EURO + Math.max(0, Number(d.gold) || 0);
      const short = total - $gameParty.gold();
      const arrival = addDelay(worldClock(d.world || activeWorld()), d.delay);

      pane.innerHTML = `
        <h2 style="${HS.h}">${escapeHtml(T("Mail.app.newMessage"))}</h2>
        <div style="${HS.card}">
          <label style="${HS.label}">${escapeHtml(T("Mail.compose.recipient"))}</label>
          <select id="hm-to" class="focusable" style="${HS.field}">
            <option value="-1">${escapeHtml(T("Mail.compose.noRecipient"))}</option>
            ${options.map((o, i) => `<option value="${i}" ${i === chosen ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
          </select>
          <div style="${HS.note} margin-top:6px" id="hm-route"></div>
        </div>
        <div style="${HS.card}">
          <label style="${HS.label}">${escapeHtml(T("Mail.compose.subject"))}</label>
          <input id="hm-subject" class="focusable" style="${HS.field}" maxlength="120"
                 placeholder="${escapeHtml(T("Mail.compose.subjectPlaceholder"))}" value="${escapeHtml(d.subject)}">
          <label style="${HS.label} margin-top:8px">${escapeHtml(T("Mail.compose.body"))}</label>
          <textarea id="hm-body" class="focusable" rows="7" spellcheck="false"
                    style="${HS.field} resize:vertical; line-height:1.5"
                    placeholder="${escapeHtml(T("Mail.compose.bodyPlaceholder"))}"></textarea>
        </div>
        <div style="${HS.card}">
          <label style="${HS.label}">${escapeHtml(T("Mail.compose.money"))}</label>
          <input id="hm-gold" class="focusable" style="${HS.field}" type="number" min="0"
                 max="${$gameParty.gold()}" step="100" value="${Math.max(0, Number(d.gold) || 0)}">
          <div style="${HS.note}">${escapeHtml(T("Mail.app.purse", { money: moneyLabel($gameParty.gold()) }))}</div>
          <label style="${HS.label} margin-top:10px">${escapeHtml(T("Mail.compose.items"))}</label>
          <div id="hm-goods"></div>
        </div>
        <div style="${HS.card}">
          <label style="${HS.label}">${escapeHtml(T("Mail.app.holdBack"))}</label>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            ${["days", "months", "years"].map((unit) => `
              <div style="flex:1; min-width:96px">
                <div style="${HS.note}">${escapeHtml(T("Mail.compose.delay" + unit.charAt(0).toUpperCase() + unit.slice(1)))}</div>
                <input id="hm-delay-${unit}" class="focusable" style="${HS.field}" type="number"
                       min="0" max="${DELAY_LIMITS[unit]}" value="${Math.max(0, Number(d.delay[unit]) || 0)}">
              </div>`).join("")}
          </div>
          <div style="${HS.note} margin-top:6px">${escapeHtml(T("Mail.compose.arrives", {
            date: stampOf(arrival), span: hmSpanLabel(d.delay) }))}</div>
        </div>
        <div style="${HS.card}">
          <div id="hm-postage">${escapeHtml(!d.world ? T("Mail.compose.noRecipient")
            : fee <= 0 ? T("Mail.compose.postageFree")
            : T("Mail.compose.postageLine", { fee: euroLabel(fee), total: moneyLabel(total) }))}</div>
          ${short > 0 ? `<div style="color:#b00020; margin-top:4px">${escapeHtml(
            T("Mail.compose.cannotAfford", { short: moneyLabel(short) }))}</div>` : ""}
          <div id="hm-send-row" style="display:flex; gap:6px; margin-top:8px"></div>
        </div>`;

      const body = pane.querySelector("#hm-body");
      if (body) body.value = d.body || "";

      const route = pane.querySelector("#hm-route");
      if (route) {
        route.textContent = !d.world ? ""
          : d.world === activeWorld() ? T("Mail.compose.routeHome", { world: d.world })
          : T("Mail.compose.routeAcross", { world: d.world, steps: dimensionalDistance(activeWorld(), d.world) });
      }

      const commit = () => {
        const to = pane.querySelector("#hm-to");
        if (to) {
          const pick = options[Number(to.value)];
          d.world = pick ? pick.world : null;
          d.partyId = pick ? pick.id : null;
        }
        const subject = pane.querySelector("#hm-subject");
        if (subject) d.subject = subject.value.slice(0, 120);
        if (body) d.body = body.value.slice(0, 8000);
        const gold = pane.querySelector("#hm-gold");
        if (gold) d.gold = Math.max(0, Math.min($gameParty.gold(), Math.floor(Number(gold.value) || 0)));
        ["days", "months", "years"].forEach((unit) => {
          const field = pane.querySelector("#hm-delay-" + unit);
          if (field) d.delay[unit] = Math.max(0, Math.min(DELAY_LIMITS[unit], Math.floor(Number(field.value) || 0)));
        });
      };
      // Every field writes itself back as it is typed in, so nothing is lost by
      // clicking a folder mid-sentence; the ones that change the price of the
      // stamp redraw the sheet when they are let go of.
      ["#hm-subject", "#hm-body", "#hm-gold", "#hm-delay-days", "#hm-delay-months", "#hm-delay-years"]
        .forEach((sel) => {
          const field = pane.querySelector(sel);
          if (field) field.addEventListener("input", commit);
        });
      ["#hm-to", "#hm-gold", "#hm-delay-days", "#hm-delay-months", "#hm-delay-years"].forEach((sel) => {
        const field = pane.querySelector(sel);
        if (field) field.addEventListener("change", () => { commit(); this.render(); });
      });

      this.renderGoods(pane.querySelector("#hm-goods"), d, commit);

      const row = pane.querySelector("#hm-send-row");
      row.appendChild(this.button(T("Mail.compose.send"), HS.btn + "font-weight:bold;", "hm-send",
        () => { commit(); this.trySend(); }));
      row.appendChild(this.button(T("Mail.app.clear"), HS.btn, "hm-clear", () => {
        hmClearDraft();
        if (window.SoundManager) SoundManager.playCancel();
        this.say("");
        this.render();
      }));
    },

    renderGoods: function (holder, d, commit) {
      if (!holder) return;
      const stock = mailableStock();
      if (!stock.length) {
        holder.innerHTML = `<div style="${HS.note}">${escapeHtml(T("Mail.compose.nothingToSend"))}</div>`;
        return;
      }
      holder.innerHTML = "";
      const attached = (kind, id) => {
        const ref = d.items.find((r) => r.kind === kind && Number(r.id) === Number(id));
        return ref ? ref.count : 0;
      };
      const setAttached = (kind, id, count) => {
        const at = d.items.findIndex((r) => r.kind === kind && Number(r.id) === Number(id));
        const value = Math.max(0, Math.floor(count));
        if (value <= 0) { if (at >= 0) d.items.splice(at, 1); }
        else if (at >= 0) d.items[at].count = value;
        else d.items.push({ kind, id: Number(id), count: value });
      };

      const box = this.el("div", "max-height:150px; overflow-y:auto; border:1px solid var(--xp-face-4); " +
        "background:var(--xp-white)");
      stock.forEach((entry) => {
        const line = this.el("div", "display:flex; align-items:center; gap:8px; padding:3px 6px; " +
          "border-bottom:1px solid #e6e3d8");
        const name = this.el("span", "flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap");
        name.innerHTML = `${hmIcon(entry.item.iconIndex, 16)} ${escapeHtml(entry.item.name)}`;
        line.appendChild(name);
        line.appendChild(this.el("span", HS.note + "flex-shrink:0",
          T.n("Mail.compose.held", entry.held, { count: entry.held })));
        const step = (delta) => {
          commit();
          setAttached(entry.kind, entry.id,
            Math.min(entry.held, attached(entry.kind, entry.id) + delta));
          if (window.SoundManager) SoundManager.playCursor();
          this.render();
        };
        line.appendChild(this.button("-", HS.btn + "padding:1px 8px;",
          `hm-goods-less-${entry.kind}-${entry.id}`, () => step(-1)));
        line.appendChild(this.el("span", "min-width:22px; text-align:center; font-weight:bold",
          String(attached(entry.kind, entry.id))));
        line.appendChild(this.button("+", HS.btn + "padding:1px 8px;",
          `hm-goods-more-${entry.kind}-${entry.id}`, () => step(1)));
        box.appendChild(line);
      });
      holder.appendChild(box);
    },

    trySend: function () {
      const d = hmDraft();
      const result = send({
        world: d.world, partyId: d.partyId, subject: d.subject, body: d.body,
        gold: d.gold, items: d.items, delay: d.delay
      });
      if (!result.ok) {
        this.say(result.error);
        if (window.SoundManager) SoundManager.playBuzzer();
        if (window.HypernetOS && window.HypernetOS.Dialog) {
          window.HypernetOS.Dialog.error(result.error, T("Mail.app.appName"));
        }
        return;
      }
      hmClearDraft();
      this.say(result.fee > 0
        ? T("Mail.toast.sentAcross", { fee: euroLabel(result.fee) })
        : T("Mail.toast.sent"));
      if (window.SoundManager) SoundManager.playOk();
      this.folder = "inbox";
      this.selectedId = null;
      this.render();
    }
  };

  // The desk is registered with the shell, which loads after this plugin, so
  // the registration waits for the boot when HypernetOS is not there yet.
  function registerMailApp() {
    if (!window.HypernetOS || !window.HypernetOS.registerApp) return false;
    window.HypernetOS.registerApp({
      id: HM_APP_ID,
      name: T("Mail.app.appName"),
      icon: HM_APP_ICON,
      category: "internet",   // i18n-ignore  category id
      launchFn: function () { window.HyperMailApp.launch(); },
      desktopShortcut: true
    });
    return true;
  }

  if (!registerMailApp()) {
    const _Scene_Boot_create_mail = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function () {
      _Scene_Boot_create_mail.call(this);
      registerMailApp();
    };
  }
})();
