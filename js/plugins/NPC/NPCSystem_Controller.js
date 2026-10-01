/*:
 * @target MZ
 * @plugindesc NPC System: the NPC controller
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Movement
 * @help
 * ============================================================================
 * NPCSystem_Controller, part of the NPCSystem family
 * ============================================================================
 * Owns the NPCController class and its pace tables (NPC_WORK, NPC_SEEK).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Movement.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _getTraitsById, _stateMethodName, Config, GoneRegistry, MapManager, NPCBeds, NPCSeats, NPCYield,
    ORTHO_DIRS, Pathfinder, StreetCrime, SwimSpots, Utils,
  } = window.NPCSystem._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let isZombieWalker;
  window.NPCSystem._internal._late.push(() => ({ isZombieWalker } = window.NPCSystem._internal));

  // Where the NPCs stand, gathered once a frame for every wanderer rather
  // than once per wander step. Only neighbouring tiles are looked up in it, so
  // the wanderer's own tile being in it never matters.
  let _occupied = null;
  function _occupiedThisFrame(mapW) {
    const fc = Graphics.frameCount;
    if (_occupied && _occupied.frame === fc && _occupied.mapW === mapW) return _occupied.keys;
    const keys = new Set();
    for (const c of $gameSystem.npcControllers ?? []) {
      if (c.event && !c.event._erased) keys.add(c.event.x + c.event.y * mapW);
    }
    _occupied = { frame: fc, mapW, keys };
    return keys;
  }

  // The working loop's pace (NPCController.updateWorking), in real time.
  const NPC_WORK = {
    CHECK_MS: 1000,                 // how often the shift is asked whether it is over
    TICK_MS: 10000,                 // npc:work_tick cadence
    SPOT_MIN_MS: 25000,             // between two moves to another work spot
    SPOT_MAX_MS: 70000,
    WALK_MS: 60000,                 // longest walk to the next spot
    SHIFT_CAP_MS: 30 * 60 * 1000,   // a safety net: re-decide after this long regardless
  };

  // Walking out, and walking to or alongside somebody (Phase E): how often a
  // route is worked out again, and how long a walk may take.
  const NPC_SEEK = {
    TIMEOUT_MS: 45000,              // longest walk to somebody before giving up
    REPATH_MS: 2500,                // the one sought moves: re-route this often
    FOLLOW_REPATH_MS: 1500,
    COMMUTE_REPATH_MS: 1000,        // a commuter with no route asks again this often
  };

  // In the water and on the bank (Phase R, the WATER methods below).
  const NPC_WATER = {
    // i18n-ignore-start: swim reason ids and controller state ids
    ESCAPE: "escape",
    FISHING: "fishing",
    STATES: ["goingToSwim", "swimming", "goingToFish", "fishing"],
    // i18n-ignore-end
    WALK_MS: 60000,                 // longest walk to the shore before giving up
    DEFAULT_SWIM_MS: 45000,
    DEFAULT_FISH_MS: 45000,
    HARD_CAP_MS: 90000,             // nobody stays in longer than this, whatever the reason
    LEAVE_MS: 20000,                // swimming back to the shore; then they are put on it
    SWIM_ROAM: 4,                   // tiles from where they got in
    STROKE_CHANCE: 0.35,            // per update, a stroke somewhere
    ESCAPE_SPEED: 5,
    // Into the water and out of it by the party's own rules
    // (MovementInteractionSystem). A slot reused by somebody else must not be
    // dressed back in a stranger's sheet on the way out, so the remembered
    // appearance is taken fresh every time.
    enter(ev) {
      if (!ev || ev._isSwimming) return;
      ev._originalName = undefined;
      ev._originalIndex = undefined;
      const MS = window.MovementSystem;
      if (MS && MS.enterSwimMode) { try { MS.enterSwimMode(ev); } catch (e) { ev._isSwimming = true; } }
      else ev._isSwimming = true;
    },
    exit(ev) {
      if (!ev || !ev._isSwimming) return;
      const MS = window.MovementSystem;
      if (MS && MS.exitSwimMode) { try { MS.exitSwimMode(ev); } catch (e) { ev._isSwimming = false; } }
      else ev._isSwimming = false;
      ev._isSwimming = false;
      ev._originalName = undefined;
      ev._originalIndex = undefined;
    },
  };

  class NPCController {
    constructor(eventName) {
      this.eventName = eventName;
      this.refreshEvent();
      this.state = "idle";
      this.target = null;
      this.path = [];

      this.lastUpdateTime = performance.now();
      this.nextMoveTime = this.lastUpdateTime + Utils.randBetween(1200, 3000);
      this.stateEndTime = this.lastUpdateTime + Utils.randBetween(3000, 6000);

      // A newborn is carried about at a crawl and a child never runs faster
      // than an adult walks (NPCSim.Children): their speed is also the cap.
      this._speedCap = window.NPCSim?.Children?.moveSpeed?.(eventName) ?? null;
      this.moveSpeed = this._speedCap ?? 3;
      this.playerAware = false;
      this.lastPlayerReaction = 0;
      this.velocity = { x: 0, y: 0 };
      this._lastDist = 0; // player distance from the previous throttled tick
    }

    refreshEvent() {
      // A yield in progress does not survive being rebound to another event
      // (map change, hourly turnover, a save restored mid-step): it is closed
      // here so nothing is ever left permanently phased. The flags are put back
      // on the event being let go, and again on the newly resolved one when it
      // is the same slot rehydrated (a restore hands back a copy, so clearing
      // only the old reference would leave the live event walking through
      // walls).
      const wasYielding = this.state === 'yielding';
      const staleEvent = wasYielding ? this.event : null;
      const staleThrough = this._yieldWasThrough ?? false;
      const staleSpeed = this._yieldSpeed ?? 3;
      if (wasYielding) {
        this.state = 'idle';
        this.path = [];
        this.target = null;
        this._yieldWasThrough = undefined;
        this._yieldSpeed = undefined;
        this._yieldStandAside = false;
        if (staleEvent && !staleEvent._erased) {
          staleEvent.setThrough(staleThrough);
          staleEvent.setMoveSpeed(staleSpeed);
        }
      }
      this.event = $gameMap.events().find(e => e?.event()?.name === this.eventName);
      this.eventId = this.event?.eventId();
      if (wasYielding && this.event && this.event !== staleEvent &&
          this.event.eventId() === staleEvent?.eventId?.()) {
        this.event.setThrough(staleThrough);
        this.event.setMoveSpeed(staleSpeed);
      }
      if (this.event) {
        this.pathfinder = new Pathfinder(this.event);
        const note = this.event.event()?.note || "";
        this.isLocal = note.toLowerCase().includes("local");
        // A written character never leaves their map, so the hourly turnover
        // must not hand their slot to somebody else (see Utils.hasStoryTag).
        this.isStory = Utils.hasStoryTag(note);
        this.clearStaleHideSwitch();
      }
    }

    // Self-switch A is NPCSystemParty's "hide on recruit" flag, keyed to
    // [mapId, eventId]. It can linger on a physical slot from a previous
    // occupant (a recruit who later left, or a slot reused/relocated by the
    // hourly turnover), stranding the next NPC on its blank page-2: the
    // controller still walks the event, but that page carries no commands, so
    // the NPC roams its routine yet can't be talked to. A controller-driven NPC
    // is by definition a free roamer (genuinely recruited NPCs have their
    // controller dropped on join, see NPCSystemParty.joinParty), so clear the
    // stale flag and snap the event back onto its dialogue page.
    //
    // Surgical on purpose: of the ~214 A-gated pages in the NPC pool, 208 are
    // blank "hide" pages (the bug) but 6 use A to swap to a *shorter but still
    // interactable* dialogue ("already met" states, e.g. the Dude template).
    // Only rescue when A has actually parked the event on a commandless page,
    // so those 6 keep working. Key off the event physically bound to this
    // controller, not the cached this.eventId (a by-name lookup that can point
    // at the wrong slot when two on-map NPCs share a name).
    clearStaleHideSwitch() {
      if (!this.event || this.event._erased) return;
      const eid = this.event.eventId();
      if (eid == null) return;
      const key = [$gameMap.mapId(), eid, 'A'];
      if (!$gameSelfSwitches?.value(key)) return;
      if ($gameParty?.members().some(a => a?.name?.() === this.eventName)) return;
      // A switch the world itself set is not a stale one: this person was
      // recruited or killed, and the party they left with may be another
      // savegame's entirely, so party membership says nothing about them.
      if (GoneRegistry.isGone($gameMap.mapId(), eid, this.eventName)) return;
      const page = this.event.page();
      const stuck = !page || (page.list?.length ?? 0) <= 1;
      if (!stuck) return;
      $gameSelfSwitches.setValue(key, false);
      this.event.refresh();
    }

    update() {
      // Interleaved updates & proximity throttling to keep frame rates constant.
      // Checked first so throttled frames pay for nothing else; the interval is
      // picked from the player distance cached on the previous throttled tick.
      // Guard: if eventId is null/undefined, modulo produces NaN which !== anything → permanent freeze.
      // A yielding NPC keeps the close-range interval whatever the distance:
      // it is clearing a passage the player is waiting on, so its steps must
      // not stall for ten frames each once it gets ahead of them.
      const throttleInterval = (this._lastDist <= 5 || this.state === 'yielding') ? 2 : 10;
      const _eid = Number.isFinite(this.eventId) ? this.eventId : 0;
      if (Graphics.frameCount % throttleInterval !== _eid % throttleInterval) {
        return;
      }

      const time = performance.now();
      this.lastUpdateTime = time;

      if (window.$gameSplitScreen && window.$gameSplitScreen.active &&
          (this.eventName === window.$gameSplitScreen.p2EventName ||
           this.event === window.$gameSplitScreen.p2Event)) {
        return;
      }

      if (!this.event || this.event._erased) return;

      // The dead keep no routine. A corpse does not go to work, wash, eat or
      // meet a friend, so a slot that rose stands its controller down for good
      // and is driven by its gait alone (see the zombie apocalypse section).
      if (isZombieWalker(this.event)) return;

      // The interpreter's event first: isEventRunning walks every event on the
      // map, and it is asked here of every controller.
      const isTalking = $gameMap._interpreter.eventId() === this.eventId && $gameMap.isEventRunning();
      // Talked to mid-yield: close the yield properly so _through and the walk
      // speed are put back, rather than leaving the NPC phased for good.
      if (isTalking && this.state === 'yielding') this._endYield(false);
      if (isTalking) {
        // Spoken to, they wake up (and get out of bed to answer).
        if (this.state === "sleeping") this._wakeUp();
        if (this.state !== "talkingToPlayer") { this.state = "talkingToPlayer"; this.path = []; }
        this.turnToward($gamePlayer);
        this.event._npcLyingDown = false;
        return;
      }
      // Out on the road (ProceduralManager.spawnTravellerNPC): the road view
      // walks them, not the routine.
      if (this.event._roadTraveller) return;

      // Self-heal any slot that a stale hide-switch (self-switch A) has parked on
      // a blank, un-talkable page. Runs after the isTalking guard so it never
      // fights a live conversation, and is cheap: a single self-switch read
      // short-circuits unless the NPC is genuinely stuck. Covers paths that skip
      // transplantData's A-D clear, e.g. NPCs that stay put across the hourly
      // turnover (refreshCurrentMapForHour).
      this.clearStaleHideSwitch();

      // Somebody talked to on a seat stays on it for the rest of their sit.
      if (this.state === "talkingToPlayer") {
        if (this._isOnSeat()) this.state = "sitting";
        else if (!this._resumeWater()) this.decideNextGoal();
      }

      // Refresh the cached distance used by the top-of-update throttle
      this._lastDist = Utils.distance(this.event, $gamePlayer);

      this.updatePlayerAwareness(time);
      // Sent somewhere else while seated (the sim's need dispatch, a flee):
      // get up first, since no step leads off a seat.
      if (this._seat && this.state !== "sitting") this._getUpForNewGoal();
      // Sent somewhere else while in bed: out of it first, for the same reason.
      if (this._bed && this.state !== "sleeping") this._getOutOfBed();
      this[_stateMethodName(this.state)]?.(time);
      // Asleep is drawn lying down (the sprite hook below reads the flag).
      if (this.event) this.event._npcLyingDown = this.state === "sleeping" || this.state === "knockedOut";
    }

    updatePlayerAwareness(time) {
      if (!this.event) return;
      // Mid-yield the NPC is already dealing with the player; a flee/distrust
      // reaction here would overwrite the escape route and strand it phased.
      if (this.state === 'yielding') return;
      // Somebody asleep, knocked out or in a fight does not react to passers-by.
      if (this.state === 'sleeping' || this.state === 'knockedOut' || this.state === 'brawling') return;
      // Swimming or fishing: they carry on at it (Phase R).
      if (NPC_WATER.STATES.includes(this.state)) return;
      const wasAware = this.playerAware;
      this.playerAware = Utils.distance(this.event, $gamePlayer) <= Config.playerAwarenessRange * 0.5;
      if (!this.playerAware || wasAware || time - this.lastPlayerReaction <= 20000) return;
      this.lastPlayerReaction = time;

      const profile = window.NPCSocietyRegistry?.getProfile(this.eventName);
      const opinion = profile?.playerOpinion ?? 0;
      const met     = opinion !== 0;
      const pName   = met ? ($gameParty.leader?.()?.name?.() ?? null) : null;

      // Road to 2012: 0 (calm, <=2010) .. 1 (max chaos, 2012). As it climbs,
      // people flee sooner, distrust strangers, and barely greet anyone.
      const tension = window.NPCSim?.eraTension?.() ?? 0;

      const _thought = (texts) => {
        window.NPCSim?.emit('npc:thought', { name: this.eventName, thought: Utils.randomElement(texts) });
      };

      // Reaction lines live in js/i18n/<lang>/plugins/NPCSystem.json. Two
      // variants of most pools: one that names the player, one for a stranger
      // whose name they do not know yet.
      const pool = (key, params) => T.list('NPCSystem.thought.' + key, params);
      const namedPool = (key, name) =>
        name ? pool(key + '.named', { name: name }) : pool(key + '.anon');

      // Very hostile opinion: flee from player. The flee bar relaxes as 2012
      // nears, so even mildly soured NPCs bolt when chaos peaks.
      if (opinion < -70 + tension * 35) {
        _thought(namedPool('flee', pName));
        const px = $gamePlayer.x, py = $gamePlayer.y;
        const ex = this.event.x,  ey = this.event.y;
        const dx = ex - px, dy = ey - py;
        const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const tx = Math.max(1, Math.min($gameMap.width()  - 2, Math.round(ex + (dx / len) * 6)));
        const ty = Math.max(1, Math.min($gameMap.height() - 2, Math.round(ey + (dy / len) * 6)));
        this.target = { x: tx, y: ty };
        this.state  = 'goingToZone';
        this.stateEndTime = time + 8000;
        this.path = this.pathfinder.findPath(ex, ey, tx, ty) || [];
        return;
      }

      // Hostile faction rep: show anger, move away briefly (the rep bar for
      // open hostility also loosens as the era sours).
      if ((profile?.factionIndex ?? -1) >= 0 && window.$gameFactions) {
        const rep = window.$gameFactions.getReputation?.(profile.factionIndex) ?? 0;
        if (rep < -40 + tension * 25) {
          _thought(namedPool('disdain', pName));
          this.state = 'wandering';
          this.stateEndTime = time + 5000;
          return;
        }
      }

      // The road to 2012: ordinary, unsoured NPCs grow paranoid and distrustful,
      // eyeing the player and edging away even with no real grievance. The
      // closer to 2012 (and the less they like the player), the more likely.
      if (tension > 0 && opinion < 40 && Math.random() < tension * 0.6) {
        _thought(namedPool('distrust', pName));
        const px = $gamePlayer.x, py = $gamePlayer.y;
        const ex = this.event.x,  ey = this.event.y;
        const dx = ex - px, dy = ey - py;
        const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const tx = Math.max(1, Math.min($gameMap.width()  - 2, Math.round(ex + (dx / len) * 3)));
        const ty = Math.max(1, Math.min($gameMap.height() - 2, Math.round(ey + (dy / len) * 3)));
        this.target = { x: tx, y: ty };
        this.state  = 'goingToZone';
        this.stateEndTime = time + 4000;
        this.path = this.pathfinder.findPath(ex, ey, tx, ty) || [];
        this.turnToward($gamePlayer);
        return;
      }

      // Normal greeting (people grow tight-lipped as the era frays).
      if (Math.random() < 0.25 * (1 - tension * 0.8)) {
        let greetTexts;
        if (!met) {
          greetTexts = pool('greet.stranger');
        } else if (opinion > 50) {
          greetTexts = pool('greet.warm', { name: pName });
        } else if (opinion > 0) {
          greetTexts = pool('greet.polite', { name: pName });
        } else {
          greetTexts = pool('greet.cold');
        }
        _thought(greetTexts);
        this.turnToward($gamePlayer);
      }
    }

    updateIdle(time) {
      if (time >= this.nextMoveTime) this.decideNextGoal();
      else {
        const counterDir = this._counterFacingDir();
        if (counterDir) this.event.setDirection(counterDir);
        else if (Math.random() < 0.06) this.event.setDirection(2 + Math.floor(Math.random() * 4) * 2);
      }
    }

    updateWandering(time) {
      if (time >= this.stateEndTime) return this.decideNextGoal();
      if (!this.event.isMoving() && time >= this.nextMoveTime) {
        const dir = this.getWanderDir();
        if (dir) this.event.moveStraight(dir);
        this.nextMoveTime = time + Utils.randBetween(1000, 3000);
        if (Math.random() < 0.03) this._formNearbyRelationships();
      }
    }

    updateGoingToZone(time) {
      if (!this.target || time >= this.stateEndTime) return this.decideNextGoal();
      if (!this.path.length) return this.enterZone();
      if (!this.event.isMoving()) {
        this._stepAlongPath(() => this.calculatePath());
      }
    }

    // ── Making way (see NPCYield) ─────────────────────────────────────────────

    // Leave the passage. The route is terrain-only and walked with _through on,
    // so the NPCs queued between here and the way out are stepped through
    // instead of waited on, and the player can walk through this one meanwhile.
    yieldToPlayer() {
      if (!this.event || this.event._erased) return;
      if (this.state === 'yielding' || this.state === 'talkingToPlayer') return;
      // A seat is never in the way: nobody walks through one anyway.
      if (this._isOnSeat()) return;
      const spot = NPCYield.findYieldSpot(this.event, $gamePlayer.x, $gamePlayer.y);
      const path = spot
        ? this.pathfinder.findNoclipPath(this.event.x, this.event.y, spot.x, spot.y)
        : null;
      if (spot && path && path.length) {
        NPCYield.reserve(spot.k ?? (spot.x + spot.y * $gameMap.width()));
        this.path = path;
        this.target = { x: spot.x, y: spot.y };
        this._yieldStandAside = false;
      } else {
        // A dead end, or the only way out leads through the player. There is
        // nowhere to walk to, so the NPC stays put but stays phased: the
        // passage stops being a wall even when nobody can leave it.
        this.path = [];
        this.target = null;
        this._yieldStandAside = true;
      }
      this.state = 'yielding';
      this.stateEndTime = performance.now() + NPCYield.DURATION;
      this._yieldWasThrough = this.event.isThrough();
      this._yieldSpeed = this.event._moveSpeed;
      this.event.setThrough(true);
      this.event.setMoveSpeed(5);
      const lines = T.list('NPCSystem.thought.yield');
      if (lines.length) {
        window.NPCSim?.emit('npc:thought', {
          name: this.eventName,
          thought: Utils.randomElement(lines),
        });
      }
    }

    updateYielding(time) {
      if (!this.event || this.event._erased) return this._endYield(false);
      if (time >= this.stateEndTime) return this._endYield(true);
      if (this.event.isMoving() || this.event.isMoveRouteForcing()) return;
      if (!this.path.length) {
        // Standing aside with the player right on top of them: hold the phase
        // until they have got by (or the yield times out).
        if (this._yieldStandAside && Utils.distance(this.event, $gamePlayer) <= 1) return;
        return this._endYield(true);
      }
      // Phased, so a step can only fail on terrain the route already vetted;
      // if it somehow does, stop rather than grind against it.
      this._stepAlongPath(() => { this.path = []; });
    }

    _endYield(pickNewGoal) {
      if (this.event && !this.event._erased) {
        this.event.setThrough(this._yieldWasThrough ?? false);
        this.event.setMoveSpeed(this._yieldSpeed ?? 3);
      }
      this._yieldWasThrough = undefined;
      this._yieldSpeed = undefined;
      this._yieldStandAside = false;
      this.path = [];
      this.target = null;
      this.state = 'idle';
      this.nextMoveTime = performance.now() + Utils.randBetween(600, 1800);
      if (pickNewGoal) this.decideNextGoal();
    }

    updateInZone(time) {
      if ($gameMap.regionId(this.event.x, this.event.y) === Config.Zones.SOCIAL) this.updateSocializing(time);
      else if (time >= this.stateEndTime) this.decideNextGoal();
    }

    updateSocializing(time) {
      if (time >= this.stateEndTime) return this.decideNextGoal();
      // ~0.5% chance per frame to check for nearby NPCs and form relationships / romance
      if (Math.random() < 0.005) this._formNearbyRelationships();
    }

    _formNearbyRelationships() {
      const profile = window.NPCSocietyRegistry?.getProfile(this.eventName);
      if (!profile) return;
      if (!profile.relationships) profile.relationships = {};
      const traitsById = _getTraitsById();

      // 1. Nearby NPCs
      for (const other of ($gameSystem.npcControllers ?? [])) {
        if (other === this || !other.eventName || !other.event) continue;
        if (!['socializing', 'inZone', 'wandering', 'idle'].includes(other.state)) continue;
        if (Utils.distance(this.event, other.event) > 3) continue;

        const rel = profile.relationships[other.eventName] ?? { meetCount: 0, opinion: 0 };
        rel.meetCount = Math.min(rel.meetCount + 1, 999);

        // Trait incompatibility check, sours the relationship
        const otherProfile = window.NPCSocietyRegistry?.getProfile(other.eventName);
        if (otherProfile) {
          const incompatible = (profile.traitIds ?? []).some(tid => {
            const t = traitsById.get(tid);
            return (t?.incompatible ?? []).some(iid => (otherProfile.traitIds ?? []).includes(iid));
          });
          rel.opinion = incompatible
            ? Math.max(-100, rel.opinion - 1)
            : Math.min(100, rel.opinion + 1);
        }

        profile.relationships[other.eventName] = rel;

        // Autonomous NPC -> NPC Romance attempt
        const RS = window.NPCRomanceSystem;
        if (RS && Math.random() < 0.25) {
          if (!RS.isOnCooldown(this.eventName, other.eventName, 50000)) {
            if (RS.isSomewhatCompatible(
              { eventName: this.eventName, profile },
              { eventName: other.eventName, profile: otherProfile }
            )) {
              const res = RS.executeRomance(
                { eventName: this.eventName, profile },
                { eventName: other.eventName, profile: otherProfile }
              );
              if (res && res.suitorLine) {
                window.NPCSim?.emit?.('npc:thought', { name: this.eventName, thought: res.suitorLine });
                setTimeout(() => {
                  window.NPCSim?.emit?.('npc:thought', { name: other.eventName, thought: res.replyLine });
                }, 1400);
              }
            }
          }
        }
      }

      // 2. Nearby Party Members (Leader & Followers)
      const RS = window.NPCRomanceSystem;
      if ($gamePlayer && RS && Math.random() < 0.30) {
        const partyTargets = [];
        if ($gameParty?.leader()) partyTargets.push({ char: $gamePlayer, actor: $gameParty.leader() });
        if ($gamePlayer.followers) {
          for (const f of $gamePlayer.followers().data()) {
            if (f.isVisible() && f.actor && f.actor()) {
              partyTargets.push({ char: f, actor: f.actor() });
            }
          }
        }

        for (const pt of partyTargets) {
          if (Utils.distance(this.event, pt.char) > 3) continue;
          const actor = pt.actor;
          if (!actor) continue;
          if (RS.isOnCooldown(this.eventName, actor.name(), 50000)) continue;

          if (RS.isSomewhatCompatible(
            { eventName: this.eventName, profile },
            actor
          )) {
            const res = RS.executeRomance(
              { eventName: this.eventName, profile },
              actor
            );
            if (res && res.suitorLine) {
              window.NPCSim?.emit?.('npc:thought', { name: this.eventName, thought: res.suitorLine });
              if (window.AutoIdle && window.AutoIdle.loose && typeof window.AutoIdle.loose.sayText === "function") {
                setTimeout(() => {
                  window.AutoIdle.loose.sayText(pt.char, res.replyLine);
                }, 1400);
              }
            }
            break;
          }
        }
      }
    }

    decideNextGoal() {
      if (this.event) this.event.setOpacity(255);
      // Still in the water with a swim under way (a chat or a flight that
      // ended while they swam): back to it. In the water with none, they are
      // taken out of it before anything else is decided.
      if (this.event && this.event._isSwimming) {
        if (this._swim && this._swim.entered) { this.state = "swimming"; return; }
        NPC_WATER.exit(this.event);
      }
      this._brawl = null;
      const zones   = this.getZones();
      const profile = window.NPCSocietyRegistry?.getProfile(this.eventName);

      // Found on a seat (spawned there, put back where they were last seen,
      // or unable to get up): they are sitting on it.
      if (this.event && NPCSeats.isSeat(this.event.x, this.event.y)) {
        const face = Utils.counterFacingDir(this.event) || this.event.direction();
        return this.sitDown(this.event, face, NPCSeats.sitDuration(profile));
      }

      // Night, or dead tired: into a bed if there is one within reach. A rough
      // sleeper has none, so they lie down where they are once it is dark.
      const onShift = !!(window.NPCSim?.isOnShift?.(this.eventName, profile));
      if (!onShift && (NPCBeds.isNight(null, profile) || NPCSeats.isTired(profile))) {
        if (profile?._sleepsRough) {
          if (NPCBeds.isNight(null, profile) && performance.now() >= (this._wokeAt || 0) + 30000) return this.sleepRough();
        } else if (performance.now() >= (this._bedSearchAfter || 0)) {
          if (this.goToBed()) return;
          this._bedSearchAfter = performance.now() + 30000;
        }
      }

      // Priority: sleep need → go home if on home map
      if (profile?.currentNeed === 'sleep' && profile.homeMapId === $gameMap?.mapId()) {
        const door = $gameMap.events().find(e => {
          const n = e?.event()?.name ?? '';
          return n === 'Door' || n === 'House';
        });
        if (door) return this.goToTile(door.x, door.y, 'goingHome', 300000);
      }

      // Whatever the hour is for (NPCSim ScheduleManager), sought again: an
      // errand that finished early, or found nothing the first time, is tried
      // once more after the retry wait instead of never (NPCSim.redispatch).
      if (profile && window.NPCSim?.redispatch?.(this, profile)) return;

      // Base weights
      let wanderW    = 30;
      let socializeW = zones.social.length ? 25 : 0;

      // Trait-driven weight modifiers
      if (profile?.traitIds?.length) {
        const traitsById = _getTraitsById();
        const TRAIT_MODS = {
          shy:         { s: -20, w:   0 },
          introverted: { s: -15, w:   0 },
          social:      { s: +30, w: -10 },
          extroverted: { s: +25, w:   0 },
          aggressive:  { s:   0, w: +20 },
          violent:     { s:   0, w: +15 },
          lazy:        { s: +10, w: -10 },
        };
        for (const id of profile.traitIds) {
          const t = traitsById.get(id);
          if (!t) continue;
          const name = (t.name || '').toLowerCase();
          for (const [key, mod] of Object.entries(TRAIT_MODS)) {
            if (name.includes(key)) {
              wanderW    += mod.w;
              socializeW += mod.s;
            }
          }
        }
      }

      // Morality influence: law-abiding NPCs stay local; chaotic ones roam more
      const m = profile?.moralityScore ?? 0;
      if (m > 50)  wanderW -= 8;
      if (m < -50) wanderW += 15;

      // Hunger: strongly bias toward social zones (gathering areas)
      if (profile?.currentNeed === 'hunger') socializeW += 40;

      // Faction territory: 20% weight toward social zones for faction members
      if ((profile?.factionIndex ?? -1) >= 0 && zones.social.length) socializeW += 20;

      const sitW = NPCSeats.sitWeight(profile);

      const goals = [];
      if (wanderW    > 0) goals.push({ t: 'wander',    w: wanderW    });
      if (socializeW > 0) goals.push({ t: 'socialize',  w: socializeW });
      if (sitW       > 0) goals.push({ t: 'sit',        w: sitW       });
      if (!goals.length)  goals.push({ t: 'wander',     w: 1          });

      let rand = Math.random() * goals.reduce((s, g) => s + g.w, 0);
      for (const g of goals) {
        if ((rand -= g.w) <= 0) return this.setGoal(g.t, zones);
      }
      this.setGoal('wander', zones);
    }

    setGoal(type, zones) {
      const time = performance.now();
      // No free seat within reach: they wander instead.
      if (type === "sit" && this.goSitNearby()) return;
      if (type === "wander" || type === "sit") {
        this.state = "wandering";
        this.stateEndTime = time + Utils.randBetween(7000, 14000);
      } else {
        this.target = Utils.randomElement(zones.social);
        this.state = "goingToZone";
        this.calculatePath();
      }
      window.SimLog?.decide("npc", this.eventName,
        "ParchmentToast.simLog.npc.goal." + (this.state === "goingToZone" ? "socialize" : "wander"),
        { name: this.eventName });
      const speed = type === "wander" && Math.random() < 0.7 ? 3 : 4;
      if (this.event) this.event.setMoveSpeed(this._speedCap != null ? Math.min(this._speedCap, speed) : speed);
    }

    // An unreachable zone sends them back to decideNextGoal, which can pick
    // another zone and search again. Once in a row is allowed; a second miss
    // in the same chain settles for a wander, so one update never runs search
    // after search until the dice happen to land on one.
    calculatePath() {
      if (this.event && this.target) this.path = this.pathfinder.findPath(this.event.x, this.event.y, this.target.x, this.target.y) || [];
      if (this.path.length) return;
      if (this._repathing) { this.setGoal("wander"); return; }
      this._repathing = true;
      try { this.decideNextGoal(); } finally { this._repathing = false; }
    }

    _stepAlongPath(onFail) {
      if (!this.path.length) { if (onFail) onFail(); return; }
      const dir = this.path[0];
      const nx = $gameMap.roundXWithDirection(this.event.x, dir);
      const ny = $gameMap.roundYWithDirection(this.event.y, dir);
      const doorEvt = $gameMap.eventsXy(nx, ny).find(e => Utils.isWalkThroughDoor(e?.event()?.name || ""));
      this.path.shift();
      if (doorEvt) {
        const wasThr = this.event._through;
        this.event._through = true;
        this.event.moveStraight(dir);
        this.event._through = wasThr;
        doorEvt.start();
        // Once an NPC opens a door it stays open: flag it through so RMMZ's
        // collision (eventsXyNt, which skips through events) no longer blocks
        // anything on that tile - in particular Enemy events won't collide
        // with it while chasing.
        doorEvt.setThrough(true);
      } else if (this.event.canPass(this.event.x, this.event.y, dir)) {
        this.event.moveStraight(dir);
      } else {
        if (onFail) onFail();
      }
    }

    enterZone() {
      this.state = $gameMap.regionId(this.event.x, this.event.y) === Config.Zones.SOCIAL ? "socializing" : "inZone";
      this.stateEndTime = performance.now() + Utils.randBetween(5000, 15000);
    }

    getZones() {
      return MapManager.getMapZones();
    }

    getWanderDir() {
      const mapW = $gameMap.width();
      const occupied = _occupiedThisFrame(mapW);
      const dirs = [2, 4, 6, 8], weights = [];
      for (const dir of dirs) {
        const nx = $gameMap.roundXWithDirection(this.event.x, dir), ny = $gameMap.roundYWithDirection(this.event.y, dir);
        // Never wander onto water (region 99 or terrain tag 3): NPCs would
        // appear to drown (#121). Terrain tag 7 is barred alongside it.
        const blocked = $gameMap.regionId(nx, ny) === 99 || Utils.isBlockedTerrain(nx, ny);
        let w = (!blocked && this.event.canPass(this.event.x, this.event.y, dir)) ? 1 : 0;
        if (w > 0) {
          if ($gameMap.regionId(nx, ny) === Config.Zones.SOCIAL) w *= 1.5;
          if (occupied.has(nx + ny * mapW)) w *= 0.3;
        }
        weights.push(w);
      }
      const tw = weights.reduce((a, b) => a + b, 0);
      if (!tw) return null;
      let r = Math.random() * tw;
      return dirs[weights.findIndex(w => (r -= w) <= 0)];
    }

    turnToward(char) {
      if (!this.event || !char) return;
      const sx = this.event.deltaXFrom(char.x), sy = this.event.deltaYFrom(char.y);
      this.event.setDirection(Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 4 : 6) : (sy > 0 ? 8 : 2));
    }

    // ── Tactical (Map Battle) stepping ───────────────────────────────────────
    // While a map battle runs (MapBattleMode.js) the world stops flowing in real
    // time: the controller's own clock-driven update() is suspended and the NPC
    // only advances when a combatant spends a step (one tile per battler step,
    // one tile per action). grantTacticalSteps() banks those steps and
    // updateTacticalStep() spends them, one tile per completed move, so the town
    // keeps drifting toward whatever goal it already had, in lockstep with the
    // fight instead of alongside it.

    grantTacticalSteps(n) {
      this._tacticalSteps = Math.max(0, (this._tacticalSteps || 0) + (n || 0));
    }

    clearTacticalSteps() {
      this._tacticalSteps = 0;
    }

    updateTacticalStep() {
      if (!this._tacticalSteps || this._tacticalSteps <= 0) return;
      if (!this.event || this.event._erased) { this._tacticalSteps = 0; return; }
      // Wait for the tile currently being walked to finish before spending the
      // next banked step, so a burst of granted steps still plays out one tile
      // at a time.
      if (this.event.isMoving() || this.event.isMoveRouteForcing()) return;
      this._tacticalSteps--;
      if (this.path && this.path.length) {
        // Dropping the path on a blocked step (rather than repathing) keeps this
        // cheap: the next goal is picked normally once the battle releases the map.
        this._stepAlongPath(() => { this.path = []; });
      } else {
        const dir = this.getWanderDir();
        if (dir) this.event.moveStraight(dir);
      }
    }

    // Returns the direction to face if an adjacent tile has the counter flag, else null.
    // Used to lock shop workers toward the customer side of their counter.
    _counterFacingDir() {
      return Utils.counterFacingDir(this.event);
    }

    // ── NPCSim states injected by NPCSimulationCore ───────────────────────────

    updateGoingHome(time) {
      if (!this.target) return this.decideNextGoal();
      if (!this.path.length) {
        const dx = this.event ? Math.abs(this.event.x - this.target.x) : 0;
        const dy = this.event ? Math.abs(this.event.y - this.target.y) : 0;
        if (dx + dy > 2) return this.decideNextGoal();
        // Arrived near door: a bed if the room has one, else down where they are.
        if (this.goToBed(8)) return;
        this._sleepAt(false);
        this.stateEndTime = time + 4 * 60 * 60 * 1000; // 4h in ms
        return;
      }
      if (!this.event.isMoving()) {
        this._stepAlongPath(() => this.calculatePath());
      }
    }

    // Squared up to somebody (StreetCrime.fight): standing their ground,
    // facing them, until the fight is decided by whoever started it.
    updateBrawling(time) {
      const other = this._brawl ? StreetCrime.ctrl(this._brawl.other) : null;
      if (!other || other.state !== "brawling") { this._brawl = null; return this.decideNextGoal(); }
      this.turnToward?.(other.event);
      if (time < this.stateEndTime) return;
      if (this._brawl.leader || time >= this.stateEndTime + 1500) StreetCrime.resolve(this);
    }

    // Beaten in a fight: down on the ground, then back on their feet.
    updateKnockedOut(time) {
      if (time < this.stateEndTime) return;
      if (this.event) this.event._npcLyingDown = false;
      this.decideNextGoal();
    }

    updateSleeping(time) {
      const sec = (time - (this._sleepTick ?? time)) / 1000;
      if (sec >= 1) {
        window.NPCSim?.satisfyNeedTick?.(this.eventName, "sleep", Math.min(sec, NPCSeats.MAX_TICK_SEC));
        this._sleepTick = time;
      }
      if (time < this.stateEndTime) return;
      // Somebody gone to bed for the night stays there until it is over.
      if (this._sleepUntilDay && NPCBeds.isNight(null, $gameSystem._npcSociety?.[this.eventName])) { this.stateEndTime = time + 15000; return; }
      const rest = $gameSystem._npcSociety?.[this.eventName]?.sleep;
      if (rest != null && rest < 80 && this.state === "sleeping" && !this._napCapped) {
        // Tired by day: down until rested, but never more than a few minutes.
        this._napCapped = time + 180000;
        this.stateEndTime = time + 15000;
        return;
      }
      if (this._napCapped && time < this._napCapped && rest != null && rest < 80) { this.stateEndTime = time + 15000; return; }
      this._napCapped = 0;
      if (!this._wakeUp()) { this.stateEndTime = time + 5000; return; }
      this.decideNextGoal();
    }

    // Off to the nearest free bed within reach. False when there is none, or
    // no way to any of the closest few. At most NPCSeats.APPROACH_SEARCHES path searches
    // in all: four beds of four sides each was sixteen, in one frame.
    goToBed(radius = NPCBeds.SEARCH_RADIUS) {
      if (!this.event) return false;
      const ex = this.event.x, ey = this.event.y;
      let searches = 0;
      for (const bed of NPCBeds.freeBeds(ex, ey, this.event, radius).slice(0, 4)) {
        for (const a of NPCSeats.approaches(bed, ex, ey)) {
          if (a.x === ex && a.y === ey) { this.lieDown(bed, a.dir); return true; }
          if (!NPCSeats.isEmpty(a.x, a.y, this.event)) continue;
          if (searches++ >= NPCSeats.APPROACH_SEARCHES) return false;
          const path = this.pathfinder.findPath(ex, ey, a.x, a.y);
          if (!path || !path.length) continue;
          this.path = path;
          this.target = { x: a.x, y: a.y };
          this._bedGoal = { x: bed.x, y: bed.y, dir: a.dir };
          this.state = "goingToBed";
          this.stateEndTime = performance.now() + 90000;
          return true;
        }
      }
      return false;
    }

    updateGoingToBed(time) {
      const goal = this._bedGoal;
      if (!goal || !this.target || time >= this.stateEndTime || !NPCBeds.isFree(goal, this.event)) {
        this._bedGoal = null;
        return this.decideNextGoal();
      }
      if (this.event.isMoving()) return;
      if (this.event.x === this.target.x && this.event.y === this.target.y) {
        return this.lieDown(goal, goal.dir);
      }
      if (!this.path.length) {
        this._bedGoal = null;
        return this.decideNextGoal();
      }
      this._stepAlongPath(() => {
        this.path = this.pathfinder.findPath(this.event.x, this.event.y, this.target.x, this.target.y) || [];
      });
    }

    // Into bed. A bed blocks its tile, so from the tile beside it they step
    // over onto it regardless (the sprite slides across, _realX/_realY stay
    // behind); from anywhere else (a spawn) they are put there.
    lieDown(bed, dir) {
      const ev = this.event;
      if (!ev || !bed) return;
      if (dir) ev.setDirection(dir);
      if (ev.x !== bed.x || ev.y !== bed.y) {
        if (Utils.manhattan(ev.x, ev.y, bed.x, bed.y) === 1) {
          ev._x = bed.x;
          ev._y = bed.y;
        } else {
          ev.locate(bed.x, bed.y);
        }
      }
      this._bed = { x: bed.x, y: bed.y };
      this._bedGoal = null;
      this._sleepAt(true);
    }

    // Down for the night where they stand: a rough sleeper's doorway, a bench
    // corner, the pavement.
    sleepRough() {
      this._bed = null;
      // Never across a door, a transfer or a stair: step aside onto a tile
      // nothing uses first.
      const ev = this.event;
      if (ev && NPCBeds.isDoorway(ev.x, ev.y)) {
        const t = NPCBeds.roughSpot(ev.x, ev.y, ev);
        if (t) ev.locate(t.x, t.y);
      }
      this._sleepAt(true);
    }

    _sleepAt(untilDay) {
      const now = performance.now();
      this.path = [];
      this.target = null;
      this._sleepTick = now;
      this._sleepUntilDay = !!untilDay;
      this.state = "sleeping";
      this.stateEndTime = now + NPCBeds.MIN_SLEEP_MS;
      if (this.event) {
        this.event.setOpacity(255);
        this.event._npcLyingDown = true;
      }
    }

    // Awake, and out of bed onto the nearest free tile. False when boxed in.
    _wakeUp() {
      this._sleepUntilDay = false;
      this._wokeAt = performance.now();
      if (this.event) this.event._npcLyingDown = false;
      return this._getOutOfBed();
    }

    _getOutOfBed() {
      const ev = this.event;
      if (!this._bed || !ev) { this._bed = null; return true; }
      if (ev.x !== this._bed.x || ev.y !== this._bed.y) { this._bed = null; return true; }
      const t = NPCSeats.standTile(ev.x, ev.y, ev);
      if (!t) return false;
      this._bed = null;
      const dx = t.x - ev.x, dy = t.y - ev.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        ev.setDirection(dx > 0 ? 6 : dx < 0 ? 4 : dy > 0 ? 2 : 8);
        ev._x = t.x;
        ev._y = t.y;
      } else {
        ev.locate(t.x, t.y);
      }
      return true;
    }

    // ── Walking out (SpawnManager.walkOut) ──────────────────────────────────
    // A commuter walks to the door that leads their way and goes through it:
    // the event is erased on arrival. A walk that runs out of time is still
    // resolved by SpawnManager.updateCommutes.
    updateCommuting(time) {
      const ev = this.event;
      if (!ev || ev._erased) return;
      const walk = ev._npcCommute;
      const tx = walk ? walk.x : this.target?.x;
      const ty = walk ? walk.y : this.target?.y;
      if (tx == null || ty == null) return;
      if (Math.abs(ev.x - tx) + Math.abs(ev.y - ty) <= 1) {
        ev._npcCommute = null;
        this.path = [];
        ev.erase();
        return;
      }
      if (time >= this.stateEndTime || ev.isMoving()) return;
      if (!this.path.length) {
        if (time < (this._commuteRepathAt || 0)) return;
        this._commuteRepathAt = time + NPC_SEEK.COMMUTE_REPATH_MS;
        this.path = this.pathfinder.findPath(ev.x, ev.y, tx, ty) || [];
        if (!this.path.length) return;
      }
      this._stepAlongPath(() => { this.path = []; });
    }

    // ── Walking in (SpawnManager InteriorVisits) ────────────────────────────
    // A visitor who has just come through the door walks into the room, then
    // goes about their visit like anybody else on the map.
    updateWalkingIn(time) {
      const ev = this.event;
      if (!ev || ev._erased) return;
      const t = this.target;
      if (!t || time >= this.stateEndTime || Math.abs(ev.x - t.x) + Math.abs(ev.y - t.y) <= 1) {
        this.path = [];
        return this.decideNextGoal();
      }
      if (ev.isMoving()) return;
      if (!this.path.length) {
        if (time < (this._commuteRepathAt || 0)) return;
        this._commuteRepathAt = time + NPC_SEEK.COMMUTE_REPATH_MS;
        this.path = this.pathfinder.findPath(ev.x, ev.y, t.x, t.y) || [];
        if (!this.path.length) return;
      }
      this._stepAlongPath(() => { this.path = []; });
    }

    // ── Taking over a counter (SpawnManager InteriorVisits.beginShopHandover)
    // The next shopkeeper walks from the door to the till. Once beside it the
    // walker is gone and the counter event wears their face; a walk that runs
    // out of time is settled the same way by SpawnManager.updateCommutes.
    updateWalkingToCounter(time) {
      const ev = this.event;
      if (!ev || ev._erased) return;
      const walk = ev._npcShopTakeover;
      if (!walk) return;
      if (Math.abs(ev.x - walk.x) + Math.abs(ev.y - walk.y) <= 0 || performance.now() >= walk.until) {
        this.path = [];
        return window.NPCSystem._internal.SpawnManager.finishShopTakeover(ev);
      }
      if (ev.isMoving()) return;
      if (!this.path.length) {
        if (time < (this._commuteRepathAt || 0)) return;
        this._commuteRepathAt = time + NPC_SEEK.COMMUTE_REPATH_MS;
        this.path = this.pathfinder.findPath(ev.x, ev.y, walk.x, walk.y) || [];
        if (!this.path.length) return;
      }
      this._stepAlongPath(() => { this.path = []; });
    }

    // ── Seeking somebody out (NPCConversation ConversationManager.seek) ─────
    // Walk up to another controller on this map and, once beside them, start
    // a conversation (ConversationManager.startWith).
    seekNpc(other, why) {
      if (!this.event || !other?.event || other === this) return false;
      this._seekTarget = other;
      this._seekWhy = why || null;
      this.target = { x: other.event.x, y: other.event.y };
      this.state = "seekingNpc";
      this.stateEndTime = performance.now() + NPC_SEEK.TIMEOUT_MS;
      this._seekRepathAt = 0;
      this.path = [];
      return true;
    }

    updateSeekingNpc(time) {
      const other = this._seekTarget;
      if (!other || !other.event || other.event._erased || time >= this.stateEndTime) {
        this._seekTarget = null;
        return this.decideNextGoal();
      }
      if (Utils.distance(this.event, other.event) <= 2) {
        this._seekTarget = null;
        this.path = [];
        this.turnToward(other.event);
        if (window.NPCConversation?.ConversationManager?.startWith?.(this, other)) return;
        return this.decideNextGoal();
      }
      if (this.event.isMoving()) return;
      if (!this.path.length || time >= (this._seekRepathAt || 0)) {
        this._seekRepathAt = time + NPC_SEEK.REPATH_MS;
        const t = this._approachTile(other.event.x, other.event.y, 1);
        this.path = this.pathfinder.findPath(this.event.x, this.event.y, t.x, t.y) || [];
        if (!this.path.length) {
          this._seekTarget = null;
          return this.decideNextGoal();
        }
      }
      this._stepAlongPath(() => { this.path = []; });
    }

    // ── Walking together (NPCConversation _maybeWalkTogether) ───────────────
    // A partner or a friend with the same hour ahead keeps a step behind
    // `leader`, and joins in at whatever the leader stops to use.
    followNpc(leader, ms) {
      if (!this.event || !leader?.event || leader === this) return false;
      this._followTarget = leader;
      this.state = "followingNpc";
      this.stateEndTime = performance.now() + (ms || 90000);
      this._followRepathAt = 0;
      this.path = [];
      return true;
    }

    updateFollowingNpc(time) {
      const lead = this._followTarget;
      if (!lead || !lead.event || lead.event._erased || time >= this.stateEndTime ||
          lead.state === "sleeping" || lead.state === "commuting" || lead.state === "goingHome") {
        this._followTarget = null;
        return this.decideNextGoal();
      }
      // The leader has stopped at something: they use it together.
      if (lead.state === "interacting" && lead.target?.event) {
        this._followTarget = null;
        return this.goInteract(lead.target, lead.interactReason || "leisure");
      }
      if (this.event.isMoving()) return;
      if (Utils.distance(this.event, lead.event) <= 1) {
        this.path = [];
        this.turnToward(lead.event);
        return;
      }
      if (!this.path.length || time >= (this._followRepathAt || 0)) {
        this._followRepathAt = time + NPC_SEEK.FOLLOW_REPATH_MS;
        const t = this._approachTile(lead.event.x, lead.event.y, 1);
        this.path = this.pathfinder.findPath(this.event.x, this.event.y, t.x, t.y) || [];
        if (!this.path.length) return;
      }
      this._stepAlongPath(() => { this.path = []; });
    }

    updateGoingToWork(time) {
      if (!this.target) return this.decideNextGoal();
      // Could not get there in time: mid-shift they work where they stand
      // rather than wander off.
      if (time >= this.stateEndTime) {
        return this._onShiftNow() ? this._startWorking(time) : this.decideNextGoal();
      }
      if (!this.path.length) return this._startWorking(time);
      if (!this.event.isMoving()) {
        this._stepAlongPath(() => this.calculatePath());
      }
    }

    // ── The working loop ─────────────────────────────────────────────────────
    // A worker stays at work for the whole shift (NPCSim.isOnShift), not for
    // a couple of minutes: every so often they move to another of their job's
    // spots on the map (NPCSim.nextWorkSpot), they announce the work as it goes
    // (npc:work_tick), and whoever uses a spot beside them is served
    // (NPCSimulationCore SECTION 9c). When the shift ends it is settled
    // (npc:shift_end). Without the simulation a short fixed stint stands in.

    // True/false while the simulation can say, null when it cannot.
    _onShiftNow() {
      const Sim = window.NPCSim;
      if (!Sim?.isOnShift) return null;
      return !!Sim.isOnShift(this.eventName);
    }

    _startWorking(time) {
      this.state = "working";
      this.path = [];
      const Sim = window.NPCSim;
      if (this._workShiftKey == null) this._workShiftKey = Sim?.JobManager?.shiftKeyAt?.() ?? null;
      this.stateEndTime = time + (Sim?.isOnShift ? NPC_WORK.SHIFT_CAP_MS : Utils.randBetween(90000, 180000));
      this._nextSpotAt = time + Utils.randBetween(NPC_WORK.SPOT_MIN_MS, NPC_WORK.SPOT_MAX_MS);
      this._nextWorkTick = time + NPC_WORK.TICK_MS;
      this._nextShiftCheck = time + NPC_WORK.CHECK_MS;
    }

    _endShift() {
      window.NPCSim?.emit("npc:shift_end", { name: this.eventName, shiftKey: this._workShiftKey ?? null });
      this._workShiftKey = null;
      this._workSpotId = null;
      this._shopWork = false;
      this.decideNextGoal();
    }

    updateWorking(time) {
      if (time >= (this._nextShiftCheck || 0)) {
        this._nextShiftCheck = time + NPC_WORK.CHECK_MS;
        const onShift = this._onShiftNow();
        if (onShift === false) return this._endShift();
      }
      if (time >= this.stateEndTime) return this._onShiftNow() ? this._startWorking(time) : this._endShift();

      if (time >= (this._nextWorkTick || 0)) {
        this._nextWorkTick = time + NPC_WORK.TICK_MS;
        window.NPCSim?.emit("npc:work_tick", {
          name: this.eventName, mapId: $gameMap?.mapId?.(), eventId: this._workSpotId ?? null,
          shiftKey: this._workShiftKey ?? null,
        });
      }

      // On to another spot of the job now and then; a counter keeper stays put.
      if (!this._shopWork && time >= (this._nextSpotAt || 0)) {
        this._nextSpotAt = time + Utils.randBetween(NPC_WORK.SPOT_MIN_MS, NPC_WORK.SPOT_MAX_MS);
        const spot = window.NPCSim?.nextWorkSpot?.(this.eventName, this.event, this._workSpotId);
        if (spot && this.event) {
          const t = this._approachTile(spot.x, spot.y, 2);
          if (t.x !== this.event.x || t.y !== this.event.y) {
            this._workSpotId = spot.eventId?.() ?? null;
            // The walk is part of the same shift (_workShiftKey is kept).
            this.goToTile(t.x, t.y, "goingToWork", NPC_WORK.WALK_MS);
            return;
          }
        }
      }

      const counterDir = this._counterFacingDir();
      if (counterDir) this.event?.setDirection(counterDir);
      else if (Math.random() < 0.01) this.event?.setDirection(2 + Math.floor(Math.random() * 4) * 2);
    }

    updateGoingToInteract(time) {
      if (!this.target || this.target._erased || time >= this.stateEndTime) return this.decideNextGoal();
      const dist = Utils.distance(this.event, this.target);
      // Interact from up to 2 tiles away: most shop/vendor events sit behind an
      // impassable counter tile, so the NPC can never stand directly on them.
      if (dist <= 2) {
        this.state = "interacting";
        this.stateEndTime = time + Utils.randBetween(8000, 20000);
        this.turnToward(this.target);
        window.NPCSim?.emit("npc:interact", { name: this.eventName, targetEvent: this.target, reason: this.interactReason });
        return;
      }
      if (!this.path.length) {
        this._repathToApproach();
        if (!this.path.length) return this.decideNextGoal();
        return;
      }
      if (!this.event.isMoving()) {
        this._stepAlongPath(() => {
          this._repathToApproach();
          if (!this.path.length) this.decideNextGoal();
        });
      }
    }

    // (Re)builds a path to a passable tile within 2 of the interact target,
    // the target tile itself is usually blocked (a counter event), so we aim
    // for the nearest reachable approach tile instead of the event's own tile.
    _repathToApproach() {
      if (!this.event || !this.target) { this.path = []; return; }
      const dest = this.approachTile || this._approachTile(this.target.x, this.target.y, 2);
      this.approachTile = dest;
      this.path = this.pathfinder.findPath(this.event.x, this.event.y, dest.x, dest.y) || [];
    }

    updateInteracting(time) {
      if (this._lastNeedTick === undefined) this._lastNeedTick = time;
      const deltaSec = (time - this._lastNeedTick) / 1000;
      if (deltaSec >= 1) {
        window.NPCSim?.satisfyNeedTick(this.eventName, this.interactReason, deltaSec);
        this._lastNeedTick = time;
      }
      if (time >= this.stateEndTime) {
        this._lastNeedTick = undefined;
        this.target = null;
        this.decideNextGoal();
      }
    }

    // Utility: set a world-object interaction target and pathfind toward a
    // reachable tile within 2 of it (the event's own tile is usually blocked).
    goInteract(targetEvent, reason) {
      this.target = targetEvent;
      this.interactReason = reason;
      this.state = "goingToInteract";
      this.stateEndTime = performance.now() + 60000;
      this.approachTile = null;
      if (this.event && this.target) this._repathToApproach();
    }

    // Utility: go to a map tile (used for going home/work by NPCSim)
    goToTile(x, y, newState, duration) {
      this.target = { x, y };
      this.state = newState || "goingHome";
      this.stateEndTime = performance.now() + (duration || 300000);
      if (this.event) {
        this.path = this.pathfinder.findPath(this.event.x, this.event.y, x, y) || [];
      }
    }

    // Finds a passable tile orthogonally adjacent to (x, y), preferred over
    // the target tile itself since most interactable events aren't passable.
    // Falls back to (x, y) when nothing nearby is walkable (e.g. open plazas).
    _adjacentFreeTile(x, y) {
      const offsets = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dy] of offsets) {
        const tx = x + dx, ty = y + dy;
        if ($gameMap.isValid(tx, ty) &&
            ORTHO_DIRS.some(dir => $gameMap.isPassable(tx, ty, dir)) &&
            $gameMap.eventsXy(tx, ty).length === 0) {
          return { x: tx, y: ty };
        }
      }
      return { x, y };
    }

    // Nearest passable tile within `maxDist` (Manhattan) of (tx, ty), measured
    // from the NPC's current position, the spot they should walk to in order
    // to interact with an event that sits on a blocked tile (e.g. behind a
    // shop counter). Falls back to the target tile when nothing nearby works.
    _approachTile(tx, ty, maxDist = 2) {
      const ex = this.event ? this.event.x : tx;
      const ey = this.event ? this.event.y : ty;
      let best = null, bestD = Infinity;
      for (let dy = -maxDist; dy <= maxDist; dy++) {
        for (let dx = -maxDist; dx <= maxDist; dx++) {
          const md = Math.abs(dx) + Math.abs(dy);
          if (md === 0 || md > maxDist) continue;
          const x = tx + dx, y = ty + dy;
          if (!$gameMap.isValid(x, y)) continue;
          if ([10, 103, 99, 11].includes($gameMap.regionId(x, y))) continue;
          if (Utils.isBlockedTerrain(x, y)) continue;
          if (!ORTHO_DIRS.some(dir => $gameMap.isPassable(x, y, dir))) continue;
          const d = Math.abs(x - ex) + Math.abs(y - ey);
          if (d < bestD) { bestD = d; best = { x, y }; }
        }
      }
      return best || { x: tx, y: ty };
    }

    // Instantly drops the NPC beside targetEvent already mid-interaction,
    // used by ActivityPlacer to make a freshly-loaded map feel lived-in
    // (no travel time), mirroring the end-state of updateGoingToInteract.
    goInteractNow(targetEvent, reason) {
      if (!this.event || !targetEvent) return;
      const spot = this._adjacentFreeTile(targetEvent.x, targetEvent.y);
      this.event.locate(spot.x, spot.y);
      this.target = targetEvent;
      this.interactReason = reason;
      this.path = [];
      this.state = "interacting";
      this.stateEndTime = performance.now() + Utils.randBetween(8000, 20000);
      this.turnToward(targetEvent);
      window.NPCSim?.emit("npc:interact", { name: this.eventName, targetEvent, reason });
    }

    // ── Seats (see NPCSeats) ─────────────────────────────────────────────────

    _isOnSeat() {
      return !!(this._seat && this.event &&
        this.event.x === this._seat.x && this.event.y === this._seat.y);
    }

    // Head for the nearest free seat within reach. False when there is none,
    // or no way to any of the closest few.
    goSitNearby(radius = NPCSeats.SEARCH_RADIUS, ms) {
      if (!this.event) return false;
      const profile = window.NPCSocietyRegistry?.getProfile(this.eventName);
      const duration = ms || NPCSeats.sitDuration(profile);
      const seats = NPCSeats.freeSeats(this.event.x, this.event.y, this.event, radius);
      // One search budget for every seat tried (see goToBed).
      const budget = { left: NPCSeats.APPROACH_SEARCHES };
      for (const seat of seats.slice(0, 4)) {
        if (this.goSit(seat, duration, budget)) return true;
        if (budget.left <= 0) break;
      }
      return false;
    }

    // Walk to a free tile beside `seat`, to sit on it for `ms` once there.
    // `budget.left` is how many path searches the caller can still afford.
    goSit(seat, ms, budget) {
      if (!this.event || !seat) return false;
      const ex = this.event.x, ey = this.event.y;
      for (const a of NPCSeats.approaches(seat, ex, ey)) {
        if (a.x === ex && a.y === ey) {
          this.sitDown(seat, a.dir, ms);
          return true;
        }
        if (!NPCSeats.isEmpty(a.x, a.y, this.event)) continue;
        if (budget) { if (budget.left <= 0) return false; budget.left--; }
        const path = this.pathfinder.findPath(ex, ey, a.x, a.y);
        if (!path || !path.length) continue;
        this.path = path;
        this.target = { x: a.x, y: a.y };
        this._seatGoal = { x: seat.x, y: seat.y, dir: a.dir, ms };
        this.state = "goingToSeat";
        this.stateEndTime = performance.now() + 60000;
        return true;
      }
      return false;
    }

    updateGoingToSeat(time) {
      const goal = this._seatGoal;
      if (!goal || !this.target || time >= this.stateEndTime ||
          !NPCSeats.isEmpty(goal.x, goal.y, this.event)) {
        this._seatGoal = null;
        return this.decideNextGoal();
      }
      if (this.event.isMoving()) return;
      if (this.event.x === this.target.x && this.event.y === this.target.y) {
        return this.sitDown(goal, goal.dir, goal.ms);
      }
      if (!this.path.length) {
        this._seatGoal = null;
        return this.decideNextGoal();
      }
      this._stepAlongPath(() => {
        this.path = this.pathfinder.findPath(this.event.x, this.event.y, this.target.x, this.target.y) || [];
      });
    }

    // Onto the seat and sitting. From the tile beside it they slide across
    // like the player does; from anywhere else (a spawn) they are put there.
    sitDown(seat, dir, ms) {
      const ev = this.event;
      if (!ev || !seat) return;
      if (dir) ev.setDirection(dir);
      if (ev.x !== seat.x || ev.y !== seat.y) {
        if (Utils.manhattan(ev.x, ev.y, seat.x, seat.y) === 1) {
          // _realX/_realY stay behind, so the sprite walks onto the seat.
          ev._x = seat.x;
          ev._y = seat.y;
        } else {
          ev.locate(seat.x, seat.y);
        }
      }
      const face = Utils.counterFacingDir(ev);
      if (face) ev.setDirection(face);
      const now = performance.now();
      this._seat = { x: seat.x, y: seat.y };
      this._seatGoal = null;
      this._seatTick = now;
      this.path = [];
      this.target = null;
      this.state = "sitting";
      this.stateEndTime = now + (ms || NPCSeats.sitDuration(null));
    }

    updateSitting(time) {
      if (!this._isOnSeat()) {
        this._seat = null;
        return this.decideNextGoal();
      }
      const sec = (time - (this._seatTick ?? time)) / 1000;
      if (sec >= 1) {
        window.NPCSim?.satisfyNeedTick?.(this.eventName, "sleep", Math.min(sec, NPCSeats.MAX_TICK_SEC));
        this._seatTick = time;
      }
      if (time < this.stateEndTime) return;
      // Boxed in for now: stay a little longer and try again.
      if (!this.standUp()) { this.stateEndTime = time + 5000; return; }
      this.decideNextGoal();
    }

    // Off the seat onto the nearest free tile to stand on, sliding across
    // when it is right beside the seat. False when there is nowhere to go.
    standUp() {
      const ev = this.event;
      if (!this._isOnSeat()) { this._seat = null; return true; }
      const t = NPCSeats.standTile(ev.x, ev.y, ev);
      if (!t) return false;
      this._seat = null;
      const dx = t.x - ev.x, dy = t.y - ev.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        ev.setDirection(dx > 0 ? 6 : dx < 0 ? 4 : dy > 0 ? 2 : 8);
        ev._x = t.x;
        ev._y = t.y;
      } else {
        ev.locate(t.x, t.y);
      }
      return true;
    }

    // The sim or a reaction sent them somewhere while seated. Their route was
    // planned from the seat, where no step leads anywhere, so it is planned
    // again from the tile they got up onto.
    _getUpForNewGoal() {
      if (!this._isOnSeat()) { this._seat = null; return; }
      if (!this.standUp()) {
        this.state = "sitting";
        this.path = [];
        this.stateEndTime = performance.now() + 5000;
        return;
      }
      if (this.state === "goingToInteract") {
        this.approachTile = null;
        this._repathToApproach();
      } else if (this.target && Number.isFinite(this.target.x)) {
        this.path = this.pathfinder.findPath(this.event.x, this.event.y, this.target.x, this.target.y) || [];
      }
    }

    // ── WATER (Phase R): swimming and fishing ───────────────────────────────
    // What a swim or a fishing trip is FOR, and how long it lasts, is asked of
    // NPCSim.Water (NPCSim_Behavior.js); this is only the walking, the
    // stepping in, the paddling about and the climbing out. In the water they
    // swim by the party's own rules: MovementSystem.enterSwimMode puts the
    // event in the water (passability and the waist-deep sprite crop follow
    // from its _isSwimming flag), exitSwimMode takes them out again.
    //
    //   goingToSwim  walking to the shore tile of the spot (SwimSpots)
    //   swimming     in the water, paddling within SWIM_ROAM of where they got
    //                in, until the swim is over (or, fleeing, until the threat
    //                has gone), then back out onto the shore
    //   goingToFish  walking to the shore tile
    //   fishing      standing on it facing the water until the catch is in
    goSwim(reason, spot, opts) {
      if (!this.event || !spot || !spot.shore) return false;
      if (this._seat) this._getUpForNewGoal();
      if (this._bed) this._getOutOfBed();
      const W = window.NPCSim?.Water;
      const o = opts || {};
      this._fish = null;
      this._swim = {
        reason, shore: { x: spot.shore.x, y: spot.shore.y }, water: spot.water ? { x: spot.water.x, y: spot.water.y } : null,
        entered: false, leaving: false, leaveSince: 0, threat: o.threat || null, group: o.group || null,
      };
      this.target = { x: spot.shore.x, y: spot.shore.y };
      const here = this.event.x === spot.shore.x && this.event.y === spot.shore.y;
      this.path = here ? [] : (this.pathfinder.findPath(this.event.x, this.event.y, spot.shore.x, spot.shore.y) || []);
      if (!here && !this.path.length) { this._swim = null; return false; }
      this.state = "goingToSwim";
      this.stateEndTime = performance.now() + NPC_WATER.WALK_MS;
      const speed = reason === NPC_WATER.ESCAPE ? NPC_WATER.ESCAPE_SPEED : 3;
      this.event.setMoveSpeed(this._speedCap != null ? Math.min(this._speedCap, speed) : speed);
      W?.onSetOff?.(this, reason);
      return true;
    }

    updateGoingToSwim(time) {
      const s = this._swim;
      if (!s || !this.event) return this._endSwim();
      if (this.event.isMoving()) return;
      if (this.event.x === s.shore.x && this.event.y === s.shore.y) return this._enterWater(time);
      if (time >= this.stateEndTime) return this._endSwim();
      if (!this.path.length) {
        this.path = this.pathfinder.findPath(this.event.x, this.event.y, s.shore.x, s.shore.y) || [];
        if (!this.path.length) return this._endSwim();
      }
      this._stepAlongPath(() => { this.path = []; });
    }

    // Off the shore tile into the water beside it: the first free water tile
    // (a friend may already be in the one they aimed at).
    _enterWater(time) {
      const s = this._swim, ev = this.event;
      const SS = SwimSpots;
      const dirs = SS.waterDirs(ev.x, ev.y);
      if (!dirs.length) return this._endSwim();
      NPC_WATER.enter(ev);
      let went = false;
      for (const d of dirs) {
        ev.setDirection(d);
        if (ev.canPass(ev.x, ev.y, d)) { ev.moveStraight(d); went = true; break; }
      }
      if (!went) { NPC_WATER.exit(ev); return this._endSwim(); }
      s.entered = true;
      s.water = { x: $gameMap.roundXWithDirection(ev.x, ev.direction()), y: $gameMap.roundYWithDirection(ev.y, ev.direction()) };
      this.path = [];
      this.state = "swimming";
      const W = window.NPCSim?.Water;
      const ms = W?.swimMs?.(s.reason, this.eventName) ?? NPC_WATER.DEFAULT_SWIM_MS;
      this.stateEndTime = time + ms;
      s.hardEnd = time + Math.max(ms, NPC_WATER.HARD_CAP_MS);
      W?.onSwimStart?.(this, s.reason);
    }

    updateSwimming(time) {
      const s = this._swim, ev = this.event;
      if (!s || !ev) return this._endSwim();
      // Rebound to a fresh event (a map reload) mid-swim: back in if they are
      // still on the water, otherwise the swim is over.
      if (!ev._isSwimming) {
        if (SwimSpots.isSwimWater(ev.x, ev.y)) NPC_WATER.enter(ev);
        else return this._endSwim();
      }
      if (ev.isMoving()) return;
      const W = window.NPCSim?.Water;
      if (!s.leaving) {
        W?.onSwimTick?.(this, time);
        const over = s.reason === NPC_WATER.ESCAPE
          ? (time >= this.stateEndTime && (W?.threatGone?.(this) ?? true))
          : time >= this.stateEndTime;
        if (over || time >= s.hardEnd) { s.leaving = true; s.leaveSince = time; }
      }
      if (s.leaving) return this._swimToShore(time);
      // Paddle about: now and then a stroke to a free water tile near where
      // they got in.
      if (Math.random() >= NPC_WATER.STROKE_CHANCE) return;
      const origin = s.water || { x: ev.x, y: ev.y };
      const dirs = ORTHO_DIRS.slice().sort(() => Math.random() - 0.5);
      for (const d of dirs) {
        const nx = $gameMap.roundXWithDirection(ev.x, d), ny = $gameMap.roundYWithDirection(ev.y, d);
        if (!SwimSpots.isSwimWater(nx, ny)) continue;
        if (Math.abs(nx - origin.x) + Math.abs(ny - origin.y) > NPC_WATER.SWIM_ROAM) continue;
        if (!ev.canPass(ev.x, ev.y, d)) continue;
        ev.moveStraight(d);
        return;
      }
    }

    // Back to the tile they got in from, a stroke at a time; out onto it and
    // the swim is over. Somebody who cannot reach it in LEAVE_MS is put there.
    _swimToShore(time) {
      const s = this._swim, ev = this.event;
      if (!SwimSpots.isSwimWater(ev.x, ev.y)) return this._endSwim();
      if (time - s.leaveSince > NPC_WATER.LEAVE_MS) {
        ev.locate(s.shore.x, s.shore.y);
        return this._endSwim();
      }
      const dx = s.shore.x - ev.x, dy = s.shore.y - ev.y;
      const want = [];
      if (dx) want.push(dx > 0 ? 6 : 4);
      if (dy) want.push(dy > 0 ? 2 : 8);
      for (const d of want.concat(ORTHO_DIRS)) {
        const nx = $gameMap.roundXWithDirection(ev.x, d), ny = $gameMap.roundYWithDirection(ev.y, d);
        const toShore = nx === s.shore.x && ny === s.shore.y;
        if (!toShore && !SwimSpots.isSwimWater(nx, ny)) continue;
        if (!ev.canPass(ev.x, ev.y, d)) continue;
        ev.moveStraight(d);
        return;
      }
    }

    _endSwim() {
      const ev = this.event;
      const s = this._swim;
      if (ev && ev._isSwimming) NPC_WATER.exit(ev);
      this._swim = null;
      this.path = [];
      if (ev) ev.setMoveSpeed(this._speedCap != null ? Math.min(this._speedCap, 3) : 3);
      window.NPCSim?.Water?.onSwimEnd?.(this, s ? s.reason : null);
      this.state = "idle";
      this.decideNextGoal();
    }

    goFish(spot) {
      if (!this.event || !spot || !spot.shore) return false;
      if (this._seat) this._getUpForNewGoal();
      if (this._bed) this._getOutOfBed();
      this._swim = null;
      this._fish = { shore: { x: spot.shore.x, y: spot.shore.y }, dir: spot.dir, cast: false };
      this.target = { x: spot.shore.x, y: spot.shore.y };
      const here = this.event.x === spot.shore.x && this.event.y === spot.shore.y;
      this.path = here ? [] : (this.pathfinder.findPath(this.event.x, this.event.y, spot.shore.x, spot.shore.y) || []);
      if (!here && !this.path.length) { this._fish = null; return false; }
      this.state = "goingToFish";
      this.stateEndTime = performance.now() + NPC_WATER.WALK_MS;
      window.NPCSim?.Water?.onSetOff?.(this, NPC_WATER.FISHING);
      return true;
    }

    updateGoingToFish(time) {
      const f = this._fish;
      if (!f || !this.event) return this._endFish();
      if (this.event.isMoving()) return;
      if (this.event.x === f.shore.x && this.event.y === f.shore.y) {
        const dirs = SwimSpots.waterDirs(this.event.x, this.event.y);
        if (!dirs.length) return this._endFish();
        f.dir = dirs.includes(f.dir) ? f.dir : dirs[0];
        this.event.setDirection(f.dir);
        f.cast = true;
        this.path = [];
        this.state = "fishing";
        const W = window.NPCSim?.Water;
        this.stateEndTime = time + (W?.fishMs?.(this.eventName) ?? NPC_WATER.DEFAULT_FISH_MS);
        W?.onCast?.(this);
        return;
      }
      if (time >= this.stateEndTime) return this._endFish();
      if (!this.path.length) {
        this.path = this.pathfinder.findPath(this.event.x, this.event.y, f.shore.x, f.shore.y) || [];
        if (!this.path.length) return this._endFish();
      }
      this._stepAlongPath(() => { this.path = []; });
    }

    updateFishing(time) {
      const f = this._fish;
      if (!f || !this.event) return this._endFish();
      if (f.dir) this.event.setDirection(f.dir);
      if (time < this.stateEndTime) {
        window.NPCSim?.Water?.onFishTick?.(this, time);
        return;
      }
      window.NPCSim?.Water?.landCatch?.(this);
      this._endFish();
    }

    _endFish() {
      this._fish = null;
      this.path = [];
      this.state = "idle";
      this.decideNextGoal();
    }

    // Spoken to in the water or on the bank: back to it afterwards.
    _resumeWater() {
      if (this._swim && this.event) {
        this.state = this._swim.entered ? "swimming" : "goingToSwim";
        return true;
      }
      if (this._fish && this.event) {
        this.state = this._fish.cast ? "fishing" : "goingToFish";
        return true;
      }
      return false;
    }

  }

  Object.assign(window.NPCSystem._internal, {
    NPCController,
  });
})();
