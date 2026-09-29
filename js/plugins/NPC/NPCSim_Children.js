/*:
 * @target MZ
 * @plugindesc NPC Simulation: a child's day
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Development
 * @help
 * ============================================================================
 * NPCSim_Children, part of the NPCSimulationCore family
 * ============================================================================
 * Owns Children (SECTION 11b4).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Development.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    nameHash, RoutineManager, ScheduleManager,
  } = NPCSim._internal;

  // ============================================================================
  // SECTION 11b4, CHILDREN (NPCSim.Children)
  // ============================================================================
  // A child of the world (NPCLifeSim FAMILY: born or adopted into a home, or
  // dealt into a household as a minor) lives a child's day. The life record
  // owns who is a child and their stage (newborn 0-2, child 3-17); this is
  // how that day is spent:
  //   newborn  carried about at a crawl (speed 1), always on the family's
  //            home map, asleep much of the day.
  //   child    runs about at an adult's walk (speed 3): home, school on
  //            weekdays when the town has a school map, and play (leisure)
  //            round the town's main maps in the afternoon.
  // No job, money, creed, party, romance, crime or travel: they go where the
  // family goes. A non-sentient creature is never a child here; it has no
  // family life at all (NPCCreature).
  const FAM_V = 1;
  const _schoolMapCache = {};
  const SCHOOL_MAP_RE = /\b(school|academy|college|university|classroom|scuola|accademia)\b/i;
  const Children = {
    FAM_V,
    isMinor(profile, name) {
      const Life = window.NPCLifeSim;
      const n = name || profile?._eventName;
      if (Life?.isMinor) return !!Life.isMinor(n, profile);
      return !!(profile && profile._child && profile.lifeStage !== "adult"); // i18n-ignore: life stage id
    },

    stage(profile, name) {
      if (!this.isMinor(profile, name)) return "adult"; // i18n-ignore: life stage id
      const n = name || profile?._eventName;
      return window.NPCLifeSim?.lifeStageOf?.(n) || profile?.lifeStage || "child"; // i18n-ignore: life stage id
    },

    // The controller's walking speed for this person, or null for an adult's.
    moveSpeed(name) {
      const profile = $gameSystem?._npcSociety?.[name];
      const stage = this.stage(profile, name);
      if (stage === "newborn") return 1; // i18n-ignore: life stage id
      if (stage === "child") return 3;   // i18n-ignore: life stage id
      return null;
    },

    // The town's school, when it has one: a map named for it, or one whose
    // workplace hires somebody who works at a blackboard.
    schoolMap(groupName) {
      if (!groupName) return null;
      if (groupName in _schoolMapCache) return _schoolMapCache[groupName];
      const group = $gameSystem?._npcMapGroups?.[groupName];
      let found = null;
      for (const id of (group?.maps || [])) {
        const nm = (typeof $dataMapInfos !== "undefined" && $dataMapInfos?.[id]?.name) || "";
        if (SCHOOL_MAP_RE.test(nm)) { found = id; break; }
      }
      if (!found && group?.jobs) {
        const jobs = window.WorkSystem?.Jobs || [];
        for (const [mapId, ids] of Object.entries(group.jobs)) {
          const teaches = (ids || []).some(id => (jobs.find(j => j && j.id === id)?.workSpots || []).includes("blackboard"));
          if (teaches && (group.maps || []).includes(Number(mapId))) { found = Number(mapId); break; }
        }
      }
      _schoolMapCache[groupName] = found;
      return found;
    },

    // When a child sleeps, off the day's own stream (RoutineManager.sleepWindow
    // reads it for the one sleep window).
    sleepWindow(profile, rng, stage) {
      const st = stage || this.stage(profile);
      const wake = 7 + (rng ? rng.int(0, 1) : 0);
      const bed = st === "newborn" ? 19 : 20 + (rng ? rng.int(0, 1) : 0); // i18n-ignore: life stage id
      return { bed, wake };
    },

    // A child's 24 hours for one day.
    routineForDay(profile, day, rng) {
      const stage = this.stage(profile);
      const weekday = !RoutineManager.isWeekend(day);
      const school = weekday && stage === "child" && !!this.schoolMap(profile?._homeGroupName); // i18n-ignore: life stage id
      const { wake, bed } = this.sleepWindow(profile, rng, stage);
      const routine = new Array(24);
      for (let h = 0; h < 24; h++) {
        if (h >= bed || h < wake) { routine[h] = "sleep"; continue; }
        if (h === wake) { routine[h] = "hygiene"; continue; }
        if (h === wake + 1 || h === 12 || h === 18) { routine[h] = "hunger"; continue; }
        if (stage === "newborn") { routine[h] = (h >= 13 && h <= 15) ? "sleep" : "home"; continue; } // i18n-ignore: life stage id
        if (school && h >= 9 && h < 14) { routine[h] = "school"; continue; }
        routine[h] = (h >= 14 && h < 18) ? "leisure" : "home";
      }
      return routine;
    },

    // What a child is doing this hour: the body first, then the day.
    activity(profile, hour) {
      if ((profile.sleep ?? 100) < 20) return "sleep";
      if ((profile.hunger ?? 100) < 30) return "hunger";
      if ((profile.hygiene ?? 100) < 30) return "hygiene";
      return RoutineManager.getActivity(profile, hour);
    },

    // Where on the town's maps a child is this hour. `inGroup` tells a map of
    // the town from one outside it.
    scheduledMap(profile, name, groupName, group, hour, inGroup) {
      const home = profile.homeBuilding?.mapId ?? profile._residentHomeMap ?? null;
      const stage = this.stage(profile, name);
      if (stage === "newborn") return inGroup(home) ? home : null; // i18n-ignore: life stage id
      const act = ScheduleManager.evaluate(profile, hour);
      if (act === "school") {
        const school = this.schoolMap(groupName);
        if (inGroup(school)) return school;
      }
      if (act === "leisure" && group?.mainMaps?.length) {
        const s = (nameHash(name) ^ (Math.floor(hour) * 2654435761)) >>> 0;
        return group.mainMaps[s % group.mainMaps.length];
      }
      return inGroup(home) ? home : null;
    },
  };

  Object.assign(NPCSim._internal, {
    Children, FAM_V,
  });
})();
