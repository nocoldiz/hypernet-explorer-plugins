//=============================================================================
// RocketLaunchHUD.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Rocket Launch, the HUD and the picker: the flight instruments and the launch-site card. A part of RocketLaunchPlugin.js.
 * @author nocoldiz
 * @base GalaxySim/RocketLaunchPlugin
 * @orderAfter GalaxySim/RocketLaunchPlugin
 *
 * @help
 * THE INSTRUMENTS, AND THE PICKER.
 *
 * Everything the player reads rather than watches: the altimeter tape, the
 * speed, the hull integrity, the phase board and the crew log that make up the
 * flight HUD, and the card that asks which pad, which destination and which
 * flight plan before any of it starts.
 *
 * NOT A PLUGIN OF ITS OWN. RocketLaunchPlugin.js is one cinematic and this
 * file is a part of it, split out so the thing can be read: it attaches to
 * the launch stage that plugin has already built and does nothing by itself.
 * It must load AFTER RocketLaunchPlugin.js, and it has no parameters and no
 * plugin commands of its own.
 */

(() => {
  "use strict";

  const RL = window.RocketLaunch;
  const P = RL && RL.parts;
  if (!P) {
    console.error("RocketLaunchHUD.js: RocketLaunchPlugin.js has to load first.");
    return;
  }
  const K = P.K;
  const { HUD_BASE_W, KARMAN_M, KESSLER_IN_M, KESSLER_OUT_M, LIT_BEATS, MOON_SITE_ID, PROFILES, SE, SITES, altText, altitudeAt, availableProfiles, availableSites, clamp, clamp01, clockText, crossing, descentFrom, destinationsFor, fareText, greatCircleM, hazardSeverity, integrityAt, lunarProfileFrom, modeBlurb, modeName, nearestSite, otherSite, pctText, phaseAt, refreshVaultSite, se, siteBlurb, siteName, speedText, start, t, tapeBands, tapeFraction, weatherLabel } = K;

  // PSXHud is not on window yet when the base file builds the parts table, so
  // the HUD handed over was still null and would have stayed null here for
  // good. It is resolved on first use instead, as the base file resolves its.
  let HUD = null;
  function hudReady() {
    if (!HUD) HUD = K.hudReady();
    return HUD;
  }

  // Bright for the newest line, muted for the ones above it, one pair per
  // speaker. Written here rather than taken off the shared palette because the
  // muted halves have to stay legible over the sky and the palette has only
  // the one dim in it.
  const SPEAKER = {
    // i18n-ignore-start  speaker ids
    control: ["#3ad7ef", "#2a7f8d"],
    station: ["#e061c8", "#7a3a6c"],
    crew: ["#4fe07a", "#2f7d46"],
    // i18n-ignore-end
  };

  class LaunchHud {
    constructor(profile) {
      this.profile = profile || PROFILES.orbital;
      const layer = hudReady() ? HUD.layer(HUD_BASE_W()) : null;
      this.layer = layer;
      this.sprite = layer ? layer.sprite : new Sprite(new Bitmap(8, 8));
      this.bmp = layer ? layer.bitmap : this.sprite.bitmap;
      this.w = layer ? layer.w : 320;
      this.h = layer ? layer.h : 180;
      this.bands = tapeBands(this.profile);
      this.lines = [];
      this.caution = 0;
      this.glitch = 0;
    }

    // WHO SAID IT IS PART OF THE LINE. The log used to be five strings in one
    // colour, so a conversation between the ground and the people in the round
    // read as one voice talking to itself. Each line now carries its speaker
    // and is drawn in that speaker's colour: the room on Earth in cyan, a
    // station at the far end in magenta, anybody aboard in green.
    push(text, who) {
      this.lines.push({ text: String(text), who: who || "control" });   // i18n-ignore  speaker id
      while (this.lines.length > 5) this.lines.shift();
    }

    // st: { time, phase, alt, vspeed, integrity, plates, site, env, free }
    draw(st) {
      if (!hudReady()) return;
      const b = this.bmp;
      const P = HUD.PAL;
      b.clear();

      this._drawTape(st, P);
      this._drawBlock(st, P);
      this._drawClock(st, P);
      this._drawLog(st, P);
      this._drawCaution(st, P);
      this._drawChart(st, P);
      this._drawHints(st, P);
      if (b._baseTexture && b._baseTexture.update) b._baseTexture.update();
    }

    // --- the altimeter tape ------------------------------------------------

    _drawTape(st, P) {
      const b = this.bmp;
      const x = this.w - 52;
      const y0 = 18;
      const H = this.h - 44;
      const yOf = (alt) => y0 + Math.round((1 - tapeFraction(alt, this.profile)) * H);

      HUD.panel(b, x, y0 - 8, 46, H + 16, { fill: "#0a1220", dither: true });

      // THE TICKS ARE ALWAYS DRAWN; THE LABELS ARE NOT.
      //
      // A tape with eighteen beats on it puts several of them within a couple
      // of pixels of each other, and two eight-pixel labels two pixels apart
      // are one unreadable smear. So a label is only drawn where there is room
      // for it since the last one, and the tick - which is what actually says
      // where the beat is - is drawn either way.
      const LABEL_H = 9;
      let lastLabel = null;
      // Top of the tape downward, which is the order the beats happen in on
      // every plan that climbs, so a dropped label is always the later of two.
      const ordered = this.bands.slice().sort((p, q) => yOf(p.from) - yOf(q.from));
      ordered.forEach((band) => {
        const yb = yOf(band.from);
        const yt = band.to == null ? yb : yOf(band.to);
        const h = band.to == null ? 1 : Math.max(1, yb - yt);
        if (band.to == null) b.fillRect(x + 2, yb, 22, 1, band.color);
        else b.fillRect(x + 2, yt, 4, h, band.color);

        const ly = band.to == null ? yb - LABEL_H : yt + Math.max(0, h / 2 - 5);
        if (lastLabel !== null && Math.abs(ly - lastLabel) < LABEL_H) return;
        lastLabel = ly;
        HUD.text(b, t("band." + band.key), x + (band.to == null ? 2 : 8), ly,
          band.to == null ? 42 : 38, "left", band.color, 8, { shadow: true });
      });

      // The mark. A wedge, the altitude beside it, and a trail showing where
      // it has already been.
      const my = clamp(yOf(st.alt), y0, y0 + H);
      b.fillRect(x + 2, my, 4, y0 + H - my, "#1d4d7a");
      b.fillRect(x - 6, my - 1, 10, 3, P.ink);
      b.fillRect(x - 8, my, 2, 1, P.ink);
      HUD.text(b, altText(st.alt), x - 64, my - 5, 56, "right", P.ink, 8);

      HUD.text(b, t("hud.altitude"), x, y0 - 18, 40, "left", P.dim, 8);
      // A ground-track bar under the tape, for the hop only: the parabola is
      // as much a distance as it is a height.
      if (this.profile.downrange) {
        const gy = this.h - 30;
        HUD.bar(b, 6, gy, this.w - 60, 5, clamp01(st.downrange), {
          seg: 2, gap: 1, color: P.amber,
        });
        HUD.text(b, siteName(st.fromSite), 6, gy - 9, 60, "left", P.dim, 8);
        HUD.text(b, siteName(st.toSite), this.w - 120, gy - 9, 60, "right", P.dim, 8);
      }
    }

    // --- the numbers -------------------------------------------------------

    _drawBlock(st, P) {
      const b = this.bmp;
      const x = 6, y = 18, w = 116;
      HUD.panel(b, x, y, w, 74, { fill: "#0a1220", dither: true });

      // SPEED first, because it is what a gun is for: the whole velocity over
      // the ground, with the rate of climb under it.
      HUD.text(b, t("hud.speed"), x + 4, y + 3, w - 8, "left", P.dim, 8);
      HUD.text(b, speedText(st.speed), x + 4, y + 12, w - 8, "right", P.amber, 16);
      HUD.text(b, t("hud.velocity"), x + 4, y + 30, w - 8, "left", P.dim, 8);
      HUD.text(b, speedText(st.vspeed), x + 4, y + 30, w - 8, "right", P.cyan, 8);

      // On a hop the second line is the distance still to run; on the orbital
      // flight there is nowhere to run to, so it is the air outside instead.
      if (this.profile.downrange) {
        HUD.text(b, t("hud.downrange"), x + 4, y + 42, w - 8, "left", P.dim, 8);
        HUD.text(b, altText(Math.max(0, st.trackM - st.downrangeM)), x + 4, y + 42, w - 8, "right", P.amber, 8);
      } else {
        HUD.text(b, t("hud.density"), x + 4, y + 42, w - 8, "left", P.dim, 8);
        HUD.text(b, pctText(st.density * 100), x + 4, y + 42, w - 8, "right", P.dim, 8);
      }

      HUD.text(b, t("hud.plates", { n: st.plates }), x + 4, y + 54, w - 8, "left", P.dim, 8);
      HUD.text(b, t("hud.stages", { n: this.profile.stages }), x + 4, y + 54, w - 8, "right", P.dim, 8);

      // Hull integrity. The bar runs green to red and the number is never
      // allowed to read zero, because it never is zero.
      const iy = y + 78;
      HUD.panel(b, x, iy, w, 26, { fill: "#0a1220", dither: true });
      const frac = clamp01(st.integrity / 100);
      const crit = st.integrity < 25;
      const blink = crit && (Math.floor(st.time * 6) % 2 === 0);
      HUD.text(b, t("hud.integrity"), x + 4, iy + 2, w - 8, "left", crit ? P.red : P.dim, 8);
      HUD.text(b, pctText(st.integrity), x + 4, iy + 2, w - 8, "right",
        blink ? P.ink : (crit ? P.red : P.green), 8);
      HUD.bar(b, x + 4, iy + 13, w - 8, 9, frac, {
        seg: 2, gap: 1,
        colorAt: (k) => (k < 0.25 ? P.red : k < 0.55 ? P.amber : P.green),
      });
    }

    // --- the clock ---------------------------------------------------------

    _drawClock(st, P) {
      const b = this.bmp;
      const cx = Math.round(this.w / 2) - 44;
      const inCount = st.phase.key === "countdown" || st.phase.key === "hold";
      const zero = this.profile.start.coil;
      const tMinus = inCount ? (zero - st.time) : (st.time - zero);

      HUD.panel(b, cx, 3, 88, 22, { fill: "#0a1220", dither: true });
      const big = (inCount ? "T-" : "T+") + clockText(Math.abs(tMinus));   // i18n-ignore  T-minus notation
      const urgent = inCount && tMinus <= 5;
      HUD.text(b, big, cx + 3, 5, 82, "center",
        urgent && Math.floor(st.time * 4) % 2 === 0 ? P.red : P.ink, 16);

      HUD.text(b, t("phase." + st.phase.key), cx + 3, 26, 82, "center",
        st.phase.key === "kessler" ? P.red : P.cyan, 8);
    }

    // THE RADIO LOG, and where it is allowed to sit.
    //
    // It grows UPWARD from the bottom of the frame, which is the right way for
    // a log to grow and the wrong way for this one: five lines put its top
    // straight through the hull integrity bar in the block above it, and the
    // one number on the HUD that matters was being covered by chatter about
    // the weather. So it is lifted clear of the camera hint and the caution
    // strip below it, and then CLAMPED off the bottom of the number block: if
    // there is not room for every line, the oldest ones are simply not drawn
    // rather than painted over the bar.
    _drawLog(st, P) {
      const b = this.bmp;
      const LINE = 9;
      // Clear of the hint line and the master caution strip at the foot.
      const bottom = this.h - 32;
      // The number block ends at y 18 + 74 + 4 + 26; nothing may go above it.
      const top = 18 + 104 + 4;
      const room = Math.max(1, Math.floor((bottom - top) / LINE));
      const shown = this.lines.slice(Math.max(0, this.lines.length - room));
      const y = bottom - shown.length * LINE;
      shown.forEach((line, i) => {
        const pal = SPEAKER[line.who] || SPEAKER.control;   // i18n-ignore  speaker id
        HUD.text(b, line.text, 6, y + i * LINE, this.w - 60, "left",
          i === shown.length - 1 ? pal[0] : pal[1], 8);
      });
    }

    // Master caution. During the belt the whole frame gets a red border and a
    // strip of warning text that beats with the strobe on the hull.
    _drawCaution(st, P) {
      if (st.phase.key !== "kessler") return;   // the hop never has one
      const b = this.bmp;
      const beat = Math.floor(st.time * 5) % 2 === 0;
      const col = beat ? P.red : "#5a0f0a";
      b.fillRect(0, 0, this.w, 2, col);
      b.fillRect(0, this.h - 2, this.w, 2, col);
      b.fillRect(0, 0, 2, this.h, col);
      b.fillRect(this.w - 2, 0, 2, this.h, col);
      const cx = Math.round(this.w / 2) - 52;
      HUD.panel(b, cx, this.h - 20, 104, 13, { fill: beat ? "#3a0d08" : "#180608" });
      HUD.text(b, t("hud.caution"), cx + 2, this.h - 19, 100, "center", beat ? P.ink : P.red, 8);
    }

    // The chart. Only drawn when it is open; everything else on the HUD keeps
    // being drawn underneath it, because it is an overlay and not a screen.
    _drawChart(st, P) {
      if (!st.chart) return;
      const b = this.bmp;
      const W = Math.min(220, this.w - 24);
      const H = Math.min(104, this.h - 44);
      const x = Math.round((this.w - W) / 2);
      const y = Math.round((this.h - H) / 2) - 4;

      HUD.panel(b, x, y, W, H, { fill: "#050b14", hi: P.cyan, dither: false });
      HUD.text(b, t("chart.title"), x, y - 10, W, "center", P.cyan, 8);

      const padX = 14, padY = 13;
      const px = x + padX, py = y + padY;
      const pw = W - padX * 2, phh = H - padY * 2 - 8;
      const prof = this.profile;
      const total = prof.start._total;
      if (!(total > 0) || pw < 20 || phh < 16) return;

      // The track, on the same logarithmic tape the altimeter flies so the
      // ground end of it is readable at all.
      const yOf = (alt) => py + phh - Math.round(tapeFraction(alt, prof) * phh);
      const at = (i) => (i / (pw - 1)) * total;

      // The two ends, as rings: a world is a circle on a chart like this and
      // nothing else needs to be said about it.
      const ring = (cx, cy, r, col) => {
        for (let a = 0; a < 28; a++) {
          const th = (a / 28) * Math.PI * 2;
          b.fillRect(cx + Math.round(Math.cos(th) * r), cy + Math.round(Math.sin(th) * r), 1, 1, col);
        }
      };
      ring(px - 5, py + phh, 7, P.green);                    // the world left
      ring(px + pw + 4, py + 6, 7, P.amber);                 // the world aimed at
      HUD.text(b, siteName(st.fromSite), px - 12, py + phh + 6, 70, "left", P.dim, 8);
      HUD.text(b, siteName(st.toSite), px + pw - 58, py - 2, 62, "right", P.dim, 8);

      // The track itself, one pixel a column, and the part already flown drawn
      // solid while the part still to come is dotted: a trajectory is a thing
      // with a past and a future and the chart should say which is which.
      const nowX = px + Math.round(clamp01(st.time / total) * (pw - 1));
      for (let i = 0; i < pw; i++) {
        const cx = px + i;
        const cy = yOf(altitudeAt(at(i), prof));
        const flown = cx <= nowX;
        if (!flown && (i & 1)) continue;
        b.fillRect(cx, cy, 1, 1, flown ? P.cyan : "#24506b");
      }

      // The beats, ticked along the bottom, with the one being flown named.
      prof.phases.forEach((p) => {
        const s = prof.start[p.key];
        if (s == null) return;
        const cx = px + Math.round((s / total) * (pw - 1));
        const on = p.key === st.phase.key;
        b.fillRect(cx, py + phh + 1, 1, on ? 4 : 2, on ? P.ink : "#2a4a63");
      });

      // Where the round is. A cross, because a dot on a one-pixel line is not
      // findable and this is the one thing on the chart that has to be.
      const my = yOf(st.alt);
      b.fillRect(nowX - 3, my, 7, 1, P.ink);
      b.fillRect(nowX, my - 3, 1, 7, P.ink);

      // And the two numbers the chart is for.
      HUD.text(b, t("phase." + st.phase.key), px, py + phh + 6, pw, "center", P.ink, 8);
      HUD.text(b, altText(st.alt), px, py - 2, pw - 64, "left", P.amber, 8);
    }

    // NO KEY LEGEND. The strip along the bottom naming drag, wheel, OK and X
    // was a control hint and nothing else, and nothing in this game prints
    // those. What survives is the one line that is a STATE and not a prompt:
    // the camera is off its rails, which the player has to be told.
    _drawHints(st, P) {
      const b = this.bmp;
      if (st.free) HUD.text(b, t("hud.freeCam"), 6, 6, 80, "left", P.amber, 8);
    }
  }

  class SiteCard {
    // `lockSite` is a pad the command named. The card then never asks which
    // pad this is - asking would let the player answer something the command
    // did not mean, and a flight that was told to leave the ship would go up
    // off a coast in Apulia instead - and the flight plans it offers are the
    // ones THAT pad can fly.
    constructor(env, forcedProfile, lockSite, destOnly) {
      const layer = hudReady() ? HUD.layer(HUD_BASE_W()) : null;
      this.layer = layer;
      this.sprite = layer ? layer.sprite : new Sprite(new Bitmap(8, 8));
      this.bmp = layer ? layer.bitmap : this.sprite.bitmap;
      this.w = layer ? layer.w : 320;
      this.h = layer ? layer.h : 180;
      this.env = env;
      // The vault pad is resolved once, here: from now until the flight ends
      // the set of pads is fixed, whatever the world does underneath.
      refreshVaultSite();
      this.sites = availableSites();
      this.profiles = availableProfiles(lockSite || null);
      this.index = Math.max(0, this.sites.indexOf(nearestSite()));
      this.destIndex = 0;
      this.profileIndex = Math.max(0, this.profiles.indexOf(forcedProfile || "orbital"));   // i18n-ignore  profile id
      // With one flight plan left there is nothing to ask about: the mode page
      // is skipped the same way a plugin command that names one skips it.
      if (this.profiles.length < 2) forcedProfile = forcedProfile || this.profiles[0];
      // The pad the command named, if it named one. It is not a default the
      // player can move off: the pad page is not shown at all.
      this.lock = lockSite && SITES[lockSite] ? lockSite : null;
      if (this.lock) this.index = Math.max(0, this.sites.indexOf(this.lock));
      // A forced profile skips straight to the pad; otherwise the mode is the
      // first thing asked, because it changes what the pad even means. With
      // the pad named too, the only question left is where this comes down.
      this.page = forcedProfile ? (this.lock ? "dest" : "site") : "mode";   // i18n-ignore  page ids
      // A plugin command that names the flight plan is not offering a choice,
      // so backing out of the pad page leaves the scene instead of revealing
      // the page that was deliberately skipped.
      this.hasModePage = !forcedProfile;
      this.destOnly = !!(this.lock && forcedProfile) || !!destOnly;
      this._t = 0;
    }

    get siteId() { return this.sites[this.index] || this.sites[0]; }
    get profileId() { return this.profiles[this.profileIndex] || this.profiles[0]; }
    get profile() { return PROFILES[this.profileId]; }

    // Where this flight may come down. One entry and the page is never shown;
    // the single destination is simply printed on the pad card instead.
    get destIds() { return destinationsFor(this.siteId, this.profile); }
    get destId() { return this.destIds[Math.min(this.destIndex, this.destIds.length - 1)]; }
    get needsDest() { return this.destIds.length > 1; }

    get ids() {
      if (this.page === "mode") return this.profiles;
      if (this.page === "dest") return this.destIds;   // i18n-ignore  page id
      return this.sites;
    }
    get count() { return this.ids.length; }
    get cursor() {
      if (this.page === "mode") return this.profileIndex;
      if (this.page === "dest") return Math.min(this.destIndex, this.count - 1);   // i18n-ignore  page id
      return this.index;
    }
    set cursor(v) {
      if (this.page === "mode") this.profileIndex = v;
      else if (this.page === "dest") this.destIndex = v;   // i18n-ignore  page id
      else this.index = v;
    }

    move(d) {
      this.cursor = (this.cursor + d + this.count) % this.count;
      se(SE.cursor, 70);
    }

    // Returns true when the card is finished and the flight can start.
    confirm() {
      se(SE.select, 85);
      // i18n-ignore-start  page ids
      if (this.page === "mode") {
        // With the pad already named there is nothing to ask on the pad page,
        // so the plan leads straight to where this is coming down - or, with
        // one destination, straight to the flight.
        if (this.lock) {
          if (!this.needsDest) return true;
          this.destIndex = 0;
          this.page = "dest";
          return false;
        }
        this.page = "site";
        return false;
      }
      if (this.page === "site" && this.needsDest) {
        this.destIndex = 0;
        this.page = "dest";
        return false;
      }
      // i18n-ignore-end
      return true;
    }

    // Returns true when there is nothing left to back out of.
    back() {
      se(SE.back, 80);
      // i18n-ignore-start  page ids
      if (this.page === "dest" && this.lock && this.hasModePage) { this.page = "mode"; return false; }
      if (this.page === "dest" && !this.destOnly && !this.lock) { this.page = "site"; return false; }
      if (this.page === "site" && this.hasModePage) { this.page = "mode"; return false; }
      // i18n-ignore-end
      return true;
    }

    // The screen rectangle of a card, so a click can be resolved against it.
    rectOf(i) {
      const n = this.count;
      const cw = Math.floor((this.w - 10 * (n + 1)) / n);
      return { x: 10 + i * (cw + 10), y: 34, w: cw, h: this.h - 72 };
    }

    hitTest(px, py) {
      const sx = px / (Graphics.width / this.w);
      const sy = py / (Graphics.height / this.h);
      for (let i = 0; i < this.count; i++) {
        const r = this.rectOf(i);
        if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return i;
      }
      return -1;
    }

    update(dt) { this._t += dt; this.draw(); }

    draw() {
      if (!hudReady()) return;
      const b = this.bmp;
      const P = HUD.PAL;
      b.clear();
      b.fillRect(0, 0, this.w, this.h, "#04070e");
      const mode = this.page === "mode";
      const dest = this.page === "dest";   // i18n-ignore  page id
      const title = mode ? t("select.modeTitle") : dest ? t("select.destTitle") : t("select.title");
      const sub = mode ? t("select.modeSubtitle") : dest ? t("select.destSubtitle") : t("select.subtitle");
      // The 16px title needs its own line: at y 10 with the subtitle at 26 the
      // two were drawn through each other.
      HUD.text(b, title, 0, 4, this.w, "center", P.cyan, 16);
      HUD.text(b, sub, 0, 22, this.w, "center", P.dim, 8);

      const ids = this.ids;
      ids.forEach((id, i) => {
        const r = this.rectOf(i);
        const on = i === this.cursor;
        const blink = on && Math.floor(this._t * 3) % 2 === 0;
        HUD.panel(b, r.x, r.y, r.w, r.h, {
          fill: on ? "#132238" : "#0a1220",
          hi: on ? P.cyan : P.edgeHi,
          dither: !on,
        });
        const cardTitle = mode ? modeName(PROFILES[id]) : siteName(id);
        const blurb = mode ? modeBlurb(PROFILES[id]) : siteBlurb(id);
        HUD.text(b, cardTitle, r.x + 4, r.y + 4, r.w - 8, "center", on ? P.ink : P.dim, 16);
        HUD.text(b, blurb, r.x + 4, r.y + 23, r.w - 8, "left", P.dim, 8, { lineHeight: 9 });

        const rows = mode ? this._modeRows(id) : dest ? this._destRows(id) : this._siteRows(id);
        // The flight itself, in the space the rows do not want. On the plan
        // page it is the plan this card IS; on the pad and destination pages
        // it is the plan the flight is already committed to, drawn from the
        // pad or to the pad this card names.
        const shape = mode ? PROFILES[id]
          : (dest ? this._profileTo(id) : this._profileFrom(id));
        this._drawTrace(b, P, {
          x: r.x + 5, y: r.y + 34, w: r.w - 10,
          h: r.h - 44 - rows.length * 10,
        }, shape, on);
        rows.forEach(([k, v], n) => {
          const ry = r.y + r.h - 10 - (rows.length - n) * 10;
          this._pairRow(b, k, v, r.x + 5, ry, r.w - 10, P.dim, on ? P.amber : P.dim);
        });
        if (blink) b.fillRect(r.x, r.y + r.h - 2, r.w, 2, P.cyan);
      });

      HUD.text(b, t("select.confirm"), 0, this.h - 14, this.w, "center", P.ink, 8);
    }

    // The plan a flight leaving THIS pad would fly, and the plan a flight
    // arriving at THIS pad would fly. Both are the answers the scene itself
    // works out at launch, asked early so the card can draw them.
    _profileFrom(id) {
      const from = SITES[id], to = SITES[this.destId];
      if (to && to.lunar && id !== MOON_SITE_ID) return lunarProfileFrom(from);
      if (descentFrom(from, to)) return PROFILES.deorbit;
      return this.profile;
    }

    _profileTo(id) {
      const from = SITES[this.siteId], to = SITES[id];
      if (to && to.lunar && this.siteId !== MOON_SITE_ID) return lunarProfileFrom(from);
      if (descentFrom(from, to)) return PROFILES.deorbit;
      return this.profile;
    }

    // THE SHAPE OF A FLIGHT.
    //
    // Altitude against time, on the same logarithmic tape the altimeter flies,
    // so the first two kilometres of a launch are as readable as the last
    // thousand. Drawn as a filled column chart rather than a line: at this
    // resolution a one-pixel line through a log scale is a dotted mess, and a
    // filled profile reads as a climb at a glance.
    _drawTrace(b, P, box, prof, on) {
      if (!prof || box.h < 24 || box.w < 40) return;
      const total = prof.start._total;
      if (!(total > 0)) return;
      const BASE = box.y + box.h - 11;      // the ground line
      const TOP = box.y + 8;                // the top of the plot
      const H = BASE - TOP;
      if (H < 12) return;

      HUD.panel(b, box.x, box.y, box.w, box.h, { fill: "#07101c", dither: !on });

      const yOf = (alt) => BASE - Math.round(tapeFraction(alt, prof) * H);

      // THE BELT, where it is crossed: the one band on the chart that is a
      // hazard rather than a height, so it is the one drawn in red.
      if (prof.belt) {
        const yIn = yOf(KESSLER_IN_M), yOut = yOf(KESSLER_OUT_M);
        for (let y = yOut; y <= yIn; y++) {
          if ((y & 1) === 0) b.fillRect(box.x + 1, y, box.w - 2, 1, "#3a0d08");
        }
        b.fillRect(box.x + 1, yOut, box.w - 2, 1, P.red);
        b.fillRect(box.x + 1, yIn, box.w - 2, 1, P.red);
      }
      // The Karman line, on every plan that reaches it: the one height on the
      // chart everybody already knows the meaning of.
      if (prof.tapeTop > KARMAN_M) {
        const yk = yOf(KARMAN_M);
        for (let x = box.x + 1; x < box.x + box.w - 1; x += 3) b.fillRect(x, yk, 1, 1, P.cyan);
      }

      // The profile.
      const x0 = box.x + 2, plotW = box.w - 4;
      let prevKey = null;
      for (let i = 0; i < plotW; i++) {
        const t2 = (i / (plotW - 1)) * total;
        const y = yOf(altitudeAt(t2, prof));
        const ph = phaseAt(t2, prof);
        // The powered beats are the bright ones. What is lit tells the shape
        // of the plan as much as the height does: a hop is a parabola with a
        // burn on the way down, a lunar crossing is a climb and then a cliff.
        const hot = LIT_BEATS.indexOf(ph.key) >= 0;
        const col = hot ? (on ? P.amber : "#7a5d22") : (on ? P.cyan : "#2a5a66");
        b.fillRect(x0 + i, y, 1, BASE - y, hot ? (on ? "#3a2f14" : "#1a160c") : (on ? "#0d2733" : "#08161d"));
        b.fillRect(x0 + i, y, 1, 1, col);
        // A tick and a name at every beat boundary.
        if (ph.key !== prevKey) {
          if (prevKey !== null) b.fillRect(x0 + i, TOP, 1, BASE - TOP, on ? "#1d3550" : "#12202f");
          prevKey = ph.key;
        }
      }
      b.fillRect(box.x + 1, BASE, box.w - 2, 1, P.dim);

      // The beats, written out under the chart. Too many to name one by one at
      // this width, so it is the count and the two ends of the flight, which
      // is what the player is choosing between.
      const first = prof.phases[2] ? prof.phases[2].key : prof.phases[0].key;
      const last = prof.phases[prof.phases.length - 1].key;
      this._pairRow(b, t("phase." + first), t("phase." + last),
        box.x + 2, BASE + 3, box.w - 4, P.dim, on ? P.ink : P.dim);
    }

    // A LABEL LEFT, A VALUE RIGHT, ON ONE LINE.
    //
    // Both used to be drawn across the whole row width, so on a narrow card a
    // long label ran straight under its own value: RAIL and ARRIVED came out
    // as RAILARRIVED. The value is measured first and keeps its side, the
    // label gets the width that is genuinely left over with a gap between the
    // two, and it condenses inside that the way any other clamped string does.
    _pairRow(b, k, v, x, y, w, kc, vc) {
      const label = String(k).toUpperCase(), value = String(v).toUpperCase();
      b.fontFace = HUD.FONT;
      b.fontSize = 8;
      const vw = Math.max(1, Math.min(w, Math.ceil(b.measureTextWidth(value))));
      const kw = Math.max(1, w - vw - 3);
      HUD.text(b, label, x, y, kw, "left", kc, 8);
      HUD.text(b, value, x + w - vw, y, vw, "left", vc, 8);
    }

    _modeRows(id) {
      const prof = PROFILES[id];
      const a = SITES[this.siteId];
      const dests = destinationsFor(this.siteId, prof);
      const bSite = SITES[dests.length === 1 ? dests[0] : otherSite(a.id).id];
      const oneDest = dests.length === 1;
      return [
        [t("select.fare"), fareText(this._profileFrom(this.siteId), prof, this.destId)],
        [t("select.stages"), String(prof.stages)],
        [t("select.apogee"), altText(prof.apogee)],
        [t("select.armour"), prof.shedsArmour ? t("select.armourLost") : t("select.armourKept")],
        [t("select.arrives"), oneDest ? siteName(bSite.id) : t("select.choice")],
        [t("select.track"), prof.downrange ? altText(greatCircleM(a, bSite)) : t("select.vertical")],
      ];
    }

    _siteRows(id) {
      const st = SITES[id];
      const prof = this.profile;
      const rows = [
        [t("select.latitude"), st.lat.toFixed(2) + "\u00b0"],                    // i18n-ignore  degree sign
        [t("select.weather"), weatherLabel(this.env.weather)],
        [t("select.light"), this.env.night ? t("select.night") : this.env.golden ? t("select.golden") : t("select.day")],
      ];
      const dests = destinationsFor(id, prof);
      if (dests.length === 1) {
        rows.push([t("select.arrives"), siteName(dests[0])]);
      } else if (!prof.downrange) {
        rows.push([t("select.hazard"), pctText(100 - integrityAt(KESSLER_OUT_M, hazardSeverity(this.env), prof))]);
      }
      return rows;
    }

    // The destination page: the same pad readout, with the track from the pad
    // the flight is actually leaving from, because that is the only number
    // that differs between the cards on this page.
    _destRows(id) {
      const st = SITES[id];
      const from = SITES[this.siteId];
      return [
        [t("select.fare"), fareText(this._profileTo(id), this.profile, id)],
        [t("select.latitude"), st.lat.toFixed(2) + "°"],                    // i18n-ignore  degree sign
        [t("select.weather"), weatherLabel(this.env.weather)],
        [t("select.track"), altText(greatCircleM(from, st))],
      ];
    }
  }

  P.registerUI(LaunchHud, SiteCard);
})();
