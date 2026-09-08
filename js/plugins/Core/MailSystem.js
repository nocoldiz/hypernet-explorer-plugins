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
          severity: bad ? "warning" : "good"
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
      window.ParchmentToast.show(text, { duration: 300, severity: "good" });
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
})();
