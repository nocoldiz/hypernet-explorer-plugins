/*:
 * @target MZ
 * @plugindesc NPC System: map skirmish, people against monsters
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Horde
 * @help
 * ============================================================================
 * NPCSystem_Skirmish, part of the NPCSystem family
 * ============================================================================
 * Owns NPCSkirmish (the NPC SKIRMISH CORE) and its controller hooks, and the
 * registry of the fights a person is in (BSE.Skirmish.fights, start, stop,
 * isFighting, huntPeople, pairScan, update), installed onto the resolver
 * BattleSystemEnhancedEncounters.js builds (moved here from its section 19).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Horde.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    Config, isZombieWalker, NPCController, PoliceForce, StreetCrime, Utils,
  } = window.NPCSystem._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let NPCDowned;
  window.NPCSystem._internal._late.push(() => ({ NPCDowned } = window.NPCSystem._internal));

  // ==========================================================================
  // MAP SKIRMISH, people against monsters
  // ==========================================================================
  // A monster on a town map is not only the party's business. Every
  // SCAN_FRAMES the people on the map look round for the nearest live monster
  // within SIGHT tiles and decide what to do about it:
  //
  //   - a fighter (an officer, somebody in a Combat trade, a brave soul, or a
  //     class raised to fight) engages anything no more than two levels above
  //     them, and runs from anything worse;
  //   - anybody else runs from a monster above their own level and lets the
  //     rest be; a timid one runs from everything;
  //   - a child always runs; a newborn is carried and does nothing at all.
  //
  // Running is the "fleeing" state: speed 5, a path away from the threat, back
  // to the day's routine once ten tiles clear. Engaging is "skirmishing": walk
  // up to it, and the fight itself is BattleSystemEnhancedEncounters' shared
  // resolver (BSE.Skirmish), which reaches back into this section through
  // window.NPCSkirmish for a person's side, their wounds and their fate.
  //
  // A person has map HP now: profile.hp (it starts at mhp) and
  // profile.injuries [{part, broken, cut, vital}], the Humanoid parts of
  // window.Health.Archetypes. A Blunt blow never breaks a vital part. A fight
  // that ends on a Blunt blow with no vital part cut leaves them "downed":
  // lying on the ground, crawling a step every few seconds, and up again
  // after 6 to 12 hours. Phase K builds on that state (loot, coup de grace,
  // healers); a death goes through NPCLifeSim.killNpc when it exists.

  // START NPC SKIRMISH CORE
  function makeNpcSkirmishCore() {
    const core = {
      SCAN_FRAMES: 20,
      SIGHT: 6,
      FLEE_SAFE_TILES: 10,
      FLEE_SPEED: 5,
      ENGAGE_SPEED: 4,
      ENGAGE_LEVEL_GAP: 2,
      ENGAGE_GIVE_UP_MS: 15000,
      FLEE_MAX_MS: 30000,
      CRAWL_MS: 3000,
      INJURY_CHANCE: 0.25,
      DOWNED_MIN_MINUTES: 360,
      DOWNED_SPAN_MINUTES: 360,
      RECOVER_HP_SHARE: 0.25,
      LOST_CHANCE: 0.3,

      // Somebody who stands and fights. `who` holds the facts, resolved by
      // whoever asks (see NPCSkirmish.who).
      isFighter(who) {
        return !!(who && (who.officer || who.combatJob || who.brave || who.combatClass));
      },

      // What somebody does about a monster of `monsterLevel` in sight:
      // 'flee', 'engage' or null (carry on).
      decide(who, monsterLevel) {
        if (!who || who.nonSentient || who.story) return null;
        if (who.newborn) return null;
        if (who.minor) return 'flee';
        const lv = Math.max(1, who.level || 1);
        const mlv = Math.max(1, monsterLevel || 1);
        if (core.isFighter(who)) return mlv <= lv + core.ENGAGE_LEVEL_GAP ? 'engage' : 'flee';
        if (who.timid) return 'flee';
        return mlv > lv ? 'flee' : null;
      },

      // Set upon: somebody who would not have gone looking for the fight
      // still defends themselves when they are not outclassed.
      defendOrRun(who, monsterLevel) {
        if (!who || who.minor || who.newborn) return 'flee';
        if (who.nonSentient) return 'engage';
        const act = core.decide(who, monsterLevel);
        if (act) return act;
        return 'engage';
      },

      // How much heart they have for a fight gone wrong (BSE.Skirmish morale).
      morale(who) {
        if (!who) return 0.45;
        if (who.minor) return 0.1;
        if (who.timid) return 0.2;
        if (who.brave) return 0.8;
        if (core.isFighter(who)) return 0.7;
        return 0.45;
      },

      // Somewhere FLEE_SAFE_TILES + 2 out along the line from the threat.
      fleeTarget(x, y, tx, ty, w, h) {
        let dx = x - tx, dy = y - ty;
        if (!dx && !dy) dx = 1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const reach = core.FLEE_SAFE_TILES + 2;
        return {
          x: Math.max(1, Math.min(w - 2, Math.round(x + dx / len * reach))),
          y: Math.max(1, Math.min(h - 2, Math.round(y + dy / len * reach)))
        };
      },

      // The step that most increases the distance from (tx, ty), best first.
      awayDirs(x, y, tx, ty) {
        const opts = [[2, 0, 1], [4, -1, 0], [6, 1, 0], [8, 0, -1]].map(([d, sx, sy]) =>
          ({ d, gain: Math.abs(x + sx - tx) + Math.abs(y + sy - ty) }));
        return opts.sort((a, b) => b.gain - a.gain).map(o => o.d);
      },

      ensureHp(profile) {
        if (!profile) return;
        const mhp = Math.max(1, Number(profile.mhp) || 100);
        if (typeof profile.hp !== 'number' || !isFinite(profile.hp)) profile.hp = mhp;
        if (profile.hp > mhp) profile.hp = mhp;
        if (!Array.isArray(profile.injuries)) profile.injuries = [];
      },

      // One blow on a person. `parts` is [{key, vital}] (the Humanoid table).
      // Answers { hp, mhp, vitalDestroyed, injury }.
      hitProfile(profile, damage, blow, rng, parts) {
        core.ensureHp(profile);
        profile.hp = Math.max(0, profile.hp - Math.max(0, Math.round(damage || 0)));
        let injury = null;
        if (parts && parts.length && rng() < core.INJURY_CHANCE) {
          const blunt = blow === 'Blunt'; // i18n-ignore: damage type id
          // Phase X: a Blunt blow breaks bones, never a vital part.
          const pool = blunt ? parts.filter(p => !p.vital) : parts;
          if (pool.length) {
            const roll = rng() * pool.length;
            const part = pool[Math.floor(roll)];
            injury = { part: part.key, broken: true, cut: !blunt, vital: !!part.vital };
            // Phase I: an edge can take a limb clean off (a part that can be
            // cut off, never a vital one), read off the same roll so the
            // stream is unchanged. A lost part never knits; it waits for a
            // prosthetic (NPCSim.Implants).
            if (!blunt && part.canCutoff && !part.vital && roll - Math.floor(roll) < core.LOST_CHANCE) injury.lost = true;
            const had = profile.injuries.find(i => i && i.part === part.key);
            if (had) { had.cut = had.cut || injury.cut; had.broken = true; if (injury.lost) had.lost = true; }
            else profile.injuries.push(injury);
            if (injury.vital && injury.cut) profile._fightVital = true;
          }
        }
        return {
          hp: profile.hp,
          mhp: Math.max(1, Number(profile.mhp) || 100),
          vitalDestroyed: !!profile._fightVital,
          injury
        };
      },

      // Down for 6 to 12 game hours from `minute`.
      downedRecord(minute, byBlunt, by, rng) {
        return {
          since: minute,
          byBlunt: !!byBlunt,
          by: by || null,
          untilMinute: minute + core.DOWNED_MIN_MINUTES + Math.floor(rng() * (core.DOWNED_SPAN_MINUTES + 1))
        };
      }
    };
    return core;
  }
  // END NPC SKIRMISH CORE

  const NPCSkirmish = makeNpcSkirmishCore();
  // i18n-ignore-start: controller state ids, damage type ids, job category and spec category ids
  NPCSkirmish.STATES = ["fleeing", "skirmishing", "downed"];
  const SKIRMISH_DEAF_STATES = ["sleeping", "goingToBed", "talkingToPlayer", "conversing", "brawling",
    "knockedOut", "yielding", "commuting", "fleeing", "skirmishing", "downed", "swimming"];
  const SKIRMISH_COMBAT_SPEC_CATS = ["Combat", "Weapons"];
  const SKIRMISH_COMBAT_JOB = "Combat";
  const SKIRMISH_BLUNT = "Blunt";
  // i18n-ignore-end
  // A street fight or a pocket picked is nobody's business while they run.
  StreetCrime.BUSY.push(...NPCSkirmish.STATES);

  // The frame stamps of preyEvents' name index, and the map it belongs to.
  let preyAt = Object.create(null), preyIndexMap = -1, preyIndexMapObj = null;

  Object.assign(NPCSkirmish, {
    _frame: 0,
    _classCache: {},
    _parts: null,
    _preyFrame: -1,
    _prey: [],
    _byName: new Map(),

    bse() {
      return window.BattleSystemEnhanced || null;
    },

    profileOf(name) {
      return $gameSystem?._npcSociety?.[name] || null;
    },

    minute() {
      return ($gameVariables && $gameVariables.value(114)) || 0;
    },

    // A class raised to fight: its own start in a combat or weapon field.
    combatClass(classId) {
      if (classId == null) return false;
      if (classId in this._classCache) return this._classCache[classId];
      const S = window.Specializations;
      const className = $dataClasses?.[classId]?.name;
      if (!S || !S.ready || !className) return false;
      const hit = S.list.some(spec => spec &&
        (SKIRMISH_COMBAT_SPEC_CATS.includes(spec.category) || spec.wtypeId) &&
        (spec.classStart?.[className] || 0) >= 3);
      this._classCache[classId] = hit;
      return hit;
    },

    // Their best level in a combat field (NPCSim.Specs keeps specLevels).
    combatSpec(profile) {
      const S = window.Specializations;
      if (!S || !S.ready || !profile?.specLevels) return 0;
      let best = 0;
      for (const [id, lvl] of Object.entries(profile.specLevels)) {
        const spec = S.byId?.get?.(Number(id));
        if (spec && SKIRMISH_COMBAT_SPEC_CATS.includes(spec.category)) best = Math.max(best, Number(lvl) || 0);
      }
      return best;
    },

    who(name, profile, ctrl) {
      const p = profile || this.profileOf(name);
      if (!p) return null;
      const job = p.currentJobId
        ? (window.WorkSystem?.Jobs || []).find(j => j && j.id === p.currentJobId) : null;
      const MBM = window.MapBattleMode;
      const stage = window.NPCSim?.Children?.stage?.(p, name) || "adult"; // i18n-ignore: life stage id
      return {
        level: p.level || 1,
        officer: !!p._officer,
        combatJob: !!job && job.category === SKIRMISH_COMBAT_JOB,
        brave: !!MBM?._isBraveProfile?.(p),
        timid: !!MBM?._isTimidProfile?.(p),
        combatClass: this.combatClass(p.assignedClassId),
        minor: stage !== "adult", // i18n-ignore: life stage id
        newborn: stage === "newborn", // i18n-ignore: life stage id
        nonSentient: !!window.NPCCreature?.isNonSentientProfile?.(p),
        story: !!(ctrl?.isStory || p._story)
      };
    },

    // The damage type of the weapon they carry (Phase N's stored kit).
    blowOf(profile) {
      const eq = profile?.equipment;
      let weaponId = 0;
      if (Array.isArray(eq)) {
        const slot = eq.find(e => e && e.kind === "weapon"); // i18n-ignore: equipment kind id
        weaponId = slot ? slot.id : 0;
      } else if (eq) {
        weaponId = eq.weaponId || 0;
      }
      const w = weaponId ? $dataWeapons?.[weaponId] : null;
      const m = w ? String(w.note || "").match(/<DamageType:\s*([^>]+)>/i) : null;
      return m ? m[1].trim() : SKIRMISH_BLUNT;
    },

    humanoidParts() {
      if (this._parts) return this._parts;
      const parts = window.Health?.Archetypes?.Humanoid?.parts; // i18n-ignore: Archetypes.json id
      if (!parts) return [];
      this._parts = Object.keys(parts).map(key => ({ key, vital: !!parts[key].vital, canCutoff: !!parts[key].canCutoff }));
      return this._parts;
    },

    ctrl(name) {
      return StreetCrime.ctrl(name);
    },

    isDowned(name) {
      return !!this.profileOf(name)?.downed;
    },

    // Who may be hunted this frame: people on their feet, never a written
    // character, a newborn, the dead or somebody lying downed. Officers too.
    preyEvents() {
      const fc = Graphics.frameCount;
      if (this._preyFrame === fc) return this._prey;
      this._preyFrame = fc;
      // Refilled in place, not raised fresh: this is asked every frame a
      // hunter is on the map. Written over slot by slot and cut to length at
      // the end (emptying it first would drop its storage every frame).
      if (!this._prey) this._prey = [];
      const prey = this._prey;
      let count = 0;
      if (!$gameMap || !$gameSystem || !this.worldAllows()) { prey.length = 0; return prey; }
      // name -> event (_byName) is overwritten in place every frame and only
      // cleared on another map; preyAt stamps the frame each name was written
      // in, so a name left over from an earlier frame reads as absent.
      const mapId = $gameMap.mapId ? $gameMap.mapId() : 0;
      if (preyIndexMap !== mapId || preyIndexMapObj !== $gameMap || !(this._byName instanceof Map)) {
        preyIndexMap = mapId;
        preyIndexMapObj = $gameMap;
        if (this._byName instanceof Map) this._byName.clear(); else this._byName = new Map();
        preyAt = Object.create(null);
      }
      const byEv = this._byName, byAt = preyAt;
      const society = $gameSystem._npcSociety || {};
      const ctrls = $gameSystem.getActiveNPCControllers?.() || [];
      for (let i = 0; i < ctrls.length; i++) {
        const c = ctrls[i];
        const ev = c.event;
        if (!ev || ev._erased || c.isStory || isZombieWalker(ev)) continue;
        if (c.state === "downed") continue; // i18n-ignore: controller state id
        const p = society[c.eventName];
        if (!p || p._story || p.downed) continue;
        if (window.NPCSim?.Children?.stage?.(p, c.eventName) === "newborn") continue; // i18n-ignore: life stage id
        prey[count++] = ev;
        byEv.set(c.eventName, ev);
        byAt[c.eventName] = fc;
      }
      // The officers (PoliceForce.live), walked off the event list in place.
      const all = $gameMap._events || $gameMap.events?.() || [];
      for (let i = 0; i < all.length; i++) {
        const ev = all[i];
        if (!ev || ev._erased || ev._npcOfficerIndex == null) continue;
        const name = ev.event()?.name;
        if (!name || ev._npcDowned || byAt[name] === fc) continue;
        prey[count++] = ev;
        byEv.set(name, ev);
        byAt[name] = fc;
      }
      if (prey.length !== count) prey.length = count;
      return prey;
    },

    eventOf(name) {
      this.preyEvents();
      const ev = preyAt[name] === this._preyFrame ? this._byName.get(name) : null;
      if (ev && !ev._erased) return ev;
      const c = this.ctrl(name);
      return c?.event && !c.event._erased ? c.event : null;
    },

    refFor(ev) {
      const name = ev?.event?.()?.name;
      return name ? { kind: "npc", name } : null; // i18n-ignore: skirmish side kind
    },

    worldAllows() {
      if (Config.isEmptyWorld()) return false;
      if (window.WorldManager?.isMonsterWorld?.()) return false;
      return true;
    },

    // A person's side of a fight, read fresh for BSE.Skirmish.
    sideFor(name) {
      const profile = this.profileOf(name);
      if (!profile || profile.downed) return null;
      const ev = this.eventOf(name);
      if (!ev) return null;
      this.ensureHp(profile);
      const who = this.who(name, profile, this.ctrl(name));
      const implant = window.NPCSim?.Implants?.paramBonus?.(profile) || [0, 0, 0, 0, 0, 0, 0, 0];
      return {
        kind: "npc", // i18n-ignore: skirmish side kind
        ref: { kind: "npc", name }, // i18n-ignore: skirmish side kind
        name,
        event: ev,
        level: profile.level || 1,
        // Implants add their parameters (NPCSim.Implants, Phase I).
        atk: (profile.atk || profile.stats?.atk || 10) + implant[2],
        def: (profile.def || profile.stats?.def || 10) + implant[3],
        luk: (profile.luk || profile.stats?.luk || 10) + implant[7],
        hp: profile.hp,
        mhp: Math.max(1, Number(profile.mhp) || 100),
        spec: this.combatSpec(profile),
        fighter: this.isFighter(who),
        morale: this.morale(who),
        blow: this.blowOf(profile),
        vitalDestroyed: !!profile._fightVital
      };
    },

    // BSE.Skirmish hands every blow on a person here.
    applyHit(name, damage, blow, rng) {
      const profile = this.profileOf(name);
      if (!profile) return null;
      const res = this.hitProfile(profile, damage, blow, rng || Math.random, this.humanoidParts());
      // A part lost: when it went, and the augment it carried with it.
      if (res?.injury?.lost) {
        const inj = profile.injuries.find(i => i && i.part === res.injury.part);
        if (inj && inj.lostAt == null) inj.lostAt = this.minute();
        window.NPCSim?.Implants?.onPartLost?.(profile, res.injury.part);
      }
      return res;
    },

    // ── the three states ────────────────────────────────────────────────────
    startFlee(c, threat) {
      if (!c?.event || !threat) return;
      // Water nearer than the monster, and the monster no swimmer: they swim
      // for it instead (NPCSim.Water, Phase R).
      // Already in the water, or already making for it, is already safe.
      if (c._swim && (c._swim.entered || c._swim.reason === "escape")) return; // i18n-ignore: swim reason id
      if (window.NPCSim?.Water?.tryEscape?.(c, threat)) return;
      c._swim = null;
      c._fish = null;
      const now = performance.now();
      if (c._seat) c._getUpForNewGoal?.();
      if (c._bed) c._getOutOfBed?.();
      c.path = [];
      c.target = null;
      c._skirmish = null;
      c.state = "fleeing"; // i18n-ignore: controller state id
      window.NPCSim?.RoutineManager?.mark?.(c.eventName, "fleeing"); // i18n-ignore: routine activity id
      c.stateEndTime = now + this.FLEE_MAX_MS;
      c._flee = { eid: threat.eventId ? threat.eventId() : null, x: threat.x, y: threat.y };
      window.SimLog?.decide("npc", c.eventName, "ParchmentToast.simLog.npc.flee", { name: c.eventName });
      const speed = c._speedCap != null ? Math.min(c._speedCap, this.FLEE_SPEED) : this.FLEE_SPEED;
      c.event.setMoveSpeed(speed);
      try { $gameTemp?.requestBalloon?.(c.event, 1); } catch (e) { }
    },

    endFlee(c) {
      c._flee = null;
      c.path = [];
      if (c.event) c.event.setMoveSpeed(c._speedCap != null ? Math.min(c._speedCap, 3) : 3);
      c.state = "idle"; // i18n-ignore: controller state id
      c.decideNextGoal();
    },

    startEngage(c, monster) {
      if (!c?.event || !monster) return;
      if (c._seat) c._getUpForNewGoal?.();
      if (c._bed) c._getOutOfBed?.();
      c.path = [];
      c.target = null;
      c._flee = null;
      c.state = "skirmishing"; // i18n-ignore: controller state id
      window.NPCSim?.RoutineManager?.mark?.(c.eventName, "fighting"); // i18n-ignore: routine activity id
      c.stateEndTime = performance.now() + this.ENGAGE_GIVE_UP_MS;
      c._skirmish = { eid: monster.eventId(), started: false };
      window.SimLog?.decide("npc", c.eventName, "ParchmentToast.simLog.npc.engage", { name: c.eventName });
      c.event.setMoveSpeed(this.ENGAGE_SPEED);
      try { $gameTemp?.requestBalloon?.(c.event, 1); } catch (e) { }
    },

    endEngage(c) {
      c._skirmish = null;
      c.path = [];
      if (this.isDowned(c.eventName)) return;
      if (c.event) c.event.setMoveSpeed(c._speedCap != null ? Math.min(c._speedCap, 3) : 3);
      c.state = "idle"; // i18n-ignore: controller state id
      c.decideNextGoal();
    },

    // Out of a fight they broke off (BSE.Skirmish.flee).
    flee(name, threat) {
      const c = this.ctrl(name);
      if (c) { this.startFlee(c, threat); return; }
      const ev = this.eventOf(name);
      if (ev) this._releaseOfficer(ev);
    },

    _releaseOfficer(ev) {
      if (!ev) return;
      ev._npcSkirmish = null;
      if (!ev._npcDowned) ev._movementLocked = false;
    },

    onFightStart(fight) {
      const BSE = this.bse();
      if (!BSE?.Skirmish) return;
      const refs = [fight.a, fight.b];
      const monsterRef = refs.find(r => r && r.kind === "monster"); // i18n-ignore: skirmish side kind
      const monster = monsterRef ? $gameMap.event(monsterRef.id) : null;
      if (!monster) return;
      const lv = (window.getEnemyLevelFromEvent ? window.getEnemyLevelFromEvent(monster) : 1) || 1;
      for (const ref of refs) {
        if (!ref || ref.kind !== "npc") continue; // i18n-ignore: skirmish side kind
        const c = this.ctrl(ref.name);
        if (!c) {
          const ev = this.eventOf(ref.name);
          if (ev) { ev._npcSkirmish = { eid: monster.eventId() }; ev._movementLocked = true; }
          continue;
        }
        if (c.state === "skirmishing") { if (c._skirmish) c._skirmish.started = true; continue; } // i18n-ignore: controller state id
        const act = this.defendOrRun(this.who(ref.name, null, c), lv);
        if (act === "flee") { BSE.Skirmish.stop(ref); this.startFlee(c, monster); } // i18n-ignore: decision id
        else { this.startEngage(c, monster); c._skirmish.started = true; }
      }
    },

    onFightOver(fight) {
      for (const ref of [fight.a, fight.b]) {
        if (!ref || ref.kind !== "npc") continue; // i18n-ignore: skirmish side kind
        const p = this.profileOf(ref.name);
        if (p) p._fightVital = false;
        const c = this.ctrl(ref.name);
        if (c && c.state === "skirmishing") this.endEngage(c); // i18n-ignore: controller state id
        if (!c) this._releaseOfficer(this.eventOf(ref.name));
      }
    },

    // Down, not dead (BSE.Skirmish.onDowned). Phase K extends this state.
    onDowned(name, info) {
      const profile = this.profileOf(name);
      if (!profile) return;
      const by = info?.by?.name || null;
      profile.downed = this.downedRecord(this.minute(), info?.byBlunt, by, Math.random);
      profile.hp = 0;
      window.NPCSim?.RoutineManager?.mark?.(profile, "downed"); // i18n-ignore: routine activity id
      profile._fightVital = false;
      this.bse()?.Skirmish?.stop?.({ kind: "npc", name }); // i18n-ignore: skirmish side kind
      const c = this.ctrl(name);
      if (c) {
        c.path = [];
        c.target = null;
        c._skirmish = null;
        c._flee = null;
        c.state = "downed"; // i18n-ignore: controller state id
        c._crawlAt = performance.now() + this.CRAWL_MS;
        if (c.event) { c.event._npcLyingDown = true; c.event.setMoveSpeed(1); }
      } else {
        const ev = this.eventOf(name);
        if (ev) { ev._npcDowned = true; ev._npcLyingDown = true; ev._movementLocked = true; ev._npcSkirmish = null; }
      }
      try { window.NPCSim?.emit?.("npc:downed", { name, by }); } catch (e) { } // i18n-ignore: event bus id
    },

    // Back on their feet, hurt.
    recover(c) {
      const profile = this.profileOf(c.eventName);
      if (profile) {
        profile.downed = null;
        this.ensureHp(profile);
        profile.hp = Math.max(profile.hp, Math.max(1, Math.round((Number(profile.mhp) || 100) * this.RECOVER_HP_SHARE)));
      }
      if (c.event) { c.event._npcLyingDown = false; c.event.setMoveSpeed(c._speedCap != null ? Math.min(c._speedCap, 3) : 3); }
      c.state = "idle"; // i18n-ignore: controller state id
      c.decideNextGoal();
    },

    // Killed on the map: the one death path, NPCLifeSim.killNpc, through
    // DOWNED BODIES below (which does the map half itself when the life
    // simulation is not loaded).
    onDeath(name, killer) {
      this.bse()?.Skirmish?.stop?.({ kind: "npc", name }); // i18n-ignore: skirmish side kind
      const cause = { kind: "monster", by: killer?.name || null }; // i18n-ignore: death cause id
      try { NPCDowned.killNpc(name, cause); } catch (e) { console.error("[NPC System] killNpc failed", e); }
    },

    // ── the look round, every SCAN_FRAMES ───────────────────────────────────
    update() {
      if (++this._frame < this.SCAN_FRAMES) return;
      this._frame = 0;
      if (!$gameMap || !$gameSystem || $gameMap.isEventRunning()) return;
      if (!this.worldAllows()) return;
      const H = this.bse()?.Helpers;
      if (!H?.nearestMonster || !H.liveMonsters().length) return;
      const society = $gameSystem._npcSociety || {};
      const levelOf = (m) => (window.getEnemyLevelFromEvent ? window.getEnemyLevelFromEvent(m) : 1) || 1;
      for (const c of $gameSystem.getActiveNPCControllers?.() || []) {
        if (!c.event || c.isStory || isZombieWalker(c.event)) continue;
        if (SKIRMISH_DEAF_STATES.includes(c.state)) continue;
        const p = society[c.eventName];
        if (!p || p.downed) continue;
        const m = H.nearestMonster(c.event.x, c.event.y, this.SIGHT);
        if (!m) continue;
        const act = this.decide(this.who(c.eventName, p, c), levelOf(m));
        if (act === "flee") this.startFlee(c, m); // i18n-ignore: decision id
        else if (act === "engage") this.startEngage(c, m); // i18n-ignore: decision id
      }
      this.updateOfficers(H, levelOf);
    },

    // Officers walk their own routes (no controller): the scan steers them.
    updateOfficers(H, levelOf) {
      const S = this.bse()?.Skirmish;
      if (!S) return;
      for (const ev of PoliceForce.live()) {
        const name = ev.event()?.name;
        if (!name) continue;
        if (ev._npcDowned) {
          const p = this.profileOf(name);
          if (!p?.downed || this.minute() >= (p.downed.untilMinute || 0)) {
            if (p) {
              p.downed = null;
              this.ensureHp(p);
              p.hp = Math.max(p.hp, Math.max(1, Math.round((Number(p.mhp) || 100) * this.RECOVER_HP_SHARE)));
            }
            ev._npcDowned = false;
            ev._npcLyingDown = false;
            ev._movementLocked = false;
          }
          continue;
        }
        const ref = { kind: "npc", name }; // i18n-ignore: skirmish side kind
        let m = ev._npcSkirmish ? $gameMap.event(ev._npcSkirmish.eid) : null;
        if (m && !H.isLiveMonster(m)) { this._releaseOfficer(ev); m = null; }
        if (!m) {
          const near = H.nearestMonster(ev.x, ev.y, this.SIGHT);
          if (!near) continue;
          const p = this.profileOf(name);
          if (this.decide(this.who(name, p, null), levelOf(near)) !== "engage") continue; // i18n-ignore: decision id
          m = near;
          ev._npcSkirmish = { eid: m.eventId() };
        }
        if (Math.max(Math.abs(ev.x - m.x), Math.abs(ev.y - m.y)) <= 1) {
          ev._movementLocked = true;
          ev.turnTowardCharacter?.(m);
          if (!S.isFighting(ref)) S.start(ref, S.monsterRef(m));
        } else if (!ev.isMoving()) {
          ev._movementLocked = true;
          ev.moveTowardCharacter(m);
        }
      }
    }
  });

  // ── the controller's side ─────────────────────────────────────────────────
  NPCController.prototype.updateFleeing = function (time) {
    const f = this._flee;
    if (!f || !this.event) return NPCSkirmish.endFlee(this);
    const t = f.eid != null ? $gameMap.event(f.eid) : null;
    if (t && !t._erased) { f.x = t.x; f.y = t.y; }
    const ev = this.event;
    if (Utils.manhattan(ev.x, ev.y, f.x, f.y) >= NPCSkirmish.FLEE_SAFE_TILES || time >= this.stateEndTime) {
      return NPCSkirmish.endFlee(this);
    }
    if (ev.isMoving()) return;
    if (!this.path.length) {
      const goal = NPCSkirmish.fleeTarget(ev.x, ev.y, f.x, f.y, $gameMap.width(), $gameMap.height());
      this.target = goal;
      this.path = this.pathfinder.findPath(ev.x, ev.y, goal.x, goal.y) || [];
    }
    if (this.path.length) {
      this._stepAlongPath(() => { this.path = []; });
      return;
    }
    // No way out on the map's own terms: any step that puts ground between.
    for (const d of NPCSkirmish.awayDirs(ev.x, ev.y, f.x, f.y)) {
      if (ev.canPass(ev.x, ev.y, d)) { ev.moveStraight(d); break; }
    }
  };

  NPCController.prototype.updateSkirmishing = function (time) {
    const s = this._skirmish;
    const H = NPCSkirmish.bse()?.Helpers;
    const S = NPCSkirmish.bse()?.Skirmish;
    const m = s ? $gameMap.event(s.eid) : null;
    if (!s || !H || !S || !m || !H.isLiveMonster(m)) return NPCSkirmish.endEngage(this);
    const ref = { kind: "npc", name: this.eventName }; // i18n-ignore: skirmish side kind
    const ev = this.event;
    if (Math.max(Math.abs(ev.x - m.x), Math.abs(ev.y - m.y)) <= 1) {
      this.turnToward?.(m);
      if (S.isFighting(ref)) { s.started = true; return; }
      // The fight they walked into is over (it fled, or it was never had).
      if (s.started) return NPCSkirmish.endEngage(this);
      s.started = true;
      if (!S.start(ref, S.monsterRef(m))) NPCSkirmish.endEngage(this);
      return;
    }
    if (s.started && !S.isFighting(ref)) return NPCSkirmish.endEngage(this);
    if (time >= this.stateEndTime) return NPCSkirmish.endEngage(this);
    if (!ev.isMoving()) ev.moveTowardCharacter(m);
  };

  NPCController.prototype.updateDowned = function (time) {
    const profile = NPCSkirmish.profileOf(this.eventName);
    if (!profile?.downed) {
      if (this.event) this.event._npcLyingDown = false;
      this.state = "idle"; // i18n-ignore: controller state id
      return this.decideNextGoal();
    }
    if (NPCSkirmish.minute() >= (profile.downed.untilMinute || 0)) return NPCSkirmish.recover(this);
    const ev = this.event;
    if (!ev || ev.isMoving()) return;
    // A clock from an earlier session means nothing in this one.
    if ((this._crawlAt || 0) - time > NPCSkirmish.CRAWL_MS) this._crawlAt = time;
    if (time < (this._crawlAt || 0)) return;
    this._crawlAt = time + NPCSkirmish.CRAWL_MS;
    // A slow crawl away from the party.
    if (!$gamePlayer || Utils.manhattan(ev.x, ev.y, $gamePlayer.x, $gamePlayer.y) > 8) return;
    for (const d of NPCSkirmish.awayDirs(ev.x, ev.y, $gamePlayer.x, $gamePlayer.y)) {
      if (ev.canPass(ev.x, ev.y, d)) { ev.moveStraight(d); break; }
    }
  };

  // Somebody downed stays down whatever else asks them to get up, and is
  // drawn lying there; nobody running or fighting stops to greet the party.
  const _NPCController_update_skirmish = NPCController.prototype.update;
  NPCController.prototype.update = function () {
    const p = this.eventName ? $gameSystem?._npcSociety?.[this.eventName] : null;
    if (p?.downed && this.state !== "downed" && this.state !== "talkingToPlayer") { // i18n-ignore: controller state ids
      this.path = [];
      this.target = null;
      this.state = "downed"; // i18n-ignore: controller state id
      if (this.event) this.event.setMoveSpeed(1);
    }
    _NPCController_update_skirmish.call(this);
    if (this.state === "downed" && this.event) this.event._npcLyingDown = true; // i18n-ignore: controller state id
  };

  const _NPCController_decideNextGoal_skirmish = NPCController.prototype.decideNextGoal;
  NPCController.prototype.decideNextGoal = function () {
    if (NPCSkirmish.isDowned(this.eventName)) {
      this.state = "downed"; // i18n-ignore: controller state id
      return;
    }
    return _NPCController_decideNextGoal_skirmish.call(this);
  };

  const _NPCController_updatePlayerAwareness_skirmish = NPCController.prototype.updatePlayerAwareness;
  NPCController.prototype.updatePlayerAwareness = function (time) {
    if (NPCSkirmish.STATES.includes(this.state)) return;
    return _NPCController_updatePlayerAwareness_skirmish.call(this, time);
  };

  const _Game_Map_update_skirmish = Game_Map.prototype.update;
  Game_Map.prototype.update = function (sceneActive) {
    _Game_Map_update_skirmish.call(this, sceneActive);
    if (!sceneActive) return;
    if (window.PlatformerMode && window.PlatformerMode.isActive()) return;
    if (window.MapBattleMode && window.MapBattleMode.isActive()) return;
    if (window.MultiplayerRemote && !window.MultiplayerRemote.drivesMap()) return;
    try { NPCSkirmish.update(); } catch (e) { console.error("[NPC System] skirmish scan failed", e); }
  };

  // ==========================================================================
  // THE FIGHTS WITH A PERSON IN THEM (BSE.Skirmish, BattleSystemEnhancedEncounters 19)
  // ==========================================================================
  // The resolver, the monster side and the engine hooks stay in
  // BattleSystemEnhancedEncounters.js; the registry of the fights a person is
  // in, and the scan that starts them, belong here and are installed onto
  // BSE.Skirmish, whose hooks call them at run time.
  function installPersonFights(BSE, Skirmish) {
    const chebyshev = Skirmish.chebyshev;
    const skirmishNpcApi = Skirmish.npcApi;
    const liveEnemiesThisFrame = () => BSE.Helpers.liveMonsters();

    // ------------------------------------------------------------------------
    // The registry of fights with a person in them.
    // ------------------------------------------------------------------------
    function skirmishStore() {
        if (!$gameSystem) return {};
        const mapId = $gameMap ? $gameMap.mapId() : 0;
        if (!$gameSystem._skirmishes || $gameSystem._skirmishMap !== mapId) {
            $gameSystem._skirmishes = {};
            $gameSystem._skirmishMap = mapId;
        }
        return $gameSystem._skirmishes;
    }

    Skirmish.fights = function() { return skirmishStore(); };

    Skirmish.isFighting = function(ref) {
        const key = Skirmish.refKey(ref);
        const fights = skirmishStore();
        for (const k in fights) {
            if (fights[k].keys[0] === key || fights[k].keys[1] === key) return true;
        }
        return false;
    };

    // Start (or keep) a fight between two sides. `opener` says who struck
    // first, for the line the party reads.
    Skirmish.start = function(openerRef, otherRef) {
        const fights = skirmishStore();
        const ka = Skirmish.refKey(openerRef), kb = Skirmish.refKey(otherRef);
        const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (fights[key]) return fights[key];
        if (Object.keys(fights).length >= Skirmish.MAX_FIGHTS) return null;
        const A = Skirmish.sideOf(openerRef), B = Skirmish.sideOf(otherRef);
        if (!A || !B) return null;
        fights[key] = { a: openerRef, b: otherRef, keys: [ka, kb], timer: Skirmish.ROUND_FRAMES };
        Skirmish.toast('start', A, B);
        // A person set upon squares up or runs (NPCSystem decides which).
        const api = skirmishNpcApi();
        if (api && api.onFightStart) api.onFightStart(fights[key]);
        return fights[key];
    };

    Skirmish.stop = function(ref) {
        const key = Skirmish.refKey(ref);
        const fights = skirmishStore();
        for (const k in fights) {
            if (fights[k].keys[0] === key || fights[k].keys[1] === key) delete fights[k];
        }
    };

    // A hunter or a predator counts the people in reach as quarry too, and
    // walks up to them the way it walks up to anything else it eats.
    Skirmish.huntPeople = function(ev) {
        const api = skirmishNpcApi();
        if (!api || !api.preyEvents) return;
        const eco = BSE.Helpers.getEventEcology(ev);
        if (eco !== 'Hunter' && eco !== 'Predator') return; // i18n-ignore: ecology ids
        if (Skirmish.isHoldingOff(ev) || ev._bseRun) return;
        const people = api.preyEvents();
        if (!people.length) return;
        const range = BSE.Data.ECOLOGY_AWARENESS;
        let bestD = ev._aiPrey ? Math.abs(ev._aiPrey.x - ev.x) + Math.abs(ev._aiPrey.y - ev.y) : Infinity;
        for (let i = 0; i < people.length; i++) {
            const person = people[i];
            const d = Math.abs(person.x - ev.x) + Math.abs(person.y - ev.y);
            if (d > range || d >= bestD) continue;
            ev._aiPrey = person;
            bestD = d;
        }
    };

    // Every SCAN_FRAMES: a hunter standing next to a person goes for them.
    Skirmish.pairScan = function() {
        const api = skirmishNpcApi();
        if (!api || !api.preyEvents) return;
        const people = api.preyEvents();
        if (!people.length) return;
        const monsters = liveEnemiesThisFrame();
        for (let i = 0; i < monsters.length; i++) {
            const m = monsters[i];
            if (m._erased || m._bseRun || Skirmish.isHoldingOff(m)) continue;
            const eco = BSE.Helpers.getEventEcology(m);
            if (eco !== 'Hunter' && eco !== 'Predator') continue; // i18n-ignore: ecology ids
            for (let j = 0; j < people.length; j++) {
                const person = people[j];
                if (chebyshev(m, person) > 1) continue;
                const ref = api.refFor ? api.refFor(person) : null;
                if (ref) Skirmish.start(Skirmish.monsterRef(m), ref);
                break;
            }
        }
    };

    Skirmish.update = function() {
        const fights = skirmishStore();
        Skirmish._scanTick = (Skirmish._scanTick || 0) + 1;
        if (Skirmish._scanTick >= Skirmish.SCAN_FRAMES) {
            Skirmish._scanTick = 0;
            Skirmish.pairScan();
        }
        for (const key in fights) {
            const fight = fights[key];
            if (--fight.timer > 0) continue;
            fight.timer = Skirmish.ROUND_FRAMES;
            const result = Skirmish.exchange(fight, Skirmish.sideOf(fight.a), Skirmish.sideOf(fight.b), Math.random);
            if (result !== 'continue') {
                delete fights[key];
                const api = skirmishNpcApi();
                if (api && api.onFightOver) api.onFightOver(fight, result);
            }
        }
    };
  }
  {
    const BSE = window.BattleSystemEnhanced;
    // Only onto the resolver Encounters built (it publishes its helpers).
    if (BSE && BSE.Skirmish && BSE.Skirmish.npcApi) installPersonFights(BSE, BSE.Skirmish);
  }

  window.NPCSkirmish = NPCSkirmish;

  Object.assign(window.NPCSystem._internal, {
    NPCSkirmish,
  });
})();
