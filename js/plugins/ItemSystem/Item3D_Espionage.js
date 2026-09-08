//=============================================================================
// Item 3D Models - Espionage
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the espionage kit of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Espionage
 * ============================================================================
 *
 * One model per entry, keyed by database id. Everything on this shelf is
 * meant not to be noticed, so the models are deliberately plain: unmarked
 * card, matt black, no branding, nothing that catches light. What tells them
 * apart is the shape of the job each one does.
 *
 * NOT listed in plugins.js; injected at runtime from ITEM3D_FAMILIES in
 * ItemSystemUtils.js. Builders take (entry, rand), are seeded from the
 * database id and name alone, are built in metres and stand on the X/Z plane.
 * The shared construction library of WeaponSystemProcedural and the helpers of
 * Item3D_Generic are available as `this`.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.ItemModelSystem) {
    console.error('[Item3D_Espionage] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Espionage',

    unique: {
      i374: 'createLockpickModel',
      i375: 'createDiscretePackagingKitModel',
      i376: 'createPremiumSamplesModel',
      i377: 'createMemorySageModel',
      i378: 'createTruthRevealingSolutionModel',
      i379: 'createONUTerminalModel',
      i380: 'createStreetBlendModel',
      i381: 'createTraceRemovalPowderModel',
      i382: 'createPressBadgeCollectionModel',
      i383: 'createProductTestingKitModel',
      i384: 'createUndercoverDisguiseKitModel',
      i385: 'createSecureTransportCaseModel',
      i386: 'createEndlessNotepadModel',
      i387: 'createPrecisionScaleModel',
      i388: 'createCovertRecorderModel',
      i389: 'createFalseIdentityKitModel',
      i391: 'createStreetNetworkContactsModel',
      i392: 'createInformantDirectoryModel',
      i393: 'createEncryptedPocketsModel',
      i394: 'createInvestigativeLaptopModel'
    },

    models: {
      // 374. Lockpick: one hook pick and a tension wrench, crossed, which is
      // the whole of what opens a single door.
      createLockpickModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xB0B6BC, 0.28);
        const pick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.001, 0.003), steel);
        pick.position.set(0, 0.0005, -0.004);
        group.add(pick);
        const hook = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.001, 0.005), steel);
        hook.position.set(0.036, 0.0005, -0.006);
        group.add(hook);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.003, 0.006),
          this._mat(0x2A2A32, { roughness: 0.85, metalness: 0.05 }));
        grip.position.set(-0.026, 0.0015, -0.004);
        group.add(grip);
        const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0012, 0.004), steel);
        wrench.position.set(-0.008, 0.0016, 0.008);
        wrench.rotation.y = 0.35;
        group.add(wrench);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0012, 0.008), steel);
        foot.position.set(0.012, 0.0016, 0.016);
        group.add(foot);
        return group;
      },

      // 375. Discrete Packaging Kit: unmarked brown card, a roll of plain
      // tape and no printing anywhere.
      createDiscretePackagingKitModel(entry, rand) {
        const group = new THREE.Group();
        const card = this._mat(0xA88A5A, { roughness: 0.98, metalness: 0.0 });
        for (let i = 0; i < 3; i++) {
          const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.05), card);
          sheet.position.set(i * 0.001, 0.002 + i * 0.005, -i * 0.002);
          sheet.rotation.y = (i - 1) * 0.04;
          group.add(sheet);
        }
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, this.seg(16, 9)),
          this._mat(0xD8CFB8, { roughness: 0.6, metalness: 0.0 }));
        roll.rotation.z = Math.PI / 2;
        roll.position.set(0.05, 0.014, 0.012);
        group.add(roll);
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.021, this.seg(12, 7)),
          this._mat(0x8A7A5A, { roughness: 0.98, metalness: 0.0 }));
        core.rotation.z = Math.PI / 2;
        core.position.set(0.05, 0.014, 0.012);
        group.add(core);
        return group;
      },

      // 376. Premium Samples: a tray of perfume vials, expensive-looking and
      // carried purely to be seen carrying them.
      createPremiumSamplesModel(entry, rand) {
        const group = new THREE.Group();
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.03),
          this._mat(0x1A1A20, { roughness: 0.4, metalness: 0.2 }));
        tray.position.y = 0.004;
        group.add(tray);
        const hues = [0xE0C8A0, 0xC8A0C8, 0xA0C8D8, 0xD8C860];
        for (let i = 0; i < 4; i++) {
          const vial = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.008),
            this._mat(0xE0EAEE, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.45 }));
          vial.position.set(-0.021 + i * 0.014, 0.02, 0);
          group.add(vial);
          const scent = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.006),
            this._mat(hues[i], { roughness: 0.25, metalness: 0.0 }));
          scent.position.set(-0.021 + i * 0.014, 0.015, 0);
          group.add(scent);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.006, this.seg(10, 6)),
            this._mat(0xC8A54A, { roughness: 0.4, metalness: 0.8 }));
          cap.position.set(-0.021 + i * 0.014, 0.035, 0);
          group.add(cap);
        }
        return group;
      },

      // 377. Memory Sage: a bundle of dried sage bound at one end, the tip
      // charred from being lit once.
      createMemorySageModel(entry, rand) {
        const group = new THREE.Group();
        const leaf = this._mat(0x8A9A7A, { roughness: 0.98, metalness: 0.0 });
        const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, 0.075, this.seg(12, 7)), leaf);
        bundle.rotation.z = Math.PI / 2 - 0.08;
        bundle.position.y = 0.013;
        group.add(bundle);
        const char = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.01, this.seg(10, 6)),
          this._mat(0x3A342A, { roughness: 1.0, metalness: 0.0 }));
        char.rotation.z = Math.PI / 2 - 0.08;
        char.position.set(0.041, 0.011, 0);
        group.add(char);
        const twine = this._mat(0xC8A860, { roughness: 1.0, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const wrap = new THREE.Mesh(
            new THREE.TorusGeometry(0.0122, 0.0012, this.seg(5, 3), this.seg(12, 7)), twine);
          wrap.rotation.y = Math.PI / 2;
          wrap.rotation.z = -0.08;
          wrap.position.set(-0.026 + i * 0.009, 0.014, 0);
          group.add(wrap);
        }
        return group;
      },

      // 378. Truth-Revealing Solution: a dropper bottle beside a sheet of
      // paper where the hidden lines have come up.
      createTruthRevealingSolutionModel(entry, rand) {
        const group = new THREE.Group();
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0012, 0.07),
          this._mat(0xEFE8D4, { roughness: 0.98, metalness: 0.0 }));
        sheet.position.set(0.03, 0.0006, 0);
        sheet.rotation.y = 0.12;
        group.add(sheet);
        const revealed = this._mat(0x3A6A9A, { roughness: 0.9, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.03 - i * 0.006, 0.0005, 0.0018), revealed);
          line.position.set(0.03, 0.0016, -0.016 + i * 0.016);
          line.rotation.y = 0.12;
          group.add(line);
        }
        this._vessel(group, rand, {
          r: 0.011, h: 0.038, neck: 0.005, color: 0x3A2A16, roughness: 0.3, opacity: 0.9,
          fill: 0x6AB0C8, fillLevel: 0.5, capColor: 0x1A1A1E
        });
        const pipette = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.024, this.seg(8, 5)),
          this._mat(0xE0EAEE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.55 }));
        pipette.position.y = 0.056;
        group.add(pipette);
        return group;
      },

      // 379. ONU Terminal: a folding diplomatic terminal, screen up, with the
      // assembly's ring device on the lid.
      createONUTerminalModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2A3A4A, { roughness: 0.4, metalness: 0.3 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.055), shell);
        base.position.y = 0.005;
        group.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.006, 0.055), shell);
        lid.position.set(0, 0.033, -0.026);
        lid.rotation.x = -1.2;
        group.add(lid);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.001, 0.045),
          this._mat(0x6AA0D0, { roughness: 0.1, metalness: 0.05, emissive: 0x2A5A90, emissiveIntensity: 0.55 }));
        screen.position.set(0, 0.0365, -0.0245);
        screen.rotation.x = -1.2;
        group.add(screen);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0012, this.seg(5, 3), this.seg(16, 9)),
          this._glow(0x9AD0F0, 0.6));
        ring.rotation.x = -1.2 + Math.PI / 2;
        ring.position.set(0, 0.038, -0.026);
        group.add(ring);
        if (this.wantsTrim()) {
          const keyMat = this._mat(0x1A222A, { roughness: 0.8, metalness: 0.1 });
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 8; c++) {
              const key = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.0015, 0.005), keyMat);
              key.position.set(-0.028 + c * 0.008, 0.0108, -0.012 + r * 0.008);
              group.add(key);
            }
          }
        }
        return group;
      },

      // 380. Street Blend: a folded wrap of stimulant with a razor blade
      // beside it, the way it is actually sold.
      createStreetBlendModel(entry, rand) {
        const group = new THREE.Group();
        const paper = this._plate([
          [-0.018, -0.014], [0.018, -0.014], [0.014, 0.014], [-0.014, 0.014]
        ], 0.001, this._mat(0xE0DACC, { roughness: 0.98, metalness: 0.0 }));
        paper.rotation.x = -Math.PI / 2;
        paper.position.y = 0.0005;
        group.add(paper);
        const fold = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.012),
          this._mat(0xD8D2C4, { roughness: 0.98, metalness: 0.0 }));
        fold.position.set(-0.002, 0.0028, 0);
        group.add(fold);
        const powder = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0012, this.seg(12, 7)),
          this._mat(0xE8E4D8, { roughness: 1.0, metalness: 0.0 }));
        powder.position.set(0.008, 0.0012, 0.008);
        group.add(powder);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0006, 0.009),
          this._steel(0xC8CED4, 0.15));
        blade.position.set(0.03, 0.0003, -0.008);
        blade.rotation.y = 0.3;
        group.add(blade);
        return group;
      },

      // 381. Trace Removal Powder: a shaker can of fine powder with a brush
      // to work it in, both matt so neither shines under a light.
      createTraceRemovalPowderModel(entry, rand) {
        const group = new THREE.Group();
        const can = this._mat(0x22262A, { roughness: 0.9, metalness: 0.1 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, this.seg(16, 9)), can);
        body.position.y = 0.025;
        group.add(body);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, this.seg(16, 9)),
          this._mat(0x3A3E44, { roughness: 0.85, metalness: 0.15 }));
        top.position.y = 0.053;
        group.add(top);
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.007, this.seg(6, 4)),
              this._mat(0x14161A, { roughness: 0.95, metalness: 0.05 }));
            const a = i * Math.PI * 2 / 5;
            hole.position.set(Math.cos(a) * 0.006, 0.053, Math.sin(a) * 0.006);
            group.add(hole);
          }
        }
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.045, this.seg(10, 6)),
          this._mat(0x1A1A1E, { roughness: 0.9, metalness: 0.05 }));
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.042, 0.0045, 0.006);
        group.add(handle);
        const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.018, this.seg(10, 6)),
          this._mat(0x4A4A52, { roughness: 0.99, metalness: 0.0 }));
        bristles.rotation.z = -Math.PI / 2;
        bristles.position.set(0.073, 0.0045, 0.006);
        group.add(bristles);
        return group;
      },

      // 382. Press Badge Collection: a stack of laminated cards on lanyards,
      // each from a different outlet, fanned so several show.
      createPressBadgeCollectionModel(entry, rand) {
        const group = new THREE.Group();
        const colours = [0xC83A3A, 0x2A6AB0, 0x3A8A5A, 0xC8A02A];
        for (let i = 0; i < 4; i++) {
          const card = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.0015, 0.052),
            this._mat(0xF0EFEA, { roughness: 0.35, metalness: 0.1 }));
          card.position.set(i * 0.005, 0.0008 + i * 0.0017, -i * 0.004);
          card.rotation.y = (i - 1.5) * 0.22;
          group.add(card);
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.0006, 0.012),
            this._mat(colours[i], { roughness: 0.9, metalness: 0.0 }));
          band.position.set(i * 0.005, 0.0018 + i * 0.0017, -i * 0.004 - 0.018);
          band.rotation.y = (i - 1.5) * 0.22;
          group.add(band);
        }
        const lanyard = new THREE.Mesh(
          new THREE.TorusGeometry(0.018, 0.0018, this.seg(5, 3), this.seg(18, 10)),
          this._mat(0x1A1A20, { roughness: 0.98, metalness: 0.0 }));
        lanyard.rotation.x = Math.PI / 2;
        lanyard.position.set(-0.026, 0.0018, 0.03);
        group.add(lanyard);
        return group;
      },

      // 383. Product Testing Kit: three reagent tubes in a stand, one already
      // gone the colour that means the sample is not what it was sold as.
      createProductTestingKitModel(entry, rand) {
        const group = new THREE.Group();
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.024),
          this._mat(0x2A2A32, { roughness: 0.7, metalness: 0.1 }));
        stand.position.y = 0.005;
        group.add(stand);
        const results = [0x8A2A6A, 0xD8D2C0, 0xD8D2C0];
        for (let i = 0; i < 3; i++) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, this.seg(12, 7)),
            this._mat(0xDCE8EE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.45 }));
          tube.position.set(-0.015 + i * 0.015, 0.028, 0);
          group.add(tube);
          const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.016, this.seg(10, 6)),
            this._mat(results[i], { roughness: 0.3, metalness: 0.0 }));
          fluid.position.set(-0.015 + i * 0.015, 0.018, 0);
          group.add(fluid);
          const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, this.seg(10, 6)),
            this._mat(0x4A4A52, { roughness: 0.9, metalness: 0.0 }));
          stopper.position.set(-0.015 + i * 0.015, 0.05, 0);
          group.add(stopper);
        }
        return group;
      },

      // 384. Undercover Disguise Kit: an open case with a wig, a pair of
      // glasses and a moustache in it, which is exactly as convincing as it
      // sounds.
      createUndercoverDisguiseKitModel(entry, rand) {
        const group = new THREE.Group();
        const caseM = this._mat(0x3A2A22, { roughness: 0.85, metalness: 0.02 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.05), caseM);
        base.position.y = 0.008;
        group.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.004, 0.05), caseM);
        lid.position.set(0, 0.04, -0.032);
        lid.rotation.x = -1.15;
        group.add(lid);
        const hair = this._mat(0x4A3020, { roughness: 0.99, metalness: 0.0 });
        const wig = new THREE.Mesh(
          new THREE.SphereGeometry(0.018, this.seg(12, 7), this.seg(9, 5), 0, Math.PI * 2, 0, Math.PI / 2), hair);
        wig.scale.y = 0.7;
        wig.position.set(-0.02, 0.016, 0);
        group.add(wig);
        const tache = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.004, 0.005), hair);
        tache.position.set(0.02, 0.018, 0.008);
        group.add(tache);
        const frame = this._mat(0x1A1A1E, { roughness: 0.4, metalness: 0.2 });
        for (const s of [-1, 1]) {
          const lens = new THREE.Mesh(
            new THREE.TorusGeometry(0.007, 0.0012, this.seg(5, 3), this.seg(14, 8)), frame);
          lens.rotation.x = Math.PI / 2;
          lens.position.set(0.016 + s * 0.008, 0.017, -0.012);
          group.add(lens);
        }
        return group;
      },

      // 385. Secure Transport Case: a reinforced flight case with corner
      // castings, a combination catch and a small armed light.
      createSecureTransportCaseModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x1E2226, { roughness: 0.5, metalness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.026, 0.06), shell);
        body.position.y = 0.013;
        group.add(body);
        const lidM = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.012, 0.06), shell);
        lidM.position.y = 0.032;
        group.add(lidM);
        const alloy = this._steel(0x9AA0A8, 0.35);
        for (const x of [-0.042, 0.042]) {
          for (const z of [-0.03, 0.03]) {
            const corner = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.04, 0.008), alloy);
            corner.position.set(x, 0.02, z);
            group.add(corner);
          }
        }
        const catchM = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.01, 0.004), alloy);
        catchM.position.set(0, 0.026, 0.031);
        group.add(catchM);
        const dial = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.002),
          this._mat(0xC8C8CC, { roughness: 0.6, metalness: 0.4 }));
        dial.position.set(0, 0.026, 0.0335);
        group.add(dial);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0018, this.seg(8, 5), this.seg(6, 4)),
          this._glow(0xE03A2A, 0.9));
        led.position.set(0.03, 0.033, 0.03);
        led.userData.pulse = { freq: 0.7, min: 0.15, max: 1.0 };
        group.add(led);
        const handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.012, 0.0025, this.seg(6, 4), this.seg(14, 8), Math.PI), alloy);
        handle.rotation.x = Math.PI / 2;
        handle.rotation.z = Math.PI;
        handle.position.set(0, 0.038, -0.031);
        group.add(handle);
        return group;
      },

      // 386. Journalist's Endless Notepad: a spiral pad with a pen through
      // the coil, one page turned back and never running out.
      createEndlessNotepadModel(entry, rand) {
        const group = new THREE.Group();
        const board = this._mat(0x8A3A2A, { roughness: 0.9, metalness: 0.02 });
        const paper = this._mat(0xF0ECDC, { roughness: 0.98, metalness: 0.0 });
        this._slab(group, 0.05, 0.002, 0.08, board, 0.001);
        this._slab(group, 0.048, 0.01, 0.078, paper, 0.007);
        const turned = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.0012, 0.03), paper);
        turned.position.set(0, 0.014, 0.03);
        turned.rotation.x = -0.55;
        group.add(turned);
        const wire = this._steel(0x9AA0A8, 0.35);
        for (let i = 0; i < (this.wantsTrim() ? 6 : 3); i++) {
          const coil = new THREE.Mesh(
            new THREE.TorusGeometry(0.0055, 0.0008, this.seg(5, 3), this.seg(10, 6)), wire);
          coil.rotation.y = Math.PI / 2;
          coil.position.set(0, 0.007, -0.034 + i * 0.0125);
          group.add(coil);
        }
        const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.06, this.seg(8, 5)),
          this._mat(0x1A1A20, { roughness: 0.5, metalness: 0.15 }));
        pen.rotation.x = Math.PI / 2;
        pen.position.set(0.002, 0.016, 0);
        group.add(pen);
        return group;
      },

      // 387. Precision Digital Scale: a flat platform scale with a lit
      // readout and a tamper seal across the case joint.
      createPrecisionScaleModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x22262C, { roughness: 0.45, metalness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.008, 0.05), shell);
        body.position.y = 0.004;
        group.add(body);
        const pan = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.04),
          this._steel(0xC0C6CC, 0.2));
        pan.position.set(0, 0.009, -0.004);
        group.add(pan);
        const readout = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.001, 0.01),
          this._mat(0x8AE0A0, { roughness: 0.1, metalness: 0.05, emissive: 0x2A8A50, emissiveIntensity: 0.6 }));
        readout.position.set(0, 0.0085, 0.02);
        group.add(readout);
        const seal = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0006, 0.008),
          this._mat(0xE0C82A, { roughness: 0.9, metalness: 0.0 }));
        seal.position.set(0.026, 0.0045, 0.0252);
        seal.rotation.x = Math.PI / 2;
        group.add(seal);
        return group;
      },

      // 388. Covert Recorder: a matt slab the size of a card, one pinhole mic
      // and a single tell-tale light, and nothing else on it.
      createCovertRecorderModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x14161A, { roughness: 0.95, metalness: 0.1 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.052), shell);
        body.position.y = 0.003;
        group.add(body);
        const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.007, this.seg(8, 5)),
          this._mat(0x2A2E32, { roughness: 0.9, metalness: 0.2 }));
        mic.position.set(0, 0.003, 0.024);
        mic.rotation.x = Math.PI / 2;
        group.add(mic);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0012, this.seg(6, 4), this.seg(5, 3)),
          this._glow(0xE03A2A, 0.8));
        led.position.set(0.01, 0.0062, 0.018);
        led.userData.pulse = { freq: 0.6, min: 0.1, max: 1.0 };
        group.add(led);
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0012, 0.03),
          this._steel(0x4A4E54, 0.5));
        clip.position.set(0, 0.0068, -0.008);
        clip.rotation.x = 0.06;
        group.add(clip);
        return group;
      },

      // 389. False Identity Kit: three laminated cards fanned out of a
      // wallet, all of them the same face under different names.
      createFalseIdentityKitModel(entry, rand) {
        const group = new THREE.Group();
        const leather = this._mat(0x2A1E18, { roughness: 0.9, metalness: 0.02 });
        const wallet = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.008, 0.04), leather);
        wallet.position.set(-0.012, 0.004, 0);
        group.add(wallet);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.003, 0.038), leather);
        flap.position.set(-0.012, 0.016, -0.018);
        flap.rotation.x = -0.9;
        group.add(flap);
        const tints = [0xE8E8EC, 0xE0E8D8, 0xE8E0D8];
        for (let i = 0; i < 3; i++) {
          const card = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0012, 0.032),
            this._mat(tints[i], { roughness: 0.35, metalness: 0.1 }));
          card.position.set(0.026 + i * 0.003, 0.0088 + i * 0.0014, -0.006 + i * 0.006);
          card.rotation.y = (i - 1) * 0.24;
          group.add(card);
          const photo = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0005, 0.016),
            this._mat(0x6A7A8A, { roughness: 0.7, metalness: 0.05 }));
          photo.position.set(0.008 + i * 0.003, 0.0096 + i * 0.0014, -0.006 + i * 0.006);
          photo.rotation.y = (i - 1) * 0.24;
          group.add(photo);
        }
        return group;
      },

      // 391. Street Network Contacts: a rubber-banded deck of scrap paper and
      // beer mats, every one with a number on it.
      createStreetNetworkContactsModel(entry, rand) {
        const group = new THREE.Group();
        const scraps = [0xE8E0C8, 0xD8CFC0, 0xE0D8B8, 0xC8C0A8];
        for (let i = 0; i < 4; i++) {
          const scrap = new THREE.Mesh(new THREE.BoxGeometry(0.03 + i * 0.004, 0.0015, 0.022 + i * 0.002),
            this._mat(scraps[i], { roughness: 0.98, metalness: 0.0 }));
          scrap.position.set(i * 0.002, 0.0008 + i * 0.0017, -i * 0.002);
          scrap.rotation.y = (i - 1.5) * 0.18;
          group.add(scrap);
        }
        const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.002, this.seg(16, 9)),
          this._mat(0xC8B89A, { roughness: 0.99, metalness: 0.0 }));
        mat.position.set(0.004, 0.0085, 0.002);
        group.add(mat);
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.014, 0.0012, this.seg(5, 3), this.seg(14, 8)),
          this._mat(0x8A6A4A, { roughness: 0.95, metalness: 0.0 }));
        band.rotation.y = Math.PI / 2;
        band.position.set(0.004, 0.005, 0);
        band.scale.set(1, 0.45, 1.6);
        group.add(band);
        const ink = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0005, 0.0016),
          this._mat(0x2A2A5A, { roughness: 0.95, metalness: 0.0 }));
        ink.position.set(0.004, 0.0096, 0.002);
        group.add(ink);
        return group;
      },

      // 392. Informant Network Directory: a hard-backed address book with tab
      // dividers standing out of the block.
      createInformantDirectoryModel(entry, rand) {
        const group = new THREE.Group();
        const board = this._mat(0x22303A, { roughness: 0.8, metalness: 0.05 });
        const paper = this._mat(0xE8E4D4, { roughness: 0.98, metalness: 0.0 });
        this._slab(group, 0.055, 0.004, 0.085, board, 0.002);
        this._slab(group, 0.052, 0.022, 0.082, paper, 0.015);
        this._slab(group, 0.055, 0.004, 0.085, board, 0.028);
        const spine = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.085, this.seg(12, 7), 1, false, 0, Math.PI), board);
        spine.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        spine.position.set(-0.0275, 0.015, 0);
        group.add(spine);
        const tints = [0xC83A3A, 0xC8A02A, 0x3A8A5A, 0x3A6AC8];
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const tab = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.012),
            this._mat(tints[i], { roughness: 0.9, metalness: 0.0 }));
          tab.position.set(0.029, 0.008 + i * 0.004, -0.03 + i * 0.02);
          group.add(tab);
        }
        return group;
      },

      // 393. Encrypted Pockets: a coded ledger card in a sleeve, the entries
      // written as symbols instead of names.
      createEncryptedPocketsModel(entry, rand) {
        const group = new THREE.Group();
        const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.045),
          this._mat(0x1E2228, { roughness: 0.6, metalness: 0.15 }));
        sleeve.position.y = 0.002;
        group.add(sleeve);
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.0012, 0.042),
          this._mat(0xD8D2C0, { roughness: 0.95, metalness: 0.0 }));
        card.position.set(0.012, 0.0046, 0);
        group.add(card);
        const ink = this._mat(0x2A2A32, { roughness: 0.95, metalness: 0.0 });
        if (this.wantsTrim()) {
          for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 3; c++) {
              const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.0004, 0.003), ink);
              glyph.position.set(0.0 + c * 0.011, 0.0053, -0.014 + r * 0.009);
              glyph.rotation.y = ((r + c) % 3) * 0.5;
              group.add(glyph);
            }
          }
        }
        return group;
      },

      // 394. Investigative Laptop: a rugged clamshell, rubber corners, screen
      // open on a wall of text.
      createInvestigativeLaptopModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x3A3E42, { roughness: 0.55, metalness: 0.2 });
        const rubber = this._mat(0x1A1C20, { roughness: 0.98, metalness: 0.0 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.012, 0.07), shell);
        base.position.y = 0.006;
        group.add(base);
        for (const x of [-0.047, 0.047]) {
          for (const z of [-0.034, 0.034]) {
            const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.01), rubber);
            bumper.position.set(x, 0.007, z);
            group.add(bumper);
          }
        }
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.008, 0.065), shell);
        lid.position.set(0, 0.044, -0.038);
        lid.rotation.x = -1.25;
        group.add(lid);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.001, 0.055),
          this._mat(0x2A8A6A, { roughness: 0.1, metalness: 0.05, emissive: 0x1A6A50, emissiveIntensity: 0.55 }));
        screen.position.set(0, 0.048, -0.0365);
        screen.rotation.x = -1.25;
        group.add(screen);
        if (this.wantsTrim()) {
          const keyMat = this._mat(0x22262A, { roughness: 0.85, metalness: 0.1 });
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 9; c++) {
              const key = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.0015, 0.005), keyMat);
              key.position.set(-0.034 + c * 0.0085, 0.0128, -0.014 + r * 0.008);
              group.add(key);
            }
          }
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0012, 0.014),
            this._mat(0x2E3236, { roughness: 0.6, metalness: 0.15 }));
          pad.position.set(0, 0.0128, 0.02);
          group.add(pad);
        }
        return group;
      }
    }
  });
})();
