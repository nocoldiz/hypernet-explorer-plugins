/*:
 * @target MZ
 * @plugindesc NPC System: downed bodies, loot, coup de grace, butchering and recovery
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Skirmish
 * @help
 * ============================================================================
 * NPCSystem_Downed, part of the NPCSystem family
 * ============================================================================
 * Owns NPCDowned (the NPC DOWNED CORE) and its hooks. Loads last: it binds
 * the late names every module reads once the family is in.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Skirmish.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    GoneRegistry, GroupRegistry, NPCSkirmish, Utils,
  } = window.NPCSystem._internal;

  // ==========================================================================
  // DOWNED BODIES, loot, coup de grace, butchering and recovery
  // ==========================================================================
  // What is left on the ground after a fight, and what the party may do with
  // it. OK on a body opens a DialogueSystem choice (window.DialogueChoice):
  //
  //   a downed monster        Coup de grace / Cancel
  //   a downed person         Loot / Coup de grace / Cancel
  //   a person's corpse       Loot / Butcher / Cancel
  //
  // Loot fills the container "npcbody:<name>" with what the person has on
  // them (profile.equipment, itemIds and world artifacts) and opens it. What
  // is carried out comes off the person for good, an artifact's custody moves
  // to the party, and taking from somebody still breathing is a robbery.
  // Butcher opens the body-part harvest on the corpse, which carries the
  // Humanoid proxy enemy and the person's own wounds as its part damage.
  //
  // killNpc (window.NPCLifeSim, one death path) reaches back here for the map
  // half of a death: the body, the world's record of the gone, the event.
  //
  // Recovery: profile.hp comes back at 5% an hour, wounds knit over days, and
  // somebody badly hurt gets the "heal" need, which takes them to a healer
  // map of their town (a MapJobs clinic, hospital or pharmacy) and its healer
  // counter, where a <Medicine:> item is bought and the wounds heal faster.

  // START NPC DOWNED CORE
  function makeNpcDownedCore() {
    // i18n-ignore-start: menu action ids, item kind ids, crime ids, shop type ids, plugin command ids
    const core = {
      PROXY_ENEMY_ID: 291,
      CONTAINER_PREFIX: "npcbody:",
      REGEN_SHARE_PER_HOUR: 0.05,
      HEAL_BELOW: 0.6,
      BREAK_HEAL_DAYS: 4,
      CUT_HEAL_DAYS: 7,
      TREATED_SPEEDUP: 2,
      TREATMENT_DAYS: 3,
      TREATMENT_HP_SHARE: 0.3,
      HEAL_HOURS: [7, 21],
      HEALER_JOB_IDS: [142, 143, 144],
      HEALER_SHOP_TYPES: ["pharmacy", "cyberClinic"],

      // The actions a body offers, in the order the choice lists them.
      menuFor(kind) {
        if (kind === "monster") return ["coupDeGrace", "cancel"];
        if (kind === "npc") return ["loot", "firstAid", "coupDeGrace", "cancel"];
        if (kind === "corpse") return ["loot", "butcher", "cancel"];
        return ["cancel"];
      },

      // Put down and left alive, or killed.
      crimeFor(outcome) {
        return outcome === "downed" ? "aggravatedAssault" : "murder";
      },

      ROBBERY_CRIME: "robbery",
      ASSAULT_CRIME: "assault",

      pocketMoney(profile) {
        // A beast carries no money to find on it (NPCCreature.mayHoldMoney).
        if (profile && window.NPCCreature?.mayHoldMoney?.(profile, profile._eventName) === false) return 0;
        const m = Math.floor(Number(profile && profile.money) || 0);
        return m > 0 ? m : 0;
      },

      // profile.equipment in either shape ({weaponId, armorIds} or the old
      // [{kind, id}] list), less whatever the person has already lost.
      kitOf(profile) {
        const eq = profile && profile.equipment;
        const lost = new Set((profile && profile.lostEquipIds) || []);
        let weaponId = null, armorIds = [];
        if (Array.isArray(eq)) {
          const w = eq.find(e => e && e.kind === "weapon");
          weaponId = w ? w.id : null;
          armorIds = eq.filter(e => e && e.kind === "armor").map(e => e.id);
        } else if (eq) {
          weaponId = eq.weaponId || null;
          armorIds = Array.isArray(eq.armorIds) ? eq.armorIds.slice() : [];
        }
        return {
          weaponId: weaponId && !lost.has(weaponId) ? weaponId : null,
          armorIds: armorIds.filter(id => id && !lost.has(id))
        };
      },

      artifactKind(kind) {
        const k = String(kind || "").toLowerCase();
        if (k.indexOf("weapon") === 0) return "weapon";
        if (k.indexOf("armor") === 0 || k.indexOf("armour") === 0) return "armor";
        return "item";
      },

      // What the body holds: [{kind, id, qty, artifact}], equipment first.
      // A world artifact worn as equipment is listed once, flagged.
      lootEntries(profile) {
        const out = [];
        const add = (kind, id, qty, artifact) => {
          if (!id) return;
          const row = out.find(r => r.kind === kind && r.id === id);
          if (row) { row.qty += qty; row.artifact = row.artifact || !!artifact; return; }
          out.push({ kind, id, qty, artifact: !!artifact });
        };
        const kit = core.kitOf(profile);
        const arts = Array.isArray(profile && profile.artifacts) ? profile.artifacts : [];
        const isArt = (kind, id) => arts.some(a => a && core.artifactKind(a.kind) === kind && Number(a.id) === id);
        if (kit.weaponId) add("weapon", kit.weaponId, 1, isArt("weapon", kit.weaponId));
        for (const id of kit.armorIds) add("armor", id, 1, isArt("armor", id));
        for (const id of ((profile && profile.itemIds) || [])) add("item", Number(id), 1, isArt("item", Number(id)));
        for (const a of arts) {
          if (!a) continue;
          const kind = core.artifactKind(a.kind);
          const id = Number(a.id);
          if (!out.some(r => r.kind === kind && r.id === id)) add(kind, id, 1, true);
        }
        // The dead give up their augments too, as the catalogue's item when
        // it has one (NPCSim.Implants, Phase I).
        const I = window.NPCSim?.Implants;
        if (profile && profile._killed && I && Array.isArray(profile.implants)) {
          for (const imp of profile.implants) {
            const itemId = imp ? I.itemIdOf(imp.augmentId) : 0;
            if (itemId) add("item", itemId, 1, false);
          }
        }
        return out;
      },

      // One piece taken off the person. Answers the artifact record moved
      // with it ({kind, id}) or null, and whether anything came off at all.
      stripEntry(profile, kind, id) {
        if (!profile) return { taken: false, artifact: null };
        let taken = false;
        const lose = () => {
          profile.lostEquipIds = Array.isArray(profile.lostEquipIds) ? profile.lostEquipIds : [];
          if (!profile.lostEquipIds.includes(id)) profile.lostEquipIds.push(id);
        };
        const eq = profile.equipment;
        if (kind === "weapon" || kind === "armor") {
          if (Array.isArray(eq)) {
            const at = eq.findIndex(e => e && e.kind === kind && e.id === id);
            if (at >= 0) { eq.splice(at, 1); taken = true; }
          } else if (eq) {
            if (kind === "weapon" && eq.weaponId === id) { eq.weaponId = null; taken = true; }
            if (kind === "armor" && Array.isArray(eq.armorIds)) {
              const at = eq.armorIds.indexOf(id);
              if (at >= 0) { eq.armorIds.splice(at, 1); taken = true; }
            }
          }
          if (taken) lose();
        } else if (Array.isArray(profile.itemIds)) {
          const at = profile.itemIds.findIndex(x => Number(x) === id);
          if (at >= 0) { profile.itemIds.splice(at, 1); taken = true; }
        }
        // An augment carried out of a body (lootEntries).
        const Imp = window.NPCSim?.Implants;
        if (!taken && kind === "item" && Imp && Array.isArray(profile.implants)) {
          const at = profile.implants.findIndex(m => m && Imp.itemIdOf(m.augmentId) === id);
          if (at >= 0) { profile.implants.splice(at, 1); taken = true; }
        }
        let artifact = null;
        if (Array.isArray(profile.artifacts)) {
          const at = profile.artifacts.findIndex(a => a && core.artifactKind(a.kind) === kind && Number(a.id) === id);
          if (at >= 0) { artifact = profile.artifacts.splice(at, 1)[0]; taken = true; }
        }
        return { taken, artifact };
      },

      // Something put into the body's pockets goes back onto the person.
      giveEntry(profile, kind, id) {
        if (!profile || !id) return;
        if (kind === "weapon" || kind === "armor") {
          if (Array.isArray(profile.lostEquipIds)) {
            const at = profile.lostEquipIds.indexOf(id);
            if (at >= 0) profile.lostEquipIds.splice(at, 1);
          }
          if (!profile.equipment || Array.isArray(profile.equipment)) {
            const kit = core.kitOf(profile);
            profile.equipment = { weaponId: kit.weaponId, armorIds: kit.armorIds };
          }
          const eq = profile.equipment;
          if (kind === "weapon") eq.weaponId = id;
          else {
            eq.armorIds = Array.isArray(eq.armorIds) ? eq.armorIds : [];
            eq.armorIds.push(id);
          }
          return;
        }
        // No NPC ever holds the Liminal cuffs (NPCShared): answers false so
        // the caller hands them back.
        if (window.NPCShared?.isForbiddenItem?.(id)) return false;
        profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
        profile.itemIds.push(id);
        window.NPCShared?.capItemIds?.(profile);
      },

      // The corpse's part damage for the harvest, off the Humanoid table
      // ({key: {hpPercent, vital}}) and the person's wounds: a broken part is
      // left at a third, a cut one is gone.
      partDamage(injuries, table, mhp, def) {
        const parts = {};
        const hp = Math.max(1, Number(mhp) || 100);
        for (const key of Object.keys(table || {})) {
          const maxHp = Math.max(1, Math.round(hp * ((table[key] && table[key].hpPercent) || 100) / 100));
          const inj = (injuries || []).find(i => i && i.part === key);
          const destroyed = !!(inj && inj.cut);
          const currentHp = destroyed ? 0 : (inj && inj.broken ? Math.max(1, Math.round(maxHp / 3)) : maxHp);
          parts[key] = { currentHp, maxHp, destroyed, appliedStatEffect: destroyed };
        }
        return {
          parts, statModifiers: {}, disabledActions: [],
          archetypeName: "Humanoid",
          def: Number(def) || 0
        };
      },

      mhpOf(profile) {
        return Math.max(1, Number(profile && profile.mhp) || 100);
      },

      isTreated(profile, now) {
        return !!(profile && profile.treatedUntil != null && now < profile.treatedUntil);
      },

      // Hurt enough to go and see somebody: under 60% of their health, or a
      // bone broken. Once treated they wait for it to work.
      needsHeal(profile, now) {
        if (!profile || profile.downed || profile._killed) return false;
        // A lost part whose wait is over: to the clinic for a prosthetic
        // (NPCSim.Implants, Phase I), treated or not.
        if (window.NPCSim?.Implants?.prostheticDue?.(profile, now, profile._eventName)) return true;
        if (core.isTreated(profile, now)) return false;
        return core.needsMending(profile);
      },

      // Under 60% of their health, or a bone broken. A lost part is a
      // stump, not a break: it waits for its prosthetic instead.
      needsMending(profile) {
        const mhp = core.mhpOf(profile);
        const hp = typeof profile.hp === "number" ? profile.hp : mhp;
        if (hp < mhp * core.HEAL_BELOW) return true;
        return Array.isArray(profile.injuries) && profile.injuries.some(i => i && i.broken && !i.lost);
      },

      // `minutes` of mending: 5% of their health an hour, wounds knit over
      // BREAK_HEAL_DAYS (a break) or CUT_HEAL_DAYS (a cut), twice as fast
      // under treatment. Nobody mends lying downed.
      regen(profile, minutes, now) {
        if (!profile || profile.downed || profile._killed || !(minutes > 0)) return;
        const mhp = core.mhpOf(profile);
        const pace = core.isTreated(profile, now) ? core.TREATED_SPEEDUP : 1;
        if (typeof profile.hp !== "number" || !isFinite(profile.hp)) profile.hp = mhp;
        profile.hp = Math.min(mhp, profile.hp + mhp * core.REGEN_SHARE_PER_HOUR * (minutes / 60) * pace);
        if (!Array.isArray(profile.injuries)) return;
        profile.injuries = profile.injuries.filter(inj => {
          if (!inj) return false;
          if (inj.lost) return true; // never knits (NPCSim.Implants)
          inj.mend = (Number(inj.mend) || 0) + minutes * pace;
          const days = inj.cut ? core.CUT_HEAL_DAYS : core.BREAK_HEAL_DAYS;
          return inj.mend < days * 1440;
        });
      },

      // Days left before a wound has knitted, at the pace of today.
      daysToHeal(inj, treated) {
        if (!inj || inj.lost) return 0;
        const days = inj.cut ? core.CUT_HEAL_DAYS : core.BREAK_HEAL_DAYS;
        const left = Math.max(0, days * 1440 - (Number(inj.mend) || 0));
        return Math.ceil(left / 1440 / (treated ? core.TREATED_SPEEDUP : 1));
      },

      // The hour of the day they go, if they need to at all.
      healActivity(profile, hour, activity, now) {
        if (activity === "sleep") return activity;
        const h = Math.floor(Number(hour) || 0);
        if (h < core.HEAL_HOURS[0] || h >= core.HEAL_HOURS[1]) return activity;
        if (!core.needsHeal(profile, now)) return activity;
        if (profile._healDeniedDay === Math.floor(now / 1440)) return activity;
        return "heal";
      },

      // The maps of a town that have a healer on them (the group's MapJobs
      // table, {mapId: [jobId]}), among the maps the town holds.
      healerMaps(groupJobs, groupMaps) {
        const out = [];
        for (const [mapId, jobs] of Object.entries(groupJobs || {})) {
          const id = Number(mapId);
          if (!id || !Array.isArray(jobs) || !jobs.some(j => core.HEALER_JOB_IDS.includes(j))) continue;
          if (Array.isArray(groupMaps) && groupMaps.length && !groupMaps.includes(id)) continue;
          out.push(id);
        }
        return out.sort((a, b) => a - b);
      },

      // A healer's counter: a pharmacy or cyber clinic daily shop, or the
      // prosthetics clinic.
      isHealerCommand(cmd) {
        if (!cmd || cmd.code !== 357 || !Array.isArray(cmd.parameters)) return false;
        const plugin = String(cmd.parameters[0] || "");
        const command = cmd.parameters[1];
        if (/(^|\/)Health_ProstheticShop$/.test(plugin)) return command === "OpenProstheticShop";
        if (!/(^|\/)RandomDailyShop$/.test(plugin) || command !== "openThemedShop") return false;
        const args = cmd.parameters[3] || {};
        return core.HEALER_SHOP_TYPES.includes(args.shopType);
      },

      isMedicine(item) {
        return !!(item && /<Medicine:/i.test(String(item.note || "")) && (item.price || 0) > 0);
      },

      // The cheapest medicine they can pay for, or null.
      pickMedicine(items, money) {
        const pool = (items || []).filter(i => core.isMedicine(i) && i.price <= (Number(money) || 0));
        pool.sort((a, b) => (a.price - b.price) || (a.id - b.id));
        return pool[0] || null;
      }
    };
    // i18n-ignore-end
    return core;
  }
  // END NPC DOWNED CORE

  const NPCDowned = makeNpcDownedCore();
  // i18n-ignore-start: menu action ids, kinds, crime ids, need and state ids, custody actions
  const DOWNED_I18N = "Battle.downedBody.";
  const DOWNED_HEAL_NEED = "heal";
  const DOWNED_IMPLANT_EVENT = "implant";
  const DOWNED_INTERACT_STATES = ["goingToInteract", "interacting"];
  const DOWNED_UNSEEKABLE = ["fleeing", "skirmishing", "downed"];
  const DOWNED_CUSTODY_STOLEN = "stole";
  const DOWNED_CUSTODY_SEIZED = "seized";
  // i18n-ignore-end

  Object.assign(NPCDowned, {
    _session: null,
    _filling: false,
    _hooked: false,
    _simHooked: false,
    _lastHour: null,
    // The hourly pass over every profile in the world, worked through
    // SWEEP_CHUNK names a frame (see tick).
    SWEEP_CHUNK: 400,
    _sweep: null,
    _healerEvents: { mapId: 0, ids: [] },

    profileOf(name) {
      return $gameSystem?._npcSociety?.[name] || null;
    },

    minute() {
      return ($gameVariables && $gameVariables.value(114)) || 0;
    },

    leaderName() {
      const a = $gameParty?.leader?.();
      return a ? a.name() : null;
    },

    isDowned(name) {
      return !!this.profileOf(name)?.downed;
    },

    // Seekers never pull somebody running, fighting or lying down.
    isUnseekable(name, state) {
      if (state && DOWNED_UNSEEKABLE.includes(state)) return true;
      const p = this.profileOf(name);
      return !!(p && (p.downed || p._killed));
    },

    // ── the choice ──────────────────────────────────────────────────────────
    labelOf(action) {
      return T(DOWNED_I18N + action);
    },

    // Runs `fn` once the choice box has gone, from the map's own update.
    defer(fn) {
      if ($gameTemp) $gameTemp._npcDownedAction = fn;
    },

    runDeferred() {
      const fn = $gameTemp?._npcDownedAction;
      if (!fn || $gameMessage?.isBusy?.() || SceneManager.isSceneChanging()) return;
      $gameTemp._npcDownedAction = null;
      try { fn(); } catch (e) { console.error("[NPC System] downed body action failed", e); }
    },

    ask(kind, prompt, handlers) {
      const actions = this.menuFor(kind);
      const labels = actions.map(a => this.labelOf(a));
      const pick = (i) => {
        const act = actions[i];
        if (act && act !== "cancel" && handlers[act]) this.defer(handlers[act]); // i18n-ignore: menu action id
      };
      const DC = window.DialogueChoice;
      if (DC && DC.ask) return DC.ask(prompt, labels, pick, actions.length - 1);
      if (!$gameMessage || $gameMessage.isBusy()) return false;
      window.skipLocalization = true;
      $gameMessage.add(prompt);
      window.skipLocalization = false;
      $gameMessage.setChoices(labels, 0, actions.length - 1);
      $gameMessage.setChoiceCallback(pick);
      return true;
    },

    // A monster lying downed (BSE.Skirmish): only a coup de grace.
    openMonsterMenu(ev) {
      if (!ev || ev._erased || !ev._bseDowned) return false;
      const troop = ev._fixedTroopId ? $dataTroops?.[ev._fixedTroopId] : null;
      const enemyId = troop?.members?.[0]?.enemyId || 0;
      const name = (enemyId && $dataEnemies?.[enemyId]?.name) || "";
      return this.ask("monster", T(DOWNED_I18N + "promptMonster", { name }), { // i18n-ignore: menu kind
        coupDeGrace: () => this.coupDeGraceMonster(ev)
      });
    },

    coupDeGraceMonster(ev) {
      const BSE = window.BattleSystemEnhanced;
      if (!ev || ev._erased || !BSE?.Functions?.killEnemyEventLeaveCorpse) return false;
      const level = Math.max(1, ...(($gameParty?.members?.() || []).map(a => a.level || 1)), 1);
      const leader = $gameParty?.leader?.();
      const weapon = leader?.weapons?.()[0];
      const m = weapon ? String(weapon.note || "").match(/<DamageType:\s*([^>]+)>/i) : null;
      ev._bseDowned = null;
      ev._npcLyingDown = false;
      BSE.Functions.killEnemyEventLeaveCorpse(ev, level, m ? m[1].trim() : "Slash"); // i18n-ignore: damage type id
      return true;
    },

    // A person lying downed: first their pocket money if a blunt blow put
    // them there, then the choice.
    openNpcMenu(ev, name) {
      const profile = this.profileOf(name);
      if (!profile?.downed) return false;
      if (profile.downed.byBlunt && !profile.downed.pocketTaken) {
        profile.downed.pocketTaken = true;
        this.payPocketMoney(name);
      }
      return this.ask("npc", T(DOWNED_I18N + "promptNpc", { name }), { // i18n-ignore: menu kind
        loot: () => this.openLoot(name, { living: true }),
        firstAid: () => this.firstAidByParty(name),
        coupDeGrace: () => this.coupDeGraceNpc(name, ev)
      });
    },

    // The body of somebody killed on the map or in a battle.
    openCorpseMenu(corpse) {
      if (!corpse || !corpse.npcName) return false;
      const name = corpse.npcName;
      return this.ask("corpse", T(DOWNED_I18N + "promptCorpse", { name }), { // i18n-ignore: menu kind
        loot: () => this.openLoot(name, { living: false, corpse }),
        butcher: () => this.butcher(corpse)
      });
    },

    butcher(corpse) {
      if (!corpse || typeof Scene_BodyPartHarvest === "undefined") return false;
      this.harvestImplants(corpse.npcName);
      SceneManager.push(Scene_BodyPartHarvest);
      SceneManager.prepareNextScene(corpse);
      return true;
    },

    coupDeGraceNpc(name, ev) {
      const profile = this.profileOf(name);
      if (!profile?.downed) return false;
      const wanted = !!window.NPCSystem?.isWanted?.(name);
      const cause = { kind: "coupDeGrace", by: this.leaderName(), byParty: true }; // i18n-ignore: death cause id
      if (ev) { cause.mapId = $gameMap?.mapId?.(); cause.eventId = ev.eventId?.(); }
      this.killNpc(name, cause);
      if (wanted) window.NPCSystem?.collectBounty?.(name);
      else this.fileCrime(this.crimeFor("dead"), null, name); // i18n-ignore: outcome id
      return true;
    },

    // ── money and crime ─────────────────────────────────────────────────────
    payPocketMoney(name) {
      const profile = this.profileOf(name);
      const money = this.pocketMoney(profile);
      if (!money || !$gameParty) return 0;
      $gameParty.gainGold(money);
      profile.money = 0;
      const shown = window.MoneyFormatter?.format ? window.MoneyFormatter.format(money) : String(money);
      try {
        if (window.ParchmentToast?.gold) window.ParchmentToast.gold(money, { title: T(DOWNED_I18N + "pocketMoney", { name, money: shown }), severity: "good" });
        else window.ParchmentToast?.show?.(T(DOWNED_I18N + "pocketMoney", { name, money: shown }), { severity: "good" });
      } catch (e) { }
      return money;
    },

    // A charge by its preset id, through the witness-aware door: `victim`
    // (somebody left alive) always talks, the dead only through witnesses.
    fileCrime(crimeId, victim, target) {
      const CS = window.CrimeSystem;
      if (!CS) return null;
      if (typeof CS.commit === "function") {
        return CS.commit({ crimeId, verb: crimeId, victim: victim || null, target: target || null });
      }
      CS.addPresetCrime?.(crimeId);
      return null;
    },

    // ── down by the party's hand ────────────────────────────────────────────
    // A battle won on a Blunt blow with every vital part intact.
    downByParty(name, where) {
      const profile = this.profileOf(name);
      if (!profile) return false;
      NPCSkirmish.onDowned(name, { byBlunt: true, by: { name: this.leaderName() } });
      if (profile.downed) {
        profile.downed.byParty = true;
        // The fight already paid out what they had on them.
        profile.downed.pocketTaken = true;
      }
      if (where && $gameMap && where.mapId === $gameMap.mapId()) {
        const ev = $gameMap.event(where.eventId);
        if (ev && !this.ctrlOf(name)) { ev._npcDowned = true; ev._npcLyingDown = true; ev._movementLocked = true; }
      }
      return true;
    },

    ctrlOf(name) {
      return ($gameSystem?.npcControllers || []).find(c => c && c.eventName === name) || null;
    },

    // ── one death path ──────────────────────────────────────────────────────
    killNpc(name, cause) {
      const Life = window.NPCLifeSim;
      if (Life && typeof Life.killNpc === "function") return Life.killNpc(name, cause);
      return this.fallOnMap(name, cause);
    },

    // The map half of a death (NPCLifeSim.killNpc calls it): a body where
    // they fell, the world's record of the gone, the event taken away.
    fallOnMap(name, cause) {
      if (!name) return null;
      const profile = this.profileOf(name);
      if (profile) {
        profile._killed = true;
        profile.downed = null;
        profile.hp = 0;
      }
      NPCSkirmish.bse()?.Skirmish?.stop?.({ kind: "npc", name }); // i18n-ignore: skirmish side kind
      let ev = null;
      if (cause && cause.eventId && $gameMap && (!cause.mapId || cause.mapId === $gameMap.mapId())) {
        ev = $gameMap.event(cause.eventId);
        if (ev && ev.event?.()?.name && ev.event().name !== name) ev = null;
      }
      if (!ev) ev = NPCSkirmish.eventOf(name);
      let corpse = null;
      if (ev && !ev._erased && $gameMap) {
        const mapId = $gameMap.mapId();
        const table = window.Health?.Archetypes?.Humanoid?.parts || {}; // i18n-ignore: Archetypes.json id
        corpse = {
          mapId, x: ev.x, y: ev.y,
          spriteName: ev._characterName || profile?.spriteKey || "",
          spriteIndex: ev._characterIndex || 0,
          hue: ev._characterHue || 0,
          bloodColor: [200, 20, 20],
          enemyId: this.PROXY_ENEMY_ID,
          npcName: name,
          partDamage: this.partDamage(profile?.injuries, table, profile?.mhp, profile?.def),
          _harvestedParts: {}
        };
        const BSE = NPCSkirmish.bse();
        if (BSE?.Functions?.dropMapCorpse) BSE.Functions.dropMapCorpse(corpse);
        GoneRegistry.record(mapId, ev.eventId(), name, "killed"); // i18n-ignore: stored record key
        $gameSelfSwitches?.setValue([mapId, ev.eventId(), "A"], true); // i18n-ignore: self switch id
        ev._npcLyingDown = false;
        ev._npcDowned = false;
        ev.erase();
      } else {
        GoneRegistry.recordName(name, "killed"); // i18n-ignore: stored record key
      }
      if ($gameSystem?.npcControllers) {
        $gameSystem.npcControllers = $gameSystem.npcControllers.filter(c => c?.eventName !== name);
      }
      return corpse;
    },

    // ── loot ────────────────────────────────────────────────────────────────
    containerIdOf(name) {
      return this.CONTAINER_PREFIX + name;
    },

    nameOfContainer(containerId) {
      const id = String(containerId || "");
      return id.indexOf(this.CONTAINER_PREFIX) === 0 ? id.slice(this.CONTAINER_PREFIX.length) : null;
    },

    dataOf(kind, id) {
      if (kind === "weapon") return $dataWeapons?.[id] || null; // i18n-ignore: item kind
      if (kind === "armor") return $dataArmors?.[id] || null;   // i18n-ignore: item kind
      return $dataItems?.[id] || null;
    },

    kindOfKey(key) {
      const k = String(key);
      if (k[0] === "w") return { kind: "weapon", id: parseInt(k.slice(1), 10) }; // i18n-ignore: item kind
      if (k[0] === "a") return { kind: "armor", id: parseInt(k.slice(1), 10) };  // i18n-ignore: item kind
      return { kind: "item", id: parseInt(k, 10) }; // i18n-ignore: item kind
    },

    // The body's pockets are the person's: the container is rebuilt from
    // the profile every time it is opened.
    fillContainer(name) {
      const CM = window.ContainerManager, IU = window.ItemUtils;
      const profile = this.profileOf(name);
      if (!CM || !IU || !profile) return null;
      const id = this.containerIdOf(name);
      const bag = CM.getContainer(id);
      for (const k of Object.keys(bag)) delete bag[k];
      this._filling = true;
      try {
        for (const row of this.lootEntries(profile)) {
          const data = this.dataOf(row.kind, row.id);
          if (!data) continue;
          CM.addItem(id, IU.encodeKey(data), row.qty, false);
        }
      } finally {
        this._filling = false;
      }
      CM.markStocked?.(id);
      return id;
    },

    openLoot(name, opts = {}) {
      this.ensureContainerHooks();
      const profile = this.profileOf(name);
      if (!profile || typeof Scene_Container === "undefined") return false;
      const id = this.fillContainer(name);
      if (!id) return false;
      // Whatever coin is left on them goes with the rest.
      if (this.pocketMoney(profile) > 0) this.payPocketMoney(name);
      this._session = { name, containerId: id, living: !!opts.living, robberyFiled: false };
      SceneManager.push(Scene_Container);
      SceneManager.prepareNextScene(id, false, 0);
      return true;
    },

    // Something carried out of the body's pockets.
    onTaken(name, key, amount) {
      const profile = this.profileOf(name);
      if (!profile) return;
      const { kind, id } = this.kindOfKey(key);
      const leader = this.leaderName();
      const living = !!(this._session && this._session.name === name ? this._session.living : profile.downed);
      for (let i = 0; i < Math.max(1, amount | 0); i++) {
        const res = this.stripEntry(profile, kind, id);
        // The driver's car keys: their parked car opens for the party now.
        if (res.taken && kind === "item" && window.NPCShared?.isCarKeys?.(id)) { // i18n-ignore: item kind
          window.RoadCarAI?.onDriverKeysTaken?.(name);
        }
        if (res.artifact && leader) {
          try {
            window.HistoryManager?.recordArtifactCustody?.(res.artifact.kind, res.artifact.id, leader,
              living ? DOWNED_CUSTODY_STOLEN : DOWNED_CUSTODY_SEIZED);
          } catch (e) { console.error("[NPC System] artifact custody failed", e); }
        }
      }
      if (living && profile.downed && !profile._killed) {
        const s = this._session;
        if (!s || s.name !== name || !s.robberyFiled) {
          if (s && s.name === name) s.robberyFiled = true;
          const data = this.dataOf(kind, id);
          this.fileCrime(this.ROBBERY_CRIME, name, data ? data.name : null);
        }
      }
    },

    onStored(name, key) {
      const profile = this.profileOf(name);
      if (!profile) return;
      const { kind, id } = this.kindOfKey(key);
      if (this.giveEntry(profile, kind, id) === false) this.bounceBack(name, key, kind, id);
    },

    // Something put into a body the person may not hold (the Liminal cuffs):
    // out of the pockets again and back into the party's bag.
    bounceBack(name, key, kind, id) {
      const CM = window.ContainerManager;
      const data = this.dataOf(kind, id);
      this._filling = true;
      try { CM?.removeItem?.(this.containerIdOf(name), key, 1, false); } finally { this._filling = false; }
      if (data && $gameParty) $gameParty.gainItem(data, 1);
    },

    ensureContainerHooks() {
      const CM = window.ContainerManager;
      if (!CM || CM._npcDownedHooked) return;
      CM._npcDownedHooked = true;
      const self = this;
      const rm = CM.removeItem, add = CM.addItem, theft = CM.reportTheft;
      CM.removeItem = function (containerId, itemId, amount, isExtra) {
        const had = isExtra ? 0 : (this.getItemAmount ? this.getItemAmount(containerId, itemId, false) : amount);
        rm.call(this, containerId, itemId, amount, isExtra);
        const name = !isExtra && !self._filling ? self.nameOfContainer(containerId) : null;
        if (name && had > 0) self.onTaken(name, itemId, Math.min(had, amount));
      };
      CM.addItem = function (containerId, itemId, amount, isExtra) {
        add.call(this, containerId, itemId, amount, isExtra);
        const name = !isExtra && !self._filling ? self.nameOfContainer(containerId) : null;
        if (name) for (let i = 0; i < Math.max(1, amount | 0); i++) self.onStored(name, itemId);
      };
      // A body is not somebody's cupboard: the robbery is filed here, not
      // as a burglary haul.
      CM.reportTheft = function (containerId) {
        if (self.nameOfContainer(containerId)) return;
        return theft.apply(this, arguments);
      };
    },

    // ── recovery ────────────────────────────────────────────────────────────
    recoverProfile(profile) {
      if (!profile) return;
      profile.downed = null;
      NPCSkirmish.ensureHp(profile);
      profile.hp = Math.max(profile.hp, Math.max(1, Math.round(this.mhpOf(profile) * NPCSkirmish.RECOVER_HP_SHARE)));
    },

    // First aid: somebody lying downed is brought round now, at a quarter of
    // their health (NPCSkirmish.RECOVER_HP_SHARE), instead of when their time
    // is up. Answers { hp, mhp } or null when there is nobody down to help.
    firstAid(name) {
      const profile = this.profileOf(name);
      if (!profile || !profile.downed || profile._killed) return null;
      const c = this.ctrlOf(name);
      if (c && typeof NPCSkirmish.recover === "function") {
        NPCSkirmish.recover(c);
      } else {
        this.recoverProfile(profile);
        const ev = (NPCSkirmish.eventOf ? NPCSkirmish.eventOf(name) : null) ||
          ($gameMap?.events?.() || []).find(e => e && !e._erased && e.event?.()?.name === name) || null;
        if (ev) { ev._npcDowned = false; ev._npcLyingDown = false; ev._movementLocked = false; }
      }
      try { window.NPCSim?.emit?.("npc:revived", { name, by: this.leaderName() }); } catch (e) { } // i18n-ignore: event bus id
      return { hp: profile.hp, mhp: this.mhpOf(profile) };
    },

    // The same off the body's own menu: the leader kneels, and the gratitude,
    // the practice and the standing are the Empathize panel's (NPCEmpathize.Help).
    firstAidByParty(name) {
      const profile = this.profileOf(name);
      if (!profile?.downed) return false;
      const leader = $gameParty?.leader?.() || null;
      const Help = window.NPCEmpathize?.Help;
      const add = window.NPCEmpathize?._helpers?._addNpcOpinion;
      let done = false;
      if (Help?.applyFirstAid) {
        const res = Help.applyFirstAid({
          name, profile, actor: leader, beast: Help.isBeast(profile, name),
          addOpinion: (d) => { if (add && leader?.actorId) add(profile, leader.actorId(), d); },
        });
        done = !!res?.ok;
      } else {
        done = !!this.firstAid(name);
      }
      if (done) {
        try { window.ParchmentToast?.show?.(T(DOWNED_I18N + "firstAidDone", { name }), { severity: "good", duration: 150 }); }
        catch (e) { /* a popup never breaks the menu */ }
      }
      return done;
    },

    // Once a game hour: everybody hurt mends a little, the downed who are
    // nowhere on this map get up when their time is up, and the hurt who
    // are off it see their healer where they are.
    tick() {
      if (!$gameSystem?._npcSociety || !$gameVariables) return;
      const now = this.minute();
      const hour = Math.floor(now / 60);
      if (this._lastHour === null || hour < this._lastHour) { this._lastHour = hour; return; }
      if (hour === this._lastHour) return;
      const minutes = Math.min(14 * 1440, (hour - this._lastHour) * 60);
      this._lastHour = hour;
      // The monsters lying downed on this map get up on the same clock
      // (BSE.Skirmish.recoverDownedMonsters: 3 to 6 hours, a quarter of their
      // health), whether or not anybody is watching them crawl.
      try { NPCSkirmish.bse()?.Skirmish?.recoverDownedMonsters?.(now); }
      catch (e) { console.warn("[NPC System] downed monster recovery failed", e); }
      // The pass over every person in the world used to run whole in this
      // frame, the same frame the hourly simulation tick and the street's
      // turnover land in. It is now started here and worked through a chunk a
      // frame (tickSweep, from the map update). A pass still unfinished when
      // the next hour comes is finished first, so no hour is lost.
      if (this._sweep) this.tickSweep(Infinity);
      this._sweep = { names: Object.keys($gameSystem._npcSociety), i: 0, minutes, society: $gameSystem._npcSociety };
      this.tickSweep();
    },

    // One chunk of the hourly pass: everybody hurt mends a little, the downed
    // who are off this map get up when their time is up, and the hurt who are
    // off it see their healer. A save loaded or a new world mid-pass drops it.
    tickSweep(budget = this.SWEEP_CHUNK) {
      const sw = this._sweep;
      if (!sw) return;
      const society = $gameSystem?._npcSociety;
      if (!society || society !== sw.society) { this._sweep = null; return; }
      const now = this.minute();
      const onMap = new Set(($gameSystem.getActiveNPCControllers?.() || []).map(c => c.eventName));
      const end = Math.min(sw.names.length, sw.i + budget);
      for (; sw.i < end; sw.i++) {
        const name = sw.names[sw.i];
        const p = society[name];
        if (!p || p._killed) continue;
        const hurt = p.downed || (typeof p.hp === "number" && p.hp < this.mhpOf(p)) ||
          (Array.isArray(p.injuries) && p.injuries.length);
        if (!hurt) continue;
        if (p.downed) {
          if (!onMap.has(name) && now >= (p.downed.untilMinute || 0)) this.recoverProfile(p);
          continue;
        }
        this.regen(p, sw.minutes, now);
        if (!onMap.has(name) && p.currentNeed === DOWNED_HEAL_NEED) this.treat(name, p, null);
      }
      if (sw.i >= sw.names.length) this._sweep = null;
    },

    // A treatment bought: the cheapest <Medicine:> item they can pay for,
    // off the counter when there is one, else the pharmacopoeia.
    treat(name, profile, goods) {
      if (!profile) return false;
      const now = this.minute();
      // A lost part whose wait is over is made good first (Phase I).
      const fitted = this.fitProsthetic(name, profile, now);
      if (fitted && !this.needsMending(profile)) return true;
      if (this.isTreated(profile, now)) return !!fitted;
      const fromCounter = (goods || []).filter(g => g && g.data && (g.type || "item") === "item").map(g => g.data); // i18n-ignore: item kind
      const pool = fromCounter.some(i => this.isMedicine(i)) ? fromCounter : ($dataItems || []).filter(Boolean);
      const med = this.pickMedicine(pool, profile.money);
      if (!med) {
        if (!fitted) profile._healDeniedDay = Math.floor(now / 1440);
        return !!fitted;
      }
      profile.money = Math.max(0, (Number(profile.money) || 0) - med.price);
      profile.treatedUntil = now + this.TREATMENT_DAYS * 1440;
      NPCSkirmish.ensureHp(profile);
      profile.hp = Math.min(this.mhpOf(profile), profile.hp + this.mhpOf(profile) * this.TREATMENT_HP_SHARE);
      const price = window.MoneyFormatter?.format ? window.MoneyFormatter.format(med.price) : String(med.price);
      try { window.NPCSim?.StoryLogger?.record?.(name, DOWNED_HEAL_NEED, "NPCSim.log.treated", { item: med.name, price }); } catch (e) { }
      try { window.NPCSim?.emit?.("npc:treated", { name, itemId: med.id }); } catch (e) { } // i18n-ignore: event bus id
      return true;
    },

    // The prosthetic for a lost part, at the clinic (NPCSim.Implants): the
    // part works again, the money is paid, the day is written down.
    fitProsthetic(name, profile, now) {
      const I = window.NPCSim?.Implants;
      if (!I?.prostheticDue?.(profile, now, name)) return null;
      const got = I.fitProsthetic(name, profile, now);
      if (!got) return null;
      const price = window.MoneyFormatter?.format ? window.MoneyFormatter.format(got.price) : String(got.price);
      const params = { augment: got.augmentId, bodyPart: got.part };
      try { window.NPCSim?.StoryLogger?.record?.(name, DOWNED_HEAL_NEED, "NPCSim.log.prosthetic", { item: I.label(got.augmentId), price }); } catch (e) { }
      try { window.NPCLifeSim?.logEvent?.(name, now, DOWNED_IMPLANT_EVENT, I.EVENT_PROSTHETIC, params); } catch (e) { }
      return got;
    },

    // Butchering a body pries its augments out, as the catalogue's item
    // when it has one (NPCSim.Implants). Answers the item ids handed over.
    harvestImplants(name) {
      const profile = this.profileOf(name);
      const I = window.NPCSim?.Implants;
      if (!profile || !I || !Array.isArray(profile.implants) || !profile.implants.length) return [];
      const got = [];
      profile.implants = profile.implants.filter(imp => {
        const id = imp ? I.itemIdOf(imp.augmentId) : 0;
        const data = id ? $dataItems?.[id] : null;
        if (!data || typeof $gameParty?.gainItem !== "function") return true;
        $gameParty.gainItem(data, 1);
        got.push(id);
        return false;
      });
      if (got.length) {
        const items = got.map(id => $dataItems[id].name).join(", ");
        window.ParchmentToast?.show?.(T(DOWNED_I18N + "implantsHarvested", { items }));
      }
      return got;
    },

    // The healer counters standing on this map, found once per map.
    healerEventsHere() {
      if (!$gameMap) return [];
      const mapId = $gameMap.mapId();
      if (this._healerEvents.mapId !== mapId || this._healerEvents.frame !== $gameMap._npcDownedSetup) {
        const ids = [];
        for (const ev of $gameMap.events()) {
          const data = ev && ev.event && ev.event();
          if (!data) continue;
          if ((data.pages || []).some(pg => (pg.list || []).some(cmd => this.isHealerCommand(cmd)))) ids.push(ev.eventId());
        }
        this._healerEvents = { mapId, ids, frame: $gameMap._npcDownedSetup };
      }
      return this._healerEvents.ids.map(id => $gameMap.event(id)).filter(ev => ev && !ev._erased);
    },

    groupHealerMaps(groupName) {
      const group = $gameSystem?._npcMapGroups?.[groupName];
      if (!group) return [];
      return this.healerMaps(group.jobs, group.maps);
    },

    // The "heal" need on the map: to the healer's counter, or, on a healer's
    // map with no counter to walk to, seen where they stand.
    handleHeal(controller, profile) {
      if (!controller?.event) return;
      if (DOWNED_INTERACT_STATES.includes(controller.state)) return;
      const now = performance.now();
      if (now < (controller._healRetryAt || 0)) return;
      controller._healRetryAt = now + 30000;
      const ev = this.healerEventsHere()
        .sort((a, b) => Utils.manhattan(a.x, a.y, controller.event.x, controller.event.y) -
          Utils.manhattan(b.x, b.y, controller.event.x, controller.event.y))[0];
      if (ev && typeof controller.goInteract === "function") {
        controller.goInteract(ev, DOWNED_HEAL_NEED);
        return;
      }
      const group = GroupRegistry.findGroupByMap($gameMap.mapId());
      const here = group ? this.groupHealerMaps(group).includes($gameMap.mapId()) : false;
      if (here) this.treat(controller.eventName, profile, null);
    },

    // The simulation's schedule, dispatcher and map routing learn the need.
    installSimHooks() {
      const sim = window.NPCSim;
      if (this._simHooked || !sim) return;
      this._simHooked = true;
      const self = this;
      const SM = sim.ScheduleManager;
      if (SM && typeof SM.evaluate === "function") {
        const evaluate = SM.evaluate;
        SM.evaluate = function (profile, hour) {
          const activity = evaluate.call(this, profile, hour);
          if (!profile || window.NPCCreature?.isNonSentientProfile?.(profile)) return activity;
          return self.healActivity(profile, hour, activity, self.minute());
        };
      }
      const BD = sim.BehaviorDispatcher;
      if (BD && typeof BD.dispatch === "function") {
        const dispatch = BD.dispatch;
        BD.dispatch = function (controller, profile, force) {
          const out = dispatch.call(this, controller, profile, force);
          if (profile && profile.currentNeed === DOWNED_HEAL_NEED && controller && !profile.downed &&
            !DOWNED_UNSEEKABLE.includes(controller.state) && controller.state !== "talkingToPlayer") { // i18n-ignore: controller state id
            try { self.handleHeal(controller, profile); } catch (e) { console.error("[NPC System] heal dispatch failed", e); }
          }
          return out;
        };
      }
      if (typeof sim.scheduledMapForNPC === "function") {
        const route = sim.scheduledMapForNPC;
        sim.scheduledMapForNPC = function (name, groupName, hour) {
          const p = $gameSystem?._npcSociety?.[name];
          if (p && SM && SM.evaluate(p, hour ?? ($gameVariables?.value(23) ?? 12)) === DOWNED_HEAL_NEED) {
            const maps = self.groupHealerMaps(groupName);
            if (maps.length) return maps[(Utils.nameHash(String(name)) >>> 0) % maps.length];
          }
          return route.apply(this, arguments);
        };
      }
      if (typeof sim.on === "function") {
        sim.on("npc:interact", ({ name, targetEvent, reason }) => { // i18n-ignore: event bus id
          if (reason !== DOWNED_HEAL_NEED || !targetEvent) return;
          const profile = self.profileOf(name);
          if (!profile) return;
          let goods = [];
          try { goods = window.ShopScanner?.extractShopItems?.(targetEvent, targetEvent.x, targetEvent.y) || []; } catch (e) { goods = []; }
          self.treat(name, profile, goods);
        });
      }
    }
  });

  // The gone, by name alone: somebody who died nowhere near an event.
  GoneRegistry.recordName = function (name, reason) {
    if (!name) return;
    const store = this.store(true);
    if (!store) return;
    store[this.procKey(name)] = {
      name, mapId: 0, eventId: 0,
      reason: reason || "killed", // i18n-ignore: stored record key
      at: ($gameVariables && $gameVariables.value(114)) || 0,
      by: ($gameParty && $gameParty.leader() && $gameParty.leader().name()) || null
    };
    $gameSystem._npcGoneCitizens = store;
    this._names = null;
  };

  // A downed person answers OK with the body's own menu, never their page.
  const _Game_Event_start_downed = Game_Event.prototype.start;
  Game_Event.prototype.start = function () {
    const name = this.event?.()?.name;
    if (name && !this._erased) {
      const p = $gameSystem?._npcSociety?.[name];
      if (p && p.downed && !p._killed) {
        NPCDowned.openNpcMenu(this, name);
        return;
      }
    }
    _Game_Event_start_downed.call(this);
  };

  const _Game_Map_setupEvents_downed = Game_Map.prototype.setupEvents;
  Game_Map.prototype.setupEvents = function () {
    _Game_Map_setupEvents_downed.call(this);
    this._npcDownedSetup = (this._npcDownedSetup || 0) + 1;
  };

  const _Game_Map_update_downed = Game_Map.prototype.update;
  Game_Map.prototype.update = function (sceneActive) {
    _Game_Map_update_downed.call(this, sceneActive);
    if (!sceneActive) return;
    NPCDowned.installSimHooks();
    NPCDowned.runDeferred();
    try {
      // tick runs the first chunk of a pass it starts; only a pass already
      // under way before it takes its next chunk here.
      const sweep = NPCDowned._sweep;
      NPCDowned.tick();
      if (sweep && NPCDowned._sweep === sweep) NPCDowned.tickSweep();
    } catch (e) { console.error("[NPC System] recovery tick failed", e); }
  };

  window.NPCDowned = NPCDowned;

  Object.assign(window.NPCSystem._internal, {
    NPCDowned,
  });

  // The whole family is in: hand every module the names it reads late.
  for (const bind of window.NPCSystem._internal._late) bind();
})();
