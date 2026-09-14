const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { CombatFactory } = require("../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { Boundary } = require("../../src/main/typescript/elvarg/game/model/Boundary");
const { RegionManager } = require("../../src/main/typescript/elvarg/game/collision/RegionManager");
const { World } = require("../../src/main/typescript/elvarg/game/World");
const { DuelRule, DuelState } = require("../../src/main/typescript/elvarg/game/content/Duelling");
const { WORLD_ZONE_BOUNDARIES } = require("../../src/main/typescript/elvarg/game/definition/WorldDefinition");
const { PlayerStatus } = require("../../src/main/typescript/elvarg/game/model/PlayerStatus");
const { Equipment } = require("../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");

// Cache 237: 755/756 and scripts 6164, 6169, 6177. Rule bits are varp 286.
const ARENA = new Boundary(3326, 3383, 3197, 3295, 0);
const EXIT = new Location(3366, 3266, 0);
const OPTIONS = 755;
const OPTIONS_STATUS = 83;
const CONFIRM = 756;
const DUEL_OPTION = 4; // OPPLAYER1/2/3 are Attack/Trade/Follow.
const FORFEIT_OPTION = 6;
const uid = (group, child) => (group << 16) | child;
const RULE_BUTTONS = new Map([
  [30, DuelRule.NO_RANGED], [31, DuelRule.NO_MELEE], [32, DuelRule.NO_MAGIC],
  [33, DuelRule.NO_SPECIAL_ATTACKS], [34, DuelRule.FUN_WEAPONS], [35, DuelRule.NO_FORFEIT],
  [36, DuelRule.NO_PRAYER], [37, DuelRule.NO_POTIONS], [38, DuelRule.NO_FOOD],
  [39, DuelRule.NO_MOVEMENT], [40, DuelRule.LOCK_WEAPON], [41, DuelRule.SHOW_INVENTORIES],
  [48, DuelRule.NO_HELM], [49, DuelRule.NO_CAPE], [50, DuelRule.NO_AMULET],
  [51, DuelRule.NO_WEAPON], [52, DuelRule.NO_BODY], [53, DuelRule.NO_SHIELD],
  [54, DuelRule.NO_LEGS], [55, DuelRule.NO_GLOVES], [56, DuelRule.NO_BOOTS],
  [57, DuelRule.NO_RING], [58, DuelRule.NO_AMMUNITION],
]);
const EQUIPMENT_RULES = [...RULE_BUTTONS.values()].filter(rule => rule.getEquipmentSlot() >= 0);
const sessions = new Map();
const requests = new WeakMap();
const requestDelay = new WeakMap();
const menuState = new WeakMap();
const presets = new WeakMap();
const lastRules = new WeakMap();
const pendingSafeDeaths = new WeakSet();
const OPPONENT_INVENTORY = 2000; // Server-supplied snapshot used only by the duel confirmation.
let pluginApi;

function inZone(player) {
  return WORLD_ZONE_BOUNDARIES.duel.some(boundary => boundary.inside(player.getLocation()));
}
function nearby(a, b) {
  return a.getLocation().getZ() === b.getLocation().getZ()
    && a.getPrivateArea() === b.getPrivateArea()
    && a.getLocation().getDistance(b.getLocation()) <= 16;
}
function hasRule(player, rule) {
  return player.getDueling().getRules()[rule.getButtonId()] === true;
}
function acceptBots(session, eventName) {
  for (const player of session.players) {
    if (!player.isPlayerBot() || session.accepted.has(player)) continue;
    const event = { player, session, accept: false };
    pluginApi.emitCustomEvent(eventName, event);
    if (event.accept) accept(player, session);
  }
}
function setRules(session, mask, notifyBots = true) {
  session.mask = mask;
  session.accepted.clear();
  for (const player of session.players) {
    const state = player.getDueling();
    for (let bit = 0; bit < 28; bit++) state.getRules()[bit] = (mask & (1 << bit)) !== 0;
    state.setState(DuelState.DUEL_SCREEN);
    player.getPacketSender().sendConfig(286, mask).sendConfig(3465, 0)
      .sendString("", uid(OPTIONS, OPTIONS_STATUS));
  }
  if (notifyBots) acceptBots(session, "duelarena:rules-changed");
}
function updateMenu({ player }) {
  const active = player.getDueling().inDuel();
  const mode = active ? "fight" : inZone(player) && !sessions.has(player) ? "offer" : "none";
  if (menuState.get(player) === mode) return;
  menuState.set(player, mode);
  player.getPacketSender().sendPlayerOption(DUEL_OPTION, mode === "offer" ? "Challenge" : "")
    .sendPlayerOption(1, active ? "Attack" : "", true)
    .sendPlayerOption(FORFEIT_OPTION, active && !hasRule(player, DuelRule.NO_FORFEIT) ? "Forfeit" : "");
}
function resetCombat(player) {
  const combat = player.getCombat();
  combat.reset();
  combat.getHitQueue().clear();
  combat.setUnderAttack(null);
  combat.getKiller(true);
}
function inCombat(player) {
  return CombatFactory.inCombat(player) || player.getCombat().getHitQueue().hasPendingWork();
}
function resetState(player) {
  const state = player.getDueling();
  state.setState(DuelState.NONE);
  state.setInteract(null);
  state.getRules().fill(false);
  state.getButtonDelay().stop();
  requests.delete(player);
}
function end(session, loser) {
  if (sessions.get(session.players[0]) !== session) return;
  session.task?.stop();
  const fought = session.stage === "fight";
  // Remove both links before resetting players: death/close/disconnect may re-enter.
  for (const player of session.players) sessions.delete(player);
  for (const player of session.players) {
    if (fought && player.getHitpoints() <= 0) pendingSafeDeaths.add(player);
    resetState(player);
    if (fought) resetCombat(player);
    else player.getCombat().reset();
    player.getPacketSender().sendInterfaceRemoval();
    if (fought) {
      player.resetAttributes();
      player.moveTo(EXIT.clone());
    }
    player.setStatus(PlayerStatus.NONE);
    player.getPacketSender().sendEntityHintRemoval(true);
    player.getPacketSender().sendMessage(loser ? player === loser ? "You lost the duel!" : "You won the duel!" : "Duel declined.");
    updateMenu({ player });
  }
}
function snapshot(player) {
  return [player.getInventory(), player.getEquipment()].map(container =>
    container.getItems().map(item => `${item.getId()}:${item.getAmount()}`).join(",")).join(";");
}
function inventorySnapshot(container) {
  return { capacity: container.capacity(), slots: container.getItems().map((item, slot) =>
    ({ slot, itemId: item.getId(), quantity: item.getAmount() })) };
}
function showOptions(session, info = "") {
  session.stage = "options";
  setRules(session, session.mask, false);
  session.snapshots = session.players.map(snapshot);
  for (const player of session.players) {
    const other = session.players.find(p => p !== player);
    player.getPacketSender().sendConfiguredInterface("duel-offer");
    player.setStatus(PlayerStatus.DUELING);
    player.getPacketSender().sendString(other.getUsername(), uid(OPTIONS, 6))
      .sendString(`Combat level: ${other.getSkillManager().getCombatLevel()}`, uid(OPTIONS, 7))
      .sendString(info, uid(OPTIONS, OPTIONS_STATUS));
    for (const [i, skill] of [Skill.ATTACK, Skill.STRENGTH, Skill.DEFENCE, Skill.HITPOINTS, Skill.RANGED, Skill.PRAYER, Skill.MAGIC].entries()) {
      player.getPacketSender().sendString(String(other.getSkillManager().getMaxLevel(skill)), uid(OPTIONS, 10 + i * 3));
    }
    for (const child of [...RULE_BUTTONS.keys(), 86, 87, 89, 90, 92, 94, 96]) player.getPacketSender().sendInterfaceFlags(uid(OPTIONS, child), 2);
    updateMenu({ player });
  }
  acceptBots(session, "duelarena:accept");
}
function request({ player, target }) {
  // Revalidate both players after walking; zone edits and other requests can race the route.
  if (!target || player === target || !inZone(player) || !inZone(target) || !nearby(player, target) || player.getPrivateArea() != null) return;
  if (sessions.has(player) || sessions.has(target) || player.busy() || target.busy() || player.isTeleportingReturn() || target.isTeleportingReturn()
      || player.getHitpoints() <= 0 || target.getHitpoints() <= 0 || inCombat(player) || inCombat(target)) {
    player.getPacketSender().sendMessage("That player is currently busy.");
    return;
  }
  const reciprocal = requests.get(target) === player;
  if (!reciprocal && Date.now() < (requestDelay.get(player) ?? 0)) return;
  requestDelay.set(player, Date.now() + 2000);
  requests.set(player, target);
  player.getDueling().setState(DuelState.REQUESTED_DUEL);
  if (reciprocal) {
    const session = { players: [player, target], mask: 0, accepted: new Set(), stage: "options" };
    for (const p of session.players) {
      sessions.set(p, session);
      requests.delete(p);
      p.getMovementQueue().reset();
      resetCombat(p);
      p.getDueling().setInteract(p === player ? target : player);
    }
    showOptions(session);
  } else {
    player.getPacketSender().sendMessage(`You've sent a duel challenge to ${target.getUsername()}.`);
    target.getPacketSender().sendMessage(`${player.getUsername()} challenges you to a duel. Right-click them and choose Challenge to accept.`);
    if (!target.isPlayerBot()) return;
    const event = { player: target, challenger: player, accept: false };
    pluginApi.emitCustomEvent("duelarena:request", event);
    if (event.accept) request({ player: target, target: player });
  }
}
function equipmentToRemove(player) {
  const slots = new Set(EQUIPMENT_RULES.filter(rule => hasRule(player, rule)).map(rule => rule.getEquipmentSlot()));
  const weapon = player.getEquipment().getItems()[Equipment.WEAPON_SLOT];
  if (hasRule(player, DuelRule.NO_SHIELD) && weapon.isValid() && weapon.getDefinition().isDoubleHanded()) slots.add(Equipment.WEAPON_SLOT);
  return [...slots].filter(slot => player.getEquipment().getItems()[slot].isValid());
}
function isFunWeapon(item) {
  // https://oldschool.runescape.wiki/w/Duel_Arena#Combat: negative melee attack bonuses.
  const bonuses = item?.isValid() ? item.getDefinition().getBonuses() : null;
  return !!bonuses && bonuses.length >= 3 && bonuses.slice(0, 3).every(bonus => bonus < 0);
}
function reportBlockedAcceptance(player, message, botMessage) {
  if (!player.isPlayerBot()) {
    player.getPacketSender().sendMessage(message);
    return;
  }
  player.forceChat(botMessage);
  for (const opponent of sessions.get(player).players) {
    if (!opponent.isPlayerBot()) {
      opponent.getPacketSender().sendPublicChat(botMessage, player.getUsername(), player.getIndex());
    }
  }
}
function canStart(session) {
  for (const player of session.players) {
    const slots = equipmentToRemove(player);
    // ponytail: conservatively reserve one slot per item; simulate stacking if this becomes restrictive.
    if (player.getInventory().getFreeSlots() < slots.length) {
      reportBlockedAcceptance(player,
        `You need ${slots.length} free inventory slots for the disabled equipment.`,
        `I can't accept: I need ${slots.length} free inventory slot${slots.length === 1 ? "" : "s"} to remove my equipment.`);
      return false;
    }
    if (slots.some(slot => {
      const item = player.getEquipment().getItems()[slot];
      return item.getDefinition().isStackable() && player.getInventory().getAmount(item.getId()) + item.getAmount() > 2147483647;
    })) {
      reportBlockedAcceptance(player, "Your inventory cannot hold the removed equipment stack.",
        "I can't accept: my inventory can't hold the removed equipment stack.");
      return false;
    }
    if (hasRule(player, DuelRule.NO_MELEE) && hasRule(player, DuelRule.NO_RANGED) && hasRule(player, DuelRule.NO_MAGIC)) {
      reportBlockedAcceptance(player, "Enable at least one combat style.",
        "I can't accept: enable at least one combat style.");
      return false;
    }
    if (hasRule(player, DuelRule.FUN_WEAPONS) && (slots.includes(Equipment.WEAPON_SLOT)
        || !isFunWeapon(player.getEquipment().getItems()[Equipment.WEAPON_SLOT]))) {
      reportBlockedAcceptance(player, "Equip a fun weapon and allow the weapon slot, or disable Fun Weapons.",
        "I can't accept: I need a fun weapon and an allowed weapon slot, or disable Fun Weapons.");
      return false;
    }
  }
  return true;
}
function showConfirm(session) {
  session.stage = "confirm";
  session.accepted.clear();
  for (const player of session.players) {
    player.getDueling().setState(DuelState.CONFIRM_SCREEN);
    player.getPacketSender().sendConfig(3465, 0).sendConfiguredInterface("duel-confirm");
    player.setStatus(PlayerStatus.DUELING);
    for (const child of [50, 51]) player.getPacketSender().sendInterfaceFlags(uid(CONFIRM, child), 2);
    const other = session.players.find(p => p !== player);
    // The cache renders your worn items from inventory 94 and the opponent's via 6190.
    player.getPacketSender().sendInterfaceScript(6177,
      [uid(CONFIRM, 0), uid(CONFIRM, 11), uid(CONFIRM, 12), uid(CONFIRM, 13), uid(CONFIRM, 14), uid(CONFIRM, 31), uid(CONFIRM, 51), uid(CONFIRM, 50), uid(CONFIRM, 56)],
      { 286: session.mask }, undefined, { 94: inventorySnapshot(player.getEquipment()) });
    if (hasRule(player, DuelRule.SHOW_INVENTORIES)) {
      player.getPacketSender().sendClientScript(6190, ...other.getEquipment().getItems().map(item => item.getId()));
      player.getPacketSender().sendInterfaceScript(149,
        [uid(CONFIRM, 13), OPPONENT_INVENTORY, 4, 7, 0, -1, "", "", "", "", ""],
        undefined, undefined, { [OPPONENT_INVENTORY]: inventorySnapshot(other.getInventory()) });
    }
    confirmText(player, other);
  }
}
function confirmText(player, other, status = "") {
  // Cache script 6193 builds and sizes the scrollable summary in component 53.
  player.getPacketSender().sendInterfaceScript(6193, [
    sessions.get(player).mask, presets.get(player) ?? -1, lastRules.get(player) ?? -1,
    `${other.getUsername()}${status ? `<br>${status}` : ""}<br>Hitpoints and boosted stats will be restored.`,
  ]);
}
class DuelCountdown extends Task {
  constructor(session) { super(1, session); this.session = session; this.ticks = 0; }
  execute() {
    const session = this.session;
    if (sessions.get(session.players[0]) !== session) return this.stop();
    if (session.players.some(player => !ARENA.inside(player.getLocation()))) return end(session, session.players.find(player => !ARENA.inside(player.getLocation())));
    if (this.ticks % 2 === 0) {
      const left = 3 - this.ticks / 2;
      for (const player of session.players) {
        player.forceChat(left > 0 ? `${left}..` : "FIGHT!!");
        if (left === 0) player.getDueling().setState(DuelState.IN_DUEL);
      }
      if (left === 0) this.stop();
    }
    this.ticks++;
  }
}
function arenaSpawns() {
  // Java's unobstructed arena bounds, validated against this cache's collision map.
  const available = [];
  for (let x = 3335; x <= 3346; x++) for (let y = 3246; y <= 3252; y++) {
    if (RegionManager.canMove(x, y, x - 1, y, 0, 1, 1, null)
        && RegionManager.canMove(x - 1, y, x, y, 0, 1, 1, null)
        && !World.isPlayerOccupyingTile(new Location(x, y, 0), null, 1, null)
        && !World.isPlayerOccupyingTile(new Location(x - 1, y, 0), null, 1, null)) available.push(new Location(x, y, 0));
  }
  const first = available[Math.floor(Math.random() * available.length)];
  return first ? [first, first.clone().add(-1, 0)] : null;
}
function start(session) {
  const spawns = arenaSpawns();
  if (!spawns) return showOptions(session, "No space is currently available in the arena.");
  session.stage = "fight";
  for (const player of session.players) {
    lastRules.set(player, session.mask);
    player.getDueling().setState(DuelState.STARTING_DUEL);
    player.getPacketSender().sendInterfaceRemoval();
    for (const slot of equipmentToRemove(player)) {
      player.getEquipment().switchItems(player.getInventory(), player.getEquipment().getItems()[slot].clone(), false, false);
    }
    player.resetAttributes();
    player.moveTo(spawns[session.players.indexOf(player)]);
    player.setStatus(PlayerStatus.NONE);
    player.getPacketSender().sendEntityHint(player.getDueling().getInteract());
    updateMenu({ player });
  }
  session.task = new DuelCountdown(session);
  TaskManager.submit(session.task);
}
function accept(player, session, botEvent = "duelarena:accept") {
  if (!session.players.every(inZone) || !nearby(...session.players) || session.players.some(p => p.getHitpoints() <= 0 || inCombat(p))) return end(session);
  if (session.players.some((p, i) => snapshot(p) !== session.snapshots[i])) return showOptions(session, "Items changed. Please review the duel again.");
  if (!canStart(session)) return;
  if (session.accepted.has(player)) return acceptBots(session, botEvent);
  session.accepted.add(player);
  const confirm = session.stage === "confirm";
  player.getDueling().setState(confirm ? DuelState.ACCEPTED_CONFIRM_SCREEN : DuelState.ACCEPTED_DUEL_SCREEN);
  player.getPacketSender().sendVarbit(confirm ? 14030 : 14027, 1);
  const other = session.players.find(p => p !== player);
  if (confirm) confirmText(other, player, "Your opponent has accepted.");
  else other.getPacketSender().sendString(`${player.getUsername()} has accepted.`, uid(OPTIONS, OPTIONS_STATUS));
  if (session.accepted.size === 2) {
    if (confirm) start(session); else showConfirm(session);
  } else acceptBots(session, botEvent);
}
function handleInterface(event) {
  const { player, buttonId } = event;
  const group = buttonId >>> 16;
  const child = buttonId & 0xffff;
  if (group !== OPTIONS && group !== CONFIRM) return;
  event.handled = true;
  if (event.opId !== undefined && event.opId !== 1) return;
  const session = sessions.get(player);
  if (!session || session.stage === "fight" || player.getInterfaceId() !== group) return;
  if (group !== (session.stage === "options" ? OPTIONS : CONFIRM)) return;
  if (child === (group === OPTIONS ? 87 : 50) || child === 1) return end(session);
  if (child === (group === OPTIONS ? 86 : 51)) return accept(player, session, "duelarena:accept-clicked");
  if (group !== OPTIONS) return;
  const rule = RULE_BUTTONS.get(child);
  if (rule) {
    setRules(session, session.mask ^ rule.getConfigId());
  } else if (child === 89) {
    presets.set(player, session.mask);
  } else if (child === 90 || child === 92) {
    setRules(session, (child === 90 ? presets : lastRules).get(player) ?? 0);
  } else if (child === 94 || child === 96) {
    const rules = [DuelRule.NO_RANGED, DuelRule.NO_MAGIC, DuelRule.NO_SPECIAL_ATTACKS, DuelRule.NO_PRAYER, DuelRule.NO_POTIONS, DuelRule.NO_FOOD];
    rules.push(...EQUIPMENT_RULES.filter(rule => child === 96 || rule !== DuelRule.NO_WEAPON));
    if (child === 94) rules.push(DuelRule.LOCK_WEAPON);
    setRules(session, rules.reduce((mask, rule) => mask | rule.getConfigId(), 0));
  }
}
function handleOption(event) {
  if (event.option === DUEL_OPTION) {
    event.handled = true;
    if (inZone(event.player) && inZone(event.target) && nearby(event.player, event.target)) {
      request(event);
    }
  }
  if (event.option === FORFEIT_OPTION) {
    const session = sessions.get(event.player);
    if (session?.stage === "fight" && event.player.getDueling().getInteract() === event.target) {
      event.handled = true;
      if (!hasRule(event.player, DuelRule.NO_FORFEIT)) end(session, event.player);
    }
  }
}
function processPlayer({ player }) {
  const session = sessions.get(player);
  if (session) {
    const outside = session.players.find(p => session.stage === "fight" ? !ARENA.inside(p.getLocation()) : !inZone(p));
    if (outside) end(session, session.stage === "fight" ? outside : undefined);
    else if (session.stage !== "fight" && session.players.some(p => !p.isPlayerBot()
      && (p.getInterfaceId() !== (session.stage === "options" ? OPTIONS : CONFIRM) || p.getStatus() !== PlayerStatus.DUELING))) end(session);
  }
  if (!inZone(player) && !sessions.has(player)) resetState(player);
  updateMenu({ player });
}
function disconnect({ player }) {
  const session = sessions.get(player);
  if (session) end(session, session.stage === "fight" ? player : undefined);
  resetState(player);
  menuState.delete(player);
}
function handleDeath(event) {
  if (pendingSafeDeaths.has(event.player)) {
    pendingSafeDeaths.delete(event.player);
    event.handled = true;
    return;
  }
  const session = sessions.get(event.player);
  if (session?.stage !== "fight") return;
  event.handled = true;
  end(session, event.player);
  pendingSafeDeaths.delete(event.player);
}
function preventDuringDuel(event) {
  if (event.player.getDueling().inDuel()) event.allow = false;
}
function canEat(event) {
  if (event.player.getDueling().inDuel() && hasRule(event.player, DuelRule.NO_FOOD)) event.allow = false;
}
function canDrink(event) {
  if (event.player.getDueling().inDuel() && hasRule(event.player, DuelRule.NO_POTIONS)) event.allow = false;
}
function canEquip(event) {
  if (!event.player.getDueling().inDuel()) return;
  if (EQUIPMENT_RULES.some(rule => rule.getEquipmentSlot() === event.slot && hasRule(event.player, rule))
      || event.slot === Equipment.WEAPON_SLOT && (hasRule(event.player, DuelRule.LOCK_WEAPON)
        || hasRule(event.player, DuelRule.FUN_WEAPONS) && !isFunWeapon(event.item)
        || hasRule(event.player, DuelRule.NO_SHIELD) && event.item.getDefinition().isDoubleHanded())) event.allow = false;
}
function canUnequip(event) {
  if (event.player.getDueling().inDuel() && event.slot === Equipment.WEAPON_SLOT
      && (hasRule(event.player, DuelRule.LOCK_WEAPON) || hasRule(event.player, DuelRule.FUN_WEAPONS))) event.allow = false;
}
function shouldDrop(event) {
  if (event.player.getDueling().inDuel() || pendingSafeDeaths.has(event.player)) event.shouldDrop = false;
}
function canAttack(event) {
  const a = event.attacker.getAsPlayer?.();
  const b = event.target.getAsPlayer?.();
  if ((a && sessions.has(a)) || (b && sessions.has(b))) {
    event.allow = !!a && !!b && a.getDueling().getState() === DuelState.IN_DUEL
      && b.getDueling().getState() === DuelState.IN_DUEL
      && a.getDueling().getInteract() === b && b.getDueling().getInteract() === a;
  }
}
function shutdown() {
  for (const session of new Set(sessions.values())) end(session);
}
module.exports = {
  name: "DuelArena",
  register(api) {
    pluginApi = api;
    api.onPlayerLogin(processPlayer);
    api.onPlayerProcess(processPlayer);
    api.onPlayerOption(handleOption);
    api.onInterfaceActionClick(handleInterface);
    api.onButtonClick(handleInterface);
    api.onPlayerDisconnect(disconnect);
    api.onPlayerLogout(disconnect);
    api.onPlayerDeath(handleDeath);
    api.onShouldDropItemsOnDeath(shouldDrop);
    api.onCanAttack(canAttack);
    api.onCanTeleport(preventDuringDuel);
    api.onCanTrade(preventDuringDuel);
    api.onCanBank(preventDuringDuel);
    api.onCanShop(preventDuringDuel);
    api.onCanEat(canEat);
    api.onCanDrink(canDrink);
    api.onCanEquip(canEquip);
    api.onCanUnequip(canUnequip);
    api.onServerShutdown(shutdown);
  },
};
