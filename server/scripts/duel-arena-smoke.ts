import assert = require("node:assert/strict");
import { HitQueue } from "../src/main/typescript/elvarg/game/content/combat/hit/HitQueue";
import { Dueling, DuelState, DuelRule } from "../src/main/typescript/elvarg/game/content/Duelling";
import { Boundary } from "../src/main/typescript/elvarg/game/model/Boundary";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";
import { PlayerStatus } from "../src/main/typescript/elvarg/game/model/PlayerStatus";
import { RegionManager } from "../src/main/typescript/elvarg/game/collision/RegionManager";
import { TaskManager } from "../src/main/typescript/elvarg/game/task/TaskManager";
import { parseWorldZone, WORLD_ZONE_BOUNDARIES } from "../src/main/typescript/elvarg/game/definition/WorldDefinition";
import { encodePlayerOption } from "../src/main/typescript/elvarg/net/protocol/ClientProtocol";
import { decodeServerPacket } from "../../client/network/packet/ServerBinaryDecoder";
import { PacketSender } from "../src/main/typescript/elvarg/net/packet/PacketSender";
import { InterfaceLayoutRegistry } from "../src/main/typescript/elvarg/game/definition/InterfaceLayoutDefinition";

// Exercise the real configured-interface sender: a session-only "open" packet does not mount UI.
InterfaceLayoutRegistry.replace(Object.entries(require("../data/definitions/interface_layouts.json"))
  .map(([key, value]) => ({ key, ...(value as any) })));
const widgetPackets: any[] = [];
let openedInterface = -1;
const interfacePlayer = {
  setInterfaceId: (id: number) => { openedInterface = id; },
  isPlayerBot: () => false,
  getSession: () => ({ sendClientPacket: (packet: Buffer) => {
    widgetPackets.push(decodeServerPacket(packet));
    return true;
  } }),
};
const interfaceSender = new PacketSender(interfacePlayer);
for (const [key, groupId] of [["duel-offer", 755], ["duel-confirm", 756]] as const) {
  interfaceSender.sendConfiguredInterface(key);
  assert.equal(openedInterface, groupId);
  const packet = widgetPackets.pop();
  assert.equal(packet.type, "widget");
  assert.equal(packet.payload.action, "open_sub");
  assert.equal(packet.payload.targetUid, (161 << 16) | 16);
  assert.equal(packet.payload.groupId, groupId);
  assert.equal(packet.payload.type, 0);
  assert.equal(interfaceSender.hasInterruptibleInterface(), true);
}
interfacePlayer.isPlayerBot = () => true;
interfaceSender.sendConfiguredInterface("duel-offer");
assert.equal(openedInterface, 755, "bots retain the duel interface state without sending UI packets");
assert.equal(widgetPackets.length, 0);

// Isolate runtime boundaries from the user's editable world.json (including global duel zones).
WORLD_ZONE_BOUNDARIES.duel.splice(0, WORLD_ZONE_BOUNDARIES.duel.length, new Boundary(3326, 3383, 3197, 3295, 0));
const hooks: Record<string, Function> = {};
const customHooks = new Map<string, Function[]>();
const customEvents: string[] = [];
const api = new Proxy({}, {
  get: (_, name: string) => {
    if (name === "onCustomEvent") return (eventName: string, handler: Function) => {
      customHooks.set(eventName, [...(customHooks.get(eventName) ?? []), handler]);
    };
    if (name === "emitCustomEvent") return (eventName: string, event: any) => {
      customEvents.push(eventName);
      for (const handler of customHooks.get(eventName) ?? []) handler(event);
    };
    return (handler: Function) => { hooks[name] = handler; };
  },
});
require("../plugins/bots/PlayerBots.plugin").registerDuelBotAcceptance(api);
require("../plugins/minigames/DuelArena.plugin").register(api);
const tasks: any[] = [];
TaskManager.submit = task => { task.setRunning(true); tasks.push(task); };
RegionManager.canMove = () => true;
const item = (id = -1, amount = 0): any => ({
  getId: () => id, getAmount: () => amount, isValid: () => id >= 0 && amount > 0,
  clone: () => item(id, amount),
  getDefinition: () => ({ isStackable: () => false, isDoubleHanded: () => id === 2, getName: () => `Item ${id}`, getBonuses: () => id === 4 ? [-100, -100, -50] : [0, 0, 0] }),
});
function container(size: number): any {
  const items = Array.from({ length: size }, () => item());
  const self: any = {
    getItems: () => items, capacity: () => size,
    // Mirrors ItemContainer: clamp to what the slot holds, empty the slot when it runs out.
    deleteAtSlot(slot: number, amount = 1) {
      const held = items[slot];
      if (slot >= 0 && slot < size && held?.isValid()) {
        const left = held.getAmount() - Math.min(amount, held.getAmount());
        items[slot] = left > 0 ? item(held.getId(), left) : item();
      }
      return self;
    },
    refreshItems: () => self,
    getValidItems: () => items.filter(i => i.isValid()),
    getFreeSlots: () => items.filter(i => !i.isValid()).length,
    getAmount: (id: number) => items.filter(i => i.getId() === id).reduce((n, i) => n + i.getAmount(), 0),
    switchItems(to: any, value: any) {
      const from = items.findIndex(i => i.getId() === value.getId());
      const dest = to.getItems().findIndex((i: any) => !i.isValid());
      assert.ok(from >= 0 && dest >= 0);
      to.getItems()[dest] = items[from]; items[from] = item();
    },
  };
  return self;
}
function player(name: string, bot = false): any {
  let interfaceId = -1, status = PlayerStatus.NONE, hp = 99;
  let location = new Location(3366, 3266, 0);
  const packets: any[] = [];
  const inventory = container(28), equipment = container(14);
  let p: any;
  const sender = new Proxy<any>({}, { get: (_, method: string) => (...args: any[]) => {
    packets.push([method, ...args]);
    if (method === "sendConfiguredInterface") interfaceId = args[0] === "duel-offer" ? 755 : 756;
    if (method === "sendInterfaceRemoval") { interfaceId = -1; status = PlayerStatus.NONE; }
    return sender;
  } });
  p = {
    packets, getPacketSender: () => sender, getUsername: () => name, getIndex: () => 123,
    getInventory: () => inventory, getEquipment: () => equipment,
    getLocation: () => location, moveTo: (value: Location) => { location = value; },
    getPrivateArea: () => null, getInterfaceId: () => interfaceId,
    getStatus: () => status, setStatus: (value: PlayerStatus) => { status = value; },
    getHitpoints: () => hp, setHitpoints: (value: number) => { hp = value; },
    isPlayerBot: () => bot, isTeleportingReturn: () => false,
    busy: () => status !== PlayerStatus.NONE,
    getCombat: () => ({ reset() {}, getTarget: () => null, getAttacker: () => null,
      getHitQueue: () => queue, setUnderAttack() {}, getKiller() {}, getLastAttack: () => ({ elapsed: () => 100000 }) }),
    getMovementQueue: () => ({ reset() {}, walkToEntity(_target: any, cb: Function) { cb(); } }),
    getSkillManager: () => ({ getCombatLevel: () => 126, getMaxLevel: () => 99 }),
    resetAttributes() { hp = 99; }, forceChat: (text: string) => packets.push(["chat", text]),
  };
  const queue = new HitQueue(p);
  const state = new Dueling(p);
  p.getDueling = () => state;
  return p;
}
const click = (p: any, group: number, child: number) => hooks.onInterfaceActionClick({ player: p, buttonId: (group << 16) | child, opId: 1 });
const option = (p: any, target: any, option = 4) => hooks.onPlayerOption({ player: p, target, option });
const pair = () => { const a = player("Alice"), b = player("Bob"); option(a, b); option(b, a); return [a, b]; };
const agree = (a: any, b: any) => { click(a, 755, 86); click(b, 755, 86); click(a, 756, 51); click(b, 756, 51); };

assert.deepEqual(parseWorldZone({ tags: ["duel"] }), { tags: ["duel"] });
assert.deepEqual(parseWorldZone({ tags: ["custom:arena", "__proto__"] }), { tags: ["custom:arena", "__proto__"] });
assert.throws(() => parseWorldZone({ tags: [123] }));
assert.ok(WORLD_ZONE_BOUNDARIES.duel.some(b => b.inside(new Location(3366, 3266, 0))));
assert.deepEqual(decodeServerPacket(encodePlayerOption(4, "Challenge", false)), {
  type: "player_option", payload: { slot: 4, option: "Challenge", priority: false },
});
const outsider = player("Outside"), target = player("Target");
outsider.moveTo(new Location(3089, 3524, 0));
option(outsider, target);
assert.equal(target.getDueling().getState(), DuelState.NONE);
hooks.onPlayerProcess({ player: outsider });
assert.ok(outsider.packets.some((p: any[]) => p[0] === "sendPlayerOption" && p[1] === 4 && p[2] === ""));
hooks.onPlayerProcess({ player: target });
assert.ok(target.packets.some((p: any[]) => p[0] === "sendPlayerOption" && p[1] === 4 && p[2] === "Challenge"));
assert.ok(!target.packets.some((p: any[]) => p[0] === "sendPlayerOption" && p[1] === 5), "slot 5 remains available for Recruit");

const [a, b] = pair();
assert.equal(a.getInterfaceId(), 755);
assert.equal(b.getInterfaceId(), 755);
a.getEquipment().getItems()[0] = item(1, 1);
click(a, 755, 48); // Helmet disabled, shared cache bit 14.
click(a, 755, 38); // Food disabled.
click(a, 755, 39); // Movement disabled.
click(a, 755, 86); // Equipment changed: must re-open and re-review.
assert.equal(a.getDueling().getState(), DuelState.DUEL_SCREEN);
click(a, 755, 86);
assert.equal(a.getDueling().getState(), DuelState.ACCEPTED_DUEL_SCREEN);
click(b, 755, 37); // Drinks disabled: revokes Alice's acceptance.
assert.equal(a.getDueling().getState(), DuelState.DUEL_SCREEN);
assert.equal(b.getDueling().getRules()[DuelRule.NO_HELM.getButtonId()], true);
click(a, 756, 51); // Forged confirmation before the confirmation screen.
assert.equal(a.getDueling().inDuel(), false);
agree(a, b);
assert.equal(a.getDueling().getState(), DuelState.STARTING_DUEL);
assert.equal(a.getLocation().getDistance(b.getLocation()), 1);
assert.equal(a.getEquipment().getItems()[0].isValid(), false);
assert.equal(a.getInventory().getAmount(1), 1);
for (let i = 0; i < 7; i++) tasks[tasks.length - 1].execute();
assert.equal(a.getDueling().getState(), DuelState.IN_DUEL);
for (const hook of ["onCanEat", "onCanDrink", "onCanTeleport", "onCanTrade", "onCanBank"]) {
  const event = { player: a, allow: null }; hooks[hook](event); assert.equal(event.allow, false, hook);
}
const drop = { player: a, shouldDrop: null }; hooks.onShouldDropItemsOnDeath(drop); assert.equal(drop.shouldDrop, false);
b.getCombat().getHitQueue().addPendingDamage([{ getDamage: () => 20 }] as any);
const death = { player: a, handled: false }; hooks.onPlayerDeath(death); assert.equal(death.handled, true);
assert.equal(a.getDueling().getState(), DuelState.NONE);
assert.equal(b.getDueling().getState(), DuelState.NONE);
assert.equal(b.getCombat().getHitQueue().hasPendingWork(), false, "old impacts must not land after the duel ends");
assert.equal(a.getInventory().getAmount(1), 1);
assert.ok(b.packets.some((p: any[]) => p[1] === "You won the duel!"));

const duelist = player("Duelist"), duelBot = player("DuelBot", true);
option(duelist, duelBot);
// The staking interface took over the bottom widget, so duel status reaches the player as
// chat rather than as text written into the duel screen.
assert.ok(duelist.packets.some((p: any[]) => p[0] === "sendMessage"
  && p[1] === "DuelBot has accepted."), "the opponent's acceptance is reported to the player");
const beforeRuleChange = duelist.packets.length;
assert.equal(duelBot.getDueling().getState(), DuelState.ACCEPTED_DUEL_SCREEN);
click(duelist, 755, 30);
// Acceptance is varbits 14027 and 14030, both bits of varp 3465, so zeroing the varp clears
// it. With staking off the cache interface renders itself from that and the rule mask in
// varp 286; only the custom staking UI has its widgets written by hand.
assert.ok(duelist.packets.slice(beforeRuleChange).some((p: any[]) => p[0] === "sendConfig"
  && p[1] === 3465 && p[2] === 0), "rule changes clear the previous acceptance");
assert.equal(duelBot.getDueling().getState(), DuelState.ACCEPTED_DUEL_SCREEN, "bot must re-accept player rule changes");
click(duelist, 755, 86);
assert.equal(duelist.getInterfaceId(), 756);
const confirmationSummary = duelist.packets.filter((p: any[]) => p[0] === "sendInterfaceScript" && p[1] === 6193).pop();
assert.ok(confirmationSummary, "confirmation uses the native scrollable summary panel");
assert.equal(confirmationSummary[2][0], DuelRule.NO_RANGED.getConfigId());
assert.ok(confirmationSummary[2][3].includes("DuelBot"));
assert.ok(!duelist.packets.some((p: any[]) => p[0] === "sendString" && p[2] === ((756 << 16) | 49)),
  "the rule summary must not overwrite the text beneath the equipment");
click(duelist, 756, 51);
assert.equal(duelist.getDueling().getState(), DuelState.STARTING_DUEL);
assert.deepEqual(new Set(customEvents.filter((name) => name.startsWith("duelarena:"))), new Set([
  "duelarena:request", "duelarena:rules-changed", "duelarena:accept", "duelarena:accept-clicked",
]));

// Simulate a bot missing proactive acceptance; either Accept button must recover it.
const proactiveAccept = customHooks.get("duelarena:accept");
const ruleAccept = customHooks.get("duelarena:rules-changed");
customHooks.set("duelarena:accept", []);
customHooks.set("duelarena:rules-changed", []);
const whipPlayer = player("WhipPlayer"), whipBot = player("WhipBot", true);
option(whipPlayer, whipBot);
click(whipPlayer, 755, 94);
assert.equal(whipBot.getDueling().getState(), DuelState.DUEL_SCREEN);
click(whipPlayer, 755, 86);
assert.equal(whipPlayer.getInterfaceId(), 756, "Accept retries bot acceptance after Whip settings");
click(whipPlayer, 756, 51);
assert.equal(whipPlayer.getDueling().getState(), DuelState.STARTING_DUEL,
  "confirmation Accept also retries the bot");
customHooks.set("duelarena:accept", proactiveAccept!);
customHooks.set("duelarena:rules-changed", ruleAccept!);

const [c, d] = pair();
click(c, 755, 35); // No forfeit.
agree(c, d);
option(c, d, 6);
assert.equal(c.getDueling().inDuel(), true);
c.setHitpoints(0);
hooks.onPlayerDisconnect({ player: c });
const deferredDrop = { player: c, shouldDrop: null }; hooks.onShouldDropItemsOnDeath(deferredDrop);
assert.equal(deferredDrop.shouldDrop, false, "disconnect must not turn a queued safe death into item loss");
const deferredDeath = { player: c, handled: false }; hooks.onPlayerDeath(deferredDeath);
assert.equal(deferredDeath.handled, true);
assert.equal(d.getDueling().getState(), DuelState.NONE);

const [e, f] = pair();
click(e, 755, 86); click(f, 755, 86);
e.getInventory().getItems()[0] = item(3, 1);
click(e, 756, 51);
assert.equal(e.getInterfaceId(), 755, "changed inventory must invalidate confirmation");
e.getPacketSender().sendInterfaceRemoval(); hooks.onPlayerProcess({ player: e });
assert.equal(f.getInterfaceId(), -1, "closing either screen must release both players");
const [g, h] = pair();
g.getEquipment().getItems()[3] = item(4, 1);
h.getEquipment().getItems()[3] = item(4, 1);
click(g, 755, 34); // Fun weapons: require cache-derived negative attack bonuses.
click(g, 755, 86); // Re-review changed equipment.
agree(g, h);
assert.equal(g.getDueling().inDuel(), true);
const equip = { player: g, slot: 3, item: item(2, 1), allow: null };
hooks.onCanEquip(equip); assert.equal(equip.allow, false);
option(g, h, 6);
assert.equal(g.getDueling().inDuel(), false, "forfeit is available when its rule allows it");

const [full, other] = pair();
full.getInventory().getItems().fill(item(1, 1));
full.getEquipment().getItems()[0] = item(3, 1);
click(full, 755, 48); click(full, 755, 86); agree(full, other);
assert.equal(full.getDueling().inDuel(), false);
assert.equal(full.getEquipment().getItems()[0].getId(), 3, "failed capacity validation must leave equipment intact");
const blockedPlayer = player("BlockedOwner"), blockedBot = player("BlockedBot", true);
blockedBot.getInventory().getItems().fill(item(1, 1));
blockedBot.getEquipment().getItems()[0] = item(3, 1);
option(blockedPlayer, blockedBot);
click(blockedPlayer, 755, 94);
assert.ok(blockedBot.packets.some((p: any[]) => p[0] === "chat"
  && p[1] === "I can't accept: I need 1 free inventory slot to remove my equipment."),
  "bots announce the inventory blocker publicly");
assert.equal(blockedBot.getDueling().getState(), DuelState.DUEL_SCREEN);
assert.ok(blockedPlayer.packets.some((p: any[]) => p[0] === "sendPublicChat"
  && p[1] === "I can't accept: I need 1 free inventory slot to remove my equipment."
  && p[2] === "BlockedBot" && p[3] === blockedBot.getIndex()),
  "the human opponent receives the bot explanation in their chatbox as public chat");
assert.equal(blockedBot.getEquipment().getItems()[0].getId(), 3);
hooks.onServerShutdown({});
console.log("duel arena smoke: passed");
