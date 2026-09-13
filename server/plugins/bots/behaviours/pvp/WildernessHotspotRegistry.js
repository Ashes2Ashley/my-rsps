"use strict";

const { Location } = require("../../../../src/main/typescript/elvarg/game/model/Location");

function freezeArea(area) {
  return Object.freeze({
    minX: area.minX,
    maxX: area.maxX,
    minY: area.minY,
    maxY: area.maxY,
    z: area.z ?? 0,
  });
}

function freezeHotspot(hotspot) {
  return Object.freeze({
    ...hotspot,
    area: freezeArea(hotspot.area),
    anchor: Object.freeze({ ...(hotspot.anchor ?? {}) }),
    roamRadius: Number.isFinite(hotspot.roamRadius)
      ? Math.max(1, Math.floor(hotspot.roamRadius))
      : 3,
    lingerMs: Number.isFinite(hotspot.lingerMs)
      ? Math.max(0, Math.floor(hotspot.lingerMs))
      : 10000,
    maxSimultaneousFights: Number.isFinite(hotspot.maxSimultaneousFights)
      ? Math.max(1, Math.floor(hotspot.maxSimultaneousFights))
      : null,
    allowedProfiles: Object.freeze([...(hotspot.allowedProfiles ?? [])]),
    allowedLoadouts: Object.freeze([...(hotspot.allowedLoadouts ?? [])]),
    styleWeights: Object.freeze({ ...(hotspot.styleWeights ?? {}) }),
    activityWeights: Object.freeze({ ...(hotspot.activityWeights ?? {}) }),
  });
}

const WILDERNESS_HOTSPOTS = Object.freeze({
  edge_ditch: freezeHotspot({
    id: "edge_ditch",
    label: "Edge Ditch",
    dangerTier: "medium",
    enabled: true,
    targetBots: 13,
    maxBots: 18,
    roamRadius: 6,
    lingerMs: 9000,
    maxSimultaneousFights: 5,
    area: { minX: 3078, maxX: 3091, minY: 3525, maxY: 3535, z: 0 },
    anchor: { x: 3085, y: 3528, z: 0 },
    allowedProfiles: ["standard", "veteran", "elite"],
    allowedLoadouts: [
      "edge_main_melee",
      "edge_ranged_melee",
      "low_level_pure",
      "rune_pure_members",
      "edge_venge_zerker",
      "edge_med_level",
      "edge_void_risk",
      "void_pure",
      "edge_void_melee",
      "edge_barrows_venge",
      "mid_tank",
      "edge_unorthodox_risk",
      "rusher",
      "budget_pk",
    ],
    styleWeights: { melee: 0.45, range: 0.25, hybrid: 0.3 },
    activityWeights: { seek: 0.62, bait: 0.25, fight: 0.05, escape: 0.08 },
  }),
  edge_south: freezeHotspot({
    id: "edge_south",
    label: "Edge North East",
    dangerTier: "medium",
    enabled: true,
    targetBots: 9,
    maxBots: 14,
    roamRadius: 7,
    lingerMs: 11000,
    maxSimultaneousFights: 4,
    area: { minX: 3092, maxX: 3106, minY: 3525, maxY: 3536, z: 0 },
    anchor: { x: 3099, y: 3529, z: 0 },
    allowedProfiles: ["novice", "standard", "veteran", "elite"],
    allowedLoadouts: [
      "edge_main_melee",
      "edge_ranged_melee",
      "low_level_pure",
      "rune_pure_members",
      "edge_venge_zerker",
      "edge_med_level",
      "edge_void_risk",
      "void_pure",
      "edge_void_melee",
      "edge_barrows_venge",
      "mid_tank",
      "edge_unorthodox_risk",
      "rusher",
      "budget_pk",
      "anti_pk_hybrid",
    ],
    styleWeights: { melee: 0.3, range: 0.33, hybrid: 0.37 },
    activityWeights: { seek: 0.44, bait: 0.18, fight: 0.2, escape: 0.18 },
  }),
  varrock_ditch: freezeHotspot({
    id: "varrock_ditch",
    label: "Varrock Ditch (F2P)",
    dangerTier: "low",
    enabled: true,
    targetBots: 80,
    maxBots: 112,
    roamRadius: 3,
    lingerMs: 10000,
    maxSimultaneousFights: 8,
    area: { minX: 3228, maxX: 3262, minY: 3525, maxY: 3542, z: 0 },
    anchor: { x: 3243, y: 3526, z: 0 },
    allowedProfiles: ["novice", "standard", "veteran", "elite"],
    allowedLoadouts: [
      "f2p_strength_pure",
      "f2p_rune_pure",
      "f2p_range_ko",
      "f2p_bind_pure",
      "f2p_addy_pure",
      "f2p_mage_pure",
      "f2p_bind_ko",
    ],
    styleWeights: { melee: 0.48, range: 0.3, hybrid: 0.22 },
    activityWeights: { seek: 0.5, bait: 0.16, fight: 0.22, escape: 0.12 },
  }),
  revs_entrance: freezeHotspot({
    id: "revs_entrance",
    label: "Revs Entrance",
    dangerTier: "high",
    enabled: true,
    targetBots: 6,
    maxBots: 12,
    roamRadius: 4,
    lingerMs: 9500,
    area: { minX: 3129, maxX: 3139, minY: 3833, maxY: 3843, z: 0 },
    anchor: { x: 3134, y: 3838, z: 0 },
    allowedProfiles: ["standard", "veteran", "elite"],
    allowedLoadouts: [
      "deep_wild_hybrid",
      "deep_wild_nh",
      "low_level_nh",
      "deep_wild_budget_nh",
      "deep_wild_staff_spec",
      "edge_unorthodox_risk",
      "anti_pk_hybrid",
      "edge_ranged_melee",
      "edge_med_level",
    ],
    styleWeights: { melee: 0.12, range: 0.28, hybrid: 0.6 },
    activityWeights: { seek: 0.46, bait: 0.14, fight: 0.1, escape: 0.3 },
  }),
  green_drags_gate: freezeHotspot({
    id: "green_drags_gate",
    label: "Green Drags Gate",
    dangerTier: "medium",
    enabled: true,
    targetBots: 6,
    maxBots: 12,
    roamRadius: 8,
    lingerMs: 9500,
    area: { minX: 2974, maxX: 3002, minY: 3598, maxY: 3622, z: 0 },
    anchor: { x: 2988, y: 3610, z: 0 },
    allowedProfiles: ["novice", "standard", "veteran"],
    allowedLoadouts: [
      "budget_pk",
      "anti_pk_hybrid",
      "low_level_nh",
      "edge_main_melee",
      "low_level_pure",
      "edge_venge_zerker",
      "edge_med_level",
      "edge_void_melee",
      "mid_tank",
      "edge_barrows_venge",
      "edge_unorthodox_risk",
      "deep_wild_budget_nh",
      "deep_wild_staff_spec",
    ],
    styleWeights: { melee: 0.44, range: 0.18, hybrid: 0.38 },
    activityWeights: { seek: 0.54, bait: 0.16, fight: 0.08, escape: 0.22 },
  }),
});

const WILDERNESS_HOTSPOT_IDS = Object.freeze(Object.keys(WILDERNESS_HOTSPOTS));

function getWildernessHotspot(hotspotId) {
  return WILDERNESS_HOTSPOTS[hotspotId] ?? null;
}

function listWildernessHotspots() {
  return WILDERNESS_HOTSPOT_IDS.map((hotspotId) => WILDERNESS_HOTSPOTS[hotspotId]);
}

function getEnabledWildernessHotspots() {
  return listWildernessHotspots().filter((hotspot) => hotspot.enabled === true);
}

function hotspotContainsLocation(hotspot, location) {
  if (!hotspot?.area || !location) {
    return false;
  }
  const x = location.getX?.() ?? location.x;
  const y = location.getY?.() ?? location.y;
  const z = location.getZ?.() ?? location.z;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return false;
  }
  return (
    z === hotspot.area.z &&
    x >= hotspot.area.minX &&
    x <= hotspot.area.maxX &&
    y >= hotspot.area.minY &&
    y <= hotspot.area.maxY
  );
}

function createHotspotAnchorLocation(hotspot) {
  if (!hotspot?.anchor) {
    return null;
  }
  return new Location(hotspot.anchor.x, hotspot.anchor.y, hotspot.anchor.z ?? 0);
}

function isOutsideWildernessHotspots(location) {
  return !getEnabledWildernessHotspots().some((hotspot) => hotspotContainsLocation(hotspot, location));
}

module.exports = {
  WILDERNESS_HOTSPOT_IDS,
  WILDERNESS_HOTSPOTS,
  createHotspotAnchorLocation,
  getEnabledWildernessHotspots,
  getWildernessHotspot,
  hotspotContainsLocation,
  isOutsideWildernessHotspots,
  listWildernessHotspots,
};
