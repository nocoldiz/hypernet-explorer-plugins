/*:
 * @target MZ
 * @plugindesc Transforms Actor2 or Actor3 to match event properties without equipping items
 * @author Omni-Lex (Modified)
 * @help
 * This plugin creates special functions that can be called from events
 * to transform Actor2's or Actor3's properties to match the calling event.
 * 
 * Event Call Instructions:
 * Use the "Plugin Command" event command and select one of:
 * - "TransformActor2": Transforms Actor2 based on the event
 * - "TransformActor3": Transforms Actor3 based on the event
 * - "Greet": Shows a greeting message with actor name and class
 * - "JoinMessage": Shows a "[Name] joins the party!" message
 * 
 * What TransformActor2/3 does:
 * - Sets Actor's name to match the event's name (unless note is "NPC-0")
 * - If the event's note is "NPC-0", assigns a random class and keeps original name
 * - Otherwise sets Actor's class to the number found in the event's note field
 * - Sets Actor's character graphics to match the event's sprite
 * - Sets Actor's level to match Actor1's level
 * - Does NOT equip any items automatically (equipment remains as default)
 *
 * SetArchetype:
 * - Sets the body archetype for the specified actor ID (1, 2, or 3)
 * - The archetypeName must match a key in window.Health.Archetypes
 * - Updates body parts, reproduction variables (87/115/116), skills, and stat modifiers
 * 
 * @command TransformActor2
 * @desc Transforms Actor2 based on the triggering event
 * 
 * @command TransformActor3
 * @desc Transforms Actor3 based on the triggering event
 * 
 * @command Greet
 * @desc Shows a greeting message with the actor's name and class
 * 
 * @command JoinMessage
 * @desc Shows a message that the actor has joined the party
 *
 * @command JoinParty
 * @desc Handles full NPC party join flow: slot detection, transform, gender, Markov DB, self-switch
 *
 * @arg markovString
 * @text Markov Database String
 * @type string
 * @default goblin_metalhead
 * @desc Markov chain database identifier passed to ThoughtsMenu
 *
 * @arg eventId
 * @text Event ID
 * @type number
 * @default 0
 * @desc Joining NPC's event ID (0 = derive from the calling interpreter/$gameTemp)
 *
 * @command PresetJoinParty
 * @text Preset Character Joins
 * @desc Puts a preset dossier character (Bubba by default) into a free companion slot
 *
 * @arg presetName
 * @text Preset Name
 * @type string
 * @default Bubba
 * @desc Name of the character preset that joins (matched against the dossier roster)
 *
 * @arg level
 * @text Level
 * @type number
 * @min 0
 * @default 0
 * @desc Level they join at (0 = match the party leader)
 *
 * @command LodgerJoinParty
 * @text Inactive Member Joins
 * @desc An inactive companion met where they live rejoins the party, if there is room for them (max 3)
 *
 * @arg name
 * @text Name
 * @type string
 * @default
 * @desc Name of the inactive companion (blank = the event this was called from)
 *
 * @command SetArchetype
 * @desc Sets body archetype for the specified actor (must match Archetypes key)
 *
 * @arg actorId
 * @text Actor ID
 * @type number
 * @min 1
 * @max 3
 * @default 1
 * @desc Actor ID (1, 2, or 3)
 *
 * @arg archetypeName
 * @text Archetype Name
 * @type string
 * @default Humanoid
 * @desc Name of the archetype (e.g. Humanoid, Beast, Dragon, Skeleton, Insectoid, Frog, etc.)
 *
 * @command SetJoinedArchetype
 * @desc Sets body archetype for the last joined party member (automatically detected)
 *
 * @arg archetypeName
 * @text Archetype Name
 * @type string
 * @default Humanoid
 * @desc Name of the archetype (e.g. Humanoid, Beast, Dragon, Skeleton, Insectoid, Frog, etc.)
  *
 * @command LeadAsEm
 * @text Switch to Em
 * @desc Makes Em the party leader when she is in the party. Does nothing otherwise.
 */

(function() {
    "use strict";
    
    const pluginName = "NPCSystemParty";
    const EM_ACTOR_NAME = "Em";   // i18n-ignore: actor name, matched at runtime
    
    PluginManager.registerCommand(pluginName, "TransformActor2", args => {
        transformActor(2);
    });
    
    PluginManager.registerCommand(pluginName, "TransformActor3", args => {
        transformActor(3);
    });
    
    PluginManager.registerCommand(pluginName, "Greet", args => {
        showGreetingMessage();
    });
    
    PluginManager.registerCommand(pluginName, "JoinMessage", args => {
        showJoinMessage();
    });

    PluginManager.registerCommand(pluginName, "JoinParty", args => {
        joinParty(args.markovString || "", Number(args.eventId) || 0);
    });

    PluginManager.registerCommand(pluginName, "PresetJoinParty", args => {
        presetJoinParty(String(args.presetName || "Bubba"), Number(args.level) || 0);
    });

    // Take one of the world's idle companions back onto the road, met
    // wherever they live (window.PartyLodging). Nothing happens when the
    // party is already three strong, or when the name is nobody the world is
    // holding: the command is safe to call blind from any event.
    PluginManager.registerCommand(pluginName, "LodgerJoinParty", args => {
        let name = String(args.name || "");
        if (!name) {
            const eventId = $gameTemp?.lastPluginCommandEventId || $gameMap?._interpreter?._eventId;
            const event = eventId ? $gameMap.event(eventId) : null;
            name = event ? npcNameOf(event) : "";
        }
        lodgerJoinParty(name);
    });

    PluginManager.registerCommand(pluginName, "SetArchetype", args => {
        const actorId = Number(args.actorId) || 1;
        const archetypeName = String(args.archetypeName || "Humanoid"); // i18n-ignore: Archetypes.json id
        setActorArchetype(actorId, archetypeName);
    });

    // Hand the lead to Em when she is travelling with the party. Nothing at
    // all happens when she is not, so the command is safe to call blind.
    PluginManager.registerCommand(pluginName, "LeadAsEm", () => {
        const em = ($gameParty?.members() ?? []).find(m => m && m.name() === EM_ACTOR_NAME);
        if (em) window.PartyRoster.setLeader(em.actorId());
    });

    PluginManager.registerCommand(pluginName, "SetJoinedArchetype", args => {
        const archetypeName = String(args.archetypeName || "Humanoid"); // i18n-ignore: Archetypes.json id
        const joinedActorId = getLastJoinedActorId();
        if (joinedActorId) {
            setActorArchetype(joinedActorId, archetypeName);
        } else {
            console.warn("NPCSystemParty.SetJoinedArchetype: No joined party member found (only Actor1 in party).");
        }
    });

    // ========================================================================
    // ROSTER HISTORY
    // ========================================================================
    // Every companion who ever travelled with the party is remembered in
    // $gameSystem._npcPastPartyMembers (world-shared through WorldManager's
    // npcs.json "pastPartyMembers"), so the Empathize wiki's "Party" section and
    // the Dynamics menu's History page can list former members with the date and
    // the manner of their departure. Deduped by name: rejoining and leaving again
    // refreshes the snapshot rather than piling up duplicates.

    function nowMinute() {
        return $gameVariables ? ($gameVariables.value(114) || 0) : 0;
    }

    // Shared calendar formatting. NPCPolitics owns the epoch (minute 0 is
    // 01 JAN 2001 10:00) and is asked first so every log in the game reads the
    // same; the local fallback keeps roster dates working without it.
    const ROSTER_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    function rosterDateOf(minute) {
        const fmt = window.NPCPolitics?.dateOf;
        if (typeof fmt === "function") return fmt(minute);
        const date = new Date(2001, 0, 1, 10, 0, 0);
        date.setMinutes(date.getMinutes() + (Number(minute) || 0));
        return `${String(date.getDate()).padStart(2, "0")} ${ROSTER_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    }

    function pastPartyList() {
        if (!$gameSystem) return [];
        if (!Array.isArray($gameSystem._npcPastPartyMembers)) $gameSystem._npcPastPartyMembers = [];
        return $gameSystem._npcPastPartyMembers;
    }

    // ── The world's own roster of the inactive ──────────────────────────────
    // A departure is a fact about the WORLD, not about the savegame it happened
    // in: the companion who retired in one playthrough is still out there when
    // another one walks past. So every snapshot is mirrored into the world
    // folder, keyed by name, and read back from there by anything that asks who
    // is no longer travelling with anybody (PatreonRewards puts them in the
    // vault). A member who is walking with SOMEBODY is not inactive, so the
    // list is filtered against the party doing the asking before it is used.
    const WORLD_FILE = "party";       // i18n-ignore  world data file key
    const WORLD_FIELD = "inactive";   // i18n-ignore  field in it

    function worldInactiveStore() {
        const WM = window.WorldManager;
        if (!WM || typeof WM.getField !== "function") return null;
        if (WM.hasActiveWorld && !WM.hasActiveWorld()) return null;
        let held = null;
        try { held = WM.getField(WORLD_FILE, WORLD_FIELD); } catch (e) { return null; }
        if (!held || typeof held !== "object") {
            held = {};
            try { WM.setField(WORLD_FILE, WORLD_FIELD, held); } catch (e) { return null; }
        }
        return held;
    }

    // What a departed member is carrying. Nothing strips a leaving member's
    // equipment, so the actor still wears it in the savegame they left; this is
    // the copy every OTHER savegame of the world has to read them by, and the
    // copy they are dressed back in if they are ever taken on again.
    function equipSnapshot(actor) {
        const out = [];
        if (!actor || typeof actor.equips !== "function") return out;
        const equips = actor.equips() || [];
        for (let slot = 0; slot < equips.length; slot++) {
            const item = equips[slot];
            if (!item) continue;
            const kind = DataManager.isWeapon(item) ? "weapon"   // i18n-ignore: item kind
                : DataManager.isArmor(item) ? "armor" : null;    // i18n-ignore: item kind
            if (!kind) continue;
            out.push({ slot, kind, id: item.id });
        }
        return out;
    }

    function rememberInWorld(snapshot) {
        const store = worldInactiveStore();
        if (!store || !snapshot || !snapshot.name) return false;
        store[snapshot.name] = Object.assign({}, snapshot);
        return true;
    }

    function forgetInWorld(name) {
        const store = worldInactiveStore();
        if (!store || !name) return false;
        if (!(name in store)) return false;
        delete store[name];
        return true;
    }

    function joinMinutes() {
        if (!$gameSystem) return {};
        if (!$gameSystem._npcPartyJoinMinutes) $gameSystem._npcPartyJoinMinutes = {};
        return $gameSystem._npcPartyJoinMinutes;
    }

    // A summon (SummonSystem.js) borrows a party slot for the length of a fight
    // and is gone before it ends. It never travelled with anyone, so it is not a
    // companion and has no place in the roster ledger: neither a join stamp nor
    // a departure snapshot is taken for it.
    function isSummonProxy(actorId) {
        return !!window.SummonSystem?.isProxyActor?.(actorId);
    }

    // Stamp the join so a departure snapshot can report how long they rode along.
    const _Game_Party_addActor = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function(actorId) {
        const wasInParty = this._actors.includes(actorId);
        _Game_Party_addActor.call(this, actorId);
        if (wasInParty || !$gameSystem || isSummonProxy(actorId)) return;
        joinMinutes()[actorId] = nowMinute();
        // Back on the road: they are nobody's idle companion any more, and
        // whatever they walked away in goes back on (dressBack does nothing to
        // an actor who still has it, which is the ordinary case).
        const actor = $gameActors ? $gameActors.actor(actorId) : null;
        if (!actor) return;
        const store = worldInactiveStore();
        const snapshot = store && store[actor.name()];
        if (snapshot) dressBack(actor, snapshot);
        forgetInWorld(actor.name());
    };

    // Put a snapshot's equipment back on an actor, slot by slot, skipping every
    // slot they have already filled: a companion taken on again in another
    // savegame arrives in the gear they left in rather than naked, and one who
    // never took it off is not disturbed.
    function dressBack(actor, snapshot) {
        if (!actor || !snapshot || !Array.isArray(snapshot.equips)) return false;
        let dressed = false;
        for (const entry of snapshot.equips) {
            if (!entry || entry.slot == null) continue;
            const db = entry.kind === "weapon" ? $dataWeapons    // i18n-ignore: item kind
                : entry.kind === "armor" ? $dataArmors : null;   // i18n-ignore: item kind
            const item = db ? db[Number(entry.id)] : null;
            if (!item) continue;
            const held = actor.equips()[entry.slot];
            if (held) continue;
            try {
                actor.forceChangeEquip(entry.slot, item);
                dressed = true;
            } catch (e) { /* a slot this class does not have: leave it empty */ }
        }
        return dressed;
    }

    // Dossier switches that say a named character is travelling with this party
    // (CharacterCreationPresets.js). They drive the whole social layer written
    // around those two, so the moment one of them dies the world stops treating
    // the party as theirs: Em's Switch 48, Bubba's Switch 49.
    const DOSSIER_DEATH_SWITCHES = { Em: 48, Bubba: 49 };

    function clearDossierSwitchOnDeath(actor) {
        const switchId = DOSSIER_DEATH_SWITCHES[actor && actor.name()];
        if (!switchId || !window.$gameSwitches) return;
        if ($gameSwitches.value(switchId)) $gameSwitches.setValue(switchId, false);
    }

    // Record a departure. `reason` is one of "died", "retired" or "left".
    function recordDeparture(actor, reason) {
        if (!actor || !actor.name() || !$gameSystem) return;
        if (reason === "died") clearDossierSwitchOnDeath(actor);
        const past = pastPartyList();
        const minute = nowMinute();
        const actorId = actor.actorId();
        const previous = past.find(p => p.name === actor.name());
        const snapshot = {
            name: actor.name(),
            actorId,
            classId: actor._classId,
            className: actor.currentClass()?.name || "",
            level: actor.level,
            characterName: actor.characterName(),
            characterIndex: actor.characterIndex(),
            faceName: actor.faceName ? actor.faceName() : "",
            faceIndex: actor.faceIndex ? actor.faceIndex() : 0,
            // They walk away in what they were wearing, and they are still
            // wearing it wherever they turn up.
            equips: equipSnapshot(actor),
            reason,
            leftAtMin: minute,
            leftDate: rosterDateOf(minute),
            // Only a death gets a date of death; a retirement or a dismissal
            // leaves the roster with the member still alive out there.
            deathDate: reason === "died" ? rosterDateOf(minute) : null,
            joinedAtMin: joinMinutes()[actorId] ?? previous?.joinedAtMin ?? null,
        };
        snapshot.joinedDate = snapshot.joinedAtMin != null ? rosterDateOf(snapshot.joinedAtMin) : "";
        const existing = past.findIndex(p => p.name === snapshot.name);
        if (existing >= 0) past[existing] = snapshot;
        else past.push(snapshot);
        delete joinMinutes()[actorId];
        // And into the world, where every other savegame of it can meet them.
        // Except somebody sent home ("returned"): they are not a companion the
        // world is keeping for anybody, they are a citizen standing back where
        // they were found, so no departure snapshot is filed and they never
        // turn up in the halls (window.PartyReturn, below).
        if (reason !== "returned") rememberInWorld(snapshot);
        // Somebody taken off the board does not blink out of existence: they
        // are left standing where the party left them, and walk out of the
        // world the moment it walks off the map. Only a benching, never a
        // death and never a dismissal at the end of a story beat.
        if (reason === "retired") {
            try {
                window.PartyLodging?.dropHere?.(snapshot);
            } catch (e) {
                console.error("[NPCSystemParty] the benched member could not be left on the map", e);
            }
        }
    }

    // i18n-ignore: actor names, matched at runtime
    const STORY_FIXED_NAMES = ["Em"];

    const _Game_Party_removeActor = Game_Party.prototype.removeActor;
    Game_Party.prototype.removeActor = function(actorId) {
        const wasInParty = this._actors.includes(actorId);
        const actor = $gameActors ? $gameActors.actor(actorId) : null;
        // Read the reason before the removal: permadeath (BattleSystemEnhanced's
        // handlePartyMemberDeath) removes a member who is dead on the way out,
        // while CharacterPresets.retirePartyMember flags the benching itself.
        const retiring = $gameTemp && $gameTemp._partyRetiringActorId === actorId;
        // ...and window.PartyReturn flags a member sent back to the world.
        const returning = $gameTemp && $gameTemp._partyReturningActorId === actorId;
        const died = !!(actor && actor.isDead());
        // Somebody away on a work shift (Work/WorkSystem.js) has not left the
        // party, they are out for the afternoon: no departure is written.
        const working = $gameTemp && $gameTemp._workShiftActorId === actorId;
        _Game_Party_removeActor.call(this, actorId);
        if (!wasInParty || actorId === 1 || isSummonProxy(actorId) || working) return;
        recordDeparture(actor, returning ? "returned"
            : retiring ? "retired" : (died ? "died" : "left"));
    };

    // ========================================================================
    // PARTY ROSTER API (Dynamics menu, CustomMainMenuLayout.js)
    // ========================================================================

    window.PartyRoster = {
        // Everybody in this WORLD who is travelling with nobody: every
        // departure any savegame of it ever recorded, minus whoever is walking
        // with the party asking. Each entry carries the gear they left in, so
        // they can be met, met again, or taken on, dressed as they were.
        worldInactive() {
            const store = worldInactiveStore();
            if (!store) return [];
            const here = new Set(($gameParty?.members() ?? []).map(a => a.name()));
            return Object.keys(store)
                .map(name => store[name])
                .filter(entry => entry && entry.name && !here.has(entry.name))
                .map(entry => Object.assign({}, entry));
        },

        // Put a snapshot's equipment back on. Published because anything that
        // takes one of them on (a recruitment, a rescue, the vault's own
        // roster) has to dress them the same way.
        dressBack(actor, snapshot) { return dressBack(actor, snapshot); },

        // Forget somebody: they are travelling again, or they are gone.
        forgetInactive(name) { return forgetInWorld(name); },

        // The full roster ledger: everyone currently travelling plus every
        // recorded departure, newest departure last. Current members shadow an
        // older snapshot of the same name (they came back).
        history() {
            const current = ($gameParty?.members() ?? []).map((actor, index) => ({
                name: actor.name(),
                actorId: actor.actorId(),
                className: actor.currentClass()?.name || "",
                level: actor.level,
                status: "active",
                characterName: actor.characterName(),
                characterIndex: actor.characterIndex(),
                isLeader: index === 0,
                joinedAtMin: joinMinutes()[actor.actorId()] ?? null,
                joinedDate: joinMinutes()[actor.actorId()] != null
                    ? rosterDateOf(joinMinutes()[actor.actorId()]) : "",
                leftDate: "",
                deathDate: null,
            }));
            const activeNames = new Set(current.map(entry => entry.name));
            const past = pastPartyList()
                .filter(entry => entry?.name && !activeNames.has(entry.name))
                .map(entry => ({
                    name: entry.name,
                    actorId: entry.actorId,
                    className: entry.className || "",
                    level: entry.level || 1,
                    status: entry.reason || "left",
                    // The sprite they were last seen in, so a roster row can
                    // show a face instead of a bare name.
                    characterName: entry.characterName || "",
                    characterIndex: entry.characterIndex || 0,
                    isLeader: false,
                    joinedAtMin: entry.joinedAtMin ?? null,
                    joinedDate: entry.joinedDate || (entry.joinedAtMin != null ? rosterDateOf(entry.joinedAtMin) : ""),
                    leftDate: entry.leftDate || (entry.leftAtMin != null ? rosterDateOf(entry.leftAtMin) : ""),
                    deathDate: entry.deathDate || (entry.reason === "died" && entry.leftAtMin != null
                        ? rosterDateOf(entry.leftAtMin) : null),
                }));
            return current.concat(past);
        },

        // Whether the party may be handed over at all. Story mode used to be
        // played as one character and one only, but the lead now moves there
        // as it does anywhere else, so Tab, the pad triggers and the Dynamics
        // roster all allow it together rather than each answering for itself.
        canSwitchLeader() {
            return true;
        },

        // The story mode is Em and Bubba's road, not a party the player builds:
        // neither of the two can be benched, dismissed or removed from the
        // roster while switch 100 is on. Every seat-changing path asks here,
        // rather than each of them matching the names for itself.
        isStoryLocked(actorId) {
            if (!window.$gameSwitches || !$gameSwitches.value(100)) return false;
            const actor = actorId != null && $gameActors ? $gameActors.actor(actorId) : null;
            if (!actor) return false;
            return STORY_FIXED_NAMES.includes(actor.name());
        },

        // Promote a member to party leader (index 0). Vanilla formation swap, so
        // every leader() reader follows along.
        setLeader(actorId) {
            if (!this.canSwitchLeader()) return { ok: false, reason: "storyMode" };
            const members = $gameParty?.members() ?? [];
            const index = members.findIndex(mem => mem.actorId() === actorId);
            if (index < 0) return { ok: false, reason: "notInParty" };
            if (index === 0) return { ok: false, reason: "alreadyLeader" };
            // A member who is down is carried, not followed: the party is
            // never handed to a body. Every route in (Tab, the pad triggers,
            // the Dynamics board) asks here rather than matching on hit points
            // for itself.
            if (members[index].isDead && members[index].isDead()) return { ok: false, reason: "knockedOut" };
            $gameParty.swapOrder(0, index);
            return { ok: true };
        },

        // Log the death of a member who is not removed from the party (a full
        // party wipe, or the leader falling in a permadeath run).
        recordDeath(actor) {
            if (!actor) return;
            const past = pastPartyList();
            const already = past.find(p => p.name === actor.name() && p.reason === "died");
            if (already) return;
            recordDeparture(actor, "died");
        },

        dateOf: rosterDateOf,
    };

    // ========================================================================
    // SENDING SOMEBODY BACK (window.PartyReturn)
    // ========================================================================
    // A recruit is taken off the world by flipping their event's self switch A
    // and writing the loss down: an authored citizen into the world folder's
    // gone register (NPCGone, NPCSystem.js), a procedural one into the recruit
    // cache keyed by world tile. Dismissing them from the Dynamics board undoes
    // exactly those two things, so the person stands where they were found
    // again and every savegame of the world sees them there.
    //
    // The party actor slot remembers nothing about where its occupant came
    // from, so the origin is looked up by NAME in the two registers, which is
    // also what makes this work for anybody recruited before it existed.
    //
    // What they brought is not unwound: the money, the goods and the deeds they
    // came with stay with the party.

    // Their society profile is what the world reads them by. A procedural
    // recruit had theirs snapshotted into the cache, so it goes back on if the
    // registry has since forgotten them; an authored citizen never lost theirs.
    function restoreSocietyProfile(name, snapshot) {
        if (!name || !snapshot || !$gameSystem) return false;
        if (!$gameSystem._npcSociety) $gameSystem._npcSociety = {};
        if ($gameSystem._npcSociety[name]) return false;
        try {
            $gameSystem._npcSociety[name] = JsonEx.makeDeepCopy(snapshot);
            return true;
        } catch (e) { return false; }
    }

    // Being sent home is a thing the party did to somebody, and they remember
    // it: their standing with everybody still travelling falls, hardest with
    // the leader, who is the one who told them to go. The numbers live in the
    // Empathize ledger like every other opinion, so the next time the party
    // walks past them in the world they are met by somebody who is colder than
    // they were. Nobody's standing is moved through the company path, since
    // this is not time spent together.
    const DISMISS_RESENTMENT_LEADER = -30;
    const DISMISS_RESENTMENT_OTHERS = -15;

    function resentDismissal(name) {
        const help = window.NPCEmpathize?._helpers;
        if (!name || !help?._getProfile || !help._setNpcBaseOpinion) return false;
        let profile = null;
        try { profile = help._getProfile(name); } catch (e) { return false; }
        if (!profile) return false;
        const members = $gameParty?.members() ?? [];
        members.forEach((actor, index) => {
            const actorId = actor.actorId();
            const drop = index === 0 ? DISMISS_RESENTMENT_LEADER : DISMISS_RESENTMENT_OTHERS;
            try {
                help._setNpcBaseOpinion(profile, actorId,
                    help._npcBaseOpinion(profile, actorId) + drop);
            } catch (e) { /* a grudge never breaks a dismissal */ }
        });
        return members.length > 0;
    }

    window.PartyReturn = {
        // Where this person was recruited, or null for somebody the world has
        // no record of taking off it (a made character, a story companion, a
        // recruit whose record has already been struck).
        originOf(name) {
            if (!name) return null;
            const proc = window.NPCSystem?.findProceduralRecruit?.(name);
            if (proc && proc.key) {
                return {
                    kind: "procedural",      // i18n-ignore: origin kind
                    key: proc.key,
                    eventId: proc.eventId,
                    worldX: proc.worldX,
                    worldY: proc.worldY,
                    profile: proc.profile || null,
                };
            }
            const gone = window.NPCGone?.findByName?.(name);
            if (gone && gone.mapId && gone.eventId && gone.reason !== "killed") {
                return {
                    kind: "map",             // i18n-ignore: origin kind
                    mapId: gone.mapId,
                    eventId: gone.eventId,
                    profile: null,
                };
            }
            return null;
        },

        canReturn(name) {
            return !!this.originOf(name);
        },

        // Put them back where they were found. Answers { ok, reason?, origin? }.
        returnToWorld(name) {
            const origin = this.originOf(name);
            if (!origin) return { ok: false, reason: "noOrigin" };
            restoreSocietyProfile(name, origin.profile);
            if (origin.kind === "procedural") {
                // The tile is generated afresh on every visit, so forgetting the
                // recruit is the whole of putting them back: the next generation
                // of that square places them exactly where it always did.
                window.NPCSystem?.forgetProceduralRecruit?.(origin.key);
            } else {
                $gameSelfSwitches?.setValue?.([origin.mapId, origin.eventId, "A"], false);
                window.NPCGone?.forget?.(origin.mapId, origin.eventId);
                // Standing on that very map: the event is hidden behind its
                // blank page this instant, so it is refreshed rather than left
                // invisible until the next transfer.
                if (typeof $gameMap !== "undefined" && $gameMap && $gameMap.mapId() === origin.mapId) {
                    const ev = $gameMap.event(origin.eventId);
                    if (ev) {
                        ev._erased = false;
                        ev.refresh();
                    }
                }
            }
            // They live in the world now, not in the reserves: no lodging, no
            // departure snapshot, nothing for the halls to draw.
            try { window.PartyLodging?.assign?.(name, LODGING_DEFAULT); } catch (e) { /* no world open */ }
            forgetInWorld(name);
            return { ok: true, origin };
        },

        // Dismiss a travelling member. The leader stays (hand the party over
        // first), the party is never emptied, and the story pair never leaves:
        // the same three rules benching plays by.
        dismiss(actorId) {
            if (!$gameParty || !$gameActors) return { ok: false, reason: "noParty" };
            const actor = $gameParty.members().find(mem => mem.actorId() === actorId);
            if (!actor) return { ok: false, reason: "notInParty" };
            if ($gameParty.members().length <= 1) return { ok: false, reason: "lastMember" };
            if ($gameParty.members()[0].actorId() === actorId) return { ok: false, reason: "isLeader" };
            if (window.PartyRoster?.isStoryLocked?.(actorId)) return { ok: false, reason: "storyLocked" };
            const name = actor.name();
            if (!this.canReturn(name)) return { ok: false, reason: "noOrigin" };

            if ($gameTemp) $gameTemp._partyReturningActorId = actorId;
            $gameParty.removeActor(actorId);
            if ($gameTemp) $gameTemp._partyReturningActorId = null;
            if ($gameVariables) $gameVariables.setValue(29, $gameParty.members().length);

            const back = this.returnToWorld(name);
            if (!back.ok) return back;
            resentDismissal(name);
            return { ok: true, name, origin: back.origin };
        },

        // The same for somebody sitting in the reserves: their dossier is spent
        // rather than left on the bench, so no savegame of this world can call
        // them back, and then they go home like anybody else.
        dismissReserve(presetId) {
            const bench = window.CharacterPresets?.getAvailableRetiredPresets?.() ?? [];
            const preset = bench.find(entry => entry && entry.id === presetId);
            if (!preset) return { ok: false, reason: "notRetired" };
            if (window.PartyLodging?.isStoryFollower?.(preset.name)) {
                return { ok: false, reason: "storyLocked" };
            }
            if (!this.canReturn(preset.name)) return { ok: false, reason: "noOrigin" };
            if (!window.CharacterPresets?.discardRetiredPreset?.(presetId)) {
                return { ok: false, reason: "notRetired" };
            }
            const back = this.returnToWorld(preset.name);
            if (!back.ok) return back;
            resentDismissal(preset.name);
            return { ok: true, name: preset.name, origin: back.origin };
        },

        resentDismissal(name) { return resentDismissal(name); },
    };

    // ========================================================================
    // WHERE THE INACTIVE LIVE (window.PartyLodging)
    // ========================================================================
    // Benching a companion used to put them nowhere: they left the party and
    // became a line on the Dynamics board. They live somewhere now, and the
    // board is where the player says where.
    //
    //   the halls   , the default. The Stairs Hall and every floor of the
    //                 Omega Tower above and below it: the one place in the
    //                 world that belongs to nobody, so it is where anybody
    //                 with nowhere else to be ends up. Up to NINE of them are
    //                 met on any one floor, drawn again every time the party
    //                 walks in, so the halls are never the same crowd twice.
    //   a house     , any floor the party holds the deed to
    //                 (ProceduralHouseSystem.listOwnedHouses)
    //   the ship    , the starship interior, offered only to a party that
    //                 owns a starship
    //   the vault   , the patron vault, offered only in a world whose square
    //                 has been claimed. A vault resident is found on ANY of
    //                 its nine floors, rolled afresh on every descent.
    //
    // The assignment is a fact about the WORLD, like the bench it is made on,
    // so it is written to the world folder and every savegame of that world
    // finds them in the same place. Interaction with one of them is what it is
    // with anybody else's party member: talk, read, and - the one thing that
    // is not - take them back on (PartyPresence, NPCSystem.js).
    // Nobody on the story road keeps a house. Em never leaves the party at all
    // and Bubba, benched or not, walks behind it (Game_BubbaFollower), so
    // neither of them is ever a resident anywhere: the Dynamics board offers
    // them no home and PartyLodging refuses to give them one.
    // i18n-ignore: actor names, matched at runtime
    const STORY_LODGING_NAMES = ["Em", "Bubba"];

    function isStoryLodgingFixed(name) {
        if (!window.$gameSwitches || !$gameSwitches.value(100)) return false;
        return STORY_LODGING_NAMES.includes(String(name || ""));
    }

    const LODGING_FIELD = "lodging";        // i18n-ignore  field in party.json
    const LODGING_DEFAULT = "halls";        // i18n-ignore  place id
    const STAIRS_HALL_MAP_ID = 635;
    const STARSHIP_INTERIOR_MAP_ID = 721;
    // The halls are wide and the reserves can be long; nine at a time is a
    // crowd without being the whole bench standing in one room.
    const HALLS_MAX_RESIDENTS = 9;
    const LODGING_KEY_PREFIX = "inactive:";  // i18n-ignore  spawned event key

    function lodgingStore() {
        const WM = window.WorldManager;
        if (!WM || typeof WM.getField !== "function") return null;
        if (WM.hasActiveWorld && !WM.hasActiveWorld()) return null;
        let held = null;
        try { held = WM.getField(WORLD_FILE, LODGING_FIELD); } catch (e) { return null; }
        if (!held || typeof held !== "object") {
            held = {};
            try { WM.setField(WORLD_FILE, LODGING_FIELD, held); } catch (e) { return null; }
        }
        return held;
    }

    // Everybody the world holds who travels with nobody, whichever register
    // they are filed in: the reserve dossiers this world can call back
    // (CharacterPresets, what the Dynamics board lists) and the departure
    // snapshots every savegame of the world writes (worldInactive). The two
    // overlap by name, and the dossier wins, because it is the one that can be
    // taken back on.
    function lodgingResidents() {
        const out = [];
        const seen = new Set();
        const presets = window.CharacterPresets?.getAvailableRetiredPresets?.() ?? [];
        for (const preset of presets) {
            if (!preset || !preset.name || seen.has(preset.name)) continue;
            if (isStoryLodgingFixed(preset.name)) continue;
            seen.add(preset.name);
            out.push({
                name: preset.name,
                presetId: preset.id,
                classId: preset.classId,
                level: preset.level || 1,
                characterName: preset.sprite || "",
                characterIndex: preset.spriteIndex || 0,
                equips: null,
            });
        }
        for (const entry of window.PartyRoster.worldInactive()) {
            if (!entry || !entry.name || seen.has(entry.name)) continue;
            if (isStoryLodgingFixed(entry.name)) continue;
            seen.add(entry.name);
            out.push({
                name: entry.name,
                presetId: null,
                classId: entry.classId,
                level: entry.level || 1,
                characterName: entry.characterName || "",
                characterIndex: entry.characterIndex || 0,
                equips: Array.isArray(entry.equips) ? entry.equips.slice() : null,
            });
        }
        return out;
    }

    // Is the starship the party's own? Only an owned one has an interior to
    // put anybody in; a ship seen through a window is somebody else's.
    function ownsStarship() {
        const VS = window.MergedVehicleSystem;
        const owned = VS?.getOwnedVehicles?.() ?? [];
        return owned.some(v => v && (v.key === "starship" || v.type === "airship"));  // i18n-ignore: vehicle keys
    }

    function vaultIsOpen() {
        return !!window.PatreonRewards?.claimedSquare?.();
    }

    // The gear they left in, on the profile everything that inspects them
    // reads (the Empathize panel, the wiki).
    function dressLodgerProfile(person) {
        if (!person || !Array.isArray(person.equips)) return;
        try {
            const profile = window.NPCSocietyRegistry?.getProfile?.(person.name);
            if (profile) profile.equipment = person.equips.slice();
        } catch (e) { /* they stand there dressed either way */ }
    }

    window.PartyLodging = {
        DEFAULT: LODGING_DEFAULT,
        MAX_ACTIVE: 3,
        HALLS_MAX_RESIDENTS,
        STAIRS_HALL_MAP_ID,
        STARSHIP_INTERIOR_MAP_ID,
        KEY_PREFIX: LODGING_KEY_PREFIX,

        // Everybody with nowhere else to be, and where each of them is.
        residents() {
            return lodgingResidents().map(person =>
                Object.assign({}, person, { lodging: this.assignmentOf(person.name) }));
        },

        // Every place the player may send somebody, the default first. A place
        // the party does not hold is not on the list at all rather than listed
        // and refused.
        places() {
            const out = [{ id: LODGING_DEFAULT, kind: "halls", name: T('NPCParty.lodging.halls') }];
            const houses = window.ProceduralHouseSystem?.listOwnedHouses?.() ?? [];
            for (const house of houses) {
                if (!house || !house.key) continue;
                out.push({
                    id: "house:" + house.key,   // i18n-ignore: place id
                    kind: "house",
                    name: T('NPCParty.lodging.house', { place: house.mapName || "" }),
                });
            }
            if (ownsStarship()) {
                out.push({ id: "ship", kind: "ship", name: T('NPCParty.lodging.ship') });  // i18n-ignore: place id
            }
            if (vaultIsOpen()) {
                out.push({ id: "vault", kind: "vault", name: T('NPCParty.lodging.vault') }); // i18n-ignore: place id
            }
            return out;
        },

        placeName(placeId) {
            const found = this.places().find(place => place.id === placeId);
            return found ? found.name : T('NPCParty.lodging.halls');
        },

        // Where this person lives. A place the party has since sold, sunk or
        // never held falls back to the halls rather than leaving them nowhere.
        // Em and Bubba keep no home on the story road: they are with the
        // party, so the board reads them as living nowhere.
        isStoryFollower(name) {
            return isStoryLodgingFixed(name);
        },

        assignmentOf(name) {
            if (isStoryLodgingFixed(name)) return LODGING_DEFAULT;
            const store = lodgingStore();
            const held = store && name ? store[name] : null;
            if (!held) return LODGING_DEFAULT;
            return this.places().some(place => place.id === held) ? held : LODGING_DEFAULT;
        },

        // Send somebody to live somewhere. The halls are written as an absence
        // rather than as a value, so a world folder only ever carries the
        // assignments that were actually made.
        assign(name, placeId) {
            if (isStoryLodgingFixed(name)) return false;
            const store = lodgingStore();
            if (!store || !name) return false;
            if (!placeId || placeId === LODGING_DEFAULT) {
                delete store[name];
                return true;
            }
            if (!this.places().some(place => place.id === placeId)) return false;
            store[name] = placeId;
            return true;
        },

        // The place the party is standing in right now, or null for anywhere
        // that is nobody's home.
        currentPlaceId() {
            if (typeof $gameMap === "undefined" || !$gameMap) return null;
            const mapId = $gameMap.mapId();
            if (mapId === STARSHIP_INTERIOR_MAP_ID && ownsStarship()) return "ship";  // i18n-ignore: place id
            const vaultFloors = window.PatreonRewards?.VAULT_FLOORS ?? [];
            if (vaultFloors.includes(mapId)) return vaultIsOpen() ? "vault" : null;   // i18n-ignore: place id
            // The halls: the Stairs Hall itself and every floor of the tower
            // reached from it. DungeonFloors is the one answer to what counts
            // as the tower, the same one the Dynamics board asks before it
            // lets the party be rearranged at all.
            if (mapId === STAIRS_HALL_MAP_ID) return LODGING_DEFAULT;
            if (window.DungeonFloors?.insideTower?.()) return LODGING_DEFAULT;
            // A house answers for itself: which interior map a deed opens onto
            // is decided when the door is walked through, so the only thing
            // that knows this floor is the party's is the house system.
            const PHS = window.ProceduralHouseSystem;
            if (PHS?.isCurrentFloorOwned?.()) {
                const key = PHS.getCurrentOwnershipKey?.();
                const id = key ? "house:" + key : null;   // i18n-ignore: place id
                if (id && this.places().some(place => place.id === id)) return id;
                // A deed held under a spelling the board does not list (an
                // inherited residence) is somebody's home but nobody is
                // assigned to it, so nobody is put on this floor.
                return null;
            }
            return null;
        },

        // How many of the residents of a place are met on one floor of it at
        // once. A house holds everybody who lives in it; the halls and the
        // vault are big enough to lose people in, so they hold a handful,
        // drawn again on every arrival.
        capacityFor(placeId) {
            if (placeId === LODGING_DEFAULT) return HALLS_MAX_RESIDENTS;
            if (placeId === "vault") {                                   // i18n-ignore: place id
                // One floor's share of the nine, rounded up, so a vault
                // resident is somewhere down there rather than on a fixed step.
                const floors = (window.PatreonRewards?.VAULT_FLOORS ?? []).length || 1;
                return Math.max(1, Math.ceil(HALLS_MAX_RESIDENTS / floors));
            }
            return Infinity;
        },

        // Draw who is met here this time. The roll is fresh on every arrival,
        // which is what makes a hall feel like a place people pass through
        // rather than a row of statues.
        drawFor(placeId) {
            const living = this.residents().filter(person => person.lodging === placeId);
            const room = this.capacityFor(placeId);
            if (!Number.isFinite(room) || living.length <= room) return living;
            const pool = living.slice();
            const out = [];
            while (out.length < room && pool.length) {
                out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            }
            return out;
        },

        // Put this place's share of them on the floor. Answers how many were
        // spawned, and does nothing at all anywhere that is nobody's home.
        populateHere() {
            this.restoreDrops();
            const placeId = this.currentPlaceId();
            if (!placeId) return 0;
            const VP = window.PartyPresence;
            if (!VP || typeof VP.spawnOne !== "function") return 0;
            if (typeof $dataMap === "undefined" || !$dataMap) return 0;
            if (!$dataMap.events) $dataMap.events = [null];
            // Nobody is met twice: somebody walking with THIS party is not
            // also loitering in the hall, whatever the world folder says.
            const here = new Set(($gameParty?.members() ?? []).map(a => a.name()));
            let spawned = 0;
            for (const person of this.drawFor(placeId)) {
                if (here.has(person.name)) continue;
                const key = LODGING_KEY_PREFIX + person.name;
                if (VP.findEvent && VP.findEvent(key)) continue;
                const record = {
                    key,
                    name: person.name,
                    characterName: person.characterName,
                    characterIndex: person.characterIndex,
                    classId: person.classId,
                    level: person.level,
                };
                if (!VP.spawnOne(record, { slot: null, location: null })) continue;
                spawned++;
                dressLodgerProfile(person);
            }
            return spawned;
        },

        // Whoever was benched on the map the party is standing on, put back.
        // Benching happens in the menu, and Scene_Map.create reloads the map
        // file on the way out of it, so the event injected at the moment of
        // the benching is wiped before the player ever sees it: the drop is
        // noted on $gameTemp and laid down again here, on the floor it was
        // made on. It is noted nowhere that a savegame carries, which is what
        // makes them gone on the next transfer without anything sweeping up.
        restoreDrops() {
            if (typeof $gameTemp === "undefined" || !$gameTemp || !$gameMap) return 0;
            const drops = $gameTemp._lodgingDrops;
            if (!Array.isArray(drops) || !drops.length) return 0;
            const here = drops.filter(drop => drop && drop.mapId === $gameMap.mapId());
            // Anything left on another map is left behind for good.
            $gameTemp._lodgingDrops = here;
            let put = 0;
            for (const drop of here) {
                if (this.dropHere(drop.snapshot, { remember: false })) put++;
            }
            return put;
        },

        // Somebody benched this minute. They do not vanish out of the world
        // the moment they are taken off the board: they stand where the party
        // left them until it walks off the map, and after that they are
        // wherever they live.
        dropHere(snapshot, opts) {
            const VP = window.PartyPresence;
            if (!VP || typeof VP.spawnOne !== "function") return false;
            if (typeof $dataMap === "undefined" || !$dataMap || !$gameMap) return false;
            if (!$dataMap.events) $dataMap.events = [null];
            if (!snapshot || !snapshot.name) return false;
            // A story follower is never left behind: benched, Bubba keeps
            // walking with the party, so no body of him is put on the floor.
            if (isStoryLodgingFixed(snapshot.name)) return false;
            const key = LODGING_KEY_PREFIX + snapshot.name;
            if (VP.findEvent && VP.findEvent(key)) return false;
            // Where they were left, which is where the party is standing: the
            // one spawn in the game that is not scattered over the map.
            const spot = ($gamePlayer && typeof VP.isStandable === "function")
                ? nearestStandableTile(VP, $gamePlayer.x, $gamePlayer.y)
                : null;
            const ok = !!VP.spawnOne({
                key,
                name: snapshot.name,
                characterName: snapshot.characterName || "",
                characterIndex: snapshot.characterIndex || 0,
                classId: snapshot.classId,
                level: snapshot.level,
            }, { slot: null, location: spot });
            if (!ok) return false;
            dressLodgerProfile(snapshot);
            // Noted so the map reload on the way out of the menu does not take
            // them with it. Not noted when this IS that second laying down.
            if (!opts || opts.remember !== false) {
                if (typeof $gameTemp !== "undefined" && $gameTemp) {
                    if (!Array.isArray($gameTemp._lodgingDrops)) $gameTemp._lodgingDrops = [];
                    $gameTemp._lodgingDrops.push({ mapId: $gameMap.mapId(), snapshot });
                }
            }
            return true;
        },

        // Whether this name is one of the world's idle companions rather than
        // a citizen of it or somebody else's traveller. Read by the interact
        // command, which offers them a place on the road only if it is.
        isResidentName(name) {
            if (!name) return false;
            return lodgingResidents().some(person => person.name === name);
        },

        // Room on the road for one more.
        hasRoom() {
            return ($gameParty?.members()?.length ?? 0) < this.MAX_ACTIVE;
        },

        // Take one of them back on, met where they live. A reserve dossier is
        // called back the way the Dynamics board calls it back; a departure
        // snapshot with no dossier behind it cannot be rebuilt into an actor,
        // so it is turned down rather than half-restored.
        rejoin(name) {
            if (!name) return { ok: false, reason: "notResident" };
            if (!this.hasRoom()) return { ok: false, reason: "partyFull" };
            const person = lodgingResidents().find(entry => entry.name === name);
            if (!person) return { ok: false, reason: "notResident" };
            if (person.presetId == null) return { ok: false, reason: "noDossier" };
            const result = window.CharacterPresets?.unretirePartyMember?.(person.presetId);
            if (!result || !result.ok) return result || { ok: false, reason: "notResident" };
            // Off the floor: they walk with the party now, so the event
            // standing in for them goes, and so does where they used to live.
            try {
                const ev = window.PartyPresence?.findEvent?.(LODGING_KEY_PREFIX + name);
                if (ev && ev.erase) ev.erase();
            } catch (e) { /* the event is gone on the next transfer either way */ }
            const store = lodgingStore();
            if (store) delete store[name];
            return result;
        },
    };

    // The nearest tile to (x,y) somebody may be left standing on, the tile
    // itself included. Null when the whole map refuses them, which leaves the
    // spawn to pick its own place.
    function nearestStandableTile(VP, x, y) {
        for (let radius = 0; radius <= 4; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    if (VP.isStandable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
                }
            }
        }
        return null;
    }

    function getLastJoinedActorId() {
        if (!$gameParty || !$gameParty.members) return 0;
        const members = $gameParty.members();
        // The last element in members() is the most recently added (addActor pushes to end)
        // Exclude Actor1 (actorId 1) since they're the main character
        for (let i = members.length - 1; i >= 0; i--) {
            const actorId = members[i].actorId();
            if (actorId !== 1) return actorId;
        }
        return 0;
    }

    function setActorArchetype(actorId, archetypeName) {
        if (!window.changeArchetypeForActor) {
            console.warn("NPCSystemParty.SetArchetype: changeArchetypeForActor not found. Is Health_Core.js loaded?");
            return;
        }

        const actor = $gameActors.actor(actorId);
        if (!actor) {
            console.warn(`NPCSystemParty.SetArchetype: Actor ${actorId} not found.`);
            return;
        }

        const success = window.changeArchetypeForActor(actor, archetypeName);
        if (success) {
            console.log(`NPCSystemParty.SetArchetype: Successfully set actor ${actorId} archetype to "${archetypeName}"`);
        } else {
            console.warn(`NPCSystemParty.SetArchetype: Failed to set archetype "${archetypeName}" for actor ${actorId}. Check that it exists in window.Health.Archetypes.`);
        }
    }

    function parseGenderFromNote(noteData) {
        if (!noteData) return 0;
        // Strip the NPC-X token, then find a standalone digit 0-3
        const stripped = noteData.replace(/NPC-\d+/, '');
        const match = stripped.match(/\b([0-3])\b/);
        return match ? parseInt(match[1]) : 0;
    }

    function callThoughtsMenuMarkov(position, markovString) {
        const cmd = PluginManager._commands?.["ThoughtsMenu"]?.["setMarkovDB"];
        if (cmd) {
            cmd.call($gameMap._interpreter, {
                partyIndex: String(position),
                markovData: markovString
            });
        }
    }

    // Who is standing at this event right now. A <Shop> counter is worked in
    // shifts, so its event name is the fixture ("Shop") and the person behind
    // it is the covering persona, which is the name a recruit must join under.
    function npcNameOf(event) {
        if (!event) return "";
        return window.NPCSim?.npcNameForEvent?.(event) ?? (event.event()?.name?.trim() || "");
    }

    function transferNPCNeeds(actorId, eventName) {
        const profile = window.NPCSocietyRegistry?.getProfile(eventName);
        if (!profile) return;
        const actor = $gameActors.actor(actorId);
        if (!actor) return;
        const maxH = window.TimeDateSystem?.maxHunger ?? 100;
        const maxS = window.TimeDateSystem?.maxSleep ?? 100;
        if (profile.hunger !== undefined) actor._hunger = Math.round((profile.hunger / 100) * maxH);
        if (profile.sleep  !== undefined) actor._sleep  = Math.round((profile.sleep  / 100) * maxS);
    }

    function equipNPCActor(actorId, eventName) {
        if (!window.NPCSocietyGetEquip) return;
        const actor = $gameActors.actor(actorId);
        if (!actor) return;
        const profile = window.NPCSocietyRegistry?.getProfile(eventName);
        const wealthTierBase = profile?.wealthTierBase ?? 2;
        const equip = window.NPCSocietyGetEquip(eventName, actor._classId || null, wealthTierBase);
        if (equip.weaponId && $dataWeapons[equip.weaponId]) {
            actor.forceChangeEquip(0, $dataWeapons[equip.weaponId]);
        }
        for (const armorId of equip.armorIds) {
            const armor = $dataArmors[armorId];
            if (!armor) continue;
            // A shield goes in a hand now, so ask what would take it rather
            // than matching equip types (window.HandSlots).
            const slot = window.HandSlots
                ? window.HandSlots.emptySlotFor(actor, armor)
                : actor.equipSlots().findIndex((e, i) => e === armor.etypeId && !actor.equips()[i]);
            if (slot >= 0) actor.forceChangeEquip(slot, armor);
        }
    }

    function grantNPCGold(eventName) {
        const profile = window.NPCSocietyRegistry?.getProfile(eventName);
        const wealthTier = profile ? (profile.wealthTierBase ?? 2) : 2;

        const members = $gameParty.members();
        const levels = members.map(a => a.level).sort((a, b) => a - b);
        const mid = Math.floor(levels.length / 2);
        const level = levels.length
            ? (levels.length % 2 !== 0 ? levels[mid] : Math.floor((levels[mid - 1] + levels[mid]) / 2))
            : 1;

        // Same purse an NPC with a simulated profile would carry at this level
        // and wealth tier (NPCSim.rollStartingMoney), so recruiting a plain
        // event NPC is not worth an order of magnitude more than recruiting a
        // simulated one. The party's median level stands in for the missing
        // profile's own level.
        const gold = window.NPCSim?.rollStartingMoney
            ? window.NPCSim.rollStartingMoney({ level, wealthTierBase: wealthTier }, eventName)
            : Math.floor((150 + level * 120) * [0.35, 0.7, 1.4, 3.5, 9][Math.min(wealthTier, 4)]);
        $gameParty.gainGold(gold);
    }

    // Gives the party the money the NPC carries on their person and every item
    // they own. Falls back to an estimated purse for NPCs without simulated
    // wealth. Clears the transferred wealth/items from the profile so it can't be
    // handed over twice.
    function grantNPCPossessions(eventName) {
        const profile = window.NPCSocietyRegistry?.getProfile(eventName);
        // Money on hand -> party funds (profile.money is in gold, 100 = 1€).
        if (profile && profile.money !== undefined) {
            const money = Math.max(0, Math.floor(profile.money));
            if (money > 0) $gameParty.gainGold(money);
            profile.money = 0;
        } else {
            grantNPCGold(eventName); // no sim data: estimate a pocket purse
        }
        // Owned items -> party inventory.
        if (profile && Array.isArray(profile.itemIds) && profile.itemIds.length) {
            for (const id of profile.itemIds) {
                const item = $dataItems[id];
                if (item) $gameParty.gainItem(item, 1);
            }
            profile.itemIds = [];
        }
    }

    // If the NPC owns/resides in a procedural house (NPCSociety home assignment),
    // record it so the Assets pockets lists it and FurnitureSystem allows building
    // inside that house's interior template. Keyed by the interior map id - the
    // home is an abstract template assignment, not a placed entrance, so the
    // interior mapId is the only concrete hook available.
    function registerNPCHouse(eventName) {
        const profile = window.NPCSocietyRegistry?.getProfile(eventName);
        if (!profile || profile.homeMapId == null) return;
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        const list = $gameSystem._npcInheritedHouses = $gameSystem._npcInheritedHouses || [];
        if (list.some(h => h.mapId === profile.homeMapId)) return; // dedup by template
        // Named through WorldMapReturn: a home whose entrance is the procedural
        // map would otherwise be filed as "ProceduralRoom", the one map every
        // world square reuses.
        let mapName = T('NPCParty.residence');
        if (window.WorldMapReturn && window.WorldMapReturn.placeName) {
            mapName = window.WorldMapReturn.placeName(profile.homeMapId) || mapName;
        } else if ($dataMapInfos && $dataMapInfos[profile.homeMapId] && $dataMapInfos[profile.homeMapId].name) {
            mapName = $dataMapInfos[profile.homeMapId].name;
        }
        // Deterministic value in the same ~300-900€ band procedural houses use.
        const h = ((profile.homeMapId * 2654435761) ^ ((profile.homeSeed || 0) >>> 0)) >>> 0;
        const value = 30000 + (h % 60000);
        list.push({
            mapId: profile.homeMapId,
            seed: (profile.homeSeed || 0) >>> 0,
            poolType: profile.homePoolType || 'houses',
            npcName: eventName,
            mapName,
            value,
        });
    }

    // Returns true only if the NPC actually joined (actor added + self-switch A
    // set). Callers (e.g. NPCEmpathize's panel) rely on this to avoid claiming a
    // join succeeded when the party was full or the event could not be resolved.
    // ========================================================================
    // PRESET CHARACTER JOIN
    // ========================================================================
    // A dossier character (Bubba, Em, anyone on the preset roster) walking into
    // the party from a cutscene, with no NPC event behind them. The sheet is not
    // built here: the wizard's own applier does it (CCPresetJoin, which handles
    // the free seat, the Dynamics bench when there is none, and the toast), so a
    // scripted join and a join from the roster screen produce the same person.
    // All this command adds is looking the dossier up by name, which is how an
    // event names them, and setting the switch that says they are on the road.
    function presetJoinParty(presetName, levelArg) {
        const join = window.CCPresetJoin?.joinPresetCharacter;
        if (!join || !$gameParty) return false;

        const wanted = String(presetName || "").toLowerCase();
        const preset = (window.CharacterPresets?.getCharacterPresets?.() || [])
            .find(p => p && String(p.name).toLowerCase() === wanted);
        if (!preset) {
            console.warn("NPCSystemParty.PresetJoinParty: no dossier named " + presetName);
            return false;
        }

        const result = join(preset.id);
        if (!result || !result.ok) return false;

        // The switch that says this named character is travelling with the
        // party (Em's 48, Bubba's 49). The rest of a dossier's switches belong
        // to playing AS them and are none of a companion join's business. Only
        // set for somebody who actually took a seat: a benched dossier is not
        // on the road yet.
        const dossierSwitch = DOSSIER_DEATH_SWITCHES[preset.name];
        if (dossierSwitch && $gameSwitches && !result.inactive) {
            $gameSwitches.setValue(dossierSwitch, true);
        }

        // Level them to the party they just joined, unless the event asked for
        // a level of its own. The dossier's own starting level is a founding
        // level and means nothing halfway through an adventure.
        const actor = result.actorId ? $gameActors.actor(result.actorId) : null;
        if (actor) {
            const leader = $gameParty.leader();
            const level = levelArg > 0 ? levelArg : (leader ? leader.level : actor.level);
            if (level > 0 && level !== actor.level) actor.changeLevel(Math.min(99, level), false);
            actor.recoverAll();
        }
        return true;
    }

    function joinParty(markovString, eventIdArg) {
        if (!$gameParty || !$gameMap || !$gameTemp) return false;

        // Why a join failed, for callers that word their own feedback (the
        // Empathize panel used to report every failure as "party is full").
        $gameTemp._npcJoinFailReason    = null;
        $gameTemp._npcJoinDisplacedName = null;
        $gameTemp._npcJoinedInactive    = false;

        // Explicit eventId first (callers outside a running event, e.g.
        // NPCEmpathize's DOM panel), then the usual interpreter fallbacks.
        const eventId = eventIdArg || $gameTemp.lastPluginCommandEventId || $gameMap._interpreter._eventId;
        if (!eventId) { $gameTemp._npcJoinFailReason = 'noEvent'; return false; }

        const event = $gameMap.event(eventId);
        if (!event) { $gameTemp._npcJoinFailReason = 'noEvent'; return false; }

        // The story mode's companion seat belongs to Bubba: while he is not
        // walking with the party, nobody else is taken on (the Empathize panel
        // hides Join for the same reason).
        if ($gameSwitches.value(100)
            && !$gameParty.members().some(m => m.name() === 'Bubba')) { // i18n-ignore: actor name, matched at runtime
            $gameTemp._npcJoinFailReason = 'refused';
            return false;
        }

        // Bubba never travels in Em's party (Switch 48, her dossier): the camper
        // needs him where he is, and a jealous goddess makes sharing a road with
        // Em unhealthy for whoever is nearby. The Empathize panel hides Join for
        // him and answers in his own voice; this covers the event-command path.
        if ($gameSwitches.value(48)
            && npcNameOf(event).toLowerCase() === 'bubba'
            && $gameParty.members().some(m => m.name() === 'Em')) {
            $gameTemp._npcJoinFailReason = 'refused';
            if (!window._npcEmpathizeSilentJoin) {
                window.skipLocalization = true;
                $gameMessage.add(T('NPCParty.bubbaRefusesJoin'));
                window.skipLocalization = false;
            }
            return false;
        }

        // Recruits fill the first free companion slot: Actor 2, then Actor 3.
        // Multiplayer (Switch 67) reserves Actor 3 for the remote guest, so a
        // recruit there always takes the Actor 3 slot (if still free).
        //
        // The ceiling is counted in PEOPLE, not in free slot ids. A party that
        // already travels three strong takes nobody else, whichever actor ids
        // those three happen to sit on: a recalled reserve, or a companion taken
        // on down some other road, can leave Actor 2 or Actor 3 unoccupied, and
        // handing a recruit that empty slot used to put a fourth person on the
        // road who trailed the party while appearing on no roster, in no HUD and
        // in no reserve list. Over the ceiling they sign on inactive instead,
        // which is what benchRecruit below is for.
        const maxActive  = window.PartyLodging?.MAX_ACTIVE ?? 3;
        const travelling = ($gameParty._actors || []).filter(id => !isSummonProxy(id));
        const slotFree   = id => !$gameParty._actors.includes(id);
        let actorId = 0;
        if (travelling.length < maxActive) {
            if ($gameSwitches.value(67)) {
                actorId = slotFree(3) ? 3 : 0;
            } else if (slotFree(2)) {
                actorId = 2;
            } else if (slotFree(3)) {
                actorId = 3;
            }
        }
        if (!actorId) {
            // Every place is taken, but somebody who fell and was never brought
            // back is not travelling any more. Their body is left where it is
            // (the removal hook files them as a death in the roster history) and
            // the recruit takes their place, so a party that lost a member in a
            // run without permadeath can still take someone on.
            const fallen = $gameParty.members().find(a =>
                a && a.actorId() !== 1 && !isSummonProxy(a.actorId()) && a.isDead());
            if (fallen) {
                $gameTemp._npcJoinDisplacedName = fallen.name();
                actorId = fallen.actorId();
                $gameParty.removeActor(actorId);
            }
        }
        $gameVariables.setValue(29, $gameParty.members().length);

        if (!actorId) {
            // Three on the road is the ceiling, but a fourth is not turned away:
            // they sign on INACTIVE and wait on the Dynamics board, where the
            // player calls them up whenever a slot opens. Everything else about
            // the recruitment happens exactly as it would have.
            return benchRecruit(eventId, event);
        }

        const eventName     = npcNameOf(event);
        const gender        = parseGenderFromNote(event.event().note);
        const selfSwitchKey = [$gameMap.mapId(), eventId, 'A'];

        AudioManager.playMe({ name: "Victory2", volume: 90, pitch: 100, pan: 0 });
        showJoinMessage();
        transformActor(actorId);                           // name, class, level, graphics, skills
        transferNPCNeeds(actorId, eventName);
        // The profile is the record of who they are; the note only answers for
        // an NPC nobody ever wrote a profile for (carryIdentityToActor).
        const joinedActor = $gameActors.actor(actorId);
        const joinGender = joinedActor?.gender ? joinedActor.gender() : gender;
        $gameVariables.setValue(actorId === 2 ? 39 : 40, joinGender);
        $gameParty.addActor(actorId);                      // adds to party (Wiki party tab reads members())
        syncSeatReproductionVar(joinedActor);              // seat-owned, so only now
        grantNPCPossessions(eventName);                    // money on hand + owned items -> party
        equipNPCActor(actorId, eventName);
        callThoughtsMenuMarkov(actorId, markovString);
        registerNPCHouse(eventName);                       // owned/resided house -> Assets + build rights
        $gameSelfSwitches.setValue(selfSwitchKey, true);
        // ...and record the loss in the world folder, so this person is gone
        // from every savegame of the world rather than only from this one
        // (NPCSystem.js, GoneRegistry). The procedural map records its own
        // recruits per world tile, further down.
        window.NPCGone?.record($gameMap.mapId(), eventId, eventName, 'joined');

        // The event is now hidden behind its blank page-2 (self-switch A), so drop
        // its roaming NPCController. Otherwise the controller keeps driving the
        // hidden event and NPCSystem's stale-flag cleanup would later clear the
        // self-switch and resurrect the recruited NPC on the map as a duplicate.
        if (Array.isArray($gameSystem?.npcControllers)) {
            $gameSystem.npcControllers = $gameSystem.npcControllers.filter(c => !(c && c.eventId === eventId));
        }

        // On the procedural map (636), self-switches are keyed by eventId only and
        // so leak across every world tile that reuses map 636; worse, the map is
        // rebuilt from scratch on each visit, clearing the self-switch entirely.
        // Instead, cache this recruit in the world folder keyed by (worldX, worldY,
        // eventId) so it is erased on every future regeneration of this tile and
        // never respawns.
        window.NPCSystem?.recordProceduralRecruit?.(eventId, eventName);

        return true;
    }

    // Somebody met in the halls, the vault, the ship or a house the party
    // owns, asked to come along. The Dynamics board calls the same thing a
    // recall; out here it is a conversation, so it says how it went.
    function lodgerJoinParty(name) {
        const LG = window.PartyLodging;
        if (!LG || !name) return false;
        const result = LG.rejoin(name);
        if (result && result.ok) {
            AudioManager.playMe({ name: "Victory2", volume: 90, pitch: 100, pan: 0 });
            window.skipLocalization = true;
            $gameMessage.add(T('NPCParty.joinsParty', { name }));
            window.skipLocalization = false;
            if ($gameVariables) $gameVariables.setValue(29, $gameParty.members().length);
            return true;
        }
        const reason = result ? result.reason : "";
        if (window.ParchmentToast) {
          window.ParchmentToast.show(reason === "partyFull"
            ? T('NPCParty.partyFull')
            : T('NPCParty.lodging.cannotJoin', { name }), {
            severity: 'warning'
          });
        }
        return false;
    }

    // The scratch slot a bench recruit's sheet is built on: one of the map-battle
    // ally actors (BattleSystem/MapBattleMode.js), never in the party outside a
    // fight, and handed back blank the moment the dossier has been taken off it.
    const BENCH_SCRATCH_ACTOR_ID = 8;

    // Sign somebody on with no room left for them: their sheet is built on the
    // scratch slot, snapshotted into a world dossier (the same one benching a
    // companion writes) and dropped into the reserves. They leave the map,
    // and the world's books, exactly as a travelling recruit does.
    function benchRecruit(eventId, event) {
        const eventName = npcNameOf(event);
        const scratch = $gameActors.actor(BENCH_SCRATCH_ACTOR_ID);
        const bench = window.CharacterPresets && window.CharacterPresets.benchActorAsPreset;
        if (!bench || !scratch || $gameParty._actors.includes(BENCH_SCRATCH_ACTOR_ID)) {
            $gameTemp._npcJoinFailReason = 'partyFull'; // read by the Empathize panel
            if (!window._npcEmpathizeSilentJoin) {
                if (window.ParchmentToast) {
                  window.ParchmentToast.show(T('NPCParty.partyFull'), {
                    severity: 'warning'
                  });
                }
            }
            return false;
        }

        transformActor(BENCH_SCRATCH_ACTOR_ID);            // name, class, level, graphics, skills
        equipNPCActor(BENCH_SCRATCH_ACTOR_ID, eventName);
        const profile = window.NPCSocietyRegistry?.getProfile(eventName);
        const result = bench($gameActors.actor(BENCH_SCRATCH_ACTOR_ID), {
            // The slot itself says nothing about what this person is (switches
            // 77/78/79 only speak for Actors 1 to 3), so their own profile does.
            isCreature: !!window.NPCCreature?.isCreatureProfile?.(profile),
            lore: T('NPCParty.benchedLore', { name: eventName }),
        });
        // Scratch space, not a character: leave nothing of them on the slot.
        $gameActors._data[BENCH_SCRATCH_ACTOR_ID] = null;

        if (!result || !result.ok) {
            $gameTemp._npcJoinFailReason = 'partyFull';
            return false;
        }

        AudioManager.playMe({ name: "Victory2", volume: 90, pitch: 100, pan: 0 });
        grantNPCPossessions(eventName);                    // money on hand + owned items -> party
        registerNPCHouse(eventName);                       // owned/resided house -> Assets + build rights
        $gameSelfSwitches.setValue([$gameMap.mapId(), eventId, 'A'], true);
        window.NPCGone?.record($gameMap.mapId(), eventId, eventName, 'joined');
        if (Array.isArray($gameSystem?.npcControllers)) {
            $gameSystem.npcControllers = $gameSystem.npcControllers.filter(c => !(c && c.eventId === eventId));
        }
        window.NPCSystem?.recordProceduralRecruit?.(eventId, eventName);

        // Says how they signed on, so the Empathize panel can word its own
        // notice rather than claiming they are walking alongside the party.
        $gameTemp._npcJoinedInactive = true;
        if (!window._npcEmpathizeSilentJoin) {
            if (window.ParchmentToast) {
              window.ParchmentToast.show(T('NPCParty.joinedInactive', { name: eventName }), {
                severity: 'warning'
              });
            }
        }
        return true;
    }

    // A recruit's identity, copied out of their NPC profile and onto the actor
    // they now are. Every one of these fields has an actor-side reader that
    // answers with a default when nobody ever told it, so leaving them unset
    // silently rewrote the person (see the call site in transformActor).
    function carryIdentityToActor(actor, eventName, profile, event) {
        if (!actor) return;

        // Gender. The society profile is the record; the event note is what the
        // map was built with, and only answers when there is no profile.
        const noteGender = parseGenderFromNote(event?.event?.().note);
        const gender = profile?.gender ?? noteGender;
        if (actor.setGender) actor.setGender(gender);

        // The body they were rolled with, so the Bio page keeps showing the one
        // the player read on the map. The seat variable itself is written once
        // they hold a seat (syncSeatReproductionVar, after addActor).
        const code = window.NPCRolledGenitalCode?.(eventName, profile);
        if (code != null && actor.setReproductionType) actor.setReproductionType(code);

        // Blood type is rolled per NPC name AND world seed for a stranger, but
        // off a plain name hash for an actor: two different answers for one
        // person unless the stranger's is written down on the way in.
        const BTS = window.BloodTypeService;
        if (BTS && !actor._ccBloodType) {
            const blood = BTS.forNpc(eventName);
            const id = blood && (blood.id || blood.key);
            if (id && BTS.get?.(id)) actor._ccBloodType = id;
        }

        // Their means. A traveller spends out of the party purse, so the purse
        // is what their band is read from afterwards (NPCSociety), and a party
        // with nothing in it reported everybody they ever took on as destitute.
        // Recording the band they arrived with keeps it as the floor the same
        // way a band picked at character creation is kept.
        if (profile && profile.wealthTierChosen == null && profile.wealthTierBase != null) {
            profile.wealthTierChosen = profile.wealthTierBase;
        }
    }

    // The reproduction variable belongs to a SEAT (87 / 115 / 116 by party
    // index), so it can only be written once the recruit is sitting in one.
    function syncSeatReproductionVar(actor) {
        if (!actor || !$gameParty || !$gameVariables) return;
        const code = actor.reproductionType ? actor.reproductionType() : null;
        if (code == null) return;
        const members = $gameParty.allMembers ? $gameParty.allMembers() : [];
        const index = members.indexOf(actor);
        if (index < 0 || index > 2) return;
        const CCU = window.CharacterCreationUtils;
        const varId = CCU?.getReproductiveVariableId
            ? CCU.getReproductiveVariableId(index)
            : (index === 1 ? 115 : index === 2 ? 116 : 87);
        $gameVariables.setValue(varId, code);
    }

    function transformActor(actorId) {
        if (!$gameParty || !$gameMap || !$gameTemp) return;
        
        // Get the event that called this (triggering event)
        const eventId = $gameTemp.lastPluginCommandEventId || $gameMap._interpreter._eventId;
        if (!eventId) return;
        
        const event = $gameMap.event(eventId);
        if (!event) return;
        
        // Get Actor1 and target Actor
        const actor1 = $gameActors.actor(1);
        const targetActor = $gameActors.actor(actorId);
        if (!actor1 || !targetActor) return;
        
        // Check if note value is NPC-0 for random class mode
        let classId = 1; // Default class ID
        let randomClassMode = false;
        const noteData = event.event().note;
        if (noteData) {
            // Updated regex to match NPC-X format
            const match = noteData.match(/NPC-(\d+)/);
            if (match && match[1]) {
                const noteValue = parseInt(match[1]);
                if (noteValue === 0) {
                    // Enable random class mode
                    randomClassMode = true;
                    // Get a list of all valid classes (excluding ID 0)
                    const validClassIds = [];
                    for (let i = 1; i < $dataClasses.length; i++) {
                        if ($dataClasses[i]) {
                            validClassIds.push(i);
                        }
                    }
                    // Pick a random class
                    if (validClassIds.length > 0) {
                        classId = validClassIds[Math.floor(Math.random() * validClassIds.length)];
                    }
                } else {
                    classId = noteValue;
                }
            }
        }
        
        // Verify class exists
        if (!$dataClasses[classId]) {
            classId = 1; // Fallback to class 1 if invalid
        }
        
        // Apply changes to target actor properties
        targetActor._classId = classId;
        
        // The person at the event, not the sign over the counter
        const eventName = npcNameOf(event);

        // Only set name if not in random class mode
        if (!randomClassMode) {
            targetActor._name = eventName;
        }
        
        // Set target actor's character graphics to match the event's sprite
        const characterName = event.characterName();
        const characterIndex = event.characterIndex();
        if (characterName) {
            targetActor._characterName = characterName;
            targetActor._characterIndex = characterIndex;
        }
        
        // Use NPC profile level+exp if available, otherwise fall back to Actor1's level
        const _eventNameForLevel = npcNameOf(event);
        const _npcProfile = window.NPCSocietyRegistry?.getProfile(_eventNameForLevel);
        const newLevel = _npcProfile?.level ?? actor1._level;
        const newExp   = _npcProfile?.exp   ?? targetActor.expForLevel(newLevel);
        targetActor._level = newLevel;
        targetActor._exp[targetActor._classId] = newExp;

        // Learn all class skills up to NPC's level
        const _joinClass = $dataClasses?.[targetActor._classId];
        if (_joinClass) {
          for (const _learning of (_joinClass.learnings || [])) {
            if (_learning.level <= newLevel) targetActor.learnSkill(_learning.skillId);
          }
        }
        // Learn NPC's personal skills
        if (_npcProfile?.skillIds?.length) {
          for (const _sid of _npcProfile.skillIds) targetActor.learnSkill(_sid);
        }

        // A creature that joins the party brings its body with it. Its class is
        // one of the non-sentient ones (NPCCreature owns that boundary), and for
        // a creature the parts themselves are its stats - the anatomy has to be
        // built out of its archetype before the numbers mean anything
        // (Health_Core.creatureAnatomyBonus), exactly as creature mode does in
        // character creation.
        const _NC = window.NPCCreature;
        if (_NC && _NC.isNonSentientClassId && _NC.isNonSentientClassId(targetActor._classId)) {
            targetActor._isCreatureActor = true;
            const _keys = _NC.archetypeKeysOf(_npcProfile) || [];
            const _archetype = _keys[0];
            if (_archetype && window.changeArchetypeForActor) {
                try { window.changeArchetypeForActor(targetActor, _archetype); } catch (e) { /* anatomy layer not up */ }
            } else if (window.initializeBodyParts) {
                try { window.initializeBodyParts(targetActor); } catch (e) { /* anatomy layer not up */ }
            }
        }

        // Who this person IS travels with them. Everything below used to be
        // read off the actor by the panels, the status sheet and the biologic
        // simulation, and an actor that had never been told answered with its
        // default: gender 0 (Male), reproduction 0 (Testes), a blood type
        // re-rolled off a different seed than the stranger's, and a wealth band
        // read out of an empty purse. So the person the player had been talking
        // to was partly overwritten the moment they signed on.
        carryIdentityToActor(targetActor, eventName, _npcProfile, event);

        // Refresh actor to apply changes
        targetActor.refresh();

        // Apply NPC profile HP/MP (clamped to actor max after refresh)
        if (_npcProfile) {
            if (_npcProfile.mhp !== undefined)
                targetActor._hp = Math.min(_npcProfile.mhp, targetActor.mhp);
            if (_npcProfile.mmp !== undefined)
                targetActor._mp = Math.min(_npcProfile.mmp, targetActor.mmp);
        }
    }
    
    function showGreetingMessage() {
        if (!$gameMap || !$gameTemp) return;
        
        // Get the event that called this command
        const eventId = $gameTemp.lastPluginCommandEventId || $gameMap._interpreter._eventId;
        if (!eventId) return;
        
        const event = $gameMap.event(eventId);
        if (!event) return;
        
        // The person at the event, not the sign over the counter
        const eventName = npcNameOf(event);

        // Get class from event note
        let className = "Unknown";
        const noteData = event.event().note;
        if (noteData) {
            // Updated regex to match NPC-X format
            const match = noteData.match(/NPC-(\d+)/);
            if (match && match[1]) {
                const classId = parseInt(match[1]);
                // If class ID is 0, we need to use the current class of the last transformed actor
                if (classId === 0) {
                    // Attempt to get actor2 first, then actor3 if actor2 isn't available
                    const actor = $gameActors.actor(2) || $gameActors.actor(3);
                    if (actor) {
                        className = actor.currentClass().name;
                    }
                } else if ($dataClasses[classId]) {
                    // Otherwise use the class from the note
                    className = $dataClasses[classId].name;
                }
            }
        }
        window.skipLocalization = true;

        // Show the greeting message
        const message = T('NPCParty.introduce', { name: eventName, className: className });

        $gameMessage.add(message);
        window.skipLocalization = false;

    }
    
    // Exposed so NPCEmpathize can call directly instead of going through
    // PluginManager._commands (which is fragile across MZ versions).
    window._NPCSystemPartyJoin = joinParty;

    function showJoinMessage() {
        if (window._npcEmpathizeSilentJoin) return; // empathize panel handles the message itself
        if (!$gameMap || !$gameTemp) return;

        // Get the event that called this command
        const eventId = $gameTemp.lastPluginCommandEventId || $gameMap._interpreter._eventId;
        if (!eventId) return;
        
        const event = $gameMap.event(eventId);
        if (!event) return;
        
        // The person at the event, not the sign over the counter
        const eventName = npcNameOf(event);

        // Show the join message
        window.skipLocalization = true;
        const message = T('NPCParty.joinsParty', { name: eventName });
        $gameMessage.add(message);
        window.skipLocalization = false;

    }

    // -------------------------------------------------------------------------
    // Story Follower: Bubba following Em's party even when not in active party
    // -------------------------------------------------------------------------
    function getBubbaActor() {
        if (typeof $gameActors !== 'undefined' && $gameActors) {
            for (let i = 1; i <= 3; i++) {
                const a = $gameActors.actor(i);
                if (a && a.name && a.name() === 'Bubba') return a;
            }
            const any = ($gameActors._data || []).find(a => a && a.name && a.name() === 'Bubba');
            if (any) return any;
            const a2 = $gameActors.actor(2);
            if (a2) return a2;
        }
        return null;
    }

    function Game_BubbaFollower() {
        this.initialize(...arguments);
    }

    Game_BubbaFollower.prototype = Object.create(Game_Follower.prototype);
    Game_BubbaFollower.prototype.constructor = Game_BubbaFollower;

    Game_BubbaFollower.prototype.initialize = function(memberIndex) {
        Game_Follower.prototype.initialize.call(this, memberIndex);
    };

    Game_BubbaFollower.prototype.isStoryMode = function() {
        return !!(window.$gameSwitches && $gameSwitches.value(100));
    };

    Game_BubbaFollower.prototype.isBubbaInParty = function() {
        return !!($gameParty && $gameParty.members && $gameParty.members().some(m => m && m.name && m.name() === 'Bubba'));
    };

    // He only walks behind the party once he has actually travelled with it and
    // been benched. A story run that has never taken him on has no Bubba in it
    // at all, so nobody trails Em out of the opening.
    Game_BubbaFollower.prototype.hasTravelled = function() {
        // i18n-ignore: actor name, matched at runtime
        return pastPartyList().some(entry => entry && entry.name === 'Bubba');
    };

    Game_BubbaFollower.prototype.isVisible = function() {
        if (!this.isStoryMode()) return false;
        if (this.isBubbaInParty()) return false;
        if (!this.hasTravelled()) return false;
        return !!($gamePlayer && $gamePlayer.followers && $gamePlayer.followers().isVisible());
    };

    Game_BubbaFollower.prototype.actor = function() {
        if (!this.isVisible()) return null;
        return getBubbaActor();
    };

    Game_BubbaFollower.prototype.refresh = function() {
        if (this.isVisible()) {
            const a = this.actor();
            const charName = a ? a.characterName() : "NPCs/!$Bubba1";
            const charIndex = a ? a.characterIndex() : 0;
            this.setImage(charName, charIndex);
        } else {
            this.setImage("", 0);
        }
    };

    Game_BubbaFollower.prototype.chaseCharacter = function(character) {
        if (!this.isVisible()) return;
        let target = character;
        if (!target || !target.isVisible || !target.isVisible()) {
            const followers = ($gamePlayer && $gamePlayer.followers()) ? $gamePlayer.followers().data() : [];
            const myIndex = followers.indexOf(this);
            target = $gamePlayer;
            for (let i = myIndex - 1; i >= 0; i--) {
                const f = followers[i];
                if (f && f.isVisible && f.isVisible()) {
                    target = f;
                    break;
                }
            }
        }
        Game_Follower.prototype.chaseCharacter.call(this, target);
    };

    window.Game_BubbaFollower = Game_BubbaFollower;

    Game_Followers.prototype.ensureBubbaFollower = function() {
        if (!this._data) this._data = [];
        if (!this._data.some(f => f instanceof Game_BubbaFollower)) {
            const bf = new Game_BubbaFollower(this._data.length);
            if (typeof $dataMap !== "undefined" && $dataMap &&
                typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer.locate) {
                bf.locate($gamePlayer.x, $gamePlayer.y);
            }
            this._data.push(bf);
        }
    };

    const _Game_Followers_setup_bubba = Game_Followers.prototype.setup;
    Game_Followers.prototype.setup = function() {
        _Game_Followers_setup_bubba.call(this);
        this.ensureBubbaFollower();
    };

    const _Spriteset_Map_createCharacters_bubba = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function() {
        if ($gamePlayer && $gamePlayer.followers()) {
            $gamePlayer.followers().ensureBubbaFollower();
        }
        _Spriteset_Map_createCharacters_bubba.call(this);
    };
})();