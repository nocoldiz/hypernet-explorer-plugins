/*:
 * @target MZ
 * @plugindesc Who is in the party: the member tabs, adding, removing, randomizing, finishing, and the random party a battle test builds
 * @author Omni-Lex
 * @orderAfter CharacterCreation
 *
 * @help
 * Lifted out of CharacterCreation.js. One subject: the roster itself, as
 * opposed to the character being edited on it.
 *
 *   - the party panel and the member tabs down the side of the spread,
 *   - adding a member, removing one, and the confirmation either raises,
 *   - rolling a whole member at once,
 *   - finishing creation: the specs are committed and the party handed over,
 *   - the random party a Battle Test launched from the editor is given, built
 *     by the same rules a rolled member is, and the same roll exposed for any
 *     caller that wants a party from nothing (Sandbox Mode asks for one).
 *
 * Every scene method here was a method of Scene_CharacterCreation and still
 * is: the class body below is copied onto its prototype at load. The battle
 * test hooks below it were never methods and are unchanged.
 */

(() => {
  "use strict";

  const Scene_CharacterCreation = window.Scene_CharacterCreation;
  if (!Scene_CharacterCreation) return;

  const {
    ccT,
    ccTp,
    resolveTraitName,
    selectedTraitObjects,
    markFirstCreationComplete,
    STEP,
  } = window.CCKit;

  const { giveStartingMoney } = window.CCOrigins || {};
  const {
    equipRandomCompatibleWeapon,
    GLOBAL_STARTER_SKILLS,
  } = window.StartingEquipment || {};
  const {
    VAR_PLAYER1_GENDER,
    VAR_PLAYER2_GENDER,
    VAR_PLAYER3_GENDER,
    VAR_PLAYER1_REPRODUCTIVE_TYPE,
    VAR_PLAYER2_REPRODUCTIVE_TYPE,
    VAR_PLAYER3_REPRODUCTIVE_TYPE,
  } = window.CharacterCreationUtils || {};

  // Written as a class body so the methods move onto the wizard exactly as
  // they were declared while they still lived inside it, accessors and all.
  class CCRosterPages {
    onPartyMemberTabClick(memberIndex) {
      this._pageRailFocused = false;
      Scene_CharacterCreation._isPetMode = false;
      Scene_CharacterCreation._isVehicleMode = false;
      Scene_CharacterCreation._isScenarioMode = false;
      if (memberIndex >= $gameParty.size()) return;
      Scene_CharacterCreation._currentPartyMemberIndex = memberIndex;
      Scene_CharacterCreation.syncCreatureModeToCurrentMember();
      // Switching members always lands on the Bio tab, the first thing a
      // player is asked about whoever they just selected.
      this._step = STEP.BIO;
      if (this._presetWindow) {
        this.onPresetCancel();
      }
      this.setupStep();
      SoundManager.playCursor();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // The board's own confirmation sheet. window.confirm() paints an OS dialog
    // in the host browser's chrome, in the host's own colours and typeface, over
    // a screen that is otherwise entirely ours; this asks the same question on
    // the same parchment. Answers through the callback, never blocking.
    _ccConfirm(opts, onAccept) {
      const container = this._dndContainer || document.getElementById("character-creation-container");
      if (!container) { onAccept(); return; }

      const existing = container.querySelector(".cc-modal-veil");
      if (existing) existing.remove();

      const veil = document.createElement("div");
      veil.className = "cc-modal-veil";
      veil.innerHTML = `
        <div class="cc-modal" role="dialog" aria-modal="true">
          <h3 class="cc-modal-title">${opts.title || ""}</h3>
          <p class="cc-modal-body">${opts.body || ""}</p>
          <div class="cc-modal-actions">
            <button class="cc-sidebar-btn cc-modal-cancel">${opts.cancelLabel || T('CharCreate.cancel')}</button>
            <button class="cc-sidebar-btn cc-modal-accept">${opts.acceptLabel || T('CharCreate.confirm')}</button>
          </div>
        </div>
      `;

      const close = () => {
        document.removeEventListener("keydown", onKey, true);
        veil.remove();
      };
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); SoundManager.playCancel(); close(); }
        else if (e.key === "Enter") { e.stopPropagation(); close(); onAccept(); }
      };
      veil.addEventListener("click", (e) => { if (e.target === veil) { SoundManager.playCancel(); close(); } });
      veil.querySelector(".cc-modal-cancel").addEventListener("click", () => { SoundManager.playCancel(); close(); });
      veil.querySelector(".cc-modal-accept").addEventListener("click", () => { close(); onAccept(); });
      document.addEventListener("keydown", onKey, true);

      container.appendChild(veil);
      veil.querySelector(".cc-modal-accept").focus();
    }

    onRemovePartyMember(idx, event) {
      if (event) event.stopPropagation();
      if (idx === 0) return;

      const partyMembers = $gameParty.members();
      if (idx >= partyMembers.length) return;
      const targetActor = partyMembers[idx];
      // Em and Bubba are the story mode's party: neither can be dropped from it
      // (PartyRoster.isStoryLocked).
      if (targetActor && window.PartyRoster?.isStoryLocked?.(targetActor.actorId())) {
        SoundManager.playBuzzer();
        return;
      }
      const name = targetActor ? targetActor.name() : ccT('CharCreate.unnamed', 'Unnamed');

      this._ccConfirm({
        title: ccT('CharCreate.removeMemberTitle', 'Remove from party'),
        body: ccTp('CharCreate.removeMemberBody', { name }, name + ' will be removed from the party.'),
        acceptLabel: ccT('CharCreate.deleteMember', 'Remove Member')
      }, () => this._removePartyMemberConfirmed(idx));
    }

    _removePartyMemberConfirmed(idx) {
      const partyMembers = $gameParty.members();
      if (idx <= 0 || idx >= partyMembers.length) return;
      const targetActor = partyMembers[idx];
      const actorId = targetActor.actorId();
      if (window.PartyRoster?.isStoryLocked?.(actorId)) return;
      // The actor object outlives the party seat: actor ids 1-3 are recycled by
      // onAddPartyMember, so a dossier left flagged on the discarded actor came
      // back with the next recruit and froze it on the Preset type. The lock is
      // dropped here, which also returns the dossier to the world's pool.
      if (this._clearPresetLock) this._clearPresetLock(targetActor);
      $gameParty.removeActor(actorId);
      $gameSwitches.setValue(77 + idx, false);

      if (Scene_CharacterCreation._currentPartyMemberIndex >= $gameParty.size()) {
        Scene_CharacterCreation._currentPartyMemberIndex = Math.max(0, $gameParty.size() - 1);
      }
      Scene_CharacterCreation.syncCreatureModeToCurrentMember();

      SoundManager.playCancel();
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onAddPartyMember() {
      Scene_CharacterCreation._railFocus = null;
      if ($gameParty.size() >= 3) return;
      // One character and one companion is the whole story mode party.
      if (Scene_CharacterCreation._storyMode) { SoundManager.playBuzzer(); return; }

      const existingIds = $gameParty.members().map((a) => a.actorId());
      let newActorId = 1;
      for (let id = 1; id <= 3; id++) {
        if (!existingIds.includes(id)) {
          newActorId = id;
          break;
        }
      }

      $gameParty.addActor(newActorId);
      const actor = $gameActors.actor(newActorId);
      // A recycled actor id must not carry the previous occupant's dossier lock.
      if (this._clearPresetLock) this._clearPresetLock(actor);
      const newIdx = $gameParty.members().indexOf(actor);

      // Randomize in humanoid mode with 2D sprite so it's fully ready and editable
      this._randomizeMemberCharacter(newIdx, { forceHumanoid: true, force2D: true });

      Scene_CharacterCreation._currentPartyMemberIndex = newIdx;
      Scene_CharacterCreation._isCreatureMode = false;
      Scene_CharacterCreation._isScenarioMode = false;
      Scene_CharacterCreation._isPetMode = false;
      Scene_CharacterCreation._isVehicleMode = false;
      // A new recruit opens on Bio, the page that names it and gives it a face,
      // rather than on whatever page the member before it was left on.
      this._step = STEP.BIO;
      if (this._titleWindow) this.setupStep();

      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    onQuickRandomizeMember() {
      if (this._refusePresetEdit()) return;
      const memberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      this._randomizeMemberCharacter(memberIndex);
      Scene_CharacterCreation._lastMemberWasRandom = true;
      this._lastStep = -1;
      this._lastIndex = -1;
      this.refreshUIOverlayDOM();
    }

    // The board keeps its allocation as card ranks (0 to 4) on the member, in
    // its own scratch field, because the class and the traits underneath it can
    // still change while the wizard is open. Embarking is where it becomes the
    // member's actual training: level = rank + 1, and never below the head start
    // the class and the traits already grant, which specializationLevel() takes
    // care of on its own.
    _commitSpecPoints() {
      const members = ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [];
      members.forEach((actor) => {
        if (!actor || !actor._specTrained || !actor.setSpecializationTrainedLevel) return;
        const ctx = this._specGrantContext(actor);
        const catalog = this._specsCatalog();
        Object.keys(actor._specTrained).forEach((key) => {
          const spec = catalog.find((sp) => String(sp.id) === String(key));
          const rank = Math.max(actor._specTrained[key] || 0, this._specGrantRankIn(ctx, spec));
          if (rank > 0) actor.setSpecializationTrainedLevel(Number(key), rank + 1);
        });
      });
    }

    onFinishPartyCreation() {
      if (Scene_CharacterCreation.isSimpleMode()) {
        const partyMembers = $gameParty ? $gameParty.members() : [];
        partyMembers.forEach((actor) => {
          if (typeof this._ensureSimpleModeStatsAndTraits === "function") {
            this._ensureSimpleModeStatsAndTraits(actor);
          }
        });
      }
      this._commitSpecPoints();
      const p1 = $gameActors.actor(1);
      if (!p1 || !p1.name() || p1.name() === "Unnamed") {
        if (p1) p1.setName(Scene_CharacterCreation.generateRandomMarkovName(0));
      }
      if (!p1 || !p1._classId) {
        if (p1) p1.changeClass(1, false);
      }
      if (p1 && (!p1.characterName() || !p1.vnBust())) {
        if (Scene_CharacterCreation && Scene_CharacterCreation.assignRandomSpriteAndBust) {
          Scene_CharacterCreation.assignRandomSpriteAndBust(p1);
        } else if (window.selectRandomSpriteForActor) {
          window.selectRandomSpriteForActor(1);
        }
      }
      if (!$gameSystem._ccOriginSymbol) {
        $gameSystem._ccOriginSymbol = "origin_train";
      }

      if ($gameSystem._partyPet && window.PetSystem && window.PetSystem.recruitPet) {
        const traits = this._petTraits();
        window.PetSystem.recruitPet({
          id: $gameSystem._partyPet.id,
          name: $gameSystem._partyPet.name || "Companion",
          characterName: $gameSystem._partyPet.sprite,
          characterIndex: $gameSystem._partyPet.spriteIndex || 0,
          isFollower: traits.sentient, // sentient = free to leave = a follower, not a dependent pet
          enemyName: $gameSystem._partyPet.species,
          level: 1,
          archetype: $gameSystem._partyPet.kind,
          note: $gameSystem._partyPet.desc,
          sentient: traits.sentient,
          magical: traits.magical,
          geneticFreak: traits.geneticFreak,
        });
      }

      // The garage chosen on the Vehicles tab, handed over before the origin
      // deals its own loadout so no origin hands out a second set of keys.
      if (window.CCStartVehicles && window.CCStartVehicles.apply) {
        window.CCStartVehicles.apply(!!Scene_CharacterCreation._storyMode);
      }

      markFirstCreationComplete();
      if (this._dndContainer) {
        window.CCPanel.hide(this._dndContainer);
      }
      // A party holding a dossier lands where the dossier says, not where a
      // scenario would have put it: the scenario board was never shown.
      if (this._walkPresetLanding()) {
        this.popScene();
        return;
      }
      this._finishOriginChoice($gameSystem._ccOriginSymbol);
    }


    _wizardPartyPanelHtml() {
      const actor = Scene_CharacterCreation.getCurrentActor();
      if (!actor) return this._partyPanelHtml || "";

      const currentMemberIndex = Scene_CharacterCreation._currentPartyMemberIndex || 0;
      const partyMembers = $gameParty.members();

      // Gather cheap per-member display data and build a change signature.
      const rows = [];
      const sigParts = [ConfigManager.language, this._step, currentMemberIndex];
      for (let i = 0; i < 3; i++) {
        const isEditing = (i === currentMemberIndex);
        const mActor = $gameActors.actor(i + 1);
        const mInParty = partyMembers.some((a) => a.actorId() === (i + 1));

        // Player 1 (i === 0) shows as vacant while still on the pre-customization
        // steps (step < 3) when currently creating Player 1.
        const isSlotVacant =
          (!mInParty && !isEditing) ||
          (i === 0 && currentMemberIndex === 0 && this._step < 3);

        if (isSlotVacant) {
          rows.push({ vacant: true, i });
          sigParts.push(i + ":V");
          continue;
        }

        const mClassId = mActor._classId;
        const mGenderVal = $gameVariables.value(38 + i);
        const name = mActor.name() || "";
        const traitNames = selectedTraitObjects(mActor)
          .map((tr) => resolveTraitName(tr.name, tr.id))
          .filter(Boolean);
        const equipNames = (mActor.equips() || []).filter((e) => e).map((e) => window.CCDbName(e));

        rows.push({ vacant: false, i, isEditing, mActor, mClassId, mGenderVal, name, traitNames, equipNames });
        sigParts.push(
          i + ":" + mClassId + ":" + mGenderVal + ":" + name +
          ":" + traitNames.join("|") + ":" + equipNames.join("|")
        );
      }

      // Everything the party starts with, so the loadout is visible before the
      // wizard is confirmed: the shared bag plus each member's equipped gear.
      const invEntries = this._startingInventoryEntries();
      sigParts.push("inv:" + invEntries.map((e) => e.name + "x" + e.qty + (e.note || "")).join("|"));

      const sig = sigParts.join("~");
      if (this._partyPanelSig === sig && this._partyPanelHtml != null) {
        return this._partyPanelHtml;
      }
      this._partyPanelSig = sig;

      // Minimal HTML escape for procedurally generated backstory text.
      const escLore = (s) => String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      let cardsHtml = "";
      for (const r of rows) {
        if (r.vacant) {
          const slotName = r.i === 0 ? "I" : (r.i === 1 ? "II" : "III");
          cardsHtml += `
            <div class="cc-party-card vacant">
              <div class="cc-party-card-badge">${T('CharCreate.slotVacant', { slot: slotName })}</div>
              <div class="cc-party-card-vacant-text">${T('CharCreate.pendingSense')}</div>
            </div>
          `;
          continue;
        }

        const { i, isEditing, mActor, mClassId, mGenderVal, name, traitNames, equipNames } = r;
        const mClassName = $dataClasses[mClassId] ? window.CCDbName($dataClasses[mClassId]) : T('CharCreate.none');

        const mHp = mActor.mhp;
        const mMp = mActor.mmp;
        const mStr = mActor.param(2);
        const mCon = mActor.param(3);
        const mMat = mActor.param(4);
        const mMdf = mActor.param(5);
        const mAgi = mActor.param(6);
        const mLuk = mActor.param(7);

        let mGenderLabel = T('CharCreate.none2');
        if (mGenderVal === 0) mGenderLabel = T('CharCreate.male');
        else if (mGenderVal === 1) mGenderLabel = T('CharCreate.female');
        else if (mGenderVal === 2) mGenderLabel = T('CharCreate.nonBinary2');
        else if (mGenderVal === 3) mGenderLabel = T('CharCreate.cocoon');

        const badgeText = isEditing ? T('CharCreate.registering') : T('CharCreate.finalized');
        const nameText = name || T('CharCreate.unnamedAlly');

        // NPC-system lore: generate the society profile + historical backstory
        // now so the narrative can sit behind the card and be browsed in the wiki.
        const lore = this._ensureActorLore(mActor, mGenderVal);
        const narrative = lore && lore.backstory
          ? (window.NPCHistSim?.narrativeOf?.(lore.backstory) ?? lore.backstory.narrative ?? "")
          : "";

        const traitsHtml = traitNames.length
          ? `<div class="cc-party-card-detail"><span class="cc-detail-label">${T('CharCreate.traits2')}:</span> <span class="cc-detail-text">${traitNames.join(", ")}</span></div>`
          : "";
        const equipHtml = equipNames.length
          ? `<div class="cc-party-card-detail"><span class="cc-detail-label">${T('CharCreate.gear')}:</span> <span class="cc-detail-text">${equipNames.join(", ")}</span></div>`
          : "";
        const loreHtml = narrative
          ? `<div class="cc-party-card-lore">${escLore(narrative)}</div>`
          : "";

        cardsHtml += `
          <div class="cc-party-card ${isEditing ? 'active' : ''}">
            <div class="cc-party-card-badge">${badgeText}</div>
            <div class="cc-party-card-header">
              <div class="cc-party-card-name">${nameText}</div>
              <div class="cc-party-card-class">${mClassName} (${mGenderLabel})</div>
            </div>
            <div class="cc-party-card-body">
              <div class="cc-party-card-stats-grid">
                <div class="cc-party-card-stat"><span class="label">${T('CharCreate.abbrev.hp')}</span><span class="value">${mHp}</span></div>
                <div class="cc-party-card-stat"><span class="label">${T('CharCreate.abbrev.mp')}</span><span class="value">${mMp}</span></div>
                <div class="cc-party-card-stat"><span class="label">${T('CharCreate.abbrev.str')}</span><span class="value">${mStr}</span></div>
                <div class="cc-party-card-stat"><span class="label">${T('CharCreate.abbrev.con')}</span><span class="value">${mCon}</span></div>
                <div class="cc-party-card-stat"><span class="label">${T('CharCreate.abbrev.dex')}</span><span class="value">${mAgi}</span></div>
                <div class="cc-party-card-stat"><span class="label">${T('CharCreate.abbrev.int')}</span><span class="value">${mMat}</span></div>
                <div class="cc-party-card-stat"><span class="label">${T('CharCreate.abbrev.wis')}</span><span class="value">${mMdf}</span></div>
                <div class="cc-party-card-stat"><span class="label">${T('CharCreate.abbrev.psi')}</span><span class="value">${mLuk}</span></div>
              </div>
              ${traitsHtml}
              ${equipHtml}
              ${loreHtml}
            </div>
          </div>
        `;
      }

      cardsHtml += this._startingInventoryHtml(invEntries);

      this._partyPanelHtml = `
        <div class="cc-page cc-page-left">
          <h2 class="cc-header-gothic">${T('CharCreate.yourParty')}</h2>
          <div class="cc-party-cards-container">
            ${cardsHtml}
          </div>
        </div>
      `;
      return this._partyPanelHtml;
    }

    // Every item the party owns right now: the shared bag with its counts,
    // followed by whatever each member is already wearing (equipped gear never
    // shows up in the bag, so it has to be collected per actor).
  }

  for (const key of Object.getOwnPropertyNames(CCRosterPages.prototype)) {
    if (key === "constructor") continue;
    Object.defineProperty(
      Scene_CharacterCreation.prototype, key,
      Object.getOwnPropertyDescriptor(CCRosterPages.prototype, key)
    );
  }

  // ==========================================================================
  // Battle Test: auto-build a random, balanced party
  //
  // Whenever a Battle Test is launched from the editor and the first character
  // has no weapon equipped, the entire test party is randomized:
  //   - Random sentient classes
  //   - Random NPC sprites, markov names, and busts
  //   - Random genders & reproduction types
  //   - Random traits
  //   - Balanced, level-appropriate weapons and armor per equip slot
  //   - Starter & class skills synced to "Best" in Categorized Battle Skills
  //
  // If the first character is level 1, the test troop is also reinforced with
  // 2 or 3 random enemies around the same level.
  // ==========================================================================

  // Median enemy level from <Level: N> notes in the current troop, or null.
  function getTroopMedianEnemyLevel() {
    if (typeof $gameTroop === "undefined" || !$gameTroop) return null;
    const levels = [];
    for (const member of $gameTroop.members()) {
      const enemy = member && member.enemy ? member.enemy() : null;
      if (!enemy || !enemy.note) continue;
      const m = enemy.note.match(/<Level:\s*(\d+)>/i);
      if (m) {
        const lvl = parseInt(m[1], 10);
        if (lvl > 0) levels.push(lvl);
      }
    }
    if (levels.length === 0) return null;
    levels.sort((a, b) => a - b);
    const mid = Math.floor(levels.length / 2);
    return levels.length % 2 === 0
      ? Math.round((levels[mid - 1] + levels[mid]) / 2)
      : levels[mid];
  }

  // True when the first battler in the battle test configuration is level 1.
  function isFirstBattlerLevel1() {
    const b0 = $dataSystem && $dataSystem.testBattlers && $dataSystem.testBattlers[0];
    return !!(b0 && b0.level === 1);
  }

  // True when the battle test entry at `index` was left with nothing fitted in
  // the editor. Whatever the tester actually set - a weapon, a shield, a piece
  // of armour - counts as a configured member and is left exactly as it is.
  function isTestBattlerUnequipped(index) {
    const b = $dataSystem && Array.isArray($dataSystem.testBattlers)
      ? $dataSystem.testBattlers[index]
      : null;
    if (!b) return false;
    if (!Array.isArray(b.equips) || b.equips.length === 0) return true;
    return !b.equips.some((id) => id > 0);
  }

  // True when any battle test member was left unequipped: those members get
  // rolled, the configured ones do not. The leader's name has nothing to do
  // with it any more.
  function shouldRandomizeBattleTestParty() {
    if (!$dataSystem || !Array.isArray($dataSystem.testBattlers)) return false;
    for (let i = 0; i < $dataSystem.testBattlers.length; i++) {
      if (isTestBattlerUnequipped(i)) return true;
    }
    return false;
  }

  // <Level: N> off an item/enemy note, or null.
  function itemNoteLevel(dataEntry) {
    if (!dataEntry || !dataEntry.note) return null;
    const m = dataEntry.note.match(/<Level:\s*(\d+)>/i);
    return m ? parseInt(m[1], 10) : null;
  }

  const enemyNoteLevel = itemNoteLevel;

  function isBossEnemyData(enemyData) {
    return !!(enemyData && enemyData.note && /<Boss>/i.test(enemyData.note));
  }

  // A flanking enemy for the test troop: never a boss or a database divider
  // row, biased toward whatever level is closest to the center enemy's own
  // (widening the search band until something qualifies).
  function pickFlankingEnemyId(centerLevel) {
    const pool = [];
    for (let id = 1; id < $dataEnemies.length; id++) {
      const e = $dataEnemies[id];
      if (!e || !e.name || e.name.trim().startsWith("<--")) continue;
      if (isBossEnemyData(e)) continue;
      pool.push(e);
    }
    if (pool.length === 0) return null;
    if (centerLevel == null) return pool[Math.floor(Math.random() * pool.length)].id;
    let candidates = [];
    for (let band = 2; candidates.length === 0 && band <= 20; band += 2) {
      candidates = pool.filter((e) => {
        const lvl = enemyNoteLevel(e);
        return lvl != null && Math.abs(lvl - centerLevel) <= band;
      });
    }
    if (candidates.length === 0) candidates = pool;
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }

  // Same even-spread-across-the-screen layout the map battle system's own
  // troop reinforcement uses (BattleSystemEnhancedEncounters.js's
  // joinerPosition), so a reinforced test troop looks like any other multi
  // enemy fight instead of enemies stacked on one spot.
  function reinforcementPosition(slot, totalMembers) {
    const w = (typeof Graphics !== "undefined" && Graphics.boxWidth) || 816;
    const h = (typeof Graphics !== "undefined" && Graphics.boxHeight) || 624;
    const cy = h * 0.5;
    const usable = w * 0.8;
    const pitch = totalMembers > 1 ? usable / (totalMembers - 1) : 0;
    const startX = (w - usable) / 2;
    const x = totalMembers > 1 ? startX + slot * pitch : w / 2;
    const y = cy + (slot % 2 === 0 ? -28 : 28);
    return {
      x: Math.max(64, Math.min(w - 64, Math.round(x))),
      y: Math.max(120, Math.min(h - 80, Math.round(y))),
    };
  }

  // Battle Test: turn the editor's single test-troop enemy into a small group.
  //
  // Runs before the vanilla setup (which reads $dataTroops[testTroopId] to
  // build $gameTroop), so the extra members go through the exact same troop
  // setup pipeline as the original one - no bypassed per-enemy plugin hooks.
  // The original enemy stays the "center" of the group (the middle slot when
  // there are 3); the rest are drawn from other <Level: N> enemies close to
  // its own level. An enemy tagged <Boss> is left fighting alone, same as it
  // would be encountered for real.
  function reinforceTestTroopMembers() {
    const troopId = $dataSystem.testTroopId;
    const troop = $dataTroops[troopId];
    // Only a troop set up as a single enemy is a "test this one monster" case;
    // a tester who already built a multi-enemy test troop by hand is left alone.
    if (!troop || !Array.isArray(troop.members) || troop.members.length !== 1) return;
    if (troop._testReinforced) return;

    const center = troop.members[0];
    const centerData = $dataEnemies[center.enemyId];
    if (!centerData || isBossEnemyData(centerData)) return;

    const totalCount = Math.random() < 0.5 ? 2 : 3;
    const centerLevel = enemyNoteLevel(centerData);
    const centerSlot = totalCount === 3 ? 1 : 0;

    const members = [];
    for (let slot = 0; slot < totalCount; slot++) {
      const pos = reinforcementPosition(slot, totalCount);
      const enemyId =
        slot === centerSlot ? center.enemyId : pickFlankingEnemyId(centerLevel) || center.enemyId;
      members.push({ enemyId, x: pos.x, y: pos.y, hidden: false });
    }

    troop.members = members;
    troop._testReinforced = true;
  }

  // Generate a name using a sprite's own Markov voice (its NPCs.json markovDB),
  // falling back to generic NPC name pools. Returns null if generation is
  // unavailable.
  function generateNpcMarkovName(markovDB, seedSalt) {
    if (!window.generateSeededMarkovName) return null;
    const seed = (Date.now() + seedSalt * 7919) >>> 0;
    const wx = seed & 0xffff;
    const wy = (seed >>> 16) & 0xffff;
    const tryDB = (db) => {
      if (!db) return null;
      try {
        const n = window.generateSeededMarkovName(wx, wy, seedSalt + 1, db, 2, 4, 12);
        return n && n !== "Unknown" && n !== "NPC" ? n : null;   // i18n-ignore: generator sentinels
      } catch (e) {
        return null;
      }
    };
    const name = tryDB(markovDB) || tryDB("npc") || tryDB("names");
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
  }

  // Pick a random NPCs.json sprite (npc:true) and apply its character image,
  // name and bust to the actor. Returns the chosen NPCs.json entry (for its
  // Gender), or null if the sprite database is unavailable.
  function applyRandomNpcSpriteAndName(actor, memberIndex) {
    const npcData = window.WorldGen && window.WorldGen.NPCs;
    if (!npcData) return null;
    // A rolled face is a face nobody chose, so beta sheets stay out of it unless
    // the world was created with them enabled. Browsing the sprite grid still
    // shows them all.
    // Aliens are never in the ordinary pool: the catalogue deals one on its own
    // share of the same draw, so a rolled character can turn out not to be from
    // here, exactly as rarely as a rolled citizen can.
    let charName = window.SpriteCatalog
      ? window.SpriteCatalog.pickNpcKey(Math.random())
      : null;
    if (!charName) {
      const keys = Object.keys(npcData).filter((k) => npcData[k] && npcData[k].npc === true && npcData[k].vip !== true);
      if (keys.length === 0) return null;
      charName = keys[Math.floor(Math.random() * keys.length)];
    }
    const entry = npcData[charName];
    // "$" sheets are single-character (index 0 only); standard sheets hold 8.
    const maxIndex = charName.includes("$") ? 0 : 7;
    const charIndex = Math.floor(Math.random() * (maxIndex + 1));

    actor.setCharacterImage(charName, charIndex);

    // Bust: use the sprite's own bust mapping, stored on the actor itself (the
    // old per-player bust variables were retired). These characters are always
    // portrayed by that bust, never by a sculpted 3D model.
    const bust = (entry.busts && (entry.busts[charIndex] ?? entry.busts[0])) || null;
    if (bust) {
      actor.setVnBust(bust);
      if (actor.setPortraitMode) actor.setPortraitMode("bust");
    }

    const name = generateNpcMarkovName(entry.markovDB, memberIndex);
    if (name) actor.setName(name);

    return entry;
  }

  // Rough "power" score for an armor, used to bias starting gear toward weak
  // pieces. Sum of positive param bonuses (weighted heavily) plus shop price.
  function armorPowerScore(a) {
    const params = Array.isArray(a.params)
      ? a.params.reduce((s, v) => s + Math.max(0, v), 0)
      : 0;
    return params * 10 + (a.price || 0);
  }

  // Pick a random "low stat" armor from a candidate list: rank by power and
  // draw from the weakest tier (bottom third, 1-5 pieces) so new characters
  // start deliberately under-geared rather than rolling a legendary.
  function pickLowStatArmor(candidates) {
    if (!candidates || candidates.length === 0) return null;
    const scored = candidates
      .map((a) => ({ a, score: armorPowerScore(a) }))
      .sort((p, q) => p.score - q.score);
    const tierSize = Math.max(1, Math.min(5, Math.ceil(scored.length / 3)));
    const tier = scored.slice(0, tierSize);
    return tier[Math.floor(Math.random() * tier.length)].a;
  }

  // Fill every EMPTY equip slot for an actor with a random low-stat compatible
  // piece: the weapon slot draws from the class's curated low-tier weapon pool,
  // every armor slot draws a weak compatible armor. Slots that already hold an
  // item (preset gear, or the weapon picked during class selection) are left
  // untouched, so this both completes custom characters and fills the gaps in
  // preset characters. Safe to call repeatedly.
  function equipLowStatGearForActor(actor) {
    if (!actor) return;
    const slots = actor.equipSlots(); // etypeId per slot
    const equips = actor.equips();    // current item per slot (null if empty)
    for (let slotId = 0; slotId < slots.length; slotId++) {
      if (equips[slotId]) continue; // already equipped - keep it
      const etypeId = slots[slotId];

      if (etypeId === 1) {
        // Weapon slot: draw from the class's curated low-tier weapon pool.
        const SE = window.StartingEquipment;
        if (!(SE && SE.getCompatibleWeaponTypes && SE.getCompatibleWeapons)) continue;
        const pool = SE.getCompatibleWeapons(
          SE.getCompatibleWeaponTypes(actor._classId)
        ).filter((w) => actor.canEquip(w));
        if (pool.length === 0) continue;
        const weapon = pool[Math.floor(Math.random() * pool.length)];
        $gameParty.gainItem(weapon, 1);
        try {
          actor.changeEquip(slotId, weapon);
        } catch (e) {
          /* incompatible roll - leave the slot empty */
        }
        continue;
      }

      const candidates = $dataArmors.filter(
        (a) =>
          a &&
          a.name &&
          !a.name.trim().startsWith("<--") &&
          a.etypeId === etypeId &&
          actor.canEquip(a)
      );
      const armor = pickLowStatArmor(candidates);
      if (!armor) continue;
      $gameParty.gainItem(armor, 1);
      try {
        actor.changeEquip(slotId, armor);
      } catch (e) {
        /* incompatible roll - leave the slot empty */
      }
    }
  }

  // Fill empty equip slots for every current party member (end-of-creation).
  // Every finish path goes through markFirstCreationComplete, which lives in
  // the orchestrator and loads BEFORE this file, so it cannot hold a reference
  // to this: it reaches for it here when the moment comes.
  function fillPartyStartingEquipment() {
    if (!$gameParty) return;
    $gameParty.members().forEach((actor) => equipLowStatGearForActor(actor));
  }
  window.CharacterCreationParty = window.CharacterCreationParty || {};
  window.CharacterCreationParty.fillPartyStartingEquipment = fillPartyStartingEquipment;

  // Pick a balanced weapon matching the actor's class and target level.
  function pickBalancedWeapon(actor, targetLevel, classId) {
    const SE = window.StartingEquipment;
    const compTypes =
      SE && SE.getCompatibleWeaponTypes ? SE.getCompatibleWeaponTypes(classId) : [];

    let pool = [];
    for (let id = 1; id < $dataWeapons.length; id++) {
      const w = $dataWeapons[id];
      if (!w || !w.name || w.name.trim().startsWith("<--")) continue;
      if (actor && !actor.canEquip(w)) continue;
      if (compTypes.length > 0 && !compTypes.includes(w.wtypeId)) continue;
      pool.push(w);
    }
    if (pool.length === 0) {
      for (let id = 1; id < $dataWeapons.length; id++) {
        const w = $dataWeapons[id];
        if (!w || !w.name || w.name.trim().startsWith("<--")) continue;
        if (actor && actor.canEquip(w)) pool.push(w);
      }
    }
    if (pool.length === 0) return null;

    for (let band = 3; band <= 40; band += 4) {
      const candidates = pool.filter((w) => {
        const lvl = itemNoteLevel(w);
        return lvl != null && Math.abs(lvl - targetLevel) <= band;
      });
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Pick a balanced armor matching the target slot etypeId and target level.
  function pickBalancedArmor(actor, targetLevel, etypeId) {
    const pool = [];
    for (let id = 1; id < $dataArmors.length; id++) {
      const a = $dataArmors[id];
      if (!a || !a.name || a.name.trim().startsWith("<--")) continue;
      if (a.etypeId !== etypeId) continue;
      if (actor && !actor.canEquip(a)) continue;
      pool.push(a);
    }
    if (pool.length === 0) return null;

    for (let band = 3; band <= 40; band += 4) {
      const candidates = pool.filter((a) => {
        const lvl = itemNoteLevel(a);
        return lvl != null && Math.abs(lvl - targetLevel) <= band;
      });
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Equip balanced, level-appropriate weapons and armor across all equip slots.
  function equipBalancedGearForActor(actor, targetLevel, classId) {
    if (!actor) return;
    if (typeof actor.initEquips === "function") {
      actor.initEquips([]);
    }
    const slots = actor.equipSlots();
    for (let slotId = 0; slotId < slots.length; slotId++) {
      const etypeId = slots[slotId];
      if (etypeId === 1) {
        const weapon = pickBalancedWeapon(actor, targetLevel, classId);
        if (weapon) {
          $gameParty.gainItem(weapon, 1);
          try {
            actor.changeEquip(slotId, weapon);
          } catch (e) {
            /* incompatible roll */
          }
        }
      } else {
        const armor = pickBalancedArmor(actor, targetLevel, etypeId);
        if (armor) {
          $gameParty.gainItem(armor, 1);
          try {
            actor.changeEquip(slotId, armor);
          } catch (e) {
            /* incompatible roll */
          }
        }
      }
    }
  }

  // Randomize one actor: class, gender/reproduction, level, equipment, traits, and sync skills to Best.
  function randomizeBattleTestActor(actor, memberIndex, level) {
    if (!actor) return;

    // Sprite + name (and bust) from a random NPCs.json npc:true entry.
    const npcEntry = applyRandomNpcSpriteAndName(actor, memberIndex);

    // Random class out of the sentient roster (1-62); the creature classes are
    // never dealt to a person.
    let classId = actor._classId;
    const validClasses =
      window.CreatureClasses && window.CreatureClasses.sentientRoster
        ? window.CreatureClasses.sentientRoster()
        : [];
    if (validClasses.length > 0) {
      classId = validClasses[Math.floor(Math.random() * validClasses.length)];
      actor.changeClass(classId, false);
    }

    // Level (set after the class change so exp matches the new class).
    const targetLevel = Math.max(1, Math.min(99, level));
    actor.changeLevel(targetLevel, false);

    // Gender + matching reproduction type. Prefer the chosen sprite's gender so
    // identity matches the sprite the player sees, otherwise roll randomly.
    const genderVars = [VAR_PLAYER1_GENDER, VAR_PLAYER2_GENDER, VAR_PLAYER3_GENDER];
    const reproVars = [
      VAR_PLAYER1_REPRODUCTIVE_TYPE,
      VAR_PLAYER2_REPRODUCTIVE_TYPE,
      VAR_PLAYER3_REPRODUCTIVE_TYPE,
    ];
    const genderVar = genderVars[memberIndex];
    const reproVar = reproVars[memberIndex];
    const gender =
      npcEntry && npcEntry.Gender != null ? npcEntry.Gender : Math.floor(Math.random() * 4);
    if (genderVar) $gameVariables.setValue(genderVar, gender);
    if (reproVar) {
      const repro =
        gender === 0 ? 0 : gender === 1 ? 1 : gender === 3 ? 4 : Math.floor(Math.random() * 5);
      $gameVariables.setValue(reproVar, repro);
    }

    // Random traits (param bonuses, skills, bonus gear into inventory).
    if (window.randomizeTraitsForActor) {
      window.randomizeTraitsForActor(actor.actorId());
    }

    // Equipment: balanced, level-appropriate weapon(s) and armor across all
    // slots, rolled around a level of its own so two runs at the same level do
    // not kit the party out identically.
    const gearLevel = Math.max(1, Math.min(99, targetLevel + Math.floor(Math.random() * 5) - 2));
    equipBalancedGearForActor(actor, gearLevel, classId);

    // Baseline starter skills + class learnings up to target level.
    if (Array.isArray(GLOBAL_STARTER_SKILLS)) {
      GLOBAL_STARTER_SKILLS.forEach((id) => {
        if ($dataSkills[id]) actor.learnSkill(id);
      });
    }
    const curClass = actor.currentClass();
    if (curClass && Array.isArray(curClass.learnings)) {
      for (const learning of curClass.learnings) {
        if (learning && learning.level <= targetLevel && $dataSkills[learning.skillId]) {
          actor.learnSkill(learning.skillId);
        }
      }
    }

    // Sync carried skills through CategorizedBattleSkills. The assorted row is
    // a weighted draw over everything the class has learned up to this level,
    // so a test party carries a different spread every run instead of the same
    // opening spells the "best" row always settles on.
    const BL = window.BattleLoadout;
    if (BL) {
      if (typeof BL.assorted === "function") BL.assorted(actor);
      else if (typeof BL.best === "function") BL.best(actor);
    }

    actor.recoverAll();
  }

  function setupRandomBattleTestParty() {
    const enemyMedian = getTroopMedianEnemyLevel() || 10;

    // The party is built AROUND the troop, not under it: the levels are spread
    // symmetrically about the enemy median so the party's own median lands on
    // it, which is the fight the tester meant to look at.
    const members = $gameParty.members();
    const count = members.length;
    const offsets = [];
    for (let i = 0; i < count; i++) {
      const d = i - (count - 1) / 2; // fractional for an even party
      offsets.push(Math.sign(d) * Math.round(Math.abs(d)));
    }

    for (let i = 0; i < count; i++) {
      const actor = members[i];
      if (!actor) continue;
      // A member the tester equipped by hand is the fight they meant to look
      // at: it keeps its actor, its gear and its level untouched.
      if (!isTestBattlerUnequipped(i)) continue;
      const b = $dataSystem.testBattlers && $dataSystem.testBattlers[i];
      let level = b && b.level > 1 ? b.level : enemyMedian + offsets[i];
      level = Math.max(1, Math.min(99, level));
      randomizeBattleTestActor(actor, i, level);
    }

    if ($gamePlayer) $gamePlayer.refresh(); // reflect the new leader sprite

    console.log(
      `[BattleTest] Built random party with ${members.length} members (enemy median lvl ${enemyMedian}).`
    );
  }

  const _DataManager_setupBattleTest = DataManager.setupBattleTest;
  DataManager.setupBattleTest = function () {
    try {
      if (isFirstBattlerLevel1()) reinforceTestTroopMembers();
    } catch (e) {
      console.error("[BattleTest] Failed to reinforce test troop:", e);
    }
    _DataManager_setupBattleTest.call(this);
    try {
      if (shouldRandomizeBattleTestParty()) {
        setupRandomBattleTestParty();
      } else {
        console.log(
          "[BattleTest] Every member has equipment set - leaving the party as configured."
        );
      }
    } catch (e) {
      console.error("[BattleTest] Failed to build random party:", e);
    }
  };

  // Rebuild the current party as `memberCount` (max 3) fully random members,
  // all at the same level, through the character creator's own randomization
  // rules: an NPC sprite/name drawn only from npc:true entries in NPCs.json,
  // a random sentient class, random traits (which grant their own items and
  // equipment), a class-compatible weapon plus random armor per slot, and the
  // baseline starter skills - the same recipe randomizeBattleTestActor uses to
  // build a Battle Test roster, generalized to any level/size and exposed for
  // callers outside this file (e.g. Sandbox Mode's "Party" name override).
  // Finishes with the same starting purse a normal creation run hands out.
  window.CharacterCreationParty = window.CharacterCreationParty || {};
  window.CharacterCreationParty.randomizeFullParty = function (level, memberCount) {
    const count = Math.max(1, Math.min(3, memberCount || 3));
    const lvl = Math.max(1, Math.min(99, level || 1));

    for (const id of $gameParty._actors.slice()) {
      $gameParty.removeActor(id);
    }
    for (let i = 0; i < count; i++) {
      const actorId = i + 1;
      $gameParty.addActor(actorId);
      randomizeBattleTestActor($gameActors.actor(actorId), i, lvl);
    }

    if ($gamePlayer) $gamePlayer.refresh();
    giveStartingMoney();
  };
})();
