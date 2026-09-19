"use strict";

const { CombatType } = require("../../../../src/main/typescript/elvarg/game/content/combat/CombatType");
const { Equipment } = require("../../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { WeaponInterfaces } = require("../../../../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces");
const { ItemIdentifiers } = require("../../../../src/main/typescript/elvarg/util/ItemIdentifiers");

const STAFF_INTERFACES = new Set([
  WeaponInterfaces.STAFF,
  WeaponInterfaces.ANCIENT_STAFF,
]);
const RANGED_INTERFACES = new Set([
  WeaponInterfaces.SHORTBOW,
  WeaponInterfaces.LONGBOW,
  WeaponInterfaces.DARK_BOW,
  WeaponInterfaces.CROSSBOW,
  WeaponInterfaces.KARILS_CROSSBOW,
  WeaponInterfaces.KNIFE,
  WeaponInterfaces.OBBY_RINGS,
  WeaponInterfaces.THROWNAXE,
  WeaponInterfaces.DART,
  WeaponInterfaces.JAVELIN,
  WeaponInterfaces.BLOWPIPE,
]);
const BOW_INTERFACES = new Set([
  WeaponInterfaces.SHORTBOW,
  WeaponInterfaces.LONGBOW,
  WeaponInterfaces.DARK_BOW,
]);
const CROSSBOW_INTERFACES = new Set([
  WeaponInterfaces.CROSSBOW,
  WeaponInterfaces.KARILS_CROSSBOW,
]);
const ARROW_IDS = new Set([
  ItemIdentifiers.ADAMANT_ARROW,
  ItemIdentifiers.BROAD_ARROWS_2,
  ItemIdentifiers.DRAGON_ARROW,
  ItemIdentifiers.RUNE_ARROW,
]);
const BOLT_IDS = new Set([
  ItemIdentifiers.DRAGONSTONE_BOLTS_E_,
  ItemIdentifiers.BOLT_RACK,
]);
const SPEC_WEAPON_IDS = new Set([
  ItemIdentifiers.ARMADYL_GODSWORD,
  ItemIdentifiers.ANCIENT_GODSWORD,
  ItemIdentifiers.BANDOS_GODSWORD,
  ItemIdentifiers.DARK_BOW,
  ItemIdentifiers.DRAGON_CLAWS,
  ItemIdentifiers.DRAGON_DAGGER_P_PLUS_PLUS_,
  ItemIdentifiers.HEAVY_BALLISTA,
  ItemIdentifiers.GRANITE_MAUL,
  ItemIdentifiers.MAGIC_SHORTBOW,
  ItemIdentifiers.MAGIC_SHORTBOW_I_,
  ItemIdentifiers.MAGIC_SHORTBOW_3,
  ItemIdentifiers.SARADOMIN_GODSWORD,
  ItemIdentifiers.VOLATILE_NIGHTMARE_STAFF,
  ItemIdentifiers.ZAMORAK_GODSWORD,
]);
const SUPPORTED_SPEC_WEAPONS = Object.freeze([
  ItemIdentifiers.ARMADYL_GODSWORD,
  ItemIdentifiers.ANCIENT_GODSWORD,
  ItemIdentifiers.BANDOS_GODSWORD,
  ItemIdentifiers.DARK_BOW,
  ItemIdentifiers.DRAGON_CLAWS,
  ItemIdentifiers.DRAGON_DAGGER_P_PLUS_PLUS_,
  ItemIdentifiers.HEAVY_BALLISTA,
  ItemIdentifiers.GRANITE_MAUL,
  ItemIdentifiers.MAGIC_SHORTBOW,
  ItemIdentifiers.MAGIC_SHORTBOW_I_,
  ItemIdentifiers.MAGIC_SHORTBOW_3,
  ItemIdentifiers.SARADOMIN_GODSWORD,
  ItemIdentifiers.VOLATILE_NIGHTMARE_STAFF,
  ItemIdentifiers.ZAMORAK_GODSWORD,
]);

function getWeaponId(player) {
  return player?.getEquipment?.()?.get?.(Equipment.WEAPON_SLOT)?.getId?.() ?? -1;
}

function getAmmoId(player) {
  return player?.getEquipment?.()?.get?.(Equipment.AMMUNITION_SLOT)?.getId?.() ?? -1;
}

function resolveInventorySlotByItemId(player, itemId, snapshot = null, preferredSlot = -1) {
  if (!player || !Number.isInteger(itemId) || itemId <= 0) {
    return -1;
  }
  const inventoryItems = player?.getInventory?.()?.getItems?.() ?? [];
  const validatedPreferredSlot = Number.isInteger(preferredSlot) ? preferredSlot : -1;
  if (validatedPreferredSlot >= 0) {
    const item = inventoryItems[validatedPreferredSlot];
    if (item?.getId?.() === itemId) {
      return validatedPreferredSlot;
    }
  }
  const snapshotSlot = snapshot?.slotByItemId?.get?.(itemId);
  if (Number.isInteger(snapshotSlot) && snapshotSlot >= 0) {
    const item = inventoryItems[snapshotSlot];
    if (item?.getId?.() === itemId) {
      return snapshotSlot;
    }
  }
  return player?.getInventory?.()?.getSlotForItemId?.(itemId) ?? -1;
}

function isStaffInterface(weaponInterface) {
  return STAFF_INTERFACES.has(weaponInterface);
}

function isRangedInterface(weaponInterface) {
  return RANGED_INTERFACES.has(weaponInterface);
}

function classifyWeaponInterface(weaponInterface) {
  if (!weaponInterface) {
    return null;
  }
  if (isStaffInterface(weaponInterface)) {
    return CombatType.MAGIC;
  }
  if (isRangedInterface(weaponInterface)) {
    return CombatType.RANGED;
  }
  if (weaponInterface === WeaponInterfaces.UNARMED) {
    return null;
  }
  return CombatType.MELEE;
}

function resolveCurrentCombatType(player, weaponInterface, currentWeaponId) {
  const combat = player?.getCombat?.();
  if (
    combat?.getCastSpell?.() != null ||
    (combat?.getAutocastSpell?.() != null &&
      (isStaffInterface(weaponInterface) || player?.getEquipment?.()?.hasStaffEquipped?.() === true))
  ) {
    return CombatType.MAGIC;
  }
  if (SPEC_WEAPON_IDS.has(currentWeaponId) && player?.isSpecialActivated?.() === true) {
    const specialCombatMethod = player?.getCombatSpecial?.()?.getCombatMethod?.();
    const specialType = specialCombatMethod?.type?.();
    if (Number.isInteger(specialType)) {
      return specialType;
    }
  }
  return classifyWeaponInterface(weaponInterface);
}

function cloneAmmoCandidate(ammo) {
  if (!ammo) {
    return null;
  }
  return {
    ammoId: ammo.ammoId,
    slot: ammo.slot,
  };
}

function buildCombatSnapshot(player, state, nowMs) {
  const pvp = state?.pvp;
  const inventoryItems = player?.getInventory?.()?.getItems?.() ?? [];
  const currentWeaponInterface = player?.getWeapon?.() ?? null;
  const currentWeaponId = getWeaponId(player);
  const currentAmmoId = getAmmoId(player);
  const currentCombatType = resolveCurrentCombatType(
    player,
    currentWeaponInterface,
    currentWeaponId
  );
  const generatedPrimaryWeaponId = Number(pvp?.generatedPrimaryWeaponId ?? -1);
  const generatedSpecWeaponId = Number(pvp?.generatedSpecWeaponId ?? -1);
  const slotByItemId = new Map();
  const styleCandidatesByType = new Map();
  let firstArrow = null;
  let firstBolt = null;
  let preferredSpecCandidate = null;
  let fallbackSpecCandidate = null;

  for (let slot = 0; slot < inventoryItems.length; slot++) {
    const item = inventoryItems[slot];
    const itemId = item?.getId?.() ?? -1;
    if (itemId <= 0) {
      continue;
    }

    if (!slotByItemId.has(itemId)) {
      slotByItemId.set(itemId, slot);
    }

    if (!firstArrow && ARROW_IDS.has(itemId)) {
      firstArrow = { ammoId: itemId, slot };
    } else if (!firstBolt && BOLT_IDS.has(itemId)) {
      firstBolt = { ammoId: itemId, slot };
    }

    if (!preferredSpecCandidate && itemId === generatedSpecWeaponId) {
      preferredSpecCandidate = { weaponId: itemId, slot };
    } else if (!fallbackSpecCandidate && SUPPORTED_SPEC_WEAPONS.includes(itemId)) {
      fallbackSpecCandidate = { weaponId: itemId, slot };
    }

    if (
      itemId === generatedSpecWeaponId ||
      (SPEC_WEAPON_IDS.has(itemId) && itemId !== generatedPrimaryWeaponId)
    ) {
      continue;
    }

    const weaponInterface = item?.getDefinition?.()?.getWeaponInterface?.();
    const combatType = classifyWeaponInterface(weaponInterface);
    if (combatType == null) {
      continue;
    }

    let ammo = null;
    if (BOW_INTERFACES.has(weaponInterface)) {
      ammo =
        currentAmmoId > 0 && ARROW_IDS.has(currentAmmoId)
          ? { ammoId: currentAmmoId, slot: -1 }
          : cloneAmmoCandidate(firstArrow);
    } else if (CROSSBOW_INTERFACES.has(weaponInterface)) {
      ammo =
        currentAmmoId > 0 && BOLT_IDS.has(currentAmmoId)
          ? { ammoId: currentAmmoId, slot: -1 }
          : cloneAmmoCandidate(firstBolt);
    }

    const candidate = {
      combatType,
      weaponId: itemId,
      slot,
      weaponInterface,
      ammo,
      current: itemId === generatedPrimaryWeaponId,
    };
    const existing = styleCandidatesByType.get(combatType);
    if (!existing || (!existing.current && candidate.current)) {
      styleCandidatesByType.set(combatType, candidate);
    }
  }

  if (currentWeaponId > 0 && currentCombatType != null) {
    let currentAmmo = null;
    if (BOW_INTERFACES.has(currentWeaponInterface)) {
      currentAmmo =
        currentAmmoId > 0 && ARROW_IDS.has(currentAmmoId)
          ? { ammoId: currentAmmoId, slot: -1 }
          : cloneAmmoCandidate(firstArrow);
    } else if (CROSSBOW_INTERFACES.has(currentWeaponInterface)) {
      currentAmmo =
        currentAmmoId > 0 && BOLT_IDS.has(currentAmmoId)
          ? { ammoId: currentAmmoId, slot: -1 }
          : cloneAmmoCandidate(firstBolt);
    }
    styleCandidatesByType.set(currentCombatType, {
      combatType: currentCombatType,
      weaponId: currentWeaponId,
      slot: -1,
      weaponInterface: currentWeaponInterface,
      ammo: currentAmmo,
      current: true,
    });
  }

  return {
    nowMs,
    currentWeaponId,
    currentAmmoId,
    currentWeaponInterface,
    currentCombatType,
    slotByItemId,
    styleCandidatesByType,
    preferredSpecCandidate,
    fallbackSpecCandidate,
  };
}

function getPvpCombatSnapshot(player, state, nowMs) {
  const pvp = state?.pvp;
  if (!player || !pvp) {
    return null;
  }
  const cached = pvp.runtimeCombatSnapshot ?? null;
  const currentWeaponId = getWeaponId(player);
  const currentAmmoId = getAmmoId(player);
  const currentWeaponInterface = player?.getWeapon?.() ?? null;
  const combat = player?.getCombat?.();
  const castSpellId = combat?.getCastSpell?.()?.spellId ?? null;
  const autocastSpellId = combat?.getAutocastSpell?.()?.spellId ?? null;
  const specialActive = player?.isSpecialActivated?.() === true;
  if (
    cached &&
    cached.currentWeaponId === currentWeaponId &&
    cached.currentAmmoId === currentAmmoId &&
    cached.currentWeaponInterface === currentWeaponInterface &&
    cached.castSpellId === castSpellId &&
    cached.autocastSpellId === autocastSpellId &&
    cached.specialActive === specialActive &&
    cached.generatedPrimaryWeaponId === Number(pvp?.generatedPrimaryWeaponId ?? -1) &&
    cached.generatedPrimaryAmmoId === Number(pvp?.generatedPrimaryAmmoId ?? -1) &&
    cached.generatedSpecWeaponId === Number(pvp?.generatedSpecWeaponId ?? -1) &&
    cached.generatedSpecAmmoId === Number(pvp?.generatedSpecAmmoId ?? -1)
  ) {
    cached.nowMs = nowMs;
    return cached.snapshot;
  }
  const snapshot = buildCombatSnapshot(player, state, nowMs);
  pvp.runtimeCombatSnapshot = {
    nowMs,
    currentWeaponId,
    currentAmmoId,
    currentWeaponInterface,
    castSpellId,
    autocastSpellId,
    specialActive,
    generatedPrimaryWeaponId: Number(pvp?.generatedPrimaryWeaponId ?? -1),
    generatedPrimaryAmmoId: Number(pvp?.generatedPrimaryAmmoId ?? -1),
    generatedSpecWeaponId: Number(pvp?.generatedSpecWeaponId ?? -1),
    generatedSpecAmmoId: Number(pvp?.generatedSpecAmmoId ?? -1),
    snapshot,
  };
  return snapshot;
}

function invalidatePvpCombatSnapshot(state) {
  if (state?.pvp) {
    state.pvp.runtimeCombatSnapshot = null;
  }
}

module.exports = {
  ARROW_IDS,
  BOLT_IDS,
  BOW_INTERFACES,
  CROSSBOW_INTERFACES,
  SPEC_WEAPON_IDS,
  SUPPORTED_SPEC_WEAPONS,
  classifyWeaponInterface,
  getAmmoId,
  getPvpCombatSnapshot,
  getWeaponId,
  invalidatePvpCombatSnapshot,
  resolveInventorySlotByItemId,
  isRangedInterface,
  isStaffInterface,
  resolveCurrentCombatType,
};
