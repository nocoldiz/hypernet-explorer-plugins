//=============================================================================
// CamperModel.js
// Loads the original Camper.glb as the camper body, then attaches the
// procedural, animated upgrade hardware around it: rolling/retractable wheels
// and the bolt-on modules (flight rotors, water pontoons, submarine propeller +
// periscope). The GLB's own rear door ("CamperBackDoor") is rigged onto a real
// hinge pivot and exposed as the one interactable. Exposes
// window.HypernetCamper.CamperModel. Load BEFORE Vehicle/CamperDrivingSystem.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Modular Camper v2.2.0 (Camper.glb body + cockpit dash, animated steering wheel, wheels, hinged rear door & upgrade modules)
 * @author Omni-Lex
 *
 * @help
 * The body is the original models/Camper.glb (scaled to fit and double-sided so
 * the cabin is not see-through). The wheels and the air/water/underwater upgrade
 * modules are generated procedurally and animated, so they show and move on top
 * of the GLB. Forward is +Z, up is +Y, ground at y = 0.
 *
 * API (window.HypernetCamper.CamperModel):
 *   m.group / m.applyMotion(spd,steer,dt,roll,pitch,bounce) / m.setEnv(env)
 *   m.update(dt) / m.seats (empty) / m.getInteractables() (the rear door, once
 *   rigged) / m.setDoorOpen(bool) / m.isDoorOpen() / m.toggleDoor() / m.dispose()
 *
 * THE REST OF THE GARAGE (window.VehicleModels) also lives in this file: the
 * car, the bike, the inflatable boat and the flying broom are generated out of
 * the same parts the camper's upgrade hardware is, and the starship is the
 * party's own ship out of the galaxy simulation. One contract for all of them:
 *   VehicleModels.KEYS                     every vehicle with a body
 *   VehicleModels.has(key)                 is there one to show?
 *   VehicleModels.build(key)               { group, length, update(t), dispose() }
 *   VehicleModels.createPreview(cv, key)   a live turning portrait on a canvas
 */

(() => {
    'use strict';

    const HW = 4.5;   // half width  (wheel track / module placement)
    const HL = 13;    // half length
    const BH = 6;     // fallback body height
    const BY = 6;     // fallback body centre Y
    const REAR  = -HL + 1.5;
    const TARGET_LEN = 2 * HL;   // GLB scaled so its longest horizontal axis = this
    // Full scale of the cockpit speedometer. Sits just above the camper's natural
    // top speed (400 km/h, CamperDrivingSystem's NATURAL_TOP), so ordinary
    // driving sweeps the dial and only the turbo pegs it.
    // Read by both the painted dial face and the live needle: change it once.
    const SPEEDO_MAX_KMH = 480;
    // How far the rear door swings open, and how fast it eases toward its
    // target (closed <-> open) each time proximity flips it.
    const DOOR_OPEN_RAD  = 100 * Math.PI / 180;
    const DOOR_ANIM_RATE = 5;

    // Selectable exterior paintjobs applied to the GLB's body panels (the light,
    // exterior shell materials; interior/tyres/glass are left alone). Each carries
    // a physically-plausible metalness/roughness so painted panels catch the light.
    const PAINTS = {
        classic: { color: 0xffffff, metalness: 0.15, roughness: 0.45 },
        crimson: { color: 0x922327, metalness: 0.35, roughness: 0.35 },
        forest:  { color: 0x28492f, metalness: 0.30, roughness: 0.40 },
        ocean:   { color: 0x21406b, metalness: 0.40, roughness: 0.33 },
        sunset:  { color: 0xc65a17, metalness: 0.35, roughness: 0.38 },
        slate:   { color: 0x34383d, metalness: 0.45, roughness: 0.30 },
        sand:    { color: 0xb89a63, metalness: 0.20, roughness: 0.50 }
    };

    // Cached, tiled, sRGB-correct texture loader (matches the scene's loader).
    const _texCache = new Map();
    function loadTex(name, repeat) {
        if (typeof THREE === 'undefined' || typeof THREE.TextureLoader === 'undefined') return null;
        let t = _texCache.get(name);
        if (t) return t;
        t = new THREE.TextureLoader().load('img/textures/' + name);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (repeat) t.repeat.set(repeat, repeat);
        if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        _texCache.set(name, t);
        return t;
    }

    class CamperModel {
        constructor(scene) {
            this._scene = scene;
            this.group  = new THREE.Group();
            this._body  = new THREE.Group();   // body shell; gets roll / pitch / bounce
            this.group.add(this._body);
            scene.add(this.group);

            this._mats        = [];
            this._geos        = [];
            this._wheels      = [];
            this._steerGroups = [];
            this._wheelPivots = [];
            this._rotors      = [];
            this._props       = [];
            this._wheelRadius = 2.3;
            this._steerCur    = 0;
            this._lastSteer   = 0;
            this._wheelDeploy = 1;
            this._wheelTarget = 1;
            this._env         = 'road';
            this._bodyMats    = [];           // GLB exterior panels eligible for a paintjob
            this._glassMats   = [];           // window panes turned transparent
            this._paint       = (window.HypernetCamper && PAINTS[window.HypernetCamper.paint])
                ? window.HypernetCamper.paint : 'classic';
            this.seats = [];                  // no custom interior -> no seats

            // Rear door, rigged (once the GLB loads) onto a real hinge pivot.
            this._doorPivot     = null;
            this._doorLocalPos  = null;
            this._doorClosedY   = 0;
            this._doorOpenY     = 0;
            this._doorTargetOpen = false;

            // Register as the live camper so window.HypernetCamper.setPaint can
            // repaint it on the fly (cleared in dispose()).
            window.HypernetCamper = window.HypernetCamper || {};
            window.HypernetCamper._active = this;

            this._buildBody();
            this._buildWheels();
            this._buildCockpit();
            this._buildFlightModule();
            this._buildWaterModule();
            this._buildSubModule();
            this.setEnv('road');
        }

        hideBody() {
            if (this._body) this._body.visible = false;
            if (this._wheels) for (const w of this._wheels) w.visible = false;
            if (this._rotors) for (const r of this._rotors) r.visible = false;
            if (this._props) for (const p of this._props) p.visible = false;
            if (this._cockpit) this._cockpit.visible = false;
        }

        // ---- helpers ----------------------------------------------------------
        _mat(hex, opts) {
            const m = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, opts || {}));
            this._mats.push(m);
            return m;
        }
        _add(geo, material, x, y, z, parent) {
            this._geos.push(geo);
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(x || 0, y || 0, z || 0);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            (parent || this._body).add(mesh);
            return mesh;
        }
        _box(w, h, d, material, x, y, z, parent) {
            return this._add(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
        }

        // ---- body: the original Camper.glb -----------------------------------
        _buildBody() {
            const loader = (typeof THREE.GLTFLoader !== 'undefined') ? new THREE.GLTFLoader() : null;
            if (!loader) { this._buildBodyFallback(); return; }
            loader.load(
                'models/Camper.glb',
                (gltf) => {
                    const model = gltf.scene;
                    // Orient the imported GLB. Camper.glb is authored Y-up (verified
                    // from its geometry: seats/mirrors split along Z, seats rise
                    // along +Y), so it arrives upright and must NOT be rolled. It
                    // only needs its nose (+X) turned to the camper's forward (+Z).
                    model.rotation.set(0, 0, 0);
                    model.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -Math.PI / 2);   // nose +X -> +Z
                    model.updateMatrixWorld(true);

                    // Scale so the longest horizontal axis spans the camper length.
                    let box = new THREE.Box3().setFromObject(model);
                    let size = box.getSize(new THREE.Vector3());
                    const horiz = Math.max(size.x, size.z) || 1;
                    model.scale.setScalar(TARGET_LEN / horiz);
                    model.updateMatrixWorld(true);

                    // Centre it on the rig and rest it just above the wheels. The
                    // body is centred over the wheelbase (not slid back) so the
                    // procedural wheels sit squarely beneath it once aligned.
                    box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    size = box.getSize(new THREE.Vector3());
                    model.position.x = -center.x;
                    model.position.y = -box.min.y + 1.5;
                    model.position.z = -center.z;

                    // Double-sided so the cabin reads solid from inside (no
                    // see-through), then sort each material: window panes turn
                    // transparent, light exterior panels are queued for a paintjob.
                    model.traverse((n) => {
                        if (!n.isMesh) return;
                        n.castShadow = true;
                        n.receiveShadow = true;
                        const mats = Array.isArray(n.material)
                            ? n.material : (n.material ? [n.material] : []);
                        for (const mm of mats) {
                            mm.side = THREE.DoubleSide;
                            const nm = ((n.name || '') + ' ' + (mm.name || '')).toLowerCase();
                            if (/glass|window|windshield|windscreen|glazing|glaze|plexi|screen/.test(nm)) {
                                this._makeGlass(mm);
                                this._glassMats.push(mm);
                            } else if (this._isPaintable(mm, nm)) {
                                this._bodyMats.push(mm);
                            } else if (!mm.map) {
                                // Interior / trim panels: dress bare surfaces with an
                                // upholstery/leather texture so the cabin isn't flat.
                                mm.map = loadTex('brown_leather_stone.jpg', 3);
                                mm.needsUpdate = true;
                            }
                        }
                    });
                    this._model = model;
                    this._body.add(model);
                    this.applyPaint(this._paint);   // skin the exterior panels
                    this._alignWheelsToBody();   // re-seat wheels under the real body
                    this._rigDoor(model);         // hinge the rear door for open/close
                },
                undefined,
                (err) => { console.error('[CamperModel] Camper.glb load failed:', err); this._buildBodyFallback(); }
            );
        }

        // Plain box if the GLB is unavailable, so wheels/modules still demo.
        _buildBodyFallback() {
            const shell = this._mat(0xeeebe3, { side: THREE.DoubleSide, map: loadTex('beige_sandstone.jpg', 2) });
            this._box(2 * HW, BH, 2 * HL - 3, shell, 0, BY, -0.5);
            this._box(2 * HW - 2, 2, 2 * HL - 12, shell, 0, 9, -1.5);
            this._bodyMats.push(shell);
            this.applyPaint(this._paint);
        }

        // Turn a GLB material into a clean glass pane: see-through, faintly tinted,
        // low roughness, and no depth write so the cabin behind it stays visible.
        _makeGlass(mm) {
            mm.transparent = true;
            mm.opacity = 0.26;
            mm.depthWrite = false;
            if (mm.color) mm.color.setHex(0xafd0e0);
            if (mm.map) mm.map = null;                 // drop any opaque decal
            if (mm.metalness !== undefined) mm.metalness = 0.0;
            if (mm.roughness !== undefined) mm.roughness = 0.08;
            mm.needsUpdate = true;
        }

        // A material is a paintable exterior panel if it isn't obviously trim /
        // rubber / glass / interior and its base colour is light (campers ship in
        // a pale shell), which is exactly the surface a repaint should recolour.
        _isPaintable(mm, nm) {
            if (/tire|tyre|rubber|wheel|rim|chrome|glass|window|light|lamp|black|trim|seat|interior|engine|grille|grill|bumper|plastic|dash|steer/.test(nm)) return false;
            if (!mm.color) return false;
            const c = mm.color;
            const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
            return lum > 0.45;
        }

        // Repaint every exterior panel in the chosen colour. No detail map is
        // laid over it: a photographed concrete texture used to be multiplied
        // into every panel here, which drags any colour toward mid-grey and
        // left "classic" reading as a dirty grey instead of clean paint (most
        // visibly on white). A flat coat is what a painted body panel is.
        applyPaint(name) {
            const p = PAINTS[name] || PAINTS.classic;
            this._paint = PAINTS[name] ? name : 'classic';
            for (const mm of this._bodyMats) {
                if (!mm) continue;
                if (mm.color) mm.color.setHex(p.color);
                if (mm.metalness !== undefined) mm.metalness = p.metalness;
                if (mm.roughness !== undefined) mm.roughness = p.roughness;
                if (mm.map) mm.map = null;
                if (mm.emissive) mm.emissive.setHex(0x000000);
                mm.needsUpdate = true;
            }
            return this._paint;
        }

        // ---- wheels (retractable / steerable / rolling) -----------------------
        _buildWheels() {
            const r = 1.6;              // smaller tyres that tuck under the body
            this._wheelRadius = r;
            const halfTrk = HW + 0.3;
            const halfLen = HL - 4;
            const axleY = r;
            const tireMat = this._mat(0x18181c);
            const hubMat  = this._mat(0x9a9aa2);
            const tireGeo = new THREE.CylinderGeometry(r, r, 1.3, 14).rotateZ(Math.PI / 2);
            const hubGeo  = new THREE.CylinderGeometry(r * 0.45, r * 0.45, 1.4, 8).rotateZ(Math.PI / 2);
            this._geos.push(tireGeo, hubGeo);

            const make = (x, z, steer) => {
                const sg = new THREE.Group();
                sg.position.set(x, axleY, z);
                const spin = new THREE.Group();
                const tire = new THREE.Mesh(tireGeo, tireMat); tire.castShadow = true;
                spin.add(tire); spin.add(new THREE.Mesh(hubGeo, hubMat));
                sg.add(spin);
                this.group.add(sg);
                this._wheels.push(spin);
                this._wheelPivots.push({ group: sg, downY: axleY, upY: axleY + 5 });
                if (steer) this._steerGroups.push(sg);
            };
            // Single steering front axle, plus a tandem (dual) rear axle so the
            // camper rolls on six wheels like the reference chassis. These are
            // placeholder positions; _alignWheelsToBody() re-seats them under the
            // GLB once it has loaded and its real footprint is known.
            const rearGap = r * 1.4;   // spacing between the two rear axles
            make( halfTrk,  halfLen, true);
            make(-halfTrk,  halfLen, true);
            make( halfTrk, -halfLen + rearGap, false);
            make(-halfTrk, -halfLen + rearGap, false);
            make( halfTrk, -halfLen - rearGap, false);
            make(-halfTrk, -halfLen - rearGap, false);
        }

        // Re-seat the wheels under the loaded GLB body using its real bounding box:
        // a single steering front axle near the nose and a tandem rear axle near
        // the tail, tracked just inside the body sides and resting on the ground.
        _alignWheelsToBody() {
            if (!this._model || !this._wheelPivots.length) return;
            // setFromObject yields a WORLD-space box, but the wheel pivots live in
            // this.group's local frame (the group is moved/rotated out to the van's
            // world position). Convert the box back into group-local space first.
            this.group.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(this._model);
            box.applyMatrix4(new THREE.Matrix4().copy(this.group.matrixWorld).invert());
            const r = this._wheelRadius;
            const halfTrk = Math.max(2, (box.max.x - box.min.x) / 2 - r * 0.4);
            const frontZ  = box.max.z - r * 2.4;       // front axle just behind the nose
            const rearMid = box.min.z + r * 3.2;       // rear tandem centre near the tail
            const gap     = r * 1.4;
            const axleY   = r;                         // tyres sit on the ground (y=0)
            const layout = [
                [ halfTrk, frontZ], [-halfTrk, frontZ],
                [ halfTrk, rearMid + gap], [-halfTrk, rearMid + gap],
                [ halfTrk, rearMid - gap], [-halfTrk, rearMid - gap]
            ];
            for (let i = 0; i < this._wheelPivots.length && i < layout.length; i++) {
                const p = this._wheelPivots[i];
                p.group.position.set(layout[i][0], axleY, layout[i][1]);
                p.downY = axleY;
                p.upY = axleY + 5;
            }
        }

        // Hinge the rear door (glTF node "CamperBackDoor") on a real pivot. The
        // GLB carries no authored pivot of its own - every node shares the same
        // single origin as the whole model - so a pivot is built at the edge of
        // the door's own bounding box nearest the body centreline and the door
        // mesh is re-parented under it without moving it, giving it something
        // real to swing open on instead of spinning around the model's origin.
        _rigDoor(model) {
            const doorMesh = model.getObjectByName('CamperBackDoor');
            if (!doorMesh) return;
            this._body.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(doorMesh);
            if (box.isEmpty()) return;
            box.applyMatrix4(new THREE.Matrix4().copy(this._body.matrixWorld).invert());
            const center = box.getCenter(new THREE.Vector3());
            const hingeX = Math.abs(box.min.x) < Math.abs(box.max.x) ? box.min.x : box.max.x;

            const pivot = new THREE.Group();
            pivot.position.set(hingeX, center.y, center.z);
            this._body.add(pivot);

            const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
            doorMesh.getWorldPosition(wp);
            doorMesh.getWorldQuaternion(wq);
            doorMesh.getWorldScale(ws);
            doorMesh.parent.remove(doorMesh);
            pivot.add(doorMesh);
            pivot.updateMatrixWorld(true);
            const local = new THREE.Matrix4()
                .compose(wp, wq, ws)
                .premultiply(new THREE.Matrix4().copy(pivot.matrixWorld).invert());
            local.decompose(doorMesh.position, doorMesh.quaternion, doorMesh.scale);

            this._doorPivot    = pivot;
            this._doorLocalPos = pivot.position.clone();   // for getInteractables()
            this._doorClosedY  = pivot.rotation.y;
            // Swing outward from the hinge, away from the centreline it sits closest to.
            this._doorOpenY    = this._doorClosedY + (hingeX <= 0 ? -1 : 1) * DOOR_OPEN_RAD;
        }

        // ---- cockpit: dash, backlit gauges, animated steering wheel ------------
        // Built to line up with the driving scene's DRIVER_SEAT (x +1.2 left seat,
        // eye y 8.3, z 8.0 looking toward +Z): the wheel sits just ahead of and
        // below the eye, the gauge cluster peeks over its top edge. Keep these X
        // offsets in step with DRIVER_SEAT.x (CamperDrivingSystem) if the seat
        // moves again (+X is the driver's LEFT).
        _buildCockpit() {
            const c = new THREE.Group();
            this._body.add(c);
            this._cockpit = c;

            // Dash slab across the cab, just under the windshield.
            const dashMat = this._mat(0x2b2320, { map: loadTex('brown_grey_slate.jpg', 2) });
            const dash = this._box(2 * HW - 1.0, 1.7, 2.0, dashMat, 0, 4.9, HL - 1.9, c);
            dash.rotation.x = -0.14;
            this._box(2 * HW - 1.0, 0.5, 2.6, dashMat, 0, 3.9, HL - 2.2, c);

            // Gauge cluster: canvas dial face (always readable, reads as backlit
            // at night thanks to MeshBasicMaterial) + 3D needles.
            const gaugeTex = new THREE.CanvasTexture(this._makeGaugeCanvas());
            this._gaugeTex = gaugeTex;
            const gaugeMat = new THREE.MeshBasicMaterial({ map: gaugeTex });
            this._mats.push(gaugeMat);
            // Compact cluster tucked in front of the left driver seat rather than
            // the wide slab that used to float toward the cab centre. The whole
            // group is scaled down so it reads as an instrument binnacle peeking
            // over the wheel instead of filling the lower half of the view.
            const gGeo = new THREE.PlaneGeometry(2.2, 1.1);
            this._geos.push(gGeo);
            const cluster = new THREE.Group();
            // Mirrored to the left (+X) seat, lowered, and shrunk. Tilted up so it
            // faces the raised driver eye.
            cluster.position.set(0.9, 5.85, HL - 2.6);
            cluster.rotation.y = Math.PI;      // face the driver (looking +Z)
            cluster.rotation.x = -0.30;
            cluster.scale.setScalar(0.45);
            c.add(cluster);
            cluster.add(new THREE.Mesh(gGeo, gaugeMat));

            // Needles pivot at each dial centre; dial sweep is 270 degrees from
            // lower-left (value 0) through the top to lower-right (full scale).
            // Scaled down to match the smaller dial faces.
            const needleGeo = new THREE.BoxGeometry(0.04, 0.38, 0.02).translate(0, 0.15, 0);
            const smallGeo  = new THREE.BoxGeometry(0.035, 0.18, 0.02).translate(0, 0.06, 0);
            this._geos.push(needleGeo, smallGeo);
            const needleMat = this._mat(0xd94f30);
            this._speedNeedle = new THREE.Mesh(needleGeo, needleMat);
            this._speedNeedle.position.set(-0.55, 0.045, 0.03);
            cluster.add(this._speedNeedle);
            this._rpmNeedle = new THREE.Mesh(needleGeo, needleMat);
            this._rpmNeedle.position.set(0.55, 0.045, 0.03);
            cluster.add(this._rpmNeedle);
            this._fuelNeedle = new THREE.Mesh(smallGeo, needleMat);
            this._fuelNeedle.position.set(0, -0.27, 0.03);
            cluster.add(this._fuelNeedle);

            // Steering column + wheel. The wheel is built flat (axis +Y) inside
            // a pivot tilted so the column points up toward the driver; the spin
            // group turns around the local axis with the live steering input.
            const pivot = new THREE.Group();
            pivot.position.set(1.75, 5.35, HL - 3.35);
            pivot.rotation.x = -1.02;
            c.add(pivot);
            const colGeo = new THREE.CylinderGeometry(0.11, 0.11, 1.5, 8);
            this._geos.push(colGeo);
            const col = new THREE.Mesh(colGeo, this._mat(0x1c1c22));
            col.position.y = -0.8;
            pivot.add(col);
            const spin = new THREE.Group();
            pivot.add(spin);
            this._steerWheel = spin;
            // Smaller wheel: a compact rim that sits neatly in front of the driver.
            const rimGeo   = new THREE.TorusGeometry(0.78, 0.08, 8, 22).rotateX(Math.PI / 2);
            const hubGeo   = new THREE.CylinderGeometry(0.16, 0.19, 0.14, 10);
            const spokeGeo = new THREE.BoxGeometry(0.11, 0.06, 0.76).translate(0, 0, 0.38);
            this._geos.push(rimGeo, hubGeo, spokeGeo);
            const wheelMat = this._mat(0x24242c);
            spin.add(new THREE.Mesh(rimGeo, wheelMat));
            spin.add(new THREE.Mesh(hubGeo, wheelMat));
            for (const a of [0.52, 2.62, 4.71]) {   // classic three-spoke layout
                const sp = new THREE.Mesh(spokeGeo, wheelMat);
                sp.rotation.y = a;
                spin.add(sp);
            }

            // Tail brake lights, lit while braking (see updateDash).
            this._brakeMat = new THREE.MeshLambertMaterial({
                color: 0x5a1010, emissive: 0xff2211, emissiveIntensity: 0.15
            });
            this._mats.push(this._brakeMat);
            const blGeo = new THREE.BoxGeometry(1.6, 0.9, 0.3);
            this._geos.push(blGeo);
            for (const sx of [-(HW - 1.0), HW - 1.0]) {
                const bl = new THREE.Mesh(blGeo, this._brakeMat);
                bl.position.set(sx, 4.6, -HL - 0.05);
                this._body.add(bl);
            }
        }

        // Dial faces for the cluster: speedo (left), tacho (right), fuel (small,
        // centre-bottom). The 512x256 canvas maps 1:1 onto the 3.6x1.8 plane.
        _makeGaugeCanvas() {
            const cv = document.createElement('canvas');
            cv.width = 512; cv.height = 256;
            const ctx = cv.getContext('2d');
            ctx.fillStyle = '#14120f';
            ctx.fillRect(0, 0, 512, 256);
            ctx.strokeStyle = '#3a332a';
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, 506, 250);

            const dial = (cx, cy, r, ticks, labelStep, max, label) => {
                ctx.strokeStyle = '#4a4238';
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
                ctx.textAlign = 'center';
                for (let i = 0; i <= ticks; i++) {
                    const frac = i / ticks;
                    const a = (135 + frac * 270) * Math.PI / 180;   // through the top
                    const c1 = Math.cos(a), s1 = Math.sin(a);
                    ctx.strokeStyle = '#cbbf9e';
                    ctx.lineWidth = i % 2 === 0 ? 3 : 1.5;
                    ctx.beginPath();
                    ctx.moveTo(cx + c1 * (r - 10), cy + s1 * (r - 10));
                    ctx.lineTo(cx + c1 * r, cy + s1 * r);
                    ctx.stroke();
                    if (i % labelStep === 0) {
                        ctx.fillStyle = '#e8dcc0';
                        ctx.font = 'bold 16px monospace';
                        ctx.fillText(String(Math.round(max * frac)), cx + c1 * (r - 26), cy + s1 * (r - 26) + 5);
                    }
                }
                ctx.fillStyle = '#a1680d';
                ctx.font = 'bold 13px monospace';
                ctx.fillText(label, cx, cy + r * 0.55);
            };
            dial(128, 118, 96, 16, 4, SPEEDO_MAX_KMH, T('Camper.speedDial'));
            dial(384, 118, 96, 8, 2, 8, T('Camper.rpmDial'));

            // Small fuel dial: just E and F.
            const fx = 256, fy = 190, fr = 46;
            ctx.strokeStyle = '#4a4238';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#e8dcc0';
            ctx.font = 'bold 15px monospace';
            for (const [frac, t] of [[0, 'E'], [1, 'F']]) {
                const a = (135 + frac * 270) * Math.PI / 180;
                ctx.fillText(t, fx + Math.cos(a) * (fr - 16), fy + Math.sin(a) * (fr - 16) + 5);
            }
            ctx.fillStyle = '#a1680d';
            ctx.font = 'bold 12px monospace';
            ctx.fillText('FUEL', fx, fy + fr + 16);
            return cv;
        }

        // Live dash: needle sweep is 270 degrees, rotation.z from +135 deg
        // (value 0, lower-left) down to -135 deg (full scale, lower-right).
        updateDash(kmh, rpm01, fuel01, brakeOn) {
            const ang = (f) => 2.356 - Math.max(0, Math.min(1, f)) * 4.712;
            if (this._speedNeedle) this._speedNeedle.rotation.z = ang((kmh || 0) / SPEEDO_MAX_KMH);
            if (this._rpmNeedle)   this._rpmNeedle.rotation.z   = ang(rpm01 || 0);
            if (this._fuelNeedle)  this._fuelNeedle.rotation.z  = ang(fuel01 || 0);
            if (this._brakeMat)    this._brakeMat.emissiveIntensity = brakeOn ? 1.5 : 0.15;
        }

        // ---- upgrade modules --------------------------------------------------
        _buildRotor(parent, x, z) {
            this._box(1.4, 1, 5, this._mat(0x33333a), x, 11, z, parent);
            const g = new THREE.Group();
            g.position.set(x * 1.25, 13, z * 1.05);
            const hub = new THREE.CylinderGeometry(0.7, 0.7, 1, 8); this._geos.push(hub);
            g.add(new THREE.Mesh(hub, this._mat(0x111114)));
            const blade = this._mat(0x8a8a92, { map: loadTex('brown_grey_slate.jpg', 1) });
            const b1 = new THREE.BoxGeometry(9, 0.3, 1.3); const b2 = new THREE.BoxGeometry(1.3, 0.3, 9);
            this._geos.push(b1, b2);
            g.add(new THREE.Mesh(b1, blade)); g.add(new THREE.Mesh(b2, blade));
            parent.add(g);
            this._rotors.push(g);
        }
        _buildFlightModule() {
            this._modFlight = new THREE.Group();
            this._body.add(this._modFlight);
            this._buildRotor(this._modFlight,  HW - 0.5,  8);
            this._buildRotor(this._modFlight, -HW + 0.5,  8);
            this._buildRotor(this._modFlight,  HW - 0.5, -8);
            this._buildRotor(this._modFlight, -HW + 0.5, -8);
            this._modFlight.visible = false;
        }
        _buildWaterModule() {
            this._modWater = new THREE.Group();
            this._body.add(this._modWater);
            const pMat = this._mat(0x9a8a6a, { map: loadTex('brown_green_marble.jpg', 2) });
            for (const sx of [-(HW + 1.2), HW + 1.2]) {
                const geo = new THREE.BoxGeometry(2.4, 2.4, 2 * HL); this._geos.push(geo);
                const p = new THREE.Mesh(geo, pMat); p.position.set(sx, 2, 0); p.castShadow = true;
                this._modWater.add(p);
            }
            this._modWater.visible = false;
        }
        _buildSubModule() {
            this._modSub = new THREE.Group();
            this._body.add(this._modSub);
            const g = new THREE.Group();
            g.position.set(0, 5, REAR - 1);
            const hub = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 6).rotateX(Math.PI / 2); this._geos.push(hub);
            g.add(new THREE.Mesh(hub, this._mat(0x111114)));
            const bMat = this._mat(0xb9b9c2, { map: loadTex('brown_grey_slate.jpg', 1) });
            for (let i = 0; i < 3; i++) {
                const bg = new THREE.BoxGeometry(0.7, 4, 0.4); this._geos.push(bg);
                const blade = new THREE.Mesh(bg, bMat);
                blade.rotation.z = (i / 3) * Math.PI * 2;
                g.add(blade);
            }
            this._modSub.add(g);
            this._props.push(g);
            this._box(0.9, 6, 0.9, this._mat(0x2a2a30), 2.5, 12.5, -3, this._modSub);
            this._box(2, 0.9, 1, this._mat(0x2a2a30), 3.3, 16, -3, this._modSub);
            this._modSub.visible = false;
        }

        // ---- environment ------------------------------------------------------
        setEnv(env) {
            this._env = env;
            this._wheelTarget       = env === 'road' ? 1 : 0;
            this._modFlight.visible = env === 'air';
            this._modWater.visible  = env === 'water' || env === 'underwater';
            this._modSub.visible    = env === 'underwater';
        }
        getEnv() { return this._env; }

        // The only interactable this model exposes is the rear door, once rigged.
        getInteractables() {
            if (!this._doorPivot) return [];
            return [{ kind: 'door', name: 'CamperBackDoor', pos: this._doorLocalPos }];
        }
        // Proximity-driven open/close (see setDoorOpen); toggleDoor flips whatever
        // the door's current target is, for callers that just want it to react.
        setDoorOpen(open) { this._doorTargetOpen = !!open; }
        isDoorOpen() { return !!this._doorTargetOpen; }
        toggleDoor() { this.setDoorOpen(!this._doorTargetOpen); }
        // World-space position of the door's hinge, for proximity checks. Null
        // while the GLB is still loading (before the door has been rigged).
        getDoorWorldPosition(target) {
            if (!this._doorPivot) return null;
            return this._doorPivot.getWorldPosition(target || new THREE.Vector3());
        }

        // ---- per-frame --------------------------------------------------------
        applyMotion(speedUnits, steer, delta, roll, pitch, bounce) {
            this._lastSteer = steer || 0;
            if (this._wheels.length && this._wheelDeploy > 0.02) {
                const spin = (speedUnits * delta) / Math.max(0.001, this._wheelRadius);
                for (const w of this._wheels) w.rotation.x += spin;
            }
            const targetSteer = (steer || 0) * 0.5;
            this._steerCur += (targetSteer - this._steerCur) * Math.min(1, delta * 10);
            for (const sg of this._steerGroups) sg.rotation.y = this._steerCur;
            // The cockpit steering wheel turns with the same eased input, geared
            // up so full lock reads as roughly 160 degrees of wheel.
            if (this._steerWheel) this._steerWheel.rotation.y = this._steerCur * 5.6;
            if (this._body) {
                const k = Math.min(1, delta * 8);
                this._body.rotation.z += ((roll  || 0) - this._body.rotation.z) * k;
                this._body.rotation.x += ((pitch || 0) - this._body.rotation.x) * k;
                this._body.position.y += ((bounce || 0) - this._body.position.y) * Math.min(1, delta * 12);
            }
            this._speedAbs = Math.abs(speedUnits);
        }

        update(delta) {
            this._wheelDeploy += (this._wheelTarget - this._wheelDeploy) * Math.min(1, delta * 4);
            for (const p of this._wheelPivots) {
                p.group.position.y = p.upY + (p.downY - p.upY) * this._wheelDeploy;
                p.group.visible = this._wheelDeploy > 0.05;
            }
            const spd = this._speedAbs || 0;
            if (this._modFlight.visible) { const w = (28 + spd * 0.4) * delta; for (const r of this._rotors) r.rotation.y += w; }
            if (this._modSub.visible)    { const w = (6 + spd * 0.3) * delta;  for (const p of this._props)  p.rotation.z += w; }

            if (this._doorPivot) {
                const targetY = this._doorTargetOpen ? this._doorOpenY : this._doorClosedY;
                this._doorPivot.rotation.y += (targetY - this._doorPivot.rotation.y) * Math.min(1, delta * DOOR_ANIM_RATE);
            }
        }

        dispose() {
            this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
            for (const g of this._geos) g.dispose();
            for (const m of this._mats) m.dispose();
            this._geos.length = 0; this._mats.length = 0;
            this._bodyMats.length = 0; this._glassMats.length = 0;
            if (this._gaugeTex) this._gaugeTex.dispose();
            if (window.HypernetCamper && window.HypernetCamper._active === this) {
                window.HypernetCamper._active = null;
            }
            if (this._scene) this._scene.remove(this.group);
        }
    }

    window.HypernetCamper = window.HypernetCamper || {};
    window.HypernetCamper.CamperModel = CamperModel;
    window.HypernetCamper.PAINTS = PAINTS;
    // Repaint the live camper (if one is built) or remember the choice for the
    // next spawn. Returns the applied paint name. e.g. HypernetCamper.setPaint('ocean')
    window.HypernetCamper.setPaint = function (name) {
        window.HypernetCamper.paint = PAINTS[name] ? name : 'classic';
        if (window.HypernetCamper._active) {
            return window.HypernetCamper._active.applyPaint(window.HypernetCamper.paint);
        }
        return window.HypernetCamper.paint;
    };

    // =========================================================================
    // The rest of the garage
    //
    // The camper above is a loaded GLB with hardware bolted onto it. Every OTHER
    // vehicle the party can own (VehicleSystem.js: the car, the bike, the
    // inflatable boat, the flying broom) had no model at all - only a walking
    // sprite - so they are generated here, out of the same boxes, cylinders and
    // lathes the camper's own upgrade hardware is made of. The starship is not
    // generated here at all: the galaxy simulation already builds the party's
    // own ship, trait by trait, and that IS the ship (GalaxySim.ShipModel).
    //
    // Every model is built to the same contract, so anything that shows one -
    // the repair bay, the party menu's garage, the 3D world itself - can show
    // any of them without knowing which it has:
    //
    //   { group, length, update(t), dispose() }
    //
    // Forward is +Z, up is +Y, the wheels (or the keel, or the bristles) rest on
    // y = 0, and `length` is how long the thing is in its own units, so a viewer
    // can frame a bike and a starship with the same camera.
    // =========================================================================
    const VEHICLE_PALETTE = {
        car:   { body: 0xb2402f, trim: 0x2a2a2e, glass: 0x9fd4e8, metal: 0xb9bec6 },
        bike:  { body: 0x2f6fb2, trim: 0x1c1c20, glass: 0xdedede, metal: 0xc8ccd2 },
        boat:  { body: 0xd8862a, trim: 0x40352a, glass: 0xdedede, metal: 0x8d8d93 },
        broom: { body: 0x7a5230, trim: 0xd2a24c, glass: 0xdedede, metal: 0x6b5a44 }
    };

    // A builder's scratchpad: it collects everything it makes so dispose() can
    // give all of it back in one go.
    class VehicleBuild {
        constructor() {
            this.group = new THREE.Group();
            this._geos = [];
            this._mats = [];
            this._spin = [];    // { obj, axis, rate } - wheels, rotors, bristles
            this.length = 10;
        }
        mat(hex, opts) {
            const m = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, opts || {}));
            this._mats.push(m);
            return m;
        }
        add(geo, material, x, y, z, parent) {
            this._geos.push(geo);
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(x || 0, y || 0, z || 0);
            (parent || this.group).add(mesh);
            return mesh;
        }
        box(w, h, d, material, x, y, z, parent) {
            return this.add(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
        }
        cyl(rt, rb, h, seg, material, x, y, z, parent) {
            return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z, parent);
        }
        // A wheel lies on its side and turns about its own axle (world X).
        wheel(radius, width, material, x, y, z) {
            const w = this.cyl(radius, radius, width, 14, material, x, y, z);
            w.rotation.z = Math.PI / 2;
            this._spin.push({ obj: w, axis: 'y', rate: 3.2 });
            return w;
        }
        finish(length) {
            this.length = length;
            const self = this;
            return {
                group: this.group,
                length,
                update(t) {
                    for (const s of self._spin) s.obj.rotation[s.axis] = t * s.rate;
                },
                dispose() {
                    for (const g of self._geos) g.dispose();
                    for (const m of self._mats) m.dispose();
                    self._geos.length = 0;
                    self._mats.length = 0;
                    if (self.group.parent) self.group.parent.remove(self.group);
                }
            };
        }
    }

    // --- the car: a small three-box hatchback ---------------------------------
    function buildCar() {
        const b = new VehicleBuild();
        const P = VEHICLE_PALETTE.car;
        const body = b.mat(P.body), trim = b.mat(P.trim);
        const glass = b.mat(P.glass, { transparent: true, opacity: 0.55 });
        const metal = b.mat(P.metal);
        // Chassis, then the cabin set back on it, then the bonnet sloping away.
        b.box(3.4, 1.3, 8.2, body, 0, 1.7, 0);
        b.box(3.1, 1.2, 3.6, body, 0, 2.9, -0.4);
        b.box(3.0, 1.0, 3.4, glass, 0, 2.95, -0.4);
        b.box(3.2, 0.6, 2.2, body, 0, 1.9, 2.6);          // bonnet
        b.box(3.2, 0.7, 1.6, body, 0, 2.0, -3.4);         // boot
        b.box(3.5, 0.35, 0.5, trim, 0, 1.35, 4.15);       // front bumper
        b.box(3.5, 0.35, 0.5, trim, 0, 1.35, -4.15);      // rear bumper
        // Lamps: two white in front, two red behind.
        const lamp = b.mat(0xfff2c0), tail = b.mat(0xc03028);
        b.box(0.7, 0.4, 0.2, lamp, 1.2, 2.0, 4.1);
        b.box(0.7, 0.4, 0.2, lamp, -1.2, 2.0, 4.1);
        b.box(0.7, 0.35, 0.2, tail, 1.2, 2.1, -4.1);
        b.box(0.7, 0.35, 0.2, tail, -1.2, 2.1, -4.1);
        for (const [x, z] of [[1.75, 2.6], [-1.75, 2.6], [1.75, -2.6], [-1.75, -2.6]]) {
            b.wheel(1.1, 0.6, trim, x, 1.1, z);
            b.wheel(0.5, 0.66, metal, x, 1.1, z);          // hub cap
        }
        return b.finish(9);
    }

    // --- the bike: a frame, two big wheels and a set of bars ------------------
    function buildBike() {
        const b = new VehicleBuild();
        const P = VEHICLE_PALETTE.bike;
        const frame = b.mat(P.body), trim = b.mat(P.trim), metal = b.mat(P.metal);
        const tube = (len, x, y, z, rx, ry) => {
            const t = b.cyl(0.14, 0.14, len, 8, frame, x, y, z);
            t.rotation.x = rx || 0;
            t.rotation.y = ry || 0;
            return t;
        };
        // Down tube, top tube, seat tube, forks: a diamond frame on its side.
        tube(3.4, 0, 2.1, 0.2, Math.PI / 2 - 0.5);
        tube(3.0, 0, 2.9, -0.1, Math.PI / 2);
        tube(1.7, -0.02, 2.1, -1.4, 0.25);
        tube(2.4, 0, 2.2, 1.7, 0.22);
        b.box(0.9, 0.22, 0.5, trim, 0, 3.1, -1.6);        // saddle
        const bars = b.cyl(0.1, 0.1, 1.5, 8, metal, 0, 3.3, 1.9);
        bars.rotation.z = Math.PI / 2;                     // handlebars, across
        b.cyl(0.28, 0.28, 0.32, 10, metal, 0, 1.55, 0.35); // chainring
        for (const z of [1.85, -1.75]) {
            const w = b.cyl(1.55, 1.55, 0.16, 20, trim, 0, 1.55, z);
            w.rotation.z = Math.PI / 2;
            b._spin.push({ obj: w, axis: 'y', rate: 3.6 });
            // Four spokes, enough to read as a wheel once it is turning.
            for (let i = 0; i < 4; i++) {
                const sp = b.cyl(0.05, 0.05, 3.0, 5, metal, 0, 0, 0, w);
                sp.rotation.x = Math.PI / 2;
                sp.rotation.z = (i / 4) * Math.PI;
            }
        }
        return b.finish(5);
    }

    // --- the boat: an inflatable dinghy, a tube round a floor -----------------
    function buildBoat() {
        const b = new VehicleBuild();
        const P = VEHICLE_PALETTE.boat;
        const hull = b.mat(P.body), trim = b.mat(P.trim), metal = b.mat(P.metal);
        // The tube: a torus flattened into an oval, with a pointed bow cone.
        const ring = b.add(new THREE.TorusGeometry(2.4, 0.62, 10, 26), hull, 0, 0.7, 0);
        ring.rotation.x = Math.PI / 2;
        ring.scale.set(0.78, 1.5, 1);
        const bow = b.cyl(0.05, 0.62, 2.4, 12, hull, 0, 0.7, 4.0);
        bow.rotation.x = -Math.PI / 2;
        b.box(2.6, 0.22, 5.4, trim, 0, 0.5, 0.2);          // the floor
        for (const z of [1.2, -0.4, -1.9]) b.box(2.5, 0.18, 0.5, trim, 0, 0.95, z);  // benches
        b.box(0.7, 0.9, 0.7, metal, 0, 1.2, -3.2);         // outboard
        const shaft = b.cyl(0.12, 0.12, 1.4, 8, metal, 0, 0.5, -3.5);
        shaft.rotation.x = 0.35;
        const prop = b.cyl(0.5, 0.5, 0.08, 3, metal, 0, -0.05, -3.75);
        prop.rotation.x = Math.PI / 2;
        b._spin.push({ obj: prop, axis: 'y', rate: 9 });
        return b.finish(8);
    }

    // --- the broom: a stave, a binding and a fan of bristles ------------------
    function buildBroom() {
        const b = new VehicleBuild();
        const P = VEHICLE_PALETTE.broom;
        const wood = b.mat(P.body), cord = b.mat(P.trim), straw = b.mat(0xc9a15a);
        const stave = b.cyl(0.16, 0.2, 7.0, 10, wood, 0, 1.4, 0.4);
        stave.rotation.x = Math.PI / 2;
        b.cyl(0.3, 0.3, 0.5, 10, cord, 0, 1.4, -2.1);      // the binding
        // The head: a fan of straws splaying back off the binding.
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            const r = 0.12 + (i % 3) * 0.06;
            const st = b.cyl(0.03, 0.06, 2.2, 4, straw, Math.cos(a) * r, 1.4 + Math.sin(a) * r, -3.2);
            st.rotation.x = Math.PI / 2;
            st.rotation.z = Math.cos(a) * 0.12;
            st.rotation.y = Math.sin(a) * 0.12;
        }
        // A footrest, and the stirrup the rider's boot goes through.
        const rest = b.cyl(0.07, 0.07, 1.1, 6, cord, 0, 1.2, 1.4);
        rest.rotation.z = Math.PI / 2;
        return b.finish(7);
    }

    const VEHICLE_BUILDERS = { car: buildCar, bike: buildBike, boat: buildBoat, broom: buildBroom };

    // The camper, for anything that only wants to LOOK at one: a stand-in built
    // out of the same parts as the rest of the garage rather than the real GLB,
    // which loads asynchronously and registers itself as the live camper. The
    // one the party actually drives is still CamperModel above.
    function buildCamperStandIn() {
        const b = new VehicleBuild();
        const shell = b.mat(0xe8e2d4), trim = b.mat(0x3a3a40);
        const glass = b.mat(0x9fd4e8, { transparent: true, opacity: 0.55 });
        const stripe = b.mat(0xc4622f);
        b.box(4.6, 4.0, 12.0, shell, 0, 3.6, -1.2);        // the box body
        b.box(4.4, 2.4, 3.6, shell, 0, 2.8, 5.4);          // the cab
        b.box(4.2, 1.5, 0.3, glass, 0, 3.4, 7.15);         // windscreen
        b.box(0.3, 1.6, 3.0, glass, 2.31, 3.4, 5.2);
        b.box(0.3, 1.6, 3.0, glass, -2.31, 3.4, 5.2);
        b.box(4.62, 0.5, 12.0, stripe, 0, 2.2, -1.2);      // the stripe down the side
        b.box(4.0, 0.35, 0.4, trim, 0, 1.5, 7.2);          // bumper
        for (const [x, z] of [[2.3, 4.6], [-2.3, 4.6], [2.3, -4.4], [-2.3, -4.4]]) {
            b.wheel(1.5, 0.85, trim, x, 1.5, z);
        }
        return b.finish(15);
    }

    // =========================================================================
    // The ship's bridge
    // =========================================================================
    // The inside of the starship, and the counterpart of the camper's cabin:
    // the room the party stands in while the ship is flown, built here with the
    // rest of the garage rather than in the driving scene, because it is a
    // vehicle body like any other.
    //
    // It is drawn in the SHIP'S OWN FRAME (forward +Z, +X to the pilot's left,
    // four units to the metre) and sized to VoxelWorldCore's SHIP_BRIDGE_BOUNDS,
    // so what the walls say and what the walk allows are the same room. The
    // helm console stands under the forward viewport on the centre line, with
    // four stations round it for everybody else.
    //
    // Seen only from inside: the driving scene shows it in the first-person
    // views and hides it in the chase camera, so it never reads through the
    // hull from outside (see VoxelWorldScene._setBridgeVisible).
    //
    // Returned to the shared model contract, so anything that can show a
    // vehicle can show this: { group, length, update(t), dispose() }, plus
    // `stations` (where the party sits) and `helm` (where the pilot does).
    function buildShipBridge() {
        const b = new VehicleBuild();
        const HULL  = b.mat(0x2b3038);
        const DECK  = b.mat(0x1c2027);
        const TRIM  = b.mat(0xc08a3a);
        const PANEL = b.mat(0x161a20);
        const GLASS = b.mat(0x9fd8ff, { transparent: true, opacity: 0.18 });
        const LIT   = b.mat(0x7fd8ff);

        const W = 9.4, D = 13.4, FLOOR = 4.0, CEIL = 12.0;

        // Deck, ceiling and the four walls. The forward wall is mostly viewport,
        // so it is built as a frame round the glass rather than a slab.
        b.box(W * 2, 0.6, D * 2, DECK, 0, FLOOR - 0.3, 0);
        b.box(W * 2, 0.6, D * 2, HULL, 0, CEIL + 0.3, 0);
        b.box(0.6, CEIL - FLOOR, D * 2, HULL,  W, (FLOOR + CEIL) / 2, 0);
        b.box(0.6, CEIL - FLOOR, D * 2, HULL, -W, (FLOOR + CEIL) / 2, 0);
        b.box(W * 2, CEIL - FLOOR, 0.6, HULL, 0, (FLOOR + CEIL) / 2, -D);
        // The forward wall: sill, header, two mullions, and the view between.
        b.box(W * 2, 1.6, 0.6, HULL, 0, FLOOR + 0.8, D);
        b.box(W * 2, 1.6, 0.6, HULL, 0, CEIL - 0.8, D);
        b.box(0.5, CEIL - FLOOR, 0.5, HULL,  3.4, (FLOOR + CEIL) / 2, D);
        b.box(0.5, CEIL - FLOOR, 0.5, HULL, -3.4, (FLOOR + CEIL) / 2, D);
        b.box(W * 2 - 1.0, CEIL - FLOOR - 3.2, 0.15, GLASS, 0, (FLOOR + CEIL) / 2, D);

        // A lit strip down each side of the ceiling, so the room reads as lit
        // from inside rather than by whatever star it happens to be near.
        b.box(1.2, 0.2, D * 1.7, LIT,  W - 1.4, CEIL - 0.2, 0);
        b.box(1.2, 0.2, D * 1.7, LIT, -(W - 1.4), CEIL - 0.2, 0);

        // The helm: a console across the centre line under the viewport, its
        // top raked toward the pilot, with a lit instrument face on it. Kept
        // clear of SHIP_HELM_SEAT (z 8.0) so the eye sits behind it.
        const console_ = b.box(6.4, 1.4, 2.6, PANEL, 0, FLOOR + 1.9, 9.6);
        console_.rotation.x = -0.18;
        b.box(6.0, 0.12, 1.9, LIT, 0, FLOOR + 2.62, 9.4).rotation.x = -0.18;
        b.box(6.8, 0.4, 0.5, TRIM, 0, FLOOR + 1.1, 8.5);
        // The pilot's chair, at the seat itself.
        b.box(2.0, 0.4, 2.0, PANEL, 0, FLOOR + 1.5, 7.4);
        b.box(2.0, 2.4, 0.4, PANEL, 0, FLOOR + 2.6, 6.5);

        // Four stations round it, matching SHIP_BRIDGE_SEATS: a desk against
        // the wall and a seat in front of it, so a party member sitting there
        // is sitting AT something.
        const stations = [
            { x:  5.4, z:  2.6 }, { x: -5.4, z:  2.6 },
            { x:  5.4, z: -4.2 }, { x: -5.4, z: -4.2 },
        ];
        for (const st of stations) {
            const side = st.x > 0 ? 1 : -1;
            b.box(0.9, 1.2, 3.2, PANEL, st.x + side * 2.0, FLOOR + 1.8, st.z);
            b.box(0.12, 0.9, 2.6, LIT,  st.x + side * 1.5, FLOOR + 2.1, st.z);
            b.box(1.6, 0.35, 1.6, PANEL, st.x, FLOOR + 1.3, st.z);
            b.box(1.6, 1.8, 0.35, PANEL, st.x, FLOOR + 2.2, st.z - side * 0.0 - 0.9);
        }

        // A gold rail round the well in front of the viewport, which is the one
        // piece of the room that says whose ship it is.
        b.box(W * 1.5, 0.25, 0.25, TRIM, 0, FLOOR + 3.2, 5.2);

        const model = b.finish(D * 2);
        model.helm = { x: 0, y: 6.6, z: 8.0 };
        model.stations = stations.map((st) => ({ x: st.x, y: 6.3, z: st.z }));
        return model;
    }

    // =========================================================================
    // window.VehicleModels
    // =========================================================================
    const VehicleModels = {
        // Every vehicle that has a body to show, in the order a garage lists
        // them. Keys match VehicleSystem's own (window.VehicleFuel /
        // window.VehiclePosition are keyed the same way).
        KEYS: ['camper', 'car', 'bike', 'boat', 'broom', 'starship'],

        // How long each vehicle really is, in the 3D world's own units (four to
        // the metre). A model is built at whatever size read best on a page; out
        // in the world it has to stand beside a person, so anything that puts
        // one on the ground scales it by this over its own `length`.
        REAL_LENGTH: {
            camper: 26, car: 18, bike: 7, boat: 14, broom: 6, starship: 4000, airship: 4000
        },

        // The factor a built model has to be multiplied by to stand at true size.
        worldScale(key, model) {
            const real = this.REAL_LENGTH[key];
            if (!real || !model || !(model.length > 0)) return 1;
            return real / model.length;
        },

        has(key) {
            if (key === 'starship' || key === 'airship') {
                return !!(window.GalaxySim && window.GalaxySim.ShipModel);
            }
            return key === 'camper' || !!VEHICLE_BUILDERS[key];
        },

        // A model, built to the shared contract. The starship is the party's
        // own ship out of the galaxy simulation, traits and all; everything else
        // is generated here.
        build(key) {
            if (typeof THREE === 'undefined') return null;
            if (key === 'starship' || key === 'airship') {
                const SM = window.GalaxySim && window.GalaxySim.ShipModel;
                if (!SM) return null;
                const m = SM.build(SM.getConfig());
                if (!m) return null;
                return {
                    group: m.group, length: 14,
                    update(t) { if (m.update) m.update(t); },
                    dispose() { if (m.dispose) m.dispose(); }
                };
            }
            if (key === 'camper') return buildCamperStandIn();
            const fn = VEHICLE_BUILDERS[key];
            return fn ? fn() : null;
        },

        // The inside of the ship: the room the party stands in while it is
        // flown, to the same contract as build() plus `helm` and `stations`.
        // Nothing else in the garage has an interior, so nothing else answers.
        buildBridge() {
            if (typeof THREE === 'undefined') return null;
            return buildShipBridge();
        },

        // A live, slowly turning portrait of a vehicle, bound to a canvas the
        // caller owns. Used by the repair bay and by the party menu's garage;
        // returns null where there is no WebGL, no THREE, or no such vehicle,
        // and the caller is expected to fall back on its own sprite.
        createPreview(canvas, key) {
            if (!canvas || typeof THREE === 'undefined') return null;
            const model = this.build(key);
            if (!model) return null;

            let renderer;
            try {
                renderer = new THREE.WebGLRenderer({
                    canvas, alpha: true, antialias: true, powerPreference: 'low-power'
                });
            } catch (e) { model.dispose(); return null; }
            const w = Math.max(1, canvas.clientWidth || canvas.width || 200);
            const h = Math.max(1, canvas.clientHeight || canvas.height || 150);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            renderer.setSize(w, h, false);
            if ('outputColorSpace' in renderer && THREE.SRGBColorSpace !== undefined) {
                renderer.outputColorSpace = THREE.SRGBColorSpace;
            }

            const scene = new THREE.Scene();
            scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a3b2a, 1.0));
            const key1 = new THREE.DirectionalLight(0xfff4e0, 1.1);
            key1.position.set(6, 10, 8);
            scene.add(key1);

            // Framed off the model's own length, so a bike fills the frame as
            // well as a starship does.
            const turn = new THREE.Group();
            turn.add(model.group);
            scene.add(turn);
            const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 400);
            const d = model.length * 1.35;
            camera.position.set(d * 0.62, d * 0.44, d * 0.9);
            camera.lookAt(0, model.length * 0.16, 0);

            let raf = null, t0 = null, dead = false;
            const frame = (now) => {
                if (dead) return;
                raf = requestAnimationFrame(frame);
                if (t0 == null) t0 = now;
                const t = (now - t0) / 1000;
                turn.rotation.y = t * 0.5;
                if (model.update) model.update(t);
                renderer.render(scene, camera);
            };
            raf = requestAnimationFrame(frame);

            return {
                dispose() {
                    if (dead) return;
                    dead = true;
                    if (raf) cancelAnimationFrame(raf);
                    model.dispose();
                    try { renderer.dispose(); } catch (e) { /* already gone */ }
                    try {
                        if (renderer.forceContextLoss) renderer.forceContextLoss();
                    } catch (e) { /* already gone */ }
                }
            };
        }
    };

    window.VehicleModels = VehicleModels;
})();
