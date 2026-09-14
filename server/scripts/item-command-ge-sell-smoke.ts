import assert = require("node:assert/strict");
const admin = require("../plugins/commands/AdminCommands.plugin.js");
import { PluginManager } from "../src/main/typescript/elvarg/plugins/PluginManager";
import { CommandPacketListener } from "../src/main/typescript/elvarg/net/packet/impl/CommandPacketListener";
import { InterfaceActionClickOpcode } from "../src/main/typescript/elvarg/net/packet/impl/InterfaceActionClickOpcode";
import { PlayerRights } from "../src/main/typescript/elvarg/game/model/rights/PlayerRights";
import { CacheDefinitions } from "../src/main/typescript/elvarg/game/cache/CacheDefinitions";
import { ItemDefinition } from "../src/main/typescript/elvarg/game/definition/ItemDefinition";

admin.register((PluginManager as any).createApi(admin.name));
const ge = require("../plugins/interface/GrandExchange.plugin.js");
ge.register((PluginManager as any).createApi(ge.name));

const spawned: number[][] = [];
const messages: string[] = [];
const configs = new Map<number, number>();
const varbits = new Map<number, number>();
const attributes = new Map<string, unknown>();
let rights = PlayerRights.DEVELOPER;
let interfaceId = 465;
const sender = {
    sendMessage(message: string) { messages.push(message); return this; },
    sendConfig(id: number, value: number) { configs.set(id, value); return this; },
    sendVarbit(id: number, value: number) { varbits.set(id, value); return this; },
};
const player = {
    getHitpoints: () => 99,
    isTeleportingReturn: () => false,
    getRights: () => rights,
    getPacketSender: () => sender,
    getInventory: () => ({ adds: (...args: number[]) => spawned.push(args), getItems: () => [{ getId: () => 1351 }] }),
    getInterfaceId: () => interfaceId,
    getAttribute: (key: string) => attributes.get(key),
    setAttribute: (key: string, value: unknown) => attributes.set(key, value),
    setEnteredAmountAction() {},
    setEnteredSyntaxAction() {},
};
CommandPacketListener.execute(player, "item 995 204049");
assert.deepEqual(spawned, [[995, 204049]], "The real command dispatcher must find ::item");
rights = PlayerRights.NONE;
CommandPacketListener.execute(player, "item 995 100000");
assert.equal(spawned.length, 1, "Item spawning must remain restricted");
assert.ok(!messages.some(message => message.includes("does not exist")));

const originalCounts = CacheDefinitions.getCounts;
const originalItem = CacheDefinitions.getItem;
const originalDefinition = ItemDefinition.forId;
try {
    CacheDefinitions.getCounts = () => ({ items: 2000 } as any);
    CacheDefinitions.getItem = () => ({ name: "Bronze axe" } as any);
    ItemDefinition.forId = () => ({ unNote: () => 1351, getValue: () => 16 } as any);
    const click = (itemId: number, slot = 0, action = 1) => InterfaceActionClickOpcode.handle(
        player, 467 << 16, action, { groupId: 467, childId: 0, itemId, slot },
    );
    assert.equal(click(1351), true, "GE side-panel clicks must reach the sell handler");
    assert.equal(configs.get(1151), 1351, "Select the clicked inventory item");
    assert.equal(varbits.get(4397), 1, "Switch to a sell offer");
    configs.clear();
    assert.equal(click(995), false, "Reject an item that does not match the slot");
    assert.equal(click(1351, 28), false, "Reject a nonexistent inventory slot");
    assert.equal(click(1351, 0, 10), false, "Examine must not create an offer");
    interfaceId = -1;
    assert.equal(click(1351), false, "Reject side-panel clicks after GE closes");
    assert.equal(configs.size, 0);
} finally {
    CacheDefinitions.getCounts = originalCounts;
    CacheDefinitions.getItem = originalItem;
    ItemDefinition.forId = originalDefinition;
}
console.log("Item command registration and GE sell routing passed");
