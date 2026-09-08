//=============================================================================
// Item 3D Models - Lifestyle
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the lifestyle shelf of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Lifestyle
 * ============================================================================
 *
 * One model per entry, keyed by database id. This is the shelf of things
 * bought to feel better for an evening: the bath kit, the smokes, the scratch
 * cards, the boxed hobby, the speaker, the flask. Two small families inside it
 * share a call rather than a silhouette, because they really are the same
 * object with a different face printed on it: the four scratch cards, and the
 * boxed consumer products.
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
    console.error('[Item3D_Lifestyle] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Lifestyle',

    unique: {
      i177: 'createRelaxationBathKitModel',
      i178: 'createCigarettePackModel',
      i179: 'createExtendedLifeBatteriesModel',
      i180: 'createSocialConnectionGameModel',
      i181: 'createScratchProfitModel',
      i182: 'createScratchAccumulateModel',
      i183: 'createScratchRelaxModel',
      i184: 'createStressReliefProgramModel',
      i185: 'createCDCaseModel',
      i186: 'createPocketSoundSystemModel',
      i187: 'createScratchCurseModel',
      i188: 'createMoodEnhancingFeastModel',
      i189: 'createRomanticEncounterKitModel',
      i190: 'createSoundCancellersModel',
      i191: 'createCareerPackageModel',
      i192: 'createPocketBonsaiModel',
      i193: 'createEntertainmentHubModel',
      i194: 'createExtremeEnergyPackModel',
      i195: 'createHomeFitnessSystemModel',
      i196: 'createPortableCaffeinatorModel',
      i197: 'createRollingTobaccoModel',
      i198: 'createHandRolledCigarModel',
      i199: 'createNicotineGumModel',
      i200: 'createPocketHipFlaskModel',
      i201: 'createBookmakersSlipModel',
      i202: 'createSlotMachineTokenModel'
    },

    models: {
      // ======================================================================
      // Shared packaging
      // ======================================================================

      /**
       * A scratch card: a printed slip with the latex panel still on, one
       * corner of it scraped off. The four cards differ only in the ink and
       * the panel, which is the whole joke about them.
       */
      _scratchCard(group, o) {
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.0015, 0.045),
          this._mat(o.card, { roughness: 0.9, metalness: 0.05 }));
        card.position.y = 0.00075;
        group.add(card);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0006, 0.024),
          this._mat(o.panel, { roughness: 0.55, metalness: 0.55 }));
        panel.position.set(0.008, 0.0018, 0);
        group.add(panel);
        if (this.wantsTrim()) {
          // The scraped corner: a patch of the panel gone, and the shavings.
          const revealed = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0004, 0.009),
            this._mat(o.ink, { roughness: 0.95, metalness: 0.0 }));
          revealed.position.set(0.021, 0.0021, -0.007);
          group.add(revealed);
          for (let i = 0; i < 3; i++) {
            const fleck = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0003, 0.0015),
              this._mat(o.panel, { roughness: 0.6, metalness: 0.5 }));
            fleck.position.set(0.03 + i * 0.003, 0.0018, 0.008 - i * 0.005);
            fleck.rotation.y = i * 0.7;
            group.add(fleck);
          }
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0004, 0.005),
            this._mat(o.ink, { roughness: 0.95, metalness: 0.0 }));
          band.position.set(-0.023, 0.0018, -0.013);
          group.add(band);
        }
        return group;
      },

      /**
       * A boxed consumer product: printed carton, a window in the face and a
       * price sticker. The hobbies and the kits on this shelf are all sold in
       * one of these.
       */
      _boxedProduct(group, o) {
        const carton = this._mat(o.color, { roughness: 0.82, metalness: 0.03 });
        const w = o.w || 0.075, h = o.h || 0.055, d = o.d || 0.05;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), carton);
        body.position.y = h / 2;
        group.add(body);
        if (o.window !== false) {
          const pane = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, h * 0.45, 0.001),
            this._mat(0xE0EAF0, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.35 }));
          pane.position.set(0, h * 0.58, d / 2 + 0.0006);
          group.add(pane);
        }
        if (this.wantsTrim()) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.16, 0.001),
            this._mat(o.band === undefined ? 0xF0ECE0 : o.band, { roughness: 0.92, metalness: 0.0 }));
          band.position.set(0, h * 0.2, d / 2 + 0.0006);
          group.add(band);
          const sticker = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.09, w * 0.09, 0.0006, this.seg(12, 7)),
            this._mat(0xE0C82A, { roughness: 0.9, metalness: 0.0 }));
          sticker.rotation.x = Math.PI / 2;
          sticker.position.set(w * 0.32, h * 0.78, d / 2 + 0.0008);
          group.add(sticker);
        }
        return group;
      },

      // ======================================================================
      // The scratch cards
      // ======================================================================

      // 181. Scratch and profit: money green, the panel silver.
      createScratchProfitModel(entry, rand) {
        return this._scratchCard(new THREE.Group(), { card: 0x2A7A4A, panel: 0xB8BCC2, ink: 0xE8E4D0 });
      },

      // 182. Scratch and accumulate: bank blue, a duller panel.
      createScratchAccumulateModel(entry, rand) {
        return this._scratchCard(new THREE.Group(), { card: 0x2A4A8A, panel: 0x9AA0A8, ink: 0xE0E8F0 });
      },

      // 183. Scratch and relax: the holiday card, sunset orange with a gold
      // panel.
      createScratchRelaxModel(entry, rand) {
        return this._scratchCard(new THREE.Group(), { card: 0xC87A2A, panel: 0xC8A54A, ink: 0x3A2A1E });
      },

      // 187. Scratch and curse: the esoteric one. Black card, a panel that
      // does not sit flat, and a sigil under the scraped corner.
      createScratchCurseModel(entry, rand) {
        const group = new THREE.Group();
        this._scratchCard(group, { card: 0x14141A, panel: 0x3A2A4A, ink: 0x8A50E0 });
        const sigil = new THREE.Mesh(
          new THREE.TorusGeometry(0.004, 0.0008, this.seg(5, 3), 6), this._glow(0x9A60F0, 0.7));
        sigil.rotation.x = Math.PI / 2;
        sigil.position.set(0.021, 0.0026, -0.007);
        sigil.userData.pulse = { freq: 0.8, min: 0.3, max: 0.9 };
        group.add(sigil);
        return group;
      },

      // ======================================================================
      // Boxed and bottled
      // ======================================================================

      // 177. Relaxation Bath Kit: a bottle of bubble bath with a folded towel
      // and a candle beside it.
      createRelaxationBathKitModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.018, h: 0.06, neck: 0.008, color: 0xE0C8E8, roughness: 0.2, opacity: 0.75,
          fill: 0xC8A0D8, fillLevel: 0.65, capColor: 0xF0F0F4
        });
        const towel = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.018, 0.03),
          this._mat(0xE8EFF0, { roughness: 0.99, metalness: 0.0 }));
        towel.position.set(0.038, 0.009, 0.004);
        group.add(towel);
        const fold = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.006, 0.03),
          this._mat(0xDCE6E8, { roughness: 0.99, metalness: 0.0 }));
        fold.position.set(0.038, 0.021, 0.004);
        group.add(fold);
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.016, this.seg(12, 7)),
          this._mat(0xE8E0CC, { roughness: 0.8, metalness: 0.0 }));
        candle.position.set(-0.03, 0.008, 0.014);
        group.add(candle);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.008, this.seg(8, 5)),
          this._glow(0xF0B450, 0.9));
        flame.position.set(-0.03, 0.021, 0.014);
        flame.userData.pulse = { freq: 3.6, min: 0.6, max: 1.0 };
        group.add(flame);
        return group;
      },

      // 178. Cigarette Pack: flip-top open, foil torn, two cigarettes stood
      // proud of the rest.
      createCigarettePackModel(entry, rand) {
        const group = new THREE.Group();
        const card = this._mat(0xE8E4DC, { roughness: 0.85, metalness: 0.02 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.022), card);
        body.position.y = 0.03;
        group.add(body);
        const warning = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.001),
          this._mat(0x14141A, { roughness: 0.95, metalness: 0.0 }));
        warning.position.set(0, 0.018, 0.0115);
        group.add(warning);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.018, 0.022), card);
        lid.position.set(0, 0.068, -0.014);
        lid.rotation.x = -0.9;
        group.add(lid);
        const foil = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.018),
          this._steel(0xC8CCD2, 0.35));
        foil.position.set(0, 0.061, 0);
        group.add(foil);
        const paper = this._mat(0xF4F2EC, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < 2; i++) {
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.03, this.seg(10, 6)), paper);
          stick.position.set(-0.008 + i * 0.01, 0.073, 0.002 - i * 0.003);
          stick.rotation.z = (i ? 1 : -1) * 0.12;
          group.add(stick);
          const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.008, this.seg(10, 6)),
            this._mat(0xC8A860, { roughness: 0.95, metalness: 0.0 }));
          filter.position.set(-0.008 + i * 0.01, 0.062, 0.002 - i * 0.003);
          filter.rotation.z = (i ? 1 : -1) * 0.12;
          group.add(filter);
        }
        return group;
      },

      // 179. Extended Life Batteries: a shrink-wrapped four-pack of cells.
      createExtendedLifeBatteriesModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x1E2A4A, { roughness: 0.45, metalness: 0.35 });
        const cap = this._steel(0xC0C6CC, 0.3);
        for (let i = 0; i < 4; i++) {
          const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.05, this.seg(14, 8)), shell);
          cell.rotation.z = Math.PI / 2;
          cell.position.set(0, 0.0072 + Math.floor(i / 2) * 0.015, (i % 2 ? 1 : -1) * 0.0078);
          group.add(cell);
          const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.004, this.seg(10, 6)), cap);
          nub.rotation.z = Math.PI / 2;
          nub.position.set(0.027, cell.position.y, cell.position.z);
          group.add(nub);
        }
        const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.033, 0.02),
          this._mat(0xDCE8F0, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.28 }));
        wrap.position.y = 0.015;
        group.add(wrap);
        return group;
      },

      // 180. Social Connection Game: the box, lid ajar, with a card fanned out
      // of it. What it mines is on the cards.
      createSocialConnectionGameModel(entry, rand) {
        const group = new THREE.Group();
        const box = this._mat(0x8A2A4A, { roughness: 0.85, metalness: 0.02 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.06), box);
        base.position.y = 0.01;
        group.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.012, 0.062),
          this._mat(0xA03A5A, { roughness: 0.85, metalness: 0.02 }));
        lid.position.set(0.006, 0.026, -0.004);
        lid.rotation.z = 0.12;
        group.add(lid);
        const paper = this._mat(0xF0ECE0, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const card = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.001, 0.034), paper);
          card.position.set(-0.042 - i * 0.006, 0.0035 + i * 0.0012, 0.01 + i * 0.006);
          card.rotation.y = 0.3 + i * 0.25;
          group.add(card);
        }
        return group;
      },

      // 184. Stress Relief Program: a meditation cassette course, the tape in
      // its case with the sleeve card behind it.
      createStressReliefProgramModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xDCE8E4, {
          roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.5
        });
        const caseBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.044), shell);
        caseBody.position.y = 0.007;
        group.add(caseBody);
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.008, 0.038),
          this._mat(0x2A3A44, { roughness: 0.5, metalness: 0.15 }));
        tape.position.y = 0.007;
        group.add(tape);
        for (const x of [-0.014, 0.014]) {
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.009, this.seg(12, 7)),
            this._mat(0x1A1A20, { roughness: 0.6, metalness: 0.1 }));
          hub.position.set(x, 0.007, 0);
          group.add(hub);
        }
        const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.001, 0.04),
          this._mat(0x8AC8B0, { roughness: 0.9, metalness: 0.0 }));
        sleeve.position.set(0, 0.0145, 0);
        group.add(sleeve);
        return group;
      },

      // 185. CD Case: the portable player its description names, lid closed
      // over a disc, headphone lead coiled beside it.
      createCDCaseModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x9AA4AC, { roughness: 0.3, metalness: 0.5 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.014, this.seg(20, 11)), shell);
        body.position.y = 0.007;
        group.add(body);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.004, this.seg(20, 11)),
          this._mat(0xB8C0C8, { roughness: 0.2, metalness: 0.6 }));
        lid.position.y = 0.016;
        group.add(lid);
        const window_ = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.001, this.seg(16, 9)),
          this._mat(0x2A3A4A, { roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.6 }));
        window_.position.y = 0.0185;
        group.add(window_);
        const lead = new THREE.Mesh(
          new THREE.TorusGeometry(0.016, 0.0015, this.seg(5, 3), this.seg(16, 9)),
          this._mat(0x1A1A20, { roughness: 0.9, metalness: 0.0 }));
        lead.rotation.x = Math.PI / 2;
        lead.position.set(-0.055, 0.0015, 0.006);
        group.add(lead);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const key = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.004),
              this._mat(0x2A2A32, { roughness: 0.7, metalness: 0.1 }));
            key.position.set(-0.012 + i * 0.012, 0.0185, 0.03);
            group.add(key);
          }
        }
        return group;
      },

      // 186. Pocket Sound System: a small speaker brick, grille out, one
      // status light on it.
      createPocketSoundSystemModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x22262C, { roughness: 0.5, metalness: 0.2 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.055, this.seg(16, 9)), shell);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.024;
        group.add(body);
        const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.0242, 0.0242, 0.036, this.seg(16, 9), 1, true),
          this._mat(0x3A4046, { roughness: 0.95, metalness: 0.15, side: THREE.DoubleSide }));
        grille.rotation.z = Math.PI / 2;
        grille.position.y = 0.024;
        group.add(grille);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.03),
          this._mat(0x1A1A20, { roughness: 0.95, metalness: 0.0 }));
        foot.position.y = 0.003;
        group.add(foot);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.002, this.seg(8, 5), this.seg(6, 4)),
          this._glow(0x50A0E0, 0.9));
        led.position.set(0.028, 0.03, 0.006);
        led.userData.pulse = { freq: 1.4, min: 0.35, max: 1.0 };
        group.add(led);
        return group;
      },

      // 188. Mood-Enhancing Feast: a covered platter for three, the cloche
      // lifted enough to show what is under it.
      createMoodEnhancingFeastModel(entry, rand) {
        const group = new THREE.Group();
        const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.006, this.seg(20, 11)),
          this._steel(0xC0C6CC, 0.25));
        tray.position.y = 0.003;
        group.add(tray);
        const roast = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0xB07A3A, { roughness: 0.85, metalness: 0.0 }));
        roast.scale.y = 0.65;
        roast.position.y = 0.012;
        group.add(roast);
        for (let i = 0; i < 3; i++) {
          const side = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)),
            this._mat(i === 1 ? 0x6A9A3A : 0xE0C860, { roughness: 0.9, metalness: 0.0 }));
          const a = i * Math.PI * 2 / 3;
          side.scale.y = 0.6;
          side.position.set(Math.cos(a) * 0.036, 0.008, Math.sin(a) * 0.036);
          group.add(side);
        }
        const cloche = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, this.seg(16, 9), this.seg(10, 6), 0, Math.PI * 2, 0, Math.PI / 2),
          this._steel(0xD0D6DC, 0.18));
        cloche.scale.y = 0.72;
        cloche.position.set(0.01, 0.03, -0.006);
        cloche.rotation.z = 0.3;
        group.add(cloche);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(10, 6), this.seg(8, 5)),
          this._steel(0xB0B6BC, 0.25));
        knob.position.set(0.02, 0.065, -0.006);
        group.add(knob);
        return group;
      },

      // 189. Romantic Encounter Kit: a small hamper with a wine bottle, two
      // glasses and a rose laid across it.
      createRomanticEncounterKitModel(entry, rand) {
        const group = new THREE.Group();
        const wicker = this._mat(0xB08A5A, { roughness: 0.95, metalness: 0.0 });
        const basket = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.028, 0.045), wicker);
        basket.position.y = 0.014;
        group.add(basket);
        const glass = this._mat(0x2A4A2A, { roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.7 });
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, this.seg(12, 7)), glass);
        bottle.rotation.z = Math.PI / 2 - 0.35;
        bottle.position.set(-0.012, 0.038, 0.004);
        group.add(bottle);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.02, this.seg(10, 6)), glass);
        neck.rotation.z = Math.PI / 2 - 0.35;
        neck.position.set(0.014, 0.026, 0.004);
        group.add(neck);
        for (const z of [-0.014, 0.014]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.014, this.seg(12, 7)),
            this._mat(0xE0EAEE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.45 }));
          cup.position.set(0.026, 0.035, z);
          group.add(cup);
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, this.seg(8, 5)),
            this._mat(0xE0EAEE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.45 }));
          stem.position.set(0.026, 0.022, z);
          group.add(stem);
        }
        const rose = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xB02A3A, { roughness: 0.8, metalness: 0.0 }));
        rose.position.set(-0.03, 0.032, -0.014);
        group.add(rose);
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.04, this.seg(6, 4)),
          this._mat(0x3A6A2A, { roughness: 0.9, metalness: 0.0 }));
        stalk.rotation.z = Math.PI / 2;
        stalk.position.set(-0.01, 0.03, -0.014);
        group.add(stalk);
        return group;
      },

      // 190. Immersive Sound Cancellers: over-ear cans on a stand, the cups
      // deeper and the band padded, so they are not the plain headphones on
      // the tool rack.
      createSoundCancellersModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x3A3A44, { roughness: 0.35, metalness: 0.3 });
        const pad = this._mat(0x1A1A20, { roughness: 0.99, metalness: 0.0 });
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 0.05, this.seg(12, 7)),
          this._mat(0x22262C, { roughness: 0.6, metalness: 0.2 }));
        post.position.y = 0.025;
        group.add(post);
        for (const s of [-1, 1]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.022, this.seg(16, 9)), shell);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(s * 0.028, 0.058, 0);
          group.add(cup);
          const cushion = new THREE.Mesh(
            new THREE.TorusGeometry(0.017, 0.006, this.seg(6, 4), this.seg(14, 8)), pad);
          cushion.rotation.y = Math.PI / 2;
          cushion.position.set(s * 0.016, 0.058, 0);
          group.add(cushion);
        }
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.028, 0.004, this.seg(6, 4), this.seg(20, 11), Math.PI), shell);
        band.position.y = 0.068;
        group.add(band);
        const headpad = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.006, 0.012), pad);
        headpad.position.y = 0.093;
        group.add(headpad);
        return group;
      },

      // 191. Career Package: the cassette its description names, in a sleeve
      // with a stack of two more behind it.
      createCareerPackageModel(entry, rand) {
        const group = new THREE.Group();
        const sleeve = this._mat(0x2A3A6A, { roughness: 0.85, metalness: 0.02 });
        for (let i = 0; i < 3; i++) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.012, 0.042), sleeve);
          box.position.set(i * 0.002, 0.006 + i * 0.013, -i * 0.003);
          box.rotation.y = i * 0.06;
          group.add(box);
        }
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.008, 0.036),
          this._mat(0xC8B048, { roughness: 0.5, metalness: 0.2 }));
        tape.position.set(0.03, 0.004, 0.038);
        tape.rotation.y = 0.4;
        group.add(tape);
        return group;
      },

      // 192. Pocket Bonsai: a trained trunk in a shallow tray, the pad of
      // foliage clipped flat.
      createPocketBonsaiModel(entry, rand) {
        const group = new THREE.Group();
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.036),
          this._mat(0x4A2A22, { roughness: 0.6, metalness: 0.1 }));
        tray.position.y = 0.006;
        group.add(tray);
        const soil = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.004, 0.03),
          this._mat(0x2A2018, { roughness: 1.0, metalness: 0.0 }));
        soil.position.y = 0.013;
        group.add(soil);
        const bark = this._wood(0x5A4028);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 0.03, this.seg(10, 6)), bark);
        trunk.position.set(-0.004, 0.028, 0);
        trunk.rotation.z = 0.25;
        group.add(trunk);
        const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.004, 0.024, this.seg(8, 5)), bark);
        bough.position.set(0.005, 0.044, 0);
        bough.rotation.z = -1.1;
        group.add(bough);
        const foliage = this._mat(0x2A6A32, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 2); i++) {
          const pad = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(10, 6), this.seg(8, 5)), foliage);
          pad.scale.y = 0.42;
          pad.position.set(0.012 - i * 0.014, 0.052 + i * 0.007, (i - 1) * 0.006);
          group.add(pad);
        }
        return group;
      },

      // 193. Immersive Entertainment Hub: a visor on a console box, the lens
      // band lit.
      createEntertainmentHubModel(entry, rand) {
        const group = new THREE.Group();
        const console_ = this._mat(0x1E1E26, { roughness: 0.45, metalness: 0.3 });
        this._slab(group, 0.075, 0.016, 0.045, console_, 0.008);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, 0.028),
          this._mat(0x2A2A34, { roughness: 0.4, metalness: 0.25 }));
        visor.position.y = 0.03;
        group.add(visor);
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.012, 0.001),
          this._glow(0x6A50E0, 0.7));
        lens.position.set(0, 0.032, 0.0145);
        lens.userData.pulse = { freq: 1.0, min: 0.45, max: 1.0 };
        group.add(lens);
        const strap = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.003, this.seg(6, 4), this.seg(16, 9), Math.PI),
          this._mat(0x14141A, { roughness: 0.95, metalness: 0.0 }));
        strap.rotation.x = Math.PI / 2;
        strap.rotation.z = Math.PI;
        strap.position.set(0, 0.03, -0.012);
        group.add(strap);
        return group;
      },

      // 194. Extreme Energy Pack: four tall cans held in a cardboard yoke.
      createExtremeEnergyPackModel(entry, rand) {
        const group = new THREE.Group();
        const alu = this._steel(0xB8BCC2, 0.28);
        const band = this._mat(0xC8E02A, { roughness: 0.7, metalness: 0.1 });
        for (let i = 0; i < 4; i++) {
          const x = (i % 2 ? 1 : -1) * 0.018;
          const z = (i < 2 ? -1 : 1) * 0.018;
          const can = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.085, this.seg(14, 8)), alu);
          can.position.set(x, 0.0425, z);
          group.add(can);
          const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0162, 0.0162, 0.04, this.seg(14, 8), 1, true),
            band);
          wrap.material.side = THREE.DoubleSide;
          wrap.position.set(x, 0.04, z);
          group.add(wrap);
        }
        const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.026, 0.072),
          this._mat(0x8A6A3A, { roughness: 0.95, metalness: 0.0 }));
        yoke.position.y = 0.013;
        group.add(yoke);
        return group;
      },

      // 195. Home Fitness System: a folding bench with a bar racked over it,
      // single use, so the plates are the small ones.
      createHomeFitnessSystemModel(entry, rand) {
        const group = new THREE.Group();
        const frame = this._steel(0x3A4046, 0.5);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.026),
          this._mat(0x1E1E24, { roughness: 0.9, metalness: 0.05 }));
        pad.position.y = 0.03;
        group.add(pad);
        for (const x of [-0.026, 0.026]) {
          for (const z of [-0.009, 0.009]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.026, this.seg(8, 5)), frame);
            leg.position.set(x, 0.013, z);
            group.add(leg);
          }
        }
        const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, this.seg(8, 5)), frame);
        upright.position.set(-0.03, 0.049, 0);
        group.add(upright);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.07, this.seg(8, 5)),
          this._steel(0xB0B6BC, 0.3));
        bar.rotation.x = Math.PI / 2;
        bar.position.set(-0.03, 0.064, 0);
        group.add(bar);
        for (const z of [-0.028, 0.028]) {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.004, this.seg(14, 8)),
            this._mat(0x14141A, { roughness: 0.85, metalness: 0.1 }));
          plate.rotation.x = Math.PI / 2;
          plate.position.set(-0.03, 0.064, z);
          group.add(plate);
        }
        return group;
      },

      // 196. Portable Caffeinator: a press-style travel maker, the plunger up
      // and the brew showing through the wall.
      createPortableCaffeinatorModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x8A9098, 0.3);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.075, this.seg(16, 9)), steel);
        body.position.y = 0.038;
        group.add(body);
        const window_ = new THREE.Mesh(new THREE.CylinderGeometry(0.0202, 0.0202, 0.03, this.seg(16, 9), 1, true),
          this._mat(0x3A2216, {
            roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.75, side: THREE.DoubleSide
          }));
        window_.position.y = 0.03;
        group.add(window_);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.008, this.seg(16, 9)),
          this._mat(0x1E1E24, { roughness: 0.7, metalness: 0.1 }));
        collar.position.y = 0.079;
        group.add(collar);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, this.seg(8, 5)), steel);
        rod.position.y = 0.098;
        group.add(rod);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x1E1E24, { roughness: 0.7, metalness: 0.1 }));
        knob.scale.y = 0.6;
        knob.position.y = 0.114;
        group.add(knob);
        return group;
      },

      // 197. Rolling Tobacco: the pouch open, papers in the flap, a pinch of
      // leaf out on the counter. Its description names all three.
      createRollingTobaccoModel(entry, rand) {
        const group = new THREE.Group();
        const pouch = this._mat(0x6A4A2A, { roughness: 0.95, metalness: 0.02 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.016, 0.038), pouch);
        body.position.y = 0.008;
        group.add(body);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.003, 0.03), pouch);
        flap.position.set(0, 0.026, -0.02);
        flap.rotation.x = -0.9;
        group.add(flap);
        const papers = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.002, 0.012),
          this._mat(0xF4F2EC, { roughness: 0.98, metalness: 0.0 }));
        papers.position.set(-0.014, 0.03, -0.021);
        papers.rotation.x = -0.9;
        group.add(papers);
        const leaf = this._mat(0x7A5A2A, { roughness: 1.0, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const strand = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0015, 0.0015), leaf);
          strand.position.set(0.038 + i * 0.002, 0.0008, -0.006 + i * 0.005);
          strand.rotation.y = i * 0.6;
          group.add(strand);
        }
        return group;
      },

      // 198. Hand-Rolled Cigar: one cigar in its glass tube, the band on and
      // the cap uncut.
      createHandRolledCigarModel(entry, rand) {
        const group = new THREE.Group();
        const leaf = this._mat(0x5A3A1E, { roughness: 0.85, metalness: 0.02 });
        const cigar = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0065, 0.085, this.seg(14, 8)), leaf);
        cigar.rotation.z = Math.PI / 2;
        cigar.position.y = 0.0075;
        group.add(cigar);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0075, this.seg(10, 6), this.seg(8, 5)), leaf);
        cap.scale.x = 0.6;
        cap.position.set(0.043, 0.0075, 0);
        group.add(cap);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0075, 0.012, this.seg(14, 8)),
          this._mat(0xC8A54A, { roughness: 0.6, metalness: 0.35 }));
        band.rotation.z = Math.PI / 2;
        band.position.set(-0.022, 0.0075, 0);
        group.add(band);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, this.seg(14, 8), 1, true),
          this._mat(0xDCE4E0, {
            roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.28, side: THREE.DoubleSide
          }));
        tube.rotation.z = Math.PI / 2;
        tube.position.set(-0.03, 0.0075, 0);
        group.add(tube);
        return group;
      },

      // 199. Nicotine Gum: a blister of coated pellets with one pushed
      // through the foil.
      createNicotineGumModel(entry, rand) {
        const group = new THREE.Group();
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.036),
          this._mat(0xB8BCC2, { roughness: 0.45, metalness: 0.55 }));
        card.position.y = 0.001;
        group.add(card);
        const pellet = this._mat(0xF0EFE8, { roughness: 0.7, metalness: 0.0 });
        for (let c = 0; c < 3; c++) {
          for (let r = 0; r < 2; r++) {
            if (c === 0 && r === 0) continue;               // the one pushed out
            const dome = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.007, 0.011), pellet);
            dome.position.set(-0.015 + c * 0.015, 0.0055, -0.008 + r * 0.016);
            group.add(dome);
          }
        }
        const loose = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.007, 0.011), pellet);
        loose.position.set(-0.03, 0.0035, -0.018);
        loose.rotation.y = 0.4;
        group.add(loose);
        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.001, 0.011),
          this._mat(0x6A6E74, { roughness: 0.9, metalness: 0.2 }));
        hole.position.set(-0.015, 0.0021, -0.008);
        group.add(hole);
        return group;
      },

      // 200. Pocket Hip Flask: steel and dented, as the description says, the
      // cap on its little chain.
      createPocketHipFlaskModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xA8AEB6, 0.4);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.06, this.seg(18, 10)), steel);
        body.scale.z = 0.32;
        body.position.y = 0.03;
        group.add(body);
        // The dent: one panel pressed in, which is what stops this reading as
        // a clean flask off a shelf.
        const dent = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(10, 6), this.seg(8, 5)),
          this._steel(0x9298A0, 0.55));
        dent.scale.set(1, 1.2, 0.35);
        dent.position.set(0.012, 0.032, 0.008);
        group.add(dent);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.01, this.seg(12, 7)), steel);
        neck.position.y = 0.064;
        group.add(neck);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, this.seg(12, 7)),
          this._steel(0x8A9098, 0.35));
        cap.position.y = 0.073;
        group.add(cap);
        const chain = new THREE.Mesh(
          new THREE.TorusGeometry(0.006, 0.0008, this.seg(5, 3), this.seg(10, 6)), steel);
        chain.position.set(0.012, 0.066, 0);
        group.add(chain);
        return group;
      },

      // 201. Bookmaker's Slip: a torn betting slip with a stub pencil across
      // it, the horse and the number written on.
      createBookmakersSlipModel(entry, rand) {
        const group = new THREE.Group();
        const slip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0012, 0.07),
          this._mat(0xF0EAD8, { roughness: 0.98, metalness: 0.0 }));
        slip.position.y = 0.0006;
        slip.rotation.y = 0.12;
        group.add(slip);
        const carbon = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.0008, 0.068),
          this._mat(0xD8C8B0, { roughness: 0.98, metalness: 0.0 }));
        carbon.position.set(0.004, 0.0016, 0.004);
        carbon.rotation.y = -0.06;
        group.add(carbon);
        const ink = this._mat(0x2A2A32, { roughness: 0.95, metalness: 0.0 });
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.026 - i * 0.006, 0.0004, 0.0018), ink);
            line.position.set(0, 0.0022, -0.016 + i * 0.014);
            group.add(line);
          }
        }
        const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.03, 6),
          this._mat(0x8A2A2A, { roughness: 0.8, metalness: 0.02 }));
        pencil.rotation.set(0, 0.5, Math.PI / 2);
        pencil.position.set(0.014, 0.0038, 0.026);
        group.add(pencil);
        const lead = new THREE.Mesh(new THREE.ConeGeometry(0.0022, 0.005, 6),
          this._mat(0xE0D8C0, { roughness: 0.9, metalness: 0.0 }));
        lead.rotation.set(0, 0.5, -Math.PI / 2);
        lead.position.set(0.03, 0.0038, 0.018);
        group.add(lead);
        return group;
      },

      // 202. Slot Machine Token: brass, worthless, worn smooth, lying in a
      // small scatter of two.
      createSlotMachineTokenModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xB08A3A, { roughness: 0.5, metalness: 0.8 });
        const flat = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.0025, this.seg(20, 11)), brass);
        flat.position.y = 0.00125;
        group.add(flat);
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.0004, this.seg(16, 9)),
          this._mat(0xC8A54A, { roughness: 0.4, metalness: 0.85 }));
        face.position.y = 0.0027;
        group.add(face);
        const second = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.0025, this.seg(20, 11)), brass);
        second.position.set(0.02, 0.0038, 0.008);
        second.rotation.set(0.12, 0.4, 0.1);
        group.add(second);
        if (this.wantsTrim()) {
          const notch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0006, 0.002),
            this._mat(0x8A6A28, { roughness: 0.7, metalness: 0.7 }));
          notch.position.y = 0.0029;
          group.add(notch);
        }
        return group;
      }
    }
  });
})();
