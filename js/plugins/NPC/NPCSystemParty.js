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
    };

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
        const died = !!(actor && actor.isDead());
        // Somebody away on a work shift (Work/WorkSystem.js) has not left the
        // party, they are out for the afternoon: no departure is written.
        const working = $gameTemp && $gameTemp._workShiftActorId === actorId;
        _Game_Party_removeActor.call(this, actorId);
        if (!wasInParty || actorId === 1 || isSummonProxy(actorId) || working) return;
        recordDeparture(actor, retiring ? "retired" : (died ? "died" : "left"));
    };

    // ========================================================================
    // PARTY ROSTER API (Dynamics menu, CustomMainMenuLayout.js)
    // ========================================================================

    window.PartyRoster = {
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
        let actorId = 0;
        if ($gameSwitches.value(67)) {
            actorId = $gameParty._actors.includes(3) ? 0 : 3;
        } else if (!$gameParty._actors.includes(2)) {
            actorId = 2;
        } else if (!$gameParty._actors.includes(3)) {
            actorId = 3;
        } else {
            // Every companion slot is taken, but somebody who fell and was never
            // brought back is not travelling any more. Their body is left where
            // it is (the removal hook files them as a death in the roster
            // history) and the recruit takes the slot, so a party that lost a
            // member in a run without permadeath can still take someone on.
            const fallen = [2, 3]
                .map(id => $gameActors.actor(id))
                .find(a => a && $gameParty._actors.includes(a.actorId()) && a.isDead());
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
        $gameVariables.setValue(actorId === 2 ? 39 : 40, gender);
        $gameParty.addActor(actorId);                      // adds to party (Wiki party tab reads members())
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
                window.skipLocalization = true;
                $gameMessage.add(T('NPCParty.partyFull'));
                window.skipLocalization = false;
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
            window.skipLocalization = true;
            $gameMessage.add(T('NPCParty.joinedInactive', { name: eventName }));
            window.skipLocalization = false;
        }
        return true;
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

    Game_BubbaFollower.prototype.isVisible = function() {
        if (!this.isStoryMode()) return false;
        if (this.isBubbaInParty()) return false;
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