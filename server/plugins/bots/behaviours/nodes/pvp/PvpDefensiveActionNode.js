"use strict";

const { Skill } = require("../../../../../src/main/typescript/elvarg/game/model/Skill");
const { Location } = require("../../../../../src/main/typescript/elvarg/game/model/Location");
const { TeleportHandler } = require("../../../../../src/main/typescript/elvarg/game/model/teleportation/TeleportHandler");
const { TeleportType } = require("../../../../../src/main/typescript/elvarg/game/model/teleportation/TeleportType");
const { TimerKey } = require("../../../../../src/main/typescript/elvarg/util/timers/TimerKey");
const { Wilderness } = require("../../../../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { queueRouteAndFlagAppearance, clearMovementRequest } = require("../../navigation/BotNavigation");
const { applyGeneratedPvpLoadout } = require("../../policies/PvpLoadoutPolicy");

const RETREAT_STEP_TILES = 12;
const WILDERNESS_DITCH_NORTH_Y = 3525;

class PvpDefensiveActionNode {
  constructor(options = {}) {
    this.setPhase = options.setPhase;
    this.stopPvp = options.stopPvp;
    this.api = options.api;
    this.getProfile = options.getProfile;
    this.pvpPhase = options.pvpPhase;
  }

  tick(context) {
    const { player, state, nowMs, target } = context ?? {};
    const pvp = state?.pvp;
    if (!player || !state || !pvp) {
      return { handled: true, status: "failure" };
    }

    const currentHp = Number(player.getHitpoints?.() ?? 0);
    if (currentHp <= 0 || player.isDyingReturn()) {
      return { handled: true, status: "failure" };
    }
    const maxHp = Number(
      player.getSkillManager?.()?.getMaxLevel?.(Skill.HITPOINTS) ?? currentHp
    );
    const escapeThreshold = Number(
      state?.pvp?.escapeThreshold ?? this.getProfile?.(state)?.retreatHpRatio ?? 0.24
    );
    if (
      !pvp.retreat && maxHp > 0 && currentHp / maxHp <= escapeThreshold
    ) {
      pvp.retreat = { autoRetaliate: player.autoRetaliateReturn(), teleportStarted: false };
      player.setAutoRetaliate(false);
      clearMovementRequest(player);
      player.getMovementQueue().reset();
    }

    if (pvp.retreat) {
      return this.retreat(player, state, nowMs, target);
    }

    if (player.getForceMovement?.() != null) {
      this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
      return { handled: true, status: "running" };
    }

    return { handled: false, status: "running" };
  }

  retreat(player, state, nowMs, target) {
    const pvp = state.pvp;
    const retreat = pvp.retreat;
    const running = { handled: true, status: "running" };
    this.setPhase(state, "retreating");
    if (player.isTeleportingReturn() || player.getForceMovement() != null) return running;

    const combat = player.getCombat();
    if (combat.getTarget()) combat.reset();
    player.setCombatFollowing(null);
    player.setFollowing(null);
    const home = new Location(state.home.x, state.home.y, state.home.z ?? 0);
    const atHome = player.getLocation().equals(home);
    if (retreat.teleportStarted) {
      // Discard combat links from the old location only after arriving.
      if (atHome) combat.setUnderAttack(null);
      retreat.teleportStarted = false;
    }
    if (atHome && !combat.getAttacker()) {
      // Walking home while teleblocked must finish the same recovery as teleporting.
      clearMovementRequest(player);
      if (!applyGeneratedPvpLoadout(player, state, { api: this.api })) return running;
      state.virtualFoodChargesRemaining = null;
      player.setAutoRetaliate(retreat.autoRetaliate);
      pvp.retreat = null;
      this.stopPvp(player, state, nowMs, "retreated_home");
      return { handled: true, status: "success" };
    }

    const location = player.getLocation();
    const level = Wilderness.isIn(player) ? Wilderness.levelForY(location.getY()) : 0;
    const advanced = ["veteran", "elite"].includes(this.getProfile(state).id);
    const teleblocked = !combat.getTeleblockTimer().finished();
    if (level <= 20 && !teleblocked && (advanced || !combat.getAttacker()) &&
        TeleportHandler.checkReqs(player, home, 20)) {
      clearMovementRequest(player);
      TeleportHandler.teleport(player, home, TeleportType.NORMAL, false);
      retreat.teleportStarted = true;
      return running;
    }

    if (player.getTimers().has(TimerKey.FREEZE) ||
        player.getMovementQueue().isMovementBlocked()) {
      clearMovementRequest(player);
      player.getMovementQueue().reset();
      return running;
    }
    player.setRunning(player.getRunEnergy() > 0);
    if (!combat.getAttacker()) {
      queueRouteAndFlagAppearance(player, home.getX(), home.getY(), {
        state, reason: "pvp_retreat_return",
      });
      return running;
    }
    // Head south in the Wilderness; elsewhere run away from the pursuer.
    const attackerLocation = (combat.getAttacker() ?? target)?.getLocation();
    const dx = attackerLocation ? Math.sign(location.getX() - attackerLocation.getX()) : 1;
    const dy = attackerLocation ? Math.sign(location.getY() - attackerLocation.getY()) : 0;
    let targetX = location.getX() + (level > 0 ? 0 : (dx || (dy ? 0 : 1)) * RETREAT_STEP_TILES);
    let targetY = location.getY() + (level > 0 ? -RETREAT_STEP_TILES : dy * RETREAT_STEP_TILES);
    if (level > 0 && location.getY() < 6400 && targetY < WILDERNESS_DITCH_NORTH_Y) {
      // Flee along the ditch instead of leaving the Wilderness.
      targetX = location.getX() + (dx || 1) * RETREAT_STEP_TILES;
      targetY = WILDERNESS_DITCH_NORTH_Y;
    }
    queueRouteAndFlagAppearance(player, targetX, targetY, { state, reason: "pvp_retreat" });
    return running;
  }
}

module.exports = {
  PvpDefensiveActionNode,
};
