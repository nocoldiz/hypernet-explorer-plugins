/*:
 * @target MZ
 * @plugindesc Inventory Scene UI v1.1.0, DOM overlay for ItemSystemInventory
 * @author Omni-Lex
 * @help ItemSystemInventoryUI.js
 *
 * DOM layer for Scene_EnhancedItem.
 * Must be listed AFTER ItemSystemInventory.js in the Plugin Manager.
 *
 * Implements:
 *  - D&D backpack parchment overlay (book-spread layout)
 *  - Full keyboard + controller support (WASD, arrows, L1/R1, gamepad B = cancel)
 *  - 3-column grid navigation
 *  - L1 / R1  →  cycle through category tabs from anywhere
 */

(function () {
  'use strict';

  if (!window.Scene_EnhancedItem) {
    throw new Error('ItemSystemInventoryUI.js requires ItemSystemInventory.js to be loaded first!');
  }

  // Category names come from item notes, so they reach the page as data rather
  // than as text this file wrote: they are escaped before they are printed and
  // before they are put in an attribute a click handler reads back.
  const escapeHtml = (text) =>
    String(text === undefined || text === null ? '' : text).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  // ==========================================================================
  // Shared item inspect service (idempotent across plugins)
  // ==========================================================================
  // The backpack's right page, as one callable. Any other menu that inspects an
  // item (the main menu's search page, ...) renders the identical card from the
  // identical code instead of a second, drifting copy of it, exactly as
  // window.SkillDetails does for skills.
  if (!window.ItemInspect) {
    window.ItemInspect = (() => {

      // Rarity is sourced from the theme-defined --rarity-* tokens so the grid
      // stripe and the inspect-panel label always match the active theme palette.
      const rarityOf = (item) => {
        const make = (key, name) => ({ name, key, color: `var(--rarity-${key})` });
        if (!item) return make('common', T('Inventory.rarity.common'));
        if (item.meta && item.meta.Rarity) {
          const r = item.meta.Rarity.trim().toLowerCase();
          if (r === 'mythic' || r === 'legendary') return make('legendary', T('Inventory.rarity.mythic'));
          if (r === 'epic')                        return make('epic',      T('Inventory.rarity.epic'));
          if (r === 'rare')                        return make('rare',      T('Inventory.rarity.rare'));
          if (r === 'uncommon')                    return make('uncommon',  T('Inventory.rarity.uncommon'));
          if (r === 'common')                      return make('common',    T('Inventory.rarity.common'));
        }
        if (item.price >= 1200) return make('legendary', T('Inventory.rarity.mythic'));
        if (item.price >= 600)  return make('rare',      T('Inventory.rarity.rare'));
        if (item.price >= 200)  return make('uncommon',  T('Inventory.rarity.uncommon'));
        return make('common', T('Inventory.rarity.common'));
      };

      const typeLabelOf = (item) => {
        if (!item) return T('Inventory.itemType.standard');
        if (DataManager.isWeapon(item)) return T('Inventory.itemType.weapon');
        if (DataManager.isArmor(item))  return T('Inventory.itemType.armor');
        const has = (cat) => !!(window.ItemSystemUtils && window.ItemSystemUtils.hasItemCategory(item, cat));
        if (has('Food'      /* i18n-ignore: category tag */)) return T('Inventory.itemType.food');
        if (has('Medical'   /* i18n-ignore: category tag */)) return T('Inventory.itemType.medical');
        if (has('Tools'     /* i18n-ignore: category tag */)) return T('Inventory.itemType.tools');
        if (has('Materials' /* i18n-ignore: category tag */)) return T('Inventory.itemType.materials');
        return T('Inventory.itemType.standard');
      };

      // The plain, informative phrase from the database (what the item does).
      // ItemDescription keeps $dataItems in sync with the world seed, so reading
      // the field here is enough.
      const descriptionOf = (item) => {
        if (!item || !item.description) return '';
        let text = String(item.description).trim();
        if (!text) return '';
        if (window.translateText && typeof window.translateText === 'function') text = window.translateText(text);
        return text.replace(/\n/g, '<br>');
      };

      const loreOf = (item, itemType) => {
        if (!item) return '';
        if (item.meta && item.meta.Lore && String(item.meta.Lore).trim().length > 0) {
          // The tag holds a key; loreTemplate turns it into the template.
          let lore = (window.ItemSystemUtils && window.ItemSystemUtils.loreTemplate)
            ? window.ItemSystemUtils.loreTemplate(item.meta.Lore)
            : String(item.meta.Lore).trim();
          if (window.ItemSystemUtils && typeof window.ItemSystemUtils.fillLore === 'function') lore = window.ItemSystemUtils.fillLore(lore, item.id);
          return lore;
        }
        // No description fallback here: the short description is drawn on its own
        // line above the lore (descriptionOf), so repeating it would print the
        // same sentence twice.
        if (itemType === T('Inventory.itemType.medical')) return T('Inventory.blurb.remedy');
        if (itemType === T('Inventory.itemType.food'))    return T('Inventory.blurb.provision');
        if (itemType === T('Inventory.itemType.weapon'))  return T('Inventory.blurb.armament');
        if (itemType === T('Inventory.itemType.armor'))   return T('Inventory.blurb.shield');
        if (itemType === T('Inventory.itemType.tools'))   return T('Inventory.blurb.apparatus');
        return T('Inventory.blurb.specimen');
      };

      // ---- Metadata sections -------------------------------------------------
      const getParamName = (id) => (['HP','MP','STR','CON','INT','WIS','DEX','PSI'][id] || T('Inventory.spec.stat'));

      const translateFormula = (formula) => {
        if (!formula) return '';
        return formula
          .replace(/\b[ab]\.mhp\b/gi, T('Inventory.spec.maxHp')).replace(/\b[ab]\.mmp\b/gi, T('Inventory.spec.maxMp'))
          .replace(/\b[ab]\.hp\b/gi,  'HP').replace(/\b[ab]\.mp\b/gi,  'MP').replace(/\b[ab]\.tp\b/gi, 'AP')
          .replace(/\b[ab]\.atk\b/gi, 'STR').replace(/\b[ab]\.def\b/gi, 'CON')
          .replace(/\b[ab]\.mat\b/gi, 'INT').replace(/\b[ab]\.mdf\b/gi, 'WIS')
          .replace(/\b[ab]\.agi\b/gi, 'DEX').replace(/\b[ab]\.luk\b/gi, 'PSI');
      };
      const getHitTypeName    = (h) => (T.list('Inventory.spec.hitType')[h] || T.list('Inventory.spec.hitType')[0]);
      const getOccasionName   = (o) => (T.list('Inventory.spec.occasion')[o] || T.list('Inventory.spec.occasion')[0]);
      const getScopeName      = (s) => (T.list('Inventory.spec.scope')[s] || T('Inventory.spec.none'));
      const getDamageTypeName = (t) => (T.list('Inventory.spec.damageType')[t] || T('Inventory.spec.none'));

      // Icons are 32x32 in a 16-wide sheet; scaling the background to size*16
      // wide renders any icon at an arbitrary size (same trick FurnitureSystem
      // uses for its build panel).
      const recipeMatIconHTML = (iconIndex, size = 16) => {
        const x = (iconIndex % 16) * size;
        const y = Math.floor(iconIndex / 16) * size;
        // i18n-ignore: inline CSS for the IconSet sprite cell
        return `<span class="recipe-mat-icon" style="width:${size}px;height:${size}px;background-position:-${x}px -${y}px;background-size:${size * 16}px auto;"></span>`;
      };

      const parseRecipeToNames = (recipeStr) => {
        if (!recipeStr) return '';
        return recipeStr.split(',').map(part => {
          const m = part.trim().match(/^(\d+)x(\d+)$/i);
          if (!m) return part.trim();
          const obj = $dataItems[parseInt(m[1],10)];
          if (!obj) return T('Inventory.section.unknownStack', { n: m[2] });
          return `<span class="recipe-mat">${recipeMatIconHTML(obj.iconIndex)}${obj.name} x${m[2]}</span>`;
        }).join(', ');
      };

      // Every block of facts on the right page is the same stat block: one
      // .inspect-spec-grid of label/value pairs, the label muted, the value in
      // the bright ink and right-aligned in its own column. No block inks or
      // sizes itself (docs/task/ui_fixing.md).
      // A value that is a list rather than a word (every status a remedy lifts,
      // every material a recipe eats) is crushed into a two-word right-hand
      // column and comes out as a ragged tower with white space all down the
      // row. Past a short measure the pair stacks instead: the label on its
      // line, the list under it running the full width, left to right.
      const STACK_AT = 28;
      const specRowHTML = (label, val, valClass) => {
        const plain   = String(val).replace(/<[^>]*>/g, '');
        const stacked = (valClass || '').includes('inspect-spec-value--wrap') && plain.length > STACK_AT;
        return `<div class="inspect-spec-row${stacked ? ' inspect-spec-row--stacked' : ''}">` +
          `<span class="inspect-spec-label">${label}:</span>` +
          `<span class="inspect-spec-value${valClass ? ' ' + valClass : ''}">${val}</span>` +
        `</div>`;
      };
      const specBlock = (rowsHTML) => `<div class="inspect-spec-grid">${rowsHTML}</div>`;
      const buildSpecRows = (specs) =>
        specBlock(specs.map(s => specRowHTML(s.label, s.val, s.valClass)).join(''));

      // Everything under the header: description, lore, and every spec block the
      // item has anything to say in.
      // `opts.out` receives the general spec list so the caller can hoist it up
      // beside the turning piece, and `opts.hoistGeneral` then keeps this body
      // from printing the same rows a second time.
      function detailsHTML(selectedItem, opts) {
        if (!selectedItem) return '';
        const dOpts = opts || {};
        const isWeapon = DataManager.isWeapon(selectedItem);
        const isArmor  = DataManager.isArmor(selectedItem);
        const isItem   = DataManager.isItem(selectedItem);
        const itemType = typeLabelOf(selectedItem);
        const loreText = loreOf(selectedItem, itemType);

        const generalSpecs = [];
        if (isWeapon) {
          generalSpecs.push({ label: T('Inventory.spec.label.weaponType'), val: $dataSystem.weaponTypes[selectedItem.wtypeId] || T('Inventory.spec.label.weaponFallback') });
          // A keepsake is dated the way a book is: the year is most of what it
          // is (window.ItemCollectibles reads the <Year:> tag).
          const keepsakeYear = window.ItemCollectibles
            ? window.ItemCollectibles.yearText(selectedItem) : "";
          if (keepsakeYear) {
            generalSpecs.push({ label: T('Inventory.spec.label.year'), val: keepsakeYear });
          }
          const dt = (selectedItem.meta && selectedItem.meta.DamageType) ||
              (selectedItem.note && (selectedItem.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
          if (dt) {
            generalSpecs.push({ label: T('Inventory.spec.label.damageCategory'), val: String(dt).trim() });
          }
          const note = selectedItem.note || '';
          const scales = [];
          const regex = /<Scale:\s*([^>]+)>/gi;
          let match;
          while ((match = regex.exec(note)) !== null) {
            scales.push(...match[1].split(',').map(s => s.trim().toUpperCase()));
          }
          if (scales.length > 0) {
            generalSpecs.push({ label: T('Inventory.spec.label.scaling'), val: scales.join(' + ') });
          }
        }
        else if (isArmor) {
          generalSpecs.push({ label: T('Inventory.spec.label.armorType'), val: $dataSystem.armorTypes[selectedItem.atypeId] || T('Inventory.spec.label.armorFallback') });
          generalSpecs.push({ label: T('Inventory.spec.label.equipSlot'), val: $dataSystem.equipTypes[selectedItem.etypeId] || T('Inventory.spec.label.slotFallback') });
        } else if (isItem) {
          generalSpecs.push({ label: T('Inventory.spec.label.consumable'), val: selectedItem.consumable ? T('Inventory.spec.yes') : T('Inventory.spec.no') });
          generalSpecs.push({ label: T('Inventory.spec.label.occasion'),   val: getOccasionName(selectedItem.occasion) });
          generalSpecs.push({ label: T('Inventory.spec.label.scope'),      val: getScopeName(selectedItem.scope) });
          // A book is about something, and reading it teaches that something
          // (window.BookLearning owns the <Teaches:> tag and the payout).
          const teaches = window.BookLearning ? window.BookLearning.label(selectedItem) : '';
          if (teaches) {
            generalSpecs.push({ label: T('Inventory.spec.label.teaches'), val: teaches });
          }
          // A pastime says what a sitting with it is worth, in the same words
          // the shelf it stands on is captioned (window.ItemLeisure owns the
          // <Leisure:> tag, here and on every counter).
          if (window.ItemLeisure && window.ItemLeisure.isLeisure(selectedItem)) {
            generalSpecs.push({
              label: window.ItemLeisure.label(),
              val: window.ItemLeisure.gainText(selectedItem),
            });
          }
          const dt = (selectedItem.meta && selectedItem.meta.DamageType) ||
              (selectedItem.note && (selectedItem.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
          if (dt && dt !== 'None' && !(selectedItem.damage && selectedItem.damage.type > 0)) {
            generalSpecs.push({ label: T('Inventory.spec.label.damageCategory'), val: String(dt).trim() });
          }
        }

        const paramSpecs = [];
        if (selectedItem.params) {
          selectedItem.params.forEach((val, pIdx) => {
            if (val !== 0) paramSpecs.push({ label: getParamName(pIdx), val: (val > 0 ? '+' : '') + val });
          });
        }

        const invocationSpecs = [];
        if (isItem) {
          if (selectedItem.speed !== 0)         invocationSpecs.push({ label: T('Inventory.spec.label.speedAdjust'),       val: (selectedItem.speed > 0 ? '+' : '') + selectedItem.speed });
          if (selectedItem.successRate !== 100) invocationSpecs.push({ label: T('Inventory.spec.label.successRate'),        val: selectedItem.successRate + '%' });
          if (selectedItem.repeats > 1)         invocationSpecs.push({ label: T('Inventory.spec.label.repeatActions'),      val: 'x' + selectedItem.repeats });
          if (selectedItem.tpGain > 0)          invocationSpecs.push({ label: T('Inventory.spec.label.apGain'),             val: '+' + selectedItem.tpGain });
          if (selectedItem.hitType !== 0)       invocationSpecs.push({ label: T('Inventory.spec.label.hitClassification'),  val: getHitTypeName(selectedItem.hitType) });
        }

        const damageSpecs = [];
        if (selectedItem.damage && selectedItem.damage.type > 0) {
          const dt = (selectedItem.meta && selectedItem.meta.DamageType) ||
              (selectedItem.note && (selectedItem.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
          if (dt) {
            damageSpecs.push({ label: T('Inventory.spec.label.damageCategory'), val: String(dt).trim() });
          }
          damageSpecs.push({ label: T('Inventory.spec.label.damageType'), val: getDamageTypeName(selectedItem.damage.type) });
          if (selectedItem.damage.elementId > 0) damageSpecs.push({ label: T('Inventory.spec.label.attackElement'), val: $dataSystem.elements[selectedItem.damage.elementId] || T('Inventory.spec.noneValue') });
          const formula = selectedItem.damage.formula ? selectedItem.damage.formula.trim() : '';
          if (formula && formula !== '0' && formula !== '0.0') damageSpecs.push({ label: T('Inventory.spec.label.formula'), val: translateFormula(formula) });
          if (selectedItem.damage.variance > 0)  damageSpecs.push({ label: T('Inventory.spec.label.variance'),    val: selectedItem.damage.variance + '%' });
          if (selectedItem.damage.critical)      damageSpecs.push({ label: T('Inventory.spec.label.canCritical'), val: T('Inventory.spec.yes') });
        }

        // Effects are grouped by kind so a long state list collapses into a
        // single "Remove States: A, B, C" bullet instead of one bullet each.
        const effectsOrdered = [];
        const effectGroups   = {};
        const addEffectGroup = (key, label, entry) => {
          let g = effectGroups[key];
          if (!g) { g = effectGroups[key] = { label, items: [] }; effectsOrdered.push({ group: g }); }
          g.items.push(entry);
        };
        const addEffectSolo = (text) => { if (text) effectsOrdered.push({ text }); };
        if (selectedItem.effects) {
          selectedItem.effects.forEach(eff => {
            const v1 = eff.value1; const v2 = eff.value2; const did = eff.dataId;
            if      (eff.code === 21) { const s = $dataStates[did]; if (s && s.name) addEffectGroup('addState', T('Inventory.effect.addStates'), `${s.name} ${Math.round(v1*100)}%`); }
            else if (eff.code === 22) { const s = $dataStates[did]; if (s && s.name) { const pct = Math.round(v1*100); addEffectGroup('remState', T('Inventory.effect.removeStates'), `${s.name}${pct === 100 ? '' : ` (${pct}%)`}`); } }
            else if (eff.code === 31) addEffectGroup('addBuff',   T('Inventory.effect.addBuffs'),      T('Inventory.effect.turns', { param: getParamName(did), n: v1 }));
            else if (eff.code === 32) addEffectGroup('addDebuff', T('Inventory.effect.addDebuffs'),    T('Inventory.effect.turns', { param: getParamName(did), n: v1 }));
            else if (eff.code === 33) addEffectGroup('remBuff',   T('Inventory.effect.removeBuffs'),   getParamName(did));
            else if (eff.code === 34) addEffectGroup('remDebuff', T('Inventory.effect.removeDebuffs'), getParamName(did));
            else if (eff.code === 11 && (v1 !== 0 || v2 !== 0)) addEffectSolo(T('Inventory.effect.recoverHp', { amount: `${v1>0?Math.round(v1*100)+'%':''}${v1>0&&v2>0?' + ':''}${v2>0?v2:''}` }));
            else if (eff.code === 12 && (v1 !== 0 || v2 !== 0)) addEffectSolo(T('Inventory.effect.recoverMp', { amount: `${v1>0?Math.round(v1*100)+'%':''}${v1>0&&v2>0?' + ':''}${v2>0?v2:''}` }));
            else if (eff.code === 13) addEffectSolo(T('Inventory.effect.gainAp', { n: did }));
            else if (eff.code === 41) addEffectGroup('grow', T('Inventory.effect.grow'), `${getParamName(did)} +${v1}`);
            else if (eff.code === 42) { const sk = $dataSkills[did]; if (sk && sk.name) addEffectGroup('learn', T('Inventory.effect.learnSkills'), sk.name); }
          });
        }

        const traitsList = window.ItemSystemUtils.traitLines(selectedItem);

        const noteTags = []; const nutritionSpecs = [];
        if (selectedItem.note) {
          const matches = selectedItem.note.match(/<([^>]+)>/g);
          if (matches) {
            matches.forEach(m => {
              const inner = m.slice(1,-1).trim();
              const colonIdx = inner.indexOf(':');
              let name = inner; let val = '';
              if (colonIdx !== -1) { name = inner.substring(0, colonIdx).trim(); val = inner.substring(colonIdx+1).trim(); }
              const nl = name.toLowerCase();
              if (nl === 'movement' || nl === 'weight' || nl === 'category' || nl === 'uncraftable' || nl === 'damagetype') return;
              // Sound file names are for the engine, not the reader.
              if (nl === 'hitsounds' || nl === 'weaponsounds' || nl === 'hitsound' || nl === 'weaponsound') return;
              // <Scale:> is already printed as "Scaling" in the specifications
              // above, and a weapon carries one tag per stat, so leaving it here
              // repeated the same answer once per stat.
              if (nl === 'scale') return;
              if (nl === 'needrestore') return; // rendered as its own "Needs Restored" section below
              if (nl === 'leisure') return;     // printed as its own spec row above
              // <Medicine:>, <Cures:> and <Treats:> are already rendered as
              // their own "Medicine" section above (getMedicineInfo); listing
              // them again here just repeats the same facts under the wrong
              // heading.
              if (nl === 'medicine' || nl === 'cures' || nl === 'treats') return;
              // <Lore:> holds a bank key, not a sentence. It is already resolved
              // and printed as the flavour paragraph above, so listing it here
              // only leaks the key ("LoreItems.119") onto the page.
              if (nl === 'lore') return;
              if (nl === 'calories' || nl === 'fat' || nl === 'protein') { nutritionSpecs.push({ label: nl.charAt(0).toUpperCase()+nl.slice(1), val }); return; }
              if (nl === 'recipe') { noteTags.push({ name: T('Inventory.section.craftingRecipe'), value: parseRecipeToNames(val) }); return; }
              // <Nature:> says whether a thing is worked by hand or by art.
              // "Both" is the database's way of saying "nothing magical about
              // it", which is what the player wants to read.
              if (nl === 'nature') {
                const nature = val.toLowerCase() === 'both' ? 'Mundane' /* i18n-ignore: note-tag value, named below */ : val;
                const key = 'Inventory.nature.' + nature.toLowerCase();
                noteTags.push({ name: T('Inventory.nature.label'), value: T.has(key) ? T(key) : nature });
                return;
              }
              noteTags.push({ name: name.charAt(0).toUpperCase()+name.slice(1), value: val || T('Inventory.spec.yes') });
            });
          }
        }

        // The short description states what the item does; the lore below it is
        // the combinatorial, world-seeded flavour. Both are shown.
        // Combinatorial descriptions leave double spaces and stray blank lines
        // where an alternative resolved to nothing, which print as gaps in the
        // middle of the sentence.
        const tidyProse = (t) => String(t || '')
          .replace(/[ 	]*(?:<br\s*\/?>[ 	]*){2,}/gi, '<br>')
          .replace(/^(?:\s|<br\s*\/?>)+|(?:\s|<br\s*\/?>)+$/gi, '')
          .replace(/[ 	]{2,}/g, ' ')
          .replace(/\s+([,.;:!?])/g, '$1');
        const shortDesc = tidyProse(descriptionOf(selectedItem));
        let detailedInfoHTML = '';
        if (shortDesc) detailedInfoHTML += `<div class="inspect-desc">${shortDesc}</div>`;
        // The lore is the last thing on the card. It is flavour, and reading it
        // first pushed the numbers the player actually opened the card for off
        // the bottom of the page, so it goes under every spec block instead.
        const loreProse = tidyProse(loreText);

        if (dOpts.out) dOpts.out.general = generalSpecs;
        if (generalSpecs.length && !dOpts.hoistGeneral) { detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.specifications')}</div>`         + buildSpecRows(generalSpecs); }
        if (paramSpecs.length)      { detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.attributeModifiers')}</div>`   + specBlock(paramSpecs.map(s => specRowHTML(s.label, s.val, s.val.startsWith('+') ? 'inspect-spec-value--gain' : 'inspect-spec-value--loss')).join('')); }
        if (invocationSpecs.length) { detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.invocationStats')}</div>`      + buildSpecRows(invocationSpecs); }
        if (damageSpecs.length)     { detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.combatApplication')}</div>`    + buildSpecRows(damageSpecs); }
        if (effectsOrdered.length) {
          detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.medicalEffects')}</div>` + specBlock(effectsOrdered.map(e =>
            e.group
              ? specRowHTML(e.group.label, e.group.items.join(', '), 'inspect-spec-value--wrap')
              : `<div class="inspect-bullet-item">${e.text}</div>`
          ).join(''));
        }
        if (traitsList.length)      { detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.specialProperties')}</div>`   + specBlock(traitsList.map(t => `<div class="inspect-bullet-item">${t}</div>`).join('')); }
        if (nutritionSpecs.length)  { detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.nutritionalProfile')}</div>`  + buildSpecRows(nutritionSpecs); }
        const needRestores = window.ItemSystemUtils && window.ItemSystemUtils.getNeedRestores ? window.ItemSystemUtils.getNeedRestores(selectedItem) : [];
        if (needRestores.length) {
          detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.needsRestored')}</div>`
            + specBlock(needRestores.map(r => specRowHTML(r.label, `+${r.amount}%`)).join(''));
        }
        // What this item is medicine for. A course is only worth anything taken
        // daily, so the number of doses each illness asks for is printed beside
        // it; anything it merely holds at bay is listed separately.
        const medicine = window.ItemSystemUtils && window.ItemSystemUtils.getMedicineInfo
          ? window.ItemSystemUtils.getMedicineInfo(selectedItem) : null;
        if (medicine) {
          // The full list runs to dozens of illnesses, which used to bury every
          // other section of the card. Only the counts are printed here; the
          // register itself lives behind the Info button.
          detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.medicine')}</div>`;
          detailedInfoHTML += specBlock(
            specRowHTML(T('Shop.medicineClass'), medicine.label)
            + (medicine.cures.length ? specRowHTML(T('Shop.medicineCures'), T('Inventory.medicineIllnessCount', { count: medicine.cures.length })) : '')
            + (medicine.treats.length ? specRowHTML(T('Shop.medicineTreats'), T('Inventory.medicineIllnessCount', { count: medicine.treats.length })) : ''));
          if (medicine.cures.length || medicine.treats.length) {
            const ref = itemRefOf(selectedItem);
            detailedInfoHTML += `<div class="inspect-medicine-info"><div class="army-dialog-btn" onclick="window.ItemInspect.showMedicineInfo('${ref.kind}', ${ref.id})">${T('Inventory.medicineInfoButton')}</div></div>`;
          }
        }
        const cravingsFed = window.ItemSystemUtils && window.ItemSystemUtils.getAddictionRelief ? window.ItemSystemUtils.getAddictionRelief(selectedItem) : [];
        if (cravingsFed.length) {
          detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.cravingsFed')}</div>`
            + specBlock(cravingsFed.map(r => specRowHTML(r.label, `-${r.amount}%`, 'inspect-spec-value--muted')).join(''));
        }
        if (noteTags.length)        { detailedInfoHTML += `<div class="inspect-section-title">${T('Inventory.section.blueprints')}</div>` + specBlock(noteTags.map(tag => specRowHTML(tag.name, tag.value, 'inspect-spec-value--wrap')).join('')); }
        if (loreProse) detailedInfoHTML += `<div class="inspect-flavour">${loreProse}</div>`;

        return detailedInfoHTML;
      }

      // The whole card. `opts.nameExtraHTML` rides beside the name (the backpack
      // hangs its favourite star there), `opts.actionsHTML` fills the button
      // strip, and `opts.extraHTML` is dropped between the meta grid and the
      // details (the search page mounts its 3D weapon viewport there).
      function build(item, opts) {
        if (!item) return '';
        const o = opts || {};
        const canvasId = o.canvasId || 'inspect-canvas';
        const rarity   = rarityOf(item);
        const itemType = typeLabelOf(item);
        const weightGrams = (window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight ? window.ItemSystemUtils.getItemWeight(item) : 0);
        const weightVal = weightGrams / 1000;
        // Anything light enough to round away to 0.00 kg is written in grams
        // instead, so only a truly weightless thing hides the row (#141).
        const weightText = weightVal >= 0.01 ? `${weightVal.toFixed(2)} kg` : `${weightGrams} g` /* i18n-ignore: unit */;
        const valueVal  = ((item.price || 0) / 100).toFixed(2);

        // The details are built first: with a turning piece on the card, the
        // general specs (consumable, usable, scope and their kin) are hoisted
        // out of the body and read as one column beside it, under the weight
        // and the price.
        const extra = o.extraHTML || '';
        const detailsOut  = {};
        const detailsBody = detailsHTML(item, { hoistGeneral: !!extra, out: detailsOut });
        const hoistedHTML = (extra ? (detailsOut.general || []) : []).map(sp =>
          `<div class="inspect-meta-item"><span>${sp.label}</span><span class="inspect-meta-val">${sp.val}</span></div>`).join('');

        // Identity and numbers stand together in the left column, the turning
        // piece as a borderless square on the right, so the card reads across
        // rather than pushing the description a viewport further down.
        const identityHTML = `
            <div class="inspect-header">
              <div class="inspect-frame">
                <canvas id="${canvasId}" class="inspect-frame-canvas" width="32" height="32"></canvas>
              </div>
              <div class="inspect-title-box">
                <h3 class="inspect-name">${item.name}${o.nameExtraHTML || ''}</h3>
                <div class="inspect-rarity rarity--${rarity.key}">${rarity.name} ${itemType}</div>
              </div>
            </div>
            <div class="inspect-meta-grid inspect-meta-grid--stacked${weightGrams === 0 ? ' inspect-meta-grid--single' : ''}">
              ${weightGrams > 0 ? `<div class="inspect-meta-item"><span>${T('Inventory.section.unitWeight')}</span><span class="inspect-meta-val">${weightText}</span></div>` : ''}
              <div class="inspect-meta-item"><span>${T('Inventory.section.marketValue')}</span><span class="inspect-meta-val">${valueVal} €</span></div>
              ${hoistedHTML}
            </div>`;

        return `
        <div class="item-inspect">
          ${extra ? `<div class="inspect-topline">
            <div class="inspect-topline-info">${identityHTML}</div>
            <div class="inspect-topline-preview">${extra}</div>
          </div>` : identityHTML}
          <div class="inspect-lore">${detailsBody}</div>
          <div class="inspect-actions">${o.actionsHTML || ''}</div>
        </div>`;
      }

      // The icon painter every caller of build() needs for its header canvas.
      function drawIcon(iconIndex, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const bitmap = ImageManager.loadSystem('IconSet');
        const draw = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, 32, 32);
          ctx.imageSmoothingEnabled = false;
          const sx = (iconIndex % 16) * 32;
          const sy = Math.floor(iconIndex / 16) * 32;
          ctx.drawImage(bitmap.canvas, sx, sy, 32, 32, 0, 0, 32, 32);
        };
        if (bitmap.isReady()) draw(); else bitmap.addLoadListener(draw);
      }

      // A database entry addressed as a pair the click handler can put back
      // together, since an onclick attribute can only carry text.
      function itemRefOf(item) {
        if (!item) return { kind: 'item', id: 0 };
        if (item.wtypeId !== undefined) return { kind: 'weapon', id: item.id };
        if (item.atypeId !== undefined) return { kind: 'armor',  id: item.id };
        return { kind: 'item', id: item.id };
      }

      function resolveRef(kind, id) {
        if (kind === 'weapon') return $dataWeapons[id];
        if (kind === 'armor')  return $dataArmors[id];
        return $dataItems[id];
      }

      // The whole medicinal register of one item, as its own window: every
      // illness the course cures with the doses it asks for, then everything it
      // merely holds at bay.
      function showMedicineInfo(kind, id) {
        const item = resolveRef(kind, id);
        const info = item && window.ItemSystemUtils && window.ItemSystemUtils.getMedicineInfo
          ? window.ItemSystemUtils.getMedicineInfo(item) : null;
        if (!info) return;
        closeMedicineInfo();
        const el = document.createElement('div');
        el.id        = 'medicine-info-modal';
        el.className = 'army-dialog-overlay medicine-info-overlay';
        el.innerHTML = `
          <div class="army-dialog medicine-info-dialog">
            <h3>${escapeHtml(item.name)}</h3>
            <div class="medicine-info-body">
              ${specRowHTML(T('Shop.medicineClass'), info.label)}
              ${info.cures.length ? `<div class="inspect-section-title">${T('Shop.medicineCures')}</div>`
                + specBlock(info.cures.map(c => specRowHTML(c.name, T('Inventory.medicineDoses', { days: c.days }))).join('')) : ''}
              ${info.treats.length ? `<div class="inspect-section-title">${T('Shop.medicineTreats')}</div>`
                + specBlock(info.treats.map(t => `<div class="inspect-bullet-item">${escapeHtml(t.name)}</div>`).join('')) : ''}
            </div>
            <div class="army-dialog-buttons">
              <div class="army-dialog-btn selected" onclick="window.ItemInspect.closeMedicineInfo()">${T('Inventory.ui.cancel')}</div>
            </div>
          </div>`;
        el.addEventListener('click', (e) => { if (e.target === el) closeMedicineInfo(); });
        document.body.appendChild(el);
        // The scene below would read the same Escape as its own cancel and walk
        // out of the inspect card, so the key is eaten here while this is open.
        medicineKeyHandler = (e) => {
          if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') {
            e.preventDefault(); e.stopPropagation(); closeMedicineInfo();
          }
        };
        document.addEventListener('keydown', medicineKeyHandler, true);
      }

      let medicineKeyHandler = null;

      function closeMedicineInfo() {
        if (medicineKeyHandler) { document.removeEventListener('keydown', medicineKeyHandler, true); medicineKeyHandler = null; }
        const el = document.getElementById('medicine-info-modal');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }

      // The piece on its own, filling the screen: the same viewer the card's
      // little square runs, so the drag, the wheel button pan and the wheel
      // zoom behave exactly as they do in the inspect pane.
      let fullscreenEntry = null;
      let fullscreenKeyHandler = null;

      function showModelFullscreen(kind, id) {
        const item = resolveRef(kind, id);
        if (!item || typeof THREE === 'undefined' || !window.Weapon3DPreview) return;
        closeModelFullscreen();
        const el = document.createElement('div');
        el.id        = 'item-model-fullscreen';
        el.className = 'item-model-fullscreen';
        el.innerHTML = `
          <div class="item-model-fullscreen-stage"><canvas id="item-model-fullscreen-canvas"></canvas></div>
          <div class="item-model-fullscreen-bar">
            <span class="item-model-fullscreen-name">${escapeHtml(item.name)}</span>
            <span class="item-model-fullscreen-hint">${T('Inventory.model.fullscreenHint')}</span>
            <div class="army-dialog-btn" onclick="window.ItemInspect.closeModelFullscreen()">${T('Inventory.ui.cancel')}</div>
          </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', (e) => { if (e.target === el) closeModelFullscreen(); });
        const canvas = document.getElementById('item-model-fullscreen-canvas');
        const entry  = canvas ? window.Weapon3DPreview.mount(canvas, item) : null;
        if (entry) fullscreenEntry = [entry];
        // The scene below would read Escape as its own cancel and leave the
        // inspect card, so the key is eaten here while this is open.
        fullscreenKeyHandler = (e) => {
          if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') {
            e.preventDefault(); e.stopPropagation(); closeModelFullscreen();
          }
        };
        document.addEventListener('keydown', fullscreenKeyHandler, true);
      }

      function closeModelFullscreen() {
        if (fullscreenKeyHandler) { document.removeEventListener('keydown', fullscreenKeyHandler, true); fullscreenKeyHandler = null; }
        if (fullscreenEntry && window.Weapon3DPreview) window.Weapon3DPreview.disposeAll(fullscreenEntry);
        fullscreenEntry = null;
        const el = document.getElementById('item-model-fullscreen');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }

      function isModelFullscreenOpen() { return !!document.getElementById('item-model-fullscreen'); }

      return { rarityOf, typeLabelOf, descriptionOf, loreOf, detailsHTML, build, drawIcon, showMedicineInfo, closeMedicineInfo, showModelFullscreen, closeModelFullscreen, isModelFullscreenOpen };
    })();
  }

  // =========================================================================
  // Scene_EnhancedItem.prototype.create, DOM extension
  // =========================================================================

  const _Scene_EnhancedItem_create = Scene_EnhancedItem.prototype.create;
  Scene_EnhancedItem.prototype.create = function () {
    _Scene_EnhancedItem_create.call(this);

    // WASD state
    this._wasdInput      = { up: false, down: false, left: false, right: false };
    this._wasdHeld       = { up: false, down: false, left: false, right: false };
    this._wasdHoldFrames = { up: 0,     down: 0,     left: 0,     right: 0     };

    this._wasdListener = (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'w') { this._wasdInput.up    = true; this._wasdHeld.up    = true; event.preventDefault(); }
      if (key === 's') { this._wasdInput.down  = true; this._wasdHeld.down  = true; event.preventDefault(); }
      if (key === 'a') { this._wasdInput.left  = true; this._wasdHeld.left  = true; event.preventDefault(); }
      if (key === 'd') { this._wasdInput.right = true; this._wasdHeld.right = true; event.preventDefault(); }
    };
    this._wasdUpListener = (event) => {
      const key = event.key.toLowerCase();
      if (key === 'w') { this._wasdHeld.up    = false; this._wasdHoldFrames.up    = 0; }
      if (key === 's') { this._wasdHeld.down  = false; this._wasdHoldFrames.down  = 0; }
      if (key === 'a') { this._wasdHeld.left  = false; this._wasdHoldFrames.left  = 0; }
      if (key === 'd') { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
    };
    window.addEventListener('keydown', this._wasdListener);
    window.addEventListener('keyup',   this._wasdUpListener);

    // DOM state
    this._activeUICategory    = 'All'; // i18n-ignore: category id
    this._activeCategoryIndex = 0;
    this._dndSelectedIndex    = 0;
    this._dndActiveSection    = 'items';
    this._selectedActionIndex = 0;
    this._selectedTargetIndex = 0;
    this._dndTargetingMode    = false;
    this._dndStudyPicking     = false;
    this._dndTargetingItem    = null;
    this._dndActionsList      = [];
    this._discardModalOpen    = false;
    this._discardPendingItem  = null;
    this._discardModalFocusIdx = 0;
    this._discardQty          = 1;
    this._searchText          = '';
    this._searchOpen          = false;
    this._dndSortKey          = 'name';
    this._dndSortDirection    = 'asc';

    this.createUIbackpackOverlay();
  };

  // =========================================================================
  // update / terminate
  // =========================================================================

  Scene_EnhancedItem.prototype.update = function () {
    Scene_MenuBase.prototype.update.call(this);
    UIbackpackInputManager.update();
  };

  Scene_EnhancedItem.prototype.terminate = function () {
    if (this._wasdListener) {
      window.removeEventListener('keydown', this._wasdListener);
      window.removeEventListener('keyup',   this._wasdUpListener);
      this._wasdListener   = null;
      this._wasdUpListener = null;
    }

    UIbackpackInputManager.deactivate();

    if (window.ItemInspect) window.ItemInspect.closeModelFullscreen();
    this.disposeUIItemViewport();

    // The bar's root is a child of the container about to be torn down.
    if (window.ItemHotbar) window.ItemHotbar.disposeInventoryBar();

    if (this._dndContainer) {
      const container = this._dndContainer;
      container.style.transition  = 'opacity 0.2s ease-out';
      container.style.opacity     = '0';
      container.style.pointerEvents = 'none';
      setTimeout(() => {
        if (container && container.parentNode) container.parentNode.removeChild(container);
      }, 200);
      this._dndContainer = null;
    }

    Scene_MenuBase.prototype.terminate.call(this);
  };

  // =========================================================================
  // createUIbackpackOverlay
  // =========================================================================

  Scene_EnhancedItem.prototype.createUIbackpackOverlay = function () {
    this._dndContainer = document.createElement('div');
    this._dndContainer.id = 'menu-container';
    this._dndContainer.style.opacity    = '0';
    this._dndContainer.style.transition = 'opacity 0.22s ease-out';
    document.body.appendChild(this._dndContainer);

    this._rightClickStartedHere = false;
    this._dndContainer.addEventListener('mousedown', (event) => {
      if (event.button === 2) { this._rightClickStartedHere = true; event.stopPropagation(); }
    });
    this._dndContainer.addEventListener('mouseup', (event) => {
      if (event.button === 2) event.stopPropagation();
    });
    this._dndContainer.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this._rightClickStartedHere) return;
      this._rightClickStartedHere = false;
      const scene = SceneManager._scene;
      if (scene && scene.isActive()) {
        if (scene._discardModalOpen) { SoundManager.playCancel(); scene.cancelDiscard(); }
        else { UIbackpackInputManager.handleCancel(); }
      }
    });
    this._dndContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const content = this._dndContainer.querySelector('#backpack-grid');
      if (content) content.scrollTop += e.deltaY;
    }, { passive: false });

    this.refreshUIbackpack();
    UIbackpackInputManager.activate(this);

    setTimeout(() => {
      if (this._dndContainer) this._dndContainer.style.opacity = '1';
    }, 16);
  };

  // =========================================================================
  // refreshUIbackpack, full DOM rebuild (called on tab/data change)
  // =========================================================================

  Scene_EnhancedItem.prototype.refreshUIbackpack = function () {
    if (!this._dndContainer) return;

    // The category the roll below is read against: the fallback further down may
    // move it, and the grid key has to name the list that was actually built.
    const listCategory = this._activeUICategory;
    const itemsList = this.getFilteredUIItems();

    if (this._dndSelectedIndex >= itemsList.length) {
      this._dndSelectedIndex = Math.max(0, itemsList.length - 1);
    }
    const selectedItem    = itemsList[this._dndSelectedIndex] || null;
    this._dndSelectedItem = selectedItem;

    // ---- Category tab row ----
    // Read off the pockets rather than fixed: every category actually carried
    // has a tab, in alphabetical order behind All and Favourites, and the row
    // wraps to as many lines as that takes.
    const categories = this.uiCategories();
    // The last of a category can leave the pockets while its tab is the one
    // being read; the filter falls back to All rather than showing nothing
    // under a tab that is no longer there to press.
    if (!categories.includes(this._activeUICategory)) {
      this._activeUICategory = categories[0];
      this._activeCategoryIndex = 0;
    }

    const tabsHTML = `
      <div class="backpack-tabs-row">${categories.map((cat, idx) => {
        const isActive = this._activeUICategory === cat ? 'active' : '';
        const isFocused = (this._dndActiveSection === 'categories' && this._activeCategoryIndex === idx) ? 'selected' : '';
        // `cat` is the category name the scene filters on; only the caption is
        // localised, and a category nobody has translated reads as itself.
        const caption = this.uiCategoryLabel(cat);
        return `<div class="backpack-tab ${isActive} ${isFocused}" onclick="SceneManager._scene.setUICategory(this.dataset.cat)" data-cat="${escapeHtml(cat)}">${escapeHtml(caption)}</div>`;
      }).join('')}</div>
    `;

    // ---- Item grid ----
    // The pockets are a window onto the roll, not the whole of it: a sack with
    // a thousand things in it builds only the slots the page can show, and
    // paints only their icons (UI/MenuVirtualList.js). Every line is a closure,
    // so a slot costs nothing until it is on screen.
    //
    // What the grid actually shows, as one key: which pockets, in which order,
    // how deep each stack is and which rows wear a star. Equipping swaps one
    // weapon out and the replaced one back in, so the list length alone never
    // notices the change and the slots keep their stale onclick indices.
    // Everything that only the cursor moves - the mark on a slot, the card on
    // the right page - is deliberately NOT in this key: walking the pockets
    // with a held key must not rebuild them.
    const gridDataKey = `${listCategory}_${this._searchText || ''}_${this._dndSortKey}_${this._dndSortDirection}_${this.uiPocketStamp()}`;
    const gridChanged = !this._gridCache || this._gridCache.key !== gridDataKey;

    if (gridChanged) {
      // Under All the pockets are read as a categorized list: a full-width
      // heading opens each group. The headings are not .item-slot elements, so
      // the slot indices the grid is navigated and clicked by stay untouched.
      const grouped = this.isUIGroupedView();
      const lines = [];
      // Which of those lines are headings rather than slots: they span both
      // columns, so the window has to give them a line of their own.
      const headings = [];
      // Where each item sits among the lines, so the cursor can scroll onto a
      // slot that has not been built yet.
      const lineOf = [];
      let lastGroup = null;
      itemsList.forEach((item, idx) => {
        if (grouped) {
          const group = this.uiGroupOf(item);
          if (group !== lastGroup) {
            lastGroup = group;
            headings[lines.length] = true;
            lines.push(() => `<div class="backpack-group-title">${escapeHtml(this.uiCategoryLabel(group))}</div>`);
          }
        }
        lineOf[idx] = lines.length;
        lines.push(() => this.itemSlotHTML(item, idx));
      });
      this._gridCache = { key: gridDataKey, lines, headings, lineOf };
    }
    const gridLines    = this._gridCache.lines;
    const gridHeadings = this._gridCache.headings;
    const gridLineOf   = this._gridCache.lineOf;

    // ---- Weight bar ----
    const currentWeight  = (window.ItemSystemUtils ? window.ItemSystemUtils.calculateTotalWeight() : 0) / 1000;
    const maxWeight      = (window.ItemSystemUtils ? window.ItemSystemUtils.calculateMaxCarryWeight() : 60000) / 1000;
    const weightPercent  = Math.min(100, Math.floor((currentWeight / maxWeight) * 100));
    const backpackTitle  = T('Inventory.title');
    const backBtnText    = T('Inventory.back');

    // The carry gauge rides in the quick-slot header rather than owning a band
    // of its own above it: two lines of chrome for one number was a waste of the
    // page, and the weight is read while looking at the slots anyway. The
    // .weight-lbl-row / .weight-progress-fill hooks are kept so the in-place
    // refresh below still finds the value and the bar.
    const weightGaugeHTML = `
      <div class="weight-status">
        <div class="weight-lbl-row">
          <span>${T('Inventory.ui.carryWeight')}</span>
          <span>${currentWeight.toFixed(2)} / ${maxWeight.toFixed(2)} kg</span>
        </div>
        <div class="weight-progress">
          <div class="weight-progress-fill" style="width:${weightPercent}%;"></div>
        </div>
      </div>`;

    // ---- Sort tags ----
    const sortTagsHTML = ['name', 'weight', 'price'].map(key => {
      const isActive = this._dndSortKey === key;
      const arrow    = this._dndSortDirection === 'asc' ? '▲' : '▼';
      const label    = T('Inventory.sort.' + key);
      return `<div class="sort-tag ${isActive ? 'active' : ''}" onclick="SceneManager._scene.toggleUISort('${key}')">${label}${isActive ? ' ' + arrow : ''}</div>`;
    }).join('');

    // ---- Left page HTML ----
    const leftPageHTML = `
      <div class="left-page">
        <div class="page-header-bar">
          <div class="back-button" onclick="SceneManager._scene.onItemCancel()">${backBtnText}</div>
          <h2 class="title">${backpackTitle}</h2>
        </div>
        <div class="backpack-tabs">${tabsHTML}</div>
        <div class="backpack-search">
          ${this.searchFieldHTML()}
          <div class="backpack-sort-tags">${sortTagsHTML}</div>
        </div>
        <div class="backpack-grid" id="backpack-grid"></div>
        ${window.ItemHotbar ? window.ItemHotbar.inventoryBarHTML(weightGaugeHTML) : `<div class="backpack-hotbar"><div class="backpack-hotbar-head">${weightGaugeHTML}</div></div>`}
      </div>`;

    const leftPageContainer = this._dndContainer.querySelector('.left-page');

    // ---- Right page HTML ----
    // The card is torn down and built again only when the piece it describes
    // changes. A button walked along the strip, a slot marked, a stack counted:
    // none of those change a word on it, and rebuilding it would take the 3D
    // viewport's WebGL context down with it on every keypress. The focus marks
    // are moved afterwards instead, by markUIRightFocus().
    const selRef = selectedItem
      ? `${DataManager.isWeapon(selectedItem) ? 'w' : DataManager.isArmor(selectedItem) ? 'a' : 'i'}${selectedItem.id}${this.isItemFavorited(selectedItem) ? '*' : ''}`
      : '-';
    // While the picker is up the party's own HP is printed beside each name, so
    // it is part of what the page says.
    const targetRef = (this._dndTargetingMode && this._dndTargetingItem)
      ? `${this._dndTargetingItem.id}:${this._dndStudyPicking ? 's' : 'u'}:` +
        $gameParty.members().map(a => `${a.hp}/${a.mhp}`).join('.')
      : '-';
    const rightKey     = `${selRef}|${targetRef}`;
    const rightChanged = !leftPageContainer || this._lastRightKey !== rightKey;
    this._lastRightKey = rightKey;

    let rightPageInnerHTML = '';

    if (!rightChanged) {
      // nothing to build: the card on the page already says this
    } else if (this._dndTargetingMode && this._dndTargetingItem) {
      const item = this._dndTargetingItem;
      // Studying names its reader first: the hours are one member's, and the
      // knowledge is theirs, so the list is asking who sits down with it.
      const studyPick = !!this._dndStudyPicking;
      let targetsHTML = '';
      $gameParty.members().forEach((actor, idx) => {
        const isFocused = (this._dndActiveSection === 'targets' && this._selectedTargetIndex === idx) ? 'selected' : '';
        const call = studyPick ? `applyUIStudy(${idx})` : `applyUITarget(${idx})`;
        targetsHTML += `<div class="target-option ${isFocused}" onclick="SceneManager._scene.${call}">${actor.name()} (HP: ${actor.hp}/${actor.mhp})</div>`;
      });
      if (!studyPick && (item.scope === 8 || item.scope === 10)) {
        const allFocused = (this._dndActiveSection === 'targets' && this._selectedTargetIndex === $gameParty.members().length) ? 'selected' : '';
        targetsHTML += `<div class="target-option ${allFocused}" onclick="SceneManager._scene.applyUITarget(${$gameParty.members().length})">${T('Inventory.ui.allPartyCompanions')}</div>`;
      }
      // A ration is eaten, not administered; the heading says so, exactly as the
      // hotbar's own target card does.
      const isFood = !!(window.ItemSystemUtils &&
        window.ItemSystemUtils.hasItemCategory(item, 'Food' /* i18n-ignore: category tag */));
      const targetTitle = studyPick
        ? T('Inventory.study.who', { item: item.name, duration: this.studyDurationLabel(item) })
        : isFood
          ? T('Inventory.ui.eatItem', { item: item.name })
          : T('Inventory.ui.useItemOn', { item: item.name });
      const specialCommands = studyPick ? [] : this.parseSpecialCommands(item);
      specialCommands.forEach((specCmd, sIdx) => {
        const globalIdx = $gameParty.members().length + (item.scope === 8 || item.scope === 10 ? 1 : 0) + sIdx;
        const isFocused = (this._dndActiveSection === 'targets' && this._selectedTargetIndex === globalIdx) ? 'selected' : '';
        const label = T('Inventory.ui.special', { command: this.translateSpecialCommand(specCmd) });
        targetsHTML += `<div class="target-option target-option--special ${isFocused}" onclick="SceneManager._scene.triggerUISpecialAction('${specCmd}')">${label}</div>`;
      });
      rightPageInnerHTML = `
        <div class="target-overlay">
          <h3 class="target-title">${targetTitle}</h3>
          <div class="inspect-actions">
            ${targetsHTML}
            <div class="inspect-btn inspect-btn--secondary" onclick="SceneManager._scene.cancelUITargeting()">${T('Inventory.ui.cancel')}</div>
          </div>
        </div>`;
    } else if (!selectedItem) {
      rightPageInnerHTML = `
        <div class="item-inspect item-inspect--empty">
          <div class="inspect-placeholder-icon"></div>
          <h3 class="title">${T('Inventory.ui.inspectionLog')}</h3>
          <p class="inspect-placeholder-text">${T('Inventory.ui.inspectionPlaceholder')}</p>
        </div>`;
    } else {
      const isWeapon = DataManager.isWeapon(selectedItem);
      const isArmor  = DataManager.isArmor(selectedItem);

      // Action buttons
      let actionBtnsHTML = '';
      let btnIdx = 0;
      this._dndActionsList = [];

      const isUseable    = selectedItem.occasion === 0 || selectedItem.occasion === 2;
      const isEquippable = isWeapon || isArmor;

      if (isUseable) {
        const isFocused = (this._dndActiveSection === 'actions' && this._selectedActionIndex === btnIdx) ? 'selected' : '';
        actionBtnsHTML += `<div class="inspect-btn ${isFocused}" data-pad="use" onclick="SceneManager._scene.triggerUIItemAction('use')">${T('Inventory.ui.useItem')}</div>`;
        this._dndActionsList.push('use'); btnIdx++;
      }
      if (isEquippable) {
        const isFocused = (this._dndActiveSection === 'actions' && this._selectedActionIndex === btnIdx) ? 'selected' : '';
        actionBtnsHTML += `<div class="inspect-btn ${isFocused}" data-pad="confirm" onclick="SceneManager._scene.triggerUIItemAction('equip')">${T('Inventory.ui.equip')}</div>`;
        this._dndActionsList.push('equip'); btnIdx++;
      }

      // Em's vector gun is never thrown and never discarded: it is the one
      // thing she does not put down (Weapon/VectorGunSystem.js).
      const isBoundGear = !!(window.VectorGun && window.VectorGun.isBound(selectedItem));

      // Key items and materials are never thrown: window.ThrowItem is the
      // one answer to what may leave a hand.
      const canThrow = !window.ThrowItem || window.ThrowItem.isThrowable(selectedItem);
      if (window.Game_Map && Game_Map.prototype.isThrowBlocked && !isBoundGear && canThrow) {
        const isThrowFocused = (this._dndActiveSection === 'actions' && this._selectedActionIndex === btnIdx) ? 'selected' : '';
        actionBtnsHTML += `<div class="inspect-btn ${isThrowFocused}" onclick="SceneManager._scene.triggerUIItemAction('throw')">${T('Inventory.ui.throw')}</div>`;
        this._dndActionsList.push('throw'); btnIdx++;
      }

      // Favouriting is a button of its own down here rather than a star beside
      // the name: the row of actions is where the page's verbs live, and the
      // star kept being missed up in the header.
      if (this.canFavoriteItem(selectedItem)) {
        const isFavFocused = (this._dndActiveSection === 'actions' && this._selectedActionIndex === btnIdx) ? 'selected' : '';
        const isFav = this.isItemFavorited(selectedItem);
        actionBtnsHTML += `<div class="inspect-btn ${isFav ? 'active ' : ''}${isFavFocused}" data-pad="favorite" title="${T('Inventory.hotbar.starHint')}" onclick="SceneManager._scene.triggerUIItemAction('favorite')">${T(isFav ? 'Inventory.ui.unfavorite' : 'Inventory.ui.favorite')}</div>`;
        this._dndActionsList.push('favorite'); btnIdx++;
      }

      if (!isBoundGear) {
        const isDiscardFocused = (this._dndActiveSection === 'actions' && this._selectedActionIndex === btnIdx) ? 'selected' : '';
        actionBtnsHTML += `<div class="inspect-btn inspect-btn--danger ${isDiscardFocused}" data-pad="discard" onclick="SceneManager._scene.triggerUIItemAction('discard')">${T('Inventory.ui.discard')}</div>`;
        this._dndActionsList.push('discard'); btnIdx++;
      }

      // The card itself, from the shared inspect service (window.ItemInspect):
      // the main menu's search page renders the identical panel from it. The
      // viewport rides in the card's extra slot, between the meta grid and the
      // details, so the piece turns on the right page while its numbers are
      // read underneath it.
      rightPageInnerHTML = window.ItemInspect.build(selectedItem, {
        extraHTML:   this.itemViewportHTML(selectedItem),
        actionsHTML: actionBtnsHTML
      });
    }

    const rightPageHTML = `<div class="right-page">${rightPageInnerHTML}</div>`;

    if (!leftPageContainer) {
      this._lastTabsKey = categories.join('|');
      this._dndContainer.innerHTML = `<div class="book-spread inspect-pockets">${leftPageHTML}${rightPageHTML}</div>`;
    } else {
      // In-place update: tabs. The row itself is only rebuilt when the set of
      // categories changes - using the last of something takes its tab away -
      // and otherwise just has its active and focused marks moved.
      const tabsKey = categories.join('|');
      const tabsContainer = leftPageContainer.querySelector('.backpack-tabs');
      if (tabsContainer && this._lastTabsKey !== tabsKey) {
        this._lastTabsKey = tabsKey;
        tabsContainer.innerHTML = tabsHTML;
      }
      const tabs = leftPageContainer.querySelectorAll('.backpack-tab');
      tabs.forEach((tab, idx) => {
        const cat = categories[idx];
        tab.classList.toggle('active',    this._activeUICategory === cat);
        tab.classList.toggle('selected',  this._dndActiveSection === 'categories' && this._activeCategoryIndex === idx);
      });

      // Sort tags + weight bar. Neither can move without the pockets or the
      // sort moving with them, both of which are in the grid key.
      if (gridChanged) {
        const sortTagsContainer = leftPageContainer.querySelector('.backpack-sort-tags');
        if (sortTagsContainer) sortTagsContainer.innerHTML = sortTagsHTML;
        const weightValueEl = leftPageContainer.querySelector('.weight-lbl-row span:last-child');
        if (weightValueEl) weightValueEl.textContent = `${currentWeight.toFixed(2)} / ${maxWeight.toFixed(2)} kg` /* i18n-ignore: unit */;
        const weightFillEl = leftPageContainer.querySelector('.weight-progress-fill');
        if (weightFillEl) weightFillEl.style.width = `${weightPercent}%`;
      }

      // Right page
      if (rightChanged) {
        const rightPageContainer = this._dndContainer.querySelector('.right-page');
        if (rightPageContainer) rightPageContainer.innerHTML = rightPageInnerHTML;
      }
    }

    // The pockets themselves, drawn as a window over the roll. Slot clicks are
    // inline handlers carrying their own index, so a slot swapped in mid-scroll
    // needs no wiring of its own.
    const gridContainer = this._dndContainer.querySelector('#backpack-grid');
    if (gridContainer) {
      if (gridChanged || !gridContainer.__mvl) {
        window.MenuVirtualList.render(gridContainer, {
          key: gridDataKey,
          count: gridLines.length,
          renderItem: idx => gridLines[idx](),
          fullWidth: idx => !!gridHeadings[idx],
          emptyHTML: `<div class="item-grid-empty">${T('Inventory.empty')}</div>`,
          onWindow: (win) => {
            win.querySelectorAll('.item-slot').forEach(slot => {
              this.drawUIItemIcon(parseInt(slot.getAttribute('data-icon-index'), 10),
                slot.getAttribute('data-canvas-id'));
            });
          }
        });
      } else {
        // Same pockets, same order: the cursor moved and nothing else. Redrawing
        // the window would repaint every icon canvas on screen and force two
        // layout passes to measure rows whose heights are already known, so the
        // mark is simply moved from one slot to another.
        this.markUIGridFocus(gridContainer);
      }
    }

    // The mount point survives the in-place updates above, so the bar is only
    // ever re-rendered into it, never rebuilt from scratch with the page.
    if (window.ItemHotbar) window.ItemHotbar.renderInventoryBar(this);

    this.markUIRightFocus();

    if (rightChanged) {
      if (selectedItem) this.drawUIItemIcon(selectedItem.iconIndex, 'inspect-canvas');
      this.mountUIItemViewport(selectedItem);
    }

    if (this._dndActiveSection === 'items' && gridContainer) {
      const line = gridLineOf[this._dndSelectedIndex];
      if (line !== undefined) window.MenuVirtualList.scrollToIndex(gridContainer, line);
    }
  };

  // =========================================================================
  // Helper rendering methods
  // =========================================================================

  // One pocket. The row is the skills page's row, part for part: mark, icon,
  // name and a meta line under it. Where a skill prints what it costs to cast,
  // an item prints what the whole stack weighs, with the count on the right of
  // the same line. Only the slots the window can show are ever asked for one.
  Scene_EnhancedItem.prototype.itemSlotHTML = function (item, idx) {
    const isFocused  = (this._dndActiveSection === 'items' && this._dndSelectedIndex === idx) ? 'selected' : '';
    const count      = $gameParty.numItems(item);
    const canvasId   = `item-canvas-${idx}`;
    const rarity     = this.getUIItemRarity(item);
    const stackGrams = (window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight
      ? window.ItemSystemUtils.getItemWeight(item) : 0) * count;
    const stackKg    = stackGrams / 1000;
    const weightText = stackKg >= 0.01 ? `${stackKg.toFixed(2)} kg` : `${stackGrams} g` /* i18n-ignore: unit */;
    return `
          <div class="item-slot ${isFocused}" data-idx="${idx}" data-icon-index="${item.iconIndex}" data-canvas-id="${canvasId}" draggable="true" onclick="SceneManager._scene.selectUIItem(${idx})" onmouseenter="SceneManager._scene.hoverUIItem(${idx})" ondragstart="SceneManager._scene.onUIItemDragStart(event, ${idx})" ondragend="SceneManager._scene.onUIItemDragEnd(event)">
            <div class="item-rarity-bar" style="background:${rarity.color};"></div>
            <div class="item-slot-icon">
              <canvas id="${canvasId}" class="item-slot-icon-canvas--sm" width="32" height="32"></canvas>
            </div>
            <div class="item-slot-info">
              <div class="item-slot-name">${this.isItemFavorited(item) ? '★ ' : ''}${item.name}</div>
              <div class="item-slot-meta">
                <span>${weightText}</span>
                <span class="item-slot-count">x${count}</span>
              </div>
            </div>
          </div>`;
  };

  // Where the cursor is, as two class marks rather than as a redrawn page. The
  // slots carry their own index, so the mark is moved without asking the list
  // what is in it.
  Scene_EnhancedItem.prototype.markUIGridFocus = function (gridContainer) {
    const onItems = this._dndActiveSection === 'items';
    gridContainer.querySelectorAll('.item-slot').forEach((slot) => {
      const idx = parseInt(slot.getAttribute('data-idx'), 10);
      slot.classList.toggle('selected', onItems && idx === this._dndSelectedIndex);
    });
  };

  // The same, for the right page: the button strip under the card, or the list
  // of who the item is being used on. Both are drawn in the order the cursor
  // walks them, so the index is the position in the row.
  Scene_EnhancedItem.prototype.markUIRightFocus = function () {
    const rightPage = this._dndContainer && this._dndContainer.querySelector('.right-page');
    if (!rightPage) return;
    if (this._dndTargetingMode) {
      rightPage.querySelectorAll('.target-option').forEach((el, idx) => {
        el.classList.toggle('selected',
          this._dndActiveSection === 'targets' && this._selectedTargetIndex === idx);
      });
      return;
    }
    rightPage.querySelectorAll('.inspect-actions .inspect-btn').forEach((el, idx) => {
      el.classList.toggle('selected',
        this._dndActiveSection === 'actions' && this._selectedActionIndex === idx);
    });
  };

  // ---- the 3D piece on the right page --------------------------------------
  // Every entry in the database has a model (ItemSystem/Item3D_*.js), so the
  // inspect card shows the thing itself turning rather than only its icon. The
  // viewer is the shared one the equip screen and the search page use
  // (window.Weapon3DPreview), which is why nothing here knows about three.js.

  Scene_EnhancedItem.prototype.itemViewportHTML = function (item) {
    if (!item || typeof THREE === 'undefined' || !window.Weapon3DPreview) return '';
    return '<div class="item-3d-viewport item-3d-viewport--borderless"><canvas id="backpack-item-canvas"></canvas></div>';
  };

  // A mounted viewport is a fresh WebGL context and a model built from scratch
  // by the procedural pipeline. Walking the pockets with a held key would ask
  // for one per step, and the browser force-loses the game's own context once
  // the cap of live ones is passed. The mount therefore waits for the cursor to
  // come to rest; the square is empty for that moment and nothing else is.
  const VIEWPORT_SETTLE_MS = 90;

  Scene_EnhancedItem.prototype.mountUIItemViewport = function (item) {
    // The old viewport goes first: its canvas has just been replaced by the
    // page re-render, and its WebGL context has to be released or the browser
    // force-loses the game's own once the cap is passed.
    this.disposeUIItemViewport();
    if (!item || !window.Weapon3DPreview) return;
    this._itemViewportTimer = setTimeout(() => {
      this._itemViewportTimer = 0;
      // The scene may have been left, or the cursor moved on, while it waited.
      if (this._dndContainer && this._dndSelectedItem === item) this.mountUIItemViewportNow(item);
    }, VIEWPORT_SETTLE_MS);
  };

  Scene_EnhancedItem.prototype.mountUIItemViewportNow = function (item) {
    const canvas = document.getElementById('backpack-item-canvas');
    if (!canvas) return;
    const entry = window.Weapon3DPreview.mount(canvas, item);
    if (entry) this._itemPreviews = [entry];
    // A click on the square opens the piece full screen, but the same square is
    // also dragged to turn it: only a press that did not travel counts as a
    // click, so turning the model never throws the viewer open.
    let downAt = null;
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) downAt = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !downAt) { downAt = null; return; }
      const moved = Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
      downAt = null;
      if (moved > 6) return;
      const ref = item.wtypeId !== undefined ? 'weapon' : (item.atypeId !== undefined ? 'armor' : 'item');
      window.ItemInspect.showModelFullscreen(ref, item.id);
    });
  };

  Scene_EnhancedItem.prototype.disposeUIItemViewport = function () {
    if (this._itemViewportTimer) {
      clearTimeout(this._itemViewportTimer);
      this._itemViewportTimer = 0;
    }
    if (!this._itemPreviews) return;
    if (window.Weapon3DPreview) window.Weapon3DPreview.disposeAll(this._itemPreviews);
    this._itemPreviews = null;
  };

  Scene_EnhancedItem.prototype.drawUIItemIcon = function (iconIndex, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const bitmap = ImageManager.loadSystem('IconSet');
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 32, 32);
      ctx.imageSmoothingEnabled = false;
      const pw = 32; const ph = 32;
      const sx = (iconIndex % 16) * pw;
      const sy = Math.floor(iconIndex / 16) * ph;
      ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, 0, 0, 32, 32);
    };
    if (bitmap.isReady()) draw();
    else bitmap.addLoadListener(draw);
  };

  // Rarity, description and lore all live in the shared inspect service now, so
  // the grid stripe here and the inspect card read the same values from the same
  // code. These stay as thin aliases because the grid and other scenes call them.
  Scene_EnhancedItem.prototype.getUIItemRarity = function (item) {
    return window.ItemInspect.rarityOf(item);
  };

  Scene_EnhancedItem.prototype.getUIItemDescription = function (item) {
    return window.ItemInspect.descriptionOf(item);
  };

  Scene_EnhancedItem.prototype.getUIItemLore = function (item, itemType) {
    return window.ItemInspect.loreOf(item, itemType);
  };

  // =========================================================================
  // Discard modal
  // =========================================================================

  Scene_EnhancedItem.prototype.showDiscardModal = function (item) {
    if (!this._dndContainer || !item) return;
    if (window.VectorGun && window.VectorGun.isBound(item)) { SoundManager.playBuzzer(); return; }
    this._discardModalOpen    = true;
    this._discardModalFocusIdx = 0;
    this._discardPendingItem  = item;
    this._discardQty          = 1;
    const el = document.createElement('div');
    el.id        = 'discard-modal';
    el.className = 'army-dialog-overlay';
    this._dndContainer.appendChild(el);
    this.renderDiscardModal();
  };

  Scene_EnhancedItem.prototype.renderDiscardModal = function () {
    const el   = document.getElementById('discard-modal');
    const item = this._discardPendingItem;
    if (!el || !item) return;
    const owned = $gameParty.numItems(item);
    const qty   = Math.max(1, Math.min(this._discardQty, owned));
    this._discardQty = qty;
    const confirmSel = this._discardModalFocusIdx === 0 ? 'selected' : '';
    const cancelSel  = this._discardModalFocusIdx === 1 ? 'selected' : '';
    el.innerHTML = `
      <div class="army-dialog">
        <h3>${T('Inventory.ui.discardItem')}</h3>
        <p>${T('Inventory.ui.discardBody', { qty: `<strong>${qty}</strong>`, item: `<strong>${item.name}</strong>`, owned: owned })}</p>
        <div class="army-dialog-buttons">
          <div class="army-dialog-btn" id="discard-qty-minus" onclick="SceneManager._scene.adjustDiscardQty(-1)">-</div>
          <div class="army-dialog-btn" id="discard-qty-plus" onclick="SceneManager._scene.adjustDiscardQty(1)">+</div>
        </div>
        <div class="army-dialog-buttons">
          <div class="army-dialog-btn ${confirmSel}" id="discard-confirm-btn" onclick="SceneManager._scene.confirmDiscard()">${T('Inventory.ui.discard')}</div>
          <div class="army-dialog-btn ${cancelSel}" id="discard-cancel-btn" onclick="SceneManager._scene.cancelDiscard()">${T('Inventory.ui.cancel')}</div>
        </div>
      </div>`;
  };

  Scene_EnhancedItem.prototype.adjustDiscardQty = function (delta) {
    const item = this._discardPendingItem;
    if (!item) return;
    const owned = $gameParty.numItems(item);
    const next  = Math.max(1, Math.min(this._discardQty + delta, owned));
    if (next !== this._discardQty) { SoundManager.playCursor(); this._discardQty = next; this.renderDiscardModal(); }
  };

  Scene_EnhancedItem.prototype.confirmDiscard = function () {
    const item = this._discardPendingItem;
    if (item) {
      const owned = $gameParty.numItems(item);
      const qty   = Math.max(1, Math.min(this._discardQty, owned));
      SoundManager.playCancel();
      $gameParty.loseItem(item, qty);
      if ($gameParty.numItems(item) <= 0) { this._dndActiveSection = 'items'; this._dndSelectedIndex = 0; }
    }
    this.closeDiscardModal();
  };

  Scene_EnhancedItem.prototype.cancelDiscard = function () {
    SoundManager.playCancel();
    this.closeDiscardModal();
  };

  Scene_EnhancedItem.prototype.closeDiscardModal = function () {
    this._discardModalOpen   = false;
    this._discardPendingItem = null;
    const modal = document.getElementById('discard-modal');
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    this.refreshUIbackpack();
  };

  // =========================================================================
  // Targeting
  // =========================================================================

  Scene_EnhancedItem.prototype.cancelUITargeting = function () {
    this._dndTargetingMode  = false;
    this._dndTargetingItem  = null;
    this._dndStudyPicking   = false;
    this._dndActiveSection  = 'actions';
    this.refreshUIbackpack();
  };

  Scene_EnhancedItem.prototype.applyUITarget = function (targetIdx) {
    const item = this._dndTargetingItem;
    if (!item) return;
    const partySize = $gameParty.members().length;
    if (targetIdx === partySize) {
      // useItemOnAllParty plays the item sound itself; don't double it.
      this.useItemOnAllParty(item);
    } else {
      const actor = $gameParty.members()[targetIdx];
      if (actor) {
        if (DataManager.isItem(item)) {
          if (this.isItemTargetRequired(item)) {
            if (actor.canUse && !actor.canUse(item)) { SoundManager.playBuzzer(); return; }
            // useItemOnActor plays the item sound itself.
            this.useItemOnActor(actor, item);
          } else {
            // useItemWithoutTarget plays the item sound itself.
            this.useItemWithoutTarget(item);
          }
        } else {
          SoundManager.playEquip();
          this.equipItemToActor(item, actor);
        }
      }
    }
    const count = $gameParty.numItems(item);
    if (count <= 0) {
      this._dndTargetingMode = false; this._dndTargetingItem = null;
      this._dndActiveSection = 'items'; this._dndSelectedIndex = 0;
    } else {
      this._dndTargetingMode = false; this._dndTargetingItem = null;
      this._dndActiveSection = 'actions';
    }
    this.refreshUIbackpack();
  };

  // =========================================================================
  // Actions
  // =========================================================================

  Scene_EnhancedItem.prototype.triggerUIItemAction = function (action) {
    const item = this._dndSelectedItem;
    if (!item) return;
    if (action === 'use') {
      const specialCommands = this.parseSpecialCommands(item);
      if (this.isItemTargetRequired(item) || specialCommands.length > 0) {
        SoundManager.playOk();
        this._dndTargetingMode = true; this._dndTargetingItem = item;
        this._dndActiveSection = 'targets'; this._selectedTargetIndex = 0;
        this.refreshUIbackpack();
      } else {
        // useItemWithoutTarget plays the item sound itself; don't double it.
        this.useItemWithoutTarget(item);
        const count = $gameParty.numItems(item);
        if (count <= 0) { this._dndActiveSection = 'items'; this._dndSelectedIndex = 0; }
        this.refreshUIbackpack();
      }
    } else if (action === 'equip') {
      const compatibleActors = this.findCompatibleActors(item);
      if (compatibleActors.length === 0) {
        SoundManager.playBuzzer();
      } else if (compatibleActors.length === 1) {
        SoundManager.playEquip();
        this.equipItemToActor(item, compatibleActors[0]);
        this.refreshUIbackpack();
      } else {
        SoundManager.playOk();
        this._dndTargetingMode = true; this._dndTargetingItem = item;
        this._dndActiveSection = 'targets'; this._selectedTargetIndex = 0;
        this.refreshUIbackpack();
      }
    } else if (action === 'favorite') {
      this.toggleFavoriteStatus(item);
    } else if (action === 'throw') {
      this.throwUIItem(item);
    } else if (action === 'discard') {
      this.showDiscardModal(item);
    }
  };

  // =========================================================================
  // Throw, hands the item off to ThrowItemPlugin's map targeting flow
  // =========================================================================

  Scene_EnhancedItem.prototype.throwUIItem = function (item) {
    if (!item) return;
    if (window.VectorGun && window.VectorGun.isBound(item)) { SoundManager.playBuzzer(); return; }
    if (!(window.Game_Map && Game_Map.prototype.isThrowBlocked)) { SoundManager.playBuzzer(); return; }
    if ($gameParty.numItems(item) <= 0) { SoundManager.playBuzzer(); return; }

    let itemType = 'item';
    if (DataManager.isWeapon(item))     itemType = 'weapon';
    else if (DataManager.isArmor(item)) itemType = 'armor';

    // Scene_Map.start (ThrowItemPlugin) reads this and opens map targeting.
    $gameSystem._pendingThrowItem = {
      itemType:  itemType,
      itemId:    item.id,
      iconIndex: item.iconIndex
    };

    SoundManager.playOk();
    this.popScene();
    SceneManager.goto(Scene_Map);
  };

  // Favourites live on the hotbar (ItemSystemHotbar.js); the star is just the
  // shorthand for "first free slot".
  Scene_EnhancedItem.prototype.isItemFavorited = function (item) {
    return !!window.ItemHotbar && window.ItemHotbar.isFavorited(item);
  };

  Scene_EnhancedItem.prototype.canFavoriteItem = function (item) {
    return !!window.ItemHotbar && window.ItemHotbar.isFavoritable(item);
  };

  Scene_EnhancedItem.prototype.toggleFavoriteStatus = function (item) {
    if (!window.ItemHotbar || !window.ItemHotbar.toggle(item)) {
      SoundManager.playBuzzer();
      return;
    }
    SoundManager.playOk();
    this.refreshUIbackpack();
  };

  // The verb as the player reads it. Copy lives in js/i18n/<lang>/plugins/
  // Inventory.json under `special`; a verb nobody has translated keeps its id.
  Scene_EnhancedItem.prototype.translateSpecialCommand = function (name) {
    const key = 'Inventory.special.' + String(name || '');
    return T.has(key) ? T(key) : String(name || '');
  };

  // How long this book is to study, said as the panel says it.
  Scene_EnhancedItem.prototype.studyDurationLabel = function (item) {
    const B = window.BookLearning;
    if (!B || !B.studyMinutes) return '';
    const minutes = B.studyMinutes(item);
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (!h) return T('Inventory.study.minutes', { minutes: m });
    if (!m) return T('Inventory.study.hours', { hours: h });
    return T('Inventory.study.hoursMinutes', { hours: h, minutes: m });
  };

  // A member has been picked to sit down with the book.
  Scene_EnhancedItem.prototype.applyUIStudy = function (targetIdx) {
    const item  = this._dndTargetingItem;
    const actor = $gameParty.members()[targetIdx];
    if (!item || !actor || !window._InventoryStudyBook) { SoundManager.playBuzzer(); return; }
    this._dndStudyPicking = false;
    if (!window._InventoryStudyBook(item, actor)) {
      SoundManager.playBuzzer();
      this.cancelUITargeting();
      return;
    }
    // Hours went by: the map has a new time of day to show for them.
    SoundManager.playOk();
    this._dndTargetingMode = false;
    this._dndTargetingItem = null;
    this.popScene();
    SceneManager.goto(Scene_Map);
  };

  Scene_EnhancedItem.prototype.triggerUISpecialAction = function (specialName) {
    const item = this._dndTargetingItem || this._dndSelectedItem;
    if (!item) return;
    // SPECIAL_COMMANDS is defined in ItemSystemInventory.js; access via closure
    if (window._InventorySpecialCommands) {
      const cfg = window._InventorySpecialCommands[specialName];
      if (cfg) {
        // Studying asks whose hours these are before spending any of them.
        if (specialName === "Study") {   // i18n-ignore: verb id
          SoundManager.playOk();
          this._dndTargetingMode = true; this._dndTargetingItem = item;
          this._dndStudyPicking = true;
          this._dndActiveSection = 'targets'; this._selectedTargetIndex = 0;
          this.refreshUIbackpack();
          return;
        }
        $gameTemp._specialActionItemId = item.id;
        // Books quote themselves; everything else runs the verb's common event.
        const quoted = specialName === "Read" &&   // i18n-ignore: verb id
                       window._InventoryQueueBookExcerpt &&
                       window._InventoryQueueBookExcerpt(item);
        if (!quoted && !(cfg.commonEventId > 0)) {
          SoundManager.playBuzzer();
          return;
        }
        SoundManager.playOk();
        if (!quoted) {
          $gameTemp.reserveCommonEvent(cfg.commonEventId);
        }
        this.popScene();
        SceneManager.goto(Scene_Map);
        return;
      }
    }
    SoundManager.playBuzzer();
  };

  // =========================================================================
  // Category / sort / search helpers
  // =========================================================================

  Scene_EnhancedItem.prototype.setUICategory = function (cat) {
    SoundManager.playCursor();
    const cats = this.uiCategories();
    // A tab that is no longer on the row (the last of that category was used,
    // dropped or sold while the page was open) drops back to All rather than
    // leaving the pockets looking empty with no way out of the filter.
    this._activeUICategory    = cats.includes(cat) ? cat : cats[0];
    this._activeCategoryIndex = Math.max(0, cats.indexOf(this._activeUICategory));
    this._dndSelectedIndex    = 0;
    this.refreshUIbackpack();
  };

  Scene_EnhancedItem.prototype.toggleUISort = function (key) {
    SoundManager.playOk();
    if (this._dndSortKey === key) {
      this._dndSortDirection = this._dndSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this._dndSortKey       = key;
      this._dndSortDirection = 'asc';
    }
    this._dndSelectedIndex = 0;
    this.refreshUIbackpack();
  };

  // Passing the pointer over a row is enough to bring its piece up on the right
  // page: the card, and the model turning on it, follow the mouse. A hover never
  // steals the cursor back from the button strip, and never makes a sound.
  Scene_EnhancedItem.prototype.hoverUIItem = function (idx) {
    if (this._dndActiveSection === 'actions') return;
    if (this._dndActiveSection === 'items' && this._dndSelectedIndex === idx) return;
    this._dndActiveSection = 'items';
    this._dndSelectedIndex = idx;
    this.refreshUIbackpack();
  };

  Scene_EnhancedItem.prototype.selectUIItem = function (idx) {
    if (this._dndSelectedIndex === idx && this._dndActiveSection === 'items') {
      if (this._dndSelectedItem && this._dndActionsList.length > 0) {
        SoundManager.playOk();
        this._dndActiveSection    = 'actions';
        this._selectedActionIndex = 0;
        this.refreshUIbackpack();
        return;
      }
    }
    SoundManager.playCursor();
    this._dndActiveSection = 'items';
    this._dndSelectedIndex = idx;
    this.refreshUIbackpack();
  };

  // Dragging a grid slot onto a quick slot (ItemSystemHotbar.js's backpack
  // bar) favourites it, the same as clicking the item then clicking the slot.
  // Nothing here may touch refreshUIbackpack: rebuilding the grid mid-drag
  // would tear out the very element the browser is dragging.
  Scene_EnhancedItem.prototype.onUIItemDragStart = function (event, idx) {
    const item = this.getFilteredUIItems()[idx];
    if (!item || !(window.ItemHotbar && window.ItemHotbar.isFavoritable(item))) {
      event.preventDefault();
      return;
    }
    this._dragItem = item;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', String(item.id));
  };

  Scene_EnhancedItem.prototype.onUIItemDragEnd = function () {
    this._dragItem = null;
  };

  // The pockets wear the same collapsed search every other menu does
  // (UI/MenuSearchBar.js): a handle at the top right of the page, and the field
  // itself only once it has been clicked. The handle is never '.focusable', so
  // the controller walks the tabs and the slots and never the search.
  Scene_EnhancedItem.prototype.searchFieldHTML = function () {
    const open = !!this._searchOpen || !!this._searchText;
    const handle = window.MenuSearchBar
      ? window.MenuSearchBar.toggleHTML('SceneManager._scene.toggleUISearch()', open)
      : '';
    const field = open ? `
        <div class="msb-field">
          <input type="text" id="backpack-search-input" class="backpack-search-input"
            placeholder="${T('Inventory.searchPlaceholder')}" autocomplete="off"
            value="${this._searchText || ''}"
            oninput="SceneManager._scene.onSearchInput(this.value)"
            onkeydown="event.stopPropagation(); if(event.key==='Escape'){this.blur();SceneManager._scene.toggleUISearch();}"
            onkeyup="event.stopPropagation();"
            onkeypress="event.stopPropagation();"/>
        </div>` : '';
    return `<div class="msb msb-field-only${open ? '' : ' msb-collapsed'}" id="backpack-search-field">${field}${handle}</div>`;
  };

  // The pockets are patched in place rather than redrawn, so the handle repaints
  // its own corner of the page.
  Scene_EnhancedItem.prototype.toggleUISearch = function () {
    this._searchOpen = !this._searchOpen;
    SoundManager.playCursor();
    // A search closed behind the handle would go on narrowing the pockets with
    // nothing on the page saying so.
    const hadText = !!this._searchText;
    if (!this._searchOpen) this._searchText = '';
    const slot = document.getElementById('backpack-search-field');
    if (slot) slot.outerHTML = this.searchFieldHTML();
    if (this._searchOpen) {
      const input = document.getElementById('backpack-search-input');
      if (input) input.focus();
    } else if (hadText) {
      this._dndSelectedIndex = 0;
      this.refreshUIbackpack();
    }
  };

  Scene_EnhancedItem.prototype.onSearchInput = function (text) {
    this._searchText       = text;
    this._dndSelectedIndex = 0;
    this.refreshUIbackpack();
  };

  // Backing out of an active search puts the field away with it, so the page
  // is left as it was found: pockets, and a handle in the corner.
  Scene_EnhancedItem.prototype.clearSearch = function () {
    this._searchText       = '';
    this._searchOpen       = false;
    const slot = document.getElementById('backpack-search-field');
    if (slot) slot.outerHTML = this.searchFieldHTML();
    this._dndSelectedIndex = 0;
    this.refreshUIbackpack();
  };

  // =========================================================================
  // UIbackpackInputManager
  // =========================================================================

  const UIbackpackInputManager = {
    _scene:  null,
    _active: false,

    activate(scene)  { this._scene = scene; this._active = true; },
    deactivate()     { this._active = false; this._scene = null; },

    update() {
      if (!this._active || !this._scene) return;
      // The full screen model viewer owns the whole screen while it is open,
      // Escape included: the backpack takes no key until it is closed.
      if (window.ItemInspect && window.ItemInspect.isModelFullscreenOpen()) return;
      const scene = this._scene;

      // Search bar has focus, pass all keys to browser
      const searchInput = document.getElementById('backpack-search-input');
      if (searchInput && document.activeElement === searchInput) return;

      // WASD hold-repeat simulation (matches MZ arrow-key timing)
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (scene._wasdHeld && scene._wasdHeld[dir]) {
          scene._wasdHoldFrames[dir]++;
          const t = scene._wasdHoldFrames[dir];
          if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
            scene._wasdInput[dir] = true;
          }
        } else if (scene._wasdHoldFrames) {
          scene._wasdHoldFrames[dir] = 0;
        }
      }

      const isDown  = Input.isRepeated('down')  || (scene._wasdInput && scene._wasdInput.down);
      const isUp    = Input.isRepeated('up')    || (scene._wasdInput && scene._wasdInput.up);
      const isLeft  = Input.isRepeated('left')  || (scene._wasdInput && scene._wasdInput.left);
      const isRight = Input.isRepeated('right') || (scene._wasdInput && scene._wasdInput.right);

      // Consume WASD flags
      if (scene._wasdInput) {
        scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;
      }

      // L1 / R1, cycle tabs from anywhere (use isTriggered: no repeat)
      if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
        const tabs = scene.uiCategories();
        const dir  = Input.isTriggered('pageup') ? -1 : 1;
        const cur  = tabs.indexOf(scene._activeUICategory);
        const next = (cur + dir + tabs.length) % tabs.length;
        SoundManager.playCursor();
        scene._activeUICategory    = tabs[next];
        scene._activeCategoryIndex = next;
        scene._dndSelectedIndex    = 0;
        scene._dndActiveSection    = 'items';
        scene.refreshUIbackpack();
        return;
      }

      // Discard modal takes full input priority
      if (scene._discardModalOpen) {
        if (Input.isTriggered('left')) {
          scene.adjustDiscardQty(-1);
        } else if (Input.isTriggered('right')) {
          scene.adjustDiscardQty(1);
        } else if (Input.isTriggered('up') || Input.isTriggered('down')) {
          SoundManager.playCursor();
          scene._discardModalFocusIdx = 1 - scene._discardModalFocusIdx;
          scene.renderDiscardModal();
        } else if (Input.isTriggered('ok')) {
          if (scene._discardModalFocusIdx === 0) scene.confirmDiscard();
          else scene.cancelDiscard();
        } else if (Input.isTriggered('escape') || Input.isTriggered('cancel')) {
          scene.cancelDiscard();
        }
        return;
      }

      // 1-9 drops the inspected item straight into that quick slot, the same
      // assignment a click on the slot makes. Not while the target picker is
      // up: there the question on the page is who, not which slot.
      if (!scene._dndTargetingMode) {
        for (let n = 1; n <= 9; n++) {
          if (Input.isTriggered(String(n))) { this.handleSlotAssign(n - 1); return; }
        }
      }

      // Y (Input 'menu') throws the piece under the cursor away, which is the
      // one verb on the card a player reaches for again and again and the only
      // one that had no button of its own. It opens the same confirmation the
      // Discard button opens, so nothing is lost to a mis-press, and it is
      // refused for a piece that cannot be discarded rather than buzzing at a
      // list with nothing selected.
      if (Input.isTriggered('menu')) {
        const item = scene._dndSelectedItem;
        if (item && scene._dndActionsList && scene._dndActionsList.indexOf('discard') >= 0) {
          scene.triggerUIItemAction('discard');
        } else {
          SoundManager.playBuzzer();
        }
        return;
      }

      // Shift walks the sort strip: the same three tags the mouse clicks, in
      // order, and pressing it again on the tag already picked flips the
      // direction exactly as a second click does.
      if (Input.isTriggered('shift')) {
        const keys = ['name', 'weight', 'price'];
        const at = keys.indexOf(scene._dndSortKey);
        scene.toggleUISort(scene._dndSortDirection === 'asc' && at >= 0
          ? keys[at] : keys[(at + 1 + keys.length) % keys.length]);
        return;
      }

      // Tab opens the medicinal register of the piece on the right page,
      // which is the one control on the card that is not a row of the list.
      if (Input.isTriggered('tab')) {
        const info = document.querySelector('.inspect-medicine-info .army-dialog-btn');
        if (info) { info.click(); return; }
      }

      if      (isDown)  this.handleMove('down');
      else if (isUp)    this.handleMove('up');
      else if (isLeft)  this.handleMove('left');
      else if (isRight) this.handleMove('right');
      else if (Input.isTriggered('ok'))                                                      this.handleOk();
      else if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) this.handleCancel();
    },

    // Assign the inspected item to a quick slot by its number. Pressing the
    // number of the slot the item already sits in takes it back off the bar,
    // exactly as clicking that slot does (ItemSystemHotbar.js).
    handleSlotAssign(slot) {
      const scene = this._scene;
      const item  = scene._dndSelectedItem;
      if (!window.ItemHotbar || !window.ItemHotbar.isFavoritable(item)) {
        SoundManager.playBuzzer();
        return;
      }
      if (window.ItemHotbar.slotOf(item) === slot) window.ItemHotbar.clear(slot);
      else window.ItemHotbar.assign(slot, item);
      SoundManager.playOk();
      scene.refreshUIbackpack();
    },

    handleMove(dir) {
      const scene   = this._scene;
      const section = scene._dndActiveSection;

      if (section === 'categories') {
        const cats  = scene.uiCategories();
        const count = cats.length;
        if (dir === 'left') {
          SoundManager.playCursor();
          scene._activeCategoryIndex  = (scene._activeCategoryIndex - 1 + count) % count;
          scene._activeUICategory     = cats[scene._activeCategoryIndex];
          scene._dndSelectedIndex     = 0;
          scene.refreshUIbackpack();
        } else if (dir === 'right') {
          SoundManager.playCursor();
          scene._activeCategoryIndex  = (scene._activeCategoryIndex + 1) % count;
          scene._activeUICategory     = cats[scene._activeCategoryIndex];
          scene._dndSelectedIndex     = 0;
          scene.refreshUIbackpack();
        } else if (dir === 'down') {
          if (scene.getFilteredUIItems().length > 0) {
            SoundManager.playCursor();
            scene._dndActiveSection = 'items';
            scene._dndSelectedIndex = 0;
            scene.refreshUIbackpack();
          }
        }
        // up in categories: already at top, do nothing

      } else if (section === 'items') {
        // Read off .backpack-grid rather than restated: the handheld sheet
        // narrows that grid, and the cursor has to step by what is drawn.
        const COLS  = window.MenuVirtualList
          ? window.MenuVirtualList.columnsOf('#backpack-grid', 3) : 3;
        const items = scene.getFilteredUIItems();
        const total = items.length;
        const idx   = scene._dndSelectedIndex;

        if (dir === 'up') {
          if (idx - COLS >= 0) {
            SoundManager.playCursor();
            scene._dndSelectedIndex = idx - COLS;
            // The refresh scrolls the window onto the new slot itself.
            scene.refreshUIbackpack();
          } else {
            SoundManager.playCursor();
            scene._dndActiveSection = 'categories';
            scene.refreshUIbackpack();
          }
        } else if (dir === 'down') {
          if (idx + COLS < total) {
            SoundManager.playCursor();
            scene._dndSelectedIndex = idx + COLS;
            scene.refreshUIbackpack();
          }
          // bottom row: stay put
        } else if (dir === 'left') {
          if (idx % COLS !== 0) {
            // not at left column: move left within row
            SoundManager.playCursor();
            scene._dndSelectedIndex = idx - 1;
            scene.refreshUIbackpack();
          } else {
            // left column boundary: back to categories
            SoundManager.playCursor();
            scene._dndActiveSection = 'categories';
            scene.refreshUIbackpack();
          }
        } else if (dir === 'right') {
          if (idx % COLS !== COLS - 1 && idx + 1 < total) {
            // not at right column and next item exists: move right within row
            SoundManager.playCursor();
            scene._dndSelectedIndex = idx + 1;
            scene.refreshUIbackpack();
          } else if (scene._dndSelectedItem && scene._dndActionsList.length > 0) {
            // at right column or last item: open actions panel
            SoundManager.playCursor();
            scene._dndActiveSection    = 'actions';
            scene._selectedActionIndex = 0;
            scene.refreshUIbackpack();
          }
        }

      } else if (section === 'actions') {
        // The action buttons sit on a single row, so left/right walks them and
        // stepping off the left edge (or pressing up) returns to the pockets.
        const count = scene._dndActionsList.length;
        if (dir === 'right' && scene._selectedActionIndex < count - 1) {
          SoundManager.playCursor(); scene._selectedActionIndex++; scene.refreshUIbackpack();
        } else if (dir === 'left' && scene._selectedActionIndex > 0) {
          SoundManager.playCursor(); scene._selectedActionIndex--; scene.refreshUIbackpack();
        } else if (dir === 'left' || dir === 'up') {
          SoundManager.playCursor(); scene._dndActiveSection = 'items'; scene.refreshUIbackpack();
        }

      } else if (section === 'targets') {
        const item         = scene._dndTargetingItem;
        const partySize    = $gameParty.members().length;
        const studyPick    = !!scene._dndStudyPicking;
        const specCmds     = studyPick ? [] : scene.parseSpecialCommands(item);
        const hasAllParty  = !studyPick && (item.scope === 8 || item.scope === 10);
        const totalTargets = partySize + (hasAllParty ? 1 : 0) + specCmds.length;

        if (dir === 'up' && scene._selectedTargetIndex > 0) {
          SoundManager.playCursor(); scene._selectedTargetIndex--; scene.refreshUIbackpack();
        } else if (dir === 'down' && scene._selectedTargetIndex < totalTargets - 1) {
          SoundManager.playCursor(); scene._selectedTargetIndex++; scene.refreshUIbackpack();
        }
      }
    },

    handleOk() {
      const scene   = this._scene;
      const section = scene._dndActiveSection;

      if (section === 'categories') {
        SoundManager.playOk();
        scene._dndActiveSection = 'items'; scene._dndSelectedIndex = 0;
        scene.refreshUIbackpack();
      } else if (section === 'items') {
        if (scene._dndSelectedItem && scene._dndActionsList.length > 0) {
          SoundManager.playOk();
          scene._dndActiveSection    = 'actions';
          scene._selectedActionIndex = 0;
          scene.refreshUIbackpack();
        }
      } else if (section === 'actions') {
        const action = scene._dndActionsList[scene._selectedActionIndex];
        if (action) scene.triggerUIItemAction(action);
      } else if (section === 'targets') {
        const item          = scene._dndTargetingItem;
        const partySize     = $gameParty.members().length;
        if (scene._dndStudyPicking) {
          scene.applyUIStudy(scene._selectedTargetIndex);
          return;
        }
        const hasAllParty   = (item.scope === 8 || item.scope === 10);
        const specialStart  = partySize + (hasAllParty ? 1 : 0);
        if (scene._selectedTargetIndex < specialStart) {
          scene.applyUITarget(scene._selectedTargetIndex);
        } else {
          const specCmds = scene.parseSpecialCommands(item);
          const specIdx  = scene._selectedTargetIndex - specialStart;
          if (specIdx >= 0 && specIdx < specCmds.length) scene.triggerUISpecialAction(specCmds[specIdx]);
        }
      }
    },

    handleCancel() {
      const scene   = this._scene;
      const section = scene._dndActiveSection;

      if (scene._searchText) {
        SoundManager.playCancel(); scene.clearSearch(); return;
      }
      if (section === 'targets') {
        SoundManager.playCancel(); scene.cancelUITargeting();
      } else if (section === 'actions') {
        SoundManager.playCancel(); scene._dndActiveSection = 'items'; scene.refreshUIbackpack();
      } else {
        SoundManager.playCancel(); scene.popScene();
      }
    }
  };

})();
