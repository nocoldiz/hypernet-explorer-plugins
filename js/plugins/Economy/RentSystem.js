/*:
 * @target MZ
 * @plugindesc Rent System v1.1.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help RentSystem.js
 *
 * @command rent
 * @text Rent Location
 * @desc Rent a location for 24 hours
 * @arg price
 * @text Price
 * @desc Price in gold to rent the location
 * @type number
 * @default 1000
 *
 * @command showRoomList
 * @text Show Room List
 * @desc Display all rentable rooms (events named "Room") on the current map with prices and remaining time. Player can remotely rent rooms.
 *
 * This plugin allows players to rent locations for 24 hours using real time.
 *
 * Setting Up Rooms:
 * - Create events named exactly "Room" (case-insensitive)
 * - Optionally set price in event note: <price:2000> (default: 1000 gold)
 * - When rented, self switch A will be turned ON for that event
 * When the rent command is called, it will show a confirmation window.
 * If accepted, self switch A will be turned ON for 24 hours.
 * * One bed, one party: a booking is written to the world folder
 * (save/worlds/<name>/rentals.json) with the renting party's leader, so no
 * other savegame of the same world can take that room for the day. They are
 * told "Already booked by <leader>'s party" instead, in the room list and at
 * the door. The booking runs on game time (variable 114) and lapses after 24
 * game-hours, at the same moment the rental itself does.
 * * Price conversion: 1000 gold = 10€
 * * The switch will only change on map transfers, not when loading saves
 * to prevent players from getting stuck in rented areas.
 * * Directional Access:
 * Add one of these letters in event notes to enable free access from that direction:
 * - N: Access from North (player approaches from below)
 * - S: Access from South (player approaches from above)  
 * - W: Access from West (player approaches from right)
 * - E: Access from East (player approaches from left)
 * * Plugin Commands:
 * - Rent: Shows rent confirmation and processes payment
 * - Show Room List: Displays all available rooms on the current map with prices, names, and remaining rental time.
 *   Player can remotely rent or view details for each room.
 */

(() => {
    'use strict';

    // Plugin name for data storage
    const PLUGIN_NAME = 'RentSystem';

    // Gate verbose rental logs so they don't spam the console every tick.
    const DEBUG = false;
    const debugLog = (...args) => { if (DEBUG) console.log(...args); };

    //=============================================================================
    // i18n
    //=============================================================================
    let _rentI18n = null;

    const _loadRentI18n = async () => {
        const lang = ConfigManager.language || 'en';
        const url = `js/i18n/${lang}/rent.json`;
        try {
            const response = await fetch(url);
            _rentI18n = await response.json();
        } catch (e) {
            console.error('RentSystem: Failed to load i18n data from ' + url, e);
        }
    };

    // Resolve a key under rent.* (e.g. 'rented', 'cancel')
    function _ri18n(key) {
        if (_rentI18n && _rentI18n.rent && typeof _rentI18n.rent[key] === 'string') {
            return _rentI18n.rent[key];
        }
        console.warn(`RentSystem: Missing i18n key: ${key}`);
        return key;
    }

    // Load on boot
    _loadRentI18n();

    // Transient rent feedback: a toast rather than a message box, so paying for
    // a room does not interrupt the map.
    function rentToast(key, params, opts) {
        if (!window.ParchmentToast) return;
        window.ParchmentToast.show(T(key, params || {}), opts || {});
    }

    function toastRented(roomName) {
        rentToast('Rent.toast.rented', { name: roomName || T('Rent.toast.room') }, { severity: 'info', duration: 150 });
    }

    function toastNoFunds() {
        SoundManager.playBuzzer();
        rentToast('Rent.toast.notEnough', null, { severity: 'warning', duration: 150 });
    }


    // Initialize rental system
    function initializeRentals() {
        if (!$dataSystem.rentals) {
            $dataSystem.rentals = {};
        }
    }

    //=============================================================================
    // World-shared bookings
    //=============================================================================
    // A room is one bed in one inn, and an inn is part of the world rather than
    // part of a story: once a party has taken a room for the night, no OTHER
    // savegame of the same world can take it until the day is up. It is told who
    // holds it ("Already booked by <leader>'s party"), which is the only reason
    // the leader's name is written down beside the booking.
    //
    //   save/worlds/<name>/rentals.json
    //     -> { rooms: { "<placeKey>_<eventId>": { party, leader, until } } }
    //
    // `until` is counted in game minutes (variable 114), which is world-shared
    // and monotonic, so every savegame agrees on when the night is over. The
    // party's own rental stays where it was, in the savegame ($dataSystem
    // .rentals): this table only says which room is spoken for, and by whom.
    const BOOKING_MINUTES = 24 * 60; // a booking holds the room for one day

    function bookingRooms(create) {
        if (!window.WorldManager || typeof window.WorldManager.getFile !== 'function') return null;
        let store = null;
        try { store = window.WorldManager.getFile('rentals'); } catch (e) { return null; }
        if (!store) return null;
        if (!store.rooms) {
            if (!create) return null;
            store.rooms = {};
        }
        return store.rooms;
    }

    function flushBookings() {
        if (window.WorldManager && typeof window.WorldManager.flush === 'function') {
            try { window.WorldManager.flush('rentals'); } catch (e) { /* non-fatal */ }
        }
    }

    // Map ids are not always places (map 636 is every procedural world square),
    // so a booking is keyed by the composite map key every world-persistent
    // system uses, and falls back to the plain map id everywhere else.
    function roomPlaceKey(mapId) {
        const here = $gameMap ? $gameMap.mapId() : 0;
        const id = (mapId != null) ? mapId : here;
        let key = String(id);
        const fs = window.FurnitureSystem;
        if (id === here && fs && typeof fs.furnitureMapKey === 'function') {
            try {
                const k = fs.furnitureMapKey();
                if (k != null) key = String(k);
            } catch (e) { /* fall back to the plain map id */ }
        }
        return key;
    }

    function bookingKey(mapId, eventId) {
        return `${roomPlaceKey(mapId)}_${eventId}`;
    }

    // Who this savegame's party is, as far as the world folder is concerned. The
    // id is minted once and kept in the save, so a party keeps its own bookings
    // across sessions while every other savegame reads them as somebody else's.
    function partyBookingId() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
        if (!$gameSystem._rentPartyId) {
            $gameSystem._rentPartyId = 'party-' + Date.now().toString(36) + '-' +
                Math.floor(Math.random() * 0x1000000).toString(36);
        }
        return $gameSystem._rentPartyId;
    }

    function partyLeaderName() {
        const leader = ($gameParty && $gameParty.leader) ? $gameParty.leader() : null;
        return (leader && leader.name()) ? leader.name() : T('Rent.someoneElse');
    }

    // The live booking on a room, expired ones swept as they are read.
    function getBooking(mapId, eventId) {
        const rooms = bookingRooms(false);
        if (!rooms) return null;
        const key = bookingKey(mapId, eventId);
        const rec = rooms[key];
        if (!rec) return null;
        const now = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
        // A stay paid for by the day runs longer than one night, so the
        // clock-rollback guard is measured against the length that was booked.
        const held = rec.minutes || BOOKING_MINUTES;
        if (rec.until == null || now >= rec.until || now < rec.until - held) {
            delete rooms[key]; // the night is over (or the clock rolled back)
            return null;
        }
        return rec;
    }

    // A booking held by a party that is not this savegame's, or null.
    function foreignBooking(mapId, eventId) {
        const rec = getBooking(mapId, eventId);
        if (!rec || rec.party === partyBookingId()) return null;
        return rec;
    }

    // What to tell a party that wants a room somebody else is sleeping in.
    function bookedByMessage(rec) {
        return T('Rent.bookedBy', { name: (rec && rec.leader) || T('Rent.someoneElse') });
    }

    function showBookedMessage(rec) {
        window.skipLocalization = true;
        $gameSystem._rentHideBust = true;
        $gameMessage.add(bookedByMessage(rec));
        window.skipLocalization = false;
    }

    function recordBooking(mapId, eventId, minutes) {
        const rooms = bookingRooms(true);
        if (!rooms) return;
        const now = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
        const held = minutes || BOOKING_MINUTES;
        rooms[bookingKey(mapId, eventId)] = {
            party: partyBookingId(),
            leader: partyLeaderName(),
            minutes: held,
            until: now + held
        };
        // Written through immediately so another savegame of the world sees the
        // room taken without waiting for this one to be saved.
        flushBookings();
    }

    // Pushes this party's own booking further out when the stay is paid on for
    // more days. Another party's booking is never touched.
    function extendBooking(mapId, eventId, storedKey, extraMinutes) {
        const rooms = bookingRooms(false);
        if (!rooms) return;
        const key = storedKey || bookingKey(mapId, eventId);
        const rec = rooms[key];
        if (!rec || rec.party !== partyBookingId()) return;
        rec.minutes = (rec.minutes || BOOKING_MINUTES) + extraMinutes;
        rec.until = (rec.until || 0) + extraMinutes;
        flushBookings();
    }

    // Gives the room back when this party's own rental runs out. Another party's
    // booking is never touched: it expires on its own clock.
    function releaseBooking(mapId, eventId, storedKey) {
        const rooms = bookingRooms(false);
        if (!rooms) return;
        const key = storedKey || bookingKey(mapId, eventId);
        const rec = rooms[key];
        if (!rec || rec.party !== partyBookingId()) return;
        delete rooms[key];
        flushBookings();
    }

    //=============================================================================
    // Empty-world rooms
    //=============================================================================
    // Nobody is left to take rent, and nobody is left to lock up again either.
    // A room's own door was simply left however it was left: a seeded coin flip
    // decides, once and for all, whether this particular room happens to be
    // open or happens to be stuck (mirrors ProceduralHouseSystem's empty-world
    // doors). No message is ever shown here: there is nobody to ask, and
    // nobody to answer to.
    const EMPTY_WORLD_UNLOCKED_SHARE = 0.5; // half the rooms were left open

    function seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    function getWorldSeed() {
        if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
            return window.HistoryManager.getSeed() >>> 0;
        }
        if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._historySeed !== undefined) {
            return $gameSystem._historySeed >>> 0;
        }
        return 19002001;
    }

    // A pure function of (place, event, world seed), so one door gives the
    // same answer forever and in every savegame of the world.
    function isEmptyWorldRoomOpen(mapId, eventId) {
        const event = $dataMap && $dataMap.events ? $dataMap.events[eventId] : null;
        const x = event ? event.x : 0;
        const y = event ? event.y : 0;
        const seed = ((mapId * 1000000 + x * 1000 + y) ^ getWorldSeed() ^ 0x00be9d00) >>> 0;
        return seededRandom(seed) < EMPTY_WORLD_UNLOCKED_SHARE;
    }

    // Called instead of the whole rent/booking flow in an empty world: no
    // price, no confirmation, no booking record. A room already left unlocked
    // is simply walked into; a locked one is kicked open on the spot, since
    // there is nobody left to ask permission from. Either way self switch A
    // is set and never expires (no $dataSystem.rentals entry is written), so
    // the room stays open for good, exactly as ProceduralHouseSystem's forced
    // doors never relock in an empty world.
    function handleEmptyWorldRent(mapId, eventId) {
        const key = [mapId, eventId, 'A'];
        if ($gameSelfSwitches.value(key)) return; // already standing open

        if (!isEmptyWorldRoomOpen(mapId, eventId)) {
            // Locked, and nobody is left to answer to: the door gets bashed in.
            AudioManager.playSe({ name: "Crash", volume: 100, pitch: 100, pan: 0 });
        }
        $gameSelfSwitches.setValue(key, true);
        $gameMap.requestRefresh();
    }

    // Function to get player's approach direction to an event
    function getApproachDirection(eventX, eventY) {
        const playerX = $gamePlayer.x;
        const playerY = $gamePlayer.y;

        const dx = eventX - playerX;
        const dy = eventY - playerY;

        // Determine which direction has the larger difference
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'W' : 'E'; // Player is West or East of event
        } else {
            return dy > 0 ? 'N' : 'S'; // Player is North or South of event
        }
    }

    // Function to check if event allows free access from current direction
    function checkDirectionalAccess(eventId) {
        const event = $dataMap.events[eventId];
        if (!event || !event.note) return false;

        const eventX = event.x;
        const eventY = event.y;
        const playerX = $gamePlayer.x;
        const playerY = $gamePlayer.y;

        // Check if player is on the same tile as the event or adjacent
        const dx = eventX - playerX;
        const dy = eventY - playerY;
        const distance = Math.abs(dx) + Math.abs(dy);

        if (distance > 1) {
            debugLog(`Event ${eventId}: Player too far from event (distance: ${distance})`);
            return false;
        }

        const approachDirection = getApproachDirection(eventX, eventY);

        // Check if the event note contains the approach direction letter
        const hasDirectionalAccess = event.note.toUpperCase().includes(approachDirection);

        debugLog(`Event ${eventId}: Player at (${playerX},${playerY}), Event at (${eventX},${eventY})`);
        debugLog(`Approach direction: ${approachDirection}, Note: "${event.note}", Access granted: ${hasDirectionalAccess}`);

        return hasDirectionalAccess;
    }

    //=============================================================================
    // Room List Overlay, HTML parchment panel overlaid on Scene_Map
    //=============================================================================

    Scene_Map.prototype.showRoomListOverlay = function () {
        if (this._roomListEl) return;
        const rooms = getRoomsOnCurrentMap();
        if (!rooms.length) return;

        this._roomListRooms = rooms;
        this._roomListIdx   = 0;

        const el = document.createElement('div');
        el.id        = 'rent-room-list';
        el.className = 'html-parchment-overlay';
        document.body.appendChild(el);
        this._roomListEl = el;

        // Delegation listeners persist across innerHTML rebuilds
        el.addEventListener('mouseover', ev => {
            const row = ev.target.closest('.rent-room-entry');
            if (!row) return;
            const idx = parseInt(row.dataset.idx, 10);
            if (!isNaN(idx) && idx !== this._roomListIdx) {
                this._roomListIdx = idx;
                this._updateRoomListHighlight();
                this.panMapToRoomEvent(idx);
            }
        });
        el.addEventListener('click', ev => {
            const row = ev.target.closest('.rent-room-entry');
            if (!row) return;
            this._roomListIdx = parseInt(row.dataset.idx, 10);
            this.onRoomListOverlayOk();
        });

        this._buildRoomListHTML();
        this._createRoomArrow();
        this.panMapToRoomEvent(0);
    };

    Scene_Map.prototype._buildRoomListHTML = function () {
        if (!this._roomListEl) return;
        const rooms = this._roomListRooms || [];
        const rows = rooms.map((room, i) => {
            const sel = i === this._roomListIdx ? ' selected' : '';
            let statusHTML;
            if (room.bookedBy) {
                // Another party of this world is sleeping in it tonight.
                statusHTML = `<span class="rent-status rent-rented">${T('Rent.bookedBy', { name: room.bookedBy })}</span>`;
            } else if (room.isRented) {
                const t = getTimeRemaining(room.expirationTime);
                statusHTML = `<span class="rent-status rent-rented">${_ri18n('rented')} · ${t}</span>`;
            } else {
                statusHTML = `<span class="rent-status rent-available">€${(room.price / 100).toFixed(2)}</span>`;
            }
            return `<div class="item-slot rent-room-entry${sel}" data-idx="${i}">
                <span class="rent-room-label">Room ${i + 1}</span>
                ${statusHTML}
            </div>`;
        }).join('');
        this._roomListEl.innerHTML = `
            <div class="inspect-section-title rent-list-title">${T('Rent.ui.rooms')}</div>
            ${rows}`;
        // Cache the status spans so the per-second tick can update just the
        // countdown text instead of rebuilding the whole list innerHTML.
        this._roomStatusEls = Array.prototype.map.call(
            this._roomListEl.querySelectorAll('.rent-room-entry'),
            row => row.querySelector('.rent-status')
        );
    };

    // Lightweight per-second refresh: update only the countdown text of rented
    // rooms, keeping element refs from the last full build.
    Scene_Map.prototype._refreshRoomListCountdowns = function () {
        const rooms = this._roomListRooms || [];
        const els = this._roomStatusEls || [];
        for (let i = 0; i < rooms.length; i++) {
            const room = rooms[i];
            const el = els[i];
            if (!room || !el || !room.isRented || room.bookedBy) continue;
            const t = getTimeRemaining(room.expirationTime);
            el.textContent = `${_ri18n('rented')} · ${t}`;
        }
    };

    Scene_Map.prototype._updateRoomListHighlight = function () {
        if (!this._roomListEl) return;
        this._roomListEl.querySelectorAll('.rent-room-entry').forEach((el, i) => {
            el.classList.toggle('selected', i === this._roomListIdx);
        });
    };

    Scene_Map.prototype._createRoomArrow = function () {
        if (this._roomArrowSprite) return;
        const aw = 32, ah = 22;
        const bitmap = new Bitmap(aw, ah);
        const ctx = bitmap.context;
        ctx.fillStyle   = '#ffff66';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.moveTo(aw / 2, ah - 1);
        ctx.lineTo(1, 1);
        ctx.lineTo(aw - 1, 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        bitmap._baseTexture.update();
        const sprite = new Sprite(bitmap);
        sprite.anchor.set(0.5, 1.0);
        this._roomArrowSprite = sprite;
        this._roomArrowTick   = 0;
        const idx = this.children.indexOf(this._windowLayer);
        this.addChildAt(sprite, idx >= 0 ? idx : this.children.length);
    };

    Scene_Map.prototype.panMapToRoomEvent = function (index) {
        const rooms = this._roomListRooms || getRoomsOnCurrentMap();
        const room  = rooms[index];
        if (!room) return;
        const event = $dataMap.events[room.eventId];
        if (!event) return;
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        $gameMap.setDisplayPos(event.x - (Graphics.boxWidth  / tw - 1) / 2,
                               event.y - (Graphics.boxHeight / th - 1) / 2);
        if (this._spriteset && this._spriteset.revealCircularArea) {
            this._spriteset.revealCircularArea(event.x, event.y, 6);
        }
    };

    Scene_Map.prototype.onRoomListOverlayOk = function () {
        const rooms = this._roomListRooms || [];
        const room  = rooms[this._roomListIdx];
        if (!room) return;
        // Re-read the booking rather than trusting the row: the list is scanned
        // once when the overlay opens, and another savegame may have taken the
        // room since (the world file is written the moment they do).
        const booked = foreignBooking(room.mapId, room.eventId);
        if (booked) {
            showBookedMessage(booked);
            return;
        }
        if (room.isRented) {
            window.skipLocalization = true;
            $gameSystem._rentHideBust = true;
            $gameMessage.add(_ri18n('already_rented'));
            window.skipLocalization = false;
            return;
        }
        if ($gameParty.gold() >= room.price) {
            $gameParty.loseGold(room.price);
            processRental(`${room.mapId}_${room.eventId}`, room.mapId, room.eventId);
            SoundManager.playShop();
            toastRented(room.name);
            this.closeRoomListOverlay();
        } else {
            toastNoFunds();
        }
    };

    Scene_Map.prototype.closeRoomListOverlay = function () {
        if (this._roomListEl) {
            this._roomListEl.remove();
            this._roomListEl = null;
        }
        if (this._roomArrowSprite) {
            this._roomArrowSprite.parent.removeChild(this._roomArrowSprite);
            this._roomArrowSprite.destroy();
            this._roomArrowSprite = null;
        }
        $gameSystem._roomListClosed = true;
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        $gameMap.setDisplayPos($gamePlayer.x - (Graphics.boxWidth  / tw - 1) / 2,
                               $gamePlayer.y - (Graphics.boxHeight / th - 1) / 2);
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) scene._bustManager.hideBusts();
    };

    // Interpreter wait mode so the event pauses while the overlay is open
    //=============================================================================

    const _Game_Interpreter_updateWaitMode_rent = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function () {
        if (this._waitMode === 'roomList') {
            if ($gameSystem._roomListClosed) {
                $gameSystem._roomListClosed = false;
                this._waitMode = '';
                return false;
            }
            return true;
        }
        return _Game_Interpreter_updateWaitMode_rent.call(this);
    };

    // Register plugin command
    PluginManager.registerCommand(PLUGIN_NAME, "rent", args => {

        // Renting is an arrangement with a landlord, and there is no landlord
        // left in an empty world. No prompt is shown at all: the room's lock
        // is simply whatever it was left as (or forced open on the spot), see
        // handleEmptyWorldRent. See WorldManager.populationMode.
        const WM = window.WorldManager;
        if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) {
            const interpreter = $gameMap._interpreter;
            const eventId = interpreter._eventId || interpreter.eventId();
            if (eventId) handleEmptyWorldRent($gameMap.mapId(), eventId);
            return;
        }

        const price = parseInt(args.price) || 1000;

        // Get current event ID more reliably
        const interpreter = $gameMap._interpreter;
        const eventId = interpreter._eventId || interpreter.eventId();
        const mapId = $gameMap.mapId();

        if (!eventId) {
            window.skipLocalization = true;
            $gameSystem._rentHideBust = true;
            $gameMessage.add(_ri18n('error_event_id'));
            window.skipLocalization = false;

            return;
        }

        // Reveal fog of war around this room
        const _rentEvent = $dataMap.events[eventId];
        if (_rentEvent) {
            const scene = SceneManager._scene;
            if (scene && scene._spriteset && scene._spriteset.revealCircularArea) {
                scene._spriteset.revealCircularArea(_rentEvent.x, _rentEvent.y, 6);
            }
        }

        // Check for directional access first
        if (checkDirectionalAccess(eventId)) {
            // Free access granted based on direction
            const eventName = $dataMap.events[eventId]?.name || 'Location';  // i18n-ignore  event-name read, matched not shown
            processDirectionalAccess(mapId, eventId);
            window.skipLocalization = true;
            $gameSystem._rentHideBust = true;
            $gameMessage.add(`${_ri18n('free_access_granted')} ${eventName}!`);
            window.skipLocalization = false;

            return;
        }

        const eventKey = mapId + '_' + eventId;
        const eventName = $dataMap.events[eventId]?.name || 'Location';  // i18n-ignore  event-name read, matched not shown

        // The room may belong to another savegame's party for the night. Their
        // booking is read before the price is ever quoted, unless this party
        // is the one already renting it (then the confirmation restores
        // access). A room somebody else holds cannot be paid for, but it can
        // still be bashed in, so the booking is passed into the confirmation
        // rather than stopping the interaction outright.
        const rentedHere = $dataSystem.rentals[eventKey];
        const bookedRec = (rentedHere && rentedHere.active) ? null : foreignBooking(mapId, eventId);

        // Convert gold to euros (1000 gold = 10€)
        const priceInEuros = (price / 100).toFixed(2);

        showRentConfirmation(eventName, price, priceInEuros, eventKey, mapId, eventId, false, !!(rentedHere && rentedHere.active), bookedRec);
    });

    // Register plugin command for showing room list
    PluginManager.registerCommand(PLUGIN_NAME, "showRoomList", args => {
        const rooms = getRoomsOnCurrentMap();
        if (rooms.length === 0) {
            $gameMessage.add(T('Rent.noRooms'));
            return;
        }

        $gameSystem._roomListClosed = false;
        const scene = SceneManager._scene;
        if (scene && scene.showRoomListOverlay) {
            scene.showRoomListOverlay();
        }
        const interpreter = $gameMap._interpreter;
        if (interpreter) {
            interpreter.setWaitMode('roomList');
        }
    });

    // Function to process directional access (free access)
    function processDirectionalAccess(mapId, eventId) {
        // Turn on self switch A for the current event
        const key = [mapId, eventId, 'A'];
        $gameSelfSwitches.setValue(key, true);

        // Force refresh of the current event
        $gameMap.requestRefresh();

        debugLog(`Directional access granted: Event ${eventId} on Map ${mapId}, Switch key:`, key);
        debugLog('Self switch set to:', $gameSelfSwitches.value(key));
    }

    // Function to process already rented access (restore access without resetting timer)
    function processAlreadyRentedAccess(mapId, eventId) {
        // Turn on self switch A for the current event
        const key = [mapId, eventId, 'A'];
        $gameSelfSwitches.setValue(key, true);

        // Force refresh of the current event
        $gameMap.requestRefresh();

        debugLog(`Already rented access restored: Event ${eventId} on Map ${mapId}, Switch key:`, key);
        debugLog('Self switch set to:', $gameSelfSwitches.value(key));
    }

    // Bashing a room door always counts as breaking and entering (mirrors
    // ProceduralHouseSystem.bashDoor). It buys one day of access, exactly like
    // a paid rental, but nothing is paid and nobody else's booking is
    // disturbed: the room simply stops being locked to THIS party for the
    // day. Never reached in an empty world (see handleEmptyWorldRent, which
    // handles every empty-world interaction on its own, silently and for
    // good), so the crime is always filed here.
    function bashRoomDoor(mapId, eventId) {
        if (typeof CrimeSystem !== 'undefined' && CrimeSystem.addPresetCrime) {
            CrimeSystem.addPresetCrime("breakingAndEntering");
        }
        AudioManager.playSe({ name: "Crash", volume: 100, pitch: 100, pan: 0 });

        initializeRentals();
        const eventKey = mapId + '_' + eventId;
        const currentGameMinutes = $gameVariables.value(114) || 0;
        const expirationTime = Date.now() + (24 * 60 * 60 * 1000);
        $dataSystem.rentals[eventKey] = {
            mapId: mapId,
            eventId: eventId,
            startTime: Date.now(),
            expirationTime: expirationTime,
            expirationGameMinutes: currentGameMinutes + (24 * 60),
            forced: true,
            active: true
        };
        storeRentalStartTime(expirationTime);

        const key = [mapId, eventId, 'A'];
        $gameSelfSwitches.setValue(key, true);
        $gameMap.requestRefresh();
    }

    // Function to show rent confirmation window
    function showRentConfirmation(eventName, price, priceInEuros, eventKey, mapId, eventId, hasDirectionalAccess, isAlreadyRented, bookedRec) {
        const message = bookedRec ? bookedByMessage(bookedRec) : `${_ri18n('rent_question')} ${eventName}?`;
        const choices = [];
        const actions = [];

        if (hasDirectionalAccess) {
            choices.push(_ri18n('free_access')); actions.push('free');
        } else if (isAlreadyRented) {
            choices.push(_ri18n('already_rented')); actions.push('already');
        } else if (!bookedRec) {
            choices.push(`€${priceInEuros} ${_ri18n('for_24h_rent')}`); actions.push('pay');
        }
        // A door left unpaid for, or held by someone else's party, can still
        // be forced. Free access and an already-rented room need no bash.
        if (!hasDirectionalAccess && !isAlreadyRented) {
            choices.push(_ri18n('bash')); actions.push('bash');
        }
        choices.push(_ri18n('cancel')); actions.push('cancel');

        window.skipLocalization = true;
        $gameSystem._rentHideBust = true;
        $gameMessage.add(message);
        window.skipLocalization = false;

        $gameMessage.setChoices(choices, choices.length - 1, choices.length - 1);
        $gameMessage.setChoiceCallback(n => {
            const action = actions[n];
            window.skipLocalization = true;

            if (action === 'free') {
                processDirectionalAccess(mapId, eventId);
            } else if (action === 'already') {
                processAlreadyRentedAccess(mapId, eventId);
            } else if (action === 'pay') {
                if ($gameParty.gold() >= price) {
                    $gameParty.loseGold(price);
                    processRental(eventKey, mapId, eventId);
                    SoundManager.playShop();
                    toastRented(eventName);
                } else {
                    toastNoFunds();
                }
            } else if (action === 'bash') {
                bashRoomDoor(mapId, eventId);
            }
            // 'cancel' (or window dismissed): nothing happens.
            window.skipLocalization = false;
        });

    }

    //=============================================================================
    // Where a rented room is
    //=============================================================================
    // A room is remembered by its full address, taken the moment it is paid for:
    // the world square its building stands on (its <Coords> tag, or the square
    // the party last stood on) and the local tile of the room's own door, so the
    // rental can be read, and paid on, from anywhere in the world.
    function roomAddress(mapId, eventId) {
        const ev = ($gameMap && $gameMap.event) ? $gameMap.event(eventId) : null;
        const data = ($dataMap && $dataMap.events) ? $dataMap.events[eventId] : null;
        const x = ev ? ev.x : (data ? data.x : 0);
        const y = ev ? ev.y : (data ? data.y : 0);
        const WMT = window.WorldMapTransfer;
        let loc = { mapId: mapId, x: x, y: y, worldX: 0, worldY: 0 };
        if (WMT && typeof WMT.locate === 'function') {
            try { loc = WMT.locate(x, y); } catch (e) { /* keep the plain address */ }
        }
        // The settlement the square is called by, which is what a room inside a
        // procedural inn is named after ("Room at Alba Adriatica"). Asked of the
        // world square rather than of the interior map, since the house the room
        // is in has a map name of its own that says nothing about where it is.
        let place = '';
        if (WMT && typeof WMT.locationName === 'function') {
            try {
                place = WMT.locationName({
                    mapId: WMT.procMapId, worldX: loc.worldX, worldY: loc.worldY, interior: ''
                });
            } catch (e) { place = ''; }
        }
        if (!place && WMT && typeof WMT.placeName === 'function') {
            try { place = WMT.placeName(mapId, { x: loc.worldX, y: loc.worldY }); } catch (e) { place = ''; }
        }
        return {
            mapId: mapId,
            x: x,
            y: y,
            worldX: loc.worldX,
            worldY: loc.worldY,
            layer: loc.layer || 0,
            interior: loc.interior || '',
            place: place || ''
        };
    }

    function roomEventName(eventId) {
        const data = ($dataMap && $dataMap.events) ? $dataMap.events[eventId] : null;
        return (data && data.name) ? String(data.name) : '';  // i18n-ignore  event-name read
    }

    function roomEventPrice(eventId) {
        const data = ($dataMap && $dataMap.events) ? $dataMap.events[eventId] : null;
        const m = (data && data.note) ? data.note.match(/<price[:\s]*(\d+)>/i) : null;
        return m ? parseInt(m[1], 10) : 1000;
    }

    // Function to process the rental
    function processRental(eventKey, mapId, eventId) {
        initializeRentals(); // Ensure rentals object exists

        const currentTime = Date.now();
        const expirationTime = currentTime + (24 * 60 * 60 * 1000); // 24 hours in milliseconds
        // Expiry must use the SAME clock as the displayed countdown: game time
        // (var 114) over 1440 game-minutes. Real time (Date.now) and game time
        // run at different rates, so the two disagreed before.
        const currentGameMinutes = $gameVariables.value(114) || 0;
        const expirationGameMinutes = currentGameMinutes + (24 * 60);

        // Store rental information
        $dataSystem.rentals[eventKey] = {
            mapId: mapId,
            eventId: eventId,
            startTime: currentTime,
            expirationTime: expirationTime,
            expirationGameMinutes: expirationGameMinutes,
            // The world-folder key this rental booked the room under. Kept on the
            // record because the composite key is derived from the map the party
            // is STANDING on, and the rental is given back from wherever they
            // happen to be when it runs out.
            bookingKey: bookingKey(mapId, eventId),
            // Kept so the stay can be read, and paid on, from the assets menu
            // with the party nowhere near the room.
            roomName: roomEventName(eventId),
            price: roomEventPrice(eventId),
            place: roomAddress(mapId, eventId),
            days: 1,
            active: true
        };

        // Store game time when rental started (for TimeDateSystem compatibility)
        storeRentalStartTime(expirationTime);

        // Spoken for in the world folder, so no other savegame of this world can
        // take the same room tonight.
        recordBooking(mapId, eventId);

        // Turn on self switch A for the current event
        const key = [mapId, eventId, 'A'];
        $gameSelfSwitches.setValue(key, true);

        // Force refresh of the current event
        $gameMap.requestRefresh();

        debugLog(`Rental processed: Event ${eventId} on Map ${mapId}, Switch key:`, key);
        debugLog('Self switch set to:', $gameSelfSwitches.value(key));
    }

    // Function to check and update rental status
    function updateRentalStatus() {
        initializeRentals(); // Ensure rentals object exists

        const currentTime = Date.now();
        const currentGameMinutes = $gameVariables.value(114) || 0;
        let anyExpired = false;

        for (const eventKey in $dataSystem.rentals) {
            const rental = $dataSystem.rentals[eventKey];

            // Use game time when available (matches the displayed countdown);
            // fall back to real time for legacy saves without the game-minute stamp.
            const expired = (rental.expirationGameMinutes != null)
                ? currentGameMinutes >= rental.expirationGameMinutes
                : currentTime >= rental.expirationTime;

            if (rental.active && expired) {
                // Rental has expired
                rental.active = false;

                // Turn off self switch A
                const key = [rental.mapId, rental.eventId, 'A'];
                $gameSelfSwitches.setValue(key, false);
                // Hand the room back to the world: it is free for anyone again.
                releaseBooking(rental.mapId, rental.eventId, rental.bookingKey);
                anyExpired = true;

                debugLog(`Rental expired: Event ${rental.eventId} on Map ${rental.mapId}`);
            }
        }

        // Force refresh current map only when a rental actually expired.
        if (anyExpired) $gameMap.requestRefresh();
    }

    // Initialize rentals when creating new game objects
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function () {
        _DataManager_createGameObjects.call(this);
        initializeRentals();
    };

    // Initialize rentals when loading database
    const _DataManager_onLoad = DataManager.onLoad;
    DataManager.onLoad = function (object) {
        _DataManager_onLoad.call(this, object);
        if (object === $dataSystem) {
            initializeRentals();
        }
    };

    // Override DataManager.makeSaveContents to save rental data
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        const contents = _DataManager_makeSaveContents.call(this);
        initializeRentals();
        contents.rentals = $dataSystem.rentals;
        contents.rentalStartTimes = $dataSystem.rentalStartTimes || {};
        return contents;
    };

    // Override DataManager.extractSaveContents to load rental data
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        $dataSystem.rentals = contents.rentals || {};
        $dataSystem.rentalStartTimes = contents.rentalStartTimes || {};
        // Don't update rental status here to prevent players getting stuck
    };

    // Clean up expired rentals periodically; keyboard nav + timer refresh for room list HTML
    const _Scene_Map_update_rent = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_rent.call(this);

        if (Graphics.frameCount % 3600 === 0) cleanupExpiredRentals();

        if (this._roomListEl) {
            // Refresh only the countdown text every second (rooms were scanned
            // once when the overlay opened; no full innerHTML rebuild here).
            if (Graphics.frameCount % 60 === 0) {
                this._refreshRoomListCountdowns();
            }
            // Keyboard / gamepad navigation
            const len = (this._roomListRooms || []).length;
            if (Input.isRepeated('down') || Input.isRepeated('s')) {
                if (this._roomListIdx < len - 1) {
                    this._roomListIdx++;
                    this._updateRoomListHighlight();
                    this.panMapToRoomEvent(this._roomListIdx);
                    SoundManager.playCursor();
                }
            }
            if (Input.isRepeated('up') || Input.isRepeated('w')) {
                if (this._roomListIdx > 0) {
                    this._roomListIdx--;
                    this._updateRoomListHighlight();
                    this.panMapToRoomEvent(this._roomListIdx);
                    SoundManager.playCursor();
                }
            }
            if (Input.isTriggered('ok'))     { SoundManager.playOk();     this.onRoomListOverlayOk();   }
            if (Input.isTriggered('cancel')) { SoundManager.playCancel(); this.closeRoomListOverlay(); }
        }

        // Bouncing arrow above selected room event
        if (this._roomArrowSprite && this._roomListEl) {
            this._roomArrowTick = (this._roomArrowTick || 0) + 1;
            const rooms = this._roomListRooms || [];
            const room  = rooms[this._roomListIdx];
            if (room) {
                const event = $dataMap.events[room.eventId];
                if (event) {
                    const tw = $gameMap.tileWidth();
                    const th = $gameMap.tileHeight();
                    this._roomArrowSprite.x = Math.round(($gameMap.adjustX(event.x) + 0.5) * tw);
                    this._roomArrowSprite.y = Math.round($gameMap.adjustY(event.y) * th
                        - th * 0.1 + Math.sin(this._roomArrowTick * 0.12) * 7);
                }
            }
        }
    };

    // Function to clean up expired rental data
    function cleanupExpiredRentals() {
        initializeRentals();
        const currentTime = Date.now();

        for (const eventKey in $dataSystem.rentals) {
            const rental = $dataSystem.rentals[eventKey];

            // Remove rental data that's been expired for more than 24 hours
            if (!rental.active && currentTime >= (rental.expirationTime + 24 * 60 * 60 * 1000)) {
                delete $dataSystem.rentals[eventKey];
            }
        }
    }

    // How long a stay has left, on the game clock (variable 114). A stay paid on
    // for further days runs past the one night the room was first taken for, so
    // the record's own expiry is the answer whenever it has one.
    function rentalMinutesLeft(rental) {
        if (!rental) return 0;
        const currentGameMinutes = $gameVariables.value(114) || 0;
        if (rental.expirationGameMinutes != null) {
            return rental.expirationGameMinutes - currentGameMinutes;
        }
        const startGameMinutes = getGameStartMinutesForRental(rental.expirationTime);
        return (24 * 60) - (currentGameMinutes - startGameMinutes);
    }

    function rentalByExpiration(expirationTime) {
        initializeRentals();
        for (const key in $dataSystem.rentals) {
            const rental = $dataSystem.rentals[key];
            if (rental && rental.expirationTime === expirationTime) return rental;
        }
        return null;
    }

    function formatMinutesLeft(remainingMinutes) {
        if (remainingMinutes <= 0) return _ri18n('expired');
        const days = Math.floor(remainingMinutes / (24 * 60));
        const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
        const mins = remainingMinutes % 60;
        if (days > 0) return `${days}d ${hours}h`;  // i18n-ignore  duration
        if (hours > 0) return `${hours}h ${mins}m`;  // i18n-ignore  duration
        return `${mins}m`;  // i18n-ignore  duration
    }

    // Function to get time remaining for a rental in human-readable format
    // Uses TimeDateSystem's game time variable (114) for consistency
    function getTimeRemaining(expirationTime) {
        const rental = rentalByExpiration(expirationTime);
        const remainingMinutes = rental
            ? rentalMinutesLeft(rental)
            : (24 * 60) - (($gameVariables.value(114) || 0) - getGameStartMinutesForRental(expirationTime));
        return formatMinutesLeft(remainingMinutes);
    }

    // Store rental start times in real-time to calculate game time elapsed
    function getGameStartMinutesForRental(expirationTime) {
        if (!$dataSystem.rentalStartTimes) {
            $dataSystem.rentalStartTimes = {};
        }

        const key = `rental_${expirationTime}`;
        return $dataSystem.rentalStartTimes[key] || 0;
    }

    // Store game time when rental starts
    function storeRentalStartTime(expirationTime) {
        if (!$dataSystem.rentalStartTimes) {
            $dataSystem.rentalStartTimes = {};
        }

        const gameTimeVariableId = 114;
        const currentGameMinutes = $gameVariables.value(gameTimeVariableId) || 0;
        const key = `rental_${expirationTime}`;
        $dataSystem.rentalStartTimes[key] = currentGameMinutes;
    }

    // Function to get all rooms (events named "Room") on current map
    function getRoomsOnCurrentMap() {
        const mapId = $gameMap.mapId();
        const rooms = [];

        if (!$dataMap || !$dataMap.events) {
            return rooms;
        }

        for (let eventId = 1; eventId < $dataMap.events.length; eventId++) {
            const event = $dataMap.events[eventId];
            if (!event) continue;

            const eventName = event.name || '';

            // Only include events named "Room". Read as a leading word rather
            // than as the whole name, so "Room 12" and "Room (deluxe)" are the
            // rooms they say they are, while a "Living Room" prop is not.
            if (/^room\b/.test(eventName.toLowerCase())) {
                // Try to extract price from event note or use default
                let price = 1000; // Default price
                if (event.note) {
                    const priceMatch = event.note.match(/<price[:\s]*(\d+)>/i);
                    if (priceMatch) {
                        price = parseInt(priceMatch[1]);
                    }
                }

                const eventKey = mapId + '_' + eventId;
                const rental = $dataSystem.rentals[eventKey];
                const isRented = rental && rental.active;
                // Held by another savegame's party: occupied, but not by us, so
                // it is neither rentable nor ours to count down.
                const booked = isRented ? null : foreignBooking(mapId, eventId);

                rooms.push({
                    eventId: eventId,
                    mapId: mapId,
                    name: eventName,
                    price: price,
                    isRented: !!(isRented || booked),
                    bookedBy: booked ? booked.leader : null,
                    expirationTime: isRented ? rental.expirationTime : null
                });
            }
        }

        debugLog(`Found ${rooms.length} Room events on map ${mapId}`);
        return rooms;
    }


    //=============================================================================
    // Public API
    //=============================================================================
    // A room is a place in the world, not a menu: the town's NPCs take one when
    // they are tired (NPC/NPCSimulationCore.js) and so does a loose party member
    // (Core/AutoIdleExplorer.js). Both need to ask what is free, what it costs,
    // and to take it, without going through the player's confirmation window.
    //
    // A rental taken by somebody who is not the party is recorded separately, in
    // $gameSystem._npcRentals, and NEVER flips the room's self switch A: that
    // switch is what opens the door for the PLAYER. It only makes the room
    // occupied, so a town where everyone has turned in has no beds left.
    const NPC_RENT_MINUTES = 24 * 60; // a night, on the game clock (var 114)

    function npcRentals() {
        if (!$gameSystem) return {};
        if (!$gameSystem._npcRentals) $gameSystem._npcRentals = {};
        const now = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
        for (const [key, rec] of Object.entries($gameSystem._npcRentals)) {
            if (!rec || rec.until <= now) delete $gameSystem._npcRentals[key];
        }
        return $gameSystem._npcRentals;
    }

    window.RentSystem = {
        // Every "Room" event on a map, with its price and who holds it.
        rooms(mapId) {
            const id = mapId || ($gameMap ? $gameMap.mapId() : 0);
            if (!$gameMap || id !== $gameMap.mapId()) return [];
            initializeRentals();
            const held = npcRentals();
            return getRoomsOnCurrentMap().map((room) => {
                const key = room.mapId + '_' + room.eventId;
                const npc = held[key] || null;
                return Object.assign({}, room, {
                    isRented: room.isRented || !!npc,
                    // Another savegame's party is a tenant like any other: the
                    // room is taken, and the caller is told whose it is.
                    tenant: npc ? npc.name : (room.bookedBy || (room.isRented ? 'party' : null)), // i18n-ignore: record value
                });
            });
        },

        freeRooms(mapId) {
            return this.rooms(mapId).filter((r) => !r.isRented);
        },

        isFree(mapId, eventId) {
            return this.rooms(mapId).some((r) => r.eventId === eventId && !r.isRented);
        },

        priceOf(mapId, eventId) {
            const room = this.rooms(mapId).find((r) => r.eventId === eventId);
            return room ? room.price : 0;
        },

        // Taken by the party: paid in party gold, and the door opens for them.
        rentForParty(mapId, eventId) {
            const room = this.rooms(mapId).find((r) => r.eventId === eventId);
            if (!room || room.isRented) return null;
            if (!$gameParty || $gameParty.gold() < room.price) return null;
            $gameParty.loseGold(room.price);
            processRental(`${room.mapId}_${room.eventId}`, room.mapId, room.eventId);
            return { price: room.price, mapId: room.mapId, eventId: room.eventId };
        },

        // Taken by somebody else: paid out of their own purse, and the room is
        // simply occupied for the night.
        // Who holds a room, when it is another savegame's party: the leader's
        // name, or null when the room is free or held by this one.
        bookedBy(mapId, eventId) {
            const rec = foreignBooking(mapId != null ? mapId : ($gameMap ? $gameMap.mapId() : 0), eventId);
            return rec ? rec.leader : null;
        },

        // --- Stays the party is paying for, wherever they are ---------------
        // The assets menu lists these and pays on them, so nothing here may ask
        // the loaded map anything: everything is read off the record written
        // when the room was taken.
        listRentals() {
            initializeRentals();
            // Read from a menu that may have been left open while the clock ran
            // on, so a stay that is over is never listed as one that is not.
            updateRentalStatus();
            const out = [];
            for (const key in $dataSystem.rentals) {
                const rental = $dataSystem.rentals[key];
                if (!rental || !rental.active) continue;
                const place = rental.place || {};
                out.push({
                    key: key,
                    roomName: rental.roomName || '',
                    placeName: place.place || '',
                    mapId: rental.mapId,
                    eventId: rental.eventId,
                    x: place.x != null ? place.x : null,
                    y: place.y != null ? place.y : null,
                    worldX: place.worldX != null ? place.worldX : null,
                    worldY: place.worldY != null ? place.worldY : null,
                    price: rental.price || 1000,
                    days: rental.days || 1,
                    minutesLeft: Math.max(0, rentalMinutesLeft(rental)),
                    timeLeft: formatMinutesLeft(rentalMinutesLeft(rental)),
                });
            }
            return out;
        },

        // What another `days` nights on a stay would cost.
        extensionCost(key, days) {
            initializeRentals();
            const rental = $dataSystem.rentals[key];
            const n = Math.max(1, Math.floor(Number(days) || 0));
            if (!rental || !rental.active) return 0;
            return (rental.price || 1000) * n;
        },

        // Paying a stay on. Done from the ledger, so the party never has to be
        // anywhere near the room: the door is already open to them, and only the
        // day it shuts moves.
        extendRental(key, days) {
            initializeRentals();
            const rental = $dataSystem.rentals[key];
            const n = Math.max(1, Math.floor(Number(days) || 0));
            if (!rental || !rental.active) return null;
            const cost = (rental.price || 1000) * n;
            if (!$gameParty || $gameParty.gold() < cost) return null;
            $gameParty.loseGold(cost);
            const minutes = n * 24 * 60;
            const now = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
            const from = (rental.expirationGameMinutes != null) ? rental.expirationGameMinutes : now;
            rental.expirationGameMinutes = from + minutes;
            rental.expirationTime = (rental.expirationTime || Date.now()) + n * 24 * 60 * 60 * 1000;
            rental.days = (rental.days || 1) + n;
            extendBooking(rental.mapId, rental.eventId, rental.bookingKey, minutes);
            return {
                cost: cost,
                days: n,
                timeLeft: formatMinutesLeft(rentalMinutesLeft(rental)),
            };
        },

        rentForNPC(name, mapId, eventId, purse) {
            const room = this.rooms(mapId).find((r) => r.eventId === eventId);
            if (!room || room.isRented || !name) return null;
            if (purse != null && purse < room.price) return null;
            const now = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
            npcRentals()[`${room.mapId}_${room.eventId}`] = {
                name, until: now + NPC_RENT_MINUTES,
            };
            return { price: room.price, mapId: room.mapId, eventId: room.eventId };
        },
    };

    // Debug commands
    window.checkRentals = function () {
        initializeRentals();
        console.log('Current rentals:', $dataSystem.rentals);
        console.log('All self switches:', $gameSelfSwitches._data);
        updateRentalStatus();
    };

    window.testSwitch = function (mapId, eventId) {
        const key = [mapId, eventId, 'A'];
        console.log(`Switch [${mapId}, ${eventId}, A]:`, $gameSelfSwitches.value(key));
        $gameSelfSwitches.setValue(key, true);
        $gameMap.requestRefresh();
        console.log('Switch set to true and map refreshed');
    };

    // Debug function to test directional access
    window.testDirectionalAccess = function (eventId) {
        console.log('Testing directional access for event:', eventId);
        const hasAccess = checkDirectionalAccess(eventId);
        console.log('Has directional access:', hasAccess);
    };

    // Hide bust after any message flagged by the rent system
    const _RentSystem_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function () {
        _RentSystem_terminateMessage.call(this);
        if ($gameSystem._rentHideBust) {
            $gameSystem._rentHideBust = false;
            const scene = SceneManager._scene;
            if (scene && scene._bustManager) scene._bustManager.hideBusts();
        }
    };

})();
