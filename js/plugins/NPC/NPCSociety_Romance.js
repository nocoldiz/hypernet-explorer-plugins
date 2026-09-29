/*:
 * @target MZ
 * @plugindesc NPC Society: romance identity (window.NPCRomance)
 * @author Omni-Lex
 * @base NPCSociety
 * @orderAfter NPCSociety
 * @orderAfter NPCSociety_InitSpec
 * @help
 * ============================================================================
 * NPCSociety_Romance, part of the NPCSociety family
 * ============================================================================
 * Owns SECTION 3d, ROMANCE IDENTITY, between the ROMANCE-IDENTITY-START and
 * ROMANCE-IDENTITY-END markers.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSocietyRegistry._internal and publishes its own there. Load it right after
 * NPCSociety_InitSpec.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";


  // ==========================================================================
  // SECTION 3d: ROMANCE IDENTITY (window.NPCRomance)
  // ==========================================================================
  // Who somebody is drawn to and how they want to be with them: the one
  // answer the life simulation (who dates, marries and has children), the
  // Empathize Romance tab and the autonomous romance engine all read, so the
  // person the sim pairs off is the same person the panel describes.
  //
  //   orientation  { sexual, romantic }: the Orientations.json entries. The
  //                base roll is seeded per name and stored on the profile as
  //                keys (profile.orientation) by NPCSim.Dev (_famV). It is then
  //                reconciled, live, with the partner the simulation actually
  //                gave them (a couple from before pairing respected
  //                orientation keeps reading true), and an override
  //                (profile._orientOverride: sandbox, dossier, event spec)
  //                wins over both.
  //   relStyle     the key of the Relationships.json style they lean toward,
  //                drawn over every style and stored on the profile. A couple
  //                lives by the style they formed under (record.partnerStyle);
  //                a couple from before that field is read off the old roll,
  //                seeded on both names so the two halves agree.
  //                profile._relStyleOverride (a Propose that landed) wins.
  // ROMANCE-IDENTITY-START
  const NPCRomance = (() => {
    const SAME_GENDER = new Set(["homosexual", "homoromantic"]);
    const DIFF_GENDER = new Set(["heterosexual", "heteroromantic"]);
    const SYNTHETIC   = new Set(["digisexual", "botromantic"]);
    const BOTANIC     = new Set(["dendrosexual", "dendroromantic"]);
    // How often the two rolls are pulled into line with each other.
    const MATCH_CHANCE = 0.6;
    // Rewriting an orientation to admit the partner they actually have: the
    // exact counterpart, or some of the time the bi entry that covers everyone.
    const PARTNER_MATCH = {
      same: { sexual: "homosexual",   romantic: "homoromantic" },
      diff: { sexual: "heterosexual", romantic: "heteroromantic" },
      both: { sexual: "bisexual",     romantic: "biromantic" },
    };
    const BI_CHANCE = 0.25;

    let _orientDb = null;
    let _styleDb  = null;
    function _loadJson(url) {
      if (typeof XMLHttpRequest === "undefined") return null;
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) return JSON.parse(xhr.responseText);
      } catch (e) {
        console.warn("[NPCRomance] failed to load", url, e);
      }
      return null;
    }
    function orientationData() {
      if (typeof window.NPCOrientationData === "function") return window.NPCOrientationData() || {};
      if (_orientDb === null) _orientDb = _loadJson("js/db/NPC/Orientations.json") || {};
      return _orientDb;
    }
    function relationshipData() {
      if (typeof window.NPCRelationshipData === "function") return window.NPCRelationshipData() || {};
      if (_styleDb === null) _styleDb = _loadJson("js/db/NPC/Relationships.json") || {};
      return _styleDb;
    }

    function rngFor(key) {
      const S = window.NPCShared;
      return S ? new S.Rng(S.nameHash(key) ^ S.worldSeed()) : null;
    }
    function weightedPick(list, rng, key) {
      if (!list || !list.length) return null;
      if (!rng) return list[0];
      const total = list.reduce((s, o) => s + (Number(o[key]) || 0), 0);
      if (total <= 0) return rng.pick(list);
      let r = rng.next() * total;
      for (const o of list) { r -= (Number(o[key]) || 0); if (r < 0) return o; }
      return list[list.length - 1];
    }
    function profileOf(name) {
      return (typeof $gameSystem !== "undefined" && $gameSystem?._npcSociety?.[name]) || null;
    }
    const byKey = (list, key) => (list || []).find(o => o.key === key) || null;

    // The seeded roll, before any partner or override has a say.
    function rollOrientation(name) {
      const db = orientationData();
      let sexual   = weightedPick(db.sexual   || [], rngFor(name + "_sexorient"), "pct");
      let romantic = weightedPick(db.romantic || [], rngFor(name + "_romorient"), "pct");
      const canMatch = sexual && romantic && sexual.key !== "asexual" && romantic.key !== "aromantic";
      const matchRng = rngFor(name + "_orientmatch");
      if (canMatch && matchRng && matchRng.next() < MATCH_CHANCE) {
        if ((Number(sexual.pct) || 0) <= (Number(romantic.pct) || 0)) {
          const c = byKey(db.romantic, sexual.correspondsTo);
          if (c) romantic = c;
        } else {
          const c = byKey(db.sexual, romantic.correspondsTo);
          if (c) sexual = c;
        }
      }
      return { sexual, romantic };
    }

    // The gender of the person this one is partnered with, or null when there
    // is none, they live outside the simulation, or they are Non-binary or
    // Cocoon (2, 3), who contradict no orientation.
    function partnerGender(name) {
      const partner = window.NPCLifeSim?.getRecord?.(name)?.partner;
      if (!partner || partner.external) return null;
      const g = profileOf(partner.name)?.gender;
      return (g === 0 || g === 1) ? g : null;
    }

    // One orientation entry rewritten to admit `partnerGender`, or returned
    // untouched when it already does or says nothing about gender.
    function reconcile(entry, kind, list, ownGender, pGender, rng) {
      if (!entry || pGender == null) return entry;
      if (ownGender !== 0 && ownGender !== 1) return entry;
      const wantsSame = SAME_GENDER.has(entry.key);
      const wantsDiff = DIFF_GENDER.has(entry.key);
      if (!wantsSame && !wantsDiff) return entry;
      const isSame = pGender === ownGender;
      if (isSame === wantsSame) return entry;
      const useBi = rng ? rng.next() < BI_CHANCE : false;
      const want  = PARTNER_MATCH[useBi ? "both" : (isSame ? "same" : "diff")][kind];
      return byKey(list, want) || entry;
    }

    // The orientation as it stands today: stored (or rolled) base, reconciled
    // with the partner they have, then any override.
    function orientation(name, profile) {
      profile = profile || profileOf(name);
      const db = orientationData();
      const stored = profile?.orientation;
      let sexual, romantic;
      if (stored && (stored.sexual || stored.romantic)) {
        const rolled = (!byKey(db.sexual, stored.sexual) || !byKey(db.romantic, stored.romantic))
          ? rollOrientation(name) : null;
        sexual   = byKey(db.sexual,   stored.sexual)   || rolled?.sexual   || null;
        romantic = byKey(db.romantic, stored.romantic) || rolled?.romantic || null;
      } else {
        ({ sexual, romantic } = rollOrientation(name));
      }
      const pg = partnerGender(name);
      if (pg != null) {
        const og = profile?.gender ?? 0;
        sexual   = reconcile(sexual,   "sexual",   db.sexual,   og, pg, rngFor(name + "_orientpartner"));
        romantic = reconcile(romantic, "romantic", db.romantic, og, pg, rngFor(name + "_orientpartner2"));
      }
      const ov = profile?._orientOverride;
      if (ov) {
        if (ov.sexualKey)   sexual   = byKey(db.sexual,   ov.sexualKey)   || sexual;
        if (ov.romanticKey) romantic = byKey(db.romantic, ov.romanticKey) || romantic;
      }
      return { sexual, romantic };
    }

    function orientationKeys(name, profile) {
      const o = orientation(name, profile);
      return { sexual: o.sexual?.key || null, romantic: o.romantic?.key || null };
    }

    // The style a person leans toward, over every style there is.
    function rollStyle(name) {
      const styles = relationshipData().styles || [];
      return weightedPick(styles, rngFor(name + "_relstyle"), "weight");
    }

    // The style this person lives by right now. `partnered` is whether they
    // are in a partnership at the moment.
    function styleFor(name, partnered, profile) {
      profile = profile || profileOf(name);
      const styles = relationshipData().styles || [];
      if (profile?._relStyleOverride) {
        const ov = byKey(styles, profile._relStyleOverride);
        if (ov) return ov;
      }
      if (partnered) {
        const record = window.NPCLifeSim?.getRecord?.(name);
        const lived = record?.partnerStyle && byKey(styles, record.partnerStyle);
        if (lived) return lived;
        // A couple from before the style was written down: the old roll over
        // the partnered styles, seeded on both names so they agree.
        const eligible = styles.filter(s => s.mode === "any" || s.mode === "partnered");
        if (!eligible.length) return null;
        let seedName = name + "_relstyle";
        const partner = record?.partner;
        if (partner?.name) seedName = [String(name), String(partner.name)].sort().join("&") + "_relstyle";
        return weightedPick(eligible, rngFor(seedName), "weight");
      }
      const own = profile?.relStyle && byKey(styles, profile.relStyle);
      return own || rollStyle(name);
    }

    function styleKeyOf(name, profile) {
      profile = profile || profileOf(name);
      return profile?._relStyleOverride || profile?.relStyle || rollStyle(name)?.key || "monogamous";
    }

    // Written once per profile by NPCSim.Dev (_famV).
    function store(profile, name) {
      if (!profile || !name) return;
      if (!profile.orientation) {
        const o = rollOrientation(name);
        profile.orientation = { sexual: o.sexual?.key || null, romantic: o.romantic?.key || null };
      }
      if (!profile.relStyle) profile.relStyle = rollStyle(name)?.key || null;
    }

    // What a profile's traits say it is (the same reading the romance engine uses).
    function isSynthetic(profile) {
      return (profile?.traitIds || []).some(id => /cyber|robot|synthetic/i.test(String(id)));
    }
    function isBotanic(profile) {
      return (profile?.traitIds || []).some(id => /plant|flora|botanic/i.test(String(id)));
    }

    // Does one orientation entry admit a partner of this gender and make?
    // Non-binary and Cocoon, on either side, satisfy every gendered one.
    function admits(entry, ownGender, other) {
      if (!entry) return true;
      const key = entry.key;
      if (key === "bubbaromantic") return /bubba/i.test(String(other?.name || ""));
      if (SYNTHETIC.has(key)) return !!other?.synthetic;
      if (BOTANIC.has(key))   return !!other?.botanic;
      const og = other?.gender;
      const fluid = g => g === 2 || g === 3;
      if (fluid(ownGender) || fluid(og) || og == null) return true;
      if (SAME_GENDER.has(key)) return og === ownGender;
      if (DIFF_GENDER.has(key)) return og !== ownGender;
      return true;
    }

    return {
      orientationData, relationshipData, rollOrientation, orientation, orientationKeys,
      reconcile, partnerGender, rollStyle, styleFor, styleKeyOf, store,
      isSynthetic, isBotanic, admits,
      SAME_GENDER, DIFF_GENDER, SYNTHETIC, BOTANIC,
    };
  })();
  window.NPCRomance = NPCRomance;
  // ROMANCE-IDENTITY-END

})();
