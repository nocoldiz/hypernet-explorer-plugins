//=============================================================================
// VoxelWorldTraffic.js
// VoxelWorld: true scale NPC road traffic
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - true scale NPC road traffic
 * @author Omni-Lex
 *
 * @help
 * true scale NPC road traffic.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldTraffic.js'); return; }

    const {
        HEADLIGHT_NIGHT, KMH_TO_UNITS, ROAD_HALF_LANE, ROAD_LANE_OFF, TRAFFIC_MAX,
        TRAFFIC_RING_MAX, TRAFFIC_RING_MIN, TRAFFIC_VEHICLES, UNITS_PER_M,
        VehicleBillboard, WORLD_TILE_SIZE,
        CharacterBillboard, PERSON_H, ROAD_TOTAL_W, ROAD_SHOULDER_W,
        getRenderType, getRoadDirectionAt, sampleBiomeAt
    } = VW;

    // =========================================================================
    // TrafficManager, pooled traffic driving the road grid around the camper.
    //
    // Every vehicle out here is a DIRECTIONAL SPRITE, not a model: the same
    // walk sheet under img/characters/Vehicles that the 2D map drives
    // (Vehicle/RoadCarAI.js), stood up as a card that turns to the lens with
    // the row picked from where the eye stands relative to the way the vehicle
    // is pointing. Nine hand-built low-poly shells used to do this job; one
    // sheet each does it for a fraction of the geometry AND makes the traffic
    // met out here visibly the same traffic met on the flat map.
    //
    // The road they drive is the dual carriageway the 2D generator lays down
    // (ProceduralMapRoadGenerator): two carriageways with a median between
    // them, each carriageway two lanes wide with a broken line down its own
    // middle. A car takes the carriageway its direction of travel calls for and
    // then ONE of that carriageway's two lanes - never the paint itself. Cars
    // follow their tile's road direction, turn at junctions, keep a gap to the
    // car ahead, recycle when far, and light up at night.
    // =========================================================================
    class TrafficManager {
        // `silent` mutes the near-miss horn (title-screen background drive).
        constructor(scene, silent) {
            this._scene  = scene;
            this._cars   = [];
            this._t      = 0;
            this._silent = !!silent;
            this._hornCd = 0;   // near-miss honk cooldown (s)
            this._driverSeq = 0; // salt of the next driver drawn (RoadCarAI)

            // Lamps are the one thing a flat card cannot draw for itself: a
            // sprite has its headlights painted on and they do not light up at
            // dusk. Two shared unlit materials and one shared quad, hung off a
            // little group that carries the vehicle's heading, do that much.
            this._headMat = new THREE.MeshBasicMaterial({
                color: 0xfff3c0, transparent: true, opacity: 0, depthWrite: false });
            this._tailMat = new THREE.MeshBasicMaterial({
                color: 0xff3322, transparent: true, opacity: 0.5, depthWrite: false });
            this._lampGeo = new THREE.PlaneGeometry(0.42 * UNITS_PER_M, 0.18 * UNITS_PER_M);

            this._types = TRAFFIC_VEHICLES.map(v => ({
                key: v.key, sheet: v.sheet, heavy: !!v.heavy,
                length:    v.lengthM * UNITS_PER_M,
                halfLen:   v.lengthM * UNITS_PER_M * 0.5,
                halfWidth: v.widthM  * UNITS_PER_M * 0.5,
                radius:   (v.lengthM + v.widthM) * UNITS_PER_M * 0.25
            }));

            // Pool slots are dealt the types round-robin from a shuffled list,
            // so a busy road carries a real mix rather than twelve of one car.
            const bag = this._types.slice();
            for (let i = bag.length - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
            }
            for (let i = 0; i < TRAFFIC_MAX; i++) this._cars.push(this._makeCar(bag[i % bag.length]));
        }

        // One pooled vehicle: its card, and the pair of lamps that sit at the
        // ends of it. The card is added to the scene directly rather than to a
        // group of its own - a billboard is placed in world space and turns
        // itself to the camera, so there is nothing for a parent to rotate.
        _makeCar(type) {
            const board = new VehicleBillboard(type.sheet, type.length);
            board.setVisible(false);
            this._scene.add(board.mesh);

            // The lamps DO carry the heading: they are points on the vehicle,
            // not a picture of it.
            const lamps = new THREE.Group();
            const y = 0.75 * UNITS_PER_M;
            for (const sx of [-1, 1]) {
                const head = new THREE.Mesh(this._lampGeo, this._headMat);
                head.position.set(sx * type.halfWidth * 0.62, y, type.halfLen);
                lamps.add(head);
                const tail = new THREE.Mesh(this._lampGeo, this._tailMat);
                tail.position.set(sx * type.halfWidth * 0.62, y, -type.halfLen);
                tail.rotation.y = Math.PI;
                lamps.add(tail);
            }
            lamps.visible = false;
            this._scene.add(lamps);

            return { board, lamps, x: 0, z: 0, ax: 0, az: 1, yaw: 0,
                     offX: 0, offZ: 0, speed: 0, active: false, type,
                     lane: ROAD_LANE_OFF, halfLen: type.halfLen,
                     halfWidth: type.halfWidth, radius: type.radius,
                     tileX: 0, tileZ: 0, turnDir: 0, turnCx: 0, turnCz: 0 };
        }

        // Put one out of frame, freeing its pool slot for the next spawn.
        _park(car) {
            car.active = false;
            car.board.setVisible(false);
            car.lamps.visible = false;
        }

        _axisAllowed(dir, ax) {
            const horiz = Math.abs(ax) > 0.5; // travelling along X
            if (dir === 'horizontal') return horiz;
            if (dir === 'vertical')   return !horiz;
            return true; // crossings, tees, corners, unknown: let it through
        }

        _trySpawn(camX, camZ) {
            const cTileX = Math.floor(camX / WORLD_TILE_SIZE);
            const cTileZ = Math.floor(camZ / WORLD_TILE_SIZE);
            for (let attempt = 0; attempt < 6; attempt++) {
                const ang  = Math.random() * Math.PI * 2;
                const ring = TRAFFIC_RING_MIN + Math.random() * (TRAFFIC_RING_MAX - TRAFFIC_RING_MIN);
                const tx = cTileX + Math.round(Math.cos(ang) * ring);
                const tz = cTileZ + Math.round(Math.sin(ang) * ring);
                if (tx < 0 || tz < 0 || tx >= 256 || tz >= 256) continue;
                if (getRenderType(sampleBiomeAt(tx, tz).name) !== 'road') continue;

                const dir   = getRoadDirectionAt(tx, tz);
                const horiz = dir === 'horizontal' ? true
                            : dir === 'vertical'   ? false
                            : Math.random() < 0.5;
                const sign  = Math.random() < 0.5 ? 1 : -1;
                const ax    = horiz ? sign : 0;
                const az    = horiz ? 0 : sign;

                const car = this._cars.find(c => !c.active);
                if (!car) return;

                // The carriageway on the right of the median (right vector of
                // travel = (az, -ax)), and then one of ITS two lanes: the paint
                // runs down the middle of the carriageway, so a vehicle sits
                // half a lane either side of it and never on it.
                car.lane = ROAD_LANE_OFF + (Math.random() < 0.5 ? -1 : 1) * ROAD_HALF_LANE;
                const cx = tx * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5 + az * car.lane;
                const cz = tz * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5 - ax * car.lane;

                car.x = cx; car.z = cz; car.ax = ax; car.az = az;
                car.tileX = tx; car.tileZ = tz;
                car.offX = 0; car.offZ = 0; car.turnDir = 0;
                // Heavier vehicles cruise slower than the light stuff.
                car.speed = (car.type.heavy ? 42 + Math.random() * 26
                                            : 55 + Math.random() * 50) * KMH_TO_UNITS;
                car.baseSpeed = car.speed;
                car.active = true;
                car.yaw = Math.atan2(ax, az);
                car.board.yaw = car.yaw;
                car.board.setPosition(cx, 0, cz);
                car.board.setVisible(true);
                car.lamps.position.set(cx, 0, cz);
                car.lamps.rotation.y = car.yaw;
                car.lamps.visible = true;
                // Somebody is at the wheel: one of the people of the towns
                // around the square the eye is over, drawn by the 2D road's
                // own rule (RoadCarAI.driverForCell, a cached pool, no scan).
                car.driverName = null;
                if (!this._silent) {
                    const RC = window.RoadCarAI;
                    try {
                        car.driverName = (RC && RC.driverForCell) ? (RC.driverForCell(cTileX, cTileZ, ++this._driverSeq) || null) : null;
                    } catch (e) { car.driverName = null; }
                }
                return;
            }
        }

        update(camX, camZ, delta, dayFactor, camYaw) {
            const day = dayFactor == null ? 1 : dayFactor;
            this._t += delta;
            if (this._hornCd > 0) this._hornCd -= delta;
            const ts = WORLD_TILE_SIZE;
            const recycleDist = TRAFFIC_RING_MAX * ts * 1.3;

            let active = 0;
            for (const car of this._cars) if (car.active) active++;
            if (active < TRAFFIC_MAX && Math.random() < 0.6) this._trySpawn(camX, camZ);

            for (const car of this._cars) {
                if (!car.active) continue;

                // Two speed governors, lowest wins: brake for the camper blocking
                // the lane, and keep a safe gap to the car ahead (so traffic never
                // drives through itself). Otherwise ease back up to cruise.
                let target = car.baseSpeed || car.speed;

                const relX = camX - car.x, relZ = camZ - car.z;
                const ahead = relX * car.ax + relZ * car.az;
                const side  = Math.abs(relX * car.az - relZ * car.ax);
                if (ahead > 0 && ahead < 110 && side < 26) {
                    target = Math.min(target, 8);
                    // Quick honk when the camper cuts in close ahead (throttled,
                    // silent if the SE file is absent).
                    if (ahead < 60 && this._hornCd <= 0 && !this._silent) {
                        this._hornCd = 2.5;
                        try { AudioManager.playSe({ name: 'Blow2', volume: 40, pitch: 80, pan: 0 }); } catch (e) {}
                    }
                }

                // Car-following: nearest active car ahead in the same lane.
                let leadGap = Infinity, leadSpeed = 0;
                for (const other of this._cars) {
                    if (other === car || !other.active) continue;
                    if (other.ax * car.ax + other.az * car.az < 0.5) continue;   // same heading only
                    const rx = other.x - car.x, rz = other.z - car.z;
                    const fwd = rx * car.ax + rz * car.az;
                    const lat = Math.abs(rx * car.az - rz * car.ax);
                    if (fwd > 0 && lat < 16 && fwd < leadGap) { leadGap = fwd; leadSpeed = other.speed; }
                }
                const minGap = car.halfLen + 20;
                if (leadGap < minGap)            target = Math.min(target, leadSpeed * 0.85);
                else if (leadGap < minGap * 2.5) target = Math.min(target, leadSpeed + 8);

                // Ease toward the governed target (brake harder than accelerate).
                const rate = target < car.speed ? 150 : 32;
                car.speed += Math.max(-rate * delta, Math.min(rate * delta, target - car.speed));
                if (car.speed < 0) car.speed = 0;

                car.x += car.ax * car.speed * delta;
                car.z += car.az * car.speed * delta;

                // Turn at junctions: entering a crossing / tee tile, sometimes
                // commit to a 90 degree turn onto the perpendicular road. The
                // turn is only executed once the car actually reaches the middle
                // of the junction, so it swings round the centre instead of
                // teleporting half a tile the instant it crosses the tile edge.
                const ntx = Math.floor(car.x / ts), ntz = Math.floor(car.z / ts);
                if (ntx !== car.tileX || ntz !== car.tileZ) {
                    car.tileX = ntx; car.tileZ = ntz;
                    car.turnDir = 0;
                    if (ntx >= 0 && ntz >= 0 && ntx < 256 && ntz < 256 &&
                        getRenderType(sampleBiomeAt(ntx, ntz).name) === 'road') {
                        const jdir = getRoadDirectionAt(ntx, ntz);
                        if (jdir !== 'horizontal' && jdir !== 'vertical' && Math.random() < 0.4) {
                            car.turnDir = Math.random() < 0.5 ? 1 : -1;
                            car.turnCx  = ntx * ts + ts * 0.5;
                            car.turnCz  = ntz * ts + ts * 0.5;
                        }
                    }
                }
                if (car.turnDir) {
                    // Distance still to run before the junction centre, measured
                    // along the current heading.
                    const toCentre = (car.turnCx - car.x) * car.ax + (car.turnCz - car.z) * car.az;
                    if (toCentre <= 0) {
                        const s = car.turnDir;
                        const nax = car.az * s, naz = -car.ax * s;
                        car.ax = nax; car.az = naz;
                        car.turnDir = 0;
                        // Only the coordinate perpendicular to the NEW heading is
                        // snapped, onto that road's right-hand lane; the one along
                        // it is already at the junction centre. The leftover step
                        // is carried as a render offset and eased out below.
                        const px = car.x, pz = car.z;
                        if (Math.abs(nax) > 0.5) car.z = car.turnCz - nax * car.lane;
                        else                     car.x = car.turnCx + naz * car.lane;
                        car.offX += px - car.x;
                        car.offZ += pz - car.z;
                    }
                }

                const dx = car.x - camX, dz = car.z - camZ;
                if (Math.abs(dx) > recycleDist || Math.abs(dz) > recycleDist) { this._park(car); continue; }
                const tx = Math.floor(car.x / ts);
                const tz = Math.floor(car.z / ts);
                if (tx < 0 || tz < 0 || tx >= 256 || tz >= 256) { this._park(car); continue; }
                const dir = getRoadDirectionAt(tx, tz);
                if (getRenderType(sampleBiomeAt(tx, tz).name) !== 'road' || !this._axisAllowed(dir, car.ax)) {
                    this._park(car); continue;
                }

                // Ease the leftover lane-change step out of the render position so
                // a junction snap reads as a quick slide, never as a teleport.
                if (car.offX || car.offZ) {
                    const k = Math.max(0, 1 - delta * 7);
                    car.offX *= k; car.offZ *= k;
                    if (Math.abs(car.offX) < 0.05) car.offX = 0;
                    if (Math.abs(car.offZ) < 0.05) car.offZ = 0;
                }
                const rx = car.x + car.offX, rz = car.z + car.offZ;

                // Swing the heading the card is READ at toward the logical one,
                // so a corner is a vehicle turning rather than an instant flip
                // of which side of it you are looking at.
                const targetYaw = Math.atan2(car.ax, car.az);
                let dYaw = targetYaw - car.yaw;
                while (dYaw >  Math.PI) dYaw -= Math.PI * 2;
                while (dYaw < -Math.PI) dYaw += Math.PI * 2;
                const swing = Math.min(Math.abs(dYaw), 3.2 * delta);
                car.yaw += dYaw < 0 ? -swing : swing;

                car.board.yaw = car.yaw;
                car.board.setPosition(rx, 0, rz);
                car.board.setDaylight(day);
                car.board.update(camX, camZ, camYaw || 0);
                car.lamps.position.set(rx, 0, rz);
                car.lamps.rotation.y = car.yaw;
                car.lamps.visible = car.board.mesh.visible;
            }

            // Global head/tail light brightness by time of day.
            const night = 1 - Math.min(1, day / HEADLIGHT_NIGHT);
            this._headMat.opacity = night;
            this._tailMat.opacity = 0.4 + night * 0.6;
        }

        dispose() {
            for (const car of this._cars) {
                car.board.dispose();
                this._scene.remove(car.lamps);
            }
            this._lampGeo.dispose();
            this._headMat.dispose();
            this._tailMat.dispose();
            this._cars.length = 0;
        }
    }

    // =========================================================================
    // RoadTravellerManager, the people on the road between towns.
    //
    // The same people the 2D road squares show (Vehicle/RoadCarAI.js), from
    // the same answer: NPCLifeSim.travellersNear, asked for the world square
    // the eye is over every TRAVELLER_SPAWN_EVERY seconds. A walker is a
    // person card (their own walk sheet, as the town crowd draws them); a
    // rider is a VehicleBillboard on the riding sheet (VehicleSystem
    // .npcRidingSheet). Nobody takes a car lane:
    //   walk   the verge, just off the paved width
    //   bike   the hard shoulder on the right of the way they are going
    //   broom  over the median, TRAVELLER_BROOM_H up, and never in the
    //          camper's way (bumpFrom passes them over)
    //   car    their OWN car (a key holder on a trip by car): a car card in
    //          the outer lane of their carriageway, at road speed, with them
    //          at the wheel. Nobody talks to a moving car and the camper does
    //          not shove one onto the verge.
    // They are real people: nearest() answers the town crowd's talk path, so
    // Talk and Empathize open on them the same way.
    // =========================================================================
    const TRAVELLER_POOL = 8;
    const TRAVELLER_SPAWN_EVERY = 1.5;              // seconds between spawn checks
    const TRAVELLER_BROOM_H = 4 * UNITS_PER_M;      // a broom flies at 4 m
    const TRAVELLER_RING_MIN = 1;                   // tiles: where one is put down
    const TRAVELLER_RING_MAX = 3;
    // Speeds in km/h, turned into world units by KMH_TO_UNITS.
    const TRAVELLER_KMH = { walk: [8, 12], bike: [20, 30], broom: [40, 60], car: [55, 90] };
    const TRAVELLER_LENGTH = { bike: 1.8 * UNITS_PER_M, broom: 2.0 * UNITS_PER_M, car: 4.4 * UNITS_PER_M };
    // Distance from the road's centre line, on the right of the way of travel.
    const TRAVELLER_OFFSET = {
        walk:  ROAD_TOTAL_W * 0.5 + 8,
        bike:  ROAD_TOTAL_W * 0.5 - ROAD_SHOULDER_W * 0.5,
        broom: 0,
        car:   ROAD_LANE_OFF + ROAD_HALF_LANE
    };
    const TRAVELLER_BUMP_R = 6;                     // a person's own reach, for the camper
    // i18n-ignore-start  travel mode ids
    const T_WALK = 'walk', T_BIKE = 'bike', T_BROOM = 'broom', T_CAR = 'car';
    // i18n-ignore-end

    class RoadTravellerManager {
        constructor(scene) {
            this._scene = scene;
            this._list  = [];
            this._t     = 0;
            this._seen  = { hour: -1, names: new Set() };
        }

        static offsetFor(mode) { return TRAVELLER_OFFSET[mode] != null ? TRAVELLER_OFFSET[mode] : TRAVELLER_OFFSET.walk; }
        static heightFor(mode) { return mode === T_BROOM ? TRAVELLER_BROOM_H : 0; }
        static sheetFor(mode, name) {
            if (mode === T_CAR) {
                // One of the light traffic sheets, the same one for the same person.
                const cars = TRAFFIC_VEHICLES.filter(v => !v.heavy);
                if (!cars.length) return null;
                const key = String(name || '');
                let h = 5381;
                for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
                return { name: cars[h % cars.length].sheet, index: 0 };
            }
            const VS = window.VehicleSystem;
            const s = (mode === T_BIKE || mode === T_BROOM) && VS && VS.npcRidingSheet ? VS.npcRidingSheet(mode) : null;
            return s && s.name ? s : null;
        }

        // The walk sheet a person is drawn in, off their profile, or a seeded
        // passer-by's when the profile has none.
        _personSheet(name) {
            const p = $gameSystem && $gameSystem._npcSociety ? $gameSystem._npcSociety[name] : null;
            let sheet = p && p.spriteKey ? String(p.spriteKey) : '';
            let index = 0;
            if (sheet && !sheet.includes('!$')) {
                const i = Number(p.spriteIndex != null ? p.spriteIndex : p.bustIndex);
                index = Number.isFinite(i) ? Math.max(0, Math.min(7, i | 0)) : 0;
            }
            if (!sheet) {
                let h = 5381;
                for (let i = 0; i < name.length; i++) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
                const persona = window.NPCSystem && window.NPCSystem.generateSeededPersona
                    ? window.NPCSystem.generateSeededPersona(h || 1) : null;
                if (!persona || !persona.spriteName) return null;
                sheet = persona.spriteName;
                index = persona.charIdx || 0;
            }
            return { name: sheet, index };
        }

        // A straight road tile near the eye, running the way `heading` goes as
        // near as the road allows.
        _roadTileNear(cTileX, cTileZ, heading) {
            const wantH = Math.abs(heading.x) >= Math.abs(heading.y);
            let fallback = null;
            for (let attempt = 0; attempt < 12; attempt++) {
                const ang  = Math.random() * Math.PI * 2;
                const ring = TRAVELLER_RING_MIN + Math.random() * (TRAVELLER_RING_MAX - TRAVELLER_RING_MIN);
                const tx = cTileX + Math.round(Math.cos(ang) * ring);
                const tz = cTileZ + Math.round(Math.sin(ang) * ring);
                if (tx < 0 || tz < 0 || tx >= 256 || tz >= 256) continue;
                if (getRenderType(sampleBiomeAt(tx, tz).name) !== 'road') continue;
                const dir = getRoadDirectionAt(tx, tz);
                if (dir !== 'horizontal' && dir !== 'vertical') continue;
                if ((dir === 'horizontal') === wantH) return { tx, tz, horiz: dir === 'horizontal' };
                if (!fallback) fallback = { tx, tz, horiz: dir === 'horizontal' };
            }
            return fallback;
        }

        _spawn(entry, camX, camZ) {
            const ts = WORLD_TILE_SIZE;
            const heading = entry.heading || { x: 1, y: 0 };
            const at = this._roadTileNear(Math.floor(camX / ts), Math.floor(camZ / ts), heading);
            if (!at) return false;
            const mode = entry.mode === T_BIKE || entry.mode === T_BROOM || entry.mode === T_CAR ? entry.mode : T_WALK;
            // World-map y is the scene's z: the heading's sign along the road.
            const along = at.horiz ? heading.x : heading.y;
            const sign = along < 0 ? -1 : 1;
            const ax = at.horiz ? sign : 0;
            const az = at.horiz ? 0 : sign;
            const off = RoadTravellerManager.offsetFor(mode);
            const x = at.tx * ts + ts * 0.5 + az * off;
            const z = at.tz * ts + ts * 0.5 - ax * off;

            let bb;
            if (mode === T_WALK) {
                const sheet = this._personSheet(entry.name);
                if (!sheet) return false;
                bb = new CharacterBillboard(sheet.name, sheet.index, PERSON_H);
            } else {
                const sheet = RoadTravellerManager.sheetFor(mode, entry.name);
                if (!sheet) return false;
                bb = new VehicleBillboard(sheet.name, TRAVELLER_LENGTH[mode]);
            }
            this._scene.add(bb.mesh);
            const kmh = TRAVELLER_KMH[mode];
            const home = entry.from || entry.pos || { x: at.tx, y: at.tz };
            this._list.push({
                bb, name: entry.name, mode, ambient: !!entry.ambient,
                wx: Math.round(home.x), wy: Math.round(home.y),
                x, z, ax, az, yaw: Math.atan2(ax, az),
                speed: (kmh[0] + Math.random() * (kmh[1] - kmh[0])) * KMH_TO_UNITS,
                pause: 0
            });
            return true;
        }

        _drop(t) {
            t.bb.dispose();
            const i = this._list.indexOf(t);
            if (i >= 0) this._list.splice(i, 1);
        }

        _checkSpawns(camX, camZ) {
            if (this._list.length >= TRAVELLER_POOL) return;
            const Life = window.NPCLifeSim;
            if (!Life || !Life.travellersNear) return;
            const now = (typeof $gameVariables !== 'undefined' && $gameVariables) ? ($gameVariables.value(114) || 0) : 0;
            const hour = Math.floor(now / 60);
            if (this._seen.hour !== hour) this._seen = { hour, names: new Set() };
            const ts = WORLD_TILE_SIZE;
            const wx = Math.floor(camX / ts), wy = Math.floor(camZ / ts);
            if (wx < 0 || wy < 0 || wx > 255 || wy > 255) return;
            let list = [];
            try { list = Life.travellersNear(wx, wy, now, TRAVELLER_POOL) || []; } catch (e) { list = []; }
            const party = new Set((typeof $gameParty !== 'undefined' && $gameParty && $gameParty.members
                ? $gameParty.members() : []).map(a => a && a.name && a.name()));
            for (const entry of list) {
                if (!entry || !entry.name || this._seen.names.has(entry.name) || party.has(entry.name)) continue;
                if (this._list.some(t => t.name === entry.name)) continue;
                this._seen.names.add(entry.name);
                // One at a time: the road fills over a few checks, not in a burst.
                if (this._spawn(entry, camX, camZ)) return;
            }
        }

        update(delta, camX, camZ, camYaw, df, groundFn) {
            this._t += delta;
            if (this._t >= TRAVELLER_SPAWN_EVERY) {
                this._t = 0;
                this._checkSpawns(camX, camZ);
            }
            const ts = WORLD_TILE_SIZE;
            const recycle = TRAFFIC_RING_MAX * ts * 1.3;
            // Walked in place, not over a copy: a traveller dropped here is
            // spliced out of the list, so the index steps back over it.
            const list = this._list;
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                if (t.pause > 0) t.pause -= delta;
                const moving = t.pause <= 0;
                if (moving) {
                    t.x += t.ax * t.speed * delta;
                    t.z += t.az * t.speed * delta;
                    if (t.mode === T_WALK) t.bb.step += t.speed * delta;
                }
                if (Math.abs(t.x - camX) > recycle || Math.abs(t.z - camZ) > recycle) { this._drop(t); i--; continue; }
                const tx = Math.floor(t.x / ts), tz = Math.floor(t.z / ts);
                if (tx < 0 || tz < 0 || tx >= 256 || tz >= 256) { this._drop(t); i--; continue; }
                // Off the end of the road (a broom flies on regardless).
                if (t.mode !== T_BROOM && getRenderType(sampleBiomeAt(tx, tz).name) !== 'road') { this._drop(t); i--; continue; }
                const ground = groundFn ? (groundFn(t.x, t.z) || 0) : 0;
                t.bb.yaw = t.yaw;
                t.bb.moving = t.mode === T_WALK && moving;
                t.bb.setPosition(t.x, ground + RoadTravellerManager.heightFor(t.mode), t.z);
                t.bb.setVisible(true);
                t.bb.setDaylight(df == null ? 1 : df);
                t.bb.update(camX, camZ, camYaw || 0);
            }
        }

        // The traveller nearest a point, within `maxD`, shaped as the town
        // crowd's citizens are ({ name, wx, wy, x, z }) so the same talk path
        // takes them. A broom is out of reach up there.
        nearest(x, z, maxD) {
            let best = null, bestD = maxD * maxD;
            for (const t of this._list) {
                if (t.mode === T_BROOM || t.mode === T_CAR) continue;
                const dx = t.x - x, dz = t.z - z;
                const d = dx * dx + dz * dz;
                if (d < bestD) { bestD = d; best = t; }
            }
            return best;
        }

        // The camper is at (x, z) with reach `r`: whoever on foot or on a bike
        // is under it steps smartly aside onto the verge and stops a moment.
        // A broom is up in the air and never touched.
        bumpFrom(x, z, r) {
            const R = r + TRAVELLER_BUMP_R;
            for (const t of this._list) {
                if (t.mode === T_BROOM || t.mode === T_CAR) continue;
                const dx = t.x - x, dz = t.z - z;
                if (dx * dx + dz * dz > R * R) continue;
                // Out to the verge on their own side of the road.
                const side = (dx * t.az - dz * t.ax) >= 0 ? 1 : -1;
                t.x = x + t.az * R * side;
                t.z = z - t.ax * R * side;
                t.pause = 2 + Math.random() * 2;
            }
        }

        dispose() {
            for (const t of this._list) t.bb.dispose();
            this._list.length = 0;
        }
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        TrafficManager,
        RoadTravellerManager,
        TRAVELLER_OFFSET, TRAVELLER_BROOM_H, TRAVELLER_POOL, TRAVELLER_SPAWN_EVERY
    });
})();
