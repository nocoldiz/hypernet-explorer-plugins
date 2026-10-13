//=============================================================================
// 3D Battler System - Apex (most powerful enemies)
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Really-unique bespoke models reserved for the most powerful enemies
 * (Boxing Elemental, Tiamat). Each follows its enemy's <Archetype:> body-part
 * keys so dismemberment + hit-flash still work. Requires 3DBattlerSystem; loads
 * LAST so its name pins win.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Apex
 * ============================================================================
 *
 * One-off showpiece models assigned by exact name (registerNamed outranks the
 * Archetype meta), reserved for the highest-power enemies that otherwise rode a
 * shared rig. Parts are mapped to each enemy's ARCHETYPE keys:
 *
 *   Boxing Elemental (<Archetype: Elemental>, 999,999 HP) - colossal energy
 *     pugilist. Parts: CORE, UPPER_FORM (torso), LOWER_FORM (legs),
 *     LEFT_APPENDAGE / RIGHT_APPENDAGE (glove arms).
 *   Tiamat, Mother of Chaos (<Archetype: Hydra>) - three-headed winged chaos
 *     dragon. Parts: BODY, HEAD_ONE/TWO/THREE (+ HEAD/NECK), LEFT_WING/
 *     RIGHT_WING, LEFT_LEG/RIGHT_LEG, TAIL.
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Apex] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const APEX_PROFILES = {
        boxingelemental: { variant: 'boxer',  scale: 3.3, texturePool: 'fire',  bodyColor: 0x5fa8ff, coreColor: 0xcdeaff, gloveColor: 0xd02424, accent: 0xffe14a, hue: [0.56, 0.05], sat: [0.55, 0.10], lit: [0.60, 0.10] },
        tiamat:          { variant: 'tiamat', scale: 3.9, texturePool: 'void',  bodyColor: 0x3c2a4e, accent: 0xff3a6a, bone: 0xe8dcc0, hue: [0.83, 0.08], sat: [0.45, 0.12], lit: [0.30, 0.08] }
    };

    class ApexBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = APEX_PROFILES[creatureType] || APEX_PROFILES.boxingelemental;
            super(scale, offsetY, battler, profile, 0, creatureType || 'boxingelemental');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._headList = [];
            if (this.variant === 'boxer') this.facingYaw = 0; // a boxer faces you
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.6 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity), side: THREE.DoubleSide
            });
            this._materials.push(m); return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.6 : rough)); }
        _gEye(parent, x, y, z, accent, r) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(r || 0.07, 8, 8), this._mat(accent, 1.0, 0.2, accent));
            e.material.emissiveIntensity = 1.0; e.position.set(x, y, z); parent.add(e); return e;
        }

        async load(physicsWorld) {
            this.physicsWorld = physicsWorld;
            if (this.variant === 'tiamat') this._buildTiamat();
            else this._buildBoxer();
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Boxing Elemental: energy pugilist with oversized gloves ──────────
        _buildBoxer() {
            const p = this.profile;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16), this._mat(p.bodyColor, 0.42, 0.2, p.bodyColor)); this.body.scale.set(1.0, 1.35, 0.9); this.body.position.set(0, 1.75, 0); this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), this._mat(p.coreColor, 1.0, 0.1, p.coreColor)); this.core.material.emissiveIntensity = 1.3; this.core.position.set(0, 1.75, 0); this.bodyGroup.add(this.core);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), this._mat(p.bodyColor, 0.5, 0.2, p.bodyColor)));
            this._gEye(this.head, -0.12, 0.02, 0.24, p.accent, 0.06);
            this._gEye(this.head, 0.12, 0.02, 0.24, p.accent, 0.06);
            this.head.position.set(0, 2.75, 0); this.bodyGroup.add(this.head);

            this.larm = this._boxArm(-1, p); this.rarm = this._boxArm(1, p);
            this.legs = new THREE.Group();
            for (const x of [-0.28, 0.28]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.1, 0.95, 10), this._mat(p.bodyColor, 0.5, 0.2, p.bodyColor)); leg.position.set(x, 0.82, 0); this.legs.add(leg); }
            this.bodyGroup.add(this.legs);

            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['CORE'], this.core);
            set(['UPPER_FORM', 'BODY', 'TORSO'], this.body);
            set(['HEAD', 'SKULL'], this.head);
            set(['LEFT_APPENDAGE', 'LEFT_ARM', 'EMBER_ARMS', 'SPIKE_ARMS', 'WATER_ARMS'], this.larm);
            set(['RIGHT_APPENDAGE', 'RIGHT_ARM'], this.rarm);
            set(['LOWER_FORM', 'ASH_LEGS', 'GEAR_LEGS', 'LEFT_LEG', 'RIGHT_LEG'], this.legs);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.head, this.larm, this.rarm, this.legs] },
                { gone: ['UPPER_FORM', 'BODY', 'TORSO'], hide: [this.body, this.head, this.larm, this.rarm] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head] },
                { gone: ['LEFT_APPENDAGE', 'LEFT_ARM'], hide: [this.larm] },
                { gone: ['RIGHT_APPENDAGE', 'RIGHT_ARM'], hide: [this.rarm] },
                { gone: ['LOWER_FORM'], hide: [this.legs] },
            ];
        }
        _boxArm(side, p) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.65, 10), this._mat(p.bodyColor, 0.5, 0.2, p.bodyColor)); arm.position.y = -0.32; g.add(arm);
            const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), this._mat(0xf0f0f0, 1.0, 0.5)); cuff.position.y = -0.6; g.add(cuff);
            const glove = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), this._mat(p.gloveColor, 1.0, 0.4)); glove.scale.set(1, 0.92, 1.12); glove.position.y = -0.9; g.add(glove);
            const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), this._mat(p.gloveColor, 1.0, 0.4)); thumb.position.set(side * -0.12, -0.82, 0.22); g.add(thumb);
            // Raised boxer guard.
            g.position.set(side * 0.62, 2.05, 0.15); g.rotation.x = -0.5; g.rotation.z = side * 0.25; g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Tiamat: three-headed winged chaos dragon ─────────────────────────
        _buildTiamat() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 14), skin); this.body.scale.set(1.1, 1.0, 1.5); this.body.position.set(0, 1.45, 0); this.bodyGroup.add(this.body);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), skin); chest.position.set(0, 1.6, 0.55); this.bodyGroup.add(chest);

            this.head1 = this._tHead(skin, -0.42, 1.95, 0.45, -0.5, p);
            this.head2 = this._tHead(skin, 0.0, 2.1, 0.55, 0.0, p);
            this.head3 = this._tHead(skin, 0.42, 1.95, 0.45, 0.5, p);

            this.lWing = this._tWing(-1, p); this.rWing = this._tWing(1, p);
            this.leftLeg = this._tLeg(skin, -0.42); this.rightLeg = this._tLeg(skin, 0.42);
            this.tail = this._tTail(skin, p);

            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['BODY', 'TORSO', 'CORE'], this.body);
            set(['HEAD_ONE', 'HEAD', 'NECK', 'SKULL'], this.head1);
            set(['HEAD_TWO'], this.head2);
            set(['HEAD_THREE'], this.head3);
            set(['LEFT_WING'], this.lWing); set(['RIGHT_WING'], this.rWing);
            set(['LEFT_LEG'], this.leftLeg); set(['RIGHT_LEG'], this.rightLeg);
            set(['TAIL'], this.tail);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE'], hide: [this.body, chest, this.head1, this.head2, this.head3, this.lWing, this.rWing, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['HEAD_ONE', 'HEAD', 'NECK'], hide: [this.head1] },
                { gone: ['HEAD_TWO'], hide: [this.head2] },
                { gone: ['HEAD_THREE'], hide: [this.head3] },
                { gone: ['LEFT_WING'], hide: [this.lWing] },
                { gone: ['RIGHT_WING'], hide: [this.rWing] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _tHead(mat, x, baseY, baseZ, yaw, p) {
            const g = new THREE.Group();
            let y = 0, z = 0, r = 0.17, prevR = r, prev = new THREE.Vector3(0, 0, 0);
            for (let i = 0; i < 4; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); s.position.set(0, y, z); g.add(s);
                const pt = new THREE.Vector3(0, y, z);
                if (i > 0) this.addStrut(g, mat, prev, pt, prevR, r);
                prev = pt; prevR = r;
                y += 0.26; z += 0.07; r *= 0.92;
            }
            const head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.52, 8), mat); skull.rotation.x = Math.PI / 2; skull.position.z = 0.16; head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.32), this._mat(0x140a16, 1.0, 0.6)); jaw.position.set(0, -0.09, 0.22); head.add(jaw);
            for (const hx of [-0.09, 0.09]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 5), this._mat(p.bone, 1.0, 0.5)); horn.position.set(hx, 0.13, -0.06); horn.rotation.x = -0.7; head.add(horn); }
            this._gEye(head, -0.08, 0.05, 0.2, p.accent, 0.045);
            this._gEye(head, 0.08, 0.05, 0.2, p.accent, 0.045);
            head.position.set(0, y, z + 0.05); g.add(head);
            this.addStrut(g, mat, prev, head.position, r, 0.16);
            g.position.set(x, baseY, baseZ); g.rotation.y = yaw; g._head = head; this.bodyGroup.add(g);
            this._headList.push(g); return g;
        }
        // A wing spreads outward from its own shoulder. The shared builder fans
        // its fingers toward -side, which crossed the wing over the back to the
        // far flank, so a wing that comes back crossed is rebuilt from the other
        // hand and keeps its own side.
        _tWing(side, p) {
            const mem = this._mat(p.bodyColor, 0.72, 0.6); mem.side = THREE.DoubleSide;
            const opts = { span: 1.7, fingers: 4 };
            let g = this.buildDragonWing(mem, side, side * 0.5, 1.85, -0.35, opts);
            const tips = g._wingTips || [];
            if (tips.length && tips[tips.length - 1].x * side < 0) {
                this.bodyGroup.remove(g);
                if (this._wings) { const i = this._wings.indexOf(g); if (i >= 0) this._wings.splice(i, 1); }
                g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
                g = this.buildDragonWing(mem, -side, side * 0.5, 1.85, -0.35, opts);
                g._side = side;
            }
            return g;
        }
        _tLeg(mat, x) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.6, 8), mat); thigh.position.y = -0.3; g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.5, 8), mat); shin.position.y = -0.78; g.add(shin);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), this._mat(this.profile.bone, 1.0, 0.5)); claw.position.set(i * 0.08, -1.02, 0.14); claw.rotation.x = Math.PI * 0.82; g.add(claw); }
            g.position.set(x, 1.05, 0.25); this.bodyGroup.add(g); return g;
        }
        _tTail(mat, p) {
            const g = new THREE.Group();
            let y = 0, z = 0, r = 0.24, prev = new THREE.Vector3(0, 0, 0), prevR = r;
            for (let i = 0; i < 6; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); s.position.set(0, y, z); g.add(s);
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), this._mat(p.bone, 1.0, 0.5)); spike.position.set(0, y + r, z); g.add(spike);
                const pt = new THREE.Vector3(0, y, z);
                if (i > 0) this.addStrut(g, mat, prev, pt, prevR * 0.85, r * 0.85);
                prev = pt; prevR = r;
                y -= 0.08; z -= 0.36; r *= 0.85;
            }
            g.position.set(0, 1.35, -0.75); g.rotation.x = 0.2; this.bodyGroup.add(g); return g;
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');

            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            if (this.variant === 'boxer') {
                // Bob-and-weave; alternating jabs on attack; core pulse.
                const weave = Math.sin(t * 2.2) * 0.05;
                this.model.position.y = this._baseY + Math.abs(Math.sin(t * 3)) * 0.04 * this.scale;
                this.model.position.x = baseX + weave * this.scale;
                this.model.rotation.z = Math.sin(t * 2.2) * 0.04;
                if (this.core && this.core.material) this.core.material.emissiveIntensity = 1.1 + Math.sin(t * 6) * 0.4;
                const jab = (arm, ph) => {
                    if (!arm) return;
                    const punch = fast ? Math.max(0, Math.sin(t * 12 + ph)) : 0;
                    arm.position.z = 0.15 + punch * 0.7 * this.scale * 0.18;
                    arm.rotation.x = -0.5 - punch * 0.9;
                };
                jab(this.larm, 0); jab(this.rarm, Math.PI);
                if (this.head) this.head.rotation.x = Math.sin(t * 2.2) * 0.06;
                return;
            }

            // Tiamat: weaving heads, slow wingbeats, swaying tail.
            this.model.position.y = this._baseY + Math.sin(t * 1.2) * 0.04 * this.scale;
            this._headList.forEach((h, i) => {
                if (!h.visible) return;
                h.rotation.z = Math.sin(t * 1.4 + i * 1.3) * 0.18;
                h.rotation.x = Math.sin(t * 1.05 + i) * 0.1 - (fast ? 0.35 : 0);
                if (h._head) h._head.rotation.x = Math.sin(t * 2 + i) * 0.12 + (fast ? 0.2 : 0);
            });
            const beat = Math.sin(t * (fast ? 4 : 1.7));
            // Hinged at the shoulder: + raises a wing on either side.
            if (this.lWing) this.lWing.rotation.z = -(0.15 + beat * 0.22);
            if (this.rWing) this.rWing.rotation.z = 0.15 + beat * 0.22;
            if (this.tail) this.tail.rotation.y = Math.sin(t * 1.0) * 0.22;
            if (this.leftLeg) this.leftLeg.rotation.x = Math.sin(t * 1.6) * 0.05;
            if (this.rightLeg) this.rightLeg.rotation.x = -Math.sin(t * 1.6) * 0.05;
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.3);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.6 * this.scale;
            this.model.rotation.z = prog * (this.variant === 'boxer' ? 1.0 : 0.7);
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new ApexBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = APEX_PROFILES;
    reg('boxingelemental', { aliases: ['boxingelemental'], scale: S.boxingelemental.scale, weapon: 0, create: make });
    reg('tiamat',          { aliases: ['tiamat'], scale: S.tiamat.scale, weapon: 0, create: make });

    const NAMED = {
        boxingelemental: ["Boxing Elemental"],
        tiamat: ["Tiamat, Mother of Chaos"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Apex models registered');
})();
