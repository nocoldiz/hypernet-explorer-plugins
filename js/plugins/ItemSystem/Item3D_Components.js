//=============================================================================
// Item 3D Models - Components
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the hyperdeck components of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Components
 * ============================================================================
 *
 * The parts a hyperdeck is built out of (ItemSystem: ids 1318 and up). These
 * are real hardware forms and the database already says which is which, so
 * nothing here is guessed:
 *
 *   <Component: cpu|ram|storage|gpu|display|battery|modem|cooling|sound|sensor>
 *                  picks the form, because a memory stick is not a fan
 *   <Shape: XX,XX> the footprint the part occupies on the deck's component
 *                  grid, which is what the model is SIZED from: a two-by-two
 *                  part is built twice the width of a one-by-one
 *   <Specs: ...>   mhz, mah and the capacity in the name decide the detail:
 *                  how many chips are on a stick, how many cells in a pack
 *
 * So one builder per real form, and inside a form the parts differ the way
 * the hardware does. Every part that would carry printed silkscreen carries
 * its own name.
 *
 * NOT listed in plugins.js; injected at runtime from ITEM3D_FAMILIES in
 * ItemSystemUtils.js. Builders take (entry, rand), are seeded from the
 * database id and name alone, are built in metres and stand on the X/Z plane.
 * The shared construction library of WeaponSystemProcedural and the helpers of
 * Item3D_Generic and Item3D_Diseases (_printedLabel) are available as `this`.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.ItemModelSystem) {
    console.error('[Item3D_Components] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Components',
    unique: {},
    categories: { Component: 'createComponentPartModel' },
    models: {
      /** The <Component:> type, which decides the form. */
      _componentType(entry) {
        const m = /<Component:\s*([^>]+)>/i.exec((entry && entry.note) || '');
        return m ? m[1].trim().toLowerCase() : '';
      },

      /**
       * The footprint the part takes on the deck's grid, read off <Shape:>.
       * "XX,XX" is two cells by two rows; "X." leaves a corner empty, which
       * the model ignores, taking only the extent.
       */
      _componentShape(entry) {
        const m = /<Shape:\s*([^>]+)>/i.exec((entry && entry.note) || '');
        if (!m) return { cols: 1, rows: 1 };
        const rows = m[1].split(',').map((r) => r.trim()).filter(Boolean);
        const cols = rows.reduce((w, r) => Math.max(w, r.length), 1);
        return { cols: Math.max(1, cols), rows: Math.max(1, rows.length) };
      },

      /** A numbered spec off <Specs:>, or 0. */
      _componentSpec(entry, key) {
        const m = new RegExp('<Specs:[^>]*\\b' + key + '\\s+(-?\\d+)', 'i')
          .exec((entry && entry.note) || '');
        return m ? parseInt(m[1], 10) : 0;
      },

      /** The capacity printed in the part's name, in MB, or 0. */
      _componentCapacity(entry) {
        const name = (entry && entry.name) || '';
        const gb = /(\d+)\s*GB/i.exec(name);
        if (gb) return parseInt(gb[1], 10) * 1024;
        const mb = /(\d+)\s*MB/i.exec(name);
        return mb ? parseInt(mb[1], 10) : 0;
      },

      /** One grid cell, in metres. Everything here is sized off this. */
      COMPONENT_CELL: 0.022,

      /** The green board a part is built on, sized to its footprint. */
      _componentBoard(group, entry, o) {
        const shape = this._componentShape(entry);
        const cell = this.COMPONENT_CELL;
        const w = shape.cols * cell;
        const d = shape.rows * cell;
        const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0025, d),
          this._mat((o && o.color) || 0x1E4A28, { roughness: 0.7, metalness: 0.1 }));
        board.position.y = 0.00125;
        group.add(board);
        return { w, d, y: 0.0025 };
      },

      /** Gold edge fingers along the front edge of a card or a stick. */
      _componentFingers(group, w, d, y) {
        if (!this.wantsTrim()) return;
        const gold = this._mat(0xC8A54A, { roughness: 0.3, metalness: 0.9 });
        const count = Math.max(4, Math.round(w / 0.006));
        for (let i = 0; i < count; i++) {
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0004, 0.006), gold);
          pad.position.set(-w / 2 + 0.004 + i * (w - 0.008) / Math.max(1, count - 1), y, d / 2 - 0.004);
          group.add(pad);
        }
      },

      /** The part's own name, silkscreened onto it where a real one would be. */
      _componentLabel(group, entry, w, d, y) {
        const texture = this._printedLabel
          ? this._printedLabel(String((entry && entry.name) || ''),
            { paper: '#E8E4D4', ink: '#1A1E22' })
          : null;
        if (!texture) return;
        const mat = this._mat(0xE8E4D4, { roughness: 0.95, metalness: 0.0 });
        mat.map = texture;
        const label = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.0004, d * 0.3), mat);
        label.position.set(0, y + 0.0002, -d * 0.28);
        group.add(label);
      },

      // ======================================================================
      // The forms
      // ======================================================================

      /** The dispatcher: every component comes through here. */
      createComponentPartModel(entry, rand) {
        const type = this._componentType(entry);
        const byType = {
          cpu: 'createCPUComponentModel',
          ram: 'createRAMComponentModel',
          storage: 'createStorageComponentModel',
          gpu: 'createGPUComponentModel',
          display: 'createDisplayComponentModel',
          battery: 'createBatteryComponentModel',
          modem: 'createModemComponentModel',
          cooling: 'createCoolingComponentModel',
          sound: 'createSoundComponentModel',
          sensor: 'createSensorComponentModel'
        };
        return this[byType[type] || 'createSoundComponentModel'](entry, rand);
      },

      // A processor: substrate, a pin grid underneath, a die under a lidded
      // heat spreader. The faster the part, the bigger the lid it needs.
      createCPUComponentModel(entry, rand) {
        const group = new THREE.Group();
        const shape = this._componentShape(entry);
        const cell = this.COMPONENT_CELL;
        const w = shape.cols * cell * 0.8;
        const d = shape.rows * cell * 0.8;
        const substrate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.003, d),
          this._mat(0x2A5A38, { roughness: 0.65, metalness: 0.1 }));
        substrate.position.y = 0.0015;
        group.add(substrate);

        const mhz = this._componentSpec(entry, 'mhz');
        const lidScale = mhz >= 1000 ? 0.72 : mhz >= 700 ? 0.62 : 0.52;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(w * lidScale, 0.004, d * lidScale),
          this._steel(0xC0C6CC, 0.3));
        lid.position.y = 0.005;
        group.add(lid);
        const die = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.0008, d * 0.3),
          this._mat(0x3A3A48, { roughness: 0.25, metalness: 0.5 }));
        die.position.y = 0.0074;
        group.add(die);

        if (this.wantsTrim()) {
          const gold = this._mat(0xC8A54A, { roughness: 0.3, metalness: 0.9 });
          for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
              const pin = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0006, 0.0006, 0.002, this.seg(6, 4)), gold);
              pin.position.set(-w * 0.32 + c * (w * 0.21), 0.0005, -d * 0.32 + r * (d * 0.21));
              group.add(pin);
            }
          }
          const notch = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.0032, this.seg(8, 5)),
            this._mat(0xC8A54A, { roughness: 0.4, metalness: 0.85 }));
          notch.position.set(-w * 0.4, 0.0016, -d * 0.4);
          group.add(notch);
        }
        return group;
      },

      // A memory stick: a long thin board with chips down it, an edge notch
      // and gold fingers. The chip count follows the capacity.
      createRAMComponentModel(entry, rand) {
        const group = new THREE.Group();
        const shape = this._componentShape(entry);
        const cell = this.COMPONENT_CELL;
        const w = Math.max(shape.cols, 2) * cell;
        const d = cell * 0.55;
        const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0022, d),
          this._mat(0x1E4A28, { roughness: 0.7, metalness: 0.1 }));
        board.position.y = 0.0011;
        group.add(board);

        const mb = this._componentCapacity(entry);
        const chips = mb >= 256 ? 8 : mb >= 128 ? 6 : mb >= 64 ? 4 : 2;
        const chipMat = this._mat(0x22242A, { roughness: 0.5, metalness: 0.2 });
        for (let i = 0; i < chips; i++) {
          const chip = new THREE.Mesh(new THREE.BoxGeometry(w / (chips + 1) * 0.7, 0.0018, d * 0.55), chipMat);
          chip.position.set(-w / 2 + (i + 1) * (w / (chips + 1)), 0.0031, 0);
          group.add(chip);
        }
        this._componentFingers(group, w, d, 0.0011);
        const notch = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0026, 0.004),
          this._mat(0x101418, { roughness: 0.9, metalness: 0.05 }));
        notch.position.set(w * 0.08, 0.0011, d / 2 - 0.002);
        group.add(notch);
        return group;
      },

      // A drive: a machined case with a printed label on the lid and a
      // connector at one end. Optical and floppy units get a slot instead.
      createStorageComponentModel(entry, rand) {
        const group = new THREE.Group();
        const shape = this._componentShape(entry);
        const cell = this.COMPONENT_CELL;
        const w = shape.cols * cell * 0.92;
        const d = shape.rows * cell * 0.92;
        const h = 0.009;
        const name = String(entry.name || '');
        const isSlotted = /floppy|cd|dvd|sled|flash|compactflash/i.test(name);

        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
          this._steel(isSlotted ? 0x2A2E34 : 0xA8AEB4, 0.4));
        body.position.y = h / 2;
        group.add(body);

        if (isSlotted) {
          const slot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.0018, 0.002),
            this._mat(0x101216, { roughness: 0.95, metalness: 0.05 }));
          slot.position.set(0, h * 0.55, d / 2 + 0.0002);
          group.add(slot);
          const eject = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0015, 0.0015),
            this._mat(0x50565C, { roughness: 0.7, metalness: 0.2 }));
          eject.position.set(w * 0.4, h * 0.3, d / 2 + 0.0003);
          group.add(eject);
        } else {
          // A spinning disk has a spindle boss and a breather hole in the lid.
          const boss = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.12, w * 0.12, 0.0012, this.seg(14, 8)),
            this._steel(0xC0C6CC, 0.3));
          boss.position.set(0, h + 0.0006, 0);
          group.add(boss);
          const hole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0008, 0.0008, 0.0014, this.seg(8, 5)),
            this._mat(0x101216, { roughness: 0.95, metalness: 0.05 }));
          hole.position.set(w * 0.3, h + 0.0004, -d * 0.3);
          group.add(hole);
        }
        this._componentLabel(group, entry, w, d, h);
        const pins = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.0025, 0.0025),
          this._mat(0x14161A, { roughness: 0.8, metalness: 0.2 }));
        pins.position.set(0, h * 0.3, -d / 2 - 0.0012);
        group.add(pins);
        return group;
      },

      // A graphics part: a board with one big chip and its memory beside it.
      createGPUComponentModel(entry, rand) {
        const group = new THREE.Group();
        const { w, d, y } = this._componentBoard(group, entry, { color: 0x1E3A4A });
        const chip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.003, d * 0.34),
          this._mat(0x22242A, { roughness: 0.45, metalness: 0.25 }));
        chip.position.set(-w * 0.12, y + 0.0015, 0);
        group.add(chip);
        const marking = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, 0.0004, d * 0.08),
          this._mat(0xC8C8B8, { roughness: 0.9, metalness: 0.05 }));
        marking.position.set(-w * 0.12, y + 0.0032, 0);
        group.add(marking);

        const mb = this._componentCapacity(entry);
        const banks = mb >= 32 ? 4 : mb >= 8 ? 2 : 1;
        const ramMat = this._mat(0x2A2C34, { roughness: 0.5, metalness: 0.2 });
        for (let i = 0; i < banks; i++) {
          const bank = new THREE.Mesh(new THREE.BoxGeometry(w * 0.12, 0.0018, d * 0.24), ramMat);
          bank.position.set(w * 0.2, y + 0.0009, -d * 0.22 + i * (d * 0.44 / Math.max(1, banks - 1 || 1)));
          group.add(bank);
        }
        this._componentFingers(group, w, d, y - 0.0012);
        return group;
      },

      // A panel: the glass, the lit area, the bezel and the ribbon that comes
      // off it. The lit area follows the size printed in the name, and the
      // cracked one is only half lit.
      createDisplayComponentModel(entry, rand) {
        const group = new THREE.Group();
        const shape = this._componentShape(entry);
        const cell = this.COMPONENT_CELL;
        const w = shape.cols * cell;
        const d = shape.rows * cell;
        const bezel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, d),
          this._mat(0x2A2E34, { roughness: 0.55, metalness: 0.2 }));
        bezel.position.y = 0.002;
        group.add(bezel);

        const name = String(entry.name || '');
        const isTFT = /TFT/i.test(name);
        const isMono = /monochrome|STN/i.test(name) && !isTFT;
        const cracked = /crack/i.test(name);
        const lit = this._mat(isMono ? 0x6A8A6A : 0x4A7AB0, {
          roughness: 0.2, metalness: 0.05,
          emissive: isMono ? 0x2A4A2A : 0x1E4A80,
          emissiveIntensity: isTFT ? 0.7 : 0.4
        });
        const screen = new THREE.Mesh(
          new THREE.BoxGeometry(w * (cracked ? 0.42 : 0.86), 0.0008, d * 0.8), lit);
        screen.position.set(cracked ? -w * 0.21 : 0, 0.0044, 0);
        group.add(screen);
        if (cracked) {
          const dead = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.0008, d * 0.8),
            this._mat(0x22262A, { roughness: 0.6, metalness: 0.1 }));
          dead.position.set(w * 0.23, 0.0044, 0);
          group.add(dead);
          const crack = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.001, d * 0.8),
            this._mat(0xC8CCD0, { roughness: 0.3, metalness: 0.2 }));
          crack.position.set(w * 0.01, 0.0046, 0);
          crack.rotation.y = 0.08;
          group.add(crack);
        }
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.0006, 0.012),
          this._mat(0xC8A54A, { roughness: 0.5, metalness: 0.5 }));
        ribbon.position.set(0, 0.001, -d / 2 - 0.006);
        group.add(ribbon);
        return group;
      },

      // A battery: cells in a wrap. Round cells for the stick packs, a flat
      // slab for the polymer ones, and the leaking one has leaked.
      createBatteryComponentModel(entry, rand) {
        const group = new THREE.Group();
        const shape = this._componentShape(entry);
        const cell = this.COMPONENT_CELL;
        const w = shape.cols * cell * 0.9;
        const d = Math.max(shape.rows, 1) * cell * 0.9;
        const name = String(entry.name || '');
        const isSlab = /polymer|slab|li-ion|li-polymer/i.test(name);
        const isSolar = /solar/i.test(name);
        const leaking = /leak/i.test(name);

        if (isSolar) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0025, d),
            this._mat(0x1A2A4A, { roughness: 0.25, metalness: 0.35 }));
          panel.position.y = 0.00125;
          group.add(panel);
          if (this.wantsTrim()) {
            const trace = this._mat(0xB0B6BC, { roughness: 0.4, metalness: 0.6 });
            for (let i = 0; i < 4; i++) {
              const line = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.0004, d * 0.9), trace);
              line.position.set(-w * 0.3 + i * (w * 0.2), 0.0026, 0);
              group.add(line);
            }
          }
        } else if (isSlab) {
          const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.007, d),
            this._mat(0x3A3E46, { roughness: 0.45, metalness: 0.3 }));
          body.position.y = 0.0035;
          group.add(body);
          const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.0008, d * 1.01),
            this._steel(0xB0B6BC, 0.4));
          seam.position.y = 0.0035;
          group.add(seam);
        } else {
          const mah = this._componentSpec(entry, 'mah');
          const cells = mah >= 2400 ? 3 : mah >= 1200 ? 2 : 1;
          const wrap = this._mat(0x2A3A5A, { roughness: 0.5, metalness: 0.2 });
          for (let i = 0; i < cells; i++) {
            const round = new THREE.Mesh(
              new THREE.CylinderGeometry(0.007, 0.007, w * 0.85, this.seg(16, 9)), wrap);
            round.rotation.z = Math.PI / 2;
            round.position.set(0, 0.007, -((cells - 1) / 2) * 0.015 + i * 0.015);
            group.add(round);
          }
        }

        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0008, 0.004),
          this._mat(0xC8A54A, { roughness: 0.35, metalness: 0.85 }));
        tab.position.set(w / 2 - 0.004, 0.008, d / 2 - 0.004);
        group.add(tab);
        if (leaking) {
          const stain = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.0006, this.seg(12, 7)),
            this._mat(0x8A7A3A, { roughness: 1.0, metalness: 0.05 }));
          stain.position.set(w * 0.2, 0.0003, d * 0.2);
          group.add(stain);
          const drip = new THREE.Mesh(new THREE.SphereGeometry(0.0025, this.seg(8, 5), this.seg(6, 4)),
            this._mat(0xA89A4A, { roughness: 0.4, metalness: 0.1 }));
          drip.scale.y = 0.5;
          drip.position.set(w * 0.24, 0.001, d * 0.16);
          group.add(drip);
        }
        return group;
      },

      // A radio or a line card: a PCMCIA-shaped card with a connector at one
      // end, and an aerial or an eye if the part has one.
      createModemComponentModel(entry, rand) {
        const group = new THREE.Group();
        const { w, d, y } = this._componentBoard(group, entry, { color: 0x2A2E34 });
        const name = String(entry.name || '');
        const shell = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, d),
          this._steel(0x9AA0A8, 0.4));
        shell.position.y = 0.002;
        group.add(shell);
        const connector = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.0035, 0.003),
          this._mat(0x14161A, { roughness: 0.85, metalness: 0.15 }));
        connector.position.set(0, 0.002, -d / 2 - 0.0015);
        group.add(connector);

        if (/802\.11|radio|gsm/i.test(name)) {
          const aerial = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.5, 0.003, 0.006),
            this._mat(0x22262A, { roughness: 0.6, metalness: 0.2 }));
          aerial.position.set(0, 0.0055, d / 2 - 0.004);
          group.add(aerial);
        } else if (/irda|eye/i.test(name)) {
          const eye = new THREE.Mesh(
            new THREE.SphereGeometry(0.004, this.seg(12, 7), this.seg(9, 5)),
            this._mat(0x2A1A2A, { roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }));
          eye.scale.z = 0.5;
          eye.position.set(0, 0.004, d / 2 - 0.002);
          group.add(eye);
        } else {
          const jack = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.006),
            this._mat(0xE8E4D8, { roughness: 0.6, metalness: 0.05 }));
          jack.position.set(0, 0.0035, d / 2 - 0.004);
          group.add(jack);
        }
        this._componentLabel(group, entry, w, d, 0.004);
        void y;
        return group;
      },

      // Cooling: a spreader plate, a finstack, a blower or a heat pipe. The
      // name says which, and they look nothing like each other.
      createCoolingComponentModel(entry, rand) {
        const group = new THREE.Group();
        const shape = this._componentShape(entry);
        const cell = this.COMPONENT_CELL;
        const w = shape.cols * cell * 0.9;
        const d = shape.rows * cell * 0.9;
        const name = String(entry.name || '');
        const copper = /copper/i.test(name);
        const metal = this._steel(copper ? 0xB07A3A : 0xC0C6CC, 0.35);

        if (/fan|blower/i.test(name)) {
          const housing = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.45, w * 0.45, 0.006, this.seg(18, 10)),
            this._mat(0x2A2E34, { roughness: 0.6, metalness: 0.2 }));
          housing.position.y = 0.003;
          group.add(housing);
          const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.12, w * 0.12, 0.007, this.seg(12, 7)), metal);
          hub.position.y = 0.0035;
          group.add(hub);
          for (let i = 0; i < (this.wantsTrim() ? 7 : 4); i++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.0008, 0.004),
              this._mat(0x4A4E56, { roughness: 0.7, metalness: 0.2 }));
            const a = i * Math.PI * 2 / (this.wantsTrim() ? 7 : 4);
            blade.position.set(Math.cos(a) * w * 0.24, 0.005, Math.sin(a) * w * 0.24);
            blade.rotation.set(0.3, -a, 0);
            group.add(blade);
          }
          const exit = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.005, w * 0.3),
            this._mat(0x2A2E34, { roughness: 0.6, metalness: 0.2 }));
          exit.position.set(w * 0.45, 0.003, 0);
          group.add(exit);
        } else if (/pipe|loop/i.test(name)) {
          const run = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0035, 0.0035, w * 0.9, this.seg(12, 7)), metal);
          run.rotation.z = Math.PI / 2;
          run.position.set(0, 0.0035, -d * 0.2);
          group.add(run);
          const bend = new THREE.Mesh(
            new THREE.TorusGeometry(0.008, 0.0035, this.seg(6, 4), this.seg(14, 8), Math.PI), metal);
          bend.rotation.x = Math.PI / 2;
          bend.position.set(w * 0.45, 0.0035, -d * 0.2 + 0.008);
          group.add(bend);
          const back = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0035, 0.0035, w * 0.9, this.seg(12, 7)), metal);
          back.rotation.z = Math.PI / 2;
          back.position.set(0, 0.0035, -d * 0.2 + 0.016);
          group.add(back);
          const block = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, 0.005, d * 0.35), metal);
          block.position.set(-w * 0.3, 0.0025, -d * 0.2 + 0.008);
          group.add(block);
        } else if (/fin/i.test(name)) {
          const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0025, d), metal);
          base.position.y = 0.00125;
          group.add(base);
          const count = this.wantsTrim() ? 9 : 5;
          for (let i = 0; i < count; i++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.009, d * 0.92), metal);
            fin.position.set(-w / 2 + 0.003 + i * ((w - 0.006) / Math.max(1, count - 1)), 0.007, 0);
            group.add(fin);
          }
        } else {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.003, d), metal);
          plate.position.y = 0.0015;
          group.add(plate);
          const pad = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.0008, d * 0.5),
            this._mat(0xC8C8D0, { roughness: 0.95, metalness: 0.0 }));
          pad.position.y = 0.0034;
          group.add(pad);
        }
        return group;
      },

      // A sound part: a small board with one DIP chip on it and a crystal.
      createSoundComponentModel(entry, rand) {
        const group = new THREE.Group();
        const { w, d, y } = this._componentBoard(group, entry, { color: 0x2A2A5A });
        const chip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.0022, d * 0.32),
          this._mat(0x1A1C22, { roughness: 0.55, metalness: 0.2 }));
        chip.position.set(0, y + 0.0011, 0);
        group.add(chip);
        const dimple = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0012, 0.0012, 0.0006, this.seg(10, 6)),
          this._mat(0x3A3C44, { roughness: 0.8, metalness: 0.1 }));
        dimple.position.set(-w * 0.2, y + 0.0024, 0);
        group.add(dimple);
        if (this.wantsTrim()) {
          const leg = this._mat(0xB0B6BC, { roughness: 0.4, metalness: 0.7 });
          for (let i = 0; i < 6; i++) {
            for (const s of [-1, 1]) {
              const pin = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0006, 0.0025), leg);
              pin.position.set(-w * 0.2 + i * (w * 0.08), y + 0.0004, s * d * 0.18);
              group.add(pin);
            }
          }
        }
        const crystal = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, this.seg(12, 7)),
          this._steel(0xC0C6CC, 0.3));
        crystal.rotation.z = Math.PI / 2;
        crystal.position.set(w * 0.3, y + 0.0022, -d * 0.25);
        group.add(crystal);
        this._componentFingers(group, w, d, y - 0.0012);
        return group;
      },

      // A sensor module: a small board with a lens looking up off it.
      createSensorComponentModel(entry, rand) {
        const group = new THREE.Group();
        const { w, d, y } = this._componentBoard(group, entry, { color: 0x1E2A3A });
        const housing = new THREE.Mesh(
          new THREE.CylinderGeometry(w * 0.2, w * 0.24, 0.006, this.seg(14, 8)),
          this._mat(0x22262C, { roughness: 0.5, metalness: 0.25 }));
        housing.position.set(0, y + 0.003, 0);
        group.add(housing);
        const lens = new THREE.Mesh(
          new THREE.SphereGeometry(w * 0.15, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0x2A3A4A, { roughness: 0.06, metalness: 0.4 }));
        lens.scale.y = 0.5;
        lens.position.set(0, y + 0.006, 0);
        group.add(lens);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0015, this.seg(8, 5), this.seg(6, 4)),
          this._glow(0x50E080, 0.8));
        led.position.set(w * 0.3, y + 0.0015, d * 0.28);
        led.userData.pulse = { freq: 1.2, min: 0.2, max: 1.0 };
        group.add(led);
        return group;
      }
    }
  };

  // The component rack, as it sits in the database: the original run and the
  // block added beside it. The category mapping above catches any part added
  // later without touching this file.
  for (const [from, to] of [[1318, 1387], [1794, 1825]]) {
    for (let id = from; id <= to; id++) family.unique['i' + id] = 'createComponentPartModel';
  }

  window.ItemModelSystem.registerFamily(family);
})();
